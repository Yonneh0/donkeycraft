// Donkeycraft — Player Entity
// Player entity: position, velocity, rotation, dimensions (1.8×0.6), game mode.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Player — represents the player entity with position, velocity, rotation, and game mode.
     *
     * The player is the central entity that all player subsystems operate on. It holds state
     * (position, velocity, rotation, game mode) while physics are applied by Movement,
     * collision is resolved by Collision, jumping is handled by Jumping, and flying state
     * is managed by Flying.
     *
     * Position is stored as a center point (not corner). Yaw is normalized to [0, 2π).
     * Pitch is clamped to [-π/2, π/2] (straight down to straight up).
     *
     * @param {object} [config] - Configuration overrides.
     * @param {number} [config.x=0] - Initial X position in blocks.
     * @param {number} [config.y=64] - Initial Y position in blocks (defaults to middle of world).
     * @param {number} [config.z=0] - Initial Z position in blocks.
     * @param {string} [config.gameMode='survival'] - Game mode: 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.Player = function (config) {
        config = config || {};

        /**
         * Player position as a Vector3 — represents the center point at feet level.
         * Used for all movement, collision, and rendering calculations.
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._position = new Donkeycraft.Vector3(
            config.x !== undefined ? config.x : 0,
            config.y !== undefined ? config.y : Config.WORLD_HEIGHT / 2,
            config.z !== undefined ? config.z : 0
        );

        /**
         * Player velocity as a Vector3 in blocks per second.
         * Modified by Movement, Collision, and Knockback systems each tick.
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._velocity = new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Player rotation in radians.
         * - **yaw**: Horizontal rotation, normalized to [0, 2π). 0 = facing negative Z.
         * - **pitch**: Vertical rotation, clamped to [-π/2, π/2]. Negative = looking up, positive = looking down.
         * @type {{yaw: number, pitch: number}}
         * @private
         */
        this._rotation = {
            yaw: 0,       // Facing negative Z by default
            pitch: 0      // Looking straight ahead
        };

        /**
         * Player height in blocks (default 1.8 from `Config.PLAYER_HEIGHT`).
         * Used for collision detection, rendering, and eye position calculation.
         * @type {number}
         */
        this.height = Config.PLAYER_HEIGHT;

        /**
         * Player width in blocks (default 0.6 from `Config.PLAYER_WIDTH`).
         * Used for collision detection — the player's AABB extends ±width/2 from center on X and Z axes.
         * @type {number}
         */
        this.width = Config.PLAYER_WIDTH;

        /**
         * Current game mode: 'survival', 'creative', or 'spectator'.
         * Changed via GameMode system or directly via setGameMode().
         * When set to 'survival', flying is automatically disabled.
         * @type {string}
         */
        this.gameMode = config.gameMode || 'survival';

        /**
         * Whether the player is currently on the ground.
         * Set to `true` by Collision._resolveDisplacement() when downward movement is blocked.
         * Used by Jumping (can jump?), Movement (gravity vs swimming), and UI (speed indicator).
         * @type {boolean}
         */
        this.onGround = false;

        /**
         * Whether flying mode is enabled (creative/spectator only).
         * In creative mode, this is toggled via the F key. In spectator mode, this is always true.
         * Controlled by Flying system or GameMode system.
         * When set to `false` in survival mode, has no effect — survival cannot fly.
         * @type {boolean}
         */
        this.flyEnabled = false;

        /**
         * Maximum distance fallen before taking fall damage, tracked in blocks.
         * Accumulated by Player.trackFallDistance() during downward movement.
         * Reset by Movement._tickSurvival() when landing on solid ground or in water.
         * Fall damage is calculated using Config.FALL_DAMAGE_THRESHOLD and Config.FALL_DAMAGE_MULTIPLIER.
         * @type {number}
         */
        this.maxFallDistance = 0;

        /**
         * Current knockback velocity vector in blocks per second.
         * Applied by HurtBox when the player takes damage from entities or projectiles.
         * Cleared each tick by the game loop or when explicitly called via clearKnockback().
         * @type {Donkeycraft.Vector3}
         * @private
         */
        this._knockback = new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Whether the player is alive.
         * Set to `false` by HurtBox on death (health reaches 0).
         * Checked by Movement (no movement when dead), Jumping (no jumping when dead).
         * @type {boolean}
         */
        this.alive = true;

        /**
         * Event subscribers for tick updates.
         * Each subscriber is called with (deltaTime) every game tick.
         * Registered via onTick() and returns an unsubscribe function.
         * @type {Array<Function>}
         * @private
         */
        this._subscribers = [];
    };

    /**
     * Get the player's current position (center point at feet level).
     * 
     * @returns {Donkeycraft.Vector3} The player's position vector.
     */
    Donkeycraft.Player.prototype.getPosition = function () {
        return this._position;
    };

    /**
     * Set the player's position (center point at feet level).
     * 
     * @param {number} x - X coordinate in blocks.
     * @param {number} y - Y coordinate in blocks (feet level).
     * @param {number} z - Z coordinate in blocks.
     */
    Donkeycraft.Player.prototype.setPosition = function (x, y, z) {
        this._position.x = x;
        this._position.y = y;
        this._position.z = z;
    };

    /**
     * Get the player's current velocity in blocks per second.
     * 
     * @returns {Donkeycraft.Vector3} The player's velocity vector.
     */
    Donkeycraft.Player.prototype.getVelocity = function () {
        return this._velocity;
    };

    /**
     * Set the player's velocity components in blocks per second.
     * Called by Movement, Collision, and Knockback systems each tick.
     * 
     * @param {number} vx - X velocity in blocks per second.
     * @param {number} vy - Y velocity in blocks per second (positive = up).
     * @param {number} vz - Z velocity in blocks per second.
     */
    Donkeycraft.Player.prototype.setVelocity = function (vx, vy, vz) {
        this._velocity.x = vx;
        this._velocity.y = vy;
        this._velocity.z = vz;
    };

    /**
     * Get the player's current rotation in radians.
     * 
     * @returns {{yaw: number, pitch: number}} Yaw (horizontal) and pitch (vertical) angles.
     */
    Donkeycraft.Player.prototype.getRotation = function () {
        return this._rotation;
    };

    /**
     * Set the player's rotation.
     * 
     * Yaw is normalized to [0, 2π) using modulo arithmetic.
     * Pitch is clamped to [-π/2, π/2] (straight down to straight up).
     * 
     * @param {number} yaw - Yaw angle in radians. Normalized to [0, 2π).
     * @param {number} pitch - Pitch angle in radians. Clamped to [-π/2, π/2].
     */
    Donkeycraft.Player.prototype.setRotation = function (yaw, pitch) {
        // Normalize yaw to [0, 2π) using modulo arithmetic (O(1) vs O(n) while loops)
        var twoPi = Math.PI * 2;
        this._rotation.yaw = ((yaw % twoPi) + twoPi) % twoPi;

        // Clamp pitch to [-π/2, π/2] (straight down to straight up)
        this._rotation.pitch = Donkeycraft.clamp(pitch, -Math.PI / 2, Math.PI / 2);
    };

    /**
     * Adjust yaw by a delta amount (for mouse look input).
     * Yaw is normalized to [0, 2π) after adjustment.
     * 
     * @param {number} deltaYaw - Yaw change in radians (positive = turn right).
     */
    Donkeycraft.Player.prototype.adjustYaw = function (deltaYaw) {
        var twoPi = Math.PI * 2;
        this._rotation.yaw = ((this._rotation.yaw + deltaYaw) % twoPi + twoPi) % twoPi;
    };

    /**
     * Adjust pitch by a delta amount (for mouse look input).
     * Pitch is clamped to [-π/2, π/2] (straight down to straight up).
     * 
     * @param {number} deltaPitch - Pitch change in radians (positive = look down).
     */
    Donkeycraft.Player.prototype.adjustPitch = function (deltaPitch) {
        this._rotation.pitch = Donkeycraft.clamp(
            this._rotation.pitch + deltaPitch,
            -Math.PI / 2,
            Math.PI / 2
        );
    };

    /**
     * Get the player's collision dimensions.
     * 
     * @returns {{height: number, width: number}} Player height and width in blocks.
     */
    Donkeycraft.Player.prototype.getDimensions = function () {
        return {
            height: this.height,
            width: this.width
        };
    };

    /**
     * Get the player's current game mode.
     * 
     * @returns {string} One of: 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.Player.prototype.getGameMode = function () {
        return this.gameMode;
    };

    /**
     * Set the player's game mode.
     * 
     * Invalid modes are silently ignored. When switching to 'survival',
     * flying is automatically disabled (flyEnabled = false).
     * 
     * @param {string} mode - One of: 'survival', 'creative', or 'spectator'.
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
     * 
     * @returns {boolean} True if the player's health > 0 and not dead.
     */
    Donkeycraft.Player.prototype.isAlive = function () {
        return this.alive;
    };

    /**
     * Set whether the player is alive or dead.
     * 
     * When set to `false`, Movement and Jumping systems stop processing.
     * Set to `false` by HurtBox when health reaches 0.
     * 
     * @param {boolean} alive - True if alive, false if dead.
     */
    Donkeycraft.Player.prototype.setAlive = function (alive) {
        this.alive = !!alive;
    };

    /**
     * Get the player's eye position for raycasting and camera rendering.
     * 
     * Eye height is `Config.PLAYER_EYE_HEIGHT` above feet level (typically 1.62 blocks).
     * Used by raycast.js for block targeting and render/camera.js for first-person view.
     * 
     * @returns {Donkeycraft.Vector3} Eye position vector.
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
     * Get the player's axis-aligned bounding box (AABB) for collision detection.
     * 
     * The AABB extends ±width/2 from center on X and Z axes, and from feet to head on Y.
     * Used by Collision._checkAABBAgainstBlocks() and Collision.checkEntityCollision().
     * 
     * @returns {{minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number}} AABB bounds in blocks.
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
     * Get the forward direction vector based on player yaw rotation.
     * 
     * The forward vector is normalized and lies in the XZ plane (Y = 0).
     * Used by block-action.js for block breaking direction and raycast.js for targeting.
     * 
     * @returns {Donkeycraft.Vector3} Normalized forward direction vector.
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
     * Get the right direction vector (90° clockwise from forward in the XZ plane).
     * 
     * The right vector is normalized and lies in the XZ plane (Y = 0).
     * Used by block-action.js for determining block face normals during placement.
     * 
     * @returns {Donkeycraft.Vector3} Normalized right direction vector.
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
     * Get the current knockback velocity in blocks per second.
     * 
     * @returns {Donkeycraft.Vector3} Knockback velocity vector (XZ horizontal, Y vertical).
     */
    Donkeycraft.Player.prototype.getKnockback = function () {
        return this._knockback;
    };

    /**
     * Apply knockback from a direction with given strength.
     * 
     * The direction vector is normalized and applied as horizontal velocity.
     * An optional upward force can be added for vertical knockback.
     * The existing knockback is overwritten (not accumulated).
     * 
     * @param {Donkeycraft.Vector3} direction - Direction to knock back (will be normalized).
     * @param {number} strength - Horizontal knockback strength in blocks per second.
     * @param {number} [upwardForce=0] - Upward component of knockback in blocks per second.
     */
    Donkeycraft.Player.prototype.applyKnockback = function (direction, strength, upwardForce) {
        upwardForce = upwardForce || 0;
        var normalized = direction.normalized();
        this._knockback.x = normalized.x * strength;
        this._knockback.y = upwardForce;
        this._knockback.z = normalized.z * strength;
    };

    /**
     * Clear the current knockback velocity, resetting it to zero.
     * Called by the game loop each tick to reset accumulated knockback.
     */
    Donkeycraft.Player.prototype.clearKnockback = function () {
        this._knockback.set(0, 0, 0);
    };

    /**
     * Track maximum fall distance for fall damage calculation.
     * 
     * Call with positive deltaY values (downward displacement) to accumulate fall distance.
     * The reset on landing is handled by Movement._tickSurvival() after collision resolution,
     * keeping fall damage logic centralized in the Movement system.
     * 
     * Fall damage formula: `(maxFallDistance - FALL_DAMAGE_THRESHOLD) × FALL_DAMAGE_MULTIPLIER` HP
     * 
     * @param {number} deltaY - Downward displacement in blocks (positive value = falling down).
     */
    Donkeycraft.Player.prototype.trackFallDistance = function (deltaY) {
        if (deltaY > 0) {
            this.maxFallDistance += deltaY;
        }
        // Note: Reset on landing is handled by Movement._tickSurvival() after collision resolution.
        // This keeps fall damage logic in one place and avoids redundant reset code.
    };

    /**
     * Get the current accumulated fall distance for damage calculation.
     * 
     * @returns {number} Fall distance in blocks (0 if no fall tracked).
     */
    Donkeycraft.Player.prototype.getFallDistance = function () {
        return this.maxFallDistance;
    };

    /**
     * Register a subscriber to be notified each game tick.
     * 
     * Subscribers are called with (deltaTime) every tick. Returns an unsubscribe function
     * that removes the callback when called. Errors in subscribers are caught and logged
     * via Donkeycraft.Logger.error() to prevent cascade failures.
     * 
     * @param {Function} callback - Function called with (deltaTime) each tick.
     * @returns {Function} Unsubscribe function that removes the callback.
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
     * Destroy the player entity and free all internal references.
     * 
     * Clears position, velocity, knockback vectors and removes all tick subscribers.
     * Call this when the game is shutting down to prevent memory leaks.
     */
    Donkeycraft.Player.prototype.destroy = function () {
        this._position = null;
        this._velocity = null;
        this._knockback = null;
        this._subscribers = [];
    };

})();