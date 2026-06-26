// Donkeycraft — Fog
// Distance fog rendering with time-based color.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Fog — Distance fog rendering with time-based color.
     */
    Donkeycraft.Fog = function() {
        this._density = 0.015;
        this._enabled = true;
        this._color = { r: 0.6, g: 0.7, b: 0.9 };
    };

    /**
     * Set fog density.
     * @param {number} density - Fog density value (higher = denser fog).
     */
    Donkeycraft.Fog.prototype.setDensity = function(density) {
        this._density = density;
    };

    /**
     * Get the current fog density.
     * @returns {number} Fog density value.
     */
    Donkeycraft.Fog.prototype.getDensity = function() {
        return this._density;
    };

    /**
     * Enable or disable fog rendering.
     * @param {boolean} enabled - True to enable fog.
     */
    Donkeycraft.Fog.prototype.setEnabled = function(enabled) {
        this._enabled = enabled;
    };

    /**
     * Check if fog is enabled.
     * @returns {boolean}
     */
    Donkeycraft.Fog.prototype.isEnabled = function() {
        return this._enabled;
    };

    /**
     * Set fog color.
     * @param {number} r - Red component [0, 1].
     * @param {number} g - Green component [0, 1].
     * @param {number} b - Blue component [0, 1].
     */
    Donkeycraft.Fog.prototype.setColor = function(r, g, b) {
        this._color.r = r;
        this._color.g = g;
        this._color.b = b;
    };

    /**
     * Get the current fog color.
     * @returns {{r: number, g: number, b: number}}
     */
    Donkeycraft.Fog.prototype.getColor = function() {
        return this._color;
    };

    /**
     * Update fog color based on lighting sky color.
     * @param {{r: number, g: number, b: number}} skyColor - Sky color from Lighting system.
     */
    Donkeycraft.Fog.prototype.updateFromSky = function(skyColor) {
        this._color.r = skyColor.r;
        this._color.g = skyColor.g;
        this._color.b = skyColor.b;
    };

    /**
     * Apply fog uniforms to a shader program via the shader manager.
     * Sets: uFogColor (vec3), uFogDensity (float).
     * @param {ShaderManager} shaderManager - The shader manager instance.
     * @returns {boolean} True if uniforms were set successfully.
     */
    Donkeycraft.Fog.prototype.applyToFogUniforms = function(shaderManager) {
        if (!shaderManager || !this._enabled) return false;

        return shaderManager.setVec3('uFogColor', this._color.r, this._color.g, this._color.b) &&
               shaderManager.setFloat('uFogDensity', this._density);
    };

})();