// Donkeycraft — Anvil UI
// Anvil GUI for renaming items and combining enchanted items.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * AnvilUI — manages the anvil GUI with rename input, two input slots, and result output.
   * Supports renaming items, repairing damaged items of the same type, and merging enchantments.
   * @param {HTMLElement} container - DOM container for the anvil UI panel.
   */
  Donkeycraft.AnvilUI = function (container) {
    this._container = container || null;

    // Slots: 0=left input, 1=right input, 2=output
    this._slots = [null, null, null];

    // Rename text
    this._renameText = '';

    // XP price
    this._price = 0;

    // Result stack
    this._resultStack = null;

    // Listeners
    this._listeners = {
      onResultChange: [],
      onSlotChange: [],
    };

    // DOM elements
    this._leftSlotEl = null;
    this._rightSlotEl = null;
    this._outputSlotEl = null;
    this._renameInputEl = null;
    this._priceEl = null;

    // Build DOM if container provided
    if (this._container) {
      this._buildDOM();
    }
  };

  /**
   * _buildDOM — creates the anvil GUI DOM structure with slot elements, arrows, rename input, and price display.
   * @private
   */
  Donkeycraft.AnvilUI.prototype._buildDOM = function () {
    var self = this;
    this._container.className = 'dk-anvil-ui';

    // Left input slot
    this._leftSlotEl = document.createElement('div');
    this._leftSlotEl.className = 'dk-anvil-input';
    this._leftSlotEl.innerHTML =
      '<span class="dk-anvil-slot-label">Item</span>';
    this._container.appendChild(this._leftSlotEl);

    // Arrow
    var arrow1 = document.createElement('div');
    arrow1.className = 'dk-anvil-arrow dk-anvil-plus';
    arrow1.textContent = '+';
    this._container.appendChild(arrow1);

    // Right input slot
    this._rightSlotEl = document.createElement('div');
    this._rightSlotEl.className = 'dk-anvil-input';
    this._rightSlotEl.innerHTML =
      '<span class="dk-anvil-slot-label">Item</span>';
    this._container.appendChild(this._rightSlotEl);

    // Arrow
    var arrow2 = document.createElement('div');
    arrow2.className = 'dk-anvil-arrow dk-anvil-arrow-right';
    arrow2.textContent = '→';
    this._container.appendChild(arrow2);

    // Output slot
    this._outputSlotEl = document.createElement('div');
    this._outputSlotEl.className = 'dk-anvil-output';
    this._outputSlotEl.innerHTML =
      '<span class="dk-anvil-slot-label">Result</span>';
    this._container.appendChild(this._outputSlotEl);

    // Right panel: rename + price
    var rightPanel = document.createElement('div');
    rightPanel.className = 'dk-anvil-right-panel';

    // Rename input
    var renameLabel = document.createElement('div');
    renameLabel.className = 'dk-anvil-rename-label';
    renameLabel.textContent = 'Rename Item:';
    rightPanel.appendChild(renameLabel);

    this._renameInputEl = document.createElement('input');
    this._renameInputEl.type = 'text';
    this._renameInputEl.placeholder = 'New name...';
    this._renameInputEl.className = 'dk-anvil-rename-input';

    this._renameInputEl.addEventListener(
      'input',
      (function () {
        return function () {
          self._onRenameChange();
        };
      })()
    );

    rightPanel.appendChild(this._renameInputEl);

    // Price display
    this._priceEl = document.createElement('div');
    this._priceEl.className = 'dk-anvil-price';
    this._priceEl.textContent = 'Level 0';
    rightPanel.appendChild(this._priceEl);

    this._container.appendChild(rightPanel);
  };

  /**
   * _onRenameChange — handles rename text input changes and triggers result recalculation.
   * @private
   */
  Donkeycraft.AnvilUI.prototype._onRenameChange = function () {
    this._renameText = this._renameInputEl.value || '';
    this._calculateResult();
  };

  /**
   * _getMaxDurability — looks up the maximum durability for an item stack.
   * Checks tag.maxDurability first, then ToolRegistry via tool type detection, then falls back to defaults.
   * @param {Donkeycraft.ItemStack} stack - Item stack to look up.
   * @returns {number} Maximum durability value.
   * @private
   */
  Donkeycraft.AnvilUI.prototype._getMaxDurability = function (stack) {
    if (!stack || stack.isEmpty()) return 0;

    // Check tag for explicit maxDurability (highest priority)
    var tag = stack.getTag();
    if (tag && tag.maxDurability !== undefined && tag.maxDurability > 0) {
      return tag.maxDurability;
    }

    var itemId = stack.getItemId();

    // Try to detect tool type from item ID, then look up material durability
    if (
      Donkeycraft.ToolRegistry &&
      typeof Donkeycraft.ToolRegistry.getToolTypeFromBlockId === 'function'
    ) {
      try {
        var toolType = Donkeycraft.ToolRegistry.getToolTypeFromBlockId(itemId);
        if (toolType) {
          // Find the material ID by checking all registered materials
          var materials = Donkeycraft.ToolRegistry.getAllToolMaterials();
          for (var m = 0; m < materials.length; m++) {
            var mat = materials[m];
            // Check if this material's repair item matches — this is a heuristic
            // For proper mapping, we rely on the tag.maxDurability override
          }
        }
      } catch (e) {}
    }

    // Fallback: hardcoded max durabilities by item ID
    var fallbackMap = {
      195: 250, // wooden_pickaxe
      197: 250, // wooden_sword
      196: 2031, // stone_pickaxe
      198: 2031, // stone_sword
      199: 3031, // iron_pickaxe
      201: 3031, // iron_sword
      202: 4031, // gold_pickaxe
      204: 4031, // gold_sword
      205: 1531, // diamond_pickaxe
      207: 1531, // diamond_sword
      210: 64, // fishing_rod
      228: 326, // shield (16 repairs)
      229: 2032, // netherite_pickaxe
      231: 2032, // netherite_sword
      310: 64, // stick
      312: 32, // torch (placeholder)
    };
    return fallbackMap[itemId] || 100; // Default max durability for unknown items
  };

  /**
   * _calculateRepairDurability — calculates the repaired durability for an item.
   * Uses average of both current durabilities + 25% of max, capped at max durability.
   * repair combines: (leftDur + rightDur) / 2 + maxDur * 0.25
   * @param {Donkeycraft.ItemStack} leftStack - Left input stack.
   * @param {Donkeycraft.ItemStack} rightStack - Right input stack.
   * @returns {number} Repaired durability value (0 if inputs are invalid).
   * @private
   */
  Donkeycraft.AnvilUI.prototype._calculateRepairDurability = function (
    leftStack,
    rightStack
  ) {
    var leftMaxDurability = this._getMaxDurability(leftStack);
    // getDurability() returns the durability value stored in tag (remaining uses)
    // If no tag exists or durability is 0, treat as fully damaged
    var leftCurrentDurability = leftStack.getDurability
      ? leftStack.getDurability()
      : 0;
    var rightCurrentDurability = rightStack.getDurability
      ? rightStack.getDurability()
      : 0;

    // If both items are new (durability = 0), repair produces 25% of max
    if (leftCurrentDurability === 0 && rightCurrentDurability === 0) {
      return Math.floor(leftMaxDurability * 0.25);
    }

    // Calculate repaired durability: average of both current durabilities + bonus
    var repairedDurability = Math.floor(
      (leftCurrentDurability + rightCurrentDurability) / 2 +
        leftMaxDurability * 0.25
    );
    // Cap at max durability (items can't be restored beyond original condition)
    return Math.min(repairedDurability, leftMaxDurability);
  };

  /**
   * _getItemDisplayChar — gets a display character for an item ID.
   * @param {number} itemId - Block/item ID.
   * @returns {string}
   * @private
   */
  Donkeycraft.AnvilUI.prototype._getItemDisplayChar = function (itemId) {
    var displayMap = {
      1: '🪨',
      3: '🟫',
      4: '🟩',
      5: '🪵',
      6: '🟨',
      7: '🟫',
      24: '🪵',
      30: '🟨',
      45: '🔲',
      54: '📦',
      61: '🔥',
      138: '🪨',
      187: '📦',
      191: '🔥',
      214: '⚫',
      218: '💎',
      219: '🟢',
      220: '🔵',
      221: '⚪',
      222: '🟡',
      225: '🟡',
      226: '⚪',
      227: '💎',
      310: '🥢',
      312: '🔦',
    };
    return displayMap[itemId] || '▪';
  };

  /**
   * _getSlotIndexFromElement — maps a DOM element to its slot index.
   * @param {HTMLElement} el - The clicked/touched element.
   * @returns {number} Slot index (-1 if not a valid slot).
   * @private
   */
  Donkeycraft.AnvilUI.prototype._getSlotIndexFromElement = function (el) {
    if (!el) return -1;
    // Traverse up to find the slot element
    while (el && el !== this._container) {
      if (el === this._leftSlotEl) return 0;
      if (el === this._rightSlotEl) return 1;
      if (el === this._outputSlotEl) return 2;
      el = el.parentNode;
    }
    return -1;
  };

  /**
   * _updateSlotDisplay — updates the DOM display for a specific slot with visual feedback.
   * @param {number} index - Slot index (0=left, 1=right, 2=output).
   * @private
   */
  Donkeycraft.AnvilUI.prototype._updateSlotDisplay = function (index) {
    var el;
    if (index === 0) el = this._leftSlotEl;
    else if (index === 1) el = this._rightSlotEl;
    else if (index === 2) el = this._outputSlotEl;
    else return;

    if (!el) return;

    var stack = this._slots[index];
    if (!stack || stack.isEmpty()) {
      var labels = ['Item', 'Item', 'Result'];
      el.innerHTML =
        '<span style="color:#aaa;font-size:11px;">' +
        (labels[index] || '') +
        '</span>';
    } else {
      el.textContent = this._getItemDisplayChar(stack.getItemId());
    }
  };

  /**
   * _areEnchantmentsCompatible — checks if two enchantment IDs are compatible.
   * Returns true unless the pair is explicitly incompatible.
   * @param {number} enchantId1 - First enchantment ID.
   * @param {number} enchantId2 - Second enchantment ID.
   * @returns {boolean} True if compatible.
   * @private
   */
  Donkeycraft.AnvilUI.prototype._areEnchantmentsCompatible = function (
    enchantId1,
    enchantId2
  ) {
    // Silk Touch (33) and Fortune (35) are incompatible
    if (
      (enchantId1 === 33 && enchantId2 === 35) ||
      (enchantId1 === 35 && enchantId2 === 33)
    ) {
      return false;
    }
    // Mending (70) and Infinity (264 for arrow enchantment on bow) are incompatible
    if (
      (enchantId1 === 70 && enchantId2 === 264) ||
      (enchantId1 === 264 && enchantId2 === 70)
    ) {
      return false;
    }
    return true;
  };

  /**
   * _calculateResult — calculates the output based on inputs and rename text.
   * @private
   */
  Donkeycraft.AnvilUI.prototype._calculateResult = function () {
    var left = this._slots[0];
    var right = this._slots[1];

    // If no left item, no result
    if (!left || left.isEmpty()) {
      this._resultStack = null;
      this._price = 0;
      this._updateSlotDisplay(2);
      this._priceEl.textContent = 'Level 0';
      // Emit result change event even in early-return path
      if (this._listeners.onResultChange) {
        for (var i = 0; i < this._listeners.onResultChange.length; i++) {
          try {
            this._listeners.onResultChange[i](null);
          } catch (e) {}
        }
      }
      return;
    }

    var hasRename = this._renameText && this._renameText.trim().length > 0;

    // If both items are the same type, combine them (repair/merge)
    if (right && right.getItemId() === left.getItemId()) {
      var combined = left.clone();

      // Merge enchantments from right to left with compatibility checking
      var leftEnchants = left.getEnchantments();
      var rightEnchants = right.getEnchantments();
      var totalEnchantLevel = 0;

      if (rightEnchants && rightEnchants.length > 0) {
        for (var e = 0; e < rightEnchants.length; e++) {
          var rightEnchId = rightEnchants[e].id;
          var rightEnchLevel = rightEnchants[e].level;

          // Check if left already has this enchantment — upgrade to max level
          var alreadyHas = false;
          if (leftEnchants) {
            for (var le = 0; le < leftEnchants.length; le++) {
              if (leftEnchants[le].id === rightEnchId) {
                // Upgrade to higher level (max of both, no incompatibility upgrade)
                if (rightEnchLevel > leftEnchants[le].level) {
                  // Only upgrade if compatible with existing enchantments
                  var compatible = true;
                  for (var le2 = 0; le2 < leftEnchants.length; le2++) {
                    if (
                      !this._areEnchantmentsCompatible(
                        rightEnchId,
                        leftEnchants[le2].id
                      )
                    ) {
                      compatible = false;
                      break;
                    }
                  }
                  if (compatible) {
                    combined.addEnchantment(rightEnchId, rightEnchLevel);
                  } else {
                    // Keep existing level if new one is incompatible with other enchants
                    combined.addEnchantment(
                      rightEnchId,
                      leftEnchants[le].level
                    );
                  }
                } else {
                  combined.addEnchantment(rightEnchId, leftEnchants[le].level);
                }
                alreadyHas = true;
                break;
              }
            }
          }

          // New enchantment — add only if compatible with all existing enchantments
          if (!alreadyHas) {
            var newCompatible = true;
            var allCombinedEnchants = combined.getEnchantments();
            for (var ce = 0; ce < allCombinedEnchants.length; ce++) {
              if (
                !this._areEnchantmentsCompatible(
                  rightEnchId,
                  allCombinedEnchants[ce].id
                )
              ) {
                newCompatible = false;
                break;
              }
            }
            if (newCompatible) {
              combined.addEnchantment(rightEnchId, rightEnchLevel);
            }
            // Incompatible enchantments are silently skipped
          }

          totalEnchantLevel += rightEnchLevel;
        }
      }

      // Repair: average remaining durability + bonus, capped at max durability
      var repairedDurability = this._calculateRepairDurability(left, right);
      combined.setDurability(repairedDurability);

      // Apply rename if present — rename takes precedence over repair
      if (hasRename) {
        if (!combined.getTag()) combined.setTag({});
        combined.getTag().customName = this._renameText.trim();
      }

      this._resultStack = combined;

      // Price: base 1 for rename, + enchantment levels, + repair cost
      this._price = Math.max(
        1,
        Math.min(39, totalEnchantLevel > 0 ? totalEnchantLevel : 1)
      );
    } else if (hasRename) {
      // Rename the left item (trim whitespace to prevent blank names)
      var renamed = left.clone();
      if (!renamed.getTag()) renamed.setTag({});
      renamed.getTag().customName = this._renameText.trim();
      this._resultStack = renamed;
      this._price = 1;
    } else {
      this._resultStack = null;
      this._price = 0;
    }

    this._updateSlotDisplay(2);
    this._priceEl.textContent = 'Level ' + this._price;

    // Emit result change event
    if (this._listeners.onResultChange) {
      for (var i = 0; i < this._listeners.onResultChange.length; i++) {
        try {
          this._listeners.onResultChange[i](this._resultStack);
        } catch (e) {}
      }
    }
  };

  /**
   * getLeftSlot — gets the left input slot content.
   * @returns {Donkeycraft.ItemStack|null}
   */
  Donkeycraft.AnvilUI.prototype.getLeftSlot = function () {
    return this._slots[0];
  };

  /**
   * getRightSlot — gets the right input slot content.
   * @returns {Donkeycraft.ItemStack|null}
   */
  Donkeycraft.AnvilUI.prototype.getRightSlot = function () {
    return this._slots[1];
  };

  /**
   * getResultSlot — gets the output/result slot content.
   * @returns {Donkeycraft.ItemStack|null}
   */
  Donkeycraft.AnvilUI.prototype.getResultSlot = function () {
    return this._resultStack;
  };

  /**
   * _isValidStack — checks if a value is a valid ItemStack or null.
   * @param {*} val - Value to check.
   * @returns {boolean}
   * @private
   */
  Donkeycraft.AnvilUI.prototype._isValidStack = function (val) {
    return (
      val === null ||
      (val !== null &&
        typeof val.isEmpty === 'function' &&
        typeof val.getItemId === 'function')
    );
  };

  /**
   * setLeftSlot — sets the left input slot.
   * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
   * @returns {boolean} True if successful.
   */
  Donkeycraft.AnvilUI.prototype.setLeftSlot = function (stack) {
    if (!this._isValidStack(stack)) return false;
    var oldStack = this._slots[0];
    this._slots[0] = stack;
    this._updateSlotDisplay(0);
    this._calculateResult();

    // Emit slot change event
    if (this._listeners.onSlotChange) {
      for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
        try {
          this._listeners.onSlotChange[i](0, stack, oldStack);
        } catch (e) {}
      }
    }
    return true;
  };

  /**
   * setRightSlot — sets the right input slot.
   * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
   * @returns {boolean} True if successful.
   */
  Donkeycraft.AnvilUI.prototype.setRightSlot = function (stack) {
    if (!this._isValidStack(stack)) return false;
    var oldStack = this._slots[1];
    this._slots[1] = stack;
    this._updateSlotDisplay(1);
    this._calculateResult();

    // Emit slot change event
    if (this._listeners.onSlotChange) {
      for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
        try {
          this._listeners.onSlotChange[i](1, stack, oldStack);
        } catch (e) {}
      }
    }
    return true;
  };

  /**
   * getRenameText — gets the current rename text.
   * @returns {string} The rename text.
   */
  Donkeycraft.AnvilUI.prototype.getRenameText = function () {
    return this._renameText;
  };

  /**
   * setRenameText — sets the rename text for the anvil result.
   * @param {string} text - The new rename text.
   * @returns {boolean} True if successful.
   */
  Donkeycraft.AnvilUI.prototype.setRenameText = function (text) {
    if (typeof text !== 'string') return false;
    this._renameText = text;
    this._calculateResult();
    return true;
  };

  /**
   * getPrice — gets the XP level cost.
   * @returns {number}
   */
  Donkeycraft.AnvilUI.prototype.getPrice = function () {
    return this._price;
  };

  /**
   * calculateResult — recalculates the output based on current inputs.
   * @returns {Donkeycraft.ItemStack|null}
   */
  Donkeycraft.AnvilUI.prototype.calculateResult = function () {
    this._calculateResult();
    return this._resultStack;
  };

  /**
   * takeResult — takes the result item and clears the output slot.
   * Deducts XP cost from player if set. Returns null if player can't afford it.
   * @returns {Donkeycraft.ItemStack|null} The result stack, or null if none/can't afford.
   */
  Donkeycraft.AnvilUI.prototype.takeResult = function () {
    if (!this._resultStack || this._resultStack.isEmpty()) return null;

    // Check if player can afford the price
    if (!this.canAffordPrice()) {
      return null;
    }

    var result = this._resultStack.clone();
    this._resultStack = null;

    // Deduct XP cost from player
    if (this._player && this._player.addLevel) {
      try {
        // addLevel with negative value removes levels
        this._player.addLevel(-this._price);
      } catch (e) {}
    }

    this._updateSlotDisplay(2);
    this._price = 0;
    if (this._priceEl) {
      this._priceEl.textContent = 'Level 0';
    }
    return result;
  };

  /**
   * handleClick — handles mouse click events on slot elements.
   * Left-click (button 0) on output slot takes the result.
   * Right-click (button 2) on input slots clears them.
   * @param {number} x - Click X coordinate (unused, for GUI Manager compatibility).
   * @param {number} y - Click Y coordinate (unused, for GUI Manager compatibility).
   * @param {number} [button=0] - Mouse button (0=left, 2=right).
   */
  Donkeycraft.AnvilUI.prototype.handleClick = function (x, y, button) {
    button = button || 0;

    // Left-click on output slot takes the result
    if (button === 0 && this._resultStack && !this._resultStack.isEmpty()) {
      // Check if click is within output slot bounds
      if (this._outputSlotEl) {
        var rect = this._outputSlotEl.getBoundingClientRect();
        if (
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        ) {
          this.takeResult();
          return;
        }
      }
    }

    // Right-click on input slots clears them (for GUI Manager compatibility)
    if (button === 2) {
      var slotIdx = -1;
      if (this._leftSlotEl && this._isPointInElement(x, y, this._leftSlotEl))
        slotIdx = 0;
      else if (
        this._rightSlotEl &&
        this._isPointInElement(x, y, this._rightSlotEl)
      )
        slotIdx = 1;

      if (slotIdx >= 0) {
        var oldStack = this._slots[slotIdx];
        this._slots[slotIdx] = null;
        this._updateSlotDisplay(slotIdx);
        this._calculateResult();

        // Emit slot change event
        if (this._listeners.onSlotChange) {
          for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
            try {
              this._listeners.onSlotChange[i](slotIdx, null, oldStack);
            } catch (e) {}
          }
        }
      }
    }
  };

  /**
   * _isPointInElement — checks if a normalized (x, y) point is within an element's bounds.
   * @param {number} x - X coordinate.
   * @param {number} y - Y coordinate.
   * @param {HTMLElement} el - Element to check.
   * @returns {boolean}
   * @private
   */
  Donkeycraft.AnvilUI.prototype._isPointInElement = function (x, y, el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  };

  /**
   * handleDrop — handles dropping an item onto the anvil GUI.
   * Drops onto the nearest slot based on position, or left slot by default.
   * @param {Donkeycraft.ItemStack} itemStack - The dropped item stack.
   * @param {number} slotIndex - Target slot index (-1 = auto-detect).
   */
  Donkeycraft.AnvilUI.prototype.handleDrop = function (itemStack, slotIndex) {
    if (!itemStack || !this._isValidStack(itemStack)) return false;

    // Auto-detect slot if not specified
    if (slotIndex === -1 || slotIndex === undefined) {
      // Default to left slot for dropped items
      slotIndex = 0;
    }

    // Validate slot index
    if (slotIndex < 0 || slotIndex > 1) return false;

    // Set the slot (which triggers recalculation)
    if (slotIndex === 0) {
      this.setLeftSlot(itemStack);
    } else {
      this.setRightSlot(itemStack);
    }

    // Emit slot change event
    if (this._listeners.onSlotChange) {
      for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
        try {
          this._listeners.onSlotChange[i](slotIndex, itemStack, null);
        } catch (e) {}
      }
    }

    return true;
  };

  /**
   * handleKeyPress — routes keyboard input for anvil interactions.
   * Supports 'Enter' to accept the result, and 'Escape' to close.
   * @param {string} key - Key identifier (e.g., 'Escape', 'Enter').
   * @returns {boolean} True if the key was consumed.
   */
  Donkeycraft.AnvilUI.prototype.handleKeyPress = function (key) {
    // Escape always closes the anvil GUI
    if (key === 'Escape') return false; // Let GuiManager handle it

    // Enter to accept result
    if (key === 'Enter') {
      if (this._resultStack && !this._resultStack.isEmpty()) {
        this.takeResult();
      }
      return true;
    }

    return false;
  };

  /**
   * onResultChange — subscribes to result change events.
   * @param {Function} callback - Called with (resultStack) argument.
   * @returns {Function} Unsubscribe function.
   */
  Donkeycraft.AnvilUI.prototype.onResultChange = function (callback) {
    this._listeners.onResultChange.push(callback);
    var self = this;
    return function () {
      var idx = self._listeners.onResultChange.indexOf(callback);
      if (idx >= 0) self._listeners.onResultChange.splice(idx, 1);
    };
  };

  /**
   * onSlotChange — subscribes to slot change events.
   * @param {Function} callback - Called with (slotIndex, newStack, oldStack) arguments.
   * @returns {Function} Unsubscribe function.
   */
  Donkeycraft.AnvilUI.prototype.onSlotChange = function (callback) {
    this._listeners.onSlotChange.push(callback);
    var self = this;
    return function () {
      var idx = self._listeners.onSlotChange.indexOf(callback);
      if (idx >= 0) self._listeners.onSlotChange.splice(idx, 1);
    };
  };

  /**
   * setPlayer — sets an optional player reference for XP cost validation.
   * @param {Donkeycraft.Player} player - Player instance with levels property.
   */
  Donkeycraft.AnvilUI.prototype.setPlayer = function (player) {
    this._player = player || null;
  };

  /**
   * getPlayer — gets the player reference if set.
   * @returns {Donkeycraft.Player|null}
   */
  Donkeycraft.AnvilUI.prototype.getPlayer = function () {
    return this._player || null;
  };

  /**
   * canAffordPrice — checks if the player has enough XP levels to afford the result.
   * @returns {boolean} True if player has sufficient levels (or no player is set).
   */
  Donkeycraft.AnvilUI.prototype.canAffordPrice = function () {
    if (!this._player || !this._player.getLevel) return true; // No player or no level method
    try {
      return this._player.getLevel() >= this._price;
    } catch (e) {
      return true; // Graceful fallback
    }
  };

  /**
   * destroy — cleans up resources and removes all event listeners.
   */
  Donkeycraft.AnvilUI.prototype.destroy = function () {
    if (this._container) {
      while (this._container.firstChild) {
        this._container.removeChild(this._container.firstChild);
      }
      this._container = null;
    }
    this._slots = [];
    this._resultStack = null;
    this._renameText = '';
    this._price = 0;
    this._listeners = {};
    this._player = null;
    this._leftSlotEl = null;
    this._rightSlotEl = null;
    this._outputSlotEl = null;
    this._renameInputEl = null;
    this._priceEl = null;
  };
})();
