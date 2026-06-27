// Donkeycraft — Mob Spawning System
// Chunk checks, light levels, biome rates, mob caps.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * SpawnType — spawn condition type constants.
     */
    Donkeycraft.SpawnType = {
        MONSTER: 'monster',    // Hostile mobs — spawn in dark
        CREATURE: 'creature',  // Passive mobs — spawn in open areas
        AMBIENT: 'ambient',    // Bats, etc. — spawn in caves
        WATER: 'water'         // Squid, fish — spawn in water
    };

    /**
     * MobSpawnDefinition — spawn configuration for a mob type.
     * @param {object} config - Spawn definition.
     */
    Donkeycraft.MobSpawnDefinition = function(config) {
        config = config || {};

        /**
         * Mob type identifier.
         * @type {string}
         */
        this.type = config.type || 'zombie';

        /**
         * Spawn condition type.
         * @type {string}
         */
        this.spawnType = config.spawnType || Donkeycraft.SpawnType.MONSTER;

        /**
         * Maximum number of this mob type allowed in loaded chunks.
         * @type {number}
         */
        this.maxCount = config.maxCount || 70;

        /**
         * Maximum group size.
         * @type {number}
         */
        this.maxGroupSize = config.maxGroupSize || 4;

        /**
         * Minimum group size.
         * @type {number}
         */
        this.minGroupSize = config.minGroupSize || 1;

        /**
         * Spawn weight (probability relative to other mobs).
         * @type {number}
         */
        this.weight = config.weight || 5;

        /**
         * Minimum Y level for spawning.
         * @type {number}
         */
        this.minY = config.minY || 0;

        /**
         * Maximum Y level for spawning.
         * @type {number}
         */
        this.maxY = config.maxY || 255;

        /**
         * Minimum light level for spawning (0 = dark, 15 = bright).
         * @type {number}
         */
        this.minLightLevel = config.minLightLevel || 0;

        /**
         * Maximum light level for spawning.
         * @type {number}
         */
        this.maxLightLevel = config.maxLightLevel || 7;

        /**
         * Biome filter — empty array means all biomes.
         * @type {string[]}
         */
        this.biomes = config.biomes || [];

        /**
         * Whether this mob requires a solid block below.
         * @type {boolean}
         */
        this.requireSolidBelow = config.requireSolidBelow !== undefined ? config.requireSolidBelow : true;
    };

    /**
     * MobSpawner — manages mob spawning across the world.
     */
    Donkeycraft.MobSpawner = function() {
        /**
         * Spawn definitions registered for this spawner.
         * @type {Donkeycraft.MobSpawnDefinition[]}
         * @private
         */
        this._definitions = [];

        /**
         * Current mob counts by type (per world).
         * @type {Object}
         * @private
         */
        this._currentCounts = {};

        /**
         * Total active entities.
         * @type {number}
         */
        this.totalMobCap = 256;

        /**
         * Monster mob cap.
         * @type {number}
         */
        this.monsterMobCap = 70;

        /**
         * Creature mob cap.
         * @type {number}
         */
        this.creatureMobCap = 15;

        /**
         * Spawn check interval in ticks.
         * @type {number}
         */
        this.spawnCheckInterval = 400; // Check every ~20 seconds at 20 TPS

        /**
         * Ticks since last spawn check.
         * @type {number}
         * @private
         */
        this._ticksSinceCheck = 0;

        /**
         * Whether spawning is enabled.
         * @type {boolean}
         */
        this.enabled = true;
    };

    /**
     * Register a mob spawn definition.
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition to register.
     */
    Donkeycraft.MobSpawner.prototype.registerSpawn = function(definition) {
        if (!definition || !definition.type) {
            return;
        }

        this._definitions.push(definition);
        if (!this._currentCounts[definition.type]) {
            this._currentCounts[definition.type] = 0;
        }
    };

    /**
     * Get all registered spawn definitions.
     * @returns {Donkeycraft.MobSpawnDefinition[]}
     */
    Donkeycraft.MobSpawner.prototype.getDefinitions = function() {
        return this._definitions.slice();
    };

    /**
     * Get the current count for a mob type.
     * @param {string} type - Mob type.
     * @returns {number}
     */
    Donkeycraft.MobSpawner.prototype.getCurrentCount = function(type) {
        return this._currentCounts[type] || 0;
    };

    /**
     * Get the total active mob count.
     * @returns {number}
     */
    Donkeycraft.MobSpawner.prototype.getTotalCount = function() {
        var total = 0;
        for (var type in this._currentCounts) {
            if (this._currentCounts.hasOwnProperty(type)) {
                total += this._currentCounts[type];
            }
        }
        return total;
    };

    /**
     * Check if a spawn definition's mob cap is reached.
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition.
     * @returns {boolean} True if cap is reached.
     */
    Donkeycraft.MobSpawner.prototype.isMobCapReached = function(definition) {
        var type = definition.type;
        var currentCount = this._currentCounts[type] || 0;

        // Check per-type cap
        if (definition.spawnType === Donkeycraft.SpawnType.MONSTER) {
            if (currentCount >= definition.maxCount) {
                return true;
            }
            // Check global monster cap
            if (this.getTotalCount() >= this.monsterMobCap) {
                return true;
            }
        } else if (definition.spawnType === Donkeycraft.SpawnType.CREATURE) {
            if (currentCount >= definition.maxCount) {
                return true;
            }
            if (this.getTotalCount() >= this.creatureMobCap) {
                return true;
            }
        } else {
            // Other types — check per-type cap only
            if (currentCount >= definition.maxCount) {
                return true;
            }
        }

        return false;
    };

    /**
     * Check if a chunk position is valid for spawning.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Function} getChunkInfo - Callback(chunkX, chunkZ) returning {loaded, biome, getHeightAt(x, z)}.
     * @returns {boolean} True if chunk is valid for spawning.
     */
    Donkeycraft.MobSpawner.prototype.isValidSpawnChunk = function(chunkX, chunkZ, getChunkInfo) {
        var chunk = getChunkInfo(chunkX, chunkZ);
        if (!chunk || !chunk.loaded) {
            return false;
        }

        return true;
    };

    /**
     * Find a valid spawn position for a mob in a chunk.
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Function} getBlockLight - Callback(x, y, z) returning light level.
     * @param {Function} getHeightAt - Callback(x, z) returning surface Y height.
     * @param {Function} isBlockSolid - Callback(x, y, z) returning true if block is solid.
     * @returns {object|null} Spawn position {x, y, z} or null if no valid position.
     */
    Donkeycraft.MobSpawner.prototype.findSpawnPosition = function(definition, chunkX, chunkZ, getBlockLight, getHeightAt, isBlockSolid) {
        // Random position within chunk
        var localX = Math.floor(Math.random() * 16);
        var localZ = Math.floor(Math.random() * 16);

        var worldX = chunkX * 16 + localX;
        var worldZ = chunkZ * 16 + localZ;

        // Get surface height
        var surfaceY = getHeightAt(worldX, worldZ);
        if (surfaceY === undefined || surfaceY === null) {
            return null;
        }

        // Try to spawn on the surface (one block above ground)
        var spawnY = surfaceY + 1;

        // Check light level at spawn position
        var lightLevel = getBlockLight(worldX, spawnY, worldZ);
        if (lightLevel < definition.minLightLevel || lightLevel > definition.maxLightLevel) {
            return null;
        }

        // Check Y range
        if (spawnY < definition.minY || spawnY > definition.maxY) {
            return null;
        }

        // Check biome filter
        if (definition.biomes.length > 0) {
            var biome = getBlockLight._currentBiome; // Set by caller
            if (definition.biomes.indexOf(biome) === -1) {
                return null;
            }
        }

        return { x: worldX + 0.5, y: spawnY, z: worldZ + 0.5 };
    };

    /**
     * Spawn a mob at a given position.
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition.
     * @param {number} x - X position.
     * @param {number} y - Y position.
     * @param {number} z - Z position.
     * @param {Function} createMob - Callback(type, x, y, z) returning mob entity.
     * @param {Function} spawnEntity - Callback(entity) to add entity to world.
     */
    Donkeycraft.MobSpawner.prototype.spawnMobAt = function(definition, x, y, z, createMob, spawnEntity) {
        var mob = createMob(definition.type, x, y, z);
        if (!mob) {
            return null;
        }

        spawnEntity(mob);

        // Increment count
        this._currentCounts[definition.type] = (this._currentCounts[definition.type] || 0) + 1;

        return mob;
    };

    /**
     * Run one spawn cycle — check chunks and spawn mobs.
     * @param {number} deltaTime - Time since last tick in seconds.
     * @param {object} worldInfo - World information.
     * @param {Function} worldInfo.getChunksInRange - Callback(chunkX, chunkZ) for loaded chunks.
     * @param {Function} worldInfo.getBlockLight - Callback(x, y, z).
     * @param {Function} worldInfo.getHeightAt - Callback(x, z).
     * @param {Function} worldInfo.isBlockSolid - Callback(x, y, z).
     * @param {Function} worldInfo.createMob - Callback(type, x, y, z).
     * @param {Function} worldInfo.spawnEntity - Callback(entity).
     * @param {Function} worldInfo.getCurrentBiome - Callback(x, z).
     */
    Donkeycraft.MobSpawner.prototype.tick = function(deltaTime, worldInfo) {
        if (!this.enabled) {
            return;
        }

        // Increment tick counter
        this._ticksSinceCheck += deltaTime * Config.GAME_TICKS_PER_SECOND;

        // Only check for new spawns at intervals
        if (this._ticksSinceCheck < this.spawnCheckInterval / Config.GAME_TICKS_PER_SECOND) {
            return;
        }

        this._ticksSinceCheck = 0;

        // Get loaded chunks
        var chunks = worldInfo.getChunksInRange();
        if (!chunks || chunks.length === 0) {
            return;
        }

        // For each spawn definition, try to spawn in random chunks
        for (var d = 0; d < this._definitions.length; d++) {
            var definition = this._definitions[d];

            // Check mob cap
            if (this.isMobCapReached(definition)) {
                continue;
            }

            // Try a few random chunks
            var attempts = 3;
            for (var a = 0; a < attempts; a++) {
                var chunkIdx = Math.floor(Math.random() * chunks.length);
                if (chunkIdx >= chunks.length) {
                    continue;
                }

                var chunk = chunks[chunkIdx];
                var chunkX = chunk.chunkX;
                var chunkZ = chunk.chunkZ;

                // Set current biome for filter check
                if (worldInfo.getCurrentBiome) {
                    var biome = worldInfo.getCurrentBiome(chunkX * 8, chunkZ * 8);
                    if (definition.biomes.length > 0 && definition.biomes.indexOf(biome) === -1) {
                        continue;
                    }
                }

                // Find spawn position
                var pos = this.findSpawnPosition(
                    definition,
                    chunkX,
                    chunkZ,
                    worldInfo.getBlockLight,
                    worldInfo.getHeightAt,
                    worldInfo.isBlockSolid
                );

                if (pos) {
                    // Determine group size
                    var groupSize = definition.minGroupSize +
                        Math.floor(Math.random() * (definition.maxGroupSize - definition.minGroupSize + 1));

                    // Spawn the mob (and extras for group)
                    for (var g = 0; g < groupSize; g++) {
                        this.spawnMobAt(
                            definition,
                            pos.x + (g * 0.5 * (Math.random() - 0.5)),
                            pos.y,
                            pos.z + (g * 0.5 * (Math.random() - 0.5)),
                            worldInfo.createMob,
                            worldInfo.spawnEntity
                        );
                    }

                    break; // One spawn per definition per chunk per cycle
                }
            }
        }
    };

    /**
     * Reset mob counts (called when world is reloaded or spawner is reset).
     */
    Donkeycraft.MobSpawner.prototype.resetCounts = function() {
        this._currentCounts = {};
        for (var i = 0; i < this._definitions.length; i++) {
            this._currentCounts[this._definitions[i].type] = 0;
        }
    };

    /**
     * Destroy the spawner and free resources.
     */
    Donkeycraft.MobSpawner.prototype.destroy = function() {
        this._definitions = [];
        this._currentCounts = {};
    };

    // Register default spawn definitions
    Donkeycraft.MobSpawner.defaultDefinitions = function() {
        var defs = [];

        // Monster spawns (dark areas)
        defs.push(new Donkeycraft.MobSpawnDefinition({
            type: 'zombie',
            spawnType: Donkeycraft.SpawnType.MONSTER,
            maxCount: 70,
            maxGroupSize: 4,
            minGroupSize: 1,
            weight: 5,
            minY: 0,
            maxY: 64,
            minLightLevel: 0,
            maxLightLevel: 7,
            biomes: [],
            requireSolidBelow: true
        }));

        defs.push(new Donkeycraft.MobSpawnDefinition({
            type: 'skeleton',
            spawnType: Donkeycraft.SpawnType.MONSTER,
            maxCount: 70,
            maxGroupSize: 4,
            minGroupSize: 1,
            weight: 5,
            minY: 0,
            maxY: 64,
            minLightLevel: 0,
            maxLightLevel: 7,
            biomes: [],
            requireSolidBelow: true
        }));

        defs.push(new Donkeycraft.MobSpawnDefinition({
            type: 'spider',
            spawnType: Donkeycraft.SpawnType.MONSTER,
            maxCount: 70,
            maxGroupSize: 4,
            minGroupSize: 1,
            weight: 5,
            minY: 0,
            maxY: 64,
            minLightLevel: 0,
            maxLightLevel: 7,
            biomes: [],
            requireSolidBelow: true
        }));

        defs.push(new Donkeycraft.MobSpawnDefinition({
            type: 'creeper',
            spawnType: Donkeycraft.SpawnType.MONSTER,
            maxCount: 70,
            maxGroupSize: 4,
            minGroupSize: 1,
            weight: 5,
            minY: 0,
            maxY: 64,
            minLightLevel: 0,
            maxLightLevel: 7,
            biomes: [],
            requireSolidBelow: true
        }));

        // Creature spawns (daylight, open areas)
        defs.push(new Donkeycraft.MobSpawnDefinition({
            type: 'cow',
            spawnType: Donkeycraft.SpawnType.CREATURE,
            maxCount: 15,
            maxGroupSize: 4,
            minGroupSize: 1,
            weight: 8,
            minY: 64,
            maxY: 255,
            minLightLevel: 7,
            maxLightLevel: 15,
            biomes: ['plains', 'extreme_hills'],
            requireSolidBelow: true
        }));

        defs.push(new Donkeycraft.MobSpawnDefinition({
            type: 'pig',
            spawnType: Donkeycraft.SpawnType.CREATURE,
            maxCount: 15,
            maxGroupSize: 4,
            minGroupSize: 1,
            weight: 8,
            minY: 64,
            maxY: 255,
            minLightLevel: 7,
            maxLightLevel: 15,
            biomes: ['plains'],
            requireSolidBelow: true
        }));

        defs.push(new Donkeycraft.MobSpawnDefinition({
            type: 'sheep',
            spawnType: Donkeycraft.SpawnType.CREATURE,
            maxCount: 15,
            maxGroupSize: 4,
            minGroupSize: 1,
            weight: 8,
            minY: 64,
            maxY: 255,
            minLightLevel: 7,
            maxLightLevel: 15,
            biomes: ['plains'],
            requireSolidBelow: true
        }));

        defs.push(new Donkeycraft.MobSpawnDefinition({
            type: 'chicken',
            spawnType: Donkeycraft.SpawnType.CREATURE,
            maxCount: 15,
            maxGroupSize: 4,
            minGroupSize: 1,
            weight: 10,
            minY: 64,
            maxY: 255,
            minLightLevel: 7,
            maxLightLevel: 15,
            biomes: ['plains'],
            requireSolidBelow: true
        }));

        return defs;
    };

})();