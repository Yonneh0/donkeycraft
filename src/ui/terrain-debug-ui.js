// Donkeycraft — Terrain Debug UI Module
// Handles DOM UI elements for the terrain viewer/debugger panel.
// Provides real-time debug info: camera position, rotation (yaw/pitch), FPS,
// chunk count, generation time, biome/seed settings, and grid controls.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    // ============================================================
    // Module-Level Constants
    // ============================================================

    /**
     * Maximum number of grid cells to prevent UI overflow.
     * @type {number}
     * @private
     */
    var MAX_GRID_CELLS = 4096;

    /**
     * TerrainDebugUI — Manages the terrain debugger UI panel elements.
     * Handles DOM creation, event wiring, biome/seed selection, chunk grid visualization,
     * and localStorage persistence for UI state.
     *
     * @param {Donkeycraft.DebugTerrainRenderer} renderer - The debug terrain renderer instance.
     * @constructor
     */
    Donkeycraft.TerrainDebugUI = function (renderer) {
        /** @type {Donkeycraft.DebugTerrainRenderer|null} */
        this._renderer = renderer;

        /** @type {HTMLElement|null} */
        this._uiPanel = null;

        /** @type {HTMLElement|null} */
        this._chunkGridDisplay = null;

        /** @type {HTMLElement|null} */
        this._chunkGridWrapper = null;

        /** @type {boolean} */
        this._initialized = false;
    };

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Initialize the UI panel — creates DOM elements if needed and wires up event handlers.
     * Safe to call multiple times; skips creation if UI already exists.
     * @returns {Donkeycraft.TerrainDebugUI} This instance for chaining.
     */
    Donkeycraft.TerrainDebugUI.prototype.init = function () {
        if (this._initialized) return this;

        this._createUIPanel();
        this._wireUpHandlers();
        this._updateStatsDisplay();
        this._renderChunkGrid();

        // Wire terrain regeneration callback to update stats and grid
        if (this._renderer && this._renderer.setOnTerrainRegenerated) {
            var self = this;
            this._renderer.setOnTerrainRegenerated(function () {
                self._updateStatsDisplay();
                self._renderChunkGrid();
            });
        }

        this._initialized = true;
        return this;
    };

    /**
     * Update the stats display with terrain information.
     * Alias for _updateStatsDisplay — exposed as a public method for external callers.
     */
    Donkeycraft.TerrainDebugUI.prototype.updateStats = function () {
        this._updateStatsDisplay();
    };

    /**
     * Re-render the chunk grid visual.
     * Alias for _renderChunkGrid — exposed as a public method for external callers.
     */
    Donkeycraft.TerrainDebugUI.prototype.renderChunkGrid = function () {
        this._renderChunkGrid();
    };

    // ============================================================
    // UI Panel Creation
    // ============================================================

    /**
     * Create the UI panel DOM elements if they don't exist.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._createUIPanel = function () {
        // Check if UI already exists
        var existing = document.getElementById('dk-terrain-ui');
        if (existing) {
            this._uiPanel = existing;
            this._chunkGridDisplay = document.getElementById('chunk-grid-display');
            this._chunkGridWrapper = document.getElementById('chunk-grid-wrapper');
            return;
        }

        // Create main panel
        var panel = document.createElement('div');
        panel.id = 'dk-terrain-ui';
        panel.innerHTML = [
            '<h2>Terrain Debugger</h2>',

            // Biome selection
            '<label>Biome: <select id="ui-biome"></select></label>',

            // Seed input
            '<div class="row"><span>Seed:</span>',
            '<input type="number" id="ui-seed" value="42" min="-2147483648" max="2147483647">',
            '<button id="btn-apply-seed">Apply</button></div>',

            // Chunk grid with expand/contract buttons
            '<div class="chunk-grid-placeholder"></div>',

            // Separator
            '<div class="separator"></div>',

            // Debug info section
            '<div style="font-size:12px;color:#888;margin-bottom:4px;">Camera Position</div>',
            '<div class="info-line" id="ui-viewer-pos">X=0 Y=0 Z=0</div>',
            '<div class="info-line" id="ui-viewer-rot">Yaw=0° Pitch=0°</div>',
            '<div class="separator"></div>',

            // Chunk info section
            '<div style="font-size:12px;color:#888;margin-bottom:4px;">Chunk Info</div>',
            '<div class="info-line" id="ui-chunk-pos">CX=0 CZ=0</div>',
            '<div class="info-line" id="ui-chunk-count">Chunks: 0</div>',
            '<div class="info-line" id="ui-gen-time">Gen Time: 0ms</div>',
            '<div class="separator"></div>',

            // Stats section
            '<div style="font-size:12px;color:#888;margin-bottom:4px;">Performance</div>',
            '<div class="info-line" id="ui-stats">Chunks: 0</div>',
            '<div class="info-line" id="ui-fps">FPS: 0</div>',
            '<div class="separator"></div>',

            // Generation options
            '<div style="font-size:12px;color:#888;margin-bottom:4px;">Generation Options</div>',
            '<div class="checkbox-row"><input type="checkbox" id="opt-caves" checked><label for="opt-caves">Caves</label></div>',
            '<div class="checkbox-row"><input type="checkbox" id="opt-ores" checked><label for="opt-ores">Ores</label></div>',
            '<div class="checkbox-row"><input type="checkbox" id="opt-water" checked><label for="opt-water">Water</label></div>',
            '<div class="checkbox-row"><input type="checkbox" id="opt-surface" checked><label for="opt-surface">Surface Layer</label></div>',
            '<div class="separator"></div>',

            // Action buttons
            '<div class="row"><button id="btn-regen" style="flex:1;">Regenerate All</button></div>',
            '<div class="row"><button id="btn-ground">Place on Ground</button><button id="btn-overview">NE Overview</button></div>',

            // Navigation buttons
            '<div style="font-size:12px;color:#888;margin-bottom:4px;">Move to Chunk</div>',
            '<div class="row"><button id="btn-nw">NW</button><button id="btn-n">N</button><button id="btn-ne">NE</button></div>',
            '<div class="row"><button id="btn-w">W</button><button id="btn-center">C</button><button id="btn-e">E</button></div>',
            '<div class="row"><button id="btn-sw">SW</button><button id="btn-s">S</button><button id="btn-se">SE</button></div>'
        ].join('');

        document.body.appendChild(panel);

        // Find the placeholder and replace it with the actual chunk grid wrapper structure
        var placeholder = panel.querySelector('.chunk-grid-placeholder');
        if (!placeholder) return;

        // Create chunk grid wrapper structure
        var gridWrapper = document.createElement('div');
        gridWrapper.id = 'chunk-grid-wrapper';
        gridWrapper.className = 'chunk-grid-wrapper';
        gridWrapper.innerHTML = [
            '<div class="grid-dir-buttons grid-top">',
            '<button id="btn-expand-n" class="expand-btn" title="Expand North">＋N</button>',
            '<button id="btn-contract-n" class="contract-btn" title="Contract North">－N</button>',
            '</div>',
            '<div class="grid-row-mid">',
            '<div class="grid-dir-buttons grid-left">',
            '<button id="btn-expand-w" class="expand-btn" title="Expand West">＋W</button>',
            '<button id="btn-contract-w" class="contract-btn" title="Contract West">－W</button>',
            '</div>',
            '<div id="chunk-grid-display" class="chunk-grid-display"></div>',
            '<div class="grid-dir-buttons grid-right">',
            '<button id="btn-expand-e" class="expand-btn" title="Expand East">＋E</button>',
            '<button id="btn-contract-e" class="contract-btn" title="Contract East">－E</button>',
            '</div>',
            '</div>',
            '<div class="grid-dir-buttons grid-bottom">',
            '<button id="btn-expand-s" class="expand-btn" title="Expand South">＋S</button>',
            '<button id="btn-contract-s" class="contract-btn" title="Contract South">－S</button>',
            '</div>'
        ].join('');

        placeholder.parentNode.replaceChild(gridWrapper, placeholder);

        this._uiPanel = panel;
        this._chunkGridDisplay = document.getElementById('chunk-grid-display');
        this._chunkGridWrapper = gridWrapper;
    };

    // ============================================================
    // Biome Population
    // ============================================================

    /**
     * Populate biome selector dropdown with all registered biomes.
     * Gracefully handles missing BiomeRegistry or malformed biome data.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._populateBiomeSelector = function () {
        var sel = document.getElementById('ui-biome');
        if (!sel) return;

        var biomes = Donkeycraft.BiomeRegistry ? Donkeycraft.BiomeRegistry.getAllBiomes() : [];
        if (!Array.isArray(biomes)) return;

        sel.innerHTML = ''; // Clear existing options

        for (var i = 0; i < biomes.length; i++) {
            var opt = document.createElement('option');
            opt.value = String(biomes[i].id != null ? biomes[i].id : i);
            opt.textContent = biomes[i].name != null ? biomes[i].name : 'Biome #' + (i + 1);
            sel.appendChild(opt);
        }

        // Set current biome selection from renderer state
        if (this._renderer && this._renderer.getBiome) {
            var currentBiome = this._renderer.getBiome();
            sel.value = String(currentBiome != null ? currentBiome : 1);
        }
    };

    /**
     * Get biome ID from selector dropdown.
     * @returns {number} Biome ID, or 1 if selector not found.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._getBiomeId = function () {
        var sel = document.getElementById('ui-biome');
        return sel ? parseInt(sel.value, 10) || 1 : 1;
    };

    /**
     * Get seed value from input field.
     * @returns {number} Seed value, or 42 if input not found.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._getSeed = function () {
        var inp = document.getElementById('ui-seed');
        return inp ? parseInt(inp.value, 10) || 42 : 42;
    };

    /**
     * Get generation options.
     * @returns {{caves: boolean, ores: boolean, water: boolean, surface: boolean}}
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._getOptions = function () {
        return {
            caves: this._checked('opt-caves'),
            ores: this._checked('opt-ores'),
            water: this._checked('opt-water'),
            surface: this._checked('opt-surface')
        };
    };

    /**
     * Check if an element is checked.
     * @param {string} id
     * @returns {boolean}
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._checked = function (id) {
        var el = document.getElementById(id);
        return el ? el.checked : true;
    };

    // ============================================================
    // Chunk Grid Rendering
    // ============================================================

    /**
     * Render the chunk grid display.
     * Shows a visual representation of loaded/unloaded chunks with color-coded top blocks.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._renderChunkGrid = function () {
        var display = this._chunkGridDisplay;
        if (!display || !this._renderer) return;

        var radii = this._renderer.getRadii();
        var rows = radii.n + radii.s + 1;
        var cols = radii.w + radii.e + 1;

        // Guard against excessively large grids
        if (rows * cols > MAX_GRID_CELLS) {
            console.warn('[TerrainDebugUI] Grid too large, clamping to', MAX_GRID_CELLS, 'cells');
            return;
        }

        display.style.gridTemplateColumns = 'repeat(' + cols + ', 16px)';
        display.style.gridTemplateRows = 'repeat(' + rows + ', 16px)';
        display.innerHTML = '';

        var chunks = this._renderer.getChunks ? this._renderer.getChunks() : null;

        // Get chunk position using public API instead of accessing private properties directly
        var chunkPos = this._renderer.getChunkPosition ? this._renderer.getChunkPosition() : { x: 0, z: 0 };
        var currentChunkX = chunkPos.x || 0;
        var currentChunkZ = chunkPos.z || 0;

        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var chunkDx = currentChunkX + (c - radii.w);
                var chunkDz = currentChunkZ + (r - radii.n);
                var key = chunkDx + ',' + chunkDz;
                var loadedChunk = chunks ? chunks.get(key) : null;

                var div = document.createElement('div');
                div.className = 'chunk-grid-cell';

                if (loadedChunk) {
                    var color = this._getTopBlockColor(loadedChunk);
                    div.style.backgroundColor = color;
                } else {
                    div.style.backgroundColor = '#1a1a1a';
                }

                // Highlight center chunk (current view position)
                if (c === radii.w && r === radii.n) {
                    div.style.border = '2px solid #4fc3f7';
                }

                display.appendChild(div);
            }
        }
    };

    /**
     * Get the color of the top-most visible block in a chunk, sampled at the center column.
     * @param {Donkeycraft.Chunk} chunk - The chunk to sample.
     * @returns {string} CSS 'rgb(r,g,b)' color string, or '#111' if no block found.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._getTopBlockColor = function (chunk) {
        if (!chunk || !Donkeycraft.Config) return '#111';

        var cs = Donkeycraft.Config.CHUNK_SIZE;
        var ws = Donkeycraft.Config.WORLD_HEIGHT;
        var cx = Math.floor(cs / 2);
        var cz = Math.floor(cs / 2);
        var colors = Donkeycraft.BlockColors ? Donkeycraft.BlockColors.getAllColors() : null;

        for (var y = ws - 1; y >= 0; y--) {
            var bid = chunk.getBlock(cx, y, cz);
            if (bid !== 0) {
                if (colors && colors[bid]) {
                    var clr = colors[bid];
                    return 'rgb(' + Math.round(clr[0] * 255) + ',' +
                        Math.round(clr[1] * 255) + ',' +
                        Math.round(clr[2] * 255) + ')';
                }
            }
        }
        return '#111';
    };

    // ============================================================
    // Event Handlers
    // ============================================================

    /**
     * Wire up all event handlers for UI controls.
     * Includes biome selector, seed input, navigation buttons, chunk grid expand/contract,
     * and generation option checkboxes.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._wireUpHandlers = function () {
        var self = this;

        // Biome selector — change biome and regenerate
        var biomeSel = document.getElementById('ui-biome');
        if (biomeSel) {
            biomeSel.addEventListener('change', function () {
                if (!self._renderer) return;
                if (self._renderer.setBiome) self._renderer.setBiome(self._getBiomeId());
                if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain();
            });
        }

        // Seed apply button
        var seedApplyBtn = document.getElementById('btn-apply-seed');
        if (seedApplyBtn) {
            seedApplyBtn.addEventListener('click', function () {
                if (!self._renderer) return;
                var seed = self._getSeed();
                if (self._renderer.setSeed) self._renderer.setSeed(seed);
                if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain();
            });
        }

        // Seed input change (on Enter key or blur)
        var seedInput = document.getElementById('ui-seed');
        if (seedInput) {
            seedInput.addEventListener('change', function () {
                if (!self._renderer) return;
                var seed = self._getSeed();
                if (self._renderer.setSeed) self._renderer.setSeed(seed);
                if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain();
            });
        }

        // Regenerate button
        var regenBtn = document.getElementById('btn-regen');
        if (regenBtn) {
            regenBtn.addEventListener('click', function () {
                if (self._renderer && self._renderer.regenerateTerrain) {
                    self._renderer.regenerateTerrain();
                }
            });
        }

        // Place on ground button — uses controller.placeAboveGround()
        var btnGround = document.getElementById('btn-ground');
        if (btnGround) {
            btnGround.addEventListener('click', function () {
                if (!self._renderer || !self._renderer._controller) return;
                var ctrl = self._renderer._controller;
                if (ctrl.placeAboveGround) {
                    ctrl.placeAboveGround();
                }
            });
        }

        // NE Overview button — uses controller.setOverviewView()
        var btnOverview = document.getElementById('btn-overview');
        if (btnOverview) {
            btnOverview.addEventListener('click', function () {
                if (!self._renderer || !self._renderer._controller) return;
                var ctrl = self._renderer._controller;
                if (ctrl.setOverviewView) {
                    ctrl.setOverviewView(
                        self._renderer._currentChunkX || 0,
                        self._renderer._currentChunkZ || 0,
                        self._renderer._chunkRadiusN,
                        self._renderer._chunkRadiusS,
                        self._renderer._chunkRadiusE,
                        self._renderer._chunkRadiusW
                    );
                }
            });
        }

        // Navigation buttons — move camera by one chunk in each direction
        var navMap = {
            'btn-nw': [-1, 1], 'btn-n': [0, 1], 'btn-ne': [1, 1],
            'btn-w': [-1, 0], 'btn-center': [0, 0], 'btn-e': [1, 0],
            'btn-sw': [-1, -1], 'btn-s': [0, -1], 'btn-se': [1, -1]
        };

        var navIds = Object.keys(navMap);
        for (var i = 0; i < navIds.length; i++) {
            (function (id, d) {
                var btn = document.getElementById(id);
                if (!btn) return;
                btn.addEventListener('click', function () {
                    if (!self._renderer) return;
                    // Use public API to get current chunk position
                    var pos = self._renderer.getChunkPosition ? self._renderer.getChunkPosition() : { x: 0, z: 0 };
                    var cx = (pos.x != null ? pos.x : 0) + d[0];
                    var cz = (pos.z != null ? pos.z : 0) + d[1];
                    self._renderer.setCurrentChunk(cx, cz);
                    if (self._renderer.regenerateTerrain) {
                        self._renderer.regenerateTerrain();
                    }
                });
            })(navIds[i], navMap[navIds[i]]);
        }

        // Chunk grid expand/contract buttons — modify chunk radii
        var chunkBtnActions = {
            'btn-expand-n': function () { if (self._renderer) { var r = self._renderer.getRadii(); r.n++; self._renderer.setRadii(r); if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain(); } },
            'btn-contract-n': function () { if (self._renderer) { var r = self._renderer.getRadii(); if (r.n > 0) { r.n--; self._renderer.setRadii(r); if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain(); } } },
            'btn-expand-s': function () { if (self._renderer) { var r = self._renderer.getRadii(); r.s++; self._renderer.setRadii(r); if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain(); } },
            'btn-contract-s': function () { if (self._renderer) { var r = self._renderer.getRadii(); if (r.s > 0) { r.s--; self._renderer.setRadii(r); if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain(); } } },
            'btn-expand-e': function () { if (self._renderer) { var r = self._renderer.getRadii(); r.e++; self._renderer.setRadii(r); if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain(); } },
            'btn-contract-e': function () { if (self._renderer) { var r = self._renderer.getRadii(); if (r.e > 0) { r.e--; self._renderer.setRadii(r); if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain(); } } },
            'btn-expand-w': function () { if (self._renderer) { var r = self._renderer.getRadii(); r.w++; self._renderer.setRadii(r); if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain(); } },
            'btn-contract-w': function () { if (self._renderer) { var r = self._renderer.getRadii(); if (r.w > 0) { r.w--; self._renderer.setRadii(r); if (self._renderer.regenerateTerrain) self._renderer.regenerateTerrain(); } } }
        };

        var chunkBtnIds = Object.keys(chunkBtnActions);
        for (var j = 0; j < chunkBtnIds.length; j++) {
            var btn2 = document.getElementById(chunkBtnIds[j]);
            if (btn2) btn2.addEventListener('click', chunkBtnActions[chunkBtnIds[j]]);
        }

        // Generation options checkboxes — update renderer options and persist
        var optIds = ['opt-caves', 'opt-ores', 'opt-water', 'opt-surface'];
        for (var k = 0; k < optIds.length; k++) {
            (function (optId) {
                var optEl = document.getElementById(optId);
                if (optEl) {
                    optEl.addEventListener('change', function () {
                        if (self._renderer && self._renderer.setOptions) {
                            self._renderer.setOptions(self._getOptions());
                        }
                        self._saveState();
                    });
                }
            })(optIds[k]);
        }

        // Populate biome selector
        this._populateBiomeSelector();

        // Load saved state
        this._loadSavedState();
    };

    // ============================================================
    // State Save/Load
    // ============================================================

    /**
     * Load saved UI state from localStorage.
     * Applies saved seed value and generation option checkboxes.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._loadSavedState = function () {
        try {
            var raw = localStorage.getItem('donkeycraft_terrain_ui_state');
            if (!raw) return;
            var state = JSON.parse(raw);
            if (!state || typeof state !== 'object') return;

            // Apply saved seed
            if (typeof state.worldSeed === 'number') {
                var seedInput = document.getElementById('ui-seed');
                if (seedInput) seedInput.value = state.worldSeed;
            }

            // Apply saved options
            if (state.options && typeof state.options === 'object') {
                if (typeof state.options.caves === 'boolean') {
                    var el1 = document.getElementById('opt-caves');
                    if (el1) el1.checked = state.options.caves;
                }
                if (typeof state.options.ores === 'boolean') {
                    var el2 = document.getElementById('opt-ores');
                    if (el2) el2.checked = state.options.ores;
                }
                if (typeof state.options.water === 'boolean') {
                    var el3 = document.getElementById('opt-water');
                    if (el3) el3.checked = state.options.water;
                }
                if (typeof state.options.surface === 'boolean') {
                    var el4 = document.getElementById('opt-surface');
                    if (el4) el4.checked = state.options.surface;
                }
            }
        } catch (e) {
            console.warn('[TerrainDebugUI] Failed to load saved state:', e);
        }
    };

    /**
     * Save UI state to localStorage.
     * Persists seed value and generation option checkbox states.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._saveState = function () {
        try {
            var state = {
                worldSeed: this._getSeed(),
                options: this._getOptions()
            };
            localStorage.setItem('donkeycraft_terrain_ui_state', JSON.stringify(state));
        } catch (e) {
            console.warn('[TerrainDebugUI] Failed to save state:', e);
        }
    };

    // ============================================================
    // Stats Display
    // ============================================================

    /**
     * Update the stats display with current chunk count, generation time, and FPS.
     * Also updates camera position, rotation (yaw/pitch in degrees), and chunk info.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._updateStatsDisplay = function () {
        if (!this._renderer) return;

        // Get the controller from the renderer — this is the source of truth for camera data
        var ctrl = this._renderer._controller;
        if (!ctrl) return;

        // Camera position and rotation (yaw/pitch in radians, converted to degrees)
        var cam = ctrl.getCamera();
        if (cam) {
            var viewerPosEl = document.getElementById('ui-viewer-pos');
            if (viewerPosEl) {
                viewerPosEl.textContent = 'X=' + cam.x.toFixed(1) + ' Y=' + cam.y.toFixed(1) + ' Z=' + cam.z.toFixed(1);
            }

            // Yaw/pitch in degrees (radians * 180/π)
            var viewerRotEl = document.getElementById('ui-viewer-rot');
            if (viewerRotEl) {
                var yawDeg = Math.round(cam.yaw * 180 / Math.PI);
                var pitchDeg = Math.round(cam.pitch * 180 / Math.PI);
                viewerRotEl.textContent = 'Yaw=' + yawDeg + '° Pitch=' + pitchDeg + '°';
            }
        }

        // Chunk position (center of view)
        var chunkPosEl = document.getElementById('ui-chunk-pos');
        if (chunkPosEl) {
            var pos = this._renderer.getChunkPosition ? this._renderer.getChunkPosition() : { x: 0, z: 0 };
            chunkPosEl.textContent = 'CX=' + (pos.x || 0) + ' CZ=' + (pos.z || 0);
        }

        // Chunk count — total loaded chunks in memory
        var chunkCountEl = document.getElementById('ui-chunk-count');
        if (chunkCountEl) {
            var count = this._renderer.getChunkCount ? this._renderer.getChunkCount() : 0;
            chunkCountEl.textContent = 'Chunks: ' + count;
        }

        // Generation time — ms elapsed since last terrain regeneration
        var genTimeEl = document.getElementById('ui-gen-time');
        if (genTimeEl) {
            var gt = this._renderer.getGenerationTime ? this._renderer.getGenerationTime() : 0;
            genTimeEl.textContent = 'Gen Time: ' + gt.toFixed(1) + 'ms';
        }

        // Performance stats — combined chunk count + generation time
        var statsEl = document.getElementById('ui-stats');
        if (statsEl) {
            var chunkCount = this._renderer.getChunkCount ? this._renderer.getChunkCount() : 0;
            var genTime = this._renderer.getGenerationTime ? this._renderer.getGenerationTime() : 0;

            var statsText = 'Chunks: ' + chunkCount;
            if (genTime > 0) {
                statsText += ' | Gen Time: ' + genTime.toFixed(1) + 'ms';
            }
            statsEl.textContent = statsText;
        }

        // FPS display — frames per second from controller
        var fpsEl = document.getElementById('ui-fps');
        if (fpsEl) {
            var fps = this._renderer.getCurrentFps ? this._renderer.getCurrentFps() : 0;
            fpsEl.textContent = 'FPS: ' + fps;
        }
    };

})();