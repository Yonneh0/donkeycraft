// Donkeycraft — Structure Generator
// Structure placement: ore veins, underground caves (noise-based), surface decoration.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // StructureGenerator
    // ============================================================

    /**
     * StructureGenerator — orchestrates full chunk generation pipeline.
     */
    Donkeycraft.StructureGenerator = (function() {
        // Cached block references
        var _blocks = {};

        /**
         * Resolve all surface block IDs from BlockRegistry and cache them.
         * @private
         */
        function _resolveBlocks() {
            if (_blocks.resolved) return;
            if (!Donkeycraft.BlockRegistry) return;

            var names = [
                'bedrock', 'stone', 'dirt', 'grass_block', 'snow_block',
                'oak_log', 'oak_leaves', 'rose', 'tall_grass',
                'cactus', 'snow_layer', 'sand', 'grapevine'
            ];
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
         * Generate a complete chunk: terrain, ores, caves, water, surface decoration.
         * @param {Donkeycraft.Chunk} chunk - The chunk to generate.
         * @param {number} biomeId - Biome ID for this chunk.
         */
        function generateChunkFull(chunk, biomeId) {
            // Step 1: Fill with air
            chunk.fill(0);

            // Step 2: Generate heightmap and place terrain blocks
            var heightmap = Donkeycraft.TerrainGenerator.generateHeightmap(
                chunk.chunkX, chunk.chunkZ,
                Donkeycraft.BiomeRegistry.getBiomeById(biomeId)
            );
            _placeTerrain(chunk, heightmap, biomeId);

            // Step 3: Apply surface layer (grass/dirt/stone per biome)
            Donkeycraft.TerrainSurface.applySurfaceLayer(chunk, biomeId, heightmap);

            // Step 4: Place ores
            Donkeycraft.OreGenerator.placeOres(chunk, biomeId);

            // Step 5: Generate caves
            Donkeycraft.CaveGenerator.generateCaves(chunk, biomeId);

            // Step 6: Place water
            Donkeycraft.WaterGenerator.placeWater(chunk, biomeId, heightmap);

            // Step 7: Surface decoration (trees, flowers, grass)
            _placeSurfaceDecoration(chunk, biomeId, heightmap);

            // Mark as generated
            chunk.generated = true;
        }

        /**
         * Place terrain blocks (stone/bedrock below heightmap).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @param {number} biomeId - Biome ID.
         * @private
         */
        function _placeTerrain(chunk, heightmap, biomeId) {
            var bedrockId = _getBlockId('bedrock');
            var stoneId = _getBlockId('stone');
            var dirtId = _getBlockId('dirt');

            if (!bedrockId || !stoneId || !dirtId) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var height = heightmap[x + z * CHUNK_SIZE] || 64;

                    for (var y = 0; y <= height; y++) {
                        if (y < 3) {
                            // Bedrock layer at bottom of world
                            chunk.setBlock(x, y, z, bedrockId);
                        } else if (y < height - 3) {
                            // Stone below terrain
                            chunk.setBlock(x, y, z, stoneId);
                        } else if (y < height) {
                            // Dirt layer near surface
                            chunk.setBlock(x, y, z, dirtId);
                        } else {
                            // Surface block (will be overwritten by terrain-surface.js)
                            chunk.setBlock(x, y, z, stoneId); // temporary: stone
                        }
                    }
                }
            }
        }

        /**
         * Place surface decoration (trees, flowers, grass, cacti).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _placeSurfaceDecoration(chunk, biomeId, heightmap) {
            var biome = Donkeycraft.BiomeRegistry.getBiomeById(biomeId);
            if (!biome) return;

            var decor = biome.decoration;
            var seed = chunk.chunkX * 7919 + chunk.chunkZ * 104729;

            // Place trees
            if (decor.trees > 0) {
                _placeTrees(chunk, biomeId, heightmap, seed, decor.trees);
            }

            // Place flowers
            if (decor.flowers > 0) {
                _placeFlowers(chunk, biomeId, heightmap, seed, decor.flowers);
            }

            // Place grass
            if (decor.grass > 0) {
                _placeGrass(chunk, biomeId, heightmap, seed, decor.grass);
            }

            // Place cacti (desert only)
            if (decor.cacti > 0 && (biomeId === 2 || biomeId === 12)) {
                _placeCacti(chunk, heightmap, seed, decor.cacti);
            }
        }

        /**
         * Place trees in a chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID.
         * @param {number[]} heightmap - Heightmap array.
         * @param {number} seed - Random seed.
         * @param {number} count - Number of tree attempts per chunk.
         * @private
         */
        function _placeTrees(chunk, biomeId, heightmap, seed, count) {
            var logId = _getBlockId('oak_log');
            var leavesId = _getBlockId('oak_leaves');
            var grassBlockId = _getBlockId('grass_block');
            var snowBlockId = _getBlockId('snow_block');

            if (!logId || !leavesId) return;

            for (var i = 0; i < count; i++) {
                var hash = _hash2D(seed + i * 37, i * 71);
                var tx = hash % CHUNK_SIZE;
                var tz = ((hash >> 8) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

                // Find surface Y
                var surfaceY = heightmap[tx + tz * CHUNK_SIZE];
                if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT - 10) continue;

                // Check if there's a valid surface block for trees
                var surfaceBlock = chunk.getBlock(tx, surfaceY, tz);
                var isValidSurface = surfaceBlock === logId || // log (exposed)
                    surfaceBlock === leavesId || // leaves (exposed)
                    surfaceBlock === (grassBlockId || 0) ||
                    surfaceBlock === (snowBlockId || 0) ||
                    surfaceBlock === 0; // air — can grow on underlying block

                if (!isValidSurface) {
                    continue;
                }

                // Determine tree type based on biome
                var treeHeight = 4; // Default oak
                if (biomeId === 5 || biomeId === 14) { // Taiga — spruce (taller)
                    treeHeight = 6 + ((hash >> 16) % 3);
                } else if (biomeId === 3 || biomeId === 10 || biomeId === 13) { // Forest variants
                    treeHeight = 5 + ((hash >> 16) % 2);
                }

                _placeOakTree(chunk, tx, surfaceY + 1, tz, treeHeight, logId, leavesId);
            }
        }

        /**
         * Place an oak-style tree at the given position.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - X coordinate.
         * @param {number} y - Y coordinate (top of trunk base).
         * @param {number} z - Z coordinate.
         * @param {number} height - Trunk height.
         * @param {number} logId - Log block ID.
         * @param {number} leavesId - Leaves block ID.
         * @private
         */
        function _placeOakTree(chunk, x, y, z, height, logId, leavesId) {
            // Trunk: logs from y to y+height-1
            for (var ty = 0; ty < height; ty++) {
                if (y + ty < WORLD_HEIGHT) {
                    chunk.setBlock(x, y + ty, z, logId); // oak_log (axis y)
                }
            }

            // Leaves: 3×3×3 box on top, minus corners
            var leafStartY = y + height - 2;
            var leafEndY = y + height + 1;

            for (var ly = leafStartY; ly <= leafEndY && ly < WORLD_HEIGHT; ly++) {
                for (var lx = -1; lx <= 1; lx++) {
                    for (var lz = -1; lz <= 1; lz++) {
                        // Skip corners for rounded look
                        if (Math.abs(lx) === 1 && Math.abs(lz) === 1 && ly >= leafEndY) continue;

                        var bx = x + lx;
                        var bz = z + lz;

                        if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE && ly >= 0) {
                            if (chunk.getBlock(bx, ly, bz) === 0) { // Only replace air
                                chunk.setBlock(bx, ly, bz, leavesId);
                            }
                        }
                    }
                }
            }
        }

        /**
         * Place flowers in a chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID.
         * @param {number[]} heightmap - Heightmap array.
         * @param {number} seed - Random seed.
         * @param {number} count - Number of flower attempts.
         * @private
         */
        function _placeFlowers(chunk, biomeId, heightmap, seed, count) {
            var roseId = _getBlockId('rose');
            var grassBlockId = _getBlockId('grass_block');
            if (!roseId || !grassBlockId) return;

            for (var i = 0; i < count; i++) {
                var hash = _hash2D(seed + i * 53 + 100, i * 97 + 200);
                var fx = hash % CHUNK_SIZE;
                var fz = ((hash >> 8) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

                var surfaceY = heightmap[fx + fz * CHUNK_SIZE];
                if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                // Place on grass block top
                if (chunk.getBlock(fx, surfaceY, fz) === grassBlockId) {
                    if (surfaceY + 1 < WORLD_HEIGHT) {
                        chunk.setBlock(fx, surfaceY + 1, fz, roseId);
                    }
                }
            }
        }

        /**
         * Place tall grass in a chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID.
         * @param {number[]} heightmap - Heightmap array.
         * @param {number} seed - Random seed.
         * @param {number} count - Number of grass attempts.
         * @private
         */
        function _placeGrass(chunk, biomeId, heightmap, seed, count) {
            var tallGrassId = _getBlockId('tall_grass');
            var grassBlockId = _getBlockId('grass_block');
            if (!tallGrassId || !grassBlockId) return;

            for (var i = 0; i < count; i++) {
                var hash = _hash2D(seed + i * 61 + 300, i * 89 + 400);
                var gx = hash % CHUNK_SIZE;
                var gz = ((hash >> 8) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

                var surfaceY = heightmap[gx + gz * CHUNK_SIZE];
                if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                if (chunk.getBlock(gx, surfaceY, gz) === grassBlockId) {
                    if (surfaceY + 1 < WORLD_HEIGHT) {
                        chunk.setBlock(gx, surfaceY + 1, gz, tallGrassId);
                    }
                }
            }
        }

        /**
         * Place cacti in a desert chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @param {number} seed - Random seed.
         * @param {number} count - Number of cactus attempts.
         * @private
         */
        function _placeCacti(chunk, heightmap, seed, count) {
            var cactusId = _getBlockId('cactus');
            var sandId = _getBlockId('sand');
            if (!cactusId || !sandId) return;

            for (var i = 0; i < count; i++) {
                var hash = _hash2D(seed + i * 47 + 500, i * 73 + 600);
                var cx = hash % CHUNK_SIZE;
                var cz = ((hash >> 8) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

                var surfaceY = heightmap[cx + cz * CHUNK_SIZE];
                if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                // Check for sand surface
                if (chunk.getBlock(cx, surfaceY, cz) !== sandId) {
                    continue;
                }

                // Place cactus (1-3 blocks tall)
                var cactusHeight = 1 + ((hash >> 16) % 3);
                for (var cy = 0; cy < cactusHeight && surfaceY + 1 + cy < WORLD_HEIGHT; cy++) {
                    chunk.setBlock(cx, surfaceY + 1 + cy, cz, cactusId);
                }
            }
        }

        /**
         * Simple 2D hash for deterministic randomness.
         * @param {number} x
         * @param {number} y
         * @returns {number} Positive 32-bit integer.
         * @private
         */
        function _hash2D(x, y) {
            x = x | 0;
            y = y | 0;
            var h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
            h = ((h >>> 13) ^ h) * 0x5bd1e995;
            return (h ^ (h >>> 15)) >>> 0; // Unsigned 32-bit
        }

        /**
         * Invalidate cached block IDs and re-resolve from BlockRegistry.
         * Call this after dynamically adding new blocks to the registry.
         */
        function invalidateBlockIdCache() {
            _blocks = {};
            _resolveBlocks();
        }

        return {
            generateChunkFull: generateChunkFull,
            invalidateBlockIdCache: invalidateBlockIdCache
        };
    })();

})();