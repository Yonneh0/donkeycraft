// Donkeycraft — Jump Mechanics
// Jump mechanics: height, frequency, swing through blocks, water swimming.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Jumping — handles player jump mechanics (height, frequency, cooldown).
     * Swimming upward motion is handled by Movement._tickSurvival to avoid double-boost.
     * @param {Donkeycraft.Player} player - Player entity instance.
     * @param {Donkeycraft.Input} input - Input handler instance.
     * @param {Donkeycraft.Collision} collision - Collision detection instance.
     */
    Donkeycraft.Jumping = function (player, input, collision) {
        this._player = player;
        this._input = input;
        this._collision = collision;

        /**
         * Cooldown timer to prevent rapid double-jumps.
         * @type {number}
         * @private
         */
        this._jumpCooldown = 0;

        /**
         * Jump cooldown duration in seconds.
         * @type {number}
         * @private
         */
        this._jumpCooldownDuration = Config.JUMP_COOLDOWN;
    };

    /**
     * Main jump tick — called every game tick.
     * @param {number} deltaTime - Time since last tick in seconds.
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
     * @returns {boolean}
     */
    Donkeycraft.Jumping.prototype.canJump = function () {
        return this._player.onGround && this._jumpCooldown <= 0;
    };

    /**
     * Perform a jump — applies jump force to vertical velocity.
     * @returns {boolean} True if the jump was performed.
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
     * Check if the player is currently swimming upward.
     * @returns {boolean}
     */
    Donkeycraft.Jumping.prototype.isSwimmingUp = function () {
        var pos = this._player.getPosition();
        var inWater = this._collision.isBlockLiquid(pos.x, pos.y + 0.3, pos.z);
        return inWater && this._input.isKeyDown(Config.KEYBINDS.JUMP);
    };

    /**
     * Get the current jump force from config.
     * @returns {number} Jump force (blocks/s).
     */
    Donkeycraft.Jumping.prototype.getJumpForce = function () {
        return Config.PLAYER_JUMP_FORCE;
    };

    /**
     * Get the current jump cooldown remaining.
     * @returns {number} Cooldown in seconds.
     */
    Donkeycraft.Jumping.prototype.getCooldown = function () {
        return this._jumpCooldown;
    };

    /**
     * Destroy the jumping system and free resources.
     */
    Donkeycraft.Jumping.prototype.destroy = function () {
        this._player = null;
        this._input = null;
        this._collision = null;
    };

})();