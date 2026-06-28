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

        // DOM element references
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
        this.updateFromFood({
            foodLevel: hunger.getFoodLevel()
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

        // Create 10 drumstick containers
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
     * _getDrumstickSVG — return SVG markup for a drumstick in the given state.
     * @private
     * @param {string} state - 'full', 'half', or 'empty'.
     * @returns {string} SVG markup string.
     */
    Donkeycraft.HungerBar.prototype._getDrumstickSVG = function(state) {
        var drumstickPath = 'M4 14 L12 4 C13 3 15 3 15 4 C15 6 13 7 12 8 L4 16 Z';
        var boneCircle = '<circle cx="14" cy="4.5" r="1.8" fill="#f5deb3" stroke="#8b6914" stroke-width="0.5"/>';

        if (state === 'half') {
            // Horizontal half: bottom half filled only
            return '<svg viewBox="0 0 16 18" class="dk-drumstick dk-drumstick-half">' +
                '<defs>' +
                '<clipPath id="dk-drum-clip-bottom"><rect x="0" y="9" width="16" height="9"/></clipPath>' +
                '</defs>' +
                '<g clip-path="url(#dk-drum-clip-bottom)">' +
                '<path d="' + drumstickPath + '" fill="#d4a574" stroke="#8b6914" stroke-width="0.6"/>' +
                boneCircle +
                '</g>' +
                '</svg>';
        }
        if (state === 'full') {
            return '<svg viewBox="0 0 16 18" class="dk-drumstick dk-drumstick-full">' +
                '<path d="' + drumstickPath + '" fill="#d4a574" stroke="#8b6914" stroke-width="0.6"/>' +
                boneCircle +
                '</svg>';
        }
        // Empty — dark outline only
        return '<svg viewBox="0 0 16 18" class="dk-drumstick dk-drumstick-empty-svg">' +
            '<path d="' + drumstickPath + '" fill="rgba(50,40,30,0.2)" stroke="#5a4a2a" stroke-width="0.6"/>' +
            '</svg>';
    };

    /**
     * updateFromFood — main entry point called on hunger:changed events.
     * @param {Object} data - { foodLevel, delta }.
     */
    Donkeycraft.HungerBar.prototype.updateFromFood = function(data) {
        var newFood = Math.max(0, Math.min(20, data.foodLevel || 0));
        var delta = data.delta || 0;

        // Update each drumstick icon
        this._renderDrumsticks(newFood);

        // Animate on change
        if (delta !== 0) {
            this._animateOnFoodChange(delta);
        }

        // Update brown overlay based on food percentage
        this._updateBrownOverlay(newFood);

        // Update state tracking
        this._prevFood = newFood;
    };

    /**
     * _renderDrumsticks — update all 10 drumstick containers to reflect current food level.
     * @private
     * @param {number} foodLevel - Current food level (0-20).
     */
    Donkeycraft.HungerBar.prototype._renderDrumsticks = function(foodLevel) {
        // Each drumstick represents 2 food: full=2, half=1, empty=0
        // Mirrors health: fills right-to-left (9→0), depletes left-to-right (0→9).
        // Health: fills left-to-right (0→9), depletes right-to-left (9→0).
        var remainingFood = Math.max(0, Math.round(foodLevel));

        // Fill from right to left (index 9 first, then 8, ..., down to 0)
        for (var i = 9; i >= 0; i--) {
            var container = this._drumstickContainers[i];
            if (!container) continue;

            var state = 'empty';
            if (remainingFood >= 2) {
                state = 'full';
                remainingFood -= 2;
            } else if (remainingFood === 1) {
                state = 'half';
                remainingFood -= 1;
            }

            // Update class and SVG
            container.className = 'dk-drumstick-container dk-drumstick-' + state;
            container.innerHTML = this._getDrumstickSVG(state);
        }
    };

    /**
     * _animateOnFoodChange — trigger animations based on food delta.
     * @private
     * @param {number} delta - Food change (positive = eating, negative = starving).
     */
    Donkeycraft.HungerBar.prototype._animateOnFoodChange = function(delta) {
        if (delta > 0) {
            // Eating — pulse the drumsticks that were filled
            this._pulseEatenDrumsticks(delta);
        } else if (delta < 0) {
            // Starving — dim the drumsticks that were depleted
            this._dimDepletedDrumsticks(Math.abs(delta));
        }

        // Spawn +/- text effect
        if (delta !== 0) {
            this._spawnHungerText(delta);
        }
    };

    /**
     * _getDrumstickIndex — convert food level to drumstick container index.
     * @private
     * @param {number} food - Food level (0-20).
     * @returns {number} Drumstick container index (0-9).
     */
    Donkeycraft.HungerBar.prototype._getDrumstickIndex = function(food) {
        return Math.floor(Math.max(0, food) / 2);
    };

    /**
     * _pulseEatenDrumsticks — pulse on drumsticks that were just eaten.
     * @private
     * @param {number} foodGain - Amount of food restored.
     */
    Donkeycraft.HungerBar.prototype._pulseEatenDrumsticks = function(foodGain) {
        if (!this._row) return;

        var currentFood = this._prevFood;
        var oldFood = currentFood - foodGain;

        // Pulse each drumstick that changed state due to eating
        var pulseCount = Math.min(Math.ceil(foodGain / 2), 5);
        for (var i = 0; i < pulseCount && i < this._drumstickContainers.length; i++) {
            var drumIndex = this._getDrumstickIndex(oldFood + (i * 2));
            if (drumIndex < 0 || drumIndex >= this._drumstickContainers.length) continue;
            var container = this._drumstickContainers[drumIndex];
            if (!container) continue;

            container.classList.add('dk-drumstick-eat-pulse');

            var self = this;
            setTimeout(function(el) {
                if (el) el.classList.remove('dk-drumstick-eat-pulse');
            }.bind(this, container), 400);
        }
    };

    /**
     * _dimDepletedDrumsticks — dim drumsticks that were depleted.
     * @private
     * @param {number} foodLoss - Amount of food lost.
     */
    Donkeycraft.HungerBar.prototype._dimDepletedDrumsticks = function(foodLoss) {
        if (!this._row) return;

        var currentFood = this._prevFood;
        var oldFood = currentFood + foodLoss;

        // Dim each drumstick that changed state due to starving
        var dimCount = Math.min(Math.ceil(foodLoss / 2), 5);
        for (var i = 0; i < dimCount && i < this._drumstickContainers.length; i++) {
            var drumIndex = this._getDrumstickIndex(oldFood - (i * 2));
            if (drumIndex < 0 || drumIndex >= this._drumstickContainers.length) continue;
            var container = this._drumstickContainers[drumIndex];
            if (!container) continue;

            container.classList.add('dk-drumstick-dim');

            var self = this;
            setTimeout(function(el) {
                if (el) el.classList.remove('dk-drumstick-dim');
            }.bind(this, container), 300);
        }
    };

    /**
     * _spawnHungerText — spawn floating +X or -X text.
     * @private
     * @param {number} delta - Food change (positive = eat, negative = starve).
     */
    Donkeycraft.HungerBar.prototype._spawnHungerText = function(delta) {
        if (!this._container) return;

        var textEl = document.createElement('div');
        textEl.className = 'dk-hunger-text';
        textEl.textContent = (delta > 0 ? '+' : '') + delta;
        textEl.style.color = delta > 0 ? '#d4a574' : '#8b6914';

        // Position above center of hunger bar
        textEl.style.left = '50%';
        textEl.style.top = '-10px';
        textEl.style.transform = 'translateX(-50%)';

        this._container.appendChild(textEl);

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
            'transition:opacity 400ms ease;' +
            'background:radial-gradient(ellipse at center,rgba(140,80,0,0.15) 0%,rgba(80,50,0,0.35) 100%);';
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

        // Remove flash classes from all drumsticks
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