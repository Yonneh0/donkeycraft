// Donkeycraft — GUI Renderer
// HUD overlay: crosshair, hotbar, inventory slots, debug screen.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * GUIRenderer — Renders 2D HUD elements on top of the 3D scene.
     * @param {WebGLRenderingContext} gl - The WebGL rendering context.
     * @param {ShaderManager} shaderManager - The shared shader manager instance.
     */
    Donkeycraft.GUIRenderer = function(gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;

        // Crosshair geometry (center screen marker)
        this._crosshairGeometry = null;
        this._crosshairMesh = null;

        // Hotbar geometry
        this._hotbarGeometry = null;
        this._hotbarMesh = null;

        // Debug text geometry
        this._debugGeometry = null;
    };

    /**
     * Build crosshair geometry (small + shape at center).
     * @private
     */
    Donkeycraft.GUIRenderer.prototype._buildCrosshairGeometry = function() {
        // Two crossing lines as quads
        var lineWidth = 0.005;
        var lineLength = 0.03;

        var vertices = new Float32Array([
            // Horizontal line
            -lineLength, 0, 0,   0, 0,   1, 1, 1, 1,
             lineLength, 0, 0,   1, 0,   1, 1, 1, 1,
             lineLength, lineWidth, 0,   1, 1,   1, 1, 1, 1,
            -lineLength, lineWidth, 0,   0, 1,   1, 1, 1, 1,
            // Vertical line
            0, -lineLength, 0,   0, 0,   1, 1, 1, 1,
            lineWidth, -lineLength, 0,   1, 0,   1, 1, 1, 1,
            lineWidth, lineLength, 0,   1, 1,   1, 1, 1, 1,
            0, lineLength, 0,   0, 1,   1, 1, 1, 1
        ]);

        var indices = new Uint16Array([
            0, 1, 2,  0, 2, 3,       // horizontal
            4, 5, 6,  4, 6, 7        // vertical
        ]);

        this._crosshairGeometry = {
            vertices: vertices,
            indices: indices,
            vertexCount: 8,
            indexCount: 12
        };
    };

    /**
     * Build hotbar slot geometry (9 slots in a row).
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
            vertexCount: vertexOffset / 9,
            indexCount: indices.length
        };
    };

    /**
     * Initialize all GUI mesh buffers.
     */
    Donkeycraft.GUIRenderer.prototype._initBuffers = function() {
        var gl = this._gl;
        if (!gl) return;

        // Build geometries
        this._buildCrosshairGeometry();
        this._buildHotbarGeometry();

        // Create index buffers
        if (this._crosshairGeometry) {
            this._crosshairMesh = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._crosshairMesh);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._crosshairGeometry.indices, gl.STATIC_DRAW);
        }

        if (this._hotbarGeometry) {
            this._hotbarMesh = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._hotbarMesh);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._hotbarGeometry.indices, gl.STATIC_DRAW);
        }
    };

    /**
     * Render the crosshair at center of screen.
     * @param {number} canvasWidth - Canvas width in pixels.
     * @param {number} canvasHeight - Canvas height in pixels.
     */
    Donkeycraft.GUIRenderer.prototype.renderCrosshair = function(canvasWidth, canvasHeight) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !canvasWidth || !canvasHeight) return;

        // Use GUI shader
        if (!this._shaderManager.use('gui')) return;

        // Set orthographic projection
        var aspect = canvasWidth / canvasHeight;
        var projMatrix = Donkeycraft.Matrix4.createOrthographic(-aspect, aspect, -1, 1, -1, 1);
        this._shaderManager.setMat4('uProjection', projMatrix);
        this._shaderManager.setMat4('uView', Donkeycraft.Matrix4.createIdentity());

        // Bind crosshair geometry attributes directly
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

        // Draw crosshair
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._crosshairMesh);
        gl.drawElements(gl.TRIANGLES, this._crosshairGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

        // Disable attributes
        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Render the hotbar with selected slot highlighted.
     * @param {number} selectedSlot - Currently selected hotbar slot (0-8).
     * @param {number} canvasWidth - Canvas width in pixels.
     * @param {number} canvasHeight - Canvas height in pixels.
     */
    Donkeycraft.GUIRenderer.prototype.renderHotbar = function(selectedSlot, canvasWidth, canvasHeight) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !canvasWidth || !canvasHeight) return;

        // Use GUI shader
        if (!this._shaderManager.use('gui')) return;

        // Set orthographic projection
        var aspect = canvasWidth / canvasHeight;
        var projMatrix = Donkeycraft.Matrix4.createOrthographic(-aspect, aspect, -1, 1, -1, 1);
        this._shaderManager.setMat4('uProjection', projMatrix);
        this._shaderManager.setMat4('uView', Donkeycraft.Matrix4.createIdentity());

        // Modify hotbar vertex colors for selected slot highlight
        var vertices = new Float32Array(this._hotbarGeometry.vertices);
        var slotHeight = 0.08;
        var slotWidth = 0.08;
        var slotGap = 0.005;
        var totalWidth = 9 * (slotWidth + slotGap) - slotGap;
        var startX = -totalWidth / 2;
        var y = -0.9;

        for (var i = 0; i < 9; i++) {
            var baseVertex = i * 4;
            var colorHighlight = (i === selectedSlot) ? [0.8, 0.8, 0.8, 1] : [0.5, 0.5, 0.5, 1];

            for (var v = 0; v < 4; v++) {
                var colorBase = baseVertex * 9 + 6; // Color starts at index 6 in vertex data
                vertices[colorBase + v]     = colorHighlight[0];
                vertices[colorBase + v + 1] = colorHighlight[1];
                vertices[colorBase + v + 2] = colorHighlight[2];
                vertices[colorBase + v + 3] = colorHighlight[3];
            }
        }

        // Bind geometry attributes
        var posLoc = this._shaderManager.getAttribute('aPosition');
        var uvLoc = this._shaderManager.getAttribute('aUV');
        var colorLoc = this._shaderManager.getAttribute('aColor');

        // Upload vertex data
        var vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

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

        // Draw hotbar
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._hotbarMesh);
        gl.drawElements(gl.TRIANGLES, this._hotbarGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

        // Disable attributes
        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);

        // Delete temp buffer
        gl.deleteBuffer(vertexBuffer);
    };

    /**
     * Render debug info text overlay.
     * @param {Object} debugInfo - Debug information to display.
     * @param {number} canvasWidth - Canvas width in pixels.
     * @param {number} canvasHeight - Canvas height in pixels.
     */
    Donkeycraft.GUIRenderer.prototype.renderDebugInfo = function(debugInfo, canvasWidth, canvasHeight) {
        // For Phase 2, debug info is rendered via HTML overlay instead of WebGL text
        // This method is a placeholder for Phase 7+ GUI rendering
        if (!debugInfo || !canvasWidth || !canvasHeight) return;
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

        if (this._crosshairMesh) {
            gl.deleteBuffer(this._crosshairMesh);
            this._crosshairMesh = null;
        }

        if (this._hotbarMesh) {
            gl.deleteBuffer(this._hotbarMesh);
            this._hotbarMesh = null;
        }

        this._crosshairGeometry = null;
        this._hotbarGeometry = null;
    };

})();