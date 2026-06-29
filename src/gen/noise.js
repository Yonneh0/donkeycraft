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
     * If not initialized, initializes with the seed from Config or defaults to 42.
     * @private
     */
    function _ensureNoiseInit() {
        if (!Donkeycraft.PerlinNoise) return;
        if (Donkeycraft.PerlinNoise.init) {
            var isInit = false;
            // Check via the public getter method first, then fallback to direct property
            if (typeof Donkeycraft.PerlinNoise._isInitialized === 'function') {
                isInit = Donkeycraft.PerlinNoise._isInitialized();
            } else if (Donkeycraft.PerlinNoise._initialized !== undefined) {
                isInit = !!Donkeycraft.PerlinNoise._initialized;
            } else {
                // If no check available, assume initialized (PerlinNoise module loaded)
                isInit = true;
            }
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
     * Each generator module has its own isolated PRNG state to avoid cross-contamination.
     * @param {string} namespace - Unique identifier (e.g., 'ore', 'cave', 'structure').
     * @returns {number} Random value in [0, 1).
     * @private
     */
    function _rng(namespace) {
        var x = _getRngState(namespace);
        // Mulberry32 PRNG algorithm — fast, deterministic, 32-bit
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
     * Returns a value in [-1, 1] representing normalized noise at the given coordinates.
     * Automatically initializes PerlinNoise if not already initialized.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @returns {number} Normalized noise value in [-1, 1].
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
     * Fractal Brownian Motion (fBm) — delegates to Donkeycraft.PerlinNoise.fbm.
     * Sums multiple octaves of Perlin noise with decreasing amplitude and increasing frequency
     * to produce smooth, natural-looking terrain features.
     *
     * The PerlinNoise.fbm signature is: (x, y, z, octaves, persistence, lacunarity).
     * This wrapper maps our parameters correctly: amplitude → persistence, frequency → lacunarity.
     *
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate for 3D noise (defaults to 0 for 2D).
     * @param {number} [octaves=4] - Number of noise octaves to sum. More octaves = finer detail.
     * @param {number} [amplitude=0.5] - Persistence: amplitude multiplier per octave (how fast detail decreases).
     * @param {number} [frequency=2.0] - Lacunarity: frequency multiplier per octave (how fast frequency increases).
     * @returns {number} Normalized result in [-1, 1].
     */
    function _fbm(x, y, z, octaves, amplitude, frequency) {
        _ensureNoiseInit();
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise.fbm === 'function') {
            // fbm signature: (x, y, z, octaves, persistence, lacunarity)
            // amplitude maps to persistence (amplitude decay per octave)
            // frequency maps to lacunarity (frequency increase per octave)
            return Donkeycraft.PerlinNoise.fbm(x, y, z || 0, octaves || 4, amplitude !== undefined ? amplitude : 0.5, frequency !== undefined ? frequency : 2.0);
        }
        // Fallback: simple octave accumulation if PerlinNoise unavailable
        var total = 0;
        var maxVal = 0;
        var freq = frequency || 2.0;
        var amp = amplitude !== undefined ? amplitude : 0.5;
        octaves = octaves || 4;
        for (var i = 0; i < octaves; i++) {
            // Use _noise2D with x, y for 2D fallback; z is ignored in fallback mode
            total += _noise2D(x * freq, y * freq + z * 0.01) * amp;
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

    /**
     * Deterministic 2D hash using an FNV-1a inspired algorithm.
     * Centralized in noise.js to eliminate duplication across ore-generator, water-generator,
     * structure-generator, and other generation modules.
     * Handles negative inputs correctly by masking to 32-bit signed integers first,
     * then returning an unsigned 32-bit integer for consistent use as PRNG seeds.
     *
     * @param {number} x - X coordinate (may be negative).
     * @param {number} y - Y coordinate (may be negative).
     * @returns {number} Positive 32-bit integer in range [0, 4294967295].
     */
    function _hash2D(x, y) {
        // Mask to 32-bit signed integers first, then convert to unsigned for the hash
        x = x | 0;
        y = y | 0;
        var h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
        h = ((h >>> 13) ^ h) * 0x5bd1e995;
        return (h ^ (h >>> 15)) >>> 0; // Unsigned 32-bit result
    }

    // ============================================================
    // Expose on internal namespace — single source of truth for noise
    // ============================================================

    /**
     * Donkeycraft._gen — internal cross-module namespace for noise and PRNG state.
     * Delegates to the canonical PerlinNoise in math-utils.js for all noise generation.
     * Provides a single source of truth for procedural randomness across all generators.
     * Not part of the public API. All properties are prefixed with underscore.
     *
     * @namespace
     * @private
     */
    Donkeycraft._gen = Donkeycraft._gen || {};
    Donkeycraft._gen._ensureNoiseInit = _ensureNoiseInit;
    Donkeycraft._gen._shufflePerm = _shufflePerm;
    Donkeycraft._gen._createShuffledPerm = _createShuffledPerm;
    Donkeycraft._gen._noise2D = _noise2D;
    Donkeycraft._gen._fbm = _fbm;
    Donkeycraft._gen._seedRng = _seedRng;
    Donkeycraft._gen._rng = _rng;
    Donkeycraft._gen._hash2D = _hash2D;

})();
