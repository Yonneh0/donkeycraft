// Donkeycraft — Biome-Specific Decoration Generator
// Places trees, flowers, grass, cacti, and other surface decorations per biome.
// Grass: oak trees, flowers, tall grass
// Arctic: snow layers, ice formations, sparse dead trees
// Desert: cacti, dead bushes, no trees
// Forest: dense trees (oak + birch), underbrush, mushrooms
//
// @module structure-generator
// @description Biome-specific surface decoration placement system
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    var CHUNK_SIZE = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
    var WORLD_HEIGHT = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

    // ============================================================
    // Decoration Definitions
    // ============================================================

    /**
     * Decorator — defines a surface decoration type.
     * @param {string} name - Decorator name.
     * @param {number} blockId - Block ID for the decoration.
     * @param {string[]} biomeNames - Biomes where this decoration appears.
     * @param {number} frequency - Average count per chunk.
     * @param {Object} [options] - Placement options (height, width, etc.).
     */
    function Decorator(name, blockId, biomeNames, frequency, options) {
        this.name = name;
        this.blockId = blockId;
        this.biomeNames = biomeNames;
        this.frequency = frequency;
        this.options = options || {};
    }

    // ============================================================
    // Decoration Registry
    // ============================================================

    var _decorators = {}; // Map: biomeName → Array<Decorator>
    var _resolvedBlocks = {};

    /**
     * Initialize the decoration registry — resolve block IDs and build configurations.
     * Must be called after WaterGenerator.init() to ensure proper water block caching.
     * @public
     */
    function init() {
        _resolveDecorationBlocks();
        _buildDecorationConfigurations();
        // Pre-resolve water block ID for leaf placement checks
        _cachedWaterBlockId = 0; // Reset cache — will be resolved on first _getWaterBlockId() call
        _getWaterBlockId(); // Force resolution
    }

    /**
     * Resolve decoration-related block IDs from BlockRegistry.
     * Tries multiple naming variants for cross-compatibility with different block registries.
     * Includes primary names and fallback variants for each decoration block type.
     * @private
     */
    function _resolveDecorationBlocks() {
        if (!Donkeycraft.BlockRegistry) return;

        // Define primary names and fallback variants for each decoration block type
        var blockVariants = [
            { key: 'oak_log', variants: ['oak_log', 'oak', 'log'] },
            { key: 'oak_leaves', variants: ['oak_leaves', 'leaves'] },
            { key: 'birch_log', variants: ['birch_log', 'birch'] },
            { key: 'birch_leaves', variants: ['birch_leaves'] },
            { key: 'dead_tree_log', variants: ['dead_tree_log', 'dead_log'] },
            { key: 'dead_leaves', variants: ['dead_leaves'] },
            { key: 'snow_layer', variants: ['snow_layer', 'snow'] },
            { key: 'ice_formation', variants: ['ice_formation', 'ice', 'packed_ice'] },
            { key: 'cactus_block', variants: ['cactus_block', 'cactus'] },
            { key: 'dead_bush', variants: ['dead_bush', 'dead_bush_block'] },
            { key: 'flower_yellow', variants: ['flower_yellow', 'yellow_flower'] },
            { key: 'flower_red', variants: ['flower_red', 'red_flower'] },
            { key: 'tall_grass', variants: ['tall_grass', 'tallgrass'] },
            { key: 'mushroom_brown', variants: ['mushroom_brown', 'brown_mushroom'] },
            { key: 'mushroom_red', variants: ['mushroom_red', 'red_mushroom'] },
            { key: 'pumpkin', variants: ['pumpkin', 'pumpkin_block'] },
            { key: 'melon_block', variants: ['melon_block', 'melon'] }
        ];

        for (var i = 0; i < blockVariants.length; i++) {
            var entry = blockVariants[i];
            for (var j = 0; j < entry.variants.length; j++) {
                var block = Donkeycraft.BlockRegistry.getBlockByName(entry.variants[j]);
                if (block && block.id) {
                    _resolvedBlocks[entry.key] = block.id;
                    break;
                }
            }
        }
    }

    /**
     * Build decoration configurations for each biome.
     * @private
     */
    function _buildDecorationConfigurations() {
        // Grass biome — oak trees, flowers, tall grass
        _decorators['grass'] = [
            new Decorator('oak_tree', null, ['grass'], 3, {
                logBlock: _resolvedBlocks['oak_log'],
                leafBlock: _resolvedBlocks['oak_leaves'],
                heightMin: 4,
                heightMax: 6,
                trunkRadius: 1,
                leafRadius: 2
            }),
            new Decorator('flower', _resolvedBlocks['flower_yellow'] || 0, ['grass'], 5, {}),
            new Decorator('tall_grass', _resolvedBlocks['tall_grass'] || 0, ['grass'], 8, {})
        ];

        // Arctic biome — snow layers, ice formations, sparse dead trees
        _decorators['arctic'] = [
            new Decorator('dead_tree', null, ['arctic'], 1, {
                logBlock: _resolvedBlocks['dead_tree_log'],
                leafBlock: _resolvedBlocks['dead_leaves'],
                heightMin: 3,
                heightMax: 4,
                trunkRadius: 1,
                leafRadius: 1
            }),
            new Decorator('snow_layer', _resolvedBlocks['snow_layer'] || _resolvedBlocks['snow_block'] || 0, ['arctic'], 1, {
                layerThickness: 2
            }),
            new Decorator('ice_formation', _resolvedBlocks['ice_formation'] || _resolvedBlocks['ice'] || 0, ['arctic'], 2, {})
        ];

        // Desert biome — cacti, dead bushes, no trees
        _decorators['desert'] = [
            new Decorator('cactus', _resolvedBlocks['cactus_block'] || 0, ['desert'], 4, {
                heightMin: 2,
                heightMax: 4
            }),
            new Decorator('dead_bush', _resolvedBlocks['dead_bush'] || 0, ['desert'], 6, {})
        ];

        // Forest biome — dense trees (oak + birch), underbrush, mushrooms
        _decorators['forest'] = [
            new Decorator('oak_tree', null, ['forest'], 5, {
                logBlock: _resolvedBlocks['oak_log'],
                leafBlock: _resolvedBlocks['oak_leaves'],
                heightMin: 5,
                heightMax: 8,
                trunkRadius: 1,
                leafRadius: 3
            }),
            new Decorator('birch_tree', null, ['forest'], 3, {
                logBlock: _resolvedBlocks['birch_log'],
                leafBlock: _resolvedBlocks['birch_leaves'],
                heightMin: 4,
                heightMax: 6,
                trunkRadius: 1,
                leafRadius: 2
            }),
            new Decorator('flower', _resolvedBlocks['flower_red'] || 0, ['forest'], 3, {}),
            new Decorator('mushroom', null, ['forest'], 2, {
                brownBlock: _resolvedBlocks['mushroom_brown'],
                redBlock: _resolvedBlocks['mushroom_red']
            })
        ];
    }

    /**
     * Get decorations for a biome.
     * @param {string} biomeName - Biome name.
     * @returns {Decorator[]} Array of decorators, or null if not found.
     */
    function getDecorations(biomeName) {
        return _decorators[biomeName] || null;
    }

    /**
     * Get all biomes with decorations.
     * @returns {string[]} Array of biome names.
     */
    function getBiomesWithDecorations() {
        var names = [];
        for (var key in _decorators) {
            if (_decorators.hasOwnProperty(key)) {
                names.push(key);
            }
        }
        return names;
    }

    // ============================================================
    // Decoration Placement
    // ============================================================

    /**
     * Place all decorations for a chunk.
     * @param {Donkeycraft.Chunk} chunk - The chunk to decorate.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {string} biomeName - Biome name for this chunk.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {{decorationsPlaced: number}} Generation stats.
     */
    function placeDecorations(chunk, chunkX, chunkZ, biomeName, heightmap) {
        var stats = { decorationsPlaced: 0 };

        if (!chunk || typeof chunk.setBlock !== 'function') return stats;
        if (!heightmap || !Array.isArray(heightmap)) return stats;

        var decorations = _decorators[biomeName];
        if (!decorations) {
            // Default to grass biome decorations
            decorations = _decorators['grass'];
            if (!decorations) return stats;
        }

        for (var i = 0; i < decorations.length; i++) {
            var dec = decorations[i];

            switch (dec.name) {
                case 'oak_tree':
                case 'birch_tree':
                case 'dead_tree':
                    stats.decorationsPlaced += _placeTree(chunk, chunkX, chunkZ, dec, heightmap);
                    break;
                case 'cactus':
                    stats.decorationsPlaced += _placeCactus(chunk, chunkX, chunkZ, dec, heightmap);
                    break;
                case 'mushroom':
                    stats.decorationsPlaced += _placeMushroom(chunk, chunkX, chunkZ, dec, heightmap);
                    break;
                default:
                    stats.decorationsPlaced += _placeSimpleDecoration(chunk, chunkX, chunkZ, dec, heightmap);
            }
        }

        return stats;
    }

    /**
     * Place a tree decoration.
     * Foliage replaces air, water, snow layers, and snow blocks to prevent trees from
     * partially embedding in snow/grass layers that may be on top of terrain in arctic biomes.
     * Trees are spaced with minimum distance from chunk edges for natural placement.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Decorator} dec - Tree decorator definition.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {number} Number of blocks placed.
     * @private
     */
    function _placeTree(chunk, chunkX, chunkZ, dec, heightmap) {
        var placed = 0;

        var logBlock = dec.options.logBlock;
        var leafBlock = dec.options.leafBlock;
        if (!logBlock || !leafBlock) return 0;

        var treeCount = dec.frequency;
        var rngSeed = _hash2D(chunkX, chunkZ);

        for (var t = 0; t < treeCount; t++) {
            // Random position within chunk with minimum distance from edges for natural spacing
            var tx = (rngSeed + t * 7) % (CHUNK_SIZE - 4) + 2;
            if (tx < 2) tx += 2;
            var tz = ((rngSeed >> 8) + t * 13) % (CHUNK_SIZE - 4) + 2;
            if (tz < 2) tz += 2;

            // Get surface height
            var surfaceY = heightmap[tx + tz * CHUNK_SIZE];
            if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT - 10) continue;

            // Check there's air (or water) above the surface for tree placement
            var aboveBlock = chunk.getBlock(tx, surfaceY + 1, tz);
            if (aboveBlock !== 0 && aboveBlock !== _getWaterBlockId()) continue;

            // Place trunk with height variation
            var trunkHeight = dec.options.heightMin + ((rngSeed >> (t * 4 + 2)) % (dec.options.heightMax - dec.options.heightMin + 1));
            var trunkRadius = dec.options.trunkRadius || 1;

            for (var ty = 0; ty < trunkHeight; ty++) {
                var by = surfaceY + 1 + ty;
                if (by < 0 || by >= WORLD_HEIGHT) continue;
                chunk.setBlock(tx, by, tz, logBlock);
                placed++;
            }

            // Place foliage (sphere at top of trunk)
            var leafRadius = dec.options.leafRadius || 2;
            var topY = surfaceY + trunkHeight;

            for (var lx = -leafRadius; lx <= leafRadius; lx++) {
                for (var ly = -leafRadius; ly <= leafRadius; ly++) {
                    for (var lz = -leafRadius; lz <= leafRadius; lz++) {
                        var dist = lx * lx + ly * ly + lz * lz;
                        if (dist > leafRadius * leafRadius + 1) continue;

                        var bx = tx + lx;
                        var bz = tz + lz;
                        var by = topY + ly;

                        if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) continue;
                        if (by < 0 || by >= WORLD_HEIGHT) continue;

                        // Only place leaf in air, water, snow layers, or snow blocks
                        // This prevents trees from partially embedding in snow layers in arctic biomes
                        var currentBlock = chunk.getBlock(bx, by, bz);
                        var waterId = _getWaterBlockId();
                        var snowLayerId = _resolvedBlocks['snow_layer'] || 0;
                        var snowBlockId = _resolvedBlocks['snow_block'] || 0;

                        var isReplaceable = currentBlock === 0 || // air
                                           currentBlock === waterId || // water
                                           currentBlock === snowLayerId || // snow layer
                                           currentBlock === snowBlockId; // snow block

                        if (isReplaceable) {
                            chunk.setBlock(bx, by, bz, leafBlock);
                            placed++;
                        }
                    }
                }
            }
        }

        return placed;
    }

    /**
     * Place a cactus decoration.
     * Cacti are spaced with minimum distance from each other and chunk edges for natural desert placement.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Decorator} dec - Cactus decorator definition.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {number} Number of blocks placed.
     * @private
     */
    function _placeCactus(chunk, chunkX, chunkZ, dec, heightmap) {
        var placed = 0;

        var cactusBlock = dec.blockId;
        if (!cactusBlock) return 0;

        var count = dec.frequency;
        var rngSeed = _hash2D(chunkX + 100, chunkZ);

        for (var i = 0; i < count; i++) {
            // Random position with minimum distance from edges for natural spacing
            var cx = (rngSeed + i * 11) % (CHUNK_SIZE - 4) + 2;
            if (cx < 2) cx += 2;
            var cz = ((rngSeed >> 6) + i * 17) % (CHUNK_SIZE - 4) + 2;
            if (cz < 2) cz += 2;

            var surfaceY = heightmap[cx + cz * CHUNK_SIZE];
            if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT - 5) continue;

            // Check there's air (or water) above the surface for cactus placement
            var aboveBlockC = chunk.getBlock(cx, surfaceY + 1, cz);
            if (aboveBlockC !== 0 && aboveBlockC !== _getWaterBlockId()) continue;

            // Place cactus with height variation
            var height = dec.options.heightMin + ((rngSeed >> (i * 3)) % (dec.options.heightMax - dec.options.heightMin + 1));

            for (var cy = 0; cy < height; cy++) {
                var by = surfaceY + 1 + cy;
                if (by < 0 || by >= WORLD_HEIGHT) continue;
                chunk.setBlock(cx, by, cz, cactusBlock);
                placed++;
            }
        }

        return placed;
    }

    /**
     * Place a mushroom decoration — alternates between brown and red types.
     * Mushrooms are placed with minimum spacing from chunk edges for natural forest floor placement.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Decorator} dec - Mushroom decorator definition.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {number} Number of mushrooms placed.
     * @private
     */
    function _placeMushroom(chunk, chunkX, chunkZ, dec, heightmap) {
        var placed = 0;

        var brownBlock = dec.options.brownBlock || 0;
        var redBlock = dec.options.redBlock || 0;
        if (!brownBlock && !redBlock) return 0;

        var count = dec.frequency;
        var rngSeed = _hash2D(chunkX + (dec.name.charCodeAt(0) << 4), chunkZ);

        for (var i = 0; i < count; i++) {
            // Random position with minimum distance from edges for natural spacing
            var dx = (rngSeed + i * 7) % (CHUNK_SIZE - 4) + 2;
            if (dx < 2) dx += 2;
            var dz = ((rngSeed >> 6) + i * 13) % (CHUNK_SIZE - 4) + 2;
            if (dz < 2) dz += 2;

            var surfaceY = heightmap[dx + dz * CHUNK_SIZE];
            if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT - 1) continue;

            // Check there's air (or water) above the surface and solid ground below
            var aboveBlockM = chunk.getBlock(dx, surfaceY + 1, dz);
            if (aboveBlockM !== 0 && aboveBlockM !== _getWaterBlockId()) continue;

            // Alternate between brown and red mushrooms
            var mushroomBlock = (i % 2 === 0) ? brownBlock : redBlock;
            if (!mushroomBlock) mushroomBlock = brownBlock;

            chunk.setBlock(dx, surfaceY + 1, dz, mushroomBlock);
            placed++;
        }

        return placed;
    }

    /**
     * Place a simple (single-block) decoration.
     * Handles flowers, tall grass, dead bushes, and snow layers with natural spacing.
     * @param {Donkeycraft.Chunk} chunk - The chunk.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {Decorator} dec - Decoration definition.
     * @param {number[]} heightmap - Heightmap array.
     * @returns {number} Number of decorations placed.
     * @private
     */
    function _placeSimpleDecoration(chunk, chunkX, chunkZ, dec, heightmap) {
        var placed = 0;

        var blockId = dec.blockId;
        if (!blockId) return 0;

        var count = dec.frequency;
        var rngSeed = _hash2D(chunkX + (dec.name.charCodeAt(0) << 4), chunkZ);

        // Special handling for snow layers (multi-block thickness)
        if (dec.name === 'snow_layer' && dec.options.layerThickness) {
            var thickness = dec.options.layerThickness;
            for (var x = 0; x < CHUNK_SIZE; x += 2) {
                for (var z = 0; z < CHUNK_SIZE; z += 2) {
                    var surfaceY = heightmap[x + z * CHUNK_SIZE];
                    if (surfaceY < 1 || surfaceY >= WORLD_HEIGHT - thickness) continue;

                    // Check if there's air above the surface
                    var aboveBlockS = chunk.getBlock(x, surfaceY + 1, z);
                    if (aboveBlockS !== 0 && aboveBlockS !== _getWaterBlockId()) continue;

                    // Place snow layer with variable thickness
                    for (var sy = 0; sy < thickness; sy++) {
                        var by = surfaceY + 1 + sy;
                        if (by < 0 || by >= WORLD_HEIGHT) continue;
                        chunk.setBlock(x, by, z, blockId);
                        placed++;
                    }
                }
            }
            return placed;
        }

        // Standard single-block decoration placement
        for (var i = 0; i < count; i++) {
            var dx = (rngSeed + i * 7) % (CHUNK_SIZE - 2) + 1;
            if (dx < 1) dx += 1;
            var dz = ((rngSeed >> 6) + i * 13) % (CHUNK_SIZE - 2) + 1;
            if (dz < 1) dz += 1;

            var surfaceY = heightmap[dx + dz * CHUNK_SIZE];
            if (surfaceY < 0 || surfaceY >= WORLD_HEIGHT - 1) continue;

            // Check there's air (or water) above the surface for simple decoration placement
            var aboveBlockS = chunk.getBlock(dx, surfaceY + 1, dz);
            if (aboveBlockS !== 0 && aboveBlockS !== _getWaterBlockId()) continue;

            chunk.setBlock(dx, surfaceY + 1, dz, blockId);
            placed++;
        }

        return placed;
    }

    // ============================================================
    // Utility Functions
    // ============================================================

    /**
     * Cached water block ID — resolved once during init() for performance.
     * @type {number}
     */
    var _cachedWaterBlockId = 0;

    /**
     * Get the cached water block ID. Resolves and caches on first call if not yet set.
     * Returns 0 if no water block is resolved — leaf placement checks for this
     * to skip liquid block replacement when water is unavailable.
     * @returns {number} Water block ID, or 0 if not resolved.
     */
    function _getWaterBlockId() {
        // Return cached value if already resolved
        if (_cachedWaterBlockId > 0) return _cachedWaterBlockId;

        // Try WaterGenerator first (already initialized)
        if (Donkeycraft.WaterGenerator && typeof Donkeycraft.WaterGenerator.getWaterBlockId === 'function') {
            var waterId = Donkeycraft.WaterGenerator.getWaterBlockId();
            if (waterId > 0) {
                _cachedWaterBlockId = waterId;
                return waterId;
            }
        }

        // Resolve from BlockRegistry as fallback
        if (Donkeycraft.BlockRegistry) {
            var waterNames = ['water', 'water_still', 'flowing_water'];
            for (var i = 0; i < waterNames.length; i++) {
                var block = Donkeycraft.BlockRegistry.getBlockByName(waterNames[i]);
                if (block && block.id > 0) {
                    _cachedWaterBlockId = block.id;
                    return block.id;
                }
            }
        }

        return 0; // No water block available — leaf placement will skip liquid replacement
    }

    /**
     * Deterministic 2D hash using FNV-1a algorithm.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @returns {number} Positive 32-bit integer.
     */
    function _hash2D(x, y) {
        if (Donkeycraft._gen && typeof Donkeycraft._gen._hash2D === 'function') {
            return Donkeycraft._gen._hash2D(Math.floor(x), Math.floor(y));
        }
        x = x | 0;
        y = y | 0;
        var h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
        h = ((h >>> 13) ^ h) * 0x5bd1e995;
        return (h ^ (h >>> 15)) >>> 0;
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
     * Destroy the decoration registry and free resources.
     * Resets all cached block IDs and clears decoration configurations.
     */
    function destroy() {
        _decorators = {};
        _resolvedBlocks = {};
        _cachedWaterBlockId = 0;
    }

    // ============================================================
    // Full Chunk Generation Pipeline
    // ============================================================

    /**
     * Generate a complete chunk with all features: heightmap, surface layers, ores, caves, water, and decorations.
     * This is the main entry point for terrain generation from terrain.html.
     * @param {Donkeycraft.Chunk} chunk - The chunk to populate.
     * @param {number|string|Donkeycraft.Biome} biome - Biome ID (number), name (string), or Biome object.
     * @param {Object} [options] - Generation options.
     * @param {boolean} [options.caves=true] - Whether to generate caves.
     * @param {boolean} [options.ores=true] - Whether to generate ores.
     * @param {boolean} [options.water=true] - Whether to generate water features.
     * @param {boolean} [options.surface=true] - Whether to apply surface layers.
     * @param {boolean} [options.decorations=true] - Whether to place decorations.
     * @returns {{heightmap: number[], stats: Object}} Generation results with heightmap and per-pass stats.
     */
    function generateChunkFull(chunk, biome, options) {
        // Initialize modules if needed
        if (!Donkeycraft.SurfaceGenerator || !Donkeycraft.TerrainSurface ||
            !Donkeycraft.OreGenerator || !Donkeycraft.CaveGenerator ||
            !Donkeycraft.WaterGenerator) {
            return { heightmap: [], stats: {}, error: 'Required modules not loaded' };
        }

        // Resolve biome to ID and name
        var biomeId = 0; // Default to grass
        var biomeName = 'grass';

        if (typeof biome === 'number') {
            biomeId = Math.max(0, Math.floor(biome));
            biomeName = _biomeIdToName(biomeId);
        } else if (typeof biome === 'string') {
            biomeName = biome.toLowerCase();
            biomeId = _biomeNameToId(biomeName);
        } else if (biome && typeof biome === 'object' && biome.id !== undefined) {
            biomeId = Math.max(0, Math.floor(biome.id));
            biomeName = (biome.name || 'grass').toLowerCase();
        }

        // Default options
        var opts = options || {};
        if (opts.caves === undefined) opts.caves = true;
        if (opts.ores === undefined) opts.ores = true;
        if (opts.water === undefined) opts.water = true;
        if (opts.surface === undefined) opts.surface = true;
        if (opts.decorations === undefined) opts.decorations = true;

        var chunkX = chunk.chunkX || 0;
        var chunkZ = chunk.chunkZ || 0;

        var stats = {
            heightmapGenerated: false,
            surfaceApplied: false,
            oresPlaced: 0,
            veinsCreated: 0,
            cavesCarved: 0,
            blocksModified: 0,
            waterBlocksPlaced: 0,
            decorationsPlaced: 0
        };

        // Pass 1: Generate heightmap via SurfaceGenerator
        var heightmap = Donkeycraft.SurfaceGenerator.generateHeightmap(chunkX, chunkZ, biomeName);
        stats.heightmapGenerated = Array.isArray(heightmap) && heightmap.length > 0;

        if (!stats.heightmapGenerated) {
            return { heightmap: [], stats: stats, error: 'Heightmap generation failed' };
        }

        // Pass 2: Apply surface layers via TerrainSurface
        if (opts.surface && typeof Donkeycraft.TerrainSurface.applySurfaceLayers === 'function') {
            var surfaceStats = Donkeycraft.TerrainSurface.applySurfaceLayers(chunk, chunkX, chunkZ, biomeName, heightmap);
            stats.surfaceApplied = true;
            stats.blocksModified += surfaceStats.blocksModified || 0;
        }

        // Pass 3: Place ores via OreGenerator
        if (opts.ores && typeof Donkeycraft.OreGenerator.generateOres === 'function') {
            var oreStats = Donkeycraft.OreGenerator.generateOres(chunk, chunkX, chunkZ, biomeId);
            stats.oresPlaced += oreStats.oresPlaced || 0;
            stats.veinsCreated += oreStats.veinsCreated || 0;
        }

        // Pass 4: Generate caves via CaveGenerator
        if (opts.caves && typeof Donkeycraft.CaveGenerator.generateCaves === 'function') {
            var caveStats = Donkeycraft.CaveGenerator.generateCaves(chunk, chunkX, chunkZ, heightmap);
            stats.cavesCarved += (caveStats.pass1 ? caveStats.pass1.mainCavesCarved : 0) +
                                  (caveStats.pass2 ? caveStats.pass2.smallCavesCarved : 0) +
                                  (caveStats.pass3 ? caveStats.pass3.entrancesCarved : 0) +
                                  (caveStats.pass4 ? caveStats.pass4.lavaCavesCarved : 0) +
                                  (caveStats.pass5 ? caveStats.pass5.decoCaves : 0);
            stats.blocksModified += caveStats.totalBlocksModified || 0;
        }

        // Pass 5: Place water via WaterGenerator
        if (opts.water && typeof Donkeycraft.WaterGenerator.placeWater === 'function') {
            var waterStats = Donkeycraft.WaterGenerator.placeWater(chunk, chunkX, chunkZ, biomeId, heightmap, opts);
            stats.waterBlocksPlaced += waterStats.waterBlocksPlaced || 0;
        }

        // Pass 6: Place decorations via placeDecorations
        if (opts.decorations && typeof placeDecorations === 'function') {
            var decoStats = placeDecorations(chunk, chunkX, chunkZ, biomeName, heightmap);
            stats.decorationsPlaced += decoStats.decorationsPlaced || 0;
        }

        return { heightmap: heightmap, stats: stats };
    }

    /**
     * Map a biome ID to its name string.
     * @param {number} biomeId - Biome ID.
     * @returns {string} Biome name.
     * @private
     */
    function _biomeIdToName(biomeId) {
        switch (biomeId) {
            case 0: return 'grass';
            case 1: return 'arctic';
            case 2: return 'desert';
            case 3: return 'forest';
            default: return 'grass';
        }
    }

    /**
     * Map a biome name string to its ID value.
     * @param {string} name - Biome name.
     * @returns {number} Biome ID.
     * @private
     */
    function _biomeNameToId(name) {
        switch (name) {
            case 'grass': return 0;
            case 'arctic': return 1;
            case 'desert': return 2;
            case 'forest': return 3;
            default: return 0;
        }
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Donkeycraft.StructureGenerator — Biome-specific surface decoration placement and full chunk generation pipeline.
     * Handles trees, flowers, grass, cacti, mushrooms, and other biome-appropriate decorations.
     * @namespace
     */
    Donkeycraft.StructureGenerator = {
        // Full chunk generation pipeline (main entry point from terrain.html)
        generateChunkFull: generateChunkFull,

        // Decoration placement
        placeDecorations: placeDecorations,

        // Initialization / lifecycle
        init: init,
        destroy: destroy,

        // Configuration access
        getDecorations: getDecorations,
        getBiomesWithDecorations: getBiomesWithDecorations,
        getBlockId: getBlockId,

        // Constants (read-only reference for external consumers)
        Decorator: Decorator
    };

})();
