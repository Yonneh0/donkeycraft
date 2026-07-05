// Donkeycraft — Enchanting UI
// Enchanting table GUI: generates random enchantment options for items, validates XP level
// and lapis lazuli costs, applies enchantments to produce enchanted output items.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * EnchantingUI — manages the enchanting table GUI.
     * Generates random enchantment options for items placed in the input slot, validates XP level
     * and lapis lazuli costs, applies enchantments to produce enchanted output items.
     *
     * Slot model:
     *   - Input slot: item to enchant (ItemStack or null)
     *   - Output slot: enchanted result (computed, not set externally)
     *   - Lapis lazuli: count of lapis in the lapis slot (integer >= 0)
     *
     * @param {HTMLElement} [container] - Optional DOM container for rendering the GUI.
     */
    Donkeycraft.EnchantingUI = function (container) {
        this._container = container || null;

        // Input slot (item to enchant)
        this._inputSlot = null;

        // Output slot (enchanted item)
        this._outputSlot = null;

        // Lapis lazuli count
        this._lapisCount = 0;

        // Selected enchantment option (0, 1, or 2)
        this._selectedOption = 0;

        // Available enchantment options
        this._enchantOptions = [];

        // XP levels available
        this._playerLevels = 0;

        // Listeners
        this._listeners = {
            onResultChange: []
        };

        // DOM elements
        this._inputSlotEl = null;
        this._outputSlotEl = null;
        this._lapisSlotEl = null;
        this._optionEls = [];
        this._levelCostEl = null;
        this._levelsEl = null;

        // Build DOM if container provided
        if (this._container) {
            this._buildDOM();
        }
    };

    /**
     * _buildDOM — creates the enchanting table GUI DOM structure.
     * @private
     * @returns {void}
     */
    Donkeycraft.EnchantingUI.prototype._buildDOM = function () {
        var self = this;
        this._container.className = 'dk-enchanting-ui dk-interactive';

        // Left: input slot
        this._inputSlotEl = document.createElement('div');
        this._inputSlotEl.className = 'dk-enchant-input dk-interactive';
        this._inputSlotEl.innerHTML = '<span class="dk-enchant-placeholder">Item</span>';
        this._container.appendChild(this._inputSlotEl);

        // Center: enchantment options (3 cards)
        var centerPanel = document.createElement('div');
        centerPanel.className = 'dk-enchant-center-panel dk-interactive';

        for (var c = 0; c < 3; c++) {
            var optionEl = document.createElement('div');
            optionEl.className = 'dk-enchant-option dk-interactive';
            optionEl.dataset.optionIndex = c;

            var textSpan = document.createElement('span');
            textSpan.className = 'dk-enchant-option-text';
            textSpan.textContent = 'Option ' + (c + 1);
            optionEl.appendChild(textSpan);

            var costSpan = document.createElement('span');
            costSpan.className = 'dk-enchant-cost';
            costSpan.textContent = 'Level 0';
            optionEl.appendChild(costSpan);

            optionEl.addEventListener('click', (function (idx) {
                return function () { self.selectEnchantment(idx); };
            })(c));

            this._optionEls.push(optionEl);
            centerPanel.appendChild(optionEl);
        }

        this._container.appendChild(centerPanel);

        // Right: lapis + output
        var rightPanel = document.createElement('div');
        rightPanel.className = 'dk-enchant-right-panel dk-interactive';

        // Lapis slot
        this._lapisSlotEl = document.createElement('div');
        this._lapisSlotEl.className = 'dk-enchant-lapis dk-interactive';
        this._lapisSlotEl.innerHTML = '<span class="dk-enchant-placeholder">Lapis</span>';
        rightPanel.appendChild(this._lapisSlotEl);

        // Arrow
        var arrow = document.createElement('div');
        arrow.className = 'dk-enchant-arrow';
        arrow.textContent = '→';
        rightPanel.appendChild(arrow);

        // Output slot
        this._outputSlotEl = document.createElement('div');
        this._outputSlotEl.className = 'dk-enchant-output dk-interactive';
        this._outputSlotEl.innerHTML = '<span class="dk-enchant-placeholder">Result</span>';
        rightPanel.appendChild(this._outputSlotEl);

        this._container.appendChild(rightPanel);

        // Bottom panel: player levels + cost display
        var bottomPanel = document.createElement('div');
        bottomPanel.className = 'dk-enchant-bottom-panel';

        this._levelsEl = document.createElement('div');
        this._levelsEl.className = 'dk-enchant-levels-display';
        this._levelsEl.textContent = 'Levels: 0';
        bottomPanel.appendChild(this._levelsEl);

        this._levelCostEl = document.createElement('div');
        this._levelCostEl.className = 'dk-enchant-cost-display';
        this._levelCostEl.textContent = 'Cost: 0';
        bottomPanel.appendChild(this._levelCostEl);

        this._container.appendChild(bottomPanel);
    };

    /**
     * _getItemDisplayChar — gets a display character for an item/block ID.
     * Uses a lookup table of emoji/symbol characters for known IDs; returns BLACK SQUARE (▪) for unknown.
     * @param {number} itemId - Block/item ID to look up.
     * @returns {string} A single-character display string.
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._getItemDisplayChar = function (itemId) {
        // Validate itemId — return default for null, NaN, negative, or non-integer values
        if (typeof itemId !== 'number' || !Number.isInteger(itemId) || itemId <= 0 || isNaN(itemId)) {
            return '\u25A0'; // BLACK SQUARE (default placeholder)
        }

        var displayMap = {
            1: '\u25CB',    // WHITE CIRCLE — stone
            3: '\u2592',    // MEDIUM SHADE — dirt
            4: '\u25A1',    // WHITE SQUARE — grass block
            5: '\u258C',    // LEFT HALF BLOCK — wood log
            6: '\u2593',    // DARKER SHADE — sand
            7: '\u2591',    // LIGHT SHADE — gravel
            24: '\u258C',   // LEFT HALF BLOCK — planks
            30: '\u2593',   // DARKER SHADE — sand (red)
            45: '\u25A0',   // BLACK SQUARE — cobblestone wall
            54: '\u25D7',   // CIRCLE WITH VERTICAL BISECTION — chest
            61: '\u25D8',   // CIRCLE WITH HORIZONTAL BISECTION — furnace
            138: '\u25CB',  // WHITE CIRCLE — iron_ore
            187: '\u25D7',  // diamond_pickaxe (netherite)
            191: '\u25D8',  // blast_furnace
            214: '\u25CF',  // BLACK CIRCLE — coal
            218: '\u2666',  // DIAMOND — diamond
            219: '\u25AE',  // BLACK VERTICAL RECTANGLE — emerald
            220: '\u25A0',  // BLACK SQUARE — lapis_lazuli
            221: '\u25A1',  // WHITE SQUARE — gold_ingot
            222: '\u25CF',  // BLACK CIRCLE — redstone_dust
            225: '\u25D6',  // CIRCLE WITH DIAGONALS — book
            226: '\u25CB',  // WHITE CIRCLE — gold_ingot (variant)
            227: '\u2666',  // DIAMOND — emerald (variant)
            310: '\u25A4',  // VERTICAL LINE WITH LEFT TEE — stick
            312: '\u25E6'   // WHITE BULLET — torch
        };

        return displayMap[itemId] || '\u2597'; // BOX DRAWINGS LIGHT VERTICAL AND LEFT (fallback)
    };

    /**
     * _updateSlotDisplay — updates the DOM display for a named slot.
     * Handles input, output, and lapis lazuli slots with appropriate visual feedback.
     * @param {string} slotName - Slot name ('input', 'output', 'lapis').
     * @returns {void}
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._updateSlotDisplay = function (slotName) {
        if (!this._container) return;

        var el, stack;
        switch (slotName) {
            case 'input':
                this._inputSlotEl = this._inputSlotEl || this._container.querySelector('.dk-enchant-input');
                el = this._inputSlotEl;
                stack = this._inputSlot;
                break;
            case 'output':
                this._outputSlotEl = this._outputSlotEl || this._container.querySelector('.dk-enchant-output');
                el = this._outputSlotEl;
                stack = this._outputSlot;
                break;
            case 'lapis':
                this._lapisSlotEl = this._lapisSlotEl || this._container.querySelector('.dk-enchant-lapis');
                el = this._lapisSlotEl;
                break;
            default:
                return;
        }

        if (!el) return;

        if (slotName === 'lapis') {
            // Lapis count display
            if (this._lapisCount > 0) {
                el.textContent = '\u25CF\u00D7' + this._lapisCount; // BLACK CIRCLE × N
            } else {
                el.innerHTML = '<span style="color:#aaa;font-size:11px;">Lapis</span>';
            }
        } else {
            // Input/output slot display
            if (!stack || stack.isEmpty()) {
                var labels = { input: 'Item', output: 'Result' };
                el.innerHTML = '<span style="color:#aaa;font-size:11px;">' + (labels[slotName] || '') + '</span>';
            } else {
                el.textContent = this._getItemDisplayChar(stack.getItemId());
            }
        }
    };

    /**
     * _updateOptionDisplay — updates all three enchantment option card DOM elements.
     * Sets text, cost color, and border highlight based on current state.
     * @returns {void}
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._updateOptionDisplay = function () {
        for (var i = 0; i < 3; i++) {
            var optEl = this._optionEls[i];
            if (!optEl) continue;

            var opt = this._enchantOptions[i] || null;
            var textSpan = optEl.querySelector('.dk-enchant-option-text');
            var costSpan = optEl.querySelector('.dk-enchant-cost');

            if (textSpan) {
                if (opt) {
                    textSpan.textContent = opt.name || ('Enchantment ' + (i + 1));
                } else {
                    textSpan.textContent = '—';
                }
            }

            if (costSpan) {
                if (opt) {
                    costSpan.textContent = 'Level ' + opt.cost;
                    costSpan.style.color = (this._playerLevels >= opt.cost) ? '#4a9' : '#f84';
                } else {
                    costSpan.textContent = '—';
                    costSpan.style.color = '#666';
                }
            }

            // Highlight selected option
            if (i === this._selectedOption && opt) {
                optEl.style.borderColor = '#9977cc';
            } else {
                optEl.style.borderColor = '#554466';
            }
        }
    };

    /**
     * _updateCostDisplay — updates the bottom-panel level cost display.
     * Color changes to green (#4a9) if player has enough levels, red (#f84) otherwise.
     * @returns {void}
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._updateCostDisplay = function () {
        // Guard: skip if DOM elements not built (no container provided)
        if (!this._levelCostEl) return;

        var opt = this._enchantOptions[this._selectedOption] || null;
        var cost = opt ? opt.cost : 0;
        this._levelCostEl.textContent = 'Cost: ' + cost;
        this._levelCostEl.style.color = (this._playerLevels >= cost) ? '#4a9' : '#f84';
    };

    /**
     * _applyEnchantment — computes the enchanted output based on input item, selected enchantment option,
     * player levels, and lapis lazuli count. Updates the output slot and DOM display.
     * Emits onResultChange events when the output changes.
     * @returns {void}
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._applyEnchantment = function () {
        // Clear previous result before attempting to regenerate
        var hadOutput = this._outputSlot && !this._outputSlot.isEmpty();

        if (!this._inputSlot || this._inputSlot.isEmpty()) {
            this._outputSlot = null;
            if (hadOutput) this._updateSlotDisplay('output');
            return;
        }

        var opt = this._enchantOptions[this._selectedOption] || null;
        if (!opt) {
            this._outputSlot = null;
            if (hadOutput) this._updateSlotDisplay('output');
            return;
        }

        // Check XP level cost requirement
        if (this._playerLevels < opt.cost) {
            this._outputSlot = null;
            if (hadOutput) this._updateSlotDisplay('output');
            return;
        }

        // Check lapis lazuli requirement
        if (this._lapisCount < (opt.lapisCost || 1)) {
            this._outputSlot = null;
            if (hadOutput) this._updateSlotDisplay('output');
            return;
        }

        // Apply enchantment to input item via deep clone
        var result = this._inputSlot.clone();
        try {
            result.addEnchantment(opt.id, opt.level);
        } catch (e) {
            // If enchantment application fails, clear output
            this._outputSlot = null;
            if (hadOutput) this._updateSlotDisplay('output');
            return;
        }

        this._outputSlot = result;

        // Update slot display
        this._updateSlotDisplay('output');

        // Emit result change event
        if (this._listeners.onResultChange) {
            for (var i = 0; i < this._listeners.onResultChange.length; i++) {
                try { this._listeners.onResultChange[i](this._outputSlot); } catch (e) { }
            }
        }
    };

    /**
     * getInputSlot — gets the input slot content.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.EnchantingUI.prototype.getInputSlot = function () {
        return this._inputSlot;
    };

    /**
     * _isValidStack — checks if a value is a valid ItemStack instance or null.
     * Validates that the object has all required ItemStack methods and a non-zero count.
     * @param {*} val - Value to check.
     * @returns {boolean} True if the value is null or a valid ItemStack with count > 0.
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._isValidStack = function (val) {
        if (val === null) return true;
        if (!val || typeof val !== 'object') return false;
        // Must have all required ItemStack methods
        if (typeof val.isEmpty !== 'function') return false;
        if (typeof val.getItemId !== 'function') return false;
        if (typeof val.getCount !== 'function') return false;
        // Non-empty stacks must have count > 0
        if (!val.isEmpty() && val.getCount && val.getCount() <= 0) return false;
        return true;
    };

    /**
     * setInputSlot — sets the input slot with input validation.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {boolean} True if successful.
     */
    Donkeycraft.EnchantingUI.prototype.setInputSlot = function (stack) {
        if (!this._isValidStack(stack)) return false;
        var oldStack = this._inputSlot;
        this._inputSlot = stack;
        this._updateSlotDisplay('input');
        this._generateEnchantmentOptions();
        this._applyEnchantment();
        return true;
    };

    /**
     * getAvailableEnchantments — gets the current enchantment options.
     * @returns {Array} Array of {id, name, level, cost, lapisCost} objects.
     */
    Donkeycraft.EnchantingUI.prototype.getAvailableEnchantments = function () {
        return this._enchantOptions.slice();
    };

    /**
     * _generateEnchantmentOptions — generates 3 random enchantment options for the input item.
     * Uses EnchantmentRegistry to dynamically select valid enchantments based on the item type.
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._generateEnchantmentOptions = function () {
        if (!this._inputSlot || this._inputSlot.isEmpty()) {
            this._enchantOptions = [];
            this._updateOptionDisplay();
            this._updateCostDisplay();
            return;
        }

        // Determine which slot the item belongs to using EnchantmentRegistry.canApplyToItem()
        var itemBlockId = this._inputSlot.getItemId ? this._inputSlot.getItemId() : 0;

        // Get all registered enchantments and filter by item compatibility
        var registry = Donkeycraft.EnchantmentRegistry;
        var pool = [];

        if (registry) {
            // Iterate over all registered enchantment IDs and check compatibility with the item
            var allEnchants = registry.getAllEnchantments();
            for (var e = 0; e < allEnchants.length; e++) {
                try {
                    if (registry.canApplyToItem(itemBlockId, allEnchants[e].id)) {
                        pool.push(allEnchants[e]);
                    }
                } catch (err) {
                    // Skip enchantments that throw during compatibility check
                }
            }
        }

        // If no registry or empty pool, fall back to a minimal static set.
        // Must contain at least 3 entries so we can always generate 3 unique options.
        // IMPORTANT: Fallback enchantments are pre-approved for universal use — skip canApplyToItem check
        // because _getItemCategory() may not recognize all custom/legacy item IDs.
        if (!registry || pool.length === 0) {
            var fallbackEnchants = [
                { id: 1, name: 'Sharpness', maxLevel: 5, weight: 10 },   // weapon — melee damage
                { id: 2, name: 'Smite', maxLevel: 5, weight: 5 },       // weapon — undead bonus
                { id: 4, name: 'Protection', maxLevel: 4, weight: 10 }, // armor — general damage reduction
                { id: 11, name: 'Unbreaking', maxLevel: 3, weight: 10 } // both — durability
            ];
            if (!registry) {
                // No registry at all — use fallback enchantments directly as pool objects
                for (var f = 0; f < fallbackEnchants.length; f++) {
                    pool.push({
                        id: fallbackEnchants[f].id,
                        name: fallbackEnchants[f].name,
                        maxLevel: fallbackEnchants[f].maxLevel,
                        weight: fallbackEnchants[f].weight
                    });
                }
            } else {
                // Registry exists but canApplyToItem rejected everything — add fallback enchantment IDs
                // directly to pool so they bypass the compatibility check
                for (var f2 = 0; f2 < fallbackEnchants.length; f2++) {
                    pool.push(fallbackEnchants[f2]);
                }
            }
        }

        // Pick 3 random unique enchantments (or fewer if pool is small)
        this._enchantOptions = [];
        var usedIds = {};
        var maxAttempts = pool.length * 3;
        var attempts = 0;

        while (this._enchantOptions.length < 3 && attempts < maxAttempts) {
            attempts++;
            var idx = Math.floor(Math.random() * pool.length);
            var enchant = pool[idx];

            // Skip if already selected
            if (usedIds[enchant.id]) continue;
            usedIds[enchant.id] = true;

            // Pick a random valid level for this enchantment
            var maxLvl = enchant.maxLevel || 1;
            var randomLevel = Math.floor(Math.random() * maxLvl) + 1;

            // Calculate cost using registry formula (vanilla: level^2 for basic enchantments)
            var baseCost = registry.calculateLevelCost ? registry.calculateLevelCost(enchant.id, randomLevel) : randomLevel;

            // Apply option position multiplier: first option is cheapest (1x), second is 1.5x, third is 2x
            // This mirrors vanilla Minecraft's enchanting table behavior where later options cost more
            var positionMultiplier = [1, 1.5, 2][this._enchantOptions.length];
            var cost = Math.ceil(baseCost * positionMultiplier);

            // Ensure costs are strictly increasing across options
            if (this._enchantOptions.length > 0 && cost <= this._enchantOptions[this._enchantOptions.length - 1].cost) {
                cost = this._enchantOptions[this._enchantOptions.length - 1].cost + 1;
            }

            this._enchantOptions.push({
                id: enchant.id,
                name: enchant.name,
                level: randomLevel,
                cost: cost,
                lapisCost: 1 + this._enchantOptions.length
            });
        }

        this._updateOptionDisplay();
        this._updateCostDisplay();
    };

    /**
     * selectEnchantment — selects an enchantment option by index and recomputes output.
     * @param {number} index - Option index (0, 1, or 2).
     * @returns {void}
     */
    Donkeycraft.EnchantingUI.prototype.selectEnchantment = function (index) {
        if (index < 0 || index >= 3) return;
        this._selectedOption = index;

        this._updateOptionDisplay();
        this._updateCostDisplay();
        this._applyEnchantment();
    };

    /**
     * getLevelCost — gets the XP level cost for the currently selected enchantment.
     * @returns {number}
     */
    Donkeycraft.EnchantingUI.prototype.getLevelCost = function () {
        var opt = this._enchantOptions[this._selectedOption] || null;
        return opt ? opt.cost : 0;
    };

    /**
     * applyEnchantment — applies the selected enchantment to the input item.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.EnchantingUI.prototype.applyEnchantment = function () {
        this._applyEnchantment();
        return this._outputSlot;
    };

    /**
     * takeResult — takes the enchanted output item.
     * Returns cost info for the game to deduct from player state (does not modify directly).
     * @returns {Object|null} Object with {item, levelCost, lapisCost}, or null if no result.
     */
    Donkeycraft.EnchantingUI.prototype.takeResult = function () {
        if (!this._outputSlot || this._outputSlot.isEmpty()) return null;

        var result = this._outputSlot.clone();

        // Calculate costs without modifying state
        var cost = this.getLevelCost();
        var lapisCost = (this._enchantOptions[this._selectedOption] || {}).lapisCost || 1;

        // Clear output slot
        this._outputSlot = null;
        this._updateSlotDisplay('output');

        // Emit result change event with cost info for external deduction
        if (this._listeners.onResultChange) {
            for (var i = 0; i < this._listeners.onResultChange.length; i++) {
                try {
                    this._listeners.onResultChange[i]({
                        item: result,
                        levelCost: cost,
                        lapisCost: lapisCost
                    });
                } catch (e) { }
            }
        }

        return {
            item: result,
            levelCost: cost,
            lapisCost: lapisCost
        };
    };

    /**
     * getLapisCount — gets the current lapis lazuli count.
     * @returns {number}
     */
    Donkeycraft.EnchantingUI.prototype.getLapisCount = function () {
        return this._lapisCount;
    };

    /**
     * setLapisCount — sets the lapis lazuli count with input validation.
     * @param {number} n - New lapis count (must be a non-negative integer).
     * @returns {boolean} True if successful.
     */
    Donkeycraft.EnchantingUI.prototype.setLapisCount = function (n) {
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return false;
        this._lapisCount = n;
        this._updateSlotDisplay('lapis');
        return true;
    };

    /**
     * setPlayerLevels — sets the player's available XP levels with input validation.
     * @param {number} levels - Number of XP levels (must be a non-negative integer).
     * @returns {boolean} True if successful.
     */
    Donkeycraft.EnchantingUI.prototype.setPlayerLevels = function (levels) {
        if (typeof levels !== 'number' || !Number.isInteger(levels) || levels < 0) return false;
        this._playerLevels = levels;
        if (this._levelsEl) {
            this._levelsEl.textContent = 'Levels: ' + this._playerLevels;
        }
        this._updateOptionDisplay();
        this._updateCostDisplay();
        return true;
    };

    /**
     * onResultChange — subscribes to result change events.
     * @param {Function} callback - Called with (resultStack) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.EnchantingUI.prototype.onResultChange = function (callback) {
        this._listeners.onResultChange.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onResultChange.indexOf(callback);
            if (idx >= 0) self._listeners.onResultChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.EnchantingUI.prototype.destroy = function () {
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._inputSlot = null;
        this._outputSlot = null;
        this._enchantOptions = [];
        this._optionEls = [];
        this._listeners = {};
    };

})();