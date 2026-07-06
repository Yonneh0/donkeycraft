// Donkeycraft — Chunk Mesh
// Per-chunk mesh object: buffer management, update methods, draw calls.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Number of floats per vertex in the chunk mesh vertex layout.
     * Layout: position(3) + light(1) + UV(2) + normal(3) = 9 floats.
     * @constant {number}
     */
    var VERTEX_STRIDE = 9;

    /**
     * Byte offset between vertices in the buffer (9 floats × 4 bytes per float).
     * @constant {number}
     */
    var VERTEX_BYTE_STRIDE = VERTEX_STRIDE * 4; // 36 bytes

    // ============================================================
    // Attribute layout offsets (in floats from buffer start)
    // ============================================================

    /**
     * Float offset of the position attribute within each vertex.
     * @constant {number}
     */
    var POS_OFFSET = 0; // bytes: 0

    /**
     * Float offset of the light attribute within each vertex.
     * @constant {number}
     */
    var LIGHT_OFFSET = 3; // bytes: 12

    /**
     * Float offset of the UV attribute within each vertex.
     * @constant {number}
     */
    var UV_OFFSET = 4; // bytes: 16

    /**
     * Float offset of the normal attribute within each vertex.
     * @constant {number}
     */
    var NORMAL_OFFSET = 6; // bytes: 24

    /**
     * ChunkMesh — Manages WebGL buffers and draw calls for a single chunk's geometry.
     *
     * Handles buffer creation, upload, attribute binding, and GPU resource cleanup.
     * Supports both Uint16 and Uint32 index types via OES_element_index_uint extension.
     * Attribute locations are cached after first lookup to avoid repeated shader manager calls.
     * Listens for WebGL context loss/restore events on the source canvas.
     *
     * Vertex Layout: position(3) + light(1) + UV(2) + normal(3) = 9 floats per vertex.
     * Stride: 36 bytes (9 × 4). Offsets: pos=0, light=3, UV=4, normal=6.
     *
     * @constructor
     * @alias Donkeycraft.ChunkMesh
     * @param {WebGLRenderingContext} gl - WebGL context.
     * @param {Donkeycraft.ShaderManager} shaderManager - Shader manager for attribute locations.
     */
    Donkeycraft.ChunkMesh = function (gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;

        // Buffer objects
        this._vertexBuffer = null;
        this._indexBuffer = null;

        // Geometry data (stored for context restore and dirty tracking)
        this._geometry = null;
        this._vertexCount = 0;
        this._indexCount = 0;

        // Dirty flag — whether buffers need updating
        this._dirty = true;

        // Destroyed flag — prevents drawing after destruction
        this._destroyed = false;

        // Context lost flag — prevents rendering after context loss
        this._contextLost = false;

        // Whether Uint32 indices are supported (OES_element_index_uint extension)
        this._supportsUint32Indices = false;
        if (gl) {
            var ext = gl.getExtension('OES_element_index_uint');
            this._supportsUint32Indices = ext !== null;
        }

        // Track whether this mesh uses Uint32 indices
        this._geometryUsesUint32 = false;

        // Cached attribute locations (populated on first draw call per shader program).
        // null indicates uninitialised. After first lookup, stores the actual location
        // (-1 if not found in shader, or >= 0 if found). Using null instead of -1
        // prevents conflating "not yet initialized" with "attribute not found at location 0".
        this._attrPosition = null;
        this._attrLight = null;
        this._attrUV = null;
        this._attrNormal = null;

        // Track which shader program the cached locations belong to, so we can invalidate
        // them when the active program changes. WebGL programs maintain stable attribute
        // layouts, but if the shader program is re-linked with a different program,
        // cached locations become stale. We use a simple program reference check.
        this._cachedProgram = null;


        // Listen for context loss/restore on the source canvas
        if (gl && gl.canvas) {
            var self = this;
            gl.canvas.addEventListener('webglcontextlost', function (e) {
                e.preventDefault();
                self._contextLost = true;
                self._vertexBuffer = null;
                self._indexBuffer = null;
            });
            gl.canvas.addEventListener('webglcontextrestored', function () {
                self._contextLost = false;
                self._vertexBuffer = null;
                self._indexBuffer = null;
                self._dirty = true;
            });
        }
    };

    /**
     * Update the mesh with new geometry data.
     *
     * Stores the geometry reference, extracts vertex/index counts, records whether
     * Uint32 indices are used, and marks the mesh as dirty so buffers are re-uploaded
     * on the next draw call.
     *
     * @param {Object} geometry - Geometry object containing vertices (Float32Array),
     *    indices (Uint16Array/Uint32Array), vertexCount, indexCount, and useUint32 flags.
     * @param {Float32Array} geometry.vertices - Vertex data array (9 floats per vertex).
     * @param {Uint16Array|Uint32Array} geometry.indices - Index buffer.
     * @param {number} geometry.vertexCount - Number of vertices.
     * @param {number} geometry.indexCount - Number of indices.
     * @param {boolean} [geometry.useUint32] - Whether indices are Uint32 (default: false).
     */
    Donkeycraft.ChunkMesh.prototype.update = function (geometry) {
        this._geometry = geometry;
        this._vertexCount = geometry.vertexCount || 0;
        this._indexCount = geometry.indexCount || 0;
        this._geometryUsesUint32 = geometry.useUint32 === true;
        this._dirty = true;
    };

    /**
     * Upload geometry data to WebGL buffers (vertex + index).
     *
     * Creates the vertex and index buffer objects if they don't exist, then uploads
     * the geometry data using `gl.DYNAMIC_DRAW` hint for frequent updates.
     * Sets `_dirty` to false after successful upload.
     *
     * @returns {boolean} True if buffers were uploaded successfully.
     */
    Donkeycraft.ChunkMesh.prototype.uploadBuffers = function () {
        var gl = this._gl;
        if (!gl || !this._geometry) {
            return false;
        }

        // Create or recreate vertex buffer.
        if (!this._vertexBuffer) {
            this._vertexBuffer = gl.createBuffer();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._geometry.vertices, gl.DYNAMIC_DRAW);

        if (!this._indexBuffer) {
            this._indexBuffer = gl.createBuffer();
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._geometry.indices, gl.DYNAMIC_DRAW);

        // Mark clean only after successful upload.
        this._dirty = false;
        return true;
    };

    /**
     * Draw the chunk mesh using the currently active shader program.
     *
     * Binds and sets up attribute pointers (aPosition, aUV, aNormal, aLight),
     * uploads buffers first if dirty or buffers don't exist yet, then issues
     * `gl.drawElements(gl.TRIANGLES, ...)` to render the chunk.
     *
     * Attribute locations are cached after the first draw call to avoid repeated
     * shader manager lookups on subsequent frames.
     *
     * @returns {boolean} True if the mesh was drawn successfully.
     */
    Donkeycraft.ChunkMesh.prototype.draw = function () {
        var gl = this._gl;

        if (!gl || this._destroyed || this._contextLost) return false;
        if (this._indexCount === 0) return false;

        // Upload buffers first if dirty or index buffer doesn't exist yet.
        // This must happen BEFORE the _indexBuffer null check above, because
        // uploadBuffers() creates the buffers on first call.
        if ((this._dirty || !this._indexBuffer || !this._vertexBuffer) && this._geometry) {
            this.uploadBuffers();
            // If upload failed (buffers still null), skip draw this frame.
            if (!this._indexBuffer || !this._vertexBuffer) return false;
        }

        if (!this._indexBuffer) return false;

        // Determine index type based on geometry data and extension support.
        var indexType = gl.UNSIGNED_SHORT;
        if (this._geometryUsesUint32) {
            if (!this._supportsUint32Indices) {
                return false;
            }
            indexType = gl.UNSIGNED_INT;
        }

        // Cache attribute locations on first draw call to avoid repeated shader manager lookups.
        // Uses null check — after first lookup, stores the actual result (-1 or >= 0).
        // Invalidates cache when the shader program changes (tracked via _cachedProgram reference).
        if (this._attrPosition === null && this._shaderManager) {
            var currentProgram = this._shaderManager._getActiveProgram();

            // Invalidate cache if the shader program has changed since last draw.
            if (currentProgram !== this._cachedProgram) {
                this._attrPosition = this._shaderManager.getAttribute('aPosition');
                this._attrLight = this._shaderManager.getAttribute('aLight');
                this._attrUV = this._shaderManager.getAttribute('aUV');
                this._attrNormal = this._shaderManager.getAttribute('aNormal');
                this._cachedProgram = currentProgram;
            }
        }

        // Bind vertex buffer and set up attribute pointers.
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);

        // Position attribute (3 floats at offset 0, stride VERTEX_BYTE_STRIDE bytes)
        var posLoc = this._attrPosition;
        if (posLoc !== null && posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, VERTEX_BYTE_STRIDE, POS_OFFSET * 4);
        }

        // Light attribute (1 float at offset LIGHT_OFFSET, stride VERTEX_BYTE_STRIDE bytes)
        var lightLoc = this._attrLight;
        if (lightLoc !== null && lightLoc >= 0) {
            gl.enableVertexAttribArray(lightLoc);
            gl.vertexAttribPointer(lightLoc, 1, gl.FLOAT, false, VERTEX_BYTE_STRIDE, LIGHT_OFFSET * 4);
        }

        // UV attribute (2 floats at offset UV_OFFSET, stride VERTEX_BYTE_STRIDE bytes)
        var uvLoc = this._attrUV;
        if (uvLoc !== null && uvLoc >= 0) {
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, VERTEX_BYTE_STRIDE, UV_OFFSET * 4);
        }

        // Normal attribute (3 floats at offset NORMAL_OFFSET, stride VERTEX_BYTE_STRIDE bytes)
        var normLoc = this._attrNormal;
        if (normLoc !== null && normLoc >= 0) {
            gl.enableVertexAttribArray(normLoc);
            gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, VERTEX_BYTE_STRIDE, NORMAL_OFFSET * 4);
        }

        // Draw using indices.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.drawElements(gl.TRIANGLES, this._indexCount, indexType, 0);

        // Disable attribute pointers (only if they were enabled, i.e., loc >= 0).
        if (posLoc !== null && posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc !== null && uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (normLoc !== null && normLoc >= 0) gl.disableVertexAttribArray(normLoc);
        if (lightLoc !== null && lightLoc >= 0) gl.disableVertexAttribArray(lightLoc);

        return true;
    };

    /**
     * Check if the mesh is dirty (needs buffer upload).
     *
     * @returns {boolean} True if buffers need updating.
     */
    Donkeycraft.ChunkMesh.prototype.isDirty = function () {
        return this._dirty;
    };

    /**
     * Mark the mesh as clean (buffers are up to date).
     *
     * Call this after a successful buffer upload to prevent redundant uploads
     * on the next draw call. Also called implicitly by `uploadBuffers()` upon success.
     */
    Donkeycraft.ChunkMesh.prototype.markClean = function () {
        this._dirty = false;
    };

    /**
     * Mark the mesh as dirty (buffers need updating).
     *
     * Call this after block data changes to trigger a buffer re-upload on the next
     * draw call. Also called implicitly by `update()` when new geometry is provided.
     */
    Donkeycraft.ChunkMesh.prototype.markDirty = function () {
        this._dirty = true;
    };

    /**
     * Get the number of indices in this mesh.
     *
     * @returns {number} Index count suitable for `gl.drawElements(count, ...)`.
     */
    Donkeycraft.ChunkMesh.prototype.getIndexCount = function () {
        return this._indexCount;
    };

    /**
     * Get the number of vertices in this mesh.
     *
     * Useful for debugging, profiling, and comparing mesh complexity between chunks.
     * Note: each vertex is 9 floats (36 bytes) in the buffer.
     *
     * @returns {number} Vertex count (each vertex is 9 floats / 36 bytes).
     */
    Donkeycraft.ChunkMesh.prototype.getVertexCount = function () {
        return this._vertexCount;
    };

    /**
     * Destroy buffers and free GPU resources.
     *
     * Sets _destroyed flag to prevent further drawing. Deletes WebGL buffer objects
     * and clears geometry data. Resets dirty flag and invalidates cached attribute
     * locations (shader program may have changed). Safe to call multiple times —
     * null checks prevent double-deletion.
     *
     * Should be called when the chunk is unloaded or the game is destroyed.
     */
    Donkeycraft.ChunkMesh.prototype.destroy = function () {
        var gl = this._gl;
        if (!gl) return;

        if (this._vertexBuffer) { gl.deleteBuffer(this._vertexBuffer); this._vertexBuffer = null; }
        if (this._indexBuffer) { gl.deleteBuffer(this._indexBuffer); this._indexBuffer = null; }

        this._geometry = null;
        this._vertexCount = 0;
        this._indexCount = 0;
        this._dirty = false;
        this._destroyed = true;

        // Invalidate cached attribute locations (shader program may have changed).
        // Reset to null so next draw call re-queries the new shader.
        this._attrPosition = null;
        this._attrLight = null;
        this._attrUV = null;
        this._attrNormal = null;
        this._cachedProgram = null;
    };

})();