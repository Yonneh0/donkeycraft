// Donkeycraft — Mob Spawning System
// Chunk-based mob spawning with light level checks, biome filters, mob caps, and group spawning.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * SpawnType — spawn condition type constants used to categorize mob spawning behavior.
     * @readonly
     * @enum {string}
     */
    Donkeycraft.SpawnType = {
        MONSTER: 'monster',    // Hostile mobs (zombies, skeletons, creepers) — spawn in dark areas
        CREATURE: 'creature',  // Passive mobs (cows, pigs, chickens) — spawn in daylight on grass
        AMBIENT: 'ambient',    // Ambient mobs (bats) — spawn in caves with air above
        WATER: 'water'         // Water mobs (squid, fish) — spawn submerged in water bodies
    };

    /**
     * MobSpawnDefinition — defines spawn configuration for a single mob type.
     * Encapsulates all spawning parameters including light levels, Y-range, biome filters,
     * group sizes, weight, and mob cap constraints.
     * @param {Object} [config] - Configuration object for the spawn definition.
     * @param {string} [config.type='zombie'] - Unique mob type identifier (e.g., 'zombie', 'cow').
     * @param {string} [config.spawnType=SpawnType.MONSTER] - Spawn condition type from Donkeycraft.SpawnType.
     * @param {number} [config.maxCount=70] - Maximum number of this mob type allowed in loaded chunks.
     * @param {number} [config.maxGroupSize=4] - Maximum size of a mob group when spawning.
     * @param {number} [config.minGroupSize=1] - Minimum size of a mob group when spawning.
     * @param {number} [config.weight=5] - Spawn weight (probability relative to other mobs).
     * @param {number} [config.minY=0] - Minimum Y level for spawning.
     * @param {number} [config.maxY=255] - Maximum Y level for spawning.
     * @param {number} [config.minLightLevel=0] - Minimum light level (0 = dark, 15 = bright).
     * @param {number} [config.maxLightLevel=7] - Maximum light level for spawning.
     * @param {string[]} [config.biomes=[]] - Biome name filter; empty array means all biomes allowed.
     * @param {boolean} [config.requireSolidBelow=true] - Whether a solid block is required below the spawn position.
     */
    Donkeycraft.MobSpawnDefinition = function (config) {
        config = config || {};

        /**
         * Unique mob type identifier (e.g., 'zombie', 'cow', 'skeleton').
         * Used to track counts and identify the mob in logs.
         * @type {string}
         */
        this.type = config.type || 'zombie';

        /**
         * Spawn condition type from Donkeycraft.SpawnType constants.
         * Determines whether the mob spawns in darkness, daylight, caves, or water.
         * @type {string}
         */
        this.spawnType = config.spawnType || Donkeycraft.SpawnType.MONSTER;

        /**
         * Maximum number of this specific mob type allowed across all loaded chunks.
         * When reached, no more mobs of this type will spawn until counts are reset.
         * @type {number}
         */
        this.maxCount = config.maxCount || 70;

        /**
         * Maximum number of entities in a single spawn group.
         * @type {number}
         */
        this.maxGroupSize = config.maxGroupSize || 4;

        /**
         * Minimum number of entities in a single spawn group.
         * @type {number}
         */
        this.minGroupSize = config.minGroupSize || 1;

        /**
         * Spawn weight determining relative probability compared to other mob types.
         * Higher values increase the chance of this mob being selected during spawning.
         * @type {number}
         */
        this.weight = config.weight || 5;

        /**
         * Minimum Y coordinate for mob spawning.
         * @type {number}
         */
        this.minY = config.minY || 0;

        /**
         * Maximum Y coordinate for mob spawning.
         * @type {number}
         */
        this.maxY = config.maxY || 255;

        /**
         * Minimum light level at spawn position (0 = pitch dark, 15 = full daylight).
         * Only applies to monsters and other light-sensitive mobs.
         * @type {number}
         */
        this.minLightLevel = config.minLightLevel || 0;

        /**
         * Maximum light level at spawn position (0 = pitch dark, 15 = full daylight).
         * Used for passive mobs that require sunlight.
         * @type {number}
         */
        this.maxLightLevel = config.maxLightLevel || 7;

        /**
         * Biome name filter — only spawn in matching biomes.
         * Empty array means the mob can spawn in any biome.
         * @type {string[]}
         */
        this.biomes = config.biomes || [];

        /**
         * Whether a solid, walkable block is required directly below the spawn position.
         * Prevents spawning on ceilings, water, or air for ground-based mobs.
         * @type {boolean}
         */
        this.requireSolidBelow = config.requireSolidBelow !== undefined ? config.requireSolidBelow : true;
    };

    /**
     * MobSpawner — orchestrates mob spawning across all loaded chunks in the world.
     * Handles mob caps, spawn cycle timing, position validation, and group spawning.
     * Integrates with Donkeycraft.MobSpawnDefinition for configurable mob types.
     */
    Donkeycraft.MobSpawner = function () {
        /**
         * Array of registered spawn definitions controlling which mobs can spawn.
         * Populated via registerSpawn() or MobSpawner.defaultDefinitions().
         * @type {Donkeycraft.MobSpawnDefinition[]}
         * @private
         */
        this._definitions = [];

        /**
         * Current spawn counts keyed by mob type string (e.g., 'zombie': 42).
         * Reset via resetCounts() when the world is reloaded.
         * @type {Object.<string, number>}
         * @private
         */
        this._currentCounts = {};

        /**
         * Global maximum number of active entities across all types in loaded chunks.
         * @type {number}
         */
        this.totalMobCap = 256;

        /**
         * Maximum number of hostile monster entities (zombies, skeletons, creepers, spiders).
         * @type {number}
         */
        this.monsterMobCap = 70;

        /**
         * Maximum number of passive creature entities (cows, pigs, sheep, chickens).
         * @type {number}
         */
        this.creatureMobCap = 15;

        /**
         * Number of game ticks between spawn check cycles.
         * Default 400 ticks ≈ 20 seconds at 20 ticks per second.
         * @type {number}
         */
        this.spawnCheckInterval = 400;

        /**
         * Counter tracking elapsed ticks since the last spawn check.
         * Reset to zero each time a spawn cycle completes.
         * @type {number}
         * @private
         */
        this._ticksSinceCheck = 0;

        /**
         * Whether the spawner is active and will attempt to spawn mobs during tick cycles.
         * Set to false to temporarily disable spawning without losing configuration.
         * @type {boolean}
         */
        this.enabled = true;

        /**
         * Distance in blocks from the player at which entities begin despawning.
         * Entities beyond this radius are candidates for automatic despawn.
         * @type {number}
         */
        this.despawnRadius = 128;

        /**
         * Number of ticks an entity can remain out of range before being despawned.
         * Default 600 ticks = 30 seconds at 20 TPS, giving players time to re-enter range.
         * @type {number}
         */
        this.despawnDelay = 600;
    };

    /**
     * Register a mob spawn definition with this spawner.
     * Adds the definition to the internal list and initializes its count to zero.
     * Duplicate registrations are allowed but not recommended — use unregisterSpawn() first if needed.
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition object containing all spawn parameters.
     */
    Donkeycraft.MobSpawner.prototype.registerSpawn = function (definition) {
        // Validate: definition must be an object with a non-empty type string
        if (!definition || typeof definition !== 'object' || !definition.type || typeof definition.type !== 'string') {
            if (Donkeycraft.Logger) {
                Donkeycraft.Logger.warn('MobSpawner', 'registerSpawn called with invalid definition: ' + JSON.stringify(definition));
            }
            return;
        }

        this._definitions.push(definition);
        if (!this._currentCounts[definition.type]) {
            this._currentCounts[definition.type] = 0;
        }
    };

    /**
     * Get a copy of all registered spawn definitions.
     * Returns a shallow copy — modifications to the returned array do not affect the spawner.
     * @returns {Donkeycraft.MobSpawnDefinition[]} Array of spawn definition objects.
     */
    Donkeycraft.MobSpawner.prototype.getDefinitions = function () {
        return this._definitions.slice();
    };

    /**
     * Get the current active count for a specific mob type.
     * @param {string} type - Mob type identifier (e.g., 'zombie', 'cow').
     * @returns {number} Current count of this mob type, or 0 if not registered.
     */
    Donkeycraft.MobSpawner.prototype.getCurrentCount = function (type) {
        return this._currentCounts[type] || 0;
    };

    /**
     * Get the sum of all mob counts across all registered types.
     * @returns {number} Total active mob count across all types.
     */
    Donkeycraft.MobSpawner.prototype.getTotalCount = function () {
        var total = 0;
        var types = Object.keys(this._currentCounts);
        for (var i = 0; i < types.length; i++) {
            total += this._currentCounts[types[i]];
        }
        return total;
    };

    /**
     * Check whether the mob cap is reached for a given spawn definition.
     * Evaluates both per-type limits and global dimension caps (monster/creature).
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition to check against.
     * @returns {boolean} True if spawning should be skipped because a cap is reached.
     */
    Donkeycraft.MobSpawner.prototype.isMobCapReached = function (definition) {
        var type = definition.type;
        var currentCount = this._currentCounts[type] || 0;

        // Check per-type cap first (always applies)
        if (currentCount >= definition.maxCount) {
            return true;
        }

        // Check global dimension cap based on spawn type
        if (definition.spawnType === Donkeycraft.SpawnType.MONSTER) {
            if (this.getTotalCount() >= this.monsterMobCap) {
                return true;
            }
        } else if (definition.spawnType === Donkeycraft.SpawnType.CREATURE) {
            if (this.getTotalCount() >= this.creatureMobCap) {
                return true;
            }
        }
        // AMBIENT and WATER types only check per-type cap

        return false;
    };

    /**
     * Check whether a chunk at the given coordinates is valid for mob spawning.
     * Validates that the chunk exists, is loaded, and has a biome assigned.
     * @param {number} chunkX - Chunk X coordinate in world space.
     * @param {number} chunkZ - Chunk Z coordinate in world space.
     * @param {Function} getChunkInfo - Callback function(chunkX, chunkZ) returning chunk info object with {loaded: boolean, biome: string|number}.
     * @returns {boolean} True if the chunk is loaded and valid for spawning.
     */
    Donkeycraft.MobSpawner.prototype.isValidSpawnChunk = function (chunkX, chunkZ, getChunkInfo) {
        // Validate callback
        if (typeof getChunkInfo !== 'function') {
            return false;
        }

        var info = getChunkInfo(chunkX, chunkZ);
        if (!info || typeof info.loaded !== 'boolean' || !info.loaded) {
            return false;
        }

        return true;
    };

    /**
     * Validate whether a specific world position is suitable for spawning a mob.
     * Checks light level, Y-range bounds, and solid block support below the position.
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition with light/Y requirements.
     * @param {number} x - X coordinate (use fractional values like cx + 0.5 for center-of-block).
     * @param {number} y - Y coordinate (ground level or spawn height).
     * @param {number} z - Z coordinate (use fractional values like cz + 0.5 for center-of-block).
     * @param {Function} getBlockLight - Callback(x, y, z) returning the light level at position (0-15).
     * @param {Function} isBlockSolid - Callback(x, y, z) returning true if the block at position is solid/walkable.
     * @returns {boolean} True if the spawn position passes all validation checks.
     */
    Donkeycraft.MobSpawner.prototype.validateSpawnPosition = function (definition, x, y, z, getBlockLight, isBlockSolid) {
        // Validate callback functions
        if (typeof getBlockLight !== 'function' || typeof isBlockSolid !== 'function') {
            return false;
        }

        // Check light level at spawn position — must be within [min, max] range
        var lightLevel = getBlockLight(x, y, z);
        if (lightLevel === undefined || lightLevel === null ||
            typeof lightLevel !== 'number' ||
            lightLevel < definition.minLightLevel || lightLevel > definition.maxLightLevel) {
            return false;
        }

        // Check Y-range — spawn position must be within allowed vertical bounds
        if (y < definition.minY || y > definition.maxY) {
            return false;
        }

        // Check solid block below if required by the spawn definition
        // Note: use floor(y) - 1 to get the block directly beneath the spawn position
        if (definition.requireSolidBelow) {
            var checkY = Math.floor(y) - 1;
            if (!isBlockSolid(x, checkY, z)) {
                return false;
            }
        }

        return true;
    };

    /**
     * Find a valid spawn position for a mob within a chunk by sampling random locations.
     * Picks one random position per call and validates it against light, Y-range, solid support,
     * and biome filters. Returns the first valid position or null if none found.
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition with all requirements.
     * @param {number} chunkX - Chunk X coordinate in world space.
     * @param {number} chunkZ - Chunk Z coordinate in world space.
     * @param {Function} getBlockLight - Callback(x, y, z) returning light level (0-15).
     * @param {Function} getHeightAt - Callback(worldX, worldZ) returning surface Y height at world coords.
     * @param {Function} isBlockSolid - Callback(x, y, z) returning true if block at position is solid/walkable.
     * @param {string} [biome] - Current biome name string; used for biome filter if provided.
     * @returns {{x: number, y: number, z: number}|null} Spawn position with fractional center coords, or null if no valid spot.
     */
    Donkeycraft.MobSpawner.prototype.findSpawnPosition = function (definition, chunkX, chunkZ, getBlockLight, getHeightAt, isBlockSolid, biome) {
        // Validate required callbacks
        if (typeof getHeightAt !== 'function') {
            return null;
        }

        // Pick one random position within the chunk for efficiency
        var localX = Math.floor(Math.random() * 16);
        var localZ = Math.floor(Math.random() * 16);

        var worldX = chunkX * 16 + localX;
        var worldZ = chunkZ * 16 + localZ;

        // Get surface height at this world position
        var surfaceY = getHeightAt(worldX, worldZ);
        if (surfaceY === undefined || surfaceY === null || typeof surfaceY !== 'number') {
            return null;
        }

        // Spawn on top of the surface block (one block above ground level)
        var spawnY = surfaceY + 1;

        // Validate the full spawn position (light, Y-range, solid support)
        if (!this.validateSpawnPosition(definition, worldX + 0.5, spawnY, worldZ + 0.5, getBlockLight, isBlockSolid)) {
            return null;
        }

        // Check biome filter — only apply if biome data is available and definition has restrictions
        if (definition.biomes && definition.biomes.length > 0 && biome !== null && biome !== undefined) {
            if (definition.biomes.indexOf(biome) === -1) {
                return null;
            }
        }

        // Return center-of-block coordinates for smooth mob placement
        return { x: worldX + 0.5, y: spawnY, z: worldZ + 0.5 };
    };

    /**
     * Spawn a single mob entity at the given world position.
     * Creates the mob via the provided factory callback, registers it with the world,
     * and increments the type-specific count for mob cap tracking.
     * @param {Donkeycraft.MobSpawnDefinition} definition - Spawn definition specifying the mob type.
     * @param {number} x - X coordinate for spawn position.
     * @param {number} y - Y coordinate for spawn position.
     * @param {number} z - Z coordinate for spawn position.
     * @param {Function} createMob - Callback(type, x, y, z) returning a mob entity object, or null on failure.
     * @param {Function} spawnEntity - Callback(entity) to register the entity with the world/scene.
     * @returns {Object|null} The spawned mob entity object, or null if creation failed.
     */
    Donkeycraft.MobSpawner.prototype.spawnMobAt = function (definition, x, y, z, createMob, spawnEntity) {
        // Validate callbacks
        if (typeof createMob !== 'function' || typeof spawnEntity !== 'function') {
            return null;
        }

        var mob = createMob(definition.type, x, y, z);
        if (!mob) {
            return null;
        }

        spawnEntity(mob);

        // Increment the count for this mob type
        this._currentCounts[definition.type] = (this._currentCounts[definition.type] || 0) + 1;

        return mob;
    };

    /**
     * Execute one mob spawning cycle.
     * Checks elapsed time against spawn interval, iterates over loaded chunks and spawn definitions,
     * finds valid positions, and spawns mobs in groups respecting mob caps.
     * @param {number} deltaTime - Time since last tick in seconds (typically 1/20 for 20 TPS).
     * @param {Object} worldInfo - World information object providing required callbacks.
     * @param {Function} worldInfo.getChunksInRange - Returns array of loaded chunk objects with {chunkX, chunkZ} properties.
     * @param {Function} [worldInfo.getBlockLight] - Callback(x, y, z) returning light level (0-15). Optional for testing.
     * @param {Function} worldInfo.getHeightAt - Callback(worldX, worldZ) returning surface Y height at world coordinates.
     * @param {Function} [worldInfo.isBlockSolid] - Callback(x, y, z) returning true if block at position is solid/walkable. Optional.
     * @param {Function} worldInfo.createMob - Callback(type, x, y, z) creating a mob entity object.
     * @param {Function} worldInfo.spawnEntity - Callback(entity) registering the entity with the world.
     * @param {Function} [worldInfo.getCurrentBiome] - Callback(worldX, worldZ) returning biome name string. Optional filter.
     */
    Donkeycraft.MobSpawner.prototype.tick = function (deltaTime, worldInfo) {
        // Skip if spawning is disabled
        if (!this.enabled) {
            return;
        }

        // Guard: worldInfo must provide getChunksInRange
        if (!worldInfo || typeof worldInfo.getChunksInRange !== 'function') {
            return;
        }

        // Guard: deltaTime must be a positive number
        if (typeof deltaTime !== 'number' || deltaTime <= 0) {
            return;
        }

        // Increment tick counter using the configured ticks-per-second rate
        this._ticksSinceCheck += deltaTime * (Config.GAME_TICKS_PER_SECOND || 20);

        // Only check for new spawns at configured intervals (~20 seconds default)
        var intervalSeconds = this.spawnCheckInterval / (Config.GAME_TICKS_PER_SECOND || 20);
        if (this._ticksSinceCheck < intervalSeconds) {
            return;
        }

        this._ticksSinceCheck = 0;

        // Get loaded chunks — must be a non-empty array
        var chunks = worldInfo.getChunksInRange();
        if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
            return;
        }

        // Iterate over each spawn definition and attempt spawns
        for (var d = 0; d < this._definitions.length; d++) {
            var definition = this._definitions[d];

            // Skip if mob cap is already reached for this type
            if (this.isMobCapReached(definition)) {
                continue;
            }

            // Try up to 3 random chunks per definition per cycle
            var attempts = 3;
            for (var a = 0; a < attempts; a++) {
                var chunkIdx = Math.floor(Math.random() * chunks.length);
                if (chunkIdx >= chunks.length) {
                    continue;
                }

                var chunk = chunks[chunkIdx];
                if (!chunk || typeof chunk.chunkX !== 'number' || typeof chunk.chunkZ !== 'number') {
                    continue;
                }

                var chunkX = chunk.chunkX;
                var chunkZ = chunk.chunkZ;

                // Get current biome for filter check (optional callback)
                var currentBiome = null;
                if (worldInfo.getCurrentBiome && typeof worldInfo.getCurrentBiome === 'function') {
                    currentBiome = worldInfo.getCurrentBiome(chunkX * 16 + 7, chunkZ * 16 + 7);
                }

                // Find a valid spawn position in this chunk
                var pos = this.findSpawnPosition(
                    definition,
                    chunkX,
                    chunkZ,
                    worldInfo.getBlockLight || function () { return 8; }, // Default: medium light
                    worldInfo.getHeightAt,
                    worldInfo.isBlockSolid || function () { return true; }, // Default: always solid
                    currentBiome
                );

                if (pos) {
                    // Determine random group size within min-max range
                    var groupSize = definition.minGroupSize +
                        Math.floor(Math.random() * (definition.maxGroupSize - definition.minGroupSize + 1));

                    // Clamp group size to prevent negative or zero values
                    if (groupSize < 1) groupSize = 1;

                    // Spawn each member of the group with slight positional offset
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

                    // Only one spawn per definition per chunk per cycle
                    break;
                }
            }
        }
    };

    /**
     * Reset all mob counts to zero. Called when the world is reloaded or the spawner is reset.
     * Re-initializes counts for all registered definitions to prevent stale data from previous world sessions.
     */
    Donkeycraft.MobSpawner.prototype.resetCounts = function () {
        this._currentCounts = {};
        for (var i = 0; i < this._definitions.length; i++) {
            this._currentCounts[this._definitions[i].type] = 0;
        }
    };

    /**
     * Destroy the spawner and free all internal resources.
     * Clears definitions, resets counts, and disables spawning by setting enabled to false.
     */
    Donkeycraft.MobSpawner.prototype.destroy = function () {
        this._definitions = [];
        this._currentCounts = {};
        this.enabled = false;
    };

    /**
     * Get the default set of spawn definitions for the Overworld dimension.
     * Includes common hostile monsters (zombie, skeleton, spider, creeper) and passive creatures (cow, pig, sheep, chicken).
     * These definitions use Overworld-specific light levels and Y ranges.
     * @returns {Donkeycraft.MobSpawnDefinition[]} Array of spawn definition objects.
     */
    Donkeycraft.MobSpawner.defaultDefinitions = function () {
        var defs = [];

        // ============================================================
        // Hostile Monsters — spawn in dark areas (light 0-7)
        // ============================================================

        /** @type {Donkeycraft.MobSpawnDefinition} */
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
            biomes: [], // All biomes
            requireSolidBelow: true
        }));

        /** @type {Donkeycraft.MobSpawnDefinition} */
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
            biomes: [], // All biomes
            requireSolidBelow: true
        }));

        /** @type {Donkeycraft.MobSpawnDefinition} */
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
            biomes: [], // All biomes
            requireSolidBelow: true
        }));

        /** @type {Donkeycraft.MobSpawnDefinition} */
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
            biomes: [], // All biomes
            requireSolidBelow: true
        }));

        // ============================================================
        // Passive Creatures — spawn in daylight (light 7-15) on grass
        // ============================================================

        /** @type {Donkeycraft.MobSpawnDefinition} */
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
            biomes: ['plains', 'extreme_hills'], // Grassland biomes
            requireSolidBelow: true
        }));

        /** @type {Donkeycraft.MobSpawnDefinition} */
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
            biomes: ['plains'], // Plains only
            requireSolidBelow: true
        }));

        /** @type {Donkeycraft.MobSpawnDefinition} */
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
            biomes: ['plains'], // Plains only
            requireSolidBelow: true
        }));

        /** @type {Donkeycraft.MobSpawnDefinition} */
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
            biomes: ['plains'], // Plains only
            requireSolidBelow: true
        }));

        return defs;
    };

})();