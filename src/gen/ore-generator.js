// Donkeycraft — Realistic Ore Generator
// Geological ore placement with vein-based distribution, biome awareness, and Y-level ranges.
// Supports spheres (magmatic), layers (sedimentary), and pipes (hydrothermal) vein types.
//
// @module ore-generator
// @description Realistic ore vein placement system with geological distribution
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  if (!Donkeycraft) return;

  var CHUNK_SIZE = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
  var WORLD_HEIGHT = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

  // ============================================================
  // Ore Definitions
  // ============================================================

  /**
   * OreDefinition — defines an ore type's placement characteristics.
   * @param {string} name - Ore name.
   * @param {number} blockId - Block ID for this ore.
   * @param {number} minY - Minimum Y level for placement.
   * @param {number} maxY - Maximum Y level for placement.
   * @param {number} frequency - Number of veins per chunk.
   * @param {number} veinSize - Average size of each vein (radius).
   * @param {string} veinType - Vein type: 'sphere', 'layer', or 'pipe'.
   * @param {number} [weight] - Relative weight for occurrence frequency.
   * @param {number[]} [biomeIds] - Biome IDs where this ore appears (undefined = all).
   */
  function OreDefinition(
    name,
    blockId,
    minY,
    maxY,
    frequency,
    veinSize,
    veinType,
    weight,
    biomeIds
  ) {
    this.name = name;
    this.blockId = blockId;
    this.minY = minY;
    this.maxY = maxY;
    this.frequency = frequency;
    this.veinSize = veinSize;
    this.veinType = veinType;
    this.weight = weight || 1;
    this.biomeIds = biomeIds || null; // null = appears in all biomes
  }

  // ============================================================
  // Ore Registry
  // ============================================================

  /**
   * Create the default ore registry with all standard ores.
   * Ore names match BlockRegistry entries (typically *_ore suffix).
   * Each ore definition includes biome-specific placement rules:
   * - null biomeIds = appears in all biomes
   * - numeric array = restricted to specific biome IDs
   * @returns {OreDefinition[]} Array of ore definitions.
   */
  function getDefaultOres() {
    return [
      // Coal — sedimentary layers, broad distribution across all biomes
      new OreDefinition('coal_ore', null, 0, 160, 8, 3, 'layer'),

      // Iron — magmatic spheres, concentrated in mid-depths across all biomes
      new OreDefinition('iron_ore', null, 0, 120, 6, 2, 'sphere'),

      // Gold — hydrothermal pipes, deep concentration near lava levels
      new OreDefinition('gold_ore', null, 0, 40, 4, 2, 'pipe'),

      // Diamond — magmatic spheres, very deep only (Y<30) in all biomes
      new OreDefinition('diamond_ore', null, 0, 30, 2, 1.5, 'sphere'),

      // Redstone — concentrated near lava levels (Y<20), rare at higher elevations
      // Increased frequency at lower Y for dramatic cave lighting
      new OreDefinition('redstone_ore', null, 0, 20, 6, 1.5, 'sphere'),

      // Lapis — mid-depth concentration, moderate frequency in all biomes
      new OreDefinition('lapis_ore', null, 10, 60, 3, 2, 'sphere'),

      // Emerald — biome-specific: only in arctic/mountain biomes (ID 1)
      // Found at shallow-mid depths where tectonic activity exposes it
      new OreDefinition('emerald_ore', null, 20, 80, 1, 2, 'sphere', 1, [1]),

      // Copper — magmatic spheres, mid-range depth in all biomes
      new OreDefinition('copper_ore', null, 0, 100, 5, 2, 'sphere'),

      // Tin — hydrothermal pipes, deep concentration in all biomes
      new OreDefinition('tin_ore', null, 0, 50, 3, 2, 'pipe'),
    ];
  }

  // ============================================================
  // Ore Generator State
  // ============================================================

  var _ores = [];
  var _resolvedBlocks = {};

  /**
   * Initialize the ore generator — resolve block IDs from BlockRegistry.
   * Validates that all ore definitions have resolved block IDs.
   * Logs warnings for any unresolved ores.
   * @public
   */
  function init() {
    _ores = getDefaultOres();
    _resolveOreBlocks();

    // Validate that all ores have resolved block IDs
    var unresolvedOres = [];
    for (var i = 0; i < _ores.length; i++) {
      if (!_ores[i].blockId) {
        unresolvedOres.push(_ores[i].name);
      }
    }

    if (unresolvedOres.length > 0 && typeof console !== 'undefined') {
      console.warn(
        '[OreGenerator] The following ores have unresolved block IDs and will be skipped: ' +
          unresolvedOres.join(', ')
      );
    }
  }

  /**
   * Resolve ore block IDs from BlockRegistry.
   * Tries multiple naming variants (e.g., 'coal_ore', 'coal_block') for cross-compatibility.
   * Updates ore definitions with resolved IDs after resolution.
   * @private
   */
  function _resolveOreBlocks() {
    if (!Donkeycraft.BlockRegistry) return;

    // Define primary names and fallback variants for each ore type
    var oreVariants = [
      { key: 'coal_ore', variants: ['coal_ore', 'coal'] },
      { key: 'iron_ore', variants: ['iron_ore', 'iron'] },
      { key: 'gold_ore', variants: ['gold_ore', 'gold'] },
      { key: 'diamond_ore', variants: ['diamond_ore', 'diamond'] },
      { key: 'redstone_ore', variants: ['redstone_ore', 'redstone'] },
      { key: 'lapis_ore', variants: ['lapis_ore', 'lapis'] },
      { key: 'emerald_ore', variants: ['emerald_ore', 'emerald'] },
      { key: 'copper_ore', variants: ['copper_ore', 'copper'] },
      { key: 'tin_ore', variants: ['tin_ore', 'tin'] },
    ];

    for (var i = 0; i < oreVariants.length; i++) {
      var entry = oreVariants[i];
      for (var j = 0; j < entry.variants.length; j++) {
        var block = Donkeycraft.BlockRegistry.getBlockByName(entry.variants[j]);
        if (block && block.id) {
          _resolvedBlocks[entry.key] = block.id;
          break;
        }
      }
    }

    // Update ore definitions with resolved IDs
    for (var k = 0; k < _ores.length; k++) {
      var ore = _ores[k];
      if (_resolvedBlocks[ore.name]) {
        ore.blockId = _resolvedBlocks[ore.name];
      }
    }
  }

  /**
   * Get the block ID for an ore by name.
   * @param {string} oreName - Ore name.
   * @returns {number} Block ID, or 0 if not found.
   */
  function getOreBlockId(oreName) {
    return _resolvedBlocks[oreName] || 0;
  }

  // ============================================================
  // Vein Placement Algorithms
  // ============================================================

  /**
   * Generate ore veins for a chunk.
   * Places all applicable ores based on biome, Y-level, and frequency.
   * @param {Donkeycraft.Chunk} chunk - The chunk to generate ores in.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {number} biomeId - Biome ID for this chunk.
   * @returns {{oresPlaced: number, veinsCreated: number}} Generation stats.
   */
  function generateOres(chunk, chunkX, chunkZ, biomeId) {
    var stats = { oresPlaced: 0, veinsCreated: 0 };

    if (!chunk || typeof chunk.setBlock !== 'function') return stats;

    // Resolve stone block ID for validation
    var stoneId = _getBlockId('stone');

    for (var i = 0; i < _ores.length; i++) {
      var ore = _ores[i];

      // Skip if block ID not resolved
      if (!ore.blockId) continue;

      // Skip if biome-restricted and this chunk's biome doesn't match
      if (ore.biomeIds && ore.biomeIds.length > 0) {
        var biomeMatch = false;
        for (var b = 0; b < ore.biomeIds.length; b++) {
          if (ore.biomeIds[b] === biomeId) {
            biomeMatch = true;
            break;
          }
        }
        if (!biomeMatch) continue;
      }

      // Place veins for this ore
      var oreStats = _placeOreVeins(chunk, chunkX, chunkZ, ore, stoneId);
      stats.oresPlaced += oreStats.oresPlaced;
      stats.veinsCreated += oreStats.veinsCreated;
    }

    return stats;
  }

  /**
   * Place veins for a single ore type in a chunk.
   * Uses noise-based density falloff within veins for natural-looking distribution.
   * Validates that ore is placed inside solid rock or replaces other ores for natural layering.
   * @param {Donkeycraft.Chunk} chunk - The chunk.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {OreDefinition} ore - Ore definition.
   * @param {number} stoneId - Stone block ID for validation.
   * @returns {{oresPlaced: number, veinsCreated: number}}
   * @private
   */
  function _placeOreVeins(chunk, chunkX, chunkZ, ore, stoneId) {
    var stats = { oresPlaced: 0, veinsCreated: 0 };

    var rngState = _getRngState(chunkX, chunkZ, ore.name);

    for (var v = 0; v < ore.frequency; v++) {
      // Random position within chunk with slight offset from edges for better vein placement
      var ox = _nextRange(rngState, 2, CHUNK_SIZE - 3);
      var oz = _nextRange(rngState, 2, CHUNK_SIZE - 3);

      // Random Y level within ore's defined range
      var minY = Math.max(0, ore.minY);
      var maxY = Math.min(WORLD_HEIGHT - 1, ore.maxY);
      var oy = _nextRange(rngState, minY, maxY);

      // Place vein based on type (sphere, layer, or pipe)
      switch (ore.veinType) {
        case 'sphere':
          stats.oresPlaced += _placeSphereVein(
            chunk,
            ox,
            oy,
            oz,
            ore.veinSize,
            ore.blockId,
            stoneId
          );
          break;
        case 'layer':
          stats.oresPlaced += _placeLayerVein(
            chunk,
            ox,
            oy,
            oz,
            ore.veinSize,
            ore.blockId,
            stoneId
          );
          break;
        case 'pipe':
          stats.oresPlaced += _placePipeVein(
            chunk,
            ox,
            oy,
            oz,
            ore.veinSize,
            ore.blockId,
            stoneId
          );
          break;
        default:
          stats.oresPlaced += _placeSphereVein(
            chunk,
            ox,
            oy,
            oz,
            ore.veinSize,
            ore.blockId,
            stoneId
          );
      }

      stats.veinsCreated++;
    }

    return stats;
  }

  /**
   * Place a spherical (magmatic) ore vein.
   * Creates natural-looking ore deposits with noise-based density falloff at vein edges.
   * Validates that ore is placed inside solid rock or replaces other ores for natural geological layering.
   * @param {Donkeycraft.Chunk} chunk - The chunk.
   * @param {number} cx - Center X.
   * @param {number} cy - Center Y.
   * @param {number} cz - Center Z.
   * @param {number} radius - Vein radius.
   * @param {number} oreBlockId - Ore block ID.
   * @param {number} stoneId - Stone block ID for validation.
   * @returns {number} Number of ore blocks placed.
   * @private
   */
  function _placeSphereVein(chunk, cx, cy, cz, radius, oreBlockId, stoneId) {
    if (!oreBlockId) return 0;

    var rSquared = radius * radius;
    var rInt = Math.ceil(radius);
    var placed = 0;

    for (var dx = -rInt; dx <= rInt; dx++) {
      for (var dy = -rInt; dy <= rInt; dy++) {
        for (var dz = -rInt; dz <= rInt; dz++) {
          var distSquared = dx * dx + dy * dy + dz * dz;

          if (distSquared > rSquared) continue;

          // Noise-based density falloff for natural vein edges.
          // Threshold of -0.6 skips ~25% of edge positions for realistic ore vein distribution.
          var noiseVal = _fbmNoise(
            (cx + dx) * 0.15,
            (cy + dy) * 0.15,
            (cz + dz) * 0.15,
            2
          );
          // Skip blocks near vein edges for natural distribution
          if (noiseVal < -0.6) continue;

          var bx = cx + dx;
          var by = cy + dy;
          var bz = cz + dz;

          // Check chunk bounds
          if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE)
            continue;
          if (by < 0 || by >= WORLD_HEIGHT) continue;

          // Validate: ore must be placed inside solid rock or replace other ores/stone variants
          // This allows natural geological layering where newer veins replace older ones
          var currentBlock = chunk.getBlock(bx, by, bz);
          if (currentBlock === stoneId || currentBlock === oreBlockId) {
            chunk.setBlock(bx, by, bz, oreBlockId);
            placed++;
          } else if (
            Donkeycraft.BlockRegistry &&
            Donkeycraft.BlockRegistry.isSolid(currentBlock)
          ) {
            // Also allow replacement of any solid block for natural ore distribution
            // This prevents ores from floating in air and ensures they're embedded in rock
            chunk.setBlock(bx, by, bz, oreBlockId);
            placed++;
          }
        }
      }
    }

    return placed;
  }

  /**
   * Place a layered (sedimentary) ore vein.
   * Creates flat, horizontal deposits typical of sedimentary ores like coal.
   * Uses noise-based density falloff for natural vein edges.
   * Validates placement in solid rock or replaces existing ores for natural layering.
   * @param {Donkeycraft.Chunk} chunk - The chunk.
   * @param {number} cx - Center X.
   * @param {number} cy - Center Y.
   * @param {number} cz - Center Z.
   * @param {number} radius - Vein radius (XZ width).
   * @param {number} oreBlockId - Ore block ID.
   * @param {number} stoneId - Stone block ID for validation.
   * @returns {number} Number of ore blocks placed.
   * @private
   */
  function _placeLayerVein(chunk, cx, cy, cz, radius, oreBlockId, stoneId) {
    if (!oreBlockId) return 0;

    var layerHeight = Math.max(1, Math.floor(radius / 2));
    var rInt = Math.ceil(radius);
    var placed = 0;

    for (var dy = -layerHeight; dy <= layerHeight; dy++) {
      for (var dx = -rInt; dx <= rInt; dx++) {
        for (var dz = -rInt; dz <= rInt; dz++) {
          // Elliptical shape: wider in XZ, thinner in Y
          var normalizedDist =
            (dx * dx) / (radius * radius) +
            (dy * dy) / (layerHeight * layerHeight);
          if (normalizedDist > 1) continue;

          // Noise-based density falloff for natural vein edges
          var noiseVal = _fbmNoise(
            (cx + dx) * 0.12,
            (cy + dy) * 0.3,
            (cz + dz) * 0.12,
            2
          );
          if (noiseVal < -0.1) continue;

          var bx = cx + dx;
          var by = cy + dy;
          var bz = cz + dz;

          // Check bounds
          if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE)
            continue;
          if (by < 0 || by >= WORLD_HEIGHT) continue;

          // Validate: ore must be placed inside solid rock or replace other ores
          var currentBlock = chunk.getBlock(bx, by, bz);
          if (currentBlock === stoneId || currentBlock === oreBlockId) {
            chunk.setBlock(bx, by, bz, oreBlockId);
            placed++;
          } else if (
            Donkeycraft.BlockRegistry &&
            Donkeycraft.BlockRegistry.isSolid(currentBlock)
          ) {
            chunk.setBlock(bx, by, bz, oreBlockId);
            placed++;
          }
        }
      }
    }

    return placed;
  }

  /**
   * Place a vertical pipe (hydrothermal) ore vein.
   * Creates tube-like deposits typical of hydrothermal vents, e.g., gold veins.
   * Pipes taper at top and bottom for natural appearance.
   * Validates placement in solid rock or replaces existing ores for natural layering.
   * @param {Donkeycraft.Chunk} chunk - The chunk.
   * @param {number} cx - Center X.
   * @param {number} cy - Center Y (bottom of pipe).
   * @param {number} cz - Center Z.
   * @param {number} radius - Pipe radius.
   * @param {number} oreBlockId - Ore block ID.
   * @param {number} stoneId - Stone block ID for validation.
   * @returns {number} Number of ore blocks placed.
   * @private
   */
  function _placePipeVein(chunk, cx, cy, cz, radius, oreBlockId, stoneId) {
    if (!oreBlockId) return 0;

    var pipeHeight = Math.max(4, radius * 4); // Tall vertical structure
    var placed = 0;

    for (var y = 0; y < pipeHeight; y++) {
      var currentY = cy + y;
      if (currentY < 0 || currentY >= WORLD_HEIGHT) continue;

      // Taper radius at top and bottom for natural pipe shape
      var taperFactor = 1 - Math.abs(y - pipeHeight / 2) / (pipeHeight / 2);
      var currentRadius = radius * (0.5 + taperFactor * 0.5);
      var rInt = Math.ceil(currentRadius);

      for (var dx = -rInt; dx <= rInt; dx++) {
        for (var dz = -rInt; dz <= rInt; dz++) {
          if (dx * dx + dz * dz > currentRadius * currentRadius) continue;

          var bx = cx + dx;
          var bz = cz + dz;

          if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE)
            continue;

          // Validate: ore must be placed inside solid rock or replace other ores
          var currentBlock = chunk.getBlock(bx, currentY, bz);
          if (currentBlock === stoneId || currentBlock === oreBlockId) {
            chunk.setBlock(bx, currentY, bz, oreBlockId);
            placed++;
          } else if (
            Donkeycraft.BlockRegistry &&
            Donkeycraft.BlockRegistry.isSolid(currentBlock)
          ) {
            chunk.setBlock(bx, currentY, bz, oreBlockId);
            placed++;
          }
        }
      }
    }

    return placed;
  }

  // ============================================================
  // PRNG Utilities (Mulberry32 with namespace isolation)
  // ============================================================

  /**
   * PRNG state container for ore placement — uses a mutable object
   * so that each call to `_nextRange` properly advances the state.
   * @typedef {Object} OreRngState
   * @property {number} val - Current Mulberry32 state value (unsigned 32-bit).
   */

  /**
   * Get a deterministic RNG state for ore placement.
   * Combines chunk coordinates and ore name for unique seeding.
   * Returns a mutable state object so successive _nextRange calls produce different values.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @param {string} oreName - Ore name.
   * @returns {OreRngState} Mutable PRNG state object.
   */
  function _getRngState(chunkX, chunkZ, oreName) {
    var hash = 0;
    for (var i = 0; i < oreName.length; i++) {
      hash = (hash << 5) - hash + oreName.charCodeAt(i);
      hash |= 0;
    }
    hash += chunkX * 374761393 + chunkZ * 668265263;
    hash |= 0;
    return { val: hash >>> 0 };
  }

  /**
   * Generate next pseudo-random integer in range [min, max].
   * Uses Mulberry32 algorithm and mutates the state object so each call advances.
   * @param {OreRngState} rng - Mutable PRNG state object with a `val` property.
   * @param {number} min - Minimum value.
   * @param {number} max - Maximum value.
   * @returns {number} Random integer in [min, max].
   */
  function _nextRange(rng, min, max) {
    var x = rng.val | 0;
    x = (x ^ (x >>> 16)) & 0xffffffff;
    x = ((x * 0x45d9f3b) & 0xffffffff) | 0;
    x = (x ^ (x >>> 16)) & 0xffffffff;
    x = ((x * 0x45d9f3b) & 0xffffffff) | 0;
    x = (x + 1) & 0xffffffff;
    rng.val = x >>> 0;

    return min + (rng.val % (max - min + 1));
  }

  // ============================================================
  // Noise Functions (delegating to noise.js)
  // ============================================================

  /**
   * Fractal Brownian Motion for ore density falloff.
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
        /* fallback below */
      }
    }
    if (Donkeycraft._gen && typeof Donkeycraft._gen._noise2D === 'function') {
      return Donkeycraft._gen._noise2D(x, z);
    }
    return 0;
  }

  // ============================================================
  // Block ID Resolution
  // ============================================================

  /**
   * Resolve a block ID by name from BlockRegistry.
   * @param {string} name - Block name.
   * @returns {number} Block ID, or 0 if not found.
   */
  function _getBlockId(name) {
    if (!Donkeycraft.BlockRegistry) return 0;
    var block = Donkeycraft.BlockRegistry.getBlockByName(name);
    return block ? block.id : 0;
  }

  // ============================================================
  // Backward Compatibility Aliases
  // ============================================================

  /**
   * Alias for generateOres — provides backward compatibility with legacy code that calls placeOres.
   * Legacy signature: placeOres(chunk, biomeId) — resolves chunk coordinates from chunk.chunkX/chunk.chunkZ
   * @param {Donkeycraft.Chunk} chunk - The chunk.
   * @param {number} biomeId - Biome ID.
   * @returns {{oresPlaced: number, veinsCreated: number}}
   */
  function placeOres(chunk, biomeId) {
    return generateOres(chunk, chunk.chunkX || 0, chunk.chunkZ || 0, biomeId);
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Donkeycraft.OreGenerator — Realistic ore vein placement system.
   * Supports sphere (magmatic), layer (sedimentary), and pipe (hydrothermal) vein types
   * with biome-aware placement and Y-level ranges.
   * @namespace
   */
  Donkeycraft.OreGenerator = {
    // Main entry point
    generateOres: generateOres,

    // Backward compatibility alias
    placeOres: placeOres,

    // Initialization / lifecycle
    init: init,

    // Block ID resolution
    getOreBlockId: getOreBlockId,

    // Configuration access (read-only reference for external consumers)
    getOres: function () {
      return _ores;
    },
    setOres: function (newOres) {
      _ores = newOres;
      _resolveOreBlocks();
    },

    // Constants (read-only reference for external consumers)
    getDefaultOres: getDefaultOres,
  };
})();
