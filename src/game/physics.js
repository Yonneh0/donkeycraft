// Donkeycraft — Physics
// Block physics: gravity blocks (sand/gravel), liquid flow with level-based spreading.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

  // ============================================================
  // Physics
  // ============================================================

  /**
   * Physics — handles block physics simulations including gravity-affected blocks and liquid flow.
   *
   * Features:
   * - Gravity blocks (sand, gravel) fall downward into air or liquids
   * - Liquid flow with level-based spreading (levels 0-8, where 8 = full source)
   * - Per-chunk liquid level tracking via `_liquidLevels` Map
   * - Top-to-bottom processing for gravity blocks to prevent double-falls per tick
   * - Bottom-to-top processing for liquids to prevent cascading in a single frame
   *
   * @namespace Donkeycraft.Physics
   */
  Donkeycraft.Physics = (function () {
    // Block sets for gravity-affected and liquid blocks
    var _gravityBlocks = {};
    var _liquidBlocks = {};
    var _initialized = false;

    /**
     * Initialize gravity and liquid block sets from Block registry.
     * Resolves gravity-affected blocks by name from BlockRegistry (sand, gravel).
     * Populates liquid block cache by checking all registered block IDs.
     *
     * This function is idempotent — calling it multiple times has no effect after the first call.
     * Call `reinit()` to force re-initialization.
     *
     * @public
     */
    function init() {
      if (_initialized) return;

      _doResolveBlocks();
      _initialized = true;
    }

    /**
     * Re-initialize the physics module after new blocks are added to BlockRegistry.
     * Clears existing caches and re-resolves all block sets from scratch.
     * Call this after dynamically adding new blocks to the registry.
     *
     * @public
     */
    function reinit() {
      // Clear caches
      _gravityBlocks = {};
      _liquidBlocks = {};
      _initialized = false;

      // Re-resolve
      _doResolveBlocks();
      _initialized = true;
    }

    /**
     * Internal: resolve all gravity and liquid block sets from BlockRegistry.
     *
     * Gravity blocks are resolved by name lookup (`sand`, `gravel`).
     * Liquid blocks are resolved by iterating IDs 0-999 and checking `BlockRegistry.isLiquid()`.
     *
     * @private
     */
    function _doResolveBlocks() {
      if (!Donkeycraft.BlockRegistry) return;

      // Resolve gravity-affected blocks by name from BlockRegistry — only sand and gravel fall
      var gravityBlockNames = ['sand', 'gravel'];

      for (var i = 0; i < gravityBlockNames.length; i++) {
        var block = Donkeycraft.BlockRegistry.getBlockByName(
          gravityBlockNames[i]
        );
        if (block) {
          _gravityBlocks[block.id] = true;
        }
      }

      // Populate liquid block cache by checking all registered blocks
      for (var id = 0; id < 1000; id++) {
        if (
          Donkeycraft.BlockRegistry.isLiquid &&
          Donkeycraft.BlockRegistry.isLiquid(id)
        ) {
          _liquidBlocks[id] = true;
        }
      }
    }

    /**
     * Apply gravity to a single block at the given position.
     * If the block is a gravity-affected block (sand, gravel), it falls downward
     * if there's air or liquid below it.
     *
     * @param {Donkeycraft.Chunk} chunk — The chunk containing the block.
     * @param {number} x — Local X coordinate [0, 15].
     * @param {number} y — Local Y coordinate [0, 255].
     * @param {number} z — Local Z coordinate [0, 15].
     * @returns {boolean} True if the block moved downward.
     */
    function applyGravity(chunk, x, y, z) {
      if (
        !chunk ||
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof z !== 'number'
      )
        return false;

      var blockId = chunk.getBlock(x, y, z);

      // Check if this is a gravity-affected block
      if (!_gravityBlocks[blockId]) return false;

      // Can't fall below world bottom
      if (y <= 0) return false;

      var belowBlockId = chunk.getBlock(x, y - 1, z);

      // Only fall into air or liquids
      if (!_canFallInto(belowBlockId)) return false;

      // Move the block down
      chunk.setBlock(x, y, z, 0); // Set current to air
      chunk.setBlock(x, y - 1, z, blockId); // Place below

      return true;
    }

    /**
     * Check if a block can be fallen into (air or liquid).
     *
     * @param {number} blockId — Block ID to check.
     * @returns {boolean} True if the block is air (0) or a liquid.
     * @private
     */
    function _canFallInto(blockId) {
      return !blockId || !!_liquidBlocks[blockId];
    }

    /**
     * Apply gravity to all gravity-affected blocks in a chunk.
     * Processes from top to bottom so falling blocks move only once per tick.
     *
     * @param {Donkeycraft.Chunk} chunk — The chunk to process.
     */
    function applyGravityToChunk(chunk) {
      if (!chunk) return;

      for (var y = WORLD_HEIGHT - 1; y >= 0; y--) {
        for (var x = 0; x < CHUNK_SIZE; x++) {
          for (var z = 0; z < CHUNK_SIZE; z++) {
            applyGravity(chunk, x, y, z);
          }
        }
      }
    }

    /**
     * Apply gravity to a column of blocks (optimization for bulk updates).
     * Processes from bottom to top — each block falls at most once.
     *
     * @param {Donkeycraft.Chunk} chunk — The chunk to process.
     * @param {number} x — Local X coordinate [0, 15].
     * @param {number} z — Local Z coordinate [0, 15].
     */
    function applyGravityColumn(chunk, x, z) {
      if (!chunk || typeof x !== 'number' || typeof z !== 'number') return;

      for (var y = 0; y < WORLD_HEIGHT; y++) {
        applyGravity(chunk, x, y, z);
      }
    }

    /**
     * Simulate liquid flow from a source block at the given position.
     * Spreads to adjacent blocks and downward based on level differences.
     *
     * Flow rules:
     * - Into air: spreads with level - 2 (rapid dissipation)
     * - Into same liquid: merges if neighbor level is lower
     * - Downward: spreads with level - 2 if block below is air
     *
     * @param {Donkeycraft.Chunk} chunk — The chunk containing the liquid.
     * @param {number} x — Local X coordinate [0, 15].
     * @param {number} y — Local Y coordinate [0, 255].
     * @param {number} z — Local Z coordinate [0, 15].
     * @param {number} sourceLevel — Starting liquid level (0-8).
     * @returns {number} Final liquid level at the source position after flow.
     */
    function flowLiquid(chunk, x, y, z, sourceLevel) {
      if (
        !chunk ||
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof z !== 'number'
      )
        return 0;

      var blockId = chunk.getBlock(x, y, z);

      // Check if this is a liquid
      if (!_liquidBlocks[blockId]) return 0;

      // Calculate flow spread based on level
      var newLevel = sourceLevel;

      // Flow to adjacent blocks (4 cardinal directions)
      var directions = [
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
        { dx: 0, dz: 1 },
        { dx: 0, dz: -1 },
      ];

      for (var i = 0; i < directions.length; i++) {
        var nx = x + directions[i].dx;
        var nz = z + directions[i].dz;

        // Check bounds
        if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) continue;

        var neighborId = chunk.getBlock(nx, y, nz);

        // Flow into air — rapid dissipation (level - 2)
        if (!neighborId) {
          chunk.setBlock(nx, y, nz, blockId);
          _setLiquidLevel(chunk, nx, y, nz, Math.max(sourceLevel - 2, 0));
          newLevel = Math.max(newLevel - 2, 0);
        }
        // Flow into same liquid type (merge if neighbor is lower)
        else if (neighborId === blockId) {
          var neighborLevel = _getLiquidLevel(chunk, nx, y, nz);
          if (neighborLevel < sourceLevel) {
            _setLiquidLevel(
              chunk,
              nx,
              y,
              nz,
              Math.max(neighborLevel + 1, sourceLevel - 1)
            );
            newLevel = Math.max(newLevel - 1, 0);
          }
        }
        // Flow into lower liquid level (different liquid type)
        else if (_liquidBlocks[neighborId]) {
          var lowerLevel = _getLiquidLevel(chunk, nx, y, nz);
          if (lowerLevel < sourceLevel - 1) {
            newLevel = Math.max(newLevel - 1, 0);
          }
        }
      }

      // Flow downward
      if (y > 0) {
        var belowId = chunk.getBlock(x, y - 1, z);
        if (!belowId) {
          chunk.setBlock(x, y - 1, z, blockId);
          _setLiquidLevel(chunk, x, y - 1, z, Math.max(sourceLevel - 2, 0));
          newLevel = Math.max(newLevel - 2, 0);
        } else if (_liquidBlocks[belowId]) {
          var belowLevel = _getLiquidLevel(chunk, x, y - 1, z);
          if (belowLevel < sourceLevel) {
            newLevel = Math.max(newLevel - 1, 0);
          }
        }
      }

      // Store the final level for this block
      _setLiquidLevel(chunk, x, y, z, newLevel);

      return newLevel;
    }

    /**
     * Get the stored liquid level for a block position.
     * Checks the chunk's `_liquidLevels` Map first (keyed by "x,y,z" string).
     * If no stored value exists, defaults to level 8 (full liquid source level).
     *
     * @param {Donkeycraft.Chunk} chunk — The chunk containing the liquid.
     * @param {number} x — Local X coordinate [0, 15].
     * @param {number} y — Local Y coordinate [0, 255].
     * @param {number} z — Local Z coordinate [0, 15].
     * @returns {number} Liquid level (0-8), or 8 if no stored value.
     * @private
     */
    function _getLiquidLevel(chunk, x, y, z) {
      if (!chunk || typeof x !== 'number') return 8;

      var key = x + ',' + y + ',' + z;
      if (chunk._liquidLevels && chunk._liquidLevels.has(key)) {
        return chunk._liquidLevels.get(key);
      }
      return 8; // Default full level for newly placed liquids
    }

    /**
     * Set the liquid level for a block. Stores in chunk._liquidLevels Map.
     * Level is clamped to [0, 8] range.
     *
     * @param {Donkeycraft.Chunk} chunk — The chunk.
     * @param {number} x — Local X.
     * @param {number} y — Local Y.
     * @param {number} z — Local Z.
     * @param {number} level — Liquid level (0-8).
     * @private
     */
    function _setLiquidLevel(chunk, x, y, z, level) {
      if (!chunk || typeof x !== 'number') return;

      if (!chunk._liquidLevels) {
        chunk._liquidLevels = new Map();
      }
      var key = x + ',' + y + ',' + z;
      chunk._liquidLevels.set(key, Donkeycraft.clamp(level, 0, 8));
    }

    /**
     * Simulate liquid flow across all liquid blocks in a chunk.
     * Uses the stored liquid level from each block's `_liquidLevels` entry,
     * defaulting to 8 (full source) for blocks without a stored level.
     *
     * Processes from lowest Y upward to prevent cascading issues within this chunk.
     * Only processes originally-found liquids — newly created liquids wait for the next tick
     * to prevent infinite cascading where a single source propagates across the entire chunk
     * in one frame.
     *
     * **Cross-chunk limitation:** Liquids flowing beyond chunk boundaries are silently dropped.
     * Cross-chunk flow requires inter-chunk coordination which is out of scope for this module.
     *
     * Skips processing if no liquid blocks found (optimization).
     *
     * @param {Donkeycraft.Chunk} chunk — The chunk to process.
     */
    function simulateLiquidFlow(chunk) {
      if (!chunk) return;

      // Find all liquid blocks — capture snapshot at tick start
      var liquids = [];

      for (var x = 0; x < CHUNK_SIZE; x++) {
        for (var y = 0; y < WORLD_HEIGHT; y++) {
          for (var z = 0; z < CHUNK_SIZE; z++) {
            var blockId = chunk.getBlock(x, y, z);
            if (_liquidBlocks[blockId]) {
              liquids.push({ x: x, y: y, z: z, blockId: blockId });
            }
          }
        }
      }

      // Early exit if no liquids
      if (liquids.length === 0) return;

      // Process from lowest to highest (prevents cascading issues within this chunk)
      liquids.sort(function (a, b) {
        return a.y - b.y;
      });

      for (var i = 0; i < liquids.length; i++) {
        var l = liquids[i];
        // Use stored liquid level, defaulting to 8 (full source) for new liquids
        var storedLevel = _getLiquidLevel(chunk, l.x, l.y, l.z);
        flowLiquid(chunk, l.x, l.y, l.z, storedLevel);
      }
    }

    /**
     * Check if a block ID is gravity-affected (sand, gravel, etc.).
     *
     * @param {number} blockId — Block ID to check.
     * @returns {boolean} True if the block falls due to gravity.
     */
    function isGravityBlock(blockId) {
      return !!_gravityBlocks[blockId];
    }

    /**
     * Check if a block ID is a liquid (water, lava).
     *
     * @param {number} blockId — Block ID to check.
     * @returns {boolean} True if the block is a liquid.
     */
    function isLiquidBlock(blockId) {
      return !!_liquidBlocks[blockId];
    }

    /**
     * Get all gravity-affected block IDs.
     * @returns {number[]} Array of gravity-affected block IDs.
     */
    function getGravityBlockIds() {
      var result = [];
      for (var id in _gravityBlocks) {
        if (_gravityBlocks.hasOwnProperty(id)) {
          result.push(parseInt(id, 10));
        }
      }
      return result;
    }

    /**
     * Get all liquid block IDs.
     * @returns {number[]} Array of liquid block IDs.
     */
    function getLiquidBlockIds() {
      var result = [];
      for (var id in _liquidBlocks) {
        if (_liquidBlocks.hasOwnProperty(id)) {
          result.push(parseInt(id, 10));
        }
      }
      return result;
    }

    /**
     * Destroy and free all physics module resources.
     * Clears gravity and liquid block caches, resets initialization flag.
     */
    function destroy() {
      _gravityBlocks = {};
      _liquidBlocks = {};
      _initialized = false;
    }

    /**
     * Get the module object itself as the "instance".
     * @returns {object} The Physics module.
     */
    function getInstance() {
      return Donkeycraft.Physics;
    }

    return {
      getInstance: getInstance,
      init: init,
      reinit: reinit,
      applyGravity: applyGravity,
      applyGravityToChunk: applyGravityToChunk,
      applyGravityColumn: applyGravityColumn,
      flowLiquid: flowLiquid,
      simulateLiquidFlow: simulateLiquidFlow,
      isGravityBlock: isGravityBlock,
      isLiquidBlock: isLiquidBlock,
      getGravityBlockIds: getGravityBlockIds,
      getLiquidBlockIds: getLiquidBlockIds,
      destroy: destroy,
    };
  })();
})();
