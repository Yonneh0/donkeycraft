// Donkeycraft — Base Entity Class
// All entities (mobs, bosses, projectiles) inherit from this base class.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;
    var EventBus = Donkeycraft.EventBus;

    /**
     * Entity — base class for all entities in the world.
     * @param {object} [config] - Entity configuration.
     * @param {string} [config.type='generic'] - Entity type identifier.
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     * @param {number} [config.height=1.8] - Entity height in blocks.
     * @param {number} [config.width=0.6] - Entity width in blocks.
     */
    Donkeycraft.Entity = function(config) {
        config = config || {};

        /**
         * Entity type identifier.
         * @type {string}
         */
        this.type = config.type || 'generic';

        /**
         * Entity position as a Vector3.
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._position = new Donkeycraft.Vector3(
            config.x !== undefined ? config.x : 0,
            config.y !== undefined ? config.y : Config.WORLD_HEIGHT / 2,
            config.z !== undefined ? config.z : 0
        );

        /**
         * Entity velocity as a Vector3.
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._velocity = new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Entity rotation: yaw and pitch in radians.
         * @type {{yaw: number, pitch: number}}
         * @private
         */
        this._rotation = {
            yaw: 0,
            pitch: 0
        };

        /**
         * Entity height in blocks.
         * @type {number}
         */
        this.height = config.height || 1.8;

        /**
         * Entity width in blocks.
         * @type {number}
         */
        this.width = config.width || 0.6;

        /**
         * Whether the entity is alive.
         * @type {boolean}
         */
        this.alive = true;

        /**
         * Whether the entity has been despawned.
         * @type {boolean}
         * @private
         */
        this._despawned = false;

        /**
         * Whether the entity has been destroyed (resources freed).
         * @type {boolean}
         * @private
         */
        this._destroyed = false;

        /**
         * Health points (0 = dead).
         * @type {number}
         */
        this.maxHealth = config.maxHealth || 20;
        this.health = config.health !== undefined ? Math.min(config.health, this.maxHealth) : this.maxHealth;

        /**
         * Custom name tag (if set by player).
         * @type {string|null}
         */
        this.nameTag = null;

        /**
         * Event subscribers for tick updates.
         * @type {Array<Function>}
         * @private
         */
        this._subscribers = [];
    };

    /**
     * Get the entity's current position.
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getPosition = function() {
        if (this._destroyed || !this._position) {
            return null;
        }
        return this._position;
    };

    /**
     * Set the entity's position.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     */
    Donkeycraft.Entity.prototype.setPosition = function(x, y, z) {
        if (this._destroyed) return;
        this._position.x = x;
        this._position.y = y;
        this._position.z = z;
    };

    /**
     * Get the entity's current velocity.
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getVelocity = function() {
        if (this._destroyed || !this._velocity) {
            return null;
        }
        return this._velocity;
    };

    /**
     * Set the entity's velocity components.
     * @param {number} vx - X velocity (blocks/s).
     * @param {number} vy - Y velocity (blocks/s).
     * @param {number} vz - Z velocity (blocks/s).
     */
    Donkeycraft.Entity.prototype.setVelocity = function(vx, vy, vz) {
        if (this._destroyed) return;
        this._velocity.x = vx;
        this._velocity.y = vy;
        this._velocity.z = vz;
    };

    /**
     * Get the entity's current rotation.
     * @returns {{yaw: number, pitch: number}|null} Rotation in radians.
     */
    Donkeycraft.Entity.prototype.getRotation = function() {
        if (this._destroyed || !this._rotation) {
            return null;
        }
        return this._rotation;
    };

    /**
     * Set the entity's rotation.
     * @param {number} yaw - Yaw angle in radians [0, 2π).
     * @param {number} pitch - Pitch angle in radians [-π/2, π/2].
     */
    Donkeycraft.Entity.prototype.setRotation = function(yaw, pitch) {
        if (this._destroyed) return;
        var twoPi = Math.PI * 2;
        this._rotation.yaw = ((yaw % twoPi) + twoPi) % twoPi;
        this._rotation.pitch = Donkeycraft.clamp(pitch, -Math.PI / 2, Math.PI / 2);
    };

    /**
     * Get the entity's dimensions.
     * @returns {{height: number, width: number}|null}
     */
    Donkeycraft.Entity.prototype.getDimensions = function() {
        if (this._destroyed) return null;
        return {
            height: this.height,
            width: this.width
        };
    };

    /**
     * Get the entity's bounding box (AABB).
     * @returns {{minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number}|null}
     */
    Donkeycraft.Entity.prototype.getBoundingBox = function() {
        if (this._destroyed || !this._position) {
            return null;
        }
        var halfWidth = this.width / 2;
        return {
            minX: this._position.x - halfWidth,
            minY: this._position.y,
            minZ: this._position.z - halfWidth,
            maxX: this._position.x + halfWidth,
            maxY: this._position.y + this.height,
            maxZ: this._position.z + halfWidth
        };
    };

    /**
     * Get the entity's eye position.
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getEyePosition = function() {
        if (this._destroyed || !this._position) {
            return null;
        }
        return new Donkeycraft.Vector3(
            this._position.x,
            this._position.y + this.height * 0.85,
            this._position.z
        );
    };

    /**
     * Get the forward direction vector based on entity rotation.
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getForwardDirection = function() {
        if (this._destroyed || !this._rotation) {
            return null;
        }
        var yaw = this._rotation.yaw;
        return new Donkeycraft.Vector3(
            -Math.sin(yaw),
            0,
            -Math.cos(yaw)
        ).normalize();
    };

    /**
     * Check if the entity is alive.
     * @returns {boolean}
     */
    Donkeycraft.Entity.prototype.isAlive = function() {
        return this.alive && !this._despawned;
    };

    /**
     * Set whether the entity is alive or dead.
     * @param {boolean} alive - True if alive, false if dead.
     */
    Donkeycraft.Entity.prototype.setAlive = function(alive) {
        if (this._destroyed) return;
        this.alive = !!alive;
        if (!alive) {
            this.onDeath();
        }
    };

    /**
     * Get the entity's current health.
     * @returns {number}
     */
    Donkeycraft.Entity.prototype.getHealth = function() {
        return this.health;
    };

    /**
     * Set the entity's health (clamped to [0, maxHealth]).
     * @param {number} health - Health value.
     */
    Donkeycraft.Entity.prototype.setHealth = function(health) {
        if (this._destroyed) return;
        this.health = Math.floor(Donkeycraft.clamp(health, 0, this.maxHealth));
        if (this.health <= 0) {
            this.setAlive(false);
        }
    };

    /**
     * Take damage from a source. Override in subclasses for custom behavior.
     * @param {number} amount - Damage amount.
     * @param {string} [source='generic'] - Damage source type.
     * @returns {number} Actual damage dealt.
     */
    Donkeycraft.Entity.prototype.takeDamage = function(amount, source) {
        source = source || 'generic';
        if (!this.isAlive() || this._destroyed) {
            return 0;
        }

        amount = Math.floor(amount);
        if (amount <= 0) {
            return 0;
        }

        this.health = Math.floor(Donkeycraft.clamp(this.health - amount, 0, this.maxHealth));
        if (this.health <= 0) {
            this.setAlive(false);
        }

        // Emit damage event via global EventBus for consistent handling
        if (EventBus) {
            try {
                EventBus.emitSafe('entity:damage', {
                    target: this,
                    attacker: source,
                    amount: amount,
                    health: this.health,
                    maxHealth: this.maxHealth
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }

        return amount;
    };

    /**
     * Heal the entity.
     * @param {number} amount - Healing amount.
     */
    Donkeycraft.Entity.prototype.heal = function(amount) {
        if (!this.isAlive() || this._destroyed) {
            return;
        }

        amount = Math.floor(amount);
        this.health = Math.min(this.health + amount, this.maxHealth);
    };

    /**
     * Called when the entity dies. Override in subclasses for custom death behavior.
     * @private
     */
    Donkeycraft.Entity.prototype.onDeath = function() {
        // Subclasses can override
    };

    /**
     * Tick method — called every game tick. Override for entity-specific logic.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Entity.prototype.tick = function(deltaTime) {
        if (this._destroyed) return;

        // Apply velocity to position
        this._position.x += this._velocity.x * deltaTime;
        this._position.y += this._velocity.y * deltaTime;
        this._position.z += this._velocity.z * deltaTime;

        // Call subscribers
        for (var i = 0; i < this._subscribers.length; i++) {
            try {
                this._subscribers[i](deltaTime);
            } catch (e) {
                // Error isolation
            }
        }
    };

    /**
     * Register a subscriber to be notified each tick.
     * @param {Function} callback - Function called with (deltaTime) each tick.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Entity.prototype.onTick = function(callback) {
        if (this._destroyed) return function() {};
        this._subscribers.push(callback);
        return (function() {
            var idx = this._subscribers.indexOf(callback);
            if (idx !== -1) {
                this._subscribers.splice(idx, 1);
            }
        }).bind(this);
    };

    /**
     * Despawn the entity (mark as removed).
     */
    Donkeycraft.Entity.prototype.despawn = function() {
        if (this._destroyed) return;
        this._despawned = true;
        this.alive = false;
    };

    /**
     * Check if the entity is despawned.
     * @returns {boolean}
     */
    Donkeycraft.Entity.prototype.isDespawned = function() {
        return this._despawned;
    };

    /**
     * Serialize entity state for save/load.
     * @returns {object|null} Serialized state, or null if destroyed.
     */
    Donkeycraft.Entity.prototype.serialize = function() {
        if (this._destroyed || !this._position) {
            return null;
        }
        return {
            type: this.type,
            x: this._position.x,
            y: this._position.y,
            z: this._position.z,
            health: this.health,
            maxHealth: this.maxHealth,
            nameTag: this.nameTag,
            alive: this.isAlive()
        };
    };

    /**
     * Deserialize entity state from saved data.
     * @param {object} data - Serialized state.
     */
    Donkeycraft.Entity.prototype.fromObject = function(data) {
        if (this._destroyed) return;
        if (!data || !this._position) return;
        if (data.x !== undefined) this._position.x = data.x;
        if (data.y !== undefined) this._position.y = data.y;
        if (data.z !== undefined) this._position.z = data.z;
        if (data.health !== undefined) this.health = data.health;
        if (data.maxHealth !== undefined) this.maxHealth = data.maxHealth;
        if (data.nameTag !== undefined) this.nameTag = data.nameTag;
    };

    /**
     * Destroy the entity and free resources.
     * After calling destroy(), all getter methods return null.
     */
    Donkeycraft.Entity.prototype.destroy = function() {
        if (this._destroyed) return; // Guard against double-destroy
        this._destroyed = true;
        this.alive = false;
        this._despawned = true;
        this._position = null;
        this._velocity = null;
        this._rotation = null;
        this._subscribers = [];
    };

})();