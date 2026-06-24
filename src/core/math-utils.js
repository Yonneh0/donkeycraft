// Donkeycraft — Math Utilities
// Vector3, Matrix4, Quaternion classes, noise functions (Perlin/Simplex).
(function() {
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
    Donkeycraft.Vector3 = function(x, y, z) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
    };

    /**
     * Create a zero vector.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.zero = function() {
        return new Donkeycraft.Vector3(0, 0, 0);
    };

    /**
     * Create a unit vector.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.one = function() {
        return new Donkeycraft.Vector3(1, 1, 1);
    };

    /**
     * Copy a vector.
     * @param {Donkeycraft.Vector3} v
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.copy = function(v) {
        return new Donkeycraft.Vector3(v.x, v.y, v.z);
    };

    /**
     * Create from array.
     * @param {number[]} arr
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Vector3.fromArray = function(arr) {
        return new Donkeycraft.Vector3(arr[0], arr[1], arr[2]);
    };

    /**
     * Set vector components.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.set = function(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    };

    /**
     * Add another vector.
     * @param {Donkeycraft.Vector3} v
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.add = function(v) {
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
    Donkeycraft.Vector3.prototype.sub = function(v) {
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
    Donkeycraft.Vector3.prototype.scale = function(s) {
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
    Donkeycraft.Vector3.prototype.dot = function(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    };

    /**
     * Cross product.
     * @param {Donkeycraft.Vector3} v
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.cross = function(v) {
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
    Donkeycraft.Vector3.prototype.lengthSq = function() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    };

    /**
     * Length (magnitude).
     * @returns {number}
     */
    Donkeycraft.Vector3.prototype.length = function() {
        return Math.sqrt(this.lengthSq());
    };

    /**
     * Normalize in place.
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.normalize = function() {
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
    Donkeycraft.Vector3.prototype.normalized = function() {
        return Donkeycraft.Vector3.copy(this).normalize();
    };

    /**
     * Distance to another vector.
     * @param {Donkeycraft.Vector3} v
     * @returns {number}
     */
    Donkeycraft.Vector3.prototype.distanceTo = function(v) {
        var dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    /**
     * Floor components to integers.
     * @returns {Donkeycraft.Vector3} this (for chaining)
     */
    Donkeycraft.Vector3.prototype.floor = function() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        this.z = Math.floor(this.z);
        return this;
    };

    /**
     * Check if vector is approximately equal to another.
     * @param {Donkeycraft.Vector3} v
     * @param {number} [epsilon=0.001]
     * @returns {boolean}
     */
    Donkeycraft.Vector3.prototype.equals = function(v, epsilon) {
        epsilon = epsilon || 0.001;
        return Math.abs(this.x - v.x) < epsilon &&
               Math.abs(this.y - v.y) < epsilon &&
               Math.abs(this.z - v.z) < epsilon;
    };

    /**
     * Check if this vector is zero (or near-zero).
     * @returns {boolean}
     */
    Donkeycraft.Vector3.prototype.isZero = function() {
        return this.x === 0 && this.y === 0 && this.z === 0;
    };

    // ============================================================
    // Matrix4 — column-major 4×4 matrix (for WebGL)
    // ============================================================

    /**
     * Matrix4 — 4×4 column-major matrix.
     */
    Donkeycraft.Matrix4 = (function() {
        var _mat = new Float32Array(16);

        /**
         * Create identity matrix.
         * @returns {Donkeycraft.Matrix4}
         */
        function createIdentity() {
            _mat[0] = 1; _mat[1] = 0; _mat[2] = 0; _mat[3] = 0;
            _mat[4] = 0; _mat[5] = 1; _mat[6] = 0; _mat[7] = 0;
            _mat[8] = 0; _mat[9] = 0; _mat[10] = 1; _mat[11] = 0;
            _mat[12] = 0; _mat[13] = 0; _mat[14] = 0; _mat[15] = 1;
            return new Donkeycraft.Matrix4(_mat.slice());
        }

        /**
         * Create perspective projection matrix.
         * @param {number} fovRadians
         * @param {number} aspect
         * @param {number} near
         * @param {number} far
         * @returns {Donkeycraft.Matrix4}
         */
        function createPerspective(fovRadians, aspect, near, far) {
            var f = 1.0 / Math.tan(fovRadians / 2);
            var nf = 1 / (near - far);
            _mat[0] = f / aspect; _mat[1] = 0;           _mat[2] = 0;              _mat[3] = 0;
            _mat[4] = 0;          _mat[5] = f;           _mat[6] = 0;              _mat[7] = 0;
            _mat[8] = 0;          _mat[9] = 0;           _mat[10] = (far + near) * nf;  _mat[11] = -1;
            _mat[12] = 0;         _mat[13] = 0;          _mat[14] = 2 * far * near * nf; _mat[15] = 0;
            return new Donkeycraft.Matrix4(_mat.slice());
        }

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
        function createOrthographic(left, right, bottom, top, near, far) {
            var dx = right - left, dy = top - bottom, dz = far - near;
            _mat[0] = 2 / dx;  _mat[1] = 0;           _mat[2] = 0;              _mat[3] = 0;
            _mat[4] = 0;       _mat[5] = 2 / dy;      _mat[6] = 0;              _mat[7] = 0;
            _mat[8] = 0;       _mat[9] = 0;           _mat[10] = -2 / dz;       _mat[11] = 0;
            _mat[12] = -(right + left) / dx;
            _mat[13] = -(top + bottom) / dy;
            _mat[14] = -(far + near) / dz;
            _mat[15] = 1;
            return new Donkeycraft.Matrix4(_mat.slice());
        }

        /**
         * Create a look-at view matrix.
         * @param {Donkeycraft.Vector3} eye
         * @param {Donkeycraft.Vector3} target
         * @param {Donkeycraft.Vector3} up
         * @returns {Donkeycraft.Matrix4}
         */
        function createLookAt(eye, target, up) {
            var zAxis = Donkeycraft.Vector3.copy(eye).sub(target).normalize();
            var xAxis = Donkeycraft.Vector3.copy(up).cross(zAxis).normalize();
            var yAxis = Donkeycraft.Vector3.copy(zAxis).cross(xAxis);

            _mat[0] = xAxis.x;    _mat[1] = yAxis.x;    _mat[2] = zAxis.x;    _mat[3] = 0;
            _mat[4] = xAxis.y;    _mat[5] = yAxis.y;    _mat[6] = zAxis.y;    _mat[7] = 0;
            _mat[8] = xAxis.z;    _mat[9] = yAxis.z;    _mat[10] = zAxis.z;   _mat[11] = 0;
            _mat[12] = -xAxis.dot(eye);
            _mat[13] = -yAxis.dot(eye);
            _mat[14] = -zAxis.dot(eye);
            _mat[15] = 1;
            return new Donkeycraft.Matrix4(_mat.slice());
        }

        /**
         * Create a translation matrix.
         * @param {number} x
         * @param {number} y
         * @param {number} z
         * @returns {Donkeycraft.Matrix4}
         */
        function createTranslation(x, y, z) {
            var m = createIdentity();
            m._data[12] = x;
            m._data[13] = y;
            m._data[14] = z;
            return m;
        }

        /**
         * Create a rotation matrix around axis.
         * @param {number} angleRadians
         * @param {Donkeycraft.Vector3} axis
         * @returns {Donkeycraft.Matrix4}
         */
        function createRotation(angle, axis) {
            var c = Math.cos(angle), s = Math.sin(angle);
            var x = axis.x, y = axis.y, z = axis.z;
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
        }

        // Expose factory functions on the Matrix4 constructor
        Donkeycraft.Matrix4.createIdentity = createIdentity;
        Donkeycraft.Matrix4.createPerspective = createPerspective;
        Donkeycraft.Matrix4.createOrthographic = createOrthographic;
        Donkeycraft.Matrix4.createLookAt = createLookAt;
        Donkeycraft.Matrix4.createTranslation = createTranslation;
        Donkeycraft.Matrix4.createRotation = createRotation;

        return Donkeycraft.Matrix4;

        function DonkeycraftMatrix4(data) {
            this._data = data || new Float32Array(16);
        }

        Donkeycraft.Matrix4.prototype = DonkeycraftMatrix4.prototype;

        /**
         * Multiply by another matrix.
         * @param {Donkeycraft.Matrix4} m
         * @returns {Donkeycraft.Matrix4}
         */
        DonkeycraftMatrix4.prototype.multiply = function(m) {
            var a = this._data, b = m._data;
            var r = new Float32Array(16);
            for (var i = 0; i < 4; i++) {
                for (var j = 0; j < 4; j++) {
                    r[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] +
                                   a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
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
        DonkeycraftMatrix4.prototype.transformVector = function(v, w) {
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
        DonkeycraftMatrix4.prototype.getData = function() {
            return this._data;
        };

        /**
         * Transpose the matrix in place.
         * @returns {Donkeycraft.Matrix4} this
         */
        DonkeycraftMatrix4.prototype.transpose = function() {
            var d = this._data;
            var tmp;
            tmp = d[1];  d[1] = d[4];  d[4] = tmp;
            tmp = d[2];  d[2] = d[8];  d[8] = tmp;
            tmp = d[3];  d[3] = d[12]; d[12] = tmp;
            tmp = d[6];  d[6] = d[9];  d[9] = tmp;
            tmp = d[7];  d[7] = d[13]; d[13] = tmp;
            tmp = d[11]; d[11] = d[14]; d[14] = tmp;
            return this;
        };

    })();

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
    Donkeycraft.Quaternion = function(x, y, z, w) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
        this.w = w !== undefined ? w : 1;
    };

    /**
     * Create identity quaternion.
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.identity = function() {
        return new Donkeycraft.Quaternion(0, 0, 0, 1);
    };

    /**
     * Create quaternion from axis and angle.
     * @param {Donkeycraft.Vector3} axis
     * @param {number} angleRadians
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.fromAxisAngle = function(axis, angle) {
        var half = angle / 2;
        var sin = Math.sin(half);
        var n = axis.normalized();
        return new Donkeycraft.Quaternion(
            n.x * sin,
            n.y * sin,
            n.z * sin,
            Math.cos(half)
        );
    };

    /**
     * Create quaternion from Euler angles (radians), YXZ order.
     * @param {number} yaw - Y rotation
     * @param {number} pitch - X rotation
     * @param {number} [roll=0] - Z rotation
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.fromEuler = function(yaw, pitch, roll) {
        roll = roll || 0;
        var cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
        var cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
        var cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);

        return new Donkeycraft.Quaternion(
            sr * cp * cy - cr * sp * sy, // x
            cr * sp * cy + sr * cp * sy, // y
            cr * cp * sy - sr * sp * cy, // z
            cr * cp * cy + sr * sp * sy  // w
        );
    };

    /**
     * Multiply by another quaternion.
     * @param {Donkeycraft.Quaternion} q
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.prototype.multiply = function(q) {
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
    Donkeycraft.Quaternion.prototype.applyToVector = function(v) {
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
    Donkeycraft.Quaternion.prototype.toEuler = function() {
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
     * Normalize the quaternion.
     * @returns {Donkeycraft.Quaternion}
     */
    Donkeycraft.Quaternion.prototype.normalize = function() {
        var len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
        if (len > 0.00001) {
            return new Donkeycraft.Quaternion(
                this.x / len, this.y / len, this.z / len, this.w / len
            );
        }
        return Donkeycraft.Quaternion.identity();
    };

    // ============================================================
    // Perlin Noise
    // ============================================================

    /**
     * PerlinNoise — 1D, 2D, and 3D Perlin noise.
     */
    Donkeycraft.PerlinNoise = (function() {
        var _perm = new Uint8Array(512);
        var _grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
        ];

        /**
         * Initialize with a seed.
         * @param {number} seed
         */
        function init(seed) {
            var p = new Uint8Array(256);
            for (var i = 0; i < 256; i++) p[i] = i;

            // Shuffle using seed
            var s = seed || 0;
            for (var i = 255; i > 0; i--) {
                s = (s * 16807 + 0) % 2147483647;
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
    Donkeycraft.lerp = function(a, b, t) {
        return a + (b - a) * t;
    };

    /**
     * Clamp a value between min and max.
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    Donkeycraft.clamp = function(value, min, max) {
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
    Donkeycraft.map = function(value, inMin, inMax, outMin, outMax) {
        return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
    };

    /**
     * Round a number to the nearest integer.
     * @param {number} n
     * @returns {number}
     */
    Donkeycraft.round = function(n) {
        return Math.round(n);
    };

    /**
     * Check if a value is within a range (inclusive).
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {boolean}
     */
    Donkeycraft.inRange = function(value, min, max) {
        return value >= min && value <= max;
    };

})();