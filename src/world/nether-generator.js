// Donkeycraft — Nether Terrain Generator
// Nether terrain: bedrock ceiling/floor, lava seas, netherrack, unique structures.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // NetherGenerator
    // ============================================================

    /**
     * NetherGenerator — generates terrain for the Nether dimension.
     */
    Donkeycraft.NetherGenerator = (function() {
        var _chunkManager = null;

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
         * Generate bedrock floor layers (Y=0 to Y=4).
         * Thickness is 3-5 blocks based on noise variation.
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @private
         */
        function _generateBedrockFloor(chunk) {
            var bedrock = Donkeycraft.BlockRegistry.getBlockById(37);
            if (!bedrock) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    // noise2D returns [-1, 1]; map to [0, 1] then scale to 3-5
                    var n = (Donkeycraft.PerlinNoise.noise2D(x * 0.1, z * 0.1) + 1) * 0.5;
                    var thickness = Math.floor(n * 3) + 3; // 3 to 5

                    for (var y = 0; y < thickness && y < WORLD_HEIGHT; y++) {
                        chunk.setBlock(x, y, z, bedrock.id);
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
            var bedrock = Donkeycraft.BlockRegistry.getBlockById(37);
            if (!bedrock) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var n = (Donkeycraft.PerlinNoise.noise2D(x * 0.15 + 100, z * 0.15 + 100) + 1) * 0.5;
                    var thickness = Math.floor(n * 3) + 3; // 3 to 5

                    for (var y = 0; y < thickness && WORLD_HEIGHT - 1 - y >= 0; y++) {
                        var ceilingY = WORLD_HEIGHT - 1 - y;
                        chunk.setBlock(x, ceilingY, z, bedrock.id);
                    }
                }
            }
        }

        /**
         * Fill the main chunk body with netherrack, leaving space for bedrock floor/ceiling.
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @private
         */
        function _fillNetherrack(chunk) {
            var netherrack = Donkeycraft.BlockRegistry.getBlockById(257);
            if (!netherrack) return;

            // Floor bedrock occupies Y=0..~5, ceiling bedrock occupies Y=~WORLD_HEIGHT-5..end
            // Fill netherrack in between, avoiding areas already occupied by bedrock
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var y = 6; y < WORLD_HEIGHT - 6; y++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        chunk.setBlock(x, y, z, netherrack.id);
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
            var lava = Donkeycraft.BlockRegistry.getBlockById(213);
            if (!lava) return;

            var lavaY = 31;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    // Place lava at sea level
                    chunk.setBlock(x, lavaY, z, lava.id);
                    chunk.setBlock(x, lavaY + 1, z, lava.id);

                    // Add some variation
                    var variation = Donkeycraft.PerlinNoise.noise2D(x * 0.05, z * 0.05);
                    if (variation > 0.3) {
                        chunk.setBlock(x, lavaY - 1, z, lava.id);
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
            var netherrack = Donkeycraft.BlockRegistry.getBlockById(257);
            var soulSand = Donkeycraft.BlockRegistry.getBlockById(258);
            var basalt = Donkeycraft.BlockRegistry.getBlockById(110);
            var blackstone = Donkeycraft.BlockRegistry.getBlockById(112);

            if (!netherrack) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    // Soul sand layers (flat patches near Y=20-40)
                    var soulSandNoise = Donkeycraft.PerlinNoise.fbm(
                        worldX * 0.03, 0, worldZ * 0.03, 3, 0.5, 2.0
                    );
                    if (soulSandNoise > 0.4 && soulSand) {
                        for (var y = 18; y <= 42; y++) {
                            var block = chunk.getBlock(x, y, z);
                            if (block === netherrack.id) {
                                chunk.setBlock(x, y, z, soulSand.id);
                            }
                        }
                    }

                    // Basalt columns (tall vertical structures)
                    var basaltNoise = Donkeycraft.PerlinNoise.fbm(
                        worldX * 0.02 + 50, 0, worldZ * 0.02 + 50, 2, 0.6, 2.0
                    );
                    if (basaltNoise > 0.5 && basalt) {
                        for (var y2 = 40; y2 <= 70; y2++) {
                            var bBlock = chunk.getBlock(x, y2, z);
                            if (bBlock === netherrack.id) {
                                chunk.setBlock(x, y2, z, basalt.id);
                            }
                        }
                    }

                    // Blackstone clusters
                    var blackstoneNoise = Donkeycraft.PerlinNoise.noise2D(
                        worldX * 0.08 + 200, worldZ * 0.08 + 200
                    );
                    if (blackstoneNoise > 0.6 && blackstone) {
                        var clusterSize = 2 + Math.floor(Math.random() * 3);
                        for (var cx = 0; cx < clusterSize; cx++) {
                            for (var cy = 0; cy < clusterSize; cy++) {
                                for (var cz = 0; cz < clusterSize; cz++) {
                                    var nx = x + cx - Math.floor(clusterSize / 2);
                                    var ny = 50 + cy - Math.floor(clusterSize / 2);
                                    var nz = z + cz - Math.floor(clusterSize / 2);
                                    if (nx >= 0 && nx < CHUNK_SIZE && ny > 5 && ny < WORLD_HEIGHT - 5 && nz >= 0 && nz < CHUNK_SIZE) {
                                        if (chunk.getBlock(nx, ny, nz) === netherrack.id) {
                                            chunk.setBlock(nx, ny, nz, blackstone.id);
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
            var netherrack = Donkeycraft.BlockRegistry.getBlockById(257);
            var quartzOre = Donkeycraft.BlockRegistry.getBlockById(238);
            var goldOre = Donkeycraft.BlockRegistry.getBlockById(272);
            var gildedBlackstone = Donkeycraft.BlockRegistry.getBlockById(260);
            var magmaBlock = Donkeycraft.BlockRegistry.getBlockById(274);
            var ancientDebris = Donkeycraft.BlockRegistry.getBlockById(273);

            if (!netherrack) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var y = 5; y < WORLD_HEIGHT - 5; y++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        var block = chunk.getBlock(x, y, z);
                        if (block !== netherrack.id) continue;

                        var worldX = chunkX * CHUNK_SIZE + x;
                        var worldY = y;
                        var worldZ = chunkZ * CHUNK_SIZE + z;

                        // Nether quartz ore
                        var quartzNoise = Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.1 + 300, worldZ * 0.1 + 300
                        );
                        if (quartzNoise > 0.7 && Math.random() < 0.15 && quartzOre) {
                            chunk.setBlock(x, y, z, quartzOre.id);
                        }

                        // Nether gold ore
                        var goldNoise = Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.12 + 400, worldY * 0.1 + 400
                        );
                        if (goldNoise > 0.6 && Math.random() < 0.1 && goldOre) {
                            chunk.setBlock(x, y, z, goldOre.id);
                        }

                        // Gilded blackstone
                        var gildedNoise = Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.09 + 500, worldZ * 0.09 + 500
                        );
                        if (gildedNoise > 0.75 && Math.random() < 0.08 && gildedBlackstone) {
                            chunk.setBlock(x, y, z, gildedBlackstone.id);
                        }

                        // Magma blocks (rare)
                        var magmaNoise = Donkeycraft.PerlinNoise.noise2D(
                            worldX * 0.06 + 600, worldY * 0.06 + 600
                        );
                        if (magmaNoise > 0.8 && Math.random() < 0.05 && magmaBlock) {
                            chunk.setBlock(x, y, z, magmaBlock.id);
                        }

                        // Ancient debris (extremely rare, Y=8-22)
                        if (y >= 8 && y <= 22 && ancientDebris) {
                            var debrisNoise = Donkeycraft.PerlinNoise.noise2D(
                                worldX * 0.04 + 700, worldZ * 0.04 + 700
                            );
                            if (debrisNoise > 0.9 && Math.random() < 0.01) {
                                chunk.setBlock(x, y, z, ancientDebris.id);
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
         * Get the module object itself as the "instance".
         * @returns {object} The NetherGenerator module.
         */
        function getInstance() {
            return Donkeycraft.NetherGenerator;
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