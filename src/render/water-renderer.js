// Donkeycraft — WaterRenderer (Release Build)
// Unified semi-transparent water surface rendering across all visible chunks.
//
// Features:
// - Single mesh across all visible chunks (no borders at chunk boundaries)
// - Animated FBM wave displacement in fragment shader
// - Fresnel-based reflection blending (grazing angles more reflective)
// - Sun glare specular highlight (Blinn-Phong with wave shimmer)
// - Depth-based distance fog with lighting factor
// - Dithering to prevent alpha banding
// - Robust error handling and JSDoc documentation
//
// Rendering pipeline:
// 1. Terrain pass — opaque blocks only (water blocks skipped by terrain renderer)
// 2. Water surface pass — unified semi-transparent mesh with proper blending
// 3. Sky/HUD overlay
//
// Vertex layout (9 floats per vertex):
//   [0-2]   position:  x, y, z in world coordinates
//   [3-4]   UV:        normalized texture atlas coordinates
//   [5-7]   normal:    face normal vector (nx, ny, nz)
//   [8]     padding:   reserved for future use (padded to 9 floats for alignment)
//
// @module water-renderer
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var Config = Donkeycraft.Config || {};
  var CHUNK_SIZE = Config.CHUNK_SIZE || 16;
  var WORLD_HEIGHT = Config.WORLD_HEIGHT || 256;

  // ============================================================
  // Named constants — extracted from magic numbers for clarity
  // ============================================================

  /**
   * Water surface UV scale factor for FBM wave computation.
   * 0.0625 = 1/16, one tile per block so the water texture tiles seamlessly.
   * @constant {number}
   */
  var WATER_UV_SCALE = 0.0625;

  /**
   * FBM wave UV scale multiplier for animated water surface.
   * 8.0 creates 8 tile-sized repeats across the water surface, producing
   * organic rolling wave patterns visible across the entire water body.
   * Must match the value passed as uWaveScale uniform in the shader.
   * @constant {number}
   */
  var FBM_WAVE_SCALE = 8.0;

  /**
   * Base water alpha (transparency) for direct overhead view.
   * @constant {number}
   */
  var WATER_ALPHA_BASE = 0.55;

  /**
   * Maximum water alpha at grazing angles (Fresnel).
   * @constant {number}
   */
  var WATER_ALPHA_MAX = 0.85;

  /**
   * Fresnel power exponent for reflection blending.
   * Higher values = sharper transition from transparent to reflective.
   * @constant {number}
   */
  var FRESNEL_POWER = 4.0;

  /**
   * Sun glare specular power (Blinn-Phong shininess).
   * @constant {number}
   */
  var SPECULAR_SHININESS = 64.0;

  /**
   * Specular highlight intensity multiplier.
   * @constant {number}
   */
  var SPECULAR_INTENSITY = 0.6;

  /**
   * Dithering amplitude for alpha variation to prevent banding.
   * @constant {number}
   */
  var DITHER_AMPLITUDE = 0.02;

  /**
   * Time step per frame for wave animation (~60 fps).
   * @constant {number}
   */
  var TIME_STEP = 1.0 / 60.0;

  /**
   * Fog density for water surface rendering.
   * Controls how quickly water fades with distance.
   * @constant {number}
   */
  var WATER_FOG_DENSITY = 0.015;

  /**
   * Reflection strength factor for Fresnel blending.
   * @constant {number}
   */
  var WATER_REFLECTION_STRENGTH = 0.5;

  /**
   * Time accumulator reset threshold to prevent floating-point drift.
   * Resets every 1000 seconds of accumulated time.
   * @constant {number}
   */
  var TIME_RESET_THRESHOLD = 1000.0;

  /**
   * Maximum vertices in the water mesh (safety cap).
   * Prevents memory exhaustion on extremely large render distances.
   * @constant {number}
   */
  var MAX_WATER_VERTICES = 4000000; // ~128MB for vertex data

  /**
   * Maximum indices in the water mesh (safety cap).
   * @constant {number}
   */
  var MAX_WATER_INDICES = 6000000;

  /**
   * Logger namespace for this module.
   * @constant {string}
   * @private
   */
  var LOGGER_NAMESPACE = 'WaterRenderer';

  // ============================================================
  // UV column precomputation buffer — allocated once, reused across calls
  // ============================================================

  /**
   * Pre-computed UV scale factors per chunk-local X position.
   * @type {Object|null}
   * @private
   */
  var _uvColumnCache = null;

  /**
   * Initialize the UV column cache.
   * Pre-computes U min/max factors for each chunk-local X position (0 to CHUNK_SIZE-1).
   * @private
   */
  function _initUVColumnCache() {
    if (_uvColumnCache) return; // Already initialized
    _uvColumnCache = new Array(CHUNK_SIZE);
    for (var i = 0; i < CHUNK_SIZE; i++) {
      _uvColumnCache[i] = {
        u0: i * WATER_UV_SCALE,
        u1: (i + 1) * WATER_UV_SCALE,
      };
    }
  }

  // ============================================================
  // Water block ID detection
  // ============================================================

  /**
   * Cached water block ID resolved on first call.
   * @type {number|null}
   * @private
   */
  var _cachedWaterBlockId = null;

  /**
   * Resolve the water block ID from available subsystems.
   * Tries BlockRegistry first, then falls back to hardcoded IDs.
   * Caches the result after first resolution for performance.
   *
   * @returns {number|null} Water block ID, or null if undetectable.
   * @private
   */
  function _getWaterBlockId() {
    if (_cachedWaterBlockId !== null) {
      return _cachedWaterBlockId;
    }

    _cachedWaterBlockId = -1;

    try {
      // Try BlockRegistry.getId first
      if (Donkeycraft.BlockRegistry) {
        var getId = Donkeycraft.BlockRegistry.getId;
        if (typeof getId === 'function') {
          var waterId = getId('water');
          if (
            waterId !== null &&
            waterId !== undefined &&
            Number.isInteger(waterId) &&
            waterId > 0
          ) {
            _cachedWaterBlockId = waterId;
            Donkeycraft.Logger.debug(
              LOGGER_NAMESPACE,
              'Water block ID resolved via BlockRegistry: ' + waterId
            );
            return waterId;
          }
        }
      }

      // Fallback: iterate BlockRegistry for blocks named "water"
      var allBlocks = Donkeycraft.BlockRegistry
        ? Donkeycraft.BlockRegistry.getAllBlocks()
        : null;
      if (allBlocks && Array.isArray(allBlocks)) {
        for (var _i = 0; _i < allBlocks.length; _i++) {
          var _b = allBlocks[_i];
          if (_b && _b.name === 'water') {
            _cachedWaterBlockId = _b.id;
            Donkeycraft.Logger.debug(
              LOGGER_NAMESPACE,
              'Water block ID resolved from BlockRegistry name: ' + _b.id
            );
            return _b.id;
          }
        }
      }

      // Ultimate fallback: check common water IDs with isLiquid verification
      if (Donkeycraft.BlockTypes && Donkeycraft.BlockTypes.isLiquid) {
        var commonWaterIds = [8, 9, 10];
        for (var j = 0; j < commonWaterIds.length; j++) {
          if (Donkeycraft.BlockTypes.isLiquid(commonWaterIds[j])) {
            _cachedWaterBlockId = commonWaterIds[j];
            Donkeycraft.Logger.warn(
              LOGGER_NAMESPACE,
              'Water block ID resolved via BlockTypes.isLiquid: ' +
                commonWaterIds[j]
            );
            return commonWaterIds[j];
          }
        }
      }

      // Final hardcoded fallback
      _cachedWaterBlockId = 9;
      Donkeycraft.Logger.warn(
        LOGGER_NAMESPACE,
        'Water block ID using hardcoded fallback: 9'
      );
    } catch (e) {
      Donkeycraft.Logger.error(
        LOGGER_NAMESPACE,
        'Failed to resolve water block ID: ' + e.message
      );
      _cachedWaterBlockId = -1;
    }

    return _cachedWaterBlockId;
  }

  /**
   * Check if a block ID is a water block.
   * @param {number} blockId - Block ID to check.
   * @returns {boolean} True if the block is water.
   * @private
   */
  function _isWaterBlock(blockId) {
    var waterId = _getWaterBlockId();
    return waterId >= 0 && blockId === waterId;
  }

  // ============================================================
  // Robust position hash for vertex deduplication
  // ============================================================

  /**
   * Generate a robust numeric hash for world coordinates.
   * Uses multiplicative hashing with the golden ratio constant for
   * excellent distribution and minimal collisions.
   *
   * @param {number} x - World X coordinate.
   * @param {number} y - World Y coordinate.
   * @param {number} z - World Z coordinate.
   * @returns {number} Unsigned 32-bit numeric hash key.
   * @private
   */
  function _hashPosition(x, y, z) {
    // Multiplicative hash — avoids XOR collisions that simple addition suffers from
    var h = (x * 73856093) | 0;
    h = Math.imul(h ^ (y * 19349663), 83492791);
    h = Math.imul(h ^ (z * 1500489829), 185741191);
    return h >>> 0; // Convert to unsigned
  }

  // ============================================================
  // Donkeycraft.WaterRenderer — Constructor
  // ============================================================

  /**
   * WaterRenderer — unified semi-transparent water surface rendering.
   *
   * Builds a single mesh from exposed water block tops across all visible chunks,
   * then renders it with animated FBM waves, Fresnel blending, sun glare, and fog.
   *
   * @constructor
   * @alias Donkeycraft.WaterRenderer
   * @param {WebGLRenderingContext} gl - WebGL context.
   * @param {Donkeycraft.ShaderManager} shaderManager - Shader manager instance.
   */
  Donkeycraft.WaterRenderer = function (gl, shaderManager) {
    /**
     * WebGL rendering context.
     * @type {WebGLRenderingContext|null}
     * @private
     */
    this._gl = gl;

    /**
     * Shader manager for program access and uniform setting.
     * @type {Donkeycraft.ShaderManager|null}
     * @private
     */
    this._shaderManager = shaderManager;

    /**
     * Logger namespace (overrides default for instance-level logging).
     * @type {string}
     * @private
     */
    this._loggerNamespace = LOGGER_NAMESPACE;

    // ============================================================
    // Configuration state
    // ============================================================

    /**
     * Water level Y coordinate — read from terrain generator by default.
     * @type {number}
     */
    this._waterLevel = 63;

    /**
     * Render distance in chunks (synchronized from Game).
     * @type {number}
     */
    this._renderDistance = Config.RENDER_DISTANCE || 8;

    // ============================================================
    // Sun direction for specular highlight
    // ============================================================

    /**
     * Sun direction vector for specular highlight.
     * Normalized in setSunDirection().
     * @type {{x: number, y: number, z: number}}
     * @private
     */
    this._sunDirection = { x: 0.5, y: 1.0, z: 0.3 };

    // ============================================================
    // Mesh data (CPU-side buffers)
    // ============================================================

    /**
     * Pre-allocated vertex buffer (Float32Array).
     * Grows as needed, trimmed via subarray() before GPU upload.
     * @type {Float32Array|null}
     * @private
     */
    this._vertexData = null;

    /**
     * Pre-allocated index buffer (Uint16Array).
     * @type {Uint16Array|null}
     * @private
     */
    this._indexData = null;

    /**
     * Current vertex count in the mesh.
     * @type {number}
     * @private
     */
    this._vertexCount = 0;

    /**
     * Current index count in the mesh.
     * @type {number}
     * @private
     */
    this._indexCount = 0;

    // ============================================================
    // GPU buffers (WebGL buffers)
    // ============================================================

    /**
     * WebGL vertex buffer object.
     * Created once, resized if capacity exceeds current allocation.
     * @type {WebGLBuffer|null}
     * @private
     */
    this._vertexBuffer = null;

    /**
     * WebGL index buffer object.
     * @type {WebGLBuffer|null}
     * @private
     */
    this._indexBuffer = null;

    /**
     * Current vertex buffer capacity (number of vertices it can hold).
     * Used to determine if reallocation is needed.
     * @type {number}
     * @private
     */
    this._vertexBufferCapacity = 0;

    /**
     * Current index buffer capacity (number of indices it can hold).
     * @type {number}
     * @private
     */
    this._indexBufferCapacity = 0;

    // ============================================================
    // Dirty state and caching
    // ============================================================

    /**
     * Whether the water mesh needs rebuilding.
     * @type {boolean}
     * @private
     */
    this._dirty = true;

    /**
     * Last known player chunk position (for dirty detection).
     * @type {{x: number, z: number}|null}
     * @private
     */
    this._lastPlayerChunk = null;

    /**
     * Last known water level (rebuild if water level changes).
     * @type {number}
     * @private
     */
    this._lastWaterLevel = 63;

    // ============================================================
    // Animation state
    // ============================================================

    /**
     * Time accumulator for animated waves (seconds).
     * Reset modulo TIME_RESET_THRESHOLD to prevent floating-point drift.
     * @type {number}
     * @private
     */
    this._time = 0;

    /**
     * Shader attribute locations — cached after first use to avoid
     * repeated gl.getAttribLocation calls during render.
     * @type {{aPosition: number, aUV: number, aNormal: number}|null}
     * @private
     */
    this._cachedAttributes = null;

    // ============================================================
    // WebGL context loss handling
    // ============================================================

    /**
     * Whether the WebGL context has been lost.
     * @type {boolean}
     * @private
     */
    this._contextLost = false;

    /**
     * Cleanup handler reference for WebGL context loss event.
     * @type {Function|null}
     * @private
     */
    this._onContextLossHandler = null;

    /**
     * Recovery handler reference for WebGL context restoration event.
     * @type {Function|null}
     * @private
     */
    this._onContextRestoredHandler = null;

    // ============================================================
    // Texture references
    // ============================================================

    /**
     * Texture atlas for water color sampling.
     * Set via setTextureAtlas() from Game instance.
     * @type {Donkeycraft.TextureAtlas|null}
     * @private
     */
    this._textureAtlas = null;

    /**
     * Placeholder texture for reflection sampler (prevents black sampling).
     * A sky-blue tinted 1x1 texture that provides consistent non-black values
     * when the reflection sampler is active but no planar reflection pass exists.
     * @type {WebGLTexture|null}
     * @private
     */
    this._reflectionPlaceholder = null;

    // ============================================================
    // Cached identity matrix (avoids per-frame allocation)
    // ============================================================

    /**
     * Cached identity model matrix Float32Array data.
     * @type {Float32Array}
     * @private
     */
    this._identityMatrixData = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);

    /**
     * Matrix wrapper for cached identity matrix.
     * @type {{getData: Function}}
     * @private
     */
    var selfIdentity = this;
    this._identityMatrix = {
      getData: function () {
        return selfIdentity._identityMatrixData;
      },
    };

    // Initialize GPU buffers and context loss handling
    this._initBuffers();
  };

  // ============================================================
  // Buffer initialization and lifecycle
  // ============================================================

  /**
   * Initialize GPU buffers and WebGL context loss handling.
   * Creates empty buffers with initial capacity and registers context loss listeners.
   *
   * @private
   */
  Donkeycraft.WaterRenderer.prototype._initBuffers = function () {
    var gl = this._gl;
    if (!gl) return;

    // Create vertex buffer with initial capacity (4096 vertices = 512 quads)
    if (!this._vertexBuffer) {
      try {
        this._vertexBuffer = gl.createBuffer();
        if (!this._vertexBuffer || typeof this._vertexBuffer !== 'object') {
          Donkeycraft.Logger.error(
            this._loggerNamespace,
            '_initBuffers: vertex buffer creation failed — createBuffer returned invalid handle'
          );
          this._vertexBuffer = null;
          return;
        }
        var glErr = gl.getError();
        if (glErr !== gl.NO_ERROR) {
          Donkeycraft.Logger.error(
            this._loggerNamespace,
            '_initBuffers: vertex buffer creation failed — WebGL error 0x' +
              glErr.toString(16)
          );
          this._vertexBuffer = null;
          return;
        }
        this._vertexBufferCapacity = 4096;
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          this._vertexBufferCapacity * 9 * 4,
          gl.DYNAMIC_DRAW
        );
      } catch (e) {
        Donkeycraft.Logger.error(
          this._loggerNamespace,
          '_initBuffers vertex buffer error: ' + e.message
        );
        this._vertexBuffer = null;
      }
    }

    // Create index buffer with initial capacity (6144 indices = 1024 triangles)
    if (!this._indexBuffer) {
      try {
        this._indexBuffer = gl.createBuffer();
        if (!this._indexBuffer || typeof this._indexBuffer !== 'object') {
          Donkeycraft.Logger.error(
            this._loggerNamespace,
            '_initBuffers: index buffer creation failed — createBuffer returned invalid handle'
          );
          this._indexBuffer = null;
          return;
        }
        glErr = gl.getError();
        if (glErr !== gl.NO_ERROR) {
          Donkeycraft.Logger.error(
            this._loggerNamespace,
            '_initBuffers: index buffer creation failed — WebGL error 0x' +
              glErr.toString(16)
          );
          this._indexBuffer = null;
          return;
        }
        this._indexBufferCapacity = 6144;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferData(
          gl.ELEMENT_ARRAY_BUFFER,
          this._indexBufferCapacity * 2,
          gl.DYNAMIC_DRAW
        );
      } catch (e) {
        Donkeycraft.Logger.error(
          this._loggerNamespace,
          '_initBuffers index buffer error: ' + e.message
        );
        this._indexBuffer = null;
      }
    }

    // Initialize the UV column cache for mesh building
    _initUVColumnCache();

    // Create reflection placeholder texture (sky-blue 1x1)
    this._createReflectionPlaceholder();

    // Register WebGL context loss handlers
    this._registerContextLossHandlers();
  };

  /**
   * Create a sky-blue 1x1 placeholder texture for the reflection sampler.
   * Prevents black artifacts when sampling uReflectionTex at grazing angles
   * where Fresnel reflection is strong but no planar reflection pass exists.
   *
   * @private
   */
  Donkeycraft.WaterRenderer.prototype._createReflectionPlaceholder =
    function () {
      var gl = this._gl;
      if (!gl) return;

      // Sky-blue tinted 1x1 pixel: (0.5, 0.7, 0.9, 1.0)
      var data = new Uint8Array([
        Math.floor(0.5 * 255), // R: 128
        Math.floor(0.7 * 255), // G: 179
        Math.floor(0.9 * 255), // B: 230
        255, // A: 255
      ]);

      var tex = gl.createTexture();
      if (!tex) {
        Donkeycraft.Logger.error(
          this._loggerNamespace,
          '_createReflectionPlaceholder: texture creation failed'
        );
        return;
      }

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this._reflectionPlaceholder = tex;
      Donkeycraft.Logger.debug(
        this._loggerNamespace,
        'Reflection placeholder texture created'
      );
    };

  /**
   * Register WebGL context loss and restoration event handlers.
   * On context loss: marks renderer as invalid, deletes GPU resources.
   * On context restore: re-creates buffers and marks mesh dirty for rebuild.
   *
   * @private
   */
  Donkeycraft.WaterRenderer.prototype._registerContextLossHandlers =
    function () {
      var canvas = this._gl ? this._gl.canvas : null;
      if (!canvas) return;

      var self = this;

      // Context loss handler
      if (!this._onContextLossHandler) {
        this._onContextLossHandler = function (event) {
          event.preventDefault();
          self._contextLost = true;
          self._dirty = true;

          // Delete GPU resources — they are invalid after context loss
          if (self._vertexBuffer) {
            self._gl.deleteBuffer(self._vertexBuffer);
            self._vertexBuffer = null;
          }
          if (self._indexBuffer) {
            self._gl.deleteBuffer(self._indexBuffer);
            self._indexBuffer = null;
          }
          self._vertexBufferCapacity = 0;
          self._indexBufferCapacity = 0;

          Donkeycraft.Logger.warn(
            self._loggerNamespace,
            'WebGL context lost — water renderer disabled until restore'
          );
        };
      }

      // Context restoration handler
      if (!this._onContextRestoredHandler) {
        this._onContextRestoredHandler = function () {
          self._contextLost = false;
          self._dirty = true;

          // Re-create GPU buffers
          self._initBuffers();

          Donkeycraft.Logger.info(
            self._loggerNamespace,
            'WebGL context restored — water renderer re-enabled'
          );
        };
      }

      canvas.addEventListener(
        'webglcontextlost',
        this._onContextLossHandler,
        false
      );
      canvas.addEventListener(
        'webglcontextrestored',
        this._onContextRestoredHandler,
        false
      );
    };

  /**
   * Resize GPU buffers to accommodate the required capacity.
   * Only grows buffers — never shrinks — to minimize reallocations.
   *
   * @private
   * @param {number} vertexCapacity - Required vertex buffer capacity.
   * @param {number} indexCapacity - Required index buffer capacity.
   */
  Donkeycraft.WaterRenderer.prototype._resizeBuffers = function (
    vertexCapacity,
    indexCapacity
  ) {
    var gl = this._gl;
    if (!gl || this._contextLost) return;

    // Grow vertex buffer if needed
    if (vertexCapacity > this._vertexBufferCapacity) {
      var newVertexCap = Math.max(
        vertexCapacity,
        this._vertexBufferCapacity * 2
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, newVertexCap * 9 * 4, gl.DYNAMIC_DRAW);
      this._vertexBufferCapacity = newVertexCap;
    }

    // Grow index buffer if needed
    if (indexCapacity > this._indexBufferCapacity) {
      var newIndexCap = Math.max(indexCapacity, this._indexBufferCapacity * 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, newIndexCap * 2, gl.DYNAMIC_DRAW);
      this._indexBufferCapacity = newIndexCap;
    }
  };

  // ============================================================
  // Public API — Configuration
  // ============================================================

  /**
   * Set the water level Y coordinate.
   * Triggers a mesh rebuild on next update.
   *
   * @param {number} level - Water surface Y coordinate.
   */
  Donkeycraft.WaterRenderer.prototype.setWaterLevel = function (level) {
    if (typeof level !== 'number' || isNaN(level)) {
      Donkeycraft.Logger.warn(
        this._loggerNamespace,
        'setWaterLevel: invalid level ' + level
      );
      return;
    }
    this._waterLevel = level;
    this._dirty = true;
  };

  /**
   * Set the sun direction for specular highlight.
   * The vector is normalized internally.
   *
   * @param {number} x - X component.
   * @param {number} y - Y component.
   * @param {number} z - Z component.
   */
  Donkeycraft.WaterRenderer.prototype.setSunDirection = function (x, y, z) {
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof z !== 'number'
    ) {
      Donkeycraft.Logger.warn(
        this._loggerNamespace,
        'setSunDirection: invalid components'
      );
      return;
    }
    var length = Math.sqrt(x * x + y * y + z * z);
    if (length > 0.001) {
      this._sunDirection = { x: x / length, y: y / length, z: z / length };
    } else {
      this._sunDirection = { x: 0, y: 1, z: 0 }; // Default: straight up
    }
  };

  /**
   * Set the render distance.
   * Controls how many chunks around the player are scanned for water surfaces.
   *
   * @param {number} distance - Render distance in chunks (radius from player).
   */
  Donkeycraft.WaterRenderer.prototype.setRenderDistance = function (distance) {
    if (!Number.isInteger(distance) || distance < 1) {
      Donkeycraft.Logger.warn(
        this._loggerNamespace,
        'setRenderDistance: invalid distance ' + distance
      );
      return;
    }
    this._renderDistance = distance;
  };

  /**
   * Set the texture atlas for water color sampling.
   * The atlas is bound to WebGL texture unit 0 before rendering
   * so the water shader can sample terrain textures for proper coloring.
   *
   * @param {Donkeycraft.TextureAtlas} atlas - Texture atlas instance.
   */
  Donkeycraft.WaterRenderer.prototype.setTextureAtlas = function (atlas) {
    this._textureAtlas = atlas;
  };

  // ============================================================
  // Public API — Mesh management
  // ============================================================

  /**
   * Update water mesh by scanning visible chunks for exposed water surfaces.
   * Builds a single unified mesh — shared vertices at chunk boundaries prevent gaps.
   * Only renders top faces of water blocks (where water meets air or translucent block).
   *
   * Uses buffer reuse: existing GPU buffers are resized only if capacity is exceeded,
   * avoiding per-frame allocation overhead.
   *
   * Dirty detection triggers:
   * - Player changes chunks (camera moves)
   * - Water level changes (via setWaterLevel())
   * - markDirty() called (adjacent terrain changed)
   * - First call (mesh is empty)
   *
   * @param {number} playerChunkX - Player's current chunk X.
   * @param {number} playerChunkZ - Player's current chunk Z.
   * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) → block ID.
   */
  Donkeycraft.WaterRenderer.prototype.updateMesh = function (
    playerChunkX,
    playerChunkZ,
    getBlockFunc
  ) {
    var gl = this._gl;
    if (!gl || this._contextLost || !getBlockFunc) return;

    // Validate chunk coordinates
    if (!Number.isInteger(playerChunkX) || !Number.isInteger(playerChunkZ)) {
      Donkeycraft.Logger.warn(
        this._loggerNamespace,
        'updateMesh: non-integer chunk coords [' +
          playerChunkX +
          ',' +
          playerChunkZ +
          ']'
      );
      return;
    }

    // Check if rebuild is needed.
    var needsRebuild = false;

    if (this._dirty) {
      needsRebuild = true;
    } else {
      var currentChunkKey = playerChunkX + ',' + playerChunkZ;
      var lastChunkKey = this._lastPlayerChunk
        ? this._lastPlayerChunk.x + ',' + this._lastPlayerChunk.z
        : null;

      if (currentChunkKey !== lastChunkKey) {
        needsRebuild = true;
      } else if (this._waterLevel !== this._lastWaterLevel) {
        needsRebuild = true;
      } else if (this._vertexCount === 0) {
        needsRebuild = true;
      }
    }

    if (!needsRebuild) {
      return; // Mesh is up-to-date — skip rebuild
    }

    Donkeycraft.Logger.debug(
      this._loggerNamespace,
      'Building water mesh for player chunk [' +
        playerChunkX +
        ',' +
        playerChunkZ +
        ']'
    );

    // Build the unified water surface mesh
    this._buildWaterMesh(getBlockFunc, playerChunkX, playerChunkZ);
    this._lastPlayerChunk = { x: playerChunkX, z: playerChunkZ };
    this._lastWaterLevel = this._waterLevel;
    this._dirty = false;
  };

  /**
   * Mark the water mesh as dirty (needs rebuild).
   * Call this when adjacent terrain blocks change (e.g., sand placed next to water).
   */
  Donkeycraft.WaterRenderer.prototype.markDirty = function () {
    this._dirty = true;
  };

  // ============================================================
  // Private — Mesh building
  // ============================================================

  /**
   * Build the unified water surface mesh from exposed water block tops.
   *
   * Algorithm:
   * 1. For each visible chunk, scan all water blocks at water level
   * 2. If a water block's top neighbor is air/translucent → add top face to mesh
   * 3. At chunk boundaries, deduplicate shared vertices using position-based hash map
   * 4. Build single index buffer for entire visible area
   *
   * Vertex layout (9 floats per vertex):
   *   [0-2]   position:  x, y, z in world coordinates
   *   [3-4]   UV:        normalized texture atlas coordinates
   *   [5-7]   normal:    face normal vector (nx, ny, nz)
   *   [8]     padding:   reserved for future use
   *
   * @private
   * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) → block ID.
   * @param {number} playerChunkX - Player's current chunk X.
   * @param {number} playerChunkZ - Player's current chunk Z.
   */
  Donkeycraft.WaterRenderer.prototype._buildWaterMesh = function (
    getBlockFunc,
    playerChunkX,
    playerChunkZ
  ) {
    var gl = this._gl;
    if (!gl || this._contextLost) return;

    var renderDist = this._renderDistance;

    // Pre-allocate with worst-case capacity to minimize GC pressure.
    // Each water block can contribute at most 1 quad (2 triangles, 6 indices).
    // Visible area: (2*renderDist + 1)^2 chunks, each with CHUNK_SIZE^2 blocks.
    var visibleChunks = 2 * renderDist + 1;
    var maxQuads = visibleChunks * visibleChunks * CHUNK_SIZE * CHUNK_SIZE;
    var maxVerts = Math.min(maxQuads * 4, MAX_WATER_VERTICES);
    var maxIdx = Math.min(maxQuads * 6, MAX_WATER_INDICES);

    // Allocate CPU-side arrays
    var vertexData = new Float32Array(maxVerts * 9);
    var indexData = new Uint16Array(maxIdx);

    var vertOffset = 0;
    var idxOffset = 0;

    /**
     * Position-based hash map for vertex deduplication at chunk boundaries.
     * Uses numeric hash for better performance (avoids string allocations).
     * Key: numeric hash of position → Value: vertex index in the vertex array.
     * @type {Object}
     */
    var vertexMap = {};

    var vertexCount = 0;

    /**
     * Add or reuse a vertex at the given world position.
     * Uses robust multiplicative hashing for O(1) deduplication lookup.
     * Checks capacity BEFORE incrementing to prevent overflow.
     *
     * @param {number} wx - World X.
     * @param {number} wy - World Y.
     * @param {number} wz - World Z.
     * @param {number} u - UV U coordinate.
     * @param {number} v - UV V coordinate.
     * @returns {number} Vertex index, or -1 if capacity exceeded.
     * @private
     */
    var addVertex = function (wx, wy, wz, u, v) {
      // FIX: Check capacity BEFORE incrementing (was checking after — caused overflow)
      if (vertexCount + 1 >= maxVerts) {
        Donkeycraft.Logger.warn(
          LOGGER_NAMESPACE,
          'addVertex: vertex capacity exceeded'
        );
        return -1;
      }

      var key = _hashPosition(wx, wy, wz);
      if (key in vertexMap) {
        return vertexMap[key];
      }

      var idx = vertexCount++;
      var base = idx * 9;
      vertexData[base] = wx;
      vertexData[base + 1] = wy;
      vertexData[base + 2] = wz;
      vertexData[base + 3] = u;
      vertexData[base + 4] = v;
      vertexData[base + 5] = 0; // normal X
      vertexData[base + 6] = 1; // normal Y (upward)
      vertexData[base + 7] = 0; // normal Z
      vertexData[base + 8] = 0; // padding
      vertexMap[key] = idx;
      return idx;
    };

    /**
     * Add a quad (two triangles) using the vertex map for deduplication.
     *
     * @param {number} v0 - Vertex index at bottom-left.
     * @param {number} v1 - Vertex index at bottom-right.
     * @param {number} v2 - Vertex index at top-right.
     * @param {number} v3 - Vertex index at top-left.
     * @returns {boolean} True if quad was added successfully.
     * @private
     */
    var addQuad = function (v0, v1, v2, v3) {
      if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) return false;
      if (idxOffset + 6 > maxIdx) {
        Donkeycraft.Logger.warn(
          LOGGER_NAMESPACE,
          'addQuad: index capacity exceeded'
        );
        return false;
      }

      var base = idxOffset;
      // Two triangles with CCW winding for front-face culling
      indexData[base] = v0;
      indexData[base + 1] = v1;
      indexData[base + 2] = v2;
      indexData[base + 3] = v0;
      indexData[base + 4] = v2;
      indexData[base + 5] = v3;
      idxOffset += 6;
      return true;
    };

    // Resolve water block ID once (cached internally)
    var waterBlockId = _getWaterBlockId();

    /**
     * Compute the UV tile offset for the water texture in the atlas grid.
     * For a 256x256 atlas with 16x16 pixel tiles (16x16 grid):
     *   col = blockId % 16, row = floor(blockId / 16)
     *   tileU = col / 256.0, tileV = row / 256.0
     *   tileSize = 16 / 256.0 = 0.0625 (= WATER_UV_SCALE)
     * This offset defines the bottom-left corner of the water tile in the atlas.
     * Per-block UVs (0-1 range) are then scaled by tileSize and added to get
     * the final UV that samples the correct water texture.
     * @type {Object|null}
     */
    var _waterTileUV = null;

    /**
     * Get or compute the water tile UV offset from the atlas grid.
     * @returns {Object|null} {u: number, v: number} or null if water block ID unknown.
     */
    var _getWaterTileUV = function () {
      if (_waterTileUV) return _waterTileUV;
      if (
        waterBlockId === null ||
        waterBlockId === undefined ||
        waterBlockId < 0
      ) {
        Donkeycraft.Logger.warn(
          LOGGER_NAMESPACE,
          'water block ID not resolved — using default tile offset'
        );
        _waterTileUV = { u: 0, v: 0 }; // fallback to top-left tile
        return _waterTileUV;
      }
      // Atlas is 256x256 with 16x16 grid of 16x16 pixel tiles.
      // tileU = col / ATLAS_SIZE, tileSize = TEX_SIZE / ATLAS_SIZE
      var col = waterBlockId % 16;
      var row = Math.floor(waterBlockId / 16);
      _waterTileUV = {
        u: col / 256.0,
        v: row / 256.0,
      };
      Donkeycraft.Logger.debug(
        LOGGER_NAMESPACE,
        'Water tile UV offset: blockId=' +
          waterBlockId +
          ', col=' +
          col +
          ', row=' +
          row +
          ', tileUV=(' +
          _waterTileUV.u.toFixed(6) +
          ', ' +
          _waterTileUV.v.toFixed(6) +
          ')'
      );
      return _waterTileUV;
    };

    var waterTileUV = _getWaterTileUV();
    if (!waterTileUV) {
      waterTileUV = { u: 0, v: 0 };
    }

    // Precompute UV values per column using the shared cache.
    // UVs are now computed using WORLD-SPACE coordinates so that the entire
    // water surface tiles seamlessly across chunk boundaries. Before this fix,
    // each chunk got its own 0–1 UV range, causing visible seams and making
    // the FBM wave animation appear as independent tiles per chunk.
    var colUVs = _uvColumnCache || new Array(CHUNK_SIZE);

    // Scan each visible chunk
    for (var dx = -renderDist; dx <= renderDist; dx++) {
      for (var dz = -renderDist; dz <= renderDist; dz++) {
        // Circular render distance cutoff
        if (dx * dx + dz * dz > renderDist * renderDist) continue;

        var chunkX = playerChunkX + dx;
        var chunkZ = playerChunkZ + dz;

        // Scan all water blocks in this chunk
        for (var localX = 0; localX < CHUNK_SIZE; localX++) {
          for (var localZ = 0; localZ < CHUNK_SIZE; localZ++) {
            var worldX = chunkX * CHUNK_SIZE + localX;
            var worldZ = chunkZ * CHUNK_SIZE + localZ;

            // Check if there's a water block at the water level
            var blockAtWaterLevel = getBlockFunc(
              worldX,
              this._waterLevel,
              worldZ
            );

            if (blockAtWaterLevel !== waterBlockId) continue;

            // Check if top neighbor is air or translucent (exposed surface)
            var topBlock = getBlockFunc(worldX, this._waterLevel + 1, worldZ);
            var topIsTransparent =
              topBlock === 0 ||
              (Donkeycraft.BlockTypes &&
                typeof Donkeycraft.BlockTypes.isTransparent === 'function' &&
                Donkeycraft.BlockTypes.isTransparent(topBlock));

            if (!topIsTransparent) continue;

            // This water block has an exposed top face — add to mesh.
            // Use per-block UVs (0-1 range) scaled by tileSize, offset by the
            // water tile position in the atlas grid. This ensures each block's
            // face samples exactly one tile from the atlas, and tiling is seamless
            // across chunk boundaries because all blocks use the same 0-1 UV range.
            var absU = waterTileUV.u; // Water tile base U in atlas
            var absUw = waterTileUV.u + WATER_UV_SCALE; // Water tile U + one tile width
            var absV = waterTileUV.v; // Water tile base V in atlas
            var absVw = waterTileUV.v + WATER_UV_SCALE; // Water tile V + one tile height

            // Add four corners with deduplication
            var v0 = addVertex(worldX, this._waterLevel, worldZ, absU, absV);
            var v1 = addVertex(
              worldX + 1,
              this._waterLevel,
              worldZ,
              absUw,
              absV
            );
            var v2 = addVertex(
              worldX + 1,
              this._waterLevel,
              worldZ + 1,
              absUw,
              absVw
            );
            var v3 = addVertex(
              worldX,
              this._waterLevel,
              worldZ + 1,
              absU,
              absVw
            );

            addQuad(v0, v1, v2, v3);
          }
        }
      }
    }

    // Upload mesh to GPU (reuse buffers if capacity allows)
    if (vertexCount > 0) {
      // Resize GPU buffers if needed
      this._resizeBuffers(vertexCount, idxOffset);

      try {
        // Upload vertex data to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          vertexData.subarray(0, vertexCount * 9)
        );

        // Upload index data to GPU
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferSubData(
          gl.ELEMENT_ARRAY_BUFFER,
          0,
          indexData.subarray(0, idxOffset)
        );
      } catch (e) {
        Donkeycraft.Logger.error(
          this._loggerNamespace,
          '_buildWaterMesh: buffer upload failed: ' + e.message
        );
        return;
      }

      this._vertexCount = vertexCount;
      this._indexCount = idxOffset;
      this._vertexData = vertexData;
      this._indexData = indexData;

      Donkeycraft.Logger.debug(
        this._loggerNamespace,
        'Water mesh built: ' +
          vertexCount +
          ' vertices, ' +
          idxOffset +
          ' indices'
      );
    } else {
      // No water surfaces visible — clear GPU buffers
      if (this._vertexBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
      }
      if (this._indexBuffer) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
      }
      this._vertexCount = 0;
      this._indexCount = 0;

      Donkeycraft.Logger.debug(
        this._loggerNamespace,
        'No exposed water surfaces found'
      );
    }
  };

  // ============================================================
  // Public API — Rendering
  // ============================================================

  /**
   * Render the water surface.
   *
   * Renders the unified water mesh with:
   * - Animated FBM wave displacement (handled in fragment shader)
   * - Fresnel-based reflection blending
   * - Sun glare specular highlight
   * - Depth-based distance fog
   * - Alpha dithering to prevent banding
   *
   * Proper WebGL state management:
   * - Enables blending for transparency (SRC_ALPHA, ONE_MINUS_SRC_ALPHA)
   * - Disables depth writes during transparent pass
   * - Disables back-face culling for correct alpha compositing
   * - Restores previous GL state after rendering
   *
   * @param {Donkeycraft.Camera} camera - Camera instance.
   * @param {Lighting} [lighting] - Optional lighting system for sun direction.
   * @param {Function} [getBlockFunc] - Optional block getter for dynamic fog color.
   */
  Donkeycraft.WaterRenderer.prototype.render = function (
    camera,
    lighting,
    getBlockFunc
  ) {
    var gl = this._gl;
    if (
      !gl ||
      this._contextLost ||
      !this._shaderManager ||
      this._vertexCount === 0
    )
      return;

    // Validate required parameters
    if (!camera || !camera.getPosition || !camera.getMatrices) {
      Donkeycraft.Logger.warn(
        this._loggerNamespace,
        'render: invalid camera instance'
      );
      return;
    }

    // Update time for animated waves (with overflow protection)
    this._time += TIME_STEP;
    if (this._time >= TIME_RESET_THRESHOLD) {
      this._time -= TIME_RESET_THRESHOLD;
    }

    // Get camera position and matrices
    var camPos = camera.getPosition();
    var matrices = camera.getMatrices();
    if (!matrices || !matrices.projection || !matrices.view) {
      Donkeycraft.Logger.warn(
        this._loggerNamespace,
        'render: invalid camera matrices'
      );
      return;
    }

    // Get sun direction from lighting system if available
    var sunDir = this._sunDirection;
    if (lighting && lighting.getSunDirection) {
      var sd = lighting.getSunDirection();
      if (sd && sd.x !== undefined) {
        sunDir = sd;
      }
    }

    // Activate water shader program
    if (!this._shaderManager.use('water')) {
      Donkeycraft.Logger.error(
        this._loggerNamespace,
        'render: water shader not available — skipping water render'
      );
      return;
    }

    // Cache attribute locations on first use
    if (!this._cachedAttributes) {
      try {
        var activeProgram = this._shaderManager._getActiveProgram();
        if (!activeProgram) {
          Donkeycraft.Logger.error(
            this._loggerNamespace,
            'render: no active shader program — cannot get attributes'
          );
          return;
        }
        this._cachedAttributes = {
          aPosition: gl.getAttribLocation(activeProgram, 'aPosition'),
          aUV: gl.getAttribLocation(activeProgram, 'aUV'),
          aNormal: gl.getAttribLocation(activeProgram, 'aNormal'),
        };

        if (
          this._cachedAttributes.aPosition < 0 ||
          this._cachedAttributes.aUV < 0
        ) {
          Donkeycraft.Logger.error(
            this._loggerNamespace,
            'render: water shader missing required attributes (aPosition=' +
              this._cachedAttributes.aPosition +
              ', aUV=' +
              this._cachedAttributes.aUV +
              ')'
          );
          this._cachedAttributes = null;
          return;
        }
      } catch (e) {
        Donkeycraft.Logger.error(
          this._loggerNamespace,
          'render: attribute lookup failed: ' + e.message
        );
        return;
      }
    }

    var attrPos = this._cachedAttributes.aPosition;
    var attrUV = this._cachedAttributes.aUV;
    var attrNormal = this._cachedAttributes.aNormal;

    // Bind and enable vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);

    // Enable position attribute (3 floats)
    if (attrPos >= 0) {
      gl.enableVertexAttribArray(attrPos);
      gl.vertexAttribPointer(attrPos, 3, gl.FLOAT, false, 9 * 4, 0); // stride=36 bytes, offset=0
    }

    // Enable UV attribute (2 floats, offset after position)
    if (attrUV >= 0) {
      gl.enableVertexAttribArray(attrUV);
      gl.vertexAttribPointer(attrUV, 2, gl.FLOAT, false, 9 * 4, 12); // offset=12 bytes
    }

    // Enable normal attribute (3 floats, offset after UV)
    if (attrNormal >= 0) {
      gl.enableVertexAttribArray(attrNormal);
      gl.vertexAttribPointer(attrNormal, 3, gl.FLOAT, false, 9 * 4, 20); // offset=20 bytes
    }

    // Bind index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);

    // --- Set water shader uniforms with per-uniform error checking ---

    var _setVec3Checked = function (name, x, y, z) {
      if (!this._shaderManager.setVec3(name, x, y, z)) {
        Donkeycraft.Logger.warn(
          this._loggerNamespace,
          'render: failed to set uniform ' + name + ' (vec3)'
        );
        return false;
      }
      return true;
    }.bind(this);

    var _setFloatChecked = function (name, value) {
      if (!this._shaderManager.setFloat(name, value)) {
        Donkeycraft.Logger.warn(
          this._loggerNamespace,
          'render: failed to set uniform ' + name + ' (float)'
        );
        return false;
      }
      return true;
    }.bind(this);

    var _setMat4Checked = function (name, value) {
      if (!this._shaderManager.setMat4(name, value)) {
        Donkeycraft.Logger.warn(
          this._loggerNamespace,
          'render: failed to set uniform ' + name + ' (mat4)'
        );
        return false;
      }
      return true;
    }.bind(this);

    var _setSamplerChecked = function (name, unit) {
      if (!this._shaderManager.setSampler(name, unit)) {
        Donkeycraft.Logger.warn(
          this._loggerNamespace,
          'render: failed to set uniform ' + name + ' (sampler)'
        );
        return false;
      }
      return true;
    }.bind(this);

    var uniformsOk = true;

    // Fog color — use nearby block color if getBlockFunc provided, otherwise sky blue
    var fogR = 0.5,
      fogG = 0.7,
      fogB = 0.9;
    if (getBlockFunc && camera) {
      var cp = camera.getPosition();
      var probeY = Math.floor(cp.y);
      var probeBlock = getBlockFunc(Math.floor(cp.x), probeY, Math.floor(cp.z));
      if (
        probeBlock !== 0 &&
        Donkeycraft.BlockTypes &&
        Donkeycraft.BlockTypes.getBlockColor
      ) {
        var bc = Donkeycraft.BlockTypes.getBlockColor(probeBlock);
        if (bc) {
          fogR = bc.r * 0.3;
          fogG = bc.g * 0.3;
          fogB = bc.b * 0.3;
        }
      }
    }
    uniformsOk = uniformsOk && _setVec3Checked('uFogColor', fogR, fogG, fogB);

    // Fog density
    uniformsOk =
      uniformsOk && _setFloatChecked('uFogDensity', WATER_FOG_DENSITY);

    // Light factor — pass through from lighting system for proper brightness
    if (lighting && lighting.getLightFactor) {
      var lightFactor = lighting.getLightFactor();
      uniformsOk = uniformsOk && _setFloatChecked('uLightFactor', lightFactor);
    } else {
      uniformsOk = uniformsOk && _setFloatChecked('uLightFactor', 1.0);
    }

    // Water alpha (base transparency)
    uniformsOk =
      uniformsOk && _setFloatChecked('uWaterAlpha', WATER_ALPHA_BASE);

    // Reflection strength (Fresnel blend factor)
    uniformsOk =
      uniformsOk &&
      _setFloatChecked('uReflectionStrength', WATER_REFLECTION_STRENGTH);

    // Animation time
    uniformsOk = uniformsOk && _setFloatChecked('uTime', this._time);

    // Camera position
    uniformsOk =
      uniformsOk && _setVec3Checked('uCameraPos', camPos.x, camPos.y, camPos.z);

    // Water level
    uniformsOk =
      uniformsOk && _setFloatChecked('uWaterLevel', this._waterLevel);

    // Sun direction
    uniformsOk =
      uniformsOk && _setVec3Checked('uSunDir', sunDir.x, sunDir.y, sunDir.z);

    // Wave scale — FBM UV multiplier (must match shader's expected value)
    uniformsOk = uniformsOk && _setFloatChecked('uWaveScale', FBM_WAVE_SCALE);

    if (!uniformsOk) {
      Donkeycraft.Logger.warn(
        this._loggerNamespace,
        'render: some water shader uniforms failed to set — see individual warnings above for which ones'
      );
    }

    // --- Texture binding (FIX: bind BEFORE setSampler for correct order) ---

    // 1. Bind texture atlas to unit 0 FIRST, then set sampler uniform
    // This ensures the water shader samples a valid texture for water color mixing.
    if (this._textureAtlas) {
      gl.activeTexture(gl.TEXTURE0);
      this._textureAtlas.bind(gl);
    }
    this._shaderManager.setSampler('uTexture', 0);

    // 2. Bind reflection placeholder to unit 1 FIRST, then set sampler uniform
    // The sky-blue placeholder prevents black artifacts at grazing angles where
    // Fresnel reflection is strong but no planar reflection pass exists.
    if (this._reflectionPlaceholder) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._reflectionPlaceholder);
    }
    this._shaderManager.setSampler('uReflectionTex', 1);

    // Set projection and view matrices
    this._shaderManager.setMat4('uProjection', matrices.projection);
    this._shaderManager.setMat4('uView', matrices.view);

    // Use cached identity model matrix (water is in world space).
    // Avoids per-frame Float32Array allocation.
    this._shaderManager.setMat4('uModel', this._identityMatrix);

    // --- WebGL state for transparent rendering ---

    // Save current GL state (FIX: save ALL blend factors independently, not just SRC_RGB)
    var prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
    var prevBlend = gl.isEnabled(gl.BLEND);
    var prevCullFace = gl.isEnabled(gl.CULL_FACE);
    var prevBlendSrcRGB = gl.getParameter(gl.BLEND_SRC_RGB);
    var prevBlendDstRGB = gl.getParameter(gl.BLEND_DST_RGB);
    var prevBlendSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
    var prevBlendDstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);
    var prevDepthFunc = gl.getParameter(gl.DEPTH_FUNC);

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Disable depth writes — transparent surfaces must not occlude behind ones
    gl.depthMask(false);

    // Disable back-face culling — water faces may be wound either way in perspective
    gl.disable(gl.CULL_FACE);

    // Set depth function to LEQUAL for proper depth sorting of transparent surfaces
    gl.depthFunc(gl.LEQUAL);

    // Render the water surface
    try {
      gl.drawElements(gl.TRIANGLES, this._indexCount, gl.UNSIGNED_SHORT, 0);
    } catch (e) {
      Donkeycraft.Logger.error(
        this._loggerNamespace,
        'render: drawElements failed: ' + e.message
      );
    }

    // Restore previous GL state (FIX: restore ALL blend factors independently)
    gl.depthMask(prevDepthMask);
    gl.depthFunc(prevDepthFunc);
    if (prevBlend) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        prevBlendSrcRGB,
        prevBlendDstRGB,
        prevBlendSrcAlpha,
        prevBlendDstAlpha
      );
    } else {
      gl.disable(gl.BLEND);
    }
    if (prevCullFace) {
      gl.enable(gl.CULL_FACE);
    } else {
      gl.disable(gl.CULL_FACE);
    }

    // Disable attribute arrays
    if (attrPos >= 0) gl.disableVertexAttribArray(attrPos);
    if (attrUV >= 0) gl.disableVertexAttribArray(attrUV);
    if (attrNormal >= 0) gl.disableVertexAttribArray(attrNormal);

    Donkeycraft.Logger.debug(
      this._loggerNamespace,
      'Water rendered: ' + this._indexCount / 3 + ' triangles'
    );
  };

  // ============================================================
  // Public API — Queries
  // ============================================================

  /**
   * Get the current water mesh vertex count.
   * @returns {number} Number of vertices in the water mesh.
   */
  Donkeycraft.WaterRenderer.prototype.getVertexCount = function () {
    return this._vertexCount;
  };

  /**
   * Get the current water mesh index count.
   * @returns {number} Number of indices in the water mesh.
   */
  Donkeycraft.WaterRenderer.prototype.getIndexCount = function () {
    return this._indexCount;
  };

  /**
   * Get the number of triangles in the water mesh.
   * @returns {number} Triangle count (indexCount / 3).
   */
  Donkeycraft.WaterRenderer.prototype.getTriangleCount = function () {
    return Math.floor(this._indexCount / 3);
  };

  /**
   * Check if the water renderer has a valid mesh to render.
   * @returns {boolean} True if vertex count > 0 and context is active.
   */
  Donkeycraft.WaterRenderer.prototype.hasMesh = function () {
    return this._vertexCount > 0 && !this._contextLost;
  };

  /**
   * Get render statistics for debug overlay display.
   * @returns {{waterTriangles: number, waterVertices: number, contextLost: boolean}}
   */
  Donkeycraft.WaterRenderer.prototype.getRenderStats = function () {
    return {
      waterTriangles: Math.floor(this._indexCount / 3),
      waterVertices: this._vertexCount,
      contextLost: this._contextLost,
    };
  };

  // ============================================================
  // Cleanup and destruction
  // ============================================================

  /**
   * Destroy GPU resources and clean up event listeners.
   * Call this when the water renderer is no longer needed to prevent memory leaks.
   */
  Donkeycraft.WaterRenderer.prototype.destroy = function () {
    var gl = this._gl;
    if (!gl) return;

    // Delete vertex buffer
    if (this._vertexBuffer) {
      gl.deleteBuffer(this._vertexBuffer);
      this._vertexBuffer = null;
    }

    // Delete index buffer
    if (this._indexBuffer) {
      gl.deleteBuffer(this._indexBuffer);
      this._indexBuffer = null;
    }

    this._vertexBufferCapacity = 0;
    this._indexBufferCapacity = 0;
    this._vertexCount = 0;
    this._indexCount = 0;
    this._vertexData = null;
    this._indexData = null;

    // Remove context loss event listeners
    var canvas = gl.canvas;
    if (canvas) {
      if (this._onContextLossHandler) {
        canvas.removeEventListener(
          'webglcontextlost',
          this._onContextLossHandler,
          false
        );
        this._onContextLossHandler = null;
      }
      if (this._onContextRestoredHandler) {
        canvas.removeEventListener(
          'webglcontextrestored',
          this._onContextRestoredHandler,
          false
        );
        this._onContextRestoredHandler = null;
      }
    }

    this._cachedAttributes = null;
    this._contextLost = false;

    Donkeycraft.Logger.debug(this._loggerNamespace, 'WaterRenderer destroyed');
  };
})();
