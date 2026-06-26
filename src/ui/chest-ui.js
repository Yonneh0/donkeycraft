// Donkeycraft — Chest UI
// Chest GUI with 27 slots (single) or 54 slots (double-chest).
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * ChestUI — manages the chest inventory GUI.
     * @param {HTMLElement} container - DOM container for the chest UI.
     * @param {boolean} [doubleChest=false] - Whether this is a double chest (54 slots).
     */
    Donkeycraft.ChestUI = function(container, doubleChest) {
        this._container = container || null;
        this._doubleChest = !!doubleChest;

        // Slot count: 27 for single, 54 for double
        this._slotCount = this._doubleChest ? 54 : 27;

        // Slots
        this._slots = [];
        for (var i = 0; i < this._slotCount; i++) {
            this._slots[i] = null;
        }

        // Listeners
        this._listeners = {
            onSlotChange: []
        };

        // DOM elements
        this._gridEl = null;
        this._slotEls = []; // Cached slot element array for O(1) access

        // Build DOM if container provided
        if (this._container) {
            this._buildDOM();
        }
    };

    /**
     * _buildDOM — creates the chest GUI DOM structure.
     * @private
     */
    Donkeycraft.ChestUI.prototype._buildDOM = function() {
        var self = this;
        this._container.className = 'dk-chest-ui';
        this._container.style.cssText = 'display: flex; flex-direction: column; padding: 16px; background: rgba(40,35,30,0.95); border-radius: 6px;';

        // Title bar
        var titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size: 16px; font-weight: bold; color: #fff; text-align: center; margin-bottom: 12px;';
        titleEl.textContent = this._doubleChest ? 'Double Chest' : 'Chest';
        this._container.appendChild(titleEl);

        // Slot grid
        var rows = this._doubleChest ? 6 : 3;
        var cols = 9;

        this._gridEl = document.createElement('div');
        this._gridEl.style.cssText = 'display: grid; grid-template-columns: repeat(' + cols + ', 48px); gap: 2px; justify-content: center;';

        for (var i = 0; i < this._slotCount; i++) {
            var slotEl = document.createElement('div');
            slotEl.className = 'dk-chest-slot';
            slotEl.style.cssText = 'width: 48px; height: 48px; background: rgba(100,90,70,0.6); border: 2px solid #776655; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 22px; cursor: pointer;';
            slotEl.dataset.slotIndex = i;

            var itemEl = document.createElement('span');
            itemEl.className = 'dk-slot-item';
            slotEl.appendChild(itemEl);

            // Count overlay
            var countEl = document.createElement('span');
            countEl.className = 'dk-slot-count';
            countEl.style.cssText = 'position: absolute; bottom: 1px; left: 3px; font-size: 10px; color: #fff; font-weight: bold; text-shadow: 1px 1px 2px #000;';
            slotEl.style.position = 'relative';
            slotEl.appendChild(countEl);

            this._gridEl.appendChild(slotEl);
            this._slotEls.push(slotEl); // Cache for O(1) access
        }

        this._container.appendChild(this._gridEl);
    };

    /**
     * isDoubleChest — checks if this is a double chest.
     * @returns {boolean}
     */
    Donkeycraft.ChestUI.prototype.isDoubleChest = function() {
        return this._doubleChest;
    };

    /**
     * getSlotCount — gets the total number of slots.
     * @returns {number} 27 for single, 54 for double.
     */
    Donkeycraft.ChestUI.prototype.getSlotCount = function() {
        return this._slotCount;
    };

    /**
     * getSlot — gets the item stack in a specific slot.
     * @param {number} index - Slot index.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.ChestUI.prototype.getSlot = function(index) {
        if (index < 0 || index >= this._slotCount) return null;
        return this._slots[index];
    };

    /**
     * setSlot — sets the item stack in a specific slot.
     * @param {number} index - Slot index.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     */
    Donkeycraft.ChestUI.prototype.setSlot = function(index, stack) {
        if (index < 0 || index >= this._slotCount) return;
        var oldStack = this._slots[index];
        this._slots[index] = stack;

        // Update DOM display
        this._updateSlotDisplay(index, stack);

        // Emit slot change event
        if (this._listeners.onSlotChange) {
            for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
                try { this._listeners.onSlotChange[i](index, stack, oldStack); } catch (e) {}
            }
        }
    };

    /**
     * takeItem — takes the item from a slot.
     * @param {number} index - Slot index.
     * @returns {Donkeycraft.ItemStack|null} The taken stack, or null if empty.
     */
    Donkeycraft.ChestUI.prototype.takeItem = function(index) {
        if (index < 0 || index >= this._slotCount) return null;

        var stack = this._slots[index];
        if (!stack || stack.isEmpty()) return null;

        var taken = stack.clone();
        this._slots[index] = null;

        // Update DOM display
        this._updateSlotDisplay(index, null);

        // Emit slot change event
        if (this._listeners.onSlotChange) {
            for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
                try { this._listeners.onSlotChange[i](index, null, stack); } catch (e) {}
            }
        }

        return taken;
    };

    /**
     * _updateSlotDisplay — updates the DOM display for a specific slot.
     * @param {number} index - Slot index.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to display.
     * @private
     */
    Donkeycraft.ChestUI.prototype._updateSlotDisplay = function(index, stack) {
        // Use cached slot element array for O(1) access
        if (index < 0 || index >= this._slotEls.length) return;
        var slotEl = this._slotEls[index];
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
    Donkeycraft.ChestUI.prototype._getItemDisplayChar = function(itemId) {
        var displayMap = {
            1: '🪨', 3: '🟫', 4: '🟩', 5: '🪵', 6: '🟨', 7: '🟫',
            24: '🪵', 30: '🟨', 45: '🔲', 54: '📦', 61: '🔥',
            138: '🪨', 187: '📦', 191: '🔥', 214: '⚫', 218: '💎',
            219: '🟢', 220: '🔵', 221: '⚪', 222: '🟡', 225: '🟡',
            226: '⚪', 227: '💎', 310: '🥢', 312: '🔦'
        };
        return displayMap[itemId] || '▪';
    };

    /**
     * onSlotChange — subscribes to slot change events.
     * @param {Function} callback - Called with (slotIndex, newStack, oldStack) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.ChestUI.prototype.onSlotChange = function(callback) {
        this._listeners.onSlotChange.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onSlotChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSlotChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.ChestUI.prototype.destroy = function() {
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._slots = [];
        this._slotEls = [];
        this._listeners = {};
    };

})();