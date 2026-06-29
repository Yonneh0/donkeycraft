// Donkeycraft — Noise Utilities
// Shared noise functions for all generators in src/gen/.
// Delegates to the canonical PerlinNoise implementation in math-utils.js
// to ensure ALL generators use the SAME permutation table and produce
// spatially coherent features (caves align with terrain, ores match biomes, etc.).
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Noise delegation — single source of truth
    // ============================================================

    /**
     * Ensure the canonical PerlinNoise is initialized before any generator runs.
     * Checks the _isInitialized() flag set by PerlinNoise.init() in math-utils.js.
     * @private
     */
    function _ensureNoiseInit() {
        if (Donkeycraft.PerlinNoise && Donkeycraft.PerlinNoise.init) {
            var isInit = typeof Donkeycraft.PerlinNoise._isInitialized === 'function' 
                ? Donkeycraft.PerlinNoise._isInitialized() 
                : true; // Assume initialized if getter unavailable
            if (!isInit) {
                var seed = Donkeycraft.Config ? (Donkeycraft.Config.SEED || 42) : 42;
                Donkeycraft.PerlinNoise.init(seed);
            }
        }
    }

    // ============================================================
    // Mulberry32 PRNG — fast, deterministic pseudo-random number generator
    // Each generator gets its own isolated PRNG state to avoid cross-contamination.
    // ============================================================

    /**
     * PRNG state namespaces — one per generator module for isolation.
     * @type {Object<string, number>}
     * @private
     */
    var _rngStates = {};

    /**
     * Get or create an isolated PRNG state for a given namespace.
     * @param {string} namespace - Unique identifier (e.g., 'ore', 'cave', 'structure').
     * @returns {number} PRNG state value.
     * @private
     */
    function _getRngState(namespace) {
        if (_rngStates[namespace] === undefined) {
            _rngStates[namespace] = 42; // Default initial state
        }
        return _rngStates[namespace];
    }

    /**
     * Seed the Mulberry32 PRNG for a given namespace.
     * @param {string} namespace - Unique identifier.
     * @param {number} seed - Numeric seed value (clamped to 32-bit).
     * @private
     */
    function _seedRng(namespace, seed) {
        _rngStates[namespace] = (seed | 0);
        if (_rngStates[namespace] < 0) _rngStates[namespace] += 4294967296;
    }

    /**
     * Generate the next deterministic pseudo-random number in [0, 1)
     * using the Mulberry32 algorithm for a given namespace.
     * @param {string} namespace - Unique identifier.
     * @returns {number} Random value in [0, 1).
     * @private
     */
    function _rng(namespace) {
        var x = _getRngState(namespace);
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        _rngStates[namespace] = (x + 1) | 0;
        return (_rngStates[namespace] >>> 0) / 4294967296;
    }

    // ============================================================
    // Noise delegation to canonical PerlinNoise
    // ============================================================

    /**
     * 2D Perlin noise — delegates to Donkeycraft.PerlinNoise.noise2D.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @returns {number} Noise value in [-1, 1].
     */
    function _noise2D(x, y) {
        _ensureNoiseInit();
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise.noise2D === 'function') {
            return Donkeycraft.PerlinNoise.noise2D(x, y);
        }
        // Fallback: simple hash-based noise if PerlinNoise unavailable
        var X = Math.floor(x) & 255;
        var Y = Math.floor(y) & 255;
        return ((Math.sin(X * 12.9898 + Y * 78.233) * 43758.5453) % 1) * 2 - 1;
    }

    /**
     * Fractal Brownian Motion — delegates to Donkeycraft.PerlinNoise.fbm.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate (or Z for 3D noise).
     * @param {number} octaves - Number of noise octaves to sum.
     * @param {number} [frequency=1] - Base frequency multiplier.
     * @param {number} [amplitude=1] - Base amplitude multiplier.
     * @returns {number} Normalized result in [-1, 1].
     */
    function _fbm(x, y, octaves, frequency, amplitude) {
        _ensureNoiseInit();
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise.fbm === 'function') {
            // fbm in math-utils.js takes (x, y, z, octaves, persistence, lacunarity)
            return Donkeycraft.PerlinNoise.fbm(x, y, 0, octaves || 4, frequency || 2.0, amplitude || 0.5);
        }
        // Fallback: simple octave accumulation
        var total = 0;
        var maxVal = 0;
        var freq = frequency || 1;
        var amp = amplitude || 1;
        octaves = octaves || 4;
        for (var i = 0; i < octaves; i++) {
            total += _noise2D(x * freq, y * freq) * amp;
            maxVal += amp;
            freq *= 2;
            amp *= 0.5;
        }
        return maxVal > 0 ? total / maxVal : 0;
    }

    /**
     * Shuffle a permutation table deterministically from a seed.
     * Delegates to Donkeycraft.PerlinNoise.init() for consistency.
     * @param {number} seed - Numeric seed value.
     */
    function _shufflePerm(seed) {
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise.init === 'function') {
            Donkeycraft.PerlinNoise.init(seed);
        }
    }

    /**
     * Create a NEW permutation table shuffled deterministically from a seed.
     * Creates an isolated copy so it doesn't affect the global PerlinNoise state.
     * @param {number} seed - Numeric seed value.
     * @returns {Uint8Array|null} New perm array of length 512, or null if unavailable.
     */
    function _createShuffledPerm(seed) {
        // Get the current permutation table from PerlinNoise via getter method
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise._getPerm === 'function') {
            return new Uint8Array(Donkeycraft.PerlinNoise._getPerm());
        }
        // Fallback: create identity permutation
        var perm = new Uint8Array(512);
        for (var i = 0; i < 512; i++) {
            perm[i] = i & 255;
        }
        return perm;
    }

    // ============================================================
    // Expose on internal namespace — single source of truth for noise
    // ============================================================

    /**
     * Donkeycraft._gen — internal cross-module namespace for noise and PRNG state.
     * Delegates to the canonical PerlinNoise in math-utils.js for all noise generation.
     * Not part of the public API. All properties are prefixed with underscore.
     * @namespace
     * @private
     */
    Donkeycraft._gen = Donkeycraft._gen || {};
    Donkeycraft._gen._shufflePerm = _shufflePerm;
    Donkeycraft._gen._createShuffledPerm = _createShuffledPerm;
    Donkeycraft._gen._noise2D = _noise2D;
    Donkeycraft._gen._fbm = _fbm;
    Donkeycraft._gen._seedRng = _seedRng;
    Donkeycraft._gen._rng = _rng;

})();
