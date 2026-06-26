// Donkeycraft — World Utilities
// Shared coordinate and block access utilities to reduce duplication across interaction modules.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // WorldUtils
    // ============================================================

    /**
     * WorldUtils — shared utilities for block access, coordinate conversion, and chunk state queries.
     */
    Donkeycraft.WorldUtils = (function() {

        /**
         * Get the block ID at global coordinates from the current world state.
         * Returns 0 if chunk doesn't exist, out of bounds, or block is air.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalY - Global Y coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @returns {number} Block ID (0 = air).
         */
        function getBlockAt(chunkManager, globalX, globalY, globalZ) {
            if (!chunkManager) return 0;
            if (globalY < 0 || globalY >= WORLD_HEIGHT) return 0;

            var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
            var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

            var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
            if (!chunk) return 0;

            var localX = Donkeycraft.Chunk.localCoordX(globalX);
            var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

            return chunk.getBlock(localX, globalY, localZ);
        }

        /**
         * Set the block ID at global coordinates in the current world state.
         * Marks the chunk dirty if the block changed.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalY - Global Y coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @param {number} blockId - Block ID to set.
         * @returns {boolean} True if the block was updated.
         */
        function setBlockAt(chunkManager, globalX, globalY, globalZ, blockId) {
            if (!chunkManager) return false;
            if (globalY < 0 || globalY >= WORLD_HEIGHT) return false;

            var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
            var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

            var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
            if (!chunk) return false;

            var localX = Donkeycraft.Chunk.localCoordX(globalX);
            var localZ = Donkeycraft.Chunk.localCoordZ(globalZ);

            chunk.setBlock(localX, globalY, localZ, blockId);
            chunkManager.markChunkDirty(chunkX, chunkZ);

            return true;
        }

        /**
         * Check if a chunk containing the given global coordinates is currently loaded.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @returns {boolean} True if the chunk is loaded.
         */
        function isChunkLoaded(chunkManager, globalX, globalZ) {
            if (!chunkManager) return false;

            var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
            var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

            return !!chunkManager.getChunkIfExists(chunkX, chunkZ);
        }

        /**
         * Get the chunk and local coordinates for a global position.
         * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager.
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalY - Global Y coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @returns {{chunk: Donkeycraft.Chunk|null, lx: number, ly: number, lz: number}}
         */
        function getChunkAndLocalCoords(chunkManager, globalX, globalY, globalZ) {
            if (globalY < 0 || globalY >= WORLD_HEIGHT) {
                return { chunk: null, lx: 0, ly: 0, lz: 0 };
            }

            var chunkX = Donkeycraft.Chunk.chunkCoordX(globalX);
            var chunkZ = Donkeycraft.Chunk.chunkCoordZ(globalZ);

            var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
            if (!chunk) return { chunk: null, lx: 0, ly: 0, lz: 0 };

            var lx = Donkeycraft.Chunk.localCoordX(globalX);
            var lz = Donkeycraft.Chunk.localCoordZ(globalZ);

            return { chunk: chunk, lx: lx, ly: globalY, lz: lz };
        }

        /**
         * Calculate the number of steps needed for a raycast at a given reach distance.
         * Uses the formula: ceil(reach * sqrt(3)) + 2 for accurate DDA bounds.
         * @param {number} reach - Maximum reach distance in blocks.
         * @returns {number} Maximum DDA steps.
         */
        function calculateRaycastMaxSteps(reach) {
            return Math.ceil(reach * Math.sqrt(3)) + 2;
        }

        /**
         * Convert global coordinates to a composite integer key for state maps.
         * Uses string format for compatibility with existing code.
         * @param {number} x - Global X coordinate (floored).
         * @param {number} y - Global Y coordinate (floored).
         * @param {number} z - Global Z coordinate (floored).
         * @returns {string} Composite key "x,y,z".
         */
        function makeStateKey(x, y, z) {
            return x + ',' + y + ',' + z;
        }

        /**
         * Parse a state key back into coordinates.
         * @param {string} key - State key "x,y,z".
         * @returns {{x: number, y: number, z: number}}
         */
        function parseStateKey(key) {
            var parts = key.split(',');
            return {
                x: parseInt(parts[0], 10),
                y: parseInt(parts[1], 10),
                z: parseInt(parts[2], 10)
            };
        }

        /**
         * Get the chunk key for a global coordinate pair.
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @returns {string} Chunk key "chunkX,chunkZ".
         */
        function makeChunkKey(globalX, globalZ) {
            return Donkeycraft.Chunk.chunkCoordX(globalX) + ',' + Donkeycraft.Chunk.chunkCoordZ(globalZ);
        }

        return {
            getBlockAt: getBlockAt,
            setBlockAt: setBlockAt,
            isChunkLoaded: isChunkLoaded,
            getChunkAndLocalCoords: getChunkAndLocalCoords,
            calculateRaycastMaxSteps: calculateRaycastMaxSteps,
            makeStateKey: makeStateKey,
            parseStateKey: parseStateKey,
            makeChunkKey: makeChunkKey
        };
    })();

})();