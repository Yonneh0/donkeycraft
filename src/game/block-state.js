// Donkeycraft — Block State System
// Block state metadata: variants (oak log direction, wool color), property system.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // BlockState — represents a block's property values
    // ============================================================

    /**
     * BlockState — holds property key-value pairs for a block variant.
     * @param {Object.<string, string|number>} [properties={}] — Property name -> value map.
     */
    Donkeycraft.BlockState = function(properties) {
        this._properties = properties || {};
    };

    /**
     * Get a property value by name.
     * @param {string} name - Property name (e.g., "axis", "color").
     * @returns {string|number|null} The property value, or null if not set.
     */
    Donkeycraft.BlockState.prototype.get = function(name) {
        return this._properties[name] !== undefined ? this._properties[name] : null;
    };

    /**
     * Set a property value.
     * @param {string} name - Property name.
     * @param {string|number} value - Property value.
     * @returns {Donkeycraft.BlockState} this (for chaining)
     */
    Donkeycraft.BlockState.prototype.set = function(name, value) {
        this._properties[name] = value;
        return this;
    };

    /**
     * Check if this state matches another state (all properties equal).
     * @param {Donkeycraft.BlockState} other - Another block state.
     * @returns {boolean} True if all properties match.
     */
    Donkeycraft.BlockState.prototype.matches = function(other) {
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
    Donkeycraft.BlockState.prototype.getPropertyNames = function() {
        return Object.keys(this._properties);
    };

    /**
     * Check if this state has any properties set.
     * @returns {boolean}
     */
    Donkeycraft.BlockState.prototype.isEmpty = function() {
        return Object.keys(this._properties).length === 0;
    };

    /**
     * Clone this block state.
     * @returns {Donkeycraft.BlockState}
     */
    Donkeycraft.BlockState.prototype.clone = function() {
        var copy = {};
        for (var key in this._properties) {
            if (this._properties.hasOwnProperty(key)) {
                copy[key] = this._properties[key];
            }
        }
        return new Donkeycraft.BlockState(copy);
    };

    // ============================================================
    // Common property value constants
    // ============================================================

    /**
     * AxisValues — possible axis directions for logs, poles, etc.
     */
    Donkeycraft.AxisValues = {
        X: 'x',
        Y: 'y',
        Z: 'z'
    };

    /**
     * FacingValues — possible facing directions.
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
     * ColorValues — 16 Minecraft wool/dye colors.
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
     */
    Donkeycraft.HalfValues = {
        LOWER: 'lower',
        UPPER: 'upper'
    };

    /**
     * WaterloggedValues — boolean-like waterlogged property.
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
     */
    Donkeycraft.BlockStateRegistry = (function() {
        var _blockStates = {};  // blockId -> array of BlockState objects
        var _stateIndex = {};   // "blockId:stateString" -> BlockState

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

        // ---- Register common block states ----

        // Oak log: axis property (x, y, z)
        registerStates(24, [
            { axis: 'y' },   // default: vertical log
            { axis: 'x' },   // horizontal log (x-axis)
            { axis: 'z' }    // horizontal log (z-axis)
        ]);

        // Spruce log: axis property
        registerStates(25, [
            { axis: 'y' },
            { axis: 'x' },
            { axis: 'z' }
        ]);

        // Birch log: axis property
        registerStates(26, [
            { axis: 'y' },
            { axis: 'x' },
            { axis: 'z' }
        ]);

        // Jungle log: axis property
        registerStates(27, [
            { axis: 'y' },
            { axis: 'x' },
            { axis: 'z' }
        ]);

        // Acacia log: axis property
        registerStates(28, [
            { axis: 'y' },
            { axis: 'x' },
            { axis: 'z' }
        ]);

        // Dark oak log: axis property
        registerStates(29, [
            { axis: 'y' },
            { axis: 'x' },
            { axis: 'z' }
        ]);

        // Quartz pillar: axis property
        registerStates(236, [
            { axis: 'y' },
            { axis: 'x' },
            { axis: 'z' }
        ]);

        // Wool: color property (16 colors)
        var woolColors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
                          'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown',
                          'green', 'red', 'black'];
        var woolStates = [];
        for (var w = 0; w < woolColors.length; w++) {
            woolStates.push({ color: woolColors[w] });
        }
        // Register each wool block individually since they have different IDs
        for (var c = 0; c < 16; c++) {
            var woolId = 53 + c;
            _blockStates[woolId] = [new Donkeycraft.BlockState({ color: woolColors[c] })];
            _stateIndex[woolId + ':color=' + woolColors[c]] = new Donkeycraft.BlockState({ color: woolColors[c] });
        }

        // Concrete: color property (same 16 colors)
        var concreteStates = [];
        for (var c2 = 0; c2 < 16; c2++) {
            concreteStates.push({ color: woolColors[c2] });
        }
        for (var c3 = 0; c3 < 16; c3++) {
            var concreteId = 69 + c3;
            _blockStates[concreteId] = [new Donkeycraft.BlockState({ color: woolColors[c3] })];
            _stateIndex[concreteId + ':color=' + woolColors[c3]] = new Donkeycraft.BlockState({ color: woolColors[c3] });
        }

        // Stained glass: color property (16 colors)
        for (var c4 = 0; c4 < 16; c4++) {
            var glassId = 241 + c4;
            _blockStates[glassId] = [new Donkeycraft.BlockState({ color: woolColors[c4] })];
            _stateIndex[glassId + ':color=' + woolColors[c4]] = new Donkeycraft.BlockState({ color: woolColors[c4] });
        }

        // Concrete powder: color property (16 colors)
        for (var c5 = 0; c5 < 16; c5++) {
            var powderId = 85 + c5;
            _blockStates[powderId] = [new Donkeycraft.BlockState({ color: woolColors[c5] })];
            _stateIndex[powderId + ':color=' + woolColors[c5]] = new Donkeycraft.BlockState({ color: woolColors[c5] });
        }

        // Redstone wire: power property (0-15)
        var redstoneStates = [];
        for (var p = 0; p <= 15; p++) {
            redstoneStates.push({ power: p });
        }
        registerStates(173, redstoneStates);

        // Redstone torch: on/off property
        registerStates(174, [
            { lit: 'true' },
            { lit: 'false' }
        ]);

        // Repeater: delay (1-4) and locked property
        var repeaterStates = [];
        for (var d = 1; d <= 4; d++) {
            repeaterStates.push({ delay: d, locked: 'false' });
            repeaterStates.push({ delay: d, locked: 'true' });
        }
        registerStates(180, repeaterStates);

        // Lever: facing and power
        registerStates(145, [
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
        ]);

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
            var keys = Object.keys(state._properties).sort();
            var parts = [];
            for (var i = 0; i < keys.length; i++) {
                parts.push(keys[i] + '=' + state._properties[keys[i]]);
            }
            return parts.join(',');
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

        return {
            registerStates: registerStates,
            getPossibleStates: getPossibleStates,
            getStateByString: getStateByString,
            getStateString: getStateString,
            hasStates: hasStates,
            getDefaultState: getDefaultState,
            findMatchingState: findMatchingState
        };
    })();

})();