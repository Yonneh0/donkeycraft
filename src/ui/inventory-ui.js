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
    this._playerInventory = null;
    this._backpackInventory = null;

    // DOM elements
    this._panelEl = null;
    this._gridEl = null;
    this._toggleBtnEl = null;

    // Event subscriptions
    this._subscriptions = {};

    // Build DOM
    this._initDOM();
  };

  /**
   * _initDOM — initializes the DOM structure from static HTML and creates dynamic elements.
   * @private
   */
  Donkeycraft.InventoryUI.prototype._initDOM = function () {
    this._panelEl = document.getElementById('dk-inventory-panel');

    if (this._panelEl) {
      var closeBtn = document.getElementById('dk-inventory-close-btn');
      if (closeBtn) {
        var self = this;
        closeBtn.addEventListener('click', function () {
          self.close();
        });
      }

      this._gridEl = document.getElementById('dk-inventory-grid');
      if (!this._gridEl) {
        var gridSection = this._panelEl.querySelector(
          '.dk-inventory-grid-section'
        );
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

      if (this._gridEl) {
        this._generateInventoryGrid();
      }
    }

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

    var hotbarEl = document.querySelector('.dk-hotbar');
    if (hotbarEl) {
      hotbarEl.appendChild(btn);
    } else {
      document.getElementById('dk-hotbar-container').appendChild(btn);
    }
    this._toggleBtnEl = btn;
  };

  /**
   * open — opens the inventory panel with animation.
   * If currently closing, cancels the close and re-opens immediately.
   */
  Donkeycraft.InventoryUI.prototype.open = function () {
    if (this._closing) {
      this._cancelClose();
      return;
    }

    if (this._open) return;

    this._open = true;
    this._closing = false;

    if (this._panelEl) {
      this._panelEl.style.opacity = '';
      this._panelEl.style.pointerEvents = '';
      this._panelEl.classList.remove('closing');
      this._panelEl.classList.add('open');
    }

    if (this._toggleBtnEl) {
      this._toggleBtnEl.classList.add('active');
    }

    if (this._subscriptions.onOpen) {
      for (var i = 0; i < this._subscriptions.onOpen.length; i++) {
        try {
          this._subscriptions.onOpen[i]();
        } catch (e) {}
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
      this._panelEl.classList.remove('open');
    }

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

      if (self._subscriptions.onClose) {
        for (var i = 0; i < self._subscriptions.onClose.length; i++) {
          try {
            self._subscriptions.onClose[i]();
          } catch (e) {}
        }
      }
    }, 2000);
  };

  /**
   * _cancelClose — cancels an in-progress close animation and re-opens immediately.
   * @private
   */
  Donkeycraft.InventoryUI.prototype._cancelClose = function () {
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }
    this._closing = false;
    this.open();
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
   * Equipment slot mapping — maps DOM data-slot attributes to inventory indices.
   * These slot names match inv.html's equipment layout exactly.
   * @type {Object.<string, number>}
   */
  Donkeycraft.InventoryUI.EQUIPMENT_SLOTS = {
    neck: 0, // Neck accessory
    trin: 1, // Right ring
    lbra: 2, // Left bracer
    lrin: 3, // Left ring
    shie: 4, // Shield
    aet1: 5, // Extra equipment slot 1
    aet2: 6, // Extra equipment slot 2
    aet3: 7, // Extra equipment slot 3
    cloa: 8, // Cloak
    rbra: 9, // Right bracer
    rrin: 10, // Right ring (duplicate slot name - maps to same as above)
    main: 11, // Main hand weapon/tool
    ammo: 12, // Ammo slot
    shir: 13, // Shirt
    pant: 14, // Pants
  };

  /**
   * _getItemDisplayChar — gets a display character for an item ID using ItemDefinitionRegistry.
   * Falls back to block name mapping if registry lookup fails.
   * @param {number} itemId - Block/item ID.
   * @returns {string} Display character (emoji or letter).
   * @private
   */
  Donkeycraft.InventoryUI.prototype._getItemDisplayChar = function (itemId) {
    // Try ItemDefinitionRegistry first for special items (tools, armor, food, etc.)
    if (Donkeycraft.ItemDefinitionRegistry && itemId > 255) {
      var itemDef = Donkeycraft.ItemDefinitionRegistry.get(itemId);
      if (itemDef && itemDef.name) {
        // Return first character of display name for special items
        return itemDef.name.charAt(0).toUpperCase();
      }
    }

    // Block ID fallback map — uses block names from BlockRegistry
    var displayMap = {
      0: '', // air
      1: '🪨', // stone
      3: '🟫', // dirt
      4: '🟩', // grass_block
      5: '🪵', // oak_log
      6: '🟨', // sand
      7: '🟫', // gravel
      10: '⬛', // coal_ore
      11: '🔴', // redstone_ore
      12: '🟡', // glowstone
      14: '🟢', // emerald_ore
      24: '🪵', // oak_planks
      30: '🪵', // birch_log
      45: '🔲', // iron_ingot
      54: '📦', // chest
      61: '🔥', // fire
      138: '🪨', // deepslate
      184: '📚', // bookshelf
      187: '📦', // crafting_table
      191: '🔥', // lava
      195: '🔨', // anvil
      214: '⬛', // obsidian
      218: '💎', // diamond
      219: '🟢', // emerald
      220: '🔵', // lapis_ore
      221: '⬜', // quartz
      222: '🟡', // gold_ore
      225: '🟡', // gold_ingot
      226: '⬜', // iron_ingot
      227: '💎', // diamond
      229: '🔴', // redstone_dust
      230: '🔴', // redstone_block
      310: '🥢', // iron_pickaxe
      312: '🔦', // torch
    };

    return displayMap[itemId] || '▪';
  };

  /**
   * _initContainerSlots — Set up click handlers on container slots for backpack management.
   * When a backpack item is placed in a container slot, it creates/loads that backpack's inventory.
   * @private
   */
  Donkeycraft.InventoryUI.prototype._initContainerSlots = function () {
    if (!this._panelEl || !this._playerInventory) return;

    var self = this;
    var containerSlots = this._panelEl.querySelectorAll('.dk-container-slot');

    for (var i = 0; i < containerSlots.length; i++) {
      (function (slotEl, slotIndex) {
        // Add click handler for backpack management
        slotEl.addEventListener('click', function (e) {
          e.stopPropagation();
          // Container slots are handled by the drag-and-drop system
          // Clicking does nothing special - items are placed via drag/drop
        });
      })(containerSlots[i], i);
    }
  };

  /**
   * _updateSlotDisplay — updates a single slot's visual display.
   * @param {string} type - Slot type ('player', 'backpack', or 'equipment').
   * @param {number} index - Slot index within its section.
   * @param {Donkeycraft.ItemStack|null} stack - Stack to display.
   * @private
   */
  Donkeycraft.InventoryUI.prototype._updateSlotDisplay = function (
    type,
    index,
    stack
  ) {
    var slotEl = null;
    var itemEl = null;
    var countEl = null;

    if (type === 'player') {
      if (this._gridEl && index < this._gridEl.children.length) {
        slotEl = this._gridEl.children[index];
      }
    } else if (type === 'backpack') {
      var bpSlots = this._panelEl.querySelectorAll('.dk-container-slot');
      if (index < bpSlots.length) {
        slotEl = bpSlots[index];
      }
    } else if (type === 'equipment') {
      // Equipment slots use data-slot attribute matching inv.html layout
      var equipSlots = this._panelEl.querySelectorAll('.dk-equip-slot');
      for (var i = 0; i < equipSlots.length; i++) {
        var slotData = equipSlots[i].getAttribute('data-slot');
        if (slotData === index) {
          slotEl = equipSlots[i];
          break;
        }
      }
    }

    if (!slotEl) return;

    itemEl = slotEl.querySelector('.dk-slot-item');
    countEl = slotEl.querySelector('.dk-slot-count');

    if (!itemEl) return;

    if (!stack || stack.isEmpty()) {
      itemEl.textContent = '';
      itemEl.style.opacity = '0.3';
      itemEl.style.filter = 'grayscale(100%)';
      if (countEl) countEl.style.display = 'none';
    } else {
      var itemId = stack.getItemId();
      itemEl.textContent = this._getItemDisplayChar(itemId);
      itemEl.style.opacity = '1';
      itemEl.style.filter = 'none';

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
   * _renderAllSlots — Render all slots from player inventory, backpack, and equipment.
   * @private
   */
  Donkeycraft.InventoryUI.prototype._renderAllSlots = function () {
    // Render player inventory grid (258 slots)
    if (this._playerInventory && this._gridEl) {
      for (
        var i = 0;
        i < this._gridEl.children.length &&
        i < this._playerInventory.getSlotCount();
        i++
      ) {
        var stack = this._playerInventory.getSlot(i);
        this._updateSlotDisplay('player', i, stack);
      }
    }

    // Render backpack/container slots (C1-C9)
    if (this._backpackInventory) {
      for (
        var j = 0;
        j < 9 && j < this._backpackInventory.getSlotCount();
        j++
      ) {
        var bstack = this._backpackInventory.getSlot(j);
        this._updateSlotDisplay('backpack', j, bstack);
      }
    }

    // Render equipment slots from player inventory
    if (this._playerInventory) {
      var equipSlotNames = Object.keys(Donkeycraft.InventoryUI.EQUIPMENT_SLOTS);
      for (var k = 0; k < equipSlotNames.length; k++) {
        var slotName = equipSlotNames[k];
        var invIndex = Donkeycraft.InventoryUI.EQUIPMENT_SLOTS[slotName];
        // Equipment items are stored at specific indices in the player inventory
        // For now, read from the inventory grid slots that correspond to equipment
        var stack = this._playerInventory.getSlot(invIndex);
        this._updateSlotDisplay('equipment', slotName, stack);
      }
    }
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
   * setInventory — sets the inventory data source for this panel.
   * @param {Donkeycraft.ItemManager} playerInv - Player's ItemManager.
   * @param {Donkeycraft.ItemManager} [backpackInv=null] - Main backpack (C1) inventory.
   */
  Donkeycraft.InventoryUI.prototype.setInventory = function (
    playerInv,
    backpackInv
  ) {
    this._playerInventory = playerInv;
    this._backpackInventory = backpackInv || null;

    // Store the Player reference from the ItemManager for event filtering.
    // ItemManager stores the Player in _player property.
    this._player = playerInv ? playerInv._player : null;

    // Store additional backpack inventories (C2-C9)
    this._additionalBackpacks = {};

    // Subscribe to EventBus for slot change events.
    // ItemManager emits 'item:slot:changed' with { slot, oldStack, newStack, player }
    // We store the unsubscribe function to clean up in destroy().
    if (Donkeycraft.EventBus) {
      var self = this;
      this._slotChangeListener = function (data) {
        // Filter events by source ItemManager using the 'player' reference in event data.
        // This avoids unnecessary DOM updates when events from other ItemManagers fire.
        if (
          self._player &&
          data.player === self._player &&
          data.slot >= 0 &&
          data.slot < 258
        ) {
          self._updateSlotDisplay('player', data.slot, data.newStack);
        }
        // Update backpack slots if set — backpack inventories use the same Player reference
        if (
          self._backpackInventory &&
          data.player === self._player &&
          data.slot >= 0 &&
          data.slot < 9
        ) {
          self._updateSlotDisplay('backpack', data.slot, data.newStack);
        }
      };
      this._unsubscribeSlotChange = Donkeycraft.EventBus.onSafe(
        'item:slot:changed',
        this._slotChangeListener
      );
    }

    // Wire container slot click handlers for backpack management
    this._initContainerSlots();

    this._renderAllSlots();
  };

  /**
   * destroy — cleans up all DOM elements, event listeners, and subscriptions for InventoryUI.
   */
  Donkeycraft.InventoryUI.prototype.destroy = function () {
    if (this._open) {
      this.close();
    }

    // Unsubscribe from EventBus slot change listener to prevent memory leaks
    if (this._unsubscribeSlotChange) {
      try {
        this._unsubscribeSlotChange();
      } catch (e) {}
      this._unsubscribeSlotChange = null;
    }
    this._slotChangeListener = null;

    if (this._panelEl && this._panelEl.parentNode) {
      this._panelEl.parentNode.removeChild(this._panelEl);
    }

    if (this._toggleBtnEl && this._toggleBtnEl.parentNode) {
      this._toggleBtnEl.parentNode.removeChild(this._toggleBtnEl);
    }

    this._subscriptions = {};
    this._playerInventory = null;
    this._backpackInventory = null;
    this._player = null;
  };
})();