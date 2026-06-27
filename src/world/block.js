// Donkeycraft — Block Definitions
// All 256+ vanilla Minecraft block definitions with IDs, names, hardness, blast resistance, drops, transparency flags.
(function() {
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
    Donkeycraft.Block = function(id, name, hardness, blastResistance, dropBlockId, dropItemCount, transparent, emissive, lightLevel, lightOpacity) {
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
    Donkeycraft.BlockRegistry = (function() {
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
        registerBlock(8, 'grass_block', 0.6, 0.6, 7, 1, false, false, 0, 15);
        registerBlock(9, 'gravel', 0.6, 0.5, 9, 1, false, false, 0, 15);

        // Bedrock (ID 1000) — world boundary block, unbreakable
        registerBlock(1000, 'bedrock', -1, 3600000.0, -1, 0, false, false, 0, 15);

        // Ores (IDs 10-18)
        registerBlock(10, 'coal_ore', 3.0, 6.0, 20, 1, false, false, 0, 15);
        registerBlock(11, 'iron_ore', 3.0, 6.0, 21, 1, false, false, 0, 15);
        registerBlock(12, 'gold_ore', 3.0, 6.0, 22, 1, false, false, 0, 15);
        registerBlock(13, 'diamond_ore', 3.0, 6.0, 23, 1, false, false, 0, 15);
        registerBlock(14, 'emerald_ore', 3.0, 6.0, 24, 1, false, false, 0, 15);
        registerBlock(15, 'redstone_ore', 3.0, 6.0, -1, 0, false, false, 0, 15);
        registerBlock(16, 'lapis_ore', 3.0, 6.0, 25, 1, false, false, 0, 15);
        registerBlock(17, 'obsidian', 50.0, 1200.0, 26, 1, false, false, 0, 15);
        registerBlock(18, 'crying_obsidian', 50.0, 1200.0, 26, 1, false, true, 10, 15);

        // Sand and related (IDs 19-23)
        registerBlock(19, 'sand', 0.5, 0.5, 19, 1, false, false, 0, 15);
        registerBlock(20, 'red_sand', 0.5, 0.5, 20, 1, false, false, 0, 15);
        registerBlock(21, 'sandstone', 0.8, 0.8, 21, 1, false, false, 0, 15);
        registerBlock(22, 'chiseled_sandstone', 0.8, 0.8, 21, 1, false, false, 0, 15);
        registerBlock(23, 'cut_sandstone', 0.8, 0.8, 21, 1, false, false, 0, 15);

        // Wood and planks (IDs 24-39)
        // Each log drops its corresponding plank type (4 planks per log)
        registerBlock(24, 'oak_log', 2.0, 2.0, 30, 1, false, false, 0, 15);
        registerBlock(25, 'spruce_log', 2.0, 2.0, 31, 1, false, false, 0, 15);
        registerBlock(26, 'birch_log', 2.0, 2.0, 32, 1, false, false, 0, 15);
        registerBlock(27, 'jungle_log', 2.0, 2.0, 33, 1, false, false, 0, 15);
        registerBlock(28, 'acacia_log', 2.0, 2.0, 34, 1, false, false, 0, 15);
        registerBlock(29, 'dark_oak_log', 2.0, 2.0, 35, 1, false, false, 0, 15);
        registerBlock(30, 'oak_planks', 2.0, 2.0, 31, 1, false, false, 0, 15);
        registerBlock(31, 'spruce_planks', 2.0, 2.0, 32, 1, false, false, 0, 15);
        registerBlock(32, 'birch_planks', 2.0, 2.0, 33, 1, false, false, 0, 15);
        registerBlock(33, 'jungle_planks', 2.0, 2.0, 34, 1, false, false, 0, 15);
        registerBlock(34, 'acacia_planks', 2.0, 2.0, 35, 1, false, false, 0, 15);
        registerBlock(35, 'dark_oak_planks', 2.0, 2.0, 36, 1, false, false, 0, 15);
        registerBlock(36, 'oak_wood', 2.0, 2.0, 31, 1, false, false, 0, 15);
        registerBlock(37, 'spruce_wood', 2.0, 2.0, 32, 1, false, false, 0, 15);
        registerBlock(38, 'birch_wood', 2.0, 2.0, 33, 1, false, false, 0, 15);
        registerBlock(39, 'jungle_wood', 2.0, 2.0, 34, 1, false, false, 0, 15);

        // Stone bricks and related (IDs 40-44)
        registerBlock(40, 'stone_bricks', 1.5, 6.0, 40, 1, false, false, 0, 15);
        registerBlock(41, 'cracked_stone_bricks', 1.5, 6.0, 40, 1, false, false, 0, 15);
        registerBlock(42, 'mossy_stone_bricks', 1.5, 6.0, 40, 1, false, false, 0, 15);
        registerBlock(43, 'chiseled_stone_bricks', 1.5, 6.0, 40, 1, false, false, 0, 15);
        registerBlock(44, 'end_stone_bricks', 3.0, 9.0, 45, 1, false, false, 0, 15);

        // Glass and transparent blocks (IDs 45-52)
        registerBlock(45, 'glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(46, 'tinted_glass', 1.5, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(47, 'glass_pane', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(48, 'ice', 0.5, 0.5, -1, 0, true, false, 0, 0);
        registerBlock(49, 'blue_ice', 2.8, 3.0, -1, 0, true, false, 0, 0);
        registerBlock(50, 'snow_layer', 0.1, 0.1, 51, 1, true, false, 0, 0);
        registerBlock(51, 'snow_block', 0.2, 0.2, 51, 1, false, false, 0, 15);
        registerBlock(52, 'piston_head', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // Wool colors (IDs 53-68) — 16 colors
        registerBlock(53, 'white_wool', 0.8, 0.8, 53, 1, false, false, 0, 15);
        registerBlock(54, 'orange_wool', 0.8, 0.8, 54, 1, false, false, 0, 15);
        registerBlock(55, 'magenta_wool', 0.8, 0.8, 55, 1, false, false, 0, 15);
        registerBlock(56, 'light_blue_wool', 0.8, 0.8, 56, 1, false, false, 0, 15);
        registerBlock(57, 'yellow_wool', 0.8, 0.8, 57, 1, false, false, 0, 15);
        registerBlock(58, 'lime_wool', 0.8, 0.8, 58, 1, false, false, 0, 15);
        registerBlock(59, 'pink_wool', 0.8, 0.8, 59, 1, false, false, 0, 15);
        registerBlock(60, 'gray_wool', 0.8, 0.8, 60, 1, false, false, 0, 15);
        registerBlock(61, 'light_gray_wool', 0.8, 0.8, 61, 1, false, false, 0, 15);
        registerBlock(62, 'cyan_wool', 0.8, 0.8, 62, 1, false, false, 0, 15);
        registerBlock(63, 'purple_wool', 0.8, 0.8, 63, 1, false, false, 0, 15);
        registerBlock(64, 'blue_wool', 0.8, 0.8, 64, 1, false, false, 0, 15);
        registerBlock(65, 'brown_wool', 0.8, 0.8, 65, 1, false, false, 0, 15);
        registerBlock(66, 'green_wool', 0.8, 0.8, 66, 1, false, false, 0, 15);
        registerBlock(67, 'red_wool', 0.8, 0.8, 67, 1, false, false, 0, 15);
        registerBlock(68, 'black_wool', 0.8, 0.8, 68, 1, false, false, 0, 15);

        // Concrete and dyed blocks (IDs 69-84) — 16 colors each
        registerBlock(69, 'white_concrete', 1.8, 1.8, 69, 1, false, false, 0, 15);
        registerBlock(70, 'orange_concrete', 1.8, 1.8, 70, 1, false, false, 0, 15);
        registerBlock(71, 'magenta_concrete', 1.8, 1.8, 71, 1, false, false, 0, 15);
        registerBlock(72, 'light_blue_concrete', 1.8, 1.8, 72, 1, false, false, 0, 15);
        registerBlock(73, 'yellow_concrete', 1.8, 1.8, 73, 1, false, false, 0, 15);
        registerBlock(74, 'lime_concrete', 1.8, 1.8, 74, 1, false, false, 0, 15);
        registerBlock(75, 'pink_concrete', 1.8, 1.8, 75, 1, false, false, 0, 15);
        registerBlock(76, 'gray_concrete', 1.8, 1.8, 76, 1, false, false, 0, 15);
        registerBlock(77, 'light_gray_concrete', 1.8, 1.8, 77, 1, false, false, 0, 15);
        registerBlock(78, 'cyan_concrete', 1.8, 1.8, 78, 1, false, false, 0, 15);
        registerBlock(79, 'purple_concrete', 1.8, 1.8, 79, 1, false, false, 0, 15);
        registerBlock(80, 'blue_concrete', 1.8, 1.8, 80, 1, false, false, 0, 15);
        registerBlock(81, 'brown_concrete', 1.8, 1.8, 81, 1, false, false, 0, 15);
        registerBlock(82, 'green_concrete', 1.8, 1.8, 82, 1, false, false, 0, 15);
        registerBlock(83, 'red_concrete', 1.8, 1.8, 83, 1, false, false, 0, 15);
        registerBlock(84, 'black_concrete', 1.8, 1.8, 84, 1, false, false, 0, 15);

        // Concrete powder (IDs 85-100) — same colors as concrete
        registerBlock(85, 'white_concrete_powder', 0.8, 0.8, 85, 1, false, false, 0, 15);
        registerBlock(86, 'orange_concrete_powder', 0.8, 0.8, 86, 1, false, false, 0, 15);
        registerBlock(87, 'magenta_concrete_powder', 0.8, 0.8, 87, 1, false, false, 0, 15);
        registerBlock(88, 'light_blue_concrete_powder', 0.8, 0.8, 88, 1, false, false, 0, 15);
        registerBlock(89, 'yellow_concrete_powder', 0.8, 0.8, 89, 1, false, false, 0, 15);
        registerBlock(90, 'lime_concrete_powder', 0.8, 0.8, 90, 1, false, false, 0, 15);
        registerBlock(91, 'pink_concrete_powder', 0.8, 0.8, 91, 1, false, false, 0, 15);
        registerBlock(92, 'gray_concrete_powder', 0.8, 0.8, 92, 1, false, false, 0, 15);
        registerBlock(93, 'light_gray_concrete_powder', 0.8, 0.8, 93, 1, false, false, 0, 15);
        registerBlock(94, 'cyan_concrete_powder', 0.8, 0.8, 94, 1, false, false, 0, 15);
        registerBlock(95, 'purple_concrete_powder', 0.8, 0.8, 95, 1, false, false, 0, 15);
        registerBlock(96, 'blue_concrete_powder', 0.8, 0.8, 96, 1, false, false, 0, 15);
        registerBlock(97, 'brown_concrete_powder', 0.8, 0.8, 97, 1, false, false, 0, 15);
        registerBlock(98, 'green_concrete_powder', 0.8, 0.8, 98, 1, false, false, 0, 15);
        registerBlock(99, 'red_concrete_powder', 0.8, 0.8, 99, 1, false, false, 0, 15);
        registerBlock(100, 'black_concrete_powder', 0.8, 0.8, 100, 1, false, false, 0, 15);

        // Terracotta / clay (IDs 101-103)
        registerBlock(101, 'terracotta', 1.8, 1.8, 101, 1, false, false, 0, 15);
        registerBlock(102, 'white_terracotta', 1.8, 1.8, 102, 1, false, false, 0, 15);
        registerBlock(103, 'red_terracotta', 1.8, 1.8, 103, 1, false, false, 0, 15);

        // Brick and stone variants (IDs 104-112)
        registerBlock(104, 'brick', 2.0, 6.0, 104, 1, false, false, 0, 15);
        registerBlock(105, 'bricks', 2.0, 6.0, 104, 1, false, false, 0, 15);
        registerBlock(106, 'nether_bricks', 2.0, 6.0, 106, 1, false, false, 0, 15);
        registerBlock(107, 'nether_brick_fence', 2.0, 6.0, 106, 1, false, false, 0, 15);
        registerBlock(108, 'nether_brick_stairs', 2.0, 6.0, 106, 1, false, false, 0, 15);
        registerBlock(109, 'red_nether_bricks', 2.0, 6.0, 109, 1, false, false, 0, 15);
        registerBlock(110, 'basalt', 1.4, 6.0, 110, 1, false, false, 0, 15);
        registerBlock(111, 'polished_basalt', 1.4, 6.0, 110, 1, false, false, 0, 15);
        registerBlock(112, 'blackstone', 1.4, 6.0, 112, 1, false, false, 0, 15);

        // Smooth stone and related (IDs 113-117)
        registerBlock(113, 'smooth_stone', 2.0, 6.0, 113, 1, false, false, 0, 15);
        registerBlock(114, 'smooth_stone_slab', 2.0, 6.0, 113, 1, false, false, 0, 15);
        registerBlock(115, 'polished_diorite', 1.5, 6.0, 3, 1, false, false, 0, 15);
        registerBlock(116, 'polished_andesite', 1.5, 6.0, 4, 1, false, false, 0, 15);
        registerBlock(117, 'polished_granite', 1.5, 6.0, 2, 1, false, false, 0, 15);

        // Leaves (IDs 118-123)
        registerBlock(118, 'oak_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(119, 'spruce_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(120, 'birch_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(121, 'jungle_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(122, 'acacia_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);
        registerBlock(123, 'dark_oak_leaves', 0.2, 0.2, -1, 0, true, false, 0, 15);

        // Sponges (IDs 124-125)
        registerBlock(124, 'sponge', 0.6, 0.6, 124, 1, false, false, 0, 15);
        registerBlock(125, 'wet_sponge', 0.6, 0.6, 124, 1, false, false, 0, 15);

        // Honey block (ID 126)
        registerBlock(126, 'honey_block', 0.5, 0.5, -1, 0, false, false, 0, 15);

        // Slabs (IDs 127-134) — half-height blocks
        registerBlock(127, 'stone_slab', 2.0, 6.0, 127, 1, false, false, 0, 15);
        registerBlock(128, 'smooth_stone_slab', 2.0, 6.0, 113, 1, false, false, 0, 15);
        registerBlock(129, 'oak_slab', 2.0, 2.0, 130, 1, false, false, 0, 15);
        registerBlock(130, 'oak_planks', 2.0, 2.0, 130, 1, false, false, 0, 15);
        registerBlock(131, 'spruce_slab', 2.0, 2.0, 132, 1, false, false, 0, 15);
        registerBlock(132, 'birch_slab', 2.0, 2.0, 133, 1, false, false, 0, 15);
        registerBlock(133, 'cobblestone_slab', 2.0, 6.0, 134, 1, false, false, 0, 15);
        registerBlock(134, 'brick_slab', 2.0, 6.0, 104, 1, false, false, 0, 15);

        // Stairs (IDs 135-142)
        registerBlock(135, 'stone_bricks_stairs', 1.5, 6.0, 40, 1, false, false, 0, 15);
        registerBlock(136, 'oak_stairs', 2.0, 2.0, 136, 1, false, false, 0, 15);
        registerBlock(137, 'cobblestone_stairs', 2.0, 6.0, 138, 1, false, false, 0, 15);
        registerBlock(138, 'cobblestone', 2.0, 6.0, 138, 1, false, false, 0, 15);
        registerBlock(139, 'brick_stairs', 2.0, 6.0, 104, 1, false, false, 0, 15);
        // ID 140 reserved — was duplicate stone_bricks registration (removed)
        registerBlock(141, 'smooth_stone_stairs', 2.0, 6.0, 113, 1, false, false, 0, 15);
        registerBlock(142, 'sandstone_stairs', 0.8, 0.8, 21, 1, false, false, 0, 15);

        // Buttons and levers (IDs 143-147)
        registerBlock(143, 'stone_button', 0.5, 0.5, -1, 0, true, false, 0, 0);
        registerBlock(144, 'oak_button', 0.5, 0.5, -1, 0, true, false, 0, 0);
        registerBlock(145, 'lever', 0.5, 0.5, -1, 0, true, false, 0, 0);
        registerBlock(146, 'stone_pressure_plate', 0.5, 0.5, -1, 0, false, false, 0, 0);
        registerBlock(147, 'oak_pressure_plate', 0.5, 0.5, -1, 0, false, false, 0, 0);

        // Doors (IDs 148-150) — transparent because they're half-height
        registerBlock(148, 'oak_door', 3.0, 3.0, 148, 1, true, false, 0, 0);
        registerBlock(149, 'iron_door', 5.0, 6.0, 149, 1, true, false, 0, 0);
        registerBlock(150, 'spruce_door', 3.0, 3.0, 150, 1, true, false, 0, 0);

        // Fences and walls (IDs 151-157)
        registerBlock(151, 'oak_fence', 2.0, 6.0, 151, 1, false, false, 0, 15);
        registerBlock(152, 'cobblestone_wall', 2.0, 6.0, 138, 1, false, false, 0, 15);
        registerBlock(153, 'brick_wall', 2.0, 6.0, 104, 1, false, false, 0, 15);
        registerBlock(154, 'nether_brick_wall', 2.0, 6.0, 106, 1, false, false, 0, 15);
        registerBlock(155, 'sandstone_wall', 0.8, 0.8, 21, 1, false, false, 0, 15);
        registerBlock(156, 'end_rod', 0.0, 0.0, 156, 1, false, true, 1, 0);
        registerBlock(157, 'chain', 2.0, 3.0, 157, 1, false, false, 0, 0);

        // Crops and plants (IDs 158-170)
        registerBlock(158, 'grass', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(159, 'tall_grass', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(160, 'fern', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(161, 'poppy', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(162, 'blue_orchid', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(163, 'dandelion', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(164, 'rose_bush', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(165, 'sunflower', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(166, 'lily_pad', 0.0, 0.0, 166, 1, true, false, 0, 0);
        // ID 167 removed — was duplicate of fern (ID 160)
        registerBlock(168, 'dead_bush', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(169, 'vine', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(170, 'cave_vines', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // Sugar cane and reeds (IDs 171-172)
        registerBlock(171, 'sugar_cane', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(172, 'reeds', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // Redstone components (IDs 173-180)
        registerBlock(173, 'redstone_wire', 0.0, 0.0, -1, 0, true, false, 0, 0);
        registerBlock(174, 'redstone_torch', 0.0, 0.0, -1, 0, false, true, 7, 0);
        registerBlock(175, 'redstone_lamp', 0.8, 6.0, 176, 1, false, false, 0, 15);
        registerBlock(176, 'lit_redstone_lamp', 0.8, 6.0, 176, 1, false, true, 15, 15);
        registerBlock(177, 'dispenser', 3.0, 6.0, 177, 1, false, false, 0, 15);
        registerBlock(178, 'dropper', 3.0, 6.0, 178, 1, false, false, 0, 15);
        registerBlock(179, 'observer', 3.0, 3.0, 179, 1, false, false, 0, 15);
        registerBlock(180, 'repeater', 0.0, 0.0, 180, 1, false, false, 0, 15);

        // Pistons and sticky pistons (IDs 181-182)
        registerBlock(181, 'piston', 3.0, 6.0, 181, 1, false, false, 0, 15);
        registerBlock(182, 'sticky_piston', 3.0, 6.0, 181, 1, false, false, 0, 15);

        // TNT (ID 183)
        registerBlock(183, 'tnt', 0.0, 6.0, -1, 0, false, false, 0, 15);

        // Books and writing (IDs 184-186)
        registerBlock(184, 'bookshelf', 2.0, 6.0, 31, 1, false, false, 0, 15);
        registerBlock(185, 'chiseled_bookshelf', 2.0, 6.0, 185, 1, false, false, 0, 15);
        registerBlock(186, 'lectern', 2.0, 6.0, -1, 0, false, false, 0, 0);

        // Chests and storage (IDs 187-190)
        registerBlock(187, 'chest', 2.5, 6.0, 188, 1, false, false, 0, 15);
        registerBlock(188, 'trapped_chest', 2.5, 6.0, 188, 1, false, false, 0, 15);
        registerBlock(189, 'ender_chest', 22.5, 600.0, -1, 0, false, true, 11, 15);
        registerBlock(190, 'barrel', 2.5, 6.0, 190, 1, false, false, 0, 15);

        // Furnaces (IDs 191-193)
        registerBlock(191, 'furnace', 3.5, 6.0, 192, 1, false, false, 0, 15);
        registerBlock(192, 'lit_furnace', 3.5, 6.0, 192, 1, false, true, 13, 15);
        registerBlock(193, 'blast_furnace', 3.5, 6.0, 193, 1, false, false, 0, 15);
        registerBlock(194, 'smoker', 3.5, 6.0, 194, 1, false, false, 0, 15);

        // Tables and workbenches (IDs 195-198)
        registerBlock(195, 'crafting_table', 2.0, 6.0, 195, 1, false, false, 0, 15);
        registerBlock(196, 'anvil', 5.0, 1200.0, 196, 1, false, false, 0, 15);
        registerBlock(197, 'chipped_anvil', 5.0, 1200.0, 197, 1, false, false, 0, 15);
        registerBlock(198, 'damaged_anvil', 5.0, 1200.0, 198, 1, false, false, 0, 15);

        // Enchanting and brewing (IDs 199-201)
        registerBlock(199, 'enchanting_table', 5.0, 1200.0, -1, 0, false, true, 7, 0);
        registerBlock(200, 'brewing_stand', 0.5, 0.5, -1, 0, false, false, 1, 0);
        registerBlock(201, 'cauldron', 0.5, 0.5, -1, 0, false, false, 0, 0);

        // Beds (IDs 202-203)
        registerBlock(202, 'oak_bed', 0.2, 0.2, -1, 0, false, false, 0, 0);
        registerBlock(203, 'red_bed', 0.2, 0.2, -1, 0, false, false, 0, 0);

        // Paintings (ID 204)
        registerBlock(204, 'painting', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // Signs (IDs 205-208)
        registerBlock(205, 'oak_sign', 2.0, 2.0, 205, 1, false, false, 0, 0);
        registerBlock(206, 'spruce_sign', 2.0, 2.0, 206, 1, false, false, 0, 0);
        registerBlock(207, 'birch_sign', 2.0, 2.0, 207, 1, false, false, 0, 0);
        registerBlock(208, 'acacia_sign', 2.0, 2.0, 208, 1, false, false, 0, 0);

        // Mirrors and portals (IDs 209-210)
        registerBlock(209, 'mirror', 0.5, 0.5, -1, 0, false, false, 0, 0);
        registerBlock(210, 'end_portal_frame', 0.0, 3600000.0, -1, 0, false, true, 1, 15);

        // Monster spawner (ID 211)
        registerBlock(211, 'mob_spawner', 5.0, 3600000.0, -1, 0, false, false, 0, 15);

        // Water and lava (IDs 212-213) — liquids are transparent, unbreakable (hardness=0)
        registerBlock(212, 'water', 0.0, 100.0, -1, 0, true, false, 0, 1);
        registerBlock(213, 'lava', 0.0, 100.0, -1, 0, true, true, 15, 1);

        // Coal, iron, gold, diamond, emerald, lapis (IDs 214-219) — item drops
        registerBlock(214, 'coal', 1.0, 2.0, 20, 1, false, false, 0, 15);
        registerBlock(215, 'raw_iron', 1.0, 2.0, 21, 1, false, false, 0, 15);
        registerBlock(216, 'raw_gold', 1.0, 2.0, 22, 1, false, false, 0, 15);
        registerBlock(217, 'raw_diamond', 1.0, 2.0, 23, 1, false, false, 0, 15);
        registerBlock(218, 'diamond', 3.0, 2.0, 23, 1, false, false, 0, 15);
        registerBlock(219, 'emerald', 3.0, 2.0, 24, 1, false, false, 0, 15);

        // More ores and blocks (IDs 220-228)
        registerBlock(220, 'lapis_lazuli', 1.0, 2.0, 25, 1, false, false, 0, 15);
        registerBlock(221, 'iron_ingot', 1.0, 2.0, 21, 1, false, false, 0, 15);
        registerBlock(222, 'gold_ingot', 1.0, 2.0, 22, 1, false, false, 0, 15);
        registerBlock(223, 'netherite_ingot', 1.0, 2.0, -1, 0, false, false, 0, 15);
        registerBlock(224, 'netherite_block', 1200.0, 1200.0, 223, 1, false, false, 0, 15);
        registerBlock(225, 'gold_block', 3.0, 6.0, 22, 1, false, true, 0, 15);
        registerBlock(226, 'iron_block', 3.0, 6.0, 21, 1, false, false, 0, 15);
        registerBlock(227, 'diamond_block', 3.0, 6.0, 23, 1, false, false, 0, 15);
        registerBlock(228, 'emerald_block', 3.0, 6.0, 24, 1, false, false, 0, 15);

        // Redstone dust and blocks (IDs 229-233)
        registerBlock(229, 'redstone_dust', 0.0, 0.0, -1, 0, true, true, 9, 0);
        registerBlock(230, 'redstone_block', 3.0, 6.0, 229, 1, false, false, 0, 15);
        registerBlock(231, 'lapis_block', 3.0, 6.0, 25, 1, false, false, 0, 15);
        registerBlock(232, 'coal_block', 3.0, 6.0, 20, 1, false, false, 0, 15);
        registerBlock(233, 'quartz_block', 1.0, 6.0, 234, 1, false, false, 0, 15);

        // Quartz variants (IDs 234-237)
        registerBlock(234, 'quartz_block', 1.0, 6.0, 234, 1, false, false, 0, 15);
        registerBlock(235, 'chiseled_quartz_block', 1.0, 6.0, 234, 1, false, false, 0, 15);
        registerBlock(236, 'quartz_pillar', 1.0, 6.0, 234, 1, false, false, 0, 15);
        registerBlock(237, 'quartz_bricks', 1.0, 6.0, 234, 1, false, false, 0, 15);

        // Nether quartz (ID 238)
        registerBlock(238, 'nether_quartz_ore', 3.0, 6.0, 239, 1, false, false, 0, 15);

        // Hay bale (ID 239)
        registerBlock(239, 'hay_block', 0.9, 0.5, -1, 0, false, false, 0, 15);

        // Cocoa beans (ID 240)
        registerBlock(240, 'cocoa', 0.2, 0.2, -1, 0, true, false, 0, 0);

        // Decorative glass (IDs 241-256) — 16 colored stained glass
        registerBlock(241, 'white_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(242, 'orange_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(243, 'magenta_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(244, 'light_blue_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(245, 'yellow_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(246, 'lime_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(247, 'pink_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(248, 'gray_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(249, 'light_gray_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(250, 'cyan_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(251, 'purple_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(252, 'blue_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(253, 'brown_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(254, 'green_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(255, 'red_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);
        registerBlock(256, 'black_stained_glass', 0.3, 0.3, -1, 0, true, false, 0, 0);

        // Nether blocks (IDs 257-274)
        registerBlock(257, 'netherrack', 1.0, 0.0, 257, 1, false, false, 0, 15);
        registerBlock(258, 'soul_sand', 0.5, 0.5, 258, 1, false, false, 0, 15);
        registerBlock(259, 'soul_soil', 0.8, 0.8, 259, 1, false, false, 0, 15);
        registerBlock(260, 'gilded_blackstone', 1.5, 6.0, 260, 1, false, false, 0, 15);
        registerBlock(261, 'polished_blackstone', 2.0, 6.0, 261, 1, false, false, 0, 15);
        registerBlock(262, 'polished_blackstone_bricks', 2.0, 6.0, 263, 1, false, false, 0, 15);
        registerBlock(263, 'nether_wart_block', 1.0, 0.0, 263, 1, false, false, 0, 15);
        registerBlock(264, 'warped_stem', 1.0, 0.0, 265, 1, false, false, 0, 15);
        registerBlock(265, 'warped_hyphae', 1.0, 0.0, 265, 1, false, false, 0, 15);
        registerBlock(266, 'warped_planks', 1.0, 0.0, 266, 1, false, false, 0, 15);
        registerBlock(267, 'warped_nylium', 1.0, 0.0, 267, 1, false, false, 0, 15);
        registerBlock(268, 'crimson_stem', 1.0, 0.0, 269, 1, false, false, 0, 15);
        registerBlock(269, 'crimson_hyphae', 1.0, 0.0, 269, 1, false, false, 0, 15);
        registerBlock(270, 'crimson_planks', 1.0, 0.0, 270, 1, false, false, 0, 15);
        registerBlock(271, 'crimson_nylium', 1.0, 0.0, 271, 1, false, false, 0, 15);
        registerBlock(272, 'nether_gold_ore', 3.0, 6.0, 272, 1, false, false, 0, 15);
        registerBlock(273, 'ancient_debris', 30.0, 1200.0, 273, 1, false, false, 0, 15);
        registerBlock(274, 'magma', 0.5, 0.5, 274, 1, false, false, 0, 15);

        // Respawn anchor & portal blocks (IDs 275-278)
        registerBlock(275, 'respawn_anchor', 0.0, 1200.0, -1, 0, false, true, 11, 15);
        registerBlock(276, 'nether_portal', 0.0, 0.0, -1, 0, true, true, 11, 0);
        registerBlock(277, 'end_portal', 0.0, 0.0, -1, 0, true, true, 15, 0);

        // End blocks (IDs 278-285)
        // Note: ID 167 (fern duplicate) removed — ID 160 already covers fern
        registerBlock(278, 'chorus_plant', 0.4, 0.4, 278, 1, false, false, 0, 15);
        registerBlock(279, 'chorus_flower', 0.4, 0.4, -1, 0, false, false, 0, 15);
        registerBlock(280, 'purpur_block', 1.5, 3.0, 280, 1, false, false, 0, 15);
        registerBlock(281, 'purpur_pillar', 1.5, 3.0, 280, 1, false, false, 0, 15);
        registerBlock(282, 'end_stone_brick_wall', 3.0, 9.0, 45, 1, false, false, 0, 15);
        registerBlock(283, 'end_stone_bricks_stairs', 3.0, 9.0, 45, 1, false, false, 0, 15);
        registerBlock(284, 'shroomlight', 1.0, 0.0, 284, 1, false, true, 15, 15);
        registerBlock(285, 'pitcher_pod', 0.0, 0.0, -1, 0, true, false, 0, 0);

        // ============================================================
        // Public API
        // ============================================================

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
         * A block is replaceable if it is unbreakable (hardness < 0) or if it is
         * a transparent decorative block with no drop (dropBlockId === -1, transparent, lightOpacity === 0).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isReplaceable(id) {
            var block = _blocks[id];
            if (block === undefined) return false;
            // Unbreakable blocks (air, bedrock) are replaceable
            if (block.hardness < 0) return true;
            // Transparent decorative blocks with no drop are replaceable (grass, flowers, plants)
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