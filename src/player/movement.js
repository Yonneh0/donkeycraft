// Donkeycraft — Movement Physics
// Movement physics: walking, sprinting, swimming, flying, speed modifiers.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Movement — handles player movement physics including walking, sprinting, swimming, and flying.
     * @param {Donkeycraft.Input} input - Input handler instance.
     * @param {Donkeycraft.Player} player - Player entity instance.
     * @param {Donkeycraft.Collision} collision - Collision detection instance.
     * @param {Donkeycraft.ChunkManager} chunkManager - Chunk manager for block lookups.
     */
    Donkeycraft.Movement = function(input, player, collision, chunkManager) {
        this._input = input;
        this._player = player;
        this._collision = collision;
        this._chunkManager = chunkManager;
    };

    /**
     * Main movement tick — called every game tick.
     * Reads input keys, computes horizontal speed, applies gravity, handles swimming,
     * updates position with collision resolution.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Movement.prototype.tick = function(deltaTime) {
        var player = this._player;

        // If dead, no movement
        if (!player.isAlive()) {
            return;
        }

        var gameMode = player.getGameMode();

        // Spectator mode: clip through blocks, always fly
        if (gameMode === 'spectator') {
            this._tickSpectator(deltaTime);
            return;
        }

        // Creative mode: flying if enabled
        if (gameMode === 'creative' && player.flyEnabled) {
            this._tickCreativeFly(deltaTime);
            return;
        }

        // Survival mode: walking + gravity
        this._tickSurvival(deltaTime);
    };

    /**
     * Survival mode movement tick — walking, gravity, swimming.
     * @param {number} deltaTime - Time since last tick in seconds.
     * @private
     */
    Donkeycraft.Movement.prototype._tickSurvival = function(deltaTime) {
        var player = this._player;
        var input = this._input;
        var collision = this._collision;

        // Get horizontal speed
        var speed = Config.PLAYER_SPEED;
        var isSprinting = input.isKeyDown(Config.KEYBINDS.SPRINT);
        if (isSprinting) {
            speed = Config.PLAYER_SPRINT_SPEED;
        }

        // Compute horizontal movement direction from input
        var forward = input.isKeyDown(Config.KEYBINDS.MOVE_FORWARD) ? 1 : (input.isKeyDown(Config.KEYBINDS.MOVE_BACKWARD) ? -1 : 0);
        var strafe = input.isKeyDown(Config.KEYBINDS.MOVE_RIGHT) ? 1 : (input.isKeyDown(Config.KEYBINDS.MOVE_LEFT) ? -1 : 0);

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

        // Check if in water — swimming
        var pos = player.getPosition();
        var inWater = collision.isBlockLiquid(pos.x, pos.y + 0.5, pos.z);

        if (inWater) {
            // Swimming: reduce velocity and apply buoyancy
            player.setVelocity(
                player.getVelocity().x * 0.85,
                Math.max(player.getVelocity().y, 0.1),
                player.getVelocity().z * 0.85
            );

            // Check if jump key is pressed while swimming
            if (input.isKeyDown(Config.KEYBINDS.JUMP)) {
                player.setVelocity(
                    player.getVelocity().x,
                    Math.max(player.getVelocity().y, 0.15),
                    player.getVelocity().z
                );
            }
        } else {
            // Apply gravity
            var vy = player.getVelocity().y + Config.GRAVITY * deltaTime;

            // Clamp to terminal velocity
            vy = Math.max(vy, Config.TERMINAL_VELOCITY);

            player.setVelocity(player.getVelocity().x, vy, player.getVelocity().z);
        }

        // Resolve movement with collision
        var dimensions = player.getDimensions();
        var result = collision.resolveMovement(
            pos,
            player.getVelocity(),
            dimensions.width,
            dimensions.height
        );

        // Update player position
        player.setPosition(result.newX, result.newY, result.newZ);

        // Update onGround state
        player.onGround = result.onGround;

        // Track fall distance (vy is negative when falling, so negate to get positive displacement)
        if (!result.onGround && !inWater) {
            var vy = player.getVelocity().y;
            if (vy < 0) {
                player.trackFallDistance(-vy * deltaTime);
            }
        } else if (result.onGround) {
            // Reset fall distance when landing on solid ground
            player.maxFallDistance = 0;
        }

        // Clear horizontal velocity when not moving (survival walking)
        if (!inWater && result.onGround) {
            var inputActive = forward !== 0 || strafe !== 0;
            if (!inputActive) {
                player.setVelocity(0, player.getVelocity().y, 0);
            }
        }
    };

    /**
     * Creative flying movement tick.
     * @param {number} deltaTime - Time since last tick in seconds.
     * @private
     */
    Donkeycraft.Movement.prototype._tickCreativeFly = function(deltaTime) {
        var player = this._player;
        var input = this._input;
        var collision = this._collision;

        // Get fly speed (boosted with sprint)
        var isSprinting = input.isKeyDown(Config.KEYBINDS.SPRINT);
        var speed = isSprinting ? Config.PLAYER_FLY_SPEED_BOOST : Config.PLAYER_FLY_SPEED;

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

        // Vertical movement: Space = up, Shift = down
        // Vanilla Minecraft allows descending while moving horizontally
        var moveUp = input.isKeyDown(Config.KEYBINDS.JUMP) ? 1 : 0;
        var moveDown = input.isKeyDown(Config.KEYBINDS.SPRINT) ? 1 : 0;

        var flyVy = 0;
        if (moveUp !== 0) {
            flyVy = speed;
        } else if (moveDown !== 0) {
            flyVy = -Config.FLYING_TERMINAL_VELOCITY;
        }

        // Apply velocity directly (no gravity in creative fly)
        player.setVelocity(moveX, flyVy, moveZ);

        // Resolve movement with collision (creative still collides with blocks)
        var pos = player.getPosition();
        var dimensions = player.getDimensions();
        var result = collision.resolveMovement(
            pos,
            player.getVelocity(),
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
     * @param {number} deltaTime - Time since last tick in seconds.
     * @private
     */
    Donkeycraft.Movement.prototype._tickSpectator = function(deltaTime) {
        var player = this._player;
        var input = this._input;

        // Get fly speed (boosted with sprint)
        var isSprinting = input.isKeyDown(Config.KEYBINDS.SPRINT);
        var speed = isSprinting ? Config.PLAYER_FLY_SPEED_BOOST : Config.PLAYER_FLY_SPEED;

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

        // Vertical movement: Space = up, Shift = down
        var moveUp = input.isKeyDown(Config.KEYBINDS.JUMP) ? 1 : 0;
        var moveDown = input.isKeyDown(Config.KEYBINDS.SPRINT) ? 1 : 0;

        var flyVy = 0;
        if (moveUp !== 0) {
            flyVy = speed;
        } else if (moveDown !== 0) {
            flyVy = -Config.FLYING_TERMINAL_VELOCITY;
        }

        // Apply velocity directly — no collision in spectator mode
        player.setVelocity(moveX, flyVy, moveZ);

        // Update position without collision resolution
        var pos = player.getPosition();
        pos.x += moveX * deltaTime;
        pos.y += flyVy * deltaTime;
        pos.z += moveZ * deltaTime;

        // Spectator is never on ground
        player.onGround = false;
    };

    /**
     * Get the current horizontal movement speed based on game mode and sprint state.
     * @returns {number} Speed in blocks per second.
     */
    Donkeycraft.Movement.prototype.getHorizontalSpeed = function() {
        var gameMode = this._player.getGameMode();

        if (gameMode === 'spectator') {
            return Config.PLAYER_FLY_SPEED;
        }

        if (gameMode === 'creative' && this._player.flyEnabled) {
            return Config.PLAYER_FLY_SPEED;
        }

        // Survival or creative walking
        var isSprinting = this._input.isKeyDown(Config.KEYBINDS.SPRINT);
        return isSprinting ? Config.PLAYER_SPRINT_SPEED : Config.PLAYER_SPEED;
    };

    /**
     * Check if the player is currently swimming (in water).
     * @returns {boolean}
     */
    Donkeycraft.Movement.prototype.isSwimming = function() {
        var pos = this._player.getPosition();
        return this._collision.isBlockLiquid(pos.x, pos.y + 0.5, pos.z);
    };

    /**
     * Check if the player's eyes are in water.
     * @returns {boolean}
     */
    Donkeycraft.Movement.prototype.isInWater = function() {
        var eyePos = this._player.getEyePosition();
        return this._collision.isBlockLiquid(eyePos.x, eyePos.y, eyePos.z);
    };

    /**
     * Check if the player is in lava by sampling multiple body positions.
     * @returns {boolean}
     */
    Donkeycraft.Movement.prototype.isInLava = function() {
        var pos = this._player.getPosition();

        // Check at feet, mid-body, and head height
        var checkYs = [pos.y, pos.y + 0.5, pos.y + 1.2];

        for (var i = 0; i < checkYs.length; i++) {
            var globalY = Math.floor(checkYs[i]);
            var chunkX = Donkeycraft.Chunk.chunkCoordX(pos.x);
            var chunkZ = Donkeycraft.Chunk.chunkCoordZ(pos.z);
            var localX = Donkeycraft.Chunk.localCoordX(pos.x);
            var localZ = Donkeycraft.Chunk.localCoordZ(pos.z);

            var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
            if (!chunk) continue;

            var blockId = chunk.getBlock(localX, globalY, localZ);

            // Lava block ID is 10 or 213 (check both variants)
            if (blockId === 10 || blockId === 213) {
                return true;
            }

            // Also check via BlockRegistry if available
            if (Donkeycraft.BlockRegistry && Donkeycraft.BlockRegistry.isLiquid) {
                var lavaId = Donkeycraft.BlockRegistry.getBlockIdByName ? Donkeycraft.BlockRegistry.getBlockIdByName('lava') : 0;
                if (lavaId > 0 && blockId === lavaId) {
                    return true;
                }
            }
        }

        return false;
    };

    /**
     * Get the player's current game mode.
     * @returns {string}
     */
    Donkeycraft.Movement.prototype.getGameMode = function() {
        return this._player.getGameMode();
    };

    /**
     * Set the player's game mode.
     * @param {string} mode - 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.Movement.prototype.setGameMode = function(mode) {
        this._player.setGameMode(mode);
    };

    /**
     * Destroy the movement system and free resources.
     */
    Donkeycraft.Movement.prototype.destroy = function() {
        this._input = null;
        this._player = null;
        this._collision = null;
        this._chunkManager = null;
    };

})();