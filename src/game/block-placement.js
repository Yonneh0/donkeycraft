// Donkeycraft — Block Placement
// Block placement: face normal handling, snap to grid, placement rules.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var WORLD_HEIGHT = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

  // ============================================================
  // Face normal direction constants (matching block-models.js)
  // ============================================================

  /**
   * Standard face normal names matching BlockModelRegistry conventions.
   * Order: [up, down, north, south, east, west] — matches FACE_UP through FACE_WEST indices.
   * @type {{x: number, y: number, z: number}[]}
   */
  var STANDARD_FACE_NORMALS = [
    { x: 0, y: 1, z: 0 }, // UP (positive Y)
    { x: 0, y: -1, z: 0 }, // DOWN (negative Y)
    { x: 0, y: 0, z: -1 }, // NORTH (negative Z)
    { x: 0, y: 0, z: 1 }, // SOUTH (positive Z)
    { x: 1, y: 0, z: 0 }, // EAST (positive X)
    { x: -1, y: 0, z: 0 }, // WEST (negative X)
  ];

  /**
   * Map of face name to index in STANDARD_FACE_NORMALS.
   * @type {Object.<string, number>}
   */
  var FACE_NAME_TO_INDEX = {
    up: 0,
    down: 1,
    north: 2,
    south: 3,
    east: 4,
    west: 5,
  };

  /**
   * Map of face index to name for reverse lookup.
   * @type {string[]}
   */
  var FACE_INDEX_TO_NAME = ['up', 'down', 'north', 'south', 'east', 'west'];

  // ============================================================
  // BlockPlacement
  // ============================================================

  /**
   * BlockPlacement — handles block placement with face normal handling,
   * grid snapping, and placement validation rules.
   *
   * Validates placements against world bounds, existing blocks, and player
   * AABB collision. Supports both direct coordinate placement and raycast-based
   * placement using hit position + face normal.
   *
   * @namespace
   */
  Donkeycraft.BlockPlacement = (function () {
    /**
     * Get the opposite face normal (for placing adjacent to a face).
     * Useful for determining where to place a block when a face was hit.
     * @param {number} nx - Face normal X component.
     * @param {number} ny - Face normal Y component.
     * @param {number} nz - Face normal Z component.
     * @returns {{x: number, y: number, z: number}} Opposite face normal.
     */
    function getOppositeFaceNormal(nx, ny, nz) {
      return { x: -nx, y: -ny, z: -nz };
    }

    /**
     * Get a face normal by name.
     * @param {string} faceName - Face name ("up", "down", "north", "south", "east", "west").
     * @returns {{x: number, y: number, z: number}|null} Normal object or null if invalid.
     */
    function getFaceNormalByName(faceName) {
      if (!faceName || typeof faceName !== 'string') return null;
      var idx = FACE_NAME_TO_INDEX[faceName.toLowerCase()];
      return idx !== undefined ? STANDARD_FACE_NORMALS[idx] : null;
    }

    /**
     * Check if a placement position is valid (not inside player).
     * Validates world bounds and AABB collision against player hitbox.
     * @param {number} x - Global X to place at.
     * @param {number} y - Global Y to place at.
     * @param {number} z - Global Z to place at.
     * @param {Object} player - The player entity with getHurtBox() method.
     * @returns {boolean} True if placement is valid (no collision).
     * @private
     */
    function _isValidPlacement(x, y, z, player) {
      // Check world bounds
      if (typeof y !== 'number' || y < 0 || y >= WORLD_HEIGHT) return false;

      // Floor coordinates to integer grid for AABB check
      var ix = Math.floor(x);
      var iy = Math.floor(y);
      var iz = Math.floor(z);

      // Check if position overlaps with player AABB
      if (!player || typeof player.getHurtBox !== 'function') return true;
      var hurtBox = player.getHurtBox();

      // Block AABB: [ix, ix+1] x [iy, iy+1] x [iz, iz+1]
      var blockMinX = ix;
      var blockMaxX = ix + 1;
      var blockMinY = iy;
      var blockMaxY = iy + 1;
      var blockMinZ = iz;
      var blockMaxZ = iz + 1;

      // AABB overlap test: no overlap = !(blockMax < hurtMin || blockMin > hurtMax)
      var overlaps = !(
        blockMaxX < hurtBox.minX ||
        blockMinX > hurtBox.maxX ||
        blockMaxY < hurtBox.minY ||
        blockMinY > hurtBox.maxY ||
        blockMaxZ < hurtBox.minZ ||
        blockMinZ > hurtBox.maxZ
      );

      return !overlaps;
    }

    /**
     * Place a block at the given global coordinates.
     * Validates: world bounds, air check, player AABB collision.
     * Emits 'blockPlaced' event via EventBus on success.
     *
     * @param {Object} chunkManager - The chunk manager instance.
     * @param {number} x - Global X coordinate.
     * @param {number} y - Global Y coordinate.
     * @param {number} z - Global Z coordinate.
     * @param {number} blockId - Block ID to place.
     * @param {Object} player - The player entity (for collision check).
     * @returns {boolean} True if block was placed successfully.
     */
    function placeBlock(chunkManager, x, y, z, blockId, player) {
      // Defensive null checks and input validation
      if (!chunkManager || !player) return false;
      if (typeof blockId !== 'number' || blockId < 0) return false;
      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof z !== 'number'
      )
        return false;

      // Ensure integer coordinates for consistent chunk lookup
      var ix = Math.floor(x);
      var iy = Math.floor(y);
      var iz = Math.floor(z);

      // 1. Check world bounds
      if (iy < 0 || iy >= WORLD_HEIGHT) return false;

      // 2. Check if target position is air (cannot place inside existing block)
      var currentBlock = 0;
      if (chunkManager.getBlockId) {
        currentBlock = chunkManager.getBlockId(ix, iy, iz);
      } else if (
        Donkeycraft.WorldUtils &&
        typeof Donkeycraft.WorldUtils.getBlockAt === 'function'
      ) {
        currentBlock = Donkeycraft.WorldUtils.getBlockAt(
          chunkManager,
          ix,
          iy,
          iz
        );
      }
      if (currentBlock !== 0) return false;

      // 3. Check player collision (AABB overlap)
      if (!_isValidPlacement(x, y, z, player)) return false;

      // Place the block using WorldUtils
      var result = null;
      if (
        Donkeycraft.WorldUtils &&
        typeof Donkeycraft.WorldUtils.getChunkAndLocalCoords === 'function'
      ) {
        result = Donkeycraft.WorldUtils.getChunkAndLocalCoords(
          chunkManager,
          ix,
          iy,
          iz
        );
      }

      if (!result || !result.chunk) {
        // Fallback: direct chunk lookup
        var chunkX = Math.floor(ix / 16);
        var chunkZ = Math.floor(iz / 16);
        var localX = ((ix % 16) + 16) % 16;
        var localZ = ((iz % 16) + 16) % 16;
        result.chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
        result.lx = localX;
        result.ly = iy;
        result.lz = localZ;
      }

      if (!result.chunk) return false;

      result.chunk.setBlock(result.lx, result.ly, result.lz, blockId);

      if (chunkManager.markChunkDirty) {
        chunkManager.markChunkDirty(Math.floor(ix / 16), Math.floor(iz / 16));
      }

      // Emit placement event via global EventBus
      if (Donkeycraft.EventBus) {
        try {
          Donkeycraft.EventBus.emitSafe('blockPlaced', {
            x: ix,
            y: iy,
            z: iz,
            blockId: blockId,
          });
        } catch (e) {
          // EventBus may not be available in tests
        }
      }

      return true;
    }

    /**
     * Place a block adjacent to a face using raycast hit data.
     * The placement position is calculated by subtracting the face normal from the hit position,
     * which gives the coordinate of the adjacent block space.
     *
     * @param {Object} chunkManager - The chunk manager instance.
     * @param {number} hitX - Global X of the raycast hit block.
     * @param {number} hitY - Global Y of the raycast hit block.
     * @param {number} hitZ - Global Z of the raycast hit block.
     * @param {number} faceNormalX - X component of the face normal (which face was hit).
     * @param {number} faceNormalY - Y component of the face normal.
     * @param {number} faceNormalZ - Z component of the face normal.
     * @param {number} blockId - Block ID to place.
     * @param {Object} player - The player entity.
     * @returns {boolean} True if placed successfully.
     */
    function placeBlockFromRaycast(
      chunkManager,
      hitX,
      hitY,
      hitZ,
      faceNormalX,
      faceNormalY,
      faceNormalZ,
      blockId,
      player
    ) {
      // Defensive null checks and input validation
      if (!chunkManager || !player || typeof blockId !== 'number') return false;
      if (
        typeof hitX !== 'number' ||
        typeof hitY !== 'number' ||
        typeof hitZ !== 'number'
      )
        return false;
      if (
        typeof faceNormalX !== 'number' ||
        typeof faceNormalY !== 'number' ||
        typeof faceNormalZ !== 'number'
      )
        return false;

      // Calculate placement position by subtracting face normal from hit position
      var placeX = hitX - faceNormalX;
      var placeY = hitY - faceNormalY;
      var placeZ = hitZ - faceNormalZ;

      return placeBlock(chunkManager, placeX, placeY, placeZ, blockId, player);
    }

    /**
     * Get the placement position from hit block and face normal.
     * Coordinates are floored to snap to integer grid for consistency with chunk storage.
     *
     * @param {number} hitX - Global X of raycast hit block.
     * @param {number} hitY - Global Y of raycast hit block.
     * @param {number} hitZ - Global Z of raycast hit block.
     * @param {number} faceNormalX - X component of face normal.
     * @param {number} faceNormalY - Y component of face normal.
     * @param {number} faceNormalZ - Z component of face normal.
     * @returns {{x: number, y: number, z: number}} Floored placement position.
     */
    function getPlacementPosition(
      hitX,
      hitY,
      hitZ,
      faceNormalX,
      faceNormalY,
      faceNormalZ
    ) {
      return {
        x: Math.floor(hitX - faceNormalX),
        y: Math.floor(hitY - faceNormalY),
        z: Math.floor(hitZ - faceNormalZ),
      };
    }

    /**
     * Check if a block can be placed at the given position without colliding with player.
     * Only validates world bounds and AABB collision — does NOT check if the target
     * block space is air (use placeBlock for full validation).
     *
     * @param {Object} chunkManager - The chunk manager instance (may be null).
     * @param {number} x - Global X.
     * @param {number} y - Global Y.
     * @param {number} z - Global Z.
     * @param {Object} player - The player entity.
     * @returns {boolean} True if placement is valid (no AABB overlap).
     */
    function canPlaceAt(chunkManager, x, y, z, player) {
      // World bounds check
      if (typeof y !== 'number' || y < 0 || y >= WORLD_HEIGHT) return false;
      return _isValidPlacement(x, y, z, player);
    }

    /**
     * Get standard face normal vectors for all 6 block face directions.
     * Returns normals in [up, down, north, south, east, west] order matching BlockModelRegistry.
     *
     * @returns {{x: number, y: number, z: number}[]} Array of 6 face normal objects.
     */
    function getFaceNormals() {
      return STANDARD_FACE_NORMALS;
    }

    /**
     * Get the face normal that points in the opposite direction.
     * Useful for determining where to place a block adjacent to a hit face.
     * For example, if the player clicks the TOP face of a block (normal: 0,1,0),
     * the opposite normal is 0,-1,0 — placing the new block BELOW the hit block.
     *
     * @param {number} nx - Face normal X component.
     * @param {number} ny - Face normal Y component.
     * @param {number} nz - Face normal Z component.
     * @returns {{x: number, y: number, z: number}} Opposite face normal.
     */
    function getOppositeNormal(nx, ny, nz) {
      return getOppositeFaceNormal(nx, ny, nz);
    }

    /**
     * Get the index of a face normal by name.
     * @param {string} faceName - Face name (e.g., "up", "north").
     * @returns {number} Index (0-5) or -1 if invalid.
     */
    function getFaceNormalIndex(faceName) {
      if (!faceName || typeof faceName !== 'string') return -1;
      return FACE_NAME_TO_INDEX[faceName.toLowerCase()] !== undefined
        ? FACE_NAME_TO_INDEX[faceName.toLowerCase()]
        : -1;
    }

    return {
      placeBlock: placeBlock,
      placeBlockFromRaycast: placeBlockFromRaycast,
      getPlacementPosition: getPlacementPosition,
      canPlaceAt: canPlaceAt,
      getFaceNormals: getFaceNormals,
      getOppositeNormal: getOppositeNormal,
      getFaceNormalByName: getFaceNormalByName,
      getFaceNormalIndex: getFaceNormalIndex,
    };
  })();
})();
