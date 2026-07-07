// Donkeycraft — Simplified Biome System
// Four biomes: Grass, Arctic, Desert, Forest — each with unique terrain parameters.
// Integrates with SurfaceGenerator for biome-specific heightmap generation.
//
// @module biome
// @description Simplified 4-biome system with terrain parameters and visual properties
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    // ============================================================
    // Biome ID Constants
    // ============================================================

    /**
     * Biome ID constants for the 4 simplified biomes.
     * @enum {number}
     */
    Donkeycraft.BiomeID = {
        GRASS: 0,
        ARCTIC: 1,
        DESERT: 2,
        FOREST: 3
    };

    // ============================================================
    // Biome Definitions
    // ============================================================

    /**
     * Biome type flags — populated after BiomeID is initialized.
     * @type {Object.<number, {isDesert: boolean, isArctic: boolean, isForest: boolean}>}
     * @private
     */
    var _biomeTypeFlags = {};

    /**
     * Initialize biome type flags from BiomeID constants.
     * Uses deferred lookup to handle module load order variations.
     * Falls back to direct ID comparison if BiomeID is not yet available.
     * @private
     */
    function _initBiomeTypeFlags() {
        if (!Donkeycraft.BiomeID) {
            // BiomeID not yet available — use direct ID comparison fallback
            for (var i = 0; i < _allBiomesInternal.length; i++) {
                var b = _allBiomesInternal[i];
                _biomeTypeFlags[b.id] = {
                    isDesert: b.id === 2,
                    isArctic: b.id === 1,
                    isForest: b.id === 3
                };
            }
            return;
        }
        for (var i = 0; i < _allBiomesInternal.length; i++) {
            var b = _allBiomesInternal[i];
            _biomeTypeFlags[b.id] = {
                isDesert: b.id === Donkeycraft.BiomeID.DESERT,
                isArctic: b.id === Donkeycraft.BiomeID.ARCTIC,
                isForest: b.id === Donkeycraft.BiomeID.FOREST
            };
        }
    }

    /**
     * Biome — defines a biome's visual and terrain properties.
     * Uses deferred type checking via getters to avoid load order issues
     * with Donkeycraft.BiomeID initialization.
     * @param {number} id - Biome ID.
     * @param {string} name - Biome name.
     * @param {number} temperature - Biome temperature [0, 1].
     * @param {number} rainfall - Biome rainfall [0, 1].
     * @param {number} groundColor - Ground color RGB integer.
     * @param {number} grassColor - Grass color (or null for auto).
     * @param {number} leafColor - Leaf color (or null for auto).
     * @param {number} waterColor - Water color override.
     * @param {boolean} hasSnow - Whether biome has snow.
     * @param {boolean} hasIce - Whether biome has ice.
     * @param {Object} decoration - Surface decoration counts per chunk.
     * @param {Object} spawnRates - Mob spawn rates.
     */
    Donkeycraft.Biome = function (id, name, temperature, rainfall, groundColor, grassColor, leafColor, waterColor, hasSnow, hasIce, decoration, spawnRates) {
        /**
         * Biome ID.
         * @type {number}
         */
        this.id = id;

        /**
         * Biome name.
         * @type {string}
         */
        this.name = name;

        /**
         * Temperature [0, 1].
         * @type {number}
         */
        this.temperature = temperature;

        /**
         * Rainfall [0, 1].
         * @type {number}
         */
        this.rainfall = rainfall;

        /**
         * Ground color as RGB integer.
         * @type {number}
         */
        this.groundColor = groundColor || 0x808080;

        /**
         * Grass color override, or null for auto-computed.
         * @type {number|null}
         */
        this.grassColor = grassColor !== undefined ? grassColor : null;

        /**
         * Leaf color override, or null for auto-computed.
         * @type {number|null}
         */
        this.leafColor = leafColor !== undefined ? leafColor : null;

        /**
         * Water color override.
         * @type {number}
         */
        this.waterColor = waterColor || 0x4fc3f7;

        /**
         * Whether this biome has snow.
         * @type {boolean}
         */
        this.hasSnow = hasSnow || false;

        /**
         * Whether this biome has ice.
         * @type {boolean}
         */
        this.hasIce = hasIce || false;

        /**
         * Whether this biome is a desert.
         * Uses deferred lookup via _biomeTypeFlags to avoid load order issues.
         * @type {boolean}
         */
        var self = this;
        Object.defineProperty(this, 'isDesert', {
            get: function() { return _biomeTypeFlags[id] ? _biomeTypeFlags[id].isDesert : (id === 2); }
        });

        /**
         * Whether this biome is arctic.
         * Uses deferred lookup via _biomeTypeFlags to avoid load order issues.
         * @type {boolean}
         */
        Object.defineProperty(this, 'isArctic', {
            get: function() { return _biomeTypeFlags[id] ? _biomeTypeFlags[id].isArctic : (id === 1); }
        });

        /**
         * Whether this biome is a forest.
         * Uses deferred lookup via _biomeTypeFlags to avoid load order issues.
         * @type {boolean}
         */
        Object.defineProperty(this, 'isForest', {
            get: function() { return _biomeTypeFlags[id] ? _biomeTypeFlags[id].isForest : (id === 3); }
        });

        /**
         * Mob spawn rates: {passive, hostile, aqua}.
         * @type {{passive: number, hostile: number, aqua: number}}
         */
        this.spawnRates = spawnRates || {
            passive: 0.01,
            hostile: 0.025,
            aqua: 0.005
        };

        /**
         * Surface decoration: trees, flowers, grass counts per chunk.
         * These values are baseline estimates — StructureGenerator handles actual placement.
         * @type {{trees: number, flowers: number, grass: number, cacti: number}}
         */
        this.decoration = decoration || { trees: 2, flowers: 0, grass: 4, cacti: 0 };
    };

    // ============================================================
    // Biome Registry
    // ============================================================

    /**
     * Internal array of biomes for type flag initialization.
     * @type {Donkeycraft.Biome[]}
     * @private
     */
    var _allBiomesInternal = [];

    /**
     * BiomeRegistry — central registry for the 4 simplified biomes (grass, arctic, desert, forest).
     * Provides lookup by ID, name, and terrain parameter access via SurfaceGenerator.
     * Safely handles module load order variations by deferring BiomeID-dependent operations.
     * @namespace
     */
    Donkeycraft.BiomeRegistry = (function () {
        var _biomes = {};         // Map: id → Biome
        var _byName = {};         // Map: name → Biome
        var _allBiomes = [];      // Array of all Biome instances
        var _initialized = false; // Track whether init has been called

        /**
         * Initialize the biome registry with the 4 simplified biomes.
         * Safe to call multiple times — only initializes once.
         * @private
         */
        function init() {
            if (_initialized) return; // Prevent re-initialization
            _initialized = true;
            // Grass biome — moderate terrain, mixed elevation
            var grassBiome = new Donkeycraft.Biome(
                Donkeycraft.BiomeID.GRASS,
                'grass',
                0.7,    // temperature
                0.5,    // rainfall
                0x6b8e23,   // groundColor (olivedrab)
                0x4a8c3f,   // grassColor
                0x3a7a35,   // leafColor
                0x4fc3f7,   // waterColor
                false,        // hasSnow
                false,        // hasIce
                { trees: 3, flowers: 3, grass: 6, cacti: 0 },  // decoration
                { passive: 0.01, hostile: 0.025, aqua: 0.005 }  // spawnRates
            );

            // Arctic biome — flatter terrain, snow caps, ice lakes
            var arcticBiome = new Donkeycraft.Biome(
                Donkeycraft.BiomeID.ARCTIC,
                'arctic',
                0.05,   // temperature
                0.3,    // rainfall
                0xe8e8e8,   // groundColor (snow white)
                0xc8d8c8,   // grassColor (frozen green-gray)
                0xa8c8a8,   // leafColor
                0x87ceeb,   // waterColor (icy blue)
                true,       // hasSnow
                true,       // hasIce
                { trees: 2, flowers: 0, grass: 2, cacti: 0 },  // decoration
                { passive: 0.005, hostile: 0.02, aqua: 0.002 }  // spawnRates
            );

            // Desert biome — rolling dunes, extreme elevation variance
            var desertBiome = new Donkeycraft.Biome(
                Donkeycraft.BiomeID.DESERT,
                'desert',
                1.0,    // temperature
                0.0,    // rainfall
                0xf4a460,   // groundColor (sandy brown)
                0xd4b968,   // grassColor (dry straw)
                0xb8a050,   // leafColor
                0x4fc3f7,   // waterColor
                false,        // hasSnow
                false,        // hasIce
                { trees: 0, flowers: 0, grass: 0, cacti: 4 },  // decoration
                { passive: 0.005, hostile: 0.035, aqua: 0 }  // spawnRates
            );

            // Forest biome — rich variation, valleys for water, moderate mountains
            var forestBiome = new Donkeycraft.Biome(
                Donkeycraft.BiomeID.FOREST,
                'forest',
                0.6,    // temperature
                0.7,    // rainfall
                0x228b22,   // groundColor (forest green)
                0x3a7a3a,   // grassColor
                0x2d6e2d,   // leafColor
                0x4fc3f7,   // waterColor
                false,        // hasSnow
                false,        // hasIce
                { trees: 8, flowers: 2, grass: 3, cacti: 0 },  // decoration
                { passive: 0.008, hostile: 0.03, aqua: 0.003 }  // spawnRates
            );

            _biomes[Donkeycraft.BiomeID.GRASS] = grassBiome;
            _biomes[Donkeycraft.BiomeID.ARCTIC] = arcticBiome;
            _biomes[Donkeycraft.BiomeID.DESERT] = desertBiome;
            _biomes[Donkeycraft.BiomeID.FOREST] = forestBiome;

            _allBiomes.push(grassBiome, arcticBiome, desertBiome, forestBiome);
            _allBiomesInternal.push(grassBiome, arcticBiome, desertBiome, forestBiome);

            // Build reverse lookup maps
            for (var i = 0; i < _allBiomes.length; i++) {
                var b = _allBiomes[i];
                _byName[b.name] = b;
            }

            // Initialize biome type flags after BiomeID is defined
            _initBiomeTypeFlags();
        }

        /**
         * Get a biome by ID.
         * @param {number} id - Biome ID.
         * @returns {Donkeycraft.Biome|null} The biome instance, or null if not found.
         */
        function getBiomeById(id) {
            if (!isFinite(id)) return null;
            return _biomes[Math.floor(id)] || null;
        }

        /**
         * Get a biome by name.
         * @param {string} name - Biome name ('grass', 'arctic', 'desert', 'forest').
         * @returns {Donkeycraft.Biome|null} The biome instance, or null if not found.
         */
        function getBiomeByName(name) {
            if (!name || typeof name !== 'string') return null;
            return _byName[name.trim().toLowerCase()] || null;
        }

        /**
         * Get all biomes as an array (copy, not reference).
         * @returns {Donkeycraft.Biome[]} Copy of the internal biome array.
         */
        function getAllBiomes() {
            return _allBiomes.slice();
        }

        /**
         * Get the number of registered biomes.
         * @returns {number} Count of registered biomes (always 4).
         */
        function getBiomeCount() {
            return _allBiomes.length;
        }

        /**
         * Check if a biome exists for the given ID.
         * @param {number} id - Biome ID.
         * @returns {boolean} True if a biome exists for this ID.
         */
        function hasBiome(id) {
            return id in _biomes;
        }

        /**
         * Get terrain parameters for a biome (delegates to SurfaceGenerator).
         * @param {number|string} biomeId - Biome ID or name.
         * @returns {Object|null} Terrain parameters object, or null if not found.
         */
        function getTerrainParameters(biomeId) {
            if (!biomeId && biomeId !== 0) return null;

            // Resolve biome name from ID if needed
            var biomeName = biomeId;
            if (typeof biomeId === 'number') {
                var biome = getBiomeById(biomeId);
                if (!biome) return null;
                biomeName = biome.name;
            } else if (typeof biomeId === 'string') {
                var resolved = getBiomeByName(biomeId);
                if (!resolved) return null;
                biomeName = resolved.name;
            }

            // Delegate to SurfaceGenerator for terrain parameters
            if (Donkeycraft.SurfaceGenerator && typeof Donkeycraft.SurfaceGenerator.getBiomeParameters === 'function') {
                try {
                    return Donkeycraft.SurfaceGenerator.getBiomeParameters(biomeName);
                } catch (e) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[BiomeRegistry] Error getting terrain parameters for "' + biomeName + '":', e && e.message ? e.message : String(e));
                    }
                }
            }
            return null;
        }

        /**
         * Get a random biome from the registry.
         * @returns {Donkeycraft.Biome} A random biome instance.
         */
        function getRandomBiome() {
            if (_allBiomes.length === 0) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[BiomeRegistry] No biomes registered, cannot return random biome');
                }
                return null;
            }
            return _allBiomes[Math.floor(Math.random() * _allBiomes.length)];
        }

        // Initialize on load (deferred to ensure all modules are loaded)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            // Use requestAnimationFrame to defer initialization to next frame
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(init);
            } else {
                setTimeout(init, 0);
            }
        }

        /**
         * Donkeycraft.BiomeRegistry — central registry for the 4 simplified biomes.
         * @namespace
         */
        return {
            getBiomeById: getBiomeById,
            getBiomeByName: getBiomeByName,
            getAllBiomes: getAllBiomes,
            getBiomeCount: getBiomeCount,
            hasBiome: hasBiome,
            getRandomBiome: getRandomBiome,
            getTerrainParameters: getTerrainParameters,
            isReady: function() { return _initialized; }
        };
    })();

})();