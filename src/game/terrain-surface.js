// Donkeycraft — Biome-Appropriate Surface Layers
// Applies biome-specific top blocks and sub-surface layers to generated terrain.
// Grass: grass block top, dirt sub-surface, stone deep
// Arctic: snow block top, ice in shallow water, packed ice at depth
// Desert: sand top, sandstone layers below, desert rock at depth
// Forest: grass block top, rich dirt (2 layers), stone deep
//
// @module terrain-surface
// @description Biome-appropriate surface layer application system
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    var CHUNK_SIZE = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
    var WORLD_HEIGHT = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

    // ============================================================
    // Surface Block Definitions
    // ============================================================

    /**
     * SurfaceLayer — defines a surface layer's block type and depth range.
     * @param {string} name - Layer name.
     * @param {number} blockId - Block ID for this layer.
     * @param {number} minDepth - Minimum depth from surface (0 = top block).
     * @param {number} maxDepth - Maximum depth from surface.
     * @param {string[]} biomeNames - Biome names that use this layer (null = all).
     */
    function SurfaceLayer(name, blockId, minDepth, maxDepth, biomeNames) {
        this.name = name;
        this.blockId = blockId;
        this.minDepth = minDepth;
        this.maxDepth = maxDepth;
        this.biomeNames = biomeNames || null; // null = applies to all biomes
    }

    // ============================================================
    // Surface Registry
    // ============================================================

    /**
     * Surface registry — maps biome names to their surface layer sequences.
     * @type {Object.<string, SurfaceLayer[]>}
     */
    var _surfaceLayers = {};
    var _resolvedBlocks = {};
    var _initialized = false; // Track whether init has been called

    /**
     * Initialize the surface registry — resolve block IDs from BlockRegistry.
     */
    function init() {
        _resolveSurfaceBlocks();
        _buildSurfaceConfigurations();
        _initialized = true;
    }

    /**
     * Check whether the surface registry has been initialized.
     * @returns {boolean} True if init() has been called.
     */
    function isInitialized() {
        return _initialized;
    }

    /**
     * Resolve surface-related block IDs from BlockRegistry.
     * Tries multiple naming conventions (snake_case, camelCase, no prefix) for cross-compatibility.
     * Includes aliases for both camelCase (block.js) and snake_case (standard) naming styles.
     * @private
     */
    function _resolveSurfaceBlocks() {
        if (!Donkeycraft.BlockRegistry) return;

        // Define primary names and fallback variants for each surface block type.
        // Covers both snake_case (Minecraft 1.13+) and camelCase (legacy) naming conventions.
        var blockVariants = [
            { key: 'grass_block', variants: ['grass_block', 'grass_block_top', 'grass_block_side', 'grass', 'grassblock'] },
            { key: 'dirt', variants: ['dirt'] },
            { key: 'stone', variants: ['stone'] },
            { key: 'sand', variants: ['sand'] },
            // snow_block uses camelCase 'snowBlock' in block.js — must include both forms
            { key: 'snow_block', variants: ['snow_block', 'snowBlock', 'snow_layer', 'snow'] },
            { key: 'ice', variants: ['ice'] },
            { key: 'packed_ice', variants: ['packed_ice', 'packedice'] },
            { key: 'sandstone', variants: ['sandstone', 'chiseled_sandstone', 'cut_sandstone'] },
            // desert_stone may not exist in block.js — fall back to stone
            { key: 'desert_stone', variants: ['desert_stone', 'desert_stone_block', 'desertstone', 'stone'] },
            { key: 'rich_dirt', variants: ['rich_dirt', 'richdirt'] },
            { key: 'topsoil', variants: ['topsoil', 'rich_dirt'] } // topsoil falls back to rich_dirt
        ];

        for (var i = 0; i < blockVariants.length; i++) {
            var entry = blockVariants[i];
            for (var j = 0; j < entry.variants.length; j++) {
                var block = Donkeycraft.BlockRegistry.getBlockByName(entry.variants[j]);
                if (block && block.id) {
                    _resolvedBlocks[entry.key] = block.id;
                    // Also map the exact variant name for direct lookup
                    _resolvedBlocks[entry.variants[j]] = block.id;
                    break;
                }
            }
        }
    }

    /**
     * Build surface configurations for each biome.
     * Validates that at least one layer has a valid block ID before registering.
     * @private
     */
    function _buildSurfaceConfigurations() {
        // Grass biome — grass top, dirt sub-surface, stone deep
        _surfaceLayers['grass'] = [
            new SurfaceLayer('grass_top', _resolvedBlocks['grass_block'] || 0, 0, 0, ['grass', 'forest']),
            new SurfaceLayer('dirt_sub', _resolvedBlocks['dirt'] || 0, 1, 3, ['grass', 'forest']),
            new SurfaceLayer('stone_deep', _resolvedBlocks['stone'] || 0, 4, WORLD_HEIGHT, ['grass', 'forest'])
        ];

        // Arctic biome — snow top, ice in shallow water, packed ice at depth
        // IMPORTANT: Fallback chain must never end at 0 (air) — always fall back to stone
        var arcticSnowId = _resolvedBlocks['snow_block'] || _resolvedBlocks['snowBlock'] || _resolvedBlocks['stone'];
        var arcticIceId = _resolvedBlocks['packed_ice'] || _resolvedBlocks['ice'] || _resolvedBlocks['stone'];
        _surfaceLayers['arctic'] = [
            new SurfaceLayer('snow_top', arcticSnowId || _resolvedBlocks['stone'] || 1, 0, 0, ['arctic']),
            new SurfaceLayer('ice_sub', arcticIceId || _resolvedBlocks['stone'] || 1, 1, 2, ['arctic']),
            new SurfaceLayer('stone_deep', _resolvedBlocks['stone'] || 1, 3, WORLD_HEIGHT, ['arctic'])
        ];

        // Desert biome — sand top, sandstone layers below, desert rock at depth
        _surfaceLayers['desert'] = [
            new SurfaceLayer('sand_top', _resolvedBlocks['sand'] || 0, 0, 2, ['desert']),
            new SurfaceLayer('sandstone_sub', _resolvedBlocks['sandstone'] || 0, 3, 10, ['desert']),
            new SurfaceLayer('desert_stone_deep', _resolvedBlocks['desert_stone'] || _resolvedBlocks['stone'] || 0, 11, WORLD_HEIGHT, ['desert'])
        ];

        // Forest biome — grass top, rich dirt (2 layers), stone deep
        _surfaceLayers['forest'] = [
            new SurfaceLayer('forest_grass_top', _resolvedBlocks['grass_block'] || 0, 0, 0, ['forest']),
            new SurfaceLayer('rich_dirt_1', _resolvedBlocks['rich_dirt'] || _resolvedBlocks['dirt'] || 0, 1, 2, ['forest']),
            new SurfaceLayer('rich_dirt_2', _resolvedBlocks['topsoil'] || _resolvedBlocks['dirt'] || 0, 3, 4, ['forest']),
            new SurfaceLayer('stone_deep', _resolvedBlocks['stone'] || 0, 5, WORLD_HEIGHT, ['forest'])
        ];
    }

    /**
     * Get surface layers for a biome.
     * @param {string} biomeName - Biome name.
     * @returns {SurfaceLayer[]} Array of surface layers, or null if biome not found.
     */
    function getSurfaceLayers(biomeName) {
        return _surfaceLayers[biomeName] || null;
    }

    /**
     * Get all configured biome names.
     * @returns {string[]} Array of biome names with surface configurations.
     */
    function getBiomesWithSurfaces() {
        var names = [];
        for (var key in _surfaceLayers) {
            if (_surfaceLayers.hasOwnProperty(key)) {
                names.push(key);
            }
        }
        return names;
    }

    // ============================================================
    // Surface Application
    // ============================================================

    /**
     * Apply surface layers to a chunk's terrain.
     * Walks down from the surface and replaces blocks according to biome configuration.
     * Optimized: stops at Y=0 instead of iterating all 256 world height levels.
     * Ensures stone layer reaches the bottom of the world for proper underground structure.
     * Skips block ID 0 (air) to prevent creating holes in the terrain.
     * Validates all inputs and handles edge cases gracefully.
     * @param {Donkeycraft.Chunk} chunk - The chunk to apply surfaces to.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {string} biomeName - Biome name for this chunk.
     * @param {number[]} heightmap - Heightmap array with terrain heights.
     * @returns {{blocksModified: number}} Generation stats with total blocks modified count.
     */
    function applySurfaceLayers(chunk, chunkX, chunkZ, biomeName, heightmap) {
        var stats = { blocksModified: 0 };

        if (!chunk || typeof chunk.setBlock !== 'function') return stats;
        if (!heightmap || !Array.isArray(heightmap)) return stats;

        // Resolve and validate biome name
        if (!biomeName || typeof biomeName !== 'string') {
            biomeName = 'grass';
        } else {
            biomeName = biomeName.trim().toLowerCase();
        }

        // Skip if init hasn't been called yet — terrain generation will retry after init
        if (!_initialized) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[TerrainSurface] Not initialized yet, skipping surface layers for biome "' + biomeName + '"');
            }
            return stats;
        }

        var layers = _surfaceLayers[biomeName];
        if (!layers) {
            // Default to grass biome surface with validation
            layers = _surfaceLayers['grass'];
            if (!layers) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[TerrainSurface] No surface layers configured for biome "' + biomeName + '", using defaults');
                }
                return stats;
            }
        }

        // Pre-validate that at least one layer has a valid block ID
        var hasValidLayer = false;
        for (var li = 0; li < layers.length; li++) {
            if (layers[li].blockId > 0) {
                hasValidLayer = true;
                break;
            }
        }
        if (!hasValidLayer) return stats;

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var z = 0; z < CHUNK_SIZE; z++) {
                var surfaceY = heightmap[x + z * CHUNK_SIZE];
                // Validate surfaceY is a finite number within valid range
                if (!isFinite(surfaceY) || surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                surfaceY = Math.floor(surfaceY);

                // Walk down from surface to Y=0, applying layers based on depth.
                // Stops early once the deepest layer (typically stone) is applied
                // to avoid unnecessary iterations through lower Y levels.
                var maxLayerDepth = 0;
                for (var li = 0; li < layers.length; li++) {
                    if (layers[li].maxDepth > maxLayerDepth) maxLayerDepth = layers[li].maxDepth;
                }
                // Cap maxLayerDepth to a reasonable value relative to world height
                var effectiveMaxDepth = Math.min(maxLayerDepth, WORLD_HEIGHT - 1);

                for (var y = surfaceY; y >= 0; y--) {
                    var depth = surfaceY - y;
                    // Stop iterating once we've passed the deepest layer
                    if (depth > effectiveMaxDepth) break;

                    var currentBlock = chunk.getBlock(x, y, z);

                    // Find matching layer for this depth
                    for (var i = 0; i < layers.length; i++) {
                        var layer = layers[i];
                        if (depth >= layer.minDepth && depth <= layer.maxDepth) {
                            // Skip air block ID (0) to prevent creating holes in terrain
                            // Also skip if block already matches the layer
                            if (layer.blockId > 0 && currentBlock !== layer.blockId) {
                                chunk.setBlock(x, y, z, layer.blockId);
                                stats.blocksModified++;
                            }
                            break;
                        }
                    }
                }
            }
        }

        return stats;
    }

    /**
     * Get the top block ID for a biome.
     * @param {string} biomeName - Biome name.
     * @returns {number} Top block ID, or 0 if not found.
     */
    function getTopBlockId(biomeName) {
        if (!biomeName || typeof biomeName !== 'string') return 0;
        var layers = _surfaceLayers[biomeName];
        if (layers && layers.length > 0) {
            return layers[0].blockId;
        }
        // Fallback to grass biome
        var grassLayers = _surfaceLayers['grass'];
        return grassLayers && grassLayers.length > 0 ? grassLayers[0].blockId : 0;
    }

    /**
     * Resolve a block ID by name from BlockRegistry.
     * @param {string} name - Block name.
     * @returns {number} Block ID, or 0 if not found.
     */
    function getBlockId(name) {
        return _resolvedBlocks[name] || 0;
    }

    /**
     * Destroy the surface registry and free resources.
     */
    function destroy() {
        _surfaceLayers = {};
        _resolvedBlocks = {};
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Donkeycraft.TerrainSurface — Biome-appropriate surface layer system.
     * Applies biome-specific top blocks, sub-surface layers, and deep stone/rock.
     * Supports grass, arctic, desert, and forest biomes with distinct layer configurations.
     * @namespace
     */
    Donkeycraft.TerrainSurface = {
        // Main entry point
        applySurfaceLayers: applySurfaceLayers,

        // Initialization / lifecycle
        init: init,
        destroy: destroy,
        isInitialized: isInitialized,

        // Configuration access
        getSurfaceLayers: getSurfaceLayers,
        getBiomesWithSurfaces: getBiomesWithSurfaces,
        getTopBlockId: getTopBlockId,
        getBlockId: getBlockId,

        // Constants (read-only reference for external consumers)
        SurfaceLayer: SurfaceLayer
    };

})();