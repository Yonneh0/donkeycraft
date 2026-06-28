// Donkeycraft — Health Bar UI
// Heart-based health display: 10 heart containers with half-heart granularity.
// Listens to health:changed events and updates DOM with animations.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * HealthBar — manages the health bar DOM, animations, and overlay effects.
     * @param {HTMLElement} container - Parent container for health bar DOM.
     * @param {Donkeycraft.HurtBox} hurtBox - HurtBox instance to observe.
     */
    Donkeycraft.HealthBar = function(container, hurtBox) {
        this._hurtBox = hurtBox;
        this._container = container;

        // DOM element references
        this._row = null;              // .dk-health-bar-row
        this._heartContainers = [];    // Array of heart container elements
        this._overlay = null;          // .dk-health-overlay (full-screen red overlay)

        // State tracking
        this._prevHealth = 0;
        this._shakeTimeout = null;
        this._flashTimeouts = [];

        // Bind + build
        var self = this;
        this._onHealthChanged = function(data) { self.updateFromHealth(data); };

        this._buildDOM();
        this._createOverlay();
        this._subscribeToEvents();
        this.updateFromHealth({
            health: hurtBox.getHealth(),
            maxHealth: hurtBox.getMaxHealth()
        });
    };

    /**
     * _subscribeToEvents — listen for health:changed events.
     * @private
     */
    Donkeycraft.HealthBar.prototype._subscribeToEvents = function() {
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
    Donkeycraft.HealthBar.prototype._buildDOM = function() {
        var container = this._container;
        if (!container) return;

        container.innerHTML = '';
        container.classList.add('dk-health-bar-wrapper');

        // Row container for 10 heart slots
        var row = document.createElement('div');
        row.className = 'dk-health-bar-row';

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
     * _getHeartSVG — return SVG markup for a heart in the given state.
     * @private
     * @param {string} state - 'full', 'half', or 'empty'.
     * @returns {string} SVG markup string.
     */
    Donkeycraft.HealthBar.prototype._getHeartSVG = function(state) {
        if (state === 'half') {
            return '<svg viewBox="0 0 16 18" class="dk-heart dk-heart-half">' +
                '<defs>' +
                '<clipPath id="dk-heart-clip-left"><rect x="0" y="0" width="8" height="18"/></clipPath>' +
                '</defs>' +
                '<g clip-path="url(#dk-heart-clip-left)">' +
                '<path d="M8 16 L2 10 C-1 6 3 2 8 6 C13 2 17 6 14 10 Z" fill="#e74c3c" stroke="#5a1a1a" stroke-width="0.8"/>' +
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
     * @param {Object} data - { health, maxHealth, delta }.
     */
    Donkeycraft.HealthBar.prototype.updateFromHealth = function(data) {
        var newHealth = Math.max(0, Math.min(data.maxHealth || 20, data.health || 0));
        var maxHealth = data.maxHealth || 20;
        var delta = data.delta || 0;

        // Update each heart container
        this._renderHearts(newHealth, maxHealth);

        // Animate on change
        if (delta !== 0) {
            this._animateOnHealthChange(delta);
        }

        // Update red overlay based on health percentage
        this._updateRedOverlay(newHealth, maxHealth);

        // Update state tracking
        this._prevHealth = newHealth;
    };

    /**
     * _renderHearts — update all 10 heart containers to reflect current health.
     * @private
     * @param {number} health - Current health points (0-20).
     * @param {number} maxHealth - Maximum health points.
     */
    Donkeycraft.HealthBar.prototype._renderHearts = function(health, maxHealth) {
        // Each heart = 2 HP (full), 1 HP (half), 0 HP (empty) for 20 max health
        var totalHearts = 10;
        var hpPerHeart = maxHealth / totalHearts;

        for (var i = 0; i < totalHearts; i++) {
            var container = this._heartContainers[i];
            if (!container) continue;

            // Calculate how much of this heart is filled
            var remainingHP = Math.max(0, health - i * hpPerHeart);
            var fillRatio = Math.min(1, remainingHP / hpPerHeart);

            var state = 'empty';
            if (fillRatio >= 0.99) {
                state = 'full';
            } else if (fillRatio >= 0.4) {
                state = 'half';
            }

            // Update class and SVG
            container.className = 'dk-heart-container dk-heart-' + state;
            container.innerHTML = this._getHeartSVG(state);
        }
    };

    /**
     * _animateOnHealthChange — trigger animations based on health delta.
     * @private
     * @param {number} delta - Health change (negative = damage, positive = healing).
     */
    Donkeycraft.HealthBar.prototype._animateOnHealthChange = function(delta) {
        if (delta < 0) {
            // Damage taken — shake the health bar
            this._triggerShake();

            // Flash damaged hearts red
            this._flashDamagedHearts(Math.abs(delta));

            // Screen shake if health drops below 3 hearts (6 HP)
            if (this._prevHealth < 6) {
                this._triggerScreenShake();
            }
        } else if (delta > 0) {
            // Healing — flash healed hearts white
            this._flashHealedHearts(delta);
        }

        // Spawn +/- text effect
        if (delta !== 0) {
            this._spawnHealthText(delta);
        }
    };

    /**
     * _triggerShake — shake the health bar container for 0.5s.
     * @private
     */
    Donkeycraft.HealthBar.prototype._triggerShake = function() {
        if (!this._container) return;

        // Clear any existing shake
        if (this._shakeTimeout) {
            clearTimeout(this._shakeTimeout);
        }

        this._container.style.animation = 'health-shake 500ms ease-out';

        var self = this;
        this._shakeTimeout = setTimeout(function() {
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
    Donkeycraft.HealthBar.prototype._triggerScreenShake = function() {
        var canvasContainer = document.getElementById('dk-canvas-container');
        if (!canvasContainer) return;

        canvasContainer.style.animation = 'screen-shake-health 400ms ease-out';

        var self = this;
        setTimeout(function() {
            if (canvasContainer) {
                canvasContainer.style.animation = 'none';
                void canvasContainer.offsetWidth;
            }
        }, 400);
    };

    /**
     * _flashDamagedHearts — flash the hearts that took damage.
     * @private
     * @param {number} damageAmount - Amount of damage taken.
     */
    Donkeycraft.HealthBar.prototype._flashDamagedHearts = function(damageAmount) {
        if (!this._row) return;

        var maxHealth = this._hurtBox.getMaxHealth() || 20;
        var currentHealth = this._prevHealth;
        var hpPerHeart = maxHealth / 10;

        // Flash the hearts that are now at or below current health
        var flashCount = Math.min(Math.ceil(damageAmount / 2), 5); // flash up to 5 hearts
        for (var i = 0; i < flashCount && i < this._heartContainers.length; i++) {
            var container = this._heartContainers[i];
            if (!container) continue;

            // Apply red flash class
            container.classList.add('dk-heart-flash');

            var self = this;
            setTimeout(function(el) {
                if (el) el.classList.remove('dk-heart-flash');
            }.bind(this, container), 200);
        }
    };

    /**
     * _flashHealedHearts — flash the hearts that were healed.
     * @private
     * @param {number} healAmount - Amount of healing.
     */
    Donkeycraft.HealthBar.prototype._flashHealedHearts = function(healAmount) {
        if (!this._row) return;

        var maxHealth = this._hurtBox.getMaxHealth() || 20;
        var currentHealth = this._prevHealth;
        var hpPerHeart = maxHealth / 10;

        // Flash the hearts that were just healed (rightmost damaged hearts)
        var flashCount = Math.min(Math.ceil(healAmount / 2), 5);
        for (var i = 0; i < flashCount && i < this._heartContainers.length; i++) {
            var container = this._heartContainers[this._heartContainers.length - 1 - i];
            if (!container) continue;

            container.classList.add('dk-heart-heal-flash');

            var self = this;
            setTimeout(function(el) {
                if (el) el.classList.remove('dk-heart-heal-flash');
            }.bind(this, container), 300);
        }
    };

    /**
     * _spawnHealthText — spawn floating +X or -X text.
     * @private
     * @param {number} delta - Health change (positive = heal, negative = damage).
     */
    Donkeycraft.HealthBar.prototype._spawnHealthText = function(delta) {
        if (!this._container) return;

        var textEl = document.createElement('div');
        textEl.className = 'dk-health-text';
        textEl.textContent = (delta > 0 ? '+' : '') + delta;
        textEl.style.color = delta > 0 ? '#2ecc71' : '#e74c3c';

        // Position above center of health bar
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
     * _updateRedOverlay — update the full-screen red overlay opacity based on health.
     * @private
     * @param {number} health - Current health (0-20).
     * @param {number} maxHealth - Maximum health (20).
     */
    Donkeycraft.HealthBar.prototype._updateRedOverlay = function(health, maxHealth) {
        if (!this._overlay) return;

        var ratio = health / (maxHealth || 20);
        // Opacity: 0% at full health → 30% at 0 health
        var opacity = Math.max(0, (1 - ratio) * 0.3);
        this._overlay.style.opacity = opacity;
    };

    /**
     * _createOverlay — create the full-screen red overlay element.
     * @private
     */
    Donkeycraft.HealthBar.prototype._createOverlay = function() {
        var overlay = document.createElement('div');
        overlay.className = 'dk-health-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:5;opacity:0;' +
            'transition:opacity 400ms ease;';
        document.body.appendChild(overlay);
        this._overlay = overlay;
    };

    /**
     * resetUI — clear all animations and effects.
     */
    Donkeycraft.HealthBar.prototype.resetUI = function() {
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
    Donkeycraft.HealthBar.prototype.destroy = function() {
        this.resetUI();

        // Unsubscribe from events
        var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
        if (globalBus && this._onHealthChanged) {
            try {
                globalBus.off('health:changed', this._onHealthChanged);
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
        this._hurtBox = null;
        this._container = null;
        this._row = null;
        this._heartContainers = [];
        this._overlay = null;
        this._onHealthChanged = null;
    };

})();