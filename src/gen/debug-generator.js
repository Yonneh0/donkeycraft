// Donkeycraft — Debug Terrain Generator
// Generates a test area with bedrock ring, flat platform, block perimeter, and entity animation testing arena.
// Toggle via debug overlay button.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  if (!Donkeycraft) return;
  var Config = Donkeycraft.Config;

  // ============================================================
  // Constants
  // ============================================================

  /** Test area flat platform size (blocks) — fits within 5x5 chunk grid (-32 to 47 coverage). */
  var DEBUG_PLATFORM_SIZE = 32;

  /** Bedrock ring outer radius (blocks) — fits within 5x5 chunk grid. */
  var DEBUG_BEDROCK_RING_RADIUS = 28;

  /** Bedrock ring thickness (blocks). */
  var DEBUG_BEDROCK_RING_THICKNESS = 4;

  /** Platform Y level. */
  var DEBUG_PLATFORM_Y = 63;

  /** Center chunk coordinates. */
  var DEBUG_CENTER_CHUNK_X = 0;
  var DEBUG_CENTER_CHUNK_Z = 0;

  /** Chunk offsets for the 5x5 grid around center (covers -32 to 47, enough for 38-block platform). */
  var DEBUG_CHUNK_OFFSETS = [-2, -1, 0, 1, 2];

  /** Player teleport Y offset from platform. */
  var DEBUG_PLAYER_TELEPORT_Y_OFFSET = 3;

  /** Entity arena size (blocks). */
  var DEBUG_ENTITY_ARENA_SIZE = 16;

  /** Entity animation cycle interval (seconds). */
  var DEBUG_ENTITY_CYCLE_INTERVAL = 4.0;

  // Entity types to spawn for animation testing (one of each from EntityTypeDB)
  var DEBUG_ENTITY_TYPES = [
    { type: 'cow', skeleton: 'quadruped', anim: 'quadrupedWalk', x: -6, z: -6 },
    { type: 'pig', skeleton: 'quadruped', anim: 'quadrupedWalk', x: -3, z: -6 },
    { type: 'chicken', skeleton: 'small', anim: 'chickenBob', x: 0, z: -6 },
    { type: 'zombie', skeleton: 'bipedal', anim: 'walk', x: 3, z: -6 },
    { type: 'skeleton', skeleton: 'bipedal', anim: 'walk', x: 6, z: -6 },
    { type: 'creeper', skeleton: 'bipedal', anim: 'walk', x: -6, z: -3 },
    {
      type: 'spider',
      skeleton: 'quadruped',
      anim: 'quadrupedWalk',
      x: -3,
      z: -3,
    },
    { type: 'enderman', skeleton: 'bipedal', anim: 'walk', x: 0, z: -3 },
    { type: 'npc', skeleton: 'bipedal', anim: 'attack', x: 3, z: -3 },
    { type: 'player', skeleton: 'bipedal', anim: 'run', x: 6, z: -3 },
  ];

  // ============================================================
  // State
  // ============================================================

  /** Saved chunk data map: key "chunkX,chunkZ" → { blocks, skyLight, blockLight, generated, biomeId, heightmap }. */
  var _savedChunks = new Map();

  /** Whether debug terrain is currently active. */
  var _isActive = false;

  /** Player original position before teleport. */
  var _playerOriginalPos = null;

  /** Spawned entity IDs for cleanup. */
  var _debugEntityIds = [];

  /** Keys of affected chunks for cleanup. */
  var _debugChunkKeys = [];

  /** Reference to the game instance (set via init). */
  var _gameInstance = null;

  /** Reference to the chunk manager (set via init). */
  var _chunkManagerRef = null;

  /** Reference to the entity manager (set via init). */
  var _entityManagerRef = null;

  /** Reference to the entity engine (set via init). */
  var _entityEngineRef = null;

  /** Reference to the event bus (set via init). */
  var _eventBusRef = null;

  // ============================================================
  // Initialization
  // ============================================================

  /**
   * init — Wire up references needed by the debug generator.
   * @param {Object} game - Game instance.
   * @param {Object} chunkManager - ChunkManager instance.
   * @param {Object} entityManager - EntityManager instance.
   * @param {Object} entityEngine - EntityEngine instance.
   * @param {Object} eventBus - EventBus instance.
   */
  Donkeycraft.DebugTerrainGenerator = function () {
    this.initialized = false;
  };

  /**
   * setReferences — Wire up external references.
   * @param {Object} game - Game instance.
   * @param {Object} chunkManager - ChunkManager instance.
   * @param {Object} entityManager - EntityManager instance.
   * @param {Object} entityEngine - EntityEngine instance.
   * @param {Object} eventBus - EventBus instance.
   */
  Donkeycraft.DebugTerrainGenerator.setReferences = function (
    game,
    chunkManager,
    entityManager,
    entityEngine,
    eventBus
  ) {
    _gameInstance = game;
    _chunkManagerRef = chunkManager;
    _entityManagerRef = entityManager;
    _entityEngineRef = entityEngine;
    _eventBusRef = eventBus;
  };

  /**
   * isDebugTerrainActive — Check if debug terrain is currently enabled.
   * @returns {boolean}
   */
  Donkeycraft.DebugTerrainGenerator.isDebugTerrainActive = function () {
    return _isActive;
  };

  // ============================================================
  // Toggle
  // ============================================================

  /**
   * toggle — Enable or disable debug terrain.
   * @param {boolean} [forceState] - Optional force state (true=enable, false=disable). If undefined, toggles current state.
   * @returns {boolean} True if the operation succeeded.
   */
  Donkeycraft.DebugTerrainGenerator.toggle = function (forceState) {
    var enable = forceState !== undefined ? forceState : !_isActive;

    if (enable) {
      return _enableDebugTerrain();
    } else {
      return _disableDebugTerrain();
    }
  };

  // ============================================================
  // Enable Debug Terrain
  // ============================================================

  /**
   * _enableDebugTerrain — Activate debug terrain generator.
   * @returns {boolean} True if successful.
   * @private
   */
  function _enableDebugTerrain() {
    if (_isActive) {
      Donkeycraft.Logger.warn(
        'DebugTerrainGenerator',
        'Debug terrain is already active'
      );
      return false;
    }

    if (!_chunkManagerRef) {
      Donkeycraft.Logger.error(
        'DebugTerrainGenerator',
        'Chunk manager reference not set'
      );
      return false;
    }

    // Save player position
    var player = null;
    try {
      if (_gameInstance && _gameInstance._player) {
        player = _gameInstance._player;
      }
    } catch (e) {}

    if (player) {
      var pos = player.getPosition();
      if (pos) {
        _playerOriginalPos = { x: pos.x, y: pos.y, z: pos.z };
      }
    }

    // Save the 9 center chunks and build debug terrain
    var success = _saveAndReplaceChunks();
    if (!success) {
      Donkeycraft.Logger.error(
        'DebugTerrainGenerator',
        'Failed to save/replace chunks'
      );
      return false;
    }

    // Teleport player to center
    if (player) {
      var teleportY = DEBUG_PLATFORM_Y + DEBUG_PLAYER_TELEPORT_Y_OFFSET;
      player.setPosition(0.5, teleportY, 0.5);
      try {
        if (_gameInstance && _gameInstance._camera) {
          _gameInstance._camera.setPosition(
            0.5,
            teleportY + Config.PLAYER_EYE_HEIGHT,
            0.5
          );
        }
      } catch (e) {}
    }

    // Spawn debug entities
    _spawnDebugEntities();

    _isActive = true;

    Donkeycraft.Logger.info('DebugTerrainGenerator', 'Debug terrain enabled');

    if (_eventBusRef) {
      try {
        _eventBusRef.emit('debug:terrain:enabled', {});
      } catch (e) {}
    }

    return true;
  }

  /**
   * _saveAndReplaceChunks — Save center 9 chunks and replace with debug terrain.
   * @returns {boolean} True if successful.
   * @private
   */
  function _saveAndReplaceChunks() {
    // Iterate over the 3x3 chunk grid
    for (var ix = 0; ix < DEBUG_CHUNK_OFFSETS.length; ix++) {
      for (var iz = 0; iz < DEBUG_CHUNK_OFFSETS.length; iz++) {
        var cx = DEBUG_CENTER_CHUNK_X + DEBUG_CHUNK_OFFSETS[ix];
        var cz = DEBUG_CENTER_CHUNK_Z + DEBUG_CHUNK_OFFSETS[iz];
        var key = cx + ',' + cz;

        // Get the existing chunk and save its data
        var chunk = _chunkManagerRef.getChunk
          ? _chunkManagerRef.getChunk(cx, cz)
          : null;
        if (!chunk) continue;

        // Save chunk data
        _savedChunks.set(key, {
          blocks: new Uint16Array(chunk.blocks),
          skyLight: new Uint8Array(chunk.skyLight),
          blockLight: new Uint8Array(chunk.blockLight),
          generated: chunk.generated,
          biomeId: chunk.biomeId,
          heightmap: chunk.heightmap ? new Uint16Array(chunk.heightmap) : null,
          chunkX: cx,
          chunkZ: cz,
        });
        _debugChunkKeys.push(key);

        // Build debug terrain directly into this chunk (don't call getChunk again!)
        _buildDebugTerrainIntoChunk(chunk, cx, cz);
      }
    }

    // Mark all chunks dirty on the terrain renderer and force immediate mesh rebuild
    try {
      if (_gameInstance && _gameInstance._terrainRenderer) {
        var tr = _gameInstance._terrainRenderer;
        // First, mark each affected chunk as dirty on the terrain renderer
        for (var i = 0; i < _debugChunkKeys.length; i++) {
          var savedData = _savedChunks.get(_debugChunkKeys[i]);
          if (savedData && tr.markChunkDirty) {
            tr.markChunkDirty(savedData.chunkX, savedData.chunkZ);
          }
          // Also mark the chunk object itself as generated
          var chunk = _chunkManagerRef.getChunkIfExists
            ? _chunkManagerRef.getChunkIfExists(
                savedData.chunkX,
                savedData.chunkZ
              )
            : null;
          if (chunk) {
            chunk.generated = true;
          }
        }
        // Then trigger updateChunks which will rebuild all dirty chunks
        if (tr.updateChunks) {
          tr.updateChunks(0, 0);
        }
      }
    } catch (e) {}

    return true;
  }

  /**
   * _buildDebugTerrainIntoChunk — Build debug terrain directly into an existing chunk.
   * @param {Object} chunk - The chunk to build into.
   * @param {number} chunkX - Chunk X coordinate.
   * @param {number} chunkZ - Chunk Z coordinate.
   * @private
   */
  function _buildDebugTerrainIntoChunk(chunk, chunkX, chunkZ) {
    var worldStartX = chunkX * (Config.CHUNK_SIZE || 16);
    var worldStartZ = chunkZ * (Config.CHUNK_SIZE || 16);

    // First clear the chunk
    chunk.blocks.fill(0);
    chunk.skyLight.fill(0);
    chunk.blockLight.fill(0);

    // Iterate over local block coordinates
    for (var lx = 0; lx < (Config.CHUNK_SIZE || 16); lx++) {
      for (var lz = 0; lz < (Config.CHUNK_SIZE || 16); lz++) {
        var worldX = worldStartX + lx;
        var worldZ = worldStartZ + lz;

        // Calculate distance from world center (0, 0)
        var distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);

        // Check if this block is in the bedrock ring area
        if (
          distFromCenter >=
            DEBUG_BEDROCK_RING_RADIUS - DEBUG_BEDROCK_RING_THICKNESS &&
          distFromCenter <= DEBUG_BEDROCK_RING_RADIUS
        ) {
          // Place bedrock blocks from bottom to top of world
          for (var by = 0; by < (Config.WORLD_HEIGHT || 256); by++) {
            chunk.setBlock(lx, by, lz, 1000); // Bedrock ID
          }
        }
      }
    }

    // Build platform and perimeter
    _buildPlatform(chunk, worldStartX, worldStartZ);
    _buildBlockPerimeter();
  }

  /**
   * _buildPlatform — Build the flat 38x38 platform.
   * @param {Object} chunk - The chunk to build in.
   * @param {number} worldStartX - World X start of the chunk.
   * @param {number} worldStartZ - World Z start of the chunk.
   * @private
   */
  function _buildPlatform(chunk, worldStartX, worldStartZ) {
    var halfSize = Math.floor(DEBUG_PLATFORM_SIZE / 2);
    var platStartX = -halfSize;
    var platStartZ = -halfSize;

    for (var lx = 0; lx < (Config.CHUNK_SIZE || 16); lx++) {
      for (var lz = 0; lz < (Config.CHUNK_SIZE || 16); lz++) {
        var worldX = worldStartX + lx;
        var worldZ = worldStartZ + lz;

        // Check if in platform area (relative to world center)
        if (
          worldX >= platStartX &&
          worldX < platStartX + DEBUG_PLATFORM_SIZE &&
          worldZ >= platStartZ &&
          worldZ < platStartZ + DEBUG_PLATFORM_SIZE
        ) {
          // Place stone platform blocks at platform Y level
          chunk.setBlock(lx, DEBUG_PLATFORM_Y, lz, 1); // Stone ID

          // Fill below with dirt/stone
          for (var by = DEBUG_PLATFORM_Y - 1; by >= 0; by--) {
            if (by < 10) {
              chunk.setBlock(lx, by, lz, 5); // Deepslate
            } else if (by < 40) {
              chunk.setBlock(lx, by, lz, 1); // Stone
            } else {
              chunk.setBlock(lx, by, lz, 7); // Dirt
            }
          }

          // Water below platform
          for (var wy = DEBUG_PLATFORM_Y - 1; wy >= 63; wy--) {
            // No water needed since platform is at y=63
          }
        }
      }
    }
  }

  /**
   * _buildBlockPerimeter — Place one of every block type around the platform edge.
   * Writes directly to chunks in _debugChunkKeys to avoid triggering regeneration.
   * @private
   */
  function _buildBlockPerimeter() {
    var halfSize = Math.floor(DEBUG_PLATFORM_SIZE / 2);
    var platStartX = -halfSize;
    var platStartZ = -halfSize;

    // Get all block IDs from BlockRegistry
    var blockIds = [];
    try {
      var allBlocks = Donkeycraft.BlockRegistry
        ? Donkeycraft.BlockRegistry.getAllBlocks()
        : null;
      if (allBlocks) {
        for (var i = 0; i < allBlocks.length; i++) {
          var bid = allBlocks[i].id;
          // Skip air, only include blocks with valid IDs
          if (bid > 0 && bid < 1000) {
            blockIds.push(bid);
          }
        }
      }
    } catch (e) {
      // Fallback: use common block IDs
      blockIds = [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
      ];
    }

    // Place blocks around the perimeter (top layer of platform)
    var yLevel = DEBUG_PLATFORM_Y + 1;
    var pedestalY = yLevel - 1;
    var perimeterBlockIndex = 0;

    for (var side = 0; side < 4; side++) {
      for (var i = 0; i < DEBUG_PLATFORM_SIZE; i++) {
        var wx, wz;

        switch (side) {
          case 0: // North edge (-Z)
            wx = platStartX + i;
            wz = platStartZ;
            break;
          case 1: // East edge (+X)
            wx = platStartX + DEBUG_PLATFORM_SIZE - 1;
            wz = platStartZ + i;
            break;
          case 2: // South edge (+Z)
            wx = platStartX + DEBUG_PLATFORM_SIZE - 1 - i;
            wz = platStartZ + DEBUG_PLATFORM_SIZE - 1;
            break;
          case 3: // West edge (-X)
            wx = platStartX;
            wz = platStartZ + DEBUG_PLATFORM_SIZE - 1 - i;
            break;
        }

        // Convert world coords to chunk-local
        var targetChunkX = Math.floor(wx / (Config.CHUNK_SIZE || 16));
        var targetChunkZ = Math.floor(wz / (Config.CHUNK_SIZE || 16));
        var localX =
          ((wx % (Config.CHUNK_SIZE || 16)) + (Config.CHUNK_SIZE || 16)) %
          (Config.CHUNK_SIZE || 16);
        var localZ =
          ((wz % (Config.CHUNK_SIZE || 16)) + (Config.CHUNK_SIZE || 16)) %
          (Config.CHUNK_SIZE || 16);

        // Use the pre-saved chunk keys to avoid triggering regeneration
        var targetKey = targetChunkX + ',' + targetChunkZ;
        var savedData = _savedChunks.get(targetKey);
        if (
          savedData &&
          blockIds[perimeterBlockIndex % blockIds.length] !== undefined
        ) {
          // Write directly to the saved chunk data
          var targetChunk = _chunkManagerRef.getChunkIfExists
            ? _chunkManagerRef.getChunkIfExists(targetChunkX, targetChunkZ)
            : null;
          if (targetChunk) {
            targetChunk.setBlock(
              localX,
              yLevel,
              localZ,
              blockIds[perimeterBlockIndex % blockIds.length]
            );
            targetChunk.setBlock(localX, pedestalY, localZ, 17); // Obsidian as pedestal
          } else {
            // Fallback: write directly to saved data
            var blocks = savedData.blocks;
            var chunkSize = Config.CHUNK_SIZE || 16;
            var blockIdx = localX + localZ * chunkSize;
            if (blockIdx >= 0 && blockIdx < blocks.length) {
              blocks[blockIdx] =
                blockIds[perimeterBlockIndex % blockIds.length];
            }
          }
        }

        perimeterBlockIndex++;
      }
    }
  }

  // ============================================================
  // Debug Entities
  // ============================================================

  /**
   * _spawnDebugEntities — Spawn entities for animation testing.
   * @private
   */
  function _spawnDebugEntities() {
    if (!_entityManagerRef) {
      Donkeycraft.Logger.warn(
        'DebugTerrainGenerator',
        'Entity manager not available'
      );
      return;
    }

    var spawnY = DEBUG_PLATFORM_Y + 1;
    var centerX = 0.5;
    var centerZ = 0.5;

    // Helper: resolve entity constructor by type name
    var _resolveEntityConstructor = function (type) {
      // Check if a named entity class exists in the Donkeycraft namespace
      if (Donkeycraft[type]) return Donkeycraft[type];
      // Fall back to the base Entity class
      if (Donkeycraft.Entity) return Donkeycraft.Entity;
      return null;
    };

    for (var i = 0; i < DEBUG_ENTITY_TYPES.length; i++) {
      var entityDef = DEBUG_ENTITY_TYPES[i];
      var ex = centerX + entityDef.x;
      var ez = centerZ + entityDef.z;

      try {
        // Resolve constructor for this entity type
        var Constructor = _resolveEntityConstructor(entityDef.type);
        if (!Constructor) {
          Donkeycraft.Logger.warn(
            'DebugTerrainGenerator',
            'No constructor found for entity type: ' + entityDef.type
          );
          continue;
        }

        // Create entity instance with proper position
        var entity = new Constructor({
          type: entityDef.type,
          x: ex,
          y: spawnY,
          z: ez,
        });

        // Spawn the entity via EntityManager
        var id = _entityManagerRef.spawn(entity);

        if (id) {
          _debugEntityIds.push(id);

          // Set initial animation for testing
          try {
            if (entity._animationController && entityDef.anim) {
              entity._animationController.playAnimation(entityDef.anim);
            }
          } catch (e) {}
        } else {
          Donkeycraft.Logger.warn(
            'DebugTerrainGenerator',
            'Failed to spawn entity: ' + entityDef.type
          );
        }
      } catch (e) {
        Donkeycraft.Logger.warn(
          'DebugTerrainGenerator',
          'Failed to spawn entity: ' + entityDef.type + ' — ' + e.message
        );
      }
    }

    Donkeycraft.Logger.info(
      'DebugTerrainGenerator',
      'Spawned ' +
        _debugEntityIds.length +
        '/' +
        DEBUG_ENTITY_TYPES.length +
        ' debug entities'
    );
  }

  // ============================================================
  // Disable Debug Terrain
  // ============================================================

  /**
   * _disableDebugTerrain — Deactivate debug terrain and restore saved chunks.
   * @returns {boolean} True if successful.
   * @private
   */
  function _disableDebugTerrain() {
    if (!_isActive) {
      Donkeycraft.Logger.warn(
        'DebugTerrainGenerator',
        'Debug terrain is not active'
      );
      return false;
    }

    // Despawn debug entities
    _despawnDebugEntities();

    // Restore saved chunks
    _restoreChunks();

    // Teleport player back
    if (_playerOriginalPos) {
      var player = null;
      try {
        if (_gameInstance && _gameInstance._player) {
          player = _gameInstance._player;
        }
      } catch (e) {}

      if (player) {
        player.setPosition(
          _playerOriginalPos.x,
          _playerOriginalPos.y,
          _playerOriginalPos.z
        );
        try {
          if (_gameInstance && _gameInstance._camera) {
            var camPos = player.getPosition();
            if (camPos) {
              _gameInstance._camera.setPosition(
                camPos.x,
                camPos.y + Config.PLAYER_EYE_HEIGHT,
                camPos.z
              );
            }
          }
        } catch (e) {}
      }
    }

    // Clean up state
    _savedChunks.clear();
    _debugEntityIds = [];
    _debugChunkKeys = [];
    _playerOriginalPos = null;
    _isActive = false;

    Donkeycraft.Logger.info('DebugTerrainGenerator', 'Debug terrain disabled');

    if (_eventBusRef) {
      try {
        _eventBusRef.emit('debug:terrain:disabled', {});
      } catch (e) {}
    }

    return true;
  }

  /**
   * _despawnDebugEntities — Despawn all debug entities.
   * @private
   */
  function _despawnDebugEntities() {
    if (!_entityManagerRef && !_entityEngineRef) return;

    var despawned = 0;

    for (var i = 0; i < _debugEntityIds.length; i++) {
      var entityId = _debugEntityIds[i];

      // Try to find and despawn via entity manager
      try {
        if (_entityManagerRef && _entityManagerRef.despawnEntity) {
          var entity = _entityManagerRef.getEntityById
            ? _entityManagerRef.getEntityById(entityId)
            : null;
          if (entity) {
            _entityManagerRef.despawnEntity(entity);
            despawned++;
          }
        }
      } catch (e) {}

      // Also try via entity engine's internal manager
      try {
        if (_entityEngineRef) {
          var engMgr = _entityEngineRef.getEntityManager
            ? _entityEngineRef.getEntityManager()
            : null;
          if (engMgr && engMgr.despawnEntity) {
            var engEntity = engMgr.getEntityById
              ? engMgr.getEntityById(entityId)
              : null;
            if (engEntity) {
              engMgr.despawnEntity(engEntity);
              despawned++;
            }
          }
        }
      } catch (e) {}
    }

    Donkeycraft.Logger.info(
      'DebugTerrainGenerator',
      'Despawned ' + despawned + ' debug entities'
    );
    _debugEntityIds = [];
  }

  /**
   * _restoreChunks — Restore saved chunks from memory.
   * @private
   */
  function _restoreChunks() {
    if (!_chunkManagerRef) return;

    var restored = 0;

    for (var i = 0; i < _debugChunkKeys.length; i++) {
      var key = _debugChunkKeys[i];
      var savedData = _savedChunks.get(key);

      if (savedData) {
        var chunk = _chunkManagerRef.getChunk
          ? _chunkManagerRef.getChunk(savedData.chunkX, savedData.chunkZ)
          : null;
        if (chunk) {
          // Restore block data
          chunk.blocks = new Uint16Array(savedData.blocks);
          chunk.skyLight = new Uint8Array(savedData.skyLight);
          chunk.blockLight = new Uint8Array(savedData.blockLight);
          chunk.generated = savedData.generated;
          chunk.biomeId = savedData.biomeId;
          chunk.heightmap = savedData.heightmap
            ? new Uint16Array(savedData.heightmap)
            : null;
          chunk._dirty = true;

          restored++;
        }
      }
    }

    Donkeycraft.Logger.info(
      'DebugTerrainGenerator',
      'Restored ' + restored + ' chunks'
    );
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * getSavedChunks — Get the map of saved chunk data (for debugging).
   * @returns {Map} Map of saved chunks.
   */
  Donkeycraft.DebugTerrainGenerator.getSavedChunks = function () {
    return _savedChunks;
  };

  /**
   * getIsActive — Check if debug terrain is active.
   * @returns {boolean}
   */
  Donkeycraft.DebugTerrainGenerator.getIsActive = function () {
    return _isActive;
  };

  /**
   * setDebugTerrainActive — Directly set the active state (for testing).
   * @param {boolean} active - Whether debug terrain should be active.
   */
  Donkeycraft.DebugTerrainGenerator.setDebugTerrainActive = function (active) {
    _isActive = !!active;
  };
})();
