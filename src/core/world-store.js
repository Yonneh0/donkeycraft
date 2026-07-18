// Donkeycraft — World Store
// IndexedDB world storage: save chunks, load chunks, world info.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * Default database name.
   * @memberof Donkeycraft.WorldStore
   * @const
   * @type {string}
   */
  Donkeycraft.WORLD_STORE_DB_NAME = 'donkeycraft-worlds';

  /**
   * Default database version.
   * @memberof Donkeycraft.WorldStore
   * @const
   * @type {number}
   */
  Donkeycraft.WORLD_STORE_VERSION = 1;

  /**
   * Default object store name for world data.
   * @memberof Donkeycraft.WorldStore
   * @const
   * @type {string}
   */
  Donkeycraft.WORLD_STORE_STORE_NAME = 'worlds';

  /**
   * WorldStore — IndexedDB-based world storage for saving and loading worlds.
   * @memberof Donkeycraft
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
   * @memberof Donkeycraft.WorldStore
   * @param {Donkeycraft.ChunkManager} chunkManager — Chunk manager instance.
   */
  Donkeycraft.WorldStore.prototype.setChunkManager = function (chunkManager) {
    this._chunkManager = chunkManager;
  };

  /**
   * Set the event bus for storage events.
   * @memberof Donkeycraft.WorldStore
   * @param {Donkeycraft.EventBus} eventBus — Event bus instance.
   */
  Donkeycraft.WorldStore.prototype.setEventBus = function (eventBus) {
    this._eventBus = eventBus;
  };

  /**
   * _emit — emit an event with storage context via the internal EventBus.
   * Silently handles errors to prevent cascading failures.
   * @memberof Donkeycraft.WorldStore
   * @private
   * @param {string} eventName — Event name to emit.
   * @param {Object} [data] — Event payload (defaults to empty object).
   */
  Donkeycraft.WorldStore.prototype._emit = function (eventName, data) {
    if (this._eventBus) {
      try {
        this._eventBus.emit(eventName, data);
      } catch (e) {
        Donkeycraft.Logger.warn(
          'WorldStore',
          '_emit failed for event "' +
            eventName +
            '": ' +
            (e.message || String(e))
        );
      }
    }
  };

  /**
   * Initialize the IndexedDB database and create object stores.
   * Creates the worlds object store if it does not already exist, and stores
   * a schema version sentinel to detect incompatible upgrades.
   * Handles the case where IndexedDB is unavailable by resolving false gracefully.
   * @memberof Donkeycraft.WorldStore
   * @throws {Error} If the database fails to open or upgrade.
   * @returns {Promise<boolean>} Resolves true when DB is ready, false if IndexedDB is unavailable.
   */
  Donkeycraft.WorldStore.prototype.init = function () {
    var self = this;
    return new Promise(function (resolve) {
      try {
        if (typeof indexedDB === 'undefined') {
          self._ready = false;
          self._emit('storage:error', {
            error: new Error('IndexedDB not available in this browser'),
          });
          resolve(false);
          return;
        }

        var request = indexedDB.open(
          self._dbName,
          Donkeycraft.WORLD_STORE_VERSION
        );

        request.onerror = function () {
          self._ready = false;
          self._emit('storage:error', {
            error: new Error(
              'Failed to open world database: ' +
                (request.error ? request.error.message : 'unknown')
            ),
          });
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
          var metaStoreName = '__meta__';
          var oldVersion = event.oldVersion;

          // Create meta store if it doesn't exist (for version tracking)
          if (!db.objectStoreNames.contains(metaStoreName)) {
            db.createObjectStore(metaStoreName, { keyPath: 'key' });
          }

          // Create object store for worlds if it doesn't exist
          if (
            !db.objectStoreNames.contains(Donkeycraft.WORLD_STORE_STORE_NAME)
          ) {
            db.createObjectStore(Donkeycraft.WORLD_STORE_STORE_NAME, {
              keyPath: 'worldName',
            });
          }

          // Store/update schema version sentinel to detect incompatible data on upgrade
          try {
            var metaTx = db.transaction([metaStoreName], 'readwrite');
            var metaStore = metaTx.objectStore(metaStoreName);
            metaStore.put({
              key: '__schemaVersion__',
              value: Donkeycraft.WORLD_STORE_VERSION,
              upgradedAt: Date.now(),
            });
            metaTx.oncomplete = function () {
              if (oldVersion > 0) {
                Donkeycraft.Logger.info(
                  'WorldStore',
                  'Database upgraded from version ' +
                    oldVersion +
                    ' to ' +
                    Donkeycraft.WORLD_STORE_VERSION
                );
              }
            };
            metaTx.onerror = function () {
              Donkeycraft.Logger.warn(
                'WorldStore',
                'Failed to update schema version sentinel'
              );
            };
          } catch (e) {
            Donkeycraft.Logger.warn(
              'WorldStore',
              'Error updating schema version: ' + e.message
            );
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
   * Check if the store is ready (database opened successfully and connection is valid).
   * @memberof Donkeycraft.WorldStore
   * @returns {boolean} True if the database is open and ready for operations.
   */
  Donkeycraft.WorldStore.prototype.isReady = function () {
    return this._ready && !!this._db;
  };

  /**
   * _normalizeTypedArray — copy a TypedArray or plain array into a new plain array.
   * Returns null for null/undefined input, passes through numbers as-is.
   * @memberof Donkeycraft.WorldStore
   * @private
   * @param {*} data — TypedArray, array, number, or null.
   * @returns {number[]|null} Plain array copy or null.
   */
  Donkeycraft.WorldStore.prototype._normalizeTypedArray = function (data) {
    if (data == null) return null;
    if (typeof data === 'number') return data;
    if (data instanceof Uint8Array || data instanceof Uint16Array || Array.isArray(data)) {
      return Array.prototype.slice.call(data);
    }
    return null;
  };

  /**
   * _normalizeChunks — normalize chunk data to internal format.
   * Handles both old format ({ cx, cz, blockData, skyLight, blockLight }) and new format ({ cx, cz, data: { blockData, skyLight, blockLight } }).
   * Validates all entries; skips invalid entries with warnings.
   * @memberof Donkeycraft.WorldStore
   * @private
   * @param {Array|null} chunks — Raw chunk array from storage (may be null or non-array).
   * @returns {Array} Normalized chunk array in format [{ cx, cz, data: {blockData: number[]|null, skyLight: number[]|number, blockLight: number[]|number } }].
   */
  Donkeycraft.WorldStore.prototype._normalizeChunks = function (chunks) {
    if (!chunks || !Array.isArray(chunks)) {
      return [];
    }

    var normalized = [];
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];

      if (typeof c.cx !== 'number' || typeof c.cz !== 'number') {
        Donkeycraft.Logger.warn(
          'WorldStore',
          'Skipping chunk at index ' + i + ': missing cx/cz'
        );
        continue;
      }

      if (c.data && typeof c.data === 'object') {
        if (
          c.data.blockData !== undefined ||
          c.data.skyLight !== undefined ||
          c.data.blockLight !== undefined
        ) {
          var normBlockData = this._normalizeTypedArray(c.data.blockData);
          var normSkyLight = this._normalizeTypedArray(c.data.skyLight);
          var normBlockLight = this._normalizeTypedArray(c.data.blockLight);
          normalized.push({
            cx: c.cx,
            cz: c.cz,
            data: {
              blockData: normBlockData,
              skyLight: normSkyLight !== null ? normSkyLight : 0,
              blockLight: normBlockLight !== null ? normBlockLight : 0,
            },
          });
        }
      } else if (c.blockData !== undefined) {
        var obd = this._normalizeTypedArray(c.blockData);
        var osl = this._normalizeTypedArray(c.skyLight);
        var obl = this._normalizeTypedArray(c.blockLight);
        normalized.push({
          cx: c.cx,
          cz: c.cz,
          data: {
            blockData: obd,
            skyLight: osl !== null ? osl : 0,
            blockLight: obl !== null ? obl : 0,
          },
        });
      }
    }
    return normalized;
  };

  /**
   * Save a world's level data and chunks to IndexedDB.
   * Serializes all data (including plain array chunk data) to JSON for storage.
   * Handles quota exceeded errors gracefully with event emission.
   * @memberof Donkeycraft.WorldStore
   * @param {string} worldName — World name/identifier.
   * @param {Object} levelData — Serialized level data (spawn, game mode, time, seed).
   * @param {Array} chunks — Array of {cx, cz, data: {blockData, skyLight, blockLight}} objects.
   * @throws {Error} If worldName is empty.
   * @returns {Promise<boolean>} Resolves true on success, false otherwise.
   */
  Donkeycraft.WorldStore.prototype.saveWorld = function (
    worldName,
    levelData,
    chunks
  ) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(false);
    }

    // Validate worldName
    if (typeof worldName !== 'string' || worldName.trim() === '') {
      Donkeycraft.Logger.error(
        'WorldStore',
        'saveWorld called with invalid worldName: ' + String(worldName)
      );
      return Promise.resolve(false);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.WORLD_STORE_STORE_NAME],
          'readwrite'
        );
        var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);

        // Handle quota exceeded errors (IndexedDB storage limits)
        transaction.onerror = function () {
          if (
            transaction.error &&
            transaction.error.name === 'QuotaExceededError'
          ) {
            self._emit('storage:quota-exceeded', { worldName: worldName });
          } else if (transaction.error) {
            Donkeycraft.Logger.error(
              'WorldStore',
              'saveWorld transaction error for "' +
                worldName +
                '": ' +
                transaction.error.message
            );
          }
        };

        var data = {
          worldName: worldName,
          levelData: levelData || {},
          chunks: chunks || [],
          savedAt: Date.now(),
        };

        var request = store.put(data);

        request.onsuccess = function () {
          self._emit('world:saved', { worldName: worldName });
          resolve(true);
        };

        request.onerror = function () {
          if (request.error && request.error.name === 'QuotaExceededError') {
            self._emit('storage:quota-exceeded', { worldName: worldName });
          } else {
            Donkeycraft.Logger.error(
              'WorldStore',
              'saveWorld request error for "' +
                worldName +
                '": ' +
                (request.error ? request.error.message : 'unknown')
            );
          }
          self._emit('world:save-error', {
            worldName: worldName,
            error: 'Save failed',
          });
          resolve(false);
        };
      } catch (e) {
        Donkeycraft.Logger.error(
          'WorldStore',
          'saveWorld exception for "' + worldName + '": ' + e.message
        );
        resolve(false);
      }
    });
  };

  /**
   * Load a world's level data and chunks from IndexedDB.
   * Normalizes chunk data to internal format ({ cx, cz, data: {...} }).
   * Handles TypedArray deserialization from stored plain arrays.
   * @memberof Donkeycraft.WorldStore
   * @param {string} worldName — World name/identifier.
   * @throws {Error} If worldName is empty.
   * @returns {Promise<Object|null>} Resolves with {levelData: Object, chunks: Array, savedAt: number} or null if not found.
   */
  Donkeycraft.WorldStore.prototype.loadWorld = function (worldName) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(null);
    }

    // Validate worldName
    if (typeof worldName !== 'string' || worldName.trim() === '') {
      Donkeycraft.Logger.error(
        'WorldStore',
        'loadWorld called with invalid worldName: ' + String(worldName)
      );
      return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.WORLD_STORE_STORE_NAME],
          'readonly'
        );
        var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
        var request = store.get(worldName);

        request.onsuccess = function () {
          if (request.result) {
            self._emit('world:loaded', { worldName: worldName });
            resolve({
              levelData: request.result.levelData || {},
              chunks: self._normalizeChunks(request.result.chunks),
              savedAt: request.result.savedAt || 0,
            });
          } else {
            resolve(null);
          }
        };

        request.onerror = function () {
          Donkeycraft.Logger.error(
            'WorldStore',
            'loadWorld error for "' +
              worldName +
              '": ' +
              (request.error ? request.error.message : 'unknown')
          );
          self._emit('world:load-error', {
            worldName: worldName,
            error: 'Load failed',
          });
          resolve(null);
        };
      } catch (e) {
        Donkeycraft.Logger.error(
          'WorldStore',
          'loadWorld exception for "' + worldName + '": ' + e.message
        );
        resolve(null);
      }
    });
  };

  /**
   * Delete a world from IndexedDB.
   * Emits 'world:deleted' on success or 'world:delete-error' on failure.
   * @memberof Donkeycraft.WorldStore
   * @param {string} worldName — World name/identifier.
   * @throws {Error} If worldName is empty.
   * @returns {Promise<boolean>} Resolves true if deleted, false otherwise.
   */
  Donkeycraft.WorldStore.prototype.deleteWorld = function (worldName) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(false);
    }

    // Validate worldName
    if (typeof worldName !== 'string' || worldName.trim() === '') {
      Donkeycraft.Logger.error(
        'WorldStore',
        'deleteWorld called with invalid worldName: ' + String(worldName)
      );
      return Promise.resolve(false);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.WORLD_STORE_STORE_NAME],
          'readwrite'
        );
        var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
        var request = store.delete(worldName);

        request.onsuccess = function () {
          self._emit('world:deleted', { worldName: worldName });
          resolve(true);
        };

        request.onerror = function () {
          Donkeycraft.Logger.error(
            'WorldStore',
            'deleteWorld error for "' +
              worldName +
              '": ' +
              (request.error ? request.error.message : 'unknown')
          );
          self._emit('world:delete-error', {
            worldName: worldName,
            error: 'Delete failed',
          });
          resolve(false);
        };
      } catch (e) {
        Donkeycraft.Logger.error(
          'WorldStore',
          'deleteWorld exception for "' + worldName + '": ' + e.message
        );
        resolve(false);
      }
    });
  };

  /**
   * List all saved world names from IndexedDB.
   * Returns an array of world name strings, sorted alphabetically.
   * Emits 'worlds:listed' event with count.
   * @memberof Donkeycraft.WorldStore
   * @returns {Promise<Array<string>>} Array of world name strings, sorted alphabetically.
   */
  Donkeycraft.WorldStore.prototype.listWorlds = function () {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve([]);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.WORLD_STORE_STORE_NAME],
          'readonly'
        );
        var store = transaction.objectStore(Donkeycraft.WORLD_STORE_STORE_NAME);
        var request = store.openCursor();
        var worlds = [];
        var resolved = false; // Prevent double-resolve

        request.onsuccess = function (event) {
          var cursor = event.target.result;
          if (cursor) {
            if (cursor.value && typeof cursor.value.worldName === 'string') {
              worlds.push(cursor.value.worldName);
            }
            cursor.continue();
          } else {
            // End of cursor — resolve only once
            if (!resolved) {
              resolved = true;
              // Sort alphabetically for consistent ordering
              worlds.sort();
              self._emit('worlds:listed', { count: worlds.length });
              resolve(worlds);
            }
          }
        };

        request.onerror = function () {
          if (!resolved) {
            resolved = true;
            Donkeycraft.Logger.error(
              'WorldStore',
              'listWorlds transaction error: ' +
                (request.error ? request.error.message : 'unknown')
            );
            resolve(worlds); // Return partial results on error
          }
        };
      } catch (e) {
        Donkeycraft.Logger.error(
          'WorldStore',
          'listWorlds exception: ' + e.message
        );
        resolve([]);
      }
    });
  };

  /**
   * Save a single chunk to the specified world.
   * Loads existing world data, updates or adds the chunk, then saves back.
   * Properly handles chunk data for JSON serialization.
   * @memberof Donkeycraft.WorldStore
   * @param {string} worldName — World name.
   * @param {number} cx — Chunk X coordinate.
   * @param {number} cz — Chunk Z coordinate.
   * @param {Object} chunkData — Chunk data {blockData, skyLight, blockLight}.
   * @throws {Error} If cx or cz are not finite numbers.
   * @returns {Promise<boolean>} Resolves true on success, false otherwise.
   */
  Donkeycraft.WorldStore.prototype.saveChunk = function (
    worldName,
    cx,
    cz,
    chunkData
  ) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(false);
    }

    // Validate coordinates
    if (
      typeof cx !== 'number' ||
      !isFinite(cx) ||
      typeof cz !== 'number' ||
      !isFinite(cz)
    ) {
      Donkeycraft.Logger.error(
        'WorldStore',
        'saveChunk called with invalid coordinates: cx=' + cx + ', cz=' + cz
      );
      return Promise.resolve(false);
    }

    // Validate chunkData
    if (!chunkData || typeof chunkData !== 'object') {
      Donkeycraft.Logger.error(
        'WorldStore',
        'saveChunk called with invalid chunkData for [' + cx + ',' + cz + ']'
      );
      return Promise.resolve(false);
    }

    // Load existing world data, add chunk, save back
    return self
      .loadWorld(worldName)
      .then(function (worldData) {
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
      })
      .catch(function (err) {
        Donkeycraft.Logger.error(
          'WorldStore',
          'saveChunk failed for [' +
            cx +
            ',' +
            cz +
            '] in world "' +
            worldName +
            '": ' +
            (err && err.message ? err.message : String(err))
        );
        return false;
      });
  };

  /**
   * Load a single chunk from the specified world.
   * Returns chunk data in the normalized format {blockData, skyLight, blockLight}.
   * @memberof Donkeycraft.WorldStore
   * @param {string} worldName — World name.
   * @param {number} cx — Chunk X coordinate.
   * @param {number} cz — Chunk Z coordinate.
   * @throws {Error} If cx or cz are not finite numbers.
   * @returns {Promise<Object|null>} Resolves with chunk data object {blockData: number[]|null, skyLight: number[]|number, blockLight: number[]|number} or null.
   */
  Donkeycraft.WorldStore.prototype.loadChunk = function (worldName, cx, cz) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(null);
    }

    // Validate coordinates
    if (
      typeof cx !== 'number' ||
      !isFinite(cx) ||
      typeof cz !== 'number' ||
      !isFinite(cz)
    ) {
      Donkeycraft.Logger.error(
        'WorldStore',
        'loadChunk called with invalid coordinates: cx=' + cx + ', cz=' + cz
      );
      return Promise.resolve(null);
    }

    return self
      .loadWorld(worldName)
      .then(function (worldData) {
        if (!worldData || !worldData.chunks) {
          return null;
        }

        for (var i = 0; i < worldData.chunks.length; i++) {
          if (worldData.chunks[i].cx === cx && worldData.chunks[i].cz === cz) {
            return worldData.chunks[i].data || null;
          }
        }
        return null;
      })
      .catch(function (err) {
        Donkeycraft.Logger.error(
          'WorldStore',
          'loadChunk failed for [' +
            cx +
            ',' +
            cz +
            '] in world "' +
            worldName +
            '": ' +
            (err && err.message ? err.message : String(err))
        );
        return null;
      });
  };

  /**
   * Get the level data for a world without loading chunks.
   * @memberof Donkeycraft.WorldStore
   * @param {string} worldName — World name.
   * @returns {Promise<Object|null>} Resolves with level data object or null if world not found.
   */
  Donkeycraft.WorldStore.prototype.getLevelData = function (worldName) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(null);
    }

    return self
      .loadWorld(worldName)
      .then(function (worldData) {
        if (worldData && worldData.levelData) {
          return worldData.levelData;
        }
        return null;
      })
      .catch(function (err) {
        Donkeycraft.Logger.error(
          'WorldStore',
          'getLevelData failed for "' +
            worldName +
            '": ' +
            (err && err.message ? err.message : String(err))
        );
        return null;
      });
  };

  /**
   * Set/Update the level data for a world.
   * Preserves existing chunks while updating level data.
   * @memberof Donkeycraft.WorldStore
   * @param {string} worldName — World name.
   * @param {Object} levelData — Level data object.
   * @returns {Promise<boolean>} Resolves true on success, false otherwise.
   */
  Donkeycraft.WorldStore.prototype.setLevelData = function (
    worldName,
    levelData
  ) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(false);
    }

    // Validate levelData
    if (!levelData || typeof levelData !== 'object') {
      Donkeycraft.Logger.error(
        'WorldStore',
        'setLevelData called with invalid levelData for "' + worldName + '"'
      );
      return Promise.resolve(false);
    }

    return self
      .loadWorld(worldName)
      .then(function (worldData) {
        if (!worldData) {
          worldData = { levelData: {}, chunks: [] };
        }
        worldData.levelData = levelData;
        return self.saveWorld(worldName, levelData, worldData.chunks);
      })
      .catch(function (err) {
        Donkeycraft.Logger.error(
          'WorldStore',
          'setLevelData failed for "' +
            worldName +
            '": ' +
            (err && err.message ? err.message : String(err))
        );
        return false;
      });
  };

  /**
   * Save all dirty chunks from the chunk manager in batches.
   * Uses Config.CHUNKS_PER_SAVE for batch size and Config.SAVE_BATCH_DELAY for inter-batch delay.
   * Properly serializes full blockData, skyLight, and blockLight TypedArray data into plain arrays.
   * Marks saved chunks as clean after successful save.
   * @memberof Donkeycraft.WorldStore
   * @param {string} worldName — World name.
   * @throws {Error} If worldName is empty or invalid.
   * @returns {Promise<number>} Number of chunks saved.
   */
  Donkeycraft.WorldStore.prototype.saveDirtyChunks = function (worldName) {
    var self = this;
    if (!this._chunkManager || !this.isReady()) {
      return Promise.resolve(0);
    }

    // Validate worldName
    if (typeof worldName !== 'string' || worldName.trim() === '') {
      Donkeycraft.Logger.error(
        'WorldStore',
        'saveDirtyChunks called with invalid worldName: ' + String(worldName)
      );
      return Promise.resolve(0);
    }

    var CHUNKS_PER_SAVE =
      Donkeycraft.Config && Donkeycraft.Config.CHUNKS_PER_SAVE
        ? Donkeycraft.Config.CHUNKS_PER_SAVE
        : 4;
    var SAVE_BATCH_DELAY =
      Donkeycraft.Config && Donkeycraft.Config.SAVE_BATCH_DELAY
        ? Donkeycraft.Config.SAVE_BATCH_DELAY
        : 100;
    var dirtyChunks = this._chunkManager.getDirtyChunks();

    if (!dirtyChunks || dirtyChunks.length === 0) {
      return Promise.resolve(0);
    }

    // Filter to only truly dirty chunks
    var dirtyList = [];
    for (var i = 0; i < dirtyChunks.length; i++) {
      var dc = dirtyChunks[i];
      if (
        dc &&
        dc.chunk &&
        typeof dc.chunk.isDirty === 'function' &&
        dc.chunk.isDirty()
      ) {
        dirtyList.push(dc);
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
     * Uses _normalizeTypedArray for consistent TypedArray-to-array conversion.
     */
    var serializeChunkData = function (chunk) {
      return {
        blockData: this._normalizeTypedArray(chunk.blocks),
        skyLight: this._normalizeTypedArray(chunk.skyLight),
        blockLight: this._normalizeTypedArray(chunk.blockLight),
      };
    }.bind(this);

    var saveNextBatch = function () {
      if (batchIndex >= dirtyList.length) {
        self._emit('chunks:saved', { worldName: worldName, count: totalSaved });
        return Promise.resolve(totalSaved);
      }

      var batchSize = Math.min(CHUNKS_PER_SAVE, dirtyList.length - batchIndex);
      var batchSavePromises = [];

      for (var i = 0; i < batchSize; i++) {
        var entry = dirtyList[batchIndex + i];
        if (!entry || !entry.chunk) continue;

        var chunk = entry.chunk;
        var cx = chunk.chunkX;
        var cz = chunk.chunkZ;
        var chunkData = serializeChunkData(chunk);

        batchSavePromises.push(
          self
            .saveChunk(worldName, cx, cz, chunkData)
            .then(function (success) {
              if (success) {
                totalSaved++;
                if (chunk && chunk.markClean) {
                  chunk.markClean();
                }
              }
            })
            .catch(function (err) {
              Donkeycraft.Logger.warn(
                'WorldStore',
                'Failed to save chunk [' +
                  cx +
                  ',' +
                  cz +
                  ']: ' +
                  (err && err.message ? err.message : String(err))
              );
            })
        );
      }

      batchIndex += batchSize;

      return Promise.all(batchSavePromises).then(function () {
        if (batchIndex < dirtyList.length) {
          // Use Config.SAVE_BATCH_DELAY for inter-batch pause
          return new Promise(function (resolve) {
            setTimeout(resolve, SAVE_BATCH_DELAY);
          }).then(saveNextBatch);
        }
        return totalSaved;
      });
    };

    return saveNextBatch();
  };

  /**
   * Close the IndexedDB connection and release all references.
   * Emits 'storage:closed' event after closing.
   * @memberof Donkeycraft.WorldStore
   */
  Donkeycraft.WorldStore.prototype.destroy = function () {
    // Emit before clearing references so handlers can still access this instance
    this._emit('storage:closed', {});

    if (this._db) {
      try {
        this._db.close();
      } catch (e) {
        Donkeycraft.Logger.warn(
          'WorldStore',
          'Error closing IndexedDB: ' + (e.message || String(e))
        );
      }
      this._db = null;
    }
    this._ready = false;
    this._chunkManager = null;
    this._eventBus = null;
  };
})();
