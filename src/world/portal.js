// Donkeycraft — Portal System
// Nether portal frame detection, portal creation, dimension travel.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // Block IDs for portal-related blocks
    var OBSIDIAN_ID = 17;
    var CRYING_OBSIDIAN_ID = 18;
    var NETHER_PORTAL_ID = 276;
    var END_PORTAL_ID = 277;

    // ============================================================
    // Portal
    // ============================================================

    /**
     * Portal — manages nether portal detection, creation, and dimension travel.
     */
    Donkeycraft.Portal = (function() {
        var _portalPositions = {};   // "dim,x,y,z" → portal state
        var _eventBus = null;         // EventBus for emitting events
        var _chunkManager = null;     // ChunkManager reference

        /**
         * Initialize the portal system.
         * @param {Donkeycraft.EventBus} bus - The game EventBus.
         * @param {Donkeycraft.ChunkManager} chunkManager - The current dimension's ChunkManager.
         */
        function init(bus, chunkManager) {
            _eventBus = bus;
            _chunkManager = chunkManager;
        }

        /**
         * Set the event bus for portal events.
         * @param {Donkeycraft.EventBus} bus - The EventBus.
         */
        function setEventBus(bus) {
            _eventBus = bus;
        }

        /**
         * Set the chunk manager reference.
         * @param {Donkeycraft.ChunkManager} chunkManager - The ChunkManager.
         */
        function setChunkManager(chunkManager) {
            _chunkManager = chunkManager;
        }

        /**
         * Check if a block ID is portal-related (obsidian, crying obsidian).
         * @param {number} blockId - Block ID to check.
         * @returns {boolean}
         */
        function isPortalBlock(blockId) {
            return blockId === OBSIDIAN_ID || blockId === CRYING_OBSIDIAN_ID;
        }

        /**
         * Check if a block ID is a portal block (nether_portal, end_portal).
         * @param {number} blockId - Block ID to check.
         * @returns {boolean}
         */
        function isPortalActive(blockId) {
            return blockId === NETHER_PORTAL_ID || blockId === END_PORTAL_ID;
        }

        /**
         * Get the global block at world coordinates (via chunk manager).
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {number} Block ID, or 0 if out of bounds/unloaded.
         * @private
         */
        function getBlockAt(x, y, z) {
            if (!_chunkManager || x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
                return 0;
            }
            return _chunkManager.getBlock(x, y, z);
        }

        /**
         * Detect a nether portal frame at the given position.
         * Searches for a valid 4×5 obsidian frame (minimum 3-wide × 4-tall interior).
         * @param {number} chunkX - Local X within chunk [0, 15].
         * @param {number} chunkY - Local Y within chunk [0, 255].
         * @param {number} chunkZ - Local Z within chunk [0, 15].
         * @returns {{valid: boolean, direction: number, width: number, height: number}|null} Portal info or null.
         */
        function detectNetherPortal(chunkX, chunkY, chunkZ) {
            var block = getBlockAt(chunkX, chunkY, chunkZ);

            // Check if this is obsidian or crying obsidian (frame material)
            if (!isPortalBlock(block)) {
                return null;
            }

            // Try all 4 horizontal directions for frame orientation
            var directions = [
                { dx: 1, dz: 0 },  // East-West
                { dx: -1, dz: 0 }, // West-East
                { dx: 0, dz: 1 },  // North-South
                { dx: 0, dz: -1 }  // South-North
            ];

            for (var d = 0; d < directions.length; d++) {
                var dir = directions[d];
                var frameWidth = _countFrameLength(chunkX, chunkZ, dir.dx, dir.dz);

                if (frameWidth >= 3) {
                    // Try to build a 4-tall frame from the bottom
                    for (var startX = 0; startX < frameWidth - 2; startX++) {
                        var result = _verifyFrame(
                            chunkX + startX * dir.dx,
                            chunkZ + startX * dir.dz,
                            dir.dx, dir.dz,
                            chunkY
                        );
                        if (result) {
                            return result;
                        }
                    }
                }
            }

            return null;
        }

        /**
         * Count the length of a continuous obsidian line from a position.
         * @param {number} startX - Starting X.
         * @param {number} startZ - Starting Z.
         * @param {number} dx - X direction.
         * @param {number} dz - Z direction.
         * @returns {number} Frame length.
         * @private
         */
        function _countFrameLength(startX, startZ, dx, dz) {
            var count = 0;
            for (var i = 0; i < 6; i++) {
                var bx = startX + i * dx;
                var bz = startZ + i * dz;
                if (isPortalBlock(getBlockAt(bx, 0, bz))) {
                    count++;
                } else {
                    break;
                }
            }
            return count;
        }

        /**
         * Verify a complete obsidian frame at the given position.
         * @param {number} startX - Starting X of frame base.
         * @param {number} startZ - Starting Z of frame base.
         * @param {number} dx - Frame direction X.
         * @param {number} dz - Frame direction Z.
         * @param {number} startY - Y of bottom corner.
         * @returns {{valid: boolean, direction: number, width: number, height: number}|null}
         * @private
         */
        function _verifyFrame(startX, startZ, dx, dz, startY) {
            // Need at least 4 tall (startY to startY+3)
            if (startY < 0 || startY + 3 >= WORLD_HEIGHT) {
                return null;
            }

            // Count width from this corner
            var width = _countFrameLength(startX, startZ, dx, dz);
            if (width < 3) {
                return null;
            }

            // Check vertical edges (left and right)
            var leftValid = _checkVerticalEdge(startX, startY, startZ, dx, dz, width - 1);
            var rightValid = _checkVerticalEdge(startX, startY, startZ, dx, dz, 0);

            if (!leftValid || !rightValid) {
                return null;
            }

            // Check top bar
            var topValid = _checkTopBar(startX, startZ, startY + 3, dx, dz, width);

            if (!topValid) {
                return null;
            }

            return {
                valid: true,
                direction: leftValid.direction,
                width: width,
                height: 4 // Standard portal height
            };
        }

        /**
         * Check a vertical edge of the portal frame.
         * @param {number} baseX - Base X.
         * @param {number} baseY - Base Y.
         * @param {number} baseZ - Base Z.
         * @param {number} dx - Frame direction X.
         * @param {number} dz - Frame direction Z.
         * @param {number} offset - Position along frame (0 or width-1).
         * @returns {{valid: boolean, direction: number}}
         * @private
         */
        function _checkVerticalEdge(baseX, baseY, baseZ, dx, dz, offset) {
            var fx = baseX + offset * dx;
            var fz = baseZ + offset * dz;

            for (var y = 0; y < 4; y++) {
                if (!isPortalBlock(getBlockAt(fx, baseY + y, fz))) {
                    return { valid: false, direction: 0 };
                }
            }

            // Determine facing direction based on frame orientation
            var dir = 0;
            if (dx > 0) dir = 2; // South
            else if (dx < 0) dir = 0; // North
            else if (dz > 0) dir = 3; // East
            else if (dz < 0) dir = 1; // West

            return { valid: true, direction: dir };
        }

        /**
         * Check the top bar of the portal frame.
         * @param {number} startX - Starting X.
         * @param {number} startZ - Starting Z.
         * @param {number} startY - Y of top bar.
         * @param {number} dx - Frame direction X.
         * @param {number} dz - Frame direction Z.
         * @param {number} width - Frame width.
         * @returns {boolean}
         * @private
         */
        function _checkTopBar(startX, startZ, startY, dx, dz, width) {
            for (var i = 0; i < width; i++) {
                if (!isPortalBlock(getBlockAt(
                    startX + i * dx,
                    startY,
                    startZ + i * dz
                ))) {
                    return false;
                }
            }
            return true;
        }

        /**
         * Create a nether portal frame at the given position and fill with portal blocks.
         * @param {number} worldX - Global X.
         * @param {number} worldY - Global Y (bottom of frame).
         * @param {number} worldZ - Global Z.
         * @param {number} [direction=0] - Portal facing direction (0-3).
         * @returns {boolean} True if portal was created successfully.
         */
        function createPortal(worldX, worldY, worldZ, direction) {
            direction = direction !== undefined ? direction : 0;

            // Determine frame orientation from direction
            var dx = 0, dz = 0;
            if (direction === 0) { dx = 1; }      // North → East-West frame
            else if (direction === 2) { dx = -1; } // South → East-West frame
            else if (direction === 1) { dz = 1; }  // East → North-South frame
            else if (direction === 3) { dz = -1; } // West → North-South frame

            // If direction didn't set dx/dz, default to East-West
            if (dx === 0 && dz === 0) { dx = 1; }

            var width = 3;
            var height = 4;

            // Build the frame
            for (var y = 0; y < height; y++) {
                for (var i = 0; i < width; i++) {
                    // Bottom and top bars
                    if (y === 0 || y === height - 1) {
                        setBlockAt(worldX + i * dx, worldY + y, worldZ + i * dz, OBSIDIAN_ID);
                    } else {
                        // Side pillars (only corners)
                        if (i === 0 || i === width - 1) {
                            setBlockAt(worldX + i * dx, worldY + y, worldZ + i * dz, OBSIDIAN_ID);
                        }
                    }
                }
            }

            // Fill interior with portal blocks
            for (var py = 1; py < height - 1; py++) {
                for (var pi = 1; pi < width - 1; pi++) {
                    setBlockAt(
                        worldX + pi * dx,
                        worldY + py,
                        worldZ + pi * dz,
                        NETHER_PORTAL_ID
                    );
                }
            }

            // Register portal position
            var key = 'overworld,' + Math.round(worldX) + ',' + Math.round(worldY) + ',' + Math.round(worldZ);
            _portalPositions[key] = {
                dimension: Donkeycraft.DimensionType.OVERWORLD,
                x: worldX,
                y: worldY,
                z: worldZ,
                type: 'nether'
            };

            return true;
        }

        /**
         * Set a block at global coordinates (via chunk manager).
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @param {number} blockId - Block ID to set.
         * @private
         */
        function setBlockAt(x, y, z, blockId) {
            if (_chunkManager && _chunkManager.setBlock) {
                _chunkManager.setBlock(x, y, z, blockId);
            }
        }

        /**
         * Find an existing portal near the given coordinates.
         * Searches within a 16-block radius for matching portal positions.
         * @param {number} x - X coordinate.
         * @param {number} y - Y coordinate.
         * @param {number} z - Z coordinate.
         * @param {number} dimensionType - Dimension type to search in.
         * @returns {{x: number, y: number, z: number, type: string}|null} Portal info or null.
         */
        function findMatchingPortal(x, y, z, dimensionType) {
            dimensionType = dimensionType !== undefined ? dimensionType : Donkeycraft.DimensionType.OVERWORLD;

            // Search for nearby portal blocks first
            var searchRadius = 16;
            for (var sx = -searchRadius; sx <= searchRadius; sx++) {
                for (var sy = -4; sy <= 4; sy++) {
                    for (var sz = -searchRadius; sz <= searchRadius; sz++) {
                        var bx = Math.round(x + sx);
                        var by = Math.round(y + sy);
                        var bz = Math.round(z + sz);

                        var block = getBlockAt(
                            ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
                            by,
                            ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
                        );

                        if (isPortalActive(block)) {
                            return {
                                x: bx,
                                y: by,
                                z: bz,
                                type: 'nether'
                            };
                        }
                    }
                }
            }

            return null;
        }

        /**
         * Handle dimension travel when a player enters a portal.
         * Transforms coordinates and emits travel event.
         * @param {number} fromDimension - Source dimension type.
         * @param {number} toDimension - Target dimension type.
         * @param {number} x - X coordinate in source dimension.
         * @param {number} y - Y coordinate in source dimension.
         * @param {number} z - Z coordinate in source dimension.
         * @returns {{x: number, y: number, z: number, dimension: number}|null} Destination coords or null.
         */
        function travelToDimension(fromDimension, toDimension, x, y, z) {
            var transformed = Donkeycraft.Dimensions.transformCoordinates(
                fromDimension, toDimension, x, y, z
            );

            // Find or create portal at destination
            var destPortal = findMatchingPortal(transformed.x, transformed.y, transformed.z, toDimension);

            if (destPortal) {
                transformed.x = destPortal.x;
                transformed.y = destPortal.y;
                transformed.z = destPortal.z;
            } else {
                // Auto-create portal at destination if going to Nether
                if (toDimension === Donkeycraft.DimensionType.NETHER) {
                    // Find surface level in nether
                    var netherHeight = _findNetherSurfaceY(Math.round(transformed.x), Math.round(transformed.z));
                    if (netherHeight > 0) {
                        transformed.y = netherHeight + 2;
                        createPortal(transformed.x, netherHeight + 1, transformed.z, 0);
                    }
                }
            }

            // Emit travel event
            if (_eventBus) {
                _eventBus.emit('portal:travel', {
                    fromDimension: fromDimension,
                    toDimension: toDimension,
                    position: { x: transformed.x, y: transformed.y, z: transformed.z }
                });
            }

            // Update current dimension
            Donkeycraft.Dimensions.setCurrentDimension(toDimension);

            return {
                x: transformed.x,
                y: transformed.y,
                z: transformed.z,
                dimension: toDimension
            };
        }

        /**
         * Find surface Y level in the Nether at given chunk coordinates.
         * @param {number} worldX - Global X.
         * @param {number} worldZ - Global Z.
         * @returns {number} Surface Y, or 64 if not found.
         * @private
         */
        function _findNetherSurfaceY(worldX, worldZ) {
            // Nether surface is typically around Y=32 (lava seas)
            // Search downward from Y=80 for non-air blocks
            var startX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            var startZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

            for (var y = 80; y >= 10; y--) {
                var block = getBlockAt(startX, y, startZ);
                if (block !== 0 && !Donkeycraft.BlockRegistry.isTransparent(block)) {
                    return y + 1;
                }
            }

            return 64; // Default fallback
        }

        /**
         * Check if a position contains an active portal block.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {boolean}
         */
        function isPortalAt(x, y, z) {
            var localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            var localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            var block = getBlockAt(localX, y, localZ);
            return isPortalActive(block);
        }

        /**
         * Get all registered portal positions.
         * @returns {Object[]} Array of portal position objects.
         */
        function getAllPortals() {
            var result = [];
            for (var key in _portalPositions) {
                if (_portalPositions.hasOwnProperty(key)) {
                    result.push(_portalPositions[key]);
                }
            }
            return result;
        }

        /**
         * Clear all registered portal positions.
         */
        function clearAllPortals() {
            _portalPositions = {};
        }

        /**
         * Get the obsidian block ID used for portal frames.
         * @returns {number}
         */
        function getObsidianId() {
            return OBSIDIAN_ID;
        }

        /**
         * Get the nether portal block ID.
         * @returns {number}
         */
        function getNetherPortalId() {
            return NETHER_PORTAL_ID;
        }

        /**
         * Get the end portal block ID.
         * @returns {number}
         */
        function getEndPortalId() {
            return END_PORTAL_ID;
        }

        /**
         * Destroy and free resources.
         */
        function destroy() {
            _portalPositions = {};
            _eventBus = null;
            _chunkManager = null;
        }

        return {
            init: init,
            setEventBus: setEventBus,
            setChunkManager: setChunkManager,
            isPortalBlock: isPortalBlock,
            isPortalActive: isPortalActive,
            detectNetherPortal: detectNetherPortal,
            createPortal: createPortal,
            findMatchingPortal: findMatchingPortal,
            travelToDimension: travelToDimension,
            isPortalAt: isPortalAt,
            getAllPortals: getAllPortals,
            clearAllPortals: clearAllPortals,
            getObsidianId: getObsidianId,
            getNetherPortalId: getNetherPortalId,
            getEndPortalId: getEndPortalId,
            destroy: destroy
        };
    })();

})();