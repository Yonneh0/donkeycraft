// Donkeycraft — Wireframe Renderer
// Debug wireframe drawing for solid blocks, bedrock, and clouds.
// Draws colored line outlines around visible block faces for debugging.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    /**
     * WireframeRenderer — Draws wireframe outlines around solid blocks for debugging.
     * Supports per-block-type coloring (bedrock=red, clouds=white, etc.).
     * @param {WebGLRenderingContext} gl - WebGL context.
     * @param {ShaderManager} shaderManager - Shader manager instance.
     */
    Donkeycraft.WireframeRenderer = function (gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;

        // Wireframe buffers (reusable — rebuilt each frame)
        this._vertexBuffer = null;
        this._indexBuffer = null;
        this._vertexCount = 0;
        this._indexCount = 0;

        // Render state — enabled by default for debugging
        this._enabled = true;
        this._showBedrock = true;
        this._showClouds = true;
        this._showSolidBlocks = true;

        // Color palette for different block types
        this._colors = {
            bedrock: [1.0, 0.2, 0.2, 1.0],   // Red
            clouds: [1.0, 1.0, 1.0, 0.8],   // White (semi-transparent)
            solid: [1.0, 0.0, 1.0, 1.0],   // Bright magenta (highly visible)
            water: [0.2, 0.4, 1.0, 0.6],   // Blue (water)
            lava: [1.0, 0.5, 0.0, 0.8],   // Orange (lava)
            transparent: [0.5, 0.5, 0.5, 0.5]    // Gray (transparent blocks)
        };
    };

    /**
     * Set wireframe render mode flags.
     * @param {boolean} enabled - Whether wireframes are enabled.
     * @param {boolean} [showBedrock=true] - Show bedrock outlines.
     * @param {boolean} [showClouds=false] - Show cloud outlines.
     * @param {boolean} [showSolidBlocks=true] - Show solid block outlines.
     */
    Donkeycraft.WireframeRenderer.prototype.setEnabled = function (enabled, showBedrock, showClouds, showSolidBlocks) {
        this._enabled = !!enabled;
        if (showBedrock !== undefined) this._showBedrock = !!showBedrock;
        if (showClouds !== undefined) this._showClouds = !!showClouds;
        if (showSolidBlocks !== undefined) this._showSolidBlocks = !!showSolidBlocks;
    };

    /**
     * toggle — enable or disable wireframe rendering.
     * @returns {boolean} True if wireframes are now enabled.
     */
    Donkeycraft.WireframeRenderer.prototype.toggle = function () {
        this._enabled = !this._enabled;
        return this._enabled;
    };

    /**
     * Build wireframe geometry for a single axis-aligned box.
     * Returns 12 line segments (24 vertices in position+color interleaved format).
     * @private
     * @param {number} minX - Minimum X.
     * @param {number} minY - Minimum Y.
     * @param {number} minZ - Minimum Z.
     * @param {number} maxX - Maximum X.
     * @param {number} maxY - Maximum Y.
     * @param {number} maxZ - Maximum Z.
     * @param {number[]} color - RGBA color array.
     * @returns {{vertices: number[], indices: number}} Vertices and index count.
     */
    function _buildBoxWireframe(minX, minY, minZ, maxX, maxY, maxZ, color) {
        // 8 corners of the box
        var cx = [minX, minX, minX, minX, maxX, maxX, maxX, maxX];
        var cy = [minY, minY, maxY, maxY, minY, minY, maxY, maxY];
        var cz = [minZ, maxZ, minZ, maxZ, minZ, maxZ, minZ, maxZ];

        // 12 edges (pairs of corner indices)
        var edges = [
            [0, 1], [1, 5], [5, 4], [4, 0],   // Bottom square
            [2, 3], [3, 7], [7, 6], [6, 2],   // Top square
            [0, 2], [1, 3], [4, 6], [5, 7]    // Vertical edges
        ];

        var vertices = [];
        for (var e = 0; e < edges.length; e++) {
            var edge = edges[e];
            for (var v = 0; v < 2; v++) {
                var idx = edge[v];
                vertices.push(cx[idx], cy[idx], cz[idx]);
                vertices.push(color[0], color[1], color[2], color[3]);
            }
        }

        return {
            vertices: vertices,
            indexCount: edges.length * 2
        };
    }

    /**
     * Build wireframe geometry for all solid blocks in the given chunks.
     * Draws wireframes around all non-air blocks within render distance.
     * Uses a small epsilon offset to avoid depth fighting with terrain faces.
     * @private
     * @param {Object[]} chunks - Array of chunk objects with getBlock method.
     * @param {number} chunkX - Chunk X coordinate (unused, kept for API compat).
     * @param {number} chunkZ - Chunk Z coordinate (unused, kept for API compat).
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.WireframeRenderer.prototype._buildWireframeGeometry = function (chunks, chunkX, chunkZ, getBlockFunc) {
        var allVertices = [];

        // Block ID classifications
        var bedrockId = 1000;   // bedrock (ID 1000 in block.js)
        var cloudIds = {};
        cloudIds[286] = true;   // cloud (block ID 286 in block.js)

        // Hard limits — each wireframe block adds exactly 84 floats (12 edges * 2 verts * 7 floats)
        var MAX_BLOCKS = 16384; // ~1.4MB float data, reasonable for modern GPUs
        var _blockCount = 0;

        // Player position for culling (use origin as fallback)
        var px = 0, py = 64, pz = 0;
        try {
            if (chunks && chunks.length > 0) {
                var refChunk = chunks[0];
                px = refChunk.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
                pz = refChunk.chunkZ * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
            }
        } catch (e) { }

        // Max render radius in world coords — 64 blocks for better visibility
        var MAX_RADIUS = 64;
        var MAX_RADIUS_SQ = MAX_RADIUS * MAX_RADIUS;
        // Y-range: full world height but clamped reasonably
        var MIN_Y = Math.max(0, py - 48);
        var MAX_Y = Math.min(WORLD_HEIGHT - 1, py + 48);

        // Small epsilon offset to avoid depth fighting with terrain faces
        var EPS = 0.002;

        // Iterate over all loaded chunks
        for (var c = 0; c < chunks.length; c++) {
            var chunk = chunks[c];
            if (!chunk) continue;

            // Skip chunks too far from player (4x radius squared = ~128 block chunk culling)
            var chunkCX = chunk.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
            var chunkCZ = chunk.chunkZ * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
            var dxChunk = chunkCX - px;
            var dzChunk = chunkCZ - pz;
            if (dxChunk * dxChunk + dzChunk * dzChunk > MAX_RADIUS_SQ * 4) {
                continue;
            }

            // Determine block range to iterate
            var minX = Math.max(chunk.chunkX * CHUNK_SIZE, px - MAX_RADIUS);
            var maxX = Math.min(chunk.chunkX * CHUNK_SIZE + CHUNK_SIZE - 1, px + MAX_RADIUS);
            var minZ = Math.max(chunk.chunkZ * CHUNK_SIZE, pz - MAX_RADIUS);
            var maxZ = Math.min(chunk.chunkZ * CHUNK_SIZE + CHUNK_SIZE - 1, pz + MAX_RADIUS);

            for (var x = minX; x <= maxX; x++) {
                for (var y = MIN_Y; y <= MAX_Y; y++) {
                    for (var z = minZ; z <= maxZ; z++) {
                        // Distance culling from player in XZ plane
                        var dx2 = x - px;
                        var dz2 = z - pz;
                        if (dx2 * dx2 + dz2 * dz2 > MAX_RADIUS_SQ) continue;

                        var blockId = getBlockFunc(x, y, z);
                        if (blockId === 0) continue; // Skip air

                        // Determine block type and color
                        var color = null;
                        var shouldDraw = false;

                        if (blockId === bedrockId && this._showBedrock) {
                            color = this._colors.bedrock;
                            shouldDraw = true;
                        } else if (cloudIds[blockId] && this._showClouds) {
                            color = this._colors.clouds;
                            shouldDraw = true;
                        } else if (this._showSolidBlocks) {
                            // Draw all non-air, non-transparent blocks (no exposed face check needed)
                            var isTransparent = Donkeycraft.BlockTypes && Donkeycraft.BlockTypes.isTransparent(blockId);
                            if (!isTransparent) {
                                color = this._colors.solid;
                                shouldDraw = true;
                            }
                        }

                        if (!shouldDraw || !color) continue;

                        // Build wireframe for this block with small epsilon offset to avoid depth fighting
                        var ex = x + 1, ey = y + 1, ez = z + 1;
                        var cr = color[0], cg = color[1], cb = color[2], ca = color[3];

                        // 8 corners with epsilon offset so wireframes render slightly above terrain
                        var c0 = [x + EPS, y + EPS, z + EPS], c1 = [ex - EPS, y + EPS, z + EPS];
                        var c2 = [x + EPS, ey - EPS, z + EPS], c3 = [ex - EPS, ey - EPS, z + EPS];
                        var c4 = [x + EPS, y + EPS, ez - EPS], c5 = [ex - EPS, y + EPS, ez - EPS];
                        var c6 = [x + EPS, ey - EPS, ez - EPS], c7 = [ex - EPS, ey - EPS, ez - EPS];

                        // 12 edges as corner pairs forming box outline
                        var edges = [
                            [c0, c1], [c1, c5], [c5, c4], [c4, c0],   // bottom (Y=min)
                            [c2, c3], [c3, c7], [c7, c6], [c6, c2],   // top (Y=max)
                            [c0, c2], [c1, c3], [c4, c6], [c5, c7]    // verticals (Z direction)
                        ];

                        for (var e = 0; e < edges.length; e++) {
                            var edge = edges[e];
                            for (var v = 0; v < 2; v++) {
                                var corner = edge[v];
                                allVertices.push(corner[0], corner[1], corner[2], cr, cg, cb, ca);
                            }
                        }

                        _blockCount++;
                        if (_blockCount >= MAX_BLOCKS) {
                            // Reached max block limit — stop immediately
                            c = chunks.length; // Break outer loop too
                            break;
                        }
                    }
                }
            }
        }

        var vertexCount = allVertices.length / 7;

        return {
            vertices: new Float32Array(allVertices),
            indices: null,
            vertexCount: vertexCount,
            indexCount: 0,
            useIndices: false
        };
    };

    /**
     * Render wireframes for visible chunks.
     * Uses polygon offset to push wireframes slightly forward of terrain faces,
     * avoiding depth fighting. Disables depth write so wireframes overlay without
     * modifying the depth buffer.
     * @param {Camera} camera - The camera instance.
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     * @param {Object[]} activeChunks - Array of currently loaded chunk objects.
     */
    Donkeycraft.WireframeRenderer.prototype.render = function (camera, getBlockFunc, activeChunks) {
        var gl = this._gl;
        if (!gl) {
            Donkeycraft.Logger.warn('WireframeRenderer', 'render skipped: no WebGL context');
            return;
        }
        if (!this._shaderManager) {
            Donkeycraft.Logger.warn('WireframeRenderer', 'render skipped: no shader manager');
            return;
        }
        if (!this._enabled) {
            return; // Silently skip — user disabled wireframes
        }

        // Build wireframe geometry
        var geometry = this._buildWireframeGeometry(activeChunks, 0, 0, getBlockFunc);
        // Donkeycraft.Logger.info('WireframeRenderer', 'Built geometry: ' + geometry.vertexCount + ' vertices');
        if (geometry.vertexCount === 0) {
            Donkeycraft.Logger.warn('WireframeRenderer', 'No geometry to render (0 vertices)');
            return;
        }

        // Upload vertex buffer
        if (!this._vertexBuffer) {
            this._vertexBuffer = gl.createBuffer();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.DYNAMIC_DRAW);

        // Use wireframe shader program
        var shaderUsed = this._shaderManager.use('wireframe');
        // Donkeycraft.Logger.info('WireframeRenderer', 'Shader "wireframe" used: ' + shaderUsed);
        if (!shaderUsed) {
            Donkeycraft.Logger.error('WireframeRenderer', 'Wireframe shader program not found — check that it was compiled in game.js');
            return;
        }

        // Get active program for direct uniform/attribute access
        var activeProg = this._shaderManager._getActiveProgram();
        // Donkeycraft.Logger.info('WireframeRenderer', 'Active program: ' + (activeProg ? '0x' + activeProg.toString(16) : 'null'));
        if (!activeProg) {
            Donkeycraft.Logger.error('WireframeRenderer', 'No active program after use()');
            return;
        }

        // Set camera matrices — matrices may be Matrix4 instances (with getData()) or Float32Array
        var matrices = camera.getMatrices();
        var projData = matrices.projection && matrices.projection.getData ? matrices.projection.getData() : matrices.projection;
        var projLoc = gl.getUniformLocation(activeProg, 'uProjection');
        // Donkeycraft.Logger.info('WireframeRenderer', 'uProjection loc: ' + (projLoc !== null ? 'valid' : 'NULL'));
        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projData);

        var viewData = matrices.view && matrices.view.getData ? matrices.view.getData() : matrices.view;
        var viewLoc = gl.getUniformLocation(activeProg, 'uView');
        // Donkeycraft.Logger.info('WireframeRenderer', 'uView loc: ' + (viewLoc !== null ? 'valid' : 'NULL'));
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewData);

        // Identity model matrix (required by shader uniform)
        var identityMatrix = Donkeycraft.Matrix4.createIdentity();
        this._shaderManager.setMat4('uModel', identityMatrix);
        // Donkeycraft.Logger.info('WireframeRenderer', 'uModel set via setMat4');

        // Set line width for visibility (may not work on all platforms)
        try { gl.lineWidth(1.5); } catch (e) { }

        // Enable polygon offset to push wireframes slightly forward of terrain faces.
        // This prevents depth fighting where wireframes would be hidden behind terrain.
        if (gl.polygonOffset) {
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(2.0, 4.0); // slope and constant factor
            // Donkeycraft.Logger.info('WireframeRenderer', 'POLYGON_OFFSET_FILL enabled');
        }

        // Get attribute locations directly from the active program
        var posLoc = gl.getAttribLocation(activeProg, 'aPosition');
        var colorLoc = gl.getAttribLocation(activeProg, 'aColor');
        // Donkeycraft.Logger.info('WireframeRenderer', 'aPosition loc: ' + posLoc + ', aColor loc: ' + colorLoc);

        // Enable attribute arrays and set pointers (interleaved: 3 pos + 4 color = 7 floats)
        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 28, 0); // 7*4=28 bytes per vertex
            // Donkeycraft.Logger.info('WireframeRenderer', 'Enabled attribute aPosition at loc ' + posLoc);
        } else {
            Donkeycraft.Logger.error('WireframeRenderer', 'aPosition attribute not found in shader');
        }
        if (colorLoc >= 0) {
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 28, 12); // offset 3*4=12 bytes
            // Donkeycraft.Logger.info('WireframeRenderer', 'Enabled attribute aColor at loc ' + colorLoc);
        } else {
            Donkeycraft.Logger.error('WireframeRenderer', 'aColor attribute not found in shader');
        }

        // Render wireframes ON TOP of terrain:
        // - Disable depth write so wireframes don't modify the depth buffer
        // - Keep depth test enabled — polygon offset pushes wireframes slightly forward
        //   of terrain faces, so they pass the depth test at block boundaries.
        gl.depthMask(false);

        // Draw all line segments
        gl.drawArrays(gl.LINES, 0, geometry.vertexCount);

        // Check for WebGL errors after draw
        var err = gl.getError();
        // Donkeycraft.Logger.info('WireframeRenderer', 'drawArrays result: WebGL error code = 0x' + (err || 0).toString(16));
        if (err !== gl.NO_ERROR) {
            Donkeycraft.Logger.error('WireframeRenderer', 'WebGL error after drawArrays: 0x' + err.toString(16));
        }

        // Restore WebGL state
        gl.depthMask(true);
        if (gl.polygonOffset) {
            gl.disable(gl.POLYGON_OFFSET_FILL);
        }

        // Disable attribute arrays
        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Destroy buffers and free GPU resources.
     */
    Donkeycraft.WireframeRenderer.prototype.destroy = function () {
        var gl = this._gl;
        if (!gl) return;

        if (this._vertexBuffer) { gl.deleteBuffer(this._vertexBuffer); this._vertexBuffer = null; }
        if (this._indexBuffer) { gl.deleteBuffer(this._indexBuffer); this._indexBuffer = null; }

        this._vertexBuffer = null;
        this._indexBuffer = null;
    };

})();