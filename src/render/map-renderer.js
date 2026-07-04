// Donkeycraft — Map Renderer
// Standalone 2D overhead map renderer for Donkeycraft.
// Renders surface-only view with auto-zoom, mousewheel zoom targeting,
// chunk grid lines, and a rotating minimap mode.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;
    var CHUNK_SIZE = Config.CHUNK_SIZE; // 16

    // ============================================================
    // Block Color Lookup Table (module-level singleton)
    // ============================================================

    /**
     * Block color lookup table mapping block IDs to CSS color strings.
     * @type {Object.<number, string>}
     * @private
     */
    var _blockColors = null;

    /**
     * Initialize the block color lookup table. Called once.
     * @returns {Object.<number, string>} The completed color map.
     * @private
     */
    function _initBlockColors() {
        if (_blockColors) return _blockColors;

        var colors = {};

        // Terrain blocks
        colors[1] = '#7a7a7a';   // stone
        colors[2] = '#b08060';   // granite
        colors[3] = '#c0c8d0';   // diorite
        colors[4] = '#6a6a6a';   // andesite
        colors[5] = '#4a4a5a';   // deepslate
        colors[6] = '#5a5a6a';   // cobbled_deepslate
        colors[7] = '#7c5c3a';   // dirt
        colors[8] = '#4a8c2c';   // grass_block (top)
        colors[9] = '#9a9080';   // gravel
        colors[10] = '#d4c478';   // sand (desert)
        colors[11] = '#c0a060';   // sand (badlands)
        colors[12] = '#d4c478';   // sand (generic)
        colors[13] = 'rgba(48,96,192,0.65)';  // water (semi-transparent)
        colors[14] = '#f0f0f0';   // snow_layer
        colors[15] = '#e8e8e8';   // ice
        colors[16] = '#3a6a2c';   // mossy_cobblestone

        // Plant/decorative blocks
        colors[17] = '#6b4c2a';   // oak_log
        colors[18] = '#2d5a1e';   // oak_leaves
        colors[19] = '#7c5c3a';   // spruce_log
        colors[20] = '#1a3a10';   // spruce_leaves
        colors[21] = '#8b6c4a';   // birch_log
        colors[22] = '#4a8a2e';   // birch_leaves
        colors[23] = '#5a3a1a';   // jungle_log
        colors[24] = '#2a6a1a';   // jungle_leaves
        colors[25] = '#c8a840';   // wheat (crop)
        colors[26] = '#5a9a3a';   // grass_tall (surface grass)
        colors[27] = '#8a6a3a';   // dead_bush
        colors[28] = '#3a7a2a';   // fern
        colors[29] = '#4a8c2c';   // large_fern_top

        // Building blocks
        colors[30] = '#e8d8c0';   // oak_planks
        colors[31] = '#6b6b6b';   // cobblestone
        colors[32] = '#e8d8c0';   // birch_planks
        colors[33] = '#5a4a30';   // spruce_planks
        colors[34] = '#8a7a60';   // jungle_planks
        colors[35] = '#e8e8e8';   // white_wool
        colors[36] = '#c0c0c0';   // light_gray_wool
        colors[37] = '#a83232';   // red_wool
        colors[38] = '#3a5a9a';   // blue_wool
        colors[39] = '#3a8a3a';   // green_wool
        colors[40] = '#d4a830';   // yellow_wool
        colors[41] = '#8a3a8a';   // purple_wool
        colors[42] = '#c06030';   // orange_wool
        colors[43] = '#3a3a3a';   // black_wool
        colors[44] = '#6a6a6a';   // gray_wool
        colors[45] = '#e0c8a0';   // tan_wool
        colors[46] = '#80b0d0';   // light_blue_wool
        colors[47] = '#80d080';   // lime_wool
        colors[48] = '#d080d0';   // magenta_wool
        colors[49] = '#e0e080';   // pink_wool

        // Ore/metal blocks
        colors[50] = '#5a5a5a';   // coal_ore
        colors[51] = '#6a7a7a';   // iron_ore
        colors[52] = '#5a6a8a';   // copper_ore
        colors[53] = '#4a8a8a';   // gold_ore
        colors[54] = '#3a7a5a';   // redstone_ore
        colors[55] = '#3a5a8a';   // lapis_ore
        colors[56] = '#2a8a5a';   // emerald_ore
        colors[57] = '#80d0f0';   // diamond_ore
        colors[58] = '#c0a040';   // nether_gold_ore
        colors[59] = '#6a6a8a';   // nether_quartz_ore

        // Special blocks
        colors[60] = '#cc4400';   // lava (semi-transparent)
        colors[61] = '#f0e060';   // glowstone
        colors[62] = '#80c0f0';   // sea_lantern
        colors[63] = '#4a3a2a';   // sugar_cane
        colors[64] = '#6a5a4a';   // bamboo
        colors[65] = 'rgba(180,220,255,0.5)';  // glass (semi-transparent)
        colors[66] = '#2a2a2a';   // bedrock
        colors[67] = '#e0e0e0';   // white_concrete
        colors[68] = '#d04040';   // red_concrete
        colors[69] = '#4040d0';   // blue_concrete
        colors[70] = '#40a040';   // green_concrete
        colors[71] = '#e0c040';   // yellow_concrete
        colors[72] = '#8040a0';   // purple_concrete
        colors[73] = '#d06030';   // orange_concrete
        colors[74] = '#202020';   // black_concrete
        colors[75] = '#606060';   // gray_concrete

        // Nether blocks
        colors[76] = '#8a3a3a';   // netherrack
        colors[77] = '#3a3a3a';   // basalt
        colors[78] = '#5a4a2a';   // soul_sand
        colors[79] = '#6a5a3a';   // gravel_nether
        colors[80] = '#e0c080';   // warped_stem
        colors[81] = '#2a6a6a';   // warped_planks
        colors[82] = '#1a5a5a';   // warped_conylium
        colors[83] = '#c04040';   // crimson_stem
        colors[84] = '#7a2a2a';   // crimson_planks
        colors[85] = '#6a1a3a';   // crimson_hyphae
        colors[86] = '#d0a0a0';   // warped_wart_block
        colors[87] = '#4a2a2a';   // nether_bricks
        colors[88] = '#5a3a2a';   // red_nether_bricks
        colors[89] = '#6a6a4a';   // sandstone_nether

        // End blocks
        colors[90] = '#c8b8a0';   // end_stone
        colors[91] = '#d8c8b0';   // end_stone_bricks
        colors[92] = '#4a3a5a';   // obsidian
        colors[93] = '#2a2a3a';   // crying_obsidian
        colors[94] = '#e0d0f0';   // purpur_block
        colors[95] = '#c8b8a0';   // purpur_pillar
        colors[96] = '#5a4a6a';   // end_stone_brick_wall

        // Other common blocks
        colors[97] = '#e8d0a0';   // iron_block
        colors[98] = '#f0e8c0';   // gold_block
        colors[99] = '#60d060';   // emerald_block
        colors[100] = '#70b0d0';   // diamond_block
        colors[101] = '#a0a0a0';   // stone_bricks
        colors[102] = '#5a4a30';   // oak_wood
        colors[103] = '#c8a860';   // birch_wood
        colors[104] = '#6a5a3a';   // spruce_wood
        colors[105] = '#9a7a5a';   // jungle_wood
        colors[106] = '#d4c478';   // stone_slab
        colors[107] = '#e0d0b0';   // stone_stairs
        colors[108] = '#4a3a2a';   // fence_gate
        colors[109] = '#6a5a4a';   // iron_bars
        colors[110] = '#3a3a3a';   // redstone_torch_off
        colors[111] = '#ff4444';   // redstone_torch_on
        colors[112] = '#8a6a3a';   // redstone_wire
        colors[113] = '#aa4444';   // repeater_closed
        colors[114] = '#aa4444';   // repeater_open
        colors[115] = '#7a7a7a';   // piston
        colors[116] = '#8a6a5a';   // sticky_piston
        colors[117] = '#c0c0c0';   // observer
        colors[118] = '#aa4444';   // tnt
        colors[119] = '#e0e0e0';   // lever
        colors[120] = '#8a6a3a';   // tripwire

        // Decorative/plant blocks
        colors[121] = '#c8a040';   // sunflower_top
        colors[122] = '#d06060';   // rose_bush_top
        colors[123] = '#e0c0f0';   // peony_top
        colors[124] = '#f0e080';   // dandelion
        colors[125] = '#d040a0';   // poppy
        colors[126] = '#a060d0';   // blue_orchid
        colors[127] = '#e08080';   // allium
        colors[128] = '#f0f0f0';   // azure_bluet
        colors[129] = '#40a0c0';   // cornflower
        colors[130] = '#d04040';   // lily_of_the_valley
        colors[131] = '#80d080';   // lily_pad
        colors[132] = '#4a6a4a';   // vine
        colors[133] = '#6a5a4a';   // sponge
        colors[134] = '#8a7a6a';   // wet_sponge

        // Nether/Wart/Chorus
        colors[135] = '#8a6a3a';   // nether_wart_stage0
        colors[136] = '#6a8a3a';   // nether_wart_stage1
        colors[137] = '#4a6a2a';   // nether_wart_stage2
        colors[138] = '#5a3a6a';   // chorus_plant
        colors[139] = '#7a5a8a';   // chorus_flower
        colors[140] = '#c8a0d0';   // chorus_fruit
        colors[141] = '#e0d0f0';   // purpur_stairs

        // Doors, chests, etc.
        colors[142] = '#8a6a3a';   // oak_door
        colors[143] = '#c0a060';   // iron_door
        colors[144] = '#6a4a2a';   // chest
        colors[145] = '#7a5a3a';   // furnace_off
        colors[146] = '#8a6a4a';   // furnace_on

        // Default fallback for air
        colors[0] = 'transparent';

        _blockColors = colors;
        return _blockColors;
    }

    /**
     * Get the color for a block ID.
     * @param {number} blockId - The block ID.
     * @returns {string} CSS color string, or '#555555' as fallback.
     */
    function _getBlockColor(blockId) {
        if (!_blockColors) _initBlockColors();
        return _blockColors[blockId] || '#555555';
    }

    // ============================================================
    // Surface Map Cache (Bug #10 fix — performance optimization)
    // ============================================================

    /**
     * SurfaceCache — caches the highest surface block per chunk.
     * Reduces per-frame block lookups from O(visible blocks) to O(chunks).
     * @private
     */
    var SurfaceCache = (function () {
        function SurfaceCache() {
            this._cache = Object.create(null); // chunkKey -> {surfaceY: number, blockId: number}
            this._version = 0;
        }

        /**
         * Get cached surface data for a chunk.
         * @param {number} chunkX
         * @param {number} chunkZ
         * @returns {{surfaceY: number, blockId: number}|null}
         */
        SurfaceCache.prototype.get = function (chunkX, chunkZ) {
            var key = chunkX + ',' + chunkZ;
            return this._cache[key] || null;
        };

        /**
         * Set cached surface data for a chunk.
         * @param {number} chunkX
         * @param {number} chunkZ
         * @param {number} surfaceY
         * @param {number} blockId
         */
        SurfaceCache.prototype.set = function (chunkX, chunkZ, surfaceY, blockId) {
            this._cache[chunkX + ',' + chunkZ] = { surfaceY: surfaceY, blockId: blockId };
        };

        /**
         * Invalidate a specific chunk's cache entry.
         * @param {number} chunkX
         * @param {number} chunkZ
         */
        SurfaceCache.prototype.invalidate = function (chunkX, chunkZ) {
            delete this._cache[chunkX + ',' + chunkZ];
        };

        /**
         * Clear the entire cache. Call when dimension changes or chunks unload.
         */
        SurfaceCache.prototype.clear = function () {
            var keys = Object.keys(this._cache);
            for (var i = 0; i < keys.length; i++) {
                delete this._cache[keys[i]];
            }
        };

        /**
         * Increment version (for invalidation tracking).
         */
        SurfaceCache.prototype.touch = function () {
            this._version++;
        };

        return SurfaceCache;
    })();

    // Module-level singleton cache
    var _surfaceCache = null;

    /**
     * Get the module-level surface cache (initialized on first use).
     * @returns {SurfaceCache}
     * @private
     */
    function _getSurfaceCache() {
        if (!_surfaceCache) {
            _surfaceCache = new SurfaceCache();
        }
        return _surfaceCache;
    }

    // ============================================================
    // MapRenderer Class
    // ============================================================

    /**
     * MapRenderer — standalone 2D overhead map renderer for Donkeycraft.
     * Renders surface-only view with auto-zoom, mousewheel zoom targeting,
     * chunk grid lines, and a rotating minimap mode.
     * @param {Object} [options] - Configuration options.
     * @param {Donkeycraft.ChunkManager} [options.chunkManager] - Reference to active chunk manager.
     * @param {number} [options.fullMapWidth=0.66] - Full map width ratio of screen.
     * @param {number} [options.fullMapHeight=0.66] - Full map height ratio of screen.
     * @param {number} [options.minimapSize=150] - Minimap diameter in pixels.
     */
    Donkeycraft.MapRenderer = function (options) {
        options = options || {};

        /**
         * Reference to the active chunk manager.
         * @type {Donkeycraft.ChunkManager|null}
         */
        this._chunkManager = options.chunkManager || null;

        /**
         * Full map canvas element.
         * @type {HTMLCanvasElement|null}
         */
        this._fullMapCanvas = null;

        /**
         * Offscreen canvas for the full map (for efficient redraw).
         * @type {HTMLCanvasElement|null}
         * @private
         */
        this._fullMapOffscreen = null;

        /**
         * Minimap canvas element.
         * @type {HTMLCanvasElement|null}
         */
        this._minimapCanvas = null;

        /**
         * Whether the full map view is currently visible.
         * @type {boolean}
         * @private
         */
        this._visible = false;

        /**
         * Current zoom level (pixels per world block).
         * @type {number}
         * @private
         */
        this._zoom = 1.0;

        /**
         * Map offset X (world space) — used for panning.
         * @type {number}
         * @private
         */
        this._offsetX = 0;

        /**
         * Map offset Y (world space) — used for panning.
         * @type {number}
         * @private
         */
        this._offsetY = 0;

        /**
         * Whether the user is currently dragging the map.
         * @type {boolean}
         * @private
         */
        this._dragging = false;

        /**
         * Last mouse position X during drag.
         * @type {number}
         * @private
         */
        this._dragLastX = 0;

        /**
         * Last mouse position Y during drag.
         * @type {number}
         * @private
         */
        this._dragLastY = 0;

        /**
         * Size of one map "pixel" in world blocks at zoom=1.
         * Each logical block is rendered as a square of this size on canvas.
         * @type {number}
         * @private
         */
        this._blockPixelSize = 2;

        /**
         * Minimap radius in blocks (shows this many blocks around player).
         * @type {number}
         * @private
         */
        this._minimapRadius = Config.MAP_MINIMAP_RADIUS || 32;

        /**
         * Dimension name for display overlay.
         * @type {string}
         * @private
         */
        this._dimensionName = 'Overworld';

        /**
         * Canvas container element for the full map.
         * @type {HTMLElement|null}
         * @private
         */
        this._mapPanel = null;

        /**
         * Toggle button element.
         * @type {HTMLButtonElement|null}
         * @private
         */
        this._toggleBtn = null;

        /**
         * Close button element.
         * @type {HTMLButtonElement|null}
         * @private
         */
        this._closeBtn = null;

        /**
         * Whether we own the map panel DOM element (created by us vs pre-existing).
         * @type {boolean}
         * @private
         */
        this._ownsPanel = false;

        /**
         * Whether we own the toggle button DOM element.
         * @type {boolean}
         * @private
         */
        this._ownsToggleBtn = false;

        /**
         * Whether this instance has been destroyed.
         * @type {boolean}
         * @private
         */
        this._destroyed = false;

        /**
         * Debounce timer ID for auto-zoom recalculation.
         * @type {number|null}
         * @private
         */
        this._autoZoomTimer = null;

        // Bug #2 fix: Store named handler references for proper cleanup
        this._handlers = {
            _onWheel: null,
            _onMouseDown: null,
            _onMouseUp: null,
            _onMouseMove: null,
            _onMouseLeave: null,
            _onToggleClick: null,
            _onCloseClick: null,
            _onMinimapClick: null
        };

        // ============================================================
        // Time-of-Day Dial State
        // ============================================================

        /**
         * Current time of day value [0, 1). 0 = sunrise, 0.5 = noon, 0.75 = sunset.
         * @type {number|null}
         * @private
         */
        this._timeOfDay = null;

        /**
         * Frozen time of day for creative mode (set when player freezes time).
         * Null means time flows naturally; non-null overrides the game time.
         * @type {number|null}
         * @private
         */
        this._frozenTimeOfDay = null;

        /**
         * Whether the time dial is currently frozen in creative mode.
         * @type {boolean}
         * @private
         */
        this._timeFrozen = false;

        /**
         * Current game mode ('survival', 'creative', 'spectator').
         * Used to determine if the time dial should be interactive.
         * @type {string|null}
         * @private
         */
        this._gameMode = null;

        /**
         * DOM element for the time dial slider popup overlay.
         * Created lazily when first needed in creative mode.
         * @type {HTMLElement|null}
         * @private
         */
        this._timeSliderPopup = null;

        /**
         * Whether the time slider popup is currently visible.
         * @type {boolean}
         * @private
         */
        this._sliderVisible = false;

        /**
         * Cached minimap canvas click handler reference for cleanup.
         * @type {Function|null}
         * @private
         */
        this._minimapClickHandler = null;

        /**
         * Background color transition state for smooth day/night cycling.
         * @type {{r: number, g: number, b: number, a: number}|null}
         * @private
         */
        this._bgColorTarget = { r: 10, g: 15, b: 20, a: 0.85 };

        /**
         * Current animated background color for the minimap.
         * Interpolates toward _bgColorTarget each frame.
         * @type {{r: number, g: number, b: number, a: number}}
         * @private
         */
        this._bgColorCurrent = { r: 10, g: 15, b: 20, a: 0.85 };

        /**
         * Animation frame ID for background color transitions.
         * @type {number|null}
         * @private
         */
        this._bgColorAnimFrame = null;

        /**
         * Whether the minimap canvas has been set up for time dial interactions.
         * @type {boolean}
         * @private
         */
        this._timeDialInitialized = false;
    };

    /**
     * Initialize the map renderer. Sets up internal canvases and block colors.
     * @returns {boolean} True if initialized successfully.
     */
    Donkeycraft.MapRenderer.prototype.init = function () {
        try {
            // Initialize block color lookup table
            _initBlockColors();

            // Create offscreen canvas for full map rendering
            this._fullMapOffscreen = document.createElement('canvas');

            // Store the 2D context of the offscreen canvas for drawing
            this._fullMapCtx = this._fullMapOffscreen.getContext('2d');

            // Initialize surface cache
            _getSurfaceCache();

            return true;
        } catch (e) {
            Donkeycraft.Logger.error('MapRenderer', 'Initialization failed: ' + e.message);
            return false;
        }
    };

    /**
     * Create the map panel DOM element if it doesn't exist.
     * Bug #7 fix: Simplified DOM flow with ownership tracking (Bug #9).
     * @private
     */
    Donkeycraft.MapRenderer.prototype._createMapPanel = function () {
        // If already created, nothing to do
        if (this._mapPanel) return;

        var panel = document.getElementById('dk-map-panel');
        if (panel) {
            // Pre-existing in DOM — don't remove on destroy
            this._mapPanel = panel;
            this._ownsPanel = false;
        } else {
            // Create new
            panel = document.createElement('div');
            panel.id = 'dk-map-panel';
            panel.className = 'dk-map-panel';
            this._mapPanel = panel;
            this._ownsPanel = true;
        }

        // Close button
        var closeBtn = document.getElementById('dk-map-close-btn') || document.createElement('button');
        if (!document.getElementById('dk-map-close-btn')) {
            closeBtn.id = 'dk-map-close-btn';
            closeBtn.className = 'dk-map-close-btn';
            closeBtn.title = 'Close Map (Esc)';
            closeBtn.textContent = '\u2715'; // ✕
            this._mapPanel.appendChild(closeBtn);
        }
        this._closeBtn = closeBtn;

        // Bug #2 fix: Store named handler for cleanup
        var renderer = this;
        this._handlers._onCloseClick = function () {
            renderer.hideMap();
        };
        this._closeBtn.addEventListener('click', this._handlers._onCloseClick);

        // Full map canvas — use existing or create
        var canvas = document.getElementById('dk-map-canvas');
        if (canvas) {
            this._fullMapCanvas = canvas;
        }

        // Attach drag/zoom listeners to the canvas
        if (this._fullMapCanvas) {
            this._attachCanvasListeners(this._fullMapCanvas);
        }

        // Append panel to body if we own it and it's not already in DOM
        if (this._ownsPanel && !document.getElementById('dk-map-panel')) {
            document.body.appendChild(this._mapPanel);
        }
    };

    /**
     * Attach canvas event listeners for drag and zoom.
     * Bug #2 fix: Uses named handlers stored on this._handlers for cleanup.
     * @param {HTMLCanvasElement} canvas
     * @private
     */
    Donkeycraft.MapRenderer.prototype._attachCanvasListeners = function (canvas) {
        var renderer = this;

        // Wheel handler — store reference for cleanup
        this._handlers._onWheel = function (e) {
            e.preventDefault();
            renderer._onWheel(e);
        };
        canvas.addEventListener('wheel', this._handlers._onWheel, { passive: false });

        // Mouse down
        this._handlers._onMouseDown = function (e) {
            if (e.button === 0) { // Left click only
                renderer._dragging = true;
                renderer._dragLastX = e.clientX;
                renderer._dragLastY = e.clientY;
                canvas.style.cursor = 'grabbing';
            }
        };
        canvas.addEventListener('mousedown', this._handlers._onMouseDown);

        // Mouse up
        this._handlers._onMouseUp = function () {
            renderer._dragging = false;
            if (canvas) canvas.style.cursor = '';
        };
        canvas.addEventListener('mouseup', this._handlers._onMouseUp);

        // Mouse move (on canvas)
        this._handlers._onMouseMove = function (e) {
            if (renderer._dragging) {
                var dx = e.clientX - renderer._dragLastX;
                var dy = e.clientY - renderer._dragLastY;
                renderer._offsetX -= dx / renderer._zoom;
                renderer._offsetY -= dy / renderer._zoom;
                renderer._dragLastX = e.clientX;
                renderer._dragLastY = e.clientY;
            }
        };
        canvas.addEventListener('mousemove', this._handlers._onMouseMove);

        // Mouse leave (on canvas) — stop drag if pointer leaves
        this._handlers._onMouseLeave = function () {
            renderer._dragging = false;
            if (canvas) canvas.style.cursor = '';
        };
        canvas.addEventListener('mouseleave', this._handlers._onMouseLeave);
    };

    /**
     * Create the toggle button DOM element if it doesn't exist.
     * Bug #9 fix: Tracks ownership for cleanup.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._createToggleButton = function () {
        if (this._toggleBtn) return;

        var btn = document.getElementById('dk-map-toggle-btn');
        if (btn) {
            this._toggleBtn = btn;
            this._ownsToggleBtn = false;
            return;
        }

        btn = document.createElement('button');
        btn.id = 'dk-map-toggle-btn';
        btn.className = 'dk-map-toggle-btn';
        btn.textContent = '\u2630 Map'; // ☰ Map
        btn.title = 'Toggle Map View (M)';
        this._toggleBtn = btn;
        this._ownsToggleBtn = true;

        // Bug #2 fix: Store named handler for cleanup
        var renderer = this;
        this._handlers._onToggleClick = function () {
            if (renderer.isVisible()) {
                renderer.hideMap();
            } else {
                renderer.showMap();
            }
        };
        btn.addEventListener('click', this._handlers._onToggleClick);

        document.body.appendChild(btn);
    };

    /**
     * Set the canvas elements (called externally after DOM is ready).
     * Sets internal dimensions to match container CSS sizes.
     * @param {HTMLCanvasElement} fullMapCanvas - The full map canvas element.
     * @param {HTMLCanvasElement} minimapCanvas - The minimap canvas element.
     */
    Donkeycraft.MapRenderer.prototype.setCanvases = function (fullMapCanvas, minimapCanvas) {
        this._fullMapCanvas = fullMapCanvas || this._fullMapCanvas;
        this._minimapCanvas = minimapCanvas || this._minimapCanvas;

        // Set minimap internal dimensions explicitly (Bug fix: was only set in _resizeCanvases)
        if (this._minimapCanvas) {
            var minimapSize = Config.MAP_MINIMAP_SIZE || 150;
            this._minimapCanvas.width = minimapSize;
            this._minimapCanvas.height = minimapSize;
        }

        // Set full map canvas internal dimensions to match CSS container size
        if (this._fullMapCanvas) {
            if (this._mapPanel) {
                var panelRect = this._mapPanel.getBoundingClientRect();
                if (panelRect.width > 0 && panelRect.height > 0) {
                    this._fullMapCanvas.width = Math.floor(panelRect.width);
                    this._fullMapCanvas.height = Math.floor(panelRect.height);
                } else {
                    // Panel exists but not laid out yet (display:none), use fallback
                    this._fullMapCanvas.width = Math.floor(window.innerWidth * 0.66);
                    this._fullMapCanvas.height = Math.floor(window.innerHeight * 0.66);
                }
            } else {
                // Panel not created yet — set reasonable default dimensions
                this._fullMapCanvas.width = Math.floor(window.innerWidth * 0.66);
                this._fullMapCanvas.height = Math.floor(window.innerHeight * 0.66);
            }
        }

        // Re-attach canvas listeners if the full map canvas changed
        if (this._fullMapCanvas && !this._handlers._onWheel) {
            this._attachCanvasListeners(this._fullMapCanvas);
        }

        // Attach minimap click handler for time dial interaction
        if (this._minimapCanvas) {
            this._attachMinimapClickHandler();
        }
    };

    /**
     * Set the chunk manager reference.
     * @param {Donkeycraft.ChunkManager} chunkManager - The active chunk manager.
     */
    Donkeycraft.MapRenderer.prototype.setChunkManager = function (chunkManager) {
        this._chunkManager = chunkManager || null;
        // Invalidate surface cache when chunk manager changes
        if (_surfaceCache) _surfaceCache.clear();
    };

    /**
     * Set the dimension name for display on the map overlay.
     * @param {string} name - Dimension name (e.g., "Overworld", "Nether", "End").
     */
    Donkeycraft.MapRenderer.prototype.setDimensionName = function (name) {
        this._dimensionName = name || 'Unknown';
    };

    /**
     * Handle mousewheel zoom on the full map canvas.
     * Zooms toward the cursor position (pointer-target tracking).
     * @param {WheelEvent} e - The wheel event.
     */
    Donkeycraft.MapRenderer.prototype._onWheel = function (e) {
        if (!this._fullMapCanvas || !this._visible) return;

        var zoomFactor = 1.0;
        if (e.deltaY < 0) {
            zoomFactor = 1.15;
        } else if (e.deltaY > 0) {
            zoomFactor = 1.0 / 1.15;
        }

        // Clamp zoom factor per wheel event
        zoomFactor = Math.max(0.5, Math.min(2.0, zoomFactor));

        // Get canvas position to calculate mouse offset in canvas space
        var rect = this._fullMapCanvas.getBoundingClientRect();
        var mouseX = e.clientX - rect.left;
        var mouseY = e.clientY - rect.top;

        var canvasWidth = this._fullMapCanvas.width;
        var canvasHeight = this._fullMapCanvas.height;

        // Calculate world coordinate under the mouse before zoom
        var worldXBefore = this._offsetX + (mouseX / canvasWidth) * (canvasWidth / this._zoom);
        var worldYBefore = this._offsetY + (mouseY / canvasHeight) * (canvasHeight / this._zoom);

        // Apply zoom factor, clamped to config limits
        var newZoom = this._zoom * zoomFactor;
        newZoom = Math.max(Config.MAP_ZOOM_MIN, Math.min(Config.MAP_ZOOM_MAX, newZoom));

        // Adjust offset to keep the world coordinate under the mouse stable
        this._offsetX = worldXBefore - (mouseX / canvasWidth) * (canvasWidth / newZoom);
        this._offsetY = worldYBefore - (mouseY / canvasHeight) * (canvasHeight / newZoom);

        this._zoom = newZoom;

        // Force redraw on next frame by invalidating offscreen canvas
        if (this._fullMapOffscreen) {
            this._fullMapOffscreen.width = canvasWidth;
            this._fullMapOffscreen.height = canvasHeight;
        }
    };

    /**
     * Calculate the auto-zoom level to fit all loaded chunks.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._calculateAutoZoom = function () {
        if (!this._chunkManager || !this._fullMapCanvas) return;

        var chunks = this._chunkManager.getAllChunks();
        if (!chunks || chunks.length === 0) return;

        // Find bounding box of loaded chunks
        var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (var i = 0; i < chunks.length; i++) {
            var cx = chunks[i].chunkX * CHUNK_SIZE;
            var cz = chunks[i].chunkZ * CHUNK_SIZE;
            if (cx < minX) minX = cx;
            if (cx + CHUNK_SIZE > maxX) maxX = cx + CHUNK_SIZE;
            if (cz < minZ) minZ = cz;
            if (cz + CHUNK_SIZE > maxZ) maxZ = cz + CHUNK_SIZE;
        }

        var worldWidth = maxX - minX;
        var worldHeight = maxZ - minZ;
        var padding = 4; // Extra blocks of padding

        var canvasWidth = this._fullMapCanvas.width;
        var canvasHeight = this._fullMapCanvas.height;

        // Calculate zoom to fit
        var zoomX = canvasWidth / (worldWidth + padding * 2);
        var zoomY = canvasHeight / (worldHeight + padding * 2);
        var newZoom = Math.min(zoomX, zoomY);

        // Clamp zoom
        newZoom = Math.max(Config.MAP_ZOOM_MIN, Math.min(Config.MAP_ZOOM_MAX, newZoom));

        // Only update if significantly different (avoid jitter)
        if (Math.abs(newZoom - this._zoom) > 0.01) {
            this._zoom = newZoom;

            // Center on the bounding box
            var centerX = minX + worldWidth / 2;
            var centerY = minZ + worldHeight / 2;
            this._offsetX = centerX - (canvasWidth / 2) / this._zoom;
            this._offsetY = centerY - (canvasHeight / 2) / this._zoom;
        }

        // Force redraw
        if (this._fullMapOffscreen) {
            this._fullMapOffscreen.width = canvasWidth;
            this._fullMapOffscreen.height = canvasHeight;
        }
    };

    /**
     * Get the highest surface block at a given world X,Z position.
     * Uses the surface map cache for performance (Bug #10 fix).
     * Falls back to scanning if cache miss.
     * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager to query.
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} The block ID of the surface block, or 1 (stone) as fallback.
     */
    Donkeycraft.MapRenderer._getSurfaceBlock = function (chunkManager, wx, wz) {
        if (!chunkManager) return 1;

        var chunkX = Math.floor(wx / CHUNK_SIZE);
        var chunkZ = Math.floor(wz / CHUNK_SIZE);
        var localX = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        var localZ = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) return 1;

        // Bug #10: Check surface cache first
        // Note: Chunk objects do NOT have a `version` property — the Chunk class
        // only has `generated`, `_dirty`, and `_destroyed` flags. Therefore the cache
        // is trusted once populated (chunks are never modified after generation).
        var cache = _getSurfaceCache();
        var cached = cache.get(chunkX, chunkZ);

        if (cached) {
            return cached.blockId; // Cache hit — use saved surface block
        }

        // Cache miss — scan from top to bottom for the first visible surface block
        var surfaceY = -1;
        var surfaceBlockId = 1; // Default: stone
        for (var y = Config.WORLD_HEIGHT - 1; y >= 0; y--) {
            var blockId = chunk.getBlock(localX, y, localZ);
            if (blockId === 0) continue; // Air — skip
            if (blockId === 13) continue; // Water — treat as transparent

            surfaceY = y;
            surfaceBlockId = blockId;
            break;
        }

        // Update cache
        if (surfaceY >= 0) {
            cache.set(chunkX, chunkZ, surfaceY, surfaceBlockId);
        }

        return surfaceBlockId;
    };

    /**
     * Render the full map view (top-down, Y-axis looking down).
     * Only renders the highest visible surface block at each (x,z).
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians.
     * @param {number} pitch - Player pitch for direction indicator.
     */
    Donkeycraft.MapRenderer.prototype.renderFullMap = function (playerPos, yaw, pitch) {
        // Bug fix: Always calculate auto-zoom (even when hidden) so zoom level updates
        // as chunks load in the background. The early return below only skips drawing.
        this._calculateAutoZoom();

        if (!this._visible || !this._fullMapCanvas) return;

        var canvas = this._fullMapCanvas;
        var w = canvas.width;
        var h = canvas.height;

        // Resize offscreen canvas if needed
        if (this._fullMapOffscreen.width !== w || this._fullMapOffscreen.height !== h) {
            this._fullMapOffscreen.width = w;
            this._fullMapOffscreen.height = h;
        }

        var ctx = this._fullMapCtx || canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.fillStyle = '#0a0f14'; // Dark background
        ctx.fillRect(0, 0, w, h);

        var zoom = this._zoom;
        var blockPixelSize = this._blockPixelSize * zoom;

        // Calculate visible world range
        var worldLeft = this._offsetX;
        var worldTop = this._offsetY;
        var worldRight = this._offsetX + (w / zoom);
        var worldBottom = this._offsetY + (h / zoom);

        // Round to chunk boundaries for efficiency
        var startChunkX = Math.floor(worldLeft / CHUNK_SIZE) - 1;
        var endChunkX = Math.ceil(worldRight / CHUNK_SIZE) + 1;
        var startChunkZ = Math.floor(worldTop / CHUNK_SIZE) - 1;
        var endChunkZ = Math.ceil(worldBottom / CHUNK_SIZE) + 1;

        // Build set of loaded chunk keys for bounds checking
        var loadedChunkSet = null;
        if (this._chunkManager) {
            var allChunks = this._chunkManager.getAllChunks();
            if (allChunks) {
                loadedChunkSet = Object.create(null);
                for (var a = 0; a < allChunks.length; a++) {
                    var key = allChunks[a].chunkX + ',' + allChunks[a].chunkZ;
                    loadedChunkSet[key] = true;
                }
            }
        }

        // Render each chunk
        for (var cx = startChunkX; cx <= endChunkX; cx++) {
            for (var cz = startChunkZ; cz <= endChunkZ; cz++) {
                var chunkKey = cx + ',' + cz;
                if (loadedChunkSet && !loadedChunkSet[chunkKey]) continue;

                var chunkWorldX = cx * CHUNK_SIZE;
                var chunkWorldZ = cz * CHUNK_SIZE;

                // Canvas position of this chunk's top-left corner
                var canvasX = ((chunkWorldX - this._offsetX) * zoom);
                var canvasY = ((chunkWorldZ - this._offsetY) * zoom);
                var chunkPixelSize = CHUNK_SIZE * blockPixelSize;

                // Draw chunk background
                ctx.fillStyle = '#0d1218';
                ctx.fillRect(
                    Math.floor(canvasX),
                    Math.floor(canvasY),
                    Math.ceil(chunkPixelSize) + 1,
                    Math.ceil(chunkPixelSize) + 1
                );

                // Render surface blocks (Bug #3 fix: always render, no zoom gap)
                this._renderSurfaceBlocks(ctx, cx, cz, canvasX, canvasY, blockPixelSize, zoom);

                // Draw chunk border
                ctx.strokeStyle = 'rgba(100, 200, 100, 0.15)';
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    Math.floor(canvasX),
                    Math.floor(canvasY),
                    Math.ceil(chunkPixelSize),
                    Math.ceil(chunkPixelSize)
                );
            }
        }

        // Draw grid lines every 64 blocks (Bug #4 fix: correct coordinate transformation)
        ctx.strokeStyle = 'rgba(100, 200, 100, 0.25)';
        ctx.lineWidth = 1;
        this._drawGridLines(ctx, worldLeft, worldTop, worldRight, worldBottom, zoom);

        // Draw player position and direction indicator
        this._renderPlayerIndicator(ctx, playerPos, yaw, w, h, zoom);

        // Draw dimension label and stats overlay
        this._renderOverlay(ctx, w, h);

        // Copy offscreen to visible canvas (avoids flicker)
        var visibleCanvas = this._fullMapCanvas;
        if (visibleCanvas) {
            var visibleCtx = visibleCanvas.getContext('2d');
            if (visibleCtx) {
                visibleCtx.clearRect(0, 0, w, h);
                visibleCtx.drawImage(this._fullMapOffscreen, 0, 0);
            }
        }
    };

    /**
     * Render surface blocks for a chunk.
     * Bug #3 fix: Removed the zoom-level guard — always renders blocks now.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderSurfaceBlocks = function (ctx, chunkX, chunkZ, canvasX, canvasY, blockPixelSize, zoom) {
        var chunk = this._chunkManager ? this._chunkManager.getChunkIfExists(chunkX, chunkZ) : null;
        if (!chunk) return;

        for (var lx = 0; lx < CHUNK_SIZE; lx++) {
            for (var lz = 0; lz < CHUNK_SIZE; lz++) {
                var blockId = Donkeycraft.MapRenderer._getSurfaceBlock(
                    this._chunkManager,
                    chunkX * CHUNK_SIZE + lx,
                    chunkZ * CHUNK_SIZE + lz
                );
                if (blockId === 0 || blockId === 13) continue; // Skip air and water

                var color = _getBlockColor(blockId);
                ctx.fillStyle = color || '#555';
                ctx.fillRect(
                    Math.floor(canvasX + lx * blockPixelSize),
                    Math.floor(canvasY + lz * blockPixelSize),
                    Math.ceil(blockPixelSize),
                    Math.ceil(blockPixelSize)
                );
            }
        }
    };

    /**
     * Draw grid lines every 64 blocks for orientation.
     * Bug #4 fix: Corrected coordinate transformation to use proper offset.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._drawGridLines = function (ctx, worldLeft, worldTop, worldRight, worldBottom, zoom) {
        var gridSpacing = 64;

        // Vertical grid lines — Bug #4 fix: correct canvas X from world X
        var startGX = Math.floor(worldLeft / gridSpacing) * gridSpacing;
        for (var gx = startGX; gx <= worldRight; gx += gridSpacing) {
            var canvasGX = (gx - this._offsetX) * zoom;
            // Correct: transform top/bottom using offset, not raw world coordinates
            var canvasTopY = (worldTop - this._offsetY) * zoom;
            var canvasBottomY = (worldBottom - this._offsetY) * zoom;
            ctx.beginPath();
            ctx.moveTo(Math.floor(canvasGX) + 0.5, Math.floor(canvasTopY));
            ctx.lineTo(Math.floor(canvasGX) + 0.5, Math.floor(canvasBottomY));
            ctx.stroke();
        }

        // Horizontal grid lines — Bug #4 fix: correct canvas Y from world Z
        var startGZ = Math.floor(worldTop / gridSpacing) * gridSpacing;
        for (var gz = startGZ; gz <= worldBottom; gz += gridSpacing) {
            var canvasGZ = (gz - this._offsetY) * zoom;
            var canvasLeftX = (worldLeft - this._offsetX) * zoom;
            var canvasRightX = (worldRight - this._offsetX) * zoom;
            ctx.beginPath();
            ctx.moveTo(Math.floor(canvasLeftX), Math.floor(canvasGZ) + 0.5);
            ctx.lineTo(Math.floor(canvasRightX), Math.floor(canvasGZ) + 0.5);
            ctx.stroke();
        }
    };

    /**
     * Render the player indicator on the full map.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderPlayerIndicator = function (ctx, playerPos, yaw, w, h, zoom) {
        var canvasX = (playerPos.x - this._offsetX) * zoom;
        var canvasY = (playerPos.z - this._offsetY) * zoom;

        // Player dot
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Direction arrow (points in the direction the player is facing)
        // Player forward direction: (-sin(yaw), 0, -cos(yaw)) — matches getForwardDirection()
        // Canvas X = world X, Canvas Y = world Z
        var arrowLength = 10;
        var arrowEndX = canvasX - Math.sin(yaw) * arrowLength;
        var arrowEndY = canvasY - Math.cos(yaw) * arrowLength;

        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvasX, canvasY);
        ctx.lineTo(arrowEndX, arrowEndY);
        ctx.stroke();

        // Arrowhead
        var arrowAngle = Math.atan2(arrowEndY - canvasY, arrowEndX - canvasX);
        var headSize = 4;
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.moveTo(arrowEndX, arrowEndY);
        ctx.lineTo(
            arrowEndX - headSize * Math.cos(arrowAngle - Math.PI / 6),
            arrowEndY - headSize * Math.sin(arrowAngle - Math.PI / 6)
        );
        ctx.lineTo(
            arrowEndX - headSize * Math.cos(arrowAngle + Math.PI / 6),
            arrowEndY - headSize * Math.sin(arrowAngle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
    };

    /**
     * Render the dimension label and stats overlay on the full map.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderOverlay = function (ctx, w, h) {
        // Semi-transparent overlay background for text
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(8, 8, 200, 60);

        ctx.font = '12px Consolas, Monaco, Courier New, monospace';
        ctx.textBaseline = 'top';

        // Dimension name
        ctx.fillStyle = '#8f8';
        ctx.fillText(this._dimensionName, 14, 14);

        // Zoom level
        ctx.fillStyle = '#ccc';
        ctx.fillText('Zoom: ' + this._zoom.toFixed(2) + 'x', 14, 30);

        // Chunk count
        var chunkCount = this._chunkManager ? this._chunkManager.getChunkCount() : 0;
        ctx.fillText('Chunks: ' + chunkCount, 14, 46);
    };

    /**
     * Render the rotating minimap (top-left, "up" = player forward).
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians.
     * @param {number} pitch - Player pitch.
     */
    Donkeycraft.MapRenderer.prototype.renderMinimap = function (playerPos, yaw, pitch) {
        if (!this._minimapCanvas) return;

        var canvas = this._minimapCanvas;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var size = canvas.width;
        var halfSize = size / 2;
        var radius = halfSize - 2; // Leave room for border

        if (size === 0 || radius <= 0) return;

        // Calculate blocks per pixel for minimap
        var blocksPerPixel = this._minimapRadius * 2 / radius;

        // Clear and clip to circle
        ctx.clearRect(0, 0, size, size);

        // Update background color animation based on time of day
        this._updateBgColor();

        // Background — animated color transitions with day/night cycle
        var bc = this._bgColorCurrent;
        ctx.fillStyle = 'rgba(' + Math.round(bc.r) + ',' + Math.round(bc.g) + ',' + Math.round(bc.b) + ',' + bc.a.toFixed(2) + ')';
        ctx.fillRect(0, 0, size, size);

        // Save context and clip to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, radius, 0, Math.PI * 2);
        ctx.clip();

        // Rotate context so player's forward direction is "up"
        ctx.translate(halfSize, halfSize);
        ctx.rotate(-yaw + Math.PI); // Flip: yaw=0 (looking +Z) → up on screen

        // Draw terrain tiles around the player
        var tileWorldSize = blocksPerPixel * this._blockPixelSize;
        if (tileWorldSize < 0.3) tileWorldSize = 0.3; // Minimum tile size

        var halfWorld = this._minimapRadius;
        var startBlockX = Math.floor(-halfWorld);
        var endBlockX = Math.ceil(halfWorld);
        var startBlockZ = Math.floor(-halfWorld);
        var endBlockZ = Math.ceil(halfWorld);

        for (var bx = startBlockX; bx <= endBlockX; bx++) {
            for (var bz = startBlockZ; bz <= endBlockZ; bz++) {
                var worldX = playerPos.x + bx;
                var worldZ = playerPos.z + bz;
                var blockId = Donkeycraft.MapRenderer._getSurfaceBlock(this._chunkManager, worldX, worldZ);

                if (blockId === 0 || blockId === 13) continue; // Skip air and water

                var color = _getBlockColor(blockId);
                ctx.fillStyle = color || '#555';
                ctx.fillRect(
                    bx * tileWorldSize,
                    bz * tileWorldSize,
                    Math.ceil(tileWorldSize),
                    Math.ceil(tileWorldSize)
                );
            }
        }

        // Draw player as a bright green triangle at center
        ctx.fillStyle = '#00ff44';
        ctx.strokeStyle = '#003311';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -5);   // Front (pointing up in rotated space)
        ctx.lineTo(-3, 4);   // Back left
        ctx.lineTo(3, 4);    // Back right
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Restore context (remove clip and rotation)
        ctx.restore();

        // Draw compass ring (Bug #5 fix: fixed N at top of circle)
        this._renderCompassRing(ctx, halfSize, radius);

        // Draw time-of-day dial ring on the outer edge
        try {
            this._renderTimeDial(ctx, halfSize, radius);
        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Time dial render error: ' + e.message);
        }

        // Draw border
        ctx.strokeStyle = 'rgba(100, 200, 100, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, radius, 0, Math.PI * 2);
        ctx.stroke();
    };

    /**
     * Render the compass ring on the minimap.
     * Bug #5 fix: N is fixed at top of circle; E/S/W at 90° intervals.
     * The terrain rotates around the player; compass markers stay fixed.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderCompassRing = function (ctx, cx, cy, radius) {
        // Compass ring background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
        ctx.fill();

        // Direction markers — fixed positions on screen
        ctx.font = 'bold 10px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var labelRadius = radius + 12;

        // N — always at top
        ctx.fillStyle = '#ff4444';
        ctx.fillText('N', cx, cy - labelRadius);

        // E — always at right
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('E', cx + labelRadius, cy);

        // S — always at bottom
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('S', cx, cy + labelRadius);

        // W — always at left
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('W', cx - labelRadius, cy);
    };

    // ============================================================
    // Time-of-Day Dial Rendering
    // ============================================================

    /**
     * Set the current time of day for the dial display.
     * Called each frame by the game loop to keep the dial in sync.
     * @param {number} timeOfDay - Time of day value in [0, 1). 0 = sunrise, 0.5 = noon, 0.75 = sunset.
     */
    Donkeycraft.MapRenderer.prototype.setTimeOfDay = function (timeOfDay) {
        if (typeof timeOfDay !== 'number' || isNaN(timeOfDay)) return;
        this._timeOfDay = ((timeOfDay % 1) + 1) % 1; // Normalize to [0, 1)
    };

    /**
     * Set the current game mode. Determines whether the time dial is interactive.
     * @param {string|null} gameMode - 'survival', 'creative', or 'spectator'.
     */
    Donkeycraft.MapRenderer.prototype.setGameMode = function (gameMode) {
        if (typeof gameMode !== 'string' || !gameMode) return;
        this._gameMode = gameMode;
    };

    /**
     * Freeze the time of day to a specific value. Used in creative mode when the player locks time.
     * @param {number|null} frozenTime - Time of day to freeze at, or null to unfreeze.
     */
    Donkeycraft.MapRenderer.prototype.freezeTime = function (frozenTime) {
        if (frozenTime === null) {
            this._timeFrozen = false;
            this._frozenTimeOfDay = null;
        } else if (typeof frozenTime === 'number' && !isNaN(frozenTime)) {
            this._timeFrozen = true;
            this._frozenTimeOfDay = ((frozenTime % 1) + 1) % 1;
        }
    };

    /**
     * Get the current effective time of day (frozen or natural).
     * @returns {number} Time of day in [0, 1).
     */
    Donkeycraft.MapRenderer.prototype.getEffectiveTimeOfDay = function () {
        if (this._timeFrozen && this._frozenTimeOfDay !== null) {
            return this._frozenTimeOfDay;
        }
        return this._timeOfDay !== null ? this._timeOfDay : 0.5;
    };

    /**
     * Get the current frozen time of day value, or null if not frozen.
     * @returns {number|null} Frozen time of day, or null.
     */
    Donkeycraft.MapRenderer.prototype.getFrozenTime = function () {
        return this._frozenTimeOfDay;
    };

    /**
     * Get whether the time dial slider popup is currently visible.
     * @returns {boolean} True if the slider is visible.
     */
    Donkeycraft.MapRenderer.prototype.isSliderVisible = function () {
        return this._sliderVisible;
    };

    /**
     * Update the minimap background color to smoothly transition based on time of day.
     * Uses exponential interpolation toward a target color computed from the lighting system keyframes.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._updateBgColor = function () {
        if (this._timeOfDay === null) return;

        var t = this._timeOfDay;
        var target = this._bgColorTarget;

        // Compute target background color from time of day using lighting keyframes
        // These match the sky color keyframes in Lighting.getSkyColor()
        if (t < 0.20) {
            // Midnight to pre-dawn: deep dark blue-black
            target.r = 8; target.g = 10; target.b = 18; target.a = 0.9;
        } else if (t < 0.30) {
            // Pre-dawn to sunrise: warm dark transition
            var phase = (t - 0.20) / 0.10;
            target.r = 8 + phase * 2; target.g = 10 + phase * 5; target.b = 18 - phase * 8; target.a = 0.85;
        } else if (t < 0.40) {
            // Sunrise to morning: brightening
            var phase2 = (t - 0.30) / 0.10;
            target.r = 10 + phase2 * 10; target.g = 15 + phase2 * 8; target.b = 10 + phase2 * 10; target.a = 0.82 - phase2 * 0.02;
        } else if (t < 0.55) {
            // Morning to midday: bright blue
            var phase3 = (t - 0.40) / 0.15;
            target.r = 12 + phase3 * 4; target.g = 23 + phase3 * 10; target.b = 20 + phase3 * 8; target.a = 0.80;
        } else if (t < 0.70) {
            // Midday to sunset: warming
            var phase4 = (t - 0.55) / 0.15;
            target.r = 16 + phase4 * 20; target.g = 33 - phase4 * 10; target.b = 28 - phase4 * 12; target.a = 0.80 + phase4 * 0.05;
        } else if (t < 0.80) {
            // Sunset to dusk: darkening rapidly
            var phase5 = (t - 0.70) / 0.10;
            target.r = 36 - phase5 * 28; target.g = 23 - phase5 * 13; target.b = 16 + phase5 * 2; target.a = 0.85 + phase5 * 0.05;
        } else {
            // Dusk to midnight: deep dark
            var phase6 = (t - 0.80) / 0.20;
            target.r = 8 + phase6 * 0; target.g = 10 + phase6 * 0; target.b = 18 + phase6 * 0; target.a = 0.9;
        }

        // Exponential interpolation toward target (smooth animation)
        var lerpFactor = 0.03;
        this._bgColorCurrent.r += (target.r - this._bgColorCurrent.r) * lerpFactor;
        this._bgColorCurrent.g += (target.g - this._bgColorCurrent.g) * lerpFactor;
        this._bgColorCurrent.b += (target.b - this._bgColorCurrent.b) * lerpFactor;
        this._bgColorCurrent.a += (target.a - this._bgColorCurrent.a) * lerpFactor;
    };

    /**
     * Render the time-of-day dial ring attached to the minimap rim.
     * Draws a partial arc wrapping over the top of the minimap, showing the day/night cycle
     * with an animated sun/moon pointer that tracks the current time of day.
     *
     * Arc geometry: spans from ~200deg (lower-left) counter-clockwise through 270deg (top-center)
     * to ~340deg (lower-right), covering approximately 280deg of arc.
     * This leaves the bottom portion clear for compass markers.
     *
     * Time mapping: 6 AM at left edge, 12 PM at top-center, 6 PM at right edge.
     * Nighttime values clamp to the nearest visible arc edge.
     *
     * @param {CanvasRenderingContext2D} ctx - The 2D canvas rendering context.
     * @param {number} cx - Center X coordinate of the minimap.
     * @param {number} cy - Center Y coordinate of the minimap.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderTimeDial = function (ctx, cx, cy) {
        try {
            if (!ctx || typeof cx !== 'number' || typeof cy !== 'number') return;

            var tod = this.getEffectiveTimeOfDay();

            // Ring dimensions — positioned on the outer rim of the minimap
            var innerRadius = 17;
            var outerRadius = 24;
            var midRadius = (innerRadius + outerRadius) / 2;

            // Arc geometry: wraps over the TOP of the minimap.
            // Canvas coords: 0=right, PI/2=bottom, PI=left, 3PI/2=top.
            // Clockwise arc from left(PI) through top(3PI/2) to right(2PI).
            var arcStartAngle = Math.PI + 0.35;   // ~200deg — lower-left (sunrise / 6 AM)
            var arcEndAngle = 2 * Math.PI - 0.35; // ~340deg — lower-right (sunset / 6 PM)
            // sweepFlag=false = clockwise in canvas. Clockwise from PI+0.35 to 2PI-0.35
            // passes through 3PI/2 (top-center), which is correct for noon.
            var totalArcSpan = arcEndAngle - arcStartAngle; // ~5.58 rad (~320deg)

            // Calculate pointer angle from time of day.
            // Linear mapping: tod 0.25 (6 AM) -> arcStart, tod 0.75 (6 PM) -> arcEnd.
            var rawPointerAngle = arcStartAngle + ((tod - 0.25) / 0.5) * totalArcSpan;

            // Clamp pointer to visible arc range.
            // Nighttime values appear at the nearest visible edge.
            var clampedAngle = rawPointerAngle;
            if (clampedAngle < arcStartAngle) {
                clampedAngle = arcStartAngle;
            } else if (clampedAngle > arcEndAngle) {
                clampedAngle = arcEndAngle;
            }

            // ---- Draw semi-transparent backdrop behind the ring ----
            ctx.save();
            this._renderTimeDialBackdrop(ctx, cx, cy, innerRadius, outerRadius, arcStartAngle, totalArcSpan);

            // ---- Draw night base of the ring ----
            ctx.beginPath();
            ctx.arc(cx, cy, midRadius, arcStartAngle, arcEndAngle, false);
            ctx.lineWidth = outerRadius - innerRadius;
            ctx.lineCap = 'butt';
            ctx.strokeStyle = 'rgba(12, 15, 30, 0.65)';
            ctx.stroke();

            // ---- Draw lit day segment ----
            var isDaytime = tod >= 0.2 && tod < 0.75;
            var isSunrise = tod >= 0.2 && tod < 0.35;
            var isSunset = tod >= 0.65 && tod < 0.75;

            if (isDaytime || isSunrise || isSunset) {
                // Map day hours to arc positions
                var dayStartAngle = arcStartAngle + ((0.2 - 0.25) / 0.5) * totalArcSpan;
                var dayEndAngle = arcStartAngle + ((0.75 - 0.25) / 0.5) * totalArcSpan;

                // Clamp to visible arc bounds
                if (dayStartAngle < arcStartAngle) dayStartAngle = arcStartAngle;
                if (dayEndAngle > arcEndAngle) dayEndAngle = arcEndAngle;

                if (dayEndAngle > dayStartAngle) {
                    ctx.beginPath();
                    ctx.arc(cx, cy, midRadius, dayStartAngle, dayEndAngle, false);
                    ctx.lineWidth = outerRadius - innerRadius;
                    ctx.lineCap = 'butt';

                    if (isSunrise && !isSunset) {
                        ctx.strokeStyle = 'rgba(230, 160, 80, 0.7)';
                    } else if (isSunset && !isSunrise) {
                        ctx.strokeStyle = 'rgba(220, 140, 60, 0.65)';
                    } else {
                        ctx.strokeStyle = 'rgba(180, 210, 255, 0.4)';
                    }
                    ctx.stroke();

                    // Inner highlight line for depth
                    ctx.beginPath();
                    ctx.arc(cx, cy, midRadius - 1, dayStartAngle + 0.03, dayEndAngle - 0.03, false);
                    ctx.lineWidth = 1;
                    if (isSunrise) {
                        ctx.strokeStyle = 'rgba(255, 200, 120, 0.45)';
                    } else if (isSunset) {
                        ctx.strokeStyle = 'rgba(255, 180, 100, 0.4)';
                    } else {
                        ctx.strokeStyle = 'rgba(200, 230, 255, 0.25)';
                    }
                    ctx.stroke();
                }
            }

            // ---- Draw subtle stars in night segment ----
            var isNight = tod >= 0.75 || tod < 0.2;
            if (isNight) {
                this._renderTimeDialStars(ctx, cx, cy, midRadius, arcStartAngle, totalArcSpan, tod);
            }

            // ---- Draw hour tick markers ----
            this._renderTimeMarkers(ctx, cx, cy, midRadius, innerRadius, outerRadius, arcStartAngle, totalArcSpan);

            // ---- Draw sun/moon pointer ----
            this._renderTimePointer(ctx, cx, cy, clampedAngle, midRadius, tod);

            // ---- Draw time text below the ring ----
            this._renderTimeText(ctx, cx, cy, outerRadius + 6, tod);

            ctx.restore();

        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Time dial render failed: ' + e.message);
        }
    };

    /**
     * Draw a semi-transparent soft backdrop behind the time ring.
     * Creates a subtle shadow/blur effect where the ring overlaps the minimap terrain.
     * @param {CanvasRenderingContext2D} ctx - The canvas context.
     * @param {number} cx - Center X coordinate.
     * @param {number} cy - Center Y coordinate.
     * @param {number} innerRadius - Inner radius of the ring.
     * @param {number} outerRadius - Outer radius of the ring.
     * @param {number} arcStartAngle - Start angle of the arc in radians.
     * @param {number} totalArcSpan - Total arc span in radians.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderTimeDialBackdrop = function (ctx, cx, cy, innerRadius, outerRadius, arcStartAngle, totalArcSpan) {
        try {
            if (!ctx || typeof cx !== 'number') return;

            var midRadius = (innerRadius + outerRadius) / 2;
            var ringWidth = outerRadius - innerRadius;
            var padding = 4;

            // Draw a filled arc path for the backdrop
            ctx.beginPath();
            ctx.arc(cx, cy, midRadius + padding, arcStartAngle, arcStartAngle + totalArcSpan, false);
            ctx.lineWidth = ringWidth + padding * 2;
            ctx.lineCap = 'butt';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.stroke();

            // Soft outer glow for depth
            ctx.beginPath();
            ctx.arc(cx, cy, midRadius + padding + 2, arcStartAngle, arcStartAngle + totalArcSpan, false);
            ctx.lineWidth = ringWidth + padding * 3;
            ctx.lineCap = 'butt';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.stroke();

        } catch (e) {
            // Backdrop is decorative — silently fail
        }
    };

    /**
     * Render subtle star dots in the night portion of the time ring.
     * @param {CanvasRenderingContext2D} ctx - The canvas context.
     * @param {number} cx - Center X coordinate.
     * @param {number} cy - Center Y coordinate.
     * @param {number} midRadius - Middle radius of the time ring.
     * @param {number} arcStartAngle - Start angle of the visible arc in radians.
     * @param {number} totalArcSpan - Total arc span in radians.
     * @param {number} tod - Current time of day for night intensity calculation.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderTimeDialStars = function (ctx, cx, cy, midRadius, arcStartAngle, totalArcSpan, tod) {
        try {
            if (!ctx || typeof midRadius !== 'number') return;

            // Calculate night intensity with smooth twilight transitions
            var nightIntensity;
            if (tod >= 0.80 || tod < 0.15) {
                nightIntensity = 1.0;
            } else if (tod >= 0.75) {
                nightIntensity = (tod - 0.75) / 0.05;
            } else {
                nightIntensity = (tod - 0.15) / 0.1; // fades out 0.15→0.25
            }

            if (nightIntensity < 0.15) return;

            // Fixed star positions distributed along the arc
            var starAngles = [0.2, 0.6, 1.1, 1.7, 2.3, 2.9, 3.4, 4.0, 4.6, 5.2, 5.6];

            for (var i = 0; i < starAngles.length; i++) {
                var angle = arcStartAngle + starAngles[i];
                if (angle >= arcStartAngle && angle <= arcStartAngle + totalArcSpan) {
                    var radialOffset = (i % 3 === 0) ? -2 : (i % 3 === 1) ? 0 : 2;
                    var x = cx + Math.cos(angle) * (midRadius + radialOffset);
                    var y = cy + Math.sin(angle) * (midRadius + radialOffset);

                    ctx.beginPath();
                    ctx.arc(x, y, 0.7, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 240, ' + (nightIntensity * 0.5).toFixed(2) + ')';
                    ctx.fill();
                }
            }
        } catch (e) {
            // Star rendering is decorative — silently fail
        }
    };

    /**
     * Render small tick marks at hour intervals along the time ring.
     * Major ticks at 6-hour intervals, minor ticks at 3-hour intervals.
     * @param {CanvasRenderingContext2D} ctx - The canvas context.
     * @param {number} cx - Center X coordinate.
     * @param {number} cy - Center Y coordinate.
     * @param {number} midRadius - Middle radius of the time ring.
     * @param {number} innerRadius - Inner radius of the ring.
     * @param {number} outerRadius - Outer radius of the ring.
     * @param {number} arcStartAngle - Start angle of the visible arc in radians.
     * @param {number} totalArcSpan - Total arc span in radians.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderTimeMarkers = function (ctx, cx, cy, midRadius, innerRadius, outerRadius, arcStartAngle, totalArcSpan) {
        try {
            if (!ctx || typeof midRadius !== 'number') return;

            // Hour markers: arc covers 6AM to 6PM (12 hours), map accordingly
            var tickHours = [6, 9, 12, 15, 18]; // 6AM, 9AM, 12PM, 3PM, 6PM
            var tickLabels = ['6AM', '9AM', '12PM', '3PM', '6PM'];

            ctx.font = '7px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (var h = 0; h < tickHours.length; h++) {
                // Map hour to arc fraction: 6AM -> 0.0, 6PM -> 1.0
                var hourFrac = (tickHours[h] - 6) / 12;
                var angle = arcStartAngle + hourFrac * totalArcSpan;

                var isMajor = true; // All displayed ticks are major
                var tickInner = innerRadius - 2;
                var tickOuter = outerRadius + 2;
                var labelOffset = outerRadius + 8;

                // Tick line
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * tickInner, cy + Math.sin(angle) * tickInner);
                ctx.lineTo(cx + Math.cos(angle) * tickOuter, cy + Math.sin(angle) * tickOuter);
                ctx.strokeStyle = 'rgba(200, 200, 220, 0.45)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Label
                var labelX = cx + Math.cos(angle) * labelOffset;
                var labelY = cy + Math.sin(angle) * labelOffset;
                ctx.fillStyle = 'rgba(180, 180, 200, 0.5)';
                ctx.fillText(tickLabels[h], labelX, labelY);
            }
        } catch (e) {
            // Marker rendering is decorative — silently fail
        }
    };

    /**
     * Render the animated sun/moon pointer on the time ring.
     * Draws a glowing sun orb during daytime and a crescent moon during nighttime.
     * @param {CanvasRenderingContext2D} ctx - The canvas context.
     * @param {number} cx - Center X coordinate of the minimap.
     * @param {number} cy - Center Y coordinate of the minimap.
     * @param {number} angle - The pointer angle in radians (canvas coordinate system).
     * @param {number} radius - The radius at which to place the pointer center.
     * @param {number} tod - Current time of day [0, 1) for determining sun/moon appearance.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderTimePointer = function (ctx, cx, cy, angle, radius, tod) {
        try {
            if (!ctx || typeof angle !== 'number' || typeof radius !== 'number') return;

            var px = cx + Math.cos(angle) * radius;
            var py = cy + Math.sin(angle) * radius;

            var isDay = tod >= 0.2 && tod < 0.75;
            var isTwilight = (tod >= 0.15 && tod < 0.2) || (tod >= 0.7 && tod < 0.8);

            if (isDay) {
                // ---- Sun orb with outer glow ----
                var glowRadius = 9;
                var gradient = ctx.createRadialGradient(px, py, 0, px, py, glowRadius);
                gradient.addColorStop(0, 'rgba(255, 240, 180, 0.9)');
                gradient.addColorStop(0.3, 'rgba(255, 220, 120, 0.6)');
                gradient.addColorStop(0.7, 'rgba(255, 200, 80, 0.2)');
                gradient.addColorStop(1, 'rgba(255, 180, 50, 0)');

                ctx.beginPath();
                ctx.arc(px, py, glowRadius, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                // Sun core with highlight
                var sunGrad = ctx.createRadialGradient(px - 1, py - 1, 0, px, py, 5);
                sunGrad.addColorStop(0, 'rgba(255, 255, 230, 1)');
                sunGrad.addColorStop(0.6, 'rgba(255, 235, 150, 0.95)');
                sunGrad.addColorStop(1, 'rgba(255, 210, 100, 0.8)');

                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fillStyle = sunGrad;
                ctx.fill();

                // Specular highlight
                ctx.beginPath();
                ctx.arc(px - 1.2, py - 1.2, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 240, 0.7)';
                ctx.fill();

            } else if (isTwilight) {
                // ---- Transition: fading sun / emerging moon ----
                var transitionAlpha = tod < 0.2 ? (tod - 0.15) / 0.05 : 1.0 - (tod - 0.7) / 0.08;
                if (transitionAlpha < 0) transitionAlpha = 0;
                if (transitionAlpha > 1) transitionAlpha = 1;

                // Faint sun glow
                var twGrad = ctx.createRadialGradient(px, py, 0, px, py, 7);
                twGrad.addColorStop(0, 'rgba(255, 220, 160, ' + (transitionAlpha * 0.7).toFixed(2) + ')');
                twGrad.addColorStop(0.5, 'rgba(255, 180, 120, ' + (transitionAlpha * 0.3).toFixed(2) + ')');
                twGrad.addColorStop(1, 'rgba(255, 150, 80, 0)');

                ctx.beginPath();
                ctx.arc(px, py, 7, 0, Math.PI * 2);
                ctx.fillStyle = twGrad;
                ctx.fill();

                // Subtle moon crescent
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(200, 210, 230, ' + ((1 - transitionAlpha) * 0.6).toFixed(2) + ')';
                ctx.fill();

            } else {
                // ---- Moon crescent ----
                // Outer silvery glow
                var moonGlow = ctx.createRadialGradient(px, py, 0, px, py, 8);
                moonGlow.addColorStop(0, 'rgba(200, 210, 240, 0.35)');
                moonGlow.addColorStop(0.6, 'rgba(180, 190, 220, 0.12)');
                moonGlow.addColorStop(1, 'rgba(160, 170, 200, 0)');

                ctx.beginPath();
                ctx.arc(px, py, 8, 0, Math.PI * 2);
                ctx.fillStyle = moonGlow;
                ctx.fill();

                // Moon body
                var moonGrad = ctx.createRadialGradient(px - 1, py - 1, 0, px, py, 5);
                moonGrad.addColorStop(0, 'rgba(230, 235, 250, 0.9)');
                moonGrad.addColorStop(0.7, 'rgba(200, 210, 235, 0.85)');
                moonGrad.addColorStop(1, 'rgba(170, 180, 210, 0.7)');

                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fillStyle = moonGrad;
                ctx.fill();

                // Crescent shadow (offset circle)
                ctx.beginPath();
                ctx.arc(px + 2, py - 1, 4.2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(25, 30, 50, 0.55)';
                ctx.fill();

                // Moon highlight
                ctx.beginPath();
                ctx.arc(px - 1.5, py - 1.5, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(240, 245, 255, 0.5)';
                ctx.fill();
            }

            // Subtle outer ring for depth
            ctx.beginPath();
            ctx.arc(px, py, 6.5, 0, Math.PI * 2);
            ctx.strokeStyle = isDay ? 'rgba(255, 240, 200, 0.2)' : 'rgba(180, 190, 220, 0.15)';
            ctx.lineWidth = 0.8;
            ctx.stroke();

        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Time pointer render failed: ' + e.message);
        }
    };

    /**
     * Render the digital time display below the time ring.
     * Shows the in-game hour and minute, plus a frozen indicator when active.
     * @param {CanvasRenderingContext2D} ctx - The canvas context.
     * @param {number} cx - Center X coordinate of the minimap.
     * @param {number} cy - Center Y coordinate of the minimap.
     * @param {number} yOffset - Vertical offset from center for the text position.
     * @param {number} tod - Current time of day [0, 1) for computing display time.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderTimeText = function (ctx, cx, cy, yOffset, tod) {
        try {
            if (!ctx || typeof yOffset !== 'number') return;

            var textY = cy + yOffset;

            // Compute display time from time of day
            var ticksInDay = Math.floor(tod * 24000);
            var displayHour = Math.floor(ticksInDay / 1000) % 24;
            var displayMinute = Math.floor((ticksInDay % 1000) / (1000 / 60));

            // Format as 12-hour with AM/PM
            var hour12 = displayHour % 12;
            if (hour12 === 0) hour12 = 12;
            var ampm = displayHour >= 12 ? 'PM' : 'AM';
            var timeStr = hour12 + ':' + (displayMinute < 10 ? '0' : '') + displayMinute + ' ' + ampm;

            if (this._timeFrozen) {
                timeStr += ' \u23F8'; // pause symbol
            }

            // Text styling with shadow for readability
            ctx.font = 'bold 8px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillText(timeStr, cx + 1, textY + 1);

            // Time-appropriate text color
            var isDaytime = tod >= 0.2 && tod < 0.75;
            if (isDaytime) {
                ctx.fillStyle = 'rgba(240, 245, 255, 0.85)';
            } else if ((tod >= 0.15 && tod < 0.2) || (tod >= 0.7 && tod < 0.8)) {
                ctx.fillStyle = 'rgba(230, 210, 180, 0.75)'; // Twilight warm
            } else {
                ctx.fillStyle = 'rgba(180, 190, 220, 0.7)'; // Night cool
            }
            ctx.fillText(timeStr, cx, textY);

            // Frozen badge
            if (this._timeFrozen) {
                var badgeY = textY + 10;
                ctx.font = '6px Consolas, monospace';
                ctx.fillStyle = 'rgba(255, 200, 80, 0.7)';
                ctx.fillText('[FROZEN]', cx, badgeY);
            }

        } catch (e) {
            // Time text is informational — silently fail
        }
    };

    /**
     * Create the time-of-day slider popup DOM element.
     * Only created once and reused. The popup contains a slider input, freeze toggle,
     * and a survival mode return button for creative mode players.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._createSliderPopup = function () {
        if (this._timeSliderPopup) return; // Already created

        try {
            var popup = document.createElement('div');
            popup.className = 'dk-time-dial-popup dk-interactive';
            popup.style.display = 'none';
            popup.innerHTML =
                '<div class="dk-time-dial-header">' +
                    '<span class="dk-time-dial-title">Set Time</span>' +
                    '<button class="dk-time-dial-close" title="Close (Esc)">\u2715</button>' +
                '</div>' +
                '<div class="dk-time-dial-slider-row">' +
                    '<span class="dk-time-dial-label">6 AM</span>' +
                    '<input type="range" class="dk-time-dial-slider" min="0" max="23999" value="6000" step="1">' +
                    '<span class="dk-time-dial-label">6 PM</span>' +
                '</div>' +
                '<div class="dk-time-dial-time-display">12:00 PM</div>' +
                '<div class="dk-time-dial-controls">' +
                    '<button class="dk-time-dial-freeze" title="Freeze/Unfreeze time">Freeze</button>' +
                    '<button class="dk-time-dial-survival" title="Return to natural time flow">Survival</button>' +
                '</div>';

            document.body.appendChild(popup);
            this._timeSliderPopup = popup;

            // Cache element references
            this._sliderInput = popup.querySelector('.dk-time-dial-slider');
            this._timeDisplay = popup.querySelector('.dk-time-dial-time-display');
            this._freezeBtn = popup.querySelector('.dk-time-dial-freeze');
            this._survivalBtn = popup.querySelector('.dk-time-dial-survival');
            this._closeBtn = popup.querySelector('.dk-time-dial-close');

            // Slider input handler
            var self = this;
            if (this._sliderInput) {
                this._sliderInput.addEventListener('input', function () {
                    try {
                        var val = parseInt(this.value, 10);
                        if (!isNaN(val)) {
                            var tod = val / 24000;
                            self._frozenTimeOfDay = tod;
                            self._updateSliderDisplay(tod);
                            // Notify game to apply the frozen time
                            if (self._onTimeSet && typeof self._onTimeSet === 'function') {
                                self._onTimeSet(tod);
                            }
                        }
                    } catch (e) {
                        Donkeycraft.Logger.warn('MapRenderer', 'Slider input error: ' + e.message);
                    }
                });
            }

            // Freeze button handler
            if (this._freezeBtn) {
                this._freezeBtn.addEventListener('click', function () {
                    try {
                        if (self._timeFrozen) {
                            self.freezeTime(null);
                            self._freezeBtn.textContent = 'Freeze';
                            self._freezeBtn.classList.remove('dk-time-dial-freeze-active');
                        } else {
                            var currentTod = self.getEffectiveTimeOfDay();
                            self.freezeTime(currentTod);
                            self._freezeBtn.textContent = 'Unfreeze';
                            self._freezeBtn.classList.add('dk-time-dial-freeze-active');
                            if (self._onTimeSet && typeof self._onTimeSet === 'function') {
                                self._onTimeSet(currentTod);
                            }
                        }
                    } catch (e) {
                        Donkeycraft.Logger.warn('MapRenderer', 'Freeze toggle error: ' + e.message);
                    }
                });
            }

            // Survival button handler — return to natural time flow
            if (this._survivalBtn) {
                this._survivalBtn.addEventListener('click', function () {
                    try {
                        self.freezeTime(null);
                        self._freezeBtn.textContent = 'Freeze';
                        self._freezeBtn.classList.remove('dk-time-dial-freeze-active');
                        if (self._onTimeSet && typeof self._onTimeSet === 'function') {
                            self._onTimeSet(null);
                        }
                        self.hideSliderPopup();
                    } catch (e) {
                        Donkeycraft.Logger.warn('MapRenderer', 'Survival return error: ' + e.message);
                    }
                });
            }

            // Close button handler
            if (this._closeBtn) {
                this._closeBtn.addEventListener('click', function () {
                    try {
                        self.hideSliderPopup();
                    } catch (e) {
                        Donkeycraft.Logger.warn('MapRenderer', 'Close button error: ' + e.message);
                    }
                });
            }

        } catch (e) {
            Donkeycraft.Logger.error('MapRenderer', 'Failed to create slider popup: ' + e.message);
        }
    };

    /**
     * Update the slider display values based on current time of day.
     * @param {number} tod - Time of day value in [0, 1).
     * @private
     */
    Donkeycraft.MapRenderer.prototype._updateSliderDisplay = function (tod) {
        try {
            if (!this._sliderInput || !this._timeDisplay) return;

            var ticksInDay = Math.floor(tod * 24000);
            this._sliderInput.value = ticksInDay;

            var displayHour = Math.floor(ticksInDay / 1000) % 24;
            var displayMinute = Math.floor((ticksInDay % 1000) / (1000 / 60));
            var hour12 = displayHour % 12;
            if (hour12 === 0) hour12 = 12;
            var ampm = displayHour >= 12 ? 'PM' : 'AM';
            this._timeDisplay.textContent = hour12 + ':' + (displayMinute < 10 ? '0' : '') + displayMinute + ' ' + ampm;
        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Slider display update error: ' + e.message);
        }
    };

    /**
     * Show the time-of-day slider popup.
     * Positions the popup near the minimap and initializes it with current time.
     * @param {number} tod - Current time of day to initialize the slider with.
     */
    Donkeycraft.MapRenderer.prototype.showSliderPopup = function (tod) {
        try {
            if (!this._minimapCanvas) return;

            this._createSliderPopup();
            if (!this._timeSliderPopup) return;

            // Initialize slider with current time
            var initTod = tod !== undefined && typeof tod === 'number' ? tod : this.getEffectiveTimeOfDay();
            this._updateSliderDisplay(initTod);

            // Position popup near the minimap (below it, centered)
            var minimapRect = this._minimapCanvas.getBoundingClientRect();
            var popupWidth = 280;
            var popupHeight = 110;
            var left = minimapRect.left + (minimapRect.width - popupWidth) / 2;
            var top = minimapRect.bottom + 8;

            // Keep within viewport
            if (left < 4) left = 4;
            if (left + popupWidth > window.innerWidth - 4) left = window.innerWidth - popupWidth - 4;
            if (top + popupHeight > window.innerHeight - 4) top = minimapRect.top - popupHeight - 8;

            this._timeSliderPopup.style.left = Math.floor(left) + 'px';
            this._timeSliderPopup.style.top = Math.floor(top) + 'px';
            this._timeSliderPopup.style.display = 'block';
            this._sliderVisible = true;

            // Update freeze button state
            if (this._freezeBtn) {
                if (this._timeFrozen) {
                    this._freezeBtn.textContent = 'Unfreeze';
                    this._freezeBtn.classList.add('dk-time-dial-freeze-active');
                } else {
                    this._freezeBtn.textContent = 'Freeze';
                    this._freezeBtn.classList.remove('dk-time-dial-freeze-active');
                }
            }
        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Slider popup show error: ' + e.message);
        }
    };

    /**
     * Hide the time-of-day slider popup.
     */
    Donkeycraft.MapRenderer.prototype.hideSliderPopup = function () {
        try {
            if (!this._timeSliderPopup) return;
            this._timeSliderPopup.style.display = 'none';
            this._sliderVisible = false;

            // Blur any focused element to dismiss keyboard
            if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
            }
        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Slider popup hide error: ' + e.message);
        }
    };

    /**
     * Set a callback for when the time is changed via the slider.
     * The callback receives the new time of day value [0, 1), or null if returning to natural flow.
     * @param {Function|null} callback - Function receiving (timeOfDay: number|null).
     */
    Donkeycraft.MapRenderer.prototype.setOnTimeSet = function (callback) {
        if (typeof callback === 'function') {
            this._onTimeSet = callback;
        } else {
            this._onTimeSet = null;
        }
    };

    /**
     * Handle click on the minimap canvas for time dial interaction.
     * In creative mode, clicking near the time ring opens the slider popup.
     * @param {MouseEvent} e - The mouse click event.
     */
    Donkeycraft.MapRenderer.prototype._onMinimapClick = function (e) {
        try {
            // Only interactive in creative mode
            if (this._gameMode !== 'creative') return;

            // If slider is already visible, don't re-open on click
            if (this._sliderVisible) return;

            var canvas = this._minimapCanvas;
            if (!canvas) return;

            var rect = canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var cx = rect.width / 2;
            var cy = rect.height / 2;

            // Check if click is within the time ring area
            var dx = x - cx;
            var dy = y - cy;
            var dist = Math.sqrt(dx * dx + dy * dy);

            // Time ring is roughly at radius 18-23 from center in canvas coords
            // Scale to actual canvas size (the ring is drawn relative to the canvas dimensions)
            var canvasSize = canvas.width || 160;
            var scale = canvasSize / 160;
            var innerR = 18 * scale;
            var outerR = 23 * scale + 4; // +4 for click tolerance
            var textAreaR = (outerR + 14) * scale; // Ring + text area

            // Accept clicks in the ring area or the time text below it
            if (dist >= innerR - 4 && dist <= outerR + 4) {
                // Clicked on the ring — open slider
                this.showSliderPopup(this.getEffectiveTimeOfDay());
            } else if (dist <= textAreaR && y > cy + outerR * 0.7) {
                // Clicked near the time text area — also open slider
                this.showSliderPopup(this.getEffectiveTimeOfDay());
            }
        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Minimap click handler error: ' + e.message);
        }
    };

    /**
     * Attach the minimap canvas click listener for time dial interaction.
     * Called automatically when setCanvases is invoked with a minimap canvas.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._attachMinimapClickHandler = function () {
        if (!this._minimapCanvas || this._timeDialInitialized) return;

        try {
            var self = this;
            this._minimapClickHandler = function (e) {
                // Only handle left-click when game is not paused and pointer is not locked
                if (e.button !== 0) return;

                // Don't trigger if clicking on a UI element inside the popup
                if (self._sliderVisible && self._timeSliderPopup &&
                    self._timeSliderPopup.contains(e.target)) return;

                // Check if pointer is locked (game in progress) — don't intercept
                if (document.pointerLockElement) return;

                self._onMinimapClick(e);
            };

            this._minimapCanvas.addEventListener('click', this._minimapClickHandler);
            this._timeDialInitialized = true;
        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Failed to attach minimap click handler: ' + e.message);
        }
    };

    /**
     * Remove the minimap canvas click listener.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._detachMinimapClickHandler = function () {
        if (this._minimapCanvas && this._minimapClickHandler) {
            try {
                this._minimapCanvas.removeEventListener('click', this._minimapClickHandler);
            } catch (e) {
                // Ignore cleanup errors
            }
            this._minimapClickHandler = null;
        }
        this._timeDialInitialized = false;
    };

    /**
     * Clean up the slider popup DOM element.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._destroySliderPopup = function () {
        if (this._timeSliderPopup && this._timeSliderPopup.parentNode) {
            try {
                this._timeSliderPopup.parentNode.removeChild(this._timeSliderPopup);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        this._timeSliderPopup = null;
        this._sliderInput = null;
        this._timeDisplay = null;
        this._freezeBtn = null;
        this._survivalBtn = null;
        this._closeBtn = null;
    };

    /**
     * Toggle map visibility.
     * @returns {boolean} True if map is now visible.
     */
    Donkeycraft.MapRenderer.prototype.toggleMap = function () {
        if (this.isVisible()) {
            this.hideMap();
            return false;
        } else {
            this.showMap();
            return true;
        }
    };

    /**
     * Show the map view.
     * Hides the minimap and shows the full map panel.
     */
    Donkeycraft.MapRenderer.prototype.showMap = function () {
        if (this._visible) return;

        this._visible = true;

        // Hide minimap when full map is open
        if (this._minimapCanvas) {
            this._minimapCanvas.style.display = 'none';
        }

        // Show map panel
        this._createMapPanel();
        if (this._mapPanel) {
            this._mapPanel.style.display = 'block';
        }

        // Create and show toggle button
        this._createToggleButton();
        if (this._toggleBtn) {
            this._toggleBtn.style.display = 'none';
        }

        // Resize canvases to fit their containers
        this._resizeCanvases();

        // Calculate auto-zoom to fit all loaded chunks
        this._calculateAutoZoom();

    };

    /**
     * Hide the map view.
     * Shows the minimap and hides the full map panel.
     */
    Donkeycraft.MapRenderer.prototype.hideMap = function () {
        if (!this._visible) return;

        this._visible = false;

        // Show minimap when full map is closed
        if (this._minimapCanvas) {
            this._minimapCanvas.style.display = 'block';
        }

        // Hide map panel
        if (this._mapPanel) {
            this._mapPanel.style.display = 'none';
        }

        // Show toggle button
        if (this._toggleBtn) {
            this._toggleBtn.style.display = '';
        }

        // Hide time dial slider popup when map is hidden
        this.hideSliderPopup();

    };

    /**
     * Check if the map is currently visible.
     * @returns {boolean} True if the map is visible.
     */
    Donkeycraft.MapRenderer.prototype.isVisible = function () {
        return this._visible;
    };

    /**
     * Resize canvases to fit their containers.
     * Bug #6 fix: Handles null canvases gracefully.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._resizeCanvases = function () {
        // Full map canvas — size to panel bounds
        if (this._fullMapCanvas && this._mapPanel) {
            var panelRect = this._mapPanel.getBoundingClientRect();
            this._fullMapCanvas.width = panelRect.width || Math.floor(window.innerWidth * 0.66);
            this._fullMapCanvas.height = panelRect.height || Math.floor(window.innerHeight * 0.66);
        }

        // Minimap canvas — use config size
        if (this._minimapCanvas) {
            var minimapSize = Config.MAP_MINIMAP_SIZE || 150;
            this._minimapCanvas.width = minimapSize;
            this._minimapCanvas.height = minimapSize;
        }
    };

    /**
     * Handle window resize — recanvases and recalculates auto-zoom if visible.
     */
    Donkeycraft.MapRenderer.prototype.onWindowResize = function () {
        this._resizeCanvases();
        if (this._visible) {
            this._calculateAutoZoom();
        }
    };

    /**
     * Called when the chunk manager switches dimensions.
     * Bug #8 fix: Properly handles dimension changes.
     * @param {string} dimName - New dimension name.
     */
    Donkeycraft.MapRenderer.prototype.onDimensionChange = function (dimName) {
        this._dimensionName = dimName || 'Unknown';
        // Invalidate surface cache for new dimension
        if (_surfaceCache) _surfaceCache.clear();
        // Recalculate auto-zoom if visible
        if (this._visible) {
            this._calculateAutoZoom();
        }
    };

    /**
     * Destroy and free all resources.
     * Bug #2 fix: Properly removes all event listeners.
     * Bug #9 fix: Only removes DOM elements we own.
     */
    Donkeycraft.MapRenderer.prototype.destroy = function () {
        if (this._destroyed) return;
        this._destroyed = true;

        var canvas = this._fullMapCanvas;

        // Bug #2 fix: Remove all event listeners using stored handler references
        if (canvas) {
            if (this._handlers._onWheel) canvas.removeEventListener('wheel', this._handlers._onWheel);
            if (this._handlers._onMouseDown) canvas.removeEventListener('mousedown', this._handlers._onMouseDown);
            if (this._handlers._onMouseUp) canvas.removeEventListener('mouseup', this._handlers._onMouseUp);
            if (this._handlers._onMouseMove) canvas.removeEventListener('mousemove', this._handlers._onMouseMove);
            if (this._handlers._onMouseLeave) canvas.removeEventListener('mouseleave', this._handlers._onMouseLeave);
        }

        // Remove toggle button click listener
        if (this._toggleBtn && this._handlers._onToggleClick) {
            this._toggleBtn.removeEventListener('click', this._handlers._onToggleClick);
        }

        // Remove close button click listener
        if (this._closeBtn && this._handlers._onCloseClick) {
            this._closeBtn.removeEventListener('click', this._handlers._onCloseClick);
        }

        // Clear handler references
        for (var key in this._handlers) {
            if (this._handlers.hasOwnProperty(key)) {
                this._handlers[key] = null;
            }
        }

        // Bug #9 fix: Only remove DOM elements we created
        if (this._ownsToggleBtn && this._toggleBtn && this._toggleBtn.parentNode) {
            this._toggleBtn.parentNode.removeChild(this._toggleBtn);
        }
        this._toggleBtn = null;

        if (this._ownsPanel && this._mapPanel && this._mapPanel.parentNode) {
            this._mapPanel.parentNode.removeChild(this._mapPanel);
        }
        this._mapPanel = null;
        this._ownsPanel = false;
        this._ownsToggleBtn = false;

        // Detach minimap click handler for time dial
        this._detachMinimapClickHandler();

        // Destroy slider popup if it exists
        this._destroySliderPopup();

        // Clear canvas references
        this._fullMapCanvas = null;
        this._fullMapOffscreen = null;
        this._minimapCanvas = null;
        this._chunkManager = null;

        // Clear time dial state
        this._timeOfDay = null;
        this._frozenTimeOfDay = null;
        this._timeFrozen = false;
        this._gameMode = null;
        this._onTimeSet = null;
        this._bgColorTarget = null;
        this._bgColorCurrent = { r: 10, g: 15, b: 20, a: 0.85 };

    };

})();