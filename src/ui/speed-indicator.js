// Donkeycraft — Speed Indicator UI
// Movement speed indicator/control at the top-right corner, left of the game mode badge.
// Displays emoji icons for sneak/walk/run (survival) or sneak/walk/run/turbo (creative).
// Functions as a toggle lock — clicking an icon locks that mode; keybinds clear the lock.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * SpeedIndicator — displays and controls movement speed state.
     * @param {HTMLElement} container - DOM element to append the indicator to.
     */
    Donkeycraft.SpeedIndicator = function (container) {
        this._container = container;
        this._movementSystem = null;
        this._player = null;

        // Speed states
        this._lockedMode = null;      // 'sneak' | 'walk' | 'run' | 'turbo' (null = unlocked)
        this._currentMode = 'walk';   // Actual current mode from movement system
        this._gameMode = 'survival';  // Current game mode

        // DOM references
        this._badgeEl = null;
        this._buttons = [];           // Array of button elements

        // Animation timeout for visual feedback
        this._clickTimeout = null;

        // Bind + build
        this._buildDOM();
    };

    /**
     * Speed state definitions.
     * @private
     */
    var SPEED_STATES = [
        { id: 'sneak', emoji: '\uD83D\uDC0C', label: 'SNEAK', title: 'Sneak (slow walk — 2.0 b/s)' }, // 🐌
        { id: 'walk', emoji: '\uD83D\uDEB6', label: 'WALK', title: 'Walk (normal speed — 5.0 b/s)' },  // 🚶
        { id: 'run', emoji: '\uD83C\uDFC3', label: 'RUN', title: 'Run (sprint — 7.8 b/s)' },          // 🏃
        { id: 'turbo', emoji: '\uD83D\uDE80', label: 'TURBO', title: 'Turbo (15x run — 75.0 b/s)' }      // 🚀
    ];

    /**
     * _buildDOM — create the speed indicator DOM structure.
     * @private
     */
    Donkeycraft.SpeedIndicator.prototype._buildDOM = function () {
        var self = this;

        // Badge container
        var badge = document.createElement('div');
        badge.className = 'dk-speed-indicator';
        badge.style.display = 'none';
        this._container.appendChild(badge);
        this._badgeEl = badge;

        // Create button for each speed state (start with sneak/walk/run)
        var states = SPEED_STATES.slice(0, 3);

        for (var i = 0; i < states.length; i++) {
            var s = states[i];
            var btn = document.createElement('button');
            btn.className = 'dk-speed-btn';
            btn.setAttribute('data-mode', s.id);
            btn.title = s.title;
            btn.innerHTML = '<span class="dk-speed-emoji">' + s.emoji + '</span><span class="dk-speed-label">' + s.label + '</span>';

            var btnSelf = btn;
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                self._onButtonClick(btnSelf);
            });

            badge.appendChild(btn);
            this._buttons.push({ el: btn, state: s });
        }

        // Click handler on badge background to unlock
        badge.addEventListener('click', function (e) {
            if (e.target === badge) {
                self._clearLock();
            }
        });
    };

    /**
     * _onButtonClick — handle speed button click to toggle lock.
     * @private
     */
    Donkeycraft.SpeedIndicator.prototype._onButtonClick = function (btn) {
        var mode = btn.getAttribute('data-mode');
        if (!mode) return;

        // If clicking the already-locked mode, unlock it
        if (this._lockedMode === mode) {
            this._clearLock();
            return;
        }

        // Lock to the clicked mode (regardless of whether it's currently active)
        this._lockedMode = mode;

        // Animate click
        this._animateClick(btn);

        // Notify movement system to apply the locked speed
        if (this._movementSystem && this._movementSystem.setLockedSpeed) {
            this._movementSystem.setLockedSpeed(mode);
        }
    };

    /**
     * _clearLock — clear the speed lock and reset to input-driven mode.
     * @private
     */
    Donkeycraft.SpeedIndicator.prototype._clearLock = function () {
        if (!this._lockedMode) return;

        this._lockedMode = null;

        if (this._movementSystem && this._movementSystem.setLockedSpeed) {
            this._movementSystem.setLockedSpeed(null);
        }
    };

    /**
     * _animateClick — brief scale bounce animation on button click.
     * @private
     */
    Donkeycraft.SpeedIndicator.prototype._animateClick = function (btn) {
        if (!btn) return;
        btn.style.animation = 'badge-click-bounce 200ms ease-out';
        var self = this;
        setTimeout(function () {
            if (btn) {
                btn.style.animation = 'none';
                void btn.offsetWidth;
            }
        }, 200);
    };

    /**
     * setPlayer — set the player reference for game mode tracking.
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.SpeedIndicator.prototype.setPlayer = function (player) {
        var self = this;

        // Unsubscribe from previous player if any
        if (this._player && this._player._unsubscribeGameMode) {
            this._player._unsubscribeGameMode();
            this._player._unsubscribeGameMode = null;
        }

        this._player = player;

        if (!player) return;

        // Listen for game mode changes
        try {
            var eventBus = Donkeycraft.EventBus.getGlobal ? Donkeycraft.EventBus.getGlobal() : null;
            if (eventBus) {
                eventBus.on('gameMode:changed', function (data) {
                    if (data && data.newMode) {
                        self._onGameModeChanged(data.newMode);
                    }
                });
            }
        } catch (e) { }

        // Initial update
        var initialMode = player.getGameMode ? player.getGameMode() : null;
        if (initialMode) {
            this._onGameModeChanged(initialMode);
        }
    };

    /**
     * setMovementSystem — set the movement system reference.
     * @param {Donkeycraft.Movement} movement - Movement system instance.
     */
    Donkeycraft.SpeedIndicator.prototype.setMovementSystem = function (movement) {
        this._movementSystem = movement;
    };

    /**
     * _onGameModeChanged — handle game mode change to add/remove turbo button.
     * @private
     * @param {string} mode - 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.SpeedIndicator.prototype._onGameModeChanged = function (mode) {
        this._gameMode = mode;

        // Show indicator for survival and creative only
        if (mode !== 'survival' && mode !== 'creative') {
            this._badgeEl.style.display = 'none';
            return;
        }

        this._badgeEl.style.display = 'flex';

        // Add turbo button for creative mode if not present
        if (mode === 'creative') {
            this._addTurboButton();
        } else {
            this._removeTurboButton();
        }

        // Clear lock if locked to a mode not available in new game mode
        if (mode === 'survival' && this._lockedMode === 'turbo') {
            this._clearLock();
        }
    };

    /**
     * _addTurboButton — add the turbo speed button for creative mode.
     * @private
     */
    Donkeycraft.SpeedIndicator.prototype._addTurboButton = function () {
        var self = this;
        // Check if turbo button already exists
        for (var i = 0; i < this._buttons.length; i++) {
            if (this._buttons[i].state.id === 'turbo') return; // Already added
        }

        var turboState = SPEED_STATES[3]; // turbo
        var btn = document.createElement('button');
        btn.className = 'dk-speed-btn';
        btn.setAttribute('data-mode', turboState.id);
        btn.title = turboState.title;
        btn.innerHTML = '<span class="dk-speed-emoji">' + turboState.emoji + '</span><span class="dk-speed-label">' + turboState.label + '</span>';

        var btnSelf = btn;
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            self._onButtonClick(btnSelf);
        });

        this._badgeEl.appendChild(btn);
        this._buttons.push({ el: btn, state: turboState });
    };

    /**
     * _removeTurboButton — remove the turbo speed button.
     * @private
     */
    Donkeycraft.SpeedIndicator.prototype._removeTurboButton = function () {
        for (var i = this._buttons.length - 1; i >= 0; i--) {
            if (this._buttons[i].state.id === 'turbo') {
                if (this._badgeEl && this._buttons[i].el.parentNode === this._badgeEl) {
                    this._badgeEl.removeChild(this._buttons[i].el);
                }
                this._buttons.splice(i, 1);
            }
        }
    };

    /**
     * update — called every tick to update the indicator state.
     * @param {string} activeMode - The actual active speed mode from movement system.
     * @private
     */
    Donkeycraft.SpeedIndicator.prototype.update = function (activeMode) {
        if (!this._badgeEl || !activeMode) return;

        this._currentMode = activeMode;

        // Update button states
        for (var i = 0; i < this._buttons.length; i++) {
            var b = this._buttons[i];
            var isActive = (b.state.id === activeMode);
            var isLocked = (this._lockedMode === b.state.id);

            // Remove all state classes
            b.el.classList.remove('active', 'locked');

            if (isLocked) {
                b.el.classList.add('locked');
            }
            if (isActive) {
                b.el.classList.add('active');
            }
        }
    };

    /**
     * onKeybindPress — called when sprint/crouch keybinds are pressed to clear lock.
     * @param {string} keybind - The keybind that was pressed ('sprint' or 'crouch').
     */
    Donkeycraft.SpeedIndicator.prototype.onKeybindPress = function (keybind) {
        if (!this._lockedMode) return;

        // Clear lock when sprint/crouch key is pressed
        this._clearLock();
    };

    /**
     * getLockedMode — get the current locked mode.
     * @returns {string|null}
     */
    Donkeycraft.SpeedIndicator.prototype.getLockedMode = function () {
        return this._lockedMode;
    };

    /**
     * getCurrentMode — get the current active mode.
     * @returns {string}
     */
    Donkeycraft.SpeedIndicator.prototype.getCurrentMode = function () {
        return this._currentMode;
    };

    /**
     * destroy — clean up all DOM and event listeners.
     */
    Donkeycraft.SpeedIndicator.prototype.destroy = function () {
        // Unsubscribe from events
        if (this._player && this._player._unsubscribeGameMode) {
            this._player._unsubscribeGameMode();
            this._player._unsubscribeGameMode = null;
        }

        try {
            var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
            if (globalBus) {
                // No direct off method needed — the event listener was anonymous
            }
        } catch (e) { }

        // Clean up DOM
        if (this._badgeEl && this._badgeEl.parentNode) {
            this._badgeEl.parentNode.removeChild(this._badgeEl);
        }
        this._badgeEl = null;
        this._buttons = [];
        this._container = null;
        this._movementSystem = null;
        this._player = null;
    };

})();