// Donkeycraft — Realistic Water Generator
// Water features: oceans, rivers, lakes, underground aquifers, and flooded caves.
// Biome-specific behavior: grass (standard), arctic (frozen), desert (no surface water), forest (higher water table).
//
// @module water-generator
// @description Realistic water placement system with rivers, lakes, and biome-specific behavior
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    var CHUNK_SIZE = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
    var WORLD_HEIGHT = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

    // ============================================================
    // Constants
    // ============================================================

    /**
     * Default sea level for standard biomes.
     * @type {number}
     */
    var DEFAULT_WATER_LEVEL = 63;

    /**
     * River formation threshold — noise value below which water flows.
     * @type {number}
     */
    var RIVER_THRESHOLD = -0.15;

    /**
     * River depth — how many blocks deep river beds are.
     * @type {number}
     */
    var RIVER_DEPTH = 2;

    /**
     * Lake frequency per chunk (base count).
     * @type {number}
     */
    var LAKE_FREQUENCY = 2;

    /**
     * Maximum number of water blocks to place per chunk (safety cap).
     * @type {number}
     */
    var MAX_WATER_BLOCKS_PER_CHUNK = 32768;

    // ============================================================
    // Biome Water Configuration
    // ============================================================

    /**
     * Water configuration for each of the 4 simplified biomes.
     * @type {Object.<string, {waterLevel: number, hasSurfaceWater: boolean, hasRivers: boolean, hasAquifers: boolean, iceBlockId: number}>}
     */
    var BIOME_WATER_CONFIG = {
        grass: {
            waterLevel: 63,
            hasSurfaceWater: true,
            hasRivers: true,
            hasAquifers: true,
            iceBlockId: 0 // No ice
        },
        arctic: {
            waterLevel: 58,
            hasSurfaceWater: true,
            hasRivers: true,
            hasAquifers: false,
            iceBlockId: 325 // Ice block (if registered)
        },
        desert: {
            waterLevel: 60,
            hasSurfaceWater: false,
            hasRivers: false,
            hasAquifers: true,
            iceBlockId: 0
        },
        forest: {
            waterLevel: 63,
            hasSurfaceWater: true,
            hasRivers: true,
            hasAquifers: true,
            iceBlockId: 0
        }
    };

    // ============================================================
    // Water Generator State
    // ============================================================

    var _waterBlockId = null;
    var _lavaBlockId = null;
    var _iceBlockId = null;
    var _liquidBlocks = {};

    /**
     * Resolve water-related block IDs from BlockRegistry.
     */
    function init() {
        _resolveWaterBlocks();
    }

    /**
     * Resolve water-related block IDs from BlockRegistry.
     * @private
     */
    function _resolveWaterBlocks() {
        if (!Donkeycraft.BlockRegistry) return;

        // Water blocks
        var waterNames = ['water', 'water_still', 'flowing_water'];
        for (var i = 0; i < waterNames.length; i++) {
            var block = Donkeycraft.BlockRegistry.getBlockByName(waterNames[i]);
            if (block) {
                _waterBlockId = block.id;
                _registerLiquidBlock(block.id);
                break;
            }
        }
        if (!_waterBlockId) _waterBlockId = 212; // Fallback

        // Lava blocks
        var lavaNames = ['lava', 'lava_still', 'flowing_lava'];
        for (var j = 0; j < lavaNames.length; j++) {
            var lavaBlock = Donkeycraft.BlockRegistry.getBlockByName(lavaNames[j]);
            if (lavaBlock) {
                _lavaBlockId = lavaBlock.id;
                _registerLiquidBlock(lavaBlock.id);
                break;
            }
        }

        // Ice blocks
        var iceNames = ['ice', 'packed_ice', 'blue_ice'];
        for (var k = 0; k < iceNames.length; k++) {
            var iceBlock = Donkeycraft.BlockRegistry.getBlockByName(iceNames[k]);
            if (iceBlock) {
                _iceBlockId = iceBlock.id;
                break;
            }
        }
    }

    /**
     * Register a block ID as a liquid block.
     * @param {number} blockId - Block ID to register.
     * @private
     */
    function _registerLiquidBlock(blockId) {
        _liquidBlocks[blockId] = true;
    }

    /**
     * Check if a block ID is a liquid.
     * @param {number} blockId - Block ID.
     * @returns {boolean} True if the block is a liquid.
     */
    function isLiquidBlock(blockId) {
        return _liquidBlocks[blockId] === true;
    }

    /**
     * Get the resolved water block ID.
     * @returns {number} Water block ID, or 0 if not resolved.
     */
    function getWaterBlockId() {
        return _waterBlockId || 0;
    }

    // ============================================================
     // Main Water Placement Entry Point
    // ============================================================

    /**
     * Place all water features for a chunk.
     * Runs ocean/surface water, rivers, lakes, and underground aquifers based on biome config.
     * @param {Donkeycraft.Chunk} chunk - The chunk to place water in.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {number} biomeId - Biome ID for this chunk.
     * @param {number[]} heightmap - Heightmap array.
     * @param {Object} [options] - Generation options.
     * @returns {{waterBlocksPlaced: number, riversCreated: number, lakesCreated: number}} Generation stats.
     */
    function placeWater(chunk, chunkX, chunkZ, biomeId, heightmap, options) {
        var stats = { waterBlocksPlaced: 0, riversCreated: 0, lakesCreated: 0 };

        if (!chunk || typeof chunk.setBlock !== 'function') return stats;
        if (!_waterBlockId || _waterBlockId === 0) return stats;

        // Resolve biome name from ID
        var biomeName = _resolveBiomeName(biomeId);
        var config = BIOME_WATER_CONFIG[biomeName] || BIOME_WATER_CONFIG.grass;

        // Ocean biomes: fill to water level across entire chunk
        if (options && options.isOcean) {
            stats.waterBlocksPlaced += _placeOceanWater(chunk, config, heightmap);
        } else {
            // Overworld biomes: surface water in low areas
            stats.waterBlocksPlaced += _placeSurfaceWater(chunk, config, heightmap);
        }

        // Rivers (biome-dependent)
        if (config.hasRivers) {
            var riverStats = _placeRivers(chunk, chunkX, chunkZ, config, heightmap);
            stats.waterBlocksPlaced += riverStats.waterBlocksPlaced;
            stats.riversCreated += riverStats.riversCreated;
        }

        // Lakes (biome-dependent)
        if (config.hasSurfaceWater) {
            var lakeStats = _placeLakes(chunk, chunkX, chunkZ, config, heightmap);
            stats.waterBlocksPlaced += lakeStats.waterBlocksPlaced;
            stats.lakesCreated += lakeStats.lakesCreated;
        }

        // Underground aquifers (biome-dependent)
        if (config.hasAquifers) {
            var aquiferStats = _placeAquifers(chunk, chunkX, chunkZ, config);
            stats.waterBlocksPlaced += aquiferStats.waterBlocksPlaced;
        }

        // Ice layer for arctic biomes
        if (config.iceBlockId && _iceBlockId) {
            stats.waterBlocksPlaced += _placeIceLayer(chunk, config, heightmap);
        }

        return stats;
    }

    // ============================================================
    // Ocean Water Placement
    // ============================================================

    /**
     * Place ocean water across the chunk — fills from surface+1 to water level.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {Object} config - Biome water configuration.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {number} Number of water blocks placed.
     * @private
     */
    function _placeOceanWater(chunk, config, heightmap) {
        var placed = 0;
        var waterLevel = config.waterLevel;

        if (!heightmap) return placed;

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var z = 0; z < CHUNK_SIZE; z++) {
                var surfaceY = heightmap[x + z * CHUNK_SIZE] || waterLevel;

                // Fill from surface+1 to water level, only replacing air blocks
                for (var y = surfaceY + 1; y <= waterLevel && y < WORLD_HEIGHT; y++) {
                    if (chunk.getBlock(x, y, z) === 0) {
                        chunk.setBlock(x, y, z, _waterBlockId);
                        placed++;
                    }
                }
            }
        }

        return placed;
    }

    // ============================================================
    // Surface Water Placement
    // ============================================================

    /**
     * Place surface water in low-lying areas where terrain is below sea level.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {Object} config - Biome water configuration.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {number} Number of water blocks placed.
     * @private
     */
    function _placeSurfaceWater(chunk, config, heightmap) {
        var placed = 0;
        var waterLevel = config.waterLevel;

        if (!heightmap) return placed;

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var z = 0; z < CHUNK_SIZE; z++) {
                var surfaceY = heightmap[x + z * CHUNK_SIZE] || waterLevel;

                // Place water where terrain is below water level
                if (surfaceY < waterLevel) {
                    for (var y = surfaceY + 1; y <= waterLevel && y < WORLD_HEIGHT; y++) {
                        if (chunk.getBlock(x, y, z) === 0) {
                            chunk.setBlock(x, y, z, _waterBlockId);
                            placed++;
                        }
                    }
                }
            }
        }

        return placed;
    }

    // ============================================================
    // River Placement
    // ============================================================

    /**
     * Place rivers using noise-based channel carving.
     * Rivers flow from higher to lower terrain, following natural drainage paths.
     * Uses world coordinates for seamless chunk boundary traversal.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Object} config - Biome water configuration.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {{waterBlocksPlaced: number, riversCreated: number}} Generation stats.
     * @private
     */
    function _placeRivers(chunk, chunkX, chunkZ, config, heightmap) {
        var stats = { waterBlocksPlaced: 0, riversCreated: 0 };

        if (!heightmap) return stats;

        var riverNoiseScale = 0.01;
        var startX = ((chunkX * 7 + chunkZ * 13) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        var startZ = ((chunkX * 11 + chunkZ * 3) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

        // Start from a random edge position (local chunk coordinates)
        var localX = startX;
        var localZ = startZ;
        // World coordinates for seamless noise sampling across chunks
        var worldX = chunkX * CHUNK_SIZE + startX;
        var worldZ = chunkZ * CHUNK_SIZE + startZ;
        var currentY = heightmap[startX + startZ * CHUNK_SIZE] || config.waterLevel;

        // Trace river path using gradient descent on terrain noise
        var riverLength = 10 + Math.abs(_hash2D(chunkX, chunkZ)) % 30;
        var riverWidth = 1 + (Math.abs(_hash2D(chunkX + 1, chunkZ)) % 2);

        for (var step = 0; step < riverLength; step++) {
            // Check local bounds — allow stepping off to enable cross-chunk flow
            if (localX < -riverWidth || localX >= CHUNK_SIZE + riverWidth || localZ < -riverWidth || localZ >= CHUNK_SIZE + riverWidth) break;

            // Get terrain height at current position using world coordinates for seamless chunk boundaries
            var sampleLocalX = ((worldX % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);
            var sampleLocalZ = ((worldZ % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);
            var sampleWorldX = chunkX * CHUNK_SIZE + sampleLocalX;
            var sampleWorldZ = chunkZ * CHUNK_SIZE + sampleLocalZ;

            // Clamp to valid heightmap range
            if (sampleLocalX < 0 || sampleLocalX >= CHUNK_SIZE || sampleLocalZ < 0 || sampleLocalZ >= CHUNK_SIZE) break;

            currentY = heightmap[sampleLocalX + sampleLocalZ * CHUNK_SIZE] || config.waterLevel;
            if (currentY < 2 || currentY >= WORLD_HEIGHT - 2) break;

            // Carve river bed
            for (var dy = 0; dy <= RIVER_DEPTH && currentY - dy >= 0; dy++) {
                var ry = currentY - dy;
                for (var wx = -riverWidth; wx <= riverWidth; wx++) {
                    for (var wz = -riverWidth; wz <= riverWidth; wz++) {
                        var rx = sampleLocalX + wx;
                        var rz = sampleLocalZ + wz;

                        if (rx < 0 || rx >= CHUNK_SIZE || rz < 0 || rz >= CHUNK_SIZE) continue;

                        // Elliptical cross-section
                        var normalizedDist = (wx * wx + wz * wz) / ((riverWidth + 1) * (riverWidth + 1));
                        if (normalizedDist > 1) continue;

                        var currentBlock = chunk.getBlock(rx, ry, rz);
                        if (currentBlock !== 0 && currentBlock !== _waterBlockId) {
                            chunk.setBlock(rx, ry, rz, 0); // Carve air
                            stats.carvedBlocks = (stats.carvedBlocks || 0) + 1;
                        }
                    }
                }
            }

            // Place water in river bed
            for (var wy = currentY - RIVER_DEPTH; wy <= currentY && wy < WORLD_HEIGHT; wy++) {
                if (chunk.getBlock(sampleLocalX, wy, sampleLocalZ) === 0) {
                    chunk.setBlock(sampleLocalX, wy, sampleLocalZ, _waterBlockId);
                    stats.waterBlocksPlaced++;
                }
            }

            // Determine next position using noise-based flow direction
            var flowNoise = _fbmNoise(
                worldX * riverNoiseScale,
                0,
                worldZ * riverNoiseScale,
                2
            );

            // Move in direction of steepest descent using world coordinates
            var dx = Math.floor(_hash2D(sampleLocalX + step, sampleLocalZ) % 3) - 1;
            var dz = Math.floor(_hash2D(sampleLocalX, sampleLocalZ + step) % 3) - 1;

            // Bias movement toward lower terrain
            if (flowNoise < RIVER_THRESHOLD) {
                worldX += dx;
                worldZ += dz;
                localX = ((worldX % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);
                localZ = ((worldZ % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);
            } else {
                // River dissipates
                break;
            }
        }

        // Count distinct rivers (approximate)
        stats.riversCreated = stats.waterBlocksPlaced > 0 ? 1 : 0;

        return stats;
    }

    // ============================================================
    // Lake Placement
    // ============================================================

    /**
     * Place underground/lake water using noise-based basin detection.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Object} config - Biome water configuration.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {{waterBlocksPlaced: number, lakesCreated: number}} Generation stats.
     * @private
     */
    function _placeLakes(chunk, chunkX, chunkZ, config, heightmap) {
        var stats = { waterBlocksPlaced: 0, lakesCreated: 0 };

        var worldSeed = Donkeycraft.Config ? (Donkeycraft.Config.SEED || 42) : 42;
        var chunkSeed = _hash2D(chunkX, chunkZ);
        var lakeCount = LAKE_FREQUENCY + ((chunkSeed >> 8) % 2);

        for (var i = 0; i < lakeCount; i++) {
            var hash = _hash2D(chunkSeed + i * 73, i * 97);
            var lx = hash % CHUNK_SIZE;
            if (lx < 0) lx += CHUNK_SIZE;
            var lz = ((hash >> 8) % CHUNK_SIZE);
            if (lz < 0) lz += CHUNK_SIZE;

            // Determine terrain surface Y for lake clamping
            var surfaceY = heightmap[lx + lz * CHUNK_SIZE] || WORLD_HEIGHT;
            if (surfaceY < 2 || surfaceY >= WORLD_HEIGHT - 4) continue;

            // Clamp lake Y to be below surface
            var lakeY = Math.min(surfaceY - 3, config.waterLevel - 2);
            if (lakeY < 5) continue;

            // Lake radius
            var radius = 2 + ((hash >> 16) % 3);

            // Check if this is a basin area (terrain below water level)
            var isBasin = false;
            for (var bx = lx - radius; bx <= lx + radius; bx++) {
                for (var bz = lz - radius; bz <= lz + radius; bz++) {
                    if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) continue;
                    var h = heightmap[bx + bz * CHUNK_SIZE];
                    if (h < config.waterLevel) {
                        isBasin = true;
                        break;
                    }
                }
                if (isBasin) break;
            }

            if (!isBasin) continue;

            // Place lake water
            stats.lakesCreated += _placeUndergroundLake(chunk, lx, lakeY, lz, radius);
        }

        return stats;
    }

    /**
     * Place an underground lake (sphere of water).
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} cx - Center X.
     * @param {number} cy - Center Y.
     * @param {number} cz - Center Z.
     * @param {number} radius - Lake radius.
     * @returns {number} Number of water blocks placed.
     * @private
     */
    function _placeUndergroundLake(chunk, cx, cy, cz, radius) {
        var placed = 0;
        var rSquared = radius * radius;
        var rInt = Math.ceil(radius);

        for (var dx = -rInt; dx <= rInt; dx++) {
            for (var dy = -rInt; dy <= rInt; dy++) {
                for (var dz = -rInt; dz <= rInt; dz++) {
                    var distSquared = dx * dx + dy * dy + dz * dz;

                    if (distSquared > rSquared) continue;

                    var bx = cx + dx;
                    var by = cy + dy;
                    var bz = cz + dz;

                    if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) continue;
                    if (by < 0 || by >= WORLD_HEIGHT) continue;

                    var currentBlock = chunk.getBlock(bx, by, bz);
                    if (currentBlock === 0 || currentBlock === _waterBlockId) {
                        chunk.setBlock(bx, by, bz, _waterBlockId);
                        placed++;
                    }
                }
            }
        }

        return placed;
    }

    // ============================================================
    // Underground Aquifer Placement
    // ============================================================

    /**
     * Place underground aquifers — water-filled pockets deep below the terrain.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Object} config - Biome water configuration.
     * @returns {{waterBlocksPlaced: number}} Generation stats.
     * @private
     */
    function _placeAquifers(chunk, chunkX, chunkZ, config) {
        var placed = 0;

        var aquiferY = Math.max(5, config.waterLevel - 15);
        var rngState = _hash2D(chunkX, chunkZ);

        // Place 1-3 aquifer pockets per chunk
        var pocketCount = 1 + (rngState % 3);

        for (var p = 0; p < pocketCount; p++) {
            var px = (rngState >> (p * 8)) % CHUNK_SIZE;
            if (px < 0) px += CHUNK_SIZE;
            var pz = ((rngState >> (p * 8 + 4)) % CHUNK_SIZE);
            if (pz < 0) pz += CHUNK_SIZE;

            var aquiferRadius = 1 + ((rngState >> (p * 8 + 8)) % 2);

            // Place water at aquifer Y level
            for (var ax = -aquiferRadius; ax <= aquiferRadius; ax++) {
                for (var az = -aquiferRadius; az <= aquiferRadius; az++) {
                    var dist = Math.abs(ax) + Math.abs(az);
                    if (dist > aquiferRadius) continue;

                    var bx = px + ax;
                    var bz = pz + az;

                    if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) continue;

                    if (chunk.getBlock(bx, aquiferY, bz) === 0) {
                        chunk.setBlock(bx, aquiferY, bz, _waterBlockId);
                        placed++;
                    }
                }
            }
        }

        return { waterBlocksPlaced: placed };
    }

    // ============================================================
    // Ice Layer Placement (Arctic)
    // ============================================================

    /**
     * Place ice layer on surface water for arctic biomes.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {Object} config - Biome water configuration.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {number} Number of ice blocks placed.
     * @private
     */
    function _placeIceLayer(chunk, config, heightmap) {
        if (!_iceBlockId || !heightmap) return 0;

        var placed = 0;
        var waterLevel = config.waterLevel;

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var z = 0; z < CHUNK_SIZE; z++) {
                var surfaceY = heightmap[x + z * CHUNK_SIZE] || waterLevel;

                // Place ice at water level if surface is air
                if (surfaceY < waterLevel && surfaceY + 1 < WORLD_HEIGHT) {
                    if (chunk.getBlock(x, surfaceY + 1, z) === 0) {
                        chunk.setBlock(x, surfaceY + 1, z, _iceBlockId);
                        placed++;
                    }
                }
            }
        }

        return placed;
    }

    // ============================================================
    // Utility Functions
    // ============================================================

    /**
     * Resolve biome name from ID.
     * @param {number} biomeId - Biome ID.
     * @returns {string} Biome name.
     * @private
     */
    function _resolveBiomeName(biomeId) {
        switch (biomeId) {
            case 0: return 'grass';
            case 1: return 'arctic';
            case 2: return 'desert';
            case 3: return 'forest';
            default: return 'grass';
        }
    }

    /**
     * Deterministic 2D hash using FNV-1a inspired algorithm.
     * Handles negative coordinates by masking to signed 32-bit before hashing.
     * @param {number} x - X coordinate (may be negative).
     * @param {number} y - Y coordinate (may be negative).
     * @returns {number} Positive 32-bit integer.
     */
    function _hash2D(x, y) {
        if (Donkeycraft._gen && typeof Donkeycraft._gen._hash2D === 'function') {
            return Donkeycraft._gen._hash2D(Math.floor(x), Math.floor(y));
        }
        // Mask to signed 32-bit integers to handle negative coordinates consistently
        var xi = Math.floor(x) | 0;
        var yi = Math.floor(y) | 0;
        var h = (xi * 374761393 + yi * 668265263) ^ 0x5bd1e995;
        // Use unsigned right shift for consistent 32-bit behavior across all JS engines
        h = ((h >>> 13) ^ h) * 0x5bd1e995;
        return (h ^ (h >>> 15)) >>> 0;
    }

    /**
     * Fractal Brownian Motion for river flow detection.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     * @param {number} octaves - Number of octaves.
     * @returns {number} Normalized noise value [-1, 1].
     */
    function _fbmNoise(x, y, z, octaves) {
        if (Donkeycraft._gen && typeof Donkeycraft._gen._fbm === 'function') {
            try {
                return Donkeycraft._gen._fbm(x, y, z, octaves || 2, 0.5, 2.0);
            } catch (e) { /* fallback below */ }
        }
        if (Donkeycraft._gen && typeof Donkeycraft._gen._noise2D === 'function') {
            return Donkeycraft._gen._noise2D(x, z);
        }
        return 0;
    }

    /**
     * Get the default water level (sea level).
     * @returns {number} Water level Y coordinate.
     */
    function getWaterLevel() {
        return DEFAULT_WATER_LEVEL;
    }

    /**
     * Get the biome-specific water configuration.
     * @param {string} biomeName - Biome name.
     * @returns {Object|null} Biome water config, or null if not found.
     */
    function getBiomeWaterConfig(biomeName) {
        return BIOME_WATER_CONFIG[biomeName] || null;
    }

    /**
     * Destroy the water generator and free resources.
     */
    function destroy() {
        _waterBlockId = null;
        _lavaBlockId = null;
        _iceBlockId = null;
        _liquidBlocks = {};
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Donkeycraft.WaterGenerator — Realistic water placement system.
     * @namespace
     */
    Donkeycraft.WaterGenerator = {
        // Main entry point
        placeWater: placeWater,

        // Initialization
        init: init,
        destroy: destroy,

        // Block ID resolution
        isLiquidBlock: isLiquidBlock,
        getWaterBlockId: getWaterBlockId,

        // Configuration
        getWaterLevel: getWaterLevel,
        getBiomeWaterConfig: getBiomeWaterConfig,

        // Constants
        DEFAULT_WATER_LEVEL: DEFAULT_WATER_LEVEL,
        RIVER_THRESHOLD: RIVER_THRESHOLD,
        RIVER_DEPTH: RIVER_DEPTH,
        LAKE_FREQUENCY: LAKE_FREQUENCY,
        BIOME_WATER_CONFIG: BIOME_WATER_CONFIG
    };

})();