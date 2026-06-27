// Donkeycraft — Anvil UI
// Anvil GUI for renaming items and combining enchanted items.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * AnvilUI — manages the anvil GUI with rename input and two input slots.
     * @param {HTMLElement} container - DOM container for the anvil UI.
     */
    Donkeycraft.AnvilUI = function(container) {
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
            onResultChange: []
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
     * _buildDOM — creates the anvil GUI DOM structure.
     * @private
     */
    Donkeycraft.AnvilUI.prototype._buildDOM = function() {
        var self = this;
        this._container.className = 'dk-anvil-ui';
        this._container.style.cssText = 'display: flex; align-items: center; gap: 16px; padding: 20px; background: rgba(35,35,45,0.95); border-radius: 6px;';

        // Left input slot
        this._leftSlotEl = document.createElement('div');
        this._leftSlotEl.className = 'dk-anvil-input';
        this._leftSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(80,70,100,0.8); border: 2px solid #665588; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px;';
        this._leftSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Item</span>';
        this._container.appendChild(this._leftSlotEl);

        // Arrow
        var arrow1 = document.createElement('div');
        arrow1.style.cssText = 'font-size: 20px; color: #aaa;';
        arrow1.textContent = '+';
        this._container.appendChild(arrow1);

        // Right input slot
        this._rightSlotEl = document.createElement('div');
        this._rightSlotEl.className = 'dk-anvil-input';
        this._rightSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(80,70,100,0.8); border: 2px solid #665588; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px;';
        this._rightSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Item</span>';
        this._container.appendChild(this._rightSlotEl);

        // Arrow
        var arrow2 = document.createElement('div');
        arrow2.style.cssText = 'font-size: 24px; color: #aaa;';
        arrow2.textContent = '→';
        this._container.appendChild(arrow2);

        // Output slot
        this._outputSlotEl = document.createElement('div');
        this._outputSlotEl.className = 'dk-anvil-output';
        this._outputSlotEl.style.cssText = 'width: 64px; height: 64px; background: rgba(80,70,100,0.8); border: 2px solid #8866aa; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 28px;';
        this._outputSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Result</span>';
        this._container.appendChild(this._outputSlotEl);

        // Right panel: rename + price
        var rightPanel = document.createElement('div');
        rightPanel.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-left: 16px;';

        // Rename input
        var renameLabel = document.createElement('div');
        renameLabel.style.cssText = 'font-size: 12px; color: #aaa;';
        renameLabel.textContent = 'Rename Item:';
        rightPanel.appendChild(renameLabel);

        this._renameInputEl = document.createElement('input');
        this._renameInputEl.type = 'text';
        this._renameInputEl.placeholder = 'New name...';
        this._renameInputEl.style.cssText = 'width: 160px; padding: 6px 8px; background: #222; border: 1px solid #555; color: #ccc; border-radius: 3px; font-size: 12px;';

        this._renameInputEl.addEventListener('input', (function() {
            return function() { self._onRenameChange(); };
        })());

        rightPanel.appendChild(this._renameInputEl);

        // Price display
        this._priceEl = document.createElement('div');
        this._priceEl.style.cssText = 'font-size: 14px; color: #4a9; font-weight: bold;';
        this._priceEl.textContent = 'Level 0';
        rightPanel.appendChild(this._priceEl);

        this._container.appendChild(rightPanel);
    };

    /**
     * _onRenameChange — handles rename text input changes.
     * @private
     */
    Donkeycraft.AnvilUI.prototype._onRenameChange = function() {
        this._renameText = this._renameInputEl.value || '';
        this._calculateResult();
    };

    /**
     * _getMaxDurability — looks up the maximum durability for an item stack.
     * Checks tag.maxDurability first, then tool system tier lookup, then falls back to defaults.
     * @param {Donkeycraft.ItemStack} stack - Item stack to look up.
     * @returns {number} Maximum durability value.
     * @private
     */
    Donkeycraft.AnvilUI.prototype._getMaxDurability = function(stack) {
        if (!stack || stack.isEmpty()) return 0;

        // Check tag for explicit maxDurability
        var tag = stack.getTag();
        if (tag && tag.maxDurability !== undefined && tag.maxDurability > 0) {
            return tag.maxDurability;
        }

        // Look up from tool system if available
        // Note: ToolRegistry.getDurability() expects a materialId (0-6), not an item block ID.
        // The fallback map below handles actual item-based lookups.
        var itemId = stack.getItemId();
        if (Donkeycraft.ToolRegistry && typeof Donkeycraft.ToolRegistry.getDurability === 'function') {
            try {
                // Try material IDs 1-6 (skip 0 = None) to find a matching durability
                for (var m = 1; m <= 6; m++) {
                    var matDur = Donkeycraft.ToolRegistry.getDurability(m);
                    if (matDur > 0) return matDur;
                }
            } catch (e) {}
        }

        // Fallback: hardcoded max durabilities by item ID
        var fallbackMap = {
            195: 250,   // wooden_pickaxe
            197: 250,   // wooden_sword
            196: 2031,  // stone_pickaxe
            198: 2031,  // stone_sword
            199: 3031,  // iron_pickaxe
            201: 3031,  // iron_sword
            202: 4031,  // gold_pickaxe
            204: 4031,  // gold_sword
            205: 1531,  // diamond_pickaxe
            207: 1531,  // diamond_sword
            310: 64,    // stick
            312: 32     // torch (placeholder)
        };
        return fallbackMap[itemId] || 100; // Default max durability
    };

    /**
     * _calculateRepairDurability — calculates the repaired durability for an item.
     * Uses average of both current durabilities + 25% of max, capped at max durability.
     * @param {Donkeycraft.ItemStack} leftStack - Left input stack.
     * @param {Donkeycraft.ItemStack} rightStack - Right input stack.
     * @returns {number} Repaired durability value.
     * @private
     */
    Donkeycraft.AnvilUI.prototype._calculateRepairDurability = function(leftStack, rightStack) {
        var leftMaxDurability = this._getMaxDurability(leftStack);
        var leftCurrentDurability = leftStack.getDurability ? leftStack.getDurability() : 0;
        var rightCurrentDurability = rightStack.getDurability ? rightStack.getDurability() : 0;

        // Calculate repaired durability: average of both current durabilities + bonus
        var repairedDurability = Math.floor((leftCurrentDurability + rightCurrentDurability) / 2 + leftMaxDurability * 0.25);
        // Cap at max durability (items can't be restored beyond original condition)
        return Math.min(repairedDurability, leftMaxDurability);
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.AnvilUI.prototype._getItemDisplayChar = function(itemId) {
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
     * _updateSlotDisplay — updates the DOM display for a specific slot.
     * @param {number} index - Slot index (0=left, 1=right, 2=output).
     * @private
     */
    Donkeycraft.AnvilUI.prototype._updateSlotDisplay = function(index) {
        var el;
        if (index === 0) el = this._leftSlotEl;
        else if (index === 1) el = this._rightSlotEl;
        else if (index === 2) el = this._outputSlotEl;
        else return;

        if (!el) return;

        var stack = this._slots[index];
        if (!stack || stack.isEmpty()) {
            var labels = ['Item', 'Item', 'Result'];
            el.innerHTML = '<span style="color:#aaa;font-size:11px;">' + (labels[index] || '') + '</span>';
        } else {
            el.textContent = this._getItemDisplayChar(stack.getItemId());
        }
    };

    /**
     * _calculateResult — calculates the output based on inputs and rename text.
     * @private
     */
    Donkeycraft.AnvilUI.prototype._calculateResult = function() {
        var left = this._slots[0];
        var right = this._slots[1];

        // If no left item, no result
        if (!left || left.isEmpty()) {
            this._resultStack = null;
            this._price = 0;
            this._updateSlotDisplay(2);
            this._priceEl.textContent = 'Level 0';
            return;
        }

        var hasRename = this._renameText && this._renameText.trim().length > 0;

        // If both items are the same type, combine them (repair/merge)
        if (right && right.getItemId() === left.getItemId()) {
            var combined = left.clone();

            // Merge enchantments from right to left first
            var rightEnchants = right.getEnchantments();
            if (rightEnchants && rightEnchants.length > 0) {
                for (var e = 0; e < rightEnchants.length; e++) {
                    combined.addEnchantment(rightEnchants[e].id, rightEnchants[e].level);
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

            // Price based on enchantment levels and previous anvil uses
            var totalEnchantLevel = 0;
            if (rightEnchants) {
                for (var e2 = 0; e2 < rightEnchants.length; e2++) {
                    totalEnchantLevel += rightEnchants[e2].level;
                }
            }
            this._price = Math.max(1, Math.min(39, totalEnchantLevel > 0 ? totalEnchantLevel : 1));
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
                try { this._listeners.onResultChange[i](this._resultStack); } catch (e) {}
            }
        }
    };

    /**
     * getLeftSlot — gets the left input slot content.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.AnvilUI.prototype.getLeftSlot = function() {
        return this._slots[0];
    };

    /**
     * getRightSlot — gets the right input slot content.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.AnvilUI.prototype.getRightSlot = function() {
        return this._slots[1];
    };

    /**
     * getResultSlot — gets the output/result slot content.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.AnvilUI.prototype.getResultSlot = function() {
        return this._resultStack;
    };

    /**
     * _isValidStack — checks if a value is a valid ItemStack or null.
     * @param {*} val - Value to check.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.AnvilUI.prototype._isValidStack = function(val) {
        return val === null || (val !== null && typeof val.isEmpty === 'function' && typeof val.getItemId === 'function');
    };

    /**
     * setLeftSlot — sets the left input slot.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {boolean} True if successful.
     */
    Donkeycraft.AnvilUI.prototype.setLeftSlot = function(stack) {
        if (!this._isValidStack(stack)) return false;
        var oldStack = this._slots[0];
        this._slots[0] = stack;
        this._updateSlotDisplay(0);
        this._calculateResult();
        return true;
    };

    /**
     * setRightSlot — sets the right input slot.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {boolean} True if successful.
     */
    Donkeycraft.AnvilUI.prototype.setRightSlot = function(stack) {
        if (!this._isValidStack(stack)) return false;
        var oldStack = this._slots[1];
        this._slots[1] = stack;
        this._updateSlotDisplay(1);
        this._calculateResult();
        return true;
    };

    /**
     * getRenameText — gets the current rename text.
     * @returns {string}
     */
    Donkeycraft.AnvilUI.prototype.getRenameText = function() {
        return this._renameText;
    };

    /**
     * setRenameText — sets the rename text with input validation.
     * @param {string} text - New rename text.
     * @returns {boolean} True if successful.
     */
    Donkeycraft.AnvilUI.prototype.setRenameText = function(text) {
        if (typeof text !== 'string') return false;
        this._renameText = text;
        if (this._renameInputEl) {
            this._renameInputEl.value = this._renameText;
        }
        this._calculateResult();
        return true;
    };

    /**
     * getPrice — gets the XP level cost.
     * @returns {number}
     */
    Donkeycraft.AnvilUI.prototype.getPrice = function() {
        return this._price;
    };

    /**
     * calculateResult — recalculates the output based on current inputs.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.AnvilUI.prototype.calculateResult = function() {
        this._calculateResult();
        return this._resultStack;
    };

    /**
     * takeResult — takes the result item and clears the output slot.
     * @returns {Donkeycraft.ItemStack|null} The result stack, or null if none.
     */
    Donkeycraft.AnvilUI.prototype.takeResult = function() {
        if (!this._resultStack || this._resultStack.isEmpty()) return null;

        var result = this._resultStack.clone();
        this._resultStack = null;
        this._updateSlotDisplay(2);
        return result;
    };

    /**
     * handleKeyPress — routes keyboard input for anvil interactions.
     * Supports 'Enter' to accept the result, and 'Escape' to close.
     * @param {string} key - Key identifier (e.g., 'Escape', 'Enter').
     * @returns {boolean} True if the key was consumed.
     */
    Donkeycraft.AnvilUI.prototype.handleKeyPress = function(key) {
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
    Donkeycraft.AnvilUI.prototype.onResultChange = function(callback) {
        this._listeners.onResultChange.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onResultChange.indexOf(callback);
            if (idx >= 0) self._listeners.onResultChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.AnvilUI.prototype.destroy = function() {
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._slots = [];
        this._resultStack = null;
        this._listeners = {};
    };

})();