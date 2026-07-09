// Donkeycraft — Block Type Classification
// Special block type classification: solid, transparent, liquid, opaque, full-block.
// Uses BlockRegistry name-based lookups for robust ID-agnostic classification.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  // ============================================================
  // BlockTypes — fast boolean classification lookups
  // ============================================================

  /**
   * BlockTypes — pre-computed lookup tables for block type queries.
   * Built dynamically from BlockRegistry at initialization time.
   * @namespace
   */
  Donkeycraft.BlockTypes = (function () {
    /** @type {Object.<number, boolean>} */
    var _solid = {};
    /** @type {Object.<number, boolean>} */
    var _transparent = {};
    /** @type {Object.<number, boolean>} */
    var _opaque = {};
    /** @type {Object.<number, boolean>} */
    var _liquid = {};
    /** @type {Object.<number, boolean>} */
    var _lava = {};
    /** @type {Object.<number, boolean>} */
    var _replaceable = {};
    /** @type {Object.<number, boolean>} */
    var _fullBlock = {};

    // ============================================================
    // Helper — resolve block ID by name from BlockRegistry
    // ============================================================

    /**
     * Resolve a block ID by name from BlockRegistry.
     * Returns -1 if the block is not found.
     * @param {string} name - Block name (case-insensitive).
     * @returns {number} Block ID, or -1 if not found.
     * @private
     */
    function _resolveBlockId(name) {
      if (
        !Donkeycraft.BlockRegistry ||
        typeof Donkeycraft.BlockRegistry.getBlockByName !== 'function'
      )
        return -1;
      var block = Donkeycraft.BlockRegistry.getBlockByName(name);
      return block ? block.id : -1;
    }

    // ============================================================
    // Build lookup tables from BlockRegistry (ID-agnostic)
    // ============================================================

    /**
     * Initialize all classification lookup tables from BlockRegistry.
     * Called once during module initialization.
     * @private
     */
    function _initLookups() {
      if (!Donkeycraft.BlockRegistry) return;

      var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        var id = b.id;

        _transparent[id] = !!b.transparent;
        _opaque[id] = b.lightOpacity >= 15;
        _liquid[id] = b.name === 'water' || b.name === 'lava';
        _lava[id] = b.name === 'lava';

        // Replaceable: unbreakable blocks (hardness < 0) or transparent decorative blocks with no drop
        _replaceable[id] =
          b.hardness < 0 ||
          (b.dropBlockId === -1 &&
            b.transparent === true &&
            b.lightOpacity === 0);

        // Solid: not transparent and has non-negative hardness
        _solid[id] = !b.transparent && b.hardness >= 0;

        // Full block: solid, opaque, not a liquid, must have a drop
        _fullBlock[id] =
          _solid[id] &&
          _opaque[id] &&
          !_liquid[id] &&
          b.lightOpacity >= 15 &&
          b.dropBlockId >= 0;
      }

      // ---- Name-based overrides for edge cases ----
      // These use BlockRegistry lookups instead of hardcoded IDs for robustness.
      _applyOverrides();
    }

    /**
     * Apply classification overrides by block name.
     * @private
     */
    function _applyOverrides() {
      var overrideDefs = [
        // [name, transparent, solid, fullBlock, replaceable]
        ['glass', true, false, false, false],
        ['tinted_glass', true, false, false, false],
        ['glass_pane', true, false, false, false],
        ['ice', true, false, false, false],
        ['blue_ice', true, false, false, false],
        ['snow_layer', true, false, false, false],
        ['piston_head', true, false, false, false],
        ['grass', true, false, false, true],
        ['tall_grass', true, false, false, true],
        ['fern', true, false, false, true],
        ['poppy', true, false, false, true],
        ['blue_orchid', true, false, false, true],
        ['dandelion', true, false, false, true],
        ['rose_bush', true, false, false, true],
        ['sunflower', true, false, false, true],
        ['lily_pad', true, false, false, false],
        ['glow_lichen', true, false, false, true],
        ['dead_bush', true, false, false, true],
        ['vine', true, false, false, true],
        ['cave_vines', true, false, false, true],
        ['sugar_cane', true, false, false, true],
        ['reeds', true, false, false, true],
        ['redstone_wire', true, false, false, false],
        ['redstone_torch', true, false, false, false],
        ['oak_door', true, false, false, false],
        ['iron_door', true, false, false, false],
        ['spruce_door', true, false, false, false],
        ['stone_button', true, false, false, false],
        ['oak_button', true, false, false, false],
        ['lever', true, false, false, false],
        ['chain', true, false, false, false],
        ['end_rod', true, false, false, false],
        ['painting', true, false, false, true],
        ['stone_pressure_plate', false, false, false, false],
        ['oak_pressure_plate', false, false, false, false],
      ];

      for (var o = 0; o < overrideDefs.length; o++) {
        var def = overrideDefs[o];
        var bid = _resolveBlockId(def[0]);
        if (bid === -1) continue;
        if (def[1]) _transparent[bid] = true;
        if (!def[2]) _solid[bid] = false;
        if (def[3]) _fullBlock[bid] = false;
        if (def[4]) _replaceable[bid] = true;
      }

      // Leaves: transparent but solid (collision)
      var leafNames = [
        'oak_leaves',
        'spruce_leaves',
        'birch_leaves',
        'jungle_leaves',
        'acacia_leaves',
        'dark_oak_leaves',
      ];
      for (var l = 0; l < leafNames.length; l++) {
        var lid = _resolveBlockId(leafNames[l]);
        if (lid !== -1) {
          _transparent[lid] = true;
          _solid[lid] = true;
        }
      }

      // Slabs — half-height, not full blocks but still solid
      var slabNames = [
        'stone_slab',
        'smooth_stone_slab',
        'oak_slab',
        'spruce_slab',
        'birch_slab',
        'cobblestone_slab',
        'brick_slab',
      ];
      for (var s = 0; s < slabNames.length; s++) {
        var sid = _resolveBlockId(slabNames[s]);
        if (sid !== -1) _fullBlock[sid] = false;
      }

      // Stairs — partial height, not full blocks
      var stairNames = [
        'stone_bricks_stairs',
        'oak_stairs',
        'cobblestone_stairs',
        'brick_stairs',
        'smooth_stone_stairs',
        'sandstone_stairs',
      ];
      for (var st = 0; st < stairNames.length; st++) {
        var stid = _resolveBlockId(stairNames[st]);
        if (stid !== -1) _fullBlock[stid] = false;
      }

      // Fences and walls — partial height, not full blocks
      var fenceNames = [
        'oak_fence',
        'cobblestone_wall',
        'brick_wall',
        'nether_brick_wall',
        'sandstone_wall',
      ];
      for (var f = 0; f < fenceNames.length; f++) {
        var fid = _resolveBlockId(fenceNames[f]);
        if (fid !== -1) _fullBlock[fid] = false;
      }

      // Deepslate variants — full solid blocks, not replaceable
      var deepslateNames = [
        'deepslate',
        'cobbled_deepslate',
        'polished_deepslate',
        'deepslate_bricks',
        'cracked_deepslate_bricks',
        'deepslate_tiles',
        'cracked_deepslate_tiles',
      ];
      for (var ds = 0; ds < deepslateNames.length; ds++) {
        var dsid = _resolveBlockId(deepslateNames[ds]);
        if (dsid !== -1) {
          _solid[dsid] = true;
          _opaque[dsid] = true;
          _fullBlock[dsid] = true;
          _replaceable[dsid] = false;
        }
      }

      // Polished stone variants — full solid blocks
      var polishedNames = [
        'polished_diorite',
        'polished_andesite',
        'polished_granite',
        'polished_blackstone',
        'polished_blackstone_bricks',
      ];
      for (var p = 0; p < polishedNames.length; p++) {
        var pid = _resolveBlockId(polishedNames[p]);
        if (pid !== -1) {
          _solid[pid] = true;
          _opaque[pid] = true;
          _fullBlock[pid] = true;
        }
      }

      // Mossy variants — not full blocks for bricks
      var mossyNames = [
        'mossy_cobblestone',
        'mossy_stone_bricks',
        'mossy_brick',
      ];
      for (var m = 0; m < mossyNames.length; m++) {
        var mid = _resolveBlockId(mossyNames[m]);
        if (mid !== -1) {
          _solid[mid] = true;
          _fullBlock[mid] = true;
        }
      }

      // Red terracotta / white terracotta — full solid blocks
      var terracottaNames = [
        'terracotta',
        'white_terracotta',
        'orange_terracotta',
        'magenta_terracotta',
        'light_blue_terracotta',
        'yellow_terracotta',
        'lime_terracotta',
        'pink_terracotta',
        'gray_terracotta',
        'light_gray_terracotta',
        'cyan_terracotta',
        'purple_terracotta',
        'blue_terracotta',
        'brown_terracotta',
        'green_terracotta',
        'red_terracotta',
        'black_terracotta',
      ];
      for (var t = 0; t < terracottaNames.length; t++) {
        var tid = _resolveBlockId(terracottaNames[t]);
        if (tid !== -1) {
          _solid[tid] = true;
          _opaque[tid] = true;
          _fullBlock[tid] = true;
        }
      }

      // Hay bale — full solid block but not opaque (has gaps)
      var hayId = _resolveBlockId('hay_block');
      if (hayId !== -1) {
        _solid[hayId] = true;
        _fullBlock[hayId] = true;
      }

      // Anvil — solid but not full block (partial height)
      var anvilNames = ['anvil', 'chipped_anvil', 'damaged_anvil'];
      for (var a = 0; a < anvilNames.length; a++) {
        var aid = _resolveBlockId(anvilNames[a]);
        if (aid !== -1) _fullBlock[aid] = false;
      }

      // Chiseled blocks — full solid blocks
      var chiseledNames = [
        'chiseled_polished_blackstone',
        'chiseled_deepslate',
      ];
      for (var ch = 0; ch < chiseledNames.length; ch++) {
        var chid = _resolveBlockId(chiseledNames[ch]);
        if (chid !== -1) {
          _solid[chid] = true;
          _opaque[chid] = true;
          _fullBlock[chid] = true;
        }
      }

      // Note block, jukebox — full solid blocks
      var noteId = _resolveBlockId('note_block');
      if (noteId !== -1) {
        _solid[noteId] = true;
        _fullBlock[noteId] = true;
      }
      var jukeId = _resolveBlockId('jukebox');
      if (jukeId !== -1) {
        _solid[jukeId] = true;
        _fullBlock[jukeId] = true;
      }

      // Lanterns — not full blocks, transparent
      var lanternNames = ['lantern', 'soul_lantern'];
      for (var lg = 0; lg < lanternNames.length; lg++) {
        var lgid = _resolveBlockId(lanternNames[lg]);
        if (lgid !== -1) {
          _transparent[lgid] = true;
          _fullBlock[lgid] = false;
        }
      }

      // Campfire, soul_campfire — not full blocks, transparent
      var campfireNames = ['campfire', 'soul_campfire'];
      for (var cf = 0; cf < campfireNames.length; cf++) {
        var cfid = _resolveBlockId(campfireNames[cf]);
        if (cfid !== -1) {
          _transparent[cfid] = true;
          _fullBlock[cfid] = false;
        }
      }

      // Wall variants — not full blocks
      var wallNames = [
        'cobblestone_wall',
        'brick_wall',
        'nether_brick_wall',
        'sandstone_wall',
        'granite_wall',
        'diorite_wall',
        'andesite_wall',
        'deepslate_wall',
        'end_stone_brick_wall',
      ];
      for (var wl = 0; wl < wallNames.length; wl++) {
        var wlid = _resolveBlockId(wallNames[wl]);
        if (wlid !== -1) _fullBlock[wlid] = false;
      }

      // Fence gates — not full blocks
      var gateNames = [
        'oak_fence_gate',
        'spruce_fence_gate',
        'birch_fence_gate',
        'jungle_fence_gate',
        'acacia_fence_gate',
        'dark_oak_fence_gate',
      ];
      for (var fg = 0; fg < gateNames.length; fg++) {
        var fgid = _resolveBlockId(gateNames[fg]);
        if (fgid !== -1) _fullBlock[fgid] = false;
      }

      // Trapdoor — not full blocks, transparent
      var trapdoorNames = [
        'oak_trapdoor',
        'spruce_trapdoor',
        'birch_trapdoor',
        'jungle_trapdoor',
        'acacia_trapdoor',
        'dark_oak_trapdoor',
        'iron_trapdoor',
      ];
      for (var td = 0; td < trapdoorNames.length; td++) {
        var tdid = _resolveBlockId(trapdoorNames[td]);
        if (tdid !== -1) {
          _transparent[tdid] = true;
          _fullBlock[tdid] = false;
        }
      }

      // Hopper — not full block
      var hopperId = _resolveBlockId('hopper');
      if (hopperId !== -1) _fullBlock[hopperId] = false;

      // Minecart tracks — replaceable, transparent
      var trackId = _resolveBlockId('rail');
      if (trackId !== -1) {
        _transparent[trackId] = true;
        _replaceable[trackId] = true;
        _fullBlock[trackId] = false;
      }

      // End portal frame — full block
      var epfId = _resolveBlockId('end_portal_frame');
      if (epfId !== -1) {
        _solid[epfId] = true;
        _opaque[epfId] = true;
        _fullBlock[epfId] = true;
      }

      // Mob spawner — full block
      var spawnerId = _resolveBlockId('mob_spawner');
      if (spawnerId !== -1) {
        _solid[spawnerId] = true;
        _opaque[spawnerId] = true;
        _fullBlock[spawnerId] = true;
      }

      // Enchanting table — not full block
      var enchantId = _resolveBlockId('enchanting_table');
      if (enchantId !== -1) _fullBlock[enchantId] = false;

      // Cake — not full block, replaceable
      var cakeId = _resolveBlockId('cake');
      if (cakeId !== -1) {
        _transparent[cakeId] = true;
        _replaceable[cakeId] = true;
        _fullBlock[cakeId] = false;
      }

      // Beacon — full block
      var beaconId = _resolveBlockId('beacon');
      if (beaconId !== -1) {
        _solid[beaconId] = true;
        _opaque[beaconId] = true;
        _fullBlock[beaconId] = true;
      }

      // Anvil — not full block
      var anvilId = _resolveBlockId('anvil');
      if (anvilId !== -1) _fullBlock[anvilId] = false;
    }

    // Run initialization
    _initLookups();

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
     * Check if a block ID is specifically lava (not water).
     * Used to distinguish lava from water for fall damage stamina:
     * only water absorbs/cancels fall impact; lava does NOT.
     * @param {number} id - Block ID.
     * @returns {boolean}
     */
    function isLava(id) {
      return _lava[id] === true;
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
      if (!Donkeycraft.BlockRegistry) return 0;
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
        case 'solid':
          table = _solid;
          break;
        case 'transparent':
          table = _transparent;
          break;
        case 'opaque':
          table = _opaque;
          break;
        case 'liquid':
          table = _liquid;
          break;
        case 'replaceable':
          table = _replaceable;
          break;
        case 'fullBlock':
          table = _fullBlock;
          break;
        default:
          return [];
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
      isLava: isLava,
      isReplaceable: isReplaceable,
      isFullBlock: isFullBlock,
      isCollidable: isCollidable,
      blocksLight: blocksLight,
      getLightOpacity: getLightOpacity,
      getIdsByType: getIdsByType,
    };
  })();
})();
