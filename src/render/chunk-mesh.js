// Donkeycraft — Chunk Mesh
// Per-chunk mesh object: buffer management, update methods, draw calls.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * ChunkMesh — Manages WebGL buffers for a single chunk's geometry.
     * @param {WebGLRenderingContext} gl - The WebGL rendering context.
     * @param {ShaderManager} shaderManager - The shared shader manager instance.
     */
    Donkeycraft.ChunkMesh = function(gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;

        // Buffer objects
        this._vertexBuffer = null;
        this._indexBuffer = null;

        // Geometry data
        this._vertexCount = 0;
        this._indexCount = 0;

        // Dirty flag — whether buffers need updating
        this._dirty = true;

        // Current geometry
        this._geometry = null;

        // Destroyed flag — prevents drawing after destruction
        this._destroyed = false;

        // Whether Uint32 indices are supported (OES_element_index_uint extension)
        this._supportsUint32Indices = false;
        if (gl) {
            var ext = gl.getExtension('OES_element_index_uint');
            this._supportsUint32Indices = ext !== null;
            if (!ext) {
                Donkeycraft.Logger.warn('ChunkMesh', 'OES_element_index_uint extension not available — Uint32 indices will fall back to Uint16 (max 65535 indices)');
            }
        }

        // Track whether this mesh uses Uint32 indices
        this._geometryUsesUint32 = false;
    };

    /**
     * Update the mesh with new geometry data.
     * @param {Object} geometry - Geometry object with vertices (Float32Array) and indices (Uint16Array or Uint32Array).
     */
    Donkeycraft.ChunkMesh.prototype.update = function(geometry) {
        this._geometry = geometry;
        this._vertexCount = geometry.vertexCount || 0;
        this._indexCount = geometry.indexCount || 0;
        this._geometryUsesUint32 = geometry.useUint32 === true;
        this._dirty = true;
    };

    /**
     * Upload geometry to WebGL buffers.
     */
    Donkeycraft.ChunkMesh.prototype.uploadBuffers = function() {
        var gl = this._gl;
        if (!gl || !this._geometry) return;

        // Create or recreate vertex buffer
        if (!this._vertexBuffer) {
            this._vertexBuffer = gl.createBuffer();
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._geometry.vertices, gl.DYNAMIC_DRAW);

        // Create or recreate index buffer
        if (!this._indexBuffer) {
            this._indexBuffer = gl.createBuffer();
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._geometry.indices, gl.DYNAMIC_DRAW);

        this._dirty = false;
    };

    /**
     * Draw the chunk mesh using the currently active shader program.
     * Binds attributes: aPosition, aUV, aNormal, aLight.
     * @returns {boolean} True if the mesh was drawn successfully.
     */
    Donkeycraft.ChunkMesh.prototype.draw = function() {
        var gl = this._gl;
        if (!gl || !this._indexBuffer || this._indexCount === 0) return false;

        // Guard: don't draw destroyed meshes
        if (this._destroyed) return false;

        // Upload if dirty
        if (this._dirty && this._geometry) {
            this.uploadBuffers();
        }

        // Determine index type based on geometry data and extension support
        var indexType = gl.UNSIGNED_SHORT;
        if (this._geometryUsesUint32) {
            if (this._supportsUint32Indices) {
                indexType = gl.UNSIGNED_INT;
            } else {
                // Geometry requires Uint32 but extension is unavailable — cannot draw safely
                Donkeycraft.Logger.error('ChunkMesh', 'Geometry uses Uint32 indices but OES_element_index_uint is not supported. Chunk will not render.');
                return false;
            }
        }

        // Bind vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);

        // Get attribute locations from shader manager
        var posLoc = this._shaderManager.getAttribute('aPosition');
        var uvLoc = this._shaderManager.getAttribute('aUV');
        var normLoc = this._shaderManager.getAttribute('aNormal');
        var lightLoc = this._shaderManager.getAttribute('aLight');

        var vertexSize = 9; // position(3) + UV(2) + normal(3) + light(1)

        // Position attribute (floats, stride 9*4, offset 0)
        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, vertexSize * 4, 0);
        }

        // UV attribute (floats, stride 9*4, offset 3*4)
        if (uvLoc >= 0) {
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, vertexSize * 4, 12);
        }

        // Normal attribute (floats, stride 9*4, offset 5*4)
        if (normLoc >= 0) {
            gl.enableVertexAttribArray(normLoc);
            gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, vertexSize * 4, 20);
        }

        // Light attribute (floats, stride 9*4, offset 8*4)
        if (lightLoc >= 0) {
            gl.enableVertexAttribArray(lightLoc);
            gl.vertexAttribPointer(lightLoc, 1, gl.FLOAT, false, vertexSize * 4, 32);
        }

        // Draw using indices (respect index type)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.drawElements(gl.TRIANGLES, this._indexCount, indexType, 0);

        // Disable attributes
        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (normLoc >= 0) gl.disableVertexAttribArray(normLoc);
        if (lightLoc >= 0) gl.disableVertexAttribArray(lightLoc);

        return true;
    };

    /**
     * Check if the mesh needs buffer upload.
     * @returns {boolean} True if buffers are dirty and need updating.
     */
    Donkeycraft.ChunkMesh.prototype.isDirty = function() {
        return this._dirty;
    };

    /**
     * Get the number of indices in this mesh.
     * @returns {number}
     */
    Donkeycraft.ChunkMesh.prototype.getIndexCount = function() {
        return this._indexCount;
    };

    /**
     * Get the number of vertices in this mesh.
     * @returns {number}
     */
    Donkeycraft.ChunkMesh.prototype.getVertexCount = function() {
        return this._vertexCount;
    };

    /**
     * Mark the mesh as clean (buffers are up to date).
     */
    Donkeycraft.ChunkMesh.prototype.markClean = function() {
        this._dirty = false;
    };

    /**
     * Destroy buffers and free GPU resources.
     */
    Donkeycraft.ChunkMesh.prototype.destroy = function() {
        var gl = this._gl;
        if (!gl) return;

        if (this._vertexBuffer) {
            gl.deleteBuffer(this._vertexBuffer);
            this._vertexBuffer = null;
        }

        if (this._indexBuffer) {
            gl.deleteBuffer(this._indexBuffer);
            this._indexBuffer = null;
        }

        this._geometry = null;
        this._vertexCount = 0;
        this._indexCount = 0;
        this._dirty = true;
        this._destroyed = true;
    };

})();