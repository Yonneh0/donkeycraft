// Donkeycraft — Weather
// Weather system: state management, particle rendering (rain/snow), thunder/lightning.
// Weather state and duration are managed by the Weather class; rendering is handled by WeatherRenderer.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Weather states.
     */
    Donkeycraft.WEATHER_CLEAR = 'clear';
    Donkeycraft.WEATHER_RAIN = 'rain';
    Donkeycraft.WEATHER_THUNDER = 'thunder';
    Donkeycraft.WEATHER_SNOW = 'snow';

    /**
     * Weather — Manages weather state, duration, thunder intensity, and biome-specific restrictions.
     * Does NOT handle rendering — that is done by WeatherRenderer.
     */
    Donkeycraft.Weather = function () {
        this._weatherState = Donkeycraft.WEATHER_CLEAR;
        this._weatherDuration = 0;
        this._weatherTimer = 0;
        this._thunderIntensity = 0;
        this._particleDensity = 0;
        this._biomeWeatherMap = {};
    };

    /**
     * Set the current weather state.
     * @param {string} state — Weather state ('clear', 'rain', 'thunder', 'snow').
     */
    Donkeycraft.Weather.prototype.setWeather = function (state) {
        var validStates = [
            Donkeycraft.WEATHER_CLEAR,
            Donkeycraft.WEATHER_RAIN,
            Donkeycraft.WEATHER_THUNDER,
            Donkeycraft.WEATHER_SNOW
        ];
        if (validStates.indexOf(state) === -1) {
            state = Donkeycraft.WEATHER_CLEAR;
        }

        // Thunder must follow rain
        if (state === Donkeycraft.WEATHER_THUNDER && this._weatherState !== Donkeycraft.WEATHER_RAIN) {
            state = Donkeycraft.WEATHER_RAIN;
        }

        this._weatherState = state;
        this._weatherDuration = this.getRandomDuration(state);
        this._weatherTimer = 0;

        // Set particle density based on weather type
        switch (state) {
            case Donkeycraft.WEATHER_CLEAR:
                this._particleDensity = 0;
                this._thunderIntensity = 0;
                break;
            case Donkeycraft.WEATHER_RAIN:
                this._particleDensity = 0.5;
                this._thunderIntensity = 0;
                break;
            case Donkeycraft.WEATHER_THUNDER:
                this._particleDensity = 0.8;
                this._thunderIntensity = 1.0;
                break;
            case Donkeycraft.WEATHER_SNOW:
                this._particleDensity = 0.3;
                this._thunderIntensity = 0;
                break;
        }
    };

    /**
     * Get the current weather state.
     * @returns {string} Weather state.
     */
    Donkeycraft.Weather.prototype.getWeather = function () {
        return this._weatherState;
    };

    /**
     * Check if it is currently raining.
     * @returns {boolean} True if raining.
     */
    Donkeycraft.Weather.prototype.isRaining = function () {
        return this._weatherState === Donkeycraft.WEATHER_RAIN ||
            this._weatherState === Donkeycraft.WEATHER_THUNDER;
    };

    /**
     * Check if it is currently thundering.
     * @returns {boolean} True if thundering.
     */
    Donkeycraft.Weather.prototype.isThundering = function () {
        return this._weatherState === Donkeycraft.WEATHER_THUNDER;
    };

    /**
     * Check if it is currently snowing.
     * @returns {boolean} True if snowing.
     */
    Donkeycraft.Weather.prototype.isSnowing = function () {
        return this._weatherState === Donkeycraft.WEATHER_SNOW;
    };

    /**
     * Get the remaining ticks until weather changes.
     * @returns {number} Ticks remaining.
     */
    Donkeycraft.Weather.prototype.getWeatherDuration = function () {
        return Math.max(0, this._weatherDuration - this._weatherTimer);
    };

    /**
     * Set the weather duration in ticks.
     * @param {number} duration — Duration in ticks.
     */
    Donkeycraft.Weather.prototype.setWeatherDuration = function (duration) {
        this._weatherDuration = Math.max(100, duration);
    };

    /**
     * Get the current thunder intensity [0, 1].
     * @returns {number} Thunder intensity.
     */
    Donkeycraft.Weather.prototype.getThunderIntensity = function () {
        return this._thunderIntensity;
    };

    /**
     * Set thunder intensity [0, 1].
     * @param {number} intensity — Thunder intensity.
     */
    Donkeycraft.Weather.prototype.setThunderIntensity = function (intensity) {
        this._thunderIntensity = Donkeycraft.clamp(intensity, 0, 1);
    };

    /**
     * Get the particle density [0, 1].
     * @returns {number} Particle density.
     */
    Donkeycraft.Weather.prototype.getParticleDensity = function () {
        return this._particleDensity;
    };

    /**
     * Tick the weather system — advance timer and check for weather changes.
     * @param {Object} [biomeAtPlayer] — Optional biome info for restrictions.
     */
    Donkeycraft.Weather.prototype.tick = function (biomeAtPlayer) {
        this._weatherTimer++;

        // Thunder intensity fluctuation
        if (this._weatherState === Donkeycraft.WEATHER_THUNDER) {
            this._thunderIntensity = 0.7 + Math.random() * 0.3;
        }

        // Check for weather change
        if (this._weatherTimer >= this._weatherDuration) {
            if (this.shouldChangeWeather(biomeAtPlayer)) {
                this.changeToRandomWeather(biomeAtPlayer);
            } else {
                // Extend current weather
                this._weatherDuration = this.getRandomDuration(this._weatherState);
                this._weatherTimer = 0;
            }
        }
    };

    /**
     * Determine if weather should change.
     * @param {Object} [biomeAtPlayer] — Optional biome info for restrictions.
     * @returns {boolean} True if weather should change.
     */
    Donkeycraft.Weather.prototype.shouldChangeWeather = function (biomeAtPlayer) {
        // If it's been at least 100 ticks, allow random change
        if (this._weatherTimer < 100) {
            return false;
        }

        // Desert biomes never get rain/snow
        if (biomeAtPlayer && biomeAtPlayer.isDesert) {
            if (this._weatherState === Donkeycraft.WEATHER_RAIN ||
                this._weatherState === Donkeycraft.WEATHER_THUNDER ||
                this._weatherState === Donkeycraft.WEATHER_SNOW) {
                return true; // Force change away from invalid weather
            }
        }

        // 5% chance each tick after minimum duration
        return Math.random() < 0.05;
    };

    /**
     * Change to a random weather state (respecting biome restrictions).
     * @param {Object} [biomeAtPlayer] — Optional biome info for restrictions.
     */
    Donkeycraft.Weather.prototype.changeToRandomWeather = function (biomeAtPlayer) {
        var possibleStates = [
            Donkeycraft.WEATHER_CLEAR,
            Donkeycraft.WEATHER_RAIN,
            Donkeycraft.WEATHER_SNOW
        ];

        // Thunder can only follow rain
        if (this._weatherState === Donkeycraft.WEATHER_RAIN ||
            this._weatherState === Donkeycraft.WEATHER_THUNDER) {
            possibleStates.push(Donkeycraft.WEATHER_THUNDER);
        }

        // Filter out biome-incompatible weather
        var isDesert = biomeAtPlayer && biomeAtPlayer.isDesert;
        if (isDesert) {
            possibleStates = possibleStates.filter(function (s) {
                return s !== Donkeycraft.WEATHER_RAIN &&
                    s !== Donkeycraft.WEATHER_THUNDER &&
                    s !== Donkeycraft.WEATHER_SNOW;
            });
        }

        // Weighted random selection
        var weights = [0.6, 0.25, 0.1]; // clear, rain, snow
        if (isDesert) {
            weights = [0.95, 0.05, 0]; // mostly clear in desert
        }

        var totalWeight = 0;
        for (var i = 0; i < possibleStates.length; i++) {
            totalWeight += weights[i] || 0;
        }

        var roll = Math.random() * totalWeight;
        var cumulative = 0;
        for (var j = 0; j < possibleStates.length; j++) {
            cumulative += weights[j] || 0;
            if (roll <= cumulative) {
                this.setWeather(possibleStates[j]);
                return;
            }
        }

        // Fallback to clear
        this.setWeather(Donkeycraft.WEATHER_CLEAR);
    };

    /**
     * Get biome-specific weather restrictions.
     * @param {number} biomeId — Biome ID.
     * @returns {{canRain: boolean, canSnow: boolean}} Weather permissions.
     */
    Donkeycraft.Weather.prototype.getBiomeWeather = function (biomeId) {
        // Default: all weather allowed
        var result = { canRain: true, canSnow: true };

        // Desert biomes (ID 2) never get rain or snow
        if (biomeId === 2) {
            result.canRain = false;
            result.canSnow = false;
        }

        // Ocean biomes (ID 6) rarely get snow
        if (biomeId === 6) {
            result.canSnow = false;
        }

        return result;
    };

    /**
     * Register a biome's weather restrictions.
     * @param {number} biomeId — Biome ID.
     * @param {{canRain: boolean, canSnow: boolean}} permissions — Weather permissions.
     */
    Donkeycraft.Weather.prototype.setBiomeWeatherRestriction = function (biomeId, permissions) {
        this._biomeWeatherMap[biomeId] = permissions;
    };

    /**
     * Get weather restrictions for a biome (including custom registrations).
     * @param {number} biomeId — Biome ID.
     * @returns {{canRain: boolean, canSnow: boolean}} Weather permissions.
     */
    Donkeycraft.Weather.prototype.getBiomeWeatherRestrictions = function (biomeId) {
        if (this._biomeWeatherMap[biomeId]) {
            return this._biomeWeatherMap[biomeId];
        }
        return this.getBiomeWeather(biomeId);
    };

    /**
     * Get a random weather duration in ticks based on weather type.
     * @param {string} state — Weather state.
     * @returns {number} Duration in ticks [6000, 120000].
     * @private
     */
    Donkeycraft.Weather.prototype.getRandomDuration = function (state) {
        var minDuration, maxDuration;

        switch (state) {
            case Donkeycraft.WEATHER_CLEAR:
                minDuration = 6000;   // 5 minutes
                maxDuration = 120000; // 100 minutes
                break;
            case Donkeycraft.WEATHER_RAIN:
            case Donkeycraft.WEATHER_THUNDER:
                minDuration = 6000;
                maxDuration = 48000;  // 40 minutes
                break;
            case Donkeycraft.WEATHER_SNOW:
                minDuration = 12000;
                maxDuration = 72000;  // 60 minutes
                break;
            default:
                minDuration = 6000;
                maxDuration = 48000;
        }

        return minDuration + Math.floor(Math.random() * (maxDuration - minDuration));
    };

    /**
     * Force a weather change immediately.
     * @param {string} state — Target weather state.
     */
    Donkeycraft.Weather.prototype.forceChange = function (state) {
        this.setWeather(state);
        this._weatherTimer = 0;
    };

    /**
     * Clear current weather immediately.
     */
    Donkeycraft.Weather.prototype.clear = function () {
        this.setWeather(Donkeycraft.WEATHER_CLEAR);
    };

    /**
     * Serialize weather state to a plain object.
     * @returns {{weatherState: string, weatherDuration: number, weatherTimer: number}} Serialized state.
     */
    Donkeycraft.Weather.prototype.serialize = function () {
        return {
            weatherState: this._weatherState,
            weatherDuration: this._weatherDuration,
            weatherTimer: this._weatherTimer
        };
    };

    /**
     * Deserialize from a plain object.
     * @param {Object} data — Serialized state.
     * @returns {Donkeycraft.Weather} This instance for chaining.
     */
    Donkeycraft.Weather.prototype.deserialize = function (data) {
        if (data) {
            if (typeof data.weatherState === 'string') {
                this._weatherState = data.weatherState;
            }
            if (typeof data.weatherDuration === 'number') {
                this._weatherDuration = data.weatherDuration;
            }
            if (typeof data.weatherTimer === 'number') {
                this._weatherTimer = data.weatherTimer;
            }
        }
        return this;
    };

    /**
     * WeatherRenderer — Renders weather particles (rain, snow) using the GUI shader program.
     * Particles are billboard quads that respawn when they fall below y=0 or move too far from the player.
     * @param {WebGLRenderingContext} gl - WebGL context.
     * @param {ShaderManager} shaderManager - Shader manager instance.
     */
    Donkeycraft.WeatherRenderer = function (gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._maxParticles = 2000;
        this._particleCount = 0;
        this._active = false;

        // Particle data arrays (Structure of Arrays for performance)
        this._px = new Float32Array(this._maxParticles);
        this._py = new Float32Array(this._maxParticles);
        this._pz = new Float32Array(this._maxParticles);
        this._pvx = new Float32Array(this._maxParticles);
        this._pvy = new Float32Array(this._maxParticles);
        this._pvz = new Float32Array(this._maxParticles);
        this._pAlpha = new Float32Array(this._maxParticles);

        // Vertex buffer for particle positions (position(3) + color(4) = 9 floats per vertex)
        this._vertexBuffer = null;
        this._vertexArray = null;
        this._contextLost = false;

        if (gl && gl.canvas) {
            var self = this;
            gl.canvas.addEventListener('webglcontextlost', function (e) {
                e.preventDefault();
                self._contextLost = true;
                self._vertexBuffer = null;
            });
            gl.canvas.addEventListener('webglcontextrestored', function () {
                self._contextLost = false;
                self._vertexBuffer = null;
            });
        }
    };

    /**
     * Activate weather rendering. Resets particle count so spawnInitialParticles() will repopulate.
     * @returns {void}
     */
    Donkeycraft.WeatherRenderer.prototype.activate = function () {
        if (this._active) return; // Already active — avoid resetting
        this._active = true;
        this._particleCount = 0;
    };

    /**
     * Deactivate weather rendering and clear all particles.
     * @returns {void}
     */
    Donkeycraft.WeatherRenderer.prototype.deactivate = function () {
        this._active = false;
        this._particleCount = 0;
    };

    /**
     * Spawn a single weather particle at the given position.
     * Particles start with alpha=0 and fade in to avoid sudden popping.
     * @private
     */
    Donkeycraft.WeatherRenderer.prototype._spawnParticle = function (x, y, z, type) {
        if (this._particleCount >= this._maxParticles) return;

        var i = this._particleCount;
        this._px[i] = x;
        this._py[i] = y;
        this._pz[i] = z;

        if (type === 'snow') {
            // Snow falls slowly and drifts
            this._pvx[i] = (Math.random() - 0.5) * 0.5;
            this._pvy[i] = -0.5 - Math.random() * 0.5;
            this._pvz[i] = (Math.random() - 0.5) * 0.5;
            // Start fully faded out — fade-in happens during update
            this._pAlpha[i] = 0;
        } else {
            // Rain falls fast with slight wind
            this._pvx[i] = (Math.random() - 0.5) * 0.3;
            this._pvy[i] = -8 - Math.random() * 4;
            this._pvz[i] = (Math.random() - 0.5) * 0.3 + 0.5; // wind toward +Z
            // Start fully faded out — fade-in happens during update
            this._pAlpha[i] = 0;
        }

        this._particleCount++;
    };

    /**
     * Update weather particles by delta time. Respawn particles that fall below y=0 or move too far from player.
     * Particles fade in over 0.3s after spawning to eliminate popping.
     * @param {number} deltaTime - Time since last frame in seconds.
     * @param {{x:number,y:number,z:number}} playerPos - Player position for particle culling.
     * @returns {void}
     */
    Donkeycraft.WeatherRenderer.prototype.update = function (deltaTime, playerPos) {
        if (!this._active || this._particleCount === 0) return;

        var removed = 0;

        for (var i = 0; i < this._particleCount; i++) {
            var idx = i - removed;

            // Fade-in: particles that spawn with alpha=0 gradually reach full opacity over ~0.3s.
            if (this._pAlpha[idx] < 1) {
                this._pAlpha[idx] += deltaTime * 5; // ~0.2s to full opacity
                if (this._pAlpha[idx] > 1) this._pAlpha[idx] = 1;
            }

            // Update position
            this._px[idx] += this._pvx[idx] * deltaTime;
            this._py[idx] += this._pvy[idx] * deltaTime;
            this._pz[idx] += this._pvz[idx] * deltaTime;

            // Remove particles that fall below y = 0 or are too far from player
            if (this._py[idx] < 0) {
                // Respawn at top of render area with alpha=0 for fade-in
                this._py[idx] = 128;
                this._px[idx] = playerPos.x + (Math.random() - 0.5) * 120;
                this._pz[idx] = playerPos.z + (Math.random() - 0.5) * 120;
                this._pAlpha[idx] = 0;
            }

            var dx = this._px[idx] - playerPos.x;
            var dz = this._pz[idx] - playerPos.z;
            if (dx * dx + dz * dz > 60 * 60) {
                // Respawn closer to player with alpha=0 for fade-in
                this._py[idx] = 128;
                this._px[idx] = playerPos.x + (Math.random() - 0.5) * 120;
                this._pz[idx] = playerPos.z + (Math.random() - 0.5) * 120;
                this._pAlpha[idx] = 0;
            }
        }
    };

    /**
     * Render weather particles as billboard quads using the GUI shader program.
     * Depth write is disabled so particles render as translucent overlays on terrain.
     * @param {Camera} camera - The camera instance.
     * @param {number} particleDensity - Particle density multiplier [0, 1].
     * @param {string} type - Particle type ('rain' or 'snow').
     * @returns {boolean} True if particles were rendered.
     */
    Donkeycraft.WeatherRenderer.prototype.render = function (camera, particleDensity, type) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !this._active || this._particleCount === 0) return;

        if (this._contextLost) return;

        if (!this._shaderManager.use('gui')) return;

        // Disable depth writes so weather particles render on top of terrain (translucent overlay).
        gl.depthMask(false);

        try {
            var matrices = camera.getMatrices();
            this._shaderManager.setMat4('uProjection', matrices.projection);
            this._shaderManager.setMat4('uView', matrices.view);
            this._shaderManager.setMat4('uModel', Donkeycraft.Matrix4.createIdentity());
            this._shaderManager.setInt('uHasTexture', 0);

            var right = camera.getRight();
            var up = camera.getUp();

            // Build vertex data: each particle is a quad (6 vertices)
            var particleSize = type === 'snow' ? 0.15 : 0.03;
            var vertsPerParticle = 6;
            var floatsPerVertex = 9;
            var totalFloats = this._particleCount * vertsPerParticle * floatsPerVertex;

            if (!this._vertexArray || this._vertexArray.length < totalFloats) {
                this._vertexArray = new Float32Array(totalFloats);
            }
            var vertices = this._vertexArray;

            for (var i = 0; i < this._particleCount; i++) {
                var px = this._px[i];
                var py = this._py[i];
                var pz = this._pz[i];
                var alpha = this._pAlpha[i] * particleDensity;

                // Billboard quad (always faces camera)
                var rx = right.x * particleSize, ry = right.y * particleSize, rz = right.z * particleSize;
                var ux = up.x * particleSize, uy = up.y * particleSize, uz = up.z * particleSize;

                // Four corners of the quad
                var blx = px - rx - ux, bly = py - ry - uy, blz = pz - rz - uz;
                var brx = px + rx - ux, bry = py + ry - uy, brz = pz + rz - uz;
                var trx = px + rx + ux, topRightY = py + ry + uy, trz = pz + rz + uz;
                var tlx = px - rx + ux, tly = py - ry + uy, tlz = pz - rz + uz;

                // Color based on particle type
                var r, g, b;
                if (type === 'snow') {
                    r = 0.95; g = 0.95; b = 1.0;
                } else {
                    r = 0.6; g = 0.7; b = 0.9;
                }

                var base = i * vertsPerParticle * floatsPerVertex;

                // Bottom-left
                vertices[base] = blx; vertices[base + 1] = bly; vertices[base + 2] = blz;
                vertices[base + 3] = 0; vertices[base + 4] = 0;
                vertices[base + 5] = r; vertices[base + 6] = g; vertices[base + 7] = b; vertices[base + 8] = alpha;
                // Bottom-right
                vertices[base + 9] = brx; vertices[base + 10] = bry; vertices[base + 11] = brz;
                vertices[base + 12] = 1; vertices[base + 13] = 0;
                vertices[base + 14] = r; vertices[base + 15] = g; vertices[base + 16] = b; vertices[base + 17] = alpha;
                // Top-right
                vertices[base + 18] = trx; vertices[base + 19] = topRightY; vertices[base + 20] = trz;
                vertices[base + 21] = 1; vertices[base + 22] = 1;
                vertices[base + 23] = r; vertices[base + 24] = g; vertices[base + 25] = b; vertices[base + 26] = alpha;
                // Bottom-left (duplicate for second triangle)
                vertices[base + 27] = blx; vertices[base + 28] = bly; vertices[base + 29] = blz;
                vertices[base + 30] = 0; vertices[base + 31] = 0;
                vertices[base + 32] = r; vertices[base + 33] = g; vertices[base + 34] = b; vertices[base + 35] = alpha;
                // Top-right (duplicate)
                vertices[base + 36] = trx; vertices[base + 37] = topRightY; vertices[base + 38] = trz;
                vertices[base + 39] = 1; vertices[base + 40] = 1;
                vertices[base + 41] = r; vertices[base + 42] = g; vertices[base + 43] = b; vertices[base + 44] = alpha;
                // Top-left
                vertices[base + 45] = tlx; vertices[base + 46] = tly; vertices[base + 47] = tlz;
                vertices[base + 48] = 0; vertices[base + 49] = 1;
                vertices[base + 50] = r; vertices[base + 51] = g; vertices[base + 52] = b; vertices[base + 53] = alpha;
            }

            // Upload vertex data to GPU
            if (!this._vertexBuffer) {
                this._vertexBuffer = gl.createBuffer();
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, totalFloats), gl.DYNAMIC_DRAW);

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

            var totalVertices = this._particleCount * vertsPerParticle;
            gl.drawArrays(gl.TRIANGLES, 0, totalVertices);
        } finally {
            // Always restore depth writes, even on error.
            gl.depthMask(true);
        }

        // Disable attribute pointers (after try/finally to ensure state cleanup).
        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Spawn initial particles with random positions across the render area.
     * All particles start with alpha=0 and fade in during update() to prevent popping.
     * @param {number} [count=500] - Number of particles to spawn (capped at maxParticles).
     * @returns {void}
     */
    Donkeycraft.WeatherRenderer.prototype.spawnInitialParticles = function (count) {
        count = Math.min(count || 500, this._maxParticles);

        // Spawn all particles at alpha=0 — fade-in happens during update().
        for (var i = 0; i < count; i++) {
            this._px[i] = (Math.random() - 0.5) * 120;
            this._py[i] = Math.random() * 128;
            this._pz[i] = (Math.random() - 0.5) * 120;
            this._pAlpha[i] = 0;
        }

        this._particleCount = count;
    };

    /**
     * Get the current active particle count.
     * @returns {number} Active particle count.
     */
    Donkeycraft.WeatherRenderer.prototype.getParticleCount = function () {
        return this._particleCount;
    };

    /**
     * Destroy weather renderer resources and free GPU memory.
     * Cleans up vertex buffer and resets all particle data arrays.
     */
    Donkeycraft.WeatherRenderer.prototype.destroy = function () {
        var gl = this._gl;

        // Delete GPU buffer (only if context is still valid).
        if (this._vertexBuffer && gl && !this._contextLost) {
            try { gl.deleteBuffer(this._vertexBuffer); } catch (e) { /* already deleted */ }
            this._vertexBuffer = null;
        }

        // Null all particle data arrays to free memory.
        this._px = null;
        this._py = null;
        this._pz = null;
        this._pvx = null;
        this._pvy = null;
        this._pvz = null;
        this._pAlpha = null;
        this._vertexArray = null;

        // Reset state.
        this._particleCount = 0;
        this._active = false;
        this._contextLost = true;
    };

    /**
     * Rebuild GPU buffers after a WebGL context restore event.
     * Buffers are lazily recreated on next render call via null checks — no explicit rebuild needed.
     * @private
     * @returns {void}
     */
    Donkeycraft.WeatherRenderer.prototype._rebuildBuffers = function () {
        // Buffers are lazily recreated on next render call via null checks —
        // no explicit rebuild needed since geometry is per-frame dynamic data.
    };

    /**
     * Destroy the Weather instance and reset all state to defaults.
     * Does NOT destroy WeatherRenderer — that is a separate class.
     * @returns {void}
     */
    Donkeycraft.Weather.prototype.destroy = function () {
        this._weatherState = Donkeycraft.WEATHER_CLEAR;
        this._weatherDuration = 0;
        this._weatherTimer = 0;
        this._thunderIntensity = 0;
        this._particleDensity = 0;
        this._biomeWeatherMap = {};
    };

})();
