// Donkeycraft — Player Entity
// Player entity: position, velocity, rotation, dimensions (1.8×0.6), game mode, and all vitals.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;
    var EventBus = Donkeycraft.EventBus;

    /**
     * Player — represents the player entity with position, velocity, rotation, dimensions, game mode, and vitals.
     *
     * The player is the central entity that all player subsystems operate on. It holds state
     * (position, velocity, rotation, game mode, vitals) while physics are applied by Movement,
     * collision is resolved by Collision, jumping is handled by Jumping, and flying state
     * is managed by Flying.
     *
     * Position is stored as a center point (not corner). Yaw is normalized to [0, 2π).
     * Pitch is clamped to [-π/2, π/2] (straight down to straight up).
     *
     * Vitals (health, stamina, food, hydration) are the single source of truth — other classes
     * reference them from this object rather than duplicating state.
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
         * Set to `false` when health reaches 0.
         * Checked by Movement (no movement when dead), Jumping (no jumping when dead).
         * @type {boolean}
         */
        this.alive = true;

        // ============================================================
        // VITALS — Single source of truth for player state
        // All vitals are stored here. Other classes reference these values.
        // ============================================================

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
         * Current stamina points (yellow health). Always capped at 100.
         * @type {number}
         */
        this.maxStamina = 100;

        /**
         * Current stamina points (yellow health). Starts at full capacity (100 points).
         * @type {number}
         * @private
         */
        this._stamina = 100;

        /**
         * Stamina regeneration timer (seconds since last regeneration).
         * @type {number}
         * @private
         */
        this._staminaRegenTimer = 0;

        /**
         * Current food level (0-12, displayed as 6 drumstick icons).
         * Each icon represents 2 food points.
         * @type {number}
         * @private
         */
        this._foodLevel = 12;

        /**
         * Current hydration level (0-6, displayed as 3 water drop icons).
         * Each icon represents 2 hydration points.
         * @type {number}
         * @private
         */
        this._hydration = 6.0;

        /**
         * Whether the player is currently on fire.
         * @type {boolean}
         * @private
         */
        this._onFire = false;

        /**
         * Fire damage timer (seconds toward next fire damage tick).
         * @type {number}
         * @private
         */
        this._fireDamageTimer = 0;

        /**
         * Starvation damage timer (seconds toward 1 HP damage when food = 0).
         * @type {number}
         * @private
         */
        this._starvationTimer = 0;

        /**
         * Event subscribers for tick updates.
         * Each subscriber is called with (deltaTime) every game tick.
         * Registered via onTick() and returns an unsubscribe function.
         * @type {Array<Function>}
         * @private
         */
        this._subscribers = [];

        /**
         * Death event callback.
         * @type {Function|null}
         * @private
         */
        this._onDeathCallback = null;
    };

    // ============================================================
    // Exhaustive Land Spawn Finder
    // ============================================================

    /**
     * findLandSpawnPosition — Exhaustively search for a valid land spawn position.
     * Uses an unlimited spiral search outward from the starting position until valid land is found.
     * Valid spawn criteria:
     *   - On solid ground (never over water)
     *   - Near water level (Y ≤ 80 for Overworld, configurable)
     *   - Flat terrain (surface variation ≤ 1 Y within a 5x5 area)
     *   - Not on a cliff or mountain (gentle slope in all directions)
     *   - Player space clear (2 blocks above is air)
     *
     * @param {Donkeycraft.ChunkManager} chunkManager — Chunk manager for block queries.
     * @param {number} [startX=0] — Starting world X coordinate.
     * @param {number} [startZ=0] — Starting world Z coordinate.
     * @param {Object} [options] — Search options.
     * @param {number} [options.maxY=80] — Maximum Y for "near water level" check.
     * @param {number} [options.flatRadius=3] — Radius (in blocks) for flatness check.
     * @param {number} [options.slopeLimit=3] — Max Y drop within flatRadius blocks.
     * @returns {{x: number, y: number, z: number}|null} Valid spawn position or null if none found.
     */
    Donkeycraft.Player.findLandSpawnPosition = function (chunkManager, startX, startZ, options) {
        if (!chunkManager) {
            return null;
        }

        options = options || {};
        var maxYLevel = options.maxY !== undefined ? options.maxY : 80;
        var flatRadius = options.flatRadius !== undefined ? options.flatRadius : 3;
        var slopeLimit = options.slopeLimit !== undefined ? options.slopeLimit : 3;

        // Helper: get block at world coordinates, querying across chunk boundaries
        function getBlock(wx, wy, wz) {
            if (wy < 0 || wy >= Donkeycraft.Config.WORLD_HEIGHT) {
                return -1; // Out of world bounds = air
            }
            return chunkManager.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz));
        }

        // Helper: check if block is solid
        function isSolid(id) {
            return id > 0 && Donkeycraft.BlockTypes && Donkeycraft.BlockTypes.isSolid(id);
        }

        // Helper: check if block is liquid
        function isLiquid(id) {
            return id > 0 && Donkeycraft.BlockTypes && Donkeycraft.BlockTypes.isLiquid(id);
        }

        /**
         * findSurfaceY — Scan downward from top to find the highest solid block at (x, z).
         * Returns the Y of the solid block, or -1 if none found.
         */
        function findSurfaceY(x, z) {
            var worldHeight = Donkeycraft.Config.WORLD_HEIGHT;
            for (var y = worldHeight - 1; y >= 0; y--) {
                var block = getBlock(x, y, z);
                if (isSolid(block)) {
                    return y;
                }
            }
            return -1;
        }

        /**
         * checkFlatness — Check if terrain is flat within a radius around (x, z).
         * Returns the surface Y if flat, or -1 if not flat.
         */
        function checkFlatness(x, z, surfaceY) {
            var r = flatRadius;
            for (var dx = -r; dx <= r; dx++) {
                for (var dz = -r; dz <= r; dz++) {
                    var cx = Math.floor(x) + dx;
                    var cz = Math.floor(z) + dz;
                    var cy = findSurfaceY(cx, cz);
                    if (cy < 0) {
                        return -1; // No solid ground in this column
                    }
                    if (Math.abs(cy - surfaceY) > 1) {
                        return -1; // Too much height variation — not flat
                    }
                }
            }
            return surfaceY;
        }

        /**
         * checkSlope — Check that terrain slopes gently in all directions.
         * Returns true if the Y drop within radius blocks doesn't exceed slopeLimit.
         */
        function checkSlope(x, z, surfaceY) {
            var r = flatRadius;
            var minY = surfaceY;
            for (var angle = 0; angle < 360; angle += 15) {
                var rad = angle * Math.PI / 180;
                for (var dist = 1; dist <= r; dist++) {
                    var cx = Math.floor(x) + Math.round(Math.cos(rad) * dist);
                    var cz = Math.floor(z) + Math.round(Math.sin(rad) * dist);
                    var cy = findSurfaceY(cx, cz);
                    if (cy >= 0 && cy < minY) {
                        minY = cy;
                    }
                }
            }
            return (surfaceY - minY) <= slopeLimit;
        }

        /**
         * checkNotOverWater — Verify the spawn position is not over water.
         * The block at surface level must NOT be liquid, and there should be no water
         * column extending up from below through the spawn area.
         */
        function checkNotOverWater(x, z, surfaceY) {
            var feetBlock = getBlock(x, surfaceY, z);
            if (isLiquid(feetBlock)) {
                return false; // Player would spawn inside water
            }
            // Check that the surface block itself is not water/lava
            if (isLiquid(getBlock(x, surfaceY, z))) {
                return false;
            }
            // Verify there's no tall water column we'd spawn in
            for (var wy = surfaceY + 1; wy <= surfaceY + 2; wy++) {
                var wBlock = getBlock(x, wy, z);
                if (isLiquid(wBlock) && isLiquid(getBlock(x, wy - 1, z))) {
                    // Flowing water (block above is also water) — skip this position
                    return false;
                }
            }
            return true;
        }

        /**
         * checkClearPlayerSpace — Verify the 2-block vertical space above feet is clear.
         */
        function checkClearPlayerSpace(x, z, feetY) {
            var playerHeight = Donkeycraft.Config.PLAYER_HEIGHT;
            // Check blocks from feet to feet + player height
            for (var cy = Math.floor(feetY); cy <= Math.floor(feetY + playerHeight); cy++) {
                if (isSolid(getBlock(x, cy, z))) {
                    return false; // Player would spawn inside a solid block
                }
            }
            return true;
        }

        /**
         * validateSpawn — Run all checks on a candidate position.
         * Returns the valid spawn Y, or -1 if invalid.
         */
        function validateSpawn(x, z) {
            var surfaceY = findSurfaceY(x, z);
            if (surfaceY < 0) return -1; // No solid ground

            // Must be near water level (not on a mountain)
            if (surfaceY > maxYLevel) return -1;

            // Must not be over water
            if (!checkNotOverWater(x, z, surfaceY)) return -1;

            // Must be flat terrain
            var flatY = checkFlatness(x, z, surfaceY);
            if (flatY < 0) return -1;

            // Must not be on a cliff/mountain slope
            if (!checkSlope(x, z, flatY)) return -1;

            // Player space must be clear
            if (!checkClearPlayerSpace(x, z, flatY + 1)) return -1;

            // All checks passed — return the Y position for player feet (on top of surface block)
            return flatY + 1;
        }

        // ============================================================
        // Exhaustive Spiral Search — unlimited range
        // ============================================================
        var searchX = Math.floor(startX || 0);
        var searchZ = Math.floor(startZ || 0);
        var ring = 0;
        var maxRings = 4096; // Reasonable upper limit (~8K chunks in every direction)

        while (ring <= maxRings) {
            // Determine the extent of this ring in world block coordinates
            var extent = ring * Donkeycraft.Config.CHUNK_SIZE;

            // Check all positions on this ring boundary using spiral pattern
            // Top edge: left to right
            for (var sx = -extent; sx <= extent; sx++) {
                var cx = searchX + sx;
                var cz = searchZ - extent;
                var resultY = validateSpawn(cx, cz);
                if (resultY > 0) {
                    return { x: cx + 0.5, y: resultY, z: cz + 0.5 };
                }
            }
            // Right edge: top to bottom
            for (var sy = -extent + 1; sy <= extent; sy++) {
                var rx = searchX + extent;
                var rz = searchZ + sy;
                var resultY2 = validateSpawn(rx, rz);
                if (resultY2 > 0) {
                    return { x: rx + 0.5, y: resultY2, z: rz + 0.5 };
                }
            }
            // Bottom edge: right to left
            for (var ss = -extent + 1; ss < extent; ss++) {
                var bx = searchX + extent - ss - 1;
                var bz = searchZ + extent;
                var resultY3 = validateSpawn(bx, bz);
                if (resultY3 > 0) {
                    return { x: bx + 0.5, y: resultY3, z: bz + 0.5 };
                }
            }
            // Left edge: bottom to top
            for (var ss2 = -extent + 1; ss2 < extent; ss2++) {
                var lx = searchX - extent;
                var lz = searchZ + extent - ss2 - 1;
                var resultY4 = validateSpawn(lx, lz);
                if (resultY4 > 0) {
                    return { x: lx + 0.5, y: resultY4, z: lz + 0.5 };
                }
            }

            ring++;
        }

        // No valid land found after exhaustive search
        return null;
    };

    // ============================================================
    // Position, Velocity, Rotation (existing)
    // ============================================================

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
        var twoPi = Math.PI * 2;
        this._rotation.yaw = ((yaw % twoPi) + twoPi) % twoPi;
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

    // ============================================================
    // Dimensions & Game Mode (existing)
    // ============================================================

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
            return;
        }
        this.gameMode = mode;
        if (mode === 'survival') {
            this.flyEnabled = false;
        }
    };

    // ============================================================
    // Alive Status (existing)
    // ============================================================

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
     * Set to `false` when health reaches 0.
     * 
     * @param {boolean} alive - True if alive, false if dead.
     */
    Donkeycraft.Player.prototype.setAlive = function (alive) {
        this.alive = !!alive;
    };

    // ============================================================
    // Health — Accessors & Mutators
    // ============================================================

    /**
     * Get the player's current health.
     * 
     * @returns {number} Current HP (0-20).
     */
    Donkeycraft.Player.prototype.getHealth = function () {
        return this._health;
    };

    /**
     * Set the player's health value with clamping and event emission.
     * 
     * Clamps to [0, maxHealth]. Emits `health:changed` event via EventBus.
     * If health drops to 0, triggers death handling.
     * 
     * @param {number} value - Health value to set.
     */
    Donkeycraft.Player.prototype.setHealth = function (value) {
        var oldHealth = this._health;
        var clampedValue = Math.max(0, Math.min(this.maxHealth, Math.round(value)));
        this._health = clampedValue;

        // Emit health change event via EventBus
        if (EventBus && clampedValue !== oldHealth) {
            try {
                EventBus.emitSafe('health:changed', {
                    health: this._health,
                    maxHealth: this.maxHealth,
                    delta: this._health - oldHealth
                });
            } catch (e) { }
        }

        // Check for death
        if (this._health <= 0 && this.alive) {
            this._onDeath('generic');
        }
    };

    /**
     * Adjust the player's health by a delta amount.
     * 
     * Positive values heal, negative values deal damage.
     * Clamps to [0, maxHealth] and emits `health:changed` event.
     * If health drops to 0, triggers death handling.
     * 
     * @param {number} delta - Health change (positive = heal, negative = damage).
     */
    Donkeycraft.Player.prototype.adjustHealth = function (delta) {
        var oldHealth = this._health;
        this.setHealth(this._health + delta);

        // Emit event with actual delta after clamping
        if (EventBus && this._health !== oldHealth) {
            try {
                EventBus.emitSafe('health:changed', {
                    health: this._health,
                    maxHealth: this.maxHealth,
                    delta: this._health - oldHealth
                });
            } catch (e) { }
        }
    };

    /**
     * Get the maximum health points.
     * 
     * @returns {number}
     */
    Donkeycraft.Player.prototype.getMaxHealth = function () {
        return this.maxHealth;
    };

    // ============================================================
    // Stamina — Accessors & Mutators
    // ============================================================

    /**
     * Get the current stamina (yellow health) points.
     * 
     * @returns {number}
     */
    Donkeycraft.Player.prototype.getStamina = function () {
        return this._stamina;
    };

    /**
     * Set the stamina value with clamping and event emission.
     * 
     * Clamps to [0, maxStamina] (always capped at 100).
     * Emits `stamina:changed` event via EventBus.
     * 
     * @param {number} amount - Stamina points to set.
     */
    Donkeycraft.Player.prototype.setStamina = function (amount) {
        var oldStamina = this._stamina;
        this._stamina = Math.min(this.maxStamina, Math.max(0, amount));

        // Emit stamina:changed event for UI systems
        if (EventBus && this._stamina !== oldStamina) {
            try {
                EventBus.emitSafe('stamina:changed', {
                    stamina: this._stamina,
                    maxStamina: this.maxStamina,
                    delta: this._stamina - oldStamina
                });
            } catch (e) { }
        }
    };

    /**
     * Adjust the player's stamina by a delta amount.
     * 
     * Positive values restore stamina, negative values consume it.
     * Clamps to [0, maxStamina] and emits `stamina:changed` event.
     * 
     * @param {number} delta - Stamina change (positive = restore, negative = consume).
     */
    Donkeycraft.Player.prototype.adjustStamina = function (delta) {
        var oldStamina = this._stamina;
        this.setStamina(this._stamina + delta);

        if (EventBus && this._stamina !== oldStamina) {
            try {
                EventBus.emitSafe('stamina:changed', {
                    stamina: this._stamina,
                    maxStamina: this.maxStamina,
                    delta: this._stamina - oldStamina
                });
            } catch (e) { }
        }
    };

    /**
     * Get the maximum stamina points.
     * 
     * @returns {number}
     */
    Donkeycraft.Player.prototype.getMaxStamina = function () {
        return this.maxStamina;
    };

    // ============================================================
    // Food Level — Accessors & Mutators
    // ============================================================

    /**
     * Get the current food level.
     * 
     * @returns {number} Food level (0-12).
     */
    Donkeycraft.Player.prototype.getFoodLevel = function () {
        return this._foodLevel;
    };

    /**
     * Set the food level with clamping and event emission.
     * 
     * Clamps to [0, 12]. Emits `hunger:changed` event via EventBus.
     * 
     * @param {number} level - Food level to set (0-12).
     */
    Donkeycraft.Player.prototype.setFoodLevel = function (level) {
        var oldLevel = this._foodLevel;
        this._foodLevel = Math.max(0, Math.min(12, level));

        // Emit hunger change event if food level actually changed
        if (EventBus && this._foodLevel !== oldLevel) {
            try {
                EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    hydration: this._hydration,
                    delta: this._foodLevel - oldLevel
                });
            } catch (e) { }
        }
    };

    /**
     * Adjust the player's food level by a delta amount.
     * 
     * Positive values add food, negative values subtract food.
     * Clamps to [0, 12] and emits `hunger:changed` event.
     * 
     * @param {number} delta - Food change (positive = eat, negative = starve).
     */
    Donkeycraft.Player.prototype.adjustFoodLevel = function (delta) {
        var oldLevel = this._foodLevel;
        this.setFoodLevel(this._foodLevel + delta);

        if (EventBus && this._foodLevel !== oldLevel) {
            try {
                EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    hydration: this._hydration,
                    delta: this._foodLevel - oldLevel
                });
            } catch (e) { }
        }
    };

    /**
     * Check if the player is starving (food level = 0).
     * 
     * @returns {boolean} True if food level is at zero.
     */
    Donkeycraft.Player.prototype.isStarving = function () {
        return this._foodLevel <= 0;
    };

    /**
     * Check if the player has any food remaining.
     * 
     * @returns {boolean} True if food level is greater than zero.
     */
    Donkeycraft.Player.prototype.hasFood = function () {
        return this._foodLevel > 0;
    };

    // ============================================================
    // Hydration — Accessors & Mutators
    // ============================================================

    /**
     * Get the current hydration level.
     * 
     * @returns {number} Hydration level (0-6).
     */
    Donkeycraft.Player.prototype.getHydration = function () {
        return this._hydration;
    };

    /**
     * Set the hydration level with clamping and event emission.
     * 
     * Clamps to [0, 6]. Emits `hunger:changed` event via EventBus.
     * 
     * @param {number} hydration - Hydration value to set (0-6).
     */
    Donkeycraft.Player.prototype.setHydration = function (hydration) {
        var oldHydration = this._hydration;
        this._hydration = Math.max(0, Math.min(6, hydration));

        // Emit hunger change event if hydration actually changed
        if (EventBus && this._hydration !== oldHydration) {
            try {
                EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    hydration: this._hydration,
                    hydrationDelta: this._hydration - oldHydration
                });
            } catch (e) { }
        }
    };

    /**
     * Adjust the player's hydration by a delta amount.
     * 
     * Positive values add hydration, negative values subtract it.
     * Clamps to [0, 6] and emits `hunger:changed` event.
     * 
     * @param {number} delta - Hydration change (positive = drink, negative = dehydrate).
     */
    Donkeycraft.Player.prototype.adjustHydration = function (delta) {
        var oldHydration = this._hydration;
        this.setHydration(this._hydration + delta);

        if (EventBus && this._hydration !== oldHydration) {
            try {
                EventBus.emitSafe('hunger:changed', {
                    foodLevel: this._foodLevel,
                    hydration: this._hydration,
                    hydrationDelta: this._hydration - oldHydration
                });
            } catch (e) { }
        }
    };

    // ============================================================
    // Fire Status — Accessors & Mutators
    // ============================================================

    /**
     * Check if the player is on fire.
     * 
     * @returns {boolean}
     */
    Donkeycraft.Player.prototype.isOnFire = function () {
        return this._onFire;
    };

    /**
     * Set whether the player is on fire.
     * 
     * @param {boolean} onFire - True to set on fire, false to extinguish.
     */
    Donkeycraft.Player.prototype.setOnFire = function (onFire) {
        this._onFire = !!onFire;
        if (!onFire) {
            this._fireDamageTimer = 0;
        }
    };

    // ============================================================
    // Damage & Healing — Core Logic
    // ============================================================

    /**
     * Receive damage from a specified source.
     * 
     * Applies damage to stamina first, then health. Respects game mode immunity
     * (creative mode is immune). Emits `health:changed` event via EventBus.
     * 
     * @param {number} amount - Damage amount.
     * @param {string} [source='generic'] - Damage source: 'generic', 'fall', 'fire', 'attack', 'lava', 'suffocation', 'starvation'.
     * @returns {number} Actual damage dealt (0 if immune).
     */
    Donkeycraft.Player.prototype.takeDamage = function (amount, source) {
        source = source || 'generic';

        // Creative mode: immune to most damage sources
        if (this.gameMode === 'creative') {
            return 0;
        }

        // Don't take damage if already dead
        if (!this.alive || this._health <= 0) {
            return 0;
        }

        var healthBeforeDamage = this._health;
        var remainingDamage = amount;

        // Apply damage to stamina first, then health
        if (this._stamina > 0) {
            var absorbed = Math.min(this._stamina, remainingDamage);
            var oldStaminaForDamage = this._stamina;
            this._stamina -= absorbed;
            remainingDamage -= absorbed;

            // Emit stamina:changed event for UI systems
            if (absorbed > 0 && EventBus) {
                try {
                    EventBus.emitSafe('stamina:changed', {
                        stamina: this._stamina,
                        maxStamina: this.maxStamina,
                        delta: -(oldStaminaForDamage - this._stamina)
                    });
                } catch (e) { }
            }
        }

        if (remainingDamage > 0) {
            this._health -= remainingDamage;
            this._health = Math.max(0, this._health);
        }

        // Check for death
        if (this._health <= 0 && this.alive) {
            this._onDeath(source);
        }

        // Emit health change event via EventBus
        var actualDelta = healthBeforeDamage - this._health;
        if (actualDelta > 0 && EventBus) {
            try {
                EventBus.emitSafe('health:changed', {
                    health: this._health,
                    maxHealth: this.maxHealth,
                    delta: -actualDelta
                });
            } catch (e) { }
        }

        return amount;
    };

    /**
     * Heal the player by the given amount.
     * 
     * Clamps to [0, maxHealth] and emits `health:changed` event via EventBus.
     * 
     * @param {number} amount - Health points to restore.
     * @returns {number} Actual health restored.
     */
    Donkeycraft.Player.prototype.heal = function (amount) {
        if (!this.alive) {
            return 0;
        }

        var oldHealth = this._health;
        this._health += amount;
        this._health = Math.min(this._health, this.maxHealth);

        var delta = this._health - oldHealth;

        // Emit health change event via EventBus
        if (delta > 0 && EventBus) {
            try {
                EventBus.emitSafe('health:changed', {
                    health: this._health,
                    maxHealth: this.maxHealth,
                    delta: delta
                });
            } catch (e) { }
        }

        return delta;
    };

    /**
     * Calculate fall damage based on distance fallen.
     * 
     * Formula: max(0, (fallDistance - threshold) × FALL_DAMAGE_MULTIPLIER).
     * The first 3 blocks of free fall deal no damage (vanilla Minecraft behavior).
     * Each block beyond the threshold deals `FALL_DAMAGE_MULTIPLIER` HP of damage.
     * 
     * @param {number} [fallDistance=0] - Distance fallen in blocks.
     * @returns {number} Damage dealt in HP (0 if no fall damage).
     */
    Donkeycraft.Player.prototype.calculateFallDamage = function (fallDistance) {
        fallDistance = fallDistance || this.maxFallDistance;

        if (fallDistance <= Config.FALL_DAMAGE_THRESHOLD) {
            return 0;
        }

        var damage = (fallDistance - Config.FALL_DAMAGE_THRESHOLD) * Config.FALL_DAMAGE_MULTIPLIER;
        return damage;
    };

    /**
     * Apply fall damage based on tracked fall distance, then reset tracking.
     * 
     * Calculates damage using the formula: max(0, (fallDistance - 3) × FALL_DAMAGE_MULTIPLIER).
     * Damage is applied via `takeDamage()`, which respects game mode immunity.
     * Fall distance is always reset after calling this method.
     * 
     * @returns {number} Damage dealt in HP (0 if no fall damage or creative mode).
     */
    Donkeycraft.Player.prototype.applyFallDamage = function () {
        var damage = this.calculateFallDamage();

        if (damage > 0) {
            this.takeDamage(damage, 'fall');
        }

        // Reset fall distance after applying damage
        this.maxFallDistance = 0;

        return damage;
    };

    /**
     * Register a death callback that fires when the player dies.
     * 
     * @param {Function} callback - Function called with (deathSource) on death.
     */
    Donkeycraft.Player.prototype.setOnDeath = function (callback) {
        this._onDeathCallback = callback;
    };

    /**
     * Handle player death — triggers death event via EventBus.
     * 
     * @param {string} [deathSource='generic'] - Cause of death.
     * @private
     */
    Donkeycraft.Player.prototype._onDeath = function (deathSource) {
        deathSource = deathSource || 'generic';

        // Mark player as dead
        this.setAlive(false);

        // Clear knockback
        this.clearKnockback();

        // Trigger death callback
        if (this._onDeathCallback) {
            try {
                this._onDeathCallback(deathSource);
            } catch (e) { }
        }

        // Emit death event via global EventBus
        if (EventBus) {
            try {
                EventBus.emitSafe('player:death', {
                    source: deathSource,
                    health: 0,
                    player: this
                });
            } catch (e) { }
        }
    };

    // ============================================================
    // Vitals Tick — Starvation, Regeneration, Fire Damage
    // ============================================================

    /**
     * Tick all vitals: fire damage, stamina regeneration, starvation, natural healing.
     * 
     * Called every game tick by the game loop. Handles:
     * 1. Fire damage (1 HP every 0.5s while on fire)
     * 2. Stamina regeneration (+1 per 2s when below max)
     * 3. Starvation damage (1 HP every 4s when food = 0, only if health <= min(5, maxHealth/2))
     * 4. Natural regeneration (heal 1 HP at ~25% per second when food > 10)
     * 
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Player.prototype.tickVitals = function (deltaTime) {
        if (!this.alive) {
            return;
        }

        // Fire damage — 1 HP every 0.5 seconds while on fire
        if (this._onFire) {
            this._fireDamageTimer += deltaTime;
            if (this._fireDamageTimer >= 0.5) {
                this._fireDamageTimer = 0;
                this.takeDamage(1, 'fire');
            }
        } else {
            this._fireDamageTimer = 0;
        }

        // Stamina regeneration: +1 stamina per 2 seconds when below max (all game modes)
        if (this._stamina < this.maxStamina) {
            this._staminaRegenTimer += deltaTime;
            if (this._staminaRegenTimer >= 2.0) {
                this._staminaRegenTimer = 0;
                this.setStamina(this._stamina + 1);
            }
        }

        // Starvation damage: when food level = 0
        if (this._foodLevel <= 0) {
            this._starvationTimer += deltaTime;
            if (this._starvationTimer >= 4.0) {
                this._starvationTimer = 0;

                // Only take starvation damage if health <= min(5, maxHealth/2)
                var threshold = Math.min(5, this.maxHealth / 2);
                if (this._health <= threshold) {
                    this.takeDamage(1, 'starvation');
                }
            }
        } else {
            // Reset starvation timer when food is available
            this._starvationTimer = 0;
        }

        // Natural regeneration: when food > 10 (of 12) and health < max
        if (this._foodLevel > 10 && this._health < this.maxHealth) {
            // Regen chance: ~25% per second
            if (Math.random() < deltaTime * 0.25) {
                this.heal(1);
            }
        }
    };

    // ============================================================
    // Reset & Utility Methods
    // ============================================================

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
     * The reset on landing is handled by Movement._tickSurvival() after collision resolution.
     * 
     * Fall damage formula: `(maxFallDistance - FALL_DAMAGE_THRESHOLD) × FALL_DAMAGE_MULTIPLIER` HP
     * 
     * @param {number} deltaY - Downward displacement in blocks (positive value = falling down).
     */
    Donkeycraft.Player.prototype.trackFallDistance = function (deltaY) {
        if (deltaY > 0) {
            this.maxFallDistance += deltaY;
        }
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
     * Reset all vitals to default values.
     * 
     * Restores health to maxHealth, stamina to full (maxStamina), food to 12, hydration to 6.
     * Clears fire status and resets all timers. Sets alive = true.
     */
    Donkeycraft.Player.prototype.resetVitals = function () {
        this._health = this.maxHealth;
        this._stamina = this.maxStamina;
        this._foodLevel = 12;
        this._hydration = 6.0;
        this._onFire = false;
        this._fireDamageTimer = 0;
        this._starvationTimer = 0;
        this._staminaRegenTimer = 0;
        this.alive = true;
        this.maxFallDistance = 0;
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
        this._onDeathCallback = null;
    };

})();