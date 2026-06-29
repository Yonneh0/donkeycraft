// Donkeycraft — Structure Generator
// Structure placement: ore veins, underground caves (noise-based), surface decoration.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // StructureGenerator
    // ============================================================

    /**
     * StructureGenerator — orchestrates the full chunk generation pipeline:
     * terrain → surface layer → ores → caves → water → decoration.
     * All generators use a single shared PerlinNoise instance (from math-utils.js)
     * to ensure spatial coherence across features.
     */
    Donkeycraft.StructureGenerator = (function () {
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
                'oak_log', 'oak_leaves', 'poppy', 'tall_grass',
                'cactus', 'snow_layer', 'sand'
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
         * Generate a complete chunk using the full terrain generation pipeline.
         * Pipeline order: air fill → terrain → surface layer → ores → caves → water → decoration.
         * @param {Donkeycraft.Chunk} chunk - The chunk to generate.
         * @param {number} biomeId - Biome ID for this chunk.
         */
        function generateChunkFull(chunk, biomeId) {
            // Step 1: Fill with air
            chunk.fill(0);

            // Step 2: Generate heightmap and place terrain blocks (stone/dirt below surface)
            var biome = Donkeycraft.BiomeRegistry ? Donkeycraft.BiomeRegistry.getBiomeById(biomeId) : null;
            var heightmap = Donkeycraft.TerrainGenerator.generateHeightmap(
                chunk.chunkX, chunk.chunkZ,
                biome
            );
            _placeTerrain(chunk, heightmap, biomeId);

            // Step 3: Apply surface layer (grass/dirt/stone per biome) — replaces top blocks
            Donkeycraft.TerrainSurface.applySurfaceLayer(chunk, biomeId, heightmap);

            // Step 4: Place ores in stone layers (pass heightmap for terrain clamping)
            if (Donkeycraft.OreGenerator) Donkeycraft.OreGenerator.placeOres(chunk, biomeId, heightmap);

            // Step 5: Generate caves
            if (Donkeycraft.CaveGenerator) Donkeycraft.CaveGenerator.generateCaves(chunk, biomeId);

            // Step 6: Place water in air blocks only
            if (Donkeycraft.WaterGenerator) Donkeycraft.WaterGenerator.placeWater(chunk, biomeId, heightmap);

            // Step 7: Surface decoration (trees, flowers, grass on top of surface layer)
            _placeSurfaceDecoration(chunk, biomeId, heightmap);

            // Mark as generated
            chunk.generated = true;
        }

        /**
         * Place terrain blocks (stone/bedrock below heightmap).
         * Does NOT place surface blocks — those are handled by applySurfaceLayer()
         * to avoid redundant work. Surface Y is excluded from this loop.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @param {number} biomeId - Biome ID (unused but kept for API consistency).
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

                    // Place blocks from Y=0 up to surface-1.
                    // Surface block (Y == height) is handled by applySurfaceLayer().
                    for (var y = 0; y < height && y < WORLD_HEIGHT; y++) {
                        if (y === 0) {
                            // Bedrock layer at bottom of world (single layer)
                            chunk.setBlock(x, y, z, bedrockId);
                        } else if (y < height - 3) {
                            // Stone below terrain
                            chunk.setBlock(x, y, z, stoneId);
                        } else {
                            // Dirt layer near surface (last 3 blocks before surface)
                            chunk.setBlock(x, y, z, dirtId);
                        }
                    }
                }
            }
        }

        /**
         * Place surface decoration (trees, flowers, grass, cacti).
         * Uses biome constants from Donkeycraft.BiomeID for consistent checks.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} biomeId - Biome ID.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _placeSurfaceDecoration(chunk, biomeId, heightmap) {
            var biome = Donkeycraft.BiomeRegistry ? Donkeycraft.BiomeRegistry.getBiomeById(biomeId) : null;
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

            // Place cacti (desert only) — using biome constants instead of magic numbers
            var BIOME_DESERT = Donkeycraft.BiomeID ? [Donkeycraft.BiomeID.DESERT, Donkeycraft.BiomeID.DESERT_M] : [];
            var isDesert = false;
            for (var d = 0; d < BIOME_DESERT.length; d++) {
                if (biomeId === BIOME_DESERT[d]) { isDesert = true; break; }
            }
            if (decor.cacti > 0 && isDesert) {
                _placeCacti(chunk, heightmap, seed, decor.cacti);
            }
        }

        /**
         * Place trees in a chunk.
         * Uses biome constants from Donkeycraft.BiomeID for consistent checks.
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

            // Biome constants for tree type selection
            var BIOME_TAIGA = Donkeycraft.BiomeID ? [Donkeycraft.BiomeID.TAIGA, Donkeycraft.BiomeID.TAIGA_HILL] : [];
            var BIOME_FOREST = Donkeycraft.BiomeID ? [Donkeycraft.BiomeID.FOREST, Donkeycraft.BiomeID.FLOWER_FOREST, Donkeycraft.BiomeID.FOREST_HILL] : [];

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

                // Determine tree type based on biome using constants
                var treeHeight = 4; // Default oak
                for (var t = 0; t < BIOME_TAIGA.length; t++) {
                    if (biomeId === BIOME_TAIGA[t]) { // Taiga — spruce (taller)
                        treeHeight = 6 + ((hash >> 16) % 3);
                        break;
                    }
                }
                for (var f = 0; f < BIOME_FOREST.length; f++) {
                    if (biomeId === BIOME_FOREST[f]) { // Forest variants
                        treeHeight = 5 + ((hash >> 16) % 2);
                        break;
                    }
                }

                _placeOakTree(chunk, tx, surfaceY, tz, treeHeight, logId, leavesId);
            }
        }

        /**
         * Place an oak-style tree at the given position.
         * Validates that trunk space is clear before placing.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - X coordinate.
         * @param {number} y - Y coordinate (trunk base).
         * @param {number} z - Z coordinate.
         * @param {number} height - Trunk height.
         * @param {number} logId - Log block ID.
         * @param {number} leavesId - Leaves block ID.
         * @returns {boolean} True if the tree was placed successfully.
         * @private
         */
        function _placeOakTree(chunk, x, y, z, height, logId, leavesId) {
            // Validate trunk space is clear (all air or replaceable blocks)
            for (var ty = 0; ty < height; ty++) {
                if (y + ty >= WORLD_HEIGHT) return false;
                var trunkBlock = chunk.getBlock(x, y + ty, z);
                if (trunkBlock !== 0 && !isReplaceable(trunkBlock)) return false;
            }

            // Place trunk: logs from y to y+height-1
            for (var ty2 = 0; ty2 < height; ty2++) {
                chunk.setBlock(x, y + ty2, z, logId);
            }

            // Leaves: 3×3×3 box on top, minus corners for rounded look
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

            return true;
        }

        /**
         * Check if a block ID is replaceable (air or transparent decorative).
         * @param {number} blockId - Block ID to check.
         * @returns {boolean} True if the block can be overwritten.
         * @private
         */
        function isReplaceable(blockId) {
            // Air is always replaceable
            if (blockId === 0) return true;

            // Check via BlockRegistry if available
            if (Donkeycraft.BlockRegistry && typeof Donkeycraft.BlockRegistry.isReplaceable === 'function') {
                return Donkeycraft.BlockRegistry.isReplaceable(blockId);
            }
            return false;
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
            var poppyId = _getBlockId('poppy');
            var grassBlockId = _getBlockId('grass_block');
            if (!poppyId || !grassBlockId) return;

            for (var i = 0; i < count; i++) {
                var hash = _hash2D(seed + i * 53 + 100, i * 97 + 200);
                var fx = hash % CHUNK_SIZE;
                var fz = ((hash >> 8) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

                var surfaceY = heightmap[fx + fz * CHUNK_SIZE];
                if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                // Place on grass block top
                if (chunk.getBlock(fx, surfaceY, fz) === grassBlockId) {
                    if (surfaceY + 1 < WORLD_HEIGHT) {
                        chunk.setBlock(fx, surfaceY + 1, fz, poppyId);
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
         * Deterministic 2D hash — delegates to centralized _gen._hash2D.
         * @param {number} x
         * @param {number} y
         * @returns {number} Positive 32-bit integer.
         * @private
         */
        function _hash2D(x, y) {
            return Donkeycraft._gen._hash2D(x, y);
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