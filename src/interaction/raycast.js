// Donkeycraft — Raycaster
// DDA raycasting through voxels: hit detection, block face normal, reach distance.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // RaycastResult — result of a raycast operation.
    // ============================================================

    /**
     * RaycastResult — represents the result of a successful raycast.
     * @param {number} x - Hit block X coordinate.
     * @param {number} y - Hit block Y coordinate.
     * @param {number} z - Hit block Z coordinate.
     * @param {number} faceX - Face normal X (-1, 0, or 1).
     * @param {number} faceY - Face normal Y (-1, 0, or 1).
     * @param {number} faceZ - Face normal Z (-1, 0, or 1).
     * @param {number} distance - Distance from start to hit point.
     * @param {Donkeycraft.Vector3} hitPos - Exact hit position along ray.
     */
    Donkeycraft.RaycastResult = function(x, y, z, faceX, faceY, faceZ, distance, hitPos) {
        /**
         * Hit block X coordinate.
         * @type {number}
         */
        this.x = x;

        /**
         * Hit block Y coordinate.
         * @type {number}
         */
        this.y = y;

        /**
         * Hit block Z coordinate.
         * @type {number}
         */
        this.z = z;

        /**
         * Face normal X component (-1, 0, or 1).
         * @type {number}
         */
        this.faceX = faceX;

        /**
         * Face normal Y component (-1, 0, or 1).
         * @type {number}
         */
        this.faceY = faceY;

        /**
         * Face normal Z component (-1, 0, or 1).
         * @type {number}
         */
        this.faceZ = faceZ;

        /**
         * Distance from ray origin to hit point.
         * @type {number}
         */
        this.distance = distance;

        /**
         * Exact hit position as a Vector3.
         * @type {Donkeycraft.Vector3}
         */
        this.hitPos = hitPos;
    };

    // ============================================================
    // Raycaster — DDA voxel traversal and hit detection.
    // ============================================================

    /**
     * Raycaster — performs DDA (Digital Differential Analyzer) raycasting through a voxel world.
     */
    Donkeycraft.Raycaster = function() {
        // No state needed — all operations are stateless and take callbacks.
    };

    /**
     * Cast a ray through the voxel world using the DDA algorithm.
     * @param {Donkeycraft.Vector3} start - Ray origin (player eye position).
     * @param {Donkeycraft.Vector3} direction - Ray direction (must be normalized).
     * @param {number} reach - Maximum reach distance in blocks.
     * @param {Function} getBlock - Callback: getBlock(x, y, z) returns block ID (0 = air).
     * @returns {Donkeycraft.RaycastResult|null} Hit result or null if no block hit.
     */
    Donkeycraft.Raycaster.prototype.cast = function(start, direction, reach, getBlock) {
        // Current voxel coordinates
        var x = Math.floor(start.x);
        var y = Math.floor(start.y);
        var z = Math.floor(start.z);

        // Direction signs for each axis
        var stepX, stepY, stepZ;
        var deltaDistX, deltaDistY, deltaDistZ;

        // Side distance to next boundary crossing
        var sideDistX, sideDistY, sideDistZ;

        // Compute step directions and initial deltas
        if (direction.x < 0) {
            stepX = -1;
            sideDistX = (start.x - x) * Math.abs(1 / direction.x);
        } else if (direction.x > 0) {
            stepX = 1;
            sideDistX = (x + 1 - start.x) * Math.abs(1 / direction.x);
        } else {
            stepX = 0;
            sideDistX = Infinity;
        }

        if (direction.y < 0) {
            stepY = -1;
            sideDistY = (start.y - y) * Math.abs(1 / direction.y);
        } else if (direction.y > 0) {
            stepY = 1;
            sideDistY = (y + 1 - start.y) * Math.abs(1 / direction.y);
        } else {
            stepY = 0;
            sideDistY = Infinity;
        }

        if (direction.z < 0) {
            stepZ = -1;
            sideDistZ = (start.z - z) * Math.abs(1 / direction.z);
        } else if (direction.z > 0) {
            stepZ = 1;
            sideDistZ = (z + 1 - start.z) * Math.abs(1 / direction.z);
        } else {
            stepZ = 0;
            sideDistZ = Infinity;
        }

        // Delta distances between boundaries
        if (direction.x !== 0) {
            deltaDistX = Math.abs(1 / direction.x);
        } else {
            deltaDistX = Infinity;
        }
        if (direction.y !== 0) {
            deltaDistY = Math.abs(1 / direction.y);
        } else {
            deltaDistY = Infinity;
        }
        if (direction.z !== 0) {
            deltaDistZ = Math.abs(1 / direction.z);
        } else {
            deltaDistZ = Infinity;
        }

        // Previous voxel for face normal calculation
        var prevX = x, prevY = y, prevZ = z;

        // Track which side was crossed last (for distance calculation)
        var hitSide = 'none';

        // DDA traversal — step through voxels until we hit a solid block or exceed reach
        for (var step = 0; step < Math.ceil(reach * 3); step++) {
            // Check the current block
            var blockId = getBlock(x, y, z);
            if (blockId !== 0 && blockId !== undefined) {
                // Found a solid block — determine distance from side that was crossed
                var t;
                if (hitSide === 'x') {
                    t = sideDistX;
                } else if (hitSide === 'y') {
                    t = sideDistY;
                } else if (hitSide === 'z') {
                    t = sideDistZ;
                } else {
                    // First step — use distance to first boundary
                    t = Math.min(sideDistX, sideDistY, sideDistZ);
                }

                // Clamp t to reach
                if (t > reach) t = reach;

                // Calculate the exact hit position on the block surface
                var hitPos = new Donkeycraft.Vector3(
                    start.x + direction.x * t,
                    start.y + direction.y * t,
                    start.z + direction.z * t
                );

                // Determine face normal from previous position
                var faceX = x - prevX;
                var faceY = y - prevY;
                var faceZ = z - prevZ;

                return new Donkeycraft.RaycastResult(
                    x, y, z,
                    faceX, faceY, faceZ,
                    t,
                    hitPos
                );
            }

            // Step to next voxel — cross the closest boundary
            if (sideDistX < sideDistY) {
                if (sideDistX < sideDistZ) {
                    prevX = x;
                    x += stepX;
                    sideDistX += deltaDistX;
                    hitSide = 'x';
                } else {
                    prevZ = z;
                    z += stepZ;
                    sideDistZ += deltaDistZ;
                    hitSide = 'z';
                }
            } else {
                if (sideDistY < sideDistZ) {
                    prevY = y;
                    y += stepY;
                    sideDistY += deltaDistY;
                    hitSide = 'y';
                } else {
                    prevZ = z;
                    z += stepZ;
                    sideDistZ += deltaDistZ;
                    hitSide = 'z';
                }
            }

            // Check if we've exceeded reach distance
            var currentDist = Math.max(sideDistX, sideDistY, sideDistZ);
            if (currentDist > reach) {
                return null;
            }
        }

        return null; // No block hit within reach
    };

    /**
     * Get the face normal as a Vector3.
     * @param {Donkeycraft.RaycastResult} result - Raycast result.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Raycaster.getFaceNormal = function(result) {
        return new Donkeycraft.Vector3(result.faceX, result.faceY, result.faceZ);
    };

    /**
     * Get the hit position as a Vector3.
     * @param {Donkeycraft.RaycastResult} result - Raycast result.
     * @returns {Donkeycraft.Vector3}
     */
    Donkeycraft.Raycaster.getHitPosition = function(result) {
        return Donkeycraft.Vector3.copy(result.hitPos);
    };

    /**
     * Get the opposite face normal (for block placement).
     * @param {Donkeycraft.RaycastResult} result - Raycast result.
     * @returns {{x: number, y: number, z: number}}
     */
    Donkeycraft.Raycaster.getOppositeFace = function(result) {
        return {
            x: -result.faceX,
            y: -result.faceY,
            z: -result.faceZ
        };
    };

})();