// Donkeycraft — Base Entity Class
// All entities (mobs, bosses, projectiles, doors, sign posts, donkeys, etc.) inherit from this base class.
// Enhanced with skeletal animation support via the entity engine system.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;
    var EventBus = Donkeycraft.EventBus;

    // ============================================================
    // Entity Type Constants — Common entity type identifiers
    // ============================================================

    /**
     * EntityTypes — Standardized entity type identifiers.
     * @namespace
     */
    Donkeycraft.EntityTypes = {
        PLAYER: 'player',
        NPC: 'npc',
        ANIMAL: 'animal',
        HOSTILE: 'hostile',
        BOSS: 'boss',
        PROJECTILE: 'projectile',
        DOOR: 'door',
        SIGN_POST: 'sign_post',
        CHEST: 'chest',
        FURNACE: 'furnace'
    };

    /**
     * Entity — base class for all entities in the world.
     * Supports skeletal animation via bone definitions and animation controllers.
     * @param {object} [config] - Entity configuration.
     * @param {string} [config.type='generic'] - Entity type identifier (e.g., 'zombie', 'cow', 'door').
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     * @param {number} [config.height=1.8] - Entity height in blocks.
     * @param {number} [config.width=0.6] - Entity width in blocks.
     * @param {number} [config.maxHealth=20] - Maximum health points.
     * @param {string} [config.skeleton=null] - Skeleton template name (e.g., 'bipedal', 'quadruped').
     */
    Donkeycraft.Entity = function (config) {
        config = config || {};

        /**
         * Entity type identifier (from EntityTypeDB or custom).
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
         * Entity height in blocks (from EntityTypeDB if available).
         * @type {number}
         */
        this.height = config.height || 1.8;

        /**
         * Entity width in blocks (from EntityTypeDB if available).
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

        /**
         * Ground detection callback (injected by EntityManager or game logic).
         * Returns the Y coordinate of the ground surface at the entity's position,
         * or null if no ground is detected.
         * @type {Function|null}
         * @private
         */
        this._groundCheck = null;

        // ============================================================
        // Animation & Skeleton System
        // ============================================================

        /**
         * Skeleton template name for this entity (e.g., 'bipedal', 'quadruped').
         * Looked up from EntityTypeDB if not explicitly provided.
         * @type {string|null}
         */
        this.skeleton = config.skeleton || null;

        /**
         * Bone definitions for this entity's skeleton.
         * Array of Donkeycraft.BoneDefinition objects.
         * @type {Array<Donkeycraft.BoneDefinition>|null}
         */
        this.bones = null;

        /**
         * Animation controller for this entity (manages state machine and kinematics).
         * @type {Object|null}
         * @private
         */
        this._animationController = null;

        /**
         * Whether this entity uses skeletal animation.
         * @type {boolean}
         */
        this.useAnimation = false;

        /**
         * Entity unique ID (assigned by EntityManager).
         * @type {number}
         */
        this._id = 0;

        // Initialize skeleton and animation if available
        this._initAnimationSystem();
    };

    /**
     * _initAnimationSystem — Initialize the skeleton and animation system for this entity.
     * @private
     */
    Donkeycraft.Entity.prototype._initAnimationSystem = function () {
        // Check if EntityTypeDB has a definition for this type
        var typeDef = null;
        if (Donkeycraft.EntityTypeDB) {
            typeDef = Donkeycraft.EntityTypeDB[this.type];
        }

        // Use type definition if available, otherwise use config
        if (typeDef) {
            // Set dimensions from type definition
            this.height = typeDef.height || this.height;
            this.width = typeDef.width || this.width;

            // Set skeleton if not already set
            if (!this.skeleton && typeDef.skeleton) {
                this.skeleton = typeDef.skeleton;
            }
        }

        // Initialize bones from skeleton template
        if (this.skeleton && Donkeycraft.SkeletonTemplates) {
            var skeletonTemplate = Donkeycraft.SkeletonTemplates[this.skeleton];
            if (skeletonTemplate && Array.isArray(skeletonTemplate)) {
                this.bones = skeletonTemplate;
                this.useAnimation = true;

                // Create animation controller
                this._createAnimationController(typeDef);
            }
        }

        // If no skeleton but still want basic idle animation, create minimal system
        if (!this.skeleton && !this._animationController) {
            // Static entity — no animation needed
            this.useAnimation = false;
            this.bones = [new (Donkeycraft.BoneDefinition || function () {})('root', {
                offset: new (Donkeycraft.Vector3 || function () {})(),
                pivot: new (Donkeycraft.Vector3 || function () {})()
            })];
        }
    };

    /**
     * _createAnimationController — Create and configure the animation controller for this entity.
     * @param {Object|null} typeDef - Entity type definition from EntityTypeDB.
     * @private
     */
    Donkeycraft.Entity.prototype._createAnimationController = function (typeDef) {
        if (!this.useAnimation || !Donkeycraft.EntityAnimationController) return;

        this._animationController = new Donkeycraft.EntityAnimationController();

        // Register animation clips based on type definition
        if (typeDef && typeDef.animations && Array.isArray(typeDef.animations)) {
            var clips = [];
            for (var i = 0; i < typeDef.animations.length; i++) {
                var animName = typeDef.animations[i];
                var animDef = Donkeycraft.AnimationDefinitions ? Donkeycraft.AnimationDefinitions[animName] : null;
                if (animDef) {
                    var clip = new Donkeycraft.AnimationClip(
                        animName,
                        animDef.duration,
                        animDef.loop !== undefined ? animDef.loop : true,
                        animDef.keyframes
                    );
                    clips.push(clip);
                }
            }
            this._animationController.registerAnimations(clips);

            // Set initial animation state to idle
            if (clips.length > 0) {
                this._animationController.setState('idle');
            }
        }
    };

    /**
     * _notifyTick — Internal tick notification for subscribers.
     * @param {number} deltaTime - Time since last tick.
     * @private
     */
    Donkeycraft.Entity.prototype._notifyTick = function (deltaTime) {
        for (var i = 0; i < this._subscribers.length; i++) {
            try {
                this._subscribers[i](deltaTime);
            } catch (e) {
                // Error isolation
            }
        }
    };

    // ============================================================
    // Position & Velocity API
    // ============================================================

    /**
     * Get the entity's current position.
     * Returns a copy to prevent external mutation of internal state.
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getPosition = function () {
        if (this._destroyed || !this._position) {
            return null;
        }
        return new Donkeycraft.Vector3(this._position.x, this._position.y, this._position.z);
    };

    /**
     * Set the entity's position.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     */
    Donkeycraft.Entity.prototype.setPosition = function (x, y, z) {
        if (this._destroyed) return;
        this._position.x = x;
        this._position.y = y;
        this._position.z = z;
    };

    /**
     * Get the entity's current velocity.
     * Returns a copy to prevent external mutation of internal state.
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getVelocity = function () {
        if (this._destroyed || !this._velocity) {
            return null;
        }
        return new Donkeycraft.Vector3(this._velocity.x, this._velocity.y, this._velocity.z);
    };

    /**
     * Set the entity's velocity components.
     * @param {number} vx - X velocity (blocks/s).
     * @param {number} vy - Y velocity (blocks/s).
     * @param {number} vz - Z velocity (blocks/s).
     */
    Donkeycraft.Entity.prototype.setVelocity = function (vx, vy, vz) {
        if (this._destroyed) return;
        this._velocity.x = vx;
        this._velocity.y = vy;
        this._velocity.z = vz;
    };

    /**
     * Get the entity's current rotation.
     * Returns a copy to prevent external mutation of internal state.
     * @returns {{yaw: number, pitch: number}|null} Rotation in radians.
     */
    Donkeycraft.Entity.prototype.getRotation = function () {
        if (this._destroyed || !this._rotation) {
            return null;
        }
        return { yaw: this._rotation.yaw, pitch: this._rotation.pitch };
    };

    /**
     * Set the entity's rotation.
     * @param {number} yaw - Yaw angle in radians [0, 2π).
     * @param {number} pitch - Pitch angle in radians [-π/2, π/2].
     */
    Donkeycraft.Entity.prototype.setRotation = function (yaw, pitch) {
        if (this._destroyed) return;
        var twoPi = Math.PI * 2;
        this._rotation.yaw = ((yaw % twoPi) + twoPi) % twoPi;
        this._rotation.pitch = Donkeycraft.clamp(pitch, -Math.PI / 2, Math.PI / 2);
    };

    /**
     * setGroundCheck — Inject a ground detection callback.
     * The callback should return the Y coordinate of the ground surface at the entity's
     * current position, or null if no solid ground exists below the entity.
     * This is typically called by EntityManager during tick to provide chunk-based ground detection.
     * @param {Function|null} groundCheck - Function returning ground Y level or null.
     */
    Donkeycraft.Entity.prototype.setGroundCheck = function (groundCheck) {
        if (this._destroyed) return;
        this._groundCheck = typeof groundCheck === 'function' ? groundCheck : null;
    };

    // ============================================================
    // Dimensions & Bounding Box API
    // ============================================================

    /**
     * Get the entity's dimensions.
     * @returns {{height: number, width: number}|null}
     */
    Donkeycraft.Entity.prototype.getDimensions = function () {
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
    Donkeycraft.Entity.prototype.getBoundingBox = function () {
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
     * Get the entity's eye position (for raycasting, line-of-sight).
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getEyePosition = function () {
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
    Donkeycraft.Entity.prototype.getForwardDirection = function () {
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

    // ============================================================
    // Health & Damage API
    // ============================================================

    /**
     * Check if the entity is alive.
     * @returns {boolean}
     */
    Donkeycraft.Entity.prototype.isAlive = function () {
        return this.alive && !this._despawned;
    };

    /**
     * Set whether the entity is alive or dead.
     * @param {boolean} alive - True if alive, false if dead.
     */
    Donkeycraft.Entity.prototype.setAlive = function (alive) {
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
    Donkeycraft.Entity.prototype.getHealth = function () {
        return this.health;
    };

    /**
     * Get the entity's maximum health.
     * @returns {number}
     */
    Donkeycraft.Entity.prototype.getMaxHealth = function () {
        return this.maxHealth;
    };

    /**
     * Set the entity's health (clamped to [0, maxHealth]).
     * @param {number} health - Health value.
     */
    Donkeycraft.Entity.prototype.setHealth = function (health) {
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
    Donkeycraft.Entity.prototype.takeDamage = function (amount, source) {
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

        // Trigger hurt animation if available
        if (this._animationController && Donkeycraft.AnimationDefinitions && Donkeycraft.AnimationDefinitions.hurt) {
            this._animationController.setForcedState('hurt', 0.4);
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
    Donkeycraft.Entity.prototype.heal = function (amount) {
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
    Donkeycraft.Entity.prototype.onDeath = function () {
        // Subclasses can override
    };

    // ============================================================
    // Animation API — Bone transforms and animation control
    // ============================================================

    /**
     * Get the entity's bone definitions.
     * @returns {Array<Donkeycraft.BoneDefinition>|null} Array of bone definitions, or null.
     */
    Donkeycraft.Entity.prototype.getBones = function () {
        if (this._destroyed) return null;
        return this.bones;
    };

    /**
     * Get the entity's animation controller.
     * @returns {Object|null} Animation controller instance, or null.
     */
    Donkeycraft.Entity.prototype.getAnimationController = function () {
        return this._animationController;
    };

    /**
     * Get the current bone rotation transforms for rendering.
     * Returns { boneName: { rx, ry, rz } } where rotations are in radians.
     * @returns {Object.<string, {rx: number, ry: number, rz: number}>}
     */
    Donkeycraft.Entity.prototype.getBoneTransforms = function () {
        if (!this._animationController) return {};
        return this._animationController.getBoneTransforms();
    };

    /**
     * Force an animation state on this entity (e.g., 'attack', 'hurt').
     * @param {string} state - Animation state name.
     * @param {number} [duration=0] - Duration in seconds (0 = until cleared).
     */
    Donkeycraft.Entity.prototype.setAnimationState = function (state, duration) {
        if (!this._animationController) return;
        this._animationController.setForcedState(state, duration);
    };

    /**
     * Clear any forced animation state, returning to auto-selection.
     */
    Donkeycraft.Entity.prototype.clearAnimationState = function () {
        if (!this._animationController) return;
        this._animationController.clearForcedState();
    };

    /**
     * Get the current animation state name.
     * @returns {string|null} Current animation state or null.
     */
    Donkeycraft.Entity.prototype.getAnimationState = function () {
        if (!this._animationController) return null;
        return this._animationController.getState();
    };

    /**
     * Get the skeleton template name for this entity.
     * @returns {string|null} Skeleton name or null.
     */
    Donkeycraft.Entity.prototype.getSkeleton = function () {
        return this.skeleton;
    };

    // ============================================================
    // Tick & Lifecycle API
    // ============================================================

    /**
     * Tick method — called every game tick. Override for entity-specific logic.
     * Updates animation controller and applies velocity to position.
     * The ground detection callback is injected via setGroundCheck() by EntityManager
     * or the game's logic layer. If no callback is set, entities will fall through the world.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Entity.prototype.tick = function (deltaTime) {
        if (this._destroyed || !this._position) return;

        // Use injected ground check if available, otherwise fall back to internal placeholder
        var groundCheck = this._groundCheck || null;

        // Update animation controller if available
        if (this._animationController) {
            var result = this._animationController.tick(deltaTime, groundCheck);

            // Apply kinematic velocity to entity position.
            // The animation controller's kinematics module computes velocity based on
            // movement speed thresholds and physics simulation.
            var kinematics = result.kinematics;
            if (kinematics) {
                this._velocity.x = kinematics.velocity.x;
                this._velocity.y = kinematics.velocity.y;
                this._velocity.z = kinematics.velocity.z;
            }
        }

        // Apply velocity to position using semi-implicit Euler integration.
        // Position delta = velocity * deltaTime ensures frame-rate-independent movement.
        this._position.x += this._velocity.x * deltaTime;
        this._position.y += this._velocity.y * deltaTime;
        this._position.z += this._velocity.z * deltaTime;

        // Notify tick subscribers
        for (var i = 0; i < this._subscribers.length; i++) {
            try {
                this._subscribers[i](deltaTime);
            } catch (e) {
                // Error isolation — a failing subscriber should not break the entity
            }
        }
    };

    /**
     * Register a subscriber to be notified each tick.
     * @param {Function} callback - Function called with (deltaTime) each tick.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Entity.prototype.onTick = function (callback) {
        if (this._destroyed) return function () { };
        this._subscribers.push(callback);
        return (function () {
            var idx = this._subscribers.indexOf(callback);
            if (idx !== -1) {
                this._subscribers.splice(idx, 1);
            }
        }).bind(this);
    };

    /**
     * Despawn the entity (mark as removed).
     */
    Donkeycraft.Entity.prototype.despawn = function () {
        if (this._destroyed) return;
        this._despawned = true;
        this.alive = false;
    };

    /**
     * Check if the entity is despawned.
     * @returns {boolean}
     */
    Donkeycraft.Entity.prototype.isDespawned = function () {
        return this._despawned;
    };

    /**
     * Serialize entity state for save/load.
     * @returns {object|null} Serialized state, or null if destroyed.
     */
    Donkeycraft.Entity.prototype.serialize = function () {
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
    Donkeycraft.Entity.prototype.fromObject = function (data) {
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
     * This method is idempotent — calling it multiple times is safe.
     */
    Donkeycraft.Entity.prototype.destroy = function () {
        if (this._destroyed) return; // Guard against double-destroy
        this._destroyed = true;
        this.alive = false;
        this._despawned = true;
        this._position = null;
        this._velocity = null;
        this._rotation = null;
        this._subscribers = [];
        this._groundCheck = null;
        this.bones = null;
        this._animationController = null;
    };

})();