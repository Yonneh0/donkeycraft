// Donkeycraft — Lighting Engine
// Sky light and block light propagation: BFS flood fill, light updates on block change.
(function () {
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
    Donkeycraft.LightingEngine = (function () {
        // Light opacity cache: Uint8Array for IDs 0-255, with lazy-loaded entries beyond that.
        var _lightOpacityCache = new Uint8Array(256);
        var _extendedCache = {}; // For IDs > 255

        /**
         * Initialize the lighting engine with known block light opacities.
         * Pre-populates the opacity cache for blocks 0-255 for faster lookups.
         */
        function init() {
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
            // Air (ID 0) is fully transparent
            if (blockId === 0) return 0;

            // Check extended cache first
            if (blockId > 255 && _extendedCache[blockId] !== undefined) {
                return _extendedCache[blockId];
            }

            var block = Donkeycraft.BlockRegistry.getBlockById(blockId);
            if (!block) return 0; // Unknown block = no opacity

            // Direct light opacity property if available
            if (block.lightOpacity !== undefined) {
                var val = Math.min(Math.max(block.lightOpacity, 0), 15);
                if (blockId > 255) _extendedCache[blockId] = val;
                return val;
            }

            // Default opacity based on block type.
            // Liquids have partial opacity (1) to simulate light stamina through water/lava columns.
            try {
                if (Donkeycraft.BlockRegistry.isReplaceable && Donkeycraft.BlockRegistry.isReplaceable(blockId)) return 0;
                if (Donkeycraft.BlockRegistry.isLiquid && Donkeycraft.BlockRegistry.isLiquid(blockId)) return 1;
                if (Donkeycraft.BlockRegistry.isTransparent && Donkeycraft.BlockRegistry.isTransparent(blockId)) return 1;
                if (Donkeycraft.BlockRegistry.isSolid && Donkeycraft.BlockRegistry.isSolid(blockId)) return 15;
            } catch (e) { /* ignore registry method errors */ }

            var val = 2; // Default for unknown blocks
            if (blockId > 255) _extendedCache[blockId] = val;
            return val;
        }

        /**
         * Calculate sky light for a chunk based on heightmap or actual block data.
         * Sky light decreases with depth and block occlusion.
         * @param {Donkeycraft.Chunk} chunk - The chunk to calculate light for.
         * @param {number[]} [heightmap] - Optional heightmap array for fast mode. If omitted, uses precise BFS.
         */
        function calculateSkyLight(chunk, heightmap) {
            // Reset sky light
            chunk.skyLight.fill(0);

            if (heightmap) {
                // Fast mode: use heightmap to determine surface level
                for (var x = 0; x < CHUNK_SIZE; x++) {
                    for (var z = 0; z < CHUNK_SIZE; z++) {
                        var surfaceY = heightmap[x + z * CHUNK_SIZE] || 0;

                        // Fill sky light from surface down with smooth exponential falloff.
                        // Simulates cumulative occlusion through air below the surface without per-block lookup.
                        for (var y = surfaceY; y >= 0 && y < WORLD_HEIGHT; y--) {
                            var depthBelowSurface = surfaceY - y;
                            // Exponential falloff: light decreases faster at greater depths.
                            // At surface (depth=0): 15, at depth=4: ~12, depth=8: ~9, depth=16: ~5
                            var lightAtDepth = Math.max(0, Math.round(15 * Math.pow(0.85, depthBelowSurface)));
                            chunk.setSkyLight(x, y, z, lightAtDepth);
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
                            var opacity = getLightOpacity(blockId);

                            chunk.setSkyLight(x, y, z, light);
                            light = Math.max(0, light - opacity);
                        }
                    }
                }
            }
        }

        /**
         * Calculate block light for a chunk from all light-emitting blocks.
         * Uses BFS flood fill propagation from each light source, allowing re-queueing
         * when a stronger light path is found for better accuracy.
         * @param {Donkeycraft.Chunk} chunk - The chunk to calculate light for.
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
         * Allows re-queueing blocks when a stronger light path is found,
         * ensuring optimal light levels across the chunk.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @param {Array<{x: number, y: number, z: number}>} queue - Initial light sources.
         * @private
         */
        function _bfsFloodFill(chunk, queue) {
            var visited = new Uint16Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);

            // Max queue size to prevent infinite loops from re-queueing
            var maxIterations = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE * 4;
            var iterations = 0;

            var head = 0;
            while (head < queue.length && iterations < maxIterations) {
                iterations++;
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

                    var neighborBlockId = chunk.getBlock(n.x, n.y, n.z);
                    var opacity = getLightOpacity(neighborBlockId);

                    var newLight = currentLight - opacity;
                    if (newLight <= 0) continue;

                    // Update if this is a stronger light than existing
                    var existingLight = chunk.getBlockLight(n.x, n.y, n.z);
                    if (newLight > existingLight) {
                        chunk.setBlockLight(n.x, n.y, n.z, newLight);

                        // Re-queue if not already visited or if this is a significantly better path
                        if (visited[idx] < newLight) {
                            visited[idx] = newLight;
                            queue.push({ x: n.x, y: n.y, z: n.z });
                        }
                    }
                }
            }
        }

        /**
         * Update lighting for a single block position (incremental update).
         * Recalculates sky light for the column and re-runs block light if needed.
         * @param {Donkeycraft.Chunk} chunk - The chunk containing the block.
         * @param {number} x - Local X coordinate [0, 15].
         * @param {number} y - Local Y coordinate [0, 255].
         * @param {number} z - Local Z coordinate [0, 15].
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
                var opacity = getLightOpacity(blockId);

                chunk.setSkyLight(x, y, z, light);
                light = Math.max(0, light - opacity);
            }
        }

        /**
         * Update lighting for an entire chunk (full recalculation of sky and block light).
         * @param {Donkeycraft.Chunk} chunk - The chunk to update.
         */
        function updateChunkLighting(chunk) {
            calculateSkyLight(chunk);
            calculateBlockLight(chunk);
        }

        /**
         * Get the light opacity for a block type. Uses cached values for blocks 0-255,
         * and dynamically caches extended values for IDs beyond that range.
         * @param {number} blockId - Block ID (0-65535).
         * @returns {number} Light opacity in range [0, 15].
         */
        function getLightOpacity(blockId) {
            if (blockId <= 255) {
                return _lightOpacityCache[blockId];
            }
            // Check extended cache
            if (_extendedCache[blockId] !== undefined) {
                return _extendedCache[blockId];
            }
            // Compute and cache
            var opacity = _getBlockLightOpacity(blockId);
            _extendedCache[blockId] = opacity;
            return opacity;
        }

        /**
         * Invalidate the light opacity cache and rebuild it from BlockRegistry.
         * Call this after dynamically adding new blocks to the registry.
         */
        function invalidateCache() {
            for (var id = 0; id < 256; id++) {
                _lightOpacityCache[id] = _getBlockLightOpacity(id);
            }
            // Clear extended cache
            for (var key in _extendedCache) {
                if (_extendedCache.hasOwnProperty(key)) {
                    delete _extendedCache[key];
                }
            }
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The LightingEngine module.
         */
        function getInstance() {
            return Donkeycraft.LightingEngine;
        }

        /**
         * Destroy and free resources.
         */
        function destroy() {
            invalidateCache();
        }

        return {
            getInstance: getInstance,
            init: init,
            calculateSkyLight: calculateSkyLight,
            calculateBlockLight: calculateBlockLight,
            updateBlockLighting: updateBlockLighting,
            updateChunkLighting: updateChunkLighting,
            getLightOpacity: getLightOpacity,
            invalidateCache: invalidateCache,
            destroy: destroy
        };
    })();

})();
