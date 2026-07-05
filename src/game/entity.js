// Donkeycraft — Base Entity Class
// All entities inherit from this base class with skeletal animation support.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;
    var EventBus = Donkeycraft.EventBus;

    /**
     * EntityTypes — Standardized entity type identifiers.
     * @namespace
     */
    Donkeycraft.EntityTypes = {
        GENERIC: 'generic',
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
     * Entity — Base class for all entities in the world.
     * Supports skeletal animation via bone definitions and animation controllers.
     * @constructor
     * @param {object} [config] - Entity configuration.
     * @param {string} [config.type='generic'] - Entity type identifier.
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     * @param {number} [config.height=1.8] - Entity height in blocks.
     * @param {number} [config.width=0.6] - Entity width in blocks.
     * @param {number} [config.maxHealth=20] - Maximum health points.
     * @param {string} [config.skeleton=null] - Skeleton template name.
     */
    Donkeycraft.Entity = function (config) {
        config = config || {};

        /** Entity type identifier. */
        this.type = config.type || 'generic';

        /** Entity position as a Vector3. */
        this._position = new Donkeycraft.Vector3(
            config.x !== undefined ? config.x : 0,
            config.y !== undefined ? config.y : Config.WORLD_HEIGHT / 2,
            config.z !== undefined ? config.z : 0
        );

        /** Entity velocity as a Vector3. */
        this._velocity = new Donkeycraft.Vector3(0, 0, 0);

        /** Entity rotation: yaw and pitch in radians. */
        this._rotation = { yaw: 0, pitch: 0 };

        /** Entity height in blocks. */
        this.height = config.height || 1.8;

        /** Entity width in blocks. */
        this.width = config.width || 0.6;

        /** Whether the entity is alive. */
        this.alive = true;

        /** Whether the entity has been despawned. */
        this._despawned = false;

        /** Whether the entity has been destroyed. */
        this._destroyed = false;

        /** Maximum health points. */
        this.maxHealth = config.maxHealth || 20;

        /** Current health points (0 = dead). */
        this.health = config.health !== undefined ? Math.min(config.health, this.maxHealth) : this.maxHealth;

        /** Custom name tag (if set by player). */
        this.nameTag = null;

        /** Event subscribers for tick updates. */
        this._subscribers = [];

        /** Ground detection callback (injected by EntityManager). */
        this._groundCheck = null;

        // Animation & Skeleton System
        /** Skeleton template name (e.g., 'bipedal', 'quadruped'). */
        this.skeleton = config.skeleton || null;

        /** Bone definitions array of Donkeycraft.BoneDefinition objects. */
        this.bones = null;

        /** Animation controller for this entity. */
        this._animationController = null;

        /** Whether this entity uses skeletal animation. */
        this.useAnimation = false;

        /** Entity unique ID (assigned by EntityManager). */
        this._id = 0;

        this._initAnimationSystem();
    };

    /**
     * _initAnimationSystem — Initialize the skeleton and animation system for this entity.
     * @private
     */
    Donkeycraft.Entity.prototype._initAnimationSystem = function () {
        var typeDef = Donkeycraft.EntityTypeDB ? Donkeycraft.EntityTypeDB[this.type] : null;

        if (typeDef) {
            this.height = typeDef.height || this.height;
            this.width = typeDef.width || this.width;
            if (!this.skeleton && typeDef.skeleton) {
                this.skeleton = typeDef.skeleton;
            }
        }

        if (this.skeleton && Donkeycraft.SkeletonTemplates) {
            var skeletonTemplate = Donkeycraft.SkeletonTemplates[this.skeleton];
            if (skeletonTemplate && Array.isArray(skeletonTemplate)) {
                this.bones = skeletonTemplate;
                this.useAnimation = true;
                this._createAnimationController(typeDef);
            }
        }

        if (!this.skeleton) {
            this.useAnimation = false;
            this.bones = null;
        }
    };

    /**
     * _createAnimationController — Create and configure the animation controller.
     * @private
     * @param {Object|null} typeDef - Entity type definition from EntityTypeDB.
     */
    Donkeycraft.Entity.prototype._createAnimationController = function (typeDef) {
        if (!this.useAnimation || !Donkeycraft.EntityAnimationController) return;

        this._animationController = new Donkeycraft.EntityAnimationController();

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
            if (clips.length > 0) {
                this._animationController.setState('idle');
            }
        }
    };

    // ============================================================
    // Position & Velocity API
    // ============================================================

    /**
     * getPosition — Get the entity's current position.
     * @returns {Donkeycraft.Vector3|null} Position vector, or null if destroyed.
     */
    Donkeycraft.Entity.prototype.getPosition = function () {
        if (this._destroyed || !this._position) return null;
        return new Donkeycraft.Vector3(this._position.x, this._position.y, this._position.z);
    };

    /**
     * setPosition — Set the entity's position.
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
     * getVelocity — Get the entity's current velocity.
     * @returns {Donkeycraft.Vector3|null} Velocity vector, or null if destroyed.
     */
    Donkeycraft.Entity.prototype.getVelocity = function () {
        if (this._destroyed || !this._velocity) return null;
        return new Donkeycraft.Vector3(this._velocity.x, this._velocity.y, this._velocity.z);
    };

    /**
     * setVelocity — Set the entity's velocity components.
     * @param {number} vx - X velocity (blocks/s).
     * @param {number} vy - Y velocity (blocks/s).
     * @param {number} vz - Z velocity (blocks/s).
     */
    Donkeycraft.Entity.prototype.setVelocity = function (vx, vy, vz) {
        if (this._destroyed) return;
        this._velocity.x = vx || 0;
        this._velocity.y = vy || 0;
        this._velocity.z = vz || 0;
    };

    /**
     * getRotation — Get the entity's current rotation.
     * @returns {{yaw: number, pitch: number}|null} Rotation object with yaw and pitch in radians.
     */
    Donkeycraft.Entity.prototype.getRotation = function () {
        if (this._destroyed || !this._rotation) return null;
        return { yaw: this._rotation.yaw, pitch: this._rotation.pitch };
    };

    /**
     * setRotation — Set the entity's rotation.
     * Yaw is normalized to [0, 2π). Pitch is clamped to [-π/2, π/2].
     * @param {number} yaw - Yaw angle in radians.
     * @param {number} pitch - Pitch angle in radians.
     */
    Donkeycraft.Entity.prototype.setRotation = function (yaw, pitch) {
        if (this._destroyed) return;
        var twoPi = Math.PI * 2;
        this._rotation.yaw = ((yaw % twoPi) + twoPi) % twoPi;
        var clampFn = typeof Donkeycraft.clamp === 'function' ? Donkeycraft.clamp : null;
        this._rotation.pitch = clampFn
            ? clampFn(pitch, -Math.PI / 2, Math.PI / 2)
            : Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    };

    /**
     * setGroundCheck — Inject a ground detection callback.
     * Passing null clears any previously set ground check.
     * @param {Function|null} groundCheck - Function returning ground Y level or null.
     */
    Donkeycraft.Entity.prototype.setGroundCheck = function (groundCheck) {
        if (this._destroyed) return;
        this._groundCheck = typeof groundCheck === 'function' ? groundCheck : null;
    };

    /**
     * getGroundCheck — Get the current ground detection callback.
     * @returns {Function|null} Ground check function or null.
     */
    Donkeycraft.Entity.prototype.getGroundCheck = function () {
        return this._groundCheck;
    };

    // ============================================================
    // Dimensions & Bounding Box API
    // ============================================================

    /**
     * getDimensions — Get the entity's dimensions.
     * @returns {{height: number, width: number}|null}
     */
    Donkeycraft.Entity.prototype.getDimensions = function () {
        if (this._destroyed) return null;
        return { height: this.height, width: this.width };
    };

    /**
     * getBoundingBox — Get the entity's bounding box (AABB).
     * @returns {{minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number}|null}
     */
    Donkeycraft.Entity.prototype.getBoundingBox = function () {
        if (this._destroyed || !this._position) return null;
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
     * getEyePosition — Get the entity's eye position (for raycasting, line-of-sight).
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getEyePosition = function () {
        if (this._destroyed || !this._position) return null;
        return new Donkeycraft.Vector3(
            this._position.x,
            this._position.y + this.height * 0.85,
            this._position.z
        );
    };

    /**
     * getForwardDirection — Get the forward direction vector based on entity rotation.
     * @returns {Donkeycraft.Vector3|null}
     */
    Donkeycraft.Entity.prototype.getForwardDirection = function () {
        if (this._destroyed || !this._rotation) return null;
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
     * isAlive — Check if the entity is alive.
     * @returns {boolean}
     */
    Donkeycraft.Entity.prototype.isAlive = function () {
        return this.alive && !this._despawned;
    };

    /**
     * setAlive — Set whether the entity is alive or dead.
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
     * getHealth — Get the entity's current health.
     * @returns {number}
     */
    Donkeycraft.Entity.prototype.getHealth = function () {
        return this.health;
    };

    /**
     * getMaxHealth — Get the entity's maximum health.
     * @returns {number}
     */
    Donkeycraft.Entity.prototype.getMaxHealth = function () {
        return this.maxHealth;
    };

    /**
     * setHealth — Set the entity's health (clamped to [0, maxHealth]).
     * @param {number} health - Health value.
     */
    Donkeycraft.Entity.prototype.setHealth = function (health) {
        if (this._destroyed) return;
        var clampFn = typeof Donkeycraft.clamp === 'function' ? Donkeycraft.clamp : null;
        this.health = clampFn
            ? Math.floor(clampFn(health, 0, this.maxHealth))
            : Math.floor(Math.max(0, Math.min(this.maxHealth, health)));
        if (this.health <= 0) {
            this.setAlive(false);
        }
    };

    /**
     * takeDamage — Take damage from a source.
     * @param {number} amount - Damage amount.
     * @param {string} [source='generic'] - Damage source type.
     * @returns {number} Actual damage dealt.
     */
    Donkeycraft.Entity.prototype.takeDamage = function (amount, source) {
        source = source || 'generic';
        if (!this.isAlive() || this._destroyed) return 0;

        amount = Math.floor(amount);
        if (amount <= 0) return 0;

        var clampFn = typeof Donkeycraft.clamp === 'function' ? Donkeycraft.clamp : null;
        this.health = clampFn
            ? Math.floor(clampFn(this.health - amount, 0, this.maxHealth))
            : Math.floor(Math.max(0, Math.min(this.maxHealth, this.health - amount)));

        if (this.health <= 0) {
            this.setAlive(false);
        }

        if (this._animationController && Donkeycraft.AnimationDefinitions && Donkeycraft.AnimationDefinitions.hurt) {
            this._animationController.setForcedState('hurt', 0.4);
        }

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
     * heal — Heal the entity.
     * @param {number} amount - Healing amount.
     */
    Donkeycraft.Entity.prototype.heal = function (amount) {
        if (!this.isAlive() || this._destroyed) return;
        this.health = Math.min(this.health + Math.floor(amount), this.maxHealth);
    };

    /**
     * onDeath — Called when the entity dies. Override in subclasses.
     * @private
     */
    Donkeycraft.Entity.prototype.onDeath = function () {
        // Subclasses can override
    };

    // ============================================================
    // Animation API
    // ============================================================

    /**
     * getBones — Get the entity's bone definitions.
     * @returns {Array<Donkeycraft.BoneDefinition>|null} Array of bone definitions, or null.
     */
    Donkeycraft.Entity.prototype.getBones = function () {
        if (this._destroyed) return null;
        return this.bones;
    };

    /**
     * getAnimationController — Get the entity's animation controller.
     * @returns {Object|null} Animation controller instance, or null.
     */
    Donkeycraft.Entity.prototype.getAnimationController = function () {
        return this._animationController;
    };

    /**
     * getBoneTransforms — Get current bone rotation transforms for rendering.
     * @returns {Object.<string, {rx: number, ry: number, rz: number}>} Bone rotations in radians.
     */
    Donkeycraft.Entity.prototype.getBoneTransforms = function () {
        if (!this._animationController) return {};
        return this._animationController.getBoneTransforms();
    };

    /**
     * setAnimationState — Force an animation state on this entity.
     * @param {string} state - Animation state name.
     * @param {number} [duration=0] - Duration in seconds (0 = until cleared).
     */
    Donkeycraft.Entity.prototype.setAnimationState = function (state, duration) {
        if (!this._animationController) return;
        this._animationController.setForcedState(state, duration);
    };

    /**
     * clearAnimationState — Clear any forced animation state, returning to auto-selection.
     */
    Donkeycraft.Entity.prototype.clearAnimationState = function () {
        if (!this._animationController) return;
        this._animationController.clearForcedState();
    };

    /**
     * getAnimationState — Get the current animation state name.
     * @returns {string|null} Current animation state or null.
     */
    Donkeycraft.Entity.prototype.getAnimationState = function () {
        if (!this._animationController) return null;
        return this._animationController.getState();
    };

    /**
     * getSkeleton — Get the skeleton template name for this entity.
     * @returns {string|null} Skeleton name or null.
     */
    Donkeycraft.Entity.prototype.getSkeleton = function () {
        return this.skeleton;
    };

    // ============================================================
    // Tick & Lifecycle API
    // ============================================================

    /**
     * tick — Called every game tick to update entity state.
     * Update flow: 1) Update animation controller, 2) Apply velocity to position,
     * 3) Notify tick subscribers.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Entity.prototype.tick = function (deltaTime) {
        if (this._destroyed || !this._position) return;

        var groundCheck = this._groundCheck;

        if (this._animationController) {
            var result = this._animationController.tick(deltaTime, groundCheck);
            var kinematics = result.kinematics;
            if (kinematics) {
                this._velocity.x = kinematics.velocity.x;
                this._velocity.y = kinematics.velocity.y;
                this._velocity.z = kinematics.velocity.z;
            }
        }

        this._position.x += this._velocity.x * deltaTime;
        this._position.y += this._velocity.y * deltaTime;
        this._position.z += this._velocity.z * deltaTime;

        for (var i = 0; i < this._subscribers.length; i++) {
            try {
                this._subscribers[i](deltaTime);
            } catch (e) {
                // A failing subscriber should not break the entity
            }
        }
    };

    /**
     * onTick — Register a subscriber to be notified each tick.
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
     * despawn — Despawn the entity (mark as removed).
     */
    Donkeycraft.Entity.prototype.despawn = function () {
        if (this._destroyed) return;
        this._despawned = true;
        this.alive = false;
    };

    /**
     * isDespawned — Check if the entity is despawned.
     * @returns {boolean}
     */
    Donkeycraft.Entity.prototype.isDespawned = function () {
        return this._despawned;
    };

    /**
     * serialize — Serialize entity state for save/load.
     * @returns {object|null} Serialized state, or null if destroyed.
     */
    Donkeycraft.Entity.prototype.serialize = function () {
        if (this._destroyed || !this._position) return null;
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
     * fromObject — Deserialize entity state from saved data.
     * @param {object} data - Serialized state.
     */
    Donkeycraft.Entity.prototype.fromObject = function (data) {
        if (this._destroyed || !this._position) return;
        if (!data) return;
        if (data.x !== undefined) this._position.x = data.x;
        if (data.y !== undefined) this._position.y = data.y;
        if (data.z !== undefined) this._position.z = data.z;
        if (data.health !== undefined) this.health = data.health;
        if (data.maxHealth !== undefined) this.maxHealth = data.maxHealth;
        if (data.nameTag !== undefined) this.nameTag = data.nameTag;
    };

    /**
     * destroy — Destroy the entity and free resources.
     * After calling, all getter methods return null. Idempotent.
     */
    Donkeycraft.Entity.prototype.destroy = function () {
        if (this._destroyed) return;
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