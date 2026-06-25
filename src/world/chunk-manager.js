// Donkeycraft — Chunk Manager
// Chunk loading/unloading: radius management, spawn/destroy, dirty tracking.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var RENDER_DISTANCE = Donkeycraft.Config.RENDER_DISTANCE;

    // ============================================================
    // ChunkManager
    // ============================================================

    /**
     * ChunkManager — manages chunk loading/unloading within render distance.
     * @param {object} [options] - Configuration options.
     * @param {number} [options.renderDistance=8] - Render radius in chunks.
     */
    Donkeycraft.ChunkManager = function(options) {
        options = options || {};

        /**
         * Render distance radius in chunks.
         * @type {number}
         */
        this.renderDistance = options.renderDistance || RENDER_DISTANCE;

        /**
         * Map of "chunkX,chunkZ" → Chunk for active chunks.
         * @type {Map<string, Donkeycraft.Chunk>}
         */
        this._chunks = new Map();

        /**
         * Set of dirty chunk keys needing mesh regeneration.
         * @type {Set<string>}
         */
        this._dirtyChunks = new Set();

        /**
         * Callback invoked when a chunk is loaded (created or retrieved).
         * @type {Function|null}
         */
        this.onChunkLoad = null;

        /**
         * Callback invoked when a chunk is unloaded (destroyed).
         * @type {Function|null}
         */
        this.onChunkUnload = null;

        /**
         * Callback invoked when chunks need updating (radius changed or position updated).
         * @type {Function|null}
         */
        this.onChunksChanged = null;
    };

    /**
     * Get the cache key for a chunk coordinate pair.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {string}
     * @private
     */
    function chunkKey(chunkX, chunkZ) {
        return chunkX + ',' + chunkZ;
    }

    /**
     * Parse a cache key back to chunk coordinates.
     * @param {string} key - Cache key.
     * @returns {{chunkX: number, chunkZ: number}}
     * @private
     */
    function parseChunkKey(key) {
        var parts = key.split(',');
        return { chunkX: parseInt(parts[0], 10), chunkZ: parseInt(parts[1], 10) };
    }

    /**
     * Get or create a chunk at the given coordinates.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {Donkeycraft.Chunk} The chunk (newly created or existing).
     */
    Donkeycraft.ChunkManager.prototype.getChunk = function(chunkX, chunkZ) {
        var key = chunkKey(chunkX, chunkZ);
        if (!this._chunks.has(key)) {
            var chunk = new Donkeycraft.Chunk(chunkX, chunkZ);
            this._chunks.set(key, chunk);
            if (this.onChunkLoad) {
                this.onChunkLoad(chunk);
            }
            return chunk;
        }
        return this._chunks.get(key);
    };

    /**
     * Check if a chunk exists in the manager.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {boolean}
     */
    Donkeycraft.ChunkManager.prototype.hasChunk = function(chunkX, chunkZ) {
        return this._chunks.has(chunkKey(chunkX, chunkZ));
    };

    /**
     * Get a chunk by key without creating it.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {Donkeycraft.Chunk|null} The chunk, or null if not loaded.
     */
    Donkeycraft.ChunkManager.prototype.getChunkIfExists = function(chunkX, chunkZ) {
        return this._chunks.get(chunkKey(chunkX, chunkZ)) || null;
    };

    /**
     * Unload a chunk at the given coordinates.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {boolean} True if the chunk was unloaded, false if it didn't exist.
     */
    Donkeycraft.ChunkManager.prototype.unloadChunk = function(chunkX, chunkZ) {
        var key = chunkKey(chunkX, chunkZ);
        if (!this._chunks.has(key)) {
            return false;
        }

        var chunk = this._chunks.get(key);
        this._chunks.delete(key);

        // Remove from dirty set
        this._dirtyChunks.delete(key);

        if (this.onChunkUnload) {
            this.onChunkUnload(chunk);
        }

        return true;
    };

    /**
     * Get all currently loaded chunks as an array.
     * @returns {Donkeycraft.Chunk[]}
     */
    Donkeycraft.ChunkManager.prototype.getAllChunks = function() {
        var result = [];
        var self = this;
        this._chunks.forEach(function(chunk, key) {
            result.push(chunk);
        });
        return result;
    };

    /**
     * Get the number of loaded chunks.
     * @returns {number}
     */
    Donkeycraft.ChunkManager.prototype.getChunkCount = function() {
        return this._chunks.size;
    };

    /**
     * Mark a chunk as dirty (needs mesh regeneration).
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.ChunkManager.prototype.markChunkDirty = function(chunkX, chunkZ) {
        var key = chunkKey(chunkX, chunkZ);
        this._dirtyChunks.add(key);
    };

    /**
     * Mark a chunk as clean (changes applied).
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.ChunkManager.prototype.markChunkClean = function(chunkX, chunkZ) {
        this._dirtyChunks.delete(chunkKey(chunkX, chunkZ));
    };

    /**
     * Check if a specific chunk is dirty.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {boolean}
     */
    Donkeycraft.ChunkManager.prototype.isChunkDirty = function(chunkX, chunkZ) {
        return this._dirtyChunks.has(chunkKey(chunkX, chunkZ));
    };

    /**
     * Get all dirty chunks as an array of {chunk, chunkX, chunkZ} objects.
     * @returns {{chunk: Donkeycraft.Chunk, chunkX: number, chunkZ: number}[]}
     */
    Donkeycraft.ChunkManager.prototype.getDirtyChunks = function() {
        var result = [];
        var self = this;
        this._dirtyChunks.forEach(function(key) {
            var coords = parseChunkKey(key);
            var chunk = self._chunks.get(key);
            if (chunk) {
                result.push({ chunk: chunk, chunkX: coords.chunkX, chunkZ: coords.chunkZ });
            }
        });
        return result;
    };

    /**
     * Get the number of dirty chunks.
     * @returns {number}
     */
    Donkeycraft.ChunkManager.prototype.getDirtyCount = function() {
        return this._dirtyChunks.size;
    };

    /**
     * Update the player's current chunk position and load/unload chunks accordingly.
     * @param {number} playerChunkX - Player's current chunk X.
     * @param {number} playerChunkZ - Player's current chunk Z.
     */
    Donkeycraft.ChunkManager.prototype.updatePlayerPosition = function(playerChunkX, playerChunkZ) {
        var radius = this.renderDistance;
        var neededChunks = new Set();

        // Determine which chunks should be loaded
        for (var dx = -radius; dx <= radius; dx++) {
            for (var dz = -radius; dz <= radius; dz++) {
                if (dx * dx + dz * dz > radius * radius) continue; // Circular radius
                var cx = playerChunkX + dx;
                var cz = playerChunkZ + dz;
                neededChunks.add(chunkKey(cx, cz));

                // Load chunk if not already loaded
                this.getChunk(cx, cz);
            }
        }

        // Unload chunks outside the radius
        var toUnload = [];
        this._chunks.forEach(function(chunk, key) {
            if (!neededChunks.has(key)) {
                toUnload.push(key);
            }
        });

        for (var i = 0; i < toUnload.length; i++) {
            var coords = parseChunkKey(toUnload[i]);
            this.unloadChunk(coords.chunkX, coords.chunkZ);
        }

        // Notify if chunks changed
        if (this.onChunksChanged) {
            this.onChunksChanged();
        }
    };

    /**
     * Update the render distance and adjust loaded chunks.
     * @param {number} newRadius - New render distance radius in chunks.
     */
    Donkeycraft.ChunkManager.prototype.updateRenderDistance = function(newRadius) {
        var oldRadius = this.renderDistance;
        this.renderDistance = newRadius;

        // If radius increased, we'll load more on next position update
        // If radius decreased, unload excess chunks on next position update
        if (this.onChunksChanged) {
            this.onChunksChanged();
        }
    };

    /**
     * Destroy all chunks and free resources.
     */
    Donkeycraft.ChunkManager.prototype.destroy = function() {
        var self = this;
        this._chunks.forEach(function(chunk) {
            chunk.destroy();
        });
        this._chunks.clear();
        this._dirtyChunks.clear();
        this.onChunkLoad = null;
        this.onChunkUnload = null;
        this.onChunksChanged = null;
    };

    /**
     * Remove all chunks without calling destroy (for save-then-clear workflows).
     */
    Donkeycraft.ChunkManager.prototype.clearAll = function() {
        var self = this;
        this._chunks.forEach(function(chunk) {
            // Don't destroy buffers — they may have been saved
        });
        this._chunks.clear();
        this._dirtyChunks.clear();
    };

})();