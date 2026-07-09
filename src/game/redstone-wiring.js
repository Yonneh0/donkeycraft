// Donkeycraft — Redstone Wiring
// Redstone dust/wire: signal strength (0-15), branching, underground routing, power calculation.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

  // Block IDs for redstone dust/wire
  var REDSTONE_WIRE = 173;
  var REDSTONE_DUST = 229;
  var REDSTONE_TORCH = 174;
  var REDSTONE_LAMP = 175;
  var LIT_REDSTONE_LAMP = 176;
  var REDSTONE_BLOCK = 230;

  // All redstone wire block IDs
  var WIRE_BLOCK_IDS = {};
  WIRE_BLOCK_IDS[REDSTONE_WIRE] = true;
  WIRE_BLOCK_IDS[REDSTONE_DUST] = true;

  // ============================================================
  // RedstoneWiring — signal propagation for redstone dust/wire
  // ============================================================

  /**
   * RedstoneWiring — manages redstone dust signal strength, branching,
   * underground routing, and power source detection.
   */
  Donkeycraft.RedstoneWiring = (function () {
    // Signal strength storage: Map<chunkKey, Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)>
    var _signalStrengths = {};

    // Redstone torch states: Map<"x,y,z", { powered: boolean, tick: number }}
    var _torchStates = {};

    // Maximum signal distance
    var MAX_SIGNAL_DISTANCE = 15;

    /**
     * Initialize the wiring system: create signal strength maps for existing chunks.
     */
    function init() {
      // Signal strengths are created lazily when first needed
    }

    /**
     * Get the signal strength at a global position.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @returns {number} Signal strength (0-15).
     */
    function getSignalStrength(x, y, z) {
      var chunkX = Math.floor(x / CHUNK_SIZE);
      var localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var chunkZ = Math.floor(z / CHUNK_SIZE);
      var localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      // Use ChunkManager via global reference set by game.js
      var chunkManager = _getChunkManager();
      if (!chunkManager) return 0;

      var chunk = chunkManager.getChunk(chunkX, chunkZ);
      if (!chunk) return 0;

      var blockId = chunk.getBlock(localX, y, localZ);
      if (!WIRE_BLOCK_IDS[blockId]) return 0;

      var chunkKey = Donkeycraft.WorldUtils.makeChunkKey(chunkX, chunkZ);
      if (!_signalStrengths[chunkKey]) return 0;

      var idx = y * CHUNK_SIZE * CHUNK_SIZE + localX * CHUNK_SIZE + localZ;
      return _signalStrengths[chunkKey][idx] || 0;
    }

    /**
     * Set the signal strength at a global position.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} strength - Signal strength (0-15).
     */
    function setSignalStrength(x, y, z, strength) {
      strength = Math.max(0, Math.min(15, strength));

      var chunkX = Math.floor(x / CHUNK_SIZE);
      var localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var chunkZ = Math.floor(z / CHUNK_SIZE);
      var localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var chunkManager = _getChunkManager();
      if (!chunkManager) return;

      var chunk = chunkManager.getChunk(chunkX, chunkZ);
      if (!chunk) return;

      var blockId = chunk.getBlock(localX, y, localZ);
      if (!WIRE_BLOCK_IDS[blockId]) return;

      var chunkKey = Donkeycraft.WorldUtils.makeChunkKey(chunkX, chunkZ);
      if (!_signalStrengths[chunkKey]) {
        _signalStrengths[chunkKey] = new Uint8Array(
          CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
        );
      }

      var idx = y * CHUNK_SIZE * CHUNK_SIZE + localX * CHUNK_SIZE + localZ;
      _signalStrengths[chunkKey][idx] = strength;

      // Mark adjacent wires as dirty for propagation
      _queueAdjacentDirty(x, y, z);
    }

    /**
     * Get the current signal strength at position (convenience).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @returns {number} Signal strength (0-15).
     */
    function getStrengthAt(x, y, z) {
      return getSignalStrength(x, y, z);
    }

    /**
     * Process a dirty redstone wire block.
     * @param {Object} entry - {x, y, z, chunkX, chunkZ}.
     * @param {Donkeycraft.Chunk} chunk - The chunk containing the block.
     * @private
     */
    function _processDirtyWire(entry, chunk) {
      var localX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var localZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var blockId = chunk.getBlock(localX, entry.y, localZ);
      if (!WIRE_BLOCK_IDS[blockId]) return;

      // Calculate signal strength from neighbors and power sources
      var newStrength = _calculateWireStrength(
        entry.x,
        entry.y,
        entry.z,
        chunk
      );

      var chunkKey = Donkeycraft.WorldUtils.makeChunkKey(
        entry.chunkX,
        entry.chunkZ
      );
      if (!_signalStrengths[chunkKey]) {
        _signalStrengths[chunkKey] = new Uint8Array(
          CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
        );
      }

      var idx =
        entry.y * CHUNK_SIZE * CHUNK_SIZE + localX * CHUNK_SIZE + localZ;
      var oldStrength = _signalStrengths[chunkKey][idx] || 0;

      if (newStrength !== oldStrength) {
        _signalStrengths[chunkKey][idx] = newStrength;

        // Update connected redstone lamps
        _updateConnectedLamps(entry.x, entry.y, entry.z, newStrength);

        // Emit event for rendering updates
        if (
          Donkeycraft.RedstoneEngine &&
          Donkeycraft.RedstoneEngine.setEventBus
        ) {
          // Signal changed — propagate to neighbors
        }
      }
    }

    /**
     * Calculate the signal strength for a wire block based on power sources and neighbors.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @returns {number} New signal strength (0-15).
     * @private
     */
    function _calculateWireStrength(x, y, z, chunk) {
      var maxStrength = 0;

      // Check all 6 adjacent blocks for power sources and connected wires
      var neighbors = [
        { dx: 0, dy: -1, dz: 0 }, // below
        { dx: 0, dy: 1, dz: 0 }, // above
        { dx: 1, dy: 0, dz: 0 }, // east
        { dx: -1, dy: 0, dz: 0 }, // west
        { dx: 0, dy: 0, dz: 1 }, // south
        { dx: 0, dy: 0, dz: -1 }, // north
      ];

      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        var nx = x + n.dx;
        var ny = y + n.dy;
        var nz = z + n.dz;

        var nChunkX = Math.floor(nx / CHUNK_SIZE);
        var nLocalX = ((nx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        var nChunkZ = Math.floor(nz / CHUNK_SIZE);
        var nLocalZ = ((nz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        var nChunk = _getChunk(nChunkX, nChunkZ);
        if (!nChunk) continue;

        var nBlockId = nChunk.getBlock(nLocalX, ny, nLocalZ);

        // Check for solid power sources (blocks adjacent to wire)
        if (_isSolidPowerSource(nBlockId)) {
          var sourceStrength = _getPowerSourceStrength(nBlockId);
          if (sourceStrength > maxStrength) {
            maxStrength = sourceStrength;
          }
          continue;
        }

        // Check for redstone dust/wire (signal propagates through connected wires)
        if (WIRE_BLOCK_IDS[nBlockId]) {
          var nChunkKey = Donkeycraft.WorldUtils.makeChunkKey(nChunkX, nChunkZ);
          var wireStrength = 0;
          if (_signalStrengths[nChunkKey]) {
            var nIdx =
              ny * CHUNK_SIZE * CHUNK_SIZE + nLocalX * CHUNK_SIZE + nLocalZ;
            wireStrength = _signalStrengths[nChunkKey][nIdx] || 0;
          }

          // Wire-to-wire signal: neighbor strength - 1 (decay)
          var propagatedStrength = wireStrength - 1;
          if (propagatedStrength > maxStrength && n.dy >= 0) {
            maxStrength = propagatedStrength;
          }
        }

        // Check for redstone torches (including side attachment)
        if (nBlockId === REDSTONE_TORCH) {
          // Torch on side or above: emits signal
          if (n.dy !== -1 || _isTorchAttached(nx, ny, nz, nChunk)) {
            var torchStr = _getTorchSignalStrength(nx, ny, nz);
            if (torchStr > maxStrength) {
              maxStrength = torchStr;
            }
          }
        }

        // Redstone block is a constant 15-strength source
        if (nBlockId === REDSTONE_BLOCK) {
          if (15 > maxStrength) {
            maxStrength = 15;
          }
        }
      }

      return Math.max(0, Math.min(15, maxStrength));
    }

    /**
     * Check if a block is a solid power source (emits signal to adjacent wire).
     * Redstone blocks emit constant 15-strength signals.
     * Lit redstone lamps also count as power sources.
     * @param {number} blockId - Block ID.
     * @returns {boolean}
     * @private
     */
    function _isSolidPowerSource(blockId) {
      // Redstone block is a constant strong source
      if (blockId === REDSTONE_BLOCK) return true;

      // Lit redstone lamp emits signal
      if (blockId === LIT_REDSTONE_LAMP) return true;

      // Unlit redstone lamp does not emit to wires
      if (blockId === REDSTONE_LAMP) return false;

      return false;
    }

    /**
     * Get the signal strength emitted by a power source block.
     * Redstone blocks emit full 15-strength signals.
     * Lit redstone lamps emit 15-strength signals.
     * @param {number} blockId - Block ID.
     * @returns {number} Signal strength (0-15).
     * @private
     */
    function _getPowerSourceStrength(blockId) {
      if (blockId === REDSTONE_BLOCK) return 15;
      if (blockId === LIT_REDSTONE_LAMP) return 15;
      return 0;
    }

    /**
     * Check if a redstone torch is properly attached to a block.
     * Torches can attach to solid opaque blocks on any side.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @returns {boolean}
     * @private
     */
    function _isTorchAttached(x, y, z, chunk) {
      // Check if there's a solid block below the torch
      if (y <= 0) return false;

      var chunkX = Math.floor(x / CHUNK_SIZE);
      var localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var chunkZ = Math.floor(z / CHUNK_SIZE);
      var localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var belowBlock = chunk.getBlock(localX, y - 1, localZ);
      if (!belowBlock) return false;

      // Torches can attach to most solid blocks (non-transparent)
      try {
        return !Donkeycraft.BlockRegistry.isTransparent(belowBlock);
      } catch (e) {
        // Fallback: assume opaque for safety
        return true;
      }
    }

    /**
     * Get the signal strength of a redstone torch (varies with powered state).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @returns {number} Torch signal strength (1 if unpowered, 0 if powered).
     * @private
     */
    function _getTorchSignalStrength(x, y, z) {
      var key = x + ',' + y + ',' + z;
      var state = _torchStates[key];

      if (state && state.powered) {
        return 0; // Powered torch is off
      }

      return 15; // Unpowered torch emits full signal
    }

    /**
     * Process a redstone torch: update its state and signal.
     * @param {Object} entry - {x, y, z, chunkX, chunkZ}.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @private
     */
    function _processTorch(entry, chunk) {
      var localX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var localZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      if (chunk.getBlock(localX, entry.y, localZ) !== REDSTONE_TORCH) return;

      var key = entry.x + ',' + entry.y + ',' + entry.z;

      // Check if the block below the torch is powered
      var belowChunkX = Math.floor(entry.x / CHUNK_SIZE);
      var belowLocalX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      var belowChunkZ = Math.floor(entry.z / CHUNK_SIZE);
      var belowLocalZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      var belowChunk = _getChunk(belowChunkX, belowChunkZ);
      if (!belowChunk) return;

      if (entry.y <= 0) return;

      var belowBlockId = belowChunk.getBlock(
        belowLocalX,
        entry.y - 1,
        belowLocalZ
      );

      // Check if below block is powered (has signal strength > 0)
      var belowPowered = false;
      if (WIRE_BLOCK_IDS[belowBlockId]) {
        var belowChunkKey = Donkeycraft.WorldUtils.makeChunkKey(
          belowChunkX,
          belowChunkZ
        );
        if (_signalStrengths[belowChunkKey]) {
          var belowIdx =
            (entry.y - 1) * CHUNK_SIZE * CHUNK_SIZE +
            belowLocalX * CHUNK_SIZE +
            belowLocalZ;
          belowPowered = (_signalStrengths[belowChunkKey][belowIdx] || 0) > 0;
        }
      }

      // Also check for other power sources below
      if (!belowPowered && _isSolidPowerSource(belowBlockId)) {
        belowPowered = true;
      }

      var newState = belowPowered;

      if (_torchStates[key] && _torchStates[key].powered === newState) {
        return; // No change
      }

      _torchStates[key] = {
        powered: newState,
        tick: Donkeycraft.RedstoneEngine
          ? Donkeycraft.RedstoneEngine.getCurrentTick()
          : 0,
      };

      // Mark this torch's position as dirty to propagate signal change
      Donkeycraft.RedstoneEngine.markDirty(entry.x, entry.y, entry.z);
    }

    /**
     * Update connected redstone lamps based on signal strength.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {number} strength - Signal strength.
     * @private
     */
    function _updateConnectedLamps(x, y, z, strength) {
      // Check adjacent blocks for redstone lamps
      var lampOffsets = [
        { dx: 0, dy: 1, dz: 0 }, // above
        { dx: 0, dy: -1, dz: 0 }, // below
      ];

      for (var i = 0; i < lampOffsets.length; i++) {
        var off = lampOffsets[i];
        var lx = x + off.dx;
        var ly = y + off.dy;
        var lz = z + off.dz;

        var lChunkX = Math.floor(lx / CHUNK_SIZE);
        var lLocalX = ((lx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        var lChunkZ = Math.floor(lz / CHUNK_SIZE);
        var lLocalZ = ((lz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        var lChunk = _getChunk(lChunkX, lChunkZ);
        if (!lChunk) continue;

        var lBlockId = lChunk.getBlock(lLocalX, ly, lLocalZ);

        if (lBlockId === REDSTONE_LAMP || lBlockId === LIT_REDSTONE_LAMP) {
          // Update lamp state: turn on if strength > 0
          var shouldLit = strength > 0;

          // Check if state needs changing
          var currentLit = lBlockId === LIT_REDSTONE_LAMP;
          if (shouldLit !== currentLit) {
            // Set new block state
            lChunk.setBlock(
              lLocalX,
              ly,
              lLocalZ,
              shouldLit ? LIT_REDSTONE_LAMP : REDSTONE_LAMP
            );

            // Mark for mesh update via chunk manager
            if (Donkeycraft.ChunkManager) {
              var cm = _getChunkManager();
              if (cm) {
                cm.markDirty(lChunkX, lLocalX, ly, lChunkZ, lLocalZ);
              }
            }
          }
        }
      }
    }

    /**
     * Queue adjacent wire blocks as dirty for next tick.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @private
     */
    function _queueAdjacentDirty(x, y, z) {
      var offsets = [
        { dx: 1, dy: 0, dz: 0 },
        { dx: -1, dy: 0, dz: 0 },
        { dx: 0, dy: 0, dz: 1 },
        { dx: 0, dy: 0, dz: -1 },
        { dx: 0, dy: 1, dz: 0 },
      ];

      for (var i = 0; i < offsets.length; i++) {
        var off = offsets[i];
        Donkeycraft.RedstoneEngine.markDirty(
          x + off.dx,
          y + off.dy,
          z + off.dz
        );
      }
    }

    /**
     * Get a chunk by global coordinates.
     * @param {number} chunkX - Chunk X.
     * @param {number} chunkZ - Chunk Z.
     * @returns {Donkeycraft.Chunk|null}
     * @private
     */
    function _getChunk(chunkX, chunkZ) {
      var cm = _getChunkManager();
      if (!cm) return null;
      return cm.getChunk(chunkX, chunkZ);
    }

    /**
     * Get the chunk manager reference from RedstoneEngine.
     * @returns {Donkeycraft.ChunkManager|null}
     * @private
     */
    function _getChunkManager() {
      // Access via the engine's internal reference
      // This is set via setChunkManager()
      if (Donkeycraft._redstoneChunkManager) {
        return Donkeycraft._redstoneChunkManager;
      }
      return null;
    }

    /**
     * Set the chunk manager reference.
     * @param {Donkeycraft.ChunkManager} cm
     */
    function setChunkManager(cm) {
      Donkeycraft._redstoneChunkManager = cm;
    }

    /**
     * Get all wire block IDs.
     * @returns {Object.<number>}
     */
    function getWireBlockIds() {
      return WIRE_BLOCK_IDS;
    }

    /**
     * Get the maximum signal distance.
     * @returns {number}
     */
    function getMaxSignalDistance() {
      return MAX_SIGNAL_DISTANCE;
    }

    /**
     * Clear all signal strength data.
     */
    function clearAllSignals() {
      _signalStrengths = {};
      _torchStates = {};
    }

    /**
     * Destroy the wiring system: clear all state.
     */
    function destroy() {
      clearAllSignals();
      Donkeycraft._redstoneChunkManager = null;
    }

    return {
      init: init,
      setChunkManager: setChunkManager,
      getSignalStrength: getSignalStrength,
      setSignalStrength: setSignalStrength,
      getStrengthAt: getStrengthAt,
      getWireBlockIds: getWireBlockIds,
      getMaxSignalDistance: getMaxSignalDistance,
      clearAllSignals: clearAllSignals,
      _processDirtyWire: _processDirtyWire,
      _processTorch: _processTorch,
      destroy: destroy,
    };
  })();
})();
