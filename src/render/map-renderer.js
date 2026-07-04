// Donkeycraft — Map Renderer
// Standalone 2D overhead map renderer for Donkeycraft.
// Renders surface-only top-down view with auto-zoom, mousewheel zoom targeting,
// chunk grid lines, block borders, and a rotating minimap mode.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = window.Donkeycraft && window.Donkeycraft.Config;
    var CHUNK_SIZE = Config ? Config.CHUNK_SIZE : 16; // 16

    // ============================================================
    // Block Color Lookup Table (module-level singleton)
    // ============================================================

    /**
     * Block color lookup table mapping block IDs to CSS color strings.
     * @type {Object.<number, string>|null}
     * @private
     */
    var _blockColors = null;

    /**
     * Initialize the block color lookup table. Called once on first render.
     * @returns {Object.<number, string>} The completed color map.
     * @private
     */
    function _initBlockColors() {
        if (_blockColors) return _blockColors;

        var colors = {};

        // Terrain blocks
        colors[0]  = 'transparent';       // air
        colors[1]  = '#7a7a7a';           // stone
        colors[2]  = '#b08060';           // granite
        colors[3]  = '#c0c8d0';           // diorite
        colors[4]  = '#6a6a6a';           // andesite
        colors[5]  = '#4a4a5a';           // deepslate
        colors[6]  = '#5a5a6a';           // cobbled_deepslate
        colors[7]  = '#7c5c3a';           // dirt
        colors[8]  = '#4a8c2c';           // grass_block (top)
        colors[9]  = '#9a9080';           // gravel
        colors[10] = '#d4c478';           // sand (desert)
        colors[11] = '#c0a060';           // sand (badlands)
        colors[12] = '#d4c478';           // sand (generic)
        colors[13] = 'rgba(48,96,192,0.55)';  // water (semi-transparent)
        colors[14] = '#f0f0f0';           // snow_layer
        colors[15] = '#e8e8e8';           // ice
        colors[16] = '#3a6a2c';           // mossy_cobblestone

        // Plant/decorative blocks
        colors[17] = '#6b4c2a';           // oak_log
        colors[18] = '#2d5a1e';           // oak_leaves
        colors[19] = '#7c5c3a';           // spruce_log
        colors[20] = '#1a3a10';           // spruce_leaves
        colors[21] = '#8b6c4a';           // birch_log
        colors[22] = '#4a8a2e';           // birch_leaves
        colors[23] = '#5a3a1a';           // jungle_log
        colors[24] = '#2a6a1a';           // jungle_leaves
        colors[25] = '#c8a840';           // wheat (crop)
        colors[26] = '#5a9a3a';           // grass_tall (surface grass)
        colors[27] = '#8a6a3a';           // dead_bush
        colors[28] = '#3a7a2a';           // fern
        colors[29] = '#4a8c2c';           // large_fern_top

        // Building blocks
        colors[30] = '#e8d8c0';           // oak_planks
        colors[31] = '#6b6b6b';           // cobblestone
        colors[32] = '#e8d8c0';           // birch_planks
        colors[33] = '#5a4a30';           // spruce_planks
        colors[34] = '#8a7a60';           // jungle_planks
        colors[35] = '#e8e8e8';           // white_wool
        colors[36] = '#c0c0c0';           // light_gray_wool
        colors[37] = '#a83232';           // red_wool
        colors[38] = '#3a5a9a';           // blue_wool
        colors[39] = '#3a8a3a';           // green_wool
        colors[40] = '#d4a830';           // yellow_wool
        colors[41] = '#8a3a8a';           // purple_wool
        colors[42] = '#c06030';           // orange_wool
        colors[43] = '#3a3a3a';           // black_wool
        colors[44] = '#6a6a6a';           // gray_wool
        colors[45] = '#e0c8a0';           // tan_wool
        colors[46] = '#80b0d0';           // light_blue_wool
        colors[47] = '#80d080';           // lime_wool
        colors[48] = '#d080d0';           // magenta_wool
        colors[49] = '#e0e080';           // pink_wool

        // Ore/metal blocks
        colors[50] = '#5a5a5a';           // coal_ore
        colors[51] = '#6a7a7a';           // iron_ore
        colors[52] = '#5a6a8a';           // copper_ore
        colors[53] = '#4a8a8a';           // gold_ore
        colors[54] = '#3a7a5a';           // redstone_ore
        colors[55] = '#3a5a8a';           // lapis_ore
        colors[56] = '#2a8a5a';           // emerald_ore
        colors[57] = '#80d0f0';           // diamond_ore
        colors[58] = '#c0a040';           // nether_gold_ore
        colors[59] = '#6a6a8a';           // nether_quartz_ore

        // Special blocks
        colors[60] = 'rgba(180,50,0,0.7)';    // lava (semi-transparent)
        colors[61] = '#f0e060';           // glowstone
        colors[62] = '#80c0f0';           // sea_lantern
        colors[63] = '#4a3a2a';           // sugar_cane
        colors[64] = '#6a5a4a';           // bamboo
        colors[65] = 'rgba(180,220,255,0.4)';  // glass (semi-transparent)
        colors[66] = '#2a2a2a';           // bedrock
        colors[67] = '#e0e0e0';           // white_concrete
        colors[68] = '#d04040';           // red_concrete
        colors[69] = '#4040d0';           // blue_concrete
        colors[70] = '#40a040';           // green_concrete
        colors[71] = '#e0c040';           // yellow_concrete
        colors[72] = '#8040a0';           // purple_concrete
        colors[73] = '#d06030';           // orange_concrete
        colors[74] = '#202020';           // black_concrete
        colors[75] = '#606060';           // gray_concrete

        // Nether blocks
        colors[76] = '#8a3a3a';           // netherrack
        colors[77] = '#3a3a3a';           // basalt
        colors[78] = '#5a4a2a';           // soul_sand
        colors[79] = '#6a5a3a';           // gravel_nether
        colors[80] = '#e0c080';           // warped_stem
        colors[81] = '#2a6a6a';           // warped_planks
        colors[82] = '#1a5a5a';           // warped_conylium
        colors[83] = '#c04040';           // crimson_stem
        colors[84] = '#7a2a2a';           // crimson_planks
        colors[85] = '#6a1a3a';           // crimson_hyphae
        colors[86] = '#d0a0a0';           // warped_wart_block
        colors[87] = '#4a2a2a';           // nether_bricks
        colors[88] = '#5a3a2a';           // red_nether_bricks
        colors[89] = '#6a6a4a';           // sandstone_nether

        // End blocks
        colors[90] = '#c8b8a0';           // end_stone
        colors[91] = '#d8c8b0';           // end_stone_bricks
        colors[92] = '#4a3a5a';           // obsidian
        colors[93] = '#2a2a3a';           // crying_obsidian
        colors[94] = '#e0d0f0';           // purpur_block
        colors[95] = '#c8b8a0';           // purpur_pillar
        colors[96] = '#5a4a6a';           // end_stone_brick_wall

        // Other common blocks
        colors[97] = '#e8d0a0';           // iron_block
        colors[98] = '#f0e8c0';           // gold_block
        colors[99] = '#60d060';           // emerald_block
        colors[100] = '#70b0d0';          // diamond_block
        colors[101] = '#a0a0a0';          // stone_bricks
        colors[102] = '#5a4a30';          // oak_wood
        colors[103] = '#c8a860';          // birch_wood
        colors[104] = '#6a5a3a';          // spruce_wood
        colors[105] = '#9a7a5a';          // jungle_wood
        colors[106] = '#d4c478';          // stone_slab
        colors[107] = '#e0d0b0';          // stone_stairs
        colors[108] = '#4a3a2a';          // fence_gate
        colors[109] = '#6a5a4a';          // iron_bars
        colors[110] = '#3a3a3a';          // redstone_torch_off
        colors[111] = '#ff4444';          // redstone_torch_on
        colors[112] = '#8a6a3a';          // redstone_wire
        colors[113] = '#aa4444';          // repeater_closed
        colors[114] = '#aa4444';          // repeater_open
        colors[115] = '#7a7a7a';          // piston
        colors[116] = '#8a6a5a';          // sticky_piston
        colors[117] = '#c0c0c0';          // observer
        colors[118] = '#aa4444';          // tnt
        colors[119] = '#e0e0e0';          // lever
        colors[120] = '#8a6a3a';          // tripwire

        // Decorative/plant blocks
        colors[121] = '#c8a040';          // sunflower_top
        colors[122] = '#d06060';          // rose_bush_top
        colors[123] = '#e0c0f0';          // peony_top
        colors[124] = '#f0e080';          // dandelion
        colors[125] = '#d040a0';          // poppy
        colors[126] = '#a060d0';          // blue_orchid
        colors[127] = '#e08080';          // allium
        colors[128] = '#f0f0f0';          // azure_bluet
        colors[129] = '#40a0c0';          // cornflower
        colors[130] = '#d04040';          // lily_of_the_valley
        colors[131] = '#80d080';          // lily_pad
        colors[132] = '#4a6a4a';          // vine
        colors[133] = '#6a5a4a';          // sponge
        colors[134] = '#8a7a6a';          // wet_sponge

        // Nether/Wart/Chorus
        colors[135] = '#8a6a3a';          // nether_wart_stage0
        colors[136] = '#6a8a3a';          // nether_wart_stage1
        colors[137] = '#4a6a2a';          // nether_wart_stage2
        colors[138] = '#5a3a6a';          // chorus_plant
        colors[139] = '#7a5a8a';          // chorus_flower
        colors[140] = '#c8a0d0';          // chorus_fruit
        colors[141] = '#e0d0f0';          // purpur_stairs

        // Doors, chests, etc.
        colors[142] = '#8a6a3a';          // oak_door
        colors[143] = '#c0a060';          // iron_door
        colors[144] = '#6a4a2a';          // chest
        colors[145] = '#7a5a3a';          // furnace_off
        colors[146] = '#8a6a4a';          // furnace_on

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
    // MapRenderer Class
    // ============================================================

    /**
     * MapRenderer — standalone 2D overhead map renderer for Donkeycraft.
     * Renders surface-only top-down view with auto-zoom, mousewheel zoom targeting,
     * chunk grid lines, block borders, and a rotating minimap mode.
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
         * Full map canvas element from DOM.
         * @type {HTMLCanvasElement|null}
         */
        this._fullMapCanvas = null;

        /**
         * Offscreen canvas for the full map (for efficient double-buffered redraw).
         * @type {HTMLCanvasElement|null}
         * @private
         */
        this._fullMapOffscreen = null;

        /**
         * 2D context of the offscreen canvas.
         * @type {CanvasRenderingContext2D|null}
         * @private
         */
        this._fullMapCtx = null;

        /**
         * Minimap canvas element from DOM.
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
         * Current zoom level (canvas pixels per world block).
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
         * Last mouse position X during drag (screen coordinates).
         * @type {number}
         * @private
         */
        this._dragLastX = 0;

        /**
         * Last mouse position Y during drag (screen coordinates).
         * @type {number}
         * @private
         */
        this._dragLastY = 0;

        /**
         * Minimap radius in blocks (shows this many blocks around player in each direction).
         * @type {number}
         * @private
         */
        this._minimapRadius = Config && Config.MAP_MINIMAP_RADIUS ? Config.MAP_MINIMAP_RADIUS : 32;

        /**
         * Dimension name for display overlay.
         * @type {string}
         * @private
         */
        this._dimensionName = 'Overworld';

        /**
         * Canvas container element for the full map panel.
         * @type {HTMLElement|null}
         * @private
         */
        this._mapPanel = null;

        /**
         * Toggle button element (shows when full map is hidden).
         * @type {HTMLButtonElement|null}
         * @private
         */
        this._toggleBtn = null;

        /**
         * Close button element (inside full map panel).
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
         * Whether this instance has been destroyed and its resources freed.
         * @type {boolean}
         * @private
         */
        this._destroyed = false;

        // Time of day state (for creative mode time dial)
        /** @type {number|null} @private */
        this._timeOfDay = null;
        /** @type {boolean} @private */
        this._timeFrozen = false;
        /** @type {number|null} @private */
        this._frozenTOD = null;
        /** @type {HTMLElement|null} @private */
        this._timeDialEl = null;
        /** @type {HTMLElement|null} @private */
        this._timeDialRing = null;
        /** @type {HTMLElement|null} @private */
        this._timeDialDaylight = null;
        /** @type {HTMLElement|null} @private */
        this._dialPointer = null;
        /** @type {HTMLElement|null} @private */
        this._dialText = null;
        /** @type {HTMLElement|null} @private */
        this._frozenBadge = null;
        /** @type {string|null} @private */
        this._gameMode = null;
        /** @type {Function|null} @private */
        this._onTimeChange = null;
        /** @type {HTMLElement|null} @private */
        this._timeSlider = null;
        /** @type {HTMLInputElement|null} @private */
        this._sliderInput = null;
        /** @type {HTMLElement|null} @private */
        this._freezeBtn = null;
        /** @type {boolean} @private */
        this._sliderVisible = false;
        /** @type {number|null} @private */
        this._idleCheckTimer = null;
        /** @type {number} @private */
        this._lastInteractionTime = 0;

        // Position tracking — only re-center when player moves
        /** @type {number|null} @private */
        this._lastCenterX = null;
        /** @type {number|null} @private */
        this._lastCenterZ = null;
        /** @type {number} @private */
        this._centerThreshold = 0.15; // Minimum player movement to trigger re-centering

        // Auto-zoom throttling — only recalculate when chunk count changes
        /** @type {number|null} @private */
        this._lastChunkCount = -1;

        // Named handler references for proper event listener cleanup (Bug #2 fix)
        this._handlers = {
            _onWheel: null,
            _onMouseDown: null,
            _onMouseUp: null,
            _onMouseMove: null,
            _onMouseLeave: null,
            _onToggleClick: null,
            _onCloseClick: null
        };
    };

    /**
     * Initialize the map renderer. Sets up internal canvases and block colors.
     * Must be called before any rendering operations.
     * @returns {boolean} True if initialized successfully.
     */
    Donkeycraft.MapRenderer.prototype.init = function () {
        try {
            _initBlockColors();

            this._fullMapOffscreen = document.createElement('canvas');
            this._fullMapCtx = this._fullMapOffscreen.getContext('2d');

            if (!this._fullMapCtx) {
                Donkeycraft.Logger.error('MapRenderer', 'Failed to create 2D context for offscreen canvas');
                return false;
            }

            return true;
        } catch (e) {
            Donkeycraft.Logger.error('MapRenderer', 'Initialization failed: ' + e.message);
            return false;
        }
    };

    /**
     * Create the map panel DOM element if it doesn't already exist.
     * Tracks ownership so destroy() only removes elements we created.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._createMapPanel = function () {
        if (this._mapPanel) return;

        var panel = document.getElementById('dk-map-panel');
        if (panel) {
            this._mapPanel = panel;
            this._ownsPanel = false;
        } else {
            panel = document.createElement('div');
            panel.id = 'dk-map-panel';
            panel.className = 'dk-map-panel';
            this._mapPanel = panel;
            this._ownsPanel = true;
        }

        // Close button
        var closeBtn = document.getElementById('dk-map-close-btn');
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.id = 'dk-map-close-btn';
            closeBtn.className = 'dk-map-close-btn';
            closeBtn.title = 'Close Map (Esc)';
            closeBtn.textContent = '\u2715'; // ✕
            this._mapPanel.appendChild(closeBtn);
        }
        this._closeBtn = closeBtn;

        var renderer = this;
        this._handlers._onCloseClick = function () {
            renderer.hideMap();
        };
        this._closeBtn.addEventListener('click', this._handlers._onCloseClick);

        // Full map canvas — use existing or rely on DOM element
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
     * Attach canvas event listeners for drag and zoom interaction.
     * Uses named handlers stored on this._handlers for proper cleanup on destroy.
     * @param {HTMLCanvasElement} canvas - The canvas element to attach listeners to.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._attachCanvasListeners = function (canvas) {
        var renderer = this;

        this._handlers._onWheel = function (e) {
            e.preventDefault();
            renderer._onWheel(e);
        };
        canvas.addEventListener('wheel', this._handlers._onWheel, { passive: false });

        this._handlers._onMouseDown = function (e) {
            if (e.button === 0) { // Left click only
                renderer._dragging = true;
                renderer._dragLastX = e.clientX;
                renderer._dragLastY = e.clientY;
                canvas.style.cursor = 'grabbing';
            }
        };
        canvas.addEventListener('mousedown', this._handlers._onMouseDown);

        this._handlers._onMouseUp = function () {
            renderer._dragging = false;
            if (canvas) canvas.style.cursor = '';
        };
        canvas.addEventListener('mouseup', this._handlers._onMouseUp);

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

        this._handlers._onMouseLeave = function () {
            renderer._dragging = false;
            if (canvas) canvas.style.cursor = '';
        };
        canvas.addEventListener('mouseleave', this._handlers._onMouseLeave);
    };

    /**
     * Create the toggle button DOM element if it doesn't already exist.
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
     * Set the canvas elements from DOM after they are available.
     * Sets internal dimensions to match container CSS sizes.
     * @param {HTMLCanvasElement} fullMapCanvas - The full map canvas element.
     * @param {HTMLCanvasElement} minimapCanvas - The minimap canvas element.
     */
    Donkeycraft.MapRenderer.prototype.setCanvases = function (fullMapCanvas, minimapCanvas) {
        // Store references to DOM canvas elements
        this._fullMapCanvas = fullMapCanvas || this._fullMapCanvas;
        this._minimapCanvas = minimapCanvas || this._minimapCanvas;

        // Set minimap internal dimensions to match config size
        if (this._minimapCanvas) {
            var minimapSize = Config && Config.MAP_MINIMAP_SIZE ? Config.MAP_MINIMAP_SIZE : 150;
            this._minimapCanvas.width = minimapSize;
            this._minimapCanvas.height = minimapSize;
        } else {
            Donkeycraft.Logger.warn('MapRenderer', 'Minimap canvas element not found in DOM');
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

            // Re-attach canvas listeners if not already attached
            if (!this._handlers._onWheel) {
                this._attachCanvasListeners(this._fullMapCanvas);
            }
        }
    };

    /**
     * Set the chunk manager reference for terrain data access.
     * @param {Donkeycraft.ChunkManager} chunkManager - The active chunk manager.
     */
    Donkeycraft.MapRenderer.prototype.setChunkManager = function (chunkManager) {
        this._chunkManager = chunkManager || null;
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
        var zoomMin = Config && Config.MAP_ZOOM_MIN ? Config.MAP_ZOOM_MIN : 0.05;
        var zoomMax = Config && Config.MAP_ZOOM_MAX ? Config.MAP_ZOOM_MAX : 4.0;
        newZoom = Math.max(zoomMin, Math.min(zoomMax, newZoom));

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
     * Center the map view on a world position.
     * Only updates offset when player moves beyond threshold to avoid unnecessary redraws.
     * @param {number} worldX - World X coordinate to center on.
     * @param {number} worldZ - World Z coordinate to center on.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._centerOnPosition = function (worldX, worldZ) {
        if (!this._fullMapCanvas) return;

        // Skip re-centering if player hasn't moved beyond threshold
        var lastX = this._lastCenterX;
        var lastZ = this._lastCenterZ;
        if (lastX !== null && lastZ !== null) {
            var dx = Math.abs(worldX - lastX);
            var dz = Math.abs(worldZ - lastZ);
            var threshold = this._centerThreshold;
            if (dx < threshold && dz < threshold) return;
        }

        var canvasWidth = this._fullMapCanvas.width;
        var canvasHeight = this._fullMapCanvas.height;
        var zoom = this._zoom;

        // Center the view on the given world position
        this._offsetX = worldX - (canvasWidth / 2) / zoom;
        this._offsetY = worldZ - (canvasHeight / 2) / zoom;

        // Update last tracked position
        this._lastCenterX = worldX;
        this._lastCenterZ = worldZ;
    };

    /**
     * Calculate the auto-zoom level to fit all loaded chunks within the canvas.
     * Centers the view on the loaded chunk bounding box.
     * Only recalculates when chunk count changes (throttled).
     * @private
     */
    Donkeycraft.MapRenderer.prototype._calculateAutoZoom = function () {
        if (!this._chunkManager || !this._fullMapCanvas) return;

        var chunks = this._chunkManager.getAllChunks();
        if (!chunks || chunks.length === 0) return;

        // Throttle: only recalculate when chunk count changes
        var currentCount = chunks.length;
        if (currentCount === this._lastChunkCount) return;
        this._lastChunkCount = currentCount;

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
        var zoomMin = Config && Config.MAP_ZOOM_MIN ? Config.MAP_ZOOM_MIN : 0.05;
        var zoomMax = Config && Config.MAP_ZOOM_MAX ? Config.MAP_ZOOM_MAX : 4.0;
        newZoom = Math.max(zoomMin, Math.min(zoomMax, newZoom));

        // Only update if significantly different (avoid jitter)
        if (Math.abs(newZoom - this._zoom) > 0.01) {
            this._zoom = newZoom;

            // Center on the bounding box
            var centerX = minX + worldWidth / 2;
            var centerY = minZ + worldHeight / 2;
            this._offsetX = centerX - (canvasWidth / 2) / this._zoom;
            this._offsetY = centerY - (canvasHeight / 2) / this._zoom;

            // Force redraw
            if (this._fullMapOffscreen) {
                this._fullMapOffscreen.width = canvasWidth;
                this._fullMapOffscreen.height = canvasHeight;
            }
        }
    };

    /**
     * Get the highest surface block at a given world X,Z position.
     * Reads from the chunk's pre-built surface map for O(1) lookup.
     * Falls back to scanning from top to bottom if the surface map hasn't been built yet.
     * Always returns a valid block ID — never 0 (air).
     * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager to query.
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} The block ID of the surface block, or 1 (stone) as fallback.
     */
    Donkeycraft.MapRenderer._getSurfaceBlock = function (chunkManager, wx, wz) {
        if (!chunkManager) return 1;

        // Ensure integer coordinates — player positions are fractional (e.g., 0.5)
        var intWx = Math.floor(wx);
        var intWz = Math.floor(wz);

        var chunkX = Math.floor(intWx / CHUNK_SIZE);
        var chunkZ = Math.floor(intWz / CHUNK_SIZE);
        var localX = ((intWx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        var localZ = ((intWz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) return 1;

        // Read from pre-built surface map — O(1) lookup
        var surfaceMap = chunk._mapSurfaceMap;
        if (surfaceMap && surfaceMap[localX] && surfaceMap[localX][localZ]) {
            return surfaceMap[localX][localZ];
        }

        // Surface map not built — scan from top to bottom and build it
        var worldHeight = Config && Config.WORLD_HEIGHT ? Config.WORLD_HEIGHT : 256;
        var surfaceY = -1;
        var surfaceBlockId = 1; // Default: stone
        try {
            for (var y = worldHeight - 1; y >= 0; y--) {
                var blockId = chunk.getBlock(localX, y, localZ);
                if (blockId === 0) continue; // Air
                // Accept all non-air blocks including water
                surfaceY = y;
                surfaceBlockId = blockId;
                break;
            }
        } catch (e) { /* ignore */ }

        // Build surface map on first access (one-time cost per chunk)
        if (!chunk._mapSurfaceMap) {
            chunk._mapSurfaceMap = [];
            for (var lx = 0; lx < CHUNK_SIZE; lx++) {
                chunk._mapSurfaceMap[lx] = [];
                for (var lz = 0; lz < CHUNK_SIZE; lz++) {
                    chunk._mapSurfaceMap[lx][lz] = null;
                }
            }
        }

        var result = (surfaceY >= 0) ? surfaceBlockId : 1;
        chunk._mapSurfaceMap[localX][localZ] = result;
        return result;
    };

    /**
     * Render the full map view (top-down, Y-axis looking down).
     * Renders surface blocks with chunk grid lines, block borders, and player indicator.
     * Always centers on the player position.
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians.
     * @param {number} pitch - Player pitch for direction indicator.
     */
    Donkeycraft.MapRenderer.prototype.renderFullMap = function (playerPos, yaw, pitch) {
        // Always calculate auto-zoom so it updates as chunks load in the background
        this._calculateAutoZoom();

        if (!this._visible || !this._fullMapCanvas) return;

        var canvas = this._fullMapCanvas;
        var w = canvas.width;
        var h = canvas.height;

        // Ensure offscreen canvas matches visible canvas dimensions
        if (this._fullMapOffscreen.width !== w || this._fullMapOffscreen.height !== h) {
            this._fullMapOffscreen.width = w;
            this._fullMapOffscreen.height = h;
        }

        var ctx = this._fullMapCtx || canvas.getContext('2d');
        if (!ctx) return;

        // Clear with dark background
        ctx.fillStyle = '#0a0f14';
        ctx.fillRect(0, 0, w, h);

        var zoom = this._zoom;
        var blockPixelSize = this._blockPixelSize * zoom;

        // Center the map on the player position every frame
        if (playerPos) {
            this._centerOnPosition(playerPos.x, playerPos.z);
        }

        // Recalculate visible world range after centering
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

        // Render each chunk's surface blocks
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

                // Draw chunk background (dark fill for empty areas)
                ctx.fillStyle = '#0d1218';
                ctx.fillRect(
                    Math.floor(canvasX),
                    Math.floor(canvasY),
                    Math.ceil(chunkPixelSize) + 1,
                    Math.ceil(chunkPixelSize) + 1
                );

                // Render surface blocks for this chunk (O(1) per block from surface map)
                this._renderSurfaceBlocks(ctx, cx, cz, canvasX, canvasY, blockPixelSize, zoom);

                // Draw chunk border (subtle green outline)
                ctx.strokeStyle = 'rgba(100, 200, 100, 0.12)';
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    Math.floor(canvasX),
                    Math.floor(canvasY),
                    Math.ceil(chunkPixelSize),
                    Math.ceil(chunkPixelSize)
                );
            }
        }

        // Draw grid lines every 64 blocks for orientation
        ctx.strokeStyle = 'rgba(100, 200, 100, 0.25)';
        ctx.lineWidth = 1;
        this._drawGridLines(ctx, worldLeft, worldTop, worldRight, worldBottom, zoom);

        // Draw player position and direction indicator
        this._renderPlayerIndicator(ctx, playerPos, yaw, w, h, zoom);

        // Draw dimension label and stats overlay
        this._renderOverlay(ctx, w, h);

        // Copy offscreen to visible canvas (double-buffered, avoids flicker)
        var visibleCtx = this._fullMapCanvas.getContext('2d');
        if (visibleCtx) {
            visibleCtx.clearRect(0, 0, w, h);
            visibleCtx.drawImage(this._fullMapOffscreen, 0, 0);
        }
    };

    /**
     * Render surface blocks for a chunk onto the canvas.
     * Draws each column's surface block as a colored square with optional border.
     * Uses pre-built surface map for O(1) lookup per block.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {number} canvasX - Canvas X offset for this chunk's top-left corner.
     * @param {number} canvasY - Canvas Y offset for this chunk's top-left corner.
     * @param {number} blockPixelSize - Size in pixels of one block at current zoom.
     * @param {number} zoom - Current zoom level.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderSurfaceBlocks = function (ctx, chunkX, chunkZ, canvasX, canvasY, blockPixelSize, zoom) {
        var chunk = this._chunkManager ? this._chunkManager.getChunkIfExists(chunkX, chunkZ) : null;
        if (!chunk) return;

        // Skip rendering if blocks are too small to see (sub-pixel)
        if (blockPixelSize < 0.5) return;

        var showBorders = blockPixelSize >= 1.5; // Only draw borders when blocks are visible size
        var surfaceMap = chunk._mapSurfaceMap;

        for (var lx = 0; lx < CHUNK_SIZE; lx++) {
            for (var lz = 0; lz < CHUNK_SIZE; lz++) {
                var entry = null;
                if (surfaceMap && surfaceMap[lx]) {
                    entry = surfaceMap[lx][lz];
                }

                var blockId = entry ? entry : 1; // Stone fallback
                if (blockId === 0) continue; // Skip air

                var color = _getBlockColor(blockId);
                ctx.fillStyle = color || '#555';

                var bx = Math.floor(canvasX + lx * blockPixelSize);
                var by = Math.floor(canvasY + lz * blockPixelSize);
                var bw = Math.max(1, Math.ceil(blockPixelSize));
                var bh = Math.max(1, Math.ceil(blockPixelSize));

                ctx.fillRect(bx, by, bw, bh);

                // Draw subtle block border for visual clarity
                if (showBorders) {
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(bx, by, bw, bh);
                }
            }
        }
    };

    /**
     * Draw grid lines every 64 blocks for world orientation.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {number} worldLeft - Left edge of visible world range.
     * @param {number} worldTop - Top edge of visible world range.
     * @param {number} worldRight - Right edge of visible world range.
     * @param {number} worldBottom - Bottom edge of visible world range.
     * @param {number} zoom - Current zoom level.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._drawGridLines = function (ctx, worldLeft, worldTop, worldRight, worldBottom, zoom) {
        var gridSpacing = 64;

        // Vertical grid lines
        var startGX = Math.floor(worldLeft / gridSpacing) * gridSpacing;
        for (var gx = startGX; gx <= worldRight; gx += gridSpacing) {
            var canvasGX = (gx - this._offsetX) * zoom;
            var canvasTopY = (worldTop - this._offsetY) * zoom;
            var canvasBottomY = (worldBottom - this._offsetY) * zoom;
            ctx.beginPath();
            ctx.moveTo(Math.floor(canvasGX) + 0.5, Math.floor(canvasTopY));
            ctx.lineTo(Math.floor(canvasGX) + 0.5, Math.floor(canvasBottomY));
            ctx.stroke();
        }

        // Horizontal grid lines
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
     * Draws a white dot with a red direction arrow pointing forward.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} zoom - Current zoom level.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderPlayerIndicator = function (ctx, playerPos, yaw, w, h, zoom) {
        if (!playerPos) return;

        var canvasX = (playerPos.x - this._offsetX) * zoom;
        var canvasY = (playerPos.z - this._offsetY) * zoom;

        // Skip drawing if off-screen
        if (canvasX < -20 || canvasX > w + 20 || canvasY < -20 || canvasY > h + 20) return;

        // Player dot
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Direction arrow (points in the direction the player is facing)
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
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._renderOverlay = function (ctx, w, h) {
        // Semi-transparent overlay background for text readability
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
     * Render the rotating minimap (top-left, "up" = player forward direction).
     * Terrain rotates around a static player dot based on yaw.
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians.
     * @param {number} pitch - Player pitch (unused, for API compatibility).
     */
    Donkeycraft.MapRenderer.prototype.renderMinimap = function (playerPos, yaw, pitch) {
        // Defensive check: ensure minimap canvas exists
        if (!this._minimapCanvas) return;

        var canvas = this._minimapCanvas;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var size = canvas.width;
        var halfSize = size / 2;
        var radius = halfSize - 2; // Leave room for border

        if (size === 0 || radius <= 0) return;

        // Calculate blocks per pixel for minimap scale
        var minimapRadius = this._minimapRadius;
        var blocksPerPixel = minimapRadius * 2 / radius;

        // Clear and draw background
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(10, 15, 20, 0.8)';
        ctx.fillRect(0, 0, size, size);

        // Save context and clip to circular minimap area
        ctx.save();
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, radius, 0, Math.PI * 2);
        ctx.clip();

        // Rotate context so player's forward direction is "up" on screen.
        // The terrain rotates around the player based on yaw.
        ctx.translate(halfSize, halfSize);
        ctx.rotate(-yaw + Math.PI); // -yaw rotates terrain, +PI flips 180 degrees as specified

        // Draw terrain tiles around the player using the SAME surface data as full map
        var tileWorldSize = blocksPerPixel * this._blockPixelSize;
        if (tileWorldSize < 0.3) tileWorldSize = 0.3; // Minimum tile size for visibility

        var halfWorld = minimapRadius;
        var startBlockX = Math.floor(-halfWorld);
        var endBlockX = Math.ceil(halfWorld);
        var startBlockZ = Math.floor(-halfWorld);
        var endBlockZ = Math.ceil(halfWorld);

        // Use integer player coordinates for block queries
        var playerIntX = Math.floor(playerPos.x);
        var playerIntZ = Math.floor(playerPos.z);

        for (var bx = startBlockX; bx <= endBlockX; bx++) {
            for (var bz = startBlockZ; bz <= endBlockZ; bz++) {
                var worldX = playerIntX + bx;
                var worldZ = playerIntZ + bz;
                var blockId = Donkeycraft.MapRenderer._getSurfaceBlock(this._chunkManager, worldX, worldZ);

                if (blockId === 0) continue; // Skip air only

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

        // Draw player as a static white dot at center (no rotation — map rotates behind it)
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Restore context (remove clip and rotation)
        ctx.restore();

        // Draw compass ring (fixed N/S/E/W markers around the edge)
        this._renderCompassRing(ctx, halfSize, radius);

        // Draw circular border
        ctx.strokeStyle = 'rgba(100, 200, 100, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, radius, 0, Math.PI * 2);
        ctx.stroke();
    };

    /**
     * Render the compass ring on the minimap.
     * N is fixed at top of circle; E/S/W at 90-degree intervals.
     * The terrain rotates around the player; compass markers stay fixed.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {number} cx - Center X coordinate.
     * @param {number} cy - Center Y coordinate.
     * @param {number} radius - Radius of the minimap circle.
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

        // N — always at top (red for emphasis)
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

    /**
     * Toggle map visibility between full-screen map and minimap.
     * @returns {boolean} True if map is now visible (full-screen).
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
     * Show the full-screen map view.
     * Displays the map panel with the full overhead view; minimap stays visible.
     */
    Donkeycraft.MapRenderer.prototype.showMap = function () {
        if (this._visible) return;

        this._visible = true;

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

        // Reset auto-zoom tracking so it recalculates on next show
        this._lastChunkCount = -1;
    };

    /**
     * Hide the full-screen map view.
     * Hides the map panel; minimap remains visible at all times.
     */
    Donkeycraft.MapRenderer.prototype.hideMap = function () {
        if (!this._visible) return;

        this._visible = false;

        // Hide map panel
        if (this._mapPanel) {
            this._mapPanel.style.display = 'none';
        }

        // Show toggle button (explicitly set to 'block' — CSS default is 'none')
        if (this._toggleBtn) {
            this._toggleBtn.style.display = 'block';
        }
    };

    /**
     * Check if the full map view is currently visible.
     * @returns {boolean} True if the map is visible.
     */
    Donkeycraft.MapRenderer.prototype.isVisible = function () {
        return this._visible;
    };

    /**
     * Resize canvases to fit their containers.
     * Handles null canvases gracefully.
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
            var minimapSize = Config && Config.MAP_MINIMAP_SIZE ? Config.MAP_MINIMAP_SIZE : 150;
            this._minimapCanvas.width = minimapSize;
            this._minimapCanvas.height = minimapSize;
        }
    };

    /**
     * Handle window resize event — resizes canvases and recalculates auto-zoom if visible.
     */
    Donkeycraft.MapRenderer.prototype.onWindowResize = function () {
        this._resizeCanvases();
        if (this._visible) {
            this._lastChunkCount = -1; // Force auto-zoom recalculation
            this._calculateAutoZoom();
        }
    };

    /**
     * Called when the chunk manager switches dimensions.
     * Clears per-chunk surface maps for new dimension.
     * @param {string} dimName - New dimension name.
     */
    Donkeycraft.MapRenderer.prototype.onDimensionChange = function (dimName) {
        this._dimensionName = dimName || 'Unknown';
        // Clear all chunk surface maps for new dimension
        var chunks = this._chunkManager ? this._chunkManager.getAllChunks() : [];
        for (var i = 0; i < chunks.length; i++) {
            delete chunks[i]._mapSurfaceMap;
        }
        // Recalculate auto-zoom if visible
        if (this._visible) {
            this._lastChunkCount = -1;
            this._calculateAutoZoom();
        }
    };

    /**
     * Destroy and free all resources. Removes event listeners and DOM elements we own.
     */
    Donkeycraft.MapRenderer.prototype.destroy = function () {
        if (this._destroyed) return;
        this._destroyed = true;

        var canvas = this._fullMapCanvas;

        // Remove all event listeners using stored handler references
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

        // Only remove DOM elements we created
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

        // Destroy slider if visible
        this._destroySlider();

        // Clear time dial elements
        if (this._timeDialEl && this._timeDialEl.parentNode) {
            this._timeDialEl.parentNode.removeChild(this._timeDialEl);
        }
        this._timeDialEl = null;
        this._timeDialRing = null;
        this._timeDialDaylight = null;
        this._dialPointer = null;
        this._dialText = null;
        this._frozenBadge = null;

        // Clear canvas references
        this._fullMapCanvas = null;
        this._fullMapOffscreen = null;
        this._fullMapCtx = null;
        this._minimapCanvas = null;
        this._chunkManager = null;
    };

    // ============================================================
    // Time of Day Controls (creative mode — leave untouched)
    // ============================================================

    /**
     * Set the current time of day for the dial display.
     * @param {number} tod - Time of day in [0, 1).
     */
    Donkeycraft.MapRenderer.prototype.setTimeOfDay = function (tod) {
        if (typeof tod === 'number' && !isNaN(tod)) {
            this._timeOfDay = ((tod % 1) + 1) % 1;
            this._updateTimeDial();
        }
    };

    /**
     * Set the current game mode for interactivity detection.
     * @param {string|null} mode - 'survival', 'creative', or null.
     */
    Donkeycraft.MapRenderer.prototype.setGameMode = function (mode) {
        this._gameMode = mode || null;
    };

    /**
     * Freeze time at current value (creative mode).
     * @param {number|null} frozenTOD - Time to freeze at, or null to unfreeze.
     */
    Donkeycraft.MapRenderer.prototype.freezeTime = function (frozenTOD) {
        if (frozenTOD === null) {
            this._timeFrozen = false;
            this._frozenTOD = null;
        } else if (typeof frozenTOD === 'number' && !isNaN(frozenTOD)) {
            this._timeFrozen = true;
            this._frozenTOD = ((frozenTOD % 1) + 1) % 1;
        }
        this._updateTimeDial();
    };

    /**
     * Get effective time of day (frozen or natural).
     * @returns {number} Time in [0, 1).
     */
    Donkeycraft.MapRenderer.prototype.getEffectiveTime = function () {
        if (this._timeFrozen && this._frozenTOD !== null) return this._frozenTOD;
        return this._timeOfDay || 0.5;
    };

    /**
     * Set callback for time changes from slider.
     * @param {Function} cb - Receives (tod: number|null).
     */
    Donkeycraft.MapRenderer.prototype.setOnTimeChange = function (cb) {
        this._onTimeChange = typeof cb === 'function' ? cb : null;
    };

    /**
     * Create the time dial DOM element if it doesn't exist.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._createTimeDial = function () {
        if (this._timeDialEl) return;

        var el = document.createElement('div');
        el.id = 'dk-time-dial';
        el.className = 'dk-interactive';
        el.innerHTML =
            '<div class="dk-dial-ring">' +
                '<div class="dk-dial-daylight"></div>' +
                '<div class="dk-dial-pointer"></div>' +
            '</div>' +
            '<div class="dk-dial-text">12:00 PM</div>';

        document.body.appendChild(el);
        this._timeDialEl = el;
        this._timeDialRing = el.querySelector('.dk-dial-ring');
        this._timeDialDaylight = el.querySelector('.dk-dial-daylight');
        this._dialPointer = el.querySelector('.dk-dial-pointer');
        this._dialText = el.querySelector('.dk-dial-text');

        // Click handler for creative mode
        var self = this;
        el.addEventListener('click', function (e) {
            e.stopPropagation();
            if (self._gameMode === 'creative' && !self._sliderVisible) {
                self.showSlider(self.getEffectiveTime());
            }
        });
    };

    /**
     * Update the time dial display with current time.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._updateTimeDial = function () {
        try {
            if (!this._timeDialEl) this._createTimeDial();
            if (!this._timeDialEl) return;

            var tod = this.getEffectiveTime();

            // Game time: 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
            var sunriseTod = 0.25;
            var sunsetTod = 0.75;
            var isDaytime = tod >= sunriseTod && tod < sunsetTod;

            // Consistent dial background — no toggling
            this._timeDialEl.style.background = 'radial-gradient(circle at 40% 40%, rgba(30, 35, 55, 0.92), rgba(15, 18, 30, 0.95))';
            this._timeDialEl.style.borderColor = 'rgba(80, 100, 140, 0.4)';

            // Midnight at bottom (90deg), clockwise rotation
            var sunriseAngle = 90 + (sunriseTod * 360); // 180deg (left)
            var sunsetRaw = 90 + (sunsetTod * 360);      // 360deg
            var sunsetAngle = sunsetRaw % 360;           // 0deg
            var dayArcEnd = sunsetAngle + 360;           // 360deg
            var nightEnd = sunriseAngle + 360;           // 540deg

            // Daylight arc: brighter highlight across the top half (sunrise to sunset)
            if (this._timeDialDaylight) {
                this._timeDialDaylight.style.background = 'conic-gradient(from ' + sunriseAngle + 'deg, rgba(200, 220, 255, 0.45), rgba(200, 220, 255, 0.45) ' + dayArcEnd + 'deg, transparent ' + dayArcEnd + 'deg, transparent ' + nightEnd + 'deg)';
            }

            // Pointer: midnight bottom (90deg), clockwise orbit
            var pointerAngle = 90 + (tod * 360);
            this._dialPointer.style.transform = 'translate(-50%, -50%) rotate(' + pointerAngle + 'deg) translateX(16px)';

            // Emoji marker: sun during day, moon during night
            this._dialPointer.textContent = isDaytime ? '\u2600\uFE0F' : '\uD83C\uDF19';

            // Update time text
            var ticks = Math.floor(tod * 24000);
            var hour = Math.floor(ticks / 1000) % 24;
            var minute = Math.floor((ticks % 1000) / (1000 / 60));
            var h12 = hour % 12 || 12;
            this._dialText.textContent = h12 + ':' + (minute < 10 ? '0' : '') + minute;

            // Update frozen indicator
            if (this._timeFrozen && !this._frozenBadge) {
                var badge = document.createElement('div');
                badge.className = 'dk-dial-frozen';
                badge.textContent = '[FROZEN]';
                this._timeDialEl.appendChild(badge);
                this._frozenBadge = badge;
            } else if (!this._timeFrozen && this._frozenBadge) {
                this._timeDialEl.removeChild(this._frozenBadge);
                this._frozenBadge = null;
            }

        } catch (e) {
            Donkeycraft.Logger.warn('MapRenderer', 'Time dial update error: ' + e.message);
        }
    };

    /**
     * Create the time slider popup for creative mode.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._createTimeSlider = function () {
        if (this._timeSlider) return;

        var popup = document.createElement('div');
        popup.className = 'dk-time-dial-popup dk-interactive';
        popup.style.display = 'none';
        popup.innerHTML =
            '<div class="dk-time-header">' +
                '<button class="dk-time-freeze-btn">Freeze</button>' +
                '<button class="dk-time-close" title="Close (Esc)">✕</button>' +
            '</div>' +
            '<div class="dk-time-slider-row">' +
                '<span class="dk-time-label">12 AM</span>' +
                '<input type="range" class="dk-time-slider" min="0" max="23999" value="6000" step="1">' +
                '<span class="dk-time-label">12 AM</span>' +
            '</div>';

        document.body.appendChild(popup);
        this._timeSlider = popup;
        this._sliderInput = popup.querySelector('.dk-time-slider');
        this._freezeBtn = popup.querySelector('.dk-time-freeze-btn');
        var closeBtn = popup.querySelector('.dk-time-close');

        var self = this;

        // Slider input handler
        this._sliderInput.addEventListener('input', function () {
            try {
                var val = parseInt(this.value, 10);
                if (!isNaN(val)) {
                    var tod = val / 24000;
                    self._frozenTOD = tod;
                    self._timeFrozen = true;
                    self._updateSliderDisplay(tod);
                    if (self._onTimeChange) self._onTimeChange(tod);
                }
                self._lastInteractionTime = Date.now();
            } catch (e) { /* ignore */ }
        });

        // Freeze button in header
        this._freezeBtn.addEventListener('click', function () {
            try {
                if (self._timeFrozen) {
                    self.freezeTime(null);
                    this.textContent = 'Freeze';
                    this.classList.remove('dk-time-freeze-active');
                } else {
                    self.freezeTime(self.getEffectiveTime());
                    this.textContent = 'Unfreeze';
                    this.classList.add('dk-time-freeze-active');
                    if (self._onTimeChange) self._onTimeChange(self.getEffectiveTime());
                }
                self.hideSlider();
            } catch (e) { /* ignore */ }
        });

        // Close button
        closeBtn.addEventListener('click', function () {
            try { self.hideSlider(); } catch (e) { /* ignore */ }
        });

        // Close on outside click
        var closeHandler = function (e) {
            if (!popup.contains(e.target)) {
                self.hideSlider();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(function () {
            document.addEventListener('click', closeHandler);
        }, 100);
    };

    /**
     * Update slider display with current time.
     * @param {number} tod - Time of day.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._updateSliderDisplay = function (tod) {
        try {
            if (!this._sliderInput) return;
            var ticks = Math.floor(tod * 24000);
            this._sliderInput.value = ticks;
        } catch (e) { /* ignore */ }
    };

    /**
     * Show the time slider popup.
     * @param {number} [tod] - Optional initial time.
     */
    Donkeycraft.MapRenderer.prototype.showSlider = function (tod) {
        try {
            this._createTimeSlider();
            if (!this._timeSlider) return;

            var initTOD = typeof tod === 'number' ? tod : this.getEffectiveTime();
            this._updateSliderDisplay(initTOD);

            // Auto-freeze when opening the panel
            if (!this._timeFrozen) {
                this.freezeTime(initTOD);
            }
            if (this._freezeBtn) {
                this._freezeBtn.textContent = 'Unfreeze';
                this._freezeBtn.classList.add('dk-time-freeze-active');
            }

            // Position near time dial
            var rect = this._timeDialEl.getBoundingClientRect();
            var w = 260, h = 100;
            var left = Math.max(4, Math.min(rect.left, window.innerWidth - w - 4));
            var top = rect.bottom + 8;
            if (top + h > window.innerHeight - 4) top = rect.top - h - 8;

            this._timeSlider.style.left = Math.floor(left) + 'px';
            this._timeSlider.style.top = Math.floor(top) + 'px';
            this._timeSlider.style.display = 'block';
            this._sliderVisible = true;
            this._lastInteractionTime = Date.now();

            if (this._freezeBtn) {
                this._freezeBtn.textContent = 'Unfreeze';
                this._freezeBtn.classList.add('dk-time-freeze-active');
            }

            this._startIdleCheck();
        } catch (e) { /* ignore */ }
    };

    /**
     * Hide the time slider popup.
     */
    Donkeycraft.MapRenderer.prototype.hideSlider = function () {
        try {
            if (!this._timeSlider) return;
            this._timeSlider.style.display = 'none';
            this._sliderVisible = false;
            this._idleCheckTimer = null;
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        } catch (e) { /* ignore */ }
    };

    /**
     * Start idle check timer — updates slider to current time after 10s of no interaction.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._startIdleCheck = function () {
        try {
            if (this._idleCheckTimer) clearInterval(this._idleCheckTimer);
            var self = this;
            this._idleCheckTimer = setInterval(function () {
                try {
                    if (!self._sliderVisible) {
                        clearInterval(self._idleCheckTimer);
                        self._idleCheckTimer = null;
                        return;
                    }
                    if (self._timeFrozen) return;
                    var elapsed = Date.now() - (self._lastInteractionTime || Date.now());
                    if (elapsed >= 10000) {
                        var currentTOD = self.getEffectiveTime();
                        self._updateSliderDisplay(currentTOD);
                        self._lastInteractionTime = Date.now();
                    }
                } catch (e) { /* ignore */ }
            }, 1000);
        } catch (e) { /* ignore */ }
    };

    /**
     * Check if slider is visible.
     * @returns {boolean}
     */
    Donkeycraft.MapRenderer.prototype.isSliderVisible = function () {
        return this._sliderVisible || false;
    };

    /**
     * Clean up slider popup resources.
     * @private
     */
    Donkeycraft.MapRenderer.prototype._destroySlider = function () {
        if (this._idleCheckTimer) {
            clearInterval(this._idleCheckTimer);
            this._idleCheckTimer = null;
        }
        if (this._timeSlider && this._timeSlider.parentNode) {
            this._timeSlider.parentNode.removeChild(this._timeSlider);
        }
        this._timeSlider = null;
        this._sliderInput = null;
        this._freezeBtn = null;
    };

    // ============================================================
    // Static utility methods (attached after class definition)
    // ============================================================

    /**
     * Invalidate the per-chunk surface map for a given chunk.
     * Called when blocks are placed or broken in that chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.MapRenderer.invalidateChunkSurfaceMap = function (chunkX, chunkZ) {
        // Delete surface map from chunk — it will be rebuilt on next access
        var key = chunkX + ',' + chunkZ;
        // We can't directly access the chunk here, so we rely on the dirty callback
        // in index.html to clear the chunk's _mapSurfaceMap property
    };

})();