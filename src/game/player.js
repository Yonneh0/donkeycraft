// Donkeycraft — Player Entity
// Player entity: position, velocity, rotation, dimensions (1.8×0.6), game mode.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Player — represents the player entity with position, velocity, rotation, and game mode.
     * @param {object} [config] - Configuration overrides.
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     * @param {string} [config.gameMode='survival'] - Game mode: 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.Player = function (config) {
        config = config || {};

        /**
         * Player position as a Vector3.
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._position = new Donkeycraft.Vector3(
            config.x !== undefined ? config.x : 0,
            config.y !== undefined ? config.y : Config.WORLD_HEIGHT / 2,
            config.z !== undefined ? config.z : 0
        );

        /**
         * Player velocity as a Vector3.
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._velocity = new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Player rotation: yaw (horizontal) and pitch (vertical) in radians.
         * @type {{yaw: number, pitch: number}}
         * @private
         */
        this._rotation = {
            yaw: 0,       // Facing negative Z by default
            pitch: 0      // Looking straight ahead
        };

        /**
         * Player height in blocks.
         * @type {number}
         */
        this.height = Config.PLAYER_HEIGHT;

        /**
         * Player width in blocks.
         * @type {number}
         */
        this.width = Config.PLAYER_WIDTH;

        /**
         * Current game mode: 'survival', 'creative', or 'spectator'.
         * @type {string}
         */
        this.gameMode = config.gameMode || 'survival';

        /**
         * Whether the player is currently on the ground.
         * Updated by collision resolution each tick.
         * @type {boolean}
         */
        this.onGround = false;

        /**
         * Whether flying mode is enabled (creative/spectator only).
         * Controlled by Flying system or GameMode system.
         * @type {boolean}
         */
        this.flyEnabled = false;

        /**
         * Maximum distance fallen before taking fall damage.
         * Reset when landing on solid ground.
         * @type {number}
         */
        this.maxFallDistance = 0;

        /**
         * Current knockback velocity vector.
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._knockback = new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Whether the player is alive.
         * Set to false on death, checked before most game logic.
         * @type {boolean}
         */
        this.alive = true;

        /**
         * Event subscribers for tick updates.
         * @type {Array<Function>}
         * @private
         */
        this._subscribers = [];
    };

    /**
     * Get the player's current position.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Player.prototype.getPosition = function () {
        return this._position;
    };

    /**
     * Set the player's position.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     */
    Donkeycraft.Player.prototype.setPosition = function (x, y, z) {
        this._position.x = x;
        this._position.y = y;
        this._position.z = z;
    };

    /**
     * Get the player's current velocity.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Player.prototype.getVelocity = function () {
        return this._velocity;
    };

    /**
     * Set the player's velocity components.
     * @param {number} vx - X velocity (blocks/s).
     * @param {number} vy - Y velocity (blocks/s).
     * @param {number} vz - Z velocity (blocks/s).
     */
    Donkeycraft.Player.prototype.setVelocity = function (vx, vy, vz) {
        this._velocity.x = vx;
        this._velocity.y = vy;
        this._velocity.z = vz;
    };

    /**
     * Get the player's current rotation.
     * @returns {{yaw: number, pitch: number}} Rotation in radians.
     */
    Donkeycraft.Player.prototype.getRotation = function () {
        return this._rotation;
    };

    /**
     * Set the player's rotation.
     * @param {number} yaw - Yaw angle in radians [0, 2π).
     * @param {number} pitch - Pitch angle in radians [-π/2, π/2].
     */
    Donkeycraft.Player.prototype.setRotation = function (yaw, pitch) {
        // Normalize yaw to [0, 2π) using modulo arithmetic (O(1) vs O(n) while loops)
        var twoPi = Math.PI * 2;
        this._rotation.yaw = ((yaw % twoPi) + twoPi) % twoPi;

        // Clamp pitch to [-π/2, π/2] (straight down to straight up)
        this._rotation.pitch = Donkeycraft.clamp(pitch, -Math.PI / 2, Math.PI / 2);
    };

    /**
     * Adjust yaw by a delta amount.
     * @param {number} deltaYaw - Yaw change in radians.
     */
    Donkeycraft.Player.prototype.adjustYaw = function (deltaYaw) {
        var twoPi = Math.PI * 2;
        this._rotation.yaw = ((this._rotation.yaw + deltaYaw) % twoPi + twoPi) % twoPi;
    };

    /**
     * Adjust pitch by a delta amount.
     * @param {number} deltaPitch - Pitch change in radians.
     */
    Donkeycraft.Player.prototype.adjustPitch = function (deltaPitch) {
        this._rotation.pitch = Donkeycraft.clamp(
            this._rotation.pitch + deltaPitch,
            -Math.PI / 2,
            Math.PI / 2
        );
    };

    /**
     * Get the player's dimensions.
     * @returns {{height: number, width: number}}
     */
    Donkeycraft.Player.prototype.getDimensions = function () {
        return {
            height: this.height,
            width: this.width
        };
    };

    /**
     * Get the player's current game mode.
     * @returns {string} 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.Player.prototype.getGameMode = function () {
        return this.gameMode;
    };

    /**
     * Set the player's game mode.
     * @param {string} mode - 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.Player.prototype.setGameMode = function (mode) {
        var validModes = ['survival', 'creative', 'spectator'];
        if (validModes.indexOf(mode) === -1) {
            return; // Invalid mode — ignore
        }
        this.gameMode = mode;

        // Disable flying when switching to survival
        if (mode === 'survival') {
            this.flyEnabled = false;
        }
    };

    /**
     * Check if the player is alive.
     * @returns {boolean}
     */
    Donkeycraft.Player.prototype.isAlive = function () {
        return this.alive;
    };

    /**
     * Set whether the player is alive or dead.
     * @param {boolean} alive - True if alive, false if dead.
     */
    Donkeycraft.Player.prototype.setAlive = function (alive) {
        this.alive = !!alive;
    };

    /**
     * Get the player's eye position (for raycasting and camera).
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Player.prototype.getEyePosition = function () {
        var eyeHeight = Config.PLAYER_EYE_HEIGHT;
        return new Donkeycraft.Vector3(
            this._position.x,
            this._position.y + eyeHeight,
            this._position.z
        );
    };

    /**
     * Get the player's bounding box (AABB).
     * @returns {{minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number}}
     */
    Donkeycraft.Player.prototype.getHurtBox = function () {
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
     * Get the forward direction vector based on player rotation.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Player.prototype.getForwardDirection = function () {
        var yaw = this._rotation.yaw;
        return new Donkeycraft.Vector3(
            -Math.sin(yaw),
            0,
            -Math.cos(yaw)
        ).normalize();
    };

    /**
     * Get the right direction vector (90° clockwise from forward).
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Player.prototype.getRightDirection = function () {
        var yaw = this._rotation.yaw;
        return new Donkeycraft.Vector3(
            -Math.sin(yaw + Math.PI / 2),
            0,
            -Math.cos(yaw + Math.PI / 2)
        ).normalize();
    };

    /**
     * Get the current knockback velocity.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Player.prototype.getKnockback = function () {
        return this._knockback;
    };

    /**
     * Apply knockback from a direction with given strength.
     * @param {Donkeycraft.Vector3} direction - Direction to knock back (will be normalized).
     * @param {number} strength - Knockback strength (blocks/s).
     * @param {number} [upwardForce=0] - Upward component of knockback.
     */
    Donkeycraft.Player.prototype.applyKnockback = function (direction, strength, upwardForce) {
        upwardForce = upwardForce || 0;
        var normalized = direction.normalized();
        this._knockback.x = normalized.x * strength;
        this._knockback.y = upwardForce;
        this._knockback.z = normalized.z * strength;
    };

    /**
     * Clear the current knockback velocity.
     */
    Donkeycraft.Player.prototype.clearKnockback = function () {
        this._knockback.set(0, 0, 0);
    };

    /**
     * Track maximum fall distance for fall damage calculation.
     * Call with negative deltaY values (downward movement) to accumulate.
     * @param {number} deltaY - Downward displacement in blocks (positive value = falling down).
     */
    Donkeycraft.Player.prototype.trackFallDistance = function (deltaY) {
        if (deltaY > 0) {
            this.maxFallDistance += deltaY;
        } else if (this.onGround && this.maxFallDistance > 0) {
            // Reset when landing after a fall
            this.maxFallDistance = 0;
        }
    };

    /**
     * Get the current fall distance for damage calculation.
     * @returns {number}
     */
    Donkeycraft.Player.prototype.getFallDistance = function () {
        return this.maxFallDistance;
    };

    /**
     * Register a subscriber to be notified each tick.
     * @param {Function} callback - Function called with (deltaTime) each tick.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Player.prototype.onTick = function (callback) {
        this._subscribers.push(callback);
        return function () {
            var idx = this._subscribers.indexOf(callback);
            if (idx !== -1) {
                this._subscribers.splice(idx, 1);
            }
        }.bind(this);
    };

    /**
     * Notify all tick subscribers.
     * @param {number} deltaTime - Time since last tick in seconds.
     * @private
     */
    Donkeycraft.Player.prototype._notifyTick = function (deltaTime) {
        for (var i = 0; i < this._subscribers.length; i++) {
            try {
                this._subscribers[i](deltaTime);
            } catch (e) {
                // Error isolation — log subscriber errors so debugging is possible
                if (Donkeycraft.Logger) {
                    Donkeycraft.Logger.error('Subscriber error in Player tick:', e);
                }
            }
        }
    };

    /**
     * Destroy the player and free resources.
     */
    Donkeycraft.Player.prototype.destroy = function () {
        this._position = null;
        this._velocity = null;
        this._knockback = null;
        this._subscribers = [];
    };

})();