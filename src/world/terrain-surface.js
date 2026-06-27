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
        // Cached block references
        var _blocks = {};

        /**
         * Resolve all surface block IDs from BlockRegistry and cache them.
         * @private
         */
        function _resolveBlocks() {
            if (_blocks.resolved) return;
            if (!Donkeycraft.BlockRegistry) return;

            var names = ['grass_block', 'stone', 'dirt', 'sand', 'snow_block', 'clay'];
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
         * Apply sand surface (desert).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
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
         * Apply snow surface (taiga).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _applySnowSurface(chunk, heightmap) {
            var snowBlockId = _getBlockId('snow_block');
            var dirtId = _getBlockId('dirt');
            var stoneId = _getBlockId('stone');

            if (!snowBlockId) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                    // Snow block on top
                    chunk.setBlock(x, surfaceY, z, snowBlockId);

                    // Dirt layer below
                    for (var dy = 1; dy <= 2 && surfaceY - dy >= 0; dy++) {
                        if (stoneId && chunk.getBlock(x, surfaceY - dy, z) === stoneId) {
                            chunk.setBlock(x, surfaceY - dy, z, dirtId);
                        } else {
                            break;
                        }
                    }

                    // Snow layer on top (if grass block was placed)
                    if (surfaceY + 1 < WORLD_HEIGHT && chunk.getBlock(x, surfaceY + 1, z) === 0) {
                        chunk.setBlock(x, surfaceY + 1, z, snowBlockId);
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
         * Apply swamp surface (muddy dirt + clay).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
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

                    // Add 1 layer of clay below
                    if (stoneId && surfaceY - 1 >= 0 && chunk.getBlock(x, surfaceY - 1, z) === stoneId) {
                        chunk.setBlock(x, surfaceY - 1, z, clayId || dirtId);
                    }
                }
            }
        }

        return {
            applySurfaceLayer: applySurfaceLayer
        };
    })();

})();