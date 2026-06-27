// Donkeycraft — Enchantment System
// Enchantment registry, compatibility rules, slot restrictions, and application logic.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Enchantment — individual enchantment definition
    // ============================================================

    /**
     * Enchantment — represents a single enchantment type with its properties.
     * @param {number} id - Unique enchantment ID.
     * @param {string} name - Human-readable name (e.g., "Sharpness").
     * @param {number} maxLevel - Maximum enchantment level.
     * @param {number} weight - Rarity weight (higher = more common in enchanting table).
     * @param {Array<string>} slots - Valid equipment slots ('weapon', 'armor', 'both').
     * @param {Array<number>} incompatible - Array of enchantment IDs this cannot coexist with.
     * @param {Array<number>} compatibleWith - Array of enchantment IDs this can coexist with.
     * @param {number} [minLevel=1] - Minimum level to apply.
     */
    Donkeycraft.Enchantment = function(id, name, maxLevel, weight, slots, incompatible, compatibleWith, minLevel) {
        this.id = id;
        this.name = name;
        this.maxLevel = maxLevel || 1;
        this.weight = weight || 10;
        this.slots = slots || ['both'];       // 'weapon', 'armor', 'both'
        this.incompatible = incompatible || []; // IDs that cannot coexist
        this.compatibleWith = compatibleWith || [];  // IDs that explicitly can coexist
        this.minLevel = minLevel || 1;
    };

    // ============================================================
    // EnchantmentRegistry — central registry of all enchantments
    // ============================================================

    /**
     * EnchantmentRegistry — static class managing all enchantment definitions and rules.
     */
    Donkeycraft.EnchantmentRegistry = (function() {
        var _enchantments = {};       // id -> Enchantment
        var _byName = {};             // name -> Enchantment
        var _slotIndex = { weapon: [], armor: [] };  // slot -> [Enchantment]

        /**
         * Register a single enchantment.
         * @param {Donkeycraft.Enchantment} enchantment - The enchantment to register.
         * @returns {Donkeycraft.Enchantment}
         * @private
         */
        function register(enchantment) {
            _enchantments[enchantment.id] = enchantment;
            _byName[enchantment.name.toLowerCase()] = enchantment;

            // Build slot index
            var slots = enchantment.slots;
            for (var s = 0; s < slots.length; s++) {
                if (slots[s] === 'weapon') {
                    _slotIndex.weapon.push(enchantment);
                } else if (slots[s] === 'armor') {
                    _slotIndex.armor.push(enchantment);
                } else if (slots[s] === 'both') {
                    _slotIndex.weapon.push(enchantment);
                    _slotIndex.armor.push(enchantment);
                }
            }

            return enchantment;
        }

        /**
         * registerEnchantments — registers all vanilla Minecraft enchantments.
         * @returns {number} Total number of registered enchantments.
         */
        function registerEnchantments() {
            // Damage enchantments (weapon slot only)
            register(new Donkeycraft.Enchantment(1, 'Sharpness', 5, 10, ['weapon'],
                [2, 3], [], 1));           // incompatible: Smite, BaneOfArthropods
            register(new Donkeycraft.Enchantment(2, 'Smite', 5, 5, ['weapon'],
                [1, 3], [], 1));           // incompatible: Sharpness, BaneOfArthropods
            register(new Donkeycraft.Enchantment(3, 'BaneOfArthropods', 5, 5, ['weapon'],
                [1, 2], [], 1));           // incompatible: Sharpness, Smite

            // Protection enchantments (armor slot only)
            register(new Donkeycraft.Enchantment(4, 'Protection', 4, 10, ['armor'],
                [5, 6, 7], [], 1));        // incompatible: FireProtection, BlastProtection, ProjectileProtection
            register(new Donkeycraft.Enchantment(5, 'FireProtection', 4, 5, ['armor'],
                [4, 6, 7], [], 1));        // incompatible: Protection, BlastProtection, ProjectileProtection
            register(new Donkeycraft.Enchantment(6, 'BlastProtection', 4, 3, ['armor'],
                [4, 5, 7], [], 1));        // incompatible: Protection, FireProtection, ProjectileProtection
            register(new Donkeycraft.Enchantment(7, 'ProjectileProtection', 4, 5, ['armor'],
                [4, 5, 6], [12], 1));      // incompatible: Protection, FireProtection, BlastProtection

            // Utility enchantments (both slots)
            register(new Donkeycraft.Enchantment(8, 'Fortune', 3, 2, ['weapon'],
                [], [], 1));               // compatible with any damage enchant
            register(new Donkeycraft.Enchantment(9, 'SilkTouch', 1, 1, ['weapon'],
                [8], [], 1));             // incompatible: Fortune
            register(new Donkeycraft.Enchantment(10, 'Efficiency', 5, 10, ['weapon'],
                [], [], 1));              // compatible with everything
            register(new Donkeycraft.Enchantment(11, 'Unbreaking', 3, 10, ['weapon', 'armor'],
                [], [], 1));              // compatible with everything
            register(new Donkeycraft.Enchantment(12, 'FireAspect', 2, 5, ['weapon'],
                [], [], 1));              // compatible with everything

            // Bow enchantments (weapon slot)
            register(new Donkeycraft.Enchantment(13, 'Power', 5, 10, ['weapon'],
                [], [], 1));              // compatible with everything
            register(new Donkeycraft.Enchantment(14, 'Punch', 2, 3, ['weapon'],
                [], [], 1));              // compatible with everything
            register(new Donkeycraft.Enchantment(15, 'Infinity', 1, 1, ['weapon'],
                [16], [], 1));           // incompatible: Mending
            register(new Donkeycraft.Enchantment(16, 'Mending', 1, 1, ['weapon', 'armor'],
                [15], [], 1));           // incompatible: Infinity

            // Special enchantments
            register(new Donkeycraft.Enchantment(17, 'Thorns', 3, 2, ['armor'],
                [], [], 1));              // compatible with everything
            register(new Donkeycraft.Enchantment(18, 'FeatherFalling', 4, 5, ['armor'],
                [], [], 1));              // compatible with everything
            register(new Donkeycraft.Enchantment(19, 'LootBonus', 3, 2, ['weapon'],
                [], [], 1));              // compatible with everything (old name: SilkTouch/LootBonus)

            // Fishing rod enchantments
            register(new Donkeycraft.Enchantment(20, 'Lure', 3, 5, ['weapon'],
                [], [], 1));              // compatible with everything
            register(new Donkeycraft.Enchantment(21, 'LuckOfTheSea', 3, 5, ['weapon'],
                [], [], 1));              // compatible with everything

            // Crossbow enchantments
            register(new Donkeycraft.Enchantment(22, 'QuickCharge', 3, 10, ['weapon'],
                [], [], 1));              // compatible with everything

            // Trident enchantments
            register(new Donkeycraft.Enchantment(23, 'Loyalty', 3, 8, ['weapon'],
                [24, 25], [], 1));        // incompatible: Riptide, Channeling
            register(new Donkeycraft.Enchantment(24, 'Riptide', 3, 3, ['weapon'],
                [23, 25], [], 1));        // incompatible: Loyalty, Channeling
            register(new Donkeycraft.Enchantment(25, 'Channeling', 1, 2, ['weapon'],
                [23, 24], [], 1));        // incompatible: Loyalty, Riptide
            register(new Donkeycraft.Enchantment(26, 'Impaling', 5, 5, ['weapon'],
                [], [], 1));              // compatible with everything

            // Curse enchantments
            register(new Donkeycraft.Enchantment(30, 'CurseOfBinding', 1, 1, ['armor'],
                [], [], 1));              // cursed, compatible with everything except other binding
            register(new Donkeycraft.Enchantment(31, 'CurseOfVanishing', 1, 1, ['weapon', 'armor'],
                [], [], 1));              // cursed, compatible with everything

            return Object.keys(_enchantments).length;
        }

        /**
         * getEnchantment — looks up an enchantment by ID.
         * @param {number} id - Enchantment ID.
         * @returns {Donkeycraft.Enchantment|null}
         */
        function getEnchantment(id) {
            return _enchantments[id] || null;
        }

        /**
         * getEnchantmentByName — looks up an enchantment by name (case-insensitive).
         * @param {string} name - Enchantment name.
         * @returns {Donkeycraft.Enchantment|null}
         */
        function getEnchantmentByName(name) {
            return _byName[name.toLowerCase()] || null;
        }

        /**
         * areCompatible — checks if two enchantments can coexist on the same item.
         * @param {number} enchantId1 - First enchantment ID.
         * @param {number} enchantId2 - Second enchantment ID.
         * @returns {boolean}
         */
        function areCompatible(enchantId1, enchantId2) {
            var e1 = _enchantments[enchantId1];
            var e2 = _enchantments[enchantId2];
            if (!e1 || !e2) return false;

            // Check incompatibility list
            for (var i = 0; i < e1.incompatible.length; i++) {
                if (e1.incompatible[i] === enchantId2) return false;
            }
            for (var j = 0; j < e2.incompatible.length; j++) {
                if (e2.incompatible[j] === enchantId1) return false;
            }

            return true;
        }

        /**
         * canApplyToItem — checks if an enchantment can be applied to a specific item type.
         * @param {number} itemBlockId - Block/item ID being enchanted.
         * @param {number} enchantId - Enchantment ID.
         * @returns {boolean}
         */
        function canApplyToItem(itemBlockId, enchantId) {
            var enchant = _enchantments[enchantId];
            if (!enchant) return false;

            // Simple item-type mapping based on block IDs
            // Swords: oak_planks(5), cobblestone(1), iron_ingot-based(221), diamond(227), gold_ingot(226), netherite(187)
            // Pickaxes: same materials
            // Axes: same materials
            // Shovels: same materials
            // Bows: stick(5) + string-based
            // Armor: iron/diamond/gold armor blocks
            // Books: book(225)

            var itemCategory = _getItemCategory(itemBlockId);
            if (!itemCategory) return false;

            var slots = enchant.slots;
            for (var i = 0; i < slots.length; i++) {
                if (slots[i] === 'weapon' && (itemCategory === 'sword' || itemCategory === 'bow' || itemCategory === 'trident' || itemCategory === 'crossbow')) {
                    return true;
                }
                if (slots[i] === 'armor' && (itemCategory === 'helmet' || itemCategory === 'chestplate' || itemCategory === 'leggings' || itemCategory === 'boots')) {
                    return true;
                }
                if (slots[i] === 'both') {
                    return true;
                }
            }

            return false;
        }

        /**
         * _getItemCategory — determines the category of an item based on its block ID.
         * @param {number} itemBlockId - Block/item ID.
         * @returns {string|null}
         * @private
         */
        function _getItemCategory(itemBlockId) {
            // Tools/weapons (tool material items by ID in Donkeycraft)
            if ([257, 258, 259, 260, 261].indexOf(itemBlockId) >= 0) return 'sword';     // wooden/gold/stone/iron/diamond/netherite sword
            if ([250, 251, 252, 253, 254, 255].indexOf(itemBlockId) >= 0) return 'pickaxe'; // tool IDs
            if ([267, 268, 269, 270, 271, 272].indexOf(itemBlockId) >= 0) return 'bow';   // bow IDs
            if ([261, 262, 263, 264, 265, 266].indexOf(itemBlockId) >= 0) return 'fishing_rod';
            if ([273, 274, 275, 276, 277].indexOf(itemBlockId) >= 0) return 'trident';
            if ([278, 279, 280, 281, 282].indexOf(itemBlockId) >= 0) return 'crossbow';

            // Armor
            if ([300, 301, 302, 303].indexOf(itemBlockId) >= 0) return 'helmet';          // leather/helmet iron/diamond/gold
            if ([304, 305, 306, 307].indexOf(itemBlockId) >= 0) return 'chestplate';
            if ([308, 309, 310, 311].indexOf(itemBlockId) >= 0) return 'leggings';
            if ([312, 313, 314, 315].indexOf(itemBlockId) >= 0) return 'boots';

            // Books (for enchanting)
            if (itemBlockId === 225) return 'book';  // book

            return null;
        }

        /**
         * getEnchantmentsForSlot — gets all enchantments valid for a given slot.
         * @param {string} slot - Slot type ('weapon' or 'armor').
         * @returns {Array<Donkeycraft.Enchantment>}
         */
        function getEnchantmentsForSlot(slot) {
            return (_slotIndex[slot] || []).slice();
        }

        /**
         * calculateLevelCost — calculates the XP level cost for applying an enchantment at a given level.
         * @param {number} enchantId - Enchantment ID.
         * @param {number} level - Enchantment level (1-based).
         * @returns {number} XP level cost.
         */
        function calculateLevelCost(enchantId, level) {
            var enchant = _enchantments[enchantId];
            if (!enchant) return 1;

            level = Math.max(1, Math.min(level || 1, enchant.maxLevel));

            // Cost formula: level^2 * weight factor (simplified Minecraft-like)
            var baseCost = level * level;
            var weightFactor = Math.max(1, Math.floor(10 / enchant.weight));
            return baseCost * weightFactor;
        }

        /**
         * getMaxLevel — gets the maximum level for an enchantment.
         * @param {number} enchantId - Enchantment ID.
         * @returns {number}
         */
        function getMaxLevel(enchantId) {
            var enchant = _enchantments[enchantId];
            return enchant ? enchant.maxLevel : 1;
        }

        /**
         * getAllEnchantments — returns all registered enchantments.
         * @returns {Array<Donkeycraft.Enchantment>}
         */
        function getAllEnchantments() {
            var result = [];
            for (var id in _enchantments) {
                if (_enchantments.hasOwnProperty(id)) {
                    result.push(_enchantments[id]);
                }
            }
            return result;
        }

        /**
         * getEnchantmentCount — returns the total number of registered enchantments.
         * @returns {number}
         */
        function getEnchantmentCount() {
            return Object.keys(_enchantments).length;
        }

        // Auto-register all enchantments on initialization
        registerEnchantments();

        return {
            getEnchantment: getEnchantment,
            getEnchantmentByName: getEnchantmentByName,
            areCompatible: areCompatible,
            canApplyToItem: canApplyToItem,
            getEnchantmentsForSlot: getEnchantmentsForSlot,
            calculateLevelCost: calculateLevelCost,
            getMaxLevel: getMaxLevel,
            getAllEnchantments: getAllEnchantments,
            getEnchantmentCount: getEnchantmentCount
        };
    })();

})();