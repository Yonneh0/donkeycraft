// Donkeycraft — Input Handler
// Keyboard/mouse input handler: key states, mouse capture, wheel events.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Input — handles keyboard and mouse input.
     */
    Donkeycraft.Input = function() {
        this._keyStates = {};
        this._keyJustPressed = {};
        this._keyLastFrame = {};
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

        // Track raw just-pressed state from event handlers for same-frame press+release
        this._keyJustPressedRaw = {};

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('wheel', this._onWheel, { passive: false });
        window.addEventListener('contextmenu', this._onContextMenu);
        document.addEventListener('pointerlockchange', this._onPointerLockChange);
    };

    /**
     * Request pointer lock (mouse capture) for the given element.
     * @param {HTMLElement} element
     */
    Donkeycraft.Input.prototype.captureMouse = function(element) {
        if (!this._mouseCaptured) {
            element.requestPointerLock();
        }
    };

    /**
     * Release pointer lock.
     */
    Donkeycraft.Input.prototype.releaseMouse = function() {
        if (this._mouseCaptured) {
            document.exitPointerLock();
        }
    };

    /**
     * Check if mouse is currently captured.
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isMouseCaptured = function() {
        return this._mouseCaptured;
    };

    /**
     * Check if a key is currently held down.
     * @param {string} keyCode - The key code (e.g., 'KeyW').
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isKeyDown = function(keyCode) {
        return !!this._keyStates[keyCode];
    };

    /**
     * Check if a key was just pressed this frame (pressed now but not previously).
     * @param {string} keyCode
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isKeyJustPressed = function(keyCode) {
        return !!this._keyJustPressed[keyCode];
    };

    /**
     * Update just-pressed detection. Call at the start of each frame.
     * Combines: (1) raw just-pressed flags from event handlers (catches same-frame press+release),
     * and (2) state transitions detected by comparing against last frame's snapshot.
     */
    Donkeycraft.Input.prototype.updateKeyStates = function() {
        // Clear all just-pressed flags — we'll re-set only the valid ones this frame.
        // This prevents held keys from incorrectly returning true across multiple frames.
        this._keyJustPressed = {};

        // Merge raw just-pressed flags from event handlers (same-frame press+release detection).
        for (var key in this._keyJustPressedRaw) {
            this._keyJustPressed[key] = true;
        }
        this._keyJustPressedRaw = {};

        // Keys that are currently pressed but were not pressed last frame
        // are newly pressed — mark as just-pressed.
        for (var key in this._keyStates) {
            if (this._keyStates[key] && !this._keyLastFrame[key]) {
                this._keyJustPressed[key] = true;
            }
        }

        // Snapshot current state for next frame's comparison.
        this._keyLastFrame = {};
        for (var key in this._keyStates) {
            this._keyLastFrame[key] = !!this._keyStates[key];
        }
    };

    /**
     * Get the current mouse state.
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
     * Get the wheel delta (and reset it).
     * @returns {number}
     */
    Donkeycraft.Input.prototype.getWheelDelta = function() {
        var delta = this._wheelDelta;
        this._wheelDelta = 0;
        return delta;
    };

    /**
     * Get the accumulated mouse delta since the last call (and auto-reset).
     * Returns {{deltaX: number, deltaY: number}} and resets deltas to zero.
     * This auto-resets so callers don't need to manually call resetMouseDelta().
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
     * Destroy the input handler and remove all event listeners.
     */
    Donkeycraft.Input.prototype.destroy = function() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('wheel', this._onWheel);
        window.removeEventListener('contextmenu', this._onContextMenu);
        document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    };

    // --- Event Handlers ---

    Donkeycraft.Input.prototype._onKeyDown = function(e) {
        this._keyStates[e.code] = true;
        // Mark as raw just-pressed so same-frame press+release is captured.
        this._keyJustPressedRaw[e.code] = true;

        // Only prevent default for game-relevant keys to avoid blocking browser shortcuts
        var gameKeys = [
            'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ControlLeft',
            'KeyE', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
            'Digit6', 'Digit7', 'Digit8', 'Digit9',
            'F3', 'F5'
        ];
        if (gameKeys.indexOf(e.code) !== -1) {
            e.preventDefault();
        }
    };

    Donkeycraft.Input.prototype._onKeyUp = function(e) {
        this._keyStates[e.code] = false;
        // Don't clear _keyJustPressedRaw — the key WAS pressed this frame,
        // and updateKeyStates() will handle merging/cleanup.
    };

    Donkeycraft.Input.prototype._onMouseDown = function(e) {
        switch (e.button) {
            case 0: this._mouseState.left = true; break;
            case 1: this._mouseState.middle = true; break;
            case 2: this._mouseState.right = true; break;
        }
    };

    Donkeycraft.Input.prototype._onMouseUp = function(e) {
        switch (e.button) {
            case 0: this._mouseState.left = false; break;
            case 1: this._mouseState.middle = false; break;
            case 2: this._mouseState.right = false; break;
        }
    };

    Donkeycraft.Input.prototype._onMouseMove = function(e) {
        // Always track absolute mouse position (client coordinates)
        this._mouseState.x = e.clientX;
        this._mouseState.y = e.clientY;

        if (this._mouseCaptured) {
            this._mouseState.deltaX += e.movementX || 0;
            this._mouseState.deltaY += e.movementY || 0;
        }
    };

    Donkeycraft.Input.prototype._onWheel = function(e) {
        this._wheelDelta += e.deltaY;
        e.preventDefault();
    };

    Donkeycraft.Input.prototype._onContextMenu = function(e) {
        e.preventDefault();
    };

    Donkeycraft.Input.prototype._onPointerLockChange = function() {
        this._mouseCaptured = (document.pointerLockElement !== null);
    };

})();