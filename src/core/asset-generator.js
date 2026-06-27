// Donkeycraft — Asset Generator
// Procedural texture and sound generation for all blocks, items, and entities.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Simplex-like noise function (fast 2D/3D)
    // ============================================================

    /**
     * Permutation table for noise functions.
     * @private
     */
    var _perm = [];
    for (var _i = 0; _i < 512; _i++) {
        _perm[_i] = _i & 255;
    }

    /**
     * Shuffle permutation table deterministically.
     * @param {number} seed - Seed value.
     * @private
     */
    function _shufflePerm(seed) {
        var x = seed | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) | 0;
        if (x < 0) x = -x;
        for (var i = 255; i > 0; i--) {
            x = (x * 16807) % 65536;
            var j = x % (i + 1);
            var tmp = _perm[i];
            _perm[i] = _perm[j];
            _perm[j] = tmp;
        }
        for (var k = 0; k < 512; k++) {
            _perm[k] = _perm[k & 255];
        }
    }

    /**
     * Fade function for smooth interpolation.
     * @param {number} t
     * @returns {number}
     * @private
     */
    function _fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * Linear interpolation.
     * @param {number} a
     * @param {number} b
     * @param {number} t
     * @returns {number}
     * @private
     */
    function _lerp(a, b, t) {
        return a + t * (b - a);
    }

    /**
     * Gradient function for noise.
     * @param {number} hash
     * @param {number} x
     * @param {number} y
     * @returns {number}
     * @private
     */
    function _grad(hash, x, y) {
        var h = hash & 15;
        var u = h < 8 ? x : y;
        var v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    /**
     * 2D Perlin noise.
     * @param {number} x
     * @param {number} y
     * @returns {number} Value in [-1, 1].
     * @private
     */
    function _noise2D(x, y) {
        var X = Math.floor(x) & 255;
        var Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        var u = _fade(x);
        var v = _fade(y);
        var a = (_perm[X] + Y) & 255;
        var b = (_perm[X + 1] + Y) & 255;
        return _lerp(
            _lerp(_grad(_perm[a], x, y), _grad(_perm[b], x - 1, y), u),
            _lerp(_grad(_perm[a + 1], x, y - 1), _grad(_perm[b + 1], x - 1, y - 1), u),
            v
        );
    }

    /**
     * Seeded pseudo-random number generator (Mulberry32).
     * Returns a float in [0, 1) for deterministic texture variation.
     * @type {number}
     * @private
     */
    var _rngState = 42;

    /**
     * Seed the PRNG with a given value.
     * @param {number} seed - Seed value.
     * @private
     */
    function _seedRng(seed) {
        _rngState = seed | 0;
        if (_rngState < 0) _rngState += 4294967296;
    }

    /**
     * Generate a deterministic pseudo-random number in [0, 1).
     * @returns {number}
     * @private
     */
    function _rng() {
        var x = _rngState;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        x = (x ^ (x >>> 16)) * 0x45d9f3b | 0;
        _rngState = (x + 1) | 0;
        return (_rngState >>> 0) / 4294967296;
    }

    /**
     * Fractal Brownian Motion for natural-looking texture variation.
     * @param {number} x
     * @param {number} y
     * @param {number} octaves
     * @param {number} frequency
     * @param {number} amplitude
     * @returns {number}
     * @private
     */
    function _fbm(x, y, octaves, frequency, amplitude) {
        var total = 0;
        var maxVal = 0;
        for (var i = 0; i < octaves; i++) {
            total += _noise2D(x * frequency, y * frequency) * amplitude;
            maxVal += amplitude;
            frequency *= 2;
            amplitude *= 0.5;
        }
        return total / maxVal;
    }

    // ============================================================
    // TextureGenerator — procedural 16×16 texture generation
    // ============================================================

    /**
     * TextureGenerator — generates 16×16 pixel textures procedurally.
     */
    Donkeycraft.TextureGenerator = (function() {
        var TEX_SIZE = 16;

        /**
         * Internal cache for generated textures to avoid regeneration.
         * @type {Object.<string, HTMLImageElement>}
         * @private
         */
        var _textureCache = {};

        /**
         * Maximum number of textures to cache (prevents unbounded memory growth).
         * @private
         */
        var MAX_CACHE_SIZE = 512;

        /**
         * Color definitions for block families.
         * Maps color names to RGB values used in texture generation.
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
         * Cache a generated texture by key.
         * @param {string} key - Unique cache key.
         * @param {HTMLImageElement} img - Generated image.
         * @private
         */
        function _cacheTexture(key, img) {
            if (!_textureCache[key]) {
                _textureCache[key] = img;
                // Evict oldest entries if cache exceeds max size
                var keys = Object.keys(_textureCache);
                if (keys.length > MAX_CACHE_SIZE) {
                    // Remove first entry (FIFO)
                    delete _textureCache[keys[0]];
                }
            }
            return img;
        }

        /**
         * Clear the internal texture cache.
         */
        function clearTextureCache() {
            _textureCache = {};
        }

        /**
         * Generate a stone texture with noise variation.
         * @param {number} seed
         * @returns {HTMLImageElement}
         */
        function generateStone(seed) {
            var cacheKey = 'stone:' + (seed || 42);
            if (_textureCache[cacheKey]) return _textureCache[cacheKey];
            _shufflePerm(seed || 42);
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
            return _cacheTexture(cacheKey, result);
        }

        /**
         * Generate a dirt texture with grass top layer.
         * @returns {HTMLImageElement}
         */
        function generateDirt() {
            _shufflePerm(12345);
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
            return _canvasToImage(canvas);
        }

        /**
         * Generate grass block top texture (green with noise).
         * @returns {HTMLImageElement}
         */
        function generateGrassTop() {
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
            return _canvasToImage(canvas);
        }

        /**
         * Generate grass block side texture (grass top + dirt bottom).
         * @returns {HTMLImageElement}
         */
        function generateGrassSide() {
            _shufflePerm(54321);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var r, g, b;
                    if (y < 3) {
                        // Top grass layer
                        var n = _fbm(x * 0.2, y * 0.2, 3, 1.0, 1.0);
                        r = 76 + n * 20;
                        g = 160 + n * 30;
                        b = 40 + n * 15;
                    } else if (y < 5) {
                        // Transition with grass drips — use deterministic noise instead of Math.random()
                        var drip = _noise2D(x * 0.3, y * 0.5);
                        if (drip > 0.2) {
                            var dripNoise = _noise2D(x * 0.7 + 100, y * 0.7 + 100);
                            r = 76 + (dripNoise + 1) * 5;   // range ~71-81
                            g = 140 + (dripNoise + 1) * 10;  // range ~130-160
                            b = 40;
                        } else {
                            r = 134; g = 96; b = 60;
                        }
                    } else {
                        // Dirt bottom
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
            return _canvasToImage(canvas);
        }

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
         * @param {number} seed
         * @returns {HTMLImageElement}
         */
        function generateLogTop(seed) {
            _shufflePerm(seed || 888);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#8B7355';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Draw concentric rings
            for (var ring = 2; ring <= 8; ring += 2) {
                ctx.strokeStyle = ring % 4 === 0 ? '#6B5335' : '#A0896B';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(8, 8, ring, 0, Math.PI * 2);
                ctx.stroke();
            }
            // Add seeded noise for natural variation
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
            return _canvasToImage(canvas);
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
         * Generate a plank texture.
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
            // Draw 4 vertical planks
            for (var py = 0; py < TEX_SIZE; py++) {
                for (var px = 0; px < TEX_SIZE; px++) {
                    var plankX = px % 4;
                    var n = _fbm(px * 0.1, py * 0.1, 2, 1.0, 1.0);
                    var variation = plankX === 0 ? -10 : 0; // Darker lines between planks
                    var cr = Math.max(0, Math.min(255, r + variation + n * 10));
                    var cg = Math.max(0, Math.min(255, g + variation + n * 8));
                    var cb = Math.max(0, Math.min(255, b + variation + n * 6));
                    var idx = (py * TEX_SIZE + px) * 4;
                    ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
                    ctx.fillRect(px, py, 1, 1);
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a colored wool/fabric texture with seeded noise variation and woven pattern.
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
                    // Woven pattern: slight horizontal variation
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
                    var n = (_rng() - 0.5) * 8; // Less noise than wool
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
         * Generate a glass texture (transparent with border).
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        function generateGlass(r, g, b) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var isBorder = x === 0 || x === 15 || y === 0 || y === 15;
                    var edgeDist = Math.min(Math.min(x, 15 - x), Math.min(y, 15 - y));
                    var alpha = isBorder ? 180 : (edgeDist <= 1 ? 120 : 40);
                    var brightness = isBorder ? 0.3 : 0.1;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = Math.max(0, Math.min(255, r * brightness + 200));
                    imgData.data[idx + 1] = Math.max(0, Math.min(255, g * brightness + 200));
                    imgData.data[idx + 2] = Math.max(0, Math.min(255, b * brightness + 220));
                    imgData.data[idx + 3] = alpha;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a brick texture.
         * @param {number} r - Brick red.
         * @param {number} g - Brick green.
         * @param {number} b - Brick blue.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a brick texture with seeded color variation.
         * @param {number} r - Brick red.
         * @param {number} g - Brick green.
         * @param {number} b - Brick blue.
         * @returns {HTMLImageElement}
         */
        function generateBricks(r, g, b) {
            _seedRng(r + g + b);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Mortar background
            ctx.fillStyle = '#999999';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Draw brick rows
            var brickH = 3;
            var mortarW = 1;
            for (var row = 0; row < TEX_SIZE; row += brickH) {
                var offset = (row % (brickH * 2) === 0) ? 0 : 4;
                for (var col = -4 + offset; col < TEX_SIZE; col += 8) {
                    var bx = col;
                    var by = row;
                    // Brick with seeded color variation
                    var brickR = r + (_rng() - 0.5) * 15;
                    var brickG = g + (_rng() - 0.5) * 10;
                    var brickB = b + (_rng() - 0.5) * 8;
                    ctx.fillStyle = 'rgb(' + Math.max(0, Math.min(255, brickR)) + ',' + Math.max(0, Math.min(255, brickG)) + ',' + Math.max(0, Math.min(255, brickB)) + ')';
                    ctx.fillRect(bx + mortarW, by + mortarW, 7 - mortarW, brickH - mortarW);
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate an ore texture (ore veins embedded in stone).
         * @param {number} oreR - Ore color red.
         * @param {number} oreG - Ore color green.
         * @param {number} oreB - Ore color blue.
         * @returns {HTMLImageElement}
         */
        function generateOre(oreR, oreG, oreB) {
            _shufflePerm(7777);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            // Stone background (inline to avoid re-shuffling via generateStone)
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
            // Place ore clusters
            var orePositions = [
                { x: 4, y: 3 }, { x: 10, y: 5 }, { x: 6, y: 10 },
                { x: 12, y: 12 }, { x: 3, y: 13 }
            ];
            _seedRng(oreR + oreG + oreB);
            for (var i = 0; i < orePositions.length; i++) {
                var pos = orePositions[i];
                ctx.fillStyle = 'rgb(' + oreR + ',' + oreG + ',' + oreB + ')';
                // Draw small ore cluster (3-4 pixels) with seeded randomness
                for (var dx = -1; dx <= 1; dx++) {
                    for (var dy = -1; dy <= 1; dy++) {
                        if (_rng() > 0.4) {
                            var px = ((pos.x + dx) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
                            var py = ((pos.y + dy) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
                            ctx.fillRect(px, py, 2, 2);
                        }
                    }
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a sand texture.
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
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
         * Generate a snow texture (white with slight blue tint).
         * @returns {HTMLImageElement}
         */
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

        /**
         * Generate a water texture.
         * @returns {HTMLImageElement}
         */
        function generateWater() {
            _shufflePerm(3333);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.2, y * 0.15, 3, 1.0, 1.0);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 30 + n * 20;
                    imgData.data[idx + 1] = 80 + n * 40;
                    imgData.data[idx + 2] = 180 + n * 40;
                    imgData.data[idx + 3] = 180; // Semi-transparent
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a lava texture (glowing orange/red).
         * @returns {HTMLImageElement}
         */
        function generateLava() {
            _shufflePerm(5555);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n1 = _noise2D(x * 0.15, y * 0.15);
                    var n2 = _noise2D(x * 0.3 + 100, y * 0.3 + 100);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 200 + n1 * 55;
                    imgData.data[idx + 1] = 60 + n2 * 80;
                    imgData.data[idx + 2] = 10 + n1 * 20;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a bedrock texture (dark gray with noise).
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a bedrock texture (dark gray with seeded noise variation).
         * @returns {HTMLImageElement}
         */
        function generateBedrock() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 40;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 50 + n;
                    imgData.data[idx + 1] = 50 + n;
                    imgData.data[idx + 2] = 50 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a glowing block texture.
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a glowing block texture with seeded noise.
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        function generateGlow(r, g, b) {
            _seedRng(r + g + b);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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
                    imgData.data[idx]     = Math.min(255, r * glow + 60 + n);
                    imgData.data[idx + 1] = Math.min(255, g * glow + 60 + n);
                    imgData.data[idx + 2] = Math.min(255, b * glow + 80 + n);
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a quartz pillar texture (horizontal stripes).
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a quartz pillar texture (horizontal stripes) with seeded noise.
         * @returns {HTMLImageElement}
         */
        function generateQuartzPillar() {
            _seedRng(777);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            for (var y = 0; y < TEX_SIZE; y++) {
                var isStripe = y % 4 < 2;
                ctx.fillStyle = isStripe ? '#E8E0D0' : '#D8D0C0';
                ctx.fillRect(0, y, TEX_SIZE, 1);
            }
            // Add seeded subtle noise
            var imgData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
            for (var i = 0; i < imgData.data.length; i += 4) {
                var n = (_rng() - 0.5) * 8;
                imgData.data[i]     += n;
                imgData.data[i + 1] += n;
                imgData.data[i + 2] += n;
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a basalt texture.
         * @returns {HTMLImageElement}
         */
        function generateBasalt() {
            _shufflePerm(9999);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.12, y * 0.3, 4, 1.0, 1.0);
                    var val = 70 + n * 25;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = val + 5;
                    imgData.data[idx + 1] = val;
                    imgData.data[idx + 2] = val - 3;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a polished block texture (smooth with subtle pattern).
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a polished block texture (smooth with subtle pattern) using seeded noise.
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        function generatePolished(r, g, b) {
            _seedRng(r + g + b);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 6; // Very smooth
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
         * Generate a leaf texture.
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a leaf texture with seeded clump variation.
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        function generateLeaves(r, g, b) {
            _seedRng(r + g + b);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Fill with base color
            ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Add seeded leaf clumps
            for (var i = 0; i < 20; i++) {
                var lx = Math.floor(_rng() * 14);
                var ly = Math.floor(_rng() * 14);
                var lr = Math.max(0, r + (_rng() - 0.5) * 30);
                var lg = Math.max(0, g + (_rng() - 0.5) * 30);
                var lb = Math.max(0, b + (_rng() - 0.5) * 15);
                ctx.fillStyle = 'rgb(' + lr + ',' + lg + ',' + lb + ')';
                ctx.fillRect(lx, ly, 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a TNT side texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a TNT side texture with seeded noise variation.
         * @returns {HTMLImageElement}
         */
        function generateTNTSide() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Red base
            ctx.fillStyle = '#CC3333';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // White stripe in middle
            ctx.fillStyle = '#EEEEEE';
            ctx.fillRect(0, 6, TEX_SIZE, 4);
            // Add seeded noise
            var imgData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
            for (var i = 0; i < imgData.data.length; i += 4) {
                var n = (_rng() - 0.5) * 15;
                imgData.data[i]     = Math.max(0, Math.min(255, imgData.data[i] + n));
                imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + n));
                imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + n));
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a chest side texture.
         * @returns {HTMLImageElement}
         */
        function generateChestSide() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood base
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Chest line
            ctx.fillStyle = '#6B4F12';
            ctx.fillRect(0, 7, TEX_SIZE, 2);
            // Lock hint
            ctx.fillStyle = '#CCCC44';
            ctx.fillRect(7, 8, 2, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a furnace front texture (stone with opening).
         * @returns {HTMLImageElement}
         */
        function generateFurnaceFront() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Smooth stone base
            ctx.fillStyle = '#B0B0B0';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Furnace opening
            ctx.fillStyle = '#333333';
            ctx.fillRect(4, 5, 8, 7);
            // Fire glow inside
            ctx.fillStyle = '#FF6600';
            ctx.fillRect(5, 8, 6, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a crafting table texture.
         * @returns {HTMLImageElement}
         */
        function generateCraftingTable() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Plank base
            ctx.fillStyle = '#BC9862';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Grid lines
            ctx.strokeStyle = '#6B5335';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 8); ctx.lineTo(TEX_SIZE, 8);
            ctx.moveTo(8, 0); ctx.lineTo(8, TEX_SIZE);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a bookshelf texture.
         * @returns {HTMLImageElement}
         */
        function generateBookshelf() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood base
            ctx.fillStyle = '#8B5A2B';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Books in rows
            var colors = ['#CC3333', '#336699', '#339933', '#996633', '#663399'];
            for (var row = 0; row < 2; row++) {
                for (var book = 0; book < 5; book++) {
                    ctx.fillStyle = colors[(row * 5 + book) % colors.length];
                    var bx = book * 3 + 1;
                    var by = row * 7 + 2;
                    ctx.fillRect(bx, by, 2, 5);
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a netherrack texture.
         * @returns {HTMLImageElement}
         */
        function generateNetherrack() {
            _shufflePerm(6666);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.15, y * 0.15, 4, 1.0, 1.0);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 140 + n * 40;
                    imgData.data[idx + 1] = 60 + n * 25;
                    imgData.data[idx + 2] = 60 + n * 20;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate an end stone texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate an end stone texture with seeded noise variation.
         * @returns {HTMLImageElement}
         */
        function generateEndStone() {
            _seedRng(777);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 20;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 200 + n;
                    imgData.data[idx + 1] = 190 + n;
                    imgData.data[idx + 2] = 140 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a gold block texture (shiny yellow).
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a gold block texture (shiny yellow) with seeded noise.
         * @returns {HTMLImageElement}
         */
        function generateGoldBlock() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 12;
                    var highlight = ((x + y) % 4 === 0) ? 15 : 0;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = Math.min(255, 237 + n + highlight);
                    imgData.data[idx + 1] = Math.min(255, 201 + n + highlight);
                    imgData.data[idx + 2] = 36 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate an iron block texture.
         * @returns {HTMLImageElement}
         */
        function generateIronBlock() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Grid pattern for iron ingots
            ctx.fillStyle = '#D4C4A8';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.strokeStyle = '#B0A080';
            ctx.lineWidth = 1;
            // 2×2 grid
            ctx.strokeRect(0.5, 0.5, 7, 7);
            ctx.strokeRect(8.5, 0.5, 7, 7);
            ctx.strokeRect(0.5, 8.5, 7, 7);
            ctx.strokeRect(8.5, 8.5, 7, 7);
            // Add seeded noise
            _seedRng(42);
            var imgData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
            for (var i = 0; i < imgData.data.length; i += 4) {
                var n = (_rng() - 0.5) * 8;
                imgData.data[i]     += n;
                imgData.data[i + 1] += n;
                imgData.data[i + 2] += n;
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a diamond block texture (cyan with sparkle).
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a diamond block texture (cyan with sparkle) using seeded noise.
         * @returns {HTMLImageElement}
         */
        function generateDiamondBlock() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#55DDDD';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Diamond sparkle highlights with seeded positions
            for (var i = 0; i < 8; i++) {
                var hx = Math.floor(_rng() * 14);
                var hy = Math.floor(_rng() * 14);
                ctx.fillStyle = 'rgba(200, 255, 255, 0.6)';
                ctx.fillRect(hx, hy, 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a redstone block texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a redstone block texture with seeded specks.
         * @returns {HTMLImageElement}
         */
        function generateRedstoneBlock() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#AA2222';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Darker seeded specks
            for (var i = 0; i < 15; i++) {
                ctx.fillStyle = 'rgba(80, 10, 10, 0.5)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a lapis block texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a lapis block texture with seeded blue specks.
         * @returns {HTMLImageElement}
         */
        function generateLapisBlock() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#3355AA';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Blue seeded specks
            for (var i = 0; i < 12; i++) {
                ctx.fillStyle = 'rgba(40, 60, 160, 0.6)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a emerald block texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a emerald block texture with seeded green specks.
         * @returns {HTMLImageElement}
         */
        function generateEmeraldBlock() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#33BB55';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Lighter green seeded specks
            for (var i = 0; i < 10; i++) {
                ctx.fillStyle = 'rgba(80, 220, 100, 0.5)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a coal block texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a coal block texture with seeded sparkle.
         * @returns {HTMLImageElement}
         */
        function generateCoalBlock() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#333333';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Coal seeded sparkle
            for (var i = 0; i < 8; i++) {
                ctx.fillStyle = 'rgba(60, 60, 60, 0.7)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a slime block texture.
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a slime block texture with seeded noise variation.
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @returns {HTMLImageElement}
         */
        function generateSlime(r, g, b) {
            _seedRng(r + g + b);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    // Slime grid pattern
                    var isGrid = x % 4 === 0 || y % 4 === 0;
                    var brightness = isGrid ? 0.7 : 1.0;
                    var n = (_rng() - 0.5) * 10;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = Math.max(0, Math.min(255, r * brightness + n));
                    imgData.data[idx + 1] = Math.max(0, Math.min(255, g * brightness + n));
                    imgData.data[idx + 2] = Math.max(0, Math.min(255, b * brightness + n));
                    imgData.data[idx + 3] = 200; // Semi-transparent
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a honey block texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a honey block texture with seeded noise variation.
         * @returns {HTMLImageElement}
         */
        function generateHoney() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 10;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 230 + n;
                    imgData.data[idx + 1] = 180 + n;
                    imgData.data[idx + 2] = 50 + n;
                    imgData.data[idx + 3] = 220; // Semi-transparent
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a hay bale texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a hay bale texture with seeded line wobble.
         * @returns {HTMLImageElement}
         */
        function generateHayBale() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#C8B050';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Horizontal seeded lines with slight wobble
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

        /**
         * Generate a melon texture.
         * @returns {HTMLImageElement}
         */
        function generateMelon() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Green outer
            ctx.fillStyle = '#44AA44';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Inner green circle
            ctx.fillStyle = '#66CC66';
            ctx.beginPath();
            ctx.arc(8, 8, 6, 0, Math.PI * 2);
            ctx.fill();
            // Grid lines
            ctx.strokeStyle = '#338833';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 8); ctx.lineTo(TEX_SIZE, 8);
            ctx.moveTo(8, 0); ctx.lineTo(8, TEX_SIZE);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a pumpkin texture.
         * @returns {HTMLImageElement}
         */
        function generatePumpkin() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#CC7722';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Grid lines for segments
            ctx.strokeStyle = '#AA5511';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(4, 0); ctx.lineTo(4, TEX_SIZE);
            ctx.moveTo(8, 0); ctx.lineTo(8, TEX_SIZE);
            ctx.moveTo(12, 0); ctx.lineTo(12, TEX_SIZE);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a mushroom texture.
         * @param {boolean} isRed - Whether red mushroom (true) or brown (false).
         * @returns {HTMLImageElement}
         */
        function generateMushroom(isRed) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = isRed ? '#CC2222' : '#8B6914';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Spots for red mushroom
            if (isRed) {
                ctx.fillStyle = '#FFFFFF';
                var spots = [{ x: 3, y: 3 }, { x: 10, y: 4 }, { x: 7, y: 9 }, { x: 4, y: 12 }];
                for (var i = 0; i < spots.length; i++) {
                    ctx.beginPath();
                    ctx.arc(spots[i].x + 1, spots[i].y + 1, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a chorus plant texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a chorus plant texture with seeded node positions.
         * @returns {HTMLImageElement}
         */
        function generateChorusPlant() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#AA77CC';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Seeded purple nodes
            for (var i = 0; i < 10; i++) {
                ctx.fillStyle = 'rgba(160, 100, 200, 0.7)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cactus texture.
         * @returns {HTMLImageElement}
         */
        function generateCactus() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#44AA44';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Cactus lines
            ctx.strokeStyle = '#338833';
            ctx.lineWidth = 1;
            for (var y = 2; y < TEX_SIZE; y += 4) {
                ctx.beginPath();
                ctx.moveTo(0, y); ctx.lineTo(TEX_SIZE, y);
                ctx.stroke();
            }
            // Edge highlights
            ctx.fillStyle = '#55CC55';
            ctx.fillRect(0, 0, 1, TEX_SIZE);
            ctx.fillRect(14, 0, 1, TEX_SIZE);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a sugar cane texture.
         * @returns {HTMLImageElement}
         */
        function generateSugarCane() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Light green base
            ctx.fillStyle = '#88CC44';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Segment lines
            ctx.strokeStyle = '#66AA33';
            ctx.lineWidth = 1;
            for (var y = 3; y < TEX_SIZE; y += 5) {
                ctx.beginPath();
                ctx.moveTo(0, y); ctx.lineTo(TEX_SIZE, y);
                ctx.stroke();
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a reeds (sugar cane) texture.
         * @returns {HTMLImageElement}
         */
        function generateReeds() {
            return generateSugarCane(); // Same as sugar cane
        }

        /**
         * Generate a redstone lamp texture.
         * @param {boolean} lit - Whether lit or unlit.
         * @returns {HTMLImageElement}
         */
        function generateRedstoneLamp(lit) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            if (lit) {
                // Glowing orange
                ctx.fillStyle = '#FFAA00';
                ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                // Redstone dot
                ctx.fillStyle = '#FF4400';
                ctx.fillRect(6, 6, 4, 4);
            } else {
                // Stone base
                ctx.fillStyle = '#999999';
                ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                // Redstone line
                ctx.fillStyle = '#AA2222';
                ctx.fillRect(6, 6, 4, 4);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a note block texture.
         * @returns {HTMLImageElement}
         */
        function generateNoteBlock() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#AA6644';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Black circle for note
            ctx.fillStyle = '#222222';
            ctx.beginPath();
            ctx.arc(8, 8, 3, 0, Math.PI * 2);
            ctx.fill();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a end portal frame texture.
         * @returns {HTMLImageElement}
         */
        function generateEndPortalFrame() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#556655';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Inner eye
            ctx.fillStyle = '#220033';
            ctx.fillRect(4, 4, 8, 8);
            // Star
            ctx.fillStyle = '#AA44FF';
            ctx.fillRect(7, 7, 2, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a mossy stone brick texture.
         * @returns {HTMLImageElement}
         */
        function generateMossyStoneBrick() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stone base
            ctx.fillStyle = '#889988';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Moss patches
            ctx.fillStyle = '#557744';
            var mosses = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 10, y: 10 }];
            for (var i = 0; i < mosses.length; i++) {
                ctx.fillRect(mosses[i].x, mosses[i].y, 4, 4);
            }
            // Brick lines
            ctx.strokeStyle = '#667766';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 8); ctx.lineTo(TEX_SIZE, 8);
            ctx.moveTo(8, 0); ctx.lineTo(8, TEX_SIZE);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a nether brick texture.
         * @returns {HTMLImageElement}
         */
        function generateNetherBrick() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#442222';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Brick pattern
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
         * Generate a polished blackstone texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a polished blackstone texture with seeded noise.
         * @returns {HTMLImageElement}
         */
        function generatePolishedBlackstone() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 10;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 35 + n;
                    imgData.data[idx + 1] = 32 + n;
                    imgData.data[idx + 2] = 36 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a polished basalt texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a polished basalt texture with seeded noise.
         * @returns {HTMLImageElement}
         */
        function generatePolishedBasalt() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Smoother than regular basalt
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

        /**
         * Generate a glowstone texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a glowstone texture with seeded bright spots.
         * @returns {HTMLImageElement}
         */
        function generateGlowstone() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#DDCC66';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Seeded bright spots
            for (var i = 0; i < 12; i++) {
                ctx.fillStyle = 'rgba(255, 240, 150, 0.6)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a shroomlight texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a shroomlight texture with seeded glow spots.
         * @returns {HTMLImageElement}
         */
        function generateShroomlight() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#CC3300';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Seeded glow spots
            for (var i = 0; i < 10; i++) {
                ctx.fillStyle = 'rgba(255, 100, 50, 0.5)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a prismarine texture.
         * @param {string} variant - "normal", "bricks", or "dark".
         * @returns {HTMLImageElement}
         */
        function generatePrismarine(variant) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            if (variant === 'bricks') {
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
                _seedRng(777);
                var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
                for (var y = 0; y < TEX_SIZE; y++) {
                    for (var x = 0; x < TEX_SIZE; x++) {
                        var n = (_rng() - 0.5) * 15;
                        var idx = (y * TEX_SIZE + x) * 4;
                        imgData.data[idx]     = 55 + n;
                        imgData.data[idx + 1] = 70 + n;
                        imgData.data[idx + 2] = 65 + n;
                        imgData.data[idx + 3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            } else {
                _seedRng(42);
                var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
                for (var y = 0; y < TEX_SIZE; y++) {
                    for (var x = 0; x < TEX_SIZE; x++) {
                        var n = (_rng() - 0.5) * 15;
                        var idx = (y * TEX_SIZE + x) * 4;
                        imgData.data[idx]     = 85 + n;
                        imgData.data[idx + 1] = 110 + n;
                        imgData.data[idx + 2] = 95 + n;
                        imgData.data[idx + 3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            }
            return _canvasToImage(canvas);
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

        /**
         * Generate a snow block texture (solid white with slight noise).
         * @returns {HTMLImageElement}
         */
        function generateSnowBlock() {
            return generateSnow();
        }

        /**
         * Generate an ice texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate an ice texture with seeded noise variation.
         * @returns {HTMLImageElement}
         */
        function generateIce() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 15;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 180 + n;
                    imgData.data[idx + 1] = 210 + n;
                    imgData.data[idx + 2] = 240 + n;
                    imgData.data[idx + 3] = 160; // Semi-transparent
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a blue ice texture (more opaque, deeper blue).
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a blue ice texture (more opaque, deeper blue) with seeded noise.
         * @returns {HTMLImageElement}
         */
        function generateBlueIce() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 8;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 100 + n;
                    imgData.data[idx + 1] = 160 + n;
                    imgData.data[idx + 2] = 230 + n;
                    imgData.data[idx + 3] = 230; // Mostly opaque
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a sponge texture.
         * @returns {HTMLImageElement}
         */
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
            // Seeded sponge holes
            for (var i = 0; i < 15; i++) {
                ctx.fillStyle = 'rgba(180, 140, 20, 0.6)';
                var hx = Math.floor(_rng() * 14);
                var hy = Math.floor(_rng() * 14);
                ctx.fillRect(hx, hy, 2, 2);
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
            // Seeded sponge holes (darker)
            for (var i = 0; i < 15; i++) {
                ctx.fillStyle = 'rgba(50, 70, 30, 0.6)';
                var hx = Math.floor(_rng() * 14);
                var hy = Math.floor(_rng() * 14);
                ctx.fillRect(hx, hy, 2, 2);
            }
            return _canvasToImage(canvas);
        }

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

        /**
         * Generate a red sand texture.
         * @returns {HTMLImageElement}
         */
        function generateRedSand() {
            return generateSand(183, 105, 63);
        }

        /**
         * Generate a sandstone texture.
         * @returns {HTMLImageElement}
         */
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
            // Chiseled pattern (indentation)
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
            // Smooth sandstone with horizontal line
            ctx.fillStyle = '#D4C496';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.strokeStyle = '#B4A476';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 8); ctx.lineTo(TEX_SIZE, 8);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a coal ore texture.
         * @returns {HTMLImageElement}
         */
        function generateCoalOre() {
            return generateOre(30, 30, 30);
        }

        /**
         * Generate an iron ore texture.
         * @returns {HTMLImageElement}
         */
        function generateIronOre() {
            return generateOre(210, 180, 150);
        }

        /**
         * Generate a gold ore texture.
         * @returns {HTMLImageElement}
         */
        function generateGoldOre() {
            return generateOre(237, 201, 36);
        }

        /**
         * Generate a diamond ore texture.
         * @returns {HTMLImageElement}
         */
        function generateDiamondOre() {
            return generateOre(80, 220, 230);
        }

        /**
         * Generate an emerald ore texture.
         * @returns {HTMLImageElement}
         */
        function generateEmeraldOre() {
            return generateOre(40, 220, 80);
        }

        /**
         * Generate a redstone ore texture (unlit = dark stone with red specks).
         * @returns {HTMLImageElement}
         */
        function generateRedstoneOre() {
            return generateOre(180, 20, 20);
        }

        /**
         * Generate a lit redstone ore texture (glowing red).
         * @returns {HTMLImageElement}
         */
        function generateLitRedstoneOre() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stone base
            var stoneImg = generateStone(1234);
            ctx.drawImage(stoneImg, 0, 0);
            // Glowing red center
            ctx.fillStyle = '#FF2200';
            ctx.fillRect(5, 5, 6, 6);
            ctx.fillStyle = '#FF6644';
            ctx.fillRect(6, 6, 4, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a lapis ore texture.
         * @returns {HTMLImageElement}
         */
        function generateLapisOre() {
            return generateOre(30, 60, 180);
        }

        /**
         * Generate a nether quartz ore texture.
         * @returns {HTMLImageElement}
         */
        function generateNetherQuartzOre() {
            _shufflePerm(4444);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            // Netherrack background
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 140 + n * 40;
                    imgData.data[idx + 1] = 60 + n * 25;
                    imgData.data[idx + 2] = 60 + n * 20;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            // Quartz specks (white)
            var quartzPositions = [{ x: 5, y: 4 }, { x: 11, y: 8 }, { x: 7, y: 12 }];
            for (var i = 0; i < quartzPositions.length; i++) {
                ctx.fillStyle = '#E8D8C0';
                var pos = quartzPositions[i];
                ctx.fillRect(pos.x, pos.y, 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a nether gold ore texture.
         * @returns {HTMLImageElement}
         */
        function generateNetherGoldOre() {
            _shufflePerm(4444);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            // Netherrack background
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 140 + n * 40;
                    imgData.data[idx + 1] = 60 + n * 25;
                    imgData.data[idx + 2] = 60 + n * 20;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            // Gold specks
            var goldPositions = [{ x: 4, y: 5 }, { x: 10, y: 10 }, { x: 8, y: 3 }];
            for (var i = 0; i < goldPositions.length; i++) {
                ctx.fillStyle = '#DDAA33';
                var pos = goldPositions[i];
                ctx.fillRect(pos.x, pos.y, 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate an ancient debris texture.
         * @returns {HTMLImageElement}
         */
        function generateAncientDebris() {
            _shufflePerm(8888);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            // Netherrack background
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 140 + n * 40;
                    imgData.data[idx + 1] = 60 + n * 25;
                    imgData.data[idx + 2] = 60 + n * 20;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            // Ancient debris (bronze/copper color)
            var debrisPositions = [{ x: 6, y: 5 }, { x: 9, y: 8 }, { x: 7, y: 11 }];
            for (var i = 0; i < debrisPositions.length; i++) {
                ctx.fillStyle = '#BB8844';
                var pos = debrisPositions[i];
                ctx.fillRect(pos.x, pos.y, 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a gilded blackstone texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a gilded blackstone texture with seeded noise and gold specks.
         * @returns {HTMLImageElement}
         */
        function generateGildedBlackstone() {
            _seedRng(7777);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            // Seeded blackstone background
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 10;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 35 + n;
                    imgData.data[idx + 1] = 32 + n;
                    imgData.data[idx + 2] = 36 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            // Gold seeded specks
            for (var i = 0; i < 6; i++) {
                ctx.fillStyle = 'rgba(200, 170, 50, 0.7)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a magma block texture.
         * @returns {HTMLImageElement}
         */
        function generateMagma() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Dark stone base
            ctx.fillStyle = '#8B6040';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Magma cracks
            ctx.fillStyle = '#CC4400';
            var cracks = [{ x: 2, y: 3 }, { x: 8, y: 2 }, { x: 5, y: 8 }, { x: 11, y: 10 }, { x: 3, y: 13 }];
            for (var i = 0; i < cracks.length; i++) {
                ctx.fillRect(cracks[i].x, cracks[i].y, 3, 2);
            }
            // Glow
            ctx.fillStyle = '#FF6622';
            ctx.fillRect(3, 4, 2, 1);
            ctx.fillRect(9, 3, 2, 1);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a soul sand texture with seeded noise variation.
         * @returns {HTMLImageElement}
         */
        function generateSoulSand() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 30;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 70 + n;
                    imgData.data[idx + 1] = 60 + n;
                    imgData.data[idx + 2] = 55 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a soul soil texture with seeded noise variation.
         * @returns {HTMLImageElement}
         */
        function generateSoulSoil() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 20;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 55 + n;
                    imgData.data[idx + 1] = 45 + n;
                    imgData.data[idx + 2] = 50 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a warped stem texture.
         * @returns {HTMLImageElement}
         */
        function generateWarpedStem() {
            _shufflePerm(2222);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.08, y * 0.25, 3, 1.0, 1.0);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 60 + n * 20;
                    imgData.data[idx + 1] = 160 + n * 30;
                    imgData.data[idx + 2] = 160 + n * 25;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a warped planks texture.
         * @returns {HTMLImageElement}
         */
        function generateWarpedPlanks() {
            return generatePlanks(60, 180, 170, 2222);
        }

        /**
         * Generate a crimson stem texture.
         * @returns {HTMLImageElement}
         */
        function generateCrimsonStem() {
            _shufflePerm(3333);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.08, y * 0.25, 3, 1.0, 1.0);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 160 + n * 25;
                    imgData.data[idx + 1] = 50 + n * 15;
                    imgData.data[idx + 2] = 50 + n * 10;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a crimson planks texture.
         * @returns {HTMLImageElement}
         */
        function generateCrimsonPlanks() {
            return generatePlanks(170, 50, 50, 3333);
        }

        /**
         * Generate a nylium texture (netherrack with nylium growth) using seeded noise.
         * @param {boolean} isWarped - Whether warped (blue-green) or crimson (red).
         * @returns {HTMLImageElement}
         */
        function generateNylium(isWarped) {
            _shufflePerm(isWarped ? 2222 : 3333);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            // Netherrack base
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 140 + n * 40;
                    imgData.data[idx + 1] = 60 + n * 25;
                    imgData.data[idx + 2] = 60 + n * 20;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            // Nylium growth color with seeded positions
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

        /**
         * Generate a chain texture.
         * @returns {HTMLImageElement}
         */
        function generateChain() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#888888';
            // Chain links (vertical)
            ctx.fillRect(6, 0, 4, 5);
            ctx.fillRect(6, 7, 4, 5);
            ctx.fillRect(6, 14, 4, 2);
            // Highlight
            ctx.fillStyle = '#AAAAAA';
            ctx.fillRect(7, 1, 2, 3);
            ctx.fillRect(7, 8, 2, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a red nether brick texture.
         * @returns {HTMLImageElement}
         */
        function generateRedNetherBrick() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#883333';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Brick pattern
            for (var row = 0; row < 4; row++) {
                var offset = (row % 2) * 4;
                for (var col = -4 + offset; col < TEX_SIZE; col += 8) {
                    ctx.fillStyle = '#994444';
                    ctx.fillRect(col + 1, row * 4 + 1, 6, 2);
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a quartz block texture.
         * @returns {HTMLImageElement}
         */
        function generateQuartzBlock() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#E8DCC8';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Subtle lines
            ctx.strokeStyle = '#D8CCB8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 8); ctx.lineTo(TEX_SIZE, 8);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a chiseled quartz block texture.
         * @returns {HTMLImageElement}
         */
        function generateChiseledQuartz() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#E8DCC8';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Vertical lines
            ctx.strokeStyle = '#D8CCB8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(8, 0); ctx.lineTo(8, TEX_SIZE);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a quartz brick texture.
         * @returns {HTMLImageElement}
         */
        function generateQuartzBricks() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#E8DCC8';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Small brick pattern
            for (var row = 0; row < 8; row++) {
                var offset = (row % 2) * 2;
                for (var col = -2 + offset; col < TEX_SIZE; col += 4) {
                    ctx.strokeStyle = '#D8CCB8';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(col + 0.5, row * 2 + 0.5, 3, 1);
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a purpur block texture.
         * @returns {HTMLImageElement}
         */
        function generatePurpurBlock() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#AA77C0';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Vertical lines
            ctx.strokeStyle = '#9966B0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(5, 0); ctx.lineTo(5, TEX_SIZE);
            ctx.moveTo(11, 0); ctx.lineTo(11, TEX_SIZE);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a purpur pillar texture (horizontal lines).
         * @returns {HTMLImageElement}
         */
        function generatePurpurPillar() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            for (var y = 0; y < TEX_SIZE; y++) {
                ctx.fillStyle = y % 4 < 2 ? '#AA77C0' : '#9966B0';
                ctx.fillRect(0, y, TEX_SIZE, 1);
            }
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
                    var n = (_rng() - 0.5) * 18; // More noise than concrete
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
         * Generate a lily pad texture.
         * @returns {HTMLImageElement}
         */
        function generateLilyPad() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Green circle with gap
            ctx.fillStyle = '#44AA22';
            ctx.beginPath();
            ctx.arc(8, 8, 7, 0.3, Math.PI * 2 - 0.3);
            ctx.lineTo(8, 8);
            ctx.fill();
            // Veins
            ctx.strokeStyle = '#338811';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(8, 8); ctx.lineTo(14, 6);
            ctx.moveTo(8, 8); ctx.lineTo(3, 10);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a vine texture.
         * @returns {HTMLImageElement}
         */
        function generateVine() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.fillStyle = '#44AA22';
            // Random vine segments
            var vines = [
                { x: 0, y: 0 }, { x: 3, y: 1 }, { x: 5, y: 2 },
                { x: 2, y: 4 }, { x: 8, y: 3 }, { x: 10, y: 5 },
                { x: 7, y: 7 }, { x: 12, y: 6 }, { x: 9, y: 9 },
                { x: 4, y: 10 }, { x: 14, y: 11 }, { x: 6, y: 13 }
            ];
            for (var i = 0; i < vines.length; i++) {
                ctx.fillRect(vines[i].x, vines[i].y, 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a grass block top texture alias.
         * @returns {HTMLImageElement}
         */
        function generateGrass() {
            return generateGrassTop();
        }

        /**
         * Generate a tall grass texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a tall grass texture with seeded blade positions.
         * @returns {HTMLImageElement}
         */
        function generateTallGrass() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.fillStyle = '#55AA33';
            // Seeded blades of grass
            for (var i = 0; i < 8; i++) {
                var bx = 1 + Math.floor(_rng() * 14);
                var by = 4 + Math.floor(_rng() * 4);
                ctx.fillRect(bx, by, 1, 8 + Math.floor(_rng() * 4));
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a fern texture.
         * @returns {HTMLImageElement}
         */
        function generateFern() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.fillStyle = '#44AA33';
            // Fern shape
            ctx.fillRect(7, 4, 2, 10);
            ctx.fillRect(5, 6, 2, 6);
            ctx.fillRect(9, 6, 2, 6);
            ctx.fillRect(4, 8, 2, 4);
            ctx.fillRect(10, 8, 2, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a flower texture.
         * @param {string} color - Flower color name.
         * @returns {HTMLImageElement}
         */
        function generateFlower(color) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Stem
            ctx.fillStyle = '#44AA33';
            ctx.fillRect(7, 8, 2, 6);
            // Petals
            var petalColor = color === 'red' ? '#CC2222' :
                             color === 'blue' ? '#3366CC' :
                             color === 'yellow' ? '#DDDD33' : '#CC8844';
            ctx.fillStyle = petalColor;
            ctx.fillRect(6, 5, 4, 4);
            ctx.fillStyle = '#EEEE88';
            ctx.fillRect(7, 6, 2, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a rose bush texture.
         * @returns {HTMLImageElement}
         */
        function generateRoseBush() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Stem
            ctx.fillStyle = '#44AA33';
            ctx.fillRect(7, 4, 2, 10);
            // Two roses
            ctx.fillStyle = '#CC2222';
            ctx.fillRect(5, 2, 6, 4);
            ctx.fillRect(6, 1, 4, 2);
            ctx.fillStyle = '#EEEE88';
            ctx.fillRect(7, 3, 2, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a sunflower texture.
         * @returns {HTMLImageElement}
         */
        function generateSunflower() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Stem
            ctx.fillStyle = '#88AA33';
            ctx.fillRect(7, 8, 2, 6);
            // Top flower
            ctx.fillStyle = '#DDCC33';
            ctx.fillRect(5, 2, 6, 5);
            ctx.fillRect(6, 1, 4, 2);
            ctx.fillStyle = '#886622';
            ctx.fillRect(7, 3, 2, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a dead bush texture.
         * @returns {HTMLImageElement}
         */
        function generateDeadBush() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.fillStyle = '#8B7355';
            // Dead branches
            ctx.fillRect(7, 6, 2, 8);
            ctx.fillRect(4, 8, 4, 2);
            ctx.fillRect(10, 5, 3, 2);
            ctx.fillRect(4, 4, 2, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cave vines (cave flowers) texture.
         * @returns {HTMLImageElement}
         */
        function generateCaveVines() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Vine
            ctx.fillStyle = '#44AA33';
            ctx.fillRect(7, 0, 2, 10);
            // Glow berries
            ctx.fillStyle = '#88DD44';
            ctx.fillRect(5, 4, 2, 2);
            ctx.fillRect(9, 6, 2, 2);
            ctx.fillRect(6, 8, 2, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cocoa bean texture.
         * @returns {HTMLImageElement}
         */
        function generateCocoa() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood background
            ctx.fillStyle = '#8B5A2B';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Cocoa pods
            ctx.fillStyle = '#664422';
            ctx.fillRect(5, 6, 6, 5);
            ctx.fillStyle = '#886633';
            ctx.fillRect(6, 7, 4, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a piston side texture.
         * @returns {HTMLImageElement}
         */
        function generatePistonSide() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood base
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Iron plate
            ctx.fillStyle = '#AAAAAA';
            ctx.fillRect(0, 6, TEX_SIZE, 4);
            // Piston head
            ctx.fillStyle = '#88CC44';
            ctx.fillRect(2, 0, 12, 6);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a dispenser/dropper texture.
         * @param {boolean} isDispenser - Whether dispenser (with eye) or dropper.
         * @returns {HTMLImageElement}
         */
        function generateDispenser(isDispenser) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stone base
            ctx.fillStyle = '#888888';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Dark opening
            ctx.fillStyle = '#444444';
            ctx.fillRect(5, 5, 6, 6);
            if (isDispenser) {
                // Eye indicator
                ctx.fillStyle = '#CC4444';
                ctx.fillRect(7, 7, 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate an observer texture.
         * @returns {HTMLImageElement}
         */
        function generateObserver() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stone base with stripes
            for (var y = 0; y < TEX_SIZE; y++) {
                ctx.fillStyle = y % 4 < 2 ? '#888888' : '#777777';
                ctx.fillRect(0, y, TEX_SIZE, 1);
            }
            // Redstone eye
            ctx.fillStyle = '#CC2222';
            ctx.fillRect(6, 6, 4, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a repeater texture.
         * @returns {HTMLImageElement}
         */
        function generateRepeater() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stone base
            ctx.fillStyle = '#888888';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Redstone torches and line
            ctx.fillStyle = '#CC2222';
            ctx.fillRect(3, 6, 2, 4);
            ctx.fillRect(11, 6, 2, 4);
            ctx.fillStyle = '#AA1111';
            ctx.fillRect(5, 7, 6, 2);
            // Torch lights
            ctx.fillStyle = '#FFAA44';
            ctx.fillRect(3, 7, 2, 1);
            ctx.fillRect(11, 7, 2, 1);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a lever texture.
         * @returns {HTMLImageElement}
         */
        function generateLever() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stone base
            ctx.fillStyle = '#888888';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Base plate
            ctx.fillStyle = '#666666';
            ctx.fillRect(6, 10, 4, 3);
            // Lever stick
            ctx.fillStyle = '#555555';
            ctx.fillRect(7, 4, 2, 7);
            // Iron ball
            ctx.fillStyle = '#AAAAAA';
            ctx.fillRect(6, 2, 4, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a button texture.
         * @param {boolean} isStone - Whether stone button or wood button.
         * @returns {HTMLImageElement}
         */
        function generateButton(isStone) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            if (isStone) {
                ctx.fillStyle = '#888888';
                ctx.fillRect(5, 6, 6, 4);
            } else {
                ctx.fillStyle = '#8B6914';
                ctx.fillRect(5, 6, 6, 4);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a pressure plate texture.
         * @param {boolean} isStone - Whether stone or wood pressure plate.
         * @returns {HTMLImageElement}
         */
        function generatePressurePlate(isStone) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            if (isStone) {
                ctx.fillStyle = '#888888';
                ctx.fillRect(1, 4, 14, 8);
                // Stone pattern
                ctx.strokeStyle = '#777777';
                ctx.lineWidth = 1;
                ctx.strokeRect(2, 5, 5, 6);
                ctx.strokeRect(9, 5, 5, 6);
            } else {
                ctx.fillStyle = '#8B6914';
                ctx.fillRect(1, 4, 14, 8);
                // Wood grain
                ctx.strokeStyle = '#6B4F12';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(1, 8); ctx.lineTo(15, 8);
                ctx.stroke();
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a door texture.
         * @param {boolean} isIron - Whether iron door or wood door.
         * @returns {HTMLImageElement}
         */
        function generateDoor(isIron) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            if (isIron) {
                ctx.fillStyle = '#CCCCBB';
                ctx.fillRect(2, 0, 5, 16);
                ctx.fillRect(9, 0, 5, 16);
                // Rivets
                ctx.fillStyle = '#999998';
                ctx.fillRect(3, 2, 1, 1);
                ctx.fillRect(3, 13, 1, 1);
                ctx.fillRect(10, 2, 1, 1);
                ctx.fillRect(10, 13, 1, 1);
            } else {
                ctx.fillStyle = '#BC9862';
                ctx.fillRect(2, 0, 5, 16);
                ctx.fillRect(9, 0, 5, 16);
                // Wood grain
                ctx.strokeStyle = '#9C7842';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(2, 5); ctx.lineTo(7, 5);
                ctx.moveTo(2, 10); ctx.lineTo(7, 10);
                ctx.moveTo(9, 5); ctx.lineTo(14, 5);
                ctx.moveTo(9, 10); ctx.lineTo(14, 10);
                ctx.stroke();
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a fence texture.
         * @returns {HTMLImageElement}
         */
        function generateFence() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#8B6914';
            // Vertical posts
            ctx.fillRect(2, 0, 3, 16);
            ctx.fillRect(11, 0, 3, 16);
            // Horizontal bars
            ctx.fillRect(5, 3, 6, 2);
            ctx.fillRect(5, 11, 6, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a wall texture (cobblestone).
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a wall texture (cobblestone) with seeded stone shades.
         * @returns {HTMLImageElement}
         */
        function generateWall() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Cobblestone pattern
            var stones = [
                { x: 0, y: 8, w: 7, h: 8 },
                { x: 8, y: 8, w: 8, h: 5 },
                { x: 0, y: 0, w: 5, h: 8 },
                { x: 6, y: 0, w: 10, h: 8 }
            ];
            for (var i = 0; i < stones.length; i++) {
                var s = stones[i];
                var shade = 120 + Math.floor(_rng() * 30);
                ctx.fillStyle = 'rgb(' + shade + ',' + shade + ',' + (shade + 5) + ')';
                ctx.fillRect(s.x, s.y, s.w, s.h);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate an end rod texture.
         * @returns {HTMLImageElement}
         */
        function generateEndRod() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // White pole
            ctx.fillStyle = '#EEEEEE';
            ctx.fillRect(7, 0, 2, 16);
            // Glowing tip
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(5, 0, 6, 4);
            ctx.fillStyle = '#DDDDDD';
            ctx.fillRect(7, 12, 2, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a redstone torch texture.
         * @returns {HTMLImageElement}
         */
        function generateRedstoneTorch() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stick
            ctx.fillStyle = '#555555';
            ctx.fillRect(7, 6, 2, 8);
            // Torch top
            ctx.fillStyle = '#CC2222';
            ctx.fillRect(6, 1, 4, 5);
            // Glow
            ctx.fillStyle = '#FF6644';
            ctx.fillRect(7, 2, 2, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a bed texture.
         * @param {string} color - Bed color name.
         * @returns {HTMLImageElement}
         */
        function generateBed(color) {
            var colors = {
                white: '#EEEEEE', orange: '#EA8724', magenta: '#B747B9',
                light_blue: '#64C6E8', yellow: '#F0DE40', lime: '#7DE338',
                pink: '#EF8DB1', gray: '#656565', light_gray: '#B1B7BF',
                cyan: '#36A2B4', purple: '#9751AF', blue: '#3560BA',
                brown: '#715440', green: '#57863F', red: '#B73437', black: '#212121'
            };
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wool part (top half)
            ctx.fillStyle = colors[color] || '#EEEEEE';
            ctx.fillRect(1, 0, 14, 6);
            // Bed base (bottom half)
            ctx.fillStyle = '#333333';
            ctx.fillRect(1, 6, 14, 8);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a sign texture.
         * @param {string} woodType - Wood type name.
         * @returns {HTMLImageElement}
         */
        function generateSign(woodType) {
            var plankColors = {
                oak: '#BC9862', spruce: '#6B4F12', birch: '#C8B888',
                jungle: '#A08040', acacia: '#C09040', dark_oak: '#5A3F1A'
            };
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = plankColors[woodType] || '#BC9862';
            ctx.fillRect(2, 0, 12, 12);
            // Border
            ctx.strokeStyle = '#6B5335';
            ctx.lineWidth = 1;
            ctx.strokeRect(2.5, 0.5, 11, 11);
            // Post at bottom
            ctx.fillStyle = plankColors[woodType] || '#BC9862';
            ctx.fillRect(6, 12, 4, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a mirror texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a mirror texture with seeded reflective noise.
         * @returns {HTMLImageElement}
         */
        function generateMirror() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Silver reflective surface with seeded noise
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 10;
                    var val = 200 + n;
                    ctx.fillStyle = 'rgb(' + val + ',' + val + ',' + (val + 5) + ')';
                    ctx.fillRect(x, y, 1, 1);
                }
            }
            // Frame
            ctx.strokeStyle = '#8B6914';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, 14, 14);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a brewing stand texture.
         * @returns {HTMLImageElement}
         */
        function generateBrewingStand() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Base
            ctx.fillStyle = '#555555';
            ctx.fillRect(4, 10, 8, 4);
            // Stem
            ctx.fillRect(7, 6, 2, 5);
            // Cups
            ctx.fillStyle = '#333333';
            ctx.fillRect(4, 3, 3, 4);
            ctx.fillRect(9, 3, 3, 4);
            ctx.fillRect(6, 0, 4, 4);
            // Potion glow
            ctx.fillStyle = '#8844AA';
            ctx.fillRect(5, 4, 2, 2);
            ctx.fillRect(10, 4, 2, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cauldron texture.
         * @returns {HTMLImageElement}
         */
        function generateCauldron() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Outer body
            ctx.fillStyle = '#555555';
            ctx.fillRect(1, 4, 14, 10);
            // Inner (dark)
            ctx.fillStyle = '#333333';
            ctx.fillRect(3, 5, 10, 8);
            // Rim
            ctx.fillStyle = '#666666';
            ctx.fillRect(0, 3, 16, 2);
            // Handles
            ctx.fillStyle = '#777777';
            ctx.fillRect(0, 4, 2, 4);
            ctx.fillRect(14, 4, 2, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a painting placeholder texture.
         * @returns {HTMLImageElement}
         */
        function generatePainting() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Brown frame
            ctx.fillStyle = '#6B4F12';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Inner canvas
            ctx.fillStyle = '#DDCCAA';
            ctx.fillRect(2, 2, 12, 12);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a mob spawner texture.
         * @returns {HTMLImageElement}
         */
        function generateMobSpawner() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stone base
            ctx.fillStyle = '#888888';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Dark opening
            ctx.fillStyle = '#333333';
            ctx.fillRect(4, 4, 8, 8);
            // Spawner frame
            ctx.strokeStyle = '#556655';
            ctx.lineWidth = 2;
            ctx.strokeRect(3, 3, 10, 10);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a respawning anchor texture.
         * @returns {HTMLImageElement}
         */
        function generateRespawnAnchor() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Blackstone base
            ctx.fillStyle = '#333333';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Purple glow
            ctx.fillStyle = '#AA44FF';
            ctx.fillRect(4, 5, 8, 6);
            ctx.fillStyle = '#CC66FF';
            ctx.fillRect(6, 7, 4, 3);
            // Top detail
            ctx.fillStyle = '#444444';
            ctx.fillRect(2, 2, 12, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate an end portal texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate an end portal texture with seeded starfield positions.
         * @returns {HTMLImageElement}
         */
        function generateEndPortal() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Starfield
            ctx.fillStyle = '#110022';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            for (var i = 0; i < 30; i++) {
                var brightness = 0.3 + _rng() * 0.7;
                ctx.fillStyle = 'rgba(200, 180, 255, ' + brightness + ')';
                ctx.fillRect(Math.floor(_rng() * 16), Math.floor(_rng() * 16), 1, 1);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a nether portal texture.
         * @returns {HTMLImageElement}
         */
        /**
         * Generate a nether portal texture with seeded purple swirl noise.
         * @returns {HTMLImageElement}
         */
        function generateNetherPortal() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Purple swirl with seeded noise
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = _rng();
                    var idx = (y * TEX_SIZE + x) * 4;
                    var r = 80 + n * 60;
                    var g = 20 + n * 30;
                    var b = 160 + n * 80;
                    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                    ctx.fillRect(x, y, 1, 1);
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a chiseled bookshelf texture.
         * @returns {HTMLImageElement}
         */
        function generateChiseledBookshelf() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood base
            ctx.fillStyle = '#8B5A2B';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Small book slots (3×3 grid)
            var bookColors = ['#CC3333', '#336699', '#339933', '#996633', '#663399', '#AA8844', '#4488AA', '#AA4488', '#88AA44'];
            for (var row = 0; row < 3; row++) {
                for (var col = 0; col < 3; col++) {
                    ctx.fillStyle = bookColors[row * 3 + col];
                    ctx.fillRect(col * 5 + 1, row * 5 + 1, 3, 4);
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a lectern texture.
         * @returns {HTMLImageElement}
         */
        function generateLectern() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood base
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(0, 4, TEX_SIZE, 12);
            // Slanted top
            ctx.fillStyle = '#BC9862';
            ctx.fillRect(3, 2, 10, 4);
            // Book
            ctx.fillStyle = '#AA4422';
            ctx.fillRect(5, 1, 6, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a smoker texture.
         * @returns {HTMLImageElement}
         */
        function generateSmoker() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood base
            ctx.fillStyle = '#6B4F12';
            ctx.fillRect(2, 0, 12, 16);
            // Dark opening
            ctx.fillStyle = '#333333';
            ctx.fillRect(5, 4, 6, 8);
            // Smoke hint
            ctx.fillStyle = '#666666';
            ctx.fillRect(6, 2, 4, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a blast furnace texture.
         * @returns {HTMLImageElement}
         */
        function generateBlastFurnace() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Iron base
            ctx.fillStyle = '#888888';
            ctx.fillRect(2, 0, 12, 16);
            // Dark opening
            ctx.fillStyle = '#333333';
            ctx.fillRect(5, 4, 6, 8);
            // Gear hint
            ctx.fillStyle = '#AAAAAA';
            ctx.fillRect(6, 6, 4, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a jigsaw block texture.
         * @returns {HTMLImageElement}
         */
        function generateJigsaw() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Beige base
            ctx.fillStyle = '#CCB888';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Jigsaw pattern
            ctx.strokeStyle = '#AA9866';
            ctx.lineWidth = 1;
            // Male piece (top)
            ctx.beginPath();
            ctx.arc(8, 4, 3, Math.PI, 0);
            ctx.stroke();
            // Female piece (bottom)
            ctx.beginPath();
            ctx.arc(8, 12, 3, 0, Math.PI);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a composter texture.
         * @returns {HTMLImageElement}
         */
        function generateComposter() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood base
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(2, 0, 12, 16);
            // Level indicator lines
            ctx.strokeStyle = '#6B4F12';
            ctx.lineWidth = 1;
            for (var y = 3; y < 14; y += 3) {
                ctx.beginPath();
                ctx.moveTo(4, y); ctx.lineTo(12, y);
                ctx.stroke();
            }
            // Lid
            ctx.fillStyle = '#9C7842';
            ctx.fillRect(1, 0, 14, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a lantern texture.
         * @returns {HTMLImageElement}
         */
        function generateLantern() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Hanging chain
            ctx.fillStyle = '#666666';
            ctx.fillRect(7, 0, 2, 3);
            // Lantern body
            ctx.fillStyle = '#555555';
            ctx.fillRect(4, 3, 8, 10);
            // Glow
            ctx.fillStyle = '#FFAA44';
            ctx.fillRect(5, 4, 6, 8);
            ctx.fillStyle = '#FFDD88';
            ctx.fillRect(6, 5, 4, 6);
            // Top cap
            ctx.fillStyle = '#444444';
            ctx.fillRect(5, 2, 6, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a soul lantern texture.
         * @returns {HTMLImageElement}
         */
        function generateSoulLantern() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666666';
            ctx.fillRect(7, 0, 2, 3);
            ctx.fillStyle = '#444444';
            ctx.fillRect(4, 3, 8, 10);
            // Blue soul fire
            ctx.fillStyle = '#6688CC';
            ctx.fillRect(5, 4, 6, 8);
            ctx.fillStyle = '#88AADD';
            ctx.fillRect(6, 5, 4, 6);
            ctx.fillStyle = '#333333';
            ctx.fillRect(5, 2, 6, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a sculk sensor texture.
         * @returns {HTMLImageElement}
         */
        function generateSculkSensor() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Sculk base
            ctx.fillStyle = '#1A2B3C';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Concentric circles
            ctx.strokeStyle = '#22AA88';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(8, 8, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(8, 8, 4, 0, Math.PI * 2);
            ctx.stroke();
            // Center glow
            ctx.fillStyle = '#33DDAA';
            ctx.fillRect(7, 7, 2, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a deepslate texture with seeded noise variation.
         * @returns {HTMLImageElement}
         */
        function generateDeepslate() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 15;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 70 + n;
                    imgData.data[idx + 1] = 80 + n;
                    imgData.data[idx + 2] = 90 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cobbled deepslate texture with seeded stone shades.
         * @returns {HTMLImageElement}
         */
        function generateCobbledDeepslate() {
            _seedRng(777);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Cobblestone pattern with deepslate colors and seeded shades
            var stones = [
                { x: 0, y: 8, w: 7, h: 8 },
                { x: 8, y: 8, w: 8, h: 5 },
                { x: 0, y: 0, w: 5, h: 8 },
                { x: 6, y: 0, w: 10, h: 8 }
            ];
            for (var i = 0; i < stones.length; i++) {
                var s = stones[i];
                var shade = 65 + Math.floor(_rng() * 25);
                ctx.fillStyle = 'rgb(' + (shade - 5) + ',' + shade + ',' + (shade + 10) + ')';
                ctx.fillRect(s.x, s.y, s.w, s.h);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a polished deepslate texture with seeded noise.
         * @returns {HTMLImageElement}
         */
        function generatePolishedDeepslate() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 8;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 60 + n;
                    imgData.data[idx + 1] = 70 + n;
                    imgData.data[idx + 2] = 80 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cobbled deepslate wall texture (same base as cobbled deepslate).
         * @returns {HTMLImageElement}
         */
        function generateCobbledDeepslateWall() {
            return generateCobbledDeepslate(); // Same base texture
        }

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
         * Generate a structure block texture.
         * @param {string} type - "save", "load", or "data".
         * @returns {HTMLImageElement}
         */
        function generateStructureBlock(type) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            if (type === 'save') {
                ctx.fillStyle = '#DDAA33';
            } else if (type === 'load') {
                ctx.fillStyle = '#33DD33';
            } else {
                ctx.fillStyle = '#DD3333';
            }
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Border
            ctx.strokeStyle = '#555555';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, 14, 14);
            // Center icon
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(6, 6, 4, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a target texture.
         * @returns {HTMLImageElement}
         */
        function generateTarget() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Wood base
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Target circles
            ctx.fillStyle = '#DDAA77';
            ctx.beginPath();
            ctx.arc(8, 8, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#CC4422';
            ctx.beginPath();
            ctx.arc(8, 8, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#DDAA77';
            ctx.beginPath();
            ctx.arc(8, 8, 2, 0, Math.PI * 2);
            ctx.fill();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a sweet berry bush texture.
         * @param {number} stage - Growth stage (0-3).
         * @returns {HTMLImageElement}
         */
        function generateSweetBerryBush(stage) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Branches
            ctx.fillStyle = '#6B4F12';
            ctx.fillRect(3, 8, 10, 2);
            ctx.fillRect(6, 4, 2, 5);
            // Berries (more at higher stages)
            if (stage >= 1) {
                ctx.fillStyle = '#CC2222';
                ctx.fillRect(5, 5, 2, 2);
                ctx.fillRect(9, 6, 2, 2);
            }
            if (stage >= 2) {
                ctx.fillStyle = '#DD3333';
                ctx.fillRect(4, 7, 2, 2);
                ctx.fillRect(10, 5, 2, 2);
            }
            if (stage >= 3) {
                ctx.fillStyle = '#EE4444';
                ctx.fillRect(6, 3, 2, 2);
                ctx.fillRect(8, 7, 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a glow lichen texture with seeded spot positions.
         * @param {string} direction - "north", "south", "east", "west", "up", "down", or "multiple".
         * @returns {HTMLImageElement}
         */
        function generateGlowLichen(direction) {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Base
            ctx.fillStyle = '#556655';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Glow spots with seeded spread pattern
            ctx.fillStyle = '#88CC88';
            var isSpread = direction === 'up' || direction === 'multiple' || direction === 'down';
            if (isSpread) {
                for (var i = 0; i < 12; i++) {
                    ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
                }
            } else {
                // Directional: fill center area for cardinal directions
                ctx.fillRect(4, 4, 8, 8);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a spore blossom texture.
         * @returns {HTMLImageElement}
         */
        function generateSporeBlossom() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Purple flower cluster
            ctx.fillStyle = '#6633AA';
            ctx.fillRect(4, 4, 8, 8);
            ctx.fillStyle = '#8855CC';
            ctx.fillRect(5, 5, 6, 6);
            ctx.fillStyle = '#AA77EE';
            ctx.fillRect(6, 6, 4, 4);
            // Spores falling
            ctx.fillStyle = 'rgba(150, 100, 220, 0.5)';
            ctx.fillRect(3, 13, 2, 2);
            ctx.fillRect(11, 14, 2, 2);
            ctx.fillRect(7, 15, 2, 1);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a pointed dripstone texture.
         * @param {string} type - "tip", "middle", or "base".
         * @returns {HTMLImageElement}
         */
        function generatePointedDripstone(type) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            if (type === 'tip') {
                // Sharp point
                ctx.fillStyle = '#8B7355';
                ctx.beginPath();
                ctx.moveTo(8, 0); ctx.lineTo(12, 8); ctx.lineTo(4, 8);
                ctx.fill();
            } else if (type === 'middle') {
                ctx.fillStyle = '#8B7355';
                ctx.fillRect(6, 2, 4, 12);
                // Highlight
                ctx.fillStyle = '#A0896B';
                ctx.fillRect(7, 3, 2, 10);
            } else {
                // Base (flat)
                ctx.fillStyle = '#7B6345';
                ctx.fillRect(2, 10, 12, 4);
                ctx.fillStyle = '#8B7355';
                ctx.fillRect(4, 8, 8, 3);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a azalea texture with seeded leaf positions.
         * @param {boolean} hasFlowers - Whether flowering azalea.
         * @returns {HTMLImageElement}
         */
        function generateAzalea(hasFlowers) {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Seeded leaf clumps
            ctx.fillStyle = '#44AA33';
            for (var i = 0; i < 15; i++) {
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            if (hasFlowers) {
                // Pink flowers at deterministic positions
                ctx.fillStyle = '#FF88AA';
                var flowers = [{ x: 3, y: 3 }, { x: 9, y: 5 }, { x: 6, y: 10 }, { x: 12, y: 12 }];
                for (var i = 0; i < flowers.length; i++) {
                    ctx.fillRect(flowers[i].x, flowers[i].y, 2, 2);
                }
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a moss carpet texture with seeded patch positions.
         * @returns {HTMLImageElement}
         */
        function generateMossCarpet() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Seeded patchy green moss
            ctx.fillStyle = '#66AA44';
            for (var i = 0; i < 25; i++) {
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 1);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cave vines with glow berries texture (alias).
         * @returns {HTMLImageElement}
         */
        function generateCaveVinesWithGlowBerries() {
            return generateCaveVines();
        }

        /**
         * Generate a pitcher plant texture.
         * @returns {HTMLImageElement}
         */
        function generatePitcherPlant() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Stem
            ctx.fillStyle = '#66AA55';
            ctx.fillRect(7, 4, 2, 10);
            // Pitcher leaves
            ctx.fillStyle = '#77CC66';
            ctx.fillRect(4, 2, 8, 4);
            ctx.fillRect(5, 0, 6, 3);
            // Pitcher pot
            ctx.fillStyle = '#55AA44';
            ctx.fillRect(5, 12, 6, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a frogspawn texture with seeded egg positions and alpha.
         * @returns {HTMLImageElement}
         */
        function generateFrogspawn() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Seeded greenish cluster of eggs
            for (var i = 0; i < 20; i++) {
                var alpha = 0.5 + _rng() * 0.5;
                ctx.fillStyle = 'rgba(140, 200, 80, ' + alpha + ')';
                ctx.beginPath();
                ctx.arc(2 + _rng() * 12, 2 + _rng() * 12, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cream cow texture (decorative item) with seeded noise.
         * @returns {HTMLImageElement}
         */
        function generateCream() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#F5F0E0';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Seeded subtle texture spots
            for (var i = 0; i < 10; i++) {
                ctx.fillStyle = 'rgba(200, 190, 170, 0.3)';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a scoot boots texture (placeholder).
         * @returns {HTMLImageElement}
         */
        function generateScootBoots() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(3, 2, 4, 12);
            ctx.fillRect(9, 2, 4, 12);
            // Boots detail
            ctx.fillStyle = '#6B4F12';
            ctx.fillRect(3, 14, 4, 2);
            ctx.fillRect(9, 14, 4, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a batroglet texture (placeholder).
         * @returns {HTMLImageElement}
         */
        function generateBatroglet() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#553366';
            // Bat-like shape
            ctx.fillRect(6, 6, 4, 4);
            ctx.fillRect(2, 4, 4, 3);
            ctx.fillRect(10, 4, 4, 3);
            // Eyes
            ctx.fillStyle = '#FF4444';
            ctx.fillRect(7, 7, 1, 1);
            ctx.fillRect(9, 7, 1, 1);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a axolotl bucket texture.
         * @param {string} variant - Axolotl variant color.
         * @returns {HTMLImageElement}
         */
        function generateAxolotlBucket(variant) {
            var colors = {
                blue: '#4488DD', pink: '#EE88AA', gold: '#DDAA33',
                cyan: '#36A2B4', wild: '#88AA55'
            };
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Bucket outline
            ctx.fillStyle = '#AAAAAA';
            ctx.fillRect(4, 2, 8, 12);
            ctx.fillRect(3, 4, 10, 2);
            // Water
            ctx.fillStyle = 'rgba(100, 150, 200, 0.5)';
            ctx.fillRect(5, 5, 6, 8);
            // Axolotl
            ctx.fillStyle = colors[variant] || '#EE88AA';
            ctx.fillRect(6, 6, 4, 4);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a powder snow bucket texture.
         * @returns {HTMLImageElement}
         */
        function generatePowderSnowBucket() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Bucket outline
            ctx.fillStyle = '#888888';
            ctx.fillRect(4, 2, 8, 12);
            ctx.fillRect(3, 4, 10, 2);
            // Powder snow
            ctx.fillStyle = '#CCDDEE';
            ctx.fillRect(5, 5, 6, 8);
            ctx.fillStyle = '#EEF0FF';
            ctx.fillRect(6, 6, 4, 3);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a sniffer egg texture.
         * @returns {HTMLImageElement}
         */
        function generateSnifferEgg() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Egg shape
            ctx.fillStyle = '#DD8844';
            ctx.beginPath();
            ctx.ellipse(8, 9, 5, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            // Cracks
            ctx.strokeStyle = '#BB6622';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(6, 5); ctx.lineTo(8, 8); ctx.lineTo(10, 6);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cherry blossom leaves texture with seeded positions.
         * @returns {HTMLImageElement}
         */
        function generateCherryLeaves() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Seeded pink leaves with varying alpha
            for (var i = 0; i < 30; i++) {
                var alpha = 0.5 + _rng() * 0.5;
                ctx.fillStyle = 'rgba(240, 160, 180, ' + alpha + ')';
                ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cherry wood texture with seeded noise variation.
         * @returns {HTMLImageElement}
         */
        function generateCherryWood() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var n = (_rng() - 0.5) * 15;
                    var idx = (y * TEX_SIZE + x) * 4;
                    imgData.data[idx]     = 180 + n;
                    imgData.data[idx + 1] = 120 + n;
                    imgData.data[idx + 2] = 120 + n;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a cherry planks texture.
         * @returns {HTMLImageElement}
         */
        function generateCherryPlanks() {
            return generatePlanks(200, 140, 140, 4444);
        }

        /**
         * Generate a mangrove planks texture.
         * @returns {HTMLImageElement}
         */
        function generateMangrovePlanks() {
            return generatePlanks(120, 70, 50, 5555);
        }

        /**
         * Generate a mangrove log texture.
         * @returns {HTMLImageElement}
         */
        function generateMangroveLog() {
            return generateLogSide(5555);
        }

        /**
         * Generate a root texture with seeded strand positions.
         * @returns {HTMLImageElement}
         */
        function generateRoot() {
            _seedRng(42);
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#8B6914';
            // Seeded root strands
            for (var i = 0; i < 8; i++) {
                ctx.fillRect(Math.floor(_rng() * 12), Math.floor(_rng() * 12), 3, 2);
            }
            return _canvasToImage(canvas);
        }

        /**
         * Generate an attached melon stem texture.
         * @returns {HTMLImageElement}
         */
        function generateAttachedMelonStem() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Vine
            ctx.fillStyle = '#66AA33';
            ctx.fillRect(7, 0, 2, 10);
            // Melon
            ctx.fillStyle = '#44AA44';
            ctx.fillRect(4, 10, 8, 4);
            ctx.fillStyle = '#338833';
            ctx.fillRect(5, 11, 6, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate an attached pumpkin stem texture.
         * @returns {HTMLImageElement}
         */
        function generateAttachedPumpkinStem() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Vine
            ctx.fillStyle = '#88AA33';
            ctx.fillRect(7, 0, 2, 10);
            // Pumpkin
            ctx.fillStyle = '#CC7722';
            ctx.fillRect(4, 10, 8, 4);
            ctx.fillStyle = '#AA5511';
            ctx.fillRect(5, 11, 6, 2);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a mojang logo placeholder texture.
         * @returns {HTMLImageElement}
         */
        function generateMojangLogo() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#555555';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.fillStyle = '#AAAAAA';
            ctx.font = '8px monospace';
            ctx.fillText('D', 5, 12);
            return _canvasToImage(canvas);
        }

        /**
         * Generate a missing texture (red/black checkerboard).
         * @returns {HTMLImageElement}
         */
        function generateMissing() {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            for (var y = 0; y < TEX_SIZE; y++) {
                for (var x = 0; x < TEX_SIZE; x++) {
                    var isWhite = (x + y) % 4 < 2;
                    ctx.fillStyle = isWhite ? '#FF0000' : '#000000';
                    ctx.fillRect(x, y, 1, 1);
                }
            }
            // X overlay
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(4, 4); ctx.lineTo(12, 12);
            ctx.moveTo(12, 4); ctx.lineTo(4, 12);
            ctx.stroke();
            return _canvasToImage(canvas);
        }

        /**
         * Get a texture generator function for a block name.
         * @param {string} blockName - Block name from BlockRegistry.
         * @returns {Function|null} Generator function, or null if unknown.
         */
        function getGeneratorForBlock(blockName) {
            var generators = {
                // Stone family
                'stone': function() { return generateStone(42); },
                'granite': function() { return generatePolished(170, 130, 120); },
                'diorite': function() { return generatePolished(200, 195, 190); },
                'andesite': function() { return generatePolished(130, 135, 140); },
                'deepslate': function() { return generateDeepslate(); },
                'cobbled_deepslate': function() { return generateCobbledDeepslate(); },
                'dirt': function() { return generateDirt(); },
                'grass_block': function() { return generateGrassSide(); },
                'gravel': function() { return generateStone(777); },
                // Ores
                'coal_ore': function() { return generateCoalOre(); },
                'iron_ore': function() { return generateIronOre(); },
                'gold_ore': function() { return generateGoldOre(); },
                'diamond_ore': function() { return generateDiamondOre(); },
                'emerald_ore': function() { return generateEmeraldOre(); },
                'redstone_ore': function() { return generateRedstoneOre(); },
                'lit_redstone_ore': function() { return generateLitRedstoneOre(); },
                'lapis_ore': function() { return generateLapisOre(); },
                'nether_quartz_ore': function() { return generateNetherQuartzOre(); },
                'nether_gold_ore': function() { return generateNetherGoldOre(); },
                // Special blocks
                'obsidian': function() { return generateStone(999); },
                'crying_obsidian': function() { return generateGlow(80, 20, 140); },
                'bedrock': function() { return generateBedrock(); },
                // Sand variants
                'sand': function() { return generateSand(210, 195, 150); },
                'red_sand': function() { return generateRedSand(); },
                'sandstone': function() { return generateSandstone(); },
                'chiseled_sandstone': function() { return generateChiseledSandstone(); },
                'cut_sandstone': function() { return generateCutSandstone(); },
                // Wood and planks
                'oak_log': function() { return generateLogSide(100); },
                'spruce_log': function() { return generateLogSide(101); },
                'birch_log': function() { return generateLogSide(102); },
                'jungle_log': function() { return generateLogSide(103); },
                'acacia_log': function() { return generateLogSide(104); },
                'dark_oak_log': function() { return generateLogSide(105); },
                'oak_planks': function() { return generatePlanks(188, 152, 98, 100); },
                'spruce_planks': function() { return generatePlanks(107, 79, 18, 101); },
                'birch_planks': function() { return generatePlanks(200, 184, 136, 102); },
                'jungle_planks': function() { return generatePlanks(160, 128, 64, 103); },
                'acacia_planks': function() { return generatePlanks(192, 144, 64, 104); },
                'dark_oak_planks': function() { return generatePlanks(90, 63, 26, 105); },
                'oak_wood': function() { return generateWood(110); },
                'spruce_wood': function() { return generateWood(111); },
                'birch_wood': function() { return generateWood(112); },
                'jungle_wood': function() { return generateWood(113); },
                // Stone bricks
                'stone_bricks': function() { return generateBricks(120, 120, 120); },
                'mossy_stone_bricks': function() { return generateMossyStoneBrick(); },
                'end_stone_bricks': function() { return generateEndStone(); },
                // Prismarine variants
                'prismarine': function() { return generatePrismarine('normal'); },
                'prismarine_bricks': function() { return generatePrismarine('bricks'); },
                'prismarine_dark': function() { return generatePrismarine('dark'); },
                // Wood logs (top)
                'oak_log_top': function() { return generateLogTop(100); },
                'spruce_log_top': function() { return generateLogTop(101); },
                'birch_log_top': function() { return generateLogTop(102); },
                'jungle_log_top': function() { return generateLogTop(103); },
                'acacia_log_top': function() { return generateLogTop(104); },
                'dark_oak_log_top': function() { return generateLogTop(105); },
                // Dark oak wood
                'dark_oak_wood': function() { return generateWood(114); },
                // Mangrove
                'mangrove_wood': function() { return generateWood(5555); },
                // Cherry
                'cherry_log': function() { return generateLogSide(4444); },
                'cherry_wood': function() { return generateCherryWood(); },
                // Glass
                'glass': function() { return generateGlass(200, 220, 255); },
                'tinted_glass': function() { return generateGlass(60, 50, 80); },
                'glass_pane': function() { return generateGlass(200, 220, 255); },
                'ice': function() { return generateIce(); },
                'blue_ice': function() { return generateBlueIce(); },
                'snow_block': function() { return generateSnowBlock(); },
                'snow_layer': function() { return generateSnow(); },
                // Wool (all 16 colors)
                'white_wool': function() { return generateWool(240, 240, 240); },
                'orange_wool': function() { return generateWool(234, 131, 36); },
                'magenta_wool': function() { return generateWool(183, 71, 185); },
                'light_blue_wool': function() { return generateWool(100, 198, 232); },
                'yellow_wool': function() { return generateWool(240, 222, 64); },
                'lime_wool': function() { return generateWool(125, 227, 56); },
                'pink_wool': function() { return generateWool(239, 141, 177); },
                'gray_wool': function() { return generateWool(101, 101, 101); },
                'light_gray_wool': function() { return generateWool(177, 183, 191); },
                'cyan_wool': function() { return generateWool(54, 162, 180); },
                'purple_wool': function() { return generateWool(151, 81, 175); },
                'blue_wool': function() { return generateWool(53, 96, 186); },
                'brown_wool': function() { return generateWool(113, 84, 64); },
                'green_wool': function() { return generateWool(87, 134, 63); },
                'red_wool': function() { return generateWool(183, 52, 55); },
                'black_wool': function() { return generateWool(33, 33, 33); },
                // Concrete
                'white_concrete': function() { return generateConcrete(240, 240, 240); },
                'orange_concrete': function() { return generateConcrete(234, 131, 36); },
                'magenta_concrete': function() { return generateConcrete(183, 71, 185); },
                'light_blue_concrete': function() { return generateConcrete(100, 198, 232); },
                'yellow_concrete': function() { return generateConcrete(240, 222, 64); },
                'lime_concrete': function() { return generateConcrete(125, 227, 56); },
                'pink_concrete': function() { return generateConcrete(239, 141, 177); },
                'gray_concrete': function() { return generateConcrete(101, 101, 101); },
                'light_gray_concrete': function() { return generateConcrete(177, 183, 191); },
                'cyan_concrete': function() { return generateConcrete(54, 162, 180); },
                'purple_concrete': function() { return generateConcrete(151, 81, 175); },
                'blue_concrete': function() { return generateConcrete(53, 96, 186); },
                'brown_concrete': function() { return generateConcrete(113, 84, 64); },
                'green_concrete': function() { return generateConcrete(87, 134, 63); },
                'red_concrete': function() { return generateConcrete(183, 52, 55); },
                'black_concrete': function() { return generateConcrete(33, 33, 33); },
                // Concrete powder (same colors, rougher)
                'white_concrete_powder': function() { return generateConcretePowder(240, 240, 240); },
                'orange_concrete_powder': function() { return generateConcretePowder(234, 131, 36); },
                'magenta_concrete_powder': function() { return generateConcretePowder(183, 71, 185); },
                'light_blue_concrete_powder': function() { return generateConcretePowder(100, 198, 232); },
                'yellow_concrete_powder': function() { return generateConcretePowder(240, 222, 64); },
                'lime_concrete_powder': function() { return generateConcretePowder(125, 227, 56); },
                'pink_concrete_powder': function() { return generateConcretePowder(239, 141, 177); },
                'gray_concrete_powder': function() { return generateConcretePowder(101, 101, 101); },
                'light_gray_concrete_powder': function() { return generateConcretePowder(177, 183, 191); },
                'cyan_concrete_powder': function() { return generateConcretePowder(54, 162, 180); },
                'purple_concrete_powder': function() { return generateConcretePowder(151, 81, 175); },
                'blue_concrete_powder': function() { return generateConcretePowder(53, 96, 186); },
                'brown_concrete_powder': function() { return generateConcretePowder(113, 84, 64); },
                'green_concrete_powder': function() { return generateConcretePowder(87, 134, 63); },
                'red_concrete_powder': function() { return generateConcretePowder(183, 52, 55); },
                'black_concrete_powder': function() { return generateConcretePowder(33, 33, 33); },
                // Terracotta
                'terracotta': function() { return generateTerracotta(190, 120, 80); },
                'white_terracotta': function() { return generateTerracotta(240, 235, 225); },
                'red_terracotta': function() { return generateTerracotta(180, 70, 50); },
                // Bricks
                'brick': function() { return generateBricks(160, 60, 50); },
                'bricks': function() { return generateBricks(160, 60, 50); },
                'nether_bricks': function() { return generateNetherBrick(); },
                'red_nether_bricks': function() { return generateRedNetherBrick(); },
                // Special stone
                'basalt': function() { return generateBasalt(); },
                'polished_basalt': function() { return generatePolishedBasalt(); },
                'blackstone': function() { return generatePolishedBlackstone(); },
                'smooth_stone': function() { return generateSmoothStone(); },
                'polished_diorite': function() { return generatePolishedDiorite(); },
                'polished_andesite': function() { return generatePolishedAndesite(); },
                'polished_granite': function() { return generatePolishedGranite(); },
                // Leaves
                'oak_leaves': function() { return generateLeaves(50, 130, 40); },
                'spruce_leaves': function() { return generateLeaves(30, 80, 30); },
                'birch_leaves': function() { return generateLeaves(60, 140, 50); },
                'jungle_leaves': function() { return generateLeaves(40, 110, 30); },
                'acacia_leaves': function() { return generateLeaves(70, 120, 40); },
                'dark_oak_leaves': function() { return generateLeaves(35, 85, 35); },
                // Sponges
                'sponge': function() { return generateSponge(); },
                'wet_sponge': function() { return generateWetSponge(); },
                // Honey and slime
                'honey_block': function() { return generateHoney(); },
                // Sand variants for special blocks
                'polished_blackstone': function() { return generatePolishedBlackstone(); },
                'polished_blackstone_bricks': function() { return generateBricks(45, 42, 46); },
                // Nether blocks
                'netherrack': function() { return generateNetherrack(); },
                'soul_sand': function() { return generateSoulSand(); },
                'soul_soil': function() { return generateSoulSoil(); },
                'gilded_blackstone': function() { return generateGildedBlackstone(); },
                'ancient_debris': function() { return generateAncientDebris(); },
                'magma': function() { return generateMagma(); },
                // Nether wood
                'warped_stem': function() { return generateWarpedStem(); },
                'warped_hyphae': function() { return generateWarpedStem(); },
                'warped_planks': function() { return generateWarpedPlanks(); },
                'warped_nylium': function() { return generateNylium(true); },
                'crimson_stem': function() { return generateCrimsonStem(); },
                'crimson_hyphae': function() { return generateCrimsonStem(); },
                'crimson_planks': function() { return generateCrimsonPlanks(); },
                'crimson_nylium': function() { return generateNylium(false); },
                // Nether decorative
                'nether_wart_block': function() { return generateBricks(100, 30, 30); },
                'shroomlight': function() { return generateShroomlight(); },
                'glowstone': function() { return generateGlowstone(); },
                // End blocks (purpur)
                'purpur_block': function() { return generatePurpurBlock(); },
                'purpur_pillar': function() { return generatePurpurPillar(); },
                // Metals
                'gold_block': function() { return generateGoldBlock(); },
                'iron_block': function() { return generateIronBlock(); },
                'diamond_block': function() { return generateDiamondBlock(); },
                'emerald_block': function() { return generateEmeraldBlock(); },
                'coal_block': function() { return generateCoalBlock(); },
                'netherite_block': function() { return generatePolished(50, 45, 55); },
                // Redstone blocks
                'redstone_block': function() { return generateRedstoneBlock(); },
                'lapis_block': function() { return generateLapisBlock(); },
                // Quartz
                'quartz_block': function() { return generateQuartzBlock(); },
                'chiseled_quartz_block': function() { return generateChiseledQuartz(); },
                'quartz_pillar': function() { return generateQuartzPillar(); },
                'quartz_bricks': function() { return generateQuartzBricks(); },
                // Liquids
                'water': function() { return generateWater(); },
                'lava': function() { return generateLava(); },
                // Decorative plants
                'grass': function() { return generateGrass(); },
                'tall_grass': function() { return generateTallGrass(); },
                'fern': function() { return generateFern(); },
                'poppy': function() { return generateFlower('red'); },
                'blue_orchid': function() { return generateFlower('blue'); },
                'dandelion': function() { return generateFlower('yellow'); },
                'rose_bush': function() { return generateRoseBush(); },
                'sunflower': function() { return generateSunflower(); },
                'lily_pad': function() { return generateLilyPad(); },
                'dead_bush': function() { return generateDeadBush(); },
                'vine': function() { return generateVine(); },
                'cave_vines': function() { return generateCaveVines(); },
                'cave_vines_with_glow_berries': function() { return generateCaveVinesWithGlowBerries(); },
                'sugar_cane': function() { return generateSugarCane(); },
                'reeds': function() { return generateReeds(); },
                'cactus': function() { return generateCactus(); },
                'chorus_plant': function() { return generateChorusPlant(); },
                'chorus_flower': function() { return generateGlow(160, 80, 200); },
                'cocoa': function() { return generateCocoa(); },
                // Redstone components
                'redstone_wire': function() {
                    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                    var ctx = canvas.getContext('2d');
                    // Transparent background
                    ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
                    // Red dust line
                    ctx.fillStyle = '#AA0000';
                    ctx.fillRect(0, 7, TEX_SIZE, 2);
                    // Glow
                    ctx.fillStyle = '#FF2222';
                    ctx.fillRect(0, 7, TEX_SIZE, 1);
                    return _canvasToImage(canvas);
                },
                'redstone_torch': function() { return generateRedstoneTorch(); },
                'redstone_lamp': function() { return generateRedstoneLamp(false); },
                'lit_redstone_lamp': function() { return generateRedstoneLamp(true); },
                'dispenser': function() { return generateDispenser(true); },
                'dropper': function() { return generateDispenser(false); },
                'observer': function() { return generateObserver(); },
                'repeater': function() { return generateRepeater(); },
                // Pistons
                'piston': function() { return generatePistonSide(); },
                'sticky_piston': function() {
                    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                    var ctx = canvas.getContext('2d');
                    // Wood base (same as piston)
                    ctx.fillStyle = '#8B6914';
                    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                    // Iron plate
                    ctx.fillStyle = '#AAAAAA';
                    ctx.fillRect(0, 6, TEX_SIZE, 4);
                    // Sticky piston head (green slime layer)
                    ctx.fillStyle = '#55AA33';
                    ctx.fillRect(2, 0, 12, 6);
                    // Slime drip detail
                    for (var _i = 0; _i < 4; _i++) {
                        var _dx = 3 + _i * 3;
                        ctx.fillRect(_dx, 5, 2, 2);
                    }
                    return _canvasToImage(canvas);
                },
                // TNT
                'tnt': function() { return generateTNTSide(); },
                // Storage
                'chest': function() { return generateChestSide(); },
                'trapped_chest': function() {
                    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                    var ctx = canvas.getContext('2d');
                    // Wood base (same as chest)
                    ctx.fillStyle = '#8B6914';
                    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                    // Chest line
                    ctx.fillStyle = '#6B4F12';
                    ctx.fillRect(0, 7, TEX_SIZE, 2);
                    // Trap mechanism (gear-like indicator)
                    ctx.fillStyle = '#888888';
                    ctx.fillRect(6, 7, 4, 2);
                    ctx.fillStyle = '#AAAAAA';
                    ctx.fillRect(7, 8, 2, 1);
                    return _canvasToImage(canvas);
                },
                'barrel': function() {
                    _seedRng(42);
                    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                    var ctx = canvas.getContext('2d');
                    // Darker wood base
                    ctx.fillStyle = '#6B4F12';
                    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                    // Metal bands
                    ctx.fillStyle = '#555555';
                    ctx.fillRect(0, 4, TEX_SIZE, 2);
                    ctx.fillRect(0, 10, TEX_SIZE, 2);
                    // Seeded wood grain lines
                    ctx.strokeStyle = '#7B5F22';
                    ctx.lineWidth = 0.5;
                    for (var _i = 0; _i < 4; _i++) {
                        var _y = 1 + _i * 4;
                        ctx.beginPath();
                        ctx.moveTo(0, _y); ctx.lineTo(TEX_SIZE, _y + (_rng() - 0.5));
                        ctx.stroke();
                    }
                    return _canvasToImage(canvas);
                },
                'furnace': function() { return generateFurnaceFront(); },
                'lit_furnace': function() {
                    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                    var ctx = canvas.getContext('2d');
                    // Smooth stone base
                    ctx.fillStyle = '#B0B0B0';
                    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                    // Furnace opening
                    ctx.fillStyle = '#333333';
                    ctx.fillRect(4, 5, 8, 7);
                    // Bright fire glow inside (more intense than unlit)
                    ctx.fillStyle = '#FF8800';
                    ctx.fillRect(5, 7, 6, 4);
                    ctx.fillStyle = '#FFCC44';
                    ctx.fillRect(6, 8, 4, 2);
                    // Glow spill on surrounding stone
                    ctx.fillStyle = 'rgba(255, 136, 0, 0.15)';
                    ctx.fillRect(3, 4, 1, 9);
                    ctx.fillRect(12, 4, 1, 9);
                    return _canvasToImage(canvas);
                },
                'smoker': function() { return generateSmoker(); },
                'blast_furnace': function() { return generateBlastFurnace(); },
                'crafting_table': function() { return generateCraftingTable(); },
                'bookshelf': function() { return generateBookshelf(); },
                'chiseled_bookshelf': function() { return generateChiseledBookshelf(); },
                'lectern': function() { return generateLectern(); },
                // Doors and fences
                'oak_door': function() { return generateDoor(false); },
                'iron_door': function() { return generateDoor(true); },
                'spruce_door': function() {
                    var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                    var ctx = canvas.getContext('2d');
                    // Dark spruce wood
                    ctx.fillStyle = '#6B4F12';
                    ctx.fillRect(2, 0, 5, 16);
                    ctx.fillRect(9, 0, 5, 16);
                    // Wood grain
                    ctx.strokeStyle = '#5B3F02';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(2, 5); ctx.lineTo(7, 5);
                    ctx.moveTo(2, 10); ctx.lineTo(7, 10);
                    ctx.moveTo(9, 5); ctx.lineTo(14, 5);
                    ctx.moveTo(9, 10); ctx.lineTo(14, 10);
                    ctx.stroke();
                    return _canvasToImage(canvas);
                },
                'oak_fence': function() { return generateFence(); },
                'cobblestone_wall': function() { return generateWall(); },
                'brick_wall': function() { return generateBricks(160, 60, 50); },
                'nether_brick_wall': function() { return generateNetherBrick(); },
                'end_stone_brick_wall': function() { return generateEndStone(); },
                // Buttons and pressure plates
                'stone_button': function() { return generateButton(true); },
                'oak_button': function() { return generateButton(false); },
                'lever': function() { return generateLever(); },
                'stone_pressure_plate': function() { return generatePressurePlate(true); },
                'oak_pressure_plate': function() { return generatePressurePlate(false); },
                // Special blocks
                'end_rod': function() { return generateEndRod(); },
                'chain': function() { return generateChain(); },
                'end_portal_frame': function() { return generateEndPortalFrame(); },
                'end_portal': function() { return generateEndPortal(); },
                'nether_portal': function() { return generateNetherPortal(); },
                'mob_spawner': function() { return generateMobSpawner(); },
                'enchanting_table': function() { return generateGlow(100, 60, 180); },
                'brewing_stand': function() { return generateBrewingStand(); },
                'cauldron': function() { return generateCauldron(); },
                'respawn_anchor': function() { return generateRespawnAnchor(); },
                // Beds
                'oak_bed': function() { return generateBed('white'); },
                'red_bed': function() { return generateBed('red'); },
                // Other
                'painting': function() { return generatePainting(); },
                'mirror': function() { return generateMirror(); },
                'lantern': function() { return generateLantern(); },
                'soul_lantern': function() { return generateSoulLantern(); },
                'sculk_sensor': function() { return generateSculkSensor(); },
                'melons': function() { return generateMelon(); },
                'pumpkin': function() { return generatePumpkin(); },
                'hay_block': function() { return generateHayBale(); },
                // Default fallback
                'default': function() { return generateStone(0); }
            };

            return generators[blockName] || null;
        }

        /**
         * Generate a texture for a block by its name.
         * @param {string} blockName - Block name from BlockRegistry.
         * @returns {HTMLImageElement|null} The generated texture, or null if unavailable.
         */
        function generateTextureForBlock(blockName) {
            var gen = getGeneratorForBlock(blockName);
            if (gen) {
                return gen();
            }
            // Fallback: generate a colored placeholder based on hash of name
            return generateFallbackTexture(blockName);
        }

        /**
         * Generate a fallback texture for unknown blocks.
         * @param {string} blockName
         * @returns {HTMLImageElement}
         */
        function generateFallbackTexture(blockName) {
            var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
            var ctx = canvas.getContext('2d');
            // Hash the name to get a color
            var hash = 0;
            for (var i = 0; i < blockName.length; i++) {
                hash = ((hash << 5) - hash) + blockName.charCodeAt(i);
                hash |= 0;
            }
            var hue = Math.abs(hash) % 360;
            ctx.fillStyle = 'hsl(' + hue + ', 40%, 50%)';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            // Border
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, TEX_SIZE - 1, TEX_SIZE - 1);
            return _canvasToImage(canvas);
        }

        /**
         * Generate all textures for all registered blocks.
         * @returns {Object.<number, HTMLImageElement>} Map of blockId -> texture image.
         */
        function generateAllTextures() {
            var textures = {};
            var blocks = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getAllBlocks() : [];
            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i];
                if (block.name !== 'air') {
                    textures[block.id] = generateTextureForBlock(block.name);
                }
            }
            return textures;
        }

        /**
         * Get the texture name mapping for a block ID.
         * @param {number} blockId - Block ID.
         * @returns {string|null} Primary texture name, or null.
         */
        function getTextureNameForBlock(blockId) {
            var block = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getBlockById(blockId) : null;
            return block ? block.name : null;
        }

        /**
         * Get the full name map for building atlas from paths.
         * @returns {Object.<number, string>} blockId -> texture filename.
         */
        function getNameMap() {
            var map = {};
            var blocks = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getAllBlocks() : [];
            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i];
                if (block.name !== 'air') {
                    map[block.id] = block.name;
                }
            }
            return map;
        }

        return {
            generateStone: generateStone,
            generateDirt: generateDirt,
            generateGrassTop: generateGrassTop,
            generateGrassSide: generateGrassSide,
            generateLogSide: generateLogSide,
            generateLogTop: generateLogTop,
            generateWood: generateWood,
            generatePlanks: generatePlanks,
            generateWool: generateWool,
            generateConcrete: generateConcrete,
            generateGlass: generateGlass,
            generateBricks: generateBricks,
            generateOre: generateOre,
            generateSand: generateSand,
            generateWater: generateWater,
            generateLava: generateLava,
            generateBedrock: generateBedrock,
            generateGlow: generateGlow,
            generateQuartzPillar: generateQuartzPillar,
            generateBasalt: generateBasalt,
            generatePolished: generatePolished,
            generateLeaves: generateLeaves,
            generateTNTSide: generateTNTSide,
            generateChestSide: generateChestSide,
            generateFurnaceFront: generateFurnaceFront,
            generateCraftingTable: generateCraftingTable,
            generateBookshelf: generateBookshelf,
            generateNetherrack: generateNetherrack,
            generateEndStone: generateEndStone,
            generateGoldBlock: generateGoldBlock,
            generateIronBlock: generateIronBlock,
            generateDiamondBlock: generateDiamondBlock,
            generateRedstoneBlock: generateRedstoneBlock,
            generateLapisBlock: generateLapisBlock,
            generateEmeraldBlock: generateEmeraldBlock,
            generateCoalBlock: generateCoalBlock,
            generateSlime: generateSlime,
            generateHoney: generateHoney,
            generateHayBale: generateHayBale,
            generateMelon: generateMelon,
            generatePumpkin: generatePumpkin,
            generateMushroom: generateMushroom,
            generateChorusPlant: generateChorusPlant,
            generateCactus: generateCactus,
            generateSugarCane: generateSugarCane,
            generateReeds: generateReeds,
            generateRedstoneLamp: generateRedstoneLamp,
            generateNoteBlock: generateNoteBlock,
            generateEndPortalFrame: generateEndPortalFrame,
            generateMossyStoneBrick: generateMossyStoneBrick,
            generateNetherBrick: generateNetherBrick,
            generatePolishedBlackstone: generatePolishedBlackstone,
            generatePolishedBasalt: generatePolishedBasalt,
            generateGlowstone: generateGlowstone,
            generateShroomlight: generateShroomlight,
            generatePrismarine: generatePrismarine,
            generateSnow: generateSnow,
            generateSnowBlock: generateSnowBlock,
            generateRedSand: generateRedSand,
            generateIce: generateIce,
            generateBlueIce: generateBlueIce,
            generateSponge: generateSponge,
            generateWetSponge: generateWetSponge,
            generateTerracotta: generateTerracotta,
            generateSandstone: generateSandstone,
            generateChiseledSandstone: generateChiseledSandstone,
            generateCutSandstone: generateCutSandstone,
            generateCoalOre: generateCoalOre,
            generateIronOre: generateIronOre,
            generateGoldOre: generateGoldOre,
            generateDiamondOre: generateDiamondOre,
            generateEmeraldOre: generateEmeraldOre,
            generateRedstoneOre: generateRedstoneOre,
            generateLitRedstoneOre: generateLitRedstoneOre,
            generateLapisOre: generateLapisOre,
            generateNetherQuartzOre: generateNetherQuartzOre,
            generateNetherGoldOre: generateNetherGoldOre,
            generateAncientDebris: generateAncientDebris,
            generateGildedBlackstone: generateGildedBlackstone,
            generateMagma: generateMagma,
            generateSoulSand: generateSoulSand,
            generateSoulSoil: generateSoulSoil,
            generateWarpedStem: generateWarpedStem,
            generateWarpedPlanks: generateWarpedPlanks,
            generateCrimsonStem: generateCrimsonStem,
            generateCrimsonPlanks: generateCrimsonPlanks,
            generateNylium: generateNylium,
            generateChain: generateChain,
            generateRedNetherBrick: generateRedNetherBrick,
            generateQuartzBlock: generateQuartzBlock,
            generateChiseledQuartz: generateChiseledQuartz,
            generateQuartzBricks: generateQuartzBricks,
            generatePurpurBlock: generatePurpurBlock,
            generatePurpurPillar: generatePurpurPillar,
            generateConcretePowder: generateConcretePowder,
            generateLilyPad: generateLilyPad,
            generateVine: generateVine,
            generateGrass: generateGrass,
            generateTallGrass: generateTallGrass,
            generateFern: generateFern,
            generateFlower: generateFlower,
            generateRoseBush: generateRoseBush,
            generateSunflower: generateSunflower,
            generateDeadBush: generateDeadBush,
            generateCaveVines: generateCaveVines,
            generateCocoa: generateCocoa,
            generatePistonSide: generatePistonSide,
            generateDispenser: generateDispenser,
            generateObserver: generateObserver,
            generateRepeater: generateRepeater,
            generateLever: generateLever,
            generateButton: generateButton,
            generatePressurePlate: generatePressurePlate,
            generateDoor: generateDoor,
            generateFence: generateFence,
            generateWall: generateWall,
            generateEndRod: generateEndRod,
            generateRedstoneTorch: generateRedstoneTorch,
            generateBed: generateBed,
            generateSign: generateSign,
            generateMirror: generateMirror,
            generateBrewingStand: generateBrewingStand,
            generateCauldron: generateCauldron,
            generatePainting: generatePainting,
            generateMobSpawner: generateMobSpawner,
            generateRespawnAnchor: generateRespawnAnchor,
            generateLantern: generateLantern,
            generateSoulLantern: generateSoulLantern,
            generateSculkSensor: generateSculkSensor,
            generateEndPortal: generateEndPortal,
            generateNetherPortal: generateNetherPortal,
            generateChiseledBookshelf: generateChiseledBookshelf,
            generateLectern: generateLectern,
            generateSmoker: generateSmoker,
            generateBlastFurnace: generateBlastFurnace,
            generateStructureBlock: generateStructureBlock,
            generateTarget: generateTarget,
            generateSweetBerryBush: generateSweetBerryBush,
            generateGlowLichen: generateGlowLichen,
            generateSporeBlossom: generateSporeBlossom,
            generatePointedDripstone: generatePointedDripstone,
            generateAzalea: generateAzalea,
            generateMossCarpet: generateMossCarpet,
            generatePitcherPlant: generatePitcherPlant,
            generateFrogspawn: generateFrogspawn,
            generateAxolotlBucket: generateAxolotlBucket,
            generatePowderSnowBucket: generatePowderSnowBucket,
            generateSnifferEgg: generateSnifferEgg,
            generateCherryLeaves: generateCherryLeaves,
            generateCherryWood: generateCherryWood,
            generateCherryPlanks: generateCherryPlanks,
            generateMangrovePlanks: generateMangrovePlanks,
            generateMangroveLog: generateMangroveLog,
            generateRoot: generateRoot,
            generateAttachedMelonStem: generateAttachedMelonStem,
            generateAttachedPumpkinStem: generateAttachedPumpkinStem,
            generateDeepslate: generateDeepslate,
            generateCobbledDeepslate: generateCobbledDeepslate,
            generatePolishedDeepslate: generatePolishedDeepslate,
            generatePolishedGranite: generatePolishedGranite,
            generatePolishedDiorite: generatePolishedDiorite,
            generatePolishedAndesite: generatePolishedAndesite,
            generateSmoothStone: generateSmoothStone,
            generateCoralBlock: generateCoralBlock,
            generateMissing: generateMissing,
            getGeneratorForBlock: getGeneratorForBlock,
            generateTextureForBlock: generateTextureForBlock,
            generateAllTextures: generateAllTextures,
            getTextureNameForBlock: getTextureNameForBlock,
            getNameMap: getNameMap,
            // Color map for reference
            COLOR_MAP: COLOR_MAP
        };
    })();

    // ============================================================
    // SoundGenerator — procedural sound generation via Web Audio API
    // ============================================================

    /**
     * SoundGenerator — generates sound effects using Web Audio API oscillators.
     */
    Donkeycraft.SoundGenerator = (function() {
        var _soundCache = {};

        /**
         * Create a short noise buffer for impact sounds.
         * @param {AudioContext} ctx - Audio context.
         * @param {number} duration - Duration in seconds.
         * @returns {AudioBuffer}
         * @private
         */
        function _createNoiseBuffer(ctx, duration) {
            var sampleRate = ctx.sampleRate;
            var length = sampleRate * duration;
            var buffer = ctx.createBuffer(1, length, sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3); // Decay
            }
            return buffer;
        }

        /**
         * Generate a block step sound.
         * @param {AudioContext} ctx
         * @param {string} material - Material type ("stone", "wood", "sand", etc.).
         * @returns {AudioBuffer}
         */
        function generateStepSound(ctx, material) {
            var key = 'step:' + (material || 'stone');
            if (_soundCache[key]) return _soundCache[key];

            var buffer = _createNoiseBuffer(ctx, 0.1);
            _soundCache[key] = buffer;
            return buffer;
        }

        /**
         * Generate a block break sound (crunchy noise).
         * @param {AudioContext} ctx
         * @param {string} material
         * @returns {AudioBuffer}
         */
        function generateBreakSound(ctx, material) {
            var key = 'break:' + (material || 'stone');
            if (_soundCache[key]) return _soundCache[key];

            var buffer = _createNoiseBuffer(ctx, 0.2);
            _soundCache[key] = buffer;
            return buffer;
        }

        /**
         * Generate a block place sound (thud).
         * @param {AudioContext} ctx
         * @param {string} material
         * @returns {AudioBuffer}
         */
        function generatePlaceSound(ctx, material) {
            var key = 'place:' + (material || 'stone');
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.15, ctx.sampleRate);
                var o2 = offline.createOscillator();
                var g2 = offline.createGain();
                o2.type = 'sine';
                o2.frequency.setValueAtTime(200, offline.currentTime);
                o2.frequency.exponentialRampToValueAtTime(100, offline.currentTime + 0.1);
                g2.gain.setValueAtTime(0.3, offline.currentTime);
                g2.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.1);
                o2.connect(g2);
                g2.connect(offline.destination);
                o2.start(offline.currentTime);
                o2.stop(offline.currentTime + 0.15);

                return offline.startRendering().then(function(renderedBuffer) {
                    _soundCache[key] = renderedBuffer;
                    return renderedBuffer;
                });
            } catch (e) {
                if (Donkeycraft.Logger) {
                    Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate place sound: ' + e.message);
                }
                return _createNoiseBuffer(ctx, 0.15);
            }
        }

        /**
         * Generate a block hit sound (clink).
         * @param {AudioContext} ctx
         * @param {string} material
         * @returns {AudioBuffer}
         */
        function generateHitSound(ctx, material) {
            var key = 'hit:' + (material || 'stone');
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.08, ctx.sampleRate);
            var osc = offline.createOscillator();
            var gain = offline.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, offline.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, offline.currentTime + 0.05);
            gain.gain.setValueAtTime(0.15, offline.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(offline.destination);
            osc.start(offline.currentTime);
            osc.stop(offline.currentTime + 0.1);

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate hit sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.08);
            }
        }

        /**
         * Generate a generic entity ambient sound.
         * @param {AudioContext} ctx
         * @param {string} type - Entity type ("passive", "hostile").
         * @returns {AudioBuffer}
         */
        function generateAmbientSound(ctx, type) {
            var key = 'ambient:' + (type || 'passive');
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.3, ctx.sampleRate);
                var osc = offline.createOscillator();
                var gain = offline.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(type === 'hostile' ? 150 : 300, offline.currentTime);
                osc.frequency.linearRampToValueAtTime(type === 'hostile' ? 100 : 250, offline.currentTime + 0.15);
                osc.frequency.linearRampToValueAtTime(type === 'hostile' ? 180 : 280, offline.currentTime + 0.3);
                gain.gain.setValueAtTime(0.1, offline.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.3);
                osc.connect(gain);
                gain.connect(offline.destination);
                osc.start(offline.currentTime);
                osc.stop(offline.currentTime + 0.35);

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate ambient sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.3);
            }
        }

        /**
         * Generate a hurt/death sound.
         * @param {AudioContext} ctx
         * @param {string} type
         * @returns {AudioBuffer}
         */
        function generateHurtSound(ctx, type) {
            var key = 'hurt:' + (type || 'entity');
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.2, ctx.sampleRate);
                var osc = offline.createOscillator();
                var gain = offline.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, offline.currentTime);
                osc.frequency.exponentialRampToValueAtTime(200, offline.currentTime + 0.15);
                gain.gain.setValueAtTime(0.12, offline.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.2);
                osc.connect(gain);
                gain.connect(offline.destination);
                osc.start(offline.currentTime);
                osc.stop(offline.currentTime + 0.25);

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate hurt sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.2);
            }
        }

        /**
         * Generate a footstep sound for walking.
         * @param {AudioContext} ctx
         * @returns {AudioBuffer}
         */
        function generateFootstepSound(ctx) {
            var key = 'footstep';
            if (_soundCache[key]) return _soundCache[key];

            var buffer = _createNoiseBuffer(ctx, 0.06);
            _soundCache[key] = buffer;
            return buffer;
        }

        /**
         * Generate a water splash sound.
         * @param {AudioContext} ctx
         * @returns {AudioBuffer}
         */
        function generateSplashSound(ctx) {
            var key = 'splash';
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.3, ctx.sampleRate);
                var buffer = _createNoiseBuffer(ctx, 0.3);
                var source = offline.createBufferSource();
                source.buffer = buffer;
                var filter = offline.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(1000, offline.currentTime);
                filter.Q.setValueAtTime(2, offline.currentTime);
                var gain = offline.createGain();
                gain.gain.setValueAtTime(0.2, offline.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.3);
                source.connect(filter);
                filter.connect(gain);
                gain.connect(offline.destination);
                source.start(offline.currentTime);

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate splash sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.3);
            }
        }

        /**
         * Generate a glass break sound (high-pitched shatter).
         * @param {AudioContext} ctx
         * @returns {AudioBuffer}
         */
        function generateGlassBreakSound(ctx) {
            var key = 'glass_break';
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.25, ctx.sampleRate);
                var buffer = _createNoiseBuffer(ctx, 0.25);
                var source = offline.createBufferSource();
                source.buffer = buffer;
                var filter = offline.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.setValueAtTime(3000, offline.currentTime);
                var gain = offline.createGain();
                gain.gain.setValueAtTime(0.15, offline.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.25);
                source.connect(filter);
                filter.connect(gain);
                gain.connect(offline.destination);
                source.start(offline.currentTime);

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate glass break sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.25);
            }
        }

        /**
         * Generate a pop sound (e.g., enderman teleport, blaze fireball).
         * @param {AudioContext} ctx
         * @returns {AudioBuffer}
         */
        function generatePopSound(ctx) {
            var key = 'pop';
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.15, ctx.sampleRate);
                var osc = offline.createOscillator();
                var gain = offline.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, offline.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1200, offline.currentTime + 0.05);
                osc.frequency.exponentialRampToValueAtTime(300, offline.currentTime + 0.15);
                gain.gain.setValueAtTime(0.2, offline.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.15);
                osc.connect(gain);
                gain.connect(offline.destination);
                osc.start(offline.currentTime);
                osc.stop(offline.currentTime + 0.2);

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate pop sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.15);
            }
        }

        /**
         * Generate an explosion sound.
         * @param {AudioContext} ctx
         * @returns {AudioBuffer}
         */
        function generateExplosionSound(ctx) {
            var key = 'explosion';
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.8, ctx.sampleRate);
                var buffer = _createNoiseBuffer(ctx, 0.8);
                var source = offline.createBufferSource();
                source.buffer = buffer;
                var filter = offline.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(500, offline.currentTime);
                filter.frequency.exponentialRampToValueAtTime(50, offline.currentTime + 0.8);
                var gain = offline.createGain();
                gain.gain.setValueAtTime(0.5, offline.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.8);
                source.connect(filter);
                filter.connect(gain);
                gain.connect(offline.destination);
                source.start(offline.currentTime);

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate explosion sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.8);
            }
        }

        /**
         * Generate a level-up / enchant sound.
         * @param {AudioContext} ctx
         * @returns {AudioBuffer}
         */
        function generateEnchantSound(ctx) {
            var key = 'enchant';
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.5, ctx.sampleRate);
                for (var i = 0; i < 3; i++) {
                    var osc = offline.createOscillator();
                    var gain = offline.createGain();
                    var startTime = offline.currentTime + i * 0.12;
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(400 + i * 200, startTime);
                    osc.frequency.exponentialRampToValueAtTime(800 + i * 300, startTime + 0.2);
                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
                    osc.connect(gain);
                    gain.connect(offline.destination);
                    osc.start(startTime);
                    osc.stop(startTime + 0.35);
                }

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate enchant sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.5);
            }
        }

        /**
         * Generate a drink/sip sound.
         * @param {AudioContext} ctx
         * @returns {AudioBuffer}
         */
        function generateDrinkSound(ctx) {
            var key = 'drink';
            if (_soundCache[key]) return _soundCache[key];

            try {
                var offline = new OfflineAudioContext(1, ctx.sampleRate * 0.4, ctx.sampleRate);
                var buffer = _createNoiseBuffer(ctx, 0.4);
                var source = offline.createBufferSource();
                source.buffer = buffer;
                var filter = offline.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(500, offline.currentTime);
                filter.Q.setValueAtTime(5, offline.currentTime);
                var gain = offline.createGain();
                gain.gain.setValueAtTime(0.15, offline.currentTime);
                gain.gain.linearRampToValueAtTime(0.2, offline.currentTime + 0.1);
                gain.gain.linearRampToValueAtTime(0.15, offline.currentTime + 0.3);
                gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.4);
                source.connect(filter);
                filter.connect(gain);
                gain.connect(offline.destination);
                source.start(offline.currentTime);

                return offline.startRendering().then(function(rb) {
                    _soundCache[key] = rb;
                    return rb;
                });
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('SoundGenerator', 'Failed to generate drink sound: ' + e.message);
                return _createNoiseBuffer(ctx, 0.4);
            }
        }

        /**
         * Get or generate a sound by category.
         * @param {AudioContext} ctx
         * @param {string} category - Sound category ("step", "break", "place", "hit", "footstep", "splash", "glass_break", "pop", "explosion", "enchant", "drink", "ambient", "hurt").
         * @param {string} [material] - Optional material specifier.
         * @returns {Promise<AudioBuffer>} Always returns a Promise for consistent API.
         */
        function getSound(ctx, category, material) {
            var result;
            switch (category) {
                case 'step': result = generateStepSound(ctx, material); break;
                case 'break': result = generateBreakSound(ctx, material); break;
                case 'place': result = generatePlaceSound(ctx, material); break;
                case 'hit': result = generateHitSound(ctx, material); break;
                case 'footstep': result = generateFootstepSound(ctx); break;
                case 'splash': result = generateSplashSound(ctx); break;
                case 'glass_break': result = generateGlassBreakSound(ctx); break;
                case 'pop': result = generatePopSound(ctx); break;
                case 'explosion': result = generateExplosionSound(ctx); break;
                case 'enchant': result = generateEnchantSound(ctx); break;
                case 'drink': result = generateDrinkSound(ctx); break;
                case 'ambient': result = generateAmbientSound(ctx, material); break;
                case 'hurt': result = generateHurtSound(ctx, material); break;
                default:
                    if (Donkeycraft.Logger) {
                        Donkeycraft.Logger.warn('SoundGenerator', 'Unknown sound category: ' + category);
                    }
                    result = _createNoiseBuffer(ctx, 0.1);
            }
            // Always return Promise<AudioBuffer> for consistent API
            return Promise.resolve(result);
        }

        /**
         * Get all available sound categories.
         * @returns {string[]}
         */
        function getCategories() {
            return ['step', 'break', 'place', 'hit', 'footstep', 'splash', 'glass_break', 'pop', 'explosion', 'enchant', 'drink', 'ambient', 'hurt'];
        }

        /**
         * Clear the sound cache.
         */
        function clearCache() {
            _soundCache = {};
        }

        /**
         * Check if a sound is cached.
         * @param {string} key
         * @returns {boolean}
         */
        function isCached(key) {
            return !!_soundCache[key];
        }

        return {
            getSound: getSound,
            getCategories: getCategories,
            clearCache: clearCache,
            isCached: isCached,
            // Expose individual generators for direct use
            generateStepSound: generateStepSound,
            generateBreakSound: generateBreakSound,
            generatePlaceSound: generatePlaceSound,
            generateHitSound: generateHitSound,
            generateFootstepSound: generateFootstepSound,
            generateSplashSound: generateSplashSound,
            generateGlassBreakSound: generateGlassBreakSound,
            generatePopSound: generatePopSound,
            generateExplosionSound: generateExplosionSound,
            generateEnchantSound: generateEnchantSound,
            generateDrinkSound: generateDrinkSound,
            generateAmbientSound: generateAmbientSound,
            generateHurtSound: generateHurtSound
        };
    })();

    // ============================================================
    // AssetManager — coordinates texture and sound generation
    // ============================================================

    /**
     * AssetManager — manages procedural asset generation for the game.
     */
    Donkeycraft.AssetManager = (function() {
        var _generatedTextures = null;
        var _audioContext = null;
        var _atlasCache = null; // Cached atlas canvas

        /**
         * Initialize the asset manager with an AudioContext.
         * @param {AudioContext} ctx - Web Audio API context.
         */
        function init(ctx) {
            _audioContext = ctx;
        }

        /**
         * Generate all textures for registered blocks.
         * @returns {Object.<number, HTMLImageElement>} Map of blockId -> texture image.
         */
        function generateAllBlockTextures() {
            _generatedTextures = Donkeycraft.TextureGenerator.generateAllTextures();
            return _generatedTextures;
        }

        /**
         * Get a generated texture for a block ID.
         * @param {number} blockId - Block ID.
         * @returns {HTMLImageElement|null}
         */
        function getTexture(blockId) {
            if (!_generatedTextures) return null;
            return _generatedTextures[blockId] || null;
        }

        /**
         * Get all generated textures.
         * @returns {Object.<number, HTMLImageElement>}
         */
        function getAllTextures() {
            return _generatedTextures;
        }

        /**
         * Preload sounds for common categories.
         * @param {string[]} categories - Sound categories to preload.
         * @returns {Promise[]} Array of promises.
         */
        function preloadSounds(categories) {
            if (!_audioContext) return [];
            var promises = [];
            for (var i = 0; i < categories.length; i++) {
                promises.push(Donkeycraft.SoundGenerator.getSound(_audioContext, categories[i]));
            }
            return promises;
        }

        /**
         * Preload all sounds.
         * @returns {Promise}
         */
        function preloadAllSounds() {
            if (!_audioContext) return Promise.resolve();
            var categories = Donkeycraft.SoundGenerator.getCategories();
            return Promise.all(Donkeycraft.SoundGenerator.getCategories().map(function(cat) {
                return Donkeycraft.SoundGenerator.getSound(_audioContext, cat);
            }));
        }

        /**
         * Get the texture name map for atlas building.
         * @returns {Object.<number, string>}
         */
        function getNameMap() {
            return Donkeycraft.TextureGenerator.getNameMap();
        }

        /**
         * Generate a procedural texture atlas image (1280×1280 canvas — ~500% larger than original 256×256).
         * Each texture cell is 80×80 pixels instead of 16×16.
         * Useful for debugging or saving to disk.
         * @returns {HTMLCanvasElement}
         */
        function generateAtlasCanvas() {
            // Return cached atlas if available
            if (_atlasCache) return _atlasCache;

            var CELL_SIZE = 80; // 5× larger than 16px
            var GRID_COLS = 32; // Increased to fit more blocks per row
            var atlasCanvas = document.createElement('canvas');
            var blocks = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getAllBlocks() : [];
            var maxId = 0;
            for (var i = 0; i < blocks.length; i++) {
                if (blocks[i].id > maxId) maxId = blocks[i].id;
            }
            // Dynamically size grid to fit all block IDs
            var gridRows = Math.ceil((maxId + 1) / GRID_COLS);
            atlasCanvas.width = CELL_SIZE * GRID_COLS;
            atlasCanvas.height = CELL_SIZE * gridRows;
            var ctx = atlasCanvas.getContext('2d');

            var textures = generateAllBlockTextures();

            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i];
                var id = block.id;

                var col = id % GRID_COLS;
                var row = Math.floor(id / GRID_COLS);
                var tex = textures[id];

                if (tex) {
                    ctx.drawImage(tex, col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                } else {
                    // Missing texture placeholder
                    ctx.fillStyle = '#FF00FF';
                    ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(col * CELL_SIZE + 4, row * CELL_SIZE + 4);
                    ctx.lineTo(col * CELL_SIZE + CELL_SIZE - 4, row * CELL_SIZE + CELL_SIZE - 4);
                    ctx.moveTo(col * CELL_SIZE + CELL_SIZE - 4, row * CELL_SIZE + 4);
                    ctx.lineTo(col * CELL_SIZE + 4, row * CELL_SIZE + CELL_SIZE - 4);
                    ctx.stroke();
                }
            }

            _atlasCache = atlasCanvas; // Cache for future calls
            return atlasCanvas;
        }

        /**
         * Get information about available assets.
         * @returns {Object} Asset statistics.
         */
        function getAssetInfo() {
            var blocks = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getAllBlocks() : [];
            var blockCount = blocks.length;
            var textureCount = _generatedTextures ? Object.keys(_generatedTextures).length : 0;
            var soundCategories = Donkeycraft.SoundGenerator.getCategories().length;

            return {
                totalBlocks: blockCount,
                generatedTextures: textureCount,
                soundCategories: soundCategories,
                hasAudioContext: !!_audioContext
            };
        }

        /**
         * Reset all cached data.
         */
        function reset() {
            _generatedTextures = null;
            _atlasCache = null; // Also clear atlas cache
            Donkeycraft.SoundGenerator.clearCache();
        }

        return {
            init: init,
            generateAllBlockTextures: generateAllBlockTextures,
            getTexture: getTexture,
            getAllTextures: getAllTextures,
            preloadSounds: preloadSounds,
            preloadAllSounds: preloadAllSounds,
            getNameMap: getNameMap,
            generateAtlasCanvas: generateAtlasCanvas,
            getAssetInfo: getAssetInfo,
            reset: reset
        };
    })();

    // ============================================================
    // AssetGenerator — simple Promise-based wrapper for init-sequence
    // ============================================================

    /**
     * AssetGenerator — thin Promise-based wrapper around TextureGenerator + AssetManager.
     * Used by init-sequence.js to generate all procedural textures before the game loop starts.
     * @namespace
     */
    Donkeycraft.AssetGenerator = (function() {
        /**
         * Generate all procedural block textures and return them as a Promise.
         * @returns {Promise<Object>} Resolves with { blockId: HTMLImageElement } map.
         */
        function generateAllTextures() {
            return new Promise(function(resolve) {
                try {
                    // Ensure BlockRegistry is available
                    if (!Donkeycraft.BlockRegistry || !Donkeycraft.TextureGenerator) {
                        Donkeycraft.Logger.warn('AssetGenerator', 'BlockRegistry or TextureGenerator not available — skipping texture generation');
                        resolve({});
                        return;
                    }

                    // Generate all textures via TextureGenerator
                    var textures = Donkeycraft.TextureGenerator.generateAllTextures();

                    // Initialize AssetManager if needed
                    if (!Donkeycraft.AssetManager) {
                        Donkeycraft.Logger.warn('AssetGenerator', 'AssetManager not available');
                        resolve(textures || {});
                        return;
                    }

                    // Store generated textures in AssetManager for later retrieval
                    Donkeycraft.AssetManager.generateAllBlockTextures();

                    Donkeycraft.Logger.info('AssetGenerator', 'Generated ' + (Object.keys(textures || {}).length) + ' block textures');
                    resolve(textures || {});
                } catch (e) {
                    Donkeycraft.Logger.error('AssetGenerator', 'Texture generation failed: ' + e.message);
                    resolve({}); // Graceful fallback — terrain-renderer will use placeholder
                }
            });
        }

        /**
         * Generate a missing-texture checkerboard image for fallback rendering.
         * @returns {HTMLImageElement|null} HTML image element, or null if canvas not available.
         */
        function generateMissingTexture() {
            try {
                var canvas = document.createElement('canvas');
                canvas.width = 16;
                canvas.height = 16;
                var ctx = canvas.getContext('2d');

                // Checkerboard pattern: alternating white and magenta squares
                var size = 8;
                for (var row = 0; row < 2; row++) {
                    for (var col = 0; col < 2; col++) {
                        ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#ff00ff';
                        ctx.fillRect(col * size, row * size, size, size);
                    }
                }

                // Draw "X" to indicate missing
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(2, 2);
                ctx.lineTo(14, 14);
                ctx.moveTo(14, 2);
                ctx.lineTo(2, 14);
                ctx.stroke();

                var img = new Image();
                img.src = canvas.toDataURL('image/png');
                return img;
            } catch (e) {
                if (Donkeycraft.Logger) {
                    Donkeycraft.Logger.error('AssetGenerator', 'Failed to generate missing texture: ' + e.message);
                }
                return null;
            }
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The AssetGenerator module.
         */
        function getInstance() {
            return Donkeycraft.AssetGenerator;
        }

        return {
            getInstance: getInstance,
            generateAllTextures: generateAllTextures,
            generateMissingTexture: generateMissingTexture
        };
    })();

    // ============================================================
    // TextureGenerator — add generateMissing() fallback method
    // ============================================================

    // Add generateMissing to TextureGenerator if it doesn't exist yet
    if (typeof Donkeycraft.TextureGenerator === 'object' && typeof Donkeycraft.TextureGenerator.generateAllTextures === 'function') {
        // Only add generateMissing if not already defined
        if (typeof Donkeycraft.TextureGenerator.generateMissing !== 'function') {
            Donkeycraft.TextureGenerator.generateMissing = function() {
                return Donkeycraft.AssetGenerator ? Donkeycraft.AssetGenerator.generateMissingTexture() : null;
            };
        }
    }

})();
