/**
 * Donkeycraft — Debug Terrain Renderer
 * Renders terrain blocks with proper face culling, per-block alpha, directional lighting, and fog.
 * Uses block face rendering (not transition surfaces) for full terrain visualization.
 * Delegates color/alpha lookup to Donkeycraft.BlockColors module.
 * @module debug-render
 */
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  if (!Donkeycraft) return;

  // ============================================================
  // Shader Sources
  // ============================================================

  // ============================================================
  // Module-Level Constants
  // ============================================================

  /**
   * Default field of view in radians (70 degrees).
   * @type {number}
   * @private
   */
  var DEFAULT_FOV = (70 * Math.PI) / 180;

  /**
   * Near clipping plane distance for the perspective camera.
   * @type {number}
   * @private
   */
  var NEAR_PLANE = 0.1;

  /**
   * Far clipping plane distance for the perspective camera.
   * @type {number}
   * @private
   */
  var FAR_PLANE = 1000;

  /**
   * Fog density exponent for exponential fog falloff.
   * @type {number}
   * @private
   */
  var FOG_DENSITY = 0.006;

  /**
   * Sky dome size (half-extent) in world units.
   * @type {number}
   * @private
   */
  var SKY_SIZE = 500;

  /**
   * Maximum number of grid cells to prevent UI overflow.
   * @type {number}
   * @private
   */
  var MAX_GRID_CELLS = 4096;

  /**
   * Interval in milliseconds between periodic state saves.
   * @type {number}
   * @private
   */
  var SAVE_STATE_INTERVAL = 2000;

  /**
   * Vertex shader for terrain blocks with lighting and fog.
   * @type {string}
   * @private
   */
  var DK_TERRAIN_VS =
    'attribute vec3 aPosition;' +
    'attribute vec3 aColor;' +
    'attribute float aAlpha;' +
    'attribute vec3 aNormal;' +
    'uniform mat4 uProjection;' +
    'uniform mat4 uView;' +
    'uniform mat4 uModel;' +
    'varying vec3 vColor;' +
    'varying vec3 vNormal;' +
    'varying float vAlpha;' +
    'varying float vDepth;' +
    'varying vec3 vWorldPos;' +
    'void main() {' +
    '   gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);' +
    '   vColor = aColor;' +
    '   vAlpha = aAlpha;' +
    '   vNormal = normalize(aNormal);' +
    '   vWorldPos = (uView * uModel * vec4(aPosition, 1.0)).xyz;' +
    '   vDepth = -gl_Position.z;' +
    '}';

  /**
   * Fragment shader with directional lighting and exponential fog.
   * @type {string}
   * @private
   */
  var DK_TERRAIN_FS =
    'precision mediump float;' +
    'varying vec3 vColor;' +
    'varying vec3 vNormal;' +
    'varying float vAlpha;' +
    'varying float vDepth;' +
    'uniform vec3 uFogColor;' +
    'uniform float uFogDensity;' +
    'uniform float uLightFactor;' +
    'void main() {' +
    '   vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));' +
    '   float diff = max(dot(normalize(vNormal), lightDir), 0.0);' +
    '   float lighting = 0.55 + diff * 0.45;' +
    '   vec3 finalColor = vColor * lighting * uLightFactor;' +
    '   float fogFactor = 1.0 - exp(-vDepth * uFogDensity);' +
    '   fogFactor = clamp(fogFactor, 0.0, 1.0);' +
    '   finalColor = mix(finalColor, uFogColor, fogFactor);' +
    '   gl_FragColor = vec4(finalColor, vAlpha);' +
    '}';

  /**
   * Vertex shader for sky dome rendering (no translation in view matrix).
   * @type {string}
   * @private
   */
  var DK_SKY_VS =
    'attribute vec3 aPosition;' +
    'attribute vec4 aColor;' +
    'uniform mat4 uProjection;' +
    'uniform mat4 uView;' +
    'uniform mat4 uModel;' +
    'varying vec4 vColor;' +
    'void main() {' +
    '   mat4 viewNoTranslate = uView;' +
    '   viewNoTranslate[3][0] = 0.0;' +
    '   viewNoTranslate[3][1] = 0.0;' +
    '   viewNoTranslate[3][2] = 0.0;' +
    '   gl_Position = uProjection * viewNoTranslate * uModel * vec4(aPosition, 1.0);' +
    '   vColor = aColor;' +
    '}';

  /**
   * Fragment shader for sky dome rendering.
   * @type {string}
   * @private
   */
  var DK_SKY_FS =
    'precision mediump float;' +
    'varying vec4 vColor;' +
    'void main() {' +
    '   gl_FragColor = vColor;' +
    '}';

  // ============================================================
  // Face Definitions — 6 directions with normal and 4 corner vertices
  // ============================================================

  /**
   * Face definitions for block mesh generation.
   * Each face has: direction vector, normal vector, and 4 corner vertices forming a quad.
   * Corner order follows consistent winding [0,1,2] + [0,2,3] for proper back-face culling.
   * @type {Object[]}
   * @private
   */
  var _FACE_DEFS = [
    {
      d: [0, 1, 0],
      n: [0, 1, 0],
      c: [
        [0, 1, 0],
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
    }, // +Y (top)
    {
      d: [0, -1, 0],
      n: [0, -1, 0],
      c: [
        [0, 0, 1],
        [1, 0, 1],
        [1, 0, 0],
        [0, 0, 0],
      ],
    }, // -Y (bottom)
    {
      d: [0, 0, 1],
      n: [0, 0, 1],
      c: [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ],
    }, // +Z (front)
    {
      d: [0, 0, -1],
      n: [0, 0, -1],
      c: [
        [1, 0, 0],
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ],
    }, // -Z (back)
    {
      d: [1, 0, 0],
      n: [1, 0, 0],
      c: [
        [1, 0, 1],
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
      ],
    }, // +X (right)
    {
      d: [-1, 0, 0],
      n: [-1, 0, 0],
      c: [
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
      ],
    }, // -X (left)
  ];

  /**
   * Triangulation order for quad → 2 triangles mapping.
   * @type {number[]}
   * @private
   */
  var _TRI_INDICES = [0, 1, 2, 0, 2, 3];

  // ============================================================
  // Matrix Helpers (inline private functions)
  // ============================================================

  /**
   * Create a 16-element identity matrix stored in Float32Array.
   * @returns {Float32Array}
   * @private
   */
  function _mat4Create() {
    var m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  /**
   * Create a perspective projection matrix.
   * @param {Float32Array} o - Output array (16 elements).
   * @param {number} fovYRadians - Field of view in radians.
   * @param {number} aspect - Width/height ratio.
   * @param {number} nearZ - Near plane distance.
   * @param {number} farZ - Far plane distance.
   * @returns {Float32Array}
   * @private
   */
  function _mat4Perspective(o, fovYRadians, aspect, nearZ, farZ) {
    var f = 1.0 / Math.tan(fovYRadians / 2);
    var nf = 1.0 / (nearZ - farZ);
    o.fill(0);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (farZ + nearZ) * nf;
    o[11] = -1;
    o[14] = 2 * farZ * nearZ * nf;
    return o;
  }

  /**
   * Create a look-at view matrix.
   * @param {Float32Array} o - Output array (16 elements).
   * @param {number[]} eye - Camera position [x, y, z].
   * @param {number[]} center - Look-at point [x, y, z].
   * @param {number[]} up - Up vector [x, y, z].
   * @returns {Float32Array}
   * @private
   */
  function _mat4LookAt(o, eye, center, up) {
    var z0 = eye[0] - center[0],
      z1 = eye[1] - center[1],
      z2 = eye[2] - center[2];
    var zl = 1.0 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= zl;
    z1 *= zl;
    z2 *= zl;
    var x0 = up[1] * z2 - up[2] * z1,
      x1 = up[2] * z0 - up[0] * z2,
      x2 = up[0] * z1 - up[1] * z0;
    var xl = 1.0 / Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    x0 *= xl;
    x1 *= xl;
    x2 *= xl;
    var y0 = z1 * x2 - z2 * x1,
      y1 = z2 * x0 - z0 * x2,
      y2 = z0 * x1 - z1 * x0;
    o[0] = x0;
    o[1] = y0;
    o[2] = z0;
    o[3] = 0;
    o[4] = x1;
    o[5] = y1;
    o[6] = z1;
    o[7] = 0;
    o[8] = x2;
    o[9] = y2;
    o[10] = z2;
    o[11] = 0;
    o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    o[15] = 1;
    return o;
  }

  /**
   * Multiply two 4×4 matrices (o = a × b), stored in output array.
   * @param {Float32Array} o - Output array.
   * @param {Float32Array} a - Left matrix.
   * @param {Float32Array} b - Right matrix.
   * @returns {Float32Array}
   * @private
   */
  function _mat4Multiply(o, a, b) {
    var a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3],
      a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7],
      a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11],
      a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];
    var b0, b1, b2, b3;
    b0 = b[0];
    b1 = b[1];
    b2 = b[2];
    b3 = b[3];
    o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4];
    b1 = b[5];
    b2 = b[6];
    b3 = b[7];
    o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8];
    b1 = b[9];
    b2 = b[10];
    b3 = b[11];
    o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12];
    b1 = b[13];
    b2 = b[14];
    b3 = b[15];
    o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return o;
  }

  /**
   * Create a translation matrix stored in the output array.
   * @param {Float32Array} o - Output array (16 elements).
   * @param {number} tx - Translation along X axis.
   * @param {number} ty - Translation along Y axis.
   * @param {number} tz - Translation along Z axis.
   * @returns {Float32Array} The translation matrix.
   * @private
   */
  function _mat4Translate(o, tx, ty, tz) {
    o[0] = 1;
    o[1] = 0;
    o[2] = 0;
    o[3] = 0;
    o[4] = 0;
    o[5] = 1;
    o[6] = 0;
    o[7] = 0;
    o[8] = 0;
    o[9] = 0;
    o[10] = 1;
    o[11] = 0;
    o[12] = tx;
    o[13] = ty;
    o[14] = tz;
    o[15] = 1;
    return o;
  }

  // ============================================================
  // DebugTerrainRenderer Constructor
  // ============================================================

  /**
   * DebugTerrainRenderer — Renders terrain blocks with proper face culling,
   * per-block alpha blending, directional lighting, and exponential fog.
   *
   * @constructor
   */
  Donkeycraft.DebugTerrainRenderer = function () {
    /** @type {HTMLCanvasElement|null} */
    this._canvas = null;

    /** @type {WebGLRenderingContext|null} */
    this._gl = null;

    /** @type {Donkeycraft.TerrainController|null} */
    this._controller = null;

    // Shader programs
    /** @type {WebGLProgram|null} */
    this._terrainProgram = null;

    /** @type {WebGLProgram|null} */
    this._skyProgram = null;

    /** @type {Object|null} */
    this._terrainLocs = null;

    /** @type {Object|null} */
    this._skyLocs = null;

    // Chunk data
    /** @type {Map<string, Donkeycraft.Chunk>} */
    this._chunks = new Map();

    /** @type {Set<string>} */
    this._dirtyChunks = new Set();

    // Mesh buffers per chunk
    /** @type {Object.<string, Object>} */
    this._meshBuffers = {};

    // Chunk loading parameters
    /** @type {number} */
    this._chunkRadiusN = 3;

    /** @type {number} */
    this._chunkRadiusS = 3;

    /** @type {number} */
    this._chunkRadiusW = 3;

    /** @type {number} */
    this._chunkRadiusE = 3;

    /** @type {number} */
    this._currentChunkX = 0;

    /** @type {number} */
    this._currentChunkZ = 0;

    /** @type {number} */
    this._maxGridCells = 4096;

    // World parameters
    /** @type {string|number} */
    this._worldSeed = 42;

    /** @type {number} */
    this._selectedBiomeId = 1;

    /** @type {{caves: boolean, ores: boolean, water: boolean, surface: boolean}} */
    this._options = { caves: true, ores: true, water: true, surface: true };

    // Rendering state
    /** @type {boolean} */
    this._isRunning = false;

    /** @type {boolean} */
    this._firstFrameBuilt = false;

    /** @type {number} */
    this._lastFrameTime = 0;

    /** @type {number} */
    this._generationStartTime = 0;

    /** @type {number} */
    this._generationElapsedMs = 0;

    /** @type {boolean} */
    this._isTabVisible = true;

    /** @type {boolean} */
    this._generationInProgress = false;

    /** @type {Set<string>} */
    this._builtChunkKeys = new Set();

    // Sky dome buffers
    /** @type {WebGLBuffer|null} */
    this._skyPosBuf = null;

    /** @type {WebGLBuffer|null} */
    this._skyColBuf = null;

    /** @type {boolean} */
    this._skyBuffersCreated = false;

    // Callbacks
    /** @type {Function|null} */
    this._onTerrainRegenerated = null;

    // Timing state
    /** @type {number|null} */
    this._lastSaveTime = null;
  };

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Initialize the debug terrain renderer.
   * Creates WebGL context, compiles shaders, sets up the TerrainController,
   * and starts the render loop.
   *
   * @param {Object|string} [options] - Initialization options (object with canvasId property) or canvas element ID string.
   * @param {string} [options.canvasId='dk-terrain-canvas'] - Canvas element ID.
   * @param {Donkeycraft.TerrainController|null} [options.controller=null] - Optional external TerrainController.
   * @returns {boolean} True if initialization succeeded.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.init = function (options) {
    // Handle both object options and string canvasId for backwards compatibility
    var canvasId = 'dk-terrain-canvas';
    if (typeof options === 'string') {
      canvasId = options;
    } else if (options && typeof options === 'object') {
      canvasId = options.canvasId || canvasId;
    }

    // Initialize WebGL
    if (!this._initWebGL(canvasId)) return false;

    // Set up controller
    if (options && options.controller) {
      this._controller = options.controller;
    } else {
      if (!Donkeycraft.TerrainController) {
        console.error('[DebugTerrain] TerrainController not available');
        return false;
      }
      this._controller = new Donkeycraft.TerrainController();
      if (!this._controller.init(canvasId)) {
        console.error('[DebugTerrain] Failed to initialize TerrainController');
        return false;
      }
    }

    // Register key actions via controller
    this._registerKeyActions();

    // Set tab visibility tracking
    this._setupTabVisibility();

    // Initialize BlockColors and TerrainSurface modules (procedural color/surface lookup)
    if (
      Donkeycraft.BlockColors &&
      typeof Donkeycraft.BlockColors.init === 'function'
    ) {
      try {
        Donkeycraft.BlockColors.init();
      } catch (e) {
        console.warn('[DebugTerrain] BlockColors init failed:', e);
      }
    }
    if (
      Donkeycraft.TerrainSurface &&
      typeof Donkeycraft.TerrainSurface.init === 'function'
    ) {
      try {
        Donkeycraft.TerrainSurface.init();
      } catch (e) {
        console.warn('[DebugTerrain] TerrainSurface init failed:', e);
      }
    }

    // Compile shaders
    if (!this._compileShaders()) {
      console.error('[DebugTerrain] Failed to compile shaders');
      return false;
    }

    // Initialize sky dome buffers
    this._initSkyDome();

    // Start render loop
    this._isRunning = true;
    this._lastFrameTime = 0;
    requestAnimationFrame(this._renderLoop.bind(this));

    return true;
  };

  /**
   * Get the TerrainController instance.
   * @returns {Donkeycraft.TerrainController|null}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getController = function () {
    return this._controller;
  };

  /**
   * Set the world seed.
   * @param {string|number} seed - World seed value.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setWorldSeed = function (seed) {
    this._worldSeed = seed;
  };

  /**
   * Get the current world seed.
   * @returns {string|number}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getWorldSeed = function () {
    return this._worldSeed;
  };

  /**
   * Set the selected biome ID.
   * @param {number} biomeId - Biome ID.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setBiome = function (biomeId) {
    this._selectedBiomeId = Math.max(0, Math.floor(biomeId));
  };

  /**
   * Get the current biome ID.
   * @returns {number}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getBiome = function () {
    return this._selectedBiomeId;
  };

  /**
   * Set the generation options (caves, ores, water, surface).
   * @param {{caves: boolean, ores: boolean, water: boolean, surface: boolean}} opts - Options object.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setOptions = function (opts) {
    if (!opts || typeof opts !== 'object') return;
    this._options.caves = !!opts.caves;
    this._options.ores = !!opts.ores;
    this._options.water = !!opts.water;
    this._options.surface = !!opts.surface;
  };

  /**
   * Get the current generation options.
   * @returns {{caves: boolean, ores: boolean, water: boolean, surface: boolean}}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getOptions = function () {
    return {
      caves: this._options.caves,
      ores: this._options.ores,
      water: this._options.water,
      surface: this._options.surface,
    };
  };

  /**
   * Set the chunk loading radii and regenerate terrain.
   * @param {number} north - North radius in chunks.
   * @param {number} south - South radius in chunks.
   * @param {number} west - West radius in chunks.
   * @param {number} east - East radius in chunks.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setChunkRadii = function (
    north,
    south,
    west,
    east
  ) {
    this._chunkRadiusN = Math.max(0, Math.floor(north));
    this._chunkRadiusS = Math.max(0, Math.floor(south));
    this._chunkRadiusW = Math.max(0, Math.floor(west));
    this._chunkRadiusE = Math.max(0, Math.floor(east));
    this._regenerateTerrain();
  };

  /**
   * Get the current chunk radii.
   * @returns {{north: number, south: number, west: number, east: number}}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getChunkRadii = function () {
    return {
      north: this._chunkRadiusN,
      south: this._chunkRadiusS,
      west: this._chunkRadiusW,
      east: this._chunkRadiusE,
    };
  };

  /**
   * Get the current chunk position (center of view).
   * @returns {{x: number, z: number}}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getChunkPosition = function () {
    return { x: this._currentChunkX, z: this._currentChunkZ };
  };

  /**
   * Set the current chunk position.
   * @param {number} cx - Chunk X coordinate.
   * @param {number} cz - Chunk Z coordinate.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setChunkPosition = function (
    cx,
    cz
  ) {
    this._currentChunkX = Math.floor(cx);
    this._currentChunkZ = Math.floor(cz);
    this._regenerateTerrain();
  };

  /**
   * Get the current FPS.
   * @returns {number}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getCurrentFps = function () {
    return this._controller ? this._controller.getCurrentFps() : 0;
  };

  /**
   * Set a callback for terrain regeneration completion.
   * @param {Function|null} callback - Function to call when terrain is regenerated.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.onTerrainRegenerated = function (
    callback
  ) {
    this._onTerrainRegenerated = callback;
  };

  /**
   * Alias for UI compatibility — set a callback for terrain regeneration completion.
   * @param {Function|null} callback - Function to call when terrain is regenerated.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setOnTerrainRegenerated =
    function (callback) {
      return this.onTerrainRegenerated(callback);
    };

  /**
   * Get the number of loaded chunks.
   * @returns {number}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getChunkCount = function () {
    return this._chunks.size;
  };

  /**
   * Get all loaded chunks as a Map.
   * @returns {Map<string, Donkeycraft.Chunk>}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getChunks = function () {
    return this._chunks;
  };

  /**
   * Get the generation elapsed time in milliseconds.
   * @returns {number}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getGenerationElapsedMs =
    function () {
      return this._generationElapsedMs;
    };

  /**
   * Alias for UI compatibility — get the generation elapsed time in milliseconds.
   * @returns {number}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getGenerationTime = function () {
    return this.getGenerationElapsedMs();
  };

  /**
   * Set the current camera position.
   * @param {number} x - World X coordinate.
   * @param {number} y - World Y coordinate (height).
   * @param {number} z - World Z coordinate.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setCameraPosition = function (
    x,
    y,
    z
  ) {
    if (this._controller) {
      this._controller.setCameraPosition(x, y, z);
    }
  };

  /**
   * Set the current camera rotation.
   * @param {number} yaw - Horizontal rotation in radians.
   * @param {number} pitch - Vertical rotation in radians.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setCameraRotation = function (
    yaw,
    pitch
  ) {
    if (this._controller) {
      this._controller.setCameraRotation(yaw, pitch);
    }
  };

  // ============================================================
  // UI Compatibility Aliases
  // ============================================================

  /**
   * Alias for setWorldSeed — used by UI.
   * @param {string|number} seed - World seed value.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setSeed = function (seed) {
    return this.setWorldSeed(seed);
  };

  /**
   * Alias for getWorldSeed — used by UI.
   * @returns {string|number}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getSeed = function () {
    return this.getWorldSeed();
  };

  /**
   * Alias for setChunkPosition — used by UI.
   * @param {number} cx - Chunk X coordinate.
   * @param {number} cz - Chunk Z coordinate.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setCurrentChunk = function (
    cx,
    cz
  ) {
    return this.setChunkPosition(cx, cz);
  };

  /**
   * Alias for setChunkRadii — used by UI.
   * @param {number} north - North radius in chunks.
   * @param {number} south - South radius in chunks.
   * @param {number} west - West radius in chunks.
   * @param {number} east - East radius in chunks.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.setRadii = function (
    north,
    south,
    west,
    east
  ) {
    return this.setChunkRadii(north, south, west, east);
  };

  /**
   * Alias for getChunkRadii — used by UI.
   * @returns {{north: number, south: number, west: number, east: number}}
   */
  Donkeycraft.DebugTerrainRenderer.prototype.getRadii = function () {
    var r = this.getChunkRadii();
    return { n: r.north, s: r.south, w: r.west, e: r.east };
  };

  /**
   * Public alias for _regenerateTerrain — used by UI.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.regenerateTerrain = function () {
    this._regenerateTerrain();
  };

  /**
   * Start the render loop (no-op — already started by init()).
   * @returns {boolean} True (already running).
   */
  Donkeycraft.DebugTerrainRenderer.prototype.start = function () {
    return true;
  };

  /**
   * Get the current generation progress flag.
   * @returns {boolean} True if terrain regeneration is in progress.
   */
  Donkeycraft.DebugTerrainRenderer.prototype.isGenerationInProgress =
    function () {
      return this._generationInProgress;
    };

  // ============================================================
  // WebGL Initialization
  // ============================================================

  /**
   * Initialize the WebGL context and canvas.
   * @param {string} canvasId - Canvas element ID.
   * @returns {boolean} True if initialization succeeded.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._initWebGL = function (canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error('[DebugTerrain] Canvas not found:', canvasId);
      return false;
    }

    this._canvas = canvas;

    // Try to get WebGL context with fallbacks
    var gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      gl = canvas.getContext('experimental-webgl', {
        alpha: false,
        antialias: false,
        depth: true,
      });
    }

    if (!gl) {
      console.error('[DebugTerrain] Failed to create WebGL context');
      return false;
    }

    this._gl = gl;

    // Handle context loss
    canvas.addEventListener(
      'webglcontextlost',
      function (e) {
        e.preventDefault();
        console.warn('[DebugTerrain] WebGL context lost');
        this._isRunning = false;
      }.bind(this)
    );

    canvas.addEventListener(
      'webglcontextrestored',
      function () {
        console.log('[DebugTerrain] WebGL context restored');
        this._gl = gl;
        if (this._compileShaders()) {
          this._isRunning = true;
          requestAnimationFrame(this._renderLoop.bind(this));
        }
      }.bind(this)
    );

    // Set canvas size
    this._resizeCanvas();

    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    return true;
  };

  /**
   * Resize the canvas to match the window dimensions.
   * Accounts for devicePixelRatio for crisp rendering on high-DPI displays.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._resizeCanvas = function () {
    if (!this._canvas || !this._gl) return;
    var pixelRatio = window.devicePixelRatio || 1;
    var w = Math.floor(window.innerWidth * pixelRatio);
    var h = Math.floor(window.innerHeight * pixelRatio);
    // Clamp to prevent extreme buffer sizes
    w = Math.min(w, 8192);
    h = Math.min(h, 8192);
    if (w === 0 || h === 0) return;
    this._canvas.width = w;
    this._canvas.height = h;
    this._gl.viewport(0, 0, w, h);
  };

  /**
   * Compile shader programs and cache attribute/uniform locations.
   * @returns {boolean} True if all shaders compiled successfully.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._compileShaders = function () {
    var gl = this._gl;
    if (!gl) return false;

    // Compile terrain shader
    if (
      !this._compileAndLink(
        DK_TERRAIN_VS,
        DK_TERRAIN_FS,
        function (prog) {
          this._terrainProgram = prog;
          this._terrainLocs = {
            uProjection: gl.getUniformLocation(prog, 'uProjection'),
            uView: gl.getUniformLocation(prog, 'uView'),
            uModel: gl.getUniformLocation(prog, 'uModel'),
            uFogColor: gl.getUniformLocation(prog, 'uFogColor'),
            uFogDensity: gl.getUniformLocation(prog, 'uFogDensity'),
            uLightFactor: gl.getUniformLocation(prog, 'uLightFactor'),
            aPosition: gl.getAttribLocation(prog, 'aPosition'),
            aColor: gl.getAttribLocation(prog, 'aColor'),
            aAlpha: gl.getAttribLocation(prog, 'aAlpha'),
            aNormal: gl.getAttribLocation(prog, 'aNormal'),
          };
        }.bind(this)
      )
    ) {
      console.error('[DebugTerrain] Failed to compile terrain shader');
      return false;
    }

    // Compile sky shader
    if (
      !this._compileAndLink(
        DK_SKY_VS,
        DK_SKY_FS,
        function (prog) {
          this._skyProgram = prog;
          this._skyLocs = {
            uProjection: gl.getUniformLocation(prog, 'uProjection'),
            uView: gl.getUniformLocation(prog, 'uView'),
            uModel: gl.getUniformLocation(prog, 'uModel'),
            aPosition: gl.getAttribLocation(prog, 'aPosition'),
            aColor: gl.getAttribLocation(prog, 'aColor'),
          };
        }.bind(this)
      )
    ) {
      console.error('[DebugTerrain] Failed to compile sky shader');
      return false;
    }

    return true;
  };

  /**
   * Compile a vertex and fragment shader and link them into a program.
   * @param {string} vsSource - Vertex shader source code.
   * @param {string} fsSource - Fragment shader source code.
   * @param {Function} onReady - Callback with the compiled program.
   * @returns {boolean} True if compilation and linking succeeded.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._compileAndLink = function (
    vsSource,
    fsSource,
    onReady
  ) {
    var gl = this._gl;
    if (!gl) return false;

    // Compile vertex shader
    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error(
        '[DebugTerrain] Vertex shader compile error:',
        gl.getShaderInfoLog(vs)
      );
      gl.deleteShader(vs);
      return false;
    }

    // Compile fragment shader
    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error(
        '[DebugTerrain] Fragment shader compile error:',
        gl.getShaderInfoLog(fs)
      );
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }

    // Link program
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(
        '[DebugTerrain] Program link error:',
        gl.getProgramInfoLog(prog)
      );
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (onReady) onReady(prog);
    return true;
  };

  // ============================================================
  // Sky Dome
  // ============================================================

  /**
   * Initialize the sky dome geometry and buffers.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._initSkyDome = function () {
    var gl = this._gl;
    if (!gl) return;

    if (this._skyPosBuf && this._skyColBuf) return; // Already created

    var s = SKY_SIZE;
    var verts = [
      -s,
      -s,
      s,
      s,
      -s,
      s,
      s,
      s,
      s,
      -s,
      s,
      s,
      s,
      -s,
      -s,
      s,
      s,
      -s,
      s,
      s,
      -s,
      s,
      -s,
      -s,
      -s,
      s,
      -s,
      -s,
      s,
      s,
      s,
      s,
      s,
      s,
      s,
      -s,
      -s,
      -s,
      -s,
      s,
      -s,
      -s,
      s,
      -s,
      s,
      -s,
      -s,
      s,
      s,
      s,
      -s,
      s,
      s,
      s,
      -s,
      s,
      s,
      -s,
      s,
      -s,
      -s,
      -s,
      s,
      s,
      -s,
      s,
      s,
      -s,
      -s,
      -s,
      -s,
      -s,
    ];
    var sc = [
      0.53, 0.81, 0.92, 1.0, 0.53, 0.81, 0.92, 1.0, 0.6, 0.85, 1.0, 1.0, 0.3,
      0.25, 0.2, 1.0, 0.55, 0.8, 0.93, 1.0, 0.55, 0.8, 0.93, 1.0, 0.53, 0.81,
      0.92, 1.0, 0.53, 0.81, 0.92, 1.0, 0.6, 0.85, 1.0, 1.0, 0.53, 0.81, 0.92,
      1.0, 0.55, 0.8, 0.93, 1.0, 0.3, 0.25, 0.2, 1.0, 0.53, 0.81, 0.92, 1.0,
      0.53, 0.81, 0.92, 1.0, 0.6, 0.85, 1.0, 1.0, 0.3, 0.25, 0.2, 1.0, 0.55,
      0.8, 0.93, 1.0, 0.55, 0.8, 0.93, 1.0, 0.53, 0.81, 0.92, 1.0, 0.53, 0.81,
      0.92, 1.0, 0.6, 0.85, 1.0, 1.0, 0.53, 0.81, 0.92, 1.0, 0.55, 0.8, 0.93,
      1.0, 0.3, 0.25, 0.2, 1.0,
    ];
    var idx = [
      0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12,
      14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
    ];

    var pa = [],
      ca = [];
    for (var i = 0; i < idx.length; i++) {
      var j = idx[i];
      pa.push(verts[j * 3], verts[j * 3 + 1], verts[j * 3 + 2]);
      ca.push(sc[j * 4], sc[j * 4 + 1], sc[j * 4 + 2], sc[j * 4 + 3]);
    }

    this._skyPosBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._skyPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pa), gl.STATIC_DRAW);

    this._skyColBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._skyColBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ca), gl.STATIC_DRAW);

    this._skyBuffersCreated = true;
  };

  /**
   * Render the sky dome (pass 1 — behind everything).
   * @param {Float32Array} proj - Projection matrix.
   * @param {Float32Array} view - View matrix.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._renderSky = function (
    proj,
    view
  ) {
    var gl = this._gl;
    if (!gl || !this._skyProgram || !this._skyPosBuf || !this._skyColBuf)
      return;

    // Validate attribute locations — skip if shader isn't properly linked
    if (this._skyLocs.aPosition < 0 || this._skyLocs.aColor < 0) {
      console.warn(
        '[DebugTerrain] Sky shader attributes not found, skipping sky render'
      );
      return;
    }

    gl.useProgram(this._skyProgram);

    // Disable all possible attributes first to clear stale bindings
    for (var i = 0; i < 8; i++) {
      gl.disableVertexAttribArray(i);
    }

    gl.uniformMatrix4fv(this._skyLocs.uProjection, false, proj);
    gl.uniformMatrix4fv(this._skyLocs.uView, false, view);
    var mdl = _mat4Create();
    gl.uniformMatrix4fv(this._skyLocs.uModel, false, mdl);

    gl.enableVertexAttribArray(this._skyLocs.aPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._skyPosBuf);
    gl.vertexAttribPointer(this._skyLocs.aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(this._skyLocs.aColor);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._skyColBuf);
    gl.vertexAttribPointer(this._skyLocs.aColor, 4, gl.FLOAT, false, 0, 0);

    // Render skybox inside-out: cull BACK faces so only FRONT faces render from inside
    gl.depthMask(false);
    gl.cullFace(gl.BACK);
    gl.enable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);

    // Disable attribute arrays to prevent stale bindings in subsequent passes
    if (this._skyLocs.aPosition >= 0 && this._skyLocs.aPosition < 8)
      gl.disableVertexAttribArray(this._skyLocs.aPosition);
    if (this._skyLocs.aColor >= 0 && this._skyLocs.aColor < 8)
      gl.disableVertexAttribArray(this._skyLocs.aColor);
  };

  // ============================================================
  // Key Action Registration
  // ============================================================

  /**
   * Register key action callbacks for terrain navigation.
   * Key bindings (per terrain.html instructions):
   *   R = Regenerate terrain
   *   E = Place camera above ground at current XZ position
   *   F = Set NE overview view
   *   Q = Cycle movement speed
   *   Arrow keys = Move camera to adjacent chunks
   * NOTE: KeyD and KeyE are NOT used here because they conflict with WASD movement.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._registerKeyActions = function () {
    if (!this._controller) return;
    var self = this;

    // R: Regenerate all terrain
    this._controller.registerKeyAction('KeyR', function () {
      self._regenerateTerrain();
    });

    // E: Place camera above ground at current XZ position (per instructions)
    this._controller.registerKeyAction('KeyE', function () {
      if (self._controller && self._controller.placeAboveGround) {
        self._controller.placeAboveGround();
      }
    });

    // F: Set NE overview view (per instructions)
    this._controller.registerKeyAction('KeyF', function () {
      if (self._controller) {
        self._controller.setOverviewView(
          self._currentChunkX,
          self._currentChunkZ,
          self._chunkRadiusN,
          self._chunkRadiusS,
          self._chunkRadiusE,
          self._chunkRadiusW
        );
      }
    });

    // Q: Cycle movement speed
    this._controller.registerKeyAction('KeyQ', function () {
      if (self._controller) self._controller.cycleSpeed();
    });

    // Arrow keys: Move camera to adjacent chunks and regenerate
    this._controller.registerKeyAction('ArrowUp', function () {
      self._currentChunkZ--;
      self._regenerateTerrain();
    });
    this._controller.registerKeyAction('ArrowDown', function () {
      self._currentChunkZ++;
      self._regenerateTerrain();
    });
    this._controller.registerKeyAction('ArrowLeft', function () {
      self._currentChunkX--;
      self._regenerateTerrain();
    });
    this._controller.registerKeyAction('ArrowRight', function () {
      self._currentChunkX++;
      self._regenerateTerrain();
    });

    // NOTE: KeyD is intentionally NOT registered here — it conflicts with WASD strafe-right movement.
    // NOTE: KeyO is available as an alternative overview key (legacy alias for F).
    this._controller.registerKeyAction('KeyO', function () {
      if (self._controller) {
        self._controller.setOverviewView(
          self._currentChunkX,
          self._currentChunkZ,
          self._chunkRadiusN,
          self._chunkRadiusS,
          self._chunkRadiusE,
          self._chunkRadiusW
        );
      }
    });
  };

  /**
   * Set up tab visibility tracking to pause rendering when hidden.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._setupTabVisibility = function () {
    document.addEventListener(
      'visibilitychange',
      function () {
        this._isTabVisible = !document.hidden;
      }.bind(this)
    );
  };

  // ============================================================
  // Block Lookup & Transparency
  // ============================================================

  /**
   * Get the block at a specific world coordinate.
   * Checks all loaded chunks including adjacent ones for proper boundary rendering.
   * @param {number} wx - World X coordinate.
   * @param {number} wy - World Y coordinate.
   * @param {number} wz - World Z coordinate.
   * @returns {number} Block ID (0 = air).
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._getBlockAt = function (
    wx,
    wy,
    wz
  ) {
    if (!Donkeycraft.Config) return 0;
    var cs = Donkeycraft.Config.CHUNK_SIZE;
    var ws = Donkeycraft.Config.WORLD_HEIGHT;

    // Clamp Y to world bounds
    if (wy < 0 || wy >= ws) return 0;

    // Calculate chunk coordinates
    var chunkX = Math.floor(wx / cs);
    var chunkZ = Math.floor(wz / cs);

    // Check if chunk is loaded
    var key = chunkX + ',' + chunkZ;
    var chunk = this._chunks.get(key);
    if (!chunk) return 0;

    // Convert to local coordinates
    var localX = ((wx % cs) + cs) % cs;
    var localZ = ((wz % cs) + cs) % cs;

    return chunk.getBlock(localX, wy, localZ);
  };

  /**
   * Check if a block ID is transparent (for face culling).
   * @param {number} bid - Block ID.
   * @returns {boolean} True if the block is transparent.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._isTransparent = function (bid) {
    if (
      Donkeycraft.BlockTypes &&
      typeof Donkeycraft.BlockTypes.isTransparent === 'function'
    ) {
      return Donkeycraft.BlockTypes.isTransparent(bid);
    }
    // Fallback: check BlockRegistry
    if (Donkeycraft.BlockRegistry) {
      var b = Donkeycraft.BlockRegistry.getBlockById(bid);
      return b && b.transparent;
    }
    return false;
  };

  // ============================================================
  // Mesh Building — Block Face Rendering
  // ============================================================

  /**
   * Compute the Y bounds of actual blocks in a chunk.
   * Optimized: scans upward from Y=0 for minY, downward from top for maxY.
   * @param {Donkeycraft.Chunk} chunk - The chunk to analyze.
   * @returns {{minY: number, maxY: number}} Y bounds.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._computeChunkYBounds = function (
    chunk
  ) {
    var cs = Donkeycraft.Config.CHUNK_SIZE;
    var ws = Donkeycraft.Config.WORLD_HEIGHT;
    var minY = -1,
      maxY = -1;

    // Scan upward from Y=0 to find minY
    for (var y = 0; y < ws && minY < 0; y++) {
      for (var x = 0; x < cs; x++) {
        for (var z = 0; z < cs; z++) {
          if (chunk.getBlock(x, y, z) !== 0) {
            minY = y;
            break;
          }
        }
        if (minY >= 0) break;
      }
    }

    // Scan downward from Y=ws-1 to find maxY
    for (var y = ws - 1; y >= 0 && maxY < 0; y--) {
      for (var x = 0; x < cs; x++) {
        for (var z = 0; z < cs; z++) {
          if (chunk.getBlock(x, y, z) !== 0) {
            maxY = y;
            break;
          }
        }
        if (maxY >= 0) break;
      }
    }

    if (minY < 0 || maxY < 0) return { minY: 0, maxY: 0 };

    // Add 1 block padding for neighbor face culling
    if (minY > 0) minY--;
    if (maxY < ws - 1) maxY++;
    return { minY: Math.max(0, minY), maxY: Math.min(ws - 1, maxY) };
  };

  /**
   * Build a mesh for a single chunk — iterates all exposed block faces.
   * Uses Donkeycraft.BlockColors for color/alpha lookup (not duplicated code).
   * @param {Donkeycraft.Chunk} chunk - The chunk to build a mesh for.
   * @returns {{count: number, posBuf: WebGLBuffer, colorBuf: WebGLBuffer, alphaBuf: WebGLBuffer, normBuf: WebGLBuffer}|null} Mesh buffer data.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._buildChunkMesh = function (
    chunk
  ) {
    var gl = this._gl;
    if (!gl || !Donkeycraft.Config) return null;

    if (!Donkeycraft.BlockColors || !Donkeycraft.BlockColors.isInitialized()) {
      console.warn(
        '[DebugTerrain] BlockColors not initialized — colors will be missing'
      );
      return null;
    }

    var cs = Donkeycraft.Config.CHUNK_SIZE;
    var ws = Donkeycraft.Config.WORLD_HEIGHT;
    var key = chunk.chunkX + ',' + chunk.chunkZ;

    // Check cache
    if (
      !this._dirtyChunks.has(key) &&
      this._meshBuffers[key] &&
      this._meshBuffers[key].count >= 0
    ) {
      return this._meshBuffers[key];
    }

    // Y bounds optimization
    var yBounds = this._computeChunkYBounds(chunk);
    var startY = yBounds.minY,
      endY = yBounds.maxY;

    // Collect vertex data
    var pos = [],
      col = [],
      alp = [],
      nor = [];

    for (var x = 0; x < cs; x++) {
      for (var y = startY; y <= endY; y++) {
        for (var z = 0; z < cs; z++) {
          var bid = chunk.getBlock(x, y, z);
          if (bid === 0) continue; // air

          // Get color and alpha from BlockColors module
          var clr = Donkeycraft.BlockColors.getColor(bid);
          if (!clr) continue; // no color (air)
          var alpha = Donkeycraft.BlockColors.getAlpha(bid);

          for (var f = 0; f < _FACE_DEFS.length; f++) {
            var face = _FACE_DEFS[f];
            var nx = x + face.d[0],
              ny = y + face.d[1],
              nz = z + face.d[2];
            var nid = 0,
              neighborTransparent = true;

            if (
              nx >= 0 &&
              nx < cs &&
              ny >= 0 &&
              ny < ws &&
              nz >= 0 &&
              nz < cs
            ) {
              // Neighbor within same chunk
              nid = chunk.getBlock(nx, ny, nz);
              neighborTransparent = this._isTransparent(nid);
            } else {
              // Neighbor in adjacent chunk — look up by world coords
              var ngx = chunk.chunkX * cs + nx;
              var ngy = ny;
              var ngz = chunk.chunkZ * cs + nz;
              nid = this._getBlockAt(ngx, ngy, ngz);
              neighborTransparent = nid === 0 ? true : this._isTransparent(nid);
            }

            // Show face if neighbor is air OR transparent
            if (nid === 0 || neighborTransparent) {
              var triIndices = _TRI_INDICES;
              for (var ti = 0; ti < 6; ti++) {
                var vi = face.c[triIndices[ti]];
                pos.push(x + vi[0], y + vi[1], z + vi[2]);
                col.push(clr[0], clr[1], clr[2]);
                alp.push(alpha);
                nor.push(face.n[0], face.n[1], face.n[2]);
              }
            }
          }
        }
      }
    }

    if (pos.length === 0) {
      this._meshBuffers[key] = { count: 0 };
      return this._meshBuffers[key];
    }

    var vertexCount = pos.length / 3;

    // Create buffers
    var pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);

    var cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.STATIC_DRAW);

    var ab = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ab);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(alp), gl.STATIC_DRAW);

    var nb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);

    // Delete old buffers — unbind before deleting to prevent WebGL driver issues
    var oldBuf = this._meshBuffers[key];
    if (oldBuf) {
      if (oldBuf.posBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.deleteBuffer(oldBuf.posBuf);
      }
      if (oldBuf.colorBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.deleteBuffer(oldBuf.colorBuf);
      }
      if (oldBuf.alphaBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.deleteBuffer(oldBuf.alphaBuf);
      }
      if (oldBuf.normBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.deleteBuffer(oldBuf.normBuf);
      }
    }

    this._meshBuffers[key] = {
      posBuf: pb,
      colorBuf: cb,
      alphaBuf: ab,
      normBuf: nb,
      count: vertexCount,
    };
    return this._meshBuffers[key];
  };

  /**
   * Clear all mesh buffers and delete WebGL resources.
   * Also clears associated cache entries (_builtChunkKeys, _dirtyChunks).
   * Unbinds all buffers before deletion to prevent WebGL driver issues.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._clearMeshBuffers = function () {
    var gl = this._gl;
    var keys = Object.keys(this._meshBuffers);
    for (var i = 0; i < keys.length; i++) {
      var buf = this._meshBuffers[keys[i]];
      if (buf) {
        if (buf.posBuf && gl) {
          gl.bindBuffer(gl.ARRAY_BUFFER, null);
          gl.deleteBuffer(buf.posBuf);
        }
        if (buf.colorBuf && gl) {
          gl.bindBuffer(gl.ARRAY_BUFFER, null);
          gl.deleteBuffer(buf.colorBuf);
        }
        if (buf.alphaBuf && gl) {
          gl.bindBuffer(gl.ARRAY_BUFFER, null);
          gl.deleteBuffer(buf.alphaBuf);
        }
        if (buf.normBuf && gl) {
          gl.bindBuffer(gl.ARRAY_BUFFER, null);
          gl.deleteBuffer(buf.normBuf);
        }
      }
    }
    this._meshBuffers = {};
    this._builtChunkKeys.clear();
    this._dirtyChunks.clear();
  };

  // ============================================================
  // Terrain Generation
  // ============================================================

  /**
   * Fill a chunk from a heightmap using biome-aware block placement.
   * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
   * @param {number[]} heightmap - Array of height values (size = CHUNK_SIZE × CHUNK_SIZE).
   * @param {number} biomeId - Biome ID for surface block selection.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._fillChunkFromHeightmap =
    function (chunk, heightmap, biomeId) {
      var cs = Donkeycraft.Config.CHUNK_SIZE;
      var ws = Donkeycraft.Config.WORLD_HEIGHT;

      function getBlockId(name, fallback) {
        if (!Donkeycraft.BlockRegistry) return fallback;
        var b = Donkeycraft.BlockRegistry.getBlockByName(name);
        return b ? b.id : fallback;
      }

      var bedrockId = getBlockId('bedrock', 1000);
      var stoneId = getBlockId('stone', 1);
      var dirtId = getBlockId('dirt', 7);
      var grassBlockId = getBlockId('grass_block', 8);

      // Resolve biome-specific blocks
      var biomeType = 'grass';
      if (
        Donkeycraft.BiomeRegistry &&
        typeof Donkeycraft.BiomeRegistry.getBiomeById === 'function'
      ) {
        var biome = Donkeycraft.BiomeRegistry.getBiomeById(biomeId);
        if (biome && biome.name) biomeType = biome.name.toLowerCase();
      }

      var surfaceBlockId, subSurfaceBlockId, subSubBlockId;
      switch (biomeType) {
        case 'arctic':
          surfaceBlockId = getBlockId('snow_block', 80);
          subSurfaceBlockId = getBlockId('ice', 79);
          subSubBlockId = getBlockId('packed_ice', 162);
          break;
        case 'desert':
          surfaceBlockId = getBlockId('sand', 12);
          subSurfaceBlockId = getBlockId('sandstone', 24);
          subSubBlockId = getBlockId('sandstone', 24);
          break;
        case 'forest':
          surfaceBlockId = getBlockId('grass_block', 8);
          subSurfaceBlockId = getBlockId('dirt', 7);
          subSubBlockId = stoneId;
          break;
        default:
          surfaceBlockId = getBlockId('grass_block', 8);
          subSurfaceBlockId = dirtId;
          subSubBlockId = stoneId;
          break;
      }

      // Clamp heightmap values
      var hMin = Infinity,
        hMax = -Infinity;
      for (var hi = 0; hi < heightmap.length; hi++) {
        if (isFinite(heightmap[hi])) {
          if (heightmap[hi] < hMin) hMin = heightmap[hi];
          if (heightmap[hi] > hMax) hMax = heightmap[hi];
        }
      }

      // Place bedrock at Y=0
      for (var x = 0; x < cs; x++) {
        for (var z = 0; z < cs; z++) {
          chunk.setBlock(x, 0, z, bedrockId);
        }
      }

      // Fill terrain columns
      for (var x2 = 0; x2 < cs; x2++) {
        for (var z2 = 0; z2 < cs; z2++) {
          var h = heightmap[x2 + z2 * cs];
          if (!isFinite(h) || h < 1 || h >= ws - 10) h = 64;
          h = Math.floor(h);

          for (var y2 = 1; y2 < h; y2++) {
            if (y2 < h - 3) {
              chunk.setBlock(x2, y2, z2, subSubBlockId);
            } else {
              chunk.setBlock(x2, y2, z2, subSurfaceBlockId);
            }
          }
          if (surfaceBlockId) {
            chunk.setBlock(x2, h, z2, surfaceBlockId);
          } else {
            chunk.setBlock(x2, h, z2, stoneId);
          }
        }
      }

      // Water placement if enabled.
      // Signature: placeWater(chunk, chunkX, chunkZ, biomeId, heightmap, options)
      if (this._options.water && Donkeycraft.WaterGenerator) {
        try {
          var waterOpts = {
            caves: this._options.caves,
            ores: this._options.ores,
            water: true,
            surface: this._options.surface,
          };
          Donkeycraft.WaterGenerator.placeWater(
            chunk,
            chunk.chunkX,
            chunk.chunkZ,
            biomeId,
            heightmap,
            waterOpts
          );
        } catch (e) {
          console.warn('[DebugTerrain] Water placement failed: ' + e.message);
        }
      }

      // Surface layers if enabled.
      // Signature: applySurfaceLayers(chunk, chunkX, chunkZ, biomeName, heightmap)
      // Requires biome NAME (string), not biome ID (number).
      if (
        this._options.surface &&
        Donkeycraft.TerrainSurface &&
        Donkeycraft.TerrainSurface.applySurfaceLayers
      ) {
        try {
          var biomeName = 'grass';
          if (Donkeycraft.BiomeRegistry) {
            var b = Donkeycraft.BiomeRegistry.getBiomeById(biomeId);
            if (b && b.name) biomeName = b.name;
          }
          Donkeycraft.TerrainSurface.applySurfaceLayers(
            chunk,
            chunk.chunkX,
            chunk.chunkZ,
            biomeName,
            heightmap
          );
        } catch (e) {
          console.warn(
            '[DebugTerrain] Surface layer application failed: ' + e.message
          );
        }
      }

      // Mark chunk as dirty so mesh will be rebuilt on next frame.
      // Also mark as generated to prevent double-generation if regenerateTerrain is called again.
      chunk._dirty = true;
      chunk.generated = true;
    };

  /**
   * Fallback chunk generation when TerrainCore is unavailable.
   * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
   * @param {number} cx - Chunk X coordinate (for seed).
   * @param {number} cz - Chunk Z coordinate (for seed).
   * @param {number} biomeId - Biome ID for surface block selection.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._generateChunkFallback = function (
    chunk,
    cx,
    cz,
    biomeId
  ) {
    var heightmap = null;
    if (Donkeycraft.TerrainGenerator) {
      try {
        heightmap = Donkeycraft.TerrainGenerator.generateHeightmap(
          cx !== undefined ? cx : chunk.chunkX,
          cz !== undefined ? cz : chunk.chunkZ,
          null
        );
      } catch (e) {
        /* ignore */
      }
    }

    var ws = Donkeycraft.Config.WORLD_HEIGHT;
    var cs = Donkeycraft.Config.CHUNK_SIZE;

    function getBlockId(name, fallback) {
      if (!Donkeycraft.BlockRegistry) return fallback;
      var b = Donkeycraft.BlockRegistry.getBlockByName(name);
      return b ? b.id : fallback;
    }

    var bedrockId = getBlockId('bedrock', 1000);
    var stoneId = getBlockId('stone', 1);
    var dirtId = getBlockId('dirt', 7);
    var grassBlockId = getBlockId('grass_block', 8);

    // Place bedrock at Y=0
    for (var x = 0; x < cs; x++) {
      for (var z = 0; z < cs; z++) {
        chunk.setBlock(x, 0, z, bedrockId);
      }
    }

    if (heightmap) {
      for (var x2 = 0; x2 < cs; x2++) {
        for (var z2 = 0; z2 < cs; z2++) {
          var h = Math.max(1, Math.min(heightmap[x2 + z2 * cs] || 64, ws - 10));
          for (var y2 = 1; y2 < h; y2++) {
            if (y2 < h - 3) chunk.setBlock(x2, y2, z2, stoneId);
            else chunk.setBlock(x2, y2, z2, dirtId);
          }
          if (grassBlockId) {
            chunk.setBlock(x2, h, z2, grassBlockId);
          } else {
            chunk.setBlock(x2, h, z2, stoneId);
          }
        }
      }
    }

    // Optional cave and ore generation
    if (this._options.caves && Donkeycraft.CaveGenerator) {
      try {
        Donkeycraft.CaveGenerator.generateCaves(
          chunk,
          cx || chunk.chunkX,
          cz || chunk.chunkZ,
          heightmap
        );
      } catch (e) {
        /* ignore */
      }
    }
    if (this._options.ores && Donkeycraft.OreGenerator) {
      try {
        if (Donkeycraft.OreGenerator.init) Donkeycraft.OreGenerator.init();
        Donkeycraft.OreGenerator.placeOres(chunk, biomeId);
      } catch (e) {
        /* ignore */
      }
    }

    // Water and surface layers.
    // Signature: placeWater(chunk, chunkX, chunkZ, biomeId, heightmap, options)
    if (this._options.water && Donkeycraft.WaterGenerator && heightmap) {
      try {
        var waterOpts = {
          caves: this._options.caves,
          ores: this._options.ores,
          water: true,
          surface: this._options.surface,
        };
        Donkeycraft.WaterGenerator.placeWater(
          chunk,
          cx || chunk.chunkX,
          cz || chunk.chunkZ,
          biomeId,
          heightmap,
          waterOpts
        );
      } catch (e) {
        /* ignore */
      }
    }
    // Signature: applySurfaceLayers(chunk, chunkX, chunkZ, biomeName, heightmap)
    if (
      this._options.surface &&
      Donkeycraft.TerrainSurface &&
      Donkeycraft.TerrainSurface.applySurfaceLayers &&
      heightmap
    ) {
      try {
        var biomeName = 'grass';
        if (Donkeycraft.BiomeRegistry) {
          var b = Donkeycraft.BiomeRegistry.getBiomeById(biomeId);
          if (b && b.name) biomeName = b.name;
        }
        Donkeycraft.TerrainSurface.applySurfaceLayers(
          chunk,
          cx || chunk.chunkX,
          cz || chunk.chunkZ,
          biomeName,
          heightmap
        );
      } catch (e) {
        /* ignore */
      }
    }

    // Mark chunk as dirty/generated to prevent double-generation.
    chunk._dirty = true;
    chunk.generated = true;
  };

  /**
   * Regenerate all terrain within current grid bounds.
   * Guards against concurrent regeneration to prevent race conditions.
   * Clears all caches, chunks, and mesh buffers before starting generation.
   * @returns {boolean} True if regeneration was started, false if already in progress.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._regenerateTerrain = function () {
    // Guard: skip if regeneration is already in progress
    if (this._generationInProgress) return false;

    this._generationInProgress = true;
    this._chunks.clear();
    this._clearMeshBuffers();
    // _clearMeshBuffers now also clears _builtChunkKeys and _dirtyChunks

    // Reset first-frame flag so all meshes are rebuilt on the subsequent frame
    this._firstFrameBuilt = false;

    // Start timing
    this._generationStartTime = performance.now();

    // Determine bounds
    var bounds = {
      minX: this._currentChunkX - this._chunkRadiusW,
      maxX: this._currentChunkX + this._chunkRadiusE,
      minZ: this._currentChunkZ - this._chunkRadiusN,
      maxZ: this._currentChunkZ + this._chunkRadiusS,
    };

    // Set seed and biome on TerrainCore if available
    if (Donkeycraft.TerrainCore) {
      try {
        if (typeof Donkeycraft.TerrainCore.setSeed === 'function')
          Donkeycraft.TerrainCore.setSeed(this._worldSeed);
        if (typeof Donkeycraft.TerrainCore.setBiome === 'function')
          Donkeycraft.TerrainCore.setBiome(this._selectedBiomeId);
      } catch (e) {
        /* ignore */
      }
    }

    var self = this;
    var pendingChunks = [];

    for (var cx = bounds.minX; cx <= bounds.maxX; cx++) {
      for (var cz = bounds.minZ; cz <= bounds.maxZ; cz++) {
        var key = cx + ',' + cz;
        var chunk = new Donkeycraft.Chunk(cx, cz);
        chunk.fill(0);

        if (
          Donkeycraft.TerrainCore &&
          typeof Donkeycraft.TerrainCore.generateChunk === 'function'
        ) {
          pendingChunks.push({
            key: key,
            chunk: chunk,
            cx: cx,
            cz: cz,
            biomeId: this._selectedBiomeId,
          });
        } else {
          this._generateChunkFallback(chunk, cx, cz, this._selectedBiomeId);
          this._chunks.set(key, chunk);
          this._dirtyChunks.add(key);
        }
      }
    }

    if (pendingChunks.length > 0) {
      var allPendingCount = pendingChunks.length;
      var completedCount = 0;

      for (var i = 0; i < pendingChunks.length; i++) {
        (function (pc) {
          Donkeycraft.TerrainCore.generateChunk(pc.cx, pc.cz).then(
            function (result) {
              if (
                result &&
                result.heightmap &&
                Array.isArray(result.heightmap)
              ) {
                pc.chunk._cachedHeightmap = result.heightmap;
                self._fillChunkFromHeightmap(
                  pc.chunk,
                  result.heightmap,
                  pc.biomeId
                );
              }
              self._chunks.set(pc.key, pc.chunk);
              self._dirtyChunks.add(pc.key);
              completedCount++;

              if (completedCount >= allPendingCount) {
                self._generationElapsedMs =
                  performance.now() - self._generationStartTime;
                self._generationStartTime = 0;
                self._generationInProgress = false;
                if (self._onTerrainRegenerated) self._onTerrainRegenerated();
              }
            },
            function (e) {
              self._generateChunkFallback(pc.chunk, pc.cx, pc.cz, pc.biomeId);
              self._chunks.set(pc.key, pc.chunk);
              self._dirtyChunks.add(pc.key);
              completedCount++;

              if (completedCount >= allPendingCount) {
                self._generationElapsedMs =
                  performance.now() - self._generationStartTime;
                self._generationStartTime = 0;
                self._generationInProgress = false;
                if (self._onTerrainRegenerated) self._onTerrainRegenerated();
              }
            }
          );
        })(pendingChunks[i]);
      }
    } else {
      this._generationElapsedMs = performance.now() - this._generationStartTime;
      this._generationStartTime = 0;
      this._generationInProgress = false;
      if (this._onTerrainRegenerated) this._onTerrainRegenerated();
    }
  };

  // ============================================================
  // Render Loop
  // ============================================================

  /**
   * Main render loop.
   * Each frame:
   * 1. Check for WebGL context loss
   * 2. Update delta time and camera
   * 3. Track FPS and update UI
   * 4. Clear framebuffer
   * 5. Build projection/view matrices
   * 6. Render sky dome (pass 1)
   * 7. Build dirty transition meshes and render terrain (pass 2)
   *
   * @param {number} ts - Current timestamp in milliseconds from requestAnimationFrame.
   * @private
   */
  Donkeycraft.DebugTerrainRenderer.prototype._renderLoop = function (ts) {
    var self = this;

    // Check for WebGL context loss
    var gl = this._gl;
    if (!gl || gl.isContextLost()) {
      console.warn('[DebugTerrain] WebGL context lost, pausing render loop');
      if (gl && !gl.isContextLost())
        requestAnimationFrame(self._renderLoop.bind(self));
      return;
    }

    // Delta time for frame-rate independent movement
    var dt = 1;
    if (this._lastFrameTime > 0) dt = (ts - this._lastFrameTime) / 16.667;
    this._lastFrameTime = ts;

    // Update camera with delta time
    if (this._controller && this._isTabVisible)
      this._controller.updateCamera(dt);

    // FPS tracking
    if (this._controller)
      this._controller.updateFps(ts, ['dk-fps-counter', 'ui-fps']);

    // Periodic state save (every 2 seconds)
    if (ts - (this._lastSaveTime || 0) > 2000) {
      this._lastSaveTime = ts;
      if (this._controller) this._controller.saveState();
    }

    // Update camera display in UI — called every frame for live yaw/pitch
    if (this._controller) {
      var cam = this._controller.getCamera();
      var viewerPosEl = document.getElementById('ui-viewer-pos');
      if (viewerPosEl)
        viewerPosEl.textContent =
          'X=' +
          cam.x.toFixed(1) +
          ' Y=' +
          cam.y.toFixed(1) +
          ' Z=' +
          cam.z.toFixed(1);

      // Yaw in degrees 0-359, pitch in degrees -89 to +89.
      // Negate yaw because updateCamera uses yaw -= mouseDX (mouse right decreases yaw).
      // Displaying -yaw makes yaw increase when turning right (standard FPS behavior).
      var viewerRotEl = document.getElementById('ui-viewer-rot');
      if (viewerRotEl && cam) {
        var yawDeg = ((((-cam.yaw * 180) / Math.PI) % 360) + 360) % 360;
        var pitchDeg = Math.round((cam.pitch * 180) / Math.PI);
        viewerRotEl.textContent =
          'Yaw=' + Math.round(yawDeg) + '° Pitch=' + pitchDeg + '°';
      }

      var viewerSeedEl = document.getElementById('ui-viewer-seed');
      if (viewerSeedEl) viewerSeedEl.textContent = 'Seed: ' + this._worldSeed;
    }

    // Resize check — compare scaled dimensions (accounting for devicePixelRatio)
    if (this._canvas && this._gl) {
      var targetW = Math.floor(
        window.innerWidth * (window.devicePixelRatio || 1)
      );
      var targetH = Math.floor(
        window.innerHeight * (window.devicePixelRatio || 1)
      );
      if (this._canvas.width !== targetW || this._canvas.height !== targetH)
        this._resizeCanvas();
    }

    // Clear framebuffer
    gl.clearColor(0.53, 0.81, 0.92, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (!this._controller) {
      requestAnimationFrame(this._renderLoop.bind(this));
      return;
    }

    // Build projection matrix
    var asp = this._canvas.width / this._canvas.height;
    var fov =
      Donkeycraft.Config && Donkeycraft.Config.FOV
        ? (Donkeycraft.Config.FOV * Math.PI) / 180
        : DEFAULT_FOV;
    var proj = new Float32Array(16);
    _mat4Perspective(proj, fov, asp, NEAR_PLANE, FAR_PLANE);

    // Build view matrix
    var cam = this._controller.getCamera();
    var ex = cam.x,
      ey = cam.y,
      ez = cam.z;
    var lx = ex - Math.sin(cam.yaw) * Math.cos(cam.pitch);
    var ly = ey + Math.sin(cam.pitch);
    var lz = ez - Math.cos(cam.yaw) * Math.cos(cam.pitch);
    var view = new Float32Array(16);
    _mat4LookAt(view, [ex, ey, ez], [lx, ly, lz], [0, 1, 0]);

    // Pass 1: Sky dome (behind everything)
    this._renderSky(proj, view);

    // Mark all chunks dirty on first frame
    if (!this._firstFrameBuilt) {
      this._firstFrameBuilt = true;
      var self2 = this;
      this._chunks.forEach(function (ch) {
        self2._dirtyChunks.add(ch.chunkX + ',' + ch.chunkZ);
      });
    }

    // Build meshes for dirty chunks only, track which chunks have valid meshes
    var validChunkKeys = new Set();
    this._chunks.forEach(function (ch) {
      var chunkKey = ch.chunkX + ',' + ch.chunkZ;
      var result = self._buildChunkMesh(ch);
      if (result && result.count >= 0) {
        validChunkKeys.add(chunkKey);
        self._builtChunkKeys.add(chunkKey);
      }
    });

    // Clear dirty chunks that have been successfully built — prevents redundant rebuilds every frame.
    // Collect keys first to avoid modifying Set during iteration.
    var keysToDelete = [];
    var dirtyIter3 = this._dirtyChunks.values();
    var dirtyItem3 = dirtyIter3.next();
    while (!dirtyItem3.done) {
      var dk3 = dirtyItem3.value;
      if (self._meshBuffers[dk3] && self._meshBuffers[dk3].count >= 0) {
        keysToDelete.push(dk3);
      }
      dirtyItem3 = dirtyIter3.next();
    }
    for (var ki = 0; ki < keysToDelete.length; ki++) {
      this._dirtyChunks.delete(keysToDelete[ki]);
    }

    // Pass 2: Terrain rendering with alpha blending
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(this._terrainProgram);
    gl.uniformMatrix4fv(this._terrainLocs.uProjection, false, proj);
    gl.uniformMatrix4fv(this._terrainLocs.uView, false, view);
    gl.uniform3f(this._terrainLocs.uFogColor, 0.53, 0.81, 0.92);
    gl.uniform1f(this._terrainLocs.uFogDensity, FOG_DENSITY);
    gl.uniform1f(this._terrainLocs.uLightFactor, 1.0);

    // Sort chunks far-to-near for correct transparent rendering
    var chunkList = [];
    var cs2 = Donkeycraft.Config.CHUNK_SIZE;
    this._chunks.forEach(function (ch) {
      var dx = ch.chunkX - Math.floor(ex / cs2);
      var dz = ch.chunkZ - Math.floor(ez / cs2);
      var dist = dx * dx + dz * dz;
      chunkList.push({ chunk: ch, dist: dist });
    });
    chunkList.sort(function (a, b) {
      return b.dist - a.dist;
    });

    // Enable blending for transparent blocks
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Render all chunks sorted far-to-near
    for (var i = 0; i < chunkList.length; i++) {
      var ch = chunkList[i].chunk;
      var chunkKey = ch.chunkX + ',' + ch.chunkZ;
      if (!validChunkKeys.has(chunkKey)) continue;

      var buf = this._meshBuffers[chunkKey];
      if (!buf || buf.count === 0) continue;

      // Set model matrix (chunk world offset)
      var cm = new Float32Array(16);
      cm.fill(0);
      cm[0] = cm[5] = cm[10] = cm[15] = 1;
      cm[12] = ch.chunkX * cs2;
      cm[14] = ch.chunkZ * cs2;
      gl.uniformMatrix4fv(this._terrainLocs.uModel, false, cm);

      // Bind attributes (separate tightly-packed buffers)
      gl.enableVertexAttribArray(this._terrainLocs.aPosition);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.posBuf);
      gl.vertexAttribPointer(
        this._terrainLocs.aPosition,
        3,
        gl.FLOAT,
        false,
        0,
        0
      );

      gl.enableVertexAttribArray(this._terrainLocs.aColor);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.colorBuf);
      gl.vertexAttribPointer(
        this._terrainLocs.aColor,
        3,
        gl.FLOAT,
        false,
        0,
        0
      );

      gl.enableVertexAttribArray(this._terrainLocs.aAlpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.alphaBuf);
      gl.vertexAttribPointer(
        this._terrainLocs.aAlpha,
        1,
        gl.FLOAT,
        false,
        0,
        0
      );

      gl.enableVertexAttribArray(this._terrainLocs.aNormal);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.normBuf);
      gl.vertexAttribPointer(
        this._terrainLocs.aNormal,
        3,
        gl.FLOAT,
        false,
        0,
        0
      );

      gl.drawArrays(gl.TRIANGLES, 0, buf.count);
    }

    // Restore state
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // Disable all attribute arrays to prevent stale bindings in next frame's sky pass
    for (var i = 0; i < 8; i++) {
      gl.disableVertexAttribArray(i);
    }

    requestAnimationFrame(this._renderLoop.bind(this));
  };
})();
