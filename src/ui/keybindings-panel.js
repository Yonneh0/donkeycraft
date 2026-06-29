// Donkeycraft — Keybindings Panel
// Display-only top-center panel showing all keybindings and input lock status.
// Transparent, non-interactive — all clicks pass through to the rendered area below.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * KeybindingsPanel — renders a single-row display of all keybindings at the top-center of the screen.
     * Uses emoji/unicode for keys and shows input lock status with a mouse emoji.
     * The panel is display-only: pointer-events: none ensures clicks pass through.
     */
    Donkeycraft.KeybindingsPanel = function () {
        this._element = null;
        this._unsubscribeRender = null;
        this._initDOM();
    };

    /**
     * _initDOM — caches a reference to the keybindings panel DOM element.
     * @private
     */
    Donkeycraft.KeybindingsPanel.prototype._initDOM = function () {
        this._element = document.getElementById('dk-keybindings-panel');
    };

    /**
     * _getKeyLabel — converts a key code (e.g., 'KeyW', 'Digit1') to a human-readable label with emoji.
     * @private
     * @param {string} keyCode - The key code from Config.KEYBINDS.
     * @returns {string} Display label with emoji and styled key text.
     */
    Donkeycraft.KeybindingsPanel.prototype._getKeyLabel = function (keyCode) {
        // Map known key codes to display labels wrapped in brackets
        var keyMap = {
            'KeyW': '[W]',
            'KeyA': '[A]',
            'KeyS': '[S]',
            'KeyD': '[D]',
            'Space': '[SPACE]',
            'ShiftLeft': '[SHIFT]',
            'ControlLeft': '[CTRL]',
            'KeyE': '[E]',
            'KeyQ': '[Q]',
            'Digit1': '[1]',
            'Digit2': '[2]',
            'Digit3': '[3]',
            'Digit4': '[4]',
            'Digit5': '[5]',
            'Digit6': '[6]',
            'Digit7': '[7]',
            'Digit8': '[8]',
            'Digit9': '[9]',
            'F3': '[F3]',
            'F5': '[F5]',
            'KeyF': '[F]'
        };
        return keyMap[keyCode] || keyCode;
    };

    /**
     * _buildHTML — constructs the panel HTML string from Config.KEYBINDS.
     * @private
     * @returns {string} HTML for the keybindings display.
     */
    Donkeycraft.KeybindingsPanel.prototype._buildHTML = function () {
        var kb = Donkeycraft.Config.KEYBINDS;
        if (!kb) return '';

        var groups = [];

        // Movement group
        groups.push(
            '<span class="dk-kb-group">' +
            '<span class="dk-kb-keys">[W] [A] [S] [D]</span>' +
            '<span class="dk-kb-label">move</span>' +
            '</span>'
        );

        // Jump
        groups.push(
            '<span class="dk-kb-group">' +
            '<span class="dk-kb-keys">' + this._getKeyLabel(kb.JUMP) + '</span>' +
            '<span class="dk-kb-label">jump</span>' +
            '</span>'
        );

        // Sprint / Sneak
        groups.push(
            '<span class="dk-kb-group">' +
            '<span class="dk-kb-keys">' + this._getKeyLabel(kb.SPRINT) + '</span>' +
            '<span class="dk-kb-label">sprint</span>' +
            '</span>'
        );
        groups.push(
            '<span class="dk-kb-group">' +
            '<span class="dk-kb-keys">' + this._getKeyLabel(kb.SNEAK) + '</span>' +
            '<span class="dk-kb-label">sneak</span>' +
            '</span>'
        );

        // Inventory / Fly / Debug
        groups.push(
            '<span class="dk-kb-group">' +
            '<span class="dk-kb-keys">' + this._getKeyLabel(kb.INVENTORY) + '</span>' +
            '<span class="dk-kb-label">inv</span>' +
            '</span>'
        );
        groups.push(
            '<span class="dk-kb-group">' +
            '<span class="dk-kb-keys">' + this._getKeyLabel(kb.FLY_TOGGLE) + '</span>' +
            '<span class="dk-kb-label">fly</span>' +
            '</span>'
        );
        groups.push(
            '<span class="dk-kb-group">' +
            '<span class="dk-kb-keys">' + this._getKeyLabel(kb.DEBUG_SCREEN) + '</span>' +
            '<span class="dk-kb-label">debug</span>' +
            '</span>'
        );

        // Hotbar keys 1-9
        var hotkeyLabels = [];
        for (var i = 1; i <= 9; i++) {
            var digitKey = 'Digit' + i;
            if (kb[digitKey]) {
                hotkeyLabels.push(this._getKeyLabel(digitKey));
            }
        }
        if (hotkeyLabels.length > 0) {
            groups.push(
                '<span class="dk-kb-group">' +
                '<span class="dk-kb-keys">' + hotkeyLabels.join(' ') + '</span>' +
                '<span class="dk-kb-label">slots</span>' +
                '</span>'
            );
        }

        // Input lock status indicator (updated dynamically in update())
        groups.push(
            '<span class="dk-kb-group dk-kb-input-status" id="dk-kb-input-status">' +
            '<span class="dk-kb-mouse-emoji">🖱️</span>' +
            '<span class="dk-kb-status-text dk-kb-unlocked">unlocked</span>' +
            '</span>'
        );

        return groups.join('<span class="dk-kb-separator">│</span>');
    };

    /**
     * update — refreshes the panel content (keybindings HTML + input lock status).
     * Called every render frame to keep the lock status indicator current.
     * @param {Donkeycraft.Input} [input] - Input instance (unused, lock status uses document.pointerLockElement).
     */
    Donkeycraft.KeybindingsPanel.prototype.update = function (input) {
        if (!this._element) return;

        // Build HTML once, then update only the lock status each frame
        if (!this._htmlBuilt) {
            this._element.innerHTML = this._buildHTML();
            this._htmlBuilt = true;
        }

        // Update input lock status indicator
        var statusEl = document.getElementById('dk-kb-input-status');
        if (statusEl) {
            var textEl = statusEl.querySelector('.dk-kb-status-text');
            if (textEl) {
                var locked = document.pointerLockElement !== null;
                textEl.className = locked ? 'dk-kb-status-text dk-kb-locked' : 'dk-kb-status-text dk-kb-unlocked';
                textEl.textContent = locked ? '🔒 locked' : '🔓 unlocked';
            }
        }
    };

    /**
     * startListening — starts auto-updating on each render frame via Timer.onRender().
     * @param {Object} timer - Donkeycraft.Timer instance (must have onRender method).
     */
    Donkeycraft.KeybindingsPanel.prototype.startListening = function (timer) {
        if (this._unsubscribeRender || !timer) return;

        var self = this;
        try {
            this._unsubscribeRender = timer.onRender(function () {
                self.update();
            });
        } catch (e) {
            Donkeycraft.Logger.warn('KeybindingsPanel', 'Failed to start listening: ' + e.message);
        }
    };

    /**
     * stopListening — stops auto-updating.
     */
    Donkeycraft.KeybindingsPanel.prototype.stopListening = function () {
        if (this._unsubscribeRender) {
            try { this._unsubscribeRender(); } catch (e) { }
            this._unsubscribeRender = null;
        }
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.KeybindingsPanel.prototype.destroy = function () {
        this.stopListening();
        if (this._element) {
            this._element.innerHTML = '';
            this._element = null;
        }
    };

})();