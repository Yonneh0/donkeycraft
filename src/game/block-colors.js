// Donkeycraft — Block Color Lookup
// Procedural block color and alpha lookup system for terrain debugging.
// References Donkeycraft.BlockRegistry for block IDs and properties.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  if (!Donkeycraft) return;

  /**
   * Map of block ID → RGB color array [r, g, b] (0-1 range).
   * @type {Object.<number, number[]>}
   * @private
   */
  var _blockColors = {};

  /**
   * Map of block ID → alpha value (0-1).
   * @type {Object.<number, number>}
   * @private
   */
  var _blockAlphas = {};

  /**
   * Flag indicating whether colors have been initialized.
   * @type {boolean}
   * @private
   */
  var _initialized = false;

  // ============================================================
  // Public API
  // ============================================================

  /**
   * BlockColors — procedural color and alpha lookup for blocks.
   * Must call init() after BlockRegistry is populated.
   * @namespace
   */
  Donkeycraft.BlockColors = {
    /**
     * Initialize the block color lookup tables from BlockRegistry.
     * Must be called once after BlockRegistry is populated.
     * Safe to call multiple times — clears previous state if re-initializing.
     *
     * Populates _blockColors (id → RGB array) and _blockAlphas (id → alpha value)
     * using procedural color generation based on block names. Air gets null color
     * and 0.0 alpha; transparent blocks get reduced alpha values for terrain visibility.
     */
    init: initBlockColors,

    /**
     * Get the RGB color for a block ID.
     * @param {number} bid - Block ID.
     * @returns {number[]|null} RGB array [r, g, b] in 0-1 range, or null if not found/air.
     */
    getColor: function (bid) {
      if (!_initialized) return null;
      return _blockColors[bid] || null;
    },

    /**
     * Get the alpha value for a block ID.
     * @param {number} bid - Block ID.
     * @returns {number} Alpha value in 0-1 range (defaults to 1.0).
     */
    getAlpha: function (bid) {
      if (!_initialized) return 1.0;
      return _blockAlphas[bid] !== undefined ? _blockAlphas[bid] : 1.0;
    },

    /**
     * Get all color mappings.
     * @returns {Object.<number, number[]>}
     */
    getAllColors: function () {
      return _blockColors;
    },

    /**
     * Get all alpha mappings.
     * @returns {Object.<number, number>}
     */
    getAllAlphas: function () {
      return _blockAlphas;
    },

    /**
     * Check whether colors have been initialized.
     * @returns {boolean}
     */
    isInitialized: function () {
      return _initialized;
    },
  };

  /**
   * Initialize the block color lookup tables from BlockRegistry.
   * Safe to call multiple times — clears previous state if re-initializing.
   *
   * Populates _blockColors (id → RGB array) and _blockAlphas (id → alpha value)
   * using procedural color generation based on block names. Air gets null color
   * and 0.0 alpha; transparent blocks get reduced alpha values for terrain visibility.
   */
  function initBlockColors() {
    try {
      // Clear previous state if re-initializing
      _blockColors = {};
      _blockAlphas = {};

      if (
        !Donkeycraft.BlockRegistry ||
        typeof Donkeycraft.BlockRegistry.getAllBlocks !== 'function'
      ) {
        // BlockRegistry not available — mark as initialized but empty
        _initialized = true;
        return;
      }

      var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
      for (var bi = 0; bi < blocks.length; bi++) {
        var b = blocks[bi];
        if (b.name === 'air') {
          _blockColors[b.id] = null;
          _blockAlphas[b.id] = 0.0;
          continue;
        }

        // Determine color procedurally from block name
        var color = _getColorFromName(b.name);
        _blockColors[b.id] = color;

        // Determine alpha from block properties
        var alpha = 0.9; // default solid block (semi-transparent for better terrain visibility)
        if (b.transparent) {
          if (b.name === 'water' || b.name === 'lava') alpha = 0.55;
          else if (b.name === 'glass' || b.name.indexOf('stained_glass') >= 0)
            alpha = 0.3;
          else if (b.name === 'ice' || b.name === 'blue_ice') alpha = 0.7;
          else if (b.name === 'snow_layer' || b.name === 'glass_pane')
            alpha = 0.6;
          else if (b.name === 'lily_pad') alpha = 0.4;
          else if (b.name === 'nether_portal' || b.name === 'end_portal')
            alpha = 0.5;
          else alpha = 0.85; // leaves, doors, etc.
        }
        _blockAlphas[b.id] = alpha;
      }

      _initialized = true;
    } catch (e) {
      // Graceful degradation — colors won't be available but game continues
      _initialized = true;
    }
  }

  /**
   * Get procedural color from block name.
   * @param {string} name - Block name.
   * @returns {number[]} RGB array [r, g, b] in 0-1 range.
   * @private
   */
  function _getColorFromName(name) {
    if (!name || typeof name !== 'string') return [0.5, 0.5, 0.5];

    var n = name.toLowerCase();

    // Direct matches from block registry names
    if (n.indexOf('grass_block') >= 0) return [0.35, 0.75, 0.25];
    if (n === 'stone' || n === 'cobbled_deepslate') return [0.5, 0.5, 0.5];
    if (n === 'granite') return [0.76, 0.58, 0.54];
    if (n === 'diorite') return [0.82, 0.82, 0.8];
    if (n === 'andesite') return [0.47, 0.5, 0.5];
    if (n === 'deepslate') return [0.3, 0.28, 0.32];
    if (n === 'dirt') return [0.5, 0.35, 0.2];
    if (n === 'gravel') return [0.55, 0.53, 0.47];
    if (n === 'sand') return [0.92, 0.86, 0.55];
    if (n === 'red_sand') return [0.72, 0.41, 0.25];
    if (
      n.indexOf('log') >= 0 ||
      n.indexOf('_wood') >= 0 ||
      n.indexOf('hyphae') >= 0
    )
      return [0.43, 0.31, 0.18];
    if (n.indexOf('planks') >= 0 || n.indexOf('_fence') >= 0)
      return [0.65, 0.49, 0.27];
    if (n === 'coal_ore') return [0.25, 0.25, 0.28];
    if (n === 'iron_ore') return [0.7, 0.6, 0.52];
    if (n === 'gold_ore') return [0.9, 0.8, 0.3];
    if (n === 'diamond_ore') return [0.3, 0.85, 0.8];
    if (n === 'emerald_ore') return [0.15, 0.8, 0.3];
    if (n === 'redstone_ore' || n === 'lit_redstone_ore')
      return [0.6, 0.15, 0.1];
    if (n === 'lapis_ore') return [0.2, 0.35, 0.75];
    if (n === 'nether_quartz_ore') return [0.85, 0.8, 0.65];
    if (n === 'nether_gold_ore') return [0.7, 0.6, 0.35];
    if (n === 'obsidian') return [0.12, 0.1, 0.15];
    if (n === 'crying_obsidian') return [0.4, 0.2, 0.55];
    if (n === 'bedrock') return [0.2, 0.2, 0.2];
    if (n === 'water') return [0.2, 0.4, 0.75];
    if (n === 'lava') return [0.8, 0.3, 0.05];
    if (n === 'snow_block') return [0.95, 0.95, 0.98];
    if (n === 'ice') return [0.6, 0.8, 0.85];
    if (n === 'blue_ice') return [0.3, 0.6, 0.8];
    if (n === 'brick' || n === 'bricks') return [0.6, 0.3, 0.22];
    if (n === 'nether_brick') return [0.2, 0.18, 0.22];
    if (n === 'red_nether_brick') return [0.5, 0.15, 0.12];
    if (n.indexOf('wool') >= 0) return _getWoolColor(n);
    if (n.indexOf('concrete') >= 0) return _getConcreteColor(n);
    if (n === 'sandstone') return [0.92, 0.85, 0.6];
    if (n === 'chiseled_sandstone' || n === 'cut_sandstone')
      return [0.88, 0.8, 0.55];
    if (n === 'snow_layer') return [0.95, 0.95, 0.98];
    if (n.indexOf('leaves') >= 0) return [0.2, 0.55, 0.15];
    if (n === 'sponge') return [0.9, 0.85, 0.2];
    if (n === 'wet_sponge') return [0.6, 0.55, 0.15];
    if (n === 'honey_block') return [0.85, 0.65, 0.15];
    if (n === 'slime') return [0.25, 0.8, 0.25];
    if (n === 'gold_block') return [0.95, 0.85, 0.2];
    if (n === 'iron_block') return [0.85, 0.82, 0.78];
    if (n === 'diamond_block') return [0.3, 0.9, 0.85];
    if (n === 'emerald_block') return [0.15, 0.85, 0.35];
    if (n === 'lapis_block') return [0.2, 0.3, 0.7];
    if (n === 'redstone_block') return [0.6, 0.1, 0.1];
    if (n === 'coal_block') return [0.15, 0.15, 0.15];
    if (n === 'netherrack') return [0.45, 0.25, 0.22];
    if (n === 'soul_sand') return [0.3, 0.28, 0.25];
    if (n === 'soul_soil') return [0.25, 0.22, 0.2];
    if (n === 'basalt' || n === 'polished_basalt') return [0.35, 0.35, 0.38];
    if (
      n === 'blackstone' ||
      n === 'gilded_blackstone' ||
      n === 'polished_blackstone'
    )
      return [0.2, 0.19, 0.22];
    if (n === 'end_stone' || n === 'end_stone_bricks')
      return [0.82, 0.78, 0.55];
    if (n === 'purpur_block' || n === 'purpur_pillar') return [0.75, 0.5, 0.7];
    if (n === 'chorus_plant') return [0.65, 0.35, 0.55];
    if (n === 'chorus_flower') return [0.8, 0.25, 0.55];
    if (n === 'shroomlight') return [0.9, 0.45, 0.1];
    if (n === 'magma') return [0.75, 0.3, 0.1];
    if (n === 'ancient_debris') return [0.55, 0.4, 0.28];
    if (n.indexOf('warped_') >= 0) return [0.15, 0.55, 0.45];
    if (n.indexOf('crimson_') >= 0) return [0.65, 0.15, 0.15];
    if (n === 'tnt') return [0.7, 0.25, 0.2];
    if (n === 'crafting_table') return [0.55, 0.38, 0.2];
    if (n === 'furnace' || n === 'blast_furnace' || n === 'smoker')
      return [0.5, 0.5, 0.5];
    if (n === 'lit_furnace') return [0.65, 0.55, 0.4];
    if (n === 'chest' || n === 'trapped_chest' || n === 'barrel')
      return [0.48, 0.32, 0.15];
    if (n === 'bookshelf') return [0.55, 0.38, 0.22];
    if (n === 'cobblestone') return [0.42, 0.42, 0.42];
    if (n.indexOf('stone_brick') >= 0) {
      if (n === 'mossy_stone_bricks') return [0.4, 0.5, 0.3];
      return [0.42, 0.42, 0.42];
    }
    if (
      n.indexOf('quartz_block') >= 0 ||
      n === 'chiseled_quartz_block' ||
      n === 'quartz_pillar'
    )
      return [0.9, 0.87, 0.78];
    if (n === 'smooth_stone') return [0.75, 0.72, 0.68];
    if (n.indexOf('grass') >= 0 && n !== 'grass_block')
      return [0.25, 0.6, 0.18];
    if (
      n.indexOf('flower') >= 0 ||
      n === 'poppy' ||
      n === 'blue_orchid' ||
      n === 'dandelion'
    )
      return [0.3, 0.65, 0.2];
    if (n === 'rose_bush' || n === 'sunflower') return [0.25, 0.55, 0.15];
    if (n === 'fern' || n === 'tall_grass' || n === 'vine')
      return [0.22, 0.55, 0.16];
    if (n === 'dead_bush') return [0.45, 0.35, 0.2];
    if (n === 'lily_pad') return [0.2, 0.5, 0.15];
    if (n.indexOf('door') >= 0) return [0.55, 0.4, 0.25];
    if (n === 'cloud') return [0.95, 0.95, 0.97];

    // Fallback: deterministic color from block name hash
    var h = ((_hashName(name) * 31 + 17) % 360) / 360;
    var s = 0.15 + ((_hashName(name) * 47 + 3) % 60) / 100;
    var l = 0.25 + ((_hashName(name) * 53 + 11) % 50) / 100;
    return _hslToRgb(h, s, l);
  }

  /**
   * Get wool color from name.
   * @param {string} name - Block name (e.g., "white_wool").
   * @returns {number[]} RGB array.
   * @private
   */
  function _getWoolColor(name) {
    var p = {
      white: [0.93, 0.93, 0.93],
      orange: [0.92, 0.51, 0.14],
      magenta: [0.72, 0.28, 0.73],
      light_blue: [0.39, 0.78, 0.91],
      yellow: [0.94, 0.87, 0.25],
      lime: [0.49, 0.89, 0.22],
      pink: [0.92, 0.63, 0.74],
      gray: [0.32, 0.32, 0.34],
      light_gray: [0.74, 0.75, 0.76],
      cyan: [0.18, 0.56, 0.6],
      purple: [0.62, 0.24, 0.68],
      blue: [0.2, 0.28, 0.73],
      brown: [0.36, 0.25, 0.16],
      green: [0.32, 0.56, 0.2],
      red: [0.73, 0.18, 0.14],
      black: [0.12, 0.12, 0.13],
    };
    var base = name.split('_')[0];
    return p[base] || [0.5, 0.5, 0.5];
  }

  /**
   * Get concrete color (same as matching wool color).
   * @param {string} name - Block name.
   * @returns {number[]} RGB array.
   * @private
   */
  function _getConcreteColor(name) {
    var n = name.replace('_powder', '');
    return _getWoolColor(n);
  }

  /**
   * Simple string hash for deterministic color generation.
   * @param {string} name - String to hash.
   * @returns {number} Positive hash value.
   * @private
   */
  function _hashName(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) {
      h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  /**
   * Convert HSL to RGB.
   * @param {number} h - Hue [0, 1).
   * @param {number} s - Saturation [0, 1].
   * @param {number} l - Lightness [0, 1].
   * @returns {number[]} RGB array [r, g, b] in 0-1 range.
   * @private
   */
  function _hslToRgb(h, s, l) {
    var r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var hue2rgb = function (p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
  }
})();
