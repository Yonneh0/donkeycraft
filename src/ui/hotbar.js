// Donkeycraft — Hotbar
// Hotbar UI: slot rendering, number keys 1-9, scroll wheel selection.
// Includes StaminaBar — a semi-transparent yellow progress bar displayed behind the hotbar.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * Hotbar — manages the player's hotbar display and selection.
     * Integrates with Phase 2's GUIRenderer for WebGL slot highlighting.
     * Includes an integrated StaminaBar displayed behind the hotbar slots.
     * @param {HTMLElement} container - DOM container for hotbar elements.
     * @param {Donkeycraft.GUIRenderer} [guiRenderer=null] - Optional WebGL GUI renderer for highlight overlay.
     * @param {HTMLCanvasElement} [canvas=null] - Canvas element for WebGL rendering context.
     */
    Donkeycraft.Hotbar = function (container, guiRenderer, canvas) {
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

        // Stamina bar references (set by _buildStaminaBar)
        this._staminaFill = null;
        this._staminaPulse = null;
        this._prevStamina = -1;
        this._pulseTimeout = null;

        // Build DOM if container provided
        if (this._container) {
            this._buildDOM();
        }
    };

    /**
     * _buildDOM — creates the hotbar slot elements and stamina bar inside the container.
     * The stamina bar is inserted as the first child so it renders behind the slots.
     * @private
     */
    Donkeycraft.Hotbar.prototype._buildDOM = function () {
        var self = this;
        this._container.style.cssText = 'display: flex; justify-content: center; gap: 2px; padding: 4px; position: absolute; background: rgba(0,0,0,0.5); border-radius: 4px; overflow: visible; bottom: 8px; left: 50%; transform: translateX(-50%);';

        // Build the stamina bar behind the slots
        this._buildStaminaBar();

        for (var i = 0; i < 9; i++) {
            var slotEl = document.createElement('div');
            slotEl.className = 'dk-hotbar-slot';
            // z-index: 1 ensures slots render above the stamina bar wrapper (z-index: 0)
            slotEl.style.cssText = 'width: 48px; height: 48px; background: rgba(100,100,100,0.6); border: 2px solid #555; border-radius: 3px; display: flex; align-items: center; justify-content: center; position: relative; z-index: 1;';
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
            slotEl.addEventListener('mousedown', (function (idx) {
                return function () { self.setSelectedSlot(idx); };
            })(i));
        }

        this._updateSelectionHighlight();
    };

    /**
     * _buildStaminaBar — creates the stamina bar DOM elements inside the hotbar container.
     * The stamina bar is inserted as the first child so it renders behind the hotbar slots,
     * showing through the gaps and edges without affecting layout.
     * @private
     */
    Donkeycraft.Hotbar.prototype._buildStaminaBar = function () {
        if (!this._container) return;

        // Wrapper positioned absolutely behind the slot row — z-index: 0 ensures it stays below slots
        // Height set to 24px to fully cover the background area behind the hotbar slots
        var wrapper = document.createElement('div');
        wrapper.className = 'dk-stamina-bar-wrapper';
        wrapper.style.cssText = 'position: absolute; bottom: 0; left: 0; right: 0; height: 24px; pointer-events: none; z-index: 0;';

        // Background track — dark fill visible through gaps
        var bg = document.createElement('div');
        bg.className = 'dk-stamina-bar-bg';
        bg.style.cssText = 'position: absolute; bottom: 2px; left: 2px; right: 2px; height: 100%; background: rgba(0, 0, 0, 0.5); border-radius: 4px; overflow: hidden;';

        // Animated fill — yellow progress bar with smooth width transition
        var fill = document.createElement('div');
        fill.className = 'dk-stamina-bar-fill';
        fill.style.cssText = 'position: absolute; bottom: 2px; left: 2px; height: 100%; width: 100%; background: linear-gradient(90deg, rgba(255, 210, 50, 0.8), rgba(255, 180, 30, 0.7)); border-radius: 4px; transition: width 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94); box-shadow: 0 0 8px rgba(255, 210, 50, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);';

        // Pulse overlay — brief brightness boost on stamina change
        // Width matches the fill to only pulse over the filled portion
        var pulse = document.createElement('div');
        pulse.className = 'dk-stamina-bar-pulse';
        pulse.style.cssText = 'position: absolute; bottom: 2px; left: 2px; height: 100%; width: 100%; background: linear-gradient(90deg, rgba(255, 230, 80, 0.5), rgba(255, 200, 60, 0.4)); border-radius: 4px; opacity: 0; pointer-events: none; transition: width 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 100ms ease-out;';

        bg.appendChild(fill);
        wrapper.appendChild(bg);
        wrapper.appendChild(pulse);

        // Insert as first child so it renders behind slot elements (which come after in DOM order)
        if (this._container.firstChild) {
            this._container.insertBefore(wrapper, this._container.firstChild);
        } else {
            this._container.appendChild(wrapper);
        }

        this._staminaFill = fill;
        this._staminaPulse = pulse;

        // Subscribe to stamina:changed events
        this._subscribeToStaminaEvents();
    };

    /**
     * _subscribeToStaminaEvents — listen for stamina:changed events from the EventBus.
     * @private
     */
    Donkeycraft.Hotbar.prototype._subscribeToStaminaEvents = function () {
        var self = this;
        this._onStaminaChanged = function (data) { self._onStaminaUpdate(data); };

        var globalBus = EventBus && EventBus._global;
        if (globalBus) {
            try {
                globalBus.on('stamina:changed', this._onStaminaChanged);
            } catch (e) {
                Donkeycraft.Logger.warn('Hotbar', 'Failed to subscribe to stamina:changed: ' + e.message);
            }
        } else {
            Donkeycraft.Logger.warn('Hotbar', 'No global EventBus instance available — stamina bar will not receive updates');
        }
    };

    /**
     * _onStaminaUpdate — called on stamina:changed events to update the visual bar.
     * @private
     * @param {Object} data - Stamina change data { stamina, maxStamina, delta }.
     */
    Donkeycraft.Hotbar.prototype._onStaminaUpdate = function (data) {
        var stamina = Math.max(0, Math.round(data.stamina || 0));
        var maxStamina = data.maxStamina || 100;

        // Calculate fill percentage and clamp to [0, 100]
        var pct = Math.min(100, Math.max(0, (stamina / maxStamina) * 100));

        // Update fill width with CSS transition
        this._staminaFill.style.width = pct + '%';

        // Trigger pulse animation on change
        if (this._prevStamina >= 0 && this._prevStamina !== stamina) {
            this._triggerStaminaPulse();
        }

        this._prevStamina = stamina;
    };

    /**
     * _triggerStaminaPulse — briefly flash the pulse overlay for visual feedback.
     * @private
     */
    Donkeycraft.Hotbar.prototype._triggerStaminaPulse = function () {
        if (!this._staminaPulse) return;

        // Clear any existing pulse timeout to prevent overlapping animations
        if (this._pulseTimeout) {
            clearTimeout(this._pulseTimeout);
        }

        // Match pulse width to current fill width for smooth visual feedback
        if (this._staminaFill) {
            this._staminaPulse.style.width = this._staminaFill.style.width;
        }

        // Show pulse
        this._staminaPulse.style.opacity = '1';

        // Fade out after a brief flash
        var self = this;
        this._pulseTimeout = setTimeout(function () {
            if (self._staminaPulse) {
                self._staminaPulse.style.opacity = '0';
            }
        }, 120);
    };

    /**
     * _updateSelectionHighlight — updates the WebGL highlight and DOM border for selected slot.
     * @private
     */
    Donkeycraft.Hotbar.prototype._updateSelectionHighlight = function () {
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
            } catch (e) { }
        }
    };

    /**
     * setSlots — updates all 9 slot displays with item stacks.
     * @param {Array} stacks - Array of 9 ItemStack objects (null for empty slots).
     */
    Donkeycraft.Hotbar.prototype.setSlots = function (stacks) {
        if (!stacks || !Array.isArray(stacks)) return;

        for (var i = 0; i < 9 && i < stacks.length; i++) {
            var oldStack = this._slots[i];
            this._slots[i] = stacks[i];
            this._updateSlotDOM(i, stacks[i]);

            // Emit slot change if different
            if (oldStack !== stacks[i]) {
                if (this._listeners.onSlotChange) {
                    for (var j = 0; j < this._listeners.onSlotChange.length; j++) {
                        try { this._listeners.onSlotChange[j](i, stacks[i]); } catch (e) { }
                    }
                }
            }
        }

        // Update selection highlight AFTER all DOM updates to ensure correct visual state
        this._updateSelectionHighlight();
    };

    /**
     * _updateSlotDOM — updates a single slot's DOM display.
     * @param {number} index - Slot index.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to display.
     * @private
     */
    Donkeycraft.Hotbar.prototype._updateSlotDOM = function (index, stack) {
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
    Donkeycraft.Hotbar.prototype._getItemDisplayChar = function (itemId) {
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
    Donkeycraft.Hotbar.prototype.getSelectedSlot = function () {
        return this._selectedSlot;
    };

    /**
     * setSelectedSlot — sets the selected hotbar slot and triggers highlight update.
     * @param {number} n - Slot index (0-8).
     */
    Donkeycraft.Hotbar.prototype.setSelectedSlot = function (n) {
        if (n < 0 || n >= 9) return;
        if (n === this._selectedSlot) return;

        var oldSlot = this._selectedSlot;
        this._selectedSlot = n;
        this._updateSelectionHighlight();

        // Emit selected change event
        if (this._listeners.onSelectedChange) {
            for (var i = 0; i < this._listeners.onSelectedChange.length; i++) {
                try { this._listeners.onSelectedChange[i](n, oldSlot); } catch (e) { }
            }
        }
    };

    /**
     * selectNext — cycles to the next hotbar slot.
     */
    Donkeycraft.Hotbar.prototype.selectNext = function () {
        this.setSelectedSlot((this._selectedSlot + 1) % 9);
    };

    /**
     * selectPrev — cycles to the previous hotbar slot.
     */
    Donkeycraft.Hotbar.prototype.selectPrev = function () {
        this.setSelectedSlot((this._selectedSlot - 1 + 9) % 9);
    };

    /**
     * onSlotChange — subscribes to slot change events.
     * @param {Function} callback - Called with (slotIndex, stack) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Hotbar.prototype.onSlotChange = function (callback) {
        this._listeners.onSlotChange.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onSlotChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSlotChange.splice(idx, 1);
        };
    };

    /**
     * onSelectedChange — subscribes to selection change events.
     * @param {Function} callback - Called with (newSlot, oldSlot) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Hotbar.prototype.onSelectedChange = function (callback) {
        this._listeners.onSelectedChange.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onSelectedChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSelectedChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up all DOM elements, event listeners, and timers.
     * Unsubscribes from stamina:changed events and nulls all internal references.
     */
    Donkeycraft.Hotbar.prototype.destroy = function () {
        // Clear pulse timeout
        if (this._pulseTimeout) {
            clearTimeout(this._pulseTimeout);
            this._pulseTimeout = null;
        }

        // Unsubscribe from stamina events
        var globalBus = EventBus && EventBus._global;
        if (globalBus && this._onStaminaChanged) {
            try {
                globalBus.off('stamina:changed', this._onStaminaChanged);
            } catch (e) { }
        }

        // Clear DOM
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }

        // Null out references
        this._slotElements = [];
        this._slots = [];
        this._listeners = {};
        this._staminaFill = null;
        this._staminaPulse = null;
        this._onStaminaChanged = null;
    };

})();