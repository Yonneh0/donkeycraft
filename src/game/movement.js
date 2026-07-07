// Donkeycraft — Movement Physics
// Movement physics: walking, sprinting, swimming, flying, speed modifiers.
// Handles WASD input, gravity, collision resolution, swimming, and terrain-based speed effects.
//
// @module Movement
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Movement — handles player movement physics including walking, sprinting, swimming, and flying.
     *
     * Reads input keys, computes horizontal speed, applies gravity, handles swimming,
     * updates position with collision resolution, and tracks distance for hunger degradation.
     *
     * @param {Donkeycraft.Input} input - Input handler instance.
     * @param {Donkeycraft.Player} player - Player entity instance.
     * @param {Donkeycraft.Collision} collision - Collision detection instance.
     * @param {Donkeycraft.ChunkManager} chunkManager - Chunk manager for block lookups.
     */
    Donkeycraft.Movement = function (input, player, collision, chunkManager) {
        this._input = input;
        this._player = player;
        this._collision = collision;
        this._chunkManager = chunkManager;

        /**
         * Distance accumulator for hunger degradation tracking.
         * @type {number}
         * @private
         */
        this._distanceAccumulator = 0;

        /**
         * Whether pointer lock is currently active.
         * When false, A/D keys rotate the player (turn left/right) instead of strafing.
         * Set via setMouseLocked() from game.js _updatePlayer().
         * @type {boolean}
         * @private
         */
        this._mouseLocked = true;

        /**
         * Current slider index for speed selection.
         * @type {number}
         * @private
         */
        this._sliderIndex = 1; // Default to walk/normal

        /**
         * Track which speed keys are currently held for cycling.
         * Used to detect key press events (transition from up to down).
         * @type {Object}
         * @private
         */
        this._speedKeyState = {
            SPEED_CYCLE: false,  // ShiftLeft — toggle speed up (cycles)
            SPEED_DOWN: false,   // KeyZ — decrease speed / go down
            SPEED_UP: false      // KeyQ — increase speed / go up
        };

        /**
         * Cooldown timer for speed key cycling (in game ticks).
         * Prevents rapid cycling when holding Ctrl/Shift.
         * @type {number}
         * @private
         */
        this._speedKeyCooldown = 0;

        /**
         * Speed key cooldown interval (in ticks).
         * @type {number}
         * @private
         */
        this._SPEED_KEY_COOLDOWN = 5; // 5 ticks between speed changes when holding key
    };

    /**
     * Set whether pointer lock is currently active.
     * When false, A/D keys function as keyboard turn (yaw rotation) instead of strafe.
     * @param {boolean} locked - True if pointer is locked.
     */
    Donkeycraft.Movement.prototype.setMouseLocked = function (locked) {
        this._mouseLocked = !!locked;
    };

    /**
     * Set the Player reference for fall damage application.
     * @param {Donkeycraft.Player} player - Player instance.
     */
    Donkeycraft.Movement.prototype.setPlayer = function (player) {
        this._playerRef = player;
    };

    /**
     * Set the hunger system reference for degradation tracking.
     * @param {Donkeycraft.Hunger} hungerSystem - Hunger instance.
     */
    Donkeycraft.Movement.prototype.setHungerSystem = function (hungerSystem) {
        this._hungerSystem = hungerSystem;
    };

    /**
     * Set the slider index for speed selection.
     * 
     * Called by the SpeedIndicator slider when the user changes speed selection.
     * The index corresponds to positions in the mode-specific speed arrays:
     * - Survival: 0=sneak, 1=walk, 2=run
     * - Creative: 0=sneak, 1=walk, 2=run, 3=turbo
     * - Flying:   0=normal, 1=fast, 2=turbo, 3=ultra
     * 
     * @param {number} index - The slider index (0-based).
     */
    Donkeycraft.Movement.prototype.setSliderIndex = function (index) {
        if (typeof index !== 'number' || index < 0) {
            Donkeycraft.Logger.warn('Movement', 'Invalid slider index: ' + index);
            return;
        }
        this._sliderIndex = index;
    };

    /**
     * Get the current slider index.
     * 
     * @returns {number} Current slider index (0-based).
     */
    Donkeycraft.Movement.prototype.getSliderIndex = function () {
        return this._sliderIndex !== undefined ? this._sliderIndex : 1; // Default to walk/normal
    };

    /**
     * Get the current active speed mode string for UI display.
     * 
     * Returns the speed ID string corresponding to the current slider index,
     * based on the current game mode and flying state.
     * 
     * @returns {string} Speed mode ID (e.g., 'sneak', 'walk', 'run', 'turbo', 'normal', 'fast', 'ultra').
     */
    Donkeycraft.Movement.prototype.getActiveSpeedMode = function () {
        var gameMode = this._player.getGameMode();
        var isFlying = this._player.flyEnabled && gameMode === 'creative';
        var index = this.getSliderIndex();

        var speeds = this._getSpeedDefinitions(gameMode, isFlying);
        if (!speeds || !speeds[index]) {
            Donkeycraft.Logger.warn('Movement', 'Invalid slider index ' + index + ' for mode ' + gameMode + ', defaulting to walk');
            return 'walk';
        }

        return speeds[index].id;
    };

    /**
     * Get the speed definitions array for the current game mode and state.
     * 
     * @private
     * @param {string} gameMode - Current game mode ('survival', 'creative', 'spectator').
     * @param {boolean} isFlying - Whether the player is currently flying.
     * @returns {Array<Object>} Speed definitions array with id, emoji, label, speed properties.
     */
    Donkeycraft.Movement.prototype._getSpeedDefinitions = function (gameMode, isFlying) {
        if (isFlying) {
            return [
                { id: 'normal', speed: Config.PLAYER_FLY_SPEED_NORMAL },
                { id: 'fast', speed: Config.PLAYER_FLY_SPEED_FAST },
                { id: 'turbo', speed: Config.PLAYER_FLY_SPEED_TURBO },
                { id: 'ultra', speed: Config.PLAYER_FLY_SPEED_ULTRA }
            ];
        }

        if (gameMode === 'creative') {
            return [
                { id: 'sneak', speed: Config.PLAYER_SNEAK_SPEED },
                { id: 'walk', speed: Config.PLAYER_SPEED },
                { id: 'run', speed: Config.PLAYER_SPRINT_SPEED },
                { id: 'turbo', speed: Config.CREATIVE_TURBO_SPEED }
            ];
        }

        // Survival (and creative grounded)
        return [
            { id: 'sneak', speed: Config.PLAYER_SNEAK_SPEED },
            { id: 'walk', speed: Config.PLAYER_SPEED },
            { id: 'run', speed: Config.PLAYER_SPRINT_SPEED }
        ];
    };

    /**
     * Get the horizontal speed in blocks per second for the current slider index.
     *
     * Retrieves the base speed from the mode-specific speed definitions array,
     * then applies terrain-based modifiers (honey block, mud, powder snow, etc.).
     *
     * @private
     * @param {number} index - The slider index (0-based).
     * @param {string} gameMode - Current game mode.
     * @param {Object} [terrainContext] - Terrain context with slow modifier.
     * @returns {number} Speed in blocks per second.
     */
    Donkeycraft.Movement.prototype._getSpeedForIndex = function (index, gameMode, terrainContext) {
        var speeds = this._getSpeedDefinitions(gameMode, false);
        var speed = Config.PLAYER_SPEED; // Default

        if (speeds && speeds[index]) {
            speed = speeds[index].speed;
        }

        // Apply terrain-based slow effects (grounded only)
        if (terrainContext && terrainContext.slowModifier) {
            speed *= terrainContext.slowModifier;
        }

        return speed;
    };

    /**
     * Get the flying speed in blocks per second for the current slider index.
     *
     * @private
     * @param {number} index - The slider index (0-based).
     * @returns {number} Flying speed in blocks per second.
     */
    Donkeycraft.Movement.prototype._getFlySpeedForIndex = function (index) {
        var speeds = [
            Config.PLAYER_FLY_SPEED_NORMAL,
            Config.PLAYER_FLY_SPEED_FAST,
            Config.PLAYER_FLY_SPEED_TURBO,
            Config.PLAYER_FLY_SPEED_ULTRA
        ];

        if (index >= 0 && index < speeds.length) {
            return speeds[index];
        }

        return Config.PLAYER_FLY_SPEED_NORMAL; // Fallback to normal
    };

    /**
     * Process ShiftLeft key to cycle speed slider index up (toggle).
     * When at the highest setting, cycles back to the first setting.
     *
     * @private
     */
    Donkeycraft.Movement.prototype._processSpeedCycleKey = function () {
        var input = this._input;
        if (!input) return;

        // Decrement cooldown each tick
        if (this._speedKeyCooldown > 0) {
            this._speedKeyCooldown--;
        }

        // Only process speed key changes when cooldown is zero
        if (this._speedKeyCooldown > 0) return;

        var gameMode = this._player.getGameMode();
        var isFlying = false;
        if (gameMode === 'creative' && this._player.flyEnabled) {
            isFlying = true;
        } else if (gameMode === 'spectator') {
            isFlying = true;
        }

        var speeds = this._getSpeedDefinitions(gameMode, isFlying);
        if (!speeds) return;

        var currentIdx = this.getSliderIndex();
        var cycleDown = input.isKeyDown('KeyZ');
        var cycleUp = input.isKeyDown('KeyQ');

        // ShiftLeft: toggle speed up (cycles back to first at max)
        var cycleDownPressed = input.isKeyDown(Config.KEYBINDS.SPEED_CYCLE);
        if (cycleDownPressed && !this._speedKeyState.SPEED_CYCLE) {
            // Key just pressed — increase speed, cycle to first at max
            if (currentIdx < speeds.length - 1) {
                this.setSliderIndex(currentIdx + 1);
                Donkeycraft.Logger.info('Movement', 'Speed increased to index ' + (currentIdx + 1) + ' via Shift');
            } else {
                // Cycle back to first setting
                this.setSliderIndex(0);
                Donkeycraft.Logger.info('Movement', 'Speed cycled to index 0 (wrap-around) via Shift');
            }
            this._speedKeyCooldown = this._SPEED_KEY_COOLDOWN;
        }
        this._speedKeyState.SPEED_CYCLE = cycleDownPressed;

        // Z key: decrease speed (grounded) / go down (swimming/flying)
        if (cycleDown && !this._speedKeyState.SPEED_DOWN) {
            if (!isFlying) {
                // Grounded: decrease speed
                if (currentIdx > 0) {
                    this.setSliderIndex(currentIdx - 1);
                    Donkeycraft.Logger.info('Movement', 'Speed decreased to index ' + (currentIdx - 1) + ' via Z');
                }
            }
            // Cooldown for key press detection
            this._speedKeyCooldown = this._SPEED_KEY_COOLDOWN;
        }
        this._speedKeyState.SPEED_DOWN = cycleDown;

        // Q key: increase speed (grounded) / go up (swimming/flying)
        if (cycleUp && !this._speedKeyState.SPEED_UP) {
            if (!isFlying) {
                // Grounded: increase speed
                if (currentIdx < speeds.length - 1) {
                    this.setSliderIndex(currentIdx + 1);
                    Donkeycraft.Logger.info('Movement', 'Speed increased to index ' + (currentIdx + 1) + ' via Q');
                }
            }
            // Cooldown for key press detection
            this._speedKeyCooldown = this._SPEED_KEY_COOLDOWN;
        }
        this._speedKeyState.SPEED_UP = cycleUp;
    };

    /**
     * Detect terrain effects beneath the player's feet.
     *
     * Checks the block(s) under the player's feet and returns a context object
     * with any applicable speed modifiers (honey block, mud, powder snow).
     *
     * @private
     * @param {number} x - Player X position.
     * @param {number} y - Player Y position (feet level).
     * @param {number} z - Player Z position.
     * @returns {Object} Terrain context with slowModifier property.
     */
    Donkeycraft.Movement.prototype._detectTerrainEffects = function (x, y, z) {
        var collision = this._collision;
        if (!collision || !this._chunkManager) {
            return { slowModifier: 1.0 }; // No modifier — default full speed
        }

        // Sample the block directly beneath the player's feet
        var footBlockX = Math.floor(x);
        var footBlockY = Math.floor(y);
        var footBlockZ = Math.floor(z);

        try {
            // Use ChunkManager.getBlockId (which delegates to chunk.getBlock)
            var footBlockId = this._chunkManager.getBlockId(footBlockX, footBlockY, footBlockZ);

            // Honey block: slow movement (slimy surface)
            if (footBlockId === 126) { // honey_block
                return { slowModifier: Config.HONEY_BLOCK_SLOW, type: 'honey' };
            }

            // Mud variants: slow movement (muddy terrain)
            if (footBlockId === 224 || footBlockId === 241) { // mud, packed_mud
                return { slowModifier: Config.MUD_SLOW, type: 'mud' };
            }

            // Powder snow: slow movement (deep, soft snow)
            if (footBlockId === 305) { // powder_snow (if it exists)
                return { slowModifier: Config.POWDER_SNOW_SLOW, type: 'powder_snow' };
            }

        } catch (e) {
            Donkeycraft.Logger.warn('Movement', 'Failed to detect terrain effects: ' + e.message);
        }

        // No terrain effects — full speed
        return { slowModifier: 1.0, type: null };
    };

    /**
     * Main movement tick — called every game tick.
     * Reads input keys, computes horizontal speed, applies gravity, handles swimming,
     * updates position with collision resolution, and tracks distance for hunger degradation.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Movement.prototype.tick = function (deltaTime) {
        var player = this._player;

        // Validate inputs — log if any dependency is missing to aid debugging
        if (!player) {
            Donkeycraft.Logger.error('Movement', 'Player reference is null in tick()');
            return;
        }
        if (!this._input) {
            Donkeycraft.Logger.error('Movement', 'Input reference is null in tick()');
            return;
        }
        if (!this._collision) {
            Donkeycraft.Logger.warn('Movement', 'Collision reference is null — movement will be unconstrained');
        }

        // If dead, no movement
        if (!player.isAlive()) {
            return;
        }

        // Process speed keys (Shift=cycle up, Z=down/slow, Q=up/fast)
        this._processSpeedCycleKey();

        var gameMode = player.getGameMode();

        // Spectator mode: clip through blocks, always fly
        if (gameMode === 'spectator') {
            this._tickSpectator(deltaTime);
            return;
        }

        // Creative mode: flying if enabled
        if (gameMode === 'creative' && player.flyEnabled) {
            Donkeycraft.Logger.debug('Movement', 'Creative fly tick active');
            this._tickCreativeFly(deltaTime);
            return;
        }

        // Survival mode: walking + gravity
        this._tickSurvival(deltaTime);
    };


    /**
     * Survival mode movement tick — handles walking, gravity, and swimming physics.
     * 
     * This method:
     * 1. Reads input keys (WASD) and computes horizontal movement direction
     * 2. Converts to world-space based on player yaw rotation
     * 3. Applies gravity (acceleration in blocks/s²) or swimming controls
     * 4. Resolves collision per-axis (X → Y → Z order)
     * 5. Updates player position and onGround state
     * 6. Tracks fall distance for damage calculation
     * 7. Applies hunger degradation based on movement type
     * 8. Clears speed lock when key input differs from locked mode
     * 
     * Delta-time is clamped to 0.1s to prevent physics instability on frame drops.
     * 
     * @param {number} deltaTime - Time since last tick in seconds (clamped to 0.1).
     * @private
     */
    Donkeycraft.Movement.prototype._tickSurvival = function (deltaTime) {
        var player = this._player;
        var input = this._input;
        var collision = this._collision;

        if (!player || !input || !collision) {
            if (!player) Donkeycraft.Logger.error('Movement', 'Player reference is null in _tickSurvival()');
            if (!input) Donkeycraft.Logger.error('Movement', 'Input reference is null in _tickSurvival()');
            if (!collision) Donkeycraft.Logger.warn('Movement', 'Collision reference is null — movement will be unconstrained');
            return;
        }

        // Clamp deltaTime to prevent physics instability on frame drops
        deltaTime = Math.min(deltaTime, 0.1);

        // Get the slider index and corresponding speed
        var gameMode = player.getGameMode();
        var sliderIndex = this.getSliderIndex();

        // Detect terrain effects beneath the player's feet
        var pos = player.getPosition();
        var terrainContext = this._detectTerrainEffects(pos.x, pos.y, pos.z);

        // Get base speed from slider index, apply terrain modifiers
        var speed = this._getSpeedForIndex(sliderIndex, gameMode, terrainContext);

        // Get the active speed mode string for UI/hunger tracking
        var activeMode = this.getActiveSpeedMode();

        // Track sprint/sneak state for hunger degradation
        var isSprinting = (activeMode === 'run');
        var isSneaking = (activeMode === 'sneak');

        // Compute horizontal movement direction from input.
        // When pointer is unlocked, A/D is consumed by keyboard turn in game.js _updatePlayer(),
        // so only process strafe when pointer IS locked.
        var forward = input.isKeyDown(Config.KEYBINDS.MOVE_FORWARD) ? 1 : (input.isKeyDown(Config.KEYBINDS.MOVE_BACKWARD) ? -1 : 0);
        var strafe = this._mouseLocked
            ? (input.isKeyDown(Config.KEYBINDS.MOVE_RIGHT) ? 1 : (input.isKeyDown(Config.KEYBINDS.MOVE_LEFT) ? -1 : 0))
            : 0;

        // Convert to world-space direction based on player yaw
        var yaw = player.getRotation().yaw;
        var sinYaw = Math.sin(yaw);
        var cosYaw = Math.cos(yaw);

        // Forward/backward contributes to X and Z
        var moveX = 0;
        var moveZ = 0;

        if (forward !== 0 || strafe !== 0) {
            // Forward movement
            moveX -= sinYaw * forward;
            moveZ -= cosYaw * forward;
            // Strafe movement (perpendicular to forward)
            moveX += cosYaw * strafe;
            moveZ -= sinYaw * strafe;
        }

        // Normalize horizontal movement
        var mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (mag > 0) {
            moveX = (moveX / mag) * speed;
            moveZ = (moveZ / mag) * speed;
        } else {
            moveX = 0;
            moveZ = 0;
        }

        // Apply horizontal velocity (dampen existing)
        player.setVelocity(moveX, player.getVelocity().y, moveZ);

        // Store current position for distance tracking and liquid checks.
        // Save oldY BEFORE gravity is applied so we can compute actual vertical displacement.
        var pos = player.getPosition();
        var oldY = pos.y;
        var dimensions = player.getDimensions(); // Declared once here; do not redeclare below

        // Check if player's HEAD/EYES are in water — determines full swimming vs walking in water.
        // Only when the eyes are submerged does the player enter swim mode.
        // When only feet/lower body are in water, the player walks normally with dampening.
        // This prevents the "sinking/blipping" behavior where shallow-water players
        // incorrectly get swimming physics applied, then collision snaps them back to ground.
        var eyesInWater = this._collision.isBlockLiquid(pos.x, Math.floor(pos.y + Config.PLAYER_EYE_HEIGHT), pos.z);

        // Check if ANY part of the player's body is in water (for fall damage stamina).
        var anyInWater = this._isPlayerInLiquid(pos, dimensions);

        // Check if specifically in lava (does NOT absorb fall damage, unlike water).
        var anyInLava = this._isPlayerInLava(pos, dimensions);

        // Player is swimming only when eyes are submerged — otherwise walk normally.
        if (eyesInWater) {
            // Swimming: no gravity, fly-like controls for weightless movement
            // Horizontal dampening for smooth water movement
            player.setVelocity(
                player.getVelocity().x * 0.85,
                player.getVelocity().y,
                player.getVelocity().z * 0.85
            );

            // Fly-like vertical controls: Space/Q = swim up, Z = swim down
            var swimUp = input.isKeyDown(Config.KEYBINDS.JUMP) ? 1 : (input.isKeyDown(Config.KEYBINDS.SPEED_UP) ? 1 : 0);
            var swimDown = input.isKeyDown(Config.KEYBINDS.SPEED_DOWN) ? 1 : 0;

            var swimVy = player.getVelocity().y;
            if (swimUp !== 0) {
                swimVy = Math.max(swimVy, Config.SWIM_BOOST);
            } else if (swimDown !== 0) {
                swimVy = Math.min(swimVy, -Config.SWIM_DOWNSPEED);
            } else {
                // Neutral buoyancy: gently push toward zero vertical velocity
                swimVy *= 0.9;
            }

            player.setVelocity(
                player.getVelocity().x,
                swimVy,
                player.getVelocity().z
            );
        } else {
            // Apply gravity (acceleration in blocks/s^2)
            var vy = player.getVelocity().y + Config.GRAVITY * deltaTime;

            // Clamp to terminal velocity
            vy = Math.max(vy, Config.TERMINAL_VELOCITY);

            player.setVelocity(player.getVelocity().x, vy, player.getVelocity().z);
        }

        // Resolve movement with collision — pass displacement (velocity * deltaTime)
        var result = collision.resolveMovementWithDelta(
            pos,
            player.getVelocity(),
            dimensions.width,
            dimensions.height,
            deltaTime
        );

        // Update player position
        player.setPosition(result.newX, result.newY, result.newZ);

        // Update onGround state
        player.onGround = result.onGround;

        // --- Fall distance tracking & landing logic ---

        // Track fall distance using ACTUAL vertical displacement (oldY - newY).
        // This is more accurate than velocity × deltaTime because:
        // 1. Velocity includes gravity that hasn't been applied to position yet
        // 2. Position delta reflects the true distance fallen this tick
        // Only track when falling downward (oldY > result.newY means net downward movement)
        if (!result.onGround && !anyInWater && !anyInLava) {
            var actualFallDelta = oldY - result.newY;
            if (actualFallDelta > 0) {
                player.trackFallDistance(actualFallDelta);
            }
        }

        // Handle landing scenarios
        if (result.onGround) {
            if (anyInLava) {
                // Landing in lava: lava does NOT absorb fall damage — apply it normally.
                if (player.maxFallDistance > Config.FALL_DAMAGE_THRESHOLD && this._playerRef) {
                    try {
                        var fallDmg = this._playerRef.applyFallDamage();
                        if (fallDmg > 0) {
                            Donkeycraft.Logger.info('Movement', 'Player took ' + fallDmg.toFixed(1) + ' fall damage');
                        }
                    } catch (e) {
                        Donkeycraft.Logger.warn('Movement', 'Fall damage application failed: ' + e.message);
                    }
                } else {
                    player.maxFallDistance = 0;
                }
            } else if (anyInWater) {
                // Landing in water: water absorbs ALL fall impact, no damage taken.
                player.maxFallDistance = 0;
            } else {
                // Landing on solid ground: apply fall damage if threshold exceeded.
                if (player.maxFallDistance > Config.FALL_DAMAGE_THRESHOLD && this._playerRef) {
                    try {
                        var fallDmg2 = this._playerRef.applyFallDamage();
                        if (fallDmg2 > 0) {
                            Donkeycraft.Logger.info('Movement', 'Player took ' + fallDmg2.toFixed(1) + ' fall damage');
                        }
                    } catch (e) {
                        Donkeycraft.Logger.warn('Movement', 'Fall damage application failed: ' + e.message);
                    }
                } else {
                    // Reset fall distance when landing with no damage
                    player.maxFallDistance = 0;
                }
            }
        } else if (anyInLava && !result.onGround) {
            // Falling through lava: lava does NOT absorb fall impact — keep tracking.
            var actualFallDelta2 = oldY - result.newY;
            if (actualFallDelta2 > 0) {
                player.trackFallDistance(actualFallDelta2);
            }
        } else if (anyInWater && !result.onGround) {
            // Swimming in water: water absorbs fall impact — cancel all fall distance.
            player.maxFallDistance = 0;
        }

        // Zero vertical velocity when on solid ground — gravity is counteracted by the ground normal force.
        // Without this, gravity keeps accumulating negative velocity each tick while collision
        // prevents downward movement, causing violent shaking/vibration until the system stabilizes.
        if (result.onGround && !eyesInWater) {
            player.setVelocity(player.getVelocity().x, 0, player.getVelocity().z);
        }

        // Clear horizontal velocity when not moving (survival walking).
        // In water (even shallow), allow normal movement without extra dampening.
        if (result.onGround) {
            var inputActive = forward !== 0 || strafe !== 0;
            if (!inputActive) {
                player.setVelocity(0, player.getVelocity().y, 0);
            }
        }

        // Track horizontal distance for hunger degradation
        var dx = result.newX - pos.x;
        var dz = result.newZ - pos.z;
        this._distanceAccumulator += Math.sqrt(dx * dx + dz * dz);

        // Apply hunger degradation every ~0.5 seconds worth of distance
        if (this._hungerSystem && this._distanceAccumulator >= 0.5) {
            var distanceSinceLastDeg = this._distanceAccumulator;
            this._distanceAccumulator = 0;
        }

        // Log terrain effects for debugging
        if (terrainContext.type && terrainContext.slowModifier < 1.0) {
            Donkeycraft.Logger.info('Movement', 'Terrain slow effect: ' + terrainContext.type + ' (' + (terrainContext.slowModifier * 100) + '% speed)');
        }
    };

    /**
     * Creative flying movement tick — handles fly controls and collision resolution.
     * 
     * This method:
     * 1. Computes horizontal movement from input keys (WASD)
     * 2. Applies vertical movement (Space = up, ShiftLeft = down)
     * 3. Checks for sprint-flying boost (Space + forward = double speed)
     * 4. Resolves collision with blocks (creative still collides)
     * 5. Updates player position and onGround state
     * 
     * Delta-time is clamped to 0.1s to prevent physics instability on frame drops.
     * No gravity is applied in creative fly mode — vertical movement is direct.
     * 
     * @param {number} deltaTime - Time since last tick in seconds (clamped to 0.1).
     * @private
     */
    Donkeycraft.Movement.prototype._tickCreativeFly = function (deltaTime) {
        var player = this._player;
        var input = this._input;
        var collision = this._collision;

        if (!player || !input || !collision) {
            if (!player) Donkeycraft.Logger.error('Movement', 'Player reference is null in _tickCreativeFly()');
            if (!input) Donkeycraft.Logger.error('Movement', 'Input reference is null in _tickCreativeFly()');
            if (!collision) Donkeycraft.Logger.warn('Movement', 'Collision reference is null — movement will be unconstrained');
            return;
        }

        // Clamp deltaTime to prevent physics instability on frame drops
        deltaTime = Math.min(deltaTime, 0.1);

        // Get fly speed from slider index — replaces hardcoded sprint-flying boost logic
        var sliderIndex = this.getSliderIndex();
        var speed = this._getFlySpeedForIndex(sliderIndex);

        // Compute horizontal movement direction from input
        var forward = input.isKeyDown(Config.KEYBINDS.MOVE_FORWARD) ? 1 : (input.isKeyDown(Config.KEYBINDS.MOVE_BACKWARD) ? -1 : 0);
        var strafe = input.isKeyDown(Config.KEYBINDS.MOVE_RIGHT) ? 1 : (input.isKeyDown(Config.KEYBINDS.MOVE_LEFT) ? -1 : 0);

        // Convert to world-space direction based on player yaw
        var yaw = player.getRotation().yaw;
        var moveX = 0;
        var moveZ = 0;

        if (forward !== 0 || strafe !== 0) {
            var sinYaw = Math.sin(yaw);
            var cosYaw = Math.cos(yaw);
            moveX -= sinYaw * forward;
            moveZ -= cosYaw * forward;
            moveX += cosYaw * strafe;
            moveZ -= sinYaw * strafe;
        }

        // Normalize horizontal movement
        var mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (mag > 0) {
            moveX = (moveX / mag) * speed;
            moveZ = (moveZ / mag) * speed;
        } else {
            moveX = 0;
            moveZ = 0;
        }

        // Vertical movement: Space/Q = up, Z = down.
        var moveUp = input.isKeyDown(Config.KEYBINDS.JUMP) ? 1 : (input.isKeyDown(Config.KEYBINDS.SPEED_UP) ? 1 : 0);
        var moveDown = input.isKeyDown(Config.KEYBINDS.SPEED_DOWN) ? 1 : 0;

        var flyVy = 0;
        if (moveUp !== 0) {
            flyVy = speed;
        } else if (moveDown !== 0) {
            // FLYING_TERMINAL_VELOCITY is negative (-20), so assign directly.
            flyVy = Config.FLYING_TERMINAL_VELOCITY;
        }

        // Apply velocity directly (no gravity in creative fly).
        // Multiply by deltaTime for frame-rate-independent movement.
        player.setVelocity(moveX, flyVy, moveZ);

        // Resolve movement with collision (creative still collides with blocks)
        var pos = player.getPosition();
        var dimensions = player.getDimensions();
        var result = collision._resolveDisplacement(
            pos,
            moveX * deltaTime,
            flyVy * deltaTime,
            moveZ * deltaTime,
            dimensions.width,
            dimensions.height
        );

        // Update player position
        player.setPosition(result.newX, result.newY, result.newZ);

        // On ground when moving downward and colliding
        player.onGround = result.onGround;
    };

    /**
     * Spectator mode movement tick — clips through blocks, always flying.
     * 
     * This method:
     * 1. Computes horizontal movement from input keys (WASD)
     * 2. Applies vertical movement (Space = up, ShiftLeft = down)
     * 3. Updates position WITHOUT collision resolution (spectator clips through blocks)
     * 4. Sets onGround to false (spectator is never on ground)
     * 
     * Delta-time is clamped to 0.1s to prevent physics instability on frame drops.
     * No gravity, no collision — pure fly-like movement with no restrictions.
     * 
     * @param {number} deltaTime - Time since last tick in seconds (clamped to 0.1).
     * @private
     */
    Donkeycraft.Movement.prototype._tickSpectator = function (deltaTime) {
        var player = this._player;
        var input = this._input;

        // Clamp deltaTime to prevent physics instability on frame drops
        deltaTime = Math.min(deltaTime, 0.1);

        // Spectator fly speed — no sprint boost.
        // In spectator mode, ShiftLeft controls vertical movement only.
        var speed = Config.PLAYER_FLY_SPEED;

        // Compute horizontal movement direction from input
        var forward = input.isKeyDown(Config.KEYBINDS.MOVE_FORWARD) ? 1 : (input.isKeyDown(Config.KEYBINDS.MOVE_BACKWARD) ? -1 : 0);
        var strafe = input.isKeyDown(Config.KEYBINDS.MOVE_RIGHT) ? 1 : (input.isKeyDown(Config.KEYBINDS.MOVE_LEFT) ? -1 : 0);

        // Convert to world-space direction based on player yaw
        var yaw = player.getRotation().yaw;
        var moveX = 0;
        var moveZ = 0;

        if (forward !== 0 || strafe !== 0) {
            var sinYaw = Math.sin(yaw);
            var cosYaw = Math.cos(yaw);
            moveX -= sinYaw * forward;
            moveZ -= cosYaw * forward;
            moveX += cosYaw * strafe;
            moveZ -= sinYaw * strafe;
        }

        // Normalize horizontal movement
        var mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (mag > 0) {
            moveX = (moveX / mag) * speed;
            moveZ = (moveZ / mag) * speed;
        } else {
            moveX = 0;
            moveZ = 0;
        }

        // Vertical movement: Space/Q = up, Z = down.
        var moveUp = input.isKeyDown(Config.KEYBINDS.JUMP) ? 1 : (input.isKeyDown(Config.KEYBINDS.SPEED_UP) ? 1 : 0);
        var moveDown = input.isKeyDown(Config.KEYBINDS.SPEED_DOWN) ? 1 : 0;

        var flyVy = 0;
        if (moveUp !== 0) {
            flyVy = speed;
        } else if (moveDown !== 0) {
            // FLYING_TERMINAL_VELOCITY is negative (-20), so assign directly.
            flyVy = Config.FLYING_TERMINAL_VELOCITY;
        }

        // Apply velocity directly — no collision in spectator mode.
        // Multiply by deltaTime for frame-rate-independent movement.
        player.setVelocity(moveX, flyVy, moveZ);

        // Update position without collision resolution.
        var pos = player.getPosition();
        pos.x += moveX * deltaTime;
        pos.y += flyVy * deltaTime;
        pos.z += moveZ * deltaTime;

        // Spectator is never on ground
        player.onGround = false;
    };

    /**
     * Get the current horizontal movement speed based on game mode and slider index.
     *
     * @returns {number} Speed in blocks per second.
     */
    Donkeycraft.Movement.prototype.getHorizontalSpeed = function () {
        var gameMode = this._player.getGameMode();

        if (gameMode === 'spectator') {
            return Config.PLAYER_FLY_SPEED;
        }

        if (gameMode === 'creative' && this._player.flyEnabled) {
            return Config.PLAYER_FLY_SPEED;
        }

        // Survival or creative walking — use slider index
        return this._getSpeedForIndex(this.getSliderIndex(), gameMode, { slowModifier: 1.0 });
    };

    /**
     * Check if the player is currently swimming (in water).
     *
     * @returns {boolean} True if the player's mid-body position is in a liquid block.
     */
    Donkeycraft.Movement.prototype.isSwimming = function () {
        var pos = this._player.getPosition();
        return this._collision.isBlockLiquid(pos.x, pos.y + 0.5, pos.z);
    };

    /**
     * Check if the player's eyes are in water.
     *
     * @returns {boolean} True if the eye position is in a liquid block.
     */
    Donkeycraft.Movement.prototype.isInWater = function () {
        var eyePos = this._player.getEyePosition();
        return this._collision.isBlockLiquid(eyePos.x, eyePos.y, eyePos.z);
    };

    /**
     * Check if the player is in lava by sampling multiple body positions.
     *
     * Uses `collision.isBlockLava()` for precise lava detection (not water).
     * Samples 3 Y positions (feet, mid-body, head) to account for partial submersion.
     *
     * @returns {boolean} True if any sample point is in a lava block.
     */
    Donkeycraft.Movement.prototype.isInLava = function () {
        var pos = this._player.getPosition();

        // Check at feet, mid-body, and head height using collision system for consistency
        var checkYs = [pos.y, pos.y + 0.5, pos.y + 1.2];

        for (var i = 0; i < checkYs.length; i++) {
            if (this._collision.isBlockLava(pos.x, Math.floor(checkYs[i]), pos.z)) {
                return true;
            }
        }

        return false;
    };

    /**
     * Get the player's current game mode.
     *
     * @returns {string} Game mode string ('survival', 'creative', 'spectator').
     */
    Donkeycraft.Movement.prototype.getGameMode = function () {
        return this._player.getGameMode();
    };

    /**
     * Set the player's game mode.
     *
     * @param {string} mode - Game mode string ('survival', 'creative', 'spectator').
     */
    Donkeycraft.Movement.prototype.setGameMode = function (mode) {
        this._player.setGameMode(mode);
    };

    /**
     * Check if the player's body overlaps with any liquid block (water or lava).
     * 
     * Samples at 3 heights along the player's vertical footprint:
     * 1. Feet level (`pos.y`)
     * 2. Mid-body (`pos.y + height * 0.5`)
     * 3. Near head (`pos.y + height - 0.1`)
     * 
     * If ANY sample point is in a liquid block, returns `true`. This prevents false
     * negatives when the player spawns with feet in water but eyes above it
     * (e.g., spawning at water level Y=64 where the body straddles the surface).
     * 
     * @param {Donkeycraft.Vector3} pos - Player center position.
     * @param {{height: number, width: number}} dimensions - Player dimensions.
     * @returns {boolean} True if any sample point is in a liquid block.
     * @private
     */
    Donkeycraft.Movement.prototype._isPlayerInLiquid = function (pos, dimensions) {
        var collision = this._collision;
        if (!collision) return false;

        // Sample at 3 heights: feet, mid-body, head
        var playerHeight = dimensions.height || 1.8;
        var checkYs = [
            pos.y,              // feet level
            pos.y + playerHeight * 0.5,  // mid-body
            pos.y + playerHeight - 0.1   // near head (player height is ~1.8, eyes at ~1.62)
        ];

        for (var i = 0; i < checkYs.length; i++) {
            var globalY = Math.floor(checkYs[i]);
            if (collision.isBlockLiquid(pos.x, globalY, pos.z)) {
                return true;
            }
        }

        return false;
    };

    /**
     * Check if the player's body overlaps with any lava block specifically.
     * 
     * Samples at 3 heights along the player's vertical footprint:
     * 1. Feet level (`pos.y`)
     * 2. Mid-body (`pos.y + height * 0.5`)
     * 3. Near head (`pos.y + height - 0.1`)
     * 
     * If ANY sample point is in a lava block, returns `true`.
     * Used to distinguish lava from water for fall damage stamina:
     * only water absorbs/cancels fall impact; lava does NOT.
     * 
     * @param {Donkeycraft.Vector3} pos - Player center position.
     * @param {{height: number, width: number}} dimensions - Player dimensions.
     * @returns {boolean} True if any sample point is in a lava block.
     * @private
     */
    Donkeycraft.Movement.prototype._isPlayerInLava = function (pos, dimensions) {
        var collision = this._collision;
        if (!collision) return false;

        // Sample at 3 heights: feet, mid-body, head
        var playerHeight = dimensions.height || 1.8;
        var checkYs = [
            pos.y,              // feet level
            pos.y + playerHeight * 0.5,  // mid-body
            pos.y + playerHeight - 0.1   // near head (player height is ~1.8, eyes at ~1.62)
        ];

        for (var i = 0; i < checkYs.length; i++) {
            var globalY = Math.floor(checkYs[i]);
            if (collision.isBlockLava(pos.x, globalY, pos.z)) {
                return true;
            }
        }

        return false;
    };

    /**
     * Destroy the movement system and free resources.
     *
     * Clears all internal references to allow garbage collection.
     */
    Donkeycraft.Movement.prototype.destroy = function () {
        this._input = null;
        this._player = null;
        this._collision = null;
        this._chunkManager = null;
        this._hungerSystem = null;
        this._speedKeyState = {};
    };

})();
