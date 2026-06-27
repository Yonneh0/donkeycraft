// Donkeycraft — Block Textures
// Glass, ice, bricks, ores, metal blocks, and related block textures.
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

    // ---- Glass / Ice ----

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
                imgData.data[idx + 3] = 160;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

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
                imgData.data[idx + 3] = 230;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ---- Bricks ----

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
        ctx.fillStyle = '#999999';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        var brickH = 3;
        var mortarW = 1;
        for (var row = 0; row < TEX_SIZE; row += brickH) {
            var offset = (row % (brickH * 2) === 0) ? 0 : 4;
            for (var col = -4 + offset; col < TEX_SIZE; col += 8) {
                var bx = col;
                var by = row;
                var brickR = r + (_rng() - 0.5) * 15;
                var brickG = g + (_rng() - 0.5) * 10;
                var brickB = b + (_rng() - 0.5) * 8;
                ctx.fillStyle = 'rgb(' + Math.max(0, Math.min(255, brickR)) + ',' + Math.max(0, Math.min(255, brickG)) + ',' + Math.max(0, Math.min(255, brickB)) + ')';
                ctx.fillRect(bx + mortarW, by + mortarW, 7 - mortarW, brickH - mortarW);
            }
        }
        return _canvasToImage(canvas);
    }

    // ---- Ore ----

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
        var orePositions = [
            { x: 4, y: 3 }, { x: 10, y: 5 }, { x: 6, y: 10 },
            { x: 12, y: 12 }, { x: 3, y: 13 }
        ];
        _seedRng(oreR + oreG + oreB);
        for (var i = 0; i < orePositions.length; i++) {
            var pos = orePositions[i];
            ctx.fillStyle = 'rgb(' + oreR + ',' + oreG + ',' + oreB + ')';
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

    // Ore aliases.
    function generateCoalOre()       { return generateOre(30, 30, 30); }
    function generateIronOre()       { return generateOre(210, 180, 150); }
    function generateGoldOre()       { return generateOre(237, 201, 36); }
    function generateDiamondOre()    { return generateOre(80, 220, 230); }
    function generateEmeraldOre()    { return generateOre(40, 220, 80); }
    function generateRedstoneOre()   { return generateOre(180, 20, 20); }
    function generateLapisOre()      { return generateOre(30, 60, 180); }

    /**
     * Generate a lit redstone ore texture (glowing red).
     * @returns {HTMLImageElement}
     */
    function generateLitRedstoneOre() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var stoneImg = Donkeycraft.TextureGenerator.generateStone(1234);
        ctx.drawImage(stoneImg, 0, 0);
        ctx.fillStyle = '#FF2200';
        ctx.fillRect(5, 5, 6, 6);
        ctx.fillStyle = '#FF6644';
        ctx.fillRect(6, 6, 4, 4);
        return _canvasToImage(canvas);
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
        var quartzPositions = [{ x: 5, y: 4 }, { x: 11, y: 8 }, { x: 7, y: 12 }];
        for (var i = 0; i < quartzPositions.length; i++) {
            ctx.fillStyle = '#E8D8C0';
            ctx.fillRect(quartzPositions[i].x, quartzPositions[i].y, 2, 2);
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
        var goldPositions = [{ x: 4, y: 5 }, { x: 10, y: 10 }, { x: 8, y: 3 }];
        for (var i = 0; i < goldPositions.length; i++) {
            ctx.fillStyle = '#DDAA33';
            ctx.fillRect(goldPositions[i].x, goldPositions[i].y, 2, 2);
        }
        return _canvasToImage(canvas);
    }

    // ---- Metal blocks ----

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
        ctx.fillStyle = '#D4C4A8';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.strokeStyle = '#B0A080';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, 7, 7);
        ctx.strokeRect(8.5, 0.5, 7, 7);
        ctx.strokeRect(0.5, 8.5, 7, 7);
        ctx.strokeRect(8.5, 8.5, 7, 7);
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
     * Generate a diamond block texture (cyan with sparkle) using seeded noise.
     * @returns {HTMLImageElement}
     */
    function generateDiamondBlock() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#55DDDD';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < 8; i++) {
            ctx.fillStyle = 'rgba(200, 255, 255, 0.6)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

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
        for (var i = 0; i < 15; i++) {
            ctx.fillStyle = 'rgba(80, 10, 10, 0.5)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

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
        for (var i = 0; i < 12; i++) {
            ctx.fillStyle = 'rgba(40, 60, 160, 0.6)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

    /**
     * Generate an emerald block texture with seeded green specks.
     * @returns {HTMLImageElement}
     */
    function generateEmeraldBlock() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#33BB55';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < 10; i++) {
            ctx.fillStyle = 'rgba(80, 220, 100, 0.5)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

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
        for (var i = 0; i < 8; i++) {
            ctx.fillStyle = 'rgba(60, 60, 60, 0.7)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

    // ---- Quartz variants ----

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
     * Generate a quartz block texture.
     * @returns {HTMLImageElement}
     */
    function generateQuartzBlock() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#E8DCC8';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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

    // ---- Deepslate family ----

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

    // Export block texture generators.
    Donkeycraft.TextureGenerator.generateGlass = generateGlass;
    Donkeycraft.TextureGenerator.generateIce = generateIce;
    Donkeycraft.TextureGenerator.generateBlueIce = generateBlueIce;
    Donkeycraft.TextureGenerator.generateBricks = generateBricks;
    Donkeycraft.TextureGenerator.generateOre = generateOre;
    Donkeycraft.TextureGenerator.generateCoalOre = generateCoalOre;
    Donkeycraft.TextureGenerator.generateIronOre = generateIronOre;
    Donkeycraft.TextureGenerator.generateGoldOre = generateGoldOre;
    Donkeycraft.TextureGenerator.generateDiamondOre = generateDiamondOre;
    Donkeycraft.TextureGenerator.generateEmeraldOre = generateEmeraldOre;
    Donkeycraft.TextureGenerator.generateRedstoneOre = generateRedstoneOre;
    Donkeycraft.TextureGenerator.generateLitRedstoneOre = generateLitRedstoneOre;
    Donkeycraft.TextureGenerator.generateLapisOre = generateLapisOre;
    Donkeycraft.TextureGenerator.generateNetherQuartzOre = generateNetherQuartzOre;
    Donkeycraft.TextureGenerator.generateNetherGoldOre = generateNetherGoldOre;
    Donkeycraft.TextureGenerator.generateGoldBlock = generateGoldBlock;
    Donkeycraft.TextureGenerator.generateIronBlock = generateIronBlock;
    Donkeycraft.TextureGenerator.generateDiamondBlock = generateDiamondBlock;
    Donkeycraft.TextureGenerator.generateRedstoneBlock = generateRedstoneBlock;
    Donkeycraft.TextureGenerator.generateLapisBlock = generateLapisBlock;
    Donkeycraft.TextureGenerator.generateEmeraldBlock = generateEmeraldBlock;
    Donkeycraft.TextureGenerator.generateCoalBlock = generateCoalBlock;
    Donkeycraft.TextureGenerator.generateQuartzPillar = generateQuartzPillar;
    Donkeycraft.TextureGenerator.generateQuartzBlock = generateQuartzBlock;
    Donkeycraft.TextureGenerator.generateChiseledQuartz = generateChiseledQuartz;
    Donkeycraft.TextureGenerator.generateQuartzBricks = generateQuartzBricks;
    Donkeycraft.TextureGenerator.generateDeepslate = generateDeepslate;
    Donkeycraft.TextureGenerator.generateCobbledDeepslate = generateCobbledDeepslate;
    Donkeycraft.TextureGenerator.generatePolishedDeepslate = generatePolishedDeepslate;

})();