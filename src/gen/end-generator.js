// Donkeycraft — End Terrain Generator
// End terrain: obsidian platform, floating islands, end midlands/highlands, end cities.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // EndGenerator
    // ============================================================

    /**
     * EndGenerator — generates terrain for the End dimension.
     */
    Donkeycraft.EndGenerator = (function () {
        var _chunkManager = null;
        var _endStoneId = 0;
        var _chorusPlantId = 0;
        var _chorusFlowerId = 0;
        var _purpurBlockId = 0;
        var _purpurPillarId = 0;
        var _shroomlightId = 0;

        /**
         * Resolve End dimension block IDs from BlockRegistry.
         * @private
         */
        function _resolveEndBlockIds() {
            if (!Donkeycraft.BlockRegistry) return;

            var es = Donkeycraft.BlockRegistry.getBlockByName('end_stone');
            if (es) _endStoneId = es.id;

            var cp = Donkeycraft.BlockRegistry.getBlockByName('chorus_plant');
            if (cp) _chorusPlantId = cp.id;

            var cf = Donkeycraft.BlockRegistry.getBlockByName('chorus_flower');
            if (cf) _chorusFlowerId = cf.id;

            var pb = Donkeycraft.BlockRegistry.getBlockByName('purpur_block');
            if (pb) _purpurBlockId = pb.id;

            var pp = Donkeycraft.BlockRegistry.getBlockByName('purpur_pillar');
            if (pp) _purpurPillarId = pp.id;

            var sl = Donkeycraft.BlockRegistry.getBlockByName('shroomlight');
            if (sl) _shroomlightId = sl.id;
        }

        /**
         * Set the chunk manager reference for terrain generation.
         * @param {Donkeycraft.ChunkManager} chunkManager - The ChunkManager.
         */
        function setChunkManager(chunkManager) {
            _chunkManager = chunkManager;
        }

        /**
         * Generate full End terrain for a chunk.
         * Accepts either (chunk, chunkX, chunkZ) when called from ChunkManager
         * or (chunkX, chunkZ) when called directly with _chunkManager set.
         * Resolves block IDs from BlockRegistry on first call.
         * @param {Donkeycraft.Chunk|number} chunkOrX - Chunk object or chunk X coordinate.
         * @param {number} [optChunkX] - Chunk Z coordinate (when using new signature) or chunk X (legacy).
         * @param {number} [optChunkZ] - Chunk Z coordinate (legacy unused param).
         */
        function generateEndTerrain(chunkOrX, optChunkX, optChunkZ) {
            // Resolve block IDs on first call
            if (!_endStoneId) {
                _resolveEndBlockIds();
            }

            var chunk;
            var cx, cz;

            // Detect calling convention: if first arg is a Chunk object, use new signature
            if (chunkOrX && typeof chunkOrX.getBlock === 'function') {
                chunk = chunkOrX;
                cx = chunk.chunkX;
                cz = optChunkX;
            } else {
                // Legacy signature: (chunkX, chunkZ) with _chunkManager
                cx = chunkOrX;
                cz = optChunkX;
                if (!_chunkManager) return;
                chunk = _chunkManager.getChunk(cx, cz);
                if (!chunk) return;
            }

            // Clear existing data
            chunk.blocks.fill(0);
            chunk.clearLight();

            // Determine island type for this chunk position
            var islandType = _getIslandType(cx, cz);

            // Generate terrain based on island type
            switch (islandType) {
                case 'midlands':
                    _generateMidlands(chunk, cx, cz);
                    break;
                case 'highlands':
                    _generateHighlands(chunk, cx, cz);
                    break;
                case 'outer':
                    _generateOuterEnd(chunk, cx, cz);
                    break;
                default:
                    // Inner islands — nothing to generate (center area)
                    break;
            }

            // Always attempt to place end cities on highlands
            if (islandType === 'highlands') {
                _generateEndCity(chunk, cx, cz);
            }

            // Mark as generated and dirty
            chunk.generated = true;
            chunk.markDirty();
        }

        /**
         * Determine the island type for a chunk position.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @returns {string} Island type: 'midlands', 'highlands', 'outer', or 'inner'.
         * @private
         */
        function _getIslandType(chunkX, chunkZ) {
            // Calculate distance from center (0, 0)
            var dist = Math.sqrt(chunkX * chunkX + chunkZ * chunkZ);

            // Inner ring: 0-2 chunks — no islands (void)
            if (dist < 2) {
                return 'inner';
            }

            // Midlands: 2-12 chunks — moderate island generation
            if (dist < 12) {
                var noise = Donkeycraft.PerlinNoise.noise2D(
                    chunkX * 0.1, chunkZ * 0.1
                );
                return noise > -0.3 ? 'midlands' : 'inner';
            }

            // Highlands: 12-30 chunks — large elevated islands
            if (dist < 30) {
                var highlandNoise = Donkeycraft.PerlinNoise.noise2D(
                    chunkX * 0.08 + 50, chunkZ * 0.08 + 50
                );
                return highlandNoise > -0.2 ? 'highlands' : 'midlands';
            }

            // Outer End: 30+ chunks — sparse small islands
            var outerNoise = Donkeycraft.PerlinNoise.noise2D(
                chunkX * 0.05 + 100, chunkZ * 0.05 + 100
            );
            return outerNoise > 0.3 ? 'outer' : 'inner';
        }

        /**
         * Generate End midlands terrain (moderate islands).
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @private
         */
        function _generateMidlands(chunk, chunkX, chunkZ) {
            if (!chunk || !chunk.setBlock || !_endStoneId) return;

            var islandY = 49;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    var heightNoise = Donkeycraft.PerlinNoise.fbm(
                        worldX * 0.05, 0, worldZ * 0.05, 3, 0.5, 2.0
                    );
                    var shapeNoise = Donkeycraft.PerlinNoise.noise2D(
                        worldX * 0.1, worldZ * 0.1
                    );

                    if (heightNoise > -0.3 && shapeNoise > -0.5) {
                        var height = Math.floor((heightNoise + 1) * 3 + 2); // 2-8 blocks tall

                        for (var y = 0; y < height; y++) {
                            var blockY = islandY + y;

                            if (y === height - 1 && Math.random() < 0.08 && _chorusPlantId) {
                                chunk.setBlock(x, blockY, z, _chorusPlantId);
                            } else {
                                chunk.setBlock(x, blockY, z, _endStoneId);
                            }
                        }

                        if (Math.random() < 0.12 && _chorusFlowerId) {
                            chunk.setBlock(x, islandY + height, z, _chorusFlowerId);
                        }
                    }
                }
            }
        }

        /**
         * Generate End highlands terrain (large elevated islands).
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @private
         */
        function _generateHighlands(chunk, chunkX, chunkZ) {
            if (!chunk || !chunk.setBlock || !_endStoneId) return;

            var baseY = 55;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    var heightNoise = Donkeycraft.PerlinNoise.fbm(
                        worldX * 0.04, 0, worldZ * 0.04, 4, 0.5, 2.0
                    );
                    var shapeNoise = Donkeycraft.PerlinNoise.noise2D(
                        worldX * 0.08 + 30, worldZ * 0.08 + 30
                    );

                    if (heightNoise > -0.4 && shapeNoise > -0.6) {
                        var height = Math.floor((heightNoise + 1) * 5 + 4); // 4-14 blocks tall

                        for (var y = 0; y < height; y++) {
                            chunk.setBlock(x, baseY + y, z, _endStoneId);
                        }

                        if (Math.random() < 0.2 && _chorusPlantId) {
                            chunk.setBlock(x, baseY + height, z, _chorusPlantId);
                        }
                    }
                }
            }
        }

        /**
         * Generate Outer End terrain (sparse small islands).
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @private
         */
        function _generateOuterEnd(chunk, chunkX, chunkZ) {
            if (!chunk || !chunk.setBlock || !_endStoneId) return;

            var baseY = 45;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    var noise = Donkeycraft.PerlinNoise.noise2D(
                        worldX * 0.15 + 200, worldZ * 0.15 + 200
                    );

                    if (noise > 0.4) {
                        var height = Math.floor((noise - 0.4) * 4 + 1); // 1-3 blocks tall

                        for (var y = 0; y < height; y++) {
                            chunk.setBlock(x, baseY + y, z, _endStoneId);
                        }
                    }
                }
            }
        }

        /**
         * Generate an End City structure within a chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @private
         */
        function _generateEndCity(chunk, chunkX, chunkZ) {
            if (!chunk || !chunk.setBlock || !_purpurBlockId) return;

            // End cities are rare — ~5% chance per highlands chunk
            var cityChance = Donkeycraft.PerlinNoise.noise2D(
                chunkX * 0.3 + 500, chunkZ * 0.3 + 500
            );

            if (cityChance < 0.6) {
                return; // No city here
            }

            var cx = Math.floor(CHUNK_SIZE / 2);
            var cz = Math.floor(CHUNK_SIZE / 2);
            var baseY = 65;

            var towerHeight = 8 + Math.floor(Math.random() * 6); // 8-13 blocks tall

            for (var y = 0; y < towerHeight; y++) {
                // Tower walls (3x3 with hollow center)
                for (var tx = -1; tx <= 1; tx++) {
                    for (var tz = -1; tz <= 1; tz++) {
                        if (Math.abs(tx) === 1 || Math.abs(tz) === 1) {
                            var bx = cx + tx;
                            var by = baseY + y;
                            var bz = cz + tz;

                            if (bx >= 0 && bx < CHUNK_SIZE && by > 5 && by < WORLD_HEIGHT - 5 && bz >= 0 && bz < CHUNK_SIZE) {
                                chunk.setBlock(bx, by, bz, _purpurBlockId);
                            }
                        }
                    }
                }

                // Floor
                if (y < towerHeight - 1) {
                    chunk.setBlock(cx, baseY + y, cz, _purpurBlockId);
                }
            }

            // Add purpur pillars on corners
            var pillarHeights = [3, 4, 5, 6];
            for (var p = 0; p < pillarHeights.length; p++) {
                var px = cx + (p < 2 ? -2 : 2);
                var pz = cz + (p % 2 === 0 ? -2 : 2);
                var ph = pillarHeights[p];

                for (var py = 0; py < ph; py++) {
                    if (px >= 0 && px < CHUNK_SIZE && pz >= 0 && pz < CHUNK_SIZE) {
                        var blockId = _purpurBlockId;
                        if (_purpurPillarId) blockId = _purpurPillarId;
                        chunk.setBlock(px, baseY + towerHeight + py, pz, blockId);
                    }
                }
            }

            // Add shroomlights for decoration
            if (Math.random() < 0.5 && _shroomlightId) {
                chunk.setBlock(cx + 3, baseY + 2, cz + 3, _shroomlightId);
            }
        }

        /**
         * Generate a heightmap for the End dimension.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @returns {number[]} Heightmap array of size CHUNK_SIZE × CHUNK_SIZE.
         */
        function generateEndHeightmap(chunkX, chunkZ) {
            var heightmap = new Array(CHUNK_SIZE * CHUNK_SIZE);

            var islandType = _getIslandType(chunkX, chunkZ);
            var baseY;

            if (islandType === 'highlands') {
                baseY = 55;
            } else if (islandType === 'outer') {
                baseY = 45;
            } else {
                baseY = 49; // midlands
            }

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    var noise = Donkeycraft.PerlinNoise.fbm(
                        worldX * 0.05, 0, worldZ * 0.05, 3, 0.5, 2.0
                    );

                    if (noise > -0.3) {
                        var height = baseY + Math.floor((noise + 1) * 3 + 2);
                        heightmap[x + z * CHUNK_SIZE] = height;
                    } else {
                        heightmap[x + z * CHUNK_SIZE] = 0; // Void
                    }
                }
            }

            return heightmap;
        }

        /**
         * Check if a chunk position is on an island.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         * @returns {boolean}
         */
        function isIslandChunk(chunkX, chunkZ) {
            var type = _getIslandType(chunkX, chunkZ);
            return type !== 'inner';
        }

        /**
         * Get the base Y level for a given island type.
         * @param {string} islandType - Island type string.
         * @returns {number} Base Y level.
         */
        function getBaseYForIslandType(islandType) {
            switch (islandType) {
                case 'highlands': return 55;
                case 'outer': return 45;
                default: return 49; // midlands
            }
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The EndGenerator module.
         */
        function getInstance() {
            return Donkeycraft.EndGenerator;
        }

        /**
         * Invalidate cached End block IDs and re-resolve from BlockRegistry.
         * Call this after dynamically adding new blocks to the registry.
         */
        function invalidateBlockIdCache() {
            _endStoneId = 0;
            _chorusPlantId = 0;
            _chorusFlowerId = 0;
            _purpurBlockId = 0;
            _purpurPillarId = 0;
            _shroomlightId = 0;
            _resolveEndBlockIds();
        }

        /**
         * Destroy and free resources.
         */
        function destroy() {
            _chunkManager = null;
            _endStoneId = 0;
            _chorusPlantId = 0;
            _chorusFlowerId = 0;
            _purpurBlockId = 0;
            _purpurPillarId = 0;
            _shroomlightId = 0;
        }

        return {
            getInstance: getInstance,
            setChunkManager: setChunkManager,
            generateEndTerrain: generateEndTerrain,
            generateEndHeightmap: generateEndHeightmap,
            isIslandChunk: isIslandChunk,
            getBaseYForIslandType: getBaseYForIslandType,
            invalidateBlockIdCache: invalidateBlockIdCache,
            destroy: destroy
        };
    })();

})();