// Donkeycraft — Browser Storage Cache Manager
// Hybrid IndexedDB + in-memory LRU cache for terrain chunks and metadata.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  if (!Donkeycraft) return;

  // ============================================================
  // Constants
  // ============================================================
  var STORAGE_VERSION = 1;
  var METADATA_KEY = '__donkeycraft_metadata__';
  var CHUNK_STORE_NAME = 'chunks';
  var META_STORE_NAME = 'metadata';
  var TEXTURE_STORE_NAME = 'textures';
  var DB_NAME = 'DonkeycraftStorage';
  var DB_VERSION = STORAGE_VERSION;
  var MAX_CHUNK_CACHE_SIZE = 50; // Max chunks to keep in memory (LRU)
  var MAX_TEXTURE_CACHE_SIZE = 512; // Max textures in memory cache

  // ============================================================
  // Runtime State
  // ============================================================
  var _db = null; // IndexedDB instance
  var _memoryCache = new Map(); // LRU memory cache: key -> {data, timestamp}
  var _lruOrder = []; // Array of keys in LRU order (most recent at end)
  var _isInitialized = false;
  var _saveTimeout = null;
  var _pendingWrites = []; // Batched writes
  var _flushPromise = null; // Promise for pending flush operation
  var INDEXEDDB_AVAILABLE = false;

  // ============================================================
  // Utility Functions
  // ============================================================

  /**
   * Generate a deterministic cache key from chunk coordinates and parameters.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {number} biomeId - Biome ID.
   * @param {number} seed - World seed.
   * @returns {string} Deterministic cache key string in format "chunk_{cx}_{cz}_b{biome}_s{seed}".
   * @private
   */
  function _makeKey(chunkX, chunkZ, biomeId, seed) {
    return 'chunk_' + chunkX + '_' + chunkZ + '_b' + biomeId + '_s' + seed;
  }

  /**
   * Update LRU order for a cache entry — moves the key to the end (most recently used).
   * O(n) operation; acceptable for cache sizes up to ~50 entries.
   * @param {string} key - Cache key to update.
   * @private
   */
  function _updateLRU(key) {
    var idx = _lruOrder.indexOf(key);
    if (idx >= 0) {
      _lruOrder.splice(idx, 1);
    }
    _lruOrder.push(key);
  }

  /**
   * Evict oldest entries from memory cache when size exceeds MAX_CHUNK_CACHE_SIZE.
   * Removes entries from the front of _lruOrder (least recently used) until size is within limit.
   * @private
   */
  function _evictLRU() {
    while (_memoryCache.size >= MAX_CHUNK_CACHE_SIZE && _lruOrder.length > 0) {
      var oldestKey = _lruOrder.shift();
      _memoryCache.delete(oldestKey);
    }
  }

  /**
   * Log a warning message to the console if available.
   * Prefixes messages with "[Storage]" for identification.
   * Silently ignores errors if console is unavailable.
   * @param {string} message - Warning message to log.
   * @private
   */
  function _warn(message) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Storage] ' + message);
    }
  }

  // ============================================================
  // IndexedDB Initialization
  // ============================================================

  /**
   * Check if IndexedDB is available in this environment.
   * Wraps the check in a try/catch for environments where accessing indexedDB throws.
   * @returns {boolean} True if IndexedDB is supported and accessible.
   * @private
   */
  function _checkIndexedDB() {
    try {
      return typeof indexedDB !== 'undefined';
    } catch (e) {
      return false;
    }
  }

  /**
   * Initialize IndexedDB and create object stores.
   * @returns {Promise<boolean>} Resolves to true when ready.
   * @private
   */
  function _initIndexedDB() {
    if (!_checkIndexedDB()) {
      INDEXEDDB_AVAILABLE = false;
      return Promise.resolve(false);
    }

    INDEXEDDB_AVAILABLE = true;
    return new Promise(function (resolve) {
      try {
        var request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = function () {
          INDEXEDDB_AVAILABLE = false;
          _warn(
            'IndexedDB open failed: ' +
              (request.error ? String(request.error) : 'unknown error')
          );
          resolve(false);
        };

        request.onsuccess = function (event) {
          _db = event.target.result;
          resolve(true);
        };

        request.onupgradeneeded = function (event) {
          var db = event.target.result;

          // Chunk store: stores serialized chunk data
          if (!db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
            var chunkStore = db.createObjectStore(CHUNK_STORE_NAME, {
              keyPath: 'key',
            });
            chunkStore.createIndex('biome', 'biomeId', { unique: false });
            chunkStore.createIndex('seed', 'seed', { unique: false });
          }

          // Metadata store: stores small metadata (last save time, version, etc.)
          if (!db.objectStoreNames.contains(META_STORE_NAME)) {
            db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
          }

          // Texture atlas store: stores serialized texture data URLs for fast reload
          if (!db.objectStoreNames.contains(TEXTURE_STORE_NAME)) {
            db.createObjectStore(TEXTURE_STORE_NAME, { keyPath: 'key' });
          }
        };
      } catch (e) {
        INDEXEDDB_AVAILABLE = false;
        _warn(
          'IndexedDB initialization error: ' +
            (e && e.message ? e.message : String(e))
        );
        resolve(false);
      }
    });
  }

  // ============================================================
  // Memory Cache Operations
  // ============================================================

  /**
   * Get a cached chunk from memory.
   * @param {string} key - Cache key.
   * @returns {*|null} Cached data, or null if not found.
   */
  function getFromMemoryCache(key) {
    if (!_isInitialized) return null;

    // Use has() to distinguish "null cached value" from "cache miss"
    if (!_memoryCache.has(key)) return null;

    var entry = _memoryCache.get(key);

    // Update LRU order
    _updateLRU(key);

    return entry.data;
  }

  /**
   * Store data in the memory cache.
   * @param {string} key - Cache key.
   * @param {*} data - Data to cache.
   */
  function putInMemoryCache(key, data) {
    if (!_isInitialized) return;

    // If key already exists, update in-place without evicting
    if (_memoryCache.has(key)) {
      _memoryCache.set(key, { data: data, timestamp: Date.now() });
      _updateLRU(key);
      return;
    }

    // Evict if at capacity (only when adding new key)
    _evictLRU();

    _memoryCache.set(key, { data: data, timestamp: Date.now() });
    _updateLRU(key);
  }

  /**
   * Check if a key exists in the memory cache.
   * @param {string} key - Cache key.
   * @returns {boolean} True if key exists in cache.
   * @private
   */
  function _memoryCacheHas(key) {
    return _isInitialized && _memoryCache.has(key);
  }

  /**
   * Clear the memory cache.
   */
  function clearMemoryCache() {
    _memoryCache.clear();
    _lruOrder = [];
  }

  // ============================================================
  // IndexedDB Operations
  // ============================================================

  /**
   * Read a chunk from IndexedDB.
   * @param {string} key - Cache key.
   * @returns {Promise<*|null>} Resolves to cached data or null.
   */
  function readFromIndexedDB(key) {
    if (!INDEXEDDB_AVAILABLE || !_db) {
      return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
      try {
        var tx = _db.transaction([CHUNK_STORE_NAME], 'readonly');
        var store = tx.objectStore(CHUNK_STORE_NAME);
        var request = store.get(key);

        request.onsuccess = function () {
          // Return data if it exists, null otherwise
          resolve(
            request.result && request.result.data !== undefined
              ? request.result.data
              : null
          );
        };

        request.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Write a chunk to IndexedDB (batched for efficiency).
   * @param {string} key - Cache key.
   * @param {*} data - Data to write.
   */
  function writeToIndexedDB(key, data) {
    if (!INDEXEDDB_AVAILABLE || !_db) return;

    // Add to pending writes batch
    _pendingWrites.push({ key: key, data: data });

    // Schedule batch write (debounce)
    if (!_saveTimeout) {
      _saveTimeout = setTimeout(_flushPendingWrites, 100);
    }
  }

  /**
   * _createFlushPromise — create a thenable with _resolved tracking for concurrent flush sequencing.
   * @param {Function} executor — Function that performs the actual IndexedDB write.
   * @returns {Object} Thenable with _resolved property for chaining.
   * @private
   */
  function _createFlushPromise(executor) {
    var result = {
      _resolved: false,
      then: function (onFulfilled, onRejected) {
        return executor().then(function () {
          result._resolved = true;
          _flushPromise = null;
          if (onFulfilled) return onFulfilled();
        }).catch(function (err) {
          result._resolved = true;
          _flushPromise = null;
          if (onRejected) return onRejected(err);
          throw err;
        });
      },
    };
    return result;
  }

  /**
   * _flushPendingWrites — flush all pending writes to IndexedDB in a single transaction.
   * Chains off any in-progress flush to prevent race conditions.
   * Handles quota exceeded errors by clearing old cache entries and retrying.
   * @returns {Object} Thenable with _resolved property for chaining.
   * @private
   */
  function _flushPendingWrites() {
    if (_saveTimeout) {
      clearTimeout(_saveTimeout);
      _saveTimeout = null;
    }

    if (_pendingWrites.length === 0) {
      _flushPromise = null;
      return Promise.resolve();
    }

    if (!INDEXEDDB_AVAILABLE || !_db) {
      _warn('IndexedDB not available for flush');
      _pendingWrites = [];
      _flushPromise = null;
      return Promise.resolve();
    }

    var writesCopy = _pendingWrites.slice();
    _pendingWrites = [];

    // Chain off any in-progress flush to prevent race conditions.
    var chainPromise =
      _flushPromise && !_flushPromise._resolved
        ? _flushPromise
        : Promise.resolve();

    return _createFlushPromise(function () {
      return new Promise(function (resolve, reject) {
        try {
          var tx = _db.transaction([CHUNK_STORE_NAME], 'readwrite');
          var store = tx.objectStore(CHUNK_STORE_NAME);

          for (var i = 0; i < writesCopy.length; i++) {
            var write = writesCopy[i];
            store.put({
              key: write.key,
              data: write.data,
              savedAt: Date.now(),
            });
          }

          tx.oncomplete = function () {
            resolve();
          };

          tx.onerror = function () {
            if (tx.error && tx.error.name === 'QuotaExceededError') {
              _warn('IndexedDB quota exceeded — clearing old cache entries');
              var clearTx = _db.transaction([CHUNK_STORE_NAME], 'readwrite');
              clearTx.objectStore(CHUNK_STORE_NAME).clear();
              clearTx.oncomplete = function () {
                _memoryCache.clear();
                _lruOrder = [];
                resolve();
              };
              clearTx.onerror = function () {
                reject(new Error('QuotaExceededError: cache clear failed'));
              };
            } else {
              var msg = tx.error ? String(tx.error.message || tx.error) : 'unknown';
              _warn('IndexedDB flush error: ' + msg);
              reject(new Error('IndexedDB flush failed: ' + msg));
            }
          };
        } catch (e) {
          reject(new Error('Flush exception: ' + e.message));
        }
      });
    });
  }

  /**
   * deleteFromIndexedDB — delete a chunk from IndexedDB.
   * Returns a Promise that rejects on actual errors for proper error propagation.
   * @param {string} key - Cache key.
   * @returns {Promise<void>} Resolves when deletion is complete.
   */
  function deleteFromIndexedDB(key) {
    if (!INDEXEDDB_AVAILABLE || !_db) return Promise.resolve();

    return new Promise(function (resolve, reject) {
      try {
        var tx = _db.transaction([CHUNK_STORE_NAME], 'readwrite');
        var store = tx.objectStore(CHUNK_STORE_NAME);
        var request = store.delete(key);

        request.onsuccess = function () {
          resolve();
        };
        request.onerror = function () {
          var msg = request.error ? String(request.error.message || request.error) : 'unknown';
          reject(new Error('deleteFromIndexedDB failed for "' + key + '": ' + msg));
        };
      } catch (e) {
        reject(new Error('deleteFromIndexedDB exception: ' + e.message));
      }
    });
  }

  // ============================================================
  // Metadata Operations
  // ============================================================

  /**
   * saveMetadata — save metadata to IndexedDB.
   * Returns a Promise that rejects on actual errors.
   * @param {string} key - Metadata key.
   * @param {*} data - Metadata data.
   * @returns {Promise<void>} Resolves when save is complete.
   */
  function saveMetadata(key, data) {
    if (!INDEXEDDB_AVAILABLE || !_db) return Promise.resolve();

    return new Promise(function (resolve, reject) {
      try {
        var tx = _db.transaction([META_STORE_NAME], 'readwrite');
        var store = tx.objectStore(META_STORE_NAME);
        var request = store.put({ key: key, data: data, savedAt: Date.now() });

        request.onsuccess = function () {
          resolve();
        };
        request.onerror = function () {
          reject(new Error('saveMetadata failed for "' + key + '": ' + (request.error ? String(request.error) : 'unknown')));
        };
      } catch (e) {
        reject(new Error('saveMetadata exception: ' + e.message));
      }
    });
  }

  /**
   * loadMetadata — load metadata from IndexedDB.
   * Returns null on error rather than rejecting (read operations are forgiving).
   * @param {string} key - Metadata key.
   * @returns {Promise<*|null>} Resolves to metadata or null.
   */
  function loadMetadata(key) {
    if (!INDEXEDDB_AVAILABLE || !_db) {
      return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
      try {
        var tx = _db.transaction([META_STORE_NAME], 'readonly');
        var store = tx.objectStore(META_STORE_NAME);
        var request = store.get(key);

        request.onsuccess = function () {
          resolve(
            request.result && request.result.data !== undefined
              ? request.result.data
              : null
          );
        };

        request.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  // ============================================================
  // Texture Atlas Cache Operations
  // ============================================================

  /**
   * putTexture — save a texture atlas tile to IndexedDB for cache persistence.
   * Stores the base64 data URL which can be restored on page reload.
   * @param {string} key - Texture key (e.g., "block_stone_42").
   * @param {string} dataUrl - Base64 PNG data URL of the texture.
   * @returns {Promise<void>} Resolves when saved.
   */
  function putTexture(key, dataUrl) {
    if (!INDEXEDDB_AVAILABLE || !_db) return Promise.resolve();

    return new Promise(function (resolve) {
      try {
        var tx = _db.transaction([TEXTURE_STORE_NAME], 'readwrite');
        var store = tx.objectStore(TEXTURE_STORE_NAME);
        var request = store.put({
          key: key,
          data: dataUrl,
          savedAt: Date.now(),
        });

        request.onsuccess = function () {
          resolve();
        };
        request.onerror = function () {
          resolve();
        }; // Resolve even on error
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * putTextureAtlas — save multiple texture atlas tiles in a single batched flush.
   * @param {Object} textures - Object mapping keys to data URLs.
   * @returns {Promise<void>} Resolves when all saved.
   */
  function putTextureAtlas(textures) {
    if (!textures || typeof textures !== 'object') return Promise.resolve();

    var promises = [];
    for (var key in textures) {
      if (textures.hasOwnProperty(key)) {
        promises.push(putTexture(key, textures[key]));
      }
    }
    return Promise.all(promises).then(function () {
      // Force flush to ensure all writes complete
      return flush();
    });
  }

  /**
   * getTexture — get a cached texture from IndexedDB.
   * Returns null on error (read operations are forgiving).
   * @param {string} key - Texture key.
   * @returns {Promise<string|null>} Resolves to data URL or null.
   */
  function getTexture(key) {
    if (!INDEXEDDB_AVAILABLE || !_db) return Promise.resolve(null);

    return new Promise(function (resolve) {
      try {
        var tx = _db.transaction([TEXTURE_STORE_NAME], 'readonly');
        var store = tx.objectStore(TEXTURE_STORE_NAME);
        var request = store.get(key);

        request.onsuccess = function () {
          resolve(
            request.result && request.result.data !== undefined
              ? request.result.data
              : null
          );
        };

        request.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Load all cached textures from IndexedDB for bulk restoration.
   * @returns {Promise<Object>} Object mapping keys to data URLs.
   */
  function getAllTextures() {
    if (!INDEXEDDB_AVAILABLE || !_db) return Promise.resolve({});

    return new Promise(function (resolve) {
      try {
        var tx = _db.transaction([TEXTURE_STORE_NAME], 'readonly');
        var store = tx.objectStore(TEXTURE_STORE_NAME);
        var request = store.getAll();

        request.onsuccess = function () {
          var result = {};
          var entries = request.result || [];
          for (var i = 0; i < entries.length; i++) {
            if (entries[i] && entries[i].data) {
              result[entries[i].key] = entries[i].data;
            }
          }
          resolve(result);
        };

        request.onerror = function () {
          resolve({});
        };
      } catch (e) {
        resolve({});
      }
    });
  }

  /**
   * clearTextureCache — clear the texture cache from IndexedDB.
   * @returns {Promise<void>} Resolves when cleared.
   */
  function clearTextureCache() {
    if (!INDEXEDDB_AVAILABLE || !_db) return Promise.resolve();

    return new Promise(function (resolve) {
      try {
        var tx = _db.transaction([TEXTURE_STORE_NAME], 'readwrite');
        var store = tx.objectStore(TEXTURE_STORE_NAME);
        var request = store.clear();

        request.onsuccess = function () {
          resolve();
        };
        request.onerror = function () {
          resolve();
        };
      } catch (e) {
        resolve();
      }
    });
  }

  // ============================================================
  // High-Level Cache Operations
  // ============================================================

  /**
   * Get a chunk from cache (memory first, then IndexedDB).
   * @param {string} key - Cache key.
   * @returns {Promise<*|null>} Resolves to cached data or null.
   */
  function getChunk(key) {
    if (!_isInitialized) return Promise.resolve(null);

    // Check memory cache first (synchronous check for existence)
    if (_memoryCacheHas(key)) {
      var memData = getFromMemoryCache(key);
      return Promise.resolve(memData);
    }

    // Fall back to IndexedDB
    return readFromIndexedDB(key).then(function (dbData) {
      if (dbData !== null) {
        // Populate memory cache
        putInMemoryCache(key, dbData);
      }
      return dbData;
    });
  }

  /**
   * Put a chunk in cache (memory + IndexedDB).
   * @param {string} key - Cache key.
   * @param {*} data - Chunk data to cache.
   */
  function putChunk(key, data) {
    if (!_isInitialized) return;

    // Store in memory
    putInMemoryCache(key, data);

    // Schedule IndexedDB write
    writeToIndexedDB(key, data);
  }

  /**
   * Delete a chunk from all caches.
   * @param {string} key - Cache key.
   */
  function deleteChunk(key) {
    _memoryCache.delete(key);
    var idx = _lruOrder.indexOf(key);
    if (idx >= 0) _lruOrder.splice(idx, 1);
    // deleteFromIndexedDB returns a Promise; catch errors to prevent unhandled rejections
    deleteFromIndexedDB(key).catch(function () { /* ignore */ });
  }

  /**
   * Get cache statistics.
   * @returns {{memorySize: number, lruSize: number, pendingWrites: number, indexedDBAvailable: boolean}}
   */
  function getStats() {
    return {
      memorySize: _memoryCache.size,
      lruSize: _lruOrder.length,
      pendingWrites: _pendingWrites.length,
      indexedDBAvailable: INDEXEDDB_AVAILABLE,
    };
  }

  // ============================================================
  // Initialization & Lifecycle
  // ============================================================

  /**
   * Initialize the storage system.
   * Must be called before any cache operations.
   * @returns {Promise<boolean>} True if fully initialized.
   */
  function init() {
    if (_isInitialized) return Promise.resolve(true);

    return _initIndexedDB().then(function (dbReady) {
      _isInitialized = true;

      // Load metadata if available
      if (dbReady) {
        loadMetadata(METADATA_KEY)
          .then(function (meta) {
            if (meta && meta.version !== STORAGE_VERSION) {
              // Version mismatch — log and clear old caches
              _warn(
                'Storage version mismatch: stored=' +
                  (meta && meta.version ? meta.version : 'unknown') +
                  ', expected=' +
                  STORAGE_VERSION
              );
              clearAllCaches();
            }
          })
          .catch(function (e) {
            /* ignore metadata load errors */
          });
      }

      return true;
    });
  }

  /**
   * Clear all caches (memory, IndexedDB).
   */
  function clearAllCaches() {
    clearMemoryCache();
    _pendingWrites = [];
    if (_saveTimeout) {
      clearTimeout(_saveTimeout);
      _saveTimeout = null;
    }

    if (INDEXEDDB_AVAILABLE && _db) {
      try {
        var tx = _db.transaction(
          [CHUNK_STORE_NAME, META_STORE_NAME],
          'readwrite'
        );
        tx.objectStore(CHUNK_STORE_NAME).clear();
        tx.objectStore(META_STORE_NAME).clear();
      } catch (e) {
        /* ignore */
      }
    }
  }

  /**
   * Flush all pending writes to disk.
   * Returns a promise that resolves when all writes are complete or times out after 2 seconds.
   * @returns {Promise} Resolves when all writes are complete (never rejects).
   */
  function flush() {
    // No pending work and no in-progress flush — resolve immediately
    if (_pendingWrites.length === 0 && !_flushPromise) {
      return Promise.resolve();
    }

    // Helper: wrap a promise with timeout
    var withTimeout = function (promise, ms) {
      return Promise.race([
        promise.catch(function () {
          /* ignore */
        }),
        new Promise(function (resolve) {
          setTimeout(resolve, ms);
        }),
      ]);
    };

    // If a flush is already in progress, wait for it with timeout
    if (_flushPromise) {
      return withTimeout(_flushPromise, 2000);
    }

    // Trigger a new flush
    var flushPromise = _flushPendingWrites();
    if (!flushPromise) {
      return Promise.resolve();
    }

    _flushPromise = flushPromise;
    return withTimeout(flushPromise, 2000);
  }

  /**
   * Destroy the storage system and free resources.
   * Flushes pending writes, closes IndexedDB connection, and clears all caches.
   * @returns {Promise<void>} Resolves when destruction is complete.
   */
  function destroy() {
    // Flush pending writes first, then close DB
    return flush()
      .then(function () {
        if (_db) {
          try {
            _db.close();
          } catch (e) {
            /* ignore */
          }
          _db = null;
        }
        clearMemoryCache();
        _isInitialized = false;
        INDEXEDDB_AVAILABLE = false;
      })
      .catch(function () {
        // Even if flush fails, clean up
        if (_db) {
          try {
            _db.close();
          } catch (e) {
            /* ignore */
          }
          _db = null;
        }
        clearMemoryCache();
        _isInitialized = false;
        INDEXEDDB_AVAILABLE = false;
      });
  }

  /**
   * Check if the storage system is ready for operations.
   * @returns {boolean} True if initialized and ready.
   */
  function isReady() {
    return _isInitialized;
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Donkeycraft.Storage — Browser storage cache manager.
   * Hybrid IndexedDB + in-memory LRU cache for terrain chunks and metadata.
   * Provides batched writes, automatic LRU eviction, and quota handling.
   * @namespace
   */
  Donkeycraft.Storage = {
    init: init,
    getChunk: getChunk,
    putChunk: putChunk,
    deleteChunk: deleteChunk,
    clearAllCaches: clearAllCaches,
    flush: flush,
    destroy: destroy,
    isReady: isReady,
    getStats: getStats,
    /**
     * Generate a deterministic cache key from chunk coordinates and parameters.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {number} biomeId - Biome ID.
     * @param {number} seed - World seed.
     * @returns {string} Cache key string.
     */
    makeKey: _makeKey,

    // Texture cache operations
    putTexture: putTexture,
    putTextureAtlas: putTextureAtlas,
    getTexture: getTexture,
    getAllTextures: getAllTextures,
    clearTextureCache: clearTextureCache,
  };
})();
