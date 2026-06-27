// Donkeycraft — Crafting Grid
// 3×3 crafting table GUI with recipe matching and result output.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * CraftingGrid — manages the 3×3 crafting grid and result slot.
     * @param {HTMLElement} container - DOM container for the crafting grid.
     * @param {Object} [recipeRegistry=null] - RecipeRegistry instance for matching recipes.
     */
    Donkeycraft.CraftingGrid = function(container, recipeRegistry) {
        this._container = container || null;
        this._recipeRegistry = recipeRegistry || (Donkeycraft.RecipeRegistry || null);

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
    Donkeycraft.CraftingGrid.prototype._buildDOM = function() {
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

            slotEl.addEventListener('mousedown', (function(idx) {
                return function() { self._onSlotClick(idx); };
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

        this._resultElement.addEventListener('mousedown', (function() {
            return function() { self._onResultClick(); };
        })());

        this._container.appendChild(gridDiv);
        this._container.appendChild(arrow);
        this._container.appendChild(this._resultElement);
    };

    /**
     * _onSlotClick — handles clicking a grid slot.
     * @param {number} index - Slot index (0-8).
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._onSlotClick = function(index) {
        // In the full game, this would open a drag source or item picker
        // For now, it's a no-op placeholder for Phase 20+ integration
    };

    /**
     * _onResultClick — handles clicking the result slot (take result).
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._onResultClick = function() {
        if (this._resultStack && !this._resultStack.isEmpty()) {
            // Emit event for the game to handle taking the item
            if (this._listeners.onResultChange) {
                for (var i = 0; i < this._listeners.onResultChange.length; i++) {
                    try { this._listeners.onResultChange[i]('take', this._resultStack); } catch (e) {}
                }
            }
        }
    };

    /**
     * getGrid — gets the 3×3 ingredient grid as a flat array.
     * @returns {Array} Array of 9 ItemStack|null.
     */
    Donkeycraft.CraftingGrid.prototype.getGrid = function() {
        return this._grid.slice();
    };

    /**
     * getGridAs2D — gets the ingredient grid as a 3×3 2D array (block IDs).
     * @returns {number[][]} 3×3 array of block IDs (0 for empty).
     */
    Donkeycraft.CraftingGrid.prototype.getGridAs2D = function() {
        var grid2D = [];
        for (var r = 0; r < 3; r++) {
            grid2D[r] = [];
            for (var c = 0; c < 3; c++) {
                var slot = this._grid[r * 3 + c];
                grid2D[r][c] = slot ? slot.getItemId() : 0;
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
    Donkeycraft.CraftingGrid.prototype._isValidStack = function(val) {
        return val === null || (val !== null && typeof val.isEmpty === 'function' && typeof val.getItemId === 'function');
    };

    /**
     * setGridSlot — sets an ingredient in a grid slot with input validation.
     * @param {number} index - Grid slot index (0-8).
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {boolean} True if successful.
     */
    Donkeycraft.CraftingGrid.prototype.setGridSlot = function(index, stack) {
        if (index < 0 || index >= 9) return false;
        if (!this._isValidStack(stack)) return false;
        var oldStack = this._grid[index];
        this._grid[index] = stack;
        this._updateGridDisplay();
        this._tryMatchRecipe(oldStack !== stack);
    };

    /**
     * clearGrid — clears all ingredient slots.
     */
    Donkeycraft.CraftingGrid.prototype.clearGrid = function() {
        for (var i = 0; i < 9; i++) {
            this._grid[i] = null;
        }
        this._resultStack = null;
        this._updateGridDisplay();
        this._updateResultDisplay();
    };

    /**
     * getResultStack — gets the current crafted result.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.CraftingGrid.prototype.getResultStack = function() {
        if (!this._resultStack || this._resultStack.isEmpty()) return null;
        return this._resultStack;
    };

    /**
     * matchRecipe — attempts to match the current grid against registered recipes.
     * Checks both shaped and shapeless recipes.
     * @returns {Donkeycraft.Recipe|null} The first matching recipe, or null.
     */
    Donkeycraft.CraftingGrid.prototype.matchRecipe = function() {
        if (!this._recipeRegistry) return null;

        var grid2D = this.getGridAs2D();
        try {
            // First try shaped recipes (3×3 grid)
            var shapedResult = this._recipeRegistry.matchShapedRecipe(grid2D, 3, 3);
            if (shapedResult) return shapedResult;

            // Then try shapeless recipes by converting grid to item counts
            var itemCounts = {};
            for (var r = 0; r < 3; r++) {
                for (var c = 0; c < 3; c++) {
                    var blockId = grid2D[r][c];
                    if (blockId !== 0) {
                        itemCounts[blockId] = (itemCounts[blockId] || 0) + 1;
                    }
                }
            }

            // Only attempt shapeless matching if at least one item is present
            var hasItems = false;
            for (var key in itemCounts) {
                if (itemCounts.hasOwnProperty(key) && itemCounts[key] > 0) {
                    hasItems = true;
                    break;
                }
            }

            if (hasItems) {
                return this._recipeRegistry.matchShapelessRecipe(itemCounts);
            }
        } catch (e) {
            if (Donkeycraft.Logger) Donkeycraft.Logger.error('CraftingGrid: Recipe matching failed: ' + e.message);
            return null;
        }

        return null;
    };

    /**
     * _tryMatchRecipe — tries to match the current grid and update result.
     * @param {boolean} [gridChanged=true] - Whether the grid was modified.
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._tryMatchRecipe = function(gridChanged) {
        // If no recipe registry, no matching possible — clear result
        if (!this._recipeRegistry) {
            this._resultStack = null;
            this._updateResultDisplay();
            return;
        }

        // Always recalculate when grid changes or on explicit call
        var recipe = this.matchRecipe();
        if (recipe) {
            this._resultStack = new Donkeycraft.ItemStack(
                recipe.outputBlockId,
                recipe.outputCount || 1,
                null
            );
        } else {
            this._resultStack = null;
        }

        this._updateResultDisplay();

        // Emit result change event
        if (this._listeners.onResultChange) {
            for (var i = 0; i < this._listeners.onResultChange.length; i++) {
                try { this._listeners.onResultChange[i](this._resultStack); } catch (e) {}
            }
        }
    };

    /**
     * isMatchValid — checks if the current grid matches any recipe.
     * @returns {boolean}
     */
    Donkeycraft.CraftingGrid.prototype.isMatchValid = function() {
        return this._resultStack !== null && !this._resultStack.isEmpty();
    };

    /**
     * takeResult — takes the result item and clears the result slot.
     * @returns {Donkeycraft.ItemStack|null} The result stack, or null if none.
     */
    Donkeycraft.CraftingGrid.prototype.takeResult = function() {
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
    Donkeycraft.CraftingGrid.prototype._updateGridDisplay = function() {
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
    Donkeycraft.CraftingGrid.prototype._updateResultDisplay = function() {
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
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.CraftingGrid.prototype._getItemDisplayChar = function(itemId) {
        // Same mapping as Hotbar — Phase 19 will replace with textures
        var displayMap = {
            1: '🪨', 3: '🟫', 4: '🟩', 5: '🪵', 6: '🟨', 7: '🟫',
            24: '🪵', 30: '🟨', 45: '🔲', 54: '📦', 61: '🔥',
            138: '🪨', 184: '📚', 187: '📦', 191: '🔥', 195: '🔨',
            214: '⚫', 218: '💎', 219: '🟢', 221: '⚪', 226: '⚪',
            310: '🥢', 312: '🔦'
        };
        return displayMap[itemId] || '▪';
    };

    /**
     * handleKeyPress — routes keyboard input for crafting grid interactions.
     * Supports 'Enter' to craft the result, and 'Escape' to close.
     * @param {string} key - Key identifier (e.g., 'Escape', 'Enter').
     * @returns {boolean} True if the key was consumed.
     */
    Donkeycraft.CraftingGrid.prototype.handleKeyPress = function(key) {
        // Escape always closes the crafting GUI
        if (key === 'Escape') return false; // Let GuiManager handle it

        // Enter to craft result
        if (key === 'Enter') {
            this.takeResult();
            return true;
        }

        return false;
    };

    /**
     * onResultChange — subscribes to result change events.
     * @param {Function} callback - Called with (resultStack) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.CraftingGrid.prototype.onResultChange = function(callback) {
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
    Donkeycraft.CraftingGrid.prototype.destroy = function() {
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._grid = [];
        this._resultStack = null;
        this._listeners = {};
    };

})();