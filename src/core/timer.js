// Donkeycraft — Timer
// Delta-time accumulator, tick scheduler (game ticks at 20 TPS).
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Timer — manages delta time and game tick scheduling.
     * @param {number} [ticksPerSecond=20] - Game ticks per second.
     */
    Donkeycraft.Timer = function (ticksPerSecond) {
        ticksPerSecond = ticksPerSecond || (Donkeycraft.Config && typeof Donkeycraft.Config.GAME_TICKS_PER_SECOND === 'number' ? Donkeycraft.Config.GAME_TICKS_PER_SECOND : 20);
        this._tickInterval = 1000 / ticksPerSecond; // ms per tick
        this._accumulator = 0;
        this._tickCount = 0;
        this._deltaTime = 0;
        this._lastFrameTime = 0;
        this._frameCount = 0;
        this._fps = 0;
        this._fpsTimer = 0;
        this._running = false;
        this._tickCallbacks = [];
        this._renderCallbacks = [];
        this._animationFrameId = null;
    };

    /**
     * Register a callback to be called each game tick.
     * @param {Function} callback - Function(dt, tickCount) => void
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
     * Register a callback to be called each render frame.
     * @param {Function} callback - Function(dt) => void
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
     * Start the timer loop.
     */
    Donkeycraft.Timer.prototype.start = function () {
        if (this._running) return;
        this._running = true;
        this._lastFrameTime = performance.now();
        var self = this;
        this._animationFrameId = requestAnimationFrame(function (ts) { self._loop(ts); });
    };

    /**
     * Stop the timer loop.
     */
    Donkeycraft.Timer.prototype.stop = function () {
        this._running = false;
        if (this._animationFrameId !== null) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
    };

    /**
     * Get the current delta time in seconds.
     * @returns {number}
     */
    Donkeycraft.Timer.prototype.getDeltaTime = function () {
        return this._deltaTime;
    };

    /**
     * Get the current FPS.
     * @returns {number}
     */
    Donkeycraft.Timer.prototype.getFPS = function () {
        return this._fps;
    };

    /**
     * Get the current game tick count.
     * @returns {number}
     */
    Donkeycraft.Timer.prototype.getTickCount = function () {
        return this._tickCount || 0;
    };

    /**
     * Get the total frame count since timer creation.
     * @returns {number}
     */
    Donkeycraft.Timer.prototype.getFrameCount = function () {
        return this._frameCount || 0;
    };

    /**
     * Destroy the timer and free all resources.
     * Stops the loop, clears all callbacks, and nullifies internal references.
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
        this._running = false;
    };

    /**
     * Main loop — called each frame by requestAnimationFrame.
     * @param {number} currentTime - performance.now() timestamp.
     * @private
     */
    Donkeycraft.Timer.prototype._loop = function (currentTime) {
        if (!this._running) return;

        var self = this;
        this._animationFrameId = requestAnimationFrame(function (ts) { self._loop(ts); });

        // Calculate delta time (capped to prevent spiral of death)
        var rawDelta = (currentTime - this._lastFrameTime) / 1000;
        this._deltaTime = Math.min(rawDelta, 0.1);
        this._lastFrameTime = currentTime;

        // FPS counter
        this._frameCount++;
        this._fpsTimer += rawDelta;
        if (this._fpsTimer >= 1.0) {
            this._fps = Math.round(this._frameCount / this._fpsTimer);
            this._frameCount = 0;
            this._fpsTimer = Math.max(0, this._fpsTimer - 1.0);
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