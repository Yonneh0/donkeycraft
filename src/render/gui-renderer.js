// Donkeycraft — GUI Renderer
// HUD overlay: crosshair, hotbar, inventory slots, debug screen.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * GUIRenderer — Renders 2D HUD elements on top of the 3D scene.
     */
    Donkeycraft.GUIRenderer = function(gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;

        // Crosshair geometry and buffers
        this._crosshairGeometry = null;
        this._crosshairVertBuf = null;
        this._crosshairIndexBuf = null;

        // Hotbar geometry and buffers
        this._hotbarGeometry = null;
        this._hotbarIndexBuf = null;
        this._hotbarVertexBuf = null;

        // Cached orthographic projection (avoids per-frame allocation)
        this._projMatrixCache = null;
        this._lastAspect = null;

        // Reusable hotbar vertex data for color updates
        this._hotbarColorBuffer = null;

        // Initialize buffers immediately
        this._initBuffers();
    };

    /**
     * Build crosshair geometry (small + shape at center).
     * Two crossing line quads with position(3) + UV(2) + color(4) = 9 floats per vertex.
     * @private
     */
    Donkeycraft.GUIRenderer.prototype._buildCrosshairGeometry = function() {
        var lineWidth = 0.005;
        var lineLength = 0.03;

        var vertices = new Float32Array([
            // Horizontal line — 4 vertices × 9 floats
            -lineLength, 0, 0,   0, 0,   1, 1, 1, 1,
             lineLength, 0, 0,   1, 0,   1, 1, 1, 1,
             lineLength, lineWidth, 0,   1, 1,   1, 1, 1, 1,
            -lineLength, lineWidth, 0,   0, 1,   1, 1, 1, 1,
            // Vertical line — 4 vertices × 9 floats
            0, -lineLength, 0,   0, 0,   1, 1, 1, 1,
            lineWidth, -lineLength, 0,   1, 0,   1, 1, 1, 1,
            lineWidth, lineLength, 0,   1, 1,   1, 1, 1, 1,
            0, lineLength, 0,   0, 1,   1, 1, 1, 1
        ]);

        var indices = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);

        this._crosshairGeometry = {
            vertices: vertices,
            indices: indices,
            vertexCount: 8,
            indexCount: 12
        };
    };

    /**
     * Build hotbar slot geometry (9 slots in a row).
     * Each slot is a quad with position(3) + UV(2) + Color(4) = 9 floats per vertex.
     * @private
     */
    Donkeycraft.GUIRenderer.prototype._buildHotbarGeometry = function() {
        var slotWidth = 0.08;
        var slotHeight = 0.08;
        var slotGap = 0.005;
        var totalWidth = 9 * (slotWidth + slotGap) - slotGap;
        var startX = -totalWidth / 2;
        var y = -0.9;

        var vertices = [];
        var indices = [];
        var vertexOffset = 0;

        for (var i = 0; i < 9; i++) {
            var x = startX + i * (slotWidth + slotGap);

            // Quad vertices: position(3) + UV(2) + Color(4)
            vertices.push(
                x, y, 0,   0, 0,   0.5, 0.5, 0.5, 1,
                x + slotWidth, y, 0,   1, 0,   0.5, 0.5, 0.5, 1,
                x + slotWidth, y + slotHeight, 0,   1, 1,   0.5, 0.5, 0.5, 1,
                x, y + slotHeight, 0,   0, 1,   0.5, 0.5, 0.5, 1
            );

            indices.push(
                vertexOffset, vertexOffset + 1, vertexOffset + 2,
                vertexOffset, vertexOffset + 2, vertexOffset + 3
            );
            vertexOffset += 4;
        }

        this._hotbarGeometry = {
            vertices: new Float32Array(vertices),
            indices: new Uint16Array(indices),
            vertexCount: vertexOffset,
            indexCount: indices.length
        };
    };

    /**
     * Initialize all GUI mesh buffers.
     */
    Donkeycraft.GUIRenderer.prototype._initBuffers = function() {
        var gl = this._gl;
        if (!gl) return;

        // Build geometries first (in case they haven't been created yet)
        this._buildCrosshairGeometry();
        this._buildHotbarGeometry();

        // Create crosshair buffers
        if (this._crosshairGeometry) {
            this._crosshairVertBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._crosshairVertBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._crosshairGeometry.vertices, gl.STATIC_DRAW);

            this._crosshairIndexBuf = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._crosshairIndexBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._crosshairGeometry.indices, gl.STATIC_DRAW);
        }

        // Create hotbar buffers
        if (this._hotbarGeometry) {
            this._hotbarVertexBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._hotbarVertexBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._hotbarGeometry.vertices, gl.STATIC_DRAW);

            this._hotbarIndexBuf = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._hotbarIndexBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._hotbarGeometry.indices, gl.STATIC_DRAW);
        }
    };

    /**
     * Get or create a cached orthographic projection matrix.
     * @private
     */
    Donkeycraft.GUIRenderer.prototype._getCachedProjMatrix = function(canvasWidth, canvasHeight) {
        var aspect = canvasWidth / canvasHeight;
        if (this._projMatrixCache && this._lastAspect === aspect) {
            return this._projMatrixCache;
        }
        this._projMatrixCache = Donkeycraft.Matrix4.createOrthographic(-aspect, aspect, -1, 1, -1, 1);
        this._lastAspect = aspect;
        return this._projMatrixCache;
    };

    /**
     * Render the crosshair at center of screen.
     * @param {number} canvasWidth - Canvas width in pixels.
     * @param {number} canvasHeight - Canvas height in pixels.
     */
    Donkeycraft.GUIRenderer.prototype.renderCrosshair = function(canvasWidth, canvasHeight) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !canvasWidth || !canvasHeight || !this._crosshairVertBuf) return;

        if (!this._shaderManager.use('gui')) return;

        // Orthographic projection (cached)
        var projMatrix = this._getCachedProjMatrix(canvasWidth, canvasHeight);
        this._shaderManager.setMat4('uProjection', projMatrix);
        this._shaderManager.setMat4('uView', Donkeycraft.Matrix4.createIdentity());

        // Bind persistent vertex buffer for crosshair
        gl.bindBuffer(gl.ARRAY_BUFFER, this._crosshairVertBuf);

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

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._crosshairIndexBuf);
        gl.drawElements(gl.TRIANGLES, this._crosshairGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Render the hotbar with selected slot highlighted.
     * Modifies vertex colors for the selected slot highlight, then uploads to persistent buffer.
     * @param {number} selectedSlot - Currently selected hotbar slot (0-8).
     * @param {number} canvasWidth - Canvas width in pixels.
     * @param {number} canvasHeight - Canvas height in pixels.
     */
    Donkeycraft.GUIRenderer.prototype.renderHotbar = function(selectedSlot, canvasWidth, canvasHeight) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !canvasWidth || !canvasHeight) return;

        // Lazy buffer init — create buffers if context was lost and restored
        if (!this._hotbarVertexBuf || !this._hotbarIndexBuf) {
            this._initBuffers();
        }
        if (!this._hotbarVertexBuf || !this._hotbarIndexBuf) return;

        if (!this._shaderManager.use('gui')) return;

        // Orthographic projection (cached)
        var projMatrix = this._getCachedProjMatrix(canvasWidth, canvasHeight);
        this._shaderManager.setMat4('uProjection', projMatrix);
        this._shaderManager.setMat4('uView', Donkeycraft.Matrix4.createIdentity());

        // Reusable color buffer to avoid per-frame allocation
        if (!this._hotbarColorBuffer || this._hotbarColorBuffer.length !== this._hotbarGeometry.vertices.length) {
            this._hotbarColorBuffer = new Float32Array(this._hotbarGeometry.vertices.length);
        }
        var vertices = this._hotbarColorBuffer;
        vertices.set(this._hotbarGeometry.vertices);

        var highlightColor = (selectedSlot >= 0 && selectedSlot < 9) ? [0.8, 0.8, 0.8, 1] : [0.5, 0.5, 0.5, 1];
        var defaultColor = [0.5, 0.5, 0.5, 1];

        for (var i = 0; i < 9; i++) {
            var color = (i === selectedSlot) ? highlightColor : defaultColor;
            var baseVertex = i * 4;
            for (var v = 0; v < 4; v++) {
                var ci = (baseVertex + v) * 9 + 5;
                vertices[ci]     = color[0];
                vertices[ci + 1] = color[1];
                vertices[ci + 2] = color[2];
                vertices[ci + 3] = color[3];
            }
        }

        // Upload modified vertex data to persistent buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this._hotbarVertexBuf);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

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

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._hotbarIndexBuf);
        gl.drawElements(gl.TRIANGLES, this._hotbarGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Render debug info text overlay.
     * For Phase 2, this is a no-op — HTML overlay handles debug display.
     * @param {Object} debugInfo - Debug information to display.
     * @param {number} canvasWidth - Canvas width in pixels.
     * @param {number} canvasHeight - Canvas height in pixels.
     */
    Donkeycraft.GUIRenderer.prototype.renderDebugInfo = function(debugInfo, canvasWidth, canvasHeight) {
        // Phase 2: debug info rendered via HTML overlay (no WebGL needed yet)
    };

    /**
     * Render all GUI elements in correct order.
     * @param {Object} state - Current GUI state.
     * @param {number} canvasWidth - Canvas width in pixels.
     * @param {number} canvasHeight - Canvas height in pixels.
     */
    Donkeycraft.GUIRenderer.prototype.renderAll = function(state, canvasWidth, canvasHeight) {
        state = state || {};

        // 1. Hotbar (bottom layer)
        if (state.hotbar !== false) {
            this.renderHotbar(state.selectedSlot || 0, canvasWidth, canvasHeight);
        }

        // 2. Crosshair (top layer)
        if (state.crosshair !== false) {
            this.renderCrosshair(canvasWidth, canvasHeight);
        }
    };

    /**
     * Destroy GUI renderer resources.
     */
    Donkeycraft.GUIRenderer.prototype.destroy = function() {
        var gl = this._gl;
        if (!gl) return;

        if (this._crosshairVertBuf) { gl.deleteBuffer(this._crosshairVertBuf); this._crosshairVertBuf = null; }
        if (this._crosshairIndexBuf) { gl.deleteBuffer(this._crosshairIndexBuf); this._crosshairIndexBuf = null; }
        if (this._hotbarVertexBuf) { gl.deleteBuffer(this._hotbarVertexBuf); this._hotbarVertexBuf = null; }
        if (this._hotbarIndexBuf) { gl.deleteBuffer(this._hotbarIndexBuf); this._hotbarIndexBuf = null; }

        this._crosshairGeometry = null;
        this._hotbarGeometry = null;
    };

})();