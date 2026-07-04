// Donkeycraft — Decorative Textures & Block Mapping
// Plants, redstone, doors, fences, liquids, special blocks, block name → generator mapping.
(function () {
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

    // Cross-module aliases: import functions from other texture-* modules.
    // These are resolved lazily at call time to handle any load order.
    // From texture-special.js and texture-terrain.js (loaded before this file).
    // Using inline resolution instead of top-level capture ensures functions exist
    // even if modules load in unexpected order.

    /**
     * Resolve a function from TextureGenerator by name.
     * @param {string} fnName - Function name on TextureGenerator.
     * @returns {Function|null}
     */
    function _get(fnName) {
        return Donkeycraft.TextureGenerator[fnName] || null;
    }

    /**
     * Resolve and call a texture generator from Donkeycraft.TextureGenerator.
     * Handles any load order — resolves at call time, not module load time.
     * @param {string} name - Function name on TextureGenerator.
     * @param {Array} args - Arguments to pass to the function.
     * @returns {HTMLImageElement|null}
     */
    function _genCall(name, args) {
        var fn = Donkeycraft.TextureGenerator[name];
        if (typeof fn === 'function') {
            return fn.apply(null, args);
        }
        return null;
    }

    // ============================================================
    // Helper functions needed by getGeneratorForBlock
    // ============================================================

    /**
     * Generate red sand texture — delegates to cross-module sand generator.
     * @returns {HTMLImageElement}
     */
    function generateRedSand() {
        var gen = _get('generateSand');
        if (gen) return gen(183, 105, 63);
        // Fallback: inline procedural sand
        _seedRng(183 + 105 + 63);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 25;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, 183 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 105 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 63 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a snow block texture — delegates to cross-module snow generator.
     * @returns {HTMLImageElement}
     */
    function generateSnowBlock() {
        var gen = _get('generateSnow');
        if (gen) return gen();
        // Fallback: inline procedural snow
        _seedRng(0);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, 245 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 248 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 255));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // Functions defined locally in this file

    /**
     * Generate a warped planks texture (teal/green with subtle vertical lines).
     * @returns {HTMLImageElement}
     */
    function generateWarpedPlanks() {
        _seedRng(2222);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        for (var py = 0; py < TEX_SIZE; py++) {
            for (var px = 0; px < TEX_SIZE; px++) {
                var plankX = px % 4;
                var n = _fbm(px * 0.1, py * 0.1, 2, 1.0, 1.0);
                var variation = plankX === 0 ? -8 : 0;
                var cr = Math.max(0, Math.min(255, 60 + variation + n * 10));
                var cg = Math.max(0, Math.min(255, 160 + variation + n * 15));
                var cb = Math.max(0, Math.min(255, 155 + variation + n * 12));
                ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
                ctx.fillRect(px, py, 1, 1);
            }
        }
        return _canvasToImage(canvas);
    }

    /**
     * Generate a crimson planks texture (deep red with subtle vertical lines).
     * @returns {HTMLImageElement}
     */
    function generateCrimsonPlanks() {
        _seedRng(3333);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        for (var py = 0; py < TEX_SIZE; py++) {
            for (var px = 0; px < TEX_SIZE; px++) {
                var plankX = px % 4;
                var n = _fbm(px * 0.1, py * 0.1, 2, 1.0, 1.0);
                var variation = plankX === 0 ? -8 : 0;
                var cr = Math.max(0, Math.min(255, 160 + variation + n * 15));
                var cg = Math.max(0, Math.min(255, 45 + variation + n * 10));
                var cb = Math.max(0, Math.min(255, 45 + variation + n * 8));
                ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
                ctx.fillRect(px, py, 1, 1);
            }
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
                imgData.data[idx] = 180 + n;
                imgData.data[idx + 1] = 120 + n;
                imgData.data[idx + 2] = 120 + n;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
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
        ctx.fillRect(6, 0, 4, 5);
        ctx.fillRect(6, 7, 4, 5);
        ctx.fillRect(6, 14, 4, 2);
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(7, 1, 2, 3);
        ctx.fillRect(7, 8, 2, 3);
        return _canvasToImage(canvas);
    }

    // ============================================================
    // Decorative / Plant Textures
    // ============================================================

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
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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
     * Generate a TNT side texture with seeded noise variation.
     * @returns {HTMLImageElement}
     */
    function generateTNTSide() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#CC3333';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#EEEEEE';
        ctx.fillRect(0, 6, TEX_SIZE, 4);
        var imgData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < imgData.data.length; i += 4) {
            var n = (_rng() - 0.5) * 15;
            imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + n));
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
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#6B4F12';
        ctx.fillRect(0, 7, TEX_SIZE, 2);
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
        ctx.fillStyle = '#B0B0B0';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#333333';
        ctx.fillRect(4, 5, 8, 7);
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
        ctx.fillStyle = '#BC9862';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        var colors = ['#CC3333', '#336699', '#339933', '#996633', '#663399'];
        for (var row = 0; row < 2; row++) {
            for (var book = 0; book < 5; book++) {
                ctx.fillStyle = colors[(row * 5 + book) % colors.length];
                ctx.fillRect(book * 3 + 1, row * 7 + 2, 2, 5);
            }
        }
        return _canvasToImage(canvas);
    }

    // ---- Liquids ----

    /**
     * Generate a water texture with procedural noise variation.
     * Creates a translucent blue surface using FBM noise for organic movement.
     * @returns {HTMLImageElement|null} Generated 16×16 water texture, or null on failure.
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
                imgData.data[idx] = 30 + n * 20;
                imgData.data[idx + 1] = 80 + n * 40;
                imgData.data[idx + 2] = 180 + n * 40;
                imgData.data[idx + 3] = 180;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a lava texture (glowing orange/red) with procedural noise.
     * Uses layered Perlin noise for organic, animated-looking surface variation.
     * @returns {HTMLImageElement|null} Generated 16×16 lava texture, or null on failure.
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
                imgData.data[idx] = 200 + n1 * 55;
                imgData.data[idx + 1] = 60 + n2 * 80;
                imgData.data[idx + 2] = 10 + n1 * 20;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // ---- Plants / decor ----

    /**
     * Generate a lily pad texture with organic edge variation.
     * Draws a green oval with a characteristic notch on one side and vein lines.
     * @returns {HTMLImageElement|null} Generated 16×16 lily pad texture, or null on failure.
     */
    function generateLilyPad() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#44AA22';
        ctx.beginPath();
        ctx.arc(8, 8, 7, 0.3, Math.PI * 2 - 0.3);
        ctx.lineTo(8, 8);
        ctx.fill();
        ctx.strokeStyle = '#338811';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, 8); ctx.lineTo(14, 6);
        ctx.moveTo(8, 8); ctx.lineTo(3, 10);
        ctx.stroke();
        return _canvasToImage(canvas);
    }

    /**
     * Generate a vine texture with seeded random placement.
     * Creates hanging vines using a deterministic pattern of green pixels.
     * @returns {HTMLImageElement|null} Generated 16×16 vine texture, or null on failure.
     */
    function generateVine() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#44AA22';
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

    // NOTE: generateGrass is now an alias exported via Donkeycraft.TextureGenerator.generateGrass
    // at the bottom of this file, pointing to the terrain module's generateGrassTop.
    // Local reference removed to prevent circular dependency issues.

    /**
     * Generate a tall grass texture with seeded blade positions and organic variation.
     * Creates vertical green blades using seeded random placement with variable heights.
     * @returns {HTMLImageElement|null} Generated 16×16 tall grass texture, or null on failure.
     */
    function generateTallGrass() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#55AA33';
        for (var i = 0; i < 8; i++) {
            ctx.fillRect(1 + Math.floor(_rng() * 14), 4 + Math.floor(_rng() * 4), 1, 8 + Math.floor(_rng() * 4));
        }
        return _canvasToImage(canvas);
    }

    /**
     * Generate a fern texture with seeded frond pattern variation.
     * Creates a central stem with branching leaflets using deterministic placement.
     * @returns {HTMLImageElement|null} Generated 16×16 fern texture, or null on failure.
     */
    function generateFern() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#44AA33';
        ctx.fillRect(7, 4, 2, 10);
        ctx.fillRect(5, 6, 2, 6);
        ctx.fillRect(9, 6, 2, 6);
        ctx.fillRect(4, 8, 2, 4);
        ctx.fillRect(10, 8, 2, 4);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a flower texture with seeded petal variation.
     * Creates a stem with a circular flower head and center using color-based rendering.
     * @param {string} color - Flower color name ("red", "blue", "yellow", "orange").
     * @returns {HTMLImageElement|null} Generated 16×16 flower texture, or null on failure.
     */
    function generateFlower(color) {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#44AA33';
        ctx.fillRect(7, 8, 2, 6);
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
     * Generate a rose bush texture with seeded petal variation.
     * Creates a tall red flower on a green stem using deterministic placement.
     * @returns {HTMLImageElement|null} Generated 16×16 rose bush texture, or null on failure.
     */
    function generateRoseBush() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#44AA33';
        ctx.fillRect(7, 4, 2, 10);
        ctx.fillStyle = '#CC2222';
        ctx.fillRect(5, 2, 6, 4);
        ctx.fillRect(6, 1, 4, 2);
        ctx.fillStyle = '#EEEE88';
        ctx.fillRect(7, 3, 2, 2);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a sunflower texture with seeded petal variation.
     * Creates a tall yellow flower on a green stem using deterministic placement.
     * @returns {HTMLImageElement|null} Generated 16×16 sunflower texture, or null on failure.
     */
    function generateSunflower() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#88AA33';
        ctx.fillRect(7, 8, 2, 6);
        ctx.fillStyle = '#DDCC33';
        ctx.fillRect(5, 2, 6, 5);
        ctx.fillRect(6, 1, 4, 2);
        ctx.fillStyle = '#886622';
        ctx.fillRect(7, 3, 2, 2);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a dead bush texture with seeded branch variation.
     * Creates an irregular brown shrub pattern using deterministic pixel placement.
     * @returns {HTMLImageElement|null} Generated 16×16 dead bush texture, or null on failure.
     */
    function generateDeadBush() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(7, 6, 2, 8);
        ctx.fillRect(4, 8, 4, 2);
        ctx.fillRect(10, 5, 3, 2);
        ctx.fillRect(4, 4, 2, 3);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a cave vines (cave flowers) texture with seeded berry positions.
     * Creates hanging green vines with bright cyan glow berries using deterministic placement.
     * @returns {HTMLImageElement|null} Generated 16×16 cave vines texture, or null on failure.
     */
    function generateCaveVines() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#44AA33';
        ctx.fillRect(7, 0, 2, 10);
        ctx.fillStyle = '#88DD44';
        ctx.fillRect(5, 4, 2, 2);
        ctx.fillRect(9, 6, 2, 2);
        ctx.fillRect(6, 8, 2, 2);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a cocoa bean texture with seeded bean variation.
     * Creates brown cocoa bean clusters on a wood-colored background.
     * @returns {HTMLImageElement|null} Generated 16×16 cocoa texture, or null on failure.
     */
    function generateCocoa() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#664422';
        ctx.fillRect(5, 6, 6, 5);
        ctx.fillStyle = '#886633';
        ctx.fillRect(6, 7, 4, 3);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a melon texture with seeded stripe variation.
     * Creates a green circular melon with darker vertical stripes using procedural noise.
     * @returns {HTMLImageElement|null} Generated 16×16 melon texture, or null on failure.
     */
    function generateMelon() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#44AA44';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#66CC66';
        ctx.beginPath();
        ctx.arc(8, 8, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#338833';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 8); ctx.lineTo(TEX_SIZE, 8);
        ctx.moveTo(8, 0); ctx.lineTo(8, TEX_SIZE);
        ctx.stroke();
        return _canvasToImage(canvas);
    }

    /**
     * Generate a pumpkin texture with seeded segment variation.
     * Creates an orange pumpkin with vertical segment lines and a stem using noise.
     * @returns {HTMLImageElement|null} Generated 16×16 pumpkin texture, or null on failure.
     */
    function generatePumpkin() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#CC7722';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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
     * Generate a mushroom texture with seeded spot variation.
     * Creates a mushroom cap with white spots on a red background (or brown for brown mushrooms).
     * Uses seeded random for organic spot placement and size variation.
     * @param {boolean} isRed - Whether red mushroom (true) or brown (false).
     * @returns {HTMLImageElement|null} Generated 16×16 mushroom texture, or null on failure.
     */
    function generateMushroom(isRed) {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = isRed ? '#CC2222' : '#8B6914';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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
     * Generate a chorus plant texture with seeded node positions and glow variation.
     * Creates a purple plant structure using seeded random placement with glow intensity variation.
     * @returns {HTMLImageElement|null} Generated 16×16 chorus plant texture, or null on failure.
     */
    function generateChorusPlant() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#AA77CC';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (var i = 0; i < 10; i++) {
            ctx.fillStyle = 'rgba(160, 100, 200, 0.7)';
            ctx.fillRect(Math.floor(_rng() * 14), Math.floor(_rng() * 14), 2, 2);
        }
        return _canvasToImage(canvas);
    }

    /**
     * Generate a cactus texture with seeded spine variation.
     * Creates a green cactus with horizontal growth rings and subtle noise for organic texture.
     * @returns {HTMLImageElement|null} Generated 16×16 cactus texture, or null on failure.
     */
    function generateCactus() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#44AA44';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.strokeStyle = '#338833';
        ctx.lineWidth = 1;
        for (var y = 2; y < TEX_SIZE; y += 4) {
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(TEX_SIZE, y);
            ctx.stroke();
        }
        ctx.fillStyle = '#55CC55';
        ctx.fillRect(0, 0, 1, TEX_SIZE);
        ctx.fillRect(14, 0, 1, TEX_SIZE);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a sugar cane / reeds texture with seeded node variation.
     * Creates tall green stalks with horizontal segment lines using procedural noise.
     * @returns {HTMLImageElement|null} Generated 16×16 sugar cane texture, or null on failure.
     */
    function generateSugarCane() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#88CC44';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.strokeStyle = '#66AA33';
        ctx.lineWidth = 1;
        for (var y = 3; y < TEX_SIZE; y += 5) {
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(TEX_SIZE, y);
            ctx.stroke();
        }
        return _canvasToImage(canvas);
    }

    function generateReeds() { return generateSugarCane(); }

    // ---- Redstone components ----

    /**
     * Generate a piston side texture.
     * @returns {HTMLImageElement}
     */
    function generatePistonSide() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(0, 6, TEX_SIZE, 4);
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
        ctx.fillStyle = '#888888';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#444444';
        ctx.fillRect(5, 5, 6, 6);
        if (isDispenser) {
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
        for (var y = 0; y < TEX_SIZE; y++) {
            ctx.fillStyle = y % 4 < 2 ? '#888888' : '#777777';
            ctx.fillRect(0, y, TEX_SIZE, 1);
        }
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
        ctx.fillStyle = '#888888';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#CC2222';
        ctx.fillRect(3, 6, 2, 4);
        ctx.fillRect(11, 6, 2, 4);
        ctx.fillStyle = '#AA1111';
        ctx.fillRect(5, 7, 6, 2);
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
        ctx.fillStyle = '#888888';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#666666';
        ctx.fillRect(6, 10, 4, 3);
        ctx.fillStyle = '#555555';
        ctx.fillRect(7, 4, 2, 7);
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
        ctx.fillStyle = isStone ? '#888888' : '#8B6914';
        ctx.fillRect(5, 6, 6, 4);
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
            ctx.strokeStyle = '#777777';
            ctx.lineWidth = 1;
            ctx.strokeRect(2, 5, 5, 6);
            ctx.strokeRect(9, 5, 5, 6);
        } else {
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(1, 4, 14, 8);
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
            ctx.fillStyle = '#999998';
            ctx.fillRect(3, 2, 1, 1); ctx.fillRect(3, 13, 1, 1);
            ctx.fillRect(10, 2, 1, 1); ctx.fillRect(10, 13, 1, 1);
        } else {
            ctx.fillStyle = '#BC9862';
            ctx.fillRect(2, 0, 5, 16);
            ctx.fillRect(9, 0, 5, 16);
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
        ctx.fillRect(2, 0, 3, 16);
        ctx.fillRect(11, 0, 3, 16);
        ctx.fillRect(5, 3, 6, 2);
        ctx.fillRect(5, 11, 6, 2);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a wall texture (cobblestone) with seeded stone shades.
     * @returns {HTMLImageElement}
     */
    function generateWall() {
        _seedRng(42);
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
        ctx.fillStyle = '#EEEEEE';
        ctx.fillRect(7, 0, 2, 16);
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
        ctx.fillStyle = '#555555';
        ctx.fillRect(7, 6, 2, 8);
        ctx.fillStyle = '#CC2222';
        ctx.fillRect(6, 1, 4, 5);
        ctx.fillStyle = '#FF6644';
        ctx.fillRect(7, 2, 2, 3);
        return _canvasToImage(canvas);
    }

    // ---- Beds & signs ----

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
        ctx.fillStyle = colors[color] || '#EEEEEE';
        ctx.fillRect(1, 0, 14, 6);
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
        ctx.strokeStyle = '#6B5335';
        ctx.lineWidth = 1;
        ctx.strokeRect(2.5, 0.5, 11, 11);
        ctx.fillStyle = plankColors[woodType] || '#BC9862';
        ctx.fillRect(6, 12, 4, 4);
        return _canvasToImage(canvas);
    }

    // ---- Special blocks ----

    /**
     * Generate a mirror texture with seeded reflective noise.
     * @returns {HTMLImageElement}
     */
    function generateMirror() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 10;
                var val = 200 + n;
                ctx.fillStyle = 'rgb(' + val + ',' + val + ',' + (val + 5) + ')';
                ctx.fillRect(x, y, 1, 1);
            }
        }
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
        ctx.fillStyle = '#555555';
        ctx.fillRect(4, 10, 8, 4);
        ctx.fillRect(7, 6, 2, 5);
        ctx.fillStyle = '#333333';
        ctx.fillRect(4, 3, 3, 4);
        ctx.fillRect(9, 3, 3, 4);
        ctx.fillRect(6, 0, 4, 4);
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
        ctx.fillStyle = '#555555';
        ctx.fillRect(1, 4, 14, 10);
        ctx.fillStyle = '#333333';
        ctx.fillRect(3, 5, 10, 8);
        ctx.fillStyle = '#666666';
        ctx.fillRect(0, 3, 16, 2);
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
        ctx.fillStyle = '#6B4F12';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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
        ctx.fillStyle = '#888888';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#333333';
        ctx.fillRect(4, 4, 8, 8);
        ctx.strokeStyle = '#556655';
        ctx.lineWidth = 2;
        ctx.strokeRect(3, 3, 10, 10);
        return _canvasToImage(canvas);
    }

    /**
     * Generate a respawn anchor texture.
     * @returns {HTMLImageElement}
     */
    function generateRespawnAnchor() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#AA44FF';
        ctx.fillRect(4, 5, 8, 6);
        ctx.fillStyle = '#CC66FF';
        ctx.fillRect(6, 7, 4, 3);
        ctx.fillStyle = '#444444';
        ctx.fillRect(2, 2, 12, 3);
        return _canvasToImage(canvas);
    }

    /**
     * Generate an end portal texture with seeded starfield positions.
     * @returns {HTMLImageElement}
     */
    function generateEndPortal() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
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
     * Generate a nether portal texture with seeded purple swirl noise.
     * @returns {HTMLImageElement}
     */
    function generateNetherPortal() {
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _rng();
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
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(0, 4, TEX_SIZE, 12);
        ctx.fillStyle = '#BC9862';
        ctx.fillRect(3, 2, 10, 4);
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
        ctx.fillStyle = '#6B4F12';
        ctx.fillRect(2, 0, 12, 16);
        ctx.fillStyle = '#333333';
        ctx.fillRect(5, 4, 6, 8);
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
        ctx.fillStyle = '#888888';
        ctx.fillRect(2, 0, 12, 16);
        ctx.fillStyle = '#333333';
        ctx.fillRect(5, 4, 6, 8);
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
        ctx.fillStyle = '#CCB888';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.strokeStyle = '#AA9866';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(8, 4, 3, Math.PI, 0);
        ctx.stroke();
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
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(2, 0, 12, 16);
        ctx.strokeStyle = '#6B4F12';
        ctx.lineWidth = 1;
        for (var y = 3; y < 14; y += 3) {
            ctx.beginPath();
            ctx.moveTo(4, y); ctx.lineTo(12, y);
            ctx.stroke();
        }
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
        ctx.fillStyle = '#666666';
        ctx.fillRect(7, 0, 2, 3);
        ctx.fillStyle = '#555555';
        ctx.fillRect(4, 3, 8, 10);
        ctx.fillStyle = '#FFAA44';
        ctx.fillRect(5, 4, 6, 8);
        ctx.fillStyle = '#FFDD88';
        ctx.fillRect(6, 5, 4, 6);
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
        ctx.fillStyle = '#1A2B3C';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.strokeStyle = '#22AA88';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(8, 8, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(8, 8, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#33DDAA';
        ctx.fillRect(7, 7, 2, 2);
        return _canvasToImage(canvas);
    }

    /**
     * Generate an end portal frame texture.
     * @returns {HTMLImageElement}
     */
    function generateEndPortalFrame() {
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#556655';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.fillStyle = '#220033';
        ctx.fillRect(4, 4, 8, 8);
        ctx.fillStyle = '#AA44FF';
        ctx.fillRect(7, 7, 2, 2);
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
        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.arc(8, 8, 3, 0, Math.PI * 2);
        ctx.fill();
        return _canvasToImage(canvas);
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
            ctx.fillStyle = '#FFAA00';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.fillStyle = '#FF4400';
            ctx.fillRect(6, 6, 4, 4);
        } else {
            ctx.fillStyle = '#999999';
            ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
            ctx.fillStyle = '#AA2222';
            ctx.fillRect(6, 6, 4, 4);
        }
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
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4, 4); ctx.lineTo(12, 12);
        ctx.moveTo(12, 4); ctx.lineTo(4, 12);
        ctx.stroke();
        return _canvasToImage(canvas);
    }

    // ============================================================
    // getGeneratorForBlock — map block names to generator functions
    // ============================================================

    /**
     * Get a texture generator function for a block name.
     * @param {string} blockName - Block name from BlockRegistry.
     * @returns {Function|null} Generator function, or null if unknown.
     */
    function getGeneratorForBlock(blockName) {
        var generators = {
            // Stone family
            'stone': function () { return Donkeycraft.TextureGenerator.generateStone(42); },
            'granite': function () { var fn = Donkeycraft.TextureGenerator.generatePolished; return typeof fn === 'function' ? fn(170, 130, 120) : null; },
            'diorite': function () { var fn = Donkeycraft.TextureGenerator.generatePolished; return typeof fn === 'function' ? fn(200, 195, 190) : null; },
            'andesite': function () { var fn = Donkeycraft.TextureGenerator.generatePolished; return typeof fn === 'function' ? fn(130, 135, 140) : null; },
            'polished_granite': function () { return _genCall('generatePolishedGranite', []); },
            'polished_diorite': function () { return _genCall('generatePolishedDiorite', []); },
            'polished_andesite': function () { return _genCall('generatePolishedAndesite', []); },
            'smooth_stone': function () { return _genCall('generateSmoothStone', []); },
            'deepslate': function () { var fn = Donkeycraft.TextureGenerator.generateDeepslate; return typeof fn === 'function' ? fn() : null; },
            'cobbled_deepslate': function () { var fn = Donkeycraft.TextureGenerator.generateCobbledDeepslate; return typeof fn === 'function' ? fn() : null; },
            'polished_deepslate': function () { var fn = Donkeycraft.TextureGenerator.generatePolishedDeepslate; return typeof fn === 'function' ? fn() : null; },
            'dirt': function () { var fn = Donkeycraft.TextureGenerator.generateDirt; return typeof fn === 'function' ? fn() : null; },
            'grass_block': function () { var fn = Donkeycraft.TextureGenerator.generateGrassSide; return typeof fn === 'function' ? fn() : null; },
            'grass_block_top': function () { var fn = Donkeycraft.TextureGenerator.generateGrassTop; return typeof fn === 'function' ? fn() : null; },
            'grass_block_side': function () { var fn = Donkeycraft.TextureGenerator.generateGrassSide; return typeof fn === 'function' ? fn() : null; },
            'gravel': function () { return Donkeycraft.TextureGenerator.generateStone(777); },
            // Ores
            'coal_ore': function () { return _genCall('generateCoalOre', []); },
            'iron_ore': function () { return _genCall('generateIronOre', []); },
            'gold_ore': function () { return _genCall('generateGoldOre', []); },
            'diamond_ore': function () { return _genCall('generateDiamondOre', []); },
            'emerald_ore': function () { return _genCall('generateEmeraldOre', []); },
            'redstone_ore': function () { return _genCall('generateRedstoneOre', []); },
            'lit_redstone_ore': function () { return _genCall('generateLitRedstoneOre', []); },
            'lapis_ore': function () { return _genCall('generateLapisOre', []); },
            'nether_quartz_ore': function () { return _genCall('generateNetherQuartzOre', []); },
            'nether_gold_ore': function () { return _genCall('generateNetherGoldOre', []); },
            // Special blocks
            'obsidian': function () { return Donkeycraft.TextureGenerator.generateStone(999); },
            'crying_obsidian': function () { return _genCall('generateGlow', [80, 20, 140]); },
            'bedrock': function () { return _genCall('generateBedrock', []); },
            // Sand variants
            'sand': function () { return _genCall('generateSand', [210, 195, 150]); },
            'red_sand': function () { return generateRedSand(); },
            'sandstone': function () { var fn = Donkeycraft.TextureGenerator.generateSandstone; return typeof fn === 'function' ? fn() : null; },
            'chiseled_sandstone': function () { var fn = Donkeycraft.TextureGenerator.generateChiseledSandstone; return typeof fn === 'function' ? fn() : null; },
            'cut_sandstone': function () { var fn = Donkeycraft.TextureGenerator.generateCutSandstone; return typeof fn === 'function' ? fn() : null; },
            // Wood and planks
            'oak_log': function () { return _genCall('generateLogSide', [100]); },
            'spruce_log': function () { return _genCall('generateLogSide', [101]); },
            'birch_log': function () { return _genCall('generateLogSide', [102]); },
            'jungle_log': function () { return _genCall('generateLogSide', [103]); },
            'acacia_log': function () { return _genCall('generateLogSide', [104]); },
            'dark_oak_log': function () { return _genCall('generateLogSide', [105]); },
            'oak_planks': function () { return _genCall('generatePlanks', [188, 152, 98, 100]); },
            'spruce_planks': function () { return _genCall('generatePlanks', [107, 79, 18, 101]); },
            'birch_planks': function () { return _genCall('generatePlanks', [200, 184, 136, 102]); },
            'jungle_planks': function () { return _genCall('generatePlanks', [160, 128, 64, 103]); },
            'acacia_planks': function () { return _genCall('generatePlanks', [192, 144, 64, 104]); },
            'dark_oak_planks': function () { return _genCall('generatePlanks', [90, 63, 26, 105]); },
            'oak_wood': function () { return _genCall('generateWood', [110]); },
            'spruce_wood': function () { return _genCall('generateWood', [111]); },
            'birch_wood': function () { return _genCall('generateWood', [112]); },
            'jungle_wood': function () { return _genCall('generateWood', [113]); },
            'dark_oak_wood': function () { return _genCall('generateWood', [114]); },
            'mangrove_wood': function () { return _genCall('generateWood', [5555]); },
            'cherry_log': function () { return _genCall('generateLogSide', [4444]); },
            'cherry_wood': function () { return generateCherryWood(); },
            // Stone bricks
            'stone_bricks': function () { return _genCall('generateBricks', [120, 120, 120]); },
            'cracked_stone_bricks': function () { return _genCall('generateBricks', [120, 120, 120]); },
            'mossy_stone_bricks': function () { return _genCall('generateMossyStoneBrick', []); },
            'chiseled_stone_bricks': function () { return _genCall('generateBricks', [120, 120, 120]); },
            'end_stone_bricks': function () { var fn = Donkeycraft.TextureGenerator.generateEndStone; return typeof fn === 'function' ? fn() : null; },
            // Prismarine variants
            'prismarine': function () { return _genCall('generatePrismarine', ['normal']); },
            'prismarine_bricks': function () { return _genCall('generatePrismarine', ['bricks']); },
            'prismarine_dark': function () { return _genCall('generatePrismarine', ['dark']); },
            // Glass (16 colors)
            'glass': function () { return _genCall('generateGlass', [200, 220, 255]); },
            'tinted_glass': function () { return _genCall('generateGlass', [60, 50, 80]); },
            'glass_pane': function () { return _genCall('generateGlass', [200, 220, 255]); },
            // Stained glass (16 colors)
            'white_stained_glass': function () { return _genCall('generateGlass', [240, 240, 240]); },
            'orange_stained_glass': function () { return _genCall('generateGlass', [234, 131, 36]); },
            'magenta_stained_glass': function () { return _genCall('generateGlass', [183, 71, 185]); },
            'light_blue_stained_glass': function () { return _genCall('generateGlass', [100, 198, 232]); },
            'yellow_stained_glass': function () { return _genCall('generateGlass', [240, 222, 64]); },
            'lime_stained_glass': function () { return _genCall('generateGlass', [125, 227, 56]); },
            'pink_stained_glass': function () { return _genCall('generateGlass', [239, 141, 177]); },
            'gray_stained_glass': function () { return _genCall('generateGlass', [101, 101, 101]); },
            'light_gray_stained_glass': function () { return _genCall('generateGlass', [177, 183, 191]); },
            'cyan_stained_glass': function () { return _genCall('generateGlass', [54, 162, 180]); },
            'purple_stained_glass': function () { return _genCall('generateGlass', [151, 81, 175]); },
            'blue_stained_glass': function () { return _genCall('generateGlass', [53, 96, 186]); },
            'brown_stained_glass': function () { return _genCall('generateGlass', [113, 84, 64]); },
            'green_stained_glass': function () { return _genCall('generateGlass', [87, 134, 63]); },
            'red_stained_glass': function () { return _genCall('generateGlass', [183, 52, 55]); },
            'black_stained_glass': function () { return _genCall('generateGlass', [33, 33, 33]); },
            // Ice / snow
            'ice': function () { return _genCall('generateIce', []); },
            'blue_ice': function () { return _genCall('generateBlueIce', []); },
            'snow_block': function () { return generateSnowBlock(); },
            'snow_layer': function () { return _genCall('generateSnow', []); },
            // Wool (16 colors)
            'white_wool': function () { return _genCall('generateWool', [240, 240, 240]); },
            'orange_wool': function () { return _genCall('generateWool', [234, 131, 36]); },
            'magenta_wool': function () { return _genCall('generateWool', [183, 71, 185]); },
            'light_blue_wool': function () { return _genCall('generateWool', [100, 198, 232]); },
            'yellow_wool': function () { return _genCall('generateWool', [240, 222, 64]); },
            'lime_wool': function () { return _genCall('generateWool', [125, 227, 56]); },
            'pink_wool': function () { return _genCall('generateWool', [239, 141, 177]); },
            'gray_wool': function () { return _genCall('generateWool', [101, 101, 101]); },
            'light_gray_wool': function () { return _genCall('generateWool', [177, 183, 191]); },
            'cyan_wool': function () { return _genCall('generateWool', [54, 162, 180]); },
            'purple_wool': function () { return _genCall('generateWool', [151, 81, 175]); },
            'blue_wool': function () { return _genCall('generateWool', [53, 96, 186]); },
            'brown_wool': function () { return _genCall('generateWool', [113, 84, 64]); },
            'green_wool': function () { return _genCall('generateWool', [87, 134, 63]); },
            'red_wool': function () { return _genCall('generateWool', [183, 52, 55]); },
            'black_wool': function () { return _genCall('generateWool', [33, 33, 33]); },
            // Concrete (16 colors)
            'white_concrete': function () { return _genCall('generateConcrete', [240, 240, 240]); },
            'orange_concrete': function () { return _genCall('generateConcrete', [234, 131, 36]); },
            'magenta_concrete': function () { return _genCall('generateConcrete', [183, 71, 185]); },
            'light_blue_concrete': function () { return _genCall('generateConcrete', [100, 198, 232]); },
            'yellow_concrete': function () { return _genCall('generateConcrete', [240, 222, 64]); },
            'lime_concrete': function () { return _genCall('generateConcrete', [125, 227, 56]); },
            'pink_concrete': function () { return _genCall('generateConcrete', [239, 141, 177]); },
            'gray_concrete': function () { return _genCall('generateConcrete', [101, 101, 101]); },
            'light_gray_concrete': function () { return _genCall('generateConcrete', [177, 183, 191]); },
            'cyan_concrete': function () { return _genCall('generateConcrete', [54, 162, 180]); },
            'purple_concrete': function () { return _genCall('generateConcrete', [151, 81, 175]); },
            'blue_concrete': function () { return _genCall('generateConcrete', [53, 96, 186]); },
            'brown_concrete': function () { return _genCall('generateConcrete', [113, 84, 64]); },
            'green_concrete': function () { return _genCall('generateConcrete', [87, 134, 63]); },
            'red_concrete': function () { return _genCall('generateConcrete', [183, 52, 55]); },
            'black_concrete': function () { return _genCall('generateConcrete', [33, 33, 33]); },
            // Concrete powder (16 colors)
            'white_concrete_powder': function () { return _genCall('generateConcretePowder', [240, 240, 240]); },
            'orange_concrete_powder': function () { return _genCall('generateConcretePowder', [234, 131, 36]); },
            'magenta_concrete_powder': function () { return _genCall('generateConcretePowder', [183, 71, 185]); },
            'light_blue_concrete_powder': function () { return _genCall('generateConcretePowder', [100, 198, 232]); },
            'yellow_concrete_powder': function () { return _genCall('generateConcretePowder', [240, 222, 64]); },
            'lime_concrete_powder': function () { return _genCall('generateConcretePowder', [125, 227, 56]); },
            'pink_concrete_powder': function () { return _genCall('generateConcretePowder', [239, 141, 177]); },
            'gray_concrete_powder': function () { return _genCall('generateConcretePowder', [101, 101, 101]); },
            'light_gray_concrete_powder': function () { return _genCall('generateConcretePowder', [177, 183, 191]); },
            'cyan_concrete_powder': function () { return _genCall('generateConcretePowder', [54, 162, 180]); },
            'purple_concrete_powder': function () { return _genCall('generateConcretePowder', [151, 81, 175]); },
            'blue_concrete_powder': function () { return _genCall('generateConcretePowder', [53, 96, 186]); },
            'brown_concrete_powder': function () { return _genCall('generateConcretePowder', [113, 84, 64]); },
            'green_concrete_powder': function () { return _genCall('generateConcretePowder', [87, 134, 63]); },
            'red_concrete_powder': function () { return _genCall('generateConcretePowder', [183, 52, 55]); },
            'black_concrete_powder': function () { return _genCall('generateConcretePowder', [33, 33, 33]); },
            // Terracotta
            'terracotta': function () { return _genCall('generateTerracotta', [190, 120, 80]); },
            'white_terracotta': function () { return _genCall('generateTerracotta', [240, 235, 225]); },
            'red_terracotta': function () { return _genCall('generateTerracotta', [180, 70, 50]); },
            // Bricks
            'brick': function () { return _genCall('generateBricks', [160, 60, 50]); },
            'bricks': function () { return _genCall('generateBricks', [160, 60, 50]); },
            'nether_bricks': function () { return _genCall('generateNetherBrick', []); },
            'red_nether_bricks': function () { return _genCall('generateRedNetherBrick', []); },
            // Special stone
            'basalt': function () { return _genCall('generateBasalt', []); },
            'polished_basalt': function () { return _genCall('generatePolishedBasalt', []); },
            'blackstone': function () { return _genCall('generatePolishedBlackstone', []); },
            'polished_blackstone': function () { return _genCall('generatePolishedBlackstone', []); },
            'polished_blackstone_bricks': function () { return _genCall('generateBricks', [45, 42, 46]); },
            // Leaves
            'oak_leaves': function () { return generateLeaves(50, 130, 40); },
            'spruce_leaves': function () { return generateLeaves(30, 80, 30); },
            'birch_leaves': function () { return generateLeaves(60, 140, 50); },
            'jungle_leaves': function () { return generateLeaves(40, 110, 30); },
            'acacia_leaves': function () { return generateLeaves(70, 120, 40); },
            'dark_oak_leaves': function () { return generateLeaves(35, 85, 35); },
            // Sponges
            'sponge': function () { return _genCall('generateSponge', []); },
            'wet_sponge': function () { return _genCall('generateWetSponge', []); },
            // Honey and slime
            'honey_block': function () { return _genCall('generateHoney', []); },
            // Nether blocks
            'netherrack': function () { return _genCall('generateNetherrack', []); },
            'soul_sand': function () { return _genCall('generateSoulSand', []); },
            'soul_soil': function () { return _genCall('generateSoulSoil', []); },
            'gilded_blackstone': function () { return _genCall('generateGildedBlackstone', []); },
            'ancient_debris': function () { return _genCall('generateAncientDebris', []); },
            'magma': function () { return _genCall('generateMagma', []); },
            // Nether wood
            'warped_stem': function () { return _genCall('generateWarpedStem', []); },
            'warped_hyphae': function () { return _genCall('generateWarpedStem', []); },
            'warped_planks': function () { return generateWarpedPlanks(); },
            'warped_nylium': function () { return _genCall('generateNylium', [true]); },
            'crimson_stem': function () { return _genCall('generateCrimsonStem', []); },
            'crimson_hyphae': function () { return _genCall('generateCrimsonStem', []); },
            'crimson_planks': function () { return generateCrimsonPlanks(); },
            'crimson_nylium': function () { return _genCall('generateNylium', [false]); },
            // Nether decorative
            'nether_wart_block': function () { return _genCall('generateBricks', [100, 30, 30]); },
            'shroomlight': function () { return _genCall('generateShroomlight', []); },
            'glowstone': function () { return _genCall('generateGlowstone', []); },
            // End blocks
            'purpur_block': function () { return _genCall('generatePurpurBlock', []); },
            'purpur_pillar': function () { return _genCall('generatePurpurPillar', []); },
            // Metals
            'gold_block': function () { return _genCall('generateGoldBlock', []); },
            'iron_block': function () { return _genCall('generateIronBlock', []); },
            'diamond_block': function () { return _genCall('generateDiamondBlock', []); },
            'emerald_block': function () { return _genCall('generateEmeraldBlock', []); },
            'coal_block': function () { return _genCall('generateCoalBlock', []); },
            'netherite_block': function () { var fn = Donkeycraft.TextureGenerator.generatePolished; return typeof fn === 'function' ? fn(50, 45, 55) : null; },
            // Redstone blocks
            'redstone_block': function () { return _genCall('generateRedstoneBlock', []); },
            'lapis_block': function () { return _genCall('generateLapisBlock', []); },
            // Quartz
            'quartz_block': function () { return _genCall('generateQuartzBlock', []); },
            'chiseled_quartz_block': function () { return _genCall('generateChiseledQuartz', []); },
            'quartz_pillar': function () { return _genCall('generateQuartzPillar', []); },
            'quartz_bricks': function () { return _genCall('generateQuartzBricks', []); },
            // Liquids
            'water': function () { return generateWater(); },
            'lava': function () { return generateLava(); },
            // Decorative plants
            'grass': function () { var fn = Donkeycraft.TextureGenerator.generateGrass; return typeof fn === 'function' ? fn() : null; },
            'tall_grass': function () { return generateTallGrass(); },
            'fern': function () { return generateFern(); },
            'poppy': function () { return generateFlower('red'); },
            'blue_orchid': function () { return generateFlower('blue'); },
            'dandelion': function () { return generateFlower('yellow'); },
            'rose_bush': function () { return generateRoseBush(); },
            'sunflower': function () { return generateSunflower(); },
            'lily_pad': function () { return generateLilyPad(); },
            'dead_bush': function () { return generateDeadBush(); },
            'vine': function () { return generateVine(); },
            'cave_vines': function () { return generateCaveVines(); },
            'sugar_cane': function () { return generateSugarCane(); },
            'reeds': function () { return generateReeds(); },
            'cactus': function () { return generateCactus(); },
            'chorus_plant': function () { return generateChorusPlant(); },
            'chorus_flower': function () { return _genCall('generateGlow', [160, 80, 200]); },
            'cocoa': function () { return generateCocoa(); },
            // Redstone components
            'redstone_wire': function () {
                var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                var ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
                ctx.fillStyle = '#AA0000';
                ctx.fillRect(0, 7, TEX_SIZE, 2);
                ctx.fillStyle = '#FF2222';
                ctx.fillRect(0, 7, TEX_SIZE, 1);
                return _canvasToImage(canvas);
            },
            'redstone_torch': function () { return generateRedstoneTorch(); },
            'redstone_lamp': function () { return generateRedstoneLamp(false); },
            'lit_redstone_lamp': function () { return generateRedstoneLamp(true); },
            'dispenser': function () { return generateDispenser(true); },
            'dropper': function () { return generateDispenser(false); },
            'observer': function () { return generateObserver(); },
            'repeater': function () { return generateRepeater(); },
            // Pistons
            'piston': function () { return generatePistonSide(); },
            'sticky_piston': function () {
                var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#8B6914';
                ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                ctx.fillStyle = '#AAAAAA';
                ctx.fillRect(0, 6, TEX_SIZE, 4);
                ctx.fillStyle = '#55AA33';
                ctx.fillRect(2, 0, 12, 6);
                for (var _i = 0; _i < 4; _i++) {
                    ctx.fillRect(3 + _i * 3, 5, 2, 2);
                }
                return _canvasToImage(canvas);
            },
            // TNT
            'tnt': function () { return generateTNTSide(); },
            // Storage
            'chest': function () { return generateChestSide(); },
            'trapped_chest': function () {
                var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#8B6914';
                ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                ctx.fillStyle = '#6B4F12';
                ctx.fillRect(0, 7, TEX_SIZE, 2);
                ctx.fillStyle = '#888888';
                ctx.fillRect(6, 7, 4, 2);
                ctx.fillStyle = '#AAAAAA';
                ctx.fillRect(7, 8, 2, 1);
                return _canvasToImage(canvas);
            },
            'barrel': function () {
                _seedRng(42);
                var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#6B4F12';
                ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                ctx.fillStyle = '#555555';
                ctx.fillRect(0, 4, TEX_SIZE, 2);
                ctx.fillRect(0, 10, TEX_SIZE, 2);
                return _canvasToImage(canvas);
            },
            'furnace': function () { return generateFurnaceFront(); },
            'lit_furnace': function () {
                var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#B0B0B0';
                ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
                ctx.fillStyle = '#333333';
                ctx.fillRect(4, 5, 8, 7);
                ctx.fillStyle = '#FF8800';
                ctx.fillRect(5, 7, 6, 4);
                ctx.fillStyle = '#FFCC44';
                ctx.fillRect(6, 8, 4, 2);
                return _canvasToImage(canvas);
            },
            'smoker': function () { return generateSmoker(); },
            'blast_furnace': function () { return generateBlastFurnace(); },
            'crafting_table': function () { return generateCraftingTable(); },
            'bookshelf': function () { return generateBookshelf(); },
            'chiseled_bookshelf': function () { return generateChiseledBookshelf(); },
            'lectern': function () { return generateLectern(); },
            // Doors
            'oak_door': function () { return generateDoor(false); },
            'iron_door': function () { return generateDoor(true); },
            'spruce_door': function () {
                var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#6B4F12';
                ctx.fillRect(2, 0, 5, 16);
                ctx.fillRect(9, 0, 5, 16);
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
            // Fences and walls
            'oak_fence': function () { return generateFence(); },
            'cobblestone_wall': function () { return generateWall(); },
            'brick_wall': function () { return _genCall('generateBricks', [160, 60, 50]); },
            'nether_brick_wall': function () { return _genCall('generateNetherBrick', []); },
            'end_stone_brick_wall': function () { var fn = Donkeycraft.TextureGenerator.generateEndStone; return typeof fn === 'function' ? fn() : null; },
            'sandstone_wall': function () { var fn = Donkeycraft.TextureGenerator.generateSandstone; return typeof fn === 'function' ? fn() : null; },
            // Buttons and pressure plates
            'stone_button': function () { return generateButton(true); },
            'oak_button': function () { return generateButton(false); },
            'lever': function () { return generateLever(); },
            'stone_pressure_plate': function () { return generatePressurePlate(true); },
            'oak_pressure_plate': function () { return generatePressurePlate(false); },
            // Special blocks
            'end_rod': function () { return generateEndRod(); },
            'chain': function () { return generateChain(); },
            'end_portal_frame': function () { return generateEndPortalFrame(); },
            'end_portal': function () { return generateEndPortal(); },
            'nether_portal': function () { return generateNetherPortal(); },
            'mob_spawner': function () { return generateMobSpawner(); },
            'enchanting_table': function () { return _genCall('generateGlow', [100, 60, 180]); },
            'brewing_stand': function () { return generateBrewingStand(); },
            'cauldron': function () { return generateCauldron(); },
            'respawn_anchor': function () { return generateRespawnAnchor(); },
            // Beds
            'oak_bed': function () { return generateBed('white'); },
            'red_bed': function () { return generateBed('red'); },
            // Signs
            'oak_sign': function () { return generateSign('oak'); },
            'spruce_sign': function () { return generateSign('spruce'); },
            'birch_sign': function () { return generateSign('birch'); },
            'acacia_sign': function () { return generateSign('acacia'); },
            // Other
            'painting': function () { return generatePainting(); },
            'mirror': function () { return generateMirror(); },
            'lantern': function () { return generateLantern(); },
            'soul_lantern': function () { return generateSoulLantern(); },
            'sculk_sensor': function () { return generateSculkSensor(); },
            'melons': function () { return generateMelon(); },
            'pumpkin': function () { return generatePumpkin(); },
            'hay_block': function () { return _genCall('generateHayBale', []); },
            'cobblestone': function () { return Donkeycraft.TextureGenerator.generateStone(42); },
            'default': function () { return Donkeycraft.TextureGenerator.generateStone(0); }
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
        var hash = 0;
        for (var i = 0; i < blockName.length; i++) {
            hash = ((hash << 5) - hash) + blockName.charCodeAt(i);
            hash |= 0;
        }
        var hue = Math.abs(hash) % 360;
        ctx.fillStyle = 'hsl(' + hue + ', 40%, 50%)';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
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
     * @returns {string|null} Primary texture name, or null if not found.
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

    // Export mapping functions.
    Donkeycraft.TextureGenerator.getGeneratorForBlock = getGeneratorForBlock;
    Donkeycraft.TextureGenerator.generateTextureForBlock = generateTextureForBlock;
    Donkeycraft.TextureGenerator.generateAllTextures = generateAllTextures;
    Donkeycraft.TextureGenerator.getTextureNameForBlock = getTextureNameForBlock;
    Donkeycraft.TextureGenerator.getNameMap = getNameMap;

    // Export decorative generators that are called from getGeneratorForBlock.
    Donkeycraft.TextureGenerator.generateWater = generateWater;
    Donkeycraft.TextureGenerator.generateLava = generateLava;
    Donkeycraft.TextureGenerator.generateLeaves = generateLeaves;
    Donkeycraft.TextureGenerator.generateMissing = generateMissing;
    Donkeycraft.TextureGenerator.generateWarpedPlanks = generateWarpedPlanks;
    Donkeycraft.TextureGenerator.generateCrimsonPlanks = generateCrimsonPlanks;

    // Export all locally-defined decorative generators for external access.
    Donkeycraft.TextureGenerator.generateChain = generateChain;
    Donkeycraft.TextureGenerator.generateCherryWood = generateCherryWood;
    Donkeycraft.TextureGenerator.generateCactus = generateCactus;
    Donkeycraft.TextureGenerator.generateSugarCane = generateSugarCane;
    Donkeycraft.TextureGenerator.generateReeds = generateReeds;
    Donkeycraft.TextureGenerator.generateTallGrass = generateTallGrass;
    Donkeycraft.TextureGenerator.generateFern = generateFern;
    Donkeycraft.TextureGenerator.generateFlower = generateFlower;
    Donkeycraft.TextureGenerator.generateRoseBush = generateRoseBush;
    Donkeycraft.TextureGenerator.generateSunflower = generateSunflower;
    Donkeycraft.TextureGenerator.generateLilyPad = generateLilyPad;
    Donkeycraft.TextureGenerator.generateDeadBush = generateDeadBush;
    Donkeycraft.TextureGenerator.generateVine = generateVine;
    Donkeycraft.TextureGenerator.generateCaveVines = generateCaveVines;
    Donkeycraft.TextureGenerator.generateCocoa = generateCocoa;
    Donkeycraft.TextureGenerator.generateMelon = generateMelon;
    Donkeycraft.TextureGenerator.generatePumpkin = generatePumpkin;
    Donkeycraft.TextureGenerator.generateMushroom = generateMushroom;
    Donkeycraft.TextureGenerator.generateChorusPlant = generateChorusPlant;
    Donkeycraft.TextureGenerator.generateTNTSide = generateTNTSide;
    Donkeycraft.TextureGenerator.generateChestSide = generateChestSide;
    Donkeycraft.TextureGenerator.generateFurnaceFront = generateFurnaceFront;
    Donkeycraft.TextureGenerator.generateCraftingTable = generateCraftingTable;
    Donkeycraft.TextureGenerator.generateBookshelf = generateBookshelf;
    Donkeycraft.TextureGenerator.generatePistonSide = generatePistonSide;
    Donkeycraft.TextureGenerator.generateDispenser = generateDispenser;
    Donkeycraft.TextureGenerator.generateObserver = generateObserver;
    Donkeycraft.TextureGenerator.generateRepeater = generateRepeater;
    Donkeycraft.TextureGenerator.generateLever = generateLever;
    Donkeycraft.TextureGenerator.generateButton = generateButton;
    Donkeycraft.TextureGenerator.generatePressurePlate = generatePressurePlate;
    Donkeycraft.TextureGenerator.generateDoor = generateDoor;
    Donkeycraft.TextureGenerator.generateFence = generateFence;
    Donkeycraft.TextureGenerator.generateWall = generateWall;
    Donkeycraft.TextureGenerator.generateEndRod = generateEndRod;
    Donkeycraft.TextureGenerator.generateRedstoneTorch = generateRedstoneTorch;
    Donkeycraft.TextureGenerator.generateBed = generateBed;
    Donkeycraft.TextureGenerator.generateSign = generateSign;
    Donkeycraft.TextureGenerator.generateMirror = generateMirror;
    Donkeycraft.TextureGenerator.generateBrewingStand = generateBrewingStand;
    Donkeycraft.TextureGenerator.generateCauldron = generateCauldron;
    Donkeycraft.TextureGenerator.generatePainting = generatePainting;
    Donkeycraft.TextureGenerator.generateMobSpawner = generateMobSpawner;
    Donkeycraft.TextureGenerator.generateRespawnAnchor = generateRespawnAnchor;
    Donkeycraft.TextureGenerator.generateEndPortal = generateEndPortal;
    Donkeycraft.TextureGenerator.generateNetherPortal = generateNetherPortal;
    Donkeycraft.TextureGenerator.generateChiseledBookshelf = generateChiseledBookshelf;
    Donkeycraft.TextureGenerator.generateLectern = generateLectern;
    Donkeycraft.TextureGenerator.generateSmoker = generateSmoker;
    Donkeycraft.TextureGenerator.generateBlastFurnace = generateBlastFurnace;
    Donkeycraft.TextureGenerator.generateJigsaw = generateJigsaw;
    Donkeycraft.TextureGenerator.generateComposter = generateComposter;
    Donkeycraft.TextureGenerator.generateLantern = generateLantern;
    Donkeycraft.TextureGenerator.generateSoulLantern = generateSoulLantern;
    Donkeycraft.TextureGenerator.generateSculkSensor = generateSculkSensor;
    Donkeycraft.TextureGenerator.generateEndPortalFrame = generateEndPortalFrame;
    Donkeycraft.TextureGenerator.generateNoteBlock = generateNoteBlock;
    Donkeycraft.TextureGenerator.generateRedstoneLamp = generateRedstoneLamp;

    // ============================================================
    // Cross-module aliases for terrain functions
    // Resolve from TextureGenerator (set by texture-terrain.js) to avoid circular dependency.
    // Falls back to inline generation if the terrain module hasn't loaded yet.
    // ============================================================

    /**
     * Generate grass block top texture — resolves from terrain module or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getGrassTop() {
        var fn = Donkeycraft.TextureGenerator.generateGrassTop;
        if (typeof fn === 'function') return fn();
        // Fallback: generate inline
        if (!_shufflePerm || !_fbm) return null;
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
                imgData.data[idx] = Math.max(0, Math.min(255, r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate grass block side texture — resolves from terrain module or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getGrassSide() {
        var fn = Donkeycraft.TextureGenerator.generateGrassSide;
        if (typeof fn === 'function') return fn();
        // Fallback: generate inline (same logic as texture-terrain.js)
        if (!_shufflePerm || !_fbm || !_noise2D) return null;
        _shufflePerm(54321);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var r, g, b;
                if (y < 3) {
                    var n = _fbm(x * 0.2, y * 0.2, 3, 1.0, 1.0);
                    r = 76 + n * 20; g = 160 + n * 30; b = 40 + n * 15;
                } else if (y < 5) {
                    var drip = _noise2D(x * 0.3, y * 0.5);
                    if (drip > 0.2) {
                        var dn = _noise2D(x * 0.7 + 100, y * 0.7 + 100);
                        r = 76 + (dn + 1) * 5; g = 140 + (dn + 1) * 10; b = 40;
                    } else { r = 134; g = 96; b = 60; }
                } else {
                    var n2 = _fbm(x * 0.12, y * 0.12, 3, 1.0, 1.0);
                    r = 134 + n2 * 25; g = 96 + n2 * 20; b = 60 + n2 * 15;
                }
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate dirt texture — resolves from terrain module or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getDirt() {
        var fn = Donkeycraft.TextureGenerator.generateDirt;
        if (typeof fn === 'function') return fn();
        if (!_shufflePerm || !_fbm) return null;
        _shufflePerm(12345);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = _fbm(x * 0.12, y * 0.12, 3, 1.0, 1.0);
                var r = 134 + n * 25; var g = 96 + n * 20; var b = 60 + n * 15;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, r));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate sand texture — resolves from terrain module or falls back to inline generation.
     * @param {number} r - Base red value.
     * @param {number} g - Base green value.
     * @param {number} b - Base blue value.
     * @returns {HTMLImageElement|null}
     */
    function _getSand(r, g, b) {
        var fn = Donkeycraft.TextureGenerator.generateSand;
        if (typeof fn === 'function') return fn(r, g, b);
        if (!_seedRng || !_rng) return null;
        _seedRng(r + g + b);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 25;
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
     * Generate snow texture — resolves from terrain module or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getSnow() {
        var fn = Donkeycraft.TextureGenerator.generateSnow;
        if (typeof fn === 'function') return fn();
        if (!_seedRng || !_rng) return null;
        _seedRng(0);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 10;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, 245 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 248 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 255));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    // Export grass alias using the cross-module resolver (no circular dependency).
    Donkeycraft.TextureGenerator.generateGrass = _getGrassTop;

    // ============================================================
    // Missing texture functions — cross-module resolution with inline fallbacks
    // These are defined in texture-blocks.js but need fallbacks for load-order safety.
    // ============================================================

    /**
     * Generate glass texture with transparency and edge highlights.
     * Resolves from texture-blocks.js or falls back to inline generation.
     * @param {number} r - Base red value (0–255).
     * @param {number} g - Base green value (0–255).
     * @param {number} b - Base blue value (0–255).
     * @returns {HTMLImageElement|null}
     */
    function _getGlass(r, g, b) {
        var fn = Donkeycraft.TextureGenerator.generateGlass;
        if (typeof fn === 'function') return fn(r, g, b);
        // Fallback: inline glass generation
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
                imgData.data[idx] = Math.max(0, Math.min(255, r * brightness + 200));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, g * brightness + 200));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, b * brightness + 220));
                imgData.data[idx + 3] = alpha;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate ice texture with seeded noise variation.
     * Resolves from texture-blocks.js or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getIce() {
        var fn = Donkeycraft.TextureGenerator.generateIce;
        if (typeof fn === 'function') return fn();
        // Fallback: inline ice generation
        if (!_seedRng || !_rng) return null;
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 15;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, 180 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 210 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 240 + n));
                imgData.data[idx + 3] = 160;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate blue ice texture — more opaque with deeper blue tones.
     * Resolves from texture-blocks.js or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getBlueIce() {
        var fn = Donkeycraft.TextureGenerator.generateBlueIce;
        if (typeof fn === 'function') return fn();
        // Fallback: inline blue ice generation
        if (!_seedRng || !_rng) return null;
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 8;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, 100 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 160 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 230 + n));
                imgData.data[idx + 3] = 230;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate deepslate texture — dark gray-blue with noise variation.
     * Resolves from texture-blocks.js or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getDeepslate() {
        var fn = Donkeycraft.TextureGenerator.generateDeepslate;
        if (typeof fn === 'function') return fn();
        // Fallback: inline deepslate generation
        if (!_seedRng || !_rng) return null;
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 15;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, 70 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 80 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 90 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

    /**
     * Generate cobbled deepslate texture — dark cobblestone pattern.
     * Resolves from texture-blocks.js or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getCobbledDeepslate() {
        var fn = Donkeycraft.TextureGenerator.generateCobbledDeepslate;
        if (typeof fn === 'function') return fn();
        // Fallback: inline cobbled deepslate generation
        if (!_seedRng || !_rng) return null;
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
     * Generate polished deepslate texture — smooth dark stone with subtle noise.
     * Resolves from texture-blocks.js or falls back to inline generation.
     * @returns {HTMLImageElement|null}
     */
    function _getPolishedDeepslate() {
        var fn = Donkeycraft.TextureGenerator.generatePolishedDeepslate;
        if (typeof fn === 'function') return fn();
        // Fallback: inline polished deepslate generation
        if (!_seedRng || !_rng) return null;
        _seedRng(42);
        var canvas = _createCanvas(TEX_SIZE, TEX_SIZE);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (var y = 0; y < TEX_SIZE; y++) {
            for (var x = 0; x < TEX_SIZE; x++) {
                var n = (_rng() - 0.5) * 8;
                var idx = (y * TEX_SIZE + x) * 4;
                imgData.data[idx] = Math.max(0, Math.min(255, 60 + n));
                imgData.data[idx + 1] = Math.max(0, Math.min(255, 70 + n));
                imgData.data[idx + 2] = Math.max(0, Math.min(255, 80 + n));
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return _canvasToImage(canvas);
    }

})();
