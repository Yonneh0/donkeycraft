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
     * @private
     * @param {Object[]} chunks - Array of chunk objects with getBlock method.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.WireframeRenderer.prototype._buildWireframeGeometry = function(chunks, chunkX, chunkZ, getBlockFunc) {
        var allVertices = [];
        var totalIndexCount = 0;

        // Block ID classifications
        var bedrockId = 7;   // bedrock (ID 7 in block.js)
        var cloudIds = {};
        cloudIds[17] = true; // cloud (block ID 17)

        // Iterate over all loaded chunks
        for (var c = 0; c < chunks.length; c++) {
            var chunk = chunks[c];
            if (!chunk) continue;

            var localChunkX = chunk.chunkX;
            var localChunkZ = chunk.chunkZ;

            // Determine block range to iterate
            var minX = localChunkX * CHUNK_SIZE;
            var maxX = minX + CHUNK_SIZE - 1;
            var minZ = localChunkZ * CHUNK_SIZE;
            var maxZ = minZ + CHUNK_SIZE - 1;

            for (var x = minX; x <= maxX; x++) {
                for (var y = 0; y < WORLD_HEIGHT; y++) {
                    for (var z = minZ; z <= maxZ; z++) {
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

                        // Build wireframe for this block
                        var wireframe = _buildBoxWireframe(
                            x, y, z,
                            x + 1, y + 1, z + 1,
                            color
                        );

                        var baseIdx = allVertices.length / 7; // 7 floats per vertex (pos3 + color4)
                        for (var i = 0; i < wireframe.vertices.length; i++) {
                            allVertices.push(wireframe.vertices[i]);
                        }
                        totalIndexCount += wireframe.indexCount;
                    }
                }
            }
        }

        var vertexCount = allVertices.length / 7;

        return {
            vertices: new Float32Array(allVertices),
            indices: null, // Line strips don't need index buffer — we use drawArrays
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

        // Set camera matrices
        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);
        this._shaderManager.setMat4('uView', matrices.view);

        // Identity model matrix — use a 4x4 identity array directly
        var identityMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
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