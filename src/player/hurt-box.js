// Donkeycraft — Hurt Box & Damage System
// Hitbox management, damage reception, knockback, fall damage calculation.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * HurtBox — manages player hitbox, health, damage, and knockback.
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.HurtBox = function(player) {
        this._player = player;

        /**
         * Current health points (0-20).
         * @type {number}
         * @private
         */
        this._health = 20;

        /**
         * Maximum health points.
         * @type {number}
         */
        this.maxHealth = 20;

        /**
         * Current absorption hearts (yellow health).
         * @type {number}
         * @private
         */
        this._absorption = 0;

        /**
         * Current saturation level for auto-regeneration.
         * @type {number}
         * @private
         */
        this._saturation = 0;

        /**
         * Whether the player is currently on fire.
         * @type {boolean}
         * @private
         */
        this._onFire = false;

        /**
         * Fire damage timer.
         * @type {number}
         * @private
         */
        this._fireDamageTimer = 0;

        /**
         * Starvation damage timer.
         * @type {number}
         * @private
         */
        this._starvationTimer = 0;

        /**
         * Death event callback.
         * @type {Function|null}
         * @private
         */
        this._onDeathCallback = null;
    };

    /**
     * Get the player's current health.
     * @returns {number} Current HP (0-20).
     */
    Donkeycraft.HurtBox.prototype.getHealth = function() {
        return this._health;
    };

    /**
     * Get the maximum health points.
     * @returns {number}
     */
    Donkeycraft.HurtBox.prototype.getMaxHealth = function() {
        return this.maxHealth;
    };

    /**
     * Get the current absorption (yellow health) points.
     * @returns {number}
     */
    Donkeycraft.HurtBox.prototype.getAbsorption = function() {
        return this._absorption;
    };

    /**
     * Set the absorption health value.
     * @param {number} amount - Absorption points to set.
     */
    Donkeycraft.HurtBox.prototype.setAbsorption = function(amount) {
        this._absorption = Math.max(0, amount);
    };

    /**
     * Get the current saturation level.
     * @returns {number}
     */
    Donkeycraft.HurtBox.prototype.getSaturation = function() {
        return this._saturation;
    };

    /**
     * Set the saturation level.
     * @param {number} amount - Saturation value to set.
     */
    Donkeycraft.HurtBox.prototype.setSaturation = function(amount) {
        this._saturation = Math.max(0, amount);
    };

    /**
     * Check if the player is on fire.
     * @returns {boolean}
     */
    Donkeycraft.HurtBox.prototype.isOnFire = function() {
        return this._onFire;
    };

    /**
     * Set whether the player is on fire.
     * @param {boolean} onFire - True to set on fire, false to extinguish.
     */
    Donkeycraft.HurtBox.prototype.setOnFire = function(onFire) {
        this._onFire = !!onFire;
        if (!onFire) {
            this._fireDamageTimer = 0;
        }
    };

    /**
     * Receive damage from a specified source.
     * @param {number} amount - Damage amount.
     * @param {string} [source='generic'] - Damage source: 'generic', 'fall', 'fire', 'attack', 'lava', 'suffocation', 'starvation'.
     * @returns {number} Actual damage dealt (0 if immune).
     */
    Donkeycraft.HurtBox.prototype.takeDamage = function(amount, source) {
        source = source || 'generic';

        // Creative mode: immune to most damage sources
        var gameMode = this._player.getGameMode();
        if (gameMode === 'creative') {
            return 0;
        }

        // Don't take damage if already dead
        if (!this._player.isAlive() || this._health <= 0) {
            return 0;
        }

        // Apply damage to absorption first, then health
        var remainingDamage = amount;

        if (this._absorption > 0) {
            var absorbed = Math.min(this._absorption, remainingDamage);
            this._absorption -= absorbed;
            remainingDamage -= absorbed;
        }

        if (remainingDamage > 0) {
            this._health -= remainingDamage;
            this._health = Math.max(0, this._health);
        }

        // Check for death
        if (this._health <= 0 && this._player.isAlive()) {
            this.onDeath(source);
        }

        return amount;
    };

    /**
     * Heal the player by the given amount.
     * @param {number} amount - Health points to restore.
     * @returns {number} Actual health restored.
     */
    Donkeycraft.HurtBox.prototype.heal = function(amount) {
        if (!this._player.isAlive()) {
            return 0;
        }

        var oldHealth = this._health;
        this._health += amount;
        this._health = Math.min(this._health, this.maxHealth);

        return this._health - oldHealth;
    };

    /**
     * Get the knockback velocity.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.HurtBox.prototype.getKnockback = function() {
        return this._player.getKnockback();
    };

    /**
     * Apply knockback from a direction with given strength.
     * @param {Donkeycraft.Vector3} direction - Direction vector (will be normalized).
     * @param {number} strength - Knockback strength in blocks/s.
     * @param {number} [upwardForce=0] - Upward component of knockback.
     */
    Donkeycraft.HurtBox.prototype.applyKnockback = function(direction, strength, upwardForce) {
        this._player.applyKnockback(direction, strength, upwardForce);
    };

    /**
     * Clear the current knockback velocity.
     */
    Donkeycraft.HurtBox.prototype.clearKnockback = function() {
        this._player.clearKnockback();
    };

    /**
     * Get the current fall distance for damage calculation.
     * @returns {number} Fall distance in blocks.
     */
    Donkeycraft.HurtBox.prototype.getFallDistance = function() {
        return this._player.getFallDistance();
    };

    /**
     * Calculate fall damage based on distance fallen.
     * Formula: max(0, (fallDistance - threshold) * 0.5) — first 3 blocks are free.
     * Each point of damage = 1 HP (half a heart). Minecraft deals 1 half-heart per block beyond threshold.
     * @param {number} [fallDistance=0] - Distance fallen in blocks.
     * @returns {number} Damage dealt in HP (0 if no fall damage).
     */
    Donkeycraft.HurtBox.prototype.calculateFallDamage = function(fallDistance) {
        fallDistance = fallDistance || this._player.getFallDistance();

        // No fall damage for first 3 blocks
        if (fallDistance <= Config.FALL_DAMAGE_THRESHOLD) {
            return 0;
        }

        // Damage = (fallDistance - threshold) * 0.5 HP per block
        var damage = (fallDistance - Config.FALL_DAMAGE_THRESHOLD) * 0.5;
        return damage;
    };

    /**
     * Apply fall damage and reset fall distance tracking.
     * @returns {number} Damage dealt (0 if no fall damage).
     */
    Donkeycraft.HurtBox.prototype.applyFallDamage = function() {
        var damage = this.calculateFallDamage();

        if (damage > 0) {
            this.takeDamage(damage, 'fall');
        }

        // Reset fall distance after applying damage
        this._player.maxFallDistance = 0;

        return damage;
    };

    /**
     * Get the player's bounding box (AABB).
     * @returns {{minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number}}
     */
    Donkeycraft.HurtBox.prototype.getHurtBox = function() {
        return this._player.getHurtBox();
    };

    /**
     * Check if the player is in creative mode (immune to most damage).
     * @returns {boolean}
     */
    Donkeycraft.HurtBox.prototype.isCreative = function() {
        return this._player.getGameMode() === 'creative';
    };

    /**
     * Register a death callback that fires when the player dies.
     * @param {Function} callback - Function called with (deathSource) on death.
     */
    Donkeycraft.HurtBox.prototype.setOnDeath = function(callback) {
        this._onDeathCallback = callback;
    };

    /**
     * Handle player death — triggers death event via EventBus.
     * @param {string} [deathSource='generic'] - Cause of death.
     */
    Donkeycraft.HurtBox.prototype.onDeath = function(deathSource) {
        deathSource = deathSource || 'generic';

        // Mark player as dead
        this._player.setAlive(false);

        // Clear knockback
        this.clearKnockback();

        // Trigger death callback
        if (this._onDeathCallback) {
            try {
                this._onDeathCallback(deathSource);
            } catch (e) {
                // Error isolation
            }
        }

        // Emit death event via global EventBus
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('player:death', {
                    source: deathSource,
                    health: 0,
                    player: this._player
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Tick the hurt box system — handles fire damage and starvation.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.HurtBox.prototype.tick = function(deltaTime) {
        if (!this._player.isAlive()) {
            return;
        }

        var gameMode = this._player.getGameMode();

        // Creative mode: no tick-based damage
        if (gameMode === 'creative') {
            return;
        }

        // Fire damage
        if (this._onFire) {
            this._fireDamageTimer += deltaTime;
            if (this._fireDamageTimer >= 1.0) {
                this._fireDamageTimer = 0;
                this.takeDamage(1, 'fire');
            }
        } else {
            this._fireDamageTimer = 0;
        }

        // Auto-regeneration when saturation > 0 and health < max
        if (this._saturation > 0 && this._health < this.maxHealth) {
            this._saturation -= deltaTime * 0.5; // Drain saturation
            if (this._saturation <= 0) {
                this._saturation = 0;
            }

            // Regenerate when saturation is sufficient
            if (this._health < this.maxHealth - 4) {
                // Only regenerate every 4 ticks (~2 seconds)
                if (Math.random() < deltaTime * 0.25) {
                    this.heal(1);
                }
            } else if (this._saturation > 0 && this._health < this.maxHealth) {
                // Faster regen near full health
                if (Math.random() < deltaTime * 0.5) {
                    this.heal(1);
                }
            }
        }
    };

    /**
     * Reset the hurt box to full health.
     */
    Donkeycraft.HurtBox.prototype.reset = function() {
        this._health = this.maxHealth;
        this._absorption = 0;
        this._saturation = 0;
        this._onFire = false;
        this._fireDamageTimer = 0;
        this._starvationTimer = 0;
        this._player.setAlive(true);
        this._player.maxFallDistance = 0;
    };

    /**
     * Destroy the hurt box system and free resources.
     */
    Donkeycraft.HurtBox.prototype.destroy = function() {
        this._player = null;
        this._onDeathCallback = null;
    };

})();