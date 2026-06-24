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
     * Check if a key was just pressed this frame.
     * @param {string} keyCode
     * @returns {boolean}
     */
    Donkeycraft.Input.prototype.isKeyJustPressed = function(keyCode) {
        return !!this._keyStates[keyCode];
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
     * Reset per-frame mouse deltas. Call at the start of each frame.
     */
    Donkeycraft.Input.prototype.resetMouseDelta = function() {
        this._mouseState.deltaX = 0;
        this._mouseState.deltaY = 0;
    };

    /**
     * Reset per-frame key states (for just-pressed detection).
     */
    Donkeycraft.Input.prototype.resetKeyStates = function() {
        // Key states are persistent (held = true), no reset needed for isKeyDown
        // but we could track just-pressed separately if needed
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
        e.preventDefault();
    };

    Donkeycraft.Input.prototype._onKeyUp = function(e) {
        this._keyStates[e.code] = false;
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
        if (this._mouseCaptured) {
            this._mouseState.deltaX += e.movementX || e.movement.x || 0;
            this._mouseState.deltaY += e.movementY || e.movement.y || 0;
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