// Donkeycraft — Item Manager
// Efficient system that tracks items through their entire lifecycle.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var EventBus = Donkeycraft.EventBus;
  var ItemType = Donkeycraft.ItemType;

  /**
   * ItemManager — tracks all item stacks through their lifecycle.
   * Manages inventory slots, dropped items, crafting outputs, and more.
   * @param {Donkeycraft.Player} [player=null] — The player who owns this inventory.
   */
  Donkeycraft.ItemManager = function (player) {
    this._player = player || null;

    // Main inventory: 36 slots (30 main inventory + 6 armor slots at end)
    this._inventory = new Array(41); // 36 inventory + 5 hotbar = 41 total
    for (var i = 0; i < this._inventory.length; i++) {
      this._inventory[i] = null; // null or ItemStack
    }

    // Previously selected slot (for undo)
    this._prevSelectedSlot = -1;
    this._selectedSlot = 0;

    // Dirty tracking — which slots have changed since last sync
    this._dirtySlots = new Array(this._inventory.length);
    for (var i = 0; i < this._dirtySlots.length; i++) {
      this._dirtySlots[i] = false;
    }

    // Event listeners cleanup functions
    this._cleanupFns = [];
  };

  // ============================================================
  // Slot Constants
  // ============================================================

  /**
   * Slot indices for the ItemManager inventory.
   * Hotbar: slots 0-8
   * Main inventory: slots 9-35
   * Armor: slots 36-39 (helmet, chestplate, leggings, boots)
   */
  Donkeycraft.ItemManager.SLOT = {
    HOTBAR_START: 0,
    HOTBAR_END: 8,
    INVENTORY_START: 9,
    INVENTORY_END: 35,
    ARMOR_HELMET: 36,
    ARMOR_CHESTPLATE: 37,
    ARMOR_LEGGINGS: 38,
    ARMOR_BOOTS: 39,
    TOTAL_SLOTS: 40,
  };

  // ============================================================
  // Core Inventory Accessors
  // ============================================================

  /**
   * getStack — gets the item stack in a slot.
   * @param {number} slot - Slot index.
   * @returns {Donkeycraft.ItemStack|null}
   */
  Donkeycraft.ItemManager.prototype.getStack = function (slot) {
    if (slot < 0 || slot >= this._inventory.length) return null;
    return this._inventory[slot];
  };

  /**
   * setStack — sets the item stack in a slot.
   * @param {number} slot - Slot index.
   * @param {Donkeycraft.ItemStack|null} stack - Stack to set (null to clear).
   */
  Donkeycraft.ItemManager.prototype.setStack = function (slot, stack) {
    if (slot < 0 || slot >= this._inventory.length) return;

    var oldStack = this._inventory[slot];

    // Only mark dirty if the stack actually changed
    if (
      oldStack !== stack &&
      (!oldStack ||
        !oldStack.matches(stack) ||
        oldStack.getCount() !== (stack ? stack.getCount() : 0))
    ) {
      this._dirtySlots[slot] = true;
    }

    this._inventory[slot] = stack;

    // Emit event
    if (EventBus) {
      try {
        EventBus.emitSafe('item:slot:changed', {
          slot: slot,
          oldStack: oldStack,
          newStack: stack,
          player: this._player,
        });
      } catch (e) {}
    }
  };

  /**
   * setSlot — alias for setStack, sets the item stack in a slot.
   * @param {number} slot - Slot index.
   * @param {Donkeycraft.ItemStack|null} stack - Stack to set (null to clear).
   */
  Donkeycraft.ItemManager.prototype.setSlot = function (slot, stack) {
    this.setStack(slot, stack);
  };

  /**
   * getInventory — gets the full inventory array.
   * @returns {Array} Array of 41 ItemStacks (null for empty slots).
   */
  Donkeycraft.ItemManager.prototype.getInventory = function () {
    return this._inventory;
  };

  /**
   * getHotbar — gets the hotbar slots (0-8).
   * @returns {Array} Array of 9 ItemStacks.
   */
  Donkeycraft.ItemManager.prototype.getHotbar = function () {
    var result = [];
    for (var i = 0; i < 9; i++) {
      result.push(this._inventory[i]);
    }
    return result;
  };

  /**
   * getMainInventory — gets the main inventory slots (9-35).
   * @returns {Array} Array of 27 ItemStacks.
   */
  Donkeycraft.ItemManager.prototype.getMainInventory = function () {
    var result = [];
    for (var i = 9; i <= 35; i++) {
      result.push(this._inventory[i]);
    }
    return result;
  };

  /**
   * getArmorInventory — gets the armor slots (36-39).
   * @returns {Array} Array of 4 ItemStacks.
   */
  Donkeycraft.ItemManager.prototype.getArmorInventory = function () {
    var result = [];
    for (var i = 36; i <= 39; i++) {
      result.push(this._inventory[i]);
    }
    return result;
  };

  // ============================================================
  // Selected Slot Management
  // ============================================================

  /**
   * getSelectedStack — gets the item stack in the currently selected hotbar slot.
   * @returns {Donkeycraft.ItemStack|null}
   */
  Donkeycraft.ItemManager.prototype.getSelectedStack = function () {
    return this._inventory[this._selectedSlot];
  };

  /**
   * getSelectedItemIndex — gets the index of the currently selected hotbar slot.
   * @returns {number}
   */
  Donkeycraft.ItemManager.prototype.getSelectedItemIndex = function () {
    return this._selectedSlot;
  };

  /**
   * setSelectedSlot — sets the selected hotbar slot.
   * @param {number} index - Hotbar slot index (0-8).
   */
  Donkeycraft.ItemManager.prototype.setSelectedSlot = function (index) {
    if (index < 0 || index > 9) return;

    this._prevSelectedSlot = this._selectedSlot;
    this._selectedSlot = index;

    if (EventBus) {
      try {
        EventBus.emitSafe('item:selected:changed', {
          slot: index,
          prevSlot: this._prevSelectedSlot,
        });
      } catch (e) {}
    }
  };

  /**
   * getPreviousSelectedSlot — gets the previously selected hotbar slot.
   * @returns {number}
   */
  Donkeycraft.ItemManager.prototype.getPreviousSelectedSlot = function () {
    return this._prevSelectedSlot;
  };

  // ============================================================
  // Item Operations
  // ============================================================

  /**
   * _getMaxStackForItem — gets the maximum stack size for an item ID.
   * Uses ItemDefinitionRegistry if available, falls back to 64.
   * @param {number} itemId - Item ID to look up.
   * @returns {number} Maximum stack size.
   * @private
   */
  Donkeycraft.ItemManager.prototype._getMaxStackForItem = function (itemId) {
    if (
      Donkeycraft.ItemDefinitionRegistry &&
      typeof Donkeycraft.ItemDefinitionRegistry.get === 'function'
    ) {
      var itemDef = Donkeycraft.ItemDefinitionRegistry.get(itemId);
      if (itemDef && typeof itemDef.getMaxStackSize === 'function') {
        return itemDef.getMaxStackSize();
      }
    }
    return 64; // Default max stack size
  };

  /**
   * addItem — tries to add a stack to the inventory.
   * First attempts to stack with existing identical stacks, then finds empty slots.
   * @param {Donkeycraft.ItemStack} stack - Stack to add.
   * @returns {number} Number of items that couldn't be added (0 = all added).
   */
  Donkeycraft.ItemManager.prototype.addItem = function (stack) {
    if (!stack || stack.isEmpty()) return 0;

    var remaining = stack.getCount();
    var itemId = stack.getItemId();
    var maxStack = this._getMaxStackForItem(itemId);

    // First pass: try to stack with existing identical stacks
    for (var i = 0; i < this._inventory.length; i++) {
      var existing = this._inventory[i];
      if (existing && !existing.isEmpty() && existing.canStackWith(stack)) {
        // Use the smaller of the two max stack sizes (existing item's definition or new stack's)
        var existingMax = 64;
        if (
          Donkeycraft.ItemDefinitionRegistry &&
          typeof Donkeycraft.ItemDefinitionRegistry.get === 'function'
        ) {
          var existingDef = Donkeycraft.ItemDefinitionRegistry.get(
            existing.getItemId()
          );
          if (
            existingDef &&
            typeof existingDef.getMaxStackSize === 'function'
          ) {
            existingMax = existingDef.getMaxStackSize();
          }
        }
        var effectiveMax = Math.min(maxStack, existingMax);
        var space = effectiveMax - existing.getCount();
        if (space > 0) {
          var toAdd = Math.min(remaining, space);
          existing.increment(toAdd);
          remaining -= toAdd;
          this._dirtySlots[i] = true;

          if (remaining <= 0) return 0;
        }
      }
    }

    // Second pass: find empty slots for new stacks
    while (remaining > 0) {
      var emptySlot = -1;
      for (var j = 0; j < this._inventory.length; j++) {
        if (!this._inventory[j] || this._inventory[j].isEmpty()) {
          emptySlot = j;
          break;
        }
      }

      if (emptySlot === -1) break; // No space

      var countToAdd = Math.min(remaining, maxStack);
      var newStack = new Donkeycraft.ItemStack(
        itemId,
        countToAdd,
        stack.getTag()
      );
      this._inventory[emptySlot] = newStack;
      this._dirtySlots[emptySlot] = true;
      remaining -= countToAdd;
    }

    if (remaining > 0) {
      // Emit event for items that couldn't be added
      if (EventBus) {
        try {
          EventBus.emitSafe('item:add:partial', {
            remaining: remaining,
            player: this._player,
          });
        } catch (e) {
          if (Donkeycraft.Logger) {
            Donkeycraft.Logger.warn(
              'ItemManager',
              'Failed to emit item:add:partial event: ' + e.message
            );
          }
        }
      }
    }

    return remaining;
  };

  /**
   * removeItem — removes items from a specific slot.
   * @param {number} slot - Slot index.
   * @param {number} count - Number of items to remove.
   * @returns {number} Number of items actually removed.
   */
  Donkeycraft.ItemManager.prototype.removeItem = function (slot, count) {
    if (slot < 0 || slot >= this._inventory.length) return 0;

    var stack = this._inventory[slot];
    if (!stack || stack.isEmpty()) return 0;

    var actualRemove = Math.min(count, stack.getCount());
    stack.decrement(actualRemove);

    if (stack.isEmpty()) {
      this._inventory[slot] = null;
    }

    this._dirtySlots[slot] = true;

    // Emit event
    if (EventBus) {
      try {
        EventBus.emitSafe('item:removed', {
          slot: slot,
          count: actualRemove,
          player: this._player,
        });
      } catch (e) {}
    }

    return actualRemove;
  };

  /**
   * swapItems — swaps stacks between two slots.
   * @param {number} fromSlot - Source slot index.
   * @param {number} toSlot - Destination slot index.
   * @returns {boolean} True if the swap was successful.
   */
  Donkeycraft.ItemManager.prototype.swapItems = function (fromSlot, toSlot) {
    // Validate slot indices
    if (
      typeof fromSlot !== 'number' ||
      typeof toSlot !== 'number' ||
      !Number.isInteger(fromSlot) ||
      !Number.isInteger(toSlot) ||
      fromSlot < 0 ||
      fromSlot >= this._inventory.length ||
      toSlot < 0 ||
      toSlot >= this._inventory.length
    )
      return false;

    var temp = this._inventory[fromSlot];
    this._inventory[fromSlot] = this._inventory[toSlot];
    this._inventory[toSlot] = temp;

    this._dirtySlots[fromSlot] = true;
    this._dirtySlots[toSlot] = true;
    return true;
  };

  /**
   * splitStack — splits items from one slot to another.
   * @param {number} fromSlot - Source slot index.
   * @param {number} count - Number of items to split.
   * @param {number} [toSlot=-1] - Destination slot (-1 = find empty slot).
   * @returns {Donkeycraft.ItemStack|null} The split stack or null.
   */
  Donkeycraft.ItemManager.prototype.splitStack = function (
    fromSlot,
    count,
    toSlot
  ) {
    // Validate fromSlot index
    if (
      typeof fromSlot !== 'number' ||
      !Number.isInteger(fromSlot) ||
      fromSlot < 0 ||
      fromSlot >= this._inventory.length
    )
      return null;

    var sourceStack = this._inventory[fromSlot];
    if (!sourceStack || sourceStack.isEmpty()) return null;

    var actualSplit = Math.min(count, sourceStack.getCount());
    var splitCount = Math.max(1, actualSplit);

    // Create the split stack
    var splitStack = sourceStack.clone();
    splitStack.setCount(splitCount);

    if (toSlot >= 0 && toSlot < this._inventory.length) {
      // Validate toSlot index
      if (
        typeof toSlot !== 'number' ||
        !Number.isInteger(toSlot) ||
        toSlot < 0 ||
        toSlot >= this._inventory.length
      )
        return null;

      // Place into specific slot
      var targetStack = this._inventory[toSlot];
      if (!targetStack || targetStack.isEmpty()) {
        this._inventory[toSlot] = splitStack;
        sourceStack.decrement(splitCount);
        if (sourceStack.isEmpty()) {
          this._inventory[fromSlot] = null;
        }
        this._dirtySlots[fromSlot] = true;
        this._dirtySlots[toSlot] = true;
        return splitStack;
      } else if (targetStack.canStackWith(splitStack)) {
        var maxStack = targetStack.getMaxStackSize
          ? targetStack.getMaxStackSize()
          : 64;
        var space = maxStack - targetStack.getCount();
        var toAdd = Math.min(splitCount, space);
        targetStack.increment(toAdd);
        splitStack.setCount(toAdd);
        sourceStack.decrement(toAdd);
        if (sourceStack.isEmpty()) {
          this._inventory[fromSlot] = null;
        }
        this._dirtySlots[fromSlot] = true;
        this._dirtySlots[toSlot] = true;
        return splitStack;
      }
      // Target slot has incompatible item — return null since nothing was placed
      return null;
    } else {
      // Find empty slot
      for (var i = 0; i < this._inventory.length; i++) {
        if (!this._inventory[i] || this._inventory[i].isEmpty()) {
          this._inventory[i] = splitStack;
          sourceStack.decrement(splitCount);
          if (sourceStack.isEmpty()) {
            this._inventory[fromSlot] = null;
          }
          this._dirtySlots[fromSlot] = true;
          this._dirtySlots[i] = true;
          return splitStack;
        }
      }
    }

    return splitStack;
  };

  /**
   * canFitItem — checks if an item stack can fit in the inventory.
   * @param {Donkeycraft.ItemStack} stack - Stack to check.
   * @returns {boolean}
   */
  Donkeycraft.ItemManager.prototype.canFitItem = function (stack) {
    if (!stack || stack.isEmpty()) return true;

    // Check if any existing stack can accept more
    for (var i = 0; i < this._inventory.length; i++) {
      var existing = this._inventory[i];
      if (existing && existing.canStackWith(stack)) {
        var maxStack = existing.getMaxStackSize
          ? existing.getMaxStackSize()
          : 64;
        if (existing.getCount() < maxStack) return true;
      }
    }

    // Check for empty slots
    for (var j = 0; j < this._inventory.length; j++) {
      if (!this._inventory[j] || this._inventory[j].isEmpty()) return true;
    }

    return false;
  };

  /**
   * findSlotForItem — finds a suitable slot for an item stack.
   * @param {Donkeycraft.ItemStack} stack - Stack to find a slot for.
   * @returns {number} Slot index, or -1 if none found.
   */
  Donkeycraft.ItemManager.prototype.findSlotForItem = function (stack) {
    if (!stack || stack.isEmpty()) return -1;

    // First pass: find stacking slot
    for (var i = 0; i < this._inventory.length; i++) {
      var existing = this._inventory[i];
      if (existing && existing.canStackWith(stack)) {
        var maxStack = existing.getMaxStackSize
          ? existing.getMaxStackSize()
          : 64;
        if (existing.getCount() < maxStack) return i;
      }
    }

    // Second pass: find empty slot
    for (var j = 0; j < this._inventory.length; j++) {
      if (!this._inventory[j] || this._inventory[j].isEmpty()) return j;
    }

    return -1;
  };

  /**
   * clearSlot — clears a specific slot.
   * @param {number} slot - Slot index.
   */
  Donkeycraft.ItemManager.prototype.clearSlot = function (slot) {
    if (slot < 0 || slot >= this._inventory.length) return;
    if (this._inventory[slot]) {
      this._dirtySlots[slot] = true;
      this._inventory[slot] = null;
    }
  };

  /**
   * clearAll — clears the entire inventory.
   */
  Donkeycraft.ItemManager.prototype.clearAll = function () {
    for (var i = 0; i < this._inventory.length; i++) {
      if (this._inventory[i]) {
        this._dirtySlots[i] = true;
        this._inventory[i] = null;
      }
    }
  };

  // ============================================================
  // Durability & Consumption
  // ============================================================

  /**
   * consumeItem — consumes one use of the selected item (decrements durability or count).
   * @returns {boolean} True if the item was consumed/broken.
   */
  Donkeycraft.ItemManager.prototype.consumeItem = function () {
    var stack = this._inventory[this._selectedSlot];
    if (!stack || stack.isEmpty()) return false;

    var itemDef = Donkeycraft.ItemDefinitionRegistry.get(stack.getItemId());
    var broken = false;

    if (itemDef && itemDef.isDurable()) {
      // Decrease durability
      var currentDurability = stack.getDurability();
      var maxDurability = itemDef.getMaxDurability();
      var newDurability = currentDurability + 1; // Higher = more worn

      if (newDurability >= maxDurability) {
        // Tool broke
        this._inventory[this._selectedSlot] = null;
        this._dirtySlots[this._selectedSlot] = true;
        broken = true;

        if (EventBus) {
          try {
            EventBus.emitSafe('item:broke', {
              slot: this._selectedSlot,
              itemId: stack.getItemId(),
              player: this._player,
            });
          } catch (e) {}
        }
      } else {
        stack.setDurability(newDurability);
        this._dirtySlots[this._selectedSlot] = true;
      }
    } else if (!itemDef || itemDef.maxStackCount > 1) {
      // Non-durable consumable: decrement count
      stack.decrement(1);
      if (stack.isEmpty()) {
        this._inventory[this._selectedSlot] = null;
        this._dirtySlots[this._selectedSlot] = true;
      }
    }

    return broken;
  };

  /**
   * repairItem — repairs the item in a slot using a repair material.
   * @param {number} slot - Slot index.
   * @param {Donkeycraft.ItemStack} materialStack - Repair material stack.
   * @returns {number} Amount of durability restored.
   */
  Donkeycraft.ItemManager.prototype.repairItem = function (
    slot,
    materialStack
  ) {
    if (slot < 0 || slot >= this._inventory.length) return 0;

    var itemStack = this._inventory[slot];
    if (!itemStack || itemStack.isEmpty()) return 0;

    var itemDef = Donkeycraft.ItemDefinitionRegistry.get(itemStack.getItemId());
    if (!itemDef || !itemDef.isDurable()) return 0;

    var repairId = itemDef.getRepairItemBlockId();
    if (repairId === 0 || materialStack.getItemId() !== repairId) return 0;

    var currentDurability = itemStack.getDurability();
    var maxDurability = itemDef.getMaxDurability();

    if (currentDurability >= maxDurability) return 0;

    // Repair amount: 1/4 of max durability per repair
    var repairAmount = Math.floor(maxDurability / 4);
    var newDurability = Math.min(
      maxDurability,
      currentDurability + repairAmount
    );
    itemStack.setDurability(newDurability);
    this._dirtySlots[slot] = true;

    // Consume one material
    materialStack.decrement(1);
    if (materialStack.isEmpty()) {
      // Material stack was in a different slot, handled by caller
    }

    return maxDurability - newDurability;
  };

  // ============================================================
  // Serialization
  // ============================================================

  /**
   * serialize — serializes the inventory to a JSON-safe object.
   * @returns {Object} Serialized inventory data.
   */
  Donkeycraft.ItemManager.prototype.serialize = function () {
    var slots = [];
    for (var i = 0; i < this._inventory.length; i++) {
      var stack = this._inventory[i];
      if (stack && !stack.isEmpty()) {
        slots.push({ slot: i, data: stack.serialize() });
      }
    }

    return {
      slots: slots,
      selectedSlot: this._selectedSlot,
    };
  };

  /**
   * deserialize — loads the inventory from serialized data.
   * @param {Object} data - Serialized inventory data.
   */
  Donkeycraft.ItemManager.prototype.deserialize = function (data) {
    if (!data || !data.slots) return;

    // Clear inventory first
    this.clearAll();

    // Load slots
    for (var i = 0; i < data.slots.length; i++) {
      var slotData = data.slots[i];
      var stack = Donkeycraft.ItemStack.fromObject(slotData.data);
      this._inventory[slotData.slot] = stack;
      this._dirtySlots[slotData.slot] = true;
    }

    // Restore selected slot
    if (data.selectedSlot !== undefined) {
      this._selectedSlot = data.selectedSlot;
    }
  };

  /**
   * markDirty — marks all slots as dirty (for full sync).
   */
  Donkeycraft.ItemManager.prototype.markDirty = function () {
    for (var i = 0; i < this._dirtySlots.length; i++) {
      this._dirtySlots[i] = true;
    }
  };

  /**
   * clearDirty — clears all dirty flags.
   */
  Donkeycraft.ItemManager.prototype.clearDirty = function () {
    for (var i = 0; i < this._dirtySlots.length; i++) {
      this._dirtySlots[i] = false;
    }
  };

  /**
   * getDirtySlots — gets an array of dirty slot indices.
   * @returns {number[]} Array of dirty slot indices.
   */
  Donkeycraft.ItemManager.prototype.getDirtySlots = function () {
    var result = [];
    for (var i = 0; i < this._dirtySlots.length; i++) {
      if (this._dirtySlots[i]) result.push(i);
    }
    return result;
  };

  // ============================================================
  // Utility
  // ============================================================

  /**
   * getCount — gets the total count of a specific item ID across all slots.
   * @param {number} itemId - Item ID to count.
   * @returns {number} Total count.
   */
  Donkeycraft.ItemManager.prototype.getCount = function (itemId) {
    var total = 0;
    for (var i = 0; i < this._inventory.length; i++) {
      var stack = this._inventory[i];
      if (stack && stack.getItemId() === itemId) {
        total += stack.getCount();
      }
    }
    return total;
  };

  /**
   * hasItem — checks if the inventory contains a specific item.
   * @param {number} itemId - Item ID to check.
   * @param {number} [requiredCount=1] - Minimum count required.
   * @returns {boolean}
   */
  Donkeycraft.ItemManager.prototype.hasItem = function (itemId, requiredCount) {
    requiredCount = requiredCount || 1;
    var total = 0;
    for (var i = 0; i < this._inventory.length; i++) {
      var stack = this._inventory[i];
      if (stack && stack.getItemId() === itemId) {
        total += stack.getCount();
        if (total >= requiredCount) return true;
      }
    }
    return false;
  };

  /**
   * getSlotCount — gets the total number of slots in this inventory.
   * @returns {number} Total slot count (41 for player inventory).
   */
  Donkeycraft.ItemManager.prototype.getSlotCount = function () {
    return this._inventory.length;
  };

  /**
   * destroy — cleans up all references.
   */
  Donkeycraft.ItemManager.prototype.destroy = function () {
    this._inventory = null;
    this._dirtySlots = null;
    this._player = null;
    this._cleanupFns = null;
  };
})();
