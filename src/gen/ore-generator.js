// Donkeycraft — Ore Generator
// Ore distribution: vein placement per biome, rarity, Y-level ranges for all ores.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // Ore Definitions
    // ============================================================

    /**
     * Ore definitions with Y-level ranges, vein size, rarity, and biome restrictions.
     * Block IDs resolved at runtime via BlockRegistry using block names.
     * Y-levels are absolute, but actual placement is clamped to terrain surface during generation.
     * @type {Array<{blockName: string, name: string, minY: number, maxY: number, veinSize: number, rarity: number, biomes: number[]}>}
     */
    var ORE_DEFS = [
        { blockName: 'coal_ore', name: 'coal_ore', minY: 0, maxY: 60, veinSize: 5, rarity: 20, biomes: null },
        { blockName: 'iron_ore', name: 'iron_ore', minY: 0, maxY: 50, veinSize: 4, rarity: 16, biomes: null },
        { blockName: 'gold_ore', name: 'gold_ore', minY: 0, maxY: 32, veinSize: 3, rarity: 24, biomes: null },
        { blockName: 'diamond_ore', name: 'diamond_ore', minY: 0, maxY: 20, veinSize: 3, rarity: 32, biomes: null },
        { blockName: 'redstone_ore', name: 'redstone_ore', minY: 0, maxY: 28, veinSize: 3, rarity: 20, biomes: null },
        { blockName: 'lapis_ore', name: 'lapis_ore', minY: 0, maxY: 24, veinSize: 2, rarity: 28, biomes: null },
        { blockName: 'emerald_ore', name: 'emerald_ore', minY: 0, maxY: 20, veinSize: 1, rarity: 40, biomes: [Donkeycraft.BiomeID.EXTREME_HILLS] }
    ];

    // Cache for resolved block IDs to avoid repeated lookups.
    var _blockCache = null;

    /**
     * Resolve all ore block IDs from BlockRegistry and cache them.
     * Uses exact block names from definitions for reliable lookup.
     * @private
     */
    function _resolveBlockIds() {
        _blockCache = {};
        if (!Donkeycraft.BlockRegistry) return;

        for (var i = 0; i < ORE_DEFS.length; i++) {
            var def = ORE_DEFS[i];
            // Try exact block name first
            var block = Donkeycraft.BlockRegistry.getBlockByName(def.blockName);
            if (!block) {
                // Fallback: try common naming variations
                var parts = def.blockName.split('_');
                if (parts.length > 1) {
                    // Try without last part (e.g., "coal_ore" → "coal")
                    block = Donkeycraft.BlockRegistry.getBlockByName(parts[0]);
                }
            }
            if (block) {
                _blockCache[def.name] = block.id;
            } else {
                // Log warning for missing blocks (only once per name)
                if (!_blockCache._warned) _blockCache._warned = {};
                if (!_blockCache._warned[def.blockName]) {
                    _blockCache._warned[def.blockName] = true;
                    if (Donkeycraft.Logger) {
                        Donkeycraft.Logger.warn('OreGenerator: block "' + def.blockName + '" not found in BlockRegistry');
                    }
                }
            }
        }
    }

    /**
     * Get a resolved block ID by ore name.
     * @param {string} oreName - Ore definition name.
     * @returns {number|null} Block ID or null if not found.
     * @private
     */
    function _getBlockId(oreName) {
        if (!_blockCache && Donkeycraft.BlockRegistry) {
            _resolveBlockIds();
        }
        return _blockCache ? _blockCache[oreName] : null;
    }

    // ============================================================
    // OreGenerator
    // ============================================================

    /**
     * OreGenerator — places ore veins in chunks.
     */
    Donkeycraft.OreGenerator = (function () {
        /**
         * Initialize the ore generator by resolving all ore block IDs from BlockRegistry.
         * Resolves blocks by name, falling back to common aliases for robustness.
         */
        function init() {
            _resolveBlockIds();
        }

        /**
         * Place ores in a chunk based on biome restrictions and ore definitions.
         * Resolves block IDs from BlockRegistry at runtime for correctness.
         * Auto-initializes the ore generator (resolves all block IDs) on first call.
         * Ore Y levels are clamped to terrain surface via heightmap to prevent spawning above ground.
         * @param {Donkeycraft.Chunk} chunk - The chunk to place ores in.
         * @param {number} biomeId - Biome ID for this chunk.
         * @param {number[]} [heightmap] - Optional heightmap array for terrain clamping.
         */
        function placeOres(chunk, biomeId, heightmap) {
            if (!chunk || !chunk.getBlock || !chunk.setBlock) return;

            // Auto-initialize: resolve all block IDs from BlockRegistry on first call
            if (!_blockCache && Donkeycraft.BlockRegistry) {
                _resolveBlockIds();
            }

            for (var i = 0; i < ORE_DEFS.length; i++) {
                var oreDef = ORE_DEFS[i];
                var blockId = _getBlockId(oreDef.name);

                // Skip if block not found in registry
                if (blockId === null || blockId === 0) continue;

                // Check biome restriction
                if (oreDef.biomes && oreDef.biomes.length > 0) {
                    var found = false;
                    for (var j = 0; j < oreDef.biomes.length; j++) {
                        if (oreDef.biomes[j] === biomeId) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) continue; // Skip this ore for this biome
                }

                // Place veins for this ore type
                _placeOreVeins(chunk, oreDef, blockId, heightmap);
            }
        }

        /**
         * Place veins for a single ore type in a chunk.
         * Y levels are clamped to terrain surface when heightmap is provided.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {object} oreDef - Ore definition.
         * @param {number} blockId - Resolved block ID.
         * @param {number[]} [heightmap] - Optional heightmap for terrain clamping.
         * @private
         */
        function _placeOreVeins(chunk, oreDef, blockId, heightmap) {
            // Determine how many vein placement attempts based on rarity
            var attempts = Math.floor((CHUNK_SIZE * CHUNK_SIZE) / oreDef.rarity);

            for (var v = 0; v < attempts; v++) {
                // Random position in the chunk using deterministic hash
                var seedX = _hash2D(v, 0x7F3A + oreDef.minY);
                var seedZ = _hash2D(v, 0xB4C1 + oreDef.maxY);

                var vx = seedX % CHUNK_SIZE;
                if (vx < 0) vx += CHUNK_SIZE; // Handle negative modulo
                var vz = seedZ % CHUNK_SIZE;
                if (vz < 0) vz += CHUNK_SIZE;

                // Determine terrain surface Y at this position for clamping
                var surfaceY = WORLD_HEIGHT; // Default: use max if no heightmap
                if (heightmap) {
                    surfaceY = heightmap[vx + vz * CHUNK_SIZE] || WORLD_HEIGHT;
                }

                // Calculate max Y: ore must be below terrain surface
                // Subtract offset based on ore depth tier to create proper underground distribution
                var depthOffset;
                if (oreDef.name === 'coal_ore' || oreDef.name === 'iron_ore') {
                    depthOffset = 6; // Common ores: a bit deeper
                } else if (oreDef.name === 'gold_ore' || oreDef.name === 'redstone_ore') {
                    depthOffset = 12; // Rarer ores: deeper
                } else {
                    depthOffset = 10; // Default
                }

                var maxYForOre = Math.min(oreDef.maxY, surfaceY - depthOffset);

                // Skip this vein if no valid Y range exists (terrain too low)
                if (oreDef.minY >= maxYForOre) continue;

                // Random Y level within ore's clamped range
                var vy = _randomInRange(v, oreDef.minY, maxYForOre);

                // Place the vein (simple sphere shape)
                _placeVein(chunk, vx, vy, vz, blockId, oreDef.veinSize, v);
            }
        }

        /**
         * Place a single ore vein as a rough sphere with natural variation.
         * Uses fbm noise for organic shape instead of hard sphere edges.
         * Validates that the ore is placed inside solid terrain (block below must not be air).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} cx - Center X.
         * @param {number} cy - Center Y.
         * @param {number} cz - Center Z.
         * @param {number} blockId - Ore block ID.
         * @param {number} radius - Vein radius.
         * @param {number} veinIndex - Index of this vein for variation.
         * @private
         */
        function _placeVein(chunk, cx, cy, cz, blockId, radius, veinIndex) {
            var halfRadius = Math.ceil(radius);
            var seedX = cx + veinIndex * 1000;
            var seedZ = cz + veinIndex * 2000;

            for (var dx = -halfRadius; dx <= halfRadius; dx++) {
                for (var dy = -halfRadius; dy <= halfRadius; dy++) {
                    for (var dz = -halfRadius; dz <= halfRadius; dz++) {
                        var distSq = dx * dx + dy * dy + dz * dz;
                        if (distSq > radius * radius) continue;

                        var bx = cx + dx;
                        var by = cy + dy;
                        var bz = cz + dz;

                        // Check bounds
                        if (bx < 0 || bx >= CHUNK_SIZE || by < 0 || by >= WORLD_HEIGHT || bz < 0 || bz >= CHUNK_SIZE) {
                            continue;
                        }

                        // Validate: block below must be solid (not air) to ensure ore is underground
                        if (by > 0) {
                            var blockBelow = chunk.getBlock(bx, by - 1, bz);
                            if (blockBelow === 0) continue; // Skip — no solid block beneath
                        } else {
                            continue; // Y=0 has nothing below, skip
                        }

                        // Use noise for organic shape variation — blocks near the edge
                        // have a probability of inclusion based on their distance from center.
                        var dist = Math.sqrt(distSq);
                        var noiseVal = Donkeycraft._gen ? Donkeycraft._gen._noise2D(
                            (bx + veinIndex * 100) * 0.3, (bz + veinIndex * 200) * 0.3
                        ) : 0;

                        // Smooth falloff: center blocks always placed, edge blocks probabilistic
                        var threshold = radius - 0.5 + noiseVal * 0.8;
                        if (dist < threshold) {
                            chunk.setBlock(bx, by, bz, blockId);
                        }
                    }
                }
            }
        }

        /**
         * Get the minimum Y level for an ore type by name.
         * @param {string} oreName - Ore definition name (e.g., 'diamond_ore').
         * @returns {number} Minimum Y level, or -1 if not found.
         */
        function getMinY(oreName) {
            for (var i = 0; i < ORE_DEFS.length; i++) {
                if (ORE_DEFS[i].name === oreName) {
                    return ORE_DEFS[i].minY;
                }
            }
            return -1;
        }

        /**
         * Get the maximum Y level for an ore type by name.
         * @param {string} oreName - Ore definition name (e.g., 'diamond_ore').
         * @returns {number} Maximum Y level, or -1 if not found.
         */
        function getMaxY(oreName) {
            for (var i = 0; i < ORE_DEFS.length; i++) {
                if (ORE_DEFS[i].name === oreName) {
                    return ORE_DEFS[i].maxY;
                }
            }
            return -1;
        }

        /**
         * Get all ore definitions.
         * @returns {Array<{blockName: string, name: string, minY: number, maxY: number, veinSize: number, rarity: number, biomes: number[]}>} Array of ore definition objects.
         */
        function getOreDefinitions() {
            return ORE_DEFS.slice();
        }

        /**
         * Get the number of ore types defined.
         * @returns {number} Number of ore definitions.
         */
        function getOreCount() {
            return ORE_DEFS.length;
        }

        /**
         * Deterministic 2D hash — delegates to centralized _gen._hash2D.
         * @param {number} x
         * @param {number} y
         * @returns {number} Positive 32-bit integer.
         * @private
         */
        function _hash2D(x, y) {
            return Donkeycraft._gen._hash2D(x, y);
        }

        /**
         * Generate a pseudo-random number in a range using deterministic hashing.
         * Uses high bits of hash to minimize modulo bias for non-power-of-two ranges.
         * @param {number} index - Variation index for this vein placement attempt.
         * @param {number} min - Minimum Y value (inclusive).
         * @param {number} max - Maximum Y value (inclusive).
         * @returns {number} Integer in [min, max].
         * @private
         */
        function _randomInRange(index, min, max) {
            var hash = _hash2D(index, ((min + max) | 0));
            var range = max - min + 1;
            if (range <= 1) return min;
            // Use high bits of hash to minimize bias for small ranges
            if (range <= 256) {
                return min + ((hash >>> 16) % range);
            }
            return min + (hash % range);
        }

        /**
         * Validate that required parameters are of correct type and range.
         * @param {Object} params - Parameters to validate.
         * @returns {boolean} True if all validations pass.
         * @private
         */
        function _validateParams(params) {
            if (!params.chunk || typeof params.chunk.getBlock !== 'function') return false;
            if (typeof params.biomeId !== 'number' || params.biomeId < 0) return false;
            return true;
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The OreGenerator module.
         */
        function getInstance() {
            return Donkeycraft.OreGenerator;
        }

        /**
         * Destroy and free resources.
         */
        function destroy() {
            _blockCache = null;
        }

        return {
            getInstance: getInstance,
            init: init,
            placeOres: placeOres,
            getMinY: getMinY,
            getMaxY: getMaxY,
            getOreDefinitions: getOreDefinitions,
            getOreCount: getOreCount,
            destroy: destroy
        };
    })();

})();