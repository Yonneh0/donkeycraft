// Donkeycraft — Nether Terrain Generator
// Nether terrain: bedrock ceiling/floor, lava seas, netherrack, unique structures.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

  // Ore vein configuration constants
  var _oreVeinConfig = {
    quartz: {
      veinsPerChunk: 20,
      veinSize: 8,
      minY: 5,
      maxY: WORLD_HEIGHT - 5,
      rarity: 0.15,
    },
    gold: {
      veinsPerChunk: 16,
      veinSize: 7,
      minY: 5,
      maxY: WORLD_HEIGHT - 5,
      rarity: 0.1,
    },
    gilded: {
      veinsPerChunk: 12,
      veinSize: 6,
      minY: 5,
      maxY: WORLD_HEIGHT - 5,
      rarity: 0.08,
    },
    magma: {
      veinsPerChunk: 8,
      veinSize: 5,
      minY: 5,
      maxY: WORLD_HEIGHT - 5,
      rarity: 0.05,
    },
    ancientDebris: {
      veinsPerChunk: 1,
      veinSize: 4,
      minY: 8,
      maxY: 22,
      rarity: 0.01,
    },
  };

  // ============================================================
  // NetherGenerator
  // ============================================================

  /**
   * NetherGenerator — generates terrain for the Nether dimension.
   */
  Donkeycraft.NetherGenerator = (function () {
    var _chunkManager = null;
    var _bedrockId = 0;
    var _netherrackId = 0;
    var _soulSandId = 0;
    var _basaltId = 0;
    var _blackstoneId = 0;
    var _lavaId = 0;
    var _quartzOreId = 0;
    var _netherGoldOreId = 0;
    var _gildedBlackstoneId = 0;
    var _magmaBlockId = 0;
    var _ancientDebrisId = 0;

    /**
     * Resolve nether block IDs from BlockRegistry.
     * @private
     */
    function _resolveNetherBlockIds() {
      if (!Donkeycraft.BlockRegistry) return;

      // Bedrock (try nether_bedrock first, fall back to bedrock)
      var br =
        Donkeycraft.BlockRegistry.getBlockByName('nether_bedrock') ||
        Donkeycraft.BlockRegistry.getBlockByName('bedrock');
      if (br) _bedrockId = br.id;

      // Netherrack
      var nr = Donkeycraft.BlockRegistry.getBlockByName('netherrack');
      if (nr) _netherrackId = nr.id;

      // Soul Sand
      var ss = Donkeycraft.BlockRegistry.getBlockByName('soul_sand');
      if (ss) _soulSandId = ss.id;

      // Basalt
      var ba = Donkeycraft.BlockRegistry.getBlockByName('basalt');
      if (ba) _basaltId = ba.id;

      // Blackstone
      var bl = Donkeycraft.BlockRegistry.getBlockByName('blackstone');
      if (bl) _blackstoneId = bl.id;

      // Lava
      var la =
        Donkeycraft.BlockRegistry.getBlockByName('lava') ||
        Donkeycraft.BlockRegistry.getBlockByName('lava_still');
      if (la) _lavaId = la.id;

      // Nether Quartz Ore
      var qo = Donkeycraft.BlockRegistry.getBlockByName('nether_quartz_ore');
      if (qo) _quartzOreId = qo.id;

      // Nether Gold Ore
      var ngo = Donkeycraft.BlockRegistry.getBlockByName('nether_gold_ore');
      if (ngo) _netherGoldOreId = ngo.id;

      // Gilded Blackstone
      var gb = Donkeycraft.BlockRegistry.getBlockByName('gilded_blackstone');
      if (gb) _gildedBlackstoneId = gb.id;

      // Magma Block
      var mg = Donkeycraft.BlockRegistry.getBlockByName('magma');
      if (mg) _magmaBlockId = mg.id;

      // Ancient Debris
      var ad = Donkeycraft.BlockRegistry.getBlockByName('ancient_debris');
      if (ad) _ancientDebrisId = ad.id;
    }

    /**
     * Set the chunk manager reference for terrain generation.
     * @param {Donkeycraft.ChunkManager} chunkManager - The ChunkManager.
     */
    function setChunkManager(chunkManager) {
      _chunkManager = chunkManager;
    }

    /**
     * Generate full nether terrain for a chunk.
     * Accepts either (chunk, chunkX, chunkZ) when called from ChunkManager
     * or (chunkX, chunkZ) when called directly with _chunkManager set.
     * Resolves block IDs from BlockRegistry on first call.
     * @param {Donkeycraft.Chunk|number} chunkOrX - Chunk object or chunk X coordinate.
     * @param {number} [chunkZ] - Chunk Z coordinate (when using new signature) or chunk X (legacy).
     * @param {number} [optChunkZ] - Chunk Z coordinate (legacy unused param).
     */
    function generateNetherTerrain(chunkOrX, chunkZ, optChunkZ) {
      // Resolve block IDs on first call
      if (
        !_bedrockId &&
        !Donkeycraft.BlockRegistry.getBlockByName('nether_bedrock')
      ) {
        _resolveNetherBlockIds();
      }

      var chunk;
      var cx, cz;

      // Detect calling convention: if first arg is a Chunk object, use new signature
      if (chunkOrX && typeof chunkOrX.getBlock === 'function') {
        chunk = chunkOrX;
        cx = chunk.chunkX;
        cz = chunkZ;
      } else {
        // Legacy signature: (chunkX, chunkZ) with _chunkManager
        cx = chunkOrX;
        cz = chunkZ;
        if (!_chunkManager) return;
        chunk = _chunkManager.getChunk(cx, cz);
        if (!chunk) return;
      }

      // Clear existing data
      chunk.blocks.fill(0);
      chunk.clearLight();

      // Generate terrain layers
      _generateBedrockFloor(chunk);
      _generateBedrockCeiling(chunk);
      _fillNetherrack(chunk);
      _generateLavaSeas(chunk);
      _generateNetherFeatures(chunk, cx, cz);
      _generateOreVeins(chunk, cx, cz);

      // Mark as generated and dirty
      chunk.generated = true;
      chunk.markDirty();
    }

    /**
     * Generate bedrock floor layers (Y=0 to Y=4).
     * Thickness is 3-5 blocks based on noise variation.
     * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
     * @private
     */
    function _generateBedrockFloor(chunk) {
      if (!chunk || !chunk.setBlock || !_bedrockId) return;

      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          // noise2D returns [-1, 1]; map to [0, 1] then scale to 3-5
          var n = (Donkeycraft.PerlinNoise.noise2D(x * 0.1, z * 0.1) + 1) * 0.5;
          var thickness = Math.floor(n * 3) + 3; // 3 to 5

          for (var y = 0; y < thickness && y < WORLD_HEIGHT; y++) {
            chunk.setBlock(x, y, z, _bedrockId);
          }
        }
      }
    }

    /**
     * Generate bedrock ceiling layers (top 3-5 blocks).
     * Uses noise-based thickness variation for natural-looking ceiling.
     * Validates all Y coordinates are within world bounds before writing.
     * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
     * @private
     */
    function _generateBedrockCeiling(chunk) {
      if (!chunk || !chunk.setBlock || !_bedrockId) return;

      var maxCeilingY = WORLD_HEIGHT - 1;
      if (maxCeilingY < 0) return; // World too small for ceiling

      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          var n =
            (Donkeycraft.PerlinNoise.noise2D(x * 0.15 + 100, z * 0.15 + 100) +
              1) *
            0.5;
          var thickness = Math.floor(n * 3) + 3; // 3 to 5

          for (var y = 0; y < thickness; y++) {
            var ceilingY = maxCeilingY - y;
            // Only write if Y is within valid world bounds
            if (ceilingY < 0) break;
            chunk.setBlock(x, ceilingY, z, _bedrockId);
          }
        }
      }
    }

    /**
     * Fill the main chunk body with netherrack, leaving space for bedrock floor/ceiling.
     * Skips areas already occupied by bedrock to avoid redundant writes.
     * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
     * @private
     */
    function _fillNetherrack(chunk) {
      if (!chunk || !chunk.setBlock || !_netherrackId) return;

      // Floor bedrock occupies Y=0..~5, ceiling bedrock occupies Y=~WORLD_HEIGHT-5..end.
      // Fill netherrack in between, avoiding areas already occupied by bedrock.
      var startY = 6;
      var endY = WORLD_HEIGHT - 6;

      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var y = startY; y < endY && y >= 0 && y < WORLD_HEIGHT; y++) {
          for (var z = 0; z < CHUNK_SIZE; z++) {
            chunk.setBlock(x, y, z, _netherrackId);
          }
        }
      }
    }

    /**
     * Generate lava seas with fbm noise-based surface variation.
     * Creates organic lava pools using fractal Brownian motion for natural undulation.
     * The lava surface height varies per-tile based on noise, creating varied pool shapes
     * instead of flat uniform layers. Base sea level is Y=31.
     * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
     * @private
     */
    function _generateLavaSeas(chunk) {
      if (!chunk || !chunk.setBlock || !_lavaId) return;

      var baseLavaY = 31;

      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          var worldX = chunk.chunkX * CHUNK_SIZE + x;
          var worldZ = chunk.chunkZ * CHUNK_SIZE + z;

          // Use fbm noise for organic lava surface variation.
          // The noise value determines the local lava surface height offset (-2 to +2 from base).
          var lavaSurfaceNoise = Donkeycraft.PerlinNoise.fbm(
            worldX * 0.025,
            0,
            worldZ * 0.025,
            3,
            0.5,
            2.0
          );

          // Map noise to height offset: fbm returns [-1, 1], clamp to [-2, +2]
          var heightOffset = Math.max(
            -2,
            Math.min(2, Math.floor(lavaSurfaceNoise * 2.5))
          );
          var localLavaY = baseLavaY + heightOffset;

          // Place lava column from a minimum level up to the local surface
          var minLavaY = baseLavaY - 1;
          for (
            var y = minLavaY;
            y <= localLavaY && y >= 0 && y < WORLD_HEIGHT;
            y++
          ) {
            chunk.setBlock(x, y, z, _lavaId);
          }

          // Add one extra block above surface for pooling effect (only where noise peaks)
          if (
            lavaSurfaceNoise > 0.4 &&
            localLavaY + 1 >= 0 &&
            localLavaY + 1 < WORLD_HEIGHT
          ) {
            chunk.setBlock(x, localLavaY + 1, z, _lavaId);
          }
        }
      }
    }

    /**
     * Generate nether features: soul sand layers, basalt columns, blackstone clusters.
     * Uses noise-based detection to determine feature placement regions.
     * Only replaces netherrack blocks to avoid overwriting other terrain types.
     * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
     * @param {number} chunkX - Chunk X coordinate (for noise seeding).
     * @param {number} chunkZ - Chunk Z coordinate (for noise seeding).
     * @private
     */
    function _generateNetherFeatures(chunk, chunkX, chunkZ) {
      if (!chunk || !chunk.setBlock || !_netherrackId) return;

      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          var worldX = chunkX * CHUNK_SIZE + x;
          var worldZ = chunkZ * CHUNK_SIZE + z;

          // Soul sand layers — flat patches near Y=20-40
          if (_soulSandId) {
            var soulSandNoise = Donkeycraft.PerlinNoise.fbm(
              worldX * 0.03,
              0,
              worldZ * 0.03,
              3,
              0.5,
              2.0
            );
            if (soulSandNoise > 0.4) {
              for (var y = 18; y <= 42 && y < WORLD_HEIGHT; y++) {
                if (y < 0) continue;
                var block = chunk.getBlock(x, y, z);
                if (block === _netherrackId) {
                  chunk.setBlock(x, y, z, _soulSandId);
                }
              }
            }
          }

          // Basalt columns — tall vertical structures near Y=40-70
          if (_basaltId) {
            var basaltNoise = Donkeycraft.PerlinNoise.fbm(
              worldX * 0.02 + 50,
              0,
              worldZ * 0.02 + 50,
              2,
              0.6,
              2.0
            );
            if (basaltNoise > 0.5) {
              for (var y2 = 40; y2 <= 70 && y2 < WORLD_HEIGHT; y2++) {
                if (y2 < 0) continue;
                var bBlock = chunk.getBlock(x, y2, z);
                if (bBlock === _netherrackId) {
                  chunk.setBlock(x, y2, z, _basaltId);
                }
              }
            }
          }

          // Blackstone clusters — small random aggregations near Y=50
          if (_blackstoneId) {
            var blackstoneNoise = Donkeycraft.PerlinNoise.noise2D(
              worldX * 0.08 + 200,
              worldZ * 0.08 + 200
            );
            if (blackstoneNoise > 0.6) {
              var clusterSize = 2 + Math.floor(Math.random() * 3);
              var halfCluster = Math.floor(clusterSize / 2);
              for (var cdx = 0; cdx < clusterSize; cdx++) {
                for (var cdy = 0; cdy < clusterSize; cdy++) {
                  for (var cdz = 0; cdz < clusterSize; cdz++) {
                    var nbx = x + cdx - halfCluster;
                    var nby = 50 + cdy - halfCluster;
                    var nbz = z + cdz - halfCluster;
                    if (
                      nbx >= 0 &&
                      nbx < CHUNK_SIZE &&
                      nby >= 0 &&
                      nby < WORLD_HEIGHT &&
                      nbz >= 0 &&
                      nbz < CHUNK_SIZE
                    ) {
                      if (chunk.getBlock(nbx, nby, nbz) === _netherrackId) {
                        chunk.setBlock(nbx, nby, nbz, _blackstoneId);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    /**
     * Generate ore veins in the nether using vein-based placement.
     * Places discrete vein clusters instead of iterating every block in the chunk volume.
     * This reduces complexity from O(CHUNK_SIZE × WORLD_HEIGHT × CHUNK_SIZE) to O(veinsPerChunk × veinSize).
     * Each ore type has its own vein count, size, and Y-range configuration.
     * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
     * @param {number} chunkX - Chunk X coordinate (for noise seeding).
     * @param {number} chunkZ - Chunk Z coordinate (for noise seeding).
     * @private
     */
    function _generateOreVeins(chunk, chunkX, chunkZ) {
      if (!chunk || !chunk.setBlock || !_netherrackId) return;

      var worldSeed = Donkeycraft.Config ? Donkeycraft.Config.SEED || 42 : 42;
      var chunkSeed = Donkeycraft._gen._hash2D(chunkX, chunkZ);

      // Define ore vein configurations with their properties
      var oreTypes = [
        { id: _quartzOreId, config: _oreVeinConfig.quartz, noiseOffset: 300 },
        { id: _netherGoldOreId, config: _oreVeinConfig.gold, noiseOffset: 400 },
        {
          id: _gildedBlackstoneId,
          config: _oreVeinConfig.gilded,
          noiseOffset: 500,
        },
        { id: _magmaBlockId, config: _oreVeinConfig.magma, noiseOffset: 600 },
        {
          id: _ancientDebrisId,
          config: _oreVeinConfig.ancientDebris,
          noiseOffset: 700,
        },
      ];

      for (var o = 0; o < oreTypes.length; o++) {
        var oreType = oreTypes[o];
        if (!oreType.id) continue; // Block ID not resolved

        var config = oreType.config;
        var veinSeed = chunkSeed + o * 997;

        // Generate veins for this ore type
        for (var v = 0; v < config.veinsPerChunk; v++) {
          // Deterministic vein position within chunk
          var veinHash = Donkeycraft._gen._hash2D(veinSeed + v * 53, v * 71);
          var veinX = veinHash % CHUNK_SIZE;
          var veinZ =
            (((veinHash >> 8) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

          // Deterministic Y level within configured range.
          // Uses proper modular arithmetic to map hash value into [minY, maxY].
          var yHash = Donkeycraft._gen._hash2D(veinSeed + v * 137, v * 211);
          var veinYRange = config.maxY - config.minY;
          var relativeY = yHash % veinYRange;
          if (relativeY < 0) relativeY += veinYRange;
          var veinY = config.minY + relativeY;

          // Place ore vein as a small cluster
          _placeOreVein(
            chunk,
            veinX,
            veinY,
            veinZ,
            config.veinSize,
            oreType.id,
            config.rarity
          );
        }
      }
    }

    /**
     * Place a single ore vein cluster at the given position.
     * Creates a small irregular blob of ore blocks within the chunk.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} cx - Center X.
     * @param {number} cy - Center Y.
     * @param {number} cz - Center Z.
     * @param {number} size - Maximum radius of the vein.
     * @param {number} oreId - Ore block ID to place.
     * @param {number} rarity - Probability (0-1) for each pixel to become ore.
     * @private
     */
    function _placeOreVein(chunk, cx, cy, cz, size, oreId, rarity) {
      var r = Math.ceil(size);

      for (var dx = -r; dx <= r; dx++) {
        for (var dy = -r; dy <= r; dy++) {
          for (var dz = -r; dz <= r; dz++) {
            var distSq = dx * dx + dy * dy + dz * dz;
            if (distSq > size * size) continue;

            var bx = cx + dx;
            var by = cy + dy;
            var bz = cz + dz;

            // Check bounds
            if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE)
              continue;
            if (by < 0 || by >= WORLD_HEIGHT) continue;

            // Only replace netherrack with ore (based on rarity probability)
            if (chunk.getBlock(bx, by, bz) === _netherrackId) {
              var hash = Donkeycraft._gen._hash3D(bx, by, bz);
              var prob = (hash % 100) / 100; // [0, 1)
              if (prob < rarity) {
                chunk.setBlock(bx, by, bz, oreId);
              }
            }
          }
        }
      }
    }

    /**
     * Generate a heightmap for the nether (simplified — mostly flat terrain).
     * Uses fbm noise with low frequency to create gentle rolling terrain typical of the nether.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {number[]} Heightmap array of size CHUNK_SIZE × CHUNK_SIZE, where each entry is the surface Y level.
     */
    function generateNetherHeightmap(chunkX, chunkZ) {
      var heightmap = new Array(CHUNK_SIZE * CHUNK_SIZE);

      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var z = 0; z < CHUNK_SIZE; z++) {
          var worldX = chunkX * CHUNK_SIZE + x;
          var worldZ = chunkZ * CHUNK_SIZE + z;

          // Nether terrain is relatively flat — use noise for variation
          var height =
            32 +
            Math.floor(
              Donkeycraft.PerlinNoise.fbm(
                worldX * 0.01,
                0,
                worldZ * 0.01,
                3,
                0.5,
                2.0
              ) * 8
            );

          heightmap[x + z * CHUNK_SIZE] = height;
        }
      }

      return heightmap;
    }

    /**
     * Check if a Y level corresponds to the nether lava sea level.
     * The nether lava sea spans Y=31 and Y=32.
     * @param {number} y - Y coordinate to check.
     * @returns {boolean} True if y is 31 or 32.
     */
    function isLavaSeaLevel(y) {
      return y === 31 || y === 32;
    }

    /**
     * Get the nether lava sea level Y.
     * @returns {number}
     */
    function getLavaSeaLevel() {
      return 31;
    }

    /**
     * Invalidate cached nether block IDs and re-resolve from BlockRegistry.
     * Call this after dynamically adding new blocks to the registry.
     */
    function invalidateBlockIdCache() {
      _bedrockId = 0;
      _netherrackId = 0;
      _soulSandId = 0;
      _basaltId = 0;
      _blackstoneId = 0;
      _lavaId = 0;
      _quartzOreId = 0;
      _netherGoldOreId = 0;
      _gildedBlackstoneId = 0;
      _magmaBlockId = 0;
      _ancientDebrisId = 0;
      _resolveNetherBlockIds();
    }

    /**
     * Destroy and free resources.
     */
    function destroy() {
      _chunkManager = null;
      _bedrockId = 0;
      _netherrackId = 0;
      _soulSandId = 0;
      _basaltId = 0;
      _blackstoneId = 0;
      _lavaId = 0;
      _quartzOreId = 0;
      _netherGoldOreId = 0;
      _gildedBlackstoneId = 0;
      _magmaBlockId = 0;
      _ancientDebrisId = 0;
    }

    /**
     * Get the module object itself as the "instance".
     * @returns {object} The NetherGenerator module.
     */
    function getInstance() {
      return Donkeycraft.NetherGenerator;
    }

    return {
      getInstance: getInstance,
      setChunkManager: setChunkManager,
      generateNetherTerrain: generateNetherTerrain,
      generateNetherHeightmap: generateNetherHeightmap,
      isLavaSeaLevel: isLavaSeaLevel,
      getLavaSeaLevel: getLavaSeaLevel,
      invalidateBlockIdCache: invalidateBlockIdCache,
      destroy: destroy,
    };
  })();
})();
