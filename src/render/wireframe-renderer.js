// Donkeycraft — Wireframe Renderer
// Debug wireframe drawing for solid blocks, bedrock, and clouds.
// Draws colored line outlines around visible block faces for debugging.
(function() {
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
    Donkeycraft.WireframeRenderer = function(gl, shaderManager) {
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
            bedrock:    [1.0, 0.2, 0.2, 1.0],   // Red
            clouds:     [1.0, 1.0, 1.0, 0.8],   // White (semi-transparent)
            solid:      [0.0, 0.0, 0.0, 1.0],   // Black
            water:      [0.2, 0.4, 1.0, 0.6],   // Blue (water)
            lava:       [1.0, 0.5, 0.0, 0.8],   // Orange (lava)
            transparent:[0.5, 0.5, 0.5, 0.5]    // Gray (transparent blocks)
        };
    };

    /**
     * Set wireframe render mode flags.
     * @param {boolean} enabled - Whether wireframes are enabled.
     * @param {boolean} [showBedrock=true] - Show bedrock outlines.
     * @param {boolean} [showClouds=false] - Show cloud outlines.
     * @param {boolean} [showSolidBlocks=true] - Show solid block outlines.
     */
    Donkeycraft.WireframeRenderer.prototype.setEnabled = function(enabled, showBedrock, showClouds, showSolidBlocks) {
        this._enabled = !!enabled;
        if (showBedrock !== undefined) this._showBedrock = !!showBedrock;
        if (showClouds !== undefined) this._showClouds = !!showClouds;
        if (showSolidBlocks !== undefined) this._showSolidBlocks = !!showSolidBlocks;
    };

    /**
     * toggle — enable or disable wireframe rendering.
     * @returns {boolean} True if wireframes are now enabled.
     */
    Donkeycraft.WireframeRenderer.prototype.toggle = function() {
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
            [0,1], [1,5], [5,4], [4,0],   // Bottom square
            [2,3], [3,7], [7,6], [6,2],   // Top square
            [0,2], [1,3], [4,6], [5,7]    // Vertical edges
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
     * Build wireframe geometry for all visible solid blocks in the given chunks.
     * Strictly limits rendering to a small area around player to avoid OOM.
     * @private
     * @param {Object[]} chunks - Array of chunk objects with getBlock method.
     * @param {number} chunkX - Chunk X coordinate (unused, kept for API compat).
     * @param {number} chunkZ - Chunk Z coordinate (unused, kept for API compat).
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.WireframeRenderer.prototype._buildWireframeGeometry = function(chunks, chunkX, chunkZ, getBlockFunc) {
        var allVertices = [];

        // Block ID classifications
        var bedrockId = 7;   // bedrock (ID 7 in block.js)
        var cloudIds = {};
        cloudIds[17] = true; // cloud (block ID 17)

        // Hard limits — each wireframe block adds exactly 84 floats (12 edges * 2 verts * 7 floats)
        var MAX_BLOCKS = 5000; // ~420KB float data, safe for all systems
        var _blockCount = 0;

        // Player position for culling (use origin as fallback)
        var px = 0, py = 64, pz = 0;
        try {
            if (chunks && chunks.length > 0) {
                var refChunk = chunks[0];
                px = refChunk.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
                pz = refChunk.chunkZ * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
            }
        } catch (e) {}

        // Max render radius in world coords — 48 blocks
        var MAX_RADIUS = 48;
        var MAX_RADIUS_SQ = MAX_RADIUS * MAX_RADIUS;
        // Y-range: ±32 from player Y
        var MIN_Y = Math.max(0, py - 32);
        var MAX_Y = Math.min(WORLD_HEIGHT - 1, py + 32);

        // Iterate over all loaded chunks
        for (var c = 0; c < chunks.length; c++) {
            var chunk = chunks[c];
            if (!chunk) continue;

            // Skip chunks too far from player
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
                            // Check if block is solid using BlockTypes
                            var isSolid = Donkeycraft.BlockTypes && Donkeycraft.BlockTypes.isSolid(blockId);
                            var isOpaque = Donkeycraft.BlockTypes && Donkeycraft.BlockTypes.isOpaque(blockId);

                            if (isSolid && isOpaque) {
                                // Check if at least one face is exposed (adjacent to transparent block or air)
                                var exposed = false;
                                var neighbors = [
                                    [x+1, y, z], [x-1, y, z],
                                    [x, y+1, z], [x, y-1, z],
                                    [x, y, z+1], [x, y, z-1]
                                ];
                                for (var n = 0; n < neighbors.length; n++) {
                                    var nb = getBlockFunc(neighbors[n][0], neighbors[n][1], neighbors[n][2]);
                                    if (nb === 0 || (Donkeycraft.BlockTypes && Donkeycraft.BlockTypes.isTransparent(nb))) {
                                        exposed = true;
                                        break;
                                    }
                                }
                                if (exposed) {
                                    color = this._colors.solid;
                                    shouldDraw = true;
                                }
                            }
                        }

                        if (!shouldDraw || !color) continue;

                        // Build wireframe for this block — inline 84 floats
                        var ex = x + 1, ey = y + 1, ez = z + 1;
                        var cr = color[0], cg = color[1], cb = color[2], ca = color[3];

                        // 12 edges: each edge has 2 vertices, each vertex is (px,py,pz, r,g,b,a) = 7 floats
                        // Edge 0-1: (minX,minY,minZ) to (minX,maxY,minZ) — wait, let me use the correct corners
                        // Corner indices from _buildBoxWireframe:
                        // 0:(minX,minY,minZ), 1:(minX,maxY,minZ), 2:(minX,minY,maxZ), 3:(minX,maxY,maxZ)
                        // 4:(maxX,minY,minZ), 5:(maxX,maxY,minZ), 6:(maxX,minY,maxZ), 7:(maxX,maxY,maxZ)

                        // Bottom square: [0,1] is wrong — let me use proper box edges
                        // Actually the original _buildBoxWireframe uses corners differently. Let me just inline the 12 edges properly:
                        // Bottom: (minX,minY,minZ)->(maxX,minY,minZ), (maxX,minY,minZ)->(maxX,minY,maxZ), etc.
                        // Using proper axis-aligned box corners:
                        var c0=[x,y,z],     c1=[ex,y,z],   // X edges at minY,minZ and minY,maxZ
                            c2=[x,ey,z],    c3=[ex,ey,z];  // X edges at maxY,minZ and maxY,maxZ
                        var c4=[x,y,ez],    c5=[ex,y,ez];
                        var c6=[x,ey,ez],   c7=[ex,ey,ez];

                        // 12 edges as corner pairs
                        var edges = [
                            [c0,c1],[c1,c5],[c5,c4],[c4,c0],   // bottom (Y=min)
                            [c2,c3],[c3,c7],[c7,c6],[c6,c2],   // top (Y=max)
                            [c0,c2],[c1,c3],[c4,c6],[c5,c7]    // verticals (Z direction)
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
     * @param {Camera} camera - The camera instance.
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     * @param {Object[]} activeChunks - Array of currently loaded chunk objects.
     */
    Donkeycraft.WireframeRenderer.prototype.render = function(camera, getBlockFunc, activeChunks) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !this._enabled) return;

        // Build wireframe geometry
        var geometry = this._buildWireframeGeometry(activeChunks, 0, 0, getBlockFunc);
        if (geometry.vertexCount === 0) return;

        // Upload buffers
        if (!this._vertexBuffer) {
            this._vertexBuffer = gl.createBuffer();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.DYNAMIC_DRAW);

        // Use wireframe shader
        if (!this._shaderManager.use('wireframe')) return;

        // Set camera matrices using raw WebGL calls
        var matrices = camera.getMatrices();
        var activeProg = this._shaderManager._getActiveProgram ? this._shaderManager._getActiveProgram() : null;

        // Set uProjection — matrices may be Matrix4 instances or Float32Array
        var projData = matrices.projection && matrices.projection.getData ? matrices.projection.getData() : matrices.projection;
        var projLoc = activeProg ? gl.getUniformLocation(activeProg, 'uProjection') : null;
        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projData);

        // Set uView — same handling
        var viewData = matrices.view && matrices.view.getData ? matrices.view.getData() : matrices.view;
        var viewLoc = activeProg ? gl.getUniformLocation(activeProg, 'uView') : null;
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewData);

        // Identity model matrix using Matrix4 class (required by setMat4)
        var identityMatrix = Donkeycraft.Matrix4.createIdentity();
        this._shaderManager.setMat4('uModel', identityMatrix);

        // Set line width (if supported)
        try { gl.lineWidth(2.0); } catch (e) {}

        // Bind vertex buffer and set up attribute pointers
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);

        var posLoc = this._shaderManager.getAttribute('aPosition');
        var colorLoc = this._shaderManager.getAttribute('aColor');

        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 7 * 4, 0);
        }
        if (colorLoc >= 0) {
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 7 * 4, 12);
        }

        // Render wireframes on top: disable depth write, enable depth test
        gl.depthMask(false);
        gl.enable(gl.DEPTH_TEST);

        // Render as lines
        gl.drawArrays(gl.LINES, 0, geometry.vertexCount);

        // Restore state
        gl.depthMask(true);

        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Destroy buffers and free GPU resources.
     */
    Donkeycraft.WireframeRenderer.prototype.destroy = function() {
        var gl = this._gl;
        if (!gl) return;

        if (this._vertexBuffer) { gl.deleteBuffer(this._vertexBuffer); this._vertexBuffer = null; }
        if (this._indexBuffer) { gl.deleteBuffer(this._indexBuffer); this._indexBuffer = null; }

        this._vertexBuffer = null;
        this._indexBuffer = null;
    };

})();