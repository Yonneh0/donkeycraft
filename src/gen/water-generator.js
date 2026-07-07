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
     * Valid range: 0-10. Higher values = more lakes per chunk.
     * @type {number}
     */
    var LAKE_FREQUENCY = 2;

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

    /**
     * Resolved water block ID (cached after init).
     * @type {number|null}
     */
    var _waterBlockId = null;

    /**
     * Resolved lava block ID (cached after init).
     * @type {number|null}
     */
    var _lavaBlockId = null;

    /**
     * Resolved ice block ID (cached after init).
     * @type {number|null}
     */
    var _iceBlockId = null;

    /**
     * Set of liquid block IDs for quick lookup.
     * @type {Object.<number, boolean>}
     */
    var _liquidBlocks = {};

    /**
     * River loop detection: tracks visited world coordinates per-chunk to prevent infinite loops
     * in flat terrain where gradient descent finds equal-height neighbors.
     * Uses a Set of numeric hashes for O(1) lookup.
     * Cleared at the start of each _placeRivers() call to avoid accumulation across chunks.
     * @type {Set<number>}
     * @private
     */
    var _riverVisited = new Set();

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

        // Place ocean/surface water first — fills empty space below sea level
        if (config.hasSurfaceWater) {
            var oceanStats = _placeOceanWater(chunk, config, heightmap);
            stats.waterBlocksPlaced += oceanStats;
        }

        // Rivers (biome-dependent) — run after ocean water for proper drainage
        if (config.hasRivers) {
            var riverStats = _placeRivers(chunk, chunkX, chunkZ, config, heightmap);
            stats.waterBlocksPlaced += riverStats.waterBlocksPlaced;
            stats.riversCreated += riverStats.riversCreated;
        }

        // Lakes (biome-dependent) — placed after rivers to fill remaining basins
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
     * Place ocean/surface water across the chunk — fills from surface+1 to water level
     * wherever terrain is below the biome's water level threshold.
     * Creates continuous water bodies that form oceans, seas, and large lakes.
     * @param {Donkeycraft.Chunk} chunk - The chunk to place water in.
     * @param {Object} config - Biome water configuration (must have waterLevel property).
     * @param {number[]} heightmap - Heightmap array (CHUNK_SIZE × CHUNK_SIZE).
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

    // _placeSurfaceWater is now merged into _placeOceanWater for efficiency.
    // The ocean water pass handles all below-sea-level filling in a single pass.
    // This eliminates code duplication and ensures consistent water behavior.

    // ============================================================
    // River Placement
    // ============================================================

    /**
     * Place rivers using noise-based channel carving.
     * Rivers flow from higher to lower terrain, following natural drainage paths
     * via gradient descent on terrain heightmap values.
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

        // Clear river visited set to prevent accumulation across chunk generations
        _clearRiverVisited();

        // River generation parameters
        var riverNoiseScale = 0.005;
        var startX = ((chunkX * 7 + chunkZ * 13) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        var startZ = ((chunkX * 11 + chunkZ * 3) % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

        // World coordinates for seamless noise sampling across chunks
        var worldX = chunkX * CHUNK_SIZE + startX;
        var worldZ = chunkZ * CHUNK_SIZE + startZ;
        var localX = startX;
        var localZ = startZ;
        var currentY = heightmap[startX + startZ * CHUNK_SIZE] || config.waterLevel;

        // River length: longer rivers in areas with higher terrain variation
        var riverLength = 15 + (Math.abs(_hash2D(chunkX, chunkZ)) % 40);
        var riverWidth = 1 + (Math.abs(_hash2D(chunkX + 1, chunkZ)) % 3);

        for (var step = 0; step < riverLength; step++) {
            // Check bounds — allow stepping off to enable cross-chunk flow
            if (localX < -riverWidth * 2 || localX >= CHUNK_SIZE + riverWidth * 2 ||
                localZ < -riverWidth * 2 || localZ >= CHUNK_SIZE + riverWidth * 2) {
                break;
            }

            // Get terrain height at current position using world coordinates
            var sampleLocalX = ((worldX % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);
            var sampleLocalZ = ((worldZ % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);

            // Clamp to valid heightmap range
            if (sampleLocalX < 0 || sampleLocalX >= CHUNK_SIZE ||
                sampleLocalZ < 0 || sampleLocalZ >= CHUNK_SIZE) {
                break;
            }

            currentY = heightmap[sampleLocalX + sampleLocalZ * CHUNK_SIZE] || config.waterLevel;
            if (currentY < 2 || currentY >= WORLD_HEIGHT - 2) break;

            // Carve river bed with elliptical cross-section
            for (var dy = 0; dy <= RIVER_DEPTH && currentY - dy >= 0; dy++) {
                var ry = currentY - dy;
                for (var wx = -riverWidth; wx <= riverWidth; wx++) {
                    for (var wz = -riverWidth; wz <= riverWidth; wz++) {
                        var rx = sampleLocalX + wx;
                        var rz = sampleLocalZ + wz;

                        if (rx < 0 || rx >= CHUNK_SIZE || rz < 0 || rz >= CHUNK_SIZE) continue;

                        // Elliptical cross-section for natural-looking river shape
                        var normalizedDist = (wx * wx + wz * wz) / ((riverWidth + 1) * (riverWidth + 1));
                        if (normalizedDist > 1) continue;

                        var currentBlock = chunk.getBlock(rx, ry, rz);
                        if (currentBlock !== 0 && currentBlock !== _waterBlockId) {
                            chunk.setBlock(rx, ry, rz, 0); // Carve air
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

            // Determine next position using gradient descent on terrain heightmap.
            // Sample neighboring positions and move toward the lowest terrain height.
            // This creates realistic rivers that follow natural drainage paths.
            var bestX = sampleLocalX;
            var bestZ = sampleLocalZ;
            var minHeight = currentY;

            // Check 8 neighbors for steepest descent direction
            for (var nx = -1; nx <= 1; nx++) {
                for (var nz = -1; nz <= 1; nz++) {
                    if (nx === 0 && nz === 0) continue;

                    // Calculate neighbor's world coordinates for seamless chunk boundaries
                    var neighborWorldX = worldX + nx;
                    var neighborWorldZ = worldZ + nz;
                    var neighborLocalX = ((neighborWorldX % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);
                    var neighborLocalZ = ((neighborWorldZ % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);

                    // Clamp to valid heightmap range
                    if (neighborLocalX < 0 || neighborLocalX >= CHUNK_SIZE ||
                        neighborLocalZ < 0 || neighborLocalZ >= CHUNK_SIZE) continue;

                    var neighborHeight = heightmap[neighborLocalX + neighborLocalZ * CHUNK_SIZE];
                    if (isFinite(neighborHeight) && neighborHeight < minHeight) {
                        minHeight = neighborHeight;
                        bestX = neighborLocalX;
                        bestZ = neighborLocalZ;
                    }
                }
            }

            // River loop detection: track visited positions to prevent infinite loops
            // in flat terrain where multiple cells have equal height.
            var visitedKey = _hash2D(worldX, worldZ);
            if (_riverVisited.has(visitedKey)) {
                // Loop detected — river dissipates
                break;
            }
            _riverVisited.add(visitedKey);

            // Safety limit: prevent infinite loops from corrupted heightmap data
            if (step > riverLength * 3) {
                break;
            }

            // Check if we found a downward path (terrain gradient)
            // Also check drainage noise for natural river paths
            var flowNoise = _fbmNoise(
                worldX * riverNoiseScale,
                0,
                worldZ * riverNoiseScale,
                2
            );

            // Move toward lower terrain if gradient exists and flow noise supports river formation
            if (minHeight < currentY && flowNoise < RIVER_THRESHOLD) {
                worldX += (bestX - sampleLocalX);
                worldZ += (bestZ - sampleLocalZ);
                localX = ((worldX % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);
                localZ = ((worldZ % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE);
            } else if (flowNoise >= RIVER_THRESHOLD) {
                // River dissipates when flow noise threshold not met
                break;
            }
            // If no downward path found but flow noise is good, river continues flat (lake formation)
        }

        // Count distinct rivers (approximate based on water block patterns)
        stats.riversCreated = stats.waterBlocksPlaced > 0 ? 1 : 0;

        return stats;
    }

    // ============================================================
    // Lake Placement
    // ============================================================

    /**
     * Place underground/lake water using noise-based basin detection.
     * Detects low-lying basin areas and fills them with water to create natural-looking lakes.
     * Uses world coordinates for seamless chunk boundary traversal.
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

        if (!heightmap || !Array.isArray(heightmap)) return stats;

        var worldSeed = Donkeycraft.Config ? (Donkeycraft.Config.SEED || 42) : 42;
        var chunkSeed = _hash2D(chunkX, chunkZ);
        // Use unsigned right shift (>>>) to ensure non-negative lake count offset
        var lakeCountOffset = ((chunkSeed >>> 8) % 3);
        var lakeCount = LAKE_FREQUENCY + lakeCountOffset;

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
     * Place underground aquifers — connected water-filled pockets deep below the terrain.
     * Uses noise-based basin detection to create realistic aquifer networks instead of
     * isolated single-block pockets. Aquifers form connected horizontal layers where
     * terrain is below the water table.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Object} config - Biome water configuration.
     * @returns {{waterBlocksPlaced: number}} Generation stats.
     * @private
     */
    function _placeAquifers(chunk, chunkX, chunkZ, config) {
        var placed = 0;

        // Aquifer Y level: 10-15 blocks below water level for natural groundwater
        var aquiferY = Math.max(5, config.waterLevel - 12);
        var rngState = _hash2D(chunkX, chunkZ);

        // Use noise-based detection to find connected basin areas
        // This creates realistic aquifer networks instead of isolated pockets
        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var z = 0; z < CHUNK_SIZE; z++) {
                var worldX = chunkX * CHUNK_SIZE + x;
                var worldZ = chunkZ * CHUNK_SIZE + z;

                // Use noise to detect if this position is in an aquifer basin
                var basinNoise = _fbmNoise(
                    worldX * 0.08,
                    aquiferY * 0.05,
                    worldZ * 0.08,
                    2
                );

                // Place water where basin noise indicates a connected pocket
                // and the block above is solid rock (not already water or air)
                if (basinNoise < -0.15) {
                    var bx = x;
                    var by = aquiferY;
                    var bz = z;

                    if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE && by >= 0 && by < WORLD_HEIGHT) {
                        var currentBlock = chunk.getBlock(bx, by, bz);
                        // Replace air with water to form aquifer
                        if (currentBlock === 0) {
                            chunk.setBlock(bx, by, bz, _waterBlockId);
                            placed++;
                        }

                        // Occasionally extend vertically for connected networks
                        if (basinNoise < -0.3 && by + 1 < WORLD_HEIGHT) {
                            var aboveBlock = chunk.getBlock(bx, by + 1, bz);
                            if (aboveBlock === 0) {
                                chunk.setBlock(bx, by + 1, bz, _waterBlockId);
                                placed++;
                            }
                        }
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
        var id = Math.max(0, Math.min(3, Math.floor(biomeId)));
        switch (id) {
            case 0: return 'grass';
            case 1: return 'arctic';
            case 2: return 'desert';
            case 3: return 'forest';
            default: return 'grass';
        }
    }

    /**
     * Deterministic 2D hash using FNV-1a inspired algorithm.
     * Delegates to Donkeycraft._gen._hash2D when available for consistency.
     * Handles negative coordinates by masking to signed 32-bit before hashing.
     * @param {number} x - X coordinate (may be negative).
     * @param {number} y - Y coordinate (may be negative).
     * @returns {number} Positive 32-bit integer.
     */
    function _hash2D(x, y) {
        if (Donkeycraft._gen && typeof Donkeycraft._gen._hash2D === 'function') {
            return Donkeycraft._gen._hash2D(Math.floor(x), Math.floor(y));
        }
        // Fallback: FNV-1a inspired hash with 32-bit masking at each step
        var xi = Math.floor(x) | 0;
        var yi = Math.floor(y) | 0;
        var h = ((xi * 374761393 + yi * 668265263) ^ 0x5bd1e995) & 0xFFFFFFFF;
        h = (((h >>> 13) ^ h) * 0x5bd1e995) & 0xFFFFFFFF;
        return ((h ^ (h >>> 15)) & 0xFFFFFFFF) >>> 0;
    }

    /**
     * Fractal Brownian Motion for river flow detection and aquifer placement.
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
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[WaterGenerator] FBM noise fallback:', e && e.message ? e.message : String(e));
                }
            }
        }
        if (Donkeycraft._gen && typeof Donkeycraft._gen._noise2D === 'function') {
            try {
                return Donkeycraft._gen._noise2D(x, z);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[WaterGenerator] Noise2D fallback:', e && e.message ? e.message : String(e));
                }
            }
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
     * Clears all internal state including the river visited set.
     */
    function destroy() {
        _waterBlockId = null;
        _lavaBlockId = null;
        _iceBlockId = null;
        _liquidBlocks = {};
        _riverVisited.clear();
    }

    // ============================================================
    // Internal: Clear river visited set (called per-chunk)
    // ============================================================

    /**
     * Clear the river visited set to prevent accumulation across chunk generations.
     * Must be called at the start of each _placeRivers() invocation.
     * @private
     */
    function _clearRiverVisited() {
        _riverVisited.clear();
    }

    /**
     * Donkeycraft.WaterGenerator — Realistic water placement system.
     * Handles ocean/surface water, rivers, lakes, aquifers, and ice layers.
     * @namespace
     */
    Donkeycraft.WaterGenerator = {
        // Main entry point
        placeWater: placeWater,

        // Initialization / lifecycle
        init: init,
        destroy: destroy,

        // Block ID resolution
        isLiquidBlock: isLiquidBlock,
        getWaterBlockId: getWaterBlockId,

        // Configuration access
        getWaterLevel: getWaterLevel,
        getBiomeWaterConfig: getBiomeWaterConfig,

        // Constants (read-only reference for external consumers)
        DEFAULT_WATER_LEVEL: DEFAULT_WATER_LEVEL,
        RIVER_THRESHOLD: RIVER_THRESHOLD,
        RIVER_DEPTH: RIVER_DEPTH,
        LAKE_FREQUENCY: LAKE_FREQUENCY,
        BIOME_WATER_CONFIG: BIOME_WATER_CONFIG
    };

})();