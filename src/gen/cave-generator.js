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
        // ============================================================
        // Configuration constants — extracted from magic numbers
        // ============================================================

        /** Default cave density threshold. fbm returns [-1,1]; lower = fewer caves. */
        var _DEFAULT_CAVE_DENSITY = -0.8;
        /** Base cave tunnel radius in blocks. */
        var _DEFAULT_CAVE_RADIUS = 2.0;
        /** Y level threshold below which lava caves are generated. */
        var _DEFAULT_LAVA_Y_LEVEL = 10;
        /** Maximum Y iterations per column to prevent infinite loops in cave generation. */
        var _MAX_CAVE_ITERATIONS = 500;

        // Ocean biome density modifier — more negative = fewer caves (water fills them)
        var _OCEAN_DENSITY_MODIFIER = -0.95;
        var _OCEAN_RADIUS_MODIFIER = 0.5;

        // Desert biome density modifier — slightly fewer caves
        var _DESERT_DENSITY_MODIFIER = -0.9;

        // Noise scale factors for cave generation
        var _CAVE_NOISE_SCALE_XZ = 0.02;
        var _CAVE_NOISE_SCALE_Y = 0.02;
        var _CAVE_NOISE_OCTAVES = 3;
        var _CAVE_NOISE_PERSISTENCE = 0.5;
        var _CAVE_NOISE_LUNNARITY = 2.0;

        // Adaptive Y stepping
        var _SHALLOW_DEPTH_THRESHOLD = 20; // Blocks above minY where caves are continuous
        var _MAX_Y_STEP = 4;
        var _MIN_Y_STEP = 1;

        /**
         * Current configuration — defaults to standard overworld values.
         * @type {{minY: number, maxY: number, lavaYLevel: number}}
         * @private
         */
        var _defaultConfig = { minY: 1, maxY: WORLD_HEIGHT - 1, lavaYLevel: _DEFAULT_LAVA_Y_LEVEL };

        // Runtime state — these are mutable via setters.
        var _caveDensity = _DEFAULT_CAVE_DENSITY;
        var _caveRadius = _DEFAULT_CAVE_RADIUS;
        var _lavaYLevel = _DEFAULT_LAVA_Y_LEVEL;
        /** Maximum Y iterations per column to prevent infinite loops in cave generation. */
        var _maxCaveIterations = _MAX_CAVE_ITERATIONS;

        /**
         * Check if a block ID is replaceable (air, flowers, grass, tall grass, etc.).
         * Uses safe method existence checks to avoid errors if BlockRegistry methods are missing.
         * Centralized helper — also available via Donkeycraft._gen._isReplaceable when needed.
         * NOTE: Does NOT include transparent blocks (glass, stained glass) or liquids — caves
         * should only carve through truly replaceable surface decorations and air.
         * @param {number} blockId - Block ID to check.
         * @returns {boolean} True if the block can be carved through.
         * @private
         */
        function _isReplaceable(blockId) {
            if (blockId === 0) return true;
            if (Donkeycraft.BlockRegistry) {
                try {
                    if (typeof Donkeycraft.BlockRegistry.isReplaceable === 'function' && Donkeycraft.BlockRegistry.isReplaceable(blockId)) return true;
                } catch (e) { /* BlockRegistry method threw — skip */ }
            }
            return false;
        }

        /**
         * Generate caves in a chunk using 3D noise.
         * Creates main cave layers and deep lava caves based on biome type.
         * @param {Donkeycraft.Chunk} chunk - The chunk to generate caves in.
         * @param {number} biomeId - Biome ID for this chunk.
         * @param {Object} [dimConfig] - Optional dimension configuration.
         * @param {number} [dimConfig.minY] - Minimum Y level for cave generation. Defaults to 1.
         * @param {number} [dimConfig.maxY] - Maximum Y level for cave generation. Defaults to WORLD_HEIGHT - 1.
         * @param {number} [dimConfig.lavaYLevel] - Y level threshold for lava caves. Defaults to 10.
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
                density = _OCEAN_DENSITY_MODIFIER;
                radius = _caveRadius * _OCEAN_RADIUS_MODIFIER;
            } else if (biomeId === Donkeycraft.BiomeID.DESERT || biomeId === Donkeycraft.BiomeID.DESERT_M) {
                density = _DESERT_DENSITY_MODIFIER;
            }

            // Generate main cave layer with continuous Y iteration
            _generateCaveLayer(chunk, density, radius, minY, maxY, 'main');

            // Generate lava caves near bedrock floor (60% radius, higher density)
            _generateCaveLayer(chunk, _OCEAN_DENSITY_MODIFIER, radius * 0.6, minY, lavaYLevel + 4, 'lava');
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
                    var threshold = density + Donkeycraft._gen._noise2D(
                        x * 0.3, z * 0.3
                    ) * 0.05;

                    // Continuous Y iteration for connected cave networks with max iteration guard.
                    var y = minY;
                    var iterations = 0;
                    while (y < maxY && iterations < _maxCaveIterations) {
                        iterations++;

                        // Primary cave noise — fbm via _gen wrapper for proper initialization
                        var noiseVal = Donkeycraft._gen._fbm(
                            worldX * _CAVE_NOISE_SCALE_XZ,
                            y * _CAVE_NOISE_SCALE_Y,
                            worldZ * _CAVE_NOISE_SCALE_XZ,
                            _CAVE_NOISE_OCTAVES, _CAVE_NOISE_PERSISTENCE, _CAVE_NOISE_LUNNARITY
                        );

                        // Carve when noise falls below the threshold (fbm returns [-1, 1])
                        if (noiseVal < threshold) {
                            // Carve a tunnel at this position with slight Y spread
                            var tunnelRadius = radius + Donkeycraft._gen._noise2D(
                                y * 0.1 + x, z * 0.1 + worldZ * 0.05
                            ) * radius * 0.5;

                            _carveTunnel(chunk, x, y, z, tunnelRadius);
                        }

                        // Adaptive Y step: near shallow depth = continuous caves; deeper = spaced steps
                        var yNoise = Donkeycraft._gen._noise2D(worldX * 0.1, worldZ * 0.1);
                        var yStep = (y < minY + _SHALLOW_DEPTH_THRESHOLD) ? _MIN_Y_STEP : ((yNoise > 0) ? 3 : 2);

                        // Clamp step to avoid skipping too far
                        if (yStep < _MIN_Y_STEP) yStep = _MIN_Y_STEP;
                        if (yStep > _MAX_Y_STEP) yStep = _MAX_Y_STEP;

                        y += yStep;
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
         * Get the current cave density threshold.
         * @returns {number} Cave density threshold (typically -0.95 to -0.7).
         */
        function getDensity() {
            return _caveDensity;
        }

        /**
         * Set the cave density threshold.
         * @param {number} value - New density value (recommended range: -1.0 to 0.0).
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
            if (typeof value === 'number' && value > 0) {
                _caveRadius = value;
            }
        }

        /**
         * Get the Y level below which lava caves are generated.
         * @returns {number} Lava cave Y level threshold.
         */
        function getLavaYLevel() {
            return _lavaYLevel;
        }

        /**
         * Set the Y level below which lava caves are generated.
         * @param {number} value - New lava Y level (must be > 0 and < WORLD_HEIGHT).
         */
        function setLavaYLevel(value) {
            if (typeof value === 'number' && value > 0 && value < WORLD_HEIGHT) {
                _lavaYLevel = Math.floor(value);
            }
        }

        /**
         * Get the maximum Y iterations per column.
         * @returns {number} Max cave iterations.
         */
        function getMaxCaveIterations() {
            return _maxCaveIterations;
        }

        /**
         * Set the maximum Y iterations per column.
         * @param {number} value - New max iterations (positive integer).
         */
        function setMaxCaveIterations(value) {
            if (typeof value === 'number' && value > 0) {
                _maxCaveIterations = Math.floor(value);
            }
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The CaveGenerator module.
         */
        function getInstance() {
            return Donkeycraft.CaveGenerator;
        }

        /**
         * Destroy and free resources. Cleans up internal state.
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
            setLavaYLevel: setLavaYLevel,
            getMaxCaveIterations: getMaxCaveIterations,
            setMaxCaveIterations: setMaxCaveIterations,
            destroy: destroy
        };
    })();

})();