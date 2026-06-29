// Donkeycraft — Water Generator
// Water source placement: lakes, ocean floors, surface water per biome.
(function () {
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
    Donkeycraft.WaterGenerator = (function () {
        var _waterLevel = 63; // Default sea level
        var _waterBlockId = null; // Cached water block ID from BlockRegistry
        var _liquidBlocks = {}; // Cache of liquid block IDs for quick lookup

        /**
         * Resolve the water block ID from BlockRegistry.
         * Tries multiple names since water may be registered as 'water', 'water_still', or 'water_flow'.
         * @private
         */
        function _resolveWaterBlockId() {
            if (_waterBlockId !== null) return; // Already resolved
            if (!Donkeycraft.BlockRegistry) {
                _waterBlockId = 212; // Fallback: water block ID per block.js registry
                return;
            }

            var waterNames = ['water', 'water_still', 'water_flow', 'flowing_water'];
            for (var i = 0; i < waterNames.length; i++) {
                var w = Donkeycraft.BlockRegistry.getBlockByName(waterNames[i]);
                if (w) {
                    _waterBlockId = w.id;
                    return;
                }
            }

            // Final fallback: water is ID 212 in block.js
            _waterBlockId = 212;
        }

        /**
         * Get the water block ID.
         * @returns {number} Water block ID, or 0 if not found.
         * @private
         */
        function _getWaterBlockId() {
            _resolveWaterBlockId();
            return _waterBlockId || 0;
        }

        /**
         * Resolve the water block ID and liquid cache from BlockRegistry.
         * @private
         */
        function _resolveLiquidBlocks() {
            if (!Donkeycraft.BlockRegistry) return;

            var liquidNames = ['water', 'water_still', 'flowing_water', 'lava', 'lava_still', 'flowing_lava'];
            for (var i = 0; i < liquidNames.length; i++) {
                var block = Donkeycraft.BlockRegistry.getBlockByName(liquidNames[i]);
                if (block) {
                    _registerLiquidBlock(block.id);
                }
            }
        }

        /**
         * Place water sources in a chunk.
         * Only replaces air blocks — never overwrites existing terrain.
         * @param {Donkeycraft.Chunk} chunk - The chunk to place water in.
         * @param {number} biomeId - Biome ID for this chunk.
         * @param {number[]} heightmap - Heightmap array.
         */
        function placeWater(chunk, biomeId, heightmap) {
            // Input validation
            if (!chunk || typeof chunk.getBlock !== 'function' || typeof chunk.setBlock !== 'function') return;

            var biome = Donkeycraft.BiomeRegistry ? Donkeycraft.BiomeRegistry.getBiomeById(biomeId) : null;
            if (!biome) return;

            // Resolve water block ID and liquid cache
            _resolveLiquidBlocks();
            _resolveWaterBlockId();
            if (!_waterBlockId || _waterBlockId === 0) return;

            // Ocean biomes: fill to water level
            if (biome.isOcean) {
                _placeOceanWater(chunk, heightmap);
            } else {
                // Overworld biomes: surface water in low areas
                _placeSurfaceWater(chunk, heightmap);
            }

            // Random underground lakes (pass heightmap for terrain clamping)
            _placeUndergroundLakes(chunk, heightmap);
        }

        /**
         * Place ocean water across the chunk.
         * Fills from surface+1 to water level with water, only replacing air blocks.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _placeOceanWater(chunk, heightmap) {
            if (!heightmap) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE] || 20;

                    // Fill from surface+1 to water level with water, only replacing air blocks.
                    // This prevents overwriting terrain that was placed above the heightmap.
                    for (var y = surfaceY + 1; y <= _waterLevel && y < WORLD_HEIGHT; y++) {
                        if (chunk.getBlock(x, y, z) === 0) { // Only replace air
                            chunk.setBlock(x, y, z, _waterBlockId);
                        }
                    }
                }
            }
        }

        /**
         * Place surface water in low-lying areas of overworld biomes.
         * Fills below water level with water where terrain is below sea level.
         * Only replaces air blocks to avoid overwriting placed terrain.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} heightmap - Heightmap array.
         * @private
         */
        function _placeSurfaceWater(chunk, heightmap) {
            if (!heightmap) return;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE] || 63;

                    // Place water where terrain is below water level.
                    // Only fill air blocks — never overwrite existing terrain.
                    if (surfaceY < _waterLevel) {
                        for (var y = surfaceY + 1; y <= _waterLevel && y < WORLD_HEIGHT; y++) {
                            if (chunk.getBlock(x, y, z) === 0) { // Only replace air
                                chunk.setBlock(x, y, z, _waterBlockId);
                            }
                        }
                    }
                }
            }
        }

        /**
         * Place underground lakes using noise-based detection.
         * Uses world seed for deterministic lake placement across all chunks.
         * Lake Y levels are clamped to terrain surface via heightmap to prevent floating water.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number[]} [heightmap] - Optional heightmap for terrain clamping.
         * @private
         */
        function _placeUndergroundLakes(chunk, heightmap) {
            if (!_waterBlockId || _waterBlockId === 0) return;

        // Use centralized _gen._hash2D with world seed for deterministic placement.
        var worldSeed = Donkeycraft.Config ? (Donkeycraft.Config.SEED || 42) : 42;
        var chunkSeed = Donkeycraft._gen._hash2D(chunk.chunkX, chunk.chunkZ);
        var lakeCount = 1 + ((chunkSeed >> 8) % 3);

        for (var i = 0; i < lakeCount; i++) {
            var hash = Donkeycraft._gen._hash2D(chunkSeed + i * 73, i * 97);
                var lx = hash % CHUNK_SIZE;
                if (lx < 0) lx += CHUNK_SIZE;
                var lz = ((hash >> 8) % CHUNK_SIZE);
                if (lz < 0) lz += CHUNK_SIZE;

                // Determine terrain surface Y at this position for clamping
                var surfaceY = WORLD_HEIGHT;
                if (heightmap) {
                    surfaceY = heightmap[lx + lz * CHUNK_SIZE] || WORLD_HEIGHT;
                }

                // Clamp lake Y to be underground: between Y=5 and surfaceY-4
                // This ensures lakes are always below terrain surface
                var maxLakeY = Math.min(surfaceY - 4, 60); // Cap at Y=60 for "underground" feel
                var minLakeY = 5;

                if (minLakeY >= maxLakeY) continue; // No valid range

                // Random Y level within clamped range
                var lakeY = minLakeY + ((hash >> 16) % (maxLakeY - minLakeY));

                if (lakeY >= WORLD_HEIGHT - 5) continue;

                // Lake radius
                var radius = 2 + ((hash >> 24) % 3); // Slightly reduced: 2-4 instead of 2-5

                _placeLake(chunk, lx, lakeY, lz, radius);
            }
        }

        /**
         * Place a small underground lake (sphere of water).
         * Only replaces air blocks to avoid overwriting terrain.
         * Uses efficient support validation: checks only nearby blocks below instead of
         * scanning all the way to Y=0, preventing performance issues in deep caves.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} cx - Center X.
         * @param {number} cy - Center Y.
         * @param {number} cz - Center Z.
         * @param {number} radius - Lake radius.
         * @private
         */
        function _placeLake(chunk, cx, cy, cz, radius) {
            if (!_waterBlockId || _waterBlockId === 0) return;

            var r = Math.ceil(radius);

            for (var dx = -r; dx <= r; dx++) {
                for (var dy = -r; dy <= r; dy++) {
                    for (var dz = -r; dz <= r; dz++) {
                        var distSq = dx * dx + dy * dy + dz * dz;
                        if (distSq > radius * radius) continue;

                        var bx = cx + dx;
                        var by = cy + dy;
                        var bz = cz + dz;

                        // Check bounds
                        if (bx >= 0 && bx < CHUNK_SIZE &&
                            by >= 0 && by < WORLD_HEIGHT &&
                            bz >= 0 && bz < CHUNK_SIZE) {
                            // Only replace air blocks — never overwrite existing terrain.
                            if (chunk.getBlock(bx, by, bz) === 0) {
                                // Validate: water block must have solid support below (not air).
                                // Uses efficient nearby check (up to 8 blocks down) instead of
                                // scanning all the way to Y=0, preventing O(n) per-block cost.
                                if (by > 0) {
                                    var blockBelow = chunk.getBlock(bx, by - 1, bz);
                                    if (blockBelow === 0) {
                                        // Check within a limited depth for solid support.
                                        // Lakes can sit on terrain below caves without scanning infinitely.
                                        var foundSupport = false;
                                        var checkLimit = Math.max(0, by - 8); // At most 8 blocks down
                                        for (var checkY = by - 1; checkY >= checkLimit; checkY--) {
                                            if (chunk.getBlock(bx, checkY, bz) !== 0) {
                                                foundSupport = true;
                                                break;
                                            }
                                        }
                                        if (!foundSupport) continue;
                                    }
                                }
                                chunk.setBlock(bx, by, bz, _waterBlockId);
                            }
                        }
                    }
                }
            }
        }

        /**
         * Get the default water level (sea level).
         * @returns {number} Water level Y coordinate.
         */
        function getWaterLevel() {
            return _waterLevel;
        }

        /**
         * Set the default water level (sea level).
         * @param {number} value - New water level (must be > 0 and < WORLD_HEIGHT).
         */
        function setWaterLevel(value) {
            if (typeof value === 'number' && value > 0 && value < WORLD_HEIGHT) {
                _waterLevel = Math.floor(value);
            }
        }

        /**
         * Register a block ID as a liquid block.
         * @param {number} blockId - Block ID to register.
         * @private
         */
        function _registerLiquidBlock(blockId) {
            _liquidBlocks[blockId] = true;
        }

        /**
         * Check if a block ID is a liquid.
         * @param {number} blockId - Block ID.
         * @returns {boolean} True if the block is a liquid.
         */
        function isLiquidBlock(blockId) {
            return _liquidBlocks[blockId] === true;
        }

        /**
         * Get all known liquid block IDs.
         * @returns {number[]} Array of liquid block IDs.
         */
        function getLiquidBlockIds() {
            var result = [];
            for (var id in _liquidBlocks) {
                if (_liquidBlocks.hasOwnProperty(id)) {
                    result.push(parseInt(id, 10));
                }
            }
            return result;
        }

        /**
         * Clear the liquid block cache.
         * @private
         */
        function _clearLiquidCache() {
            _liquidBlocks = {};
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
         * Initialize the water generator — resolves water block ID and liquid cache from BlockRegistry.
         * Should be called once during game initialization.
         * @private
         */
        function _init() {
            _resolveLiquidBlocks();
            _resolveWaterBlockId();
        }

        /**
         * Destroy the water generator and free resources.
         * Clears cached block IDs and liquid cache.
         */
        function destroy() {
            _waterBlockId = null;
            _liquidBlocks = {};
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The WaterGenerator module.
         */
        function getInstance() {
            return Donkeycraft.WaterGenerator;
        }

        return {
            getInstance: getInstance,
            init: _init,
            placeWater: placeWater,
            getWaterLevel: getWaterLevel,
            setWaterLevel: setWaterLevel,
            isLiquidBlock: isLiquidBlock,
            getLiquidBlockIds: getLiquidBlockIds,
            destroy: destroy
        };
    })();

})();