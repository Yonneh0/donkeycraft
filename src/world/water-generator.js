// Donkeycraft — Water Generator
// Water source placement: lakes, ocean floors, surface water per biome.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // WaterGenerator
    // ============================================================

    /**
     * WaterGenerator — places water sources in chunks.
     */
    Donkeycraft.WaterGenerator = (function() {
        var _waterLevel = 63; // Default sea level

        /**
         * Place water sources in a chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk to place water in.
         * @param {number} biomeId - Biome ID for this chunk.
         * @param {number[]} heightmap - Heightmap array.
         */
        function placeWater(chunk, biomeId, heightmap) {
            var biome = Donkeycraft.BiomeRegistry.getBiomeById(biomeId);
            if (!biome) return;

            // Ocean biomes: fill to water level
            if (biome.isOcean) {
                _placeOceanWater(chunk, biomeId, heightmap);
            } else {
                // Overworld biomes: surface water in low areas
                _placeSurfaceWater(chunk, biomeId, heightmap);
            }

            // Random underground lakes
            _placeUndergroundLakes(chunk, biomeId);
        }

        /**
         * Place ocean water across the chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _placeOceanWater(chunk, biomeId, heightmap) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE] || 20;

                    // Fill from surface+1 to water level with water
                    for (var y = surfaceY + 1; y <= _waterLevel && y < WORLD_HEIGHT; y++) {
                        var block = chunk.getBlock(x, y, z);
                        if (block === 0) { // Only replace air
                            chunk.setBlock(x, y, z, 213); // water
                        }
                    }
                }
            }
        }

        /**
         * Place surface water in low-lying areas of overworld biomes.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _placeSurfaceWater(chunk, biomeId, heightmap) {
            // Only place water in swamp biomes (ID 4, 11)
            if (biomeId !== 4 && biomeId !== 11) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE] || 63;

                    // Swamps are slightly below water level — fill with water
                    if (surfaceY < _waterLevel) {
                        for (var y = surfaceY + 1; y <= _waterLevel && y < WORLD_HEIGHT; y++) {
                            var block = chunk.getBlock(x, y, z);
                            if (block === 0) { // Only replace air
                                chunk.setBlock(x, y, z, 213); // water
                            }
                        }
                    }
                }
            }
        }

        /**
         * Place underground lakes using noise-based detection.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID.
         * @private
         */
        function _placeUndergroundLakes(chunk, biomeId) {
            var seed = chunk.chunkX * 45671 + chunk.chunkZ * 89013;

            // Try to place 1-3 underground lakes
            var lakeCount = 1 + ((seed >> 8) % 3);

            for (var i = 0; i < lakeCount; i++) {
                var hash = _hash2D(seed + i * 73, i * 97);
                var lx = hash % CHUNK_SIZE;
                var lz = (hash >> 8) % CHUNK_SIZE;

                // Random Y level below surface
                var surfaceY = 40 + ((hash >> 16) % 60); // Y: 40-100
                if (surfaceY >= WORLD_HEIGHT - 5) continue;

                // Lake radius
                var radius = 2 + ((hash >> 24) % 4);

                _placeLake(chunk, lx, surfaceY, lz, radius);
            }
        }

        /**
         * Place a small underground lake (sphere of water).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} cx - Center X.
         * @param {number} cy - Center Y.
         * @param {number} cz - Center Z.
         * @param {number} radius - Lake radius.
         * @private
         */
        function _placeLake(chunk, cx, cy, cz, radius) {
            var r = Math.ceil(radius);

            for (var dx = -r; dx <= r; dx++) {
                for (var dy = -r; dy <= r; dy++) {
                    for (var dz = -r; dz <= r; dz++) {
                        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (dist <= radius) {
                            var bx = cx + dx;
                            var by = cy + dy;
                            var bz = cz + dz;

                            if (bx >= 0 && bx < CHUNK_SIZE &&
                                by >= 0 && by < WORLD_HEIGHT &&
                                bz >= 0 && bz < CHUNK_SIZE) {
                                if (chunk.getBlock(bx, by, bz) === 0) { // Air only
                                    chunk.setBlock(bx, by, bz, 213); // water
                                }
                            }
                        }
                    }
                }
            }
        }

        /**
         * Get the default water level.
         * @returns {number}
         */
        function getWaterLevel() {
            return _waterLevel;
        }

        /**
         * Set the default water level.
         * @param {number} value - New water level.
         */
        function setWaterLevel(value) {
            _waterLevel = value;
        }

        /**
         * Simple 2D hash for deterministic randomness.
         * @param {number} x
         * @param {number} y
         * @returns {number}
         * @private
         */
        function _hash2D(x, y) {
            var h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
            h = ((h >> 13) ^ h) * 0x5bd1e995;
            return (h ^ (h >> 15)) >>> 0;
        }

        return {
            placeWater: placeWater,
            getWaterLevel: getWaterLevel,
            setWaterLevel: setWaterLevel
        };
    })();

})();