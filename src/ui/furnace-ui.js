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

        // Whether the furnace is currently burning
        this._isBurning = false;

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
     * setSlot — sets a slot's content.
     * @param {number} index - Slot index (0=fuel, 1=input, 2=output).
     * @param {Donkeycraft.ItemStack|null} stack - Stack to set.
     */
    Donkeycraft.FurnaceUI.prototype.setSlot = function(index, stack) {
        if (index < 0 || index > 2) return;
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
    };

    /**
     * getProgress — gets the current burn progress.
     * @returns {number} Progress value (0.0 to 1.0).
     */
    Donkeycraft.FurnaceUI.prototype.getProgress = function() {
        return this._burnProgress;
    };

    /**
     * setProgress — sets the burn progress and updates the DOM.
     * @param {number} pct - Progress value (clamped 0.0 to 1.0).
     */
    Donkeycraft.FurnaceUI.prototype.setProgress = function(pct) {
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
    };

    /**
     * isBurning — checks if the furnace is currently burning.
     * @returns {boolean}
     */
    Donkeycraft.FurnaceUI.prototype.isBurning = function() {
        return this._isBurning;
    };

    /**
     * _updateBurningState — updates the burning state based on fuel and input.
     * @private
     */
    Donkeycraft.FurnaceUI.prototype._updateBurningState = function() {
        // Simple logic: if fuel slot has something and input slot has something, it's burning
        var hasFuel = this._slots[0] && !this._slots[0].isEmpty();
        var hasInput = this._slots[1] && !this._slots[1].isEmpty();
        this._isBurning = hasFuel && hasInput;
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
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._slots = [];
        this._listeners = {};
    };

})();