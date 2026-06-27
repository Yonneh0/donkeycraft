// Donkeycraft — Block Action
// Block breaking: hardness timer, tool speed multipliers, drop spawning.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Tool Material Speed Multipliers
    // ============================================================

    /**
     * Tool material speed multipliers for block breaking.
     * @type {{wood: number, stone: number, iron: number, gold: number, diamond: number, netherite: number}}
     */
    var TOOL_MULTIPLIERS = {
        wood: 2.0,
        stone: 4.0,
        iron: 6.0,
        gold: 12.0,
        diamond: 8.0,
        netherite: 9.0,
        naked: 1.0    // bare hands
    };

    // ============================================================
    // BlockAction
    // ============================================================

    /**
     * BlockAction — handles block breaking mechanics including hardness timers,
     * tool speed multipliers, and drop spawning.
     *
     * Maintains a break state map keyed by "x,y,z" coordinates. Tracks progress
     * from 0→1 over time based on block hardness and tool tier. Emits progress
     * events when visual crack stage changes (~6 events per block).
     *
     * @namespace
     */
    Donkeycraft.BlockAction = (function() {
        // Current break states: Map of "x,y,z" → BreakState
        var _breakStates = {};

        // Secondary index for O(1) chunk-based cleanup: Map<chunkKey, Array<breakStateKey>>
        var _chunkBreakIndices = {};

        /**
         * Optional ChunkManager reference for block re-verification.
         * Set via setChunkManager() during game initialization.
         * @type {Object|null}
         */
        var _chunkManager = null;

        /**
         * Set the chunk manager for block re-verification during break completion.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager instance.
         */
        function setChunkManager(chunkManager) {
            _chunkManager = chunkManager;
        }

        /**
         * Get the block ID at global coordinates from the current world state.
         * Returns 0 if chunk doesn't exist, out of bounds, or block is air.
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalY - Global Y coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @returns {number} Block ID (0 = air).
         * @private
         */
        function _getBlockIdAt(globalX, globalY, globalZ) {
            if (!_chunkManager) return 0;

            // Out of world bounds
            if (globalY < 0 || globalY >= Donkeycraft.Config.WORLD_HEIGHT) return 0;

            var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
            var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

            var chunk = _chunkManager.getChunkIfExists(chunkX, chunkZ);
            if (!chunk) return 0;

            var localX = Donkeycraft.Chunk.localCoordX(globalX);
            var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

            return chunk.getBlock(localX, globalY, localZ);
        }

        /**
         * Generate a chunk key for a global coordinate.
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @returns {string} Chunk key.
         * @private
         */
        function _chunkKey(globalX, globalZ) {
            var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
            var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
            return chunkX + ',' + chunkZ;
        }

        /**
         * Clear break states for a specific chunk using the secondary index.
         * O(1) lookup instead of O(N) full scan.
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         */
        function clearChunkBreakStates(chunkX, chunkZ) {
            var cKey = chunkX + ',' + chunkZ;
            if (!_chunkBreakIndices[cKey]) return;

            var statesToRemove = _chunkBreakIndices[cKey];
            for (var i = 0; i < statesToRemove.length; i++) {
                var stateKey = statesToRemove[i];
                delete _breakStates[stateKey];
            }
            delete _chunkBreakIndices[cKey];
        }

        /**
         * Get the hardness value for a block ID from the BlockRegistry.
         * Falls back to 1.0 if BlockRegistry not available or block ID unknown.
         * @param {number} blockId - Block ID.
         * @returns {number} Hardness value (0 for unbreakable).
         * @private
         */
        function getBlockHardness(blockId) {
            // Air always has zero hardness (unbreakable / instant break)
            if (blockId === 0) return 0;
            // Try to read from Donkeycraft.BlockRegistry (Phase 3)
            if (Donkeycraft.BlockRegistry && typeof Donkeycraft.BlockRegistry.getBlockById === 'function') {
                var blockDef = Donkeycraft.BlockRegistry.getBlockById(blockId);
                if (blockDef && typeof blockDef.hardness === 'number') {
                    return blockDef.hardness;
                }
            }
            // Fallback: default hardness for unknown blocks
            return 1.0;
        }

        /**
         * Get the tool speed multiplier for a material tier.
         * @param {string} tier - Tool material tier.
         * @returns {number} Speed multiplier.
         * @private
         */
        function getToolMultiplier(tier) {
            return TOOL_MULTIPLIERS[tier] || 1.0;
        }

        /**
         * Calculate the time in seconds needed to break a block with a given tool tier.
         * @param {number} blockId - Block ID.
         * @param {string} [toolTier='naked'] - Tool material tier.
         * @returns {number} Break time in seconds.
         */
        function calculateBreakTime(blockId, toolTier) {
            toolTier = toolTier || 'naked';
            var hardness = getBlockHardness(blockId);
            if (hardness <= 0) return Infinity; // unbreakable

            var multiplier = getToolMultiplier(toolTier);
            return hardness / multiplier;
        }

        /**
         * Start breaking a block at the given global coordinates.
         * @param {number} x - Global X coordinate.
         * @param {number} y - Global Y coordinate.
         * @param {number} z - Global Z coordinate.
         * @param {number} blockId - Block ID being broken.
         * @param {Array} drops - Items dropped on break.
         * @param {string} [toolTier='naked'] - Tool material tier.
         */
        function startBreaking(x, y, z, blockId, drops, toolTier) {
            toolTier = toolTier || 'naked';

            // Ensure integer coordinates for consistent key generation
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);
            var key = ix + ',' + iy + ',' + iz;

            // If already breaking this block, reset progress
            if (_breakStates[key]) {
                _breakStates[key].progress = 0;
            } else {
                // Cache breakTime in state to avoid recalculating every tick
                var cachedBreakTime = calculateBreakTime(blockId, toolTier);
                _breakStates[key] = {
                    x: ix,
                    y: iy,
                    z: iz,
                    progress: 0,
                    startTime: Date.now(),
                    toolTier: toolTier,
                    breakTime: cachedBreakTime, // cached for performance
                    lastEmitStage: -1            // for debounced progress events
                };

                // Add to chunk index for O(1) cleanup
                var cKey = _chunkKey(ix, iz);
                if (!_chunkBreakIndices[cKey]) {
                    _chunkBreakIndices[cKey] = [];
                }
                _chunkBreakIndices[cKey].push(key);
            }

            // Store block-specific data
            _breakStates[key].blockId = blockId;
            _breakStates[key].drops = drops || [];

            // Note: Break events are handled by the game loop via getActiveBreakStates()
        }

        /**
         * Tick the break progress for all actively breaking blocks.
         * Uses snapshot of keys to avoid mutation issues during iteration.
         * Emits progress events only when visual crack stage changes (every ~10%).
         * Pauses accumulation when the player's chunk is not loaded to prevent
         * drift during tab-backgrounding or render distance changes.
         * @param {number} deltaTime - Time since last tick in seconds.
         * @returns {Array} Array of events: {type, x, y, z, progress}.
         */
        function tickBreakProgress(deltaTime) {
            var events = [];
            var keysToRemove = [];

            // Snapshot keys before iteration to avoid mutation issues
            var stateKeys = Object.keys(_breakStates);

            for (var i = 0; i < stateKeys.length; i++) {
                var key = stateKeys[i];
                var state = _breakStates[key];

                // Use cached breakTime for performance (set in startBreaking)
                var breakTime = state.breakTime;

                // Skip unbreakable or invalid entries
                if (breakTime === Infinity || isNaN(breakTime)) {
                    continue;
                }

                // Pause break progress when the block's chunk is not loaded.
                // This prevents drift: if chunks unload (tab backgrounded) and
                // reload, accumulated deltaTime would cause instant breaks.
                // If no chunk manager is set, assume chunk is loaded (backward compat with tests).
                var chunkLoaded = true;
                if (_chunkManager && Donkeycraft.WorldUtils && typeof Donkeycraft.WorldUtils.isChunkLoaded === 'function') {
                    chunkLoaded = Donkeycraft.WorldUtils.isChunkLoaded(_chunkManager, state.x, state.z);
                }
                if (!chunkLoaded) continue;

                var progressIncrement = deltaTime / breakTime;
                state.progress += progressIncrement;

                // Debounce progress events: only emit when visual crack stage changes.
                // 10 stages (0-9) correspond to 0-90% progress, reducing from 60 events/sec
                // per block to ~6 events/sec per block.
                var newStage = Math.min(Math.floor(state.progress * 10), 9);
                if (newStage !== state.lastEmitStage) {
                    events.push({
                        type: 'progress',
                        x: state.x,
                        y: state.y,
                        z: state.z,
                        progress: Math.min(state.progress, 1.0),
                        stage: newStage
                    });
                    state.lastEmitStage = newStage;
                }

                if (state.progress >= 1.0) {
                    // CRITICAL: Re-verify block existence and ID before emitting broken event.
                    // This prevents spawning drops for blocks that were already broken/changed by
                    // another player, entity, or system while the break was in progress.
                    var currentBlockId = _getBlockIdAt(state.x, state.y, state.z);

                    if (currentBlockId === state.blockId && currentBlockId !== 0) {
                        // Block still exists and matches — emit broken event
                        events.push({
                            type: 'broken',
                            x: state.x,
                            y: state.y,
                            z: state.z,
                            blockId: state.blockId,
                            drops: state.drops || []
                        });
                    }
                    // If block changed or was already broken, cancel the break silently
                    // (no drops, no event — prevents double-drops and wrong-item bugs)

                    keysToRemove.push(key);
                }
            }

            // Remove completed break states after iteration (avoids mutation during loop)
            for (var j = 0; j < keysToRemove.length; j++) {
                delete _breakStates[keysToRemove[j]];
            }

            return events;
        }

        /**
         * Cancel breaking a block at the given coordinates.
         * Enforces integer coordinates to match startBreaking key generation.
         * @param {number} x - Global X coordinate.
         * @param {number} y - Global Y coordinate.
         * @param {number} z - Global Z coordinate.
         */
        function cancelBreaking(x, y, z) {
            // CRITICAL: Floor coordinates to match startBreaking key generation
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);
            var key = ix + ',' + iy + ',' + iz;
            if (_breakStates[key]) {
                delete _breakStates[key];
            }
        }

        /**
         * Get the current break progress for a block.
         * Enforces integer coordinates to match startBreaking key generation.
         * @param {number} x - Global X coordinate.
         * @param {number} y - Global Y coordinate.
         * @param {number} z - Global Z coordinate.
         * @returns {number} Progress value [0-1], or 0 if not breaking.
         */
        function getBreakProgress(x, y, z) {
            // CRITICAL: Floor coordinates to match startBreaking key generation
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);
            var key = ix + ',' + iy + ',' + iz;
            var state = _breakStates[key];
            return state ? Math.min(state.progress, 1.0) : 0;
        }

        /**
         * Get all active break states.
         * @returns {Object} Map of key → break state.
         */
        function getActiveBreakStates() {
            var result = {};
            for (var key in _breakStates) {
                if (_breakStates.hasOwnProperty(key)) {
                    result[key] = _breakStates[key];
                }
            }
            return result;
        }

        /**
         * Clear all break states and chunk indices.
         * Must also clear _chunkBreakIndices to prevent memory leaks.
         */
        function clearAll() {
            _breakStates = {};
            _chunkBreakIndices = {};
        }

        /**
         * Get the hardness value for a block ID (exported).
         * @param {number} blockId - Block ID.
         * @returns {number} Hardness value.
         */
        function getHardness(blockId) {
            return getBlockHardness(blockId);
        }

        /**
         * Get the tool multiplier for a material tier.
         * @param {string} tier - Tool material tier (e.g., 'wood', 'stone', 'iron').
         * @returns {number} Speed multiplier.
         */
        function getToolMultiplier(tier) {
            return TOOL_MULTIPLIERS[tier] || 1.0;
        }

        /**
         * Get all tool tiers and their multipliers (exported).
         * @returns {{wood: number, stone: number, iron: number, gold: number, diamond: number, netherite: number, naked: number}}
         */
        function getAllToolMultipliers() {
            return {
                wood: TOOL_MULTIPLIERS.wood,
                stone: TOOL_MULTIPLIERS.stone,
                iron: TOOL_MULTIPLIERS.iron,
                gold: TOOL_MULTIPLIERS.gold,
                diamond: TOOL_MULTIPLIERS.diamond,
                netherite: TOOL_MULTIPLIERS.netherite,
                naked: TOOL_MULTIPLIERS.naked
            };
        }

        return {
            startBreaking: startBreaking,
            tickBreakProgress: tickBreakProgress,
            cancelBreaking: cancelBreaking,
            getBreakProgress: getBreakProgress,
            calculateBreakTime: calculateBreakTime,
            getActiveBreakStates: getActiveBreakStates,
            clearAll: clearAll,
            clearChunkBreakStates: clearChunkBreakStates,
            setChunkManager: setChunkManager,
            getHardness: getHardness,
            getToolMultiplier: getToolMultiplier,
            getAllToolMultipliers: getAllToolMultipliers
        };
    })();

})();