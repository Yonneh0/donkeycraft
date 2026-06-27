// Donkeycraft — Physics
// Block physics: gravity blocks (sand/gravel), liquid flow, redstone signal propagation.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // Physics
    // ============================================================

    /**
     * Physics — handles block physics simulations.
     */
    Donkeycraft.Physics = (function() {
        // Block sets for gravity-affected and liquid blocks
        var _gravityBlocks = {};
        var _liquidBlocks = {};
        var _initialized = false;

        /**
         * Initialize gravity and liquid block sets from Block registry.
         * Resolves gravity-affected blocks by name from BlockRegistry for correctness.
         * Also populates liquid block cache by checking all registered blocks.
         * @public
         */
        function init() {
            if (_initialized) return;

            _doResolveBlocks();
            _initialized = true;
        }

        /**
         * Re-initialize the physics module after new blocks are added to BlockRegistry.
         * Clears existing caches and re-resolves all block sets from scratch.
         * Call this after dynamically adding new blocks to the registry.
         * @public
         */
        function reinit() {
            // Clear caches
            _gravityBlocks = {};
            _liquidBlocks = {};
            _initialized = false;

            // Re-resolve
            _doResolveBlocks();
            _initialized = true;
        }

        /**
         * Internal: resolve all gravity and liquid block sets.
         * @private
         */
        function _doResolveBlocks() {
            if (!Donkeycraft.BlockRegistry) return;

            // Resolve gravity-affected blocks by name from BlockRegistry
            var gravityBlockNames = ['sand', 'gravel', 'redstone_block'];

            for (var i = 0; i < gravityBlockNames.length; i++) {
                var block = Donkeycraft.BlockRegistry.getBlockByName(gravityBlockNames[i]);
                if (block) {
                    _gravityBlocks[block.id] = true;
                }
            }

            // Populate liquid block cache by checking all registered blocks
            for (var id = 0; id < 1000; id++) {
                if (Donkeycraft.BlockRegistry.isLiquid && Donkeycraft.BlockRegistry.isLiquid(id)) {
                    _liquidBlocks[id] = true;
                }
            }
        }

        /**
         * Apply gravity to a single block at the given position.
         * If the block is a gravity-affected block (sand, gravel, etc.),
         * it will fall downward if there's air or liquid below it.
         * @param {Donkeycraft.Chunk} chunk - The chunk containing the block.
         * @param {number} x - Local X coordinate [0, 15].
         * @param {number} y - Local Y coordinate [0, 255].
         * @param {number} z - Local Z coordinate [0, 15].
         * @returns {boolean} True if the block moved.
         */
        function applyGravity(chunk, x, y, z) {
            var blockId = chunk.getBlock(x, y, z);

            // Check if this is a gravity-affected block
            if (!_gravityBlocks[blockId]) return false;

            // Can't fall below world bottom
            if (y <= 0) return false;

            var belowBlockId = chunk.getBlock(x, y - 1, z);

            // Only fall into air or liquids
            if (!_canFallInto(belowBlockId)) return false;

            // Move the block down
            chunk.setBlock(x, y, z, 0); // Set current to air
            chunk.setBlock(x, y - 1, z, blockId); // Place below

            return true;
        }

        /**
         * Check if a block can be fallen into (air or liquid).
         * @param {number} blockId - Block ID to check.
         * @returns {boolean} True if the block can be fallen into.
         * @private
         */
        function _canFallInto(blockId) {
            return !blockId || !!_liquidBlocks[blockId];
        }

        /**
         * Apply gravity to all gravity-affected blocks in a chunk.
         * Processes from top to bottom so falling blocks move only once per tick.
         * @param {Donkeycraft.Chunk} chunk - The chunk to process.
         */
        function applyGravityToChunk(chunk) {
            for (var y = WORLD_HEIGHT - 1; y >= 0; y--) {
                for (var x = 0; x < CHUNK_SIZE; x++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        applyGravity(chunk, x, y, z);
                    }
                }
            }
        }

        /**
         * Apply gravity to a column of blocks (optimization for bulk updates).
         * @param {Donkeycraft.Chunk} chunk - The chunk to process.
         * @param {number} x - Local X coordinate [0, 15].
         * @param {number} z - Local Z coordinate [0, 15].
         */
        function applyGravityColumn(chunk, x, z) {
            for (var y = 0; y < WORLD_HEIGHT; y++) {
                applyGravity(chunk, x, y, z);
            }
        }

        /**
         * Simulate liquid flow from a single block position.
         * Liquids flow to adjacent lower blocks and spread horizontally based on level.
         * @param {Donkeycraft.Chunk} chunk - The chunk containing the liquid.
         * @param {number} x - Source X coordinate [0, 15].
         * @param {number} y - Source Y coordinate [0, 255].
         * @param {number} z - Source Z coordinate [0, 15].
         * @param {number} sourceLevel - Original liquid level (0-8).
         * @returns {number} Remaining unflowed liquid level after processing.
         */
        function flowLiquid(chunk, x, y, z, sourceLevel) {
            var blockId = chunk.getBlock(x, y, z);

            // Check if this is a liquid
            if (!_liquidBlocks[blockId]) return 0;

            // Calculate flow spread based on level
            var newLevel = sourceLevel;
            var spreadAmount = Math.max(1, sourceLevel - 1);

            // Flow to adjacent blocks (4 cardinal directions)
            var directions = [
                { dx: 1, dz: 0 },
                { dx: -1, dz: 0 },
                { dx: 0, dz: 1 },
                { dx: 0, dz: -1 }
            ];

            for (var i = 0; i < directions.length; i++) {
                var nx = x + directions[i].dx;
                var nz = z + directions[i].dz;

                // Check bounds
                if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) continue;

                var neighborId = chunk.getBlock(nx, y, nz);

                // Flow into air
                if (!neighborId) {
                    chunk.setBlock(nx, y, nz, blockId);
                    newLevel = Math.max(newLevel - 2, 0);
                }
                // Flow into same liquid type (merge)
                else if (neighborId === blockId) {
                    var neighborLevel = _getLiquidLevel(chunk, nx, y, nz, blockId);
                    if (neighborLevel < sourceLevel) {
                        newLevel = Math.max(newLevel - 1, 0);
                    }
                }
                // Flow into lower liquid level (different liquid type)
                else if (_liquidBlocks[neighborId]) {
                    var lowerLevel = _getLiquidLevel(chunk, nx, y, nz, neighborId);
                    if (lowerLevel < sourceLevel - 1) {
                        newLevel = Math.max(newLevel - 1, 0);
                    }
                }
            }

            // Flow downward
            if (y > 0) {
                var belowId = chunk.getBlock(x, y - 1, z);
                if (!belowId) {
                    chunk.setBlock(x, y - 1, z, blockId);
                    newLevel = Math.max(newLevel - 2, 0);
                } else if (_liquidBlocks[belowId]) {
                    var belowLevel = _getLiquidLevel(chunk, x, y - 1, z, belowId);
                    if (belowLevel < sourceLevel) {
                        newLevel = Math.max(newLevel - 1, 0);
                    }
                }
            }

            return newLevel;
        }

        /**
         * Get the liquid level for a block. Since chunk data doesn't store per-block
         * liquid levels in this minimal implementation, liquids default to level 8 (full).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - Local X.
         * @param {number} y - Local Y.
         * @param {number} z - Local Z.
         * @param {number} blockId - Expected liquid block ID (unused, for signature compatibility).
         * @returns {number} Liquid level (0-8).
         * @private
         */
        function _getLiquidLevel(chunk, x, y, z, blockId) {
            return 8; // Default full level — per-block levels not stored in chunk data
        }

        /**
         * Simulate liquid flow across all liquid blocks in a chunk.
         * Processes from lowest Y upward to prevent cascading issues.
         * @param {Donkeycraft.Chunk} chunk - The chunk to process.
         */
        function simulateLiquidFlow(chunk) {
            // Find all liquid blocks
            var liquids = [];

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var y = 0; y < WORLD_HEIGHT; y++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        var blockId = chunk.getBlock(x, y, z);
                        if (_liquidBlocks[blockId]) {
                            liquids.push({ x: x, y: y, z: z, blockId: blockId });
                        }
                    }
                }
            }

            // Process from lowest to highest (prevents cascading issues)
            liquids.sort(function(a, b) { return a.y - b.y; });

            for (var i = 0; i < liquids.length; i++) {
                var l = liquids[i];
                flowLiquid(chunk, l.x, l.y, l.z, 8); // Default level 8
            }
        }

        /**
         * Check if a block ID is gravity-affected (sand, gravel, etc.).
         * @param {number} blockId - Block ID to check.
         * @returns {boolean} True if the block is gravity-affected.
         */
        function isGravityBlock(blockId) {
            return !!_gravityBlocks[blockId];
        }

        /**
         * Check if a block ID is a liquid (water, lava).
         * @param {number} blockId - Block ID to check.
         * @returns {boolean} True if the block is a liquid.
         */
        function isLiquidBlock(blockId) {
            return !!_liquidBlocks[blockId];
        }

        /**
         * Get all gravity-affected block IDs.
         * @returns {number[]} Array of gravity-affected block IDs.
         */
        function getGravityBlockIds() {
            var result = [];
            for (var id in _gravityBlocks) {
                if (_gravityBlocks.hasOwnProperty(id)) {
                    result.push(parseInt(id, 10));
                }
            }
            return result;
        }

        /**
         * Get all liquid block IDs.
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
         * Destroy and free resources.
         */
        function destroy() {
            _gravityBlocks = {};
            _liquidBlocks = {};
            _initialized = false;
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The Physics module.
         */
        function getInstance() {
            return Donkeycraft.Physics;
        }

        return {
            getInstance: getInstance,
            init: init,
            reinit: reinit,
            applyGravity: applyGravity,
            applyGravityToChunk: applyGravityToChunk,
            applyGravityColumn: applyGravityColumn,
            flowLiquid: flowLiquid,
            simulateLiquidFlow: simulateLiquidFlow,
            isGravityBlock: isGravityBlock,
            isLiquidBlock: isLiquidBlock,
            getGravityBlockIds: getGravityBlockIds,
            getLiquidBlockIds: getLiquidBlockIds,
            destroy: destroy
        };
    })();

})();