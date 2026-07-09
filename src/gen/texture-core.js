// Donkeycraft — Texture Generator Core Infrastructure
// Shared cache, canvas helpers, and color definitions for all texture modules.
// Provides the foundational texture generation primitives used by texture-terrain.js,
// texture-blocks.js, texture-special.js, and texture-decorative.js.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var _gen = Donkeycraft._gen;

  // Cache noise utilities locally to avoid repeated namespace lookups.
  var _shufflePerm = _gen ? _gen._shufflePerm : null;
  var _noise2D = _gen ? _gen._noise2D : null;
  var _fbm = _gen ? _gen._fbm : null;
  var _seedRng = _gen ? _gen._seedRng : null;
  var _rng = _gen ? _gen._rng : null;

  // ============================================================
  // TextureGenerator — procedural 16×16 texture generation core
  // ============================================================

  /**
   * TextureGenerator — procedural 16×16 pixel texture generation core.
   * All texture modules (terrain, blocks, special, decorative) extend this base.
   * Provides shared infrastructure: canvas creation, texture caching with LRU eviction,
   * color definitions, and utility functions for converting between canvas and Image objects.
   */
  Donkeycraft.TextureGenerator = Donkeycraft.TextureGenerator || {};

  /**
   * Standard texture atlas cell size in pixels.
   * All generated textures are exactly TEX_SIZE × TEX_SIZE (16×16).
   * @type {number}
   */
  var TEX_SIZE = 16;

  /**
   * Internal cache for generated textures to avoid regeneration.
   * Keys are prefixed by generator name (e.g., "stone:42", "dirt:12345") to prevent collisions
   * between different generators that may use the same seed value.
   * Uses LRU-style eviction when the cache exceeds MAX_CACHE_SIZE entries.
   * @type {Object.<string, HTMLImageElement>}
   * @private
   */
  var _textureCache = {};

  /**
   * Ordered insertion list for LRU-style eviction tracking.
   * Keys stored here in order they were added/last accessed; oldest entries are removed first when cache is full.
   * On cache hit, the entry is moved to the end to simulate LRU behavior.
   * Initialized on first texture cache write via _cacheTexture().
   * @type {string[]|null}
   * @private
   */
  var _cacheInsertionOrder = null;

  /**
   * Maximum number of textures to cache before evicting oldest entries.
   * Set to 4096 to accommodate all block variants (16 colors × ~200 blocks) without premature eviction.
   * Uses LRU eviction — on cache hit, entry is promoted to most-recently-used end; oldest entry is evicted first when limit reached.
   * @type {number}
   * @private
   */
  var MAX_CACHE_SIZE = 4096;

  /**
   * Standard 16-color palette mapped to RGB values.
   * Used by wool, concrete, stained glass, beds, and other color-variant blocks.
   * Each entry maps a named color to its {r, g, b} component values (0–255).
   * @type {Object.<string, {r: number, g: number, b: number}>}
   */
  var COLOR_MAP = {
    white: { r: 240, g: 240, b: 240 },
    orange: { r: 234, g: 131, b: 36 },
    magenta: { r: 183, g: 71, b: 185 },
    light_blue: { r: 100, g: 198, b: 232 },
    yellow: { r: 240, g: 222, b: 64 },
    lime: { r: 125, g: 227, b: 56 },
    pink: { r: 239, g: 141, b: 177 },
    gray: { r: 101, g: 101, b: 101 },
    light_gray: { r: 177, g: 183, b: 191 },
    cyan: { r: 54, g: 162, b: 180 },
    purple: { r: 151, g: 81, b: 175 },
    blue: { r: 53, g: 96, b: 186 },
    brown: { r: 113, g: 84, b: 64 },
    green: { r: 87, g: 134, b: 63 },
    red: { r: 183, g: 52, b: 55 },
    black: { r: 33, g: 33, b: 33 },
  };

  /**
   * Create an offscreen HTMLCanvasElement of the specified dimensions.
   * Used by all texture generators as the drawing surface before conversion to Image.
   * @param {number} width - Canvas width in pixels.
   * @param {number} height - Canvas height in pixels.
   * @returns {HTMLCanvasElement} The created canvas element with a 2D context.
   * @private
   */
  function _createCanvas(width, height) {
    if (typeof document === 'undefined') {
      return null;
    }
    var c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }

  /**
   * Cache a generated texture by key with generator prefix to prevent collisions.
   * Implements LRU eviction: on cache hit, the entry is promoted to the end of the
   * insertion order array (most recently used). When the cache exceeds MAX_CACHE_SIZE,
   * the oldest entry (front of the array) is evicted.
   * @param {string} prefix - Generator prefix (e.g., "stone", "dirt") to namespace the cache key.
   * @param {string} key - Unique cache key within the prefix (often a seed value).
   * @param {HTMLImageElement} img - Generated image element to cache.
   * @returns {HTMLImageElement} The cached image element for immediate use.
   * @private
   */
  function _cacheTexture(prefix, key, img) {
    // Validate inputs
    if (!img || !(img instanceof HTMLImageElement)) {
      return null;
    }

    var fullKey = prefix + ':' + String(key);

    // Initialize insertion order tracking on first use
    if (_cacheInsertionOrder === null) {
      _cacheInsertionOrder = [];
    }

    // Handle cache hit: promote entry to end (most recently used) for LRU behavior
    if (_textureCache[fullKey]) {
      // Remove from current position
      var existingIndex = _cacheInsertionOrder.indexOf(fullKey);
      if (existingIndex !== -1) {
        _cacheInsertionOrder.splice(existingIndex, 1);
      }
      // Store the image (in case it was updated)
      _textureCache[fullKey] = img;
      // Move to end (most recently used)
      _cacheInsertionOrder.push(fullKey);
      return _textureCache[fullKey];
    }

    // Cache miss: evict oldest entries if cache exceeds max size
    while (_cacheInsertionOrder.length >= MAX_CACHE_SIZE) {
      var oldestKey = _cacheInsertionOrder.shift();
      if (oldestKey && _textureCache[oldestKey]) {
        delete _textureCache[oldestKey];
      }
    }

    // Store the image and record as most recently used
    _textureCache[fullKey] = img;
    _cacheInsertionOrder.push(fullKey);

    return _textureCache[fullKey];
  }

  /**
   * Clear the internal texture cache and insertion order tracking.
   * Call during game reset or shutdown to free memory and prevent stale textures.
   * After calling this, all subsequent texture requests will regenerate textures.
   */
  function clearTextureCache() {
    _textureCache = {};
    _cacheInsertionOrder = null;
  }

  /**
   * Convert a canvas element to an HTMLImageElement via data URL encoding.
   * Uses PNG format for lossless texture quality. Returns null if the canvas is invalid
   * or the browser environment does not support canvas operations.
   * @param {HTMLCanvasElement} canvas - Source canvas element to encode.
   * @returns {HTMLImageElement|null} The converted image element, or null on failure.
   * @private
   */
  function _canvasToImage(canvas) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      return null;
    }
    try {
      var img = new Image();
      img.src = canvas.toDataURL('image/png');
      return img;
    } catch (e) {
      // Tainted canvas or other toDataURL failure — return a fallback
      if (Donkeycraft.Logger) {
        Donkeycraft.Logger.warn(
          'TextureGenerator',
          'Canvas to Image conversion failed: ' + e.message
        );
      }
      return null;
    }
  }

  // ============================================================
  // Export shared infrastructure on the TextureGenerator object
  // ============================================================

  // _textureCache is exposed for cache-read checks (storage goes through _cacheTexture).
  Donkeycraft.TextureGenerator._textureCache = _textureCache;

  // _cacheInsertionOrder is exposed for debugging cache size: .length
  Donkeycraft.TextureGenerator._cacheInsertionOrder = _cacheInsertionOrder;

  // Public utility functions for use by other texture modules
  Donkeycraft.TextureGenerator._createCanvas = _createCanvas;
  Donkeycraft.TextureGenerator._cacheTexture = _cacheTexture;
  Donkeycraft.TextureGenerator.clearTextureCache = clearTextureCache;
  Donkeycraft.TextureGenerator._canvasToImage = _canvasToImage;

  // Color palette exposed for external use by texture generators
  Donkeycraft.TextureGenerator.COLOR_MAP = COLOR_MAP;

  // Texture size constant exposed for use by other modules
  Donkeycraft.TextureGenerator.TEX_SIZE = TEX_SIZE;
})();
