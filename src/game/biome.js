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
     * Biome — defines a biome's visual and terrain properties.
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
         * @type {boolean}
         */
        this.isDesert = (id === Donkeycraft.BiomeID.DESERT);

        /**
         * Whether this biome is arctic.
         * @type {boolean}
         */
        this.isArctic = (id === Donkeycraft.BiomeID.ARCTIC);

        /**
         * Whether this biome is a forest.
         * @type {boolean}
         */
        this.isForest = (id === Donkeycraft.BiomeID.FOREST);

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
         * @type {{trees: number, flowers: number, grass: number, cacti: number}}
         */
        this.decoration = decoration || { trees: 2, flowers: 0, grass: 4, cacti: 0 };
    };

    // ============================================================
    // Biome Registry
    // ============================================================

    /**
     * BiomeRegistry — central registry for the 4 simplified biomes.
     * Provides lookup by ID, name, and terrain parameter access.
     */
    Donkeycraft.BiomeRegistry = (function () {
        var _biomes = {};         // Map: id → Biome
        var _byName = {};         // Map: name → Biome
        var _allBiomes = [];      // Array of all Biome instances

        /**
         * Initialize the biome registry with the 4 simplified biomes.
         * @private
         */
        function init() {
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

            // Build reverse lookup maps
            for (var i = 0; i < _allBiomes.length; i++) {
                var b = _allBiomes[i];
                _byName[b.name] = b;
            }
        }

        /**
         * Get a biome by ID.
         * @param {number} id - Biome ID.
         * @returns {Donkeycraft.Biome|null} The biome instance, or null if not found.
         */
        function getBiomeById(id) {
            return _biomes[id] || null;
        }

        /**
         * Get a biome by name.
         * @param {string} name - Biome name ('grass', 'arctic', 'desert', 'forest').
         * @returns {Donkeycraft.Biome|null} The biome instance, or null if not found.
         */
        function getBiomeByName(name) {
            return _byName[name] || null;
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
                return Donkeycraft.SurfaceGenerator.getBiomeParameters(biomeName);
            }
            return null;
        }

        /**
         * Get a random biome from the registry.
         * @returns {Donkeycraft.Biome} A random biome instance.
         */
        function getRandomBiome() {
            return _allBiomes[Math.floor(Math.random() * _allBiomes.length)];
        }

        // Initialize on load
        init();

        return {
            getBiomeById: getBiomeById,
            getBiomeByName: getBiomeByName,
            getAllBiomes: getAllBiomes,
            getBiomeCount: getBiomeCount,
            hasBiome: hasBiome,
            getRandomBiome: getRandomBiome,
            getTerrainParameters: getTerrainParameters
        };
    })();

})();