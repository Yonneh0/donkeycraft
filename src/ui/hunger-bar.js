// Donkeycraft — Hunger Bar UI
// Drumstick-based hunger display: 10 drumstick icons with half-icon granularity.
// Right-aligned (rightmost = first to deplete).
// Listens to hunger:changed events and updates DOM with animations.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * HungerBar — manages the hunger bar DOM, animations, and overlay effects.
     * @param {HTMLElement} container - Parent container for hunger bar DOM.
     * @param {Donkeycraft.Hunger} hunger - Hunger instance to observe.
     */
    Donkeycraft.HungerBar = function(container, hunger) {
        this._hunger = hunger;
        this._container = container;

        // DOM element references (set by _buildDOM)
        this._row = null;              // .dk-hunger-bar-row
        this._drumstickContainers = []; // Array of drumstick container elements
        this._overlay = null;          // .dk-hunger-overlay (full-screen brown overlay)

        // State tracking
        this._prevFood = 0;
        this._shakeTimeout = null;
        this._flashTimeouts = [];

        // Bind + build
        var self = this;
        this._onHungerChanged = function(data) { self.updateFromFood(data); };

        this._buildDOM();
        this._createOverlay();
        this._subscribeToEvents();

        // Capture initial food level BEFORE update to prevent spurious animation delta.
        var initFood = hunger.getFoodLevel();
        this._prevFood = initFood;

        this.updateFromFood({
            foodLevel: initFood
        });
    };

    /**
     * _subscribeToEvents — listen for hunger:changed events.
     * @private
     */
    Donkeycraft.HungerBar.prototype._subscribeToEvents = function() {
        var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
        if (globalBus) {
            try {
                globalBus.on('hunger:changed', this._onHungerChanged);
            } catch (e) {
                Donkeycraft.Logger.warn('HungerBar', 'Failed to subscribe to hunger:changed: ' + e.message);
            }
        } else {
            Donkeycraft.Logger.warn('HungerBar', 'No global EventBus instance available — hunger bar will not receive updates');
        }
    };

    /**
     * _buildDOM — create all hunger bar elements inside the container.
     * @private
     */
    Donkeycraft.HungerBar.prototype._buildDOM = function() {
        var container = this._container;
        if (!container) return;

        container.innerHTML = '';
        container.classList.add('dk-hunger-bar-wrapper');

        // Row container for 10 drumstick slots (right-aligned via flex-end)
        var row = document.createElement('div');
        row.className = 'dk-hunger-bar-row';
        row.style.overflow = 'visible'; // Allow floating text to render outside row bounds

        // Create 10 drumstick containers (index 0 = leftmost, index 9 = rightmost)
        for (var i = 0; i < 10; i++) {
            var drumContainer = document.createElement('div');
            drumContainer.className = 'dk-drumstick-container dk-drumstick-empty';
            drumContainer.innerHTML = this._getDrumstickSVG('empty');
            row.appendChild(drumContainer);
            this._drumstickContainers.push(drumContainer);
        }

        container.appendChild(row);
        this._row = row;
    };

    /**
     * _getDrumstickState — determine the visual state for a given food level at a specific drumstick index.
     * Hunger fills from right to left (index 9 first, then 8, ..., down to 0).
     * @private
     * @param {number} food - Current food level (0-20).
     * @param {number} index - Drumstick container index (0-9).
     * @returns {string} 'full', 'half', or 'empty'.
     */
    Donkeycraft.HungerBar.prototype._getDrumstickState = function(food, index) {
        food = Math.max(0, Math.round(food));
        // Each drumstick represents 2 food points.
        // Index 9 covers food values 19-20, index 8 covers 17-18, ..., index 0 covers 0-1.
        var baseFood = (9 - index) * 2; // food value this drumstick starts at
        var remaining = food - baseFood;
        if (remaining >= 2) return 'full';
        if (remaining === 1) return 'half';
        return 'empty';
    };

    /**
     * _getDrumstickSVG — return SVG markup for a drumstick in the given state.
     * Uses the exact paths from the reference drumstick icon (1024x1024 viewBox).
     * All 3 states share an identical bone shape (whiteBody path with #F2F5FB fill + dark outline).
     *   full  — complete drumstick with all layers and colors
     *   half  — body fills clipped to bottom half, bone fully visible
     *   empty — outlines only, no meat shadow, identical bone
     * @private
     * @param {string} state - 'full', 'half', or 'empty'.
     * @returns {string} SVG markup string.
     */
    Donkeycraft.HungerBar.prototype._getDrumstickSVG = function(state) {
        // Reference SVG paths extracted from ref/drumstick.svg
        var bone = 'M241 919.7c-9.3 4.2-19.4 6.3-29.9 6.1-18.3-0.4-35.2-7.9-47.9-21.1-9.8-10.2-16-22.9-18-36.6-13.6-2.7-26-9.5-35.8-19.7-26-27.2-25-70.6 2.2-96.6 24.3-23.2 61.4-24.9 87.6-5.7L343.8 608c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1L271 822c16.3 26.8 12.4 62.4-11.2 85-5.5 5.2-11.9 9.5-18.8 12.7z';
        var meatFill = 'M358.6 628.4c-6.3-6.6-26 3.7-21.1 8.9 6.6 6.9 7 3.9 13.4 12 12.7 15.9 3 25.2 0.2 27.8l-132 125.3c13.7 22.5 7.3 45.9-7.7 56.6-16.1 11.5-49 13.9-59.4 3.8 2.6 5.4 6.1 10.5 10.4 14.9 10.8 11.3 29.5 31.7 45.2 32.1 9 0.2 17.7-1.6 25.7-5.2 5.9-2.7 11.4-6.4 16.2-11 20.3-19.4 19.6-63.9 5.5-86.9l125-119.4c2.8-2.7 15.7-13.5 15-17.3-2.3-12.2-29.6-34.5-36.4-41.6z';
        var mainBody = 'M314.5 642.2l110.3-400.7s37-66.3 117.1-103.9 244.8-28.7 301.5 51.9C900 270.2 962 423.1 876.1 531.1S408.8 703.5 408.8 703.5L391 658.8l-30.7-24.3-45.8 7.7z';
        var shadowFill = 'M864.7 218.4C830.4 169.6 721 89 635.1 128.2c28.4 11.9 113.6 32.1 147.2 74.2 73.4 92 98.5 206.8 12.6 314.8-58.6 73.7-288 110.2-406.7 136.7l-3.8 56.6s392.8-50.9 478.8-159 58.1-252.4 1.5-333.1z';
        var outlinePath = 'M240 917.4c-9.3 4.2-19.4 6.3-29.9 6.1-18.3-0.4-35.2-7.9-47.9-21.1-9.8-10.2-16-22.9-18-36.6-13.6-2.7-26-9.5-35.8-19.7-26-27.2-25-70.6 2.2-96.6 24.3-23.2 61.4-24.9 87.6-5.7l144.6-138.1c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1L270 819.7c16.3 26.8 12.4 62.4-11.2 85-5.5 5.3-11.9 9.6-18.8 12.7z m-98.3-154c-3.9 1.8-7.5 4.2-10.7 7.3-15.6 14.9-16.1 39.6-1.3 55.2 7.4 7.8 17.5 12 28.4 11.9 4 0 7.9 1.6 10.7 4.5 2.8 2.9 4.2 6.8 4 10.9-0.6 10.9 3.2 21.2 10.6 28.9 7.2 7.5 16.9 11.8 27.3 12.1 10.4 0.2 20.3-3.6 27.9-10.8 15.6-14.9 16.1-39.6 1.3-55.2-5.6-5.9-5.4-15.1 0.5-20.7l141.9-135.6c-6.5-5.1-12.6-10.5-18.1-16.3-4.9-5.1-9.5-10.7-13.9-16.6L208.5 774.5c-2.9 2.8-6.8 4.2-10.8 4-4-0.2-7.8-2-10.4-5-0.3-0.3-1.2-1.5-1.6-2-11.7-12-29.5-14.8-44-8.1z';
        var detailPath = 'M771 634.4c-18.6 8.5-38.5 15.1-59.3 19.5l-348.6 73.8c-6.4 1.4-12.9-1.7-16-7.5-3.1-5.8-1.9-12.9 2.8-17.4l32.4-30.9c-6.5-5.1-12.6-10.5-18.1-16.3-4.9-5.1-9.5-10.7-13.9-16.6l-35.2 33.7c-4.7 4.5-11.9 5.4-17.6 2-5.6-3.3-8.4-10-6.8-16.3l90.9-349.8C414.8 180.9 530 94.4 661.9 98.4c152.7 4.5 275 132.5 272.5 285.2-1.8 110.6-66.5 206.6-163.4 250.8z m-363.5 54l298.2-63.1c115.5-24.5 197.6-124 199.4-242.1 2.2-136.8-107.3-251.4-244.1-255.4-118-3.5-221.3 73.9-250.9 188.2l-77.9 299.9 10.7-10.2c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1l-8 7.7z';
        var eye = 'M474.4 627.1c-3.5 1.6-7.7 1.8-11.5 0.3-1.6-0.7-40.2-16.6-63.3-65.4-3.5-7.3-0.3-16.1 7-19.5 7.4-3.4 16.1-0.3 19.5 7 17.9 37.9 47.4 50.6 47.7 50.7 7.5 3 11.2 11.5 8.2 19.1-1.6 3.6-4.3 6.3-7.6 7.8z';
        var eyeDots = '<circle cx="485.8" cy="334.4" r="16.9" fill="#004364"/><circle cx="500.4" cy="246.1" r="16.9" fill="#004364"/><circle cx="606.6" cy="181.1" r="16.9" fill="#004364"/><circle cx="701.1" cy="211.4" r="16.9" fill="#004364"/><circle cx="588.7" cy="281.2" r="16.9" fill="#004364"/>';

        if (state === 'half') {
            // Body fills clipped to bottom half. Bone, outline, detail, eye, and dots fully visible.
            return '<svg viewBox="0 0 1024 1024" class="dk-drumstick dk-drumstick-half">' +
                '<defs>' +
                '<clipPath id="dk-hunger-clip-bottom">' +
                '<rect x="0" y="512" width="1024" height="512"/>' +
                '</clipPath>' +
                '</defs>' +
                // Bone — identical in all states, fully visible
                '<path d="' + bone + '" fill="#F2F5FB" stroke="#004364" stroke-width="3"/>' +
                // Outline/detail layers — fully visible (not clipped)
                '<path d="' + outlinePath + '" fill="#004364"/>' +
                '<path d="' + detailPath + '" fill="#004364"/>' +
                '<path d="' + eye + '" fill="#004364"/>' +
                eyeDots +
                // Body fills — clipped to bottom half only
                '<g clip-path="url(#dk-hunger-clip-bottom)">' +
                '<path d="' + meatFill + '" fill="#DEEAF4"/>' +
                '<path d="' + mainBody + '" fill="#DD9121"/>' +
                '<path d="' + shadowFill + '" fill="#CE790A"/>' +
                '</g>' +
                '</svg>';
        }
        if (state === 'full') {
            // Complete drumstick: bone + all layers and colors from reference
            return '<svg viewBox="0 0 1024 1024" class="dk-drumstick dk-drumstick-full">' +
                // Bone — identical in all states
                '<path d="' + bone + '" fill="#F2F5FB" stroke="#004364" stroke-width="3"/>' +
                '<path d="' + meatFill + '" fill="#DEEAF4"/>' +
                '<path d="' + mainBody + '" fill="#DD9121"/>' +
                '<path d="' + shadowFill + '" fill="#CE790A"/>' +
                '<path d="' + outlinePath + '" fill="#004364"/>' +
                '<path d="' + detailPath + '" fill="#004364"/>' +
                '<path d="' + eye + '" fill="#004364"/>' +
                eyeDots +
                '</svg>';
        }
        // Empty — outlines only, no meat shadow layer. Bone identical to other states.
        return '<svg viewBox="0 0 1024 1024" class="dk-drumstick dk-drumstick-empty-svg">' +
            // Bone — identical in all states
            '<path d="' + bone + '" fill="#F2F5FB" stroke="#004364" stroke-width="3"/>' +
            // Outlines with thick strokes so visible at small scale (no shadow/meat layers)
            '<path d="' + meatFill + '" fill="none" stroke="#7a6a5a" stroke-width="24"/>' +
            '<path d="' + mainBody + '" fill="none" stroke="#b8760a" stroke-width="24"/>' +
            '<path d="' + outlinePath + '" fill="none" stroke="#004364" stroke-width="32"/>' +
            '<path d="' + detailPath + '" fill="none" stroke="#004364" stroke-width="24"/>' +
            '<path d="' + eye + '" fill="none" stroke="#004364" stroke-width="24"/>' +
            // Bone dots stay filled #004364 in all states
            eyeDots +
            '</svg>';
    };

    /**
     * updateFromFood — main entry point called on hunger:changed events.
     * Clamps values to valid range, recalculates actual delta after clamping, then updates DOM.
     * @param {Object} data - { foodLevel, delta }.
     */
    Donkeycraft.HungerBar.prototype.updateFromFood = function(data) {
        var oldFood = this._prevFood;

        // Clamp to valid range [0, 20]
        var newFood = Math.max(0, Math.min(20, data.foodLevel || 0));

        // Recalculate delta after clamping to ensure displayed +/- matches actual change
        var delta = newFood - oldFood;

        // Update each drumstick icon
        this._renderDrumsticks(newFood);

        // Animate on change (only if food level actually changed)
        if (delta !== 0) {
            this._animateOnFoodChange(delta, oldFood, newFood);
        }

        // Update brown overlay based on food percentage
        this._updateBrownOverlay(newFood);

        // Update state tracking
        this._prevFood = newFood;
    };

    /**
     * _renderDrumsticks — update all 10 drumstick containers to reflect current food level.
     * Fills from right (index 9) to left (index 0), matching Minecraft's hunger behavior.
     * @private
     * @param {number} foodLevel - Current food level (0-20).
     */
    Donkeycraft.HungerBar.prototype._renderDrumsticks = function(foodLevel) {
        for (var i = 0; i < 10; i++) {
            var container = this._drumstickContainers[i];
            if (!container) continue;

            var state = this._getDrumstickState(foodLevel, i);

            // Update class and SVG
            container.className = 'dk-drumstick-container dk-drumstick-' + state;
            container.innerHTML = this._getDrumstickSVG(state);
        }
    };

    /**
     * _animateOnFoodChange — trigger animations based on food delta.
     * @private
     * @param {number} delta - Food change (positive = eating, negative = starving).
     * @param {number} oldFood - Food level before the change.
     * @param {number} newFood - Food level after the change.
     */
    Donkeycraft.HungerBar.prototype._animateOnFoodChange = function(delta, oldFood, newFood) {
        if (delta > 0) {
            // Eating — pulse the drumsticks that were filled
            this._pulseEatenDrumsticks(delta, oldFood, newFood);
        } else if (delta < 0) {
            // Starving — dim the drumsticks that were depleted
            this._dimDepletedDrumsticks(-delta, oldFood, newFood);
        }
    };

    /**
     * _pulseEatenDrumsticks — pulse on the drumsticks that were just eaten.
     * Compares each drumstick's state at oldFood vs newFood and pulses only changed ones.
     * @private
     * @param {number} foodGain - Amount of food restored (positive).
     * @param {number} oldFood - Food level before eating.
     * @param {number} newFood - Food level after eating.
     */
    Donkeycraft.HungerBar.prototype._pulseEatenDrumsticks = function(foodGain, oldFood, newFood) {
        if (!this._row) return;

        var changedIndices = [];

        // Check each drumstick to see if its state changed between oldFood and newFood
        for (var i = 0; i < 10; i++) {
            var oldState = this._getDrumstickState(oldFood, i);
            var newState = this._getDrumstickState(newFood, i);
            if (oldState !== newState) {
                changedIndices.push(i);
            }
        }

        // Pulse each changed drumstick
        for (var j = 0; j < changedIndices.length; j++) {
            var idx = changedIndices[j];
            var container = this._drumstickContainers[idx];
            if (!container) continue;
            container.classList.add('dk-drumstick-eat-pulse');
            var self = this;
            setTimeout((function(el) {
                el.classList.remove('dk-drumstick-eat-pulse');
            }).bind(this, container), 400);
        }

        // Position text above the center of the changed range
        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHungerTextAt(foodGain, centerIdx);
        }
    };

    /**
     * _dimDepletedDrumsticks — dim the drumsticks that were depleted.
     * Compares each drumstick's state at oldFood vs newFood and dims only changed ones.
     * @private
     * @param {number} foodLoss - Amount of food lost (positive value).
     * @param {number} oldFood - Food level before starving.
     * @param {number} newFood - Food level after starving.
     */
    Donkeycraft.HungerBar.prototype._dimDepletedDrumsticks = function(foodLoss, oldFood, newFood) {
        if (!this._row) return;

        var changedIndices = [];

        // Check each drumstick to see if its state changed between oldFood and newFood
        for (var i = 0; i < 10; i++) {
            var oldState = this._getDrumstickState(oldFood, i);
            var newState = this._getDrumstickState(newFood, i);
            if (oldState !== newState) {
                changedIndices.push(i);
            }
        }

        // Dim each changed drumstick
        for (var j = 0; j < changedIndices.length; j++) {
            var idx = changedIndices[j];
            var container = this._drumstickContainers[idx];
            if (!container) continue;
            container.classList.add('dk-drumstick-dim');
            var self = this;
            setTimeout((function(el) {
                el.classList.remove('dk-drumstick-dim');
            }).bind(this, container), 300);
        }

        // Position text above the center of the changed range
        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHungerTextAt(-foodLoss, centerIdx);
        }
    };

    /**
     * _spawnHungerTextAt — spawn floating +/- text at a specific drumstick index.
     * @private
     * @param {number} delta - Food change (positive = eat, negative = starve).
     * @param {number} drumIndex - Index of the affected drumstick (0-9).
     */
    Donkeycraft.HungerBar.prototype._spawnHungerTextAt = function(delta, drumIndex) {
        if (!this._row || !this._drumstickContainers[drumIndex]) return;

        var textEl = document.createElement('div');
        textEl.className = 'dk-hunger-text';
        textEl.textContent = (delta > 0 ? '+' : '') + delta;
        textEl.style.color = delta > 0 ? '#d4a574' : '#8b6914';

        // Position above the changed drumstick container using relative positioning
        var drumContainer = this._drumstickContainers[drumIndex];
        drumContainer.style.position = 'relative';
        textEl.style.left = '50%';
        textEl.style.top = '-16px';
        textEl.style.transform = 'translateX(-50%)';

        drumContainer.appendChild(textEl);

        // Remove after animation completes
        setTimeout((function(el) {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }).bind(this, textEl), 800);
    };

    /**
     * _updateBrownOverlay — update the full-screen brown overlay opacity based on food level.
     * @private
     * @param {number} foodLevel - Current food level (0-20).
     */
    Donkeycraft.HungerBar.prototype._updateBrownOverlay = function(foodLevel) {
        if (!this._overlay) return;

        var f = Math.max(0, Math.min(20, foodLevel));
        // 66% opacity at 0 food → 0% opacity at 6 food → stays 0% above 6 food
        var opacity = 0;
        if (f < 6) {
            opacity = 0.66 - ((f / 6) * 0.66); // 0.66 at f=0, 0 at f=6
        }
        this._overlay.style.opacity = Math.max(0, opacity);
    };

    /**
     * _createOverlay — create the full-screen brown overlay element.
     * @private
     */
    Donkeycraft.HungerBar.prototype._createOverlay = function() {
        var overlay = document.createElement('div');
        overlay.className = 'dk-hunger-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:6;opacity:0;' +
            'transition:opacity 300ms ease;';
        document.body.appendChild(overlay);
        this._overlay = overlay;
    };

    /**
     * resetUI — clear all animations and effects.
     */
    Donkeycraft.HungerBar.prototype.resetUI = function() {
        // Clear shake timeout
        if (this._shakeTimeout) clearTimeout(this._shakeTimeout);

        // Clear flash timeouts
        for (var i = 0; i < this._flashTimeouts.length; i++) {
            clearTimeout(this._flashTimeouts[i]);
        }
        this._flashTimeouts = [];

        // Remove animation classes from all drumsticks
        for (var j = 0; j < this._drumstickContainers.length; j++) {
            if (this._drumstickContainers[j]) {
                this._drumstickContainers[j].classList.remove('dk-drumstick-eat-pulse', 'dk-drumstick-dim');
            }
        }

        // Reset overlay
        if (this._overlay) {
            this._overlay.style.opacity = '0';
        }
    };

    /**
     * destroy — clean up all DOM and event listeners.
     */
    Donkeycraft.HungerBar.prototype.destroy = function() {
        this.resetUI();

        // Unsubscribe from events
        var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
        if (globalBus && this._onHungerChanged) {
            try {
                globalBus.off('hunger:changed', this._onHungerChanged);
            } catch (e) {}
        }

        // Remove overlay from DOM
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }

        // Clean up container
        if (this._container) {
            this._container.innerHTML = '';
        }

        // Null out references
        this._hunger = null;
        this._container = null;
        this._row = null;
        this._drumstickContainers = [];
        this._overlay = null;
        this._onHungerChanged = null;
    };

})();