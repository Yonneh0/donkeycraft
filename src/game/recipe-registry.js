// Donkeycraft — Recipe Registry
// Central registry for all crafting recipes, furnace recipes, shapeless recipes.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  // ============================================================
  // Recipe — represents a single crafting recipe
  // ============================================================

  /**
   * Recipe — a single crafting or smelting recipe definition.
   * @param {number} id - Unique recipe ID.
   * @param {string} type - Recipe type: "shaped", "shapeless", "smelt".
   * @param {Object[]} ingredients - Input ingredients. For shaped: 2×3 or 3×3 grid (null or blockId). For shapeless: [{id, count}].
   * @param {number} gridSize - Grid size: 2 for inventory crafting, 3 for crafting table.
   * @param {number} outputBlockId - Block ID of the output item.
   * @param {number} [outputCount=1] — Number of output items.
   * @param {number} [cookingTime=200] — Smelting time in ticks (200 = 10 seconds). Only for "smelt" type.
   */
  Donkeycraft.Recipe = function (
    id,
    type,
    ingredients,
    gridSize,
    outputBlockId,
    outputCount,
    cookingTime
  ) {
    this.id = id;
    this.type = type; // "shaped", "shapeless", "smelt"
    this.ingredients = ingredients;
    this.gridSize = gridSize; // 2 or 3
    this.outputBlockId = outputBlockId;
    this.outputCount = outputCount || 1;
    this.cookingTime = cookingTime || 200;
  };

  // ============================================================
  // RecipeRegistry — central registry for all recipes
  // ============================================================

  /**
   * RecipeRegistry — central registry for crafting and smelting recipes.
   */
  Donkeycraft.RecipeRegistry = (function () {
    var _shapedRecipes = []; // Array of shaped recipes (2×2 and 3×3)
    var _shapelessRecipes = []; // Array of shapeless recipes
    var _smeltRecipes = {}; // inputBlockId -> Recipe

    /**
     * Add a shaped recipe to the registry.
     * @param {Donkeycraft.Recipe} recipe - The shaped recipe to add.
     */
    function addShapedRecipe(recipe) {
      if (recipe.type === 'shaped') {
        _shapedRecipes.push(recipe);
      }
    }

    /**
     * Add a shapeless recipe to the registry.
     * @param {Donkeycraft.Recipe} recipe - The shapeless recipe to add.
     */
    function addShapelessRecipe(recipe) {
      if (recipe.type === 'shapeless') {
        _shapelessRecipes.push(recipe);
      }
    }

    /**
     * Add a smelting recipe to the registry.
     * @param {Donkeycraft.Recipe} recipe - The smelt recipe to add.
     */
    function addSmeltRecipe(recipe) {
      if (recipe.type === 'smelt') {
        for (var i = 0; i < recipe.ingredients.length; i++) {
          var ing = recipe.ingredients[i];
          if (ing !== null && ing.id !== undefined) {
            _smeltRecipes[ing.id] = recipe;
          }
        }
      }
    }

    /**
     * Add a recipe (auto-detects type).
     * @param {Donkeycraft.Recipe} recipe - The recipe to add.
     */
    function addRecipe(recipe) {
      switch (recipe.type) {
        case 'shaped':
          addShapedRecipe(recipe);
          break;
        case 'shapeless':
          addShapelessRecipe(recipe);
          break;
        case 'smelt':
          addSmeltRecipe(recipe);
          break;
      }
    }

    // ============================================================
    // Shaped Recipe Matching
    // ============================================================

    /**
     * Match a shaped recipe against an input grid.
     * Tries matching against the provided grid size first, then falls back to
     * smaller grid sizes (e.g., 2×2 recipes on a 3×3 grid).
     * @param {number[][]} inputGrid - 2D array of block IDs (0 for empty slots).
     * @param {number} rows - Number of rows in the grid.
     * @param {number} cols - Number of columns in the grid.
     * @returns {Donkeycraft.Recipe|null} The first matching recipe, or null.
     */
    function matchShapedRecipe(inputGrid, rows, cols) {
      // Validate inputs early to prevent downstream errors.
      if (
        !inputGrid ||
        !Array.isArray(inputGrid) ||
        typeof rows !== 'number' ||
        typeof cols !== 'number'
      ) {
        return null;
      }
      if (rows <= 0 || cols <= 0) return null;

      // Build a list of candidate grid sizes to try: start with exact match,
      // then fall back to smaller grids (e.g., 3×3 → 2×2).
      var candidates = [];

      // Try exact grid size first
      candidates.push({ rows: rows, cols: cols });

      // Fall back to smaller square grids if the input is larger
      if (rows >= 3 && cols >= 3) {
        candidates.push({ rows: 2, cols: 2 });
      } else if (rows === 2 && cols === 3) {
        // No smaller standard grid to fall back to for 2×3
      } else if (rows === 3 && cols === 2) {
        // No smaller standard grid to fall back to for 3×2
      }

      for (var r = 0; r < _shapedRecipes.length; r++) {
        var recipe = _shapedRecipes[r];

        for (var c = 0; c < candidates.length; c++) {
          var cand = candidates[c];
          if (
            recipe.gridSize !== cand.cols ||
            recipe.ingredients.length / recipe.gridSize !== cand.rows
          )
            continue;

          if (_checkShapedMatch(recipe, inputGrid, cand.rows, cand.cols)) {
            return recipe;
          }
        }
      }
      return null;
    }

    /**
     * Check if a shaped recipe matches the input grid (including rotations).
     * @param {Donkeycraft.Recipe} recipe - The recipe to check.
     * @param {number[][]} inputGrid - Input grid.
     * @param {number} rows - Grid rows.
     * @param {number} cols - Grid columns.
     * @returns {boolean}
     * @private
     */
    function _checkShapedMatch(recipe, inputGrid, rows, cols) {
      var ingRows = recipe.ingredients.length / recipe.gridSize;
      var ingCols = recipe.gridSize;

      // Validate that the input grid has the expected number of rows.
      if (!Array.isArray(inputGrid) || inputGrid.length < rows) return false;

      // Try all possible positions in the grid
      for (var gr = 0; gr <= rows - ingRows; gr++) {
        for (var gc = 0; gc <= cols - ingCols; gc++) {
          if (_matchAtPosition(recipe, inputGrid, gr, gc, rows, cols)) {
            return true;
          }
        }
      }

      // Try all 4 rotations
      for (var rot = 1; rot < 4; rot++) {
        var rotated = _rotateIngredients(recipe, rot);
        // Recalculate dimensions for the rotated recipe — rotation may swap rows/cols.
        var rIngRows = rotated.ingredients.length / rotated.gridSize;
        var rIngCols = rotated.gridSize;

        for (var gr2 = 0; gr2 <= rows - rIngRows; gr2++) {
          for (var gc2 = 0; gc2 <= cols - rIngCols; gc2++) {
            if (_matchAtPosition(rotated, inputGrid, gr2, gc2, rows, cols)) {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Check if recipe matches at a specific grid position.
     * @param {Donkeycraft.Recipe} recipe - The recipe to check.
     * @param {number[][]} inputGrid - Input grid.
     * @param {number} gridRow - Grid row offset.
     * @param {number} gridCol - Grid column offset.
     * @param {number} rows - Grid rows.
     * @param {number} cols - Grid columns.
     * @returns {boolean}
     * @private
     */
    function _matchAtPosition(recipe, inputGrid, gridRow, gridCol, rows, cols) {
      var ingRows = recipe.ingredients.length / recipe.gridSize;
      var ingCols = recipe.gridSize;

      for (var ir = 0; ir < ingRows; ir++) {
        for (var ic = 0; ic < ingCols; ic++) {
          var gridR = gridRow + ir;
          var gridC = gridCol + ic;
          if (gridR >= rows || gridC >= cols) return false;

          // Defensive check: ensure inputGrid[gridR] is a valid array.
          var gridRowArr = inputGrid[gridR];
          if (!Array.isArray(gridRowArr)) return false;

          var ingId = recipe.ingredients[ir * ingCols + ic];
          var gridId = gridRowArr[gridC];

          // Null ingredient requires empty slot (gridId must be null or 0)
          if (ingId === null || ingId === 0) {
            if (gridId !== null && gridId !== 0) return false;
            continue;
          }
          // Non-null ingredient must match grid block
          if (ingId !== gridId) return false;
        }
      }
      return true;
    }

    /**
     * Rotate ingredients array clockwise N times.
     * Converts flat array → grid → rotate → flat array.
     * For non-square recipes (e.g., 2×3), rotation swaps dimensions and the
     * resulting flat array is padded with nulls to maintain gridSize × gridSize shape.
     * @param {Donkeycraft.Recipe} recipe - The recipe to rotate.
     * @param {number} times - Number of 90° rotations (1-4).
     * @returns {Donkeycraft.Recipe}
     * @private
     */
    function _rotateIngredients(recipe, times) {
      times = ((times % 4) + 4) % 4; // normalize to 0-3
      if (times === 0 || !recipe.ingredients || recipe.gridSize <= 0) {
        return new Donkeycraft.Recipe(
          recipe.id,
          recipe.type,
          recipe.ingredients.slice(),
          recipe.gridSize,
          recipe.outputBlockId,
          recipe.outputCount,
          recipe.cookingTime
        );
      }

      var cols = recipe.gridSize;
      var rows = recipe.ingredients.length / cols;

      // Guard against malformed recipes.
      if (rows <= 0 || cols <= 0) {
        return new Donkeycraft.Recipe(
          recipe.id,
          recipe.type,
          recipe.ingredients.slice(),
          recipe.gridSize,
          recipe.outputBlockId,
          recipe.outputCount,
          recipe.cookingTime
        );
      }

      var grid = [];

      // Step 1: Convert flat array to 2D grid
      for (var r = 0; r < rows; r++) {
        grid[r] = [];
        for (var c = 0; c < cols; c++) {
          var idx = r * cols + c;
          grid[r][c] =
            recipe.ingredients[idx] !== undefined
              ? recipe.ingredients[idx]
              : null;
        }
      }

      // Step 2: Rotate the grid clockwise N times
      var rotatedGrid = grid;
      var curRows = rows;
      var curCols = cols;
      for (var rot = 0; rot < times; rot++) {
        var newGrid = [];
        for (var nr = 0; nr < curCols; nr++) {
          newGrid[nr] = [];
          for (var nc = 0; nc < curRows; nc++) {
            newGrid[nr][nc] = rotatedGrid[curRows - 1 - nc][nr];
          }
        }
        rotatedGrid = newGrid;
        // Swap rows and cols after rotation
        var tempRows = curRows;
        curRows = curCols;
        curCols = tempRows;
      }

      // Step 3: Convert rotated grid back to flat array.
      // The rotated grid may have different dimensions than the original,
      // but we preserve the original gridSize for matching purposes.
      // Pad with nulls if the rotated grid is smaller, truncate if larger.
      var finalCols = recipe.gridSize;
      var finalRows = Math.ceil(recipe.ingredients.length / recipe.gridSize);
      var flatIngredients = [];
      for (var fr = 0; fr < finalRows; fr++) {
        for (var fc = 0; fc < finalCols; fc++) {
          if (
            fr < rotatedGrid.length &&
            rotatedGrid[fr] &&
            rotatedGrid[fr][fc] !== undefined
          ) {
            flatIngredients.push(rotatedGrid[fr][fc]);
          } else {
            flatIngredients.push(null);
          }
        }
      }

      return new Donkeycraft.Recipe(
        recipe.id,
        recipe.type,
        flatIngredients,
        recipe.gridSize,
        recipe.outputBlockId,
        recipe.outputCount,
        recipe.cookingTime
      );
    }

    // ============================================================
    // Shapeless Recipe Matching
    // ============================================================

    /**
     * Match shapeless recipes against an inventory of items.
     * @param {Object.<number, number>} itemCounts - Map of blockId -> count.
     * @returns {Donkeycraft.Recipe|null} The first matching recipe, or null.
     */
    function matchShapelessRecipe(itemCounts) {
      // Guard: validate that itemCounts is a valid object.
      if (
        !itemCounts ||
        typeof itemCounts !== 'object' ||
        Array.isArray(itemCounts)
      ) {
        return null;
      }

      for (var r = 0; r < _shapelessRecipes.length; r++) {
        var recipe = _shapelessRecipes[r];
        if (_checkShapelessMatch(recipe, itemCounts)) {
          return recipe;
        }
      }
      return null;
    }

    /**
     * Check if a shapeless recipe matches the item counts.
     * @param {Donkeycraft.Recipe} recipe - The recipe to check.
     * @param {Object.<number, number>} itemCounts - Item counts.
     * @returns {boolean}
     * @private
     */
    function _checkShapelessMatch(recipe, itemCounts) {
      // Guard: ensure itemCounts is a valid lookup object.
      if (!itemCounts || typeof itemCounts !== 'object') return false;

      var needed = {};
      for (var i = 0; i < recipe.ingredients.length; i++) {
        var ing = recipe.ingredients[i];
        if (ing !== null && ing.id !== undefined) {
          needed[ing.id] = (needed[ing.id] || 0) + (ing.count || 1);
        }
      }

      for (var id in needed) {
        if (needed.hasOwnProperty(id)) {
          var have = itemCounts[id] || 0;
          if (have < needed[id]) return false;
        }
      }
      return true;
    }

    // ============================================================
    // Smelting Recipe Lookup
    // ============================================================

    /**
     * Get the smelting output for an input block ID.
     * @param {number} inputBlockId - Input block/item ID.
     * @returns {Donkeycraft.Recipe|null} The smelting recipe, or null.
     */
    function getSmeltRecipe(inputBlockId) {
      return _smeltRecipes[inputBlockId] || null;
    }

    /**
     * Get the smelting output block ID for an input block ID.
     * @param {number} inputBlockId - Input block ID.
     * @returns {number|null} Output block ID, or null if no recipe.
     */
    function getSmeltOutput(inputBlockId) {
      var recipe = _smeltRecipes[inputBlockId];
      return recipe ? recipe.outputBlockId : null;
    }

    /**
     * Get the smelting time for an input block ID.
     * @param {number} inputBlockId - Input block ID.
     * @returns {number} Smelting time in ticks (default 200).
     */
    function getSmeltTime(inputBlockId) {
      var recipe = _smeltRecipes[inputBlockId];
      return recipe ? recipe.cookingTime : 200;
    }

    // ============================================================
    // Utility Methods
    // ============================================================

    /**
     * Get all registered recipes as an array.
     * @returns {Donkeycraft.Recipe[]}
     */
    function getAllRecipes() {
      var result = [];
      for (var i = 0; i < _shapedRecipes.length; i++) {
        result.push(_shapedRecipes[i]);
      }
      for (var j = 0; j < _shapelessRecipes.length; j++) {
        result.push(_shapelessRecipes[j]);
      }
      for (var key in _smeltRecipes) {
        if (_smeltRecipes.hasOwnProperty(key)) {
          result.push(_smeltRecipes[key]);
        }
      }
      return result;
    }

    /**
     * Get the number of shaped recipes.
     * @returns {number}
     */
    function getShapedCount() {
      return _shapedRecipes.length;
    }

    /**
     * Get the number of shapeless recipes.
     * @returns {number}
     */
    function getShapelessCount() {
      return _shapelessRecipes.length;
    }

    /**
     * Get the number of smelting recipes.
     * @returns {number}
     */
    function getSmeltCount() {
      return Object.keys(_smeltRecipes).length;
    }

    /**
     * Get a recipe by its unique ID.
     * @param {number} id - Recipe ID.
     * @returns {Donkeycraft.Recipe|null} The recipe, or null if not found.
     */
    function getRecipeById(id) {
      for (var i = 0; i < _shapedRecipes.length; i++) {
        if (_shapedRecipes[i].id === id) return _shapedRecipes[i];
      }
      for (var j = 0; j < _shapelessRecipes.length; j++) {
        if (_shapelessRecipes[j].id === id) return _shapelessRecipes[j];
      }
      for (var key in _smeltRecipes) {
        if (_smeltRecipes.hasOwnProperty(key) && _smeltRecipes[key].id === id) {
          return _smeltRecipes[key];
        }
      }
      return null;
    }

    // ============================================================
    // Register all vanilla recipes
    // ============================================================

    /**
     * Register a shaped recipe by its parameters.
     * @param {number} id - Recipe ID.
     * @param {number[]} ingredients - Flat array of block IDs (null for empty).
     * @param {number} gridSize - 2 or 3.
     * @param {number} outputBlockId - Output block ID.
     * @param {number} [outputCount=1]
     * @returns {Donkeycraft.Recipe}
     */
    function registerShaped(
      id,
      ingredients,
      gridSize,
      outputBlockId,
      outputCount
    ) {
      var recipe = new Donkeycraft.Recipe(
        id,
        'shaped',
        ingredients,
        gridSize,
        outputBlockId,
        outputCount
      );
      _shapedRecipes.push(recipe);
      return recipe;
    }

    /**
     * Register a shapeless recipe by its parameters.
     * @param {number} id - Recipe ID.
     * @param {Object[]} ingredients - Array of {id, count} objects.
     * @param {number} outputBlockId - Output block ID.
     * @param {number} [outputCount=1]
     * @returns {Donkeycraft.Recipe}
     */
    function registerShapeless(id, ingredients, outputBlockId, outputCount) {
      var recipe = new Donkeycraft.Recipe(
        id,
        'shapeless',
        ingredients,
        0,
        outputBlockId,
        outputCount
      );
      _shapelessRecipes.push(recipe);
      return recipe;
    }

    /**
     * Register a smelting recipe by its parameters.
     * @param {number} id - Recipe ID.
     * @param {number} inputBlockId - Input block ID.
     * @param {number} outputBlockId - Output block ID.
     * @param {number} [cookingTime=200]
     * @returns {Donkeycraft.Recipe}
     */
    function registerSmelt(id, inputBlockId, outputBlockId, cookingTime) {
      var recipe = new Donkeycraft.Recipe(
        id,
        'smelt',
        [{ id: inputBlockId }],
        0,
        outputBlockId,
        1,
        cookingTime
      );
      _smeltRecipes[inputBlockId] = recipe;
      return recipe;
    }

    // ---- Shaped Recipes (2×2 inventory crafting) ----

    // Planks from logs
    registerShaped(1, [24, null, 24, null], 2, 30, 4); // oak_log -> oak_planks
    registerShaped(2, [25, null, 25, null], 2, 31, 4); // spruce_log -> spruce_planks
    registerShaped(3, [26, null, 26, null], 2, 32, 4); // birch_log -> birch_planks
    registerShaped(4, [27, null, 27, null], 2, 33, 4); // jungle_log -> jungle_planks
    registerShaped(5, [28, null, 28, null], 2, 34, 4); // acacia_log -> acacia_planks
    registerShaped(6, [29, null, 29, null], 2, 35, 4); // dark_oak_log -> dark_oak_planks

    // Sticks
    registerShaped(7, [30, null, 30, null], 2, 310, 4); // oak_planks -> sticks (4)

    // Crafting table
    registerShaped(8, [30, 30, 30, 30], 2, 195, 1); // 4 oak_planks -> crafting_table

    // Chest
    registerShaped(9, [138, 138, 138, 138], 2, 187, 1); // 4 cobblestone -> chest (simplified)

    // Stairs
    registerShaped(10, [30, null, 30, 30, 30, 30], 3, 136, 4); // oak_planks -> oak_stairs

    // Slabs
    registerShaped(11, [30, 30, 30, 30, 30, 30], 3, 129, 6); // 6 oak_planks -> 6 oak_slabs

    // Fences
    registerShaped(12, [30, 30, 30, 310, 30, 30], 3, 151, 4); // oak_planks + sticks -> oak_fence

    // Walls
    registerShaped(13, [138, 138, 138, 138, 138, 138], 3, 152, 6); // 6 cobblestone -> 6 cobblestone_wall

    // Tables (smooth stone)
    registerShaped(14, [113, 113, 113, 113], 2, 114, 1); // smooth_stone -> smooth_stone_slab

    // Glass pane
    registerShaped(15, [45, 45, 45, 45, 45, 45], 3, 47, 16); // 6 glass -> 16 glass_pane

    // Snow block
    registerShaped(16, [51, 51, 51, 51], 2, 501, 1); // 4 snowballs -> snow_block

    // Hay bale
    registerShaped(17, [310, 310, 310, 310], 2, 239, 1); // 9 sticks -> hay_block

    // Ladder (3×3 grid: 2 vertical stick columns + 5 horizontal stick slots)
    registerShaped(
      18,
      [310, null, 310, 310, 310, 310, 310, null, 310],
      3,
      311,
      4
    ); // sticks -> ladder

    // Torch
    registerShaped(19, [310, null, 310, null, null, null], 3, 312, 4); // coal + sticks -> torches

    // Iron bars
    registerShaped(20, [221, 221, 221, 221, 221, 221], 3, 313, 16); // 6 iron_ingot -> 16 iron_bars

    // Bookshelf
    registerShaped(21, [30, 30, 30, 214, 214, 214, 30, 30, 30], 3, 184, 1); // planks + coal + planks -> bookshelf

    // Furnace
    registerShaped(
      22,
      [138, 138, 138, 138, null, null, 138, 138, 138],
      3,
      191,
      1
    ); // cobblestone -> furnace

    // Cake
    registerShaped(23, [69, 57, 69, 51, 51, 51, 69, 69, 69], 3, 314, 1); // milk + sugar + egg + wheat -> cake

    // Bed
    registerShaped(24, [67, 67, 67, 30, 30, 30, 30, 30, 30], 3, 202, 1); // wool + planks -> oak_bed

    // Door
    registerShaped(25, [30, 30, 30, 30, 30, 30], 3, 315, 3); // 6 planks -> 3 oak_door

    // Trapdoor
    registerShaped(26, [30, 30, 30, 30, 30, 30], 3, 316, 2); // 6 planks -> 2 trapdoor

    // Boat (not implemented yet, but registered)
    registerShaped(27, [30, null, 30, 30, 30, 30, null, 30, 30], 3, 317, 1);

    // Bucket
    registerShaped(28, [221, null, 221, 221, null, 221], 3, 318, 1); // 3 iron_ingot -> bucket

    // Bowl
    registerShaped(
      29,
      [30, null, null, 30, null, null, 30, null, null],
      3,
      319,
      1
    ); // planks -> bowl (simplified)

    // Shield (not implemented yet, but registered)
    registerShaped(30, [221, 30, 221, 30, 30, 30, null, 30, null], 3, 320, 1);

    // ---- Shaped Recipes (3×3 crafting table) ----

    // Enchanting table
    registerShaped(
      31,
      [227, 219, 227, 214, 214, 214, 210, 210, 210],
      3,
      199,
      1
    ); // diamonds + obsidian + blood moon -> enchanting_table

    // Anvil
    registerShaped(
      32,
      [226, null, 226, null, null, null, 221, 221, 221],
      3,
      196,
      1
    ); // iron_block + iron_ingot -> anvil

    // Beacon
    registerShaped(
      33,
      [227, 227, 227, 227, 211, 227, 227, 227, 227],
      3,
      321,
      1
    ); // 5 diamonds + glass + nether_star -> beacon

    // Clock
    registerShaped(
      34,
      [222, 222, 222, 222, 214, 222, 222, 222, 222],
      3,
      322,
      1
    ); // gold_ingot + redstone -> clock

    // Compass
    registerShaped(
      35,
      [222, 222, 222, 214, 222, 222, 222, 222, 222],
      3,
      323,
      1
    ); // gold_ingot + redstone -> compass

    // Redstone lamp
    registerShaped(
      36,
      [230, 230, 230, 230, 225, 230, 230, 230, 230],
      3,
      175,
      1
    ); // redstone + gold -> redstone_lamp

    // Dropper
    registerShaped(
      37,
      [138, 138, 138, 138, 230, 138, 138, 230, 138],
      3,
      178,
      1
    ); // cobblestone + redstone -> dropper

    // Dispenser
    registerShaped(
      38,
      [138, 138, 138, 138, 230, 138, 138, 310, 138],
      3,
      177,
      1
    ); // cobblestone + redstone + bow -> dispenser

    // Note block
    registerShaped(39, [30, 30, 30, 30, 219, 30, 30, 30, 30], 3, 324, 1); // planks + emerald -> note_block

    // Piston
    registerShaped(
      40,
      [138, 138, 138, 138, 230, 138, 138, 126, 138],
      3,
      181,
      1
    ); // cobblestone + redstone + obsidian -> piston

    // Sticky piston
    registerShaped(41, [181, null, 213, null, null, null], 3, 182, 1); // piston + slime_ball -> sticky_piston

    // Observer
    registerShaped(
      42,
      [138, 138, null, 230, 230, null, 227, 227, null],
      3,
      179,
      1
    ); // cobblestone + redstone + quartz -> observer

    // Lever
    registerShaped(43, [214, 138], 2, 145, 1); // coal + cobblestone -> lever

    // Stone pressure plate
    registerShaped(44, [138, 138], 2, 146, 1); // 2 cobblestone -> stone_pressure_plate

    // Wood pressure plate
    registerShaped(45, [30, 30], 2, 147, 1); // 2 oak_planks -> oak_pressure_plate

    // Stone button
    registerShaped(46, [138], 1, 143, 1); // 1 cobblestone -> stone_button

    // Tripwire hook
    registerShaped(47, [221, null, 310, 151], 2, 325, 2); // iron_ingot + stick + fence -> tripwire_hook

    // Daylight detector — glass_pane=47, quartz_block=234
    registerShaped(
      48,
      [227, 227, null, 47, 47, null, 234, 234, null],
      3,
      326,
      1
    );

    // Glazed terracotta (simplified)
    registerShaped(
      49,
      [101, 101, 101, 101, 230, 230, 101, 101, 101],
      3,
      327,
      1
    );

    // Cartography table (not fully implemented)
    registerShaped(
      50,
      [30, 30, null, 30, 30, null, null, 310, null],
      3,
      328,
      1
    );

    // Grindstone (not fully implemented)
    registerShaped(
      51,
      [30, 30, null, 310, null, null, 138, null, null],
      3,
      329,
      1
    );

    // Lectern
    registerShaped(
      52,
      [197, null, null, 30, 30, 30, null, null, null],
      3,
      186,
      1
    );

    // Loom (not fully implemented)
    registerShaped(
      53,
      [310, 310, null, 310, 310, null, null, 30, null],
      3,
      330,
      1
    );

    // Smithing table
    registerShaped(
      54,
      [226, null, null, 30, 30, null, null, null, null],
      3,
      331,
      1
    );

    // Stonecutter
    registerShaped(
      55,
      [226, null, null, 214, null, null, null, null, null],
      3,
      332,
      1
    );

    // Barrel
    registerShaped(56, [36, 36, 36, null, null, null, 36, 36, 36], 3, 190, 1);

    // Campfire (not fully implemented)
    registerShaped(
      57,
      [310, 310, 310, 310, 214, 310, null, null, null],
      3,
      333,
      1
    );

    // Signal stone flower (not implemented)
    // Sniffer egg (not implemented)

    // ---- Shapeless Recipes ----

    // Wool from string (not vanilla, but useful)
    registerShapeless(100, [{ id: 310, count: 4 }], 53, 1); // 4 string -> white_wool

    // Snowball from snow block
    registerShapeless(101, [{ id: 51 }], 502, 4); // snow_block -> 4 snowballs

    // Sugar from sugar cane
    registerShapeless(102, [{ id: 171 }], 503, 1); // sugar_cane -> sugar

    // Paper from reeds
    registerShapeless(103, [{ id: 172, count: 3 }], 504, 3); // 3 reeds -> 3 paper

    // Book from paper + leather
    registerShapeless(104, [{ id: 504, count: 3 }, { id: 505 }], 506, 1); // 3 paper + leather -> book

    // Firework rocket (simplified)
    registerShapeless(105, [{ id: 504, count: 3 }, { id: 214 }], 507, 3); // 3 paper + gunpowder -> 3 firework_rocket

    // Glass from sand
    registerShapeless(106, [{ id: 19 }], 45, 1); // sand -> glass

    // Smooth stone from stone
    registerShapeless(107, [{ id: 1 }], 113, 1); // stone -> smooth_stone

    // Brick from clay ball
    registerShapeless(108, [{ id: 508 }], 104, 1); // clay_ball -> brick

    // Clay block from clay balls
    registerShapeless(109, [{ id: 508, count: 4 }], 509, 1); // 4 clay_ball -> clay_block

    // Iron block from ingots
    registerShapeless(110, [{ id: 221, count: 9 }], 226, 1); // 9 iron_ingot -> iron_block

    // Gold block from ingots
    registerShapeless(111, [{ id: 222, count: 9 }], 225, 1); // 9 gold_ingot -> gold_block

    // Diamond block from diamonds
    registerShapeless(112, [{ id: 218, count: 9 }], 227, 1); // 9 diamond -> diamond_block

    // Emerald block from emeralds
    registerShapeless(113, [{ id: 219, count: 9 }], 228, 1); // 9 emerald -> emerald_block

    // Coal block from coal
    registerShapeless(114, [{ id: 214, count: 9 }], 232, 1); // 9 coal -> coal_block

    // Lapis block from lapis lazuli
    registerShapeless(115, [{ id: 220, count: 9 }], 231, 1); // 9 lapis -> lapis_block

    // Redstone block from redstone
    registerShapeless(116, [{ id: 229, count: 9 }], 230, 1); // 9 redstone -> redstone_block

    // Quartz block from quartz
    registerShapeless(117, [{ id: 239, count: 4 }], 234, 1); // 4 quartz -> quartz_block

    // Bone meal from bones
    registerShapeless(118, [{ id: 509 }], 510, 3); // bone -> 3 bone_meal

    // Glass pane from glass
    registerShapeless(119, [{ id: 45, count: 6 }], 47, 16); // 6 glass -> 16 glass_pane

    // Iron ingot from iron_block
    registerShapeless(120, [{ id: 226 }], 221, 9); // iron_block -> 9 iron_ingot

    // Gold ingot from gold_block
    registerShapeless(121, [{ id: 225 }], 222, 9); // gold_block -> 9 gold_ingot

    // Diamond from diamond_block
    registerShapeless(122, [{ id: 227 }], 218, 9); // diamond_block -> 9 diamond

    // Emerald from emerald_block
    registerShapeless(123, [{ id: 228 }], 219, 9); // emerald_block -> 9 emerald

    // Coal from coal_block
    registerShapeless(124, [{ id: 232 }], 214, 9); // coal_block -> 9 coal

    // Lapis from lapis_block
    registerShapeless(125, [{ id: 231 }], 220, 9); // lapis_block -> 9 lapis_lazuli

    // Redstone from redstone_block
    registerShapeless(126, [{ id: 230 }], 229, 9); // redstone_block -> 9 redstone_dust

    // Quartz from quartz_block
    registerShapeless(127, [{ id: 234 }], 239, 4); // quartz_block -> 4 quartz

    // ---- Smelting Recipes ----

    // Stone from cobblestone
    registerSmelt(200, 138, 113, 200); // cobblestone -> smooth_stone

    // Glass from sand
    registerSmelt(201, 19, 45, 200); // sand -> glass

    // Iron ingot from iron ore
    registerSmelt(202, 11, 221, 200); // iron_ore -> iron_ingot

    // Gold ingot from gold ore
    registerSmelt(203, 12, 222, 200); // gold_ore -> gold_ingot

    // Diamond from diamond ore (already diamond, but smelting doesn't change)
    // (diamonds don't need smelting in vanilla, but we register it for completeness)

    // Emerald from emerald ore
    registerSmelt(204, 14, 219, 200); // emerald_ore -> emerald

    // Lapis from lapis ore (already lapis, smelting doesn't help)
    // (lapis doesn't need smelting in vanilla)

    // Coal from coal ore (already coal, smelting doesn't change)
    // (coal doesn't need smelting in vanilla)

    // Smooth stone from stone
    registerSmelt(205, 1, 113, 200); // stone -> smooth_stone

    // Brick from cobblestone/nether_brick
    registerSmelt(206, 106, 104, 200); // nether_bricks -> brick (simplified)

    // Glass from red sand
    registerSmelt(207, 20, 45, 200); // red_sand -> glass (colored)

    // Chiseled stone bricks from stone
    registerSmelt(208, 1, 43, 200); // stone -> chiseled_stone_bricks (simplified)

    // Polished stones from regular stones
    registerSmelt(209, 2, 117, 200); // granite -> polished_granite
    registerSmelt(210, 3, 115, 200); // diorite -> polished_diorite
    registerSmelt(211, 4, 116, 200); // andesite -> polished_andesite

    // Raw materials to ingots
    registerSmelt(212, 215, 221, 200); // raw_iron -> iron_ingot
    registerSmelt(213, 216, 222, 200); // raw_gold -> gold_ingot
    registerSmelt(214, 217, 218, 200); // raw_diamond -> diamond (fantasy)

    // Sand from gravel (not vanilla, but useful)
    // (gravel doesn't smelt to sand in vanilla)

    // Pearlescent fungus processing
    registerSmelt(215, 18, 46, 200); // crying_obsidian -> tinted_glass (fantasy)

    // Charcoal from logs (not implemented in block.js but useful)
    // registerSmelt(charcoal_log, coal_block_or_coal_item);

    /**
     * Get all registered smelting recipes as an array.
     * @returns {Donkeycraft.Recipe[]}
     */
    function getSmeltRecipes() {
      var result = [];
      for (var key in _smeltRecipes) {
        if (_smeltRecipes.hasOwnProperty(key)) {
          result.push(_smeltRecipes[key]);
        }
      }
      return result;
    }

    // ============================================================
    // Public API
    // ============================================================

    return {
      // Recipe class
      Recipe: Donkeycraft.Recipe,

      // Add recipes
      addRecipe: addRecipe,
      addShapedRecipe: addShapedRecipe,
      addShapelessRecipe: addShapelessRecipe,
      addSmeltRecipe: addSmeltRecipe,

      // Register helper methods
      registerShaped: registerShaped,
      registerShapeless: registerShapeless,
      registerSmelt: registerSmelt,

      // Match recipes
      matchShapedRecipe: matchShapedRecipe,
      matchShapelessRecipe: matchShapelessRecipe,
      getSmeltRecipe: getSmeltRecipe,
      getSmeltOutput: getSmeltOutput,
      getSmeltTime: getSmeltTime,
      getSmeltRecipes: getSmeltRecipes,

      // Utility
      getAllRecipes: getAllRecipes,
      getRecipeById: getRecipeById,
      getShapedCount: getShapedCount,
      getShapelessCount: getShapelessCount,
      getSmeltCount: getSmeltCount,
    };
  })();
})();
