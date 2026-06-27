// Donkeycraft — World Time
// World time: 24000 tick day cycle, time of day calculations, moon phases.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Constants for world time system.
     */
    Donkeycraft.WORLD_TIME_TICKS_PER_DAY = 24000;       // Ticks in one full day cycle
    Donkeycraft.WORLD_TIME_TICKS_PER_HOUR = 1000;      // Ticks in one hour (24 hours per day)
    Donkeycraft.WORLD_TIME_MOON_PHASE_CYCLE = 168000;  // Moon phase cycles every 7 days

    /**
     * WorldTime — Manages world time, day counting, and moon phases.
     * @param {number} [totalTicks=0] — Initial total tick count.
     */
    Donkeycraft.WorldTime = function(totalTicks) {
        this._totalTicks = (totalTicks && typeof totalTicks === 'number' && totalTicks > 0) ? totalTicks : 0;
    };

    /**
     * Advance time by one tick.
     */
    Donkeycraft.WorldTime.prototype.tick = function() {
        this._totalTicks++;
    };

    /**
     * Advance time by a number of ticks.
     * @param {number} count — Number of ticks to advance.
     */
    Donkeycraft.WorldTime.prototype.advance = function(count) {
        this._totalTicks += count;
    };

    /**
     * Get the total number of ticks elapsed.
     * @returns {number} Total ticks.
     */
    Donkeycraft.WorldTime.prototype.getTotalTicks = function() {
        return this._totalTicks;
    };

    /**
     * Set the total number of ticks.
     * @param {number} ticks — Total ticks to set.
     */
    Donkeycraft.WorldTime.prototype.setTotalTicks = function(ticks) {
        this._totalTicks = ticks < 0 ? 0 : ticks;
    };

    /**
     * Get the number of full days elapsed.
     * @returns {number} Number of complete days.
     */
    Donkeycraft.WorldTime.prototype.getDays = function() {
        return Math.floor(this._totalTicks / Donkeycraft.WORLD_TIME_TICKS_PER_DAY);
    };

    /**
     * Get the number of ticks within the current day [0, 23999].
     * @returns {number} Ticks in current day.
     */
    Donkeycraft.WorldTime.prototype.getTicksInDay = function() {
        return this._totalTicks % Donkeycraft.WORLD_TIME_TICKS_PER_DAY;
    };

    /**
     * Get the time of day as a normalized value in [0, 1).
     * 0.0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight.
     * @returns {number} Time of day in [0, 1).
     */
    Donkeycraft.WorldTime.prototype.getTimeOfDay = function() {
        return this.getTicksInDay() / Donkeycraft.WORLD_TIME_TICKS_PER_DAY;
    };

    /**
     * Check if it is currently daytime.
     * Daytime: time of day in [0.2, 0.75) — from just before sunrise to just before sunset.
     * @returns {boolean} True if daytime.
     */
    Donkeycraft.WorldTime.prototype.isDaytime = function() {
        var tod = this.getTimeOfDay();
        return tod >= 0.2 && tod < 0.75;
    };

    /**
     * Check if it is currently nighttime.
     * Nighttime: time of day in [0.75, 1.2) — from sunset to just after sunrise.
     * @returns {boolean} True if nighttime.
     */
    Donkeycraft.WorldTime.prototype.isNight = function() {
        var tod = this.getTimeOfDay();
        return tod >= 0.75 || tod < 0.2;
    };

    /**
     * Get the current hour of the day [0, 23].
     * @returns {number} Hour (0-23).
     */
    Donkeycraft.WorldTime.prototype.getHour = function() {
        return Math.floor(this.getTicksInDay() / Donkeycraft.WORLD_TIME_TICKS_PER_HOUR);
    };

    /**
     * Get the current minute within the hour [0, 59].
     * @returns {number} Minute (0-59).
     */
    Donkeycraft.WorldTime.prototype.getMinute = function() {
        var ticksInHour = this.getTicksInDay() % Donkeycraft.WORLD_TIME_TICKS_PER_HOUR;
        return Math.floor(ticksInHour / (Donkeycraft.WORLD_TIME_TICKS_PER_HOUR / 60));
    };

    /**
     * Get the moon phase [0, 7].
     * Phase 0 = new moon, 4 = full moon. Cycles every 7 days (168000 ticks).
     * @returns {number} Moon phase (0-7).
     */
    Donkeycraft.WorldTime.prototype.getMoonPhase = function() {
        return Math.floor((this._totalTicks / (Donkeycraft.WORLD_TIME_MOON_PHASE_CYCLE / 8)) % 8);
    };

    /**
     * Get a human-readable moon phase name.
     * @returns {string} Moon phase name.
     */
    Donkeycraft.WorldTime.prototype.getMoonPhaseName = function() {
        var names = [
            'New Moon',
            'Waxing Crescent',
            'First Quarter',
            'Waxing Gibbous',
            'Full Moon',
            'Waning Gibbous',
            'Last Quarter',
            'Waning Crescent'
        ];
        return names[this.getMoonPhase()] || 'Unknown';
    };

    /**
     * Get the fraction of moon illumination [0, 1].
     * 0 = new moon (invisible), 1 = full moon.
     * @returns {number} Illumination fraction.
     */
    Donkeycraft.WorldTime.prototype.getMoonIllumination = function() {
        var phase = this.getMoonPhase();
        // Approximate: waxing from 0→4, waning from 4→8
        if (phase <= 4) {
            return phase / 4;
        }
        return (8 - phase) / 4;
    };

    /**
     * Get the length of a full day cycle in ticks.
     * @returns {number} Ticks per day (always 24000).
     */
    Donkeycraft.WorldTime.getDayLength = function() {
        return Donkeycraft.WORLD_TIME_TICKS_PER_DAY;
    };

    /**
     * Convert a time-of-day value [0, 1) to ticks in day.
     * @param {number} tod — Time of day in [0, 1).
     * @returns {number} Ticks in day.
     */
    Donkeycraft.WorldTime.todToTicks = function(tod) {
        return Math.floor((tod % 1 + 1) % 1 * Donkeycraft.WORLD_TIME_TICKS_PER_DAY);
    };

    /**
     * Convert ticks in day to a time-of-day value [0, 1).
     * @param {number} ticksInDay — Ticks in current day.
     * @returns {number} Time of day in [0, 1).
     */
    Donkeycraft.WorldTime.ticksToTod = function(ticksInDay) {
        return (ticksInDay % Donkeycraft.WORLD_TIME_TICKS_PER_DAY) / Donkeycraft.WORLD_TIME_TICKS_PER_DAY;
    };

    /**
     * Create a WorldTime from a time-of-day value [0, 1).
     * Preserves the day count from the provided totalTicks.
     * @param {number} tod — Time of day in [0, 1).
     * @param {number} [currentTotal=0] — Current total ticks to preserve day count.
     * @returns {Donkeycraft.WorldTime} New WorldTime instance.
     */
    Donkeycraft.WorldTime.fromTimeOfDay = function(tod, currentTotal) {
        var ticksInDay = Donkeycraft.WorldTime.todToTicks(tod);
        var days = currentTotal ? Math.floor(currentTotal / Donkeycraft.WORLD_TIME_TICKS_PER_DAY) : 0;
        return new Donkeycraft.WorldTime(days * Donkeycraft.WORLD_TIME_TICKS_PER_DAY + ticksInDay);
    };

    /**
     * Reset time to zero.
     */
    Donkeycraft.WorldTime.prototype.reset = function() {
        this._totalTicks = 0;
    };

    /**
     * Serialize time state to a plain object.
     * @returns {{totalTicks: number}} Serialized state.
     */
    Donkeycraft.WorldTime.prototype.serialize = function() {
        return {
            totalTicks: this._totalTicks
        };
    };

    /**
     * Deserialize from a plain object.
     * @param {Object} data — Serialized state.
     * @returns {Donkeycraft.WorldTime} This instance for chaining.
     */
    Donkeycraft.WorldTime.prototype.deserialize = function(data) {
        if (data && typeof data.totalTicks === 'number') {
            this._totalTicks = data.totalTicks < 0 ? 0 : data.totalTicks;
        }
        return this;
    };

    /**
     * Destroy the WorldTime instance and free resources.
     */
    Donkeycraft.WorldTime.prototype.destroy = function() {
        this._totalTicks = 0;
    };

})();