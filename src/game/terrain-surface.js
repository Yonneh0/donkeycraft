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

    /**
     * Initialize the surface registry — resolve block IDs from BlockRegistry.
     */
    function init() {
        _resolveSurfaceBlocks();
        _buildSurfaceConfigurations();
    }

    /**
     * Resolve surface-related block IDs from BlockRegistry.
     * Tries multiple naming conventions (snake_case, camelCase, no prefix) for cross-compatibility.
     * @private
     */
    function _resolveSurfaceBlocks() {
        if (!Donkeycraft.BlockRegistry) return;

        // Define primary names and fallback variants for each surface block type
        var blockVariants = [
            { key: 'grass_block', variants: ['grass_block', 'grass', 'grassblock'] },
            { key: 'dirt', variants: ['dirt'] },
            { key: 'stone', variants: ['stone'] },
            { key: 'sand', variants: ['sand'] },
            { key: 'snow_block', variants: ['snow_block', 'snow'] },
            { key: 'ice', variants: ['ice'] },
            { key: 'packed_ice', variants: ['packed_ice', 'packedice'] },
            { key: 'sandstone', variants: ['sandstone'] },
            { key: 'desert_stone', variants: ['desert_stone', 'desert_stone_block', 'desertstone'] },
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
        _surfaceLayers['arctic'] = [
            new SurfaceLayer('snow_top', _resolvedBlocks['snow_block'] || 0, 0, 0, ['arctic']),
            new SurfaceLayer('ice_sub', _resolvedBlocks['packed_ice'] || _resolvedBlocks['ice'] || 0, 1, 2, ['arctic']),
            new SurfaceLayer('stone_deep', _resolvedBlocks['stone'] || 0, 3, WORLD_HEIGHT, ['arctic'])
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
     * @param {Donkeycraft.Chunk} chunk - The chunk to apply surfaces to.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {string} biomeName - Biome name for this chunk.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {{blocksModified: number}} Generation stats.
     */
    function applySurfaceLayers(chunk, chunkX, chunkZ, biomeName, heightmap) {
        var stats = { blocksModified: 0 };

        if (!chunk || typeof chunk.setBlock !== 'function') return stats;
        if (!heightmap || !Array.isArray(heightmap)) return stats;

        var layers = _surfaceLayers[biomeName];
        if (!layers) {
            // Default to grass biome surface
            layers = _surfaceLayers['grass'];
            if (!layers) return stats;
        }

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var z = 0; z < CHUNK_SIZE; z++) {
                var surfaceY = heightmap[x + z * CHUNK_SIZE];
                if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT) continue;

                // Walk down from surface, applying layers
                var depth = 0;
                for (var y = surfaceY; y >= 0 && depth < 20; y--) {
                    var currentBlock = chunk.getBlock(x, y, z);

                    // Find matching layer for this depth
                    var applied = false;
                    for (var i = 0; i < layers.length; i++) {
                        var layer = layers[i];
                        if (depth >= layer.minDepth && depth <= layer.maxDepth) {
                            if (layer.blockId && currentBlock !== layer.blockId) {
                                chunk.setBlock(x, y, z, layer.blockId);
                                stats.blocksModified++;
                            }
                            applied = true;
                            break;
                        }
                    }

                    depth++;
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
        var layers = _surfaceLayers[biomeName];
        if (layers && layers.length > 0) {
            return layers[0].blockId;
        }
        return 0;
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
     * @namespace
     */
    Donkeycraft.TerrainSurface = {
        // Main entry point
        applySurfaceLayers: applySurfaceLayers,

        // Initialization
        init: init,
        destroy: destroy,

        // Configuration access
        getSurfaceLayers: getSurfaceLayers,
        getBiomesWithSurfaces: getBiomesWithSurfaces,
        getTopBlockId: getTopBlockId,
        getBlockId: getBlockId,

        // Constants
        SurfaceLayer: SurfaceLayer
    };

})();