// Donkeycraft — Terrain Renderer
// Chunk iteration, frustum culling, batched draws.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;
  var RENDER_DISTANCE = Donkeycraft.Config.RENDER_DISTANCE;

  /**
   * TerrainRenderer — Manages chunk-based terrain rendering.
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

    // Identity model matrix (static — chunks use identity transform)
    this._identityMatrix = Donkeycraft.Matrix4.createIdentity();

    // Chunk mesh storage: map "chunkX,chunkZ" → ChunkMesh
    this._chunks = {};
    this._chunkCount = 0;

    // Dirty chunks needing rebuild
    this._dirtyChunks = {};

    // Pending meshes: chunks whose geometry couldn't be built yet (e.g., block data not ready)
    // map "chunkX,chunkZ" → { x: number, z: number, retries: number }
    this._pendingMeshes = {};

    /** Maximum retry attempts for pending mesh builds before giving up. */
    this._maxPendingRetries = 30;

    /** Maximum chunks to rebuild per frame (spreads builds across frames). */
    this._maxChunksPerFrame = 2;

    /** Counter for chunks processed in the current frame. */
    this._chunksProcessedThisFrame = 0;

    /** Placeholder texture — created lazily on first need. */
    this._placeholderTexture = null;

    // Geometry builder and mesh optimizer
    this._geometryBuilder = new Donkeycraft.GeometryBuilder();
    this._meshOptimizer = new Donkeycraft.MeshOptimizer();

    /** Whether to skip water blocks during terrain mesh building. */
    this._skipWaterBlocks = false;

    // Reusable temp buffer for matrix multiplication
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

    // AABB padding for frustum culling (prevents incorrect culling when camera is pitched)
    this._frustumAabbPadding = 2;

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
   * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
   */
  Donkeycraft.TerrainRenderer.prototype.setWorldData = function (getBlockFunc) {
    this._getBlockFunc = getBlockFunc;
  };

  /**
   * Set the camera reference for back-face culling optimization.
   * @param {Donkeycraft.Camera} camera - Camera instance, or null to disable.
   */
  Donkeycraft.TerrainRenderer.prototype.setCamera = function (camera) {
    this._camera = camera || null;
  };

  /**
   * Set the lighting system for dynamic time-of-day lighting.
   * @param {Donkeycraft.Lighting|null} lighting - Lighting system instance, or null.
   */
  Donkeycraft.TerrainRenderer.prototype.setLighting = function (lighting) {
    this._lighting = lighting || null;
  };

  /**
   * Set the texture atlas to use for terrain rendering.
   * @param {Donkeycraft.TextureAtlas} atlas - Texture atlas instance.
   */
  Donkeycraft.TerrainRenderer.prototype.setTextureAtlas = function (atlas) {
    this._textureAtlas = atlas;
  };

  /**
   * Enable or disable skipping water blocks during terrain mesh building.
   * @param {boolean} enabled - Whether to skip water blocks.
   */
  Donkeycraft.TerrainRenderer.prototype.setSkipWaterBlocks = function (
    enabled
  ) {
    this._skipWaterBlocks = !!enabled;
    if (this._geometryBuilder) {
      this._geometryBuilder._skipWaterBlocks = !!enabled;
    }
  };

  /** @returns {Lighting|null} */
  Donkeycraft.TerrainRenderer.prototype.getLighting = function () {
    return this._lighting;
  };

  /**
   * Set the render distance in chunks (radius from player).
   * @param {number} distance
   */
  Donkeycraft.TerrainRenderer.prototype.setRenderDistance = function (
    distance
  ) {
    this._renderDistance = distance;
  };

  /** @returns {number} */
  Donkeycraft.TerrainRenderer.prototype.getRenderDistance = function () {
    return this._renderDistance;
  };

  /**
   * Enable or disable CPU-side back-face culling during mesh build.
   * @param {boolean} enabled - Whether to enable back-face culling.
   */
  Donkeycraft.TerrainRenderer.prototype.setBackFaceCulling = function (
    enabled
  ) {
    this._enableBackFaceCulling = !!enabled;
  };

  /** @returns {boolean} True if back-face culling is enabled. */
  Donkeycraft.TerrainRenderer.prototype.isBackFaceCullingEnabled = function () {
    return this._enableBackFaceCulling !== false;
  };

  /**
   * Mark a chunk as dirty (needs rebuilding on next updateChunks).
   * Validates that chunk coordinates are integers.
   * @param {number} chunkX - Chunk X coordinate (integer).
   * @param {number} chunkZ - Chunk Z coordinate (integer).
   */
  Donkeycraft.TerrainRenderer.prototype.markChunkDirty = function (
    chunkX,
    chunkZ
  ) {
    // Validate chunk coordinates are integers
    if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
      Donkeycraft.Logger.warn(
        'TerrainRenderer',
        'markChunkDirty called with non-integer coordinates [' +
          chunkX +
          ',' +
          chunkZ +
          '] — ignoring'
      );
      return;
    }
    this._dirtyChunks[chunkX + ',' + chunkZ] = true;
  };

  /**
   * Update chunk meshes that need rebuilding.
   * Rebuilds dirty chunks, creates new visible chunks, removes out-of-range chunks.
   * @param {number} playerChunkX - Player's current chunk X coordinate.
   * @param {number} playerChunkZ - Player's current chunk Z coordinate.
   */
  Donkeycraft.TerrainRenderer.prototype.updateChunks = function (
    playerChunkX,
    playerChunkZ
  ) {
    var gl = this._gl;
    if (!gl || !this._getBlockFunc) {
      Donkeycraft.Logger.error(
        'TerrainRenderer',
        'updateChunks skipped: gl=' +
          (gl ? 'ok' : 'null') +
          ', _getBlockFunc=' +
          (this._getBlockFunc ? 'ok' : 'null')
      );
      return;
    }

    // Determine which chunks should be loaded within render distance
    var neededChunks = {};
    var renderDistSq = this._renderDistance * this._renderDistance;
    for (var dx = -this._renderDistance; dx <= this._renderDistance; dx++) {
      for (var dz = -this._renderDistance; dz <= this._renderDistance; dz++) {
        if (dx * dx + dz * dz > renderDistSq) continue;

        var cx = playerChunkX + dx;
        var cz = playerChunkZ + dz;
        var key = cx + ',' + cz;
        neededChunks[key] = true;

        if (!this._chunks[key]) {
          this._createChunkMesh(cx, cz);
        } else if (this._dirtyChunks[key]) {
          this.rebuildChunk(cx, cz);
          delete this._dirtyChunks[key];
        }
      }
    }

    // Process pending meshes only for chunks that remain within render distance
    this._processPendingMeshes(neededChunks);

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
   * Create a new chunk mesh. Defers if geometry has 0 vertices.
   * @private
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   */
  Donkeycraft.TerrainRenderer.prototype._createChunkMesh = function (
    chunkX,
    chunkZ
  ) {
    var gl = this._gl;
    if (!gl || !this._getBlockFunc) return;

    // Wrap world-coordinate getter into local chunk coordinates
    var self = this;
    var localGetBlock = function (localX, y, localZ) {
      var worldX = chunkX * CHUNK_SIZE + localX;
      var worldY = y;
      var worldZ = chunkZ * CHUNK_SIZE + localZ;
      return self._getBlockFunc(worldX, worldY, worldZ);
    };

    // Build geometry (face culling done during build)
    var geometry = this._geometryBuilder.buildChunk(
      chunkX,
      chunkZ,
      localGetBlock
    );

    // Validate geometry output
    if (!geometry || !(geometry.vertices instanceof Float32Array)) {
      Donkeycraft.Logger.error(
        'TerrainRenderer',
        'buildChunk returned invalid geometry for [' +
          chunkX +
          ',' +
          chunkZ +
          ']'
      );
      return;
    }

    // Empty geometry (all air) — defer until data is available
    if (geometry.vertexCount === 0) {
      var pendingKey = chunkX + ',' + chunkZ;
      if (!this._pendingMeshes[pendingKey]) {
        this._pendingMeshes[pendingKey] = { x: chunkX, z: chunkZ, retries: 0 };
      }
      return;
    }

    // Vertex deduplication; CPU back-face culling disabled since GPU handles it per-frame.
    geometry = this._meshOptimizer.optimize(geometry, null, false);

    // Upload geometry to GPU buffers
    var chunkMesh = new Donkeycraft.ChunkMesh(gl, this._shaderManager);
    chunkMesh.update(geometry);
    chunkMesh._chunkX = chunkX;
    chunkMesh._chunkZ = chunkZ;

    var key = chunkX + ',' + chunkZ;
    this._chunks[key] = chunkMesh;
    this._chunkCount++;
  };

  /**
   * Process pending meshes: attempt to build geometry for deferred chunks.
   * Skips chunks outside render distance; uses frame batching for smooth FPS.
   * @param {Object<string, boolean>} neededChunks — Chunk keys within render distance.
   * @private
   */
  Donkeycraft.TerrainRenderer.prototype._processPendingMeshes = function (
    neededChunks
  ) {
    var keysToDelete = [];
    var self = this;

    // Reset per-frame counter
    this._chunksProcessedThisFrame = 0;

    for (var key in this._pendingMeshes) {
      if (!this._pendingMeshes.hasOwnProperty(key)) continue;

      // Skip chunks outside render distance
      if (!neededChunks || !neededChunks[key]) continue;

      // Frame batching limit
      if (this._chunksProcessedThisFrame >= this._maxChunksPerFrame) {
        break;
      }

      var pending = this._pendingMeshes[key];

      // Mesh already built via another path — remove pending entry
      if (this._chunks[key]) {
        keysToDelete.push(key);
        continue;
      }

      // Max retries exceeded — drop the chunk
      if (pending.retries >= this._maxPendingRetries) {
        Donkeycraft.Logger.warn(
          'TerrainRenderer',
          'Pending chunk [' +
            pending.x +
            ',' +
            pending.z +
            '] exceeded max retries (' +
            this._maxPendingRetries +
            ') — dropping from pending queue'
        );
        keysToDelete.push(key);
        continue;
      }

      // Increment retry counter
      pending.retries = (pending.retries || 0) + 1;

      // Attempt rebuild
      this._createChunkMesh(pending.x, pending.z);

      // Mark for cleanup if built
      if (this._chunks[key]) {
        keysToDelete.push(key);
      }

      this._chunksProcessedThisFrame++;
    }

    // Remove processed entries
    for (var i = 0; i < keysToDelete.length; i++) {
      delete this._pendingMeshes[keysToDelete[i]];
    }
  };

  /**
   * Force rebuild a specific chunk's mesh.
   * Useful after manual block modifications needing immediate visual update.
   * @param {number} chunkX - Chunk X coordinate to rebuild.
   * @param {number} chunkZ - Chunk Z coordinate to rebuild.
   */
  Donkeycraft.TerrainRenderer.prototype.rebuildChunk = function (
    chunkX,
    chunkZ
  ) {
    var key = chunkX + ',' + chunkZ;
    if (this._chunks[key]) {
      this._chunks[key].destroy();
      delete this._chunks[key];
    }
    this._createChunkMesh(chunkX, chunkZ);
  };

  /**
   * Multiply two 4×4 column-major matrices: result = a × b.
   * Uses reusable _tempMatrixData to avoid per-frame allocation.
   * @private
   * @param {Float32Array} a - First matrix (column-major).
   * @param {Float32Array} b - Second matrix (column-major).
   * @param {Float32Array} result - Output array (16 floats, column-major).
   */
  Donkeycraft.TerrainRenderer.prototype._multiplyMatrices = function (
    a,
    b,
    result
  ) {
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
   * Each plane: {axis: Vector3, dist} where dot(point, axis) + dist <= 0 means inside.
   * Plane order: [Left, Right, Bottom, Top, Near, Far].
   * @returns {Array<{axis: Donkeycraft.Vector3, dist: number}|null>} Array of 6 planes, or null on failure.
   * @private
   */
  Donkeycraft.TerrainRenderer.prototype._extractFrustumPlanes = function () {
    var projData = this._cachedProjData;
    var viewData = this._cachedViewData;
    if (!projData || !viewData) {
      Donkeycraft.Logger.warn(
        'TerrainRenderer',
        '_extractFrustumPlanes skipped: matrix data not available'
      );
      return null;
    }

    // Validate matrix data has valid values (no NaN/Infinity from corrupted matrices).
    for (var i = 0; i < 16; i++) {
      if (!isFinite(projData[i]) || !isFinite(viewData[i])) {
        Donkeycraft.Logger.error(
          'TerrainRenderer',
          '_extractFrustumPlanes: invalid matrix data at proj[' +
            i +
            ']=' +
            projData[i] +
            ', view[' +
            i +
            ']=' +
            viewData[i]
        );
        this._frustumPlanes = null;
        return null;
      }
    }

    // Multiply projection × view matrices using the reusable temp buffer.
    this._multiplyMatrices(projData, viewData, this._tempMatrixData);

    // Validate multiplied result before extracting planes.
    for (var v = 0; v < 16; v++) {
      if (!isFinite(this._tempMatrixData[v])) {
        Donkeycraft.Logger.error(
          'TerrainRenderer',
          '_extractFrustumPlanes: invalid VP matrix product at [' +
            v +
            ']=' +
            this._tempMatrixData[v]
        );
        this._frustumPlanes = null;
        return null;
      }
    }

    var planes = [
      this._extractPlane(this._tempMatrixData, -1, 0, 0),
      this._extractPlane(this._tempMatrixData, 1, 0, 0),
      this._extractPlane(this._tempMatrixData, 0, -1, 0),
      this._extractPlane(this._tempMatrixData, 0, 1, 0),
      this._extractPlane(this._tempMatrixData, 0, 0, -1),
      this._extractPlane(this._tempMatrixData, 0, 0, 1),
    ];

    // Verify all planes extracted
    for (var p = 0; p < planes.length; p++) {
      if (!planes[p]) {
        Donkeycraft.Logger.error(
          'TerrainRenderer',
          '_extractFrustumPlanes: plane ' + p + ' extraction failed'
        );
        this._frustumPlanes = null;
        return null;
      }
    }

    this._frustumPlanes = planes;
    return planes;
  };

  /**
   * Extract a single frustum plane from the view-projection matrix.
   * Plane equation: dot(point, axis) + dist <= 0 means inside.
   * @private
   * @param {Float32Array} vp - View-projection matrix (column-major, 16 floats).
   * @param {number} i - Sign selector column index (±1 or 0).
   * @param {number} j - Column offset index (±1 or 0).
   * @param {number} k - Sign selector sign indicator (±1 or 0).
   * @returns {{axis: Donkeycraft.Vector3, dist: number}|null} Extracted plane, or null if degenerate.
   */
  Donkeycraft.TerrainRenderer.prototype._extractPlane = function (vp, i, j, k) {
    var col, sign;
    if (i !== 0) {
      col = 0;
      sign = i < 0 ? 1 : -1;
    } else if (j !== 0) {
      col = 1;
      sign = j < 0 ? 1 : -1;
    } else {
      col = 2;
      sign = k < 0 ? 1 : -1;
    }

    // Column-major: column N at indices N, N+4, N+8, N+12.
    // plane = vp[12..15] ± sign * vp[col*4+0..col*4+3].
    var px = vp[12] + sign * vp[col * 4 + 0];
    var py = vp[13] + sign * vp[col * 4 + 1];
    var pz = vp[14] + sign * vp[col * 4 + 2];
    var pw = vp[15] + sign * vp[col * 4 + 3];

    var length = Math.sqrt(px * px + py * py + pz * pz);

    // Zero-length normal = degenerate matrix → return null
    if (length > 0.001) {
      return {
        axis: new Donkeycraft.Vector3(px / length, py / length, pz / length),
        dist: pw / length,
      };
    }

    // Degenerate plane — signal failure via null
    Donkeycraft.Logger.warn(
      'TerrainRenderer',
      '_extractPlane: degenerate normal (length=' +
        length.toFixed(6) +
        ') at i=' +
        i +
        ', j=' +
        j +
        ', k=' +
        k
    );
    return null;
  };

  /**
   * Check if an AABB is visible in the frustum (8-corner vs 6-plane test).
   * A box is visible if any corner passes all planes.
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
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ
  ) {
    // No frustum planes — render all chunks
    if (!this._frustumPlanes || this._frustumPlanes.length === 0) {
      return true;
    }

    // Pre-allocate AABB corners
    var corners = [
      minX,
      minY,
      minZ,
      maxX,
      minY,
      minZ,
      minX,
      maxY,
      minZ,
      maxX,
      maxY,
      minZ,
      minX,
      minY,
      maxZ,
      maxX,
      minY,
      maxZ,
      minX,
      maxY,
      maxZ,
      maxX,
      maxY,
      maxZ,
    ];

    // If all 8 corners outside a plane → culled
    for (var p = 0; p < this._frustumPlanes.length; p++) {
      var plane = this._frustumPlanes[p];
      var allOutside = true;
      for (var c = 0; c < 8; c++) {
        var base = c * 3;
        var dot =
          corners[base] * plane.axis.x +
          corners[base + 1] * plane.axis.y +
          corners[base + 2] * plane.axis.z +
          plane.dist;
        if (dot <= 0) {
          allOutside = false;
          break;
        }
      }
      // All corners outside → culled
      if (allOutside) return false;
    }
    // Visible — passes at least one plane
    return true;
  };

  /**
   * Render the terrain — sets up shaders, matrices, and draws visible chunks.
   * GL state changes (DEPTH_TEST, POLYGON_OFFSET_FILL, CULL_FACE, etc.) are wrapped in try/finally.
   * @param {Donkeycraft.Camera} camera - Camera instance for view/projection matrices.
   */
  Donkeycraft.TerrainRenderer.prototype.render = function (camera) {
    var gl = this._gl;

    // Early validation — no GL state changes until checks pass
    if (!gl || gl.isContextLost()) return;
    if (!this._shaderManager || !this._getBlockFunc || !camera) return;

    // Validate shader before modifying GL state
    if (!this._shaderManager.use('terrain')) {
      Donkeycraft.Logger.error(
        'TerrainRenderer',
        'render: terrain shader program not available — skipping'
      );
      return;
    }

    // Save current GL state for restoration
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
    try {
      prevCullFace = gl.isEnabled(gl.CULL_FACE);
    } catch (e) {
      /* context may be lost */
    }

    try {
      if (!prevDepthTest) gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      // Enable polygon offset to prevent z-fighting
      if (!prevPolyOffsetFill) gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(0.5, 0.5);

      // Set camera matrices
      var matrices = camera.getMatrices();
      if (!matrices || !matrices.projection || !matrices.view) {
        Donkeycraft.Logger.warn(
          'TerrainRenderer',
          'render: camera.getMatrices() returned invalid data — skipping'
        );
        return;
      }
      this._shaderManager.setMat4('uProjection', matrices.projection);
      this._shaderManager.setMat4('uView', matrices.view);

      // Cache matrix data for frustum extraction
      this._cachedProjData = matrices.projection.getData();
      this._cachedViewData = matrices.view.getData();

      // Extract frustum planes only when matrices change
      var cacheKey = this._getFrustumCacheKey();
      if (cacheKey !== this._lastFrustumKey) {
        var planes = this._extractFrustumPlanes();
        if (!planes || planes.length === 0) {
          Donkeycraft.Logger.warn(
            'TerrainRenderer',
            'render: frustum extraction failed — rendering all chunks (no culling)'
          );
          this._frustumPlanes = null;
        } else {
          this._frustumPlanes = planes;
        }
        this._lastFrustumKey = cacheKey;
      }

      // Set identity model matrix (chunks use world-space coordinates)
      this._shaderManager.setMat4('uModel', this._identityMatrix);

      // Bind texture atlas (unit 0)
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

      // Set fog uniforms
      if (this._fog) {
        if (this._lighting) {
          this._fog.updateFromSky(this._lighting.getSkyColor());
        }
        this._fog.applyToFogUniforms(this._shaderManager);
      }

      // Set dynamic lighting factor
      if (this._lighting) {
        this._lighting.applyToShader(this._shaderManager);
      } else {
        this._shaderManager.setFloat('uLightFactor', 1.0);
      }

      // GPU back-face culling disabled — all culling done at build time
      if (prevCullFace) {
        gl.disable(gl.CULL_FACE);
      }

      // Draw visible chunks, skipping those outside frustum
      var cs = CHUNK_SIZE;
      for (var key in this._chunks) {
        if (!this._chunks.hasOwnProperty(key)) continue;

        var chunkMesh = this._chunks[key];
        var cx = chunkMesh._chunkX;
        var cz = chunkMesh._chunkZ;

        // Expand AABB by padding to prevent incorrect culling when camera is pitched
        var pad = this._frustumAabbPadding;
        if (
          !this._isBoxInFrustum(
            cx * cs - pad,
            -pad,
            cz * cs - pad,
            (cx + 1) * cs + pad,
            WORLD_HEIGHT + pad,
            (cz + 1) * cs + pad
          )
        ) {
          continue;
        }

        this._drawChunk(chunkMesh);
      }
    } finally {
      // Restore GL state before returning
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
   * @returns {string} Cache key string, or empty string if data unavailable.
   * @private
   */
  Donkeycraft.TerrainRenderer.prototype._getFrustumCacheKey = function () {
    if (!this._cachedProjData || !this._cachedViewData) return '';
    for (var i = 0; i < 16; i++) {
      if (!isFinite(this._cachedProjData[i]) || !isFinite(this._cachedViewData[i])) return '';
    }
    return (
      this._cachedProjData.join(',') + '|' + this._cachedViewData.join(',')
    );
  };

  /**
   * Draw a single chunk mesh.
   * @private
   * @param {ChunkMesh} chunkMesh - The chunk mesh to draw.
   * @returns {boolean} True if drawn successfully.
   */
  Donkeycraft.TerrainRenderer.prototype._drawChunk = function (chunkMesh) {
    if (!chunkMesh || chunkMesh.getIndexCount() === 0) return false;
    var gl = this._gl;
    if (gl && gl.isContextLost()) return false;
    return chunkMesh.draw();
  };

  /**
   * Get or create a placeholder texture for chunks with missing atlas data.
   * Falls back to a 1x1 white texture if unavailable.
   * @private
   * @returns {number|null} WebGL texture name, or null if not yet ready.
   */
  Donkeycraft.TerrainRenderer.prototype._getPlaceholderTexture = function () {
    var gl = this._gl;
    if (!gl) return null;

    // Return cached texture if valid
    if (this._placeholderTexture && gl.isTexture(this._placeholderTexture)) {
      return this._placeholderTexture;
    }

    // Guard: ensure TextureGenerator is available
    if (!Donkeycraft.TextureGenerator) {
      Donkeycraft.Logger.warn(
        'TerrainRenderer',
        'TextureGenerator not available — falling back to 1x1 white placeholder'
      );
      return this._createFallbackTexture();
    }

    // Attempt to use generated "missing" texture
    var missingTex = null;
    try {
      missingTex = Donkeycraft.TextureGenerator.generateMissing();
    } catch (e) {
      Donkeycraft.Logger.warn(
        'TerrainRenderer',
        'generateMissing() threw error: ' +
          e.message +
          ' — falling back to 1x1 white placeholder'
      );
      return this._createFallbackTexture();
    }

    if (!missingTex || (!missingTex.src && !missingTex.getContext)) {
      Donkeycraft.Logger.warn(
        'TerrainRenderer',
        'generateMissing() returned invalid texture — falling back to 1x1 white placeholder'
      );
      return this._createFallbackTexture();
    }

    try {
      if (missingTex.getContext) {
        // Canvas-based: upload directly
        gl.bindTexture(gl.TEXTURE_2D, null);
        this._placeholderTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          missingTex
        );
      } else if (missingTex.complete && missingTex.naturalWidth > 0) {
        // Image loaded — draw to temp canvas first
        var tempCanvas = document.createElement('canvas');
        tempCanvas.width = 16;
        tempCanvas.height = 16;
        var tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) {
          Donkeycraft.Logger.warn(
            'TerrainRenderer',
            'Failed to create temp canvas context — falling back to 1x1 white placeholder'
          );
          return this._createFallbackTexture();
        }
        tempCtx.drawImage(missingTex, 0, 0, 16, 16);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this._placeholderTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          tempCanvas
        );
      } else {
        // Image not loaded yet — skip binding, retry next frame
        this._placeholderTexture = null;
        return null;
      }

      // CLAMP_TO_EDGE matches atlas wrapping — REPEAT causes bleeding with NEAREST filtering
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (e) {
      Donkeycraft.Logger.warn(
        'TerrainRenderer',
        'Placeholder texture creation failed: ' +
          e.message +
          ' — falling back to 1x1 white placeholder'
      );
      return this._createFallbackTexture();
    }

    return this._placeholderTexture;
  };

  /**
   * Create a minimal 1x1 white fallback texture.
   * Deletes any existing placeholder to prevent memory leaks.
   * @private
   * @returns {number|null} WebGL texture name, or null on failure.
   */
  Donkeycraft.TerrainRenderer.prototype._createFallbackTexture = function () {
    var gl = this._gl;
    if (!gl) return null;

    // Delete any existing placeholder to prevent memory leak
    if (this._placeholderTexture && gl.isTexture(this._placeholderTexture)) {
      gl.deleteTexture(this._placeholderTexture);
    }

    try {
      this._placeholderTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255, 255])
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } catch (e) {
      Donkeycraft.Logger.error(
        'TerrainRenderer',
        'Failed to create fallback texture: ' + e.message
      );
      this._placeholderTexture = null;
      return null;
    }

    return this._placeholderTexture;
  };

  /** @returns {number} Number of chunks currently loaded and rendered. */
  Donkeycraft.TerrainRenderer.prototype.getChunkCount = function () {
    return this._chunkCount;
  };

  /**
   * Get render statistics for debug overlay display.
   * All values represent the current chunk count (one draw call per chunk).
   * @returns {{chunksRendered: number, meshesBuilt: number, drawCalls: number}}
   */
  Donkeycraft.TerrainRenderer.prototype.getRenderStats = function () {
    return {
      chunksRendered: this._chunkCount || 0,
      meshesBuilt: this._chunkCount || 0,
      drawCalls: this._chunkCount || 0,
    };
  };

  /**
   * Destroy all chunk meshes, pending meshes, and free GPU resources.
   * Call when the renderer is no longer needed to prevent memory leaks.
   */
  Donkeycraft.TerrainRenderer.prototype.destroy = function () {
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

    // Delete placeholder texture
    if (this._gl && this._placeholderTexture) {
      this._gl.deleteTexture(this._placeholderTexture);
      this._placeholderTexture = null;
    }
  };
})();
