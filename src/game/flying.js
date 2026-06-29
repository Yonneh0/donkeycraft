// Donkeycraft — Flying System
// Creative/spectator flying state management: enable/disable fly mode, speed queries.
// Physics application is handled by Movement._tickCreativeFly() to avoid duplicate velocity writes.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Flying — handles creative and spectator flying state management.
     *
     * Spectator mode always flies regardless of the `_flyEnabled` flag.
     * Creative mode requires the flag to be true (toggled via F key).
     * Physics application is delegated to Movement._tickCreativeFly() / _tickSpectator().
     * @param {Donkeycraft.Player} player - Player entity instance.
     * @param {Donkeycraft.Input} input - Input handler instance.
     */
    Donkeycraft.Flying = function (player, input) {
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
    Donkeycraft.Flying.prototype.tick = function (deltaTime) {
        // No physics here. Movement._tickCreativeFly() and _tickSpectator() handle velocity.
    };

    /**
     * Check if the player is currently flying.
     * Spectator mode always returns true (always flying).
     * Creative mode returns true only when flyEnabled is set.
     * @returns {boolean} True if flying is active.
     */
    Donkeycraft.Flying.prototype.isFlying = function () {
        var gameMode = this._player.getGameMode();
        // Spectators always fly — no flag check needed.
        if (gameMode === 'spectator') return true;
        // Creative mode requires explicit toggle.
        if (gameMode === 'creative') return this._flyEnabled;
        return false;
    };

    /**
     * Toggle flying mode on/off.
     * Creative mode: toggles the internal flag and player.flyEnabled.
     * Spectator mode: always flies — sets flag to true without toggling off.
     * @returns {boolean} True if the toggle was applied.
     */
    Donkeycraft.Flying.prototype.toggleFlyMode = function () {
        var gameMode = this._player.getGameMode();

        // Only creative and spectator can fly
        if (gameMode !== 'creative' && gameMode !== 'spectator') {
            return false;
        }

        // Spectators always fly — force flag to true, never toggle off
        if (gameMode === 'spectator') {
            this._flyEnabled = true;
            if (this._player) {
                this._player.flyEnabled = true;
            }
            return true;
        }

        // Creative mode: normal toggle
        this._flyEnabled = !this._flyEnabled;
        if (this._player) {
            this._player.flyEnabled = this._flyEnabled;
        }
        return true;
    };

    /**
     * Enable flying mode (creative/spectator only).
     * Spectator mode always flies; this sets the internal flag for consistency.
     * @returns {boolean} True if enabled successfully.
     */
    Donkeycraft.Flying.prototype.enableFlyMode = function () {
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
     * Disable flying mode (creative only).
     * Spectator mode cannot be disabled — always flies.
     * @returns {boolean} True if disabled successfully.
     */
    Donkeycraft.Flying.prototype.disableFlyMode = function () {
        var gameMode = this._player.getGameMode();

        // Spectators cannot disable flying
        if (gameMode === 'spectator') {
            return false;
        }

        this._flyEnabled = false;
        if (this._player) {
            this._player.flyEnabled = false;
        }
        return true;
    };

    /**
     * Get the current flying speed based on sprint state.
     * @returns {number} Flying speed in blocks per second.
     */
    Donkeycraft.Flying.prototype.getFlySpeed = function () {
        var isSprinting = this._input && typeof this._input.isKeyDown === 'function'
            ? this._input.isKeyDown(Config.KEYBINDS.SPRINT)
            : false;
        return isSprinting ? Config.PLAYER_FLY_SPEED_BOOST : Config.PLAYER_FLY_SPEED;
    };

    /**
     * Check if the player is in spectator mode (can clip through blocks).
     * @returns {boolean} True if game mode is spectator.
     */
    Donkeycraft.Flying.prototype.canSpectate = function () {
        return this._player.getGameMode() === 'spectator';
    };

    /**
     * Check if the player should clip through blocks (spectator mode only).
     * @returns {boolean} True if spectator mode is active.
     */
    Donkeycraft.Flying.prototype.shouldClipThroughBlocks = function () {
        return this._player.getGameMode() === 'spectator';
    };

    /**
     * Get the internal flying-enabled flag (creative only; spectators always fly).
     * @returns {boolean} True if creative flight is enabled.
     */
    Donkeycraft.Flying.prototype.isEnabled = function () {
        return this._flyEnabled;
    };

    /**
     * Set the internal flying-enabled flag (creative only; spectators always fly).
     * @param {boolean} enabled - True to enable creative flight, false to disable.
     */
    Donkeycraft.Flying.prototype.setEnabled = function (enabled) {
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
    Donkeycraft.Flying.prototype.destroy = function () {
        if (this._player) {
            this._player.flyEnabled = false;
            this._player = null;
        }
        this._input = null;
        this._flyEnabled = false;
    };

})();