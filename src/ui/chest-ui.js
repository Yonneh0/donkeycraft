// Donkeycraft — Chest UI
// Chest GUI with 27 slots (single) or 54 slots (double-chest).
// Supports slot click, drag-drop, key-based quick-move, and data persistence.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * ChestUI — manages the chest inventory GUI.
     * @param {HTMLElement} container - DOM container for the chest UI.
     * @param {Object|boolean} [config] - Configuration object or boolean doubleChest flag.
     * @param {boolean} [config.doubleChest=false] - Whether this is a double chest (54 slots).
     * @param {string} [config.chestKey=null] - Storage key for this chest.
     * @param {Array} [config.preloadedSlots=null] - Pre-loaded slot data arrays.
     */
    Donkeycraft.ChestUI = function (container, config) {
        this._container = container || null;

        // Support legacy boolean parameter: ChestUI(container, true/false)
        var doubleChest = false;
        var chestKey = null;
        var preloadedSlots = null;

        if (typeof config === 'boolean') {
            doubleChest = config;
        } else if (typeof config === 'object' && config !== null) {
            doubleChest = !!config.doubleChest;
            chestKey = config.chestKey || null;
            preloadedSlots = config.preloadedSlots || null;
        }

        this._doubleChest = doubleChest;

        // Slot count: 27 for single, 54 for double
        this._slotCount = this._doubleChest ? 54 : 27;

        // Slots — array of ItemStack or null
        this._slots = [];
        for (var i = 0; i < this._slotCount; i++) {
            this._slots[i] = null;
        }

        // Chest data identifier — links to world storage
        this._dataKey = chestKey;

        // Listeners
        this._listeners = {
            onSlotChange: [],
            onDrop: []
        };

        // DOM elements
        this._gridEl = null;
        this._slotEls = []; // Cached slot element array for O(1) access
        this._titleEl = null;

        // Build DOM if container provided
        if (this._container) {
            this._buildDOM();
        }

        // Load preloaded slots after DOM is built
        if (preloadedSlots && Array.isArray(preloadedSlots)) {
            this._loadPreloadedSlots(preloadedSlots);
        }
    };

    /**
     * _buildDOM — creates the chest GUI DOM structure.
     * @private
     */
    Donkeycraft.ChestUI.prototype._buildDOM = function () {
        var self = this;
        this._container.className = 'dk-chest-ui';

        // Title bar
        var titleEl = document.createElement('div');
        titleEl.className = 'dk-chest-title';
        titleEl.textContent = this._doubleChest ? 'Double Chest' : 'Chest';
        this._container.appendChild(titleEl);
        this._titleEl = titleEl;

        // Slot grid
        var rows = this._doubleChest ? 6 : 3;
        var cols = 9;

        this._gridEl = document.createElement('div');
        this._gridEl.className = 'dk-chest-grid';
        this._gridEl.style.gridTemplateColumns = 'repeat(' + cols + ', 48px)';

        for (var i = 0; i < this._slotCount; i++) {
            var slotEl = document.createElement('div');
            slotEl.className = 'dk-chest-slot';
            slotEl.dataset.slotIndex = i;

            // Item display span
            var itemEl = document.createElement('span');
            itemEl.className = 'dk-slot-item';
            // class and styles from CSS already applied via dk-chest-slot-item
            slotEl.appendChild(itemEl);

            // Count overlay
            var countEl = document.createElement('span');
            countEl.className = 'dk-slot-count';
            // class and styles from CSS already applied via dk-slot-count
            slotEl.appendChild(countEl);

            // Left-click handler — take item or start drag
            slotEl.addEventListener('mousedown', function (idx) {
                return function (e) {
                    e.preventDefault();
                    if (self._listeners.onClick) {
                        self._listeners.onClick(idx, e.button || 0);
                    }
                };
            }(i));

            this._gridEl.appendChild(slotEl);
            this._slotEls.push(slotEl); // Cache for O(1) access
        }

        this._container.appendChild(this._gridEl);
    };

    /**
     * isDoubleChest — checks if this is a double chest.
     * @returns {boolean}
     */
    Donkeycraft.ChestUI.prototype.isDoubleChest = function () {
        return this._doubleChest;
    };

    /**
     * getSlotCount — gets the total number of slots.
     * @returns {number} 27 for single, 54 for double.
     */
    Donkeycraft.ChestUI.prototype.getSlotCount = function () {
        return this._slotCount;
    };

    /**
     * getSlot — gets the item stack in a specific slot.
     * @param {number} index - Slot index.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.ChestUI.prototype.getSlot = function (index) {
        if (typeof index !== 'number' || !Number.isFinite(index) || index < 0 || index >= this._slotCount) return null;
        return this._slots[index];
    };

    /**
     * _isValidStack — checks if a value is a valid ItemStack or null.
     * @param {*} val - Value to check.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.ChestUI.prototype._isValidStack = function (val) {
        if (val === null) return true;
        return typeof val.isEmpty === 'function' && typeof val.getItemId === 'function' && typeof val.getCount === 'function';
    };

    /**
     * setSlot — sets the item stack in a specific slot with input validation.
     * @param {number} index - Slot index.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {boolean} True if successful.
     */
    Donkeycraft.ChestUI.prototype.setSlot = function (index, stack) {
        if (typeof index !== 'number' || !Number.isFinite(index) || index < 0 || index >= this._slotCount) return false;
        if (!this._isValidStack(stack)) return false;
        var oldStack = this._slots[index];
        this._slots[index] = stack;

        // Update DOM display
        this._updateSlotDisplay(index, stack);

        // Emit slot change event
        this._emitSlotChange(index, stack, oldStack);
        return true;
    };

    /**
     * takeItem — takes the item from a slot.
     * @param {number} index - Slot index.
     * @returns {Donkeycraft.ItemStack|null} The taken stack, or null if empty.
     */
    Donkeycraft.ChestUI.prototype.takeItem = function (index) {
        if (typeof index !== 'number' || !Number.isFinite(index) || index < 0 || index >= this._slotCount) return null;

        var stack = this._slots[index];
        if (!stack || stack.isEmpty()) return null;

        var taken = stack.clone();
        this._slots[index] = null;

        // Update DOM display
        this._updateSlotDisplay(index, null);

        // Emit slot change event
        this._emitSlotChange(index, null, stack);
        return taken;
    };

    /**
     * takePartialItem — takes a partial amount from a slot.
     * @param {number} index - Slot index.
     * @param {number} count - Number of items to take.
     * @returns {Donkeycraft.ItemStack|null} Partial stack taken, or null.
     */
    Donkeycraft.ChestUI.prototype.takePartialItem = function (index, count) {
        if (typeof index !== 'number' || !Number.isFinite(index) || index < 0 || index >= this._slotCount) return null;
        if (typeof count !== 'number' || count <= 0 || !Number.isFinite(count)) return null;

        var stack = this._slots[index];
        if (!stack || stack.isEmpty()) return null;

        var takeCount = Math.min(Math.floor(count), stack.getCount());
        var taken = stack.clone();
        taken.setCount(takeCount);

        stack.decrement(takeCount);
        if (stack.isEmpty()) {
            this._slots[index] = null;
        }

        // Update DOM display
        this._updateSlotDisplay(index, stack.isEmpty() ? null : stack);

        // Emit slot change event
        this._emitSlotChange(index, stack.isEmpty() ? null : stack, taken);
        return taken;
    };

    /**
     * _updateSlotDisplay — updates the DOM display for a specific slot.
     * @param {number} index - Slot index.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to display.
     * @private
     */
    Donkeycraft.ChestUI.prototype._updateSlotDisplay = function (index, stack) {
        // Use cached slot element array for O(1) access
        if (typeof index !== 'number' || index < 0 || index >= this._slotEls.length) return;
        var slotEl = this._slotEls[index];
        if (!slotEl) return;

        var itemEl = slotEl.querySelector('.dk-slot-item');
        var countEl = slotEl.querySelector('.dk-slot-count');

        if (!itemEl) return;

        if (!stack || stack.isEmpty()) {
            itemEl.textContent = '';
            if (countEl) countEl.style.display = 'none';
        } else {
            itemEl.textContent = this._getItemDisplayChar(stack.getItemId());
            if (countEl) {
                if (stack.getCount() > 1) {
                    countEl.textContent = stack.getCount();
                    countEl.style.display = '';
                } else {
                    countEl.style.display = 'none';
                }
            }
        }
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.ChestUI.prototype._getItemDisplayChar = function (itemId) {
        var displayMap = {
            // Basic blocks
            1: '🪨', 2: '🧱', 3: '🟫', 4: '🟩', 5: '🪵', 6: '🟨', 7: '🟫',
            // Wood variants
            24: '🪵', 25: '🟫', 26: '🟫', 27: '🟫', 28: '🟫', 29: '🟫',
            // Sand / gravel / ice
            30: '🟨', 31: '⬜', 32: '🧊', 33: '🟫',
            // Water / lava
            34: '🌊', 35: '🌋',
            // Special blocks
            45: '🔲', 54: '📦', 61: '🔥',
            // Ores
            138: '⬛', 141: '🟤', 142: '🟡', 143: '💎', 144: '🟢', 145: '🔴', 146: '🔵', 147: '⚪',
            // Metal blocks
            214: '⚫', 215: '🟤', 216: '🟡', 217: '💎', 218: '🟢', 219: '🔵', 220: '⚪', 221: '🟡',
            // Concrete / wool
            222: '🟡', 223: '⚪', 224: '💎', 225: '🟡', 226: '⚪', 227: '💎',
            // Tools / weapons
            256: '⚔️', 257: '🪓', 258: '⛏️', 259: '🔨', 260: '🗡️',
            // Other items
            310: '🥢', 312: '🔦', 322: '🏹', 328: '🧭', 339: '🥣',
            // Food
            320: '🍖', 321: '🍞', 323: '🥕', 324: '🥔', 325: '🥕', 326: '🍉',
            // Nether
            406: '🟥', 407: '🟤', 408: '⬛', 409: '🟫',
            // End
            433: '🟪', 437: '🔲'
        };
        return displayMap[itemId] || '▪';
    };

    /**
     * _emitSlotChange — emits a slot change event to all listeners.
     * @param {number} index - Slot index.
     * @param {Donkeycraft.ItemStack|null} newStack - New stack value.
     * @param {Donkeycraft.ItemStack|null} oldStack - Previous stack value.
     * @private
     */
    Donkeycraft.ChestUI.prototype._emitSlotChange = function (index, newStack, oldStack) {
        if (!this._listeners.onSlotChange) return;
        for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
            try { this._listeners.onSlotChange[i](index, newStack, oldStack); } catch (e) { }
        }
    };

    /**
     * _emitDrop — emits a drop event to all listeners.
     * @param {Donkeycraft.ItemStack} stack - The dropped stack.
     * @param {number} [slotIndex=-1] - Source slot index (-1 = unknown).
     * @private
     */
    Donkeycraft.ChestUI.prototype._emitDrop = function (stack, slotIndex) {
        if (!this._listeners.onDrop) return;
        for (var i = 0; i < this._listeners.onDrop.length; i++) {
            try { this._listeners.onDrop[i](stack, slotIndex); } catch (e) { }
        }
    };

    /**
     * handleClick — handles mouse click events on slots.
     * Left-click (button 0): takes the entire stack from the clicked slot.
     * Right-click (button 2): takes half the stack (rounded up).
     * @param {number} slotIndex - The clicked slot index.
     * @param {number} [button=0] - Mouse button (0=left, 2=right).
     * @returns {Donkeycraft.ItemStack|null} The taken stack, or null.
     */
    Donkeycraft.ChestUI.prototype.handleClick = function (slotIndex, button) {
        button = button || 0;
        if (typeof slotIndex !== 'number' || !Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= this._slotCount) return null;

        var stack = this._slots[slotIndex];
        if (!stack || stack.isEmpty()) return null;

        var taken = null;
        if (button === 2) {
            // Right-click: take half (rounded up)
            var half = Math.ceil(stack.getCount() / 2);
            taken = this.takePartialItem(slotIndex, half);
        } else {
            // Left-click: take entire stack
            taken = this.takeItem(slotIndex);
        }
        return taken;
    };

    /**
     * handleDrop — handles dropping an item onto a specific slot.
     * Attempts to stack with existing item or replaces if slot is empty.
     * @param {Donkeycraft.ItemStack} itemStack - The dropped item stack.
     * @param {number} slotIndex - Target slot index (-1 = first empty slot).
     * @returns {boolean} True if the drop was processed.
     */
    Donkeycraft.ChestUI.prototype.handleDrop = function (itemStack, slotIndex) {
        // Check: must be a valid ItemStack that is NOT null and NOT empty
        if (itemStack === null || itemStack === undefined) return false;
        if (typeof itemStack.isEmpty !== 'function') return false;
        if (itemStack.isEmpty()) return false;

        // Find target slot
        var target = slotIndex;
        if (target === -1 || target < 0 || target >= this._slotCount) {
            // Find first empty slot
            target = null;
            for (var i = 0; i < this._slotCount; i++) {
                if (!this._slots[i] || this._slots[i].isEmpty()) {
                    target = i;
                    break;
                }
            }
        }

        if (target === null) return false; // No empty slots found

        // Try to stack with existing item
        var existing = this._slots[target];
        if (existing && !existing.isEmpty() && existing.canStackWith(itemStack)) {
            // Check if stack can fit
            var maxCount = 64; // Standard max stack size
            var space = maxCount - existing.getCount();
            if (space > 0) {
                var addCount = Math.min(space, itemStack.getCount());
                existing.increment(addCount);
                this._updateSlotDisplay(target, existing);
                this._emitSlotChange(target, existing, null);
            }
            return true;
        }

        // Place in empty slot
        if (!existing || existing.isEmpty()) {
            this.setSlot(target, itemStack.clone());
            return true;
        }

        return false;
    };

    /**
     * _loadPreloadedSlots — loads ItemStack data from a pre-constructed array.
     * Used when GuiManager opens the chest with existing slot data.
     * @param {Array} slots - Array of slot data (ItemStack, null, or serialized objects).
     * @private
     */
    Donkeycraft.ChestUI.prototype._loadPreloadedSlots = function (slots) {
        if (!Array.isArray(slots)) return;

        for (var i = 0; i < this._slotCount && i < slots.length; i++) {
            var slotData = slots[i];
            if (slotData === null || slotData === undefined) {
                this._slots[i] = null;
            } else if (slotData instanceof Donkeycraft.ItemStack) {
                // Already an ItemStack instance
                this._slots[i] = slotData;
            } else if (typeof slotData === 'object' && slotData.id !== undefined) {
                // Serialized slot data — deserialize
                this._slots[i] = Donkeycraft.ItemStack.fromObject(slotData);
            }
            // Update DOM display for non-empty slots
            if (this._slots[i] && !this._slots[i].isEmpty()) {
                this._updateSlotDisplay(i, this._slots[i]);
            } else {
                this._updateSlotDisplay(i, null);
            }
        }
    };

    /**
     * loadData — loads item stacks from a serialized data object.
     * @param {Object} data - Serialized chest data with { key: string, slots: Array|null }.
     */
    Donkeycraft.ChestUI.prototype.loadData = function (data) {
        if (!data || !Array.isArray(data.slots)) return;

        // Update data key reference
        if (data.key) {
            this._dataKey = data.key;
        }

        this._loadPreloadedSlots(data.slots);
    };

    /**
     * serializeData — serializes current chest state for persistence.
     * @returns {Object} Serialized chest data object.
     */
    Donkeycraft.ChestUI.prototype.serializeData = function () {
        var slots = [];
        for (var i = 0; i < this._slotCount; i++) {
            if (this._slots[i] && !this._slots[i].isEmpty()) {
                slots.push(this._slots[i].serialize());
            } else {
                slots.push(null);
            }
        }
        return {
            key: this._dataKey || null,
            doubleChest: this._doubleChest,
            slots: slots
        };
    };

    /**
     * handleKeyPress — routes keyboard input for chest interactions.
     * Supports number keys (0-9) to quick-move items from player hotbar,
     * and 'Q' to drop the first non-empty slot item.
     * @param {string} key - Key identifier (e.g., 'Escape', 'Digit1').
     * @returns {boolean} True if the key was consumed.
     */
    Donkeycraft.ChestUI.prototype.handleKeyPress = function (key) {
        // Escape is handled by GuiManager — do NOT consume it here
        if (key === 'Escape') return false;

        // Number keys 0-9 to quick-move from player hotbar slot
        if (key >= 'Digit0' && key <= 'Digit9') {
            var digitStr = key.slice(5);
            var digit = parseInt(digitStr, 10);
            if (isNaN(digit)) return true; // Consume but no-op for invalid
            if (digit === 0) digit = 9; // Digit0 maps to hotbar slot 9
            // Quick-move from player hotbar is handled externally via GuiManager.handleDrop
            // This method just consumes the key to prevent game logic interference
            return true;
        }

        // 'Q' to drop item from first non-empty slot
        if (key === 'KeyQ') {
            for (var q = 0; q < this._slotCount; q++) {
                var stack = this._slots[q];
                if (stack && !stack.isEmpty()) {
                    var taken = this.takeItem(q);
                    if (taken) {
                        // Emit drop event — game handles dropping on ground
                        this._emitDrop(taken, q);
                    }
                    return true;
                }
            }
            // Key consumed even when no items to drop
            return true;
        }

        return false;
    };

    /**
     * onSlotChange — subscribes to slot change events.
     * @param {Function} callback - Called with (slotIndex, newStack, oldStack) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.ChestUI.prototype.onSlotChange = function (callback) {
        this._listeners.onSlotChange.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onSlotChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSlotChange.splice(idx, 1);
        };
    };

    /**
     * onDrop — subscribes to drop events (items dropped via Q key or drag).
     * @param {Function} callback - Called with (stack, slotIndex) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.ChestUI.prototype.onDrop = function (callback) {
        this._listeners.onDrop.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onDrop.indexOf(callback);
            if (idx >= 0) self._listeners.onDrop.splice(idx, 1);
        };
    };

    /**
     * setDoubleClickHandler — sets the click handler for slot interactions.
     * Used by external code to handle drag-and-drop and quick-move logic.
     * @param {Function} handler - Called with (slotIndex, button) arguments.
     */
    Donkeycraft.ChestUI.prototype.setDoubleClickHandler = function (handler) {
        if (typeof handler === 'function') {
            this._listeners.onClick = handler;
        } else {
            this._listeners.onClick = null;
        }
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.ChestUI.prototype.destroy = function () {
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
            this._container = null;
        }
        this._slots = [];
        this._slotEls = [];
        this._gridEl = null;
        this._titleEl = null;
        this._listeners = {};
    };

})();