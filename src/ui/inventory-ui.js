// Donkeycraft — Player Inventory UI
// Player inventory panel with paperdoll, equipment slots, backpack grid, and main inventory grid.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * InventoryUI — manages the player inventory GUI panel.
     * Uses static HTML from index.html for paperdoll, equipment, and backpack slots.
     * Dynamically generates only the main inventory grid (43×6 = 258 slots).
     * @param {HTMLElement} [container=null] - DOM container for the inventory panel (auto-found if null).
     * @param {Donkeycraft.Hotbar} [hotbar=null] - Hotbar reference for button positioning.
     */
    Donkeycraft.InventoryUI = function (container, hotbar) {
        this._container = container || null;
        this._hotbar = hotbar || null;
        this._open = false;
        this._closing = false;

        // Inventory data
        this._playerInventory = null; // Donkeycraft.Inventory instance
        this._backpackInventory = null; // Donkeycraft.Inventory instance

        // DOM elements
        this._panelEl = null;
        this._gridEl = null; // The dynamically generated inventory grid
        this._toggleBtnEl = null;

        // Event subscriptions
        this._subscriptions = {};

        // Build DOM (find static panel, create toggle button and dynamic grid)
        this._initDOM();
    };

    /**
     * _initDOM — initializes the DOM structure from static HTML and creates dynamic elements.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._initDOM = function () {
        // Find the static panel from index.html
        this._panelEl = document.getElementById('dk-inventory-panel');

        if (this._panelEl) {
            // Wire up close button
            var closeBtn = document.getElementById('dk-inventory-close-btn');
            if (closeBtn) {
                var self = this;
                closeBtn.addEventListener('click', function () { self.close(); });
            }

            // Find or create the inventory grid container
            this._gridEl = document.getElementById('dk-inventory-grid');
            if (!this._gridEl) {
                // Grid container doesn't exist — create it
                var gridSection = this._panelEl.querySelector('.dk-inventory-grid-section');
                if (gridSection) {
                    var wrapper = gridSection.querySelector('.dk-inventory-grid-wrapper');
                    if (wrapper) {
                        this._gridEl = document.createElement('div');
                        this._gridEl.id = 'dk-inventory-grid';
                        this._gridEl.className = 'dk-inventory-grid';
                        wrapper.appendChild(this._gridEl);
                    }
                }
            }

            // Generate the dynamic inventory grid (258 slots)
            if (this._gridEl) {
                this._generateInventoryGrid();
            }
        }

        // Create toggle button
        this._buildToggleButton();
    };

    /**
     * _generateInventoryGrid — dynamically creates 258 inventory slot elements (43 rows × 6 cols).
     * @private
     */
    Donkeycraft.InventoryUI.prototype._generateInventoryGrid = function () {
        if (!this._gridEl) return;

        for (var row = 0; row < 43; row++) {
            for (var col = 0; col < 6; col++) {
                var slotIdx = row * 6 + col;
                var invSlot = document.createElement('div');
                invSlot.className = 'dk-inv-slot';

                var numEl = document.createElement('span');
                numEl.className = 'dk-slot-number';
                numEl.textContent = slotIdx + 1;
                invSlot.appendChild(numEl);

                var itemEl = document.createElement('div');
                itemEl.className = 'dk-slot-item';
                invSlot.appendChild(itemEl);

                this._gridEl.appendChild(invSlot);
            }
        }
    };

    /**
     * _buildToggleButton — creates the backpack emoji button left of the hotbar.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._buildToggleButton = function () {
        var self = this;
        var btn = document.createElement('button');
        btn.className = 'dk-inventory-toggle-btn';
        btn.textContent = '\uD83C\uDF92'; // 🎒 backpack emoji
        btn.title = 'Inventory (I)';

        btn.addEventListener('click', function () {
            self.toggle();
        });

        // Append to the actual .dk-hotbar element (centered), not the container
        var hotbarEl = document.querySelector('.dk-hotbar');
        if (hotbarEl) {
            hotbarEl.appendChild(btn);
        } else {
            // Fallback: append to container if hotbar not yet created
            document.getElementById('dk-hotbar-container').appendChild(btn);
        }
        this._toggleBtnEl = btn;
    };

    /**
     * open — opens the inventory panel with animation.
     * If currently closing, cancels the close and re-opens immediately.
     */
    Donkeycraft.InventoryUI.prototype.open = function () {
        // If closing, cancel the close and re-open immediately
        if (this._closing) {
            this._cancelClose();
            return;
        }

        if (this._open) return;

        this._open = true;
        this._closing = false;

        if (this._panelEl) {
            // Clear inline styles set by close() so CSS classes take effect
            this._panelEl.style.opacity = '';
            this._panelEl.style.pointerEvents = '';
            this._panelEl.classList.remove('closing');
            this._panelEl.classList.add('open');
        }

        if (this._toggleBtnEl) {
            this._toggleBtnEl.classList.add('active');
        }

        // Emit open event
        if (this._subscriptions.onOpen) {
            for (var i = 0; i < this._subscriptions.onOpen.length; i++) {
                try { this._subscriptions.onOpen[i](); } catch (e) { }
            }
        }
    };

    /**
     * close — closes the inventory panel with animation.
     */
    Donkeycraft.InventoryUI.prototype.close = function () {
        if (!this._open || this._closing) return;

        this._closing = true;

        if (this._panelEl) {
            this._panelEl.classList.add('closing');
            // Remove open class to trigger fade-out transition
            this._panelEl.classList.remove('open');
        }

        // After close animation completes, fully hide panel
        var self = this;
        this._closeTimeout = setTimeout(function () {
            if (self._panelEl) {
                self._panelEl.classList.remove('closing');
                self._panelEl.style.opacity = '0';
                self._panelEl.style.pointerEvents = 'none';
            }
            self._open = false;
            self._closing = false;

            if (self._toggleBtnEl) {
                self._toggleBtnEl.classList.remove('active');
            }

            // Emit close event
            if (self._subscriptions.onClose) {
                for (var i = 0; i < self._subscriptions.onClose.length; i++) {
                    try { self._subscriptions.onClose[i](); } catch (e) { }
                }
            }
        }, 2000); // Match CSS close transition duration
    };

    /**
     * _cancelClose — cancels an in-progress close animation and re-opens immediately.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._cancelClose = function () {
        // Clear the close timeout
        if (this._closeTimeout) {
            clearTimeout(this._closeTimeout);
            this._closeTimeout = null;
        }

        this._closing = false;

        if (this._panelEl) {
            this._panelEl.classList.remove('closing');
            // Clear inline styles so CSS class takes effect
            this._panelEl.style.opacity = '';
            this._panelEl.style.pointerEvents = '';
            this._panelEl.classList.add('open');
        }

        if (this._toggleBtnEl) {
            this._toggleBtnEl.classList.add('active');
        }

        // Emit open event
        if (this._subscriptions.onOpen) {
            for (var i = 0; i < this._subscriptions.onOpen.length; i++) {
                try { this._subscriptions.onOpen[i](); } catch (e) { }
            }
        }
    };

    /**
     * toggle — toggles the inventory open/close state.
     */
    Donkeycraft.InventoryUI.prototype.toggle = function () {
        if (this._open) {
            this.close();
        } else {
            this.open();
        }
    };

    /**
     * isOpen — checks if the inventory is currently open.
     * @returns {boolean}
     */
    Donkeycraft.InventoryUI.prototype.isOpen = function () {
        return this._open;
    };

    /**
     * setInventory — sets the inventory data source for this panel.
     * @param {Donkeycraft.Inventory} playerInv - Player's inventory.
     * @param {Donkeycraft.Inventory} [backpackInv=null] - Backpack/container inventory.
     */
    Donkeycraft.InventoryUI.prototype.setInventory = function (playerInv, backpackInv) {
        this._playerInventory = playerInv;
        this._backpackInventory = backpackInv || null;

        // Subscribe to slot change events for auto-updates
        if (this._playerInventory) {
            var self = this;
            this._playerInventory.onSlotChange(function (slotIdx, newStack) {
                self._updateSlotDisplay('player', slotIdx, newStack);
            });
        }

        if (this._backpackInventory) {
            var self2 = this;
            this._backpackInventory.onSlotChange(function (slotIdx, newStack) {
                self2._updateSlotDisplay('backpack', slotIdx, newStack);
            });
        }

        // Initial render
        this._renderAllSlots();
    };

    /**
     * _renderAllSlots — renders all slot displays from current inventory data.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._renderAllSlots = function () {
        this._renderPlayerSlots();
        this._renderBackpackSlots();
    };

    /**
     * _renderPlayerSlots — renders the player inventory slots (258 main grid).
     * @private
     */
    Donkeycraft.InventoryUI.prototype._renderPlayerSlots = function () {
        if (!this._playerInventory) return;

        var slotCount = Math.min(this._playerInventory.getSlotCount(), 258);
        for (var i = 0; i < slotCount; i++) {
            var slot = this._playerInventory.getSlot(i);
            this._updateSlotDisplay('player', i, slot);
        }
    };

    /**
     * _renderBackpackSlots — renders the backpack container slots (9 slots).
     * @private
     */
    Donkeycraft.InventoryUI.prototype._renderBackpackSlots = function () {
        if (!this._backpackInventory) return;

        for (var i = 0; i < 9; i++) {
            var slot = this._backpackInventory.getSlot(i);
            this._updateSlotDisplay('backpack', i, slot);
        }
    };

    /**
     * _updateSlotDisplay — updates a single slot's visual display.
     * @param {string} type - Slot type ('player', 'backpack', or 'equipment').
     * @param {number} index - Slot index within its section.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to display.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._updateSlotDisplay = function (type, index, stack) {
        var slotEl = null;
        var itemEl = null;
        var countEl = null;

        if (type === 'player') {
            // Find the slot element in the inventory grid
            if (this._gridEl && index < this._gridEl.children.length) {
                slotEl = this._gridEl.children[index];
            }
        } else if (type === 'backpack') {
            var bpSlots = this._panelEl.querySelectorAll('.dk-backpack-slot');
            if (index < bpSlots.length) {
                slotEl = bpSlots[index];
            }
        }

        if (!slotEl) return;

        itemEl = slotEl.querySelector('.dk-slot-item');
        countEl = slotEl.querySelector('.dk-slot-count');

        if (!itemEl) return;

        if (!stack || stack.isEmpty()) {
            itemEl.textContent = '';
            if (countEl) countEl.style.display = 'none';
        } else {
            // Display item as emoji/character
            var itemId = stack.getItemId();
            itemEl.textContent = this._getItemDisplayChar(itemId);

            if (stack.getCount() > 1) {
                if (!countEl) {
                    countEl = document.createElement('span');
                    countEl.className = 'dk-slot-count';
                    slotEl.appendChild(countEl);
                }
                countEl.textContent = stack.getCount();
                countEl.style.display = '';
            } else {
                if (countEl) countEl.style.display = 'none';
            }
        }
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.InventoryUI.prototype._getItemDisplayChar = function (itemId) {
        var displayMap = {
            0: '',
            1: '🪨',
            3: '🟫',
            4: '🟩',
            5: '🪵',
            6: '🟨',
            7: '🟫',
            10: '⬛',
            11: '🔴',
            12: '🟡',
            14: '🟢',
            24: '🪵',
            30: '🪵',
            45: '🔲',
            54: '📦',
            61: '🔥',
            138: '🪨',
            184: '📚',
            187: '📦',
            191: '🔥',
            195: '🔨',
            214: '⚫',
            218: '💎',
            219: '🟢',
            220: '🔵',
            221: '⚪',
            222: '🟡',
            225: '🟡',
            226: '⚪',
            227: '💎',
            229: '🔴',
            230: '🔴',
            310: '🥢',
            312: '🔦'
        };
        return displayMap[itemId] || '▪';
    };

    /**
     * getPanel — gets the panel DOM element.
     * @returns {HTMLElement|null}
     */
    Donkeycraft.InventoryUI.prototype.getPanel = function () {
        return this._panelEl;
    };

    /**
     * onOpen — subscribes to open events.
     * @param {Function} callback - Called when inventory opens.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.InventoryUI.prototype.onOpen = function (callback) {
        if (!this._subscriptions.onOpen) this._subscriptions.onOpen = [];
        this._subscriptions.onOpen.push(callback);
        var self = this;
        return function () {
            var idx = self._subscriptions.onOpen.indexOf(callback);
            if (idx >= 0) self._subscriptions.onOpen.splice(idx, 1);
        };
    };

    /**
     * onClose — subscribes to close events.
     * @param {Function} callback - Called when inventory closes.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.InventoryUI.prototype.onClose = function (callback) {
        if (!this._subscriptions.onClose) this._subscriptions.onClose = [];
        this._subscriptions.onClose.push(callback);
        var self = this;
        return function () {
            var idx = self._subscriptions.onClose.indexOf(callback);
            if (idx >= 0) self._subscriptions.onClose.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up all DOM elements and event listeners.
     */
    Donkeycraft.InventoryUI.prototype.destroy = function () {
        // Close panel if open
        if (this._open) {
            this.close();
        }

        // Remove panel from DOM
        if (this._panelEl && this._panelEl.parentNode) {
            this._panelEl.parentNode.removeChild(this._panelEl);
        }

        // Remove toggle button
        if (this._toggleBtnEl && this._toggleBtnEl.parentNode) {
            this._toggleBtnEl.parentNode.removeChild(this._toggleBtnEl);
        }

        // Clear subscriptions
        this._subscriptions = {};
        this._playerInventory = null;
        this._backpackInventory = null;
    };

})();