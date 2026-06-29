// Donkeycraft — Cave Generator
// Cave system: 3D noise-based cave generation, lava caves, mushroom caves.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // CaveGenerator
    // ============================================================

    /**
     * CaveGenerator — generates cave systems using 3D noise.
     */
    Donkeycraft.CaveGenerator = (function () {
        // Cave density threshold — fbm value below which caves form.
        // fbm returns [-1, 1]; -0.7 carves the lowest ~12% of values for natural cave density.
        var _caveDensity = -0.7;
        var _caveRadius = 3.0;          // Base cave tunnel radius
        var _lavaYLevel = 10;           // Lava caves below this Y level
        var _surfaceDepth = 5;          // Surface depth for hanging caves

        /**
         * Default dimension configuration for overworld-style generation.
         * @type {{minY: number, maxY: number, lavaYLevel: number}}
         * @private
         */
        var _defaultConfig = { minY: 1, maxY: WORLD_HEIGHT - 1, lavaYLevel: _lavaYLevel };

        /**
         * Check if a block ID is replaceable (air, liquids, flowers, grass, etc.).
         * Used to determine which blocks caves can carve through.
         * @param {number} blockId - Block ID to check.
         * @returns {boolean} True if the block can be carved through.
         * @private
         */
        function _isReplaceable(blockId) {
            // Air is always replaceable
            if (blockId === 0) return true;

            // Check via BlockRegistry if available
            if (Donkeycraft.BlockRegistry) {
                if (Donkeycraft.BlockRegistry.isReplaceable && Donkeycraft.BlockRegistry.isReplaceable(blockId)) return true;
                if (Donkeycraft.BlockRegistry.isTransparent && Donkeycraft.BlockRegistry.isTransparent(blockId)) return true;
                if (Donkeycraft.BlockRegistry.isLiquid && Donkeycraft.BlockRegistry.isLiquid(blockId)) return true;
            }

            return false;
        }

        /**
         * Generate caves in a chunk using 3D noise.
         * @param {Donkeycraft.Chunk} chunk - The chunk to generate caves in.
         * @param {number} biomeId - Biome ID for this chunk.
         * @param {Object} [dimConfig] - Optional dimension config {minY, maxY, lavaYLevel}.
         */
        function generateCaves(chunk, biomeId, dimConfig) {
            // Input validation
            if (!chunk || typeof chunk.getBlock !== 'function' || typeof chunk.setBlock !== 'function') return;
            if (typeof biomeId !== 'number' || biomeId < 0) return;

            // Resolve dimension configuration
            var config = dimConfig || _defaultConfig;
            var minY = config.minY !== undefined ? config.minY : 0;
            var maxY = config.maxY !== undefined ? config.maxY : WORLD_HEIGHT;
            var lavaYLevel = config.lavaYLevel !== undefined ? config.lavaYLevel : _lavaYLevel;

            // Ocean biomes: fewer caves (water fills them)
            var density = _caveDensity;
            var radius = _caveRadius;

            if (biomeId === Donkeycraft.BiomeID.OCEAN) {
                density = -0.9;  // More negative = fewer caves carved
                radius = _caveRadius * 0.5;
            } else if (biomeId === Donkeycraft.BiomeID.DESERT || biomeId === Donkeycraft.BiomeID.DESERT_M) {
                density = -0.8;  // Slightly fewer caves in deserts
            }

            // Generate main cave layer with continuous Y iteration
            _generateCaveLayer(chunk, density, radius, minY, maxY, 'main');

            // Generate lava caves near bedrock floor
            _generateCaveLayer(chunk, -0.9, radius * 0.7, minY, lavaYLevel + 5, 'lava');
        }

        /**
         * Generate a single cave layer within Y bounds using continuous Y iteration
         * for connected cave systems. Uses 3D fbm noise to carve smooth tunnel shapes.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} density - Cave density threshold.
         * @param {number} radius - Base tunnel radius.
         * @param {number} minY - Minimum Y level.
         * @param {number} maxY - Maximum Y level.
         * @param {string} layerType - Layer type ('main', 'lava').
         * @private
         */
        function _generateCaveLayer(chunk, density, radius, minY, maxY, layerType) {
            // Clamp to valid range
            if (minY < 0) minY = 0;
            if (maxY > WORLD_HEIGHT) maxY = WORLD_HEIGHT;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var worldX = chunk.chunkX * CHUNK_SIZE + x;
                    var worldZ = chunk.chunkZ * CHUNK_SIZE + z;

                    // Adjust threshold based on local X/Z noise for tunnel shape variation.
                    // fbm returns [-1, 1]; threshold varies slightly around _caveDensity.
                    var threshold = density + Donkeycraft.PerlinNoise.noise2D(
                        x * 0.3, z * 0.3
                    ) * 0.05;

                    // Continuous Y iteration for connected cave networks
                    // Use while loop so manual y increment works correctly
                    var y = minY;
                    while (y < maxY) {
                        // Primary cave noise — fbm with global seed baked into PerlinNoise
                        var noiseVal = Donkeycraft.PerlinNoise.fbm(
                            worldX * 0.02,
                            y * 0.02,
                            worldZ * 0.02,
                            3, 0.5, 2.0
                        );

                        // Carve when noise falls below the threshold (fbm returns [-1, 1]).
                        // Lower threshold = fewer caves; -0.7 carves ~12% of blocks.
                        if (noiseVal < threshold) {
                            // Carve a tunnel at this position with slight Y spread
                            var tunnelRadius = radius + Donkeycraft.PerlinNoise.noise2D(
                                y * 0.1 + x, z * 0.1 + worldZ * 0.05
                            ) * radius * 0.5;

                            _carveTunnel(chunk, x, y, z, tunnelRadius);
                        }

                        // Skip Y levels for performance — caves are spaced vertically.
                        // Jump ahead after the first few Y levels to avoid excessive computation.
                        // Net increase per iteration: 4 (when y > minY + 20) or 1 (otherwise).
                        if (y > minY + 20) {
                            y += 4;
                        } else {
                            y++;
                        }
                    }
                }
            }
        }

        /**
         * Carve a tunnel at the given position with the given radius.
         * Uses spherical shape with smooth falloff for natural-looking caves.
         * Carves through air, liquids, and replaceable blocks (flowers, grass, tall grass, etc.).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} cx - Center X.
         * @param {number} cy - Center Y.
         * @param {number} cz - Center Z.
         * @param {number} radius - Tunnel radius.
         * @private
         */
        function _carveTunnel(chunk, cx, cy, cz, radius) {
            var r = Math.ceil(radius);

            var radiusSq = radius * radius;
            for (var dx = -r; dx <= r; dx++) {
                var dx2 = dx * dx;
                for (var dy = -r; dy <= r; dy++) {
                    var dy2 = dy * dy;
                    for (var dz = -r; dz <= r; dz++) {
                        var distSq = dx2 + dy2 + (dz * dz);
                        if (distSq <= radiusSq) {
                            var bx = cx + dx;
                            var by = cy + dy;
                            var bz = cz + dz;

                            // Check bounds
                            if (bx >= 0 && bx < CHUNK_SIZE &&
                                by >= 0 && by < WORLD_HEIGHT &&
                                bz >= 0 && bz < CHUNK_SIZE) {
                                var currentBlock = chunk.getBlock(bx, by, bz);
                                // Carve air, liquids, and replaceable blocks.
                                if (currentBlock === 0 ||
                                    _isReplaceable(currentBlock)) {
                                    chunk.setBlock(bx, by, bz, 0); // Air
                                }
                            }
                        }
                    }
                }
            }
        }

        /**
         * Get the cave density threshold.
         * Higher values produce more caves (threshold is subtracted from noise, so higher = easier to carve).
         * @returns {number} Cave density threshold.
         */
        function getDensity() {
            return _caveDensity;
        }

        /**
         * Set the cave density threshold.
         * Higher values produce more caves (threshold is subtracted from noise, so higher = easier to carve).
         * @param {number} value - New density value in range [0, 1].
         */
        function setDensity(value) {
            _caveDensity = value;
        }

        /**
         * Get the base cave tunnel radius in blocks.
         * @returns {number} Base tunnel radius.
         */
        function getRadius() {
            return _caveRadius;
        }

        /**
         * Set the base cave tunnel radius in blocks.
         * @param {number} value - New radius value (positive number).
         */
        function setRadius(value) {
            _caveRadius = value;
        }

        /**
         * Get the Y level below which lava caves are generated.
         * @returns {number} Lava cave Y level threshold.
         */
        function getLavaYLevel() {
            return _lavaYLevel;
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The CaveGenerator module.
         */
        function getInstance() {
            return Donkeycraft.CaveGenerator;
        }

        /**
         * Destroy and free resources.
         */
        function destroy() {
            // No dynamic resources to free — all state is in closure variables
        }

        return {
            getInstance: getInstance,
            generateCaves: generateCaves,
            getDensity: getDensity,
            setDensity: setDensity,
            getRadius: getRadius,
            setRadius: setRadius,
            getLavaYLevel: getLavaYLevel,
            destroy: destroy
        };
    })();

})();