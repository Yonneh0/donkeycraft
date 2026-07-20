// Donkeycraft — Texture Atlas
// Atlas generation: compiles all block textures into a single WebGL texture with proper UV coordinate mapping.
//
// Texture Atlas Layout:
// - 32×32 grid of 16×16 pixel textures = 512×512 total atlas size
// - Block ID maps to grid position: col = id % 32, row = floor(id / 32)
// - texSubImage2D places the first image row at V=0 (bottom of texture region), so UVs map directly
// - Nearest-neighbor filtering is used for pixelated rendering
//
// @module texture-atlas
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  // ============================================================
  // Atlas Constants — centralized for consistency across modules
  // ============================================================

  /**
   * Size of each individual texture tile in pixels.
   * @constant {number}
   */
  var TEX_SIZE = 16;

  /**
   * Number of texture tiles per row/column in the atlas grid.
   * @constant {number}
   */
  var ATLAS_GRID = 32;

  /**
   * Total atlas size in pixels (TEX_SIZE × ATLAS_GRID).
   * @constant {number}
   */
  var ATLAS_SIZE = TEX_SIZE * ATLAS_GRID; // 512

  /**
   * Maximum block ID that fits in the atlas (ATLAS_GRID² - 1).
   * Block IDs >= MAX_BLOCK_ID will fall back to placeholder texture.
   * @constant {number}
   */
  var MAX_BLOCK_ID = ATLAS_GRID * ATLAS_GRID; // 1024

  // ============================================================
  // TextureAtlas — stitches block textures into a single WebGL texture
  // ============================================================

  /**
   * TextureAtlas — compiles all block textures into a single WebGL 2D texture.
   *
   * Each block's 16×16 texture is uploaded to a unique position in a 256×256 atlas,
   * and UV coordinates are computed for efficient texture lookups during rendering.
   *
   * texSubImage2D places pixel data with the first image row at V=0 (bottom of the
   * texture region), so UV coordinates map directly without flipping.
   *
   * @constructor
   * @param {WebGLRenderingContext} gl - The WebGL 1 rendering context.
   * @throws {Error} If gl is null or invalid.
   */
  Donkeycraft.TextureAtlas = function (gl) {
    if (!gl) {
      throw new Error('TextureAtlas requires a valid WebGLRenderingContext');
    }

    /**
     * WebGL rendering context.
     * @private
     * @type {WebGLRenderingContext}
     */
    this._gl = gl;

    /**
     * WebGL texture object (created during generate()).
     * @private
     * @type {WebGLTexture|null}
     */
    this._texture = null;

    /**
     * Registered texture images: blockId → HTMLImageElement.
     * @private
     * @type {Object.<number, HTMLImageElement>}
     */
    this._images = {};

    /**
     * UV coordinate map: blockId → {u, v, uSize, vSize, pixelU, pixelV, pixelUSize, pixelVSize}.
     * UVs are normalized to [0, 1] range. texSubImage2D places row 0 at V=0.
     * @private
     * @type {Object.<number, AtlasUV>}
     */
    this._uvMap = {};

    /**
     * Count of successfully loaded textures.
     * @private
     * @type {number}
     */
    this._loadedCount = 0;

    /**
     * Total number of textures to load (set during async registration).
     * @private
     * @type {number}
     */
    this._totalToLoad = 0;

    /**
     * Callback invoked when atlas generation completes.
     * @private
     * @type {Function|null}
     */
    this._onReadyCallback = null;
  };

  /**
   * Load a pre-built atlas canvas directly (for cached atlas restoration).
   *
   * Skips per-block texture registration and uploads the entire canvas to WebGL
   * in one pass. UV coordinates are computed using the standard grid formula.
   * This is used when restoring a cached texture atlas from IndexedDB.
   *
   * @param {HTMLCanvasElement} canvas - The full atlas canvas (e.g., 256×256).
   * @returns {boolean} True if upload succeeded, false otherwise.
   */
  Donkeycraft.TextureAtlas.prototype.loadFromCanvas = function (canvas) {
    var gl = this._gl;
    if (!gl || !canvas) return false;

    // Validate canvas dimensions match expected atlas size
    if (canvas.width !== ATLAS_SIZE || canvas.height !== ATLAS_SIZE) {
      Donkeycraft.Logger.warn(
        'TextureAtlas',
        'Canvas size mismatch: expected ' + ATLAS_SIZE + 'x' + ATLAS_SIZE + ', got ' + canvas.width + 'x' + canvas.height
      );
      return false;
    }

    // Create and bind texture
    this._texture = gl.createTexture();
    if (!this._texture) {
      Donkeycraft.Logger.error(
        'TextureAtlas',
        'Failed to create WebGL texture object'
      );
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    // Upload the entire canvas in one call
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

    // Set texture parameters for nearest-neighbor filtering (pixelated look)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Compute UV coordinates using standard grid formula
    var blocks = Donkeycraft.BlockRegistry
      ? Donkeycraft.BlockRegistry.getAllBlocks()
      : [];
    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      var id = block.id;
      if (id >= MAX_BLOCK_ID) continue;

      var col = id % ATLAS_GRID;
      var row = Math.floor(id / ATLAS_GRID);
      this._uvMap[id] = {
        u: (col * TEX_SIZE) / ATLAS_SIZE,
        v: (row * TEX_SIZE) / ATLAS_SIZE,
        uSize: TEX_SIZE / ATLAS_SIZE,
        vSize: TEX_SIZE / ATLAS_SIZE,
        pixelU: col * TEX_SIZE,
        pixelV: row * TEX_SIZE,
        pixelUSize: TEX_SIZE,
        pixelVSize: TEX_SIZE,
      };
    }

    return true;
  };

  /**
   * Register a texture image for a block.
   *
   * The image must already be loaded (e.g., from a canvas or Image element).
   * Unregistered blocks will use the blue placeholder color in the atlas.
   *
   * @param {number} blockId - Block ID (must be 0 ≤ id < 256).
   * @param {HTMLImageElement|HTMLCanvasElement} image - The image element containing the 16×16 texture.
   * @returns {boolean} True if registration succeeded, false otherwise.
   * @throws {TypeError} If blockId is not a non-negative integer or image is null/undefined.
   */
  Donkeycraft.TextureAtlas.prototype.registerBlockTexture = function (
    blockId,
    image
  ) {
    // Validate blockId
    if (!Number.isInteger(blockId) || blockId < 0) {
      Donkeycraft.Logger.warn(
        'TextureAtlas',
        'Invalid blockId for registerBlockTexture: ' +
          blockId +
          ' (must be non-negative integer)'
      );
      return false;
    }

    // Validate image
    if (!image) {
      Donkeycraft.Logger.warn(
        'TextureAtlas',
        'Null image for blockId ' + blockId + ' — skipping registration'
      );
      return false;
    }

    this._images[blockId] = image;
    return true;
  };

  /**
   * Register a texture by path (loads image asynchronously).
   *
   * If the image fails to load, the blockId is removed from the registry to prevent
   * stale references that would produce blank atlas tiles.
   *
   * @param {number} blockId - Block ID (must be 0 ≤ id < 256).
   * @param {string} imagePath - URL/path to the 16×16 texture image.
   * @param {Function} [onReady] — Optional callback invoked when atlas generation completes.
   * @returns {boolean} True if registration initiated successfully, false otherwise.
   * @throws {TypeError} If blockId is not a non-negative integer.
   */
  Donkeycraft.TextureAtlas.prototype.registerTexturePath = function (
    blockId,
    imagePath,
    onReady
  ) {
    // Validate blockId
    if (!Number.isInteger(blockId) || blockId < 0) {
      Donkeycraft.Logger.warn(
        'TextureAtlas',
        'Invalid blockId for registerTexturePath: ' + blockId
      );
      return false;
    }

    var self = this;
    var img = new Image();

    /**
     * Handle successful image load.
     * @private
     */
    img.onload = (function (id) {
      return function () {
        self._images[id] = img;
      };
    })(blockId);

    /**
     * Handle failed image load — remove stale reference to prevent blank atlas tiles.
     * @private
     */
    img.onerror = function () {
      Donkeycraft.Logger.warn(
        'TextureAtlas',
        'Failed to load texture: ' + imagePath
      );
      delete self._images[blockId];
    };

    img.src = imagePath;
    this._images[blockId] = img; // Temporary reference (removed on error)

    if (onReady) {
      this._onReadyCallback = onReady;
    }

    return true;
  };

  /**
   * Generate the atlas texture from registered images.
   *
   * Creates a 512×512 WebGL texture and uploads each 16×16 block image to its
   * correct grid position. UV coordinates are computed and stored for later lookup.
   *
   * Unregistered block IDs will show as blue placeholder pixels in the atlas.
   * Block IDs >= 1024 are skipped (don't fit in the 32×32 grid).
   *
   * @returns {boolean} True if atlas generation succeeded.
   */
  Donkeycraft.TextureAtlas.prototype.generate = function () {
    var gl = this._gl;
    if (!gl) {
      Donkeycraft.Logger.error('TextureAtlas', 'No WebGL context available');
      return false;
    }

    // Create and bind texture
    this._texture = gl.createTexture();
    if (!this._texture) {
      Donkeycraft.Logger.error(
        'TextureAtlas',
        'Failed to create WebGL texture object'
      );
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    /**
     * Create a blue placeholder array (512×512 atlas, RGBA format).
     * Each pixel: [0, 0, 255, 255] — fully opaque blue.
     * @type {Uint8Array}
     */
    var placeholder = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
    for (var i = 0; i < placeholder.length; i += 4) {
      placeholder[i] = 0; // R
      placeholder[i + 1] = 0; // G
      placeholder[i + 2] = 255; // B
      placeholder[i + 3] = 255; // A
    }

    // Upload placeholder texture (all blue)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      ATLAS_SIZE,
      ATLAS_SIZE,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      placeholder
    );

    // Temporary canvas for copying images before uploading to atlas.
    // willReadFrequently: true prevents Chrome warning about repeated getImageData calls.
    // Created once and reused for all block uploads.
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = TEX_SIZE;
    tempCanvas.height = TEX_SIZE;
    var tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

    // Get all registered blocks from the BlockRegistry
    var blocks = Donkeycraft.BlockRegistry
      ? Donkeycraft.BlockRegistry.getAllBlocks()
      : [];
    var blockCount = blocks.length;

    var _warnedIds = {};
    for (var b = 0; b < blockCount; b++) {
      var block = blocks[b];
      var id = block.id;

      // Skip block IDs that don't fit in the atlas grid
      if (id >= MAX_BLOCK_ID) {
        if (!_warnedIds[id]) {
          Donkeycraft.Logger.warn(
            'TextureAtlas',
            'Block ID ' + id + ' (' + block.name + ') exceeds atlas capacity (' + MAX_BLOCK_ID + ') — skipping'
          );
          _warnedIds[id] = true;
        }
        continue;
      }

      // Calculate atlas grid position: column and row
      var col = id % ATLAS_GRID;
      var row = Math.floor(id / ATLAS_GRID);

      // Pixel-space UV coordinates in the atlas
      var u = col * TEX_SIZE;
      var v = row * TEX_SIZE;

      // Store normalized UV coordinates (0-1 range).
      // texSubImage2D places row 0 at V=0, so no flip needed.
      var uv = u / ATLAS_SIZE;
      var vt = v / ATLAS_SIZE;
      this._uvMap[id] = {
        // Bottom-left UV corner of this tile in the atlas
        u: uv,
        v: vt,
        // Tile dimensions in normalized UV space
        uSize: TEX_SIZE / ATLAS_SIZE,
        vSize: TEX_SIZE / ATLAS_SIZE,
        // Pixel-space coordinates within the atlas texture
        pixelU: u,
        pixelV: v,
        pixelUSize: TEX_SIZE,
        pixelVSize: TEX_SIZE,
      };

      // Upload registered image to atlas at the correct grid position.
      // WebGL texSubImage2D places canvas row 0 at texture V=0 (bottom of tile).
      if (this._images[id]) {
        var img = this._images[id];
        tempCtx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        tempCtx.drawImage(img, 0, 0, TEX_SIZE, TEX_SIZE);

        var imgData = tempCtx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          u,
          v,
          TEX_SIZE,
          TEX_SIZE,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          imgData.data
        );
      }
    }

    // Set texture parameters for nearest-neighbor filtering (pixelated look)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Mipmapping disabled for crisp pixel-art textures (uncomment for smoother distant rendering)
    // gl.generateMipmap(gl.TEXTURE_2D);

    return true;
  };

  /**
   * Get normalized UV coordinates for a block.
   *
   * UVs are in the range [0, 1]. texSubImage2D places row 0 at V=0.
   * The returned object contains:
   *   - `u`, `v`: Bottom-left corner of the tile in normalized UV space
   *   - `uSize`, `vSize`: Tile dimensions (both equal 1/ATLAS_GRID = 0.0625 for a 16×16 atlas)
   *   - `pixelU`, `pixelV`, `pixelUSize`, `pixelVSize`: Pixel-space equivalents
   *
   * @param {number} blockId - Block ID (must be a non-negative integer).
   * @returns {{u: number, v: number, uSize: number, vSize: number, pixelU: number, pixelV: number, pixelUSize: number, pixelVSize: number}|null}
   *   UV coordinates object, or null if blockId is invalid or not registered.
   */
  Donkeycraft.TextureAtlas.prototype.getUVs = function (blockId) {
    // Validate blockId is a non-negative integer
    if (!Number.isInteger(blockId) || blockId < 0) {
      return null;
    }
    return this._uvMap[blockId] || null;
  };

  /**
   * Get pixel-space UV coordinates for a block.
   *
   * Pixel values are in the range [0, ATLAS_SIZE) representing actual texture pixels
   * within the atlas texture. For a 256×256 atlas with 16×16 tiles:
   *   - Block ID 0 → pixelU=0, pixelV=0 (top-left tile)
   *   - Block ID 15 → pixelU=240, pixelV=0 (top-right tile)
   *   - Block ID 16 → pixelU=0, pixelV=16 (second row, first tile)
   *
   * @param {number} blockId - Block ID (must be a non-negative integer).
   * @returns {{pixelU: number, pixelV: number, pixelUSize: number, pixelVSize: number}|null}
   *   Pixel-space UV coordinates with tile dimensions, or null if blockId is invalid/not found.
   */
  Donkeycraft.TextureAtlas.prototype.getPixelUVs = function (blockId) {
    var uv = this._uvMap[blockId];
    if (!uv) return null;
    return {
      pixelU: uv.pixelU,
      pixelV: uv.pixelV,
      pixelUSize: uv.pixelUSize,
      pixelVSize: uv.pixelVSize,
    };
  };

  /**
   * Bind the atlas as the active texture on unit 0.
   *
   * @returns {boolean} True if binding succeeded, false if atlas is not ready.
   */
  Donkeycraft.TextureAtlas.prototype.bind = function () {
    var gl = this._gl;
    if (!this._texture || !gl) return false;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    return true;
  };

  /**
   * Get the WebGL texture object.
   *
   * @returns {WebGLTexture|null} The texture object, or null if not yet generated or destroyed.
   */
  Donkeycraft.TextureAtlas.prototype.getTexture = function () {
    return this._texture;
  };

  /**
   * Check if the atlas has been generated and is ready for rendering.
   *
   * @returns {boolean} True if the WebGL texture exists and is valid.
   */
  Donkeycraft.TextureAtlas.prototype.isReady = function () {
    return this._texture !== null;
  };

  /**
   * Get the number of registered texture images.
   * Note: This counts registrations, not necessarily successfully loaded images.
   * Use getUVCount() for the number of UV entries actually computed during generate().
   *
   * @returns {number} Count of registered texture images (not necessarily loaded).
   */
  Donkeycraft.TextureAtlas.prototype.getTextureCount = function () {
    return Object.keys(this._images).length;
  };

  /**
   * Get the number of computed UV entries.
   *
   * @returns {number} Count of UV coordinate entries in the atlas map.
   */
  Donkeycraft.TextureAtlas.prototype.getUVCount = function () {
    return Object.keys(this._uvMap).length;
  };

  /**
   * Destroy the atlas and free WebGL resources.
   *
   * Deletes the WebGL texture and clears all image/UV references to prevent memory leaks.
   */
  Donkeycraft.TextureAtlas.prototype.destroy = function () {
    var gl = this._gl;
    if (this._texture && gl) {
      gl.deleteTexture(this._texture);
      this._texture = null;
    }
    this._images = {};
    this._uvMap = {};
  };

  // ============================================================
  // Static Helper: Get UV coordinates for a block ID
  // ============================================================

  /**
   * Get UV coordinates for a block ID using the standard atlas grid layout.
   * Returns null for out-of-range IDs (no fallback clamping to avoid silent texture misalignment).
   *
   * @param {number} blockId - Block ID (must be 0-1023).
   * @returns {{u0: number, v0: number, u1: number, v1: number}|null}
   */
  Donkeycraft.TextureAtlas.getBlockUV = function (blockId) {
    if (!Number.isInteger(blockId) || blockId < 0 || blockId >= MAX_BLOCK_ID) {
      return null;
    }
    var tileU = blockId % ATLAS_GRID;
    var tileV = Math.floor(blockId / ATLAS_GRID);
    return {
      u0: tileU / ATLAS_GRID,
      v0: tileV / ATLAS_GRID,
      u1: (tileU + 1) / ATLAS_GRID,
      v1: (tileV + 1) / ATLAS_GRID,
    };
  };

  // ============================================================
  // TextureAtlasBuilder — helper for creating atlas from paths
  // ============================================================

  /**
   * TextureAtlasBuilder — utility for building an atlas from texture path mappings.
   * @namespace
   */
  Donkeycraft.TextureAtlasBuilder = (function () {
    /**
     * Build a texture atlas by loading images from a base path pattern.
     *
     * @param {WebGLRenderingContext} gl - WebGL context.
     * @param {string} basePath - Base directory for textures (e.g., "./assets/textures/blocks/").
     * @param {Object.<number, string>} nameMap — blockId → texture filename (without extension).
     * @returns {Donkeycraft.TextureAtlas}
     */
    function buildFromPaths(gl, basePath, nameMap) {
      var atlas = new Donkeycraft.TextureAtlas(gl);

      var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
      for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var id = block.id;
        if (nameMap[id]) {
          atlas.registerTexturePath(id, basePath + nameMap[id] + '.png');
        } else {
          // Use block name as filename
          atlas.registerTexturePath(id, basePath + block.name + '.png');
        }
      }

      return atlas;
    }

    /**
     * Generate a procedural placeholder atlas for testing (no image files needed).
     *
     * Each block gets a unique color based on its ID using golden-angle HSL distribution.
     *
     * @param {WebGLRenderingContext} gl - WebGL context.
     * @returns {Donkeycraft.TextureAtlas}
     */
    function buildProcedural(gl) {
      var atlas = new Donkeycraft.TextureAtlas(gl);
      var tempCanvas = document.createElement('canvas');
      tempCanvas.width = TEX_SIZE;
      tempCanvas.height = TEX_SIZE;
      // willReadFrequently: true prevents Chrome warning during procedural atlas generation.
      var tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

      var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
      for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var id = block.id;

        // Generate a deterministic color from the block ID using golden angle distribution
        var hue = (id * 137.508) % 360; // Golden angle — maximizes color diversity
        var sat = 40 + (id % 40);
        var light = 25 + (id % 50);

        tempCtx.fillStyle = 'hsl(' + hue + ', ' + sat + '%, ' + light + '%)';
        tempCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

        // Add a border for visibility between tiles
        tempCtx.strokeStyle = 'rgba(0,0,0,0.3)';
        tempCtx.strokeRect(0, 0, TEX_SIZE - 1, TEX_SIZE - 1);

        // Register the canvas directly as the texture image (no Image/DataURL intermediate)
        atlas.registerBlockTexture(id, tempCanvas);

        // Clear canvas for next iteration
        tempCtx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
      }

      atlas.generate();
      return atlas;
    }

    return {
      buildFromPaths: buildFromPaths,
      buildProcedural: buildProcedural,
    };
  })();
})();
