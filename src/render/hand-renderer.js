// Donkeycraft — Hand Renderer
// First-person hand/item rendering in bottom-right corner.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * HandRenderer — Renders the player's held item in first-person view.
     * @param {WebGLRenderingContext} gl - The WebGL rendering context.
     * @param {ShaderManager} shaderManager - The shared shader manager instance.
     */
    Donkeycraft.HandRenderer = function(gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;

        // Item quad geometry (2 triangles forming a rectangle)
        this._itemGeometry = null;
        this._itemIndexBuf = null;

        // Persistent vertex buffer for item quad (avoids per-frame allocation)
        this._itemVertexBuf = null;

        // Current held item ID
        this._heldItemId = 1; // Default: stone
        this._bobAngle = 0;

        this._buildItemGeometry();

        // Initialize buffers immediately
        this._initBuffers();
    };

    /**
     * Build the item quad geometry.
     * @private
     */
    Donkeycraft.HandRenderer.prototype._buildItemGeometry = function() {
        // Simple quad centered at origin
        var size = 1.0;
        var half = size / 2;

        var vertices = new Float32Array([
            // Position (3) + UV (2) + Color (4) = 9 floats
            -half, -half, 0,   0, 0,   1, 1, 1, 1,
             half, -half, 0,   1, 0,   1, 1, 1, 1,
             half,  half, 0,   1, 1,   1, 1, 1, 1,
            -half,  half, 0,   0, 1,   1, 1, 1, 1
        ]);

        var indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this._itemGeometry = {
            vertices: vertices,
            indices: indices,
            vertexCount: 4,
            indexCount: 6
        };
    };

    /**
     * Set the currently held item ID.
     * @param {number} itemId - The item/block ID being held.
     */
    Donkeycraft.HandRenderer.prototype.setHeldItem = function(itemId) {
        this._heldItemId = itemId;
    };

    /**
     * Get the current held item ID.
     * @returns {number}
     */
    Donkeycraft.HandRenderer.prototype.getHeldItem = function() {
        return this._heldItemId;
    };

    /**
     * Update the bob animation angle.
     * @param {number} angle - Current bob angle in radians.
     */
    Donkeycraft.HandRenderer.prototype.setBobAngle = function(angle) {
        this._bobAngle = angle;
    };

    /**
     * Render the held item in the bottom-right corner of the screen.
     * Uses orthographic projection overlay.
     * @param {Camera} camera - The camera instance.
     * @param {number} canvasWidth - Current canvas width in pixels.
     * @param {number} canvasHeight - Current canvas height in pixels.
     */
    Donkeycraft.HandRenderer.prototype.render = function(camera, canvasWidth, canvasHeight) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !canvasWidth || !canvasHeight) return;

        // Use GUI shader for overlay rendering
        if (!this._shaderManager.use('gui')) return;

        // Set up orthographic projection for screen-space rendering
        var aspect = canvasWidth / canvasHeight;
        var projMatrix = Donkeycraft.Matrix4.createOrthographic(-aspect, aspect, -1, 1, -1, 1);
        this._shaderManager.setMat4('uProjection', projMatrix);

        // Identity view for orthographic
        var identity = Donkeycraft.Matrix4.createIdentity();
        this._shaderManager.setMat4('uView', identity);

        // Apply bob animation (subtle up/down oscillation)
        var bobY = Math.sin(this._bobAngle) * 0.05;
        var bobX = Math.cos(this._bobAngle * 0.5) * 0.02;

        // Position item in bottom-right corner (screen space)
        var itemX = 0.6 + bobX;
        var itemY = -0.4 + bobY;

        // Scale item based on canvas aspect ratio
        var scaleX = 0.3 / Math.max(aspect, 1);
        var scaleY = 0.3;

        // Build model matrix for item position and scale
        var modelMatrix = Donkeycraft.Matrix4.createTranslation(itemX, itemY, 0);
        var scaleMatrix = Donkeycraft.Matrix4.createScale(scaleX, scaleY, 1);
        modelMatrix = Donkeycraft.Matrix4.multiply(scaleMatrix, modelMatrix);

        this._shaderManager.setMat4('uModel', modelMatrix);

        // Get item color and modify vertex data for per-vertex color
        var itemColor = this._getItemColor(this._heldItemId);
        var vertices = new Float32Array(this._itemGeometry.vertices);
        for (var v = 0; v < 4; v++) {
            var ci = v * 9 + 5; // Color starts at index 5 in each 9-float vertex (pos:0-2, UV:3-4, color:5-8)
            vertices[ci]     = itemColor.r;
            vertices[ci + 1] = itemColor.g;
            vertices[ci + 2] = itemColor.b;
            vertices[ci + 3] = 1.0;
        }

        // Billboard: rotate quad to face camera (first-person view, slightly angled)
        var bobAngle = this._bobAngle;
        var itemAngle = -0.3 + Math.sin(bobAngle * 0.3) * 0.05; // Slight sway rotation
        var cosA = Math.cos(itemAngle);
        var sinA = Math.sin(itemAngle);

        for (var v2 = 0; v2 < 4; v2++) {
            var vi = v2 * 9;
            var px = vertices[vi];
            var pz = vertices[vi + 2];
            // Rotate around Y axis to billboard toward camera
            vertices[vi]     = px * cosA - pz * sinA;
            vertices[vi + 2] = px * sinA + pz * cosA;
        }

        // Bind geometry attributes directly
        var posLoc = this._shaderManager.getAttribute('aPosition');
        var uvLoc = this._shaderManager.getAttribute('aUV');
        var colorLoc = this._shaderManager.getAttribute('aColor');

        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 9 * 4, 0);
        }
        if (uvLoc >= 0) {
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 9 * 4, 12);
        }
        if (colorLoc >= 0) {
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 9 * 4, 20);
        }

        // Upload modified vertex data to persistent buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this._itemVertexBuf);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

        // Draw the item quad using persistent index buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._itemIndexBuf);
        gl.drawElements(gl.TRIANGLES, this._itemGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

        // Disable attributes
        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Get the color for a given item ID.
     * @private
     * @param {number} itemId - The item ID.
     * @returns {{r: number, g: number, b: number}} RGB color.
     */
    Donkeycraft.HandRenderer.prototype._getItemColor = function(itemId) {
        // Simple color mapping for Phase 2 testing
        switch (itemId) {
            case 1: return { r: 0.5, g: 0.5, b: 0.5 };  // stone — gray
            case 2: return { r: 0.3, g: 0.6, b: 0.2 };  // grass — green
            case 3: return { r: 0.6, g: 0.4, b: 0.2 };  // dirt — brown
            case 4: return { r: 0.8, g: 0.8, b: 0.2 };  // gold — yellow
            case 5: return { r: 0.7, g: 0.7, b: 0.8 };  // diamond — light blue
            default: return { r: 0.5, g: 0.5, b: 0.5 }; // fallback gray
        }
    };

    /**
     * Initialize item mesh buffers.
     */
    Donkeycraft.HandRenderer.prototype._initBuffers = function() {
        var gl = this._gl;
        if (!gl || !this._itemGeometry) return;

        // Create index buffer (static, never changes)
        this._itemIndexBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._itemIndexBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._itemGeometry.indices, gl.STATIC_DRAW);

        // Create persistent vertex buffer (reused every frame, updated with modified positions)
        this._itemVertexBuf = gl.createBuffer();
    };

    /**
     * Destroy hand renderer resources.
     */
    Donkeycraft.HandRenderer.prototype.destroy = function() {
        var gl = this._gl;
        if (!gl) return;

        if (this._itemIndexBuf) {
            gl.deleteBuffer(this._itemIndexBuf);
            this._itemIndexBuf = null;
        }

        if (this._itemVertexBuf) {
            gl.deleteBuffer(this._itemVertexBuf);
            this._itemVertexBuf = null;
        }

        this._itemGeometry = null;
    };

})();