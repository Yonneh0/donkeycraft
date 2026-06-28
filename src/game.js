// Donkeycraft — Main Game Class
// Main game class: initialization, main loop (update + render), pause/resume.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Game — orchestrates all subsystems into a cohesive game loop.
     * @param {Object} [options] - Configuration options.
     * @param {number} [options.renderDistance] - Override render distance (uses Config.RENDER_DISTANCE if null).
     * @param {string} [options.gameMode] - Starting game mode ('survival', 'creative', 'spectator').
     */
    Donkeycraft.Game = function(options) {
        options = options || {};

        this._renderDistance = options.renderDistance || Config.RENDER_DISTANCE;
        this._gameMode = options.gameMode || 'survival';

        // Core systems
        this._canvas = null;
        this._gl = null;
        this._glContext = null;
        this._shaderManager = null;
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

        // Game systems
        this._timer = null;
        this._input = null;
        this._player = null;
        this._chunkManager = null;
        this._eventBus = null;
        this._redstoneEngine = null;

        // Movement systems (set by external code or initialized here)
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

        // Overlay elements
        this._overlay = null;

        // Hotbar reference for key-based slot selection
        this._hotbar = null;

        // Debug overlay toggle state (F3)
        this._debugVisible = false;

        // GuiManager reference for GUI screen management
        this._guiManager = null;

        // Auto-save system (uses Config.AUTO_SAVE_INTERVAL, CHUNKS_PER_SAVE, SAVE_BATCH_DELAY)
        this._autoSaveTimer = 0;
        this._worldStore = null;

        // Interaction cooldown tracking (prevents rapid block break/place)
        this._lastInteractionTime = 0;
        this._INTERACTION_COOLDOWN_MS = 150; // Minimum ms between interactions

        // Player hitbox dimensions (from Config)
        this._playerWidth = Config.PLAYER_WIDTH;
        this._playerHeight = Config.PLAYER_HEIGHT;
    };

    /**
     * Initialize all subsystems and prepare for the game loop.
     * @returns {boolean} True if initialization succeeded.
     */
    Donkeycraft.Game.prototype.init = function() {
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

            // Create Web Audio Context for sound generation and initialize AssetManager
            try {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    this._audioContext = new AudioContext();
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
                        Donkeycraft.Logger.info('Game', 'Texture atlas created: ' + atlas.getTextureCount() + ' textures');
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

            // Create chunk manager
            this._chunkManager = new Donkeycraft.ChunkManager({
                renderDistance: this._renderDistance
            });

            // Set up world data access for terrain renderer
            var self = this;
            this._terrainRenderer.setWorldData(function(wx, wy, wz) {
                return self._getBlockAt(wx, wy, wz);
            });

            // Set up chunk manager callbacks
            var cm = this._chunkManager;
            cm.onChunkLoad = function(chunk) {
                // Donkeycraft.Logger.info('Game', 'Chunk loaded: [' + chunk.chunkX + ', ' + chunk.chunkZ + ']');
            };
            cm.onChunkUnload = function(chunk) {
                // Donkeycraft.Logger.info('Game', 'Chunk unloaded: [' + chunk.chunkX + ', ' + chunk.chunkZ + ']');
                self._terrainRenderer.markChunkDirty(chunk.chunkX, chunk.chunkZ);
            };

            // Set initial player position to spawn point
            var spawnY = Math.floor(Config.WORLD_HEIGHT / 2);
            this._player.setPosition(0.5, spawnY, 0.5);
            this._camera.setPosition(0.5, spawnY + Config.PLAYER_EYE_HEIGHT, 0.5);

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

            Donkeycraft.Logger.info('Game', 'Initialization complete');
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
    Donkeycraft.Game.prototype.setWorldStore = function(worldStore) {
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
    Donkeycraft.Game.prototype.setLevelData = function(levelData, worldName) {
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
    Donkeycraft.Game.prototype.setHotbar = function(hotbar) {
        this._hotbar = hotbar || null;
    };

    /**
     * setGuiManager — set the GUI manager for screen management.
     * @param {Donkeycraft.GuiManager} guiManager - GuiManager instance.
     */
    Donkeycraft.Game.prototype.setGuiManager = function(guiManager) {
        this._guiManager = guiManager || null;
    };

    /**
     * toggleDebugOverlay — toggles the F3 debug overlay visibility using CSS class.
     * @returns {boolean} True if debug is now visible.
     */
    Donkeycraft.Game.prototype.toggleDebugOverlay = function() {
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
    Donkeycraft.Game.prototype.isDebugVisible = function() {
        return this._debugVisible;
    };

    /**
     * setSystems — set external system references (called after Game.init()).
     * If constructor functions are passed instead of instances, they will be instantiated
     * using the systems created during Game.init() (input, player, collision, chunkManager).
     * @param {Function|Object} movementSystem - Movement physics system (constructor or instance).
     * @param {Function|Object} collisionSystem - Collision detection system (constructor or instance).
     * @param {Function|Object} jumpSystem - Jump mechanics system (constructor or instance).
     * @param {Function|Object} flyingSystem - Flying mechanics system (constructor or instance).
     * @param {Object} raycastSystem - Raycasting system (static module, not a constructor).
     * @param {Object} blockActionSystem - Block breaking system (static module, not a constructor).
     * @param {Object} blockPlacementSystem - Block placement system (static module, not a constructor).
     * @param {Object} interactableBlocksSystem - Interactable blocks system (static module, not a constructor).
     * @param {Object} [redstoneEngine] - Redstone engine instance (optional).
     * @returns {boolean} True if all systems were set successfully.
     */
    Donkeycraft.Game.prototype.setSystems = function(
        movementSystem, collisionSystem, jumpSystem, flyingSystem,
        raycastSystem, blockActionSystem, blockPlacementSystem, interactableBlocksSystem, redstoneEngine
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

        // Instantiate Collision first (so Movement can reference it without creating a temp instance)
        if (collisionSystem && typeof collisionSystem === 'function') {
            try {
                this._collisionSystem = new collisionSystem(this._chunkManager);
                Donkeycraft.Logger.info('Game', 'Collision system instantiated from constructor');
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Collision instantiation failed: ' + e.message);
                return false;
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
                    this._collisionSystem,
                    this._chunkManager
                );
                Donkeycraft.Logger.info('Game', 'Movement system instantiated from constructor');
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Movement instantiation failed: ' + e.message);
                return false;
            }
        } else if (movementSystem) {
            this._movementSystem = movementSystem;
        } else {
            Donkeycraft.Logger.warn('Game', 'No movement system provided');
        }

        // Instantiate Jumping if passed as a constructor (needs player, input, collision)
        if (jumpSystem && typeof jumpSystem === 'function') {
            try {
                this._jumpSystem = new jumpSystem(
                    this._player,
                    this._input,
                    this._collisionSystem
                );
                Donkeycraft.Logger.info('Game', 'Jump system instantiated from constructor');
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Jump instantiation failed: ' + e.message);
                return false;
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
                Donkeycraft.Logger.info('Game', 'Flying system instantiated from constructor');
            } catch (e) {
                Donkeycraft.Logger.error('Game', 'Flying instantiation failed: ' + e.message);
                return false;
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

            Donkeycraft.Logger.info('Game', 'Redstone engine initialized and started');
        }

        Donkeycraft.Logger.info('Game', 'Systems wired successfully');
        return true;
    };

    /**
     * Save dirty chunks to IndexedDB via WorldStore.saveDirtyChunks().
     * Delegates full serialization (blockData, skyLight, blockLight) to WorldStore.
     * @private
     * @param {string} worldName - World name identifier.
     * @returns {Promise<number>|number} Promise resolving to chunk count saved, or 0 if not available.
     */
    Donkeycraft.Game.prototype._saveDirtyChunks = function(worldName) {
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
    Donkeycraft.Game.prototype.start = function() {
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
            Donkeycraft.Logger.info('Game', 'Pre-loaded chunks at [' + playerChunkX + ', ' + playerChunkZ + ']');
        }

        // Register tick and render callbacks
        var self = this;
        this._unsubscribeTick = this._timer.onTick(function(dt, tickCount) {
            self._tick(dt, tickCount);
        });

        this._unsubscribeRender = this._timer.onRender(function(dt) {
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

        Donkeycraft.Logger.info('Game', 'Game loop started');
    };

    /**
     * Stop the game loop.
     */
    Donkeycraft.Game.prototype.stop = function() {
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

        Donkeycraft.Logger.info('Game', 'Game loop stopped');
    };

    /**
     * Pause the game loop.
     */
    Donkeycraft.Game.prototype.pause = function() {
        if (!this._running || this._paused) return;
        this._paused = true;
        if (this._timer) {
            this._timer.stop();
        }
        Donkeycraft.Logger.info('Game', 'Game paused');
    };

    /**
     * Resume the game loop.
     */
    Donkeycraft.Game.prototype.resume = function() {
        if (!this._running || !this._paused) return;
        this._paused = false;
        if (this._timer) {
            this._timer.start();
        }
        Donkeycraft.Logger.info('Game', 'Game resumed');
    };

    /**
     * isRunning — check if the game is currently running.
     * @returns {boolean}
     */
    Donkeycraft.Game.prototype.isRunning = function() {
        return this._running;
    };

    /**
     * Check if the game is paused.
     * @returns {boolean}
     */
    Donkeycraft.Game.prototype.isPaused = function() {
        return this._paused;
    };

    /**
     * Get the current FPS.
     * @returns {number}
     */
    Donkeycraft.Game.prototype.getFPS = function() {
        if (this._timer) {
            return this._timer.getFPS();
        }
        return 0;
    };

    /**
     * Get the current game tick count.
     * @returns {number}
     */
    Donkeycraft.Game.prototype.getTickCount = function() {
        if (this._timer) {
            return this._timer.getTickCount();
        }
        return 0;
    };

    /**
     * Get the player entity.
     * @returns {Donkeycraft.Player}
     */
    Donkeycraft.Game.prototype.getPlayer = function() {
        return this._player;
    };

    /**
     * Get the camera.
     * @returns {Donkeycraft.Camera}
     */
    Donkeycraft.Game.prototype.getCamera = function() {
        return this._camera;
    };

    /**
     * Get the chunk manager.
     * @returns {Donkeycraft.ChunkManager}
     */
    Donkeycraft.Game.prototype.getChunkManager = function() {
        return this._chunkManager;
    };

    /**
     * Get the input handler.
     * @returns {Donkeycraft.Input}
     */
    Donkeycraft.Game.prototype.getInput = function() {
        return this._input;
    };

    /**
     * Get the timer.
     * @returns {Donkeycraft.Timer}
     */
    Donkeycraft.Game.prototype.getTimer = function() {
        return this._timer;
    };

    /**
     * Get the event bus.
     * @returns {Donkeycraft.EventBus}
     */
    Donkeycraft.Game.prototype.getEventBus = function() {
        return this._eventBus;
    };

    /**
     * setOverlay — set the overlay DOM element used for pointer lock target.
     * @param {HTMLElement} overlayEl - The overlay container element.
     */
    Donkeycraft.Game.prototype.setOverlay = function(overlayEl) {
        this._overlay = overlayEl;
    };

    /**
     * isPointerLocked — check if pointer lock is currently active.
     * @returns {boolean} True if pointer is locked.
     */
    Donkeycraft.Game.prototype.isPointerLocked = function() {
        return document.pointerLockElement !== null;
    };

    /**
     * Enable or disable camera synchronization with player.
     * @param {boolean} enabled - Whether to sync camera to player.
     */
    Donkeycraft.Game.prototype.setCameraSync = function(enabled) {
        this._cameraSyncEnabled = !!enabled;
    };

    /**
     * Request pointer lock for mouse capture.
     */
    Donkeycraft.Game.prototype.requestPointerLock = function() {
        if (this._overlay) {
            this._overlay.requestPointerLock();
        } else {
            document.body.requestPointerLock();
        }
    };

    /**
     * Exit pointer lock.
     */
    Donkeycraft.Game.prototype.exitPointerLock = function() {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    };

    /**
     * Destroy the game and free all resources.
     */
    Donkeycraft.Game.prototype.destroy = function() {
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

        // Clean up interaction cooldown state
        this._lastInteractionTime = 0;

        // Persist final state before shutdown
        if (this._levelData && this._levelData.persistToStore) {
            try {
                this._levelData.persistToStore().then(function() {
                    Donkeycraft.Logger.info('Game', 'Final world state saved on destroy');
                }).catch(function() {
                    Donkeycraft.Logger.warn('Game', 'Final world save failed on destroy');
                });
            } catch (e) {
                Donkeycraft.Logger.warn('Game', 'Final world save error: ' + e.message);
            }
        }

        // Close WorldStore connection if active
        if (this._worldStore && this._worldStore.destroy) {
            try {
                this._worldStore.destroy();
            } catch (e) {}
        }

        // Clean up auto-save timer
        this._autoSaveTimer = 0;
        this._worldStore = null;
        this._levelData = null;

        Donkeycraft.Logger.info('Game', 'Game destroyed');
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
    Donkeycraft.Game.prototype._loadShaderSource = function(sourceId) {
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
    Donkeycraft.Game.prototype._extractVariable = function(source, varName) {
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
    Donkeycraft.Game.prototype._escapeRegex = function(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    /**
     * Compile shader programs from embedded script tag sources.
     * Parses JavaScript variable declarations: var NAME = `GLSL...`;
     * @private
     */
    Donkeycraft.Game.prototype._compileShaderPrograms = function() {
        var vertSrc = this._loadShaderSource('dk-vertex-shaders');
        var fragSrc = this._loadShaderSource('dk-fragment-shaders');

        if (!vertSrc || !fragSrc) {
            Donkeycraft.Logger.warn('Game', 'Shader sources not found — using fallback compilation');
            this._compileFallbackShaders();
            return;
        }

        // Log raw source lengths for debugging
        Donkeycraft.Logger.info('Game', 'Vertex shader source length: ' + vertSrc.length);
        Donkeycraft.Logger.info('Game', 'Fragment shader source length: ' + fragSrc.length);

        // Extract and compile individual shader programs with error handling
        var self2 = this;
        var _compileShaderPair = function(name, vertName, fragName) {
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
                    Donkeycraft.Logger.info('Game', 'Shader program "' + name + '" compiled successfully');
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

        // Log compilation results
        var stats = this._shaderManager.getStats();
        Donkeycraft.Logger.info('Game', 'Shader programs compiled: ' + stats.programs + ' programs, ' + stats.shaders + ' shaders');
    };

    /**
     * Compile fallback shaders when embedded sources are not available.
     * Includes ALL required uniforms to prevent missing uniform warnings.
     * @private
     */
    Donkeycraft.Game.prototype._compileFallbackShaders = function() {
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

        // Minimal sky shader WITH all required uniforms (uTopColor, uBottomColor, uHorizon)
        this._shaderManager.createProgram('sky',
            'attribute vec3 aPosition;\n' +
            'attribute vec2 aUV;\n' +
            'uniform mat4 uProjection;\n' +
            'uniform mat4 uView;\n' +
            'varying vec2 vUV;\n' +
            'varying vec3 vWorldPos;\n' +
            'void main() {\n' +
            '  gl_Position = uProjection * uView * vec4(aPosition, 1.0);\n' +
            '  vUV = aUV;\n' +
            '  vWorldPos = aPosition;\n' +
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
    Donkeycraft.Game.prototype._resizeCanvas = function() {
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
    Donkeycraft.Game.prototype._getTimeOfDay = function() {
        var tickCount = this.getTickCount();
        var ticksPerDay = Config.WORLD_TIME_SCALE * 60; // 60-second full day cycle
        return ((tickCount % ticksPerDay) + ticksPerDay) % ticksPerDay / ticksPerDay;
    };

    /**
     * Get the block ID at world coordinates.
     * @private
     * @param {number} wx - World X coordinate.
     * @param {number} wy - World Y coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} Block ID at the given position.
     */
    Donkeycraft.Game.prototype._getBlockAt = function(wx, wy, wz) {
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
    Donkeycraft.Game.prototype._tick = function(dt, tickCount) {
        if (!this._running || this._paused) return;

        // Update input key states and mouse button states (for just-pressed detection)
        if (this._input) {
            this._input.updateKeyStates();
            this._input.updateMouseButtonStates();
        }

        // Tick block break progress (decrement timers, spawn drops)
        if (this._blockActionSystem && this._chunkManager) {
            this._blockActionSystem.tickBreakProgress(dt);
        }

        // Process player movement and collision
        this._updatePlayer(dt);

        // Update chunk manager based on player position
        this._updateChunks();

        // Process interactions (block break/place)
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
            } catch (e) {}
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
                    savePromise.then(function(count) {
                        Donkeycraft.Logger.info('Game', 'Auto-saved ' + count + ' chunks to world: ' + worldName);
                    }).catch(function(e) {
                        Donkeycraft.Logger.warn('Game', 'Auto-save failed: ' + (e && e.message ? e.message : String(e)));
                    });
                } else if (typeof savePromise === 'number') {
                    Donkeycraft.Logger.info('Game', 'Auto-saved ' + savePromise + ' chunks to world: ' + worldName);
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
     * Update player movement based on input.
     * @private
     * @param {number} dt - Delta time in seconds.
     */
    Donkeycraft.Game.prototype._updatePlayer = function(dt) {
        if (!this._player || !this._input) return;

        var pos = this._player.getPosition();
        var vel = this._player.getVelocity();
        var rot = this._player.getRotation();

        // Determine movement direction from input
        var moveX = 0;
        var moveZ = 0;
        var isSprinting = this._input.isKeyDown('ShiftLeft');

        if (this._input.isKeyDown('KeyW')) moveZ -= 1;
        if (this._input.isKeyDown('KeyS')) moveZ += 1;
        if (this._input.isKeyDown('KeyA')) moveX -= 1;
        if (this._input.isKeyDown('KeyD')) moveX += 1;

        // Normalize diagonal movement
        if (moveX !== 0 && moveZ !== 0) {
            var invSqrt2 = 0.70710678118;
            moveX *= invSqrt2;
            moveZ *= invSqrt2;
        }

        // Determine if player is in flying mode (creative with flight enabled or spectator)
        var isFlying = (this._player.gameMode === 'creative' && this._player.flyEnabled) ||
                       this._player.gameMode === 'spectator';

        // Apply movement based on game mode
        if (isFlying) {
            this._updateFlyingMovement(dt, moveX, moveZ, isSprinting);
        } else {
            this._updateWalkingMovement(dt, moveX, moveZ, isSprinting);

            // Handle jumping (before gravity, so jump happens before falling)
            if (this._jumpSystem && this._input.isKeyJustPressed('Space')) {
                if (this._jumpSystem.canJump(this._player)) {
                    this._jumpSystem.performJump(this._player);
                }
            }

            // Handle swimming upward — use Config.SWIM_BOOST for upward velocity boost
            if (this._input.isKeyDown('Space') && this._jumpSystem && this._jumpSystem.isSwimmingUp(this._player)) {
                vel.y += Config.SWIM_BOOST;
            }
        }

        // Apply gravity only when not flying (spectator and creative-fly ignore gravity)
        if (!isFlying) {
            vel.y += Config.GRAVITY * dt;

            // Clamp vertical velocity to terminal velocity from Config
            if (vel.y < Config.TERMINAL_VELOCITY) vel.y = Config.TERMINAL_VELOCITY;
        } else if (this._player.gameMode === 'creative' && this._player.flyEnabled) {
            // Creative flying: clamp downward fly speed only
            if (vel.y > -Config.FLYING_TERMINAL_VELOCITY) vel.y = -Config.FLYING_TERMINAL_VELOCITY;
        }
        // Spectator mode: no velocity clamping — free movement

        // Handle knockback — modify directly on player object to ensure decay persists
        var kb = this._player.getKnockback();
        if (kb && (kb.x !== 0 || kb.z !== 0)) {
            vel.x += kb.x * dt;
            vel.z += kb.z * dt;
            // Decay knockback directly on the player's knockback object
            kb.x *= 0.9;
            kb.z *= 0.9;
            if (Math.abs(kb.x) < 0.01) { kb.x = 0; kb.z = 0; }
        }

        // Resolve collision if collision system is available
        if (this._collisionSystem) {
            var deltaX = vel.x * dt;
            var deltaY = vel.y * dt;
            var deltaZ = vel.z * dt;

            var result = this._collisionSystem.resolveMovement(
                pos, { x: deltaX, y: deltaY, z: deltaZ },
                this._player.width, this._player.height
            );

            pos.x = result.newX;
            pos.y = result.newY;
            pos.z = result.newZ;
        } else {
            // Fallback: apply velocity directly (no collision)
            pos.x += vel.x * dt;
            pos.y += vel.y * dt;
            pos.z += vel.z * dt;
        }

        // Update player rotation from camera
        rot.yaw = this._camera.getYaw();
        rot.pitch = this._camera.getPitch();

        // Emit player tick event
        this._player._notifyTick(dt);
    };

    /**
     * Update walking movement based on input.
     * @private
     * @param {number} dt - Delta time.
     * @param {number} moveX - Horizontal input X.
     * @param {number} moveZ - Horizontal input Z.
     * @param {boolean} isSprinting - Whether sprinting.
     */
    Donkeycraft.Game.prototype._updateWalkingMovement = function(dt, moveX, moveZ, isSprinting) {
        var vel = this._player.getVelocity();

        // Get movement speed from Config based on game mode and sprint state
        var speed = Config.PLAYER_SPEED; // Survival walking speed
        if (this._player.gameMode === 'creative') {
            speed = Config.PLAYER_FLY_SPEED; // Creative walking speed (uses same base)
        }
        if (isSprinting) {
            speed = Config.PLAYER_SPRINT_SPEED; // Sprint speed from Config
        }

        // Apply horizontal movement
        vel.x = moveX * speed;
        vel.z = moveZ * speed;
    };

    /**
     * Update flying movement based on input.
     * @private
     * @param {number} dt - Delta time.
     * @param {number} moveX - Horizontal input X.
     * @param {number} moveZ - Horizontal input Z.
     * @param {boolean} isSprinting - Whether sprinting.
     */
    Donkeycraft.Game.prototype._updateFlyingMovement = function(dt, moveX, moveZ, isSprinting) {
        var vel = this._player.getVelocity();

        // Get flying speed from Config based on sprint state
        var speed = isSprinting ? Config.PLAYER_FLY_SPEED_BOOST : Config.PLAYER_FLY_SPEED;

        // Apply horizontal movement
        vel.x = moveX * speed;
        vel.z = moveZ * speed;

        // Handle up/down flying
        if (this._input.isKeyDown('Space')) {
            vel.y += speed * 0.5;
        }
        if (this._input.isKeyDown('ShiftLeft')) {
            vel.y -= speed * 0.5;
        }
    };

    /**
     * Update chunk loading/unloading based on player position.
     * @private
     */
    Donkeycraft.Game.prototype._updateChunks = function() {
        if (!this._player || !this._chunkManager || !this._terrainRenderer) return;

        var pos = this._player.getPosition();
        var chunkX = Math.floor(pos.x / Config.CHUNK_SIZE);
        var chunkZ = Math.floor(pos.z / Config.CHUNK_SIZE);

        // Only update chunks if player has moved to a new chunk
        if (chunkX === this._lastPlayerChunkX && chunkZ === this._lastPlayerChunkZ) {
            return;
        }

        this._lastPlayerChunkX = chunkX;
        this._lastPlayerChunkZ = chunkZ;

        // Update chunk manager with new player position
        this._chunkManager.updatePlayerPosition(chunkX, chunkZ);

        // Mark all chunks in the terrain renderer as needing update
        var dirtyChunks = this._chunkManager.getDirtyChunks();
        for (var i = 0; i < dirtyChunks.length; i++) {
            this._terrainRenderer.markChunkDirty(dirtyChunks[i].chunkX, dirtyChunks[i].chunkZ);
        }
    };

    /**
     * Force initial chunk load — ensures chunks exist before first render frame.
     * Called from _render() on the very first frame to break the render-before-tick deadlock.
     * @private
     */
    Donkeycraft.Game.prototype._forceChunkLoad = function() {
        if (!this._player || !this._chunkManager || !this._terrainRenderer) return;

        var pos = this._player.getPosition();
        var chunkX = Math.floor(pos.x / Config.CHUNK_SIZE);
        var chunkZ = Math.floor(pos.z / Config.CHUNK_SIZE);

        // Force update even if player hasn't moved (first frame)
        this._lastPlayerChunkX = chunkX;
        this._lastPlayerChunkZ = chunkZ;
        this._chunkManager.updatePlayerPosition(chunkX, chunkZ);

        var dirtyChunks = this._chunkManager.getDirtyChunks();
        for (var i = 0; i < dirtyChunks.length; i++) {
            this._terrainRenderer.markChunkDirty(dirtyChunks[i].chunkX, dirtyChunks[i].chunkZ);
        }
    };

    /**
     * _shouldProcessInteraction — check if enough time has passed since the last interaction.
     * @private
     * @returns {boolean} True if the cooldown has elapsed and interactions should be processed.
     */
    Donkeycraft.Game.prototype._shouldProcessInteraction = function() {
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
    Donkeycraft.Game.prototype._wouldOverlapPlayer = function(bx, by, bz) {
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
    Donkeycraft.Game.prototype._getSelectedBlockId = function() {
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
    Donkeycraft.Game.prototype._processInteractions = function() {
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
    Donkeycraft.Game.prototype._render = function(dt) {
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

        // Update chunk meshes in terrain renderer
        if (this._terrainRenderer && this._player) {
            var pos = this._player.getPosition();
            var chunkX = Math.floor(pos.x / Config.CHUNK_SIZE);
            var chunkZ = Math.floor(pos.z / Config.CHUNK_SIZE);
            this._terrainRenderer.updateChunks(chunkX, chunkZ);
        }

        // Update time of day and apply lighting to sky
        try {
            if (this._lighting) {
                var timeOfDay = this._getTimeOfDay();
                this._lighting.setTimeOfDay(timeOfDay);
            }
            if (this._sky) {
                this._sky.render(this._camera, this._lighting);
            }
        } catch (e) {
            Donkeycraft.Logger.error('Game', 'Sky render failed: ' + e.message);
        }

        // Render terrain (handles fog color + uLightFactor internally)
        try {
            if (this._terrainRenderer && this._camera) {
                this._terrainRenderer.render(this._camera);
            }
        } catch (e) {
            Donkeycraft.Logger.error('Game', 'Terrain render failed: ' + e.message);
        }

        // Render break particles
        if (this._breakParticles) {
            this._breakParticles.render(this._camera);
        }

        // Render hand (first-person item)
        if (this._handRenderer && this._camera && this._canvas) {
            this._handRenderer.render(this._camera, this._canvas.width, this._canvas.height);
        }

        // Tick and render weather effects
        if (this._weather && this._weatherRenderer) {
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

        // Render GUI overlay (crosshair, HUD elements)
        if (this._guiRenderer && this._canvas) {
            this._guiRenderer.renderAll(null, this._canvas.width, this._canvas.height);
        }
    };

})();