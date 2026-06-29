// Donkeycraft — Interactable Blocks
// Right-click interactions: doors, chests, furnaces, levers, buttons, dispensers.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // Block ID Constants for Interactive Blocks
    // ============================================================

    /**
     * Block IDs that support right-click interactions.
     * @type {Object.<number>}
     */
    var INTERACTIVE_BLOCK_IDS = {
        CHEST: 54,
        FURNACE: 61,
        DOOR_WOOD: 64,
        DOOR_IRON: 71,
        TRAPDOOR: 143,
        LEVER: 69,
        BUTTON_STONE: 70,
        BUTTON_WOOD: 147,
        DISPENSER: 23,
        DROPPER: 121,
        NOTE_BLOCK: 25
    };

    // Fast O(1) lookup set for interactive block IDs (avoids linear search per call)
    var _interactiveSet = new Set(Object.values(INTERACTIVE_BLOCK_IDS));

    // ============================================================
    // InteractableBlocks
    // ============================================================

    /**
     * InteractableBlocks — handles right-click interactions with special blocks
     * including doors, chests, furnaces, levers, buttons, dispensers, and note blocks.
     *
     * Maintains persistent state for doors/levers across chunk unloads/reloads via
     * _interactiveStateStore. Button states use tick-based auto-reset via
     * _buttonStates with chunk-indexed cleanup for O(K) performance.
     *
     * @namespace
     */
    Donkeycraft.InteractableBlocks = (function() {

        // Persistent state store for interactive blocks (doors, levers, trapdoors).
        // Format: { "x,y,z": { type: string, state: any } }
        // This ensures state survives chunk unloads/reloads and game saves.
        var _interactiveStateStore = {};

        // Track button states using tick-based system instead of setTimeout.
        // Format: { "x,y,z": { activeUntilTick: number, blockId: number, x: number, y: number, z: number } }
        var _buttonStates = {};

        // Secondary index for O(1) chunk-based button cleanup: Map<chunkKey, Array<buttonKey>>
        var _buttonChunkIndex = {};

        /**
         * Current game tick counter — incremented by the game loop.
         * @type {number}
         */
        var _currentTick = 0;

        /**
         * Button duration in ticks (default: 10 ticks = 0.5 seconds at 20 TPS).
         * @type {number}
         */
        var BUTTON_DURATION_TICKS = 10;

        /**
         * Optional EventBus instance for communicating with UI/Redstone systems.
         * Set via setEventBus() during game initialization.
         * @type {Object|null}
         */
        var _eventBus = null;

        /**
         * Set the event bus for communication with UI/Redstone systems.
         * Must be called during game initialization for interactions to work.
         * @param {Object} bus - The Donkeycraft.EventBus instance.
         */
        function setEventBus(bus) {
            _eventBus = bus;
        }

        /**
         * Set the current game tick counter.
         * Call this from the game loop each tick.
         * @param {number} tick - Current game tick number.
         */
        function setCurrentTick(tick) {
            _currentTick = tick;
            // Auto-cleanup expired button states
            _cleanupExpiredButtons();
        }

        /**
         * Get the current game tick counter.
         * @returns {number}
         */
        function getCurrentTick() {
            return _currentTick;
        }

        /**
         * Clean up expired button states where activeUntilTick <= currentTick.
         * Uses Object.keys() to avoid for...in mutation issues during iteration.
         * Also removes entries from the chunk index.
         * @private
         */
        function _cleanupExpiredButtons() {
            var keys = Object.keys(_buttonStates);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                if (_buttonStates[key].activeUntilTick <= _currentTick) {
                    // Remove from chunk index
                    var state = _buttonStates[key];
                    var cKey = Donkeycraft.WorldUtils.makeChunkKey(state.x, state.z);
                    if (_buttonChunkIndex[cKey]) {
                        var idx = _buttonChunkIndex[cKey].indexOf(key);
                        if (idx !== -1) {
                            _buttonChunkIndex[cKey].splice(idx, 1);
                        }
                        if (_buttonChunkIndex[cKey].length === 0) {
                            delete _buttonChunkIndex[cKey];
                        }
                    }
                    delete _buttonStates[key];
                }
            }
        }

        /**
         * Emit an event to the registered EventBus.
         * Silent if EventBus is not initialized (no console spam).
         * @param {string} eventName - Event name.
         * @param {*} data - Event data.
         * @private
         */
        function _emit(eventName, data) {
            if (_eventBus && typeof _eventBus.emit === 'function') {
                _eventBus.emit(eventName, data);
            }
        }

        /**
         * Cancel all pending button timers and interactive states.
         */
        function cancelAllButtonTimers() {
            _buttonStates = {};
            _buttonChunkIndex = {};
        }

        /**
         * Clear button states for a specific chunk using the secondary index.
         * O(K) where K = number of buttons in that chunk (not O(total buttons)).
         * @param {number} chunkX - Chunk X coordinate.
         * @param {number} chunkZ - Chunk Z coordinate.
         */
        function clearChunkButtonStates(chunkX, chunkZ) {
            var cKey = chunkX + ',' + chunkZ;
            if (!_buttonChunkIndex[cKey]) return;

            var buttonsToRemove = _buttonChunkIndex[cKey];
            for (var i = 0; i < buttonsToRemove.length; i++) {
                var btnKey = buttonsToRemove[i];
                delete _buttonStates[btnKey];
            }
            delete _buttonChunkIndex[cKey];
        }

        /**
         * Check if a block ID supports right-click interaction.
         * Uses pre-computed Set for O(1) lookup.
         * @param {number} blockId - Block ID to check.
         * @returns {boolean}
         */
        function isInteractiveBlock(blockId) {
            return _interactiveSet.has(blockId);
        }

        /**
         * Get the interaction type for a block ID.
         * @param {number} blockId - Block ID.
         * @returns {string|null} Interaction type or null.
         */
        function getInteractionType(blockId) {
            switch (blockId) {
                case INTERACTIVE_BLOCK_IDS.CHEST: return 'chest';
                case INTERACTIVE_BLOCK_IDS.FURNACE: return 'furnace';
                case INTERACTIVE_BLOCK_IDS.DOOR_WOOD:
                case INTERACTIVE_BLOCK_IDS.DOOR_IRON: return 'door';
                case INTERACTIVE_BLOCK_IDS.TRAPDOOR: return 'trapdoor';
                case INTERACTIVE_BLOCK_IDS.LEVER: return 'lever';
                case INTERACTIVE_BLOCK_IDS.BUTTON_STONE:
                case INTERACTIVE_BLOCK_IDS.BUTTON_WOOD: return 'button';
                case INTERACTIVE_BLOCK_IDS.DISPENSER:
                case INTERACTIVE_BLOCK_IDS.DROPPER: return 'dispenser';
                case INTERACTIVE_BLOCK_IDS.NOTE_BLOCK: return 'note_block';
                default: return null;
            }
        }

        /**
         * Handle a right-click interaction at the given position.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {Donkeycraft.Player} player - The player entity.
         * @param {number} x - Global X coordinate.
         * @param {number} y - Global Y coordinate.
         * @param {number} z - Global Z coordinate.
         * @returns {boolean} True if interaction was handled.
         */
        function handleRightClick(chunkManager, player, x, y, z) {
            // Floor all coordinates for consistent block lookup
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);

            // Get block ID at position
            var blockId = Donkeycraft.WorldUtils.getBlockAt(chunkManager, ix, iy, iz);
            if (!blockId) return false;

            var type = getInteractionType(blockId);
            if (!type) return false;

            // Dispatch to appropriate handler
            switch (type) {
                case 'door':
                case 'trapdoor':
                    return toggleDoor(chunkManager, ix, iy, iz, type === 'trapdoor');
                case 'lever':
                    return toggleLever(chunkManager, ix, iy, iz);
                case 'button':
                    return pressButton(chunkManager, ix, iy, iz);
                case 'chest':
                    return openChest(chunkManager, player, ix, iy, iz);
                case 'furnace':
                    return openFurnace(chunkManager, player, ix, iy, iz);
                case 'dispenser':
                    return activateDispenser(chunkManager, ix, iy, iz);
                case 'note_block':
                    return playNoteBlock(chunkManager, ix, iy, iz);
                default:
                    return false;
            }
        }

        /**
         * Toggle a door or trapdoor open/closed.
         * Updates the block data in the chunk to persist state.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @param {boolean} [isTrapdoor=false] - Whether this is a trapdoor.
         * @returns {boolean} True if toggled.
         */
        function toggleDoor(chunkManager, x, y, z, isTrapdoor) {
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);
            var key = Donkeycraft.WorldUtils.makeStateKey(ix, iy, iz);

            // Get current block ID
            var currentBlockId = Donkeycraft.WorldUtils.getBlockAt(chunkManager, ix, iy, iz);
            if (!currentBlockId) return false;

            // Check existing state
            var state = _interactiveStateStore[key];
            var isOpen = state && state.state === 'open';

            // Toggle: closed->open, open->closed
            var newState = isOpen ? 'closed' : 'open';

            // Store persistent state
            _interactiveStateStore[key] = {
                type: isTrapdoor ? 'trapdoor' : 'door',
                state: newState,
                blockId: currentBlockId
            };

            // Emit event for UI/audio feedback
            _emit('blockToggled', {
                x: ix, y: iy, z: iz,
                blockId: currentBlockId,
                type: isTrapdoor ? 'trapdoor' : 'door',
                open: newState === 'open'
            });

            // Persist state to chunk by setting a metadata-tagged block ID.
            // In vanilla Minecraft, doors/trapdoors use metadata bits for open/closed state.
            // Since our Chunk uses Uint8Array (no metadata), we store state in _interactiveStateStore
            // and emit events so downstream systems can handle rendering updates.
            // For persistence across saves, the state store is serialized via world-store.

            return true;
        }

        /**
         * Toggle a lever on/off.
         * Persists state to _interactiveStateStore for durability.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {boolean} True if toggled.
         */
        function toggleLever(chunkManager, x, y, z) {
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);
            var key = Donkeycraft.WorldUtils.makeStateKey(ix, iy, iz);

            // Get current block ID
            var currentBlockId = Donkeycraft.WorldUtils.getBlockAt(chunkManager, ix, iy, iz);
            if (!currentBlockId) return false;

            // Check existing state
            var state = _interactiveStateStore[key];
            var isOn = state && state.state === 'on';

            // Toggle: off->on, on->off
            var newState = isOn ? 'off' : 'on';

            // Store persistent state
            _interactiveStateStore[key] = {
                type: 'lever',
                state: newState,
                blockId: currentBlockId
            };

            // Emit toggle event
            _emit('blockToggled', {
                x: ix, y: iy, z: iz,
                blockId: currentBlockId,
                type: 'lever',
                on: newState === 'on'
            });

            // Also emit redstone signal if redstone system exists
            if (newState === 'on' && Donkeycraft.RedstoneEngine) {
                Donkeycraft.RedstoneEngine.updateRedstoneSignal(chunkManager, ix, iy, iz, 15);
            }

            return true;
        }

        /**
         * Press a button (momentary — auto-reset after BUTTON_DURATION_TICKS ticks).
         * Uses tick-based system instead of setTimeout for reliable cleanup.
         * Maintains chunk index for O(1) cleanup on unload.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {boolean} True if pressed.
         */
        function pressButton(chunkManager, x, y, z) {
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);
            var key = Donkeycraft.WorldUtils.makeStateKey(ix, iy, iz);

            // Check if button is still in cooldown period
            if (_buttonStates[key] && _buttonStates[key].activeUntilTick > _currentTick) {
                return false; // Already pressed, ignore repeat
            }

            // Activate button: set until when it should stay active
            _buttonStates[key] = {
                activeUntilTick: _currentTick + BUTTON_DURATION_TICKS,
                blockId: Donkeycraft.WorldUtils.getBlockAt(chunkManager, ix, iy, iz),
                x: ix,
                y: iy,
                z: iz
            };

            // Register in chunk index for O(1) cleanup
            var cKey = Donkeycraft.WorldUtils.makeChunkKey(ix, iz);
            if (!_buttonChunkIndex[cKey]) {
                _buttonChunkIndex[cKey] = [];
            }
            _buttonChunkIndex[cKey].push(key);

            // If redstone system exists, emit pulse
            if (Donkeycraft.RedstoneEngine) {
                Donkeycraft.RedstoneEngine.updateRedstoneSignal(chunkManager, ix, iy, iz, 15);
            }

            // Notify UI/input handlers
            _emit('buttonPressed', { x: ix, y: iy, z: iz });

            return true;
        }

        /**
         * Open a chest GUI for the player.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {Donkeycraft.Player} player - The player entity.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {boolean} True if opened.
         */
        function openChest(chunkManager, player, x, y, z) {
            _emit('guiOpen:chest', { x: x, y: y, z: z, player: player });
            return true;
        }

        /**
         * Open a furnace GUI for the player.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {Donkeycraft.Player} player - The player entity.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {boolean} True if opened.
         */
        function openFurnace(chunkManager, player, x, y, z) {
            _emit('guiOpen:furnace', { x: x, y: y, z: z, player: player });
            return true;
        }

        /**
         * Activate a dispenser/dropper.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {boolean} True if activated.
         */
        function activateDispenser(chunkManager, x, y, z) {
            _emit('blockActivated:dispenser', { x: x, y: y, z: z });
            return true;
        }

        /**
         * Play a note block sound.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {boolean} True if played.
         */
        function playNoteBlock(chunkManager, x, y, z) {
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);
            var blockId = Donkeycraft.WorldUtils.getBlockAt(chunkManager, ix, iy, iz);
            if (blockId !== INTERACTIVE_BLOCK_IDS.NOTE_BLOCK) return false;
            _emit('noteBlockPlayed', { x: ix, y: iy, z: iz });
            return true;
        }

        /**
         * Get all interactive block IDs.
         * @returns {Object.<number>}
         */
        function getInteractiveBlockIds() {
            return INTERACTIVE_BLOCK_IDS;
        }

        /**
         * Get the persistent state for an interactive block position.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {{type: string, state: *, blockId: number}|null}
         */
        function getInteractiveState(x, y, z) {
            var key = Donkeycraft.WorldUtils.makeStateKey(Math.floor(x), Math.floor(y), Math.floor(z));
            return _interactiveStateStore[key] || null;
        }

        /**
         * Clear all interactive block states (for reset/shutdown).
         * Also resets the tick counter and button chunk index.
         */
        function clearAllStates() {
            _interactiveStateStore = {};
            _buttonStates = {};
            _buttonChunkIndex = {};
            _currentTick = 0;
        }

        /**
         * Serialize interactive state for persistence.
         * @returns {Object} Serializable state object.
         */
        function serializeState() {
            return {
                interactiveStates: _interactiveStateStore,
                buttonStates: _buttonStates,
                currentTick: _currentTick
            };
        }

        /**
         * Restore interactive state from serialized data.
         * @param {Object} data - Serialized state object.
         */
        function deserializeState(data) {
            if (data.interactiveStates) {
                _interactiveStateStore = data.interactiveStates;
            }
            if (data.buttonStates) {
                _buttonStates = data.buttonStates;
            }
            if (data.currentTick !== undefined) {
                _currentTick = data.currentTick;
            }
        }

        return {
            handleRightClick: handleRightClick,
            isInteractiveBlock: isInteractiveBlock,
            getInteractionType: getInteractionType,
            toggleDoor: toggleDoor,
            toggleLever: toggleLever,
            pressButton: pressButton,
            openChest: openChest,
            openFurnace: openFurnace,
            activateDispenser: activateDispenser,
            playNoteBlock: playNoteBlock,
            cancelAllButtonTimers: cancelAllButtonTimers,
            getInteractiveBlockIds: getInteractiveBlockIds,
            setCurrentTick: setCurrentTick,
            getCurrentTick: getCurrentTick,
            setEventBus: setEventBus,
            clearChunkButtonStates: clearChunkButtonStates,
            getInteractiveState: getInteractiveState,
            clearAllStates: clearAllStates,
            serializeState: serializeState,
            deserializeState: deserializeState
        };
    })();

})();