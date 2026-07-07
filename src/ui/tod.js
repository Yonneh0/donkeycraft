// Donkeycraft — Time of Day Dial UI Module
// Standalone time-of-day dial widget with slider popup for creative mode.
// Handles DOM creation, time display, daylight arc, pointer animation,
// freeze/unfreeze controls, and idle auto-sync.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = window.Donkeycraft && window.Donkeycraft.Config;

    /**
     * TimeOfDayUI — manages the time dial widget and slider popup.
     * @param {Object} [options] - Configuration options.
     * @param {Function} [options.onTimeChange] - Callback when time changes (receives tod: number|null).
     */
    Donkeycraft.TimeOfDayUI = function (options) {
        options = options || {};

        /** @type {Function|null} @private */
        this._onTimeChange = typeof options.onTimeChange === 'function' ? options.onTimeChange : null;
        /** @type {number|null} @private */
        this._timeOfDay = null;
        /** @type {boolean} @private */
        this._timeFrozen = false;
        /** @type {number|null} @private */
        this._frozenTOD = null;
        /** @type {HTMLElement|null} @private */
        this._timeDialEl = null;
        /** @type {HTMLElement|null} @private */
        this._timeDialRing = null;
        /** @type {HTMLElement|null} @private */
        this._timeDialDaylight = null;
        /** @type {HTMLElement|null} @private */
        this._dialPointer = null;
        /** @type {HTMLElement|null} @private */
        this._dialText = null;
        /** @type {HTMLElement|null} @private */
        this._frozenBadge = null;
        /** @type {string|null} @private */
        this._gameMode = null;
        /** @type {HTMLElement|null} @private */
        this._timeSlider = null;
        /** @type {HTMLInputElement|null} @private */
        this._sliderInput = null;
        /** @type {HTMLElement|null} @private */
        this._freezeBtn = null;
        /** @type {boolean} @private */
        this._sliderVisible = false;
        /** @type {number|null} @private */
        this._idleCheckTimer = null;
        /** @type {number} @private */
        this._lastInteractionTime = 0;
        /** @type {boolean} @private */
        this._destroyed = false;

        // Named handler references for proper event listener cleanup
        this._handlers = {
            _onDialClick: null,
            _onSliderInput: null,
            _onFreezeClick: null,
            _onCloseClick: null,
            _onOutsideClick: null
        };
    };

    /**
     * Initialize the time dial UI. Creates DOM elements if they don't exist.
     * @returns {boolean} True if initialized successfully.
     */
    Donkeycraft.TimeOfDayUI.prototype.init = function () {
        try {
            this._createTimeDial();
            return true;
        } catch (e) {
            Donkeycraft.Logger.error('TimeOfDayUI', 'Initialization failed: ' + e.message);
            return false;
        }
    };

    /**
     * Create the time dial DOM element if it doesn't exist.
     * @private
     */
    Donkeycraft.TimeOfDayUI.prototype._createTimeDial = function () {
        if (this._timeDialEl) return;

        var el = document.createElement('div');
        el.id = 'dk-time-dial';
        el.className = 'dk-interactive';
        el.innerHTML =
            '<div class="dk-dial-ring">' +
            '<div class="dk-dial-daylight"></div>' +
            '<div class="dk-dial-pointer"></div>' +
            '</div>' +
            '<div class="dk-dial-text">12:00 PM</div>';

        document.body.appendChild(el);
        this._timeDialEl = el;
        this._timeDialRing = el.querySelector('.dk-dial-ring');
        this._timeDialDaylight = el.querySelector('.dk-dial-daylight');
        this._dialPointer = el.querySelector('.dk-dial-pointer');
        this._dialText = el.querySelector('.dk-dial-text');

        // Click handler for creative mode
        var self = this;
        this._handlers._onDialClick = function (e) {
            e.stopPropagation();
            if (self._gameMode === 'creative' && !self._sliderVisible) {
                self.showSlider(self.getEffectiveTime());
            }
        };
        el.addEventListener('click', this._handlers._onDialClick);
    };

    /**
     * Update the time dial display with current time.
     * @private
     */
    Donkeycraft.TimeOfDayUI.prototype._updateTimeDial = function () {
        try {
            if (!this._timeDialEl) this._createTimeDial();
            if (!this._timeDialEl) return;

            var tod = this.getEffectiveTime();

            // Game time: 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
            var sunriseTod = 0.25;
            var sunsetTod = 0.75;
            var isDaytime = tod >= sunriseTod && tod < sunsetTod;

            // Consistent dial background — no toggling
            this._timeDialEl.style.background = 'radial-gradient(circle at 40% 40%, rgba(30, 35, 55, 0.92), rgba(15, 18, 30, 0.95))';
            this._timeDialEl.style.borderColor = 'rgba(80, 100, 140, 0.4)';

            // Midnight at bottom (90deg), clockwise rotation
            var sunriseAngle = 90 + (sunriseTod * 360); // 180deg (left)
            var sunsetRaw = 90 + (sunsetTod * 360);      // 360deg
            var sunsetAngle = sunsetRaw % 360;           // 0deg
            var dayArcEnd = sunsetAngle + 360;           // 360deg
            var nightEnd = sunriseAngle + 360;           // 540deg

            // Daylight arc: brighter highlight across the top half (sunrise to sunset)
            if (this._timeDialDaylight) {
                this._timeDialDaylight.style.background = 'conic-gradient(from ' + sunriseAngle + 'deg, rgba(200, 220, 255, 0.45), rgba(200, 220, 255, 0.45) ' + dayArcEnd + 'deg, transparent ' + dayArcEnd + 'deg, transparent ' + nightEnd + 'deg)';
            }

            // Pointer: midnight bottom (90deg), clockwise orbit
            var pointerAngle = 90 + (tod * 360);
            this._dialPointer.style.transform = 'translate(-50%, -50%) rotate(' + pointerAngle + 'deg) translateX(16px)';

            // Emoji marker: sun during day, moon during night
            this._dialPointer.textContent = isDaytime ? '\u2600\uFE0F' : '\uD83C\uDF19';

            // Update time text
            var ticks = Math.floor(tod * 24000);
            var hour = Math.floor(ticks / 1000) % 24;
            var minute = Math.floor((ticks % 1000) / (1000 / 60));
            var h12 = hour % 12 || 12;
            this._dialText.textContent = h12 + ':' + (minute < 10 ? '0' : '') + minute;

            // Update frozen indicator
            if (this._timeFrozen && !this._frozenBadge) {
                var badge = document.createElement('div');
                badge.className = 'dk-dial-frozen';
                badge.textContent = '[FROZEN]';
                this._timeDialEl.appendChild(badge);
                this._frozenBadge = badge;
            } else if (!this._timeFrozen && this._frozenBadge) {
                this._timeDialEl.removeChild(this._frozenBadge);
                this._frozenBadge = null;
            }

        } catch (e) {
            Donkeycraft.Logger.warn('TimeOfDayUI', 'Time dial update error: ' + e.message);
        }
    };

    /**
     * Set the current time of day for the dial display.
     * @param {number} tod - Time of day in [0, 1).
     */
    Donkeycraft.TimeOfDayUI.prototype.setTimeOfDay = function (tod) {
        if (typeof tod === 'number' && !isNaN(tod)) {
            this._timeOfDay = ((tod % 1) + 1) % 1;
            this._updateTimeDial();
        }
    };

    /**
     * Set callback for time changes from slider.
     * @param {Function} cb - Receives (tod: number|null).
     */
    Donkeycraft.TimeOfDayUI.prototype.setOnTimeChange = function (cb) {
        this._onTimeChange = typeof cb === 'function' ? cb : null;
    };

    /**
     * Set the current game mode for interactivity detection.
     * @param {string|null} mode - 'survival', 'creative', or null.
     */
    Donkeycraft.TimeOfDayUI.prototype.setGameMode = function (mode) {
        this._gameMode = mode || null;
    };

    /**
     * Freeze time at current value (creative mode).
     * @param {number|null} frozenTOD - Time to freeze at, or null to unfreeze.
     */
    Donkeycraft.TimeOfDayUI.prototype.freezeTime = function (frozenTOD) {
        if (frozenTOD === null) {
            this._timeFrozen = false;
            this._frozenTOD = null;
        } else if (typeof frozenTOD === 'number' && !isNaN(frozenTOD)) {
            this._timeFrozen = true;
            this._frozenTOD = ((frozenTOD % 1) + 1) % 1;
        }
        this._updateTimeDial();
    };

    /**
     * Get effective time of day (frozen or natural).
     * @returns {number} Time in [0, 1).
     */
    Donkeycraft.TimeOfDayUI.prototype.getEffectiveTime = function () {
        if (this._timeFrozen && this._frozenTOD !== null) return this._frozenTOD;
        return this._timeOfDay || 0.5;
    };

    /**
     * Create the time slider popup for creative mode.
     * @private
     */
    Donkeycraft.TimeOfDayUI.prototype._createTimeSlider = function () {
        if (this._timeSlider) return;

        var popup = document.createElement('div');
        popup.className = 'dk-time-dial-popup dk-interactive';
        popup.style.display = 'none';
        popup.innerHTML =
            '<div class="dk-time-header">' +
            '<button class="dk-time-freeze-btn">Freeze</button>' +
            '<button class="dk-time-close" title="Close (Esc)">✕</button>' +
            '</div>' +
            '<div class="dk-time-slider-row">' +
            '<span class="dk-time-label">12 AM</span>' +
            '<input type="range" class="dk-time-slider" min="0" max="23999" value="6000" step="1">' +
            '<span class="dk-time-label">12 AM</span>' +
            '</div>';

        document.body.appendChild(popup);
        this._timeSlider = popup;
        this._sliderInput = popup.querySelector('.dk-time-slider');
        this._freezeBtn = popup.querySelector('.dk-time-freeze-btn');
        var closeBtn = popup.querySelector('.dk-time-close');

        var self = this;

        // Slider input handler
        this._handlers._onSliderInput = function () {
            try {
                var val = parseInt(this.value, 10);
                if (!isNaN(val)) {
                    var tod = val / 24000;
                    self._frozenTOD = tod;
                    self._timeFrozen = true;
                    self._updateSliderDisplay(tod);
                    if (self._onTimeChange) self._onTimeChange(tod);
                }
                self._lastInteractionTime = Date.now();
            } catch (e) { /* ignore */ }
        };
        this._sliderInput.addEventListener('input', this._handlers._onSliderInput);

        // Freeze button in header
        this._handlers._onFreezeClick = function () {
            try {
                if (self._timeFrozen) {
                    self.freezeTime(null);
                    this.textContent = 'Freeze';
                    this.classList.remove('dk-time-freeze-active');
                } else {
                    self.freezeTime(self.getEffectiveTime());
                    this.textContent = 'Unfreeze';
                    this.classList.add('dk-time-freeze-active');
                    if (self._onTimeChange) self._onTimeChange(self.getEffectiveTime());
                }
                self.hideSlider();
            } catch (e) { /* ignore */ }
        };
        this._freezeBtn.addEventListener('click', this._handlers._onFreezeClick);

        // Close button
        this._handlers._onCloseClick = function () {
            try { self.hideSlider(); } catch (e) { /* ignore */ }
        };
        closeBtn.addEventListener('click', this._handlers._onCloseClick);

        // Close on outside click
        var closeHandler = function (e) {
            if (!popup.contains(e.target)) {
                self.hideSlider();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(function () {
            document.addEventListener('click', closeHandler);
        }, 100);
    };

    /**
     * Update slider display with current time.
     * @param {number} tod - Time of day.
     * @private
     */
    Donkeycraft.TimeOfDayUI.prototype._updateSliderDisplay = function (tod) {
        try {
            if (!this._sliderInput) return;
            var ticks = Math.floor(tod * 24000);
            this._sliderInput.value = ticks;
        } catch (e) { /* ignore */ }
    };

    /**
     * Show the time slider popup.
     * @param {number} [tod] - Optional initial time.
     */
    Donkeycraft.TimeOfDayUI.prototype.showSlider = function (tod) {
        try {
            this._createTimeSlider();
            if (!this._timeSlider) return;

            var initTOD = typeof tod === 'number' ? tod : this.getEffectiveTime();
            this._updateSliderDisplay(initTOD);

            // Auto-freeze when opening the panel
            if (!this._timeFrozen) {
                this.freezeTime(initTOD);
            }
            if (this._freezeBtn) {
                this._freezeBtn.textContent = 'Unfreeze';
                this._freezeBtn.classList.add('dk-time-freeze-active');
            }

            // Position near time dial
            var rect = this._timeDialEl.getBoundingClientRect();
            var w = 260, h = 100;
            var left = Math.max(4, Math.min(rect.left, window.innerWidth - w - 4));
            var top = rect.bottom + 8;
            if (top + h > window.innerHeight - 4) top = rect.top - h - 8;

            this._timeSlider.style.left = Math.floor(left) + 'px';
            this._timeSlider.style.top = Math.floor(top) + 'px';
            this._timeSlider.style.display = 'block';
            this._sliderVisible = true;
            this._lastInteractionTime = Date.now();

            if (this._freezeBtn) {
                this._freezeBtn.textContent = 'Unfreeze';
                this._freezeBtn.classList.add('dk-time-freeze-active');
            }

            this._startIdleCheck();
        } catch (e) { /* ignore */ }
    };

    /**
     * Hide the time slider popup.
     */
    Donkeycraft.TimeOfDayUI.prototype.hideSlider = function () {
        try {
            if (!this._timeSlider) return;
            this._timeSlider.style.display = 'none';
            this._sliderVisible = false;
            this._idleCheckTimer = null;
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        } catch (e) { /* ignore */ }
    };

    /**
     * Start idle check timer — updates slider to current time after 10s of no interaction.
     * @private
     */
    Donkeycraft.TimeOfDayUI.prototype._startIdleCheck = function () {
        try {
            if (this._idleCheckTimer) clearInterval(this._idleCheckTimer);
            var self = this;
            this._idleCheckTimer = setInterval(function () {
                try {
                    if (!self._sliderVisible) {
                        clearInterval(self._idleCheckTimer);
                        self._idleCheckTimer = null;
                        return;
                    }
                    if (self._timeFrozen) return;
                    var elapsed = Date.now() - (self._lastInteractionTime || Date.now());
                    if (elapsed >= 10000) {
                        var currentTOD = self.getEffectiveTime();
                        self._updateSliderDisplay(currentTOD);
                        self._lastInteractionTime = Date.now();
                    }
                } catch (e) { /* ignore */ }
            }, 1000);
        } catch (e) { /* ignore */ }
    };

    /**
     * Check if slider is visible.
     * @returns {boolean}
     */
    Donkeycraft.TimeOfDayUI.prototype.isSliderVisible = function () {
        return this._sliderVisible || false;
    };

    /**
     * Clean up slider popup resources.
     * @private
     */
    Donkeycraft.TimeOfDayUI.prototype._destroySlider = function () {
        if (this._idleCheckTimer) {
            clearInterval(this._idleCheckTimer);
            this._idleCheckTimer = null;
        }
        if (this._timeSlider && this._timeSlider.parentNode) {
            this._timeSlider.parentNode.removeChild(this._timeSlider);
        }
        this._timeSlider = null;
        this._sliderInput = null;
        this._freezeBtn = null;

        // Remove event listeners
        if (this._handlers._onSliderInput && this._sliderInput) {
            this._sliderInput.removeEventListener('input', this._handlers._onSliderInput);
        }
        if (this._handlers._onFreezeClick && this._freezeBtn) {
            this._freezeBtn.removeEventListener('click', this._handlers._onFreezeClick);
        }
        if (this._handlers._onCloseClick) {
            // Close button reference is lost after creation, but that's fine
        }
        for (var key in this._handlers) {
            if (this._handlers.hasOwnProperty(key)) {
                this._handlers[key] = null;
            }
        }
    };

    /**
     * Destroy and free all resources.
     */
    Donkeycraft.TimeOfDayUI.prototype.destroy = function () {
        if (this._destroyed) return;
        this._destroyed = true;

        // Remove dial click listener
        if (this._timeDialEl && this._handlers._onDialClick) {
            this._timeDialEl.removeEventListener('click', this._handlers._onDialClick);
        }

        // Destroy slider
        this._destroySlider();

        // Clear time dial elements
        if (this._timeDialEl && this._timeDialEl.parentNode) {
            this._timeDialEl.parentNode.removeChild(this._timeDialEl);
        }
        this._timeDialEl = null;
        this._timeDialRing = null;
        this._timeDialDaylight = null;
        this._dialPointer = null;
        this._dialText = null;
        this._frozenBadge = null;

        // Clear handler references
        for (var key in this._handlers) {
            if (this._handlers.hasOwnProperty(key)) {
                this._handlers[key] = null;
            }
        }
    };

})();