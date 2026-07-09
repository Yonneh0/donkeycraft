// Donkeycraft — Redstone Engine
// Core redstone tick system: updates at game speed (20 TPS), signal propagation order, manages all redstone subsystems.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

  // ============================================================
  // RedstoneEngine — central redstone tick orchestrator
  // ============================================================

  /**
   * RedstoneEngine — manages redstone signal propagation, tick scheduling,
   * and coordination between all redstone subsystems (wiring, repeaters,
   * comparators, observers, pistons, TNT).
   */
  Donkeycraft.RedstoneEngine = (function () {
    // Dirty redstone block queue: array of {x, y, z, chunkX, chunkZ}
    var _dirtyQueue = [];

    // Whether the engine is actively processing ticks
    var _running = false;

    // Current tick counter
    var _currentTick = 0;

    // Optional EventBus for cross-system communication
    var _eventBus = null;

    // Optional ChunkManager reference for chunk access
    var _chunkManager = null;

    // Timer reference (required for tick scheduling)
    var _timer = null;

    // Subsystem references (set via setters)
    var _wiring = null;
    var _repeaterComparator = null;
    var _observers = null;
    var _pistons = null;
    var _tnt = null;

    /**
     * Set the event bus for communication.
     * @param {Donkeycraft.EventBus} bus
     */
    function setEventBus(bus) {
      _eventBus = bus;
    }

    /**
     * Set the chunk manager reference.
     * @param {Donkeycraft.ChunkManager} cm
     */
    function setChunkManager(cm) {
      _chunkManager = cm;
    }

    /**
     * Set the wiring subsystem.
     * @param {Object} wiring
     */
    function setWiring(wiring) {
      _wiring = wiring;
    }

    /**
     * Set the repeater/comparator subsystem.
     * @param {Object} rc
     */
    function setRepeaterComparator(rc) {
      _repeaterComparator = rc;
    }

    /**
     * Set the observers subsystem.
     * @param {Object} obs
     */
    function setObservers(obs) {
      _observers = obs;
    }

    /**
     * Set the pistons subsystem.
     * @param {Object} pist
     */
    function setPistons(pist) {
      _pistons = pist;
    }

    /**
     * Set the TNT subsystem.
     * @param {Object} tnt
     */
    function setTNT(tnt) {
      _tnt = tnt;
    }

    /**
     * Set the timer reference for tick scheduling.
     * @param {Donkeycraft.Timer} timer - Timer instance.
     */
    function setTimer(timer) {
      _timer = timer;
    }

    /**
     * Start the redstone engine tick loop.
     * @returns {Function} Unsubscribe function.
     */
    function start() {
      if (_running || !_timer) return function () {};

      _running = true;

      var unsubscribe = _timer.onTick(function (dt, tickCount) {
        _currentTick = tickCount;
        _processTick();
      });

      return unsubscribe;
    }

    /**
     * Stop the redstone engine.
     */
    function stop() {
      _running = false;
    }

    /**
     * Process a single redstone tick.
     * @private
     */
    function _processTick() {
      if (!_running) return;

      // Process dirty queue in priority order:
      // 1. TNT fuses (time-critical)
      // 2. Observers (immediate response)
      // 3. Repeaters/Comparators (delayed signal)
      // 4. Pistons (mechanical action)
      // 5. Wiring (signal propagation)

      var processedKeys = [];

      // Process each dirty block
      while (_dirtyQueue.length > 0) {
        var entry = _dirtyQueue.shift();
        if (!entry) continue;

        // Deduplicate by full position key (x,y,z), not just chunk key
        var posKey = entry.x + ',' + entry.y + ',' + entry.z;
        if (processedKeys.indexOf(posKey) !== -1) continue;
        processedKeys.push(posKey);

        var chunk = _getChunk(entry.chunkX, entry.chunkZ);
        if (!chunk) continue;

        var blockId = chunk.getBlock(entry.x, entry.y, entry.z);

        // Route to appropriate subsystem based on block type
        switch (blockId) {
          case 173: // redstone_wire
          case 229: // redstone_dust
            if (_wiring && _wiring._processDirtyWire)
              _wiring._processDirtyWire(entry, chunk);
            break;
          case 174: // redstone_torch
            if (_wiring && _wiring._processTorch)
              _wiring._processTorch(entry, chunk);
            break;
          case 180: // repeater
            if (_repeaterComparator && _repeaterComparator._processRepeater)
              _repeaterComparator._processRepeater(entry, chunk);
            break;
          case 232: // comparator
            if (_repeaterComparator && _repeaterComparator._processComparator)
              _repeaterComparator._processComparator(entry, chunk);
            break;
          case 179: // observer
            if (_observers && _observers._processObserver)
              _observers._processObserver(entry, chunk);
            break;
          case 181: // piston
          case 182: // sticky_piston
            if (_pistons && _pistons._processPiston)
              _pistons._processPiston(entry, chunk);
            break;
          case 183: // tnt
            if (_tnt && _tnt._processTNT) _tnt._processTNT(entry, chunk);
            break;
        }
      }

      // Emit redstone:tick event for debugging
      if (_eventBus) {
        try {
          _eventBus.emit('redstone:tick', _currentTick, _dirtyQueue.length);
        } catch (e) {
          // EventBus may not be available in tests
        }
      }
    }

    /**
     * Mark a redstone block as dirty and queue it for processing.
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     */
    function markDirty(x, y, z) {
      var chunkKey = Donkeycraft.WorldUtils.makeChunkKey(
        Math.floor(x / CHUNK_SIZE),
        Math.floor(z / CHUNK_SIZE)
      );

      // Avoid duplicate entries in queue
      for (var i = 0; i < _dirtyQueue.length; i++) {
        if (
          _dirtyQueue[i].chunkKey === chunkKey &&
          _dirtyQueue[i].x === x &&
          _dirtyQueue[i].y === y &&
          _dirtyQueue[i].z === z
        ) {
          return;
        }
      }

      _dirtyQueue.push({
        x: x,
        y: y,
        z: z,
        chunkX: Math.floor(x / CHUNK_SIZE),
        chunkZ: Math.floor(z / CHUNK_SIZE),
        chunkKey: chunkKey,
      });
    }

    /**
     * Mark a range of blocks as dirty (for bulk updates).
     * @param {number} startX - Start X.
     * @param {number} startY - Start Y.
     * @param {number} startZ - Start Z.
     * @param {number} endX - End X.
     * @param {number} endY - End Y.
     * @param {number} endZ - End Z.
     */
    function markDirtyRange(startX, startY, startZ, endX, endY, endZ) {
      var minX = Math.min(startX, endX),
        maxX = Math.max(startX, endX);
      var minY = Math.min(startY, endY),
        maxY = Math.max(startY, endY);
      var minZ = Math.min(startZ, endZ),
        maxZ = Math.max(startZ, endZ);

      for (var x = minX; x <= maxX; x++) {
        for (var y = minY; y <= maxY; y++) {
          for (var z = minZ; z <= maxZ; z++) {
            markDirty(x, y, z);
          }
        }
      }
    }

    /**
     * Get a chunk by global coordinates.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {Donkeycraft.Chunk|null}
     * @private
     */
    function _getChunk(chunkX, chunkZ) {
      if (_chunkManager) {
        return _chunkManager.getChunk(chunkX, chunkZ);
      }
      return null;
    }

    /**
     * Get the current dirty queue length.
     * @returns {number}
     */
    function getDirtyQueueLength() {
      return _dirtyQueue.length;
    }

    /**
     * Clear the dirty queue.
     */
    function clearDirtyQueue() {
      _dirtyQueue = [];
    }

    /**
     * Get the current tick count.
     * @returns {number}
     */
    function getCurrentTick() {
      return _currentTick;
    }

    /**
     * Check if the engine is running.
     * @returns {boolean}
     */
    function isRunning() {
      return _running;
    }

    /**
     * Destroy the engine: stop ticks, clear state.
     */
    function destroy() {
      _running = false;
      _timer = null;
      _dirtyQueue = [];
      _eventBus = null;
      _chunkManager = null;
      _wiring = null;
      _repeaterComparator = null;
      _observers = null;
      _pistons = null;
      _tnt = null;
    }

    return {
      setEventBus: setEventBus,
      setChunkManager: setChunkManager,
      setWiring: setWiring,
      setRepeaterComparator: setRepeaterComparator,
      setObservers: setObservers,
      setPistons: setPistons,
      setTNT: setTNT,
      setTimer: setTimer,
      start: start,
      stop: stop,
      markDirty: markDirty,
      markDirtyRange: markDirtyRange,
      getDirtyQueueLength: getDirtyQueueLength,
      clearDirtyQueue: clearDirtyQueue,
      getCurrentTick: getCurrentTick,
      isRunning: isRunning,
      _processTick: _processTick,
      destroy: destroy,
    };
  })();
})();
