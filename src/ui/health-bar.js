// Donkeycraft — Health Bar UI
// Heart-based health display: 10 heart containers with half-heart granularity.
// Listens to health:changed events and updates DOM with animations.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * HealthBar — manages the health bar DOM, animations, and overlay effects.
     * @param {HTMLElement} container - Parent container for health bar DOM.
     * @param {Donkeycraft.HurtBox} hurtBox - HurtBox instance to observe.
     */
    Donkeycraft.HealthBar = function (container, hurtBox) {
        this._hurtBox = hurtBox;
        this._container = container;

        // DOM element references (set by _buildDOM)
        this._row = null;              // .dk-health-bar-row
        this._heartContainers = [];    // Array of heart container elements
        this._overlay = null;          // .dk-health-overlay (full-screen red overlay)

        // State tracking
        this._prevHealth = 0;
        this._shakeTimeout = null;
        this._flashTimeouts = [];

        // Bind + build
        var self = this;
        this._onHealthChanged = function (data) { self.updateFromHealth(data); };

        this._buildDOM();
        this._createOverlay();
        this._subscribeToEvents();

        // Capture initial values BEFORE update to prevent spurious animation delta.
        // _prevHealth is set inside updateFromHealth, so we call it without triggering animations.
        var initHealth = hurtBox.getHealth();
        var initMaxHealth = hurtBox.getMaxHealth();
        this._prevHealth = initHealth;

        this.updateFromHealth({
            health: initHealth,
            maxHealth: initMaxHealth
        });
    };

    /**
     * _subscribeToEvents — listen for health:changed events.
     * @private
     */
    Donkeycraft.HealthBar.prototype._subscribeToEvents = function () {
        var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
        if (globalBus) {
            try {
                globalBus.on('health:changed', this._onHealthChanged);
            } catch (e) {
                Donkeycraft.Logger.warn('HealthBar', 'Failed to subscribe to health:changed: ' + e.message);
            }
        } else {
            Donkeycraft.Logger.warn('HealthBar', 'No global EventBus instance available — health bar will not receive updates');
        }
    };

    /**
     * _buildDOM — create all health bar elements inside the container.
     * @private
     */
    Donkeycraft.HealthBar.prototype._buildDOM = function () {
        var container = this._container;
        if (!container) return;

        container.innerHTML = '';
        container.classList.add('dk-health-bar-wrapper');

        // Row container for 10 heart slots
        var row = document.createElement('div');
        row.className = 'dk-health-bar-row';
        row.style.overflow = 'visible'; // Allow floating text to render outside row bounds

        // Create 10 heart containers
        for (var i = 0; i < 10; i++) {
            var heartContainer = document.createElement('div');
            heartContainer.className = 'dk-heart-container dk-heart-empty';
            heartContainer.innerHTML = this._getHeartSVG('empty');
            row.appendChild(heartContainer);
            this._heartContainers.push(heartContainer);
        }

        container.appendChild(row);
        this._row = row;
    };

    /**
     * _getHeartState — determine the visual state for a given HP value at a specific heart index.
     * @private
     * @param {number} hp - Current health points (0-20).
     * @param {number} index - Heart container index (0-9).
     * @returns {string} 'full', 'half', or 'empty'.
     */
    Donkeycraft.HealthBar.prototype._getHeartState = function (hp, index) {
        hp = Math.max(0, Math.round(hp));
        var remaining = hp - (index * 2); // HP remaining after filling hearts before this one
        if (remaining >= 2) return 'full';
        if (remaining === 1) return 'half';
        return 'empty';
    };

    /**
     * _getHeartSVG — return SVG markup for a heart in the given state.
     * @private
     * @param {string} state - 'full', 'half', or 'empty'.
     * @returns {string} SVG markup string.
     */
    Donkeycraft.HealthBar.prototype._getHeartSVG = function (state) {
        if (state === 'half') {
            // Full heart outline with bottom half filled red, top half dark
            return '<svg viewBox="0 0 16 18" class="dk-heart dk-heart-half">' +
                '<defs>' +
                '<clipPath id="dk-heart-clip-bottom"><rect x="0" y="9" width="16" height="9"/></clipPath>' +
                '<clipPath id="dk-heart-clip-top"><rect x="0" y="0" width="16" height="9"/></clipPath>' +
                '</defs>' +
                // Dark outline (always visible)
                '<path d="M8 16 L2 10 C-1 6 3 2 8 6 C13 2 17 6 14 10 Z" fill="rgba(50,30,30,0.3)" stroke="#5a1a1a" stroke-width="0.8"/>' +
                // Bottom half filled red
                '<g clip-path="url(#dk-heart-clip-bottom)">' +
                '<path d="M8 16 L2 10 C-1 6 3 2 8 6 C13 2 17 6 14 10 Z" fill="#e74c3c" stroke="none"/>' +
                '</g>' +
                '</svg>';
        }
        if (state === 'full') {
            return '<svg viewBox="0 0 16 18" class="dk-heart dk-heart-full">' +
                '<path d="M8 16 L2 10 C-1 6 3 2 8 6 C13 2 17 6 14 10 Z" fill="#e74c3c" stroke="#5a1a1a" stroke-width="0.8"/>' +
                '</svg>';
        }
        // Empty — dark outline only
        return '<svg viewBox="0 0 16 18" class="dk-heart dk-heart-empty-svg">' +
            '<path d="M8 16 L2 10 C-1 6 3 2 8 6 C13 2 17 6 14 10 Z" fill="rgba(50,30,30,0.3)" stroke="#5a1a1a" stroke-width="0.8"/>' +
            '</svg>';
    };

    /**
     * updateFromHealth — main entry point called on health:changed events.
     * Clamps values to valid range, recalculates actual delta after clamping, then updates DOM.
     * @param {Object} data - { health, maxHealth, delta }.
     */
    Donkeycraft.HealthBar.prototype.updateFromHealth = function (data) {
        var maxHealth = data.maxHealth || 20;
        var oldHealth = this._prevHealth;

        // Clamp to valid range [0, maxHealth]
        var newHealth = Math.max(0, Math.min(maxHealth, data.health || 0));

        // Recalculate delta after clamping to ensure displayed +/- matches actual change
        var delta = newHealth - oldHealth;

        // Update each heart container
        this._renderHearts(newHealth, maxHealth);

        // Animate on change (only if health actually changed)
        if (delta !== 0) {
            this._animateOnHealthChange(delta, oldHealth, newHealth);
        }

        // Update red overlay based on health percentage
        this._updateRedOverlay(newHealth, maxHealth);

        // Update state tracking
        this._prevHealth = newHealth;
    };

    /**
     * _renderHearts — update all 10 heart containers to reflect current health.
     * Fills from left (index 0) to right (index 9), matching Minecraft's behavior.
     * @private
     * @param {number} health - Current health points (0-20).
     * @param {number} maxHealth - Maximum health points.
     */
    Donkeycraft.HealthBar.prototype._renderHearts = function (health, maxHealth) {
        for (var i = 0; i < 10; i++) {
            var container = this._heartContainers[i];
            if (!container) continue;

            var state = this._getHeartState(health, i);

            // Update class and SVG
            container.className = 'dk-heart-container dk-heart-' + state;
            container.innerHTML = this._getHeartSVG(state);
        }
    };

    /**
     * _animateOnHealthChange — trigger animations based on health delta.
     * @private
     * @param {number} delta - Health change (negative = damage, positive = healing).
     * @param {number} oldHealth - Health before the change.
     * @param {number} newHealth - Health after the change.
     */
    Donkeycraft.HealthBar.prototype._animateOnHealthChange = function (delta, oldHealth, newHealth) {
        if (delta < 0) {
            // Damage taken — shake the health bar and flash damaged hearts
            this._triggerShake();
            this._flashDamagedHearts(delta, oldHealth, newHealth);

            // Screen shake if health drops below 3 hearts (6 HP)
            if (newHealth < 6) {
                this._triggerScreenShake();
            }
        } else if (delta > 0) {
            // Healing — flash healed hearts white
            this._flashHealedHearts(delta, oldHealth, newHealth);
        }
    };

    /**
     * _triggerShake — shake the health bar container for 0.5s.
     * @private
     */
    Donkeycraft.HealthBar.prototype._triggerShake = function () {
        if (!this._container) return;

        // Clear any existing shake
        if (this._shakeTimeout) {
            clearTimeout(this._shakeTimeout);
        }

        this._container.style.animation = 'health-shake 500ms ease-out';

        var self = this;
        this._shakeTimeout = setTimeout(function () {
            if (self._container) {
                self._container.style.animation = 'none';
                void self._container.offsetWidth; // force reflow
            }
        }, 500);
    };

    /**
     * _triggerScreenShake — shake the entire game canvas area.
     * @private
     */
    Donkeycraft.HealthBar.prototype._triggerScreenShake = function () {
        var canvasContainer = document.getElementById('dk-canvas-container');
        if (!canvasContainer) return;

        canvasContainer.style.animation = 'screen-shake-health 400ms ease-out';

        var self = this;
        setTimeout(function () {
            if (canvasContainer) {
                canvasContainer.style.animation = 'none';
                void canvasContainer.offsetWidth;
            }
        }, 400);
    };

    /**
     * _flashDamagedHearts — flash the hearts that took damage with a red pulse.
     * @private
     * @param {number} delta - Health change (negative value representing damage taken).
     * @param {number} oldHealth - Health before the damage.
     * @param {number} newHealth - Health after the damage.
     */
    Donkeycraft.HealthBar.prototype._flashDamagedHearts = function (delta, oldHealth, newHealth) {
        if (!this._row) return;

        // Hearts change from oldHealth down to newHealth.
        // Heart i covers HP range [i*2, i*2+1].
        // The damaged hearts are those whose index is between floor(newHealth/2) and floor((oldHealth-1)/2).
        var startIdx = Math.min(9, Math.floor((oldHealth - 1) / 2)); // rightmost damaged heart
        var endIdx = Math.floor(newHealth / 2);                        // leftmost damaged heart

        // Ensure valid range
        if (startIdx < 0) startIdx = 0;
        if (endIdx > 9) endIdx = 9;

        // Flash each damaged heart
        for (var i = startIdx; i >= endIdx && i >= 0; i--) {
            var container = this._heartContainers[i];
            if (!container) continue;
            container.classList.add('dk-heart-flash');
            var self = this;
            setTimeout((function (el) {
                el.classList.remove('dk-heart-flash');
            }).bind(this, container), 200);
        }

        // Position text above the center of the damaged range
        var centerIdx = Math.round((startIdx + endIdx) / 2);
        this._spawnHealthTextAt(delta, centerIdx);
    };

    /**
     * _flashHealedHearts — flash the hearts that were healed with a white/green pulse.
     * @private
     * @param {number} delta - Health change (positive value representing healing).
     * @param {number} oldHealth - Health before healing.
     * @param {number} newHealth - Health after healing.
     */
    Donkeycraft.HealthBar.prototype._flashHealedHearts = function (delta, oldHealth, newHealth) {
        if (!this._row) return;

        // Hearts change from oldHealth up to newHealth.
        // The healed hearts are those whose index is between floor(oldHealth/2) and floor((newHealth-1)/2).
        var startIdx = Math.floor(oldHealth / 2);       // leftmost healed heart
        var endIdx = Math.min(9, Math.floor((newHealth - 1) / 2)); // rightmost healed heart

        // Ensure valid range
        if (startIdx > 9) startIdx = 9;
        if (endIdx < 0) endIdx = 0;

        // Flash each healed heart
        for (var i = startIdx; i <= endIdx && i >= 0; i++) {
            var container = this._heartContainers[i];
            if (!container) continue;
            container.classList.add('dk-heart-heal-flash');
            var self = this;
            setTimeout((function (el) {
                el.classList.remove('dk-heart-heal-flash');
            }).bind(this, container), 300);
        }

        // Position text above the center of the healed range
        var centerIdx = Math.round((startIdx + endIdx) / 2);
        this._spawnHealthTextAt(delta, centerIdx);
    };

    /**
     * _spawnHealthTextAt — spawn floating +/- text at a specific heart index.
     * @private
     * @param {number} delta - Health change (positive = heal, negative = damage).
     * @param {number} heartIndex - Index of the affected heart (0-9).
     */
    Donkeycraft.HealthBar.prototype._spawnHealthTextAt = function (delta, heartIndex) {
        if (!this._row || !this._heartContainers[heartIndex]) return;

        var textEl = document.createElement('div');
        textEl.className = 'dk-health-text';
        textEl.textContent = (delta > 0 ? '+' : '') + delta;
        textEl.style.color = delta > 0 ? '#2ecc71' : '#e74c3c';

        // Position above the changed heart container using relative positioning
        var heartContainer = this._heartContainers[heartIndex];
        heartContainer.style.position = 'relative';
        textEl.style.left = '50%';
        textEl.style.top = '-16px';
        textEl.style.transform = 'translateX(-50%)';

        heartContainer.appendChild(textEl);

        // Remove after animation completes
        setTimeout((function (el) {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }).bind(this, textEl), 800);
    };

    /**
     * _updateRedOverlay — update the full-screen red overlay opacity based on health.
     * @private
     * @param {number} health - Current health (0-20).
     * @param {number} maxHealth - Maximum health (20).
     */
    Donkeycraft.HealthBar.prototype._updateRedOverlay = function (health, maxHealth) {
        if (!this._overlay) return;

        var h = Math.max(0, Math.min(maxHealth || 20, health));
        // 85% opacity at 0 HP → 0% opacity at 6 HP → stays 0% above 6 HP
        var opacity = 0;
        if (h < 6) {
            opacity = 0.85 - ((h / 6) * 0.85); // 0.85 at h=0, 0 at h=6
        }
        this._overlay.style.opacity = Math.max(0, opacity);
    };

    /**
     * _createOverlay — create the full-screen red overlay element.
     * @private
     */
    Donkeycraft.HealthBar.prototype._createOverlay = function () {
        var overlay = document.createElement('div');
        overlay.className = 'dk-health-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:5;opacity:0;' +
            'transition:opacity 300ms ease;' +
            'background:radial-gradient(ellipse at center,rgba(200,0,0,0.2) 0%,rgba(120,0,0,0.5) 100%);';
        document.body.appendChild(overlay);
        this._overlay = overlay;
    };

    /**
     * resetUI — clear all animations and effects.
     */
    Donkeycraft.HealthBar.prototype.resetUI = function () {
        // Clear shake timeout
        if (this._shakeTimeout) clearTimeout(this._shakeTimeout);

        // Clear flash timeouts
        for (var i = 0; i < this._flashTimeouts.length; i++) {
            clearTimeout(this._flashTimeouts[i]);
        }
        this._flashTimeouts = [];

        // Remove flash classes from all hearts
        for (var j = 0; j < this._heartContainers.length; j++) {
            if (this._heartContainers[j]) {
                this._heartContainers[j].classList.remove('dk-heart-flash', 'dk-heart-heal-flash');
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
    Donkeycraft.HealthBar.prototype.destroy = function () {
        this.resetUI();

        // Unsubscribe from events
        var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
        if (globalBus && this._onHealthChanged) {
            try {
                globalBus.off('health:changed', this._onHealthChanged);
            } catch (e) { }
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
        this._hurtBox = null;
        this._container = null;
        this._row = null;
        this._heartContainers = [];
        this._overlay = null;
        this._onHealthChanged = null;
    };

})();