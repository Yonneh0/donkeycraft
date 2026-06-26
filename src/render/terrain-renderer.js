// Donkeycraft — Terrain Renderer
// Main rendering: chunk iteration, frustum culling, batched draws.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;
    var RENDER_DISTANCE = Donkeycraft.Config.RENDER_DISTANCE;

    /**
     * TerrainRenderer — Manages rendering of the chunk-based terrain.
     * @param {WebGLRenderingContext} gl - The WebGL rendering context.
     * @param {ShaderManager} shaderManager - The shared shader manager instance.
     * @param {Fog} fog - The fog system instance.
     */
    Donkeycraft.TerrainRenderer = function(gl, shaderManager, fog) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._fog = fog;

        // Chunk mesh storage: map "chunkX,chunkZ" → ChunkMesh
        this._chunks = {};
        this._chunkCount = 0;

        // Dirty flag per chunk — avoids rebuilding unchanged chunks every frame
        this._dirtyChunks = {};

        // Geometry builder and mesh optimizer
        this._geometryBuilder = new Donkeycraft.GeometryBuilder();
        this._meshOptimizer = new Donkeycraft.MeshOptimizer();

        // World data access — set by game loop
        this._getBlockFunc = null;

        // Render state
        this._renderDistance = RENDER_DISTANCE;

        // Frustum planes (extracted from view-projection matrix when matrices change)
        this._frustumPlanes = null;
        this._lastFrustumKey = null;

        // Cache for chunk coordinates to avoid parsing on every render
        this._chunkCoordsCache = {};
    };

    /**
     * Set the world block getter function.
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     */
    Donkeycraft.TerrainRenderer.prototype.setWorldData = function(getBlockFunc) {
        this._getBlockFunc = getBlockFunc;
    };

    /**
     * Set the render distance in chunks.
     * @param {number} distance - Number of chunks to render (radius).
     */
    Donkeycraft.TerrainRenderer.prototype.setRenderDistance = function(distance) {
        this._renderDistance = distance;
    };

    /**
     * Get the current render distance.
     * @returns {number}
     */
    Donkeycraft.TerrainRenderer.prototype.getRenderDistance = function() {
        return this._renderDistance;
    };

    /**
     * Mark a chunk as dirty (needs rebuilding).
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype.markChunkDirty = function(chunkX, chunkZ) {
        var key = chunkX + ',' + chunkZ;
        this._dirtyChunks[key] = true;
    };

    /**
     * Update chunk meshes that need rebuilding.
     * Called when blocks change or chunks enter render distance.
     * Only rebuilds dirty chunks or newly-visible chunks.
     * @param {number} playerChunkX - Player's chunk X coordinate.
     * @param {number} playerChunkZ - Player's chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype.updateChunks = function(playerChunkX, playerChunkZ) {
        var gl = this._gl;
        if (!gl || !this._getBlockFunc) return;

        // Determine which chunks should be loaded
        var neededChunks = {};
        for (var dx = -this._renderDistance; dx <= this._renderDistance; dx++) {
            for (var dz = -this._renderDistance; dz <= this._renderDistance; dz++) {
                if (dx * dx + dz * dz > this._renderDistance * this._renderDistance) continue;

                var cx = playerChunkX + dx;
                var cz = playerChunkZ + dz;
                var key = cx + ',' + cz;
                neededChunks[key] = { x: cx, z: cz };

                // Create chunk mesh if it doesn't exist and is dirty
                if (!this._chunks[key]) {
                    this._createChunkMesh(cx, cz);
                } else if (this._dirtyChunks[key]) {
                    // Rebuild only dirty chunks
                    this.rebuildChunk(cx, cz);
                    delete this._dirtyChunks[key];
                }
            }
        }

        // Remove chunks that are no longer needed
        for (var key in this._chunks) {
            if (this._chunks.hasOwnProperty(key) && !neededChunks[key]) {
                this._chunks[key].destroy();
                delete this._chunks[key];
                delete this._dirtyChunks[key];
                this._chunkCount--;
            }
        }
    };

    /**
     * Create a new chunk mesh.
     * @private
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype._createChunkMesh = function(chunkX, chunkZ) {
        var gl = this._gl;
        if (!gl || !this._getBlockFunc) return;

        // Wrap world-coordinate getter into local chunk coordinates.
        // _getBlockFunc receives WORLD coordinates (set via setWorldData).
        // GeometryBuilder.buildChunk expects a getter that takes LOCAL chunk coordinates.
        var self = this;
        var localGetBlock = function(localX, y, localZ) {
            var worldX = chunkX * CHUNK_SIZE + localX;
            var worldY = y;
            var worldZ = chunkZ * CHUNK_SIZE + localZ;
            return self._getBlockFunc(worldX, worldY, worldZ);
        };

        // Build geometry
        var geometry = this._geometryBuilder.buildChunk(chunkX, chunkZ, localGetBlock);

        // Optimize geometry
        var isBlockSolid = function(blockId) {
            return blockId !== 0 && blockId !== 9 && blockId !== 10 && blockId !== 11;
        };
        geometry = this._meshOptimizer.optimize(geometry, isBlockSolid);

        // Create chunk mesh object
        var chunkMesh = new Donkeycraft.ChunkMesh(gl, this._shaderManager);
        chunkMesh.update(geometry);
        chunkMesh._chunkX = chunkX;
        chunkMesh._chunkZ = chunkZ;

        var key = chunkX + ',' + chunkZ;
        this._chunks[key] = chunkMesh;
        this._chunkCount++;
    };

    /**
     * Force rebuild a specific chunk's mesh.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype.rebuildChunk = function(chunkX, chunkZ) {
        var key = chunkX + ',' + chunkZ;
        if (this._chunks[key]) {
            this._chunks[key].destroy();
            delete this._chunks[key];
        }
        this._createChunkMesh(chunkX, chunkZ);
    };

    /**
     * Extract frustum planes from the view-projection matrix.
     * Each plane is stored as {axis: Vector3, dist: number} where
     * dot(point, axis) + dist <= 0 means the point is inside (or on) the plane.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._extractFrustumPlanes = function() {
        var projData = this._cachedProjData;
        var viewData = this._cachedViewData;
        if (!projData || !viewData) return;

        var vp = this._multiplyMatrices(projData, viewData);

        this._frustumPlanes = [
            this._extractPlane(vp, -1, 0, 0),   // Left
            this._extractPlane(vp, 1, 0, 0),    // Right
            this._extractPlane(vp, 0, -1, 0),   // Bottom
            this._extractPlane(vp, 0, 1, 0),    // Top
            this._extractPlane(vp, 0, 0, -1),   // Near
            this._extractPlane(vp, 0, 0, 1)     // Far
        ];
    };

    /**
     * Extract a single frustum plane from the view-projection matrix.
     * Uses the standard OpenGL frustum extraction algorithm:
     * plane = col3 + sign * col_i where sign is +1 for left/bottom/near
     * and -1 for right/top/far. The resulting plane equation is:
     * dot(point, normal) + dist <= 0 means the point is inside (or on) the plane.
     * @private
     * @param {Float32Array} vp - View-projection matrix (column-major).
     * @param {number} i - Non-zero for left/right planes (-1=left, 1=right).
     * @param {number} j - Non-zero for bottom/top planes (-1=bottom, 1=top).
     * @param {number} k - Non-zero for near/far planes (-1=near, 1=far).
     * @returns {{axis: Donkeycraft.Vector3, dist: number}}
     */
    Donkeycraft.TerrainRenderer.prototype._extractPlane = function(vp, i, j, k) {
        // Determine which matrix column to extract (0=left/right, 1=top/bottom, 2=near/far)
        var col, sign;
        if (i !== 0) { col = 0; sign = i < 0 ? 1 : -1; }
        else if (j !== 0) { col = 1; sign = j < 0 ? 1 : -1; }
        else { col = 2; sign = k < 0 ? 1 : -1; }

        // Column-major: column `col` elements are at indices col, col+4, col+8, col+12
        var px = vp[3] + sign * vp[col];
        var py = vp[7] + sign * vp[col + 4];
        var pz = vp[11] + sign * vp[col + 8];
        var pw = vp[15] + sign * vp[col + 12];

        var length = Math.sqrt(px * px + py * py + pz * pz);
        if (length > 0.0001) {
            return {
                axis: new Donkeycraft.Vector3(px / length, py / length, pz / length),
                dist: pw / length
            };
        }

        return { axis: new Donkeycraft.Vector3(0, 0, -1), dist: 0 };
    };

    /**
     * Check if an AABB (axis-aligned bounding box) is visible in the frustum.
     * @private
     * @param {number} minX, minY, minZ - Min corner.
     * @param {number} maxX, maxY, maxZ - Max corner.
     * @returns {boolean} True if the box intersects the frustum.
     */
    Donkeycraft.TerrainRenderer.prototype._isBoxInFrustum = function(
        minX, minY, minZ, maxX, maxY, maxZ
    ) {
        if (!this._frustumPlanes) return true;

        var corners = [
            minX, minY, minZ,  maxX, minY, minZ,
            minX, maxY, minZ,  maxX, maxY, minZ,
            minX, minY, maxZ,  maxX, minY, maxZ,
            minX, maxY, maxZ,  maxX, maxY, maxZ
        ];

        for (var p = 0; p < this._frustumPlanes.length; p++) {
            var plane = this._frustumPlanes[p];
            var allBehind = true;
            for (var c = 0; c < 8; c++) {
                var base = c * 3;
                var dot = corners[base] * plane.axis.x +
                          corners[base + 1] * plane.axis.y +
                          corners[base + 2] * plane.axis.z + plane.dist;
                if (dot > 0) {
                    allBehind = false;
                    break;
                }
            }
            if (allBehind) return false;
        }
        return true;
    };

    /**
     * Check if frustum planes need recomputation.
     * Returns a cache key based on current view+projection matrix data,
     * or null if matrices are uninitialized.
     * @private
     * @returns {string|null}
     */
    Donkeycraft.TerrainRenderer.prototype._getFrustumCacheKey = function() {
        var projData = this._cachedProjData;
        var viewData = this._cachedViewData;
        if (!projData || !viewData) return null;

        // Build a simple hash from matrix values for comparison
        var key = 'p' + projData[0] + projData[5] + projData[10] + projData[15] +
                  'v' + viewData[0] + viewData[5] + viewData[10] + viewData[15];
        return key;
    };

    /**
     * Multiply two 4×4 matrices (column-major).
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._multiplyMatrices = function(a, b) {
        var r = new Float32Array(16);
        for (var i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) {
                r[i * 4 + j] = a[i]     * b[j*4]    + a[4+i] * b[j*4+1] +
                               a[8+i] * b[j*4+2] + a[12+i]* b[j*4+3];
            }
        }
        return r;
    };

    /**
     * Render all visible chunks.
     * @param {Camera} camera - The camera instance.
     */
    Donkeycraft.TerrainRenderer.prototype.render = function(camera) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !this._getBlockFunc || !camera) return;

        // Use terrain shader program
        if (!this._shaderManager.use('terrain')) return;

        // Set camera matrices
        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);
        this._shaderManager.setMat4('uView', matrices.view);

        // Cache matrix data for frustum extraction
        this._cachedProjData = matrices.projection.getData();
        this._cachedViewData = matrices.view.getData();

        // Extract frustum planes only when matrices change
        var cacheKey = this._getFrustumCacheKey();
        if (cacheKey !== this._lastFrustumKey) {
            this._extractFrustumPlanes();
            this._lastFrustumKey = cacheKey;
        }

        // Set model matrix (identity for world-space rendering)
        var identity = Donkeycraft.Matrix4.createIdentity();
        this._shaderManager.setMat4('uModel', identity);

        // Set texture unit (atlas on unit 0)
        gl.activeTexture(gl.TEXTURE0);
        // In Phase 2, use a placeholder — bind null texture or create one in Phase 3
        var placeholderTex = this._getPlaceholderTexture();
        if (placeholderTex) {
            gl.bindTexture(gl.TEXTURE_2D, placeholderTex);
        }
        this._shaderManager.setSampler('uTexture', 0);

        // Set fog uniforms
        if (this._fog) {
            this._fog.applyToFogUniforms(this._shaderManager);
        }

        // Draw each chunk, skipping those outside the frustum
        var cs = CHUNK_SIZE;
        for (var key in this._chunks) {
            if (!this._chunks.hasOwnProperty(key)) continue;

            var chunkMesh = this._chunks[key];
            var cx = chunkMesh._chunkX;
            var cz = chunkMesh._chunkZ;

            // AABB of chunk in world space (block coordinates)
            var chunkMinX = cx * cs, chunkMaxX = (cx + 1) * cs;
            var chunkMinY = 0, chunkMaxY = WORLD_HEIGHT;
            var chunkMinZ = cz * cs, chunkMaxZ = (cz + 1) * cs;

            // Skip if outside frustum
            if (!this._isBoxInFrustum(chunkMinX, chunkMinY, chunkMinZ,
                                       chunkMaxX, chunkMaxY, chunkMaxZ)) {
                continue;
            }

            this._drawChunk(chunkMesh);
        }
    };

    /**
     * Draw a single chunk mesh.
     * @private
     * @param {ChunkMesh} chunkMesh - The chunk mesh to draw.
     */
    Donkeycraft.TerrainRenderer.prototype._drawChunk = function(chunkMesh) {
        if (!chunkMesh || chunkMesh.getIndexCount() === 0) return false;
        return chunkMesh.draw();
    };

    /**
     * Get or create a 1x1 white placeholder texture.
     * @private
     * @returns {WebGLTexture|null}
     */
    Donkeycraft.TerrainRenderer.prototype._getPlaceholderTexture = function() {
        if (!this._gl) return null;

        if (!this._placeholderTexture) {
            var gl = this._gl;
            this._placeholderTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        }

        return this._placeholderTexture;
    };

    /**
     * Get the number of rendered chunks.
     * @returns {number}
     */
    Donkeycraft.TerrainRenderer.prototype.getChunkCount = function() {
        return this._chunkCount;
    };

    /**
     * Destroy all chunk meshes and free resources.
     */
    Donkeycraft.TerrainRenderer.prototype.destroy = function() {
        for (var key in this._chunks) {
            if (this._chunks.hasOwnProperty(key)) {
                this._chunks[key].destroy();
            }
        }
        this._chunks = {};
        this._chunkCount = 0;

        // Delete placeholder texture
        if (this._gl && this._placeholderTexture) {
            this._gl.deleteTexture(this._placeholderTexture);
            this._placeholderTexture = null;
        }
    };

})();