// Donkeycraft — Sky
// Sky rendering: day/night gradient, sun, moon, stars, cloud layer.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Sky — Renders the sky dome with gradients, sun, moon, and stars.
     */
    Donkeycraft.Sky = function(gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._timeOfDay = 0.5;
        this._showStars = true;
        this._showSun = true;

        // Sky dome geometry (simple hemisphere)
        this._skyDomeGeometry = null;
        this._skyDomeMesh = null;

        this._buildSkyDome();
    };

    /**
     * Build a simple sky dome geometry (large hemisphere).
     * @private
     */
    Donkeycraft.Sky.prototype._buildSkyDome = function() {
        var segments = 16;
        var rings = 8;
        var radius = 400;
        var vertices = [];
        var indices = [];
        var uvs = [];

        // Generate hemisphere vertices (upper half)
        for (var ring = 0; ring <= rings; ring++) {
            var phi = (ring / rings) * (Math.PI / 2); // 0 to PI/2
            for (var seg = 0; seg <= segments; seg++) {
                var theta = (seg / segments) * Math.PI * 2;

                var x = radius * Math.sin(phi) * Math.cos(theta);
                var y = radius * Math.cos(phi);
                var z = radius * Math.sin(phi) * Math.sin(theta);

                vertices.push(x, y, z);
                uvs.push(seg / segments, ring / rings);
            }
        }

        // Generate indices
        for (var ring = 0; ring < rings; ring++) {
            for (var seg = 0; seg < segments; seg++) {
                var first = ring * (segments + 1) + seg;
                var second = first + segments + 1;
                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        this._skyDomeGeometry = {
            vertices: new Float32Array(vertices),
            uvs: new Float32Array(uvs),
            indices: new Uint16Array(indices),
            vertexCount: vertices.length / 3,
            indexCount: indices.length
        };
    };

    /**
     * Set the time of day (0-1).
     * @param {number} t - Time value in [0, 1).
     */
    Donkeycraft.Sky.prototype.setTimeOfDay = function(t) {
        this._timeOfDay = t - Math.floor(t);
        if (this._timeOfDay < 0) this._timeOfDay += 1;
    };

    /**
     * Get the current time of day.
     * @returns {number}
     */
    Donkeycraft.Sky.prototype.getTimeOfDay = function() {
        return this._timeOfDay;
    };

    /**
     * Show or hide stars.
     * @param {boolean} show - True to show stars.
     */
    Donkeycraft.Sky.prototype.setStarsVisible = function(show) {
        this._showStars = show;
    };

    /**
     * Show or hide sun/moon.
     * @param {boolean} show - True to show sun/moon.
     */
    Donkeycraft.Sky.prototype.setSunMoonVisible = function(show) {
        this._showSun = show;
    };

    /**
     * Render the sky dome using the sky shader program.
     * @param {Camera} camera - The camera instance.
     * @param {Lighting} lighting - The lighting system instance.
     */
    Donkeycraft.Sky.prototype.render = function(camera, lighting) {
        var gl = this._gl;
        if (!gl || !this._shaderManager) return;

        // Use sky shader program
        if (!this._shaderManager.use('sky')) return;

        // Get matrices from camera
        var matrices = camera.getMatrices();

        // Set projection and view (sky uses rotation-only view)
        this._shaderManager.setMat4('uProjection', matrices.projection);

        // Copy view matrix but zero out translation for sky
        var viewData = matrices.view.getData();
        var skyViewData = new Float32Array(viewData);
        skyViewData[12] = 0; skyViewData[13] = 0; skyViewData[14] = 0; skyViewData[15] = 1;
        var skyViewMatrix = new Donkeycraft.Matrix4(skyViewData);
        this._shaderManager.setMat4('uView', skyViewMatrix);

        // Set sky colors from lighting
        var skyColor = lighting.getSkyColor();
        var sunIntensity = lighting.getSunIntensity();

        // Top color (tinted by sun intensity)
        this._shaderManager.setVec3('uTopColor',
            skyColor.r * (0.5 + 0.5 * sunIntensity),
            skyColor.g * (0.5 + 0.5 * sunIntensity),
            skyColor.b * (0.5 + 0.5 * sunIntensity)
        );

        // Bottom color (horizon)
        this._shaderManager.setVec3('uBottomColor',
            skyColor.r * 0.8,
            skyColor.g * 0.8,
            skyColor.b * 0.8
        );

        // Horizon line position
        this._shaderManager.setFloat('uHorizon', 0.1);

        // Bind geometry attributes (reuse geometry data directly)
        var posLoc = this._shaderManager.getAttribute('aPosition');
        var uvLoc = this._shaderManager.getAttribute('aUV');

        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        }
        if (uvLoc >= 0) {
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
        }

        // Draw sky dome
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeMesh);
        gl.drawElements(gl.TRIANGLES, this._skyDomeGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

        // Disable attributes
        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
    };

    /**
     * Initialize sky dome buffers.
     */
    Donkeycraft.Sky.prototype._initBuffers = function() {
        var gl = this._gl;
        if (!gl || !this._skyDomeGeometry) return;

        // For Phase 2, use simple buffer approach
        // Store index buffer reference
        this._skyDomeMesh = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeMesh);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeGeometry.indices, gl.STATIC_DRAW);
    };

    /**
     * Destroy sky resources.
     */
    Donkeycraft.Sky.prototype.destroy = function() {
        var gl = this._gl;
        if (!gl) return;

        if (this._skyDomeMesh) {
            gl.deleteBuffer(this._skyDomeMesh);
            this._skyDomeMesh = null;
        }

        this._skyDomeGeometry = null;
    };

})();