// Donkeycraft — Noise Utilities
// Shared noise functions for all generators in src/gen/.
// Delegates to the canonical PerlinNoise implementation in math-utils.js
// to ensure ALL generators use the SAME permutation table and produce
// spatially coherent features (caves align with terrain, ores match biomes, etc.).
//
// @module noise
// @description Centralized noise generation, PRNG, and hashing utilities
//   for procedural content generation across all dimension generators.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Noise delegation — single source of truth
    // ============================================================

    /**
     * Ensure the canonical PerlinNoise is initialized before any generator runs.
     * Checks via the public _isInitialized() getter set by PerlinNoise.init() in math-utils.js.
     * If not initialized, initializes with the seed from Config or defaults to 42.
     * @private
     */
    function _ensureNoiseInit() {
        if (!Donkeycraft.PerlinNoise) return;
        if (typeof Donkeycraft.PerlinNoise.init !== 'function') return;

        var isInit = false;
        // Check via the public getter method first
        if (typeof Donkeycraft.PerlinNoise._isInitialized === 'function') {
            isInit = !!Donkeycraft.PerlinNoise._isInitialized();
        }

        if (!isInit) {
            var seed = Donkeycraft.Config ? (Donkeycraft.Config.SEED || 42) : 42;
            try {
                Donkeycraft.PerlinNoise.init(seed);
            } catch (e) {
                // Silently fail — PerlinNoise may not be ready yet
            }
        }
    }

    // ============================================================
    // Mulberry32 PRNG — fast, deterministic pseudo-random number generator
    // Each generator gets its own isolated PRNG state to avoid cross-contamination.
    // ============================================================

    /** @type {Object.<string, number>} Internal storage for per-namespace PRNG states. */
    var _rngStates = {};

    /**
     * Get the current RNG state for a namespace.
     * @param {string} namespace - Unique identifier.
     * @returns {number}
     * @private
     */
    function _getRngState(namespace) {
        return _rngStates[namespace] || 0;
    }

    /**
     * Generate the next deterministic pseudo-random number in [0, 1)
     * using the Mulberry32 algorithm for a given namespace.
     * Each generator module has its own isolated PRNG state to avoid cross-contamination.
     * The algorithm uses explicit 32-bit masking (& 0xFFFFFFFF) at each multiplication step
     * to ensure consistent behavior across all JavaScript engines and browsers.
     *
     * @param {string} namespace - Unique identifier (e.g., 'ore', 'cave', 'structure').
     * @returns {number} Random value in [0, 1).
     * @private
     */
    function _rng(namespace) {
        var x = _getRngState(namespace);
        // Mulberry32 PRNG algorithm — fast, deterministic, cross-engine consistent.
        // Each multiplication is masked to 32 bits to prevent float precision loss
        // for large x values before truncation.
        x = (x ^ (x >>> 16)) & 0xFFFFFFFF;
        x = ((x * 0x45d9f3b) & 0xFFFFFFFF) | 0;
        x = (x ^ (x >>> 16)) & 0xFFFFFFFF;
        x = ((x * 0x45d9f3b) & 0xFFFFFFFF) | 0;
        x = (x + 1) & 0xFFFFFFFF;
        _rngStates[namespace] = x;
        return (x >>> 0) / 4294967296;
    }

    /**
     * Seed the Mulberry32 PRNG for a given namespace.
     * Must be called before `_rng()` to ensure deterministic results.
     * @param {string} namespace - Unique identifier.
     * @param {number} seed - Numeric seed value (clamped to 32-bit).
     * @private
     */
    function _seedRng(namespace, seed) {
        // Use >>> 0 for clear unsigned 32-bit conversion.
        // This handles negative values correctly by wrapping them to their unsigned equivalent.
        _rngStates[namespace] = (seed | 0) >>> 0;
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
     * @private
     */
    function _noise2D(x, y) {
        _ensureNoiseInit();
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise.noise2D === 'function') {
            try {
                return Donkeycraft.PerlinNoise.noise2D(x, y);
            } catch (e) {
                // PerlinNoise threw — fall through to fallback
            }
        }
        // Fallback: simple hash-based noise seeded from global seed
        var globalSeed = Donkeycraft.Config ? (Donkeycraft.Config.SEED || 42) : 42;
        var h = _hash2D(Math.floor(x), Math.floor(y)) ^ globalSeed;
        var rngState = h;
        // Mulberry32 step
        rngState = (rngState ^ (rngState >>> 16)) & 0xFFFFFFFF;
        rngState = ((rngState * 0x45d9f3b) & 0xFFFFFFFF) | 0;
        rngState = (rngState ^ (rngState >>> 16)) & 0xFFFFFFFF;
        rngState = ((rngState * 0x45d9f3b) & 0xFFFFFFFF) | 0;
        return (((rngState + 1) & 0xFFFFFFFF) >>> 0) / 2147483648 - 1; // Range [-1, 1]
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
     * @param {number} [amplitude=0.5] - Persistence: amplitude multiplier per octave.
     * @param {number} [frequency=2.0] - Lacunarity: frequency multiplier per octave.
     * @returns {number} Normalized result in [-1, 1].
     * @private
     */
    function _fbm(x, y, z, octaves, amplitude, frequency) {
        _ensureNoiseInit();
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise.fbm === 'function') {
            try {
                return Donkeycraft.PerlinNoise.fbm(
                    x, y, z || 0,
                    octaves || 4,
                    amplitude !== undefined ? amplitude : 0.5,
                    frequency !== undefined ? frequency : 2.0
                );
            } catch (e) {
                // PerlinNoise threw — fall through to fallback
            }
        }
        // Fallback: simple octave accumulation with proper persistence parameter
        var total = 0;
        var maxVal = 0;
        var freq = frequency || 2.0;
        var amp = amplitude !== undefined ? amplitude : 0.5;
        octaves = octaves || 4;
        for (var i = 0; i < octaves; i++) {
            // Use 3D noise by passing z as a separate dimension for proper spatial variation
            total += _noise2D(x * freq, y * freq + z * 0.1) * amp;
            maxVal += amp;
            freq *= 2;
            amp *= 0.5; // Fixed persistence decay in fallback
        }
        return maxVal > 0 ? total / maxVal : 0;
    }

    /**
     * Create a NEW permutation table shuffled deterministically from a seed.
     * Creates an isolated copy so it doesn't affect the global PerlinNoise state.
     * @param {number} seed - Numeric seed value.
     * @returns {Uint8Array|null} New perm array of length 512, or null if unavailable.
     * @private
     */
    function _createShuffledPerm(seed) {
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise._getPerm === 'function') {
            try {
                return new Uint8Array(Donkeycraft.PerlinNoise._getPerm());
            } catch (e) { /* Ignore */ }
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
     * @private
     */
    function _hash2D(x, y) {
        x = x | 0;
        y = y | 0;
        var h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
        h = ((h >>> 13) ^ h) * 0x5bd1e995;
        return (h ^ (h >>> 15)) >>> 0;
    }

    /**
     * Deterministic 3D hash using FNV-1a algorithm.
     * Extends the 2D hash with a z component for volumetric feature placement.
     * Handles negative inputs correctly and returns an unsigned 32-bit integer.
     *
     * @param {number} x - X coordinate (may be negative).
     * @param {number} y - Y coordinate (may be negative).
     * @param {number} z - Z coordinate (may be negative).
     * @returns {number} Positive 32-bit integer in range [0, 4294967295].
     * @private
     */
    function _hash3D(x, y, z) {
        x = x | 0;
        y = y | 0;
        z = z | 0;
        var h = (x * 374761393 + y * 668265263 + z * 923496773) ^ 0x5bd1e995;
        h = ((h >>> 13) ^ h) * 0x5bd1e995;
        return (h ^ (h >>> 15)) >>> 0;
    }

    // ============================================================
    // Enhanced Fractal Noise — Ridged Multifractal & Valley Detection
    // Required by Phase 1: Enhanced noise system for mountains/cliffs/lakes
    // ============================================================

    /**
     * Ridged Multifractal Noise — generates mountain-like features with sharp peaks and valleys.
     * Unlike standard fBm, this creates ridges by taking absolute values and squaring them,
     * producing dramatic cliff faces, mountain ranges, and steep elevation changes.
     *
     * Algorithm:
     *   1. Generate Perlin noise at each octave
     *   2. Take absolute value (creates ridges)
     *   3. Square it (emphasizes peaks)
     *   4. Invert and weight by amplitude
     *   5. Sum with lacunarity frequency scaling
     *
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate (defaults to 0 for 2D).
     * @param {number} [octaves=4] - Number of noise octaves.
     * @param {number} [persistence=0.5] - Amplitude multiplier per octave.
     * @param {number} [lacunarity=2.0] - Frequency multiplier per octave.
     * @param {number} [gain=2.0] - Ridge sharpness multiplier.
     * @returns {number} Normalized result in [-1, 1].
     * @private
     */
    function _ridgedMultifractal(x, y, z, octaves, persistence, lacunarity, gain) {
        _ensureNoiseInit();
        if (!Donkeycraft.PerlinNoise || typeof Donkeycraft.PerlinNoise.fbm !== 'function') {
            // Fallback: simple ridged noise using hash
            return _noise2D(x, y) * 0.5;
        }

        octaves = Math.max(1, Math.min(8, Math.round(octaves || 4)));
        persistence = Math.max(0, Math.min(1, persistence || 0.5));
        lacunarity = Math.max(1, Math.min(4, lacunarity || 2));
        gain = gain || 2;

        var maxVal = 0;
        var result = 0;
        var amplitude = 1;
        var frequency = 1;

        for (var i = 0; i < octaves; i++) {
            // Get noise and take absolute value for ridges
            var noiseValue = Math.abs(Donkeycraft.PerlinNoise.noise3D(x * frequency, y * frequency, z * frequency));

            // Invert and square for ridge formation
            noiseValue = gain - noiseValue;
            noiseValue = noiseValue * noiseValue;

            // Weight by amplitude
            noiseValue *= amplitude;

            // Track maximum possible value for normalization
            maxVal += amplitude;

            result += noiseValue;

            // Prepare next octave
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        // Normalize to [-1, 1] and clamp for numerical safety
        var normalized = maxVal > 0 ? (result / maxVal * 2 - 1) : 0;
        return Math.max(-1, Math.min(1, normalized));
    }

    /**
     * Valley Detection Noise — identifies basin/valley regions for lake formation.
     * Uses inverted fBm with low thresholds to create depression zones.
     * Values closer to 1.0 indicate deeper/more pronounced valleys.
     * Properly normalizes output to [0, 1] range.
     *
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate (defaults to 0 for 2D).
     * @param {number} [octaves=3] - Number of noise octaves.
     * @param {number} [persistence=0.5] - Amplitude multiplier per octave.
     * @param {number} [lacunarity=2.0] - Frequency multiplier per octave.
     * @returns {number} Valley strength in [0, 1] (0 = flat/high, 1 = deep valley).
     * @private
     */
    function _valleyNoise(x, y, z, octaves, persistence, lacunarity) {
        _ensureNoiseInit();
        if (!Donkeycraft.PerlinNoise || typeof Donkeycraft.PerlinNoise.fbm !== 'function') {
            return 0;
        }

        octaves = Math.max(1, Math.min(8, Math.round(octaves || 3)));
        persistence = Math.max(0, Math.min(1, persistence || 0.5));
        lacunarity = Math.max(1, Math.min(4, lacunarity || 2));

        // Get standard fBm (range [-1, 1])
        var fbmValue = Donkeycraft.PerlinNoise.fbm(x, y, z || 0, octaves, persistence, lacunarity);

        // Invert and normalize: fbm ∈ [-1, 1] → valley ∈ [0, 1]
        // When fbm = -1 (deep): valley = 1 (deep valley)
        // When fbm = 1 (high): valley = 0 (no valley)
        var valleyStrength = (1 - fbmValue) / 2;

        // Clamp to [0, 1]
        return Math.max(0, Math.min(1, valleyStrength));
    }

    /**
     * Noise Composition System — combines multiple noise layers with blending modes.
     * Enables terrain designers to layer continental, terrain-shaping, and detail noise
     * with configurable influence weights for multi-pass generation.
     *
     * All layer outputs are normalized to [-1, 1] before weighting to ensure
     * consistent blending regardless of the underlying noise type.
     *
     * @param {Array} layers - Array of noise layer definitions.
     *   Each layer: { xScale, yScale, zScale, octaves, persistence, lacunarity, weight, type }
     *   where type is 'fbm', 'ridged', or 'valley'.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     * @returns {number} Composed noise value in [-1, 1].
     * @private
     */
    function _composeNoise(layers, x, y, z) {
        var result = 0;
        var totalWeight = 0;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var noiseValue = 0;

            switch (layer.type || 'fbm') {
                case 'ridged':
                    noiseValue = _ridgedMultifractal(
                        x * (layer.xScale || 1), y * (layer.yScale || 1), z * (layer.zScale || 1),
                        layer.octaves, layer.persistence, layer.lacunarity, layer.gain
                    );
                    break;
                case 'valley':
                    // Valley returns [0, 1], convert to [-1, 1] for consistent blending
                    var valleyVal = _valleyNoise(
                        x * (layer.xScale || 1), y * (layer.yScale || 1), z * (layer.zScale || 1),
                        layer.octaves, layer.persistence, layer.lacunarity
                    );
                    noiseValue = valleyVal * 2 - 1; // Map [0,1] → [-1,1]
                    break;
                default:
                    noiseValue = _fbm(
                        x * (layer.xScale || 1), y * (layer.yScale || 1), z * (layer.zScale || 1),
                        layer.octaves, layer.persistence, layer.lacunarity
                    );
            }

            var weight = layer.weight || 1;
            result += noiseValue * weight;
            totalWeight += weight;
        }

        // Normalize by total weight
        var normalized = totalWeight > 0 ? result / totalWeight : 0;
        return Math.max(-1, Math.min(1, normalized));
    }

    /**
     * Create a pre-configured terrain noise composition for multi-pass generation.
     * Matches Phase 2 surface generator passes:
     *   Pass 1: Continental (large scale) — land vs water
     *   Pass 2: Terrain shaping (medium scale) — hills/valleys
     *   Pass 3: Detail (small scale) — texture
     *   Pass 4: Ridged multifractal — mountains/cliffs
     *   Pass 5: Micro-detail (very small scale) — surface roughness
     *
     * Uses proper scale parameters for both X and Z dimensions.
     *
     * @param {number} continentalScale - Scale for continental noise (default 0.003).
     * @param {number} terrainScale - Scale for terrain shaping (default 0.015).
     * @param {number} detailScale - Scale for detail noise (default 0.05).
     * @param {number} ridgeScale - Scale for ridged multifractal (default 0.012).
     * @param {number} microScale - Scale for micro-detail (default 0.1).
     * @returns {Array} Noise layer configuration array.
     * @private
     */
    function _createTerrainComposition(continentalScale, terrainScale, detailScale, ridgeScale, microScale) {
        continentalScale = continentalScale || 0.003;
        terrainScale = terrainScale || 0.015;
        detailScale = detailScale || 0.05;
        ridgeScale = ridgeScale || 0.012;
        microScale = microScale || 0.1;

        return [
            {
                type: 'fbm',
                xScale: continentalScale,
                zScale: continentalScale, // Use same scale for X and Z
                octaves: 4,
                persistence: 0.5,
                lacunarity: 2.0,
                weight: 0.4
            },
            {
                type: 'fbm',
                xScale: terrainScale,
                zScale: terrainScale, // Use same scale for X and Z
                octaves: 3,
                persistence: 0.5,
                lacunarity: 2.0,
                weight: 0.3
            },
            {
                type: 'fbm',
                xScale: detailScale,
                zScale: detailScale, // Use same scale for X and Z
                octaves: 2,
                persistence: 0.5,
                lacunarity: 2.0,
                weight: 0.15
            },
            {
                type: 'ridged',
                xScale: ridgeScale,
                zScale: ridgeScale, // Use same scale for X and Z
                octaves: 4,
                persistence: 0.5,
                lacunarity: 2.0,
                gain: 2.0,
                weight: 0.15
            },
            {
                type: 'fbm',
                xScale: microScale,
                zScale: microScale, // Use same scale for X and Z
                octaves: 2,
                persistence: 0.5,
                lacunarity: 2.0,
                weight: 0.1
            }
        ];
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
     * @namespace Donkeycraft._gen
     * @private
     */
    Donkeycraft._gen = Donkeycraft._gen || {};
    Donkeycraft._gen._ensureNoiseInit = _ensureNoiseInit;
    // _shufflePerm removed — _createShuffledPerm handles permutation shuffling internally
    Donkeycraft._gen._createShuffledPerm = _createShuffledPerm;
    Donkeycraft._gen._noise2D = _noise2D;
    Donkeycraft._gen._fbm = _fbm;
    Donkeycraft._gen._ridgedMultifractal = _ridgedMultifractal;
    Donkeycraft._gen._valleyNoise = _valleyNoise;
    Donkeycraft._gen._composeNoise = _composeNoise;
    Donkeycraft._gen._createTerrainComposition = _createTerrainComposition;
    Donkeycraft._gen._seedRng = _seedRng;
    Donkeycraft._gen._rng = _rng;
    Donkeycraft._gen._hash2D = _hash2D;
    Donkeycraft._gen._hash3D = _hash3D;

})();