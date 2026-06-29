// Donkeycraft — Projectiles
// Arrows, snowballs, ender pearls, dragon breath, lava buckets.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * ProjectileType — projectile type constants.
     */
    Donkeycraft.ProjectileType = {
        ARROW: 'arrow',
        SNOWBALL: 'snowball',
        ENDER_PEARL: 'ender_pearl',
        DRAGON_BREATH: 'dragon_breath',
        LAVA_BUCKET: 'lava_bucket'
    };

    /**
     * ProjectileStats — projectile-specific statistics.
     */
    Donkeycraft.ProjectileStats = {
        arrow:          { speed: 2.0, damage: 3, gravity: 0.05, lifetime: 60, pierce: false },
        snowball:       { speed: 1.5, damage: 0, gravity: 0.1, lifetime: 20, bounce: true },
        ender_pearl:    { speed: 2.5, damage: 0, gravity: 0.08, lifetime: 30, teleport: true },
        dragon_breath:  { speed: 0.3, damage: 1, gravity: 0, lifetime: 300, area: true, areaRadius: 3 },
        lava_bucket:    { speed: 1.8, damage: 5, gravity: 0.15, lifetime: 15, explode: true }
    };

    /**
     * Projectile — a thrown/projectile entity.
     * @param {object} config - Projectile configuration.
     * @param {string} config.type - Projectile type (arrow, snowball, ender_pearl, dragon_breath, lava_bucket).
     * @param {number} config.x - Initial X position.
     * @param {number} config.y - Initial Y position.
     * @param {number} config.z - Initial Z position.
     * @param {number} config.vx - Initial X velocity.
     * @param {number} config.vy - Initial Y velocity.
     * @param {number} config.vz - Initial Z velocity.
     * @param {Donkeycraft.Entity} [config.owner] - Entity that fired this projectile.
     */
    Donkeycraft.Projectile = function(config) {
        config = config || {};

        var stats = Donkeycraft.ProjectileStats[config.type];
        if (!stats) {
            stats = Donkeycraft.ProjectileStats.arrow; // Default to arrow
        }

        // Call base Entity constructor with minimal params
        Donkeycraft.Entity.call(this, {
            type: config.type,
            x: config.x,
            y: config.y,
            z: config.z,
            height: 0.25,
            width: 0.25
        });

        /**
         * Projectile speed multiplier.
         * @type {number}
         */
        this.speed = stats.speed;

        /**
         * Damage dealt on hit.
         * @type {number}
         */
        this.damage = stats.damage;

        /**
         * Gravity applied per tick.
         * @type {number}
         */
        this.gravity = stats.gravity;

        /**
         * Maximum lifetime in ticks.
         * @type {number}
         */
        this.lifetime = stats.lifetime;

        /**
         * Ticks alive.
         * @type {number}
         * @private
         */
        this._age = 0;

        /**
         * Owner entity (who fired this).
         * @type {Donkeycraft.Entity|null}
         */
        this.owner = config.owner || null;

        /**
         * Whether this projectile can pierce through entities.
         * @type {boolean}
         */
        this.pierce = stats.pierce || false;

        /**
         * Whether this projectile bounces on hit.
         * @type {boolean}
         */
        this.bounce = stats.bounce || false;

        /**
         * Whether this projectile teleports the thrower (ender pearl).
         * @type {boolean}
         */
        this.teleport = stats.teleport || false;

        /**
         * Whether this creates an area effect (dragon breath).
         * @type {boolean}
         */
        this.area = stats.area || false;

        /**
         * Whether this explodes on impact (lava bucket).
         * @type {boolean}
         */
        this.explode = stats.explode || false;

        /**
         * Area radius for area-effect projectiles.
         * @type {number}
         */
        this.areaRadius = stats.areaRadius || 3;

        /**
         * Whether the projectile has been destroyed.
         * @type {boolean}
         * @private
         */
        this._destroyed = false;

        /**
         * Whether the projectile has hit something.
         * @type {boolean}
         * @private
         */
        this._hasHit = false;
    };

    // Inherit from Entity
    Donkeycraft.Projectile.prototype = Object.create(Donkeycraft.Entity.prototype);
    Donkeycraft.Projectile.prototype.constructor = Donkeycraft.Projectile;

    /**
     * Check if the projectile is expired or destroyed.
     * @returns {boolean}
     */
    Donkeycraft.Projectile.prototype.isExpired = function() {
        return this._age >= this.lifetime || !this.isAlive() || this._destroyed;
    };

    /**
     * Destroy the projectile and free resources.
     */
    Donkeycraft.Projectile.prototype.destroy = function() {
        // Call despawn first (before _destroyed check in Entity.despawn)
        this.despawn();
        this._destroyed = true;
    };

    /**
     * Handle impact on hit.
     * @param {number} hitX - Hit X coordinate.
     * @param {number} hitY - Hit Y coordinate.
     * @param {number} hitZ - Hit Z coordinate.
     */
    Donkeycraft.Projectile.prototype.onHit = function(hitX, hitY, hitZ) {
        this._hasHit = true;

        // Type-specific impact behavior
        if (this.teleport && this.owner && this.owner.isAlive && this.owner.isAlive() && this.owner.getPosition) {
            // Ender pearl — teleport owner to projectile location
            var ownerPos = this.owner.getPosition();
            if (ownerPos) {
                this.owner.setPosition(hitX, hitY, hitZ);
                this.owner.setHealth(this.owner.getHealth() - 2); // Fall damage on teleport
            }
        }

        if (this.explode) {
            // Lava bucket — emit explosion event via global EventBus
            if (Donkeycraft.EventBus) {
                try {
                    Donkeycraft.EventBus.emitSafe('projectile:explode', {
                        projectile: this,
                        x: Math.floor(hitX),
                        y: Math.floor(hitY),
                        z: Math.floor(hitZ),
                        radius: 3
                    });
                } catch (e) {
                    // EventBus may not be available in tests
                }
            }
        }

        if (this.area) {
            // Dragon breath — create area effect via global EventBus
            if (Donkeycraft.EventBus) {
                try {
                    Donkeycraft.EventBus.emitSafe('projectile:area', {
                        projectile: this,
                        x: Math.floor(hitX),
                        y: Math.floor(hitY),
                        z: Math.floor(hitZ),
                        radius: this.areaRadius,
                        duration: 10,
                        damage: this.damage
                    });
                } catch (e) {
                    // EventBus may not be available in tests
                }
            }
        }

        if (!this.bounce) {
            // Non-bouncing projectiles despawn on hit
            this.despawn();
        } else {
            // Bouncing projectiles lose velocity
            this._velocity.y = -this._velocity.y * 0.5;
            this._velocity.x *= 0.7;
            this._velocity.z *= 0.7;
        }
    };

    /**
     * Check collision with an entity using inclusive AABB comparison.
     * @param {Donkeycraft.Entity} entity - Entity to check against.
     * @returns {boolean} True if projectile hits entity.
     */
    Donkeycraft.Projectile.prototype.hitsEntity = function(entity) {
        if (!entity.isAlive() || entity === this.owner) {
            return false;
        }

        var projBox = this.getBoundingBox();
        var entBox = entity.getBoundingBox();

        // Guard against null bounding boxes (destroyed entities)
        if (!projBox || !entBox) {
            return false;
        }

        // Use inclusive comparison (>= and <=) so touching edges count as hits
        return (projBox.maxX >= entBox.minX && projBox.minX <= entBox.maxX &&
                projBox.maxY >= entBox.minY && projBox.minY <= entBox.maxY &&
                projBox.maxZ >= entBox.minZ && projBox.minZ <= entBox.maxZ);
    };

    /**
     * Tick method — move projectile, apply gravity, check collisions.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Projectile.prototype.tick = function(deltaTime) {
        if (this._destroyed) return;

        // Call base tick (applies velocity to position)
        Donkeycraft.Entity.prototype.tick.call(this, deltaTime);

        // Increment age
        this._age += 1;

        // Check lifetime expiration
        if (this._age >= this.lifetime) {
            this.despawn();
            return;
        }

        // Apply gravity
        if (this.gravity > 0) {
            this._velocity.y -= this.gravity;
        }

        // Clamp downward velocity
        if (this._velocity.y < -10) {
            this._velocity.y = -10;
        }
    };

    /**
     * Create a projectile by type.
     * @param {string} type - Projectile type.
     * @param {number} x - Initial X position.
     * @param {number} y - Initial Y position.
     * @param {number} z - Initial Z position.
     * @param {number} vx - Initial X velocity.
     * @param {number} vy - Initial Y velocity.
     * @param {number} vz - Initial Z velocity.
     * @param {Donkeycraft.Entity} [owner] - Entity that fired this projectile.
     * @returns {Donkeycraft.Projectile|null}
     */
    Donkeycraft.Projectile.create = function(type, x, y, z, vx, vy, vz, owner) {
        if (!Donkeycraft.ProjectileStats[type]) {
            return null; // Unknown type
        }

        return new Donkeycraft.Projectile({
            type: type,
            x: x,
            y: y,
            z: z,
            vx: vx || 0,
            vy: vy || 0,
            vz: vz || 0,
            owner: owner
        });
    };

    /**
     * Calculate velocity from direction and speed.
     * @param {Donkeycraft.Vector3} direction - Direction vector (will be normalized).
     * @param {number} speed - Speed multiplier.
     * @param {number} [upwardAngle=0] - Upward angle in radians.
     * @returns {{vx: number, vy: number, vz: number}}
     */
    Donkeycraft.Projectile.calculateVelocity = function(direction, speed, upwardAngle) {
        upwardAngle = upwardAngle || 0;

        var normalized = direction.normalize();
        var vx = normalized.x * speed;
        var vy = normalized.y * speed + Math.sin(upwardAngle) * speed;
        var vz = normalized.z * speed;

        return { vx: vx, vy: vy, vz: vz };
    };

})();