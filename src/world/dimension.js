// Donkeycraft — Dimension System
// Overworld, Nether, End dimensions with chunk data isolation and coordinate transformation.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE;
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT;
    var NETHER_SCALE = Donkeycraft.Config.NETHER_SCALE;
    var END_SCALE = Donkeycraft.Config.END_SCALE;

    // ============================================================
    // Dimension Type Constants
    // ============================================================

    /**
     * Dimension type constants.
     */
    Donkeycraft.DimensionType = {
        OVERWORLD: 0,
        NETHER: 1,
        END: 2
    };

    // ============================================================
    // Dimension Definitions
    // ============================================================

    /**
     * Dimension — represents a game dimension.
     * @param {number} type - Dimension type constant.
     * @param {string} name - Human-readable name.
     * @param {number} height - World height for this dimension.
     * @param {number} minY - Minimum Y coordinate.
     * @param {number} maxY - Maximum Y coordinate.
     * @param {boolean} [hasSkyLight=true] - Does sky light reach the surface?
     * @param {boolean} [hasCeiling=false] - Does the dimension have a ceiling blocking sky light?
     * @param {number} [ambientDarkness=0] - Extra darkness (1.0 = pitch black like End).
     * @param {boolean} [respawnAtSpawn=true] - Should player respawn at world spawn?
     * @param {boolean} [hasPiglins=false] - Piglin hostility mechanic.
     * @param {boolean} [hasWeather=false] - Rain/snow mechanics.
     * @param {string|null} [musicDisc=null] - Unique background music disc.
     * @param {boolean} [bedWorks=true] - Can player sleep in this dimension?
     * @param {number} [coordinateScale=1] - Coordinate transformation multiplier.
     */
    Donkeycraft.Dimension = function(type, name, height, minY, maxY, hasSkyLight, hasCeiling, ambientDarkness, respawnAtSpawn, hasPiglins, hasWeather, musicDisc, bedWorks, coordinateScale) {
        /**
         * Dimension type constant.
         * @type {number}
         */
        this.type = type !== undefined ? type : Donkeycraft.DimensionType.OVERWORLD;

        /**
         * Human-readable name.
         * @type {string}
         */
        this.name = name || 'overworld';

        /**
         * World height for this dimension.
         * @type {number}
         */
        this.height = height !== undefined ? height : WORLD_HEIGHT;

        /**
         * Minimum Y coordinate.
         * @type {number}
         */
        this.minY = minY !== undefined ? minY : 0;

        /**
         * Maximum Y coordinate.
         * @type {number}
         */
        this.maxY = maxY !== undefined ? maxY : WORLD_HEIGHT;

        /**
         * Does sky light reach the surface?
         * @type {boolean}
         */
        this.hasSkyLight = hasSkyLight !== undefined ? hasSkyLight : true;

        /**
         * Does the dimension have a ceiling blocking sky light?
         * @type {boolean}
         */
        this.hasCeiling = hasCeiling !== undefined ? hasCeiling : false;

        /**
         * Ambient darkness (0.0 = normal, 1.0 = pitch black).
         * @type {number}
         */
        this.ambientDarkness = ambientDarkness !== undefined ? ambientDarkness : 0;

        /**
         * Should player respawn at world spawn?
         * @type {boolean}
         */
        this.respawnAtSpawn = respawnAtSpawn !== undefined ? respawnAtSpawn : true;

        /**
         * Piglin hostility mechanic.
         * @type {boolean}
         */
        this.hasPiglins = hasPiglins !== undefined ? hasPiglins : false;

        /**
         * Rain/snow mechanics.
         * @type {boolean}
         */
        this.hasWeather = hasWeather !== undefined ? hasWeather : false;

        /**
         * Unique background music disc name.
         * @type {string|null}
         */
        this.musicDisc = musicDisc || null;

        /**
         * Can player sleep in this dimension?
         * @type {boolean}
         */
        this.bedWorks = bedWorks !== undefined ? bedWorks : true;

        /**
         * Coordinate transformation multiplier (e.g., 8 for Nether).
         * @type {number}
         */
        this.coordinateScale = coordinateScale !== undefined ? coordinateScale : 1;
    };

    // ============================================================
    // Dimension Registry
    // ============================================================

    /**
     * Dimensions — central registry for all dimensions.
     */
    Donkeycraft.Dimensions = (function() {
        var _dimensions = {};       // type → Dimension
        var _chunkManagers = {};    // type → ChunkManager
        var _spawnPositions = {};   // type → {x, y, z}
        var _currentDimension = Donkeycraft.DimensionType.OVERWORLD;

        /**
         * Initialize the dimension registry with default dimensions.
         * @private
         */
        function init() {
            // Overworld — standard dimension
            _dimensions[Donkeycraft.DimensionType.OVERWORLD] = new Donkeycraft.Dimension(
                Donkeycraft.DimensionType.OVERWORLD,
                'overworld',
                WORLD_HEIGHT, 0, WORLD_HEIGHT,
                true, false, 0, true, false, true, null, true, 1
            );

            // Nether — ceiling blocks sky light, piglins, no weather
            _dimensions[Donkeycraft.DimensionType.NETHER] = new Donkeycraft.Dimension(
                Donkeycraft.DimensionType.NETHER,
                'nether',
                WORLD_HEIGHT, 0, WORLD_HEIGHT,
                false, true, 0, false, true, false, 'music_nether', false, NETHER_SCALE
            );

            // End — pitch black ambient, no weather, no beds work
            _dimensions[Donkeycraft.DimensionType.END] = new Donkeycraft.Dimension(
                Donkeycraft.DimensionType.END,
                'end',
                WORLD_HEIGHT, 0, WORLD_HEIGHT,
                false, false, 1, false, false, false, null, false, END_SCALE
            );

            // Default spawn positions
            _spawnPositions[Donkeycraft.DimensionType.OVERWORLD] = { x: 0, y: 64, z: 0 };
            _spawnPositions[Donkeycraft.DimensionType.NETHER] = { x: 0, y: 64, z: 0 };
            _spawnPositions[Donkeycraft.DimensionType.END] = { x: 0, y: 64, z: 0 };
        }

        /**
         * Get a dimension by type.
         * @param {number} type - Dimension type constant.
         * @returns {Donkeycraft.Dimension|null} The dimension, or null if not found.
         */
        function getDimension(type) {
            return _dimensions[type] || null;
        }

        /**
         * Get all dimensions as an array.
         * @returns {Donkeycraft.Dimension[]} Array of all dimension instances.
         */
        function getAllDimensions() {
            var result = [];
            for (var key in _dimensions) {
                if (_dimensions.hasOwnProperty(key)) {
                    result.push(_dimensions[key]);
                }
            }
            return result;
        }

        /**
         * Check if a dimension exists for the given type.
         * @param {number} type - Dimension type constant.
         * @returns {boolean}
         */
        function hasDimension(type) {
            return type in _dimensions;
        }

        /**
         * Get the current active dimension type.
         * @returns {number} Current dimension type constant.
         */
        function getCurrentDimension() {
            return _currentDimension;
        }

        /**
         * Get the chunk manager for a specific dimension (without auto-creating).
         * @param {number} type - Dimension type constant.
         * @returns {Donkeycraft.ChunkManager|null}
         */
        function getChunkManagerForDimensionIfExists(type) {
            return _chunkManagers[type] || null;
        }

        /**
         * Set the current active dimension.
         * @param {number} type - Dimension type constant.
         */
        function setCurrentDimension(type) {
            if (hasDimension(type)) {
                _currentDimension = type;
            }
        }

        /**
         * Get the spawn position for a dimension.
         * @param {number} type - Dimension type constant.
         * @returns {{x: number, y: number, z: number}} Spawn position.
         */
        function getSpawnPosition(type) {
            type = type || _currentDimension;
            return _spawnPositions[type] || { x: 0, y: 64, z: 0 };
        }

        /**
         * Set the spawn position for a dimension.
         * @param {number} type - Dimension type constant.
         * @param {number} x - Spawn X coordinate.
         * @param {number} y - Spawn Y coordinate.
         * @param {number} z - Spawn Z coordinate.
         */
        function setSpawnPosition(type, x, y, z) {
            _spawnPositions[type] = { x: x, y: y, z: z };
        }

        /**
         * Transform coordinates between dimensions.
         * For Nether travel: Overworld coords ÷ 8 = Nether coords.
         * For return: Nether coords × 8 = Overworld coords.
         * @param {number} fromType - Source dimension type.
         * @param {number} toType - Target dimension type.
         * @param {number} x - X coordinate in source dimension.
         * @param {number} y - Y coordinate in source dimension.
         * @param {number} z - Z coordinate in source dimension.
         * @returns {{x: number, y: number, z: number}} Transformed coordinates.
         */
        function transformCoordinates(fromType, toType, x, y, z) {
            var fromDim = getDimension(fromType);
            var toDim = getDimension(toType);

            if (!fromDim || !toDim) {
                return { x: x, y: y, z: z };
            }

            // Calculate scale factor
            var scale;
            if (toType === Donkeycraft.DimensionType.NETHER) {
                // Going to Nether: divide by 8
                scale = 1.0 / NETHER_SCALE;
            } else if (fromType === Donkeycraft.DimensionType.NETHER && toType === Donkeycraft.DimensionType.OVERWORLD) {
                // Coming from Nether: multiply by 8
                scale = NETHER_SCALE;
            } else if (toType === Donkeycraft.DimensionType.END || fromType === Donkeycraft.DimensionType.END) {
                // End: no coordinate change
                scale = 1;
            } else {
                // Default: no transformation
                return { x: x, y: y, z: z };
            }

            return {
                x: Math.round(x * scale),
                y: y, // Y coordinate stays the same
                z: Math.round(z * scale)
            };
        }

        /**
         * Get or create a ChunkManager for a specific dimension.
         * Each dimension has its own isolated chunk data.
         * Wires up terrain generation callbacks and lighting engine when available.
         * @param {number} type - Dimension type constant.
         * @param {object} [options] - ChunkManager options (renderDistance, etc.).
         * @returns {Donkeycraft.ChunkManager} The chunk manager for this dimension.
         */
        function getChunkManagerForDimension(type, options) {
            if (!hasDimension(type)) {
                return null;
            }

            if (!_chunkManagers[type]) {
                _chunkManagers[type] = new Donkeycraft.ChunkManager(options || {});
                _wireGenerationToChunkManager(_chunkManagers[type], type);
            }

            return _chunkManagers[type];
        }

        /**
         * Wire terrain generation and lighting callbacks to a ChunkManager.
         * @param {Donkeycraft.ChunkManager} chunkManager - The ChunkManager.
         * @param {number} dimensionType - Dimension type constant.
         * @private
         */
        function _wireGenerationToChunkManager(chunkManager, dimensionType) {
            // Wire chunk load callback (generates terrain for new chunks).
            // Sets chunk.generated = true after terrain + lighting are applied.
            chunkManager.onChunkLoad = function(chunk) {
                var terrainGenerated = false;

                // Generate terrain based on dimension
                switch (dimensionType) {
                    case Donkeycraft.DimensionType.NETHER:
                        if (Donkeycraft.NetherGenerator && Donkeycraft.NetherGenerator.generateNetherTerrain) {
                            try { Donkeycraft.NetherGenerator.generateNetherTerrain(chunk, chunk.chunkX, chunk.chunkZ); terrainGenerated = true; } catch (e) { /* skip */ }
                        }
                        break;
                    case Donkeycraft.DimensionType.END:
                        if (Donkeycraft.EndGenerator && Donkeycraft.EndGenerator.generateEndTerrain) {
                            try { Donkeycraft.EndGenerator.generateEndTerrain(chunk, chunk.chunkX, chunk.chunkZ); terrainGenerated = true; } catch (e) { /* skip */ }
                        }
                        break;
                    default: // Overworld — delegate to ChunkManager's built-in generation
                        if (chunkManager._generateTerrain) {
                            chunkManager._generateTerrain(chunk.chunkX, chunk.chunkZ);
                            terrainGenerated = true;
                        }
                        break;
                }

                // Fallback: if terrain generation callback didn't run, try direct generation
                if (!terrainGenerated && chunkManager._generateTerrain) {
                    try { chunkManager._generateTerrain(chunk.chunkX, chunk.chunkZ); } catch (e) { /* skip */ }
                }

                // Mark as generated so getChunk won't attempt regeneration on future lookups
                chunk.generated = true;

                // Apply lighting after terrain generation
                if (Donkeycraft.LightingEngine && Donkeycraft.LightingEngine.updateChunkLighting) {
                    try {
                        var dim = getDimension(dimensionType);
                        if (dim && !dim.hasSkyLight) {
                            // Nether/End: skip sky light, only calculate block light
                            chunk.skyLight.fill(0);
                            Donkeycraft.LightingEngine.calculateBlockLight(chunk);
                        } else {
                            Donkeycraft.LightingEngine.updateChunkLighting(chunk);
                        }
                    } catch (e) { /* skip */ }
                }
            };

            // Wire dirty chunk callback to update lighting on changes
            chunkManager.onChunksChanged = function() {
                var dirtyChunks = chunkManager.getDirtyChunks();
                for (var i = 0; i < dirtyChunks.length; i++) {
                    if (Donkeycraft.LightingEngine && Donkeycraft.LightingEngine.updateChunkLighting) {
                        try {
                            var dim = getDimension(dimensionType);
                            if (dim && !dim.hasSkyLight) {
                                dirtyChunks[i].chunk.skyLight.fill(0);
                                Donkeycraft.LightingEngine.calculateBlockLight(dirtyChunks[i].chunk);
                            } else {
                                Donkeycraft.LightingEngine.updateChunkLighting(dirtyChunks[i].chunk);
                            }
                        } catch (e) { /* skip */ }
                    }
                }
            };
        }

        /**
         * Get the chunk manager for the current dimension.
         * @param {object} [options] - ChunkManager options.
         * @returns {Donkeycraft.ChunkManager|null}
         */
        function getCurrentChunkManager(options) {
            return getChunkManagerForDimension(_currentDimension, options);
        }

        /**
         * Clear the chunk manager for a dimension (useful for world reload).
         * @param {number} type - Dimension type constant.
         */
        function clearChunkManager(type) {
            if (_chunkManagers[type]) {
                _chunkManagers[type].destroy();
                _chunkManagers[type] = null;
            }
        }

        /**
         * Get the height of a dimension.
         * @param {number} type - Dimension type constant.
         * @returns {number} World height, or 0 if dimension doesn't exist.
         */
        function getDimensionHeight(type) {
            var dim = getDimension(type);
            return dim ? dim.height : WORLD_HEIGHT;
        }

        /**
         * Check if beds work in a dimension.
         * @param {number} type - Dimension type constant.
         * @returns {boolean}
         */
        function bedsWorkInDimension(type) {
            var dim = getDimension(type);
            return dim ? dim.bedWorks : true;
        }

        /**
         * Check if piglins are hostile in a dimension.
         * @param {number} type - Dimension type constant.
         * @returns {boolean}
         */
        function hasPiglinsInDimension(type) {
            var dim = getDimension(type);
            return dim ? dim.hasPiglins : false;
        }

        /**
         * Check if weather occurs in a dimension.
         * @param {number} type - Dimension type constant.
         * @returns {boolean}
         */
        function hasWeatherInDimension(type) {
            var dim = getDimension(type);
            return dim ? dim.hasWeather : false;
        }

        /**
         * Get the ambient darkness of a dimension.
         * @param {number} type - Dimension type constant.
         * @returns {number} Ambient darkness (0-1).
         */
        function getAmbientDarkness(type) {
            var dim = getDimension(type);
            return dim ? dim.ambientDarkness : 0;
        }

        /**
         * Check if sky light reaches the surface in a dimension.
         * @param {number} type - Dimension type constant.
         * @returns {boolean}
         */
        function hasSkyLightInDimension(type) {
            var dim = getDimension(type);
            return dim ? dim.hasSkyLight : true;
        }

        /**
         * Destroy all dimension chunk managers and free resources.
         */
        function destroy() {
            for (var key in _chunkManagers) {
                if (_chunkManagers.hasOwnProperty(key)) {
                    _chunkManagers[key].destroy();
                    _chunkManagers[key] = null;
                }
            }
            _chunkManagers = {};
        }

        // Initialize on load
        init();

        return {
            getDimension: getDimension,
            getAllDimensions: getAllDimensions,
            hasDimension: hasDimension,
            getCurrentDimension: getCurrentDimension,
            setCurrentDimension: setCurrentDimension,
            getSpawnPosition: getSpawnPosition,
            setSpawnPosition: setSpawnPosition,
            transformCoordinates: transformCoordinates,
            getChunkManagerForDimension: getChunkManagerForDimension,
            getChunkManagerForDimensionIfExists: getChunkManagerForDimensionIfExists,
            getCurrentChunkManager: getCurrentChunkManager,
            clearChunkManager: clearChunkManager,
            getDimensionHeight: getDimensionHeight,
            bedsWorkInDimension: bedsWorkInDimension,
            hasPiglinsInDimension: hasPiglinsInDimension,
            hasWeatherInDimension: hasWeatherInDimension,
            getAmbientDarkness: getAmbientDarkness,
            hasSkyLightInDimension: hasSkyLightInDimension,
            destroy: destroy
        };
    })();

})();