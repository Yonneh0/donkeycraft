// Donkeycraft — Break Particles
// Block breaking particle system: spawn, update, render.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * BreakParticle — Individual particle data.
     */
    function BreakParticle(x, y, z, vx, vy, vz, color, lifetime) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = vx;
        this.vy = vy;
        this.vz = vz;
        this.color = color; // {r, g, b}
        this.lifetime = lifetime;
        this.maxLifetime = lifetime;
        this.alive = true;
    }

    /**
     * BreakParticles — Manages block breaking particle effects.
     * @param {WebGLRenderingContext} gl - The WebGL rendering context.
     * @param {ShaderManager} shaderManager - The shared shader manager instance.
     */
    Donkeycraft.BreakParticles = function(gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._particles = [];
        this._maxParticles = 256;

        // Persistent vertex buffer (avoids per-frame WebGL allocation)
        this._vertexBuffer = null;
        this._contextLost = false;

        // Register context loss/restore listeners on the source canvas.
        if (gl) {
            var self = this;
            var srcEl = gl.canvas || gl._dcCanvas;
            if (srcEl && typeof srcEl.addEventListener === 'function') {
                srcEl.addEventListener('webglcontextlost', function(e) {
                    e.preventDefault();
                    self._contextLost = true;
                    self._vertexBuffer = null;
                });
                srcEl.addEventListener('webglcontextrestored', function() {
                    self._contextLost = false;
                    self._vertexBuffer = null; // Recreated on next render
                });
            }
        }
    };

    /**
     * Spawn particles for a broken block at the given position.
     * @param {number} x - Block center X.
     * @param {number} y - Block center Y.
     * @param {number} z - Block center Z.
     * @param {number} blockId - The block ID that was broken.
     */
    Donkeycraft.BreakParticles.prototype.spawn = function(x, y, z, blockId) {
        var count = 8;
        for (var i = 0; i < count && this._particles.length < this._maxParticles; i++) {
            var vx = (Math.random() - 0.5) * 2;
            var vy = Math.random() * 1.5 + 0.5;
            var vz = (Math.random() - 0.5) * 2;

            var color = this._getBlockParticleColor(blockId);
            var lifetime = 0.5 + Math.random() * 0.5;

            this._particles.push(new BreakParticle(
                x + (Math.random() - 0.5) * 0.5,
                y + (Math.random() - 0.5) * 0.5,
                z + (Math.random() - 0.5) * 0.5,
                vx, vy, vz, color, lifetime
            ));
        }
    };

    /**
     * Get the particle color for a block ID.
     * @private
     * @param {number} blockId - The block ID.
     * @returns {{r: number, g: number, b: number}}
     */
    Donkeycraft.BreakParticles.prototype._getBlockParticleColor = function(blockId) {
        switch (blockId) {
            case 1: return { r: 0.5, g: 0.5, b: 0.5 };   // stone
            case 2: return { r: 0.3, g: 0.6, b: 0.2 };   // grass
            case 3: return { r: 0.6, g: 0.4, b: 0.2 };   // dirt
            case 4: return { r: 0.8, g: 0.7, b: 0.3 };   // sand
            default: return { r: 0.5, g: 0.5, b: 0.5 };  // fallback gray
        }
    };

    /**
     * Update particles by delta time.
     * @param {number} deltaTime - Time since last frame in seconds.
     * @param {number} gravity - Gravity acceleration (negative = downward).
     */
    Donkeycraft.BreakParticles.prototype.update = function(deltaTime, gravity) {
        gravity = gravity || -15.0;

        for (var i = this._particles.length - 1; i >= 0; i--) {
            var p = this._particles[i];

            // Update lifetime
            p.lifetime -= deltaTime;
            if (p.lifetime <= 0) {
                this._particles.splice(i, 1);
                continue;
            }

            // Apply gravity to velocity
            p.vy += gravity * deltaTime;

            // Update position
            p.x += p.vx * deltaTime;
            p.y += p.vy * deltaTime;
            p.z += p.vz * deltaTime;
        }
    };

    /**
     * Render all active particles using the GUI shader program.
     * Particles are rendered as billboards that always face the camera.
     * Each billboard is a quad constructed from the particle's world-space position,
     * oriented using the camera's right and up vectors.
     * Reuses a single persistent vertex buffer to avoid per-frame WebGL allocation.
     * Skips rendering if the WebGL context was lost.
     * @param {Camera} camera - The camera instance (provides projection/view matrices).
     */
    Donkeycraft.BreakParticles.prototype.render = function(camera) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || this._particles.length === 0) return;

        if (this._contextLost) return;

        // Use GUI shader (particles share attributes: aPosition, aUV, aColor)
        if (!this._shaderManager.use('gui')) return;

        // Set camera matrices
        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);
        this._shaderManager.setMat4('uView', matrices.view);

        var right = camera.getRight();
        var up = camera.getUp();

        var vertices = [];
        var particleSize = 0.1;

        for (var i = 0; i < this._particles.length; i++) {
            var p = this._particles[i];
            var alpha = p.lifetime / p.maxLifetime;

            var halfSize = particleSize;
            var cx = p.x, cy = p.y, cz = p.z;
            var rx = right.x * halfSize, ry = right.y * halfSize, rz = right.z * halfSize;
            var ux = up.x * halfSize, uy = up.y * halfSize, uz = up.z * halfSize;

            // Four corners: bottom-left, bottom-right, top-right, top-left
            var blx = cx - rx - ux, bly = cy - ry - uy, blz = cz - rz - uz;
            var brx = cx + rx - ux, bry = cy + ry - uy, brz = cz + rz - uz;
            var trx = cx + rx + ux, try__ = cy + ry + uy, trz = cz + rz + uz;
            var tlx = cx - rx + ux, tly = cy - ry + uy, tlz = cz - rz + uz;

            // Quad vertices: position(3) + UV(2) + Color(4) = 9 floats each
            vertices.push(
                blx, bly, blz,   0, 0,   p.color.r, p.color.g, p.color.b, alpha,
                brx, bry, brz,   1, 0,   p.color.r, p.color.g, p.color.b, alpha,
                trx, try__, trz,  1, 1,   p.color.r, p.color.g, p.color.b, alpha,
                blx, bly, blz,   0, 0,   p.color.r, p.color.g, p.color.b, alpha,
                trx, try__, trz,  1, 1,   p.color.r, p.color.g, p.color.b, alpha,
                tlx, tly, tlz,   0, 1,   p.color.r, p.color.g, p.color.b, alpha
            );
        }

        // Reuse or create persistent vertex buffer
        if (!this._vertexBuffer) {
            this._vertexBuffer = gl.createBuffer();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

        // Bind attributes
        var posLoc = this._shaderManager.getAttribute('aPosition');
        var uvLoc = this._shaderManager.getAttribute('aUV');
        var colorLoc = this._shaderManager.getAttribute('aColor');

        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 9 * 4, 0);
        }
        if (uvLoc >= 0) {
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 9 * 4, 12);
        }
        if (colorLoc >= 0) {
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 9 * 4, 20);
        }

        // Draw particles
        var totalVertices = this._particles.length * 6;
        gl.drawArrays(gl.TRIANGLES, 0, totalVertices);

        // Disable attributes
        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
        if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
        if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    };

    /**
     * Clear all particles.
     */
    Donkeycraft.BreakParticles.prototype.clear = function() {
        this._particles = [];
    };

    /**
     * Get the number of active particles.
     * @returns {number}
     */
    Donkeycraft.BreakParticles.prototype.getCount = function() {
        return this._particles.length;
    };

    /**
     * Destroy particle resources and free GPU memory.
     * Resets context lost state for potential re-initialization.
     */
    Donkeycraft.BreakParticles.prototype.destroy = function() {
        var gl = this._gl;

        if (this._vertexBuffer && gl) {
            gl.deleteBuffer(this._vertexBuffer);
            this._vertexBuffer = null;
        }

        this._particles = [];
        this._contextLost = false;
    };

})();