// Donkeycraft — Block Models
// Baked models: face definitions for each block, AO (ambient occlusion) data.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // Face direction constants
    var FACE_UP = 0;
    var FACE_DOWN = 1;
    var FACE_NORTH = 2;
    var FACE_SOUTH = 3;
    var FACE_EAST = 4;
    var FACE_WEST = 5;

    // Face normal vectors
    var FACE_NORMALS = [
        { x: 0, y: 1, z: 0 },     // UP
        { x: 0, y: -1, z: 0 },    // DOWN
        { x: 0, y: 0, z: -1 },    // NORTH
        { x: 0, y: 0, z: 1 },     // SOUTH
        { x: 1, y: 0, z: 0 },     // EAST
        { x: -1, y: 0, z: 0 }     // WEST
    ];

    // Face corner definitions (for a 1×1×1 block at origin)
    // Each face has 4 corners with UV coordinates and AO weights
    var FACE_CORNERS = {
        up: [
            { x: 0, y: 1, z: 0, u: 0, v: 0 },  // bottom-left
            { x: 1, y: 1, z: 0, u: 1, v: 0 },  // bottom-right
            { x: 1, y: 1, z: 1, u: 1, v: 1 },  // top-right
            { x: 0, y: 1, z: 0, u: 0, v: 1 }   // top-left
        ],
        down: [
            { x: 0, y: 0, z: 1, u: 0, v: 0 },
            { x: 1, y: 0, z: 1, u: 1, v: 0 },
            { x: 1, y: 0, z: 0, u: 1, v: 1 },
            { x: 0, y: 0, z: 0, u: 0, v: 1 }
        ],
        north: [
            { x: 0, y: 0, z: 0, u: 0, v: 0 },
            { x: 1, y: 0, z: 0, u: 1, v: 0 },
            { x: 1, y: 1, z: 0, u: 1, v: 1 },
            { x: 0, y: 1, z: 0, u: 0, v: 1 }
        ],
        south: [
            { x: 1, y: 0, z: 1, u: 0, v: 0 },
            { x: 0, y: 0, z: 1, u: 1, v: 0 },
            { x: 0, y: 1, z: 1, u: 1, v: 1 },
            { x: 1, y: 1, z: 1, u: 0, v: 1 }
        ],
        east: [
            { x: 1, y: 0, z: 0, u: 0, v: 0 },
            { x: 1, y: 0, z: 1, u: 1, v: 0 },
            { x: 1, y: 1, z: 1, u: 1, v: 1 },
            { x: 1, y: 1, z: 0, u: 0, v: 1 }
        ],
        west: [
            { x: 0, y: 0, z: 1, u: 0, v: 0 },
            { x: 0, y: 0, z: 0, u: 1, v: 0 },
            { x: 0, y: 1, z: 0, u: 1, v: 1 },
            { x: 0, y: 1, z: 1, u: 0, v: 1 }
        ]
    };

    // Ambient occlusion corner weights for different AO configurations
    // Each weight is a value between 0 (fully occluded) and 1 (no occlusion)
    var AO_WEIGHTS = {
        full: [1.0, 1.0, 1.0, 1.0],       // No occlusion — all corners bright
        edge: [1.0, 0.7, 0.7, 1.0],       // One edge occluded
        corner: [1.0, 0.7, 0.5, 0.7],     // One corner occluded
        deep: [0.7, 0.5, 0.5, 0.7]        // Two adjacent corners occluded
    };

    // ============================================================
    // BlockModel — represents a single baked block model
    // ============================================================

    /**
     * BlockModel — baked 3D model for a single block type.
     * @param {number} blockId - The block ID this model represents.
     * @param {Object} [options] — Model options.
     * @param {boolean} [options.useAO=false] — Whether to use ambient occlusion.
     * @param {Object.<string, string>} [options.faces] — Custom face texture overrides: {up: 'stone', down: 'dirt', ...}.
     */
    Donkeycraft.BlockModel = function (blockId, options) {
        options = options || {};
        this.blockId = blockId;
        this.useAO = options.useAO || false;
        this.faces = options.faces || {};         // faceName -> texture name
        this.aoWeights = {};                      // faceName -> AO weight array
        this._buildDefaultModel();
    };

    /**
     * Build the default cube model for a block.
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
     * @returns {boolean}
     */
    Donkeycraft.BlockModel.prototype.hasAO = function () {
        return this.useAO;
    };

    /**
     * Get the AO weights for a face.
     * @param {string} faceName — Face name.
     * @returns {number[]} Array of 4 AO weight values.
     */
    Donkeycraft.BlockModel.prototype.getAOWeights = function (faceName) {
        return this.aoWeights[faceName] || AO_WEIGHTS.full;
    };

    /**
     * Get the corner definitions for a face.
     * @param {string} faceName — Face name.
     * @returns {Object[]} Array of 4 corner objects with x, y, z, u, v.
     */
    Donkeycraft.BlockModel.prototype.getFaceCorners = function (faceName) {
        return FACE_CORNERS[faceName] || FACE_CORNERS['north'];
    };

    // ============================================================
    // BlockModelRegistry — maps block IDs to their baked models
    // ============================================================

    /**
     * BlockModelRegistry — central registry of all block models.
     */
    Donkeycraft.BlockModelRegistry = (function () {
        var _models = {};  // blockId -> BlockModel

        // ---- Register special models with AO ----

        /**
         * Register a model for a block ID.
         * @param {number} blockId - Block ID.
         * @param {Object} [options] — Model options.
         * @returns {Donkeycraft.BlockModel}
         * @private
         */
        function registerModel(blockId, options) {
            var model = new Donkeycraft.BlockModel(blockId, options);
            _models[blockId] = model;
            return model;
        }

        // Build models for all blocks from BlockRegistry
        var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
        for (var i = 0; i < blocks.length; i++) {
            var block = blocks[i];
            var id = block.id;
            var options = {};

            // Skip air and transparent/decorative blocks — they don't need full models
            if (block.name === 'air') continue;

            // Blocks that use AO: solid opaque blocks that benefit from shading
            // These are the "full block" types that get shaded at edges/corners
            var isFullSolid = !block.transparent && block.lightOpacity >= 15 && block.hardness >= 0;

            if (isFullSolid) {
                options.useAO = true;
            }

            // Special face overrides for blocks with different top/bottom/sides
            var faceOverrides = {};

            // Grass block: grass top, dirt sides, dirt bottom
            if (block.name === 'grass_block') {
                faceOverrides.up = 'grass_block_top';
                faceOverrides.down = 'dirt';
                faceOverrides.north = 'grass_block_side';
                faceOverrides.south = 'grass_block_side';
                faceOverrides.east = 'grass_block_side';
                faceOverrides.west = 'grass_block_side';
            }

            // Cobblestone, brick, stone bricks: consistent texture
            // (no overrides needed)

            // Log: wood sides, bark top/bottom
            if (block.name === 'oak_log' || block.name === 'spruce_log' ||
                block.name === 'birch_log' || block.name === 'jungle_log' ||
                block.name === 'acacia_log' || block.name === 'dark_oak_log') {
                faceOverrides.up = block.name + '_top';
                faceOverrides.down = block.name + '_top';
                faceOverrides.north = block.name + '_side';
                faceOverrides.south = block.name + '_side';
                faceOverrides.east = block.name + '_side';
                faceOverrides.west = block.name + '_side';
            }

            // Wood blocks (bark all sides, leaves top/bottom)
            if (block.name === 'oak_wood' || block.name === 'spruce_wood' ||
                block.name === 'birch_wood' || block.name === 'jungle_wood') {
                faceOverrides.up = block.name + '_top';
                faceOverrides.down = block.name + '_top';
                faceOverrides.north = block.name;
                faceOverrides.south = block.name;
                faceOverrides.east = block.name;
                faceOverrides.west = block.name;
            }

            // Sandstone: consistent texture (no overrides)

            // Quartz pillar: quartz sides, normal top/bottom
            if (block.name === 'quartz_pillar') {
                faceOverrides.up = 'quartz_block';
                faceOverrides.down = 'quartz_block';
                faceOverrides.north = 'quartz_pillar_side';
                faceOverrides.south = 'quartz_pillar_side';
                faceOverrides.east = 'quartz_pillar_side';
                faceOverrides.west = 'quartz_pillar_side';
            }

            // Bedrock: no AO (infinite blast resistance)
            if (block.blastResistance >= 3600000) {
                options.useAO = false;
            }

            registerModel(id, options);
        }

        // ---- Special models with custom face textures ----

        // Override grass block model with proper face textures
        registerModel(8, {
            useAO: true,
            faces: {
                up: 'grass_block_top',
                down: 'dirt',
                north: 'grass_block_side',
                south: 'grass_block_side',
                east: 'grass_block_side',
                west: 'grass_block_side'
            }
        });

        // Bookshelf: planks sides/top, book front pattern (simplified to planks)
        registerModel(184, {
            useAO: true,
            faces: {
                up: 'oak_planks',
                down: 'oak_planks',
                north: 'bookshelf',
                south: 'bookshelf',
                east: 'bookshelf',
                west: 'bookshelf'
            }
        });

        // Furnace: smooth stone sides, furnace front
        registerModel(191, {
            useAO: true,
            faces: {
                up: 'smooth_stone',
                down: 'smooth_stone',
                north: 'furnace_front',
                south: 'smooth_stone',
                east: 'smooth_stone',
                west: 'smooth_stone'
            }
        });

        // Lit furnace: same as furnace but emissive front
        registerModel(192, {
            useAO: true,
            faces: {
                up: 'smooth_stone',
                down: 'smooth_stone',
                north: 'lit_furnace_front',
                south: 'smooth_stone',
                east: 'smooth_stone',
                west: 'smooth_stone'
            }
        });

        // Crafting table: planks top, wood sides
        registerModel(195, {
            useAO: true,
            faces: {
                up: 'crafting_table_top',
                down: 'oak_planks',
                north: 'crafting_table_side',
                south: 'crafting_table_side',
                east: 'crafting_table_side',
                west: 'crafting_table_side'
            }
        });

        // Chest: wood sides, chest front
        registerModel(187, {
            useAO: true,
            faces: {
                up: 'oak_planks',
                down: 'oak_planks',
                north: 'chest_front',
                south: 'chest_side',
                east: 'chest_side',
                west: 'chest_front'
            }
        });

        // ============================================================
        // Public API
        // ============================================================

        /**
         * Get the baked model for a block ID.
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
         * Returns UV coordinates matching the atlas grid layout:
         *   col = id % ATLAS_COLS, row = Math.floor(id / ATLAS_COLS).
         * Block IDs >= 256 (beyond the 16×16 atlas) fall back to ID 0 (air/placeholder).
         * @param {number} blockId - Block ID.
         * @param {string} faceName — Face name: "up", "down", "north", "south", "east", "west".
         * @returns {{blockId: number, faceName: string, textureName: string, u: number, v: number, uSize: number, vSize: number}|null}
         *   UV coords from atlas (UV normalized 0-1), or null if block not found.
         */
        function getFaceUV(blockId, faceName) {
            var model = _models[blockId];
            if (!model) return null;

            var textureName = model.getFaceTexture(faceName);
            var textureBlock = Donkeycraft.BlockRegistry.getBlockByName(textureName);
            var lookupId = textureBlock ? textureBlock.id : blockId;

            // Atlas is 16×16 grid (256 slots, IDs 0-255)
            var ATLAS_COLS = 16;
            var ATLAS_ROWS = 16;
            var MAX_BLOCK_ID = ATLAS_COLS * ATLAS_ROWS; // 256

            // Block IDs >= 256 overflow the atlas — fall back to ID 0
            if (lookupId < 0 || lookupId >= MAX_BLOCK_ID) {
                lookupId = 0;
            }

            var col = lookupId % ATLAS_COLS;
            var row = Math.floor(lookupId / ATLAS_COLS);

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
         * Register a custom model for a block.
         * @param {number} blockId - Block ID.
         * @param {Donkeycraft.BlockModel} model — Custom model.
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
            // Expose face constants for external use
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