// Donkeycraft — Redstone Observers
// Observer blocks: detect block changes, emit pulse on change.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // Block IDs
    var OBSERVER = 179;

    // Facing directions: 0=south, 1=west, 2=north, 3=east
    var FACING_SOUTH = 0;
    var FACING_WEST = 1;
    var FACING_NORTH = 2;
    var FACING_EAST = 3;

    // ============================================================
    // RedstoneObservers — observer block logic
    // ============================================================

    /**
     * RedstoneObservers — manages observer blocks: detects block changes
     * in front face, emits a 1-tick pulse on the back face.
     */
    Donkeycraft.RedstoneObservers = (function() {

        // Observer states: Map<"x,y,z", { facing: number, lastBlockId: number, lastBlockMeta: number, cooldown: number }}
        var _observerStates = {};

        // Pulse duration in ticks (Minecraft: 1 tick)
        var PULSE_DURATION_TICKS = 1;

        /**
         * Initialize the observer system.
         */
        function init() {
            // No special initialization needed
        }

        /**
         * Process a dirty observer block.
         * @param {Object} entry - {x, y, z, chunkX, chunkZ}.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @private
         */
        function _processObserver(entry, chunk) {
            var localX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            var localZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

            if (chunk.getBlock(localX, entry.y, localZ) !== OBSERVER) return;

            var key = entry.x + ',' + entry.y + ',' + entry.z;
            var state = _observerStates[key];

            if (!state) {
                // Initialize default state: facing south, no block tracked yet
                state = {
                    facing: FACING_SOUTH,
                    lastBlockId: 0,
                    lastBlockMeta: 0,
                    cooldown: 0
                };
                _observerStates[key] = state;
            }

            // Check if cooldown is active
            var currentTick = Donkeycraft.RedstoneEngine ? Donkeycraft.RedstoneEngine.getCurrentTick() : 0;
            if (state.cooldown > 0) {
                state.cooldown--;
                return;
            }

            // Get the block being observed (in front of observer's face)
            var observePos = _getObservePosition(entry.x, entry.y, entry.z, state.facing);
            if (!observePos) return;

            var obsChunkX = Math.floor(observePos.x / CHUNK_SIZE);
            var obsLocalX = ((observePos.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            var obsChunkZ = Math.floor(observePos.z / CHUNK_SIZE);
            var obsLocalZ = ((observePos.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

            var obsChunk = _getChunk(obsChunkX, obsChunkZ);
            if (!obsChunk) return;

            var currentBlockId = obsChunk.getBlock(obsLocalX, observePos.y, obsLocalZ);

            // Check for block change
            if (currentBlockId !== state.lastBlockId || false /* metadata not tracked */) {
                // Block changed: emit pulse
                _emitPulse(entry.x, entry.y, entry.z, state.facing);

                // Update last known block
                state.lastBlockId = currentBlockId;

                // Set cooldown (1 tick)
                state.cooldown = PULSE_DURATION_TICKS;

                // Mark this observer as dirty to re-arm
                Donkeycraft.RedstoneEngine.markDirty(entry.x, entry.y, entry.z);
            }
        }

        /**
         * Get the position that an observer is looking at (front face).
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @param {number} facing - Observer facing direction.
         * @returns {Object|null}
         * @private
         */
        function _getObservePosition(x, y, z, facing) {
            switch (facing) {
                case FACING_SOUTH: return { x: x, y: y, z: z + 1 };
                case FACING_NORTH: return { x: x, y: y, z: z - 1 };
                case FACING_WEST:  return { x: x + 1, y: y, z: z };
                case FACING_EAST:  return { x: x - 1, y: y, z: z };
            }
            return null;
        }

        /**
         * Emit a 1-tick pulse from the back face of an observer.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @param {number} facing - Observer facing direction (front).
         * @private
         */
        function _emitPulse(x, y, z, facing) {
            // Back face is opposite to facing
            var backPos;
            switch (facing) {
                case FACING_SOUTH: backPos = { x: x, y: y, z: z - 1 }; break;
                case FACING_NORTH: backPos = { x: x, y: y, z: z + 1 }; break;
                case FACING_WEST:  backPos = { x: x - 1, y: y, z: z }; break;
                case FACING_EAST:  backPos = { x: x + 1, y: y, z: z }; break;
            }

            if (!backPos) return;

            // Set signal on adjacent redstone wire
            if (Donkeycraft._redstoneWiring && Donkeycraft._redstoneWiring.setSignalStrength) {
                var backBlockId = _getBlockId(backPos.x, backPos.y, backPos.z);
                if (backBlockId === 173 || backBlockId === 229) {
                    Donkeycraft._redstoneWiring.setSignalStrength(backPos.x, backPos.y, backPos.z, 15);
                }
            }

            // Emit event for pistons to detect
            if (Donkeycraft._redstonePistons && Donkeycraft._redstonePistons.onObserverPulse) {
                Donkeycraft._redstonePistons.onObserverPulse(backPos.x, backPos.y, backPos.z);
            }

            // Mark adjacent blocks as dirty for redstone propagation
            Donkeycraft.RedstoneEngine.markDirty(backPos.x, backPos.y, backPos.z);
        }

        /**
         * Get a block ID at global coordinates.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {number} Block ID.
         * @private
         */
        function _getBlockId(x, y, z) {
            var chunkX = Math.floor(x / CHUNK_SIZE);
            var localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            var chunkZ = Math.floor(z / CHUNK_SIZE);
            var localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

            var chunk = _getChunk(chunkX, chunkZ);
            if (!chunk) return 0;

            return chunk.getBlock(localX, y, localZ);
        }

        /**
         * Get a chunk by global coordinates.
         * @param {number} chunkX - Chunk X.
         * @param {number} chunkZ - Chunk Z.
         * @returns {Donkeycraft.Chunk|null}
         * @private
         */
        function _getChunk(chunkX, chunkZ) {
            if (Donkeycraft._redstoneChunkManager) {
                return Donkeycraft._redstoneChunkManager.getChunk(chunkX, chunkZ);
            }
            return null;
        }

        /**
         * Get the observer state at a position.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {Object|null}
         */
        function getObserverState(x, y, z) {
            return _observerStates[x + ',' + y + ',' + z] || null;
        }

        /**
         * Set the facing direction of an observer.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @param {number} facing - Facing direction (0-3).
         */
        function setObserverFacing(x, y, z, facing) {
            var key = x + ',' + y + ',' + z;
            if (!_observerStates[key]) {
                _observerStates[key] = {
                    facing: facing,
                    lastBlockId: 0,
                    lastBlockMeta: 0,
                    cooldown: 0
                };
            }
            _observerStates[key].facing = facing;
        }

        /**
         * Force an observer to emit (for testing/debugging).
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         */
        function forceEmit(x, y, z) {
            var state = _observerStates[x + ',' + y + ',' + z];
            if (state) {
                _emitPulse(x, y, z, state.facing);
            }
        }

        /**
         * Clear all observer states.
         */
        function clearAllStates() {
            _observerStates = {};
        }

        /**
         * Destroy the system: clear all state.
         */
        function destroy() {
            clearAllStates();
        }

        return {
            init: init,
            setObserverFacing: setObserverFacing,
            getObserverState: getObserverState,
            forceEmit: forceEmit,
            clearAllStates: clearAllStates,
            destroy: destroy
        };
    })();

})();