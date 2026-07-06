// Donkeycraft — Debug Overlay (F3)
// Collects F3 debug data and emits via EventBus for display by the main game overlay.
// @module DebugOverlay

(function () {
    'use strict';

    const Donkeycraft = window.Donkeycraft;

    /**
     * DebugOverlay — collects debug data and renders it to the F3 debug DOM overlay.
     *
     * Displays real-time game information including FPS, player coordinates, chunk stats,
     * light levels, biome info, and renderer toggles.
     *
     * Toggle visibility with the F3 key. Renderer checkboxes are interactive and call
     * Game.setRendererVisibility() on change.
     *
     * @constructor
     * @param {Object} eventBus - The global EventBus instance.
     * @param {Object} [config=null] - Donkeycraft.Config for constants.
     */
    Donkeycraft.DebugOverlay = function (eventBus, config) {
        this._eventBus = eventBus;
        this._config = config || Donkeycraft.Config;

        // FPS tracking
        this._fps = 0;
        this._frameCount = 0;
        this._lastFpsUpdate = 0;
        this._fpsBaselineSet = false;

        // Timer reference (set via setTimer)
        this._timer = null;

        // Player reference (set via setPlayer)
        this._player = null;

        // Chunk manager reference (set via setChunkManager)
        this._chunkManager = null;

        // Biome reference (set via setBiome)
        this._biome = null;

        // Game mode (set via setGameMode)
        this._gameMode = 'survival';

        // Terrain renderer reference (set via setTerrainRenderer)
        this._terrainRenderer = null;

        // Game instance reference (set via setGame for renderer toggle access)
        this._game = null;

        // DOM element reference
        this._element = null;

        /** 
         * @private 
         * @type {Object}
         */
        this._cache = {
            fps: null,
            deltaTime: null,
            coords: {}, // x, y, z, yaw, pitch
            biome: null,
            chunkLoaded: null,
            renderDist: null,
            lightSky: null,
            lightBlock: null,
            renderStats: { chunks: null, meshes: null, calls: null },
            gameMode: null,
            toggles: {} // key -> input element
        };

        // One-time flag: has the DOM structure been built?
        this._domBuilt = false;

        // Unsubscribe for render events (startListening)
        this._unsubscribeRender = null;

        // Debug terrain toggle button reference
        this._terrainToggleBtn = null;
    };

    // ============================================================
    // Public API
    // ============================================================

    /**
     * _ensureDOM — caches a reference to the debug overlay DOM element and builds structure.
     * Called lazily on first data collection to ensure the element exists.
     * @private
     * @returns {boolean} True if the element was found and built.
     */
    Donkeycraft.DebugOverlay.prototype._ensureDOM = function () {
        if (this._domBuilt) return true;

        this._element = document.getElementById('dk-debug-overlay');
        if (!this._element) {
            Donkeycraft.Logger.warn('DebugOverlay', 'DOM element #dk-debug-overlay not found');
            return false;
        }

        // Build the initial DOM structure once to avoid innerHTML every frame
        this._buildDOM();

        this._domBuilt = true;
        return true;
    };

    /**
     * _buildDOM — creates the static HTML structure for the debug overlay and caches references.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._buildDOM = function () {
        const el = this._element;
        el.innerHTML = `
            <div class="dk-debug-section">
                <span class="dk-debug-line"><span class="dk-debug-label">Donkeycraft</span> <span class="dk-debug-value fps-val">0 fps</span></span>
                <span class="dk-debug-line"><span class="dk-debug-label">Delta:</span> <span class="dk-debug-value dt-val">0.000s</span></span>
            </div>
            <div class="dk-debug-section">
                <span class="dk-debug-line"><span class="dk-debug-label">Position</span></span>
                <span class="dk-debug-line"><span class="dk-debug-label">  X:</span> <span class="dk-debug-value x-val">0</span></span>
                <span class="dk-debug-line"><span class="dk-debug-label">  Y:</span> <span class="dk-debug-value y-val">0</span></span>
                <span class="dk-debug-line"><span class="dk-debug-label">  Z:</span> <span class="dk-debug-value z-val">0</span></span>
                <span class="dk-debug-line"><span class="dk-debug-label">Yaw</span> <span class="dk-debug-value yaw-val">0</span></span>
                <span class="dk-debug-line"><span class="dk-debug-label">Pitch</span> <span class="dk-debug-value pitch-val">0</span></span>
            </div>
            <div class="dk-debug-section">
                <span class="dk-debug-line"><span class="dk-debug-label">Biome</span> <span class="dk-debug-value biome-val">Unknown</span></span>
                <span class="dk-debug-line"><span class="dk-debug-label">Chunk</span> <span class="dk-debug-value chunk-loaded-val">0 loaded</span></span>
                <span class="dk-debug-line"><span class="dk-debug-label">Render dist</span> <span class="dk-debug-value rd-val">8</span></span>
            </div>
            <div class="dk-debug-section">
                <span class="dk-debug-line"><span class="dk-debug-label">Light</span> <span class="dk-debug-value light-val">Sky: 15 Block: 0</span></span>
            </div>
            <div class="dk-debug-section">
                <span class="dk-debug-line"><span class="dk-debug-label">Render</span> <span class="dk-debug-value render-stats-val">0 chunks, 0 meshes, 0 calls</span></span>
            </div>
            <div class="dk-debug-section">
                <span class="dk-debug-line"><span class="dk-debug-label">Mode</span> <span class="dk-debug-value mode-val">survival</span></span>
            </div>
            <div class="dk-debug-section dk-renderer-toggles">
                <span class="dk-debug-line"><span class="dk-debug-label">Renderers</span></span>
            </div>
            <div class="dk-debug-section dk-debug-controls">
                <span class="dk-debug-line"><span class="dk-debug-label">Debug Controls</span></span>
            </div>
        `;

        // Cache references to elements that change frequently
        this._cache.fps = el.querySelector('.fps-val');
        this._cache.deltaTime = el.querySelector('.dt-val');
        this._cache.coords.x = el.querySelector('.x-val');
        this._cache.coords.y = el.querySelector('.y-val');
        this._cache.coords.z = el.querySelector('.z-val');
        this._cache.coords.yaw = el.querySelector('.yaw-val');
        this._cache.coords.pitch = el.querySelector('.pitch-val');
        this._cache.biome = el.querySelector('.biome-val');
        this._cache.chunkLoaded = el.querySelector('.chunk-loaded-val');
        this._cache.renderDist = el.querySelector('.rd-val');
        this._cache.lightSpan = el.querySelector('.light-val');
        this._cache.renderStatsText = el.querySelector('.render-stats-val');
        this._cache.gameMode = el.querySelector('.mode-val');

        // Renderer toggle keys in display order
        const rendererKeys = ['sky', 'terrain', 'water', 'particles', 'hand', 'weather', 'gui', 'entity'];
        const togglesContainer = el.querySelector('.dk-renderer-toggles');

        for (let _i = 0; _i < rendererKeys.length; _i++) {
            const key = rendererKeys[_i];
            const line = document.createElement('span');
            line.className = 'dk-debug-line dk-toggle-line';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'dk-renderer-toggle';
            checkbox.dataset.renderer = key;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'dk-debug-value';
            labelSpan.textContent = key.charAt(0).toUpperCase() + key.slice(1);

            line.appendChild(checkbox);
            line.appendChild(labelSpan);
            togglesContainer.appendChild(line);

            this._cache.toggles[key] = checkbox;
        }

        // Build debug controls button groups
        this._buildDebugControls();
    };

    /**
     * _buildDebugControls — creates the stat manipulation button groups in the debug overlay.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._buildDebugControls = function () {
        const el = this._element;
        if (!el) return;

        const controlsContainer = el.querySelector('.dk-debug-controls');
        if (!controlsContainer) return;

        // Define stat control groups with labels and button configs
        const self = this;
        const statGroups = [
            {
                label: 'Health',
                buttons: [
                    { label: 'FULL', action: 'health', args: 'full' },
                    { label: '+5', action: 'health', args: 5 },
                    { label: '+1', action: 'health', args: 1 },
                    { label: '-1', action: 'health', args: -1 },
                    { label: '-5', action: 'health', args: -5 },
                    { label: 'EMPTY', action: 'health', args: 'empty' }
                ]
            },
            {
                label: 'Hunger',
                buttons: [
                    { label: 'FULL', action: 'hunger', args: 'full' },
                    { label: '+5', action: 'hunger', args: 5 },
                    { label: '+1', action: 'hunger', args: 1 },
                    { label: '-1', action: 'hunger', args: -1 },
                    { label: '-5', action: 'hunger', args: -5 },
                    { label: 'EMPTY', action: 'hunger', args: 'empty' }
                ]
            },
            {
                label: 'Hydration',
                buttons: [
                    { label: 'FULL', action: 'hydration', args: 'full' },
                    { label: '+5', action: 'hydration', args: 5 },
                    { label: '+1', action: 'hydration', args: 1 },
                    { label: '-1', action: 'hydration', args: -1 },
                    { label: '-5', action: 'hydration', args: -5 },
                    { label: 'EMPTY', action: 'hydration', args: 'empty' }
                ]
            },
            {
                label: 'Stamina',
                buttons: [
                    { label: 'FULL(100)', action: 'stamina', args: 'full' },
                    { label: '+10', action: 'stamina', args: 10 },
                    { label: '+5', action: 'stamina', args: 5 },
                    { label: '+1', action: 'stamina', args: 1 },
                    { label: '-1', action: 'stamina', args: -1 },
                    { label: '-5', action: 'stamina', args: -5 },
                    { label: 'EMPTY', action: 'stamina', args: 'empty' }
                ]
            },
            {
                label: 'Mana',
                buttons: [
                    { label: 'FULL(100)', action: 'mana', args: 'full' },
                    { label: '+10', action: 'mana', args: 10 },
                    { label: '+5', action: 'mana', args: 5 },
                    { label: '+1', action: 'mana', args: 1 },
                    { label: '-1', action: 'mana', args: -1 },
                    { label: '-5', action: 'mana', args: -5 },
                    { label: 'EMPTY', action: 'mana', args: 'empty' }
                ]
            },
            {
                label: 'XP Points',
                buttons: [
                    { label: 'RESET', action: 'xpPoints', args: 'reset' },
                    { label: '+1', action: 'xpPoints', args: 1 },
                    { label: '+10', action: 'xpPoints', args: 10 },
                    { label: '+750', action: 'xpPoints', args: 750 },
                    { label: '+10K', action: 'xpPoints', args: 10000 },
                    { label: '+250K', action: 'xpPoints', args: 250000 },
                    { label: '+1M', action: 'xpPoints', args: 1000000 },
                    { label: '+50M', action: 'xpPoints', args: 50000000 }
                ]
            },
            {
                label: 'XP Level',
                buttons: [
                    { label: 'RESET', action: 'level', args: 'reset' },
                    { label: '+1', action: 'level', args: 1 },
                    { label: '+10', action: 'level', args: 10 }
                ]
            }
        ];

        // Build each stat group
        for (let g = 0; g < statGroups.length; g++) {
            const group = statGroups[g];

            // Section label
            const labelLine = document.createElement('span');
            labelLine.className = 'dk-debug-line dk-ctrl-label';
            labelLine.textContent = group.label + ':';
            controlsContainer.appendChild(labelLine);

            // Button row
            const row = document.createElement('div');
            row.className = 'dk-debug-btn-row';
            for (let b = 0; b < group.buttons.length; b++) {
                const btnData = group.buttons[b];
                const btn = document.createElement('button');
                btn.className = 'dk-debug-ctrl-btn';
                btn.textContent = btnData.label;

                // Add CSS class for first and last buttons
                if (b === 0 || b === group.buttons.length - 1) {
                    btn.classList.add('dk-debug-ctrl-btn-special');
                }

                btn.setAttribute('data-action', btnData.action);
                if (btnData.args) {
                    btn.setAttribute('data-args', JSON.stringify(btnData.args));
                }
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._onDebugControlClick(this.getAttribute('data-action'), this.getAttribute('data-args'));
                });
                row.appendChild(btn);
            }
            controlsContainer.appendChild(row);
        }

        // Add debug terrain toggle button after stat groups
        this._buildDebugTerrainToggle();
    };

    /**
     * _buildDebugTerrainToggle — creates the debug terrain generator toggle button.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._buildDebugTerrainToggle = function () {
        var el = this._element;
        if (!el) return;

        var controlsContainer = el.querySelector('.dk-debug-controls');
        if (!controlsContainer) return;

        // Section label for debug terrain
        var terrainLabelLine = document.createElement('span');
        terrainLabelLine.className = 'dk-debug-line dk-ctrl-label';
        terrainLabelLine.textContent = 'Debug Terrain:';
        controlsContainer.appendChild(terrainLabelLine);

        // Toggle button row
        var terrainRow = document.createElement('div');
        terrainRow.className = 'dk-debug-btn-row';

        this._terrainToggleBtn = document.createElement('button');
        this._terrainToggleBtn.className = 'dk-debug-terrain-toggle';
        this._terrainToggleBtn.textContent = 'OFF';
        this._terrainToggleBtn.addEventListener('click', (function (self) {
            return function (e) {
                e.preventDefault();
                e.stopPropagation();
                self._onDebugTerrainToggle();
            };
        })(this));

        terrainRow.appendChild(this._terrainToggleBtn);
        controlsContainer.appendChild(terrainRow);
    };

    /**
     * setTimer — sets a reference to the Timer instance for delta time access.
     * @param {Object} [timer=null] - Donkeycraft.Timer instance or compatible object.
     */
    Donkeycraft.DebugOverlay.prototype.setTimer = function (timer) {
        this._timer = timer || null;
    };

    /**
     * setPlayer — sets a reference to the player entity.
     * @param {Object} [player=null] - Donkeycraft.Player instance or null.
     */
    Donkeycraft.DebugOverlay.prototype.setPlayer = function (player) {
        this._player = player || null;
    };

    /**
     * setChunkManager — sets a reference to the chunk manager.
     * @param {Object} [chunkManager=null] - ChunkManager instance or null.
     */
    Donkeycraft.DebugOverlay.prototype.setChunkManager = function (chunkManager) {
        this._chunkManager = chunkManager || null;
    };

    /**
     * setBiome — sets a reference to the biome definitions.
     * @param {Object} [biome=null] - Biome module with getBiomeAt(chunkX, chunkZ).
     */
    Donkeycraft.DebugOverlay.prototype.setBiome = function (biome) {
        this._biome = biome || null;
    };

    /**
     * setGameMode — sets the current game mode string.
     * @param {string} [mode='survival'] - Game mode ('survival', 'creative', 'spectator').
     */
    Donkeycraft.DebugOverlay.prototype.setGameMode = function (mode) {
        this._gameMode = mode || 'survival';
    };

    /**
     * setTerrainRenderer — sets a reference to the terrain renderer for rendering stats.
     * @param {Object} [renderer=null] - TerrainRenderer instance with getRenderStats() method.
     */
    Donkeycraft.DebugOverlay.prototype.setTerrainRenderer = function (renderer) {
        this._terrainRenderer = renderer || null;
    };

    /**
     * setGame — sets a reference to the Game instance for renderer toggle access.
     * @param {Object} [game=null] - Game instance with getRendererVisibility/setRendererVisibility methods.
     */
    Donkeycraft.DebugOverlay.prototype.setGame = function (game) {
        this._game = game || null;
    };

    /**
     * getFPS — gets the current FPS value.
     * @returns {number}
     */
    Donkeycraft.DebugOverlay.prototype.getFPS = function () {
        return this._fps;
    };

    /**
     * setFPS — sets the FPS value directly.
     * @param {number} fps - FPS count.
     */
    Donkeycraft.DebugOverlay.prototype.setFPS = function (fps) {
        this._fps = Math.max(0, Math.round(fps));
    };

    /**
     * getChunkInfo — gets chunk-related debug data.
     * @returns {{ loaded: number, renderDistance: number }} Chunk information.
     */
    Donkeycraft.DebugOverlay.prototype.getChunkInfo = function () {
        let renderDist = 8;
        try {
            if (this._config && typeof this._config.RENDER_DISTANCE === 'number') {
                renderDist = this._config.RENDER_DISTANCE;
            }
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', `Failed to read RENDER_DISTANCE: ${e.message}`);
        }

        let loaded = 0;
        try {
            if (this._chunkManager && typeof this._chunkManager.getAllChunks === 'function') {
                const chunks = this._chunkManager.getAllChunks();
                loaded = Array.isArray(chunks) ? chunks.length : 0;
            }
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', `Failed to count chunks: ${e.message}`);
        }

        return { loaded, renderDistance: renderDist };
    };

    /**
     * getPlayerCoords — gets player position and rotation data.
     * @returns {{ x: number, y: number, z: number, pitch: number, yaw: number, mode: string }}
     */
    Donkeycraft.DebugOverlay.prototype.getPlayerCoords = function () {
        let x = 0, y = 0, z = 0;
        let pitch = 0, yaw = 0;
        let mode = this._gameMode;

        if (this._player) {
            try {
                const pos = this._player.getPosition && this._player.getPosition();
                if (pos) {
                    x = typeof pos.x === 'number' ? pos.x : 0;
                    y = typeof pos.y === 'number' ? pos.y : 0;
                    z = typeof pos.z === 'number' ? pos.z : 0;
                }
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to read player position: ${e.message}`);
            }

            try {
                const rot = this._player.getRotation && this._player.getRotation();
                if (rot) {
                    yaw = typeof rot.yaw === 'number' ? rot.yaw : 0;
                    pitch = typeof rot.pitch === 'number' ? rot.pitch : 0;
                }
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to read player rotation: ${e.message}`);
            }

            try {
                mode = this._player.getGameMode ? this._player.getGameMode() : 'survival';
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to read game mode: ${e.message}`);
            }
        }

        return {
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
            z: Math.round(z * 100) / 100,
            pitch: Math.round(pitch * 100) / 100,
            yaw: Math.round(yaw * 100) / 100,
            mode: mode
        };
    };

    /**
     * getBiomeName — gets the current biome name at the player's chunk position.
     * @returns {string} Biome name or 'Unknown'.
     */
    Donkeycraft.DebugOverlay.prototype.getBiomeName = function () {
        if (!this._biome || !this._player) return 'Unknown';

        let px = 0, pz = 0;
        try {
            const pos = this._player.getPosition && this._player.getPosition();
            if (!pos) return 'Unknown';
            px = typeof pos.x === 'number' ? pos.x : 0;
            pz = typeof pos.z === 'number' ? pos.z : 0;
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', `Failed to read player position for biome: ${e.message}`);
            return 'Unknown';
        }

        const chunkSize = Donkeycraft.Config && Donkeycraft.Config.CHUNK_SIZE ? Donkeycraft.Config.CHUNK_SIZE : 16;
        const chunkX = Math.floor(px / chunkSize);
        const chunkZ = Math.floor(pz / chunkSize);

        if (!this._biome.getBiomeAt) return 'Unknown';

        try {
            const biome = this._biome.getBiomeAt(chunkX, chunkZ);
            return (biome && biome.name) ? biome.name : 'Unknown';
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', `Failed to get biome: ${e.message}`);
            return 'Unknown';
        }
    };

    /**
     * getGameMode — gets the current game mode string.
     * @returns {string}
     */
    Donkeycraft.DebugOverlay.prototype.getGameMode = function () {
        if (this._player && typeof this._player.getGameMode === 'function') {
            try { return this._player.getGameMode(); } catch (e) { Donkeycraft.Logger.warn('DebugOverlay', `Failed to get game mode: ${e.message}`); }
        }
        return this._gameMode;
    };

    /**
     * getLightLevels — gets sky light and block light levels at the player's position.
     * @returns {{ sky: number, block: number }} Sky and block light values (0-15).
     */
    Donkeycraft.DebugOverlay.prototype.getLightLevels = function () {
        let skyLight = 15;
        let blockLight = 0;

        if (this._player && this._chunkManager) {
            try {
                const pos = this._player.getPosition && this._player.getPosition();
                if (!pos) return { sky: skyLight, block: blockLight };

                const x = Math.floor(typeof pos.x === 'number' ? pos.x : 0);
                const y = Math.floor(typeof pos.y === 'number' ? pos.y : 0);
                const z = Math.floor(typeof pos.z === 'number' ? pos.z : 0);

                const chunkX = Math.floor(x / 16);
                const chunkZ = Math.floor(z / 16);
                const localX = ((x % 16) + 16) % 16;
                const localY = ((y % 256) + 256) % 256;
                const localZ = ((z % 16) + 16) % 16;

                const chunk = this._chunkManager.getChunk ? this._chunkManager.getChunk(chunkX, chunkZ) : null;
                if (chunk && typeof chunk.getSkyLight === 'function') {
                    skyLight = Math.max(0, Math.min(15, chunk.getSkyLight(localX, localY, localZ)));
                    blockLight = Math.max(0, Math.min(15, chunk.getBlockLight ? chunk.getBlockLight(localX, localY, localZ) : 0));
                }
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to read light levels: ${e.message}`);
            }
        }

        return { sky: skyLight, block: blockLight };
    };

    /**
     * getRenderStats — gets terrain renderer statistics.
     * @returns {{ chunksRendered: number, meshesBuilt: number, drawCalls: number }}
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getRenderStats = function () {
        const stats = { chunksRendered: 0, meshesBuilt: 0, drawCalls: 0 };
        if (!this._terrainRenderer) return stats;

        try {
            const raw = this._terrainRenderer.getRenderStats && this._terrainRenderer.getRenderStats();
            if (raw) {
                stats.chunksRendered = typeof raw.chunksRendered === 'number' ? raw.chunksRendered : 0;
                stats.meshesBuilt = typeof raw.meshesBuilt === 'number' ? raw.meshesBuilt : 0;
                stats.drawCalls = typeof raw.drawCalls === 'number' ? raw.drawCalls : 0;
            }
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', `Failed to get render stats: ${e.message}`);
        }

        return stats;
    };

    /**
     * _getRendererToggles — gets renderer visibility toggles from the Game instance.
     * @returns {{ sky: boolean, terrain: boolean, particles: boolean, hand: boolean, weather: boolean, gui: boolean }}
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getRendererToggles = function () {
        const toggles = {};
        if (!this._game || typeof this._game.getRendererVisibility !== 'function') return toggles;

        const keys = ['sky', 'terrain', 'water', 'particles', 'hand', 'weather', 'gui', 'entity'];
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            try {
                toggles[key] = this._game.getRendererVisibility(key);
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to read renderer toggle "${key}": ${e.message}`);
                toggles[key] = true;
            }
        }
        return toggles;
    };

    /**
     * collectData — collects all debug data into a single object.
     * @returns {Object} Complete debug data object.
     */
    Donkeycraft.DebugOverlay.prototype.collectData = function () {
        const coords = this.getPlayerCoords();
        const chunkInfo = this.getChunkInfo();
        const lightLevels = this.getLightLevels();
        const biomeName = this.getBiomeName();
        const gameMode = this.getGameMode();
        const renderStats = this._getRenderStats();
        const renderers = this._getRendererToggles();

        return {
            fps: this._getFPS(),
            coordinates: coords,
            chunkInfo: chunkInfo,
            lightLevels: lightLevels,
            biome: biomeName,
            gameMode: gameMode,
            deltaTime: this._getDeltaTime(),
            renderStats: renderStats,
            renderers: renderers
        };
    };

    /**
     * _getDeltaTime — gets delta time from the timer reference.
     * @returns {number} Delta time in seconds.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getDeltaTime = function () {
        if (this._timer && typeof this._timer.getDeltaTime === 'function') {
            try {
                const dt = this._timer.getDeltaTime();
                return (typeof dt === 'number' && dt >= 0) ? dt : 0;
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to get delta time: ${e.message}`);
            }
        }
        return 0;
    };

    /**
     * _getFPS — gets the current FPS from the Timer instance or internal counter.
     * @returns {number} Current FPS count.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getFPS = function () {
        if (this._timer && typeof this._timer.getFPS === 'function') {
            try {
                const fps = this._timer.getFPS();
                return (typeof fps === 'number' && fps >= 0) ? fps : 0;
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to get FPS from timer: ${e.message}`);
            }
        }
        return this._fps;
    };

    /**
     * _escapeHtml — escapes special HTML characters.
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._escapeHtml = function (str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * _renderDOM — updates the DOM with current debug data using cached elements.
     * @private
     * @param {Object} data - Complete debug data object from collectData().
     */
    Donkeycraft.DebugOverlay.prototype._renderDOM = function (data) {
        if (!this._ensureDOM() || !this._element) return;

        // Update simple text values via cached elements
        this._cache.fps.textContent = `${this._escapeHtml(String(data.fps))} fps`;
        this._cache.deltaTime.textContent = `${data.deltaTime.toFixed(3)}s`;

        const c = data.coordinates;
        this._cache.coords.x.textContent = this._escapeHtml(String(c.x));
        this._cache.coords.y.textContent = this._escapeHtml(String(c.y));
        this._cache.coords.z.textContent = this._escapeHtml(String(c.z));
        this._cache.coords.yaw.textContent = `: ${this._escapeHtml(String(c.yaw))}`;
        this._cache.coords.pitch.textContent = `: ${this._escapeHtml(String(c.pitch))}`;

        this._cache.biome.textContent = this._escapeHtml(data.biome);
        this._cache.chunkLoaded.textContent = `${this._escapeHtml(String(data.chunkInfo.loaded))} loaded`;
        this._cache.renderDist.textContent = this._escapeHtml(String(data.chunkInfo.renderDistance));

        this._cache.lightSpan.textContent = `Sky: ${this._escapeHtml(String(data.lightLevels.sky))} Block: ${this._escapeHtml(String(data.lightLevels.block))}`;

        const rs = data.renderStats;
        this._cache.renderStatsText.textContent = `${this._escapeHtml(String(rs.chunksRendered))} chunks, ${this._escapeHtml(String(rs.meshesBuilt))} meshes, ${this._escapeHtml(String(rs.drawCalls))} calls`;

        this._cache.gameMode.textContent = this._escapeHtml(data.gameMode);

        // Update Renderer Toggles (checkboxes)
        for (const key in data.renderers) {
            if (this._cache.toggles[key]) {
                const isChecked = data.renderers[key];
                if (this._cache.toggles[key].checked !== isChecked) {
                    this._cache.toggles[key].checked = isChecked;
                }
            }
        }
    };

    /**
     * update — updates all data, renders DOM, and emits a debug event.
     * @param {Object} [player] - Optional player override.
     * @param {Object} [chunkManager] - Optional chunk manager override.
     */
    Donkeycraft.DebugOverlay.prototype.update = function (player, chunkManager) {
        if (!this._ensureDOM()) return;

        const data = this.collectData();
        this._renderDOM(data);

        if (this._eventBus) {
            try {
                this._eventBus.emit('debug:update', data);
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to emit debug:update event: ${e.message}`);
            }
        }
    };

    /**
     * startListening — starts auto-updating on each render frame.
     */
    Donkeycraft.DebugOverlay.prototype.startListening = function () {
        if (this._unsubscribeRender) return;

        const self = this;
        if (this._timer && typeof this._timer.onRender === 'function') {
            try {
                this._unsubscribeRender = this._timer.onRender((timestamp) => {
                    self._onRenderFrame(timestamp);
                });
                return;
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to subscribe to timer.onRender: ${e.message}`);
            }
        }

        try {
            let rafId = requestAnimationFrame((ts) => self._onRenderFrame(ts));
            const loop = (ts) => {
                rafId = requestAnimationFrame(loop);
                self._onRenderFrame(ts);
            };
            this._unsubscribeRender = () => cancelAnimationFrame(rafId);
        } catch (e) {
            Donkeycraft.Logger.error('DebugOverlay', `Failed to start render loop: ${e.message}`);
        }
    };

    /**
     * _onRenderFrame — internal callback for FPS counting and debug updates.
     * @private
     * @param {number} timestamp - High-resolution timestamp in ms.
     */
    Donkeycraft.DebugOverlay.prototype._onRenderFrame = function (timestamp) {
        this._frameCount++;

        if (!this._fpsBaselineSet) {
            this._lastFpsUpdate = timestamp;
            this._fpsBaselineSet = true;
            return;
        }

        if (timestamp - this._lastFpsUpdate >= 1000) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._lastFpsUpdate = timestamp;
        }

        if (this._player && this._chunkManager) {
            this.update(this._player, this._chunkManager);
        }
    };

    /**
     * _onDebugControlClick — handles clicks on debug control buttons.
     * Modifies player stats (health, hunger, hydration, stamina, XP, level) with proper clamping.
     * @private
     * @param {string} action - The stat to modify ('health', 'hunger', 'hydration', 'stamina', 'xpPoints', 'level').
     * @param {string|number} args - The argument: a number for +/-, or 'full'/'empty'/'reset'.
     */
    Donkeycraft.DebugOverlay.prototype._onDebugControlClick = function (action, args) {
        var self2 = this;

        // Helper: get the Player instance (global or via game) — Player is the single source of truth for vitals
        var player = null;
        try {
            if (typeof Donkeycraft !== 'undefined' && Donkeycraft._playerInstance) {
                player = Donkeycraft._playerInstance;
            } else if (window._dkGame && window._dkGame._player) {
                player = window._dkGame._player;
            }
        } catch (e) { }

        // Helper: get the Hunger instance (global or via game)
        var hunger = null;
        try {
            if (typeof Donkeycraft !== 'undefined' && Donkeycraft._hungerSystem) {
                hunger = Donkeycraft._hungerSystem;
            } else if (window._dkGame && window._dkGame._hungerSystem) {
                hunger = window._dkGame._hungerSystem;
            }
        } catch (e) { }

        // Helper: get the Experience instance (global or via game)
        var xp = null;
        try {
            if (typeof Donkeycraft !== 'undefined' && Donkeycraft._xpInstance) {
                xp = Donkeycraft._xpInstance;
            } else if (window._dkGame && window._dkGame._player && window._dkGame._player.experience) {
                xp = window._dkGame._player.experience;
            }
        } catch (e) { }

        // Helper: trigger a debug overlay refresh
        var refreshDebug = function () {
            if (self2._player && self2._chunkManager) {
                self2.update(self2._player, self2._chunkManager);
            }
        };

        // Helper: parse args — JSON string → object, or number directly
        var parsedArgs = args;
        try {
            if (typeof args === 'string' && args !== '' && args !== 'full' && args !== 'empty' && args !== 'reset') {
                parsedArgs = JSON.parse(args);
            }
        } catch (e) {
            parsedArgs = args;
        }

        switch (action) {
            case 'health': {
                if (!player) { Donkeycraft.Logger.warn('DebugOverlay', 'Player not available'); break; }
                var currentHealth = player.getHealth() !== undefined ? player.getHealth() : 20;
                var newHealth = currentHealth;

                if (parsedArgs === 'full') {
                    // Debug: set to arbitrary high value for testing
                    newHealth = 9999;
                } else if (parsedArgs === 'empty') {
                    newHealth = -9999;
                } else if (typeof parsedArgs === 'number') {
                    newHealth = currentHealth + parsedArgs;
                }

                // No clamping — debug buttons should allow any value for testing
                newHealth = Math.round(newHealth);

                player.setHealth(newHealth);

                refreshDebug();
                break;
            }

            case 'hunger': {
                if (!hunger) { Donkeycraft.Logger.warn('DebugOverlay', 'Hunger system not available'); break; }
                var currentFood = hunger.getFoodLevel();
                var newFood = currentFood;

                if (parsedArgs === 'full') {
                    // Debug: set to arbitrary high value for testing
                    newFood = 9999;
                } else if (parsedArgs === 'empty') {
                    newFood = -9999;
                } else if (typeof parsedArgs === 'number') {
                    newFood = currentFood + parsedArgs;
                }

                // No clamping — debug buttons should allow any value for testing
                newFood = Math.round(newFood);

                hunger.setFoodLevel(newFood);
                refreshDebug();
                break;
            }

            case 'hydration': {
                if (!hunger) { Donkeycraft.Logger.warn('DebugOverlay', 'Hunger system not available'); break; }
                var currentHydration = hunger.getHydration();
                var newHydration = currentHydration;

                if (parsedArgs === 'full') {
                    // Debug: set to arbitrary high value for testing
                    newHydration = 9999;
                } else if (parsedArgs === 'empty') {
                    newHydration = -9999;
                } else if (typeof parsedArgs === 'number') {
                    newHydration = currentHydration + parsedArgs;
                }

                // No clamping — debug buttons should allow any value for testing
                newHydration = Math.round(newHydration * 10) / 10;

                hunger.setHydration(newHydration);
                refreshDebug();
                break;
            }

            case 'stamina': {
                if (!player) { Donkeycraft.Logger.warn('DebugOverlay', 'Player not available'); break; }
                var currentAbs = player.getStamina();
                var newAbs = currentAbs;

                if (parsedArgs === 'full') {
                    // Debug: set to arbitrary high value for testing
                    newAbs = 9999;
                } else if (parsedArgs === 'empty') {
                    newAbs = -9999;
                } else if (typeof parsedArgs === 'number') {
                    newAbs = currentAbs + parsedArgs;
                }

                // No clamping — debug buttons should allow any value for testing
                newAbs = Math.round(newAbs);

                player.setStamina(newAbs);
                refreshDebug();
                break;
            }

            case 'mana': {
                if (!player) { Donkeycraft.Logger.warn('DebugOverlay', 'Player not available'); break; }
                var currentMana = player.getMana();
                var newMana = currentMana;

                if (parsedArgs === 'full') {
                    // Debug: set to arbitrary high value for testing
                    newMana = 9999;
                } else if (parsedArgs === 'empty') {
                    newMana = -9999;
                } else if (typeof parsedArgs === 'number') {
                    newMana = currentMana + parsedArgs;
                }

                // No clamping — debug buttons should allow any value for testing
                newMana = Math.round(newMana);

                player.setMana(newMana);
                refreshDebug();
                break;
            }

            case 'xpPoints': {
                if (!xp) { Donkeycraft.Logger.warn('DebugOverlay', 'Experience system not available'); break; }

                if (parsedArgs === 'reset') {
                    // Reset points to 0, keep level as-is
                    xp.setPoints(0);
                } else if (typeof parsedArgs === 'number' && parsedArgs > 0) {
                    // Add XP — the experience system handles clamping at max level
                    xp.addXP(parsedArgs);
                }
                refreshDebug();
                break;
            }

            case 'level': {
                if (!xp) { Donkeycraft.Logger.warn('DebugOverlay', 'Experience system not available'); break; }

                if (parsedArgs === 'reset') {
                    // Reset to level 1 with 0 XP points
                    xp.setLevelToZero(1);
                } else if (typeof parsedArgs === 'number' && parsedArgs > 0) {
                    // Set level — the experience system handles clamping to [1, MAX_LEVEL]
                    xp.setLevel(xp.getLevel() + parsedArgs);
                }
                refreshDebug();
                break;
            }

            default:
                Donkeycraft.Logger.warn('DebugOverlay', 'Unknown debug control action: ' + action);
        }
    };

    /**
     * _onDebugTerrainToggle — handles clicks on the debug terrain toggle button.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._onDebugTerrainToggle = function () {
        var self = this;
        try {
            if (!Donkeycraft.DebugTerrainGenerator) {
                Donkeycraft.Logger.warn('DebugOverlay', 'DebugTerrainGenerator not available');
                return;
            }

            var isActive = Donkeycraft.DebugTerrainGenerator.isDebugTerrainActive();
            var success = Donkeycraft.DebugTerrainGenerator.toggle(!isActive);

            if (success && this._terrainToggleBtn) {
                var newState = Donkeycraft.DebugTerrainGenerator.isDebugTerrainActive();
                this._terrainToggleBtn.textContent = newState ? 'ON' : 'OFF';
                this._terrainToggleBtn.classList.toggle('active', newState);
            }
        } catch (e) {
            Donkeycraft.Logger.error('DebugOverlay', 'Failed to toggle debug terrain: ' + e.message);
        }
    };

    /**
     * stopListening — stops auto-updating.
     */
    Donkeycraft.DebugOverlay.prototype.stopListening = function () {
        if (this._unsubscribeRender) {
            try { this._unsubscribeRender(); } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', `Failed to stop render loop: ${e.message}`);
            }
            this._unsubscribeRender = null;
        }
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.DebugOverlay.prototype.destroy = function () {
        this.stopListening();
        this._eventBus = this._player = this._chunkManager = this._biome =
            this._terrainRenderer = this._timer =
            this._game = this._element = this._terrainToggleBtn = null;
    };

})();