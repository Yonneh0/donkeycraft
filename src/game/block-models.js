// Donkeycraft — Block Models
// Baked models: face definitions for each block, AO (ambient occlusion) data, and UV coordinate mapping.
//
// Texture UV Mapping:
// - Each block face references a texture by name, which is looked up in the BlockRegistry
// - The texture's block ID maps to atlas grid position: col = id % 16, row = floor(id / 16)
// - Textures are flipped vertically during atlas upload so canvas row 0 (visual top) → texture V=1 (top of tile)
// - This ensures side faces render correctly: grass at world-top, dirt at world-bottom
// - Up/down faces use partial tile UVs to maintain correct orientation after flip
// - Block IDs >= 256 fall back to the placeholder texture (ID 0)
//
// @module block-models
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // Face direction constants
    // ============================================================

    /**
     * Face direction index: Up (positive Y axis).
     * @constant {number}
     */
    var FACE_UP = 0;

    /**
     * Face direction index: Down (negative Y axis).
     * @constant {number}
     */
    var FACE_DOWN = 1;

    /**
     * Face direction index: North (negative Z axis).
     * @constant {number}
     */
    var FACE_NORTH = 2;

    /**
     * Face direction index: South (positive Z axis).
     * @constant {number}
     */
    var FACE_SOUTH = 3;

    /**
     * Face direction index: East (positive X axis).
     * @constant {number}
     */
    var FACE_EAST = 4;

    /**
     * Face direction index: West (negative X axis).
     * @constant {number}
     */
    var FACE_WEST = 5;

    // ============================================================
    // Export face constants for external use (outside BlockModelRegistry)
    // ============================================================

    /**
     * Face direction indices — exported for external access.
     * @constant {number}
     */
    Donkeycraft.FACE_UP = FACE_UP;

    /**
     * Face direction indices — exported for external access.
     * @constant {number}
     */
    Donkeycraft.FACE_DOWN = FACE_DOWN;

    /**
     * Face direction indices — exported for external access.
     * @constant {number}
     */
    Donkeycraft.FACE_NORTH = FACE_NORTH;

    /**
     * Face direction indices — exported for external access.
     * @constant {number}
     */
    Donkeycraft.FACE_SOUTH = FACE_SOUTH;

    /**
     * Face direction indices — exported for external access.
     * @constant {number}
     */
    Donkeycraft.FACE_EAST = FACE_EAST;

    /**
     * Face direction indices — exported for external access.
     * @constant {number}
     */
    Donkeycraft.FACE_WEST = FACE_WEST;

    // ============================================================
    // Face normal vectors
    // ============================================================

    /**
     * Normal vectors for each face direction [up, down, north, south, east, west].
     * @type {{x: number, y: number, z: number}[]}
     */
    var FACE_NORMALS = [
        { x: 0, y: 1, z: 0 },     // UP
        { x: 0, y: -1, z: 0 },    // DOWN
        { x: 0, y: 0, z: -1 },    // NORTH
        { x: 0, y: 0, z: 1 },     // SOUTH
        { x: 1, y: 0, z: 0 },     // EAST
        { x: -1, y: 0, z: 0 }     // WEST
    ];

    // ============================================================
    // Ambient occlusion corner weights for different AO configurations
    // ============================================================

    /**
     * AO weight presets. Each array has 4 values (one per corner) between 0 (fully occluded)
     * and 1 (no occlusion).
     * @type {Object.<string, number[]>}
     */
    var AO_WEIGHTS = {
        full: [1.0, 1.0, 1.0, 1.0],       // No occlusion — all corners bright
        edge: [1.0, 0.7, 0.7, 1.0],       // One edge occluded
        corner: [1.0, 0.7, 0.5, 0.7],     // One corner occluded
        deep: [0.7, 0.5, 0.5, 0.7]        // Two adjacent corners occluded
    };

    // ============================================================
    // Atlas constants — shared with texture-atlas.js
    // ============================================================

    /**
     * Number of texture tiles per row/column in the atlas grid.
     * Must match ATLAS_GRID from texture-atlas.js.
     * @constant {number}
     */
    var ATLAS_COLS = 16;

    /**
     * Number of texture tiles per column in the atlas grid.
     * Must match ATLAS_ROWS (ATLAS_GRID) from texture-atlas.js.
     * @constant {number}
     */
    var ATLAS_ROWS = 16;

    /**
     * Maximum block ID that fits in the atlas.
     * Block IDs >= MAX_BLOCK_ID fall back to placeholder texture (ID 0).
     * @constant {number}
     */
    var MAX_BLOCK_ID = ATLAS_COLS * ATLAS_ROWS; // 256

    // ============================================================
    // BlockModel — represents a single baked block model
    // ============================================================

    /**
     * BlockModel — baked 3D model for a single block type.
     *
     * Each model defines which texture to use for each of the 6 faces,
     * whether ambient occlusion is applied, and AO weight values per face.
     *
     * @constructor
     * @param {number} blockId - The block ID this model represents.
     * @param {Object} [options] — Model options.
     * @param {boolean} [options.useAO=false] — Whether to use ambient occlusion.
     * @param {Object.<string, string>} [options.faces] — Custom face texture overrides: {up: 'stone', down: 'dirt', ...}.
     */
    Donkeycraft.BlockModel = function (blockId, options) {
        options = options || {};
        this.blockId = blockId;
        this.useAO = options.useAO || false;
        this.faces = options.faces || {};         // faceName → texture name
        this.aoWeights = {};                      // faceName → AO weight array
        this._buildDefaultModel();
    };

    /**
     * Build the default cube model for a block.
     *
     * If no custom faces were provided, all 6 faces use the block's own texture name.
     * All faces get full (unoccluded) AO weights for a standalone block appearance.
     *
     * @private
     */
    Donkeycraft.BlockModel.prototype._buildDefaultModel = function () {
        var block = Donkeycraft.BlockRegistry.getBlockById(this.blockId);
        var textureName = block ? block.name : 'stone';

        // Default: all faces use the same texture
        var faceNames = ['up', 'down', 'north', 'south', 'east', 'west'];
        for (var i = 0; i < faceNames.length; i++) {
            var fn = faceNames[i];
            if (!this.faces[fn]) {
                this.faces[fn] = textureName;
            }
        }

        // Default AO weights: no occlusion for a standalone block
        for (var j = 0; j < faceNames.length; j++) {
            this.aoWeights[faceNames[j]] = AO_WEIGHTS.full;
        }
    };

    /**
     * Get the texture name for a specific face.
     * @param {string} faceName — Face name: "up", "down", "north", "south", "east", "west".
     * @returns {string} Texture/block name for this face.
     */
    Donkeycraft.BlockModel.prototype.getFaceTexture = function (faceName) {
        return this.faces[faceName] || this.faces['up'] || 'stone';
    };

    /**
     * Check if this model uses ambient occlusion.
     * @returns {boolean} True if AO is enabled.
     */
    Donkeycraft.BlockModel.prototype.hasAO = function () {
        return this.useAO;
    };

    /**
     * Get the AO weights for a face.
     * @param {string} faceName — Face name.
     * @returns {number[]} Array of 4 AO weight values (one per corner), or full weights if not found.
     */
    Donkeycraft.BlockModel.prototype.getAOWeights = function (faceName) {
        return this.aoWeights[faceName] || AO_WEIGHTS.full;
    };

    // ============================================================
    // BlockModelRegistry — maps block IDs to their baked models
    // ============================================================

    /**
     * BlockModelRegistry — central registry of all block models.
     *
     * Uses an IIFE to encapsulate private state (_models) and provides
     * a clean public API for model lookup, UV computation, and registration.
     *
     * @namespace
     */
    Donkeycraft.BlockModelRegistry = (function () {
        /**
         * Internal model registry: blockId → BlockModel.
         * @private
         * @type {Object.<number, Donkeycraft.BlockModel>}
         */
        var _models = {};

        // ---- Register models for all blocks from BlockRegistry ----

        /**
         * Helper to register a block model with given options.
         * @private
         * @param {number} blockId - Block ID.
         * @param {Object} [options] — Model options.
         * @returns {Donkeycraft.BlockModel}
         */
        function _register(blockId, options) {
            var model = new Donkeycraft.BlockModel(blockId, options);
            _models[blockId] = model;
            return model;
        }

        /**
         * Determine if a block should use AO shading.
         * Full solid blocks (opaque, with hardness) benefit most from AO.
         * @private
         * @param {Object} block - Block definition object.
         * @returns {boolean}
         */
        function _shouldUseAO(block) {
            if (!block) return false;
            // Skip air and transparent/decorative blocks
            if (block.name === 'air') return false;
            // Full solid blocks: opaque, no light transparency, with hardness
            var isFullSolid = !block.transparent && block.lightOpacity >= 15 && block.hardness >= 0;
            // Skip bedrock and other ultra-high blast resistance blocks (no visible edges to shade)
            if (block.blastResistance >= 3600000) return false;
            return isFullSolid;
        }

        /**
         * Get face texture overrides for special blocks.
         * @private
         * @param {Object} block - Block definition object.
         * @returns {Object.<string, string>} Face name → texture name map.
         */
        function _getFaceOverrides(block) {
            if (!block || !block.name) return {};
            var name = block.name;
            var overrides = {};

            // Grass block: grass top, dirt sides, dirt bottom
            if (name === 'grass_block') {
                overrides.up = 'grass_block_top';
                overrides.down = 'dirt';
                overrides.north = 'grass_block_side';
                overrides.south = 'grass_block_side';
                overrides.east = 'grass_block_side';
                overrides.west = 'grass_block_side';
            }
            // Logs: bark top/bottom, side texture for sides
            else if (name === 'oak_log' || name === 'spruce_log' ||
                name === 'birch_log' || name === 'jungle_log' ||
                name === 'acacia_log' || name === 'dark_oak_log') {
                overrides.up = name + '_top';
                overrides.down = name + '_top';
                overrides.north = name + '_side';
                overrides.south = name + '_side';
                overrides.east = name + '_side';
                overrides.west = name + '_side';
            }
            // Wood blocks (bark all sides, leaves top/bottom)
            else if (name === 'oak_wood' || name === 'spruce_wood' ||
                name === 'birch_wood' || name === 'jungle_wood') {
                overrides.up = name + '_top';
                overrides.down = name + '_top';
                overrides.north = name;
                overrides.south = name;
                overrides.east = name;
                overrides.west = name;
            }
            // Quartz pillar: quartz top/bottom, lined sides
            else if (name === 'quartz_pillar') {
                overrides.up = 'quartz_block';
                overrides.down = 'quartz_block';
                overrides.north = 'quartz_pillar_side';
                overrides.south = 'quartz_pillar_side';
                overrides.east = 'quartz_pillar_side';
                overrides.west = 'quartz_pillar_side';
            }
            // Bookshelf: planks top/bottom, book front
            else if (name === 'bookshelf') {
                overrides.up = 'oak_planks';
                overrides.down = 'oak_planks';
                overrides.north = 'bookshelf';
                overrides.south = 'bookshelf';
                overrides.east = 'bookshelf';
                overrides.west = 'bookshelf';
            }
            // Furnace: smooth stone top/bottom/sides, furnace front
            else if (name === 'furnace') {
                overrides.up = 'smooth_stone';
                overrides.down = 'smooth_stone';
                overrides.north = 'furnace_front';
                overrides.south = 'smooth_stone';
                overrides.east = 'smooth_stone';
                overrides.west = 'smooth_stone';
            }
            // Lit furnace: same as furnace but emissive front
            else if (name === 'lit_furnace') {
                overrides.up = 'smooth_stone';
                overrides.down = 'smooth_stone';
                overrides.north = 'lit_furnace_front';
                overrides.south = 'smooth_stone';
                overrides.east = 'smooth_stone';
                overrides.west = 'smooth_stone';
            }
            // Crafting table: planks top, crafting sides
            else if (name === 'crafting_table') {
                overrides.up = 'crafting_table_top';
                overrides.down = 'oak_planks';
                overrides.north = 'crafting_table_side';
                overrides.south = 'crafting_table_side';
                overrides.east = 'crafting_table_side';
                overrides.west = 'crafting_table_side';
            }
            // Chest: wood top/bottom, chest front/sides
            else if (name === 'chest') {
                overrides.up = 'oak_planks';
                overrides.down = 'oak_planks';
                overrides.north = 'chest_front';
                overrides.south = 'chest_side';
                overrides.east = 'chest_side';
                overrides.west = 'chest_front';
            }

            return overrides;
        }

        // Build models for all blocks in a single pass
        if (Donkeycraft.BlockRegistry) {
            var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i];
                var id = block.id;
                var options = {};

                // Determine AO usage
                if (_shouldUseAO(block)) {
                    options.useAO = true;
                }

                // Apply face texture overrides for special blocks
                var faceOverrides = _getFaceOverrides(block);
                if (Object.keys(faceOverrides).length > 0) {
                    options.faces = faceOverrides;
                }

                _register(id, options);
            }
        }

        // ============================================================
        // Public API
        // ============================================================

        /**
         * Get the baked model for a block ID.
         * Returns a default cube model if no registered model exists.
         *
         * @param {number} blockId - Block ID.
         * @returns {Donkeycraft.BlockModel} The block model, or default cube if none found.
         */
        function getBlockModel(blockId) {
            return _models[blockId] || new Donkeycraft.BlockModel(blockId);
        }

        /**
         * Get the default cube model (no special faces).
         * @param {number} blockId - Block ID.
         * @returns {Donkeycraft.BlockModel}
         */
        function getDefaultModel(blockId) {
            return new Donkeycraft.BlockModel(blockId);
        }

        /**
         * Get the texture UV for a specific block and face.
         *
         * Computes UV coordinates from the atlas grid layout:
         *   col = textureBlockId % 16, row = floor(textureBlockId / 16)
         * Textures are flipped vertically during atlas upload so canvas row 0 (visual top) → texture V=1.
         * Block IDs >= 256 fall back to ID 0 (placeholder/air).
         *
         * @param {number} blockId - Block ID.
         * @param {string} faceName — Face name: "up", "down", "north", "south", "east", "west".
         * @returns {{blockId: number, faceName: string, textureName: string, u: number, v: number, uSize: number, vSize: number}|null}
         *   UV coords from atlas (UV normalized 0-1), or null if BlockRegistry unavailable.
         */
        function getFaceUV(blockId, faceName) {
            // Look up the texture name for this face
            var model = _models[blockId];
            var textureName;
            if (model) {
                textureName = model.getFaceTexture(faceName);
            } else {
                // Fallback: use blockId as texture name lookup
                var fallbackBlock = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getBlockById(blockId) : null;
                textureName = fallbackBlock ? fallbackBlock.name : 'stone';
            }

            // Look up the texture's block ID from BlockRegistry
            var textureBlock = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getBlockByName(textureName) : null;
            var lookupId = textureBlock ? textureBlock.id : blockId;

            // Clamp to atlas bounds — IDs >= 256 overflow the atlas
            if (lookupId < 0 || lookupId >= MAX_BLOCK_ID) {
                lookupId = 0;
            }

            // Compute atlas grid position
            var col = lookupId % ATLAS_COLS;
            var row = Math.floor(lookupId / ATLAS_ROWS);

            return {
                blockId: lookupId,
                faceName: faceName,
                textureName: textureName,
                u: col / ATLAS_COLS,
                v: row / ATLAS_ROWS,
                uSize: 1 / ATLAS_COLS,
                vSize: 1 / ATLAS_ROWS
            };
        }

        /**
         * Check whether a block uses ambient occlusion.
         * @param {number} blockId - Block ID.
         * @returns {boolean}
         */
        function hasAO(blockId) {
            var model = _models[blockId];
            return model !== undefined && model.useAO;
        }

        /**
         * Register a custom model for a block, overriding any existing registration.
         * @param {number} blockId - Block ID.
         * @param {Donkeycraft.BlockModel} model — Custom model instance.
         */
        function registerCustomModel(blockId, model) {
            _models[blockId] = model;
        }

        /**
         * Get all registered models as an array.
         * @returns {Donkeycraft.BlockModel[]}
         */
        function getAllModels() {
            var result = [];
            for (var key in _models) {
                if (_models.hasOwnProperty(key)) {
                    result.push(_models[key]);
                }
            }
            return result;
        }

        /**
         * Get the number of registered models.
         * @returns {number}
         */
        function getModelCount() {
            return Object.keys(_models).length;
        }

        return {
            getBlockModel: getBlockModel,
            getDefaultModel: getDefaultModel,
            getFaceUV: getFaceUV,
            hasAO: hasAO,
            registerCustomModel: registerCustomModel,
            getAllModels: getAllModels,
            getModelCount: getModelCount,
            // Expose face direction constants and normal vectors for external use.
            FACE_UP: FACE_UP,
            FACE_DOWN: FACE_DOWN,
            FACE_NORTH: FACE_NORTH,
            FACE_SOUTH: FACE_SOUTH,
            FACE_EAST: FACE_EAST,
            FACE_WEST: FACE_WEST,
            FACE_NORMALS: FACE_NORMALS
        };
    })();

})();