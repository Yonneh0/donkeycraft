// Donkeycraft — Sky
// Sky rendering: day/night gradient, sun disc, moon disc, and star field.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Sky — Renders the sky dome with day/night gradient, sun disc, moon disc, and star field.
     * All elements are rendered as overlays on top of terrain using depthMask(false).
     * @param {WebGLRenderingContext} gl - The WebGL 1 rendering context.
     * @param {Donkeycraft.ShaderManager} shaderManager - The shader manager instance.
     */
    Donkeycraft.Sky = function (gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._timeOfDay = 0.5;
        this._starsVisible = true;
        this._sunMoonVisible = true;

        // Sky dome geometry and buffers
        this._skyDomeGeometry = null;
        this._skyDomeVertBuf = null;
        this._skyDomeIndexBuf = null;

        // Sun disc geometry and buffers
        this._sunGeometry = null;
        this._sunVertBuf = null;
        this._sunIndexBuf = null;
        this._sunColorBuffer = null; // Reusable vertex buffer for sun color data

        // Moon disc geometry and buffers
        this._moonGeometry = null;
        this._moonVertBuf = null;
        this._moonIndexBuf = null;
        this._moonColorBuffer = null; // Reusable vertex buffer for moon color data

        // Star field geometry and buffers
        this._starCount = 500;
        this._starGeometry = null;
        this._starVertBuf = null;

        // View matrix transform for sky dome (zeroed translation)
        this._skyViewTemp = new Float32Array(16);

        // Build geometry and initialize buffers
        this._buildSkyDome();
        this._buildSunDisc();
        this._buildMoonDisc();
        this._buildStarField();
        this._initBuffers();
    };

    /**
     * Build a large hemisphere geometry for the sky dome.
     * Uses 16 segments × 8 rings for smooth curvature with minimal vertices.
     * @private
     * @returns {void}
     */
    Donkeycraft.Sky.prototype._buildSkyDome = function () {
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
     * Build a small disc geometry for the sun (13 vertices: 1 center + 12 perimeter).
     * @private
     * @returns {void}
     */
    Donkeycraft.Sky.prototype._buildSunDisc = function () {
        var segments = 12;
        var radius = 8;
        var vertices = [0, radius, 0]; // center

        for (var i = 0; i <= segments; i++) {
            var angle = (i / segments) * Math.PI * 2;
            vertices.push(radius * Math.cos(angle), radius * Math.sin(angle), 0);
        }

        var indices = [];
        for (var i = 1; i <= segments; i++) {
            indices.push(0, i, i + 1);
        }

        this._sunGeometry = {
            vertices: new Float32Array(vertices),
            indices: new Uint16Array(indices),
            vertexCount: vertices.length / 3,
            indexCount: indices.length
        };
    };

    /**
     * Build a small disc geometry for the moon (13 vertices: 1 center + 12 perimeter).
     * @private
     * @returns {void}
     */
    Donkeycraft.Sky.prototype._buildMoonDisc = function () {
        var segments = 12;
        var radius = 5;
        var vertices = [0, radius, 0]; // center

        for (var i = 0; i <= segments; i++) {
            var angle = (i / segments) * Math.PI * 2;
            vertices.push(radius * Math.cos(angle), radius * Math.sin(angle), 0);
        }

        var indices = [];
        for (var i = 1; i <= segments; i++) {
            indices.push(0, i, i + 1);
        }

        this._moonGeometry = {
            vertices: new Float32Array(vertices),
            indices: new Uint16Array(indices),
            vertexCount: vertices.length / 3,
            indexCount: indices.length
        };
    };

    /**
     * Build a star field as point sprites using a seeded PRNG for reproducible positions.
     * Stars are distributed only on the upper hemisphere (sky visible above horizon).
     * Each vertex includes position(3) + color(4) = 7 floats with white RGB and variable alpha.
     * @private
     * @returns {void}
     */
    Donkeycraft.Sky.prototype._buildStarField = function () {
        var starData = [];
        var seed = 42;

        // Simple seeded PRNG for reproducible star positions
        function seededRandom() {
            seed = (seed * 16807 + 0) % 2147483647;
            return (seed - 1) / 2147483646;
        }

        for (var i = 0; i < this._starCount; i++) {
            // Random position on upper hemisphere
            var theta = seededRandom() * Math.PI * 2;
            var phi = seededRandom() * (Math.PI / 2); // only upper hemisphere
            var r = 390;

            starData.push(
                r * Math.sin(phi) * Math.cos(theta), // x
                r * Math.cos(phi),                    // y
                r * Math.sin(phi) * Math.sin(theta), // z
                1.0,                                   // color r (white)
                1.0,                                   // color g
                1.0,                                   // color b
                0.8 + seededRandom() * 0.2            // color a (0.8-1.0 brightness)
            );
        }

        this._starGeometry = {
            data: new Float32Array(starData),
            count: this._starCount,
            floatsPerVertex: 7 // position(3) + color(4)
        };
    };

    /**
     * Set whether stars are visible.
     * @param {boolean} visible - True to show stars.
     */
    Donkeycraft.Sky.prototype.setStarsVisible = function (visible) {
        this._starsVisible = !!visible;
    };

    /**
     * Check if stars are currently visible.
     * @returns {boolean} True if stars are enabled.
     */
    Donkeycraft.Sky.prototype.getStarsVisible = function () {
        return this._starsVisible;
    };

    /**
     * Set whether sun and moon are visible in the sky.
     * @param {boolean} visible - True to show sun/moon.
     */
    Donkeycraft.Sky.prototype.setSunMoonVisible = function (visible) {
        this._sunMoonVisible = !!visible;
    };

    /**
     * Check if sun and moon are currently visible.
     * @returns {boolean} True if sun/moon rendering is enabled.
     */
    Donkeycraft.Sky.prototype.getSunMoonVisible = function () {
        return this._sunMoonVisible;
    };

    /**
     * Set the time of day (0-1). Normalizes to [0, 1) range.
     * @param {number} t - Time value (any number, normalized internally).
     */
    Donkeycraft.Sky.prototype.setTimeOfDay = function (t) {
        this._timeOfDay = t - Math.floor(t);
        if (this._timeOfDay < 0) this._timeOfDay += 1;
    };

    /**
     * Get the current time of day.
     * @returns {number} Time value in [0, 1).
     */
    Donkeycraft.Sky.prototype.getTimeOfDay = function () {
        return this._timeOfDay;
    };

    /**
     * Render the sun disc at the given position using solid color rendering.
     * Uses a persistent vertex buffer with per-vertex color data (position(3) + unused(2) + color(4)).
     * Depth write is disabled so the sun renders on top of terrain without corrupting depth.
     * @private
     * @param {Donkeycraft.Camera} camera - The camera instance.
     * @param {Donkeycraft.Vector3} sunDir - Normalized sun direction vector.
     * @param {number} sunIntensity - Sun intensity (0-1) for alpha and color brightness.
     * @returns {boolean} True if rendered successfully.
     */
    Donkeycraft.Sky.prototype._renderSunDisc = function (camera, sunDir, sunIntensity) {
        var gl = this._gl;
        if (!gl || !this._sunVertBuf || !this._sunIndexBuf) return false;

        // Build a model matrix: translate to sun position + scale.
        var sunPos = new Donkeycraft.Vector3(
            sunDir.x * 350,
            Math.max(sunDir.y * 350, 10),
            sunDir.z * 350
        );

        var translateMatrix = Donkeycraft.Matrix4.createTranslation(sunPos.x, sunPos.y, sunPos.z);
        var scaleMatrix = Donkeycraft.Matrix4.createScale(16, 16, 1);
        var modelMatrix = Donkeycraft.Matrix4.multiply(translateMatrix, scaleMatrix);

        // Use the sky shader — it supports uModel for sun/moon positioning.
        if (!this._shaderManager.use('sky')) {
            gl.depthMask(true);
            return false;
        }

        // Sun color: bright yellow-white, intensity-based alpha
        var r = 1.0, g = 0.95, b = 0.7, a = sunIntensity;

        // Build vertex data with per-vertex color (position(3) + uv(2) unused + color(4))
        var verts = this._sunGeometry.vertices;
        var vertCount = this._sunGeometry.vertexCount;
        var totalFloats = vertCount * 9;

        if (!this._sunColorBuffer || this._sunColorBuffer.length < totalFloats) {
            this._sunColorBuffer = new Float32Array(totalFloats);
        }
        var buf = this._sunColorBuffer;

        for (var i = 0; i < vertCount; i++) {
            var base = i * 9;
            buf[base] = verts[base];     // position x
            buf[base + 1] = verts[base + 1]; // position y
            buf[base + 2] = verts[base + 2]; // position z
            buf[base + 3] = 0;               // uv u (unused)
            buf[base + 4] = 0;               // uv v (unused)
            buf[base + 5] = r;               // color r
            buf[base + 6] = g;               // color g
            buf[base + 7] = b;               // color b
            buf[base + 8] = a;               // color a
        }

        try {
            // Disable depth write so sun renders on top of terrain without corrupting depth buffer.
            gl.depthMask(false);

            // Set camera matrices — sky shader needs uProjection/uView for proper positioning.
            var camData = camera.getMatrices();
            this._shaderManager.setMat4('uProjection', camData.projection);

            // Zero out view translation to keep sun at world position (no camera-relative offset).
            for (var _si = 0; _si < 16; _si++) this._skyViewTemp[_si] = camData.view.getData()[_si];
            this._skyViewTemp[12] = 0;
            this._skyViewTemp[13] = 0;
            this._skyViewTemp[14] = 0;
            var sunViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);
            this._shaderManager.setMat4('uView', sunViewMatrix);

            // Set model matrix for sun position + scale.
            this._shaderManager.setMat4('uModel', modelMatrix);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._sunVertBuf);
            gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, totalFloats), gl.DYNAMIC_DRAW);

            var posLoc = this._shaderManager.getAttribute('aPosition');
            var colorLoc = this._shaderManager.getAttribute('aColor');

            if (posLoc >= 0) {
                gl.enableVertexAttribArray(posLoc);
                gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 9 * 4, 0);
            }
            // UV is unused for sun — skip enabling it
            if (colorLoc >= 0) {
                gl.enableVertexAttribArray(colorLoc);
                gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 9 * 4, 20);
            }

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._sunIndexBuf);
            gl.drawElements(gl.TRIANGLES, this._sunGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

            if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
            if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
        } finally {
            // Always restore depth write state.
            gl.depthMask(true);
        }
    };

    /**
     * Render the moon disc at the given position using solid color rendering.
     * Moon is positioned opposite the sun direction.
     * Uses a persistent vertex buffer with per-vertex color data (position(3) + unused(2) + color(4)).
     * Depth write is disabled so the moon renders on top of terrain without corrupting depth.
     * @private
     * @param {Donkeycraft.Camera} camera - The camera instance.
     * @param {Donkeycraft.Vector3} moonDir - Normalized moon direction vector.
     * @returns {boolean} True if rendered successfully.
     */
    Donkeycraft.Sky.prototype._renderMoonDisc = function (camera, moonDir) {
        var gl = this._gl;
        if (!gl || !this._moonVertBuf || !this._moonIndexBuf) return false;

        // Moon is opposite the sun
        var moonPos = new Donkeycraft.Vector3(
            moonDir.x * 350,
            Math.max(moonDir.y * 350, 10),
            moonDir.z * 350
        );

        var translateMatrix = Donkeycraft.Matrix4.createTranslation(moonPos.x, moonPos.y, moonPos.z);
        var scaleMatrix = Donkeycraft.Matrix4.createScale(10, 10, 1);
        var modelMatrix = Donkeycraft.Matrix4.multiply(translateMatrix, scaleMatrix);

        // Use the sky shader — it now supports uModel and aColor for sun/moon.
        if (!this._shaderManager.use('sky')) {
            gl.depthMask(true);
            return false;
        }

        // Moon color: pale silver
        var r = 0.8, g = 0.82, b = 0.9, a = 1.0;

        // Build vertex data with per-vertex color (position(3) + uv(2) unused + color(4))
        var verts = this._moonGeometry.vertices;
        var vertCount = this._moonGeometry.vertexCount;
        var totalFloats = vertCount * 9;

        if (!this._moonColorBuffer || this._moonColorBuffer.length < totalFloats) {
            this._moonColorBuffer = new Float32Array(totalFloats);
        }
        var buf = this._moonColorBuffer;

        for (var i = 0; i < vertCount; i++) {
            var base = i * 9;
            buf[base] = verts[base];
            buf[base + 1] = verts[base + 1];
            buf[base + 2] = verts[base + 2];
            buf[base + 3] = 0;
            buf[base + 4] = 0;
            buf[base + 5] = r;
            buf[base + 6] = g;
            buf[base + 7] = b;
            buf[base + 8] = a;
        }

        try {
            // Disable depth write so moon renders on top of terrain without corrupting depth buffer.
            gl.depthMask(false);

            // Set camera matrices — sky shader needs uProjection/uView for proper positioning.
            var camData2 = camera.getMatrices();
            this._shaderManager.setMat4('uProjection', camData2.projection);

            // Zero out view translation to keep moon at world position (no camera-relative offset).
            for (var _mi = 0; _mi < 16; _mi++) this._skyViewTemp[_mi] = camData2.view.getData()[_mi];
            this._skyViewTemp[12] = 0;
            this._skyViewTemp[13] = 0;
            this._skyViewTemp[14] = 0;
            var moonViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);
            this._shaderManager.setMat4('uView', moonViewMatrix);

            // Set model matrix for moon position + scale.
            this._shaderManager.setMat4('uModel', modelMatrix);

            // Enable color overlay so fragment shader uses per-vertex color instead of gradient.
            this._shaderManager.setInt('uHasColorOverlay', 1);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._moonVertBuf);
            gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, totalFloats), gl.DYNAMIC_DRAW);

            var posLoc = this._shaderManager.getAttribute('aPosition');
            var colorLoc = this._shaderManager.getAttribute('aColor');

            if (posLoc >= 0) {
                gl.enableVertexAttribArray(posLoc);
                gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 9 * 4, 0);
            }
            if (colorLoc >= 0) {
                gl.enableVertexAttribArray(colorLoc);
                gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 9 * 4, 20);
            }

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._moonIndexBuf);
            gl.drawElements(gl.TRIANGLES, this._moonGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

            if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
            if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
        } finally {
            // Always restore depth write state.
            gl.depthMask(true);
        }
    };

    /**
     * Render the star field as point sprites using the sky shader with per-vertex color.
     * Stars are rendered as gl.POINTS with position(3) + color(4) interleaved at 7 floats/vertex.
     * Depth write must be disabled so stars render as translucent overlays on terrain.
     * @private
     * @returns {boolean} True if rendered successfully.
     */
    Donkeycraft.Sky.prototype._renderStars = function () {
        var gl = this._gl;
        if (!gl || !this._starVertBuf || !this._starGeometry) return;

        gl.bindBuffer(gl.ARRAY_BUFFER, this._starVertBuf);

        var posLoc = this._shaderManager.getAttribute('aPosition');
        var colorLoc = this._shaderManager.getAttribute('aColor');

        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, this._starGeometry.floatsPerVertex * 4, 0);
        }
        if (colorLoc >= 0) {
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, this._starGeometry.floatsPerVertex * 4, 12);
        }

        // Render as points (one per star).
        gl.drawArrays(gl.POINTS, 0, this._starGeometry.count);

        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Render the sky dome, sun, moon, and stars using the sky shader program.
     * Depth write is disabled for the dome so terrain renders on top.
     * Face culling is disabled because the camera is inside the sky dome —
     * outward-facing triangles would otherwise be culled as back-faces.
     * uHasColorOverlay is reset to 0 after sun/moon rendering to ensure stars use default gradient passthrough.
     * @param {Donkeycraft.Camera} camera - The camera instance.
     * @param {Lighting} lighting - The lighting system instance.
     */
    Donkeycraft.Sky.prototype.render = function (camera, lighting) {
        var gl = this._gl;
        if (!gl || !this._shaderManager) return;

        // ---- Sky dome (always drawn first, depth write disabled) ----
        gl.depthMask(false);

        // CRITICAL: Disable face culling — camera is inside the sky dome.
        // Outward-facing normals + inside camera = all triangles appear as back-faces
        // and would be culled by gl.CULL_FACE, making the sky invisible.
        var cullWasEnabled = gl.isContextLost ? false : gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);

        if (!this._shaderManager.use('sky')) {
            // CRITICAL: Always restore depth writes even on shader failure.
            // If we return with depthMask(false), terrain/particles/hand/GUI
            // cannot write to the depth buffer and will silently depth-fail.
            gl.depthMask(true);
            return;
        }

        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);

        // Zero out view translation to keep sky fixed at world center.
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

        // Draw sky dome — only aPosition is needed since uHasColorOverlay=0 uses gradient.
        // The aColor attribute will have default [0,0,0,1] when not enabled, which is fine
        // because the fragment shader ignores vColor when uHasColorOverlay=0.
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyDomeVertBuf);
        var posLoc = this._shaderManager.getAttribute('aPosition');

        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 3 * 4, 0);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeIndexBuf);
        gl.drawElements(gl.TRIANGLES, this._skyDomeGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);

        // Restore face culling for terrain rendering (sky is opaque at this point).
        if (cullWasEnabled) gl.enable(gl.CULL_FACE);

        // ---- Sun disc (visible during day) — translucent overlay, depth write disabled ----
        if (this._sunMoonVisible && sunIntensity > 0.1) {
            var sunDir = lighting.getSunDirection();
            this._renderSunDisc(camera, sunDir, sunIntensity);
        }

        // ---- Moon disc (visible at night or twilight — translucent overlay) ----
        if (this._sunMoonVisible && sunIntensity < 0.8) {
            var sunD = lighting.getSunDirection();
            var moonDir = new Donkeycraft.Vector3(-sunD.x, -sunD.y, -sunD.z).normalized();
            this._renderMoonDisc(camera, moonDir);
        }

        // Reset color overlay flag after sun/moon rendering so stars use default gradient passthrough.
        // Always reset regardless of whether stars are visible.
        this._shaderManager.setInt('uHasColorOverlay', 0);

        // ---- Stars (visible at night, translucent point sprites — disable depth write) ----
        if (this._starsVisible && sunIntensity < 0.3 && this._starVertBuf) {
            gl.depthMask(false);

            // Re-ensure sky shader is active for stars (uses same aPosition + aColor attributes).
            if (!this._shaderManager.use('sky')) {
                gl.depthMask(true);
                return;
            }

            var starMatrices = camera.getMatrices();
            this._shaderManager.setMat4('uProjection', starMatrices.projection);

            // Zero out view translation for stars (keep sky fixed at world center).
            for (var i = 0; i < 16; i++) this._skyViewTemp[i] = starMatrices.view.getData()[i];
            this._skyViewTemp[12] = 0;
            this._skyViewTemp[13] = 0;
            this._skyViewTemp[14] = 0;
            var starViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);
            this._shaderManager.setMat4('uView', starViewMatrix);
            this._shaderManager.setMat4('uModel', Donkeycraft.Matrix4.createIdentity());

            // Enable color overlay so stars render with their per-vertex white/bright colors
            // instead of the sky gradient.
            this._shaderManager.setInt('uHasColorOverlay', 1);

            this._renderStars();
            gl.depthMask(true);
        }
    };

    /**
     * Create persistent vertex and index buffers for all sky elements.
     * Called once during construction after geometry is built.
     */
    Donkeycraft.Sky.prototype._initBuffers = function () {
        var gl = this._gl;
        if (!gl) return;

        // Sky dome
        if (this._skyDomeGeometry) {
            this._skyDomeVertBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._skyDomeVertBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._skyDomeGeometry.vertices, gl.STATIC_DRAW);

            this._skyDomeIndexBuf = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeIndexBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeGeometry.indices, gl.STATIC_DRAW);
        }

        // Sun disc
        if (this._sunGeometry) {
            this._sunVertBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._sunVertBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._sunGeometry.vertices, gl.STATIC_DRAW);

            this._sunIndexBuf = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._sunIndexBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._sunGeometry.indices, gl.STATIC_DRAW);
        }

        // Moon disc
        if (this._moonGeometry) {
            this._moonVertBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._moonVertBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._moonGeometry.vertices, gl.STATIC_DRAW);

            this._moonIndexBuf = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._moonIndexBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._moonGeometry.indices, gl.STATIC_DRAW);
        }

        // Star field (points) — use the new interleaved format: position(3) + color(4) = 7 floats/vertex.
        if (this._starGeometry && this._starGeometry.data) {
            this._starVertBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._starVertBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._starGeometry.data, gl.STATIC_DRAW);
        }
    };

    /**
     * Destroy sky resources and free GPU memory.
     * Deletes all WebGL buffers and nulls internal geometry references.
     */
    Donkeycraft.Sky.prototype.destroy = function () {
        var gl = this._gl;
        if (!gl) return;

        if (this._skyDomeVertBuf) { gl.deleteBuffer(this._skyDomeVertBuf); this._skyDomeVertBuf = null; }
        if (this._skyDomeIndexBuf) { gl.deleteBuffer(this._skyDomeIndexBuf); this._skyDomeIndexBuf = null; }
        if (this._sunVertBuf) { gl.deleteBuffer(this._sunVertBuf); this._sunVertBuf = null; }
        if (this._sunIndexBuf) { gl.deleteBuffer(this._sunIndexBuf); this._sunIndexBuf = null; }
        if (this._moonVertBuf) { gl.deleteBuffer(this._moonVertBuf); this._moonVertBuf = null; }
        if (this._moonIndexBuf) { gl.deleteBuffer(this._moonIndexBuf); this._moonIndexBuf = null; }
        if (this._starVertBuf) { gl.deleteBuffer(this._starVertBuf); this._starVertBuf = null; }

        this._skyDomeGeometry = null;
        this._sunGeometry = null;
        this._moonGeometry = null;
        this._starGeometry = null;
        this._skyViewTemp = null;
        this._sunColorBuffer = null;
        this._moonColorBuffer = null;
    };

})();
