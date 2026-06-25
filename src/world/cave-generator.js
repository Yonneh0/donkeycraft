// Donkeycraft — Cave Generator
// Cave system: 3D noise-based cave generation, lava caves, mushroom caves.
(function() {
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
    Donkeycraft.CaveGenerator = (function() {
        var _caveDensity = 0.012;       // Noise threshold for cave air
        var _caveRadius = 3.0;          // Base cave tunnel radius
        var _lavaYLevel = 10;           // Lava caves below this Y level
        var _surfaceDepth = 5;          // Surface depth for hanging caves

        /**
         * Generate caves in a chunk using 3D noise.
         * @param {Donkeycraft.Chunk} chunk - The chunk to generate caves in.
         * @param {number} biomeId - Biome ID for this chunk.
         */
        function generateCaves(chunk, biomeId) {
            // Ocean biomes: fewer caves (water fills them)
            var density = _caveDensity;
            var radius = _caveRadius;

            if (biomeId === 6) { // Ocean
                density = _caveDensity * 0.3;
                radius = _caveRadius * 0.5;
            } else if (biomeId === 2 || biomeId === 12) { // Desert
                density = _caveDensity * 0.7;
            }

            // Generate main cave layer
            _generateCaveLayer(chunk, density, radius, 0, WORLD_HEIGHT, 'main');

            // Generate lava caves near bedrock
            _generateCaveLayer(chunk, density * 0.5, radius * 0.7, 0, _lavaYLevel + 5, 'lava');
        }

        /**
         * Generate a single cave layer within Y bounds.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} density - Cave density threshold.
         * @param {number} radius - Base tunnel radius.
         * @param {number} minY - Minimum Y level.
         * @param {number} maxY - Maximum Y level.
         * @param {string} layerType - Layer type ('main', 'lava').
         * @private
         */
        function _generateCaveLayer(chunk, density, radius, minY, maxY, layerType) {
            var seedX = chunk.chunkX * 1000;
            var seedZ = chunk.chunkZ * 1000;

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    // Global coordinates for noise sampling
                    var worldX = chunk.chunkX * CHUNK_SIZE + x;
                    var worldZ = chunk.chunkZ * CHUNK_SIZE + z;

                    // Sample 3D noise at multiple points along Y axis
                    for (var y = minY; y < maxY; y++) {
                        // Primary cave noise
                        var noiseVal = Donkeycraft.PerlinNoise.fbm(
                            worldX * 0.02 + seedX,
                            y * 0.02,
                            worldZ * 0.02 + seedZ,
                            3, 0.5, 2.0
                        );

                        // Adjust threshold based on noise value for tunnel shapes
                        var threshold = density + Donkeycraft.PerlinNoise.noise2D(
                            x * 0.3, z * 0.3
                        ) * 0.003;

                        if (noiseVal < -threshold) {
                            // This is cave space — carve out a tunnel
                            var tunnelRadius = radius + Donkeycraft.PerlinNoise.noise2D(
                                y * 0.1 + x, z * 0.1 + worldZ * 0.05
                            ) * radius * 0.5;

                            _carveTunnel(chunk, x, y, z, tunnelRadius);
                        }
                    }
                }
            }
        }

        /**
         * Carve a tunnel at the given position with the given radius.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} cx - Center X.
         * @param {number} cy - Center Y.
         * @param {number} cz - Center Z.
         * @param {number} radius - Tunnel radius.
         * @private
         */
        function _carveTunnel(chunk, cx, cy, cz, radius) {
            var r = Math.ceil(radius);

            for (var dx = -r; dx <= r; dx++) {
                for (var dy = -r; dy <= r; dy++) {
                    for (var dz = -r; dz <= r; dz++) {
                        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (dist <= radius) {
                            var bx = cx + dx;
                            var by = cy + dy;
                            var bz = cz + dz;

                            // Check bounds
                            if (bx >= 0 && bx < CHUNK_SIZE &&
                                by >= 0 && by < WORLD_HEIGHT &&
                                bz >= 0 && bz < CHUNK_SIZE) {
                                var currentBlock = chunk.getBlock(bx, by, bz);
                                // Only carve air and water/lava (not solid blocks)
                                if (currentBlock === 0 || currentBlock === 212 || currentBlock === 213) {
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
         * @returns {number}
         */
        function getDensity() {
            return _caveDensity;
        }

        /**
         * Set the cave density threshold.
         * @param {number} value - New density value.
         */
        function setDensity(value) {
            _caveDensity = value;
        }

        /**
         * Get the base cave tunnel radius.
         * @returns {number}
         */
        function getRadius() {
            return _caveRadius;
        }

        /**
         * Set the base cave tunnel radius.
         * @param {number} value - New radius value.
         */
        function setRadius(value) {
            _caveRadius = value;
        }

        /**
         * Get the lava Y level threshold.
         * @returns {number}
         */
        function getLavaYLevel() {
            return _lavaYLevel;
        }

        return {
            generateCaves: generateCaves,
            getDensity: getDensity,
            setDensity: setDensity,
            getRadius: getRadius,
            setRadius: setRadius,
            getLavaYLevel: getLavaYLevel
        };
    })();

})();