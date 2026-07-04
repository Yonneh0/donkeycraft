// Donkeycraft — Hunger System
// Hunger mechanics: food level, hydration, starvation damage, auto-regeneration.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Hunger — manages player hunger, hydration, and starvation damage.
     *
     * Food and hydration are tracked separately:
     * - **Food**: max 12 points, displayed as 6 drumstick icons (2 points per icon).
     * - **Hydration**: max 6 points, displayed as 3 water drop icons (2 points per icon).
     * Hydration drains proportionally with food and must be replenished via consumption.
     * @param {Donkeycraft.Player} player - Player entity instance.
     * @param {Donkeycraft.HurtBox} [hurtBox=null] - Optional HurtBox instance for health-based regen/starvation.
     */
    Donkeycraft.Hunger = function (player, hurtBox) {
        this._player = player;
        this._hurtBox = hurtBox || null;

        /**
         * Current food level (0-12, displayed as 6 drumstick icons).
         * Each icon represents 2 food points.
         * @type {number}
         * @private
         */
        this._foodLevel = 12;

        /**
         * Current hydration level (0-6, displayed as 3 water drop icons).
         * Each icon represents 2 hydration points. Drains proportionally with food.
         * @type {number}
         * @private
         */
        this._hydration = 6.0;

        /**
         * Starvation damage timer (seconds toward 1 HP damage when food = 0).
         * @type {number}
         * @private
         */
        this._starvationTimer = 0;
    };

    /**
     * Set the reference to the player's HurtBox system.
     * @param {Donkeycraft.HurtBox} hurtBox - HurtBox instance.
     */
    Donkeycraft.Hunger.prototype.setHurtBox = function (hurtBox) {
        this._hurtBox = hurtBox;
    };

    /**
     * Get the current food level.
     * @returns {number} Food level (0-12).
     */
    Donkeycraft.Hunger.prototype.getFoodLevel = function () {
        return this._foodLevel;
    };

    /**
     * Set the food level.
     * @param {number} level - Food level to set (0-12).
     */
    Donkeycraft.Hunger.prototype.setFoodLevel = function (level) {
        var oldLevel = this._foodLevel;
        this._foodLevel = Math.max(0, Math.min(12, level));

        // Emit hunger change event if food level actually changed
        if (oldLevel !== this._foodLevel && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    delta: this._foodLevel - oldLevel
                });
            } catch (e) { }
        }
    };

    /**
     * Get the current hydration level.
     * @returns {number} Hydration level (0-6).
     */
    Donkeycraft.Hunger.prototype.getHydration = function () {
        return this._hydration;
    };

    /**
     * Set the hydration level.
     * @param {number} hydration - Hydration value to set (0-6).
     */
    Donkeycraft.Hunger.prototype.setHydration = function (hydration) {
        var oldHydration = this._hydration;
        this._hydration = Math.max(0, Math.min(6, hydration));

        // Emit hunger change event if hydration actually changed
        if (oldHydration !== this._hydration && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    hydration: this._hydration,
                    hydrationDelta: this._hydration - oldHydration
                });
            } catch (e) { }
        }
    };

    /**
     * Check if the player is starving (food level = 0).
     * @returns {boolean} True if food level is at zero.
     */
    Donkeycraft.Hunger.prototype.isStarving = function () {
        return this._foodLevel <= 0;
    };

    /**
     * Track previous food level for change detection.
     * @private
     */
    Donkeycraft.Hunger.prototype._prevFoodLevel = 12;

    /**
     * Track previous hydration level for change detection.
     * @private
     */
    Donkeycraft.Hunger.prototype._prevHydration = 6;

    /**
     * Tick the hunger system — handle starvation damage, hydration drain, and auto-regeneration.
     *
     * This is the authoritative source for health regeneration based on hunger state.
     * Hydration is emitted alongside food in `hunger:changed` events for UI updates.
     *
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Hunger.prototype.tick = function (deltaTime) {
        if (!this._player.isAlive()) {
            return;
        }

        var gameMode = this._player.getGameMode();

        // Starvation damage: when food level = 0
        if (this._foodLevel <= 0) {
            this._starvationTimer += deltaTime;
            if (this._starvationTimer >= 4.0) {
                this._starvationTimer = 0;

                if (this._hurtBox) {
                    // Only take starvation damage if health <= 5 (or half max, whichever is lower)
                    var currentHealth = this._hurtBox.getHealth();
                    var threshold = Math.min(5, this._hurtBox.getMaxHealth() / 2);
                    if (currentHealth <= threshold) {
                        this._hurtBox.takeDamage(1, 'starvation');
                    }
                }
            }
        } else {
            // Reset starvation timer when food is available
            this._starvationTimer = 0;
        }

        // Emit hunger change event if food level decreased during tick
        if (this._foodLevel < this._prevFoodLevel && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    hydration: this._hydration,
                    delta: this._foodLevel - this._prevFoodLevel
                });
            } catch (e) { }
        }
        this._prevFoodLevel = this._foodLevel;

        // Emit hydration change event if hydration decreased during tick
        if (this._hydration < this._prevHydration && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    hydration: this._hydration,
                    hydrationDelta: this._hydration - this._prevHydration
                });
            } catch (e) { }
        }
        this._prevHydration = this._hydration;

        // Natural regeneration: when food > 10 (of 12) and health < max
        if (this._foodLevel > 10 && this._hurtBox) {
            if (this._hurtBox.getHealth() < this._hurtBox.getMaxHealth()) {
                // Regen chance: ~25% per second
                if (Math.random() < deltaTime * 0.25) {
                    this._hurtBox.heal(1);
                }
            }
        }
    };

    /**
     * Check if the player has any food remaining.
     * @returns {boolean} True if food level is greater than zero.
     */
    Donkeycraft.Hunger.prototype.hasFood = function () {
        return this._foodLevel > 0;
    };

    /**
     * Reset the hunger system to full state.
     *
     * Restores food to 12 and hydration to 6, emitting a change event.
     */
    Donkeycraft.Hunger.prototype.reset = function () {
        var oldLevel = this._foodLevel;
        var oldHydration = this._hydration;
        this._foodLevel = 12;
        this._hydration = 6.0;
        this._starvationTimer = 0;

        // Emit event for reset
        if ((oldLevel !== 12 || oldHydration !== 6.0) && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: 12,
                    hydration: 6.0,
                    delta: 12 - oldLevel
                });
            } catch (e) { }
        }
    };

    /**
     * Destroy the hunger system and free references.
     */
    Donkeycraft.Hunger.prototype.destroy = function () {
        this._player = null;
        this._hurtBox = null;
    };

})();