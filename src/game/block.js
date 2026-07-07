// Donkeycraft — Block Definitions
// All 256+ vanilla Minecraft block definitions with IDs, names, hardness, blast resistance, drops, transparency flags.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    // ============================================================
    // Block — individual block definition
    // ============================================================

    /**
     * Block — represents a single block type with its metadata.
     * @param {number} id - Unique block ID (0-255).
     * @param {string} name - Human-readable name (e.g., "stone", "oak_planks").
     * @param {number} [hardness=1.0] — How long it takes to break this block.
     * @param {number} [blastResistance=6.0] — Explosion blast resistance.
     * @param {number} [dropBlockId=-1] — Block ID dropped when broken (-1 = none).
     * @param {number} [dropItemCount=1] — Number of items dropped.
     * @param {boolean} [transparent=false] — Whether the block is transparent (glass, water, etc.).
     * @param {boolean} [emissive=false] — Whether the block emits light.
     * @param {number} [lightLevel=0] — Light level emitted (0-15).
     * @param {number} [lightOpacity=0] — How much light passes through (0 = fully transparent, 15 = fully opaque).
     */
    Donkeycraft.Block = function (id, name, hardness, blastResistance, dropBlockId, dropItemCount, transparent, emissive, lightLevel, lightOpacity) {
        this.id = id;
        this.name = name;
        this.hardness = hardness !== undefined ? hardness : 1.0;
        this.blastResistance = blastResistance !== undefined ? blastResistance : 6.0;
        this.dropBlockId = dropBlockId !== undefined ? dropBlockId : -1;
        this.dropItemCount = dropItemCount !== undefined ? dropItemCount : 1;
        this.transparent = transparent !== undefined ? transparent : false;
        this.emissive = emissive !== undefined ? emissive : false;
        this.lightLevel = lightLevel !== undefined ? lightLevel : 0;
        this.lightOpacity = lightOpacity !== undefined ? lightOpacity : 0;
    };

    // ============================================================
    // BlockRegistry — all vanilla block definitions
    // ============================================================

    /**
     * BlockRegistry — central registry of all vanilla Minecraft blocks.
     */
    Donkeycraft.BlockRegistry = (function () {
        var _blocks = {};         // id -> Block
        var _byName = {};         // name -> Block
        var _nextId = 0;          // auto-increment ID counter

        /**
         * Register a block definition.
         * @param {number} id - Block ID.
         * @param {string} name - Block name.
         * @param {number} [hardness=1.0]
         * @param {number} [blastResistance=6.0]
         * @param {number} [dropBlockId=-1]
         * @param {number} [dropItemCount=1]
         * @param {boolean} [transparent=false]
         * @param {boolean} [emissive=false]
         * @param {number} [lightLevel=0]
         * @param {number} [lightOpacity=0]
         * @returns {Donkeycraft.Block}
         * @private
         */
        function registerBlock(id, name, hardness, blastResistance, dropBlockId, dropItemCount, transparent, emissive, lightLevel, lightOpacity) {
            var block = new Donkeycraft.Block(
                id, name,
                hardness !== undefined ? hardness : 1.0,
                blastResistance !== undefined ? blastResistance : 6.0,
                dropBlockId !== undefined ? dropBlockId : -1,
                dropItemCount !== undefined ? dropItemCount : 1,
                transparent !== undefined ? transparent : false,
                emissive !== undefined ? emissive : false,
                lightLevel !== undefined ? lightLevel : 0,
                lightOpacity !== undefined ? lightOpacity : 0
            );
            _blocks[id] = block;
            _byName[name] = block;
            if (id + 1 > _nextId) {
                _nextId = id + 1;
            }
            return block;
        }

        // ---- Define all vanilla blocks ----

        // Air (ID 0) — special case, always first
        registerBlock(0, 'air', -1, 0, -1, 0, true, false, 0, 0);

        // Stone family (IDs 1-9)
        registerBlock(1, 'stone', 1.5, 6.0, 1, 1, false, false, 0, 15);
        registerBlock(2, 'granite', 1.5, 6.0, 2, 1, false, false, 0, 15);
        registerBlock(3, 'diorite', 1.5, 6.0, 3, 1, false, false, 0, 15);
        registerBlock(4, 'andesite', 1.5, 6.0, 4, 1, false, false, 0, 15);
        registerBlock(5, 'deepslate', 3.0, 6.0, 5, 1, false, false, 0, 15);
        registerBlock(6, 'cobbled_deepslate', 3.0, 6.0, 6, 1, false, false, 0, 15);
        registerBlock(7, 'dirt', 0.5, 0.5, 7, 1, false, false, 0, 15);
        registerBlock(8, 'grass_block', 0.6, 0.6, 8, 1, false, false, 0, 15);
        registerBlock(9, 'gravel', 0.6, 0.5, 9, 1, false, false, 0, 15);

        // Grass block face variants — separate block IDs for proper atlas UV mapping
        registerBlock(233, 'grass_block_top', 0.6, 0.6, 8, 1, false, false, 0, 15);
        registerBlock(140, 'grass_block_side', 0.6, 0.6, 8, 1, false, false, 0, 15);

        // Bedrock (ID 1000) — world boundary block, unbreakable
        registerBlock(1000, 'bedrock', -1, 3600000.0, -1, 0, false, false, 0, 15);

        // Ores (IDs 10-20) — added copper_ore and tin_ore
        registerBlock(10, 'coal_ore', 3.0, 6.0, 10, 1, false, false, 0, 15);
        registerBlock(11, 'iron_ore', 3.0, 6.0, 11, 1, false, false, 0, 15);
        registerBlock(12, 'gold_ore', 3.0, 6.0, 12, 1, false, false, 0, 15);
        registerBlock(13, 'diamond_ore', 3.0, 6.0, 13, 1, false, false, 0, 15);
        registerBlock(14, 'emerald_ore', 3.0, 6.0, 14, 1, false, false, 0, 15);
        registerBlock(15, 'redstone_ore', 3.0, 6.0, 15, 1, false, false, 0, 15);
        registerBlock(16, 'lapis_ore', 3.0, 6.0, 16, 1, false, false, 0, 15);
        registerBlock(17, 'copper_ore', 3.0, 6.0, 17, 1, false, false, 0, 15);
        registerBlock(18, 'tin_ore', 3.0, 6.0, 18, 1, false, false, 0, 15);
        registerBlock(19, 'obsidian', 50.0, 1200.0, 19, 1, false, false, 0, 15);
        registerBlock(20, 'crying_obsidian', 50.0, 1200.0, 20, 1, false, true, 10, 15);

        // Sand and related (IDs 21-25)
        registerBlock(21, 'sand', 0.5, 0.5, 21, 1, false, false, 0, 15);
        registerBlock(22, 'red_sand', 0.5, 0.5, 22, 1, false, false, 0, 15);
        registerBlock(23, 'sandstone', 0.8, 0.8, 23, 1, false, false, 0, 15);
        registerBlock(24, 'chiseled_sandstone', 0.8, 0.8, 23, 1, false, false, 0, 15);
        registerBlock(25, 'cut_sandstone', 0.8, 0.8, 23, 1, false, false, 0, 15);

        // Wood and planks (IDs 26-41)
        registerBlock(26, 'oak_log', 2.0, 2.0, 26, 1, false, false, 0, 15);
        registerBlock(27, 'spruce_log', 2.0, 2.0, 27, 1, false, false, 0, 15);
        registerBlock(28, 'birch_log', 2.0, 2.0, 28, 1, false, false, 0, 15);
        registerBlock(29, 'jungle_log', 2.0, 2.0, 29, 1, false, false, 0, 15);
        registerBlock(30, 'acacia_log', 2.0, 2.0, 30, 1, false, false, 0, 15);
        registerBlock(31, 'dark_oak_log', 2.0, 2.0, 31, 1, false, false, 0, 15);
        registerBlock(32, 'oak_planks', 2.0, 2.0, 32, 1, false, false, 0, 15);
        registerBlock(33, 'spruce_planks', 2.0, 2.0, 33, 1, false, false, 0, 15);
        registerBlock(34, 'birch_planks', 2.0, 2.0, 34, 1, false, false, 0, 15);
        registerBlock(35, 'jungle_planks', 2.0, 2.0, 35, 1, false, false, 0, 15);
        registerBlock(36, 'acacia_planks', 2.0, 2.0, 36, 1, false, false, 0, 15);
        registerBlock(37, 'dark_oak_planks', 2.0, 2.0, 37, 1, false, false, 0, 15);
        registerBlock(38, 'oak_wood', 2.0, 2.0, 38, 1, false, false, 0, 15);
        registerBlock(39, 'spruce_wood', 2.0, 2.0, 39, 1, false, false, 0, 15);
        registerBlock(40, 'birch_wood', 2.0, 2.0, 40, 1, false, false, 0, 15);
        registerBlock(41, 'jungle_wood', 2.0, 2.0, 41, 1, false, false, 0, 15);

        // Stone bricks and related (IDs 42-46)
        registerBlock(42, 'stone_bricks', 1.5, 6.0, 42, 1, false, false, 0, 15);
        registerBlock(43, 'cracked_stone_bricks', 1.5, 6.0, 42, 1, false, false, 0, 15);
        registerBlock(44, 'mossy_stone_bricks', 1.5, 6.0, 42, 1, false, false, 0, 15);
        registerBlock(45, 'chiseled_stone_bricks', 1.5, 6.0, 42, 1, false, false, 0, 15);
        registerBlock(46, 'end_stone_bricks', 3.0, 9.0, 46, 1, false, false, 0, 15);

        // Glass and transparent blocks (IDs 47-54)
        registerBlock(47, 'glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(48, 'tinted_glass', 1.5, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(49, 'glass_pane', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(50, 'ice', 0.5, 0.5, -1, 0, true, false, 0, 0);
        registerBlock(51, 'blue_ice', 2.8, 3.0, -1, 0, true, false, 0, 0);
        registerBlock(52, 'snow_layer', 0.1, 0.1, 53, 1, true, false, 0, 0);
        registerBlock(53, 'snowBlock', 0.2, 0.2, 53, 1, false, false, 0, 15);
        registerBlock(54, 'piston_head', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // Wool colors (IDs 55-70) — 16 colors
        registerBlock(55, 'white_wool', 0.8, 0.8, 55, 1, false, false, 0, 15);
        registerBlock(56, 'orange_wool', 0.8, 0.8, 56, 1, false, false, 0, 15);
        registerBlock(57, 'magenta_wool', 0.8, 0.8, 57, 1, false, false, 0, 15);
        registerBlock(58, 'light_blue_wool', 0.8, 0.8, 58, 1, false, false, 0, 15);
        registerBlock(59, 'yellow_wool', 0.8, 0.8, 59, 1, false, false, 0, 15);
        registerBlock(60, 'lime_wool', 0.8, 0.8, 60, 1, false, false, 0, 15);
        registerBlock(61, 'pink_wool', 0.8, 0.8, 61, 1, false, false, 0, 15);
        registerBlock(62, 'gray_wool', 0.8, 0.8, 62, 1, false, false, 0, 15);
        registerBlock(63, 'light_gray_wool', 0.8, 0.8, 63, 1, false, false, 0, 15);
        registerBlock(64, 'cyan_wool', 0.8, 0.8, 64, 1, false, false, 0, 15);
        registerBlock(65, 'purple_wool', 0.8, 0.8, 65, 1, false, false, 0, 15);
        registerBlock(66, 'blue_wool', 0.8, 0.8, 66, 1, false, false, 0, 15);
        registerBlock(67, 'brown_wool', 0.8, 0.8, 67, 1, false, false, 0, 15);
        registerBlock(68, 'green_wool', 0.8, 0.8, 68, 1, false, false, 0, 15);
        registerBlock(69, 'red_wool', 0.8, 0.8, 69, 1, false, false, 0, 15);
        registerBlock(70, 'black_wool', 0.8, 0.8, 70, 1, false, false, 0, 15);

        // Concrete and dyed blocks (IDs 71-86) — 16 colors each
        registerBlock(71, 'white_concrete', 1.8, 1.8, 71, 1, false, false, 0, 15);
        registerBlock(72, 'orange_concrete', 1.8, 1.8, 72, 1, false, false, 0, 15);
        registerBlock(73, 'magenta_concrete', 1.8, 1.8, 73, 1, false, false, 0, 15);
        registerBlock(74, 'light_blue_concrete', 1.8, 1.8, 74, 1, false, false, 0, 15);
        registerBlock(75, 'yellow_concrete', 1.8, 1.8, 75, 1, false, false, 0, 15);
        registerBlock(76, 'lime_concrete', 1.8, 1.8, 76, 1, false, false, 0, 15);
        registerBlock(77, 'pink_concrete', 1.8, 1.8, 77, 1, false, false, 0, 15);
        registerBlock(78, 'gray_concrete', 1.8, 1.8, 78, 1, false, false, 0, 15);
        registerBlock(79, 'light_gray_concrete', 1.8, 1.8, 79, 1, false, false, 0, 15);
        registerBlock(80, 'cyan_concrete', 1.8, 1.8, 80, 1, false, false, 0, 15);
        registerBlock(81, 'purple_concrete', 1.8, 1.8, 81, 1, false, false, 0, 15);
        registerBlock(82, 'blue_concrete', 1.8, 1.8, 82, 1, false, false, 0, 15);
        registerBlock(83, 'brown_concrete', 1.8, 1.8, 83, 1, false, false, 0, 15);
        registerBlock(84, 'green_concrete', 1.8, 1.8, 84, 1, false, false, 0, 15);
        registerBlock(85, 'red_concrete', 1.8, 1.8, 85, 1, false, false, 0, 15);
        registerBlock(86, 'black_concrete', 1.8, 1.8, 86, 1, false, false, 0, 15);

        // Concrete powder (IDs 87-102) — same colors as concrete
        registerBlock(87, 'white_concrete_powder', 0.8, 0.8, 87, 1, false, false, 0, 15);
        registerBlock(88, 'orange_concrete_powder', 0.8, 0.8, 88, 1, false, false, 0, 15);
        registerBlock(89, 'magenta_concrete_powder', 0.8, 0.8, 89, 1, false, false, 0, 15);
        registerBlock(90, 'light_blue_concrete_powder', 0.8, 0.8, 90, 1, false, false, 0, 15);
        registerBlock(91, 'yellow_concrete_powder', 0.8, 0.8, 91, 1, false, false, 0, 15);
        registerBlock(92, 'lime_concrete_powder', 0.8, 0.8, 92, 1, false, false, 0, 15);
        registerBlock(93, 'pink_concrete_powder', 0.8, 0.8, 93, 1, false, false, 0, 15);
        registerBlock(94, 'gray_concrete_powder', 0.8, 0.8, 94, 1, false, false, 0, 15);
        registerBlock(95, 'light_gray_concrete_powder', 0.8, 0.8, 95, 1, false, false, 0, 15);
        registerBlock(96, 'cyan_concrete_powder', 0.8, 0.8, 96, 1, false, false, 0, 15);
        registerBlock(97, 'purple_concrete_powder', 0.8, 0.8, 97, 1, false, false, 0, 15);
        registerBlock(98, 'blue_concrete_powder', 0.8, 0.8, 98, 1, false, false, 0, 15);
        registerBlock(99, 'brown_concrete_powder', 0.8, 0.8, 99, 1, false, false, 0, 15);
        registerBlock(100, 'green_concrete_powder', 0.8, 0.8, 100, 1, false, false, 0, 15);
        registerBlock(101, 'red_concrete_powder', 0.8, 0.8, 101, 1, false, false, 0, 15);
        registerBlock(102, 'black_concrete_powder', 0.8, 0.8, 102, 1, false, false, 0, 15);

        // Terracotta / clay (IDs 103-105)
        registerBlock(103, 'terracotta', 1.8, 1.8, 103, 1, false, false, 0, 15);
        registerBlock(104, 'white_terracotta', 1.8, 1.8, 104, 1, false, false, 0, 15);
        registerBlock(105, 'red_terracotta', 1.8, 1.8, 105, 1, false, false, 0, 15);

        // Brick and stone variants (IDs 106-114)
        registerBlock(106, 'brick', 2.0, 6.0, 106, 1, false, false, 0, 15);
        registerBlock(107, 'bricks', 2.0, 6.0, 106, 1, false, false, 0, 15);
        registerBlock(108, 'nether_bricks', 2.0, 6.0, 108, 1, false, false, 0, 15);
        registerBlock(109, 'nether_brick_fence', 2.0, 6.0, 108, 1, false, false, 0, 15);
        registerBlock(110, 'nether_brick_stairs', 2.0, 6.0, 108, 1, false, false, 0, 15);
        registerBlock(111, 'red_nether_bricks', 2.0, 6.0, 111, 1, false, false, 0, 15);
        registerBlock(112, 'basalt', 1.4, 6.0, 112, 1, false, false, 0, 15);
        registerBlock(113, 'polished_basalt', 1.4, 6.0, 112, 1, false, false, 0, 15);
        registerBlock(114, 'blackstone', 1.4, 6.0, 114, 1, false, false, 0, 15);

        // Smooth stone and related (IDs 115-119)
        registerBlock(115, 'smooth_stone', 2.0, 6.0, 115, 1, false, false, 0, 15);
        registerBlock(116, 'smooth_stone_slab', 2.0, 6.0, 116, 1, false, false, 0, 15);
        registerBlock(117, 'polished_diorite', 1.5, 6.0, 117, 1, false, false, 0, 15);
        registerBlock(118, 'polished_andesite', 1.5, 6.0, 118, 1, false, false, 0, 15);
        registerBlock(119, 'polished_granite', 1.5, 6.0, 119, 1, false, false, 0, 15);

        // Leaves (IDs 120-125)
        registerBlock(120, 'oak_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(121, 'spruce_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(122, 'birch_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(123, 'jungle_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(124, 'acacia_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(125, 'dark_oak_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);

        // Sponges (IDs 126-127)
        registerBlock(126, 'sponge', 0.6, 0.6, 126, 1, false, false, 0, 15);
        registerBlock(127, 'wet_sponge', 0.6, 0.6, 126, 1, false, false, 0, 15);

        // Honey block (ID 128)
        registerBlock(128, 'honey_block', 0.5, 0.5, -1, 0, false, false, 0, 15);

        // Slabs (IDs 129-136) — half-height blocks
        registerBlock(129, 'stone_slab', 2.0, 6.0, 129, 1, false, false, 0, 15);
        registerBlock(130, 'smooth_stone_slab', 2.0, 6.0, 130, 1, false, false, 0, 15);
        registerBlock(131, 'oak_slab', 2.0, 2.0, 131, 1, false, false, 0, 15);
        registerBlock(132, 'spruce_slab', 2.0, 2.0, 132, 1, false, false, 0, 15);
        registerBlock(133, 'birch_slab', 2.0, 2.0, 133, 1, false, false, 0, 15);
        registerBlock(134, 'cobblestone_slab', 2.0, 6.0, 134, 1, false, false, 0, 15);
        registerBlock(135, 'brick_slab', 2.0, 6.0, 135, 1, false, false, 0, 15);

        // Stairs (IDs 137-144)
        registerBlock(137, 'stone_bricks_stairs', 1.5, 6.0, 137, 1, false, false, 0, 15);
        registerBlock(138, 'oak_stairs', 2.0, 2.0, 138, 1, false, false, 0, 15);
        registerBlock(139, 'cobblestone_stairs', 2.0, 6.0, 139, 1, false, false, 0, 15);
        registerBlock(140, 'brick_stairs', 2.0, 6.0, 140, 1, false, false, 0, 15);
        registerBlock(141, 'smooth_stone_stairs', 2.0, 6.0, 141, 1, false, false, 0, 15);
        registerBlock(142, 'sandstone_stairs', 0.8, 0.8, 142, 1, false, false, 0, 15);

        // Buttons and levers (IDs 145-149)
        registerBlock(145, 'stone_button', 0.5, 0.5, -1, 0, true, false, 0, 0);
        registerBlock(146, 'oak_button', 0.5, 0.5, -1, 0, true, false, 0, 0);
        registerBlock(147, 'lever', 0.5, 0.5, -1, 0, true, false, 0, 0);
        registerBlock(148, 'stone_pressure_plate', 0.5, 0.5, -1, 0, false, false, 0, 0);
        registerBlock(149, 'oak_pressure_plate', 0.5, 0.5, -1, 0, false, false, 0, 0);

        // Doors (IDs 150-152)
        registerBlock(150, 'oak_door', 3.0, 3.0, 150, 1, true, false, 0, 0);
        registerBlock(151, 'iron_door', 5.0, 6.0, 151, 1, true, false, 0, 0);
        registerBlock(152, 'spruce_door', 3.0, 3.0, 152, 1, true, false, 0, 0);

        // Fences and walls (IDs 153-159)
        registerBlock(153, 'oak_fence', 2.0, 6.0, 153, 1, false, false, 0, 15);
        registerBlock(154, 'cobblestone_wall', 2.0, 6.0, 154, 1, false, false, 0, 15);
        registerBlock(155, 'brick_wall', 2.0, 6.0, 155, 1, false, false, 0, 15);
        registerBlock(156, 'nether_brick_wall', 2.0, 6.0, 156, 1, false, false, 0, 15);
        registerBlock(157, 'sandstone_wall', 0.8, 0.8, 157, 1, false, false, 0, 15);
        registerBlock(158, 'end_rod', 0.0, 0.0, 158, 1, false, true, 1, 0);
        registerBlock(159, 'chain', 2.0, 3.0, 159, 1, false, false, 0, 0);

        // Crops and plants (IDs 160-172)
        registerBlock(160, 'grass', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(161, 'tall_grass', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(162, 'fern', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(163, 'poppy', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(164, 'blue_orchid', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(165, 'dandelion', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(166, 'rose_bush', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(167, 'sunflower', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(168, 'lily_pad', 0.0, 0.0, 168, 1, true, false, 0, 0);
        registerBlock(169, 'glow_lichen', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(170, 'dead_bush', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(171, 'vine', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(172, 'cave_vines', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // Sugar cane and reeds (IDs 173-174)
        registerBlock(173, 'sugar_cane', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(174, 'reeds', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // Redstone components (IDs 175-182)
        registerBlock(175, 'redstone_wire', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(176, 'redstone_torch', 0.0, 0.0, -1, 0, false, true, 7, 0);
        registerBlock(177, 'redstone_lamp', 0.8, 6.0, 177, 1, false, false, 0, 15);
        registerBlock(178, 'lit_redstone_lamp', 0.8, 6.0, 178, 1, false, true, 15, 15);
        registerBlock(179, 'dispenser', 3.0, 6.0, 179, 1, false, false, 0, 15);
        registerBlock(180, 'dropper', 3.0, 6.0, 180, 1, false, false, 0, 15);
        registerBlock(181, 'observer', 3.0, 3.0, 181, 1, false, false, 0, 15);
        registerBlock(182, 'repeater', 0.0, 0.0, 182, 1, false, false, 0, 15);

        // Pistons and sticky pistons (IDs 183-184)
        registerBlock(183, 'piston', 3.0, 6.0, 183, 1, false, false, 0, 15);
        registerBlock(184, 'sticky_piston', 3.0, 6.0, 183, 1, false, false, 0, 15);

        // TNT (ID 185)
        registerBlock(185, 'tnt', 0.0, 6.0, -1, 0, false, false, 0, 15);

        // Books and writing (IDs 186-188)
        registerBlock(186, 'bookshelf', 2.0, 6.0, 186, 1, false, false, 0, 15);
        registerBlock(187, 'chiseled_bookshelf', 2.0, 6.0, 187, 1, false, false, 0, 15);
        registerBlock(188, 'lectern', 2.0, 6.0, -1, 0, false, false, 0, 0);

        // Chests and storage (IDs 189-192)
        registerBlock(189, 'chest', 2.5, 6.0, 189, 1, false, false, 0, 15);
        registerBlock(190, 'trapped_chest', 2.5, 6.0, 190, 1, false, false, 0, 15);
        registerBlock(191, 'ender_chest', 22.5, 600.0, -1, 0, false, true, 11, 15);
        registerBlock(192, 'barrel', 2.5, 6.0, 192, 1, false, false, 0, 15);

        // Furnaces (IDs 193-196)
        registerBlock(193, 'furnace', 3.5, 6.0, 193, 1, false, false, 0, 15);
        registerBlock(194, 'lit_furnace', 3.5, 6.0, 193, 1, false, true, 13, 15);
        registerBlock(195, 'blast_furnace', 3.5, 6.0, 195, 1, false, false, 0, 15);
        registerBlock(196, 'smoker', 3.5, 6.0, 196, 1, false, false, 0, 15);

        // Tables and workbenches (IDs 197-200)
        registerBlock(197, 'crafting_table', 2.0, 6.0, 197, 1, false, false, 0, 15);
        registerBlock(198, 'anvil', 5.0, 1200.0, 198, 1, false, false, 0, 15);
        registerBlock(199, 'chipped_anvil', 5.0, 1200.0, 199, 1, false, false, 0, 15);
        registerBlock(200, 'damaged_anvil', 5.0, 1200.0, 200, 1, false, false, 0, 15);

        // Enchanting and brewing (IDs 201-203)
        registerBlock(201, 'enchanting_table', 5.0, 1200.0, -1, 0, false, true, 7, 0);
        registerBlock(202, 'brewing_stand', 0.5, 0.5, -1, 0, false, false, 1, 0);
        registerBlock(203, 'cauldron', 0.5, 0.5, -1, 0, false, false, 0, 0);

        // Beds (IDs 204-205)
        registerBlock(204, 'oak_bed', 0.2, 0.2, -1, 0, false, false, 0, 0);
        registerBlock(205, 'red_bed', 0.2, 0.2, -1, 0, false, false, 0, 0);

        // Paintings (ID 206)
        registerBlock(206, 'painting', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // Signs (IDs 207-210)
        registerBlock(207, 'oak_sign', 2.0, 2.0, 207, 1, false, false, 0, 0);
        registerBlock(208, 'spruce_sign', 2.0, 2.0, 208, 1, false, false, 0, 0);
        registerBlock(209, 'birch_sign', 2.0, 2.0, 209, 1, false, false, 0, 0);
        registerBlock(210, 'acacia_sign', 2.0, 2.0, 210, 1, false, false, 0, 0);

        // Mirrors and portals (IDs 211-212)
        registerBlock(211, 'mirror', 0.5, 0.5, -1, 0, false, false, 0, 0);
        registerBlock(212, 'end_portal_frame', 0.0, 3600000.0, -1, 0, false, true, 1, 15);

        // Monster spawner (ID 213)
        registerBlock(213, 'mob_spawner', 5.0, 3600000.0, -1, 0, false, false, 0, 15);

        // Water and lava (IDs 214-215)
        registerBlock(214, 'water', 0.0, 100.0, -1, 0, true, false, 0, 1);
        registerBlock(215, 'lava', 0.0, 100.0, -1, 0, true, true, 15, 1);

        // Ores and items (IDs 216-231)
        registerBlock(216, 'coal', 1.0, 2.0, 216, 1, false, false, 0, 15);
        registerBlock(217, 'raw_iron', 1.0, 2.0, 217, 1, false, false, 0, 15);
        registerBlock(218, 'raw_gold', 1.0, 2.0, 218, 1, false, false, 0, 15);
        registerBlock(219, 'raw_diamond', 1.0, 2.0, 219, 1, false, false, 0, 15);
        registerBlock(220, 'diamond', 3.0, 2.0, 220, 1, false, false, 0, 15);
        registerBlock(221, 'emerald', 3.0, 2.0, 221, 1, false, false, 0, 15);
        registerBlock(222, 'lapis_lazuli', 1.0, 2.0, 222, 1, false, false, 0, 15);
        registerBlock(223, 'iron_ingot', 1.0, 2.0, 223, 1, false, false, 0, 15);
        registerBlock(224, 'gold_ingot', 1.0, 2.0, 224, 1, false, false, 0, 15);
        registerBlock(225, 'netherite_ingot', 1.0, 2.0, -1, 0, false, false, 0, 15);
        registerBlock(226, 'netherite_block', 1200.0, 1200.0, 225, 1, false, false, 0, 15);
        registerBlock(227, 'gold_block', 3.0, 6.0, 227, 1, false, true, 0, 15);
        registerBlock(228, 'iron_block', 3.0, 6.0, 228, 1, false, false, 0, 15);
        registerBlock(229, 'diamond_block', 3.0, 6.0, 229, 1, false, false, 0, 15);
        registerBlock(230, 'emerald_block', 3.0, 6.0, 230, 1, false, false, 0, 15);

        // Redstone dust and blocks (IDs 231-235)
        registerBlock(231, 'redstone_dust', 0.0, 0.0, -1, 0, true, true, 9, 0);
        registerBlock(232, 'redstone_block', 3.0, 6.0, 232, 1, false, false, 0, 15);
        registerBlock(234, 'lapis_block', 3.0, 6.0, 234, 1, false, false, 0, 15);
        registerBlock(235, 'coal_block', 3.0, 6.0, 235, 1, false, false, 0, 15);

        // Quartz blocks (IDs 236-239)
        registerBlock(236, 'quartz_block', 1.0, 6.0, 236, 1, false, false, 0, 15);
        registerBlock(237, 'chiseled_quartz_block', 1.0, 6.0, 236, 1, false, false, 0, 15);
        registerBlock(238, 'quartz_pillar', 1.0, 6.0, 236, 1, false, false, 0, 15);
        registerBlock(239, 'quartz_bricks', 1.0, 6.0, 236, 1, false, false, 0, 15);

        // Nether quartz (ID 240)
        registerBlock(240, 'nether_quartz_ore', 3.0, 6.0, 240, 1, false, false, 0, 15);

        // Hay bale (ID 241)
        registerBlock(241, 'hay_block', 0.9, 0.5, -1, 0, false, false, 0, 15);

        // Cocoa beans (ID 242)
        registerBlock(242, 'cocoa', 0.2, 0.2, -1, 0, true, false, 0, 0);

        // Decorative glass (IDs 243-258) — 16 colored stained glass
        registerBlock(243, 'white_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(244, 'orange_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(245, 'magenta_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(246, 'light_blue_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(247, 'yellow_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(248, 'lime_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(249, 'pink_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(250, 'gray_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(251, 'light_gray_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(252, 'cyan_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(253, 'purple_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(254, 'blue_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(255, 'brown_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(256, 'green_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(257, 'red_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(258, 'black_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);

        // Nether blocks (IDs 259-276)
        registerBlock(259, 'netherrack', 1.0, 0.0, 259, 1, false, false, 0, 15);
        registerBlock(260, 'soul_sand', 0.5, 0.5, 260, 1, false, false, 0, 15);
        registerBlock(261, 'soul_soil', 0.8, 0.8, 261, 1, false, false, 0, 15);
        registerBlock(262, 'gilded_blackstone', 1.5, 6.0, 262, 1, false, false, 0, 15);
        registerBlock(263, 'polished_blackstone', 2.0, 6.0, 263, 1, false, false, 0, 15);
        registerBlock(264, 'polished_blackstone_bricks', 2.0, 6.0, 264, 1, false, false, 0, 15);
        registerBlock(265, 'nether_wart_block', 1.0, 0.0, 265, 1, false, false, 0, 15);
        registerBlock(266, 'warped_stem', 1.0, 0.0, 266, 1, false, false, 0, 15);
        registerBlock(267, 'warped_hyphae', 1.0, 0.0, 267, 1, false, false, 0, 15);
        registerBlock(268, 'warped_planks', 1.0, 0.0, 268, 1, false, false, 0, 15);
        registerBlock(269, 'warped_nylium', 1.0, 0.0, 269, 1, false, false, 0, 15);
        registerBlock(270, 'crimson_stem', 1.0, 0.0, 270, 1, false, false, 0, 15);
        registerBlock(271, 'crimson_hyphae', 1.0, 0.0, 271, 1, false, false, 0, 15);
        registerBlock(272, 'crimson_planks', 1.0, 0.0, 272, 1, false, false, 0, 15);
        registerBlock(273, 'crimson_nylium', 1.0, 0.0, 273, 1, false, false, 0, 15);
        registerBlock(274, 'nether_gold_ore', 3.0, 6.0, 274, 1, false, false, 0, 15);
        registerBlock(275, 'ancient_debris', 30.0, 1200.0, 275, 1, false, false, 0, 15);
        registerBlock(276, 'magma', 0.5, 0.5, 276, 1, false, false, 0, 15);

        // Respawn anchor & portal blocks (IDs 277-279)
        registerBlock(277, 'respawn_anchor', 0.0, 1200.0, -1, 0, false, true, 11, 15);
        registerBlock(278, 'nether_portal', 0.0, 0.0, -1, 0, true, true, 11, 0);
        registerBlock(279, 'end_portal', 0.0, 0.0, -1, 0, true, true, 15, 0);

        // Clouds (ID 286) — transparent decorative block for sky rendering
        registerBlock(286, 'cloud', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // End blocks (IDs 287-294)
        registerBlock(287, 'chorus_plant', 0.4, 0.4, 287, 1, false, false, 0, 15);
        registerBlock(288, 'chorus_flower', 0.4, 0.4, -1, 0, false, false, 0, 15);
        registerBlock(289, 'purpur_block', 1.5, 3.0, 289, 1, false, false, 0, 15);
        registerBlock(290, 'purpur_pillar', 1.5, 3.0, 289, 1, false, false, 0, 15);
        registerBlock(291, 'end_stone_brick_wall', 3.0, 9.0, 291, 1, false, false, 0, 15);
        registerBlock(292, 'end_stone_bricks_stairs', 3.0, 9.0, 292, 1, false, false, 0, 15);
        registerBlock(293, 'shroomlight', 1.0, 0.0, 293, 1, false, true, 15, 15);
        registerBlock(294, 'pitcher_pod', 0.0, 0.0, -1, 0, true, false, 0, 0);

        /**
         * Get a block by its ID.
         * @param {number} id - Block ID.
         * @returns {Donkeycraft.Block|null} The block definition, or null if not found.
         */
        function getBlockById(id) {
            return _blocks[id] || null;
        }

        /**
         * Get a block by its name.
         * @param {string} name - Block name (e.g., "stone").
         * @returns {Donkeycraft.Block|null} The block definition, or null if not found.
         */
        function getBlockByName(name) {
            return _byName[name] || null;
        }

        /**
         * Get all registered blocks as an array.
         * @returns {Donkeycraft.Block[]}
         */
        function getAllBlocks() {
            var result = [];
            for (var key in _blocks) {
                if (_blocks.hasOwnProperty(key)) {
                    result.push(_blocks[key]);
                }
            }
            return result;
        }

        /**
         * Get the total number of registered blocks.
         * @returns {number}
         */
        function getBlockCount() {
            return _nextId;
        }

        /**
         * Check if a block ID is transparent.
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isTransparent(id) {
            var block = _blocks[id];
            return block !== undefined && block.transparent;
        }

        /**
         * Check if a block ID is solid (has a full collision box).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isSolid(id) {
            var block = _blocks[id];
            return block !== undefined && !block.transparent && block.hardness >= 0;
        }

        /**
         * Check if a block ID is opaque (fully blocks light).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isOpaque(id) {
            var block = _blocks[id];
            return block !== undefined && block.lightOpacity >= 15;
        }

        /**
         * Check if a block ID is a liquid (water or lava).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isLiquid(id) {
            var block = _blocks[id];
            return block !== undefined && (block.name === 'water' || block.name === 'lava');
        }

        /**
         * Check if a block ID is replaceable (grass, flowers, plants, etc.).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isReplaceable(id) {
            var block = _blocks[id];
            if (block === undefined) return false;
            if (block.hardness < 0) return true;
            if (block.dropBlockId === -1 && block.transparent === true && block.lightOpacity === 0) return true;
            return false;
        }

        /**
         * Get the drop block ID for a given block ID.
         * @param {number} id - Block ID.
         * @returns {number} The drop block ID (-1 if none).
         */
        function getDropBlockId(id) {
            var block = _blocks[id];
            return block !== undefined ? block.dropBlockId : -1;
        }

        /**
         * Get the drop item count for a given block ID.
         * @param {number} id - Block ID.
         * @returns {number} Number of items dropped.
         */
        function getDropItemCount(id) {
            var block = _blocks[id];
            return block !== undefined ? block.dropItemCount : 0;
        }

        return {
            registerBlock: registerBlock,
            getBlockById: getBlockById,
            getBlockByName: getBlockByName,
            getAllBlocks: getAllBlocks,
            getBlockCount: getBlockCount,
            isTransparent: isTransparent,
            isSolid: isSolid,
            isOpaque: isOpaque,
            isLiquid: isLiquid,
            isReplaceable: isReplaceable,
            getDropBlockId: getDropBlockId,
            getDropItemCount: getDropItemCount
        };
    })();

})();