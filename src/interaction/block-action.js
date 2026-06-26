// Donkeycraft — Block Action (Breaking & Drops)
// Block breaking: hardness timer, tool speed multipliers, drop spawning.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Tool type speed multipliers for block breaking
    // ============================================================

    /**
     * Tool type speed multipliers by block category.
     * @enum {number}
     */
    var TOOL_MULTIPLIERS = {
        pickaxe:  { stone: 4,  deepslate: 4,  ore: 3,  quartz: 4,  iron: 4,  diamond: 4,  gold: 4,  copper: 4,  coal: 4,  lapis: 4,  redstone: 4,  emerald: 4,  nether_quartz: 4,  obsidian: 8,  crying_obsidian: 8 },
        axe:      { wood: 3,  plank: 3,  stair: 3,  slab_wood: 3,  log: 3,  fence: 3,  door_wood: 2,  trapdoor: 3,  button_wood: 3,  lever: 2,  sign: 3,  boat: 3,  honey_block: 3,  honey_block_face: 3,  bee_nest: 3,  beehive: 3,  chorus_plant: 2,  pumpkin: 1,  melon: 1 },
        shovel:   { dirt: 3,  gravel: 3,  sand: 3,  clay: 3,  soil: 3,  snow_layer: 1,  mycelium: 3,  podzol: 3,  crimson_nylium: 3,  warped_nylium: 3 },
        hoe:      { soil: 2 }
    };

    // Block categories for tool matching
    var STONE_BLOCKS = [1, 2, 3, 4, 5, 6, 12, 13, 15, 16, 43, 44, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238];
    var WOOD_BLOCKS = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42];
    var DIRT_BLOCKS = [7, 8, 38, 39, 40, 41, 42];

    // ============================================================
    // BlockAction — block breaking and drop management.
    // ============================================================

    /**
     * BlockAction — handles block breaking progress, tool speed multipliers, and drop spawning.
     * @param {object} [config] - Configuration.
     * @param {number} [config.breakSpeedMultiplier=1.0] - Global break speed multiplier.
     * @param {Donkeycraft.EventBus} [config.events] - EventBus instance for break events.
     */
    Donkeycraft.BlockAction = function(config) {
        config = config || {};

        /**
         * Global break speed multiplier.
         * @type {number}
         * @private
         */
        this._breakSpeedMultiplier = config.breakSpeedMultiplier || 1.0;

        /**
         * Event bus for break-related events.
         * @type {Donkeycraft.EventBus}
         * @private
         */
        this._events = config.events || null;

        /**
         * Current break state: {x, y, z, chunk, progress, hardness}.
         * @type {object|null}
         * @private
         */
        this._breakState = null;
    };

    /**
     * Start breaking a block at the given global coordinates.
     * @param {number} x - Global X coordinate.
     * @param {number} y - Global Y coordinate.
     * @param {number} z - Global Z coordinate.
     * @param {Donkeycraft.Chunk} chunk - Chunk containing the block.
     * @returns {object} Break state {x, y, z, progress, hardness}.
     */
    Donkeycraft.BlockAction.prototype.startBreak = function(x, y, z, chunk) {
        // Get local coordinates within the chunk
        var lx = ((x % 16) + 16) % 16;
        var lz = ((z % 16) + 16) % 16;

        // Get block hardness
        var blockDef = Donkeycraft.BlockRegistry.getBlockById(chunk.blocks[lx + y * 16 + lz * 16 * 256]);
        if (!blockDef) {
            blockDef = Donkeycraft.BlockRegistry.getBlockById(chunk.blocks[this._getBlockIndex(chunk, lx, y, lz)]);
        }

        // If blockDef lookup failed, try direct registry access
        var blockId = chunk.blocks[this._getBlockIndex(chunk, lx, y, lz)];
        blockDef = Donkeycraft.BlockRegistry.getBlockById(blockId);

        if (!blockDef || blockDef.hardness < 0) {
            // Can't break air or unbreakable blocks
            return null;
        }

        this._breakState = {
            x: x,
            y: y,
            z: z,
            chunk: chunk,
            localX: lx,
            localY: y,
            localZ: lz,
            progress: 0,
            hardness: blockDef.hardness,
            blockId: blockId
        };

        // Emit break start event
        if (this._events) {
            this._events.emit('breakStarted', x, y, z);
        }

        return {
            x: x,
            y: y,
            z: z,
            progress: 0,
            hardness: blockDef.hardness
        };
    };

    /**
     * Update break progress.
     * @param {number} deltaTime - Time since last update in seconds.
     * @param {string} [toolType] - Optional tool type ('pickaxe', 'axe', 'shovel', 'hoe').
     * @returns {number|null} Block ID if broken, null if still breaking.
     */
    Donkeycraft.BlockAction.prototype.updateBreak = function(deltaTime, toolType) {
        if (!this._breakState) {
            return null;
        }

        var state = this._breakState;
        var blockDef = Donkeycraft.BlockRegistry.getBlockById(state.blockId);
        if (!blockDef) {
            return null;
        }

        // Calculate break speed
        var breakSpeed = this._calculateBreakSpeed(blockDef, toolType);

        // Add progress: deltaTime * breakSpeed / hardness
        // Base: 1.0 progress per second on bare hands for hardness=1.0 block
        state.progress += (deltaTime * breakSpeed) / blockDef.hardness;

        if (state.progress >= 1.0) {
            // Block broken — remove it and return drops
            var blockId = state.blockId;
            this._completeBreak(state);
            return blockId;
        }

        return null; // Still breaking
    };

    /**
     * Cancel the current break operation.
     */
    Donkeycraft.BlockAction.prototype.cancelBreak = function() {
        if (this._breakState) {
            var state = this._breakState;
            if (this._events) {
                this._events.emit('breakCancelled', state.x, state.y, state.z);
            }
            this._breakState = null;
        }
    };

    /**
     * Get the current break progress [0, 1).
     * @returns {number} Break progress as a fraction.
     */
    Donkeycraft.BlockAction.prototype.getProgress = function() {
        if (!this._breakState) {
            return 0;
        }
        return Math.min(1.0, this._breakState.progress);
    };

    /**
     * Check if a block is currently being broken.
     * @returns {boolean}
     */
    Donkeycraft.BlockAction.prototype.isBreaking = function() {
        return this._breakState !== null;
    };

    /**
     * Get the drops for a broken block.
     * @param {number} blockId - Block ID that was broken.
     * @param {number} [dropCount=1] - Number of items to drop.
     * @returns {Array<{blockId: number, count: number}>}
     */
    Donkeycraft.BlockAction.prototype.getDrops = function(blockId, dropCount) {
        dropCount = dropCount || 1;
        var blockDef = Donkeycraft.BlockRegistry.getBlockById(blockId);
        if (!blockDef || blockDef.dropBlockId < 0) {
            return [];
        }

        var count = Math.min(dropCount, blockDef.dropItemCount);
        return [{
            blockId: blockDef.dropBlockId,
            count: count
        }];
    };

    /**
     * Destroy and free resources.
     */
    Donkeycraft.BlockAction.prototype.destroy = function() {
        this._breakState = null;
        this._events = null;
    };

    /**
     * Calculate the break speed for a block given a tool type.
     * @param {Donkeycraft.Block} blockDef - Block definition.
     * @param {string} [toolType] - Tool type ('pickaxe', 'axe', 'shovel', 'hoe').
     * @returns {number} Break speed multiplier.
     * @private
     */
    Donkeycraft.BlockAction.prototype._calculateBreakSpeed = function(blockDef, toolType) {
        var baseSpeed = this._breakSpeedMultiplier;

        // If no tool type specified, use bare hands speed
        if (!toolType) {
            return baseSpeed;
        }

        // Check if the tool is correct for fast breaking
        var blockName = blockDef.name;
        var multiplier = this._getToolMultiplier(toolType, blockName);

        // Correct tool breaks 30x faster than incorrect tool (or bare hands)
        if (multiplier > 1) {
            return baseSpeed * multiplier;
        }

        // Incorrect tool — 1/30th speed (but still faster than bare hands for very hard blocks)
        return baseSpeed * 0.3;
    };

    /**
     * Get the tool multiplier for a block type.
     * @param {string} toolType - Tool type.
     * @param {string} blockName - Block name.
     * @returns {number} Multiplier (>1 = correct tool, 1 = wrong tool).
     * @private
     */
    Donkeycraft.BlockAction.prototype._getToolMultiplier = function(toolType, blockName) {
        var category;

        // Determine block category
        if (STONE_BLOCKS.indexOf(blockName) !== -1 || typeof STONE_BLOCKS.indexOf === 'function') {
            // Check by name patterns since array may contain strings
            if (this._isStoneBlock(blockName)) {
                category = 'stone';
            }
        }

        // Use name-based matching for better reliability
        var stoneNames = ['stone', 'granite', 'diorite', 'andesite', 'deepslate', 'cobbled_deepslate',
                          'coal_ore', 'deepslate_coal_ore', 'iron_ore', 'deepslate_iron_ore',
                          'gold_ore', 'deepslate_gold_ore', 'diamond_ore', 'deepslate_diamond_ore',
                          'emerald_ore', 'deepslate_emerald_ore', 'redstone_ore', 'lapis_ore',
                          'obsidian', 'crying_obsidian', 'quartz_block', 'chiseled_quartz_block',
                          'quartz_pillar', 'quartz_bricks', 'nether_quartz_ore', 'smooth_stone',
                          'bricks', 'stone_bricks', 'chiseled_stone_bricks', 'cracked_stone_bricks',
                          'stone_slab', 'stone_brick_stairs', 'cobblestone', 'mossy_cobblestone',
                          'tuff', 'calcite', 'dripstone_block', 'pointed_dripstone'];
        var woodNames = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log',
                         'dark_oak_log', 'mangrove_log', 'cherry_log', 'pumpkin', 'melon',
                         'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks',
                         'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks',
                         'oak_wood', 'spruce_wood', 'birch_wood', 'jungle_wood',
                         'acacia_wood', 'dark_oak_wood', 'mangrove_wood', 'cherry_wood',
                         'crimson_stem', 'warped_stem', 'crimson_hyphae', 'warped_hyphae',
                         'stripped_oak_log', 'stripped_spruce_log', 'stripped_birch_log',
                         'stripped_jungle_log', 'stripped_acacia_log', 'stripped_dark_oak_log',
                         'stripped_mangrove_log', 'stripped_cherry_log'];
        var dirtNames = ['dirt', 'grass_block', 'coarse_dirt', 'podzol', 'mycelium',
                         'sand', 'red_sand', 'gravel', 'clay', 'dirt_path', 'soul_soil'];

        if (stoneNames.indexOf(blockName) !== -1) {
            category = 'stone';
        } else if (woodNames.indexOf(blockName) !== -1) {
            category = 'wood';
        } else if (dirtNames.indexOf(blockName) !== -1) {
            category = 'dirt';
        } else {
            return 1; // No multiplier for unknown blocks
        }

        // Get multiplier from the appropriate tool category
        var multipliers = TOOL_MULTIPLIERS[toolType];
        if (!multipliers) {
            return 1;
        }

        // Check if this block category has a multiplier for the tool
        return multipliers[category] || 1;
    };

    /**
     * Check if a block name represents a stone-type block.
     * @param {string} name - Block name.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.BlockAction.prototype._isStoneBlock = function(name) {
        var stoneNames = ['stone', 'granite', 'diorite', 'andesite', 'deepslate', 'cobbled_deepslate',
                          'coal_ore', 'deepslate_coal_ore', 'iron_ore', 'deepslate_iron_ore',
                          'gold_ore', 'deepslate_gold_ore', 'diamond_ore', 'deepslate_diamond_ore',
                          'emerald_ore', 'deepslate_emerald_ore', 'redstone_ore', 'lapis_ore',
                          'obsidian', 'crying_obsidian', 'quartz_block', 'chiseled_quartz_block',
                          'quartz_pillar', 'quartz_bricks', 'nether_quartz_ore', 'smooth_stone',
                          'bricks', 'stone_bricks', 'chiseled_stone_bricks', 'cracked_stone_bricks',
                          'cobblestone', 'mossy_cobblestone', 'tuff', 'calcite', 'dripstone_block'];
        return stoneNames.indexOf(name) !== -1;
    };

    /**
     * Complete the break: remove block, spawn drops, emit events.
     * @param {object} state - Break state to complete.
     * @private
     */
    Donkeycraft.BlockAction.prototype._completeBreak = function(state) {
        // Remove the block (set to air = 0)
        var index = this._getBlockIndex(state.chunk, state.localX, state.localY, state.localZ);
        state.chunk.blocks[index] = 0;
        state.chunk._dirty = true;

        // Emit break complete event
        if (this._events) {
            var drops = this.getDrops(state.blockId);
            this._events.emit('breakComplete', state.x, state.y, state.z, state.blockId, drops);
        }

        // Clear break state
        this._breakState = null;
    };

    /**
     * Get the linear array index for local coordinates in a chunk.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} x - Local X [0, 15].
     * @param {number} y - Y [0, 255].
     * @param {number} z - Local Z [0, 15].
     * @returns {number} Linear index.
     * @private
     */
    Donkeycraft.BlockAction.prototype._getBlockIndex = function(chunk, x, y, z) {
        return x + y * 16 + z * 16 * 256;
    };

})();