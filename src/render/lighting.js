// Donkeycraft — Lighting
// Directional light (sun), ambient light, sky color computation.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Lighting — Computes sun intensity, ambient light, and sky color based on world time.
     */
    Donkeycraft.Lighting = function() {
        this._timeOfDay = 0.5; // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    };

    /**
     * Set the world time of day.
     * @param {number} t - Time value in [0, 1). 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
     */
    Donkeycraft.Lighting.prototype.setTimeOfDay = function(t) {
        // Normalize to [0, 1)
        t = t - Math.floor(t);
        if (t < 0) t += 1;
        this._timeOfDay = t;
    };

    /**
     * Get the current time of day.
     * @returns {number} Time value in [0, 1).
     */
    Donkeycraft.Lighting.prototype.getTimeOfDay = function() {
        return this._timeOfDay;
    };

    /**
     * Compute sun intensity based on time of day.
     * Returns 1.0 at noon, 0.0 at midnight.
     * @returns {number} Sun intensity in [0, 1].
     */
    Donkeycraft.Lighting.prototype.getSunIntensity = function() {
        // Sun height: at t=0.25 (sunrise) sun is at horizon, at t=0.5 (noon) overhead
        var sunHeight = Math.sin((this._timeOfDay - 0.25) * Math.PI * 2);

        // At midnight, sunHeight < 0 → intensity = 0
        if (sunHeight <= 0) return 0;

        // Sharpen: make dawn/dusk darker with power curve
        return Math.pow(sunHeight, 0.7);
    };

    /**
     * Compute ambient light level based on time of day.
     * @returns {number} Ambient intensity in [0.05, 1.0].
     */
    Donkeycraft.Lighting.prototype.getAmbientLight = function() {
        var sunIntensity = this.getSunIntensity();

        // Minimum ambient at night (0.08), full ambient at day (1.0)
        var ambient = 0.08 + 0.92 * sunIntensity;
        return Donkeycraft.clamp(ambient, 0.08, 1.0);
    };

    /**
     * Compute sky color RGB based on time of day.
     * @returns {{r: number, g: number, b: number}} Sky color components in [0, 1].
     */
    Donkeycraft.Lighting.prototype.getSkyColor = function() {
        var sunIntensity = this.getSunIntensity();

        // Day sky: light blue
        var dayR = 0.3, dayG = 0.6, dayB = 1.0;

        // Night sky: dark blue-black
        var nightR = 0.02, nightG = 0.02, nightB = 0.08;

        // Sunset/sunrise: orange/pink tint
        var sunsetR = 0.95, sunsetG = 0.55, sunsetB = 0.15;

        // Determine phase
        var t = this._timeOfDay;
        var r, g, b;

        if (t > 0.20 && t < 0.30) {
            // Sunrise transition (wider window)
            var phase = (t - 0.20) / 0.10;
            r = Donkeycraft.lerp(nightR, sunsetR, phase);
            g = Donkeycraft.lerp(nightG, sunsetG, phase);
            b = Donkeycraft.lerp(nightB, sunsetB, phase);
        } else if (t > 0.70 && t < 0.80) {
            // Sunset transition (wider window)
            var phase = (t - 0.70) / 0.10;
            r = Donkeycraft.lerp(sunsetR, nightR, phase);
            g = Donkeycraft.lerp(sunsetG, nightG, phase);
            b = Donkeycraft.lerp(sunsetB, nightB, phase);
        } else if (t >= 0.30 && t <= 0.70) {
            // Daytime
            r = dayR;
            g = dayG;
            b = dayB;
        } else {
            // Nighttime
            r = nightR;
            g = nightG;
            b = nightB;
        }

        return { r: r, g: g, b: b };
    };

    /**
     * Get sun direction vector (for directional lighting).
     * @returns {Donkeycraft.Vector3} Normalized sun direction.
     */
    Donkeycraft.Lighting.prototype.getSunDirection = function() {
        var sunAngle = (this._timeOfDay - 0.25) * Math.PI * 2;
        return new Donkeycraft.Vector3(
            Math.cos(sunAngle),
            Math.sin(sunAngle),
            0.3 // Slight Z component for variety
        ).normalized();
    };

    /**
     * Apply lighting values to a shader program via the shader manager.
     * @param {ShaderManager} shaderManager - The shader manager instance.
     */
    Donkeycraft.Lighting.prototype.applyToShader = function(shaderManager) {
        if (!shaderManager) return;

        var sunIntensity = this.getSunIntensity();
        var ambient = this.getAmbientLight();
        var skyColor = this.getSkyColor();

        // Set lighting uniforms
        shaderManager.setFloat('uSunIntensity', sunIntensity);
        shaderManager.setFloat('uAmbient', ambient);
        shaderManager.setVec3('uSkyColor', skyColor.r, skyColor.g, skyColor.b);

        // Sun direction
        var sunDir = this.getSunDirection();
        shaderManager.setVec3('uSunDirection', sunDir.x, sunDir.y, sunDir.z);
    };

})();