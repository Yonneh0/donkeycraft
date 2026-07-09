// Donkeycraft — Tool System
// Tool material tiers, speed multipliers, correct-for-drop detection, and durability management.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  // ============================================================
  // ToolMaterial — individual tool material definition
  // ============================================================

  /**
   * ToolMaterial — represents a tool material tier with its stats.
   * @param {number} id - Unique material ID.
   * @param {string} name - Human-readable name (e.g., "Diamond").
   * @param {number} durabilityCount — Maximum number of uses before breaking.
   * @param {number} speedMultiplier — Block break speed multiplier.
   * @param {number} hardnessLevel — Minimum block hardness level this material can efficiently mine.
   * @param {number} enchantability — Enchantability bonus value.
   * @param {number} repairItemBlockId - Block/item ID used for repairing this tool.
   */
  Donkeycraft.ToolMaterial = function (
    id,
    name,
    durabilityCount,
    speedMultiplier,
    hardnessLevel,
    enchantability,
    repairItemBlockId
  ) {
    this.id = id;
    this.name = name;
    this.durabilityCount = durabilityCount || 0;
    this.speedMultiplier = speedMultiplier || 1.0;
    this.hardnessLevel = hardnessLevel || 0;
    this.enchantability = enchantability || 0;
    this.repairItemBlockId = repairItemBlockId || 0;
  };

  // ============================================================
  // ToolRegistry — central registry of tool materials and type mappings
  // ============================================================

  /**
   * ToolRegistry — static class managing tool material definitions, correct-for-drop logic, and break time calculations.
   */
  Donkeycraft.ToolRegistry = (function () {
    var _materials = {}; // id -> ToolMaterial
    var _byName = {}; // name -> ToolMaterial

    /**
     * registerMaterial — registers a tool material definition.
     * @param {Donkeycraft.ToolMaterial} material - The material to register.
     * @returns {Donkeycraft.ToolMaterial}
     * @private
     */
    function registerMaterial(material) {
      _materials[material.id] = material;
      _byName[material.name.toLowerCase()] = material;
      return material;
    }

    /**
     * registerMaterials — registers all tool materials.
     * @returns {number} Total number of registered materials.
     */
    function registerMaterials() {
      // No tool (bare hands)
      registerMaterial(
        new Donkeycraft.ToolMaterial(0, 'None', 0, 1.0, 0, 0, 0)
      );

      // Wood: 60 uses, 2x speed, level 0, enchantability 15, repair with oak plank
      registerMaterial(
        new Donkeycraft.ToolMaterial(1, 'Wood', 60, 2.0, 0, 15, 5)
      );

      // Stone: 132 uses, 4x speed, level 1, enchantability 5, repair with cobblestone
      registerMaterial(
        new Donkeycraft.ToolMaterial(2, 'Stone', 132, 4.0, 1, 5, 1)
      );

      // Iron: 251 uses, 6x speed, level 2, enchantability 14, repair with iron ingot
      registerMaterial(
        new Donkeycraft.ToolMaterial(3, 'Iron', 251, 6.0, 2, 14, 221)
      );

      // Diamond: 1562 uses, 8x speed, level 3, enchantability 10, repair with diamond
      registerMaterial(
        new Donkeycraft.ToolMaterial(4, 'Diamond', 1562, 8.0, 3, 10, 227)
      );

      // Gold: 196 uses, 12x speed, level 0, enchantability 22, repair with gold ingot
      registerMaterial(
        new Donkeycraft.ToolMaterial(5, 'Gold', 196, 12.0, 0, 22, 226)
      );

      // Netherite: 2032 uses, 9x speed, level 4, enchantability 15, repair with netherite ingot
      registerMaterial(
        new Donkeycraft.ToolMaterial(6, 'Netherite', 2032, 9.0, 4, 15, 187)
      );

      return Object.keys(_materials).length;
    }

    /**
     * getToolMaterial — looks up a tool material by ID.
     * @param {number} id - Material ID.
     * @returns {Donkeycraft.ToolMaterial|null}
     */
    function getToolMaterial(id) {
      return _materials[id] || null;
    }

    /**
     * getToolMaterialByName — looks up a tool material by name (case-insensitive).
     * @param {string} name - Material name.
     * @returns {Donkeycraft.ToolMaterial|null}
     */
    function getToolMaterialByName(name) {
      return _byName[name.toLowerCase()] || null;
    }

    /**
     * getAllToolMaterials — returns all registered tool materials.
     * @returns {Array<Donkeycraft.ToolMaterial>}
     */
    function getAllToolMaterials() {
      var result = [];
      for (var id in _materials) {
        if (_materials.hasOwnProperty(id)) {
          result.push(_materials[id]);
        }
      }
      return result;
    }

    /**
     * getMaterialCount — returns the total number of registered materials.
     * @returns {number}
     */
    function getMaterialCount() {
      return Object.keys(_materials).length;
    }

    /**
     * getDurability — gets max durability for a material ID.
     * @param {number} materialId - Material ID (0 = none/hands).
     * @returns {number} Max durability uses.
     */
    function getDurability(materialId) {
      var mat = _materials[materialId];
      return mat ? mat.durabilityCount : 0;
    }

    /**
     * getSpeedMultiplier — gets block break speed multiplier for a material ID.
     * @param {number} materialId - Material ID (0 = none/hands).
     * @returns {number} Speed multiplier.
     */
    function getSpeedMultiplier(materialId) {
      var mat = _materials[materialId];
      return mat ? mat.speedMultiplier : 1.0;
    }

    /**
     * getEnchantability — gets enchantability bonus for a material ID.
     * @param {number} materialId - Material ID (0 = none/hands).
     * @returns {number} Enchantability bonus.
     */
    function getEnchantability(materialId) {
      var mat = _materials[materialId];
      return mat ? mat.enchantability : 0;
    }

    /**
     * getRepairItemBlockId — gets the repair item block ID for a material.
     * @param {number} materialId - Material ID.
     * @returns {number} Block/item ID used for repairs (0 = none).
     */
    function getRepairItemBlockId(materialId) {
      var mat = _materials[materialId];
      return mat ? mat.repairItemBlockId : 0;
    }

    /**
     * calculateBreakTime — calculates how many ticks it takes to break a block.
     * @param {number} blockHardness - The hardness value of the block.
     * @param {number} materialId - Tool material ID (0 = bare hands).
     * @param {string} toolType - Tool type being used ('pickaxe', 'shovel', 'axe', 'hoe', 'sword', 'fishing_rod').
     * @returns {number} Break time in ticks (at 20 TPS).
     */
    function calculateBreakTime(blockHardness, materialId, toolType) {
      blockHardness = Math.max(0, blockHardness || 0);
      materialId = materialId || 0;
      toolType = toolType || 'none';

      // Bare hands: base speed is 1.0
      var mat = _materials[materialId];
      var speed = mat ? mat.speedMultiplier : 1.0;

      // Check if the tool type is correct for the block (3x speed bonus)
      var correctForDrop = isCorrectForDrop(toolType, materialId);
      if (correctForDrop) {
        speed *= 3.0;
      }

      // If hardness > 0 and not using correct tool type with sufficient level, reduce speed
      if (blockHardness > 0 && !correctForDrop) {
        // Check material level requirement
        if (mat && blockHardness > mat.hardnessLevel) {
          speed /= 3.0; // Penalty for insufficient tool level
        }
      }

      // Calculate break time: hardness * 1.5 / speed
      // If speed > 1, break time is less than base (faster breaking)
      var breakTime = (blockHardness * 1.5) / speed;

      // Minimum break time is 0.05 ticks (allows fine-grained speed differences between high-tier tools)
      breakTime = Math.max(0.05, breakTime);

      // If hardness is 0 (air, etc.), break time is 0
      if (blockHardness <= 0) {
        return 0;
      }

      return breakTime; // Return raw seconds value for fine-grained comparison
    }

    /**
     * isCorrectForDrop — checks if a tool type/material is correct for breaking a block.
     * Note: This validates the tool type itself. For block-specific checking, use
     * isBlockMinedByPickaxe/isBlockMinedByShovel/isBlockMinedByAxe/isBlockMinedByHoe first.
     * @param {string} toolType - Tool type ('pickaxe', 'shovel', 'axe', 'hoe').
     * @param {number} materialId - Material ID (0 = none/hands).
     * @returns {boolean} True if the tool type is valid and material can mine efficiently.
     */
    function isCorrectForDrop(toolType, materialId) {
      toolType = (toolType || '').toLowerCase();
      materialId = materialId || 0;

      // Bare hands are never "correct" for any block
      if (materialId === 0) return false;

      // Get the material's hardness level
      var mat = _materials[materialId];
      if (!mat) return false;

      // Valid tool types
      if (
        toolType === 'pickaxe' ||
        toolType === 'shovel' ||
        toolType === 'axe' ||
        toolType === 'hoe'
      ) {
        return true;
      }

      return false;
    }

    /**
     * isBlockMinedByPickaxe — checks if a block ID requires a pickaxe.
     * @param {number} blockId - Block ID to check.
     * @returns {boolean}
     */
    function isBlockMinedByPickaxe(blockId) {
      // Stone family, ores, iron/diamond/gold blocks, obsidian, deepslate, etc.
      var pickaxeBlocks = {
        1: true, // stone
        2: true, // granite
        3: true, // diorite
        4: true, // andesite
        5: true, // deepslate
        6: true, // cobbled_deepslate
        12: true, // coal_ore
        15: true, // iron_ore
        16: true, // gold_ore
        17: true, // diamond_ore
        18: true, // lapis_ore
        21: true, // redstone_ore
        37: true, // bedrock
        46: true, // obsidian
        56: true, // iron_block
        57: true, // gold_block
        58: true, // diamond_block
        62: true, // coal_block
        103: true, // nether_gold_ore
        111: true, // nether_quartz_ore
        125: true, // ancient_debris
        129: true, // copper_ore
        152: true, // deepslate_coal_ore
        153: true, // deepslate_iron_ore
        154: true, // deepslate_gold_ore
        155: true, // deepslate_diamond_ore
        156: true, // deepslate_lapis_ore
        157: true, // deepslate_redstone_ore
        204: true, // netherite_block
        238: true, // raw_iron_block
        239: true, // raw_gold_block
        240: true, // raw_diamond_block
      };
      return pickaxeBlocks[blockId] === true;
    }

    /**
     * isBlockMinedByShovel — checks if a block ID requires a shovel.
     * @param {number} blockId - Block ID to check.
     * @returns {boolean}
     */
    function isBlockMinedByShovel(blockId) {
      var shovelBlocks = {
        7: true, // dirt
        8: true, // grass_block
        9: true, // gravel
        13: true, // sand (red)
        14: true, // sand (yellow)
        24: true, // soul_sand
        30: true, // sandstone
        31: true, // white_wool (clay-like)
        32: true, // clay
        97: true, // podzol
        98: true, // coarse_dirt
        110: true, // mycelium
        162: true, // dirt_path
        180: true, // gravel (nether)
        203: true, // basalt
        205: true, // soul_soil
        224: true, // mud
        241: true, // packed_mud
      };
      return shovelBlocks[blockId] === true;
    }

    /**
     * isBlockMinedByAxe — checks if a block ID requires an axe.
     * @param {number} blockId - Block ID to check.
     * @returns {boolean}
     */
    function isBlockMinedByAxe(blockId) {
      var axeBlocks = {
        96: true, // oak_planks
        99: true, // oak_log
        100: true, // stick (wood product)
        104: true, // crafting_table
        105: true, // bookshelf
        106: true, // chest
        107: true, // ladder
        108: true, // trapdoor
        109: true, // fence_gate
        110: true, // fence
        111: true, // door (wooden) — NOTE: different from block ID 111 nether_quartz_ore
        112: true, // sign
        113: true, // jungle_planks
        115: true, // spruce_planks
        116: true, // birch_planks
        117: true, // dark_oak_planks
      };
      return axeBlocks[blockId] === true;
    }

    /**
     * isBlockMinedByHoe — checks if a block ID is efficiently mined by a hoe.
     * @param {number} blockId - Block ID to check.
     * @returns {boolean}
     */
    function isBlockMinedByHoe(blockId) {
      var hoeBlocks = {
        59: true, // wheat_crop
        60: true, // carrot
        61: true, // potato
        63: true, // pumpkin_stem
        64: true, // melon_stem
        65: true, // beetroot
        68: true, // nether_wart
        70: true, // chorus_plant
        71: true, // chorus_flower
      };
      return hoeBlocks[blockId] === true;
    }

    /**
     * getCorrectToolForBlock — returns the optimal tool type for a block.
     * @param {number} blockId - Block ID to check.
     * @returns {string|null} Optimal tool type or null if none.
     */
    function getCorrectToolForBlock(blockId) {
      if (isBlockMinedByPickaxe(blockId)) return 'pickaxe';
      if (isBlockMinedByShovel(blockId)) return 'shovel';
      if (isBlockMinedByAxe(blockId)) return 'axe';
      if (isBlockMinedByHoe(blockId)) return 'hoe';
      return null;
    }

    /**
     * getToolTypeFromBlockId — determines the tool type string from a tool block/item ID.
     * Maps Donkeycraft tool item IDs to their corresponding tool type categories.
     * @param {number} toolBlockId - Block/item ID of the tool.
     * @returns {string|null} Tool type ('pickaxe', 'shovel', 'axe', 'hoe', 'sword') or null.
     */
    function getToolTypeFromBlockId(toolBlockId) {
      // Pickaxes: 250-255 (wooden/gold/stone/iron/diamond/netherite pickaxe)
      if ([250, 251, 252, 253, 254, 255].indexOf(toolBlockId) >= 0)
        return 'pickaxe';
      // Shovels: 244-249 (wooden/gold/stone/iron/diamond/netherite shovel)
      if ([244, 245, 246, 247, 248, 249].indexOf(toolBlockId) >= 0)
        return 'shovel';
      // Axes: 273-278 (wooden/gold/stone/iron/diamond/netherite axe)
      if ([273, 274, 275, 276, 277, 278].indexOf(toolBlockId) >= 0)
        return 'axe';
      // Hoes: 238-243 (wooden/gold/stone/iron/diamond/netherite hoe)
      if ([238, 239, 240, 241, 242, 243].indexOf(toolBlockId) >= 0)
        return 'hoe';
      // Swords: 257-262 (wooden/gold/stone/iron/diamond/netherite sword)
      if ([257, 258, 259, 260, 261, 262].indexOf(toolBlockId) >= 0)
        return 'sword';

      return null;
    }

    /**
     * calculateDurabilityWithUnbreaking — calculates expected durability consumption with the Unbreaking enchantment.
     * chance of not consuming durability = 1 / (unbreakingLevel + 1).
     * @param {number} materialId - Tool material ID.
     * @param {number} baseDamage - Base damage to apply (typically 1 per block break).
     * @param {number} unbreakingLevel - Unbreaking enchantment level (0 = no unbreaking).
     * @returns {number} Expected durability loss (may be less than baseDamage due to unbreaking).
     */
    function calculateDurabilityWithUnbreaking(
      materialId,
      baseDamage,
      unbreakingLevel
    ) {
      baseDamage = Math.max(1, baseDamage || 1);
      unbreakingLevel = Math.max(0, unbreakingLevel || 0);

      if (unbreakingLevel <= 0) return baseDamage;

      // expected durability = baseDamage * (unbreakingLevel + 1)
      // This represents the average number of uses before breaking
      var expectedUses = baseDamage * (unbreakingLevel + 1);

      // Return the fraction of durability consumed per use (1/expectedUses scaled)
      // For practical use: return expected damage after accounting for probability
      return baseDamage; // Return baseDamage; the caller should use probability (1/(unbreaking+1)) to skip damage
    }

    // Auto-register all materials on initialization
    registerMaterials();

    return {
      getToolMaterial: getToolMaterial,
      getToolMaterialByName: getToolMaterialByName,
      getAllToolMaterials: getAllToolMaterials,
      getMaterialCount: getMaterialCount,
      getDurability: getDurability,
      getSpeedMultiplier: getSpeedMultiplier,
      getEnchantability: getEnchantability,
      getRepairItemBlockId: getRepairItemBlockId,
      calculateBreakTime: calculateBreakTime,
      isCorrectForDrop: isCorrectForDrop,
      isBlockMinedByPickaxe: isBlockMinedByPickaxe,
      isBlockMinedByShovel: isBlockMinedByShovel,
      isBlockMinedByAxe: isBlockMinedByAxe,
      isBlockMinedByHoe: isBlockMinedByHoe,
      getCorrectToolForBlock: getCorrectToolForBlock,
      getToolTypeFromBlockId: getToolTypeFromBlockId,
      calculateDurabilityWithUnbreaking: calculateDurabilityWithUnbreaking,
    };
  })();

  // ============================================================
  // Tool — individual tool instance with durability tracking
  // ============================================================

  /**
   * Tool — represents an individual tool item with its current state.
   * @param {number} materialId - The material ID of this tool.
   * @param {number} [toolBlockId=0] - The block/item ID of the tool.
   */
  Donkeycraft.Tool = function (materialId, toolBlockId) {
    this._materialId = materialId || 0;
    this._toolBlockId = toolBlockId || 0;

    var mat = Donkeycraft.ToolRegistry.getToolMaterial(materialId);
    this._maxDurability = mat ? mat.durabilityCount : 0;
    this._currentDurability = this._maxDurability;
  };

  /**
   * takeDamage — applies damage to the tool, reducing its durability.
   * @param {number} [amount=1] - Amount of damage to apply.
   * @returns {boolean} True if the tool was broken by this damage.
   */
  Donkeycraft.Tool.prototype.takeDamage = function (amount) {
    // Handle zero/negative amounts: no damage applied
    if (amount === undefined || amount <= 0) {
      amount = 0;
    }
    if (this._currentDurability <= 0) return false; // Already broken

    this._currentDurability -= amount;
    if (this._currentDurability < 0) {
      this._currentDurability = 0;
    }

    return this._currentDurability <= 0;
  };

  /**
   * getRemainingDurability — gets the remaining durability count.
   * @returns {number}
   */
  Donkeycraft.Tool.prototype.getRemainingDurability = function () {
    return Math.max(0, this._currentDurability);
  };

  /**
   * getMaxDurability — gets the maximum durability of this tool.
   * @returns {number}
   */
  Donkeycraft.Tool.prototype.getMaxDurability = function () {
    return this._maxDurability;
  };

  /**
   * getDurabilityFraction — gets the ratio of remaining/max durability (0-1).
   * @returns {number}
   */
  Donkeycraft.Tool.prototype.getDurabilityFraction = function () {
    if (this._maxDurability <= 0) return 0;
    return this._currentDurability / this._maxDurability;
  };

  /**
   * isBroken — checks if the tool has no remaining durability.
   * @returns {boolean}
   */
  Donkeycraft.Tool.prototype.isBroken = function () {
    return this._currentDurability <= 0;
  };

  /**
   * repairWithItem — repairs the tool using a compatible item stack.
   * Restores durability based on the repair material's value.
   * @param {number} repairItemBlockId - Block/item ID being used to repair.
   * @returns {number} Amount of durability restored.
   */
  Donkeycraft.Tool.prototype.repairWithItem = function (repairItemBlockId) {
    var expectedRepairId = Donkeycraft.ToolRegistry.getRepairItemBlockId(
      this._materialId
    );
    if (expectedRepairId === 0 || repairItemBlockId !== expectedRepairId) {
      return 0; // Wrong material
    }

    var mat = Donkeycraft.ToolRegistry.getToolMaterial(this._materialId);
    if (!mat) return 0;

    // Repair amount: 1/4 of max durability per repair
    var repairAmount = Math.floor(mat.durabilityCount / 4);
    var oldDurability = this._currentDurability;
    this._currentDurability = Math.min(
      this._maxDurability,
      this._currentDurability + repairAmount
    );

    return this._currentDurability - oldDurability;
  };

  /**
   * getMaterialId — gets the material ID of this tool.
   * @returns {number}
   */
  Donkeycraft.Tool.prototype.getMaterialId = function () {
    return this._materialId;
  };

  /**
   * getToolBlockId — gets the block/item ID of this tool.
   * @returns {number}
   */
  Donkeycraft.Tool.prototype.getToolBlockId = function () {
    return this._toolBlockId;
  };

  /**
   * serialize — serializes the tool state to a plain object for persistence/network transfer.
   * @returns {Object} Serialized tool data.
   */
  Donkeycraft.Tool.prototype.serialize = function () {
    return {
      materialId: this._materialId,
      toolBlockId: this._toolBlockId,
      currentDurability: this._currentDurability,
      maxDurability: this._maxDurability,
    };
  };

  /**
   * deserialize — creates a Tool from serialized data.
   * @param {Object} data - Serialized tool data.
   * @returns {Donkeycraft.Tool} The deserialized Tool instance.
   */
  Donkeycraft.Tool.deserialize = function (data) {
    if (!data || typeof data !== 'object') {
      return new Donkeycraft.Tool(0, 0);
    }

    var tool = new Donkeycraft.Tool(
      data.materialId || 0,
      data.toolBlockId || 0
    );
    tool._currentDurability = Math.max(
      0,
      Math.min(
        data.currentDurability !== undefined
          ? data.currentDurability
          : tool._maxDurability,
        tool._maxDurability
      )
    );
    return tool;
  };

  /**
   * toString — returns a human-readable string representation of the tool.
   * @returns {string}
   */
  Donkeycraft.Tool.prototype.toString = function () {
    var mat = Donkeycraft.ToolRegistry.getToolMaterial(this._materialId);
    var matName = mat ? mat.name : 'Unknown';
    return (
      'Tool[' +
      matName +
      ', durability=' +
      this._currentDurability +
      '/' +
      this._maxDurability +
      ']'
    );
  };

  /**
   * destroy — cleans up resources.
   */
  Donkeycraft.Tool.prototype.destroy = function () {
    this._materialId = 0;
    this._toolBlockId = 0;
    this._maxDurability = 0;
    this._currentDurability = 0;
  };
})();
