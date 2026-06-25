// Donkeycraft — Ore Generator
// Ore distribution: vein placement per biome, rarity, Y-level ranges for all ores.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // Ore Definitions
    // ============================================================

    /**
     * Ore definitions with Y-level ranges, vein size, rarity, and biome restrictions.
     * @type {Array<{blockId: number, name: string, minY: number, maxY: number, veinSize: number, rarity: number, biomes: number[]}>}
     */
    var ORE_DEFS = [
        { blockId: 16,   name: 'coal_ore',       minY: 0,   maxY: 160, veinSize: 8,  rarity: 12, biomes: null },       // null = all biomes
        { blockId: 15,   name: 'iron_ore',       minY: 0,   maxY: 164, veinSize: 6,  rarity: 10, biomes: null },
        { blockId: 21,   name: 'gold_ore',       minY: 0,   maxY: 64,  veinSize: 4,  rarity: 20, biomes: null },
        { blockId: 14,   name: 'diamond_ore',    minY: 0,   maxY: 32,  veinSize: 3,  rarity: 28, biomes: null },
        { blockId: 176,  name: 'redstone_ore',   minY: 0,   maxY: 32,  veinSize: 5,  rarity: 16, biomes: null },
        { blockId: 22,   name: 'lapis_ore',      minY: 0,   maxY: 64,  veinSize: 4,  rarity: 18, biomes: null },
        { blockId: 126,  name: 'emerald_ore',    minY: 0,   maxY: 32,  veinSize: 2,  rarity: 30, biomes: [7] }              // Only in extreme hills
    ];

    // ============================================================
    // OreGenerator
    // ============================================================

    /**
     * OreGenerator — places ore veins in chunks.
     */
    Donkeycraft.OreGenerator = (function() {
        /**
         * Place ore veins in a chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk to place ores in.
         * @param {number} biomeId - Biome ID for this chunk.
         */
        function placeOres(chunk, biomeId) {
            var seed = chunk.chunkX * 31241 + chunk.chunkZ * 57832 + 12345;

            for (var i = 0; i < ORE_DEFS.length; i++) {
                var oreDef = ORE_DEFS[i];

                // Check biome restriction
                if (oreDef.biomes && oreDef.biomes.length > 0) {
                    var found = false;
                    for (var j = 0; j < oreDef.biomes.length; j++) {
                        if (oreDef.biomes[j] === biomeId) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) continue; // Skip this ore for this biome
                }

                // Place veins for this ore type
                _placeOreVeins(chunk, oreDef, seed);
            }
        }

        /**
         * Place veins for a single ore type in a chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {object} oreDef - Ore definition.
         * @param {number} seed - Random seed.
         * @private
         */
        function _placeOreVeins(chunk, oreDef, seed) {
            var veinCount = 0;

            // Determine how many veins to place based on rarity
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var hash = _hash2D(x + chunk.chunkX * CHUNK_SIZE, z + chunk.chunkZ * CHUNK_SIZE);
                    if ((hash % oreDef.rarity) === 0) {
                        veinCount++;
                    }
                }
            }

            // Place each vein
            for (var v = 0; v < veinCount; v++) {
                // Find a random position in the chunk
                var vx = _randomInRange(seed, v, 0, CHUNK_SIZE - 1);
                var vz = _randomInRange(seed, v, 1, CHUNK_SIZE - 1);

                // Random Y level within ore's range
                var vy = _randomInRange(seed, v, oreDef.minY, oreDef.maxY);

                // Place the vein (simple sphere shape)
                _placeVein(chunk, vx, vy, vz, oreDef.blockId, oreDef.veinSize, seed, v);
            }
        }

        /**
         * Place a single ore vein as a rough sphere.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} cx - Center X.
         * @param {number} cy - Center Y.
         * @param {number} cz - Center Z.
         * @param {number} blockId - Ore block ID.
         * @param {number} radius - Vein radius.
         * @param {number} seed - Random seed.
         * @param {number} veinIndex - Index of this vein.
         * @private
         */
        function _placeVein(chunk, cx, cy, cz, blockId, radius, seed, veinIndex) {
            var halfRadius = Math.floor(radius / 2) + 1;

            for (var dx = -halfRadius; dx <= halfRadius; dx++) {
                for (var dy = -halfRadius; dy <= halfRadius; dy++) {
                    for (var dz = -halfRadius; dz <= halfRadius; dz++) {
                        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (dist <= halfRadius) {
                            var bx = cx + dx;
                            var by = cy + dy;
                            var bz = cz + dz;

                            // Add some randomness to shape
                            if (dist < halfRadius - 0.5) {
                                var noiseVal = _hash2D(bx + veinIndex * 1000, bz + veinIndex * 2000) % 10;
                                if (noiseVal > 3) {
                                    chunk.setBlock(bx, by, bz, blockId);
                                }
                            } else if (dist <= halfRadius) {
                                // Edge: 50% chance
                                var edgeHash = _hash2D(bx * 7, bz * 13 + veinIndex);
                                if ((edgeHash % 2) === 0) {
                                    chunk.setBlock(bx, by, bz, blockId);
                                }
                            }
                        }
                    }
                }
            }
        }

        /**
         * Get the minimum Y level for an ore by name.
         * @param {string} oreName - Ore name.
         * @returns {number} Minimum Y level, or -1 if not found.
         */
        function getMinY(oreName) {
            for (var i = 0; i < ORE_DEFS.length; i++) {
                if (ORE_DEFS[i].name === oreName) {
                    return ORE_DEFS[i].minY;
                }
            }
            return -1;
        }

        /**
         * Get the maximum Y level for an ore by name.
         * @param {string} oreName - Ore name.
         * @returns {number} Maximum Y level, or -1 if not found.
         */
        function getMaxY(oreName) {
            for (var i = 0; i < ORE_DEFS.length; i++) {
                if (ORE_DEFS[i].name === oreName) {
                    return ORE_DEFS[i].maxY;
                }
            }
            return -1;
        }

        /**
         * Get all ore definitions.
         * @returns {Array} Array of ore definition objects.
         */
        function getOreDefinitions() {
            return ORE_DEFS.slice();
        }

        /**
         * Get the number of ore types.
         * @returns {number}
         */
        function getOreCount() {
            return ORE_DEFS.length;
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
            return (h ^ (h >> 15)) >>> 0; // Unsigned 32-bit
        }

        /**
         * Generate a pseudo-random number in a range using a simple LCG.
         * @param {number} seed - Base seed.
         * @param {number} index - Variation index.
         * @param {number} min - Minimum value.
         * @param {number} max - Maximum value.
         * @returns {number}
         * @private
         */
        function _randomInRange(seed, index, min, max) {
            var s = (seed + index * 6364136223846793005 + 1442695040888963407);
            s = ((s >> 16) ^ s) * 0x45d9f3b;
            s = ((s >> 16) ^ s);
            s = ((s >> 16) ^ s);
            return min + (Math.abs(s) % (max - min + 1));
        }

        return {
            placeOres: placeOres,
            getMinY: getMinY,
            getMaxY: getMaxY,
            getOreDefinitions: getOreDefinitions,
            getOreCount: getOreCount
        };
    })();

})();