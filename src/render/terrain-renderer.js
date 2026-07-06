// Donkeycraft — Terrain Renderer
// Main rendering: chunk iteration, frustum culling, batched draws.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;
    var RENDER_DISTANCE = Donkeycraft.Config.RENDER_DISTANCE;

    /**
     * Cached identity matrix to avoid per-frame allocation in render().
     * Created once on first access via lazy initialization.
     * @type {Donkeycraft.Matrix4|null}
     * @private
     */
    var _identityMatrixCache = null;

    /**
     * Get or create the cached identity matrix.
     * @returns {Donkeycraft.Matrix4}
     * @private
     */
    function _getCachedIdentityMatrix() {
        if (!_identityMatrixCache) {
            _identityMatrixCache = Donkeycraft.Matrix4.createIdentity();
        }
        return _identityMatrixCache;
    }

    /**
     * TerrainRenderer — Manages rendering of the chunk-based terrain.
     * Handles chunk loading/unloading, frustum culling, mesh building, and draw calls.
     * @constructor
     * @param {WebGLRenderingContext} gl - WebGL context.
     * @param {Donkeycraft.ShaderManager} shaderManager - Shader manager instance.
     * @param {Donkeycraft.Fog} fog - Fog system for distance fog.
     * @param {Lighting} [lighting] - Optional lighting system for dynamic time-of-day lighting.
     */
    Donkeycraft.TerrainRenderer = function (gl, shaderManager, fog, lighting) {
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

        /**
         * Maximum retry attempts for pending mesh builds before giving up.
         * @type {number}
         */
        this._maxPendingRetries = 30;

        /**
         * Maximum chunks to rebuild per frame (prevents frame drops when many chunks are dirty).
         * Spreads expensive mesh builds across multiple frames for smoother FPS.
         * @type {number}
         */
        this._maxChunksPerFrame = 2;

        /**
         * Counter for chunks processed in the current frame (reset each updateChunks call).
         * @type {number}
         * @private
         */
        this._chunksProcessedThisFrame = 0;

        /**
         * Placeholder texture — created lazily on first need to avoid constructor-order issues.
         * @type {number|null}
         */
        this._placeholderTexture = null;

        // Geometry builder and mesh optimizer
        this._geometryBuilder = new Donkeycraft.GeometryBuilder();
        this._meshOptimizer = new Donkeycraft.MeshOptimizer();

        /**
         * Whether to skip water blocks during terrain mesh building.
         * When true, water blocks are excluded from the terrain mesh so they can
         * be rendered separately by WaterRenderer as a unified semi-transparent surface.
         * @type {boolean}
         */
        this._skipWaterBlocks = false;

        /**
         * Reusable temp buffer for matrix multiplication (avoids per-frame allocation).
         * @type {Float32Array}
         * @private
         */
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

        // Debug logging flags (one-time logs to avoid spam)
        this._updateChunksLogged = false;
        this._renderLogged = false;

        /**
         * Set of chunk keys that exist but are outside the current render distance.
         * Used to skip unnecessary _createChunkMesh calls for already-loaded chunks.
         * @type{Object<boolean>}
         * @private
         */
        this._existingChunkKeys = null;

        // Camera reference for back-face culling optimization
        this._camera = null;

        /**
         * Whether to enable CPU-side back-face culling during mesh build.
         * When true, the mesh optimizer removes triangles facing away from the camera,
         * reducing draw call overhead for enclosed areas and complex terrain.
         * @type {boolean}
         */
        this._enableBackFaceCulling = false;
    };

    /**
     * Set the world block getter function used to query block IDs at world coordinates.
     * This function is called during mesh building to determine block types for terrain generation.
     *
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     */
    Donkeycraft.TerrainRenderer.prototype.setWorldData = function (getBlockFunc) {
        this._getBlockFunc = getBlockFunc;
    };

    /**
     * Set the camera reference for back-face culling optimization.
     * When set, the camera position is used during mesh build time to remove
     * faces that are hidden from the current viewpoint (CPU-side back-face culling).
     *
     * @param {Donkeycraft.Camera} camera - Camera instance, or null to disable.
     */
    Donkeycraft.TerrainRenderer.prototype.setCamera = function (camera) {
        this._camera = camera || null;
    };

    /**
     * Set the lighting system for dynamic time-of-day lighting.
     * The lighting system provides sky color, sun intensity, and ambient light
     * values that are applied as shader uniforms during rendering.
     *
     * @param {Donkeycraft.Lighting|null} lighting - Lighting system instance, or null.
     */
    Donkeycraft.TerrainRenderer.prototype.setLighting = function (lighting) {
        this._lighting = lighting || null;
    };

    /**
     * Set the texture atlas to use for terrain rendering.
     * When set, the terrain renderer binds the atlas texture instead of the placeholder.
     * The atlas must be generated and ready (call atlas.generate() before setting).
     *
     * @param {Donkeycraft.TextureAtlas} atlas - Texture atlas instance.
     */
    Donkeycraft.TerrainRenderer.prototype.setTextureAtlas = function (atlas) {
        this._textureAtlas = atlas;
    };

    /**
     * Enable or disable skipping water blocks during terrain mesh building.
     * When enabled, water blocks are excluded from the terrain mesh so they can
     * be rendered separately by WaterRenderer as a unified semi-transparent surface.
     *
     * @param {boolean} enabled - Whether to skip water blocks.
     */
    Donkeycraft.TerrainRenderer.prototype.setSkipWaterBlocks = function (enabled) {
        this._skipWaterBlocks = !!enabled;
        if (this._geometryBuilder) {
            this._geometryBuilder._skipWaterBlocks = !!enabled;
        }
    };

    /**
     * Get the current lighting system instance.
     * @returns {Lighting|null}
     */
    Donkeycraft.TerrainRenderer.prototype.getLighting = function () {
        return this._lighting;
    };

    /**
     * Set the render distance in chunks.
     * Controls how many chunks around the player are loaded and rendered.
     * Higher values increase visual range but reduce performance.
     *
     * @param {number} distance - Number of chunks to render (radius from player).
     */
    Donkeycraft.TerrainRenderer.prototype.setRenderDistance = function (distance) {
        this._renderDistance = distance;
    };

    /**
     * Get the current render distance.
     * @returns {number}
     */
    Donkeycraft.TerrainRenderer.prototype.getRenderDistance = function () {
        return this._renderDistance;
    };

    /**
     * Enable or disable CPU-side back-face culling during mesh build.
     * When enabled, removes triangles facing away from the camera at build time,
     * reducing draw call overhead for enclosed areas and complex terrain.
     * Note: This is separate from GPU hardware back-face culling which runs every frame.
     * CPU-side culling happens once per mesh rebuild; GPU-side culling runs every frame.
     *
     * @param {boolean} enabled - Whether to enable back-face culling (default: false).
     */
    Donkeycraft.TerrainRenderer.prototype.setBackFaceCulling = function (enabled) {
        this._enableBackFaceCulling = !!enabled;
    };

    /**
     * Check if CPU-side back-face culling is enabled.
     * @returns {boolean} True if back-face culling is enabled.
     */
    Donkeycraft.TerrainRenderer.prototype.isBackFaceCullingEnabled = function () {
        return this._enableBackFaceCulling !== false;
    };

    /**
     * Mark a chunk as dirty (needs rebuilding).
     * Dirty chunks are rebuilt during the next updateChunks() call.
     * Validates that chunk coordinates are integers before setting the dirty flag.
     *
     * @param {number} chunkX - Chunk X coordinate (must be an integer).
     * @param {number} chunkZ - Chunk Z coordinate (must be an integer).
     */
    Donkeycraft.TerrainRenderer.prototype.markChunkDirty = function (chunkX, chunkZ) {
        // Validate chunk coordinates are integers
        if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
            Donkeycraft.Logger.warn('TerrainRenderer',
                'markChunkDirty called with non-integer coordinates [' + chunkX + ',' + chunkZ + '] — ignoring');
            return;
        }
        this._dirtyChunks[chunkX + ',' + chunkZ] = true;
    };

    /**
     * Update chunk meshes that need rebuilding.
     * Only rebuilds dirty chunks or newly-visible chunks within the render distance.
     * Processes pending meshes from previous frames before building new ones.
     * Removes chunks that fall outside the render distance.
     *
     * @param {number} playerChunkX - Player's current chunk X coordinate.
     * @param {number} playerChunkZ - Player's current chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype.updateChunks = function (playerChunkX, playerChunkZ) {
        var gl = this._gl;
        if (!gl || !this._getBlockFunc) {
            Donkeycraft.Logger.error('TerrainRenderer',
                'updateChunks skipped: gl=' + (gl ? 'ok' : 'null') +
                ', _getBlockFunc=' + (this._getBlockFunc ? 'ok' : 'null'));
            return;
        }


        // First, process any pending meshes (deferred from previous frames)
        this._processPendingMeshes();

        // Determine which chunks should be loaded
        var neededChunks = {};
        var renderDistSq = this._renderDistance * this._renderDistance;
        for (var dx = -this._renderDistance; dx <= this._renderDistance; dx++) {
            for (var dz = -this._renderDistance; dz <= this._renderDistance; dz++) {
                if (dx * dx + dz * dz > renderDistSq) continue;

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

        // Build existing chunk keys for O(1) lookup in _processPendingMeshes
        this._existingChunkKeys = {};
        for (var ek in this._chunks) {
            if (this._chunks.hasOwnProperty(ek)) {
                this._existingChunkKeys[ek] = true;
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
    Donkeycraft.TerrainRenderer.prototype._createChunkMesh = function (chunkX, chunkZ) {
        var gl = this._gl;
        if (!gl) {
            Donkeycraft.Logger.error('TerrainRenderer', 'WebGL context is null — cannot create chunk mesh');
            return;
        }

        if (!this._getBlockFunc) {
            Donkeycraft.Logger.warn('TerrainRenderer', '_getBlockFunc not set — cannot create chunk mesh');
            return;
        }

        // Validate geometry builder is available.
        if (!this._geometryBuilder) {
            Donkeycraft.Logger.error('TerrainRenderer', '_geometryBuilder is null — cannot build chunk geometry');
            return;
        }

        // Wrap world-coordinate getter into local chunk coordinates.
        var self = this;
        var localGetBlock = function (localX, y, localZ) {
            var worldX = chunkX * CHUNK_SIZE + localX;
            var worldY = y;
            var worldZ = chunkZ * CHUNK_SIZE + localZ;
            return self._getBlockFunc(worldX, worldY, worldZ);
        };

        // Build geometry (face culling already done during build).
        var geometry = this._geometryBuilder.buildChunk(chunkX, chunkZ, localGetBlock);

        // Validate geometry output.
        if (!geometry || !(geometry.vertices instanceof Float32Array)) {
            Donkeycraft.Logger.error('TerrainRenderer',
                'buildChunk returned invalid geometry for [' + chunkX + ',' + chunkZ + ']');
            return;
        }

        // If geometry is empty (all air), defer mesh building.
        // The chunk may not have terrain data yet — it will be built on the next frame.
        if (geometry.vertexCount === 0) {
            var pendingKey = chunkX + ',' + chunkZ;
            // Only create a new pending entry if one doesn't already exist.
            // Existing entries have already had their retry counter incremented by _processPendingMeshes().
            if (!this._pendingMeshes[pendingKey]) {
                this._pendingMeshes[pendingKey] = { x: chunkX, z: chunkZ };
            }
            Donkeycraft.Logger.warn('TerrainRenderer',
                'Chunk [' + chunkX + ',' + chunkZ + '] geometry has 0 vertices — deferred (retries: ' +
                (this._pendingMeshes[pendingKey].retries || 0) + ')');
            return;
        }

        // Run MeshOptimizer for vertex deduplication (only on unindexed data) and optional
        // back-face culling. IMPORTANT: CPU-side back-face culling is disabled here because
        // it is inherently flawed for dynamic cameras — the camera moves every frame, so faces
        // culled at build time may be visible during rendering. GPU-side culling (gl.cullFace)
        // runs every frame and is the correct approach for terrain rendering.
        if (this._meshOptimizer) {
            // Pass null cameraPos + false cullBackFaces — let GPU handle per-frame culling.
            geometry = this._meshOptimizer.optimize(geometry, null, false);
        }

        // Create chunk mesh object and upload geometry to GPU buffers.
        var chunkMesh = new Donkeycraft.ChunkMesh(gl, this._shaderManager);
        chunkMesh.update(geometry);
        chunkMesh._chunkX = chunkX;
        chunkMesh._chunkZ = chunkZ;

        var key = chunkX + ',' + chunkZ;
        this._chunks[key] = chunkMesh;
        this._chunkCount++;
    };

    /**
     * Process pending meshes: attempt to build geometry for chunks that were deferred.
     * Uses frame batching to spread mesh builds across multiple frames for smoother FPS.
     * Increments retry counters once per frame and attempts rebuild each frame until
     * successful or max retries exceeded.
     *
     * Retry logic:
     * 1. Each pending entry has a `retries` counter incremented exactly once per frame
     *    (not per _createChunkMesh call) to prevent double-counting.
     * 2. If a mesh is built successfully, the pending entry is removed.
     * 3. If max retries exceeded, the chunk is dropped with a warning log.
     * 4. Frame batching ensures we don't overload any single frame.
     *
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._processPendingMeshes = function () {
        var keysToDelete = [];
        var self = this;

        // Reset per-frame counter at the start of processing.
        this._chunksProcessedThisFrame = 0;

        for (var key in this._pendingMeshes) {
            if (!this._pendingMeshes.hasOwnProperty(key)) continue;

            // Frame batching limit: only process N pending meshes per frame.
            if (this._chunksProcessedThisFrame >= this._maxChunksPerFrame) {
                break;
            }

            var pending = this._pendingMeshes[key];

            // If a mesh already exists (built via another path), remove pending entry.
            // This can happen when rebuildChunk() or another code path builds the mesh
            // before _processPendingMeshes gets a chance to retry.
            if (this._chunks[key]) {
                keysToDelete.push(key);
                continue;
            }

            // Skip if max retries exceeded — log warning and drop the chunk.
            if (pending.retries >= this._maxPendingRetries) {
                Donkeycraft.Logger.warn('TerrainRenderer',
                    'Pending chunk [' + pending.x + ',' + pending.z +
                    '] exceeded max retries (' + this._maxPendingRetries + ') — dropping from pending queue');
                keysToDelete.push(key);
                continue;
            }

            // Increment retry counter ONCE per frame before attempting rebuild.
            // This prevents double-counting: _createChunkMesh will NOT increment retries
            // when it defers again, so the counter advances exactly once per frame.
            pending.retries = (pending.retries || 0) + 1;

            // Attempt to rebuild geometry with current block data.
            // _createChunkMesh will either:
            // - Create a mesh (assigning to this._chunks[key], removing from pending below)
            // - Defer again if geometry is still empty (0 vertices) — no retry increment
            this._createChunkMesh(pending.x, pending.z);

            // If mesh was built successfully, mark for cleanup.
            if (this._chunks[key]) {
                keysToDelete.push(key);
            }

            // Increment per-frame counter (only counts actual rebuild attempts, not skips).
            this._chunksProcessedThisFrame++;
        }

        // Remove processed entries.
        for (var i = 0; i < keysToDelete.length; i++) {
            delete this._pendingMeshes[keysToDelete[i]];
        }
    };

    /**
     * Force rebuild a specific chunk's mesh.
     * Destroys the existing mesh and creates a new one from current block data.
     * Useful after manual block modifications that need immediate visual update.
     *
     * @param {number} chunkX - Chunk X coordinate to rebuild.
     * @param {number} chunkZ - Chunk Z coordinate to rebuild.
     */
    Donkeycraft.TerrainRenderer.prototype.rebuildChunk = function (chunkX, chunkZ) {
        var key = chunkX + ',' + chunkZ;
        if (this._chunks[key]) {
            this._chunks[key].destroy();
            delete this._chunks[key];
        }
        this._createChunkMesh(chunkX, chunkZ);
    };

    /**
     * Multiply two 4×4 column-major matrices and store the result in a target array.
     *
     * Computes: result = a × b (where a and b are column-major Float32Arrays).
     * Uses the reusable _tempMatrixData buffer to avoid per-frame allocation.
     *
     * @private
     * @param {Float32Array} a - First matrix (left operand, column-major).
     * @param {Float32Array} b - Second matrix (right operand, column-major).
     * @param {Float32Array} result - Output array (16 floats, column-major).
     */
    Donkeycraft.TerrainRenderer.prototype._multiplyMatrices = function (a, b, result) {
        result[0] = a[0] * b[0] + a[4] * b[1] + a[8] * b[2] + a[12] * b[3];
        result[1] = a[1] * b[0] + a[5] * b[1] + a[9] * b[2] + a[13] * b[3];
        result[2] = a[2] * b[0] + a[6] * b[1] + a[10] * b[2] + a[14] * b[3];
        result[3] = a[3] * b[0] + a[7] * b[1] + a[11] * b[2] + a[15] * b[3];

        result[4] = a[0] * b[4] + a[4] * b[5] + a[8] * b[6] + a[12] * b[7];
        result[5] = a[1] * b[4] + a[5] * b[5] + a[9] * b[6] + a[13] * b[7];
        result[6] = a[2] * b[4] + a[6] * b[5] + a[10] * b[6] + a[14] * b[7];
        result[7] = a[3] * b[4] + a[7] * b[5] + a[11] * b[6] + a[15] * b[7];

        result[8] = a[0] * b[8] + a[4] * b[9] + a[8] * b[10] + a[12] * b[11];
        result[9] = a[1] * b[8] + a[5] * b[9] + a[9] * b[10] + a[13] * b[11];
        result[10] = a[2] * b[8] + a[6] * b[9] + a[10] * b[10] + a[14] * b[11];
        result[11] = a[3] * b[8] + a[7] * b[9] + a[11] * b[10] + a[15] * b[11];

        result[12] = a[0] * b[12] + a[4] * b[13] + a[8] * b[14] + a[12] * b[15];
        result[13] = a[1] * b[12] + a[5] * b[13] + a[9] * b[14] + a[13] * b[15];
        result[14] = a[2] * b[12] + a[6] * b[13] + a[10] * b[14] + a[14] * b[15];
        result[15] = a[3] * b[12] + a[7] * b[13] + a[11] * b[14] + a[15] * b[15];
    };

    /**
     * Extract frustum planes from the view-projection matrix.
     * Each plane is stored as {axis: Vector3, dist: number} where
     * dot(point, axis) + dist <= 0 means the point is inside the plane.
     *
     * Frustum plane conventions (left-handed, inside = negative):
     *   [0] Left    — plane normal points left of camera view
     *   [1] Right   — plane normal points right of camera view
     *   [2] Bottom  — plane normal points below camera view
     *   [3] Top     — plane normal points above camera view
     *   [4] Near    — plane normal points toward camera (near clipping)
     *   [5] Far     — plane normal points away from camera (far clipping)
     *
     * @returns {Array<{axis: Donkeycraft.Vector3, dist: number}|null>} Array of 6 planes, or null if extraction fails.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._extractFrustumPlanes = function () {
        var projData = this._cachedProjData;
        var viewData = this._cachedViewData;
        if (!projData || !viewData) {
            Donkeycraft.Logger.warn('TerrainRenderer', '_extractFrustumPlanes skipped: matrix data not available');
            return null;
        }

        // Validate matrix data has valid values (no NaN/Infinity from corrupted matrices).
        for (var i = 0; i < 16; i++) {
            if (!isFinite(projData[i]) || !isFinite(viewData[i])) {
                Donkeycraft.Logger.error('TerrainRenderer',
                    '_extractFrustumPlanes: invalid matrix data at proj[' + i + ']=' + projData[i] +
                    ', view[' + i + ']=' + viewData[i]);
                this._frustumPlanes = null;
                return null;
            }
        }

        // Multiply projection × view matrices using the reusable temp buffer.
        this._multiplyMatrices(projData, viewData, this._tempMatrixData);

        // Validate multiplied result before extracting planes.
        for (var v = 0; v < 16; v++) {
            if (!isFinite(this._tempMatrixData[v])) {
                Donkeycraft.Logger.error('TerrainRenderer',
                    '_extractFrustumPlanes: invalid VP matrix product at [' + v + ']=' + this._tempMatrixData[v]);
                this._frustumPlanes = null;
                return null;
            }
        }

        var planes = [
            this._extractPlane(this._tempMatrixData, -1, 0, 0),   // Left
            this._extractPlane(this._tempMatrixData, 1, 0, 0),    // Right
            this._extractPlane(this._tempMatrixData, 0, -1, 0),   // Bottom
            this._extractPlane(this._tempMatrixData, 0, 1, 0),    // Top
            this._extractPlane(this._tempMatrixData, 0, 0, -1),   // Near
            this._extractPlane(this._tempMatrixData, 0, 0, 1)     // Far
        ];

        // Verify all planes extracted successfully.
        for (var p = 0; p < planes.length; p++) {
            if (!planes[p]) {
                Donkeycraft.Logger.error('TerrainRenderer',
                    '_extractFrustumPlanes: plane ' + p + ' extraction failed');
                this._frustumPlanes = null;
                return null;
            }
        }

        this._frustumPlanes = planes;
        return planes;
    };

    /**
     * Extract a single frustum plane from the view-projection matrix.
     * Uses standard extraction formula for column-major matrices:
     *   plane = col3 ± sign * colN (where colN is the selected column).
     *
     * Plane equation: dot(point, axis) + dist <= 0 means inside.
     * A zero-length normal indicates a degenerate matrix (e.g., uninitialized).
     *
     * @private
     * @param {Float32Array} vp - View-projection matrix (column-major, 16 floats).
     * @param {number} i - Sign selector column index (±1 or 0).
     * @param {number} j - Column offset index (±1 or 0).
     * @param {number} k - Sign selector sign indicator (±1 or 0).
     * @returns {{axis: Donkeycraft.Vector3, dist: number}|null} Extracted plane, or null if degenerate.
     */
    Donkeycraft.TerrainRenderer.prototype._extractPlane = function (vp, i, j, k) {
        var col, sign;
        if (i !== 0) { col = 0; sign = i < 0 ? 1 : -1; }
        else if (j !== 0) { col = 1; sign = j < 0 ? 1 : -1; }
        else { col = 2; sign = k < 0 ? 1 : -1; }

        // Column-major matrix layout: column N elements are at indices N, N+4, N+8, N+12.
        // The frustum plane is extracted as: plane = vp[12..15] ± sign * vp[col*4+0..col*4+3].
        // (vp[col*4+0] = first row of column N, etc.)
        var px = vp[12] + sign * vp[col * 4 + 0];
        var py = vp[13] + sign * vp[col * 4 + 1];
        var pz = vp[14] + sign * vp[col * 4 + 2];
        var pw = vp[15] + sign * vp[col * 4 + 3];

        var length = Math.sqrt(px * px + py * py + pz * pz);

        // Use a stable epsilon to prevent division by very small numbers.
        // A zero-length normal indicates a degenerate view-projection matrix
        // (e.g., uninitialized camera, or corrupted data). Return null to signal failure.
        if (length > 0.001) {
            return {
                axis: new Donkeycraft.Vector3(px / length, py / length, pz / length),
                dist: pw / length
            };
        }

        // Degenerate plane — log warning and signal failure via null.
        Donkeycraft.Logger.warn('TerrainRenderer',
            '_extractPlane: degenerate normal (length=' + length.toFixed(6) +
            ') at i=' + i + ', j=' + j + ', k=' + k);
        return null;
    };

    /**
     * Check if an AABB (axis-aligned bounding box) is visible in the frustum.
     * Uses the 8-corner vs 6-plane test: a box is visible if any corner passes
     * all planes (i.e., not completely behind any single plane).
     *
     * Frustum plane convention (left-handed, inside = negative):
     *   dot(point, plane.axis) + plane.dist <= 0 means point is inside.
     *   If all 8 corners have dot > 0 for a plane, the box is behind that plane → culled.
     *
     * Edge cases handled:
     *   - No frustum planes → return true (render all chunks, no culling)
     *   - Degenerate frustum (from failed extraction) → return true (safe fallback)
     *
     * @param {number} minX - Minimum X coordinate of the AABB.
     * @param {number} minY - Minimum Y coordinate of the AABB.
     * @param {number} minZ - Minimum Z coordinate of the AABB.
     * @param {number} maxX - Maximum X coordinate of the AABB.
     * @param {number} maxY - Maximum Y coordinate of the AABB.
     * @param {number} maxZ - Maximum Z coordinate of the AABB.
     * @returns {boolean} True if the box is partially or fully inside the frustum.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._isBoxInFrustum = function (
        minX, minY, minZ, maxX, maxY, maxZ
    ) {
        // No frustum planes available — render all chunks (no culling).
        if (!this._frustumPlanes || this._frustumPlanes.length === 0) {
            return true;
        }

        // Pre-allocate corner positions for the AABB.
        var corners = [
            minX, minY, minZ, maxX, minY, minZ,
            minX, maxY, minZ, maxX, maxY, minZ,
            minX, minY, maxZ, maxX, minY, maxZ,
            minX, maxY, maxZ, maxX, maxY, maxZ
        ];

        // Test each frustum plane: if all 8 corners are behind it, the box is culled.
        for (var p = 0; p < this._frustumPlanes.length; p++) {
            var plane = this._frustumPlanes[p];
            var allBehind = true;
            for (var c = 0; c < 8; c++) {
                var base = c * 3;
                var dot = corners[base] * plane.axis.x +
                    corners[base + 1] * plane.axis.y +
                    corners[base + 2] * plane.axis.z + plane.dist;
                if (dot <= 0) {
                    allBehind = false;
                    break;
                }
            }
            // All corners behind this plane → box is outside frustum.
            if (allBehind) return false;
        }
        // Box passes at least one plane test → visible.
        return true;
    };

    /**
     * Render the terrain — sets up shaders, matrices, and draws all visible chunks.
     *
     * Rendering pipeline:
     * 1. Validate all prerequisites (WebGL context, shader manager, block getter, camera)
     * 2. Set up depth testing, polygon offset, and face culling state
     * 3. Activate terrain shader and set camera matrices
     * 4. Extract frustum planes for chunk culling
     * 5. Bind texture atlas (or placeholder) and lighting uniforms
     * 6. Draw each visible chunk via _drawChunk()
     * 7. Restore all modified GL state before returning
     *
     * CRITICAL: All GL state changes (DEPTH_TEST, POLYGON_OFFSET_FILL, CULL_FACE,
     * DEPTH_WRITEMASK, DEPTH_FUNC) are wrapped in try/finally to ensure restoration
     * even when early returns or errors occur.
     *
     * @param {Donkeycraft.Camera} camera - Camera instance for view/projection matrices.
     */
    Donkeycraft.TerrainRenderer.prototype.render = function (camera) {
        var gl = this._gl;

        // ---- Early validation — no GL state changes until all checks pass ----
        if (!gl) {
            Donkeycraft.Logger.error('TerrainRenderer', 'render skipped: WebGL context is null');
            return;
        }
        // FIX: Call gl.isContextLost() as a method (with parentheses) to check if context was actually lost.
        // Without parentheses, this checks if the property exists (always truthy), causing early return every frame.
        if (gl.isContextLost()) {
            Donkeycraft.Logger.warn('TerrainRenderer', 'render skipped: WebGL context is lost');
            return;
        }
        if (!this._shaderManager) {
            Donkeycraft.Logger.warn('TerrainRenderer', 'render skipped: shader manager is null');
            return;
        }
        if (!this._getBlockFunc) {
            Donkeycraft.Logger.warn('TerrainRenderer', 'render skipped: block getter function is not set');
            return;
        }
        if (!camera) {
            Donkeycraft.Logger.warn('TerrainRenderer', 'render skipped: camera is null');
            return;
        }

        // ---- FIX Issue #5: Validate shader BEFORE modifying GL state ----
        // If shader activation fails, we return before any GL state changes,
        // so nothing needs to be restored. This prevents state corruption.
        if (!this._shaderManager.use('terrain')) {
            Donkeycraft.Logger.error('TerrainRenderer', 'render: terrain shader program not available — skipping');
            return;
        }

        // Save current GL state for restoration after terrain rendering.
        var prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
        var prevDepthFunc = gl.getParameter(gl.DEPTH_FUNC);
        var prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
        var prevPolyOffsetFill = gl.isEnabled(gl.POLYGON_OFFSET_FILL);
        var prevPolyOffsetFactor, prevPolyOffsetUnits;
        try {
            prevPolyOffsetFactor = gl.getParameter(gl.POLYGON_OFFSET_FACTOR);
            prevPolyOffsetUnits = gl.getParameter(gl.POLYGON_OFFSET_UNITS);
        } catch (e) {
            prevPolyOffsetFactor = 0;
            prevPolyOffsetUnits = 0;
        }
        var prevCullFace = false;
        try { prevCullFace = gl.isEnabled(gl.CULL_FACE); } catch (e) { /* context may be lost */ }

        try {
            // ---- Enable depth testing for proper terrain rendering ----
            if (!prevDepthTest) {
                gl.enable(gl.DEPTH_TEST);
            }
            gl.depthFunc(gl.LEQUAL);

            // Enable polygon offset to prevent z-fighting between adjacent block faces.
            // When blocks share edges at identical world coordinates, floating-point
            // depth precision causes triangles within quads to flicker. POLYGON_OFFSET_FILL
            // adds a small depth bias to push each face slightly away from the camera.
            if (!prevPolyOffsetFill) {
                gl.enable(gl.POLYGON_OFFSET_FILL);
            }
            gl.polygonOffset(0.5, 0.5);

            // Shader already activated above — before any GL state changes.

            // ---- Set camera matrices ----
            var matrices = camera.getMatrices();
            this._shaderManager.setMat4('uProjection', matrices.projection);
            this._shaderManager.setMat4('uView', matrices.view);

            // ---- Cache matrix data for frustum extraction ----
            this._cachedProjData = matrices.projection.getData();
            this._cachedViewData = matrices.view.getData();

            // ---- Extract frustum planes only when matrices change ----
            var cacheKey = this._getFrustumCacheKey();
            if (cacheKey !== this._lastFrustumKey) {
                var planes = this._extractFrustumPlanes();
                if (!planes || planes.length === 0) {
                    Donkeycraft.Logger.warn('TerrainRenderer',
                        'render: frustum extraction failed — rendering all chunks (no culling)');
                    this._frustumPlanes = null;
                } else {
                    this._frustumPlanes = planes;
                }
                this._lastFrustumKey = cacheKey;
            }

            // ---- Set model matrix (identity for world-space rendering) ----
            var identityMatrix = _getCachedIdentityMatrix();
            this._shaderManager.setMat4('uModel', identityMatrix);

            // ---- Bind texture unit (atlas on unit 0) ----
            gl.activeTexture(gl.TEXTURE0);

            if (this._textureAtlas && this._textureAtlas.isReady()) {
                this._textureAtlas.bind();
            } else {
                var placeholderTex = this._getPlaceholderTexture();
                if (placeholderTex) {
                    gl.bindTexture(gl.TEXTURE_2D, placeholderTex);
                }
            }
            this._shaderManager.setSampler('uTexture', 0);

            // ---- Set fog uniforms ----
            if (this._fog) {
                if (this._lighting) {
                    this._fog.updateFromSky(this._lighting.getSkyColor());
                }
                this._fog.applyToFogUniforms(this._shaderManager);
            }

            // ---- Set dynamic lighting factor ----
            if (this._lighting) {
                this._lighting.applyToShader(this._shaderManager);
            } else {
                this._shaderManager.setFloat('uLightFactor', 1.0);
            }

            // ---- Disable GPU back-face culling ----
            // All visible-face culling is done at build time in GeometryBuilder.
            // Enabling gl.cullFace(gl.BACK) causes incorrect clipping of faces when the
            // camera angle makes normally-wound triangles appear "back-facing" in WebGL 1.
            if (prevCullFace) {
                gl.disable(gl.CULL_FACE);
            }

            // ---- Draw each visible chunk, skipping those outside the frustum ----
            var cs = CHUNK_SIZE;
            for (var key in this._chunks) {
                if (!this._chunks.hasOwnProperty(key)) continue;

                var chunkMesh = this._chunks[key];
                var cx = chunkMesh._chunkX;
                var cz = chunkMesh._chunkZ;

                // Skip if outside frustum. Expand AABB bounds by 2 blocks to prevent
                // incorrect culling when camera is pitched up/down and frustum planes tilt.
                if (!this._isBoxInFrustum(
                    cx * cs - 2, -2, cz * cs - 2,
                    (cx + 1) * cs + 2, WORLD_HEIGHT + 2, (cz + 1) * cs + 2
                )) {
                    continue;
                }

                this._drawChunk(chunkMesh);
            }
        } finally {
            // CRITICAL: Always restore GL state before returning — even on error or early exit.
            gl.depthFunc(prevDepthFunc);
            gl.depthMask(prevDepthMask);

            if (!prevPolyOffsetFill) {
                gl.disable(gl.POLYGON_OFFSET_FILL);
            } else {
                gl.polygonOffset(prevPolyOffsetFactor, prevPolyOffsetUnits);
            }

            if (prevCullFace) {
                gl.enable(gl.CULL_FACE);
            } else {
                gl.disable(gl.CULL_FACE);
            }

            // Restore depth testing only if it was disabled before we entered render().
            if (!prevDepthTest) {
                gl.disable(gl.DEPTH_TEST);
            }
        }
    };

    /**
     * Generate a cache key for the current view-projection state.
     * Used to determine if frustum planes need re-extraction.
     * Includes all 16 matrix elements to detect translation changes (camera movement).
     *
     * @returns {string} Cache key string, or empty string if data unavailable.
     * @private
     */
    Donkeycraft.TerrainRenderer.prototype._getFrustumCacheKey = function () {
        if (!this._cachedProjData || !this._cachedViewData) return '';
        // Include ALL 16 elements to detect camera translation changes.
        // The first 12 elements encode rotation/scale; indices 12-15 encode translation.
        // Missing translation causes stale frustum planes when the camera moves without rotating.
        return this._cachedProjData.slice(0, 16).join(',') + '|' +
            this._cachedViewData.slice(0, 16).join(',');
    };

    /**
     * Draw a single chunk mesh using its uploaded buffers.
     * Returns true if the draw call succeeded, false otherwise.
     * @private
     * @param {ChunkMesh} chunkMesh - The chunk mesh to draw.
     * @returns {boolean} True if drawn successfully.
     */
    Donkeycraft.TerrainRenderer.prototype._drawChunk = function (chunkMesh) {
        if (!chunkMesh || chunkMesh.getIndexCount() === 0) return false;
        return chunkMesh.draw();
    };

    /**
     * Get or create a placeholder texture for chunks with missing atlas data.
     * Attempts to use TextureGenerator.generateMissing() first (checkerboard pattern),
     * falling back to a 1x1 white texture if unavailable.
     * Handles async image loading by returning null until the texture is ready.
     * The texture is cached in _placeholderTexture so it persists across frames.
     * @private
     * @returns {number|null} WebGL texture name, or null if not yet ready.
     */
    Donkeycraft.TerrainRenderer.prototype._getPlaceholderTexture = function () {
        var gl = this._gl;
        if (!gl) return null;

        // Return cached texture if already created and valid.
        if (this._placeholderTexture && gl.isTexture(this._placeholderTexture)) {
            return this._placeholderTexture;
        }

        // Guard: ensure TextureGenerator is available before calling generateMissing().
        if (!Donkeycraft.TextureGenerator) {
            Donkeycraft.Logger.warn('TerrainRenderer',
                'TextureGenerator not available — falling back to 1x1 white placeholder');
            return this._createFallbackTexture();
        }

        // Attempt to use the generated "missing" texture for visual consistency.
        var missingTex = null;
        try {
            missingTex = Donkeycraft.TextureGenerator.generateMissing();
        } catch (e) {
            Donkeycraft.Logger.warn('TerrainRenderer',
                'generateMissing() threw error: ' + e.message +
                ' — falling back to 1x1 white placeholder');
            return this._createFallbackTexture();
        }

        if (!missingTex || !missingTex.src && !missingTex.getContext) {
            Donkeycraft.Logger.warn('TerrainRenderer',
                'generateMissing() returned invalid texture — falling back to 1x1 white placeholder');
            return this._createFallbackTexture();
        }

        try {
            if (missingTex.getContext) {
                // Canvas-based texture: upload directly.
                gl.bindTexture(gl.TEXTURE_2D, null);
                this._placeholderTexture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, missingTex);
            } else if (missingTex.complete && missingTex.naturalWidth > 0) {
                // Image already loaded — draw to a temporary canvas first.
                var tempCanvas = document.createElement('canvas');
                tempCanvas.width = 16;
                tempCanvas.height = 16;
                var tempCtx = tempCanvas.getContext('2d');
                if (!tempCtx) {
                    Donkeycraft.Logger.warn('TerrainRenderer',
                        'Failed to create temp canvas context — falling back to 1x1 white placeholder');
                    return this._createFallbackTexture();
                }
                tempCtx.drawImage(missingTex, 0, 0, 16, 16);
                gl.bindTexture(gl.TEXTURE_2D, null);
                this._placeholderTexture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
            } else {
                // Image not loaded yet — keep _placeholderTexture as null so the
                // caller skips binding. Next frame the image will be ready and we retry.
                this._placeholderTexture = null;
                return null;
            }

            // Set texture parameters for proper sampling.
            // Use CLAMP_TO_EDGE to match the main atlas wrapping mode — REPEAT causes
            // texture bleeding at tile boundaries when nearest-neighbor filtering is used.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        } catch (e) {
            Donkeycraft.Logger.warn('TerrainRenderer',
                'Placeholder texture creation failed: ' + e.message + ' — falling back to 1x1 white placeholder');
            return this._createFallbackTexture();
        }

        return this._placeholderTexture;
    };

    /**
     * Create a minimal 1x1 white fallback texture.
     * Used when generateMissing() is unavailable, throws an error, or returns invalid data.
     * Deletes any existing placeholder texture to prevent memory leaks.
     * @private
     * @returns {number|null} WebGL texture name, or null on failure.
     */
    Donkeycraft.TerrainRenderer.prototype._createFallbackTexture = function () {
        var gl = this._gl;
        if (!gl) return null;

        // Delete any existing placeholder to avoid memory leak.
        if (this._placeholderTexture && gl.isTexture(this._placeholderTexture)) {
            gl.deleteTexture(this._placeholderTexture);
        }

        try {
            this._placeholderTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([255, 255, 255, 255]));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        } catch (e) {
            Donkeycraft.Logger.error('TerrainRenderer',
                'Failed to create fallback texture: ' + e.message);
            this._placeholderTexture = null;
            return null;
        }

        return this._placeholderTexture;
    };

    /**
     * Get the number of loaded chunk meshes.
     *
     * @returns {number} Number of chunks currently loaded and rendered.
     */
    Donkeycraft.TerrainRenderer.prototype.getChunkCount = function () {
        return this._chunkCount;
    };

    /**
     * Get render statistics for debug overlay display.
     * Returns counts for chunks rendered, meshes built, and draw calls.
     * Note: All values represent the current number of loaded chunks since each
     * chunk produces one draw call in the current WebGL 1.0 implementation.
     *
     * @returns {{chunksRendered: number, meshesBuilt: number, drawCalls: number}}
     *    Render statistics object with integer counts.
     */
    Donkeycraft.TerrainRenderer.prototype.getRenderStats = function () {
        return {
            chunksRendered: this._chunkCount || 0,
            meshesBuilt: this._chunkCount || 0,
            drawCalls: this._chunkCount || 0
        };
    };

    /**
     * Destroy all chunk meshes, pending mesh entries, and free GPU resources.
     * Also deletes the placeholder texture if it exists and clears all internal state.
     * Call this when the terrain renderer is no longer needed to prevent memory leaks.
     */
    Donkeycraft.TerrainRenderer.prototype.destroy = function () {
        for (var key in this._chunks) {
            if (this._chunks.hasOwnProperty(key)) {
                this._chunks[key].destroy();
            }
        }
        this._chunks = {};
        this._chunkCount = 0;

        // Clear pending meshes.
        for (var key in this._pendingMeshes) {
            if (this._pendingMeshes.hasOwnProperty(key)) {
                delete this._pendingMeshes[key];
            }
        }
        this._pendingMeshes = {};

        // Delete placeholder texture.
        if (this._gl && this._placeholderTexture) {
            this._gl.deleteTexture(this._placeholderTexture);
            this._placeholderTexture = null;
        }

        // Clear debug logging flags to allow fresh logs on next session.
        this._updateChunksLogged = false;
        this._renderLogged = false;
    };

})();