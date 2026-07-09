// Donkeycraft — Redstone Pistons
// Pistons & sticky pistons: push up to 12 blocks, pull (sticky), crush detection.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

  // Block IDs
  var PISTON = 181;
  var STICKY_PISTON = 182;
  var PISTON_HEAD = 52;

  // Facing directions: 0=down, 1=up, 2=south, 3=north, 4=west, 5=east
  var FACING_DOWN = 0;
  var FACING_UP = 1;
  var FACING_SOUTH = 2;
  var FACING_NORTH = 3;
  var FACING_WEST = 4;
  var FACING_EAST = 5;

  // Maximum push distance
  var MAX_PUSH_DISTANCE = 12;

  // Block IDs that cannot be pushed
  var UNPUSHABLE_BLOCKS = {};
  UNPUSHABLE_BLOCKS[0] = true; // air
  UNPUSHABLE_BLOCKS[8] = true; // water
  UNPUSHABLE_BLOCKS[9] = true; // lava
  UNPUSHABLE_BLOCKS[37] = true; // bedrock
  UNPUSHABLE_BLOCKS[52] = true; // piston_head
  // TNT, obsidian, end portal, end gateway are also unpushable in vanilla
  UNPUSHABLE_BLOCKS[46] = true; // obsidian
  UNPUSHABLE_BLOCKS[119] = true; // end_portal
  UNPUSHABLE_BLOCKS[207] = true; // end_gateway

  // Block IDs that can be pulled only (sticky piston) — blocks with tile entities
  var TILE_ENTITY_BLOCKS = {};
  TILE_ENTITY_BLOCKS[54] = true; // chest
  TILE_ENTITY_BLOCKS[61] = true; // furnace
  TILE_ENTITY_BLOCKS[64] = true; // door (wooden, upper half)
  TILE_ENTITY_BLOCKS[70] = true; // trapdoor
  TILE_ENTITY_BLOCKS[71] = true; // dispenser
  TILE_ENTITY_BLOCKS[72] = true; // dropper
  TILE_ENTITY_BLOCKS[146] = true; // note_block
  TILE_ENTITY_BLOCKS[150] = true; // redstone_torch
  TILE_ENTITY_BLOCKS[151] = true; // button
  TILE_ENTITY_BLOCKS[76] = true; // lever
  TILE_ENTITY_BLOCKS[130] = true; // cake
  TILE_ENTITY_BLOCKS[32] = true; // painting
  TILE_ENTITY_BLOCKS[90] = true; // sign (wall)

  // ============================================================
  // RedstonePistons — piston and sticky piston mechanics
  // ============================================================

  /**
   * RedstonePistons — manages piston extension/retraction, push limits,
   * crush detection, and sticky piston pulling.
   */
  Donkeycraft.RedstonePistons = (function () {
    // Piston states: Map<"x,y,z", { extended: boolean, extending: boolean, extendTick: number, facing: number, isSticky: boolean }}
    var _pistonStates = {};

    // Active piston pushes: array of { pistonX, pistonY, pistonZ, facing, blocks: [{x, y, z, blockId}], tick }
    var _activePushes = [];

    /**
     * Initialize the piston system.
     */
    function init() {
      // No special initialization needed
    }

    /**
     * Process a dirty piston block.
     * @param {Object} entry - {x, y, z, chunkX, chunkZ}.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @private
     */
    function _processPiston(entry, chunk) {
      var localX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var localZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var blockId = chunk.getBlock(localX, entry.y, localZ);
      if (blockId !== PISTON && blockId !== STICKY_PISTON) return;

      var key = entry.x + ',' + entry.y + ',' + entry.z;
      var state = _pistonStates[key];
      var isSticky = blockId === STICKY_PISTON;

      if (!state) {
        state = {
          extended: false,
          extending: false,
          retracting: false,
          wasExtending: false,
          extendTick: 0,
          facing: FACING_SOUTH,
          isSticky: isSticky,
        };
        _pistonStates[key] = state;
      }

      var currentTick = Donkeycraft.RedstoneEngine
        ? Donkeycraft.RedstoneEngine.getCurrentTick()
        : 0;

      // Check if currently extending/retracting
      if (state.extending || state.retracting) {
        // Animation is in progress — check if complete
        if (currentTick >= state.extendTick) {
          state.extending = false;
          state.retracting = false;
          // Use wasExtending to determine final state
          state.extended = state.wasExtending;
          state.wasExtending = false;
        }
        return;
      }

      // Check if powered by redstone signal
      var isPowered = _isPistonPowered(entry.x, entry.y, entry.z, chunk);

      if (isPowered && !state.extended) {
        // Try to extend
        _tryExtend(entry.x, entry.y, entry.z, state, isSticky);
      } else if (!isPowered && state.extended) {
        // Retract (sticky pistons retract when unpowered)
        _tryRetract(entry.x, entry.y, entry.z, state, isSticky);
      }
    }

    /**
     * Check if a piston is powered by adjacent redstone signal.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @returns {boolean}
     * @private
     */
    function _isPistonPowered(x, y, z, chunk) {
      // Check all 6 sides for powered blocks or redstone wire
      var sides = [
        { dx: 0, dy: -1, dz: 0 }, // bottom
        { dx: 0, dy: 1, dz: 0 }, // top
        { dx: 1, dy: 0, dz: 0 }, // east
        { dx: -1, dy: 0, dz: 0 }, // west
        { dx: 0, dy: 0, dz: 1 }, // south
        { dx: 0, dy: 0, dz: -1 }, // north
      ];

      for (var i = 0; i < sides.length; i++) {
        var s = sides[i];
        var nx = x + s.dx;
        var ny = y + s.dy;
        var nz = z + s.dz;

        var nChunkX = Math.floor(nx / CHUNK_SIZE);
        var nLocalX = ((nx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        var nChunkZ = Math.floor(nz / CHUNK_SIZE);
        var nLocalZ = ((nz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        var nChunk = _getChunk(nChunkX, nChunkZ);
        if (!nChunk) continue;

        var nBlockId = nChunk.getBlock(nLocalX, ny, nLocalZ);

        // Powered blocks activate pistons
        if (nBlockId === 174 || nBlockId === 176 || nBlockId === 230) {
          // torch, lit lamp, redstone block
          return true;
        }

        // Redstone wire at the piston's level activates it
        if ((nBlockId === 173 || nBlockId === 229) && s.dy === 0) {
          return true;
        }

        // Lit redstone lamp
        if (nBlockId === 176) return true;
      }

      return false;
    }

    /**
     * Try to extend a piston.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Object} state - Piston state.
     * @param {boolean} isSticky - Whether this is a sticky piston.
     * @private
     */
    function _tryExtend(x, y, z, state, isSticky) {
      // Determine push direction (piston pushes in facing direction)
      var pushDir = _getPushDirection(state.facing);
      if (!pushDir) return;

      // Check what's in front of the piston
      var frontChunkX = Math.floor((x + pushDir.dx) / CHUNK_SIZE);
      var frontLocalX =
        (((x + pushDir.dx) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var frontChunkZ = Math.floor((z + pushDir.dz) / CHUNK_SIZE);
      var frontLocalZ =
        (((z + pushDir.dz) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var frontChunk = _getChunk(frontChunkX, frontChunkZ);
      if (!frontChunk) return;

      var frontBlockId = frontChunk.getBlock(frontLocalX, y, frontLocalZ);

      // Air or replaceable blocks don't need pushing — just extend into empty space
      if (
        frontBlockId === 0 ||
        Donkeycraft.BlockRegistry.isReplaceable(frontBlockId)
      ) {
        state.extended = true;
        state.extending = true;
        state.wasExtending = true;
        state.extendTick =
          (Donkeycraft.RedstoneEngine
            ? Donkeycraft.RedstoneEngine.getCurrentTick()
            : 0) + 1;

        // Place piston head block
        _setBlockAt(x + pushDir.dx, y, z + pushDir.dz, PISTON_HEAD);

        // Emit signal to adjacent redstone wire in push direction
        _emitPistonOutputSignal(x, y, z, pushDir, 15);

        return;
      }

      // Check if block is pushable
      if (UNPUSHABLE_BLOCKS[frontBlockId]) return;

      // Calculate the push chain (up to MAX_PUSH_DISTANCE blocks)
      var pushChain = _calculatePushChain(x, y, z, pushDir, state.isSticky);

      if (!pushChain || pushChain.length === 0) return;

      // Execute the push: shift all blocks in chain
      _executePush(pushChain, pushDir, x, y, z, state.isSticky);

      // Place piston head
      _setBlockAt(x + pushDir.dx, y, z + pushDir.dz, PISTON_HEAD);

      state.extended = true;
      state.extending = true;
      state.wasExtending = true;
      state.extendTick =
        (Donkeycraft.RedstoneEngine
          ? Donkeycraft.RedstoneEngine.getCurrentTick()
          : 0) + 1;

      // Emit signal to adjacent redstone wire in push direction
      _emitPistonOutputSignal(x, y, z, pushDir, 15);
    }

    /**
     * Calculate the chain of blocks to push.
     * @param {number} px - Piston X.
     * @param {number} py - Piston Y.
     * @param {number} pz - Piston Z.
     * @param {Object} pushDir - {dx, dy, dz}.
     * @param {boolean} isSticky - Whether this is a sticky piston.
     * @returns {Array|null} Array of {x, y, z, blockId}, or null if push fails.
     * @private
     */
    function _calculatePushChain(px, py, pz, pushDir, isSticky) {
      var chain = [];

      for (var i = 1; i <= MAX_PUSH_DISTANCE; i++) {
        var bx = px + pushDir.dx * i;
        var by = py + pushDir.dy * i;
        var bz = pz + pushDir.dz * i;

        var bChunkX = Math.floor(bx / CHUNK_SIZE);
        var bLocalX = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        var bChunkZ = Math.floor(bz / CHUNK_SIZE);
        var bLocalZ = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        var bChunk = _getChunk(bChunkX, bChunkZ);
        if (!bChunk) return null;

        var blockId = bChunk.getBlock(bLocalX, by, bLocalZ);

        // Air means end of chain (nothing to push)
        if (blockId === 0) return null;

        // Unpushable blocks stop the chain
        if (UNPUSHABLE_BLOCKS[blockId]) return null;

        // Tile entity blocks can only be pulled by sticky pistons
        if (TILE_ENTITY_BLOCKS[blockId] && !isSticky) return null;

        chain.push({ x: bx, y: by, z: bz, blockId: blockId });
      }

      // Check if there's room for the last block
      var endX = px + pushDir.dx * (chain.length + 1);
      var endY = py + pushDir.dy * (chain.length + 1);
      var endZ = pz + pushDir.dz * (chain.length + 1);

      var endChunkX = Math.floor(endX / CHUNK_SIZE);
      var endLocalX = ((endX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var endChunkZ = Math.floor(endZ / CHUNK_SIZE);
      var endLocalZ = ((endZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var endChunk = _getChunk(endChunkX, endChunkZ);
      if (!endChunk) return null;

      var endBlockId = endChunk.getBlock(endLocalX, endY, endLocalZ);

      // Target must be air or replaceable
      if (
        endBlockId !== 0 &&
        !Donkeycraft.BlockRegistry.isReplaceable(endBlockId)
      ) {
        return null; // Crush detection: no room
      }

      return chain;
    }

    /**
     * Execute a push: move all blocks in the chain from end to start.
     * @param {Array} chain - Array of {x, y, z, blockId}.
     * @param {Object} pushDir - {dx, dy, dz}.
     * @param {number} px - Piston X.
     * @param {number} py - Piston Y.
     * @param {number} pz - Piston Z.
     * @param {boolean} isSticky - Whether this is a sticky piston.
     * @private
     */
    function _executePush(chain, pushDir, px, py, pz, isSticky) {
      // Process from end to start (last block moves first to avoid overwriting)
      for (var i = chain.length - 1; i >= 0; i--) {
        var block = chain[i];
        var newX = block.x + pushDir.dx;
        var newY = block.y + pushDir.dy;
        var newZ = block.z + pushDir.dz;

        _setBlockAt(newX, newY, newZ, block.blockId);
        _setBlockAt(block.x, block.y, block.z, 0); // Remove from old position
      }

      // Sticky piston: pull the block directly behind it
      if (isSticky) {
        var behindX = px - pushDir.dx;
        var behindY = py - pushDir.dy;
        var behindZ = pz - pushDir.dz;

        var behindBlockId = _getBlockId(behindX, behindY, behindZ);
        if (behindBlockId !== 0 && !UNPUSHABLE_BLOCKS[behindBlockId]) {
          var pullNewX = behindX - pushDir.dx;
          var pullNewY = behindY - pushDir.dy;
          var pullNewZ = behindZ - pushDir.dz;

          // Check if there's room to pull the block back
          var pullEndBlockId = _getBlockId(pullNewX, pullNewY, pullNewZ);
          if (
            pullEndBlockId === 0 ||
            Donkeycraft.BlockRegistry.isReplaceable(pullEndBlockId)
          ) {
            _setBlockAt(pullNewX, pullNewY, pullNewZ, behindBlockId);
            _setBlockAt(behindX, behindY, behindZ, 0);
          }
        }
      }
    }

    /**
     * Try to retract a piston.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Object} state - Piston state.
     * @param {boolean} isSticky - Whether this is a sticky piston.
     * @private
     */
    function _tryRetract(x, y, z, state, isSticky) {
      var pushDir = _getPushDirection(state.facing);
      if (!pushDir) return;

      // Remove piston head block
      _setBlockAt(x + pushDir.dx, y, z + pushDir.dz, 0);

      // Sticky piston: pull any block directly in front of it back toward the piston
      if (isSticky) {
        var attachedX = x + pushDir.dx;
        var attachedY = y + pushDir.dy;
        var attachedZ = z + pushDir.dz;

        var attachedBlockId = _getBlockId(attachedX, attachedY, attachedZ);
        if (attachedBlockId !== 0 && !UNPUSHABLE_BLOCKS[attachedBlockId]) {
          var pullBackX = x - pushDir.dx;
          var pullBackY = y - pushDir.dy;
          var pullBackZ = z - pushDir.dz;

          // Check if there's room to pull the block back
          var pullEndBlockId = _getBlockId(pullBackX, pullBackY, pullBackZ);
          if (
            pullEndBlockId === 0 ||
            Donkeycraft.BlockRegistry.isReplaceable(pullEndBlockId)
          ) {
            _setBlockAt(pullBackX, pullBackY, pullBackZ, attachedBlockId);
            _setBlockAt(attachedX, attachedY, attachedZ, 0);
          }
        }
      }

      state.extended = false;
      state.retracting = true;
      state.wasExtending = false;
      state.extendTick =
        (Donkeycraft.RedstoneEngine
          ? Donkeycraft.RedstoneEngine.getCurrentTick()
          : 0) + 1;

      // Mark adjacent blocks as dirty for redstone propagation
      var markX = x - pushDir.dx;
      var markZ = z - pushDir.dz;
      Donkeycraft.RedstoneEngine.markDirty(markX, y, markZ);
    }

    /**
     * Get the push direction for a piston's facing.
     * @param {number} facing - Facing direction.
     * @returns {Object|null} {dx, dy, dz} or null.
     * @private
     */
    function _getPushDirection(facing) {
      switch (facing) {
        case FACING_DOWN:
          return { dx: 0, dy: -1, dz: 0 };
        case FACING_UP:
          return { dx: 0, dy: 1, dz: 0 };
        case FACING_SOUTH:
          return { dx: 0, dy: 0, dz: 1 };
        case FACING_NORTH:
          return { dx: 0, dy: 0, dz: -1 };
        case FACING_WEST:
          return { dx: -1, dy: 0, dz: 0 };
        case FACING_EAST:
          return { dx: 1, dy: 0, dz: 0 };
      }
      return null;
    }

    /**
     * Set a block at global coordinates.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} blockId - Block ID to place.
     * @private
     */
    function _setBlockAt(x, y, z, blockId) {
      var chunkX = Math.floor(x / CHUNK_SIZE);
      var localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var chunkZ = Math.floor(z / CHUNK_SIZE);
      var localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var chunk = _getChunk(chunkX, chunkZ);
      if (!chunk) return;

      if (y < 0 || y >= WORLD_HEIGHT) return;

      chunk.setBlock(localX, y, localZ, blockId);
    }

    /**
     * Get a block ID at global coordinates.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @returns {number} Block ID.
     * @private
     */
    function _getBlockId(x, y, z) {
      var chunkX = Math.floor(x / CHUNK_SIZE);
      var localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var chunkZ = Math.floor(z / CHUNK_SIZE);
      var localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var chunk = _getChunk(chunkX, chunkZ);
      if (!chunk) return 0;

      if (y < 0 || y >= WORLD_HEIGHT) return 0;

      return chunk.getBlock(localX, y, localZ);
    }

    /**
     * Get a chunk by global coordinates.
     * @param {number} chunkX - Chunk X.
     * @param {number} chunkZ - Chunk Z.
     * @returns {Donkeycraft.Chunk|null}
     * @private
     */
    function _getChunk(chunkX, chunkZ) {
      if (Donkeycraft._redstoneChunkManager) {
        return Donkeycraft._redstoneChunkManager.getChunk(chunkX, chunkZ);
      }
      return null;
    }

    /**
     * Get the piston state at a position.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @returns {Object|null}
     */
    function getPistonState(x, y, z) {
      return _pistonStates[x + ',' + y + ',' + z] || null;
    }

    /**
     * Get the maximum push distance.
     * @returns {number}
     */
    function getMaxPushDistance() {
      return MAX_PUSH_DISTANCE;
    }

    /**
     * Check if a block ID is unpushable.
     * @param {number} blockId - Block ID.
     * @returns {boolean}
     */
    function isUnpushable(blockId) {
      return !!UNPUSHABLE_BLOCKS[blockId];
    }

    /**
     * Set the facing direction of a piston at the given position.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} facing - Facing direction (0-5).
     */
    function setPistonFacing(x, y, z, facing) {
      var key = x + ',' + y + ',' + z;
      if (!_pistonStates[key]) {
        _pistonStates[key] = {
          extended: false,
          extending: false,
          retracting: false,
          wasExtending: false,
          extendTick: 0,
          facing: facing,
          isSticky: false,
        };
      }
      _pistonStates[key].facing = facing;
    }

    /**
     * Clear all piston states and active pushes.
     */
    function clearAllStates() {
      _pistonStates = {};
      _activePushes = [];
    }

    /**
     * Destroy the system: clear all state.
     */
    function destroy() {
      clearAllStates();
    }

    /**
     * Emit a redstone signal from the piston's output face to adjacent wires.
     * @param {number} x - Piston X.
     * @param {number} y - Piston Y.
     * @param {number} z - Piston Z.
     * @param {Object} pushDir - {dx, dy, dz}.
     * @param {number} strength - Signal strength to emit.
     * @private
     */
    function _emitPistonOutputSignal(x, y, z, pushDir, strength) {
      // Output is 2 blocks away from piston face (piston head + adjacent space)
      var outPos = {
        x: x + pushDir.dx * 2,
        y: y + pushDir.dy * 2,
        z: z + pushDir.dz * 2,
      };

      if (
        Donkeycraft._redstoneWiring &&
        Donkeycraft._redstoneWiring.setSignalStrength
      ) {
        var outBlockId = _getBlockId(outPos.x, outPos.y, outPos.z);
        if (outBlockId === 173 || outBlockId === 229) {
          Donkeycraft._redstoneWiring.setSignalStrength(
            outPos.x,
            outPos.y,
            outPos.z,
            strength
          );
        }
      }

      // Mark output position as dirty for redstone propagation
      Donkeycraft.RedstoneEngine.markDirty(outPos.x, outPos.y, outPos.z);
    }

    return {
      init: init,
      getPistonState: getPistonState,
      setPistonFacing: setPistonFacing,
      getMaxPushDistance: getMaxPushDistance,
      isUnpushable: isUnpushable,
      clearAllStates: clearAllStates,
      _processPiston: _processPiston,
      destroy: destroy,
    };
  })();
})();
