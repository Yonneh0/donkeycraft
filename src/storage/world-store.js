// Donkeycraft — World Store
// IndexedDB world storage: save chunks, load chunks, world info.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Default database name.
     */
    Donkeycraft.WORLD_STORE_DB_NAME = 'donkeycraft-worlds';
    Donkeycraft.WORLD_STORE_VERSION = 1;
    Donkeycraft.WORLD_STORE_STORE_NAME = 'worlds';

    /**
     * WorldStore — IndexedDB-based world storage for saving and loading worlds.
     * @param {string} [dbName=donkeycraft-worlds] — IndexedDB database name.
     */
    Donkeycraft.WorldStore = function(dbName) {
        this._dbName = dbName || Donkeycraft.WORLD_STORE_DB_NAME;
        this._db = null;
        this._ready = false;
        this._chunkManager = null;
        this._eventBus = null;
    };

    /**
     * Set the chunk manager reference for automatic chunk saving.
     * @param {Donkeycraft.ChunkManager} chunkManager — Chunk manager instance.
     */
    Donkeycraft.WorldStore.prototype.setChunkManager = function(chunkManager) {
        this._chunkManager = chunkManager;
    };

    /**
     * Set the event bus for storage events.
     * @param {Donkeycraft.EventBus} eventBus — Event bus instance.
     */
    Donkeycraft.WorldStore.prototype.setEventBus = function(eventBus) {
        this._eventBus = eventBus;
    };

    /**
     * _emit — emit an event with storage context.
     * @private
     * @param {string} eventName - Event name.
     * @param {Object} data - Event payload.
     */
    Donkeycraft.WorldStore.prototype._emit = function(eventName, data) {
        if (this._eventBus) {
            this._eventBus.emit(eventName, data);
        }
    };

    /**
     * Initialize the IndexedDB database and create object stores.
     * @returns {Promise<boolean>} Resolves true when DB is ready.
     */
    Donkeycraft.WorldStore.prototype.init = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            try {
                var request = indexedDB.open(self._dbName, Donkeycraft.WORLD_STORE_VERSION);

                request.onerror = function() {
                    self._ready = false;
                    self._emit('storage:error', { error: new Error('Failed to open world database') });
                    resolve(false); // Graceful fallback
                };

                request.onsuccess = function() {
                    self._db = request.result;
                    self._ready = true;
                    self._emit('storage:ready', {});
                    resolve(true);
                };

                request.onupgradeneeded = function(event) {
                    var db = event.target.result;
                    // Create object store for worlds if it doesn't exist
                    if (!db.objectStoreNames.contains(Donkeycraft.WORLD_STORE_STORE_NAME)) {
                        db.createObjectStore(Donkeycraft.WORLD_STORE_STORE_NAME, { keyPath: 'worldName' });
                    }
                };
            } catch (e) {
                self._ready = false;
                self._emit('storage:error', { error: e });
                resolve(false); // Graceful fallback
            }
        });
    };

    /**
     * Check if the store is ready (database opened successfully).
     * @returns {boolean} True if ready.
     */
    Donkeycraft.WorldStore.prototype.isReady = function() {
        return this._ready && !!this._db;
    };

    /**
     * Save a world's level data and chunks to IndexedDB.
     * @param {string} worldName — World name/identifier.
     * @param {Object} levelData — Serialized level data (spawn, game mode, time, seed).
     * @param {Array} chunks — Array of {cx, cz, blockData, skyLight, blockLight} objects.
     * @returns {Promise<boolean>} Resolves true on success.
     */
    Donkeycraft.WorldStore.prototype.saveWorld = function(worldName, levelData, chunks) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.WORLD_STORE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);

                var data = {
                    worldName: worldName,
                    levelData: levelData,
                    chunks: chunks || [],
                    savedAt: Date.now()
                };

                var request = store.put(data);

                request.onsuccess = function() {
                    self._emit('world:saved', { worldName: worldName });
                    resolve(true);
                };

                request.onerror = function() {
                    self._emit('world:save-error', { worldName: worldName, error: 'Save failed' });
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    };

    /**
     * Load a world's level data and chunks from IndexedDB.
     * @param {string} worldName — World name/identifier.
     * @returns {Promise<Object|null>} Resolves with {levelData, chunks} or null if not found.
     */
    Donkeycraft.WorldStore.prototype.loadWorld = function(worldName) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(null);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.WORLD_STORE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
                var request = store.get(worldName);

                request.onsuccess = function() {
                    if (request.result) {
                        self._emit('world:loaded', { worldName: worldName });
                        resolve({
                            levelData: request.result.levelData || {},
                            chunks: request.result.chunks || [],
                            savedAt: request.result.savedAt || 0
                        });
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = function() {
                    self._emit('world:load-error', { worldName: worldName, error: 'Load failed' });
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    };

    /**
     * Delete a world from IndexedDB.
     * @param {string} worldName — World name/identifier.
     * @returns {Promise<boolean>} Resolves true if deleted.
     */
    Donkeycraft.WorldStore.prototype.deleteWorld = function(worldName) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.WORLD_STORE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
                var request = store.delete(worldName);

                request.onsuccess = function() {
                    self._emit('world:deleted', { worldName: worldName });
                    resolve(true);
                };

                request.onerror = function() {
                    self._emit('world:delete-error', { worldName: worldName, error: 'Delete failed' });
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    };

    /**
     * List all saved world names.
     * @returns {Promise<Array<string>>} Array of world name strings.
     */
    Donkeycraft.WorldStore.prototype.listWorlds = function() {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve([]);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.WORLD_STORE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
                var request = store.openCursor();
                var worlds = [];

                request.onsuccess = function(event) {
                    var cursor = event.target.result;
                    if (cursor) {
                        worlds.push(cursor.value.worldName);
                        cursor.continue();
                    } else {
                        self._emit('worlds:listed', { count: worlds.length });
                        resolve(worlds);
                    }
                };

                request.onerror = function() {
                    resolve(worlds);
                };
            } catch (e) {
                resolve([]);
            }
        });
    };

    /**
     * Save a single chunk to the specified world.
     * @param {string} worldName — World name.
     * @param {number} cx — Chunk X coordinate.
     * @param {number} cz — Chunk Z coordinate.
     * @param {Object} chunkData — Chunk data {blockData, skyLight, blockLight}.
     * @returns {Promise<boolean>} Resolves true on success.
     */
    Donkeycraft.WorldStore.prototype.saveChunk = function(worldName, cx, cz, chunkData) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        // Load existing world data, add chunk, save back
        return self.loadWorld(worldName).then(function(worldData) {
            if (!worldData) {
                // Create new world entry
                worldData = { levelData: {}, chunks: [], savedAt: 0 };
            }

            // Find and update or add chunk
            var found = false;
            for (var i = 0; i < worldData.chunks.length; i++) {
                if (worldData.chunks[i].cx === cx && worldData.chunks[i].cz === cz) {
                    worldData.chunks[i] = { cx: cx, cz: cz, data: chunkData };
                    found = true;
                    break;
                }
            }
            if (!found) {
                worldData.chunks.push({ cx: cx, cz: cz, data: chunkData });
            }

            return self.saveWorld(worldName, worldData.levelData, worldData.chunks);
        });
    };

    /**
     * Load a single chunk from the specified world.
     * @param {string} worldName — World name.
     * @param {number} cx — Chunk X coordinate.
     * @param {number} cz — Chunk Z coordinate.
     * @returns {Promise<Object|null>} Resolves with chunk data or null.
     */
    Donkeycraft.WorldStore.prototype.loadChunk = function(worldName, cx, cz) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(null);
        }

        return self.loadWorld(worldName).then(function(worldData) {
            if (!worldData || !worldData.chunks) {
                return null;
            }

            for (var i = 0; i < worldData.chunks.length; i++) {
                if (worldData.chunks[i].cx === cx && worldData.chunks[i].cz === cz) {
                    return worldData.chunks[i].data || null;
                }
            }
            return null;
        });
    };

    /**
     * Get the level data for a world.
     * @param {string} worldName — World name.
     * @returns {Promise<Object|null>} Resolves with level data or null.
     */
    Donkeycraft.WorldStore.prototype.getLevelData = function(worldName) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(null);
        }

        return self.loadWorld(worldName).then(function(worldData) {
            if (worldData && worldData.levelData) {
                return worldData.levelData;
            }
            return null;
        });
    };

    /**
     * Set/Update the level data for a world.
     * @param {string} worldName — World name.
     * @param {Object} levelData — Level data object.
     * @returns {Promise<boolean>} Resolves true on success.
     */
    Donkeycraft.WorldStore.prototype.setLevelData = function(worldName, levelData) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        return self.loadWorld(worldName).then(function(worldData) {
            if (!worldData) {
                worldData = { levelData: {}, chunks: [] };
            }
            worldData.levelData = levelData;
            return self.saveWorld(worldName, levelData, worldData.chunks);
        });
    };

    /**
     * Save all dirty chunks from the chunk manager.
     * @param {string} worldName — World name.
     * @returns {Promise<number>} Number of chunks saved.
     */
    Donkeycraft.WorldStore.prototype.saveDirtyChunks = function(worldName) {
        var self = this;
        if (!this._chunkManager || !this.isReady()) {
            return Promise.resolve(0);
        }

        var dirtyChunks = this._chunkManager.getDirtyChunks();
        var savedCount = 0;
        var promises = [];

        for (var i = 0; i < dirtyChunks.length; i++) {
            var chunk = dirtyChunks[i];
            if (chunk && !chunk.isDirty()) {
                continue;
            }

            var cx = chunk.chunkX;
            var cz = chunk.chunkZ;
            var chunkData = {
                blockData: chunk.getBlockData ? chunk.getBlockData() : null,
                skyLight: chunk.getSkyLight ? chunk.getSkyLight(0, 0, 0) : 0,
                blockLight: chunk.getBlockLight ? chunk.getBlockLight(0, 0, 0) : 0
            };

            promises.push(
                self.saveChunk(worldName, cx, cz, chunkData).then(function(success) {
                    if (success) savedCount++;
                })
            );
        }

        return Promise.all(promises).then(function() {
            // Mark all as clean
            for (var j = 0; j < dirtyChunks.length; j++) {
                if (dirtyChunks[j]) {
                    dirtyChunks[j].markClean();
                }
            }
            self._emit('chunks:saved', { worldName: worldName, count: savedCount });
            return savedCount;
        });
    };

    /**
     * Close the IndexedDB connection.
     */
    Donkeycraft.WorldStore.prototype.destroy = function() {
        if (this._db) {
            this._db.close();
            this._db = null;
        }
        this._ready = false;
        this._chunkManager = null;
        this._eventBus = null;
        this._emit('storage:closed', {});
    };

})();