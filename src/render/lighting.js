// Donkeycraft — Lighting
// Directional light (sun), ambient light, sky color computation.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * Lighting — Computes sun intensity, ambient light, and sky color based on world time of day.
   */
  Donkeycraft.Lighting = function () {
    this._timeOfDay = 0.5;
  };

  /**
   * Set the world time of day.
   * @param {number} t - Time value in [0, 1). 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
   */
  Donkeycraft.Lighting.prototype.setTimeOfDay = function (t) {
    t = t - Math.floor(t);
    if (t < 0) t += 1;
    this._timeOfDay = t;
  };

  /**
   * Get the current time of day.
   * @returns {number} Time value in [0, 1).
   */
  Donkeycraft.Lighting.prototype.getTimeOfDay = function () {
    return this._timeOfDay;
  };

  /**
   * Compute sun intensity based on time of day.
   * Returns 1.0 at noon, 0.0 at midnight.
   * @returns {number} Sun intensity in [0, 1].
   */
  Donkeycraft.Lighting.prototype.getSunIntensity = function () {
    var sunHeight = Math.sin((this._timeOfDay - 0.25) * Math.PI * 2);
    return sunHeight > 0 ? Math.pow(sunHeight, 0.7) : 0;
  };

  /**
   * Compute ambient light level based on time of day.
   * @returns {number} Ambient intensity in [0.08, 1.0].
   */
  Donkeycraft.Lighting.prototype.getAmbientLight = function () {
    return Donkeycraft.clamp(0.08 + 0.92 * this.getSunIntensity(), 0.08, 1.0);
  };

  /**
   * Compute sky color RGB based on time of day with smooth interpolation.
   * Uses continuous piecewise-linear blending to avoid boundary discontinuities.
   * @returns {{r: number, g: number, b: number}} Sky color components in [0, 1].
   */
  Donkeycraft.Lighting.prototype.getSkyColor = function () {
    // Guard against uninitialized state.
    if (this._timeOfDay === undefined || this._timeOfDay === null) {
      return { r: 0.3, g: 0.6, b: 1.0 };
    }

    var t = this._timeOfDay;

    // Smooth sky color keyframes: [time, r, g, b]
    // t=0.0 → midnight (dark blue-black)
    // t=0.20 → pre-dawn (very dark)
    // t=0.30 → sunrise complete (orange-pink)
    // t=0.50 → midday (deep blue)
    // t=0.70 → sunset start
    // t=0.80 → dusk complete (dark blue-black)
    // t=1.0 → midnight again

    var keyframes = [
      { t: 0.0, r: 0.02, g: 0.02, b: 0.06 }, // midnight
      { t: 0.2, r: 0.03, g: 0.02, b: 0.05 }, // pre-dawn (darker)
      { t: 0.3, r: 0.85, g: 0.55, b: 0.25 }, // sunrise orange-pink
      { t: 0.4, r: 0.4, g: 0.65, b: 0.95 }, // morning blue
      { t: 0.55, r: 0.3, g: 0.6, b: 1.0 }, // midday deep blue
      { t: 0.7, r: 0.8, g: 0.5, b: 0.2 }, // sunset orange
      { t: 0.8, r: 0.03, g: 0.02, b: 0.05 }, // dusk (dark)
      { t: 1.0, r: 0.02, g: 0.02, b: 0.06 }, // midnight again
    ];

    // Find the two keyframes surrounding current time
    var lower = keyframes[0];
    var upper = keyframes[keyframes.length - 1];

    for (var i = 0; i < keyframes.length - 1; i++) {
      if (t >= keyframes[i].t && t <= keyframes[i + 1].t) {
        lower = keyframes[i];
        upper = keyframes[i + 1];
        break;
      }
    }

    var range = upper.t - lower.t;
    var phase = range > 0 ? (t - lower.t) / range : 0;

    // Smooth easing to avoid linear interpolation artifacts
    phase = phase * phase * (3 - 2 * phase); // smoothstep

    return {
      r: Donkeycraft.lerp(lower.r, upper.r, phase),
      g: Donkeycraft.lerp(lower.g, upper.g, phase),
      b: Donkeycraft.lerp(lower.b, upper.b, phase),
    };
  };

  /**
   * Get sun direction vector for directional lighting.
   * @returns {Donkeycraft.Vector3} Normalized sun direction.
   */
  Donkeycraft.Lighting.prototype.getSunDirection = function () {
    var sunAngle = (this._timeOfDay - 0.25) * Math.PI * 2;
    // Fixed: Use flat XZ arc (Y up).
    // The sun moves in a horizontal plane so it can be directly overhead
    // at noon (t=0.5 => angle=0 => direction=(1,0,0)).
    return new Donkeycraft.Vector3(
      Math.cos(sunAngle),
      0.0,
      Math.sin(sunAngle)
    ).normalized();
  };

  /**
   * Apply lighting uniforms to a shader program via the shader manager.
   * Sets: uLightFactor (float) — combined sun intensity × ambient light for terrain shading.
   * This is the primary uniform used by the terrain fragment shader for dynamic lighting.
   * @param {ShaderManager} shaderManager - The shader manager instance.
   * @returns {boolean} True if uniforms were set successfully.
   */
  Donkeycraft.Lighting.prototype.applyToShader = function (shaderManager) {
    if (!shaderManager) return false;

    var sunIntensity = this.getSunIntensity();
    var ambientLight = this.getAmbientLight();
    var lightFactor = Math.max(sunIntensity, ambientLight);

    return shaderManager.setFloat('uLightFactor', lightFactor);
  };
})();
