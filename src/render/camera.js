// Donkeycraft — Camera
// First-person camera: position, rotation, projection matrix, FOV.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Camera — First-person camera with position, rotation, projection matrix, and FOV.
     */
    Donkeycraft.Camera = function(fov, near, far) {
        this._position = new Donkeycraft.Vector3(0, 64, 0);
        this._yaw = 0;
        this._pitch = 0;
        this._fov = fov || Donkeycraft.Config.FOV;
        this._near = near || 0.1;
        this._far = far || 1000;
        this._aspect = 16 / 9;

        this._projectionMatrix = null;
        this._viewMatrix = null;

        // Cached direction vectors (normalized in-place each call)
        this._forward = new Donkeycraft.Vector3();
        this._right = new Donkeycraft.Vector3();
    };

    /**
     * Get the camera position.
     * @returns {Donkeycraft.Vector3} The camera position vector.
     */
    Donkeycraft.Camera.prototype.getPosition = function() {
        return this._position;
    };

    /**
     * Set the camera position.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     */
    Donkeycraft.Camera.prototype.setPosition = function(x, y, z) {
        this._position.set(x, y, z);
    };

    /**
     * Get the camera yaw (Y-axis rotation in radians).
     * @returns {number} Yaw angle in radians.
     */
    Donkeycraft.Camera.prototype.getYaw = function() {
        return this._yaw;
    };

    /**
     * Get the camera pitch (X-axis rotation in radians).
     * @returns {number} Pitch angle in radians.
     */
    Donkeycraft.Camera.prototype.getPitch = function() {
        return this._pitch;
    };

    /**
     * Set the camera rotation.
     * @param {number} yaw - Y-axis rotation in radians.
     * @param {number} pitch - X-axis rotation in radians.
     */
    Donkeycraft.Camera.prototype.setRotation = function(yaw, pitch) {
        this._yaw = yaw;
        this._pitch = Donkeycraft.clamp(pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    };

    /**
     * Apply mouse delta to camera rotation.
     * @param {number} deltaX - Mouse X movement delta.
     * @param {number} deltaY - Mouse Y movement delta.
     * @param {number} [sensitivity] - Mouse sensitivity multiplier.
     */
    Donkeycraft.Camera.prototype.applyMouseDelta = function(deltaX, deltaY, sensitivity) {
        sensitivity = sensitivity || Donkeycraft.Config.MOUSE_SENSITIVITY;
        this._yaw -= deltaX * sensitivity;
        this._pitch -= deltaY * sensitivity;
        this._pitch = Donkeycraft.clamp(this._pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    };

    /**
     * Get the forward direction vector (reuses cached vector).
     * @returns {Donkeycraft.Vector3} Normalized forward vector.
     */
    Donkeycraft.Camera.prototype.getForward = function() {
        var cosYaw = Math.cos(this._yaw);
        var sinYaw = Math.sin(this._yaw);
        var cosPitch = Math.cos(this._pitch);
        var sinPitch = Math.sin(this._pitch);

        this._forward.set(
            -sinYaw * cosPitch,
            sinPitch,
            -cosYaw * cosPitch
        ).normalize();

        return this._forward;
    };

    /**
     * Get the right direction vector (reuses cached vector).
     * @returns {Donkeycraft.Vector3} Normalized right vector.
     */
    Donkeycraft.Camera.prototype.getRight = function() {
        var cosYaw = Math.cos(this._yaw);
        var sinYaw = Math.sin(this._yaw);

        this._right.set(cosYaw, 0, -sinYaw).normalize();

        return this._right;
    };

    /**
     * Get the up direction vector.
     * @returns {Donkeycraft.Vector3} Normalized up vector.
     */
    Donkeycraft.Camera.prototype.getUp = function() {
        return new Donkeycraft.Vector3(0, 1, 0);
    };

    /**
     * Get the camera's target point (position + forward).
     * @returns {Donkeycraft.Vector3} The world position the camera is looking at.
     */
    Donkeycraft.Camera.prototype.getTarget = function() {
        var forward = this.getForward();
        return new Donkeycraft.Vector3(
            this._position.x + forward.x,
            this._position.y + forward.y,
            this._position.z + forward.z
        );
    };

    /**
     * Update the projection matrix based on current aspect ratio and FOV.
     * @returns {Donkeycraft.Matrix4} The updated projection matrix.
     */
    Donkeycraft.Camera.prototype.updateProjection = function() {
        var fovRadians = this._fov * Math.PI / 180;
        this._projectionMatrix = Donkeycraft.Matrix4.createPerspective(
            fovRadians, this._aspect, this._near, this._far
        );
        return this._projectionMatrix;
    };

    /**
     * Update the view matrix based on current position and rotation.
     * @returns {Donkeycraft.Matrix4} The updated view matrix.
     */
    Donkeycraft.Camera.prototype.updateView = function() {
        var target = this.getTarget();
        this._viewMatrix = Donkeycraft.Matrix4.createLookAt(
            this._position, target, new Donkeycraft.Vector3(0, 1, 0)
        );
        return this._viewMatrix;
    };

    /**
     * Get the current projection matrix (updates if stale).
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Camera.prototype.getProjection = function() {
        if (!this._projectionMatrix) {
            return this.updateProjection();
        }
        return this._projectionMatrix;
    };

    /**
     * Get the current view matrix (updates if stale).
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Camera.prototype.getView = function() {
        if (!this._viewMatrix) {
            return this.updateView();
        }
        return this._viewMatrix;
    };

    /**
     * Get both view and projection matrices.
     * @returns {{view: Donkeycraft.Matrix4, projection: Donkeycraft.Matrix4}}
     */
    Donkeycraft.Camera.prototype.getMatrices = function() {
        return {
            view: this.getView(),
            projection: this.getProjection()
        };
    };

    /**
     * Set the aspect ratio.
     * @param {number} aspect - Width/height ratio.
     */
    Donkeycraft.Camera.prototype.setAspect = function(aspect) {
        this._aspect = aspect;
        this._projectionMatrix = null; // Force rebuild
    };

    /**
     * Get the aspect ratio.
     * @returns {number}
     */
    Donkeycraft.Camera.prototype.getAspect = function() {
        return this._aspect;
    };

    /**
     * Move the camera forward/backward.
     * @param {number} amount - Distance to move (positive = forward).
     */
    Donkeycraft.Camera.prototype.moveForward = function(amount) {
        var forward = this.getForward();
        this._position.x += forward.x * amount;
        this._position.y += forward.y * amount;
        this._position.z += forward.z * amount;
    };

    /**
     * Move the camera left/right (strafe).
     * @param {number} amount - Distance to strafe (positive = right).
     */
    Donkeycraft.Camera.prototype.moveRight = function(amount) {
        var right = this.getRight();
        this._position.x += right.x * amount;
        this._position.y += right.y * amount;
        this._position.z += right.z * amount;
    };

    /**
     * Move the camera up/down.
     * @param {number} amount - Distance to move (positive = up).
     */
    Donkeycraft.Camera.prototype.moveUp = function(amount) {
        this._position.y += amount;
    };

    /**
     * Reset camera to default position and rotation.
     */
    Donkeycraft.Camera.prototype.reset = function() {
        this._position.set(0, 64, 0);
        this._yaw = 0;
        this._pitch = 0;
        this._projectionMatrix = null;
        this._viewMatrix = null;
    };

})();