// Donkeycraft — World Utilities
// Shared coordinate and block access utilities to reduce duplication across interaction modules.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

  // ============================================================
  // WorldUtils
  // ============================================================

  /**
   * WorldUtils — shared utilities for block access, coordinate conversion,
   * chunk state queries, and raycast step calculation. Used across interaction modules
   * to reduce duplication in block breaking/placing and portal detection.
   */
  Donkeycraft.WorldUtils = (function () {
    /**
     * Get the block ID at global world coordinates from the current world state.
     * Returns 0 if chunk doesn't exist, Y is out of bounds, or block is air.
     * Uses ChunkManager.getChunkIfExists (non-creating) to avoid loading chunks.
     * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager for the current dimension.
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalY - Global Y coordinate [0, WORLD_HEIGHT).
     * @param {number} globalZ - Global Z coordinate.
     * @returns {number} Block ID (0 = air or unloaded chunk).
     */
    function getBlockAt(chunkManager, globalX, globalY, globalZ) {
      if (!chunkManager) return 0;
      if (globalY < 0 || globalY >= WORLD_HEIGHT) return 0;

      var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
      var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

      var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
      if (!chunk) return 0;

      var localX = Donkeycraft.Chunk.localCoordX(globalX);
      var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

      return chunk.getBlock(localX, globalY, localZ);
    }

    /**
     * Set the block ID at global world coordinates in the current world state.
     * Marks the chunk dirty via ChunkManager.markChunkDirty if the block changed.
     * Returns false if chunk doesn't exist or Y is out of bounds.
     * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager for the current dimension.
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalY - Global Y coordinate [0, WORLD_HEIGHT).
     * @param {number} globalZ - Global Z coordinate.
     * @param {number} blockId - Block ID to set.
     * @returns {boolean} True if the block was updated.
     */
    function setBlockAt(chunkManager, globalX, globalY, globalZ, blockId) {
      if (!chunkManager) return false;
      if (globalY < 0 || globalY >= WORLD_HEIGHT) return false;

      var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
      var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

      var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
      if (!chunk) return false;

      var localX = Donkeycraft.Chunk.localCoordX(globalX);
      var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

      chunk.setBlock(localX, globalY, localZ, blockId);
      chunkManager.markChunkDirty(chunkX, chunkZ);

      return true;
    }

    /**
     * Check if a chunk containing the given global coordinates is currently loaded in the ChunkManager.
     * Uses getChunkIfExists (non-creating) to avoid loading chunks.
     * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager for the current dimension.
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {boolean} True if the target chunk is currently loaded.
     */
    function isChunkLoaded(chunkManager, globalX, globalZ) {
      if (!chunkManager) return false;

      var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
      var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

      return !!chunkManager.getChunkIfExists(chunkX, chunkZ);
    }

    /**
     * Get the chunk and local coordinates for a global position.
     * Returns chunk=null if Y is out of bounds or chunk is not loaded.
     * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager for the current dimension.
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalY - Global Y coordinate [0, WORLD_HEIGHT).
     * @param {number} globalZ - Global Z coordinate.
     * @returns {{chunk: Donkeycraft.Chunk|null, lx: number, ly: number, lz: number}} Object with chunk reference and local x/y/z.
     */
    function getChunkAndLocalCoords(chunkManager, globalX, globalY, globalZ) {
      if (!chunkManager || globalY < 0 || globalY >= WORLD_HEIGHT) {
        return { chunk: null, lx: 0, ly: 0, lz: 0 };
      }

      var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
      var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

      var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
      if (!chunk) return { chunk: null, lx: 0, ly: 0, lz: 0 };

      var lx = Donkeycraft.Chunk.localCoordX(globalX);
      var lz = Donkeycraft.Chunk.localCoordZ(globalZ);

      return { chunk: chunk, lx: lx, ly: globalY, lz: lz };
    }

    /**
     * Calculate the number of steps needed for a DDA raycast at a given reach distance.
     * Uses the formula: ceil(reach * sqrt(3)) + 2 to cover diagonal traversal through voxels.
     * @param {number} reach - Maximum reach distance in blocks (e.g., 6 for creative, 3 for survival).
     * @returns {number} Maximum number of DDA steps to traverse the reach distance.
     */
    function calculateRaycastMaxSteps(reach) {
      return Math.ceil(reach * Math.sqrt(3)) + 2;
    }

    /**
     * Convert global coordinates to a composite string key for state maps.
     * Uses "x,y,z" format for compatibility with existing code.
     * Note: Caller should floor coordinates before passing.
     * @param {number} x - Global X coordinate (should be floored).
     * @param {number} y - Global Y coordinate (should be floored).
     * @param {number} z - Global Z coordinate (should be floored).
     * @returns {string} Composite key in "x,y,z" format.
     */
    function makeStateKey(x, y, z) {
      return x + ',' + y + ',' + z;
    }

    /**
     * Parse a state key back into numeric coordinates.
     * @param {string} key - State key in "x,y,z" format.
     * @returns {{x: number, y: number, z: number}} Object with parsed x, y, z as integers.
     */
    function parseStateKey(key) {
      var parts = key.split(',');
      return {
        x: parseInt(parts[0], 10),
        y: parseInt(parts[1], 10),
        z: parseInt(parts[2], 10),
      };
    }

    /**
     * Get the chunk key for a global coordinate pair.
     * Internally converts global coordinates to chunk coordinates via Chunk.chunkCoordX/Z.
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {string} Chunk key in "chunkX,chunkZ" format.
     */
    function makeChunkKey(globalX, globalZ) {
      return (
        Donkeycraft.Chunk.chunkCoordX(globalX) +
        ',' +
        Donkeycraft.Chunk.chunkCoordZ(globalZ)
      );
    }

    return {
      getBlockAt: getBlockAt,
      setBlockAt: setBlockAt,
      isChunkLoaded: isChunkLoaded,
      getChunkAndLocalCoords: getChunkAndLocalCoords,
      calculateRaycastMaxSteps: calculateRaycastMaxSteps,
      makeStateKey: makeStateKey,
      parseStateKey: parseStateKey,
      makeChunkKey: makeChunkKey,
    };
  })();
})();
