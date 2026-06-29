// Donkeycraft — Math Utilities
// Vector3, Matrix4, Quaternion classes, noise functions (Perlin/Simplex).
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Vector3
    // ============================================================

    /**
     * Vector3 — 3D vector with common operations.
     * @param {number} [x=0]
     * @param {number} [y=0]
     * @param {number} [z=0]
     */
    Donkeycraft.Vector3 = function (x, y, z) {
        this.x = (x !== undefined && !isNaN(x)) ? x : 0;
        this.y = (y !== undefined && !isNaN(y)) ? y : 0;
        this.z = (z !== undefined && !isNaN(z)) ? z : 0;
    };

    /**
     * Matrix4 — column-major 4×4 matrix (for WebGL)
     * @param {Float32Array} [data=null]
     */
    Donkeycraft.Matrix4 = function (data) {
        this._data = data || new Float32Array(16);
    };

    /**
     * Matrix4 — column-major 4×4 matrix (for WebGL)
     * @param {Float32Array} [data=null]
     */
    Donkeycraft.Matrix4.prototype.multiply = function (m) {
        var a = this._data, b = m._data;
        var r = new Float32Array(16);
        // R = A × B
        for (var i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) {
                r[i * 4 + j] = a[i * 4] * b[j] +
                    a[i * 4 + 1] * b[4 + j] +
                    a[i * 4 + 2] * b[8 + j] +
                    a[i * 4 + 3] * b[12 + j];
            }
        }
        this._data.set(r);
        return this;
    };

    /**
     * Create a unit vector.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.one = function () {
        return new Donkeycraft.Vector3(1, 1, 1);
    };

    /**
     * Copy a vector.
     * @param {Donkeycraft.Vector3} v
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.copy = function (v) {
        return new Donkeycraft.Vector3(v.x, v.y, v.z);
    };

    /**
     * Create from array.
     * @param {number[]} arr
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.fromArray = function (arr) {
        return new Donkeycraft.Vector3(arr[0], arr[1], arr[2]);
    };

    /**
     * Set vector components.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.set = function (x, y, z) {
        this.x = (x !== undefined && !isNaN(x)) ? x : 0;
        this.y = (y !== undefined && !isNaN(y)) ? y : 0;
        this.z = (z !== undefined && !isNaN(z)) ? z : 0;
        return this;
    };

    /**
     * Add another vector.
     * @param {Donkeycraft.Vector3} v
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.add = function (v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    };

    /**
     * Subtract another vector.
     * @param {Donkeycraft.Vector3} v
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.sub = function (v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    };

    /**
     * Multiply by scalar.
     * @param {number} s
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.scale = function (s) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    };

    /**
     * Dot product.
     * @param {Donkeycraft.Vector3} v
     * @returns {number}
     */
    Donkeycraft.Vector3.prototype.dot = function (v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    };

    /**
     * Cross product.
     * @param {Donkeycraft.Vector3} v
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.cross = function (v) {
        var x = this.x, y = this.y, z = this.z;
        this.x = y * v.z - z * v.y;
        this.y = z * v.x - x * v.z;
        this.z = x * v.y - y * v.x;
        return this;
    };

    /**
     * Length squared.
     * @returns {number}
     */
    Donkeycraft.Vector3.prototype.lengthSq = function () {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    };

    /**
     * Length (magnitude).
     * @returns {number}
     */
    Donkeycraft.Vector3.prototype.length = function () {
        return Math.sqrt(this.lengthSq());
    };

    /**
     * Normalize in place.
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.normalize = function () {
        var len = this.length();
        if (len > 0.00001) {
            this.x /= len;
            this.y /= len;
            this.z /= len;
        } else {
            this.set(0, 0, 0);
        }
        return this;
    };

    /**
     * Returns a normalized copy.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.prototype.normalized = function () {
        return Donkeycraft.Vector3.copy(this).normalize();
    };

    /**
     * Distance to another vector.
     * @param {Donkeycraft.Vector3} v
     * @returns {number}
     */
    Donkeycraft.Vector3.prototype.distanceTo = function (v) {
        var dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    /**
     * Floor components to integers.
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.floor = function () {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        this.z = Math.floor(this.z);
        return this;
    };

    /**
     * Check if vector is approximately equal to another.
     * @param {Donkeycraft.Vector3} v
     * @param {number} [epsilon=0.001] — Tolerance for approximate comparison. Pass 0 for exact comparison.
     * @returns {boolean}
     */
    Donkeycraft.Vector3.prototype.equals = function (v, epsilon) {
        epsilon = (epsilon !== undefined) ? epsilon : 0.001;
        return Math.abs(this.x - v.x) < epsilon &&
            Math.abs(this.y - v.y) < epsilon &&
            Math.abs(this.z - v.z) < epsilon;
    };

    /**
     * Check if this vector is zero (or near-zero).
     * @returns {boolean}
     */
    Donkeycraft.Vector3.prototype.isZero = function () {
        return this.x === 0 && this.y === 0 && this.z === 0;
    };

    /**
     * Linear interpolation between two vectors.
     * @param {Donkeycraft.Vector3} a - Start vector.
     * @param {Donkeycraft.Vector3} b - End vector.
     * @param {number} t - Interpolation factor [0, 1].
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.lerp = function (a, b, t) {
        return new Donkeycraft.Vector3(
            Donkeycraft.lerp(a.x, b.x, t),
            Donkeycraft.lerp(a.y, b.y, t),
            Donkeycraft.lerp(a.z, b.z, t)
        );
    };

    /**
     * Create a vector from spherical coordinates (phi=angle from +Y-axis, theta=azimuth from +X toward +Z).
     * @param {number} length - Magnitude.
     * @param {number} phi - Polar angle in radians (0 = +Y axis, π/2 = XY plane, π = -Y axis).
     * @param {number} theta - Azimuthal angle in radians (0 = +X axis, π/2 = +Z axis).
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.fromSpherical = function (length, phi, theta) {
        var sinPhi = Math.sin(phi);
        return new Donkeycraft.Vector3(
            length * sinPhi * Math.cos(theta),
            length * Math.cos(phi),
            length * sinPhi * Math.sin(theta)
        );
    };

    /**
     * Distance squared to another vector (avoids sqrt for comparison).
     * @param {Donkeycraft.Vector3} v
     * @returns {number}
     */
    Donkeycraft.Vector3.prototype.distanceToSq = function (v) {
        var dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
        return dx * dx + dy * dy + dz * dz;
    };

    // ============================================================
    // Matrix4 — column-major 4×4 matrix (for WebGL)
    // ============================================================

    /**
     * Matrix4 — 4×4 column-major matrix.
     * @param {Float32Array} [data=null]
     */
    Donkeycraft.Matrix4 = function (data) {
        this._data = data || new Float32Array(16);
    };

    /**
     * Create identity matrix.
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.createIdentity = function () {
        var data = new Float32Array(16);
        data[0] = 1; data[1] = 0; data[2] = 0; data[3] = 0;
        data[4] = 0; data[5] = 1; data[6] = 0; data[7] = 0;
        data[8] = 0; data[9] = 0; data[10] = 1; data[11] = 0;
        data[12] = 0; data[13] = 0; data[14] = 0; data[15] = 1;
        return new Donkeycraft.Matrix4(data);
    };

    /**
     * Create perspective projection matrix.
     * @param {number} fovRadians
     * @param {number} aspect
     * @param {number} near
     * @param {number} far
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.createPerspective = function (fovRadians, aspect, near, far) {
        var f = 1.0 / Math.tan(fovRadians / 2);
        var nf = 1 / (near - far);
        var data = new Float32Array(16);
        data[0] = f / aspect; data[1] = 0; data[2] = 0; data[3] = 0;
        data[4] = 0; data[5] = f; data[6] = 0; data[7] = 0;
        data[8] = 0; data[9] = 0; data[10] = (far + near) * nf; data[11] = -1;
        data[12] = 0; data[13] = 0; data[14] = 2 * far * near * nf; data[15] = 0;
        return new Donkeycraft.Matrix4(data);
    };

    /**
     * Create orthographic projection matrix.
     * @param {number} left
     * @param {number} right
     * @param {number} bottom
     * @param {number} top
     * @param {number} near
     * @param {number} far
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.createOrthographic = function (left, right, bottom, top, near, far) {
        var dx = right - left, dy = top - bottom, dz = far - near;
        var data = new Float32Array(16);
        data[0] = 2 / dx; data[1] = 0; data[2] = 0; data[3] = 0;
        data[4] = 0; data[5] = 2 / dy; data[6] = 0; data[7] = 0;
        data[8] = 0; data[9] = 0; data[10] = -2 / dz; data[11] = 0;
        data[12] = -(right + left) / dx;
        data[13] = -(top + bottom) / dy;
        data[14] = -(far + near) / dz;
        data[15] = 1;
        return new Donkeycraft.Matrix4(data);
    };

    /**
     * Create a look-at view matrix.
     * @param {Donkeycraft.Vector3} eye
     * @param {Donkeycraft.Vector3} target
     * @param {Donkeycraft.Vector3} up
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.createLookAt = function (eye, target, up) {
        var zAxis = Donkeycraft.Vector3.copy(eye).sub(target).normalize();
        var xAxis = Donkeycraft.Vector3.copy(up).cross(zAxis).normalize();
        var yAxis = Donkeycraft.Vector3.copy(zAxis).cross(xAxis);

        var data = new Float32Array(16);
        data[0] = xAxis.x; data[1] = yAxis.x; data[2] = zAxis.x; data[3] = 0;
        data[4] = xAxis.y; data[5] = yAxis.y; data[6] = zAxis.y; data[7] = 0;
        data[8] = xAxis.z; data[9] = yAxis.z; data[10] = zAxis.z; data[11] = 0;
        data[12] = -xAxis.dot(eye);
        data[13] = -yAxis.dot(eye);
        data[14] = -zAxis.dot(eye);
        data[15] = 1;
        return new Donkeycraft.Matrix4(data);
    };

    /**
     * Create a translation matrix.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.createTranslation = function (x, y, z) {
        var m = Donkeycraft.Matrix4.createIdentity();
        m._data[12] = x;
        m._data[13] = y;
        m._data[14] = z;
        return m;
    };

    /**
     * Create a scale matrix.
     * @param {number} x - Scale factor on X axis.
     * @param {number} y - Scale factor on Y axis.
     * @param {number} z - Scale factor on Z axis.
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.createScale = function (x, y, z) {
        var data = new Float32Array(16);
        data[0] = x; data[1] = 0; data[2] = 0; data[3] = 0;
        data[4] = 0; data[5] = y; data[6] = 0; data[7] = 0;
        data[8] = 0; data[9] = 0; data[10] = z; data[11] = 0;
        data[12] = 0; data[13] = 0; data[14] = 0; data[15] = 1;
        return new Donkeycraft.Matrix4(data);
    };

    /**
     * Create a rotation matrix around axis.
     * @param {number} angleRadians - Rotation angle in radians.
     * @param {Donkeycraft.Vector3} axis - Axis of rotation (will be normalized internally).
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.createRotation = function (angle, axis) {
        var c = Math.cos(angle), s = Math.sin(angle);

        // Normalize the axis vector for correctness
        var x = axis.x, y = axis.y, z = axis.z;
        var len = Math.sqrt(x * x + y * y + z * z);
        if (len > 0.00001) {
            x /= len; y /= len; z /= len;
        } else {
            x = 0; y = 1; z = 0; // Default to Y-axis if axis is zero
        }

        var t = 1 - c;

        var m = new Donkeycraft.Matrix4();
        m._data[0] = t * x * x + c;
        m._data[1] = t * x * y + s * z;
        m._data[2] = t * x * z - s * y;
        m._data[3] = 0;
        m._data[4] = t * x * y - s * z;
        m._data[5] = t * y * y + c;
        m._data[6] = t * y * z + s * x;
        m._data[7] = 0;
        m._data[8] = t * x * z + s * y;
        m._data[9] = t * y * z - s * x;
        m._data[10] = t * z * z + c;
        m._data[11] = 0;
        m._data[12] = 0;
        m._data[13] = 0;
        m._data[14] = 0;
        m._data[15] = 1;
        return m;
    };

    /**
     * Static multiply: multiply two matrices (a × b).
     * @param {Donkeycraft.Matrix4} a
     * @param {Donkeycraft.Matrix4} b
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.multiply = function (a, b) {
        var aa = a._data, bb = b._data;
        var r = new Float32Array(16);
        for (var i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) {
                r[i * 4 + j] = aa[i * 4] * bb[j] +
                    aa[i * 4 + 1] * bb[4 + j] +
                    aa[i * 4 + 2] * bb[8 + j] +
                    aa[i * 4 + 3] * bb[12 + j];
            }
        }
        return new Donkeycraft.Matrix4(r);
    };

    /**
     * Multiply by another matrix.
     * @param {Donkeycraft.Matrix4} m
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.prototype.multiply = function (m) {
        var a = this._data, b = m._data;
        var r = new Float32Array(16);
        // Column-major multiplication: R = A × B
        // R[i*4+j] = Σ(k=0..3) A[i*4+k] × B[k*4+j]
        for (var i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) {
                r[i * 4 + j] = a[i * 4] * b[j] +
                    a[i * 4 + 1] * b[4 + j] +
                    a[i * 4 + 2] * b[8 + j] +
                    a[i * 4 + 3] * b[12 + j];
            }
        }
        return new Donkeycraft.Matrix4(r);
    };

    /**
     * Multiply by a vector (treating w=0 for direction, w=1 for position).
     * @param {Donkeycraft.Vector3} v
     * @param {number} [w=0]
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Matrix4.prototype.transformVector = function (v, w) {
        var d = this._data;
        var x = v.x, y = v.y, z = v.z, ww = w || 0;
        var ox = d[0] * x + d[4] * y + d[8] * z + d[12] * ww;
        var oy = d[1] * x + d[5] * y + d[9] * z + d[13] * ww;
        var oz = d[2] * x + d[6] * y + d[10] * z + d[14] * ww;
        var ow = d[3] * x + d[7] * y + d[11] * z + d[15] * ww;
        if (ow !== 1 && ow !== 0) {
            ox /= ow; oy /= ow; oz /= ow;
        }
        return new Donkeycraft.Vector3(ox, oy, oz);
    };

    /**
     * Get the Float32Array data.
     * @returns {Float32Array}
     */
    Donkeycraft.Matrix4.prototype.getData = function () {
        return this._data;
    };

    /**
     * Create a deep copy of this matrix.
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.prototype.clone = function () {
        return new Donkeycraft.Matrix4(new Float32Array(this._data));
    };

    /**
     * Transpose the matrix in place.
     * @returns {Donkeycraft.Matrix4} this
     */
    Donkeycraft.Matrix4.prototype.transpose = function () {
        var d = this._data;
        var tmp;
        tmp = d[1]; d[1] = d[4]; d[4] = tmp;
        tmp = d[2]; d[2] = d[8]; d[8] = tmp;
        tmp = d[3]; d[3] = d[12]; d[12] = tmp;
        tmp = d[6]; d[6] = d[9]; d[9] = tmp;
        tmp = d[7]; d[7] = d[13]; d[13] = tmp;
        tmp = d[11]; d[11] = d[14]; d[14] = tmp;
        return this;
    };

    /**
     * Compute the inverse of this matrix using Gauss-Jordan elimination.
     * Returns a new Matrix4; does not modify the original.
     * @returns {Donkeycraft.Matrix4} A new inverted matrix.
     */
    Donkeycraft.Matrix4.prototype.invert = function () {
        var d = this._data; // source data (not mutated)
        var inv = new Float32Array(16);
        var det;

        // Unroll for performance
        inv[0] = d[5] * (d[10] * d[15] - d[14] * d[11])
            - d[9] * (d[6] * d[15] - d[14] * d[10])
            + d[13] * (d[6] * d[11] - d[10] * d[7]);

        inv[4] = -d[4] * (d[10] * d[15] - d[14] * d[11])
            + d[8] * (d[6] * d[15] - d[14] * d[10])
            - d[12] * (d[6] * d[11] - d[10] * d[7]);

        inv[8] = d[4] * (d[9] * d[15] - d[13] * d[10])
            - d[8] * (d[5] * d[15] - d[13] * d[6])
            + d[12] * (d[5] * d[10] - d[9] * d[6]);

        inv[12] = -d[4] * (d[9] * d[14] - d[13] * d[11])
            + d[8] * (d[5] * d[14] - d[13] * d[7])
            - d[12] * (d[5] * d[11] - d[9] * d[7]);

        inv[1] = -d[1] * (d[10] * d[15] - d[14] * d[11])
            + d[9] * (d[2] * d[15] - d[14] * d[10])
            - d[13] * (d[2] * d[11] - d[10] * d[3]);

        inv[5] = d[0] * (d[10] * d[15] - d[14] * d[11])
            - d[8] * (d[2] * d[15] - d[14] * d[10])
            + d[12] * (d[2] * d[11] - d[10] * d[3]);

        inv[9] = -d[0] * (d[9] * d[15] - d[13] * d[10])
            + d[8] * (d[1] * d[15] - d[13] * d[6])
            - d[12] * (d[1] * d[10] - d[9] * d[6]);

        inv[13] = d[0] * (d[9] * d[14] - d[13] * d[11])
            - d[8] * (d[1] * d[14] - d[13] * d[7])
            + d[12] * (d[1] * d[11] - d[9] * d[7]);

        inv[2] = d[1] * (d[6] * d[15] - d[14] * d[10])
            - d[5] * (d[2] * d[15] - d[14] * d[10])
            + d[13] * (d[2] * d[10] - d[6] * d[3]);

        inv[6] = -d[0] * (d[6] * d[15] - d[14] * d[10])
            + d[4] * (d[2] * d[15] - d[14] * d[10])
            - d[12] * (d[2] * d[10] - d[6] * d[3]);

        inv[10] = d[0] * (d[5] * d[15] - d[13] * d[6])
            - d[4] * (d[1] * d[15] - d[13] * d[2])
            + d[12] * (d[1] * d[10] - d[5] * d[2]);

        inv[14] = -d[0] * (d[5] * d[14] - d[13] * d[7])
            + d[4] * (d[1] * d[14] - d[13] * d[3])
            - d[12] * (d[1] * d[11] - d[5] * d[3]);

        inv[3] = -d[1] * (d[6] * d[11] - d[10] * d[7])
            + d[5] * (d[2] * d[11] - d[10] * d[3])
            - d[9] * (d[2] * d[10] - d[6] * d[3]);

        inv[7] = d[0] * (d[6] * d[11] - d[10] * d[7])
            - d[4] * (d[2] * d[11] - d[10] * d[3])
            + d[8] * (d[2] * d[10] - d[6] * d[3]);

        inv[11] = -d[0] * (d[5] * d[11] - d[9] * d[7])
            + d[4] * (d[1] * d[11] - d[9] * d[3])
            - d[8] * (d[1] * d[10] - d[5] * d[2]);

        inv[15] = d[0] * (d[5] * d[14] - d[9] * d[7])
            - d[4] * (d[1] * d[14] - d[9] * d[3])
            + d[8] * (d[1] * d[10] - d[5] * d[2]);

        det = d[0] * inv[0] + d[1] * inv[4] + d[2] * inv[8] + d[3] * inv[12];

        // Singular matrix check
        if (Math.abs(det) < 0.00001) {
            return Donkeycraft.Matrix4.createIdentity();
        }

        det = 1.0 / det;
        for (var i = 0; i < 16; i++) {
            inv[i] *= det;
        }

        return new Donkeycraft.Matrix4(inv);
    };

    /**
     * Get the inverse of this matrix.
     * @returns {Donkeycraft.Matrix4}
     */
    Donkeycraft.Matrix4.prototype.getInverse = function () {
        return this.invert();
    };

    // ============================================================
    // Quaternion
    // ============================================================

    /**
     * Quaternion — 3D rotation representation.
     * @param {number} [x=0]
     * @param {number} [y=0]
     * @param {number} [z=0]
     * @param {number} [w=1]
     */
    Donkeycraft.Quaternion = function (x, y, z, w) {
        this.x = (x !== undefined && !isNaN(x)) ? x : 0;
        this.y = (y !== undefined && !isNaN(y)) ? y : 0;
        this.z = (z !== undefined && !isNaN(z)) ? z : 0;
        this.w = (w !== undefined && !isNaN(w)) ? w : 1;
    };

    /**
     * Create identity quaternion.
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.identity = function () {
        return new Donkeycraft.Quaternion(0, 0, 0, 1);
    };

    /**
     * Create quaternion from axis and angle.
     * @param {Donkeycraft.Vector3} axis - Axis of rotation (defaults to Y-axis if null/undefined).
     * @param {number} angleRadians - Rotation angle in radians.
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.fromAxisAngle = function (axis, angle) {
        var half = angle / 2;
        var sin = Math.sin(half);
        // Default to Y-axis if axis is null, undefined, or zero
        if (!axis || axis.x === 0 && axis.y === 0 && axis.z === 0) {
            return new Donkeycraft.Quaternion(0, sin, 0, Math.cos(half));
        }
        var n = axis.normalized();
        return new Donkeycraft.Quaternion(
            n.x * sin,
            n.y * sin,
            n.z * sin,
            Math.cos(half)
        );
    };

    /**
     * Spherical linear interpolation between two quaternions.
     * @param {Donkeycraft.Quaternion} a - Start quaternion.
     * @param {Donkeycraft.Quaternion} b - End quaternion.
     * @param {number} t - Interpolation factor [0, 1].
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.slerp = function (a, b, t) {
        var ax = a.x, ay = a.y, az = a.z, aw = a.w;
        var bx = b.x, by = b.y, bz = b.z, bw = b.w;

        var cosTheta = ax * bx + ay * by + az * bz + aw * bw;

        // If cosTheta < 0, the quaternions are opposite — flip one
        var flip = 1;
        if (cosTheta < 0) {
            flip = -1;
            cosTheta = -cosTheta;
        }

        // Clamp for numerical stability
        var cosClamped = Math.min(1, Math.max(-1, cosTheta));

        var cosAngle, sin, scale0, scale1;
        if (cosClamped > 0.9999) {
            // Near-linear interpolation: shortest-path SLERP degenerates to LERP
            scale0 = 1 - t;
            scale1 = flip * t;
        } else {
            var angle = Math.acos(cosClamped);
            sin = Math.sin(angle);
            scale0 = Math.sin((1 - t) * angle) / sin;
            scale1 = Math.sin(t * angle) / sin;
        }

        return new Donkeycraft.Quaternion(
            scale0 * ax + scale1 * bx,
            scale0 * ay + scale1 * by,
            scale0 * az + scale1 * bz,
            scale0 * aw + scale1 * bw
        );
    };

    /**
     * Compute the conjugate of this quaternion (for unit quaternions, same as inverse).
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.prototype.conjugate = function () {
        return new Donkeycraft.Quaternion(-this.x, -this.y, -this.z, this.w);
    };

    /**
     * Compute the inverse of this quaternion (assumes unit quaternion).
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.prototype.inverse = function () {
        var lenSq = this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
        if (lenSq > 0.00001) {
            return new Donkeycraft.Quaternion(
                -this.x / lenSq,
                -this.y / lenSq,
                -this.z / lenSq,
                this.w / lenSq
            );
        }
        return Donkeycraft.Quaternion.identity();
    };

    /**
     * Create quaternion from Euler angles (radians), YXZ order.
     * @param {number} yaw - Y rotation (heading).
     * @param {number} pitch - X rotation (elevation).
     * @param {number} [roll=0] - Z rotation (bank).
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.fromEuler = function (yaw, pitch, roll) {
        yaw = (yaw !== undefined && !isNaN(yaw)) ? yaw : 0;
        pitch = (pitch !== undefined && !isNaN(pitch)) ? pitch : 0;
        roll = (roll !== undefined && !isNaN(roll)) ? roll : 0;

        var cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
        var cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
        var cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);

        // YXZ Euler-to-quaternion multiplication: q = qyaw × qpitch × qroll
        return new Donkeycraft.Quaternion(
            cy * sp * cr + sy * cp * sr,  // x
            sy * cp * cr - cy * sp * sr,  // y
            cy * cp * sr - sy * sp * cr,  // z
            cy * cp * cr + sy * sp * sr   // w
        );
    };

    /**
     * Multiply by another quaternion.
     * @param {Donkeycraft.Quaternion} q
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.prototype.multiply = function (q) {
        return new Donkeycraft.Quaternion(
            this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y,
            this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x,
            this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w,
            this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z
        );
    };

    /**
     * Apply quaternion to a vector.
     * @param {Donkeycraft.Vector3} v
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Quaternion.prototype.applyToVector = function (v) {
        var q = this;
        var cx = 2 * (q.y * v.z - q.z * v.y);
        var cy = 2 * (q.z * v.x - q.x * v.z);
        var cz = 2 * (q.x * v.y - q.y * v.x);
        return new Donkeycraft.Vector3(
            v.x + q.w * cx + q.y * cz - q.z * cy,
            v.y + q.w * cy + q.z * cx - q.x * cz,
            v.z + q.w * cz + q.x * cy - q.y * cx
        );
    };

    /**
     * Convert quaternion to Euler angles (YXZ order).
     * @returns {{yaw: number, pitch: number, roll: number}}
     */
    Donkeycraft.Quaternion.prototype.toEuler = function () {
        var q = this;
        var yaw = Math.atan2(
            2 * (q.w * q.z + q.x * q.y),
            1 - 2 * (q.z * q.z + q.y * q.y)
        );
        var pitch = Math.asin(Math.min(1, Math.max(-1, 2 * (q.w * q.y - q.z * q.x))));
        var roll = Math.atan2(
            2 * (q.w * q.x + q.y * q.z),
            1 - 2 * (q.x * q.x + q.y * q.y)
        );
        return { yaw: yaw, pitch: pitch, roll: roll };
    };

    /**
     * Normalize the quaternion in place and return this.
     * @returns {Donkeycraft.Quaternion} this
     */
    Donkeycraft.Quaternion.prototype.normalize = function () {
        var len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
        if (len > 0.00001) {
            this.x /= len;
            this.y /= len;
            this.z /= len;
            this.w /= len;
        } else {
            this.x = 0;
            this.y = 0;
            this.z = 0;
            this.w = 1;
        }
        return this;
    };

    /**
     * Return a new normalized copy of this quaternion.
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.prototype.normalized = function () {
        return new Donkeycraft.Quaternion(this.x, this.y, this.z, this.w).normalize();
    };

    /**
     * Create a deep copy of this quaternion.
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.prototype.clone = function () {
        return new Donkeycraft.Quaternion(this.x, this.y, this.z, this.w);
    };

    // ============================================================
    // Perlin Noise
    // ============================================================

    /**
     * PerlinNoise — 1D, 2D, and 3D Perlin noise.
     */
    Donkeycraft.PerlinNoise = (function () {
        var _perm = new Uint8Array(512);
        var _initialized = false;

        /**
         * Initialize with a seed.
         * @param {number} [seed] - Seed value (default: 42). Use any integer for a custom seed.
         */
        function init(seed) {
            _initialized = true;
            var p = new Uint8Array(256);
            for (var i = 0; i < 256; i++) p[i] = i;

            // Shuffle using seed — use 42 as default, but allow any non-negative integer
            var s = (seed !== undefined && seed !== null && typeof seed === 'number' && !isNaN(seed)) ? Math.floor(Math.abs(seed)) : 42;
            if (s <= 0 || s >= 2147483647) {
                // Seed 0 is valid for Mulberry32 PRNG (it produces a deterministic sequence)
                s = (seed === 0) ? 1 : 42;
            }
            for (var i = 255; i > 0; i--) {
                s = (s * 16807) % 2147483647;
                var j = s % (i + 1);
                var tmp = p[i]; p[i] = p[j]; p[j] = tmp;
            }

            for (var i = 0; i < 512; i++) {
                _perm[i] = p[i & 255];
            }
        }

        /**
         * Fade function.
         * @param {number} t
         * @returns {number}
         * @private
         */
        function fade(t) {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        /**
         * Gradient function for 3D.
         * @param {number} hash
         * @param {number} x
         * @param {number} y
         * @param {number} z
         * @returns {number}
         * @private
         */
        function grad(hash, x, y, z) {
            var h = hash & 15;
            var u = h < 8 ? x : y;
            var v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        }

        /**
         * 3D Perlin noise.
         * @param {number} x
         * @param {number} y
         * @param {number} z
         * @returns {number} Value between -1 and 1.
         */
        function noise3D(x, y, z) {
            var X = Math.floor(x) & 255;
            var Y = Math.floor(y) & 255;
            var Z = Math.floor(z) & 255;

            x -= Math.floor(x);
            y -= Math.floor(y);
            z -= Math.floor(z);

            var u = fade(x);
            var v = fade(y);
            var w = fade(z);

            var A = _perm[X] + Y;
            var AA = _perm[A] + Z;
            var AB = _perm[A + 1] + Z;
            var B = _perm[X + 1] + Y;
            var BA = _perm[B] + Z;
            var BB = _perm[B + 1] + Z;

            return lerp(w,
                lerp(v,
                    lerp(u, grad(_perm[AA], x, y, z),
                        grad(_perm[BA], x - 1, y, z)),
                    lerp(u, grad(_perm[AB], x, y - 1, z),
                        grad(_perm[BB], x - 1, y - 1, z))),
                lerp(v,
                    lerp(u, grad(_perm[AA + 1], x, y, z - 1),
                        grad(_perm[BA + 1], x - 1, y, z - 1)),
                    lerp(u, grad(_perm[AB + 1], x, y - 1, z - 1),
                        grad(_perm[BB + 1], x - 1, y - 1, z - 1)))
            );
        }

        /**
         * Linear interpolation.
         * @param {number} t
         * @param {number} a
         * @param {number} b
         * @returns {number}
         * @private
         */
        function lerp(t, a, b) {
            return a + t * (b - a);
        }

        /**
         * 2D Perlin noise (calls 3D with z=0).
         * @param {number} x
         * @param {number} y
         * @returns {number}
         */
        function noise2D(x, y) {
            return noise3D(x, y, 0);
        }

        /**
         * 1D Perlin noise (calls 3D with y=z=0).
         * @param {number} x
         * @returns {number}
         */
        function noise1D(x) {
            return noise3D(x, 0, 0);
        }

        /**
         * Fractal Brownian Motion — layered octaves of noise.
         * @param {number} x
         * @param {number} y
         * @param {number} z
         * @param {number} [octaves=4]
         * @param {number} [persistence=0.5]
         * @param {number} [lacunarity=2]
         * @returns {number}
         */
        function fbm(x, y, z, octaves, persistence, lacunarity) {
            octaves = octaves || 4;
            persistence = persistence || 0.5;
            lacunarity = lacunarity || 2;

            var total = 0;
            var amplitude = 1;
            var frequency = 1;
            var maxValue = 0; // For normalization

            for (var i = 0; i < octaves; i++) {
                total += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }

            // Avoid division by zero when octaves is 0
            if (maxValue === 0) return 0;
            return total / maxValue;
        }

        // Initialize with default seed
        init(42);

        return {
            init: init,
            noise3D: noise3D,
            noise2D: noise2D,
            noise1D: noise1D,
            fbm: fbm
        };
    })();

    // ============================================================
    // Utility Functions
    // ============================================================

    /**
     * Linear interpolation between two values.
     * @param {number} a
     * @param {number} b
     * @param {number} t - Interpolation factor [0, 1].
     * @returns {number}
     */
    Donkeycraft.lerp = function (a, b, t) {
        return a + (b - a) * t;
    };

    /**
     * Clamp a value between min and max.
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    Donkeycraft.clamp = function (value, min, max) {
        return Math.min(max, Math.max(min, value));
    };

    /**
     * Map a value from one range to another.
     * @param {number} value
     * @param {number} inMin
     * @param {number} inMax
     * @param {number} outMin
     * @param {number} outMax
     * @returns {number}
     */
    Donkeycraft.map = function (value, inMin, inMax, outMin, outMax) {
        if (inMin === inMax) return outMin;
        return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
    };

    /**
     * Round a number to the nearest integer.
     * @param {number} n
     * @returns {number}
     */
    Donkeycraft.round = function (n) {
        return Math.round(n);
    };

    /**
     * Check if a value is within a range (inclusive).
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {boolean}
     */
    Donkeycraft.inRange = function (value, min, max) {
        return value >= min && value <= max;
    };

})();