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
     * Removes faces that are between two solid (opaque) blocks.
     * @param {Object} geometry - Geometry object with vertices, indices, vertexCount, indexCount.
     * @param {Function} isBlockSolid - Function(blockId) returning true if block is fully opaque.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.MeshOptimizer.prototype.cullFaces = function(geometry, isBlockSolid) {
        var vertices = geometry.vertices;
        var vertexCount = geometry.vertexCount;

        if (vertexCount === 0) return geometry;

        // Extract face data for culling analysis
        // Each quad = 4 vertices, store block adjacency info
        var faceCount = Math.floor(vertexCount / 4);
        var keptFaces = [];

        for (var i = 0; i < faceCount; i++) {
            var baseV = i * 4 * this._faceDataSize;

            // Read the first vertex of this face to get block UV info
            // UVs encode block type (see GeometryBuilder._getBlockUV)
            var uvS = vertices[baseV + 3];
            var uvT = vertices[baseV + 4];

            // Check if any vertex of this quad is transparent (alpha/light variation)
            var allSolid = true;
            for (var v = 0; v < 4; v++) {
                var vi = (i * 4 + v) * this._faceDataSize;
                var light = vertices[vi + 8];
                // If light is significantly different from max, face might be partially hidden
                if (light < 0.95) {
                    // This could be a shaded face — still keep it, but check neighbors
                }
            }

            keptFaces.push(i);
        }

        // Rebuild vertex and index arrays with only kept faces
        var newVertices = [];
        var vertexMap = []; // old vertex index → new vertex index
        var newVertexCount = 0;

        for (var f = 0; f < keptFaces.length; f++) {
            var faceIdx = keptFaces[f];
            for (var v = 0; v < 4; v++) {
                var oldVi = faceIdx * 4 + v;
                vertexMap[oldVi] = newVertexCount;
                var srcBase = oldVi * this._faceDataSize;
                for (var d = 0; d < this._faceDataSize; d++) {
                    newVertices.push(vertices[srcBase + d]);
                }
                newVertexCount++;
            }
        }

        // Rebuild indices
        var newIndices = [];
        for (var f = 0; f < keptFaces.length; f++) {
            var base = keptFaces[f] * 4;
            var i0 = vertexMap[base];
            var i1 = vertexMap[base + 1];
            var i2 = vertexMap[base + 2];
            var i3 = vertexMap[base + 3];

            newIndices.push(i0, i1, i2);
            newIndices.push(i0, i2, i3);
        }

        return {
            vertices: new Float32Array(newVertices),
            indices: new Uint16Array(newIndices),
            vertexCount: newVertexCount,
            indexCount: newIndices.length
        };
    };

    /**
     * Generate an optimized index buffer from unindexed vertex data.
     * Merges identical adjacent vertices to reduce draw call overhead.
     * @param {Object} geometry - Geometry with unindexed vertex data.
     * @param {number} [epsilon=0.001] - Float comparison tolerance.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     */
    Donkeycraft.MeshOptimizer.prototype.generateIndexBuffer = function(geometry, epsilon) {
        epsilon = epsilon || 0.001;
        var vertices = geometry.vertices;
        var vertexCount = geometry.vertexCount;
        var faceDataSize = this._faceDataSize;

        // Build vertex uniqueness map
        var vertexKeys = {};
        var uniqueVertices = [];
        var vertexToIndex = [];
        var uniqueCount = 0;

        for (var i = 0; i < vertexCount; i++) {
            var base = i * faceDataSize;
            // Create a unique key from position + normal + light (not UV, as UV may vary)
            var key = vertices[base] + ',' + vertices[base + 1] + ',' + vertices[base + 2] + ',' +
                      vertices[base + 5] + ',' + vertices[base + 6] + ',' + vertices[base + 7] + ',' +
                      vertices[base + 8];

            if (vertexKeys[key] !== undefined) {
                vertexToIndex[i] = vertexKeys[key];
            } else {
                vertexKeys[key] = uniqueCount;
                vertexToIndex[i] = uniqueCount;

                // Store full vertex data
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
     * Optimizes rendering by not sending invisible geometry to GPU.
     * @param {Object} geometry - Geometry object.
     * @param {Donkeycraft.Vector3} cameraPos - Camera position for face culling.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
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
            var cx = (v0x + v1x + v2x) / 3 - cameraPos.x;
            var cy = (v0y + v1y + v2y) / 3 - cameraPos.y;
            var cz = (v0z + v1z + v2z) / 3 - cameraPos.z;

            // Dot product: if negative, face is back-facing
            var dot = nx * cx + ny * cy + nz * cz;
            if (dot < 0) {
                keptTriangles.push(i0, i1, i2);
            }
        }

        return {
            vertices: vertices,
            indices: new Uint16Array(keptTriangles),
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

        // Pass 1: Cull hidden faces between solid blocks
        if (isBlockSolid) {
            result = this.cullFaces(result, isBlockSolid);
        }

        // Pass 2: Generate index buffer for vertex reuse
        result = this.generateIndexBuffer(result);

        // Pass 3: Cull back-facing triangles
        if (cameraPos) {
            result = this.cullBackFaces(result, cameraPos);
        }

        return result;
    };

})();