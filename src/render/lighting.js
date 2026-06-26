// Donkeycraft — Lighting
// Directional light (sun), ambient light, sky color computation.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Lighting — Computes sun intensity, ambient light, and sky color based on world time of day.
     */
    Donkeycraft.Lighting = function() {
        this._timeOfDay = 0.5;
    };

    /**
     * Set the world time of day.
     * @param {number} t - Time value in [0, 1). 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
     */
    Donkeycraft.Lighting.prototype.setTimeOfDay = function(t) {
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
        var sunHeight = Math.sin((this._timeOfDay - 0.25) * Math.PI * 2);
        return sunHeight > 0 ? Math.pow(sunHeight, 0.7) : 0;
    };

    /**
     * Compute ambient light level based on time of day.
     * @returns {number} Ambient intensity in [0.08, 1.0].
     */
    Donkeycraft.Lighting.prototype.getAmbientLight = function() {
        return Donkeycraft.clamp(0.08 + 0.92 * this.getSunIntensity(), 0.08, 1.0);
    };

    /**
     * Compute sky color RGB based on time of day.
     * @returns {{r: number, g: number, b: number}} Sky color components in [0, 1].
     */
    Donkeycraft.Lighting.prototype.getSkyColor = function() {
        var t = this._timeOfDay;
        var sunIntensity = this.getSunIntensity();

        // Color keyframes
        if (t > 0.20 && t < 0.30) {
            var phase = (t - 0.20) / 0.10;
            return {
                r: Donkeycraft.lerp(0.02, 0.95, phase),
                g: Donkeycraft.lerp(0.02, 0.55, phase),
                b: Donkeycraft.lerp(0.08, 0.15, phase)
            };
        }
        if (t > 0.70 && t < 0.80) {
            var phase = (t - 0.70) / 0.10;
            return {
                r: Donkeycraft.lerp(0.95, 0.02, phase),
                g: Donkeycraft.lerp(0.55, 0.02, phase),
                b: Donkeycraft.lerp(0.15, 0.08, phase)
            };
        }
        if (t >= 0.30 && t <= 0.70) {
            return { r: 0.3, g: 0.6, b: 1.0 }; // Day
        }
        return { r: 0.02, g: 0.02, b: 0.08 }; // Night
    };

    /**
     * Get sun direction vector for directional lighting.
     * @returns {Donkeycraft.Vector3} Normalized sun direction.
     */
    Donkeycraft.Lighting.prototype.getSunDirection = function() {
        var sunAngle = (this._timeOfDay - 0.25) * Math.PI * 2;
        return new Donkeycraft.Vector3(
            Math.cos(sunAngle),
            Math.sin(sunAngle),
            0.3
        ).normalized();
    };

    /**
     * Apply lighting uniforms to a shader program via the shader manager.
     * Sets: uSunIntensity (float), uAmbient (float), uSkyColor (vec3), uSunDirection (vec3).
     * @param {ShaderManager} shaderManager - The shader manager instance.
     * @returns {boolean} True if uniforms were set successfully.
     */
    Donkeycraft.Lighting.prototype.applyToShader = function(shaderManager) {
        if (!shaderManager) return false;

        var sunIntensity = this.getSunIntensity();
        var skyColor = this.getSkyColor();
        var sunDir = this.getSunDirection();

        shaderManager.setFloat('uSunIntensity', sunIntensity);
        shaderManager.setFloat('uAmbient', this.getAmbientLight());
        shaderManager.setVec3('uSkyColor', skyColor.r, skyColor.g, skyColor.b);
        shaderManager.setVec3('uSunDirection', sunDir.x, sunDir.y, sunDir.z);
        return true;
    };

})();
