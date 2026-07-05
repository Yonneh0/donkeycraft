// Donkeycraft — Hunger System
// Food and hydration state holder with UI event emission.
// All vitals (food, hydration) are stored on the Player object — this class delegates to it.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * Hunger — manages player food and hydration as a thin compatibility layer.
     *
     * All state is stored on the Player object. This class provides:
     * - Convenience methods for adding/subtracting food/hydration
     * - UI event emission (hunger:changed)
     * - Backward compatibility with existing code that references Hunger
     *
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.Hunger = function (player) {
        this._player = player;
    };

    /**
     * @deprecated setHurtBox has been removed. Vitals are now stored on Player directly.
     */
    Donkeycraft.Hunger.prototype.setHurtBox = function () {
        // No-op: HurtBox removed, vitals delegated to Player
    };

    // ============================================================
    // Food Level — Delegates to Player
    // ============================================================

    /**
     * Get the current food level.
     * @returns {number} Food level (0-12).
     */
    Donkeycraft.Hunger.prototype.getFoodLevel = function () {
        return this._player.getFoodLevel();
    };

    /**
     * Set the food level.
     * @param {number} level - Food level to set (0-12).
     */
    Donkeycraft.Hunger.prototype.setFoodLevel = function (level) {
        this._player.setFoodLevel(level);
    };

    /**
     * Add food to the player's hunger bar.
     * Amount is clamped internally so the final value never exceeds [0, 12].
     * Emits a `hunger:changed` event for UI updates.
     * @param {number} amount - Food points to add (positive number).
     */
    Donkeycraft.Hunger.prototype.addFood = function (amount) {
        this._player.adjustFoodLevel(amount);
    };

    /**
     * Subtract food from the player's hunger bar.
     * Amount is clamped internally so the final value never goes below 0.
     * Emits a `hunger:changed` event for UI updates.
     * @param {number} amount - Food points to subtract (positive number).
     */
    Donkeycraft.Hunger.prototype.subtractFood = function (amount) {
        this._player.adjustFoodLevel(-amount);
    };

    /**
     * Check if the player is starving (food level = 0).
     * @returns {boolean} True if food level is at zero.
     */
    Donkeycraft.Hunger.prototype.isStarving = function () {
        return this._player.isStarving();
    };

    /**
     * Check if the player has any food remaining.
     * @returns {boolean} True if food level is greater than zero.
     */
    Donkeycraft.Hunger.prototype.hasFood = function () {
        return this._player.hasFood();
    };

    // ============================================================
    // Hydration — Delegates to Player
    // ============================================================

    /**
     * Get the current hydration level.
     * @returns {number} Hydration level (0-6).
     */
    Donkeycraft.Hunger.prototype.getHydration = function () {
        return this._player.getHydration();
    };

    /**
     * Set the hydration level.
     * @param {number} hydration - Hydration value to set (0-6).
     */
    Donkeycraft.Hunger.prototype.setHydration = function (hydration) {
        this._player.setHydration(hydration);
    };

    /**
     * Add hydration to the player's hydration bar.
     * Amount is clamped internally so the final value never exceeds [0, 6].
     * Emits a `hunger:changed` event for UI updates.
     * @param {number} amount - Hydration points to add (positive number).
     */
    Donkeycraft.Hunger.prototype.addHydration = function (amount) {
        this._player.adjustHydration(amount);
    };

    /**
     * Subtract hydration from the player's hydration bar.
     * Amount is clamped internally so the final value never goes below 0.
     * Emits a `hunger:changed` event for UI updates.
     * @param {number} amount - Hydration points to subtract (positive number).
     */
    Donkeycraft.Hunger.prototype.subtractHydration = function (amount) {
        this._player.adjustHydration(-amount);
    };

    // ============================================================
    // Tick — No longer handles starvation/regeneration (moved to Player.tickVitals)
    // ============================================================

    /**
     * Tick the hunger system.
     * Starvation and regeneration are now handled by Player.tickVitals().
     * This method is a no-op retained for backward compatibility.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Hunger.prototype.tick = function (deltaTime) {
        // No-op: starvation and regeneration are handled by Player.tickVitals()
        // This method is retained for backward compatibility with game.js tick order
    };

    // ============================================================
    // Reset — Delegates to Player
    // ============================================================

    /**
     * Reset the hunger system to full state.
     * Delegates to player.resetVitals().
     */
    Donkeycraft.Hunger.prototype.reset = function () {
        this._player.resetVitals();
    };

    /**
     * Destroy the hunger system and free references.
     */
    Donkeycraft.Hunger.prototype.destroy = function () {
        this._player = null;
    };

})();