// Donkeycraft — Lighting Engine
// Sky light and block light propagation: BFS flood fill, light updates on block change.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // LightingEngine
    // ============================================================

    /**
     * LightingEngine — manages light propagation in chunks.
     */
    Donkeycraft.LightingEngine = (function() {
        // Light opacity values for block types
        var _lightOpacityCache = {};

        /**
         * Initialize the lighting engine with known block light opacities.
         */
        function init() {
            // Build cache from Block registry
            for (var id = 0; id < 256; id++) {
                _lightOpacityCache[id] = _getBlockLightOpacity(id);
            }
        }

        /**
         * Get the light opacity value for a block ID.
         * @param {number} blockId - Block ID.
         * @returns {number} Light opacity (0-15).
         * @private
         */
        function _getBlockLightOpacity(blockId) {
            var block = Donkeycraft.BlockRegistry.getBlockById(blockId);
            if (!block) return 0; // Air = no opacity

            // Direct light opacity property if available
            if (block.lightOpacity !== undefined) {
                return Math.min(block.lightOpacity, 15);
            }

            // Default opacity based on block type
            if (Donkeycraft.BlockRegistry.isTransparent(blockId)) return 1;
            if (Donkeycraft.BlockRegistry.isSolid(blockId)) return 15;
            if (Donkeycraft.BlockRegistry.isLiquid(blockId)) return 0;
            if (Donkeycraft.BlockRegistry.isReplaceable(blockId)) return 0;

            return 2; // Default
        }

        /**
         * Calculate sky light for a chunk based on heightmap.
         * Sky light decreases with depth and block occlusion.
         * @param {Donkeycraft.Chunk} chunk - The chunk to calculate light for.
         * @param {number[]} heightmap - Heightmap array (optional, if null uses actual blocks).
         */
        function calculateSkyLight(chunk, heightmap) {
            // Reset sky light
            chunk.skyLight.fill(0);

            if (heightmap) {
                // Fast mode: use heightmap to determine surface level
                for (var x = 0; x < CHUNK_SIZE; x++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        var surfaceY = heightmap[x + z * CHUNK_SIZE] || 0;

                        // Fill sky light from surface down, decreasing by opacity
                        for (var y = surfaceY; y >= 0 && y < WORLD_HEIGHT; y++) {
                            var light = 15;
                            chunk.setSkyLight(x, y, z, light);
                        }
                    }
                }
            } else {
                // Precise mode: BFS from top down through each column
                for (var x = 0; x < CHUNK_SIZE; x++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        var light = 15;

                        for (var y = WORLD_HEIGHT - 1; y >= 0; y--) {
                            var blockId = chunk.getBlock(x, y, z);
                            var opacity = _lightOpacityCache[blockId] || 0;

                            chunk.setSkyLight(x, y, z, light);
                            light = Math.max(0, light - opacity);
                        }
                    }
                }
            }
        }

        /**
         * Calculate block light for a chunk (from torches, lava, etc.).
         * Uses BFS flood fill from light sources.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         */
        function calculateBlockLight(chunk) {
            // Reset block light
            chunk.blockLight.fill(0);

            // Find all light sources
            var queue = [];

            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var y = 0; y < WORLD_HEIGHT; y++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        var blockId = chunk.getBlock(x, y, z);

                        // Check if block emits light
                        var emitLevel = _getLightEmission(blockId);
                        if (emitLevel > 0) {
                            chunk.setBlockLight(x, y, z, emitLevel);
                            queue.push({ x: x, y: y, z: z });
                        }
                    }
                }
            }

            // BFS flood fill from all light sources
            _bfsFloodFill(chunk, queue);
        }

        /**
         * Get the light emission level for a block ID.
         * @param {number} blockId - Block ID.
         * @returns {number} Light emission level (0 = no light).
         * @private
         */
        function _getLightEmission(blockId) {
            var block = Donkeycraft.BlockRegistry.getBlockById(blockId);
            if (!block || block.lightLevel === undefined) return 0;
            return Math.min(block.lightLevel, 15);
        }

        /**
         * BFS flood fill for block light propagation.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {Array<{x: number, y: number, z: number}>} queue - Initial light sources.
         * @private
         */
        function _bfsFloodFill(chunk, queue) {
            var visited = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);

            var head = 0;
            while (head < queue.length) {
                var current = queue[head++];
                var cx = current.x;
                var cy = current.y;
                var cz = current.z;

                var currentLight = chunk.getBlockLight(cx, cy, cz);
                if (currentLight <= 0) continue;

                // Check all 6 neighbors
                var neighbors = [
                    { x: cx + 1, y: cy, z: cz },
                    { x: cx - 1, y: cy, z: cz },
                    { x: cx, y: cy + 1, z: cz },
                    { x: cx, y: cy - 1, z: cz },
                    { x: cx, y: cy, z: cz + 1 },
                    { x: cx, y: cy, z: cz - 1 }
                ];

                for (var i = 0; i < neighbors.length; i++) {
                    var n = neighbors[i];

                    // Check bounds
                    if (n.x < 0 || n.x >= CHUNK_SIZE ||
                        n.y < 0 || n.y >= WORLD_HEIGHT ||
                        n.z < 0 || n.z >= CHUNK_SIZE) {
                        continue;
                    }

                    var idx = n.x + n.y * CHUNK_SIZE + n.z * CHUNK_SIZE * WORLD_HEIGHT;
                    if (visited[idx]) continue;

                    var neighborBlockId = chunk.getBlock(n.x, n.y, n.z);
                    var opacity = _lightOpacityCache[neighborBlockId] || 0;

                    var newLight = currentLight - opacity;
                    if (newLight <= 0) continue;

                    // Update if this is a stronger light
                    var existingLight = chunk.getBlockLight(n.x, n.y, n.z);
                    if (newLight > existingLight) {
                        chunk.setBlockLight(n.x, n.y, n.z, newLight);
                        visited[idx] = 1;
                        queue.push({ x: n.x, y: n.y, z: n.z });
                    }
                }
            }
        }

        /**
         * Update lighting for a single block position (incremental update).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - Local X.
         * @param {number} y - Local Y.
         * @param {number} z - Local Z.
         */
        function updateBlockLighting(chunk, x, y, z) {
            // Recalculate sky light for this column
            _updateColumnSkyLight(chunk, x, z);

            // If block emits light or was removed, recalculate block light
            var blockId = chunk.getBlock(x, y, z);
            if (_getLightEmission(blockId) > 0 ||
                (y + 1 < WORLD_HEIGHT && _getLightEmission(chunk.getBlock(x, y + 1, z)) > 0)) {
                calculateBlockLight(chunk);
            }
        }

        /**
         * Update sky light for a single column.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {number} x - Local X.
         * @param {number} z - Local Z.
         * @private
         */
        function _updateColumnSkyLight(chunk, x, z) {
            var light = 15;

            for (var y = WORLD_HEIGHT - 1; y >= 0; y--) {
                var blockId = chunk.getBlock(x, y, z);
                var opacity = _lightOpacityCache[blockId] || 0;

                chunk.setSkyLight(x, y, z, light);
                light = Math.max(0, light - opacity);
            }
        }

        /**
         * Update lighting for an entire chunk (full recalculation).
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         */
        function updateChunkLighting(chunk) {
            calculateSkyLight(chunk);
            calculateBlockLight(chunk);
        }

        /**
         * Get the light opacity for a block type (cached).
         * @param {number} blockId - Block ID.
         * @returns {number} Light opacity (0-15).
         */
        function getLightOpacity(blockId) {
            return _lightOpacityCache[blockId] || 0;
        }

        /**
         * Invalidate the light opacity cache and rebuild it.
         */
        function invalidateCache() {
            for (var id = 0; id < 256; id++) {
                _lightOpacityCache[id] = _getBlockLightOpacity(id);
            }
        }

        return {
            init: init,
            calculateSkyLight: calculateSkyLight,
            calculateBlockLight: calculateBlockLight,
            updateBlockLighting: updateBlockLighting,
            updateChunkLighting: updateChunkLighting,
            getLightOpacity: getLightOpacity,
            invalidateCache: invalidateCache
        };
    })();

})();