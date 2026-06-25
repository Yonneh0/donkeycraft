// Donkeycraft — Geometry Builder
// Builds vertex buffers: position, UV, normal, light data for chunk meshes.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE; // 16
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT; // 256

    // Face definitions: direction, corner order (CCW for front-facing), light intensity
    var FACES = [
        { dir: [1, 0, 0],  name: 'right', light: 0.8, corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },  // +X
        { dir: [-1, 0, 0], name: 'left',  light: 0.7, corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },  // -X
        { dir: [0, 1, 0],  name: 'top',   light: 1.0, corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },  // +Y
        { dir: [0, -1, 0], name: 'bottom',light: 0.5, corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },  // -Y
        { dir: [0, 0, 1],  name: 'front', light: 0.9, corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },  // +Z
        { dir: [0, 0, -1], name: 'back',  light: 0.6, corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }   // -Z
    ];

    /**
     * GeometryBuilder — Builds vertex data arrays for chunk mesh rendering.
     */
    Donkeycraft.GeometryBuilder = function() {
        this._vertexSize = 8; // position(3) + UV(2) + normal(3) is wrong, let me recalculate
        // Actually: position(3) + UV(2) + normal(3) + light(1) = 9 floats per vertex
        this._vertexSize = 9;
    };

    /**
     * Check if a block is transparent (should show adjacent faces).
     * @param {number} blockId - The block ID to check.
     * @returns {boolean} True if the block is transparent/non-solid.
     */
    Donkeycraft.GeometryBuilder.prototype.isTransparent = function(blockId) {
        // Block 0 (air) is always transparent
        if (blockId === 0) return true;

        // For Phase 2, we use a simple heuristic:
        // Blocks with ID > 0 and < some threshold are solid
        // In Phase 3, this will reference Donkeycraft.Block.isTransparent()
        // For now, treat all blocks as potentially transparent (for testing)
        // We'll make most blocks solid except air and a few special ones
        return blockId === 0 || blockId === 9 || blockId === 10 || blockId === 11; // air, water, lava, glass-like
    };

    /**
     * Build geometry data for a single chunk.
     * @param {number} chunkX - X coordinate of the chunk.
     * @param {number} chunkZ - Z coordinate of the chunk.
     * @param {Function} getBlockFunc - Function(x, y, z) returning block ID at world position.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.GeometryBuilder.prototype.buildChunk = function(chunkX, chunkZ, getBlockFunc) {
        var maxVertices = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE * 6 * 4; // worst case
        var vertices = new Float32Array(maxVertices);
        var indices = new Uint16Array(maxVertices * 6 / 4); // 6 indices per quad (2 triangles), but we'll use index buffer
        var vertexCount = 0;
        var indexCount = 0;

        var baseVertex = 0;

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var y = 0; y < WORLD_HEIGHT; y++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var blockId = getBlockFunc(x, y, z);

                    // Skip air/transparent blocks (only render their faces if adjacent to solid)
                    if (blockId === 0) continue;

                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldY = y;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    // Check each face
                    for (var f = 0; f < FACES.length; f++) {
                        var face = FACES[f];
                        var nx = worldX + face.dir[0];
                        var ny = worldY + face.dir[1];
                        var nz = worldZ + face.dir[2];

                        // Get adjacent block — use getBlockFunc for same chunk, or return air for out-of-bounds
                        var adjBlock = this._getBlockAt(nx, ny, nz, getBlockFunc, chunkX, chunkZ);

                        // Only render face if adjacent block is transparent
                        if (!this.isTransparent(adjBlock)) continue;

                        // Add quad vertices
                        var uvOffset = this._getBlockUV(blockId, face.name);

                        for (var c = 0; c < 4; c++) {
                            var corner = face.corners[c];
                            var vi = vertexCount * this._vertexSize;

                            vertices[vi]     = worldX + corner[0]; // position x
                            vertices[vi + 1] = worldY + corner[1]; // position y
                            vertices[vi + 2] = worldZ + corner[2]; // position z
                            vertices[vi + 3] = uvOffset.u0 + corner[0] * (uvOffset.u1 - uvOffset.u0); // UV s
                            vertices[vi + 4] = uvOffset.v0 + corner[1] * (uvOffset.v1 - uvOffset.v0); // UV t
                            vertices[vi + 5] = face.dir[0]; // normal x
                            vertices[vi + 6] = face.dir[1]; // normal y
                            vertices[vi + 7] = face.dir[2]; // normal z
                            vertices[vi + 8] = face.light;  // light intensity

                            vertexCount++;
                        }

                        // Add two triangles (indices)
                        var baseIdx = indexCount;
                        indices[indexCount++] = baseIdx;
                        indices[indexCount++] = baseIdx + 1;
                        indices[indexCount++] = baseIdx + 2;
                        indices[indexCount++] = baseIdx;
                        indices[indexCount++] = baseIdx + 2;
                        indices[indexCount++] = baseIdx + 3;
                    }
                }
            }
        }

        // Trim arrays to actual size
        var actualVertices = new Float32Array(vertexCount * this._vertexSize);
        actualVertices.set(vertices.subarray(0, vertexCount * this._vertexSize));

        var actualIndices = new Uint16Array(indexCount);
        actualIndices.set(indices.subarray(0, indexCount));

        return {
            vertices: actualVertices,
            indices: actualIndices,
            vertexCount: vertexCount,
            indexCount: indexCount
        };
    };

    /**
     * Get block at world coordinates, handling chunk boundaries.
     * @private
     * @param {number} nx - World X coordinate.
     * @param {number} ny - World Y coordinate.
     * @param {number} nz - World Z coordinate.
     * @param {Function} getBlockFunc - Main block getter.
     * @param {number} chunkX - Current chunk X.
     * @param {number} chunkZ - Current chunk Z.
     * @returns {number} Block ID at the given position.
     */
    Donkeycraft.GeometryBuilder.prototype._getBlockAt = function(nx, ny, nz, getBlockFunc, chunkX, chunkZ) {
        // Check if within current chunk bounds
        var localX = nx - chunkX * CHUNK_SIZE;
        var localZ = nz - chunkZ * CHUNK_SIZE;

        if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT) {
            return getBlockFunc(localX, ny, localZ);
        }

        // Out of bounds — treat as solid (don't show faces on chunk edges)
        return 1; // stone
    };

    /**
     * Get UV coordinates for a block face.
     * @private
     * @param {number} blockId - The block ID.
     * @param {string} faceName - The face name (top, bottom, etc.).
     * @returns {{u0: number, v0: number, u1: number, v1: number}} UV range.
     */
    Donkeycraft.GeometryBuilder.prototype._getBlockUV = function(blockId, faceName) {
        // For Phase 2, use a simple placeholder UV mapping
        // In Phase 3, this will reference the texture atlas
        // Default: full atlas (0-1 UV range) for all blocks
        var atlasSize = 16; // 16x16 texture atlas tiles
        var tileU = blockId % atlasSize;
        var tileV = Math.floor(blockId / atlasSize);

        var tileU0 = tileU / atlasSize;
        var tileV0 = 1.0 - (tileV + 1) / atlasSize; // flip vertically
        var tileU1 = (tileU + 1) / atlasSize;
        var tileV1 = 1.0 - tileV / atlasSize;

        return { u0: tileU0, v0: tileV0, u1: tileU1, v1: tileV1 };
    };

    /**
     * Build a simple test quad (for testing shaders).
     * @param {number} [size=1.0] - Size of the quad.
     * @param {number} [y=0.0] - Y position.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.GeometryBuilder.prototype.buildQuad = function(size, y) {
        size = size || 1.0;
        y = (y !== undefined) ? y : 0.0;
        var half = size / 2;

        // 4 vertices: position(3) + UV(2) + normal(3) + light(1) = 9 floats each
        var vertices = new Float32Array([
            // Position        // UV     // Normal     // Light
            -half, y, -half,   0, 0,   0, 1, 0,   1.0,
             half, y, -half,   1, 0,   0, 1, 0,   1.0,
             half, y,  half,   1, 1,   0, 1, 0,   1.0,
            -half, y,  half,   0, 1,   0, 1, 0,   1.0
        ]);

        var indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        return {
            vertices: vertices,
            indices: indices,
            vertexCount: 4,
            indexCount: 6
        };
    };

    /**
     * Build a simple test cube (for testing shaders).
     * @param {number} [size=1.0] - Size of the cube.
     * @param {number} [y=0.0] - Y position of center.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.GeometryBuilder.prototype.buildCube = function(size, y) {
        size = size || 1.0;
        y = (y !== undefined) ? y : 0.0;
        var half = size / 2;

        // 24 vertices (6 faces × 4 corners)
        var vertices = new Float32Array([
            // +X face
             half, y-half, -half,  0.875, 0.75,  1, 0, 0,  0.8,
             half, y+half, -half,  0.875, 0.875, 1, 0, 0,  0.8,
             half, y+half,  half,  0.875, 1.0,   1, 0, 0,  0.8,
             half, y-half,  half,  0.875, 0.75,  1, 0, 0,  0.8,

            // -X face
            -half, y-half,  half,  0.75, 0.75,  -1, 0, 0,  0.7,
            -half, y+half,  half,  0.75, 0.875, -1, 0, 0,  0.7,
            -half, y+half, -half,  0.75, 1.0,   -1, 0, 0,  0.7,
            -half, y-half, -half,  0.75, 0.75,  -1, 0, 0,  0.7,

            // +Y face (top)
            -half, y+half, -half,  0.0, 0.0,   0, 1, 0,  1.0,
             half, y+half, -half,  0.125, 0.0,  0, 1, 0,  1.0,
             half, y+half,  half,  0.125, 0.125, 0, 1, 0,  1.0,
            -half, y+half,  half,  0.0, 0.125,  0, 1, 0,  1.0,

            // -Y face (bottom)
            -half, y-half,  half,  0.0, 0.0,   0, -1, 0,  0.5,
             half, y-half,  half,  0.125, 0.0,  0, -1, 0,  0.5,
             half, y-half, -half,  0.125, 0.125, 0, -1, 0,  0.5,
            -half, y-half, -half,  0.0, 0.125,  0, -1, 0,  0.5,

            // +Z face (front)
             half, y-half,  half,  0.25, 0.75,  0, 0, 1,  0.9,
             half, y+half,  half,  0.25, 0.875, 0, 0, 1,  0.9,
            -half, y+half,  half,  0.375, 0.875, 0, 0, 1,  0.9,
            -half, y-half,  half,  0.375, 0.75,  0, 0, 1,  0.9,

            // -Z face (back)
            -half, y-half, -half,  0.25, 0.75,  0, 0, -1,  0.6,
            -half, y+half, -half,  0.25, 0.875, 0, 0, -1,  0.6,
             half, y+half, -half,  0.375, 0.875, 0, 0, -1,  0.6,
             half, y-half, -half,  0.375, 0.75,  0, 0, -1,  0.6
        ]);

        // 36 indices (6 faces × 2 triangles × 3 vertices)
        var indices = new Uint16Array([
            0, 1, 2,  0, 2, 3,       // +X
            4, 5, 6,  4, 6, 7,       // -X
            8, 9, 10, 8, 10, 11,     // +Y
            12, 13, 14, 12, 14, 15,  // -Y
            16, 17, 18, 16, 18, 19,  // +Z
            20, 21, 22, 20, 22, 23   // -Z
        ]);

        return {
            vertices: vertices,
            indices: indices,
            vertexCount: 24,
            indexCount: 36
        };
    };

})();