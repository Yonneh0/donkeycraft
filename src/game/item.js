// Donkeycraft — Item Definition
// Core item definition, constructors, accessors, and ItemType enum.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  // ============================================================
  // ItemType Enum
  // ============================================================

  /**
   * ItemType — classification for all items in the game.
   * @namespace
   */
  Donkeycraft.ItemType = {
    NONE: 0,
    BLOCK: 1,
    TOOL: 2,
    WEAPON: 3,
    ARMOR: 4,
    FOOD: 5,
    POTION: 6,
    MATERIAL: 7,
    ENTITY_ITEM: 8
  };

  // ============================================================
  // Item — core item definition with common properties
  // ============================================================

  /**
   * Item — represents a single item type definition (not a stack).
   * @param {number} id - Unique item ID.
   * @param {string} name - Human-readable name.
   * @param {number} [type=ItemType.BLOCK] - Item type classification.
   * @param {number} [materialTier=0] - Tool material tier (0=None through 6=Netherite).
   * @param {number} [maxDurability=0] - Maximum durability uses (0 = none).
   * @param {number} [maxStackCount=64] - Maximum stack size.
   * @param {number} [damage=0] - Attack damage for weapons.
   * @param {number} [defense=0] - Armor points for armor.
   * @param {number} [armorToughness=0] - Armor toughness rating.
   * @param {number} [armorKnockbackResist=0] - Knockback resistance (0-1).
   * @param {number} [foodRestore=0] - Food points restored (0-20, half-drumsticks).
   * @param {number} [saturation=0] - Saturation level.
   * @param {number} [hardness=1.0] - Block hardness for mining speed.
   * @param {string} [toolType=''] - Tool category ('pickaxe', 'shovel', 'axe', 'hoe').
   * @param {number} [blockId=0] - Associated block ID for placeable items.
   * @param {Array} [brewingEffects=null] - Array of potion effect definitions.
   * @param {number} [enchantability=0] - Enchantability bonus.
   * @param {number} [rarity=0] - Item rarity (0=common, 1=uncommon, 2=rare, 3=epic).
   * @param {string} [repairItemBlockId=0] - Block/item ID used for repairing.
   */
  Donkeycraft.Item = function (
    id,
    name,
    type,
    materialTier,
    maxDurability,
    maxStackCount,
    damage,
    defense,
    armorToughness,
    armorKnockbackResist,
    foodRestore,
    saturation,
    hardness,
    toolType,
    blockId,
    brewingEffects,
    enchantability,
    rarity,
    repairItemBlockId
  ) {
    this.id = id;
    this.name = name;
    this.type = type !== undefined ? type : Donkeycraft.ItemType.BLOCK;
    this.materialTier = materialTier !== undefined ? materialTier : 0;
    this.maxDurability = maxDurability !== undefined ? maxDurability : 0;
    this.maxStackCount =
      maxStackCount !== undefined ? maxStackCount : 64;
    this.damage = damage !== undefined ? damage : 0;
    this.defense = defense !== undefined ? defense : 0;
    this.armorToughness = armorToughness !== undefined ? armorToughness : 0;
    this.armorKnockbackResist =
      armorKnockbackResist !== undefined ? armorKnockbackResist : 0;
    this.foodRestore = foodRestore !== undefined ? foodRestore : 0;
    this.saturation = saturation !== undefined ? saturation : 0;
    this.hardness = hardness !== undefined ? hardness : 1.0;
    this.toolType = toolType !== undefined ? toolType : '';
    this.blockId = blockId !== undefined ? blockId : 0;
    this.brewingEffects = brewingEffects !== undefined ? brewingEffects : null;
    this.enchantability =
      enchantability !== undefined ? enchantability : 0;
    this.rarity = rarity !== undefined ? rarity : 0;
    this.repairItemBlockId =
      repairItemBlockId !== undefined ? repairItemBlockId : 0;
  };

  // ============================================================
  // Item — stack instance properties (set per-stack, not per-definition)
  // ============================================================

  /**
   * getMaxDurability — gets the maximum durability for this item type.
   * @returns {number}
   */
  Donkeycraft.Item.prototype.getMaxDurability = function () {
    return this.maxDurability;
  };

  /**
   * isDurable — checks if this item has durability.
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isDurable = function () {
    return this.maxDurability > 0;
  };

  /**
   * getDamage — gets the attack damage for weapons.
   * @returns {number}
   */
  Donkeycraft.Item.prototype.getDamage = function () {
    return this.damage;
  };

  /**
   * getDefense — gets the armor points for armor items.
   * @returns {number}
   */
  Donkeycraft.Item.prototype.getDefense = function () {
    return this.defense;
  };

  /**
   * isTool — checks if this item is a tool.
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isTool = function () {
    return this.type === Donkeycraft.ItemType.TOOL;
  };

  /**
   * isWeapon — checks if this item is a weapon.
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isWeapon = function () {
    return this.type === Donkeycraft.ItemType.WEAPON;
  };

  /**
   * isArmor — checks if this item is armor.
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isArmor = function () {
    return this.type === Donkeycraft.ItemType.ARMOR;
  };

  /**
   * isFood — checks if this item is food.
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isFood = function () {
    return this.type === Donkeycraft.ItemType.FOOD;
  };

  /**
   * isPotion — checks if this item is a potion.
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isPotion = function () {
    return this.type === Donkeycraft.ItemType.POTION;
  };

  /**
   * isBlock — checks if this item is a placeable block.
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isBlock = function () {
    return this.type === Donkeycraft.ItemType.BLOCK;
  };

  /**
   * isMaterial — checks if this item is a crafting material.
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isMaterial = function () {
    return this.type === Donkeycraft.ItemType.MATERIAL;
  };

  /**
   * isEntityItem — checks if this item represents a dropped entity (e.g., raw meat, ore).
   * @returns {boolean}
   */
  Donkeycraft.Item.prototype.isEntityItem = function () {
    return this.type === Donkeycraft.ItemType.ENTITY_ITEM;
  };

  /**
   * getToolType — gets the tool category for tools.
   * @returns {string} Tool type ('pickaxe', 'shovel', 'axe', 'hoe') or empty string.
   */
  Donkeycraft.Item.prototype.getToolType = function () {
    return this.toolType;
  };

  /**
   * getBlockId — gets the associated block ID for placeable items.
   * @returns {number} Block ID (0 if not placeable).
   */
  Donkeycraft.Item.prototype.getBlockId = function () {
    return this.blockId;
  };

  /**
   * getFoodRestore — gets the food points restored when eaten.
   * @returns {number} Food restore value (0-20, where 20 = 10 drumsticks).
   */
  Donkeycraft.Item.prototype.getFoodRestore = function () {
    return this.foodRestore;
  };

  /**
   * getSaturation — gets the saturation level for food items.
   * @returns {number} Saturation value.
   */
  Donkeycraft.Item.prototype.getSaturation = function () {
    return this.saturation;
  };

  /**
   * getMaterialTier — gets the material tier for tools/armor.
   * @returns {number} Material tier (0=None through 6=Netherite).
   */
  Donkeycraft.Item.prototype.getMaterialTier = function () {
    return this.materialTier;
  };

  /**
   * getEnchantability — gets the enchantability bonus.
   * @returns {number}
   */
  Donkeycraft.Item.prototype.getEnchantability = function () {
    return this.enchantability;
  };

  /**
   * getRarity — gets the item rarity level.
   * @returns {number} Rarity (0=common, 1=uncommon, 2=rare, 3=epic).
   */
  Donkeycraft.Item.prototype.getRarity = function () {
    return this.rarity;
  };

  /**
   * getRepairItemBlockId — gets the repair item block ID.
   * @returns {number} Block/item ID used for repairs (0 = none).
   */
  Donkeycraft.Item.prototype.getRepairItemBlockId = function () {
    return this.repairItemBlockId;
  };

  /**
   * getBrewingEffects — gets the potion effects array.
   * @returns {Array|null} Array of effect objects or null.
   */
  Donkeycraft.Item.prototype.getBrewingEffects = function () {
    return this.brewingEffects;
  };

  /**
   * serialize — serializes this item definition to a plain object.
   * @returns {Object} Serialized item data.
   */
  Donkeycraft.Item.prototype.serialize = function () {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      materialTier: this.materialTier,
      maxDurability: this.maxDurability,
      maxStackCount: this.maxStackCount,
      damage: this.damage,
      defense: this.defense,
      armorToughness: this.armorToughness,
      armorKnockbackResist: this.armorKnockbackResist,
      foodRestore: this.foodRestore,
      saturation: this.saturation,
      hardness: this.hardness,
      toolType: this.toolType,
      blockId: this.blockId,
      brewingEffects: this.brewingEffects,
      enchantability: this.enchantability,
      rarity: this.rarity,
      repairItemBlockId: this.repairItemBlockId
    };
  };

  /**
   * toString — returns a debug string representation.
   * @returns {string}
   */
  Donkeycraft.Item.prototype.toString = function () {
    return (
      'Item[id=' +
      this.id +
      ', name=' +
      this.name +
      ', type=' +
      this.type +
      ', tier=' +
      this.materialTier +
      ']'
    );
  };

  // ============================================================
  // ItemDefinitionRegistry — central registry of item definitions
  // ============================================================

  /**
   * ItemDefinitionRegistry — static class managing all item type definitions.
   * @namespace
   */
  Donkeycraft.ItemDefinitionRegistry = (function () {
    var _items = {}; // id -> Item
    var _byName = {}; // name -> Item

    /**
     * register — registers an item definition.
     * @param {Donkeycraft.Item} item - The item to register.
     * @returns {Donkeycraft.Item}
     * @private
     */
    function register(item) {
      _items[item.id] = item;
      _byName[item.name.toLowerCase()] = item;
      return item;
    }

    /**
     * get — looks up an item definition by ID.
     * @param {number} id - Item ID.
     * @returns {Donkeycraft.Item|null}
     */
    function get(id) {
      return _items[id] || null;
    }

    /**
     * getByName — looks up an item definition by name (case-insensitive).
     * @param {string} name - Item name.
     * @returns {Donkeycraft.Item|null}
     */
    function getByName(name) {
      return _byName[name.toLowerCase()] || null;
    }

    /**
     * getAll — returns all registered item definitions.
     * @returns {Array<Donkeycraft.Item>}
     */
    function getAll() {
      var result = [];
      for (var id in _items) {
        if (_items.hasOwnProperty(id)) {
          result.push(_items[id]);
        }
      }
      return result;
    }

    /**
     * getCount — returns the total number of registered items.
     * @returns {number}
     */
    function getCount() {
      return Object.keys(_items).length;
    }

    /**
     * generateFromBlocks — auto-generates item definitions from BlockRegistry.
     * Creates item entries for all blocks that have drops.
     * @returns {number} Number of items generated.
     */
    function generateFromBlocks() {
      if (!Donkeycraft.BlockRegistry) return 0;

      var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
      var count = 0;

      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        // Skip air and blocks without drops
        if (b.dropBlockId === -1 || b.dropBlockId === 0) continue;

        // Check if item already registered (to avoid duplicates)
        if (_items[b.id]) continue;

        // Determine item type based on block properties
        var itemType = Donkeycraft.ItemType.BLOCK;
        var toolType = '';
        var materialTier = 0;

        // Check if this block is a tool/weapon/armor (by naming convention or ID range)
        if (b.name.indexOf('pickaxe') >= 0 || b.name.indexOf('shovel') >= 0 || b.name.indexOf('axe') >= 0 || b.name.indexOf('hoe') >= 0) {
          itemType = Donkeycraft.ItemType.TOOL;
          toolType = Donkeycraft.ToolRegistry.getToolTypeFromBlockId(b.id);
          // Determine material tier from name
          if (b.name.indexOf('wooden') >= 0 || b.name.indexOf('Wood') >= 0) materialTier = 1;
          else if (b.name.indexOf('stone') >= 0) materialTier = 2;
          else if (b.name.indexOf('iron') >= 0) materialTier = 3;
          else if (b.name.indexOf('diamond') >= 0) materialTier = 4;
          else if (b.name.indexOf('gold') >= 0) materialTier = 5;
          else if (b.name.indexOf('netherite') >= 0) materialTier = 6;
        } else if (b.name.indexOf('sword') >= 0) {
          itemType = Donkeycraft.ItemType.WEAPON;
          if (b.name.indexOf('wooden') >= 0 || b.name.indexOf('Wood') >= 0) materialTier = 1;
          else if (b.name.indexOf('stone') >= 0) materialTier = 2;
          else if (b.name.indexOf('iron') >= 0) materialTier = 3;
          else if (b.name.indexOf('diamond') >= 0) materialTier = 4;
          else if (b.name.indexOf('gold') >= 0) materialTier = 5;
          else if (b.name.indexOf('netherite') >= 0) materialTier = 6;
        } else if (b.name.indexOf('helmet') >= 0 || b.name.indexOf('chestplate') >= 0 || b.name.indexOf('leggings') >= 0 || b.name.indexOf('boots') >= 0) {
          itemType = Donkeycraft.ItemType.ARMOR;
          if (b.name.indexOf('leather') >= 0) materialTier = 1;
          else if (b.name.indexOf('iron') >= 0) materialTier = 3;
          else if (b.name.indexOf('diamond') >= 0) materialTier = 4;
          else if (b.name.indexOf('gold') >= 0) materialTier = 5;
          else if (b.name.indexOf('netherite') >= 0) materialTier = 6;
        }

        // Determine stack count based on type
        var maxStack = 64;
        if (itemType === Donkeycraft.ItemType.TOOL || itemType === Donkeycraft.ItemType.WEAPON || itemType === Donkeycraft.ItemType.ARMOR) {
          maxStack = 1;
        }

        // Get durability from tool material if applicable
        var durability = 0;
        if (itemType === Donkeycraft.ItemType.TOOL || itemType === Donkeycraft.ItemType.WEAPON) {
          durability = Donkeycraft.ToolRegistry.getDurability(materialTier);
        }

        // Get hardness for mining speed calculations
        var hardness = b.hardness;

        register(new Donkeycraft.Item(
          b.id,
          b.name,
          itemType,
          materialTier,
          durability,
          maxStack,
          0, // damage (set below for weapons)
          0, // defense (set below for armor)
          0, // armorToughness
          0, // armorKnockbackResist
          0, // foodRestore
          0, // saturation
          hardness,
          toolType,
          b.id, // blockId
          null, // brewingEffects
          Donkeycraft.ToolRegistry.getEnchantability(materialTier),
          0, // rarity
          Donkeycraft.ToolRegistry.getRepairItemBlockId(materialTier)
        ));

        count++;
      }

      return count;
    }

    // Auto-generate from blocks on initialization
    generateFromBlocks();

    return {
      register: register,
      get: get,
      getByName: getByName,
      getAll: getAll,
      getCount: getCount,
      generateFromBlocks: generateFromBlocks
    };
  })();

})();