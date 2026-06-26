// Donkeycraft — Sky
// Sky rendering: day/night gradient, sun, moon, stars, cloud layer.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Sky — Renders the sky dome with day/night gradient.
     */
    Donkeycraft.Sky = function(gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._timeOfDay = 0.5;
        this._starsVisible = true;
        this._sunMoonVisible = true;

        this._skyDomeGeometry = null;
        this._skyDomeVertBuf = null;
        this._skyDomeIndexBuf = null;

        this._skyViewTemp = new Float32Array(16);

        this._buildSkyDome();
        this._initBuffers();
    };

    /**
     * Build a large hemisphere geometry for the sky dome.
     * @private
     */
    Donkeycraft.Sky.prototype._buildSkyDome = function() {
        var segments = 16;
        var rings = 8;
        var radius = 400;
        var vertices = [];
        var indices = [];

        for (var ring = 0; ring <= rings; ring++) {
            var phi = (ring / rings) * (Math.PI / 2);
            for (var seg = 0; seg <= segments; seg++) {
                var theta = (seg / segments) * Math.PI * 2;
                vertices.push(
                    radius * Math.sin(phi) * Math.cos(theta),
                    radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.sin(theta)
                );
            }
        }

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
            indices: new Uint16Array(indices),
            vertexCount: vertices.length / 3,
            indexCount: indices.length
        };
    };

    /**
     * Set whether stars are visible.
     * @param {boolean} visible - True to show stars.
     */
    Donkeycraft.Sky.prototype.setStarsVisible = function(visible) {
        this._starsVisible = !!visible;
    };

    /**
     * Check if stars are currently visible.
     * @returns {boolean}
     */
    Donkeycraft.Sky.prototype.getStarsVisible = function() {
        return this._starsVisible;
    };

    /**
     * Set whether sun and moon are visible in the sky.
     * @param {boolean} visible - True to show sun/moon.
     */
    Donkeycraft.Sky.prototype.setSunMoonVisible = function(visible) {
        this._sunMoonVisible = !!visible;
    };

    /**
     * Check if sun and moon are currently visible.
     * @returns {boolean}
     */
    Donkeycraft.Sky.prototype.getSunMoonVisible = function() {
        return this._sunMoonVisible;
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
     * Render the sky dome using the sky shader program.
     * Depth write is disabled so the sky doesn't occlude terrain.
     * @param {Camera} camera - The camera instance.
     * @param {Lighting} lighting - The lighting system instance.
     */
    Donkeycraft.Sky.prototype.render = function(camera, lighting) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !this._skyDomeVertBuf) return;

        if (!this._shaderManager.use('sky')) return;

        gl.depthMask(false);

        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);

        // Zero out translation to keep sky fixed at world center.
        var viewData = matrices.view.getData();
        for (var i = 0; i < 16; i++) this._skyViewTemp[i] = viewData[i];
        this._skyViewTemp[12] = 0;
        this._skyViewTemp[13] = 0;
        this._skyViewTemp[14] = 0;
        var skyViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);

        this._shaderManager.setMat4('uView', skyViewMatrix);

        // Set sky colors from lighting
        var skyColor = lighting.getSkyColor();
        var sunIntensity = lighting.getSunIntensity();

        this._shaderManager.setVec3('uTopColor',
            skyColor.r * (0.5 + 0.5 * sunIntensity),
            skyColor.g * (0.5 + 0.5 * sunIntensity),
            skyColor.b * (0.5 + 0.5 * sunIntensity)
        );

        this._shaderManager.setVec3('uBottomColor',
            skyColor.r * 0.8,
            skyColor.g * 0.8,
            skyColor.b * 0.8
        );

        this._shaderManager.setFloat('uHorizon', 0.1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyDomeVertBuf);
        var posLoc = this._shaderManager.getAttribute('aPosition');
        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 3 * 4, 0);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeIndexBuf);
        gl.drawElements(gl.TRIANGLES, this._skyDomeGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);

        // Re-enable depth writing
        gl.depthMask(true);
    };

    /**
     * Create persistent vertex and index buffers for the sky dome.
     */
    Donkeycraft.Sky.prototype._initBuffers = function() {
        var gl = this._gl;
        if (!gl || !this._skyDomeGeometry) return;

        this._skyDomeVertBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyDomeVertBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._skyDomeGeometry.vertices, gl.STATIC_DRAW);

        this._skyDomeIndexBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeIndexBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeGeometry.indices, gl.STATIC_DRAW);
    };

    /**
     * Destroy sky resources.
     */
    Donkeycraft.Sky.prototype.destroy = function() {
        var gl = this._gl;
        if (!gl) return;

        if (this._skyDomeVertBuf) { gl.deleteBuffer(this._skyDomeVertBuf); this._skyDomeVertBuf = null; }
        if (this._skyDomeIndexBuf) { gl.deleteBuffer(this._skyDomeIndexBuf); this._skyDomeIndexBuf = null; }

        this._skyDomeGeometry = null;
        this._skyViewTemp = null;
    };

})();