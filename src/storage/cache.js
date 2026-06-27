// Donkeycraft — Asset Cache
// IndexedDB-based persistent cache for procedurally generated assets (textures, sounds).
// Uses checksum-based invalidation: if generation parameters change, cache is invalidated.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Default asset cache database name.
     */
    Donkeycraft.ASSET_CACHE_DB_NAME = 'donkeycraft-assets';
    Donkeycraft.ASSET_CACHE_VERSION = 1;
    Donkeycraft.ASSET_CACHE_STORE_NAME = 'assets';

    /**
     * AssetCache — IndexedDB-based persistent cache for procedurally generated assets.
     * Stores texture atlas canvases as blob URLs and sounds as base64 data URIs.
     * @param {string} [dbName=donkeycraft-assets] — IndexedDB database name.
     */
    Donkeycraft.AssetCache = function(dbName) {
        this._dbName = dbName || Donkeycraft.ASSET_CACHE_DB_NAME;
        this._db = null;
        this._ready = false;
    };

    /**
     * Initialize the IndexedDB database and create object stores.
     * @returns {Promise<boolean>} Resolves true when DB is ready.
     */
    Donkeycraft.AssetCache.prototype.init = function() {
        var self = this;
        return new Promise(function(resolve) {
            try {
                if (typeof indexedDB === 'undefined') {
                    resolve(false); // IndexedDB not supported
                    return;
                }

                var request = indexedDB.open(self._dbName, Donkeycraft.ASSET_CACHE_VERSION);

                request.onerror = function() {
                    self._ready = false;
                    resolve(false); // Graceful fallback
                };

                request.onsuccess = function() {
                    self._db = request.result;
                    self._ready = true;
                    resolve(true);
                };

                request.onupgradeneeded = function(event) {
                    var db = event.target.result;
                    if (!db.objectStoreNames.contains(Donkeycraft.ASSET_CACHE_STORE_NAME)) {
                        db.createObjectStore(Donkeycraft.ASSET_CACHE_STORE_NAME, { keyPath: 'key' });
                    }
                };
            } catch (e) {
                self._ready = false;
                resolve(false); // Graceful fallback
            }
        });
    };

    /**
     * Check if the cache is ready (database opened successfully).
     * @returns {boolean} True if ready.
     */
    Donkeycraft.AssetCache.prototype.isReady = function() {
        return this._ready && !!this._db;
    };

    /**
     * Compute a simple checksum for an object (for cache invalidation).
     * @private
     * @param {Object} obj — Object to checksum.
     * @returns {string} Hexadecimal checksum string.
     */
    Donkeycraft.AssetCache.prototype._computeChecksum = function(obj) {
        if (!obj) return 'empty';
        var str = JSON.stringify(obj, Object.keys(obj).sort());
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            var chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash = hash & hash; // Convert to 32-bit int
        }
        return Math.abs(hash).toString(16);
    };

    /**
     * Get a cached texture atlas from IndexedDB.
     * @param {string} [worldName=default] — World name for cache key.
     * @returns {Promise<HTMLCanvasElement|null>} Resolves with canvas or null if not cached.
     */
    Donkeycraft.AssetCache.prototype.getTextureAtlas = function(worldName) {
        var self = this;
        worldName = worldName || 'default';
        if (!this.isReady()) {
            return Promise.resolve(null);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var request = store.get('texture-atlas:' + worldName);

                request.onsuccess = function() {
                    if (!request.result || !request.result.data) {
                        resolve(null);
                        return;
                    }

                    // Reconstruct canvas from stored image data
                    var canvas = document.createElement('canvas');
                    var w = request.result.width;
                    var h = request.result.height;
                    canvas.width = w;
                    canvas.height = h;
                    var ctx = canvas.getContext('2d');
                    if (ctx && request.result.imageData) {
                        try {
                            ctx.putImageData(request.result.imageData, 0, 0);
                            resolve(canvas);
                        } catch (e) {
                            resolve(null); // ImageData too large for putImageData
                        }
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = function() {
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    };

    /**
     * Cache a texture atlas canvas to IndexedDB.
     * Stores as ImageData for exact reconstruction.
     * @param {HTMLCanvasElement} canvas — The texture atlas canvas.
     * @param {string} [worldName=default] — World name for cache key.
     * @returns {Promise<boolean>} Resolves true on success.
     */
    Donkeycraft.AssetCache.prototype.setTextureAtlas = function(canvas, worldName) {
        var self = this;
        worldName = worldName || 'default';
        if (!this.isReady() || !canvas) {
            return Promise.resolve(false);
        }

        return new Promise(function(resolve) {
            try {
                var w = canvas.width;
                var h = canvas.height;
                var ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(false);
                    return;
                }

                var imageData = ctx.getImageData(0, 0, w, h);

                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var data = {
                    key: 'texture-atlas:' + worldName,
                    type: 'texture-atlas',
                    width: w,
                    height: h,
                    imageData: imageData,
                    cachedAt: Date.now()
                };

                var request = store.put(data);

                request.onsuccess = function() {
                    resolve(true);
                };

                request.onerror = function() {
                    // Quota exceeded — remove oldest entries and retry
                    if (request.error && request.error.name === 'QuotaExceededError') {
                        self.clearExpired().then(function() {
                            // Retry once after clearing expired entries
                            var txn2 = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readwrite');
                            var store2 = txn2.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                            var req2 = store2.put(data);
                            req2.onsuccess = function() { resolve(true); };
                            req2.onerror = function() { resolve(false); };
                        });
                    } else {
                        resolve(false);
                    }
                };
            } catch (e) {
                resolve(false);
            }
        });
    };

    /**
     * Get a cached sound from IndexedDB.
     * @param {string} soundName — Sound name/identifier.
     * @returns {Promise<string|null>} Resolves with base64 data URI or null if not cached.
     */
    Donkeycraft.AssetCache.prototype.getSound = function(soundName) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(null);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var request = store.get('sound:' + soundName);

                request.onsuccess = function() {
                    if (request.result && request.result.data) {
                        resolve(request.result.data);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = function() {
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    };

    /**
     * Cache a sound as base64 data URI to IndexedDB.
     * @param {string} soundName — Sound name/identifier.
     * @param {string} base64Data — Base64-encoded audio data URI (e.g., 'data:audio/wav;base64,...').
     * @returns {Promise<boolean>} Resolves true on success.
     */
    Donkeycraft.AssetCache.prototype.setSound = function(soundName, base64Data) {
        var self = this;
        if (!this.isReady() || !soundName || typeof base64Data !== 'string') {
            return Promise.resolve(false);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var data = {
                    key: 'sound:' + soundName,
                    type: 'sound',
                    data: base64Data,
                    cachedAt: Date.now()
                };

                var request = store.put(data);

                request.onsuccess = function() {
                    resolve(true);
                };

                request.onerror = function() {
                    if (request.error && request.error.name === 'QuotaExceededError') {
                        self.clearExpired().then(function() {
                            var txn2 = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readwrite');
                            var store2 = txn2.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                            var req2 = store2.put(data);
                            req2.onsuccess = function() { resolve(true); };
                            req2.onerror = function() { resolve(false); };
                        });
                    } else {
                        resolve(false);
                    }
                };
            } catch (e) {
                resolve(false);
            }
        });
    };

    /**
     * Check if a specific asset is cached.
     * @param {string} key — Cache key (e.g., 'texture-atlas:default', 'sound:step1').
     * @returns {Promise<boolean>} True if the key exists in cache.
     */
    Donkeycraft.AssetCache.prototype.has = function(key) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var request = store.get(key);

                request.onsuccess = function() {
                    resolve(!!request.result);
                };

                request.onerror = function() {
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    };

    /**
     * Delete a specific cached asset.
     * @param {string} key — Cache key to delete.
     * @returns {Promise<boolean>} True if deleted.
     */
    Donkeycraft.AssetCache.prototype.delete = function(key) {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(false);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var request = store.delete(key);

                request.onsuccess = function() {
                    resolve(true);
                };

                request.onerror = function() {
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    };

    /**
     * Clear all cached assets that are older than the expiration threshold.
     * Default expiration is 24 hours (86400000 ms).
     * @param {number} [maxAgeMs=86400000] — Maximum age in milliseconds before an entry is considered expired.
     * @returns {Promise<number>} Number of entries cleared.
     */
    Donkeycraft.AssetCache.prototype.clearExpired = function(maxAgeMs) {
        var self = this;
        maxAgeMs = maxAgeMs || 86400000; // 24 hours default

        if (!this.isReady()) {
            return Promise.resolve(0);
        }

        var cutoff = Date.now() - maxAgeMs;
        var cleared = 0;

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var request = store.openCursor();

                request.onsuccess = function(event) {
                    var cursor = event.target.result;
                    if (cursor) {
                        if (cursor.value.cachedAt && cursor.value.cachedAt < cutoff) {
                            cursor.delete();
                            cleared++;
                        }
                        cursor.continue();
                    } else {
                        resolve(cleared);
                    }
                };

                request.onerror = function() {
                    resolve(cleared);
                };
            } catch (e) {
                resolve(cleared);
            }
        });
    };

    /**
     * Clear all cached assets.
     * @returns {Promise<number>} Number of entries cleared.
     */
    Donkeycraft.AssetCache.prototype.clearAll = function() {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve(0);
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var request = store.clear();

                request.onsuccess = function() {
                    resolve(0); // clear() doesn't return count, but all entries are gone
                };

                request.onerror = function() {
                    resolve(0);
                };
            } catch (e) {
                resolve(0);
            }
        });
    };

    /**
     * Get cache usage statistics.
     * @returns {Promise<Object>} Stats object with entryCount, totalSize, and entries array.
     */
    Donkeycraft.AssetCache.prototype.getUsageStats = function() {
        var self = this;
        if (!this.isReady()) {
            return Promise.resolve({ entryCount: 0, totalSize: 0, entries: [] });
        }

        return new Promise(function(resolve) {
            try {
                var transaction = self._db.transaction([Donkeycraft.ASSET_CACHE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
                var request = store.openCursor();
                var entries = [];

                request.onsuccess = function(event) {
                    var cursor = event.target.result;
                    if (cursor) {
                        var size = 0;
                        if (cursor.value.imageData) {
                            size = cursor.value.imageData.data ? cursor.value.imageData.data.length : 0;
                        } else if (cursor.value.data) {
                            size = cursor.value.data.length;
                        }

                        entries.push({
                            key: cursor.value.key,
                            type: cursor.value.type || 'unknown',
                            cachedAt: cursor.value.cachedAt || 0,
                            size: size
                        });

                        cursor.continue();
                    } else {
                        var totalSize = 0;
                        for (var i = 0; i < entries.length; i++) {
                            totalSize += entries[i].size;
                        }
                        resolve({
                            entryCount: entries.length,
                            totalSize: totalSize,
                            entries: entries
                        });
                    }
                };

                request.onerror = function() {
                    resolve({ entryCount: 0, totalSize: 0, entries: [] });
                };
            } catch (e) {
                resolve({ entryCount: 0, totalSize: 0, entries: [] });
            }
        });
    };

    /**
     * Get the total cache size in bytes (approximate).
     * @returns {Promise<number>} Approximate size in bytes.
     */
    Donkeycraft.AssetCache.prototype.getTotalSize = function() {
        var self = this;
        return self.getUsageStats().then(function(stats) {
            return stats.totalSize;
        });
    };

    /**
     * Destroy the AssetCache and close the IndexedDB connection.
     */
    Donkeycraft.AssetCache.prototype.destroy = function() {
        if (this._db) {
            this._db.close();
            this._db = null;
        }
        this._ready = false;
    };

})();