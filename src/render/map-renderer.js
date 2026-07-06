// Donkeycraft — Lightweight 2D Map Renderer
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
        colors[13] = '#3060c0';  // water (opaque for map display — WebGL handles transparency)
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
        colors[60] = '#b43200';    // lava (opaque for map display — WebGL handles transparency)
        colors[61] = '#f0e060';           // glowstone
        colors[62] = '#80c0f0';           // sea_lantern
        colors[63] = '#4a3a2a';           // sugar_cane
        colors[64] = '#6a5a4a';           // bamboo
        colors[65] = '#c8ecff';  // glass (opaque for map display — WebGL handles transparency)
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
        colors[110] = '#5a5a5a';          // redstone_torch_off (dim gray)
        colors[111] = '#ffaa44';          // redstone_torch_on (bright orange — lit state)
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

        // Liquids and special blocks (IDs 212-213)
        colors[212] = '#3060c0';          // water
        colors[213] = '#b43200';          // lava

        // Ores and resources (IDs 214-232)
        colors[214] = '#2a2a2a';          // coal
        colors[215] = '#c0a080';          // raw_iron
        colors[216] = '#d0b090';          // raw_gold
        colors[217] = '#a0d0e0';          // raw_diamond
        colors[218] = '#40e0d0';          // diamond
        colors[219] = '#50c0a0';          // emerald
        colors[220] = '#3050a0';          // lapis_lazuli
        colors[221] = '#d0b090';          // iron_ingot
        colors[222] = '#ffd700';          // gold_ingot
        colors[223] = '#6a5040';          // netherite_ingot
        colors[224] = '#5a4535';          // netherite_block
        colors[225] = '#ffd700';          // gold_block
        colors[226] = '#d0b090';          // iron_block
        colors[227] = '#40e0d0';          // diamond_block
        colors[228] = '#50c0a0';          // emerald_block
        colors[229] = '#aa4444';          // redstone_dust
        colors[230] = '#aa4444';          // redstone_block
        colors[231] = '#3050a0';          // lapis_block
        colors[232] = '#2a2a2a';          // coal_block

        // Quartz blocks (IDs 234-238)
        colors[234] = '#e8e0d0';          // quartz_block
        colors[235] = '#e8e0d0';          // chiseled_quartz_block
        colors[236] = '#e0d8c8';          // quartz_pillar
        colors[237] = '#d8d0c0';          // quartz_bricks
        colors[238] = '#6a6a8a';          // nether_quartz_ore

        // Hay bale and cocoa (IDs 239-240)
        colors[239] = '#d4c478';          // hay_block
        colors[240] = '#4a6a2a';          // cocoa

        // Stained glass (IDs 241-256)
        colors[241] = '#e8e8e8';          // white_stained_glass
        colors[242] = '#d0a060';          // orange_stained_glass
        colors[243] = '#c080c0';          // magenta_stained_glass
        colors[244] = '#80c0e0';          // light_blue_stained_glass
        colors[245] = '#e0d060';          // yellow_stained_glass
        colors[246] = '#80d080';          // lime_stained_glass
        colors[247] = '#e0a0c0';          // pink_stained_glass
        colors[248] = '#808080';          // gray_stained_glass
        colors[249] = '#c0c0c0';          // light_gray_stained_glass
        colors[250] = '#60c0c0';          // cyan_stained_glass
        colors[251] = '#a080d0';          // purple_stained_glass
        colors[252] = '#6080d0';          // blue_stained_glass
        colors[253] = '#a08060';          // brown_stained_glass
        colors[254] = '#60a060';          // green_stained_glass
        colors[255] = '#d04040';          // red_stained_glass
        colors[256] = '#2a2a2a';          // black_stained_glass

        // Nether blocks (IDs 257-274)
        colors[257] = '#8a3a3a';          // netherrack
        colors[258] = '#5a4a3a';          // soul_sand
        colors[259] = '#6a5a4a';          // soul_soil
        colors[260] = '#a08060';          // gilded_blackstone
        colors[261] = '#5a5a5a';          // polished_blackstone
        colors[262] = '#4a4a4a';          // polished_blackstone_bricks
        colors[263] = '#4a6a2a';          // nether_wart_block
        colors[264] = '#e0d0b0';          // warped_stem
        colors[265] = '#d0c0a0';          // warped_hyphae
        colors[266] = '#7a2a2a';          // crimson_planks (warped_planks was 81, using crimson)
        colors[267] = '#6a8a4a';          // warped_nylium
        colors[268] = '#c04040';          // crimson_stem
        colors[269] = '#b03030';          // crimson_hyphae
        colors[270] = '#8a2a2a';          // crimson_planks
        colors[271] = '#8a4a4a';          // crimson_nylium
        colors[272] = '#c0a040';          // nether_gold_ore
        colors[273] = '#5a6a4a';          // ancient_debris
        colors[274] = '#8a5a2a';          // magma

        // Respawn anchor and portals (IDs 275-277)
        colors[275] = '#6a3a8a';          // respawn_anchor
        colors[276] = '#6a3a8a';          // nether_portal
        colors[277] = '#1a1a2a';          // end_portal

        // End blocks (IDs 287-294)
        colors[287] = '#5a3a5a';          // chorus_plant
        colors[288] = '#a060a0';          // chorus_flower
        colors[289] = '#d0b0d0';          // purpur_block
        colors[290] = '#c0a0c0';          // purpur_pillar
        colors[291] = '#c8b8a0';          // end_stone_brick_wall
        colors[292] = '#d0b0d0';          // end_stone_bricks_stairs
        colors[293] = '#f06040';          // shroomlight
        colors[294] = '#4a8a2a';          // pitcher_pod

        // Additional common blocks not yet covered
        colors[1000] = '#1a1a1a';         // bedrock

        _blockColors = colors;
        return _blockColors;
    }

    /**
     * Get the color for a block ID from the initialized lookup table.
     * Automatically initializes the table if not already done.
     * Logs a warning for unknown block IDs to help catch missing entries.
     * @param {number} blockId - The block ID (0-257+).
     * @returns {string} CSS color string, or '#555555' as fallback.
     * @private
     */
    function _getBlockColor(blockId) {
        if (!_blockColors) _initBlockColors();
        var color = _blockColors[blockId];
        if (color === undefined) {
            // Log unknown block IDs for debugging — only once per unique ID
            if (!(_blockColors._unknownLog || 0)) {
                _blockColors._unknownLog = 0;
            }
            if (_blockColors._unknownLog < 10) {
                Donkeycraft.Logger.warn('MapRenderer', 'Unknown block ID: ' + blockId + ' — using fallback color #555555');
                _blockColors._unknownLog++;
            }
            return '#555555';
        }
        return color;
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

        /** @type {boolean} @private */
        this._visible = false;
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

            var minimapOk = this._minimapUI.init();
            var mapPanelOk = this._mapPanelUI.init();

            // Register Escape key handler to close the full map panel
            if (this._mapPanelUI && typeof this._mapPanelUI.registerEscapeHandler === 'function') {
                this._mapPanelUI.registerEscapeHandler();
            }

            return minimapOk && mapPanelOk;
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

        this._minimapUI = null;
        this._mapPanelUI = null;
        this._chunkManager = null;
    };

    // ============================================================
    // Static methods — attached AFTER class definition (backward compat)
    // ============================================================

    /**
     * Get the color for a block ID (static method for backward compatibility).
     * Delegates to private _getBlockColor function. Automatically initializes
     * the color lookup table if not already done.
     * @param {number} blockId - The block ID (0-257+).
     * @returns {string} CSS color string, or '#555555' as fallback for unknown blocks.
     */
    Donkeycraft.MapRenderer._getBlockColor = function (blockId) {
        return _getBlockColor(blockId);
    };

    /**
     * Invalidate the per-chunk surface map for a given chunk.
     * Called when blocks are placed or broken in that chunk.
     * Surface maps are rebuilt lazily on next render access by MinimapUI/MapPanelUI.
     * Also invalidates MapPanelUI's surface maps to prevent stale data.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.MapRenderer.invalidateChunkSurfaceMap = function (chunkX, chunkZ) {
        // Invalidate MinimapUI surface map for this chunk
        if (Donkeycraft.MinimapUI && typeof Donkeycraft.MinimapUI.invalidateChunkSurfaceMap === 'function') {
            Donkeycraft.MinimapUI.invalidateChunkSurfaceMap(chunkX, chunkZ);
        }
        // Also invalidate MapPanelUI surface maps — they use the same _mapSurfaceMap property
        // but may have their own caching. Clearing ensures both views rebuild fresh data.
        if (Donkeycraft.MapPanelUI && typeof Donkeycraft.MapPanelUI.invalidateChunkSurfaceMap === 'function') {
            Donkeycraft.MapPanelUI.invalidateChunkSurfaceMap(chunkX, chunkZ);
        }
    };

})();
