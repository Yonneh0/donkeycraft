// Donkeycraft — Terrain Generator
// Heightmap generation: Perlin noise layers, biome height variation, shore/beach/cliff.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;
    var SEED = Donkeycraft.Config.SEED;

    // ============================================================
    // TerrainGenerator
    // ============================================================

    /**
     * TerrainGenerator — generates heightmaps and terrain for chunks.
     * This is a module object (IIFE), not a constructor. All methods are static.
     */
    var _terrainGenModule = (function() {

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The TerrainGenerator module.
         */
        function getInstance() {
            return _terrainGenModule;
        }

        /**
         * Ensure PerlinNoise is initialized before terrain generation.
         * @private
         */
        function _ensureNoiseInit() {
            if (Donkeycraft.PerlinNoise && Donkeycraft.PerlinNoise.init && !Donkeycraft.PerlinNoise._initialized) {
                Donkeycraft.PerlinNoise.init(SEED);
                Donkeycraft.PerlinNoise._initialized = true;
            }
        }

        /**
         * Generate a heightmap for a chunk at the given world coordinates.
         * @param {number} chunkX - Chunk X coordinate (in chunks).
         * @param {number} chunkZ - Chunk Z coordinate (in chunks).
         * @param {Donkeycraft.Biome|null} [biome=null] - Biome for this chunk.
         * @returns {number[]} Heightmap array of size CHUNK_SIZE × CHUNK_SIZE with height values.
         */
        function generateHeightmap(chunkX, chunkZ, biome) {
            _ensureNoiseInit();
            biome = biome || Donkeycraft.BiomeRegistry.getBiomeById(1); // Default to plains
            var heightmap = new Array(CHUNK_SIZE * CHUNK_SIZE);

            // Biome-specific noise parameters
            var baseHeight, heightVariation;

            if (biome.isOcean) {
                baseHeight = 20;
                heightVariation = 5;
            } else if (biome.isDesert) {
                baseHeight = 60;
                heightVariation = 10;
            } else if (biome.isExtremeHills) {
                baseHeight = 100;
                heightVariation = 80;
            } else if (biome.hasSnow) {
                baseHeight = 70;
                heightVariation = 30;
            } else {
                // Plains, forest, swamp, taiga — moderate terrain
                baseHeight = 64;
                heightVariation = 20;
            }

            // Scale factors for noise sampling
            var scale = 0.015;
            var detailScale = 0.05;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    // Global world coordinates
                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    // Base terrain height using large-scale noise
                    var baseNoise = Donkeycraft.PerlinNoise.fbm(
                        worldX * scale, 0, worldZ * scale,
                        4, 0.5, 2.0
                    );

                    // Detail noise for local variation
                    var detailNoise = Donkeycraft.PerlinNoise.fbm(
                        worldX * detailScale, 0, worldZ * detailScale,
                        3, 0.5, 2.0
                    );

                    // Combine noises
                    var height = baseHeight +
                        baseNoise * heightVariation * 0.7 +
                        detailNoise * heightVariation * 0.3;

                    // Clamp to valid range
                    height = Donkeycraft.clamp(Math.floor(height), 1, WORLD_HEIGHT - 10);

                    // Ocean biomes: lower terrain, more water
                    if (biome.isOcean) {
                        height = Donkeycraft.clamp(height, 5, 30);
                    }

                    // Extreme hills: add dramatic peaks
                    if (biome.isExtremeHills) {
                        var peakBoost = Math.abs(Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.008, worldZ * 0.008
                        )) * heightVariation;
                        height = Math.min(height + Math.floor(peakBoost), WORLD_HEIGHT - 15);
                    }

                    heightmap[x + z * CHUNK_SIZE] = height;
                }
            }

            return heightmap;
        }

        /**
         * Get the terrain height at a specific world X, Z position.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @param {number} localX - Local X within chunk [0, 15].
         * @param {number} localZ - Local Z within chunk [0, 15].
         * @param {number[]} heightmap - Heightmap array.
         * @returns {number} Terrain height at this position.
         */
        function getHeightAt(chunkX, chunkZ, localX, localZ, heightmap) {
            return heightmap[localX + localZ * CHUNK_SIZE] || 64;
        }

        /**
         * Generate a full heightmap and return it (convenience wrapper).
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @returns {number[]} Heightmap array.
         */
        function generate(chunkX, chunkZ) {
            _ensureNoiseInit();
            return generateHeightmap(chunkX, chunkZ);
        }

        return {
            getInstance: getInstance,
            generateHeightmap: generateHeightmap,
            getHeightAt: getHeightAt,
            generate: generate
        };
    })();

})();