// Donkeycraft — Texture Generator Core Infrastructure
// Shared cache, canvas helpers, and color definitions for all texture modules.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var _gen = Donkeycraft._gen;

    // Cache noise utilities locally to avoid repeated namespace lookups.
    var _shufflePerm = _gen._shufflePerm;
    var _noise2D = _gen._noise2D;
    var _fbm = _gen._fbm;
    var _seedRng = _gen._seedRng;
    var _rng = _gen._rng;

    // ============================================================
    // TextureGenerator — procedural 16×16 texture generation core
    // ============================================================

    /**
     * TextureGenerator — generates 16×16 pixel textures procedurally.
     */
    Donkeycraft.TextureGenerator = Donkeycraft.TextureGenerator || {};

    var TEX_SIZE = 16;

    /**
     * Internal cache for generated textures to avoid regeneration.
     * Keys are prefixed by generator name to prevent collisions between
     * different generators that may share the same seed value.
     * @type {Object.<string, HTMLImageElement>}
     * @private
     */
    var _textureCache = {};

    /**
     * Maximum number of textures to cache (prevents unbounded memory growth).
     * @type {number}
     * @private
     */
    var MAX_CACHE_SIZE = 512;

    /**
     * Color definitions for block families.
     * Maps color names to RGB values used in texture generation.
     * @type {Object.<string, {r: number, g: number, b: number}>}
     */
    var COLOR_MAP = {
        white:      { r: 240, g: 240, b: 240 },
        orange:     { r: 234, g: 131, b: 36  },
        magenta:    { r: 183, g: 71,  b: 185 },
        light_blue: { r: 100, g: 198, b: 232 },
        yellow:     { r: 240, g: 222, b: 64  },
        lime:       { r: 125, g: 227, b: 56  },
        pink:       { r: 239, g: 141, b: 177 },
        gray:       { r: 101, g: 101, b: 101 },
        light_gray: { r: 177, g: 183, b: 191 },
        cyan:       { r: 54,  g: 162, b: 180 },
        purple:     { r: 151, g: 81,  b: 175 },
        blue:       { r: 53,  g: 96,  b: 186 },
        brown:      { r: 113, g: 84,  b: 64  },
        green:      { r: 87,  g: 134, b: 63  },
        red:        { r: 183, g: 52,  b: 55  },
        black:      { r: 33,  g: 33,  b: 33  }
    };

    /**
     * Create an offscreen canvas of given size.
     * @param {number} width
     * @param {number} height
     * @returns {HTMLCanvasElement}
     * @private
     */
    function _createCanvas(width, height) {
        var c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
    }

    /**
     * Cache a generated texture by key with generator prefix to prevent collisions.
     * @param {string} prefix - Generator prefix (e.g., "stone", "dirt").
     * @param {string} key - Unique cache key within the prefix.
     * @param {HTMLImageElement} img - Generated image.
     * @returns {HTMLImageElement}
     * @private
     */
    function _cacheTexture(prefix, key, img) {
        var fullKey = prefix + ':' + key;
        if (!_textureCache[fullKey]) {
            _textureCache[fullKey] = img;
            // Evict oldest entries if cache exceeds max size.
            var keys = Object.keys(_textureCache);
            if (keys.length > MAX_CACHE_SIZE) {
                delete _textureCache[keys[0]];
            }
        }
        return _textureCache[fullKey];
    }

    /**
     * clearTextureCache — clear the internal texture cache.
     * Call during game reset/shutdown to free memory.
     */
    function clearTextureCache() {
        _textureCache = {};
    }

    /**
     * Convert a canvas element to an Image element via data URL.
     * @param {HTMLCanvasElement} canvas - Source canvas.
     * @returns {HTMLImageElement}
     * @private
     */
    function _canvasToImage(canvas) {
        var img = new Image();
        img.src = canvas.toDataURL('image/png');
        return img;
    }

    // Export shared infrastructure on the TextureGenerator object.
    // _textureCache is exposed for cache-read checks (storage goes through _cacheTexture).
    Donkeycraft.TextureGenerator._textureCache = _textureCache;
    Donkeycraft.TextureGenerator._createCanvas = _createCanvas;
    Donkeycraft.TextureGenerator._cacheTexture = _cacheTexture;
    Donkeycraft.TextureGenerator.clearTextureCache = clearTextureCache;
    Donkeycraft.TextureGenerator._canvasToImage = _canvasToImage;
    Donkeycraft.TextureGenerator.COLOR_MAP = COLOR_MAP;

    // Export TEX_SIZE constant for use by other modules.
    Donkeycraft.TextureGenerator.TEX_SIZE = TEX_SIZE;

})();