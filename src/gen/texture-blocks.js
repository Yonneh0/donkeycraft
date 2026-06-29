// Donkeycraft — Block Textures
// Glass, ice, bricks, ores, metal blocks, deepslate family, and quartz variants.
// Provides procedural textures for all non-terrain blocks using the shared TextureGenerator infrastructure.
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
    // Glass / Ice — transparent and translucent block textures
    // ============================================================

    /**
     * Generate a glass texture with transparency and edge highlights.
     * Creates a semi-transparent surface with brighter borders to simulate glass edges.
     * @param {number} r - Base red value (0–255).
     * @param {number} g - Base green value (0–255).
     * @param {number} b - Base blue value (0–255).
     * @returns {HTMLImageElement|null} Generated 16×16 glass texture, or null on failure.
     */
    function generateGlass(r, g, b) {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
     * Produces a light blue translucent surface with subtle grain.
     * @returns {HTMLImageElement|null} Generated 16×16 ice texture, or null on failure.
     */
    function generateIce() {
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
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 180 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 210 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 240 + n));
                imgData.data[idx + 3] = 160;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a blue ice texture — more opaque with deeper blue tones.
     * Used for packed/blue ice variants in Minecraft.
     * @returns {HTMLImageElement|null} Generated 16×16 blue ice texture, or null on failure.
     */
    function generateBlueIce() {
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
                var n = (_rng() - 0.5) * 8;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 100 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 160 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 230 + n));
                imgData.data[idx + 3] = 230;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Bricks — patterned brick textures with mortar lines
    // ============================================================

    /**
     * Generate a brick texture with seeded color variation and mortar pattern.
     * Creates a classic running bond pattern with gray mortar lines and individually shaded bricks.
     * @param {number} r - Base red value for brick (0–255).
     * @param {number} g - Base green value for brick (0–255).
     * @param {number} b - Base blue value for brick (0–255).
     * @returns {HTMLImageElement|null} Generated 16×16 brick texture, or null on failure.
     */
    function generateBricks(r, g, b) {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(r + g + b);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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

    // ============================================================
    // Ores — ore veins embedded in stone/netherrack base
    // ============================================================

    /**
     * Generate an ore texture with ore veins embedded in a stone background.
     * Creates a stone base using FBM noise, then overlays ore-colored pixel clusters at fixed positions
     * with probabilistic edge variation for natural-looking ore distribution.
     * @param {number} oreR - Ore color red component (0–255).
     * @param {number} oreG - Ore color green component (0–255).
     * @param {number} oreB - Ore color blue component (0–255).
     * @returns {HTMLImageElement|null} Generated 16×16 ore texture, or null on failure.
     */
    function generateOre(oreR, oreG, oreB) {
        if (!_shufflePerm || !_fbm || !_seedRng || !_rng) {
            return null;
        }

        _shufflePerm(7777);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 4, 1.0, 1.0);
                var base = 120 + n * 30;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, base));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, base));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, base + 5));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        // Fixed ore cluster positions for consistent texture appearance
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

    /** Ore texture — dark gray coal veins in stone. @returns {HTMLImageElement|null} */
    function generateCoalOre()       { return generateOre(30, 30, 30); }
    /** Ore texture — light brown iron veins in stone. @returns {HTMLImageElement|null} */
    function generateIronOre()       { return generateOre(210, 180, 150); }
    /** Ore texture — yellow gold veins in stone. @returns {HTMLImageElement|null} */
    function generateGoldOre()       { return generateOre(237, 201, 36); }
    /** Ore texture — cyan diamond veins in stone. @returns {HTMLImageElement|null} */
    function generateDiamondOre()    { return generateOre(80, 220, 230); }
    /** Ore texture — green emerald veins in stone. @returns {HTMLImageElement|null} */
    function generateEmeraldOre()    { return generateOre(40, 220, 80); }
    /** Ore texture — red redstone veins in stone. @returns {HTMLImageElement|null} */
    function generateRedstoneOre()   { return generateOre(180, 20, 20); }
    /** Ore texture — blue lapis veins in stone. @returns {HTMLImageElement|null} */
    function generateLapisOre()      { return generateOre(30, 60, 180); }

    /**
     * Generate a lit redstone ore texture — glowing red ore in stone.
     * Uses the stone generator as a base, then overlays a bright red glow.
     * @returns {HTMLImageElement|null} Generated 16×16 lit redstone ore texture, or null on failure.
     */
    function generateLitRedstoneOre() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var stoneImg = Donkeycraft.TextureGenerator.generateStone(1234);
        if (stoneImg) {
            ctx.drawImage(stoneImg, 0, 0);
        }
        ctx.fillStyle = '#FF2200';
        ctx.fillRect(5, 5, 6, 6);
        ctx.fillStyle = '#FF6644';
        ctx.fillRect(6, 6, 4, 4);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a nether quartz ore texture — cream-colored veins in netherrack base.
     * @returns {HTMLImageElement|null} Generated 16×16 nether quartz ore texture, or null on failure.
     */
    function generateNetherQuartzOre() {
        if (!_shufflePerm || !_fbm || !_seedRng || !_rng) {
            return null;
        }

        _shufflePerm(4444);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 140 + n * 40));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 60 + n * 25));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 60 + n * 20));
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
     * Generate a nether gold ore texture — gold-colored veins in netherrack base.
     * @returns {HTMLImageElement|null} Generated 16×16 nether gold ore texture, or null on failure.
     */
    function generateNetherGoldOre() {
        if (!_shufflePerm || !_fbm || !_seedRng || !_rng) {
            return null;
        }

        _shufflePerm(4444);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.15, y * 0.15, 3, 1.0, 1.0);
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 140 + n * 40));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 60 + n * 25));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 60 + n * 20));
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

    // ============================================================
    // Metal Blocks — solid ingot/block textures with sparkle
    // ============================================================

    /**
     * Generate a gold block texture — shiny yellow with subtle noise and specular highlights.
     * @returns {HTMLImageElement|null} Generated 16×16 gold block texture, or null on failure.
     */
    function generateGoldBlock() {
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
                var n = (_rng() - 0.5) * 12;
                var highlight = ((x + y) % 4 === 0) ? 15 : 0;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 237 + n + highlight));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 201 + n + highlight));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 36 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate an iron block texture — light gray with grid pattern and noise overlay.
     * @returns {HTMLImageElement|null} Generated 16×16 iron block texture, or null on failure.
     */
    function generateIronBlock() {
        if (!_seedRng || !_rng) {
            return null;
        }

        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
            imgData.data[i]     = Math.max(0, Math.min(255, imgData.data[i] + n));
            imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + n));
            imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + n));
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a diamond block texture — cyan with random sparkle highlights.
     * @returns {HTMLImageElement|null} Generated 16×16 diamond block texture, or null on failure.
     */
    function generateDiamondBlock() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
     * Generate a redstone block texture — dark red with subtle darker specks.
     * @returns {HTMLImageElement|null} Generated 16×16 redstone block texture, or null on failure.
     */
    function generateRedstoneBlock() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
     * Generate a lapis block texture — deep blue with subtle lighter specks.
     * @returns {HTMLImageElement|null} Generated 16×16 lapis block texture, or null on failure.
     */
    function generateLapisBlock() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
     * Generate an emerald block texture — vibrant green with lighter specks.
     * @returns {HTMLImageElement|null} Generated 16×16 emerald block texture, or null on failure.
     */
    function generateEmeraldBlock() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
     * Generate a coal block texture — dark gray with subtle lighter specks.
     * @returns {HTMLImageElement|null} Generated 16×16 coal block texture, or null on failure.
     */
    function generateCoalBlock() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < 8; i++) {
            ctx.fillStyle = 'rgba(60, 60, 60, 0.7)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Quartz Variants — white/yellowish quartz blocks and pillars
    // ============================================================

    /**
     * Generate a quartz pillar texture — horizontal stripes with subtle noise overlay.
     * @returns {HTMLImageElement|null} Generated 16×16 quartz pillar texture, or null on failure.
     */
    function generateQuartzPillar() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(777);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

        var ctx = canvas.getContext('2d');
        for (var y = 0; y < TEX_SIZE; y++) {
            var isStripe = y % 4 < 2;
            ctx.fillStyle = isStripe ? '#E8E0D0' : '#D8D0C0';
            ctx.fillRect(0, y, TEX_SIZE, 1);
        }
        var imgData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < imgData.data.length; i += 4) {
            var n = (_rng() - 0.5) * 8;
            imgData.data[i]     = Math.max(0, Math.min(255, imgData.data[i] + n));
            imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + n));
            imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + n));
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a plain quartz block texture — cream color with horizontal seam.
     * @returns {HTMLImageElement|null} Generated 16×16 quartz block texture, or null on failure.
     */
    function generateQuartzBlock() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
     * Generate a chiseled quartz block texture — plain quartz with vertical seam.
     * @returns {HTMLImageElement|null} Generated 16×16 chiseled quartz texture, or null on failure.
     */
    function generateChiseledQuartz() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
     * Generate a quartz brick texture — cream base with small brick pattern.
     * @returns {HTMLImageElement|null} Generated 16×16 quartz bricks texture, or null on failure.
     */
    function generateQuartzBricks() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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

    // ============================================================
    // Deepslate Family — polished and cobbled deepslate variants
    // ============================================================

    /**
     * Generate a deepslate texture — dark gray-blue with noise variation.
     * @returns {HTMLImageElement|null} Generated 16×16 deepslate texture, or null on failure.
     */
    function generateDeepslate() {
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
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 70 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 80 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 90 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a cobbled deepslate texture — dark cobblestone pattern with seeded stone shades.
     * @returns {HTMLImageElement|null} Generated 16×16 cobbled deepslate texture, or null on failure.
     */
    function generateCobbledDeepslate() {
        if (!_seedRng || !_rng) {
            return null;
        }

        _seedRng(777);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;

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
     * Generate a polished deepslate texture — smooth dark stone with subtle noise.
     * @returns {HTMLImageElement|null} Generated 16×16 polished deepslate texture, or null on failure.
     */
    function generatePolishedDeepslate() {
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
                var n = (_rng() - 0.5) * 8;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx]     = Math.max(0, Math.min(255, 60 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 70 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 80 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Export all block texture generators on TextureGenerator
    // ============================================================

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