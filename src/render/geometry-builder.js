// Donkeycraft — Geometry Builder
// Builds vertex buffers: position, UV, normal, light data for chunk meshes.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE; // 16
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT; // 256

    // Face definitions: direction, corner order (CCW for front-facing), light intensity
    var FACES = [
        { dir: [1, 0, 0],  name: 'right',  light: 0.8, corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },   // +X
        { dir: [-1, 0, 0], name: 'left',   light: 0.7, corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },  // -X
        { dir: [0, 1, 0],  name: 'top',    light: 1.0, corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },   // +Y
        { dir: [0, -1, 0], name: 'bottom', light: 0.5, corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },  // -Y
        { dir: [0, 0, 1],  name: 'front',  light: 0.9, corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },   // +Z
        { dir: [0, 0, -1], name: 'back',   light: 0.6, corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }   // -Z
    ];

    /**
     * GeometryBuilder — Builds vertex data arrays for chunk mesh rendering.
     */
    Donkeycraft.GeometryBuilder = function() {
        this._vertexSize = 9; // position(3) + UV(2) + normal(3) + light(1)
    };

    /**
     * Check if a block is transparent (should show adjacent faces).
     * Delegates to Donkeycraft.BlockRegistry.isTransparent() when available.
     * @param {number} blockId - The block ID to check.
     * @returns {boolean} True if the block is transparent/non-solid.
     */
    Donkeycraft.GeometryBuilder.prototype.isTransparent = function(blockId) {
        if (Donkeycraft.BlockRegistry && typeof Donkeycraft.BlockRegistry.isTransparent === 'function') {
            return Donkeycraft.BlockRegistry.isTransparent(blockId);
        }
        // Fallback: air, water, lava
        return blockId === 0 || blockId === 9 || blockId === 10 || blockId === 11;
    };

    /**
     * Build geometry data for a single chunk.
     * Uses dynamic arrays that grow as needed instead of pre-allocating maximum size.
     * @param {number} chunkX - X coordinate of the chunk.
     * @param {number} chunkZ - Z coordinate of the chunk.
     * @param {Function} getBlockFunc - Function(x, y, z) returning block ID at world position.
     * @returns {{vertices: Float32Array, indices: Uint32Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.GeometryBuilder.prototype.buildChunk = function(chunkX, chunkZ, getBlockFunc) {
        var vertices = [];
        var indices = [];

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var y = 0; y < WORLD_HEIGHT; y++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var blockId = getBlockFunc(x, y, z);

                    if (blockId === 0) continue;

                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldY = y;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    for (var f = 0; f < FACES.length; f++) {
                        var face = FACES[f];
                        var nx = worldX + face.dir[0];
                        var ny = worldY + face.dir[1];
                        var nz = worldZ + face.dir[2];

                        var adjBlock = this._getBlockAt(nx, ny, nz, getBlockFunc, chunkX, chunkZ);

                        if (!this.isTransparent(adjBlock)) continue;

                        var uvOffset = this._getBlockUV(blockId, face.name);
                        var dir = face.dir;
                        var light = face.light;

                        for (var c = 0; c < 4; c++) {
                            var corner = face.corners[c];
                            vertices.push(
                                worldX + corner[0],
                                worldY + corner[1],
                                worldZ + corner[2],
                                uvOffset.u0 + corner[0] * (uvOffset.u1 - uvOffset.u0),
                                uvOffset.v0 + corner[1] * (uvOffset.v1 - uvOffset.v0),
                                dir[0], dir[1], dir[2], light
                            );
                        }

                        var baseIdx = vertices.length / 9 - 4;
                        indices.push(
                            baseIdx, baseIdx + 1, baseIdx + 2,
                            baseIdx, baseIdx + 2, baseIdx + 3
                        );
                    }
                }
            }
        }

        var vertexCount = vertices.length / 9;
        var indexCount = indices.length;

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            vertexCount: vertexCount,
            indexCount: indexCount,
            useUint32: true
        };
    };

    /**
     * Get block at world coordinates, handling chunk boundaries.
     * @private
     */
    Donkeycraft.GeometryBuilder.prototype._getBlockAt = function(nx, ny, nz, getBlockFunc, chunkX, chunkZ) {
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
     */
    Donkeycraft.GeometryBuilder.prototype._getBlockUV = function(blockId, faceName) {
        var atlasSize = 16;
        var tileU = blockId % atlasSize;
        var tileV = Math.floor(blockId / atlasSize);

        // Clamp tileV to atlas bounds to prevent UV overflow for blockId >= 256
        if (tileV >= atlasSize) tileV = atlasSize - 1;

        return {
            u0: tileU / atlasSize,
            v0: 1.0 - (tileV + 1) / atlasSize,
            u1: (tileU + 1) / atlasSize,
            v1: 1.0 - tileV / atlasSize
        };
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
        return {
            vertices: new Float32Array([
                -half, y, -half,  0, 0,   0, 1, 0,   1.0,
                 half, y, -half,  1, 0,   0, 1, 0,   1.0,
                 half, y,  half,  1, 1,   0, 1, 0,   1.0,
                -half, y,  half,  0, 1,   0, 1, 0,   1.0
            ]),
            indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
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
        return {
            vertices: new Float32Array([
                // +X face
                 half, y-half, -half,  0.875, 0.75,  1, 0, 0,  0.8,
                 half, y+half, -half,  0.875, 0.875, 1, 0, 0,  0.8,
                 half, y+half,  half,  0.875, 1.0,   1, 0, 0,  0.8,
                 half, y-half,  half,  0.875, 0.75,  1, 0, 0,  0.8,
                // -X face
               -half, y-half,  half,  0.75, 0.75, -1, 0, 0,  0.7,
               -half, y+half,  half,  0.75, 0.875, -1, 0, 0,  0.7,
               -half, y+half, -half,  0.75, 1.0,  -1, 0, 0,  0.7,
               -half, y-half, -half,  0.75, 0.75, -1, 0, 0,  0.7,
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
            ]),
            indices: new Uint16Array([
                0, 1, 2,  0, 2, 3,       // +X
                4, 5, 6,  4, 6, 7,       // -X
                8, 9, 10, 8, 10, 11,     // +Y
                12, 13, 14, 12, 14, 15,  // -Y
                16, 17, 18, 16, 18, 19,  // +Z
                20, 21, 22, 20, 22, 23   // -Z
            ]),
            vertexCount: 24,
            indexCount: 36
        };
    };

})();