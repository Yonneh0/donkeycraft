// Donkeycraft — Terrain Debug UI Module
// Handles DOM UI elements for the terrain viewer/debugger panel.
// Can be loaded standalone (terrain.html) or as a panel in index.html.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    /**
     * TerrainDebugUI — Manages the terrain debugger UI panel elements.
     * @param {Donkeycraft.DebugTerrainRenderer} renderer - The debug terrain renderer instance.
     * @constructor
     */
    Donkeycraft.TerrainDebugUI = function (renderer) {
        this._renderer = renderer;
        this._uiPanel = null;
        this._chunkGridDisplay = null;
        this._chunkGridWrapper = null;
    };

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Initialize the UI panel — creates DOM elements if needed and wires up event handlers.
     */
    Donkeycraft.TerrainDebugUI.prototype.init = function () {
        this._createUIPanel();
        this._wireUpHandlers();
        this._updateStatsDisplay();

        // Wire terrain regeneration callback to update stats
        if (this._renderer && this._renderer.setOnTerrainRegenerated) {
            var self = this;
            this._renderer.setOnTerrainRegenerated(function () {
                self._updateStatsDisplay();
                self._renderChunkGrid();
            });
        }

        return this;
    };

    /**
     * Update the stats display with terrain information.
     */
    Donkeycraft.TerrainDebugUI.prototype.updateStats = function () {
        this._updateStatsDisplay();
    };

    /**
     * Re-render the chunk grid visual.
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
            '<h2>Terrain Tester</h2>',
            '<label>Biome: <select id="ui-biome"></select></label>',
            '<div class="row"><span>Seed:</span>',
            '<input type="number" id="ui-seed" value="42" min="-2147483648" max="2147483647">',
            '<button id="btn-apply-seed">Apply</button></div>',
            '<div class="row"><span>Loaded Chunks:</span></div>',
            '<div id="chunk-grid-wrapper" class="chunk-grid-wrapper"></div>',
            '<div class="separator"></div>',
            '<div style="font-size:12px;color:#888;margin-bottom:4px;">Chunk Position</div>',
            '<div class="info-line" id="ui-chunk-pos">CX=0 CZ=0</div>',
            '<div class="separator"></div>',
            '<div style="font-size:12px;color:#888;margin-bottom:4px;">Viewer Location</div>',
            '<div class="info-line" id="ui-viewer-pos">X=0 Y=0 Z=0</div>',
            '<div class="info-line" id="ui-viewer-seed">Seed: 0</div>',
            '<div class="row"><button id="btn-nw">NW</button><button id="btn-n">N</button><button id="btn-ne">NE</button></div>',
            '<div class="row"><button id="btn-w">W</button><button id="btn-center">C</button><button id="btn-e">E</button></div>',
            '<div class="row"><button id="btn-sw">SW</button><button id="btn-s">S</button><button id="btn-se">SE</button></div>',
            '<div class="separator"></div>',
            '<div style="font-size:12px;color:#888;margin-bottom:4px;">Generation Options</div>',
            '<div class="checkbox-row"><input type="checkbox" id="opt-caves" checked><label for="opt-caves">Caves</label></div>',
            '<div class="checkbox-row"><input type="checkbox" id="opt-ores" checked><label for="opt-ores">Ores</label></div>',
            '<div class="checkbox-row"><input type="checkbox" id="opt-water" checked><label for="opt-water">Water</label></div>',
            '<div class="checkbox-row"><input type="checkbox" id="opt-surface" checked><label for="opt-surface">Surface Layer</label></div>',
            '<div class="separator"></div>',
            '<div class="row"><button id="btn-regen" style="flex:1;">Regenerate All</button></div>',
            '<div class="separator"></div>',
            '<div class="info-line" id="ui-stats">Chunks: 0</div>',
            '<div class="info-line" id="ui-fps">FPS: 0</div>'
        ].join('');

        document.body.appendChild(panel);

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

        panel.appendChild(gridWrapper);

        this._uiPanel = panel;
        this._chunkGridDisplay = document.getElementById('chunk-grid-display');
        this._chunkGridWrapper = gridWrapper;
    };

    // ============================================================
    // Biome Population
    // ============================================================

    /**
     * Populate biome selector dropdown.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._populateBiomeSelector = function () {
        var sel = document.getElementById('ui-biome');
        if (!sel) return;

        var biomes = Donkeycraft.BiomeRegistry ? Donkeycraft.BiomeRegistry.getAllBiomes() : [];
        for (var i = 0; i < biomes.length; i++) {
            var opt = document.createElement('option');
            opt.value = biomes[i].id;
            opt.textContent = biomes[i].name;
            sel.appendChild(opt);
        }

        // Set current biome selection
        if (this._renderer) {
            sel.value = String(this._renderer.getBiome ? this._renderer.getBiome() : 1);
        }
    };

    /**
     * Get biome ID from selector.
     * @returns {number}
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._getBiomeId = function () {
        var sel = document.getElementById('ui-biome');
        return sel ? parseInt(sel.value) : 1;
    };

    /**
     * Get seed from input.
     * @returns {number}
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._getSeed = function () {
        var inp = document.getElementById('ui-seed');
        return inp ? parseInt(inp.value) : 42;
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
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._renderChunkGrid = function () {
        var display = this._chunkGridDisplay;
        if (!display || !this._renderer) return;

        var radii = this._renderer.getRadii();
        var rows = radii.n + radii.s + 1;
        var cols = radii.w + radii.e + 1;

        display.style.gridTemplateColumns = 'repeat(' + cols + ', 16px)';
        display.style.gridTemplateRows = 'repeat(' + rows + ', 16px)';
        display.innerHTML = '';

        var chunks = this._renderer.getChunks ? this._renderer.getChunks() : null;
        var currentChunkX = this._renderer.getCamera ? 0 : 0;
        var currentChunkZ = this._renderer.getCamera ? 0 : 0;

        // Get chunk position from renderer if available
        if (this._renderer._currentChunkX !== undefined) {
            currentChunkX = this._renderer._currentChunkX;
            currentChunkZ = this._renderer._currentChunkZ;
        }

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

                // Highlight center chunk
                if (c === radii.w && r === radii.n) {
                    div.style.border = '2px solid #4fc3f7';
                }

                display.appendChild(div);
            }
        }
    };

    /**
     * Get top block color for a chunk.
     * @param {Donkeycraft.Chunk} chunk
     * @returns {string} CSS color string.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._getTopBlockColor = function (chunk) {
        var cs = Donkeycraft.Config.CHUNK_SIZE;
        var ws = Donkeycraft.Config.WORLD_HEIGHT;
        var cx = Math.floor(cs / 2);
        var cz = Math.floor(cs / 2);
        var colors = Donkeycraft.BlockColors.getAllColors();

        for (var y = ws - 1; y >= 0; y--) {
            var bid = chunk.getBlock(cx, y, cz);
            if (bid !== 0) {
                var clr = colors[bid];
                if (clr) {
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
     * Wire up all event handlers.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._wireUpHandlers = function () {
        var self = this;

        // Biome selector
        var biomeSel = document.getElementById('ui-biome');
        if (biomeSel) {
            biomeSel.addEventListener('change', function () {
                if (self._renderer && self._renderer.setBiome) {
                    self._renderer.setBiome(self._getBiomeId());
                }
                if (self._renderer && self._renderer.regenerateTerrain) {
                    self._renderer.regenerateTerrain();
                }
            });
        }

        // Seed apply button
        var seedApplyBtn = document.getElementById('btn-apply-seed');
        if (seedApplyBtn) {
            seedApplyBtn.addEventListener('click', function () {
                var seed = self._getSeed();
                if (self._renderer && self._renderer.setSeed) {
                    self._renderer.setSeed(seed);
                }
                if (self._renderer && self._renderer.regenerateTerrain) {
                    self._renderer.regenerateTerrain();
                }
            });
        }

        // Seed input change
        var seedInput = document.getElementById('ui-seed');
        if (seedInput) {
            seedInput.addEventListener('change', function () {
                var seed = self._getSeed();
                if (self._renderer && self._renderer.setSeed) {
                    self._renderer.setSeed(seed);
                }
                if (self._renderer && self._renderer.regenerateTerrain) {
                    self._renderer.regenerateTerrain();
                }
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

        // Navigation buttons
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
                    var cx = self._renderer._currentChunkX || 0;
                    var cz = self._renderer._currentChunkZ || 0;
                    cx += d[0];
                    cz += d[1];
                    self._renderer.setCurrentChunk(cx, cz);
                    if (self._renderer.regenerateTerrain) {
                        self._renderer.regenerateTerrain();
                    }
                });
            })(navIds[i], navMap[navIds[i]]);
        }

        // Chunk grid expand/contract buttons
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

        // Generation options checkboxes
        var optIds = ['opt-caves', 'opt-ores', 'opt-water', 'opt-surface'];
        for (var k = 0; k < optIds.length; k++) {
            var optEl = document.getElementById(optIds[k]);
            if (optEl) {
                optEl.addEventListener('change', function () {
                    if (self._renderer && self._renderer.setOptions) {
                        self._renderer.setOptions(self._getOptions());
                    }
                });
            }
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
        } catch (e) { /* ignore */ }
    };

    /**
     * Save UI state to localStorage.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._saveState = function () {
        try {
            var state = {
                worldSeed: this._getSeed(),
                options: this._getOptions()
            };
            localStorage.setItem('donkeycraft_terrain_ui_state', JSON.stringify(state));
        } catch (e) { /* ignore */ }
    };

    // ============================================================
    // Stats Display
    // ============================================================

    /**
     * Update the stats display.
     * @private
     */
    Donkeycraft.TerrainDebugUI.prototype._updateStatsDisplay = function () {
        if (!this._renderer) return;

        var statsEl = document.getElementById('ui-stats');
        if (statsEl) {
            var chunkCount = this._renderer.getChunkCount ? this._renderer.getChunkCount() : 0;
            var fps = this._renderer.getCurrentFps ? this._renderer.getCurrentFps() : 0;
            var genTime = this._renderer.getGenerationTime ? this._renderer.getGenerationTime() : 0;

            var statsText = 'Chunks: ' + chunkCount;
            if (genTime > 0) {
                statsText += ' | Gen Time: ' + genTime.toFixed(1) + 'ms';
            }
            statsEl.textContent = statsText;
        }

        var fpsEl = document.getElementById('ui-fps');
        if (fpsEl && fps > 0) {
            fpsEl.textContent = 'FPS: ' + fps;
        }

        // Update chunk position display
        var chunkPosEl = document.getElementById('ui-chunk-pos');
        if (chunkPosEl && this._renderer._currentChunkX !== undefined) {
            chunkPosEl.textContent = 'CX=' + this._renderer._currentChunkX + ' CZ=' + this._renderer._currentChunkZ;
        }
    };

})();