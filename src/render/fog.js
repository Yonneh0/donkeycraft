// Donkeycraft — Fog
// Distance fog rendering with time-based color.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * Fog — Distance fog rendering with time-based color and underwater mode.
   */
  Donkeycraft.Fog = function () {
    this._density = 0.015;
    this._enabled = true;
    this._color = { r: 0.6, g: 0.7, b: 0.9 };

    // Underwater mode — activated when camera is submerged
    this._underwater = false;
    this._underwaterDensity = 0.05; // ~3× normal fog density
    this._underwaterColor = { r: 0.1, g: 0.3, b: 0.5 }; // blue-green tint
  };

  /**
   * Set fog density.
   * @param {number} density - Fog density value (higher = denser fog).
   */
  Donkeycraft.Fog.prototype.setDensity = function (density) {
    this._density = density;
  };

  /**
   * Get the current fog density.
   * @returns {number} Fog density value.
   */
  Donkeycraft.Fog.prototype.getDensity = function () {
    return this._density;
  };

  /**
   * Enable or disable fog rendering.
   * @param {boolean} enabled - True to enable fog.
   */
  Donkeycraft.Fog.prototype.setEnabled = function (enabled) {
    this._enabled = enabled;
  };

  /**
   * Check if fog is enabled.
   * @returns {boolean}
   */
  Donkeycraft.Fog.prototype.isEnabled = function () {
    return this._enabled;
  };

  /**
   * Set fog color.
   * @param {number} r - Red component [0, 1].
   * @param {number} g - Green component [0, 1].
   * @param {number} b - Blue component [0, 1].
   */
  Donkeycraft.Fog.prototype.setColor = function (r, g, b) {
    this._color.r = r;
    this._color.g = g;
    this._color.b = b;
  };

  /**
   * Get the current fog color.
   * @returns {{r: number, g: number, b: number}}
   */
  Donkeycraft.Fog.prototype.getColor = function () {
    return this._color;
  };

  /**
   * Update fog color based on lighting sky color.
   * @param {{r: number, g: number, b: number}} skyColor - Sky color from Lighting system.
   */
  Donkeycraft.Fog.prototype.updateFromSky = function (skyColor) {
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
  Donkeycraft.Fog.prototype.applyToFogUniforms = function (shaderManager) {
    // Early exit: no shader manager, fog disabled, or density out of valid range.
    if (!shaderManager || !this._enabled || this._density < 0) return false;

    var colorSet = shaderManager.setVec3(
      'uFogColor',
      this._color.r,
      this._color.g,
      this._color.b
    );
    var densitySet = shaderManager.setFloat('uFogDensity', this._density);
    return colorSet && densitySet;
  };

  /**
   * Set underwater mode parameters.
   * @param {boolean} enabled - Whether to enable underwater mode.
   * @param {number} [density=0.05] - Fog density when underwater.
   * @param {{r: number, g: number, b: number}} [color={r:0.1, g:0.3, b:0.5}] - Blue-green tint color.
   */
  Donkeycraft.Fog.prototype.setUnderwaterMode = function (
    enabled,
    density,
    color
  ) {
    this._underwater = !!enabled;
    if (density !== undefined) this._underwaterDensity = density;
    if (color !== undefined) {
      this._underwaterColor.r = color.r;
      this._underwaterColor.g = color.g;
      this._underwaterColor.b = color.b;
    }
  };

  /**
   * Check if underwater mode is enabled.
   * @returns {boolean}
   */
  Donkeycraft.Fog.prototype.isUnderwaterMode = function () {
    return this._underwater;
  };

  /**
   * Get underwater mode uniforms for the terrain shader.
   * Returns density and color values to pass as uCameraWaterDepth, uUnderwaterDensity, uUnderwaterColor.
   * @returns {{cameraWaterDepth: number, underwaterDensity: number, underwaterColor: {r: number, g: number, b: number}}}
   */
  Donkeycraft.Fog.prototype.getUnderwaterUniforms = function () {
    if (this._underwater) {
      return {
        cameraWaterDepth: 1.0, // Signal that we're underwater
        underwaterDensity: this._underwaterDensity,
        underwaterColor: this._underwaterColor,
      };
    }
    return {
      cameraWaterDepth: 0.0,
      underwaterDensity: this._underwaterDensity,
      underwaterColor: this._underwaterColor,
    };
  };
})();
