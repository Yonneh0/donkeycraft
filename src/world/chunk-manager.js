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
     * If the chunk is new and terrain generation systems are available,
     * populates it with terrain data (heightmap, biomes, ores, caves, water, surface).
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {Donkeycraft.Chunk} The chunk (newly created or existing).
     */
    Donkeycraft.ChunkManager.prototype.getChunk = function(chunkX, chunkZ) {
        var key = chunkKey(chunkX, chunkZ);
        if (!this._chunks.has(key)) {
            var chunk = new Donkeycraft.Chunk(chunkX, chunkZ);
            this._chunks.set(key, chunk);

            // Generate terrain for new chunk if generation systems are available
            if (this.onChunkLoad) {
                this.onChunkLoad(chunk);
            }

            // Only generate terrain once per chunk
            if (!chunk.generated && this._generateTerrain) {
                this._generateTerrain(chunkX, chunkZ);
                chunk.generated = true;
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

    /**
     * Generate terrain for a chunk at the given coordinates.
     * Fills the chunk with heightmap-based terrain, ores, caves, water, and surface layers.
     * @private
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.ChunkManager.prototype._generateTerrain = function(chunkX, chunkZ) {
        var key = chunkKey(chunkX, chunkZ);
        var chunk = this._chunks.get(key);
        if (!chunk) return;

        // Get terrain generator
        var terrainGen = Donkeycraft.TerrainGenerator;
        if (!terrainGen || !terrainGen.generateHeightmap) {
            Donkeycraft.Logger.warn('ChunkManager', 'TerrainGenerator not available');
            return;
        }

        // Get biome for this chunk (use plains as default since BiomeRegistry has no getBiomeForChunk)
        var biome = null;
        if (Donkeycraft.BiomeRegistry) {
            biome = Donkeycraft.BiomeRegistry.getBiomeById(1); // Default to plains
        }
        chunk.biomeId = biome ? biome.id : 1;

        Donkeycraft.Logger.info('ChunkManager', 'Generating terrain for chunk [' + chunkX + ',' + chunkZ + ']');

        // Generate heightmap
        var heightmap = null;
        try {
            heightmap = terrainGen.generateHeightmap(chunkX, chunkZ, biome);
            Donkeycraft.Logger.info('ChunkManager', 'Heightmap generated, length=' + (heightmap ? heightmap.length : 'null'));
        } catch (e) {
            Donkeycraft.Logger.error('ChunkManager', 'Heightmap generation failed: ' + e.message);
            return;
        }

        if (!heightmap || heightmap.length === 0) {
            Donkeycraft.Logger.error('ChunkManager', 'Empty heightmap for chunk [' + chunkX + ',' + chunkZ + ']');
            return;
        }

        // Fill chunk blocks based on heightmap
        var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
        var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

        // Helper to look up block by name (returns block or null)
        function getBlock(name) {
            return Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getBlockByName(name) : null;
        }

        for (var localX = 0; localX < CHUNK_SIZE; localX++) {
            for (var localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                var height = heightmap[localX + localZ * CHUNK_SIZE] || 64;

                // Determine surface type based on biome
                var isDesert = !!biome.isDesert;
                var hasSnow = !!biome.hasSnow;
                var isOcean = !!biome.isOcean;

                for (var y = 0; y < WORLD_HEIGHT; y++) {
                    var blockId = 0; // Air by default

                    if (y === 0) {
                        // Bedrock layer
                        var bedrock = getBlock('bedrock');
                        blockId = bedrock ? bedrock.id : 7;
                    } else if (y < height - 4) {
                        // Stone base
                        var stone = getBlock('stone');
                        blockId = stone ? stone.id : 1;
                    } else if (y < height) {
                        // Sub-surface layer
                        if (isDesert) {
                            var sandstone = getBlock('sandstone');
                            blockId = sandstone ? sandstone.id : 2;
                        } else if (hasSnow) {
                            var snowBlock = getBlock('snow_block');
                            blockId = snowBlock ? snowBlock.id : 80;
                        } else {
                            var dirt = getBlock('dirt');
                            blockId = dirt ? dirt.id : 3;
                        }
                    } else if (y === height) {
                        // Surface layer
                        if (isDesert) {
                            var sand = getBlock('sand');
                            blockId = sand ? sand.id : 12;
                        } else if (hasSnow) {
                            var snowBlock = getBlock('snow_block');
                            blockId = snowBlock ? snowBlock.id : 80;
                        } else {
                            var grassBlock = getBlock('grass_block');
                            blockId = grassBlock ? grassBlock.id : 2;
                        }
                    } else if (y >= 62 && isOcean) {
                        // Water in oceans
                        var water = getBlock('water');
                        blockId = water ? water.id : 9;
                    }

                    if (blockId > 0) {
                        chunk.setBlock(localX, y, localZ, blockId);
                    }
                }
            }
        }

        // Apply cave generation if available
        if (Donkeycraft.CaveGenerator && Donkeycraft.CaveGenerator.generateCaves) {
            try { Donkeycraft.CaveGenerator.generateCaves(chunk, chunkX, chunkZ); } catch (e) { /* skip */ }
        }

        // Apply ore generation if available
        if (Donkeycraft.OreGenerator && Donkeycraft.OreGenerator.generateOres) {
            try { Donkeycraft.OreGenerator.generateOres(chunk, chunkX, chunkZ, biome); } catch (e) { /* skip */ }
        }

        // Mark chunk as needing mesh regeneration
        chunk._dirty = true;
    };

})();
