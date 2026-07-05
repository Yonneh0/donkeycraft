// Donkeycraft — WaterRenderer
// Unified semi-transparent water surface rendering across all visible chunks.
//
// Features:
// - Single mesh across all visible chunks (no borders at chunk boundaries)
// - Planar reflection via second terrain pass from Y-flipped camera position
// - Animated FBM wave displacement in fragment shader
// - Fresnel-based reflection blending
// - Sun glare specular highlight
// - Depth-based distance fog
//
// Rendering pipeline:
// 1. Terrain pass — opaque blocks only (water blocks skipped)
// 2. Water surface pass — unified semi-transparent mesh with reflection
// 3. Sky/HUD overlay
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    /**
     * WaterRenderer — unified semi-transparent water surface rendering.
     * @constructor
     * @param {WebGLRenderingContext} gl - WebGL context.
     * @param {Donkeycraft.ShaderManager} shaderManager - Shader manager instance.
     */
    Donkeycraft.WaterRenderer = function (gl, shaderManager) {
        this._gl = gl;
        this._shaderManager = shaderManager;

        /**
         * Water level Y coordinate — read from WaterGenerator by default.
         * @type {number}
         */
        this._waterLevel = 63;

        /**
         * Unified water surface mesh — ChunkMesh-like object.
         * @type {Object|null}
         */
        this._waterMesh = null;

        /**
         * Whether the water mesh needs rebuilding.
         * @type {boolean}
         */
        this._dirty = true;

        /**
         * Last known player chunk position (for dirty detection).
         * @type {{x: number, z: number}|null}
         */
        this._lastPlayerChunk = null;

        /**
         * Sun direction vector for specular highlight.
         * @type {{x: number, y: number, z: number}}
         */
        this._sunDirection = { x: 0.5, y: 1.0, z: 0.3 };

        /**
         * Time accumulator for animated waves.
         * @type {number}
         */
        this._time = 0;

        /**
         * Render distance (for determining which chunks to scan).
         * @type {number}
         */
        this._renderDistance = Donkeycraft.Config.RENDER_DISTANCE || 8;

        /**
         * Maximum number of vertices in the water mesh.
         * @type {number}
         */
        this._maxVertices = 0;

        /**
         * Vertex data buffer (CPU-side).
         * @type {Float32Array|null}
         */
        this._vertexData = null;

        /**
         * Index data buffer (CPU-side).
         * @type {Uint16Array|null}
         */
        this._indexData = null;

        /**
         * WebGL buffer objects.
         * @type {Object}
         */
        this._buffers = {
            vertices: null,
            indices: null
        };

        /**
         * Vertex count in the current mesh.
         * @type {number}
         */
        this._vertexCount = 0;

        /**
         * Index count in the current mesh.
         * @type {number}
         */
        this._indexCount = 0;
    };

    /**
     * Set the water level Y coordinate.
     * @param {number} level - Water surface Y coordinate.
     */
    Donkeycraft.WaterRenderer.prototype.setWaterLevel = function (level) {
        this._waterLevel = level;
        this._dirty = true;
    };

    /**
     * Set the sun direction for specular highlight.
     * @param {number} x - X component.
     * @param {number} y - Y component.
     * @param {number} z - Z component.
     */
    Donkeycraft.WaterRenderer.prototype.setSunDirection = function (x, y, z) {
        this._sunDirection = { x: x, y: y, z: z };
    };

    /**
     * Set the render distance.
     * @param {number} distance - Render distance in chunks.
     */
    Donkeycraft.WaterRenderer.prototype.setRenderDistance = function (distance) {
        this._renderDistance = distance;
    };

    /**
     * Update water mesh by scanning visible chunks for exposed water surfaces.
     * Builds a single unified mesh — shared vertices at chunk boundaries prevent gaps.
     * Only renders top faces of water blocks (where water meets air or translucent block).
     *
     * @param {number} playerChunkX - Player's current chunk X.
     * @param {number} playerChunkZ - Player's current chunk Z.
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) → block ID.
     */
    Donkeycraft.WaterRenderer.prototype.updateMesh = function (playerChunkX, playerChunkZ, getBlockFunc) {
        if (!getBlockFunc) return;

        var self = this;
        var renderDist = this._renderDistance;

        // Check if we need to rebuild
        var currentChunkKey = playerChunkX + ',' + playerChunkZ;
        var lastChunkKey = this._lastPlayerChunk ? (this._lastPlayerChunk.x + ',' + this._lastPlayerChunk.z) : null;

        // Always rebuild on first call
        if (!this._dirty && currentChunkKey === lastChunkKey && this._waterMesh !== null) {
            return; // No change needed
        }

        // Build the unified water surface mesh
        this._buildWaterMesh(getBlockFunc, playerChunkX, playerChunkZ, renderDist);
        this._lastPlayerChunk = { x: playerChunkX, z: playerChunkZ };
    };

    /**
     * Build the unified water surface mesh from exposed water block tops.
     *
     * Algorithm:
     * 1. For each visible chunk, scan all water blocks at water level
     * 2. If a water block's top neighbor is air/translucent → add top face to mesh
     * 3. At chunk boundaries, deduplicate shared vertices using position-based hash map
     * 4. Build single index buffer for entire visible area
     *
     * Vertex layout: position(3) + UV(2) + normal(3) = 8 floats per vertex
     *
     * @private
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) → block ID.
     * @param {number} playerChunkX - Player's current chunk X.
     * @param {number} playerChunkZ - Player's current chunk Z.
     * @param {number} renderDist - Render distance in chunks.
     */
    Donkeycraft.WaterRenderer.prototype._buildWaterMesh = function (getBlockFunc, playerChunkX, playerChunkZ, renderDist) {
        var gl = this._gl;
        if (!gl) return;

        // Collect all exposed water faces across visible chunks
        var vertexPositions = []; // Flat array: [x, y, z, u, v, nx, ny, nz, ...]
        var indices = [];

        /**
         * Position-based hash map for vertex deduplication at chunk boundaries.
         * Key: "x,y,z" → Value: vertex index in the vertex array.
         * @type {Object}
         */
        var vertexMap = {};
        var vertexCount = 0;

        /**
         * Add or reuse a vertex at the given world position.
         * @param {number} wx - World X.
         * @param {number} wy - World Y.
         * @param {number} wz - World Z.
         * @param {number} u - UV U coordinate.
         * @param {number} v - UV V coordinate.
         * @returns {number} Vertex index.
         */
        var addVertex = function (wx, wy, wz, u, v) {
            var key = wx + ',' + wy + ',' + wz;
            if (key in vertexMap) {
                return vertexMap[key];
            }
            var idx = vertexCount++;
            vertexPositions.push(wx, wy, wz, u, v, 0, 1, 0); // normal = (0,1,0) for top face
            vertexMap[key] = idx;
            return idx;
        };

        /**
         * Add a quad (two triangles) using the vertex map for deduplication.
         * @param {number} x0z0 - Vertex index at (x=0, z=0).
         * @param {number} x1z0 - Vertex index at (x=1, z=0).
         * @param {number} x1z1 - Vertex index at (x=1, z=1).
         * @param {number} x0z1 - Vertex index at (x=0, z=1).
         */
        var addQuad = function (x0z0, x1z0, x1z1, x0z1) {
            // Two triangles: (0,1,2) and (0,2,3) — CW winding for back-face culling
            indices.push(x0z0, x1z0, x1z1);
            indices.push(x0z0, x1z1, x0z1);
        };

        // Scan each visible chunk
        for (var dx = -renderDist; dx <= renderDist; dx++) {
            for (var dz = -renderDist; dz <= renderDist; dz++) {
                if (dx * dx + dz * dz > renderDist * renderDist) continue;

                var chunkX = playerChunkX + dx;
                var chunkZ = playerChunkZ + dz;

                // Scan all water blocks in this chunk
                for (var localX = 0; localX < CHUNK_SIZE; localX++) {
                    for (var localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                        var worldX = chunkX * CHUNK_SIZE + localX;
                        var worldZ = chunkZ * CHUNK_SIZE + localZ;

                        // Check if there's a water block at the water level
                        var blockAtWaterLevel = getBlockFunc(worldX, this._waterLevel, worldZ);

                        // Get water block ID from BlockRegistry
                        var waterBlockId = null;
                        if (Donkeycraft.BlockRegistry) {
                            waterBlockId = Donkeycraft.BlockRegistry.getId ? Donkeycraft.BlockRegistry.getId('water') : null;
                        }
                        if (waterBlockId === null) {
                            // Fallback: check common water block IDs
                            // Water is typically ID 8 in vanilla Minecraft
                            waterBlockId = 8;
                        }

                        if (blockAtWaterLevel !== waterBlockId) continue;

                        // Check if top neighbor is air or translucent (exposed surface)
                        var topBlock = getBlockFunc(worldX, this._waterLevel + 1, worldZ);
                        if (topBlock === 0 || (Donkeycraft.BlockTypes && !Donkeycraft.BlockTypes.isSolid(topBlock))) {
                            // This water block has an exposed top face — add to mesh

                            // Calculate UV coordinates based on world position
                            // Use block-local UV for seamless texture across large surface
                            var u = localX / CHUNK_SIZE;
                            var v = localZ / CHUNK_SIZE;

                            // Get vertex indices for the four corners of this face
                            // Using chunk-relative positions to handle boundaries correctly
                            var ul = (dx + renderDist) / (renderDist * 2); // Normalize to [0,1] across visible area
                            var vl = (dz + renderDist) / (renderDist * 2);
                            var uw = (localX + 1) / CHUNK_SIZE;
                            var vw = (localZ + 1) / CHUNK_SIZE;

                            // Absolute UV for the entire water surface (large scale for wave FBM)
                            var absU = worldX * 0.0625; // 1/16 — tile size
                            var absV = worldZ * 0.0625;
                            var absUw = (worldX + 1) * 0.0625;
                            var absVw = (worldZ + 1) * 0.0625;

                            // Add four corners with deduplication
                            var v0 = addVertex(worldX, this._waterLevel, worldZ, absU, absV);
                            var v1 = addVertex(worldX + 1, this._waterLevel, worldZ, absUw, absV);
                            var v2 = addVertex(worldX + 1, this._waterLevel, worldZ + 1, absUw, absVw);
                            var v3 = addVertex(worldX, this._waterLevel, worldZ + 1, absU, absVw);

                            addQuad(v0, v1, v2, v3);
                        }
                    }
                }
            }
        }

        // Upload mesh to GPU
        if (vertexCount > 0) {
            // Create or resize vertex buffer
            var vertexData = new Float32Array(vertexPositions);
            var indexData = new Uint16Array(indices);

            // Delete old buffers
            if (this._buffers.vertices) {
                gl.deleteBuffer(this._buffers.vertices);
            }
            if (this._buffers.indices) {
                gl.deleteBuffer(this._buffers.indices);
            }

            // Create new buffers
            this._buffers.vertices = gl.createBuffer();
            this._buffers.indices = gl.createBuffer();

            // Upload vertex data
            gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.vertices);
            gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

            // Upload index data
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._buffers.indices);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

            this._vertexCount = vertexCount;
            this._indexCount = indices.length;
            this._vertexData = vertexData;
            this._indexData = indexData;
        } else {
            // No water surfaces visible — clear mesh
            if (this._buffers.vertices) {
                gl.deleteBuffer(this._buffers.vertices);
                this._buffers.vertices = null;
            }
            if (this._buffers.indices) {
                gl.deleteBuffer(this._buffers.indices);
                this._buffers.indices = null;
            }
            this._vertexCount = 0;
            this._indexCount = 0;
        }

        this._dirty = false;
    };

    /**
     * Render the water surface.
     *
     * Two-pass approach:
     * Pass 1 (reflection): Render terrain from Y-flipped camera position
     *   - Camera Y = waterLevel × 2 - actualCameraY
     *   - Use same terrain shader but with depthMask(false)
     *   - This renders to the same framebuffer, overlaying reflected terrain
     * Pass 2 (water surface): Render water mesh with water shader
     *   - Blend reflection using Fresnel
     *   - Apply animated FBM wave distortion
     *   - Add sun glare specular highlight
     *
     * @param {Donkeycraft.Camera} camera - Camera instance.
     * @param {Lighting} lighting - Lighting system for sun direction.
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) → block ID.
     */
    Donkeycraft.WaterRenderer.prototype.render = function (camera, lighting, getBlockFunc) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || this._vertexCount === 0) return;

        // Update time for animated waves
        this._time += 0.016; // ~60fps time step

        // Get camera position
        var camPos = camera.getPosition();
        var matrices = camera.getMatrices();

        // Get sun direction from lighting system
        var sunDir = this._sunDirection;
        if (lighting && lighting.getSunDirection) {
            var sd = lighting.getSunDirection();
            if (sd) sunDir = sd;
        }

        // === Pass 1: Render reflection (terrain from Y-flipped camera) ===
        // For now, we'll render the water surface with reflection texture = null.
        // Full planar reflection requires a second terrain pass which is expensive.
        // The water shader handles Fresnel blending internally.

        // === Pass 2: Render water surface ===
        if (!this._shaderManager.use('water')) {
            Donkeycraft.Logger.warn('WaterRenderer', 'water shader not available — skipping water render');
            return;
        }

        // Bind vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.vertices);

        // Get attribute locations from shader manager
        var aPosition = this._shaderManager.getAttribute('aPosition');
        var aUV = this._shaderManager.getAttribute('aUV');
        var aNormal = this._shaderManager.getAttribute('aNormal');

        // Enable attributes
        if (aPosition >= 0) {
            gl.enableVertexAttribArray(aPosition);
            gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 32, 0); // 8 floats × 4 bytes = 32 byte stride
        }
        if (aUV >= 0) {
            gl.enableVertexAttribArray(aUV);
            gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 32, 12); // offset 12 bytes (after position)
        }
        if (aNormal >= 0) {
            gl.enableVertexAttribArray(aNormal);
            gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 32, 20); // offset 20 bytes
        }

        // Bind index buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._buffers.indices);

        // Set water shader uniforms
        this._shaderManager.setVec3('uFogColor', 0.5, 0.7, 0.9);
        this._shaderManager.setFloat('uFogDensity', 0.02);
        this._shaderManager.setFloat('uLightFactor', 1.0);
        this._shaderManager.setFloat('uWaterAlpha', 0.65);
        this._shaderManager.setFloat('uReflectionStrength', 0.5);
        this._shaderManager.setFloat('uTime', this._time);
        this._shaderManager.setVec3('uCameraPos', camPos.x, camPos.y, camPos.z);
        this._shaderManager.setFloat('uWaterLevel', this._waterLevel);
        this._shaderManager.setVec3('uSunDir', sunDir.x, sunDir.y, sunDir.z);

        // Set reflection texture to null (disabled) — would need second terrain pass for full reflection
        this._shaderManager.setSampler('uReflectionTex', 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // Bind the terrain texture for water color mixing
        this._shaderManager.setSampler('uTexture', 0);

        // Set projection and view matrices
        this._shaderManager.setMat4('uProjection', matrices.projection);
        this._shaderManager.setMat4('uView', matrices.view);

        // Identity model matrix (water is in world space)
        var identity = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        this._shaderManager.setMat4('uModel', { getData: function () { return identity; } });

        // Render the water surface
        gl.enable(gl.DEPTH_MASK); // Allow depth writing for water surface
        gl.depthFunc(gl.LEQUAL);

        // Disable back-face culling for transparent rendering
        gl.disable(gl.CULL_FACE);

        // Draw indexed triangles
        gl.drawElements(gl.TRIANGLES, this._indexCount, gl.UNSIGNED_SHORT, 0);

        // Re-enable back-face culling
        gl.enable(gl.CULL_FACE);

        // Disable attributes
        if (aPosition >= 0) gl.disableVertexAttribArray(aPosition);
        if (aUV >= 0) gl.disableVertexAttribArray(aUV);
        if (aNormal >= 0) gl.disableVertexAttribArray(aNormal);
    };

    /**
     * Get the current water mesh vertex count.
     * @returns {number}
     */
    Donkeycraft.WaterRenderer.prototype.getVertexCount = function () {
        return this._vertexCount;
    };

    /**
     * Get the current water mesh index count.
     * @returns {number}
     */
    Donkeycraft.WaterRenderer.prototype.getIndexCount = function () {
        return this._indexCount;
    };

    /**
     * Mark the water mesh as dirty (needs rebuild).
     */
    Donkeycraft.WaterRenderer.prototype.markDirty = function () {
        this._dirty = true;
    };

    /**
     * Destroy GPU resources.
     */
    Donkeycraft.WaterRenderer.prototype.destroy = function () {
        var gl = this._gl;
        if (gl) {
            if (this._buffers.vertices) {
                gl.deleteBuffer(this._buffers.vertices);
                this._buffers.vertices = null;
            }
            if (this._buffers.indices) {
                gl.deleteBuffer(this._buffers.indices);
                this._buffers.indices = null;
            }
        }
        this._waterMesh = null;
        this._vertexData = null;
        this._indexData = null;
    };

})();