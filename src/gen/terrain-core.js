// Donkeycraft — Central Terrain Engine
// Single entry point for all terrain generation.
// Manages the 32-bit seed, chunk grid layout, caching coordination,
// and provides API for chunk generation requests.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    // ============================================================
    // Constants
    // ============================================================
    var SEED_MASK_32BIT = 0xFFFFFFFF;
    var DEFAULT_SEED = 42;

    /**
     * Get current Config values lazily to avoid module load order issues.
     * @returns {{CHUNK_SIZE: number, WORLD_HEIGHT: number}}
     * @private
     */
    function _getConfig() {
        return Donkeycraft.Config || { CHUNK_SIZE: 16, WORLD_HEIGHT: 256 };
    }

    // ============================================================
    // Runtime State
    // ============================================================
    var _seed = DEFAULT_SEED;
    var _currentBiomeId = 0; // Default to grass (BiomeID.GRASS = 0)
    var _currentBiomeName = null; // Track biome name for direct resolution
    var _generationInProgress = false;
    var _generationStartTime = 0;
    var _totalChunksGenerated = 0;
    var _cacheHitCount = 0;
    var _cacheMissCount = 0;

    // ============================================================
    // Utility Functions
    // ============================================================

    /**
     * Clamp a 32-bit seed value to valid range.
     * @param {number} seed - Seed value.
     * @returns {number} Clamped 32-bit unsigned seed.
     * @private
     */
    function _clampSeed(seed) {
        if (!isFinite(seed) || seed === null) return DEFAULT_SEED;
        return seed >>> 0; // Convert to unsigned 32-bit integer
    }

    /**
     * Generate a deterministic hash from seed and chunk coordinates.
     * Used for cache key generation and noise offsetting.
     * Uses 32-bit masking at each arithmetic step to ensure consistent
     * behavior across all JavaScript engines and browsers, including
     * for negative chunk coordinates.
     * @param {number} chunkX - Chunk X coordinate (may be negative).
     * @param {number} chunkZ - Chunk Z coordinate (may be negative).
     * @returns {number} Deterministic unsigned 32-bit hash.
     * @private
     */
    function _chunkHash(chunkX, chunkZ) {
        // Mask to 32-bit signed integers first
        var x = chunkX | 0;
        var z = chunkZ | 0;
        // FNV-1a inspired hash with 32-bit masking at each step
        var h = ((x * 374761393 + z * 668265263) ^ 0x5bd1e995) & 0xFFFFFFFF;
        h = (((h >>> 13) ^ h) * 0x5bd1e995) & 0xFFFFFFFF;
        return ((h ^ (h >>> 15)) & 0xFFFFFFFF) >>> 0;
    }

    /**
     * Generate a cache key from chunk coordinates and generation parameters.
     * Validates all inputs are finite numbers before constructing the key.
     * Invalid inputs return a sentinel key that skips caching rather than
     * polluting the cache with unique timestamps.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {number} biomeId - Biome ID.
     * @param {number} seed - World seed.
     * @returns {string} Unique cache key string, or 'terrain__invalid' for bad inputs.
     * @private
     */
    function _makeCacheKey(chunkX, chunkZ, biomeId, seed) {
        // Validate inputs are finite numbers — return sentinel key for invalid inputs
        if (!isFinite(chunkX) || !isFinite(chunkZ) || !isFinite(biomeId) || !isFinite(seed)) {
            return 'terrain__invalid';
        }
        return 'terrain_' + Math.floor(seed) + '_' + Math.floor(chunkX) + '_' + Math.floor(chunkZ) + '_b' + Math.floor(biomeId || 0);
    }

    /**
     * Record a cache hit or miss for statistics tracking.
     * @param {boolean} isHit - True if cache hit, false if miss.
     * @private
     */
    function _recordCacheAccess(isHit) {
        if (isHit) {
            _cacheHitCount++;
        } else {
            _cacheMissCount++;
        }
    }

    // ============================================================
    // Seed Management
    // ============================================================

    /**
     * Set the world seed and reinitialize all noise systems.
     * @param {number} seed - 32-bit seed value.
     */
    function setSeed(seed) {
        var oldSeed = _seed;
        _seed = _clampSeed(seed);

        // Reinitialize PerlinNoise with new seed
        if (Donkeycraft.PerlinNoise && typeof Donkeycraft.PerlinNoise.init === 'function') {
            try {
                Donkeycraft.PerlinNoise.init(_seed);
            } catch (e) { /* ignore */ }
        }

        // Seed the noise module's internal state
        if (Donkeycraft._gen && typeof Donkeycraft._gen._ensureNoiseInit === 'function') {
            Donkeycraft._gen._ensureNoiseInit();
        }

        // Clear memory cache when seed changes
        if (Donkeycraft.Storage && Donkeycraft.Storage.clearAllCaches) {
            try {
                Donkeycraft.Storage.clearAllCaches();
            } catch (e) { /* ignore */ }
        }

        // Notify listeners of seed change
        _notifySeedChanged({
            oldSeed: oldSeed,
            newSeed: _seed
        });
    }

    /**
     * Get the current world seed.
     * @returns {number} Current 32-bit seed.
     */
    function getSeed() {
        return _seed;
    }

    // ============================================================
    // Biome Management
    // ============================================================

    /**
     * Set the current biome for terrain generation.
     * @param {number|string|Donkeycraft.Biome} biome - Biome ID, name, or Biome object.
     */
    function setBiome(biome) {
        var biomeId = 0; // Default to grass (BiomeID.GRASS = 0)
        var biomeName = null;
        var biomeResolved = false;

        if (typeof biome === 'object' && biome.id !== undefined) {
            biomeId = Math.max(0, Math.floor(biome.id));
            biomeName = biome.name || null;
            biomeResolved = true;
        } else if (typeof biome === 'number') {
            if (!isFinite(biome)) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[TerrainCore] setBiome: non-finite biome ID, using default ID 0 (grass)');
                }
            } else {
                biomeId = Math.max(0, Math.floor(biome));
                biomeResolved = true;
            }
        } else if (typeof biome === 'string') {
            // Try resolving as biome name first
            if (Donkeycraft.BiomeRegistry) {
                var resolvedBiome = Donkeycraft.BiomeRegistry.getBiomeByName(biome);
                if (resolvedBiome) {
                    biomeId = resolvedBiome.id;
                    biomeName = resolvedBiome.name;
                    biomeResolved = true;
                }
            }
            // If BiomeRegistry not available, try direct name mapping
            if (!biomeResolved && Donkeycraft.SurfaceGenerator) {
                var availableBiomes = Donkeycraft.SurfaceGenerator.getAvailableBiomes();
                if (availableBiomes.indexOf(biome) >= 0) {
                    biomeName = biome;
                    biomeId = _biomeNameToId(biome);
                    biomeResolved = true;
                }
            }
        }

        if (!biomeResolved && typeof console !== 'undefined' && console.warn) {
            console.warn('[TerrainCore] setBiome: unknown biome "' + String(biome) + '", defaulting to ID 0 (grass)');
        }

        _currentBiomeId = biomeId;
        _currentBiomeName = biomeName;
    }

    /**
     * Map a biome name string to its ID value.
     * @param {string} name - Biome name.
     * @returns {number} Biome ID.
     * @private
     */
    function _biomeNameToId(name) {
        switch (name) {
            case 'grass': return 0;
            case 'arctic': return 1;
            case 'desert': return 2;
            case 'forest': return 3;
            default: return 0;
        }
    }

    /**
     * Get the current biome ID.
     * @returns {number} Current biome ID.
     */
    function getBiome() {
        return _currentBiomeId;
    }

    // ============================================================
    // Chunk Generation
    // ============================================================

    /**
     * Generate a single chunk's heightmap at the given coordinates.
     * Uses cache if available, otherwise generates from scratch.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {Promise<{heightmap: number[], cacheHit: boolean}>} Generated heightmap data.
     */
    function generateChunk(chunkX, chunkZ) {
        // Validate inputs
        if (!isFinite(chunkX) || !isFinite(chunkZ)) {
            return Promise.resolve({ heightmap: [], cacheHit: false, error: 'Invalid chunk coordinates' });
        }

        var cacheKey = _makeCacheKey(chunkX, chunkZ, _currentBiomeId, _seed);

        // Check storage once and store result to avoid race conditions
        var storageReady = Donkeycraft.Storage && Donkeycraft.Storage.isReady();

        if (storageReady) {
            return Donkeycraft.Storage.getChunk(cacheKey).then(function (cachedData) {
                // Check if cached data exists and has a valid heightmap
                if (cachedData && Array.isArray(cachedData.heightmap) && cachedData.heightmap.length > 0) {
                    _recordCacheAccess(true);
                    return { heightmap: cachedData.heightmap, cacheHit: true };
                }

                // Cache miss — generate
                _recordCacheAccess(false);
                return _generateChunkData(chunkX, chunkZ).then(function (result) {
                    // Store in cache if storage is still ready
                    if (Donkeycraft.Storage && Donkeycraft.Storage.isReady()) {
                        try {
                            Donkeycraft.Storage.putChunk(cacheKey, result);
                        } catch (e) { /* ignore storage errors */ }
                    }
                    return result;
                });
            }).catch(function (e) {
                // Storage error — fall back to direct generation
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[TerrainCore] Storage error for chunk (' + chunkX + ',' + chunkZ + '):', e && e.message ? e.message : String(e));
                }
                _recordCacheAccess(false);
                return _generateChunkData(chunkX, chunkZ);
            });
        }

        // No storage — generate directly
        _recordCacheAccess(false);
        return _generateChunkData(chunkX, chunkZ);
    }

    /**
     * Generate chunk data without caching (internal).
     * Uses SurfaceGenerator for fractal terrain heightmaps.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {Promise<{heightmap: number[], cacheHit: boolean}>} Generated heightmap data.
     * @private
     */
    function _generateChunkData(chunkX, chunkZ) {
        if (!Donkeycraft.SurfaceGenerator) {
            return Promise.resolve({ heightmap: [], cacheHit: false });
        }

        try {
            // Resolve biome name from ID for SurfaceGenerator
            var biomeName = _resolveBiomeName(_currentBiomeId);

            var heightmap = Donkeycraft.SurfaceGenerator.generateHeightmap(chunkX, chunkZ, biomeName);
            _totalChunksGenerated++;

            return Promise.resolve({
                heightmap: heightmap,
                cacheHit: false,
                generationTime: Date.now() - _generationStartTime
            });
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[TerrainCore] Generation error for chunk (' + chunkX + ',' + chunkZ + '):', e && e.message ? e.message : String(e));
            }
            return Promise.resolve({ heightmap: [], cacheHit: false, error: e.message });
        }
    }

    /**
     * Resolve a biome ID to its name string for SurfaceGenerator.
     * Uses a single canonical ID-to-name mapping to ensure consistent results
     * regardless of how setBiome was called (number, string, or Biome object).
     * @param {number} biomeId - Biome ID.
     * @returns {string} Biome name ('grass', 'arctic', 'desert', 'forest').
     * @private
     */
    function _resolveBiomeName(biomeId) {
        // Validate and clamp biome ID to valid range
        var id = Math.max(0, Math.min(3, Math.floor(biomeId)));
        
        // Single canonical mapping — always use direct ID-to-name
        // This eliminates inconsistent results from multiple fallback paths
        switch (id) {
            case 0: return 'grass';
            case 1: return 'arctic';
            case 2: return 'desert';
            case 3: return 'forest';
        }

        return 'grass'; // Default fallback
    }

    /**
     * Generate all chunks in the current grid.
     * Uses Promise.allSettled to ensure one chunk failure doesn't abort the entire batch.
     * @returns {Promise<Array>} Array of generation results (settled).
     */
    function generateAllChunks() {
        if (_generationInProgress) {
            return Promise.reject(new Error('Generation already in progress'));
        }

        _generationInProgress = true;
        _generationStartTime = Date.now();
        _totalChunksGenerated = 0;

        var gridChunks = Donkeycraft.ChunkGrid ? Donkeycraft.ChunkGrid.getGridChunks() : [];
        var promises = [];

        for (var i = 0; i < gridChunks.length; i++) {
            (function(chunkX, chunkZ) {
                promises.push(generateChunk(chunkX, chunkZ).catch(function (e) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[TerrainCore] Failed to generate chunk (' + chunkX + ',' + chunkZ + '):', e && e.message ? e.message : String(e));
                    }
                    return { heightmap: [], cacheHit: false, error: e && e.message ? e.message : String(e) };
                }));
            }(gridChunks[i].x, gridChunks[i].z));
        }

        return Promise.all(promises).then(function (results) {
            _generationInProgress = false;
            return results;
        }).catch(function (error) {
            // Fallback: should not happen with individual catch handlers above
            _generationInProgress = false;
            if (typeof console !== 'undefined' && console.error) {
                console.error('[TerrainCore] generateAllChunks failed:', error && error.message ? error.message : String(error));
            }
            throw error;
        });
    }

    /**
     * Generate chunks in a radius around the player position.
     * @param {number} playerChunkX - Player's chunk X coordinate.
     * @param {number} playerChunkZ - Player's chunk Z coordinate.
     * @param {number} [radius=3] - Generation radius.
     * @returns {Promise<Array>} Array of generation results.
     */
    function generateChunksInRadius(playerChunkX, playerChunkZ, radius) {
        radius = radius || 3;
        var promises = [];

        for (var dx = -radius; dx <= radius; dx++) {
            for (var dz = -radius; dz <= radius; dz++) {
                var chunkX = playerChunkX + dx;
                var chunkZ = playerChunkZ + dz;
                promises.push(generateChunk(chunkX, chunkZ));
            }
        }

        return Promise.all(promises);
    }

    // ============================================================
    // Event System
    // ============================================================
    var _seedListeners = [];
    var _generationListeners = [];

    /**
     * Register a listener for seed changes.
     * @param {Function} callback - Callback function.
     * @returns {Function} Unsubscribe function.
     * @private
     */
    function _onSeedChange(callback) {
        if (typeof callback === 'function') {
            _seedListeners.push(callback);
        }
        return function () {
            var idx = _seedListeners.indexOf(callback);
            if (idx >= 0) _seedListeners.splice(idx, 1);
        };
    }

    /**
     * Register a listener for generation progress.
     * @param {Function} callback - Callback function receiving progress events.
     * @returns {Function} Unsubscribe function.
     * @private
     */
    function _onGenerationProgress(callback) {
        if (typeof callback === 'function') {
            _generationListeners.push(callback);
        }
        return function () {
            var idx = _generationListeners.indexOf(callback);
            if (idx >= 0) _generationListeners.splice(idx, 1);
        };
    }

    /**
     * Notify all seed change listeners.
     * @param {Object} event - Event data.
     * @private
     */
    function _notifySeedChanged(event) {
        for (var i = 0; i < _seedListeners.length; i++) {
            try { _seedListeners[i](event); } catch (e) { /* ignore */ }
        }
    }

    /**
     * Notify all generation progress listeners.
     * @param {Object} event - Event data.
     * @private
     */
    function _notifyGenerationProgress(event) {
        for (var i = 0; i < _generationListeners.length; i++) {
            try { _generationListeners[i](event); } catch (e) { /* ignore */ }
        }
    }

    // ============================================================
    // Statistics
    // ============================================================

    /**
     * Get terrain generation statistics.
     * @returns {{seed: number, biomeId: number, chunksGenerated: number, cacheHits: number, cacheMisses: number, cacheHitRate: number, isGenerating: boolean}}
     */
    function getStats() {
        var totalAccesses = _cacheHitCount + _cacheMissCount;
        var cacheHitRate = totalAccesses > 0 ? (_cacheHitCount / totalAccesses * 100) : 0;

        return {
            seed: _seed,
            biomeId: _currentBiomeId,
            chunksGenerated: _totalChunksGenerated,
            cacheHits: _cacheHitCount,
            cacheMisses: _cacheMissCount,
            cacheHitRate: cacheHitRate.toFixed(1) + '%',
            isGenerating: _generationInProgress,
            storage: Donkeycraft.Storage ? Donkeycraft.Storage.getStats() : null
        };
    }

    /**
     * Reset generation statistics.
     */
    function resetStats() {
        _totalChunksGenerated = 0;
        _cacheHitCount = 0;
        _cacheMissCount = 0;
    }

    // ============================================================
    // Initialization & Lifecycle
    // ============================================================

    /**
     * Initialize the terrain core system.
     * @returns {Promise<boolean>} True if initialization successful.
     */
    function init() {
        // Initialize storage if available
        if (Donkeycraft.Storage && typeof Donkeycraft.Storage.init === 'function') {
            return Donkeycraft.Storage.init().then(function (ready) {
                // Initialize noise with default seed
                setSeed(_seed);
                return true;
            }).catch(function (e) {
                // Storage init failed — continue without it
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[TerrainCore] Storage initialization failed:', e && e.message ? e.message : String(e));
                }
                setSeed(_seed);
                return false;
            });
        }

        // No storage — just initialize noise
        setSeed(_seed);
        return Promise.resolve(true);
    }

    /**
     * Destroy the terrain core system and free resources.
     */
    function destroy() {
        if (Donkeycraft.Storage && typeof Donkeycraft.Storage.destroy === 'function') {
            Donkeycraft.Storage.destroy();
        }
        _seedListeners = [];
        _generationListeners = [];
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Donkeycraft.TerrainCore — Central terrain engine.
     * @namespace
     */
    Donkeycraft.TerrainCore = {
        // Seed management
        setSeed: setSeed,
        getSeed: getSeed,

        // Biome management
        setBiome: setBiome,
        getBiome: getBiome,

        // Chunk generation
        generateChunk: generateChunk,
        generateAllChunks: generateAllChunks,
        generateChunksInRadius: generateChunksInRadius,

        // Statistics
        getStats: getStats,
        resetStats: resetStats,

        // Lifecycle
        init: init,
        destroy: destroy,

        // Internal access (for other modules)
        _makeCacheKey: _makeCacheKey,
        _chunkHash: _chunkHash
    };

})();