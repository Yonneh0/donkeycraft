// Donkeycraft — Keybindings Panel
// Display-only top-center panel showing all keybindings as styled keycaps.
// Transparent, non-interactive — all clicks pass through to the rendered area below.
// Dynamically updates key display based on current game mode and player state.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * KeybindingsPanel — renders a single-row display of all keybindings at the top-center.
   * Each key is shown as a keycap SVG with uppercase text inside, label centered below.
   */
  Donkeycraft.KeybindingsPanel = function () {
    this._element = null;
    this._unsubscribeRender = null;
    this._gameMode = 'survival';
    this._isFlying = false;
    this._htmlBuilt = false;
    this._initDOM();
  };

  /**
   * _initDOM — cache a reference to the keybindings panel DOM element.
   * @private
   */
  Donkeycraft.KeybindingsPanel.prototype._initDOM = function () {
    this._element = document.getElementById('dk-keybindings-panel');
  };

  /**
   * _isWideKey — check if a key label should use the wide keycap (SPACE, SHIFT).
   * @private
   * @param {string} text - Key display text.
   * @returns {boolean}
   */
  Donkeycraft.KeybindingsPanel.prototype._isWideKey = function (text) {
    return text === 'SPACE' || text === 'SHIFT';
  };

  /**
   * _getKeyLabel — converts a key code to uppercase display text.
   * @private
   * @param {string} keyCode - The key code from Config.KEYBINDS.
   * @returns {string} Display label in caps.
   */
  Donkeycraft.KeybindingsPanel.prototype._getKeyLabel = function (keyCode) {
    var keyMap = {
      KeyW: 'W',
      KeyA: 'A',
      KeyS: 'S',
      KeyD: 'D',
      Space: 'SPACE',
      ShiftLeft: 'SHIFT',
      KeyE: 'E',
      KeyQ: 'Q',
      KeyZ: 'Z',
      KeyP: 'P',
      KeyF: 'F',
      KeyT: 'T',
      Digit1: '1',
      Digit2: '2',
      Digit3: '3',
      Digit4: '4',
      Digit5: '5',
      Digit6: '6',
      Digit7: '7',
      Digit8: '8',
      Digit9: '9',
      F3: 'F3',
      F5: 'F5',
    };
    return keyMap[keyCode] || keyCode;
  };

  /**
   * _buildKeycapHTML — create a keycap HTML string with the appropriate class.
   * @private
   * @param {string} text - Key text to display inside the keycap.
   * @returns {string} HTML string for the keycap.
   */
  Donkeycraft.KeybindingsPanel.prototype._buildKeycapHTML = function (text) {
    var cls = this._isWideKey(text) ? 'dk-keycap-wide' : 'dk-keycap-narrow';
    return (
      '<span class="dk-keycap ' +
      cls +
      '"><span class="dk-kb-key-text">' +
      text +
      '</span></span>'
    );
  };

  /**
   * _buildKeyItemHTML — create a vertical key-item (keycap above label).
   * @private
   * @param {string} keyText - Key text for the keycap.
   * @param {string} label - Purpose label underneath.
   * @returns {string} HTML string.
   */
  Donkeycraft.KeybindingsPanel.prototype._buildKeyItemHTML = function (
    keyText,
    label
  ) {
    return (
      '<span class="dk-kb-key-item">' +
      this._buildKeycapHTML(keyText) +
      '<span class="dk-kb-label">' +
      label +
      '</span>' +
      '</span>'
    );
  };

  /**
   * _buildHTMLString — build the panel HTML as a string with keycap elements.
   * Layout: horizontal groups of vertical key-items (keycap on top, label below).
   * @private
   * @param {Object} kb - Config.KEYBINDS.
   * @param {boolean} isCreative - Whether in creative mode.
   * @param {boolean} isFlying - Whether flying is enabled.
   * @returns {string} HTML string.
   */
  Donkeycraft.KeybindingsPanel.prototype._buildHTMLString = function (
    kb,
    isCreative,
    isFlying
  ) {
    var self = this;
    var sep = '<span class="dk-kb-separator">│</span>';

    // Helper: create a single key-item HTML string
    function keyItem(keyText, label) {
      return self._buildKeyItemHTML(keyText, label);
    }

    // Helper: create a group of key-items with a shared label (for movement/hotbar)
    function groupWithSharedLabel(keysHtml, label) {
      return (
        '<span class="dk-kb-group">' +
        keysHtml +
        '</span>' +
        '<span class="dk-kb-key-item"><span class="dk-kb-label" style="visibility:hidden;">.</span><span class="dk-kb-label">' +
        label +
        '</span></span>'
      );
    }

    var parts = [];

    // Movement group (W A S D)
    parts.push(
      groupWithSharedLabel(
        keyItem('W', '') +
          ' ' +
          keyItem('A', '') +
          ' ' +
          keyItem('S', '') +
          ' ' +
          keyItem('D', ''),
        'move'
      )
    );

    // Jump
    parts.push(keyItem(self._getKeyLabel(kb.JUMP), 'jump'));

    // Vertical movement (flying) or speed controls (grounded)
    if (isFlying) {
      parts.push(keyItem(self._getKeyLabel(kb.SPEED_DOWN), 'down'));
      parts.push(keyItem(self._getKeyLabel(kb.SPEED_UP), 'up'));
    } else {
      parts.push(keyItem(self._getKeyLabel(kb.SPEED_DOWN), 'slow'));
      parts.push(keyItem(self._getKeyLabel(kb.SPEED_UP), 'fast'));
    }

    // Speed cycle (Shift)
    parts.push(keyItem(self._getKeyLabel(kb.SPEED_CYCLE), 'spd'));

    // Inventory
    parts.push(keyItem(self._getKeyLabel(kb.INVENTORY), 'inv'));

    // Debug screen
    parts.push(keyItem(self._getKeyLabel(kb.DEBUG_SCREEN), 'dbg'));

    // Mode-specific keys: fly (F) and turbo (T) only in creative mode
    if (isCreative) {
      parts.push(keyItem(self._getKeyLabel(kb.FLY_TOGGLE), 'fly'));
      parts.push(keyItem(self._getKeyLabel(kb.TURBO_TOGGLE), 'turbo'));
    }

    // Drop item (P)
    parts.push(keyItem(self._getKeyLabel(kb.DROP_ITEM), 'drop'));

    // Hotbar keys 1-9
    var hotkeys = [];
    for (var i = 1; i <= 9; i++) {
      var digitKey = 'Digit' + i;
      if (kb[digitKey]) {
        hotkeys.push(keyItem(self._getKeyLabel(digitKey), ''));
      }
    }
    if (hotkeys.length > 0) {
      parts.push(groupWithSharedLabel(hotkeys.join(' '), 'slots'));
    }

    // Input lock status indicator
    parts.push(
      '<span class="dk-kb-group dk-kb-input-status" id="dk-kb-input-status">' +
        '<span class="dk-kb-mouse-emoji">🖱</span>' +
        '<span class="dk-kb-status-text dk-kb-unlocked">unlocked</span>' +
        '</span>'
    );

    return parts.join(sep);
  };

  /**
   * update — refreshes the panel content (keybindings HTML + input lock status).
   * Called every render frame to keep the lock status indicator current.
   * Rebuilds HTML when game mode or flying state changes.
   * @param {Donkeycraft.Input} [input] - Input instance (unused, lock status uses document.pointerLockElement).
   */
  Donkeycraft.KeybindingsPanel.prototype.update = function (input) {
    if (!this._element) return;

    // Rebuild HTML when game mode or flying state changes
    if (!this._htmlBuilt || this._gameModeDirty || this._flyingDirty) {
      var kb = Donkeycraft.Config.KEYBINDS;
      this._element.innerHTML = this._buildHTMLString(
        kb,
        this._gameMode === 'creative',
        this._isFlying
      );
      this._htmlBuilt = true;
      this._gameModeDirty = false;
      this._flyingDirty = false;
    }

    // Update input lock status indicator
    var statusEl = document.getElementById('dk-kb-input-status');
    if (statusEl) {
      var textEl = statusEl.querySelector('.dk-kb-status-text');
      if (textEl) {
        var locked = document.pointerLockElement !== null;
        textEl.className = locked
          ? 'dk-kb-status-text dk-kb-locked'
          : 'dk-kb-status-text dk-kb-unlocked';
        textEl.textContent = locked ? '🔒 locked' : '🔓 unlocked';
      }
    }
  };

  /**
   * setGameMode — update the game mode and rebuild the panel if changed.
   * @param {string} mode - 'survival', 'creative', or 'spectator'.
   */
  Donkeycraft.KeybindingsPanel.prototype.setGameMode = function (mode) {
    if (!mode || mode === this._gameMode) return;
    this._gameMode = mode;
    this._gameModeDirty = true;
  };

  /**
   * setFlyingState — update the flying state and rebuild the panel if changed.
   * @param {boolean} flying - True if player is currently flying.
   */
  Donkeycraft.KeybindingsPanel.prototype.setFlyingState = function (flying) {
    if (flying === this._isFlying) return;
    this._isFlying = !!flying;
    this._flyingDirty = true;
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
      Donkeycraft.Logger.warn(
        'KeybindingsPanel',
        'Failed to start listening: ' + e.message
      );
    }
  };

  /**
   * stopListening — stops auto-updating.
   */
  Donkeycraft.KeybindingsPanel.prototype.stopListening = function () {
    if (this._unsubscribeRender) {
      try {
        this._unsubscribeRender();
      } catch (e) {}
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
