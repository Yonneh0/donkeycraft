// Donkeycraft — Chunk Data Structure
// Chunk data: 16×256×16 block array, lighting arrays, dirty flags.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
  var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

  // ============================================================
  // Chunk
  // ============================================================

  /**
   * Chunk — stores block data, sky light, and block light for a 16×WORLD_HEIGHT×16 region.
   * Uses Uint16Array for blocks (supporting IDs > 255) and Uint8Array for light values.
   * @param {number} chunkX - X coordinate of this chunk (in chunk units).
   * @param {number} chunkZ - Z coordinate of this chunk (in chunk units).
   */
  Donkeycraft.Chunk = function (chunkX, chunkZ) {
    /**
     * Chunk X coordinate.
     * @type {number}
     */
    this.chunkX = chunkX;

    /**
     * Chunk Z coordinate.
     * @type {number}
     */
    this.chunkZ = chunkZ;

    /**
     * Block data: 1D Uint16Array of size CHUNK_SIZE × WORLD_HEIGHT × CHUNK_SIZE.
     * Uses Uint16Array to support block IDs beyond 255 (nether/end blocks).
     * @type {Uint16Array}
     */
    this.blocks = new Uint16Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);

    /**
     * Sky light data: 1 byte per block (0-15).
     * @type {Uint8Array}
     */
    this.skyLight = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);

    /**
     * Block light data: 1 byte per block (0-15).
     * @type {Uint8Array}
     */
    this.blockLight = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);

    /**
     * Whether this chunk has unapplied changes that need mesh regeneration.
     * @type {boolean}
     */
    this._dirty = false;

    /**
     * Whether this chunk has been fully generated (terrain placed).
     * @type {boolean}
     */
    this.generated = false;

    /**
     * Biome ID for this chunk.
     * @type {number}
     */
    this.biomeId = 0;

    /**
     * Heightmap array: surface height at each (x, z) position within the chunk.
     * Size CHUNK_SIZE × CHUNK_SIZE. Heightmap[x + z * CHUNK_SIZE] = surface Y.
     * Used for fast surface height queries during spawn finding and rendering.
     * @type {Uint16Array|null}
     */
    this.heightmap = null;

    /**
     * Whether this chunk has been destroyed and its resources freed.
     * @type {boolean}
     * @private
     */
    this._destroyed = false;

    /**
     * Block entity storage: key = "x,y,z" → value = { type: string, data: Object }.
     * Used for chunks like chests, furnaces, doors, etc.
     * @type {Map<string, Object>}
     */
    this._blockEntities = new Map();
  };

  /**
   * Calculate the linear index for (x, y, z) within the chunk.
   * @param {number} x - X coordinate [0, 15].
   * @param {number} y - Y coordinate [0, 255].
   * @param {number} z - Z coordinate [0, 15].
   * @returns {number} Linear array index.
   * @private
   */
  function blockIndex(x, y, z) {
    return x + y * CHUNK_SIZE + z * CHUNK_SIZE * WORLD_HEIGHT;
  }

  /**
   * Get the block ID at local coordinates within this chunk.
   * Returns 0 (air) if coordinates are out of bounds.
   * @param {number} x - X coordinate [0, 15].
   * @param {number} y - Y coordinate [0, 255].
   * @param {number} z - Z coordinate [0, 15].
   * @returns {number} Block ID (0 = air).
   */
  Donkeycraft.Chunk.prototype.getBlock = function (x, y, z) {
    if (this._destroyed) return 0; // Destroyed chunk returns air
    if (
      x < 0 ||
      x >= CHUNK_SIZE ||
      y < 0 ||
      y >= WORLD_HEIGHT ||
      z < 0 ||
      z >= CHUNK_SIZE
    ) {
      return 0; // Out of bounds = air
    }
    return this.blocks[blockIndex(x, y, z)];
  };

  /**
   * Set the block ID at local coordinates within this chunk.
   * Marks the chunk as dirty if the block value changes.
   * Silently ignores out-of-bounds or destroyed chunks.
   * @param {number} x - X coordinate [0, 15].
   * @param {number} y - Y coordinate [0, 255].
   * @param {number} z - Z coordinate [0, 15].
   * @param {number} blockId - Block ID to set.
   */
  Donkeycraft.Chunk.prototype.setBlock = function (x, y, z, blockId) {
    if (this._destroyed) return; // Destroyed chunk — ignore writes
    if (
      x < 0 ||
      x >= CHUNK_SIZE ||
      y < 0 ||
      y >= WORLD_HEIGHT ||
      z < 0 ||
      z >= CHUNK_SIZE
    ) {
      return; // Out of bounds — ignore
    }
    var idx = blockIndex(x, y, z);
    if (this.blocks[idx] !== blockId) {
      this.blocks[idx] = blockId;
      this._dirty = true;
    }
  };

  /**
   * Get the sky light value at local coordinates within this chunk.
   * Returns 0 (no sky light) if coordinates are out of bounds — chunks at world
   * edges have no terrain above them, so they should not receive full sky light.
   * @param {number} x - X coordinate [0, 15].
   * @param {number} y - Y coordinate [0, 255].
   * @param {number} z - Z coordinate [0, 15].
   * @returns {number} Sky light value (0-15).
   */
  Donkeycraft.Chunk.prototype.getSkyLight = function (x, y, z) {
    if (this._destroyed) return 0; // Destroyed chunk returns zero light
    if (
      x < 0 ||
      x >= CHUNK_SIZE ||
      y < 0 ||
      y >= WORLD_HEIGHT ||
      z < 0 ||
      z >= CHUNK_SIZE
    ) {
      return 0; // Outside chunk = no sky light (world edge / void)
    }
    return this.skyLight[blockIndex(x, y, z)];
  };

  /**
   * Set the sky light value at local coordinates within this chunk.
   * Silently ignores out-of-bounds coordinates. Clamps light to [0, 15].
   * @param {number} x - X coordinate [0, 15].
   * @param {number} y - Y coordinate [0, 255].
   * @param {number} z - Z coordinate [0, 15].
   * @param {number} light - Light value (0-15).
   */
  Donkeycraft.Chunk.prototype.setSkyLight = function (x, y, z, light) {
    if (
      x < 0 ||
      x >= CHUNK_SIZE ||
      y < 0 ||
      y >= WORLD_HEIGHT ||
      z < 0 ||
      z >= CHUNK_SIZE
    ) {
      return; // Out of bounds — silently ignore
    }
    this.skyLight[blockIndex(x, y, z)] = Donkeycraft.clamp(light, 0, 15);
  };

  /**
   * Get the block light value at local coordinates within this chunk.
   * Returns 0 if coordinates are out of bounds.
   * @param {number} x - X coordinate [0, 15].
   * @param {number} y - Y coordinate [0, 255].
   * @param {number} z - Z coordinate [0, 15].
   * @returns {number} Block light value (0-15).
   */
  Donkeycraft.Chunk.prototype.getBlockLight = function (x, y, z) {
    if (this._destroyed) return 0; // Destroyed chunk returns zero light
    if (
      x < 0 ||
      x >= CHUNK_SIZE ||
      y < 0 ||
      y >= WORLD_HEIGHT ||
      z < 0 ||
      z >= CHUNK_SIZE
    ) {
      return 0; // Outside chunk = no block light
    }
    return this.blockLight[blockIndex(x, y, z)];
  };

  /**
   * Set the block light value at local coordinates within this chunk.
   * Silently ignores out-of-bounds coordinates. Clamps light to [0, 15].
   * @param {number} x - X coordinate [0, 15].
   * @param {number} y - Y coordinate [0, 255].
   * @param {number} z - Z coordinate [0, 15].
   * @param {number} light - Light value (0-15).
   */
  Donkeycraft.Chunk.prototype.setBlockLight = function (x, y, z, light) {
    if (
      x < 0 ||
      x >= CHUNK_SIZE ||
      y < 0 ||
      y >= WORLD_HEIGHT ||
      z < 0 ||
      z >= CHUNK_SIZE
    ) {
      return; // Out of bounds — silently ignore
    }
    this.blockLight[blockIndex(x, y, z)] = Donkeycraft.clamp(light, 0, 15);
  };

  /**
   * Get the global X coordinate for this chunk's left edge.
   * @returns {number} Global X = chunkX * CHUNK_SIZE.
   */
  Donkeycraft.Chunk.prototype.globalX = function () {
    return this.chunkX * CHUNK_SIZE;
  };

  /**
   * Get the global Z coordinate for this chunk's front edge.
   * @returns {number} Global Z = chunkZ * CHUNK_SIZE.
   */
  Donkeycraft.Chunk.prototype.globalZ = function () {
    return this.chunkZ * CHUNK_SIZE;
  };

  /**
   * Convert global X/Z coordinates to local chunk coordinates.
   * Handles negative world coordinates correctly via modular arithmetic.
   * @param {number} gx - Global X coordinate (can be negative).
   * @param {number} gz - Global Z coordinate (can be negative).
   * @returns {{lx: number, lz: number}} Object with local x and z in [0, 15].
   */
  Donkeycraft.Chunk.prototype.globalToLocal = function (gx, gz) {
    return {
      lx: ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      lz: ((gz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    };
  };

  /**
   * Check if this chunk has unapplied changes that need mesh regeneration.
   * @returns {boolean} True if the chunk is dirty.
   */
  Donkeycraft.Chunk.prototype.isDirty = function () {
    if (this._destroyed) return false; // Destroyed chunks are clean by default
    return this._dirty;
  };

  /**
   * Mark this chunk as clean — changes have been applied to the mesh.
   */
  Donkeycraft.Chunk.prototype.markClean = function () {
    if (this._destroyed) return;
    this._dirty = false;
  };

  /**
   * Mark this chunk as dirty — signals that the mesh needs regeneration.
   */
  Donkeycraft.Chunk.prototype.markDirty = function () {
    if (this._destroyed) return;
    this._dirty = true;
  };

  /**
   * Clear all sky and block light data in this chunk (sets to zero).
   */
  Donkeycraft.Chunk.prototype.clearLight = function () {
    this.skyLight.fill(0);
    this.blockLight.fill(0);
  };

  /**
   * Fill the entire chunk's block data with a specific block ID.
   * Marks the chunk as dirty.
   * @param {number} blockId - Block ID to fill with (0 = air).
   */
  Donkeycraft.Chunk.prototype.fill = function (blockId) {
    if (this._destroyed) return; // Destroyed chunk — ignore writes
    this.blocks.fill(blockId);
    this._dirty = true;
  };

  /**
   * Get a view of the block data as a Uint16Array (for bulk WebGL buffer uploads).
   * @returns {Uint16Array} View of block data.
   */
  Donkeycraft.Chunk.prototype.getBlockData = function () {
    return this.blocks;
  };

  /**
   * Get the block entity at local coordinates, or null if none exists.
   * @param {number} x - Local X [0, 15].
   * @param {number} y - Local Y [0, 255].
   * @param {number} z - Local Z [0, 15].
   * @returns {Object|null} Block entity data, or null.
   */
  Donkeycraft.Chunk.prototype.getBlockEntity = function (x, y, z) {
    var key = x + ',' + y + ',' + z;
    return this._blockEntities.get(key) || null;
  };

  /**
   * Set a block entity at local coordinates.
   * @param {number} x - Local X [0, 15].
   * @param {number} y - Local Y [0, 255].
   * @param {number} z - Local Z [0, 15].
   * @param {Object} entity - Entity data with { type: string, data: Object }.
   */
  Donkeycraft.Chunk.prototype.setBlockEntity = function (x, y, z, entity) {
    var key = x + ',' + y + ',' + z;
    this._blockEntities.set(key, entity);
  };

  /**
   * Remove a block entity at local coordinates.
   * @param {number} x - Local X [0, 15].
   * @param {number} y - Local Y [0, 255].
   * @param {number} z - Local Z [0, 15].
   * @returns {boolean} True if an entity was removed.
   */
  Donkeycraft.Chunk.prototype.removeBlockEntity = function (x, y, z) {
    var key = x + ',' + y + ',' + z;
    return this._blockEntities.delete(key);
  };

  /**
   * Get all block entities in this chunk as an array.
   * @returns {Object[]} Array of { x, y, z, entity } objects.
   */
  Donkeycraft.Chunk.prototype.getAllBlockEntities = function () {
    var result = [];
    var self = this;
    this._blockEntities.forEach(function (entity, key) {
      var parts = key.split(',');
      result.push({
        x: parseInt(parts[0], 10),
        y: parseInt(parts[1], 10),
        z: parseInt(parts[2], 10),
        entity: entity,
      });
    });
    return result;
  };

  /**
   * Clear all block entities in this chunk.
   */
  Donkeycraft.Chunk.prototype.clearBlockEntities = function () {
    this._blockEntities.clear();
  };

  /**
   * Serialize block entities for storage (array of { x, y, z, type, data }).
   * @returns {Array.<Object>}
   */
  Donkeycraft.Chunk.prototype.serializeBlockEntities = function () {
    var result = [];
    var self = this;
    this._blockEntities.forEach(function (entity, key) {
      var parts = key.split(',');
      result.push({
        x: parseInt(parts[0], 10),
        y: parseInt(parts[1], 10),
        z: parseInt(parts[2], 10),
        type: entity.type || 'unknown',
        data: entity.data || {},
      });
    });
    return result;
  };

  /**
   * Deserialize and restore block entities from an array.
   * @param {Array.<Object>} entities - Array of { x, y, z, type, data }.
   */
  Donkeycraft.Chunk.prototype.deserializeBlockEntities = function (entities) {
    var self = this;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      this._blockEntities.set(e.x + ',' + e.y + ',' + e.z, {
        type: e.type,
        data: e.data,
      });
    }
  };

  /**
   * Check if this chunk has been destroyed.
   * @returns {boolean} True if destroy() was called.
   */
  Donkeycraft.Chunk.prototype.isDestroyed = function () {
    return this._destroyed;
  };

  /**
   * Destroy and free chunk resources — nulls internal arrays.
   * Call this when the chunk is no longer needed.
   */
  Donkeycraft.Chunk.prototype.destroy = function () {
    if (this._destroyed) return; // Prevent double-free
    this._destroyed = true;
    this.blocks = null;
    this.skyLight = null;
    this.blockLight = null;
    this._blockEntities.clear();
    this._blockEntities = null;
  };

  // ============================================================
  // Chunk Coordinate Helpers
  // ============================================================

  /**
   * Convert global block X coordinate to chunk X coordinate.
   * @param {number} globalX - Global X coordinate.
   * @returns {number} Chunk X coordinate.
   */
  Donkeycraft.Chunk.chunkCoordX = function (globalX) {
    return Math.floor(globalX / CHUNK_SIZE);
  };

  /**
   * Convert global block Z coordinate to chunk Z coordinate.
   * @param {number} globalZ - Global Z coordinate.
   * @returns {number} Chunk Z coordinate.
   */
  Donkeycraft.Chunk.chunkCoordZ = function (globalZ) {
    return Math.floor(globalZ / CHUNK_SIZE);
  };

  /**
   * Get the local X coordinate within a chunk from global X.
   * Handles negative coordinates correctly via modular arithmetic.
   * @param {number} globalX - Global X coordinate.
   * @returns {number} Local X in [0, 15].
   */
  Donkeycraft.Chunk.localCoordX = function (globalX) {
    return ((globalX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  };

  /**
   * Get the local Z coordinate within a chunk from global Z.
   * Handles negative coordinates correctly via modular arithmetic.
   * @param {number} globalZ - Global Z coordinate.
   * @returns {number} Local Z in [0, 15].
   */
  Donkeycraft.Chunk.localCoordZ = function (globalZ) {
    return ((globalZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  };
})();
