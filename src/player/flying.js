// Donkeycraft — Flying System
// Creative/spectator flying: up/down, speed boost (shift), collision in creative.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Flying — handles creative and spectator flying mechanics.
     * @param {Donkeycraft.Player} player - Player entity instance.
     * @param {Donkeycraft.Input} input - Input handler instance.
     */
    Donkeycraft.Flying = function(player, input) {
        this._player = player;
        this._input = input;

        /**
         * Whether flying mode is currently enabled.
         * @type {boolean}
         * @private
         */
        this._flyEnabled = false;
    };

    /**
     * Main flying tick — called every game tick.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Flying.prototype.tick = function(deltaTime) {
        var player = this._player;

        // Only creative/spectator can fly
        var gameMode = player.getGameMode();
        if (gameMode !== 'creative' && gameMode !== 'spectator') {
            return;
        }

        // Spectator always flies, creative needs fly mode enabled
        if (gameMode === 'spectator' || this._flyEnabled) {
            this._applyFlying(deltaTime);
        }
    };

    /**
     * Apply flying movement to the player.
     * @param {number} deltaTime - Time since last tick in seconds.
     * @private
     */
    Donkeycraft.Flying.prototype._applyFlying = function(deltaTime) {
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

        // Vertical movement: Space = up, Shift = down (vanilla Minecraft allows descending while moving horizontally)
        var flyVy = 0;
        if (input.isKeyDown(Config.KEYBINDS.JUMP)) {
            flyVy = speed;
        } else if (input.isKeyDown(Config.KEYBINDS.SPRINT)) {
            flyVy = -Config.FLYING_TERMINAL_VELOCITY;
        }

        // Apply velocity directly (no gravity in flying mode)
        player.setVelocity(moveX, flyVy, moveZ);
    };

    /**
     * Check if flying is currently enabled.
     * @returns {boolean}
     */
    Donkeycraft.Flying.prototype.isFlying = function() {
        var gameMode = this._player.getGameMode();
        return (gameMode === 'creative' || gameMode === 'spectator') && this._flyEnabled;
    };

    /**
     * Toggle flying mode on/off.
     */
    Donkeycraft.Flying.prototype.toggleFlyMode = function() {
        var gameMode = this._player.getGameMode();

        // Only creative and spectator can toggle flying
        if (gameMode !== 'creative' && gameMode !== 'spectator') {
            return;
        }

        this._flyEnabled = !this._flyEnabled;
        this._player.flyEnabled = this._flyEnabled;
    };

    /**
     * Enable flying mode.
     */
    Donkeycraft.Flying.prototype.enableFlyMode = function() {
        var gameMode = this._player.getGameMode();

        // Only creative and spectator can fly
        if (gameMode !== 'creative' && gameMode !== 'spectator') {
            return;
        }

        this._flyEnabled = true;
        this._player.flyEnabled = true;
    };

    /**
     * Disable flying mode.
     */
    Donkeycraft.Flying.prototype.disableFlyMode = function() {
        this._flyEnabled = false;
        this._player.flyEnabled = false;
    };

    /**
     * Get the current fly speed based on sprint state.
     * @returns {number} Speed in blocks per second.
     */
    Donkeycraft.Flying.prototype.getFlySpeed = function() {
        var isSprinting = this._input.isKeyDown(Config.KEYBINDS.SPRINT);
        return isSprinting ? Config.PLAYER_FLY_SPEED_BOOST : Config.PLAYER_FLY_SPEED;
    };

    /**
     * Check if the player can spectate (clip through blocks).
     * @returns {boolean} True if game mode is spectator.
     */
    Donkeycraft.Flying.prototype.canSpectate = function() {
        return this._player.getGameMode() === 'spectator';
    };

    /**
     * Check if the player should clip through blocks (spectator mode).
     * @returns {boolean}
     */
    Donkeycraft.Flying.prototype.shouldClipThroughBlocks = function() {
        return this._player.getGameMode() === 'spectator';
    };

    /**
     * Get whether flying is enabled (internal flag).
     * @returns {boolean}
     */
    Donkeycraft.Flying.prototype.isEnabled = function() {
        return this._flyEnabled;
    };

    /**
     * Set whether flying is enabled (for external control).
     * @param {boolean} enabled - True to enable, false to disable.
     */
    Donkeycraft.Flying.prototype.setEnabled = function(enabled) {
        var gameMode = this._player.getGameMode();

        // Only creative and spectator can fly
        if (gameMode !== 'creative' && gameMode !== 'spectator') {
            return;
        }

        this._flyEnabled = !!enabled;
        this._player.flyEnabled = !!enabled;
    };

    /**
     * Destroy the flying system and free resources.
     */
    Donkeycraft.Flying.prototype.destroy = function() {
        this._player = null;
        this._input = null;
    };

})();