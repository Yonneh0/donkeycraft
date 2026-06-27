// Donkeycraft — Raycasting
// DDA raycasting through voxels: hit detection, block face normal, reach distance.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;
    var PLAYER_REACH = Donkeycraft.Config.PLAYER_REACH;

    // Epsilon for floating-point zero checks — prevents division by near-zero numbers
    var EPSILON = 1e-6;

    // ============================================================
    // RaycastResult
    // ============================================================

    /**
     * RaycastResult — immutable result object from a successful DDA raycast,
     * containing the hit block coordinates, face normal, distance, and exact
     * 3D hit position on the block face.
     *
     * @constructor
     * @param {number} blockX - Global X coordinate of hit block.
     * @param {number} blockY - Global Y coordinate of hit block.
     * @param {number} blockZ - Global Z coordinate of hit block.
     * @param {number} faceNormalX - X component of face normal (which face was hit).
     * @param {number} faceNormalY - Y component of face normal.
     * @param {number} faceNormalZ - Z component of face normal.
     * @param {number} distance - Distance from ray origin to hit point.
     * @param {Donkeycraft.Vector3} hitPosition - 3D position of hit point on block face.
     */
    Donkeycraft.RaycastResult = function(blockX, blockY, blockZ, faceNormalX, faceNormalY, faceNormalZ, distance, hitPosition) {
        /**
         * Global X coordinate of the hit block.
         * @type {number}
         */
        this.blockX = blockX;

        /**
         * Global Y coordinate of the hit block.
         * @type {number}
         */
        this.blockY = blockY;

        /**
         * Global Z coordinate of the hit block.
         * @type {number}
         */
        this.blockZ = blockZ;

        /**
         * X component of the face normal (which face was hit).
         * @type {number}
         */
        this.faceNormalX = faceNormalX;

        /**
         * Y component of the face normal.
         * @type {number}
         */
        this.faceNormalY = faceNormalY;

        /**
         * Z component of the face normal.
         * @type {number}
         */
        this.faceNormalZ = faceNormalZ;

        /**
         * Distance from ray origin to hit point.
         * @type {number}
         */
        this.distance = distance;

        /**
         * 3D position of the hit point on the block face.
         * @type {Donkeycraft.Vector3}
         */
        this.hitPosition = hitPosition;
    };

    // ============================================================
    // Raycast
    // ============================================================

    /**
     * Raycast — DDA (Digital Differential Analyzer) voxel traversal for finding
     * block hits in the world. Returns a RaycastResult with hit position, face
     * normal, and distance when a solid block is intersected within reach.
     *
     * @namespace
     */
    Donkeycraft.Raycast = (function() {

        /**
         * Get the block ID at global coordinates using ChunkManager.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalY - Global Y coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @returns {number} Block ID (0 = air).
         * @private
         */
        function _getBlockId(chunkManager, globalX, globalY, globalZ) {
            // Out of world bounds = air
            if (globalY < 0 || globalY >= WORLD_HEIGHT) return 0;

            var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
            var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

            var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
            if (!chunk) return 0;

            var localX = Donkeycraft.Chunk.localCoordX(globalX);
            var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

            return chunk.getBlock(localX, globalY, localZ);
        }

        /**
         * Perform a DDA raycast through the world.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {Donkeycraft.Vector3} origin - Ray origin (usually player eye position).
         * @param {Donkeycraft.Vector3} direction - Ray direction (normalized).
         * @param {number} [reach=6.0] - Maximum reach distance.
         * @param {number[]} [ignoreIds] - Optional array of block IDs to skip.
         * @returns {Donkeycraft.RaycastResult|null} Hit result or null if no block hit.
         */
        function raycast(chunkManager, origin, direction, reach, ignoreIds) {
            reach = reach || PLAYER_REACH;

            // Clamp reach to valid range
            reach = Donkeycraft.clamp(reach, 1.0, 12.0);

            // Normalize direction if needed
            var dirLen = direction.length();
            var dirX, dirY, dirZ;
            if (dirLen > 0.00001) {
                dirX = direction.x / dirLen;
                dirY = direction.y / dirLen;
                dirZ = direction.z / dirLen;

                // Clamp near-zero components to exact zero to prevent division instability
                if (Math.abs(dirX) < EPSILON) dirX = 0;
                if (Math.abs(dirY) < EPSILON) dirY = 0;
                if (Math.abs(dirZ) < EPSILON) dirZ = 0;
            } else {
                return null; // Zero direction — invalid ray
            }

            // Build ignore set for O(1) lookup (convert array to sparse object)
            var ignoreSet = null;
            if (ignoreIds && ignoreIds.length > 0) {
                ignoreSet = {};
                for (var _i = 0; _i < ignoreIds.length; _i++) {
                    ignoreSet[ignoreIds[_i]] = true;
                }
            }

            // Helper: check if a block ID should be ignored
            var _shouldIgnore = (function(set) {
                return function(id) {
                    return set && set[id] === true;
                };
            }(ignoreSet));

            // Starting voxel coordinates
            var stepX, stepY, stepZ;
            var tMaxX, tMaxY, tMaxZ;
            var deltaTX, deltaTY, deltaTZ;

            // Current position and initial voxel
            var x = origin.x;
            var y = origin.y;
            var z = origin.z;

            var currentX = Math.floor(x);
            var currentY = Math.floor(y);
            var currentZ = Math.floor(z);

            // Determine step direction and tMax/deltaT for each axis
            // Note: dirX/Y/Z are already clamped to exact 0 if near-zero above
            if (dirX > 0) {
                stepX = 1;
                deltaTX = 1.0 / dirX;
                tMaxX = ((currentX + 1) - x) * deltaTX;
            } else if (dirX < 0) {
                stepX = -1;
                deltaTX = -1.0 / dirX;
                tMaxX = (x - currentX) * deltaTX;
            } else {
                stepX = 0;
                deltaTX = Infinity;
                tMaxX = Infinity;
            }

            if (dirY > 0) {
                stepY = 1;
                deltaTY = 1.0 / dirY;
                tMaxY = ((currentY + 1) - y) * deltaTY;
            } else if (dirY < 0) {
                stepY = -1;
                deltaTY = -1.0 / dirY;
                tMaxY = (y - currentY) * deltaTY;
            } else {
                stepY = 0;
                deltaTY = Infinity;
                tMaxY = Infinity;
            }

            if (dirZ > 0) {
                stepZ = 1;
                deltaTZ = 1.0 / dirZ;
                tMaxZ = ((currentZ + 1) - z) * deltaTZ;
            } else if (dirZ < 0) {
                stepZ = -1;
                deltaTZ = -1.0 / dirZ;
                tMaxZ = (z - currentZ) * deltaTZ;
            } else {
                stepZ = 0;
                deltaTZ = Infinity;
                tMaxZ = Infinity;
            }

            // Face normal of the face we entered from (opposite of step direction)
            var faceNormalX = -stepX;
            var faceNormalY = -stepY;
            var faceNormalZ = -stepZ;

            // DDA traversal loop.
            // First, check the starting voxel — if origin is inside a solid block,
            // return it immediately. This allows players to break blocks they're
            // spawned/glitched inside of.
            var t = 0;
            var maxSteps = Donkeycraft.WorldUtils.calculateRaycastMaxSteps(reach);
            var steps = 0;

            // Check starting voxel before stepping
            var startBlockId = _getBlockId(chunkManager, currentX, currentY, currentZ);
            if (startBlockId !== 0 && !_shouldIgnore(startBlockId)) {
                var startHitPos = new Donkeycraft.Vector3(
                    origin.x + dirX * t,
                    origin.y + dirY * t,
                    origin.z + dirZ * t
                );
                return new Donkeycraft.RaycastResult(
                    currentX, currentY, currentZ,
                    0, 0, 0, // face normal is undefined when inside block
                    t, startHitPos
                );
            }

            while (t <= reach && steps < maxSteps) {
                // Advance along the axis with smallest tMax
                if (tMaxX < tMaxY && tMaxX < tMaxZ) {
                    currentX += stepX;
                    faceNormalX = -stepX;
                    faceNormalY = 0;
                    faceNormalZ = 0;
                    t = tMaxX;
                    tMaxX += deltaTX;
                } else if (tMaxY < tMaxZ) {
                    // Step in Y — entering block from its bottom face (normal = -stepY)
                    currentY += stepY;
                    faceNormalX = 0;
                    faceNormalY = -stepY;
                    faceNormalZ = 0;
                    t = tMaxY;
                    tMaxY += deltaTY;
                } else {
                    // Step in Z — entering block from its front face (normal = -stepZ)
                    currentZ += stepZ;
                    faceNormalX = 0;
                    faceNormalY = 0;
                    faceNormalZ = -stepZ;
                    t = tMaxZ;
                    tMaxZ += deltaTZ;
                }

                // Clamp t to reach after stepping — prevents entering a block beyond reach distance.
                // The while condition checks t at loop entry, but t can exceed reach after the step.
                if (t > reach) break;

                // Check if we hit a solid block (and it's not in the ignore list)
                var hitBlockId = _getBlockId(chunkManager, currentX, currentY, currentZ);
                if (hitBlockId !== 0 && !_shouldIgnore(hitBlockId)) {
                    // Compute the exact hit position on the face
                    var hitPos = new Donkeycraft.Vector3(
                        origin.x + dirX * t,
                        origin.y + dirY * t,
                        origin.z + dirZ * t
                    );

                    return new Donkeycraft.RaycastResult(
                        currentX, currentY, currentZ,
                        faceNormalX, faceNormalY, faceNormalZ,
                        t, hitPos
                    );
                }

                steps++;
            }

            // No block hit within reach
            return null;
        }


        /**
         * Get the forward direction vector from player yaw and pitch angles.
         * The resulting vector points in the direction the player is looking.
         * @param {number} yaw - Yaw angle in radians (positive = turning left).
         * @param {number} pitch - Pitch angle in radians (positive = looking up).
         * @returns {Donkeycraft.Vector3} Direction vector (normalized).
         */
        function getDirectionFromRotation(yaw, pitch) {
            var sp = Math.sin(pitch);
            var cp = Math.cos(pitch);
            var sy = Math.sin(yaw);
            var cy = Math.cos(yaw);

            return new Donkeycraft.Vector3(
                -cp * sy,  // X: forward component from yaw
                -sp,       // Y: vertical component from pitch
                -cp * cy   // Z: forward component from yaw
            );
        }

        /**
         * Get face normal vectors for all 6 block face directions.
         * Used by downstream systems (block placement, HUD highlighting) to determine
         * which face was hit for adjacency calculations.
         * @returns {Array<{x: number, y: number, z: number}>} Array of 6 face normal objects.
         */
        function getFaceNormals() {
            return [
                { x: -1, y: 0, z: 0 },  // left face
                { x: 1, y: 0, z: 0 },   // right face
                { x: 0, y: -1, z: 0 },  // bottom face
                { x: 0, y: 1, z: 0 },   // top face
                { x: 0, y: 0, z: -1 },  // front face
                { x: 0, y: 0, z: 1 }    // back face
            ];
        }

        return {
            raycast: raycast,
            getDirectionFromRotation: getDirectionFromRotation,
            getFaceNormals: getFaceNormals
        };
    })();

})();