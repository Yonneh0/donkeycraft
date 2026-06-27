// Donkeycraft — Hostile Mobs
// Zombie, skeleton, spider, creeper, enderman — spawn in dark, path toward players.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * MobType.HOSTILE — entity type constants for hostile mobs.
     */
    Donkeycraft.MobType.HOSTILE = {
        ZOMBIE: 'zombie',
        SKELETON: 'skeleton',
        SPIDER: 'spider',
        CREEPER: 'creeper',
        ENDERMAN: 'enderman'
    };

    /**
     * HostileMobStats — mob-specific statistics for hostile mobs.
     */
    Donkeycraft.HostileMobStats = {
        zombie:     { health: 20, height: 1.9, width: 0.6, speed: 1.0, damage: 3, sightRange: 16, glow: false },
        skeleton:   { health: 20, height: 1.9, width: 0.6, speed: 1.0, damage: 2, sightRange: 20, glow: false },
        spider:     { health: 16, height: 1.1, width: 1.4, speed: 1.2, damage: 2, sightRange: 16, glow: false },
        creeper:    { health: 10, height: 1.7, width: 0.6, speed: 1.0, damage: 25, sightRange: 10, glow: true, explodes: true },
        enderman:   { health: 40, height: 2.9, width: 0.6, speed: 1.5, damage: 5, sightRange: 32, glow: false, teleports: true }
    };

    /**
     * HostileMob — base class for hostile mobs that attack players.
     * @param {object} config - Mob configuration.
     * @param {string} config.type - Mob type (zombie, skeleton, spider, creeper, enderman).
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     */
    Donkeycraft.HostileMob = function(config) {
        config = config || {};

        var stats = Donkeycraft.HostileMobStats[config.type];
        if (!stats) {
            stats = Donkeycraft.HostileMobStats.zombie; // Default to zombie
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

        /**
         * Mob movement speed in blocks/second.
         * @type {number}
         */
        this.speed = stats.speed;

        /**
         * Melee damage dealt on contact.
         * @type {number}
         */
        this.damage = stats.damage;

        /**
         * Sight range in blocks.
         * @type {number}
         */
        this.sightRange = stats.sightRange;

        /**
         * Whether the mob glows (visible through blocks).
         * @type {boolean}
         */
        this.glow = stats.glow || false;

        /**
         * Closest player within sight range.
         * @type {Donkeycraft.Player|null}
         * @private
         */
        this._targetPlayer = null;

        /**
         * Attack cooldown timer (seconds).
         * @type {number}
         * @private
         */
        this._attackCooldown = 0;

        /**
         * Attack interval in seconds.
         * @type {number}
         */
        this.attackInterval = stats.attackInterval || 2;

        /**
         * Whether the mob explodes on death (creeper).
         * @type {boolean}
         */
        this.explodes = stats.explodes || false;

        /**
         * Whether the mob teleports (enderman).
         * @type {boolean}
         */
        this.teleports = stats.teleports || false;

        /**
         * Creeper ignition timer (for approaching players).
         * @type {number}
         * @private
         */
        this._creeperIgniteTimer = 0;

        /**
         * Whether the creeper is ignited (about to explode).
         * @type {boolean}
         * @private
         */
        this._isIgnited = false;
    };

    // Inherit from Entity
    Donkeycraft.HostileMob.prototype = Object.create(Donkeycraft.Entity.prototype);
    Donkeycraft.HostileMob.prototype.constructor = Donkeycraft.HostileMob;

    /**
     * Find the closest player within sight range.
     * @param {Donkeycraft.Player} player - Player to check against.
     * @returns {boolean} True if a player was found.
     */
    Donkeycraft.HostileMob.prototype.findTargetPlayer = function(player) {
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
     * Move toward a target position.
     * @param {number} targetX - Target X.
     * @param {number} targetZ - Target Z.
     * @private
     */
    Donkeycraft.HostileMob.prototype._moveToward = function(targetX, targetZ) {
        var dx = targetX - this._position.x;
        var dz = targetZ - this._position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.5) {
            this._velocity.x = (dx / dist) * this.speed;
            this._velocity.z = (dz / dist) * this.speed;
        } else {
            this._velocity.x = 0;
            this._velocity.z = 0;
        }
    };

    /**
     * Check if close enough to attack the target player.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.HostileMob.prototype._isCloseEnoughToAttack = function() {
        if (!this._targetPlayer) {
            return false;
        }

        var dx = this._position.x - this._targetPlayer.getPosition().x;
        var dz = this._position.z - this._targetPlayer.getPosition().z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        return dist < 2.0; // Melee range
    };

    /**
     * Attack the target player.
     */
    Donkeycraft.HostileMob.prototype.attack = function() {
        if (!this._targetPlayer || !this._targetPlayer.isAlive()) {
            return;
        }

        // Decrease attack cooldown
        this._attackCooldown -= 1 / Config.GAME_TICKS_PER_SECOND;
        if (this._attackCooldown > 0) {
            return;
        }

        this._attackCooldown = this.attackInterval;

        // Deal damage to player — check if player has a hurtBox with takeDamage,
        // otherwise use direct health system, or emit event for external handling.
        var damaged = false;

        if (this._targetPlayer.hurtBox && typeof this._targetPlayer.hurtBox.takeDamage === 'function') {
            // Player has full hurt-box system (from hurt-box.js)
            this._targetPlayer.hurtBox.takeDamage(this.damage, this.type);
            damaged = true;
        } else if (typeof this._targetPlayer.takeDamage === 'function') {
            // Player has direct takeDamage method
            this._targetPlayer.takeDamage(this.damage, this.type);
            damaged = true;
        } else if (this._targetPlayer.health !== undefined) {
            // Player has simple health property (from entity.js)
            this._targetPlayer.health = Math.max(0, this._targetPlayer.health - this.damage);
            if (this._targetPlayer.health <= 0) {
                this._targetPlayer.setAlive(false);
            }
            damaged = true;
        }

        // Emit damage event for external systems to handle
        if (Donkeycraft.EventBus && !damaged) {
            try {
                Donkeycraft.EventBus.emit('entity:damage', {
                    attacker: this,
                    target: this._targetPlayer,
                    damage: this.damage,
                    source: this.type
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Handle creeper ignition when near a player.
     * @param {Donkeycraft.Player} player - Player to check proximity against.
     */
    Donkeycraft.HostileMob.prototype.handleCreeperProximity = function(player) {
        if (!this.explodes) {
            return;
        }

        var dx = this._position.x - player.getPosition().x;
        var dz = this._position.z - player.getPosition().z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 3 && !this._isIgnited) {
            // Start igniting
            this._isIgnited = true;
            this._creeperIgniteTimer = 1.5; // 1.5 seconds to explode
        } else if (dist >= 3 && this._isIgnited) {
            // Player moved away — cancel ignition
            this._isIgnited = false;
            this._creeperIgniteTimer = 0;
        }
    };

    /**
     * Explode the creeper (if applicable).
     * @returns {boolean} True if explosion occurred.
     */
    Donkeycraft.HostileMob.prototype.explode = function() {
        if (!this.explodes || !this._isIgnited) {
            return false;
        }

        // Emit explosion event
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emit('entity:explode', {
                    entity: this,
                    x: Math.floor(this._position.x),
                    y: Math.floor(this._position.y),
                    z: Math.floor(this._position.z),
                    radius: 4
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }

        return true;
    };

    /**
     * Called when the mob dies.
     * @private
     */
    Donkeycraft.HostileMob.prototype.onDeath = function() {
        if (this.explodes && this._isIgnited) {
            this.explode();
        }
    };

    /**
     * Tick method — chase players, attack on contact.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.HostileMob.prototype.tick = function(deltaTime) {
        // Call base tick (applies velocity to position)
        Donkeycraft.Entity.prototype.tick.call(this, deltaTime);

        // Decrease attack cooldown
        this._attackCooldown -= deltaTime;

        // Handle creeper ignition
        if (this._isIgnited) {
            this._creeperIgniteTimer -= deltaTime;
            if (this._creeperIgniteTimer <= 0) {
                this.explode();
                this.setAlive(false);
                return;
            }
        }

        // Chase target player
        if (this._targetPlayer && this._targetPlayer.isAlive()) {
            var pPos = this._targetPlayer.getPosition();
            this._moveToward(pPos.x, pPos.z);

            // Attack if close enough
            if (this._isCloseEnoughToAttack()) {
                this.attack();
            }
        } else {
            // No target — wander randomly
            this._velocity.x = 0;
            this._velocity.z = 0;
        }

        // Simple gravity
        this._velocity.y -= Config.GRAVITY * deltaTime * 0.1;
        if (this._velocity.y < -5) {
            this._velocity.y = -5;
        }
    };

    /**
     * Create a hostile mob by type.
     * @param {string} type - Mob type (zombie, skeleton, spider, creeper, enderman).
     * @param {number} x - X position.
     * @param {number} y - Y position.
     * @param {number} z - Z position.
     * @returns {Donkeycraft.HostileMob|null}
     */
    Donkeycraft.HostileMob.create = function(type, x, y, z) {
        if (!Donkeycraft.HostileMobStats[type]) {
            return null; // Unknown type
        }

        return new Donkeycraft.HostileMob({
            type: type,
            x: x,
            y: y,
            z: z
        });
    };

})();