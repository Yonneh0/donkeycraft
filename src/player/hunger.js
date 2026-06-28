// Donkeycraft — Hunger System
// Hunger mechanics: food level, saturation, starvation damage, auto-regeneration.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Hunger — manages player hunger, saturation, and starvation.
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.Hunger = function(player) {
        this._player = player;

        /**
         * Current food level (0-20, displayed as 10 hunger icons).
         * @type {number}
         * @private
         */
        this._foodLevel = 20;

        /**
         * Current saturation level (bonus regeneration pool).
         * @type {number}
         * @private
         */
        this._saturation = 20.0;

        /**
         * Starvation damage timer (ticks toward 1 HP damage when food = 0).
         * @type {number}
         * @private
         */
        this._starvationTimer = 0;

        /**
         * Reference to the player's HurtBox system (if available).
         * @type {Donkeycraft.HurtBox|null}
         * @private
         */
        this._hurtBox = null;
    };

    /**
     * Set the reference to the player's HurtBox system.
     * @param {Donkeycraft.HurtBox} hurtBox - HurtBox instance.
     */
    Donkeycraft.Hunger.prototype.setHurtBox = function(hurtBox) {
        this._hurtBox = hurtBox;
    };

    /**
     * Get the current food level.
     * @returns {number} Food level (0-20).
     */
    Donkeycraft.Hunger.prototype.getFoodLevel = function() {
        return this._foodLevel;
    };

    /**
     * Set the food level.
     * @param {number} level - Food level to set (0-20).
     */
    Donkeycraft.Hunger.prototype.setFoodLevel = function(level) {
        var oldLevel = this._foodLevel;
        this._foodLevel = Math.max(0, Math.min(20, level));

        // Emit hunger change event if food level actually changed
        if (oldLevel !== this._foodLevel && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    delta: this._foodLevel - oldLevel
                });
            } catch (e) {}
        }
    };

    /**
     * Get the current saturation level.
     * @returns {number} Saturation value.
     */
    Donkeycraft.Hunger.prototype.getSaturation = function() {
        return this._saturation;
    };

    /**
     * Set the saturation level.
     * @param {number} saturation - Saturation value to set.
     */
    Donkeycraft.Hunger.prototype.setSaturation = function(saturation) {
        this._saturation = Math.max(0, saturation);
    };

    /**
     * Check if the player is starving (food level = 0).
     * @returns {boolean}
     */
    Donkeycraft.Hunger.prototype.isStarving = function() {
        return this._foodLevel <= 0;
    };

    /**
     * Consume a food item, restoring food level and saturation.
     * @param {number} foodValue - Food points to restore (1-5).
     * @param {number} [saturationRatio=0.6] - Saturation-to-food ratio (0-1).
     * @returns {number} Actual food restored.
     */
    Donkeycraft.Hunger.prototype.consumeFood = function(foodValue, saturationRatio) {
        saturationRatio = saturationRatio || 0.6;

        // Clamp food value to valid range
        foodValue = Math.max(1, Math.min(5, foodValue));

        // Calculate how much food can actually be restored
        var oldFoodLevel = this._foodLevel;
        this._foodLevel = Math.min(20, this._foodLevel + foodValue);
        var foodRestored = this._foodLevel - oldFoodLevel;

        // Saturation is capped at food level * 2 (Minecraft mechanic)
        var saturationGain = foodRestored * saturationRatio;
        var maxSaturation = this._foodLevel * 2;
        this._saturation = Math.min(maxSaturation, this._saturation + saturationGain);

        // Emit hunger change event if food level actually changed
        if (foodRestored > 0 && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    delta: foodRestored
                });
            } catch (e) {}
        }

        return foodRestored;
    };

    /**
     * Track previous food level for change detection.
     * @private
     */
    Donkeycraft.Hunger.prototype._prevFoodLevel = 20;

    /**
     * Tick the hunger system — handle starvation damage and auto-regeneration.
     * This is the authoritative source for health regeneration based on hunger state.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Hunger.prototype.tick = function(deltaTime) {
        if (!this._player.isAlive()) {
            return;
        }

        var gameMode = this._player.getGameMode();

        // Creative mode: no hunger mechanics, full food and saturation
        if (gameMode === 'creative') {
            if (this._foodLevel !== 20 || this._saturation !== 20.0) {
                this._foodLevel = 20;
                this._saturation = 20.0;
                // Emit event for restoration in creative mode
                if (Donkeycraft.EventBus) {
                    try {
                        Donkeycraft.EventBus.emitSafe('hunger:changed', {
                            foodLevel: 20,
                            delta: 20 - this._prevFoodLevel
                        });
                    } catch (e) {}
                }
            }
            this._prevFoodLevel = 20;
            return;
        }

        // Auto-regeneration: when saturation > 0 and health < max
        if (this._saturation > 0 && this._foodLevel > 0) {
            // Drain saturation first (~1 per second)
            this._saturation -= deltaTime * 1.0;
            if (this._saturation < 0) {
                this._saturation = 0;
            }

            // Regenerate when health is below max
            if (this._hurtBox && this._hurtBox.getHealth() < this._hurtBox.getMaxHealth()) {
                // Regen chance: ~25% per second when health < max-4
                // ~50% per second when health >= max-4
                var regenChance = this._hurtBox.getHealth() < this._hurtBox.getMaxHealth() - 4
                    ? deltaTime * 0.25
                    : deltaTime * 0.5;

                if (Math.random() < regenChance) {
                    var healed = this._hurtBox.heal(1);
                    // Drain extra saturation on heal (Minecraft mechanic)
                    if (healed > 0 && this._saturation >= 1) {
                        this._saturation -= 1;
                    }
                }
            }
        }

        // Starvation damage: when food level = 0
        // Vanilla Minecraft deals 1 HP damage every ~2 seconds at low health when food = 0
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
                    delta: this._foodLevel - this._prevFoodLevel
                });
            } catch (e) {}
        }
        this._prevFoodLevel = this._foodLevel;

        // Natural regeneration: when food > 18 and health < max
        if (this._foodLevel > 18 && this._hurtBox) {
            if (this._hurtBox.getHealth() < this._hurtBox.getMaxHealth()) {
                // Regen chance: ~25% per second
                if (Math.random() < deltaTime * 0.25) {
                    this._hurtBox.heal(1);
                }
            }
        }
    };

    /**
     * Apply hunger degradation from sprinting.
     * Reduces food level by 1 per block sprinted (approximate).
     * @param {number} distance - Distance sprinted in blocks.
     */
    Donkeycraft.Hunger.prototype.applySprintDegradation = function(distance) {
        if (this._foodLevel <= 0) {
            return;
        }

        // Sprint depletes 1 food per ~2.5 blocks sprinted
        var degradation = Math.floor(distance / 2.5);
        if (degradation > 0) {
            this._drainSaturationAndFood(degradation);
        }
    };

    /**
     * Apply hunger degradation from walking.
     * @param {number} distance - Distance walked in blocks.
     */
    Donkeycraft.Hunger.prototype.applyWalkDegradation = function(distance) {
        if (this._foodLevel <= 0) {
            return;
        }

        // Walking depletes 1 food per ~8 blocks
        var degradation = Math.floor(distance / 8);
        if (degradation > 0) {
            this._drainSaturationAndFood(degradation);
        }
    };

    /**
     * Drain saturation first, then reduce food level.
     * @param {number} amount - Total degradation to apply.
     * @private
     */
    Donkeycraft.Hunger.prototype._drainSaturationAndFood = function(amount) {
        var oldFoodLevel = this._foodLevel;

        // Drain saturation first (saturation counts as half a food point per unit for drain purposes)
        var satDrain = Math.min(this._saturation, amount * 2);
        this._saturation -= satDrain;
        var remainingDeg = amount - (satDrain / 2);
        if (remainingDeg > 0) {
            this._foodLevel = Math.max(0, this._foodLevel - Math.ceil(remainingDeg));
        }

        // Emit hunger change event if food level decreased
        if (this._foodLevel < oldFoodLevel && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    delta: this._foodLevel - oldFoodLevel
                });
            } catch (e) {}
        }
    };

    /**
     * Check if the player has enough food to consume.
     * @returns {boolean}
     */
    Donkeycraft.Hunger.prototype.hasFood = function() {
        return this._foodLevel > 0;
    };

    /**
     * Get the remaining saturation as a fraction of max possible.
     * @returns {number} Saturation fraction (0-1).
     */
    Donkeycraft.Hunger.prototype.getSaturationFraction = function() {
        var maxSaturation = this._foodLevel * 2;
        if (maxSaturation <= 0) {
            return 0;
        }
        return this._saturation / maxSaturation;
    };

    /**
     * Reset the hunger system to full state.
     */
    Donkeycraft.Hunger.prototype.reset = function() {
        var oldLevel = this._foodLevel;
        this._foodLevel = 20;
        this._saturation = 20.0;
        this._starvationTimer = 0;

        // Emit event for reset
        if (oldLevel !== 20 && Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('hunger:changed', {
                    foodLevel: 20,
                    delta: 20 - oldLevel
                });
            } catch (e) {}
        }
    };

    /**
     * Destroy the hunger system and free resources.
     */
    Donkeycraft.Hunger.prototype.destroy = function() {
        this._player = null;
        this._hurtBox = null;
    };

})();