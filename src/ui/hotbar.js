// Donkeycraft — Hotbar
// Hotbar UI: slot rendering, number keys 1-9, scroll wheel selection.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Hotbar — manages the player's hotbar display and selection.
     * Integrates with Phase 2's GUIRenderer for WebGL slot highlighting.
     * @param {HTMLElement} container - DOM container for hotbar elements.
     * @param {Donkeycraft.GUIRenderer} [guiRenderer=null] - Optional WebGL GUI renderer for highlight overlay.
     * @param {HTMLCanvasElement} [canvas=null] - Canvas element for WebGL rendering context.
     */
    Donkeycraft.Hotbar = function(container, guiRenderer, canvas) {
        this._container = container || null;
        this._guiRenderer = guiRenderer || null;
        this._canvas = canvas || null;
        this._selectedSlot = 0; // 0-8

        // Slot elements and data
        this._slotElements = [];
        this._slots = []; // ItemStack data

        // Listeners
        this._listeners = {
            onSlotChange: [],
            onSelectedChange: []
        };

        // Build DOM if container provided
        if (this._container) {
            this._buildDOM();
        }
    };

    /**
     * _buildDOM — creates the hotbar slot elements in the container.
     * @private
     */
    Donkeycraft.Hotbar.prototype._buildDOM = function() {
        var self = this;
        this._container.className = 'dk-hotbar';
        this._container.style.cssText = 'display: flex; justify-content: center; gap: 2px; padding: 4px; background: rgba(0,0,0,0.5); border-radius: 4px;';

        for (var i = 0; i < 9; i++) {
            var slotEl = document.createElement('div');
            slotEl.className = 'dk-hotbar-slot';
            slotEl.style.cssText = 'width: 48px; height: 48px; background: rgba(100,100,100,0.6); border: 2px solid #555; border-radius: 3px; display: flex; align-items: center; justify-content: center; position: relative;';
            slotEl.dataset.slotIndex = i;

            // Number indicator — positioned top-left per CSS .dk-slot-number convention
            var numEl = document.createElement('span');
            numEl.className = 'dk-slot-number';
            numEl.style.cssText = 'position: absolute; top: 1px; left: 3px; font-size: 10px; color: #aaa; text-shadow: 1px 1px 1px #000;';
            numEl.textContent = (i + 1);
            slotEl.appendChild(numEl);

            // Item display area
            var itemEl = document.createElement('div');
            itemEl.className = 'dk-slot-item';
            itemEl.style.cssText = 'font-size: 24px; text-align: center;';
            slotEl.appendChild(itemEl);

            // Count overlay
            var countEl = document.createElement('span');
            countEl.className = 'dk-slot-count';
            countEl.style.cssText = 'position: absolute; bottom: 1px; left: 3px; font-size: 11px; color: #fff; font-weight: bold; text-shadow: 1px 1px 2px #000;';
            slotEl.appendChild(countEl);

            this._slotElements.push(slotEl);
            this._container.appendChild(slotEl);

            // Click to select
            slotEl.addEventListener('mousedown', (function(idx) {
                return function() { self.setSelectedSlot(idx); };
            })(i));
        }

        this._updateSelectionHighlight();
    };

    /**
     * _updateSelectionHighlight — updates the WebGL highlight and DOM border for selected slot.
     * @private
     */
    Donkeycraft.Hotbar.prototype._updateSelectionHighlight = function() {
        // Update DOM borders
        for (var i = 0; i < this._slotElements.length; i++) {
            var el = this._slotElements[i];
            if (i === this._selectedSlot) {
                el.style.borderColor = '#fff';
                el.style.borderWidth = '3px';
            } else {
                el.style.borderColor = '#555';
                el.style.borderWidth = '2px';
            }
        }

        // Update WebGL hotbar highlight if renderer available
        if (this._guiRenderer && this._canvas) {
            try {
                this._guiRenderer.renderHotbar(this._selectedSlot, this._canvas.width, this._canvas.height);
            } catch (e) {}
        }
    };

    /**
     * setSlots — updates all 9 slot displays with item stacks.
     * @param {Array} stacks - Array of 9 ItemStack objects (null for empty slots).
     */
    Donkeycraft.Hotbar.prototype.setSlots = function(stacks) {
        if (!stacks || !Array.isArray(stacks)) return;

        for (var i = 0; i < 9 && i < stacks.length; i++) {
            var oldStack = this._slots[i];
            this._slots[i] = stacks[i];
            this._updateSlotDOM(i, stacks[i]);

            // Emit slot change if different
            if (oldStack !== stacks[i]) {
                if (this._listeners.onSlotChange) {
                    for (var j = 0; j < this._listeners.onSlotChange.length; j++) {
                        try { this._listeners.onSlotChange[j](i, stacks[i]); } catch (e) {}
                    }
                }
            }
        }
    };

    /**
     * _updateSlotDOM — updates a single slot's DOM display.
     * @param {number} index - Slot index.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to display.
     * @private
     */
    Donkeycraft.Hotbar.prototype._updateSlotDOM = function(index, stack) {
        if (index < 0 || index >= this._slotElements.length) return;

        var slotEl = this._slotElements[index];
        var itemEl = slotEl.querySelector('.dk-slot-item');
        var countEl = slotEl.querySelector('.dk-slot-count');

        if (!itemEl || !countEl) return;

        if (!stack || stack.isEmpty()) {
            itemEl.textContent = '';
            countEl.textContent = '';
        } else {
            // Display item as emoji/character (Phase 19 textures not yet implemented)
            var itemId = stack.getItemId();
            itemEl.textContent = this._getItemDisplayChar(itemId);

            if (stack.getCount() > 1) {
                countEl.textContent = stack.getCount();
                countEl.style.display = '';
            } else {
                countEl.style.display = 'none';
            }
        }
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.Hotbar.prototype._getItemDisplayChar = function(itemId) {
        // Simple mapping for common items (Phase 19 will replace with textures)
        var displayMap = {
            0: '',       // air
            1: '🪨',     // stone
            3: '🟫',     // dirt
            4: '🟩',     // grass_block
            5: '🪵',     // oak_log
            6: '🟨',     // oak_planks
            7: '🟫',     // sand
            10: '⬛',   // coal_ore
            11: '🔴',   // iron_ore
            12: '🟡',   // gold_ore
            14: '🟢',   // emerald_ore
            19: '⬜',   // sand (for glass)
            24: '🪵',   // oak_log
            30: '🟨',   // oak_planks
            45: '🔲',   // glass
            54: '📦',   // chest
            61: '🔥',   // furnace
            64: '🚪',   // door
            69: '🔴',   // lever
            70: '🔘',   // button
            138: '🪨',  // cobblestone
            171: '🟢',  // sugar_cane
            172: '📜',  // reed
            184: '📚',  // bookshelf
            187: '📦',  // chest
            191: '🔥',  // furnace
            195: '🔨',  // crafting_table
            196: '⚖️',  // anvil
            199: '💎',  // enchanting_table
            214: '⚫',  // coal
            218: '💎',  // diamond
            219: '🟢',  // emerald
            220: '🔵',  // lapis_lazuli
            221: '⚪',  // iron_ingot
            222: '🟡',  // gold_ingot
            225: '🟡',  // gold_block
            226: '⚪',  // iron_block
            227: '💎',  // diamond_block
            229: '🔴',  // redstone
            230: '🔴',  // redstone_block
            310: '🥢',  // stick
            312: '🔦',  // torch
            503: '🟡',  // sugar
            504: '📄',  // paper
            505: '⬜',  // leather
            506: '📖',  // book
            508: '🔵',  // clay_ball
            510: '⚪',  // bone_meal
            649: '🍖'   // porkchop (common food)
        };
        return displayMap[itemId] || '▪';
    };

    /**
     * getSelectedSlot — gets the currently selected hotbar slot.
     * @returns {number} Selected slot index (0-8).
     */
    Donkeycraft.Hotbar.prototype.getSelectedSlot = function() {
        return this._selectedSlot;
    };

    /**
     * setSelectedSlot — sets the selected hotbar slot and triggers highlight update.
     * @param {number} n - Slot index (0-8).
     */
    Donkeycraft.Hotbar.prototype.setSelectedSlot = function(n) {
        if (n < 0 || n >= 9) return;
        if (n === this._selectedSlot) return;

        var oldSlot = this._selectedSlot;
        this._selectedSlot = n;
        this._updateSelectionHighlight();

        // Emit selected change event
        if (this._listeners.onSelectedChange) {
            for (var i = 0; i < this._listeners.onSelectedChange.length; i++) {
                try { this._listeners.onSelectedChange[i](n, oldSlot); } catch (e) {}
            }
        }
    };

    /**
     * selectNext — cycles to the next hotbar slot.
     */
    Donkeycraft.Hotbar.prototype.selectNext = function() {
        this.setSelectedSlot((this._selectedSlot + 1) % 9);
    };

    /**
     * selectPrev — cycles to the previous hotbar slot.
     */
    Donkeycraft.Hotbar.prototype.selectPrev = function() {
        this.setSelectedSlot((this._selectedSlot - 1 + 9) % 9);
    };

    /**
     * onSlotChange — subscribes to slot change events.
     * @param {Function} callback - Called with (slotIndex, stack) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Hotbar.prototype.onSlotChange = function(callback) {
        this._listeners.onSlotChange.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onSlotChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSlotChange.splice(idx, 1);
        };
    };

    /**
     * onSelectedChange — subscribes to selection change events.
     * @param {Function} callback - Called with (newSlot, oldSlot) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Hotbar.prototype.onSelectedChange = function(callback) {
        this._listeners.onSelectedChange.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onSelectedChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSelectedChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.Hotbar.prototype.destroy = function() {
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._slotElements = [];
        this._slots = [];
        this._listeners = {};
    };

})();