// Donkeycraft — Timer
// Delta-time accumulator, tick scheduler (game ticks at 20 TPS).
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Timer — manages delta time, FPS tracking, and game tick scheduling.
     *
     * Uses a fixed-timestep accumulator pattern: render runs at maximum FPS
     * via `requestAnimationFrame`, while game logic ticks run at a configurable
     * rate (default 20 TPS). Delta time is capped at 100ms to prevent the
     * "spiral of death" after tab-unfocus or long pauses.
     *
     * @constructor
     * @param {number} [ticksPerSecond=20] - Game ticks per second.
     */
    Donkeycraft.Timer = function (ticksPerSecond) {
        ticksPerSecond = ticksPerSecond || (Donkeycraft.Config && typeof Donkeycraft.Config.GAME_TICKS_PER_SECOND === 'number' ? Donkeycraft.Config.GAME_TICKS_PER_SECOND : 20);

        /** @type {number} — Fixed interval between game ticks in milliseconds. */
        this._tickInterval = 1000 / ticksPerSecond;

        /** @type {number} — Accumulated time in milliseconds since last tick. */
        this._accumulator = 0;

        /** @type {number} — Total number of game ticks processed since timer creation. */
        this._tickCount = 0;

        /** @type {number} — Delta time in seconds for the current frame (capped at 0.1s). */
        this._deltaTime = 0;

        /** @type {number} — Timestamp of the previous frame (performance.now()). */
        this._lastFrameTime = 0;

        /** @type {number} — Frame count within the current FPS measurement window. */
        this._frameCount = 0;

        /** @type {number} — Current FPS, updated once per second. */
        this._fps = 0;

        /** @type {number} — Accumulated time in seconds for the current FPS window. */
        this._fpsTimer = 0;

        /** @type {boolean} */
        this._running = false;

        /** @type {Array<Function(dt: number, tickCount: number): void>} */
        this._tickCallbacks = [];

        /** @type {Array<Function(dt: number): void>} */
        this._renderCallbacks = [];

        /** @type {number|null} — requestAnimationFrame handle for the main loop. */
        this._animationFrameId = null;

        /** @type {number} — Total elapsed time in seconds since timer started. */
        this._elapsed = 0;
    };

    /**
     * Register a callback to be called each fixed game tick.
     * The callback receives the fixed timestep (dt) and current tick count.
     * Returns an unsubscribe function that removes the callback.
     *
     * @param {Function} callback - Function(dt: number, tickCount: number): void
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Timer.prototype.onTick = function (callback) {
        this._tickCallbacks.push(callback);
        var self = this;
        return function () {
            var idx = self._tickCallbacks.indexOf(callback);
            if (idx !== -1) self._tickCallbacks.splice(idx, 1);
        };
    };

    /**
     * Register a callback to be called every render frame (variable rate).
     * The callback receives the variable delta time in seconds.
     * Returns an unsubscribe function that removes the callback.
     *
     * @param {Function} callback - Function(dt: number): void
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.Timer.prototype.onRender = function (callback) {
        this._renderCallbacks.push(callback);
        var self = this;
        return function () {
            var idx = self._renderCallbacks.indexOf(callback);
            if (idx !== -1) self._renderCallbacks.splice(idx, 1);
        };
    };

    /**
     * Start the timer loop. No-op if already running.
     * Initializes `_lastFrameTime` to `performance.now()` on first start.
     */
    Donkeycraft.Timer.prototype.start = function () {
        if (this._running) return;
        this._running = true;
        this._lastFrameTime = performance.now();
        this._elapsed = 0;
        var self = this;
        this._animationFrameId = requestAnimationFrame(function (ts) { self._loop(ts); });
    };

    /**
     * Stop the timer loop and cancel any pending animation frame.
     * Does NOT clear tick or render callbacks — use `destroy()` for full cleanup.
     */
    Donkeycraft.Timer.prototype.stop = function () {
        this._running = false;
        if (this._animationFrameId !== null) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
    };

    /**
     * Get the total elapsed time in seconds since the timer started.
     * Returns 0 if called before `start()` or after `stop()`.
     * @returns {number} Total elapsed time in seconds.
     */
    Donkeycraft.Timer.prototype.getElapsed = function () {
        return this._elapsed || 0;
    };

    /**
     * Get the delta time in seconds for the current frame.
     * Returns 0 if called before `start()` or after `stop()`.
     * @returns {number} Delta time in seconds (capped at 0.1s).
     */
    Donkeycraft.Timer.prototype.getDeltaTime = function () {
        return this._deltaTime;
    };

    /**
     * Get the current frames-per-second, updated once per second.
     * Returns 0 if called before the first FPS window elapses.
     * @returns {number} Current FPS (integer).
     */
    Donkeycraft.Timer.prototype.getFPS = function () {
        return this._fps;
    };

    /**
     * Get the total number of game ticks processed since timer creation.
     * @returns {number} Tick count (non-negative integer).
     */
    Donkeycraft.Timer.prototype.getTickCount = function () {
        return this._tickCount || 0;
    };

    /**
     * Get the total number of render frames processed since timer creation.
     * @returns {number} Frame count (non-negative integer).
     */
    Donkeycraft.Timer.prototype.getFrameCount = function () {
        return this._frameCount || 0;
    };

    /**
     * Destroy the timer: stops the loop, clears all callbacks, resets counters,
     * and nullifies internal references for garbage collection.
     * After calling this method, the instance should not be reused.
     */
    Donkeycraft.Timer.prototype.destroy = function () {
        this.stop();
        this._tickCallbacks = [];
        this._renderCallbacks = [];
        this._accumulator = 0;
        this._tickCount = 0;
        this._deltaTime = 0;
        this._lastFrameTime = 0;
        this._frameCount = 0;
        this._fps = 0;
        this._fpsTimer = 0;
        this._elapsed = 0;
        this._running = false;
    };

    /**
     * Main loop — called each frame by `requestAnimationFrame`.
     *
     * Calculates delta time (capped at 100ms), updates FPS counter, accumulates
     * time, processes fixed-timestep game ticks, and calls render callbacks.
     *
     * @param {number} currentTime - Current timestamp from `performance.now()`.
     * @private
     */
    Donkeycraft.Timer.prototype._loop = function (currentTime) {
        if (!this._running) return;

        var self = this;
        this._animationFrameId = requestAnimationFrame(function (ts) { self._loop(ts); });

        // Calculate delta time (capped to prevent spiral of death)
        // Guard against negative deltas from clock adjustments or timing anomalies
        var rawDelta = (currentTime - this._lastFrameTime) / 1000;
        var safeDelta = Math.max(0, Math.min(rawDelta, 0.1));
        this._deltaTime = safeDelta;
        this._lastFrameTime = currentTime;

        // Track total elapsed time in seconds
        if (this._elapsed !== undefined) {
            this._elapsed += safeDelta;
        }

        // FPS counter — reset timer to zero after each update for accurate measurement
        this._frameCount++;
        this._fpsTimer += rawDelta;
        if (this._fpsTimer >= 1.0) {
            this._fps = Math.round(this._frameCount / this._fpsTimer);
            this._frameCount = 0;
            this._fpsTimer = 0; // Reset to zero instead of subtracting 1.0 to prevent drift
        }

        // Accumulate time and process game ticks
        this._accumulator += this._deltaTime;

        // Cap accumulator to prevent spiral-of-death after long freezes (max 500ms catch-up)
        var maxAccumulator = (this._tickInterval / 1000) * 10;
        if (this._accumulator > maxAccumulator) {
            this._accumulator = maxAccumulator;
        }

        var tickDt = this._tickInterval / 1000; // seconds per tick (fixed point)

        while (this._accumulator >= tickDt) {
            this._accumulator -= tickDt;
            this._tickCount++;

            // Call tick callbacks
            for (var i = 0; i < this._tickCallbacks.length; i++) {
                try {
                    this._tickCallbacks[i](tickDt, this._tickCount);
                } catch (e) {
                    if (Donkeycraft.Logger) {
                        Donkeycraft.Logger.error('Timer tick callback error:', e);
                    }
                }
            }
        }

        // Call render callbacks every frame
        for (var j = 0; j < this._renderCallbacks.length; j++) {
            try {
                this._renderCallbacks[j](this._deltaTime);
            } catch (e) {
                if (Donkeycraft.Logger) {
                    Donkeycraft.Logger.error('Timer render callback error:', e);
                }
            }
        }
    };

})();