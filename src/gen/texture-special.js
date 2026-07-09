// Donkeycraft — Special Textures
// Nether, End, glow, basalt, slime, honey, prismarine, and other special block textures.
// Provides procedural textures for dimension-specific and unique blocks.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var _gen = Donkeycraft._gen;

  // Cache noise utilities locally — guard against null if _gen is not yet initialized.
  var _shufflePerm = _gen && _gen._shufflePerm ? _gen._shufflePerm : null;
  var _noise2D = _gen && _gen._noise2D ? _gen._noise2D : null;
  var _fbm = _gen && _gen._fbm ? _gen._fbm : null;
  var _seedRng = _gen && _gen._seedRng ? _gen._seedRng : null;
  var _rng = _gen && _gen._rng ? _gen._rng : null;

  // Import shared infrastructure from texture-core.js.
  var _textureCache = Donkeycraft.TextureGenerator._textureCache;
  var _createCanvas = Donkeycraft.TextureGenerator._createCanvas || null;
  var _cacheTexture = Donkeycraft.TextureGenerator._cacheTexture || null;
  var _canvasToImage = Donkeycraft.TextureGenerator._canvasToImage || null;

  /**
   * Standard texture atlas cell size in pixels.
   * All generated textures are exactly 16×16 pixels.
   * @type {number}
   */
  var TEX_SIZE = 16;

  // ============================================================
  // Glow / Special Surface — luminous and indestructible blocks
  // ============================================================

  /**
   * Generate a glowing block texture with radial gradient and seeded noise.
   * Creates a bright center that fades outward, simulating emissive blocks like glowstone or crying obsidian.
   * @param {number} r - Base red value (0–255).
   * @param {number} g - Base green value (0–255).
   * @param {number} b - Base blue value (0–255).
   * @returns {HTMLImageElement|null} Generated 16×16 glow texture, or null on failure.
   */
  function generateGlow(r, g, b) {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(r + g + b);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var cx = x - 7.5;
        var cy = y - 7.5;
        var dist = Math.sqrt(cx * cx + cy * cy);
        var glow = Math.max(0, 1 - dist / 8);
        glow = glow * glow;
        var n = (_rng() - 0.5) * 30;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, r * glow + 60 + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, g * glow + 60 + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, b * glow + 80 + n));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a bedrock texture — dark gray with heavy noise variation.
   * Simulates the indestructible block found at world boundaries.
   * @returns {HTMLImageElement|null} Generated 16×16 bedrock texture, or null on failure.
   */
  function generateBedrock() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(42);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 40;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 50 + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 50 + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 50 + n));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Basalt Family — volcanic rock and polished variants
  // ============================================================

  /**
   * Generate a basalt texture with vertical grain pattern using FBM noise.
   * Creates a gray stone with subtle vertical striations characteristic of basalt columns.
   * @returns {HTMLImageElement|null} Generated 16×16 basalt texture, or null on failure.
   */
  function generateBasalt() {
    if (!_shufflePerm || !_fbm) {
      return null;
    }

    _shufflePerm(9999);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = _fbm(x * 0.12, y * 0.3, 4, 1.0, 1.0);
        var val = 70 + n * 25;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, val + 5));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, val));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, val - 3));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a polished block texture — smooth surface with minimal seeded noise.
   * Used for polished stone variants across all rock types.
   * @param {number} r - Base red value (0–255).
   * @param {number} g - Base green value (0–255).
   * @param {number} b - Base blue value (0–255).
   * @returns {HTMLImageElement|null} Generated 16×16 polished texture, or null on failure.
   */
  function generatePolished(r, g, b) {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(r + g + b);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 6;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, r + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, g + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, b + n));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a polished basalt texture — smooth dark stone with subtle noise.
   * @returns {HTMLImageElement|null} Generated 16×16 polished basalt texture, or null on failure.
   */
  function generatePolishedBasalt() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(42);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 8;
        var val = 75 + n;
        ctx.fillStyle = 'rgb(' + (val + 5) + ',' + val + ',' + (val - 3) + ')';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Slime / Honey — translucent gelatinous blocks
  // ============================================================

  /**
   * Generate a slime block texture with seeded noise and a subtle grid pattern.
   * Creates a semi-transparent green block with darker grid lines at 4-pixel intervals.
   * @param {number} r - Base red value (0–255).
   * @param {number} g - Base green value (0–255).
   * @param {number} b - Base blue value (0–255).
   * @returns {HTMLImageElement|null} Generated 16×16 slime texture, or null on failure.
   */
  function generateSlime(r, g, b) {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(r + g + b);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var isGrid = x % 4 === 0 || y % 4 === 0;
        var brightness = isGrid ? 0.7 : 1.0;
        var n = (_rng() - 0.5) * 10;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, r * brightness + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, g * brightness + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, b * brightness + n));
        imgData.data[idx + 3] = 200;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a honey block texture — golden translucent surface with noise variation.
   * @returns {HTMLImageElement|null} Generated 16×16 honey texture, or null on failure.
   */
  function generateHoney() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(42);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 10;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 230 + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 180 + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 50 + n));
        imgData.data[idx + 3] = 220;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Prismarine — ocean-themed stone variants
  // ============================================================

  /**
   * Generate a prismarine texture with three variants: normal, bricks, and dark.
   * @param {string} [variant='normal'] — One of "normal", "bricks", or "dark".
   * @returns {HTMLImageElement|null} Generated 16×16 prismarine texture, or null on failure.
   */
  function generatePrismarine(variant) {
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    if (variant === 'bricks') {
      // Brick pattern: gray-green base with lighter mortar lines
      ctx.fillStyle = '#557766';
      ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
      for (var row = 0; row < 4; row++) {
        var offset = (row % 2) * 4;
        for (var col = -4 + offset; col < TEX_SIZE; col += 8) {
          ctx.fillStyle = '#668877';
          ctx.fillRect(col + 1, row * 4 + 1, 6, 2);
        }
      }
    } else if (variant === 'dark') {
      // Dark prismarine: dark teal with noise
      if (!_seedRng || !_rng) return null;
      _seedRng(777);
      var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
      for (var y = 0; y < TEX_SIZE; y++) {
        for (var x = 0; x < TEX_SIZE; x++) {
          var n = (_rng() - 0.5) * 15;
          var idx = (y * TEX_SIZE + x) * 4;
          imgData.data[idx] = Math.max(0, Math.min(255, 55 + n));
          imgData.data[idx + 1] = Math.max(0, Math.min(255, 70 + n));
          imgData.data[idx + 2] = Math.max(0, Math.min(255, 65 + n));
          imgData.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } else {
      // Normal prismarine: medium teal-green with noise
      if (!_seedRng || !_rng) return null;
      _seedRng(42);
      var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
      for (var y = 0; y < TEX_SIZE; y++) {
        for (var x = 0; x < TEX_SIZE; x++) {
          var n = (_rng() - 0.5) * 15;
          var idx = (y * TEX_SIZE + x) * 4;
          imgData.data[idx] = Math.max(0, Math.min(255, 85 + n));
          imgData.data[idx + 1] = Math.max(0, Math.min(255, 110 + n));
          imgData.data[idx + 2] = Math.max(0, Math.min(255, 95 + n));
          imgData.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Nether Wood — warped and crimson stem/plank textures
  // ============================================================

  /**
   * Generate a warped stem texture — teal/green with vertical grain via FBM noise.
   * @returns {HTMLImageElement|null} Generated 16×16 warped stem texture, or null on failure.
   */
  function generateWarpedStem() {
    if (!_shufflePerm || !_fbm) {
      return null;
    }

    _shufflePerm(2222);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = _fbm(x * 0.08, y * 0.25, 3, 1.0, 1.0);
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 60 + n * 20));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 160 + n * 30));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 160 + n * 25));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a crimson stem texture — deep red with vertical grain via FBM noise.
   * @returns {HTMLImageElement|null} Generated 16×16 crimson stem texture, or null on failure.
   */
  function generateCrimsonStem() {
    if (!_shufflePerm || !_fbm) {
      return null;
    }

    _shufflePerm(3333);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = _fbm(x * 0.08, y * 0.25, 3, 1.0, 1.0);
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 160 + n * 25));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 50 + n * 15));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 50 + n * 10));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a nylium texture — netherrack base with colored growth patches.
   * @param {boolean} isWarped — Whether warped (blue-green) or crimson (red).
   * @returns {HTMLImageElement|null} Generated 16×16 nylium texture, or null on failure.
   */
  function generateNylium(isWarped) {
    if (!_shufflePerm || !_fbm || !_seedRng || !_rng) {
      return null;
    }

    _shufflePerm(isWarped ? 2222 : 3333);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 140 + n * 40));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 60 + n * 25));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 60 + n * 20));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    _seedRng(isWarped ? 2222 : 3333);
    var gr = isWarped ? 60 : 180;
    var gg = isWarped ? 170 : 50;
    var gb = isWarped ? 160 : 50;
    for (var i = 0; i < 10; i++) {
      ctx.fillStyle = 'rgb(' + gr + ',' + gg + ',' + gb + ')';
      ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
    }
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Blackstone Family — polished and brick variants
  // ============================================================

  /**
   * Generate a polished blackstone texture — smooth dark stone with subtle noise.
   * @returns {HTMLImageElement|null} Generated 16×16 polished blackstone texture, or null on failure.
   */
  function generatePolishedBlackstone() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(7777);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 8;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 35 + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 32 + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 36 + n));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Netherrack — the ubiquitous Nether stone
  // ============================================================

  /**
   * Generate a netherrack texture — red noise-based surface using FBM.
   * @returns {HTMLImageElement|null} Generated 16×16 netherrack texture, or null on failure.
   */
  function generateNetherrack() {
    if (!_shufflePerm || !_fbm) {
      return null;
    }

    _shufflePerm(6666);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = _fbm(x * 0.15, y * 0.15, 4, 1.0, 1.0);
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 140 + n * 40));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 60 + n * 25));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 60 + n * 20));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Nether Special Blocks — glowstone, magma, soul sand, etc.
  // ============================================================

  /**
   * Generate a glowstone texture — yellow base with seeded bright spots.
   * @returns {HTMLImageElement|null} Generated 16×16 glowstone texture, or null on failure.
   */
  function generateGlowstone() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(42);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#DDCC66';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (var i = 0; i < 12; i++) {
      ctx.fillStyle = 'rgba(255, 240, 150, 0.6)';
      ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
    }
    return _canvasToImage(canvas);
  }

  /**
   * Generate a shroomlight texture — deep red with seeded warm glow spots.
   * @returns {HTMLImageElement|null} Generated 16×16 shroomlight texture, or null on failure.
   */
  function generateShroomlight() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(42);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#CC3300';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (var i = 0; i < 10; i++) {
      ctx.fillStyle = 'rgba(255, 100, 50, 0.5)';
      ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
    }
    return _canvasToImage(canvas);
  }

  /**
   * Generate a magma block texture — brown base with red crack lines and orange glow.
   * @returns {HTMLImageElement|null} Generated 16×16 magma texture, or null on failure.
   */
  function generateMagma() {
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8B6040';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.fillStyle = '#CC4400';
    var cracks = [
      { x: 2, y: 3 },
      { x: 8, y: 2 },
      { x: 5, y: 8 },
      { x: 11, y: 10 },
      { x: 3, y: 13 },
    ];
    for (var i = 0; i < cracks.length; i++) {
      ctx.fillRect(cracks[i].x, cracks[i].y, 3, 2);
    }
    ctx.fillStyle = '#FF6622';
    ctx.fillRect(3, 4, 2, 1);
    ctx.fillRect(9, 3, 2, 1);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a soul sand texture — dark gray with seeded noise variation.
   * @returns {HTMLImageElement|null} Generated 16×16 soul sand texture, or null on failure.
   */
  function generateSoulSand() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(42);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 30;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 70 + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 60 + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 55 + n));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a soul soil texture — darker than soul sand with subtle noise.
   * @returns {HTMLImageElement|null} Generated 16×16 soul soil texture, or null on failure.
   */
  function generateSoulSoil() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(42);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 20;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 55 + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 45 + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 50 + n));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate an ancient debris texture — netherrack base with gold-colored ore patches.
   * @returns {HTMLImageElement|null} Generated 16×16 ancient debris texture, or null on failure.
   */
  function generateAncientDebris() {
    if (!_shufflePerm || !_fbm) {
      return null;
    }

    _shufflePerm(8888);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 140 + n * 40));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 60 + n * 25));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 60 + n * 20));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    var debrisPositions = [
      { x: 6, y: 5 },
      { x: 9, y: 8 },
      { x: 7, y: 11 },
    ];
    for (var i = 0; i < debrisPositions.length; i++) {
      ctx.fillStyle = '#BB8844';
      ctx.fillRect(debrisPositions[i].x, debrisPositions[i].y, 2, 2);
    }
    return _canvasToImage(canvas);
  }

  /**
   * Generate a gilded blackstone texture — dark base with gold speckles.
   * @returns {HTMLImageElement|null} Generated 16×16 gilded blackstone texture, or null on failure.
   */
  function generateGildedBlackstone() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(7777);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 10;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 35 + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 32 + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 36 + n));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    for (var i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(200, 170, 50, 0.7)';
      ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
    }
    return _canvasToImage(canvas);
  }

  // ============================================================
  // End Blocks — purpur, end stone, and related textures
  // ============================================================

  /**
   * Generate an end stone texture — yellowish with seeded noise variation.
   * @returns {HTMLImageElement|null} Generated 16×16 end stone texture, or null on failure.
   */
  function generateEndStone() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(777);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (var y = 0; y < TEX_SIZE; y++) {
      for (var x = 0; x < TEX_SIZE; x++) {
        var n = (_rng() - 0.5) * 20;
        var idx = (y * TEX_SIZE + x) * 4;
        imgData.data[idx] = Math.max(0, Math.min(255, 200 + n));
        imgData.data[idx + 1] = Math.max(0, Math.min(255, 190 + n));
        imgData.data[idx + 2] = Math.max(0, Math.min(255, 140 + n));
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return _canvasToImage(canvas);
  }

  /**
   * Generate a purpur block texture — purple with vertical seam lines.
   * @returns {HTMLImageElement|null} Generated 16×16 purpur block texture, or null on failure.
   */
  function generatePurpurBlock() {
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#AA77C0';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.strokeStyle = '#9966B0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(5, TEX_SIZE);
    ctx.moveTo(11, 0);
    ctx.lineTo(11, TEX_SIZE);
    ctx.stroke();
    return _canvasToImage(canvas);
  }

  /**
   * Generate a purpur pillar texture — purple with alternating horizontal stripes.
   * @returns {HTMLImageElement|null} Generated 16×16 purpur pillar texture, or null on failure.
   */
  function generatePurpurPillar() {
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    for (var y = 0; y < TEX_SIZE; y++) {
      ctx.fillStyle = y % 4 < 2 ? '#AA77C0' : '#9966B0';
      ctx.fillRect(0, y, TEX_SIZE, 1);
    }
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Hay Bale — agricultural block with horizontal line pattern
  // ============================================================

  /**
   * Generate a hay bale texture — golden yellow with seeded horizontal line wobble.
   * @returns {HTMLImageElement|null} Generated 16×16 hay bale texture, or null on failure.
   */
  function generateHayBale() {
    if (!_seedRng || !_rng) {
      return null;
    }

    _seedRng(42);
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#C8B050';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.strokeStyle = '#A89040';
    ctx.lineWidth = 1;
    for (var y = 2; y < TEX_SIZE; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(TEX_SIZE, y + (_rng() - 0.5));
      ctx.stroke();
    }
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Nether Brick Variants — standard and red nether bricks
  // ============================================================

  /**
   * Generate a nether brick texture — dark red running bond pattern.
   * @returns {HTMLImageElement|null} Generated 16×16 nether brick texture, or null on failure.
   */
  function generateNetherBrick() {
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#442222';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (var row = 0; row < 4; row++) {
      var offset = (row % 2) * 4;
      for (var col = -4 + offset; col < TEX_SIZE; col += 8) {
        ctx.fillStyle = '#553333';
        ctx.fillRect(col + 1, row * 4 + 1, 6, 2);
      }
    }
    return _canvasToImage(canvas);
  }

  /**
   * Generate a red nether brick texture — brighter red running bond pattern.
   * @returns {HTMLImageElement|null} Generated 16×16 red nether brick texture, or null on failure.
   */
  function generateRedNetherBrick() {
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#883333';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (var row = 0; row < 4; row++) {
      var offset = (row % 2) * 4;
      for (var col = -4 + offset; col < TEX_SIZE; col += 8) {
        ctx.fillStyle = '#994444';
        ctx.fillRect(col + 1, row * 4 + 1, 6, 2);
      }
    }
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Mossy Stone Brick — moss-covered stone brick variant
  // ============================================================

  /**
   * Generate a mossy stone brick texture — gray bricks with green moss patches.
   * @returns {HTMLImageElement|null} Generated 16×16 mossy stone brick texture, or null on failure.
   */
  function generateMossyStoneBrick() {
    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
    if (!canvas) return null;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#889988';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.fillStyle = '#557744';
    var mosses = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 0, y: 8 },
      { x: 10, y: 10 },
    ];
    for (var i = 0; i < mosses.length; i++) {
      ctx.fillRect(mosses[i].x, mosses[i].y, 4, 4);
    }
    ctx.strokeStyle = '#667766';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(TEX_SIZE, 8);
    ctx.moveTo(8, 0);
    ctx.lineTo(8, TEX_SIZE);
    ctx.stroke();
    return _canvasToImage(canvas);
  }

  // ============================================================
  // Export all special texture generators on TextureGenerator
  // ============================================================

  Donkeycraft.TextureGenerator.generateGlow = generateGlow;
  Donkeycraft.TextureGenerator.generateBedrock = generateBedrock;
  Donkeycraft.TextureGenerator.generateBasalt = generateBasalt;
  Donkeycraft.TextureGenerator.generatePolished = generatePolished;
  Donkeycraft.TextureGenerator.generatePolishedBasalt = generatePolishedBasalt;
  Donkeycraft.TextureGenerator.generateSlime = generateSlime;
  Donkeycraft.TextureGenerator.generateHoney = generateHoney;
  Donkeycraft.TextureGenerator.generatePolishedBlackstone =
    generatePolishedBlackstone;
  Donkeycraft.TextureGenerator.generatePrismarine = generatePrismarine;
  Donkeycraft.TextureGenerator.generateWarpedStem = generateWarpedStem;
  Donkeycraft.TextureGenerator.generateCrimsonStem = generateCrimsonStem;
  Donkeycraft.TextureGenerator.generateNylium = generateNylium;
  Donkeycraft.TextureGenerator.generateGlowstone = generateGlowstone;
  Donkeycraft.TextureGenerator.generateShroomlight = generateShroomlight;
  Donkeycraft.TextureGenerator.generateMagma = generateMagma;
  Donkeycraft.TextureGenerator.generateSoulSand = generateSoulSand;
  Donkeycraft.TextureGenerator.generateSoulSoil = generateSoulSoil;
  Donkeycraft.TextureGenerator.generateAncientDebris = generateAncientDebris;
  Donkeycraft.TextureGenerator.generateGildedBlackstone =
    generateGildedBlackstone;
  Donkeycraft.TextureGenerator.generateEndStone = generateEndStone;
  Donkeycraft.TextureGenerator.generateNetherrack = generateNetherrack;
  Donkeycraft.TextureGenerator.generatePurpurBlock = generatePurpurBlock;
  Donkeycraft.TextureGenerator.generatePurpurPillar = generatePurpurPillar;
  Donkeycraft.TextureGenerator.generateHayBale = generateHayBale;
  Donkeycraft.TextureGenerator.generateNetherBrick = generateNetherBrick;
  Donkeycraft.TextureGenerator.generateRedNetherBrick = generateRedNetherBrick;
  Donkeycraft.TextureGenerator.generateMossyStoneBrick =
    generateMossyStoneBrick;
})();
