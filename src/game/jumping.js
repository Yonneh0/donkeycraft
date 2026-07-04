// Donkeycraft — Jump Mechanics
// Jump mechanics: height, frequency, cooldown, and jump state queries.
// Swimming upward motion is handled by Movement._tickSurvival to avoid double-boost with jump.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Jumping — handles player jump mechanics (height, frequency, cooldown).
     *
     * Features:
     * - Ground-based jumping with configurable force
     * - Cooldown timer to prevent rapid double-jumps
     * - Game mode awareness (no jumping in creative fly or spectator)
     * - Swimming upward is handled separately by Movement._tickSurvival()
     *
     * @param {Donkeycraft.Player} player — Player entity instance.
     * @param {Donkeycraft.Input} input — Input handler (for JUMP key detection).
     */
    Donkeycraft.Jumping = function (player, input) {
        this._player = player;
        this._input = input;

        /**
         * Remaining cooldown time in seconds before the player can jump again.
         * @type {number}
         * @private
         */
        this._jumpCooldown = 0;

        /**
         * Jump cooldown duration in seconds (from config).
         * Prevents rapid double-jumps and bounce exploits.
         * @type {number}
         * @private
         */
        this._jumpCooldownDuration = Config.JUMP_COOLDOWN;
    };

    /**
     * Main jump tick — called every game tick.
     *
     * Updates the jump cooldown timer and checks for jump input.
     * If the player is on ground, not dead, and cooldown has expired,
     * the jump is performed automatically.
     *
     * Game mode behavior:
     * - **Survival**: Normal jumping with gravity-based physics
     * - **Creative (flying)**: No jumping — vertical controlled by Space/Shift
     * - **Spectator**: No jumping — always flying
     * - **Dead**: No jumping regardless of game mode
     *
     * @param {number} deltaTime — Time since last tick in seconds.
     */
    Donkeycraft.Jumping.prototype.tick = function (deltaTime) {
        var player = this._player;
        var input = this._input;

        // If dead, no jumping
        if (!player.isAlive()) {
            return;
        }

        var gameMode = player.getGameMode();

        // Spectator mode: no jumping
        if (gameMode === 'spectator') {
            return;
        }

        // Creative flying: no gravity-based jumping
        if (gameMode === 'creative' && player.flyEnabled) {
            return;
        }

        // Update jump cooldown
        if (this._jumpCooldown > 0) {
            this._jumpCooldown -= deltaTime;
        }

        // Check for jump input
        var jumpPressed = input.isKeyDown(Config.KEYBINDS.JUMP);

        // Normal jump (on ground) — swimming boost is handled by Movement._tickSurvival
        if (jumpPressed && player.onGround && this._jumpCooldown <= 0) {
            this.performJump();
        }
    };

    /**
     * Check if the player can jump (on ground and cooldown expired).
     * 
     * @returns {boolean} True if the player is on ground and jump cooldown has expired.
     */
    Donkeycraft.Jumping.prototype.canJump = function () {
        return this._player.onGround && this._jumpCooldown <= 0;
    };

    /**
     * Perform a jump — applies jump force to vertical velocity.
     *
     * Only succeeds if the player is on ground (`player.onGround === true`).
     * Applies `Config.PLAYER_JUMP_FORCE` as instantaneous vertical velocity,
     * then sets the cooldown timer to prevent rapid double-jumps.
     *
     * @returns {boolean} True if the jump was performed (player was on ground).
     */
    Donkeycraft.Jumping.prototype.performJump = function () {
        var player = this._player;

        // Can only jump if on ground
        if (!player.onGround) {
            return false;
        }

        // Apply jump force
        var jumpForce = Config.PLAYER_JUMP_FORCE;
        player.setVelocity(
            player.getVelocity().x,
            jumpForce,
            player.getVelocity().z
        );

        // Set cooldown to prevent rapid double-jumps
        this._jumpCooldown = this._jumpCooldownDuration;

        return true;
    };

    /**
     * Get the current jump force from config.
     * 
     * @returns {number} Jump force in blocks/s (from `Config.PLAYER_JUMP_FORCE`).
     */
    Donkeycraft.Jumping.prototype.getJumpForce = function () {
        return Config.PLAYER_JUMP_FORCE;
    };

    /**
     * Get the current jump cooldown remaining.
     * 
     * @returns {number} Remaining cooldown time in seconds (0 if ready to jump).
     */
    Donkeycraft.Jumping.prototype.getCooldown = function () {
        return this._jumpCooldown;
    };

    /**
     * Destroy the jumping system and free internal references.
     * Call this when the game is shutting down to prevent memory leaks.
     */
    Donkeycraft.Jumping.prototype.destroy = function () {
        this._player = null;
        this._input = null;
    };

})();