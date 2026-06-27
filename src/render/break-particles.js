// Donkeycraft — Break Particles
// Block breaking particle system: spawn, update, render.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * BreakParticle — Individual particle state for the physics simulation.
     */
    function BreakParticle(x, y, z, vx, vy, vz, color, lifetime) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = vx;
        this.vy = vy;
        this.vz = vz;
        this.color = color;
        this.lifetime = lifetime;
        this.maxLifetime = lifetime;
        this.alive = true;
    }

    /**
     * BreakParticles — Manages block breaking particle effects.
     */
    Donkeycraft.BreakParticles = function(gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._particles = [];
        this._maxParticles = 256;
        this._particleCountPerBlock = 8;
        this._gravity = -15.0;

        this._vertexBuffer = null;
        this._contextLost = false;
        this._vertexArray = null;

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
                    self._vertexBuffer = null;
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
        // Each spawn creates _particleCountPerBlock particles (or fewer if near capacity).
        var maxToAdd = this._maxParticles - this._particles.length;

        var count = Math.min(this._particleCountPerBlock, maxToAdd);

        for (var i = 0; i < count; i++) {
            if (this._particles.length >= this._maxParticles) break;
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
        var grav = gravity !== undefined ? gravity : this._gravity;

        for (var i = this._particles.length - 1; i >= 0; i--) {
            var p = this._particles[i];

            p.lifetime -= deltaTime;
            if (p.lifetime <= 0) {
                this._particles.splice(i, 1);
                continue;
            }

            p.vy += grav * deltaTime;
            p.x += p.vx * deltaTime;
            p.y += p.vy * deltaTime;
            p.z += p.vz * deltaTime;
        }
    };

    /**
     * Render all active particles using the GUI shader program.
     * Particles are rendered as billboard quads that always face the camera.
     */
    Donkeycraft.BreakParticles.prototype.render = function(camera) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || this._particles.length === 0) return;

        if (this._contextLost) return;

        if (!this._shaderManager.use('gui')) return;

        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);
        this._shaderManager.setMat4('uView', matrices.view);

        this._shaderManager.setInt('uHasTexture', 0);

        var right = camera.getRight();
        var up = camera.getUp();

        var particleSize = 0.1;
        var vertPerParticle = 6;
        var floatsPerVertex = 9;
        var totalFloats = this._particles.length * vertPerParticle * floatsPerVertex;

        if (!this._vertexArray || this._vertexArray.length < totalFloats) {
            this._vertexArray = new Float32Array(totalFloats);
        }
        var vertices = this._vertexArray;

        for (var i = 0; i < this._particles.length; i++) {
            var p = this._particles[i];
            var alpha = p.lifetime / p.maxLifetime;

            var cx = p.x, cy = p.y, cz = p.z;
            var rx = right.x * particleSize, ry = right.y * particleSize, rz = right.z * particleSize;
            var ux = up.x * particleSize, uy = up.y * particleSize, uz = up.z * particleSize;

            var blx = cx - rx - ux, bly = cy - ry - uy, blz = cz - rz - uz;
            var brx = cx + rx - ux, bry = cy + ry - uy, brz = cz + rz - uz;
            var trx = cx + rx + ux, trY = cy + ry + uy, trz = cz + rz + uz;
            var tlx = cx - rx + ux, tly = cy - ry + uy, tlz = cz - rz + uz;

            var r = p.color.r, g = p.color.g, b = p.color.b;
            var base = i * vertPerParticle * floatsPerVertex;

            // Quad vertices: position(3) + uv(2) + color(4) for each corner
            vertices[base]     = blx; vertices[base + 1] = bly; vertices[base + 2] = blz;
            vertices[base + 3] = 0; vertices[base + 4] = 0;
            vertices[base + 5] = r; vertices[base + 6] = g; vertices[base + 7] = b; vertices[base + 8] = alpha;
            vertices[base + 9]  = brx; vertices[base + 10] = bry; vertices[base + 11] = brz;
            vertices[base + 12] = 1; vertices[base + 13] = 0;
            vertices[base + 14] = r; vertices[base + 15] = g; vertices[base + 16] = b; vertices[base + 17] = alpha;
            vertices[base + 18] = trx; vertices[base + 19] = trY; vertices[base + 20] = trz;
            vertices[base + 21] = 1; vertices[base + 22] = 1;
            vertices[base + 23] = r; vertices[base + 24] = g; vertices[base + 25] = b; vertices[base + 26] = alpha;
            vertices[base + 27] = blx; vertices[base + 28] = bly; vertices[base + 29] = blz;
            vertices[base + 30] = 0; vertices[base + 31] = 0;
            vertices[base + 32] = r; vertices[base + 33] = g; vertices[base + 34] = b; vertices[base + 35] = alpha;
            vertices[base + 36] = trx; vertices[base + 37] = trY; vertices[base + 38] = trz;
            vertices[base + 39] = 1; vertices[base + 40] = 1;
            vertices[base + 41] = r; vertices[base + 42] = g; vertices[base + 43] = b; vertices[base + 44] = alpha;
            vertices[base + 45] = tlx; vertices[base + 46] = tly; vertices[base + 47] = tlz;
            vertices[base + 48] = 0; vertices[base + 49] = 1;
            vertices[base + 50] = r; vertices[base + 51] = g; vertices[base + 52] = b; vertices[base + 53] = alpha;
        }

        if (!this._vertexBuffer) {
            this._vertexBuffer = gl.createBuffer();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, totalFloats), gl.DYNAMIC_DRAW);

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

        var totalVertices = this._particles.length * vertPerParticle;
        gl.drawArrays(gl.TRIANGLES, 0, totalVertices);
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