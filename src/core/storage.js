// Donkeycraft — Browser Storage Cache Manager
// Hybrid localStorage + IndexedDB caching for terrain chunks and metadata.
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
    var DB_NAME = 'DonkeycraftStorage';
    var DB_VERSION = STORAGE_VERSION;
    var MAX_CHUNK_CACHE_SIZE = 50; // Max chunks to keep in memory (LRU)
    var INDEXEDDB_AVAILABLE = false;

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

    // ============================================================
    // Utility Functions
    // ============================================================

    /**
     * Generate a deterministic cache key from chunk coordinates and parameters.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {number} biomeId - Biome ID.
     * @param {number} seed - World seed.
     * @returns {string} Cache key string.
     * @private
     */
    function _makeKey(chunkX, chunkZ, biomeId, seed) {
        return 'chunk_' + chunkX + '_' + chunkZ + '_b' + biomeId + '_s' + seed;
    }

    /**
     * Update LRU order for a cache entry.
     * Moves the key to the end (most recently used).
     * @param {string} key - Cache key.
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
     * Evict oldest entries from memory cache when size exceeds limit.
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
     * @param {string} message - Warning message.
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
     * @returns {boolean} True if IndexedDB is supported.
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
                    _warn('IndexedDB open failed: ' + (request.error ? String(request.error) : 'unknown error'));
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
                        var chunkStore = db.createObjectStore(CHUNK_STORE_NAME, { keyPath: 'key' });
                        chunkStore.createIndex('biome', 'biomeId', { unique: false });
                        chunkStore.createIndex('seed', 'seed', { unique: false });
                    }

                    // Metadata store: stores small metadata (last save time, version, etc.)
                    if (!db.objectStoreNames.contains(META_STORE_NAME)) {
                        db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
                    }
                };
            } catch (e) {
                INDEXEDDB_AVAILABLE = false;
                _warn('IndexedDB initialization error: ' + (e && e.message ? e.message : String(e)));
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
                    resolve(request.result && request.result.data !== undefined ? request.result.data : null);
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
     * Flush all pending writes to IndexedDB in a single transaction.
     * Returns a Promise that resolves when the flush is complete.
     * @returns {Promise} Resolves when flush is done.
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

        // Return a new promise that resolves when the transaction completes
        _flushPromise = new Promise(function (resolve) {
            try {
                var tx = _db.transaction([CHUNK_STORE_NAME], 'readwrite');
                var store = tx.objectStore(CHUNK_STORE_NAME);

                for (var i = 0; i < _pendingWrites.length; i++) {
                    var write = _pendingWrites[i];
                    store.put({ key: write.key, data: write.data, savedAt: Date.now() });
                }

                tx.oncomplete = function () {
                    _pendingWrites = [];
                    _flushPromise = null;
                    resolve();
                };

                tx.onerror = function () {
                    // Check for quota exceeded error
                    if (tx.error && tx.error.name === 'QuotaExceededError') {
                        _warn('IndexedDB quota exceeded — clearing old cache entries');
                        clearAllCaches();
                    }
                    _pendingWrites = [];
                    _flushPromise = null;
                    resolve(); // Resolve anyway to avoid hanging
                };
            } catch (e) {
                _warn('Flush error: ' + (e && e.message ? e.message : String(e)));
                _pendingWrites = [];
                _flushPromise = null;
                resolve();
            }
        });

        return _flushPromise;
    }

    /**
     * Delete a chunk from IndexedDB.
     * @param {string} key - Cache key.
     */
    function deleteFromIndexedDB(key) {
        if (!INDEXEDDB_AVAILABLE || !_db) return;

        try {
            var tx = _db.transaction([CHUNK_STORE_NAME], 'readwrite');
            var store = tx.objectStore(CHUNK_STORE_NAME);
            store.delete(key);
        } catch (e) { /* ignore */ }
    }

    // ============================================================
    // Metadata Operations
    // ============================================================

    /**
     * Save metadata to IndexedDB.
     * @param {string} key - Metadata key.
     * @param {*} data - Metadata data.
     */
    function saveMetadata(key, data) {
        if (!INDEXEDDB_AVAILABLE || !_db) return;

        try {
            var tx = _db.transaction([META_STORE_NAME], 'readwrite');
            var store = tx.objectStore(META_STORE_NAME);
            store.put({ key: key, data: data, savedAt: Date.now() });
        } catch (e) { /* ignore */ }
    }

    /**
     * Load metadata from IndexedDB.
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
                    resolve(request.result && request.result.data !== undefined ? request.result.data : null);
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
        deleteFromIndexedDB(key);
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
            indexedDBAvailable: INDEXEDDB_AVAILABLE
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
                loadMetadata(METADATA_KEY).then(function (meta) {
                    if (meta && meta.version !== STORAGE_VERSION) {
                        // Version mismatch — log and clear old caches
                        _warn('Storage version mismatch: stored=' + (meta && meta.version ? meta.version : 'unknown') + ', expected=' + STORAGE_VERSION);
                        clearAllCaches();
                    }
                }).catch(function(e) { /* ignore metadata load errors */ });
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
                var tx = _db.transaction([CHUNK_STORE_NAME, META_STORE_NAME], 'readwrite');
                tx.objectStore(CHUNK_STORE_NAME).clear();
                tx.objectStore(META_STORE_NAME).clear();
            } catch (e) { /* ignore */ }
        }
    }

    /**
     * Flush all pending writes to disk.
     * @returns {Promise} Resolves when all writes are complete.
     */
    function flush() {
        if (_pendingWrites.length === 0 && !_flushPromise) {
            return Promise.resolve();
        }

        // If a flush is already in progress, wait for it
        if (_flushPromise) {
            return _flushPromise;
        }

        // Trigger a new flush
        _flushPendingWrites();

        // Return the promise (it resolves when the IndexedDB transaction completes)
        return new Promise(function (resolve) {
            function checkFlush() {
                if (!_flushPromise && _pendingWrites.length === 0) {
                    resolve();
                } else if (_flushPromise) {
                    _flushPromise.then(checkFlush);
                } else {
                    // Timeout after 1 second
                    setTimeout(resolve, 100);
                }
            }
            // Give the flush a brief window to complete
            setTimeout(checkFlush, 50);
        });
    }

    /**
     * Destroy the storage system and free resources.
     */
    function destroy() {
        // Flush pending writes first, then close DB
        return flush().then(function () {
            if (_db) {
                try { _db.close(); } catch (e) { /* ignore */ }
                _db = null;
            }
            clearMemoryCache();
            _isInitialized = false;
            INDEXEDDB_AVAILABLE = false;
        }).catch(function(e) {
            // Even if flush fails, clean up
            if (_db) {
                try { _db.close(); } catch (e) { /* ignore */ }
                _db = null;
            }
            clearMemoryCache();
            _isInitialized = false;
            INDEXEDDB_AVAILABLE = false;
        });
    }

    /**
     * Check if the storage system is ready.
     * @returns {boolean} True if initialized.
     */
    function isReady() {
        return _isInitialized;
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Donkeycraft.Storage — Browser storage cache manager.
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
        getStats: getStats
    };

})();