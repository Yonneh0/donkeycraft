// Donkeycraft — Initialization Sequence
// Async initialization pipeline: config validation → texture-atlas → indexeddb.
// Each phase runs sequentially, emitting events for progress tracking by LoadingScreen.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * InitSequence — orchestrates async game initialization pipeline.
   * Runs config validation, texture atlas setup, and IndexedDB opening
   * sequentially, emitting events at each phase boundary for LoadingScreen integration.
   * @param {Object} [config] - Donkeycraft.Config object. Defaults to window.Donkeycraft.Config if null.
   */
  Donkeycraft.InitSequence = function (config) {
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
  Donkeycraft.InitSequence.prototype._emit = function (eventName, data) {
    if (this._destroyed || !this._eventBus) return;
    try {
      this._eventBus.emit(eventName, data);
    } catch (e) {
      // Silently skip emission on error to prevent cascading failures
      Donkeycraft.Logger.error(
        'InitSequence',
        'Event emission failed: ' + e.message
      );
    }
  };

  /**
   * _emitProgress — emit a progress update event for fine-grained UI feedback.
   * @private
   * @param {number} percent - Progress percentage (0-100).
   * @param {string} [message] - Optional status message to display.
   */
  Donkeycraft.InitSequence.prototype._emitProgress = function (
    percent,
    message
  ) {
    if (this._destroyed) return;
    try {
      this._eventBus.emit('init:progress', {
        percent: percent,
        message: message || '',
      });
    } catch (e) {
      // Silently skip on error
    }
  };

  /**
   * _emitSubPhase — emit a sub-phase event for granular progress within a phase.
   * @private
   * @param {string} phase - Parent phase name.
   * @param {string} subPhase - Sub-phase identifier.
   * @param {string} message - Display message for this sub-phase.
   * @param {number} [progress] - Optional progress percentage.
   */
  Donkeycraft.InitSequence.prototype._emitSubPhase = function (
    phase,
    subPhase,
    message,
    progress
  ) {
    if (this._destroyed) return;
    try {
      this._eventBus.emit('init:subphase', {
        phase: phase,
        subPhase: subPhase,
        message: message,
        progress: progress,
      });
    } catch (e) {
      // Silently skip on error
    }
  };

  /**
   * _setPhase — update current initialization phase and emit start event.
   * @private
   * @param {string} phase - Phase name identifier.
   */
  Donkeycraft.InitSequence.prototype._setPhase = function (phase) {
    this._currentPhase = phase;
    this._emit('init:phase:start', { phase: phase });
  };

  /**
   * _endPhase — emit phase completion event with the given phase name.
   * @private
   * @param {string} phase - Phase name that completed.
   */
  Donkeycraft.InitSequence.prototype._endPhase = function (phase) {
    this._emit('init:phase:end', { phase: phase });
  };

  /**
   * _storePhaseResult — store a phase result by named key for later retrieval.
   * @private
   * @param {string} phaseName - Phase name to use as the map key.
   * @param {*} result - Result data to store.
   */
  Donkeycraft.InitSequence.prototype._storePhaseResult = function (
    phaseName,
    result
  ) {
    this._phaseResults[phaseName] = result;
  };

  /**
   * _getPhaseResult — retrieve a stored phase result by named key.
   * @private
   * @param {string} phaseName - Phase name to look up.
   * @returns {*} The stored result, or undefined if not found.
   */
  Donkeycraft.InitSequence.prototype._getPhaseResult = function (phaseName) {
    return this._phaseResults[phaseName];
  };

  /**
   * _validateConfig — validate that the configuration object has required numeric fields.
   * Checks all critical config values used by Game, ChunkManager, and Player systems.
   * @private
   * @returns {boolean} True if all required config values are present and valid.
   */
  Donkeycraft.InitSequence.prototype._validateConfig = function () {
    var cfg = this._config;
    if (!cfg) return false;

    // World geometry
    if (typeof cfg.CHUNK_SIZE !== 'number' || cfg.CHUNK_SIZE <= 0) return false;
    if (typeof cfg.WORLD_HEIGHT !== 'number' || cfg.WORLD_HEIGHT <= 0)
      return false;
    if (typeof cfg.RENDER_DISTANCE !== 'number' || cfg.RENDER_DISTANCE <= 0)
      return false;

    // Timing
    if (
      typeof cfg.GAME_TICKS_PER_SECOND !== 'number' ||
      cfg.GAME_TICKS_PER_SECOND <= 0
    )
      return false;

    // Player movement
    if (typeof cfg.PLAYER_SPEED !== 'number' || cfg.PLAYER_SPEED <= 0)
      return false;
    if (typeof cfg.GRAVITY !== 'number') return false;

    // Interaction
    if (typeof cfg.PLAYER_REACH !== 'number' || cfg.PLAYER_REACH <= 0)
      return false;

    // Camera
    if (typeof cfg.FOV !== 'number' || cfg.FOV <= 0 || cfg.FOV >= 180)
      return false;

    return true;
  };

  /**
   * _initTextureAtlas — generate all procedural block textures, register them on a TextureAtlas,
   * build the WebGL texture, and return it.
   * Uses per-texture IndexedDB caching: loads cached textures first, only generates
   * missing ones, then saves new textures back to cache for next load.
   * Emits sub-phase progress events for loading screen integration.
   * @private
   * @returns {Promise<Object>} Resolves with { textures, atlas } when ready.
   */
  Donkeycraft.InitSequence.prototype._initTextureAtlas = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      try {
        // Sub-phase: Terrain textures (sand, snow, ice, lava, bedrock)
        self._emitSubPhase(
          'texture-atlas',
          'terrain-textures',
          'Generating terrain textures...',
          30
        );

        if (
          Donkeycraft.TextureGenerator &&
          typeof Donkeycraft.TextureGenerator.generateAllTexturesAsync === 'function'
        ) {
          // Step 1: Try to load cached textures from IndexedDB first
          var assetCache = null;
          var cachedTexturesLoaded = 0;
          var totalBlocksToLoad = 0;

          // Check if we have an AssetCache available
          if (
            window._dkInitSystems &&
            window._dkInitSystems.assetCache &&
            window._dkInitSystems.assetCache.isReady()
          ) {
            assetCache = window._dkInitSystems.assetCache;
          }

          // If no cache yet, we'll create one after IndexedDB init — but we need textures
          // before that phase completes. So we check if AssetCache is ready now.
          // If not, we'll rely on caching on the NEXT load.
          if (assetCache) {
            // Get block list for cache lookup
            var blocks = Donkeycraft.BlockRegistry
              ? Donkeycraft.BlockRegistry.getAllBlocks()
              : [];

            // Count non-air blocks
            for (var b = 0; b < blocks.length; b++) {
              if (blocks[b].name !== 'air') totalBlocksToLoad++;
            }

            if (totalBlocksToLoad > 0) {
              self._emitSubPhase(
                'texture-atlas',
                'cache-load',
                'Loading cached textures...',
                35
              );

              // Batch-load all cached textures in parallel
              var loadPromises = [];
              for (var bi = 0; bi < blocks.length; bi++) {
                if (blocks[bi].name !== 'air') {
                  loadPromises.push(
                    assetCache.getTexture(blocks[bi].id).then(function (canvas) {
                      if (canvas) cachedTexturesLoaded++;
                      return canvas;
                    })
                  );
                }
              }

              // Wait for all cache loads to complete
              Promise.all(loadPromises).then(function (cachedCanvases) {
                var cachedMap = {};
                var cacheIdx = 0;
                for (var ci = 0; ci < blocks.length; ci++) {
                  if (blocks[ci].name !== 'air') {
                    var cv = cachedCanvases[cacheIdx++];
                    if (cv) {
                      cachedMap[blocks[ci].id] = cv;
                    }
                  }
                }

                self._emitSubPhase(
                  'texture-atlas',
                  'cache-load',
                  'Loaded ' + Object.keys(cachedMap).length + '/' + totalBlocksToLoad + ' cached textures',
                  40
                );

                // Step 2: Generate textures — the async function will use the cache
                // Pass the cached map to skip already-cached textures
                Donkeycraft.TextureGenerator.generateAllTexturesAsync(
                  function (pct, msg) {
                    self._emitSubPhase('texture-atlas', 'block-textures', msg || 'Generating block textures...', pct);
                  },
                  cachedMap  // Pass cached textures to skip regeneration
                ).then(function (result) {
                  var textures = result.textures || {};
                  var totalBlocks = result.totalBlocks || 0;

                  // Merge cached + generated textures (cached ones were passed through)
                  Object.keys(cachedMap).forEach(function (id) {
                    if (!textures[id]) {
                      // Convert canvas to ImageElement for atlas
                      var c = cachedMap[id];
                      var img = new Image();
                      img.src = c.toDataURL('image/png');
                      textures[parseInt(id)] = img;
                    }
                  });

                  // Step 3: Save newly generated textures to cache for next load
                  if (assetCache) {
                    var savePromises = [];
                    for (var sid in textures) {
                      if (textures.hasOwnProperty(sid)) {
                        var tex = textures[sid];
                        if (tex instanceof HTMLImageElement && tex.src) {
                          // Create canvas from image to save
                          var saveCanvas = document.createElement('canvas');
                          saveCanvas.width = 16;
                          saveCanvas.height = 16;
                          var sctx = saveCanvas.getContext('2d');
                          sctx.drawImage(tex, 0, 0);
                          savePromises.push(
                            assetCache.setTexture(saveCanvas, parseInt(sid)).catch(function() {})
                          );
                        }
                      }
                    }
                    // Don't wait for saves — fire and forget
                    Promise.all(savePromises).catch(function() {});
                  }

                  // Wire generated textures into AssetManager so game.js can read them via getAllTextures()
                  if (
                    Donkeycraft.AssetManager &&
                    typeof Donkeycraft.AssetManager.generateAllBlockTextures ===
                      'function'
                  ) {
                    try {
                      var managed =
                        Donkeycraft.AssetManager.generateAllBlockTextures();
                    } catch (e) {
                      Donkeycraft.Logger.warn(
                        'InitSequence',
                        'Failed to wire textures to AssetManager: ' + e.message
                      );
                    }
                  }

                  // Sub-phase: Building WebGL texture atlas
                  self._emitSubPhase(
                    'texture-atlas',
                    'atlas-build',
                    'Building WebGL texture atlas (' + totalBlocks + ' blocks)...',
                    75
                  );

                  // Build a WebGL TextureAtlas from the generated textures if WebGL context is available.
                  var atlas = null;
                  try {
                    var canvas = document.getElementById('dk-canvas');
                    if (canvas && typeof WebGLRenderingContext !== 'undefined') {
                      var gl =
                        canvas.getContext('webgl') ||
                        canvas.getContext('experimental-webgl');
                      if (
                        gl &&
                        Donkeycraft.TextureAtlas &&
                        Donkeycraft.BlockRegistry
                      ) {
                        atlas = new Donkeycraft.TextureAtlas(gl);
                        var blocks2 = Donkeycraft.BlockRegistry.getAllBlocks();
                        var registered = 0;
                        for (var i = 0; i < blocks2.length; i++) {
                          var id = blocks2[i].id;
                          if (textures[id] instanceof HTMLImageElement) {
                            atlas.registerBlockTexture(id, textures[id]);
                            registered++;
                          }
                        }
                        if (atlas.generate()) {
                          // Atlas generated successfully
                        } else {
                          Donkeycraft.Logger.warn(
                            'InitSequence',
                            'TextureAtlas.generate() returned false'
                          );
                          atlas = null;
                        }
                      }
                    }
                  } catch (e) {
                    Donkeycraft.Logger.warn(
                      'InitSequence',
                      'Failed to build TextureAtlas: ' + e.message
                    );
                    atlas = null;
                  }

                  // Final progress update for texture-atlas phase
                  self._emitProgress(90, 'Texture atlas ready');

                  resolve({ textures: textures || {}, atlas: atlas });
                }).catch(function (err) {
                  Donkeycraft.Logger.error(
                    'InitSequence',
                    'Texture generation failed: ' + err.message
                  );
                  resolve({ textures: {}, atlas: null });
                });
              }).catch(function () {
                // Cache load failed — fall through to full generation
                self._emitSubPhase(
                  'texture-atlas',
                  'cache-load',
                  'Cache unavailable — generating all textures',
                  35
                );
                _generateAndBuildAtlas(null);
              });
            } else {
              // No blocks to load — generate normally
              _generateAndBuildAtlas(null);
            }
          } else {
            // No AssetCache available yet — generate without caching (will cache on next load)
            _generateAndBuildAtlas(null);
          }

          // Helper: generate textures and build atlas (used when no cache or cache failed)
          function _generateAndBuildAtlas(cachedMap) {
            Donkeycraft.TextureGenerator.generateAllTexturesAsync(
              function (pct, msg) {
                self._emitSubPhase('texture-atlas', 'block-textures', msg || 'Generating block textures...', pct);
              },
              cachedMap || {}
            ).then(function (result) {
              var textures = result.textures || {};
              var totalBlocks = result.totalBlocks || 0;

              // Wire generated textures into AssetManager
              if (
                Donkeycraft.AssetManager &&
                typeof Donkeycraft.AssetManager.generateAllBlockTextures ===
                  'function'
              ) {
                try {
                  Donkeycraft.AssetManager.generateAllBlockTextures();
                } catch (e) {
                  Donkeycraft.Logger.warn(
                    'InitSequence',
                    'Failed to wire textures to AssetManager: ' + e.message
                  );
                }
              }

              // Sub-phase: Building WebGL texture atlas
              self._emitSubPhase(
                'texture-atlas',
                'atlas-build',
                'Building WebGL texture atlas (' + totalBlocks + ' blocks)...',
                75
              );

              var atlas = null;
              try {
                var canvas = document.getElementById('dk-canvas');
                if (canvas && typeof WebGLRenderingContext !== 'undefined') {
                  var gl =
                    canvas.getContext('webgl') ||
                    canvas.getContext('experimental-webgl');
                  if (
                    gl &&
                    Donkeycraft.TextureAtlas &&
                    Donkeycraft.BlockRegistry
                  ) {
                    atlas = new Donkeycraft.TextureAtlas(gl);
                    var blocks3 = Donkeycraft.BlockRegistry.getAllBlocks();
                    for (var i = 0; i < blocks3.length; i++) {
                      var id = blocks3[i].id;
                      if (textures[id] instanceof HTMLImageElement) {
                        atlas.registerBlockTexture(id, textures[id]);
                      }
                    }
                    if (!atlas.generate()) {
                      Donkeycraft.Logger.warn(
                        'InitSequence',
                        'TextureAtlas.generate() returned false'
                      );
                      atlas = null;
                    }
                  }
                }
              } catch (e) {
                Donkeycraft.Logger.warn(
                  'InitSequence',
                  'Failed to build TextureAtlas: ' + e.message
                );
                atlas = null;
              }

              self._emitProgress(90, 'Texture atlas ready');
              resolve({ textures: textures || {}, atlas: atlas });
            }).catch(function (err) {
              Donkeycraft.Logger.error(
                'InitSequence',
                'Texture generation failed: ' + err.message
              );
              resolve({ textures: {}, atlas: null });
            });
          }
        } else {
          Donkeycraft.Logger.warn(
            'InitSequence',
            'TextureGenerator not available — skipping texture generation'
          );
          resolve({ textures: {}, atlas: null });
        }
      } catch (e) {
        Donkeycraft.Logger.error(
          'InitSequence',
          'Texture atlas init error: ' + e.message
        );
        resolve({ textures: {}, atlas: null });
      }
    });
  };

  /**
   * _seedNoise — seed the PRNGs for terrain generation.
   * Seeds both Donkeycraft._gen (for textures) and Donkeycraft.PerlinNoise (from math-utils.js).
   * @private
   * @returns {boolean} True if seeding succeeded.
   */
  Donkeycraft.InitSequence.prototype._seedNoise = function () {
    try {
      var seed = this._config ? this._config.SEED : 42;
      if (Donkeycraft._gen && Donkeycraft._gen._seedRng) {
        Donkeycraft._gen._seedRng(seed);
      }
      if (Donkeycraft.PerlinNoise && Donkeycraft.PerlinNoise.init) {
        Donkeycraft.PerlinNoise.init(seed);
      }
      return true;
    } catch (e) {
      return false;
    }
  };

  /**
   * _initWorldStore — open IndexedDB connection for world persistence.
   * Creates and initializes a WorldStore instance, returning it in the result object.
   * @private
   * @returns {Promise<Object>} Resolves with { worldStore } when ready.
   */
  Donkeycraft.InitSequence.prototype._initWorldStore = function () {
    var self = this;
    return new Promise(function (resolve) {
      try {
        if (typeof indexedDB === 'undefined') {
          Donkeycraft.Logger.warn(
            'InitSequence',
            'IndexedDB not available — world persistence disabled'
          );
          resolve({}); // Graceful fallback, no world store
          return;
        }

        var worldStore = new Donkeycraft.WorldStore();
        worldStore.setEventBus(self._eventBus);

        worldStore.init().then(function (ok) {
          // Check if destroy was called while waiting for init to complete
          if (self._destroyed) {
            worldStore.destroy();
            resolve({});
            return;
          }
          if (ok && worldStore.isReady()) {
            resolve({ worldStore: worldStore });
          } else {
            Donkeycraft.Logger.warn(
              'InitSequence',
              'WorldStore init failed — world persistence disabled'
            );
            resolve({}); // Graceful fallback
          }
        });
      } catch (e) {
        Donkeycraft.Logger.warn(
          'InitSequence',
          'WorldStore exception: ' + e.message
        );
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
  Donkeycraft.InitSequence.prototype._initAssetCache = function () {
    var self = this;
    return new Promise(function (resolve) {
      try {
        if (typeof indexedDB === 'undefined') {
          Donkeycraft.Logger.warn(
            'InitSequence',
            'IndexedDB not available — asset cache disabled'
          );
          resolve({}); // Graceful fallback, no asset cache
          return;
        }

        var assetCache = new Donkeycraft.AssetCache();

        assetCache.init().then(function (ok) {
          // Check if destroy was called while waiting for init to complete
          if (self._destroyed) {
            assetCache.destroy();
            resolve({});
            return;
          }
          if (ok && assetCache.isReady()) {
            resolve({ assetCache: assetCache });
          } else {
            Donkeycraft.Logger.warn(
              'InitSequence',
              'AssetCache init failed — asset cache disabled'
            );
            resolve({}); // Graceful fallback
          }
        });
      } catch (e) {
        Donkeycraft.Logger.warn(
          'InitSequence',
          'AssetCache exception: ' + e.message
        );
        resolve({}); // Graceful fallback
      }
    });
  };

  /**
   * _initStorage — initialize the hybrid IndexedDB + LRU memory cache (Storage module).
   * Provides chunk-level caching with automatic LRU eviction and batched writes.
   * @private
   * @returns {Promise<Object>} Resolves with { storage } when ready.
   */
  Donkeycraft.InitSequence.prototype._initStorage = function () {
    var self = this;
    return new Promise(function (resolve) {
      try {
        if (!Donkeycraft.Storage) {
          Donkeycraft.Logger.warn(
            'InitSequence',
            'Storage module not available — terrain chunk caching disabled'
          );
          resolve({});
          return;
        }

        var storage = Donkeycraft.Storage;
        storage.init().then(function (ok) {
          // Check if destroy was called while waiting for init to complete
          if (self._destroyed) {
            storage.destroy().catch(function () {});
            resolve({});
            return;
          }
          if (ok) {
            Donkeycraft.Logger.info('InitSequence', 'Storage initialized — terrain chunk caching enabled');
            resolve({ storage: storage });
          } else {
            Donkeycraft.Logger.warn(
              'InitSequence',
              'Storage init failed — terrain chunk caching disabled'
            );
            resolve({}); // Graceful fallback
          }
        });
      } catch (e) {
        Donkeycraft.Logger.warn(
          'InitSequence',
          'Storage exception: ' + e.message
        );
        resolve({}); // Graceful fallback
      }
    });
  };

  /**
   * _initIndexedDB — open IndexedDB connections for world persistence, asset caching, and terrain storage.
   * Runs WorldStore, AssetCache, and Storage initialization in parallel.
   * @private
   * @returns {Promise<Object>} Resolves with { worldStore, assetCache, storage } when ready.
   */
  Donkeycraft.InitSequence.prototype._initIndexedDB = function () {
    var self = this;
    return new Promise(function (resolve) {
      // Run all three initializers in parallel since they don't depend on each other
      var worldPromise = self._initWorldStore();
      var cachePromise = self._initAssetCache();
      var storagePromise = self._initStorage();

      Promise.all([worldPromise, cachePromise, storagePromise]).then(function (results) {
        var worldResult = results[0] || {};
        var cacheResult = results[1] || {};
        var storageResult = results[2] || {};
        resolve({
          worldStore: worldResult.worldStore || null,
          assetCache: cacheResult.assetCache || null,
          storage: storageResult.storage || null,
        });
      });
    });
  };

  /**
   * initialize — run the full async initialization pipeline sequentially.
   * Phases: config → indexeddb → texture-atlas.
   * IndexedDB must open BEFORE texture generation so cached textures can be loaded.
   * Emits 'init:phase:start', 'init:phase:end' per phase, and 'init:complete' on success.
   * If destroy() is called mid-pipeline, the promise rejects with an error.
   * @returns {Promise<Object>} Resolves with systems object containing config and eventBus.
   */
  Donkeycraft.InitSequence.prototype.initialize = function () {
    var self = this;
    var phases = [
      {
        name: 'config',
        fn: function () {
          if (!self._validateConfig()) {
            return Promise.reject(new Error('Invalid configuration'));
          }
          self._setPhase('config');
          self._endPhase('config');
          // Seed noise generators after config phase
          self._seedNoise();
          return Promise.resolve();
        },
      },
      {
        name: 'indexeddb',
        fn: function () {
          self._setPhase('indexeddb');
          return self._initIndexedDB().then(function (result) {
            self._endPhase('indexeddb');
            return result;
          });
        },
      },
      {
        name: 'texture-atlas',
        fn: function () {
          // Store IndexedDB results globally so _initTextureAtlas can access AssetCache
          var idbResult = self._getPhaseResult('indexeddb');
          if (idbResult && idbResult.assetCache) {
            window._dkInitSystems = window._dkInitSystems || {};
            window._dkInitSystems.assetCache = idbResult.assetCache;
          }
          self._setPhase('texture-atlas');
          return self._initTextureAtlas().then(function (result) {
            self._endPhase('texture-atlas');
            return result;
          });
        },
      },
    ];

    // Chain phases sequentially, checking destroy flag between each phase
    var chain = Promise.resolve();
    for (var i = 0; i < phases.length; i++) {
      (function (idx) {
        chain = chain.then(function (prevResult) {
          if (self._destroyed) {
            return Promise.reject(
              new Error(
                'InitSequence destroyed during phase: ' + phases[idx].name
              )
            );
          }
          return phases[idx].fn().then(function (phaseResult) {
            // Store phase results by named key for later retrieval
            self._storePhaseResult(phases[idx].name, phaseResult);
            return prevResult;
          });
        });
      })(i);
    }

    // Collect results on successful completion — merge all phase results
    return chain
      .then(function () {
        self._systems = {
          config: self._config,
          eventBus: self._eventBus,
        };
        // Merge texture-atlas phase results (generated textures + atlas canvas)
        var texResult = self._getPhaseResult('texture-atlas');
        if (texResult && texResult.textures) {
          self._systems.generatedTextures = texResult.textures;
        }
        // Store the WebGL atlas canvas for game.js to reuse (avoids double generation)
        if (texResult && texResult.atlas && texResult.atlas.canvas) {
          self._systems.textureAtlasCanvas = texResult.atlas.canvas;
        }
        // Merge indexedDB phase results (worldStore, assetCache, storage) if available
        var idbResult = self._getPhaseResult('indexeddb');
        if (idbResult) {
          if (idbResult.worldStore) {
            self._systems.worldStore = idbResult.worldStore;
          }
          if (idbResult.assetCache) {
            self._systems.assetCache = idbResult.assetCache;
          }
          if (idbResult.storage) {
            self._systems.storage = idbResult.storage;
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
      })
      .catch(function (err) {
        self._emit('init:error', { error: err, phase: self._currentPhase });
        return Promise.reject(err);
      });
  };

  /**
   * getPhase — return the current or last completed initialization phase name.
   * @returns {string} Phase name (e.g., 'config', 'texture-atlas', 'indexeddb', 'none').
   */
  Donkeycraft.InitSequence.prototype.getPhase = function () {
    return this._currentPhase;
  };

  /**
   * getSystems — return the initialized systems object, or null if initialization hasn't completed.
   * The returned object contains: config, eventBus.
   * @returns {Object|null} Systems object or null.
   */
  Donkeycraft.InitSequence.prototype.getSystems = function () {
    return this._systems;
  };

  /**
   * on — subscribe to initialization lifecycle events.
   * Available events: 'init:phase:start', 'init:phase:end', 'init:complete', 'init:error'.
   * @param {string} eventName - Event name to subscribe to.
   * @param {Function} callback - Callback function receiving event data.
   * @returns {Function} Unsubscribe function that removes the listener when called.
   */
  Donkeycraft.InitSequence.prototype.on = function (eventName, callback) {
    if (!this._eventBus) return function () {};
    return this._eventBus.on(eventName, callback);
  };

  /**
   * destroy — clean up all resources and cancel any in-progress initialization.
   * After calling this, the instance should not be reused. All event listeners are cleared,
   * the _destroyed flag is set (causing in-flight async operations to reject), internal
   * references are nulled for garbage collection, and temporary phase result maps
   * are cleaned up.
   */
  Donkeycraft.InitSequence.prototype.destroy = function () {
    this._destroyed = true;
    if (this._eventBus) {
      this._eventBus.clear();
    }
    // Clean up stored phase results
    this._phaseResults = {};
    this._systems = null;
  };
})();
