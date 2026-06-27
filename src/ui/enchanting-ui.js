// Donkeycraft — Enchanting UI
// Enchanting GUI with level cost, enchantment options, and lapis lazuli input.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * EnchantingUI — manages the enchanting table GUI.
     * @param {HTMLElement} container - DOM container for the enchanting UI.
     */
    Donkeycraft.EnchantingUI = function(container) {
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
     */
    Donkeycraft.EnchantingUI.prototype._buildDOM = function() {
        var self = this;
        this._container.className = 'dk-enchanting-ui';
        this._container.style.cssText = 'display: flex; align-items: center; gap: 16px; padding: 20px; background: rgba(30,25,40,0.95); border-radius: 6px;';

        // Left: input slot
        this._inputSlotEl = document.createElement('div');
        this._inputSlotEl.className = 'dk-enchant-input';
        this._inputSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(80,60,100,0.8); border: 2px solid #7755aa; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px;';
        this._inputSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Item</span>';
        this._container.appendChild(this._inputSlotEl);

        // Center: enchantment options (3 cards)
        var centerPanel = document.createElement('div');
        centerPanel.style.cssText = 'display: flex; flex-direction: column; gap: 8px; flex: 1;';

        for (var c = 0; c < 3; c++) {
            var optionEl = document.createElement('div');
            optionEl.className = 'dk-enchant-option';
            optionEl.style.cssText = 'width: 100%; height: 56px; background: rgba(60,50,70,0.8); border: 2px solid #554466; border-radius: 3px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; cursor: pointer;';
            optionEl.dataset.optionIndex = c;

            var textSpan = document.createElement('span');
            textSpan.className = 'dk-enchant-option-text';
            textSpan.style.cssText = 'color: #aaa; font-size: 12px; flex: 1;';
            textSpan.textContent = 'Option ' + (c + 1);
            optionEl.appendChild(textSpan);

            var costSpan = document.createElement('span');
            costSpan.className = 'dk-enchant-cost';
            costSpan.style.cssText = 'color: #4a9; font-size: 12px; font-weight: bold;';
            costSpan.textContent = 'Level 0';
            optionEl.appendChild(costSpan);

            optionEl.addEventListener('click', (function(idx) {
                return function() { self.selectEnchantment(idx); };
            })(c));

            this._optionEls.push(optionEl);
            centerPanel.appendChild(optionEl);
        }

        this._container.appendChild(centerPanel);

        // Right: lapis + output
        var rightPanel = document.createElement('div');
        rightPanel.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 16px;';

        // Lapis slot
        this._lapisSlotEl = document.createElement('div');
        this._lapisSlotEl.className = 'dk-enchant-lapis';
        this._lapisSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(60,80,100,0.8); border: 2px solid #5577aa; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px;';
        this._lapisSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Lapis</span>';
        rightPanel.appendChild(this._lapisSlotEl);

        // Arrow
        var arrow = document.createElement('div');
        arrow.style.cssText = 'font-size: 24px; color: #aaa;';
        arrow.textContent = '→';
        rightPanel.appendChild(arrow);

        // Output slot
        this._outputSlotEl = document.createElement('div');
        this._outputSlotEl.className = 'dk-enchant-output';
        this._outputSlotEl.style.cssText = 'width: 64px; height: 64px; background: rgba(80,60,100,0.8); border: 2px solid #8866bb; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 28px;';
        this._outputSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Result</span>';
        rightPanel.appendChild(this._outputSlotEl);

        this._container.appendChild(rightPanel);

        // Bottom panel: player levels + cost display
        var bottomPanel = document.createElement('div');
        bottomPanel.style.cssText = 'width: 100%; display: flex; justify-content: center; gap: 24px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #333;';

        this._levelsEl = document.createElement('div');
        this._levelsEl.style.cssText = 'font-size: 14px; color: #4a9; font-weight: bold;';
        this._levelsEl.textContent = 'Levels: 0';
        bottomPanel.appendChild(this._levelsEl);

        this._levelCostEl = document.createElement('div');
        this._levelCostEl.style.cssText = 'font-size: 14px; color: #f84; font-weight: bold;';
        this._levelCostEl.textContent = 'Cost: 0';
        bottomPanel.appendChild(this._levelCostEl);

        this._container.appendChild(bottomPanel);
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._getItemDisplayChar = function(itemId) {
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
     * _updateSlotDisplay — updates the DOM display for a slot.
     * @param {string} slotName - Slot name ('input', 'output', 'lapis').
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._updateSlotDisplay = function(slotName) {
        var el, stack;
        if (slotName === 'input') {
            el = this._inputSlotEl;
            stack = this._inputSlot;
        } else if (slotName === 'output') {
            el = this._outputSlotEl;
            stack = this._outputSlot;
        } else if (slotName === 'lapis') {
            el = this._lapisSlotEl;
        } else return;

        if (!el) return;

        if (slotName !== 'lapis') {
            if (!stack || stack.isEmpty()) {
                var labels = { input: 'Item', output: 'Result' };
                el.innerHTML = '<span style="color:#aaa;font-size:11px;">' + (labels[slotName] || '') + '</span>';
            } else {
                el.textContent = this._getItemDisplayChar(stack.getItemId());
            }
        }

        // Lapis count display
        if (slotName === 'lapis') {
            if (this._lapisCount > 0) {
                el.textContent = '🔵×' + this._lapisCount;
            } else {
                el.innerHTML = '<span style="color:#aaa;font-size:11px;">Lapis</span>';
            }
        }
    };

    /**
     * _updateOptionDisplay — updates the enchantment option cards.
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._updateOptionDisplay = function() {
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
     * _updateCostDisplay — updates the level cost display.
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._updateCostDisplay = function() {
        var opt = this._enchantOptions[this._selectedOption] || null;
        var cost = opt ? opt.cost : 0;
        this._levelCostEl.textContent = 'Cost: ' + cost;
        this._levelCostEl.style.color = (this._playerLevels >= cost) ? '#4a9' : '#f84';
    };

    /**
     * _applyEnchantment — applies the selected enchantment to generate output.
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._applyEnchantment = function() {
        if (!this._inputSlot || this._inputSlot.isEmpty()) {
            this._outputSlot = null;
            return;
        }

        var opt = this._enchantOptions[this._selectedOption] || null;
        if (!opt) {
            this._outputSlot = null;
            return;
        }

        // Check requirements
        if (this._playerLevels < opt.cost) {
            this._outputSlot = null;
            return;
        }

        if (this._lapisCount < (opt.lapisCost || 1)) {
            this._outputSlot = null;
            return;
        }

        // Apply enchantment to input item
        var result = this._inputSlot.clone();
        result.addEnchantment(opt.id, opt.level);
        this._outputSlot = result;

        // Update slot display
        this._updateSlotDisplay('output');

        // Emit result change event
        if (this._listeners.onResultChange) {
            for (var i = 0; i < this._listeners.onResultChange.length; i++) {
                try { this._listeners.onResultChange[i](this._outputSlot); } catch (e) {}
            }
        }
    };

    /**
     * getInputSlot — gets the input slot content.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.EnchantingUI.prototype.getInputSlot = function() {
        return this._inputSlot;
    };

    /**
     * _isValidStack — checks if a value is a valid ItemStack or null.
     * @param {*} val - Value to check.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._isValidStack = function(val) {
        return val === null || (val !== null && typeof val.isEmpty === 'function' && typeof val.getItemId === 'function');
    };

    /**
     * setInputSlot — sets the input slot with input validation.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {boolean} True if successful.
     */
    Donkeycraft.EnchantingUI.prototype.setInputSlot = function(stack) {
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
    Donkeycraft.EnchantingUI.prototype.getAvailableEnchantments = function() {
        return this._enchantOptions.slice();
    };

    /**
     * _generateEnchantmentOptions — generates 3 random enchantment options for the input item.
     * Uses EnchantmentRegistry to dynamically select valid enchantments based on the item type.
     * @private
     */
    Donkeycraft.EnchantingUI.prototype._generateEnchantmentOptions = function() {
        if (!this._inputSlot || this._inputSlot.isEmpty()) {
            this._enchantOptions = [];
            this._updateOptionDisplay();
            this._updateCostDisplay();
            return;
        }

        // Determine which slot the item belongs to
        var itemBlockId = this._inputSlot.getItemId ? this._inputSlot.getItemId() : 0;
        var isArmor = false;
        var isWeapon = false;

        if ([300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315].indexOf(itemBlockId) >= 0) {
            isArmor = true;
        } else {
            // Assume weapon for anything that isn't armor (swords, tools, bows, etc.)
            isWeapon = true;
        }

        // Get valid enchantments from the registry
        var registry = Donkeycraft.EnchantmentRegistry;
        var pool = [];

        if (isWeapon && registry) {
            var weaponEnchants = registry.getEnchantmentsForSlot('weapon');
            for (var w = 0; w < weaponEnchants.length; w++) {
                pool.push(weaponEnchants[w]);
            }
        } else if (isArmor && registry) {
            var armorEnchants = registry.getEnchantmentsForSlot('armor');
            for (var a = 0; a < armorEnchants.length; a++) {
                pool.push(armorEnchants[a]);
            }
        }

        // If no registry or empty pool, fall back to a minimal static set
        if (!registry || pool.length === 0) {
            pool = [
                { id: 1, name: 'Sharpness', maxLevel: 5, weight: 10 },   // weapon
                { id: 4, name: 'Protection', maxLevel: 4, weight: 10 }    // armor
            ];
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

            // Calculate cost using registry formula
            var cost = registry.calculateLevelCost ? registry.calculateLevelCost(enchant.id, randomLevel) : randomLevel;

            this._enchantOptions.push({
                id: enchant.id,
                name: enchant.name,
                level: randomLevel,
                cost: cost + (this._enchantOptions.length * 2), // Increase cost for later options
                lapisCost: 1 + this._enchantOptions.length
            });
        }

        this._updateOptionDisplay();
        this._updateCostDisplay();
    };

    /**
     * selectEnchantment — selects an enchantment option by index.
     * @param {number} index - Option index (0-2).
     */
    Donkeycraft.EnchantingUI.prototype.selectEnchantment = function(index) {
        if (index < 0 || index > 2) return;
        this._selectedOption = index;

        this._updateOptionDisplay();
        this._updateCostDisplay();
        this._applyEnchantment();
    };

    /**
     * getLevelCost — gets the XP level cost for the currently selected enchantment.
     * @returns {number}
     */
    Donkeycraft.EnchantingUI.prototype.getLevelCost = function() {
        var opt = this._enchantOptions[this._selectedOption] || null;
        return opt ? opt.cost : 0;
    };

    /**
     * applyEnchantment — applies the selected enchantment to the input item.
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.EnchantingUI.prototype.applyEnchantment = function() {
        this._applyEnchantment();
        return this._outputSlot;
    };

    /**
     * takeResult — takes the enchanted output item.
     * Returns cost info for the game to deduct from player state (does not modify directly).
     * @returns {Object|null} Object with {item, levelCost, lapisCost}, or null if no result.
     */
    Donkeycraft.EnchantingUI.prototype.takeResult = function() {
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
                try { this._listeners.onResultChange[i]({
                    item: result,
                    levelCost: cost,
                    lapisCost: lapisCost
                }); } catch (e) {}
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
    Donkeycraft.EnchantingUI.prototype.getLapisCount = function() {
        return this._lapisCount;
    };

    /**
     * setLapisCount — sets the lapis lazuli count with input validation.
     * @param {number} n - New lapis count (must be a non-negative integer).
     * @returns {boolean} True if successful.
     */
    Donkeycraft.EnchantingUI.prototype.setLapisCount = function(n) {
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
    Donkeycraft.EnchantingUI.prototype.setPlayerLevels = function(levels) {
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
    Donkeycraft.EnchantingUI.prototype.onResultChange = function(callback) {
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
    Donkeycraft.EnchantingUI.prototype.destroy = function() {
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