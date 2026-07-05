// Donkeycraft — Game Mode Badge UI
// Displays a SURVIVAL / CREATIVE badge in the top-right corner of the screen.
// Clicking the badge swaps between survival and creative modes.
// Spectator mode is excluded — it's a special mode for map editing/replays.
// Reacts to gameMode:changed events and player game mode updates.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * GameModeBadge — displays a game mode badge overlay in the top-right corner.
     * @param {HTMLElement} container - DOM element to append the badge to.
     */
    Donkeycraft.GameModeBadge = function (container) {
        this._container = container;
        this._player = null;
        this._currentMode = null;
        this._badgeEl = null;
        this._iconEl = null;
        this._labelEl = null;
        this._onSwap = null; // Callback for mode swap (set externally)

        this._createDOM();
    };

    /**
     * Create the badge DOM structure.
     * @private
     */
    Donkeycraft.GameModeBadge.prototype._createDOM = function () {
        // Badge container — clickable to swap between survival and creative
        var badge = document.createElement('div');
        badge.className = 'dk-gamemode-badge';
        this._container.appendChild(badge);
        this._badgeEl = badge;

        // Icon element (background decoration)
        var icon = document.createElement('span');
        icon.className = 'dk-gamemode-badge-icon';
        badge.appendChild(icon);
        this._iconEl = icon;

        // Label text
        var label = document.createElement('span');
        label.className = 'dk-gamemode-badge-label';
        label.textContent = '';
        badge.appendChild(label);
        this._labelEl = label;

        // Click handler — swap between survival and creative
        var self = this;
        badge.addEventListener('click', function (e) {
            e.stopPropagation();
            self._onBadgeClick();
        });
    };

    /**
     * Set the player reference for game mode tracking.
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.GameModeBadge.prototype.setPlayer = function (player) {
        var self = this;

        // Unsubscribe from previous player if any
        if (this._player && this._player._unsubscribeGameMode) {
            this._player._unsubscribeGameMode();
            this._player._unsubscribeGameMode = null;
        }

        this._player = player;

        if (!player) return;

        // Subscribe to game mode changes on the player entity
        // Player tracks gameMode as a property — we use onTick to poll for changes
        this._player._unsubscribeGameMode = this._player.onTick(function () {
            var mode = player.getGameMode ? player.getGameMode() : null;
            if (mode && mode !== self._currentMode) {
                self._updateBadge(mode);
            }
        });

        // Also listen for gameMode:changed events from EventBus
        try {
            var eventBus = Donkeycraft.EventBus.getGlobal ? Donkeycraft.EventBus.getGlobal() : null;
            if (eventBus) {
                eventBus.on('gameMode:changed', function (data) {
                    if (data && data.newMode) {
                        self._updateBadge(data.newMode);
                    }
                });
            }
        } catch (e) {
            // EventBus may not be available
        }

        // Initial update
        var initialMode = player.getGameMode ? player.getGameMode() : null;
        if (initialMode) {
            this._updateBadge(initialMode);
        }
    };

    /**
     * _onBadgeClick — handle badge click to swap between survival and creative.
     * Spectator mode does nothing on click (intentionally excluded).
     * @private
     */
    Donkeycraft.GameModeBadge.prototype._onBadgeClick = function () {
        // Only allow swap for survival and creative modes
        if (this._currentMode !== 'survival' && this._currentMode !== 'creative') {
            return; // Spectator or unknown mode — no action
        }

        // Animate the badge click
        this._animateClick();

        // Determine target mode: survival → creative, creative → survival
        var targetMode = (this._currentMode === 'survival') ? 'creative' : 'survival';

        // Notify external handler (game.js) to perform the actual mode switch
        if (this._onSwap && typeof this._onSwap === 'function') {
            this._onSwap(targetMode);
        }
    };

    /**
     * _animateClick — brief scale bounce animation on badge click.
     * @private
     */
    Donkeycraft.GameModeBadge.prototype._animateClick = function () {
        if (!this._badgeEl) return;
        this._badgeEl.style.animation = 'badge-bounce 200ms ease-out';
        var self = this;
        setTimeout(function () {
            if (self._badgeEl) {
                self._badgeEl.style.animation = 'none';
                void self._badgeEl.offsetWidth; // force reflow
            }
        }, 200);
    };

    /**
     * Update the badge appearance based on game mode.
     * @param {string} mode - 'survival', 'creative', or 'spectator'.
     * @private
     */
    Donkeycraft.GameModeBadge.prototype._updateBadge = function (mode) {
        if (!this._badgeEl || !this._iconEl || !this._labelEl) return;

        // Only animate if the mode is actually changing to a different visible mode
        var wasDifferentVisibleMode = (this._currentMode !== null &&
            this._currentMode !== 'spectator' &&
            mode !== 'spectator' &&
            this._currentMode !== mode);

        this._currentMode = mode;

        // Hide badge for spectator mode
        if (mode === 'spectator') {
            this._badgeEl.style.display = 'none';
            this._badgeEl.style.cursor = 'default';
            return;
        }

        // Show badge for survival/creative
        this._badgeEl.style.display = 'flex';
        this._badgeEl.style.cursor = 'pointer';

        var icon = '';
        var label = '';
        var iconClass = '';

        if (mode === 'survival') {
            icon = '\uD83C\uDFAF'; // 🎯 — direct emoji
            label = 'SURVIVAL';
            iconClass = 'dk-gamemode-badge-icon-survival';
        } else if (mode === 'creative') {
            icon = '\u25C6'; // ◆ — geometric cube-like symbol
            label = 'CREATIVE';
            iconClass = 'dk-gamemode-badge-icon-creative';
        }

        // Animate mode change with spin transition
        if (wasDifferentVisibleMode) {
            this._animateModeSwap();
        }

        this._iconEl.textContent = icon;
        this._iconEl.className = 'dk-gamemode-badge-icon ' + iconClass;
        this._labelEl.textContent = label;
    };

    /**
     * _animateModeSwap — Y-axis spin + scale transition during mode swap.
     * @private
     */
    Donkeycraft.GameModeBadge.prototype._animateModeSwap = function () {
        if (!this._badgeEl) return;
        this._badgeEl.style.animation = 'badge-spin-swap 350ms ease-out';
        var self = this;
        setTimeout(function () {
            if (self._badgeEl) {
                self._badgeEl.style.animation = 'none';
                void self._badgeEl.offsetWidth; // force reflow
            }
        }, 350);
    };

    /**
     * Set the swap callback — called when badge is clicked to swap modes.
     * @param {Function} callback - Function receiving target mode string ('survival' or 'creative').
     */
    Donkeycraft.GameModeBadge.prototype.setOnSwap = function (callback) {
        this._onSwap = callback;
    };

    /**
     * Get the current game mode displayed.
     * @returns {string|null} Current mode or null.
     */
    Donkeycraft.GameModeBadge.prototype.getGameMode = function () {
        return this._currentMode;
    };

    /**
     * Destroy the badge and free resources.
     */
    Donkeycraft.GameModeBadge.prototype.destroy = function () {
        if (this._player && this._player._unsubscribeGameMode) {
            this._player._unsubscribeGameMode();
            this._player._unsubscribeGameMode = null;
        }
        this._player = null;

        if (this._badgeEl && this._badgeEl.parentNode) {
            this._badgeEl.parentNode.removeChild(this._badgeEl);
        }
        this._badgeEl = null;
        this._iconEl = null;
        this._labelEl = null;
        this._container = null;
    };

})();