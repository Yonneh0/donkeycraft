// Donkeycraft — Entity Manager
// Manages entity lifecycle: spawn, despawn, tick all entities, by-type queries.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * EntityManager — manages all active entities in the world.
     */
    Donkeycraft.EntityManager = function() {
        /**
         * All active entities indexed by unique ID.
         * @type {Object}
         * @private
         */
        this._entities = {};

        /**
         * Entities indexed by type for fast queries.
         * @type {Object}
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
    };

    /**
     * Spawn a new entity.
     * @param {Donkeycraft.Entity} entity - Entity to spawn.
     * @returns {number|null} Entity ID, or null if spawn failed.
     */
    Donkeycraft.EntityManager.prototype.spawn = function(entity) {
        if (!entity || !entity.isAlive()) {
            return null;
        }

        // Check entity limit
        if (this.getAliveCount() >= this.maxEntities) {
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
     * Despawn an entity by ID.
     * @param {number} id - Entity ID.
     */
    Donkeycraft.EntityManager.prototype.despawn = function(id) {
        var entity = this._entities[id];
        if (!entity) {
            return;
        }

        // Remove from type index
        var typeList = this._byType[entity.type];
        if (typeList) {
            var idx = typeList.indexOf(entity);
            if (idx !== -1) {
                typeList.splice(idx, 1);
            }
        }

        // Remove from all entities
        delete this._entities[id];

        entity.despawn();

        // Emit despawn event via global EventBus
        if (EventBus) {
            try {
                EventBus.emitSafe('entity:despawn', {
                    entity: entity,
                    id: id
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Get an entity by ID.
     * @param {number} id - Entity ID.
     * @returns {Donkeycraft.Entity|null}
     */
    Donkeycraft.EntityManager.prototype.getEntity = function(id) {
        return this._entities[id] || null;
    };

    /**
     * Get all entities of a given type.
     * @param {string} type - Entity type.
     * @param {number} [maxResults=100] - Maximum number of results to return.
     * @returns {Donkeycraft.Entity[]} Array of entities.
     */
    Donkeycraft.EntityManager.prototype.getByType = function(type, maxResults) {
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
     * @param {number} cx - Center X coordinate (or center Z if 2 args).
     * @param {number} [cy] - Center Y coordinate (3D) or radius (2D).
     * @param {number} [cz] - Center Z coordinate (3D only).
     * @param {number} [range] - Maximum distance (blocks) (3D only).
     * @returns {Donkeycraft.Entity[]} Array of entities within range.
     */
    Donkeycraft.EntityManager.prototype.getEntitiesInRange = function(cx, cy, cz, range) {
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
     * @returns {Donkeycraft.Entity[]} Array of entities.
     */
    Donkeycraft.EntityManager.prototype.getAllEntities = function() {
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
    Donkeycraft.EntityManager.prototype.getCount = function() {
        return Object.keys(this._entities).length;
    };

    /**
     * Get the count of alive entities.
     * @returns {number}
     */
    Donkeycraft.EntityManager.prototype.getAliveCount = function() {
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
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.EntityManager.prototype.tick = function(deltaTime) {
        var idsToRemove = [];

        // Single pass: tick alive entities and collect dead ones
        for (var id in this._entities) {
            if (this._entities.hasOwnProperty(id)) {
                var entity = this._entities[id];
                if (entity.isAlive()) {
                    try {
                        entity.tick(deltaTime);
                    } catch (e) {
                        // Entity tick error — mark for removal
                        idsToRemove.push(parseInt(id, 10));
                    }
                }
            }
        }

        // Remove dead/despawned entities collected during tick
        for (var i = 0; i < idsToRemove.length; i++) {
            this.despawn(idsToRemove[i]);
        }

        // Also remove any entities that died or were despawned during tick
        for (var id in this._entities) {
            if (this._entities.hasOwnProperty(id)) {
                if (!this._entities[id].isAlive()) {
                    this.despawn(parseInt(id, 10));
                }
            }
        }
    };

    /**
     * Check if an entity exists by ID.
     * @param {number} id - Entity ID.
     * @returns {boolean}
     */
    Donkeycraft.EntityManager.prototype.hasEntity = function(id) {
        return this._entities[id] !== undefined;
    };

    /**
     * Clear all entities.
     */
    Donkeycraft.EntityManager.prototype.clear = function() {
        for (var id in this._entities) {
            if (this._entities.hasOwnProperty(id)) {
                this._entities[id].destroy();
            }
        }
        this._entities = {};
        this._byType = {};
        this._nextId = 1;
    };

    /**
     * Destroy the entity manager and free resources.
     */
    Donkeycraft.EntityManager.prototype.destroy = function() {
        this.clear();
    };

})();