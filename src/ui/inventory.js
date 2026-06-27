// Donkeycraft — Inventory
// Generic inventory data structure with slot management, drag/drop, and shift-click logic.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Inventory — manages a collection of item slots with drag/drop and shift-click support.
     * @param {number} slotCount - Number of slots in this inventory.
     * @param {string} [title=null] - Optional inventory title for GUI display.
     */
    Donkeycraft.Inventory = function(slotCount, title) {
        this._slotCount = slotCount || 9;
        this._slots = [];
        for (var i = 0; i < this._slotCount; i++) {
            this._slots[i] = null;
        }
        this._title = title || null;

        // Drag state
        this._dragState = null; // { sourceSlot, originalStack, dragStack, remainingCount }

        // Event listeners for UI layer integration
        this._listeners = {
            onSlotChange: [],
            onSelectedChange: []
        };
    };

    /**
     * getSlot — gets the item stack in a specific slot.
     * @param {number} index - Slot index.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.Inventory.prototype.getSlot = function(index) {
        if (index < 0 || index >= this._slotCount) return null;
        return this._slots[index];
    };

    /**
     * setSlot — sets the item stack in a specific slot.
     * @param {number} index - Slot index.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set (null to clear).
     * @returns {boolean} True if successful.
     */
    Donkeycraft.Inventory.prototype.setSlot = function(index, stack) {
        if (index < 0 || index >= this._slotCount) return false;
        var oldStack = this._slots[index];
        if (stack && stack.isEmpty()) {
            this._slots[index] = null;
        } else {
            this._slots[index] = stack;
        }
        // Emit slot change event for UI layer integration
        if (oldStack !== this._slots[index]) {
            if (this._listeners.onSlotChange) {
                for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
                    try { this._listeners.onSlotChange[i](index, this._slots[index], oldStack); } catch (e) {}
                }
            }
        }
        return true;
    };

    /**
     * clearSlot — clears a specific slot.
     * @param {number} index - Slot index.
     */
    Donkeycraft.Inventory.prototype.clearSlot = function(index) {
        if (index < 0 || index >= this._slotCount) return;
        this._slots[index] = null;
    };

    /**
     * getAllSlots — gets all slot stacks as an array.
     * @returns {Array} Array of ItemStack|null.
     */
    Donkeycraft.Inventory.prototype.getAllSlots = function() {
        return this._slots.slice();
    };

    /**
     * getSlotCount — gets the total number of slots.
     * @returns {number}
     */
    Donkeycraft.Inventory.prototype.getSlotCount = function() {
        return this._slotCount;
    };

    /**
     * getTitle — gets the inventory title.
     * @returns {string|null}
     */
    Donkeycraft.Inventory.prototype.getTitle = function() {
        return this._title;
    };

    /**
     * findEmptySlot — finds the first empty (null) slot index.
     * @returns {number} -1 if no empty slot found.
     */
    Donkeycraft.Inventory.prototype.findEmptySlot = function() {
        for (var i = 0; i < this._slotCount; i++) {
            if (this._slots[i] === null) return i;
        }
        return -1;
    };

    /**
     * addItem — tries to add a stack to the inventory.
     * Stacks into existing matching slots first, then fills empty slots.
     * @param {Donkeycraft.ItemStack} stack - Stack to add.
     * @returns {number} Number of items successfully added.
     */
    Donkeycraft.Inventory.prototype.addItem = function(stack) {
        if (!stack || stack.isEmpty()) return 0;

        var remaining = stack.getCount();

        // First, try to stack into existing matching slots
        for (var i = 0; i < this._slotCount; i++) {
            if (remaining <= 0) break;
            var slot = this._slots[i];
            if (slot && slot.canStackWith(stack)) {
                var space = 64 - slot.getCount(); // Max stack size
                if (space > 0) {
                    var add = Math.min(remaining, space);
                    slot.increment(add);
                    remaining -= add;
                }
            }
        }

        // Then fill empty slots
        for (var j = 0; j < this._slotCount && remaining > 0; j++) {
            if (this._slots[j] === null) {
                var count = Math.min(remaining, 64); // Max stack size
                this._slots[j] = new Donkeycraft.ItemStack(stack.getItemId(), count, stack.getTag() ? JSON.parse(JSON.stringify(stack.getTag())) : null);
                remaining -= count;
            }
        }

        return stack.getCount() - remaining;
    };

    /**
     * removeItem — tries to remove a stack from the inventory.
     * Removes from slots starting at index 0.
     * @param {Donkeycraft.ItemStack} stack - The stack to match (checks itemId).
     * @returns {Donkeycraft.ItemStack|null} Removed stack, or null if not found.
     */
    Donkeycraft.Inventory.prototype.removeItem = function(stack) {
        if (!stack) return null;

        var needed = stack.getCount();
        var removed = 0;
        var resultItems = [];

        // Single pass: find matching items and immediately remove them
        for (var i = 0; i < this._slotCount && removed < needed; i++) {
            var slot = this._slots[i];
            if (slot && slot.getItemId() === stack.getItemId()) {
                var take = Math.min(slot.getCount(), needed - removed);
                slot.decrement(take);
                if (slot.isEmpty()) {
                    this._slots[i] = null;
                }
                removed += take;
            }
        }

        if (removed === 0) return null;

        // Return a new stack representing what was removed
        return new Donkeycraft.ItemStack(stack.getItemId(), removed, stack.getTag());
    };

    /**
     * contains — checks if the inventory contains an item with a minimum count.
     * @param {number} itemId - Item ID to check.
     * @param {number} [count=1] - Minimum count required.
     * @returns {boolean}
     */
    Donkeycraft.Inventory.prototype.contains = function(itemId, count) {
        count = count || 1;
        var total = this.getItemCount(itemId);
        return total >= count;
    };

    /**
     * getItemCount — gets the total count of a specific item across all slots.
     * @param {number} itemId - Item ID to count.
     * @returns {number}
     */
    Donkeycraft.Inventory.prototype.getItemCount = function(itemId) {
        var total = 0;
        for (var i = 0; i < this._slotCount; i++) {
            var slot = this._slots[i];
            if (slot && slot.getItemId() === itemId) {
                total += slot.getCount();
            }
        }
        return total;
    };

    /**
     * beginDrag — starts a drag operation from a slot.
     * @param {number} slotIndex - Source slot index.
     * @returns {Object|null} Drag state object, or null if slot is empty.
     */
    Donkeycraft.Inventory.prototype.beginDrag = function(slotIndex) {
        if (slotIndex < 0 || slotIndex >= this._slotCount) return null;
        var stack = this._slots[slotIndex];
        if (!stack || stack.isEmpty()) return null;

        // Store original stack in drag state for safe cancellation
        this._dragState = {
            sourceSlot: slotIndex,
            originalStack: stack.clone(),
            dragStack: stack.clone(),
            remainingCount: stack.getCount()
        };

        // Do NOT clear the source slot — it remains until drop is confirmed or cancelled
        return this._dragState;
    };

    /**
     * endDrag — ends a drag operation and restores the source slot.
     * @param {Object} dragState - The drag state to end.
     */
    Donkeycraft.Inventory.prototype.endDrag = function(dragState) {
        if (!this._dragState) return;

        // Restore the original item to its source slot (safe cancellation)
        if (this._dragState.sourceSlot >= 0 && this._dragState.sourceSlot < this._slotCount) {
            this._slots[this._dragState.sourceSlot] = this._dragState.originalStack.clone();
        }

        this._dragState = null;
    };

    /**
     * processDrop — handles dropping an item onto a target slot during drag.
     * @param {number} sourceSlot - Source slot index (where drag started).
     * @param {number} targetSlot - Target slot index (where drop lands).
     * @returns {Donkeycraft.ItemStack|null} Remaining stack, or null if fully placed.
     */
    Donkeycraft.Inventory.prototype.processDrop = function(sourceSlot, targetSlot) {
        if (targetSlot < 0 || targetSlot >= this._slotCount) return null;
        if (!this._dragState) return null;

        var dragStack = this._dragState.dragStack;
        var target = this._slots[targetSlot];

        if (target === null) {
            // Empty slot — place entire stack
            this._slots[targetSlot] = dragStack.clone();
            this._dragState.remainingCount = 0;
            this._slots[sourceSlot] = null;
            return null;
        } else if (target.canStackWith(dragStack)) {
            // Matching slot — stack into it
            var space = 64 - target.getCount();
            if (space > 0) {
                var toPlace = Math.min(space, this._dragState.remainingCount);
                target.increment(toPlace);
                this._dragState.remainingCount -= toPlace;

                if (this._dragState.remainingCount <= 0) {
                    this._slots[sourceSlot] = null;
                    return null;
                } else {
                    // Return remaining as a new stack but keep drag active
                    var remaining = new Donkeycraft.ItemStack(dragStack.getItemId(), this._dragState.remainingCount, dragStack.getTag());
                    return remaining;
                }
            }
        }

        // Target slot is full or incompatible — keep drag state active
        // Caller can try another target slot or call endDrag() to cancel
        var remaining = new Donkeycraft.ItemStack(dragStack.getItemId(), this._dragState.remainingCount, dragStack.getTag());
        return remaining;
    };

    /**
     * shiftClick — performs a shift-click from the given slot index.
     * Moves all matching items from source to destination (or vice versa).
     * @param {number} slotIndex - Source slot index.
     * @returns {Donkeycraft.ItemStack} Remaining items that couldn't be moved, or empty stack.
     */
    Donkeycraft.Inventory.prototype.shiftClick = function(slotIndex) {
        if (slotIndex < 0 || slotIndex >= this._slotCount) {
            return new Donkeycraft.ItemStack(0, 0);
        }

        var sourceSlot = this._slots[slotIndex];
        if (!sourceSlot || sourceSlot.isEmpty()) {
            return new Donkeycraft.ItemStack(0, 0);
        }

        var itemId = sourceSlot.getItemId();
        var remaining = sourceSlot.clone();
        var moved = false;

        // Try to stack into existing slots first
        for (var i = 0; i < this._slotCount && remaining.getCount() > 0; i++) {
            if (i === slotIndex) continue;
            var target = this._slots[i];
            if (target && target.canStackWith(sourceSlot)) {
                var space = 64 - target.getCount();
                var toMove = Math.min(space, remaining.getCount());
                target.increment(toMove);
                remaining.decrement(toMove);
                moved = true;
            }
        }

        // Then move to empty slots
        for (var j = 0; j < this._slotCount && remaining.getCount() > 0; j++) {
            if (j === slotIndex) continue;
            if (this._slots[j] === null) {
                var count = Math.min(remaining.getCount(), 64);
                this._slots[j] = new Donkeycraft.ItemStack(itemId, count, sourceSlot.getTag() ? JSON.parse(JSON.stringify(sourceSlot.getTag())) : null);
                remaining.decrement(count);
                moved = true;
            }
        }

        // Clear source if all moved
        if (remaining.getCount() <= 0) {
            this._slots[slotIndex] = null;
        } else {
            this._slots[slotIndex] = remaining.clone();
        }

        return new Donkeycraft.ItemStack(0, 0);
    };

    /**
     * isDragActive — checks if a drag operation is in progress.
     * @returns {boolean}
     */
    Donkeycraft.Inventory.prototype.isDragActive = function() {
        return this._dragState !== null;
    };

    /**
     * getDragState — gets the current drag state.
     * @returns {Object|null}
     */
    Donkeycraft.Inventory.prototype.getDragState = function() {
        return this._dragState;
    };

    /**
     * serialize — serializes the inventory state to a JSON-safe object.
     * @returns {Object}
     */
    Donkeycraft.Inventory.prototype.serialize = function() {
        var slotsData = [];
        for (var i = 0; i < this._slotCount; i++) {
            var slot = this._slots[i];
            if (slot) {
                slotsData.push(slot.serialize());
            } else {
                slotsData.push(null);
            }
        }
        return {
            slots: slotsData,
            title: this._title
        };
    };

    /**
     * onSlotChange — subscribes to slot change events.
     * @param {Function} callback - Called with (slotIndex, newStack, oldStack) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Inventory.prototype.onSlotChange = function(callback) {
        this._listeners.onSlotChange.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onSlotChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSlotChange.splice(idx, 1);
        };
    };

    /**
     * deserialize — restores the inventory from a serialized object.
     * @param {Object} data - Serialized inventory data.
     */
    Donkeycraft.Inventory.prototype.deserialize = function(data) {
        if (!data || !data.slots) return;

        // Clear all slots
        for (var i = 0; i < this._slotCount; i++) {
            this._slots[i] = null;
        }

        // Restore slots
        for (var j = 0; j < data.slots.length && j < this._slotCount; j++) {
            if (data.slots[j]) {
                this._slots[j] = Donkeycraft.ItemStack.fromObject(data.slots[j]);
            }
        }

        // Restore title
        if (data.title) {
            this._title = data.title;
        }
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.Inventory.prototype.destroy = function() {
        this._slots = [];
        this._dragState = null;
        this._listeners = {};
    };

})();
