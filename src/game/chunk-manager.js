// Donkeycraft — Chunk Manager
// Chunk loading/unloading: radius management, spawn/destroy, dirty tracking.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;
    var RENDER_DISTANCE = Donkeycraft.Config.RENDER_DISTANCE;

    // ============================================================
    // ChunkManager
    // ============================================================

    /**
     * ChunkManager — manages chunk loading/unloading within render distance.
     * @param {object} [options] - Configuration options.
     * @param {number} [options.renderDistance=8] - Render radius in chunks.
     */
    Donkeycraft.ChunkManager = function (options) {
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

        /**
         * Whether to use the StructureGenerator full pipeline for overworld chunks.
         * When true, delegates terrain generation to StructureGenerator.generateChunkFull.
         * @type {boolean}
         */
        this.useStructureGenerator = false;

        /**
         * Whether terrain generation is enabled. When false, chunks are created empty.
         * @type {boolean}
         */
        this.terrainEnabled = true;
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
    Donkeycraft.ChunkManager.prototype.getChunk = function (chunkX, chunkZ) {
        var key = chunkKey(chunkX, chunkZ);
        if (!this._chunks.has(key)) {
            var chunk = new Donkeycraft.Chunk(chunkX, chunkZ);
            this._chunks.set(key, chunk);

            // Trigger onChunkLoad callback (dimension.js wires up terrain generation + lighting).
            // The callback sets chunk.generated = true after terrain is placed,
            // so we do NOT call _generateTerrain here to avoid double generation.
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
    Donkeycraft.ChunkManager.prototype.hasChunk = function (chunkX, chunkZ) {
        return this._chunks.has(chunkKey(chunkX, chunkZ));
    };

    /**
     * Get a chunk by key without creating it.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {Donkeycraft.Chunk|null} The chunk, or null if not loaded.
     */
    Donkeycraft.ChunkManager.prototype.getChunkIfExists = function (chunkX, chunkZ) {
        return this._chunks.get(chunkKey(chunkX, chunkZ)) || null;
    };

    /**
     * Unload a chunk at the given coordinates.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {boolean} True if the chunk was unloaded, false if it didn't exist.
     */
    Donkeycraft.ChunkManager.prototype.unloadChunk = function (chunkX, chunkZ) {
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
    Donkeycraft.ChunkManager.prototype.getAllChunks = function () {
        var result = [];
        var self = this;
        this._chunks.forEach(function (chunk, key) {
            result.push(chunk);
        });
        return result;
    };

    /**
     * Get the number of loaded chunks.
     * @returns {number}
     */
    Donkeycraft.ChunkManager.prototype.getChunkCount = function () {
        return this._chunks.size;
    };

    /**
     * Mark a chunk as dirty (needs mesh regeneration).
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.ChunkManager.prototype.markChunkDirty = function (chunkX, chunkZ) {
        var key = chunkKey(chunkX, chunkZ);
        this._dirtyChunks.add(key);
    };

    /**
     * Mark a chunk as clean (changes applied).
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.ChunkManager.prototype.markChunkClean = function (chunkX, chunkZ) {
        this._dirtyChunks.delete(chunkKey(chunkX, chunkZ));
    };

    /**
     * Check if a specific chunk is dirty.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {boolean}
     */
    Donkeycraft.ChunkManager.prototype.isChunkDirty = function (chunkX, chunkZ) {
        return this._dirtyChunks.has(chunkKey(chunkX, chunkZ));
    };

    /**
     * Get all dirty chunks as an array of {chunk, chunkX, chunkZ} objects.
     * @returns {{chunk: Donkeycraft.Chunk, chunkX: number, chunkZ: number}[]}
     */
    Donkeycraft.ChunkManager.prototype.getDirtyChunks = function () {
        var result = [];
        var self = this;
        this._dirtyChunks.forEach(function (key) {
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
    Donkeycraft.ChunkManager.prototype.getDirtyCount = function () {
        return this._dirtyChunks.size;
    };

    /**
     * Update the player's current chunk position and load/unload chunks accordingly.
     * @param {number} playerChunkX - Player's current chunk X.
     * @param {number} playerChunkZ - Player's current chunk Z.
     */
    Donkeycraft.ChunkManager.prototype.updatePlayerPosition = function (playerChunkX, playerChunkZ) {
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
        this._chunks.forEach(function (chunk, key) {
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
    Donkeycraft.ChunkManager.prototype.updateRenderDistance = function (newRadius) {
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
    Donkeycraft.ChunkManager.prototype.destroy = function () {
        var self = this;
        this._chunks.forEach(function (chunk) {
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
    Donkeycraft.ChunkManager.prototype.clearAll = function () {
        var self = this;
        this._chunks.forEach(function (chunk) {
            // Don't destroy buffers — they may have been saved
        });
        this._chunks.clear();
        this._dirtyChunks.clear();
    };

    /**
     * Generate terrain for a chunk at the given coordinates.
     * Fills the chunk with heightmap-based terrain, ores, caves, water, and surface layers.
     * Delegates to dimension-specific generators when available.
     * If useStructureGenerator is true, delegates overworld generation to StructureGenerator.
     * This method is called from onChunkLoad callbacks in dimension.js.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {boolean} True if terrain was generated, false if skipped.
     */
    Donkeycraft.ChunkManager.prototype.generateChunkTerrain = function (chunkX, chunkZ) {
        // Skip if terrain is disabled or chunk already generated
        if (!this.terrainEnabled) return false;
        var key = chunkKey(chunkX, chunkZ);
        var chunk = this._chunks.get(key);
        if (!chunk || chunk.generated) return false;

        // Attempt to generate terrain
        var currentDim = Donkeycraft.Dimensions ? Donkeycraft.Dimensions.getCurrentDimension() : 0;
        var success = false;

        switch (currentDim) {
            case Donkeycraft.DimensionType.NETHER: // Nether
                try { _generateNetherChunk(this, chunk, chunkX, chunkZ); success = true; } catch (e) { /* skip */ }
                break;
            case Donkeycraft.DimensionType.END: // End
                try { _generateEndChunk(this, chunk, chunkX, chunkZ); success = true; } catch (e) { /* skip */ }
                break;
            default: // Overworld
                if (this.useStructureGenerator && Donkeycraft.StructureGenerator &&
                    Donkeycraft.StructureGenerator.generateChunkFull) {
                    try {
                        Donkeycraft.StructureGenerator.generateChunkFull(chunk, chunk.biomeId);
                        success = true;
                    } catch (e) {
                        Donkeycraft.Logger.error('ChunkManager', 'StructureGenerator failed: ' + e.message);
                        _generateOverworldChunk(this, chunk, chunkX, chunkZ);
                        success = true;
                    }
                } else {
                    _generateOverworldChunk(this, chunk, chunkX, chunkZ);
                    success = true;
                }
                break;
        }

        return success;
    };

    // ============================================================
    // Overworld Terrain Generation
    // ============================================================

    /**
     * Generate overworld terrain for a chunk.
     * Resolves block IDs from BlockRegistry by name instead of hardcoded IDs.
     * Uses consistent noise sampling with TerrainGenerator for biome/heightmap alignment.
     * @param {Donkeycraft.ChunkManager} manager - The ChunkManager.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @private
     */
    function _generateOverworldChunk(manager, chunk, chunkX, chunkZ) {
        var terrainGen = Donkeycraft.TerrainGenerator;
        if (!terrainGen || !terrainGen.generateHeightmap) {
            Donkeycraft.Logger.warn('ChunkManager', 'TerrainGenerator not available');
            return;
        }

        // Get biome for this chunk using world coordinates for 2D biome lookup.
        // Uses PerlinNoise.noise2D() (same as TerrainGenerator.fbm internally) for consistent sampling.
        var biome = null;
        if (Donkeycraft.BiomeRegistry && Donkeycraft.PerlinNoise) {
            var worldX = chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
            var worldZ = chunkZ * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
            // Use PerlinNoise.noise2D() with separate X/Z offsets for temperature/rainfall
            // This matches the noise pattern used by TerrainGenerator.fbm → noise()
            var tempNoise = Donkeycraft.PerlinNoise.noise2D(worldX * 0.005, worldZ * 0.005);
            var rainNoise = Donkeycraft.PerlinNoise.noise2D(worldX * 0.005 + 1000, worldZ * 0.005 + 1000);
            // Map noise [-1, 1] → [0, 1]
            var temp = (tempNoise + 1) * 0.5;
            var rain = (rainNoise + 1) * 0.5;
            biome = Donkeycraft.BiomeRegistry.getBiomeByClimate(temp, rain);
        }
        // Ensure biome is never null — default to plains if lookup failed
        if (!biome) {
            biome = Donkeycraft.BiomeRegistry.getBiomeById(Donkeycraft.BiomeID.PLAINS);
        }
        chunk.biomeId = biome.id;

        // Donkeycraft.Logger.info('ChunkManager', 'Generating overworld terrain for chunk [' + chunkX + ',' + chunkZ + ']');

        // Generate heightmap
        var heightmap = null;
        try {
            heightmap = terrainGen.generateHeightmap(chunkX, chunkZ, biome);
        } catch (e) {
            Donkeycraft.Logger.error('ChunkManager', 'Heightmap generation failed: ' + e.message);
            return;
        }

        if (!heightmap || heightmap.length === 0) {
            Donkeycraft.Logger.error('ChunkManager', 'Empty heightmap for chunk [' + chunkX + ',' + chunkZ + ']');
            return;
        }

        // Resolve block references by name from BlockRegistry
        var bedrock = Donkeycraft.BlockRegistry.getBlockByName('bedrock');
        var stone = Donkeycraft.BlockRegistry.getBlockByName('stone');
        var dirt = Donkeycraft.BlockRegistry.getBlockByName('dirt');
        var sand = Donkeycraft.BlockRegistry.getBlockByName('sand');
        var grassBlock = Donkeycraft.BlockRegistry.getBlockByName('grass_block');

        if (!bedrock || !stone || !dirt) {
            Donkeycraft.Logger.error('ChunkManager', 'Required blocks not found in BlockRegistry');
            return;
        }

        // biome is guaranteed non-null at this point
        var isDesert = !!biome.isDesert;
        var hasSnow = !!biome.hasSnow;
        var isOcean = !!biome.isOcean;

        // Store the heightmap on the chunk for fast surface queries
        chunk.heightmap = heightmap;

        // Fill chunk blocks based on heightmap
        for (var localX = 0; localX < CHUNK_SIZE; localX++) {
            for (var localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                var height = heightmap[localX + localZ * CHUNK_SIZE] || 64;

                for (var y = 0; y < WORLD_HEIGHT; y++) {
                    var blockId = 0; // Air by default

                    if (y === 0) {
                        // Bedrock layer
                        blockId = bedrock.id;
                    } else if (y < height - 4) {
                        // Stone base
                        blockId = stone.id;
                    } else if (y < height) {
                        // Sub-surface layer
                        if (isDesert && sand) {
                            blockId = sand.id;
                        } else if (hasSnow && grassBlock) {
                            blockId = grassBlock.id; // snow_block or grass_block
                        } else if (dirt) {
                            blockId = dirt.id;
                        }
                    } else if (y === height) {
                        // Surface layer
                        if (isDesert && sand) {
                            blockId = sand.id;
                        } else if (hasSnow && grassBlock) {
                            blockId = grassBlock.id;
                        } else if (grassBlock) {
                            blockId = grassBlock.id;
                        }
                    }

                    if (blockId > 0) {
                        chunk.setBlock(localX, y, localZ, blockId);
                    }
                }
            }
        }

        // Apply cave generation if available
        if (Donkeycraft.CaveGenerator && Donkeycraft.CaveGenerator.generateCaves) {
            try { Donkeycraft.CaveGenerator.generateCaves(chunk, chunk.biomeId); } catch (e) { /* skip */ }
        }

        // Apply ore generation if available
        if (Donkeycraft.OreGenerator && Donkeycraft.OreGenerator.placeOres) {
            try { Donkeycraft.OreGenerator.placeOres(chunk, chunk.biomeId); } catch (e) { /* skip */ }
        }

        // Apply water placement if available
        if (Donkeycraft.WaterGenerator && Donkeycraft.WaterGenerator.placeWater) {
            try { Donkeycraft.WaterGenerator.placeWater(chunk, chunk.biomeId, heightmap); } catch (e) { /* skip */ }
        }

        // Apply surface layer if available
        if (Donkeycraft.TerrainSurface && Donkeycraft.TerrainSurface.applySurfaceLayer) {
            try { Donkeycraft.TerrainSurface.applySurfaceLayer(chunk, chunk.biomeId, heightmap); } catch (e) { /* skip */ }
        }

        // Build surface map for map renderer (O(1) block lookup per frame)
        _buildChunkSurfaceMap(chunk);

        // Mark chunk as needing mesh regeneration
        chunk._dirty = true;
        chunk.generated = true;
    }

    /**
     * Build the surface map for a chunk — scans each (x,z) column once.
     * Stores result on chunk._mapSurfaceMap[localX][localZ] = {y, blockId|null}.
     * Called after terrain generation so the map renderer can do O(1) lookups.
     * @param {Donkeycraft.Chunk} chunk - The chunk to build the surface map for.
     * @private
     */
    function _buildChunkSurfaceMap(chunk) {
        if (!chunk || chunk._mapSurfaceMapBuilt) return;

        var map = new Array(CHUNK_SIZE);
        var worldHeight = Donkeycraft.Config.WORLD_HEIGHT;

        for (var lx = 0; lx < CHUNK_SIZE; lx++) {
            map[lx] = new Array(CHUNK_SIZE);
            for (var lz = 0; lz < CHUNK_SIZE; lz++) {
                // Scan from top to bottom for the first visible block
                var surfaceY = -1;
                var surfaceBlockId = 0;
                for (var y = worldHeight - 1; y >= 0; y--) {
                    var blockId = chunk.getBlock(lx, y, lz);
                    if (blockId === 0) continue; // Air
                    if (blockId === 13) continue; // Water

                    surfaceY = y;
                    surfaceBlockId = blockId;
                    break;
                }
                map[lx][lz] = (surfaceY >= 0) ? { y: surfaceY, blockId: surfaceBlockId } : null;
            }
        }

        chunk._mapSurfaceMap = map;
        chunk._mapSurfaceMapBuilt = true;
    }

    // ============================================================
    // Nether Terrain Generation (kept for backward compatibility)
    // Primary wiring is now in dimension.js via onChunkLoad callbacks.
    // ============================================================

    /**
     * Generate nether terrain for a chunk.
     * Kept for backward compatibility — primary wiring is in dimension.js.
     * @param {Donkeycraft.ChunkManager} manager - The ChunkManager.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @private
     */
    function _generateNetherChunk(manager, chunk, chunkX, chunkZ) {
        if (!Donkeycraft.NetherGenerator || !Donkeycraft.NetherGenerator.generateNetherTerrain) {
            Donkeycraft.Logger.warn('ChunkManager', 'NetherGenerator not available');
            return;
        }

        chunk.biomeId = 1; // Nether has no biomes
        try {
            Donkeycraft.NetherGenerator.generateNetherTerrain(chunk, chunkX, chunkZ);
        } catch (e) {
            Donkeycraft.Logger.error('ChunkManager', 'Nether terrain generation failed: ' + e.message);
        }

        // Build surface map for map renderer
        _buildChunkSurfaceMap(chunk);
    }

    /**
     * Generate End terrain for a chunk.
     * Kept for backward compatibility — primary wiring is in dimension.js via onChunkLoad callbacks.
     * @param {Donkeycraft.ChunkManager} manager - The ChunkManager.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @private
     */
    function _generateEndChunk(manager, chunk, chunkX, chunkZ) {
        if (!Donkeycraft.EndGenerator || !Donkeycraft.EndGenerator.generateEndTerrain) {
            Donkeycraft.Logger.warn('ChunkManager', 'EndGenerator not available');
            return;
        }

        chunk.biomeId = 1; // End has no biomes
        try {
            Donkeycraft.EndGenerator.generateEndTerrain(chunk, chunkX, chunkZ);
        } catch (e) {
            Donkeycraft.Logger.error('ChunkManager', 'End terrain generation failed: ' + e.message);
        }

        // Build surface map for map renderer
        _buildChunkSurfaceMap(chunk);
    }

})();
