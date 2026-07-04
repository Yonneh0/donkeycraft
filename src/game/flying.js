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
     * Physics application is delegated to Movement._tickCreativeFly() / _tickSpectator()
     * to avoid duplicate velocity writes — this module manages state only.
     * 
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
     * This method performs state management only; actual physics/velocity application
     * is delegated to `Movement._tickCreativeFly()` and `Movement._tickSpectator()`.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Flying.prototype.tick = function (deltaTime) {
        // No physics here. Movement._tickCreativeFly() and _tickSpectator() handle velocity.
    };

    /**
     * Check if the player is currently flying.
     * 
     * **Spectator mode**: Always returns `true` — spectators cannot disable flight.
     * **Creative mode**: Returns `true` only when `_flyEnabled` flag is set (toggled via F key).
     * **Survival mode**: Always returns `false`.
     * 
     * @returns {boolean} True if flying is currently active.
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
     * 
     * **Creative mode**: Toggles the internal `_flyEnabled` flag and `player.flyEnabled`.
     * If currently flying (`_flyEnabled === true`), disables flight. If not flying, enables it.
     * 
     * **Spectator mode**: Always sets the flag to `true` without toggling off.
     * Spectators cannot disable flight — this method always returns `true` and never disables.
     * 
     * **Survival mode**: Returns `false` — cannot enable flying in survival.
     * 
     * @returns {boolean} True if the operation was applied (always true for creative/spectator, false for survival).
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
     * 
     * **Creative mode**: Sets `_flyEnabled` to `true` and updates `player.flyEnabled`.
     * **Spectator mode**: Also sets the flag to `true` for consistency, though spectators
     * always fly regardless of this flag.
     * **Survival mode**: Returns `false` — cannot enable flying in survival.
     * 
     * @returns {boolean} True if enabled successfully; false for survival mode.
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
     * Disable flying mode (creative mode only).
     * 
     * **Creative mode**: Sets `_flyEnabled` to `false` and updates `player.flyEnabled`.
     * **Spectator mode**: Returns `false` — spectators cannot disable flight.
     * **Survival mode**: Returns `false` — not flying to begin with, nothing to disable.
     * 
     * @returns {boolean} True if disabled successfully; false for spectator/survival modes.
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
     * Get the current flying speed in blocks per second.
     * 
     * In creative/spectator fly mode, `ShiftLeft` controls vertical descent (not horizontal
     * sprint), so there is no horizontal sprint boost — this method always returns the
     * base fly speed from config (`Config.PLAYER_FLY_SPEED`). Actual velocity application
     * with sprint-flying boost logic is handled by `Movement._tickCreativeFly()`.
     * 
     * @returns {number} Flying speed in blocks per second (from `Config.PLAYER_FLY_SPEED`).
     */
    Donkeycraft.Flying.prototype.getFlySpeed = function () {
        return Config.PLAYER_FLY_SPEED;
    };

    /**
     * Check if the player is in spectator mode (can clip through blocks).
     * Spectator mode always returns `true`; creative and survival return `false`.
     * @returns {boolean} True if game mode is spectator.
     */
    Donkeycraft.Flying.prototype.canSpectate = function () {
        return this._player.getGameMode() === 'spectator';
    };

    /**
     * Check if the player should clip through blocks (spectator mode only).
     * In spectator mode, collision resolution is skipped entirely in `Movement._tickSpectator()`.
     * @returns {boolean} True if spectator mode is active.
     */
    Donkeycraft.Flying.prototype.shouldClipThroughBlocks = function () {
        return this._player.getGameMode() === 'spectator';
    };

    /**
     * Get the internal flying-enabled flag.
     * 
     * For **creative mode**, this reflects whether flight has been toggled on via F key.
     * For **spectator mode**, this always returns `true` — spectators cannot disable flight.
     * For **survival mode**, this always returns `false`.
     * 
     * @returns {boolean} True if creative flight is enabled, spectator mode is active, or false for survival.
     */
    Donkeycraft.Flying.prototype.isEnabled = function () {
        // Spectators always fly — return true regardless of internal flag
        if (this._player.getGameMode() === 'spectator') return true;
        return this._flyEnabled;
    };

    /**
     * Set the internal flying-enabled flag.
     * 
     * For **creative mode**, this controls whether flight is active.
     * For **spectator mode**, this also sets the flag for consistency (though spectators
     * always fly regardless of this flag).
     * For **survival mode**, this has no effect — survival cannot fly.
     * 
     * @param {boolean} enabled - True to enable flight, false to disable.
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