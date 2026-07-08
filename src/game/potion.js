// Donkeycraft — Potion System
// Brewing recipe matching, effect application, duration, and amplifier management.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // PotionEffect — individual potion effect definition
    // ============================================================

    /**
     * PotionEffect — represents a single status effect that can be applied to entities.
     * @param {number} id - Unique effect ID.
     * @param {string} name - Human-readable name (e.g., "Regeneration").
     * @param {number} r - Red component of effect color (0-255).
     * @param {number} g - Green component of effect color (0-255).
     * @param {number} b - Blue component of effect color (0-255).
     * @param {number} [minDuration=600] — Minimum duration in ticks (30 seconds).
     * @param {number} [maxDuration=1800] — Maximum duration in ticks (90 seconds).
     * @param {number} [maxAmplifier=4] — Maximum amplifier level (0-4, where 0 = base).
     */
    Donkeycraft.PotionEffect = function (id, name, r, g, b, minDuration, maxDuration, maxAmplifier) {
        this.id = id;
        this.name = name;
        this.r = r;
        this.g = g;
        this.b = b;
        this.minDuration = minDuration !== undefined ? minDuration : 600;
        this.maxDuration = maxDuration !== undefined ? maxDuration : 1800;
        this.maxAmplifier = maxAmplifier !== undefined ? maxAmplifier : 4;
    };

    // ============================================================
    // Potion — individual potion definition
    // ============================================================

    /**
     * Potion — represents a potion item with its brewing recipe and effects.
     * @param {number} id - Unique potion ID.
     * @param {string} name - Human-readable name (e.g., "Potion of Regeneration").
     * @param {number} ingredientId - Single block/item ID used as brewing ingredient.
     * @param {number} basePotionId - The potion ID that this transforms from (0 = water bottle).
     * @param {Array<Object>} effects - Array of {effectId, amplifier, duration} objects.
     * @param {boolean} [isInstant=false] — Whether this is an instant effect potion.
     * @param {string} [bucketColor=null] — Custom bucket color hex string (or null for default).
     */
    Donkeycraft.Potion = function (id, name, ingredientId, basePotionId, effects, isInstant, bucketColor) {
        this.id = id;
        this.name = name;
        this.ingredientId = ingredientId || 0;
        this.basePotionId = basePotionId || 0;
        this.effects = effects || [];
        this.isInstant = isInstant || false;
        this.bucketColor = bucketColor || null;
    };

    // ============================================================
    // PotionRegistry — central registry of potions and effects
    // ============================================================

    /**
     * PotionRegistry — static class managing all potion definitions, effects, and brewing recipes.
     */
    Donkeycraft.PotionRegistry = (function () {
        var _potions = {};          // id -> Potion
        var _effects = {};          // id -> PotionEffect
        var _byName = {};           // name -> Potion
        var _brewingRecipes = [];   // array of {ingredientId, basePotionId, resultPotionId}

        /**
         * Register a potion effect definition.
         * @param {Donkeycraft.PotionEffect} effect - The effect to register.
         * @returns {Donkeycraft.PotionEffect}
         * @private
         */
        function registerEffect(effect) {
            _effects[effect.id] = effect;
            return effect;
        }

        /**
         * Register a potion definition.
         * @param {Donkeycraft.Potion} potion - The potion to register.
         * @returns {Donkeycraft.Potion}
         * @private
         */
        function registerPotion(potion) {
            _potions[potion.id] = potion;
            _byName[potion.name.toLowerCase()] = potion;

            // Add brewing recipe if applicable
            if (potion.ingredientId > 0 && potion.basePotionId >= 0) {
                _brewingRecipes.push({
                    ingredientId: potion.ingredientId,
                    basePotionId: potion.basePotionId,
                    resultPotionId: potion.id
                });
            }

            return potion;
        }

        /**
         * registerEffects — registers all status effects.
         * @returns {number} Total number of registered effects.
         */
        function registerEffects() {
            registerEffect(new Donkeycraft.PotionEffect(1, 'Regeneration', 255, 70, 70, 600, 900, 4));
            registerEffect(new Donkeycraft.PotionEffect(2, 'Speed', 47, 137, 255, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(3, 'Slowness', 50, 50, 150, 300, 900, 4));
            registerEffect(new Donkeycraft.PotionEffect(4, 'Haste', 200, 200, 50, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(5, 'MiningFatigue', 100, 80, 60, 300, 900, 4));
            registerEffect(new Donkeycraft.PotionEffect(6, 'Strength', 200, 50, 50, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(7, 'InstantHealth', 255, 0, 0, 1, 1, 0));
            registerEffect(new Donkeycraft.PotionEffect(8, 'InstantDamage', 80, 0, 80, 1, 1, 0));
            registerEffect(new Donkeycraft.PotionEffect(9, 'JumpBoost', 100, 255, 100, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(10, 'Nausea', 100, 0, 100, 300, 600, 4));
            registerEffect(new Donkeycraft.PotionEffect(11, 'WorldBorder', 0, 200, 0, 600, 36000, 0));
            registerEffect(new Donkeycraft.PotionEffect(12, 'Luck', 255, 215, 0, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(13, 'Unluck', 50, 20, 0, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(14, 'SlowFalling', 150, 200, 255, 600, 1800, 0));
            registerEffect(new Donkeycraft.PotionEffect(15, 'ConduitPower', 50, 200, 255, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(16, 'DolphinsGrace', 50, 200, 255, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(17, 'BadOmen', 100, 50, 0, 1200, 3600, 4));
            registerEffect(new Donkeycraft.PotionEffect(18, 'HeroOfTheVillage', 255, 255, 255, 1200, 3600, 0));
            // Additional effects needed for potions
            registerEffect(new Donkeycraft.PotionEffect(19, 'Weakness', 50, 50, 50, 300, 900, 4));
            registerEffect(new Donkeycraft.PotionEffect(20, 'Stamina', 248, 192, 60, 600, 1800, 4));
            registerEffect(new Donkeycraft.PotionEffect(21, 'Hydration', 248, 160, 60, 300, 600, 0));
            return Object.keys(_effects).length;
        }

        /**
         * registerPotions — registers all vanilla potions.
         * @returns {number} Total number of registered potions.
         */
        function registerPotions() {
            // Base potions — ingredientId is the brewing ingredient, basePotionId is what it transforms from
            // Water Bottle: no ingredient needed, base = 0 (nothing)
            registerPotion(new Donkeycraft.Potion(1, 'Water Bottle', 0, 0,
                [], false, null));

            // Awkward Potion: Nether Wart (241) + Water Bottle (1)
            registerPotion(new Donkeycraft.Potion(2, 'Awkward Potion', 241, 1,
                [], false, null));

            // Mundane Potion: Spider eye (239) + Water Bottle (1) — base ineffective potion
            registerPotion(new Donkeycraft.Potion(3, 'Mundane Potion', 239, 1,
                [], false, '7F5C18'));

            // Thick Potion: Fermented Spider Eye (240) + Water Bottle (1) — base ineffective potion
            registerPotion(new Donkeycraft.Potion(4, 'Thick Potion', 240, 1,
                [], false, 'C76A1E'));

            // Regeneration: Ghast Tear (237) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(10, 'Potion of Regeneration', 237, 2,
                [{ effectId: 1, amplifier: 0, duration: 900 }], false, 'C73850'));

            // Regeneration II: Magma Cream (236) + Regeneration (10)
            registerPotion(new Donkeycraft.Potion(11, 'Potion of Regeneration II', 236, 10,
                [{ effectId: 1, amplifier: 1, duration: 450 }], false, 'A82E3E'));

            // Swiftness: Rabbit Foot (242) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(12, 'Potion of Swiftness', 242, 2,
                [{ effectId: 2, amplifier: 0, duration: 900 }], false, '2F89FF'));

            // Swiftness II: Magma Cream (236) + Swiftness (12)
            registerPotion(new Donkeycraft.Potion(13, 'Potion of Swiftness II', 236, 12,
                [{ effectId: 2, amplifier: 1, duration: 450 }], false, '1A6FE0'));

            // Slowness: Spider Eye (239) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(14, 'Potion of Slowness', 239, 2,
                [{ effectId: 3, amplifier: 0, duration: 450 }], false, '323296'));

            // Slowness II: Magma Cream (236) + Slowness (14)
            registerPotion(new Donkeycraft.Potion(15, 'Potion of Slowness II', 236, 14,
                [{ effectId: 3, amplifier: 1, duration: 225 }], false, '1E1E6B'));

            // Haste: Rabbit Foot (242) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(16, 'Potion of Haste', 242, 2,
                [{ effectId: 4, amplifier: 0, duration: 900 }], false, 'C8C832'));

            // Haste II: Magma Cream (236) + Haste (16)
            registerPotion(new Donkeycraft.Potion(17, 'Potion of Haste II', 236, 16,
                [{ effectId: 4, amplifier: 1, duration: 450 }], false, '9E9E28'));

            // Mining Fatigue: Spider Eye (239) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(18, 'Potion of Mining Fatigue', 239, 2,
                [{ effectId: 5, amplifier: 0, duration: 450 }], false, '64503C'));

            // Strength: Blaze Powder (243) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(19, 'Potion of Strength', 243, 2,
                [{ effectId: 6, amplifier: 0, duration: 900 }], false, 'C83232'));

            // Strength II: Magma Cream (236) + Strength (19)
            registerPotion(new Donkeycraft.Potion(20, 'Potion of Strength II', 236, 19,
                [{ effectId: 6, amplifier: 1, duration: 450 }], false, 'A02828'));

            // Instant Health: Ghast Tear (237) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(21, 'Potion of Instant Health', 237, 2,
                [{ effectId: 7, amplifier: 0, duration: 1 }], true, 'F8421A'));

            // Instant Health II: Magma Cream (236) + Instant Health (21)
            registerPotion(new Donkeycraft.Potion(22, 'Potion of Instant Health II', 236, 21,
                [{ effectId: 7, amplifier: 1, duration: 1 }], true, 'FF6B4D'));

            // Instant Damage: Spider Eye (239) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(23, 'Potion of Instant Damage', 239, 2,
                [{ effectId: 8, amplifier: 0, duration: 1 }], true, '4A0848'));

            // Instant Damage II: Magma Cream (236) + Instant Damage (23)
            registerPotion(new Donkeycraft.Potion(24, 'Potion of Instant Damage II', 236, 23,
                [{ effectId: 8, amplifier: 1, duration: 1 }], true, '6B0C69'));

            // Jump Boost: Rabbit Foot (242) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(25, 'Potion of Jump Boost', 242, 2,
                [{ effectId: 9, amplifier: 0, duration: 900 }], false, '64FF64'));

            // Nausea: Spider Eye (239) + Awkward (2) — fermented
            registerPotion(new Donkeycraft.Potion(26, 'Potion of Nausea', 240, 2,
                [{ effectId: 10, amplifier: 0, duration: 300 }], false, '660066'));

            // Fire Resistance: Blaze Powder (243) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(27, 'Potion of Fire Resistance', 243, 2,
                [{ effectId: 12, amplifier: 0, duration: 900 }], false, 'E86B2F'));

            // Fire Resistance II: Magma Cream (236) + Fire Resistance (27)
            registerPotion(new Donkeycraft.Potion(28, 'Potion of Fire Resistance II', 236, 27,
                [{ effectId: 12, amplifier: 0, duration: 450 }], false, 'C45A28'));

            // Night Vision: Golden Carrot (245) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(29, 'Potion of Night Vision', 245, 2,
                [{ effectId: 15, amplifier: 0, duration: 900 }], false, 'C8B842'));

            // Night Vision II: Magma Cream (236) + Night Vision (29)
            registerPotion(new Donkeycraft.Potion(30, 'Potion of Night Vision II', 236, 29,
                [{ effectId: 15, amplifier: 0, duration: 450 }], false, 'A09030'));

            // Weakness: Fermented Spider Eye (240) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(31, 'Potion of Weakness', 240, 2,
                [{ effectId: 19, amplifier: 0, duration: 240 }], false, '5C5C5C'));

            // Poison: Spider Eye (239) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(32, 'Potion of Poison', 239, 2,
                [{ effectId: 1, amplifier: 0, duration: 450 }], false, '388838'));

            // Poison II: Magma Cream (236) + Poison (32)
            registerPotion(new Donkeycraft.Potion(33, 'Potion of Poison II', 236, 32,
                [{ effectId: 1, amplifier: 1, duration: 225 }], false, '2A682A'));

            // Water Breathing: Pufferfish (246) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(34, 'Potion of Water Breathing', 246, 2,
                [{ effectId: 11, amplifier: 0, duration: 600 }], false, '3858A8'));

            // Water Breathing II: Magma Cream (236) + Water Breathing (34)
            registerPotion(new Donkeycraft.Potion(35, 'Potion of Water Breathing II', 236, 34,
                [{ effectId: 11, amplifier: 0, duration: 300 }], false, '284078'));

            // Healing: Ghast Tear (237) + Awkward (2) — instant
            registerPotion(new Donkeycraft.Potion(36, 'Potion of Healing', 237, 2,
                [{ effectId: 7, amplifier: 0, duration: 1 }], true, 'F8421A'));

            // Healing II: Magma Cream (236) + Healing (36)
            registerPotion(new Donkeycraft.Potion(37, 'Potion of Healing II', 236, 36,
                [{ effectId: 7, amplifier: 1, duration: 1 }], true, 'FF6B4D'));

            // Stamina: Gold Ingot (247) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(38, 'Potion of Stamina', 247, 2,
                [{ effectId: 20, amplifier: 0, duration: 900 }], false, 'F8C848'));

            // Stamina II: Magma Cream (236) + Stamina (38)
            registerPotion(new Donkeycraft.Potion(39, 'Potion of Stamina II', 236, 38,
                [{ effectId: 20, amplifier: 1, duration: 450 }], false, 'D0A030'));

            // Hydration: Golden Carrot (245) + Awkward (2)
            registerPotion(new Donkeycraft.Potion(40, 'Potion of Hydration', 245, 2,
                [{ effectId: 21, amplifier: 0, duration: 300 }], false, 'F8A848'));

            return Object.keys(_potions).length;
        }

        /**
         * getPotion — looks up a potion by ID.
         * @param {number} id - Potion ID.
         * @returns {Donkeycraft.Potion|null}
         */
        function getPotion(id) {
            return _potions[id] || null;
        }

        /**
         * getPotionByName — looks up a potion by name (case-insensitive).
         * @param {string} name - Potion name.
         * @returns {Donkeycraft.Potion|null}
         */
        function getPotionByName(name) {
            return _byName[name.toLowerCase()] || null;
        }

        /**
         * getEffect — looks up a potion effect by ID.
         * @param {number} id - Effect ID.
         * @returns {Donkeycraft.PotionEffect|null}
         */
        function getEffect(id) {
            return _effects[id] || null;
        }

        /**
         * matchBrewingRecipe — attempts to match a single ingredient to a brewing recipe.
         * @param {number} ingredientId - The block/item ID used as brewing ingredient.
         * @param {number} basePotionId - The current potion being brewed from.
         * @returns {Donkeycraft.Potion|null} The resulting potion, or null if no match.
         */
        function matchBrewingRecipe(ingredientId, basePotionId) {
            for (var i = 0; i < _brewingRecipes.length; i++) {
                var recipe = _brewingRecipes[i];

                // Check both ingredient and base potion match
                if (recipe.ingredientId === ingredientId && recipe.basePotionId === basePotionId) {
                    return getPotion(recipe.resultPotionId);
                }
            }

            return null;
        }

        /**
         * getEffects — gets the effects array for a potion.
         * @param {number} potionId - Potion ID.
         * @returns {Array<Object>} Array of {effectId, amplifier, duration} objects.
         */
        function getEffects(potionId) {
            var potion = _potions[potionId];
            if (!potion) return [];
            return potion.effects.slice();
        }

        /**
         * getAllPotions — returns all registered potions.
         * @returns {Array<Donkeycraft.Potion>}
         */
        function getAllPotions() {
            var result = [];
            for (var id in _potions) {
                if (_potions.hasOwnProperty(id)) {
                    result.push(_potions[id]);
                }
            }
            return result;
        }

        /**
         * getPotionCount — returns the total number of registered potions.
         * @returns {number}
         */
        function getPotionCount() {
            return Object.keys(_potions).length;
        }

        /**
         * getEffectCount — returns the total number of registered effects.
         * @returns {number}
         */
        function getEffectCount() {
            return Object.keys(_effects).length;
        }

        /**
         * getBrewingRecipes — returns all registered brewing recipes.
         * @returns {Array<Object>}
         */
        function getBrewingRecipes() {
            return _brewingRecipes.slice();
        }

        /**
         * isInstant — checks if a potion is an instant-effect potion.
         * @param {number} potionId - Potion ID.
         * @returns {boolean} True if the potion is instant-effect.
         */
        function isInstant(potionId) {
            var potion = _potions[potionId];
            return potion ? potion.isInstant : false;
        }

        /**
         * getPotionBucketColor — gets the custom bucket color for a potion.
         * @param {number} potionId - Potion ID.
         * @returns {string|null} Hex color string or null for default.
         */
        function getPotionBucketColor(potionId) {
            var potion = _potions[potionId];
            return potion ? potion.bucketColor : null;
        }

        // Auto-register all effects and potions on initialization
        registerEffects();
        registerPotions();

        return {
            getPotion: getPotion,
            getPotionByName: getPotionByName,
            getEffect: getEffect,
            matchBrewingRecipe: matchBrewingRecipe,
            getEffects: getEffects,
            getAllPotions: getAllPotions,
            getPotionCount: getPotionCount,
            getEffectCount: getEffectCount,
            getBrewingRecipes: getBrewingRecipes,
            isInstant: isInstant,
            getPotionBucketColor: getPotionBucketColor
        };
    })();

    // ============================================================
    // ActivePotion — runtime active potion effect on an entity
    // ============================================================

    /**
     * ActivePotion — represents a currently active potion effect applied to an entity.
     * @param {number} effectId - The effect ID.
     * @param {number} amplifier - Amplifier level (0-based).
     * @param {number} duration - Remaining duration in ticks.
     * @param {number} maxDuration - Original/max duration in ticks.
     */
    Donkeycraft.ActivePotion = function (effectId, amplifier, duration, maxDuration) {
        this.effectId = effectId;
        this.amplifier = amplifier;
        this.remainingTicks = duration;
        this.maxTicks = maxDuration;
    };

    // ============================================================
    // ActivePotionManager — manages active potion effects per entity
    // ============================================================

    /**
     * ActivePotionManager — static class managing active potion effects on entities.
     */
    Donkeycraft.ActivePotionManager = (function () {
        var _entityEffects = {};  // entityId -> [ActivePotion]
        var _nextEntityId = 1;

        /**
         * _getEntityKey — gets or creates a unique key for an entity.
         * @param {*} entity - The entity object.
         * @returns {number}
         * @private
         */
        function _getEntityKey(entity) {
            if (!entity) return -1;
            if (entity._dkPotionId === undefined) {
                entity._dkPotionId = _nextEntityId++;
                _entityEffects[entity._dkPotionId] = [];
            }
            return entity._dkPotionId;
        }

        /**
         * addPotion — adds a potion effect to an entity.
         * @param {*} entity - The entity to apply the effect to.
         * @param {number} potionId - Potion ID to apply.
         * @param {number} [duration=600] — Duration in ticks (default 30 seconds).
         * @param {number} [amplifier=0] — Amplifier level (0-based).
         * @returns {Array<Donkeycraft.ActivePotion>} The active potions added.
         */
        function addPotion(entity, potionId, duration, amplifier) {
            if (!entity || potionId === undefined) return [];

            duration = Math.max(1, duration || 600);
            amplifier = Math.max(0, Math.min(4, amplifier || 0));

            var effects = Donkeycraft.PotionRegistry.getEffects(potionId);
            if (!effects || effects.length === 0) return [];

            var key = _getEntityKey(entity);
            var added = [];

            for (var i = 0; i < effects.length; i++) {
                var eff = effects[i];
                // Use caller-provided duration/amplifier when explicitly passed,
                // otherwise fall back to the effect's built-in defaults.
                var usedDuration = duration !== undefined ? duration : (eff.duration || 600);
                var usedAmplifier = amplifier !== undefined ? amplifier : (eff.amplifier || 0);
                var activePotion = new Donkeycraft.ActivePotion(
                    eff.effectId,
                    Math.min(usedAmplifier, 4),
                    usedDuration,
                    usedDuration
                );

                // Upgrade existing effect or add new one
                var existing = null;
                for (var j = 0; j < _entityEffects[key].length; j++) {
                    if (_entityEffects[key][j].effectId === activePotion.effectId) {
                        existing = _entityEffects[key][j];
                        break;
                    }
                }

                if (existing) {
                    // Upgrade: use higher amplifier and longer duration
                    existing.amplifier = Math.max(existing.amplifier, activePotion.amplifier);
                    existing.remainingTicks = Math.max(existing.remainingTicks, activePotion.remainingTicks);
                    added.push(existing);
                } else {
                    _entityEffects[key].push(activePotion);
                    added.push(activePotion);
                }
            }

            return added;
        }

        /**
         * removePotion — removes a specific effect from an entity.
         * @param {*} entity - The entity to remove the effect from.
         * @param {number} effectId - Effect ID to remove.
         * @returns {boolean} True if the effect was found and removed.
         */
        function removePotion(entity, effectId) {
            if (!entity || effectId === undefined) return false;

            var key = entity._dkPotionId;
            if (key === undefined || !_entityEffects[key]) return false;

            for (var i = 0; i < _entityEffects[key].length; i++) {
                if (_entityEffects[key][i].effectId === effectId) {
                    _entityEffects[key].splice(i, 1);
                    return true;
                }
            }

            return false;
        }

        /**
         * tick — updates all active potion timers for an entity.
         * Removes expired effects and emits events for removed/added effects.
         * @param {*} entity - The entity to tick.
         * @param {number} deltaTime — Delta time in seconds.
         * @returns {Array<Donkeycraft.ActivePotion>} Remaining active potions.
         */
        function tick(entity, deltaTime) {
            if (!entity) return [];

            var key = entity._dkPotionId;
            if (key === undefined || !_entityEffects[key]) return [];

            var tickRate = 1 / 20; // 20 TPS
            var ticksPassed = Math.floor(deltaTime / tickRate);

            if (ticksPassed <= 0) {
                return _entityEffects[key].slice();
            }

            var remaining = [];
            for (var i = 0; i < _entityEffects[key].length; i++) {
                var ap = _entityEffects[key][i];
                ap.remainingTicks -= ticksPassed;

                if (ap.remainingTicks > 0) {
                    remaining.push(ap);
                }
                // Expired effects are silently removed
            }

            _entityEffects[key] = remaining;
            return remaining.slice();
        }

        /**
         * getActiveEffects — gets all active potion effects on an entity.
         * @param {*} entity - The entity to query.
         * @returns {Array<Donkeycraft.ActivePotion>}
         */
        function getActiveEffects(entity) {
            if (!entity) return [];

            var key = entity._dkPotionId;
            if (key === undefined || !_entityEffects[key]) return [];

            return _entityEffects[key].slice();
        }

        /**
         * hasActiveEffect — checks if an entity has a specific effect active.
         * @param {*} entity - The entity to query.
         * @param {number} effectId - Effect ID to check for.
         * @returns {boolean}
         */
        function hasActiveEffect(entity, effectId) {
            var effects = getActiveEffects(entity);
            for (var i = 0; i < effects.length; i++) {
                if (effects[i].effectId === effectId) return true;
            }
            return false;
        }

        /**
         * clearAll — removes all potion effects from an entity.
         * @param {*} entity - The entity to clear.
         */
        function clearAll(entity) {
            if (!entity) return;
            var key = entity._dkPotionId;
            if (key !== undefined && _entityEffects[key]) {
                _entityEffects[key] = [];
            }
        }

        /**
         * destroy — clears all active potion data.
         */
        function destroy() {
            _entityEffects = {};
            _nextEntityId = 1;
        }

        return {
            addPotion: addPotion,
            removePotion: removePotion,
            tick: tick,
            getActiveEffects: getActiveEffects,
            hasActiveEffect: hasActiveEffect,
            clearAll: clearAll,
            destroy: destroy
        };
    })();

})();