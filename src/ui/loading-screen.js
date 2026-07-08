// Donkeycraft — Loading Screen
// DOM-based loading screen with animated progress bar, meaningful status messages,
// sub-phase tracking, and loading history showing stage durations.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * LoadingScreenTips — loading tips displayed during initialization.
     */
    Donkeycraft.LoadingScreenTips = [
        'Break stone with a pickaxe',
        'Craft wooden planks from logs',
        'Build shelter before nightfall',
        'Pistons can push up to 12 blocks',
        'Redstone torches emit signal level 15',
        'Creeper hisses before exploding',
        'Endermen teleport when hit',
        'Fishing can yield XP and enchantments',
        'Obsidian is resistant to explosions',
        'Diamond ore generates deep underground',
        'Slime blocks bounce entities',
        'Hoppers can collect items from chests',
        'Note blocks play different notes based on height',
        'Lever can power redstone devices',
        'Buttons can be pressed to open doors'
    ];

    /**
     * LoadingScreen — DOM-based loading screen UI with progress bar, status messages,
     * sub-phase tracking, and loading history.
     * @param {HTMLElement} [container] - Container element to append the loading screen to.
     */
    Donkeycraft.LoadingScreen = function (container) {
        this._container = container || document.body;
        this._element = null;
        this._progressBar = null;
        this._messageEl = null;
        this._tipEl = null;
        this._errorEl = null;
        this._historyEl = null;
        this._tipIndex = 0;
        this._disposed = false;
        this._lastProgress = -1;
        this._startTime = 0;
        this._phaseStartTimes = {}; // Track when each phase started
        this._phaseDurations = {};  // Track how long each phase took
        this._historyVisible = false;
        this._create();
    };

    /**
     * _formatDuration — format milliseconds into a human-readable string.
     * @private
     * @param {number} ms - Duration in milliseconds.
     * @returns {string} Formatted duration (e.g., "1.2s", "342ms").
     */
    Donkeycraft.LoadingScreen.prototype._formatDuration = function (ms) {
        if (ms < 1000) {
            return Math.round(ms) + 'ms';
        }
        return (ms / 1000).toFixed(1) + 's';
    };

    /**
     * _addHistoryEntry — add a timing entry to the loading history.
     * @private
     * @param {string} label - Description of the stage.
     * @param {number} duration - Duration in milliseconds.
     */
    Donkeycraft.LoadingScreen.prototype._addHistoryEntry = function (label, duration) {
        if (!this._historyEl || !Donkeycraft.Logger) return;

        var entry = document.createElement('div');
        entry.className = 'dk-loading-step complete';
        entry.setAttribute('data-stage', label);

        var icon = document.createElement('span');
        icon.className = 'dk-loading-step-icon';
        icon.textContent = '✓';

        var text = document.createElement('span');
        text.className = 'dk-loading-step-text';
        text.textContent = label + ' — ' + this._formatDuration(duration);

        entry.appendChild(icon);
        entry.appendChild(text);
        this._historyEl.appendChild(entry);

        // Auto-scroll to show latest entry
        this._historyEl.scrollTop = this._historyEl.scrollHeight;
    };

    /**
     * _startPhase — record the start time for a phase.
     * @private
     * @param {string} phase - Phase name.
     */
    Donkeycraft.LoadingScreen.prototype._startPhase = function (phase) {
        this._phaseStartTimes[phase] = performance.now();
    };

    /**
     * _endPhase — record the end time and add history entry for a phase.
     * @private
     * @param {string} phase - Phase name.
     */
    Donkeycraft.LoadingScreen.prototype._endPhase = function (phase) {
        if (!this._phaseStartTimes[phase]) return;

        var endTime = performance.now();
        var duration = endTime - this._phaseStartTimes[phase];
        this._phaseDurations[phase] = duration;

        // Format phase name for display
        var label = phase.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        this._addHistoryEntry(label, duration);

        delete this._phaseStartTimes[phase];
    };

    /**
     * _create — build the loading screen DOM structure.
     * @private
     */
    Donkeycraft.LoadingScreen.prototype._create = function () {
        var self = this;
        this._startTime = performance.now();

        // Main overlay — styles defined in loading-screen.css (.dk-loading-screen)
        this._element = document.createElement('div');
        this._element.className = 'dk-loading-screen';

        // Title — styles defined in loading-screen.css (.dk-loading-title)
        var title = document.createElement('div');
        title.className = 'dk-loading-title';
        title.textContent = 'Donkeycraft';
        this._element.appendChild(title);

        // Status message — styles defined in loading-screen.css (.dk-loading-message)
        this._messageEl = document.createElement('div');
        this._messageEl.className = 'dk-loading-message';
        this._messageEl.textContent = 'Initializing...';
        this._element.appendChild(this._messageEl);

        // Progress bar container — styles defined in loading-screen.css (.dk-loading-progress-container)
        var barContainer = document.createElement('div');
        barContainer.className = 'dk-loading-progress-container';

        // Progress bar fill — base styles defined in loading-screen.css (.dk-loading-progress)
        this._progressBar = document.createElement('div');
        this._progressBar.className = 'dk-loading-progress';
        barContainer.appendChild(this._progressBar);
        this._element.appendChild(barContainer);

        // Loading tips — styles defined in loading-screen.css (.dk-loading-tip)
        this._tipEl = document.createElement('div');
        this._tipEl.className = 'dk-loading-tip';
        this._tipEl.textContent = '[Tip] ' + Donkeycraft.LoadingScreenTips[0];
        this._element.appendChild(this._tipEl);

        // Loading history panel (hidden initially, shown after phases complete)
        this._historyEl = document.createElement('div');
        this._historyEl.className = 'dk-loading-steps';
        this._historyEl.style.display = 'none';
        this._element.appendChild(this._historyEl);

        // Error display (hidden by default) — styles defined in loading-screen.css (.dk-loading-error)
        this._errorEl = document.createElement('div');
        this._errorEl.className = 'dk-loading-error';
        this._errorEl.textContent = '';
        this._element.appendChild(this._errorEl);

        // Append to container
        this._container.appendChild(this._element);
    };

    /**
     * updateProgress — set progress percentage (0-100).
     * @param {number} percent - Progress percentage (clamped 0-100).
     */
    Donkeycraft.LoadingScreen.prototype.updateProgress = function (percent) {
        if (this._disposed || !this._progressBar) return;

        // Clamp to 0-100
        var p = Math.max(0, Math.min(100, percent));

        // Save old progress before updating
        var oldProgress = this._lastProgress;

        // Only update DOM if progress actually changed
        if (p === oldProgress) return;
        this._lastProgress = p;

        this._progressBar.style.width = p + '%';

        // Rotate tips at 25% thresholds, but only when progress increases
        if (p % 25 === 0 && p > 0 && p > oldProgress) {
            this._tipIndex = (this._tipIndex + 1) % Donkeycraft.LoadingScreenTips.length;
            this._tipEl.textContent = '[Tip] ' + Donkeycraft.LoadingScreenTips[this._tipIndex];
        }
    };

    /**
     * setMessage — set the loading message text.
     * @param {string} message - Message to display.
     */
    Donkeycraft.LoadingScreen.prototype.setMessage = function (message) {
        if (this._disposed || !this._messageEl) return;
        this._messageEl.textContent = message;
    };

    /**
     * handlePhaseStart — called when an init phase starts.
     * @param {Object} data - Phase data with { phase } name.
     */
    Donkeycraft.LoadingScreen.prototype.handlePhaseStart = function (data) {
        if (this._disposed) return;

        var phase = data.phase || 'unknown';
        this._startPhase(phase);

        // Show history panel on first phase start
        if (!this._historyVisible) {
            this._historyVisible = true;
            if (this._historyEl) {
                this._historyEl.style.display = 'block';
            }
        }

        var label = phase.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        this.setMessage('Starting ' + label + '...');
    };

    /**
     * handlePhaseEnd — called when an init phase completes.
     * @param {Object} data - Phase data with { phase } name.
     */
    Donkeycraft.LoadingScreen.prototype.handlePhaseEnd = function (data) {
        if (this._disposed) return;

        var phase = data.phase || 'unknown';
        this._endPhase(phase);

        var label = phase.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        this.setMessage(label + ' complete');
    };

    /**
     * handleSubPhase — called for granular sub-phase progress updates.
     * @param {Object} data - Sub-phase data with { phase, subPhase, message, progress }.
     */
    Donkeycraft.LoadingScreen.prototype.handleSubPhase = function (data) {
        if (this._disposed) return;

        // Update the main status message with the sub-phase description
        if (data.message) {
            this.setMessage(data.message);
        }

        // Update progress bar to the sub-phase progress value
        if (typeof data.progress === 'number') {
            this.updateProgress(data.progress);
        }

        // Show history panel on first sub-phase
        if (!this._historyVisible) {
            this._historyVisible = true;
            if (this._historyEl) {
                this._historyEl.style.display = 'block';
            }
        }
    };

    /**
     * handleProgress — called for fine-grained progress updates.
     * @param {Object} data - Progress data with { percent, message }.
     */
    Donkeycraft.LoadingScreen.prototype.handleProgress = function (data) {
        if (this._disposed) return;

        if (typeof data.percent === 'number') {
            this.updateProgress(data.percent);
        }
        if (data.message) {
            this.setMessage(data.message);
        }
    };

    /**
     * showError — display error state.
     * @param {string} errorMessage - Error message to display.
     */
    Donkeycraft.LoadingScreen.prototype.showError = function (errorMessage) {
        if (this._disposed) return;

        // Hide progress bar and tip using CSS classes
        if (this._progressBar) {
            var parent = this._progressBar.parentElement;
            if (parent) parent.classList.add('dk-hidden');
        }
        if (this._tipEl) this._tipEl.classList.add('dk-hidden');

        // Show error (use textContent to prevent XSS)
        this._errorEl.style.display = 'block';
        this._errorEl.textContent = 'ERROR: ' + errorMessage;

        // Update message color using CSS class
        if (this._messageEl) {
            this._messageEl.textContent = 'Failed to initialize';
            this._messageEl.classList.add('dk-loading-message-error');
        }
    };

    /**
     * hide — remove loading screen from DOM.
     */
    Donkeycraft.LoadingScreen.prototype.hide = function () {
        if (this._disposed || !this._element) return;
        if (this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
    };

    /**
     * dispose — remove DOM elements and free references.
     */
    Donkeycraft.LoadingScreen.prototype.dispose = function () {
        // Call hide() BEFORE setting _disposed — hide() checks _disposed flag,
        // so if we set it first, hide() returns early without removing the element.
        this.hide();
        this._disposed = true;
        this._element = null;
        this._progressBar = null;
        this._messageEl = null;
        this._tipEl = null;
        this._errorEl = null;
        this._historyEl = null;
        this._container = null;
    };
})();