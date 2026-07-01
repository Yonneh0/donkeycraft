// Donkeycraft — Debug Overlay (F3)
// Collects F3 debug data and emits via EventBus for display by the main game overlay.
// @module DebugOverlay

(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * DebugOverlay — collects debug data and renders it to the F3 debug DOM overlay.
     *
     * Displays real-time game information including FPS, player coordinates, chunk stats,
     * light levels, biome info, renderer toggles, and wireframe status.
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

        // Wireframe renderer reference (set via setWireframeRenderer)
        this._wireframeRenderer = null;

        // Terrain renderer reference (set via setTerrainRenderer)
        this._terrainRenderer = null;

        // Game instance reference (set via setGame for renderer toggle access)
        this._game = null;

        // DOM element reference
        this._element = null;

        // One-time flag: has the DOM element been located?
        this._domReady = false;

        // Unsubscribe for render events (startListening)
        this._unsubscribeRender = null;
    };

    // ============================================================
    // Public API
    // ============================================================

    /**
     * _ensureDOM — caches a reference to the debug overlay DOM element.
     * Called lazily on first data collection to ensure the element exists.
     * @private
     * @returns {boolean} True if the element was found.
     */
    Donkeycraft.DebugOverlay.prototype._ensureDOM = function () {
        if (this._domReady) return true;
        this._element = document.getElementById('dk-debug-overlay');
        if (this._element) {
            this._domReady = true;
            return true;
        }
        Donkeycraft.Logger.warn('DebugOverlay', 'DOM element #dk-debug-overlay not found');
        return false;
    };

    /**
     * setTimer — sets a reference to the Timer instance for delta time access.
     * Accepts any object with a getDeltaTime() method (duck typing).
     * @param {Object} [timer=null] - Donkeycraft.Timer instance or compatible duck-typed object.
     */
    Donkeycraft.DebugOverlay.prototype.setTimer = function (timer) {
        this._timer = timer || null;
    };

    /**
     * setPlayer — sets a reference to the player entity.
     * @param {Object} [player=null] - Donkeycraft.Player instance or null to clear.
     */
    Donkeycraft.DebugOverlay.prototype.setPlayer = function (player) {
        this._player = player || null;
    };

    /**
     * setChunkManager — sets a reference to the chunk manager.
     * @param {Object} [chunkManager=null] - ChunkManager instance or null to clear.
     */
    Donkeycraft.DebugOverlay.prototype.setChunkManager = function (chunkManager) {
        this._chunkManager = chunkManager || null;
    };

    /**
     * setBiome — sets a reference to the biome definitions.
     * @param {Object} [biome=null] - Biome module with getBiomeAt(chunkX, chunkZ) method or null.
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
     * setWireframeRenderer — sets a reference to the wireframe renderer.
     * @param {Object} [renderer=null] - WireframeRenderer instance or null.
     */
    Donkeycraft.DebugOverlay.prototype.setWireframeRenderer = function (renderer) {
        this._wireframeRenderer = renderer || null;
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
        var renderDist = 8; // Default fallback
        try {
            if (this._config && typeof this._config.RENDER_DISTANCE === 'number') {
                renderDist = this._config.RENDER_DISTANCE;
            }
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', 'Failed to read RENDER_DISTANCE: ' + e.message);
        }

        // Count loaded chunks
        var loaded = 0;
        try {
            if (this._chunkManager && this._chunkManager.getAllChunks) {
                var chunks = this._chunkManager.getAllChunks();
                loaded = Array.isArray(chunks) ? chunks.length : 0;
            }
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', 'Failed to count chunks: ' + e.message);
        }

        return {
            loaded: loaded,
            renderDistance: renderDist
        };
    };

    /**
     * getPlayerCoords — gets player position and rotation data.
     * Uses the Player API: getPosition() returns Vector3, getRotation() returns {yaw, pitch}.
     * Each access is independently try/catched so one failure does not suppress others.
     * @returns {{ x: number, y: number, z: number, pitch: number, yaw: number, mode: string }}
     */
    Donkeycraft.DebugOverlay.prototype.getPlayerCoords = function () {
        var x = 0, y = 0, z = 0;
        var pitch = 0, yaw = 0;
        var mode = this._gameMode;

        if (this._player) {
            // getPosition() returns a Vector3 with .x, .y, .z properties.
            try {
                var pos = this._player.getPosition && this._player.getPosition();
                if (pos) {
                    x = typeof pos.x === 'number' ? pos.x : 0;
                    y = typeof pos.y === 'number' ? pos.y : 0;
                    z = typeof pos.z === 'number' ? pos.z : 0;
                }
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to read player position: ' + e.message);
            }

            // getRotation() returns { yaw: number, pitch: number } in radians.
            try {
                var rot = this._player.getRotation && this._player.getRotation();
                if (rot) {
                    yaw = typeof rot.yaw === 'number' ? rot.yaw : 0;
                    pitch = typeof rot.pitch === 'number' ? rot.pitch : 0;
                }
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to read player rotation: ' + e.message);
            }

            try {
                mode = this._player.getGameMode ? this._player.getGameMode() : 'survival';
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to read game mode: ' + e.message);
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
     * Uses getPosition() to extract chunk coordinates, then calls biome.getBiomeAt(chunkX, chunkZ).
     * @returns {string} Biome name or 'Unknown' if unavailable.
     */
    Donkeycraft.DebugOverlay.prototype.getBiomeName = function () {
        if (!this._biome || !this._player) return 'Unknown';

        var px = 0, pz = 0;
        try {
            var pos = this._player.getPosition && this._player.getPosition();
            if (!pos) return 'Unknown';
            px = typeof pos.x === 'number' ? pos.x : 0;
            pz = typeof pos.z === 'number' ? pos.z : 0;
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', 'Failed to read player position for biome: ' + e.message);
            return 'Unknown';
        }

        // Convert world coordinates to chunk coordinates (floor division).
        var chunkSize = Donkeycraft.Config && Donkeycraft.Config.CHUNK_SIZE ? Donkeycraft.Config.CHUNK_SIZE : 16;
        var chunkX = Math.floor(px / chunkSize);
        var chunkZ = Math.floor(pz / chunkSize);

        if (!this._biome.getBiomeAt) return 'Unknown';

        try {
            var biome = this._biome.getBiomeAt(chunkX, chunkZ);
            return biome && biome.name ? biome.name : 'Unknown';
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', 'Failed to get biome: ' + e.message);
            return 'Unknown';
        }
    };

    /**
     * getGameMode — gets the current game mode string.
     * @returns {string}
     */
    Donkeycraft.DebugOverlay.prototype.getGameMode = function () {
        if (this._player && this._player.getGameMode) {
            try { return this._player.getGameMode(); } catch (e) { }
        }
        return this._gameMode;
    };

    /**
     * getLightLevels — gets sky light and block light levels at the player's block position.
     * Uses getPosition() to read world coordinates, then queries the chunk for light data.
     * @returns {{ sky: number, block: number }} Sky and block light values (0-15).
     */
    Donkeycraft.DebugOverlay.prototype.getLightLevels = function () {
        var skyLight = 15; // Default: full daylight
        var blockLight = 0;

        if (this._player && this._chunkManager) {
            try {
                var pos = this._player.getPosition && this._player.getPosition();
                if (!pos) return { sky: skyLight, block: blockLight };

                var x = Math.floor(typeof pos.x === 'number' ? pos.x : 0);
                var y = Math.floor(typeof pos.y === 'number' ? pos.y : 0);
                var z = Math.floor(typeof pos.z === 'number' ? pos.z : 0);

                // Get chunk and local coords
                var chunkX = Math.floor(x / 16);
                var chunkZ = Math.floor(z / 16);
                var localX = ((x % 16) + 16) % 16;
                var localY = ((y % 256) + 256) % 256;
                var localZ = ((z % 16) + 16) % 16;

                // Get the chunk
                var chunk = this._chunkManager.getChunk ? this._chunkManager.getChunk(chunkX, chunkZ) : null;
                if (chunk) {
                    try {
                        skyLight = chunk.getSkyLight ? chunk.getSkyLight(localX, localY, localZ) : 15;
                        blockLight = chunk.getBlockLight ? chunk.getBlockLight(localX, localY, localZ) : 0;
                    } catch (e) { }
                }
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to read light levels: ' + e.message);
            }
        }

        return {
            sky: Math.max(0, Math.min(15, skyLight)),
            block: Math.max(0, Math.min(15, blockLight))
        };
    };

    /**
     * getRenderStats — gets terrain renderer statistics.
     * @returns {{ chunksRendered: number, meshesBuilt: number, drawCalls: number }}
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getRenderStats = function () {
        var stats = { chunksRendered: 0, meshesBuilt: 0, drawCalls: 0 };
        if (!this._terrainRenderer) return stats;

        try {
            var raw = this._terrainRenderer.getRenderStats && this._terrainRenderer.getRenderStats();
            if (raw) {
                stats.chunksRendered = typeof raw.chunksRendered === 'number' ? raw.chunksRendered : 0;
                stats.meshesBuilt = typeof raw.meshesBuilt === 'number' ? raw.meshesBuilt : 0;
                stats.drawCalls = typeof raw.drawCalls === 'number' ? raw.drawCalls : 0;
            }
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', 'Failed to get render stats: ' + e.message);
        }

        return stats;
    };

    /**
     * _getWireframeInfo — gets wireframe renderer state.
     * @returns {{ enabled: boolean, showBedrock: boolean, showClouds: boolean, showSolidBlocks: boolean }}
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getWireframeInfo = function () {
        var info = {
            enabled: false,
            showBedrock: true,
            showClouds: true,
            showSolidBlocks: true
        };

        if (!this._wireframeRenderer) return info;

        try {
            info.enabled = this._wireframeRenderer._enabled !== false;
            info.showBedrock = this._wireframeRenderer._showBedrock !== false;
            info.showClouds = this._wireframeRenderer._showClouds !== false;
            info.showSolidBlocks = this._wireframeRenderer._showSolidBlocks !== false;
        } catch (e) {
            Donkeycraft.Logger.warn('DebugOverlay', 'Failed to read wireframe state: ' + e.message);
        }

        return info;
    };

    /**
     * _getRendererToggles — gets renderer visibility toggles from the Game instance.
     * @returns {{ sky: boolean, terrain: boolean, particles: boolean, hand: boolean, weather: boolean, wireframe: boolean, gui: boolean }}
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getRendererToggles = function () {
        var toggles = {};
        if (!this._game || typeof this._game.getRendererVisibility !== 'function') return toggles;

        var keys = ['sky', 'terrain', 'particles', 'hand', 'weather', 'wireframe', 'gui'];
        for (var i = 0; i < keys.length; i++) {
            try {
                toggles[keys[i]] = this._game.getRendererVisibility(keys[i]);
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to read renderer toggle "' + keys[i] + '": ' + e.message);
                toggles[keys[i]] = true; // Default to visible on error
            }
        }
        return toggles;
    };

    /**
     * collectData — collects all debug data into a single object.
     * @returns {{ fps: number, coordinates: Object, chunkInfo: Object, lightLevels: Object, biome: string, gameMode: string, deltaTime: number, wireframeEnabled: boolean, wireframeShowBedrock: boolean, wireframeShowClouds: boolean, wireframeShowSolidBlocks: boolean, renderStats: Object, renderers: Object }}
     */
    Donkeycraft.DebugOverlay.prototype.collectData = function () {
        var coords = this.getPlayerCoords();
        var chunkInfo = this.getChunkInfo();
        var lightLevels = this.getLightLevels();
        var biomeName = this.getBiomeName();
        var gameMode = this.getGameMode();

        // Wireframe info
        var wf = this._getWireframeInfo();

        // Terrain renderer stats
        var renderStats = this._getRenderStats();

        // Renderer visibility toggles
        var renderers = this._getRendererToggles();

        return {
            fps: this._getFPS(),
            coordinates: coords,
            chunkInfo: chunkInfo,
            lightLevels: lightLevels,
            biome: biomeName,
            gameMode: gameMode,
            deltaTime: this._getDeltaTime(),
            wireframeEnabled: wf.enabled,
            wireframeShowBedrock: wf.showBedrock,
            wireframeShowClouds: wf.showClouds,
            wireframeShowSolidBlocks: wf.showSolidBlocks,
            renderStats: renderStats,
            renderers: renderers
        };
    };

    /**
     * _getDeltaTime — gets delta time from the timer reference.
     * Uses duck typing: any object with a getDeltaTime() method is accepted.
     * @returns {number} Delta time in seconds, or 0 if unavailable.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getDeltaTime = function () {
        if (this._timer) {
            try {
                if (typeof this._timer.getDeltaTime === 'function') {
                    var dt = this._timer.getDeltaTime();
                    return (typeof dt === 'number' && dt >= 0) ? dt : 0;
                }
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to get delta time: ' + e.message);
            }
        }
        return 0;
    };

    /**
     * _getFPS — gets the current FPS from the Timer instance.
     * Falls back to the internal FPS counter if Timer is unavailable.
     * @returns {number} Current FPS count.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getFPS = function () {
        // Prefer Timer's FPS counter (most accurate, uses performance.now).
        if (this._timer) {
            try {
                if (typeof this._timer.getFPS === 'function') {
                    var fps = this._timer.getFPS();
                    return (typeof fps === 'number' && fps >= 0) ? fps : 0;
                }
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to get FPS from timer: ' + e.message);
            }
        }
        // Fallback to internal FPS counter (render-frame based).
        return this._fps;
    };

    /**
     * _escapeHtml — escapes special HTML characters to prevent XSS in debug output.
     * @private
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string.
     */
    Donkeycraft.DebugOverlay.prototype._escapeHtml = function (str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&' + 'amp;')
            .replace(/</g, '&' + 'lt;')
            .replace(/>/g, '&' + 'gt;')
            .replace(/"/g, '&' + 'quot;')
            .replace(/'/g, '&' + '#39;');
    };

    /**
     * _renderDOM — renders debug data as HTML into the overlay element.
     * @private
     * @param {Object} data - Complete debug data object from collectData().
     */
    Donkeycraft.DebugOverlay.prototype._renderDOM = function (data) {
        if (!this._ensureDOM() || !this._element) return;

        var coords = data.coordinates;
        var chunkInfo = data.chunkInfo;
        var light = data.lightLevels;
        var renderStats = data.renderStats || { chunksRendered: 0, meshesBuilt: 0, drawCalls: 0 };
        var r = data.renderers || {};

        // Renderer toggle keys in display order
        var rendererKeys = ['sky', 'terrain', 'particles', 'hand', 'weather', 'wireframe', 'gui'];

        // Build section lines array for efficient DOM update
        var lines = [];

        // Section 1: Version / FPS / Delta
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Donkeycraft</span> <span class="dk-debug-value">' + this._escapeHtml(String(data.fps)) + ' fps</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Delta:</span> <span class="dk-debug-value">' + data.deltaTime.toFixed(3) + 's</span></span>');
        lines.push('</div>');

        // Section 2: Position & Rotation
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Position</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  X:</span> <span class="dk-debug-value">' + this._escapeHtml(String(coords.x)) + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Y:</span> <span class="dk-debug-value">' + this._escapeHtml(String(coords.y)) + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Z:</span> <span class="dk-debug-value">' + this._escapeHtml(String(coords.z)) + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Yaw</span> <span class="dk-debug-value">: ' + this._escapeHtml(String(coords.yaw)) + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Pitch</span> <span class="dk-debug-value">: ' + this._escapeHtml(String(coords.pitch)) + '</span></span>');
        lines.push('</div>');

        // Section 3: Chunk & Biome
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Biome</span> <span class="dk-debug-value">: ' + this._escapeHtml(data.biome) + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Chunk</span> <span class="dk-debug-value">: ' + this._escapeHtml(String(chunkInfo.loaded)) + ' loaded</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Render dist</span> <span class="dk-debug-value">: ' + this._escapeHtml(String(chunkInfo.renderDistance)) + '</span></span>');
        lines.push('</div>');

        // Section 4: Light levels
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Light</span> <span class="dk-debug-value">Sky: ' + this._escapeHtml(String(light.sky)) + ' Block: ' + this._escapeHtml(String(light.block)) + '</span></span>');
        lines.push('</div>');

        // Section 5: Render stats (chunks, meshes, draw calls)
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Render</span> <span class="dk-debug-value">' +
            this._escapeHtml(String(renderStats.chunksRendered)) + ' chunks, ' +
            this._escapeHtml(String(renderStats.meshesBuilt)) + ' meshes, ' +
            this._escapeHtml(String(renderStats.drawCalls)) + ' calls</span></span>');
        lines.push('</div>');

        // Section 6: Game mode
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Mode</span> <span class="dk-debug-value">: ' + this._escapeHtml(data.gameMode) + '</span></span>');
        lines.push('</div>');

        // Section 7: Wireframe debug info (if wireframe renderer is active)
        if (data.wireframeEnabled) {
            lines.push('<div class="dk-debug-section">');
            lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Wireframe</span> <span class="dk-debug-value">ON</span></span>');
            lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Bedrock</span> <span class="dk-debug-value">' + this._escapeHtml(data.wireframeShowBedrock ? 'show' : 'hide') + '</span></span>');
            lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Clouds</span> <span class="dk-debug-value">' + this._escapeHtml(data.wireframeShowClouds ? 'show' : 'hide') + '</span></span>');
            lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Solid</span> <span class="dk-debug-value">' + this._escapeHtml(data.wireframeShowSolidBlocks ? 'show' : 'hide') + '</span></span>');
            lines.push('</div>');
        }

        // Section 8: Renderer toggles (interactive checkboxes)
        lines.push('<div class="dk-debug-section dk-renderer-toggles">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Renderers</span></span>');
        for (var i = 0; i < rendererKeys.length; i++) {
            var key = rendererKeys[i];
            var checked = r[key] ? 'checked' : '';
            var label = key.charAt(0).toUpperCase() + key.slice(1);
            lines.push('<span class="dk-debug-line dk-toggle-line"><input type="checkbox" class="dk-renderer-toggle" data-renderer="' + this._escapeHtml(key) + '" ' + checked + '> <span class="dk-debug-value">' + this._escapeHtml(label) + '</span></span>');
        }
        lines.push('</div>');

        this._element.innerHTML = lines.join('\n');
    };

    /**
     * update — updates all data, renders DOM, and emits a debug event.
     * @param {Object} [player] - Optional player override (does not persist internally).
     * @param {Object} [chunkManager] - Optional chunk manager override (does not persist internally).
     */
    Donkeycraft.DebugOverlay.prototype.update = function (player, chunkManager) {
        if (!this._ensureDOM()) return;

        var data = this.collectData();

        // Render directly to DOM
        this._renderDOM(data);

        // Also emit debug event for any external consumers
        if (this._eventBus) {
            try {
                this._eventBus.emit('debug:update', data);
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to emit debug:update event: ' + e.message);
            }
        }
    };

    /**
     * startListening — starts auto-updating on each render frame.
     *
     * FPS counter increments each frame and updates every 1000ms. The first FPS sample
     * waits a full second from the first frame so early frames do not produce a
     * misleading spike.
     *
     * Note: The FPS value emitted in collectData() may be 1 frame behind because the
     * FPS calculation happens before data collection in the render loop.
     */
    Donkeycraft.DebugOverlay.prototype.startListening = function () {
        if (this._unsubscribeRender) return;

        var self = this;

        // Try to get an onRender callback from the timer first.
        if (this._timer && typeof this._timer.onRender === 'function') {
            try {
                this._unsubscribeRender = this._timer.onRender(function (timestamp) {
                    self._onRenderFrame(timestamp);
                });
                return;
            } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to subscribe to timer.onRender: ' + e.message);
            }
        }

        // Fallback: use requestAnimationFrame if timer has no onRender.
        try {
            var rafId = { value: 0 };
            var loop = function (ts) {
                self._onRenderFrame(ts);
                rafId.value = requestAnimationFrame(loop);
            };
            rafId.value = requestAnimationFrame(loop);

            // Return a cleanup function that cancels the rAF.
            this._unsubscribeRender = function () {
                cancelAnimationFrame(rafId.value);
            };
        } catch (e) {
            Donkeycraft.Logger.error('DebugOverlay', 'Failed to start render loop: ' + e.message);
        }
    };

    /**
     * _onRenderFrame — internal callback invoked each render frame for FPS counting and debug updates.
     * @private
     * @param {number} timestamp - High-resolution timestamp in ms.
     */
    Donkeycraft.DebugOverlay.prototype._onRenderFrame = function (timestamp) {
        // Update FPS counter
        this._frameCount++;

        // Initialize the baseline timestamp on first frame only.
        if (!this._fpsBaselineSet) {
            this._lastFpsUpdate = timestamp;
            this._fpsBaselineSet = true;
            return; // Don't update debug data on first frame — wait for first FPS sample
        }

        if (timestamp - this._lastFpsUpdate >= 1000) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._lastFpsUpdate = timestamp;
        }

        // Update debug data using internal references
        if (this._player && this._chunkManager) {
            this.update(this._player, this._chunkManager);
        }
    };

    /**
     * stopListening — stops auto-updating.
     */
    Donkeycraft.DebugOverlay.prototype.stopListening = function () {
        if (this._unsubscribeRender) {
            try { this._unsubscribeRender(); } catch (e) {
                Donkeycraft.Logger.warn('DebugOverlay', 'Failed to stop render loop: ' + e.message);
            }
            this._unsubscribeRender = null;
        }
    };

    /**
     * destroy — cleans up resources. Call when the game is destroyed.
     */
    Donkeycraft.DebugOverlay.prototype.destroy = function () {
        this.stopListening();

        // Null out all references to allow garbage collection
        this._eventBus = null;
        this._config = null;
        this._player = null;
        this._chunkManager = null;
        this._biome = null;
        this._wireframeRenderer = null;
        this._terrainRenderer = null;
        this._timer = null;
        this._game = null;
        this._element = null;
    };

})();