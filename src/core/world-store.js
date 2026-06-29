// Donkeycraft — World Store
// IndexedDB world storage: save chunks, load chunks, world info.
(function () {
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
    Donkeycraft.WorldStore = function (dbName) {
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
    Donkeycraft.WorldStore.prototype.setChunkManager = function (chunkManager) {
        this._chunkManager = chunkManager;
    };

    /**
     * Set the event bus for storage events.
     * @param {Donkeycraft.EventBus} eventBus — Event bus instance.
     */
    Donkeycraft.WorldStore.prototype.setEventBus = function (eventBus) {
        this._eventBus = eventBus;
    };

    /**
     * _emit — emit an event with storage context.
     * @private
     * @param {string} eventName - Event name.
     * @param {Object} data - Event payload.
     */
    Donkeycraft.WorldStore.prototype._emit = function (eventName, data) {
        if (this._eventBus) {
            try {
                this._eventBus.emit(eventName, data);
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Initialize the IndexedDB database and create object stores.
     * @returns {Promise<boolean>} Resolves true when DB is ready.
     */
    Donkeycraft.WorldStore.prototype.init = function () {
        var self = this;
        return new Promise(function (resolve, reject) {
            try {
                var request = indexedDB.open(self._dbName, Donkeycraft.WORLD_STORE_VERSION);

                request.onerror = function () {
                    self._ready = false;
                    self._emit('storage:error', { error: new Error('Failed to open world database') });
                    resolve(false); // Graceful fallback
                };

                request.onsuccess = function () {
                    self._db = request.result;
                    self._ready = true;
                    self._emit('storage:ready', {});
                    resolve(true);
                };

                request.onupgradeneeded = function (event) {
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
    Donkeycraft.WorldStore.prototype.isReady = function () {
        return this._ready && !!this._db;
    };

    /**
     * _normalizeChunks — normalize chunk data to internal format.
     * Handles both old format ({ cx, cz, blockData, skyLight, blockLight }) and new format ({ cx, cz, data: { blockData, skyLight, blockLight } }).
     * Logs warnings for skipped invalid entries to aid debugging data corruption.
     * @private
     * @param {Array} chunks — Raw chunk array from storage.
     * @returns {Array} Normalized chunk array.
     */
    Donkeycraft.WorldStore.prototype._normalizeChunks = function (chunks) {
        if (!chunks || !Array.isArray(chunks)) {
            return [];
        }

        var normalized = [];
        for (var i = 0; i < chunks.length; i++) {
            var c = chunks[i];
            if (c.data && typeof c.data === 'object') {
                // New format: { cx, cz, data: { blockData, skyLight, blockLight } }
                normalized.push({ cx: c.cx, cz: c.cz, data: c.data });
            } else if (c.blockData !== undefined) {
                // Old format: { cx, cz, blockData, skyLight, blockLight }
                normalized.push({
                    cx: c.cx,
                    cz: c.cz,
                    data: {
                        blockData: c.blockData || null,
                        skyLight: c.skyLight || 0,
                        blockLight: c.blockLight || 0
                    }
                });
            } else {
                // Skip invalid entries with warning
                Donkeycraft.Logger.warn('WorldStore', 'Skipping invalid chunk entry at index ' + i + ': ' + JSON.stringify(c).substring(0, 120));
            }
        }
        return normalized;
    };

    /**
     * Save a world's level data and chunks to IndexedDB.
     * @param {string} worldName — World name/identifier.
     * @param {Object} levelData — Serialized level data (spawn, game mode, time, seed).
     * @param {Array} chunks — Array of {cx, cz, blockData, skyLight, blockLight} or {cx, cz, data: {...}} objects.
     * @returns {Promise<boolean>} Resolves true on success.
     */
    Donkeycraft.WorldStore.prototype.saveWorld = function (worldName, levelData, chunks) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        return new Promise(function (resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.WORLD_STORE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);

                // Handle quota exceeded errors (IndexedDB storage limits)
                transaction.onerror = function () {
                    if (transaction.error && transaction.error.name === 'QuotaExceededError') {
                        self._emit('storage:quota-exceeded', { worldName: worldName });
                    }
                };

                var data = {
                    worldName: worldName,
                    levelData: levelData,
                    chunks: chunks || [],
                    savedAt: Date.now()
                };

                var request = store.put(data);

                request.onsuccess = function () {
                    self._emit('world:saved', { worldName: worldName });
                    resolve(true);
                };

                request.onerror = function () {
                    if (request.error && request.error.name === 'QuotaExceededError') {
                        self._emit('storage:quota-exceeded', { worldName: worldName });
                    }
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
     * Normalizes chunk data to internal format ({ cx, cz, data: {...} }).
     * @param {string} worldName — World name/identifier.
     * @returns {Promise<Object|null>} Resolves with {levelData, chunks, savedAt} or null if not found.
     */
    Donkeycraft.WorldStore.prototype.loadWorld = function (worldName) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(null);
        }

        return new Promise(function (resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.WORLD_STORE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
                var request = store.get(worldName);

                request.onsuccess = function () {
                    if (request.result) {
                        self._emit('world:loaded', { worldName: worldName });
                        resolve({
                            levelData: request.result.levelData || {},
                            chunks: self._normalizeChunks(request.result.chunks),
                            savedAt: request.result.savedAt || 0
                        });
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = function () {
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
    Donkeycraft.WorldStore.prototype.deleteWorld = function (worldName) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        return new Promise(function (resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.WORLD_STORE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
                var request = store.delete(worldName);

                request.onsuccess = function () {
                    self._emit('world:deleted', { worldName: worldName });
                    resolve(true);
                };

                request.onerror = function () {
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
    Donkeycraft.WorldStore.prototype.listWorlds = function () {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve([]);
        }

        return new Promise(function (resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.WORLD_STORE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
                var request = store.openCursor();
                var worlds = [];

                request.onsuccess = function (event) {
                    var cursor = event.target.result;
                    if (cursor) {
                        worlds.push(cursor.value.worldName);
                        cursor.continue();
                    } else {
                        self._emit('worlds:listed', { count: worlds.length });
                        resolve(worlds);
                    }
                };

                request.onerror = function () {
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
    Donkeycraft.WorldStore.prototype.saveChunk = function (worldName, cx, cz, chunkData) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        // Load existing world data, add chunk, save back
        return self.loadWorld(worldName).then(function (worldData) {
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
    Donkeycraft.WorldStore.prototype.loadChunk = function (worldName, cx, cz) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(null);
        }

        return self.loadWorld(worldName).then(function (worldData) {
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
    Donkeycraft.WorldStore.prototype.getLevelData = function (worldName) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(null);
        }

        return self.loadWorld(worldName).then(function (worldData) {
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
    Donkeycraft.WorldStore.prototype.setLevelData = function (worldName, levelData) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        return self.loadWorld(worldName).then(function (worldData) {
            if (!worldData) {
                worldData = { levelData: {}, chunks: [] };
            }
            worldData.levelData = levelData;
            return self.saveWorld(worldName, levelData, worldData.chunks);
        });
    };

    /**
     * Save all dirty chunks from the chunk manager in batches.
     * Uses Config.CHUNKS_PER_SAVE for batch size to avoid blocking the main thread.
     * Properly serializes full blockData, skyLight, and blockLight Uint8Array/Uint16Array data.
     * @param {string} worldName — World name.
     * @returns {Promise<number>} Number of chunks saved.
     */
    Donkeycraft.WorldStore.prototype.saveDirtyChunks = function (worldName) {
        var self = this;
        if (!this._chunkManager || !this.isReady()) {
            return Promise.resolve(0);
        }

        var CHUNKS_PER_SAVE = (Donkeycraft.Config && Donkeycraft.Config.CHUNKS_PER_SAVE) ? Donkeycraft.Config.CHUNKS_PER_SAVE : 4;
        var dirtyChunks = this._chunkManager.getDirtyChunks();

        if (!dirtyChunks || dirtyChunks.length === 0) {
            return Promise.resolve(0);
        }

        // Filter to only truly dirty chunks
        var dirtyList = [];
        for (var i = 0; i < dirtyChunks.length; i++) {
            if (dirtyChunks[i] && dirtyChunks[i].isDirty()) {
                dirtyList.push(dirtyChunks[i]);
            }
        }

        if (dirtyList.length === 0) {
            return Promise.resolve(0);
        }

        // Save in batches to avoid blocking the main thread
        var totalSaved = 0;
        var batchIndex = 0;

        /**
         * serializeChunkData — extract serializable data from a chunk.
         * Copies TypedArray data into plain arrays for safe JSON serialization.
         * @private
         * @param {Donkeycraft.Chunk} chunk — Chunk instance.
         * @returns {{blockData: number[], skyLight: number[], blockLight: number[]}} Serialized chunk data.
         */
        var serializeChunkData = function (chunk) {
            var blockDataArr = null;
            var skyLightArr = null;
            var blockLightArr = null;

            if (chunk.blocks && chunk.blocks instanceof Uint16Array) {
                blockDataArr = Array.prototype.slice.call(chunk.blocks);
            } else if (chunk.getBlockData) {
                var bd = chunk.getBlockData();
                if (bd) {
                    blockDataArr = Array.prototype.slice.call(bd);
                }
            }

            if (chunk.skyLight && chunk.skyLight instanceof Uint8Array) {
                skyLightArr = Array.prototype.slice.call(chunk.skyLight);
            }

            if (chunk.blockLight && chunk.blockLight instanceof Uint8Array) {
                blockLightArr = Array.prototype.slice.call(chunk.blockLight);
            }

            return {
                blockData: blockDataArr,
                skyLight: skyLightArr,
                blockLight: blockLightArr
            };
        };

        var saveNextBatch = function () {
            if (batchIndex >= dirtyList.length) {
                self._emit('chunks:saved', { worldName: worldName, count: totalSaved });
                return Promise.resolve(totalSaved);
            }

            var batchSize = Math.min(CHUNKS_PER_SAVE, dirtyList.length - batchIndex);
            var batchSavePromises = [];

            for (var i = 0; i < batchSize; i++) {
                var idx = batchIndex + i;
                var chunk = dirtyList[idx];
                if (!chunk) continue;

                var cx = chunk.chunkX;
                var cz = chunk.chunkZ;
                var chunkData = serializeChunkData(chunk);

                batchSavePromises.push(
                    self.saveChunk(worldName, cx, cz, chunkData).then(function (success) {
                        if (success) {
                            totalSaved++;
                            if (chunk && chunk.markClean) {
                                chunk.markClean();
                            }
                        }
                    }).catch(function (err) {
                        Donkeycraft.Logger.warn('WorldStore', 'Failed to save chunk [' + cx + ',' + cz + ']: ' + (err && err.message ? err.message : String(err)));
                    })
                );
            }

            batchIndex += batchSize;

            return Promise.all(batchSavePromises).then(function () {
                // Small delay between batches to avoid blocking the main thread
                if (batchIndex < dirtyList.length) {
                    return new Promise(function (resolve) {
                        setTimeout(resolve, 10);
                    }).then(saveNextBatch);
                }
                return totalSaved;
            });
        };

        return saveNextBatch();
    };

    /**
     * Close the IndexedDB connection.
     */
    Donkeycraft.WorldStore.prototype.destroy = function () {
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