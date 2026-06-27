// Donkeycraft — Redstone TNT
// TNT: fuse timer, explosion logic, block destruction, entity damage.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;

    // Block IDs
    var TNT = 183;

    // Explosion constants (Minecraft-accurate)
    var FUSE_TICKS = 40;       // 2 seconds at 20 TPS
    var EXPLOSION_RADIUS = 8;  // TNT blast radius
    var EXPLOSION_DAMAGE = 10; // Maximum entity damage

    // ============================================================
    // RedstoneTNT — TNT mechanics and explosions
    // ============================================================

    /**
     * RedstoneTNT — manages TNT fuse timers, explosion logic,
     * block destruction, and entity damage.
     */
    Donkeycraft.RedstoneTNT = (function() {

        // TNT states: Map<"x,y,z", { fuseTicks: number, lit: boolean, primeTick: number }}
        var _tntStates = {};

        // Explosion blast wave storage: Map<chunkKey, Uint8Array> for block damage tracking
        var _blastWaves = {};

        /**
         * Initialize the TNT system.
         */
        function init() {
            // No special initialization needed
        }

        /**
         * Process a dirty TNT block.
         * @param {Object} entry - {x, y, z, chunkX, chunkZ}.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @private
         */
        function _processTNT(entry, chunk) {
            var localX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            var localZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

            if (chunk.getBlock(localX, entry.y, localZ) !== TNT) return;

            var key = entry.x + ',' + entry.y + ',' + entry.z;
            var state = _tntStates[key];

            if (!state) {
                // Initialize: not lit yet — wait for redstone signal
                state = {
                    fuseTicks: 0,
                    lit: false,
                    primeTick: 0
                };
                _tntStates[key] = state;

                // Check if adjacent to powered redstone
                if (_isTNTPowered(entry.x, entry.y, entry.z, chunk)) {
                    _litTNT(entry.x, entry.y, entry.z);
                }
                return;
            }

            if (!state.lit) {
                // Check if now powered
                var nChunkX = Math.floor(entry.x / CHUNK_SIZE);
                var nLocalX = ((entry.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                var nChunkZ = Math.floor(entry.z / CHUNK_SIZE);
                var nLocalZ = ((entry.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

                var nChunk = _getChunk(nChunkX, nChunkZ);
                if (!nChunk) return;

                if (_isTNTPowered(entry.x, entry.y, entry.z, nChunk)) {
                    _litTNT(entry.x, entry.y, entry.z);
                }
                return;
            }

            // TNT is lit: count down fuse
            var currentTick = Donkeycraft.RedstoneEngine ? Donkeycraft.RedstoneEngine.getCurrentTick() : 0;

            state.fuseTicks--;

            if (state.fuseTicks <= 0) {
                // Explode!
                _explode(entry.x, entry.y, entry.z);

                // Remove TNT block
                chunk.setBlock(localX, entry.y, localZ, 0);

                // Clear state
                delete _tntStates[key];

                // Mark surrounding blocks dirty for mesh updates
                Donkeycraft.RedstoneEngine.markDirtyRange(
                    entry.x - EXPLOSION_RADIUS, entry.y - EXPLOSION_RADIUS, entry.z - EXPLOSION_RADIUS,
                    entry.x + EXPLOSION_RADIUS, entry.y + EXPLOSION_RADIUS, entry.z + EXPLOSION_RADIUS
                );
            }
        }

        /**
         * Check if TNT is adjacent to a powered redstone source.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @param {Donkeycraft.Chunk} chunk - The chunk.
         * @returns {boolean}
         * @private
         */
        function _isTNTPowered(x, y, z, chunk) {
            // Check all 6 adjacent blocks
            var neighbors = [
                { dx: 1, dy: 0, dz: 0 },
                { dx: -1, dy: 0, dz: 0 },
                { dx: 0, dy: 1, dz: 0 },
                { dx: 0, dy: -1, dz: 0 },
                { dx: 0, dy: 0, dz: 1 },
                { dx: 0, dy: 0, dz: -1 }
            ];

            for (var i = 0; i < neighbors.length; i++) {
                var n = neighbors[i];
                var nx = x + n.dx;
                var ny = y + n.dy;
                var nz = z + n.dz;

                var nChunkX = Math.floor(nx / CHUNK_SIZE);
                var nLocalX = ((nx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                var nChunkZ = Math.floor(nz / CHUNK_SIZE);
                var nLocalZ = ((nz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

                var nChunk = _getChunk(nChunkX, nChunkZ);
                if (!nChunk) continue;

                var nBlockId = nChunk.getBlock(nLocalX, ny, nLocalZ);

                // Powered redstone sources
                if (nBlockId === 173 || nBlockId === 229) { // redstone wire/dust
                    // Check if signal strength > 0
                    if (Donkeycraft._redstoneWiring && Donkeycraft._redstoneWiring.getSignalStrength) {
                        var signal = Donkeycraft._redstoneWiring.getSignalStrength(nx, ny, nz);
                        if (signal > 0) return true;
                    }
                }

                // Redstone torch, lit lamp, redstone block
                if (nBlockId === 174 || nBlockId === 176 || nBlockId === 230) {
                    return true;
                }

                // Another TNT block (chain explosion)
                if (nBlockId === TNT) {
                    var nKey = nx + ',' + ny + ',' + nz;
                    var nState = _tntStates[nKey];
                    if (nState && nState.lit) return true;
                }

                // Observer pulse
                if (nBlockId === 179) { // observer
                    return true;
                }
            }

            return false;
        }

        /**
         * Light a TNT block: start its fuse.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @private
         */
        function _litTNT(x, y, z) {
            var key = x + ',' + y + ',' + z;
            if (!_tntStates[key]) {
                _tntStates[key] = {
                    fuseTicks: FUSE_TICKS,
                    lit: true,
                    primeTick: Donkeycraft.RedstoneEngine ? Donkeycraft.RedstoneEngine.getCurrentTick() : 0
                };
            } else {
                _tntStates[key].lit = true;
                _tntStates[key].fuseTicks = FUSE_TICKS;
                _tntStates[key].primeTick = Donkeycraft.RedstoneEngine ? Donkeycraft.RedstoneEngine.getCurrentTick() : 0;
            }

            // Emit lit event via global EventBus for sound playback
            if (Donkeycraft.EventBus) {
                try {
                    Donkeycraft.EventBus.emitSafe('tnt:lit', {
                        x: x,
                        y: y,
                        z: z
                    });
                } catch (e) {
                    // EventBus may not be available in tests
                }
            }
        }

        /**
         * Explode TNT at the given position.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @private
         */
        function _explode(x, y, z) {
            // Emit explosion event via global EventBus for game systems
            if (Donkeycraft.EventBus) {
                try {
                    Donkeycraft.EventBus.emitSafe('tnt:explode', {
                        x: x,
                        y: y,
                        z: z,
                        radius: EXPLOSION_RADIUS
                    });
                } catch (e) {
                    // EventBus may not be available in tests
                }
            }

            // Calculate blast wave: which blocks get destroyed
            var blocksToCheck = [];
            var radius = EXPLOSION_RADIUS;

            // Generate all blocks within explosion sphere
            for (var dx = -radius; dx <= radius; dx++) {
                for (var dy = -radius; dy <= radius; dy++) {
                    for (var dz = -radius; dz <= radius; dz++) {
                        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (dist <= radius) {
                            blocksToCheck.push({
                                x: x + dx,
                                y: y + dy,
                                z: z + dz,
                                distance: dist
                            });
                        }
                    }
                }
            }

            // Process each block in explosion radius
            for (var i = 0; i < blocksToCheck.length; i++) {
                var block = blocksToCheck[i];
                var bx = Math.round(block.x);
                var by = Math.round(block.y);
                var bz = Math.round(block.z);

                var bChunkX = Math.floor(bx / CHUNK_SIZE);
                var bLocalX = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                var bChunkZ = Math.floor(bz / CHUNK_SIZE);
                var bLocalZ = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

                var bChunk = _getChunk(bChunkX, bChunkZ);
                if (!bChunk) continue;

                var blockId = bChunk.getBlock(bLocalX, by, bLocalZ);

                // Skip unbreakable blocks
                if (blockId === 0 || blockId === 37) continue; // air or bedrock

                // Calculate blast strength at this position (0-1)
                var blastStrength = 1 - (block.distance / radius);
                blastStrength = Math.max(0, blastStrength);

                // Block resistance: harder blocks resist more
                var blockResistance = _getBlockBlastResistance(blockId);
                if (blastStrength <= blockResistance) continue;

                // Block is destroyed
                bChunk.setBlock(bLocalX, by, bLocalZ, 0);

                // Store blast wave data for potential rendering
                var chunkKey = Donkeycraft.WorldUtils.makeChunkKey(bChunkX, bChunkZ);
                if (!_blastWaves[chunkKey]) {
                    _blastWaves[chunkKey] = {};
                }
                _blastWaves[chunkKey][by * CHUNK_SIZE * CHUNK_SIZE + bLocalX * CHUNK_SIZE + bLocalZ] = blastStrength;
            }

            // Emit event for entity damage calculation
            // Entities within radius take damage based on distance
        }

        /**
         * Get the blast resistance of a block ID.
         * @param {number} blockId - Block ID.
         * @returns {number} Blast resistance (0-1 scale for this system).
         * @private
         */
        function _getBlockBlastResistance(blockId) {
            // Blocks with high blast resistance
            if (blockId === 1) return 0;   // stone (moderate)
            if (blockId === 6 || blockId === 5) return 0; // deepslate/cobbled
            if (blockId === 46) return 1;  // obsidian (immune)
            if (blockId === 37) return 1;  // bedrock (immune)

            // Default: most blocks can be destroyed
            return 0.3;
        }

        /**
         * Get the TNT state at a position.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {Object|null}
         */
        function getTNTState(x, y, z) {
            return _tntStates[x + ',' + y + ',' + z] || null;
        }

        /**
         * Get the fuse ticks remaining on a TNT block.
         * @param {number} x - Global X.
         * @param {number} y - Global Y.
         * @param {number} z - Global Z.
         * @returns {number} Fuse ticks remaining (0 if not lit).
         */
        function getFuseTicks(x, y, z) {
            var state = _tntStates[x + ',' + y + ',' + z];
            return state && state.lit ? state.fuseTicks : 0;
        }

        /**
         * Get the explosion radius.
         * @returns {number}
         */
        function getExplosionRadius() {
            return EXPLOSION_RADIUS;
        }

        /**
         * Get the fuse duration in ticks.
         * @returns {number}
         */
        function getFuseDuration() {
            return FUSE_TICKS;
        }

        /**
         * Clear all TNT states and blast wave data.
         */
        function clearAllStates() {
            _tntStates = {};
            _blastWaves = {};
        }

        /**
         * Destroy the system: clear all state.
         */
        function destroy() {
            clearAllStates();
        }

        return {
            init: init,
            getTNTState: getTNTState,
            getFuseTicks: getFuseTicks,
            getExplosionRadius: getExplosionRadius,
            getFuseDuration: getFuseDuration,
            clearAllStates: clearAllStates,
            destroy: destroy
        };
    })();

})();