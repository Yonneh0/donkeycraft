// Donkeycraft — Entity Manager
// Manages entity lifecycle: spawn, despawn, tick, and by-type queries.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * AwarenessTiers — Entity proximity tiers for render/update optimization.
     * @namespace
     */
    Donkeycraft.AwarenessTiers = {
        NEAR: 'near',
        FAR: 'far',
        DISTANT: 'distant'
    };

    /**
     * EntityManager — Manages all active entities with spatial hash and awareness tracking.
     * @constructor
     */
    Donkeycraft.EntityManager = function () {
        /** All active entities indexed by ID. */
        this._entities = {};

        /** Entities indexed by type for fast queries. */
        this._byType = {};

        /** Next entity ID to assign. */
        this._nextId = 1;

        /** Maximum number of entities allowed. */
        this.maxEntities = 1000;

        /** Spatial hash cell size in blocks. */
        this._cellSize = 2;

        /** Spatial hash grid: "cellX,cellY,cellZ" → Set of entity IDs. */
        this._spatialHash = {};

        /** Entity-to-cell mapping: entityId → "cellX,cellY,cellZ". */
        this._entityToCell = {};

        /** Current awareness center (player position). */
        this._awarenessCenter = null;

        /** Awareness radius in blocks (matches render distance). */
        this._awarenessRadius = 16;

        /** Entity awareness tiers: entityId → AwarenessTier. */
        this._entityAwareness = {};

        /** Cached near-tier entity IDs for fast rendering. */
        this._nearEntities = [];

        /** Cached far-tier entity IDs for rendering. */
        this._farEntities = [];

        /** Cached ground check function reference to avoid redundant injection. */
        this._groundCheckRef = null;
    };

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

        if (oldKey && this._spatialHash[oldKey]) {
            var oldSet = this._spatialHash[oldKey];
            oldSet.delete(entityId);
            if (oldSet.size === 0) {
                delete this._spatialHash[oldKey];
            }
        }

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
     * _getNearbyEntityIds — Get entity IDs within a radius using spatial hash.
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

    /**
     * _updateAwareness — Recompute awareness tiers for all entities based on player position.
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
        var nearRadius = 8;
        var farRadius = 32;

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

            var tier = Donkeycraft.AwarenessTiers.DISTANT;
            if (dist <= nearRadius) {
                tier = Donkeycraft.AwarenessTiers.NEAR;
                nearEntities.push(parseInt(id, 10));
            } else if (dist <= farRadius && dist <= awarenessRadius) {
                tier = Donkeycraft.AwarenessTiers.FAR;
                farEntities.push(parseInt(id, 10));
            }

            var entityId = parseInt(id, 10);
            var oldTier = this._entityAwareness[entityId];
            this._entityAwareness[entityId] = tier;

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
     * @returns {string|null} Awareness tier or null if not tracked.
     */
    Donkeycraft.EntityManager.prototype.getAwarenessTier = function (entityId) {
        return this._entityAwareness[entityId] || null;
    };

    /**
     * getNearEntities — Get entity IDs in the NEAR awareness tier.
     * @returns {Array<number>} Array of entity IDs.
     */
    Donkeycraft.EntityManager.prototype.getNearEntities = function () {
        return this._nearEntities.slice();
    };

    /**
     * getFarEntities — Get entity IDs in the FAR awareness tier.
     * @returns {Array<number>} Array of entity IDs.
     */
    Donkeycraft.EntityManager.prototype.getFarEntities = function () {
        return this._farEntities.slice();
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

    /**
     * spawn — Spawn a new entity.
     * @param {Donkeycraft.Entity} entity - Entity to spawn.
     * @returns {number|null} Entity ID, or null if spawn failed.
     */
    Donkeycraft.EntityManager.prototype.spawn = function (entity) {
        if (!entity || !entity.isAlive()) {
            return null;
        }

        if (this.getAliveCount() >= this.maxEntities) {
            return null;
        }

        var id = this._nextId++;
        entity._id = id;
        var type = entity.type;

        this._entities[id] = entity;

        if (!this._byType[type]) {
            this._byType[type] = [];
        }
        this._byType[type].push(entity);

        var pos = entity.getPosition();
        if (pos) {
            this._updateSpatialHash(id, pos);
        }

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
     * Skips injection if the same function was already injected last tick.
     * @private
     * @param {Function} groundCheckFn - Ground detection function returning ground Y level or null.
     */
    Donkeycraft.EntityManager.prototype._injectGroundCheck = function (groundCheckFn) {
        if (!groundCheckFn || typeof groundCheckFn !== 'function') return;
        if (groundCheckFn === this._groundCheckRef) return;

        var entities = this.getAllEntities();
        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];
            if (entity.setGroundCheck) {
                entity.setGroundCheck(groundCheckFn);
            }
        }

        this._groundCheckRef = groundCheckFn;
    };

    /**
     * getEntity — Get an entity by ID.
     * @param {number} id - Entity ID.
     * @returns {Donkeycraft.Entity|null} The entity, or null if not found.
     */
    Donkeycraft.EntityManager.prototype.getEntity = function (id) {
        return this._entities[id] || null;
    };

    /**
     * despawn — Remove an entity by ID from all indexes and mark as despawned.
     * @param {number} id - Entity ID to despawn.
     */
    Donkeycraft.EntityManager.prototype.despawn = function (id) {
        if (!this._entities[id]) return;

        var entity = this._entities[id];
        var entityId = parseInt(id, 10);
        entity.despawn();

        var type = entity.type;
        if (this._byType[type]) {
            var idx = this._byType[type].indexOf(entity);
            if (idx !== -1) {
                this._byType[type].splice(idx, 1);
            }
            if (this._byType[type].length === 0) {
                delete this._byType[type];
            }
        }

        this._removeFromSpatialHash(entityId);
        delete this._entityAwareness[entityId];

        var nearIdx = this._nearEntities.indexOf(entityId);
        if (nearIdx !== -1) this._nearEntities.splice(nearIdx, 1);
        var farIdx = this._farEntities.indexOf(entityId);
        if (farIdx !== -1) this._farEntities.splice(farIdx, 1);

        delete this._entities[id];

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
     * getByType — Get all alive entities of a given type.
     * @param {string} type - Entity type (e.g., 'zombie', 'cow').
     * @param {number} [maxResults=100] - Maximum number of results to return.
     * @returns {Donkeycraft.Entity[]} Array of alive entities, up to maxResults.
     */
    Donkeycraft.EntityManager.prototype.getByType = function (type, maxResults) {
        var list = this._byType[type];
        if (!list) return [];

        var result = [];
        for (var i = 0; i < list.length && result.length < (maxResults || 100); i++) {
            if (list[i].isAlive()) {
                result.push(list[i]);
            }
        }
        return result;
    };

    /**
     * getEntitiesInRange — Get all alive entities within a spherical or horizontal range from a point.
     * Supports both 2D (cx, cz, radius) and 3D (cx, cy, cz, range) signatures.
     * @param {number} cx - Center X coordinate (or center Z if 2 args).
     * @param {number} [cy] - Center Y coordinate (3D) or radius (2D).
     * @param {number} [cz] - Center Z coordinate (3D only).
     * @param {number} [range] - Maximum distance (blocks) (3D only).
     * @returns {Donkeycraft.Entity[]} Array of alive entities within range.
     */
    Donkeycraft.EntityManager.prototype.getEntitiesInRange = function (cx, cy, cz, range) {
        var is3D = arguments.length >= 4;

        if (is3D) {
            range = range || 16;
            var cellSize = this._cellSize;
            var minCellX = Math.floor((cx - range) / cellSize);
            var maxCellX = Math.floor((cx + range) / cellSize);
            var minCellY = Math.floor((cy - range) / cellSize);
            var maxCellY = Math.floor((cy + range) / cellSize);
            var minCellZ = Math.floor((cz - range) / cellSize);
            var maxCellZ = Math.floor((cz + range) / cellSize);

            var result = [];
            var radiusSq = range * range;
            var visited = new Set();

            for (var cellX = minCellX; cellX <= maxCellX; cellX++) {
                for (var cellY = minCellY; cellY <= maxCellY; cellY++) {
                    for (var cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
                        var key = cellX + ',' + cellY + ',' + cellZ;
                        var cellSet = this._spatialHash[key];
                        if (!cellSet) continue;

                        cellSet.forEach(function (entityId) {
                            if (visited.has(entityId)) return;
                            visited.add(entityId);

                            var entity = this._entities[entityId];
                            if (!entity || !entity.isAlive()) return;

                            var pos = entity.getPosition();
                            if (!pos) return;

                            var dx = pos.x - cx;
                            var dy = pos.y - cy;
                            var dz = pos.z - cz;
                            if (dx * dx + dy * dy + dz * dz <= radiusSq) {
                                result.push(entity);
                            }
                        }, this);
                    }
                }
            }

            return result;
        } else {
            var radius = cy || 10;
            var radiusSq = radius * radius;
            var cz2 = cz;
            var minCellX2 = Math.floor((cx - radius) / cellSize);
            var maxCellX2 = Math.floor((cx + radius) / cellSize);
            var minCellZ2 = Math.floor((cz2 - radius) / cellSize);
            var maxCellZ2 = Math.floor((cz2 + radius) / cellSize);

            var result2 = [];
            var visited2 = new Set();

            for (var cellX2 = minCellX2; cellX2 <= maxCellX2; cellX2++) {
                for (var cellZ2 = minCellZ2; cellZ2 <= maxCellZ2; cellZ2++) {
                    var key2 = cellX2 + ',0,' + cellZ2;
                    var cellSet2 = this._spatialHash[key2];
                    if (!cellSet2) continue;

                    cellSet2.forEach(function (entityId) {
                        if (visited2.has(entityId)) return;
                        visited2.add(entityId);

                        var entity2 = this._entities[entityId];
                        if (!entity2 || !entity2.isAlive() || !entity2.getPosition) return;

                        var pos2 = entity2.getPosition();
                        if (!pos2) return;

                        var dx2 = pos2.x - cx;
                        var dz2 = pos2.z - cz2;
                        if (dx2 * dx2 + dz2 * dz2 <= radiusSq) {
                            result2.push(entity2);
                        }
                    }, this);
                }
            }

            return result2;
        }
    };

    /**
     * getAllEntities — Get all alive entities.
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
     * getCount — Get the total number of entities (alive + dead).
     * @returns {number}
     */
    Donkeycraft.EntityManager.prototype.getCount = function () {
        return Object.keys(this._entities).length;
    };

    /**
     * getAliveCount — Get the count of alive entities.
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
     * tick — Tick all alive entities.
     * Updates spatial hash and awareness table based on player position.
     * @param {number} deltaTime - Time since last tick in seconds.
     * @param {number} [playerX=0] - Player X coordinate for awareness tier calculation.
     * @param {number} [playerY=64] - Player Y coordinate for awareness tier calculation.
     * @param {number} [playerZ=0] - Player Z coordinate for awareness tier calculation.
     * @param {Function} [groundCheckFn=null] - Optional ground detection callback.
     */
    Donkeycraft.EntityManager.prototype.tick = function (deltaTime, playerX, playerY, playerZ, groundCheckFn) {
        if (playerX !== undefined && playerY !== undefined && playerZ !== undefined) {
            this._updateAwareness(playerX, playerY, playerZ);
        }

        if (groundCheckFn) {
            this._injectGroundCheck(groundCheckFn);
        }

        var toDespawn = [];

        for (var id in this._entities) {
            if (!this._entities.hasOwnProperty(id)) continue;

            var entity = this._entities[id];
            if (!entity.isAlive()) continue;

            try {
                entity.tick(deltaTime);
                var newPos = entity.getPosition();
                if (newPos) {
                    this._updateSpatialHash(parseInt(id, 10), newPos);
                }
            } catch (e) {
                toDespawn.push(parseInt(id, 10));
            }
        }

        var despawnedSet = new Set(toDespawn);
        for (var id2 in this._entities) {
            if (!this._entities.hasOwnProperty(id2)) continue;
            var entity2 = this._entities[id2];
            var entityId2 = parseInt(id2, 10);
            if (despawnedSet.has(entityId2)) continue;
            if (!entity2.isAlive()) {
                despawnedSet.add(entityId2);
                this.despawn(entityId2);
            }
        }
        for (var i = 0; i < toDespawn.length; i++) {
            var errorId = toDespawn[i];
            if (!despawnedSet.has(errorId)) {
                this.despawn(errorId);
            }
        }
    };

    /**
     * hasEntity — Check if an entity exists by ID.
     * @param {number} id - Entity ID.
     * @returns {boolean} True if an entity with this ID exists.
     */
    Donkeycraft.EntityManager.prototype.hasEntity = function (id) {
        return this._entities[id] !== undefined;
    };

    /**
     * clear — Destroy all entities and reset internal state.
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
     * destroy — Destroy the entity manager and free resources.
     */
    Donkeycraft.EntityManager.prototype.destroy = function () {
        this.clear();
    };

    /**
     * getStats — Get statistics about the entity manager state.
     * @returns {{total: number, alive: number, byType: Object, nearCount: number, farCount: number, distantCount: number}} Stats object.
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