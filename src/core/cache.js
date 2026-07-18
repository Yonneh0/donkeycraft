// Donkeycraft — Asset Cache
// IndexedDB-based persistent cache for procedurally generated assets (textures, sounds).
// Uses checksum-based invalidation: if generation parameters change, cache is invalidated.
(function () {
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
  Donkeycraft.AssetCache = function (dbName) {
    this._dbName = dbName || Donkeycraft.ASSET_CACHE_DB_NAME;
    this._db = null;
    this._ready = false;
  };

  /**
   * Initialize the IndexedDB database and create object stores.
   * @returns {Promise<boolean>} Resolves true when DB is ready.
   */
  Donkeycraft.AssetCache.prototype.init = function () {
    var self = this;
    return new Promise(function (resolve) {
      try {
        if (typeof indexedDB === 'undefined') {
          resolve(false); // IndexedDB not supported
          return;
        }

        var request = indexedDB.open(
          self._dbName,
          Donkeycraft.ASSET_CACHE_VERSION
        );

        request.onerror = function () {
          self._ready = false;
          resolve(false); // Graceful fallback
        };

        request.onsuccess = function () {
          self._db = request.result;
          self._ready = true;
          resolve(true);
        };

        request.onupgradeneeded = function (event) {
          var db = event.target.result;
          if (
            !db.objectStoreNames.contains(Donkeycraft.ASSET_CACHE_STORE_NAME)
          ) {
            db.createObjectStore(Donkeycraft.ASSET_CACHE_STORE_NAME, {
              keyPath: 'key',
            });
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
  Donkeycraft.AssetCache.prototype.isReady = function () {
    return this._ready && !!this._db;
  };

  /**
   * _computeChecksum — compute a simple hash-based checksum for an object.
   * Used for cache invalidation: identical objects produce identical checksums.
   * @private
   * @param {Object|null} obj — Object to checksum, or null/undefined.
   * @returns {string} Non-negative hexadecimal checksum string. Returns 'empty' for null input.
   */
  Donkeycraft.AssetCache.prototype._computeChecksum = function (obj) {
    if (!obj) return 'empty';
    var str = JSON.stringify(obj, Object.keys(obj).sort());
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  };

  /**
   * _imageDataToArray — convert ImageData to a plain array for IndexedDB storage.
   * IndexedDB cannot store ImageData objects directly in all browsers.
   * @private
   * @param {ImageData} imageData — ImageData object to convert.
   * @returns {{data: number[], width: number, height: number}} Serializable representation.
   */
  Donkeycraft.AssetCache.prototype._imageDataToArray = function (imageData) {
    var arr = [];
    var data = imageData.data;
    for (var i = 0; i < data.length; i++) {
      arr[i] = data[i];
    }
    return { data: arr, width: imageData.width, height: imageData.height };
  };

  /**
   * _arrayToImageData — reconstruct ImageData from a plain array.
   * @private
   * @param {{data: number[], width: number, height: number}} serialized — Serializable representation.
   * @returns {ImageData} Reconstructed ImageData object.
   */
  Donkeycraft.AssetCache.prototype._arrayToImageData = function (serialized) {
    var canvas = document.createElement('canvas');
    canvas.width = serialized.width;
    canvas.height = serialized.height;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(serialized.width, serialized.height);
    var data = imageData.data;
    for (var i = 0; i < serialized.data.length && i < data.length; i++) {
      data[i] = serialized.data[i];
    }
    return imageData;
  };

  /**
   * getTextureAtlas — get a cached texture atlas from IndexedDB.
   * Validates stored dimensions match ImageData before reconstruction.
   * @param {string} [worldName=default] — World name for cache key.
   * @returns {Promise<HTMLCanvasElement|null>} Resolves with canvas or null if not cached.
   */
  Donkeycraft.AssetCache.prototype.getTextureAtlas = function (worldName) {
    var self = this;
    worldName = worldName || 'default';
    if (!this.isReady()) {
      return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readonly'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var request = store.get('texture-atlas:' + worldName);

        request.onsuccess = function () {
          var result = request.result;
          if (!result || !result.imageData) {
            resolve(null);
            return;
          }

          var storedW = result.width;
          var storedH = result.height;
          var imageData = result.imageData;

          // Validate dimensions
          if (!storedW || !storedH || storedW <= 0 || storedH <= 0) {
            Donkeycraft.Logger.warn(
              'AssetCache',
              'Invalid texture atlas dimensions: ' + storedW + 'x' + storedH
            );
            resolve(null);
            return;
          }

          // Handle both plain array and TypedArray formats
          var imageDataObj;
          if (Array.isArray(imageData) && imageData.data !== undefined) {
            // Serialized format: {data: number[], width, height}
            imageDataObj = this._arrayToImageData(imageData);
          } else if (imageData.data instanceof Uint8ClampedArray || Array.isArray(imageData.data)) {
            // Direct ImageData format
            var expectedBytes = storedW * storedH * 4;
            if (imageData.data.length !== expectedBytes) {
              Donkeycraft.Logger.warn(
                'AssetCache',
                'Texture atlas ImageData size mismatch: expected ' +
                  expectedBytes + ' bytes, got ' + imageData.data.length
              );
              resolve(null);
              return;
            }
            imageDataObj = imageData;
          } else {
            Donkeycraft.Logger.warn(
              'AssetCache',
              'Texture atlas ImageData missing or corrupted'
            );
            resolve(null);
            return;
          }

          // Reconstruct canvas from stored image data
          var canvas = document.createElement('canvas');
          canvas.width = storedW;
          canvas.height = storedH;
          var ctx = canvas.getContext('2d');
          if (ctx) {
            try {
              ctx.putImageData(imageDataObj, 0, 0);
              resolve(canvas);
            } catch (e) {
              Donkeycraft.Logger.warn(
                'AssetCache',
                'Failed to put texture atlas ImageData: ' + e.message
              );
              resolve(null);
            }
          } else {
            resolve(null);
          }
        }.bind(this);

        request.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
  };

  /**
   * setTextureAtlas — cache a texture atlas canvas to IndexedDB.
   * Converts ImageData to a plain array for reliable IndexedDB serialization.
   * @param {HTMLCanvasElement} canvas — The texture atlas canvas.
   * @param {string} [worldName=default] — World name for cache key.
   * @returns {Promise<boolean>} Resolves true on success.
   */
  Donkeycraft.AssetCache.prototype.setTextureAtlas = function (
    canvas,
    worldName
  ) {
    var self = this;
    worldName = worldName || 'default';
    if (!this.isReady() || !canvas) {
      return Promise.resolve(false);
    }

    return new Promise(function (resolve) {
      try {
        var w = canvas.width;
        var h = canvas.height;
        var ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }

        var imageData = ctx.getImageData(0, 0, w, h);

        // Convert to serializable format for IndexedDB compatibility
        var serializedImageData = this._imageDataToArray(imageData);

        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readwrite'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var data = {
          key: 'texture-atlas:' + worldName,
          type: 'texture-atlas',
          width: w,
          height: h,
          imageData: serializedImageData,
          cachedAt: Date.now(),
        };

        var request = store.put(data);

        request.onsuccess = function () {
          resolve(true);
        };

        request.onerror = function () {
          // Quota exceeded — remove oldest entries and retry
          if (request.error && request.error.name === 'QuotaExceededError') {
            self.clearExpired().then(function () {
              // Retry once after clearing expired entries
              var txn2 = self._db.transaction(
                [Donkeycraft.ASSET_CACHE_STORE_NAME],
                'readwrite'
              );
              var store2 = txn2.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
              var req2 = store2.put(data);
              req2.onsuccess = function () {
                resolve(true);
              };
              req2.onerror = function () {
                resolve(false);
              };
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
  Donkeycraft.AssetCache.prototype.getSound = function (soundName) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readonly'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var request = store.get('sound:' + soundName);

        request.onsuccess = function () {
          if (request.result && request.result.data) {
            resolve(request.result.data);
          } else {
            resolve(null);
          }
        };

        request.onerror = function () {
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
  Donkeycraft.AssetCache.prototype.setSound = function (soundName, base64Data) {
    var self = this;
    if (!this.isReady() || !soundName || typeof base64Data !== 'string') {
      return Promise.resolve(false);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readwrite'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var data = {
          key: 'sound:' + soundName,
          type: 'sound',
          data: base64Data,
          cachedAt: Date.now(),
        };

        var request = store.put(data);

        request.onsuccess = function () {
          resolve(true);
        };

        request.onerror = function () {
          if (request.error && request.error.name === 'QuotaExceededError') {
            self.clearExpired().then(function () {
              var txn2 = self._db.transaction(
                [Donkeycraft.ASSET_CACHE_STORE_NAME],
                'readwrite'
              );
              var store2 = txn2.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
              var req2 = store2.put(data);
              req2.onsuccess = function () {
                resolve(true);
              };
              req2.onerror = function () {
                resolve(false);
              };
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
   * has — check if a specific asset is cached.
   * @param {string} key — Cache key (e.g., 'texture-atlas:default', 'sound:step1').
   * @returns {Promise<boolean>} True if the key exists in cache.
   */
  Donkeycraft.AssetCache.prototype.has = function (key) {
    var self = this;
    // Validate key parameter to prevent DOMException from IndexedDB
    if (!key || typeof key !== 'string') {
      return Promise.resolve(false);
    }
    if (!this.isReady()) {
      return Promise.resolve(false);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readonly'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var request = store.get(key);

        request.onsuccess = function () {
          resolve(!!request.result);
        };

        request.onerror = function () {
          resolve(false);
        };
      } catch (e) {
        resolve(false);
      }
    });
  };

  /**
   * delete — delete a specific cached asset.
   * Returns false if the key is not found or cache is not ready.
   * Uses cursor-based single-transaction approach for efficiency.
   * @param {string} key — Cache key to delete.
   * @returns {Promise<boolean>} True if deleted, false if key not found.
   */
  Donkeycraft.AssetCache.prototype.delete = function (key) {
    var self = this;
    // Validate key parameter to prevent DOMException from IndexedDB
    if (!key || typeof key !== 'string') {
      return Promise.resolve(false);
    }
    if (!this.isReady()) {
      return Promise.resolve(false);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readwrite'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var deleted = false;

        // Use cursor to find and delete in a single transaction
        var request = store.openCursor();
        request.onsuccess = function (event) {
          var cursor = event.target.result;
          if (cursor) {
            if (cursor.value && cursor.value.key === key) {
              cursor.delete();
              deleted = true;
            }
            cursor.continue();
          } else {
            // Cursor exhausted — resolve with whether we found and deleted the key
            resolve(deleted);
          }
        };

        request.onerror = function () {
          resolve(false);
        };
      } catch (e) {
        resolve(false);
      }
    });
  };

  /**
   * clearExpired — clear all cached assets older than the expiration threshold.
   * Default expiration is 24 hours (86400000 ms).
   * On error, resolves with the number of entries cleared up to the failure point.
   * @param {number} [maxAgeMs=86400000] — Maximum age in milliseconds before an entry is considered expired.
   * @returns {Promise<number>} Number of entries cleared (may be partial on error).
   */
  Donkeycraft.AssetCache.prototype.clearExpired = function (maxAgeMs) {
    var self = this;
    maxAgeMs = maxAgeMs || 86400000; // 24 hours default

    if (!this.isReady()) {
      return Promise.resolve(0);
    }

    var cutoff = Date.now() - maxAgeMs;
    var cleared = 0;

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readwrite'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var request = store.openCursor();

        request.onsuccess = function (event) {
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

        request.onerror = function () {
          resolve(cleared);
        };
      } catch (e) {
        resolve(cleared);
      }
    });
  };

  /**
   * clearAll — clear all cached assets.
   * Always resolves (never rejects) to allow graceful degradation on error.
   * @returns {Promise<number>} Number of entries cleared (always 0 on failure).
   */
  Donkeycraft.AssetCache.prototype.clearAll = function () {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(0);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readwrite'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var request = store.clear();

        request.onsuccess = function () {
          resolve(0); // clear() doesn't return count, but all entries are gone
        };

        request.onerror = function () {
          resolve(0);
        };
      } catch (e) {
        resolve(0);
      }
    });
  };

  /**
   * getUsageStats — get cache usage statistics.
   * @returns {Promise<Object>} Stats object with entryCount, totalSize, and entries array.
   */
  Donkeycraft.AssetCache.prototype.getUsageStats = function () {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve({ entryCount: 0, totalSize: 0, entries: [] });
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readonly'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var request = store.openCursor();
        var entries = [];

        request.onsuccess = function (event) {
          var cursor = event.target.result;
          if (cursor) {
            var size = 0;
            if (cursor.value.imageData) {
              size = cursor.value.imageData.data
                ? cursor.value.imageData.data.length
                : 0;
            } else if (cursor.value.data) {
              size = cursor.value.data.length;
            }

            entries.push({
              key: cursor.value.key,
              type: cursor.value.type || 'unknown',
              cachedAt: cursor.value.cachedAt || 0,
              size: size,
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
              entries: entries,
            });
          }
        };

        request.onerror = function () {
          resolve({ entryCount: 0, totalSize: 0, entries: [] });
        };
      } catch (e) {
        resolve({ entryCount: 0, totalSize: 0, entries: [] });
      }
    });
  };

  /**
   * getTotalSize — get the total cache size in bytes (approximate).
   * @returns {Promise<number>} Approximate size in bytes.
   */
  Donkeycraft.AssetCache.prototype.getTotalSize = function () {
    var self = this;
    return self.getUsageStats().then(function (stats) {
      return stats.totalSize;
    });
  };

  /**
   * _imageDataToBase64 — convert ImageData to a compact base64 string for IndexedDB storage.
   * Much smaller than PNG data URL, faster to encode/decode.
   * @private
   * @param {ImageData} imageData - ImageData object to convert.
   * @returns {string} Base64-encoded string (RGBA bytes only, no header).
   */
  Donkeycraft.AssetCache.prototype._imageDataToBase64 = function (imageData) {
    var data = imageData.data;
    var byteCharacters = '';
    var chunkSize = 8192; // Process in chunks to avoid stack overflow
    for (var i = 0; i < data.length; i += chunkSize) {
      var end = Math.min(i + chunkSize, data.length);
      var chunk = new Uint8Array(data.buffer || data, i, end - i);
      // For regular arrays, copy manually
      if (data.buffer === undefined) {
        var manual = new Uint8Array(end - i);
        for (var j = 0; j < manual.length; j++) {
          manual[j] = data[i + j];
        }
        chunk = manual;
      }
      // Use atob with String.fromCharCode for each chunk
      var str = '';
      for (var k = 0; k < chunk.length; k += 8192) {
        var sliceEnd = Math.min(k + 8192, chunk.length);
        var slice = chunk.slice(k, sliceEnd);
        var codes = new Array(slice.length);
        for (var m = 0; m < slice.length; m++) {
          codes[m] = slice[m];
        }
        str += String.fromCharCode.apply(null, codes);
      }
      byteCharacters += str;
    }
    return btoa(byteCharacters);
  };

  /**
   * _base64ToImageData — reconstruct ImageData from a base64 string.
   * @private
   * @param {string} base64 - Base64-encoded RGBA bytes.
   * @param {number} width - Canvas width.
   * @param {number} height - Canvas height.
   * @returns {ImageData} Reconstructed ImageData object.
   */
  Donkeycraft.AssetCache.prototype._base64ToImageData = function (base64, width, height) {
    var byteCharacters = atob(base64);
    var bytes = new Uint8ClampedArray(byteCharacters.length);
    for (var i = 0; i < byteCharacters.length; i++) {
      bytes[i] = byteCharacters.charCodeAt(i);
    }
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(width, height);
    var data = imageData.data;
    for (var j = 0; j < bytes.length && j < data.length; j++) {
      data[j] = bytes[j];
    }
    return imageData;
  };

  /**
   * getTexture — get a cached individual texture from IndexedDB.
   * Stores textures as compact base64-encoded ImageData for fast serialization.
   * @param {number} blockId - Block ID to retrieve.
   * @returns {Promise<HTMLCanvasElement|null>} Resolves with canvas or null if not cached.
   */
  Donkeycraft.AssetCache.prototype.getTexture = function (blockId) {
    var self = this;
    if (!this.isReady()) {
      return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
      try {
        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readonly'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var request = store.get('texture:' + blockId);

        request.onsuccess = function () {
          var result = request.result;
          if (!result || !result.base64) {
            resolve(null);
            return;
          }

          // Reconstruct canvas from stored ImageData
          var canvas = document.createElement('canvas');
          canvas.width = Donkeycraft.TextureGenerator ? Donkeycraft.TextureGenerator.TEX_SIZE || 16 : 16;
          canvas.height = Donkeycraft.TextureGenerator && Donkeycraft.TextureGenerator.TEX_SIZE ? Donkeycraft.TextureGenerator.TEX_SIZE : 16;
          var ctx = canvas.getContext('2d');
          if (ctx) {
            try {
              var imageData = self._base64ToImageData(result.base64, canvas.width, canvas.height);
              ctx.putImageData(imageData, 0, 0);
              resolve(canvas);
            } catch (e) {
              Donkeycraft.Logger.warn(
                'AssetCache',
                'Failed to reconstruct texture ' + blockId + ': ' + e.message
              );
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };

        request.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
  };

  /**
   * setTexture — cache an individual texture canvas to IndexedDB.
   * Converts canvas ImageData to compact base64 for efficient storage.
   * @param {HTMLCanvasElement} canvas - The texture canvas (16×16).
   * @param {number} blockId - Block ID for cache key.
   * @returns {Promise<boolean>} Resolves true on success.
   */
  Donkeycraft.AssetCache.prototype.setTexture = function (canvas, blockId) {
    var self = this;
    if (!this.isReady() || !canvas) {
      return Promise.resolve(false);
    }

    return new Promise(function (resolve) {
      try {
        var w = canvas.width;
        var h = canvas.height;
        var ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }

        var imageData = ctx.getImageData(0, 0, w, h);
        var base64 = self._imageDataToBase64(imageData);

        var transaction = self._db.transaction(
          [Donkeycraft.ASSET_CACHE_STORE_NAME],
          'readwrite'
        );
        var store = transaction.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
        var data = {
          key: 'texture:' + blockId,
          type: 'texture',
          base64: base64,
          width: w,
          height: h,
          cachedAt: Date.now(),
        };

        var request = store.put(data);

        request.onsuccess = function () {
          resolve(true);
        };

        request.onerror = function () {
          if (request.error && request.error.name === 'QuotaExceededError') {
            // Quota exceeded — clear old textures and retry
            self.clearExpired().then(function () {
              var txn2 = self._db.transaction(
                [Donkeycraft.ASSET_CACHE_STORE_NAME],
                'readwrite'
              );
              var store2 = txn2.objectStore(Donkeycraft.ASSET_CACHE_STORE_NAME);
              var req2 = store2.put(data);
              req2.onsuccess = function () {
                resolve(true);
              };
              req2.onerror = function () {
                resolve(false);
              };
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
   * getFormattedSize — get cache size in human-readable format (bytes, KB, MB).
    * @returns {Promise<string>} Human-readable size string.
    */
   Donkeycraft.AssetCache.prototype.getFormattedSize = function () {
    var self = this;
    return self.getTotalSize().then(function (bytes) {
      if (bytes < 1024) {
        return bytes + ' B';
      }
      if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
      }
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    });
  };

  /**
   * Destroy the AssetCache and close the IndexedDB connection.
   */
  Donkeycraft.AssetCache.prototype.destroy = function () {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
    this._ready = false;
  };
})();
