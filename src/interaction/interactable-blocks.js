// Donkeycraft — Interactable Blocks
// Right-click interactions: doors, chests, furnaces, levers, buttons, dispensers.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Interactable block IDs and their types
    // ============================================================

    /**
     * Block IDs that support right-click interactions.
     * @type {Object.<number, string>}
     */
    var INTERACTABLE_BLOCKS = {
        146: 'lever',       // Lever — toggle on/off
        23: 'stone_button', // Stone button — momentary press
        64: 'oak_door',     // Oak door — toggle open/close
        54: 'chest',        // Chest — open inventory
        61: 'furnace',      // Furnace — open smelting GUI
        144: 'dispenser'    // Dispenser — activate item dispense
    };

    /**
     * InteractableBlocks — handles right-click interactions with special block types.
     * @param {object} [config] - Configuration.
     * @param {Donkeycraft.EventBus} [config.events] - EventBus instance for interaction events.
     * @param {Function} [config.openGui] - Callback to open a GUI screen: openGui(type, data).
     */
    Donkeycraft.InteractableBlocks = function(config) {
        config = config || {};

        /**
         * Event bus for interaction events.
         * @type {Donkeycraft.EventBus}
         * @private
         */
        this._events = config.events || null;

        /**
         * GUI opening callback.
         * @type {Function}
         * @private
         */
        this._openGui = config.openGui || null;

        /**
         * Cache of lever states: "x,y,z" -> true/false (powered).
         * @type {Object.<string, boolean>}
         * @private
         */
        this._leverStates = {};

        /**
         * Cache of button states: "x,y,z" -> {powered: boolean, remainingTicks: number}.
         * @type {Object.<string, object>}
         * @private
         */
        this._buttonStates = {};
    };

    /**
     * Process a right-click interaction on a block.
     * @param {number} x - Global X coordinate.
     * @param {number} y - Global Y coordinate.
     * @param {number} z - Global Z coordinate.
     * @param {Donkeycraft.Chunk} chunk - Chunk containing the block.
     * @param {object} player - Player entity reference.
     * @returns {object|null} Interaction result or null.
     */
    Donkeycraft.InteractableBlocks.prototype.interact = function(x, y, z, chunk, player) {
        // Get block ID at position
        var blockId = this._getBlockAt(x, y, z, chunk);
        if (!blockId) {
            return null;
        }

        // Check if this block is interactable
        var type = INTERACTABLE_BLOCKS[blockId];
        if (!type) {
            return null;
        }

        // Dispatch to appropriate handler
        switch (type) {
            case 'lever':
                return this.toggleLever(x, y, z, chunk);
            case 'stone_button':
                return this.pressButton(x, y, z, chunk);
            case 'oak_door':
                return this.toggleDoor(x, y, z, chunk);
            case 'chest':
                return this.openChest(x, y, z, chunk);
            case 'furnace':
                return this.openFurnace(x, y, z, chunk);
            case 'dispenser':
                return this.activateDispenser(x, y, z, chunk);
            default:
                return null;
        }
    };

    /**
     * Toggle a lever's state (on/off).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk.
     * @returns {object} Result {type: 'lever', powered: boolean}.
     */
    Donkeycraft.InteractableBlocks.prototype.toggleLever = function(x, y, z, chunk) {
        var key = x + ',' + y + ',' + z;
        var currentState = this._leverStates[key] || false;
        var newState = !currentState;

        // Store new state
        this._leverStates[key] = newState;

        // Emit redstone signal event if events available
        if (this._events) {
            this._events.emit('redstoneUpdate', x, y, z, newState ? 15 : 0);
        }

        return {
            type: 'lever',
            powered: newState,
            x: x,
            y: y,
            z: z
        };
    };

    /**
     * Press a button (momentary — emits signal for 10 ticks).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk.
     * @returns {object} Result {type: 'button', powered: true, duration: 10}.
     */
    Donkeycraft.InteractableBlocks.prototype.pressButton = function(x, y, z, chunk) {
        var key = x + ',' + y + ',' + z;

        // Reset button if already pressed
        this._buttonStates[key] = {
            powered: true,
            remainingTicks: 10
        };

        // Emit redstone signal event
        if (this._events) {
            this._events.emit('redstoneUpdate', x, y, z, 15);
        }

        return {
            type: 'button',
            powered: true,
            duration: 10,
            x: x,
            y: y,
            z: z
        };
    };

    /**
     * Update all active button states (call each game tick).
     */
    Donkeycraft.InteractableBlocks.prototype.updateButtons = function() {
        var self = this;
        var keys = Object.keys(this._buttonStates);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var state = this._buttonStates[key];

            if (state) {
                state.remainingTicks--;

                // Button expired — emit signal off
                if (state.remainingTicks <= 0) {
                    delete this._buttonStates[key];

                    // Parse coordinates from key
                    var parts = key.split(',');
                    var bx = parseInt(parts[0], 10);
                    var by = parseInt(parts[1], 10);
                    var bz = parseInt(parts[2], 10);

                    if (this._events) {
                        this._events.emit('redstoneUpdate', bx, by, bz, 0);
                    }
                }
            }
        }
    };

    /**
     * Open a chest inventory.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk.
     * @returns {object} Result {type: 'chest', slots: number}.
     */
    Donkeycraft.InteractableBlocks.prototype.openChest = function(x, y, z, chunk) {
        var result = {
            type: 'chest',
            x: x,
            y: y,
            z: z,
            slots: 27 // Single chest has 27 slots
        };

        // Open GUI if callback provided
        if (this._openGui) {
            this._openGui('chest', result);
        }

        // Emit interaction event
        if (this._events) {
            this._events.emit('guiOpened', 'chest', x, y, z);
        }

        return result;
    };

    /**
     * Open a furnace GUI.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk.
     * @returns {object} Result {type: 'furnace'}.
     */
    Donkeycraft.InteractableBlocks.prototype.openFurnace = function(x, y, z, chunk) {
        var result = {
            type: 'furnace',
            x: x,
            y: y,
            z: z,
            slots: 3 // Fuel, input, output
        };

        // Open GUI if callback provided
        if (this._openGui) {
            this._openGui('furnace', result);
        }

        // Emit interaction event
        if (this._events) {
            this._events.emit('guiOpened', 'furnace', x, y, z);
        }

        return result;
    };

    /**
     * Toggle a door (open/close).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk.
     * @returns {object} Result {type: 'door', open: boolean}.
     */
    Donkeycraft.InteractableBlocks.prototype.toggleDoor = function(x, y, z, chunk) {
        // Doors are two blocks tall — toggle both bottom and top
        var key = x + ',' + y + ',' + z;
        var currentOpen = this._leverStates[key] || false; // Reuse leverStates cache
        var newOpen = !currentOpen;

        // Store state
        this._leverStates[key] = newOpen;

        // Emit event
        if (this._events) {
            this._events.emit('doorToggled', x, y, z, newOpen);
        }

        return {
            type: 'door',
            open: newOpen,
            x: x,
            y: y,
            z: z
        };
    };

    /**
     * Activate a dispenser (simulate item dispense).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk.
     * @returns {object} Result {type: 'dispenser'}.
     */
    Donkeycraft.InteractableBlocks.prototype.activateDispenser = function(x, y, z, chunk) {
        // Emit activation event
        if (this._events) {
            this._events.emit('dispenserActivated', x, y, z);
        }

        return {
            type: 'dispenser',
            x: x,
            y: y,
            z: z
        };
    };

    /**
     * Get all interactable block IDs.
     * @returns {number[]}
     */
    Donkeycraft.InteractableBlocks.prototype.getInteractableBlockIds = function() {
        var ids = [];
        for (var id in INTERACTABLE_BLOCKS) {
            if (INTERACTABLE_BLOCKS.hasOwnProperty(id)) {
                ids.push(parseInt(id, 10));
            }
        }
        return ids;
    };

    /**
     * Check if a block ID is interactable.
     * @param {number} blockId - Block ID to check.
     * @returns {string|null} Block type name if interactable, null otherwise.
     */
    Donkeycraft.InteractableBlocks.prototype.isInteractable = function(blockId) {
        return INTERACTABLE_BLOCKS[blockId] || null;
    };

    /**
     * Get the block at global coordinates from a chunk.
     * @param {number} x - Global X coordinate.
     * @param {number} y - Global Y coordinate.
     * @param {number} z - Global Z coordinate.
     * @param {Donkeycraft.Chunk} chunk - The chunk to read from.
     * @returns {number} Block ID (0 = air for out of bounds).
     * @private
     */
    Donkeycraft.InteractableBlocks.prototype._getBlockAt = function(x, y, z, chunk) {
        // Check Y bounds
        if (y < 0 || y >= Donkeycraft.Config.WORLD_HEIGHT) {
            return 0;
        }

        // Convert global to local coordinates
        var lx = ((x % 16) + 16) % 16;
        var lz = ((z % 16) + 16) % 16;

        var index = lx + y * 16 + lz * 16 * 256;
        return chunk.blocks[index];
    };

    /**
     * Destroy and free resources.
     */
    Donkeycraft.InteractableBlocks.prototype.destroy = function() {
        this._leverStates = {};
        this._buttonStates = {};
        this._events = null;
        this._openGui = null;
    };

})();