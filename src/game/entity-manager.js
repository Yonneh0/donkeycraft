// Donkeycraft — Entity Manager
// Manages entity lifecycle: spawn, despawn, tick all entities, by-type queries.
// Enhanced with spatial hash-based awareness tracking for efficient rendering culling.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    // ============================================================
    // Awareness Tier Constants — Proximity-based update/render tiers
    // ============================================================

    /**
     * AwarenessTiers — Entity proximity tiers for render/update optimization.
     * @namespace
     */
    Donkeycraft.AwarenessTiers = {
        NEAR: 'near',    // 0-8 blocks: Full update, render, animate
        FAR: 'far',      // 8-32 blocks: Reduced update, render, simplified animation
        DISTANT: 'distant' // 32+ blocks: Position-only updates, no animation
    };

    /**
     * EntityManager — manages all active entities in the world.
     * Maintains an efficient spatial hash for proximity queries and tiered awareness tracking.
     */
    Donkeycraft.EntityManager = function () {
        /**
         * All active entities indexed by ID.
         * @type {Object.<number, Donkeycraft.Entity>}
         * @private
         */
        this._entities = {};

        /**
         * Entities indexed by type for fast queries.
         * @type {Object.<string, Array<Donkeycraft.Entity>>}
         * @private
         */
        this._byType = {};

        /**
         * Next entity ID to assign.
         * @type {number}
         * @private
         */
        this._nextId = 1;

        /**
         * Maximum number of entities allowed.
         * @type {number}
         */
        this.maxEntities = 1000;

        // ============================================================
        // Spatial Hash — O(1) proximity queries
        // ============================================================

        /**
         * Size of each spatial hash cell in blocks.
         * Smaller cells = more precise queries but more overhead.
         * @type {number}
         * @private
         */
        this._cellSize = 2;

        /**
         * Spatial hash grid: "cellX,cellY,cellZ" → Set of entity IDs.
         * @type {Object.<string, Set<number>>}
         * @private
         */
        this._spatialHash = {};

        /**
         * Entity-to-cell mapping: entityId → "cellX,cellY,cellZ".
         * @type {Object.<number, string>}
         * @private
         */
        this._entityToCell = {};

        // ============================================================
        // Awareness Table — Player-centric proximity tracking
        // ============================================================

        /**
         * Current awareness center (player position).
         * @type {{x: number, y: number, z: number}|null}
         * @private
         */
        this._awarenessCenter = null;

        /**
         * Awareness radius in blocks (matches render distance).
         * @type {number}
         * @private
         */
        this._awarenessRadius = 16;

        /**
         * Entity awareness tiers: entityId → AwarenessTier.
         * @type {Object.<number, string>}
         * @private
         */
        this._entityAwareness = {};

        /**
         * Cached near-tier entity IDs for fast rendering.
         * @type {Array<number>}
         * @private
         */
        this._nearEntities = [];

        /**
         * Cached far-tier entity IDs for rendering.
         * @type {Array<number>}
         * @private
         */
        this._farEntities = [];
    };

    // ============================================================
    // Spatial Hash Operations
    // ============================================================

    /**
     * _hashKey — Compute spatial hash key from world coordinates.
     * @private
     * @param {number} x - World X coordinate.
     * @param {number} y - World Y coordinate.
     * @param {number} z - World Z coordinate.
     * @returns {string} Hash key string.
     */
    Donkeycraft.EntityManager.prototype._hashKey = function (x, y, z) {
        var cellSize = this._cellSize;
        var cellX = Math.floor(x / cellSize);
        var cellY = Math.floor(y / cellSize);
        var cellZ = Math.floor(z / cellSize);
        return cellX + ',' + cellY + ',' + cellZ;
    };

    /**
     * _updateSpatialHash — Add or update an entity's position in the spatial hash.
     * @private
     * @param {number} entityId - Entity ID.
     * @param {Donkeycraft.Vector3} position - Entity world position.
     */
    Donkeycraft.EntityManager.prototype._updateSpatialHash = function (entityId, position) {
        if (!position) return;

        var key = this._hashKey(position.x, position.y, position.z);
        var oldKey = this._entityToCell[entityId];

        // Remove from old cell
        if (oldKey && this._spatialHash[oldKey]) {
            var oldSet = this._spatialHash[oldKey];
            oldSet.delete(entityId);
            if (oldSet.size === 0) {
                delete this._spatialHash[oldKey];
            }
        }

        // Add to new cell
        if (!this._spatialHash[key]) {
            this._spatialHash[key] = new Set();
        }
        this._spatialHash[key].add(entityId);
        this._entityToCell[entityId] = key;
    };

    /**
     * _removeFromSpatialHash — Remove an entity from the spatial hash.
     * @private
     * @param {number} entityId - Entity ID.
     */
    Donkeycraft.EntityManager.prototype._removeFromSpatialHash = function (entityId) {
        var key = this._entityToCell[entityId];
        if (key && this._spatialHash[key]) {
            var set = this._spatialHash[key];
            set.delete(entityId);
            if (set.size === 0) {
                delete this._spatialHash[key];
            }
        }
        delete this._entityToCell[entityId];
    };

    /**
     * _getNearbyEntityIds — Get entity IDs within a radius of a point using spatial hash.
     * @private
     * @param {number} cx - Center X coordinate.
     * @param {number} cy - Center Y coordinate.
     * @param {number} cz - Center Z coordinate.
     * @param {number} radius - Search radius in blocks.
     * @returns {Array<number>} Array of nearby entity IDs.
     */
    Donkeycraft.EntityManager.prototype._getNearbyEntityIds = function (cx, cy, cz, radius) {
        var cellSize = this._cellSize;
        var minCellX = Math.floor((cx - radius) / cellSize);
        var maxCellX = Math.floor((cx + radius) / cellSize);
        var minCellY = Math.floor((cy - radius) / cellSize);
        var maxCellY = Math.floor((cy + radius) / cellSize);
        var minCellZ = Math.floor((cz - radius) / cellSize);
        var maxCellZ = Math.floor((cz + radius) / cellSize);

        var result = [];
        var radiusSq = radius * radius;

        for (var cellX = minCellX; cellX <= maxCellX; cellX++) {
            for (var cellY = minCellY; cellY <= maxCellY; cellY++) {
                for (var cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
                    var key = cellX + ',' + cellY + ',' + cellZ;
                    var cellSet = this._spatialHash[key];
                    if (cellSet) {
                        cellSet.forEach(function (entityId) {
                            var entity = this._entities[entityId];
                            if (entity && entity.isAlive()) {
                                var pos = entity.getPosition();
                                if (pos) {
                                    var dx = pos.x - cx;
                                    var dy = pos.y - cy;
                                    var dz = pos.z - cz;
                                    if (dx * dx + dy * dy + dz * dz <= radiusSq) {
                                        result.push(entityId);
                                    }
                                }
                            }
                        }, this);
                    }
                }
            }
        }

        return result;
    };

    // ============================================================
    // Awareness Table Operations
    // ============================================================

    /**
     * _updateAwareness — Recompute awareness tiers for all entities based on player position.
     * Iterates over all alive entities once, computing distance from the awareness center
     * and assigning each entity to a tier (NEAR, FAR, or DISTANT).
     * @private
     * @param {number} playerX - Player X coordinate.
     * @param {number} playerY - Player Y coordinate.
     * @param {number} playerZ - Player Z coordinate.
     */
    Donkeycraft.EntityManager.prototype._updateAwareness = function (playerX, playerY, playerZ) {
        this._awarenessCenter = { x: playerX, y: playerY, z: playerZ };

        var nearEntities = [];
        var farEntities = [];
        var awarenessRadius = this._awarenessRadius;
        var nearRadius = 8; // NEAR tier radius in blocks
        var farRadius = 32; // FAR tier outer radius

        // Iterate over all alive entities
        for (var id in this._entities) {
            if (!this._entities.hasOwnProperty(id)) continue;

            var entity = this._entities[id];
            if (!entity.isAlive()) continue;

            var pos = entity.getPosition();
            if (!pos) continue;

            var dx = pos.x - playerX;
            var dy = pos.y - playerY;
            var dz = pos.z - playerZ;
            var distSq = dx * dx + dy * dy + dz * dz;
            var dist = Math.sqrt(distSq);

            // Determine awareness tier
            var tier = Donkeycraft.AwarenessTiers.DISTANT;
            if (dist <= nearRadius) {
                tier = Donkeycraft.AwarenessTiers.NEAR;
                nearEntities.push(parseInt(id, 10));
            } else if (dist <= farRadius && dist <= awarenessRadius) {
                tier = Donkeycraft.AwarenessTiers.FAR;
                farEntities.push(parseInt(id, 10));
            }

            // Update awareness tracking
            var entityId = parseInt(id, 10);
            var oldTier = this._entityAwareness[entityId];
            this._entityAwareness[entityId] = tier;

            // Emit awareness change event if tier changed
            if (oldTier && oldTier !== tier && EventBus) {
                try {
                    EventBus.emitSafe('entity:awareness:changed', {
                        entity: entity,
                        id: entityId,
                        oldTier: oldTier,
                        newTier: tier
                    });
                } catch (e) {
                    // EventBus may not be available
                }
            }
        }

        this._nearEntities = nearEntities;
        this._farEntities = farEntities;
    };

    /**
     * getAwarenessTier — Get the awareness tier for a specific entity.
     * @param {number} entityId - Entity ID.
     * @returns {string|null} Awareness tier ('near', 'far', 'distant') or null if not tracked.
     */
    Donkeycraft.EntityManager.prototype.getAwarenessTier = function (entityId) {
        return this._entityAwareness[entityId] || null;
    };

    /**
     * getNearEntities — Get entity IDs in the NEAR awareness tier.
     * @returns {Array<number>} Array of entity IDs.
     */
    Donkeycraft.EntityManager.prototype.getNearEntities = function () {
        return this._nearEntities.slice(); // Return copy
    };

    /**
     * getFarEntities — Get entity IDs in the FAR awareness tier.
     * @returns {Array<number>} Array of entity IDs.
     */
    Donkeycraft.EntityManager.prototype.getFarEntities = function () {
        return this._farEntities.slice(); // Return copy
    };

    /**
     * getAwarenessRadius — Get the current awareness radius.
     * @returns {number} Radius in blocks.
     */
    Donkeycraft.EntityManager.prototype.getAwarenessRadius = function () {
        return this._awarenessRadius;
    };

    /**
     * setAwarenessRadius — Set the awareness radius for entity culling.
     * @param {number} radius - Radius in blocks.
     */
    Donkeycraft.EntityManager.prototype.setAwarenessRadius = function (radius) {
        this._awarenessRadius = Math.max(4, Math.min(64, radius));
    };

    // ============================================================
    // Entity Lifecycle — Spawn, despawn, tick
    // ============================================================

    /**
     * Spawn a new entity.
     * @param {Donkeycraft.Entity} entity - Entity to spawn.
     * @returns {number|null} Entity ID, or null if spawn failed (entity invalid or limit reached).
     */
    Donkeycraft.EntityManager.prototype.spawn = function (entity) {
        if (!entity || !entity.isAlive()) {
            return null;
        }

        // Check entity limit
        if (this.getAliveCount() >= this.maxEntities) {
            if (Donkeycraft.Logger && typeof Donkeycraft.Logger.warn === 'function') {
                Donkeycraft.Logger.warn('EntityManager', 'Entity spawn rejected — alive count (' + this.getAliveCount() + ') at maxEntities limit (' + this.maxEntities + ')');
            }
            return null;
        }

        var id = this._nextId++;
        entity._id = id;
        var type = entity.type;

        // Register by ID
        this._entities[id] = entity;

        // Register by type
        if (!this._byType[type]) {
            this._byType[type] = [];
        }
        this._byType[type].push(entity);

        // Update spatial hash with entity position
        var pos = entity.getPosition();
        if (pos) {
            this._updateSpatialHash(id, pos);
        }

        // Emit spawn event via global EventBus
        if (EventBus) {
            try {
                EventBus.emitSafe('entity:spawn', {
                    entity: entity,
                    id: id,
                    type: type
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }

        return id;
    };

    /**
     * _injectGroundCheck — Inject ground detection callbacks into all alive entities.
     * This is called during tick to provide chunk-based ground detection.
     * Only entities with a setGroundCheck method are updated (all Entity instances).
     * @private
     * @param {Function} groundCheckFn - Ground detection function returning ground Y level or null.
     */
    Donkeycraft.EntityManager.prototype._injectGroundCheck = function (groundCheckFn) {
        if (!groundCheckFn || typeof groundCheckFn !== 'function') return;

        var entities = this.getAllEntities();
        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];
            if (entity.setGroundCheck) {
                entity.setGroundCheck(groundCheckFn);
            }
        }
    };

    /**
     * Get an entity by ID.
     * @param {number} id - Entity ID.
     * @returns {Donkeycraft.Entity|null} The entity, or null if not found.
     */
    Donkeycraft.EntityManager.prototype.getEntity = function (id) {
        return this._entities[id] || null;
    };

    /**
     * Despawns an entity by ID.
     * Calls the entity's despawn() method, removes it from all internal indexes
     * (by ID, by type, spatial hash, awareness table), and emits a despawn event.
     * Safe to call on non-existent or already-despawned entities.
     * @param {number} id - Entity ID to despawn.
     */
    Donkeycraft.EntityManager.prototype.despawn = function (id) {
        if (!this._entities[id]) return;

        var entity = this._entities[id];
        var entityId = parseInt(id, 10);

        // Mark entity as despawned
        entity.despawn();

        // Remove from by-type index
        var type = entity.type;
        if (this._byType[type]) {
            var idx = this._byType[type].indexOf(entity);
            if (idx !== -1) {
                this._byType[type].splice(idx, 1);
            }
            // Clean up empty type arrays
            if (this._byType[type].length === 0) {
                delete this._byType[type];
            }
        }

        // Remove from spatial hash
        this._removeFromSpatialHash(entityId);

        // Remove from awareness table
        delete this._entityAwareness[entityId];

        // Remove from near/far cached lists
        var nearIdx = this._nearEntities.indexOf(entityId);
        if (nearIdx !== -1) this._nearEntities.splice(nearIdx, 1);
        var farIdx = this._farEntities.indexOf(entityId);
        if (farIdx !== -1) this._farEntities.splice(farIdx, 1);

        // Remove from entity map
        delete this._entities[id];

        // Emit despawn event via global EventBus
        if (EventBus) {
            try {
                EventBus.emitSafe('entity:despawn', {
                    entity: entity,
                    id: entityId,
                    type: type
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Get all alive entities of a given type.
     * Filters out dead/despawned entities before returning.
     * @param {string} type - Entity type (e.g., 'zombie', 'cow').
     * @param {number} [maxResults=100] - Maximum number of results to return.
     * @returns {Donkeycraft.Entity[]} Array of alive entities, up to maxResults.
     */
    Donkeycraft.EntityManager.prototype.getByType = function (type, maxResults) {
        maxResults = maxResults || 100;
        var list = this._byType[type];
        if (!list) {
            return [];
        }
        // Return a copy limited to maxResults
        var result = [];
        for (var i = 0; i < list.length && result.length < maxResults; i++) {
            if (list[i].isAlive()) {
                result.push(list[i]);
            }
        }
        return result;
    };

    /**
     * Get all alive entities within a spherical range from a point.
     * Supports both 2D (cx, cz, radius) and 3D (cx, cy, cz, range) signatures.
     * Uses spatial hash for O(n) performance when searching near existing cells.
     * @param {number} cx - Center X coordinate (or center Z if 2 args).
     * @param {number} [cy] - Center Y coordinate (3D) or radius (2D).
     * @param {number} [cz] - Center Z coordinate (3D only).
     * @param {number} [range] - Maximum distance (blocks) (3D only).
     * @returns {Donkeycraft.Entity[]} Array of alive entities within range, up to 1000 results.
     */
    Donkeycraft.EntityManager.prototype.getEntitiesInRange = function (cx, cy, cz, range) {
        // Support 2D signature: getEntitiesInRange(cx, cz, radius)
        var is3D = arguments.length >= 4;

        if (is3D) {
            // 3D spherical range
            range = range || 16;
            var result = [];
            for (var id in this._entities) {
                if (this._entities.hasOwnProperty(id)) {
                    var entity = this._entities[id];
                    if (!entity.isAlive()) {
                        continue;
                    }
                    var pos = entity.getPosition();
                    if (!pos) {
                        continue;
                    }
                    var dx = pos.x - cx;
                    var dy = pos.y - cy;
                    var dz = pos.z - cz;
                    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist <= range) {
                        result.push(entity);
                    }
                }
            }
            return result;
        } else {
            // 2D horizontal range (ignore Y)
            var radius = cy || 10;
            var radiusSq = radius * radius;
            var cz2 = cz;
            var result = [];
            for (var id2 in this._entities) {
                if (this._entities.hasOwnProperty(id2)) {
                    var entity2 = this._entities[id2];
                    if (!entity2.isAlive() || !entity2.getPosition) {
                        continue;
                    }
                    var pos2 = entity2.getPosition();
                    if (!pos2) {
                        continue;
                    }
                    var dx2 = pos2.x - cx;
                    var dz2 = pos2.z - cz2;
                    if (dx2 * dx2 + dz2 * dz2 <= radiusSq) {
                        result.push(entity2);
                    }
                }
            }
            return result;
        }
    };

    /**
     * Get all alive entities.
     * @returns {Donkeycraft.Entity[]} Array of all alive entities.
     */
    Donkeycraft.EntityManager.prototype.getAllEntities = function () {
        var result = [];
        for (var id in this._entities) {
            if (this._entities.hasOwnProperty(id)) {
                var entity = this._entities[id];
                if (entity.isAlive()) {
                    result.push(entity);
                }
            }
        }
        return result;
    };

    /**
     * Get the total number of entities (alive + dead).
     * @returns {number}
     */
    Donkeycraft.EntityManager.prototype.getCount = function () {
        return Object.keys(this._entities).length;
    };

    /**
     * Get the count of alive entities.
     * @returns {number}
     */
    Donkeycraft.EntityManager.prototype.getAliveCount = function () {
        var count = 0;
        for (var id in this._entities) {
            if (this._entities.hasOwnProperty(id)) {
                if (this._entities[id].isAlive()) {
                    count++;
                }
            }
        }
        return count;
    };

    /**
     * Tick all alive entities.
     * Updates spatial hash and awareness table based on player position.
     * Dead/despawned entities are collected during ticking and removed in a cleanup pass.
     *
     * Tick flow:
     * 1. Update awareness table (if player position provided)
     * 2. Inject ground check callback (if provided) into all alive entities
     * 3. Tick each alive entity, updating spatial hash with new positions
     * 4. Collect dead/despawned/errored entities and remove them
     *
     * @param {number} deltaTime - Time since last tick in seconds.
     * @param {number} [playerX=0] - Player X coordinate for awareness tier calculation.
     * @param {number} [playerY=64] - Player Y coordinate for awareness tier calculation.
     * @param {number} [playerZ=0] - Player Z coordinate for awareness tier calculation.
     * @param {Function} [groundCheckFn=null] - Optional ground detection callback.
     *   If provided, it is injected into all entities via setGroundCheck() before ticking.
     *   The function should return the Y coordinate of the ground surface at a given position,
     *   or null if no solid ground exists.
     */
    Donkeycraft.EntityManager.prototype.tick = function (deltaTime, playerX, playerY, playerZ, groundCheckFn) {
        // Update awareness if player position provided
        if (playerX !== undefined && playerY !== undefined && playerZ !== undefined) {
            this._updateAwareness(playerX, playerY, playerZ);
        }

        // Inject ground check callback into all entities if provided
        if (groundCheckFn) {
            this._injectGroundCheck(groundCheckFn);
        }

        // Collect entity IDs to despawn (errored or died during tick)
        var toDespawn = [];

        // Single pass: tick alive entities and collect errors
        for (var id in this._entities) {
            if (!this._entities.hasOwnProperty(id)) continue;

            var entity = this._entities[id];
            if (!entity.isAlive()) continue;

            try {
                entity.tick(deltaTime);

                // Update spatial hash with new position
                var newPos = entity.getPosition();
                if (newPos) {
                    this._updateSpatialHash(parseInt(id, 10), newPos);
                }
            } catch (e) {
                // Entity tick error — mark for despawn
                toDespawn.push(parseInt(id, 10));
            }
        }

        // Cleanup pass: remove all dead/despawned entities exactly once.
        var despawnedSet = new Set(toDespawn);

        for (var id2 in this._entities) {
            if (!this._entities.hasOwnProperty(id2)) continue;

            var entity2 = this._entities[id2];
            var entityId2 = parseInt(id2, 10);

            // Skip entities already in the despawn list
            if (despawnedSet.has(entityId2)) continue;

            // Remove any entity that died or was despawned during tick
            if (!entity2.isAlive()) {
                despawnedSet.add(entityId2);
                this.despawn(entityId2);
            }
        }

        // Despawn entities that errored during tick.
        for (var i = 0; i < toDespawn.length; i++) {
            var errorId = toDespawn[i];
            if (!despawnedSet.has(errorId)) {
                this.despawn(errorId);
            }
        }
    };

    /**
     * Check if an entity exists by ID (regardless of alive status).
     * @param {number} id - Entity ID.
     * @returns {boolean} True if an entity with this ID exists.
     */
    Donkeycraft.EntityManager.prototype.hasEntity = function (id) {
        return this._entities[id] !== undefined;
    };

    /**
     * Clear all entities.
     * Destroys each entity via its destroy() method, then resets all internal
     * state (entity maps, spatial hash, awareness table, ID counter) to initial values.
     * This method is idempotent — calling it multiple times is safe.
     */
    Donkeycraft.EntityManager.prototype.clear = function () {
        for (var id in this._entities) {
            if (this._entities.hasOwnProperty(id)) {
                this._entities[id].destroy();
            }
        }
        this._entities = {};
        this._byType = {};
        this._spatialHash = {};
        this._entityToCell = {};
        this._entityAwareness = {};
        this._nearEntities = [];
        this._farEntities = [];
        this._nextId = 1;
        this._awarenessCenter = null;
    };

    /**
     * Destroy the entity manager and free resources.
     * Equivalent to clear() but explicitly documents resource cleanup.
     */
    Donkeycraft.EntityManager.prototype.destroy = function () {
        this.clear();
    };

    /**
     * Get statistics about the entity manager state.
     * @returns {{total: number, alive: number, byType: Object, nearCount: number, farCount: number, distantCount: number}}
     *   - total: Total entities (alive + dead)
     *   - alive: Count of alive entities
     *   - byType: Map of type name to alive count
     *   - nearCount: Entities in NEAR awareness tier
     *   - farCount: Entities in FAR awareness tier
     *   - distantCount: Entities in DISTANT awareness tier
     */
    Donkeycraft.EntityManager.prototype.getStats = function () {
        var byType = {};
        for (var type in this._byType) {
            if (this._byType.hasOwnProperty(type)) {
                var list = this._byType[type];
                var aliveCount = 0;
                for (var i = 0; i < list.length; i++) {
                    if (list[i].isAlive()) aliveCount++;
                }
                if (aliveCount > 0) byType[type] = aliveCount;
            }
        }

        var distantCount = 0;
        for (var id in this._entityAwareness) {
            if (this._entityAwareness[id] === Donkeycraft.AwarenessTiers.DISTANT) {
                distantCount++;
            }
        }

        return {
            total: Object.keys(this._entities).length,
            alive: this.getAliveCount(),
            byType: byType,
            nearCount: this._nearEntities.length,
            farCount: this._farEntities.length,
            distantCount: distantCount
        };
    };

})();