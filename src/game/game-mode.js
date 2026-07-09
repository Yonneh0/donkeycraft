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
   * Set the game mode and handle mode-specific transitions.
   *
   * Transitions:
   * - **Survival**: Disables flying, disables infinite items, syncs `player.flyEnabled = false`
   * - **Creative**: Enables infinite items, syncs `_creativeFlying` from `player.flyEnabled`
   * - **Spectator**: Disables creative flags, enables flying (`player.flyEnabled = true`)
   *
   * Emits a `gameMode:changed` event via EventBus on successful mode change.
   *
   * @param {string} mode - 'survival', 'creative', or 'spectator'.
   */
  Donkeycraft.GameMode.prototype.setGameMode = function (mode) {
    var validModes = ['survival', 'creative', 'spectator'];
    if (validModes.indexOf(mode) === -1) {
      return; // Invalid mode — ignore
    }

    var oldMode = this._player.gameMode;
    this._player.gameMode = mode;

    // Handle mode-specific transitions — keep internal state synced with player entity
    if (mode === 'survival') {
      this._creativeFlying = false;
      this._creativeInfinite = false;
      this._player.flyEnabled = false; // Explicit sync: survival cannot fly
      // Reset fall distance when switching from creative to survival.
      // In creative mode, players can fall any distance without damage —
      // so maxFallDistance may be stale/meaningless when entering survival.
      this._player.maxFallDistance = 0;
    } else if (mode === 'creative') {
      this._creativeInfinite = true;
      // Sync internal flag from player entity state — don't force-enable flying,
      // just reflect whatever the current player.flyEnabled value is.
      this._creativeFlying = !!this._player.flyEnabled;
    } else if (mode === 'spectator') {
      this._creativeFlying = false;
      this._creativeInfinite = false;
      this._player.flyEnabled = true; // Explicit sync: spectator always flies
    }

    // Emit game mode change event via global EventBus
    if (EventBus && oldMode !== mode) {
      try {
        EventBus.emitSafe('gameMode:changed', {
          oldMode: oldMode,
          newMode: mode,
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
   * Toggle creative flying mode on/off (creative mode only).
   * In spectator mode, this returns false — spectators always fly without toggling.
   * Emits a `flyMode:changed` event via EventBus when the state changes.
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
          flying: this._creativeFlying,
        });
      } catch (e) {
        // EventBus may not be available in tests
      }
    }

    return true;
  };

  /**
   * Enable creative flying mode (creative mode only).
   * Spectator mode always flies — this method returns false for spectators.
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
   * Disable creative flying mode (creative mode only).
   * Spectator mode cannot be disabled — always flies. Returns false for spectators.
   * Survival mode returns false — not flying to begin with, nothing to disable.
   *
   * @returns {boolean} True if disabled successfully; false for spectator/survival modes.
   */
  Donkeycraft.GameMode.prototype.disableCreativeFly = function () {
    // Spectators and survival cannot disable flying (spectator always flies, survival can't fly)
    if (this._player.gameMode !== 'creative') {
      return false;
    }

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
   * Get the item stack limit for the current game mode.
   * Returns 64 for all modes since most stackable items have a maximum stack size of 64
   * regardless of game mode (creative, survival, or spectator).
   * @returns {number} Maximum stack size (always 64).
   */
  Donkeycraft.GameMode.prototype.getStackLimit = function () {
    return 64;
  };

  /**
   * Destroy the game mode system and free resources.
   */
  Donkeycraft.GameMode.prototype.destroy = function () {
    this._player = null;
    this._subscribers = [];
  };
})();
