// Donkeycraft — Boss Mobs
// Ender Dragon and Wither — health, phases, attacks.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * BossMobStats — boss-specific statistics.
     */
    Donkeycraft.BossMobStats = {
        ender_dragon: {
            health: 200,
            height: 8.0,
            width: 11.4,
            speed: 3.0,
            damage: 10,
            sightRange: 64,
            phases: ['fly', 'land', 'breath'],
            glow: true,
            immuneToFallDamage: true
        },
        wither: {
            health: 300,
            height: 2.9,
            width: 0.95,
            speed: 1.5,
            damage: 8,
            sightRange: 32,
            phases: ['charge', 'attack'],
            glow: true,
            shootsProjectiles: true
        }
    };

    /**
     * BossMob — base class for boss entities.
     * @param {object} config - Boss configuration.
     * @param {string} config.type - Boss type (ender_dragon, wither).
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     */
    Donkeycraft.BossMob = function(config) {
        config = config || {};

        var stats = Donkeycraft.BossMobStats[config.type];
        if (!stats) {
            stats = Donkeycraft.BossMobStats.ender_dragon; // Default to Ender Dragon
        }

        // Call base Entity constructor
        Donkeycraft.Entity.call(this, {
            type: config.type,
            x: config.x,
            y: config.y,
            z: config.z,
            height: stats.height,
            width: stats.width
        });

        this.health = stats.health;
        this.maxHealth = stats.health;
        this.speed = stats.speed;
        this.damage = stats.damage;
        this.sightRange = stats.sightRange;
        this.glow = stats.glow || false;
        this.immuneToFallDamage = stats.immuneToFallDamage || false;
        this.shootsProjectiles = stats.shootsProjectiles || false;

        /**
         * Boss phases.
         * @type {string[]}
         */
        this.phases = stats.phases.slice();

        /**
         * Current phase index.
         * @type {number}
         * @private
         */
        this._phaseIndex = 0;

        /**
         * Current phase name.
         * @type {string}
         */
        this.currentPhase = stats.phases[0];

        /**
         * Phase duration timer.
         * @type {number}
         * @private
         */
        this._phaseTimer = 0;

        /**
         * Minimum phase duration in seconds.
         * @type {number}
         */
        this.minPhaseDuration = 3;

        /**
         * Maximum phase duration in seconds.
         * @type {number}
         */
        this.maxPhaseDuration = 8;

        /**
         * Closest player within sight range.
         * @type {Donkeycraft.Player|null}
         * @private
         */
        this._targetPlayer = null;

        /**
         * Attack cooldown timer.
         * @type {number}
         * @private
         */
        this._attackCooldown = 0;

        /**
         * Attack interval in seconds.
         * @type {number}
         */
        this.attackInterval = 3;

        /**
         * Whether the boss is in its final death phase.
         * @type {boolean}
         * @private
         */
        this._isDying = false;

        /**
         * Death animation duration.
         * @type {number}
         */
        this.deathDuration = 5;

        /**
         * Death animation timer.
         * @type {number}
         * @private
         */
        this._deathTimer = 0;
    };

    // Inherit from Entity
    Donkeycraft.BossMob.prototype = Object.create(Donkeycraft.Entity.prototype);
    Donkeycraft.BossMob.prototype.constructor = Donkeycraft.BossMob;

    /**
     * Find the closest player within sight range.
     * @param {Donkeycraft.Player} player - Player to check against.
     * @returns {boolean} True if a player was found.
     */
    Donkeycraft.BossMob.prototype.findTargetPlayer = function(player) {
        var pos = this._position;
        var pPos = player.getPosition();

        var dx = pos.x - pPos.x;
        var dy = pos.y - pPos.y;
        var dz = pos.z - pPos.z;
        var distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance <= this.sightRange && player.isAlive()) {
            this._targetPlayer = player;
            return true;
        }

        this._targetPlayer = null;
        return false;
    };

    /**
     * Switch to the next phase.
     */
    Donkeycraft.BossMob.prototype._nextPhase = function() {
        this._phaseIndex++;
        if (this._phaseIndex >= this.phases.length) {
            // Loop back to first phase or enter death phase
            if (!this._isDying && this.health < this.maxHealth * 0.25) {
                // Enter death phase at 25% health
                this._isDying = true;
                this.currentPhase = 'death';
                this._deathTimer = this.deathDuration;
            } else {
                this._phaseIndex = 0;
            }
        }

        if (!this._isDying) {
            this.currentPhase = this.phases[this._phaseIndex];
            this._phaseTimer = this.minPhaseDuration + Math.random() * (this.maxPhaseDuration - this.minPhaseDuration);
        }
    };

    /**
     * Attack the target player.
     */
    Donkeycraft.BossMob.prototype.attack = function() {
        if (!this._targetPlayer || !this._targetPlayer.isAlive()) {
            return;
        }

        this._attackCooldown -= 1 / Config.GAME_TICKS_PER_SECOND;
        if (this._attackCooldown > 0) {
            return;
        }

        this._attackCooldown = this.attackInterval;

        // Deal damage to player — check if player has a hurtBox with takeDamage,
        // otherwise use direct health system.
        if (this._targetPlayer.hurtBox && typeof this._targetPlayer.hurtBox.takeDamage === 'function') {
            this._targetPlayer.hurtBox.takeDamage(this.damage, this.type);
        } else if (this._targetPlayer.health !== undefined) {
            this._targetPlayer.health = Math.max(0, this._targetPlayer.health - this.damage);
            if (this._targetPlayer.health <= 0) {
                this._targetPlayer.setAlive(false);
            }
        }
    };

    /**
     * Emit a breath attack toward the target (dragon fireball/breath).
     */
    Donkeycraft.BossMob.prototype.emitBreathAttack = function() {
        if (!this._targetPlayer) {
            return;
        }

        // Emit breath attack event
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emit('boss:breath', {
                    entity: this,
                    targetX: this._targetPlayer.getPosition().x,
                    targetZ: this._targetPlayer.getPosition().z,
                    type: this.type + '_breath'
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Shoot a projectile at the target.
     */
    Donkeycraft.BossMob.prototype.shootProjectile = function() {
        if (!this._targetPlayer) {
            return;
        }

        // Emit projectile spawn event
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emit('boss:projectile', {
                    entity: this,
                    startX: this._position.x,
                    startY: this._position.y + this.height * 0.5,
                    startZ: this._position.z,
                    targetX: this._targetPlayer.getPosition().x,
                    targetY: this._targetPlayer.getPosition().y,
                    targetZ: this._targetPlayer.getPosition().z,
                    type: this.type + '_projectile'
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Called when the boss dies.
     * @private
     */
    Donkeycraft.BossMob.prototype.onDeath = function() {
        // Emit death event
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emit('boss:death', {
                    entity: this,
                    type: this.type
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Tick method — phase management, chase players, attack.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.BossMob.prototype.tick = function(deltaTime) {
        // Call base tick (applies velocity to position)
        Donkeycraft.Entity.prototype.tick.call(this, deltaTime);

        // Handle death animation
        if (this._isDying) {
            this._deathTimer -= deltaTime;
            if (this._deathTimer <= 0) {
                this.setAlive(false);
            }
            return;
        }

        // Decrease phase timer
        this._phaseTimer -= deltaTime;
        if (this._phaseTimer <= 0) {
            this._nextPhase();
        }

        // Decrease attack cooldown
        this._attackCooldown -= deltaTime;

        // Phase-specific behavior
        switch (this.currentPhase) {
            case 'fly':
                // Circle around and dive occasionally
                this._velocity.y = Math.sin(this._position.x * 0.1) * 2;
                break;

            case 'land':
                // Land and melee attack
                this._velocity.y = -2;
                if (this._targetPlayer) {
                    this.attack();
                }
                break;

            case 'breath':
                // Emit breath attack
                this.emitBreathAttack();
                break;

            case 'charge':
                // Charge toward player
                if (this._targetPlayer) {
                    var pPos = this._targetPlayer.getPosition();
                    var dx = pPos.x - this._position.x;
                    var dz = pPos.z - this._position.z;
                    var dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist > 0) {
                        this._velocity.x = (dx / dist) * this.speed * 2;
                        this._velocity.z = (dz / dist) * this.speed * 2;
                    }
                }
                break;

            case 'attack':
                // Shoot projectiles
                if (this.shootsProjectiles && this._targetPlayer) {
                    this.shootProjectile();
                }
                break;

            default:
                // Idle — drift
                this._velocity.x *= 0.95;
                this._velocity.z *= 0.95;
        }

        // Gravity (except for flying phases)
        if (this.currentPhase !== 'fly') {
            this._velocity.y -= Config.GRAVITY * deltaTime * 0.1;
        }
    };

    /**
     * Create a boss mob by type.
     * @param {string} type - Boss type (ender_dragon, wither).
     * @param {number} x - X position.
     * @param {number} y - Y position.
     * @param {number} z - Z position.
     * @returns {Donkeycraft.BossMob|null}
     */
    Donkeycraft.BossMob.create = function(type, x, y, z) {
        if (!Donkeycraft.BossMobStats[type]) {
            return null; // Unknown type
        }

        return new Donkeycraft.BossMob({
            type: type,
            x: x,
            y: y,
            z: z
        });
    };

})();