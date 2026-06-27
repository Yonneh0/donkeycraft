// Donkeycraft — Experience System
// XP levels, points, orb pickup, and spending for enchanting costs.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * Experience — manages player XP levels, points, and total accumulation.
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.Experience = function(player) {
        this._player = player;

        /**
         * Current XP level.
         * @type {number}
         * @private
         */
        this._level = 0;

        /**
         * XP points within the current level (0 to level threshold).
         * @type {number}
         * @private
         */
        this._points = 0;

        /**
         * Total XP ever accumulated (never decreases, used for achievements).
         * @type {number}
         * @private
         */
        this._totalXP = 0;
    };

    /**
     * Get the current XP level.
     * @returns {number}
     */
    Donkeycraft.Experience.prototype.getLevel = function() {
        return this._level;
    };

    /**
     * Set the XP level.
     * @param {number} level - Level to set (clamped to >= 0).
     */
    Donkeycraft.Experience.prototype.setLevel = function(level) {
        this._level = Math.max(0, level);
    };

    /**
     * Get the XP points within the current level.
     * @returns {number}
     */
    Donkeycraft.Experience.prototype.getPoints = function() {
        return this._points;
    };

    /**
     * Set the XP points within the current level.
     * @param {number} points - Points to set (clamped to >= 0).
     */
    Donkeycraft.Experience.prototype.setPoints = function(points) {
        this._points = Math.max(0, points);
    };

    /**
     * Get the total XP ever accumulated.
     * @returns {number}
     */
    Donkeycraft.Experience.prototype.getTotalXP = function() {
        return this._totalXP;
    };

    /**
     * Get the XP point threshold needed to reach the next level.
     * @returns {number} Points needed for next level.
     */
    Donkeycraft.Experience.prototype.getLevelThreshold = function() {
        // Minecraft formula:
        // Levels 0-16: 7 + level * 2
        // Levels 17+: 37 + (level - 16) * 3
        if (this._level <= 16) {
            return 7 + this._level * 2;
        } else {
            return 37 + (this._level - 16) * 3;
        }
    };

    /**
     * Get the progress toward the next level as a fraction (0-1).
     * @returns {number} Progress fraction.
     */
    Donkeycraft.Experience.prototype.getProgressToNextLevel = function() {
        var threshold = this.getLevelThreshold();
        if (threshold <= 0) {
            return 1;
        }
        return this._points / threshold;
    };

    /**
     * Add XP points/levels to the player.
     * @param {number} amount - Amount of XP to add.
     */
    Donkeycraft.Experience.prototype.addXP = function(amount) {
        amount = Math.floor(amount);
        if (amount <= 0) {
            return;
        }

        this._totalXP += amount;

        var remaining = this._points + amount;
        var threshold = this.getLevelThreshold();

        // Level up while we have enough points
        while (remaining >= threshold) {
            remaining -= threshold;
            this._level++;
            threshold = this.getLevelThreshold();
        }

        this._points = remaining;

        // Emit XP change event
        if (EventBus) {
            try {
                EventBus.emit('xp:changed', {
                    level: this._level,
                    points: this._points,
                    totalXP: this._totalXP
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Spend XP points. Returns true if enough points were available and spent.
     * Only spends from current level points — does not reduce levels.
     * @param {number} amount - Amount of XP to spend.
     * @returns {boolean} True if XP was spent successfully.
     */
    Donkeycraft.Experience.prototype.spendXP = function(amount) {
        amount = Math.floor(amount);
        if (amount <= 0) {
            return false;
        }

        // Only spend from current points
        if (this._points < amount) {
            return false;
        }

        this._points -= amount;

        // Emit XP change event
        if (EventBus) {
            try {
                EventBus.emit('xp:spent', {
                    level: this._level,
                    points: this._points,
                    cost: amount
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }

        return true;
    };

    /**
     * Pick up an XP orb.
     * @param {number} amount - XP orb value to pick up.
     */
    Donkeycraft.Experience.prototype.pickupOrb = function(amount) {
        this.addXP(amount);

        // Emit orb pickup event
        if (EventBus) {
            try {
                EventBus.emit('xp:orb', {
                    amount: amount,
                    level: this._level,
                    points: this._points
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Set XP to a specific level with 0 points.
     * @param {number} level - Level to set.
     */
    Donkeycraft.Experience.prototype.setLevelToZero = function(level) {
        this._level = Math.max(0, level);
        this._points = 0;
    };

    /**
     * Get the total XP value of current levels + points.
     * @returns {number} Total XP value.
     */
    Donkeycraft.Experience.prototype.getTotalXPValue = function() {
        // Convert points to equivalent XP value using inverse of level formula
        var total = this._level * 7; // Each level is worth ~7 XP on average
        total += this._points;

        // Add the cumulative cost of all levels
        for (var i = 0; i < this._level; i++) {
            if (i <= 15) {
                total += 7 + i * 2;
            } else {
                total += 37 + (i - 16) * 3;
            }
        }

        return total;
    };

    /**
     * Serialize XP state for save/load.
     * @returns {object} Serialized state.
     */
    Donkeycraft.Experience.prototype.serialize = function() {
        return {
            level: this._level,
            points: this._points,
            totalXP: this._totalXP
        };
    };

    /**
     * Deserialize XP state from saved data.
     * @param {object} data - Serialized state.
     */
    Donkeycraft.Experience.prototype.fromObject = function(data) {
        if (data.level !== undefined) {
            this._level = Math.max(0, data.level);
        }
        if (data.points !== undefined) {
            this._points = Math.max(0, data.points);
        }
        if (data.totalXP !== undefined) {
            this._totalXP = Math.max(0, data.totalXP);
        }
    };

    /**
     * Reset XP to zero.
     */
    Donkeycraft.Experience.prototype.reset = function() {
        this._level = 0;
        this._points = 0;
        this._totalXP = 0;
    };

    /**
     * Destroy the experience system and free resources.
     */
    Donkeycraft.Experience.prototype.destroy = function() {
        this._player = null;
    };

})();