// Donkeycraft — Block Type Classification
// Special block type classification: solid, transparent, liquid, opaque, full-block.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // BlockTypes — fast boolean classification lookups
    // ============================================================

    /**
     * BlockTypes — pre-computed lookup tables for block type queries.
     */
    Donkeycraft.BlockTypes = (function() {
        var _solid = {};         // blockId -> true: has full collision box
        var _transparent = {};   // blockId -> true: alpha/see-through
        var _opaque = {};        // blockId -> true: fully blocks light (opacity >= 15)
        var _liquid = {};        // blockId -> true: water or lava
        var _replaceable = {};   // blockId -> true: grass, flowers, replaceable
        var _fullBlock = {};     // blockId -> true: occupies entire 16x16x16 block

        // ---- Build lookup tables from BlockRegistry ----

        var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            var id = b.id;

            _transparent[id] = b.transparent;
            _opaque[id] = b.lightOpacity >= 15;
            _liquid[id] = (b.name === 'water' || b.name === 'lava');
            _replaceable[id] = b.hardness < 0 || b.dropBlockId === -1 && b.transparent === true && b.lightOpacity === 0;

            // Solid: not transparent and has non-negative hardness
            _solid[id] = !b.transparent && b.hardness >= 0;

            // Full block: solid, opaque, not a liquid, not a plant/decoration
            _fullBlock[id] = _solid[id] && _opaque[id] && !_liquid[id] &&
                             b.lightOpacity >= 15 && b.dropBlockId >= 0;
        }

        // ---- Explicit overrides for edge cases ----

        // Glass is transparent but not solid (no collision)
        _transparent[45] = true;   // glass
        _solid[45] = false;

        _transparent[46] = true;   // tinted_glass
        _solid[46] = false;

        _transparent[47] = true;   // glass_pane
        _solid[47] = false;

        _transparent[48] = true;   // ice
        _solid[48] = false;

        _transparent[49] = true;   // blue_ice
        _solid[49] = false;

        // Snow layer is transparent (partial height)
        _transparent[50] = true;   // snow_layer
        _solid[50] = false;

        // Piston head is transparent
        _transparent[52] = true;   // piston_head
        _solid[52] = false;

        // Leaves are transparent but solid (collision)
        _transparent[118] = true;  // oak_leaves
        _solid[118] = true;
        _transparent[119] = true;  // spruce_leaves
        _solid[119] = true;
        _transparent[120] = true;  // birch_leaves
        _solid[120] = true;
        _transparent[121] = true;  // jungle_leaves
        _solid[121] = true;
        _transparent[122] = true;  // acacia_leaves
        _solid[122] = true;
        _transparent[123] = true;  // dark_oak_leaves
        _solid[123] = true;

        // Plants/decorations are transparent and not solid
        _transparent[158] = true;  // grass
        _solid[158] = false;
        _transparent[159] = true;  // tall_grass
        _solid[159] = false;
        _transparent[160] = true;  // fern
        _solid[160] = false;
        _transparent[161] = true;  // poppy
        _solid[161] = false;
        _transparent[162] = true;  // blue_orchid
        _solid[162] = false;
        _transparent[163] = true;  // dandelion
        _solid[163] = false;
        _transparent[164] = true;  // rose_bush
        _solid[164] = false;
        _transparent[165] = true;  // sunflower
        _solid[165] = false;
        _transparent[166] = true;  // lily_pad
        _solid[166] = false;
        _transparent[167] = true;  // fern (duplicate)
        _solid[167] = false;
        _transparent[168] = true;  // dead_bush
        _solid[168] = false;
        _transparent[169] = true;  // vine
        _solid[169] = false;
        _transparent[170] = true;  // cave_vines
        _solid[170] = false;

        // Sugar cane and reeds are transparent and replaceable
        _transparent[171] = true;  // sugar_cane
        _solid[171] = false;
        _replaceable[171] = true;
        _transparent[172] = true;  // reeds
        _solid[172] = false;
        _replaceable[172] = true;

        // All plants (158-170, 167) are replaceable
        _replaceable[158] = true;  // grass
        _replaceable[159] = true;  // tall_grass
        _replaceable[160] = true;  // fern
        _replaceable[161] = true;  // poppy
        _replaceable[162] = true;  // blue_orchid
        _replaceable[163] = true;  // dandelion
        _replaceable[164] = true;  // rose_bush
        _replaceable[165] = true;  // sunflower
        _replaceable[166] = true;  // lily_pad
        _replaceable[167] = true;  // fern (duplicate)
        _replaceable[168] = true;  // dead_bush
        _replaceable[169] = true;  // vine
        _replaceable[170] = true;  // cave_vines

        // Redstone wire is transparent
        _transparent[173] = true;  // redstone_wire
        _solid[173] = false;

        // Redstone torch is not solid (small)
        _transparent[174] = true;  // redstone_torch
        _solid[174] = false;

        // Doors are transparent (half-height)
        _transparent[148] = true;  // oak_door
        _solid[148] = false;
        _transparent[149] = true;  // iron_door
        _solid[149] = false;
        _transparent[150] = true;  // spruce_door
        _solid[150] = false;

        // Buttons are transparent (on wall)
        _transparent[143] = true;  // stone_button
        _solid[143] = false;
        _transparent[144] = true;  // oak_button
        _solid[144] = false;

        // Lever is transparent (on wall)
        _transparent[145] = true;  // lever
        _solid[145] = false;

        // Chains are not solid (thin)
        _transparent[157] = true;  // chain
        _solid[157] = false;

        // End rod is not solid
        _transparent[156] = true;  // end_rod
        _solid[156] = false;

        // Paintings are transparent and replaceable
        _transparent[204] = true;  // painting
        _solid[204] = false;
        _replaceable[204] = true;

        // Vine is transparent and not solid
        _transparent[169] = true;
        _solid[169] = false;

        // Slabs are half-height: not full block but still solid
        _fullBlock[127] = false;   // stone_slab
        _fullBlock[128] = false;   // smooth_stone_slab
        _fullBlock[129] = false;   // oak_slab
        _fullBlock[131] = false;   // spruce_slab
        _fullBlock[132] = false;   // birch_slab
        _fullBlock[133] = false;   // cobblestone_slab
        _fullBlock[134] = false;   // brick_slab

        // Stairs are not full blocks (partial height)
        _fullBlock[135] = false;   // stone_bricks_stairs
        _fullBlock[136] = false;   // oak_stairs
        _fullBlock[137] = false;   // cobblestone_stairs
        _fullBlock[139] = false;   // brick_stairs
        _fullBlock[141] = false;   // smooth_stone_stairs
        _fullBlock[142] = false;   // sandstone_stairs

        // Fences and walls are not full blocks (partial height)
        _fullBlock[151] = false;   // oak_fence
        _fullBlock[152] = false;   // cobblestone_wall
        _fullBlock[153] = false;   // brick_wall
        _fullBlock[154] = false;   // nether_brick_wall
        _fullBlock[155] = false;   // sandstone_wall

        // Pressure plates are not full blocks
        _fullBlock[146] = false;   // stone_pressure_plate
        _fullBlock[147] = false;   // oak_pressure_plate

        // Ladder is not solid (thin)
        // (not defined in block.js, but handle gracefully)

        // ============================================================
        // Public API
        // ============================================================

        /**
         * Check if a block ID is solid (has full collision box).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isSolid(id) {
            return _solid[id] === true;
        }

        /**
         * Check if a block ID is transparent (alpha/see-through).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isTransparent(id) {
            return _transparent[id] === true;
        }

        /**
         * Check if a block ID is opaque (fully blocks light).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isOpaque(id) {
            return _opaque[id] === true;
        }

        /**
         * Check if a block ID is a liquid (water or lava).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isLiquid(id) {
            return _liquid[id] === true;
        }

        /**
         * Check if a block ID is replaceable (grass, flowers, etc.).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isReplaceable(id) {
            return _replaceable[id] === true;
        }

        /**
         * Check if a block ID is a full block (occupies entire 16×16×16).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isFullBlock(id) {
            return _fullBlock[id] === true;
        }

        /**
         * Check if a block ID collides with entities (solid or liquid).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function isCollidable(id) {
            return _solid[id] === true || _liquid[id] === true;
        }

        /**
         * Check if a block ID blocks light completely (opacity >= 15).
         * @param {number} id - Block ID.
         * @returns {boolean}
         */
        function blocksLight(id) {
            return _opaque[id] === true;
        }

        /**
         * Get the light opacity value for a block ID (0-15).
         * @param {number} id - Block ID.
         * @returns {number} Light opacity (0 = fully transparent, 15 = fully opaque).
         */
        function getLightOpacity(id) {
            var block = Donkeycraft.BlockRegistry.getBlockById(id);
            return block !== null ? block.lightOpacity : 0;
        }

        /**
         * Get all block IDs that match a given type.
         * @param {string} type - Type to query: "solid", "transparent", "opaque", "liquid", "replaceable", "fullBlock".
         * @returns {number[]} Array of block IDs.
         */
        function getIdsByType(type) {
            var table;
            switch (type) {
                case 'solid':     table = _solid; break;
                case 'transparent': table = _transparent; break;
                case 'opaque':    table = _opaque; break;
                case 'liquid':    table = _liquid; break;
                case 'replaceable': table = _replaceable; break;
                case 'fullBlock': table = _fullBlock; break;
                default:          return [];
            }
            var result = [];
            for (var key in table) {
                if (table[key] === true) {
                    result.push(parseInt(key, 10));
                }
            }
            return result;
        }

        return {
            isSolid: isSolid,
            isTransparent: isTransparent,
            isOpaque: isOpaque,
            isLiquid: isLiquid,
            isReplaceable: isReplaceable,
            isFullBlock: isFullBlock,
            isCollidable: isCollidable,
            blocksLight: blocksLight,
            getLightOpacity: getLightOpacity,
            getIdsByType: getIdsByType
        };
    })();

})();