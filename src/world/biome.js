// Donkeycraft — Biome Definitions
// Biome definitions: temperature, rainfall, colors, grass/leaf color, spawn rates.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Biome Constants
    // ============================================================

    /**
     * Biome ID constants.
     */
    Donkeycraft.BiomeID = {
        PLAINS: 1,
        DESERT: 2,
        FOREST: 3,
        SWAMP: 4,
        TAIGA: 5,
        OCEAN: 6,
        EXTREME_HILLS: 7,
        SNOWY_TUNDRA: 8,
        SUNFLOWER_PLAINS: 9,
        FLOWER_FOREST: 10,
        ICE_PLAINS: 11,
        DESERT_M: 12,
        FOREST_HILL: 13,
        TAIGA_HILL: 14,
        SWAMP_M: 15
    };

    // ============================================================
    // Biome Definitions
    // ============================================================

    /**
     * Biome — defines a biome's properties.
     * @param {number} id - Biome ID.
     * @param {string} name - Biome name.
     * @param {number} temperature - Biome temperature [0, 1].
     * @param {number} rainfall - Biome rainfall [0, 1].
     * @param {number} [groundColor=0x808080] - Ground color RGB integer.
     * @param {number} [grassColor=null] - Override grass color (null = auto from temperature/rainfall).
     * @param {number} [leafColor=null] - Override leaf color (null = auto from temperature/rainfall).
     * @param {{waterColor: number}} [config] - Additional config (e.g., water color override).
     */
    Donkeycraft.Biome = function(id, name, temperature, rainfall, groundColor, grassColor, leafColor, config) {
        config = config || {};

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
        this.waterColor = config.waterColor || 0x4fc3f7;

        /**
         * Whether this biome has snow (temperature < 0.15).
         * @type {boolean}
         */
        this.hasSnow = temperature < 0.15;

        /**
         * Whether this biome is an ocean.
         * @type {boolean}
         */
        this.isOcean = id === Donkeycraft.BiomeID.OCEAN;

        /**
         * Whether this biome is a desert.
         * @type {boolean}
         */
        this.isDesert = id === Donkeycraft.BiomeID.DESERT || id === Donkeycraft.BiomeID.DESERT_M;

        /**
         * Whether this biome is extreme hills.
         * @type {boolean}
         */
        this.isExtremeHills = id === Donkeycraft.BiomeID.EXTREME_HILLS;

        /**
         * Mob spawn rates: {passive: number, hostile: number, aqua: number}.
         * @type {{passive: number, hostile: number, aqua: number}}
         */
        this.spawnRates = {
            passive: (config.spawnRates && config.spawnRates.passive !== undefined) ? config.spawnRates.passive : 0.01,
            hostile: (config.spawnRates && config.spawnRates.hostile !== undefined) ? config.spawnRates.hostile : 0.025,
            aqua: (config.spawnRates && config.spawnRates.aqua !== undefined) ? config.spawnRates.aqua : 0.005
        };

        /**
         * Surface decoration: trees, flowers, grass counts per chunk.
         * @type {{trees: number, flowers: number, grass: number, cacti: number}}
         */
        this.decoration = config.decoration || { trees: 2, flowers: 0, grass: 4, cacti: 0 };
    };

    // ============================================================
    // Biome Registry
    // ============================================================

    /**
     * BiomeRegistry — central registry for all biome definitions.
     */
    Donkeycraft.BiomeRegistry = (function() {
        var _biomes = {};         // Map: id → Biome
        var _byName = {};         // Map: name → Biome
        var _allBiomes = [];      // Array of all Biome instances

        /**
         * Initialize the biome registry with all vanilla biomes.
         * @private
         */
        function init() {
            var biomeDefs = [
                { id: Donkeycraft.BiomeID.PLAINS, name: 'plains', temp: 0.8, rain: 0.4,
                  ground: 0x6b8e23, waterColor: 0x4fc3f7,
                  decor: { trees: 2, flowers: 3, grass: 6, cacti: 0 } },
                { id: Donkeycraft.BiomeID.DESERT, name: 'desert', temp: 1.0, rain: 0.0,
                  ground: 0xf4a460, waterColor: 0x4fc3f7,
                  decor: { trees: 0, flowers: 0, grass: 0, cacti: 3 },
                  spawn: { passive: 0.005, hostile: 0.035, aqua: 0 } },
                { id: Donkeycraft.BiomeID.FOREST, name: 'forest', temp: 0.7, rain: 0.5,
                  ground: 0x228b22, grass: 0x3a7a3a, leaf: 0x2d6e2d, waterColor: 0x4fc3f7,
                  decor: { trees: 8, flowers: 2, grass: 3, cacti: 0 } },
                { id: Donkeycraft.BiomeID.SWAMP, name: 'swamp', temp: 0.7, rain: 0.8,
                  ground: 0x556b2f, grass: 0x4a8c3f, leaf: 0x3d7a35, waterColor: 0x2d5a27,
                  decor: { trees: 4, flowers: 1, grass: 5, cacti: 0 } },
                { id: Donkeycraft.BiomeID.TAIGA, name: 'taiga', temp: 0.3, rain: 0.5,
                  ground: 0x3a5f3a, grass: 0x2d6e2d, leaf: 0x1a4a1a, waterColor: 0x4fc3f7,
                  decor: { trees: 6, flowers: 1, grass: 4, cacti: 0 },
                  spawn: { passive: 0.008, hostile: 0.03, aqua: 0.003 } },
                { id: Donkeycraft.BiomeID.OCEAN, name: 'ocean', temp: 0.5, rain: 0.5,
                  ground: 0x1a3a5c, waterColor: 0x1e5fa8,
                  decor: { trees: 0, flowers: 0, grass: 0, cacti: 0 },
                  spawn: { passive: 0, hostile: 0.015, aqua: 0.03 } },
                { id: Donkeycraft.BiomeID.EXTREME_HILLS, name: 'extreme_hills', temp: 0.5, rain: 0.4,
                  ground: 0x8b7355, waterColor: 0x4fc3f7,
                  decor: { trees: 1, flowers: 1, grass: 5, cacti: 0 },
                  spawn: { passive: 0.006, hostile: 0.035, aqua: 0.002 } },
                { id: Donkeycraft.BiomeID.SNOWY_TUNDRA, name: 'snowy_tundra', temp: 0.05, rain: 0.3,
                  ground: 0xe8e8e8, grass: 0xc8d8c8, leaf: 0xa8c8a8, waterColor: 0x4fc3f7,
                  decor: { trees: 3, flowers: 0, grass: 2, cacti: 0 },
                  spawn: { passive: 0.005, hostile: 0.02, aqua: 0.002 } },
                { id: Donkeycraft.BiomeID.SUNFLOWER_PLAINS, name: 'sunflower_plains', temp: 0.8, rain: 0.4,
                  ground: 0x6b8e23, waterColor: 0x4fc3f7,
                  decor: { trees: 2, flowers: 8, grass: 6, cacti: 0 } },
                { id: Donkeycraft.BiomeID.FLOWER_FOREST, name: 'flower_forest', temp: 0.7, rain: 0.5,
                  ground: 0x228b22, grass: 0x3a7a3a, leaf: 0x2d6e2d, waterColor: 0x4fc3f7,
                  decor: { trees: 8, flowers: 15, grass: 3, cacti: 0 } },
                { id: Donkeycraft.BiomeID.ICE_PLAINS, name: 'ice_plains', temp: 0.05, rain: 0.3,
                  ground: 0xe8e8e8, waterColor: 0x4fc3f7,
                  decor: { trees: 1, flowers: 0, grass: 2, cacti: 0 },
                  spawn: { passive: 0.004, hostile: 0.025, aqua: 0.002 } },
                { id: Donkeycraft.BiomeID.DESERT_M, name: 'desert_hills', temp: 1.0, rain: 0.0,
                  ground: 0xf4a460, waterColor: 0x4fc3f7,
                  decor: { trees: 0, flowers: 0, grass: 0, cacti: 3 },
                  spawn: { passive: 0.005, hostile: 0.035, aqua: 0 } },
                { id: Donkeycraft.BiomeID.FOREST_HILL, name: 'forest_hills', temp: 0.7, rain: 0.5,
                  ground: 0x228b22, grass: 0x3a7a3a, leaf: 0x2d6e2d, waterColor: 0x4fc3f7,
                  decor: { trees: 10, flowers: 2, grass: 3, cacti: 0 } },
                { id: Donkeycraft.BiomeID.TAIGA_HILL, name: 'taiga_hills', temp: 0.3, rain: 0.5,
                  ground: 0x3a5f3a, grass: 0x2d6e2d, leaf: 0x1a4a1a, waterColor: 0x4fc3f7,
                  decor: { trees: 8, flowers: 1, grass: 4, cacti: 0 },
                  spawn: { passive: 0.008, hostile: 0.03, aqua: 0.003 } },
                { id: Donkeycraft.BiomeID.SWAMP_M, name: 'swamp_hills', temp: 0.7, rain: 0.8,
                  ground: 0x556b2f, grass: 0x4a8c3f, leaf: 0x3d7a35, waterColor: 0x2d5a27,
                  decor: { trees: 5, flowers: 1, grass: 5, cacti: 0 } }
            ];

            for (var i = 0; i < biomeDefs.length; i++) {
                var def = biomeDefs[i];
                var biome = new Donkeycraft.Biome(
                    def.id, def.name, def.temp, def.rain,
                    def.ground, def.grass, def.leaf,
                    { waterColor: def.waterColor, decoration: def.decor, spawnRates: def.spawn }
                );
                _biomes[def.id] = biome;
                _allBiomes.push(biome);
            }

            // Build reverse lookup maps
            for (var j = 0; j < _allBiomes.length; j++) {
                var b = _allBiomes[j];
                _byName[b.name] = b;
            }
        }

        /**
         * Get a biome by ID.
         * @param {number} id - Biome ID.
         * @returns {Donkeycraft.Biome|null} The biome, or null if not found.
         */
        function getBiomeById(id) {
            return _biomes[id] || null;
        }

        /**
         * Get a biome by name.
         * @param {string} name - Biome name.
         * @returns {Donkeycraft.Biome|null} The biome, or null if not found.
         */
        function getBiomeByName(name) {
            return _byName[name] || null;
        }

        /**
         * Get all biomes as an array.
         * @returns {Donkeycraft.Biome[]} Array of all biome instances.
         */
        function getAllBiomes() {
            return _allBiomes.slice();
        }

        /**
         * Get the number of registered biomes.
         * @returns {number}
         */
        function getBiomeCount() {
            return _allBiomes.length;
        }

        /**
         * Check if a biome exists for the given ID.
         * @param {number} id - Biome ID.
         * @returns {boolean}
         */
        function hasBiome(id) {
            return id in _biomes;
        }

        /**
         * Get a random biome (for testing).
         * @returns {Donkeycraft.Biome}
         */
        function getRandomBiome() {
            var keys = Object.keys(_biomes);
            var key = keys[Math.floor(Math.random() * keys.length)];
            return _biomes[key];
        }

        // Initialize on load
        init();

        return {
            getBiomeById: getBiomeById,
            getBiomeByName: getBiomeByName,
            getAllBiomes: getAllBiomes,
            getBiomeCount: getBiomeCount,
            hasBiome: hasBiome,
            getRandomBiome: getRandomBiome
        };
    })();

})();