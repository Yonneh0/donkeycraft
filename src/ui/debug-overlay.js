// Donkeycraft — Debug Overlay (F3)
// Collects F3 debug data and emits via EventBus for display by the main game overlay.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * DebugOverlay — collects and tracks debug information for the F3 debug screen.
     * Does NOT render DOM — data is emitted via EventBus for the main game to display.
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

        // Listeners for timer render events
        this._unsubscribeRender = null;
    };

    /**
     * setTimer — sets a reference to the Timer instance for delta time access.
     * @param {Object} timer - Donkeycraft.Timer instance.
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
     * @param {Object} biome - Biome module with getBiomeAt method.
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
            return { loaded: 0, renderDistance: 0 };
        }

        var renderDist = 0;
        try {
            renderDist = this._config.RENDER_DISTANCE || 8;
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
     * @returns {Object} Position, rotation, and mode data.
     */
    Donkeycraft.DebugOverlay.prototype.getPlayerCoords = function() {
        var x = 0, y = 0, z = 0;
        var pitch = 0, yaw = 0;
        var mode = this._gameMode;

        if (this._player) {
            try {
                x = this._player.getX ? this._player.getX() : 0;
                y = this._player.getY ? this._player.getY() : 0;
                z = this._player.getZ ? this._player.getZ() : 0;
                pitch = this._player.getPitch ? this._player.getPitch() : 0;
                yaw = this._player.getYaw ? this._player.getYaw() : 0;
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
     * getBiomeName — gets the current biome name.
     * @returns {string}
     */
    Donkeycraft.DebugOverlay.prototype.getBiomeName = function() {
        if (!this._biome || !this._player) return 'Unknown';

        try {
            var x = this._player.getX ? this._player.getX() : 0;
            var z = this._player.getZ ? this._player.getZ() : 0;
            var biome = this._biome.getBiomeAt ? this._biome.getBiomeAt(x, z) : null;
            return biome ? biome.name : 'Unknown';
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
     * getLightLevels — gets sky and block light levels at player position.
     * @returns {Object} Sky light and block light values (0-15).
     */
    Donkeycraft.DebugOverlay.prototype.getLightLevels = function() {
        var skyLight = 15; // Default: full daylight
        var blockLight = 0;

        if (this._player && this._chunkManager) {
            try {
                var x = Math.floor(this._player.getX ? this._player.getX() : 0);
                var y = Math.floor(this._player.getY ? this._player.getY() : 0);
                var z = Math.floor(this._player.getZ ? this._player.getZ() : 0);

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
     * If optional player/chunkManager are passed, they are used locally without side effects.
     * @param {Donkeycraft.Player} [player=null] - Optional player override (does not persist).
     * @param {Object} [chunkManager=null] - Optional chunk manager override (does not persist).
     * @returns {Object} Complete debug data object.
     */
    Donkeycraft.DebugOverlay.prototype.collectData = function(player, chunkManager) {
        // Use passed arguments locally without mutating internal state
        var localPlayer = player || this._player;
        var localChunkManager = chunkManager || this._chunkManager;

        // Temporarily swap references for helper methods that use this._player/this._chunkManager
        var savedPlayer = this._player;
        var savedChunkManager = this._chunkManager;
        if (localPlayer !== this._player) {
            this._player = localPlayer;
        }
        if (localChunkManager !== this._chunkManager) {
            this._chunkManager = localChunkManager;
        }

        var coords = this.getPlayerCoords();
        var chunkInfo = this.getChunkInfo();
        var lightLevels = this.getLightLevels();
        var biomeName = this.getBiomeName();
        var gameMode = this.getGameMode();

        // Restore original references
        this._player = savedPlayer;
        this._chunkManager = savedChunkManager;

        // Delta time
        var deltaTime = 0;
        if (this._timer) {
            try { deltaTime = this._timer.getDeltaTime ? this._timer.getDeltaTime() : 0; } catch (e) {}
        }

        return {
            fps: this._fps,
            coordinates: coords,
            chunkInfo: chunkInfo,
            lightLevels: lightLevels,
            biome: biomeName,
            gameMode: gameMode,
            deltaTime: deltaTime
        };
    };

    /**
     * update — updates all data and emits a debug event.
     * @param {Donkeycraft.Player} player - Player instance.
     * @param {Object} chunkManager - ChunkManager instance.
     */
    Donkeycraft.DebugOverlay.prototype.update = function(player, chunkManager) {
        var data = this.collectData(player, chunkManager);

        // Emit debug event for the main game to consume
        if (this._eventBus) {
            try {
                this._eventBus.emit('debug:update', data);
            } catch (e) {}
        }
    };

    /**
     * startListening — starts auto-updating on each render frame.
     */
    Donkeycraft.DebugOverlay.prototype.startListening = function() {
        if (this._unsubscribeRender) return;

        var self = this;
        if (this._timer) {
            try {
                this._unsubscribeRender = this._timer.onRender(function(timestamp) {
                    // Update FPS counter
                    self._frameCount++;
                    if (!self._lastFpsUpdate) self._lastFpsUpdate = timestamp;

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
        this._timer = null;
    };

})();