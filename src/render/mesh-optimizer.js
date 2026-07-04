// Donkeycraft — Mesh Optimizer
// Face culling: removes faces between solid blocks, generates index buffers.
//
// Vertex Layout (9 floats per vertex):
//   [0-2] position  (x, y, z)
//   [3]   light     (light intensity)
//   [4-5] UV        (u, v)
//   [6-8] normal    (nx, ny, nz)
//
// @module mesh-optimizer
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * MeshOptimizer — Optimizes chunk mesh data by culling hidden faces and deduplicating vertices.
     *
     * Vertex Layout (9 floats per vertex):
     *   [0-2] position  (x, y, z)
     *   [3]   light     (light intensity)
     *   [4-5] UV        (u, v)
     *   [6-8] normal    (nx, ny, nz)
     *
     * @constructor
     * @alias Donkeycraft.MeshOptimizer
     */
    Donkeycraft.MeshOptimizer = function () {
        /**
         * Number of floats per vertex.
         * @type {number}
         */
        this._faceDataSize = 9;
    };

    /**
     * Validate that the geometry object has the required structure.
     *
     * @private
     * @param {Object} geometry - Geometry to validate.
     * @param {string} name - Name of the calling function (for log messages).
     * @returns {boolean} True if valid.
     */
    Donkeycraft.MeshOptimizer.prototype._validateGeometry = function (geometry, name) {
        if (!geometry || typeof geometry !== 'object') {
            Donkeycraft.Logger.warn('MeshOptimizer', name + ': geometry is null, undefined, or not an object — returning original geometry');
            return false;
        }
        if (!(geometry.vertices instanceof Float32Array)) {
            Donkeycraft.Logger.warn('MeshOptimizer', name + ': vertices is not a Float32Array — returning original geometry');
            return false;
        }
        if (typeof geometry.vertexCount !== 'number' || typeof geometry.indexCount !== 'number') {
            Donkeycraft.Logger.warn('MeshOptimizer', name + ': vertexCount or indexCount missing or invalid — returning original geometry');
            return false;
        }
        return true;
    };

    /**
     * Validate camera position for back-face culling.
     *
     * @private
     * @param {Object} cameraPos - Camera position object with x, y, z properties.
     * @returns {boolean} True if valid.
     */
    Donkeycraft.MeshOptimizer.prototype._validateCameraPos = function (cameraPos) {
        if (!cameraPos || typeof cameraPos !== 'object') {
            return false;
        }
        if (typeof cameraPos.x !== 'number' ||
            typeof cameraPos.y !== 'number' ||
            typeof cameraPos.z !== 'number') {
            return false;
        }
        return true;
    };

    /**
     * Generate an optimized index buffer from unindexed vertex data by deduplicating
     * identical vertices using a Map-based lookup for O(1) lookups.
     *
     * Vertices are considered identical only when ALL 9 components match within the epsilon tolerance:
     * position (3) + light (1) + UV (2) + normal (3).
     *
     * Always returns Uint32Array for safety against overflow with large meshes.
     * Uses `.slice()` instead of `.subarray()` to create new arrays, preventing memory leaks
     * from typed array views that back larger buffers.
     *
     * @param {Object} geometry - Geometry object with unindexed vertex data.
     * @param {Float32Array} geometry.vertices - Vertex data array (9 floats per vertex).
     * @param {number} geometry.vertexCount - Total number of vertices.
     * @param {Uint16Array|Uint32Array} [geometry.indices] - Optional existing index array.
     * @param {number} [geometry.indexCount] - Optional existing index count (defaults to indices.length).
     * @param {number} [epsilon=0.001] - Float comparison tolerance for vertex merging.
     * @returns {{vertices: Float32Array, indices: Uint32Array, vertexCount: number, indexCount: number}}
     *    Deduplicated geometry with a new index buffer. Returns the original geometry if input is invalid.
     * @throws {Error} If epsilon is NaN or negative.
     */
    Donkeycraft.MeshOptimizer.prototype.generateIndexBuffer = function (geometry, epsilon) {
        // Validate inputs
        if (!this._validateGeometry(geometry, 'generateIndexBuffer')) {
            return geometry;
        }

        // Validate and default epsilon
        if (epsilon !== undefined && (isNaN(epsilon) || epsilon < 0)) {
            Donkeycraft.Logger.warn('MeshOptimizer', 'generateIndexBuffer: invalid epsilon (' + epsilon + ') — using default 0.001');
            epsilon = 0.001;
        } else if (epsilon === undefined) {
            epsilon = 0.001;
        }

        var vertices = geometry.vertices;
        var vertexCount = geometry.vertexCount;
        var faceDataSize = this._faceDataSize;

        // Handle edge case: no vertices
        if (vertexCount <= 0 || vertices.length === 0) {
            return {
                vertices: new Float32Array(0),
                indices: new Uint32Array(0),
                vertexCount: 0,
                indexCount: 0
            };
        }

        // Ensure vertexCount does not exceed actual array length
        var maxVertices = Math.floor(vertices.length / faceDataSize);
        if (vertexCount > maxVertices) {
            Donkeycraft.Logger.warn('MeshOptimizer', 'generateIndexBuffer: vertexCount (' + vertexCount + ') exceeds array capacity (' + maxVertices + ') — clamping');
            vertexCount = maxVertices;
        }

        // Map-based vertex deduplication using position + light + UV + normal.
        // Map is more efficient and safer than plain objects for large datasets.
        var hashTable = new Map();
        var uniqueCount = 0;
        var uniqueVertices = new Float32Array(vertexCount * faceDataSize);

        // Critical: vertexToIndex maps each ORIGINAL vertex index to its corresponding
        // UNIQUE vertex index. This is needed to remap indices after deduplication.
        var vertexToIndex = new Int32Array(vertexCount);

        for (var i = 0; i < vertexCount; i++) {
            var base = i * faceDataSize;

            // Create a collision-free key by rounding each component to epsilon precision.
            // Using comma-separated rounded integers ensures exact float matching.
            // All 9 components must match for vertices to be merged:
            // - Position (3): world coordinates
            // - Light (1): light intensity
            // - UV (2): texture coordinates — CRITICAL: vertices at same position with different UVs are different
            // - Normal (3): face normal — hashed individually to prevent sum collisions
            var hx = Math.round(vertices[base] / epsilon);
            var hy = Math.round(vertices[base + 1] / epsilon);
            var hz = Math.round(vertices[base + 2] / epsilon);
            var hl = Math.round(vertices[base + 3] / epsilon);
            var hu = Math.round(vertices[base + 4] / epsilon);
            var hv = Math.round(vertices[base + 5] / epsilon);
            var hnx = Math.round(vertices[base + 6] / epsilon); // normal x
            var hny = Math.round(vertices[base + 7] / epsilon); // normal y
            var hnz = Math.round(vertices[base + 8] / epsilon); // normal z

            var key = hx + ',' + hy + ',' + hz + ',' + hl + ',' + hu + ',' + hv + ',' + hnx + ',' + hny + ',' + hnz;

            if (hashTable.has(key)) {
                // Vertex already exists — store its unique index for later remapping
                vertexToIndex[i] = hashTable.get(key);
                continue;
            }

            // New vertex — add to unique set and record mapping
            hashTable.set(key, uniqueCount);
            vertexToIndex[i] = uniqueCount;

            var destBase = uniqueCount * faceDataSize;
            for (var d = 0; d < faceDataSize; d++) {
                uniqueVertices[destBase + d] = vertices[base + d];
            }
            uniqueCount++;
        }

        // Build index buffer from existing indices or generate quad indices.
        var indices;
        if (geometry.indices && geometry.indexCount > 0) {
            // Remap existing indices to deduplicated vertex indices using vertexToIndex mapping
            indices = new Uint32Array(geometry.indexCount);
            for (var i = 0; i < geometry.indexCount; i++) {
                var origIdx = geometry.indices[i];
                if (origIdx >= 0 && origIdx < vertexCount) {
                    indices[i] = vertexToIndex[origIdx];
                } else {
                    Donkeycraft.Logger.warn('MeshOptimizer', 'generateIndexBuffer: index ' + i + ' references out-of-bounds vertex ' + origIdx + ' — using 0');
                    indices[i] = 0;
                }
            }
        } else {
            // No existing indices — generate triangle indices from quads
            // CRITICAL: Remap generated indices through vertexToIndex so they reference
            // the deduplicated vertex array instead of original positions.
            var quadCount = Math.floor(vertexCount / 4);
            indices = new Uint32Array(quadCount * 6);
            for (var q = 0; q < quadCount; q++) {
                var baseIdx = q * 4;
                indices[q * 6] = vertexToIndex[baseIdx];
                indices[q * 6 + 1] = vertexToIndex[baseIdx + 1];
                indices[q * 6 + 2] = vertexToIndex[baseIdx + 2];
                indices[q * 6 + 3] = vertexToIndex[baseIdx];
                indices[q * 6 + 4] = vertexToIndex[baseIdx + 2];
                indices[q * 6 + 5] = vertexToIndex[baseIdx + 3];
            }
        }

        // Use .slice() instead of .subarray() to create new arrays, preventing memory leaks
        // from typed array views that back larger buffers.
        return {
            vertices: uniqueVertices.slice(0, uniqueCount * faceDataSize),
            indices: indices.slice(0, indices.length),
            vertexCount: uniqueCount,
            indexCount: indices.length
        };
    };

    /**
     * Remove back-facing faces from a chunk mesh using dot-product test against camera.
     *
     * For each triangle, computes the face normal via cross product of two edges,
     * then tests if the normal points toward the camera (dot product > 0).
     * If the face is back-facing (normal points away), it is discarded.
     *
     * WARNING: This performs CPU-side culling at build time. If the camera moves after
     * the mesh is built, some visible faces may have been incorrectly culled. For best
     * results, use GPU-side back-face culling (gl.cullFace) every frame instead.
     * When _enableBackFaceCulling is enabled on TerrainRenderer, this runs during mesh
     * build — ensure the camera position is current.
     *
     * Always returns Uint32Array to avoid overflow when many triangles survive culling.
     * Uses `.slice()` instead of `.subarray()` to create new arrays, preventing memory leaks.
     *
     * @param {Object} geometry - Geometry object with vertices, indices, vertexCount, indexCount.
     * @param {Float32Array} geometry.vertices - Vertex data array (9 floats per vertex).
     * @param {Uint16Array|Uint32Array} geometry.indices - Index array.
     * @param {number} geometry.vertexCount - Total number of vertices.
     * @param {number} geometry.indexCount - Total number of indices.
     * @param {{x: number, y: number, z: number}} cameraPos - Camera position for face culling (must have x, y, z properties).
     * @returns {{vertices: Float32Array, indices: Uint32Array, vertexCount: number, indexCount: number}}
     *    Culled geometry. Returns original geometry if input is invalid or no faces are back-facing.
     */
    Donkeycraft.MeshOptimizer.prototype.cullBackFaces = function (geometry, cameraPos) {
        // Validate inputs
        if (!this._validateGeometry(geometry, 'cullBackFaces')) {
            return geometry;
        }

        if (!this._validateCameraPos(cameraPos)) {
            Donkeycraft.Logger.warn('MeshOptimizer', 'cullBackFaces: invalid camera position — returning original geometry');
            return geometry;
        }

        var vertices = geometry.vertices;
        var indices = geometry.indices;
        var indexCount = geometry.indexCount;
        var vertexCount = geometry.vertexCount;
        var faceDataSize = this._faceDataSize;

        // Handle edge case: no indices to process
        if (indexCount === 0) {
            return {
                vertices: vertices.slice(),
                indices: new Uint32Array(0),
                vertexCount: vertexCount,
                indexCount: 0
            };
        }

        // Ensure indexCount does not exceed actual array length
        if (indexCount > indices.length) {
            Donkeycraft.Logger.warn('MeshOptimizer', 'cullBackFaces: indexCount (' + indexCount + ') exceeds array length (' + indices.length + ') — clamping');
            indexCount = indices.length;
        }

        // Always use Uint32 — culling rarely removes enough faces to fit in Uint16.
        var maxTriangles = Math.floor(indexCount / 3);
        var keptIndices = new Uint32Array(maxTriangles * 3);
        var keptCount = 0;

        for (var i = 0; i < indexCount; i += 3) {
            var i0 = indices[i];
            var i1 = indices[i + 1];
            var i2 = indices[i + 2];

            // Validate vertex indices
            if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) {
                Donkeycraft.Logger.warn('MeshOptimizer', 'cullBackFaces: index references out-of-bounds vertex — skipping triangle at index ' + i);
                continue;
            }

            var base0 = i0 * faceDataSize;
            var base1 = i1 * faceDataSize;
            var base2 = i2 * faceDataSize;

            // Extract positions of the three vertices
            var v0x = vertices[base0], v0y = vertices[base0 + 1], v0z = vertices[base0 + 2];
            var v1x = vertices[base1], v1y = vertices[base1 + 1], v1z = vertices[base1 + 2];
            var v2x = vertices[base2], v2y = vertices[base2 + 1], v2z = vertices[base2 + 2];

            // Compute face normal via cross product of two edges
            var e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
            var e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;

            var nx = e1y * e2z - e1z * e2y;
            var ny = e1z * e2x - e1x * e2z;
            var nz = e1x * e2y - e1y * e2x;

            // Compute vector from face center to camera
            var cx = cameraPos.x - (v0x + v1x + v2x) / 3;
            var cy = cameraPos.y - (v0y + v1y + v2y) / 3;
            var cz = cameraPos.z - (v0z + v1z + v2z) / 3;

            // Dot product test: positive means face is front-facing (visible)
            if (nx * cx + ny * cy + nz * cz > 0) {
                keptIndices[keptCount * 3] = i0;
                keptIndices[keptCount * 3 + 1] = i1;
                keptIndices[keptCount * 3 + 2] = i2;
                keptCount++;
            }
        }

        // Use .slice() instead of .subarray() to create new arrays, preventing memory leaks
        return {
            vertices: vertices.slice(),
            indices: keptIndices.slice(0, keptCount * 3),
            vertexCount: vertexCount,
            indexCount: keptCount * 3
        };
    };

    /**
     * Run all optimization passes on geometry: index generation + optional back-face culling.
     *
     * Pass 1: Generate index buffer by deduplicating identical vertices.
     * Pass 2 (optional): Remove back-facing faces using camera position.
     *
     * After optimization, validates that the result has non-zero vertex and index counts.
     * If either count is zero, returns the original geometry to prevent empty mesh uploads.
     *
     * @param {Object} geometry - Geometry object to optimize.
     * @param {Float32Array} geometry.vertices - Vertex data array (9 floats per vertex).
     * @param {number} geometry.vertexCount - Total number of vertices.
     * @param {Uint16Array|Uint32Array} [geometry.indices] - Optional existing index array.
     * @param {number} [geometry.indexCount] - Optional existing index count.
     * @param {{x: number, y: number, z: number}} [cameraPos] - Optional camera position for back-face culling.
     * @param {boolean} [cullBackFaces=true] - Whether to perform back-face culling (default: true).
     * @param {number} [epsilon=0.001] - Optional epsilon for vertex merging (passed to generateIndexBuffer).
     * @returns {{vertices: Float32Array, indices: Uint32Array, vertexCount: number, indexCount: number}}
     *    Optimized geometry with validated counts. Returns original geometry if input is invalid or
     *    optimization produces empty output.
     */
    Donkeycraft.MeshOptimizer.prototype.optimize = function (geometry, cameraPos, cullBackFaces, epsilon) {
        // Handle edge case: no geometry provided
        if (!geometry || typeof geometry !== 'object') {
            Donkeycraft.Logger.warn('MeshOptimizer', 'optimize: geometry is null or undefined — returning original');
            return geometry;
        }

        var originalVertexCount = geometry.vertexCount || 0;
        var originalIndexCount = geometry.indexCount || 0;

        // Guard: skip optimization if there's nothing to process
        if (originalVertexCount === 0 || originalIndexCount === 0) {
            return geometry;
        }

        var result = geometry;

        // Pass 1: Generate index buffer ONLY if the geometry has no existing indices.
        // Geometry from GeometryBuilder.buildChunk() is already properly indexed with
        // consistent vertex ordering. Running deduplication on already-indexed data
        // corrupts index references through incorrect remapping — this is the primary
        // cause of the triangular streaking artifacts seen in the terrain.
        if (!result.indices || result.indexCount === 0) {
            result = this.generateIndexBuffer(result, epsilon);
        }

        // Pass 2: Back-face culling (optional)
        var shouldCull = cullBackFaces !== false;
        if (shouldCull && cameraPos) {
            result = this.cullBackFaces(result, cameraPos);
        }

        // Validate that optimization didn't produce empty geometry.
        // This can happen if all vertices are deduplicated to one point or all faces
        // are culled (rare edge case, but prevents empty buffer uploads).
        if (result.vertexCount === 0 || result.indexCount === 0) {
            Donkeycraft.Logger.warn('MeshOptimizer',
                'optimize: resulting geometry is empty (verts: ' + result.vertexCount +
                ', indices: ' + result.indexCount + ') — returning original (' +
                originalVertexCount + ' verts, ' + originalIndexCount + ' indices)');
            return geometry;
        }

        return result;
    };

})();