// Donkeycraft — Noise Utilities
// Shared noise functions for all texture generators in src/gen/.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Simplex-like noise function (fast 2D/3D)
    // ============================================================

    // ============================================================
    // Permutation table and noise utilities — shared across all
    // texture generator modules in src/gen/.
    // ============================================================

    /**
     * _perm — permutation table for 2D Perlin noise. Initialized with identity mapping, shuffled deterministically by seed.
     * @type {number[]}
     * @private
     */
    var _perm = [];
    for (var _i = 0; _i < 512; _i++) {
        _perm[_i] = _i & 255;
    }

    /**
     * _basePerm — identity permutation table (indices 0-255). Saved before any shuffle
     * so that _shufflePerm can always restore a clean state. This prevents cross-module
     * noise pollution where one generator's shuffle corrupts another's expected pattern.
     * @type {number[]}
     * @private
     */
    var _basePerm = [];
    for (var _bp = 0; _bp < 256; _bp++) {
        _basePerm[_bp] = _bp;
    }

    /**
     * _shufflePerm — shuffle the permutation table deterministically from a seed.
     * Uses a Fisher-Yates shuffle with a LCG mixer, then duplicates
     * the table to 512 entries for overflow-safe indexing.
     * IMPORTANT: Callers should save/restore the perm table around this call if they need
     * isolated noise generation. This function mutates the shared `_perm` array.
     * @param {number} seed - Numeric seed value.
     * @private
     */
    function _shufflePerm(seed) {
        // Restore from clean base before shuffling to avoid compounding mutations
        for (var _ri = 0; _ri < 256; _ri++) {
            _perm[_ri] = _basePerm[_ri];
        }
        var x = seed | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) | 0;
        if (x < 0) x = -x;
        for (var i = 255; i > 0; i--) {
            x = (x * 16807) % 65536;
            var j = x % (i + 1);
            var tmp = _perm[i];
            _perm[i] = _perm[j];
            _perm[j] = tmp;
        }
        for (var k = 0; k < 512; k++) {
            _perm[k] = _perm[k & 255];
        }
    }

    /**
     * _createShuffledPerm — create a NEW permutation table shuffled deterministically from a seed.
     * Does NOT mutate global state. Returns a fresh array suitable for isolated texture generation.
     * Uses the same algorithm as _shufflePerm but operates on a local copy.
     * @param {number} seed - Numeric seed value.
     * @returns {number[]} New perm array of length 512.
     * @private
     */
    function _createShuffledPerm(seed) {
        // Start with identity mapping
        var perm = [];
        for (var i = 0; i < 512; i++) {
            perm[i] = i & 255;
        }
        // Shuffle using the same algorithm as _shufflePerm
        var x = seed | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) | 0;
        if (x < 0) x = -x;
        for (var i = 255; i > 0; i--) {
            x = (x * 16807) % 65536;
            var j = x % (i + 1);
            var tmp = perm[i];
            perm[i] = perm[j];
            perm[j] = tmp;
        }
        for (var k = 0; k < 512; k++) {
            perm[k] = perm[k & 255];
        }
        return perm;
    }

    /**
     * _fade — Perlin's quintic fade curve: 6t⁵ − 15t⁴ + 10t³.
     * @param {number} t - Value in [0, 1].
     * @returns {number} Smoothed value.
     * @private
     */
    function _fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * _lerp — linear interpolation between a and b by t.
     * @param {number} a - Start value.
     * @param {number} b - End value.
     * @param {number} t - Interpolation factor.
     * @returns {number} Interpolated result.
     * @private
     */
    function _lerp(a, b, t) {
        return a + t * (b - a);
    }

    /**
     * _grad — compute the gradient dot product for a given hash and coordinates.
     * Uses the simplified 2D gradient set from Perlin's improved noise.
     * @param {number} hash - Hash value from permutation table.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @returns {number} Gradient value.
     * @private
     */
    function _grad(hash, x, y) {
        var h = hash & 15;
        var u = h < 8 ? x : y;
        var v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    /**
     * _noise2D — 2D Perlin noise function. Returns a value in [-1, 1]
     * based on interpolated gradients at grid corners surrounding (x, y).
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number[]} [perm] - Optional permutation table. Uses global _perm if not provided.
     * @returns {number} Noise value in [-1, 1].
     * @private
     */
    function _noise2D(x, y, perm) {
        var table = perm || _perm;
        var X = Math.floor(x) & 255;
        var Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        var u = _fade(x);
        var v = _fade(y);
        var a = (table[X] + Y) & 255;
        var b = (table[X + 1] + Y) & 255;
        return _lerp(
            _lerp(_grad(table[a], x, y), _grad(table[b], x - 1, y), u),
            _lerp(_grad(table[a + 1], x, y - 1), _grad(table[b + 1], x - 1, y - 1), u),
            v
        );
    }

    // ============================================================
    // Mulberry32 PRNG — fast, deterministic pseudo-random number generator
    // ============================================================

    /**
     * _rngState — internal state for the Mulberry32 PRNG. Reset to 42 on first use.
     * @type {number}
     * @private
     */
    var _rngState = 42;

    /**
     * _seedRng — seed the Mulberry32 PRNG with a given 32-bit integer.
     * @param {number} seed - Numeric seed value (clamped to 32-bit).
     */
    function _seedRng(seed) {
        _rngState = seed | 0;
        if (_rngState < 0) _rngState += 4294967296;
    }

    /**
     * _rng — generate the next deterministic pseudo-random number in [0, 1)
     * using the Mulberry32 algorithm.
     * @returns {number} Random value in [0, 1).
     */
    function _rng() {
        var x = _rngState;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        _rngState = (x + 1) | 0;
        return (_rngState >>> 0) / 4294967296;
    }

    /**
     * _fbm — Fractal Brownian Motion: sums multiple octaves of 2D Perlin noise
     * at increasing frequency and decreasing amplitude to produce natural-looking
     * texture variation (clouds, marble, stone grain, etc.).
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} octaves - Number of noise octaves to sum.
     * @param {number} frequency - Base frequency multiplier.
     * @param {number} amplitude - Base amplitude multiplier.
     * @param {number[]} [perm] - Optional permutation table. Uses global _perm if not provided.
     * @returns {number} Normalized result in [-1, 1].
     */
    function _fbm(x, y, octaves, frequency, amplitude, perm) {
        var table = perm || _perm;
        var total = 0;
        var maxVal = 0;
        for (var i = 0; i < octaves; i++) {
            total += _noise2D(x * frequency, y * frequency, table) * amplitude;
            maxVal += amplitude;
            frequency *= 2;
            amplitude *= 0.5;
        }
        return total / maxVal;
    }

    // ============================================================
    // Expose noise utilities on a private internal namespace so all
    // texture generator files can access shared state (perm table,
    // rng state) without duplicating or conflicting with each other.
    // ============================================================

    /**
     * Donkeycraft._gen — internal cross-module namespace for noise and PRNG state.
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