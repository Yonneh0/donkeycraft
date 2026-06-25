// Donkeycraft — Chunk Data Structure
// Chunk data: 16×256×16 block array, lighting arrays, dirty flags.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // Chunk
    // ============================================================

    /**
     * Chunk — stores block data for a 16×WORLD_HEIGHT×16 region.
     * @param {number} chunkX - X coordinate of this chunk (in chunk units).
     * @param {number} chunkZ - Z coordinate of this chunk (in chunk units).
     */
    Donkeycraft.Chunk = function(chunkX, chunkZ) {
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
         * Block data: 1D Uint8Array of size CHUNK_SIZE × WORLD_HEIGHT × CHUNK_SIZE.
         * @type {Uint8Array}
         */
        this.blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);

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
     * Get the block ID at local coordinates.
     * @param {number} x - X coordinate [0, 15].
     * @param {number} y - Y coordinate [0, 255].
     * @param {number} z - Z coordinate [0, 15].
     * @returns {number} Block ID (0 = air).
     */
    Donkeycraft.Chunk.prototype.getBlock = function(x, y, z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            return 0; // Out of bounds = air
        }
        return this.blocks[blockIndex(x, y, z)];
    };

    /**
     * Set the block ID at local coordinates.
     * @param {number} x - X coordinate [0, 15].
     * @param {number} y - Y coordinate [0, 255].
     * @param {number} z - Z coordinate [0, 15].
     * @param {number} blockId - Block ID to set.
     */
    Donkeycraft.Chunk.prototype.setBlock = function(x, y, z, blockId) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            return; // Out of bounds — ignore
        }
        var idx = blockIndex(x, y, z);
        if (this.blocks[idx] !== blockId) {
            this.blocks[idx] = blockId;
            this._dirty = true;
        }
    };

    /**
     * Get the sky light value at local coordinates.
     * @param {number} x - X coordinate [0, 15].
     * @param {number} y - Y coordinate [0, 255].
     * @param {number} z - Z coordinate [0, 15].
     * @returns {number} Sky light value (0-15).
     */
    Donkeycraft.Chunk.prototype.getSkyLight = function(x, y, z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            return 15; // Outside chunk = full sky light
        }
        return this.skyLight[blockIndex(x, y, z)];
    };

    /**
     * Set the sky light value at local coordinates.
     * @param {number} x - X coordinate [0, 15].
     * @param {number} y - Y coordinate [0, 255].
     * @param {number} z - Z coordinate [0, 15].
     * @param {number} light - Light value (0-15).
     */
    Donkeycraft.Chunk.prototype.setSkyLight = function(x, y, z, light) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            return;
        }
        this.skyLight[blockIndex(x, y, z)] = Donkeycraft.clamp(light, 0, 15);
    };

    /**
     * Get the block light value at local coordinates.
     * @param {number} x - X coordinate [0, 15].
     * @param {number} y - Y coordinate [0, 255].
     * @param {number} z - Z coordinate [0, 15].
     * @returns {number} Block light value (0-15).
     */
    Donkeycraft.Chunk.prototype.getBlockLight = function(x, y, z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            return 0;
        }
        return this.blockLight[blockIndex(x, y, z)];
    };

    /**
     * Set the block light value at local coordinates.
     * @param {number} x - X coordinate [0, 15].
     * @param {number} y - Y coordinate [0, 255].
     * @param {number} z - Z coordinate [0, 15].
     * @param {number} light - Light value (0-15).
     */
    Donkeycraft.Chunk.prototype.setBlockLight = function(x, y, z, light) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            return;
        }
        this.blockLight[blockIndex(x, y, z)] = Donkeycraft.clamp(light, 0, 15);
    };

    /**
     * Get the global X coordinate for this chunk's left edge.
     * @returns {number}
     */
    Donkeycraft.Chunk.prototype.globalX = function() {
        return this.chunkX * CHUNK_SIZE;
    };

    /**
     * Get the global Z coordinate for this chunk's front edge.
     * @returns {number}
     */
    Donkeycraft.Chunk.prototype.globalZ = function() {
        return this.chunkZ * CHUNK_SIZE;
    };

    /**
     * Convert global coordinates to local chunk coordinates.
     * @param {number} gx - Global X.
     * @param {number} gz - Global Z.
     * @returns {{lx: number, lz: number}} Local x and z.
     */
    Donkeycraft.Chunk.prototype.globalToLocal = function(gx, gz) {
        return {
            lx: gx - this.chunkX * CHUNK_SIZE,
            lz: gz - this.chunkZ * CHUNK_SIZE
        };
    };

    /**
     * Check if this chunk has unapplied changes.
     * @returns {boolean}
     */
    Donkeycraft.Chunk.prototype.isDirty = function() {
        return this._dirty;
    };

    /**
     * Mark this chunk as clean (changes applied).
     */
    Donkeycraft.Chunk.prototype.markClean = function() {
        this._dirty = false;
    };

    /**
     * Mark this chunk as dirty (needs mesh regeneration).
     */
    Donkeycraft.Chunk.prototype.markDirty = function() {
        this._dirty = true;
    };

    /**
     * Clear all light data in this chunk.
     */
    Donkeycraft.Chunk.prototype.clearLight = function() {
        this.skyLight.fill(0);
        this.blockLight.fill(0);
    };

    /**
     * Fill the entire chunk with a specific block ID.
     * @param {number} blockId - Block ID to fill with.
     */
    Donkeycraft.Chunk.prototype.fill = function(blockId) {
        this.blocks.fill(blockId);
        this._dirty = true;
    };

    /**
     * Get a view of the block data as a Uint8Array (for bulk operations).
     * @returns {Uint8Array}
     */
    Donkeycraft.Chunk.prototype.getBlockData = function() {
        return this.blocks;
    };

    /**
     * Destroy and free resources.
     */
    Donkeycraft.Chunk.prototype.destroy = function() {
        this.blocks = null;
        this.skyLight = null;
        this.blockLight = null;
    };

    // ============================================================
    // Chunk Coordinate Helpers
    // ============================================================

    /**
     * Convert global block coordinates to chunk coordinates.
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {{chunkX: number, chunkZ: number}}
     */
    Donkeycraft.Chunk.chunkCoordX = function(globalX) {
        return Math.floor(globalX / CHUNK_SIZE);
    };

    /**
     * Convert global block coordinates to chunk Z coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {number}
     */
    Donkeycraft.Chunk.chunkCoordZ = function(globalZ) {
        return Math.floor(globalZ / CHUNK_SIZE);
    };

    /**
     * Get the local X coordinate within a chunk from global X.
     * @param {number} globalX - Global X coordinate.
     * @returns {number} Local X [0, 15].
     */
    Donkeycraft.Chunk.localCoordX = function(globalX) {
        return ((globalX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    };

    /**
     * Get the local Z coordinate within a chunk from global Z.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {number} Local Z [0, 15].
     */
    Donkeycraft.Chunk.localCoordZ = function(globalZ) {
        return ((globalZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    };

})();