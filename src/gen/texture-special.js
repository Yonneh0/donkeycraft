// Donkeycraft — Special Textures
// Nether, End, glow, basalt, slime, honey, prismarine, and other special block textures.
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

    // ---- Glow / special surface ----

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

    // ---- Basalt family ----

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
                var n = (_rng() - 0.5) * 6;
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
     * Generate a polished basalt texture with seeded noise.
     * @returns {HTMLImageElement}
     */
    function generatePolishedBasalt() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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

    // ---- Slime / Honey ----

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
                var isGrid = x % 4 === 0 || y % 4 === 0;
                var brightness = isGrid ? 0.7 : 1.0;
                var n = (_rng() - 0.5) * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, r * brightness + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g * brightness + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b * brightness + n));
                imgData.data[idx + 3] = 200;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

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
                imgData.data[idx + 3] = 220;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ---- Prismarine family ----

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

    // ---- Nether wood ----

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
     * Generate a nylium texture (netherrack with nylium growth) using seeded noise.
     * @param {boolean} isWarped - Whether warped (blue-green) or crimson (red).
     * @returns {HTMLImageElement}
     */
    function generateNylium(isWarped) {
        _shufflePerm(isWarped ? 2222 : 3333);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
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

    // ---- Nether special blocks ----

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
        for (var i = 0; i < 12; i++) {
            ctx.fillStyle = 'rgba(255, 240, 150, 0.6)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

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
        for (var i = 0; i < 10; i++) {
            ctx.fillStyle = 'rgba(255, 100, 50, 0.5)';
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
        ctx.fillStyle = '#8B6040';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#CC4400';
        var cracks = [{ x: 2, y: 3 }, { x: 8, y: 2 }, { x: 5, y: 8 }, { x: 11, y: 10 }, { x: 3, y: 13 }];
        for (var i = 0; i < cracks.length; i++) {
            ctx.fillRect(cracks[i].x, cracks[i].y, 3, 2);
        }
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
     * Generate an ancient debris texture.
     * @returns {HTMLImageElement}
     */
    function generateAncientDebris() {
        _shufflePerm(8888);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
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
        var debrisPositions = [{ x: 6, y: 5 }, { x: 9, y: 8 }, { x: 7, y: 11 }];
        for (var i = 0; i < debrisPositions.length; i++) {
            ctx.fillStyle = '#BB8844';
            ctx.fillRect(debrisPositions[i].x, debrisPositions[i].y, 2, 2);
        }
        return _canvasToImage(canvas);
    }

    /**
     * Generate a gilded blackstone texture with seeded noise and gold specks.
     * @returns {HTMLImageElement}
     */
    function generateGildedBlackstone() {
        _seedRng(7777);
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
        for (var i = 0; i < 6; i++) {
            ctx.fillStyle = 'rgba(200, 170, 50, 0.7)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

    // ---- End blocks ----

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
     * Generate a purpur block texture.
     * @returns {HTMLImageElement}
     */
    function generatePurpurBlock() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#AA77C0';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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

    // ---- Hay bale ----

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

    // ---- Nether brick variants ----

    /**
     * Generate a nether brick texture.
     * @returns {HTMLImageElement}
     */
    function generateNetherBrick() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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
     * Generate a red nether brick texture.
     * @returns {HTMLImageElement}
     */
    function generateRedNetherBrick() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
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

    // ---- Mossy stone brick ----

    /**
     * Generate a mossy stone brick texture.
     * @returns {HTMLImageElement}
     */
    function generateMossyStoneBrick() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#889988';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#557744';
        var mosses = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 10, y: 10 }];
        for (var i = 0; i < mosses.length; i++) {
            ctx.fillRect(mosses[i].x, mosses[i].y, 4, 4);
        }
        ctx.strokeStyle = '#667766';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 8); ctx.lineTo(TEX_SIZE, 8);
        ctx.moveTo(8, 0); ctx.lineTo(8, TEX_SIZE);
        ctx.stroke();
        return _canvasToImage(canvas);
    }

    // Export special texture generators.
    Donkeycraft.TextureGenerator.generateGlow = generateGlow;
    Donkeycraft.TextureGenerator.generateBedrock = generateBedrock;
    Donkeycraft.TextureGenerator.generateBasalt = generateBasalt;
    Donkeycraft.TextureGenerator.generatePolished = generatePolished;
    Donkeycraft.TextureGenerator.generatePolishedBasalt = generatePolishedBasalt;
    Donkeycraft.TextureGenerator.generateSlime = generateSlime;
    Donkeycraft.TextureGenerator.generateHoney = generateHoney;
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
    Donkeycraft.TextureGenerator.generateGildedBlackstone = generateGildedBlackstone;
    Donkeycraft.TextureGenerator.generateEndStone = generateEndStone;
    Donkeycraft.TextureGenerator.generatePurpurBlock = generatePurpurBlock;
    Donkeycraft.TextureGenerator.generatePurpurPillar = generatePurpurPillar;
    Donkeycraft.TextureGenerator.generateHayBale = generateHayBale;
    Donkeycraft.TextureGenerator.generateNetherBrick = generateNetherBrick;
    Donkeycraft.TextureGenerator.generateRedNetherBrick = generateRedNetherBrick;
    Donkeycraft.TextureGenerator.generateMossyStoneBrick = generateMossyStoneBrick;

})();