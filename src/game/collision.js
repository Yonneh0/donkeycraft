// Donkeycraft — Collision Detection
// AABB collision detection and response against solid/liquid blocks and entity bounds.
// Provides per-axis collision resolution for frame-rate-independent movement.
//
// Features:
// - Per-axis collision resolution (X → Y → Z order) for frame-rate-independent movement
// - Embedding resolution for players spawned inside solid or liquid blocks
// - Liquid-aware collision detection and embedding resolution
// - Entity overlap checking against player AABB
//
// Known Limitations:
// - Unloaded chunks return false for isBlockSolid/isBlockLiquid — player can clip through
//   terrain at chunk boundaries. This is intentional to avoid blocking on missing data.
//
// @module collision
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    /**
     * Collision — handles AABB collision detection and response against solid/liquid blocks and entity bounds.
     *
     * Core features:
     * - Per-axis collision resolution (X → Y → Z order) for frame-rate-independent movement
     * - Embedding resolution for players spawned inside solid or liquid blocks
     * - Liquid-aware collision detection and embedding resolution
     * - Entity overlap checking against player AABB
     *
     * Resolution order: X → Y → Z. This prevents getting stuck on corners because each axis
     * is resolved independently before moving to the next.
     *
     * Embedding resolution: if the player's AABB starts inside a solid or liquid block,
     * push-out attempts are made in priority order (Up → Down → ±X → ±Z).
     *
     * Ground snap: when landing downward (collision on Y axis with negative delta),
     * the player's Y position is snapped to the exact block top to prevent micro-sliding.
     *
     * Known limitations:
     * - Unloaded chunks return `false` for solid/liquid checks — player can clip through
     *   terrain at chunk boundaries. This is intentional to avoid blocking on missing data.
     *
     * @constructor
     * @param {Donkeycraft.ChunkManager} chunkManager — Chunk manager for block lookups.
     * @param {object} [config] — Optional configuration overrides (not currently used).
     */
    Donkeycraft.Collision = function (chunkManager, config) {
        this._chunkManager = chunkManager;
        this._config = config || {};
    };

    /**
     * Check collision for a movement vector against solid blocks.
     * Returns collision flags per axis without modifying position — useful for preview checks.
     *
     * Tests each axis independently by building the AABB at the original position
     * and checking whether translating it along that axis would intersect any solid block.
     * Only axes with non-zero deltas are tested — axes with delta === 0 always return
     * `collision: false` since no movement is proposed on that axis.
     *
     * **Note:** Each axis is tested independently against the *original* (unmoved) AABB.
     * This means `collisionX` reflects whether moving along X would hit a block, regardless
     * of Y or Z collision results. For actual resolution, use `resolveMovementWithDelta()`.
     *
     * @param {Donkeycraft.Vector3} position — Player center position.
     * @param {number} width — Player width in blocks.
     * @param {number} height — Player height in blocks.
     * @param {number} deltaX — Proposed X movement in blocks (0 = skip X test).
     * @param {number} deltaY — Proposed Y movement in blocks (0 = skip Y test).
     * @param {number} deltaZ — Proposed Z movement in blocks (0 = skip Z test).
     * @returns {{collisionX: boolean, collisionY: boolean, collisionZ: boolean}} Collision flags per axis.
     */
    Donkeycraft.Collision.prototype.checkMovement = function (position, width, height, deltaX, deltaY, deltaZ) {
        if (!position || typeof width !== 'number' || typeof height !== 'number') {
            return { collisionX: false, collisionY: false, collisionZ: false };
        }

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

        // Check each axis independently
        var collisionX = this._checkAABBAgainstBlocks(
            aabbBefore.minX + deltaX, aabbBefore.minY, aabbBefore.minZ,
            aabbBefore.maxX + deltaX, aabbBefore.maxY, aabbBefore.maxZ
        );

        var collisionY = this._checkAABBAgainstBlocks(
            aabbBefore.minX, aabbBefore.minY + deltaY, aabbBefore.minZ,
            aabbBefore.maxX, aabbBefore.maxY + deltaY, aabbBefore.maxZ
        );

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
     * Resolve movement with collision detection using velocity and deltaTime.
     * Converts velocity (blocks/sec) to displacement (blocks) by multiplying by deltaTime,
     * then resolves collisions per-axis (X → Y → Z order).
     *
     * This is the **recommended** public API for movement resolution. It ensures
     * frame-rate-independent movement by accepting velocity in blocks/sec and deltaTime
     * separately, rather than pre-computed displacement.
     *
     * Resolution order: X → Y → Z per axis. This prevents getting stuck on corners
     * because each axis is resolved independently before moving to the next.
     *
     * Embedding resolution: if the player's AABB starts inside a solid or liquid block,
     * push-out attempts are made in priority order (Up → Down → ±X → ±Z).
     *
     * Ground snap: when landing downward (collision on Y axis with negative delta),
     * the player's Y position is snapped to the exact block top to prevent micro-sliding.
     *
     * @param {Donkeycraft.Vector3} position — Current player center position.
     * @param {Donkeycraft.Vector3} velocity — Velocity vector in blocks/sec.
     * @param {number} width — Player width in blocks.
     * @param {number} height — Player height in blocks.
     * @param {number} deltaTime — Time since last tick in seconds (must be > 0).
     * @returns {{newX: number, newY: number, newZ: number, onGround: boolean}} Resolved position and ground state.
     */
    Donkeycraft.Collision.prototype.resolveMovementWithDelta = function (position, velocity, width, height, deltaTime) {
        if (!position || !velocity || typeof width !== 'number' || typeof height !== 'number' || typeof deltaTime !== 'number') {
            return { newX: position ? position.x : 0, newY: position ? position.y : 0, newZ: position ? position.z : 0, onGround: false };
        }

        // Convert velocity to displacement
        var deltaX = velocity.x * deltaTime;
        var deltaY = velocity.y * deltaTime;
        var deltaZ = velocity.z * deltaTime;

        return this._resolveDisplacement(position, deltaX, deltaY, deltaZ, width, height);
    };

    /**
     * Internal displacement-based collision resolution.
     * Shared by `resolveMovementWithDelta()` and creative fly mode.
     *
     * Resolution order: X → Y → Z per axis. This prevents getting stuck on corners
     * because each axis is resolved independently before moving to the next.
     *
     * Embedding resolution: if the player's AABB starts inside a solid or liquid block,
     * push-out attempts are made in priority order (Up → Down → ±X → ±Z).
     *
     * Ground snap: when landing downward (collision on Y axis with negative delta),
     * the player's Y position is snapped to the exact block top to prevent micro-sliding.
     *
     * @param {Donkeycraft.Vector3} position — Current player center position.
     * @param {number} deltaX — X displacement in blocks.
     * @param {number} deltaY — Y displacement in blocks (positive = up, negative = down).
     * @param {number} deltaZ — Z displacement in blocks.
     * @param {number} width — Player width in blocks.
     * @param {number} height — Player height in blocks.
     * @returns {{newX: number, newY: number, newZ: number, onGround: boolean}} Resolved position and ground state.
     * @private
     */
    Donkeycraft.Collision.prototype._resolveDisplacement = function (position, deltaX, deltaY, deltaZ, width, height) {
        if (!position || typeof width !== 'number' || typeof height !== 'number') {
            return { newX: position ? position.x : 0, newY: position ? position.y : 0, newZ: position ? position.z : 0, onGround: false };
        }

        var halfWidth = width / 2;

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

        // --- Embedded player push-out ---
        // If the player is already inside a solid or liquid block (e.g., spawned inside terrain),
        // push them out using directional step sequences. This prevents getting stuck at spawn.
        if (this._pushOutOfBlocks(aabb)) {
            // Try push-out directions in priority order: Up → Down → ±X → ±Z.
            // Up is highest priority because it's the most common spawn scenario (terrain below player).
            var pushedOut = this._resolveEmbedding(aabb);
            if (!pushedOut) {
                // As a last resort, push straight up until clear of all solids AND liquids.
                // This handles extreme cases where directional pushes fail (e.g., player fully enclosed).
                var startY = aabb.minY;
                var checkY = startY + 0.05;
                while (this._aabbOverlapsSolidsAndLiquids(aabb.minX, checkY, aabb.minZ, aabb.maxX, checkY + height, aabb.maxZ)) {
                    checkY += 0.05;
                    if (checkY - startY > 2.0) break; // Safety limit — don't push more than 2 blocks up
                }
                aabb.minY = checkY;
                aabb.maxY = checkY + height;
            }
        }

        // Resolve X axis — if collision, horizontal movement is cancelled (wall slide)
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

        // Resolve Y axis — if collision and moving downward, player is on ground
        if (deltaY !== 0) {
            var solidCollisionY = false;
            if (this._checkAABBAgainstBlocks(
                aabb.minX, aabb.minY + deltaY, aabb.minZ,
                aabb.maxX, aabb.maxY + deltaY, aabb.maxZ
            )) {
                solidCollisionY = true;
                if (deltaY < 0) {
                    onGround = true;
                }
                // When landing on ground, snap to exact block top to prevent micro-sliding.
                // Check all four corners of the player's AABB at feet level for grounding.
                // This prevents snapping when only one foot is on a block (e.g., walking off an edge).
                if (deltaY < 0 && onGround) {
                    var centerX = Math.floor(aabb.minX + halfWidth);
                    var centerZ = Math.floor(aabb.minZ + halfWidth);
                    var feetY = Math.floor(aabb.minY);

                    // Check all four corners of the player's bounding box at feet level.
                    // If ANY corner has solid ground below it, the player is supported.
                    var corners = [
                        { x: Math.floor(aabb.minX + 0.01), z: Math.floor(aabb.minZ + 0.01) },
                        { x: Math.floor(aabb.maxX - 0.01), z: Math.floor(aabb.minZ + 0.01) },
                        { x: Math.floor(aabb.minX + 0.01), z: Math.floor(aabb.maxZ - 0.01) },
                        { x: Math.floor(aabb.maxX - 0.01), z: Math.floor(aabb.maxZ - 0.01) }
                    ];

                    // Find the highest solid block beneath each supported corner.
                    var bestSnapY = null;
                    for (var c = 0; c < corners.length; c++) {
                        var cx = corners[c].x;
                        var cz = corners[c].z;
                        // Check if this corner has any solid support at all
                        if (!this.isBlockSolid(cx, feetY, cz)) {
                            // Corner is in air — find the highest block below it
                            for (var _snapY2 = feetY - 1; _snapY2 >= 0; _snapY2--) {
                                if (this.isBlockSolid(cx, _snapY2, cz)) {
                                    bestSnapY = Math.max(bestSnapY !== null ? bestSnapY : 0, _snapY2 + 1);
                                    break;
                                }
                            }
                        } else {
                            // Corner is embedded in solid — find top face
                            for (var _snapY3 = feetY; _snapY3 >= 0; _snapY3--) {
                                if (this.isBlockSolid(cx, _snapY3, cz)) {
                                    bestSnapY = Math.max(bestSnapY !== null ? bestSnapY : 0, _snapY3 + 1);
                                    break;
                                }
                            }
                        }
                    }

                    // Snap to the highest supporting block top if any corner is supported.
                    // If NO corner has support (e.g., floating), don't snap — let gravity apply normally.
                    if (bestSnapY !== null) {
                        aabb.minY = bestSnapY;
                        aabb.maxY = bestSnapY + height;
                    }
                }
                deltaY = 0;
            }

            // Liquid ground support: if falling downward and no solid collision was detected,
            // check if the player's eyes are submerged in liquid. This prevents the "slowly sink
            // then blip up" oscillation when walking into deep water, while allowing shallow water
            // (1 block deep) to be traversed naturally — feet enter first, gravity carries through,
            // and solid ground collision handles the landing.
            if (!solidCollisionY && deltaY < 0) {
                var eyeCorners = [
                    { x: Math.floor(aabb.minX + 0.01), z: Math.floor(aabb.minZ + 0.01) },
                    { x: Math.floor(aabb.maxX - 0.01), z: Math.floor(aabb.minZ + 0.01) },
                    { x: Math.floor(aabb.minX + 0.01), z: Math.floor(aabb.maxZ - 0.01) },
                    { x: Math.floor(aabb.maxX - 0.01), z: Math.floor(aabb.maxZ - 0.01) }
                ];

                // Check the eye level block — only treat liquid as ground when eyes are submerged.
                // This ensures shallow water (1 block deep) doesn't trigger a premature snap.
                var eyeY = Math.floor(aabb.minY + height - 0.1);
                var eyesInLiquid = false;
                for (var ec = 0; ec < eyeCorners.length; ec++) {
                    var ex = eyeCorners[ec].x;
                    var ez = eyeCorners[ec].z;
                    if (this.isBlockLiquid(ex, eyeY, ez)) {
                        eyesInLiquid = true;
                        break;
                    }
                }

                if (eyesInLiquid) {
                    onGround = true;
                    // Snap to the liquid surface: one block above where eyes currently are.
                    aabb.minY = eyeY + 1;
                    aabb.maxY = aabb.minY + height;
                    deltaY = 0;
                }
            }

            if (!solidCollisionY && !deltaY) {
                // Liquid collision handled above — no position change needed.
            } else if (!solidCollisionY) {
                // No liquid either — fall through air normally.
                aabb.minY += deltaY;
                aabb.maxY += deltaY;
            }
        }

        // Resolve Z axis — if collision, horizontal movement is cancelled (wall slide)
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
     * Check if the player's AABB is embedded in any solid or liquid block.
     * Iterates over all integer block positions within the AABB bounds and returns
     * `true` on the first solid or liquid block found (early exit for performance).
     *
     * Liquids are included to prevent players from getting stuck when spawned
     * inside water or lava.
     *
     * @param {object} aabb — Player AABB object {minX, minY, minZ, maxX, maxY, maxZ}.
     * @returns {boolean} True if the player is embedded in any solid or liquid block.
     * @private
     */
    Donkeycraft.Collision.prototype._pushOutOfBlocks = function (aabb) {
        if (!aabb || typeof aabb.minX !== 'number') return false;

        var startX = Math.floor(aabb.minX);
        var endX = Math.ceil(aabb.maxX);
        var startY = Math.floor(aabb.minY);
        var endY = Math.ceil(aabb.maxY);
        var startZ = Math.floor(aabb.minZ);
        var endZ = Math.ceil(aabb.maxZ);

        for (var y = startY; y < endY; y++) {
            for (var x = startX; x < endX; x++) {
                for (var z = startZ; z < endZ; z++) {
                    if (this.isBlockSolid(x, y, z) || this.isBlockLiquid(x, y, z)) {
                        return true; // Embedded in a solid or liquid block
                    }
                }
            }
        }

        return false;
    };

    /**
     * Resolve player embedding by trying multiple push-out directions in priority order.
     * Attempts to push the player out of solid and liquid blocks by iterating through directional
     * step sequences: Up → Down → +X → -X → +Z → -Z. Each direction is tested with
     * 0.05-block steps (max 40 steps = 2 blocks total push).
     *
     * Priority order reflects typical player embedding scenarios:
     * 1. **Up** — escape to solid ground (most common for terrain spawning)
     * 2. **Down** — if trapped under a ceiling
     * 3. **Horizontal** — push out sideways as last resort (±X, ±Z)
     *
     * @param {object} aabb — Player AABB object (modified in place).
     * @returns {boolean} True if the player is no longer embedded in any solid or liquid block.
     * @private
     */
    Donkeycraft.Collision.prototype._resolveEmbedding = function (aabb) {
        if (!aabb) return false;

        // Priority order for push-out directions:
        // 1. Up — escape to solid ground (most common for terrain spawning)
        // 2. Down — if trapped under a ceiling
        // 3. +X — horizontal push right
        // 4. -X — horizontal push left
        // 5. +Z — horizontal push forward
        // 6. -Z — horizontal push backward
        var pushes = [
            { dx: 0, dy: 1, dz: 0 },   // Up (highest priority)
            { dx: 0, dy: -1, dz: 0 },  // Down
            { dx: 1, dy: 0, dz: 0 },   // +X
            { dx: -1, dy: 0, dz: 0 },  // -X
            { dx: 0, dy: 0, dz: 1 },   // +Z
            { dx: 0, dy: 0, dz: -1 }   // -Z (lowest priority)
        ];

        var step = 0.05;
        var maxSteps = 40; // Max 2 blocks total push

        for (var p = 0; p < pushes.length; p++) {
            var push = pushes[p];
            var embedded = true;

            for (var s = 0; s < maxSteps && embedded; s++) {
                aabb.minX += push.dx * step;
                aabb.maxX += push.dx * step;
                aabb.minY += push.dy * step;
                aabb.maxY += push.dy * step;
                aabb.minZ += push.dz * step;
                aabb.maxZ += push.dz * step;

                // Check if still embedded in any solid OR liquid block
                embedded = this._aabbOverlapsSolidsAndLiquids(
                    aabb.minX, aabb.minY, aabb.minZ,
                    aabb.maxX, aabb.maxY, aabb.maxZ
                );
            }

            if (!embedded) {
                return true; // Successfully pushed out
            }
        }

        return false; // Still embedded after all attempts
    };

    /**
     * Check if an axis-aligned bounding box overlaps with any solid block.
     * Iterates over all integer block positions within the AABB and returns true
     * on the first solid block found (early exit for performance).
     * Used specifically during embedding resolution to verify when the player
     * is no longer inside any solid block after push-out attempts.
     *
     * @param {number} minX - Minimum X coordinate of the AABB.
     * @param {number} minY - Minimum Y coordinate of the AABB.
     * @param {number} minZ - Minimum Z coordinate of the AABB.
     * @param {number} maxX - Maximum X coordinate of the AABB.
     * @param {number} maxY - Maximum Y coordinate of the AABB.
     * @param {number} maxZ - Maximum Z coordinate of the AABB.
     * @returns {boolean} True if any solid block overlaps with the AABB.
     * @private
     */
    Donkeycraft.Collision.prototype._aabbOverlapsSolid = function (minX, minY, minZ, maxX, maxY, maxZ) {
        if (typeof minX !== 'number') return false;

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
                        return true;
                    }
                }
            }
        }

        return false;
    };

    /**
     * Check if an axis-aligned bounding box overlaps with any solid OR liquid block.
     * Iterates over all integer block positions within the AABB and returns true
     * on the first solid or liquid block found (early exit for performance).
     * Used during embedding resolution to ensure players are pushed out of both
     * terrain blocks and water/lava when spawned inside them.
     *
     * @param {number} minX - Minimum X coordinate of the AABB.
     * @param {number} minY - Minimum Y coordinate of the AABB.
     * @param {number} minZ - Minimum Z coordinate of the AABB.
     * @param {number} maxX - Maximum X coordinate of the AABB.
     * @param {number} maxY - Maximum Y coordinate of the AABB.
     * @param {number} maxZ - Maximum Z coordinate of the AABB.
     * @returns {boolean} True if any solid or liquid block overlaps with the AABB.
     * @private
     */
    Donkeycraft.Collision.prototype._aabbOverlapsSolidsAndLiquids = function (minX, minY, minZ, maxX, maxY, maxZ) {
        if (typeof minX !== 'number') return false;

        var startX = Math.floor(minX);
        var endX = Math.ceil(maxX);
        var startY = Math.floor(minY);
        var endY = Math.ceil(maxY);
        var startZ = Math.floor(minZ);
        var endZ = Math.ceil(maxZ);

        for (var y = startY; y < endY; y++) {
            for (var x = startX; x < endX; x++) {
                for (var z = startZ; z < endZ; z++) {
                    if (this.isBlockSolid(x, y, z) || this.isBlockLiquid(x, y, z)) {
                        return true;
                    }
                }
            }
        }

        return false;
    };

    /**
     * Check if a block at global coordinates is solid (blocks movement).
     *
     * Below world bottom (Y < 0), returns `true` — bedrock/solid barrier prevents falling through.
     * Above world top (Y >= WORLD_HEIGHT), returns `false` — empty space.
     * In unloaded chunks, returns `false` — no chunk means no solid blocks. This means the
     * player can clip through terrain at chunk boundaries until the chunk loads.
     *
     * @param {number} globalX - Global X coordinate (any integer).
     * @param {number} globalY - Global Y coordinate (any integer).
     * @param {number} globalZ - Global Z coordinate (any integer).
     * @returns {boolean} True if the block is solid.
     */
    Donkeycraft.Collision.prototype.isBlockSolid = function (globalX, globalY, globalZ) {
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
     * Replaceable blocks can be overwritten during block placement.
     *
     * In unloaded chunks, returns `true` — treated as air/replaceable.
     *
     * @param {number} globalX - Global X coordinate (any integer).
     * @param {number} globalY - Global Y coordinate (any integer).
     * @param {number} globalZ - Global Z coordinate (any integer).
     * @returns {boolean} True if the block is replaceable.
     */
    Donkeycraft.Collision.prototype.isBlockReplaceable = function (globalX, globalY, globalZ) {
        if (globalY < 0 || globalY >= WORLD_HEIGHT) {
            return false;
        }

        var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
        var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
        var localX = Donkeycraft.Chunk.localCoordX(globalX);
        var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) {
            return true; // Unloaded chunk = treat as replaceable (air)
        }

        var blockId = chunk.getBlock(localX, globalY, localZ);
        if (blockId === 0) {
            return true; // Air is replaceable
        }

        return Donkeycraft.BlockRegistry.isReplaceable(blockId);
    };

    /**
     * Check if a block at global coordinates is a liquid (water or lava).
     *
     * In unloaded chunks, returns `false` — no chunk means no liquids detected.
     *
     * @param {number} globalX - Global X coordinate (any integer).
     * @param {number} globalY - Global Y coordinate (any integer).
     * @param {number} globalZ - Global Z coordinate (any integer).
     * @returns {boolean} True if the block is a liquid.
     */
    Donkeycraft.Collision.prototype.isBlockLiquid = function (globalX, globalY, globalZ) {
        if (globalY < 0 || globalY >= WORLD_HEIGHT) {
            return false;
        }

        var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
        var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
        var localX = Donkeycraft.Chunk.localCoordX(globalX);
        var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) {
            return false; // No chunk = no liquids
        }

        var blockId = chunk.getBlock(localX, globalY, localZ);
        return Donkeycraft.BlockRegistry.isLiquid(blockId);
    };

    /**
     * Check if a block at global coordinates is specifically lava (not water).
     *
     * Used to distinguish lava from water for fall damage stamina:
     * only water absorbs/cancels fall impact; lava does NOT.
     *
     * In unloaded chunks, returns `false` — no chunk means no blocks detected.
     *
     * @param {number} globalX - Global X coordinate (any integer).
     * @param {number} globalY - Global Y coordinate (any integer).
     * @param {number} globalZ - Global Z coordinate (any integer).
     * @returns {boolean} True if the block is lava.
     */
    Donkeycraft.Collision.prototype.isBlockLava = function (globalX, globalY, globalZ) {
        if (globalY < 0 || globalY >= WORLD_HEIGHT) {
            return false;
        }

        var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
        var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
        var localX = Donkeycraft.Chunk.localCoordX(globalX);
        var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) {
            return false; // No chunk = no blocks
        }

        var blockId = chunk.getBlock(localX, globalY, localZ);
        return Donkeycraft.BlockTypes.isLava(blockId);
    };

    /**
     * Get all solid blocks that overlap with the given AABB.
     * Iterates over all integer block positions within the AABB bounds and returns
     * an array of `{x, y, z, blockId}` objects for each solid block found.
     *
     * **Performance note:** Each cell requires one chunk lookup via `isBlockSolid()`.
     * For a typical player-sized AABB (~0.6×1.8×0.6), this checks 2×4×2 = 16 cells max.
     * The block ID is retrieved in the same loop to avoid redundant chunk access.
     *
     * @param {number} minX — Minimum X coordinate of the AABB (any real number).
     * @param {number} minY — Minimum Y coordinate of the AABB (any real number).
     * @param {number} minZ — Minimum Z coordinate of the AABB (any real number).
     * @param {number} maxX — Maximum X coordinate of the AABB (must be > minX).
     * @param {number} maxY — Maximum Y coordinate of the AABB (must be > minY).
     * @param {number} maxZ — Maximum Z coordinate of the AABB (must be > minZ).
     * @returns {Array<{x: number, y: number, z: number, blockId: number}>} Array of overlapping solid blocks (empty if invalid input).
     */
    Donkeycraft.Collision.prototype.getOverlappingBlocks = function (minX, minY, minZ, maxX, maxY, maxZ) {
        // Validate input — return empty array for NaN or inverted bounds
        if (typeof minX !== 'number' || typeof minY !== 'number' || typeof minZ !== 'number' ||
            typeof maxX !== 'number' || typeof maxY !== 'number' || typeof maxZ !== 'number') {
            return [];
        }

        // Early exit for inverted or degenerate AABB
        if (maxX <= minX || maxY <= minY || maxZ <= minZ) {
            return [];
        }

        var blocks = [];

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
     * Returns true on first match (early exit) for performance.
     * This is the core collision detection method used by `checkMovement()`
     * and `_resolveDisplacement()` to determine if movement along any axis
     * would intersect a solid block.
     *
     * @param {number} minX - Minimum X coordinate of the AABB (any real number).
     * @param {number} minY - Minimum Y coordinate of the AABB (any real number).
     * @param {number} minZ - Minimum Z coordinate of the AABB (any real number).
     * @param {number} maxX - Maximum X coordinate of the AABB (must be > minX).
     * @param {number} maxY - Maximum Y coordinate of the AABB (must be > minY).
     * @param {number} maxZ - Maximum Z coordinate of the AABB (must be > minZ).
     * @returns {boolean} True if any solid block overlaps with the AABB.
     * @private
     */
    Donkeycraft.Collision.prototype._checkAABBAgainstBlocks = function (minX, minY, minZ, maxX, maxY, maxZ) {
        if (typeof minX !== 'number') return false;

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
                        return true; // Early exit on first solid block
                    }
                }
            }
        }

        return false;
    };

    /**
     * Get the block ID at global coordinates.
     *
     * @param {number} globalX - Global X coordinate.
     * @param {number} globalY - Global Y coordinate.
     * @param {number} globalZ - Global Z coordinate.
     * @returns {number} Block ID (0 = air or unloaded chunk).
     * @private
     */
    Donkeycraft.Collision.prototype._getBlockIdAt = function (globalX, globalY, globalZ) {
        if (globalY < 0 || globalY >= WORLD_HEIGHT) {
            return 0;
        }

        var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
        var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);
        var localX = Donkeycraft.Chunk.localCoordX(globalX);
        var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) {
            return 0; // No chunk = air
        }

        return chunk.getBlock(localX, globalY, localZ);
    };

    /**
     * Check entity collision: returns the first entity whose AABB overlaps with the player's.
     *
     * Iterates over all entities and performs an AABB overlap test against the player's
     * bounding box. Entity dimensions default to `{width: 0.6, height: 1.8}` if the
     * entity does not provide a `getDimensions()` method.
     *
     * **Usage:** Call this during the game tick to detect player-mob collisions.
     * Returns the first overlapping entity (early exit) for performance.
     *
     * @param {Donkeycraft.Vector3} position — Player center position.
     * @param {number} width — Player width in blocks.
     * @param {number} height — Player height in blocks.
     * @param {Array} entities — Array of entity objects, each with `getPosition()` method and optional `getDimensions()` method.
     * @returns {null|object} The first overlapping entity object, or `null` if no collision detected.
     */
    Donkeycraft.Collision.prototype.checkEntityCollision = function (position, width, height, entities) {
        if (!position || !entities || !Array.isArray(entities)) return null;

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

            // AABB overlap test (strict inequality for proper boundary handling)
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
     * @returns {Donkeycraft.ChunkManager|null} The chunk manager instance, or null if destroyed.
     */
    Donkeycraft.Collision.prototype.getChunkManager = function () {
        return this._chunkManager;
    };

    /**
     * Destroy the collision system and free internal references.
     * Call this when the game is shutting down to prevent memory leaks.
     * After calling, all methods will return safe defaults (false, null, empty array).
     */
    Donkeycraft.Collision.prototype.destroy = function () {
        this._chunkManager = null;
        this._config = null;
    };

})();