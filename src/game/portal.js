// Donkeycraft — Portal System
// Nether portal frame detection, portal creation, dimension travel.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // ============================================================
    // Portal
    // ============================================================

    /**
     * Portal — manages nether portal detection, creation, and dimension travel.
     */
    Donkeycraft.Portal = (function () {
        var _portalPositions = {};   // "dim,x,y,z" → portal state
        var _eventBus = null;         // EventBus for emitting events
        var _chunkManager = null;     // ChunkManager reference
        var _currentDimension = 0;    // Current dimension type (for tracking)
        var _obsidianId = 0;          // Cached obsidian block ID from BlockRegistry
        var _cryingObsidianId = 0;    // Cached crying obsidian block ID from BlockRegistry
        var _netherPortalId = 0;      // Cached nether portal block ID from BlockRegistry
        var _endPortalId = 0;         // Cached end portal block ID from BlockRegistry

        /**
         * Resolve portal-related block IDs from BlockRegistry.
         * @private
         */
        function _resolvePortalBlockIds() {
            if (!Donkeycraft.BlockRegistry) return;

            var obsidian = Donkeycraft.BlockRegistry.getBlockByName('obsidian');
            if (obsidian) _obsidianId = obsidian.id;

            var cryingObsidian = Donkeycraft.BlockRegistry.getBlockByName('crying_obsidian');
            if (cryingObsidian) _cryingObsidianId = cryingObsidian.id;

            var netherPortal = Donkeycraft.BlockRegistry.getBlockByName('nether_portal');
            if (netherPortal) _netherPortalId = netherPortal.id;

            var endPortal = Donkeycraft.BlockRegistry.getBlockByName('end_portal');
            if (endPortal) _endPortalId = endPortal.id;
        }

        /**
         * Initialize the portal system.
         * Resolves block IDs from BlockRegistry and sets up references.
         * @param {Donkeycraft.EventBus} bus - The game EventBus.
         * @param {Donkeycraft.ChunkManager} chunkManager - The current dimension's ChunkManager.
         */
        function init(bus, chunkManager, dimensionType) {
            _eventBus = bus;
            _chunkManager = chunkManager;
            _currentDimension = dimensionType !== undefined ? dimensionType : Donkeycraft.DimensionType.OVERWORLD;
            _resolvePortalBlockIds();

            if (!chunkManager) {
                Donkeycraft.Logger.warn('Portal', 'ChunkManager not provided — block queries will return 0');
            }
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
         * Switch to a different dimension, updating the chunk manager reference.
         * @param {number} dimensionType - Target dimension type constant.
         */
        function switchDimension(dimensionType) {
            if (!Donkeycraft.Dimensions) return;
            _currentDimension = dimensionType;
            _chunkManager = Donkeycraft.Dimensions.getChunkManagerForDimension(dimensionType);
            _resolvePortalBlockIds();

            // Notify map renderer of dimension change (clears surface maps, updates label)
            if (Donkeycraft.MapRenderer && Donkeycraft.MapRenderer.prototype.onDimensionChange) {
                var dimName = Donkeycraft.Dimensions.getCurrentDimensionName ? Donkeycraft.Dimensions.getCurrentDimensionName() : 'Unknown';
                try {
                    var gameRef = window._dkGame;
                    if (gameRef && gameRef._mapRenderer && typeof gameRef._mapRenderer.onDimensionChange === 'function') {
                        gameRef._mapRenderer.onDimensionChange(dimName);
                    }
                } catch (e) { /* ignore */ }
            }

            Donkeycraft.Logger.info('Portal', 'Switched to dimension: ' + dimensionType);
        }

        /**
         * Check if a block ID is portal-related (obsidian, crying obsidian).
         * Re-resolves IDs individually if any are 0 (defensive against timing issues).
         * @param {number} blockId - Block ID to check.
         * @returns {boolean} True if the block can be used for portal frames.
         */
        function isPortalBlock(blockId) {
            // Defensive: re-resolve each ID individually if 0
            if (_obsidianId === 0 || _cryingObsidianId === 0) {
                _resolvePortalBlockIds();
            }
            return blockId === _obsidianId || blockId === _cryingObsidianId;
        }

        /**
         * Check if a block ID is an active portal block (nether_portal, end_portal).
         * Re-resolves IDs individually if any are 0 (defensive against timing issues).
         * @param {number} blockId - Block ID to check.
         * @returns {boolean} True if the block is a portal block.
         */
        function isPortalActive(blockId) {
            // Defensive: re-resolve each ID individually if 0
            if (_netherPortalId === 0 || _endPortalId === 0) {
                _resolvePortalBlockIds();
            }
            return blockId === _netherPortalId || blockId === _endPortalId;
        }

        /**
         * Get the global block at world coordinates (via WorldUtils).
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {number} Block ID, or 0 if out of bounds/unloaded.
         * @private
         */
        function getBlockAt(x, y, z) {
            if (!_chunkManager) return 0;
            return Donkeycraft.WorldUtils.getBlockAt(_chunkManager, x, y, z);
        }

        /**
         * Detect a nether portal frame at the given global position.
         * Searches for a valid 4×5 obsidian frame (minimum 3-wide × 4-tall interior).
         * @param {number} globalX - Global X coordinate.
         * @param {number} globalY - Global Y coordinate.
         * @param {number} globalZ - Global Z coordinate.
         * @returns {{valid: boolean, direction: number, width: number, height: number}|null} Portal info or null.
         */
        function detectNetherPortal(globalX, globalY, globalZ) {
            var block = getBlockAt(globalX, globalY, globalZ);

            // Check if this is obsidian or crying obsidian (frame material)
            if (!isPortalBlock(block)) {
                return null;
            }

            // Try all 4 horizontal directions for frame orientation
            var directions = [
                { dx: 1, dz: 0 },  // East-West oriented frame
                { dx: -1, dz: 0 }, // West-East oriented frame
                { dx: 0, dz: 1 },  // North-South oriented frame
                { dx: 0, dz: -1 }  // South-North oriented frame
            ];

            for (var d = 0; d < directions.length; d++) {
                var dir = directions[d];
                var frameWidth = _countFrameLength(globalX, globalZ, dir.dx, dir.dz, globalY);

                if (frameWidth >= 3) {
                    // Try to build a 4-tall frame from the bottom
                    for (var startX = 0; startX < frameWidth - 2; startX++) {
                        var result = _verifyFrame(
                            globalX + startX * dir.dx,
                            globalZ + startX * dir.dz,
                            dir.dx, dir.dz,
                            globalY
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
         * Count the length of a continuous obsidian line from a position at a given Y level.
         * @param {number} startX - Starting X.
         * @param {number} startZ - Starting Z.
         * @param {number} dx - X direction.
         * @param {number} dz - Z direction.
         * @param {number} baseY - Y level to check at.
         * @returns {number} Frame length.
         * @private
         */
        function _countFrameLength(startX, startZ, dx, dz, baseY) {
            var count = 0;
            for (var i = 0; i < 6; i++) {
                var bx = startX + i * dx;
                var bz = startZ + i * dz;
                if (isPortalBlock(getBlockAt(bx, baseY, bz))) {
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
            if (startY < 1 || startY + 3 >= WORLD_HEIGHT) {
                return null;
            }

            // Count width from this corner along the base Y
            var width = _countFrameLength(startX, startZ, dx, dz, startY);
            if (width < 3) {
                return null;
            }

            // Check vertical edges (both corners at all 4 heights)
            var leftValid = _checkVerticalEdge(startX, startY, startZ, dx, dz, width - 1, startY);
            var rightValid = _checkVerticalEdge(startX, startY, startZ, dx, dz, 0, startY);

            if (!leftValid || !rightValid) {
                return null;
            }

            // Check top bar at startY + 3
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
         * @param {number} baseY - Base Y (bottom corner).
         * @param {number} baseZ - Base Z.
         * @param {number} dx - Frame direction X.
         * @param {number} dz - Frame direction Z.
         * @param {number} offset - Position along frame (0 or width-1).
         * @param {number} startY - Bottom Y of the frame for direction calculation.
         * @returns {{valid: boolean, direction: number}}
         * @private
         */
        function _checkVerticalEdge(baseX, baseY, baseZ, dx, dz, offset, startY) {
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
         * @param {number} [dimensionType] - Dimension type for portal registration (uses current if omitted).
         * @returns {boolean} True if portal was created successfully.
         */
        function createPortal(worldX, worldY, worldZ, direction, dimensionType) {
            if (!_chunkManager) {
                Donkeycraft.Logger.error('Portal', 'Cannot create portal — ChunkManager is null');
                return false;
            }

            direction = direction !== undefined ? direction : 0;
            dimensionType = dimensionType !== undefined ? dimensionType : _currentDimension;

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
                        Donkeycraft.WorldUtils.setBlockAt(_chunkManager, worldX + i * dx, worldY + y, worldZ + i * dz, _obsidianId);
                    } else {
                        // Side pillars (only corners)
                        if (i === 0 || i === width - 1) {
                            Donkeycraft.WorldUtils.setBlockAt(_chunkManager, worldX + i * dx, worldY + y, worldZ + i * dz, _obsidianId);
                        }
                    }
                }
            }

            // Fill interior with portal blocks
            for (var py = 1; py < height - 1; py++) {
                for (var pi = 1; pi < width - 1; pi++) {
                    Donkeycraft.WorldUtils.setBlockAt(
                        _chunkManager,
                        worldX + pi * dx,
                        worldY + py,
                        worldZ + pi * dz,
                        _netherPortalId
                    );
                }
            }

            // Register portal position with correct dimension type
            var dimKey = typeof dimensionType === 'number' ? (
                dimensionType === Donkeycraft.DimensionType.NETHER ? 'nether' :
                    dimensionType === Donkeycraft.DimensionType.END ? 'end' :
                        'overworld'
            ) : 'overworld';
            var key = dimKey + ',' + Math.round(worldX) + ',' + Math.round(worldY) + ',' + Math.round(worldZ);
            _portalPositions[key] = {
                dimension: dimensionType,
                x: worldX,
                y: worldY,
                z: worldZ,
                type: 'nether'
            };

            return true;
        }

        /**
         * Find an existing portal near the given coordinates.
         * Searches within a spherical radius for portal blocks.
         * Temporarily switches chunk manager if dimensionType differs from current.
         * @param {number} x - Global X coordinate.
         * @param {number} y - Global Y coordinate.
         * @param {number} z - Global Z coordinate.
         * @param {number} [dimensionType] - Dimension type to search in (uses current if omitted).
         * @returns {{x: number, y: number, z: number, type: string}|null} Portal info or null.
         */
        function findMatchingPortal(x, y, z, dimensionType) {
            dimensionType = dimensionType !== undefined ? dimensionType : _currentDimension;

            // Temporarily switch chunk manager if searching a different dimension
            var savedChunkManager = _chunkManager;
            var savedDimension = _currentDimension;
            if (dimensionType !== _currentDimension && Donkeycraft.Dimensions) {
                _chunkManager = Donkeycraft.Dimensions.getChunkManagerForDimension(dimensionType);
                _currentDimension = dimensionType;
            }

            // Search for nearby portal blocks using spherical radius
            var searchRadius = 16;
            var searchRadiusSq = searchRadius * searchRadius;
            var foundPortal = null;

            for (var sx = -searchRadius; sx <= searchRadius && !foundPortal; sx++) {
                for (var sy = -searchRadius; sy <= searchRadius && !foundPortal; sy++) {
                    for (var sz = -searchRadius; sz <= searchRadius && !foundPortal; sz++) {
                        var distSq = sx * sx + sy * sy + sz * sz;
                        if (distSq > searchRadiusSq) continue;

                        var bx = Math.round(x + sx);
                        var by = Math.round(y + sy);
                        var bz = Math.round(z + sz);

                        // Skip if out of world bounds
                        if (by < 0 || by >= WORLD_HEIGHT) continue;

                        var block = getBlockAt(bx, by, bz);

                        if (isPortalActive(block)) {
                            foundPortal = {
                                x: bx,
                                y: by,
                                z: bz,
                                type: 'nether'
                            };
                        }
                    }
                }
            }

            // Restore saved chunk manager and dimension
            if (dimensionType !== _currentDimension || savedChunkManager !== _chunkManager) {
                _chunkManager = savedChunkManager;
                _currentDimension = savedDimension;
            }

            return foundPortal;
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
            if (!Donkeycraft.Dimensions || !Donkeycraft.Dimensions.transformCoordinates) {
                Donkeycraft.Logger.error('Portal', 'Dimensions system not available for travel');
                return null;
            }

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
                    var netherHeight = _findNetherSurfaceY(Math.round(transformed.x), Math.round(transformed.z));
                    if (netherHeight > 0) {
                        transformed.y = netherHeight + 2;
                        createPortal(transformed.x, netherHeight + 1, transformed.z, 0);
                    }
                }
            }

            // Emit travel event via instance EventBus (fallback to global if not set)
            if (_eventBus && _eventBus.emitSafe) {
                try {
                    _eventBus.emitSafe('portal:travel', {
                        fromDimension: fromDimension,
                        toDimension: toDimension,
                        position: { x: transformed.x, y: transformed.y, z: transformed.z }
                    });
                } catch (e) {
                    // EventBus may not be available in tests
                }
            } else if (Donkeycraft.EventBus && Donkeycraft.EventBus.emitSafe) {
                try {
                    Donkeycraft.EventBus.emitSafe('portal:travel', {
                        fromDimension: fromDimension,
                        toDimension: toDimension,
                        position: { x: transformed.x, y: transformed.y, z: transformed.z }
                    });
                } catch (e) {
                    // EventBus may not be available in tests
                }
            }

            // Update current dimension
            if (Donkeycraft.Dimensions && Donkeycraft.Dimensions.setCurrentDimension) {
                Donkeycraft.Dimensions.setCurrentDimension(toDimension);
            }

            return {
                x: transformed.x,
                y: transformed.y,
                z: transformed.z,
                dimension: toDimension
            };
        }

        /**
         * Find surface Y level in a dimension at given global coordinates.
         * Searches downward from max height for the first non-transparent block.
         * @param {number} worldX - Global X.
         * @param {number} worldZ - Global Z.
         * @param {number} [maxY=80] - Maximum Y to search from.
         * @returns {number} Surface Y, or 64 if not found.
         * @private
         */
        function _findNetherSurfaceY(worldX, worldZ, maxY) {
            maxY = maxY !== undefined ? maxY : 80;

            for (var y = maxY; y >= 10; y--) {
                var block = getBlockAt(worldX, y, worldZ);
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
            if (!_chunkManager) return false;
            var block = getBlockAt(x, y, z);
            return isPortalActive(block);
        }

        /**
         * Detect a nether portal at or near the given position.
         * First checks if the position itself contains a portal block,
         * then falls back to frame detection from nearby obsidian blocks.
         * @param {number} x - Global X coordinate.
         * @param {number} y - Global Y coordinate.
         * @param {number} z - Global Z coordinate.
         * @returns {{valid: boolean, direction: number, width: number, height: number}|null} Portal info or null.
         */
        function detectPortalAtPosition(x, y, z) {
            // First check if this position contains a portal block
            if (isPortalAt(x, y, z)) {
                // Search nearby for the frame by checking adjacent blocks
                var offsets = [
                    { ox: 0, oy: -1, oz: 0 },  // above
                    { ox: 0, oy: 1, oz: 0 },   // below
                    { ox: 1, oy: 0, oz: 0 },   // east
                    { ox: -1, oy: 0, oz: 0 },  // west
                    { ox: 0, oy: 0, oz: 1 },   // south
                    { ox: 0, oy: 0, oz: -1 }   // north
                ];
                for (var i = 0; i < offsets.length; i++) {
                    var result = detectNetherPortal(x + offsets[i].ox, y + offsets[i].oy, z + offsets[i].oz);
                    if (result) return result;
                }
                // If we can't find a frame, return a default portal at this position
                return { valid: true, direction: 0, width: 3, height: 4 };
            }

            // Fall back to standard frame detection
            return detectNetherPortal(x, y, z);
        }

        /**
         * Check if any player is currently inside a portal block and trigger travel.
         * This is called during game ticks to handle automatic dimension travel.
         * @param {Object} player - Player entity with position properties.
         * @returns {boolean} True if a portal travel was triggered.
         */
        function _checkPlayerInPortal(player) {
            if (!player || !_chunkManager) return false;

            var px = Math.round(player.x);
            var py = Math.round(player.y);
            var pz = Math.round(player.z);

            // Check the block at player's feet and head
            for (var checkY = 0; checkY < 2; checkY++) {
                if (isPortalAt(px, py + checkY, pz)) {
                    var currentDim = Donkeycraft.Dimensions ? Donkeycraft.Dimensions.getCurrentDimension() : _currentDimension;

                    // Determine target dimension
                    var targetDim;
                    if (currentDim === Donkeycraft.DimensionType.OVERWORLD) {
                        targetDim = Donkeycraft.DimensionType.NETHER;
                    } else if (currentDim === Donkeycraft.DimensionType.NETHER) {
                        targetDim = Donkeycraft.DimensionType.OVERWORLD;
                    } else {
                        continue; // No portal travel from other dimensions yet
                    }

                    // Travel to the other dimension
                    var result = travelToDimension(currentDim, targetDim, px, py + checkY, pz);
                    if (result) {
                        return true;
                    }
                }
            }

            return false;
        }

        /**
         * Get the current dimension type.
         * @returns {number} Current dimension type constant.
         */
        function getCurrentDimension() {
            return _currentDimension;
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
         * Get the cached obsidian block ID.
         * Triggers re-resolution if ID is 0 (lazy initialization).
         * @returns {number} Obsidian block ID, or 0 if not resolved.
         */
        function getObsidianId() {
            if (_obsidianId === 0) {
                _resolvePortalBlockIds();
            }
            return _obsidianId;
        }

        /**
         * Get the cached nether portal block ID.
         * Triggers re-resolution if ID is 0 (lazy initialization).
         * @returns {number} Nether portal block ID, or 0 if not resolved.
         */
        function getNetherPortalId() {
            if (_netherPortalId === 0) {
                _resolvePortalBlockIds();
            }
            return _netherPortalId;
        }

        /**
         * Get the cached end portal block ID.
         * Triggers re-resolution if ID is 0 (lazy initialization).
         * @returns {number} End portal block ID, or 0 if not resolved.
         */
        function getEndPortalId() {
            if (_endPortalId === 0) {
                _resolvePortalBlockIds();
            }
            return _endPortalId;
        }

        /**
         * Invalidate cached portal block IDs and re-resolve from BlockRegistry.
         * Call this after dynamically adding new blocks to the registry.
         */
        function invalidateBlockIdCache() {
            _obsidianId = 0;
            _cryingObsidianId = 0;
            _netherPortalId = 0;
            _endPortalId = 0;
            _resolvePortalBlockIds();
        }

        /**
         * Get the module object itself as the "instance".
         * @returns {object} The Portal module.
         */
        function getInstance() {
            return Donkeycraft.Portal;
        }

        /**
         * Destroy and free resources.
         */
        function destroy() {
            _portalPositions = {};
            _eventBus = null;
            _chunkManager = null;
            _currentDimension = Donkeycraft.DimensionType.OVERWORLD;
            _obsidianId = 0;
            _cryingObsidianId = 0;
            _netherPortalId = 0;
            _endPortalId = 0;
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
            detectPortalAtPosition: detectPortalAtPosition,
            _checkPlayerInPortal: _checkPlayerInPortal,
            getCurrentDimension: getCurrentDimension,
            switchDimension: switchDimension,
            getAllPortals: getAllPortals,
            clearAllPortals: clearAllPortals,
            getObsidianId: getObsidianId,
            getNetherPortalId: getNetherPortalId,
            getEndPortalId: getEndPortalId,
            invalidateBlockIdCache: invalidateBlockIdCache,
            getInstance: getInstance,
            destroy: destroy
        };
    })();

})();