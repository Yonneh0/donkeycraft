// Donkeycraft — Redstone Repeater & Comparator
// Redstone repeater (delay 1-4 ticks, max output 15), comparator (block compare, difference mode).
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

  // Block IDs
  var REPEATER = 180;
  var COMPARATOR = 232; // Comparator: unused ID (observer is 179)

  // Facing directions: 0=south, 1=west, 2=north, 3=east
  var FACING_SOUTH = 0;
  var FACING_WEST = 1;
  var FACING_NORTH = 2;
  var FACING_EAST = 3;

  // Comparator modes
  var COMP_MODE_BLOCK_COMPARE = 0;
  var COMP_MODE_DIFFERENCE = 1;

  // ============================================================
  // RedstoneRepeaterComparator — repeaters and comparators
  // ============================================================

  /**
   * RedstoneRepeaterComparator — manages redstone repeater delays, comparator modes,
   * signal boosting, and block compare logic.
   */
  Donkeycraft.RedstoneRepeaterComparator = (function () {
    // Repeater states: Map<"x,y,z", { delay: 1-4, locked: boolean, outputStrength: number, targetTick: number, facing: number }}
    var _repeaterStates = {};

    // Comparator states: Map<"x,y,z", { mode: number, inputStrengthA: number, inputStrengthB: number, outputStrength: number, facing: number }}
    var _comparatorStates = {};

    /**
     * Initialize the repeater/comparator system.
     */
    function init() {
      // No special initialization needed
    }

    /**
     * Process a dirty repeater block.
     * @param {Object} entry - {x, y, z, chunkX, chunkZ}.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @private
     */
    function _processRepeater(entry, chunk) {
      var localX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var localZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      if (chunk.getBlock(localX, entry.y, localZ) !== REPEATER) return;

      var key = entry.x + ',' + entry.y + ',' + entry.z;
      var state = _repeaterStates[key];

      if (!state) {
        // Initialize default state: delay=1, unlocked, facing south
        state = {
          delay: 1,
          locked: false,
          outputStrength: 0,
          targetTick: 0,
          facing: FACING_SOUTH,
          active: false,
        };
        _repeaterStates[key] = state;
      }

      // Check if locked by adjacent powered comparator
      if (state.locked) return;

      // Get input signal strength from the block behind the repeater
      var inputStrength = _getInputSignal(
        entry.x,
        entry.y,
        entry.z,
        state.facing
      );

      if (inputStrength > 0 && !state.active) {
        // Input detected: start delay timer
        state.active = true;
        state.targetTick =
          (Donkeycraft.RedstoneEngine
            ? Donkeycraft.RedstoneEngine.getCurrentTick()
            : 0) + state.delay;
      }

      if (!state.active) return;

      // Check if delay has elapsed
      var currentTick = Donkeycraft.RedstoneEngine
        ? Donkeycraft.RedstoneEngine.getCurrentTick()
        : 0;
      if (currentTick < state.targetTick) return;

      // Output signal: boost to full strength
      if (state.outputStrength !== 15) {
        state.outputStrength = 15;
        state.active = false; // Reset for next cycle

        // Emit signal in facing direction
        _emitSignal(entry.x, entry.y, entry.z, state.facing, 15);

        // Mark output block as dirty
        var outPos = _getOutputPosition(
          entry.x,
          entry.y,
          entry.z,
          state.facing
        );
        if (outPos) {
          Donkeycraft.RedstoneEngine.markDirty(outPos.x, outPos.y, outPos.z);
        }
      } else if (inputStrength === 0) {
        // Input lost: reset output
        state.outputStrength = 0;
        _emitSignal(entry.x, entry.y, entry.z, state.facing, 0);
      }
    }

    /**
     * Get the input signal strength for a repeater based on its facing direction.
     * The input comes from the block opposite to the facing direction.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} facing - Repeater facing direction.
     * @returns {number} Input signal strength (0-15).
     * @private
     */
    function _getInputSignal(x, y, z, facing) {
      var inputPos = _getInputPosition(x, y, z, facing);
      if (!inputPos) return 0;

      // Check for adjacent redstone wire
      var chunkX = Math.floor(inputPos.x / CHUNK_SIZE);
      var localX = ((inputPos.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var chunkZ = Math.floor(inputPos.z / CHUNK_SIZE);
      var localZ = ((inputPos.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var chunk = _getChunk(chunkX, chunkZ);
      if (!chunk) return 0;

      var blockId = chunk.getBlock(localX, inputPos.y, localZ);

      // Check if it's a redstone wire
      if (blockId === 173 || blockId === 229) {
        var chunkKey = Donkeycraft.WorldUtils.makeChunkKey(chunkX, chunkZ);
        if (
          Donkeycraft._redstoneWiring &&
          Donkeycraft._redstoneWiring.getSignalStrength
        ) {
          return Donkeycraft._redstoneWiring.getSignalStrength(
            inputPos.x,
            inputPos.y,
            inputPos.z
          );
        }
      }

      // Check for powered solid blocks adjacent to repeater input
      if (_isPoweredBlock(blockId)) return 15;

      return 0;
    }

    /**
     * Get the input position for a repeater (block behind it, opposite to facing).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} facing - Facing direction.
     * @returns {Object|null}
     * @private
     */
    function _getInputPosition(x, y, z, facing) {
      switch (facing) {
        case FACING_SOUTH:
          return { x: x, y: y, z: z + 1 };
        case FACING_NORTH:
          return { x: x, y: y, z: z - 1 };
        case FACING_WEST:
          return { x: x + 1, y: y, z: z };
        case FACING_EAST:
          return { x: x - 1, y: y, z: z };
      }
      return null;
    }

    /**
     * Get the output position for a repeater (block in facing direction).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} facing - Facing direction.
     * @returns {Object|null}
     * @private
     */
    function _getOutputPosition(x, y, z, facing) {
      switch (facing) {
        case FACING_SOUTH:
          return { x: x, y: y, z: z - 1 };
        case FACING_NORTH:
          return { x: x, y: y, z: z + 1 };
        case FACING_WEST:
          return { x: x - 1, y: y, z: z };
        case FACING_EAST:
          return { x: x + 1, y: y, z: z };
      }
      return null;
    }

    /**
     * Emit a signal from a repeater in its facing direction.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} strength - Signal strength to emit.
     * @private
     */
    function _emitSignal(x, y, z, facing, strength) {
      var outPos = _getOutputPosition(x, y, z, facing);
      if (!outPos) return;

      // Set signal on adjacent redstone wire
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
    }

    /**
     * Check if a block is a powered block (emits redstone signal).
     * @param {number} blockId - Block ID.
     * @returns {boolean}
     * @private
     */
    function _isPoweredBlock(blockId) {
      // Redstone torch, lit lamp, redstone block, etc.
      return blockId === 174 || blockId === 176 || blockId === 230;
    }

    /**
     * Process a dirty comparator block.
     * @param {Object} entry - {x, y, z, chunkX, chunkZ}.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @private
     */
    function _processComparator(entry, chunk) {
      var localX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var localZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      if (chunk.getBlock(localX, entry.y, localZ) !== COMPARATOR) return;

      var key = entry.x + ',' + entry.y + ',' + entry.z;
      var state = _comparatorStates[key];

      if (!state) {
        state = {
          mode: COMP_MODE_BLOCK_COMPARE,
          inputStrengthA: 0,
          inputStrengthB: 0,
          outputStrength: 0,
          facing: FACING_SOUTH,
        };
        _comparatorStates[key] = state;
      }

      // Get the block being compared (behind comparator, opposite to facing)
      var behindPos = _getInputPosition(
        entry.x,
        entry.y,
        entry.z,
        state.facing
      );
      if (!behindPos) return;

      var behindChunkX = Math.floor(behindPos.x / CHUNK_SIZE);
      var behindLocalX = ((behindPos.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var behindChunkZ = Math.floor(behindPos.z / CHUNK_SIZE);
      var behindLocalZ = ((behindPos.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var behindChunk = _getChunk(behindChunkX, behindChunkZ);
      if (!behindChunk) return;

      var behindBlockId = behindChunk.getBlock(
        behindLocalX,
        behindPos.y,
        behindLocalZ
      );

      // Calculate input strengths
      state.inputStrengthA = _calculateContainerSignal(
        behindBlockId,
        behindPos.x,
        behindPos.y,
        behindPos.z,
        behindChunk
      );
      state.inputStrengthB = _getAdjacentWireSignal(
        entry.x,
        entry.y,
        entry.z,
        state.facing
      );

      // Calculate output based on mode
      var newOutput;
      if (state.mode === COMP_MODE_BLOCK_COMPARE) {
        // Block compare mode: output = inputA if inputA >= inputB
        newOutput =
          state.inputStrengthA >= state.inputStrengthB
            ? state.inputStrengthA
            : 0;
      } else {
        // Difference mode: output = |inputA - inputB|
        newOutput = Math.abs(state.inputStrengthA - state.inputStrengthB);
      }

      if (newOutput !== state.outputStrength) {
        state.outputStrength = newOutput;

        // Emit signal in facing direction
        _emitComparatorSignal(
          entry.x,
          entry.y,
          entry.z,
          state.facing,
          newOutput
        );

        // Mark output as dirty for propagation
        var outPos = _getOutputPosition(
          entry.x,
          entry.y,
          entry.z,
          state.facing
        );
        if (outPos) {
          Donkeycraft.RedstoneEngine.markDirty(outPos.x, outPos.y, outPos.z);
        }
      }
    }

    /**
     * Calculate the container signal strength for block compare mode.
     * @param {number} blockId - Block ID behind comparator.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @returns {number} Signal strength (0-15).
     * @private
     */
    function _calculateContainerSignal(blockId, x, y, z, chunk) {
      // Chests and furnaces output based on fill level
      if (blockId === 54 || blockId === 61) {
        // chest or furnace
        // Simplified: return a fixed strength for now
        // In a full implementation, this would query the actual inventory
        return 1;
      }

      // Redstone wire directly behind comparator
      if (blockId === 173 || blockId === 229) {
        var chunkKey = Donkeycraft.WorldUtils.makeChunkKey(
          Math.floor(x / CHUNK_SIZE),
          Math.floor(z / CHUNK_SIZE)
        );
        if (
          Donkeycraft._redstoneWiring &&
          Donkeycraft._redstoneWiring.getSignalStrength
        ) {
          return Donkeycraft._redstoneWiring.getSignalStrength(x, y, z);
        }
      }

      // Powered blocks
      if (_isPoweredBlock(blockId)) return 15;

      return 0;
    }

    /**
     * Get the adjacent wire signal for difference mode.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} facing - Comparator facing direction.
     * @returns {number}
     * @private
     */
    function _getAdjacentWireSignal(x, y, z, facing) {
      // Get signal from the side blocks (left/right relative to facing)
      var sidePos;
      if (facing === FACING_SOUTH || facing === FACING_NORTH) {
        sidePos = { x: x + 1, y: y, z: z };
      } else {
        sidePos = { x: x, y: y, z: z + 1 };
      }

      var sideChunkX = Math.floor(sidePos.x / CHUNK_SIZE);
      var sideLocalX = ((sidePos.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var sideChunkZ = Math.floor(sidePos.z / CHUNK_SIZE);
      var sideLocalZ = ((sidePos.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var sideChunk = _getChunk(sideChunkX, sideChunkZ);
      if (!sideChunk) return 0;

      var sideBlockId = sideChunk.getBlock(sideLocalX, sidePos.y, sideLocalZ);
      if (sideBlockId === 173 || sideBlockId === 229) {
        if (
          Donkeycraft._redstoneWiring &&
          Donkeycraft._redstoneWiring.getSignalStrength
        ) {
          return Donkeycraft._redstoneWiring.getSignalStrength(
            sidePos.x,
            sidePos.y,
            sidePos.z
          );
        }
      }

      return 0;
    }

    /**
     * Emit a comparator signal in the facing direction.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} facing - Facing direction.
     * @param {number} strength - Output strength.
     * @private
     */
    function _emitComparatorSignal(x, y, z, facing, strength) {
      var outPos = _getOutputPosition(x, y, z, facing);
      if (!outPos) return;

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
     * Set the repeater delay for a repeater at the given position.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} delay - Delay in ticks (1-4).
     */
    function setRepeaterDelay(x, y, z, delay) {
      delay = Math.max(1, Math.min(4, delay));
      var key = x + ',' + y + ',' + z;
      if (!_repeaterStates[key]) {
        _repeaterStates[key] = {
          delay: delay,
          locked: false,
          outputStrength: 0,
          targetTick: 0,
          facing: FACING_SOUTH,
        };
      }
      _repeaterStates[key].delay = delay;
    }

    /**
     * Set the comparator mode for a comparator at the given position.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} mode - Mode (0 = block compare, 1 = difference).
     */
    function setComparatorMode(x, y, z, mode) {
      var key = x + ',' + y + ',' + z;
      if (!_comparatorStates[key]) {
        _comparatorStates[key] = {
          mode: mode,
          inputStrengthA: 0,
          inputStrengthB: 0,
          outputStrength: 0,
          facing: FACING_SOUTH,
        };
      }
      _comparatorStates[key].mode = mode;
    }

    /**
     * Lock a repeater (via adjacent powered comparator).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {boolean} locked - Whether to lock.
     */
    function lockRepeater(x, y, z, locked) {
      var key = x + ',' + y + ',' + z;
      if (_repeaterStates[key]) {
        _repeaterStates[key].locked = locked;
      }
    }

    /**
     * Get the repeater state at a position.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @returns {Object|null}
     */
    function getRepeaterState(x, y, z) {
      return _repeaterStates[x + ',' + y + ',' + z] || null;
    }

    /**
     * Get the comparator state at a position.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @returns {Object|null}
     */
    function getComparatorState(x, y, z) {
      return _comparatorStates[x + ',' + y + ',' + z] || null;
    }

    /**
     * Clear all repeater and comparator states.
     */
    function clearAllStates() {
      _repeaterStates = {};
      _comparatorStates = {};
    }

    /**
     * Destroy the system: clear all state.
     */
    function destroy() {
      clearAllStates();
    }

    return {
      init: init,
      setRepeaterDelay: setRepeaterDelay,
      setComparatorMode: setComparatorMode,
      lockRepeater: lockRepeater,
      getRepeaterState: getRepeaterState,
      getComparatorState: getComparatorState,
      clearAllStates: clearAllStates,
      _processRepeater: _processRepeater,
      _processComparator: _processComparator,
      destroy: destroy,
    };
  })();
})();
