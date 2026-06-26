// Donkeycraft — Collision Detection
// AABB collision detection & response against blocks, entity bounds.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    /**
     * Collision — handles AABB collision detection and response against blocks.
     */
    Donkeycraft.Collision = function(chunkManager, config) {
        this._chunkManager = chunkManager;
        this._config = config || {};
    };

    /**
     * Check collision for a movement vector against solid blocks.
     * Returns the allowed movement deltas after resolving collisions per axis.
     * @param {Donkeycraft.Vector3} position - Player center position.
     * @param {number} width - Player width.
     * @param {number} height - Player height.
     * @param {number} deltaX - Proposed X movement.
     * @param {number} deltaY - Proposed Y movement.
     * @param {number} deltaZ - Proposed Z movement.
     * @returns {{collisionX: boolean, collisionY: boolean, collisionZ: boolean}}
     */
    Donkeycraft.Collision.prototype.checkMovement = function(position, width, height, deltaX, deltaY, deltaZ) {
        var halfWidth = width / 2;

        // Build AABB before movement
        var aabbBefore = {
            minX: position.x - halfWidth,
            minY: position.y,
            minZ: position.z - halfWidth,
            maxX: position.x + halfWidth,
            maxY: position.y + height,
            maxZ: position.z + halfWidth
        };

        // Check X axis — pass raw coordinates to avoid object allocation
        var collisionX = this._checkAABBAgainstBlocks(
            aabbBefore.minX + deltaX, aabbBefore.minY, aabbBefore.minZ,
            aabbBefore.maxX + deltaX, aabbBefore.maxY, aabbBefore.maxZ
        );

        // Check Y axis
        var collisionY = this._checkAABBAgainstBlocks(
            aabbBefore.minX, aabbBefore.minY + deltaY, aabbBefore.minZ,
            aabbBefore.maxX, aabbBefore.maxY + deltaY, aabbBefore.maxZ
        );

        // Check Z axis
        var collisionZ = this._checkAABBAgainstBlocks(
            aabbBefore.minX, aabbBefore.minY, aabbBefore.minZ + deltaZ,
            aabbBefore.maxX, aabbBefore.maxY, aabbBefore.maxZ + deltaZ
        );

        return {
            collisionX: collisionX,
            collisionY: collisionY,
            collisionZ: collisionZ
        };
    };

    /**
     * Resolve movement with collision detection.
     * @param {Donkeycraft.Vector3} position - Current player position.
     * @param {Donkeycraft.Vector3} velocity - Velocity vector (modified in place).
     * @param {number} width - Player width.
     * @param {number} height - Player height.
     * @returns {{newX: number, newY: number, newZ: number, onGround: boolean}}
     */
    Donkeycraft.Collision.prototype.resolveMovement = function(position, velocity, width, height) {
        var halfWidth = width / 2;
        var deltaX = velocity.x;
        var deltaY = velocity.y;
        var deltaZ = velocity.z;

        // Build AABB
        var aabb = {
            minX: position.x - halfWidth,
            minY: position.y,
            minZ: position.z - halfWidth,
            maxX: position.x + halfWidth,
            maxY: position.y + height,
            maxZ: position.z + halfWidth
        };

        var onGround = false;

        // Resolve X axis — pass raw coordinates to avoid object allocation
        if (deltaX !== 0) {
            if (this._checkAABBAgainstBlocks(
                aabb.minX + deltaX, aabb.minY, aabb.minZ,
                aabb.maxX + deltaX, aabb.maxY, aabb.maxZ
            )) {
                deltaX = 0;
            } else {
                aabb.minX += deltaX;
                aabb.maxX += deltaX;
            }
        }

        // Resolve Y axis
        if (deltaY !== 0) {
            if (this._checkAABBAgainstBlocks(
                aabb.minX, aabb.minY + deltaY, aabb.minZ,
                aabb.maxX, aabb.maxY + deltaY, aabb.maxZ
            )) {
                if (deltaY < 0) {
                    onGround = true;
                }
                deltaY = 0;
            } else {
                aabb.minY += deltaY;
                aabb.maxY += deltaY;
            }
        }

        // Resolve Z axis
        if (deltaZ !== 0) {
            if (this._checkAABBAgainstBlocks(
                aabb.minX, aabb.minY, aabb.minZ + deltaZ,
                aabb.maxX, aabb.maxY, aabb.maxZ + deltaZ
            )) {
                deltaZ = 0;
            } else {
                aabb.minZ += deltaZ;
                aabb.maxZ += deltaZ;
            }
        }

        return {
            newX: aabb.minX + halfWidth,
            newY: aabb.minY,
            newZ: aabb.minZ + halfWidth,
            onGround: onGround
        };
    };

    /**
     * Check if a block at global coordinates is solid (blocks movement).
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalY - Global Y coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {boolean} True if the block is solid.
     */
    Donkeycraft.Collision.prototype.isBlockSolid = function(globalX, globalY, globalZ) {
        // Clamp Y to world bounds
        if (globalY < 0 || globalY >= WORLD_HEIGHT) {
            return globalY < 0; // Below world = solid bedrock
        }

        var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
        var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
        var localX = Donkeycraft.Chunk.localCoordX(globalX);
        var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) {
            return false; // No chunk = no solid blocks
        }

        var blockId = chunk.getBlock(localX, globalY, localZ);
        if (blockId === 0) {
            return false; // Air is not solid
        }

        return Donkeycraft.BlockRegistry.isSolid(blockId);
    };

    /**
     * Check if a block at global coordinates is replaceable (air, liquids, plants).
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalY - Global Y coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {boolean} True if the block is replaceable.
     */
    Donkeycraft.Collision.prototype.isBlockReplaceable = function(globalX, globalY, globalZ) {
        if (globalY < 0 || globalY >= WORLD_HEIGHT) {
            return false;
        }

        var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
        var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
        var localX = Donkeycraft.Chunk.localCoordX(globalX);
        var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) {
            return true;
        }

        var blockId = chunk.getBlock(localX, globalY, localZ);
        if (blockId === 0) {
            return true; // Air is replaceable
        }

        return Donkeycraft.BlockRegistry.isReplaceable(blockId);
    };

    /**
     * Check if a block at global coordinates is a liquid.
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalY - Global Y coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {boolean} True if the block is a liquid.
     */
    Donkeycraft.Collision.prototype.isBlockLiquid = function(globalX, globalY, globalZ) {
        if (globalY < 0 || globalY >= WORLD_HEIGHT) {
            return false;
        }

        var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
        var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
        var localX = Donkeycraft.Chunk.localCoordX(globalX);
        var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) {
            return false;
        }

        var blockId = chunk.getBlock(localX, globalY, localZ);
        return Donkeycraft.BlockRegistry.isLiquid(blockId);
    };

    /**
     * Get all solid blocks that overlap with the given AABB.
     * @param {number} minX - Minimum X of AABB.
     * @param {number} minY - Minimum Y of AABB.
     * @param {number} minZ - Minimum Z of AABB.
     * @param {number} maxX - Maximum X of AABB.
     * @param {number} maxY - Maximum Y of AABB.
     * @param {number} maxZ - Maximum Z of AABB.
     * @returns {Array<{x: number, y: number, z: number, blockId: number}>}
     */
    Donkeycraft.Collision.prototype.getOverlappingBlocks = function(minX, minY, minZ, maxX, maxY, maxZ) {
        var blocks = [];

        // Iterate over all integer block positions within the AABB
        var startX = Math.floor(minX);
        var endX = Math.ceil(maxX);
        var startY = Math.floor(minY);
        var endY = Math.ceil(maxY);
        var startZ = Math.floor(minZ);
        var endZ = Math.ceil(maxZ);

        for (var y = startY; y < endY; y++) {
            for (var x = startX; x < endX; x++) {
                for (var z = startZ; z < endZ; z++) {
                    if (this.isBlockSolid(x, y, z)) {
                        blocks.push({ x: x, y: y, z: z, blockId: this._getBlockIdAt(x, y, z) });
                    }
                }
            }
        }

        return blocks;
    };

    /**
     * Check if a coordinate range overlaps with any solid block.
     * Avoids object allocation by passing raw coordinates directly.
     * @param {number} minX - Minimum X of the range.
     * @param {number} minY - Minimum Y of the range.
     * @param {number} minZ - Minimum Z of the range.
     * @param {number} maxX - Maximum X of the range.
     * @param {number} maxY - Maximum Y of the range.
     * @param {number} maxZ - Maximum Z of the range.
     * @returns {boolean} True if overlapping with a solid block.
     * @private
     */
    Donkeycraft.Collision.prototype._checkAABBAgainstBlocks = function(minX, minY, minZ, maxX, maxY, maxZ) {
        return this.getOverlappingBlocks(minX, minY, minZ, maxX, maxY, maxZ).length > 0;
    };

    /**
     * Get the block ID at global coordinates.
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalY - Global Y coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {number} Block ID (0 = air).
     * @private
     */
    Donkeycraft.Collision.prototype._getBlockIdAt = function(globalX, globalY, globalZ) {
        if (globalY < 0 || globalY >= WORLD_HEIGHT) {
            return 0;
        }

        var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
        var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
        var localX = Donkeycraft.Chunk.localCoordX(globalX);
        var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) {
            return 0;
        }

        return chunk.getBlock(localX, globalY, localZ);
    };

    /**
     * Check entity collision: returns the first entity whose AABB overlaps with the player's.
     * @param {Donkeycraft.Vector3} position - Player center position.
     * @param {number} width - Player width.
     * @param {number} height - Player height.
     * @param {Array} entities - Array of entity objects with getPosition() and getDimensions().
     * @returns {null|object} The overlapping entity, or null.
     */
    Donkeycraft.Collision.prototype.checkEntityCollision = function(position, width, height, entities) {
        var halfWidth = width / 2;
        var playerMinX = position.x - halfWidth;
        var playerMaxX = position.x + halfWidth;
        var playerMinY = position.y;
        var playerMaxY = position.y + height;
        var playerMinZ = position.z - halfWidth;
        var playerMaxZ = position.z + halfWidth;

        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];
            if (!entity || !entity.getPosition) continue;

            var ePos = entity.getPosition();
            if (!ePos) continue;

            var eDims = entity.getDimensions ? entity.getDimensions() : { width: 0.6, height: 1.8 };
            var eHalfWidth = (eDims.width || 0.6) / 2;
            var eHeight = eDims.height || 1.8;

            var eMinX = ePos.x - eHalfWidth;
            var eMaxX = ePos.x + eHalfWidth;
            var eMinY = ePos.y;
            var eMaxY = ePos.y + eHeight;
            var eMinZ = ePos.z - eHalfWidth;
            var eMaxZ = ePos.z + eHalfWidth;

            // AABB overlap test
            if (playerMaxX > eMinX && playerMinX < eMaxX &&
                playerMaxY > eMinY && playerMinY < eMaxY &&
                playerMaxZ > eMinZ && playerMinZ < eMaxZ) {
                return entity;
            }
        }

        return null;
    };

    /**
     * Get the chunk manager reference.
     * @returns {Donkeycraft.ChunkManager}
     */
    Donkeycraft.Collision.prototype.getChunkManager = function() {
        return this._chunkManager;
    };

    /**
     * Destroy the collision system and free resources.
     */
    Donkeycraft.Collision.prototype.destroy = function() {
        this._chunkManager = null;
        this._config = null;
    };

})();
