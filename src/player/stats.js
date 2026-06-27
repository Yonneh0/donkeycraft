// Donkeycraft — Player Statistics
// Track player statistics: blocks mined/placed, mobs killed, distance walked, time played.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    /**
     * PlayerStats — tracks player statistics and achievements.
     * @param {Donkeycraft.Player} player - Player entity instance.
     */
    Donkeycraft.PlayerStats = function(player) {
        this._player = player;

        /**
         * Statistics map: statName -> value.
         * @type {Object}
         * @private
         */
        this._stats = {
            // Movement stats
            'tickPlayed': 0,
            'timePlayed': 0,           // Total time in seconds
            'distanceWalked': 0,       // Meters walked
            'distanceCrouched': 0,     // Meters crouched
            'distanceSprinted': 0,     // Meters sprinted
            'distanceSwum': 0,         // Meters swum
            'distanceFallen': 0,       // Total fall distance
            'distanceClimb': 0,        // Meters climbed
            'distanceWentUnderWater': 0, // Meters underwater

            // Block stats
            'blockMine': 0,            // Blocks mined
            'blockPlaced': 0,          // Blocks placed
            'blockInteractedWith': 0,  // Blocks right-clicked
            'blockBroken': 0,          // Blocks broken (same as mine)
            'distanceDropOut': 0,      // Distance from falling out of chunks

            // Combat stats
            'damageDealt': 0,          // Total damage dealt
            'damageTaken': 0,          // Total damage taken
            'mobsKilled': 0,           // Entities killed
            'playersKilled': 0,        // Players killed (PvP)
            'entityKilledBy': {},      // Entity type -> death count

            // Item stats
            'itemUsed': 0,             // Items used
            'itemDropped': 0,          // Items dropped
            'itemPickedUp': 0,         // Items picked up
            'craftingTableUsed': 0,    // Crafting tables used
            'chestOpened': 0,          // Chests opened
            'tradedWithVillager': 0,   // Villager trades

            // Other stats
            'jumpCount': 0,            // Total jumps
            'noteBlockPlayed': 0,      // Note blocks played
            'noteBlockTuned': 0,       // Note blocks tuned
            'recordPlayed': 0,         // Music records played
            'endGatewayOpened': 0,     // End gateways used
            'cauldronUsed': 0,         // Cauldrons used
            'flowerPotted': 0,         // Flowers potted
            'armorCleaned': 0,         // Armor cleaned in cauldron
            'bannerBaseColor': 0,      // Banners base colored
            'bannerAddedPattern': 0,   // Banner patterns added
            'shulkerBoxOpened': 0,     // Shulker boxes opened
            'barterPlatinaUsed': 0,    // Gold used for piglins

            // Survival stats
            'timeSinceDeath': 0,       // Seconds since last death
            'deaths': 0,               // Total deaths
            'achievementOpened': 0,    // Achievement screen opened
            'leaveGame': 0             // Leave game count
        };

        /**
         * Time tracking for time-based stats.
         * @type {number}
         * @private
         */
        this._timeAccumulator = 0;
    };

    /**
     * Increment a statistic by the given amount.
     * @param {string} statName - Name of the statistic.
     * @param {number} [amount=1] - Amount to increment by.
     */
    Donkeycraft.PlayerStats.prototype.increment = function(statName, amount) {
        amount = amount || 1;

        if (this._stats.hasOwnProperty(statName)) {
            this._stats[statName] += amount;
        } else {
            // Create new stat entry if it doesn't exist
            this._stats[statName] = (this._stats[statName] || 0) + amount;
        }

        // Emit stat changed event
        if (EventBus) {
            try {
                EventBus.emit('stat:changed', {
                    name: statName,
                    value: this._stats[statName]
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }
    };

    /**
     * Get the current value of a statistic.
     * @param {string} statName - Name of the statistic.
     * @returns {number} Current value.
     */
    Donkeycraft.PlayerStats.prototype.getStat = function(statName) {
        return this._stats[statName] || 0;
    };

    /**
     * Set a statistic to a specific value.
     * @param {string} statName - Name of the statistic.
     * @param {number} value - Value to set.
     */
    Donkeycraft.PlayerStats.prototype.setStat = function(statName, value) {
        if (this._stats.hasOwnProperty(statName)) {
            this._stats[statName] = Math.max(0, value);
        } else {
            this._stats[statName] = Math.max(0, value);
        }
    };

    /**
     * Get all statistics as a plain object.
     * @returns {Object} All stats.
     */
    Donkeycraft.PlayerStats.prototype.getAllStats = function() {
        var result = {};
        for (var key in this._stats) {
            if (this._stats.hasOwnProperty(key)) {
                result[key] = this._stats[key];
            }
        }
        return result;
    };

    /**
     * Get a subset of statistics by prefix.
     * @param {string} prefix - Prefix to filter stats.
     * @returns {Object} Matching stats.
     */
    Donkeycraft.PlayerStats.prototype.getStatsByPrefix = function(prefix) {
        var result = {};
        for (var key in this._stats) {
            if (this._stats.hasOwnProperty(key) && key.indexOf(prefix) === 0) {
                result[key] = this._stats[key];
            }
        }
        return result;
    };

    /**
     * Tick the stats system — update time-based stats.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.PlayerStats.prototype.tick = function(deltaTime) {
        // Accumulate time (tick at 20 TPS, so deltaTime ~0.05)
        this._timeAccumulator += deltaTime;

        // Update time played every second
        if (this._timeAccumulator >= 1.0) {
            var seconds = Math.floor(this._timeAccumulator);
            this._stats.tickPlayed += seconds * 20; // 20 ticks per second
            this._stats.timePlayed += seconds;
            this._timeAccumulator -= seconds;
        }
    };

    /**
     * Record distance traveled for movement stats.
     * @param {number} distance - Distance in blocks.
     * @param {string} [type='walked'] - Movement type: 'walked', 'sprinted', 'crouched', 'swum', 'fallen'.
     */
    Donkeycraft.PlayerStats.prototype.recordDistance = function(distance, type) {
        if (distance <= 0) {
            return;
        }

        var statMap = {
            'walked': 'distanceWalked',
            'sprinted': 'distanceSprinted',
            'crouched': 'distanceCrouched',
            'swum': 'distanceSwum',
            'fallen': 'distanceFallen',
            'climb': 'distanceClimb',
            'underwater': 'distanceWentUnderWater'
        };

        var statName = statMap[type] || 'distanceWalked';
        this.increment(statName, distance);
    };

    /**
     * Record a block being mined.
     * @param {string} [blockId=0] - Block ID that was mined.
     */
    Donkeycraft.PlayerStats.prototype.recordBlockMine = function(blockId) {
        this.increment('blockMine');
        this.increment('blockBroken');
    };

    /**
     * Record a block being placed.
     * @param {string} [blockId=0] - Block ID that was placed.
     */
    Donkeycraft.PlayerStats.prototype.recordBlockPlace = function(blockId) {
        this.increment('blockPlaced');
    };

    /**
     * Record a block interaction (right-click).
     * @param {string} [blockId=0] - Block ID that was interacted with.
     */
    Donkeycraft.PlayerStats.prototype.recordBlockInteract = function(blockId) {
        this.increment('blockInteractedWith');
    };

    /**
     * Record damage dealt to an entity.
     * @param {number} amount - Damage dealt.
     */
    Donkeycraft.PlayerStats.prototype.recordDamageDealt = function(amount) {
        this.increment('damageDealt', amount);
    };

    /**
     * Record damage taken from a source.
     * @param {number} amount - Damage taken.
     * @param {string} [source='generic'] - Damage source.
     */
    Donkeycraft.PlayerStats.prototype.recordDamageTaken = function(amount, source) {
        this.increment('damageTaken', amount);

        // Track entity kills by type
        if (source && source !== 'generic' && source !== 'fall' && source !== 'starvation') {
            if (!this._stats.entityKilledBy[source]) {
                this._stats.entityKilledBy[source] = 0;
            }
            this._stats.entityKilledBy[source]++;
        }
    };

    /**
     * Record an entity kill.
     * @param {string} entityType - Type of entity killed.
     */
    Donkeycraft.PlayerStats.prototype.recordEntityKill = function(entityType) {
        this.increment('mobsKilled');

        if (!this._stats.entityKilledBy[entityType]) {
            this._stats.entityKilledBy[entityType] = 0;
        }
        this._stats.entityKilledBy[entityType]++;
    };

    /**
     * Record a player death.
     * @param {string} [cause='generic'] - Cause of death.
     */
    Donkeycraft.PlayerStats.prototype.recordDeath = function(cause) {
        this.increment('deaths');
        this._stats.timeSinceDeath = 0;

        // Record entity killed by
        if (!this._stats.entityKilledBy[cause]) {
            this._stats.entityKilledBy[cause] = 0;
        }
        this._stats.entityKilledBy[cause]++;
    };

    /**
     * Serialize stats for save/load.
     * @returns {Object} Serialized state.
     */
    Donkeycraft.PlayerStats.prototype.serialize = function() {
        return {
            stats: this.getAllStats(),
            entityKilledBy: this._stats.entityKilledBy || {}
        };
    };

    /**
     * Deserialize stats from saved data.
     * @param {Object} data - Serialized state.
     */
    Donkeycraft.PlayerStats.prototype.fromObject = function(data) {
        if (data.stats) {
            for (var key in data.stats) {
                if (data.stats.hasOwnProperty(key)) {
                    this._stats[key] = Math.max(0, data.stats[key]);
                }
            }
        }
        if (data.entityKilledBy) {
            this._stats.entityKilledBy = data.entityKilledBy;
        }
    };

    /**
     * Reset all statistics to zero.
     */
    Donkeycraft.PlayerStats.prototype.reset = function() {
        for (var key in this._stats) {
            if (this._stats.hasOwnProperty(key)) {
                if (typeof this._stats[key] === 'object') {
                    this._stats[key] = {};
                } else {
                    this._stats[key] = 0;
                }
            }
        }
        this._timeAccumulator = 0;
    };

    /**
     * Get the time since last death in seconds.
     * @returns {number} Seconds since death.
     */
    Donkeycraft.PlayerStats.prototype.getTimeSinceDeath = function() {
        return this._stats.timeSinceDeath;
    };

    /**
     * Destroy the stats system and free resources.
     */
    Donkeycraft.PlayerStats.prototype.destroy = function() {
        this._player = null;
    };

})();