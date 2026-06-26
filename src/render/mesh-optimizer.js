// Donkeycraft — Mesh Optimizer
// Face culling: removes faces between solid blocks, generates index buffers.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * MeshOptimizer — Optimizes chunk mesh data by culling hidden faces.
     */
    Donkeycraft.MeshOptimizer = function() {
        this._faceDataSize = 9; // position(3) + UV(2) + normal(3) + light(1)
    };

    /**
     * Cull hidden faces from raw vertex data.
     * Note: Face culling is already performed during geometry build by GeometryBuilder.
     * This method returns geometry unchanged as a no-op for future post-build optimization.
     * @param {Object} geometry - Geometry object with vertices, indices, vertexCount, indexCount.
     * @param {Function} isBlockSolid - Function(blockId) returning true if block is fully opaque.
     * @returns {{vertices: Float32Array, indices: Uint16Array|Uint32Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.MeshOptimizer.prototype.cullFaces = function(geometry, isBlockSolid) {
        // No-op: culling already happens during geometry build.
        return geometry;
    };

    /**
     * Generate an optimized index buffer from unindexed vertex data.
     * Merges identical vertices to reduce draw call overhead.
     * @param {Object} geometry - Geometry with unindexed vertex data.
     * @param {number} [epsilon=0.001] - Float comparison tolerance.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.MeshOptimizer.prototype.generateIndexBuffer = function(geometry, epsilon) {
        epsilon = epsilon || 0.001;
        var vertices = geometry.vertices;
        var vertexCount = geometry.vertexCount;
        var faceDataSize = this._faceDataSize;

        // Key: position(3) + normal(3) + light(1) — UV excluded as it varies per face.
        var vertexKeys = {};
        var uniqueVertices = [];
        var vertexToIndex = [];
        var uniqueCount = 0;

        for (var i = 0; i < vertexCount; i++) {
            var base = i * faceDataSize;
            var key = [
                vertices[base],
                vertices[base + 1],
                vertices[base + 2],
                vertices[base + 5],
                vertices[base + 6],
                vertices[base + 7],
                vertices[base + 8]
            ].join(',');

            if (vertexKeys[key] !== undefined) {
                vertexToIndex[i] = vertexKeys[key];
            } else {
                vertexKeys[key] = uniqueCount;
                vertexToIndex[i] = uniqueCount;

                for (var d = 0; d < faceDataSize; d++) {
                    uniqueVertices.push(vertices[base + d]);
                }
                uniqueCount++;
            }
        }

        // Build index buffer from existing indices or generate quad indices
        var indices;
        if (geometry.indices && geometry.indexCount > 0) {
            // Remap existing indices to unique vertices
            indices = new Uint16Array(geometry.indexCount);
            for (var i = 0; i < geometry.indexCount; i++) {
                indices[i] = vertexToIndex[geometry.indices[i]];
            }
        } else {
            // Generate quad indices from unindexed data
            var quadCount = Math.floor(vertexCount / 4);
            indices = new Uint16Array(quadCount * 6);
            for (var q = 0; q < quadCount; q++) {
                var baseIdx = vertexToIndex[q * 4];
                indices[q * 6]     = baseIdx;
                indices[q * 6 + 1] = vertexToIndex[q * 4 + 1];
                indices[q * 6 + 2] = vertexToIndex[q * 4 + 2];
                indices[q * 6 + 3] = baseIdx;
                indices[q * 6 + 4] = vertexToIndex[q * 4 + 2];
                indices[q * 6 + 5] = vertexToIndex[q * 4 + 3];
            }
        }

        return {
            vertices: new Float32Array(uniqueVertices),
            indices: indices,
            vertexCount: uniqueCount,
            indexCount: indices.length
        };
    };

    /**
     * Remove back-facing faces from a chunk mesh.
     * Preserves the original index type (Uint16 or Uint32) from the input geometry.
     * @param {Object} geometry - Geometry object with vertices, indices, vertexCount, indexCount.
     * @param {Donkeycraft.Vector3} cameraPos - Camera position for face culling.
     * @returns {{vertices: Float32Array, indices: Uint16Array|Uint32Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.MeshOptimizer.prototype.cullBackFaces = function(geometry, cameraPos) {
        var vertices = geometry.vertices;
        var indices = geometry.indices;
        var indexCount = geometry.indexCount;
        var faceDataSize = this._faceDataSize;

        if (indexCount === 0) return geometry;

        var keptTriangles = [];

        for (var i = 0; i < indexCount; i += 3) {
            var i0 = indices[i];
            var i1 = indices[i + 1];
            var i2 = indices[i + 2];

            // Get triangle vertices
            var v0x = vertices[i0 * faceDataSize];
            var v0y = vertices[i0 * faceDataSize + 1];
            var v0z = vertices[i0 * faceDataSize + 2];

            var v1x = vertices[i1 * faceDataSize];
            var v1y = vertices[i1 * faceDataSize + 1];
            var v1z = vertices[i1 * faceDataSize + 2];

            var v2x = vertices[i2 * faceDataSize];
            var v2y = vertices[i2 * faceDataSize + 1];
            var v2z = vertices[i2 * faceDataSize + 2];

            // Compute edge vectors
            var e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
            var e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;

            // Compute face normal via cross product
            var nx = e1y * e2z - e1z * e2y;
            var ny = e1z * e2x - e1x * e2z;
            var nz = e1x * e2y - e1y * e2x;

            // Vector from triangle center to camera
            var cx = cameraPos.x - (v0x + v1x + v2x) / 3;
            var cy = cameraPos.y - (v0y + v1y + v2y) / 3;
            var cz = cameraPos.z - (v0z + v1z + v2z) / 3;

            // Dot product: if positive, face is front-facing
            var dot = nx * cx + ny * cy + nz * cz;
            if (dot > 0) {
                keptTriangles.push(i0, i1, i2);
            }
        }

        // Preserve the original index type from input geometry
        var resultIndices;
        if (geometry.indices instanceof Uint32Array) {
            resultIndices = new Uint32Array(keptTriangles);
        } else {
            resultIndices = new Uint16Array(keptTriangles);
        }

        return {
            vertices: vertices,
            indices: resultIndices,
            vertexCount: geometry.vertexCount,
            indexCount: keptTriangles.length
        };
    };

    /**
     * Run all optimization passes on geometry.
     * @param {Object} geometry - Geometry object.
     * @param {Function} [isBlockSolid] - Optional solidity check for face culling.
     * @param {Donkeycraft.Vector3} [cameraPos] - Optional camera position for back-face culling.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.MeshOptimizer.prototype.optimize = function(geometry, isBlockSolid, cameraPos) {
        var result = geometry;

        if (isBlockSolid) {
            result = this.cullFaces(result, isBlockSolid);
        }

        result = this.generateIndexBuffer(result);

        if (cameraPos) {
            result = this.cullBackFaces(result, cameraPos);
        }

        return result;
    };

})();