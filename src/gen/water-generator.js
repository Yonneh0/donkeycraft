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

            // Random underground lakes
            _placeUndergroundLakes(chunk);
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
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @private
         */
        function _placeUndergroundLakes(chunk) {
            if (!_waterBlockId || _waterBlockId === 0) return;

            var seed = chunk.chunkX * 45671 + chunk.chunkZ * 89013;

            // Try to place 1-3 underground lakes
            var lakeCount = 1 + ((seed >> 8) % 3);

            for (var i = 0; i < lakeCount; i++) {
                var hash = _hash2D(seed + i * 73, i * 97);
                var lx = hash % CHUNK_SIZE;
                if (lx < 0) lx += CHUNK_SIZE;
                var lz = ((hash >> 8) % CHUNK_SIZE);
                if (lz < 0) lz += CHUNK_SIZE;

                // Random Y level below surface
                var surfaceY = 40 + ((hash >> 16) % 60); // Y: 40-100
                if (surfaceY >= WORLD_HEIGHT - 5) continue;

                // Lake radius
                var radius = 2 + ((hash >> 24) % 4);

                _placeLake(chunk, lx, surfaceY, lz, radius);
            }
        }

        /**
         * Place a small underground lake (sphere of water).
         * Only replaces air blocks to avoid overwriting terrain.
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
                                chunk.setBlock(bx, by, bz, _waterBlockId);
                            }
                        }
                    }
                }
            }
        }

        /**
         * Get the default water level.
         * @returns {number}
         */
        function getWaterLevel() {
            return _waterLevel;
        }

        /**
         * Set the default water level.
         * @param {number} value - New water level.
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
         * Destroy and free resources.
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
            placeWater: placeWater,
            getWaterLevel: getWaterLevel,
            setWaterLevel: setWaterLevel,
            isLiquidBlock: isLiquidBlock,
            getLiquidBlockIds: getLiquidBlockIds,
            destroy: destroy
        };
    })();

})();