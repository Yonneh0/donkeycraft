// Donkeycraft — Terrain Surface
// Surface layer per biome: grass, dirt, sand, snow, stone, clay placement.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // TerrainSurface
    // ============================================================

    /**
     * TerrainSurface — applies biome-specific surface layers (grass, sand, snow, stone, clay)
     * to chunks by replacing top blocks based on the chunk's biome ID and heightmap.
     */
    Donkeycraft.TerrainSurface = (function () {
        // Cached block references
        var _blocks = {};

        /**
         * Resolve all surface block IDs from BlockRegistry and cache them.
         * @private
         */
        function _resolveBlocks() {
            if (_blocks.resolved) return;
            if (!Donkeycraft.BlockRegistry) return;

            var names = ['grass_block', 'stone', 'dirt', 'sand', 'snow_block', 'snow_layer', 'clay'];
            for (var i = 0; i < names.length; i++) {
                var block = Donkeycraft.BlockRegistry.getBlockByName(names[i]);
                if (block) {
                    _blocks[names[i]] = block.id;
                }
            }
            _blocks.resolved = true;
        }

        /**
         * Get a cached block ID by name.
         * @param {string} name - Block name.
         * @returns {number} Block ID, or 0 if not found.
         * @private
         */
        function _getBlockId(name) {
            _resolveBlocks();
            return _blocks[name] || 0;
        }

        /**
         * Apply the surface layer to a chunk based on biome.
         * Replaces top terrain blocks with appropriate surface blocks (grass, sand, snow, stone, clay).
         * @param {Donkeycraft.Chunk} chunk - The chunk to modify.
         * @param {number} biomeId - Biome ID for this chunk.
         * @param {number[]} heightmap - Heightmap array of size CHUNK_SIZE × CHUNK_SIZE.
         */
        function applySurfaceLayer(chunk, biomeId, heightmap) {
            switch (biomeId) {
                // Plains & forest variants — grass block surface with dirt layer
                case Donkeycraft.BiomeID.PLAINS:
                case Donkeycraft.BiomeID.FOREST:
                case Donkeycraft.BiomeID.FLOWER_FOREST:
                case Donkeycraft.BiomeID.FOREST_HILL:
                case Donkeycraft.BiomeID.OCEAN:
                case Donkeycraft.BiomeID.SUNFLOWER_PLAINS:
                    _applyGrassSurface(chunk, heightmap);
                    break;

                // Desert — sand surface with 1-3 layers of sand below
                case Donkeycraft.BiomeID.DESERT:
                case Donkeycraft.BiomeID.DESERT_M:
                    _applySandSurface(chunk, heightmap);
                    break;

                // Taiga variants — grass block base with snow layer on top
                case Donkeycraft.BiomeID.TAIGA:
                case Donkeycraft.BiomeID.TAIGA_HILL:
                    _applySnowSurface(chunk, heightmap);
                    break;

                // Ice plains & snowy tundra — stone/snow surface (no grass)
                case Donkeycraft.BiomeID.ICE_PLAINS:
                case Donkeycraft.BiomeID.SNOWY_TUNDRA:
                    _applyIceSurface(chunk, heightmap);
                    break;

                // Extreme hills — exposed stone surface
                case Donkeycraft.BiomeID.EXTREME_HILLS:
                    _applyStoneSurface(chunk, heightmap);
                    break;

                // Swamp — dirt on top with clay layer below
                case Donkeycraft.BiomeID.SWAMP:
                    _applySwampSurface(chunk, heightmap);
                    break;

                default:
                    _applyGrassSurface(chunk, heightmap);
                    break;
            }
        }

        /**
         * Apply grass surface: grass block on top, 1-2 layers of dirt below stone.
         * @param {Donkeycraft.Chunk} chunk - The chunk to modify.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applyGrassSurface(chunk, heightmap) {
            var grassBlockId = _getBlockId('grass_block');
            var dirtId = _getBlockId('dirt');
            var stoneId = _getBlockId('stone');

            if (!grassBlockId) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Replace top block with grass
                    chunk.setBlock(x, surfaceY, z, grassBlockId);

                    // Add 1-2 layers of dirt below
                    for (var dy = 1; dy <= 2 && surfaceY - dy >= 0; dy++) {
                        if (stoneId && chunk.getBlock(x, surfaceY - dy, z) === stoneId) {
                            chunk.setBlock(x, surfaceY - dy, z, dirtId);
                        }
                    }
                }
            }
        }

        /**
         * Apply sand surface: replaces top 1-3 blocks with sand where terrain is below water level.
         * Replaces stone and dirt beneath the surface with sand.
         * @param {Donkeycraft.Chunk} chunk - The chunk to modify.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applySandSurface(chunk, heightmap) {
            var sandId = _getBlockId('sand');
            var dirtId = _getBlockId('dirt');
            var stoneId = _getBlockId('stone');

            if (!sandId) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Replace top block with sand
                    chunk.setBlock(x, surfaceY, z, sandId);

                    // Add 1-3 layers of sand below
                    for (var dy = 1; dy <= 3 && surfaceY - dy >= 0; dy++) {
                        var blockBelow = chunk.getBlock(x, surfaceY - dy, z);
                        if ((stoneId && blockBelow === stoneId) || (dirtId && blockBelow === dirtId)) {
                            chunk.setBlock(x, surfaceY - dy, z, sandId);
                        } else {
                            break;
                        }
                    }
                }
            }
        }

        /**
         * Apply snow surface: grass block as base, dirt layer below, thin snow layer on top.
         * Used for taiga biomes — has actual vegetation with grass blocks and snow decoration.
         * Uses snow_layer (transparent) for the top decorative snow, not snow_block.
         * The snow layer sits ABOVE the grass_block surface.
         * @param {Donkeycraft.Chunk} chunk - The chunk to modify.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applySnowSurface(chunk, heightmap) {
            var snowLayerId = _getBlockId('snow_layer');
            var snowBlockId = _getBlockId('snow_block');
            var dirtId = _getBlockId('dirt');
            var stoneId = _getBlockId('stone');
            var grassBlockId = _getBlockId('grass_block');

            if (!snowLayerId && !snowBlockId) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Place grass block as the base surface layer
                    if (grassBlockId) {
                        chunk.setBlock(x, surfaceY, z, grassBlockId);
                    } else if (dirtId) {
                        chunk.setBlock(x, surfaceY, z, dirtId);
                    }

                    // Dirt layer below — only replace stone, don't overwrite existing dirt
                    for (var dy = 1; dy <= 2 && surfaceY - dy >= 0; dy++) {
                        if (stoneId && chunk.getBlock(x, surfaceY - dy, z) === stoneId) {
                            chunk.setBlock(x, surfaceY - dy, z, dirtId);
                        } else {
                            break;
                        }
                    }

                    // Snow layer on top of the surface block (if space is empty)
                    if (surfaceY + 1 < WORLD_HEIGHT && chunk.getBlock(x, surfaceY + 1, z) === 0) {
                        if (snowLayerId) {
                            chunk.setBlock(x, surfaceY + 1, z, snowLayerId);
                        } else if (snowBlockId) {
                            chunk.setBlock(x, surfaceY + 1, z, snowBlockId);
                        }
                    }
                }
            }
        }

        /**
         * Apply ice/snow surface: snow_block as the top block (no grass).
         * Used for ice plains and snowy tundra — fully frozen surfaces without vegetation.
         * Places a thin layer of snow_layer on top if space is available.
         * @param {Donkeycraft.Chunk} chunk - The chunk to modify.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applyIceSurface(chunk, heightmap) {
            var snowBlockId = _getBlockId('snow_block');
            var stoneId = _getBlockId('stone');

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Use snow_block as the primary surface, fall back to stone
                    if (snowBlockId) {
                        chunk.setBlock(x, surfaceY, z, snowBlockId);
                    } else if (stoneId) {
                        chunk.setBlock(x, surfaceY, z, stoneId);
                    }
                }
            }
        }

        /**
         * Apply stone surface: keeps stone as the top block (no grass/sand/snow).
         * Used for extreme hills and mountain biomes.
         * @param {Donkeycraft.Chunk} chunk - The chunk to modify.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applyStoneSurface(chunk, heightmap) {
            var stoneId = _getBlockId('stone');
            if (!stoneId) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Keep stone as surface
                    chunk.setBlock(x, surfaceY, z, stoneId);
                }
            }
        }

        /**
         * Apply swamp surface: dirt on top, clay layer below stone.
         * Swamps use dirt instead of grass blocks and have clay underneath.
         * @param {Donkeycraft.Chunk} chunk - The chunk to modify.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applySwampSurface(chunk, heightmap) {
            var dirtId = _getBlockId('dirt');
            var clayId = _getBlockId('clay');
            var stoneId = _getBlockId('stone');

            if (!dirtId) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Replace top block with dirt (swamp has dirt, not grass)
                    chunk.setBlock(x, surfaceY, z, dirtId);

                    // Add 1-2 layers of clay below stone
                    for (var dy = 1; dy <= 2 && surfaceY - dy >= 0; dy++) {
                        if (stoneId && chunk.getBlock(x, surfaceY - dy, z) === stoneId) {
                            chunk.setBlock(x, surfaceY - dy, z, clayId || dirtId);
                        } else {
                            break;
                        }
                    }
                }
            }
        }

        return {
            applySurfaceLayer: applySurfaceLayer
        };
    })();

})();