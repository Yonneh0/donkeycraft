// Donkeycraft — Mob AI
// Pathfinding (greedy best-first), line-of-sight, attack behavior, flee.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Direction constants for pathfinding.
     */
    Donkeycraft.AIDirection = {
        NONE: 0,
        NORTH: 1,   // -Z
        SOUTH: 2,   // +Z
        EAST: 3,    // +X
        WEST: 4,    // -X
        UP: 5,      // +Y
        DOWN: 6     // -Y
    };

    /**
     * Direction deltas for pathfinding.
     */
    Donkeycraft.AIDirectionDeltas = {
        1: { x: 0, y: 0, z: -1 },
        2: { x: 0, y: 0, z: 1 },
        3: { x: 1, y: 0, z: 0 },
        4: { x: -1, y: 0, z: 0 },
        5: { x: 0, y: 1, z: 0 },
        6: { x: 0, y: -1, z: 0 }
    };

    /**
     * MobAI — shared AI utilities for mob pathfinding and behavior.
     * Note: findPath uses greedy best-first search (not full A*), sufficient
     * for basic mob movement in a voxel world. For complex navigation, integrate
     * with a proper A* library.
     */
    Donkeycraft.MobAI = {};

    /**
     * Check line-of-sight between two points using DDA raycasting.
     * @param {number} x1 - Start X.
     * @param {number} y1 - Start Y.
     * @param {number} z1 - Start Z.
     * @param {number} x2 - End X.
     * @param {number} y2 - End Y.
     * @param {number} z2 - End Z.
     * @param {Function} isBlockSolid - Callback(x, y, z) returning truthy if block blocks vision.
     * @returns {boolean} True if line-of-sight exists.
     */
    Donkeycraft.MobAI.hasLineOfSight = function (x1, y1, z1, x2, y2, z2, isBlockSolid) {
        var dx = x2 - x1;
        var dy = y2 - y1;
        var dz = z2 - z1;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist === 0) {
            return true;
        }

        var steps = Math.ceil(dist * 2); // Sample every 0.5 blocks
        var stepX = dx / steps;
        var stepY = dy / steps;
        var stepZ = dz / steps;

        for (var i = 0; i <= steps; i++) {
            var cx = Math.floor(x1 + stepX * i);
            var cy = Math.floor(y1 + stepY * i);
            var cz = Math.floor(z1 + stepZ * i);

            if (isBlockSolid(cx, cy, cz)) {
                return false;
            }
        }

        return true;
    };

    /**
     * Simple greedy pathfinding on a 3D block grid.
     * Not full A* — uses direction selection based on distance to target.
     * @param {number} startX - Start X.
     * @param {number} startY - Start Y.
     * @param {number} startZ - Start Z.
     * @param {number} endX - End X.
     * @param {number} endY - End Y.
     * @param {number} endZ - End Z.
     * @param {Function} isWalkable - Callback(x, y, z) returning true if block is walkable.
     * @param {number} maxSteps - Maximum steps to prevent infinite loops.
     * @returns {Object|null} Path with 'steps' array and 'distance', or null if no path.
     */
    Donkeycraft.MobAI.findPath = function (startX, startY, startZ, endX, endY, endZ, isWalkable, maxSteps) {
        maxSteps = maxSteps || 200;

        var currentX = Math.floor(startX);
        var currentY = Math.floor(startY);
        var currentZ = Math.floor(startZ);
        var endFloorX = Math.floor(endX);
        var endFloorY = Math.floor(endY);
        var endFloorZ = Math.floor(endZ);

        if (currentX === endFloorX && currentY === endFloorY && currentZ === endFloorZ) {
            return { steps: 0, distance: 0 };
        }

        var path = [];
        var totalDistance = 0;
        var visited = {};

        for (var step = 0; step < maxSteps; step++) {
            var key = currentX + ',' + currentY + ',' + currentZ;
            if (visited[key]) {
                break; // Loop detected
            }
            visited[key] = true;

            if (currentX === endFloorX && currentY === endFloorY && currentZ === endFloorZ) {
                break; // Reached target
            }

            var bestDir = Donkeycraft.AIDirection.NONE;
            var bestDist = Number.MAX_VALUE;

            // Try each direction
            for (var dir in Donkeycraft.AIDirectionDeltas) {
                if (!Donkeycraft.AIDirectionDeltas.hasOwnProperty(dir)) {
                    continue;
                }

                var delta = Donkeycraft.AIDirectionDeltas[dir];
                var nx = currentX + delta.x;
                var ny = currentY + delta.y;
                var nz = currentZ + delta.z;

                // Check if walkable
                if (!isWalkable(nx, ny, nz)) {
                    continue;
                }

                // Calculate distance to target
                var dist = (nx - endFloorX) * (nx - endFloorX) +
                    (ny - endFloorY) * (ny - endFloorY) +
                    (nz - endFloorZ) * (nz - endFloorZ);

                if (dist < bestDist) {
                    bestDist = dist;
                    bestDir = parseInt(dir, 10);
                }
            }

            if (bestDir === Donkeycraft.AIDirection.NONE) {
                break; // No valid direction found
            }

            var delta = Donkeycraft.AIDirectionDeltas[bestDir];
            currentX += delta.x;
            currentY += delta.y;
            currentZ += delta.z;

            path.push({ x: currentX, y: currentY, z: currentZ, direction: bestDir });
            totalDistance += 1;
        }

        if (path.length === 0) {
            return null;
        }

        return { steps: path, distance: totalDistance };
    };

    /**
     * Calculate a simple chase direction toward a target.
     * @param {number} mobX - Mob current X.
     * @param {number} mobZ - Mob current Z.
     * @param {number} targetX - Target X.
     * @param {number} targetZ - Target Z.
     * @param {number} speed - Movement speed.
     * @returns {{vx: number, vz: number}} Velocity components.
     */
    Donkeycraft.MobAI.calculateChaseVelocity = function (mobX, mobZ, targetX, targetZ, speed) {
        var dx = targetX - mobX;
        var dz = targetZ - mobZ;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.5) {
            return {
                vx: (dx / dist) * speed,
                vz: (dz / dist) * speed
            };
        }

        return { vx: 0, vz: 0 };
    };

    /**
     * Calculate a flee direction away from a source.
     * @param {number} mobX - Mob current X.
     * @param {number} mobZ - Mob current Z.
     * @param {number} sourceX - Source X.
     * @param {number} sourceZ - Source Z.
     * @param {number} speed - Movement speed.
     * @returns {{vx: number, vz: number}} Velocity components.
     */
    Donkeycraft.MobAI.calculateFleeVelocity = function (mobX, mobZ, sourceX, sourceZ, speed) {
        var dx = mobX - sourceX;
        var dz = mobZ - sourceZ;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0) {
            return {
                vx: (dx / dist) * speed,
                vz: (dz / dist) * speed
            };
        }

        // Random flee direction if co-located
        var angle = Math.random() * Math.PI * 2;
        return {
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed
        };
    };

    /**
     * Check if a mob can "see" a player (simplified line-of-sight with DDA).
     * Air blocks (blockId 0 or falsy) never block vision.
     * @param {Donkeycraft.Entity} mob - Mob entity.
     * @param {Donkeycraft.Entity} player - Player entity.
     * @param {Function} getBlockId - Callback(x, y, z) returning block ID (0 = air).
     * @returns {boolean} True if mob can see player.
     */
    Donkeycraft.MobAI.canMobSeePlayer = function (mob, player, getBlockId) {
        var eyePos = mob.getEyePosition();
        var targetPos = player.getEyePosition();

        // Guard against destroyed entities
        if (!eyePos || !targetPos) {
            return false;
        }

        var dx = targetPos.x - eyePos.x;
        var dy = targetPos.y - eyePos.y;
        var dz = targetPos.z - eyePos.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist === 0) {
            return true;
        }

        var steps = Math.ceil(dist * 3);
        var stepX = dx / steps;
        var stepY = dy / steps;
        var stepZ = dz / steps;

        for (var i = 0; i <= steps; i++) {
            var bx = Math.floor(eyePos.x + stepX * i);
            var by = Math.floor(eyePos.y + stepY * i);
            var bz = Math.floor(eyePos.z + stepZ * i);

            var blockId = getBlockId(bx, by, bz);

            // Air blocks (0 or falsy) never block vision
            if (!blockId || blockId === 0) {
                continue;
            }

            // Check transparency using block.js if available
            if (Donkeycraft.Block && typeof Donkeycraft.Block.isTransparent === 'function') {
                if (!Donkeycraft.Block.isTransparent(blockId)) {
                    return false;
                }
            } else {
                // Fallback: assume all non-air blocks block vision
                return false;
            }
        }

        return true;
    };

    /**
     * Determine if a mob should flee from a player.
     * @param {Donkeycraft.Entity} mob - Mob entity.
     * @param {Donkeycraft.Entity} player - Player entity.
     * @param {number} fleeDistance - Distance at which mob flees.
     * @returns {boolean} True if mob should flee.
     */
    Donkeycraft.MobAI.shouldFlee = function (mob, player, fleeDistance) {
        fleeDistance = fleeDistance || 5;

        // Guard against destroyed entities
        var mobPos = mob.getPosition();
        var playerPos = player.getPosition();
        if (!mobPos || !playerPos) {
            return false;
        }

        var dx = mobPos.x - playerPos.x;
        var dy = mobPos.y - playerPos.y;
        var dz = mobPos.z - playerPos.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        return dist < fleeDistance && mob.health < mob.maxHealth * 0.3; // Flee when low health
    };

    /**
     * Get a random wander target within a given radius.
     * @param {number} centerX - Center X.
     * @param {number} centerZ - Center Z.
     * @param {number} [maxRadius=10] - Maximum wander radius.
     * @returns {{x: number, z: number}} Wander coordinates.
     */
    Donkeycraft.MobAI.getWanderTarget = function (centerX, centerZ, maxRadius) {
        maxRadius = maxRadius || 10;
        var angle = Math.random() * Math.PI * 2;
        var radius = Math.random() * maxRadius;
        return {
            x: centerX + Math.cos(angle) * radius,
            z: centerZ + Math.sin(angle) * radius
        };
    };

})();