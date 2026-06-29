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
     * @param {WebGLRenderingContext} gl - WebGL context.
     * @param {ShaderManager} shaderManager - Shader manager instance.
     * @param {Fog} fog - Fog system for distance fog.
     * @param {Lighting} [lighting] - Optional lighting system for dynamic time-of-day lighting.
     */
    Donkeycraft.TerrainRenderer = function(gl, shaderManager, fog, lighting) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._fog = fog;
        this._lighting = lighting || null;

        // Chunk mesh storage: map "chunkX,chunkZ" → ChunkMesh
        this._chunks = {};
        this._chunkCount = 0;

        // Dirty chunks needing rebuild
        this._dirtyChunks = {};

        // Pending meshes: chunks whose geometry couldn't be built yet (e.g., block data not ready)
        // map "chunkX,chunkZ" → { x: number, z: number, retries: number }
        this._pendingMeshes = {};

        // Maximum retry attempts for pending mesh builds before giving up
        this._maxPendingRetries = 30;

        // Geometry builder and mesh optimizer
        this._geometryBuilder = new Donkeycraft.GeometryBuilder();
        this._meshOptimizer = new Donkeycraft.MeshOptimizer();

        // Reusable temp buffer for matrix multiplication (avoids per-frame allocation)
        this._tempMatrixData = new Float32Array(16);

        // World data access — set by game loop
        this._getBlockFunc = null;

        // Render state
        this._renderDistance = RENDER_DISTANCE;

        // Frustum planes (extracted from view-projection matrix when matrices change)
        this._frustumPlanes = null;
        this._lastFrustumKey = null;

        // Cached matrix data for frustum extraction
        this._cachedProjData = null;
        this._cachedViewData = null;
    };

    /**
     * Set the world block getter function.
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     */
    Donkeycraft.TerrainRenderer.prototype.setWorldData = function(getBlockFunc) {
        this._getBlockFunc = getBlockFunc;
    };

    /**
     * Set the camera reference for back-face culling optimization.
     * @param {Donkeycraft.Camera} camera - Camera instance.
     */
    Donkeycraft.TerrainRenderer.prototype.setCamera = function(camera) {
        this._camera = camera || null;
    };

    /**
     * Set the lighting system for dynamic time-of-day lighting.
     * @param {Lighting} lighting - Lighting system instance.
     */
    Donkeycraft.TerrainRenderer.prototype.setLighting = function(lighting) {
        this._lighting = lighting || null;
    };

    /**
     * Set the texture atlas to use for terrain rendering.
     * When set, the terrain renderer binds the atlas texture instead of the placeholder.
     * @param {Donkeycraft.TextureAtlas} atlas - Texture atlas instance.
     */
    Donkeycraft.TerrainRenderer.prototype.setTextureAtlas = function(atlas) {
        this._textureAtlas = atlas;
    };

    /**
     * Get the current lighting system instance.
     * @returns {Lighting|null}
     */
    Donkeycraft.TerrainRenderer.prototype.getLighting = function() {
        return this._lighting;
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
        this._dirtyChunks[chunkX + ',' + chunkZ] = true;
    };

    /**
     * Update chunk meshes that need rebuilding.
     * Only rebuilds dirty chunks or newly-visible chunks.
     * @param {number} playerChunkX - Player's chunk X coordinate.
     * @param {number} playerChunkZ - Player's chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype.updateChunks = function(playerChunkX, playerChunkZ) {
        var gl = this._gl;
        if (!gl || !this._getBlockFunc) {
            Donkeycraft.Logger.warn('TerrainRenderer', 'updateChunks skipped: gl=' + (gl ? 'ok' : 'null') + ', _getBlockFunc=' + (this._getBlockFunc ? 'ok' : 'null'));
            return;
        }

        // Donkeycraft.Logger.info('TerrainRenderer', 'updateChunks called: playerChunk=(' + playerChunkX + ',' + playerChunkZ + '), renderDistance=' + this._renderDistance);

        // First, process any pending meshes (deferred from previous frames)
        this._processPendingMeshes();

        // Determine which chunks should be loaded
        var neededChunks = {};
        for (var dx = -this._renderDistance; dx <= this._renderDistance; dx++) {
            for (var dz = -this._renderDistance; dz <= this._renderDistance; dz++) {
                if (dx * dx + dz * dz > this._renderDistance * this._renderDistance) continue;

                var cx = playerChunkX + dx;
                var cz = playerChunkZ + dz;
                var key = cx + ',' + cz;
                neededChunks[key] = { x: cx, z: cz };

                if (!this._chunks[key]) {
                    this._createChunkMesh(cx, cz);
                } else if (this._dirtyChunks[key]) {
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
     * If the block data is all air (0 vertices), defers mesh building until data is available.
     * @private
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype._createChunkMesh = function(chunkX, chunkZ) {
        var gl = this._gl;
        if (!gl) {
            Donkeycraft.Logger.error('TerrainRenderer', 'WebGL context is null — cannot create chunk mesh');
            return;
        }

        // Donkeycraft.Logger.info('TerrainRenderer', 'Creating chunk mesh at (' + chunkX + ',' + chunkZ + ')...');
        if (!this._getBlockFunc) {
            Donkeycraft.Logger.warn('TerrainRenderer', '_getBlockFunc not set — cannot create chunk mesh');
            return;
        }

        // Wrap world-coordinate getter into local chunk coordinates.
        var self = this;
        var localGetBlock = function(localX, y, localZ) {
            var worldX = chunkX * CHUNK_SIZE + localX;
            var worldY = y;
            var worldZ = chunkZ * CHUNK_SIZE + localZ;
            return self._getBlockFunc(worldX, worldY, worldZ);
        };

        // Build geometry (face culling already done during build)
        var geometry = this._geometryBuilder.buildChunk(chunkX, chunkZ, localGetBlock);

        // Donkeycraft.Logger.info('TerrainRenderer', 'Chunk [' + chunkX + ',' + chunkZ + '] geometry: vertexCount=' + geometry.vertexCount + ', indexCount=' + geometry.indexCount);

        // If geometry is empty (all air), defer mesh building.
        // The chunk may not have terrain data yet — it will be built on the next frame.
        if (geometry.vertexCount === 0) {
            var pendingKey = chunkX + ',' + chunkZ;
            this._pendingMeshes[pendingKey] = { x: chunkX, z: chunkZ };
            Donkeycraft.Logger.warn('TerrainRenderer',
                'Chunk [' + chunkX + ',' + chunkZ + '] geometry has 0 vertices — deferred (retries: ' +
                (this._pendingMeshes[pendingKey].retries || 0) + ')');
            return;
        }

        // Run MeshOptimizer for vertex deduplication and back-face culling
        var cameraPos = this._camera ? this._camera.getPosition() : null;
        geometry = this._meshOptimizer.optimize(geometry, cameraPos);

        // Donkeycraft.Logger.info('TerrainRenderer', 'Chunk [' + chunkX + ',' + chunkZ + '] after optimization: vertexCount=' + geometry.vertexCount + ', indexCount=' + geometry.indexCount);

        // Create chunk mesh object
        var chunkMesh = new Donkeycraft.ChunkMesh(gl, this._shaderManager);
        chunkMesh.update(geometry);
        chunkMesh._chunkX = chunkX;
        chunkMesh._chunkZ = chunkZ;

        var key = chunkX + ',' + chunkZ;
        this._chunks[key] = chunkMesh;
        this._chunkCount++;

        // Donkeycraft.Logger.info('TerrainRenderer', 'Chunk [' + chunkX + ',' + chunkZ + '] created successfully. Total chunks: ' + this._chunkCount);
    };

    /**
     * Process pending meshes: attempt to build geometry for chunks that were deferred.
     * Called from updateChunks() each frame.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._processPendingMeshes = function() {
        var keysToDelete = [];
        var self = this;

        for (var key in this._pendingMeshes) {
            if (!this._pendingMeshes.hasOwnProperty(key)) continue;

            var pending = this._pendingMeshes[key];
            var existingMesh = this._chunks[key];

            // If a mesh already exists, skip (it was built later via another path).
            // Do NOT increment the retry counter — the pending entry is simply stale.
            if (existingMesh) {
                keysToDelete.push(key);
                continue;
            }

            // Increment retry counter (default to 0 if not set)
            pending.retries = (pending.retries || 0) + 1;

            // Skip if max retries exceeded — log warning and drop the chunk
            if (pending.retries > this._maxPendingRetries) {
                Donkeycraft.Logger.warn('TerrainRenderer',
                    'Pending chunk (' + pending.x + ',' + pending.z + ') exceeded max retries (' +
                    this._maxPendingRetries + ') — dropping from pending queue');
                keysToDelete.push(key);
                continue;
            }

            // Rebuild geometry with current block data
            self._createChunkMesh(pending.x, pending.z);

            // If mesh was built successfully, remove from pending
            if (this._chunks[key]) {
                keysToDelete.push(key);
            }
            // Otherwise keep it pending for next frame retry
        }

        // Remove processed entries
        for (var i = 0; i < keysToDelete.length; i++) {
            delete this._pendingMeshes[keysToDelete[i]];
        }
    };

    /**
     * Check if a block is fully opaque (no faces should be shown adjacent to it).
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._isBlockSolid = function(blockId) {
        // Use BlockRegistry if available (Phase 3+), otherwise fall back to hardcoded list.
        if (Donkeycraft.BlockRegistry && typeof Donkeycraft.BlockRegistry.isOpaque === 'function') {
            return Donkeycraft.BlockRegistry.isOpaque(blockId);
        }
        return blockId !== 0 && blockId !== 9 && blockId !== 10 && blockId !== 11;
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
     * Each plane: dot(point, axis) + dist <= 0 means inside.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._extractFrustumPlanes = function() {
        var projData = this._cachedProjData;
        var viewData = this._cachedViewData;
        if (!projData || !viewData) return;

        // Reuse temp buffer for result to avoid allocation
        this._multiplyMatrices(projData, viewData, this._tempMatrixData);

        this._frustumPlanes = [
            this._extractPlane(this._tempMatrixData, -1, 0, 0),   // Left
            this._extractPlane(this._tempMatrixData, 1, 0, 0),    // Right
            this._extractPlane(this._tempMatrixData, 0, -1, 0),   // Bottom
            this._extractPlane(this._tempMatrixData, 0, 1, 0),    // Top
            this._extractPlane(this._tempMatrixData, 0, 0, -1),   // Near
            this._extractPlane(this._tempMatrixData, 0, 0, 1)     // Far
        ];
    };

    /**
     * Extract a single frustum plane from the view-projection matrix.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._extractPlane = function(vp, i, j, k) {
        var col, sign;
        if (i !== 0) { col = 0; sign = i < 0 ? 1 : -1; }
        else if (j !== 0) { col = 1; sign = j < 0 ? 1 : -1; }
        else { col = 2; sign = k < 0 ? 1 : -1; }

        // Column-major: column `col` elements at indices col, col+4, col+8, col+12
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
     * Check if an AABB is visible in the frustum.
     * @private
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
     * Get a cache key for current view+projection matrix data.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._getFrustumCacheKey = function() {
        var projData = this._cachedProjData;
        var viewData = this._cachedViewData;
        if (!projData || !viewData) return null;

        // Hash key from diagonal elements (most stable across rotations)
        return 'p' + projData[0] + projData[5] + projData[10] + projData[15] +
               'v' + viewData[0] + viewData[5] + viewData[10] + viewData[15];
    };

    /**
     * Multiply two 4×4 matrices (column-major), storing result in optional target buffer.
     * Result: r = a × b where both inputs and output are column-major arrays.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._multiplyMatrices = function(a, b, target) {
        var r = target || new Float32Array(16);
        for (var i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) {
                r[i + j * 4] = a[i]      * b[j * 4]    +
                               a[4 + i]  * b[j * 4 + 1] +
                               a[8 + i]  * b[j * 4 + 2] +
                               a[12 + i] * b[j * 4 + 3];
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
        if (!gl || !this._shaderManager || !this._getBlockFunc || !camera) {
            Donkeycraft.Logger.warn('TerrainRenderer', 'render skipped: gl=' + (gl ? 'ok' : 'null') + ', shaderMgr=' + (this._shaderManager ? 'ok' : 'null') + ', blockFunc=' + (this._getBlockFunc ? 'ok' : 'null') + ', camera=' + (camera ? 'ok' : 'null'));
            return;
        }

        // Donkeycraft.Logger.info('TerrainRenderer', 'render called: chunks=' + this._chunkCount);

        if (!this._shaderManager.use('terrain')) {
            Donkeycraft.Logger.error('TerrainRenderer', 'terrain shader program not available!');
            return;
        }

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
        this._shaderManager.setMat4('uModel', Donkeycraft.Matrix4.createIdentity());

        // Set texture unit (atlas on unit 0)
        gl.activeTexture(gl.TEXTURE0);
        if (this._textureAtlas && this._textureAtlas.isReady()) {
            // Bind the generated texture atlas
            this._textureAtlas.bind();
        } else {
            // Fall back to placeholder (checkerboard)
            var placeholderTex = this._getPlaceholderTexture();
            if (placeholderTex) {
                gl.bindTexture(gl.TEXTURE_2D, placeholderTex);
            }
        }
        this._shaderManager.setSampler('uTexture', 0);

        // Set fog uniforms and update fog color from lighting system
        if (this._fog) {
            // Update fog color from lighting if available (time-of-day aware)
            if (this._lighting) {
                this._fog.updateFromSky(this._lighting.getSkyColor());
            }
            this._fog.applyToFogUniforms(this._shaderManager);
        }

        // Set dynamic lighting factor via Lighting.applyToShader() for consistency.
        // This centralizes the sun intensity × ambient logic in one place.
        if (this._lighting) {
            this._lighting.applyToShader(this._shaderManager);
        } else {
            // Default: full brightness when no lighting system
            this._shaderManager.setFloat('uLightFactor', 1.0);
        }

        // Draw each chunk, skipping those outside the frustum
        var cs = CHUNK_SIZE;
        var drawnCount = 0;
        for (var key in this._chunks) {
            if (!this._chunks.hasOwnProperty(key)) continue;

            var chunkMesh = this._chunks[key];
            var cx = chunkMesh._chunkX;
            var cz = chunkMesh._chunkZ;

            // Skip if outside frustum
            if (!this._isBoxInFrustum(
                cx * cs, 0, cz * cs,
                (cx + 1) * cs, WORLD_HEIGHT, (cz + 1) * cs
            )) {
                continue;
            }

            this._drawChunk(chunkMesh);
            drawnCount++;
        }
        // Donkeycraft.Logger.info('TerrainRenderer', 'render complete: drew ' + drawnCount + '/' + this._chunkCount + ' chunks');
    };

    /**
     * Draw a single chunk mesh.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._drawChunk = function(chunkMesh) {
        var gl = this._gl;
        if (!chunkMesh || chunkMesh.getIndexCount() === 0) return false;

        return chunkMesh.draw();
    };

    /**
     * Get or create a placeholder texture.
     * Uses generateMissing() checkerboard if TextureGenerator is available,
     * otherwise falls back to a 1x1 white texture.
     * The texture is cached so it persists across frames.
     * Handles async image loading by retrying on subsequent frames.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._getPlaceholderTexture = function() {
        var gl = this._gl;
        if (!gl) return null;

        // Return cached texture if already created and valid.
        if (this._placeholderTexture && gl.isTexture(this._placeholderTexture)) {
            return this._placeholderTexture;
        }

        // Try to use generateMissing() texture for visual consistency.
        var missingTex = Donkeycraft.TextureGenerator ?
            Donkeycraft.TextureGenerator.generateMissing() : null;

        if (missingTex && (missingTex.src || missingTex.getContext)) {
            // Create WebGL texture
            this._placeholderTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);

            if (missingTex.getContext) {
                // It's a canvas — upload directly.
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, missingTex);
            } else if (missingTex.complete && missingTex.naturalWidth > 0) {
                // Image already loaded — draw to canvas first.
                var tempCanvas = document.createElement('canvas');
                tempCanvas.width = 16;
                tempCanvas.height = 16;
                var tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(missingTex, 0, 0, 16, 16);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
            } else {
                // Image not loaded yet — keep _placeholderTexture as null so the
                // caller skips binding. Next frame the image will be ready and we retry.
                this._placeholderTexture = null;
                return null;
            }

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        } else {
            // Fallback to white 1×1 if generateMissing not available.
            this._placeholderTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
     * Get render statistics for debug overlay.
     * Tracks chunks rendered, meshes built, and draw calls per frame.
     * @returns {{chunksRendered: number, meshesBuilt: number, drawCalls: number}}
     */
    Donkeycraft.TerrainRenderer.prototype.getRenderStats = function() {
        return {
            chunksRendered: this._chunkCount || 0,
            meshesBuilt: this._chunkCount || 0,
            drawCalls: this._chunkCount || 0
        };
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

        // Clear pending meshes
        for (var key in this._pendingMeshes) {
            if (this._pendingMeshes.hasOwnProperty(key)) {
                delete this._pendingMeshes[key];
            }
        }
        this._pendingMeshes = {};

        if (this._gl && this._placeholderTexture) {
            this._gl.deleteTexture(this._placeholderTexture);
            this._placeholderTexture = null;
        }
    };

})();