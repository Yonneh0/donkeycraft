// Donkeycraft — Chunk Grid Manager
// Manages a 12-chunk base grid with contiguous terrain across boundaries.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    // ============================================================
    // Constants
    // ============================================================
    var DEFAULT_GRID_DIMENSION = 6; // 6×6 = 36 chunks total (the "12-chunk base grid" concept)
    // Note: The plan calls this "12-chunk base grid" meaning a contiguous 6×6 grid
    // that can expand in 4 directions. Total = GRID_DIMENSION × GRID_DIMENSION.
    var MIN_CHUNK_RADIUS = 0;
    var MAX_CHUNK_RADIUS = 15; // Max radius in any direction

    // ============================================================
    // Runtime State
    // ============================================================
    var _centerChunkX = 0;
    var _centerChunkZ = 0;
    var _radiusN = 3; // North (negative Z) — default 6 wide
    var _radiusS = 3; // South (positive Z)
    var _radiusW = 3; // West (negative X)
    var _radiusE = 3; // East (positive X)
    var _listeners = []; // Callback listeners for grid changes

    // ============================================================
    // Utility Functions
    // ============================================================

    /**
     * Calculate total chunks in current grid configuration.
     * @returns {number} Total number of chunks.
     * @private
     */
    function _totalChunks() {
        var width = _radiusW + _radiusE + 1;
        var height = _radiusN + _radiusS + 1;
        return width * height;
    }

    /**
     * Check if a chunk position is within the current grid.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @returns {boolean} True if within grid bounds.
     * @private
     */
    function _isInGrid(chunkX, chunkZ) {
        return chunkX >= _centerChunkX - _radiusW &&
            chunkX <= _centerChunkX + _radiusE &&
            chunkZ >= _centerChunkZ - _radiusN &&
            chunkZ <= _centerChunkZ + _radiusS;
    }

    /**
     * Notify all listeners of grid changes.
     * @param {Object} event - Event data.
     * @private
     */
    function _notifyListeners(event) {
        for (var i = 0; i < _listeners.length; i++) {
            try {
                _listeners[i](event);
            } catch (e) { /* ignore listener errors */ }
        }
    }

    // ============================================================
    // Grid Management
    // ============================================================

    /**
     * Set the center chunk position.
     * @param {number} x - New center chunk X.
     * @param {number} z - New center chunk Z.
     */
    function setCenter(x, z) {
        // Validate inputs are finite numbers
        if (!isFinite(x) || !isFinite(z)) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[ChunkGrid] setCenter: non-finite coordinates ignored');
            }
            return;
        }

        var oldX = _centerChunkX;
        var oldZ = _centerChunkZ;
        _centerChunkX = Math.round(x);
        _centerChunkZ = Math.round(z);

        // Notify listeners of center change
        _notifyGridChange({
            type: 'centerChanged',
            oldX: oldX,
            oldZ: oldZ,
            newX: _centerChunkX,
            newZ: _centerChunkZ
        });
    }

    /**
     * Get the current center chunk position.
     * @returns {{x: number, z: number}} Center coordinates.
     */
    function getCenter() {
        return { x: _centerChunkX, z: _centerChunkZ };
    }

    /**
     * Expand the grid in a direction.
     * @param {string} direction - Direction: 'n', 's', 'e', 'w'.
     * @returns {boolean} True if expanded successfully.
     */
    function expand(direction) {
        // Validate direction parameter
        if (typeof direction !== 'string' || !direction.match(/^[nsew]$/i)) {
            return false;
        }
        direction = direction.toLowerCase();

        var oldTotal = _totalChunks();

        switch (direction) {
            case 'n':
                if (_radiusN >= MAX_CHUNK_RADIUS) return false;
                _radiusN++;
                break;
            case 's':
                if (_radiusS >= MAX_CHUNK_RADIUS) return false;
                _radiusS++;
                break;
            case 'e':
                if (_radiusE >= MAX_CHUNK_RADIUS) return false;
                _radiusE++;
                break;
            case 'w':
                if (_radiusW >= MAX_CHUNK_RADIUS) return false;
                _radiusW++;
                break;
            default:
                return false;
        }

        _notifyGridChange({
            type: 'gridExpanded',
            direction: direction,
            oldTotal: oldTotal,
            newTotal: _totalChunks()
        });

        return true;
    }

    /**
     * Contract the grid in a direction.
     * @param {string} direction - Direction: 'n', 's', 'e', 'w'.
     * @returns {boolean} True if contracted successfully.
     */
    function contract(direction) {
        // Validate direction parameter
        if (typeof direction !== 'string' || !direction.match(/^[nsew]$/i)) {
            return false;
        }
        direction = direction.toLowerCase();

        var oldTotal = _totalChunks();
        var oldBounds = getBounds(); // Capture bounds before contraction

        switch (direction) {
            case 'n':
                if (_radiusN <= MIN_CHUNK_RADIUS) return false;
                _radiusN--;
                break;
            case 's':
                if (_radiusS <= MIN_CHUNK_RADIUS) return false;
                _radiusS--;
                break;
            case 'e':
                if (_radiusE <= MIN_CHUNK_RADIUS) return false;
                _radiusE--;
                break;
            case 'w':
                if (_radiusW <= MIN_CHUNK_RADIUS) return false;
                _radiusW--;
                break;
            default:
                return false;
        }

        // Determine which chunks were removed for cache invalidation
        var removedChunks = [];
        var newBounds = getBounds();

        // Direction mapping: each direction affects a specific edge
        // 'n' (North): _radiusN decreases → minZ increases (chunks at lower Z are removed)
        // 's' (South): _radiusS decreases → maxZ decreases (chunks at higher Z are removed)
        // 'w' (West): _radiusW decreases → minX increases (chunks at lower X are removed)
        // 'e' (East): _radiusE decreases → maxX decreases (chunks at higher X are removed)

        if (direction === 'n') {
            // Removed rows are at the south edge of the NEW bounds (lower Z range)
            // old minZ = center - old_radiusN, new minZ = center - new_radiusN (higher value)
            // Removed: chunks with Z in [newBounds.minZ, oldBounds.minZ)
            for (var rx = oldBounds.minX; rx <= oldBounds.maxX; rx++) {
                for (var rz = newBounds.minZ; rz < oldBounds.minZ; rz++) {
                    removedChunks.push({ x: rx, z: rz });
                }
            }
        } else if (direction === 's') {
            // Removed rows are at the north edge of the NEW bounds (higher Z range)
            // old maxZ = center + old_radiusS, new maxZ = center + new_radiusS (lower value)
            // Removed: chunks with Z in (newBounds.maxZ, oldBounds.maxZ]
            for (var rx2 = oldBounds.minX; rx2 <= oldBounds.maxX; rx2++) {
                for (var rz2 = newBounds.maxZ + 1; rz2 <= oldBounds.maxZ; rz2++) {
                    removedChunks.push({ x: rx2, z: rz2 });
                }
            }
        } else if (direction === 'e') {
            // Removed columns are at the west edge of the NEW bounds (higher X range)
            // old maxX = center + old_radiusE, new maxX = center + new_radiusE (lower value)
            // Removed: chunks with X in (newBounds.maxX, oldBounds.maxX]
            for (var rz3 = oldBounds.minZ; rz3 <= oldBounds.maxZ; rz3++) {
                for (var rx3 = newBounds.maxX + 1; rx3 <= oldBounds.maxX; rx3++) {
                    removedChunks.push({ x: rx3, z: rz3 });
                }
            }
        } else if (direction === 'w') {
            // Removed columns are at the east edge of the NEW bounds (lower X range)
            // old minX = center - old_radiusW, new minX = center - new_radiusW (higher value)
            // Removed: chunks with X in [newBounds.minX, oldBounds.minX)
            for (var rz4 = oldBounds.minZ; rz4 <= oldBounds.maxZ; rz4++) {
                for (var rx4 = newBounds.minX; rx4 < oldBounds.minX; rx4++) {
                    removedChunks.push({ x: rx4, z: rz4 });
                }
            }
        }

        _notifyGridChange({
            type: 'gridContracted',
            direction: direction,
            oldTotal: oldTotal,
            newTotal: _totalChunks(),
            removedChunks: removedChunks
        });

        return true;
    }

    /**
     * Get the current grid radii.
     * @returns {{n: number, s: number, e: number, w: number}} Current radii.
     */
    function getRadii() {
        return { n: _radiusN, s: _radiusS, e: _radiusE, w: _radiusW };
    }

    /**
     * Set all grid radii at once.
     * @param {Object} radii - New radii object.
     */
    function setRadii(radii) {
        if (radii.n !== undefined) _radiusN = Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, Math.round(radii.n)));
        if (radii.s !== undefined) _radiusS = Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, Math.round(radii.s)));
        if (radii.e !== undefined) _radiusE = Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, Math.round(radii.e)));
        if (radii.w !== undefined) _radiusW = Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, Math.round(radii.w)));

        _notifyGridChange({
            type: 'gridResized',
            radii: getRadii(),
            total: _totalChunks()
        });
    }

    /**
     * Notify listeners of grid changes with chunk invalidation info.
     * @param {Object} event - Event data.
     * @private
     */
    function _notifyGridChange(event) {
        // Add current grid bounds for listener reference
        event.bounds = getBounds();
        event.totalChunks = _totalChunks();
        _notifyListeners(event);
    }

    /**
     * Reset grid to default 6×6 (36 chunks) configuration.
     */
    function resetToDefault() {
        var oldRadii = getRadii();
        _radiusN = Math.floor(DEFAULT_GRID_DIMENSION / 2);
        _radiusS = DEFAULT_GRID_DIMENSION - Math.floor(DEFAULT_GRID_DIMENSION / 2) - 1;
        _radiusE = Math.floor(DEFAULT_GRID_DIMENSION / 2);
        _radiusW = DEFAULT_GRID_DIMENSION - Math.floor(DEFAULT_GRID_DIMENSION / 2) - 1;

        _notifyGridChange({
            type: 'gridReset',
            oldRadii: oldRadii,
            newRadii: getRadii(),
            total: _totalChunks()
        });
    }

    /**
     * Get the grid bounds as a range of chunk coordinates.
     * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}} Grid bounds.
     */
    function getBounds() {
        return {
            minX: _centerChunkX - _radiusW,
            maxX: _centerChunkX + _radiusE,
            minZ: _centerChunkZ - _radiusN,
            maxZ: _centerChunkZ + _radiusS
        };
    }

    /**
     * Get all chunk coordinates within the current grid.
     * @returns {Array<{x: number, z: number}>} Array of chunk coordinate objects.
     */
    function getGridChunks() {
        var bounds = getBounds();
        var result = [];
        for (var x = bounds.minX; x <= bounds.maxX; x++) {
            for (var z = bounds.minZ; z <= bounds.maxZ; z++) {
                result.push({ x: x, z: z });
            }
        }
        return result;
    }

    // ============================================================
    // Event System
    // ============================================================

    /**
     * Register a listener for grid changes.
     * @param {Function} callback - Callback function receiving event objects.
     * @returns {Function} Unsubscribe function.
     */
    function onGridChange(callback) {
        if (typeof callback === 'function') {
            _listeners.push(callback);
        }

        // Return unsubscribe function
        return function () {
            var idx = _listeners.indexOf(callback);
            if (idx >= 0) {
                _listeners.splice(idx, 1);
            }
        };
    }

    /**
     * Get the number of registered listeners.
     * @returns {number} Listener count.
     */
    function getListenerCount() {
        return _listeners.length;
    }

    // ============================================================
    // State Persistence
    // ============================================================

    /**
     * Save grid state to a key-value store (for localStorage integration).
     * @param {string} key - Storage key.
     * @param {Object} store - Storage object with getItem/setItem.
     */
    function saveState(key, store) {
        if (!store) return;
        try {
            var state = {
                center: getCenter(),
                radii: getRadii(),
                timestamp: Date.now()
            };
            store.setItem(key, JSON.stringify(state));
        } catch (e) { /* ignore storage errors */ }
    }

    /**
     * Load grid state from a key-value store.
     * @param {string} key - Storage key.
     * @param {Object} store - Storage object with getItem/setItem.
     * @returns {boolean} True if state was loaded successfully.
     */
    function loadState(key, store) {
        if (!store) return false;
        try {
            var raw = store.getItem(key);
            if (!raw) return false;
            var state = JSON.parse(raw);
            if (!state || !state.center || !state.radii) return false;

            // Validate loaded coordinates (validate raw values before rounding)
            var rawX = state.center.x;
            var rawZ = state.center.z;
            if (!isFinite(rawX) || !isFinite(rawZ)) return false;
            var cx = Math.round(rawX);
            var cz = Math.round(rawZ);

            setCenter(cx, cz);

            // Validate and load radii with bounds clamping
            var loadedRadii = {
                n: Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, Math.round(state.radii.n || 0))),
                s: Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, Math.round(state.radii.s || 0))),
                e: Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, Math.round(state.radii.e || 0))),
                w: Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, Math.round(state.radii.w || 0)))
            };
            setRadii(loadedRadii);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Donkeycraft.ChunkGrid — Chunk grid manager for 12-chunk base grid.
     * @namespace
     */
    Donkeycraft.ChunkGrid = {
        // Center management
        setCenter: setCenter,
        getCenter: getCenter,

        // Grid expansion/contraction
        expand: expand,
        contract: contract,
        getRadii: getRadii,
        setRadii: setRadii,
        resetToDefault: resetToDefault,

        // Grid queries
        getBounds: getBounds,
        getGridChunks: getGridChunks,
        isInGrid: _isInGrid,
        totalChunks: _totalChunks,

        // Event system
        onGridChange: onGridChange,
        getListenerCount: getListenerCount,

        // State persistence
        saveState: saveState,
        loadState: loadState
    };

})();