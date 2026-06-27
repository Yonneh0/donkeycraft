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
         */
        function init() {
            if (_initialized) return;

            // Hardcoded gravity-affected blocks (Minecraft behavior: sand, gravel, concrete powder)
            var gravityBlockIds = [12, 9, 2804, 2805, 2806, 2807]; // sand, gravel, colored concrete powders

            for (var i = 0; i < gravityBlockIds.length; i++) {
                _gravityBlocks[gravityBlockIds[i]] = true;
            }

            // Check liquid via BlockRegistry
            if (Donkeycraft.BlockRegistry) {
                for (var id = 0; id < 256; id++) {
                    if (Donkeycraft.BlockRegistry.isLiquid(id)) {
                        _liquidBlocks[id] = true;
                    }
                }
            }

            _initialized = true;
        }

        /**
         * Apply gravity to a block at the given position.
         * If the block is a gravity-affected block (sand, gravel, etc.),
         * it will fall if there's air or liquid below it.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - Local X.
         * @param {number} y - Local Y.
         * @param {number} z - Local Z.
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
         * @returns {boolean}
         * @private
         */
        function _canFallInto(blockId) {
            return !blockId || !!_liquidBlocks[blockId];
        }

        /**
         * Apply gravity to all gravity-affected blocks in a chunk.
         * Processes from bottom to top so falling blocks don't fall multiple times per tick.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         */
        function applyGravityToChunk(chunk) {
            for (var y = 0; y < WORLD_HEIGHT; y++) {
                for (var x = 0; x < CHUNK_SIZE; x++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        applyGravity(chunk, x, y, z);
                    }
                }
            }
        }

        /**
         * Apply gravity to a column of blocks (optimization for bulk updates).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - Local X.
         * @param {number} z - Local Z.
         */
        function applyGravityColumn(chunk, x, z) {
            for (var y = 0; y < WORLD_HEIGHT; y++) {
                applyGravity(chunk, x, y, z);
            }
        }

        /**
         * Simulate liquid flow from a block position.
         * Liquids flow to adjacent lower blocks and spread horizontally.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - Source X.
         * @param {number} y - Source Y.
         * @param {number} z - Source Z.
         * @param {number} sourceLevel - Original liquid level (0-8).
         * @returns {number} Remaining unflowed liquid level.
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
         * Get the liquid level for a block (stored in metadata or default 8).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - Local X.
         * @param {number} y - Local Y.
         * @param {number} z - Local Z.
         * @param {number} blockId - Expected liquid block ID.
         * @returns {number} Liquid level (0-8).
         * @private
         */
        function _getLiquidLevel(chunk, x, y, z, blockId) {
            // For simplicity, liquids default to level 8 (full)
            // In a full implementation, this would read from block metadata
            return 8;
        }

        /**
         * Simulate liquid flow in a chunk.
         * Processes from lowest level upward to prevent infinite loops.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
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
         * Check if a block ID is gravity-affected.
         * @param {number} blockId - Block ID.
         * @returns {boolean}
         */
        function isGravityBlock(blockId) {
            return !!_gravityBlocks[blockId];
        }

        /**
         * Check if a block ID is a liquid.
         * @param {number} blockId - Block ID.
         * @returns {boolean}
         */
        function isLiquidBlock(blockId) {
            return !!_liquidBlocks[blockId];
        }

        /**
         * Get all gravity-affected block IDs.
         * @returns {number[]}
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
         * @returns {number[]}
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

        return {
            init: init,
            applyGravity: applyGravity,
            applyGravityToChunk: applyGravityToChunk,
            applyGravityColumn: applyGravityColumn,
            flowLiquid: flowLiquid,
            simulateLiquidFlow: simulateLiquidFlow,
            isGravityBlock: isGravityBlock,
            isLiquidBlock: isLiquidBlock,
            getGravityBlockIds: getGravityBlockIds,
            getLiquidBlockIds: getLiquidBlockIds
        };
    })();

})();