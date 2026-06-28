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
        this._phaseResults = {}; // Named map for phase results (keyed by phase name)
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
     * _storePhaseResult — store a phase result by named key for later retrieval.
     * @private
     * @param {string} phaseName - Phase name to use as the map key.
     * @param {*} result - Result data to store.
     */
    Donkeycraft.InitSequence.prototype._storePhaseResult = function(phaseName, result) {
        this._phaseResults[phaseName] = result;
    };

    /**
     * _getPhaseResult — retrieve a stored phase result by named key.
     * @private
     * @param {string} phaseName - Phase name to look up.
     * @returns {*} The stored result, or undefined if not found.
     */
    Donkeycraft.InitSequence.prototype._getPhaseResult = function(phaseName) {
        return this._phaseResults[phaseName];
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

        // Camera
        if (typeof cfg.FOV !== 'number' || cfg.FOV <= 0 || cfg.FOV >= 180) return false;

        return true;
    };

    /**
     * _initTextureAtlas — generate all procedural block textures, register them on a TextureAtlas,
     * build the WebGL texture, and return it.
     * @private
     * @returns {Promise<Object>} Resolves with { textures, atlas } when ready.
     */
    Donkeycraft.InitSequence.prototype._initTextureAtlas = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            try {
                if (Donkeycraft.AssetGenerator && typeof Donkeycraft.AssetGenerator.generateAllTextures === 'function') {
                    Donkeycraft.AssetGenerator.generateAllTextures().then(function(textures) {
                        Donkeycraft.Logger.info('InitSequence', 'Procedural textures generated: ' + Object.keys(textures || {}).length + ' textures');

                        // Wire generated textures into AssetManager so game.js can read them via getAllTextures()
                        if (Donkeycraft.AssetManager && typeof Donkeycraft.AssetManager.generateAllBlockTextures === 'function') {
                            try {
                                var managed = Donkeycraft.AssetManager.generateAllBlockTextures();
                                Donkeycraft.Logger.info('InitSequence', 'Textures wired to AssetManager: ' + Object.keys(managed || {}).length + ' textures');
                            } catch (e) {
                                Donkeycraft.Logger.warn('InitSequence', 'Failed to wire textures to AssetManager: ' + e.message);
                            }
                        }

                        // Build a WebGL TextureAtlas from the generated textures if WebGL context is available.
                        var atlas = null;
                        try {
                            var canvas = document.getElementById('dk-canvas');
                            if (canvas && typeof WebGLRenderingContext !== 'undefined') {
                                var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                                if (gl && Donkeycraft.TextureAtlas && Donkeycraft.BlockRegistry) {
                                    atlas = new Donkeycraft.TextureAtlas(gl);
                                    var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
                                    var registered = 0;
                                    for (var i = 0; i < blocks.length; i++) {
                                        var id = blocks[i].id;
                                        if (textures[id] instanceof HTMLImageElement) {
                                            atlas.registerBlockTexture(id, textures[id]);
                                            registered++;
                                        }
                                    }
                                    Donkeycraft.Logger.info('InitSequence', 'Registering ' + registered + ' textures on TextureAtlas');
                                    if (atlas.generate()) {
                                        Donkeycraft.Logger.info('InitSequence', 'TextureAtlas generated successfully — ' + registered + ' blocks');
                                    } else {
                                        Donkeycraft.Logger.warn('InitSequence', 'TextureAtlas.generate() returned false');
                                        atlas = null;
                                    }
                                }
                            }
                        } catch (e) {
                            Donkeycraft.Logger.warn('InitSequence', 'Failed to build TextureAtlas: ' + e.message);
                            atlas = null;
                        }

                        resolve({ textures: textures || {}, atlas: atlas });
                    }).catch(function(err) {
                        Donkeycraft.Logger.error('InitSequence', 'Texture generation failed: ' + err.message);
                        resolve({ textures: {}, atlas: null });
                    });
                } else {
                    Donkeycraft.Logger.warn('InitSequence', 'AssetGenerator not available — skipping texture generation');
                    resolve({ textures: {}, atlas: null });
                }
            } catch (e) {
                Donkeycraft.Logger.error('InitSequence', 'Texture atlas init error: ' + e.message);
                resolve({ textures: {}, atlas: null });
            }
        });
    };

    /**
     * _initAudio — initialize the audio system with decoded buffers.
     * Attempts to create AudioContext and pre-load procedural sounds.
     * @private
     * @returns {Promise<Object>} Resolves with { audioSystem } when ready.
     */
    Donkeycraft.InitSequence.prototype._initAudio = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            try {
                // Initialize PerlinNoise for terrain generation before audio
                if (Donkeycraft.PerlinNoise && Donkeycraft.PerlinNoise.init && !Donkeycraft.PerlinNoise._initialized) {
                    var seed = self._config ? self._config.SEED : 42;
                    Donkeycraft.PerlinNoise.init(seed);
                    Donkeycraft.PerlinNoise._initialized = true;
                    Donkeycraft.Logger.info('InitSequence', 'PerlinNoise initialized with seed: ' + seed);
                }

                if (typeof window.AudioContext === 'undefined' && typeof window.webkitAudioContext === 'undefined') {
                    Donkeycraft.Logger.warn('InitSequence', 'Web Audio API not available — audio disabled');
                    resolve({ perlinNoiseReady: true });
                    return;
                }

                // Create audio system
                var audioSys = new Donkeycraft.AudioSystem();
                audioSys.init().then(function() {
                    Donkeycraft.Logger.info('InitSequence', 'AudioSystem initialized successfully');
                    resolve({ audioSystem: audioSys, perlinNoiseReady: true });
                }).catch(function(err) {
                    Donkeycraft.Logger.warn('InitSequence', 'Audio init failed: ' + err.message);
                    // Still resolve with noise ready so terrain can generate
                    resolve({ perlinNoiseReady: true });
                });
            } catch (e) {
                Donkeycraft.Logger.warn('InitSequence', 'Audio exception: ' + e.message);
                resolve({}); // Graceful fallback
            }
        });
    };

    /**
     * _initWorldStore — open IndexedDB connection for world persistence.
     * Creates and initializes a WorldStore instance, returning it in the result object.
     * @private
     * @returns {Promise<Object>} Resolves with { worldStore } when ready.
     */
    Donkeycraft.InitSequence.prototype._initWorldStore = function() {
        var self = this;
        return new Promise(function(resolve) {
            try {
                if (typeof indexedDB === 'undefined') {
                    Donkeycraft.Logger.warn('InitSequence', 'IndexedDB not available — world persistence disabled');
                    resolve({}); // Graceful fallback, no world store
                    return;
                }

                var worldStore = new Donkeycraft.WorldStore();
                worldStore.setEventBus(self._eventBus);

                worldStore.init().then(function(ok) {
                    if (ok && worldStore.isReady()) {
                        Donkeycraft.Logger.info('InitSequence', 'WorldStore initialized successfully');
                        resolve({ worldStore: worldStore });
                    } else {
                        Donkeycraft.Logger.warn('InitSequence', 'WorldStore init failed — world persistence disabled');
                        resolve({}); // Graceful fallback
                    }
                });
            } catch (e) {
                Donkeycraft.Logger.warn('InitSequence', 'WorldStore exception: ' + e.message);
                resolve({}); // Graceful fallback
            }
        });
    };

    /**
     * _initAssetCache — open IndexedDB connection for asset caching.
     * Creates and initializes an AssetCache instance, returning it in the result object.
     * @private
     * @returns {Promise<Object>} Resolves with { assetCache } when ready.
     */
    Donkeycraft.InitSequence.prototype._initAssetCache = function() {
        var self = this;
        return new Promise(function(resolve) {
            try {
                if (typeof indexedDB === 'undefined') {
                    Donkeycraft.Logger.warn('InitSequence', 'IndexedDB not available — asset cache disabled');
                    resolve({}); // Graceful fallback, no asset cache
                    return;
                }

                var assetCache = new Donkeycraft.AssetCache();

                assetCache.init().then(function(ok) {
                    if (ok && assetCache.isReady()) {
                        Donkeycraft.Logger.info('InitSequence', 'AssetCache initialized successfully');
                        resolve({ assetCache: assetCache });
                    } else {
                        Donkeycraft.Logger.warn('InitSequence', 'AssetCache init failed — asset cache disabled');
                        resolve({}); // Graceful fallback
                    }
                });
            } catch (e) {
                Donkeycraft.Logger.warn('InitSequence', 'AssetCache exception: ' + e.message);
                resolve({}); // Graceful fallback
            }
        });
    };

    /**
     * _initIndexedDB — open IndexedDB connections for world persistence and asset caching.
     * Runs both WorldStore and AssetCache initialization sequentially.
     * @private
     * @returns {Promise<Object>} Resolves with { worldStore, assetCache } when ready.
     */
    Donkeycraft.InitSequence.prototype._initIndexedDB = function() {
        var self = this;
        return new Promise(function(resolve) {
            // Run both initializers in parallel since they don't depend on each other
            var worldPromise = self._initWorldStore();
            var cachePromise = self._initAssetCache();

            Promise.all([worldPromise, cachePromise]).then(function(results) {
                var worldResult = results[0] || {};
                var cacheResult = results[1] || {};
                resolve({
                    worldStore: worldResult.worldStore || null,
                    assetCache: cacheResult.assetCache || null
                });
            });
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
            (function(idx) {
                chain = chain.then(function(prevResult) {
                    if (self._destroyed) {
                        return Promise.reject(new Error('InitSequence destroyed during phase: ' + phases[idx].name));
                    }
                    return phases[idx].fn().then(function(phaseResult) {
                        // Store phase results by named key for later retrieval
                        self._storePhaseResult(phases[idx].name, phaseResult);
                        return prevResult;
                    });
                });
            })(i);
        }

        // Collect results on successful completion — merge all phase results
        return chain.then(function() {
            self._systems = {
                config: self._config,
                eventBus: self._eventBus
            };
            // Merge texture-atlas phase results (generated textures)
            var texResult = self._getPhaseResult('texture-atlas');
            if (texResult && texResult.textures) {
                self._systems.generatedTextures = texResult.textures;
            }
            // Merge audio phase results (audioSystem, perlinNoiseReady)
            var audioResult = self._getPhaseResult('audio');
            if (audioResult) {
                if (audioResult.audioSystem) {
                    self._systems.audioSystem = audioResult.audioSystem;
                }
                if (audioResult.perlinNoiseReady) {
                    self._systems.perlinNoiseReady = true;
                }
            }
            // Merge indexedDB phase results (worldStore, assetCache) if available
            var idbResult = self._getPhaseResult('indexeddb');
            if (idbResult) {
                if (idbResult.worldStore) {
                    self._systems.worldStore = idbResult.worldStore;
                }
                if (idbResult.assetCache) {
                    self._systems.assetCache = idbResult.assetCache;
                }
            }
            // Clean up stored phase results
            for (var k in self._phaseResults) {
                if (Object.prototype.hasOwnProperty.call(self._phaseResults, k)) {
                    delete self._phaseResults[k];
                }
            }
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
     * the _destroyed flag is set (causing in-flight async operations to reject), internal
     * references are nulled for garbage collection, and temporary phase result maps
     * are cleaned up.
     */
    Donkeycraft.InitSequence.prototype.destroy = function() {
        this._destroyed = true;
        if (this._eventBus) {
            this._eventBus.clear();
        }
        // Clean up stored phase results
        this._phaseResults = {};
        this._systems = null;
    };
})();

