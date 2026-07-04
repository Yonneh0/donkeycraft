// Donkeycraft — Experience System
// XP levels, points, orb pickup, and spending for enchanting costs.
// Progression formula: TotalXP = ceil(((Level+5)^5 - 7776) / 9) for levels ≤ 126
// Level 2 total XP is hardcoded to 1000 (formula gives 1004).
// Maximum level is 100 — all XP gains are ignored at max level.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * Experience — manages player XP levels, points, and total accumulation.
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.Experience = function (player) {
        this._player = player;

        /**
         * Current XP level (starts at 1).
         * @type {number}
         * @private
         */
        this._level = 1;

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

    // ============================================================
    // Static properties — assigned after constructor is defined
    // ============================================================

    /**
     * MAX_LEVEL — The maximum achievable player level.
     * @type {number}
     */
    Donkeycraft.Experience.MAX_LEVEL = 100;

    /**
     * _computeTotalXPAtLevel — compute the cumulative XP required to reach a given level.
     * Level 2 total is hardcoded to 1000; all other levels use the formula:
     *   TotalXP = ceil(((Level+5)^5 - 7776) / 9)
     * @private
     * @param {number} level - Target level.
     * @returns {number} Cumulative XP needed to reach this level from level 1.
     */
    Donkeycraft.Experience._computeTotalXPAtLevel = function (level) {
        if (level <= 1) return 0;
        if (level === 2) return 1000; // Hardcoded override (formula gives 1004)
        // Formula: ceil(((level+5)^5 - 7776) / 9)
        var raw = (Math.pow(level + 5, 5) - 7776) / 9;
        return Math.ceil(raw);
    };

    /**
     * Get the current XP level.
     * @returns {number}
     */
    Donkeycraft.Experience.prototype.getLevel = function () {
        return this._level;
    };

    /**
     * Set the XP level. Clamped to [1, MAX_LEVEL] internally.
     * @param {number} level - Level to set.
     */
    Donkeycraft.Experience.prototype.setLevel = function (level) {
        // Clamp to valid range internally — debug overlay can call with any value
        var clampedLevel = Math.max(1, Math.min(Donkeycraft.Experience.MAX_LEVEL, Math.floor(level)));
        this._level = clampedLevel;

        // Recalculate points based on total XP accumulated so far
        this._recalcPointsFromTotalXP();

        // Emit XP change event so UI updates
        if (EventBus) {
            try {
                EventBus.emitSafe('xp:changed', {
                    level: this._level,
                    points: this._points,
                    totalXP: this._totalXP
                });
            } catch (e) { }
        }
    };

    /**
     * Get the XP points within the current level.
     * @returns {number}
     */
    Donkeycraft.Experience.prototype.getPoints = function () {
        return this._points;
    };

    /**
     * Set the XP points within the current level. Clamped to [0, threshold) internally.
     * @param {number} points - Points to set.
     */
    Donkeycraft.Experience.prototype.setPoints = function (points) {
        var clamped = Math.max(0, Math.floor(points));
        var threshold = this.getLevelThreshold();
        if (this._level < Donkeycraft.Experience.MAX_LEVEL) {
            clamped = Math.min(clamped, threshold);
        } else {
            clamped = threshold; // At max level, points = threshold (full bar)
        }
        this._points = clamped;
    };

    /**
     * Get the total XP ever accumulated.
     * @returns {number}
     */
    Donkeycraft.Experience.prototype.getTotalXP = function () {
        return this._totalXP;
    };

    /**
     * Get the XP point threshold needed to reach the next level.
     * At max level (100), returns Infinity — no further leveling possible.
     * @returns {number} Points needed for next level, or Infinity at max level.
     */
    Donkeycraft.Experience.prototype.getLevelThreshold = function () {
        if (this._level >= Donkeycraft.Experience.MAX_LEVEL) {
            return Infinity;
        }
        var nextTotal = Donkeycraft.Experience._computeTotalXPAtLevel(this._level + 1);
        var currentTotal = Donkeycraft.Experience._computeTotalXPAtLevel(this._level);
        return nextTotal - currentTotal;
    };

    /**
     * Get the progress toward the next level as a fraction (0-1).
     * Returns 1.0 at max level.
     * @returns {number} Progress fraction clamped to [0, 1].
     */
    Donkeycraft.Experience.prototype.getProgressToNextLevel = function () {
        if (this._level >= Donkeycraft.Experience.MAX_LEVEL) {
            return 1.0;
        }
        var threshold = this.getLevelThreshold();
        if (threshold <= 0) {
            return 1.0;
        }
        return Math.min(this._points / threshold, 1.0);
    };

    /**
     * Add XP points/levels to the player.
     * At max level (100), all XP gains are silently ignored.
     * @param {number} amount - Amount of XP to add.
     */
    Donkeycraft.Experience.prototype.addXP = function (amount) {
        // Clamp: no XP gain at max level
        if (this._level >= Donkeycraft.Experience.MAX_LEVEL) {
            return;
        }

        amount = Math.floor(amount);
        if (amount <= 0) {
            return;
        }

        this._totalXP += amount;

        var remaining = this._points + amount;
        var threshold = this.getLevelThreshold();

        // Level up while we have enough points
        while (this._level < Donkeycraft.Experience.MAX_LEVEL && remaining >= threshold) {
            remaining -= threshold;
            this._level++;
            if (this._level >= Donkeycraft.Experience.MAX_LEVEL) {
                // At max level, cap points at threshold
                remaining = threshold;
                break;
            }
            threshold = this.getLevelThreshold();
        }

        this._points = remaining;

        // Emit XP change event via global EventBus
        if (EventBus) {
            try {
                EventBus.emitSafe('xp:changed', {
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
    Donkeycraft.Experience.prototype.spendXP = function (amount) {
        amount = Math.floor(amount);
        if (amount <= 0) {
            return false;
        }

        // Only spend from current points
        if (this._points < amount) {
            return false;
        }

        this._points -= amount;

        // Emit XP change event via global EventBus
        if (EventBus) {
            try {
                EventBus.emitSafe('xp:spent', {
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
    Donkeycraft.Experience.prototype.pickupOrb = function (amount) {
        this.addXP(amount);

        // Emit orb pickup event via global EventBus
        if (EventBus) {
            try {
                EventBus.emitSafe('xp:orb', {
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
     * Recalculate points based on current level and total XP accumulated.
     * Used internally by setLevel() to keep points consistent with level changes.
     * @private
     */
    Donkeycraft.Experience.prototype._recalcPointsFromTotalXP = function () {
        var currentLevelTotal = Donkeycraft.Experience._computeTotalXPAtLevel(this._level);
        var nextLevelTotal = Donkeycraft.Experience._computeTotalXPAtLevel(this._level + 1);

        if (this._totalXP <= currentLevelTotal) {
            this._points = 0;
        } else if (this._totalXP >= nextLevelTotal) {
            this._points = nextLevelTotal - currentLevelTotal;
        } else {
            this._points = this._totalXP - currentLevelTotal;
        }

        // Clamp at max level
        if (this._level >= Donkeycraft.Experience.MAX_LEVEL) {
            this._points = nextLevelTotal - currentLevelTotal;
        }
    };

    /**
     * Get the total XP value of current levels + points.
     * Calculates cumulative cost of all levels earned plus current points.
     * @returns {number} Total XP value.
     */
    Donkeycraft.Experience.prototype.getTotalXPValue = function () {
        return this._totalXP;
    };

    /**
     * Set XP to a specific level with 0 points. Clamped to [1, MAX_LEVEL].
     * Also resets totalXP to the cumulative value for that level.
     * @param {number} level - Level to set.
     */
    Donkeycraft.Experience.prototype.setLevelToZero = function (level) {
        var clampedLevel = Math.max(1, Math.min(Donkeycraft.Experience.MAX_LEVEL, Math.floor(level)));
        this._level = clampedLevel;
        this._points = 0;
        this._totalXP = Donkeycraft.Experience._computeTotalXPAtLevel(this._level);

        // Emit XP change event so UI updates
        if (EventBus) {
            try {
                EventBus.emitSafe('xp:changed', {
                    level: this._level,
                    points: this._points,
                    totalXP: this._totalXP
                });
            } catch (e) { }
        }
    };

    /**
     * Serialize XP state for save/load.
     * @returns {object} Serialized state.
     */
    Donkeycraft.Experience.prototype.serialize = function () {
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
    Donkeycraft.Experience.prototype.fromObject = function (data) {
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
     * Reset XP to level 1 with 0 points.
     */
    Donkeycraft.Experience.prototype.reset = function () {
        this._level = 1;
        this._points = 0;
        this._totalXP = 0;

        // Emit XP change event so UI updates
        if (EventBus) {
            try {
                EventBus.emitSafe('xp:changed', {
                    level: this._level,
                    points: this._points,
                    totalXP: this._totalXP
                });
            } catch (e) { }
        }
    };

    /**
     * Destroy the experience system and free resources.
     */
    Donkeycraft.Experience.prototype.destroy = function () {
        this._player = null;
    };

})();