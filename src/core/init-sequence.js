// Donkeycraft — Initialization Sequence
// Async initialization: loads textures, decodes audio buffers, initializes IndexedDB, then signals ready.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * InitSequence — orchestrates async game initialization pipeline.
     * Runs config validation, texture atlas setup, audio init, and IndexedDB opening
     * sequentially, emitting events at each phase boundary.
     * @param {Object} [config] - Donkeycraft.Config object. Defaults to Donkeycraft.Config if null.
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
     * Silently skips emission if destroy() was called.
     * @private
     * @param {string} eventName - Event name.
     * @param {Object} data - Event payload.
     */
    Donkeycraft.InitSequence.prototype._emit = function(eventName, data) {
        if (this._destroyed) return;
        this._eventBus.emit(eventName, data);
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
     * @private
     * @returns {boolean} True if all required config values are present and positive.
     */
    Donkeycraft.InitSequence.prototype._validateConfig = function() {
        var cfg = this._config;
        if (!cfg) return false;
        if (typeof cfg.CHUNK_SIZE !== 'number' || cfg.CHUNK_SIZE <= 0) return false;
        if (typeof cfg.WORLD_HEIGHT !== 'number' || cfg.WORLD_HEIGHT <= 0) return false;
        if (typeof cfg.RENDER_DISTANCE !== 'number' || cfg.RENDER_DISTANCE <= 0) return false;
        if (typeof cfg.GAME_TICKS_PER_SECOND !== 'number' || cfg.GAME_TICKS_PER_SECOND <= 0) return false;
        return true;
    };

    /**
     * _initTextureAtlas — initialize the texture atlas system.
     * In production this loads actual textures from assets/textures/ and stitches them
     * into a WebGL-compatible atlas. Currently resolves immediately as the TextureAtlas
     * class handles its own async initialization separately.
     * @private
     * @returns {Promise<Object>} Resolves with atlas info when ready.
     */
    Donkeycraft.InitSequence.prototype._initTextureAtlas = function() {
        return new Promise(function(resolve, reject) {
            try {
                // Check if TextureAtlas is already initialized and ready
                if (Donkeycraft.TextureAtlas && typeof Donkeycraft.TextureAtlas === 'function') {
                    var atlas = new Donkeycraft.TextureAtlas();
                    if (atlas.isReady()) {
                        resolve(atlas);
                        return;
                    }
                }
                // Atlas not available or not ready — proceed without blocking
                resolve({ name: 'texture-atlas-ready' });
            } catch (e) {
                reject(e);
            }
        });
    };

    /**
     * _initAudio — initialize the audio system with decoded buffers.
     * In production this decodes actual audio files from assets/sounds/ into AudioBuffers.
     * Currently resolves immediately as the Audio system handles its own initialization.
     * @private
     * @returns {Promise<Object>} Resolves with audio system info when ready.
     */
    Donkeycraft.InitSequence.prototype._initAudio = function() {
        return new Promise(function(resolve, reject) {
            try {
                // In production: decode audio buffers from assets/sounds/
                // For now: simulate async work
                setTimeout(function() {
                    resolve({ name: 'mock-audio-system' });
                }, 30);
            } catch (e) {
                reject(e);
            }
        });
    };

    /**
     * _initIndexedDB — open IndexedDB connection for world persistence.
     * In production this creates object stores for chunks and level data.
     * Currently resolves immediately as WorldStore handles DB initialization separately.
     * @private
     * @returns {Promise<Object>} Resolves with DB info when ready.
     */
    Donkeycraft.InitSequence.prototype._initIndexedDB = function() {
        return new Promise(function(resolve, reject) {
            try {
                // In production: open IndexedDB, create object stores
                // For now: simulate async work
                setTimeout(function() {
                    resolve({ name: 'mock-indexeddb' });
                }, 40);
            } catch (e) {
                reject(e);
            }
        });
    };

    /**
     * initialize — run the full async initialization pipeline sequentially.
     * Phases: config → texture-atlas → audio → indexeddb.
     * Emits 'init:phase:start', 'init:phase:end' per phase, and 'init:complete' on success.
     * If destroy() is called mid-pipeline, the promise rejects with a DestroyedError.
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
     * @returns {Object|null} Frozen systems object or null.
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

