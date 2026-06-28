// Donkeycraft — Input Handler
// Keyboard/mouse input handler: key states, mouse capture, wheel events.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Input — handles keyboard and mouse input for first-person gameplay.
     *
     * Tracks key down/just-pressed states, mouse button states, mouse delta
     * (only while pointer is locked), and wheel scroll delta.
     *
     * Mouse delta accumulates from `movementX`/`movementY` only when pointer
     * lock is active (`document.pointerLockElement !== null`). When pointer lock
     * is lost, absolute position is still tracked but delta stops accumulating.
     *
     * Call `updateKeyStates()` and `updateMouseButtonStates()` at the start
     * of each game frame to refresh just-pressed detection.
     */
    Donkeycraft.Input = function() {
        // --- Key state tracking ---
        this._keyStates = {};
        this._keyJustPressed = {};
        this._keyLastFrame = {};
        this._keyJustPressedRaw = {};

        // --- Mouse state tracking ---
        this._mouseState = {
            left: false,
            right: false,
            middle: false,
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0
        };
        this._mouseCaptured = false;
        this._wheelDelta = 0;

        // Raw just-pressed flags from event handlers (same-frame press+release)
        this._mouseButtonJustPressedRaw = { left: false, right: false, middle: false };
        this._mouseButtonJustPressed = { left: false, right: false, middle: false };
        this._mouseButtonLastFrame = {};

        // --- Bound event handler references ---
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);

        // --- Register event listeners ---
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('wheel', this._onWheel, { passive: false });
        window.addEventListener('contextmenu', this._onContextMenu);
        document.addEventListener('pointerlockchange', this._onPointerLockChange);
    };

    // ============================================================
    // Public API — Mouse Capture
    // ============================================================

    /**
     * Request pointer lock (mouse capture) for the given element.
     * The _mouseCaptured flag is set asynchronously by the browser via
     * the 'pointerlockchange' event — do NOT set it synchronously here.
     * @param {HTMLElement} element - Element to request pointer lock on.
     */
    Donkeycraft.Input.prototype.captureMouse = function(element) {
        if (!this._mouseCaptured) {
            try {
                element.requestPointerLock();
            } catch (e) {
                // Pointer lock may fail if element isn't focused or in foreground
            }
        }
    };

    /**
     * Release pointer lock.
     */
    Donkeycraft.Input.prototype.releaseMouse = function() {
        if (this._mouseCaptured && document.pointerLockElement) {
            document.exitPointerLock();
        }
    };

    /**
     * Check if mouse is currently captured (pointer locked).
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isMouseCaptured = function() {
        return this._mouseCaptured;
    };

    // ============================================================
    // Public API — Keyboard Input
    // ============================================================

    /**
     * Check if a key is currently held down.
     * @param {string} keyCode - The key code (e.g., 'KeyW', 'Space').
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isKeyDown = function(keyCode) {
        return !!this._keyStates[keyCode];
    };

    /**
     * Check if a key was just pressed this frame (pressed now but not previously).
     * @param {string} keyCode - The key code (e.g., 'KeyW', 'Space').
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isKeyJustPressed = function(keyCode) {
        return !!this._keyJustPressed[keyCode];
    };

    /**
     * Update just-pressed detection for keyboard. Call at the start of each frame.
     * Combines: (1) raw just-pressed flags from event handlers (catches same-frame
     * press+release), and (2) state transitions detected by comparing against last
     * frame's snapshot.
     */
    Donkeycraft.Input.prototype.updateKeyStates = function() {
        // Clear all just-pressed flags — re-set only valid ones this frame.
        this._keyJustPressed = {};

        // Merge raw just-pressed from event handlers (same-frame press+release).
        var self = this;
        Object.keys(this._keyJustPressedRaw).forEach(function(key) {
            if (self._keyJustPressedRaw[key]) {
                self._keyJustPressed[key] = true;
            }
        });
        this._keyJustPressedRaw = {};

        // Keys currently pressed but not pressed last frame = newly pressed.
        Object.keys(this._keyStates).forEach(function(key) {
            if (self._keyStates[key] && !self._keyLastFrame[key]) {
                self._keyJustPressed[key] = true;
            }
        });

        // Snapshot current state for next frame's comparison.
        this._keyLastFrame = {};
        Object.keys(this._keyStates).forEach(function(key) {
            self._keyLastFrame[key] = !!self._keyStates[key];
        });
    };

    // ============================================================
    // Public API — Mouse Button Input
    // ============================================================

    /**
     * Check if a mouse button is currently held down.
     * @param {string} button - Button name: 'left', 'right', or 'middle'.
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isMouseButtonPressed = function(button) {
        return !!this._mouseState[button];
    };

    /**
     * Check if a mouse button was just pressed this frame.
     * @param {string} button - Button name: 'left', 'right', or 'middle'.
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isMouseButtonJustPressed = function(button) {
        return !!this._mouseButtonJustPressed[button];
    };

    /**
     * Update just-pressed detection for mouse buttons. Call at the start of each
     * frame, alongside or before updateKeyStates().
     */
    Donkeycraft.Input.prototype.updateMouseButtonStates = function() {
        // Clear all just-pressed flags — re-set only valid ones this frame.
        this._mouseButtonJustPressed = { left: false, right: false, middle: false };

        // Merge raw just-pressed from event handlers (same-frame press+release).
        var self = this;
        Object.keys(this._mouseButtonJustPressedRaw).forEach(function(btn) {
            if (self._mouseButtonJustPressedRaw[btn]) {
                self._mouseButtonJustPressed[btn] = true;
            }
        });
        this._mouseButtonJustPressedRaw = { left: false, right: false, middle: false };

        // Detect transitions: button is pressed now but wasn't last frame.
        Object.keys(this._mouseState).forEach(function(btn) {
            if (btn === 'x' || btn === 'y' || btn === 'deltaX' || btn === 'deltaY') return;
            if (self._mouseState[btn] && !self._mouseButtonLastFrame[btn]) {
                self._mouseButtonJustPressed[btn] = true;
            }
        });

        // Snapshot current state for next frame.
        this._mouseButtonLastFrame = {};
        Object.keys(this._mouseState).forEach(function(btn) {
            if (btn === 'x' || btn === 'y' || btn === 'deltaX' || btn === 'deltaY') return;
            self._mouseButtonLastFrame[btn] = !!self._mouseState[btn];
        });
    };

    // ============================================================
    // Public API — Mouse Position & Delta
    // ============================================================

    /**
     * Get the current mouse state (absolute position + button states).
     * NOTE: deltaX/deltaY are NOT auto-reset by this method. Use getMouseDelta()
     * or resetMouseDelta() for auto-reset behavior.
     * @returns {{left: boolean, right: boolean, middle: boolean, x: number, y: number, deltaX: number, deltaY: number}}
     */
    Donkeycraft.Input.prototype.getMouseState = function() {
        return {
            left: this._mouseState.left,
            right: this._mouseState.right,
            middle: this._mouseState.middle,
            x: this._mouseState.x,
            y: this._mouseState.y,
            deltaX: this._mouseState.deltaX,
            deltaY: this._mouseState.deltaY
        };
    };

    /**
     * Get the accumulated mouse delta since the last call (and auto-reset).
     * Returns {{deltaX: number, deltaY: number}} and resets deltas to zero.
     * @returns {{deltaX: number, deltaY: number}}
     */
    Donkeycraft.Input.prototype.getMouseDelta = function() {
        var dx = this._mouseState.deltaX;
        var dy = this._mouseState.deltaY;
        this._mouseState.deltaX = 0;
        this._mouseState.deltaY = 0;
        return { deltaX: dx, deltaY: dy };
    };

    /**
     * Reset accumulated mouse delta to zero without reading it.
     */
    Donkeycraft.Input.prototype.resetMouseDelta = function() {
        this._mouseState.deltaX = 0;
        this._mouseState.deltaY = 0;
    };

    // ============================================================
    // Public API — Wheel Input
    // ============================================================

    /**
     * Get the wheel delta (and reset it to zero).
     * @returns {number}
     */
    Donkeycraft.Input.prototype.getWheelDelta = function() {
        var delta = this._wheelDelta;
        this._wheelDelta = 0;
        return delta;
    };

    // ============================================================
    // Public API — Cleanup
    // ============================================================

    /**
     * Destroy the input handler and remove all event listeners.
     * Releases pointer lock if active, clears all internal state.
     */
    Donkeycraft.Input.prototype.destroy = function() {
        // Release pointer lock if active to prevent browser from staying locked
        if (this._mouseCaptured) {
            this.releaseMouse();
        }

        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('wheel', this._onWheel);
        window.removeEventListener('contextmenu', this._onContextMenu);
        document.removeEventListener('pointerlockchange', this._onPointerLockChange);

        // Clear all internal state
        this._keyStates = {};
        this._keyJustPressed = {};
        this._keyLastFrame = {};
        this._keyJustPressedRaw = {};
        this._mouseButtonJustPressed = {};
        this._mouseButtonJustPressedRaw = {};
        this._mouseButtonLastFrame = {};
        this._mouseState = null;
        this._onKeyDown = null;
        this._onKeyUp = null;
        this._onMouseDown = null;
        this._onMouseUp = null;
        this._onMouseMove = null;
        this._onWheel = null;
        this._onContextMenu = null;
        this._onPointerLockChange = null;
    };

    // ============================================================
    // Private — Event Handlers
    // ============================================================

    /**
     * Key down event handler.
     * @private
     */
    Donkeycraft.Input.prototype._onKeyDown = function(e) {
        this._keyStates[e.code] = true;

        // Only mark as just-pressed on initial key-down, not auto-repeats.
        if (!e.repeat) {
            this._keyJustPressedRaw[e.code] = true;
        }

        // Prevent default for game-relevant keys to avoid blocking browser shortcuts.
        var gameKeys = [
            'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ControlLeft',
            'KeyE', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
            'Digit6', 'Digit7', 'Digit8', 'Digit9',
            'F3', 'F5', 'KeyG'
        ];
        if (gameKeys.indexOf(e.code) !== -1) {
            e.preventDefault();
        }
    };

    /**
     * Key up event handler.
     * @private
     */
    Donkeycraft.Input.prototype._onKeyUp = function(e) {
        this._keyStates[e.code] = false;
        // Don't clear _keyJustPressedRaw — the key WAS pressed this frame,
        // and updateKeyStates() will handle merging/cleanup.
    };

    /**
     * Mouse down event handler.
     * @private
     */
    Donkeycraft.Input.prototype._onMouseDown = function(e) {
        switch (e.button) {
            case 0: this._mouseState.left = true; this._mouseButtonJustPressedRaw.left = true; break;
            case 1: this._mouseState.middle = true; this._mouseButtonJustPressedRaw.middle = true; break;
            case 2: this._mouseState.right = true; this._mouseButtonJustPressedRaw.right = true; break;
        }
    };

    /**
     * Mouse up event handler.
     * @private
     */
    Donkeycraft.Input.prototype._onMouseUp = function(e) {
        switch (e.button) {
            case 0: this._mouseState.left = false; break;
            case 1: this._mouseState.middle = false; break;
            case 2: this._mouseState.right = false; break;
        }
    };

    /**
     * Mouse move event handler.
     * @private
     */
    Donkeycraft.Input.prototype._onMouseMove = function(e) {
        // Always track absolute mouse position (client coordinates).
        this._mouseState.x = e.clientX;
        this._mouseState.y = e.clientY;

        // Only accumulate delta when pointer lock is active.
        if (this._mouseCaptured) {
            this._mouseState.deltaX += e.movementX || 0;
            this._mouseState.deltaY += e.movementY || 0;
        }
    };

    /**
     * Wheel event handler.
     * @private
     */
    Donkeycraft.Input.prototype._onWheel = function(e) {
        this._wheelDelta += e.deltaY;
        e.preventDefault();
    };

    /**
     * Context menu event handler — block right-click context menu.
     * @private
     */
    Donkeycraft.Input.prototype._onContextMenu = function(e) {
        e.preventDefault();
    };

    /**
     * Pointer lock change event handler — updates _mouseCaptured flag.
     * @private
     */
    Donkeycraft.Input.prototype._onPointerLockChange = function() {
        this._mouseCaptured = (document.pointerLockElement !== null);
    };

})();