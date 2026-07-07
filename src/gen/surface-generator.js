// Donkeycraft — Fractal Surface Heightmap Generator
// Multi-pass terrain height generation using fBm + ridged multifractal noise.
// Produces natural-looking terrain with valleys, mountains, lakes, and shore transitions.
//
// @module surface-generator
// @description 5-pass fractal heightmap generation for biome-aware terrain
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    var CHUNK_SIZE = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
    var WORLD_HEIGHT = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

    // ============================================================
    // Biome Terrain Parameters
    // ============================================================

    /**
     * Terrain parameters for each of the 4 simplified biomes.
     * Each biome gets unique noise scales, base heights, and variation settings
     * to produce distinct terrain characteristics.
     *
     * @type {Object.<string, {
     *   id: number,
     *   name: string,
     *   seaLevel: number,
     *   continentalScale: number,
     *   terrainScale: number,
     *   detailScale: number,
     *   ridgeScale: number,
     *   microScale: number,
     *   continentalOctaves: number,
     *   terrainOctaves: number,
     *   detailOctaves: number,
     *   ridgeOctaves: number,
     *   microOctaves: number,
     *   baseHeight: number,
     *   heightVariation: number,
     *   ridgeAmplitude: number,
     *   ridgePersistence: number,
     *   ridgeLacunarity: number,
     *   ridgeGain: number,
     *   valleyThreshold: number,
     *   shoreLevelMin: number,
     *   shoreLevelMax: number,
     *   lakeBasinMin: number,
     *   hasSnow: boolean,
     *   hasIce: boolean,
     *   hasDesertDunes: boolean
     * }>}
     */
    var BIOME_PARAMETERS = {
        grass: {
            id: 0,
            name: 'grass',
            seaLevel: 63,
            continentalScale: 0.003,
            terrainScale: 0.015,
            detailScale: 0.05,
            ridgeScale: 0.012,
            microScale: 0.1,
            continentalOctaves: 4,
            terrainOctaves: 3,
            detailOctaves: 2,
            ridgeOctaves: 4,
            microOctaves: 2,
            baseHeight: 64,
            heightVariation: 30,
            ridgeAmplitude: 0.5,
            ridgePersistence: 0.5,
            ridgeLacunarity: 2.0,
            ridgeGain: 2.0,
            valleyThreshold: -0.3,
            shoreLevelMin: 55,
            shoreLevelMax: 68,
            lakeBasinMin: 45,
            hasSnow: false,
            hasIce: false,
            hasDesertDunes: false
        },
        arctic: {
            id: 1,
            name: 'arctic',
            seaLevel: 58,
            continentalScale: 0.002,
            terrainScale: 0.01,
            detailScale: 0.04,
            ridgeScale: 0.008,
            microScale: 0.08,
            continentalOctaves: 5,
            terrainOctaves: 2,
            detailOctaves: 2,
            ridgeOctaves: 3,
            microOctaves: 2,
            baseHeight: 55,
            heightVariation: 15,
            ridgeAmplitude: 0.4,
            ridgePersistence: 0.4,
            ridgeLacunarity: 1.8,
            ridgeGain: 1.5,
            valleyThreshold: -0.2,
            shoreLevelMin: 50,
            shoreLevelMax: 62,
            lakeBasinMin: 40,
            hasSnow: true,
            hasIce: true,
            hasDesertDunes: false
        },
        desert: {
            id: 2,
            name: 'desert',
            seaLevel: 60,
            continentalScale: 0.004,
            terrainScale: 0.018,
            detailScale: 0.06,
            ridgeScale: 0.015,
            microScale: 0.12,
            continentalOctaves: 3,
            terrainOctaves: 4,
            detailOctaves: 3,
            ridgeOctaves: 5,
            microOctaves: 3,
            baseHeight: 65,
            heightVariation: 45,
            ridgeAmplitude: 0.6,
            ridgePersistence: 0.5,
            ridgeLacunarity: 2.2,
            ridgeGain: 2.5,
            valleyThreshold: -0.5,
            shoreLevelMin: 52,
            shoreLevelMax: 65,
            lakeBasinMin: 35,
            hasSnow: false,
            hasIce: false,
            hasDesertDunes: true
        },
        forest: {
            id: 3,
            name: 'forest',
            seaLevel: 63,
            continentalScale: 0.003,
            terrainScale: 0.012,
            detailScale: 0.045,
            ridgeScale: 0.01,
            microScale: 0.09,
            continentalOctaves: 4,
            terrainOctaves: 4,
            detailOctaves: 3,
            ridgeOctaves: 4,
            microOctaves: 2,
            baseHeight: 62,
            heightVariation: 35,
            ridgeAmplitude: 0.5,
            ridgePersistence: 0.5,
            ridgeLacunarity: 2.0,
            ridgeGain: 2.0,
            valleyThreshold: -0.25,
            shoreLevelMin: 54,
            shoreLevelMax: 67,
            lakeBasinMin: 42,
            hasSnow: false,
            hasIce: false,
            hasDesertDunes: false
        }
    };

    // ============================================================
    // Noise Composition System
    // ============================================================

    /**
     * Create a noise composition for multi-pass terrain generation.
     * Uses the parameters from biome config to set up 5 passes.
     * @param {Object} params - Biome terrain parameters.
     * @returns {Array} Array of layer definitions for _composeNoise.
     * @private
     */
    function _createComposition(params) {
        return [
            {
                type: 'fbm',
                xScale: params.continentalScale,
                zScale: params.continentalScale,
                octaves: params.continentalOctaves,
                persistence: 0.5,
                lacunarity: 2.0,
                weight: 0.4
            },
            {
                type: 'fbm',
                xScale: params.terrainScale,
                zScale: params.terrainScale,
                octaves: params.terrainOctaves,
                persistence: 0.5,
                lacunarity: 2.0,
                weight: 0.3
            },
            {
                type: 'fbm',
                xScale: params.detailScale,
                zScale: params.detailScale,
                octaves: params.detailOctaves,
                persistence: 0.5,
                lacunarity: 2.0,
                weight: 0.15
            },
            {
                type: 'ridged',
                xScale: params.ridgeScale,
                zScale: params.ridgeScale,
                octaves: params.ridgeOctaves,
                persistence: params.ridgePersistence,
                lacunarity: params.ridgeLacunarity,
                gain: params.ridgeGain,
                weight: 0.15
            },
            {
                type: 'fbm',
                xScale: params.microScale,
                zScale: params.microScale,
                octaves: params.microOctaves,
                persistence: 0.5,
                lacunarity: 2.0,
                weight: 0.1
            }
        ];
    }

    // ============================================================
    // Heightmap Generation
    // ============================================================

    /**
     * Generate a heightmap for a chunk at the given world coordinates.
     * Uses multi-pass fractal noise with biome-specific parameters.
     * Validates all inputs and handles edge cases gracefully.
     * @param {number} chunkX - Chunk X coordinate (in chunks).
     * @param {number} chunkZ - Chunk Z coordinate (in chunks).
     * @param {string} biomeId - Biome name ('grass', 'arctic', 'desert', 'forest').
     * @returns {number[]} Heightmap array of size CHUNK_SIZE × CHUNK_SIZE with height values.
     */
    function generateHeightmap(chunkX, chunkZ, biomeId) {
        // Validate inputs: ensure finite numbers and coerce to integers
        if (!isFinite(chunkX) || !isFinite(chunkZ) || chunkX === null || chunkZ === null) {
            return _createEmptyHeightmap();
        }

        // Validate biome parameter
        if (!biomeId || typeof biomeId !== 'string' || biomeId.trim() === '') {
            biomeId = 'grass';
        } else {
            // Trim whitespace and lowercase for consistency
            biomeId = biomeId.trim().toLowerCase();
        }

        // Validate biome parameters exist
        var params = BIOME_PARAMETERS[biomeId];
        if (!params) {
            return _createEmptyHeightmap();
        }

        // Validate biome parameters are numeric and positive
        var validParams = (
            isFinite(params.continentalScale) && isFinite(params.terrainScale) &&
            isFinite(params.detailScale) && isFinite(params.ridgeScale) &&
            isFinite(params.microScale) && isFinite(params.baseHeight) &&
            isFinite(params.heightVariation) && params.heightVariation >= 0
        );
        if (!validParams) {
            return _createEmptyHeightmap();
        }

        var composition = _createComposition(params);
        var heightmap = new Array(CHUNK_SIZE * CHUNK_SIZE);
        var seaLevel = params.seaLevel;

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var z = 0; z < CHUNK_SIZE; z++) {
                // Global world coordinates for seamless chunk boundaries
                var worldX = chunkX * CHUNK_SIZE + x;
                var worldZ = chunkZ * CHUNK_SIZE + z;

                // Pass 1: Continental noise — land vs water regions
                var continentalNoise = _safeFbm(worldX * params.continentalScale, 0, worldZ * params.continentalScale, params.continentalOctaves);

                // Pass 2: Terrain shaping — hills/valleys
                var terrainNoise = _safeFbm(worldX * params.terrainScale, 0, worldZ * params.terrainScale, params.terrainOctaves);

                // Pass 3: Detail noise — texture and variation
                var detailNoise = _safeFbm(worldX * params.detailScale, 0, worldZ * params.detailScale, params.detailOctaves);

                // Pass 4: Ridged multifractal — mountains/cliffs
                var ridgeNoise = _safeRidgedMultifractal(worldX * params.ridgeScale, 0, worldZ * params.ridgeScale, params.ridgeOctaves, params.ridgeAmplitude, params.ridgeLacunarity, params.ridgeGain);

                // Pass 5: Micro-detail — surface roughness
                var microNoise = _safeFbm(worldX * params.microScale, 0, worldZ * params.microScale, params.microOctaves);

                // Combine all passes with biome-specific weights
                var height = params.baseHeight;

                // Continental influence (30%) — determines broad land/water distribution
                height += _clampNoise(continentalNoise) * params.heightVariation * 0.3;

                // Terrain shaping (25%) — hills and valleys
                height += _clampNoise(terrainNoise) * params.heightVariation * 0.25;

                // Detail noise (15%) — local texture
                height += _clampNoise(detailNoise) * params.heightVariation * 0.15;

                // Ridged multifractal (20%) — mountains and cliffs
                height += _clampNoise(ridgeNoise) * params.heightVariation * 0.2;

                // Micro-detail (10%) — surface roughness
                height += _clampNoise(microNoise) * params.heightVariation * 0.1;

                // Apply shore/beach transitions for smooth coastlines
                // Pass all noise values to match the exact height calculation formula
                var distFromShore = _calculateShoreDistance(continentalNoise, terrainNoise, detailNoise, ridgeNoise, microNoise, params);
                if (distFromShore > 0) {
                    // Smooth transition between land and water
                    height = height + distFromShore * (seaLevel - height) * 0.3;
                }

                // Detect and carve lake basins in low areas
                var valleyStrength = _safeValleyNoise(
                    worldX * params.continentalScale * 1.5,
                    0, worldZ * params.continentalScale * 1.5,
                    3
                );
                if (valleyStrength > 0.7 && height < params.lakeBasinMin) {
                    // Carve basin floor
                    height = Math.min(height, params.lakeBasinMin - 3);
                }

                // Clamp to valid world range
                height = Math.max(1, Math.min(WORLD_HEIGHT - 10, Math.floor(height)));

                heightmap[x + z * CHUNK_SIZE] = height;
            }
        }

        return heightmap;
    }

    /**
     * Generate an empty heightmap filled with sea level.
     * Used as fallback for invalid inputs.
     * @returns {number[]} Empty heightmap array filled with grass biome sea level (63).
     * @private
     */
    function _createEmptyHeightmap() {
        var defaultParams = BIOME_PARAMETERS.grass;
        var seaLevel = isFinite(defaultParams.seaLevel) ? defaultParams.seaLevel : 63;
        var result = new Array(CHUNK_SIZE * CHUNK_SIZE);
        for (var i = 0; i < result.length; i++) {
            result[i] = seaLevel;
        }
        return result;
    }

    /**
     * Check if biome parameters are valid (all required numeric fields are finite).
     * @param {Object} params - Biome terrain parameters object.
     * @returns {boolean} True if all required parameters are valid.
     * @private
     */
    function _validateBiomeParams(params) {
        if (!params || typeof params !== 'object') return false;
        var required = ['continentalScale', 'terrainScale', 'detailScale', 'ridgeScale', 'microScale',
            'baseHeight', 'heightVariation', 'seaLevel', 'lakeBasinMin'];
        for (var i = 0; i < required.length; i++) {
            if (!isFinite(params[required[i]])) return false;
        }
        return true;
    }

    /**
     * Safely call fBm noise, catching errors and returning 0 on failure.
     * Delegates to Donkeycraft._gen._fbm when available.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     * @param {number} octaves - Number of octaves (default 3).
     * @returns {number} Noise value, clamped to [-1, 1].
     * @private
     */
    function _safeFbm(x, y, z, octaves) {
        try {
            if (Donkeycraft._gen && typeof Donkeycraft._gen._fbm === 'function') {
                var val = Donkeycraft._gen._fbm(x, y, z, octaves || 3, 0.5, 2.0);
                return _clampNoise(val);
            }
        } catch (e) { /* fallback */ }
        // Simple fallback: single octave noise
        if (Donkeycraft._gen && typeof Donkeycraft._gen._noise2D === 'function') {
            try {
                return _clampNoise(Donkeycraft._gen._noise2D(x, z));
            } catch (e2) { /* ignore */ }
        }
        return 0;
    }

    /**
     * Safely call ridged multifractal noise, catching errors and returning 0 on failure.
     * Delegates to Donkeycraft._gen._ridgedMultifractal when available.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     * @param {number} octaves - Number of octaves (default 3).
     * @param {number} amplitude - Amplitude/persistence per octave.
     * @param {number} frequency - Lacunarity/frequency multiplier.
     * @param {number} gain - Ridge sharpness gain.
     * @returns {number} Noise value, clamped to [-1, 1].
     * @private
     */
    function _safeRidgedMultifractal(x, y, z, octaves, amplitude, frequency, gain) {
        try {
            if (Donkeycraft._gen && typeof Donkeycraft._gen._ridgedMultifractal === 'function') {
                var val = Donkeycraft._gen._ridgedMultifractal(x, y, z, octaves || 3, amplitude || 0.5, frequency || 2.0, gain || 2.0);
                return _clampNoise(val);
            }
        } catch (e) { /* fallback */ }
        // Simple fallback: absolute noise for ridges
        if (Donkeycraft._gen && typeof Donkeycraft._gen._noise2D === 'function') {
            try {
                return _clampNoise(Math.abs(Donkeycraft._gen._noise2D(x, z)) * 2 - 1);
            } catch (e2) { /* ignore */ }
        }
        return 0;
    }

    /**
     * Safely call valley noise, catching errors and returning 0 on failure.
     * Delegates to Donkeycraft._gen._valleyNoise when available.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     * @param {number} octaves - Number of octaves (default 3).
     * @returns {number} Valley strength [0, 1] (0 = flat/high, 1 = deep valley).
     * @private
     */
    function _safeValleyNoise(x, y, z, octaves) {
        try {
            if (Donkeycraft._gen && typeof Donkeycraft._gen._valleyNoise === 'function') {
                return Donkeycraft._gen._valleyNoise(x, y, z, octaves || 3, 0.5, 2.0);
            }
        } catch (e) { /* fallback */ }
        // Simple fallback: inverted fBm
        if (Donkeycraft._gen && typeof Donkeycraft._gen._fbm === 'function') {
            try {
                var fbmVal = Donkeycraft._gen._fbm(x, y, z, octaves || 3, 0.5, 2.0);
                return (1 - _clampNoise(fbmVal)) / 2;
            } catch (e2) { /* ignore */ }
        }
        return 0;
    }

    /**
     * Clamp a noise value to [-1, 1] to prevent NaN/Infinity propagation.
     * @param {number} val - Raw noise value.
     * @returns {number} Clamped value in range [-1, 1].
     * @private
     */
    function _clampNoise(val) {
        if (!isFinite(val)) return 0;
        return Math.max(-1, Math.min(1, val));
    }

    /**
     * Calculate shore distance factor for coastline smoothing.
     * Shore transition occurs when estimated height is between shoreLevelMin and shoreLevelMax,
     * creating smooth gradients that prevent harsh cliff-like coastlines.
     * @param {number} continentalNoise - Continental noise value [-1, 1].
     * @param {number} terrainNoise - Terrain shaping noise value [-1, 1].
     * @param {number} detailNoise - Detail noise value [-1, 1].
     * @param {number} ridgeNoise - Ridged multifractal noise value [-1, 1].
     * @param {number} microNoise - Micro-detail noise value [-1, 1].
     * @param {Object} params - Biome terrain parameters.
     * @returns {number} Shore distance factor [0, 1] (0 = no transition, 1 = full shore).
     * @private
     */
    function _calculateShoreDistance(continentalNoise, terrainNoise, detailNoise, ridgeNoise, microNoise, params) {
        // Estimate terrain height using the EXACT same combination formula as generateHeightmap
        var estimatedHeight = params.baseHeight
            + _clampNoise(continentalNoise) * params.heightVariation * 0.3
            + _clampNoise(terrainNoise) * params.heightVariation * 0.25
            + _clampNoise(detailNoise) * params.heightVariation * 0.15
            + _clampNoise(ridgeNoise) * params.heightVariation * 0.2
            + _clampNoise(microNoise) * params.heightVariation * 0.1;

        // Shore zone: terrain is between shoreLevelMin and shoreLevelMax
        if (estimatedHeight < params.shoreLevelMin || estimatedHeight > params.shoreLevelMax) {
            return 0;
        }
        // Smooth transition in shore zone
        return (estimatedHeight - params.shoreLevelMin) / (params.shoreLevelMax - params.shoreLevelMin);
    }

    /**
     * Get terrain height at a specific world X, Z position within a heightmap.
     * @param {number} localX - Local X within chunk [0, 15].
     * @param {number} localZ - Local Z within chunk [0, 15].
     * @param {number[]} heightmap - Heightmap array.
     * @returns {number} Terrain height at this position (64 if not found).
     */
    function getHeightAt(localX, localZ, heightmap) {
        if (!heightmap || !Array.isArray(heightmap)) return 64;
        return heightmap[localX + localZ * CHUNK_SIZE] || 64;
    }

    /**
     * Get biome parameters by name.
     * Validates that all required numeric fields are finite before returning.
     * @param {string} biomeName - Biome name ('grass', 'arctic', 'desert', 'forest').
     * @returns {Object|null} Validated biome terrain parameters, or null if not found/invalid.
     */
    function getBiomeParameters(biomeName) {
        if (!biomeName || typeof biomeName !== 'string') return null;
        var params = BIOME_PARAMETERS[biomeName];
        if (!params) return null;
        // Validate params are complete and numeric
        if (_validateBiomeParams(params)) {
            return params;
        }
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[SurfaceGenerator] Biome "' + biomeName + '" has invalid parameters, skipping');
        }
        return null;
    }

    /**
     * Get all available biome names.
     * @returns {string[]} Array of valid biome names ('grass', 'arctic', 'desert', 'forest').
     */
    function getAvailableBiomes() {
        var names = [];
        for (var key in BIOME_PARAMETERS) {
            if (BIOME_PARAMETERS.hasOwnProperty(key)) {
                if (_validateBiomeParams(BIOME_PARAMETERS[key])) {
                    names.push(BIOME_PARAMETERS[key].name);
                }
            }
        }
        return names.length > 0 ? names : ['grass', 'arctic', 'desert', 'forest'];
    }

    // ============================================================
    // Noise Helper Functions (delegating to noise.js)
    // ============================================================

    /**
     * Fractal Brownian Motion — multi-octave noise accumulation.
     * Deprecated: Use _safeFbm instead for error handling.
     * Kept for backward compatibility with external callers.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     * @param {number} octaves - Number of octaves.
     * @param {number} amplitude - Persistence per octave.
     * @param {number} frequency - Lacunarity per octave.
     * @returns {number} Normalized noise value [-1, 1].
     * @private
     */
    function _fbm(x, y, z, octaves, amplitude, frequency) {
        return _safeFbm(x, y, z, octaves);
    }

    /**
     * Ridged Multifractal — mountain-like ridge generation.
     * Deprecated: Use _safeRidgedMultifractal instead for error handling.
     * Kept for backward compatibility with external callers.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     * @param {number} octaves - Number of octaves.
     * @param {number} amplitude - Persistence per octave.
     * @param {number} frequency - Lacunarity per octave.
     * @param {number} gain - Ridge sharpness.
     * @returns {number} Normalized noise value [-1, 1].
     * @private
     */
    function _ridgedMultifractal(x, y, z, octaves, amplitude, frequency, gain) {
        return _safeRidgedMultifractal(x, y, z, octaves, amplitude, frequency, gain);
    }

    /**
     * Valley Detection Noise — identifies basin regions for lake formation.
     * Deprecated: Use _safeValleyNoise instead for error handling.
     * Kept for backward compatibility with external callers.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     * @param {number} octaves - Number of octaves.
     * @param {number} persistence - Amplitude multiplier per octave.
     * @param {number} lacunarity - Frequency multiplier per octave.
     * @returns {number} Valley strength [0, 1] (0 = flat/high, 1 = deep valley).
     * @private
     */
    function _valleyNoise(x, y, z, octaves, persistence, lacunarity) {
        return _safeValleyNoise(x, y, z, octaves);
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Donkeycraft.SurfaceGenerator — Fractal surface heightmap generator.
     * Uses 5-pass fBm + ridged multifractal noise for natural terrain with biome-specific parameters.
     * @namespace
     */
    Donkeycraft.SurfaceGenerator = {
        // Heightmap generation
        generateHeightmap: generateHeightmap,
        getHeightAt: getHeightAt,

        // Biome parameters (validated)
        getBiomeParameters: getBiomeParameters,
        getAvailableBiomes: getAvailableBiomes,

        // Constants access (read-only reference for external consumers)
        BIOME_PARAMETERS: BIOME_PARAMETERS
    };

})();