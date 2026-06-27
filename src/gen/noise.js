// Donkeycraft — Noise Utilities
// Shared noise functions for all texture generators in src/gen/.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Simplex-like noise function (fast 2D/3D)
    // ============================================================

    /**
     * Permutation table for noise functions.
     * @type {number[]}
     * @private
     */
    var _perm = [];
    for (var _i = 0; _i < 512; _i++) {
        _perm[_i] = _i & 255;
    }

    /**
     * Shuffle permutation table deterministically.
     * @param {number} seed - Seed value.
     * @private
     */
    function _shufflePerm(seed) {
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
     * Fade function for smooth interpolation.
     * @param {number} t
     * @returns {number}
     * @private
     */
    function _fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * Linear interpolation.
     * @param {number} a
     * @param {number} b
     * @param {number} t
     * @returns {number}
     * @private
     */
    function _lerp(a, b, t) {
        return a + t * (b - a);
    }

    /**
     * Gradient function for noise.
     * @param {number} hash
     * @param {number} x
     * @param {number} y
     * @returns {number}
     * @private
     */
    function _grad(hash, x, y) {
        var h = hash & 15;
        var u = h < 8 ? x : y;
        var v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    /**
     * 2D Perlin noise.
     * @param {number} x
     * @param {number} y
     * @returns {number} Value in [-1, 1].
     * @private
     */
    function _noise2D(x, y) {
        var X = Math.floor(x) & 255;
        var Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        var u = _fade(x);
        var v = _fade(y);
        var a = (_perm[X] + Y) & 255;
        var b = (_perm[X + 1] + Y) & 255;
        return _lerp(
            _lerp(_grad(_perm[a], x, y), _grad(_perm[b], x - 1, y), u),
            _lerp(_grad(_perm[a + 1], x, y - 1), _grad(_perm[b + 1], x - 1, y - 1), u),
            v
        );
    }

    // ============================================================
    // Mulberry32 PRNG — deterministic pseudo-random number generator
    // ============================================================

    /**
     * Internal state for the Mulberry32 PRNG.
     * @type {number}
     * @private
     */
    var _rngState = 42;

    /**
     * Seed the PRNG with a given value.
     * @param {number} seed - Seed value.
     */
    function _seedRng(seed) {
        _rngState = seed | 0;
        if (_rngState < 0) _rngState += 4294967296;
    }

    /**
     * Generate a deterministic pseudo-random number in [0, 1).
     * @returns {number}
     */
    function _rng() {
        var x = _rngState;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        _rngState = (x + 1) | 0;
        return (_rngState >>> 0) / 4294967296;
    }

    /**
     * Fractal Brownian Motion for natural-looking texture variation.
     * @param {number} x
     * @param {number} y
     * @param {number} octaves
     * @param {number} frequency
     * @param {number} amplitude
     * @returns {number}
     */
    function _fbm(x, y, octaves, frequency, amplitude) {
        var total = 0;
        var maxVal = 0;
        for (var i = 0; i < octaves; i++) {
            total += _noise2D(x * frequency, y * frequency) * amplitude;
            maxVal += amplitude;
            frequency *= 2;
            amplitude *= 0.5;
        }
        return total / maxVal;
    }

    // ============================================================
    // Expose noise utilities on a private internal namespace
    // so all texture generator files can access them without
    // duplicating state (perm table, rng state).
    // ============================================================

    /**
     * _gen — internal namespace for cross-module noise and PRNG state.
     * @namespace
     * @private
     */
    Donkeycraft._gen = Donkeycraft._gen || {};
    Donkeycraft._gen._shufflePerm = _shufflePerm;
    Donkeycraft._gen._noise2D = _noise2D;
    Donkeycraft._gen._fbm = _fbm;
    Donkeycraft._gen._seedRng = _seedRng;
    Donkeycraft._gen._rng = _rng;

})();