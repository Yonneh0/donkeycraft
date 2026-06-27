// Donkeycraft — Level Data
// Level data: spawn position, game mode, time, seed, player data.
// Includes periodic auto-save to WorldStore for persistent game state.
(function() {
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
     * LevelData — Manages world-level data: spawn, game mode, time, seed, player state.
     * Supports periodic auto-save to WorldStore for persistent game state.
     */
    Donkeycraft.LevelData = function() {
        this._spawnX = Donkeycraft.DEFAULT_SPAWN_X;
        this._spawnY = Donkeycraft.DEFAULT_SPAWN_Y;
        this._spawnZ = Donkeycraft.DEFAULT_SPAWN_Z;
        this._gameMode = 'survival';
        this._worldTime = 0;
        this._seed = 42;
        this._worldName = 'DefaultWorld';
        this._playerData = null;
        this._lastSaved = 0;

        // Auto-save system
        this._autoSaveTimer = 0;
        this._autoSaveInterval = Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL;
        this._worldStore = null;
        this._worldNameRef = null;
        this._autoSaveEnabled = false;
    };

    /**
     * _ensurePlayerData — ensure player data object exists, initializing defaults if needed.
     * @private
     */
    Donkeycraft.LevelData.prototype._ensurePlayerData = function() {
        if (!this._playerData) {
            this._playerData = {
                position: { x: 0, y: 64, z: 0 },
                rotation: { yaw: 0, pitch: 0 },
                health: 20,
                maxHealth: 20,
                gameMode: this._gameMode,
                inventory: [],
                hunger: 20,
                saturation: 0,
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
    Donkeycraft.LevelData.prototype.setSpawn = function(x, y, z) {
        this._spawnX = Math.round(x || 0);
        this._spawnY = Math.round(y || Donkeycraft.DEFAULT_SPAWN_Y);
        this._spawnZ = Math.round(z || 0);
    };

    /**
     * Get the spawn position.
     * @returns {{x: number, y: number, z: number}} Spawn coordinates.
     */
    Donkeycraft.LevelData.prototype.getSpawn = function() {
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
    Donkeycraft.LevelData.prototype.getSpawnX = function() {
        return this._spawnX;
    };

    /**
     * Get the spawn Y coordinate.
     * @returns {number} Spawn Y.
     */
    Donkeycraft.LevelData.prototype.getSpawnY = function() {
        return this._spawnY;
    };

    /**
     * Get the spawn Z coordinate.
     * @returns {number} Spawn Z.
     */
    Donkeycraft.LevelData.prototype.getSpawnZ = function() {
        return this._spawnZ;
    };

    /**
     * Set the game mode.
     * @param {string} mode — Game mode ('survival', 'creative', 'spectator').
     */
    Donkeycraft.LevelData.prototype.setGameMode = function(mode) {
        var validModes = ['survival', 'creative', 'spectator'];
        this._gameMode = (validModes.indexOf(mode) !== -1) ? mode : 'survival';
    };

    /**
     * Get the current game mode.
     * @returns {string} Game mode string.
     */
    Donkeycraft.LevelData.prototype.getGameMode = function() {
        return this._gameMode;
    };

    /**
     * Set the world time (total ticks).
     * @param {number} ticks — Total tick count.
     */
    Donkeycraft.LevelData.prototype.setTime = function(ticks) {
        this._worldTime = ticks < 0 ? 0 : Math.floor(ticks);
    };

    /**
     * Get the current world time (total ticks).
     * @returns {number} Total tick count.
     */
    Donkeycraft.LevelData.prototype.getTime = function() {
        return this._worldTime;
    };

    /**
     * Set the world seed.
     * @param {number} seed — World seed value.
     */
    Donkeycraft.LevelData.prototype.setSeed = function(seed) {
        this._seed = seed || 42;
    };

    /**
     * Get the world seed.
     * @returns {number} World seed value.
     */
    Donkeycraft.LevelData.prototype.getSeed = function() {
        return this._seed;
    };

    /**
     * Set the world name.
     * @param {string} name — World name.
     */
    Donkeycraft.LevelData.prototype.setWorldName = function(name) {
        this._worldName = name || 'DefaultWorld';
    };

    /**
     * Get the world name.
     * @returns {string} World name.
     */
    Donkeycraft.LevelData.prototype.getWorldName = function() {
        return this._worldName;
    };

    /**
     * Set player data (position, health, inventory, etc.).
     * @param {Object} data — Player data object.
     */
    Donkeycraft.LevelData.prototype.setPlayerData = function(data) {
        if (data && typeof data === 'object') {
            this._playerData = {
                position: data.position || { x: 0, y: 64, z: 0 },
                rotation: data.rotation || { yaw: 0, pitch: 0 },
                health: data.health || 20,
                maxHealth: data.maxHealth || 20,
                gameMode: data.gameMode || this._gameMode,
                inventory: data.inventory || [],
                hunger: data.hunger !== undefined ? data.hunger : 20,
                saturation: data.saturation || 0,
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
    Donkeycraft.LevelData.prototype.getPlayerData = function() {
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
            hunger: this._playerData.hunger,
            saturation: this._playerData.saturation,
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
    Donkeycraft.LevelData.prototype.setPlayerPosition = function(x, y, z) {
        this._ensurePlayerData();
        this._playerData.position.x = x;
        this._playerData.position.y = y;
        this._playerData.position.z = z;
    };

    /**
     * Update player rotation.
     * @param {number} yaw — Yaw angle in radians.
     * @param {number} pitch — Pitch angle in radians.
     */
    Donkeycraft.LevelData.prototype.setPlayerRotation = function(yaw, pitch) {
        this._ensurePlayerData();
        this._playerData.rotation.yaw = yaw || 0;
        this._playerData.rotation.pitch = pitch || 0;
    };

    /**
     * Update player health.
     * @param {number} health — Current health (0-20).
     */
    Donkeycraft.LevelData.prototype.setPlayerHealth = function(health) {
        this._ensurePlayerData();
        this._playerData.health = Donkeycraft.clamp(Math.round(health || 0), 0, this._playerData.maxHealth);
        this._playerData.alive = this._playerData.health > 0;
    };

    /**
     * Check if the player is alive.
     * @returns {boolean} True if player is alive.
     */
    Donkeycraft.LevelData.prototype.isPlayerAlive = function() {
        return this._playerData ? this._playerData.alive : true;
    };

    /**
     * Update fall distance (for fall damage calculation).
     * @param {number} distance — Fall distance in blocks.
     */
    Donkeycraft.LevelData.prototype.setFallDistance = function(distance) {
        this._ensurePlayerData();
        this._playerData.fallDistance = Math.max(0, distance || 0);
    };

    /**
     * Get fall distance.
     * @returns {number} Fall distance in blocks.
     */
    Donkeycraft.LevelData.prototype.getFallDistance = function() {
        return this._playerData ? this._playerData.fallDistance : 0;
    };

    /**
     * Update hunger level.
     * @param {number} hunger — Hunger value (0-20).
     */
    Donkeycraft.LevelData.prototype.setHunger = function(hunger) {
        this._ensurePlayerData();
        this._playerData.hunger = Donkeycraft.clamp(Math.round(hunger || 0), 0, 20);
    };

    /**
     * Get hunger level.
     * @returns {number} Hunger value (0-20).
     */
    Donkeycraft.LevelData.prototype.getHunger = function() {
        return this._playerData ? this._playerData.hunger : 20;
    };

    /**
     * Update saturation level.
     * @param {number} saturation — Saturation value (0-hunger).
     */
    Donkeycraft.LevelData.prototype.setSaturation = function(saturation) {
        this._ensurePlayerData();
        this._playerData.saturation = Donkeycraft.clamp(saturation || 0, 0, this._playerData.hunger);
    };

    /**
     * Get saturation level.
     * @returns {number} Saturation value.
     */
    Donkeycraft.LevelData.prototype.getSaturation = function() {
        return this._playerData ? this._playerData.saturation : 0;
    };

    /**
     * Update XP levels.
     * @param {number} levels — XP level count.
     */
    Donkeycraft.LevelData.prototype.setXpLevels = function(levels) {
        this._ensurePlayerData();
        this._playerData.experience.levels = Math.max(0, Math.round(levels || 0));
    };

    /**
     * Update XP points (experience progress toward next level).
     * @param {number} points — XP points (0-7 per level at current level).
     */
    Donkeycraft.LevelData.prototype.setXpPoints = function(points) {
        this._ensurePlayerData();
        this._playerData.experience.points = Math.max(0, Math.round(points || 0));
    };

    /**
     * Get XP levels.
     * @returns {number} XP level count.
     */
    Donkeycraft.LevelData.prototype.getXpLevels = function() {
        return this._playerData ? this._playerData.experience.levels : 0;
    };

    /**
     * Get XP points.
     * @returns {number} XP points.
     */
    Donkeycraft.LevelData.prototype.getXpPoints = function() {
        return this._playerData ? this._playerData.experience.points : 0;
    };

    /**
     * Update player inventory.
     * @param {Array} inventory — Array of item stack objects.
     */
    Donkeycraft.LevelData.prototype.setInventory = function(inventory) {
        this._ensurePlayerData();
        if (Array.isArray(inventory)) {
            this._playerData.inventory = inventory.slice();
        }
    };

    /**
     * Get player inventory.
     * @returns {Array} Array of item stack objects.
     */
    Donkeycraft.LevelData.prototype.getInventory = function() {
        return this._playerData ? (this._playerData.inventory ? this._playerData.inventory.slice() : []) : [];
    };

    /**
     * Serialize level data to a plain object for storage.
     * @returns {{worldName: string, spawn: {x:number, y:number, z:number}, gameMode: string, worldTime: number, seed: number, playerData: Object|null, lastSaved: number}} Serialized state.
     */
    Donkeycraft.LevelData.prototype.serialize = function() {
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
    Donkeycraft.LevelData.prototype.deserialize = function(data) {
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
                health: data.playerData.health || 20,
                maxHealth: data.playerData.maxHealth || 20,
                gameMode: data.playerData.gameMode || this._gameMode,
                inventory: data.playerData.inventory || [],
                hunger: data.playerData.hunger !== undefined ? data.playerData.hunger : 20,
                saturation: data.playerData.saturation || 0,
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
     * Validate that required fields are present and valid.
     * @returns {boolean} True if level data is valid.
     */
    Donkeycraft.LevelData.prototype.isValid = function() {
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
        // Spawn Y must be within world bounds
        var worldHeight = (Donkeycraft.Config && Donkeycraft.Config.WORLD_HEIGHT) ? Donkeycraft.Config.WORLD_HEIGHT : 256;
        if (this._spawnY < 0 || this._spawnY >= worldHeight) {
            return false;
        }
        return true;
    };

    /**
     * Reset level data to defaults.
     */
    Donkeycraft.LevelData.prototype.reset = function() {
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
    Donkeycraft.LevelData.prototype.markSaved = function() {
        this._lastSaved = Date.now();
    };

    /**
     * Get the timestamp of last save.
     * @returns {number} Unix timestamp in ms.
     */
    Donkeycraft.LevelData.prototype.getLastSaved = function() {
        return this._lastSaved;
    };

    // ============================================================
    // Auto-Save System
    // ============================================================

    /**
     * Start periodic auto-save to WorldStore.
     * @param {Donkeycraft.WorldStore} worldStore — WorldStore instance for persistence.
     * @param {string} worldName — World name identifier.
     * @param {number} [intervalMs=60000] — Auto-save interval in milliseconds.
     */
    Donkeycraft.LevelData.prototype.startAutoSave = function(worldStore, worldName, intervalMs) {
        if (!worldStore || !worldName) {
            return;
        }

        this._worldStore = worldStore;
        this._worldNameRef = worldName;
        this._autoSaveInterval = intervalMs || Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL;
        this._autoSaveEnabled = true;
        this._autoSaveTimer = 0;
    };

    /**
     * Stop periodic auto-save.
     */
    Donkeycraft.LevelData.prototype.stopAutoSave = function() {
        this._autoSaveEnabled = false;
        this._autoSaveTimer = 0;
        this._worldStore = null;
        this._worldNameRef = null;
    };

    /**
     * Check if auto-save is enabled.
     * @returns {boolean} True if auto-save is active.
     */
    Donkeycraft.LevelData.prototype.isAutoSaveEnabled = function() {
        return this._autoSaveEnabled;
    };

    /**
     * Tick the auto-save timer (call once per game tick).
     * Triggers a save when the interval elapses.
     * @param {number} dt — Delta time in seconds.
     */
    Donkeycraft.LevelData.prototype.tickAutoSave = function(dt) {
        if (!this._autoSaveEnabled || !this._worldStore || !this._worldNameRef) {
            return;
        }

        this._autoSaveTimer += dt * 1000; // Convert to ms

        if (this._autoSaveTimer >= this._autoSaveInterval) {
            this._autoSaveTimer = 0;
            this.persistToStore().catch(function() {
                // Silently ignore auto-save failures during gameplay
            });
        }
    };

    /**
     * Persist current level data to WorldStore immediately.
     * Saves both level data and triggers dirty chunk save.
     * @returns {Promise<boolean>} True if persistence succeeded.
     */
    Donkeycraft.LevelData.prototype.persistToStore = function() {
        if (!this._worldStore || !this._worldNameRef) {
            return Promise.resolve(false);
        }

        this.markSaved();

        var levelData = this.serialize();
        var self = this;

        return this._worldStore.saveWorld(this._worldNameRef, levelData, []).then(function(success) {
            if (!success) {
                return false;
            }
            // Also save dirty chunks if available
            if (self._worldStore.saveDirtyChunks) {
                return self._worldStore.saveDirtyChunks(self._worldNameRef).then(function(count) {
                    return true;
                }).catch(function() {
                    return true; // Level data saved even if chunks failed
                });
            }
            return true;
        });
    };

    /**
     * Destroy the LevelData instance and free resources.
     */
    Donkeycraft.LevelData.prototype.destroy = function() {
        this.stopAutoSave();
        this._playerData = null;
    };

})();