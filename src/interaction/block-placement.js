// Donkeycraft — Block Placement
// Block placement: face normal handling, snap to grid, placement rules.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // BlockPlacer — handles block placement logic.
    // ============================================================

    /**
     * BlockPlacer — manages block placement with face normal handling and grid snapping.
     * @param {object} [config] - Configuration.
     * @param {number} [config.reach=6.0] - Maximum reach distance for placement.
     * @param {Donkeycraft.EventBus} [config.events] - EventBus instance for placement events.
     */
    Donkeycraft.BlockPlacer = function(config) {
        config = config || {};

        /**
         * Maximum reach distance for block placement.
         * @type {number}
         * @private
         */
        this._reach = config.reach || Donkeycraft.Config.PLAYER_REACH;

        /**
         * Event bus for placement-related events.
         * @type {Donkeycraft.EventBus}
         * @private
         */
        this._events = config.events || null;
    };

    /**
     * Place a block at the given global coordinates.
     * @param {number} x - Global X coordinate.
     * @param {number} y - Global Y coordinate.
     * @param {number} z - Global Z coordinate.
     * @param {number} blockId - Block ID to place.
     * @param {Donkeycraft.Chunk} chunk - Chunk containing the placement position.
     * @returns {boolean} True if placement succeeded.
     */
    Donkeycraft.BlockPlacer.prototype.placeBlock = function(x, y, z, blockId, chunk) {
        // Validate placement is possible
        if (!this.canPlaceAt(x, y, z, function(px, py, pz) {
            return this._getBlockAt(px, py, pz, chunk);
        }.bind(this), null)) {
            return false;
        }

        // Set the block in the chunk
        var lx = ((x % 16) + 16) % 16;
        var lz = ((z % 16) + 16) % 16;
        var index = lx + y * 16 + lz * 16 * 256;

        chunk.blocks[index] = blockId;
        chunk._dirty = true;

        // Emit placement event
        if (this._events) {
            this._events.emit('blockPlaced', x, y, z, blockId);
        }

        return true;
    };

    /**
     * Calculate the placement position from a hit position and face normal.
     * When you right-click on a block face, the new block goes adjacent to that face.
     * @param {number} hitX - Hit block X.
     * @param {number} hitY - Hit block Y.
     * @param {number} hitZ - Hit block Z.
     * @param {number} faceX - Face normal X.
     * @param {number} faceY - Face normal Y.
     * @param {number} faceZ - Face normal Z.
     * @returns {{x: number, y: number, z: number}} The placement coordinates.
     */
    Donkeycraft.BlockPlacer.prototype.calculatePlacementPos = function(hitX, hitY, hitZ, faceX, faceY, faceZ) {
        return {
            x: hitX + faceX,
            y: hitY + faceY,
            z: hitZ + faceZ
        };
    };

    /**
     * Check if a block can be placed at the given position.
     * Placement rules: target must be air, and the player's AABB must not overlap the placement position.
     * @param {number} x - Global X coordinate.
     * @param {number} y - Global Y coordinate.
     * @param {number} z - Global Z coordinate.
     * @param {Function} getBlock - Callback to query block at position: getBlock(x, y, z).
     * @param {object} [playerAABB] - Player bounding box {minX, minY, minZ, maxX, maxY, maxZ}. If null, no collision check.
     * @returns {boolean}
     */
    Donkeycraft.BlockPlacer.prototype.canPlaceAt = function(x, y, z, getBlock, playerAABB) {
        // Target block must be air (ID 0)
        var targetBlock = getBlock(x, y, z);
        if (targetBlock !== 0 && targetBlock !== undefined) {
            return false;
        }

        // Check player AABB collision
        if (playerAABB) {
            // Placement block AABB: the 1x1x1 block at integer coordinates
            var placeAABB = {
                minX: x,
                minY: y,
                minZ: z,
                maxX: x + 1,
                maxY: y + 1,
                maxZ: z + 1
            };

            if (this._aabbOverlap(playerAABB, placeAABB)) {
                return false;
            }
        }

        return true;
    };

    /**
     * Check if two AABBs overlap.
     * @param {{minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number}} a - First AABB.
     * @param {{minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number}} b - Second AABB.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.BlockPlacer.prototype._aabbOverlap = function(a, b) {
        return a.minX < b.maxX && a.maxX > b.minX &&
               a.minY < b.maxY && a.maxY > b.minY &&
               a.minZ < b.maxZ && a.maxZ > b.minZ;
    };

    /**
     * Get the block at global coordinates from a chunk.
     * @param {number} x - Global X coordinate.
     * @param {number} y - Global Y coordinate.
     * @param {number} z - Global Z coordinate.
     * @param {Donkeycraft.Chunk} chunk - The chunk to read from.
     * @returns {number} Block ID (0 = air for out of bounds).
     * @private
     */
    Donkeycraft.BlockPlacer.prototype._getBlockAt = function(x, y, z, chunk) {
        // Check Y bounds
        if (y < 0 || y >= Donkeycraft.Config.WORLD_HEIGHT) {
            return 0;
        }

        // Convert global to local coordinates
        var lx = ((x % 16) + 16) % 16;
        var lz = ((z % 16) + 16) % 16;

        // Check if within chunk X/Z bounds (always true for valid chunks, but safety check)
        if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16) {
            return 0;
        }

        var index = lx + y * 16 + lz * 16 * 256;
        return chunk.blocks[index];
    };

    /**
     * Destroy and free resources.
     */
    Donkeycraft.BlockPlacer.prototype.destroy = function() {
        this._events = null;
    };

})();