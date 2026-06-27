// Donkeycraft — Nether Terrain Generator
// Nether terrain: bedrock ceiling/floor, lava seas, netherrack, unique structures.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // Block IDs for nether terrain
    var NETHERRACK_ID = 257;
    var BEDROCK_ID = 37;
    var LAVA_ID = 213;
    var SOUL_SAND_ID = 258;
    var SOUL_SOIL_ID = 259;
    var NETHER_QUARTZ_ORE_ID = 238;
    var NETHER_GOLD_ORE_ID = 272;
    var ANCIENT_DEBRIS_ID = 273;
    var GILDED_BLACKSTONE_ID = 260;
    var MAGMA_ID = 274;
    var NETHER_WART_BLOCK_ID = 263;
    var BASALT_ID = 110;
    var BLACKSTONE_ID = 112;

    // ============================================================
    // NetherGenerator
    // ============================================================

    /**
     * NetherGenerator — generates terrain for the Nether dimension.
     */
    Donkeycraft.NetherGenerator = (function() {
        var _instance = null;
        var _chunkManager = null;

        /**
         * Get the singleton nether generator instance.
         * @returns {Donkeycraft.NetherGenerator}
         */
        function getInstance() {
            if (!_instance) {
                _instance = new Donkeycraft.NetherGenerator();
            }
            return _instance;
        }

        /**
         * Set the chunk manager reference for terrain generation.
         * @param {Donkeycraft.ChunkManager} chunkManager - The ChunkManager.
         */
        function setChunkManager(chunkManager) {
            _chunkManager = chunkManager;
        }

        /**
         * Generate full nether terrain for a chunk.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         */
        function generateNetherTerrain(chunkX, chunkZ) {
            var chunk = _chunkManager.getChunk(chunkX, chunkZ);
            if (!chunk) return;

            // Clear existing data
            chunk.blocks.fill(0);
            chunk.clearLight();

            // Generate terrain layers
            _generateBedrockFloor(chunk);
            _generateBedrockCeiling(chunk);
            _fillNetherrack(chunk);
            _generateLavaSeas(chunk);
            _generateNetherFeatures(chunk, chunkX, chunkZ);
            _generateOreVeins(chunk, chunkX, chunkZ);

            // Mark as generated and dirty
            chunk.generated = true;
            chunk.markDirty();
        }

        /**
         * Generate bedrock floor layers (Y=0 to Y=3).
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @private
         */
        function _generateBedrockFloor(chunk) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    // Bedrock floor: 3-5 blocks thick
                    var thickness = 3 + Math.floor(Donkeycraft.PerlinNoise.noise2D(
                        x * 0.1, z * 0.1
                    ) * 1 + 2);

                    for (var y = 0; y < Math.min(thickness, 5); y++) {
                        chunk.setBlock(x, y, z, BEDROCK_ID);
                    }
                }
            }
        }

        /**
         * Generate bedrock ceiling layers (top 3-5 blocks).
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @private
         */
        function _generateBedrockCeiling(chunk) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var thickness = 3 + Math.floor(Donkeycraft.PerlinNoise.noise2D(
                        x * 0.15 + 100, z * 0.15 + 100
                    ) * 1 + 2);

                    for (var y = 0; y < Math.min(thickness, 5); y++) {
                        var ceilingY = WORLD_HEIGHT - 1 - y;
                        chunk.setBlock(x, ceilingY, z, BEDROCK_ID);
                    }
                }
            }
        }

        /**
         * Fill the main chunk body with netherrack.
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @private
         */
        function _fillNetherrack(chunk) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var y = 5; y < WORLD_HEIGHT - 5; y++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        chunk.setBlock(x, y, z, NETHERRACK_ID);
                    }
                }
            }
        }

        /**
         * Generate lava seas at Y=31-32.
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @private
         */
        function _generateLavaSeas(chunk) {
            var lavaY = 31;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    // Place lava at sea level
                    chunk.setBlock(x, lavaY, z, LAVA_ID);
                    chunk.setBlock(x, lavaY + 1, z, LAVA_ID);

                    // Add some variation
                    var variation = Donkeycraft.PerlinNoise.noise2D(x * 0.05, z * 0.05);
                    if (variation > 0.3) {
                        chunk.setBlock(x, lavaY - 1, z, LAVA_ID);
                    }
                }
            }
        }

        /**
         * Generate nether features: soul sand layers, basalt columns, blackstone clusters.
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @param {number} chunkX - Chunk X coordinate (for noise seeding).
         * @param {number} chunkZ - Chunk Z coordinate (for noise seeding).
         * @private
         */
        function _generateNetherFeatures(chunk, chunkX, chunkZ) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    // Soul sand layers (flat patches near Y=20-40)
                    var soulSandNoise = Donkeycraft.PerlinNoise.fbm(
                        worldX * 0.03, 0, worldZ * 0.03, 3, 0.5, 2.0
                    );
                    if (soulSandNoise > 0.4) {
                        for (var y = 18; y <= 42; y++) {
                            var block = chunk.getBlock(x, y, z);
                            if (block === NETHERRACK_ID) {
                                chunk.setBlock(x, y, z, SOUL_SAND_ID);
                            }
                        }
                    }

                    // Basalt columns (tall vertical structures)
                    var basaltNoise = Donkeycraft.PerlinNoise.fbm(
                        worldX * 0.02 + 50, 0, worldZ * 0.02 + 50, 2, 0.6, 2.0
                    );
                    if (basaltNoise > 0.5) {
                        for (var y2 = 40; y2 <= 70; y2++) {
                            var bBlock = chunk.getBlock(x, y2, z);
                            if (bBlock === NETHERRACK_ID) {
                                chunk.setBlock(x, y2, z, BASALT_ID);
                            }
                        }
                    }

                    // Blackstone clusters
                    var blackstoneNoise = Donkeycraft.PerlinNoise.noise2D(
                        worldX * 0.08 + 200, worldZ * 0.08 + 200
                    );
                    if (blackstoneNoise > 0.6) {
                        var clusterSize = 2 + Math.floor(Math.random() * 3);
                        for (var cx = 0; cx < clusterSize; cx++) {
                            for (var cy = 0; cy < clusterSize; cy++) {
                                for (var cz = 0; cz < clusterSize; cz++) {
                                    var nx = x + cx - Math.floor(clusterSize / 2);
                                    var ny = 50 + cy - Math.floor(clusterSize / 2);
                                    var nz = z + cz - Math.floor(clusterSize / 2);
                                    if (nx >= 0 && nx < CHUNK_SIZE && ny > 5 && ny < WORLD_HEIGHT - 5 && nz >= 0 && nz < CHUNK_SIZE) {
                                        if (chunk.getBlock(nx, ny, nz) === NETHERRACK_ID) {
                                            chunk.setBlock(nx, ny, nz, BLACKSTONE_ID);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        /**
         * Generate ore veins in the nether.
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @private
         */
        function _generateOreVeins(chunk, chunkX, chunkZ) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var y = 5; y < WORLD_HEIGHT - 5; y++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        var block = chunk.getBlock(x, y, z);
                        if (block !== NETHERRACK_ID) continue;

                        var worldX = chunkX * CHUNK_SIZE + x;
                        var worldY = y;
                        var worldZ = chunkZ * CHUNK_SIZE + z;

                        // Nether quartz ore
                        var quartzNoise = Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.1 + 300, worldZ * 0.1 + 300
                        );
                        if (quartzNoise > 0.7 && Math.random() < 0.15) {
                            chunk.setBlock(x, y, z, NETHER_QUARTZ_ORE_ID);
                        }

                        // Nether gold ore
                        var goldNoise = Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.12 + 400, worldY * 0.1 + 400
                        );
                        if (goldNoise > 0.6 && Math.random() < 0.1) {
                            chunk.setBlock(x, y, z, NETHER_GOLD_ORE_ID);
                        }

                        // Gilded blackstone
                        var gildedNoise = Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.09 + 500, worldZ * 0.09 + 500
                        );
                        if (gildedNoise > 0.75 && Math.random() < 0.08) {
                            chunk.setBlock(x, y, z, GILDED_BLACKSTONE_ID);
                        }

                        // Magma blocks (rare)
                        var magmaNoise = Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.06 + 600, worldY * 0.06 + 600
                        );
                        if (magmaNoise > 0.8 && Math.random() < 0.05) {
                            chunk.setBlock(x, y, z, MAGMA_ID);
                        }

                        // Ancient debris (extremely rare, Y=8-22)
                        if (y >= 8 && y <= 22) {
                            var debrisNoise = Donkeycraft.PerlinNoise.noise2D(
                                worldX * 0.04 + 700, worldZ * 0.04 + 700
                            );
                            if (debrisNoise > 0.9 && Math.random() < 0.01) {
                                chunk.setBlock(x, y, z, ANCIENT_DEBRIS_ID);
                            }
                        }
                    }
                }
            }
        }

        /**
         * Generate a heightmap for the nether (simplified — mostly flat).
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @returns {number[]} Heightmap array of size CHUNK_SIZE × CHUNK_SIZE.
         */
        function generateNetherHeightmap(chunkX, chunkZ) {
            var heightmap = new Array(CHUNK_SIZE * CHUNK_SIZE);

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    // Nether terrain is relatively flat — use noise for variation
                    var height = 32 + Math.floor(Donkeycraft.PerlinNoise.fbm(
                        worldX * 0.01, 0, worldZ * 0.01, 3, 0.5, 2.0
                    ) * 8);

                    heightmap[x + z * CHUNK_SIZE] = height;
                }
            }

            return heightmap;
        }

        /**
         * Check if a Y level is lava sea level.
         * @param {number} y - Y coordinate.
         * @returns {boolean}
         */
        function isLavaSeaLevel(y) {
            return y === 31 || y === 32;
        }

        /**
         * Get the nether lava sea level Y.
         * @returns {number}
         */
        function getLavaSeaLevel() {
            return 31;
        }

        /**
         * Destroy and free resources.
         */
        function destroy() {
            _chunkManager = null;
        }

        return {
            getInstance: getInstance,
            setChunkManager: setChunkManager,
            generateNetherTerrain: generateNetherTerrain,
            generateNetherHeightmap: generateNetherHeightmap,
            isLavaSeaLevel: isLavaSeaLevel,
            getLavaSeaLevel: getLavaSeaLevel,
            destroy: destroy
        };
    })();

})();