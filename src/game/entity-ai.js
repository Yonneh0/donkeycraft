// Donkeycraft — Mob AI & Navigation System
// Full A* pathfinding, navmesh support, AI state machine, ambush/attack/flee behaviors.
/**
 * @module entity-ai
 * @description AI navigation and behavior system for game entities.
 *
 * This module provides a comprehensive AI framework including:
 * - A* pathfinding algorithm on 3D grids
 * - NavMesh (navigation mesh) for walkability queries
 * - AI state machine with multiple behaviors
 * - Entity-specific behavior profiles
 *
 * @example Basic usage
 * var aiComponent = new Donkeycraft.AIComponent(entity);
 * aiComponent.setProfile('zombie');
 * aiComponent.setNavMesh(navMesh);
 * aiComponent.tick(deltaTime);
 */
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    var Config = Donkeycraft.Config;

    // ============================================================
    // Constants — Movement Speeds & Distances
    // ============================================================

    /**
     * Default movement speeds for different AI behaviors.
     * @namespace
     */
    Donkeycraft.AISpeeds = {
        IDLE: 0,          // Stationary
        WANDER: 1.0,      // Casual wandering
        CHASE: 2.5,       // Pursuing a target
        FLEE: 3.0,        // Retreating from danger
        AMBUSH: 1.5,      // Stealthy stalking
        ATTACK: 2.0,      // Engaging in combat
        FOLLOW: 2.0,      // Following a leader
        PATROL: 1.5       // Moving between patrol points
    };

    /**
     * Default detection distances for different AI behaviors.
     * @namespace
     */
    Donkeycraft.AIDistances = {
        ATTACK_RANGE: 1.5,      // Melee attack range in blocks
        PATROL_RECALC: 1.0,     // Path recalculation interval (seconds)
        FLEE_SAFETY_MARGIN: 2.5 // Multiplier for flee distance
    };

    /**
     * Default pathfinding parameters.
     * @namespace
     */
    Donkeycraft.AStarDefaults = {
        MAX_STEPS: 500,         // Maximum search iterations
        WANDER_MAX_STEPS: 200,  // Max steps for wander paths
        CHASE_MAX_STEPS: 300,   // Max steps for chase paths
        AMBUSH_MAX_STEPS: 200,  // Max steps for ambush paths
        FLEE_MAX_STEPS: 200,    // Max steps for flee paths
        ATTACK_MAX_STEPS: 150   // Max steps for attack paths
    };

    // ============================================================
    // Direction Constants
    // ============================================================

    /**
     * Direction constants for pathfinding and movement.
     * @namespace
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
     * @type {Object.<number, {x:number, y:number, z:number}>}
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
     * Cardinal directions (XZ plane only) for ground movement.
     * @type {Array<number>}
     */
    Donkeycraft.AICardinalDirections = [1, 2, 3, 4];

    /**
     * All walkable directions including vertical.
     * @type {Array<number>}
     */
    Donkeycraft.AIAllDirections = [1, 2, 3, 4, 5, 6];

    // ============================================================
    // AI State Constants
    // ============================================================

    /**
     * AIState — Named states for the AI state machine.
     * @namespace
     */
    Donkeycraft.AIState = {
        IDLE: 'idle',
        WANDER: 'wander',
        CHASE: 'chase',
        FLEE: 'flee',
        AMBUSH: 'ambush',
        ATTACK: 'attack',
        FOLLOW: 'follow',
        PATROL: 'patrol',
        HURT: 'hurt'
    };

    /**
     * AIBehaviorProfile — Default behavior profiles per entity type.
     * @type {Object.<string, AIBehaviorProfile>}
     */
    Donkeycraft.AIBehaviorProfiles = {
        cow: {
            fleeDistance: 8, fleeChance: 0.7, wanderRadius: 15, wanderInterval: 3.0,
            chaseDistance: 0, attackDamage: 0, attackCooldown: 0, ambushDistance: 0,
            smartPathfinding: false, canJump: false
        },
        pig: {
            fleeDistance: 8, fleeChance: 0.7, wanderRadius: 12, wanderInterval: 3.5,
            chaseDistance: 0, attackDamage: 0, attackCooldown: 0, ambushDistance: 0,
            smartPathfinding: false, canJump: false
        },
        donkey: {
            fleeDistance: 10, fleeChance: 0.8, wanderRadius: 20, wanderInterval: 4.0,
            chaseDistance: 0, attackDamage: 0, attackCooldown: 0, ambushDistance: 0,
            smartPathfinding: true, canJump: true
        },
        chicken: {
            fleeDistance: 6, fleeChance: 0.9, wanderRadius: 10, wanderInterval: 2.5,
            chaseDistance: 0, attackDamage: 0, attackCooldown: 0, ambushDistance: 0,
            smartPathfinding: false, canJump: false
        },
        zombie: {
            fleeDistance: 0, fleeChance: 0, wanderRadius: 20, wanderInterval: 4.0,
            chaseDistance: 32, attackDamage: 3, attackCooldown: 1.5, ambushDistance: 0,
            smartPathfinding: true, canJump: true, aggressionRange: 32, patrolPoints: null
        },
        skeleton: {
            fleeDistance: 0, fleeChance: 0, wanderRadius: 15, wanderInterval: 5.0,
            chaseDistance: 24, rangedDistance: 16, attackDamage: 2, attackCooldown: 2.0,
            ambushDistance: 0, smartPathfinding: true, canJump: false,
            aggressionRange: 24, keepDistance: 8, retreatDistance: 4
        },
        creeper: {
            fleeDistance: 0, fleeChance: 0, wanderRadius: 10, wanderInterval: 3.0,
            chaseDistance: 8, attackDamage: 1, attackCooldown: 0, ambushDistance: 12,
            smartPathfinding: true, canJump: false, aggressionRange: 12, sneakDistance: 10
        },
        spider: {
            fleeDistance: 0, fleeChance: 0, wanderRadius: 25, wanderInterval: 3.0,
            chaseDistance: 32, attackDamage: 2, attackCooldown: 1.0, ambushDistance: 8,
            smartPathfinding: true, canJump: true, aggressionRange: 32, climbWalls: true
        },
        enderman: {
            fleeDistance: 0, fleeChance: 0, wanderRadius: 40, wanderInterval: 5.0,
            chaseDistance: 64, attackDamage: 5, attackCooldown: 1.0, ambushDistance: 0,
            smartPathfinding: true, canJump: false, aggressionRange: 64,
            teleportChance: 0.01, teleportsEnabled: true
        },
        player: {
            fleeDistance: 0, fleeChance: 0, wanderRadius: 0, wanderInterval: 0,
            chaseDistance: 0, attackDamage: 0, attackCooldown: 0, ambushDistance: 0,
            smartPathfinding: false, canJump: true
        },
        npc: {
            fleeDistance: 5, fleeChance: 0.3, wanderRadius: 10, wanderInterval: 4.0,
            chaseDistance: 16, attackDamage: 1, attackCooldown: 2.0, ambushDistance: 0,
            smartPathfinding: true, canJump: true
        },
        generic: {
            fleeDistance: 6, fleeChance: 0.5, wanderRadius: 15, wanderInterval: 3.0,
            chaseDistance: 16, attackDamage: 1, attackCooldown: 1.5, ambushDistance: 0,
            smartPathfinding: true, canJump: false
        }
    };

    // ============================================================
    // NavMesh System — Walkability Grid & Navigation Regions
    // ============================================================

    /**
     * NavMeshCell — A single cell in the navigation grid.
     * @constructor
     * @param {number} x - Grid X coordinate.
     * @param {number} y - Grid Y coordinate.
     * @param {number} z - Grid Z coordinate.
     */
    Donkeycraft.NavMeshCell = function (x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.walkable = true;
        this.explored = false;
        this.key = x + ',' + y + ',' + z;
    };

    /**
     * NavMesh — 3D navigation grid for pathfinding queries.
     * @constructor
     * @param {number} [cellSize=1] - Size of each cell in world units.
     * @param {number} [maxRadius=200] - Maximum query radius in blocks.
     */
    Donkeycraft.NavMesh = function (cellSize, maxRadius) {
        this.cellSize = cellSize || 1;
        this.maxRadius = maxRadius || 200;
        this._cells = {};
        this._getBlockId = null;
        this._useTransparency = true;
    };

    /**
     * setBlockQuery — Set the callback used to query block solidity.
     * @param {Function} getBlockId - Callback(worldX, worldY, worldZ) → blockId (0 = air).
     */
    Donkeycraft.NavMesh.prototype.setBlockQuery = function (getBlockId) {
        this._getBlockId = getBlockId;
    };

    /**
     * isWalkable — Check if a world position is walkable.
     * @param {number} wx - World X coordinate.
     * @param {number} wy - World Y coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {boolean} True if the cell is walkable.
     */
    Donkeycraft.NavMesh.prototype.isWalkable = function (wx, wy, wz) {
        var cx = Math.floor(wx / this.cellSize);
        var cy = Math.floor(wy / this.cellSize);
        var cz = Math.floor(wz / this.cellSize);
        return this._getCell(cx, cy, cz).walkable;
    };

    /**
     * _getCell — Get or create a navmesh cell at grid coordinates.
     * @private
     */
    Donkeycraft.NavMesh.prototype._getCell = function (cx, cy, cz) {
        var key = cx + ',' + cy + ',' + cz;
        if (!this._cells[key]) {
            this._cells[key] = new Donkeycraft.NavMeshCell(cx, cy, cz);
            this._updateCellWalkability(cx, cy, cz);
        }
        return this._cells[key];
    };

    /**
     * _updateCellWalkability — Recalculate walkability for a cell based on world blocks.
     * @private
     */
    Donkeycraft.NavMesh.prototype._updateCellWalkability = function (cx, cy, cz) {
        var cell = this._cells[cx + ',' + cy + ',' + cz];
        if (!cell) return;

        var wx = cx * this.cellSize + this.cellSize / 2;
        var wy = cy * this.cellSize + this.cellSize / 2;
        var wz = cz * this.cellSize + this.cellSize / 2;

        if (!this._getBlockId) {
            cell.walkable = true;
            return;
        }

        var blockId = this._getBlockId(Math.floor(wx), Math.floor(wy), Math.floor(wz));

        if (!blockId || blockId === 0) {
            cell.walkable = true;
            return;
        }

        var isSolid = true;
        if (Donkeycraft.Block && typeof Donkeycraft.Block.isTransparent === 'function') {
            isSolid = !Donkeycraft.Block.isTransparent(blockId);
        } else {
            isSolid = true;
        }

        var blockBelowId = this._getBlockId(Math.floor(wx), Math.floor(wy) - 1, Math.floor(wz));
        var hasSupport = !(!blockBelowId || blockBelowId === 0);

        cell.walkable = !isSolid && hasSupport;
    };

    /**
     * refreshCell — Force a walkability recalculation for a cell.
     * @param {number} cx - Grid X.
     * @param {number} cy - Grid Y.
     * @param {number} cz - Grid Z.
     */
    Donkeycraft.NavMesh.prototype.refreshCell = function (cx, cy, cz) {
        var cell = this._cells[cx + ',' + cy + ',' + cz];
        if (cell) {
            this._updateCellWalkability(cx, cy, cz);
        }
    };

    /**
     * getWalkableNeighbors — Get walkable neighboring cells.
     * @param {number} cx - Grid X.
     * @param {number} cy - Grid Y.
     * @param {number} cz - Grid Z.
     * @param {boolean} [includeVertical=false] - Include up/down neighbors.
     * @returns {Array<{x:number, y:number, z:number}>} Walkable neighbor grid coords.
     */
    Donkeycraft.NavMesh.prototype.getWalkableNeighbors = function (cx, cy, cz, includeVertical) {
        var dirs = includeVertical ? Donkeycraft.AIAllDirections : Donkeycraft.AICardinalDirections;
        var neighbors = [];

        for (var i = 0; i < dirs.length; i++) {
            var delta = Donkeycraft.AIDirectionDeltas[dirs[i]];
            var nx = cx + delta.x;
            var ny = cy + delta.y;
            var nz = cz + delta.z;

            if (this.isWalkable(nx * this.cellSize, ny * this.cellSize, nz * this.cellSize)) {
                neighbors.push({ x: nx, y: ny, z: nz });
            }
        }

        return neighbors;
    };

    /**
     * findPath — Convenience method to find a path using the navmesh.
     * @param {number} sx - Start X.
     * @param {number} sy - Start Y.
     * @param {number} sz - Start Z.
     * @param {number} ex - End X.
     * @param {number} ey - End Y.
     * @param {number} ez - End Z.
     * @param {number} [maxSteps=500] - Maximum pathfinding steps.
     * @returns {{path: Array, steps: number, found: boolean}|null} Path result.
     */
    Donkeycraft.NavMesh.prototype.findPath = function (sx, sy, sz, ex, ey, ez, maxSteps) {
        var pathfinder = new Donkeycraft.AStarPathfinder(this.cellSize);
        pathfinder.setNavMesh(this);
        return pathfinder.findPath(sx, sy, sz, ex, ey, ez, maxSteps);
    };

    /**
     * clear — Clear all cells from the navmesh.
     */
    Donkeycraft.NavMesh.prototype.clear = function () {
        this._cells = {};
    };

    /**
     * getCellCount — Get the number of cells in the navmesh.
     * @returns {number}
     */
    Donkeycraft.NavMesh.prototype.getCellCount = function () {
        return Object.keys(this._cells).length;
    };

    // ============================================================
    // A* Pathfinding Algorithm
    // ============================================================

    /**
     * AStarNode — A node in the A* search tree.
     * @constructor
     * @param {number} x - Grid X coordinate.
     * @param {number} y - Grid Y coordinate.
     * @param {number} z - Grid Z coordinate.
     * @param {Donkeycraft.AStarNode} [parent] - Parent node, or null for start node.
     */
    Donkeycraft.AStarNode = function (x, y, z, parent) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.parent = parent || null;
        this.f = 0;
        this.g = 0;
        this.h = 0;
        this.key = x + ',' + y + ',' + z;
    };

    /**
     * AStarPathfinder — True A* pathfinding on a 3D grid.
     * @constructor
     * @param {number} [cellSize=1] - Size of each cell in world units.
     */
    Donkeycraft.AStarPathfinder = function (cellSize) {
        this.cellSize = cellSize || 1;
        this._navMesh = null;
        this._nodeMap = {};
    };

    /**
     * setNavMesh — Set the navmesh to use for walkability queries.
     * @param {Donkeycraft.NavMesh} navMesh - NavMesh instance.
     */
    Donkeycraft.AStarPathfinder.prototype.setNavMesh = function (navMesh) {
        this._navMesh = navMesh;
    };

    /**
     * _heuristic — Admissible heuristic (Manhattan distance) for grid coordinates.
     * @private
     */
    Donkeycraft.AStarPathfinder.prototype._heuristic = function (ax, ay, az, bx, by, bz) {
        var dx = Math.abs(ax - bx);
        var dy = Math.abs(ay - by);
        var dz = Math.abs(az - bz);
        return dx + dy + dz;
    };

    /**
     * _getOrCreateNode — Get or create an A* node for grid coordinates.
     * @private
     */
    Donkeycraft.AStarPathfinder.prototype._getOrCreateNode = function (x, y, z) {
        var key = x + ',' + y + ',' + z;
        if (!this._nodeMap[key]) {
            this._nodeMap[key] = new Donkeycraft.AStarNode(x, y, z);
        }
        return this._nodeMap[key];
    };

    /**
     * _reconstructPath — Reconstruct the path from goal node back to start.
     * @private
     */
    Donkeycraft.AStarPathfinder.prototype._reconstructPath = function (goalNode) {
        var path = [];
        var current = goalNode;

        while (current) {
            path.push({
                x: current.x * this.cellSize,
                y: current.y * this.cellSize,
                z: current.z * this.cellSize
            });
            current = current.parent;
        }

        var result = [];
        for (var i = path.length - 1; i >= 0; i--) {
            result.push(path[i]);
        }

        return result;
    };

    /**
     * _getNeighbors — Get walkable neighbor nodes for a given node.
     * @private
     */
    Donkeycraft.AStarPathfinder.prototype._getNeighbors = function (node, includeVertical) {
        var dirs = includeVertical ? Donkeycraft.AIAllDirections : Donkeycraft.AICardinalDirections;
        var neighbors = [];

        for (var i = 0; i < dirs.length; i++) {
            var delta = Donkeycraft.AIDirectionDeltas[dirs[i]];
            var nx = node.x + delta.x;
            var ny = node.y + delta.y;
            var nz = node.z + delta.z;

            var walkable = true;
            if (this._navMesh) {
                try {
                    walkable = this._navMesh.isWalkable(
                        nx * this.cellSize, ny * this.cellSize, nz * this.cellSize
                    );
                } catch (e) {
                    // If navmesh query fails, treat as non-walkable for safety
                    walkable = false;
                }
            }

            if (walkable) {
                var neighborNode = this._getOrCreateNode(nx, ny, nz);
                var cost = (dirs[i] <= 4) ? 1.0 : 1.414;
                neighbors.push({ node: neighborNode, cost: cost });
            }
        }

        return neighbors;
    };

    /**
     * findPath — Find a path from start to goal using A*.
     * @param {number} startX - Start X (world coords).
     * @param {number} startY - Start Y (world coords).
     * @param {number} startZ - Start Z (world coords).
     * @param {number} endX - End X (world coords).
     * @param {number} endY - End Y (world coords).
     * @param {number} endZ - End Z (world coords).
     * @param {number} [maxSteps=500] - Maximum search iterations.
     * @param {boolean} [includeVertical=true] - Allow up/down movement.
     * @returns {{path: Array, steps: number, found: boolean}|null} Path result.
     */
    Donkeycraft.AStarPathfinder.prototype.findPath = function (startX, startY, startZ, endX, endY, endZ, maxSteps, includeVertical) {
        maxSteps = maxSteps || Donkeycraft.AStarDefaults.MAX_STEPS;
        includeVertical = includeVertical !== false;

        this._nodeMap = {};

        var sx = Math.floor(startX / this.cellSize);
        var sy = Math.floor(startY / this.cellSize);
        var sz = Math.floor(startZ / this.cellSize);
        var ex = Math.floor(endX / this.cellSize);
        var ey = Math.floor(endY / this.cellSize);
        var ez = Math.floor(endZ / this.cellSize);

        if (sx === ex && sy === ey && sz === ez) {
            return { path: [], steps: 0, found: true };
        }

        // Validate start position is walkable
        if (this._navMesh && !this._navMesh.isWalkable(startX, startY, startZ)) {
            return null;
        }

        var startNode = this._getOrCreateNode(sx, sy, sz);
        startNode.g = 0;
        startNode.h = this._heuristic(sx, sy, sz, ex, ey, ez);
        startNode.f = startNode.g + startNode.h;

        var openSet = [startNode];
        var closedSet = {};
        var found = false;
        var steps = 0;

        while (openSet.length > 0 && steps < maxSteps) {
            steps++;

            var lowestIdx = 0;
            for (var i = 1; i < openSet.length; i++) {
                if (openSet[i].f < openSet[lowestIdx].f) {
                    lowestIdx = i;
                }
            }

            var current = openSet[lowestIdx];

            if (current.x === ex && current.y === ey && current.z === ez) {
                found = true;
                break;
            }

            openSet.splice(lowestIdx, 1);
            closedSet[current.key] = true;

            var neighborList;
            try {
                neighborList = this._getNeighbors(current, includeVertical);
            } catch (e) {
                // Skip this node if neighbor query fails
                continue;
            }

            for (var j = 0; j < neighborList.length; j++) {
                var neighbor = neighborList[j];
                var neighborNode = neighbor.node;

                if (closedSet[neighborNode.key]) {
                    continue;
                }

                var tentativeG = current.g + neighbor.cost;

                if (!openSet.includes(neighborNode)) {
                    neighborNode.parent = current;
                    neighborNode.g = tentativeG;
                    neighborNode.h = this._heuristic(neighborNode.x, neighborNode.y, neighborNode.z, ex, ey, ez);
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    openSet.push(neighborNode);
                } else if (tentativeG < neighborNode.g) {
                    neighborNode.parent = current;
                    neighborNode.g = tentativeG;
                    neighborNode.f = neighborNode.g + neighborNode.h;

                    if (!openSet.includes(neighborNode)) {
                        openSet.push(neighborNode);
                    }
                }
            }
        }

        if (!found) {
            return null;
        }

        var path = this._reconstructPath(current);

        return {
            path: path,
            steps: path.length,
            found: true
        };
    };

    /**
     * smoothPath — Smooth a path by removing unnecessary waypoints using line-of-sight chunking.
     * @param {Array<{x:number,y:number,z:number}>} path - Input path waypoints.
     * @param {Function} hasLineOfSight - Callback(x1,y1,z1,x2,y2,z2) → boolean.
     * @returns {Array<{x:number,y:number,z:number}>} Smoothed path.
     */
    Donkeycraft.AStarPathfinder.smoothPath = function (path, hasLineOfSight) {
        if (!path || path.length <= 2) return path;

        var smoothed = [path[0]];
        var currentIdx = 0;

        while (currentIdx < path.length - 1) {
            var bestIdx = currentIdx + 1;

            for (var i = path.length - 1; i > currentIdx; i--) {
                var p1 = path[currentIdx];
                var p2 = path[i];

                if (hasLineOfSight && hasLineOfSight(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)) {
                    bestIdx = i;
                    break;
                }
            }

            smoothed.push(path[bestIdx]);
            currentIdx = bestIdx;

            if (currentIdx >= path.length - 1) break;
        }

        return smoothed;
    };

    // ============================================================
    // Line-of-Sight Utilities
    // ============================================================

    /**
     * hasLineOfSight — Check line-of-sight between two points using DDA raycasting.
     * @param {number} x1 - Start X.
     * @param {number} y1 - Start Y.
     * @param {number} z1 - Start Z.
     * @param {number} x2 - End X.
     * @param {number} y2 - End Y.
     * @param {number} z2 - End Z.
     * @param {Function} [isBlockSolid] - Callback(x, y, z) returning truthy if block blocks vision.
     * @returns {boolean} True if line-of-sight exists.
     */
    Donkeycraft.MobAI = {};

    Donkeycraft.MobAI.hasLineOfSight = function (x1, y1, z1, x2, y2, z2, isBlockSolid) {
        var dx = x2 - x1;
        var dy = y2 - y1;
        var dz = z2 - z1;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist === 0) return true;

        var steps = Math.ceil(dist * 2);
        var stepX = dx / steps;
        var stepY = dy / steps;
        var stepZ = dz / steps;

        for (var i = 0; i <= steps; i++) {
            var cx = Math.floor(x1 + stepX * i);
            var cy = Math.floor(y1 + stepY * i);
            var cz = Math.floor(z1 + stepZ * i);

            // Use provided isBlockSolid callback first
            if (isBlockSolid && isBlockSolid(cx, cy, cz)) {
                return false;
            }

            // Fall back to world block query
            var blockId = 0;
            if (Donkeycraft._worldGetBlockId) {
                blockId = Donkeycraft._worldGetBlockId(cx, cy, cz);
            }

            if (blockId && blockId !== 0) {
                if (Donkeycraft.Block && typeof Donkeycraft.Block.isTransparent === 'function') {
                    if (!Donkeycraft.Block.isTransparent(blockId)) {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }

        return true;
    };

    // ============================================================
    // Shared Movement Helper — Common path-following logic
    // ============================================================

    /**
     * _followPathToTarget — Shared helper for moving along a path toward a target.
     * Extracted to eliminate duplicate code across ChaseState, FleeState, AmbushState, AttackState, and FollowState.
     * @private
     * @param {Object} context - Context object containing:
     *   - ai: AIComponent reference
     *   - speed: Movement speed
     *   - currentPath: Current path object
     *   - target: Target entity (for fallback)
     *   - useFallback: Whether to use direct movement as fallback
     * @returns {boolean} True if movement was applied, false otherwise.
     */
    Donkeycraft._followPathToTarget = function (context) {
        var ai = context.ai;
        var speed = context.speed || 1.0;
        var currentPath = context.currentPath;
        var target = context.target;

        if (!ai || !ai.entity) return false;

        var pos = ai.entity.getPosition();
        if (!pos) return false;

        var targetX, targetZ;

        // Use path waypoints if available
        if (currentPath && currentPath.path && currentPath.path.length > 0) {
            var waypoint = currentPath.path[0];
            targetX = waypoint.x;
            targetZ = waypoint.z;

            // Remove waypoint if reached
            var dx = waypoint.x - pos.x;
            var dz = waypoint.z - pos.z;
            if (dx * dx + dz * dz < 1.0) {
                currentPath.path.shift();
            }
        } else if (context.useFallback && target && target.getPosition) {
            // Fallback: move directly toward target
            var tPos = target.getPosition();
            if (!tPos) return false;
            targetX = tPos.x;
            targetZ = tPos.z;
        } else {
            return false;
        }

        if (targetX === undefined || targetZ === undefined) return false;

        try {
            var vel = ai.calculateMovementVelocity(pos.x, pos.z, targetX, targetZ, speed);
            ai.entity.setVelocity(vel.vx || 0, 0, vel.vz || 0);
            return true;
        } catch (e) {
            return false;
        }
    };

    // ============================================================
    // AI State — Base class for AI behavior states
    // ============================================================

    /**
     * AIStateInstance — Base class for a single AI state.
     * @constructor
     * @param {string} [stateName='idle'] - State name identifier.
     */
    Donkeycraft.AIStateInstance = function (stateName) {
        /** State name identifier. */
        this.name = stateName || 'idle';

        /** Parent AIComponent reference. */
        this.ai = null;

        /** Whether this state is active. */
        this.active = false;

        /** Time spent in this state (seconds). */
        this.elapsedTime = 0;
    };

    /**
     * enter — Called when this state becomes active.
     */
    Donkeycraft.AIStateInstance.prototype.enter = function () {
        this.active = true;
        this.elapsedTime = 0;
    };

    /**
     * exit — Called when this state is deactivated.
     */
    Donkeycraft.AIStateInstance.prototype.exit = function () {
        this.active = false;
    };

    /**
     * update — Called every tick while this state is active.
     * @param {number} deltaTime - Time since last update in seconds.
     * @returns {string|null} Next state name, or null to stay in current state.
     */
    Donkeycraft.AIStateInstance.prototype.update = function (deltaTime) {
        this.elapsedTime += deltaTime;
        return null;
    };

    /**
     * AIStateMachine — Manages AI state transitions for an entity.
     * @constructor
     */
    Donkeycraft.AIStateMachine = function () {
        this._states = {};
        this._currentState = null;
        this._previousState = null;
    };

    /**
     * registerState — Add a state to the state machine.
     * @param {Donkeycraft.AIStateInstance} state - State instance.
     */
    Donkeycraft.AIStateMachine.prototype.registerState = function (state) {
        if (!state || !state.name) return;
        this._states[state.name] = state;
        state.ai = this._aiComponent;
    };

    /**
     * setAIComponent — Set the parent AI component reference.
     * @param {Donkeycraft.AIComponent} aiComponent - Parent AI component.
     */
    Donkeycraft.AIStateMachine.prototype.setAIComponent = function (aiComponent) {
        this._aiComponent = aiComponent;
        var states = this._states;
        for (var name in states) {
            if (states.hasOwnProperty(name)) {
                states[name].ai = aiComponent;
            }
        }
    };

    /**
     * setState — Transition to a named state.
     * @param {string} stateName - Target state name.
     */
    Donkeycraft.AIStateMachine.prototype.setState = function (stateName) {
        if (!stateName || !this._states[stateName]) return;

        if (this._currentState && this._currentState.name !== stateName) {
            this._currentState.exit();
            this._previousState = this._currentState;
        }

        this._currentState = this._states[stateName];
        this._currentState.enter();
    };

    /**
     * getState — Get the current state name.
     * @returns {string|null} Current state name.
     */
    Donkeycraft.AIStateMachine.prototype.getState = function () {
        return this._currentState ? this._currentState.name : null;
    };

    /**
     * tick — Update the current state and handle transitions.
     * @param {number} deltaTime - Time since last update in seconds.
     */
    Donkeycraft.AIStateMachine.prototype.tick = function (deltaTime) {
        if (!this._currentState || !this._currentState.active) return;

        var nextState;
        try {
            nextState = this._currentState.update(deltaTime);
        } catch (e) {
            // If the state update throws, fall back to idle
            return;
        }

        if (nextState && nextState !== this._currentState.name) {
            this.setState(nextState);
        }
    };

    // ============================================================
    // AI Behavior Implementations
    // ============================================================

    /**
     * IdleState — Entity remains stationary, occasionally looking around.
     */
    Donkeycraft.IdleState = function () {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.IDLE);
        this._lookTimer = 0;
        this._lookInterval = 1.0 + Math.random() * 2.0;
    };
    Donkeycraft.IdleState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.IdleState.prototype.constructor = Donkeycraft.IdleState;

    Donkeycraft.IdleState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        this._lookTimer += deltaTime;
        if (this._lookTimer >= this._lookInterval) {
            this._lookTimer = 0;
            this._lookInterval = 1.0 + Math.random() * 2.0;
            // Random head turn
            var entity = this.ai ? this.ai.entity : null;
            if (entity && entity.setRotation) {
                var currentRot = entity.getRotation();
                var newYaw = currentRot ? currentRot.yaw + (Math.random() - 0.5) * 0.5 : 0;
                var newPitch = currentRot ? currentRot.pitch : 0;
                entity.setRotation(newYaw, newPitch);
            }
        }

        if (this.ai) {
            var profile = this.ai.profile;
            var target = this.ai.target;

            // Check if a target is nearby and should be chased
            if (target && target.isAlive && target.isAlive()) {
                var dist = this.ai.distanceToTarget();
                if (profile.chaseDistance > 0 && dist <= profile.chaseDistance) {
                    return Donkeycraft.AIState.CHASE;
                }
                if (profile.ambushDistance > 0 && dist <= profile.ambushDistance) {
                    return Donkeycraft.AIState.AMBUSH;
                }
            }

            // Check if we should flee due to low health
            if (this.ai.hasDamage && profile.fleeDistance > 0 && this.ai.getHealthRatio() < 0.3) {
                var nearestDist = this.ai.getNearestEnemyDistance(profile.chaseDistance || 20);
                if (nearestDist < profile.fleeDistance) {
                    return Donkeycraft.AIState.FLEE;
                }
            }

            // Transition to wander after idle period
            if (this.ai.idleTimer >= (profile.wanderInterval || 3.0)) {
                return Donkeycraft.AIState.WANDER;
            }
        }

        return null;
    };

    /**
     * WanderState — Entity moves to a random location within wander radius.
     */
    Donkeycraft.WanderState = function () {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.WANDER);
        this._targetX = 0;
        this._targetY = 0;
        this._targetZ = 0;
        this._pathRecalcTimer = 0;
        this._currentPath = null; // FIX: Explicitly initialize _currentPath
    };
    Donkeycraft.WanderState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.WanderState.prototype.constructor = Donkeycraft.WanderState;

    Donkeycraft.WanderState.prototype.enter = function () {
        Donkeycraft.AIStateInstance.prototype.enter.call(this);
        this._pickNewTarget();
    };

    Donkeycraft.WanderState.prototype._pickNewTarget = function () {
        if (!this.ai || !this.ai.entity) return;

        var profile = this.ai.profile;
        var pos = this.ai.entity.getPosition();
        if (!pos) return;

        var angle = Math.random() * Math.PI * 2;
        var radius = Math.random() * (profile.wanderRadius || 15);

        this._targetX = pos.x + Math.cos(angle) * radius;
        this._targetZ = pos.z + Math.sin(angle) * radius;
        this._targetY = pos.y;
        this._pathRecalcTimer = 0;
    };

    Donkeycraft.WanderState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        if (!this.ai || !this.ai.entity) return null;

        var profile = this.ai.profile;
        var target = this.ai.target;

        // Check if we should switch to chase/ambush
        if (target && target.isAlive && target.isAlive()) {
            var dist = this.ai.distanceToTarget();
            if (profile.chaseDistance > 0 && dist <= profile.chaseDistance) {
                return Donkeycraft.AIState.CHASE;
            }
            if (profile.ambushDistance > 0 && dist <= profile.ambushDistance) {
                return Donkeycraft.AIState.AMBUSH;
            }
        }

        // Recalculate path periodically
        this._pathRecalcTimer += deltaTime;
        if (this._pathRecalcTimer >= 1.0 || !this._currentPath || !this._currentPath.path || this._currentPath.path.length === 0) {
            this._recalcWanderPath();
        }

        // Move toward target
        var moved = Donkeycraft._followPathToTarget({
            ai: this.ai,
            speed: Donkeycraft.AISpeeds.WANDER,
            currentPath: this._currentPath,
            target: null,
            useFallback: true
        });

        // Check if reached wander target
        var pos = this.ai.entity.getPosition();
        if (pos && this._targetX !== undefined) {
            var dx = pos.x - this._targetX;
            var dz = pos.z - this._targetZ;
            if (dx * dx + dz * dz < 1.0) {
                // Reached target, pick new one
                this._pickNewTarget();
            }
        }

        return null;
    };

    Donkeycraft.WanderState.prototype._recalcWanderPath = function () {
        if (!this.ai || !this.ai.entity) return;

        var pos = this.ai.entity.getPosition();
        if (!pos) return;

        var profile = this.ai.profile;
        var endX = this._targetX;
        var endY = pos.y;
        var endZ = this._targetZ;

        if (profile.smartPathfinding && this.ai.navMesh) {
            try {
                var result = this.ai.navMesh.findPath(pos.x, pos.y, pos.z, endX, endY, endZ, Donkeycraft.AStarDefaults.WANDER_MAX_STEPS);
                if (result && result.path && result.path.length > 0) {
                    this._currentPath = result;
                    return;
                }
            } catch (e) {
                // Fall through to direct path
            }
        }

        // Fallback: direct path
        this._currentPath = {
            path: [{ x: endX, y: endY, z: endZ }],
            steps: 1,
            found: true
        };
    };

    /**
     * ChaseState — Entity pursues its target using pathfinding.
     */
    Donkeycraft.ChaseState = function () {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.CHASE);
        this._pathRecalcTimer = 0;
        this._currentPath = null;
    };
    Donkeycraft.ChaseState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.ChaseState.prototype.constructor = Donkeycraft.ChaseState;

    Donkeycraft.ChaseState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        if (!this.ai || !this.ai.entity) return null;

        var profile = this.ai.profile;
        var target = this.ai.target;

        if (!target || !target.isAlive || !target.isAlive()) {
            return Donkeycraft.AIState.IDLE;
        }

        var targetPos = target.getPosition();
        if (!targetPos) return Donkeycraft.AIState.IDLE;

        var dist = this.ai.distanceToTarget();

        // Check if should flee (low health)
        if (profile.fleeDistance > 0 && this.ai.getHealthRatio() < 0.3) {
            if (dist < profile.fleeDistance) {
                return Donkeycraft.AIState.FLEE;
            }
        }

        // Check if should switch to attack
        if (profile.attackDamage > 0 && dist <= Donkeycraft.AIDistances.ATTACK_RANGE) {
            return Donkeycraft.AIState.ATTACK;
        }

        // Check if skeleton should retreat (ranged enemy nearby)
        if (profile.retreatDistance && profile.retreatDistance > 0 && this.ai.getHealthRatio() < 0.3) {
            if (dist < profile.retreatDistance) {
                return Donkeycraft.AIState.FLEE;
            }
        }

        // Recalculate path periodically
        this._pathRecalcTimer += deltaTime;
        if (this._pathRecalcTimer >= 1.0 || !this._currentPath) {
            this._recalcChasePath(targetPos);
        }

        // Follow path or move directly
        Donkeycraft._followPathToTarget({
            ai: this.ai,
            speed: Donkeycraft.AISpeeds.CHASE,
            currentPath: this._currentPath,
            target: target,
            useFallback: true
        });

        return null;
    };

    Donkeycraft.ChaseState.prototype._recalcChasePath = function (targetPos) {
        if (!this.ai || !this.ai.entity) return;

        var pos = this.ai.entity.getPosition();
        if (!pos) return;

        var profile = this.ai.profile;

        // For ranged entities, keep some distance
        var endX = targetPos.x;
        var endY = targetPos.y;
        var endZ = targetPos.z;

        if (profile.keepDistance && profile.keepDistance > 0) {
            var dx = pos.x - targetPos.x;
            var dz = pos.z - targetPos.z;
            var dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < profile.keepDistance) {
                var ratio = profile.keepDistance / (dist || 1);
                endX = targetPos.x + dx * ratio;
                endZ = targetPos.z + dz * ratio;
            }
        }

        if (profile.smartPathfinding && this.ai.navMesh) {
            try {
                var result = this.ai.navMesh.findPath(pos.x, pos.y, pos.z, endX, endY, endZ, Donkeycraft.AStarDefaults.CHASE_MAX_STEPS);
                if (result && result.path && result.path.length > 0) {
                    this._currentPath = result;
                    return;
                }
            } catch (e) {
                // Fall through to direct movement
            }
        }

        // Fallback: direct movement toward target
        this._currentPath = {
            path: [{ x: endX, y: endY, z: endZ }],
            steps: 1,
            found: true
        };
    };

    /**
     * FleeState — Entity retreats from danger using pathfinding.
     */
    Donkeycraft.FleeState = function () {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.FLEE);
        this._pathRecalcTimer = 0;
        this._currentPath = null;
        this._fleeStartX = 0;
        this._fleeStartY = 0;
        this._fleeStartZ = 0;
    };
    Donkeycraft.FleeState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.FleeState.prototype.constructor = Donkeycraft.FleeState;

    Donkeycraft.FleeState.prototype.enter = function () {
        Donkeycraft.AIStateInstance.prototype.enter.call(this);
        if (this.ai && this.ai.entity) {
            var pos = this.ai.entity.getPosition();
            if (pos) {
                this._fleeStartX = pos.x;
                this._fleeStartY = pos.y;
                this._fleeStartZ = pos.z;
            }
        }
    };

    Donkeycraft.FleeState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        if (!this.ai || !this.ai.entity) return null;

        var profile = this.ai.profile;
        var target = this.ai.target;

        // Check if danger has passed
        if (!target || !target.isAlive || !target.isAlive()) {
            return Donkeycraft.AIState.IDLE;
        }

        var dist = this.ai.distanceToTarget();
        if (dist > (profile.fleeDistance || 10) * Donkeycraft.AIDistances.FLEE_SAFETY_MARGIN && this.ai.getHealthRatio() > 0.5) {
            return Donkeycraft.AIState.IDLE;
        }

        // Recalculate flee path periodically
        this._pathRecalcTimer += deltaTime;
        if (this._pathRecalcTimer >= 0.8 || !this._currentPath) {
            this._recalcFleePath(target.getPosition());
        }

        Donkeycraft._followPathToTarget({
            ai: this.ai,
            speed: Donkeycraft.AISpeeds.FLEE,
            currentPath: this._currentPath,
            target: target,
            useFallback: true
        });

        return null;
    };

    Donkeycraft.FleeState.prototype._recalcFleePath = function (dangerPos) {
        if (!this.ai || !this.ai.entity || !dangerPos) return;

        var pos = this.ai.entity.getPosition();
        if (!pos) return;

        // Calculate flee direction (away from danger)
        var dx = pos.x - dangerPos.x;
        var dz = pos.z - dangerPos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        var fleeX, fleeZ;
        if (dist > 0.1) {
            var fleeDistance = 8 + Math.random() * 5;
            fleeX = pos.x + (dx / dist) * fleeDistance;
            fleeZ = pos.z + (dz / dist) * fleeDistance;
        } else {
            // Random flee direction
            var angle = Math.random() * Math.PI * 2;
            fleeX = pos.x + Math.cos(angle) * 8;
            fleeZ = pos.z + Math.sin(angle) * 8;
        }

        var fleeY = pos.y;

        // Try to find path to flee position
        if (this.ai.navMesh) {
            try {
                var result = this.ai.navMesh.findPath(pos.x, pos.y, pos.z, fleeX, fleeY, fleeZ, Donkeycraft.AStarDefaults.FLEE_MAX_STEPS);
                if (result && result.path && result.path.length > 0) {
                    this._currentPath = result;
                    return;
                }
            } catch (e) {
                // Fall through to direct flee
            }
        }

        // Fallback: direct flee
        this._currentPath = {
            path: [{ x: fleeX, y: fleeY, z: fleeZ }],
            steps: 1,
            found: true
        };
    };

    /**
     * AmbushState — Entity stalks its target, waiting for close approach.
     */
    Donkeycraft.AmbushState = function () {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.AMBUSH);
        this._currentPath = null;
        this._pathRecalcTimer = 0;
        // FIX: Removed unused _stalkTimer and _stalkInterval properties
    };
    Donkeycraft.AmbushState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.AmbushState.prototype.constructor = Donkeycraft.AmbushState;

    Donkeycraft.AmbushState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        if (!this.ai || !this.ai.entity) return null;

        var profile = this.ai.profile;
        var target = this.ai.target;

        if (!target || !target.isAlive || !target.isAlive()) {
            return Donkeycraft.AIState.IDLE;
        }

        var dist = this.ai.distanceToTarget();
        var targetPos = target.getPosition();
        if (!targetPos) return Donkeycraft.AIState.IDLE;

        // If target is too close, break ambush and attack
        if (dist <= Donkeycraft.AIDistances.ATTACK_RANGE && profile.attackDamage > 0) {
            return Donkeycraft.AIState.ATTACK;
        }

        // Recalculate stalk path periodically
        this._pathRecalcTimer += deltaTime;
        if (this._pathRecalcTimer >= 1.5 || !this._currentPath) {
            this._recalcStalkPath(targetPos);
        }

        Donkeycraft._followPathToTarget({
            ai: this.ai,
            speed: Donkeycraft.AISpeeds.AMBUSH,
            currentPath: this._currentPath,
            target: target,
            useFallback: true
        });

        return null;
    };

    Donkeycraft.AmbushState.prototype._recalcStalkPath = function (targetPos) {
        if (!this.ai || !this.ai.entity) return;

        var pos = this.ai.entity.getPosition();
        if (!pos) return;

        // Move to a good ambush position (close but hidden)
        var dx = targetPos.x - pos.x;
        var dz = targetPos.z - pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        var ambushDist = (this.ai.profile.ambushDistance || 8) * 0.6;

        var targetX, targetZ;
        if (dist > ambushDist) {
            var ratio = ambushDist / (dist || 1);
            targetX = pos.x + dx * ratio;
            targetZ = pos.z + dz * ratio;
        } else {
            // Already close, move to attack position
            targetX = targetPos.x;
            targetZ = targetPos.z;
        }

        if (this.ai.navMesh) {
            try {
                var result = this.ai.navMesh.findPath(pos.x, pos.y, pos.z, targetX, targetPos.y, targetZ, Donkeycraft.AStarDefaults.AMBUSH_MAX_STEPS);
                if (result && result.path && result.path.length > 0) {
                    this._currentPath = result;
                    return;
                }
            } catch (e) {
                // Fall through to direct path
            }
        }

        this._currentPath = {
            path: [{ x: targetX, y: targetPos.y, z: targetZ }],
            steps: 1,
            found: true
        };
    };

    /**
     * AttackState — Entity engages in melee combat with its target.
     */
    Donkeycraft.AttackState = function () {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.ATTACK);
        this._attackTimer = 0;
        this._currentPath = null;
        this._pathRecalcTimer = 0;
    };
    Donkeycraft.AttackState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.AttackState.prototype.constructor = Donkeycraft.AttackState;

    Donkeycraft.AttackState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        if (!this.ai || !this.ai.entity) return null;

        var profile = this.ai.profile;
        var target = this.ai.target;

        if (!target || !target.isAlive || !target.isAlive()) {
            return Donkeycraft.AIState.IDLE;
        }

        var dist = this.ai.distanceToTarget();
        var targetPos = target.getPosition();
        if (!targetPos) return Donkeycraft.AIState.IDLE;

        // Perform melee attack if in range
        if (profile.attackDamage > 0 && dist <= Donkeycraft.AIDistances.ATTACK_RANGE) {
            this._attackTimer += deltaTime;
            if (this._attackTimer >= (profile.attackCooldown || 1.5)) {
                this._attackTimer = 0;
                this._performAttack(target);
            }

            // Stay in attack state
            return null;
        }

        // Check for ranged attack (skeleton)
        if (profile.rangedDistance && dist <= profile.rangedDistance && dist > Donkeycraft.AIDistances.ATTACK_RANGE) {
            this._attackTimer += deltaTime;
            if (this._attackTimer >= (profile.attackCooldown || 2.0)) {
                this._attackTimer = 0;
                this._performRangedAttack(target);
            }
            return null;
        }

        // Move toward target
        this._pathRecalcTimer += deltaTime;
        if (this._pathRecalcTimer >= 1.0 || !this._currentPath) {
            this._recalcAttackPath(targetPos);
        }

        Donkeycraft._followPathToTarget({
            ai: this.ai,
            speed: Donkeycraft.AISpeeds.ATTACK,
            currentPath: this._currentPath,
            target: target,
            useFallback: true
        });

        return null;
    };

    /**
     * _performAttack — Execute a melee attack against the target.
     * @private
     */
    Donkeycraft.AttackState.prototype._performAttack = function (target) {
        if (!this.ai || !target) return;

        var profile = this.ai.profile;
        var damage = profile.attackDamage || 1;

        // Apply damage to target
        if (target.takeDamage && typeof target.takeDamage === 'function') {
            target.takeDamage(damage, this.ai.entity ? this.ai.entity.type : 'mob');
        }

        // Trigger attack animation on self
        if (this.ai.entity && this.ai.entity._animationController) {
            this.ai.entity._animationController.setForcedState('attack', 0.5);
        }

        // Emit attack event
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('entity:attack', {
                    attacker: this.ai.entity,
                    target: target,
                    damage: damage
                });
            } catch (e) {
                // EventBus may not be available
            }
        }
    };

    /**
     * _performRangedAttack — Execute a ranged attack against the target.
     * @private
     */
    Donkeycraft.AttackState.prototype._performRangedAttack = function (target) {
        if (!this.ai || !target) return;

        var profile = this.ai.profile;
        var damage = profile.attackDamage || 1;

        // Apply damage to target (ranged attacks deal same damage but may have different mechanics)
        if (target.takeDamage && typeof target.takeDamage === 'function') {
            target.takeDamage(damage, this.ai.entity ? this.ai.entity.type : 'skeleton');
        }

        // Trigger ranged attack animation
        if (this.ai.entity && this.ai.entity._animationController) {
            this.ai.entity._animationController.setForcedState('attack', 0.7);
        }

        // Emit ranged attack event
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('entity:ranged_attack', {
                    attacker: this.ai.entity,
                    target: target,
                    damage: damage,
                    type: 'ranged'
                });
            } catch (e) {
                // EventBus may not be available
            }
        }
    };

    /**
     * _recalcAttackPath — Calculate path to attack position.
     * @private
     */
    Donkeycraft.AttackState.prototype._recalcAttackPath = function (targetPos) {
        if (!this.ai || !this.ai.entity) return;

        var pos = this.ai.entity.getPosition();
        if (!pos) return;

        // Stay close to target
        var keepDist = (this.ai.profile.keepDistance || Donkeycraft.AIDistances.ATTACK_RANGE);
        var dx = targetPos.x - pos.x;
        var dz = targetPos.z - pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        var endX, endY, endZ;

        if (dist > keepDist) {
            var ratio = keepDist / (dist || 1);
            endX = pos.x + dx * ratio;
            // FIX: Properly interpolate Y coordinate instead of always using target Y
            endY = pos.y + (targetPos.y - pos.y) * Math.min(ratio, 1);
            endZ = pos.z + dz * ratio;
        } else {
            // Already close enough, just move toward target
            endX = targetPos.x;
            endY = targetPos.y;
            endZ = targetPos.z;
        }

        if (this.ai.navMesh) {
            try {
                var result = this.ai.navMesh.findPath(pos.x, pos.y, pos.z, endX, endY, endZ, Donkeycraft.AStarDefaults.ATTACK_MAX_STEPS);
                if (result && result.path && result.path.length > 0) {
                    this._currentPath = result;
                    return;
                }
            } catch (e) {
                // Fall through to direct path
            }
        }

        this._currentPath = {
            path: [{ x: endX, y: endY, z: endZ }],
            steps: 1,
            found: true
        };
    };

    /**
     * FollowState — Entity follows a designated leader/target.
     */
    Donkeycraft.FollowState = function () {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.FOLLOW);
        this._currentPath = null;
        this._pathRecalcTimer = 0;
        this._followDistance = 2.0;
    };
    Donkeycraft.FollowState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.FollowState.prototype.constructor = Donkeycraft.FollowState;

    Donkeycraft.FollowState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        if (!this.ai || !this.ai.entity) return null;

        var target = this.ai.target;
        if (!target || !target.isAlive || !target.isAlive()) {
            return Donkeycraft.AIState.IDLE;
        }

        var dist = this.ai.distanceToTarget();
        var targetPos = target.getPosition();
        if (!targetPos) return Donkeycraft.AIState.IDLE;

        // Recalculate path periodically
        this._pathRecalcTimer += deltaTime;
        if (this._pathRecalcTimer >= 1.0 || !this._currentPath) {
            this._recalcFollowPath(targetPos);
        }

        Donkeycraft._followPathToTarget({
            ai: this.ai,
            speed: Donkeycraft.AISpeeds.FOLLOW,
            currentPath: this._currentPath,
            target: target,
            useFallback: true
        });

        return null;
    };

    Donkeycraft.FollowState.prototype._recalcFollowPath = function (targetPos) {
        if (!this.ai || !this.ai.entity) return;

        var pos = this.ai.entity.getPosition();
        if (!pos) return;

        var dx = targetPos.x - pos.x;
        var dz = targetPos.z - pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        var endX, endY, endZ;
        if (dist > this._followDistance) {
            var ratio = this._followDistance / (dist || 1);
            endX = targetPos.x - dx * (1 - ratio);
            endZ = targetPos.z - dz * (1 - ratio);
            endY = targetPos.y;
        } else {
            return; // Already following
        }

        if (this.ai.navMesh) {
            try {
                var result = this.ai.navMesh.findPath(pos.x, pos.y, pos.z, endX, endY, endZ, Donkeycraft.AStarDefaults.FLEE_MAX_STEPS);
                if (result && result.path && result.path.length > 0) {
                    this._currentPath = result;
                    return;
                }
            } catch (e) {
                // Fall through to direct path
            }
        }

        this._currentPath = {
            path: [{ x: endX, y: endY, z: endZ }],
            steps: 1,
            found: true
        };
    };

    /**
     * PatrolState — Entity follows a set of patrol points in a loop.
     * Implemented as part of Phase 2: Complete Missing Functionality.
     */
    Donkeycraft.PatrolState = function (patrolPoints) {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.PATROL);
        this._patrolPoints = patrolPoints || [];
        this._currentPointIndex = 0;
        this._currentPath = null;
        this._pathRecalcTimer = 0;
        this._pointReachedTimer = 0;
    };
    Donkeycraft.PatrolState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.PatrolState.prototype.constructor = Donkeycraft.PatrolState;

    /**
     * setPatrolPoints — Set the patrol points for this state.
     * @param {Array<{x:number, y:number, z:number}>} points - Array of patrol waypoint coordinates.
     */
    Donkeycraft.PatrolState.prototype.setPatrolPoints = function (points) {
        if (points && Array.isArray(points) && points.length > 0) {
            this._patrolPoints = points;
        }
    };

    Donkeycraft.PatrolState.prototype.enter = function () {
        Donkeycraft.AIStateInstance.prototype.enter.call(this);
        this._currentPointIndex = 0;
        this._pointReachedTimer = 0;
    };

    Donkeycraft.PatrolState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        if (!this.ai || !this.ai.entity) return null;

        var profile = this.ai.profile;
        var target = this.ai.target;

        // Check if we should switch to chase (hostile entity detects player)
        if (target && target.isAlive && target.isAlive()) {
            var dist = this.ai.distanceToTarget();
            if (profile.aggressionRange > 0 && dist <= profile.aggressionRange) {
                return Donkeycraft.AIState.CHASE;
            }
            if (profile.chaseDistance > 0 && dist <= profile.chaseDistance) {
                return Donkeycraft.AIState.CHASE;
            }
        }

        // Get the current patrol point
        if (this._patrolPoints.length === 0) {
            // No patrol points, fall back to wander
            return Donkeycraft.AIState.WANDER;
        }

        var currentPoint = this._patrolPoints[this._currentPointIndex];
        if (!currentPoint) return Donkeycraft.AIState.IDLE;

        // Recalculate path periodically
        this._pathRecalcTimer += deltaTime;
        if (this._pathRecalcTimer >= 1.0 || !this._currentPath || !this._currentPath.path || this._currentPath.path.length === 0) {
            this._recalcPatrolPath(currentPoint);
        }

        // Check if reached current patrol point
        var pos = this.ai.entity.getPosition();
        if (pos) {
            var dx = pos.x - currentPoint.x;
            var dy = pos.y - currentPoint.y;
            var dz = pos.z - currentPoint.z;
            if (dx * dx + dy * dy + dz * dz < 2.0) {
                // Reached point, move to next
                this._currentPointIndex = (this._currentPointIndex + 1) % this._patrolPoints.length;
                this._pointReachedTimer = 0;
            }
        }

        Donkeycraft._followPathToTarget({
            ai: this.ai,
            speed: Donkeycraft.AISpeeds.PATROL,
            currentPath: this._currentPath,
            target: null,
            useFallback: false
        });

        return null;
    };

    Donkeycraft.PatrolState.prototype._recalcPatrolPath = function (targetPoint) {
        if (!this.ai || !this.ai.entity) return;

        var pos = this.ai.entity.getPosition();
        if (!pos) return;

        if (this.ai.navMesh) {
            try {
                var result = this.ai.navMesh.findPath(pos.x, pos.y, pos.z, targetPoint.x, targetPoint.y, targetPoint.z, Donkeycraft.AStarDefaults.WANDER_MAX_STEPS);
                if (result && result.path && result.path.length > 0) {
                    this._currentPath = result;
                    return;
                }
            } catch (e) {
                // Fall through to direct path
            }
        }

        this._currentPath = {
            path: [{ x: targetPoint.x, y: targetPoint.y, z: targetPoint.z }],
            steps: 1,
            found: true
        };
    };

    /**
     * HurtState — Entity reacts to being damaged with brief stun behavior.
     * Implemented as part of Phase 2: Complete Missing Functionality.
     */
    Donkeycraft.HurtState = function (stunDuration) {
        Donkeycraft.AIStateInstance.call(this, Donkeycraft.AIState.HURT);
        this._stunDuration = stunDuration || 0.5; // Seconds to remain stunned
        this._damageSource = null;
    };
    Donkeycraft.HurtState.prototype = Object.create(Donkeycraft.AIStateInstance.prototype);
    Donkeycraft.HurtState.prototype.constructor = Donkeycraft.HurtState;

    /**
     * setDamageSource — Set the source of damage for potential flee behavior.
     * @param {Donkeycraft.Entity} source - Entity that dealt damage.
     */
    Donkeycraft.HurtState.prototype.setDamageSource = function (source) {
        this._damageSource = source;
    };

    Donkeycraft.HurtState.prototype.enter = function () {
        Donkeycraft.AIStateInstance.prototype.enter.call(this);
        // Clear any current path to stop movement during stun
        if (this.ai && this.ai.entity) {
            this.ai.entity.setVelocity(0, 0, 0);
        }
    };

    Donkeycraft.HurtState.prototype.update = function (deltaTime) {
        Donkeycraft.AIStateInstance.prototype.update.call(this, deltaTime);

        if (this.elapsedTime >= this._stunDuration) {
            // Stun duration expired, return to previous state or idle
            if (this.ai && this.ai._previousState) {
                return this.ai._previousState;
            }
            return Donkeycraft.AIState.IDLE;
        }

        // Check if we should flee based on damage taken
        if (this.ai && this.ai.profile && this.ai.profile.fleeDistance > 0) {
            var healthRatio = this.ai.getHealthRatio();
            if (healthRatio < 0.3 && this._damageSource) {
                return Donkeycraft.AIState.FLEE;
            }
        }

        // Remain stunned — no movement
        return null;
    };

    // ============================================================
    // AI Component — Per-entity AI controller
    // ============================================================

    /**
     * AIComponent — Attaches to entities and manages their AI behavior.
     * @constructor
     * @param {Donkeycraft.Entity} entity - The entity this AI controls.
     */
    Donkeycraft.AIComponent = function (entity) {
        /** Reference to the parent entity. */
        this.entity = entity || null;

        /** Behavior profile for this entity. */
        this.profile = null;

        /** Current target entity (player, enemy, etc.). */
        this.target = null;

        /** AI state machine. */
        this.stateMachine = new Donkeycraft.AIStateMachine();

        /** Navigation mesh for pathfinding. */
        this.navMesh = null;

        /** Block ID query callback for navmesh. */
        this._getBlockId = null;

        /** Time since last idle action. */
        this.idleTimer = 0;

        /** Path recalculation interval. */
        this.repathInterval = 1.0;

        /** Current path being followed. */
        this._currentPath = null;

        /** Last path recalculation time. */
        this._lastRepathTime = 0;

        /** Whether AI is enabled. */
        this.enabled = true;

        // Store previous state name for HurtState recovery
        this._previousState = null;

        // Register all states
        var idleState = new Donkeycraft.IdleState();
        var wanderState = new Donkeycraft.WanderState();
        var chaseState = new Donkeycraft.ChaseState();
        var fleeState = new Donkeycraft.FleeState();
        var ambushState = new Donkeycraft.AmbushState();
        var attackState = new Donkeycraft.AttackState();
        var followState = new Donkeycraft.FollowState();
        var patrolState = new Donkeycraft.PatrolState([]);
        var hurtState = new Donkeycraft.HurtState(0.5);

        this.stateMachine.registerState(idleState);
        this.stateMachine.registerState(wanderState);
        this.stateMachine.registerState(chaseState);
        this.stateMachine.registerState(fleeState);
        this.stateMachine.registerState(ambushState);
        this.stateMachine.registerState(attackState);
        this.stateMachine.registerState(followState);
        this.stateMachine.registerState(patrolState);
        this.stateMachine.registerState(hurtState);

        this.stateMachine.setAIComponent(this);

        // Start in idle state
        this.stateMachine.setState(Donkeycraft.AIState.IDLE);
    };

    /**
     * setProfile — Set the behavior profile for this AI component.
     * @param {string|Object} profile - Profile name or custom profile object.
     */
    Donkeycraft.AIComponent.prototype.setProfile = function (profile) {
        if (typeof profile === 'string') {
            var namedProfile = Donkeycraft.AIBehaviorProfiles[profile];
            if (namedProfile) {
                this.profile = JSON.parse(JSON.stringify(namedProfile));
            } else {
                this.profile = JSON.parse(JSON.stringify(Donkeycraft.AIBehaviorProfiles.generic));
            }
        } else {
            this.profile = profile;
        }

        if (!this.profile) {
            this.profile = JSON.parse(JSON.stringify(Donkeycraft.AIBehaviorProfiles.generic));
        }
    };

    /**
     * setNavMesh — Set the navigation mesh for pathfinding.
     * @param {Donkeycraft.NavMesh} navMesh - NavMesh instance.
     */
    Donkeycraft.AIComponent.prototype.setNavMesh = function (navMesh) {
        this.navMesh = navMesh;
    };

    /**
     * setBlockQuery — Set the block ID query callback.
     * @param {Function} getBlockId - Callback(x, y, z) → blockId.
     */
    Donkeycraft.AIComponent.prototype.setBlockQuery = function (getBlockId) {
        this._getBlockId = getBlockId;
        if (this.navMesh) {
            this.navMesh.setBlockQuery(getBlockId);
        }
    };

    /**
     * setTarget — Set the current AI target.
     * @param {Donkeycraft.Entity} target - Target entity.
     */
    Donkeycraft.AIComponent.prototype.setTarget = function (target) {
        this.target = target;
    };

    /**
     * clearTarget — Clear the current AI target.
     */
    Donkeycraft.AIComponent.prototype.clearTarget = function () {
        this.target = null;
    };

    /**
     * distanceToTarget — Get distance to the current target.
     * @returns {number} Distance in blocks.
     */
    Donkeycraft.AIComponent.prototype.distanceToTarget = function () {
        if (!this.target || !this.entity) return Infinity;

        var pos = this.entity.getPosition();
        var tPos = this.target.getPosition();

        if (!pos || !tPos) return Infinity;

        var dx = pos.x - tPos.x;
        var dy = pos.y - tPos.y;
        var dz = pos.z - tPos.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    /**
     * getNearestEnemyDistance — Get distance to the nearest hostile entity within range.
     * @param {number} [range=20] - Search range.
     * @returns {number} Distance to nearest enemy (or range if none found).
     */
    Donkeycraft.AIComponent.prototype.getNearestEnemyDistance = function (range) {
        range = range || 20;

        if (!this.entity) return range;

        var pos = this.entity.getPosition();
        if (!pos) return range;

        var minDist = range;

        // Use EntityManager for proper entity queries if available
        if (Donkeycraft._entityManager) {
            try {
                var nearbyEntities = Donkeycraft._entityManager.getEntitiesInRange(pos.x, pos.y, pos.z, range);
                for (var i = 0; i < nearbyEntities.length; i++) {
                    var entity = nearbyEntities[i];
                    if (entity === this.entity) continue; // Skip self

                    // Check if hostile (has attackDamage > 0 or chaseDistance > 0)
                    var aiComp = entity.getAIComponent ? entity.getAIComponent() : null;
                    var entityProfile = aiComp && aiComp.profile ? aiComp.profile : {};

                    if (entityProfile.attackDamage > 0 || entityProfile.chaseDistance > 0) {
                        var dist = this.distanceToEntity(entity);
                        if (dist < minDist) {
                            minDist = dist;
                        }
                    }
                }
            } catch (e) {
                // EntityManager may not be available
            }
        }

        return minDist;
    };

    /**
     * distanceToEntity — Calculate distance to a specific entity.
     * @param {Donkeycraft.Entity} other - Target entity.
     * @returns {number} Distance in blocks.
     * @private
     */
    Donkeycraft.AIComponent.prototype.distanceToEntity = function (other) {
        if (!this.entity || !other) return Infinity;

        var pos = this.entity.getPosition();
        var otherPos = other.getPosition();

        if (!pos || !otherPos) return Infinity;

        var dx = pos.x - otherPos.x;
        var dy = pos.y - otherPos.y;
        var dz = pos.z - otherPos.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    /**
     * getHealthRatio — Get current health as a ratio [0, 1].
     * @returns {number} Health ratio.
     */
    Donkeycraft.AIComponent.prototype.getHealthRatio = function () {
        if (!this.entity) return 1;
        return (this.entity.health || 0) / (this.entity.maxHealth || 1);
    };

    /**
     * hasDamage — Whether this entity has taken damage recently.
     * @returns {boolean}
     */
    Donkeycraft.AIComponent.prototype.hasDamage = function () {
        return this.getHealthRatio() < 1.0;
    };

    /**
     * calculateMovementVelocity — Calculate velocity to move toward a target position.
     * @param {number} mobX - Current X.
     * @param {number} mobZ - Current Z.
     * @param {number} targetX - Target X.
     * @param {number} targetZ - Target Z.
     * @param {number} speed - Desired speed in blocks/second.
     * @returns {{vx: number, vy: number, vz: number}} Velocity components.
     */
    Donkeycraft.AIComponent.prototype.calculateMovementVelocity = function (mobX, mobZ, targetX, targetZ, speed) {
        var dx = targetX - mobX;
        var dz = targetZ - mobZ;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.1) {
            return {
                vx: (dx / dist) * speed,
                vy: 0,
                vz: (dz / dist) * speed
            };
        }

        return { vx: 0, vy: 0, vz: 0 };
    };

    /**
     * tick — Update AI component for one frame.
     * @param {number} deltaTime - Time since last update in seconds.
     */
    Donkeycraft.AIComponent.prototype.tick = function (deltaTime) {
        if (!this.enabled || !this.entity || !this.profile) return;

        // Update idle timer
        this.idleTimer += deltaTime;

        // Ensure state machine has reference
        this.stateMachine.setAIComponent(this);

        // Track previous state for HurtState recovery
        var currentState = this.stateMachine.getState();
        if (currentState && currentState !== Donkeycraft.AIState.HURT) {
            this._previousState = currentState;
        }

        // Tick the current state
        this.stateMachine.tick(deltaTime);

        // Sync animation controller with AI state
        if (this.entity && this.entity._animationController) {
            var stateName = this.stateMachine.getState();
            var pos = this.entity.getPosition();
            var vel = this.entity.getVelocity();

            if (vel && pos) {
                var speed = Math.sqrt((vel.x || 0) * (vel.x || 0) + (vel.z || 0) * (vel.z || 0));

                switch (stateName) {
                    case Donkeycraft.AIState.ATTACK:
                        // Attack animation handled in AttackState
                        break;
                    case Donkeycraft.AIState.FLEE:
                        if (speed < 0.5) {
                            this.entity._animationController.setSpeed(3.0, Math.atan2(vel.x || 0, vel.z || 0));
                        }
                        break;
                    case Donkeycraft.AIState.CHASE:
                        if (speed < 0.5) {
                            this.entity._animationController.setSpeed(2.5, Math.atan2(vel.x || 0, vel.z || 0));
                        }
                        break;
                    default:
                        // Auto animation based on speed
                        break;
                }
            }
        }
    };

    /**
     * enable — Enable AI processing.
     */
    Donkeycraft.AIComponent.prototype.enable = function () {
        this.enabled = true;
    };

    /**
     * disable — Disable AI processing.
     */
    Donkeycraft.AIComponent.prototype.disable = function () {
        this.enabled = false;
    };

    /**
     * destroy — Clean up AI component resources.
     */
    Donkeycraft.AIComponent.prototype.destroy = function () {
        this.entity = null;
        this.target = null;
        this.profile = null;
        this.navMesh = null;
        this._getBlockId = null;
        this.stateMachine = null;
        this._previousState = null;
    };

    // ============================================================
    // Legacy MobAI Utilities (backward compatibility)
    // ============================================================

    /**
     * canMobSeePlayer — Check if a mob can see a player.
     * @param {Donkeycraft.Entity} mob - Mob entity.
     * @param {Donkeycraft.Entity} player - Player entity.
     * @param {Function} getBlockId - Callback(x, y, z) returning block ID.
     * @returns {boolean} True if mob can see player.
     */
    Donkeycraft.MobAI.canMobSeePlayer = function (mob, player, getBlockId) {
        var eyePos = mob.getEyePosition();
        var targetPos = player.getEyePosition();

        if (!eyePos || !targetPos) return false;

        var dx = targetPos.x - eyePos.x;
        var dy = targetPos.y - eyePos.y;
        var dz = targetPos.z - eyePos.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist === 0) return true;

        var steps = Math.ceil(dist * 3);
        var stepX = dx / steps;
        var stepY = dy / steps;
        var stepZ = dz / steps;

        for (var i = 0; i <= steps; i++) {
            var bx = Math.floor(eyePos.x + stepX * i);
            var by = Math.floor(eyePos.y + stepY * i);
            var bz = Math.floor(eyePos.z + stepZ * i);

            var blockId = getBlockId ? getBlockId(bx, by, bz) : 0;

            if (!blockId || blockId === 0) continue;

            if (Donkeycraft.Block && typeof Donkeycraft.Block.isTransparent === 'function') {
                if (!Donkeycraft.Block.isTransparent(blockId)) return false;
            } else {
                return false;
            }
        }

        return true;
    };

    /**
     * shouldFlee — Determine if a mob should flee from a player.
     * @param {Donkeycraft.Entity} mob - Mob entity.
     * @param {Donkeycraft.Entity} player - Player entity.
     * @param {number} [fleeDistance=5] - Distance at which mob flees.
     * @returns {boolean} True if mob should flee.
     */
    Donkeycraft.MobAI.shouldFlee = function (mob, player, fleeDistance) {
        fleeDistance = fleeDistance || 5;

        var mobPos = mob.getPosition();
        var playerPos = player.getPosition();
        if (!mobPos || !playerPos) return false;

        var dx = mobPos.x - playerPos.x;
        var dy = mobPos.y - playerPos.y;
        var dz = mobPos.z - playerPos.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        return dist < fleeDistance && mob.health < mob.maxHealth * 0.3;
    };

    /**
     * getWanderTarget — Get a random wander target within a given radius.
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

    /**
     * calculateChaseVelocity — Calculate chase velocity toward a target.
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
     * calculateFleeVelocity — Calculate flee velocity away from a source.
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

        var angle = Math.random() * Math.PI * 2;
        return {
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed
        };
    };

    /**
     * findPath — Legacy pathfinding (greedy best-first, kept for backward compatibility).
     * @param {number} startX - Start X.
     * @param {number} startY - Start Y.
     * @param {number} startZ - Start Z.
     * @param {number} endX - End X.
     * @param {number} endY - End Y.
     * @param {number} endZ - End Z.
     * @param {Function} isWalkable - Callback(x, y, z) returning true if walkable.
     * @param {number} maxSteps - Maximum steps.
     * @returns {Object|null} Path object or null.
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
            if (visited[key]) break;
            visited[key] = true;

            if (currentX === endFloorX && currentY === endFloorY && currentZ === endFloorZ) break;

            var bestDir = Donkeycraft.AIDirection.NONE;
            var bestDist = Number.MAX_VALUE;

            for (var dir in Donkeycraft.AIDirectionDeltas) {
                if (!Donkeycraft.AIDirectionDeltas.hasOwnProperty(dir)) continue;

                var delta = Donkeycraft.AIDirectionDeltas[dir];
                var nx = currentX + delta.x;
                var ny = currentY + delta.y;
                var nz = currentZ + delta.z;

                if (!isWalkable || isWalkable(nx, ny, nz)) {
                    var dist = (nx - endFloorX) * (nx - endFloorX) +
                        (ny - endFloorY) * (ny - endFloorY) +
                        (nz - endFloorZ) * (nz - endFloorZ);

                    if (dist < bestDist) {
                        bestDist = dist;
                        bestDir = parseInt(dir, 10);
                    }
                }
            }

            if (bestDir === Donkeycraft.AIDirection.NONE) break;

            var delta = Donkeycraft.AIDirectionDeltas[bestDir];
            currentX += delta.x;
            currentY += delta.y;
            currentZ += delta.z;

            path.push({ x: currentX, y: currentY, z: currentZ, direction: bestDir });
            totalDistance += 1;
        }

        if (path.length === 0) return null;

        return { steps: path, distance: totalDistance };
    };

})();