// Donkeycraft — Weather
// Weather: rain particles, thunder lightning, snow, wind effects.
(function() {
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
     * Weather — Manages weather state, duration, and biome-specific restrictions.
     */
    Donkeycraft.Weather = function() {
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
    Donkeycraft.Weather.prototype.setWeather = function(state) {
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
    Donkeycraft.Weather.prototype.getWeather = function() {
        return this._weatherState;
    };

    /**
     * Check if it is currently raining.
     * @returns {boolean} True if raining.
     */
    Donkeycraft.Weather.prototype.isRaining = function() {
        return this._weatherState === Donkeycraft.WEATHER_RAIN ||
               this._weatherState === Donkeycraft.WEATHER_THUNDER;
    };

    /**
     * Check if it is currently thundering.
     * @returns {boolean} True if thundering.
     */
    Donkeycraft.Weather.prototype.isThundering = function() {
        return this._weatherState === Donkeycraft.WEATHER_THUNDER;
    };

    /**
     * Check if it is currently snowing.
     * @returns {boolean} True if snowing.
     */
    Donkeycraft.Weather.prototype.isSnowing = function() {
        return this._weatherState === Donkeycraft.WEATHER_SNOW;
    };

    /**
     * Get the remaining ticks until weather changes.
     * @returns {number} Ticks remaining.
     */
    Donkeycraft.Weather.prototype.getWeatherDuration = function() {
        return Math.max(0, this._weatherDuration - this._weatherTimer);
    };

    /**
     * Set the weather duration in ticks.
     * @param {number} duration — Duration in ticks.
     */
    Donkeycraft.Weather.prototype.setWeatherDuration = function(duration) {
        this._weatherDuration = Math.max(100, duration);
    };

    /**
     * Get the current thunder intensity [0, 1].
     * @returns {number} Thunder intensity.
     */
    Donkeycraft.Weather.prototype.getThunderIntensity = function() {
        return this._thunderIntensity;
    };

    /**
     * Set thunder intensity [0, 1].
     * @param {number} intensity — Thunder intensity.
     */
    Donkeycraft.Weather.prototype.setThunderIntensity = function(intensity) {
        this._thunderIntensity = Donkeycraft.clamp(intensity, 0, 1);
    };

    /**
     * Get the particle density [0, 1].
     * @returns {number} Particle density.
     */
    Donkeycraft.Weather.prototype.getParticleDensity = function() {
        return this._particleDensity;
    };

    /**
     * Tick the weather system — advance timer and check for weather changes.
     * @param {Object} [biomeAtPlayer] — Optional biome info for restrictions.
     */
    Donkeycraft.Weather.prototype.tick = function(biomeAtPlayer) {
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
    Donkeycraft.Weather.prototype.shouldChangeWeather = function(biomeAtPlayer) {
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
    Donkeycraft.Weather.prototype.changeToRandomWeather = function(biomeAtPlayer) {
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
            possibleStates = possibleStates.filter(function(s) {
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
    Donkeycraft.Weather.prototype.getBiomeWeather = function(biomeId) {
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
    Donkeycraft.Weather.prototype.setBiomeWeatherRestriction = function(biomeId, permissions) {
        this._biomeWeatherMap[biomeId] = permissions;
    };

    /**
     * Get weather restrictions for a biome (including custom registrations).
     * @param {number} biomeId — Biome ID.
     * @returns {{canRain: boolean, canSnow: boolean}} Weather permissions.
     */
    Donkeycraft.Weather.prototype.getBiomeWeatherRestrictions = function(biomeId) {
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
    Donkeycraft.Weather.prototype.getRandomDuration = function(state) {
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
    Donkeycraft.Weather.prototype.forceChange = function(state) {
        this.setWeather(state);
        this._weatherTimer = 0;
    };

    /**
     * Clear current weather immediately.
     */
    Donkeycraft.Weather.prototype.clear = function() {
        this.setWeather(Donkeycraft.WEATHER_CLEAR);
    };

    /**
     * Serialize weather state to a plain object.
     * @returns {{weatherState: string, weatherDuration: number, weatherTimer: number}} Serialized state.
     */
    Donkeycraft.Weather.prototype.serialize = function() {
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
    Donkeycraft.Weather.prototype.deserialize = function(data) {
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
     * Destroy the Weather instance and free resources.
     */
    Donkeycraft.Weather.prototype.destroy = function() {
        this._weatherState = Donkeycraft.WEATHER_CLEAR;
        this._weatherDuration = 0;
        this._weatherTimer = 0;
        this._thunderIntensity = 0;
        this._particleDensity = 0;
        this._biomeWeatherMap = {};
    };

})();