// Donkeycraft — Crafting Grid
// 3×3 crafting table GUI with recipe matching and result output.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * CraftingGrid — manages the 3×3 crafting grid and result slot.
     * @param {HTMLElement} [container] - DOM container for the crafting grid.
     * @param {Donkeycraft.RecipeRegistry} [recipeRegistry] - RecipeRegistry instance for matching recipes.
     */
    Donkeycraft.CraftingGrid = function (container, recipeRegistry) {
        this._container = container || null;
        // Only fall back to global RecipeRegistry when recipeRegistry is undefined (not provided).
        // When explicitly passed as null, honor that as "no registry".
        this._recipeRegistry = (recipeRegistry !== undefined) ? recipeRegistry : (Donkeycraft.RecipeRegistry || null);

        // 3×3 ingredient grid (flat array of 9 ItemStacks)
        this._grid = [];
        for (var i = 0; i < 9; i++) {
            this._grid[i] = null;
        }

        // Result slot
        this._resultStack = null;

        // Listeners
        this._listeners = {
            onResultChange: []
        };

        // DOM elements
        this._gridElements = [];
        this._resultElement = null;

        // Build DOM if container provided
        if (this._container) {
            this._buildDOM();
        }
    };

    /**
     * _buildDOM — creates the crafting grid and result slot elements.
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._buildDOM = function () {
        var self = this;
        this._container.className = 'dk-crafting-grid';
        this._container.style.cssText = 'display: flex; align-items: center; gap: 16px; padding: 16px; background: rgba(30,30,30,0.95); border-radius: 6px;';

        // Grid container
        var gridDiv = document.createElement('div');
        gridDiv.style.cssText = 'display: grid; grid-template-columns: repeat(3, 48px); grid-template-rows: repeat(3, 48px); gap: 2px;';

        for (var i = 0; i < 9; i++) {
            var slotEl = document.createElement('div');
            slotEl.className = 'dk-crafting-slot';
            slotEl.style.cssText = 'width: 48px; height: 48px; background: rgba(100,100,100,0.6); border: 2px solid #555; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer;';
            slotEl.dataset.slotIndex = i;

            var itemEl = document.createElement('span');
            itemEl.className = 'dk-slot-item';
            slotEl.appendChild(itemEl);

            slotEl.addEventListener('mousedown', (function (idx) {
                return function () { self._onSlotClick(idx); };
            })(i));

            this._gridElements.push(slotEl);
            gridDiv.appendChild(slotEl);
        }

        // Arrow between grid and result
        var arrow = document.createElement('div');
        arrow.style.cssText = 'font-size: 24px; color: #aaa;';
        arrow.textContent = '→';

        // Result slot
        this._resultElement = document.createElement('div');
        this._resultElement.className = 'dk-crafting-result';
        this._resultElement.style.cssText = 'width: 56px; height: 56px; background: rgba(80,80,80,0.8); border: 2px solid #888; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 28px; cursor: pointer;';
        this._resultElement.innerHTML = '<span class="dk-slot-item"></span>';

        this._resultElement.addEventListener('mousedown', (function () {
            return function () { self._onResultClick(); };
        })());

        this._container.appendChild(gridDiv);
        this._container.appendChild(arrow);
        this._container.appendChild(this._resultElement);
    };

    /**
     * _onSlotClick — handles clicking a grid slot.
     * Emits a 'slot:click' event with the slot index and current stack.
     * @param {number} index - Slot index (0-8).
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._onSlotClick = function (index) {
        if (index < 0 || index >= 9) return;

        var stack = this._grid[index];
        // Emit slot click event for external handlers (drag-drop, item picker)
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emit('crafting:slotClick', { index: index, stack: stack });
            } catch (e) { /* EventBus not available */ }
        }
    };

    /**
     * _onResultClick — handles clicking the result slot (take result).
     * Emits 'resultChange' events for all listeners with the taken result stack.
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._onResultClick = function () {
        if (this._resultStack && !this._resultStack.isEmpty()) {
            var result = this.takeResult();
            // Emit event for listeners — pass only the stack, not an action type
            if (this._listeners.onResultChange) {
                for (var i = 0; i < this._listeners.onResultChange.length; i++) {
                    try { this._listeners.onResultChange[i](result); } catch (e) { }
                }
            }
        }
    };

    /**
     * getGrid — gets the 3×3 ingredient grid as a flat array.
     * @returns {Array} Array of 9 ItemStack|null.
     */
    Donkeycraft.CraftingGrid.prototype.getGrid = function () {
        return this._grid.slice();
    };

    /**
     * getGridAs2D — gets the ingredient grid as a 3×3 2D array (block IDs).
     * Empty slots contain 0.
     * @returns {number[][]} 3×3 array of block IDs (0 for empty).
     */
    Donkeycraft.CraftingGrid.prototype.getGridAs2D = function () {
        var grid2D = [];
        for (var r = 0; r < 3; r++) {
            grid2D[r] = [];
            for (var c = 0; c < 3; c++) {
                var slot = this._grid[r * 3 + c];
                grid2D[r][c] = slot && !slot.isEmpty() ? slot.getItemId() : 0;
            }
        }
        return grid2D;
    };

    /**
     * _isValidStack — checks if a value is a valid ItemStack or null.
     * @param {*} val - Value to check.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._isValidStack = function (val) {
        if (val === null) return true;
        if (typeof val !== 'object') return false;
        return typeof val.isEmpty === 'function' &&
            typeof val.getItemId === 'function' &&
            typeof val.getCount === 'function';
    };

    /**
     * setGridSlot — sets an ingredient in a grid slot with input validation.
     * If the stack is not null, it is cloned to prevent external mutation.
     * Emits 'resultChange' events for each listener with the result stack after updating.
     * @param {number} index - Grid slot index (0-8).
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {{oldStack: Donkeycraft.ItemStack|null, newStack: Donkeycraft.ItemStack|null}}
     *   Object containing the old and new stack values, or null on validation failure.
     */
    Donkeycraft.CraftingGrid.prototype.setGridSlot = function (index, stack) {
        if (index < 0 || index >= 9) return null;
        if (!this._isValidStack(stack)) return null;

        var oldStack = this._grid[index];

        // Clone the stack to prevent external mutation of grid state
        if (stack !== null && !stack.isEmpty()) {
            try {
                stack = stack.clone();
            } catch (e) {
                return null;
            }
        } else {
            stack = null;
        }

        this._grid[index] = stack;
        this._updateGridDisplay();
        this._tryMatchRecipe(true);
        return { oldStack: oldStack, newStack: stack };
    };

    /**
     * clearGrid — clears all ingredient slots and result.
     * Emits a single 'resultChange' event per listener with null to signal clearing.
     */
    Donkeycraft.CraftingGrid.prototype.clearGrid = function () {
        // Clear result and emit one event per listener
        if (this._resultStack && this._listeners.onResultChange) {
            this._resultStack = null;
            for (var i = 0; i < this._listeners.onResultChange.length; i++) {
                try { this._listeners.onResultChange[i](null); } catch (e) { }
            }
        }

        // Clear all grid slots
        for (var j = 0; j < 9; j++) {
            this._grid[j] = null;
        }

        this._updateGridDisplay();
        this._updateResultDisplay();
    };

    /**
     * getResultStack — gets the current crafted result.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.CraftingGrid.prototype.getResultStack = function () {
        if (!this._resultStack || this._resultStack.isEmpty()) return null;
        return this._resultStack;
    };

    /**
     * matchRecipe — attempts to match the current grid against registered recipes.
     * Checks both shaped and shapeless recipes.
     * @returns {Donkeycraft.Recipe|null} The first matching recipe, or null.
     */
    Donkeycraft.CraftingGrid.prototype.matchRecipe = function () {
        if (!this._recipeRegistry) return null;

        var grid2D = this.getGridAs2D();

        // Quick check: skip if grid is entirely empty
        var hasItems = false;
        for (var r = 0; r < 3 && !hasItems; r++) {
            for (var c = 0; c < 3 && !hasItems; c++) {
                if (grid2D[r][c] !== 0) hasItems = true;
            }
        }
        if (!hasItems) return null;

        try {
            // First try shaped recipes (3×3 grid)
            var shapedResult = this._recipeRegistry.matchShapedRecipe(grid2D, 3, 3);
            if (shapedResult) return shapedResult;

            // Then try shapeless recipes by converting grid to item counts
            var itemCounts = {};
            for (var r2 = 0; r2 < 3; r2++) {
                for (var c2 = 0; c2 < 3; c2++) {
                    var blockId = grid2D[r2][c2];
                    if (blockId !== 0) {
                        itemCounts[blockId] = (itemCounts[blockId] || 0) + 1;
                    }
                }
            }

            return this._recipeRegistry.matchShapelessRecipe(itemCounts);
        } catch (e) {
            if (Donkeycraft.Logger) Donkeycraft.Logger.error('CraftingGrid: Recipe matching failed: ' + e.message);
            return null;
        }
    };

    /**
     * _tryMatchRecipe — tries to match the current grid and update result.
     * Always recalculates the recipe match regardless of gridChanged flag,
     * ensuring robustness when called from external sources.
     * @param {boolean} [gridChanged=true] - Whether the grid was modified (unused but kept for API).
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._tryMatchRecipe = function (gridChanged) {
        // Guard: ensure recipe registry exists and has required methods
        if (!this._recipeRegistry ||
            typeof this._recipeRegistry.matchShapedRecipe !== 'function' ||
            typeof this._recipeRegistry.matchShapelessRecipe !== 'function') {
            // No valid registry — clear result
            this._resultStack = null;
            this._updateResultDisplay();
            return;
        }

        // Always recalculate to ensure correctness
        var recipe = this.matchRecipe();
        if (recipe) {
            try {
                this._resultStack = new Donkeycraft.ItemStack(
                    recipe.outputBlockId,
                    recipe.outputCount || 1,
                    null
                );
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('CraftingGrid: Failed to create result ItemStack: ' + e.message);
                this._resultStack = null;
            }
        } else {
            this._resultStack = null;
        }

        this._updateResultDisplay();

        // Emit result change event
        if (this._listeners.onResultChange) {
            for (var i = 0; i < this._listeners.onResultChange.length; i++) {
                try { this._listeners.onResultChange[i](this._resultStack); } catch (e) { }
            }
        }
    };

    /**
     * isMatchValid — checks if the current grid matches any recipe.
     * @returns {boolean}
     */
    Donkeycraft.CraftingGrid.prototype.isMatchValid = function () {
        return this._resultStack !== null && !this._resultStack.isEmpty();
    };

    /**
     * takeResult — takes the result item and clears the result slot.
     * @returns {Donkeycraft.ItemStack|null} The result stack, or null if none.
     */
    Donkeycraft.CraftingGrid.prototype.takeResult = function () {
        if (!this._resultStack || this._resultStack.isEmpty()) return null;

        var result = this._resultStack.clone();
        this._resultStack = null;
        this._updateResultDisplay();
        return result;
    };

    /**
     * _updateGridDisplay — updates the DOM display for all grid slots.
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._updateGridDisplay = function () {
        for (var i = 0; i < 9 && i < this._gridElements.length; i++) {
            var slotEl = this._gridElements[i];
            var itemEl = slotEl.querySelector('.dk-slot-item');
            if (!itemEl) continue;

            var stack = this._grid[i];
            if (!stack || stack.isEmpty()) {
                itemEl.textContent = '';
            } else {
                itemEl.textContent = this._getItemDisplayChar(stack.getItemId());
            }
        }
    };

    /**
     * _updateResultDisplay — updates the DOM display for the result slot.
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._updateResultDisplay = function () {
        if (!this._resultElement) return;
        var itemEl = this._resultElement.querySelector('.dk-slot-item');
        if (!itemEl) return;

        if (this._resultStack && !this._resultStack.isEmpty()) {
            itemEl.textContent = this._getItemDisplayChar(this._resultStack.getItemId());
            this._resultElement.style.borderColor = '#4a9';
        } else {
            itemEl.textContent = '';
            this._resultElement.style.borderColor = '#888';
        }
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * Used only in test environments; production uses texture-based slot rendering.
     * @param {number} itemId - Block/item ID.
     * @returns {string} Single-character display symbol, or '▪' for unknown IDs.
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._getItemDisplayChar = function (itemId) {
        if (typeof itemId !== 'number' || isNaN(itemId)) return '\u25A0';

        // Block/item → Unicode glyph mapping for visual identification.
        // Phase 19 will replace these with texture-based slot rendering.
        var displayMap = {
            1: '\u{1F9E8}',   // stone
            3: '\u{1F7EB}',   // dirt
            4: '\u{1F7E9}',   // grass_block
            5: '\u{1FAB5}',   // oak_log
            6: '\u{1F7E8}',   // oak_planks
            7: '\u{1F7EB}',   // cobblestone (fallback)
            14: '\u2B1C',      // coal
            17: '\u{1F9E0}',   // iron_ingot
            24: '\u{1FAB5}',   // oak_log (duplicate entry, safe)
            30: '\u{1F7E8}',   // sand (alias for planks in some recipes)
            45: '\u26AA',      // bedrock
            54: '\u{1F4E6}',   // crafting_table
            61: '\u{1F525}',   // furnace
            73: '\u{1F4DA}',   // bookshelf
            138: '\u{1F9E8}',   // gravel
            184: '\u{1F4DA}',   // bookshelf
            187: '\u{1F4E6}',   // chest
            191: '\u{1F525}',   // furnace (duplicate entry, safe)
            195: '\u{1F528}',   // anvil
            214: '\u{1F534}',   // obsidian
            218: '\u{1F48E}',   // diamond
            219: '\u{1F499}',   // emerald
            221: '\u{1F535}',   // gold_ingot
            226: '\u{1F538}',   // quartz
            310: '\u{1F5E3}\uFE0F', // stick
            312: '\u{1F526}',   // torch
            322: '\u{1F3AF}',   // bow
            334: '\u{1F528}',   // flint_and_steel
            373: '\u{1F3FF}',   // leather_armor
            390: '\u{1F9E0}',   // iron_ingot (duplicate entry, safe)
            402: '\u{1F9E0}',   // iron_ingot (duplicate entry, safe)
            465: '\u{1F49B}',   // lapis_lazuli
            502: '\u2744\uFE0F'  // snowball
        };
        return displayMap[itemId] || '\u25A0';
    };

    /**
     * handleKeyPress — routes keyboard input for crafting grid interactions.
     *
     * Key bindings:
     * - Escape: always passes through to GuiManager (returns false).
     * - Enter: takes the crafted result if available (returns true).
     * - Digit1-Digit9: places a selected hotbar item into the corresponding grid slot.
     *   Returns false so GuiManager can route the hotbar selection.
     *
     * @param {string} key - Key identifier (e.g., 'Escape', 'Enter', 'Digit1').
     * @param {Donkeycraft.ItemStack} [hotbarItem=null] - Optional ItemStack from the hotbar for Digit1-9 keys.
     * @returns {boolean} True if the key was consumed by this grid, false to pass through.
     */
    Donkeycraft.CraftingGrid.prototype.handleKeyPress = function (key, hotbarItem) {
        // Escape always passes through to GuiManager
        if (key === 'Escape') return false;

        // Enter to take result
        if (key === 'Enter') {
            var result = this.takeResult();
            return result !== null;
        }

        // Digit1-Digit9: place hotbar item into corresponding grid slot (left-to-right, row-major)
        var digitMatch = key.match(/^Digit(\d)$/);
        if (digitMatch) {
            var slotIndex = parseInt(digitMatch[1], 10) - 1; // 'Digit1' → 0, 'Digit9' → 8, 'Digit0' → -1
            if (slotIndex >= 0 && slotIndex < 9 && hotbarItem !== undefined) {
                // hotbarItem was explicitly provided (null or ItemStack) — consume the key and place/clear the slot
                this.setGridSlot(slotIndex, hotbarItem);
                return true;
            }
            // Digit0 (index -1 from 0-1) is out of range for a 3×3 grid but still consumed
            if (slotIndex === -1 || slotIndex >= 9) return true;
            // Other digits with invalid slot or missing hotbarItem — pass through
            return false;
        }

        return false;
    };

    /**
     * onResultChange — subscribes to result change events.
     * @param {Function} callback - Called with (resultStack) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.CraftingGrid.prototype.onResultChange = function (callback) {
        this._listeners.onResultChange.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onResultChange.indexOf(callback);
            if (idx >= 0) self._listeners.onResultChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources and removes all DOM references.
     */
    Donkeycraft.CraftingGrid.prototype.destroy = function () {
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
            this._container = null;
        }
        this._gridElements = [];
        this._resultElement = null;
        this._grid = [];
        this._resultStack = null;
        this._listeners = {};
    };

})();