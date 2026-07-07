// Donkeycraft — Level Data
// Level data: spawn position, game mode, time, seed, player data.
// Includes periodic auto-save to WorldStore for persistent game state.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * Default spawn position.
     */
    Donkeycraft.DEFAULT_SPAWN_X = 0;
    Donkeycraft.DEFAULT_SPAWN_Y = 64;
    Donkeycraft.DEFAULT_SPAWN_Z = 0;

    /**
     * Default auto-save interval in milliseconds (60 seconds).
     */
    Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL = 60000;

    /**
     * LevelData — Manages world-level data: spawn position, game mode, world time, seed, player state.
     * Supports periodic auto-save to WorldStore for persistent game state.
     *
     * Player data is created lazily via `_ensurePlayerData()` when any setter
     * (e.g., `setPlayerPosition`, `setPlayerHealth`) is called without first
     * calling `setPlayerData()`. This means player data will have default values
     * (health=20, inventory=[], hunger=12) if never explicitly set.
     *
     * @constructor
     */
    Donkeycraft.LevelData = function () {
        /** @type {number} Spawn X coordinate. */
        this._spawnX = Donkeycraft.DEFAULT_SPAWN_X;

        /** @type {number} Spawn Y coordinate. */
        this._spawnY = Donkeycraft.DEFAULT_SPAWN_Y;

        /** @type {number} Spawn Z coordinate. */
        this._spawnZ = Donkeycraft.DEFAULT_SPAWN_Z;

        /** @type {string} Game mode ('survival', 'creative', 'spectator'). */
        this._gameMode = 'survival';

        /** @type {number} Total world ticks. */
        this._worldTime = 0;

        /** @type {number} World seed value. */
        this._seed = 42;

        /** @type {string} World name. */
        this._worldName = 'DefaultWorld';

        /** @type {Object|null} Player data object (position, rotation, health, inventory, etc.) or null. */
        this._playerData = null;

        /** @type {number} Unix timestamp in ms of the last successful save. */
        this._lastSaved = 0;

        // --- Auto-save system ---

        /** @type {number} Accumulated auto-save time in milliseconds. */
        this._autoSaveTimer = 0;

        /** @type {number} Auto-save interval in milliseconds. */
        this._autoSaveInterval = Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL;

        /** @type {Donkeycraft.WorldStore|null} WorldStore instance for persistence. */
        this._worldStore = null;

        /** @type {string|null} World name reference for auto-save targeting. */
        this._worldNameRef = null;

        /** @type {boolean} */
        this._autoSaveEnabled = false;
    };

    /**
     * _ensurePlayerData — ensure player data object exists, initializing defaults if needed.
     * Creates a player data object with default values (health=20, food=12, hydration=6, inventory=[], etc.)
     * if `_playerData` is currently null.
     * @private
     */
    Donkeycraft.LevelData.prototype._ensurePlayerData = function () {
        if (!this._playerData) {
            this._playerData = {
                position: { x: 0, y: 64, z: 0 },
                rotation: { yaw: 0, pitch: 0 },
                health: 20,
                maxHealth: 20,
                gameMode: this._gameMode,
                inventory: [],
                foodLevel: 12,
                hydration: 6.0,
                experience: { levels: 0, points: 0 },
                fallDistance: 0,
                alive: true
            };
        }
    };

    /**
     * Set the spawn position.
     * @param {number} x — Spawn X coordinate.
     * @param {number} y — Spawn Y coordinate.
     * @param {number} z — Spawn Z coordinate.
     */
    Donkeycraft.LevelData.prototype.setSpawn = function (x, y, z) {
        this._spawnX = Math.round(x || 0);
        this._spawnY = Math.round(y || Donkeycraft.DEFAULT_SPAWN_Y);
        this._spawnZ = Math.round(z || 0);
    };

    /**
     * Get the spawn position.
     * @returns {{x: number, y: number, z: number}} Spawn coordinates.
     */
    Donkeycraft.LevelData.prototype.getSpawn = function () {
        return {
            x: this._spawnX,
            y: this._spawnY,
            z: this._spawnZ
        };
    };

    /**
     * Get the spawn X coordinate.
     * @returns {number} Spawn X.
     */
    Donkeycraft.LevelData.prototype.getSpawnX = function () {
        return this._spawnX;
    };

    /**
     * Get the spawn Y coordinate.
     * @returns {number} Spawn Y.
     */
    Donkeycraft.LevelData.prototype.getSpawnY = function () {
        return this._spawnY;
    };

    /**
     * Get the spawn Z coordinate.
     * @returns {number} Spawn Z.
     */
    Donkeycraft.LevelData.prototype.getSpawnZ = function () {
        return this._spawnZ;
    };

    /**
     * Set the game mode.
     * @param {string} mode — Game mode ('survival', 'creative', 'spectator').
     */
    Donkeycraft.LevelData.prototype.setGameMode = function (mode) {
        var validModes = ['survival', 'creative', 'spectator'];
        this._gameMode = (validModes.indexOf(mode) !== -1) ? mode : 'survival';
    };

    /**
     * Get the current game mode.
     * @returns {string} Game mode string.
     */
    Donkeycraft.LevelData.prototype.getGameMode = function () {
        return this._gameMode;
    };

    /**
     * Set the world time (total ticks).
     * @param {number} ticks — Total tick count.
     */
    Donkeycraft.LevelData.prototype.setTime = function (ticks) {
        this._worldTime = ticks < 0 ? 0 : Math.floor(ticks);
    };

    /**
     * Get the current world time (total ticks).
     * @returns {number} Total tick count.
     */
    Donkeycraft.LevelData.prototype.getTime = function () {
        return this._worldTime;
    };

    /**
     * Increment the world time by a specific amount.
     * Safely handles negative amounts by treating them as zero.
     * @param {number} amount — Amount to increment by (must be non-negative).
     */
    Donkeycraft.LevelData.prototype.incrementTime = function (amount) {
        this._worldTime += Math.max(0, amount);
    };

    /**
     * Set the world seed.
     * @param {number} seed — World seed value.
     */
    Donkeycraft.LevelData.prototype.setSeed = function (seed) {
        this._seed = seed || 42;
    };

    /**
     * Get the world seed.
     * @returns {number} World seed value.
     */
    Donkeycraft.LevelData.prototype.getSeed = function () {
        return this._seed;
    };

    /**
     * Set the world name.
     * @param {string} name — World name.
     */
    Donkeycraft.LevelData.prototype.setWorldName = function (name) {
        this._worldName = name || 'DefaultWorld';
    };

    /**
     * Get the world name.
     * @returns {string} World name.
     */
    Donkeycraft.LevelData.prototype.getWorldName = function () {
        return this._worldName;
    };

    /**
     * Set player data (position, health, inventory, etc.).
     * @param {Object} data — Player data object.
     */
    Donkeycraft.LevelData.prototype.setPlayerData = function (data) {
        if (data && typeof data === 'object') {
            this._playerData = {
                position: data.position || { x: 0, y: 64, z: 0 },
                rotation: data.rotation || { yaw: 0, pitch: 0 },
                health: data.health !== undefined ? data.health : 20,
                maxHealth: data.maxHealth || 20,
                gameMode: data.gameMode || this._gameMode,
                inventory: data.inventory || [],
                foodLevel: data.foodLevel !== undefined ? data.foodLevel : 12,
                hydration: data.hydration !== undefined ? data.hydration : 6.0,
                experience: data.experience || { levels: 0, points: 0 },
                fallDistance: data.fallDistance || 0,
                alive: data.alive !== undefined ? data.alive : true
            };
        }
    };

    /**
     * Get the current player data.
     * @returns {Object|null} Player data object or null if not set.
     */
    Donkeycraft.LevelData.prototype.getPlayerData = function () {
        if (!this._playerData) {
            return null;
        }
        // Return a copy to prevent external mutation
        return {
            position: { x: this._playerData.position.x, y: this._playerData.position.y, z: this._playerData.position.z },
            rotation: { yaw: this._playerData.rotation.yaw, pitch: this._playerData.rotation.pitch },
            health: this._playerData.health,
            maxHealth: this._playerData.maxHealth,
            gameMode: this._playerData.gameMode,
            inventory: this._playerData.inventory ? this._playerData.inventory.slice() : [],
            foodLevel: this._playerData.foodLevel !== undefined ? this._playerData.foodLevel : 12,
            hydration: this._playerData.hydration !== undefined ? this._playerData.hydration : 6.0,
            experience: { levels: this._playerData.experience.levels, points: this._playerData.experience.points },
            fallDistance: this._playerData.fallDistance,
            alive: this._playerData.alive
        };
    };

    /**
     * Update player position.
     * @param {number} x — X coordinate.
     * @param {number} y — Y coordinate.
     * @param {number} z — Z coordinate.
     */
    Donkeycraft.LevelData.prototype.setPlayerPosition = function (x, y, z) {
        this._ensurePlayerData();
        this._playerData.position.x = x;
        this._playerData.position.y = y;
        this._playerData.position.z = z;
    };

    /**
     * Update player rotation (yaw and pitch).
     * Yaw is unconstrained (full 360°). Pitch is clamped to [-π/2, π/2]
     * to prevent the camera from flipping upside-down.
     * Safely handles missing Donkeycraft.clamp by using Math.max/Math.min fallback.
     * @param {number} yaw — Yaw angle in radians (unconstrained).
     * @param {number} pitch — Pitch angle in radians (clamped to [-π/2, π/2]).
     */
    Donkeycraft.LevelData.prototype.setPlayerRotation = function (yaw, pitch) {
        this._ensurePlayerData();
        // Clamp pitch to [-π/2, π/2] to prevent inverted camera views.
        var maxPitch = Math.PI / 2;
        var clampedPitch = (pitch !== undefined && pitch !== null) ? pitch : 0;
        if (typeof Donkeycraft.clamp === 'function') {
            clampedPitch = Donkeycraft.clamp(clampedPitch, -maxPitch, maxPitch);
        } else {
            clampedPitch = Math.max(-maxPitch, Math.min(maxPitch, clampedPitch));
        }
        this._playerData.rotation.yaw = yaw || 0;
        this._playerData.rotation.pitch = clampedPitch;
    };

    /**
     * Update player health (clamped to [0, maxHealth]).
     * Sets `alive` to false if health drops to 0.
     * Safely handles missing Donkeycraft.clamp by using Math.max/Math.min fallback.
     * @param {number} health — Current health value (0-20).
     */
    Donkeycraft.LevelData.prototype.setPlayerHealth = function (health) {
        this._ensurePlayerData();
        var clampedHealth;
        if (typeof Donkeycraft.clamp === 'function') {
            clampedHealth = Donkeycraft.clamp(Math.round(health || 0), 0, this._playerData.maxHealth);
        } else {
            clampedHealth = Math.max(0, Math.min(Math.round(health || 0), this._playerData.maxHealth));
        }
        this._playerData.health = clampedHealth;
        this._playerData.alive = this._playerData.health > 0;
    };

    /**
     * Check if the player is alive.
     * @returns {boolean} True if player is alive.
     */
    Donkeycraft.LevelData.prototype.isPlayerAlive = function () {
        return this._playerData ? this._playerData.alive : true;
    };

    /**
     * Update fall distance (for fall damage calculation).
     * @param {number} distance — Fall distance in blocks.
     */
    Donkeycraft.LevelData.prototype.setFallDistance = function (distance) {
        this._ensurePlayerData();
        this._playerData.fallDistance = Math.max(0, distance || 0);
    };

    /**
     * Get fall distance.
     * @returns {number} Fall distance in blocks.
     */
    Donkeycraft.LevelData.prototype.getFallDistance = function () {
        return this._playerData ? this._playerData.fallDistance : 0;
    };

    /**
     * Update food level (max 12).
     * Safely handles missing Donkeycraft.clamp by using Math.max/Math.min fallback.
     * @param {number} foodLevel — Food value (0-12).
     */
    Donkeycraft.LevelData.prototype.setHunger = function (foodLevel) {
        this._ensurePlayerData();
        var clampedFood;
        if (typeof Donkeycraft.clamp === 'function') {
            clampedFood = Donkeycraft.clamp(Math.round(foodLevel || 0), 0, 12);
        } else {
            clampedFood = Math.max(0, Math.min(Math.round(foodLevel || 0), 12));
        }
        this._playerData.foodLevel = clampedFood;
    };

    /**
     * Get food level.
     * @returns {number} Food value (0-12).
     */
    Donkeycraft.LevelData.prototype.getHunger = function () {
        return this._playerData ? (this._playerData.foodLevel !== undefined ? this._playerData.foodLevel : 12) : 12;
    };

    /**
     * Update hydration level.
     * Safely handles missing Donkeycraft.clamp by using Math.max/Math.min fallback.
     * @param {number} hydration — Hydration value (0-6).
     */
    Donkeycraft.LevelData.prototype.setHydration = function (hydration) {
        this._ensurePlayerData();
        var clampedHydration;
        if (typeof Donkeycraft.clamp === 'function') {
            clampedHydration = Donkeycraft.clamp(hydration || 0, 0, 6);
        } else {
            clampedHydration = Math.max(0, Math.min(hydration || 0, 6));
        }
        this._playerData.hydration = clampedHydration;
    };

    /**
     * Get hydration level.
     * @returns {number} Hydration value (0-6).
     */
    Donkeycraft.LevelData.prototype.getHydration = function () {
        return this._playerData ? (this._playerData.hydration !== undefined ? this._playerData.hydration : 6.0) : 6.0;
    };

    /**
     * Update XP levels.
     * @param {number} levels — XP level count.
     */
    Donkeycraft.LevelData.prototype.setXpLevels = function (levels) {
        this._ensurePlayerData();
        this._playerData.experience.levels = Math.max(0, Math.round(levels || 0));
    };

    /**
     * Update XP points (experience progress toward next level).
     * @param {number} points — XP points (0-7 per level at current level).
     */
    Donkeycraft.LevelData.prototype.setXpPoints = function (points) {
        this._ensurePlayerData();
        this._playerData.experience.points = Math.max(0, Math.round(points || 0));
    };

    /**
     * Get XP levels.
     * @returns {number} XP level count.
     */
    Donkeycraft.LevelData.prototype.getXpLevels = function () {
        return this._playerData ? this._playerData.experience.levels : 0;
    };

    /**
     * Get XP points.
     * @returns {number} XP points.
     */
    Donkeycraft.LevelData.prototype.getXpPoints = function () {
        return this._playerData ? this._playerData.experience.points : 0;
    };

    /**
     * Update player inventory.
     * @param {Array} inventory — Array of item stack objects.
     */
    Donkeycraft.LevelData.prototype.setInventory = function (inventory) {
        this._ensurePlayerData();
        if (Array.isArray(inventory)) {
            this._playerData.inventory = inventory.slice();
        }
    };

    /**
     * Get player inventory.
     * @returns {Array} Array of item stack objects.
     */
    Donkeycraft.LevelData.prototype.getInventory = function () {
        return this._playerData ? (this._playerData.inventory ? this._playerData.inventory.slice() : []) : [];
    };

    /**
     * Serialize level data to a plain object for storage.
     * @returns {{worldName: string, spawn: {x:number, y:number, z:number}, gameMode: string, worldTime: number, seed: number, playerData: Object|null, lastSaved: number}} Serialized state.
     */
    Donkeycraft.LevelData.prototype.serialize = function () {
        return {
            worldName: this._worldName,
            spawn: { x: this._spawnX, y: this._spawnY, z: this._spawnZ },
            gameMode: this._gameMode,
            worldTime: this._worldTime,
            seed: this._seed,
            playerData: this._playerData,
            lastSaved: this._lastSaved
        };
    };

    /**
     * Deserialize from a plain object loaded from storage.
     * @param {Object} data — Serialized level data.
     * @returns {Donkeycraft.LevelData} This instance for chaining.
     */
    Donkeycraft.LevelData.prototype.deserialize = function (data) {
        if (!data || typeof data !== 'object') {
            return this;
        }

        if (typeof data.worldName === 'string') {
            this._worldName = data.worldName;
        }

        if (data.spawn && typeof data.spawn === 'object') {
            this._spawnX = typeof data.spawn.x === 'number' ? Math.round(data.spawn.x) : Donkeycraft.DEFAULT_SPAWN_X;
            this._spawnY = typeof data.spawn.y === 'number' ? Math.round(data.spawn.y) : Donkeycraft.DEFAULT_SPAWN_Y;
            this._spawnZ = typeof data.spawn.z === 'number' ? Math.round(data.spawn.z) : Donkeycraft.DEFAULT_SPAWN_Z;
        }

        if (typeof data.gameMode === 'string') {
            var validModes = ['survival', 'creative', 'spectator'];
            this._gameMode = (validModes.indexOf(data.gameMode) !== -1) ? data.gameMode : 'survival';
        }

        if (typeof data.worldTime === 'number') {
            this._worldTime = data.worldTime < 0 ? 0 : Math.floor(data.worldTime);
        }

        if (typeof data.seed === 'number') {
            this._seed = data.seed;
        }

        if (data.playerData && typeof data.playerData === 'object') {
            this._playerData = {
                position: data.playerData.position || { x: 0, y: 64, z: 0 },
                rotation: data.playerData.rotation || { yaw: 0, pitch: 0 },
                health: data.playerData.health !== undefined ? data.playerData.health : 20,
                maxHealth: data.playerData.maxHealth || 20,
                gameMode: data.playerData.gameMode || this._gameMode,
                inventory: data.playerData.inventory || [],
                foodLevel: data.playerData.foodLevel !== undefined ? data.playerData.foodLevel : 12,
                hydration: data.playerData.hydration !== undefined ? data.playerData.hydration : 6.0,
                experience: data.playerData.experience || { levels: 0, points: 0 },
                fallDistance: data.playerData.fallDistance || 0,
                alive: data.playerData.alive !== undefined ? data.playerData.alive : true
            };
        } else {
            this._playerData = null;
        }

        if (typeof data.lastSaved === 'number') {
            this._lastSaved = data.lastSaved;
        }

        return this;
    };

    /**
     * Validate that required fields are present and within acceptable ranges.
     * Checks: worldName is non-empty string, gameMode is valid, seed is a number,
     * spawn Y is within world bounds.
     * @returns {boolean} True if all validations pass.
     */
    Donkeycraft.LevelData.prototype.isValid = function () {
        if (typeof this._worldName !== 'string' || this._worldName.length === 0) {
            return false;
        }
        if (typeof this._gameMode !== 'string') {
            return false;
        }
        var validModes = ['survival', 'creative', 'spectator'];
        if (validModes.indexOf(this._gameMode) === -1) {
            return false;
        }
        if (typeof this._seed !== 'number') {
            return false;
        }
        // Spawn Y must be within world bounds.
        // Use strict undefined check: WORLD_HEIGHT could theoretically be 0 (falsy but valid).
        var worldHeight = (Donkeycraft.Config && Donkeycraft.Config.WORLD_HEIGHT !== undefined)
            ? Donkeycraft.Config.WORLD_HEIGHT
            : 256;
        if (this._spawnY < 0 || this._spawnY >= worldHeight) {
            return false;
        }
        return true;
    };

    /**
     * Reset level data to defaults.
     */
    Donkeycraft.LevelData.prototype.reset = function () {
        this._spawnX = Donkeycraft.DEFAULT_SPAWN_X;
        this._spawnY = Donkeycraft.DEFAULT_SPAWN_Y;
        this._spawnZ = Donkeycraft.DEFAULT_SPAWN_Z;
        this._gameMode = 'survival';
        this._worldTime = 0;
        this._seed = 42;
        this._worldName = 'DefaultWorld';
        this._playerData = null;
        this._lastSaved = 0;

        // Reset auto-save
        this._autoSaveTimer = 0;
        this._autoSaveEnabled = false;
        this._worldStore = null;
        this._worldNameRef = null;
    };

    /**
     * Mark the current time as last saved.
     */
    Donkeycraft.LevelData.prototype.markSaved = function () {
        this._lastSaved = Date.now();
    };

    /**
     * Get the timestamp of last save.
     * @returns {number} Unix timestamp in ms.
     */
    Donkeycraft.LevelData.prototype.getLastSaved = function () {
        return this._lastSaved;
    };

    // ============================================================
    // Auto-Save System
    // ============================================================

    /**
     * Start periodic auto-save to WorldStore.
     * @param {Donkeycraft.WorldStore} worldStore — WorldStore instance for persistence.
     * @param {string} worldName — World name identifier.
     * @param {number} [intervalMs] — Auto-save interval in milliseconds. Defaults to Config.LEVEL_DATA_AUTO_SAVE_INTERVAL or Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL.
     */
    Donkeycraft.LevelData.prototype.startAutoSave = function (worldStore, worldName, intervalMs) {
        if (!worldStore || !worldName) {
            return;
        }

        this._worldStore = worldStore;
        this._worldNameRef = worldName;
        // Priority: passed intervalMs > Config.LEVEL_DATA_AUTO_SAVE_INTERVAL > DEFAULT_AUTO_SAVE_INTERVAL
        var defaultInterval = Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL;
        if (Donkeycraft.Config && Donkeycraft.Config.LEVEL_DATA_AUTO_SAVE_INTERVAL) {
            defaultInterval = Donkeycraft.Config.LEVEL_DATA_AUTO_SAVE_INTERVAL;
        }
        this._autoSaveInterval = intervalMs || defaultInterval;
        this._autoSaveEnabled = true;
        this._autoSaveTimer = 0;
    };

    /**
     * Stop periodic auto-save.
     */
    Donkeycraft.LevelData.prototype.stopAutoSave = function () {
        this._autoSaveEnabled = false;
        this._autoSaveTimer = 0;
        this._worldStore = null;
        this._worldNameRef = null;
    };

    /**
     * Check if auto-save is enabled.
     * @returns {boolean} True if auto-save is active.
     */
    Donkeycraft.LevelData.prototype.isAutoSaveEnabled = function () {
        return this._autoSaveEnabled;
    };

    /**
     * Tick the auto-save timer (call once per game tick from Timer.onTick).
     * Accumulates delta time and triggers a save when the interval elapses.
     * @param {number} dt — Delta time in seconds (time since last tick).
     */
    Donkeycraft.LevelData.prototype.tickAutoSave = function (dt) {
        if (!this._autoSaveEnabled || !this._worldStore || !this._worldNameRef) {
            return;
        }

        var self = this;
        this._autoSaveTimer += dt * 1000; // Convert to ms

        if (this._autoSaveTimer >= this._autoSaveInterval) {
            this._autoSaveTimer = 0;
            this.persistToStore().catch(function (e) {
                // Log auto-save failures at warn level for debugging.
                // Failures are non-fatal — they do not interrupt gameplay.
                if (Donkeycraft.Logger) {
                    Donkeycraft.Logger.warn('LevelData', 'Auto-save failed for world "' + self._worldNameRef + '": ' + (e && e.message ? e.message : e));
                }
            });
        }
    };

    /**
     * Persist current level data to WorldStore immediately.
     *
     * Loads existing world data first to preserve chunk data, then merges the
     * updated level data on top. Also triggers dirty chunk save via
     * `WorldStore.saveDirtyChunks()`.
     *
     * If the world doesn't exist yet (`loadWorld` returns null), creates a new
     * entry while preserving any existing chunks from a previous save.
     *
     * @returns {Promise<boolean>} True if persistence succeeded, false otherwise.
     */
    Donkeycraft.LevelData.prototype.persistToStore = function () {
        var self = this;
        if (!this._worldStore || !this._worldNameRef) {
            return Promise.resolve(false);
        }

        this.markSaved();

        // Load existing world data to preserve chunks before overwriting
        return this._worldStore.loadWorld(this._worldNameRef).then(function (worldData) {
            var levelData = self.serialize();
            var existingChunks = [];

            // Preserve existing chunks if world exists
            if (worldData && worldData.chunks) {
                existingChunks = worldData.chunks;
            }
            // If worldData is null (new world), existingChunks stays empty — this is correct.

            // Save merged data: updated level + preserved chunks
            return self._worldStore.saveWorld(self._worldNameRef, levelData, existingChunks).then(function (saveSuccess) {
                if (!saveSuccess) {
                    Donkeycraft.Logger.warn('LevelData', 'Failed to save world data for: ' + self._worldNameRef);
                    return false;
                }
                // Also save dirty chunks if available
                if (self._worldStore.saveDirtyChunks) {
                    return self._worldStore.saveDirtyChunks(self._worldNameRef).then(function () {
                        return true;
                    }).catch(function () {
                        Donkeycraft.Logger.warn('LevelData', 'World data saved but dirty chunks failed for: ' + self._worldNameRef);
                        return true; // Level data saved even if chunks failed
                    });
                }
                return true;
            });
        });
    };

    /**
     * Destroy the LevelData instance: stops auto-save, clears player data reference,
     * and nullifies internal state for garbage collection.
     * After calling this method, the instance should not be reused.
     */
    Donkeycraft.LevelData.prototype.destroy = function () {
        this.stopAutoSave();
        this._playerData = null;
    };

})();