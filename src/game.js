// Donkeycraft — Main Game Class
// Main game class: initialization, main loop (update + render), pause/resume.
// Orchestrates all subsystems including WebGL rendering, player physics, chunk management, and GUI.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Game — orchestrates all subsystems into a cohesive game loop.
     * @param {Object} [options] - Configuration options.
     * @param {number} [options.renderDistance] - Override render distance (uses Config.RENDER_DISTANCE if null).
     * @param {string} [options.gameMode] - Starting game mode ('survival', 'creative', 'spectator').
     */
    Donkeycraft.Game = function (options) {
        options = options || {};

        this._renderDistance = options.renderDistance || Config.RENDER_DISTANCE;
        this._gameMode = options.gameMode || 'survival';

        // Time-of-day state for creative mode freezing
        this._frozenTimeOfDay = null;

        // Core WebGL systems
        this._canvas = null;
        this._gl = null;
        this._glContext = null;
        this._shaderManager = null;

        // Rendering subsystems (initialized in init())
        this._camera = null;
        this._terrainRenderer = null;
        this._fog = null;
        this._sky = null;
        this._lighting = null;
        this._handRenderer = null;
        this._breakParticles = null;
        this._guiRenderer = null;
        this._weather = null;
        this._weatherRenderer = null;

        // Texture atlas (generated from AssetManager textures)
        this._textureAtlas = null;

        // Audio context (shared with init-sequence AudioSystem)
        this._audioContext = null;

        // Hunger system for HUD rendering (set by setSystems())
        this._hungerSystem = null;

        // Game systems (initialized in init())
        this._timer = null;
        this._input = null;
        this._player = null;
        this._chunkManager = null;
        this._eventBus = null;
        this._redstoneEngine = null;

        // Movement/collision subsystems (set by setSystems())
        this._movementSystem = null;
        this._collisionSystem = null;
        this._jumpSystem = null;
        this._flyingSystem = null;
        this._raycastSystem = null;
        this._blockActionSystem = null;
        this._blockPlacementSystem = null;
        this._interactableBlocksSystem = null;

        // Game state
        this._running = false;
        this._paused = false;
        this._pointerLocked = false;

        // Camera-player sync
        this._cameraSyncEnabled = true;

        // Chunk update tracking
        this._lastPlayerChunkX = null;
        this._lastPlayerChunkZ = null;

        // Unsubscribe functions for cleanup
        this._unsubscribeTick = null;
        this._unsubscribeRender = null;

        // Overlay DOM element (for pointer lock)
        this._overlay = null;

        // Hotbar UI reference (set externally after init)
        this._hotbar = null;

        // Debug overlay toggle state (F3)
        this._debugVisible = false;

        // Renderer visibility toggles (debug menu)
        this._renderSky = true;
        this._renderTerrain = true;
        this._renderParticles = true;
        this._renderHand = true;
        this._renderWeather = true;
        this._renderGUI = true;
        this._renderEntity = true;

        // GuiManager reference for GUI screen management (set externally after init)
        this._guiManager = null;

        // Level data for persistence (set via setLevelData())
        this._levelData = null;

        // Auto-save system state
        this._autoSaveTimer = 0;
        this._worldStore = null;

        // Interaction cooldown tracking (prevents rapid block break/place)
        this._lastInteractionTime = 0;
        this._INTERACTION_COOLDOWN_MS = 60; // Minimum ms between interactions — responsive gameplay

        // One-time chunk force-load flag (breaks render-before-tick deadlock on first frame)
        this._chunkForceLoaded = false;

        // Player hitbox dimensions (from Config)
        this._playerWidth = Config.PLAYER_WIDTH;
        this._playerHeight = Config.PLAYER_HEIGHT;

        // Entity system references (set via setEntitySystems())
        this._entityEngine = null;
        this._entityManager = null;
        this._entityRenderer = null;
    };

    /**
     * Initialize all subsystems and prepare for the game loop.
     * @returns {boolean} True if initialization succeeded.
     */
    Donkeycraft.Game.prototype.init = function () {
        try {
            // Get canvas element
            this._canvas = document.getElementById('dk-canvas');
            if (!this._canvas) {
                Donkeycraft.Logger.error('Game', 'Canvas element #dk-canvas not found');
                return false;
            }

            // Create WebGL context
            this._glContext = new Donkeycraft.GLContext(this._canvas);
            if (!this._glContext.isValid()) {
                Donkeycraft.Logger.error('Game', 'WebGL context creation failed');
                return false;
            }

            this._gl = this._glContext.getGL();
            if (!this._gl) {
                Donkeycraft.Logger.error('Game', 'WebGL context is null');
                return false;
            }

            // Create shader manager
            this._shaderManager = new Donkeycraft.ShaderManager(this._gl);

            // Compile shader programs from embedded script tags
            this._compileShaderPrograms();

            // Initialize canvas size to window dimensions before creating other systems
            this._resizeCanvas();

            // Create camera
            this._camera = new Donkeycraft.Camera(Config.FOV, 0.1, 1000);
            this._camera.setAspect(this._canvas.width / this._canvas.height);

            // Create fog
            this._fog = new Donkeycraft.Fog();

            // Create sky renderer
            this._sky = new Donkeycraft.Sky(this._gl, this._shaderManager);

            // Create lighting system
            this._lighting = new Donkeycraft.Lighting();

            // Web Audio Context is created during init-sequence.js pipeline.
            // Access it via the global systems object if available, otherwise
            // create a fallback context for AssetManager (sounds will still work).
            try {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    // Use existing context from init-sequence if available, otherwise create new one.
                    // The init-sequence creates an AudioSystem with its own context — we reuse it.
                    this._audioContext = null;
                    if (window._dkInitSystems && window._dkInitSystems.audioSystem && window._dkInitSystems.audioSystem._context) {
                        this._audioContext = window._dkInitSystems.audioSystem._context;
                    } else {
                        this._audioContext = new AudioContext();
                    }
                    Donkeycraft.AssetManager.init(this._audioContext);
                }
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Web Audio API not available: ' + e.message);
            }

            // ============================================================
            // Create and upload the texture atlas from generated textures.
            // The init-sequence already called AssetGenerator.generateAllTextures()
            // and stored results in AssetManager — retrieve them here.
            // ============================================================
            this._textureAtlas = null;
            try {
                var generatedTex = Donkeycraft.AssetManager ? Donkeycraft.AssetManager.getAllTextures() : null;
                if (generatedTex && Object.keys(generatedTex).length > 0) {
                    // Register each generated texture on the atlas
                    var atlas = new Donkeycraft.TextureAtlas(this._gl);
                    var blocks = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getAllBlocks() : [];
                    for (var _i = 0; _i < blocks.length; _i++) {
                        var _b = blocks[_i];
                        if (generatedTex[_b.id]) {
                            atlas.registerBlockTexture(_b.id, generatedTex[_b.id]);
                        }
                    }
                    if (atlas.generate()) {
                        this._textureAtlas = atlas;
                    } else {
                        Donkeycraft.Logger.warn('Game', 'Texture atlas generation failed — will use placeholder');
                    }
                } else {
                    Donkeycraft.Logger.warn('Game', 'No generated textures found in AssetManager — will use placeholder');
                }
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Texture atlas creation failed: ' + e.message);
            }

            // Create terrain renderer (pass lighting for dynamic time-of-day)
            this._terrainRenderer = new Donkeycraft.TerrainRenderer(
                this._gl, this._shaderManager, this._fog, this._lighting
            );

            // Wire the texture atlas onto the terrain renderer so it binds the correct texture
            if (this._textureAtlas && this._terrainRenderer.setTextureAtlas) {
                this._terrainRenderer.setTextureAtlas(this._textureAtlas);
            }
            this._terrainRenderer.setRenderDistance(this._renderDistance);

            // Wire camera reference into terrain renderer for back-face culling optimization.
            this._terrainRenderer.setCamera(this._camera);

            // Create hand renderer
            this._handRenderer = new Donkeycraft.HandRenderer(this._gl, this._shaderManager);

            // Create break particles system
            this._breakParticles = new Donkeycraft.BreakParticles(this._gl, this._shaderManager);

            // Create GUI renderer
            this._guiRenderer = new Donkeycraft.GUIRenderer(this._gl, this._shaderManager);


            // Create weather state manager and weather renderer
            if (Donkeycraft.Weather) {
                this._weather = new Donkeycraft.Weather();
            }
            if (Donkeycraft.WeatherRenderer) {
                this._weatherRenderer = new Donkeycraft.WeatherRenderer(this._gl, this._shaderManager);
            }

            // Create player entity
            this._player = new Donkeycraft.Player({
                gameMode: this._gameMode
            });

            // Create chunk manager via the dimension system so terrain generation
            // callbacks (onChunkLoad) are wired up automatically.  This ensures
            // overworld chunks get heightmap/ore/cave/water/surface terrain and
            // nether/end chunks get their own generators.
            this._chunkManager = Donkeycraft.Dimensions.getCurrentChunkManager({
                renderDistance: this._renderDistance
            });

            // Set up world data access for terrain renderer
            var self = this;
            this._terrainRenderer.setWorldData(function (wx, wy, wz) {
                return self._getBlockAt(wx, wy, wz);
            });

            // Wire chunk unload callback (terrain renderer needs dirty marks).
            // Do NOT overwrite onChunkLoad — dimension.js already wires terrain generation there.
            var cm = this._chunkManager;
            var existingUnload = cm.onChunkUnload;
            cm.onChunkUnload = function (chunk) {
                if (existingUnload) existingUnload(chunk);
                self._terrainRenderer.markChunkDirty(chunk.chunkX, chunk.chunkZ);
            };

            // Wire dirty-chunk callback to notify terrain renderer
            var existingChanged = cm.onChunksChanged;
            cm.onChunksChanged = function () {
                if (existingChanged) existingChanged();
                var dirty = cm.getDirtyChunks();
                for (var _i = 0; _i < dirty.length; _i++) {
                    self._terrainRenderer.markChunkDirty(dirty[_i].chunk.chunkX, dirty[_i].chunk.chunkZ);
                }
            };

            // ============================================================
            // Exhaustive land spawn search — always finds valid land position.
            // Uses Player.findLandSpawnPosition() which performs an unlimited
            // spiral search outward from (0, 0) until flat solid ground near
            // water level is found (never on cliffs, mountains, or water).
            // ============================================================

            // First, generate terrain around the default spawn area so the
            // finder has data to work with. We generate a larger radius to
            // ensure chunks are populated before searching.
            var initSpawnCX = Math.floor(0.5 / Config.CHUNK_SIZE); // = 0
            var initSpawnCZ = Math.floor(0.5 / Config.CHUNK_SIZE); // = 0
            var initRadius = 2; // Generate a 5x5 chunk area around spawn

            try {
                for (var ix = -initRadius; ix <= initRadius; ix++) {
                    for (var iz = -initRadius; iz <= initRadius; iz++) {
                        var genCX = initSpawnCX + ix;
                        var genCZ = initSpawnCZ + iz;
                        // getChunk auto-generates if needed, but call explicitly
                        this._chunkManager.getChunk(genCX, genCZ);
                    }
                }
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Initial chunk generation had errors: ' + e.message);
            }

            // Run the exhaustive land spawn finder.
            // This will spiral-search unlimited chunks until valid land is found,
            // handling cases like a 5x5 ocean where the center has no land.
            var spawnOptions = {
                maxY: 80,           // Near water level — excludes mountains
                flatRadius: 3,      // Surface must be flat within ±1 Y over a 7x7 area
                slopeLimit: 3       // No cliff/mountain slopes steeper than 3 blocks
            };

            var spawnPos = Donkeycraft.Player.findLandSpawnPosition(
                this._chunkManager,
                0.5,    // Starting world X
                0.5,    // Starting world Z
                spawnOptions
            );

            // If the exhaustive finder found land, use it.
            // Otherwise fall back to a safe default position.
            if (spawnPos && spawnPos.y > 0) {
                Donkeycraft.Logger.info('Game', 'Spawn found at (' + spawnPos.x + ', ' + spawnPos.y + ', ' + spawnPos.z + ')');
                this._player.setPosition(spawnPos.x, spawnPos.y, spawnPos.z);
                this._camera.setPosition(spawnPos.x, spawnPos.y + Config.PLAYER_EYE_HEIGHT, spawnPos.z);

                // Also record the spawn point in LevelData if available
                if (this._levelData) {
                    this._levelData.setSpawn(spawnPos.x, spawnPos.y, spawnPos.z);
                }
            } else {
                // Fallback: generate terrain and find highest solid at (0.5, 0.5)
                Donkeycraft.Logger.warn('Game', 'No land found by exhaustive search — using fallback spawn');
                var fallbackY = Config.WORLD_HEIGHT - 10;
                var fallbackChunk = this._chunkManager.getChunk(initSpawnCX, initSpawnCZ);
                if (fallbackChunk) {
                    for (var fy = Config.WORLD_HEIGHT - 1; fy >= 0; fy--) {
                        var fb = fallbackChunk.getBlock(0, fy, 0);
                        if (fb && Donkeycraft.BlockTypes && Donkeycraft.BlockTypes.isSolid(fb)) {
                            fallbackY = fy + 2;
                            break;
                        }
                    }
                }
                fallbackY = Math.max(1, Math.min(fallbackY, Config.WORLD_HEIGHT - 1));
                this._player.setPosition(0.5, fallbackY, 0.5);
                this._camera.setPosition(0.5, fallbackY + Config.PLAYER_EYE_HEIGHT, 0.5);
            }

            // CRITICAL: Set velocity Y to 0 on spawn to prevent player from falling through the map.
            // The first physics tick would otherwise apply gravity before collision can resolve.
            this._player.setVelocity(0, 0, 0);

            // Initialize timer
            this._timer = new Donkeycraft.Timer(Config.GAME_TICKS_PER_SECOND);

            // Initialize input handler
            this._input = new Donkeycraft.Input();

            // Create event bus and register as global for emitSafe()
            this._eventBus = new Donkeycraft.EventBus();
            Donkeycraft.EventBus.setGlobal(this._eventBus);

            // Initialize world generation subsystems (must happen before first chunk load)
            if (Donkeycraft.Physics && Donkeycraft.Physics.init) {
                Donkeycraft.Physics.init();
            }
            if (Donkeycraft.LightingEngine && Donkeycraft.LightingEngine.init) {
                Donkeycraft.LightingEngine.init();
            }
            if (Donkeycraft.OreGenerator && Donkeycraft.OreGenerator.init) {
                Donkeycraft.OreGenerator.init();
            }

            // Initialize portal system with chunk manager reference and dimension type
            if (Donkeycraft.Portal && Donkeycraft.Portal.init) {
                var currentDim = Donkeycraft.Dimensions ? Donkeycraft.Dimensions.getCurrentDimension() : 0;
                var dimChunkManager = Donkeycraft.Dimensions.getChunkManagerForDimension(currentDim);
                Donkeycraft.Portal.init(this._eventBus, dimChunkManager || this._chunkManager, currentDim);
            }

            return true;

        } catch (e) {
            Donkeycraft.Logger.error('Game', 'Initialization failed: ' + e.message);
            return false;
        }
    };

    /**
     * setWorldStore — set the world store for auto-save persistence.
     * Also wires the chunk manager reference so saveDirtyChunks() can access dirty chunks.
     * @param {Donkeycraft.WorldStore} worldStore — WorldStore instance.
     */
    Donkeycraft.Game.prototype.setWorldStore = function (worldStore) {
        this._worldStore = worldStore;
        // Wire chunk manager reference for saveDirtyChunks()
        if (worldStore && worldStore.setChunkManager && this._chunkManager) {
            worldStore.setChunkManager(this._chunkManager);
        }
    };

    /**
     * setLevelData — set the LevelData instance for player state persistence.
     * Also activates periodic auto-save using WorldStore if available.
     * @param {Donkeycraft.LevelData} levelData — LevelData instance.
     * @param {string} [worldName=default] — World name for auto-save targeting.
     */
    Donkeycraft.Game.prototype.setLevelData = function (levelData, worldName) {
        this._levelData = levelData || null;
        // Activate periodic auto-save if LevelData and WorldStore are both available
        if (levelData && this._worldStore && worldName) {
            try {
                var intervalMs = Donkeycraft.Config && Donkeycraft.Config.LEVEL_DATA_AUTO_SAVE_INTERVAL
                    ? Donkeycraft.Config.LEVEL_DATA_AUTO_SAVE_INTERVAL
                    : Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL;
                levelData.startAutoSave(this._worldStore, worldName, intervalMs);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Failed to start LevelData auto-save: ' + e.message);
            }
        }
    };

    /**
     * setHotbar — set the hotbar UI reference for key-based slot selection.
     * @param {Donkeycraft.Hotbar} hotbar - Hotbar instance.
     */
    Donkeycraft.Game.prototype.setHotbar = function (hotbar) {
        this._hotbar = hotbar || null;
    };

    /**
     * setGuiManager — set the GUI manager for screen management.
     * @param {Donkeycraft.GuiManager} guiManager - GuiManager instance.
     */
    Donkeycraft.Game.prototype.setGuiManager = function (guiManager) {
        this._guiManager = guiManager || null;
    };

    /**
     * setEntitySystems — wire up the entity engine, manager, and renderer.
     * Also spawns example entities near the player for proof-of-concept testing.
     * @param {Donkeycraft.EntityEngine} entityEngine - Animation & kinematics engine.
     * @param {Donkeycraft.EntityManager} entityManager - Entity lifecycle manager.
     * @param {Donkeycraft.EntityRenderer} entityRenderer - Standalone entity renderer.
     */
    Donkeycraft.Game.prototype.setEntitySystems = function (entityEngine, entityManager, entityRenderer) {
        this._entityEngine = entityEngine || null;
        this._entityManager = entityManager || null;
        this._entityRenderer = entityRenderer || null;

        // Wire entity engine to use the game's timer for tick updates
        if (this._entityEngine && this._timer) {
            try {
                this._entityEngine.setTimer(this._timer);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Failed to wire timer to entity engine: ' + e.message);
            }
        }

        // Wire entity renderer to use the game's WebGL context and shader manager
        if (this._entityRenderer && this._gl && this._shaderManager) {
            try {
                this._entityRenderer.setGL(this._gl);
                this._entityRenderer.setShaderManager(this._shaderManager);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Failed to wire WebGL to entity renderer: ' + e.message);
            }
        }

        // Wire entity renderer to use the EntityEngine's internal EntityManager for awareness queries.
        // The EntityEngine owns its own EntityManager instance (separate from game._entityManager),
        // and entities are spawned into that manager via EntityEngine.spawn().
        if (this._entityRenderer && this._entityEngine) {
            try {
                var engineEntityManager = this._entityEngine.getEntityManager();
                if (engineEntityManager) {
                    this._entityRenderer.setEntityManager(engineEntityManager);
                } else {
                    Donkeycraft.Logger.warn('Game', 'EntityEngine.getEntityManager() returned null — renderer will not see any entities.');
                }
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Failed to wire EntityManager to entity renderer: ' + e.message);
            }
        }

        // Wire entity renderer to use the camera for frustum culling
        if (this._entityRenderer && this._camera) {
            try {
                this._entityRenderer.setCamera(this._camera);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Failed to wire camera to entity renderer: ' + e.message);
            }
        }

        // Sync render distance from entity engine to renderer
        if (this._entityEngine && this._entityRenderer) {
            try {
                this._entityRenderer.setRenderDistance(this._entityEngine.renderDistance || 16);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Failed to sync render distance: ' + e.message);
            }
        }

        // Wire block query callback for AI navigation
        if (this._entityEngine) {
            try {
                this._entityEngine.setBlockQuery(function (wx, wy, wz) {
                    return self._getBlockAt(Math.floor(wx), Math.floor(wy), Math.floor(wz));
                });
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Failed to wire block query to entity engine: ' + e.message);
            }
        }

        // Wire player entity for AI targeting
        if (this._entityEngine && this._player) {
            try {
                this._entityEngine.setPlayerEntity(this._player);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Failed to wire player entity: ' + e.message);
            }
        }

        // Note: Example entities are now spawned automatically by EntityEngine
        // after a 2-second delay, triggered during the tick loop.
    };

    /**
     * toggleDebugOverlay — toggles the F3 debug overlay visibility using CSS class.
     * @returns {boolean} True if debug is now visible.
     */
    Donkeycraft.Game.prototype.toggleDebugOverlay = function () {
        this._debugVisible = !this._debugVisible;
        var overlay = document.getElementById('dk-debug-overlay');
        if (overlay) {
            overlay.classList.toggle('visible', this._debugVisible);
        }
        return this._debugVisible;
    };

    /**
     * isDebugVisible — checks if debug overlay is currently visible.
     * @returns {boolean}
     */
    Donkeycraft.Game.prototype.isDebugVisible = function () {
        return this._debugVisible;
    };

    /**
     * getRendererVisibility — get a renderer toggle state.
     * @param {string} name - Renderer name ('sky'|'terrain'|'particles'|'hand'|'weather'|'gui').
     * @returns {boolean}
     */
    Donkeycraft.Game.prototype.getRendererVisibility = function (name) {
        var map = this._getRendererMap();
        return this[map[name]] !== false;
    };

    /**
     * setRendererVisibility — set a renderer toggle state.
     * @param {string} name - Renderer name.
     * @param {boolean} visible - Whether the renderer is visible.
     */
    Donkeycraft.Game.prototype.setRendererVisibility = function (name, visible) {
        var map = this._getRendererMap();
        if (map[name]) this[map[name]] = !!visible;
    };

    /**
     * _getRendererMap — internal helper to get the name-to-property map.
     * @returns {Object}
     * @private
     */
    Donkeycraft.Game.prototype._getRendererMap = function () {
        return {
            'sky': '_renderSky', 'terrain': '_renderTerrain',
            'particles': '_renderParticles', 'hand': '_renderHand',
            'weather': '_renderWeather', 'gui': '_renderGUI',
            'entity': '_renderEntity'
        };
    };

    // _spawnExampleEntities removed — now handled by EntityEngine._spawnExamples()
    // which auto-spawns after 2 seconds during the tick loop.

    /**
     * setSystems — set external system references (called after Game.init()).
     * Also accepts optional HurtBox and Hunger constructor functions that will be instantiated
     * using the player, chunkManager, and input created during Game.init().
     * @param {Function|Object} movementSystem - Movement physics system.
     * @param {Function|Object} collisionSystem - Collision detection system.
     * @param {Function|Object} jumpSystem - Jump mechanics system.
     * @param {Function|Object} flyingSystem - Flying mechanics system.
     * @param {Object} raycastSystem - Raycasting system (static module).
     * @param {Object} blockActionSystem - Block breaking system (static module).
     * @param {Object} blockPlacementSystem - Block placement system (static module).
     * @param {Object} interactableBlocksSystem - Interactable blocks system (static module).
     * @param {Object} [redstoneEngine] - Redstone engine instance (optional).
     * @param {Function} [hurtBoxConstructor] - HurtBox constructor function (optional).
     * @param {Function} [hungerConstructor] - Hunger system constructor function (optional).
     * @returns {boolean} True if all systems were set successfully.
     */
    Donkeycraft.Game.prototype.setSystems = function (
        movementSystem, collisionSystem, jumpSystem, flyingSystem,
        raycastSystem, blockActionSystem, blockPlacementSystem, interactableBlocksSystem,
        redstoneEngine, hurtBoxConstructor, hungerConstructor
    ) {
        var self = this;

        // Validate required systems exist before instantiation
        if (!this._chunkManager) {
            Donkeycraft.Logger.warn('Game', 'setSystems called before init: chunkManager not available');
            return false;
        }
        if (!this._player) {
            Donkeycraft.Logger.warn('Game', 'setSystems called before init: player not available');
            return false;
        }
        if (!this._input) {
            Donkeycraft.Logger.warn('Game', 'setSystems called before init: input not available');
            return false;
        }

        // Instantiate Collision first (so Movement/Jump can reference it)
        if (collisionSystem && typeof collisionSystem === 'function') {
            try {
                this._collisionSystem = new collisionSystem(this._chunkManager);
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Collision instantiation failed: ' + e.message);
                this._collisionSystem = null;
            }
        } else if (collisionSystem) {
            this._collisionSystem = collisionSystem;
        } else {
            Donkeycraft.Logger.warn('Game', 'No collision system provided');
        }

        // Instantiate Movement if passed as a constructor (needs input, player, collision, chunkManager)
        if (movementSystem && typeof movementSystem === 'function') {
            try {
                this._movementSystem = new movementSystem(
                    this._input,
                    this._player,
                    this._collisionSystem || null,
                    this._chunkManager
                );
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Movement instantiation failed: ' + e.message);
                this._movementSystem = null;
            }
        } else if (movementSystem) {
            this._movementSystem = movementSystem;
        } else {
            Donkeycraft.Logger.warn('Game', 'No movement system provided');
        }

        // Wire up Movement reference into Flying system for input-based speed queries
        if (this._flyingSystem && this._movementSystem) {
            // Flying already has its own input reference — no additional wiring needed
        }

        // Instantiate Jumping if passed as a constructor (needs player, input)
        // Note: Swimming upward is handled by Movement._tickSurvival() to avoid double-boost with jump mechanics.
        if (jumpSystem && typeof jumpSystem === 'function') {
            try {
                this._jumpSystem = new jumpSystem(
                    this._player,
                    this._input
                );
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Jump instantiation failed: ' + e.message);
                this._jumpSystem = null;
            }
        } else if (jumpSystem) {
            this._jumpSystem = jumpSystem;
        } else {
            Donkeycraft.Logger.warn('Game', 'No jump system provided');
        }

        // Instantiate Flying if passed as a constructor (needs player, input)
        if (flyingSystem && typeof flyingSystem === 'function') {
            try {
                this._flyingSystem = new flyingSystem(
                    this._player,
                    this._input
                );
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Flying instantiation failed: ' + e.message);
                this._flyingSystem = null;
            }
        } else if (flyingSystem) {
            this._flyingSystem = flyingSystem;
        } else {
            Donkeycraft.Logger.warn('Game', 'No flying system provided');
        }

        // Raycast, BlockAction, BlockPlacement, InteractableBlocks are static modules — assign directly
        this._raycastSystem = raycastSystem;
        this._blockActionSystem = blockActionSystem;
        this._blockPlacementSystem = blockPlacementSystem;
        this._interactableBlocksSystem = interactableBlocksSystem;

        // Instantiate Hunger system (player is the single source of truth for vitals — HurtBox deprecated)
        if (hungerConstructor && typeof hungerConstructor === 'function') {
            try {
                this._hungerSystem = new hungerConstructor(this._player);
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Hunger instantiation failed: ' + e.message);
                this._hungerSystem = null;
            }
        } else if (hungerConstructor) {
            this._hungerSystem = hungerConstructor;
        }

        // Assign redstone engine if provided
        if (redstoneEngine) {
            this._redstoneEngine = redstoneEngine;
        }

        // ============================================================
        // Redstone subsystem wiring: connect all subsystems to the engine
        // ============================================================
        if (this._redstoneEngine) {
            // Set chunk manager reference for block access
            if (this._chunkManager) {
                this._redstoneEngine.setChunkManager(this._chunkManager);
            }

            // Set event bus for cross-system communication
            if (this._eventBus) {
                this._redstoneEngine.setEventBus(this._eventBus);
            }

            // Wire up timer reference (required for tick scheduling and cooldowns)
            if (this._timer) {
                this._redstoneEngine.setTimer(this._timer);
            }

            // Wire individual subsystems to the engine
            if (Donkeycraft.RedstoneWiring) {
                this._redstoneEngine.setWiring(Donkeycraft.RedstoneWiring);
                Donkeycraft.RedstoneWiring.setChunkManager(this._chunkManager);
            }
            if (Donkeycraft.RedstoneRepeaterComparator) {
                this._redstoneEngine.setRepeaterComparator(Donkeycraft.RedstoneRepeaterComparator);
            }
            if (Donkeycraft.RedstoneObservers) {
                this._redstoneEngine.setObservers(Donkeycraft.RedstoneObservers);
            }
            if (Donkeycraft.RedstonePistons) {
                this._redstoneEngine.setPistons(Donkeycraft.RedstonePistons);
            }
            if (Donkeycraft.RedstoneTNT) {
                this._redstoneEngine.setTNT(Donkeycraft.RedstoneTNT);
            }

            // Initialize all subsystems
            if (Donkeycraft.RedstoneWiring) {
                Donkeycraft.RedstoneWiring.init();
            }
            if (Donkeycraft.RedstoneRepeaterComparator) {
                Donkeycraft.RedstoneRepeaterComparator.init();
            }
            if (Donkeycraft.RedstoneObservers) {
                Donkeycraft.RedstoneObservers.init();
            }
            if (Donkeycraft.RedstonePistons) {
                Donkeycraft.RedstonePistons.init();
            }
            if (Donkeycraft.RedstoneTNT) {
                Donkeycraft.RedstoneTNT.init();
            }

            // Start the redstone engine tick loop
            this._redstoneEngine.start();

        }

        return true;
    };

    /**
     * Save dirty chunks to IndexedDB via WorldStore.saveDirtyChunks().
     * Delegates full serialization (blockData, skyLight, blockLight) to WorldStore.
     * @private
     * @param {string} worldName - World name identifier.
     * @returns {Promise<number>|number} Promise resolving to chunk count saved, or 0 if not available.
     */
    Donkeycraft.Game.prototype._saveDirtyChunks = function (worldName) {
        if (!this._worldStore || !this._worldStore.isReady()) {
            return 0;
        }

        // Delegate to WorldStore.saveDirtyChunks which handles full serialization and batching
        try {
            return this._worldStore.saveDirtyChunks(worldName);
        } catch (e) {
            Donkeycraft.Logger.error('Game', '_saveDirtyChunks failed: ' + e.message);
            return 0;
        }
    };

    /**
     * Start the game loop.
     * Pre-loads chunks around the player position BEFORE starting the timer
     * to break the render-before-tick deadlock where terrain rendering
     * would run with zero loaded chunks.
     */
    Donkeycraft.Game.prototype.start = function () {
        if (this._running) return;

        this._running = true;
        this._paused = false;

        // Set canvas size to window size
        this._resizeCanvas();

        // Pre-load chunks around the player position BEFORE starting the timer.
        // This breaks the render-before-tick deadlock: terrain renderer needs chunks,
        // but chunks only load during _tick() which runs after timer starts.
        if (this._player && this._chunkManager) {
            var startPos = this._player.getPosition();
            var playerChunkX = Math.floor(startPos.x / Config.CHUNK_SIZE);
            var playerChunkZ = Math.floor(startPos.z / Config.CHUNK_SIZE);
            this._chunkManager.updatePlayerPosition(playerChunkX, playerChunkZ);
        }

        // Register tick and render callbacks
        var self = this;
        this._unsubscribeTick = this._timer.onTick(function (dt, tickCount) {
            self._tick(dt, tickCount);
        });

        this._unsubscribeRender = this._timer.onRender(function (dt) {
            self._render(dt);
        });

        // Start the timer
        this._timer.start();

        // Emit ready event for external initialization (e.g., loading screen)
        if (this._eventBus) {
            try {
                this._eventBus.emit('game:ready', {});
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Ready event error: ' + e.message);
            }
        }

    };

    /**
     * Stop the game loop.
     */
    Donkeycraft.Game.prototype.stop = function () {
        if (!this._running) return;

        this._running = false;
        this._paused = false;

        if (this._timer) {
            this._timer.stop();
        }

        // Unsubscribe from callbacks
        if (this._unsubscribeTick) {
            this._unsubscribeTick();
            this._unsubscribeTick = null;
        }
        if (this._unsubscribeRender) {
            this._unsubscribeRender();
            this._unsubscribeRender = null;
        }
    };

    /**
     * Pause the game loop.
     */
    Donkeycraft.Game.prototype.pause = function () {
        if (!this._running || this._paused) return;
        this._paused = true;
        if (this._timer) {
            this._timer.stop();
        }
    };

    /**
     * Resume the game loop.
     */
    Donkeycraft.Game.prototype.resume = function () {
        if (!this._running || !this._paused) return;
        this._paused = false;
        if (this._timer) {
            this._timer.start();
        }
    };

    /**
     * isRunning — check if the game is currently running.
     * @returns {boolean}
     */
    Donkeycraft.Game.prototype.isRunning = function () {
        return this._running;
    };

    /**
     * Check if the game is paused.
     * @returns {boolean}
     */
    Donkeycraft.Game.prototype.isPaused = function () {
        return this._paused;
    };

    /**
     * Get the current FPS.
     * @returns {number}
     */
    Donkeycraft.Game.prototype.getFPS = function () {
        if (this._timer) {
            return this._timer.getFPS();
        }
        return 0;
    };

    /**
     * Get the current game tick count.
     * @returns {number}
     */
    Donkeycraft.Game.prototype.getTickCount = function () {
        if (this._timer) {
            return this._timer.getTickCount();
        }
        return 0;
    };

    /**
     * Get the player entity.
     * @returns {Donkeycraft.Player}
     */
    Donkeycraft.Game.prototype.getPlayer = function () {
        return this._player;
    };

    /**
     * Get the camera.
     * @returns {Donkeycraft.Camera}
     */
    Donkeycraft.Game.prototype.getCamera = function () {
        return this._camera;
    };

    /**
     * Get the chunk manager.
     * @returns {Donkeycraft.ChunkManager}
     */
    Donkeycraft.Game.prototype.getChunkManager = function () {
        return this._chunkManager;
    };

    /**
     * Get the input handler.
     * @returns {Donkeycraft.Input}
     */
    Donkeycraft.Game.prototype.getInput = function () {
        return this._input;
    };

    /**
     * Get the timer.
     * @returns {Donkeycraft.Timer}
     */
    Donkeycraft.Game.prototype.getTimer = function () {
        return this._timer;
    };

    /**
     * Get the event bus.
     * @returns {Donkeycraft.EventBus}
     */
    Donkeycraft.Game.prototype.getEventBus = function () {
        return this._eventBus;
    };

    /**
     * setOverlay — set the overlay DOM element used for pointer lock target.
     * @param {HTMLElement} overlayEl - The overlay container element.
     */
    Donkeycraft.Game.prototype.setOverlay = function (overlayEl) {
        this._overlay = overlayEl;
    };

    /**
     * isPointerLocked — check if pointer lock is currently active.
     * @returns {boolean} True if pointer is locked.
     */
    Donkeycraft.Game.prototype.isPointerLocked = function () {
        return document.pointerLockElement !== null;
    };

    /**
     * Enable or disable camera synchronization with player.
     * @param {boolean} enabled - Whether to sync camera to player.
     */
    Donkeycraft.Game.prototype.setCameraSync = function (enabled) {
        this._cameraSyncEnabled = !!enabled;
    };

    /**
     * Request pointer lock for mouse capture.
     */
    Donkeycraft.Game.prototype.requestPointerLock = function () {
        if (this._overlay) {
            this._overlay.requestPointerLock();
        } else {
            document.body.requestPointerLock();
        }
    };

    /**
     * Exit pointer lock.
     */
    Donkeycraft.Game.prototype.exitPointerLock = function () {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    };

    /**
     * Destroy the game and free all resources.
     */
    Donkeycraft.Game.prototype.destroy = function () {
        // Stop the game loop
        this.stop();

        // Exit pointer lock
        this.exitPointerLock();

        // Destroy subsystems in reverse dependency order
        if (this._breakParticles) {
            this._breakParticles.destroy();
            this._breakParticles = null;
        }

        if (this._handRenderer) {
            this._handRenderer.destroy();
            this._handRenderer = null;
        }

        if (this._guiRenderer) {
            this._guiRenderer.destroy();
            this._guiRenderer = null;
        }

        if (this._weatherRenderer) {
            this._weatherRenderer.destroy();
            this._weatherRenderer = null;
        }

        if (this._weather) {
            this._weather.destroy();
            this._weather = null;
        }

        if (this._sky) {
            this._sky.destroy();
            this._sky = null;
        }

        if (this._terrainRenderer) {
            this._terrainRenderer.destroy();
            this._terrainRenderer = null;
        }

        if (this._chunkManager) {
            this._chunkManager.destroy();
            this._chunkManager = null;
        }

        if (this._player) {
            this._player.destroy();
            this._player = null;
        }

        if (this._camera) {
            this._camera = null;
        }

        if (this._fog) {
            this._fog = null;
        }

        if (this._lighting) {
            this._lighting = null;
        }

        if (this._shaderManager) {
            this._shaderManager.destroy();
            this._shaderManager = null;
        }

        if (this._glContext) {
            this._glContext.destroy();
            this._glContext = null;
        }

        if (this._input) {
            this._input.destroy();
            this._input = null;
        }

        if (this._timer) {
            this._timer = null;
        }

        if (this._redstoneEngine) {
            if (typeof this._redstoneEngine.destroy === 'function') {
                try { this._redstoneEngine.destroy(); } catch (e) { Donkeycraft.Logger.warn('Game', 'Redstone engine destroy error: ' + e.message); }
            }
            this._redstoneEngine = null;
        }

        if (this._eventBus) {
            if (typeof this._eventBus.clear === 'function') {
                try { this._eventBus.clear(); } catch (e) { Donkeycraft.Logger.warn('Game', 'EventBus clear error: ' + e.message); }
            }
            this._eventBus = null;
        }

        // Clean up keybindings panel
        if (this._keybindingsPanel) {
            try { this._keybindingsPanel.destroy(); } catch (e) { Donkeycraft.Logger.warn('Game', 'KeybindingsPanel destroy error: ' + e.message); }
            this._keybindingsPanel = null;
        }

        // Clean up interaction cooldown state
        this._lastInteractionTime = 0;

        // Persist final state before shutdown — await LevelData persist before destroying WorldStore
        // to prevent data loss from async race conditions.
        var self = this;
        if (this._levelData && this._levelData.persistToStore) {
            try {
                this._levelData.persistToStore().then(function () {
                    // Now destroy WorldStore after LevelData persist completes
                    if (self._worldStore && self._worldStore.destroy) {
                        try { self._worldStore.destroy(); } catch (e2) { }
                    }
                }).catch(function () {
                    Donkeycraft.Logger.warn('Game', 'Final world save failed on destroy — destroying WorldStore anyway');
                    if (self._worldStore && self._worldStore.destroy) {
                        try { self._worldStore.destroy(); } catch (e2) { }
                    }
                });
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Final world save error: ' + e.message);
                if (this._worldStore && this._worldStore.destroy) {
                    try { this._worldStore.destroy(); } catch (e2) { }
                }
            }
        } else if (this._worldStore && this._worldStore.destroy) {
            // No LevelData to persist — destroy WorldStore directly
            try {
                this._worldStore.destroy();
            } catch (e) { }
        }

        // Clean up auto-save timer
        this._autoSaveTimer = 0;
        this._worldStore = null;
        this._levelData = null;
    };

    // ============================================================
    // Private Methods
    // ============================================================

    /**
     * Extract raw text content from a script tag.
     * @private
     * @param {string} sourceId - The id attribute of the script tag.
     * @returns {string|null} Raw text content or null.
     */
    Donkeycraft.Game.prototype._loadShaderSource = function (sourceId) {
        var script = document.getElementById(sourceId);
        if (!script) return null;
        return script.textContent || script.innerText || '';
    };

    /**
     * Extract a JavaScript template literal variable from source text.
     * Matches: var NAME = `...content...`;
     * @private
     * @param {string} source - Full script tag content.
     * @param {string} varName - Variable name to extract (e.g., 'TERRAIN_VERTEX_SHADER').
     * @returns {string|null} The GLSL shader body (without backticks), or null.
     */
    Donkeycraft.Game.prototype._extractVariable = function (source, varName) {
        if (!source) return null;
        // Match: var NAME = ` ... `;
        // Use non-greedy match for template literal content
        var regex = new RegExp('var\\s+' + this._escapeRegex(varName) + '\\s*=\\s*`([\\s\\S]*?)`\\s*;');
        var match = source.match(regex);
        if (match && match[1]) {
            return match[1].trim();
        }
        return null;
    };

    /**
     * Escape special regex characters in a string.
     * @private
     * @param {string} str - String to escape.
     * @returns {string} Escaped string.
     */
    Donkeycraft.Game.prototype._escapeRegex = function (str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    /**
     * Compile shader programs from embedded script tag sources.
     * Parses JavaScript variable declarations: var NAME = `GLSL...`;
     * @private
     */
    Donkeycraft.Game.prototype._compileShaderPrograms = function () {
        var vertSrc = this._loadShaderSource('dk-vertex-shaders');
        var fragSrc = this._loadShaderSource('dk-fragment-shaders');

        if (!vertSrc || !fragSrc) {
            Donkeycraft.Logger.warn('Game', 'Shader sources not found — using fallback compilation');
            this._compileFallbackShaders();
            return;
        }

        // Extract and compile individual shader programs with error handling
        var self2 = this;
        var _compileShaderPair = function (name, vertName, fragName) {
            var vertSrc2 = self2._extractVariable(vertSrc, vertName);
            var fragSrc2 = self2._extractVariable(fragSrc, fragName);

            // Log extraction results for debugging
            if (!vertSrc2 || !fragSrc2) {
                Donkeycraft.Logger.warn('Game',
                    'Extraction failed for "' + name + '" program — vert: ' + (vertSrc2 ? 'OK (' + vertSrc2.length + ' chars)' : 'NULL') +
                    ', frag: ' + (fragSrc2 ? 'OK (' + fragSrc2.length + ' chars)' : 'NULL'));
            }

            if (vertSrc2 && fragSrc2) {
                try {
                    self2._shaderManager.createProgram(name, vertSrc2, fragSrc2);
                } catch (e) {
                    Donkeycraft.Logger.error('Game', 'Failed to compile "' + name + '" shader: ' + e.message);
                }
            } else {
                Donkeycraft.Logger.warn('Game', 'Missing shader sources for "' + name + '" program — will use fallback');
            }
        };

        _compileShaderPair('terrain', 'TERRAIN_VERTEX_SHADER', 'TERRAIN_FRAGMENT_SHADER');
        _compileShaderPair('break', 'BREAK_VERTEX_SHADER', 'PARTICLE_FRAGMENT_SHADER');
        _compileShaderPair('gui', 'GUI_VERTEX_SHADER', 'GUI_FRAGMENT_SHADER');
        _compileShaderPair('sky', 'SKY_VERTEX_SHADER', 'SKY_FRAGMENT_SHADER');
        _compileShaderPair('hand', 'HAND_VERTEX_SHADER', 'HAND_FRAGMENT_SHADER');

    };

    /**
     * Compile fallback shaders when embedded sources are not available.
     * Includes ALL required uniforms to prevent missing uniform warnings.
     * @private
     */
    Donkeycraft.Game.prototype._compileFallbackShaders = function () {
        // Minimal terrain shader with fog uniforms
        this._shaderManager.createProgram('terrain',
            'attribute vec3 aPosition;\n' +
            'attribute vec2 aUV;\n' +
            'attribute vec3 aNormal;\n' +
            'attribute float aLight;\n' +
            'uniform mat4 uProjection;\n' +
            'uniform mat4 uView;\n' +
            'uniform mat4 uModel;\n' +
            'varying vec2 vUV;\n' +
            'varying vec3 vNormal;\n' +
            'varying float vLight;\n' +
            'varying float vDepth;\n' +
            'void main() {\n' +
            '  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);\n' +
            '  vUV = aUV;\n' +
            '  vNormal = aNormal;\n' +
            '  vLight = aLight;\n' +
            '  vec4 viewPos = uView * uModel * vec4(aPosition, 1.0);\n' +
            '  vDepth = -viewPos.z;\n' +
            '}\n',
            'precision mediump float;\n' +
            'varying vec2 vUV;\n' +
            'varying vec3 vNormal;\n' +
            'varying float vLight;\n' +
            'varying float vDepth;\n' +
            'uniform sampler2D uTexture;\n' +
            'uniform vec3 uFogColor;\n' +
            'uniform float uFogDensity;\n' +
            'uniform float uLightFactor;\n' +
            'void main() {\n' +
            '  vec4 texColor = texture2D(uTexture, vUV);\n' +
            '  if (texColor.a < 0.5) discard;\n' +
            '  vec3 finalColor = texColor.rgb * vLight * uLightFactor;\n' +
            '  float fogFactor = 1.0 - exp(-vDepth * uFogDensity);\n' +
            '  fogFactor = clamp(fogFactor, 0.0, 1.0);\n' +
            '  finalColor = mix(finalColor, uFogColor, fogFactor);\n' +
            '  gl_FragColor = vec4(finalColor, texColor.a);\n' +
            '}\n'
        );

        // Minimal break shader
        this._shaderManager.createProgram('break',
            'attribute vec3 aPosition;\n' +
            'attribute vec2 aUV;\n' +
            'attribute vec4 aColor;\n' +
            'uniform mat4 uProjection;\n' +
            'uniform mat4 uView;\n' +
            'varying vec2 vUV;\n' +
            'varying vec4 vColor;\n' +
            'void main() {\n' +
            '  gl_Position = uProjection * uView * vec4(aPosition, 1.0);\n' +
            '  vUV = aUV;\n' +
            '  vColor = aColor;\n' +
            '}\n',
            'precision mediump float;\n' +
            'varying vec2 vUV;\n' +
            'varying vec4 vColor;\n' +
            'uniform sampler2D uTexture;\n' +
            'void main() {\n' +
            '  gl_FragColor = texture2D(uTexture, vUV) * vColor;\n' +
            '}\n'
        );

        // Minimal GUI shader
        this._shaderManager.createProgram('gui',
            'attribute vec3 aPosition;\n' +
            'attribute vec2 aUV;\n' +
            'attribute vec4 aColor;\n' +
            'uniform mat4 uProjection;\n' +
            'uniform mat4 uView;\n' +
            'uniform mat4 uModel;\n' +
            'varying vec2 vUV;\n' +
            'varying vec4 vColor;\n' +
            'void main() {\n' +
            '  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);\n' +
            '  vUV = aUV;\n' +
            '  vColor = aColor;\n' +
            '}\n',
            'precision mediump float;\n' +
            'varying vec2 vUV;\n' +
            'varying vec4 vColor;\n' +
            'uniform sampler2D uTexture;\n' +
            'uniform int uHasTexture;\n' +
            'void main() {\n' +
            '  vec4 color = vColor;\n' +
            '  if (uHasTexture == 1) { color = texture2D(uTexture, vUV) * color; }\n' +
            '  if (color.a < 0.1) discard;\n' +
            '  gl_FragColor = color;\n' +
            '}\n'
        );

        // Minimal sky shader WITH all required uniforms (uTopColor, uBottomColor, uHorizon, uModel)
        this._shaderManager.createProgram('sky',
            'attribute vec3 aPosition;\n' +
            'attribute vec2 aUV;\n' +
            'uniform mat4 uProjection;\n' +
            'uniform mat4 uView;\n' +
            'uniform mat4 uModel;\n' +
            'varying vec2 vUV;\n' +
            'varying vec3 vWorldPos;\n' +
            'void main() {\n' +
            '  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);\n' +
            '  vUV = aUV;\n' +
            '  vWorldPos = (uModel * vec4(aPosition, 1.0)).xyz;\n' +
            '}\n',
            'precision mediump float;\n' +
            'varying vec2 vUV;\n' +
            'varying vec3 vWorldPos;\n' +
            'uniform vec3 uTopColor;\n' +
            'uniform vec3 uBottomColor;\n' +
            'uniform float uHorizon;\n' +
            'void main() {\n' +
            '  float t = smoothstep(uHorizon - 0.1, uHorizon + 0.1, normalize(vWorldPos).y);\n' +
            '  gl_FragColor = vec4(mix(uBottomColor, uTopColor, t), 1.0);\n' +
            '}\n'
        );

        // Minimal hand shader
        this._shaderManager.createProgram('hand',
            'attribute vec3 aPosition;\n' +
            'attribute vec2 aUV;\n' +
            'attribute vec3 aNormal;\n' +
            'attribute float aLight;\n' +
            'uniform mat4 uProjection;\n' +
            'uniform mat4 uView;\n' +
            'uniform mat4 uModel;\n' +
            'varying vec2 vUV;\n' +
            'varying vec4 vColor;\n' +
            'void main() {\n' +
            '  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);\n' +
            '  vUV = aUV;\n' +
            '  vColor = vec4(aLight, aLight, aLight, 1.0);\n' +
            '}\n',
            'precision mediump float;\n' +
            'varying vec2 vUV;\n' +
            'varying vec4 vColor;\n' +
            'uniform sampler2D uTexture;\n' +
            'void main() {\n' +
            '  vec4 texColor = texture2D(uTexture, vUV);\n' +
            '  if (texColor.a < 0.1) discard;\n' +
            '  gl_FragColor = vec4(texColor.rgb * vColor.rgb, texColor.a * vColor.a);\n' +
            '}\n'
        );

        Donkeycraft.Logger.warn('Game', 'Using fallback shaders — embedded sources not found');
    };

    /**
     * Resize the canvas to fit the window.
     * @private
     */
    Donkeycraft.Game.prototype._resizeCanvas = function () {
        if (!this._canvas || !this._gl) return;

        var w = window.innerWidth;
        var h = window.innerHeight;

        if (this._canvas.width !== w || this._canvas.height !== h) {
            this._canvas.width = w;
            this._canvas.height = h;
            this._gl.viewport(0, 0, w, h);

            if (this._camera) {
                this._camera.setAspect(w / h);
                this._camera.updateProjection();
            }
        }
    };

    /**
     * Get the current time of day [0, 1) from world time.
     * Uses Config.WORLD_TIME_SCALE (ticks per second) to derive a smooth 0-1 value.
     * @private
     * @returns {number} Time of day in [0, 1). 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
     */
    Donkeycraft.Game.prototype._getTimeOfDay = function () {
        // Check for frozen time first (set via creative mode time dial)
        if (this._frozenTimeOfDay !== null && typeof this._frozenTimeOfDay === 'number') {
            return this._frozenTimeOfDay;
        }
        var tickCount = this.getTickCount();
        var ticksPerDay = Config.WORLD_TIME_SCALE * 60; // 60-second full day cycle
        return ((tickCount % ticksPerDay) + ticksPerDay) % ticksPerDay / ticksPerDay;
    };

    /**
     * Set a frozen time of day value. When set, the game will display this time
     * instead of advancing naturally. Used by the creative mode time dial slider.
     * @param {number|null} frozenTimeOfDay - Time of day in [0, 1) to freeze at, or null to resume natural flow.
     */
    Donkeycraft.Game.prototype.setFrozenTime = function (frozenTimeOfDay) {
        if (frozenTimeOfDay === null) {
            this._frozenTimeOfDay = null;
        } else if (typeof frozenTimeOfDay === 'number' && !isNaN(frozenTimeOfDay)) {
            this._frozenTimeOfDay = ((frozenTimeOfDay % 1) + 1) % 1;
        }
    };

    /**
     * Get whether the time is currently frozen.
     * @returns {boolean} True if time is frozen.
     */
    Donkeycraft.Game.prototype.isTimeFrozen = function () {
        return this._frozenTimeOfDay !== null;
    };

    /**
     * Get the block ID at world coordinates.
     * @private
     * @param {number} wx - World X coordinate.
     * @param {number} wy - World Y coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} Block ID at the given position.
     */
    Donkeycraft.Game.prototype._getBlockAt = function (wx, wy, wz) {
        // Check world bounds
        if (wy < 0 || wy >= Config.WORLD_HEIGHT) return 0;

        // Get chunk and local coordinates
        var chunkX = Math.floor(wx / Config.CHUNK_SIZE);
        var chunkZ = Math.floor(wz / Config.CHUNK_SIZE);
        var localX = ((wx % Config.CHUNK_SIZE) + Config.CHUNK_SIZE) % Config.CHUNK_SIZE;
        var localZ = ((wz % Config.CHUNK_SIZE) + Config.CHUNK_SIZE) % Config.CHUNK_SIZE;

        // Get chunk from manager
        var chunk = this._chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) return 0;

        return chunk.getBlock(localX, wy, localZ);
    };

    /**
     * Game tick callback — processes game logic at fixed timestep.
     * @private
     * @param {number} dt - Delta time in seconds.
     * @param {number} tickCount - Current game tick count.
     */
    Donkeycraft.Game.prototype._tick = function (dt, tickCount) {
        if (!this._running || this._paused) return;

        // Safety clamp: prevent spiral-of-death on frame drops (cap dt at 100ms).
        dt = Math.min(dt, 0.1);

        // Update input key states and mouse button states (for just-pressed detection).
        if (this._input) {
            this._input.updateKeyStates();
            this._input.updateMouseButtonStates();
        }

        // Tick block break progress (decrement timers, spawn drops).
        if (this._blockActionSystem && this._chunkManager) {
            this._blockActionSystem.tickBreakProgress(dt);
        }

        // Update player rotation from camera and notify tick subscribers.
        // Movement, collision, and physics are handled by the subsystems (Movement, Jumping, Flying).
        this._updatePlayer(dt);

        // Process fly toggle (F key) — must happen before subsystem ticks.
        if (this._input && this._flyingSystem) {
            if (this._input.isKeyJustPressed(Config.KEYBINDS.FLY_TOGGLE)) {
                try {
                    var toggled = this._flyingSystem.toggleFlyMode();
                    if (toggled) {
                        var isFlying = this._flyingSystem.isFlying();
                        Donkeycraft.Logger.info('Game', 'Fly mode ' + (isFlying ? 'enabled' : 'disabled') + ' for game mode: ' + this._player.getGameMode());
                    }
                } catch (e) {
                    Donkeycraft.Logger.error('Game', 'Fly toggle error: ' + e.message);
                }
            }
        }

        // Debug key: C toggles between survival and creative modes only (no spectator)
        if (this._input && this._player && this._input.isKeyJustPressed('KeyC')) {
            try {
                var currentMode = this._player.getGameMode();
                var newMode = currentMode === 'survival' ? 'creative' : 'survival';
                this._player.setGameMode(newMode);
                // Reset fly state when switching to creative
                if (newMode === 'creative' && this._flyingSystem) {
                    this._flyingSystem.enableFlyMode();
                }
                // Emit gameMode:changed event for UI systems (speed indicator, gamemode badge)
                if (this._eventBus) {
                    try { this._eventBus.emit('gameMode:changed', { newMode: newMode }); } catch (e2) { }
                }
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Game mode cycle error: ' + e.message);
            }
        }

        // Tick player subsystems in dependency order:
        // Tick order — critical for correct game logic:
        // 1. Flying — state management (toggle, speed queries)
        // 2. Movement — physics, gravity, swimming, collision resolution, fall damage
        // 3. Jumping — jump input, cooldown, water swimming boost
        // 4. Player.tickVitals() — consolidated: fire damage, stamina regen, starvation, natural healing
        //    (HurtBox.tick() and Hunger.tick() are now no-ops/delegates to player.tickVitals)
        if (this._flyingSystem) {
            try { this._flyingSystem.tick(dt); } catch (e) { Donkeycraft.Logger.error('Game', 'Flying tick error: ' + e.message); }
        }
        if (this._movementSystem) {
            try { this._movementSystem.tick(dt); } catch (e) { Donkeycraft.Logger.error('Game', 'Movement tick error: ' + e.message); }
        }
        if (this._jumpSystem) {
            try { this._jumpSystem.tick(dt); } catch (e) { Donkeycraft.Logger.error('Game', 'Jump tick error: ' + e.message); }
        }
        // Vitals tick — consolidated into Player.tickVitals() for single source of truth
        if (this._player) {
            try { this._player.tickVitals(dt); } catch (e) { Donkeycraft.Logger.error('Game', 'Player vitals tick error: ' + e.message); }
        }
        // Hunger tick delegates to player.tickVitals() — kept for backward compat
        if (this._hungerSystem) {
            try { this._hungerSystem.tick(dt); } catch (e) { Donkeycraft.Logger.error('Game', 'Hunger tick error: ' + e.message); }
        }

        // Update chunk manager based on player position.
        this._updateChunks();

        // Process interactions (block break/place).
        this._processInteractions();

        // Periodically sync player inventory hotbar to Hotbar UI display (every 30 ticks ≈ 1.5s)
        if (this._hotbar && this._player && tickCount % 30 === 0) {
            try {
                var inv = this._player.getInventory();
                if (inv && typeof inv.getHotbarStacks === 'function') {
                    var hotbarStacks = inv.getHotbarStacks();
                    if (hotbarStacks && hotbarStacks.setSlots) {
                        this._hotbar.setSlots(hotbarStacks);
                    } else if (Array.isArray(hotbarStacks)) {
                        this._hotbar.setSlots(hotbarStacks);
                    }
                }
            } catch (e) { }
        }

        // Auto-save chunks: accumulate time and save at Config.AUTO_SAVE_INTERVAL
        // Only handle chunk saving here; LevelData handles its own level data auto-save separately
        if (this._worldStore && this._chunkManager) {
            this._autoSaveTimer += dt * 1000; // Convert to ms
            if (this._autoSaveTimer >= Config.AUTO_SAVE_INTERVAL) {
                this._autoSaveTimer = 0;
                var worldName = (this._levelData && this._levelData.getWorldName)
                    ? this._levelData.getWorldName()
                    : 'default';

                var savePromise = this._saveDirtyChunks(worldName);
                if (savePromise && typeof savePromise.then === 'function') {
                    savePromise.then(function () {
                        // Auto-save succeeded — only log errors
                    }).catch(function (e) {
                        Donkeycraft.Logger.warn('Game', 'Auto-save failed: ' + (e && e.message ? e.message : String(e)));
                    });
                }
            }
        }

        // Tick LevelData auto-save for level data persistence (separate from chunk saves)
        if (this._levelData && this._levelData.tickAutoSave) {
            try {
                this._levelData.tickAutoSave(dt);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'LevelData auto-save tick failed: ' + e.message);
            }
        }

        // Tick entity engine (animation & kinematics solver, auto-spawns examples)
        if (this._entityEngine) {
            try {
                // Get player position for awareness updates
                var entPlayerPos = this._player ? this._player.getPosition() : null;
                // Ground check callback: returns ground Y at world coords, or null if none
                var selfTick = this;
                var groundCheckFn = function () {
                    if (!entPlayerPos) return null;
                    // Raycast downward from entity position to find ground
                    for (var gy = Math.floor(entPlayerPos.y + 2); gy >= 0; gy--) {
                        var bid = selfTick._getBlockAt(Math.floor(entPlayerPos.x), gy, Math.floor(entPlayerPos.z));
                        if (bid && Donkeycraft.BlockRegistry && Donkeycraft.BlockRegistry.isSolid(bid)) {
                            return gy + 1; // Snap to top of solid block
                        }
                    }
                    return null;
                };
                this._entityEngine.tick(dt, groundCheckFn);
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Entity engine tick failed: ' + e.message);
            }
        }

        // Tick entity manager (lifecycle, awareness table, spatial hash)
        if (this._entityManager && this._player) {
            try {
                var pp = this._player.getPosition();
                if (pp) {
                    this._entityManager.tick(dt, pp.x, pp.y, pp.z);
                }
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Entity manager tick failed: ' + e.message);
            }
        }

        // Check for player in portal (automatic dimension travel)
        if (Donkeycraft.Portal && Donkeycraft.Portal._checkPlayerInPortal && this._player) {
            try {
                var playerPos = this._player.getPosition();
                Donkeycraft.Portal._checkPlayerInPortal(playerPos);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Portal tick check failed: ' + e.message);
            }
        }

        // Emit tick event
        if (this._eventBus) {
            try {
                this._eventBus.emit('game:tick', { dt: dt, tickCount: tickCount });
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Tick event error: ' + e.message);
            }
        }
    };

    /**
     * _updatePlayer — Update player rotation from camera, apply mouse look, and notify tick subscribers.
     * Movement, collision, and physics are handled by the subsystems (Movement, Jumping, Flying).
     *
     * Control scheme:
     * - Pointer unlocked: W/S = move forward/back, A/D = turn left/right, Space = jump
     * - Pointer locked: W/S = move forward/back, A/D = strafe left/right, Space = jump
     * @private
     * @param {number} dt - Delta time in seconds.
     */
    Donkeycraft.Game.prototype._updatePlayer = function (dt) {
        if (!this._player || !this._camera || !this._input) return;

        // Apply mouse delta to camera rotation (first-person look).
        // Only processes mouse input when pointer is locked.
        var mouseDelta = this._input.getMouseDelta();
        if (mouseDelta.deltaX !== 0 || mouseDelta.deltaY !== 0) {
            this._camera.applyMouseDelta(mouseDelta.deltaX, mouseDelta.deltaY);
        }

        // Keyboard controls depend on pointer lock state:
        // - UNLOCKED: A/D = turn left/right (yaw rotation)
        // - LOCKED: A/D = strafe left/right (handled by Movement system)
        var isMouseLocked = this._input.isMouseCaptured();

        // Notify movement system of pointer lock state so it can skip strafe when unlocked
        if (this._movementSystem) {
            this._movementSystem.setMouseLocked(isMouseLocked);
        }

        if (!isMouseLocked) {
            // Pointer unlocked: A/D keys rotate the camera (turn left/right)
            // In Donkeycraft's convention: positive yaw = turning LEFT, negative yaw = turning RIGHT.
            // This matches mouse look where moving left increases yaw and moving right decreases it.
            var turnSpeed = Config.KEYBOARD_TURN_SPEED || 0.04; // radians per tick
            var isLeft = this._input.isKeyDown(Config.KEYBINDS.MOVE_LEFT);
            var isRight = this._input.isKeyDown(Config.KEYBINDS.MOVE_RIGHT);
            if (isRight || isLeft) {
                // D key (MOVE_RIGHT) → turn right → negative yaw change
                // A key (MOVE_LEFT) → turn left → positive yaw change
                var delta = isRight ? -turnSpeed : turnSpeed;
                this._camera.adjustYaw(delta);
            }
        }
        // When pointer IS locked, A/D strafe movement is handled by the Movement system
        // which mixes strafe input with yaw-based direction vectors.

        // Sync camera rotation → player rotation (so direction vectors use current look angle).
        var playerRot = this._player.getRotation();
        playerRot.yaw = this._camera.getYaw();
        playerRot.pitch = this._camera.getPitch();

        // Apply knockback velocity to the player and decay it over time.
        // Knockback is applied as an additional velocity component that decays
        // each tick so the player gradually slows down after being hit.
        var kb = this._player.getKnockback();
        if (kb && (Math.abs(kb.x) > 0.001 || Math.abs(kb.z) > 0.001)) {
            // Apply knockback to player velocity (horizontal only — upward component stored in y).
            var playerVel = this._player.getVelocity();
            this._player.setVelocity(
                playerVel.x + kb.x,
                playerVel.y + kb.y,
                playerVel.z + kb.z
            );

            // Decay knockback velocity (0.9 = 10% decay per tick at 20 TPS).
            kb.x *= 0.9;
            kb.z *= 0.9;
            kb.y *= 0.9;
            if (Math.abs(kb.x) < 0.001) { kb.x = 0; }
            if (Math.abs(kb.z) < 0.001) { kb.z = 0; }
            if (Math.abs(kb.y) < 0.001) { kb.y = 0; }
        }

        // Emit player tick event for subscribers (e.g., stats tracking).
        this._player._notifyTick(dt);
    };

    /**
     * Update chunk loading/unloading based on player position.
     * Only triggers terrain renderer update when player changes chunks OR dirty chunks exist.
     * @private
     */
    Donkeycraft.Game.prototype._updateChunks = function () {
        if (!this._player || !this._chunkManager || !this._terrainRenderer) return;

        var pos = this._player.getPosition();
        var chunkX = Math.floor(pos.x / Config.CHUNK_SIZE);
        var chunkZ = Math.floor(pos.z / Config.CHUNK_SIZE);

        // Check if player changed chunks
        var playerMovedChunks = (chunkX !== this._lastPlayerChunkX || chunkZ !== this._lastPlayerChunkZ);

        if (!playerMovedChunks) {
            // Player hasn't moved chunks — only check for dirty chunks that need rebuilding
            var dirtyChunks = this._chunkManager.getDirtyChunks();
            if (dirtyChunks.length === 0) {
                return; // Nothing to update
            }
            // Mark dirty chunks but don't update player chunk position
            for (var i = 0; i < dirtyChunks.length; i++) {
                this._terrainRenderer.markChunkDirty(dirtyChunks[i].chunkX, dirtyChunks[i].chunkZ);
            }
            return;
        }

        this._lastPlayerChunkX = chunkX;
        this._lastPlayerChunkZ = chunkZ;

        // Update chunk manager with new player position
        this._chunkManager.updatePlayerPosition(chunkX, chunkZ);

        // Mark all dirty chunks for rebuild
        var dirty = this._chunkManager.getDirtyChunks();
        for (var j = 0; j < dirty.length; j++) {
            this._terrainRenderer.markChunkDirty(dirty[j].chunk.chunkX, dirty[j].chunk.chunkZ);
        }
    };

    /**
     * _forceChunkLoad — ensures chunks exist before first render frame.
     * Called from _render() on the very first frame to break the render-before-tick deadlock.
     * Uses _chunkForceLoaded flag to run exactly once, avoiding per-frame overhead.
     * @private
     */
    Donkeycraft.Game.prototype._forceChunkLoad = function () {
        // Guard: only run once per game session
        if (this._chunkForceLoaded) return;
        this._chunkForceLoaded = true;

        if (!this._player || !this._chunkManager || !this._terrainRenderer) return;

        var pos = this._player.getPosition();
        var chunkX = Math.floor(pos.x / Config.CHUNK_SIZE);
        var chunkZ = Math.floor(pos.z / Config.CHUNK_SIZE);

        // Force update even if player hasn't moved (first frame)
        this._lastPlayerChunkX = chunkX;
        this._lastPlayerChunkZ = chunkZ;
        this._chunkManager.updatePlayerPosition(chunkX, chunkZ);

        // CRITICAL: Tell the terrain renderer to build meshes for the newly-loaded chunks.
        // Without this call, updateChunks() is never invoked on the first frame because
        // _updateChunks() returns early when _lastPlayerChunkX/Z hasn't changed.
        this._terrainRenderer.updateChunks(chunkX, chunkZ);
    };

    /**
     * _shouldProcessInteraction — check if enough time has passed since the last interaction.
     * @private
     * @returns {boolean} True if the cooldown has elapsed and interactions should be processed.
     */
    Donkeycraft.Game.prototype._shouldProcessInteraction = function () {
        var now = performance.now();
        var elapsed = now - this._lastInteractionTime;
        if (elapsed >= this._INTERACTION_COOLDOWN_MS) {
            this._lastInteractionTime = now;
            return true;
        }
        return false;
    };

    /**
     * _wouldOverlapPlayer — check if placing a block at the given position would overlap the player's AABB.
     * @private
     * @param {number} bx - Block X coordinate.
     * @param {number} by - Block Y coordinate.
     * @param {number} bz - Block Z coordinate.
     * @returns {boolean} True if the block would overlap the player.
     */
    Donkeycraft.Game.prototype._wouldOverlapPlayer = function (bx, by, bz) {
        var pos = this._player.getPosition();
        var halfW = this._playerWidth / 2;
        var pxMinX = pos.x - halfW;
        var pxMaxX = pos.x + halfW;
        var pxMinZ = pos.z - halfW;
        var pxMaxZ = pos.z + halfW;
        var pxMinY = pos.y;
        var pxMaxY = pos.y + this._playerHeight;

        // Block AABB: [bx, bx+1] x [by, by+1] x [bz, bz+1]
        return (pxMaxX > bx && pxMinX < bx + 1 &&
            pxMaxY > by && pxMinY < by + 1 &&
            pxMaxZ > bz && pxMinZ < bz + 1);
    };

    /**
     * _getSelectedBlockId — get the block ID from the currently selected hotbar slot.
     * @private
     * @returns {number} The block ID to place, or 1 (stone) as fallback.
     */
    Donkeycraft.Game.prototype._getSelectedBlockId = function () {
        // Try to get from hotbar first
        if (this._hotbar && this._hotbar.getSelectedSlot !== undefined) {
            var slot = this._hotbar.getSelectedSlot();
            if (slot !== null && slot.item !== undefined && slot.item.id !== undefined) {
                return slot.item.id;
            }
        }
        // Fallback: check player inventory directly if accessible
        if (this._player && this._player.inventory && this._player.hotbarSlot !== undefined) {
            var hotbarSlot = this._player.inventory.slots[this._player.hotbarSlot];
            if (hotbarSlot && hotbarSlot.item && hotbarSlot.item.id !== undefined) {
                return hotbarSlot.item.id;
            }
        }
        // Final fallback: stone block ID
        return 1;
    };

    /**
     * Process block interactions (break/place).
     * @private
     */
    Donkeycraft.Game.prototype._processInteractions = function () {
        if (!this._raycastSystem || !this._chunkManager || !this._player) return;

        // Only process interactions when pointer is locked
        if (!this._input.isMouseCaptured()) return;

        // Check interaction cooldown
        if (!this._shouldProcessInteraction()) return;

        var playerPos = this._player.getEyePosition();
        var rot = this._player.getRotation();

        // Calculate raycast direction from camera rotation
        var direction = this._raycastSystem.getDirectionFromRotation(rot.yaw, rot.pitch);
        var reach = Config.PLAYER_REACH;

        // Perform raycast using the chunk manager
        var ignoreIds = [0]; // Ignore air
        var result = this._raycastSystem.raycast(
            this._chunkManager,
            playerPos,
            direction,
            reach,
            ignoreIds
        );

        // Process left click (block breaking)
        if (this._input.isMouseButtonPressed('left') && result && result.blockX !== undefined) {
            if (this._blockActionSystem) {
                this._blockActionSystem.startBreaking(
                    this._chunkManager,
                    result.blockX, result.blockY, result.blockZ,
                    { x: result.faceNormalX, y: result.faceNormalY, z: result.faceNormalZ },
                    this._player
                );
            }
        }

        // Process right click (block placement / interaction)
        if (this._input.isMouseButtonPressed('right') && result && result.blockX !== undefined) {
            var placePos = this._blockPlacementSystem.getPlacementPosition(
                result.blockX, result.blockY, result.blockZ,
                result.faceNormalX, result.faceNormalY, result.faceNormalZ
            );

            if (this._blockPlacementSystem && this._player) {
                // Skip placement if it would overlap the player
                if (this._wouldOverlapPlayer(placePos.x, placePos.y, placePos.z)) {
                    return;
                }

                // Get the selected block ID from hotbar
                var blockId = this._getSelectedBlockId();

                this._blockPlacementSystem.placeBlock(
                    this._chunkManager,
                    placePos.x, placePos.y, placePos.z,
                    blockId,
                    this._player
                );
            }
        }
    };

    /**
     * Game render callback — processes rendering every frame.
     * @private
     * @param {number} dt - Delta time in seconds.
     */
    Donkeycraft.Game.prototype._render = function (dt) {
        if (!this._running || !this._gl || this._paused) {
            return;
        }
        // Resize canvas if needed
        this._resizeCanvas();

        // Force initial chunk load on the very first render frame to break
        // the render-before-tick deadlock. After the first frame, _lastPlayerChunkX/Z
        // will be set and normal _updateChunks() handling takes over.
        if (this._lastPlayerChunkX === null || this._lastPlayerChunkZ === null) {
            this._forceChunkLoad();
        }

        // Clear the screen
        this._gl.clearColor(0.53, 0.8, 0.97, 1.0); // Sky blue
        this._gl.clear(this._gl.COLOR_BUFFER_BIT | this._gl.DEPTH_BUFFER_BIT);

        // Log WebGL errors after clear to detect context issues
        var glErr = this._gl.getError();
        if (glErr !== this._gl.NO_ERROR) {
            Donkeycraft.Logger.error('Game', 'WebGL error after clear: 0x' + glErr.toString(16));
        }

        this._gl.enable(this._gl.DEPTH_TEST);
        this._gl.enable(this._gl.CULL_FACE);

        // Sync camera to player position
        if (this._cameraSyncEnabled && this._player) {
            var pos = this._player.getPosition();
            var eyePos = this._player.getEyePosition();
            var rot = this._player.getRotation();

            this._camera.setPosition(eyePos.x, eyePos.y, eyePos.z);
            this._camera.setRotation(rot.yaw, rot.pitch);
        }

        // Update camera matrices
        if (this._camera) {
            this._camera.updateProjection();
            this._camera.updateView();
        }

        // Update chunk meshes in terrain renderer — only when needed.
        // The tick path (_updateChunks) handles dirty chunk tracking,
        // but we also need a render-time check for chunks that became
        // dirty between ticks (e.g., from block placement/breaking).
        if (this._terrainRenderer && this._player) {
            var pos = this._player.getPosition();
            var chunkX = Math.floor(pos.x / Config.CHUNK_SIZE);
            var chunkZ = Math.floor(pos.z / Config.CHUNK_SIZE);

            // Only update if player is in a new chunk or there are dirty chunks
            var playerChanged = (chunkX !== this._lastPlayerChunkX || chunkZ !== this._lastPlayerChunkZ);
            var hasDirtyChunks = this._chunkManager && this._chunkManager.getDirtyChunks().length > 0;

            if (playerChanged || hasDirtyChunks) {
                this._terrainRenderer.updateChunks(chunkX, chunkZ);
            }
        }

        // Update time of day and apply lighting to sky
        try {
            if (this._lighting) {
                var timeOfDay = this._getTimeOfDay();
                this._lighting.setTimeOfDay(timeOfDay);
            }
            if (this._renderSky && this._sky) {
                this._sky.render(this._camera, this._lighting);
            }
        } catch (e) {
            Donkeycraft.Logger.error('Game', 'Sky render failed: ' + e.message);
        }

        // Render terrain (handles fog color + uLightFactor internally)
        try {
            if (this._renderTerrain && this._terrainRenderer && this._camera) {
                this._terrainRenderer.render(this._camera);
            }
        } catch (e) {
            Donkeycraft.Logger.error('Game', 'Terrain render failed: ' + e.message);
        }

        // Update and render break particles (physics simulation + rendering)
        if (this._renderParticles && this._breakParticles && this._player) {
            var playerPos = this._player.getPosition();
            this._breakParticles.update(dt, -20.0); // gravity: -20 blocks/s²
            this._breakParticles.render(this._camera);
        }

        // Update and render hand (first-person item) with bob animation
        if (this._renderHand && this._handRenderer && this._camera && this._canvas) {
            this._handRenderer.setBobAngle(this._handRenderer.getBobAngle() + dt * 3);
            this._handRenderer.render(this._camera, this._canvas.width, this._canvas.height);
        }

        // Tick and render weather effects
        if (this._renderWeather && this._weather && this._weatherRenderer) {
            try {
                this._weather.tick();
                var particleDensity = this._weather.getParticleDensity();
                var particleType = this._weather.isSnowing() ? 'snow' : 'rain';
                // Spawn particles when weather becomes active
                if (particleDensity > 0 && this._weatherRenderer.getParticleCount() === 0) {
                    this._weatherRenderer.spawnInitialParticles(Math.floor(500 * particleDensity));
                }
                this._weatherRenderer.activate();
                this._weatherRenderer.update(dt, this._player ? this._player.getPosition() : { x: 0, y: 64, z: 0 });
                this._weatherRenderer.render(this._camera, particleDensity, particleType);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Weather render error: ' + e.message);
            }
        }

        // Update speed indicator UI with current active speed mode
        if (this._speedIndicator && this._movementSystem) {
            var activeMode = this._movementSystem.getActiveSpeedMode ? this._movementSystem.getActiveSpeedMode() : null;
            if (activeMode) {
                this._speedIndicator.update(activeMode);
            }
        }

        // Render GUI overlay (crosshair, HUD elements)
        if (this._renderGUI && this._guiRenderer && this._canvas) {
            // Gather health/food values from Player (single source of truth) and Hunger system.
            var health = 20, maxHealth = 20, food = 20, maxFood = 20;
            try {
                if (this._player) {
                    health = this._player.getHealth !== undefined ? this._player.getHealth() : 20;
                    maxHealth = this._player.getMaxHealth !== undefined ? this._player.getMaxHealth() : 20;
                }
            } catch (e) { /* ignore */ }
            try {
                if (this._hungerSystem) {
                    food = this._hungerSystem.getFoodLevel !== undefined ? this._hungerSystem.getFoodLevel() : 20;
                    maxFood = 20;
                }
            } catch (e) { /* ignore */ }

            this._guiRenderer.renderAll({
                health: health,
                maxHealth: maxHealth,
                food: food,
                maxFood: maxFood,
                selectedSlot: this._hotbar ? this._hotbar.getSelectedSlot() : 0,
                crosshair: true,
                hotbar: true
            }, this._canvas.width, this._canvas.height);
        }

        // Render entities (animated, position-aware, awareness-based culling)
        if (this._renderEntity && this._entityRenderer && this._camera && this._entityManager) {
            try {
                this._entityRenderer.render();
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Entity render failed: ' + e.message);
            }
        }

        // Render map view (2D overhead map + minimap) — always update each frame
        if (this._mapRenderer && this._player) {
            try {
                var playerPos = this._player.getPosition();
                var playerRot = this._player.getRotation();

                // Update time of day on the map renderer for the time dial display
                var timeOfDay = this._getTimeOfDay();
                this._mapRenderer.setTimeOfDay(timeOfDay);

                // Update game mode on the map renderer for interactive time dial
                var playerGameMode = this._player.getGameMode ? this._player.getGameMode() : null;
                this._mapRenderer.setGameMode(playerGameMode);

                this._mapRenderer.renderFullMap(playerPos, playerRot.yaw, playerRot.pitch);
                this._mapRenderer.renderMinimap(playerPos, playerRot.yaw, playerRot.pitch);
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Map render error: ' + e.message);
            }
        }

    };

})();
