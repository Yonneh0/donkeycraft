// Donkeycraft — Terrain Textures
// Stone, dirt, grass, wood, wool, concrete, sand, and related terrain blocks.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var _gen = Donkeycraft._gen;

    // Cache noise utilities locally.
    var _shufflePerm = _gen._shufflePerm;
    var _noise2D = _gen._noise2D;
    var _fbm = _gen._fbm;
    var _seedRng = _gen._seedRng;
    var _rng = _gen._rng;

    // Import shared infrastructure from texture-core.js.
    var _textureCache = Donkeycraft.TextureGenerator._textureCache;
    var _createCanvas = Donkeycraft.TextureGenerator._createCanvas;
    var _cacheTexture = Donkeycraft.TextureGenerator._cacheTexture;
    var _canvasToImage = Donkeycraft.TextureGenerator._canvasToImage;
    var TEX_SIZE = 16;

    // ---- Stone family ----

    /**
     * Generate a stone texture with noise variation.
     * @param {number} seed
     * @returns {HTMLImageElement}
     */
    function generateStone(seed) {
        var s = seed || 42;
        if (_cacheTexture['stone:' + String(s)]) return _cacheTexture['stone:' + String(s)];
        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 4, 1.0, 1.0);
                var base = 120 + n * 30;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = base;
                imgData.data[idx + 1] = base;
                imgData.data[idx + 2] = base + 5;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture('stone', String(s), result);
    }

    /**
     * Generate a dirt texture with noise variation.
     * @param {number} [seed=12345] - Optional seed for deterministic generation.
     * @returns {HTMLImageElement}
     */
    function generateDirt(seed) {
        var s = seed || 12345;
        if (_cacheTexture['dirt:' + String(s)]) return _cacheTexture['dirt:' + String(s)];
        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.12, y * 0.12, 3, 1.0, 1.0);
                var r = 134 + n * 25;
                var g = 96 + n * 20;
                var b = 60 + n * 15;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = r;
                imgData.data[idx + 1] = g;
                imgData.data[idx + 2] = b;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture('dirt', String(s), result);
    }

    /**
     * Generate grass block top texture (green with noise).
     * Cached with a fixed key to avoid regeneration on repeated calls.
     * @returns {HTMLImageElement}
     */
    function generateGrassTop() {
        if (_cacheTexture['grass_top:default']) return _cacheTexture['grass_top:default'];
        _shufflePerm(54321);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 4, 1.0, 1.0);
                var r = 76 + n * 20;
                var g = 160 + n * 30;
                var b = 40 + n * 15;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = r;
                imgData.data[idx + 1] = g;
                imgData.data[idx + 2] = b;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture('grass_top', 'default', result);
    }

    /**
     * Generate grass block side texture (grass top + dirt bottom with drips).
     * @returns {HTMLImageElement}
     */
    function generateGrassSide() {
        if (_cacheTexture['grass_side']) return _cacheTexture['grass_side'];
        _shufflePerm(54321);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var r, g, b;
                if (y < 3) {
                    var n = _fbm(x * 0.2, y * 0.2, 3, 1.0, 1.0);
                    r = 76 + n * 20;
                    g = 160 + n * 30;
                    b = 40 + n * 15;
                } else if (y < 5) {
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
                    var n = _fbm(x * 0.12, y * 0.12, 3, 1.0, 1.0);
                    r = 134 + n * 25;
                    g = 96 + n * 20;
                    b = 60 + n * 15;
                }
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = r;
                imgData.data[idx + 1] = g;
                imgData.data[idx + 2] = b;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture('grass_side', 'default', result);
    }

    // ---- Wood family ----

    /**
     * Generate a log side (bark) texture.
     * @param {number} seed
     * @returns {HTMLImageElement}
     */
    function generateLogSide(seed) {
        _shufflePerm(seed || 777);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.08, y * 0.25, 3, 1.0, 1.0);
                var r = 90 + n * 20;
                var g = 65 + n * 15;
                var b = 40 + n * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = r;
                imgData.data[idx + 1] = g;
                imgData.data[idx + 2] = b;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a log top (growth rings) texture.
     * @param {number} [seed=888] - Optional seed for deterministic generation.
     * @returns {HTMLImageElement}
     */
    function generateLogTop(seed) {
        var s = seed || 888;
        if (_cacheTexture['log_top:' + String(s)]) return _cacheTexture['log_top:' + String(s)];
        _shufflePerm(s);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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
            var noise = _noise2D(px * 0.5 + seed, py * 0.5 + seed) * 15;
            imgData.data[i]     = Math.max(0, Math.min(255, imgData.data[i] + noise));
            imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + noise));
            imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
        var result = _canvasToImage(canvas);
        return _cacheTexture('log_top', String(s), result);
    }

    /**
     * Generate a wood texture (bark all sides).
     * @param {number} seed
     * @returns {HTMLImageElement}
     */
    function generateWood(seed) {
        _shufflePerm(seed || 999);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
                var r = 120 + n * 20;
                var g = 95 + n * 15;
                var b = 60 + n * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = r;
                imgData.data[idx + 1] = g;
                imgData.data[idx + 2] = b;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a plank texture with vertical plank lines.
     * @param {number} r - Base red value.
     * @param {number} g - Base green value.
     * @param {number} b - Base blue value.
     * @param {number} seed
     * @returns {HTMLImageElement}
     */
    function generatePlanks(r, g, b, seed) {
        _shufflePerm(seed || 111);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        for (var py = 0; py < TEX_SIZE; py++) {
            for (var px = 0; px < TEX_SIZE; px++) {
                var plankX = px % 4;
                var n = _fbm(px * 0.1, py * 0.1, 2, 1.0, 1.0);
                var variation = plankX === 0 ? -10 : 0;
                var cr = Math.max(0, Math.min(255, r + variation + n * 10));
                var cg = Math.max(0, Math.min(255, g + variation + n * 8));
                var cb = Math.max(0, Math.min(255, b + variation + n * 6));
                ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
                ctx.fillRect(px, py, 1, 1);
            }
        }
        return _canvasToImage(canvas);
    }

    // ---- Fabric / Wool ----

    /**
     * Generate a colored wool/fabric texture with seeded noise and woven pattern.
     * @param {number} r - Base red.
     * @param {number} g - Base green.
     * @param {number} b - Base blue.
     * @returns {HTMLImageElement}
     */
    function generateWool(r, g, b) {
        _seedRng(r + g + b);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 20;
                var weave = (y % 2 === 0) ? 3 : -3;
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

    // ---- Concrete / Powder ----

    /**
     * Generate a concrete texture (smooth colored surface) with seeded noise.
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @returns {HTMLImageElement}
     */
    function generateConcrete(r, g, b) {
        _seedRng(r + g + b);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 8;
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
     * Generate a concrete powder texture (same as concrete but rougher) with seeded noise.
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @returns {HTMLImageElement}
     */
    function generateConcretePowder(r, g, b) {
        _seedRng(r + g + b);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 18;
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

    // ---- Sand / Snow ----

    /**
     * Generate a sand texture with seeded noise variation.
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @returns {HTMLImageElement}
     */
    function generateSand(r, g, b) {
        _seedRng(r + g + b);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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
     * Generate a snow texture (white with slight blue tint) using seeded noise.
     * @returns {HTMLImageElement}
     */
    function generateSnow() {
        _seedRng(0);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = 245 + n;
                imgData.data[idx + 1] = 248 + n;
                imgData.data[idx + 2] = 255;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ---- Terracotta ----

    /**
     * Generate a terracotta texture with seeded noise.
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @returns {HTMLImageElement}
     */
    function generateTerracotta(r, g, b) {
        _seedRng(r + g + b);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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

    // ---- Sandstone ----

    /**
     * Generate a sandstone texture with seeded noise and layer effect.
     * @returns {HTMLImageElement}
     */
    function generateSandstone() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 15;
                var layerEffect = (y % 4 < 2) ? 5 : 0;
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
     * Generate a chiseled sandstone texture.
     * @returns {HTMLImageElement}
     */
    function generateChiseledSandstone() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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
     * Generate a cut sandstone texture.
     * @returns {HTMLImageElement}
     */
    function generateCutSandstone() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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

    // ---- Coral & Sponge ----

    /**
     * Generate a coral block texture with seeded noise variation.
     * @param {string} color - Coral color name ("dead", "purple", "blue", "orange", "pink").
     * @returns {HTMLImageElement}
     */
    function generateCoralBlock(color) {
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
     * Generate a sponge texture with seeded holes.
     * @returns {HTMLImageElement}
     */
    function generateSponge() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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
     * Generate a wet sponge texture (darker) with seeded holes.
     * @returns {HTMLImageElement}
     */
    function generateWetSponge() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#668844';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < 15; i++) {
            ctx.fillStyle = 'rgba(50, 70, 30, 0.6)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

    // ---- Smooth variants ----

    /**
     * Generate a smooth stone texture with seeded noise.
     * @returns {HTMLImageElement}
     */
    function generateSmoothStone() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 6;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = 190 + n;
                imgData.data[idx + 1] = 185 + n;
                imgData.data[idx + 2] = 175 + n;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ---- Polished variants (use noise from _gen) ----

    /**
     * Generate a polished granite texture with seeded noise.
     * @returns {HTMLImageElement}
     */
    function generatePolishedGranite() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = 170 + n;
                imgData.data[idx + 1] = 130 + n;
                imgData.data[idx + 2] = 120 + n;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a polished diorite texture with seeded noise.
     * @returns {HTMLImageElement}
     */
    function generatePolishedDiorite() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = 200 + n;
                imgData.data[idx + 1] = 195 + n;
                imgData.data[idx + 2] = 190 + n;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a polished andesite texture with seeded noise.
     * @returns {HTMLImageElement}
     */
    function generatePolishedAndesite() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = 130 + n;
                imgData.data[idx + 1] = 135 + n;
                imgData.data[idx + 2] = 140 + n;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // Export terrain texture generators.
    Donkeycraft.TextureGenerator.generateStone = generateStone;
    Donkeycraft.TextureGenerator.generateDirt = generateDirt;
    Donkeycraft.TextureGenerator.generateGrassTop = generateGrassTop;
    Donkeycraft.TextureGenerator.generateGrassSide = generateGrassSide;
    Donkeycraft.TextureGenerator.generateLogSide = generateLogSide;
    Donkeycraft.TextureGenerator.generateLogTop = generateLogTop;
    Donkeycraft.TextureGenerator.generateWood = generateWood;
    Donkeycraft.TextureGenerator.generatePlanks = generatePlanks;
    Donkeycraft.TextureGenerator.generateWool = generateWool;
    Donkeycraft.TextureGenerator.generateConcrete = generateConcrete;
    Donkeycraft.TextureGenerator.generateConcretePowder = generateConcretePowder;
    Donkeycraft.TextureGenerator.generateSand = generateSand;
    Donkeycraft.TextureGenerator.generateSnow = generateSnow;
    Donkeycraft.TextureGenerator.generateTerracotta = generateTerracotta;
    Donkeycraft.TextureGenerator.generateSandstone = generateSandstone;
    Donkeycraft.TextureGenerator.generateChiseledSandstone = generateChiseledSandstone;
    Donkeycraft.TextureGenerator.generateCutSandstone = generateCutSandstone;
    Donkeycraft.TextureGenerator.generateCoralBlock = generateCoralBlock;
    Donkeycraft.TextureGenerator.generateSponge = generateSponge;
    Donkeycraft.TextureGenerator.generateWetSponge = generateWetSponge;
    Donkeycraft.TextureGenerator.generateSmoothStone = generateSmoothStone;
    Donkeycraft.TextureGenerator.generatePolishedGranite = generatePolishedGranite;
    Donkeycraft.TextureGenerator.generatePolishedDiorite = generatePolishedDiorite;
    Donkeycraft.TextureGenerator.generatePolishedAndesite = generatePolishedAndesite;

    // Aliases for cross-module use.
    Donkeycraft.TextureGenerator.generateRedSand = function() { return generateSand(183, 105, 63); };
    Donkeycraft.TextureGenerator.generateSnowBlock = function() { return generateSnow(); };
    Donkeycraft.TextureGenerator.generateGrass = function() { return generateGrassTop(); };

})();
