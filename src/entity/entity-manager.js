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
     * @param {string} [type] - Entity type (overrides entity.type).
     * @returns {number} Entity ID.
     */
    Donkeycraft.EntityManager.prototype.spawn = function(entity, type) {
        if (!entity || !entity.isAlive()) {
            return null;
        }

        var id = this._nextId++;
        entity._id = id;
        type = type || entity.type;

        // Register by ID
        this._entities[id] = entity;

        // Register by type
        if (!this._byType[type]) {
            this._byType[type] = [];
        }
        this._byType[type].push(entity);

        // Emit spawn event
        if (EventBus) {
            try {
                EventBus.emit('entity:spawn', {
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

        // Emit despawn event
        if (EventBus) {
            try {
                EventBus.emit('entity:despawn', {
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
     * @returns {Donkeycraft.Entity[]} Array of entities.
     */
    Donkeycraft.EntityManager.prototype.getByType = function(type) {
        return this._byType[type] ? this._byType[type].slice() : [];
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
                } else if (!entity.isAlive() && entity._despawned) {
                    // Already despawned — schedule removal
                    idsToRemove.push(parseInt(id, 10));
                }
            }
        }

        // Remove dead/despawned entities
        for (var i = 0; i < idsToRemove.length; i++) {
            this.despawn(idsToRemove[i]);
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