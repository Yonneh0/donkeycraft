// Donkeycraft — Passive Mobs
// Cow, pig, sheep, chicken — spawn, wander, flee players.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * MobType — entity type constants for passive mobs.
     */
    Donkeycraft.MobType = Donkeycraft.MobType || {};
    Donkeycraft.MobType.PASSIVE = {
        COW: 'cow',
        PIG: 'pig',
        SHEEP: 'sheep',
        CHICKEN: 'chicken'
    };

    /**
     * MobStats — mob-specific statistics.
     */
    Donkeycraft.MobStats = {
        cow:      { health: 10, height: 1.4, width: 1.4, speed: 1.0, dropItem: 'leather', dropCount: [0, 2] },
        pig:      { health: 10, height: 0.9, width: 0.9, speed: 1.2, dropItem: 'porkchop', dropCount: [1, 3] },
        sheep:    { health: 8,  height: 0.9, width: 0.9, speed: 1.0, dropItem: 'wool', dropCount: [1, 3] },
        chicken:  { health: 4,  height: 0.6, width: 0.4, speed: 1.3, dropItem: 'feather', dropCount: [0, 2] }
    };

    /**
     * PassiveMob — base class for passive (hostile-to-players) mobs.
     * @param {object} config - Mob configuration.
     * @param {string} config.type - Mob type (cow, pig, sheep, chicken).
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     */
    Donkeycraft.PassiveMob = function(config) {
        config = config || {};

        var stats = Donkeycraft.MobStats[config.type];
        if (!stats) {
            stats = Donkeycraft.MobStats.cow; // Default to cow
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
         * Wander target position.
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._wanderTarget = new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Time until next wander target change.
         * @type {number}
         * @private
         */
        this._wanderTimer = 0;

        /**
         * Flee timer (when player is near).
         * @type {number}
         * @private
         */
        this._fleeTimer = 0;

        /**
         * Whether the mob is currently fleeing.
         * @type {boolean}
         * @private
         */
        this._isFleeing = false;

        /**
         * Drop item type when killed.
         * @type {string}
         */
        this.dropItem = stats.dropItem;

        /**
         * Min/max drop count.
         * @type {Array}
         */
        this.dropCount = stats.dropCount;
    };

    // Inherit from Entity
    Donkeycraft.PassiveMob.prototype = Object.create(Donkeycraft.Entity.prototype);
    Donkeycraft.PassiveMob.prototype.constructor = Donkeycraft.PassiveMob;

    /**
     * Pick a new random wander target.
     * @private
     */
    Donkeycraft.PassiveMob.prototype._pickWanderTarget = function() {
        // Random direction and distance
        var angle = Math.random() * Math.PI * 2;
        var distance = 3 + Math.random() * 7; // 3-10 blocks

        this._wanderTarget.x = this._position.x + Math.cos(angle) * distance;
        this._wanderTarget.z = this._position.z + Math.sin(angle) * distance;
        this._wanderTarget.y = this._position.y;

        // Pick new timer (2-5 seconds)
        this._wanderTimer = 2 + Math.random() * 3;
    };

    /**
     * Check if a player is nearby and should trigger fleeing.
     * @param {Donkeycraft.Player} player - Player entity.
     * @param {number} fleeRange - Range to detect player (blocks).
     * @returns {boolean} True if player is near.
     */
    Donkeycraft.PassiveMob.prototype.isPlayerNearby = function(player, fleeRange) {
        fleeRange = fleeRange || 8;
        var dx = this._position.x - player.getPosition().x;
        var dy = this._position.y - player.getPosition().y;
        var dz = this._position.z - player.getPosition().z;
        var distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return distance < fleeRange;
    };

    /**
     * Flee from a player position.
     * @param {Donkeycraft.Vector3} playerPos - Player position.
     */
    Donkeycraft.PassiveMob.prototype.fleeFrom = function(playerPos) {
        var dx = this._position.x - playerPos.x;
        var dz = this._position.z - playerPos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0) {
            // Move away from player
            this._velocity.x = (dx / dist) * this.speed * 2;
            this._velocity.z = (dz / dist) * this.speed * 2;
        }

        this._isFleeing = true;
        this._fleeTimer = 2; // Flee for 2 seconds
    };

    /**
     * Called when the mob dies — drops items.
     * @private
     */
    Donkeycraft.PassiveMob.prototype.onDeath = function() {
        // Subclasses can override to emit drop events
    };

    /**
     * Tick method — wander, flee from players.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.PassiveMob.prototype.tick = function(deltaTime) {
        // Call base tick (applies velocity to position)
        Donkeycraft.Entity.prototype.tick.call(this, deltaTime);

        // Decrease wander timer
        this._wanderTimer -= deltaTime;
        if (this._wanderTimer <= 0) {
            this._pickWanderTarget();
        }

        // Decrease flee timer
        if (this._isFleeing) {
            this._fleeTimer -= deltaTime;
            if (this._fleeTimer <= 0) {
                this._isFleeing = false;
                this._velocity.x = 0;
                this._velocity.z = 0;
            }
        }

        // Wander movement (only if not fleeing)
        if (!this._isFleeing && this._wanderTimer > 0) {
            var dx = this._wanderTarget.x - this._position.x;
            var dz = this._wanderTarget.z - this._position.z;
            var dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 0.5) {
                this._velocity.x = (dx / dist) * this.speed;
                this._velocity.z = (dz / dist) * this.speed;
            } else {
                // Reached target — pick new one
                this._pickWanderTarget();
            }
        }

        // Keep on ground (simple gravity)
        this._velocity.y -= Config.GRAVITY * deltaTime * 0.1; // Gentle gravity
        if (this._velocity.y < -5) {
            this._velocity.y = -5; // Clamp downward velocity
        }
    };

    /**
     * Get the mob's drop item type.
     * @returns {string}
     */
    Donkeycraft.PassiveMob.prototype.getDropItem = function() {
        return this.dropItem;
    };

    /**
     * Get the min/max drop count.
     * @returns {number[]} [min, max]
     */
    Donkeycraft.PassiveMob.prototype.getDropCount = function() {
        return this.dropCount.slice();
    };

    /**
     * Create a passive mob by type.
     * @param {string} type - Mob type (cow, pig, sheep, chicken).
     * @param {number} x - X position.
     * @param {number} y - Y position.
     * @param {number} z - Z position.
     * @returns {Donkeycraft.PassiveMob|null}
     */
    Donkeycraft.PassiveMob.create = function(type, x, y, z) {
        if (!Donkeycraft.MobStats[type]) {
            return null; // Unknown type
        }

        return new Donkeycraft.PassiveMob({
            type: type,
            x: x,
            y: y,
            z: z
        });
    };

})();