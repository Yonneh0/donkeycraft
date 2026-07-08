/**
 * Donkeycraft — Debug Terrain Renderer
 * Renders semi-transparent block transition surfaces showing where different block types meet.
 * Uses the TerrainController for camera control and input handling.
 * @module debug-render
 */
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    // ============================================================
    // DebugTerrainRenderer Constructor
    // ============================================================

    /**
     * DebugTerrainRenderer — Renders block transition surfaces for terrain debugging.
     * Uses a shared WebGL context, the TerrainController for camera/input, and generates
     * geometry for faces where adjacent blocks have different IDs (including air).
     *
     * @constructor
     */
    Donkeycraft.DebugTerrainRenderer = function () {
        /** @type {HTMLCanvasElement|null} */
        this._canvas = null;

        /** @type {WebGLRenderingContext|null} */
        this._gl = null;

        /** @type {WebGLProgram|null} */
        this._terrainProgram = null;

        /** @type {Object} */
        this._terrainLocs = {};

        /** @type {WebGLProgram|null} */
        this._skyProgram = null;

        /** @type {Object} */
        this._skyLocs = {};

        /** @type {Donkeycraft.TerrainController|null} */
        this._controller = null;

        // Chunk state
        /** @type {Map<string, Donkeycraft.Chunk>} */
        this._chunks = new Map();

        /** @type {number} */
        this._currentChunkX = 0;

        /** @type {number} */
        this._currentChunkZ = 0;

        // Chunk render radii (directional)
        /** @type {number} */
        this._chunkRadiusN = 7;

        /** @type {number} */
        this._chunkRadiusS = 8;

        /** @type {number} */
        this._chunkRadiusE = 8;

        /** @type {number} */
        this._chunkRadiusW = 7;

        // Generation options
        /** @type {number} */
        this._selectedBiomeId = 1;

        /** @type {number} */
        this._worldSeed = 42;

        /** @type {{caves: boolean, ores: boolean, water: boolean, surface: boolean}} */
        this._options = { caves: true, ores: true, water: true, surface: true };

        // Mesh cache and dirty tracking
        /** @type {Object.<string, {posBuf: WebGLBuffer, colorBuf: WebGLBuffer, alphaBuf: WebGLBuffer, normBuf: WebGLBuffer, count: number}>} */
        this._meshBuffers = {};

        /** @type {Set<string>} */
        this._dirtyChunks = new Set();

        /** @type {boolean} */
        this._firstFrameBuilt = false;

        // Dynamic chunk loading
        /** @type {Set<string>} */
        this._loadedChunkKeys = new Set();

        /** @type {Map<string, {promise: Promise, cx: number, cz: number, completed: boolean}>} */
        this._pendingChunkQueue = new Map();

        /** @type {boolean} */
        this._isTabVisible = true;

        // View distance and limits
        /** @type {number} */
        this._viewDistanceBlocks = 128;

        /** @type {number} */
        this._maxPendingChunks = 8;

        /** @type {number} */
        this._maxChunkRadius = 31;

        /** @type {number} */
        this._maxGridCells = 4096;

        // Terrain generation timing
        /** @type {number} */
        this._generationStartTime = 0;

        /** @type {number} */
        this._generationElapsedMs = 0;

        // Periodic save timer
        /** @type {number} */
        this._lastSaveTime = 0;

        // Ready flag
        /** @type {boolean} */
        this._ready = false;

        // Sky buffers (created once)
        /** @type {WebGLBuffer|null} */
        this._skyPosBuf = null;

        /** @type {WebGLBuffer|null} */
        this._skyColBuf = null;

        // Callback for terrain regeneration completion
        /** @type {Function|null} */
        this._onTerrainRegenerated = null;
    };

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Initialize the debug terrain renderer.
     * Creates WebGL context, compiles shaders, and optionally attaches to a TerrainController.
     * If no controller is provided, the renderer will create and manage its own.
     *
     * @param {string} canvasId - ID of the canvas element.
     * @param {Donkeycraft.TerrainController|null} [controller=null] - Optional shared TerrainController.
     * @returns {boolean} True if initialization succeeded.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.init = function (canvasId, controller) {
        this._canvas = document.getElementById(canvasId);
        if (!this._canvas) {
            console.error('[DebugTerrain] Canvas not found:', canvasId);
            return false;
        }

        this._gl = this._canvas.getContext('webgl', { antialias: false, alpha: false });
        if (!this._gl) {
            console.error('[DebugTerrain] WebGL not supported');
            return false;
        }

        // Initialize block colors
        if (Donkeycraft.BlockColors && typeof Donkeycraft.BlockColors.init === 'function') {
            Donkeycraft.BlockColors.init();
        }

        // Compile shaders
        this._terrainProgram = this._createProgram(
            Donkeycraft.DK_TERRAIN_VS,
            Donkeycraft.DK_TERRAIN_FS
        );
        this._skyProgram = this._createProgram(
            Donkeycraft.DK_SKY_VS,
            Donkeycraft.DK_SKY_FS
        );

        if (!this._terrainProgram || !this._skyProgram) {
            console.error('[DebugTerrain] Shader compilation failed');
            return false;
        }

        // Get attribute/uniform locations
        this._setupTerrainLocations();
        this._setupSkyLocations();

        // Use provided controller or create our own
        if (controller && controller.isReady) {
            this._controller = controller;
        } else {
            this._controller = new Donkeycraft.TerrainController();
            this._controller.init(canvasId);
        }

        // Register key actions on the controller
        this._registerKeyActions();

        // Resize canvas to window dimensions
        this._resizeCanvas();
        window.addEventListener('resize', this._resizeCanvas.bind(this));

        // Listen for tab visibility changes
        document.addEventListener('visibilitychange', this._onVisibilityChange.bind(this));

        this._ready = true;
        return true;
    };

    /**
     * Start the render loop.
     * Must be called after init() to begin rendering.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.start = function () {
        if (!this._ready) return;
        requestAnimationFrame(this._renderLoop.bind(this));
    };

    /**
     * Set the current chunk position (center of view).
     * @param {number} cx - Chunk X coordinate.
     * @param {number} cz - Chunk Z coordinate.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setCurrentChunk = function (cx, cz) {
        this._currentChunkX = cx;
        this._currentChunkZ = cz;
    };

    /**
     * Set chunk render radii in each direction.
     * @param {{n: number, s: number, e: number, w: number}} radii - Directional radii.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setRadii = function (radii) {
        if (!radii || typeof radii !== 'object') return;
        if (radii.n !== undefined) this._chunkRadiusN = radii.n;
        if (radii.s !== undefined) this._chunkRadiusS = radii.s;
        if (radii.e !== undefined) this._chunkRadiusE = radii.e;
        if (radii.w !== undefined) this._chunkRadiusW = radii.w;
    };

    /**
     * Get current chunk radii.
     * @returns {{n: number, s: number, e: number, w: number}}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getRadii = function () {
        return {
            n: this._chunkRadiusN,
            s: this._chunkRadiusS,
            e: this._chunkRadiusE,
            w: this._chunkRadiusW
        };
    };

    /**
     * Set the biome ID for terrain generation.
     * @param {number} biomeId - The biome ID to use.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setBiome = function (biomeId) {
        this._selectedBiomeId = biomeId;
    };

    /**
     * Get the current biome ID.
     * @returns {number} Current biome ID.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getBiome = function () {
        return this._selectedBiomeId;
    };

    /**
     * Set the world seed for terrain generation.
     * @param {number} seed - The seed value.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setSeed = function (seed) {
        this._worldSeed = seed;
    };

    /**
     * Set terrain generation options.
     * @param {{caves: boolean, ores: boolean, water: boolean, surface: boolean}} options - Generation features.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setOptions = function (options) {
        if (!options || typeof options !== 'object') return;
        if (options.caves !== undefined) this._options.caves = options.caves;
        if (options.ores !== undefined) this._options.ores = options.ores;
        if (options.water !== undefined) this._options.water = options.water;
        if (options.surface !== undefined) this._options.surface = options.surface;
    };

    /**
     * Regenerate all terrain within current grid bounds.
     * Clears existing chunks and re-generates the entire grid.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.regenerateTerrain = function () {
        if (!this._ready) return;
        this._regenerateTerrain();
    };

    /**
     * Get the chunks map for inspection.
     * @returns {Map<string, Donkeycraft.Chunk>}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getChunks = function () {
        return this._chunks;
    };

    /**
     * Get the current camera position from the controller.
     * @returns {{x: number, y: number, z: number}}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getCameraPosition = function () {
        if (this._controller) return this._controller.getCameraPosition();
        return { x: 0, y: 100, z: 0 };
    };

    /**
     * Set camera position directly.
     * @param {number} x - World X coordinate.
     * @param {number} y - World Y coordinate (height).
     * @param {number} z - World Z coordinate.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setCameraPosition = function (x, y, z) {
        if (this._controller) this._controller.setCameraPosition(x, y, z);
    };

    /**
     * Place viewer above ground at current XZ position.
     * Searches upward from the top of the world to find the first solid block.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.placeAboveGround = function () {
        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
        var ws = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

        var pos = this.getCameraPosition();
        var camChunkX = Math.floor(pos.x / cs);
        var camChunkZ = Math.floor(pos.z / cs);
        var localX = ((pos.x % cs) + cs) % cs;
        var localZ = ((pos.z % cs) + cs) % cs;

        var key = camChunkX + ',' + camChunkZ;
        var chunk = this._chunks.get(key);

        if (chunk) {
            var surfaceY = 0;
            for (var y = ws - 1; y >= 0; y--) {
                if (chunk.getBlock(Math.floor(localX), y, Math.floor(localZ)) !== 0) {
                    surfaceY = y;
                    break;
                }
            }
            this.setCameraPosition(pos.x, surfaceY + 2, pos.z);
        } else {
            this.setCameraPosition(pos.x, 120, pos.z);
        }
    };

    /**
     * Set camera to a north-east overview view of the current chunk grid.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setNEOverview = function () {
        if (this._controller) {
            this._controller.setOverviewView(
                this._currentChunkX, this._currentChunkZ,
                this._chunkRadiusN, this._chunkRadiusS,
                this._chunkRadiusE, this._chunkRadiusW
            );
        }
    };

    /**
     * Get current FPS from the controller.
     * @returns {number} Frames per second.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getCurrentFps = function () {
        if (this._controller) return this._controller.getCurrentFps();
        return 0;
    };

    /**
     * Get the number of loaded chunks.
     * @returns {number}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getChunkCount = function () {
        return this._chunks.size;
    };

    /**
     * Get terrain generation elapsed time in milliseconds.
     * @returns {number}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getGenerationTime = function () {
        return this._generationElapsedMs;
    };

    /**
     * Set callback for terrain regeneration completion.
     * @param {Function} callback - Function called when all chunks finish generating.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setOnTerrainRegenerated = function (callback) {
        this._onTerrainRegenerated = callback;
    };

    /**
     * Get the TerrainController instance for external access.
     * @returns {Donkeycraft.TerrainController|null}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getController = function () {
        return this._controller;
    };

    // ============================================================
    // Key Actions Registration
    // ============================================================

    /**
     * Register special key actions on the TerrainController.
     * R = regenerate, E = ground level, F = overview, Q = speed cycle.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._registerKeyActions = function () {
        if (!this._controller) return;

        var self = this;

        // R = regenerate terrain
        this._controller.registerKeyAction('KeyR', function () {
            self._regenerateTerrain();
        });

        // E = place viewer above ground
        this._controller.registerKeyAction('KeyE', function () {
            self.placeAboveGround();
        });

        // F = NE overview view
        this._controller.registerKeyAction('KeyF', function () {
            self.setNEOverview();
        });

        // Q = cycle speed level
        this._controller.registerKeyAction('KeyQ', function () {
            self._controller.cycleSpeed();
        });
    };

    // ============================================================
    // Visibility Handler
    // ============================================================

    /**
     * Handle tab visibility changes.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._onVisibilityChange = function () {
        this._isTabVisible = !document.hidden;
    };

    // ============================================================
    // Shader Setup
    // ============================================================

    /**
     * Cache attribute and uniform locations for the terrain shader program.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._setupTerrainLocations = function () {
        var gl = this._gl;
        if (!gl) return;

        var locs = this._terrainLocs;
        locs.aPosition = gl.getAttribLocation(this._terrainProgram, 'aPosition');
        locs.aColor = gl.getAttribLocation(this._terrainProgram, 'aColor');
        locs.aAlpha = gl.getAttribLocation(this._terrainProgram, 'aAlpha');
        locs.aNormal = gl.getAttribLocation(this._terrainProgram, 'aNormal');
        locs.uProjection = gl.getUniformLocation(this._terrainProgram, 'uProjection');
        locs.uView = gl.getUniformLocation(this._terrainProgram, 'uView');
        locs.uModel = gl.getUniformLocation(this._terrainProgram, 'uModel');
        locs.uFogColor = gl.getUniformLocation(this._terrainProgram, 'uFogColor');
        locs.uFogDensity = gl.getUniformLocation(this._terrainProgram, 'uFogDensity');
        locs.uLightFactor = gl.getUniformLocation(this._terrainProgram, 'uLightFactor');
    };

    /**
     * Cache attribute and uniform locations for the sky shader program.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._setupSkyLocations = function () {
        var gl = this._gl;
        if (!gl) return;

        var locs = this._skyLocs;
        locs.aPosition = gl.getAttribLocation(this._skyProgram, 'aPosition');
        locs.aColor = gl.getAttribLocation(this._skyProgram, 'aColor');
        locs.uProjection = gl.getUniformLocation(this._skyProgram, 'uProjection');
        locs.uView = gl.getUniformLocation(this._skyProgram, 'uView');
        locs.uModel = gl.getUniformLocation(this._skyProgram, 'uModel');
    };

    // ============================================================
    // WebGL Helpers
    // ============================================================

    /**
     * Create and compile a shader from source code.
     * @param {number} type - Shader type (VERTEX_SHADER or FRAGMENT_SHADER).
     * @param {string} src - GLSL shader source code.
     * @returns {WebGLShader|null} The compiled shader, or null on failure.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._createShader = function (type, src) {
        if (!this._gl) return null;

        var s = this._gl.createShader(type);
        this._gl.shaderSource(s, src);
        this._gl.compileShader(s);

        if (!this._gl.getShaderParameter(s, this._gl.COMPILE_STATUS)) {
            console.error('[DebugTerrain] Shader compile failed:', this._gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    };

    /**
     * Create and link a shader program from vertex and fragment sources.
     * @param {string} vs - Vertex shader GLSL source.
     * @param {string} fs - Fragment shader GLSL source.
     * @returns {WebGLProgram|null} The linked program, or null on failure.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._createProgram = function (vs, fs) {
        if (!this._gl) return null;

        var a = this._createShader(this._gl.VERTEX_SHADER, vs);
        var b = this._createShader(this._gl.FRAGMENT_SHADER, fs);
        if (!a || !b) return null;

        var p = this._gl.createProgram();
        this._gl.attachShader(p, a);
        this._gl.attachShader(p, b);
        this._gl.linkProgram(p);

        if (!this._gl.getProgramParameter(p, this._gl.LINK_STATUS)) {
            console.error('[DebugTerrain] Program link failed:', this._gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    };

    // ============================================================
    // Resize Handler
    // ============================================================

    /**
     * Resize the canvas to match the window dimensions.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._resizeCanvas = function () {
        if (!this._canvas || !this._gl) return;
        this._canvas.width = window.innerWidth;
        this._canvas.height = window.innerHeight;
        this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    };

    // ============================================================
    // Block Lookup Across Chunk Boundaries
    // ============================================================

    /**
     * Get the block ID at world coordinates, loading from the appropriate chunk.
     * Handles coordinates outside the current chunk by looking up adjacent chunks.
     * Returns 0 (air) if the chunk is not loaded or coordinates are out of bounds.
     *
     * @param {number} gx - World X coordinate.
     * @param {number} gy - World Y coordinate.
     * @param {number} gz - World Z coordinate.
     * @returns {number} Block ID at the given world coordinates.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._getBlockAt = function (gx, gy, gz) {
        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
        var ws = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

        if (gy < 0 || gy >= ws) return 0;

        var cx = Math.floor(gx / cs);
        var cz = Math.floor(gz / cs);
        var lx = ((gx % cs) + cs) % cs;
        var lz = ((gz % cs) + cs) % cs;

        var key = cx + ',' + cz;
        var chunk = this._chunks.get(key);
        if (!chunk) return 0;

        return chunk.getBlock(lx, gy, lz);
    };

    // ============================================================
    // Projected Depth for Back-to-Front Rendering
    // ============================================================

    /**
     * Compute the projected depth of a world point along the camera's viewing direction.
     * Used for sorting transparent surfaces back-to-front.
     *
     * @param {number} px - World X coordinate.
     * @param {number} py - World Y coordinate.
     * @param {number} pz - World Z coordinate.
     * @returns {number} Projected depth (larger values = farther from camera).
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._projectedDepth = function (px, py, pz) {
        if (!this._controller) return 0;

        var cam = this._controller.getCamera();
        var cosYaw = Math.cos(cam.yaw);
        var sinYaw = Math.sin(cam.yaw);
        var cosPitch = Math.cos(cam.pitch);

        var fwdX = -sinYaw * cosPitch;
        var fwdY = -Math.sin(cam.pitch);
        var fwdZ = -cosYaw * cosPitch;

        var dx = px - cam.x;
        var dy = py - cam.y;
        var dz = pz - cam.z;

        return dx * fwdX + dy * fwdY + dz * fwdZ;
    };

    // ============================================================
    // Y-Bounds Computation (Optimization)
    // ============================================================

    /**
     * Compute the minimum and maximum Y coordinates containing non-air blocks in a chunk.
     * Used to limit the block iteration range during mesh building.
     * Adds a 2-block margin above and below for transition visibility.
     *
     * @param {Donkeycraft.Chunk} chunk - The chunk to analyze.
     * @returns {{minY: number, maxY: number}} Y-coordinate bounds.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._computeChunkYBounds = function (chunk) {
        var ws = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;
        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;

        var minY = -1, maxY = -1;

        // Find lowest non-air block
        for (var y = 0; y < ws && minY < 0; y++) {
            for (var x = 0; x < cs; x++) {
                for (var z = 0; z < cs; z++) {
                    if (chunk.getBlock(x, y, z) !== 0) { minY = y; break; }
                }
                if (minY >= 0) break;
            }
        }

        // Find highest non-air block
        for (var y = ws - 1; y >= 0 && maxY < 0; y--) {
            for (var x = 0; x < cs; x++) {
                for (var z = 0; z < cs; z++) {
                    if (chunk.getBlock(x, y, z) !== 0) { maxY = y; break; }
                }
                if (maxY >= 0) break;
            }
        }

        // Apply margin and clamp
        if (minY < 0 || maxY < 0) return { minY: 0, maxY: ws - 1 };
        if (minY > 1) minY -= 2; else minY = 0;
        if (maxY < ws - 2) maxY += 2; else maxY = ws - 1;

        return {
            minY: Math.max(0, minY),
            maxY: Math.min(ws - 1, maxY)
        };
    };

    // ============================================================
    // Block Transition Mesh Building
    // ============================================================

    /**
     * Build the transition surface mesh for a single chunk.
     *
     * For each non-air block in the chunk, checks all 6 neighbors using cross-chunk
     * lookups via _getBlockAt(). If a neighbor has a different block ID (including air
     * or unloaded chunks), an expanded border quad is added at the current block's position.
     *
     * The quad uses the current block's color and alpha from BlockColors.
     * Expanded extent (1.02) prevents z-fighting by ensuring adjacent transition faces
     * don't share exact coordinates.
     *
     * Mesh rebuilds are triggered by:
     * - Initial generation (all chunks marked dirty)
     * - New chunk loading (adjacent chunks marked dirty)
     *
     * @param {Donkeycraft.Chunk} chunk - The chunk to build mesh data for.
     * @returns {{posBuf: WebGLBuffer, colorBuf: WebGLBuffer, alphaBuf: WebGLBuffer, normBuf: WebGLBuffer, count: number}|null}
     *    Object containing WebGL buffers and vertex count, or {count: 0} if empty.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._buildTransitionMesh = function (chunk) {
        var key = chunk.chunkX + ',' + chunk.chunkZ;

        // Only rebuild when chunk is dirty
        if (!this._dirtyChunks.has(key)) {
            return this._meshBuffers[key];
        }
        this._dirtyChunks.delete(key);

        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
        var ws = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

        var yBounds = this._computeChunkYBounds(chunk);
        var startY = yBounds.minY;
        var endY = yBounds.maxY;

        if (startY > endY) {
            this._meshBuffers[key] = { count: 0 };
            return this._meshBuffers[key];
        }

        // Arrays for vertex data
        var pos = [];   // Position (x, y, z) × 3 per vertex
        var col = [];   // Color (r, g, b) × 3 per vertex
        var alp = [];   // Alpha (1 value) per vertex
        var nor = [];   // Normal (nx, ny, nz) × 3 per vertex

        var colors = Donkeycraft.BlockColors.getAllColors();
        var alphas = Donkeycraft.BlockColors.getAllAlphas();

        // Expanded quad extent to prevent z-fighting
        // Using 1.02 instead of 1.0 ensures faces slightly overlap, avoiding gaps
        var EXPAND_FACTOR = 1.02;

        // Face definitions: [direction, normal, corner positions]
        // Corners are ordered counter-clockwise when viewed from outside the block.
        var FACE_DEFS = [
            { d: [0, 1, 0], n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },   // +Y top
            { d: [0, -1, 0], n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] }, // -Y bottom
            { d: [0, 0, 1], n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },   // +Z south
            { d: [0, 0, -1], n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }, // -Z north
            { d: [1, 0, 0], n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },   // +X east
            { d: [-1, 0, 0], n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] }  // -X west
        ];

        // Chunk world-space origin for coordinate calculations
        var chunkWorldOX = chunk.chunkX * cs;
        var chunkWorldOZ = chunk.chunkZ * cs;

        // Iterate all blocks in the chunk within Y bounds
        for (var x = 0; x < cs; x++) {
            for (var y = startY; y <= endY; y++) {
                for (var z = 0; z < cs; z++) {
                    var bid = chunk.getBlock(x, y, z);

                    // Skip air blocks — only render transitions FROM non-air blocks
                    if (bid === 0) continue;

                    // Get color for this block
                    var clr = colors[bid];
                    if (!clr) continue;

                    // Check all 6 faces
                    for (var f = 0; f < FACE_DEFS.length; f++) {
                        var face = FACE_DEFS[f];

                        // Calculate neighbor world coordinates
                        var nx = x + face.d[0];
                        var ny = y + face.d[1];
                        var nz = z + face.d[2];

                        // Look up neighbor block ID (cross-chunk)
                        var ngx = chunkWorldOX + nx;
                        var ngy = ny;
                        var ngz = chunkWorldOZ + nz;
                        var nid = this._getBlockAt(ngx, ngy, ngz);

                        // Face visibility: render if neighbor has different block ID
                        if (nid !== bid) {
                            // Add expanded quad for this transition
                            this._addExpandedQuad(pos, col, alp, nor, x, y, z, face, clr, alphas[bid] || 1.0, EXPAND_FACTOR);
                        }
                    }
                }
            }
        }

        if (pos.length === 0) {
            this._meshBuffers[key] = { count: 0 };
            return this._meshBuffers[key];
        }

        // Create WebGL buffers
        var vertexCount = pos.length / 3;
        var gl = this._gl;

        // Validate WebGL context before creating buffers
        if (!gl || gl.isContextLost()) {
            console.error('[DebugTerrain] WebGL context lost during buffer creation for chunk', key);
            return null;
        }

        // Position buffer
        var pb = gl.createBuffer();
        if (!pb) {
            console.error('[DebugTerrain] Failed to create position buffer for chunk', key);
            return null;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, pb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);

        // Color buffer
        var cb = gl.createBuffer();
        if (!cb) {
            console.error('[DebugTerrain] Failed to create color buffer for chunk', key);
            gl.deleteBuffer(pb);
            return null;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, cb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.STATIC_DRAW);

        // Alpha buffer
        var ab = gl.createBuffer();
        if (!ab) {
            console.error('[DebugTerrain] Failed to create alpha buffer for chunk', key);
            gl.deleteBuffer(pb);
            gl.deleteBuffer(cb);
            return null;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, ab);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(alp), gl.STATIC_DRAW);

        // Normal buffer
        var nb = gl.createBuffer();
        if (!nb) {
            console.error('[DebugTerrain] Failed to create normal buffer for chunk', key);
            gl.deleteBuffer(pb);
            gl.deleteBuffer(cb);
            gl.deleteBuffer(ab);
            return null;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, nb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);

        this._meshBuffers[key] = {
            posBuf: pb,
            colorBuf: cb,
            alphaBuf: ab,
            normBuf: nb,
            count: vertexCount
        };

        return this._meshBuffers[key];
    };

    /**
     * Add an expanded quad for a block transition face.
     * The quad is centered on the face and extends slightly beyond block boundaries
     * to prevent z-fighting with adjacent transition surfaces.
     *
     * @param {number[]} pos - Position array to push to.
     * @param {number[]} col - Color array to push to.
     * @param {number[]} alp - Alpha array to push to.
     * @param {number[]} nor - Normal array to push to.
     * @param {number} bx - Block X coordinate.
     * @param {number} by - Block Y coordinate.
     * @param {number} bz - Block Z coordinate.
     * @param {{d: number[], n: number[], c: number[][]}} face - Face definition.
     * @param {number[]} clr - RGB color array [r, g, b].
     * @param {number} alpha - Alpha value (0-1).
     * @param {number} expand - Expansion factor (> 1.0 to extend beyond boundaries).
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._addExpandedQuad = function (pos, col, alp, nor, bx, by, bz, face, clr, alpha, expand) {
        // Calculate quad center and half-size with expansion
        var cx = bx + 0.5;
        var cy = by + 0.5;
        var cz = bz + 0.5;

        // Half-extent with expansion factor
        var half = 0.5 * expand;

        // Adjust center based on face direction to maintain proper expansion
        var dc = face.d;
        var centerX = cx + dc[0] * (expand - 1) * 0.5;
        var centerY = cy + dc[1] * (expand - 1) * 0.5;
        var centerZ = cz + dc[2] * (expand - 1) * 0.5;

        // Generate 4 corner vertices for the quad (2 triangles = 6 vertices)
        var triIndices = [0, 1, 2, 0, 2, 3];
        for (var ti = 0; ti < 6; ti++) {
            var corner = face.c[triIndices[ti]];

            // Base corner position with expansion
            var cornerX = centerX + (corner[0] - 0.5) * expand;
            var cornerY = centerY + (corner[1] - 0.5) * expand;
            var cornerZ = centerZ + (corner[2] - 0.5) * expand;

            pos.push(cornerX, cornerY, cornerZ);
            col.push(clr[0], clr[1], clr[2]);
            alp.push(alpha);
            nor.push(face.n[0], face.n[1], face.n[2]);
        }
    };

    // ============================================================
    // Chunk Dirty Marking for Cross-Chunk Transitions
    // ============================================================

    /**
     * Mark all chunks adjacent to the given chunk as dirty to force mesh rebuild.
     * When a new chunk loads, existing neighboring chunks may need to expose or hide
     * faces at their boundary. This marks all 8 neighboring chunk positions
     * (in the XZ plane) as dirty so they will rebuild meshes on the next frame.
     *
     * @param {number} cx - Center chunk X coordinate.
     * @param {number} cz - Center chunk Z coordinate.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._markAdjacentChunksDirty = function (cx, cz) {
        // Mark all 8 neighboring chunks (3x3 grid centered on cx,cz minus center itself)
        for (var dx = -1; dx <= 1; dx++) {
            for (var dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;
                var nKey = (cx + dx) + ',' + (cz + dz);
                if (this._chunks.has(nKey)) {
                    this._dirtyChunks.add(nKey);
                }
            }
        }
    };

    // ============================================================
    // Mesh Buffer Management
    // ============================================================

    /**
     * Clear and delete all cached mesh buffers, freeing WebGL resources.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._clearMeshBuffers = function () {
        var gl = this._gl;
        if (!gl) return;

        for (var key in this._meshBuffers) {
            if (this._meshBuffers.hasOwnProperty(key)) {
                var buf = this._meshBuffers[key];
                if (buf.posBuf) gl.deleteBuffer(buf.posBuf);
                if (buf.colorBuf) gl.deleteBuffer(buf.colorBuf);
                if (buf.alphaBuf) gl.deleteBuffer(buf.alphaBuf);
                if (buf.normBuf) gl.deleteBuffer(buf.normBuf);
            }
        }
        this._meshBuffers = {};
    };

    // ============================================================
    // Sky Rendering
    // ============================================================

    /**
     * Render the sky dome using a simple box with gradient colors.
     * Rendered first (depth mask disabled) so terrain renders on top.
     *
     * @param {Float32Array} proj - Projection matrix.
     * @param {Float32Array} view - View matrix.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._renderSky = function (proj, view) {
        var gl = this._gl;
        if (!gl || !proj || !view) return;

        // Create sky buffers once
        if (!this._skyPosBuf) {
            var s = 500;
            var verts = [
                -s, -s, s, s, -s, s, s, s, s, -s, s, s,
                s, -s, -s, s, s, -s, s, s, -s, s, -s, -s,
                -s, s, -s, -s, s, s, s, s, s, s, s, -s,
                -s, -s, -s, s, -s, -s, s, -s, s, -s, -s, s,
                s, s, -s, s, s, s, -s, s, s, -s, s, -s,
                -s, -s, s, s, -s, s, s, -s, -s, -s, -s, -s
            ];
            var sc = [
                0.53, 0.81, 0.92, 1.0, 0.53, 0.81, 0.92, 1.0, 0.60, 0.85, 1.0, 1.0, 0.30, 0.25, 0.20, 1.0,
                0.55, 0.80, 0.93, 1.0, 0.55, 0.80, 0.93, 1.0, 0.53, 0.81, 0.92, 1.0, 0.53, 0.81, 0.92, 1.0,
                0.60, 0.85, 1.0, 1.0, 0.53, 0.81, 0.92, 1.0, 0.55, 0.80, 0.93, 1.0, 0.30, 0.25, 0.20, 1.0,
                0.53, 0.81, 0.92, 1.0, 0.53, 0.81, 0.92, 1.0, 0.60, 0.85, 1.0, 1.0, 0.30, 0.25, 0.20, 1.0,
                0.55, 0.80, 0.93, 1.0, 0.55, 0.80, 0.93, 1.0, 0.53, 0.81, 0.92, 1.0, 0.53, 0.81, 0.92, 1.0,
                0.60, 0.85, 1.0, 1.0, 0.53, 0.81, 0.92, 1.0, 0.55, 0.80, 0.93, 1.0, 0.30, 0.25, 0.20, 1.0
            ];
            var idx = [
                0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
                8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15,
                16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23
            ];

            var pa = [], ca = [];
            for (var i = 0; i < idx.length; i++) {
                var j = idx[i];
                pa.push(verts[j * 3], verts[j * 3 + 1], verts[j * 3 + 2]);
                ca.push(sc[j * 4], sc[j * 4 + 1], sc[j * 4 + 2], sc[j * 4 + 3]);
            }

            this._skyPosBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._skyPosBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pa), gl.STATIC_DRAW);

            this._skyColBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._skyColBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ca), gl.STATIC_DRAW);
        }

        gl.useProgram(this._skyProgram);

        // Disable all attributes first
        for (var i = 0; i < 8; i++) {
            gl.disableVertexAttribArray(i);
        }

        gl.uniformMatrix4fv(this._skyLocs.uProjection, false, proj);
        gl.uniformMatrix4fv(this._skyLocs.uView, false, view);
        var mdl = this._controller.mat4Create();
        gl.uniformMatrix4fv(this._skyLocs.uModel, false, mdl);

        gl.enableVertexAttribArray(this._skyLocs.aPosition);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyPosBuf);
        gl.vertexAttribPointer(this._skyLocs.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(this._skyLocs.aColor);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyColBuf);
        gl.vertexAttribPointer(this._skyLocs.aColor, 4, gl.FLOAT, false, 0, 0);

        gl.depthMask(false);
        gl.cullFace(gl.BACK);
        gl.enable(gl.CULL_FACE);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
        gl.depthMask(true);
        gl.disable(gl.CULL_FACE);

        gl.disableVertexAttribArray(this._skyLocs.aPosition);
        gl.disableVertexAttribArray(this._skyLocs.aColor);
    };

    // ============================================================
    // Dynamic Chunk Loading
    // ============================================================

    /**
     * Queue a chunk for asynchronous generation.
     * Respects max pending chunks and grid size limits.
     *
     * @param {number} cx - Chunk X coordinate.
     * @param {number} cz - Chunk Z coordinate.
     * @returns {boolean} True if chunk was queued successfully.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._queueChunk = function (cx, cz) {
        var key = cx + ',' + cz;

        // Skip if already loaded or pending
        if (this._chunks.has(key)) return false;
        if (this._pendingChunkQueue.has(key)) return false;

        // Respect max pending chunks limit
        if (this._pendingChunkQueue.size >= this._maxPendingChunks) return false;

        // Respect grid size limit
        var totalCells = (this._chunkRadiusN + this._chunkRadiusS + 1) *
            (this._chunkRadiusW + this._chunkRadiusE + 1);
        if (totalCells > this._maxGridCells) return false;

        this._pendingChunkQueue.set(key, { promise: null, cx: cx, cz: cz, completed: false });
        return true;
    };

    /**
     * Update the viewer chunk queue — queue chunks the player is approaching.
     * Called each frame to maintain chunk loading around the camera position.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._updateViewerChunkQueue = function () {
        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;

        if (!this._controller) return;

        var pos = this._controller.getCameraPosition();
        var cx = Math.floor(pos.x / cs);
        var cz = Math.floor(pos.z / cs);

        var queueGridMinX = this._currentChunkX - this._chunkRadiusW;
        var queueGridMaxX = this._currentChunkX + this._chunkRadiusE;
        var queueGridMinZ = this._currentChunkZ - this._chunkRadiusN;
        var queueGridMaxZ = this._currentChunkZ + this._chunkRadiusS;

        // Queue chunks near grid boundaries
        var nearBoundaryX = (cx - queueGridMinX <= 1) || (queueGridMaxX - cx <= 1);
        var nearBoundaryZ = (cz - queueGridMinZ <= 1) || (queueGridMaxZ - cz <= 1);

        if (nearBoundaryX || nearBoundaryZ) {
            var targets = [];
            if (cx >= queueGridMaxX) targets.push({ cx: cx + 1, cz: cz });
            if (cx < queueGridMinX) targets.push({ cx: cx - 1, cz: cz });
            if (cz >= queueGridMaxZ) targets.push({ cx: cx, cz: cz + 1 });
            if (cz < queueGridMinZ) targets.push({ cx: cx, cz: cz - 1 });

            // Sort by distance to camera and queue the nearest
            targets.sort(function (a, b) {
                var distA = (a.cx - cx) * (a.cx - cx) + (a.cz - cz) * (a.cz - cz);
                var distB = (b.cx - cx) * (b.cx - cx) + (b.cz - cz) * (b.cz - cz);
                return distA - distB;
            });

            for (var i = 0; i < Math.min(3, targets.length); i++) {
                this._queueChunk(targets[i].cx, targets[i].cz);
            }
        }
    };

    /**
     * Process the pending chunk queue — generate one chunk per frame.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._loadQueuedChunks = function () {
        if (this._pendingChunkQueue.size === 0 || !this._isTabVisible) return;

        var self = this;
        var entry = null, entryKey = null;

        this._pendingChunkQueue.forEach(function (value, key) {
            if (!value.completed && !value.promise) {
                entry = value;
                entryKey = key;
            }
        });

        if (!entry) return;

        entry.completed = false;
        var promise = null;

        if (Donkeycraft.TerrainCore && typeof Donkeycraft.TerrainCore.generateChunk === 'function') {
            promise = Donkeycraft.TerrainCore.generateChunk(entry.cx, entry.cz).then(
                function (result) {
                    var key = entry.cx + ',' + entry.cz;
                    var chunk = new Donkeycraft.Chunk(entry.cx, entry.cz);
                    chunk.fill(0);

                    if (result && result.heightmap && Array.isArray(result.heightmap)) {
                        chunk._cachedHeightmap = result.heightmap;
                        self._fillChunkFromHeightmap(chunk, result.heightmap, self._selectedBiomeId);
                    }

                    self._chunks.set(key, chunk);
                    self._dirtyChunks.add(key);
                    self._loadedChunkKeys.add(key);
                },
                function (e) {
                    var key = entry.cx + ',' + entry.cz;
                    var chunk = new Donkeycraft.Chunk(entry.cx, entry.cz);
                    chunk.fill(0);
                    self._chunks.set(key, chunk);
                    self._dirtyChunks.add(key);
                    self._loadedChunkKeys.add(key);
                }
            );
        } else {
            promise = Promise.resolve().then(function () {
                var key = entry.cx + ',' + entry.cz;
                var chunk = new Donkeycraft.Chunk(entry.cx, entry.cz);
                chunk.fill(0);
                self._generateChunkFallback(chunk, entry.cx, entry.cz, self._selectedBiomeId);
                self._chunks.set(key, chunk);
                self._dirtyChunks.add(key);
                self._loadedChunkKeys.add(key);
            });
        }

        entry.promise = promise;
        entry.promise.then(function () {
            entry.completed = true;
            // Mark adjacent chunks dirty so they can update their boundary faces
            self._markAdjacentChunksDirty(entry.cx, entry.cz);
            self._pendingChunkQueue.delete(entryKey);
        }).catch(function () {
            entry.completed = true;
            self._pendingChunkQueue.delete(entryKey);
        });
    };

    // ============================================================
    // Terrain Generation
    // ============================================================

    /**
     * Fill a chunk from a heightmap using biome-aware block placement.
     * Places bedrock at Y=0, then builds terrain columns with biome-specific
     * surface/subsurface blocks down to stone.
     *
     * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
     * @param {number[]} heightmap - Array of height values (size = CHUNK_SIZE × CHUNK_SIZE).
     * @param {number} biomeId - Biome ID for surface block selection.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._fillChunkFromHeightmap = function (chunk, heightmap, biomeId) {
        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;
        var ws = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;

        function getBlockId(name, fallback) {
            var b = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getBlockByName(name) : null;
            return b ? b.id : fallback;
        }

        var bedrockId = getBlockId('bedrock', 1000);
        var stoneId = getBlockId('stone', 1);
        var dirtId = getBlockId('dirt', 7);
        var grassBlockId = getBlockId('grass_block', 8);

        // Resolve biome-specific blocks
        var biomeType = 'grass';
        if (Donkeycraft.BiomeRegistry && typeof Donkeycraft.BiomeRegistry.getBiomeById === 'function') {
            var biome = Donkeycraft.BiomeRegistry.getBiomeById(biomeId);
            if (biome && biome.name) biomeType = biome.name.toLowerCase();
        }

        var surfaceBlockId, subSurfaceBlockId, subSubBlockId;
        switch (biomeType) {
            case 'arctic':
                surfaceBlockId = getBlockId('snow_block', 80);
                subSurfaceBlockId = getBlockId('ice', 79);
                subSubBlockId = getBlockId('packed_ice', 162);
                break;
            case 'desert':
                surfaceBlockId = getBlockId('sand', 12);
                subSurfaceBlockId = getBlockId('sandstone', 24);
                subSubBlockId = getBlockId('sandstone', 24);
                break;
            case 'forest':
                surfaceBlockId = getBlockId('grass_block', 8);
                subSurfaceBlockId = getBlockId('dirt', 7);
                subSubBlockId = stoneId;
                break;
            default:
                surfaceBlockId = getBlockId('grass_block', 8);
                subSurfaceBlockId = dirtId;
                subSubBlockId = stoneId;
                break;
        }

        // Clamp heightmap values
        var hMin = Infinity, hMax = -Infinity;
        for (var hi = 0; hi < heightmap.length; hi++) {
            if (isFinite(heightmap[hi])) {
                if (heightmap[hi] < hMin) hMin = heightmap[hi];
                if (heightmap[hi] > hMax) hMax = heightmap[hi];
            }
        }

        // Place bedrock layer
        for (var x = 0; x < cs; x++) {
            for (var z = 0; z < cs; z++) {
                chunk.setBlock(x, 0, z, bedrockId);
            }
        }

        // Fill terrain columns
        for (var x2 = 0; x2 < cs; x2++) {
            for (var z2 = 0; z2 < cs; z2++) {
                var h = heightmap[x2 + z2 * cs];
                if (!isFinite(h) || h < 1 || h >= ws - 10) h = 64;
                h = Math.floor(h);

                for (var y2 = 1; y2 < h; y2++) {
                    if (y2 < h - 3) {
                        chunk.setBlock(x2, y2, z2, subSubBlockId);
                    } else {
                        chunk.setBlock(x2, y2, z2, subSurfaceBlockId);
                    }
                }
                if (surfaceBlockId) {
                    chunk.setBlock(x2, h, z2, surfaceBlockId);
                } else {
                    chunk.setBlock(x2, h, z2, stoneId);
                }
            }
        }

        chunk._dirty = true;
    };

    /**
     * Fallback chunk generation when TerrainCore is unavailable.
     * Generates simple terrain with bedrock, stone, dirt, and grass blocks.
     *
     * @param {Donkeycraft.Chunk} chunk - The chunk to fill.
     * @param {number} cx - Chunk X coordinate (for seed).
     * @param {number} cz - Chunk Z coordinate (for seed).
     * @param {number} biomeId - Biome ID for surface block selection.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._generateChunkFallback = function (chunk, cx, cz, biomeId) {
        var biome = Donkeycraft.BiomeRegistry ? Donkeycraft.BiomeRegistry.getBiomeById(biomeId) : null;
        var heightmap = Donkeycraft.TerrainGenerator ?
            Donkeycraft.TerrainGenerator.generateHeightmap(
                cx !== undefined ? cx : chunk.chunkX,
                cz !== undefined ? cz : chunk.chunkZ,
                biome
            ) : null;

        var ws = Donkeycraft.Config ? Donkeycraft.Config.WORLD_HEIGHT : 256;
        var cs = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;

        function getBlockId(name, fallback) {
            var b = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getBlockByName(name) : null;
            return b ? b.id : fallback;
        }

        var bedrockId = getBlockId('bedrock', 1000);
        var stoneId = getBlockId('stone', 1);
        var dirtId = getBlockId('dirt', 7);
        var grassBlockId = getBlockId('grass_block', 8);

        // Place bedrock layer
        for (var x = 0; x < cs; x++) {
            for (var z = 0; z < cs; z++) {
                chunk.setBlock(x, 0, z, bedrockId);
            }
        }

        if (heightmap) {
            for (var x2 = 0; x2 < cs; x2++) {
                for (var z2 = 0; z2 < cs; z2++) {
                    var h = Math.max(1, Math.min(heightmap[x2 + z2 * cs] || 64, ws - 10));
                    for (var y2 = 1; y2 < h; y2++) {
                        if (y2 < h - 3) {
                            chunk.setBlock(x2, y2, z2, stoneId);
                        } else {
                            chunk.setBlock(x2, y2, z2, dirtId);
                        }
                    }
                    if (grassBlockId) {
                        chunk.setBlock(x2, h, z2, grassBlockId);
                    } else {
                        chunk.setBlock(x2, h, z2, stoneId);
                    }
                }
            }
        }

        // Optional cave and ore generation
        if (this._options.caves && Donkeycraft.CaveGenerator) {
            Donkeycraft.CaveGenerator.generateCaves(
                chunk,
                cx !== undefined ? cx : chunk.chunkX,
                cz !== undefined ? cz : chunk.chunkZ,
                heightmap
            );
        }
        if (this._options.ores && Donkeycraft.OreGenerator) {
            if (Donkeycraft.OreGenerator.init) Donkeycraft.OreGenerator.init();
            Donkeycraft.OreGenerator.placeOres(chunk, biomeId);
        }
    };

    /**
     * Regenerate all terrain within current grid bounds.
     * Clears existing chunks and mesh buffers, then re-generates terrain
     * for the full grid defined by current chunk position and radii.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._regenerateTerrain = function () {
        this._chunks.clear();
        this._clearMeshBuffers();
        this._dirtyChunks.clear();
        this._pendingChunkQueue.clear();

        // Reset first-frame flag so all meshes are rebuilt on the subsequent frame
        this._firstFrameBuilt = false;

        // Start timing
        this._generationStartTime = performance.now();

        // Determine bounds
        var bounds = {
            minX: this._currentChunkX - this._chunkRadiusW,
            maxX: this._currentChunkX + this._chunkRadiusE,
            minZ: this._currentChunkZ - this._chunkRadiusN,
            maxZ: this._currentChunkZ + this._chunkRadiusS
        };

        // Set seed and biome on TerrainCore if available
        if (Donkeycraft.TerrainCore) {
            if (typeof Donkeycraft.TerrainCore.setSeed === 'function') {
                Donkeycraft.TerrainCore.setSeed(this._worldSeed);
            }
            if (typeof Donkeycraft.TerrainCore.setBiome === 'function') {
                Donkeycraft.TerrainCore.setBiome(this._selectedBiomeId);
            }
        }

        var self = this;
        var pendingChunks = [];

        for (var cx = bounds.minX; cx <= bounds.maxX; cx++) {
            for (var cz = bounds.minZ; cz <= bounds.maxZ; cz++) {
                var key = cx + ',' + cz;
                var chunk = new Donkeycraft.Chunk(cx, cz);
                chunk.fill(0);

                if (Donkeycraft.TerrainCore && typeof Donkeycraft.TerrainCore.generateChunk === 'function') {
                    pendingChunks.push({
                        key: key,
                        chunk: chunk,
                        cx: cx,
                        cz: cz,
                        biomeId: this._selectedBiomeId
                    });
                } else {
                    this._generateChunkFallback(chunk, cx, cz, this._selectedBiomeId);
                    this._chunks.set(key, chunk);
                    this._dirtyChunks.add(key);
                }
            }
        }

        if (pendingChunks.length > 0) {
            var generationPromises = [];
            var allPendingCount = pendingChunks.length;
            var completedCount = 0;

            for (var i = 0; i < pendingChunks.length; i++) {
                (function (pc) {
                    var promise = Donkeycraft.TerrainCore.generateChunk(pc.cx, pc.cz).then(
                        function (result) {
                            if (result && result.heightmap && Array.isArray(result.heightmap)) {
                                pc.chunk._cachedHeightmap = result.heightmap;
                                self._fillChunkFromHeightmap(pc.chunk, result.heightmap, pc.biomeId);
                            }
                            self._chunks.set(pc.key, pc.chunk);
                            self._dirtyChunks.add(pc.key);
                            completedCount++;

                            // When all chunks finish, mark every chunk dirty for final boundary pass
                            if (completedCount >= allPendingCount) {
                                self._chunks.forEach(function (ch) {
                                    self._dirtyChunks.add(ch.chunkX + ',' + ch.chunkZ);
                                });
                                self._generationElapsedMs = performance.now() - self._generationStartTime;
                                self._generationStartTime = 0;
                                if (self._onTerrainRegenerated) self._onTerrainRegenerated();
                            }
                        },
                        function (e) {
                            self._chunks.set(pc.key, pc.chunk);
                            self._dirtyChunks.add(pc.key);
                            completedCount++;

                            if (completedCount >= allPendingCount) {
                                self._chunks.forEach(function (ch) {
                                    self._dirtyChunks.add(ch.chunkX + ',' + ch.chunkZ);
                                });
                                self._generationElapsedMs = performance.now() - self._generationStartTime;
                                self._generationStartTime = 0;
                                if (self._onTerrainRegenerated) self._onTerrainRegenerated();
                            }
                        }
                    );
                    generationPromises.push(promise);
                })(pendingChunks[i]);
            }

            Promise.all(generationPromises).catch(function () {
                // Catch any unhandled promise rejections
            });
        } else {
            this._generationElapsedMs = performance.now() - this._generationStartTime;
            this._generationStartTime = 0;
            if (this._onTerrainRegenerated) this._onTerrainRegenerated();
        }
    };

    // ============================================================
    // Render Loop
    // ============================================================

    /**
     * Main render loop.
     *
     * Each frame:
     * 1. Check for WebGL context loss
     * 2. Update delta time and camera
     * 3. Track FPS and update UI
     * 4. Periodically save state to localStorage
     * 5. Resize canvas if needed
     * 6. Clear framebuffer
     * 7. Build projection/view matrices
     * 8. Update dynamic chunk loading
     * 9. Render sky dome (pass 1)
     * 10. Build dirty transition meshes and render terrain (pass 2)
     *
     * @param {number} ts - Current timestamp in milliseconds from requestAnimationFrame.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._renderLoop = function (ts) {
        var self = this;

        // Check for WebGL context loss — gracefully pause rendering
        var gl = this._gl;
        if (!gl || gl.isContextLost()) {
            console.warn('[DebugTerrain] WebGL context lost, pausing render loop');
            if (gl && !gl.isContextLost()) {
                requestAnimationFrame(self._renderLoop.bind(self));
            }
            return;
        }

        // Delta time for frame-rate independent movement
        var dt = 1;
        if (this._lastFrameTime > 0) {
            dt = (ts - this._lastFrameTime) / 16.667;
        }
        this._lastFrameTime = ts;

        // Update camera with delta time
        if (this._controller && this._isTabVisible) {
            this._controller.updateCamera(dt);
        }

        // FPS tracking
        if (this._controller) {
            this._controller.updateFps(ts, ['dk-fps-counter', 'ui-fps']);
        }

        // Periodic state save (every 2 seconds)
        if (ts - this._lastSaveTime > 2000) {
            this._lastSaveTime = ts;
            if (this._controller) this._controller.saveState();
        }

        // Update camera display in UI
        if (this._controller) {
            var cam = this._controller.getCamera();
            var viewerPosEl = document.getElementById('ui-viewer-pos');
            if (viewerPosEl) {
                viewerPosEl.textContent = 'X=' + cam.x.toFixed(1) +
                    ' Y=' + cam.y.toFixed(1) + ' Z=' + cam.z.toFixed(1);
            }
            var viewerSeedEl = document.getElementById('ui-viewer-seed');
            if (viewerSeedEl) {
                viewerSeedEl.textContent = 'Seed: ' + this._worldSeed;
            }
        }

        // Resize check
        if (this._canvas && this._gl) {
            if (this._canvas.width !== window.innerWidth || this._canvas.height !== window.innerHeight) {
                this._resizeCanvas();
            }
        }

        // Clear framebuffer
        gl.clearColor(0.53, 0.81, 0.92, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Build projection and view matrices
        if (!this._controller) return;

        var asp = this._canvas.width / this._canvas.height;
        var fov = (Donkeycraft.Config ? (Donkeycraft.Config.FOV || 70) : 70) * Math.PI / 180;
        var proj = this._controller.mat4Create();
        this._controller.mat4Perspective(proj, fov, asp, 0.1, 1000);

        var cam = this._controller.getCamera();
        var ex = cam.x, ey = cam.y, ez = cam.z;
        var lx = ex - Math.sin(cam.yaw) * Math.cos(cam.pitch);
        var ly = ey + Math.sin(cam.pitch);
        var lz = ez - Math.cos(cam.yaw) * Math.cos(cam.pitch);
        var view = this._controller.mat4Create();
        this._controller.mat4LookAt(view, [ex, ey, ez], [lx, ly, lz], [0, 1, 0]);

        // Dynamic chunk loading
        this._updateViewerChunkQueue();
        this._loadQueuedChunks();

        // Pass 1: Sky dome
        this._renderSky(proj, view);

        // Pass 2: Terrain — On first frame, mark all existing chunks dirty for initial mesh build
        if (!this._firstFrameBuilt) {
            this._firstFrameBuilt = true;
            this._chunks.forEach(function (ch) {
                self._dirtyChunks.add(ch.chunkX + ',' + ch.chunkZ);
            });
        }

        // Build dirty transition meshes
        var validChunkKeys = new Set();
        this._chunks.forEach(function (ch) {
            var result = self._buildTransitionMesh(ch);
            if (result && result.count > 0) {
                validChunkKeys.add(ch.chunkX + ',' + ch.chunkZ);
            }
        });

        // Set up terrain shader uniforms
        gl.useProgram(this._terrainProgram);
        gl.uniformMatrix4fv(this._terrainLocs.uProjection, false, proj);
        gl.uniformMatrix4fv(this._terrainLocs.uView, false, view);
        gl.uniform3f(this._terrainLocs.uFogColor, 0.53, 0.81, 0.92);
        gl.uniform1f(this._terrainLocs.uFogDensity, 0.006);
        gl.uniform1f(this._terrainLocs.uLightFactor, 1.0);

        // Sort chunks by depth for proper alpha blending
        var chunkList = [];
        var cs2 = Donkeycraft.Config ? Donkeycraft.Config.CHUNK_SIZE : 16;

        this._chunks.forEach(function (ch) {
            var cx2 = ch.chunkX * cs2 + cs2 / 2;
            var cz2 = ch.chunkZ * cs2 + cs2 / 2;
            var surfaceY = 64;

            if (ch._cachedHeightmap) {
                var hmCenter = ch._cachedHeightmap[Math.floor(cs2 / 2) + Math.floor(cs2 / 2) * cs2];
                if (isFinite(hmCenter)) surfaceY = hmCenter;
            } else {
                var yB = self._computeChunkYBounds(ch);
                surfaceY = yB.maxY;
            }

            var depth = self._projectedDepth(cx2, surfaceY, cz2);
            chunkList.push({ chunk: ch, depth: depth });
        });

        chunkList.sort(function (a, b) { return b.depth - a.depth; });

        // Render with alpha blending (back-to-front)
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);

        for (var i = 0; i < chunkList.length; i++) {
            var ch2 = chunkList[i].chunk;
            var chunkKey = ch2.chunkX + ',' + ch2.chunkZ;

            // Skip chunks not in valid set
            if (!validChunkKeys.has(chunkKey)) continue;

            var buf = this._meshBuffers[chunkKey];
            if (!buf || buf.count === 0) continue;

            // Validate buffers before drawing
            if (!buf.posBuf || !buf.colorBuf || !buf.alphaBuf || !buf.normBuf) {
                console.error('[DebugTerrain] Missing buffer for chunk', chunkKey);
                continue;
            }

            // Set model matrix (chunk world offset)
            var cm = this._controller.mat4Create();
            this._controller.mat4Identity(cm);
            cm[12] = ch2.chunkX * cs2;
            cm[14] = ch2.chunkZ * cs2;
            gl.uniformMatrix4fv(this._terrainLocs.uModel, false, cm);

            // Bind position attribute
            gl.enableVertexAttribArray(this._terrainLocs.aPosition);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf.posBuf);
            gl.vertexAttribPointer(this._terrainLocs.aPosition, 3, gl.FLOAT, false, 0, 0);

            // Bind color attribute
            gl.enableVertexAttribArray(this._terrainLocs.aColor);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf.colorBuf);
            gl.vertexAttribPointer(this._terrainLocs.aColor, 3, gl.FLOAT, false, 0, 0);

            // Bind alpha attribute
            gl.enableVertexAttribArray(this._terrainLocs.aAlpha);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf.alphaBuf);
            gl.vertexAttribPointer(this._terrainLocs.aAlpha, 1, gl.FLOAT, false, 0, 0);

            // Bind normal attribute
            gl.enableVertexAttribArray(this._terrainLocs.aNormal);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf.normBuf);
            gl.vertexAttribPointer(this._terrainLocs.aNormal, 3, gl.FLOAT, false, 0, 0);

            // Draw chunk triangles
            gl.drawArrays(gl.TRIANGLES, 0, buf.count);
        }

        // Restore WebGL state
        gl.disable(gl.BLEND);
        gl.depthMask(true);

        for (var i = 0; i < 8; i++) {
            gl.disableVertexAttribArray(i);
        }

        // Continue render loop
        requestAnimationFrame(this._renderLoop.bind(this));
    };

})();