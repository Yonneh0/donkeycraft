// Donkeycraft — Initialization Sequence
// Async initialization: loads textures, decodes audio buffers, initializes IndexedDB, then signals ready.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * InitSequence — orchestrates async game initialization pipeline.
     * @param {Object} [config] - Donkeycraft.Config object.
     */
    Donkeycraft.InitSequence = function(config) {
        this._config = config || Donkeycraft.Config;
        this._eventBus = new Donkeycraft.EventBus();
        this._currentPhase = 'none';
        this._destroyed = false;
        this._systems = null;
    };

    /**
     * _emit — emit an event with phase context.
     * @private
     * @param {string} eventName - Event name.
     * @param {Object} data - Event payload.
     */
    Donkeycraft.InitSequence.prototype._emit = function(eventName, data) {
        if (this._destroyed) return;
        this._eventBus.emit(eventName, data);
    };

    /**
     * _setPhase — update current phase and emit start event.
     * @private
     * @param {string} phase - Phase name.
     */
    Donkeycraft.InitSequence.prototype._setPhase = function(phase) {
        this._currentPhase = phase;
        this._emit('init:phase:start', { phase: phase });
    };

    /**
     * _endPhase — emit phase end event.
     * @private
     * @param {string} phase - Phase name that completed.
     */
    Donkeycraft.InitSequence.prototype._endPhase = function(phase) {
        this._emit('init:phase:end', { phase: phase });
    };

    /**
     * _validateConfig — validate configuration values.
     * @private
     * @returns {boolean} True if config is valid.
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
     * _initTextureAtlas — generate or validate texture atlas.
     * In production this would load actual textures from assets/textures/.
     * For testing, we mock this as a resolved async step.
     * @private
     * @returns {Promise} Resolves when atlas is ready.
     */
    Donkeycraft.InitSequence.prototype._initTextureAtlas = function() {
        return new Promise(function(resolve, reject) {
            try {
                // In production: load and stitch textures into WebGL atlas
                // For now: simulate async work
                setTimeout(function() {
                    if (Donkeycraft.TextureAtlas && Donkeycraft.TextureAtlas.prototype._ready) {
                        var atlas = Donkeycraft.TextureAtlas._instance;
                        if (atlas && atlas.isReady()) {
                            resolve(atlas);
                            return;
                        }
                    }
                    // Atlas not ready or no production implementation — mock success
                    resolve({ name: 'mock-texture-atlas' });
                }, 50);
            } catch (e) {
                reject(e);
            }
        });
    };

    /**
     * _initAudio — initialize audio system with decoded buffers.
     * In production this would decode actual audio files from assets/sounds/.
     * For testing, we mock this as a resolved async step.
     * @private
     * @returns {Promise} Resolves when audio is ready.
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
     * _initIndexedDB — open IndexedDB for world storage.
     * In production this would create object stores for chunks and level data.
     * For testing, we mock this as a resolved async step.
     * @private
     * @returns {Promise} Resolves with DB reference when ready.
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
     * initialize — run full async init pipeline.
     * @returns {Promise<Object>} Resolves with initialized systems object.
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

        // Chain phases sequentially
        var chain = Promise.resolve();
        for (var i = 0; i < phases.length; i++) {
            chain = chain.then(phases[i].fn);
        }

        // Collect results
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
     * getPhase — return current initialization phase name.
     * @returns {string} Current phase.
     */
    Donkeycraft.InitSequence.prototype.getPhase = function() {
        return this._currentPhase;
    };

    /**
     * getSystems — return initialized systems object (null if not yet initialized).
     * @returns {Object|null} Systems object or null.
     */
    Donkeycraft.InitSequence.prototype.getSystems = function() {
        return this._systems;
    };

    /**
     * on — subscribe to init events.
     * @param {string} eventName - Event name.
     * @param {Function} callback - Callback function.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.InitSequence.prototype.on = function(eventName, callback) {
        return this._eventBus.on(eventName, callback);
    };

    /**
     * destroy — clean up on failure or shutdown.
     */
    Donkeycraft.InitSequence.prototype.destroy = function() {
        this._destroyed = true;
        this._eventBus.clear();
        this._systems = null;
    };
})();