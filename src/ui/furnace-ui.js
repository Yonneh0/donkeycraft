// Donkeycraft — Furnace UI
// Furnace GUI with input slot, fuel slot, output slot, and progress tracking.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * FurnaceUI — manages the furnace GUI with fuel, input, and output slots.
     * @param {HTMLElement} container - DOM container for the furnace UI.
     */
    Donkeycraft.FurnaceUI = function(container) {
        this._container = container || null;

        // Slots: 0=fuel, 1=input, 2=output
        this._slots = [null, null, null];

        // Burn progress (0.0 to 1.0)
        this._burnProgress = 0;

        // Total burn time in ticks for current fuel (default 200 ticks = 10 seconds)
        this._totalBurnTime = 200;

        // Whether the furnace is currently burning
        this._isBurning = false;

        // Timer reference for tick-based progress updates
        this._timer = null;

        // Unsubscribe function for timer render events
        this._unsubscribeRender = null;

        // Listeners
        this._listeners = {
            onSlotChange: [],
            onProgressChange: []
        };

        // DOM elements
        this._fuelSlotEl = null;
        this._inputSlotEl = null;
        this._outputSlotEl = null;
        this._progressBarEl = null;

        // Build DOM if container provided
        if (this._container) {
            this._buildDOM();
        }
    };

    /**
     * _buildDOM — creates the furnace GUI DOM structure.
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._buildDOM = function() {
        var self = this;
        this._container.className = 'dk-furnace-ui';
        this._container.style.cssText = 'display: flex; align-items: center; gap: 24px; padding: 20px; background: rgba(40,35,30,0.95); border-radius: 6px;';

        // Left panel: fuel slot + progress bar
        var leftPanel = document.createElement('div');
        leftPanel.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 8px;';

        this._fuelSlotEl = document.createElement('div');
        this._fuelSlotEl.className = 'dk-fuel-slot';
        this._fuelSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(60,50,40,0.8); border: 2px solid #886644; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px;';
        this._fuelSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Fuel</span>';
        leftPanel.appendChild(this._fuelSlotEl);

        // Progress bar (vertical)
        var progressContainer = document.createElement('div');
        progressContainer.style.cssText = 'width: 16px; height: 100px; background: rgba(30,30,30,0.8); border: 1px solid #555; border-radius: 2px; position: relative; overflow: hidden;';

        this._progressBarEl = document.createElement('div');
        this._progressBarEl.style.cssText = 'position: absolute; bottom: 0; left: 0; right: 0; height: 0%; background: linear-gradient(to top, #f80, #fa0); transition: height 0.1s;';
        progressContainer.appendChild(this._progressBarEl);

        leftPanel.appendChild(progressContainer);
        this._container.appendChild(leftPanel);

        // Center: furnace icon/area
        var centerDiv = document.createElement('div');
        centerDiv.style.cssText = 'width: 80px; height: 80px; background: rgba(50,45,40,0.8); border: 2px solid #665544; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 40px;';
        centerDiv.textContent = '🔥';
        this._container.appendChild(centerDiv);

        // Right panel: input + output slots
        var rightPanel = document.createElement('div');
        rightPanel.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 16px;';

        this._inputSlotEl = document.createElement('div');
        this._inputSlotEl.className = 'dk-furnace-input';
        this._inputSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(80,70,60,0.8); border: 2px solid #998866; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px;';
        this._inputSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Input</span>';
        rightPanel.appendChild(this._inputSlotEl);

        // Arrow
        var arrow = document.createElement('div');
        arrow.style.cssText = 'font-size: 24px; color: #aaa;';
        arrow.textContent = '→';
        rightPanel.appendChild(arrow);

        this._outputSlotEl = document.createElement('div');
        this._outputSlotEl.className = 'dk-furnace-output';
        this._outputSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(80,70,60,0.8); border: 2px solid #998866; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px;';
        this._outputSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Output</span>';
        rightPanel.appendChild(this._outputSlotEl);

        this._container.appendChild(rightPanel);
    };

    /**
     * _updateSlotDisplay — updates the DOM display for a specific slot.
     * @param {number} index - Slot index (0=fuel, 1=input, 2=output).
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._updateSlotDisplay = function(index) {
        var el;
        if (index === 0) el = this._fuelSlotEl;
        else if (index === 1) el = this._inputSlotEl;
        else if (index === 2) el = this._outputSlotEl;
        else return;

        if (!el) return;

        var stack = this._slots[index];
        if (!stack || stack.isEmpty()) {
            var labels = ['Fuel', 'Input', 'Output'];
            el.innerHTML = '<span style="color:#aaa;font-size:11px;">' + (labels[index] || '') + '</span>';
        } else {
            el.textContent = this._getItemDisplayChar(stack.getItemId());
        }
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._getItemDisplayChar = function(itemId) {
        var displayMap = {
            1: '🪨', 3: '🟫', 4: '🟩', 5: '🪵', 6: '🟨', 7: '🟫',
            12: '🟡', 24: '🪵', 30: '🟨', 45: '🔲', 54: '📦',
            61: '🔥', 138: '🪨', 187: '📦', 191: '🔥', 214: '⚫',
            218: '💎', 219: '🟢', 220: '🔵', 221: '⚪', 222: '🟡',
            225: '🟡', 226: '⚪', 227: '💎', 310: '🥢', 312: '🔦'
        };
        return displayMap[itemId] || '▪';
    };

    /**
     * getInputSlot — gets the input slot content (slot index 1).
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.FurnaceUI.prototype.getInputSlot = function() {
        return this._slots[1];
    };

    /**
     * getFuelSlot — gets the fuel slot content (slot index 0).
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.FurnaceUI.prototype.getFuelSlot = function() {
        return this._slots[0];
    };

    /**
     * getOutputSlot — gets the output slot content (slot index 2).
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.FurnaceUI.prototype.getOutputSlot = function() {
        return this._slots[2];
    };

    /**
     * setSlot — sets a slot's content with input validation.
     * @param {number} index - Slot index (0=fuel, 1=input, 2=output).
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {boolean} True if the slot was set successfully.
     */
    Donkeycraft.FurnaceUI.prototype.setSlot = function(index, stack) {
        // Validate index is a non-negative integer within range
        if (typeof index !== 'number' || !Number.isFinite(index) || index < 0 || index > 2) return false;
        // Validate stack parameter — must be null or an ItemStack instance
        if (stack !== null && !(stack instanceof Donkeycraft.ItemStack)) return false;
        var oldStack = this._slots[index];
        this._slots[index] = stack;
        this._updateSlotDisplay(index);

        // Emit slot change event
        if (this._listeners.onSlotChange) {
            for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
                try { this._listeners.onSlotChange[i](index, stack, oldStack); } catch (e) {}
            }
        }

        // Update burning state if fuel/input changed
        if (index === 0 || index === 1) {
            this._updateBurningState();
        }
        return true;
    };

    /**
     * getProgress — gets the current burn progress.
     * @returns {number} Progress value (0.0 to 1.0).
     */
    Donkeycraft.FurnaceUI.prototype.getProgress = function() {
        return this._burnProgress;
    };

    /**
     * setProgress — sets the burn progress and updates the DOM with input validation.
     * @param {number} pct - Progress value (must be between 0.0 and 1.0).
     * @returns {boolean} True if progress was updated.
     */
    Donkeycraft.FurnaceUI.prototype.setProgress = function(pct) {
        // Validate input is a finite number within valid range
        if (typeof pct !== 'number' || !Number.isFinite(pct)) return false;
        if (pct < 0 || pct > 1) return false;
        this._burnProgress = Math.max(0, Math.min(1, pct));

        if (this._progressBarEl) {
            this._progressBarEl.style.height = (this._burnProgress * 100) + '%';
        }

        // Emit progress change event
        if (this._listeners.onProgressChange) {
            for (var i = 0; i < this._listeners.onProgressChange.length; i++) {
                try { this._listeners.onProgressChange[i](this._burnProgress); } catch (e) {}
            }
        }
        return true;
    };

    /**
     * isBurning — checks if the furnace is currently burning.
     * @returns {boolean}
     */
    Donkeycraft.FurnaceUI.prototype.isBurning = function() {
        return this._isBurning;
    };

    /**
     * _getFuelBurnTime — looks up the burn time for a fuel item stack.
     * Uses the recipe registry's smelting system and common fuel values.
     * @param {Donkeycraft.ItemStack} stack - Fuel item stack.
     * @returns {number} Burn time in ticks (0 if not fuel).
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._getFuelBurnTime = function(stack) {
        if (!stack || stack.isEmpty()) return 0;

        var itemId = stack.getItemId();

        // Check recipe registry first
        if (Donkeycraft.RecipeRegistry && typeof Donkeycraft.RecipeRegistry.getSmeltRecipe === 'function') {
            try {
                var recipe = Donkeycraft.RecipeRegistry.getSmeltRecipe(itemId);
                if (recipe) return recipe.cookingTime || 200;
            } catch (e) {}
        }

        // Common fuel items by ID — wood-based fuels
        var fuelMap = {
            5: 300,       // oak_log
            24: 300,      // oak_log
            30: 150,      // oak_planks
            214: 160,     // coal — good fuel
            310: 100,     // stick
            7: 0          // sand (not fuel)
        };

        return fuelMap[itemId] || 0;
    };

    /**
     * _updateBurningState — updates the burning state based on fuel and input.
     * Starts burning if fuel + input present and fuel has valid burn time.
     * Stops burning when progress completes or input is removed.
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._updateBurningState = function() {
        var hasFuel = this._slots[0] && !this._slots[0].isEmpty();
        var hasInput = this._slots[1] && !this._slots[1].isEmpty();

        // If not burning and both fuel + input present, start burning
        if (!this._isBurning && hasFuel && hasInput) {
            var fuelStack = this._slots[0];
            var burnTime = this._getFuelBurnTime(fuelStack);

            // Only start burning if fuel has a valid burn time (> 0 ticks)
            if (burnTime > 0) {
                this._isBurning = true;
                this._totalBurnTime = burnTime;
                this._burnProgress = 0;
                this.setProgress(0); // Reset progress bar display
                this._consumeFuel(); // Consume one fuel unit
            }
        }

        // Update burning state if already active (check if fuel is exhausted)
        if (this._isBurning) {
            if (this._burnProgress >= 1.0 || !hasInput) {
                this._isBurning = false;
                this._burnProgress = 1.0; // Stay at 100% until manually reset
            }
        }

        this._updateSlotDisplay(0); // Update fuel slot display (may have been consumed)
    };

    /**
     * _consumeFuel — consumes one unit of fuel from the fuel slot.
     * Decrement the stack count by 1 and clear the slot if depleted.
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._consumeFuel = function() {
        if (!this._slots[0] || this._slots[0].isEmpty()) return;

        this._slots[0].decrement(1);
        if (this._slots[0].isEmpty()) {
            this._slots[0] = null;
        }

        // Emit slot change event for fuel slot
        if (this._listeners.onSlotChange) {
            for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
                try { this._listeners.onSlotChange[i](0, this._slots[0], null); } catch (e) {}
            }
        }
    };

    /**
     * tick — advances furnace state by one tick. Called by the game loop.
     * @returns {Object|null} Result object with {outputStack, consumedLevels} if output ready, else null.
     */
    Donkeycraft.FurnaceUI.prototype.tick = function() {
        if (!this._isBurning) return null;

        // Advance progress
        this._burnProgress += 1.0 / this._totalBurnTime;

        // Update DOM display
        this.setProgress(this._burnProgress);

        // Check if smelting is complete
        if (this._burnProgress >= 1.0) {
            var inputSlot = this._slots[1];
            var outputSlot = this._slots[2];

            if (inputSlot && !inputSlot.isEmpty() && Donkeycraft.RecipeRegistry) {
                try {
                    var recipe = Donkeycraft.RecipeRegistry.getSmeltRecipe(inputSlot.getItemId());
                    if (recipe) {
                        // Create output item
                        var outputStack = new Donkeycraft.ItemStack(
                            recipe.outputBlockId,
                            recipe.outputCount || 1,
                            null
                        );

                        // Check if output slot can accept the result
                        if (outputSlot === null || outputSlot.isEmpty()) {
                            this._slots[2] = outputStack;
                        } else if (outputSlot.canStackWith(outputStack)) {
                            outputSlot.increment(outputStack.getCount());
                        }

                        // Consume input
                        inputSlot.decrement(1);
                        if (inputSlot.isEmpty()) {
                            this._slots[1] = null;
                        }

                        // Reset progress and burning state
                        this._burnProgress = 0;
                        this.setProgress(0);

                        // Check if more fuel is available
                        this._updateBurningState();

                        // Emit slot change for output
                        if (this._listeners.onSlotChange) {
                            for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
                                try { this._listeners.onSlotChange[i](2, this._slots[2], null); } catch (e) {}
                            }
                        }

                        return { outputStack: outputStack };
                    }
                } catch (e) {}
            }

            // If no recipe found or input exhausted, stop burning
            this._isBurning = false;
            this._burnProgress = 0;
            this.setProgress(0);
        }

        return null;
    };

    /**
     * setTimer — sets a reference to the Timer instance for tick-based updates with validation.
     * @param {Object} timer - Donkeycraft.Timer instance.
     * @returns {boolean} True if timer was set successfully.
     */
    Donkeycraft.FurnaceUI.prototype.setTimer = function(timer) {
        if (timer === null || timer === undefined) return false;
        this._timer = timer;
        return true;
    };

    /**
     * startListening — starts auto-ticking on each render frame when burning.
     */
    Donkeycraft.FurnaceUI.prototype.startListening = function() {
        if (this._unsubscribeRender) return;

        var self = this;
        if (this._timer) {
            try {
                this._unsubscribeRender = this._timer.onRender(function(timestamp) {
                    if (self._isBurning) {
                        self.tick();
                    }
                });
            } catch (e) {}
        }
    };

    /**
     * stopListening — stops auto-ticking.
     */
    Donkeycraft.FurnaceUI.prototype.stopListening = function() {
        if (this._unsubscribeRender) {
            try { this._unsubscribeRender(); } catch (e) {}
            this._unsubscribeRender = null;
        }
    };

    /**
     * onSlotChange — subscribes to slot change events.
     * @param {Function} callback - Called with (slotIndex, newStack, oldStack) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.FurnaceUI.prototype.onSlotChange = function(callback) {
        this._listeners.onSlotChange.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onSlotChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSlotChange.splice(idx, 1);
        };
    };

    /**
     * onProgressChange — subscribes to progress change events.
     * @param {Function} callback - Called with (progress) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.FurnaceUI.prototype.onProgressChange = function(callback) {
        this._listeners.onProgressChange.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onProgressChange.indexOf(callback);
            if (idx >= 0) self._listeners.onProgressChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.FurnaceUI.prototype.destroy = function() {
        this.stopListening();
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._slots = [];
        this._listeners = {};
    };

})();