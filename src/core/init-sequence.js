// Donkeycraft — Initialization Sequence
// Async initialization pipeline: config validation → texture-atlas → audio → indexeddb.
// Each phase runs sequentially, emitting events for progress tracking by LoadingScreen.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * InitSequence — orchestrates async game initialization pipeline.
     * Runs config validation, texture atlas setup, audio init, and IndexedDB opening
     * sequentially, emitting events at each phase boundary for LoadingScreen integration.
     * @param {Object} [config] - Donkeycraft.Config object. Defaults to window.Donkeycraft.Config if null.
     */
    Donkeycraft.InitSequence = function(config) {
        this._config = config || Donkeycraft.Config;
        this._eventBus = new Donkeycraft.EventBus();
        this._currentPhase = 'none';
        this._destroyed = false;
        this._systems = null;
    };

    /**
     * _emit — emit an event via the internal EventBus with phase context.
     * Silently skips emission if destroy() was called or EventBus is unavailable.
     * @private
     * @param {string} eventName - Event name.
     * @param {Object} data - Event payload.
     */
    Donkeycraft.InitSequence.prototype._emit = function(eventName, data) {
        if (this._destroyed || !this._eventBus) return;
        try {
            this._eventBus.emit(eventName, data);
        } catch (e) {
            // Silently skip emission on error to prevent cascading failures
            Donkeycraft.Logger.error('InitSequence', 'Event emission failed: ' + e.message);
        }
    };

    /**
     * _setPhase — update current initialization phase and emit start event.
     * @private
     * @param {string} phase - Phase name identifier.
     */
    Donkeycraft.InitSequence.prototype._setPhase = function(phase) {
        this._currentPhase = phase;
        this._emit('init:phase:start', { phase: phase });
    };

    /**
     * _endPhase — emit phase completion event with the given phase name.
     * @private
     * @param {string} phase - Phase name that completed.
     */
    Donkeycraft.InitSequence.prototype._endPhase = function(phase) {
        this._emit('init:phase:end', { phase: phase });
    };

    /**
     * _validateConfig — validate that the configuration object has required numeric fields.
     * Checks all critical config values used by Game, ChunkManager, and Player systems.
     * @private
     * @returns {boolean} True if all required config values are present and valid.
     */
    Donkeycraft.InitSequence.prototype._validateConfig = function() {
        var cfg = this._config;
        if (!cfg) return false;

        // World geometry
        if (typeof cfg.CHUNK_SIZE !== 'number' || cfg.CHUNK_SIZE <= 0) return false;
        if (typeof cfg.WORLD_HEIGHT !== 'number' || cfg.WORLD_HEIGHT <= 0) return false;
        if (typeof cfg.RENDER_DISTANCE !== 'number' || cfg.RENDER_DISTANCE <= 0) return false;

        // Timing
        if (typeof cfg.GAME_TICKS_PER_SECOND !== 'number' || cfg.GAME_TICKS_PER_SECOND <= 0) return false;

        // Player movement
        if (typeof cfg.PLAYER_SPEED !== 'number' || cfg.PLAYER_SPEED <= 0) return false;
        if (typeof cfg.GRAVITY !== 'number') return false;

        // Interaction
        if (typeof cfg.PLAYER_REACH !== 'number' || cfg.PLAYER_REACH <= 0) return false;

        return true;
    };

    /**
     * _initTextureAtlas — initialize the texture atlas system.
     * Texture atlas generation is deferred to the AssetGenerator pipeline which
     * produces procedural textures and uploads them via TextureAtlas.generate().
     * This phase simply signals completion since the atlas is initialized separately.
     * @private
     * @returns {Promise<Object>} Resolves with atlas info when ready.
     */
    Donkeycraft.InitSequence.prototype._initTextureAtlas = function() {
        return new Promise(function(resolve) {
            resolve({ name: 'texture-atlas-ready' });
        });
    };

    /**
     * _initAudio — initialize the audio system with decoded buffers.
     * Audio initialization is deferred to the Audio system which handles its own
     * async buffer decoding. This phase simply signals completion.
     * @private
     * @returns {Promise<Object>} Resolves with audio system info when ready.
     */
    Donkeycraft.InitSequence.prototype._initAudio = function() {
        return new Promise(function(resolve) {
            resolve({ name: 'audio-ready' });
        });
    };

    /**
     * _initIndexedDB — open IndexedDB connection for world persistence.
     * WorldStore handles its own DB initialization separately. This phase
     * simply signals completion to maintain the pipeline structure.
     * @private
     * @returns {Promise<Object>} Resolves with DB info when ready.
     */
    Donkeycraft.InitSequence.prototype._initIndexedDB = function() {
        return new Promise(function(resolve) {
            resolve({ name: 'indexeddb-ready' });
        });
    };

    /**
     * initialize — run the full async initialization pipeline sequentially.
     * Phases: config → texture-atlas → audio → indexeddb.
     * Emits 'init:phase:start', 'init:phase:end' per phase, and 'init:complete' on success.
     * If destroy() is called mid-pipeline, the promise rejects with an error.
     * @returns {Promise<Object>} Resolves with systems object containing config and eventBus.
     */
    Donkeycraft.InitSequence.prototype.initialize = function() {
        var self = this;
        var phases = [
            { name: 'config', fn: function() {
                if (!self._validateConfig()) {
                    return Promise.reject(new Error('Invalid configuration'));
                }
                self._setPhase('config');
                self._endPhase('config');
                return Promise.resolve();
            }},
            { name: 'texture-atlas', fn: function() {
                self._setPhase('texture-atlas');
                return self._initTextureAtlas().then(function(result) {
                    self._endPhase('texture-atlas');
                    return result;
                });
            }},
            { name: 'audio', fn: function() {
                self._setPhase('audio');
                return self._initAudio().then(function(result) {
                    self._endPhase('audio');
                    return result;
                });
            }},
            { name: 'indexeddb', fn: function() {
                self._setPhase('indexeddb');
                return self._initIndexedDB().then(function(result) {
                    self._endPhase('indexeddb');
                    return result;
                });
            }}
        ];

        // Chain phases sequentially, checking destroy flag between each phase
        var chain = Promise.resolve();
        for (var i = 0; i < phases.length; i++) {
            chain = chain.then((function(phaseDef) {
                return function() {
                    if (self._destroyed) {
                        return Promise.reject(new Error('InitSequence destroyed during phase: ' + phaseDef.name));
                    }
                    return phaseDef.fn();
                };
            })({ name: phases[i].name, fn: phases[i].fn }));
        }

        // Collect results on successful completion
        return chain.then(function() {
            self._systems = {
                config: self._config,
                eventBus: self._eventBus
            };
            self._emit('init:complete', { systems: self._systems });
            return self._systems;
        }).catch(function(err) {
            self._emit('init:error', { error: err, phase: self._currentPhase });
            return Promise.reject(err);
        });
    };

    /**
     * getPhase — return the current or last completed initialization phase name.
     * @returns {string} Phase name (e.g., 'config', 'texture-atlas', 'audio', 'indexeddb', 'none').
     */
    Donkeycraft.InitSequence.prototype.getPhase = function() {
        return this._currentPhase;
    };

    /**
     * getSystems — return the initialized systems object, or null if initialization hasn't completed.
     * The returned object contains: config, eventBus.
     * @returns {Object|null} Systems object or null.
     */
    Donkeycraft.InitSequence.prototype.getSystems = function() {
        return this._systems;
    };

    /**
     * on — subscribe to initialization lifecycle events.
     * Available events: 'init:phase:start', 'init:phase:end', 'init:complete', 'init:error'.
     * @param {string} eventName - Event name to subscribe to.
     * @param {Function} callback - Callback function receiving event data.
     * @returns {Function} Unsubscribe function that removes the listener when called.
     */
    Donkeycraft.InitSequence.prototype.on = function(eventName, callback) {
        if (!this._eventBus) return function() {};
        return this._eventBus.on(eventName, callback);
    };

    /**
     * destroy — clean up all resources and cancel any in-progress initialization.
     * After calling this, the instance should not be reused. All event listeners are cleared,
     * the _destroyed flag is set (causing in-flight async operations to reject), and internal
     * references are nulled for garbage collection.
     */
    Donkeycraft.InitSequence.prototype.destroy = function() {
        this._destroyed = true;
        if (this._eventBus) {
            this._eventBus.clear();
        }
        this._systems = null;
    };
})();

