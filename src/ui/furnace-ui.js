// Donkeycraft — Furnace UI
// Furnace GUI with input slot, fuel slot, output slot, and progress tracking.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * FurnaceUI — manages the furnace GUI with fuel, input, and output slots.
     * @param {HTMLElement} container - DOM container for the furnace UI.
     */
    Donkeycraft.FurnaceUI = function (container) {
        this._container = container || null;

        // Slots: 0=fuel, 1=input, 2=output
        this._slots = [null, null, null];

        // Burn progress (0.0 to 1.0) — based on recipe cooking time
        this._burnProgress = 0;

        // Recipe cooking time in ticks (e.g., 10 for iron ore, 8 for stone)
        this._cookingTime = 0;

        // Remaining fuel ticks (how many smelts worth of burn time remain)
        this._remainingFuelTicks = 0;

        // Whether the furnace is currently burning
        this._isBurning = false;

        // Timer reference for tick-based progress updates
        this._timer = null;

        // Unsubscribe function for timer render events
        this._unsubscribeRender = null;

        // Last emitted progress percentage (for throttling events)
        this._lastProgressPercent = -1;

        // Listeners
        this._listeners = {
            onSlotChange: [],
            onProgressChange: [],
            onOutputReady: []
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
    Donkeycraft.FurnaceUI.prototype._buildDOM = function () {
        var self = this;
        this._container.className = 'dk-furnace-ui';
        this._container.style.cssText = 'display: flex; align-items: center; gap: 24px; padding: 20px; background: rgba(40,35,30,0.95); border-radius: 6px;';

        // Left panel: fuel slot + progress bar
        var leftPanel = document.createElement('div');
        leftPanel.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 8px;';

        this._fuelSlotEl = document.createElement('div');
        this._fuelSlotEl.className = 'dk-fuel-slot';
        this._fuelSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(60,50,40,0.8); border: 2px solid #886644; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer;';
        this._fuelSlotEl.dataset.slotIndex = 0;
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
        this._inputSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(80,70,60,0.8); border: 2px solid #998866; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer;';
        this._inputSlotEl.dataset.slotIndex = 1;
        this._inputSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Input</span>';
        rightPanel.appendChild(this._inputSlotEl);

        // Arrow
        var arrow = document.createElement('div');
        arrow.style.cssText = 'font-size: 24px; color: #aaa;';
        arrow.textContent = '→';
        rightPanel.appendChild(arrow);

        this._outputSlotEl = document.createElement('div');
        this._outputSlotEl.className = 'dk-furnace-output';
        this._outputSlotEl.style.cssText = 'width: 56px; height: 56px; background: rgba(80,70,60,0.8); border: 2px solid #998866; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer;';
        this._outputSlotEl.dataset.slotIndex = 2;
        this._outputSlotEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Output</span>';
        rightPanel.appendChild(this._outputSlotEl);

        this._container.appendChild(rightPanel);
    };

    /**
     * _updateSlotDisplay — updates the DOM display for a specific slot.
     * @param {number} index - Slot index (0=fuel, 1=input, 2=output).
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._updateSlotDisplay = function (index) {
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
     * @returns {string} Display emoji character, or '▪' for unknown IDs.
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._getItemDisplayChar = function (itemId) {
        if (typeof itemId !== 'number' || !Number.isFinite(itemId) || itemId <= 0) return '\u25A0';

        var displayMap = {
            // Basic blocks
            1: '\u{1F9E8}',   // stone
            3: '\u{1F7EB}',   // dirt
            4: '\u{1F7E9}',   // grass_block
            5: '\u{1F332}',   // oak_log
            6: '\u{1F343}',   // oak_planks
            7: '\u{1F332}',   // sand (fallback)
            12: '\u{1F7E1}',  // gold_ore
            24: '\u{1F333}',  // spruce_log
            25: '\u{1F334}',  // birch_log
            26: '\u{1F335}',  // jungle_log
            27: '\u{1F336}',  // acacia_log
            28: '\u{1F337}',  // dark_oak_log
            29: '\u{1F338}',  // mangrove_log
            30: '\u{1F339}',  // oak_planks
            31: '\u{1F33A}',  // spruce_planks
            32: '\u{1F33B}',  // birch_planks
            33: '\u{1F33C}',  // jungle_planks
            34: '\u{1F33D}',  // acacia_planks
            35: '\u{1F33E}',  // dark_oak_planks
            45: '\u{1F9F2}',  // iron_ingot
            54: '\u{1F4E6}',  // crafting_table
            61: '\u{1F525}',  // furnace
            11: '\u{1F4E7}',  // iron_ore
            14: '\u2B1C',     // coal
            138: '\u{1F9E8}', // deepslate
            187: '\u{1F4E6}', // anvil
            191: '\u{1F525}', // furnace (explicit)
            214: '\u{1F534}', // coal
            218: '\u{1F48E}', // diamond
            219: '\u{1F7E2}', // emerald
            220: '\u{1F535}', // lapis_lazuli
            221: '\u26AA',    // quartz
            222: '\u{1F7E1}', // gold_ingot
            225: '\u{1F7E1}', // gold_block
            226: '\u26AA',    // quartz_block
            227: '\u{1F48E}', // diamond_block
            310: '\u{1F953}', // stick
            312: '\u{1F526}'  // flint
        };
        return displayMap[itemId] || '\u25A0';
    };

    /**
     * getInputSlot — gets the input slot content (slot index 1).
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.FurnaceUI.prototype.getInputSlot = function () {
        return this._slots[1];
    };

    /**
     * getFuelSlot — gets the fuel slot content (slot index 0).
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.FurnaceUI.prototype.getFuelSlot = function () {
        return this._slots[0];
    };

    /**
     * getOutputSlot — gets the output slot content (slot index 2).
     * @returns {Donkeycraft.ItemStack|null}
     */
    Donkeycraft.FurnaceUI.prototype.getOutputSlot = function () {
        return this._slots[2];
    };

    /**
     * setOutputSlot — sets the output slot content with validation.
     * This is typically called internally by _produceOutput, but exposed for test/debug use.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set in output slot.
     * @returns {boolean} True if the slot was set successfully.
     */
    Donkeycraft.FurnaceUI.prototype.setOutputSlot = function (stack) {
        return this.setSlot(2, stack);
    };

    /**
     * setSlot — sets a slot's content with input validation.
     * @param {number} index - Slot index (0=fuel, 1=input, 2=output).
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     * @returns {boolean} True if the slot was set successfully.
     */
    Donkeycraft.FurnaceUI.prototype.setSlot = function (index, stack) {
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
                try { this._listeners.onSlotChange[i](index, stack, oldStack); } catch (e) { }
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
    Donkeycraft.FurnaceUI.prototype.getProgress = function () {
        return this._burnProgress;
    };

    /**
     * setProgress — sets the burn progress and updates the DOM with input validation.
     * @param {number} pct - Progress value (must be between 0.0 and 1.0).
     * @returns {boolean} True if progress was updated.
     */
    Donkeycraft.FurnaceUI.prototype.setProgress = function (pct) {
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
                try { this._listeners.onProgressChange[i](this._burnProgress); } catch (e) { }
            }
        }
        return true;
    };

    /**
     * isBurning — checks if the furnace is currently burning.
     * @returns {boolean}
     */
    Donkeycraft.FurnaceUI.prototype.isBurning = function () {
        return this._isBurning;
    };

    /**
     * _fuelRegistry — static map of item IDs to their burn time in ticks.
     * Registered via registerFuel() or populated with common defaults.
     * Uses Object.create(null) to avoid prototype pollution.
     * @type {Object.<number, number>}
     * @private
     */
    Donkeycraft.FurnaceUI._fuelRegistry = Object.create(null);

    // Default fuel entries — logs (300 ticks = 15s), planks (150 ticks = 7.5s),
    // coal (160 ticks = 8s), sticks (100 ticks = 5s).
    var _defaultFuels = Donkeycraft.FurnaceUI._fuelRegistry;
    _defaultFuels[5] = 300;   // oak_log
    _defaultFuels[7] = 150;   // oak_planks (fallback ID)
    _defaultFuels[24] = 300;  // spruce_log
    _defaultFuels[25] = 300;  // birch_log
    _defaultFuels[26] = 300;  // jungle_log
    _defaultFuels[27] = 300;  // acacia_log
    _defaultFuels[28] = 300;  // dark_oak_log
    _defaultFuels[29] = 300;  // mangrove_log
    _defaultFuels[30] = 150;  // oak_planks
    _defaultFuels[31] = 150;  // spruce_planks
    _defaultFuels[32] = 150;  // birch_planks
    _defaultFuels[33] = 150;  // jungle_planks
    _defaultFuels[34] = 150;  // acacia_planks
    _defaultFuels[35] = 150;  // dark_oak_planks
    _defaultFuels[214] = 160; // coal
    _defaultFuels[310] = 100; // sticks
    _defaultFuels[191] = 0;   // furnace (explicitly non-fuel)

    /**
     * getSlotCount — returns the total number of slots (always 3).
     * @returns {number}
     */
    Donkeycraft.FurnaceUI.prototype.getSlotCount = function () {
        return this._slots.length;
    };

    /**
     * getSlots — returns a copy of the internal slots array.
     * @returns {Array.<Donkeycraft.ItemStack|null>}
     */
    Donkeycraft.FurnaceUI.prototype.getSlots = function () {
        return this._slots.slice();
    };

    /**
     * getCookingTime — gets the current recipe cooking time in ticks.
     * @returns {number} Cooking time in ticks (0 if no recipe active).
     */
    Donkeycraft.FurnaceUI.prototype.getCookingTime = function () {
        return this._cookingTime;
    };

    /**
     * getTotalBurnTime — gets the total burn time of the current fuel.
     * @returns {number} Total burn time in ticks (0 if no fuel).
     */
    Donkeycraft.FurnaceUI.prototype.getTotalBurnTime = function () {
        var fuelStack = this._slots[0];
        return this._getFuelBurnTime(fuelStack);
    };

    /**
     * hasValidRecipe — checks if the current input item has a valid smelting recipe.
     * @returns {boolean}
     */
    Donkeycraft.FurnaceUI.prototype.hasValidRecipe = function () {
        var inputSlot = this._slots[1];
        if (!inputSlot || inputSlot.isEmpty()) return false;
        return this._getSmeltRecipe(inputSlot.getItemId()) !== null;
    };

    /**
     * resetProgress — resets burn progress to 0 without changing burning state.
     * @returns {boolean} True if progress was reset.
     */
    Donkeycraft.FurnaceUI.prototype.resetProgress = function () {
        this._burnProgress = 0;
        this._cookingTime = 0;
        this._lastProgressPercent = -1;
        if (this._progressBarEl) {
            this._progressBarEl.style.height = '0%';
        }
        return true;
    };

    /**
     * removeFromSlot — removes one item from a slot by item ID.
     * @param {number} slotIndex - Slot index (0=fuel, 1=input, 2=output).
     * @returns {boolean} True if an item was removed.
     */
    Donkeycraft.FurnaceUI.prototype.removeFromSlot = function (slotIndex) {
        if (typeof slotIndex !== 'number' || !Number.isFinite(slotIndex)) return false;
        if (slotIndex < 0 || slotIndex > 2) return false;
        var slot = this._slots[slotIndex];
        if (!slot || slot.isEmpty()) return false;
        slot.decrement(1);
        if (slot.isEmpty()) {
            this._slots[slotIndex] = null;
        }
        this._updateSlotDisplay(slotIndex);
        if (slotIndex === 0 || slotIndex === 1) {
            this._updateBurningState();
        }
        return true;
    };

    /**
     * onOutputReady — subscribes to output ready events.
     * @param {Function} callback - Called with (outputStack) argument when smelting completes.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.FurnaceUI.prototype.onOutputReady = function (callback) {
        this._listeners.onOutputReady.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onOutputReady.indexOf(callback);
            if (idx >= 0) self._listeners.onOutputReady.splice(idx, 1);
        };
    };

    /**
     * registerFuel — registers an item ID as fuel with a given burn time.
     * @param {number} itemId - The block/item ID to register as fuel.
     * @param {number} burnTime - Burn time in ticks (e.g., 160 for coal, 300 for log).
     */
    Donkeycraft.FurnaceUI.registerFuel = function (itemId, burnTime) {
        if (typeof itemId !== 'number' || !Number.isFinite(itemId) || itemId <= 0) return;
        if (typeof burnTime !== 'number' || burnTime < 0) return;
        var registry = Donkeycraft.FurnaceUI._fuelRegistry;
        registry[itemId] = burnTime;
    };

    /**
     * isFuel — static check whether an item ID qualifies as furnace fuel.
     * @param {number} itemId - Block/item ID to check.
     * @returns {boolean}
     */
    Donkeycraft.FurnaceUI.isFuel = function (itemId) {
        if (typeof itemId !== 'number' || !Number.isFinite(itemId) || itemId <= 0) return false;
        var registry = Donkeycraft.FurnaceUI._fuelRegistry;
        return (registry[itemId] !== undefined && registry[itemId] > 0);
    };

    /**
     * getFuelBurnTime — static lookup of burn time for a given item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {number} Burn time in ticks (0 if not fuel).
     */
    Donkeycraft.FurnaceUI.getFuelBurnTime = function (itemId) {
        if (typeof itemId !== 'number' || !Number.isFinite(itemId) || itemId <= 0) return 0;
        var registry = Donkeycraft.FurnaceUI._fuelRegistry;
        return (registry[itemId] !== undefined) ? registry[itemId] : 0;
    };

    /**
     * getSmeltableItems — static method returning a sorted array of all item IDs
     * that have registered smelting recipes.
     * @returns {number[]}
     */
    Donkeycraft.FurnaceUI.getSmeltableItems = function () {
        if (!Donkeycraft.RecipeRegistry || typeof Donkeycraft.RecipeRegistry.getSmeltRecipes !== 'function') {
            return [];
        }
        try {
            var recipes = Donkeycraft.RecipeRegistry.getSmeltRecipes();
            if (!Array.isArray(recipes)) return [];
            var seen = Object.create(null);
            var result = [];
            for (var i = 0; i < recipes.length; i++) {
                var r = recipes[i];
                if (r && !seen[r.inputBlockId]) {
                    seen[r.inputBlockId] = true;
                    result.push(r.inputBlockId);
                }
            }
            return result;
        } catch (e) {
            return [];
        }
    };

    /**
     * getFuelCount — returns the number of registered fuel types.
     * @returns {number}
     */
    Donkeycraft.FurnaceUI.getFuelCount = function () {
        var registry = Donkeycraft.FurnaceUI._fuelRegistry;
        var count = 0;
        for (var key in registry) {
            if (Object.prototype.hasOwnProperty.call(registry, key) && registry[key] > 0) {
                count++;
            }
        }
        return count;
    };

    /**
     * _getFuelBurnTime — looks up the burn time for a fuel item stack.
     * @param {Donkeycraft.ItemStack} stack - Fuel item stack.
     * @returns {number} Burn time in ticks (0 if not fuel).
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._getFuelBurnTime = function (stack) {
        if (!stack || typeof stack.isEmpty !== 'function' || stack.isEmpty()) return 0;

        var itemId = stack.getItemId();
        var registry = Donkeycraft.FurnaceUI._fuelRegistry;
        if (registry && registry[itemId] !== undefined) {
            return registry[itemId];
        }
        return 0;
    };

    /**
     * _getSmeltRecipe — looks up a smelting recipe for the given input item ID.
     * @param {number} itemId - The block/item ID to smelt.
     * @returns {Object|null} Recipe object with outputBlockId, outputCount, cookingTime, or null.
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._getSmeltRecipe = function (itemId) {
        if (!Donkeycraft.RecipeRegistry || typeof Donkeycraft.RecipeRegistry.getSmeltRecipe !== 'function') return null;
        try {
            return Donkeycraft.RecipeRegistry.getSmeltRecipe(itemId);
        } catch (e) {
            return null;
        }
    };

    /**
     * _produceOutput — smelts one unit of input and places the result in the output slot.
     * Validates recipe object has required properties before creating output.
     * Handles output slot stacking, overflow prevention, and input consumption.
     * @returns {Object|null} Result object with {outputStack: Donkeycraft.ItemStack}, or null if no output produced.
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._produceOutput = function () {
        var inputSlot = this._slots[1];
        var outputSlot = this._slots[2];

        if (!inputSlot || inputSlot.isEmpty()) return null;

        var recipe = this._getSmeltRecipe(inputSlot.getItemId());
        if (!recipe) return null;

        // Validate recipe has required properties to prevent creating invalid stacks
        var outputBlockId = recipe.outputBlockId;
        if (typeof outputBlockId !== 'number' || !Number.isFinite(outputBlockId) || outputBlockId <= 0) {
            return null;
        }
        var outputCount = recipe.outputCount || 1;
        if (typeof outputCount !== 'number' || outputCount <= 0) {
            outputCount = 1;
        }

        // Create output item with validated values
        var outputStack = new Donkeycraft.ItemStack(outputBlockId, outputCount, null);

        // Check if output slot can accept the result
        if (outputSlot === null || outputSlot.isEmpty()) {
            this._slots[2] = outputStack;
        } else if (outputSlot.canStackWith(outputStack)) {
            outputSlot.increment(outputStack.getCount());
        } else {
            // Output slot is full and cannot stack — furnace stops
            return null;
        }

        // Consume one input item
        inputSlot.decrement(1);
        if (inputSlot.isEmpty()) {
            this._slots[1] = null;
        }

        return { outputStack: outputStack };
    };

    /**
     * _updateBurningState — updates the burning state based on fuel and input.
     * Starts burning if fuel + input present, tracks recipe cooking time.
     * Stops burning when progress completes or input is removed.
     * Guards against re-entrant calls (e.g., from slot-change event listeners).
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._updateBurningState = function () {
        // Guard: prevent re-entrant calls from event listeners
        if (this._isBurning) return;

        var hasFuel = this._slots[0] && !this._slots[0].isEmpty();
        var hasInput = this._slots[1] && !this._slots[1].isEmpty();

        // If not burning and both fuel + input present, start burning
        if (hasFuel && hasInput) {
            var fuelStack = this._slots[0];
            var burnTime = this._getFuelBurnTime(fuelStack);

            // Only start burning if fuel has a valid burn time (> 0 ticks)
            if (burnTime > 0) {
                this._isBurning = true;
                // Total burn time = per-item burn time × stack count.
                // A stack of 64 coal (80 ticks each) provides 5120 ticks of burn time.
                this._remainingFuelTicks = burnTime * fuelStack.getCount();
                this._burnProgress = 0;
                this.setProgress(0);
                // Cooking time will be set on first tick when we have a recipe
            }
            return;
        }

        // If burning but no input, stop burning and reset progress
        if (this._isBurning && !hasInput) {
            this._isBurning = false;
            this._burnProgress = 0;
            this._cookingTime = 0;
            this.setProgress(0);
            this._updateSlotDisplay(0);
            return;
        }

        // Update slot display for fuel (may have been consumed)
        this._updateSlotDisplay(0);
    };

    /**
     * _consumeFuel — consumes one unit of fuel from the fuel slot.
     * Decrements the stack count by 1 and clears the slot if depleted.
     * Emits a slot change event for the fuel slot (index 0).
     * Used internally when a fuel item is fully consumed after burning out.
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._consumeFuel = function () {
        if (!this._slots[0] || this._slots[0].isEmpty()) return;

        var oldFuelStack = this._slots[0].clone();
        this._slots[0].decrement(1);

        if (this._slots[0].isEmpty()) {
            this._slots[0] = null;
        }

        // Emit slot change event for fuel slot (index 0)
        if (this._listeners.onSlotChange) {
            for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
                try { this._listeners.onSlotChange[i](0, this._slots[0], oldFuelStack); } catch (e) { }
            }
        }
    };

    /**
     * tick — advances furnace state by one tick. Called by the game loop.
     * Advances burn progress and produces output when complete.
     * Each tick consumes 1 unit of burn time from remainingFuelTicks.
     * When a new recipe is detected, cookingTime is set from the recipe.
     * Handles fuel refueling from remaining stack count automatically.
     * @returns {Object|null} Result object with {outputStack: Donkeycraft.ItemStack} if output ready, else null.
     */
    Donkeycraft.FurnaceUI.prototype.tick = function () {
        if (!this._isBurning) return null;

        // Guard against zero/negative cookingTime to prevent division by zero
        if (this._cookingTime <= 0) {
            // Look up the recipe for current input to get cooking time
            var inputSlot = this._slots[1];
            if (!inputSlot || inputSlot.isEmpty()) {
                this._isBurning = false;
                this._burnProgress = 0;
                this._cookingTime = 0;
                this._lastProgressPercent = -1;
                this.setProgress(0);
                return null;
            }

            var recipe = this._getSmeltRecipe(inputSlot.getItemId());
            if (!recipe) {
                this._isBurning = false;
                this._burnProgress = 0;
                this._cookingTime = 0;
                this._lastProgressPercent = -1;
                this.setProgress(0);
                return null;
            }

            // Set cooking time from recipe with safe default (>= 1 tick)
            var ct = recipe.cookingTime;
            this._cookingTime = (typeof ct === 'number' && ct > 0) ? ct : 200;
        }

        // Decrement remaining fuel ticks — each tick consumes 1 tick of burn time
        this._remainingFuelTicks--;

        // Check if fuel is exhausted
        if (this._remainingFuelTicks <= 0) {
            // Try to get more burn time from remaining fuel stack
            var fuelSlot = this._slots[0];
            if (fuelSlot && !fuelSlot.isEmpty()) {
                var newBurnTime = this._getFuelBurnTime(fuelSlot);
                if (newBurnTime > 0) {
                    // Refuel: total burn time from remaining stack count
                    this._remainingFuelTicks = newBurnTime * fuelSlot.getCount();
                    // Consume the entire fuel stack when refueling
                    // (single-item fuels are consumed via decrement below; multi-stacks refuel once)
                    fuelSlot.decrement(fuelSlot.getCount());
                    if (fuelSlot.isEmpty()) {
                        this._slots[0] = null;
                    }
                    this._updateSlotDisplay(0);
                } else {
                    // Fuel item is not valid — stop burning
                    this._isBurning = false;
                    this._burnProgress = 0;
                    this._cookingTime = 0;
                    this._lastProgressPercent = -1;
                    this.setProgress(0);
                    return null;
                }
            } else {
                // No fuel remaining — stop burning
                this._isBurning = false;
                this._burnProgress = 0;
                this._cookingTime = 0;
                this._lastProgressPercent = -1;
                this.setProgress(0);
                return null;
            }
        }

        // Verify input slot still has a valid recipe
        var verifyInput = this._slots[1];
        if (!verifyInput || verifyInput.isEmpty()) {
            this._isBurning = false;
            this._burnProgress = 0;
            this._cookingTime = 0;
            this._lastProgressPercent = -1;
            this.setProgress(0);
            return null;
        }

        var verifyRecipe = this._getSmeltRecipe(verifyInput.getItemId());
        if (!verifyRecipe) {
            this._isBurning = false;
            this._burnProgress = 0;
            this._cookingTime = 0;
            this._lastProgressPercent = -1;
            this.setProgress(0);
            return null;
        }

        // Advance burn progress by one tick using recipe cooking time
        this._burnProgress += 1.0 / this._cookingTime;

        // Clamp progress to 1.0 max
        if (this._burnProgress > 1.0) this._burnProgress = 1.0;

        // Update DOM display and emit event only on meaningful changes (throttle to 1% increments)
        var currentPercent = Math.floor(this._burnProgress * 100);
        if (currentPercent !== this._lastProgressPercent) {
            this._lastProgressPercent = currentPercent;
            this.setProgress(this._burnProgress);
        }

        // Check if smelting is complete
        if (this._burnProgress >= 1.0) {
            var result = this._produceOutput();

            // Reset progress and cooking time for next recipe
            this._burnProgress = 0;
            this._cookingTime = 0;
            this._lastProgressPercent = -1;
            this.setProgress(0);

            // Emit slot change for output if produced
            if (result && result.outputStack && this._listeners.onSlotChange) {
                for (var i = 0; i < this._listeners.onSlotChange.length; i++) {
                    try { this._listeners.onSlotChange[i](2, this._slots[2], null); } catch (e) { }
                }
            }

            // Emit onOutputReady event if listener registered
            if (result && result.outputStack && this._listeners.onOutputReady) {
                for (var j = 0; j < this._listeners.onOutputReady.length; j++) {
                    try { this._listeners.onOutputReady[j](result.outputStack); } catch (e) { }
                }
            }

            // Check if more fuel + input available for continuous smelting
            this._updateBurningState();

            return result || null;
        }

        return null;
    };

    /**
     * setTimer — sets a reference to the Timer instance for tick-based updates with validation.
     * @param {Object} timer - Donkeycraft.Timer instance.
     * @returns {boolean} True if timer was set successfully.
     */
    Donkeycraft.FurnaceUI.prototype.setTimer = function (timer) {
        if (timer === null || timer === undefined) return false;
        // Validate that timer has the required onRender method
        if (typeof timer.onRender !== 'function') return false;
        this._timer = timer;
        return true;
    };

    /**
     * startListening — starts auto-ticking on each render frame while the furnace is burning.
     * Subscribes to Timer.onRender() and calls tick() each frame when _isBurning is true.
     * Safe to call multiple times — only subscribes once.
     */
    Donkeycraft.FurnaceUI.prototype.startListening = function () {
        if (this._unsubscribeRender) return;

        var self = this;
        if (this._timer && typeof this._timer.onRender === 'function') {
            try {
                this._unsubscribeRender = this._timer.onRender(function (timestamp) {
                    if (self._isBurning) {
                        self.tick();
                    }
                });
            } catch (e) { }
        }
    };

    /**
     * stopListening — stops auto-ticking by unsubscribing from the timer render callback.
     * Safe to call multiple times — no-op if already stopped.
     */
    Donkeycraft.FurnaceUI.prototype.stopListening = function () {
        if (this._unsubscribeRender) {
            try { this._unsubscribeRender(); } catch (e) { }
            this._unsubscribeRender = null;
        }
    };

    /**
     * onSlotChange — subscribes to slot change events.
     * @param {Function} callback - Called with (slotIndex, newStack, oldStack) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.FurnaceUI.prototype.onSlotChange = function (callback) {
        this._listeners.onSlotChange.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onSlotChange.indexOf(callback);
            if (idx >= 0) self._listeners.onSlotChange.splice(idx, 1);
        };
    };

    /**
     * onProgressChange — subscribes to progress change events.
     * @param {Function} callback - Called with (progress) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.FurnaceUI.prototype.onProgressChange = function (callback) {
        this._listeners.onProgressChange.push(callback);
        var self = this;
        return function () {
            var idx = self._listeners.onProgressChange.indexOf(callback);
            if (idx >= 0) self._listeners.onProgressChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.FurnaceUI.prototype.destroy = function () {
        this.stopListening();
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._container = null;
        this._fuelSlotEl = null;
        this._inputSlotEl = null;
        this._outputSlotEl = null;
        this._progressBarEl = null;
        this._slots = [];
        this._listeners = {};
    };

})();