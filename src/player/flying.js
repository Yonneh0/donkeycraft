// Donkeycraft — Flying System
// Creative/spectator flying state management: enable/disable fly mode, speed queries.
// Physics application is handled by Movement._tickCreativeFly() to avoid duplicate velocity writes.
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
         * Whether flying mode is currently enabled (creative only).
         * Spectator mode always flies without needing this flag.
         * @type {boolean}
         * @private
         */
        this._flyEnabled = false;
    };

    /**
     * Main flying tick — called every game tick.
     * State management only; physics is handled by Movement.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Flying.prototype.tick = function(deltaTime) {
        // No physics here. Movement._tickCreativeFly() and _tickSpectator() handle velocity.
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
     * @returns {boolean} True if toggled successfully.
     */
    Donkeycraft.Flying.prototype.toggleFlyMode = function() {
        var gameMode = this._player.getGameMode();

        // Only creative and spectator can toggle flying
        if (gameMode !== 'creative' && gameMode !== 'spectator') {
            return false;
        }

        this._flyEnabled = !this._flyEnabled;
        if (this._player) {
            this._player.flyEnabled = this._flyEnabled;
        }
        return true;
    };

    /**
     * Enable flying mode.
     * @returns {boolean} True if enabled successfully.
     */
    Donkeycraft.Flying.prototype.enableFlyMode = function() {
        var gameMode = this._player.getGameMode();

        // Only creative and spectator can fly
        if (gameMode !== 'creative' && gameMode !== 'spectator') {
            return false;
        }

        this._flyEnabled = true;
        if (this._player) {
            this._player.flyEnabled = true;
        }
        return true;
    };

    /**
     * Disable flying mode.
     * @returns {boolean} True if disabled successfully.
     */
    Donkeycraft.Flying.prototype.disableFlyMode = function() {
        this._flyEnabled = false;
        if (this._player) {
            this._player.flyEnabled = false;
        }
        return true;
    };

    /**
     * Get the current fly speed based on sprint state.
     * @returns {number} Speed in blocks per second.
     */
    Donkeycraft.Flying.prototype.getFlySpeed = function() {
        var isSprinting = this._input && typeof this._input.isKeyDown === 'function'
            ? this._input.isKeyDown(Config.KEYBINDS.SPRINT)
            : false;
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
        if (this._player) {
            this._player.flyEnabled = !!enabled;
        }
    };

    /**
     * Destroy the flying system and free resources.
     */
    Donkeycraft.Flying.prototype.destroy = function() {
        if (this._player) {
            this._player.flyEnabled = false;
            this._player = null;
        }
        this._input = null;
    };

})();