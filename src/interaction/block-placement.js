// Donkeycraft — Block Placement
// Block placement: face normal handling, snap to grid, placement rules.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // BlockPlacement
    // ============================================================

    /**
     * BlockPlacement — handles block placement with face normal handling,
     * grid snapping, and placement validation rules.
     */
    Donkeycraft.BlockPlacement = (function() {

        /**
         * Get the opposite face normal (for placing adjacent to a face).
         * @param {number} nx - Face normal X.
         * @param {number} ny - Face normal Y.
         * @param {number} nz - Face normal Z.
         * @returns {{x: number, y: number, z: number}}
         * @private
         */
        function _getOppositeFaceNormal(nx, ny, nz) {
            return { x: -nx, y: -ny, z: -nz };
        }

        /**
         * Check if a placement position is valid (not inside player).
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} x - Global X to place at.
         * @param {number} y - Global Y to place at.
         * @param {number} z - Global Z to place at.
         * @param {Donkeycraft.Player} player - The player entity.
         * @returns {boolean}
         * @private
         */
        function _isValidPlacement(chunkManager, x, y, z, player) {
            // Check world bounds
            if (y < 0 || y >= WORLD_HEIGHT) return false;

            // Floor coordinates to integer grid for AABB check
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);

            // Check if position overlaps with player AABB
            var hurtBox = player.getHurtBox();

            // Block AABB: [ix, ix+1] x [iy, iy+1] x [iz, iz+1]
            var blockMinX = ix;
            var blockMaxX = ix + 1;
            var blockMinY = iy;
            var blockMaxY = iy + 1;
            var blockMinZ = iz;
            var blockMaxZ = iz + 1;

            // AABB overlap test: no overlap = !(blockMax < hurtMin || blockMin > hurtMax)
            var overlaps = !(blockMaxX < hurtBox.minX || blockMinX > hurtBox.maxX ||
                             blockMaxY < hurtBox.minY || blockMinY > hurtBox.maxY ||
                             blockMaxZ < hurtBox.minZ || blockMinZ > hurtBox.maxZ);

            return !overlaps;
        }

        /**
         * Place a block at the given global coordinates.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} x - Global X coordinate.
         * @param {number} y - Global Y coordinate.
         * @param {number} z - Global Z coordinate.
         * @param {number} blockId - Block ID to place.
         * @param {Donkeycraft.Player} player - The player entity (for collision check).
         * @returns {boolean} True if block was placed successfully.
         */
        function placeBlock(chunkManager, x, y, z, blockId, player) {
            // Ensure integer coordinates for consistent chunk lookup
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var iz = Math.floor(z);

            // 1. Check if target position is air (cannot place inside existing block)
            if (Donkeycraft.WorldUtils.getBlockAt(chunkManager, ix, iy, iz) !== 0) return false;

            // 2. Check player collision (AABB overlap)
            if (!_isValidPlacement(chunkManager, x, y, z, player)) return false;

            // Place the block using WorldUtils
            var result = Donkeycraft.WorldUtils.getChunkAndLocalCoords(chunkManager, ix, iy, iz);
            if (!result.chunk) return false;

            result.chunk.setBlock(result.lx, result.ly, result.lz, blockId);
            chunkManager.markChunkDirty(result.chunk.chunkX, result.chunk.chunkZ);

            // Emit placement event (guarded — EventBus may not be initialized in tests)
            if (Donkeycraft.EventBus && typeof Donkeycraft.EventBus.emit === 'function') {
                Donkeycraft.EventBus.emit('blockPlaced', {
                    x: ix, y: iy, z: iz,
                    blockId: blockId
                });
            }

            return true;
        }

        /**
         * Place a block adjacent to a face using raycast hit data.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} hitX - Global X of the raycast hit block.
         * @param {number} hitY - Global Y of the raycast hit block.
         * @param {number} hitZ - Global Z of the raycast hit block.
         * @param {number} faceNormalX - X of the face normal (which face was hit).
         * @param {number} faceNormalY - Y of the face normal.
         * @param {number} faceNormalZ - Z of the face normal.
         * @param {number} blockId - Block ID to place.
         * @param {Donkeycraft.Player} player - The player entity.
         * @returns {boolean} True if placed successfully.
         */
        function placeBlockFromRaycast(chunkManager, hitX, hitY, hitZ, faceNormalX, faceNormalY, faceNormalZ, blockId, player) {
            // Calculate placement position by subtracting face normal from hit position
            var placeX = hitX - faceNormalX;
            var placeY = hitY - faceNormalY;
            var placeZ = hitZ - faceNormalZ;

            return placeBlock(chunkManager, placeX, placeY, placeZ, blockId, player);
        }

        /**
         * Get the placement position from hit block and face normal.
         * @param {number} hitX - Global X of raycast hit block.
         * @param {number} hitY - Global Y of raycast hit block.
         * @param {number} hitZ - Global Z of raycast hit block.
         * @param {number} faceNormalX - X of face normal.
         * @param {number} faceNormalY - Y of face normal.
         * @param {number} faceNormalZ - Z of face normal.
         * @returns {{x: number, y: number, z: number}} Placement position.
         */
        function getPlacementPosition(hitX, hitY, hitZ, faceNormalX, faceNormalY, faceNormalZ) {
            return {
                x: hitX - faceNormalX,
                y: hitY - faceNormalY,
                z: hitZ - faceNormalZ
            };
        }

        /**
         * Check if a block can be placed at the given position without colliding with player.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @param {Donkeycraft.Player} player - The player entity.
         * @returns {boolean}
         */
        function canPlaceAt(chunkManager, x, y, z, player) {
            return _isValidPlacement(chunkManager, x, y, z, player);
        }

        /**
         * Get face normal constants for all 6 directions.
         * @returns {Array<{x: number, y: number, z: number}>}
         */
        function getFaceNormals() {
            return [
                { x: -1, y: 0, z: 0 },  // left
                { x: 1, y: 0, z: 0 },   // right
                { x: 0, y: -1, z: 0 },  // bottom
                { x: 0, y: 1, z: 0 },   // top
                { x: 0, y: 0, z: -1 },  // front
                { x: 0, y: 0, z: 1 }    // back
            ];
        }

        return {
            placeBlock: placeBlock,
            placeBlockFromRaycast: placeBlockFromRaycast,
            getPlacementPosition: getPlacementPosition,
            canPlaceAt: canPlaceAt,
            getFaceNormals: getFaceNormals
        };
    })();

})();