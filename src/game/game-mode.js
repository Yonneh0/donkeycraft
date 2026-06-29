// Donkeycraft — Game Mode System
// Survival, Creative, and Spectator mode behaviors and restrictions.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * GameMode — manages game mode-specific behaviors and restrictions.
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.GameMode = function (player) {
        this._player = player;

        /**
         * Whether the player is currently in creative mode (infinite items).
         * @type {boolean}
         * @private
         */
        this._creativeInfinite = false;

        /**
         * Whether the player is in fly mode.
         * @type {boolean}
         * @private
         */
        this._creativeFlying = false;

        /**
         * Event subscribers for tick updates.
         * @type {Array<Function>}
         * @private
         */
        this._subscribers = [];
    };

    /**
     * Get the current game mode.
     * @returns {string} 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.GameMode.prototype.getGameMode = function () {
        return this._player.gameMode;
    };

    /**
     * Set the game mode.
     * @param {string} mode - 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.GameMode.prototype.setGameMode = function (mode) {
        var validModes = ['survival', 'creative', 'spectator'];
        if (validModes.indexOf(mode) === -1) {
            return; // Invalid mode — ignore
        }

        var oldMode = this._player.gameMode;
        this._player.gameMode = mode;

        // Handle mode-specific transitions
        if (mode === 'survival') {
            this._creativeFlying = false;
            this._creativeInfinite = false;
        } else if (mode === 'creative') {
            this._creativeInfinite = true;
            // Don't auto-enable flying, just allow it
        } else if (mode === 'spectator') {
            this._creativeFlying = false;
            this._creativeInfinite = false;
        }

        // Emit game mode change event via global EventBus
        if (EventBus && oldMode !== mode) {
            try {
                EventBus.emitSafe('gameMode:changed', {
                    oldMode: oldMode,
                    newMode: mode
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Check if the current game mode is Survival.
     * @returns {boolean}
     */
    Donkeycraft.GameMode.prototype.isSurvival = function () {
        return this._player.gameMode === 'survival';
    };

    /**
     * Check if the current game mode is Creative.
     * @returns {boolean}
     */
    Donkeycraft.GameMode.prototype.isCreative = function () {
        return this._player.gameMode === 'creative';
    };

    /**
     * Check if the current game mode is Spectator.
     * @returns {boolean}
     */
    Donkeycraft.GameMode.prototype.isSpectator = function () {
        return this._player.gameMode === 'spectator';
    };

    /**
     * Check if the player can take damage in the current game mode.
     * @returns {boolean} False for creative mode.
     */
    Donkeycraft.GameMode.prototype.canTakeDamage = function () {
        return this._player.gameMode !== 'creative';
    };

    /**
     * Check if the player can place blocks in the current game mode.
     * @returns {boolean} False for spectator mode.
     */
    Donkeycraft.GameMode.prototype.canPlaceBlocks = function () {
        return this._player.gameMode !== 'spectator';
    };

    /**
     * Check if the player can break blocks in the current game mode.
     * @returns {boolean} False for spectator mode.
     */
    Donkeycraft.GameMode.prototype.canBreakBlocks = function () {
        return this._player.gameMode !== 'spectator';
    };

    /**
     * Check if the player has infinite items (creative mode).
     * @returns {boolean} True for creative mode.
     */
    Donkeycraft.GameMode.prototype.hasInfiniteItems = function () {
        return this._player.gameMode === 'creative';
    };

    /**
     * Toggle creative flying mode.
     * @returns {boolean} True if flying was toggled successfully.
     */
    Donkeycraft.GameMode.prototype.toggleCreativeFly = function () {
        if (this._player.gameMode !== 'creative') {
            return false; // Only creative can toggle fly
        }

        this._creativeFlying = !this._creativeFlying;
        this._player.flyEnabled = this._creativeFlying;

        // Emit fly mode change event via global EventBus
        if (EventBus) {
            try {
                EventBus.emitSafe('flyMode:changed', {
                    flying: this._creativeFlying
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }

        return true;
    };

    /**
     * Enable creative flying mode.
     * @returns {boolean} True if enabled successfully.
     */
    Donkeycraft.GameMode.prototype.enableCreativeFly = function () {
        if (this._player.gameMode !== 'creative') {
            return false;
        }

        this._creativeFlying = true;
        this._player.flyEnabled = true;

        return true;
    };

    /**
     * Disable creative flying mode.
     * @returns {boolean} True if disabled successfully.
     */
    Donkeycraft.GameMode.prototype.disableCreativeFly = function () {
        this._creativeFlying = false;
        this._player.flyEnabled = false;

        return true;
    };

    /**
     * Check if creative flying is enabled.
     * @returns {boolean}
     */
    Donkeycraft.GameMode.prototype.isCreativeFlying = function () {
        return this._creativeFlying;
    };

    /**
     * Check if the player can interact with blocks (right-click).
     * @returns {boolean} False for spectator mode.
     */
    Donkeycraft.GameMode.prototype.canInteract = function () {
        return this._player.gameMode !== 'spectator';
    };

    /**
     * Check if the player can pick up items.
     * @returns {boolean} True for survival and creative, false for spectator.
     */
    Donkeycraft.GameMode.prototype.canPickupItems = function () {
        return this._player.gameMode !== 'spectator';
    };

    /**
     * Check if the player can be damaged by entities.
     * @returns {boolean} False for creative mode.
     */
    Donkeycraft.GameMode.prototype.isVulnerable = function () {
        // Delegate to canTakeDamage() to avoid duplication
        return this.canTakeDamage();
    };

    /**
     * Tick the game mode system — handle mode-specific logic.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.GameMode.prototype.tick = function (deltaTime) {
        // Call registered subscribers
        for (var i = 0; i < this._subscribers.length; i++) {
            try {
                this._subscribers[i](deltaTime);
            } catch (e) {
                // Subscriber threw — skip it
            }
        }
    };

    /**
     * Register a subscriber to be notified each tick.
     * @param {Function} callback - Function called with (deltaTime) each tick.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GameMode.prototype.onTick = function (callback) {
        this._subscribers.push(callback);
        return function () {
            var idx = this._subscribers.indexOf(callback);
            if (idx !== -1) {
                this._subscribers.splice(idx, 1);
            }
        }.bind(this);
    };

    /**
     * Get the item stack limit for creative mode.
     * @returns {number} Maximum stack size (64 for creative, normal for others).
     */
    Donkeycraft.GameMode.prototype.getStackLimit = function () {
        if (this._player.gameMode === 'creative') {
            return 64; // Creative always uses max stack
        }
        return 64; // Most items stack to 64 anyway
    };

    /**
     * Destroy the game mode system and free resources.
     */
    Donkeycraft.GameMode.prototype.destroy = function () {
        this._player = null;
        this._subscribers = [];
    };

})();