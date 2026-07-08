// Donkeycraft — Block State System
// Block state metadata: variants (oak log direction, wool color), property system.
// Uses BlockRegistry name-based lookups for robust ID-agnostic state registration.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // BlockState — represents a block's property values
    // ============================================================

    /**
     * BlockState — holds property key-value pairs for a block variant.
     * @param {Object.<string, string|number>} [properties={}] — Property name -> value map.
     */
    Donkeycraft.BlockState = function (properties) {
        this._properties = properties || {};
    };

    /**
     * Get a property value by name.
     * @param {string} name - Property name (e.g., "axis", "color").
     * @returns {string|number|null} The property value, or null if not set.
     */
    Donkeycraft.BlockState.prototype.get = function (name) {
        return this._properties[name] !== undefined ? this._properties[name] : null;
    };

    /**
     * Set a property value.
     * @param {string} name - Property name.
     * @param {string|number} value - Property value.
     * @returns {Donkeycraft.BlockState} this (for chaining)
     */
    Donkeycraft.BlockState.prototype.set = function (name, value) {
        this._properties[name] = value;
        return this;
    };

    /**
     * Check if this state matches another state (all properties equal).
     * @param {Donkeycraft.BlockState} other - Another block state.
     * @returns {boolean} True if all properties match.
     */
    Donkeycraft.BlockState.prototype.matches = function (other) {
        if (!other || !other._properties) return false;
        var keys = Object.keys(this._properties);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (this._properties[key] !== other._properties[key]) {
                return false;
            }
        }
        // Also check that other has no extra properties
        var otherKeys = Object.keys(other._properties);
        if (otherKeys.length !== keys.length) return false;
        return true;
    };

    /**
     * Get all property names.
     * @returns {string[]}
     */
    Donkeycraft.BlockState.prototype.getPropertyNames = function () {
        return Object.keys(this._properties);
    };

    /**
     * Check if this state has any properties set.
     * @returns {boolean}
     */
    Donkeycraft.BlockState.prototype.isEmpty = function () {
        return Object.keys(this._properties).length === 0;
    };

    /**
     * Clone this block state.
     * @returns {Donkeycraft.BlockState}
     */
    Donkeycraft.BlockState.prototype.clone = function () {
        var copy = {};
        for (var key in this._properties) {
            if (this._properties.hasOwnProperty(key)) {
                copy[key] = this._properties[key];
            }
        }
        return new Donkeycraft.BlockState(copy);
    };

    /**
     * Serialize this state to a canonical string representation.
     * Keys are sorted for consistency.
     * @returns {string} Serialized state string (e.g., "axis=y,color=red").
     */
    Donkeycraft.BlockState.prototype.serialize = function () {
        var keys = Object.keys(this._properties).sort();
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
            parts.push(keys[i] + '=' + this._properties[keys[i]]);
        }
        return parts.join(',');
    };

    /**
     * Deserialize a state string back into a BlockState.
     * @param {string} stateStr - Serialized state string (e.g., "axis=y,color=red").
     * @returns {Donkeycraft.BlockState}
     */
    Donkeycraft.BlockState.deserialize = function (stateStr) {
        if (!stateStr || typeof stateStr !== 'string') return new Donkeycraft.BlockState({});
        var props = {};
        var parts = stateStr.split(',');
        for (var i = 0; i < parts.length; i++) {
            var kv = parts[i].split('=');
            if (kv.length === 2) {
                var val = kv[1];
                // Attempt numeric conversion
                var num = Number(val);
                props[kv[0]] = (isNaN(num) || val !== String(num)) ? val : num;
            }
        }
        return new Donkeycraft.BlockState(props);
    };

    // ============================================================
    // Common property value constants
    // ============================================================

    /**
     * AxisValues — possible axis directions for logs, poles, etc.
     * @enum {string}
     */
    Donkeycraft.AxisValues = {
        X: 'x',
        Y: 'y',
        Z: 'z'
    };

    /**
     * FacingValues — possible facing directions.
     * @enum {string}
     */
    Donkeycraft.FacingValues = {
        NORTH: 'north',
        SOUTH: 'south',
        EAST: 'east',
        WEST: 'west',
        UP: 'up',
        DOWN: 'down'
    };

    /**
     * ColorValues — 16 wool/dye colors.
     * @enum {string}
     */
    Donkeycraft.ColorValues = {
        WHITE: 'white',
        ORANGE: 'orange',
        MAGENTA: 'magenta',
        LIGHT_BLUE: 'light_blue',
        YELLOW: 'yellow',
        LIME: 'lime',
        PINK: 'pink',
        GRAY: 'gray',
        LIGHT_GRAY: 'light_gray',
        CYAN: 'cyan',
        PURPLE: 'purple',
        BLUE: 'blue',
        BROWN: 'brown',
        GREEN: 'green',
        RED: 'red',
        BLACK: 'black'
    };

    /**
     * HalfValues — for stairs, beds, etc.
     * @enum {string}
     */
    Donkeycraft.HalfValues = {
        LOWER: 'lower',
        UPPER: 'upper'
    };

    /**
     * WaterloggedValues — boolean-like waterlogged property.
     * @enum {string}
     */
    Donkeycraft.WaterloggedValues = {
        TRUE: 'true',
        FALSE: 'false'
    };

    // ============================================================
    // BlockStateRegistry — maps base block IDs to their possible states
    // ============================================================

    /**
     * BlockStateRegistry — defines which blocks have variants and what states are valid.
     * Uses BlockRegistry name-based lookups for robust ID resolution.
     * @namespace
     */
    Donkeycraft.BlockStateRegistry = (function () {
        /** @type {Object.<number, Donkeycraft.BlockState[]>} */
        var _blockStates = {};
        /** @type {Object.<string, Donkeycraft.BlockState>} */
        var _stateIndex = {};

        /**
         * Helper to resolve block ID by name.
         * @param {string} name - Block name.
         * @returns {number} Block ID or -1.
         * @private
         */
        function _resolveBlockId(name) {
            if (!Donkeycraft.BlockRegistry || typeof Donkeycraft.BlockRegistry.getBlockByName !== 'function') return -1;
            var block = Donkeycraft.BlockRegistry.getBlockByName(name);
            return block ? block.id : -1;
        }

        /**
         * Build a canonical string representation of a property map.
         * @param {Object.<string, string|number>} props
         * @returns {string}
         * @private
         */
        function _buildStateString(props) {
            var keys = Object.keys(props).sort();
            var parts = [];
            for (var i = 0; i < keys.length; i++) {
                parts.push(keys[i] + '=' + props[keys[i]]);
            }
            return parts.join(',');
        }

        /**
         * Register possible states for a block.
         * @param {number} blockId - Block ID.
         * @param {Array.<Object.<string, string|number>>} states - Array of property maps.
         * @returns {number} Number of states registered.
         */
        function registerStates(blockId, states) {
            var stateList = [];
            for (var i = 0; i < states.length; i++) {
                var state = new Donkeycraft.BlockState(states[i]);
                stateList.push(state);
                var stateStr = _buildStateString(states[i]);
                var key = blockId + ':' + stateStr;
                _stateIndex[key] = state;
            }
            _blockStates[blockId] = stateList;
            return stateList.length;
        }

        // ============================================================
        // Register common block states using name-based ID resolution
        // ============================================================

        /**
         * Initialize all block state registrations.
         * @private
         */
        function _initStates() {
            if (!Donkeycraft.BlockRegistry) return;

            // Log blocks with axis property (x, y, z)
            var logNames = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log'];
            for (var l = 0; l < logNames.length; l++) {
                var lid = _resolveBlockId(logNames[l]);
                if (lid !== -1) {
                    registerStates(lid, [
                        { axis: 'y' },
                        { axis: 'x' },
                        { axis: 'z' }
                    ]);
                }
            }

            // Quartz pillar: axis property
            var quartzPillarId = _resolveBlockId('quartz_pillar');
            if (quartzPillarId !== -1) {
                registerStates(quartzPillarId, [
                    { axis: 'y' },
                    { axis: 'x' },
                    { axis: 'z' }
                ]);
            }

            // Wool: 16 color variants
            var woolColors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
                'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown',
                'green', 'red', 'black'];

            // Register each wool block by name
            for (var w = 0; w < woolColors.length; w++) {
                var woolId = _resolveBlockId(woolColors[w] + '_wool');
                if (woolId !== -1) {
                    _blockStates[woolId] = [new Donkeycraft.BlockState({ color: woolColors[w] })];
                    _stateIndex[woolId + ':color=' + woolColors[w]] = new Donkeycraft.BlockState({ color: woolColors[w] });
                }
            }

            // Concrete: 16 color variants
            for (var c1 = 0; c1 < 16; c1++) {
                var concreteId = _resolveBlockId(woolColors[c1] + '_concrete');
                if (concreteId !== -1) {
                    _blockStates[concreteId] = [new Donkeycraft.BlockState({ color: woolColors[c1] })];
                    _stateIndex[concreteId + ':color=' + woolColors[c1]] = new Donkeycraft.BlockState({ color: woolColors[c1] });
                }
            }

            // Stained glass: 16 color variants
            for (var c2 = 0; c2 < 16; c2++) {
                var glassId = _resolveBlockId(woolColors[c2] + '_stained_glass');
                if (glassId !== -1) {
                    _blockStates[glassId] = [new Donkeycraft.BlockState({ color: woolColors[c2] })];
                    _stateIndex[glassId + ':color=' + woolColors[c2]] = new Donkeycraft.BlockState({ color: woolColors[c2] });
                }
            }

            // Concrete powder: 16 color variants
            for (var c3 = 0; c3 < 16; c3++) {
                var powderId = _resolveBlockId(woolColors[c3] + '_concrete_powder');
                if (powderId !== -1) {
                    _blockStates[powderId] = [new Donkeycraft.BlockState({ color: woolColors[c3] })];
                    _stateIndex[powderId + ':color=' + woolColors[c3]] = new Donkeycraft.BlockState({ color: woolColors[c3] });
                }
            }

            // Redstone wire: power property (0-15)
            var redstoneWireId = _resolveBlockId('redstone_wire');
            if (redstoneWireId !== -1) {
                var rsStates = [];
                for (var p = 0; p <= 15; p++) {
                    rsStates.push({ power: p });
                }
                registerStates(redstoneWireId, rsStates);
            }

            // Redstone torch: on/off property
            var redstoneTorchId = _resolveBlockId('redstone_torch');
            if (redstoneTorchId !== -1) {
                registerStates(redstoneTorchId, [
                    { lit: 'true' },
                    { lit: 'false' }
                ]);
            }

            // Repeater: delay (1-4) and locked property
            var repeaterId = _resolveBlockId('repeater');
            if (repeaterId !== -1) {
                var repStates = [];
                for (var d = 1; d <= 4; d++) {
                    repStates.push({ delay: d, locked: 'false' });
                    repStates.push({ delay: d, locked: 'true' });
                }
                registerStates(repeaterId, repStates);
            }

            // Lever: facing and power
            var leverId = _resolveBlockId('lever');
            if (leverId !== -1) {
                var leverStates = [
                    { facing: 'north', power: '0' },
                    { facing: 'south', power: '0' },
                    { facing: 'east', power: '0' },
                    { facing: 'west', power: '0' },
                    { facing: 'up', power: '0' },
                    { facing: 'down', power: '0' },
                    { facing: 'north', power: '1' },
                    { facing: 'south', power: '1' },
                    { facing: 'east', power: '1' },
                    { facing: 'west', power: '1' },
                    { facing: 'up', power: '1' },
                    { facing: 'down', power: '1' }
                ];
                registerStates(leverId, leverStates);
            }

            // Redstone torch: on/off property
            var redstoneTorchId = _resolveBlockId('redstone_torch');
            if (redstoneTorchId !== -1) {
                registerStates(redstoneTorchId, [
                    { lit: 'true' },
                    { lit: 'false' }
                ]);
            }

            // Redstone lamp: lit/unlit state
            var redstoneLampId = _resolveBlockId('lit_redstone_lamp');
            if (redstoneLampId !== -1) {
                registerStates(redstoneLampId, [
                    { lit: 'true' }
                ]);
            }

            // Redstone lamp (unlit variant)
            var redstoneLampUnlitId = _resolveBlockId('redstone_lamp');
            if (redstoneLampUnlitId !== -1) {
                registerStates(redstoneLampUnlitId, [
                    { lit: 'false' }
                ]);
            }

            // Furnace: normal and lit variants
            var furnaceId = _resolveBlockId('furnace');
            if (furnaceId !== -1) {
                registerStates(furnaceId, [
                    { lit: 'false' }
                ]);
            }

            var litFurnaceId = _resolveBlockId('lit_furnace');
            if (litFurnaceId !== -1) {
                registerStates(litFurnaceId, [
                    { lit: 'true' }
                ]);
            }

            // Slabs: lower and upper half properties
            var slabNames = ['stone_slab', 'smooth_stone_slab', 'oak_slab', 'spruce_slab', 'birch_slab', 'cobblestone_slab', 'brick_slab'];
            for (var ss = 0; ss < slabNames.length; ss++) {
                var slabId = _resolveBlockId(slabNames[ss]);
                if (slabId !== -1) {
                    registerStates(slabId, [
                        { half: 'lower' },
                        { half: 'upper' }
                    ]);
                }
            }

            // Stairs: orientation properties (facing + half + shape)
            var stairNames = ['stone_bricks_stairs', 'oak_stairs', 'cobblestone_stairs', 'brick_stairs', 'smooth_stone_stairs', 'sandstone_stairs'];
            for (var st = 0; st < stairNames.length; st++) {
                var stairId = _resolveBlockId(stairNames[st]);
                if (stairId !== -1) {
                    var stairStates = [];
                    var facings = ['north', 'south', 'east', 'west'];
                    for (var f = 0; f < facings.length; f++) {
                        stairStates.push({ facing: facings[f], half: 'lower', shape: 'straight' });
                        stairStates.push({ facing: facings[f], half: 'upper', shape: 'straight' });
                    }
                    registerStates(stairId, stairStates);
                }
            }

            // Doors: upper/lower and facing properties
            var doorNames = ['oak_door', 'spruce_door', 'iron_door'];
            for (var d = 0; d < doorNames.length; d++) {
                var doorId = _resolveBlockId(doorNames[d]);
                if (doorId !== -1) {
                    var doorStates = [];
                    var doorHalfes = ['lower', 'upper'];
                    var doorFacings = ['north', 'south', 'east', 'west'];
                    for (var h = 0; h < doorHalfes.length; h++) {
                        for (var fc = 0; fc < doorFacings.length; fc++) {
                            doorStates.push({ half: doorHalfes[h], facing: doorFacings[fc] });
                        }
                    }
                    registerStates(doorId, doorStates);
                }
            }

            // Beds: lower/upper and facing
            var bedNames = ['oak_bed', 'red_bed'];
            for (var b = 0; b < bedNames.length; b++) {
                var bedId = _resolveBlockId(bedNames[b]);
                if (bedId !== -1) {
                    var bedStates = [];
                    var bedFacings = ['north', 'south', 'east', 'west'];
                    for (var bf = 0; bf < bedFacings.length; bf++) {
                        bedStates.push({ part: 'head', facing: bedFacings[bf] });
                        bedStates.push({ part: 'foot', facing: bedFacings[bf] });
                    }
                    registerStates(bedId, bedStates);
                }
            }

            // Cauldron: level property (0-3)
            var cauldronId = _resolveBlockId('cauldron');
            if (cauldronId !== -1) {
                var cauldronStates = [];
                for (var lvl = 0; lvl <= 3; lvl++) {
                    cauldronStates.push({ level: lvl });
                }
                registerStates(cauldronId, cauldronStates);
            }

            // Brewing stand: bottle slots (0-3)
            var brewingStandId = _resolveBlockId('brewing_stand');
            if (brewingStandId !== -1) {
                var bsStates = [];
                for (var bottles = 0; bottles <= 3; bottles++) {
                    bsStates.push({ bottles: bottles });
                }
                registerStates(brewingStandId, bsStates);
            }
        }

        // Run initialization
        _initStates();

        // ============================================================
        // Public API
        // ============================================================

        /**
         * Get all possible states for a block ID.
         * @param {number} blockId - Block ID.
         * @returns {Donkeycraft.BlockState[]} Array of possible states, or empty array if none.
         */
        function getPossibleStates(blockId) {
            return _blockStates[blockId] || [];
        }

        /**
         * Get a specific state by block ID and state string.
         * @param {number} blockId - Block ID.
         * @param {string} stateString - State string (e.g., "axis=y,color=red").
         * @returns {Donkeycraft.BlockState|null}
         */
        function getStateByString(blockId, stateString) {
            var key = blockId + ':' + stateString;
            return _stateIndex[key] || null;
        }

        /**
         * Serialize a block state to a string.
         * @param {Donkeycraft.BlockState} state - Block state to serialize.
         * @returns {string} Serialized state string.
         */
        function getStateString(state) {
            if (!state || !state._properties) return '';
            return state.serialize();
        }

        /**
         * Check if a block has any state variants.
         * @param {number} blockId - Block ID.
         * @returns {boolean}
         */
        function hasStates(blockId) {
            return _blockStates[blockId] !== undefined && _blockStates[blockId].length > 0;
        }

        /**
         * Get the default state for a block (first state, or empty).
         * @param {number} blockId - Block ID.
         * @returns {Donkeycraft.BlockState}
         */
        function getDefaultState(blockId) {
            var states = _blockStates[blockId];
            if (states && states.length > 0) return states[0];
            return new Donkeycraft.BlockState({});
        }

        /**
         * Find a state that matches the given properties for a block.
         * @param {number} blockId - Block ID.
         * @param {Object.<string, string|number>} props - Property map to match.
         * @returns {Donkeycraft.BlockState|null}
         */
        function findMatchingState(blockId, props) {
            var states = _blockStates[blockId];
            if (!states) return null;
            for (var i = 0; i < states.length; i++) {
                if (states[i].matches(new Donkeycraft.BlockState(props))) {
                    return states[i];
                }
            }
            return null;
        }

        /**
         * Serialize all registered block states to a plain object for storage.
         * Returns an object mapping blockId -> array of state strings.
         * @returns {Object.<string, string[]>}
         */
        function serializeAll() {
            var result = {};
            for (var bidStr in _blockStates) {
                if (_blockStates.hasOwnProperty(bidStr)) {
                    var bid = parseInt(bidStr, 10);
                    var states = _blockStates[bid];
                    result[bid] = [];
                    for (var i = 0; i < states.length; i++) {
                        result[bid].push(states[i].serialize());
                    }
                }
            }
            return result;
        }

        /**
         * Deserialize and restore block states from a saved object.
         * @param {Object.<string, string[]>} data - Serialized state data.
         */
        function deserializeAll(data) {
            if (!data || typeof data !== 'object') return;
            // Clear existing registrations
            _blockStates = {};
            _stateIndex = {};
            // Re-register from data
            for (var bidStr in data) {
                if (data.hasOwnProperty(bidStr)) {
                    var bid = parseInt(bidStr, 10);
                    var stateStrs = data[bidStr];
                    if (!Array.isArray(stateStrs)) continue;
                    var stateList = [];
                    for (var i = 0; i < stateStrs.length; i++) {
                        var state = Donkeycraft.BlockState.deserialize(stateStrs[i]);
                        stateList.push(state);
                        var key = bid + ':' + stateStrs[i];
                        _stateIndex[key] = state;
                    }
                    _blockStates[bid] = stateList;
                }
            }
        }

        return {
            registerStates: registerStates,
            getPossibleStates: getPossibleStates,
            getStateByString: getStateByString,
            getStateString: getStateString,
            hasStates: hasStates,
            getDefaultState: getDefaultState,
            findMatchingState: findMatchingState,
            serializeAll: serializeAll,
            deserializeAll: deserializeAll
        };
    })();

})();