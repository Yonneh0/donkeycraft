// Donkeycraft — Lightweight 2D Map Renderer (Facade)
// Delegates minimap rendering, full map panel UI, and time-of-day dial
// to separate UI modules in src/ui/.
// This file provides backward-compatible API for game.js integration.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = window.Donkeycraft && window.Donkeycraft.Config;

    // ============================================================
    // Block Color Lookup Table (shared utility)
    // ============================================================

    /**
     * Block color lookup table mapping block IDs to CSS color strings.
     * @type {Object.<number, string>|null}
     * @private
     */
    var _blockColors = null;

    /**
     * Initialize the block color lookup table. Called once on first render.
     * Populates colors for all 257+ block IDs including terrain, ores, nether, end, and decorative blocks.
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
     * Get the color for a block ID from the initialized lookup table.
     * Automatically initializes the table if not already done.
     * @param {number} blockId - The block ID (0-257+).
     * @returns {string} CSS color string, or '#555555' as fallback.
     * @private
     */
    function _getBlockColor(blockId) {
        if (!_blockColors) _initBlockColors();
        return _blockColors[blockId] || '#555555';
    }

    // ============================================================
    // Lightweight MapRenderer Facade Class
    // Delegates to: MinimapUI, MapPanelUI, TimeOfDayUI
    // ============================================================

    /**
     * MapRenderer — lightweight facade that delegates to separate UI modules.
     * Provides backward-compatible API for game.js integration.
     * @param {Object} [options] - Configuration options.
     * @param {Donkeycraft.ChunkManager} [options.chunkManager] - Reference to active chunk manager.
     */
    Donkeycraft.MapRenderer = function (options) {
        options = options || {};

        /** @type {Donkeycraft.ChunkManager|null} @private */
        this._chunkManager = options.chunkManager || null;

        // Sub-modules
        /** @type {Donkeycraft.MinimapUI|null} @private */
        this._minimapUI = null;
        /** @type {Donkeycraft.MapPanelUI|null} @private */
        this._mapPanelUI = null;
        /** @type {Donkeycraft.TimeOfDayUI|null} @private */
        this._todUI = null;

        /** @type {boolean} @private */
        this._visible = false;
        /** @type {number|null} @private */
        this._timeOfDay = null;
        /** @type {string|null} @private */
        this._gameMode = null;
        /** @type {Function|null} @private */
        this._onTimeChange = null;
        /** @type {boolean} @private */
        this._destroyed = false;

        // Named handler references for M-key toggle
        this._handlers = {
            _onKeydown: null
        };
    };

    /**
     * Initialize all sub-modules. Must be called before any rendering operations.
     * Sets up block color lookup, creates minimap/map panel/TOD UI instances,
     * and registers the Escape key handler for closing the full map panel.
     * @returns {boolean} True if initialized successfully.
     */
    Donkeycraft.MapRenderer.prototype.init = function () {
        try {
            _initBlockColors();

            this._minimapUI = new Donkeycraft.MinimapUI({ chunkManager: this._chunkManager });
            this._mapPanelUI = new Donkeycraft.MapPanelUI({ chunkManager: this._chunkManager });
            this._todUI = new Donkeycraft.TimeOfDayUI({ onTimeChange: this._onTimeChange });

            var minimapOk = this._minimapUI.init();
            var mapPanelOk = this._mapPanelUI.init();
            var todOk = this._todUI.init();

            // Register Escape key handler to close the full map panel
            if (this._mapPanelUI && typeof this._mapPanelUI.registerEscapeHandler === 'function') {
                this._mapPanelUI.registerEscapeHandler();
            }

            return minimapOk && mapPanelOk && todOk;
        } catch (e) {
            Donkeycraft.Logger.error('MapRenderer', 'Initialization failed: ' + e.message);
            return false;
        }
    };

    /**
     * Set the canvas elements from DOM after they are available.
     * @param {HTMLCanvasElement} fullMapCanvas - The full map canvas element.
     * @param {HTMLCanvasElement} minimapCanvas - The minimap canvas element.
     */
    Donkeycraft.MapRenderer.prototype.setCanvases = function (fullMapCanvas, minimapCanvas) {
        if (this._mapPanelUI) this._mapPanelUI.setCanvases(fullMapCanvas, minimapCanvas);
        // MinimapUI looks up its canvas by ID during init(), but we can also
        // provide the reference here if the DOM element isn't ready yet.
        if (this._minimapUI && minimapCanvas) {
            this._minimapUI.setCanvas(minimapCanvas);
        }
    };

    /**
     * Set the chunk manager reference.
     * @param {Donkeycraft.ChunkManager} chunkManager - The active chunk manager.
     */
    Donkeycraft.MapRenderer.prototype.setChunkManager = function (chunkManager) {
        this._chunkManager = chunkManager || null;
        if (this._minimapUI) this._minimapUI.setChunkManager(chunkManager);
        if (this._mapPanelUI) this._mapPanelUI.setChunkManager(chunkManager);
    };

    /**
     * Set the dimension name for display on the map overlay.
     * @param {string} name - Dimension name.
     */
    Donkeycraft.MapRenderer.prototype.setDimensionName = function (name) {
        if (this._mapPanelUI) this._mapPanelUI.setDimensionName(name);
    };

    /**
     * Set the current time of day for the dial display.
     * @param {number} tod - Time of day in [0, 1).
     */
    Donkeycraft.MapRenderer.prototype.setTimeOfDay = function (tod) {
        if (typeof tod === 'number' && !isNaN(tod)) {
            this._timeOfDay = ((tod % 1) + 1) % 1;
            if (this._todUI) this._todUI.setTimeOfDay(this._timeOfDay);
        }
    };

    /**
     * Set the current game mode for interactivity detection.
     * @param {string|null} mode - 'survival', 'creative', or null.
     */
    Donkeycraft.MapRenderer.prototype.setGameMode = function (mode) {
        this._gameMode = mode || null;
        if (this._todUI) this._todUI.setGameMode(mode);
    };

    /**
     * Set callback for time changes from slider.
     * The callback receives (tod: number|null) where tod is in [0, 1) or null on reset.
     * Also delegates to TimeOfDayUI's setOnTimeChange method.
     * @param {Function} cb - Callback function receiving (tod: number|null).
     */
    Donkeycraft.MapRenderer.prototype.setOnTimeChange = function (cb) {
        this._onTimeChange = typeof cb === 'function' ? cb : null;
        if (this._todUI) this._todUI.setOnTimeChange(cb);
    };

    /**
     * Toggle map visibility between full-screen map and minimap.
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
     * Show the full-screen map view.
     */
    Donkeycraft.MapRenderer.prototype.showMap = function () {
        if (this._visible) return;
        this._visible = true;
        if (this._mapPanelUI) this._mapPanelUI.showMap();
    };

    /**
     * Hide the full-screen map view.
     */
    Donkeycraft.MapRenderer.prototype.hideMap = function () {
        if (!this._visible) return;
        this._visible = false;
        if (this._mapPanelUI) this._mapPanelUI.hideMap();
    };

    /**
     * Check if the full map view is currently visible.
     * @returns {boolean} True if the map is visible.
     */
    Donkeycraft.MapRenderer.prototype.isVisible = function () {
        return this._visible;
    };

    /**
     * Check if slider is visible.
     * @returns {boolean}
     */
    Donkeycraft.MapRenderer.prototype.isSliderVisible = function () {
        return this._todUI && this._todUI.isSliderVisible();
    };

    /**
     * Hide the time slider popup.
     */
    Donkeycraft.MapRenderer.prototype.hideSlider = function () {
        if (this._todUI) this._todUI.hideSlider();
    };

    /**
     * Handle window resize event.
     */
    Donkeycraft.MapRenderer.prototype.onWindowResize = function () {
        if (this._mapPanelUI) this._mapPanelUI.onWindowResize();
    };

    /**
     * Called when the chunk manager switches dimensions.
     * Clears surface maps and notifies sub-modules for fresh terrain data.
     * @param {string} dimName - New dimension name.
     */
    Donkeycraft.MapRenderer.prototype.onDimensionChange = function (dimName) {
        if (this._mapPanelUI) this._mapPanelUI.onDimensionChange(dimName);
        // Clear minimap surface maps using the dedicated utility method
        if (this._chunkManager) {
            Donkeycraft.MinimapUI.invalidateAllSurfaceMaps(this._chunkManager);
        }
    };

    /**
     * Render the full map view (top-down, Y-axis looking down).
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians.
     * @param {number} pitch - Player pitch for direction indicator.
     */
    Donkeycraft.MapRenderer.prototype.renderFullMap = function (playerPos, yaw, pitch) {
        if (this._mapPanelUI && this._visible) {
            this._mapPanelUI.renderFullMap(playerPos, yaw, pitch);
        }
    };

    /**
     * Render the rotating minimap (top-left, "up" = player forward direction).
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians.
     * @param {number} pitch - Player pitch (unused).
     */
    Donkeycraft.MapRenderer.prototype.renderMinimap = function (playerPos, yaw, pitch) {
        if (this._minimapUI) {
            this._minimapUI.render(playerPos, yaw);
        }
    };

    /**
     * Destroy and free all resources.
     * Removes all event listeners, detaches DOM elements, and nullifies references
     * to sub-modules (MinimapUI, MapPanelUI, TimeOfDayUI) and chunk manager.
     */
    Donkeycraft.MapRenderer.prototype.destroy = function () {
        if (this._destroyed) return;
        this._destroyed = true;

        if (this._minimapUI) this._minimapUI.destroy();
        if (this._mapPanelUI) this._mapPanelUI.destroy();
        if (this._todUI) this._todUI.destroy();

        this._minimapUI = null;
        this._mapPanelUI = null;
        this._todUI = null;
        this._chunkManager = null;
    };

    // ============================================================
    // Static methods — attached AFTER class definition (backward compat)
    // ============================================================

    /**
     * Get the color for a block ID (static method for backward compatibility).
     * Delegates to private _getBlockColor function.
     * @param {number} blockId - The block ID (0-257+).
     * @returns {string} CSS color string, or '#555555' as fallback.
     */
    Donkeycraft.MapRenderer._getBlockColor = function (blockId) {
        return _getBlockColor(blockId);
    };

    /**
     * Invalidate the per-chunk surface map for a given chunk.
     * Called when blocks are placed or broken in that chunk.
     * Surface maps are rebuilt lazily on next render access.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.MapRenderer.invalidateChunkSurfaceMap = function (chunkX, chunkZ) {
        // Surface map will be rebuilt on next access by minimap/map panel modules
    };

})();
