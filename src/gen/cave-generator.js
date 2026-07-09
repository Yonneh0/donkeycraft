// Donkeycraft — Multi-Pass Cave Generator
// 5-pass cave system: main network, small branches, entrance carving, lava caves, decoration caves.
// Uses fractal noise for natural tunnel shapes with spherical carving and adaptive Y stepping.
//
// @module cave-generator
// @description 5-pass cave generation system for realistic underground networks
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
   * Air block ID.
   * @type {number}
   */
  var AIR_ID = 0;

  /**
   * Default cave threshold for main network carving.
   * Lower values = fewer caves (more solid terrain).
   * Valid range: -0.5 to 0.5. Negative values = more caves.
   * @type {number}
   */
  var CAVE_THRESHOLD_MAIN = -0.1;

  /**
   * Default cave threshold for small cave branches.
   * Higher threshold = more sparse small caves.
   * Valid range: -0.5 to 1.0. Negative values = more caves.
   * @type {number}
   */
  var CAVE_THRESHOLD_SMALL = 0.05;

  /**
   * Default Y level for lava caves.
   * Lava appears below this level.
   * Valid range: 0 to WORLD_HEIGHT/2. Lower values = deeper lava.
   * @type {number}
   */
  var LAVA_CAVE_Y_LEVEL = 10;

  /**
   * Biome-specific cave generation Y-range configuration.
   * Each biome can have different startY (max depth) and endY (min depth) values.
   * @type {Object.<string, {startY: number, endY: number}>}
   */
  var CAVE_Y_RANGES = {
    grass: { startY: 140, endY: 5 },
    arctic: { startY: 100, endY: 5 },
    desert: { startY: 120, endY: 10 },
    forest: { startY: 130, endY: 3 },
  };

  /**
   * Maximum radius of cave tunnels (in blocks).
   * Valid range: 1-10. Higher values = larger caves.
   * @type {number}
   */
  var MAX_CAVE_RADIUS = 4;

  /**
   * Minimum radius of small cave tunnels.
   * Valid range: 0.5-5. Higher values = thicker small caves.
   * @type {number}
   */
  var MIN_CAVE_RADIUS = 1.5;

  /**
   * Decoration cave threshold — noise value below which decoration caves generate.
   * Uses negative values to ensure only ~5-10% of space becomes decoration caves.
   * Valid range: -0.8 to 0.0. More negative = fewer caves.
   * @type {number}
   */
  var CAVE_THRESHOLD_DECO = -0.3;

  /**
   * Noise scale for decoration cave generation.
   * Larger scale = fewer, larger decoration caves.
   * @type {number}
   */
  var NOISE_SCALE_DECO = 0.015;

  // ============================================================
  // Cave Generator State
  // ============================================================

  /**
   * Resolve the air block ID from BlockRegistry.
   * @returns {number} Air block ID (always 0).
   * @private
   */
  function _getAirId() {
    return AIR_ID;
  }

  // ============================================================
  // Pass 1: Main Cave Network
  // ============================================================

  /**
   * Generate the main cave network using fBm noise at a low threshold.
   * Creates large tunnels and caverns that form the primary underground structure.
   * Cave generation occurs in the deep underground layer (Y=5 to Y=WORLD_HEIGHT/2)
   * for realistic geology.
   * @param {Donkeycraft.Chunk} chunk - The chunk to generate caves in.
   * @param {number} chunkX - Chunk X coordinate (for noise seeding).
   * @param {number} chunkZ - Chunk Z coordinate (for noise seeding).
   * @param {Object} [options] - Generation options.
   * @param {number} [options.threshold] - Noise threshold for cave carving [-1, 1].
   * @param {number} [options.radius] - Base cave tunnel radius.
   * @param {number} [options.noiseScale] - Noise scale factor.
   * @returns {Object} Generation stats: {mainCavesCarved, blocksModified}.
   */
  function pass1MainNetwork(chunk, chunkX, chunkZ, options) {
    var result = { mainCavesCarved: 0, blocksModified: 0 };

    if (!chunk || typeof chunk.setBlock !== 'function') return result;

    var threshold =
      options && options.threshold !== undefined
        ? options.threshold
        : CAVE_THRESHOLD_MAIN;
    var baseRadius = options && options.radius ? options.radius : 3;
    var noiseScale = options && options.noiseScale ? options.noiseScale : 0.02;

    var airId = _getAirId();

    // Step through Y with adaptive spacing for connected networks
    var yStep = 2;
    // Generate caves in deep underground layer: from Y=153 down to minimum Y
    // Using 60% of world height for realistic deep cave systems (was 40% = Y=102, too high)
    var startY = Math.floor(WORLD_HEIGHT * 0.6); // Y=153 for deep caves
    var endY = 2;

    for (var y = startY; y >= endY; y -= yStep) {
      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          // Global coordinates for seamless chunk boundaries
          var worldX = chunkX * CHUNK_SIZE + x;
          var worldZ = chunkZ * CHUNK_SIZE + z;

          // Get fBm noise value at this position
          var noiseValue = _fbmNoise(
            worldX * noiseScale,
            y * noiseScale * 0.8,
            worldZ * noiseScale,
            3
          );

          // Check if below threshold (cave space)
          if (noiseValue < threshold) {
            // Calculate variable radius based on noise
            var radius =
              baseRadius +
              _fbmNoise(worldX * 0.1, y * 0.1, worldZ * 0.1, 2) * 1.5;

            // Carve spherical cave at this position
            result.blocksModified += _carveCave(chunk, x, y, z, radius, airId);
          }
        }
      }
    }

    // Count distinct cave regions (approximate by counting transition points)
    result.mainCavesCarved = Math.floor(
      result.blocksModified / (Math.PI * baseRadius * baseRadius * 4)
    );

    return result;
  }

  // ============================================================
  // Pass 2: Small Cave Branches
  // ============================================================

  /**
   * Generate small cave branches using finer-scale noise.
   * Creates secondary passages and connects main caves to form realistic networks.
   * Cave generation occurs in the underground layer (Y=5 to Y=WORLD_HEIGHT/2).
   * @param {Donkeycraft.Chunk} chunk - The chunk to generate caves in.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {Object} [options] - Generation options.
   * @returns {Object} Generation stats: {smallCavesCarved, blocksModified}.
   */
  function pass2SmallBranches(chunk, chunkX, chunkZ, options) {
    var result = { smallCavesCarved: 0, blocksModified: 0 };

    if (!chunk || typeof chunk.setBlock !== 'function') return result;

    var threshold =
      options && options.threshold !== undefined
        ? options.threshold
        : CAVE_THRESHOLD_SMALL;
    var baseRadius =
      options && options.radius ? options.radius : MIN_CAVE_RADIUS;
    var noiseScale = options && options.noiseScale ? options.noiseScale : 0.05;

    var airId = _getAirId();

    // Higher Y step for smaller caves (less thorough coverage)
    var yStep = 3;
    // Generate in upper underground layer: from mid-world down to minimum cave depth
    var startY = Math.floor(WORLD_HEIGHT * 0.5);
    var endY = 4;

    for (var y = startY; y >= endY; y -= yStep) {
      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          var worldX = chunkX * CHUNK_SIZE + x;
          var worldZ = chunkZ * CHUNK_SIZE + z;

          // Use different noise offset to avoid correlation with main caves
          var noiseValue = _fbmNoise(
            worldX * noiseScale + 1000,
            y * noiseScale * 0.7 + 500,
            worldZ * noiseScale + 1000,
            4
          );

          if (noiseValue < threshold) {
            var radius =
              baseRadius +
              _fbmNoise(worldX * 0.15, y * 0.15, worldZ * 0.15, 2) * 0.8;

            result.blocksModified += _carveCave(
              chunk,
              x,
              y,
              z,
              Math.max(1, radius),
              airId
            );
          }
        }
      }
    }

    result.smallCavesCarved = Math.floor(
      result.blocksModified / (Math.PI * baseRadius * baseRadius * 4)
    );

    return result;
  }

  // ============================================================
  // Pass 3: Cave Entrance Carving
  // ============================================================

  /**
   * Detect surface-adjacent caves and carve natural entrances.
   * Connects underground networks to the surface for realistic appearance.
   * @param {Donkeycraft.Chunk} chunk - The chunk to generate entrances in.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {number[]} heightmap - Heightmap array for surface detection.
   * @param {Object} [options] - Generation options.
   * @returns {Object} Generation stats: {entrancesCarved, blocksModified}.
   */
  function pass3EntranceCarving(chunk, chunkX, chunkZ, heightmap, options) {
    var result = { entrancesCarved: 0, blocksModified: 0 };

    if (!chunk || typeof chunk.setBlock !== 'function') return result;
    if (!heightmap || !Array.isArray(heightmap)) return result;

    var airId = _getAirId();
    var entranceChance =
      options && options.entranceChance ? options.entranceChance : 0.3;

    for (var x = 0; x < CHUNK_SIZE; x++) {
      for (var z = 0; z < CHUNK_SIZE; z++) {
        var surfaceY = heightmap[x + z * CHUNK_SIZE];
        if (surfaceY < 2 || surfaceY >= WORLD_HEIGHT - 2) continue;

        var worldX = chunkX * CHUNK_SIZE + x;
        var worldZ = chunkZ * CHUNK_SIZE + z;

        // Check for cave blocks near the surface (within 8 blocks below)
        var hasNearSurfaceCave = false;
        for (var dy = 1; dy <= 8 && surfaceY - dy >= 0; dy++) {
          if (chunk.getBlock(x, surfaceY - dy, z) === airId) {
            hasNearSurfaceCave = true;
            break;
          }
        }

        if (!hasNearSurfaceCave) continue;

        // Random chance to create an entrance at this location
        var hash = _hash3D(worldX, surfaceY, worldZ);
        if ((hash % 100) / 100 > entranceChance) continue;

        // Carve a natural entrance shaft from surface down to the cave
        var entranceRadius = 1.5 + (hash % 3) * 0.5;
        var shaftDepth = 3 + (hash % 4);

        for (var sy = surfaceY; sy >= surfaceY - shaftDepth && sy >= 0; sy--) {
          // Taper the entrance radius as we go deeper
          var taperFactor = 1 - (surfaceY - sy) / (shaftDepth + 1);
          var currentRadius = entranceRadius * taperFactor;

          result.blocksModified += _carveCave(
            chunk,
            x,
            Math.floor(sy),
            z,
            Math.max(1, currentRadius),
            airId
          );
        }

        result.entrancesCarved++;
      }
    }

    return result;
  }

  // ============================================================
  // Pass 4: Lava Caves
  // ============================================================

  /**
   * Generate deep caves below a threshold Y level with lava filling.
   * Creates dramatic underground lava lakes and glowing caverns.
   * Lava caves generate in the deep underground layer (Y=lavaYLevel to Y=5).
   * Lava floats on water at the water table, creating realistic lava pools.
   * Logs a warning if lava block ID cannot be resolved.
   * @param {Donkeycraft.Chunk} chunk - The chunk to generate lava caves in.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {Object} [options] - Generation options.
   * @param {number} [options.threshold] - Noise threshold for cave carving [-1, 1].
   * @param {number} [options.noiseScale] - Noise scale factor.
   * @param {number} [options.yLevel] - Y level for lava water table.
   * @returns {Object} Generation stats: {lavaCavesCarved, lavaBlocksPlaced}.
   */
  function pass4LavaCaves(chunk, chunkX, chunkZ, options) {
    var result = { lavaCavesCarved: 0, lavaBlocksPlaced: 0 };

    if (!chunk || typeof chunk.setBlock !== 'function') return result;

    var lavaThreshold =
      options && options.threshold !== undefined ? options.threshold : -0.2;
    var lavaNoiseScale =
      options && options.noiseScale ? options.noiseScale : 0.03;
    var lavaYLevel =
      options && options.yLevel !== undefined
        ? options.yLevel
        : LAVA_CAVE_Y_LEVEL;

    var lavaBlockId = _getLavaBlockId();
    if (!lavaBlockId) {
      // Log warning if lava block not resolved, but continue generating cave spaces
      // Lava caves will be generated as air-only passages without lava filling
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[CaveGenerator] Lava block not resolved — generating air caves only (Pass 4)'
        );
      }
    }

    // Generate lava caves in the deep underground layer.
    // startY: upper bound for lava cave generation (below main cave systems)
    // endY: lower bound (just above bedrock)
    var startY = Math.min(WORLD_HEIGHT - 30, lavaYLevel + 80); // Start above lava level
    var endY = Math.max(5, lavaYLevel - 5); // End just above bedrock

    for (var y = startY; y >= endY; y--) {
      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          var worldX = chunkX * CHUNK_SIZE + x;
          var worldZ = chunkZ * CHUNK_SIZE + z;

          // Get lava-specific noise (different seed offset for independence from other cave systems)
          var noiseValue = _fbmNoise(
            worldX * lavaNoiseScale + 5000,
            y * lavaNoiseScale * 0.6 + 3000,
            worldZ * lavaNoiseScale + 5000,
            3
          );

          // Carve cave space where noise is below threshold (more porous deep underground)
          if (noiseValue < lavaThreshold) {
            var radius =
              2 + _fbmNoise(worldX * 0.12, y * 0.12, worldZ * 0.12, 2) * 1;

            // First carve air to create cave space
            _carveCave(chunk, x, y, z, Math.max(1, radius), _getAirId());

            // Then fill with lava at or below the lava level (lava floats on water)
            if (y <= lavaYLevel + 2) {
              result.lavaBlocksPlaced += _fillCaveWithLava(
                chunk,
                x,
                y,
                z,
                Math.max(1, radius),
                lavaBlockId
              );
            }
          }
        }
      }
    }

    result.lavaCavesCarved = Math.floor(result.lavaBlocksPlaced / 8);

    return result;
  }

  // ============================================================
  // Pass 5: Decoration Caves
  // ============================================================

  /**
   * Generate special caves with glowstone/crystal formations.
   * Creates sparse, large caverns with embedded light sources for visually striking underground features.
   * Uses negative threshold (-0.3) to ensure only ~5-10% of space becomes decoration caves.
   * @param {Donkeycraft.Chunk} chunk - The chunk to generate decoration caves in.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {Object} [options] - Generation options.
   * @param {number} [options.threshold] - Noise threshold for cave carving (default: -0.3).
   * @param {number} [options.noiseScale] - Noise scale factor (default: 0.015).
   * @returns {Object} Generation stats: {decoCaves, glowstonePlaced}.
   */
  function pass5DecorationCaves(chunk, chunkX, chunkZ, options) {
    var result = { decoCaves: 0, glowstonePlaced: 0 };

    if (!chunk || typeof chunk.setBlock !== 'function') return result;

    // Use configured constants as defaults — negative threshold ensures sparse decoration caves
    var decoNoiseScale =
      options && options.noiseScale !== undefined
        ? options.noiseScale
        : NOISE_SCALE_DECO;
    var decoThreshold =
      options && options.threshold !== undefined
        ? options.threshold
        : CAVE_THRESHOLD_DECO;
    var glowstoneId = _getBlockId('glowstone');

    // Decoration caves are sparse, large caverns — wider Y stepping for efficiency
    var yStep = 5;
    var startY = WORLD_HEIGHT - 30;
    var endY = 15;

    for (var y = startY; y >= endY; y -= yStep) {
      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          var worldX = chunkX * CHUNK_SIZE + x;
          var worldZ = chunkZ * CHUNK_SIZE + z;

          var noiseValue = _fbmNoise(
            worldX * decoNoiseScale + 9000,
            y * decoNoiseScale * 0.5 + 7000,
            worldZ * decoNoiseScale + 9000,
            3
          );

          // Use negative threshold: only carve where noise is significantly below zero
          if (noiseValue < decoThreshold) {
            var radius = 2 + (Math.abs(_hash3D(worldX, y, worldZ)) % 4);

            // Carve small decorative cave
            _carveCave(chunk, x, y, z, radius, _getAirId());

            // Place glowstone crystals at cave edges
            if (glowstoneId) {
              var crystalCount =
                1 + (Math.abs(_hash3D(worldX + 1, y + 1, worldZ + 1)) % 3);
              result.glowstonePlaced += _placeCrystals(
                chunk,
                x,
                y,
                z,
                radius,
                glowstoneId,
                crystalCount
              );
            }

            result.decoCaves++;
          }
        }
      }
    }

    return result;
  }

  // ============================================================
  // Core Cave Carving Utilities
  // ============================================================

  /**
   * Carve a spherical cave at the given position.
   * Uses sphere distance algorithm for efficient voxel placement.
   * Allows multi-pass expansion by carving through existing air blocks,
   * enabling subsequent passes to connect and expand caves carved by earlier passes.
   * @param {Donkeycraft.Chunk} chunk - The chunk to carve in.
   * @param {number} cx - Center X.
   * @param {number} cy - Center Y.
   * @param {number} cz - Center Z.
   * @param {number} radius - Cave radius (must be >= 1).
   * @param {number} blockId - Block ID to place (usually 0 for air).
   * @returns {number} Number of blocks modified.
   * @private
   */
  function _carveCave(chunk, cx, cy, cz, radius, blockId) {
    // Validate parameters: radius must be >= 1, blockId can be 0 (air) or any valid block ID
    if (radius < 1 || blockId === null || blockId === undefined) return 0;

    // Clamp radius to prevent excessive carving
    var clampedRadius = Math.min(radius, MAX_CAVE_RADIUS * 2);

    var rSquared = radius * radius;
    var count = 0;
    var rInt = Math.ceil(radius);

    for (var dx = -rInt; dx <= rInt; dx++) {
      for (var dy = -rInt; dy <= rInt; dy++) {
        for (var dz = -rInt; dz <= rInt; dz++) {
          var distSquared = dx * dx + dy * dy + dz * dz;

          if (distSquared > rSquared) continue;

          // Apply smooth noise-based radius variation for natural cave shapes
          var worldX = cx + dx,
            worldY = cy + dy,
            worldZ = cz + dz;
          var shapeNoise = _fbmNoise(
            worldX * 0.2,
            worldY * 0.2,
            worldZ * 0.2,
            2
          );
          var effectiveRadius = clampedRadius + shapeNoise * 0.5;
          if (distSquared > effectiveRadius * effectiveRadius) continue;

          var bx = cx + dx;
          var by = cy + dy;
          var bz = cz + dz;

          // Check chunk bounds
          if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE)
            continue;
          if (by < 0 || by >= WORLD_HEIGHT) continue;

          // Carve: replace any non-air block with the target block (usually air).
          // This allows multi-pass caves to expand through previously carved areas,
          // creating connected tunnel networks instead of isolated pockets.
          var currentBlock = chunk.getBlock(bx, by, bz);
          if (currentBlock !== blockId) {
            chunk.setBlock(bx, by, bz, blockId);
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Fill a cave area with lava up to a certain level.
   * Creates hemispherical lava pools by iterating only the lower hemisphere
   * (at or below center Y) for realistic lava lakes that fill from the bottom up.
   * Lava floats on water, so it accumulates at the water table level.
   * @param {Donkeycraft.Chunk} chunk - The chunk.
   * @param {number} cx - Center X.
   * @param {number} cy - Center Y (lava lake surface level).
   * @param {number} cz - Center Z.
   * @param {number} radius - Cave radius.
   * @param {number} lavaBlockId - Lava block ID.
   * @returns {number} Number of lava blocks placed.
   * @private
   */
  function _fillCaveWithLava(chunk, cx, cy, cz, radius, lavaBlockId) {
    if (!lavaBlockId) return 0;

    var rSquared = radius * radius;
    var count = 0;
    var rInt = Math.ceil(radius);

    // Iterate only the lower hemisphere (dy from 0 to rInt) for efficiency.
    // This creates realistic lava lakes that fill from the bottom up to the surface level.
    for (var dx = -rInt; dx <= rInt; dx++) {
      for (var dy = 0; dy <= rInt; dy++) {
        for (var dz = -rInt; dz <= rInt; dz++) {
          var distSquared = dx * dx + dy * dy + dz * dz;

          if (distSquared > rSquared) continue;

          var bx = cx + dx;
          var by = cy - dy; // Subtract to go downward from surface level
          var bz = cz + dz;

          if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE)
            continue;
          if (by < 0) continue;

          var currentBlock = chunk.getBlock(bx, by, bz);
          // Fill air and water blocks with lava for realistic lava lake behavior
          if (currentBlock === 0 || currentBlock === _getWaterBlockId()) {
            chunk.setBlock(bx, by, bz, lavaBlockId);
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Place crystal formations on cave walls/ceilings.
   * Places glowstone crystals at random positions around the cave perimeter
   * to create visually striking underground formations.
   * @param {Donkeycraft.Chunk} chunk - The chunk.
   * @param {number} cx - Center X.
   * @param {number} cy - Center Y.
   * @param {number} cz - Center Z.
   * @param {number} radius - Cave radius.
   * @param {number} crystalBlockId - Crystal block ID (glowstone).
   * @param {number} count - Number of crystals to place.
   * @returns {number} Number of crystals placed.
   * @private
   */
  function _placeCrystals(chunk, cx, cy, cz, radius, crystalBlockId, count) {
    if (!crystalBlockId) return 0;

    var placed = 0;

    for (var i = 0; i < count; i++) {
      // Random position on cave surface
      var angle = (i / count) * Math.PI * 2;
      var crystalX = cx + Math.cos(angle) * Math.floor(radius * 0.7);
      var crystalZ = cz + Math.sin(angle) * Math.floor(radius * 0.7);
      var crystalY = cy + Math.floor(radius * 0.5);

      // Check bounds
      if (
        crystalX < 0 ||
        crystalX >= CHUNK_SIZE ||
        crystalZ < 0 ||
        crystalZ >= CHUNK_SIZE
      )
        continue;
      if (crystalY < 0 || crystalY >= WORLD_HEIGHT) continue;

      // Only place if current block is air (inside cave)
      if (chunk.getBlock(crystalX, crystalY, crystalZ) === 0) {
        chunk.setBlock(crystalX, crystalY, crystalZ, crystalBlockId);
        placed++;
      }
    }

    return placed;
  }

  // ============================================================
  // Block ID Resolution
  // ============================================================

  /**
   * Resolve a block ID by name from BlockRegistry.
   * @param {string} name - Block name.
   * @returns {number} Block ID, or 0 if not found.
   * @private
   */
  function _getBlockId(name) {
    if (!Donkeycraft.BlockRegistry) return 0;
    var block = Donkeycraft.BlockRegistry.getBlockByName(name);
    return block ? block.id : 0;
  }

  /**
   * Resolve the lava block ID from BlockRegistry.
   * @returns {number} Lava block ID, or 0 if not found.
   * @private
   */
  function _getLavaBlockId() {
    return _getBlockId('lava') || _getBlockId('lava_still') || 0;
  }

  /**
   * Resolve the water block ID from BlockRegistry or WaterGenerator.
   * Used by lava filling to avoid replacing water blocks unnecessarily.
   * @returns {number} Water block ID, or 0 if not found.
   * @private
   */
  function _getWaterBlockId() {
    // Try WaterGenerator first (already initialized)
    if (
      Donkeycraft.WaterGenerator &&
      typeof Donkeycraft.WaterGenerator.getWaterBlockId === 'function'
    ) {
      var waterId = Donkeycraft.WaterGenerator.getWaterBlockId();
      if (waterId > 0) return waterId;
    }
    // Resolve from BlockRegistry as fallback
    return (
      _getBlockId('water') ||
      _getBlockId('water_still') ||
      _getBlockId('flowing_water') ||
      0
    );
  }

  // ============================================================
  // Noise Functions (delegating to noise.js)
  // ============================================================

  /**
   * Fractal Brownian Motion for cave generation.
   * Delegates to Donkeycraft._gen._fbm when available.
   * @param {number} x - X coordinate.
   * @param {number} y - Y coordinate.
   * @param {number} z - Z coordinate.
   * @param {number} octaves - Number of octaves.
   * @returns {number} Normalized noise value [-1, 1].
   * @private
   */
  function _fbmNoise(x, y, z, octaves) {
    if (Donkeycraft._gen && typeof Donkeycraft._gen._fbm === 'function') {
      try {
        return Donkeycraft._gen._fbm(x, y, z, octaves || 3, 0.5, 2.0);
      } catch (e) {
        /* fallback below */
      }
    }
    // Simple fallback: single octave noise
    if (Donkeycraft._gen && typeof Donkeycraft._gen._noise2D === 'function') {
      return Donkeycraft._gen._noise2D(x, z);
    }
    return 0;
  }

  /**
   * 3D hash for deterministic random values.
   * Delegates to Donkeycraft._gen._hash3D when available.
   * @param {number} x - X coordinate.
   * @param {number} y - Y coordinate.
   * @param {number} z - Z coordinate.
   * @returns {number} Positive 32-bit integer.
   * @private
   */
  function _hash3D(x, y, z) {
    if (Donkeycraft._gen && typeof Donkeycraft._gen._hash3D === 'function') {
      return Donkeycraft._gen._hash3D(
        Math.floor(x),
        Math.floor(y),
        Math.floor(z)
      );
    }
    // Simple fallback hash
    var h = (x * 374761393 + y * 668265263 + z * 923496773) ^ 0x5bd1e995;
    h = ((h >>> 13) ^ h) * 0x5bd1e995;
    return (h ^ (h >>> 15)) >>> 0;
  }

  // ============================================================
  // Main Entry Point
  // ============================================================

  /**
   * Generate all cave passes for a chunk.
   * Runs all 5 passes in sequence and returns combined stats.
   * @param {Donkeycraft.Chunk} chunk - The chunk to generate caves in.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {number[]} [heightmap] - Optional heightmap for entrance carving (Pass 3).
   * @param {Object} [options] - Global generation options.
   * @returns {{pass1: Object, pass2: Object, pass3: Object, pass4: Object, pass5: Object, totalBlocksModified: number}}
   */
  function generateCaves(chunk, chunkX, chunkZ, heightmap, options) {
    var stats = {
      pass1: null,
      pass2: null,
      pass3: null,
      pass4: null,
      pass5: null,
      totalBlocksModified: 0,
    };

    if (!chunk || typeof chunk.setBlock !== 'function') return stats;

    // Pass 1: Main cave network
    stats.pass1 = pass1MainNetwork(chunk, chunkX, chunkZ, options);
    stats.totalBlocksModified += stats.pass1.blocksModified;

    // Pass 2: Small cave branches
    stats.pass2 = pass2SmallBranches(chunk, chunkX, chunkZ, options);
    stats.totalBlocksModified += stats.pass2.blocksModified;

    // Pass 3: Cave entrance carving (needs heightmap)
    stats.pass3 = pass3EntranceCarving(
      chunk,
      chunkX,
      chunkZ,
      heightmap,
      options
    );
    stats.totalBlocksModified += stats.pass3.blocksModified;

    // Pass 4: Lava caves
    stats.pass4 = pass4LavaCaves(chunk, chunkX, chunkZ, options);
    stats.totalBlocksModified += stats.pass4.lavaBlocksPlaced;

    // Pass 5: Decoration caves
    stats.pass5 = pass5DecorationCaves(chunk, chunkX, chunkZ, options);
    stats.totalBlocksModified += stats.pass5.glowstonePlaced;

    return stats;
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Donkeycraft.CaveGenerator — Multi-pass cave generation system.
   * 5-pass system: main network, small branches, entrance carving, lava caves, decoration caves.
   * Creates realistic underground networks with natural entrances and lava features.
   * @namespace
   */
  Donkeycraft.CaveGenerator = {
    // Main entry point
    generateCaves: generateCaves,

    // Individual passes (for debugging/selection)
    pass1MainNetwork: pass1MainNetwork,
    pass2SmallBranches: pass2SmallBranches,
    pass3EntranceCarving: pass3EntranceCarving,
    pass4LavaCaves: pass4LavaCaves,
    pass5DecorationCaves: pass5DecorationCaves,

    // Configuration constants (read-only reference for external consumers)
    CAVE_THRESHOLD_MAIN: CAVE_THRESHOLD_MAIN,
    CAVE_THRESHOLD_SMALL: CAVE_THRESHOLD_SMALL,
    LAVA_CAVE_Y_LEVEL: LAVA_CAVE_Y_LEVEL,
    MAX_CAVE_RADIUS: MAX_CAVE_RADIUS,
    MIN_CAVE_RADIUS: MIN_CAVE_RADIUS,
  };
})();
