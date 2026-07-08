/**
 * Donkeycraft — Terrain Camera & Input Controller
 * Standalone module for terrain viewer camera control, input handling,
 * matrix mathematics, and frame-rate independent movement.
 * @module terrain
 */
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    // ============================================================
    // Speed Level Constants
    // ============================================================

    /**
     * Speed levels: [walk, jog, sprint] in blocks per second.
     * @type {number[]}
     * @private
     */
    var SPEED_LEVELS = [0.5, 2, 4];

    /**
     * Speed level display names.
     * @type {string[]}
     * @private
     */
    var SPEED_NAMES = ['Walk', 'Jog', 'Sprint'];

    /**
     * Speed level emoji icons.
     * @type {string[]}
     * @private
     */
    var SPEED_EMOJIS = ['🚶', '🏃', '⚡'];

    /**
     * Duration in milliseconds for the speed indicator overlay visibility.
     * @type {number}
     * @private
     */
    var SPEED_INDICATOR_DURATION = 1200;

    /**
     * Minimum pitch angle in radians to prevent camera flip (slightly above 90 degrees).
     * @type {number}
     * @private
     */
    var MIN_PITCH = -Math.PI / 2 + 0.01;

    /**
     * Maximum pitch angle in radians to prevent camera flip (slightly below 270 degrees).
     * @type {number}
     * @private
     */
    var MAX_PITCH = Math.PI / 2 - 0.01;

    // ============================================================
    // TerrainController Constructor
    // ============================================================

    /**
     * TerrainController — Manages camera control, input handling, and matrix mathematics
     * for the terrain viewer. Handles keyboard input, mouse look with pointer lock,
     * frame-rate independent movement, FPS tracking, and speed level cycling.
     *
     * @constructor
     */
    Donkeycraft.TerrainController = function () {
        /** @type {HTMLCanvasElement|null} */
        this._canvas = null;

        /** @type {string|null} */
        this._canvasId = null;

        // Camera state
        /** @type {{x: number, y: number, z: number, yaw: number, pitch: number}} */
        this._camera = { x: 0, y: 100, z: 0, yaw: 0, pitch: 0 };

        // Input state
        /** @type {Object.<string, boolean>} */
        this._keys = {};

        /** @type {number} */
        this._mouseDX = 0;

        /** @type {number} */
        this._mouseDY = 0;

        /** @type {boolean} */
        this._pointerLocked = false;

        // Timing state
        /** @type {number} */
        this._lastFrameTime = 0;

        /** @type {number} */
        this._frameCount = 0;

        /** @type {number} */
        this._lastFpsTime = 0;

        /** @type {number} */
        this._currentFps = 0;

        // Speed state
        /** @type {number} */
        this._speedLevel = 0;

        // Tab visibility (pause input when hidden)
        /** @type {boolean} */
        this._isTabVisible = true;

        // Ready flag
        /** @type {boolean} */
        this._ready = false;

        // Custom key action callbacks (registered by external modules)
        /** @type {Object.<string, Function>} */
        this._keyActions = {};
    };

    /**
     * Register a callback for a specific key code.
     * Used by external modules to handle special keys (R, E, F, Q, etc.).
     * The callback is only invoked on the initial keydown press, not on repeat events.
     *
     * @param {string} keyCode - The keyboard code (e.g., 'KeyR').
     * @param {Function} callback - The callback function to invoke on keydown.
     */
    Donkeycraft.TerrainController.prototype.registerKeyAction = function (keyCode, callback) {
        if (typeof keyCode === 'string' && typeof callback === 'function') {
            this._keyActions[keyCode] = callback;
        }
    };

    /**
     * Unregister a previously registered key action.
     * @param {string} keyCode - The keyboard code to unregister.
     */
    Donkeycraft.TerrainController.prototype.unregisterKeyAction = function (keyCode) {
        delete this._keyActions[keyCode];
    };

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Initialize the terrain controller.
     * Sets up canvas, registers keyboard/mouse event listeners, and initializes state.
     * Safe to call multiple times — resets all internal state if re-initializing.
     *
     * @param {string} canvasId - The ID of the canvas element to attach controls to.
     * @returns {boolean} True if initialization succeeded.
     */
    Donkeycraft.TerrainController.prototype.init = function (canvasId) {
        if (typeof canvasId !== 'string' || !canvasId) {
            console.error('[TerrainController] Invalid canvas ID provided.');
            return false;
        }
        this._canvasId = canvasId;
        this._canvas = document.getElementById(canvasId);
        if (!this._canvas) {
            console.error('[TerrainController] Canvas not found:', canvasId);
            return false;
        }

        // Reset state
        this._camera = { x: 0, y: 100, z: 0, yaw: 0, pitch: 0 };
        this._keys = {};
        this._mouseDX = 0;
        this._mouseDY = 0;
        this._pointerLocked = false;
        this._lastFrameTime = 0;
        this._frameCount = 0;
        this._lastFpsTime = 0;
        this._currentFps = 0;
        this._speedLevel = 0;
        this._isTabVisible = true;

        // Setup input listeners
        this._setupInputListeners();

        // Load saved state from localStorage
        this.loadState();

        this._ready = true;
        return true;
    };

    /**
     * Get the current camera position.
     * @returns {{x: number, y: number, z: number}} Copy of the camera position object.
     */
    Donkeycraft.TerrainController.prototype.getCameraPosition = function () {
        return { x: this._camera.x, y: this._camera.y, z: this._camera.z };
    };

    /**
     * Set the current camera position.
     * All parameters are validated and clamped to reasonable world bounds.
     *
     * @param {number} x - World X coordinate.
     * @param {number} y - World Y coordinate (height).
     * @param {number} z - World Z coordinate.
     */
    Donkeycraft.TerrainController.prototype.setCameraPosition = function (x, y, z) {
        if (!isFinite(x)) x = this._camera.x;
        if (!isFinite(y)) y = this._camera.y;
        if (!isFinite(z)) z = this._camera.z;
        this._camera.x = x;
        this._camera.y = y;
        this._camera.z = z;
    };

    /**
     * Get the current camera rotation.
     * @returns {{yaw: number, pitch: number}} Copy of the camera rotation object.
     */
    Donkeycraft.TerrainController.prototype.getCameraRotation = function () {
        return { yaw: this._camera.yaw, pitch: this._camera.pitch };
    };

    /**
     * Set the current camera rotation.
     * Yaw wraps to [-π, π]. Pitch is clamped to prevent camera flip.
     *
     * @param {number} yaw - Horizontal rotation in radians.
     * @param {number} pitch - Vertical rotation in radians (clamped to ±(π/2 - 0.01)).
     */
    Donkeycraft.TerrainController.prototype.setCameraRotation = function (yaw, pitch) {
        if (!isFinite(yaw)) yaw = this._camera.yaw;
        this._camera.yaw = yaw;
        this._camera.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
    };

    /**
     * Get the full camera state (position + rotation).
     * Returns a shallow copy to prevent external mutation of internal state.
     * @returns {{x: number, y: number, z: number, yaw: number, pitch: number}}
     */
    Donkeycraft.TerrainController.prototype.getCamera = function () {
        return { ...this._camera };
    };

    /**
     * Get the current FPS counter value.
     * FPS is updated once per second based on frame counting.
     * @returns {number} Current frames per second (0 if less than 1 second has elapsed).
     */
    Donkeycraft.TerrainController.prototype.getCurrentFps = function () {
        return this._currentFps;
    };

    /**
     * Get the current speed level index (0 = walk, 1 = jog, 2 = sprint).
     * @returns {number} Speed level index (0, 1, or 2).
     */
    Donkeycraft.TerrainController.prototype.getSpeedLevel = function () {
        return this._speedLevel;
    };

    /**
     * Cycle to the next speed level and show the indicator.
     * Wraps around: walk → jog → sprint → walk.
     */
    Donkeycraft.TerrainController.prototype.cycleSpeed = function () {
        this._speedLevel = (this._speedLevel + 1) % SPEED_LEVELS.length;
        this._showSpeedIndicator();
    };

    /**
     * Set the speed level directly.
     * @param {number} level - Speed level index (0-2).
     */
    Donkeycraft.TerrainController.prototype.setSpeedLevel = function (level) {
        this._speedLevel = Math.max(0, Math.min(2, Math.floor(level)));
    };

    /**
     * Get the current speed in blocks per second at the active speed level.
     * @returns {number} Speed in blocks/second.
     */
    Donkeycraft.TerrainController.prototype.getSpeed = function () {
        return SPEED_LEVELS[this._speedLevel] || SPEED_LEVELS[0];
    };

    /**
     * Get the current mouse delta (accumulated since last reset).
     * @returns {{dx: number, dy: number}} Mouse movement delta since last frame.
     */
    Donkeycraft.TerrainController.prototype.getMouseDelta = function () {
        return { dx: this._mouseDX, dy: this._mouseDY };
    };

    /**
     * Reset accumulated mouse delta to zero. Called internally after each camera update.
     */
    Donkeycraft.TerrainController.prototype.resetMouseDelta = function () {
        this._mouseDX = 0;
        this._mouseDY = 0;
    };

    /**
     * Check if the pointer is currently locked to the canvas.
     * @returns {boolean} True if pointer lock is active.
     */
    Donkeycraft.TerrainController.prototype.isPointerLocked = function () {
        return this._pointerLocked;
    };

    /**
     * Check if the controller is ready (initialized successfully).
     * @returns {boolean} True if init() completed successfully.
     */
    Donkeycraft.TerrainController.prototype.isReady = function () {
        return this._ready;
    };

    // ============================================================
    // Input Handling
    // ============================================================

    /**
     * Setup keyboard, mouse, and pointer lock event listeners.
     * @private
     */
    Donkeycraft.TerrainController.prototype._setupInputListeners = function () {
        var self = this;

        // Keyboard keydown
        document.addEventListener('keydown', function (e) {
            self._keys[e.code] = true;

            // Invoke registered key actions (only on first press, not repeats)
            if (!e.repeat && self._keyActions[e.code]) {
                self._keyActions[e.code](e);
            }
        });

        // Keyboard keyup
        document.addEventListener('keyup', function (e) {
            self._keys[e.code] = false;
        });

        // Canvas click for pointer lock request
        if (this._canvas) {
            this._canvas.addEventListener('click', function () {
                if (!self._pointerLocked) {
                    self._canvas.requestPointerLock();
                }
            });
        }

        // Pointer lock change notification
        document.addEventListener('pointerlockchange', function () {
            self._pointerLocked = !!document.pointerLockElement;
        });

        // Mouse movement (only processed when pointer is locked)
        document.addEventListener('mousemove', function (e) {
            if (!self._pointerLocked) return;
            self._mouseDX += e.movementX || 0;
            self._mouseDY += e.movementY || 0;
        });

        // Tab visibility change (pause input when tab is hidden)
        document.addEventListener('visibilitychange', function () {
            self._isTabVisible = !document.hidden;
        });
    };

    // ============================================================
    // Camera Update
    // ============================================================

    /**
     * Update camera rotation and position based on current input state.
     * Rotation is applied immediately from accumulated mouse delta.
     * Movement is frame-rate independent, scaled by delta time and active speed level.
     *
     * @param {number} [dt=1] - Delta time multiplier for frame-rate independent movement (default: 1).
     */
    Donkeycraft.TerrainController.prototype.updateCamera = function (dt) {
        // Don't update if tab is hidden
        if (!this._isTabVisible) return;

        dt = dt || 1;

        var sens = (Donkeycraft.Config && Donkeycraft.Config.MOUSE_SENSITIVITY) ?
            Donkeycraft.Config.MOUSE_SENSITIVITY : 0.15;

        // Apply mouse rotation — yaw decreases when moving mouse right (standard FPS for this coordinate system),
        // pitch decreases when moving mouse up, clamped to avoid gimbal lock.
        this._camera.yaw -= this._mouseDX * sens;
        this._camera.pitch -= this._mouseDY * sens;
        this._camera.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._camera.pitch));

        // Normalize yaw to [-2π, 2π] — prevents floating-point overflow and keeps displayed degrees sane
        if (this._camera.yaw > Math.PI * 2) this._camera.yaw -= Math.PI * 2;
        if (this._camera.yaw < -Math.PI * 2) this._camera.yaw += Math.PI * 2;
        this._mouseDX = 0;
        this._mouseDY = 0;

        // Movement — frame-rate independent (scaled by delta time and speed level)
        var spd = this.getSpeed() * dt;
        var fwd = [-Math.sin(this._camera.yaw), 0, -Math.cos(this._camera.yaw)];
        var rgt = [Math.cos(this._camera.yaw), 0, -Math.sin(this._camera.yaw)];

        var keys = this._keys;
        if (keys['KeyW']) { this._camera.x += fwd[0] * spd; this._camera.z += fwd[2] * spd; }
        if (keys['KeyS']) { this._camera.x -= fwd[0] * spd; this._camera.z -= fwd[2] * spd; }
        if (keys['KeyA']) { this._camera.x -= rgt[0] * spd; this._camera.z -= rgt[2] * spd; }
        if (keys['KeyD']) { this._camera.x += rgt[0] * spd; this._camera.z += rgt[2] * spd; }
        if (keys['Space']) this._camera.y += spd;
        if (keys['KeyZ']) this._camera.y -= spd;
    };

    /**
     * Update the FPS counter and update any registered FPS display elements.
     * Should be called once per frame with the current timestamp in milliseconds.
     *
     * @param {number} ts - Current timestamp in milliseconds.
     * @param {string[]} [fpsElementIds] - Optional array of element IDs to update with FPS text.
     */
    Donkeycraft.TerrainController.prototype.updateFps = function (ts, fpsElementIds) {
        // FPS tracking
        this._frameCount++;
        if (!this._lastFpsTime) this._lastFpsTime = ts;

        if (ts - this._lastFpsTime >= 1000) {
            this._currentFps = this._frameCount;
            this._frameCount = 0;
            this._lastFpsTime = ts;

            // Update registered FPS display elements
            var ids = fpsElementIds || ['dk-fps-counter', 'ui-fps'];
            for (var i = 0; i < ids.length; i++) {
                var el = document.getElementById(ids[i]);
                if (el) el.textContent = 'FPS: ' + this._currentFps;
            }
        }
    };

    // ============================================================
    // Camera Presets
    // ============================================================

    /**
     * Place the camera 1 unit above the highest solid block at the current XZ position.
     * Scans upward from Y=0 through all loaded chunks to find the terrain surface.
     * Falls back to Y=120 if no solid block is found or chunk data unavailable.
     * @returns {boolean} True if ground was successfully located and camera repositioned.
     */
    Donkeycraft.TerrainController.prototype.placeAboveGround = function () {
        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
        var ws = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

        var camChunkX = Math.floor(this._camera.x / cs);
        var camChunkZ = Math.floor(this._camera.z / cs);
        var localX = ((this._camera.x % cs) + cs) % cs;
        var localZ = ((this._camera.z % cs) + cs) % cs;

        // Scan downward from top to find the highest solid block at this XZ
        for (var y = ws - 1; y >= 0; y--) {
            if (localX >= 0 && localX < cs && localZ >= 0 && localZ < cs) {
                var key = camChunkX + ',' + camChunkZ;
                var chunk = window._dkTerrainRenderer ? window._dkTerrainRenderer._chunks.get(key) : null;
                if (chunk) {
                    var bid = chunk.getBlock(localX, y, localZ);
                    if (bid !== 0) {
                        this._camera.y = y + 2;
                        return true;
                    }
                }
            }
        }

        // No solid block found — fall back to safe height
        this._camera.y = 120;
        return false;
    };

    /**
     * Set camera to a north-east overview position looking at the current chunk area.
     * @param {number} centerChunkX - Center chunk X coordinate.
     * @param {number} centerChunkZ - Center chunk Z coordinate.
     * @param {number} radiusN - North radius in chunks.
     * @param {number} radiusS - South radius in chunks.
     * @param {number} radiusE - East radius in chunks.
     * @param {number} radiusW - West radius in chunks.
     */
    Donkeycraft.TerrainController.prototype.setOverviewView = function (centerChunkX, centerChunkZ, radiusN, radiusS, radiusE, radiusW) {
        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;

        var minChunkX = centerChunkX - radiusW;
        var maxChunkX = centerChunkX + radiusE;
        var minChunkZ = centerChunkZ - radiusN;
        var maxChunkZ = centerChunkZ + radiusS;

        // NE corner of the grid
        var neWorldX = maxChunkX * cs + cs;
        var neWorldZ = minChunkZ * cs;

        var gridWidthChunks = (maxChunkX - minChunkX + 1);
        var gridDepthChunks = (maxChunkZ - minChunkZ + 1);
        var gridWorldSize = Math.max(gridWidthChunks, gridDepthChunks) * cs;

        // Diagonal offset for overview position
        var diagonalOffset = gridWorldSize * 0.7;
        this._camera.x = neWorldX + diagonalOffset;
        this._camera.z = neWorldZ - diagonalOffset;

        // Height: grid size scaled
        this._camera.y = 80 + gridWorldSize * 0.6;

        // Look at center of grid
        var targetX = (minChunkX + maxChunkX) * cs / 2;
        var targetZ = (minChunkZ + maxChunkZ) * cs / 2;
        this._camera.yaw = Math.atan2(-(targetX - this._camera.x), -(targetZ - this._camera.z));
        this._camera.pitch = -Math.PI / 6; // ~30 degrees down
    };

    // ============================================================
    // Speed Indicator UI
    // ============================================================

    /**
     * Show the speed indicator overlay for a brief duration.
     * Updates the emoji and label elements with current speed level info.
     */
    Donkeycraft.TerrainController.prototype._showSpeedIndicator = function () {
        var indicator = document.getElementById('dk-speed-indicator');
        if (!indicator) return;

        var emojiEl = indicator.querySelector('.speed-emoji');
        var labelEl = indicator.querySelector('.speed-label');
        if (emojiEl) emojiEl.textContent = SPEED_EMOJIS[this._speedLevel];
        if (labelEl) labelEl.textContent = SPEED_NAMES[this._speedLevel] + ' Speed';

        indicator.classList.add('show');
        var self = this;
        setTimeout(function () { indicator.classList.remove('show'); }, SPEED_INDICATOR_DURATION);
    };

    // ============================================================
    // State Save/Load
    // ============================================================

    /**
     * Save camera position, speed level, and chunk radii to localStorage.
     * Called periodically during gameplay for persistence across sessions.
     * @private
     */
    Donkeycraft.TerrainController.prototype.saveState = function () {
        try {
            var state = {
                camera: {
                    x: this._camera.x,
                    y: this._camera.y,
                    z: this._camera.z,
                    yaw: this._camera.yaw,
                    pitch: this._camera.pitch
                },
                speedLevel: this._speedLevel
            };
            localStorage.setItem('donkeycraft_terrain_controller_state', JSON.stringify(state));
        } catch (e) {
            // Graceful degradation — state won't persist but game continues
        }
    };

    /**
     * Load saved camera position and speed level from localStorage.
     * @returns {boolean} True if state was successfully loaded.
     * @private
     */
    Donkeycraft.TerrainController.prototype.loadState = function () {
        try {
            var raw = localStorage.getItem('donkeycraft_terrain_controller_state');
            if (!raw) return false;

            var state = JSON.parse(raw);
            if (!state || typeof state !== 'object') return false;

            if (state.camera && typeof state.camera === 'object') {
                if (typeof state.camera.x === 'number') this._camera.x = state.camera.x;
                if (typeof state.camera.y === 'number') this._camera.y = state.camera.y;
                if (typeof state.camera.z === 'number') this._camera.z = state.camera.z;
                if (typeof state.camera.yaw === 'number') this._camera.yaw = state.camera.yaw;
                if (typeof state.camera.pitch === 'number') this._camera.pitch = state.camera.pitch;
            }
            if (typeof state.speedLevel === 'number') this._speedLevel = state.speedLevel;

            return true;
        } catch (e) {
            return false;
        }
    };

    // ============================================================
    // Matrix Helpers
    // ============================================================

    /**
     * Create a new 4x4 identity matrix.
     * @returns {Float32Array} 16-element Float32Array representing the matrix.
     */
    Donkeycraft.TerrainController.prototype.mat4Create = function () {
        var m = new Float32Array(16);
        m[0] = m[5] = m[10] = m[15] = 1;
        return m;
    };

    /**
     * Set an existing Float32Array to identity matrix values.
     * @param {Float32Array} o - Output array (must be 16 elements).
     * @returns {Float32Array} The input array with identity values.
     */
    Donkeycraft.TerrainController.prototype.mat4Identity = function (o) {
        o.fill(0);
        o[0] = o[5] = o[10] = o[15] = 1;
        return o;
    };

    /**
     * Create a perspective projection matrix.
     *
     * @param {Float32Array} o - Output array (must be 16 elements).
     * @param {number} fov - Field of view in radians (typically π/4 to π/3).
     * @param {number} aspect - Aspect ratio (canvas width / canvas height).
     * @param {number} near - Near clipping plane distance.
     * @param {number} far - Far clipping plane distance.
     * @returns {Float32Array} The perspective matrix.
     */
    Donkeycraft.TerrainController.prototype.mat4Perspective = function (o, fov, aspect, near, far) {
        var f1 = 1 / Math.tan(fov / 2);
        var nf = 1 / (near - far);
        o.fill(0);
        o[0] = f1 / aspect;
        o[5] = f1;
        o[10] = (far + near) * nf;
        o[11] = -1;
        o[14] = 2 * far * near * nf;
        return o;
    };

    /**
     * Create a look-at view matrix.
     *
     * @param {Float32Array} o - Output array (must be 16 elements).
     * @param {number[]} eye - Camera position [x, y, z].
     * @param {number[]} center - Look-at point [x, y, z].
     * @param {number[]} up - Up vector [x, y, z] (typically [0, 1, 0]).
     * @returns {Float32Array} The view matrix.
     */
    Donkeycraft.TerrainController.prototype.mat4LookAt = function (o, eye, center, up) {
        var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
        var zl = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
        z0 *= zl; z1 *= zl; z2 *= zl;

        var x0 = up[1] * z2 - up[2] * z1;
        var x1 = up[2] * z0 - up[0] * z2;
        var x2 = up[0] * z1 - up[1] * z0;
        var xl = 1 / Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
        x0 *= xl; x1 *= xl; x2 *= xl;

        var y0 = z1 * x2 - z2 * x1;
        var y1 = z2 * x0 - z0 * x2;
        var y2 = z0 * x1 - z1 * x0;

        o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
        o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
        o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
        o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
        o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
        o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
        o[15] = 1;
        return o;
    };

    /**
     * Multiply two 4x4 matrices: o = a × b.
     *
     * @param {Float32Array} o - Output array (must be 16 elements).
     * @param {Float32Array} a - Left operand matrix.
     * @param {Float32Array} b - Right operand matrix.
     * @returns {Float32Array} The product matrix.
     */
    Donkeycraft.TerrainController.prototype.mat4Multiply = function (o, a, b) {
        var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        var b0, b1, b2, b3;

        b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
        o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
        o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
        o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
        o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        return o;
    };

    /**
     * Create a translation matrix.
     *
     * @param {Float32Array} o - Output array (must be 16 elements).
     * @param {number} tx - Translation along X axis.
     * @param {number} ty - Translation along Y axis.
     * @param {number} tz - Translation along Z axis.
     * @returns {Float32Array} The translation matrix.
     */
    Donkeycraft.TerrainController.prototype.mat4Translate = function (o, tx, ty, tz) {
        o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
        o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
        o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
        o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
        return o;
    };

})();