// Donkeycraft — Terrain Textures
// Stone, dirt, grass, wood, wool, concrete, sand, terracotta, sandstone, sponge, and related terrain blocks.
// Extends the shared TextureGenerator infrastructure with terrain-specific procedural textures.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var _gen = Donkeycraft._gen;

    // Cache noise utilities locally — guard against null if _gen is not yet initialized.
    var _shufflePerm = (_gen && _gen._shufflePerm) ? _gen._shufflePerm : null;
    var _noise2D = (_gen && _gen._noise2D) ? _gen._noise2D : null;
    var _fbm = (_gen && _gen._fbm) ? _gen._fbm : null;
    var _seedRng = (_gen && _gen._seedRng) ? _gen._seedRng : null;
    var _rng = (_gen && _gen._rng) ? _gen._rng : null;

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
    // Stone Family — stone variants, dirt, grass, gravel
    // ============================================================

    /**
     * Generate a stone texture with Perlin noise variation.
     * Produces a subtle gray-blue surface with fractal Brownian motion for natural-looking stone grain.
     * Cached with the seed as key to avoid regeneration on repeated calls.
     * @param {number} [seed=42] - Deterministic seed for noise generation.
     * @returns {HTMLImageElement|null} Generated 16×16 stone texture, or null on failure.
     */
    function generateStone(seed) {
        var s = seed || 42;
        var cacheKey = 'stone:' + String(s);

        // Return cached result if available
        if (_cacheTexture && _textureCache[cacheKey]) {
            return _textureCache[cacheKey];
        }

        // Guard: need shufflePerm and fbm for noise generation
        if (!_shufflePerm || !_fbm) {
            return null;
        }

        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 4, 1.0, 1.0);
                var base = 120 + n * 30;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = base;
                imgData.data[idx + 1] = base;
                imgData.data[idx + 2] = Math.min(255, base + 5);
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture ? _cacheTexture('stone', String(s), result) : result;
    }

    /**
     * Generate a dirt texture with fractal noise variation.
     * Produces warm brown earth tones with subtle color variation for natural-looking soil.
     * @param {number} [seed=12345] - Deterministic seed for noise generation.
     * @returns {HTMLImageElement|null} Generated 16×16 dirt texture, or null on failure.
     */
    function generateDirt(seed) {
        var s = seed || 12345;
        var cacheKey = 'dirt:' + String(s);

        if (_cacheTexture && _textureCache[cacheKey]) {
            return _textureCache[cacheKey];
        }

        if (!_shufflePerm || !_fbm) {
            return null;
        }

        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.12, y * 0.12, 3, 1.0, 1.0);
                var r = 134 + n * 25;
                var g = 96 + n * 20;
                var b = 60 + n * 15;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture ? _cacheTexture('dirt', String(s), result) : result;
    }

    /**
     * Generate grass block top texture — vibrant green with noise variation.
     * Cached with a fixed key to avoid regeneration on repeated calls.
     * @returns {HTMLImageElement|null} Generated 16×16 grass top texture, or null on failure.
     */
    function generateGrassTop() {
        if (_cacheTexture && _textureCache['grass_top:default']) {
            return _textureCache['grass_top:default'];
        }

        if (!_shufflePerm || !_fbm) {
            return null;
        }

        _shufflePerm(54321);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 4, 1.0, 1.0);
                var r = 76 + n * 20;
                var g = 160 + n * 30;
                var b = 40 + n * 15;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture ? _cacheTexture('grass_top', 'default', result) : result;
    }

    /**
     * Generate grass block side texture — grass top layer (3px), dirt drips (2px), and dirt body (rest).
     * The drip zone uses 2D noise to create irregular grass-over-dirt edges for visual realism.
     * @returns {HTMLImageElement|null} Generated 16×16 grass side texture, or null on failure.
     */
    function generateGrassSide() {
        if (_cacheTexture && _textureCache['grass_side:default']) {
            return _textureCache['grass_side:default'];
        }

        if (!_shufflePerm || !_fbm || !_noise2D) {
            return null;
        }

        _shufflePerm(54321);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var r, g, b;
                if (y < 3) {
                    // Top 3 rows: grass top texture
                    var n = _fbm(x * 0.2, y * 0.2, 3, 1.0, 1.0);
                    r = 76 + n * 20;
                    g = 160 + n * 30;
                    b = 40 + n * 15;
                } else if (y < 5) {
                    // Rows 3-4: drip zone — mix of grass drips and dirt
                    var drip = _noise2D(x * 0.3, y * 0.5);
                    if (drip > 0.2) {
                        var dripNoise = _noise2D(x * 0.7 + 100, y * 0.7 + 100);
                        r = 76 + (dripNoise + 1) * 5;
                        g = 140 + (dripNoise + 1) * 10;
                        b = 40;
                    } else {
                        r = 134; g = 96; b = 60;
                    }
                } else {
                    // Bottom 11 rows: dirt body
                    var n = _fbm(x * 0.12, y * 0.12, 3, 1.0, 1.0);
                    r = 134 + n * 25;
                    g = 96 + n * 20;
                    b = 60 + n * 15;
                }
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture ? _cacheTexture('grass_side', 'default', result) : result;
    }

    // ============================================================
    // Wood Family — logs, planks, bark
    // ============================================================

    /**
     * Generate a log side (bark) texture with vertical grain pattern.
     * Uses FBM noise to create realistic wood bark striations.
     * @param {number} [seed=777] - Deterministic seed for noise generation.
     * @returns {HTMLImageElement|null} Generated 16×16 log side texture, or null on failure.
     */
    function generateLogSide(seed) {
        var s = seed || 777;

        if (!_shufflePerm || !_fbm) {
            return null;
        }

        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.08, y * 0.25, 3, 1.0, 1.0);
                var r = 90 + n * 20;
                var g = 65 + n * 15;
                var b = 40 + n * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a log top (growth rings) texture with seeded noise overlay.
     * Draws concentric ring circles on a brown base, then adds subtle noise for organic variation.
     * @param {number} [seed=888] - Deterministic seed for noise generation.
     * @returns {HTMLImageElement|null} Generated 16×16 log top texture, or null on failure.
     */
    function generateLogTop(seed) {
        var s = seed || 888;
        var cacheKey = 'log_top:' + String(s);

        if (_cacheTexture && _textureCache[cacheKey]) {
            return _textureCache[cacheKey];
        }

        if (!_shufflePerm || !_noise2D) {
            return null;
        }

        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (var ring = 2; ring <= 8; ring += 2) {
            ctx.strokeStyle = ring % 4 === 0 ? '#6B5335' : '#A0896B';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(8, 8, ring, 0, Math.PI * 2);
            ctx.stroke();
        }
        var imgData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < imgData.data.length; i += 4) {
            var px = (i / 4) % TEX_SIZE;
            var py = Math.floor((i / 4) / TEX_SIZE);
            var noise = _noise2D(px * 0.5 + s, py * 0.5 + s) * 15;
            imgData.data[i]     = Math.max(0, Math.min(255, imgData.data[i] + noise));
            imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + noise));
            imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture ? _cacheTexture('log_top', String(s), result) : result;
    }

    /**
     * Generate a wood texture (bark all sides) with noise variation.
     * Similar to log side but uses isotropic noise for a more uniform bark appearance.
     * @param {number} [seed=999] - Deterministic seed for noise generation.
     * @returns {HTMLImageElement|null} Generated 16×16 wood texture, or null on failure.
     */
    function generateWood(seed) {
        var s = seed || 999;

        if (!_shufflePerm || !_fbm) {
            return null;
        }

        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
                var r = 120 + n * 20;
                var g = 95 + n * 15;
                var b = 60 + n * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a plank texture with vertical plank seam lines.
     * Divides the 16×16 surface into 4px-wide vertical strips with subtle color variation per plank.
     * @param {number} r - Base red value (0–255).
     * @param {number} g - Base green value (0–255).
     * @param {number} b - Base blue value (0–255).
     * @param {number} [seed=111] - Deterministic seed for noise generation.
     * @returns {HTMLImageElement|null} Generated 16×16 plank texture, or null on failure.
     */
    function generatePlanks(r, g, b, seed) {
        var s = seed || 111;

        if (!_shufflePerm || !_fbm) {
            return null;
        }

        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        for (var py = 0; py < TEX_SIZE; py++) {
            for (var px = 0; px < TEX_SIZE; px++) {
                var plankX = px % 4;
                var n = _fbm(px * 0.1, py * 0.1, 2, 1.0, 1.0);
                var variation = plankX === 0 ? -10 : 0; // Darker at plank seams
                var cr = Math.max(0, Math.min(255, r + variation + n * 10));
                var cg = Math.max(0, Math.min(255, g + variation + n * 8));
                var cb = Math.max(0, Math.min(255, b + variation + n * 6));
                ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
                ctx.fillRect(px, py, 1, 1);
            }
        }
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Fabric / Wool — woven fabric texture with color variants
    // ============================================================

    /**
     * Generate a colored wool/fabric texture with seeded noise and a subtle woven pattern.
     * Alternating rows have a slight brightness shift to simulate thread interlacing.
     * @param {number} r - Base red value (0–255).
     * @param {number} g - Base green value (0–255).
     * @param {number} b - Base blue value (0–255).
     * @returns {HTMLImageElement|null} Generated 16×16 wool texture, or null on failure.
     */
    function generateWool(r, g, b) {
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
                var n = (_rng() - 0.5) * 20;
                var weave = (y % 2 === 0) ? 3 : -3; // Subtle row-based brightness shift
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r + n + weave));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g + n + weave));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b + n + weave));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Concrete / Powder — smooth and rough colored surfaces
    // ============================================================

    /**
     * Generate a concrete texture (smooth colored surface) with minimal seeded noise.
     * Concrete has very subtle variation for a polished, uniform appearance.
     * @param {number} r - Base red value (0–255).
     * @param {number} g - Base green value (0–255).
     * @param {number} b - Base blue value (0–255).
     * @returns {HTMLImageElement|null} Generated 16×16 concrete texture, or null on failure.
     */
    function generateConcrete(r, g, b) {
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
                var n = (_rng() - 0.5) * 8; // Minimal noise for smoothness
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a concrete powder texture — same as concrete but with rougher noise variation.
     * @param {number} r - Base red value (0–255).
     * @param {number} g - Base green value (0–255).
     * @param {number} b - Base blue value (0–255).
     * @returns {HTMLImageElement|null} Generated 16×16 concrete powder texture, or null on failure.
     */
    function generateConcretePowder(r, g, b) {
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
                var n = (_rng() - 0.5) * 18; // More noise than concrete for roughness
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Sand / Snow — granular and powdery surfaces
    // ============================================================

    /**
     * Generate a sand texture with seeded noise variation.
     * @param {number} r - Base red value (0–255).
     * @param {number} g - Base green value (0–255).
     * @param {number} b - Base blue value (0–255).
     * @returns {HTMLImageElement|null} Generated 16×16 sand texture, or null on failure.
     */
    function generateSand(r, g, b) {
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
                var n = (_rng() - 0.5) * 25;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a snow texture — white with slight blue tint and subtle noise variation.
     * Used for snow layers and snow blocks. Has organic-looking noise for natural appearance.
     * @returns {HTMLImageElement|null} Generated 16×16 snow texture, or null on failure.
     */
    function generateSnow() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(0);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 245 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 248 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 255));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a solid snow block texture — uniform white with minimal noise.
     * Distinct from snow layer: fully opaque and visually consistent across the entire block.
     * @returns {HTMLImageElement|null} Generated 16×16 snow block texture, or null on failure.
     */
    function generateSnowBlock() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(0);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 6; // Very minimal noise for uniformity
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 248 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 250 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 255));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Terracotta — fired clay with subtle noise
    // ============================================================

    /**
     * Generate a terracotta texture with seeded noise variation.
     * @param {number} r - Base red value (0–255).
     * @param {number} g - Base green value (0–255).
     * @param {number} b - Base blue value (0–255).
     * @returns {HTMLImageElement|null} Generated 16×16 terracotta texture, or null on failure.
     */
    function generateTerracotta(r, g, b) {
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
                var n = (_rng() - 0.5) * 12;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Sandstone — layered sedimentary rock texture
    // ============================================================

    /**
     * Generate a sandstone texture with seeded noise and horizontal layering effect.
     * Creates alternating light/dark bands to simulate geological strata.
     * @returns {HTMLImageElement|null} Generated 16×16 sandstone texture, or null on failure.
     */
    function generateSandstone() {
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
                var n = (_rng() - 0.5) * 15;
                var layerEffect = (y % 4 < 2) ? 5 : 0; // Alternating light/dark bands
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 210 + n + layerEffect));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 195 + n + layerEffect));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 150 + n + layerEffect));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a chiseled sandstone texture — plain sandstone with carved inset rectangles.
     * @returns {HTMLImageElement|null} Generated 16×16 chiseled sandstone texture, or null on failure.
     */
    function generateChiseledSandstone() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#D4C496';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.strokeStyle = '#B4A476';
        ctx.lineWidth = 1;
        ctx.strokeRect(2, 2, 12, 12);
        ctx.strokeRect(4, 4, 8, 8);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a cut sandstone texture — plain sandstone with a horizontal seam line.
     * @returns {HTMLImageElement|null} Generated 16×16 cut sandstone texture, or null on failure.
     */
    function generateCutSandstone() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#D4C496';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.strokeStyle = '#B4A476';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 8); ctx.lineTo(TEX_SIZE, 8);
        ctx.stroke();
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Coral & Sponge — organic block textures
    // ============================================================

    /**
     * Generate a coral block texture with seeded noise variation.
     * @param {string} [color='purple'] - Coral color name: "dead", "purple", "blue", "orange", "pink".
     * @returns {HTMLImageElement|null} Generated 16×16 coral block texture, or null on failure.
     */
    function generateCoralBlock(color) {
        if (!_seedRng || !_rng) {
            return null;
        }

        var colors = {
            dead: '#888888', purple: '#AA66AA', blue: '#6666AA',
            orange: '#DD8844', pink: '#EE88AA'
        };
        var c = colors[color] || '#AA66AA';
        var r = parseInt(c.slice(1, 3), 16);
        var g = parseInt(c.slice(3, 5), 16);
        var b = parseInt(c.slice(5, 7), 16);

        _seedRng(r + g + b);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 20;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a sponge texture with seeded dark spot "holes" on a yellow base.
     * @returns {HTMLImageElement|null} Generated 16×16 sponge texture, or null on failure.
     */
    function generateSponge() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#DDAA33';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < 15; i++) {
            ctx.fillStyle = 'rgba(180, 140, 20, 0.6)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

    /**
     * Generate a wet sponge texture — darker green with seeded hole pattern.
     * @returns {HTMLImageElement|null} Generated 16×16 wet sponge texture, or null on failure.
     */
    function generateWetSponge() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#668844';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < 15; i++) {
            ctx.fillStyle = 'rgba(50, 70, 30, 0.6)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Smooth & Polished Stone Variants
    // ============================================================

    /**
     * Generate a smooth stone texture — light gray with minimal noise.
     * @returns {HTMLImageElement|null} Generated 16×16 smooth stone texture, or null on failure.
     */
    function generateSmoothStone() {
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
                var n = (_rng() - 0.5) * 6;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 190 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 185 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 175 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a polished granite texture — pinkish-gray with seeded noise.
     * @returns {HTMLImageElement|null} Generated 16×16 polished granite texture, or null on failure.
     */
    function generatePolishedGranite() {
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
                imgData.data[idx]     = Math.max(0, Math.min(255, 170 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 130 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 120 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a polished diorite texture — light gray-white with seeded noise.
     * @returns {HTMLImageElement|null} Generated 16×16 polished diorite texture, or null on failure.
     */
    function generatePolishedDiorite() {
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
                imgData.data[idx]     = Math.max(0, Math.min(255, 200 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 195 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 190 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a polished andesite texture — medium gray with seeded noise.
     * @returns {HTMLImageElement|null} Generated 16×16 polished andesite texture, or null on failure.
     */
    function generatePolishedAndesite() {
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
                imgData.data[idx]     = Math.max(0, Math.min(255, 130 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 135 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 140 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Export all terrain texture generators on TextureGenerator
    // ============================================================

    // Stone family
    Donkeycraft.TextureGenerator.generateStone = generateStone;
    Donkeycraft.TextureGenerator.generateDirt = generateDirt;
    Donkeycraft.TextureGenerator.generateGrassTop = generateGrassTop;
    Donkeycraft.TextureGenerator.generateGrassSide = generateGrassSide;

    // Wood family
    Donkeycraft.TextureGenerator.generateLogSide = generateLogSide;
    Donkeycraft.TextureGenerator.generateLogTop = generateLogTop;
    Donkeycraft.TextureGenerator.generateWood = generateWood;
    Donkeycraft.TextureGenerator.generatePlanks = generatePlanks;

    // Fabric / Concrete / Sand
    Donkeycraft.TextureGenerator.generateWool = generateWool;
    Donkeycraft.TextureGenerator.generateConcrete = generateConcrete;
    Donkeycraft.TextureGenerator.generateConcretePowder = generateConcretePowder;
    Donkeycraft.TextureGenerator.generateSand = generateSand;
    Donkeycraft.TextureGenerator.generateSnow = generateSnow;
    Donkeycraft.TextureGenerator.generateSnowBlock = generateSnowBlock;
    Donkeycraft.TextureGenerator.generateTerracotta = generateTerracotta;

    // Sandstone variants
    Donkeycraft.TextureGenerator.generateSandstone = generateSandstone;
    Donkeycraft.TextureGenerator.generateChiseledSandstone = generateChiseledSandstone;
    Donkeycraft.TextureGenerator.generateCutSandstone = generateCutSandstone;

    // Coral & Sponge
    Donkeycraft.TextureGenerator.generateCoralBlock = generateCoralBlock;
    Donkeycraft.TextureGenerator.generateSponge = generateSponge;
    Donkeycraft.TextureGenerator.generateWetSponge = generateWetSponge;

    // Smooth & Polished variants
    Donkeycraft.TextureGenerator.generateSmoothStone = generateSmoothStone;
    Donkeycraft.TextureGenerator.generatePolishedGranite = generatePolishedGranite;
    Donkeycraft.TextureGenerator.generatePolishedDiorite = generatePolishedDiorite;
    Donkeycraft.TextureGenerator.generatePolishedAndesite = generatePolishedAndesite;

    // Aliases for cross-module use
    /** @type {Function} */
    Donkeycraft.TextureGenerator.generateRedSand = function() { return generateSand(183, 105, 63); };
    Donkeycraft.TextureGenerator.generateSnowBlock = generateSnowBlock;
    /** @type {Function} */
    Donkeycraft.TextureGenerator.generateGrass = function() { return generateGrassTop(); };

})();
