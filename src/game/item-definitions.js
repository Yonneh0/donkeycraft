// Donkeycraft — Item Definitions
// Inline definitions for all items. Compact format with runtime generation from blocks/entities.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var ItemType = Donkeycraft.ItemType;

  // ============================================================
  // Special item IDs (above block range for tools/armor/weapons)
  // ============================================================

  /**
   * Item IDs — special ID ranges for non-block items.
   * Blocks: 0-255 (defined in BlockRegistry)
   * Tools/Weapons/Armor: 300-499
   * Food: 500-549
   * Potions: 550-599
   * Materials: 600-699
   * Entity items: 700-799
   */
  Donkeycraft.ItemIdRange = {
    BLOCK_START: 0,
    BLOCK_END: 255,
    TOOL_START: 300,
    TOOL_END: 349,
    WEAPON_START: 350,
    WEAPON_END: 374,
    ARMOR_START: 375,
    ARMOR_END: 399,
    FOOD_START: 500,
    FOOD_END: 549,
    POTION_START: 550,
    POTION_END: 599,
    MATERIAL_START: 600,
    MATERIAL_END: 699,
    ENTITY_ITEM_START: 700,
    ENTITY_ITEM_END: 799,
  };

  // ============================================================
  // ItemDefinitionRegistry — special item definitions
  // ============================================================

  /**
   * ItemDefinitions — static class for registering all special item definitions.
   */
  Donkeycraft.ItemDefinitions = (function () {
    var _registered = 0;

    /**
     * registerTool — registers a tool item definition.
     * @param {number} id - Item ID.
     * @param {string} name - Display name.
     * @param {number} materialTier - Material tier.
     * @param {string} toolType - Tool type ('pickaxe', 'shovel', 'axe', 'hoe').
     * @returns {number} Item ID.
     */
    function registerTool(id, name, materialTier, toolType) {
      var durability = Donkeycraft.ToolRegistry.getDurability(materialTier);
      var enchantability =
        Donkeycraft.ToolRegistry.getEnchantability(materialTier);
      var repairId =
        Donkeycraft.ToolRegistry.getRepairItemBlockId(materialTier);
      Donkeycraft.ItemDefinitionRegistry.register(
        new Donkeycraft.Item(
          id,
          name,
          ItemType.TOOL,
          materialTier,
          durability,
          1,
          0,
          0,
          0,
          0,
          0,
          0,
          1.0,
          toolType,
          0,
          null,
          enchantability,
          0,
          repairId
        )
      );
      _registered++;
      return id;
    }

    /**
     * registerWeapon — registers a weapon item definition.
     * @param {number} id - Item ID.
     * @param {string} name - Display name.
     * @param {number} materialTier - Material tier.
     * @param {number} damage - Attack damage.
     * @returns {number} Item ID.
     */
    function registerWeapon(id, name, materialTier, damage) {
      var durability = Donkeycraft.ToolRegistry.getDurability(materialTier);
      var enchantability =
        Donkeycraft.ToolRegistry.getEnchantability(materialTier);
      var repairId =
        Donkeycraft.ToolRegistry.getRepairItemBlockId(materialTier);
      Donkeycraft.ItemDefinitionRegistry.register(
        new Donkeycraft.Item(
          id,
          name,
          ItemType.WEAPON,
          materialTier,
          durability,
          1,
          damage,
          0,
          0,
          0,
          0,
          0,
          1.0,
          '',
          0,
          null,
          enchantability,
          0,
          repairId
        )
      );
      _registered++;
      return id;
    }

    /**
     * registerArmor — registers an armor item definition.
     * @param {number} id - Item ID.
     * @param {string} name - Display name.
     * @param {number} materialTier - Material tier.
     * @param {number} defense - Armor points.
     * @param {number} slot - Armor slot (0=helmet, 1=chestplate, 2=leggings, 3=boots).
     * @returns {number} Item ID.
     */
    function registerArmor(id, name, materialTier, defense, slot) {
      var durability = Donkeycraft.ToolRegistry.getDurability(materialTier);
      var enchantability =
        Donkeycraft.ToolRegistry.getEnchantability(materialTier);
      var repairId =
        Donkeycraft.ToolRegistry.getRepairItemBlockId(materialTier);
      // Adjust durability per slot: boots/leggings have different values
      if (slot === 3) durability = Math.floor(durability * 0.75); // boots
      if (slot === 2) durability = Math.floor(durability * 0.875); // leggings
      if (slot === 1) durability = Math.floor(durability * 1.125); // chestplate
      Donkeycraft.ItemDefinitionRegistry.register(
        new Donkeycraft.Item(
          id,
          name,
          ItemType.ARMOR,
          materialTier,
          durability,
          1,
          0,
          defense,
          0,
          0,
          0,
          0,
          1.0,
          '',
          0,
          null,
          enchantability,
          0,
          repairId
        )
      );
      _registered++;
      return id;
    }

    /**
     * registerFood — registers a food item definition.
     * @param {number} id - Item ID.
     * @param {string} name - Display name.
     * @param {number} foodRestore - Food points (0-20, where 20 = 10 drumsticks).
     * @param {number} [saturation=0.6] - Saturation level per food point.
     * @returns {number} Item ID.
     */
    function registerFood(id, name, foodRestore, saturation) {
      saturation = saturation !== undefined ? saturation : 0.6;
      Donkeycraft.ItemDefinitionRegistry.register(
        new Donkeycraft.Item(
          id,
          name,
          ItemType.FOOD,
          0,
          0,
          64,
          0,
          0,
          0,
          0,
          foodRestore,
          foodRestore * saturation,
          1.0,
          '',
          0,
          null,
          0,
          0,
          0
        )
      );
      _registered++;
      return id;
    }

    /**
     * registerPotion — registers a potion item definition.
     * @param {number} id - Item ID.
     * @param {string} name - Display name.
     * @param {Array} effects - Array of {effectId, duration, amplifier} objects.
     * @returns {number} Item ID.
     */
    function registerPotion(id, name, effects) {
      Donkeycraft.ItemDefinitionRegistry.register(
        new Donkeycraft.Item(
          id,
          name,
          ItemType.POTION,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          0,
          0,
          1.0,
          '',
          0,
          effects,
          0,
          1,
          0 // rarity 1 = uncommon
        )
      );
      _registered++;
      return id;
    }

    /**
     * registerMaterial — registers a crafting material item definition.
     * @param {number} id - Item ID.
     * @param {string} name - Display name.
     * @returns {number} Item ID.
     */
    function registerMaterial(id, name) {
      Donkeycraft.ItemDefinitionRegistry.register(
        new Donkeycraft.Item(
          id,
          name,
          ItemType.MATERIAL,
          0,
          0,
          64,
          0,
          0,
          0,
          0,
          0,
          0,
          1.0,
          '',
          0,
          null,
          0,
          0,
          0
        )
      );
      _registered++;
      return id;
    }

    /**
     * registerEntityItem — registers an entity drop item definition.
     * @param {number} id - Item ID.
     * @param {string} name - Display name.
     * @returns {number} Item ID.
     */
    function registerEntityItem(id, name) {
      Donkeycraft.ItemDefinitionRegistry.register(
        new Donkeycraft.Item(
          id,
          name,
          ItemType.ENTITY_ITEM,
          0,
          0,
          64,
          0,
          0,
          0,
          0,
          0,
          0,
          1.0,
          '',
          0,
          null,
          0,
          0,
          0
        )
      );
      _registered++;
      return id;
    }

    /**
     * registerAll — registers all special item definitions at once.
     * @returns {number} Total items registered.
     */
    function registerAll() {
      // ============================================================
      // TOOLS (IDs 300-349)
      // ============================================================

      // Wooden tools (300-304)
      registerTool(300, 'wooden_pickaxe', 1, 'pickaxe');
      registerTool(301, 'wooden_shovel', 1, 'shovel');
      registerTool(302, 'wooden_axe', 1, 'axe');
      registerTool(303, 'wooden_hoe', 1, 'hoe');

      // Stone tools (305-309)
      registerTool(305, 'stone_pickaxe', 2, 'pickaxe');
      registerTool(306, 'stone_shovel', 2, 'shovel');
      registerTool(307, 'stone_axe', 2, 'axe');
      registerTool(308, 'stone_hoe', 2, 'hoe');

      // Iron tools (310-314)
      registerTool(310, 'iron_pickaxe', 3, 'pickaxe');
      registerTool(311, 'iron_shovel', 3, 'shovel');
      registerTool(312, 'iron_axe', 3, 'axe');
      registerTool(313, 'iron_hoe', 3, 'hoe');

      // Diamond tools (315-319)
      registerTool(315, 'diamond_pickaxe', 4, 'pickaxe');
      registerTool(316, 'diamond_shovel', 4, 'shovel');
      registerTool(317, 'diamond_axe', 4, 'axe');
      registerTool(318, 'diamond_hoe', 4, 'hoe');

      // Gold tools (320-324)
      registerTool(320, 'gold_pickaxe', 5, 'pickaxe');
      registerTool(321, 'gold_shovel', 5, 'shovel');
      registerTool(322, 'gold_axe', 5, 'axe');
      registerTool(323, 'gold_hoe', 5, 'hoe');

      // Netherite tools (325-329)
      registerTool(325, 'netherite_pickaxe', 6, 'pickaxe');
      registerTool(326, 'netherite_shovel', 6, 'shovel');
      registerTool(327, 'netherite_axe', 6, 'axe');
      registerTool(328, 'netherite_hoe', 6, 'hoe');

      // ============================================================
      // WEAPONS (IDs 350-374)
      // ============================================================

      // Wooden sword
      registerWeapon(350, 'wooden_sword', 1, 4);
      // Stone sword
      registerWeapon(351, 'stone_sword', 2, 5);
      // Iron sword
      registerWeapon(352, 'iron_sword', 3, 6);
      // Diamond sword
      registerWeapon(353, 'diamond_sword', 4, 7);
      // Gold sword
      registerWeapon(354, 'gold_sword', 5, 4);
      // Netherite sword
      registerWeapon(355, 'netherite_sword', 6, 8);

      // ============================================================
      // ARMOR (IDs 375-399)
      // Slots: 0=helmet, 1=chestplate, 2=leggings, 3=boots
      // ============================================================

      // Leather armor (375-378) — tier 1
      registerArmor(375, 'leather_helmet', 1, 1, 0);
      registerArmor(376, 'leather_chestplate', 1, 3, 1);
      registerArmor(377, 'leather_leggings', 1, 2, 2);
      registerArmor(378, 'leather_boots', 1, 1, 3);

      // Iron armor (379-382) — tier 3
      registerArmor(379, 'iron_helmet', 3, 2, 0);
      registerArmor(380, 'iron_chestplate', 3, 6, 1);
      registerArmor(381, 'iron_leggings', 3, 5, 2);
      registerArmor(382, 'iron_boots', 3, 2, 3);

      // Diamond armor (383-386) — tier 4
      registerArmor(383, 'diamond_helmet', 4, 3, 0);
      registerArmor(384, 'diamond_chestplate', 4, 8, 1);
      registerArmor(385, 'diamond_leggings', 4, 6, 2);
      registerArmor(386, 'diamond_boots', 4, 3, 3);

      // Gold armor (387-390) — tier 5
      registerArmor(387, 'gold_helmet', 5, 2, 0);
      registerArmor(388, 'gold_chestplate', 5, 5, 1);
      registerArmor(389, 'gold_leggings', 5, 6, 2);
      registerArmor(390, 'gold_boots', 5, 2, 3);

      // Netherite armor (391-394) — tier 6
      registerArmor(391, 'netherite_helmet', 6, 3, 0);
      registerArmor(392, 'netherite_chestplate', 6, 8, 1);
      registerArmor(393, 'netherite_leggings', 6, 6, 2);
      registerArmor(394, 'netherite_boots', 6, 3, 3);

      // ============================================================
      // FOOD (IDs 500-549)
      // foodRestore: 0-20 per point (20 = 10 drumsticks = full bar)
      // ============================================================

      registerFood(500, 'apple', 4); // 2 drumsticks
      registerFood(501, 'bread', 5); // 2.5 drumsticks
      registerFood(502, 'porkchop_raw', 3); // 1.5 drumsticks
      registerFood(503, 'porkchop_cooked', 8); // 4 drumsticks
      registerFood(504, 'beef_raw', 3);
      registerFood(505, 'beef_cooked', 8);
      registerFood(506, 'chicken_raw', 2);
      registerFood(507, 'chicken_cooked', 6);
      registerFood(508, 'fish_raw', 1);
      registerFood(509, 'fish_cooked', 5);
      registerFood(510, 'potato_baked', 5);
      registerFood(511, 'melon_slice', 2);
      registerFood(512, 'carrot', 3);
      registerFood(513, 'golden_apple', 4, 9.6); // Enchanted: full saturation
      registerFood(514, 'cookie', 2);
      registerFood(515, 'beetroot_soup', 6, 3.6); // Bowl returned
      registerFood(516, 'rabbit_stew', 10, 12.0);
      registerFood(517, 'sweet_berries', 2);

      // ============================================================
      // POTIONS (IDs 550-599)
      // ============================================================

      // Base potion: Awkward Potion
      registerPotion(550, 'awkward_potion', []);

      // Water Bottle
      registerPotion(551, 'water_bottle', []);

      // Healing potions (instant health)
      registerPotion(552, 'potion_of_healing', [
        { effectId: 1, duration: 0, amplifier: 0 },
      ]);
      registerPotion(553, 'potion_of_healing_ii', [
        { effectId: 1, duration: 0, amplifier: 1 },
      ]);

      // Regeneration potions
      registerPotion(554, 'potion_of_regeneration', [
        { effectId: 2, duration: 900, amplifier: 0 },
      ]);
      registerPotion(555, 'potion_of_regeneration_ii', [
        { effectId: 2, duration: 450, amplifier: 1 },
      ]);

      // Strength potions
      registerPotion(556, 'potion_of_strength', [
        { effectId: 3, duration: 900, amplifier: 0 },
      ]);
      registerPotion(557, 'potion_of_strength_ii', [
        { effectId: 3, duration: 450, amplifier: 1 },
      ]);

      // Speed potions
      registerPotion(558, 'potion_of_swiftness', [
        { effectId: 4, duration: 900, amplifier: 0 },
      ]);
      registerPotion(559, 'potion_of_swiftness_ii', [
        { effectId: 4, duration: 450, amplifier: 1 },
      ]);

      // Slowness potions
      registerPotion(560, 'potion_of_slowness', [
        { effectId: 5, duration: 900, amplifier: 0 },
      ]);
      registerPotion(561, 'potion_of_leaping', [
        { effectId: 6, duration: 900, amplifier: 0 },
      ]);

      // Fire Resistance potion
      registerPotion(562, 'potion_of_fire_resistance', [
        { effectId: 7, duration: 900, amplifier: 0 },
      ]);

      // Water Breathing potion
      registerPotion(563, 'potion_of_water_breathing', [
        { effectId: 8, duration: 900, amplifier: 0 },
      ]);

      // Invisibility potion
      registerPotion(564, 'potion_of_invisibility', [
        { effectId: 9, duration: 900, amplifier: 0 },
      ]);

      // Night Vision potion
      registerPotion(565, 'potion_of_night_vision', [
        { effectId: 10, duration: 900, amplifier: 0 },
      ]);

      // Weakness potion
      registerPotion(566, 'potion_of_weakness', [
        { effectId: 11, duration: 900, amplifier: 0 },
      ]);

      // Slow Falling potion
      registerPotion(567, 'potion_of_slow_falling', [
        { effectId: 12, duration: 900, amplifier: 0 },
      ]);

      // Tipped arrow base
      registerPotion(568, 'arrow_of_damage', [
        { effectId: 1, duration: 0, amplifier: 0 },
      ]);

      // ============================================================
      // MATERIALS (IDs 600-699)
      // ============================================================

      // Crafting materials
      registerMaterial(600, 'stick');
      registerMaterial(601, 'flint');
      registerMaterial(602, 'feather');
      registerMaterial(603, 'leather');
      registerMaterial(604, 'clay_ball');
      registerMaterial(605, 'glowstone_dust');
      registerMaterial(606, 'redstone', 1); // Already in blocks, skip
      registerMaterial(607, 'coal');
      registerMaterial(608, 'charcoal');
      registerMaterial(609, 'diamond');
      registerMaterial(610, 'emerald');
      registerMaterial(611, 'gold_ingot');
      registerMaterial(612, 'iron_ingot');
      registerMaterial(613, 'netherite_ingot');
      registerMaterial(614, 'quartz');
      registerMaterial(615, 'bone_meal');
      registerMaterial(616, 'bone');
      registerMaterial(617, 'string');
      registerMaterial(618, 'sugar_cane');
      registerMaterial(619, 'paper');
      registerMaterial(620, 'reeds');
      registerMaterial(621, 'end_pearl');
      registerMaterial(622, 'ender_pearl');
      registerMaterial(623, 'ender_eye');
      registerMaterial(624, 'blaze_rod');
      registerMaterial(625, 'blaze_powder');
      registerMaterial(626, 'magma_cream');
      registerMaterial(627, 'ghast_tear');
      registerMaterial(628, 'gold_nugget');
      registerMaterial(629, 'nether_star');
      registerMaterial(630, 'amethyst_shard');
      registerMaterial(631, 'raw_iron');
      registerMaterial(632, 'raw_gold');
      registerMaterial(633, 'raw_diamond');

      // ============================================================
      // ENTITY ITEMS (IDs 700-799)
      // ============================================================

      // Mob drops
      registerEntityItem(700, 'experience_orb');
      registerEntityItem(701, 'arrow');
      registerEntityItem(702, 'snowball');
      registerEntityItem(703, 'egg');
      registerEntityItem(704, 'spectral_arrow');
      registerEntityItem(705, 'tnt_minecart');
      registerEntityItem(706, 'boat');

      return _registered;
    }

    /**
     * generateFromEntities — auto-generates item definitions from entity drop tables.
     * @returns {number} Number of items generated.
     */
    function generateFromEntities() {
      // This would iterate over mob definitions and create item entries
      // for their drops. For now, we manually define the common ones above.
      return 0;
    }

    // Auto-register all special items on initialization
    registerAll();

    return {
      registerTool: registerTool,
      registerWeapon: registerWeapon,
      registerArmor: registerArmor,
      registerFood: registerFood,
      registerPotion: registerPotion,
      registerMaterial: registerMaterial,
      registerEntityItem: registerEntityItem,
      registerAll: registerAll,
      generateFromEntities: generateFromEntities,
    };
  })();
})();
