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
     * Generate an optimized index buffer from unindexed vertex data.
     * Merges identical vertices using a numeric hash for fast lookup.
     * @param {Object} geometry - Geometry with unindexed vertex data.
     * @param {number} [epsilon=0.001] - Float comparison tolerance.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.MeshOptimizer.prototype.generateIndexBuffer = function(geometry, epsilon) {
        epsilon = epsilon || 0.001;
        var vertices = geometry.vertices;
        var vertexCount = geometry.vertexCount;
        var faceDataSize = this._faceDataSize;

        // Hash-based vertex deduplication using position + normal + light (UV excluded).
        var hashTable = {};
        var uniqueCount = 0;
        var vertexToIndex = new Int32Array(vertexCount);
        var uniqueVertices = new Float32Array(vertexCount * faceDataSize);

        for (var i = 0; i < vertexCount; i++) {
            var base = i * faceDataSize;
            // Numeric hash: combine position(3) + normal(3) + light(1) into a string key
            // using rounded integer representation for exact matching.
            var hx = Math.round(vertices[base] / epsilon);
            var hy = Math.round(vertices[base + 1] / epsilon);
            var hz = Math.round(vertices[base + 2] / epsilon);
            var hn = Math.round((vertices[base + 5] + vertices[base + 6] + vertices[base + 7]) / epsilon);
            var hl = Math.round(vertices[base + 8] / epsilon);
            var key = hx ^ (hy << 10) ^ (hz << 20) ^ (hn << 30) ^ (hl << 5);

            if (hashTable[key] !== undefined) {
                vertexToIndex[i] = hashTable[key];
            } else {
                hashTable[key] = uniqueCount;
                vertexToIndex[i] = uniqueCount;

                var destBase = uniqueCount * faceDataSize;
                for (var d = 0; d < faceDataSize; d++) {
                    uniqueVertices[destBase + d] = vertices[base + d];
                }
                uniqueCount++;
            }
        }

        // Build index buffer from existing indices or generate quad indices.
        var indices;
        if (geometry.indices && geometry.indexCount > 0) {
            indices = new Uint16Array(geometry.indexCount);
            for (var i = 0; i < geometry.indexCount; i++) {
                indices[i] = vertexToIndex[geometry.indices[i]];
            }
        } else {
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
            vertices: uniqueVertices.subarray(0, uniqueCount * faceDataSize),
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

        var maxTriangles = Math.floor(indexCount / 3);
        var keptIndices;
        if (geometry.indices instanceof Uint32Array) {
            keptIndices = new Uint32Array(maxTriangles * 3);
        } else {
            keptIndices = new Uint16Array(maxTriangles * 3);
        }
        var keptCount = 0;

        for (var i = 0; i < indexCount; i += 3) {
            var i0 = indices[i];
            var i1 = indices[i + 1];
            var i2 = indices[i + 2];

            var v0x = vertices[i0 * faceDataSize];
            var v0y = vertices[i0 * faceDataSize + 1];
            var v0z = vertices[i0 * faceDataSize + 2];

            var v1x = vertices[i1 * faceDataSize];
            var v1y = vertices[i1 * faceDataSize + 1];
            var v1z = vertices[i1 * faceDataSize + 2];

            var v2x = vertices[i2 * faceDataSize];
            var v2y = vertices[i2 * faceDataSize + 1];
            var v2z = vertices[i2 * faceDataSize + 2];

            var e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
            var e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;

            var nx = e1y * e2z - e1z * e2y;
            var ny = e1z * e2x - e1x * e2z;
            var nz = e1x * e2y - e1y * e2x;

            var cx = cameraPos.x - (v0x + v1x + v2x) / 3;
            var cy = cameraPos.y - (v0y + v1y + v2y) / 3;
            var cz = cameraPos.z - (v0z + v1z + v2z) / 3;

            if (nx * cx + ny * cy + nz * cz > 0) {
                keptIndices[keptCount * 3]     = i0;
                keptIndices[keptCount * 3 + 1] = i1;
                keptIndices[keptCount * 3 + 2] = i2;
                keptCount++;
            }
        }

        var resultIndices;
        if (geometry.indices instanceof Uint32Array) {
            resultIndices = keptIndices.subarray(0, keptCount * 3);
        } else {
            resultIndices = keptIndices.subarray(0, keptCount * 3);
        }

        return {
            vertices: vertices,
            indices: resultIndices,
            vertexCount: geometry.vertexCount,
            indexCount: keptCount * 3
        };
    };

    /**
     * Run all optimization passes on geometry.
     * @param {Object} geometry - Geometry object.
     * @param {Donkeycraft.Vector3} [cameraPos] - Optional camera position for back-face culling.
     * @returns {{vertices: Float32Array, indices: Uint16Array|Uint32Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.MeshOptimizer.prototype.optimize = function(geometry, cameraPos) {
        var result = geometry;

        result = this.generateIndexBuffer(result);

        if (cameraPos) {
            result = this.cullBackFaces(result, cameraPos);
        }

        return result;
    };

})();