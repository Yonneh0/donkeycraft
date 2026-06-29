// Donkeycraft — Debug Overlay (F3)
// Collects F3 debug data and emits via EventBus for display by the main game overlay.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * DebugOverlay — collects debug data and renders it to the F3 debug DOM overlay.
     * @param {Object} eventBus - The global EventBus instance.
     * @param {Object} [config=null] - Donkeycraft.Config for constants.
     */
    Donkeycraft.DebugOverlay = function(eventBus, config) {
        this._eventBus = eventBus;
        this._config = config || Donkeycraft.Config;

        // FPS tracking
        this._fps = 0;
        this._frameCount = 0;
        this._lastFpsUpdate = 0;

        // Timer reference (set via setTimer)
        this._timer = null;

        // Player reference (set via update)
        this._player = null;

        // Chunk manager reference (set via update)
        this._chunkManager = null;

        // Biome reference (set via update)
        this._biome = null;

        // Game mode (set via setGameMode)
        this._gameMode = 'survival';

        // Wireframe renderer reference (set via setWireframeRenderer)
        this._wireframeRenderer = null;

        // DOM element reference
        this._element = null;

        // Listeners for timer render events
        this._unsubscribeRender = null;

        // One-time init: grab the DOM element
        this._initDOM();
    };

    /**
     * _initDOM — caches a reference to the debug overlay DOM element.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._initDOM = function() {
        this._element = document.getElementById('dk-debug-overlay');
    };

    /**
     * setTimer — sets a reference to the Timer instance for delta time access.
     * Accepts any object with a getDeltaTime() method (duck typing).
     * @param {Object} [timer=null] - Donkeycraft.Timer instance or compatible duck-typed object.
     */
    Donkeycraft.DebugOverlay.prototype.setTimer = function(timer) {
        this._timer = timer;
    };

    /**
     * setPlayer — sets a reference to the player entity.
     * @param {Donkeycraft.Player} player - Player instance.
     */
    Donkeycraft.DebugOverlay.prototype.setPlayer = function(player) {
        this._player = player;
    };

    /**
     * setChunkManager — sets a reference to the chunk manager.
     * @param {Object} chunkManager - ChunkManager instance.
     */
    Donkeycraft.DebugOverlay.prototype.setChunkManager = function(chunkManager) {
        this._chunkManager = chunkManager;
    };

    /**
     * setBiome — sets a reference to the biome definitions.
     * @param {Object} biome - Biome module with getBiomeAt(chunkX, chunkZ) method.
     */
    Donkeycraft.DebugOverlay.prototype.setBiome = function(biome) {
        this._biome = biome;
    };

    /**
     * setGameMode — sets the current game mode string.
     * @param {string} mode - Game mode ('survival', 'creative', 'spectator').
     */
    Donkeycraft.DebugOverlay.prototype.setGameMode = function(mode) {
        this._gameMode = mode || 'survival';
    };

    /**
     * setTerrainRenderer — sets a reference to the terrain renderer for rendering stats.
     * @param {Object} terrainRenderer - TerrainRenderer instance with getRenderStats() method.
     */
    Donkeycraft.DebugOverlay.prototype.setTerrainRenderer = function(terrainRenderer) {
        this._terrainRenderer = terrainRenderer || null;
    };

    /**
     * setWireframeRenderer — sets a reference to the wireframe renderer.
     * @param {Object} wireframeRenderer - WireframeRenderer instance.
     */
    Donkeycraft.DebugOverlay.prototype.setWireframeRenderer = function(wireframeRenderer) {
        this._wireframeRenderer = wireframeRenderer || null;
    };

    /**
     * getFPS — gets the current FPS value.
     * @returns {number}
     */
    Donkeycraft.DebugOverlay.prototype.getFPS = function() {
        return this._fps;
    };

    /**
     * setFPS — sets the FPS value directly.
     * @param {number} fps - FPS count.
     */
    Donkeycraft.DebugOverlay.prototype.setFPS = function(fps) {
        this._fps = Math.max(0, Math.round(fps));
    };

    /**
     * getChunkInfo — gets chunk-related debug data.
     * @returns {Object} Chunk information.
     */
    Donkeycraft.DebugOverlay.prototype.getChunkInfo = function() {
        if (!this._chunkManager) {
            return { loaded: 0, renderDistance: 8 };
        }

        var renderDist = 8; // Default fallback
        try {
            if (this._config && typeof this._config.RENDER_DISTANCE === 'number') {
                renderDist = this._config.RENDER_DISTANCE;
            }
        } catch (e) {}

        // Count loaded chunks
        var loaded = 0;
        try {
            var chunks = this._chunkManager.getAllChunks ? this._chunkManager.getAllChunks() : [];
            loaded = chunks.length;
        } catch (e) {}

        return {
            loaded: loaded,
            renderDistance: renderDist
        };
    };

    /**
     * getPlayerCoords — gets player position and rotation data.
     * Uses the Player API: getPosition() returns Vector3, getRotation() returns {yaw, pitch}.
     * Each access is independently try/catched so one failure does not suppress others.
     * @returns {{x: number, y: number, z: number, pitch: number, yaw: number, mode: string}}
     */
    Donkeycraft.DebugOverlay.prototype.getPlayerCoords = function() {
        var x = 0, y = 0, z = 0;
        var pitch = 0, yaw = 0;
        var mode = this._gameMode;

        if (this._player) {
            // getPosition() returns a Vector3 with .x, .y, .z properties.
            try {
                var pos = this._player.getPosition ? this._player.getPosition() : null;
                if (pos) {
                    x = typeof pos.x === 'number' ? pos.x : 0;
                    y = typeof pos.y === 'number' ? pos.y : 0;
                    z = typeof pos.z === 'number' ? pos.z : 0;
                }
            } catch (e) {}

            // getRotation() returns { yaw: number, pitch: number } in radians.
            try {
                var rot = this._player.getRotation ? this._player.getRotation() : null;
                if (rot) {
                    yaw = typeof rot.yaw === 'number' ? rot.yaw : 0;
                    pitch = typeof rot.pitch === 'number' ? rot.pitch : 0;
                }
            } catch (e) {}

            try {
                mode = this._player.getGameMode ? this._player.getGameMode() : 'survival';
            } catch (e) {}
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
    Donkeycraft.DebugOverlay.prototype.getBiomeName = function() {
        if (!this._biome || !this._player) return 'Unknown';

        var px = 0, pz = 0;
        try {
            var pos = this._player.getPosition ? this._player.getPosition() : null;
            if (pos) {
                px = typeof pos.x === 'number' ? pos.x : 0;
                pz = typeof pos.z === 'number' ? pos.z : 0;
            }
        } catch (e) {
            return 'Unknown';
        }

        // Convert world coordinates to chunk coordinates (floor division).
        var chunkX = Math.floor(px / Donkeycraft.Config.CHUNK_SIZE);
        var chunkZ = Math.floor(pz / Donkeycraft.Config.CHUNK_SIZE);

        if (!this._biome.getBiomeAt) return 'Unknown';

        try {
            var biome = this._biome.getBiomeAt(chunkX, chunkZ);
            return biome && biome.name ? biome.name : 'Unknown';
        } catch (e) {
            return 'Unknown';
        }
    };

    /**
     * getGameMode — gets the current game mode string.
     * @returns {string}
     */
    Donkeycraft.DebugOverlay.prototype.getGameMode = function() {
        if (this._player && this._player.getGameMode) {
            try { return this._player.getGameMode(); } catch (e) {}
        }
        return this._gameMode;
    };

    /**
     * getLightLevels — gets sky light and block light levels at the player's block position.
     * Uses getPosition() to read world coordinates, then queries the chunk for light data.
     * @returns {{sky: number, block: number}} Sky and block light values (0-15).
     */
    Donkeycraft.DebugOverlay.prototype.getLightLevels = function() {
        var skyLight = 15; // Default: full daylight
        var blockLight = 0;

        if (this._player && this._chunkManager) {
            try {
                var pos = this._player.getPosition ? this._player.getPosition() : null;
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
                    } catch (e) {}
                }
            } catch (e) {}
        }

        return {
            sky: Math.max(0, Math.min(15, skyLight)),
            block: Math.max(0, Math.min(15, blockLight))
        };
    };

    /**
     * collectData — collects all debug data into a single object.
     * Uses internal references only (does not mutate state from arguments).
     * If optional game/chunkManager are passed, they are used locally without side effects.
     * @param {Donkeycraft.Player} [player=null] - Optional player override (does not persist).
     * @param {Object} [chunkManager=null] - Optional chunk manager override (does not persist).
     * @returns {Object} Complete debug data object.
     */
    Donkeycraft.DebugOverlay.prototype.collectData = function(player, chunkManager) {
        // Use passed arguments locally without mutating internal state
        var localPlayer = player || this._player;
        var localChunkManager = chunkManager || this._chunkManager;

        // Temporarily swap references for helper methods that use this._game/this._chunkManager
        var savedPlayer = this._player;
        var savedChunkManager = this._chunkManager;
        var swapped = false;

        if (localPlayer !== this._player || localChunkManager !== this._chunkManager) {
            this._player = localPlayer;
            this._chunkManager = localChunkManager;
            swapped = true;
        }

        try {
            var coords = this.getPlayerCoords();
            var chunkInfo = this.getChunkInfo();
            var lightLevels = this.getLightLevels();
            var biomeName = this.getBiomeName();
            var gameMode = this.getGameMode();

            // Get wireframe status
            var wireframeEnabled = false;
            var showBedrock = true;
            var showClouds = true;
            var showSolidBlocks = true;
            if (this._wireframeRenderer) {
                try {
                    wireframeEnabled = this._wireframeRenderer._enabled || false;
                    showBedrock = this._wireframeRenderer._showBedrock !== false;
                    showClouds = this._wireframeRenderer._showClouds !== false;
                    showSolidBlocks = this._wireframeRenderer._showSolidBlocks !== false;
                } catch (e) {}
            }

            // Get terrain renderer stats
            var renderStats = { chunksRendered: 0, meshesBuilt: 0, drawCalls: 0 };
            if (this._terrainRenderer) {
                try {
                    var stats = this._terrainRenderer.getRenderStats && this._terrainRenderer.getRenderStats();
                    if (stats) {
                        renderStats.chunksRendered = stats.chunksRendered || 0;
                        renderStats.meshesBuilt = stats.meshesBuilt || 0;
                        renderStats.drawCalls = stats.drawCalls || 0;
                    }
                } catch (e) {}
            }

            return {
                fps: this._getFPS(),
                coordinates: coords,
                chunkInfo: chunkInfo,
                lightLevels: lightLevels,
                biome: biomeName,
                gameMode: gameMode,
                deltaTime: this._getDeltaTime(),
                wireframeEnabled: wireframeEnabled,
                wireframeShowBedrock: showBedrock,
                wireframeShowClouds: showClouds,
                wireframeShowSolidBlocks: showSolidBlocks,
                renderStats: renderStats
            };
        } finally {
            // Always restore original references, even if an exception occurred
            if (swapped) {
                this._player = savedPlayer;
                this._chunkManager = savedChunkManager;
            }
        }
    };

    /**
     * _getDeltaTime — gets delta time from the timer reference.
     * Uses duck typing: any object with a getDeltaTime() method is accepted.
     * @returns {number} Delta time in seconds, or 0 if unavailable.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getDeltaTime = function() {
        if (this._timer) {
            try {
                if (typeof this._timer.getDeltaTime === 'function') {
                    var dt = this._timer.getDeltaTime();
                    return (typeof dt === 'number' && dt >= 0) ? dt : 0;
                }
            } catch (e) {}
        }
        return 0;
    };

    /**
     * _getFPS — gets the current FPS from the Timer instance.
     * Falls back to the internal FPS counter if Timer is unavailable.
     * @returns {number} Current FPS count.
     * @private
     */
    Donkeycraft.DebugOverlay.prototype._getFPS = function() {
        // Prefer Timer's FPS counter (most accurate, uses performance.now).
        if (this._timer) {
            try {
                if (typeof this._timer.getFPS === 'function') {
                    var fps = this._timer.getFPS();
                    return (typeof fps === 'number' && fps >= 0) ? fps : 0;
                }
            } catch (e) {}
        }
        // Fallback to internal FPS counter (render-frame based).
        return this._fps;
    };

    /**
     * _renderDOM — renders debug data as HTML into the overlay element.
     * @private
     * @param {Object} data - Complete debug data object from collectData().
     */
    Donkeycraft.DebugOverlay.prototype._renderDOM = function(data) {
        if (!this._element) return;

        var coords = data.coordinates;
        var chunkInfo = data.chunkInfo;
        var light = data.lightLevels;
        var renderStats = data.renderStats || { chunksRendered: 0, meshesBuilt: 0, drawCalls: 0 };

        // Build section lines
        var lines = [];

        // Section 1: Version / FPS
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Donkeycraft</span> <span class="dk-debug-value">' + data.fps + ' fps</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Delta:</span> <span class="dk-debug-value">' + data.deltaTime.toFixed(3) + 's</span></span>');
        lines.push('</div>');

        // Section 2: Position & Rotation
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Position</span> <span class="dk-debug-value">X: ' + coords.x + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Y:</span> <span class="dk-debug-value">' + coords.y + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Z:</span> <span class="dk-debug-value">' + coords.z + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Yaw</span> <span class="dk-debug-value">: ' + coords.yaw + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Pitch</span> <span class="dk-debug-value">: ' + coords.pitch + '</span></span>');
        lines.push('</div>');

        // Section 3: Chunk & Biome
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Biome</span> <span class="dk-debug-value">: ' + data.biome + '</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Chunk</span> <span class="dk-debug-value">: ' + chunkInfo.loaded + ' loaded</span></span>');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Render dist</span> <span class="dk-debug-value">: ' + chunkInfo.renderDistance + '</span></span>');
        lines.push('</div>');

        // Section 4: Light levels
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Light</span> <span class="dk-debug-value">Sky: ' + light.sky + ' Block: ' + light.block + '</span></span>');
        lines.push('</div>');

        // Section 5: Render stats (chunks, meshes, draw calls)
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Render</span> <span class="dk-debug-value">' + renderStats.chunksRendered + ' chunks, ' + renderStats.meshesBuilt + ' meshes, ' + renderStats.drawCalls + ' calls</span></span>');
        lines.push('</div>');

        // Section 7: Wireframe debug info (if wireframe renderer is active)
        if (data.wireframeEnabled) {
            lines.push('<div class="dk-debug-section">');
            lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Wireframe</span> <span class="dk-debug-value">ON</span></span>');
            lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Bedrock</span> <span class="dk-debug-value">' + (data.wireframeShowBedrock ? 'show' : 'hide') + '</span></span>');
            lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Clouds</span> <span class="dk-debug-value">' + (data.wireframeShowClouds ? 'show' : 'hide') + '</span></span>');
            lines.push('<span class="dk-debug-line"><span class="dk-debug-label">  Solid</span> <span class="dk-debug-value">' + (data.wireframeShowSolidBlocks ? 'show' : 'hide') + '</span></span>');
            lines.push('</div>');
        }

        // Section 8: Game mode
        lines.push('<div class="dk-debug-section">');
        lines.push('<span class="dk-debug-line"><span class="dk-debug-label">Mode</span> <span class="dk-debug-value">' + data.gameMode + '</span></span>');
        lines.push('</div>');

        this._element.innerHTML = lines.join('\n');
    };

    /**
     * update — updates all data, renders DOM, and emits a debug event.
     * @param {Donkeycraft.Player} player - Player instance.
     * @param {Object} chunkManager - ChunkManager instance.
     */
    Donkeycraft.DebugOverlay.prototype.update = function(player, chunkManager) {
        var data = this.collectData(player, chunkManager);

        // Render directly to DOM
        this._renderDOM(data);

        // Also emit debug event for any external consumers
        if (this._eventBus) {
            try {
                this._eventBus.emit('debug:update', data);
            } catch (e) {}
        }
    };

    /**
     * startListening — starts auto-updating on each render frame.
     * FPS counter increments each frame and updates every 1000ms.
     * The first FPS sample waits a full second from the first frame so early
     * frames do not produce a misleading spike.
     * Note: The FPS value emitted in collectData() may be 1 frame behind
     * because the FPS calculation happens before data collection in the render loop.
     */
    Donkeycraft.DebugOverlay.prototype.startListening = function() {
        if (this._unsubscribeRender) return;

        var self = this;
        if (this._timer) {
            try {
                this._unsubscribeRender = this._timer.onRender(function(timestamp) {
                    // Update FPS counter
                    self._frameCount++;

                    // Initialize the baseline timestamp on first frame only.
                    // Using a flag ensures we do not accidentally reset on the first
                    // 1000 ms boundary when _lastFpsUpdate happens to be 0.
                    if (!self._fpsBaselineSet) {
                        self._lastFpsUpdate = timestamp;
                        self._fpsBaselineSet = true;
                    }

                    if (timestamp - self._lastFpsUpdate >= 1000) {
                        self._fps = self._frameCount;
                        self._frameCount = 0;
                        self._lastFpsUpdate = timestamp;
                    }

                    // Update debug data
                    if (self._player && self._chunkManager) {
                        self.update(self._player, self._chunkManager);
                    }
                });
            } catch (e) {}
        }
    };

    /**
     * stopListening — stops auto-updating.
     */
    Donkeycraft.DebugOverlay.prototype.stopListening = function() {
        if (this._unsubscribeRender) {
            try { this._unsubscribeRender(); } catch (e) {}
            this._unsubscribeRender = null;
        }
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.DebugOverlay.prototype.destroy = function() {
        this.stopListening();
        this._eventBus = null;
        this._config = null;
        this._player = null;
        this._chunkManager = null;
        this._biome = null;
        this._wireframeRenderer = null;
        this._timer = null;
    };

})();