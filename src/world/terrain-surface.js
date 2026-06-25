// Donkeycraft — Terrain Surface
// Surface layer per biome: grass, dirt, sand, snow, stone, clay placement.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // TerrainSurface
    // ============================================================

    /**
     * TerrainSurface — applies biome-specific surface layers to chunks.
     */
    Donkeycraft.TerrainSurface = (function() {
        /**
         * Apply the surface layer to a chunk based on biome.
         * Replaces top terrain blocks with appropriate surface blocks.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID for this chunk.
         * @param {number[]} heightmap - Heightmap array.
         */
        function applySurfaceLayer(chunk, biomeId, heightmap) {
            switch (biomeId) {
                case 1: // Plains
                case 3: // Forest
                case 10: // Flower Forest
                case 13: // Woods
                    _applyGrassSurface(chunk, heightmap);
                    break;
                case 2: // Desert
                    _applySandSurface(chunk, heightmap);
                    break;
                case 5: // Taiga
                case 14: // Cold Taiga
                    _applySnowSurface(chunk, heightmap);
                    break;
                case 6: // Ocean
                case 9: // Deep Ocean
                    _applyStoneSurface(chunk, heightmap);
                    break;
                case 7: // Extreme Hills
                case 8: // Mountain
                case 15: // Jagged Peaks
                    _applyStoneSurface(chunk, heightmap);
                    break;
                case 4: // Swamp
                case 11: // Deep Swamp
                    _applySwampSurface(chunk, heightmap);
                    break;
                default:
                    _applyGrassSurface(chunk, heightmap);
                    break;
            }
        }

        /**
         * Apply grass surface (grass block + dirt layer).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applyGrassSurface(chunk, heightmap) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Replace top block with grass
                    chunk.setBlock(x, surfaceY, z, 2); // grass_block

                    // Add 1-2 layers of dirt below
                    for (var dy = 1; dy <= 2 && surfaceY - dy >= 0; dy++) {
                        if (chunk.getBlock(x, surfaceY - dy, z) === 1) { // stone
                            chunk.setBlock(x, surfaceY - dy, z, 3); // dirt
                        }
                    }
                }
            }
        }

        /**
         * Apply sand surface (desert).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applySandSurface(chunk, heightmap) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Replace top block with sand
                    chunk.setBlock(x, surfaceY, z, 12); // sand

                    // Add 1-3 layers of sand below
                    for (var dy = 1; dy <= 3 && surfaceY - dy >= 0; dy++) {
                        var blockBelow = chunk.getBlock(x, surfaceY - dy, z);
                        if (blockBelow === 1 || blockBelow === 3) { // stone or dirt
                            chunk.setBlock(x, surfaceY - dy, z, 12); // sand
                        } else {
                            break;
                        }
                    }
                }
            }
        }

        /**
         * Apply snow surface (taiga).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applySnowSurface(chunk, heightmap) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Grass block on top
                    chunk.setBlock(x, surfaceY, z, 5); // snow_block

                    // Dirt layer below
                    for (var dy = 1; dy <= 2 && surfaceY - dy >= 0; dy++) {
                        if (chunk.getBlock(x, surfaceY - dy, z) === 1) { // stone
                            chunk.setBlock(x, surfaceY - dy, z, 3); // dirt
                        } else {
                            break;
                        }
                    }

                    // Snow layer on top (if grass block was placed)
                    if (surfaceY + 1 < WORLD_HEIGHT && chunk.getBlock(x, surfaceY + 1, z) === 0) {
                        chunk.setBlock(x, surfaceY + 1, z, 78); // snow_layer
                    }
                }
            }
        }

        /**
         * Apply stone surface (extreme hills, mountains).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applyStoneSurface(chunk, heightmap) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Keep stone as surface
                    chunk.setBlock(x, surfaceY, z, 1); // stone
                }
            }
        }

        /**
         * Apply swamp surface (muddy dirt + water).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applySwampSurface(chunk, heightmap) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Replace top block with dirt (swamp has dirt, not grass)
                    chunk.setBlock(x, surfaceY, z, 3); // dirt

                    // Add 1 layer of clay below
                    if (surfaceY - 1 >= 0 && chunk.getBlock(x, surfaceY - 1, z) === 1) {
                        chunk.setBlock(x, surfaceY - 1, z, 198); // clay
                    }
                }
            }
        }

        return {
            applySurfaceLayer: applySurfaceLayer
        };
    })();

})();