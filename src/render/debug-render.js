// Donkeycraft — Debug Terrain Renderer
// Lightweight terrain viewer/debugger with independent WebGL context.
// Extracted from terrain.html — can be loaded standalone or as a panel in index.html.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    /**
     * DebugTerrainRenderer — Standalone terrain viewer with its own WebGL context,
     * render loop, camera, and chunk management.
     * @constructor
     */
    Donkeycraft.DebugTerrainRenderer = function () {
        this._canvas = null;
        this._gl = null;
        this._terrainProgram = null;
        this._skyProgram = null;
        this._terrainLocs = {};
        this._skyLocs = {};

        // Camera state
        this._camera = { x: 0, y: 100, z: 0, yaw: 0, pitch: 0 };

        // Input state
        this._keys = {};
        this._mouseDX = 0;
        this._mouseDY = 0;
        this._pointerLocked = false;

        // Chunk state
        this._chunks = new Map();
        this._currentChunkX = 0;
        this._currentChunkZ = 0;

        // Chunk render radii (directional)
        this._chunkRadiusN = 7;
        this._chunkRadiusS = 8;
        this._chunkRadiusE = 8;
        this._chunkRadiusW = 7;

        // Generation options
        this._selectedBiomeId = 1;
        this._worldSeed = 42;
        this._options = { caves: true, ores: true, water: true, surface: true };

        // FPS tracking
        this._frameCount = 0;
        this._lastFpsTime = 0;
        this._currentFps = 0;
        this._lastSaveTime = 0;

        // Generation timing
        this._generationStartTime = 0;
        this._generationElapsedMs = 0;

        // Delta time tracking
        this._lastFrameTime = 0;

        // Speed levels
        this._speedLevel = 0;

        // Mesh cache
        this._meshBuffers = {};
        this._dirtyChunks = new Set();

        // Camera position tracking for viewer-aware mesh rebuilds
        this._lastCameraWorldX = 0;
        this._lastCameraWorldZ = 0;
        this._lastCameraChunkX = undefined;

        // Camera block position tracking — triggers full mesh rebuild when camera
        // enters or exits any block (needed for viewer-aware inner-face rendering)
        this._lastCameraBlockX = Math.floor(this._camera.x);
        this._lastCameraBlockY = Math.floor(this._camera.y);
        this._lastCameraBlockZ = Math.floor(this._camera.z);
        this._cameraBlockChanged = false;

        // Dynamic chunk loading
        this._loadedChunkKeys = new Set();
        this._pendingChunkQueue = new Map();
        this._isTabVisible = true;
        this._lastCameraChunkPos = { x: 0, z: 0, _initialized: false };

        // View distance
        this._viewDistanceBlocks = 128;
        this._maxPendingChunks = 8;
        this._trailBufferChunks = 4;
        this._maxChunkRadius = 31;
        this._maxGridCells = 4096;

        // Ready flag
        this._ready = false;
    };

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Initialize the debug terrain renderer.
     * @param {string} canvasId - ID of the canvas element.
     * @returns {boolean} True if initialization succeeded.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.init = function (canvasId) {
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

        // Setup input listeners
        this._setupInputListeners();

        // Resize canvas
        this._resizeCanvas();
        window.addEventListener('resize', this._resizeCanvas.bind(this));

        this._ready = true;
        return true;
    };

    /**
     * Start the render loop.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.start = function () {
        if (!this._ready) return;
        requestAnimationFrame(this._renderLoop.bind(this));
    };

    /**
     * Set the current chunk position.
     * @param {number} cx - Chunk X.
     * @param {number} cz - Chunk Z.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setCurrentChunk = function (cx, cz) {
        this._currentChunkX = cx;
        this._currentChunkZ = cz;
    };

    /**
     * Set chunk render radii.
     * @param {{n: number, s: number, e: number, w: number}} radii.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setRadii = function (radii) {
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
     * Set biome ID.
     * @param {number} biomeId.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setBiome = function (biomeId) {
        this._selectedBiomeId = biomeId;
    };

    /**
     * Set world seed.
     * @param {number} seed.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setSeed = function (seed) {
        this._worldSeed = seed;
    };

    /**
     * Set generation options.
     * @param {{caves: boolean, ores: boolean, water: boolean, surface: boolean}} options.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setOptions = function (options) {
        if (options.caves !== undefined) this._options.caves = options.caves;
        if (options.ores !== undefined) this._options.ores = options.ores;
        if (options.water !== undefined) this._options.water = options.water;
        if (options.surface !== undefined) this._options.surface = options.surface;
    };

    /**
     * Regenerate all terrain.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.regenerateTerrain = function () {
        if (!this._ready) return;
        this._regenerateTerrain();
    };

    /**
     * Get chunks map for inspection.
     * @returns {Map}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getChunks = function () {
        return this._chunks;
    };

    /**
     * Get camera state.
     * @returns {{x: number, y: number, z: number, yaw: number, pitch: number}}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getCamera = function () {
        return { ...this._camera };
    };

    /**
     * Set camera position.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setCameraPosition = function (x, y, z) {
        this._camera.x = x;
        this._camera.y = y;
        this._camera.z = z;
    };

    /**
     * Place viewer above ground at current position.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.placeAboveGround = function () {
        this._placeViewerAboveGround();
    };

    /**
     * Set NE overview view.
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setNEOverview = function () {
        this._setNEOverviewView();
    };

    /**
     * Get current FPS.
     * @returns {number}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getCurrentFps = function () {
        return this._currentFps;
    };

    /**
     * Get chunk count.
     * @returns {number}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getChunkCount = function () {
        return this._chunks.size;
    };

    /**
     * Get generation elapsed time in ms.
     * @returns {number}
     */
    Donkeycraft.DebugTerrainRenderer.prototype.getGenerationTime = function () {
        return this._generationElapsedMs;
    };

    // ============================================================
    // Input Handling
    // ============================================================

    /**
     * Setup keyboard, mouse, and pointer lock listeners.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._setupInputListeners = function () {
        var self = this;

        // Keyboard
        document.addEventListener('keydown', function (e) {
            self._keys[e.code] = true;
            if (e.code === 'KeyR') self._regenerateTerrain();
            if (e.code === 'KeyE') self._placeViewerAboveGround();
            if (e.code === 'KeyF') self._setNEOverviewView();
            if (e.code === 'KeyQ' && !e.repeat) {
                self._speedLevel = (self._speedLevel + 1) % 3;
                self._showSpeedIndicator();
            }
        });
        document.addEventListener('keyup', function (e) { self._keys[e.code] = false; });

        // Canvas click for pointer lock
        this._canvas.addEventListener('click', function () {
            if (!self._pointerLocked) self._canvas.requestPointerLock();
        });

        // Pointer lock change
        document.addEventListener('pointerlockchange', function () {
            self._pointerLocked = !!document.pointerLockElement;
        });

        // Mouse movement
        document.addEventListener('mousemove', function (e) {
            if (!self._pointerLocked) return;
            self._mouseDX += e.movementX || 0;
            self._mouseDY += e.movementY || 0;
        });

        // Tab visibility
        document.addEventListener('visibilitychange', function () {
            self._isTabVisible = !document.hidden;
        });
    };

    // ============================================================
    // Shader Setup
    // ============================================================

    Donkeycraft.DebugTerrainRenderer.prototype._setupTerrainLocations = function () {
        var locs = this._terrainLocs;
        locs.aPosition = this._gl.getAttribLocation(this._terrainProgram, 'aPosition');
        locs.aColor = this._gl.getAttribLocation(this._terrainProgram, 'aColor');
        locs.aAlpha = this._gl.getAttribLocation(this._terrainProgram, 'aAlpha');
        locs.aNormal = this._gl.getAttribLocation(this._terrainProgram, 'aNormal');
        locs.uProjection = this._gl.getUniformLocation(this._terrainProgram, 'uProjection');
        locs.uView = this._gl.getUniformLocation(this._terrainProgram, 'uView');
        locs.uModel = this._gl.getUniformLocation(this._terrainProgram, 'uModel');
        locs.uFogColor = this._gl.getUniformLocation(this._terrainProgram, 'uFogColor');
        locs.uFogDensity = this._gl.getUniformLocation(this._terrainProgram, 'uFogDensity');
        locs.uLightFactor = this._gl.getUniformLocation(this._terrainProgram, 'uLightFactor');
    };

    Donkeycraft.DebugTerrainRenderer.prototype._setupSkyLocations = function () {
        var locs = this._skyLocs;
        locs.aPosition = this._gl.getAttribLocation(this._skyProgram, 'aPosition');
        locs.aColor = this._gl.getAttribLocation(this._skyProgram, 'aColor');
        locs.uProjection = this._gl.getUniformLocation(this._skyProgram, 'uProjection');
        locs.uView = this._gl.getUniformLocation(this._skyProgram, 'uView');
        locs.uModel = this._gl.getUniformLocation(this._skyProgram, 'uModel');
    };

    // ============================================================
    // WebGL Helpers
    // ============================================================

    /**
     * Create a shader from source.
     * @param {number} type - Shader type.
     * @param {string} src - Shader source.
     * @returns {WebGLShader|null}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._createShader = function (type, src) {
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
     * Create a program from vertex and fragment sources.
     * @param {string} vs - Vertex shader source.
     * @param {string} fs - Fragment shader source.
     * @returns {WebGLProgram|null}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._createProgram = function (vs, fs) {
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
    // Matrix Helpers
    // ============================================================

    /**
     * Create identity matrix.
     * @returns {Float32Array}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._mat4Create = function () {
        var m = new Float32Array(16);
        m[0] = m[5] = m[10] = m[15] = 1;
        return m;
    };

    /**
     * Create perspective projection matrix.
     * @param {Float32Array} o - Output array.
     * @param {number} fov - Field of view in radians.
     * @param {number} aspect - Aspect ratio.
     * @param {number} near - Near plane.
     * @param {number} far - Far plane.
     * @returns {Float32Array}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._mat4Perspective = function (o, fov, aspect, near, far) {
        var f1 = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
        o.fill(0);
        o[0] = f1 / aspect;
        o[5] = f1;
        o[10] = (far + near) * nf;
        o[11] = -1;
        o[14] = 2 * far * near * nf;
        return o;
    };

    /**
     * Create look-at view matrix.
     * @param {Float32Array} o - Output array.
     * @param {number[]} eye - Camera position.
     * @param {number[]} center - Look-at point.
     * @param {number[]} up - Up vector.
     * @returns {Float32Array}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._mat4LookAt = function (o, eye, center, up) {
        var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
        var zl = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
        z0 *= zl; z1 *= zl; z2 *= zl;
        var x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
        var xl = 1 / Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
        x0 *= xl; x1 *= xl; x2 *= xl;
        var y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
        o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
        o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
        o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
        o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
        o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
        o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
        o[15] = 1;
        return o;
    };

    /**
     * Multiply two 4x4 matrices.
     * @param {Float32Array} o - Output.
     * @param {Float32Array} a - Left operand.
     * @param {Float32Array} b - Right operand.
     * @returns {Float32Array}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._mat4Multiply = function (o, a, b) {
        var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
            a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
            a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
            a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        var b0, b1, b2, b3;
        b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
        o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
        o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
        o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
        o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        return o;
    };

    /**
     * Create identity matrix (reusable).
     * @param {Float32Array} o - Output.
     * @returns {Float32Array}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._mat4Identity = function (o) {
        o.fill(0);
        o[0] = o[5] = o[10] = o[15] = 1;
        return o;
    };

    // ============================================================
    // Resize
    // ============================================================

    /**
     * Resize canvas to window dimensions.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._resizeCanvas = function () {
        if (!this._canvas) return;
        this._canvas.width = window.innerWidth;
        this._canvas.height = window.innerHeight;
        if (this._gl) this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    };

    // ============================================================
    // Block Lookup
    // ============================================================

    /**
     * Get block at world coordinates across chunk boundaries.
     * @param {number} gx - World X.
     * @param {number} gy - World Y.
     * @param {number} gz - World Z.
     * @returns {number} Block ID.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._getBlockAt = function (gx, gy, gz) {
        var cs = Donkeycraft.Config.CHUNK_SIZE;
        var ws = Donkeycraft.Config.WORLD_HEIGHT;
        if (gy < 0 || gy >= ws) return 0;
        var cx = Math.floor(gx / cs), cz = Math.floor(gz / cs);
        var lx = ((gx % cs) + cs) % cs, lz = ((gz % cs) + cs) % cs;
        var ch = this._chunks.get(cx + ',' + cz);
        if (!ch) return 0;
        return ch.getBlock(lx, gy, lz);
    };

    // ============================================================
    // Projected Depth for View-Aware Sorting
    // ============================================================

    /**
     * Compute projected depth of a world point along camera viewing direction.
     * @param {number} px - World X.
     * @param {number} py - World Y.
     * @param {number} pz - World Z.
     * @returns {number} Projected depth (larger = farther).
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._projectedDepth = function (px, py, pz) {
        var cosYaw = Math.cos(this._camera.yaw);
        var sinYaw = Math.sin(this._camera.yaw);
        var cosPitch = Math.cos(this._camera.pitch);
        var fwdX = -sinYaw * cosPitch;
        var fwdY = -Math.sin(this._camera.pitch);
        var fwdZ = -cosYaw * cosPitch;
        var dx = px - this._camera.x;
        var dy = py - this._camera.y;
        var dz = pz - this._camera.z;
        return dx * fwdX + dy * fwdY + dz * fwdZ;
    };

    // ============================================================
    // Mesh Building
    // ============================================================

    /**
     * Compute Y bounds of blocks in a chunk for optimization.
     * @param {Donkeycraft.Chunk} chunk
     * @returns {{minY: number, maxY: number}}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._computeChunkYBounds = function (chunk) {
        var ws = Donkeycraft.Config.WORLD_HEIGHT;
        var cs = Donkeycraft.Config.CHUNK_SIZE;
        var minY = -1, maxY = -1;

        for (var y = 0; y < ws && minY < 0; y++) {
            for (var x = 0; x < cs; x++) {
                for (var z = 0; z < cs; z++) {
                    if (chunk.getBlock(x, y, z) !== 0) { minY = y; break; }
                }
                if (minY >= 0) break;
            }
        }
        for (var y = ws - 1; y >= 0 && maxY < 0; y--) {
            for (var x = 0; x < cs; x++) {
                for (var z = 0; z < cs; z++) {
                    if (chunk.getBlock(x, y, z) !== 0) { maxY = y; break; }
                }
                if (maxY >= 0) break;
            }
        }
        if (minY < 0 || maxY < 0) return { minY: 0, maxY: ws - 1 };
        if (minY > 1) minY -= 2; else minY = 0;
        if (maxY < ws - 2) maxY += 2; else maxY = ws - 1;
        return { minY: Math.max(0, minY), maxY: Math.min(ws - 1, maxY) };
    };

    /**
     * Build mesh for a single chunk with viewer-aware face culling.
     *
     * This method iterates over all visible blocks in the chunk and generates geometry
     * for faces adjacent to transparent blocks or different block types. Face visibility
     * is determined by comparing the current block with its neighbor in each face direction.
     *
     * Viewer-awareness: When the camera is inside a solid block, the inner faces of that
     * block become visible (you're looking at the "inside" surface). This is handled by
     * checking if the camera position is within the block's volume — if so, all six faces
     * of that block are rendered regardless of neighbor type.
     *
     * Mesh rebuild triggers:
     * - Dirty flag: set when chunk is newly generated or adjacent to a newly loaded chunk
     * - Camera block change: when camera enters/exits any block (triggers full rebuild)
     *
     * @param {Donkeycraft.Chunk} chunk - The chunk to build mesh data for.
     * @returns {{posBuf: WebGLBuffer, colorBuf: WebGLBuffer, alphaBuf: WebGLBuffer, normBuf: WebGLBuffer, count: number}|null}
     *    Object containing WebGL buffers and vertex count, or {count: 0} if empty.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._buildChunkMesh = function (chunk) {
        var key = chunk.chunkX + ',' + chunk.chunkZ;

        // Check if mesh needs rebuilding: dirty flag OR camera entered/exited a block
        var needsRebuild = this._dirtyChunks.has(key) || this._cameraBlockChanged;
        if (!needsRebuild) {
            return this._meshBuffers[key];
        }
        if (this._dirtyChunks.has(key)) {
            this._dirtyChunks.delete(key);
        }

        var cs = Donkeycraft.Config.CHUNK_SIZE, ws = Donkeycraft.Config.WORLD_HEIGHT;
        var yBounds = this._computeChunkYBounds(chunk);
        var startY = yBounds.minY, endY = yBounds.maxY;
        if (startY > endY) { this._meshBuffers[key] = { count: 0 }; return this._meshBuffers[key]; }

        var pos = [], col = [], alp = [], nor = [];
        var colors = Donkeycraft.BlockColors.getAllColors();
        var alphas = Donkeycraft.BlockColors.getAllAlphas();
        var self = this;

        // Face definitions: [direction, normal, corner positions]
        // Corners are ordered counter-clockwise when viewed from outside the block.
        var _FACE_DEFS = [
            { d: [0, 1, 0], n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },   // +Y top
            { d: [0, -1, 0], n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] }, // -Y bottom
            { d: [0, 0, 1], n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },   // +Z south
            { d: [0, 0, -1], n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }, // -Z north
            { d: [1, 0, 0], n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },   // +X east
            { d: [-1, 0, 0], n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] }  // -X west
        ];

        // Pre-compute chunk world-space origin for camera-inside-block checks
        var chunkWorldOX = chunk.chunkX * cs;
        var chunkWorldOZ = chunk.chunkZ * cs;

        for (var x = 0; x < cs; x++) {
            for (var y = startY; y <= endY; y++) {
                for (var z = 0; z < cs; z++) {
                    var bid = chunk.getBlock(x, y, z);
                    if (bid === 0) continue;
                    var clr = colors[bid];
                    if (!clr) continue;
                    var alpha = alphas[bid] || 1.0;

                    // Check if camera is inside this block for viewer-aware rendering
                    var camInsideBlock = (
                        this._camera.x >= chunkWorldOX + x &&
                        this._camera.x < chunkWorldOX + x + 1 &&
                        this._camera.y >= y &&
                        this._camera.y < y + 1 &&
                        this._camera.z >= chunkWorldOZ + z &&
                        this._camera.z < chunkWorldOZ + z + 1
                    );

                    for (var f = 0; f < _FACE_DEFS.length; f++) {
                        var face = _FACE_DEFS[f];
                        var nx = x + face.d[0], ny = y + face.d[1], nz = z + face.d[2];
                        var nid = 0;

                        // Check neighbor block within this chunk
                        if (nx >= 0 && nx < cs && ny >= 0 && ny < ws && nz >= 0 && nz < cs) {
                            nid = chunk.getBlock(nx, ny, nz);
                        } else {
                            // Check neighbor across chunk boundary — load from adjacent chunk if available
                            var ngx = chunk.chunkX * cs + nx;
                            var ngy = ny, ngz = chunk.chunkZ * cs + nz;
                            nid = self._getBlockAt(ngx, ngy, ngz);
                        }

                        // Face visibility logic:
                        // 1. If camera is inside this block, render all faces (viewer-aware)
                        // 2. If neighbor is air (0), face is visible (including unloaded chunks)
                        // 3. If neighbor is a different block type, face is visible
                        // 4. If neighbor is the same solid block, face is hidden
                        var faceVisible = false;
                        if (camInsideBlock) {
                            faceVisible = true;
                        } else if (nid === 0) {
                            faceVisible = true;
                        } else if (nid !== bid) {
                            faceVisible = true;
                        }

                        if (faceVisible) {
                            // 6 vertices per quad (2 triangles)
                            var triIndices = [0, 1, 2, 0, 2, 3];
                            for (var ti = 0; ti < 6; ti++) {
                                var vi = face.c[triIndices[ti]];
                                pos.push(x + vi[0], y + vi[1], z + vi[2]);
                                col.push(clr[0], clr[1], clr[2]);
                                alp.push(alpha);
                                nor.push(face.n[0], face.n[1], face.n[2]);
                            }
                        }
                    }
                }
            }
        }

        if (pos.length === 0) { this._meshBuffers[key] = { count: 0 }; return this._meshBuffers[key]; }

        var vertexCount = pos.length / 3;
        var gl = this._gl;

        // Validate WebGL context before creating buffers
        if (!gl || gl.isContextLost()) {
            console.error('[DebugTerrain] WebGL context lost during buffer creation for chunk', key);
            return null;
        }

        var pb = gl.createBuffer();
        if (!pb) {
            console.error('[DebugTerrain] Failed to create position buffer for chunk', key);
            return null;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, pb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);

        var cb = gl.createBuffer();
        if (!cb) {
            console.error('[DebugTerrain] Failed to create color buffer for chunk', key);
            gl.deleteBuffer(pb);
            return null;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, cb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.STATIC_DRAW);

        var ab = gl.createBuffer();
        if (!ab) {
            console.error('[DebugTerrain] Failed to create alpha buffer for chunk', key);
            gl.deleteBuffer(pb);
            gl.deleteBuffer(cb);
            return null;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, ab);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(alp), gl.STATIC_DRAW);

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

        // Update camera position tracking for next frame's rebuild check
        this._lastCameraChunkX = this._camera.x;
        this._lastCameraWorldX = this._camera.x;
        this._lastCameraWorldZ = this._camera.z;

        this._meshBuffers[key] = { posBuf: pb, colorBuf: cb, alphaBuf: ab, normBuf: nb, count: vertexCount };
        return this._meshBuffers[key];
    };

    /**
     * Check whether the camera has entered or exited any block since the last rebuild.
     *
     * Compares the camera's current integer block coordinates with the tracked previous
     * values. If any differ, sets `_cameraBlockChanged` to true and updates the tracked
     * positions. This triggers a full mesh rebuild on the next frame so that viewer-aware
     * inner-face rendering is updated (e.g., when you walk into a dirt block, its inner
     * faces become visible).
     *
     * @returns {boolean} True if the camera block position changed.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._checkCameraBlockChange = function () {
        var bx = Math.floor(this._camera.x);
        var by = Math.floor(this._camera.y);
        var bz = Math.floor(this._camera.z);

        if (bx !== this._lastCameraBlockX || by !== this._lastCameraBlockY || bz !== this._lastCameraBlockZ) {
            this._lastCameraBlockX = bx;
            this._lastCameraBlockY = by;
            this._lastCameraBlockZ = bz;
            this._cameraBlockChanged = true;
            return true;
        }

        this._cameraBlockChanged = false;
        return false;
    };

    /**
     * Mark all chunks adjacent to the given chunk as dirty to force mesh rebuild.
     *
     * When a new chunk loads, existing neighboring chunks may need to expose or hide
     * faces at their boundary. This method marks all 8 neighboring chunk positions
     * (in the XZ plane) as dirty so they will rebuild their meshes on the next frame.
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

    /**
     * Clear and delete all mesh buffers.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._clearMeshBuffers = function () {
        var gl = this._gl;
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
     * Render sky dome.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._renderSky = function (proj, view) {
        var gl = this._gl;
        if (!proj || !view) return;

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
        var mdl = this._mat4Create();
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
     * @param {number} cx
     * @param {number} cz
     * @returns {boolean}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._queueChunk = function (cx, cz) {
        var key = cx + ',' + cz;
        if (this._chunks.has(key)) return false;
        if (this._pendingChunkQueue.has(key)) return false;
        if (this._pendingChunkQueue.size >= this._maxPendingChunks) return false;

        var totalCells = (this._chunkRadiusN + this._chunkRadiusS + 1) *
            (this._chunkRadiusW + this._chunkRadiusE + 1);
        if (totalCells > this._maxGridCells) return false;

        this._pendingChunkQueue.set(key, { promise: null, cx: cx, cz: cz, completed: false });
        return true;
    };

    /**
     * Update viewer chunk queue — queue chunks the player is approaching.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._updateViewerChunkQueue = function () {
        var cs = Donkeycraft.Config.CHUNK_SIZE;
        var cx = Math.floor(this._camera.x / cs);
        var cz = Math.floor(this._camera.z / cs);

        if (!this._lastCameraChunkPos._initialized) {
            this._lastCameraChunkPos.x = cx;
            this._lastCameraChunkPos.z = cz;
            this._lastCameraChunkPos._initialized = true;
            return;
        }

        var dx = cx - this._lastCameraChunkPos.x;
        var dz = cz - this._lastCameraChunkPos.z;

        var queueGridMinX = this._currentChunkX - this._chunkRadiusW;
        var queueGridMaxX = this._currentChunkX + this._chunkRadiusE;
        var queueGridMinZ = this._currentChunkZ - this._chunkRadiusN;
        var queueGridMaxZ = this._currentChunkZ + this._chunkRadiusS;

        if (Math.abs(dx) >= 1 || Math.abs(dz) >= 1) {
            var chunksToQueue = [];
            for (var ddX = -1; ddX <= 1; ddX++) {
                for (var ddZ = -1; ddZ <= 1; ddZ++) {
                    var tCx = cx + ddX, tCz = cz + ddZ;
                    if (tCx < queueGridMinX || tCx > queueGridMaxX ||
                        tCz < queueGridMinZ || tCz > queueGridMaxZ) {
                        chunksToQueue.push({ cx: tCx, cz: tCz });
                    }
                }
            }
            chunksToQueue.sort(function (a, b) {
                var distA = (a.cx - cx) * (a.cx - cx) + (a.cz - cz) * (a.cz - cz);
                var distB = (b.cx - cx) * (b.cx - cx) + (b.cz - cz) * (b.cz - cz);
                return distA - distB;
            });
            for (var i = 0; i < Math.min(3, chunksToQueue.length); i++) {
                this._queueChunk(chunksToQueue[i].cx, chunksToQueue[i].cz);
            }
            this._lastCameraChunkPos.x = cx;
            this._lastCameraChunkPos.z = cz;
        } else {
            var nearBoundaryX = (cx - queueGridMinX <= 1) || (queueGridMaxX - cx <= 1);
            var nearBoundaryZ = (cz - queueGridMinZ <= 1) || (queueGridMaxZ - cz <= 1);

            if (nearBoundaryX || nearBoundaryZ) {
                var targets = [];
                if (dx >= 1) targets.push({ cx: cx + 1, cz: cz });
                if (dx <= -1) targets.push({ cx: cx - 1, cz: cz });
                if (dz >= 1) targets.push({ cx: cx, cz: cz + 1 });
                if (dz <= -1) targets.push({ cx: cx, cz: cz - 1 });
                if (Math.abs(dx) >= 1 && Math.abs(dz) >= 1) {
                    targets.push({ cx: cx + Math.sign(dx), cz: cz + Math.sign(dz) });
                }
                for (var j = 0; j < targets.length; j++) {
                    if (this._queueChunk(targets[j].cx, targets[j].cz)) break;
                }
            }
        }
    };

    /**
     * Process pending chunk queue.
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
     * Fill chunk from heightmap using biome-aware block placement.
     * @param {Donkeycraft.Chunk} chunk
     * @param {number[]} heightmap
     * @param {number} biomeId
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._fillChunkFromHeightmap = function (chunk, heightmap, biomeId) {
        var cs = Donkeycraft.Config.CHUNK_SIZE;
        var ws = Donkeycraft.Config.WORLD_HEIGHT;

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

        // Clamp heightmap
        var hMin = Infinity, hMax = -Infinity;
        for (var hi = 0; hi < heightmap.length; hi++) {
            if (isFinite(heightmap[hi])) {
                if (heightmap[hi] < hMin) hMin = heightmap[hi];
                if (heightmap[hi] > hMax) hMax = heightmap[hi];
            }
        }

        // Place bedrock
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
     * Fallback chunk generation (when TerrainCore unavailable).
     * @param {Donkeycraft.Chunk} chunk
     * @param {number} cx
     * @param {number} cz
     * @param {number} biomeId
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._generateChunkFallback = function (chunk, cx, cz, biomeId) {
        var biome = Donkeycraft.BiomeRegistry ? Donkeycraft.BiomeRegistry.getBiomeById(biomeId) : null;
        var heightmap = Donkeycraft.TerrainGenerator ?
            Donkeycraft.TerrainGenerator.generateHeightmap(cx !== undefined ? cx : chunk.chunkX,
                cz !== undefined ? cz : chunk.chunkZ, biome) : null;
        var ws = Donkeycraft.Config.WORLD_HEIGHT, cs = Donkeycraft.Config.CHUNK_SIZE;

        function getBlockId(name, fallback) {
            var b = Donkeycraft.BlockRegistry ? Donkeycraft.BlockRegistry.getBlockByName(name) : null;
            return b ? b.id : fallback;
        }

        var bedrockId = getBlockId('bedrock', 1000);
        var stoneId = getBlockId('stone', 1);
        var dirtId = getBlockId('dirt', 7);
        var grassBlockId = getBlockId('grass_block', 8);

        // Place bedrock
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
                        if (y2 < h - 3) chunk.setBlock(x2, y2, z2, stoneId);
                        else chunk.setBlock(x2, y2, z2, dirtId);
                    }
                    if (grassBlockId) {
                        chunk.setBlock(x2, h, z2, grassBlockId);
                    } else {
                        chunk.setBlock(x2, h, z2, stoneId);
                    }
                }
            }
        }

        if (this._options.caves && Donkeycraft.CaveGenerator) {
            Donkeycraft.CaveGenerator.generateCaves(chunk, cx !== undefined ? cx : chunk.chunkX,
                cz !== undefined ? cz : chunk.chunkZ, heightmap);
        }
        if (this._options.ores && Donkeycraft.OreGenerator) {
            if (Donkeycraft.OreGenerator.init) Donkeycraft.OreGenerator.init();
            Donkeycraft.OreGenerator.placeOres(chunk, biomeId);
        }
    };

    /**
     * Regenerate all terrain within current grid bounds.
     *
     * Clears existing chunks and mesh buffers, then re-generates terrain for the full
     * grid defined by current chunk position and radii. All generated chunks are marked
     * dirty to trigger immediate mesh rebuild on the next render frame.
     *
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._regenerateTerrain = function () {
        this._chunks.clear();
        this._clearMeshBuffers();
        this._dirtyChunks.clear();
        this._pendingChunkQueue.clear();

        // Reset camera position tracking to force full rebuild on next frame
        this._lastCameraChunkX = undefined;

        // Reset camera block tracking for fresh viewer-aware rendering
        this._lastCameraBlockX = Math.floor(this._camera.x);
        this._lastCameraBlockY = Math.floor(this._camera.y);
        this._lastCameraBlockZ = Math.floor(this._camera.z);
        this._cameraBlockChanged = false;

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
            if (typeof Donkeycraft.TerrainCore.setSeed === 'function') Donkeycraft.TerrainCore.setSeed(this._worldSeed);
            if (typeof Donkeycraft.TerrainCore.setBiome === 'function') Donkeycraft.TerrainCore.setBiome(this._selectedBiomeId);
        }

        var self = this;
        var pendingChunks = [];

        for (var cx = bounds.minX; cx <= bounds.maxX; cx++) {
            for (var cz = bounds.minZ; cz <= bounds.maxZ; cz++) {
                var key = cx + ',' + cz;
                var chunk = new Donkeycraft.Chunk(cx, cz);
                chunk.fill(0);

                if (Donkeycraft.TerrainCore && typeof Donkeycraft.TerrainCore.generateChunk === 'function') {
                    pendingChunks.push({ key: key, chunk: chunk, cx: cx, cz: cz, biomeId: this._selectedBiomeId });
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
                    var promise = Donkeycraft.TerrainCore.generateChunk(pc.cx, pc.cz).then(function (result) {
                        if (result && result.heightmap && Array.isArray(result.heightmap)) {
                            pc.chunk._cachedHeightmap = result.heightmap;
                            self._fillChunkFromHeightmap(pc.chunk, result.heightmap, pc.biomeId);
                        }
                        self._chunks.set(pc.key, pc.chunk);
                        self._dirtyChunks.add(pc.key);
                        completedCount++;

                        // When the last chunk finishes, mark ALL chunks dirty for final culling
                        if (completedCount >= allPendingCount) {
                            self._chunks.forEach(function (ch) {
                                self._dirtyChunks.add(ch.chunkX + ',' + ch.chunkZ);
                            });
                        }
                    }).catch(function (e) {
                        self._chunks.set(pc.key, pc.chunk);
                        self._dirtyChunks.add(pc.key);
                        completedCount++;

                        if (completedCount >= allPendingCount) {
                            self._chunks.forEach(function (ch) {
                                self._dirtyChunks.add(ch.chunkX + ',' + ch.chunkZ);
                            });
                        }
                    });
                    generationPromises.push(promise);
                })(pendingChunks[i]);
            }

            Promise.all(generationPromises).then(function () {
                // After ALL chunks are generated, mark every chunk dirty for a final
                // boundary-culling pass.  Chunks built while neighbors were still
                // pending saw air on those sides and over-rendered; now that every
                // chunk exists in this._chunks we rebuild once more with complete
                // neighbor data so shared faces are properly culled.
                self._chunks.forEach(function (ch) {
                    self._dirtyChunks.add(ch.chunkX + ',' + ch.chunkZ);
                });
                self._generationElapsedMs = performance.now() - self._generationStartTime;
                self._generationStartTime = 0;
                // Notify UI callback if set
                if (self._onTerrainRegenerated) self._onTerrainRegenerated();
            });
        } else {
            this._generationElapsedMs = performance.now() - this._generationStartTime;
            this._generationStartTime = 0;
            if (this._onTerrainRegenerated) this._onTerrainRegenerated();
        }
    };

    /**
     * Set callback for terrain regeneration completion.
     * @param {Function} callback
     */
    Donkeycraft.DebugTerrainRenderer.prototype.setOnTerrainRegenerated = function (callback) {
        this._onTerrainRegenerated = callback;
    };

    // ============================================================
    // Camera Movement
    // ============================================================

    /**
     * Update camera based on input state and delta time.
     * @param {number} [dt=1] - Delta time multiplier for frame-rate independent movement (default: 1).
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._updateCamera = function (dt) {
        dt = dt || 1; // Default to 1x if not provided

        var sens = (Donkeycraft.Config && Donkeycraft.Config.MOUSE_SENSITIVITY) ?
            Donkeycraft.Config.MOUSE_SENSITIVITY : 0.15;

        // Rotation (mouse-based, not time-dependent)
        this._camera.yaw -= this._mouseDX * sens;
        this._camera.pitch -= this._mouseDY * sens;
        this._camera.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._camera.pitch));
        this._mouseDX = 0;
        this._mouseDY = 0;

        // Movement — frame-rate independent (scaled by delta time)
        var spd = (SPEED_LEVELS[this._speedLevel] || 4) * dt;
        var fwd = [-Math.sin(this._camera.yaw), 0, -Math.cos(this._camera.yaw)];
        var rgt = [Math.cos(this._camera.yaw), 0, -Math.sin(this._camera.yaw)];

        var keys = this._keys;
        if (keys['KeyW']) { this._camera.x += fwd[0] * spd; this._camera.z += fwd[2] * spd; }
        if (keys['KeyS']) { this._camera.x -= fwd[0] * spd; this._camera.z -= fwd[2] * spd; }
        if (keys['KeyA']) { this._camera.x -= rgt[0] * spd; this._camera.z -= rgt[2] * spd; }
        if (keys['KeyD']) { this._camera.x += rgt[0] * spd; this._camera.z += rgt[2] * spd; }
        if (keys['Space']) this._camera.y += spd;
        if (keys['KeyZ']) this._camera.y -= spd;
    };

    // ============================================================
    // Helper Functions
    // ============================================================

    /**
     * Place viewer 1 meter above ground.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._placeViewerAboveGround = function () {
        var cs = Donkeycraft.Config.CHUNK_SIZE;
        var ws = Donkeycraft.Config.WORLD_HEIGHT;

        var camChunkX = Math.floor(this._camera.x / cs);
        var camChunkZ = Math.floor(this._camera.z / cs);
        var localX = ((this._camera.x % cs) + cs) % cs;
        var localZ = ((this._camera.z % cs) + cs) % cs;

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
            this._camera.y = surfaceY + 2;
        } else {
            this._camera.y = 2;
        }
    };

    /**
     * Set NE overview view.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._setNEOverviewView = function () {
        var cs = Donkeycraft.Config.CHUNK_SIZE;
        var minChunkX = this._currentChunkX - this._chunkRadiusW;
        var maxChunkX = this._currentChunkX + this._chunkRadiusE;
        var minChunkZ = this._currentChunkZ - this._chunkRadiusN;
        var maxChunkZ = this._currentChunkZ + this._chunkRadiusS;

        var neWorldX = maxChunkX * cs + cs;
        var neWorldZ = minChunkZ * cs;

        var gridWidthChunks = (maxChunkX - minChunkX + 1);
        var gridDepthChunks = (maxChunkZ - minChunkZ + 1);
        var gridWorldSize = Math.max(gridWidthChunks, gridDepthChunks) * cs;

        var diagonalOffset = gridWorldSize * 0.7;
        this._camera.x = neWorldX + diagonalOffset;
        this._camera.z = neWorldZ - diagonalOffset;

        var surfaceY = 80;
        if (Donkeycraft.TerrainGenerator && Donkeycraft.BiomeRegistry) {
            var biome = Donkeycraft.BiomeRegistry.getBiomeById(this._selectedBiomeId);
            var hm = Donkeycraft.TerrainGenerator.generateHeightmap(maxChunkX, minChunkZ, biome);
            if (hm) {
                surfaceY = hm[(cs - 1) + 0 * cs] || 64;
            }
        }

        this._camera.y = surfaceY + gridWorldSize * 0.6;

        var targetX = (minChunkX + maxChunkX) * cs / 2;
        var targetZ = (minChunkZ + maxChunkZ) * cs / 2;
        this._camera.yaw = Math.atan2(-(targetX - this._camera.x), -(targetZ - this._camera.z));

        var heightToAngle = Math.abs(this._camera.y - surfaceY);
        var distanceToTarget = Math.sqrt(
            Math.pow(targetX - this._camera.x, 2) + Math.pow(targetZ - this._camera.z, 2)
        );
        if (!isFinite(distanceToTarget) || distanceToTarget < 0.001) {
            distanceToTarget = 0.001;
        }
        this._camera.pitch = -Math.atan2(heightToAngle, distanceToTarget) * 0.8;
    };

    /**
     * Show speed indicator overlay.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._showSpeedIndicator = function () {
        var indicator = document.getElementById('dk-speed-indicator');
        if (!indicator) return;
        var emojiEl = indicator.querySelector('.speed-emoji');
        var labelEl = indicator.querySelector('.speed-label');
        if (emojiEl) emojiEl.textContent = SPEED_EMOJIS[this._speedLevel];
        if (labelEl) labelEl.textContent = SPEED_NAMES[this._speedLevel] + ' Speed';
        indicator.classList.add('show');
        var self = this;
        setTimeout(function () { indicator.classList.remove('show'); }, 1200);
    };

    // ============================================================
    // State Save/Load
    // ============================================================

    /**
     * Save state to localStorage.
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._saveState = function () {
        try {
            var state = {
                chunkRadiusN: this._chunkRadiusN,
                chunkRadiusS: this._chunkRadiusS,
                chunkRadiusE: this._chunkRadiusE,
                chunkRadiusW: this._chunkRadiusW,
                selectedBiomeId: this._selectedBiomeId,
                worldSeed: this._worldSeed,
                options: this._options,
                camera: {
                    x: this._camera.x, y: this._camera.y, z: this._camera.z,
                    yaw: this._camera.yaw, pitch: this._camera.pitch
                },
                currentChunkX: this._currentChunkX,
                currentChunkZ: this._currentChunkZ
            };
            localStorage.setItem('donkeycraft_terrain_state', JSON.stringify(state));
        } catch (e) { /* ignore */ }
    };

    /**
     * Load state from localStorage.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.DebugTerrainRenderer.prototype._loadState = function () {
        try {
            var raw = localStorage.getItem('donkeycraft_terrain_state');
            if (!raw) return false;
            var state = JSON.parse(raw);
            if (!state || typeof state !== 'object') return false;

            if (typeof state.chunkRadiusN === 'number') {
                this._chunkRadiusN = state.chunkRadiusN;
                this._chunkRadiusS = state.chunkRadiusS;
                this._chunkRadiusE = state.chunkRadiusE;
                this._chunkRadiusW = state.chunkRadiusW;
            }
            if (typeof state.selectedBiomeId === 'number') this._selectedBiomeId = state.selectedBiomeId;
            if (typeof state.worldSeed === 'number') this._worldSeed = state.worldSeed;
            if (state.options && typeof state.options === 'object') {
                if (typeof state.options.caves === 'boolean') this._options.caves = state.options.caves;
                if (typeof state.options.ores === 'boolean') this._options.ores = state.options.ores;
                if (typeof state.options.water === 'boolean') this._options.water = state.options.water;
                if (typeof state.options.surface === 'boolean') this._options.surface = state.options.surface;
            }
            if (state.camera && typeof state.camera === 'object') {
                if (typeof state.camera.x === 'number') this._camera.x = state.camera.x;
                if (typeof state.camera.y === 'number') this._camera.y = state.camera.y;
                if (typeof state.camera.z === 'number') this._camera.z = state.camera.z;
                if (typeof state.camera.yaw === 'number') this._camera.yaw = state.camera.yaw;
                if (typeof state.camera.pitch === 'number') this._camera.pitch = state.camera.pitch;
            }
            if (typeof state.currentChunkX === 'number') this._currentChunkX = state.currentChunkX;
            if (typeof state.currentChunkZ === 'number') this._currentChunkZ = state.currentChunkZ;
            return true;
        } catch (e) { return false; }
    };

    // ============================================================
    // Render Loop
    // ============================================================

    /**
     * Main render loop with WebGL context loss detection and recovery.
     *
     * The render loop performs the following each frame:
     * 1. Update delta time for frame-rate independent camera movement
     * 2. Track FPS and update UI counter every second
     * 3. Periodically save state to localStorage (every 2 seconds)
     * 4. Update camera based on input state
     * 5. Check for WebGL context loss (graceful degradation)
     * 6. Resize canvas if window dimensions changed
     * 7. Clear framebuffer and set up projection/view matrices
     * 8. Update dynamic chunk loading queue
     * 9. Render sky dome (pass 1)
     * 10. Build dirty chunk meshes and render terrain (pass 2)
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
            // Attempt recovery: try to recreate the context after a short delay
            if (gl && !gl.isContextLost()) {
                requestAnimationFrame(self._renderLoop.bind(self));
            }
            return;
        }

        // Delta time
        var dt = 1;
        if (this._lastFrameTime > 0) {
            dt = (ts - this._lastFrameTime) / 16.667;
        }
        this._lastFrameTime = ts;

        // FPS tracking
        this._frameCount++;
        if (!this._lastFpsTime) this._lastFpsTime = ts;
        if (ts - this._lastFpsTime >= 1000) {
            this._currentFps = this._frameCount;
            this._frameCount = 0;
            this._lastFpsTime = ts;
            var fe = document.getElementById('dk-fps-counter');
            if (fe) fe.textContent = 'FPS: ' + this._currentFps;
            var fi = document.getElementById('ui-fps');
            if (fi) fi.textContent = 'FPS: ' + this._currentFps;
        }

        // Periodic save
        if (ts - this._lastSaveTime > 2000) {
            this._lastSaveTime = ts;
            this._saveState();
        }

        // Update camera display
        var viewerPosEl = document.getElementById('ui-viewer-pos');
        if (viewerPosEl) {
            viewerPosEl.textContent = 'X=' + this._camera.x.toFixed(1) +
                ' Y=' + this._camera.y.toFixed(1) + ' Z=' + this._camera.z.toFixed(1);
        }
        var viewerSeedEl = document.getElementById('ui-viewer-seed');
        if (viewerSeedEl) {
            viewerSeedEl.textContent = 'Seed: ' + this._worldSeed;
        }

        // Update camera with delta time for frame-rate independent movement
        this._updateCamera(dt);

        // Resize check
        if (this._canvas.width !== window.innerWidth || this._canvas.height !== window.innerHeight) {
            this._resizeCanvas();
        }

        // Clear
        var gl = this._gl;
        gl.clearColor(0.53, 0.81, 0.92, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Matrices
        var asp = this._canvas.width / this._canvas.height;
        var fov = (Donkeycraft.Config ? (Donkeycraft.Config.FOV || 70) : 70) * Math.PI / 180;
        var proj = this._mat4Create();
        this._mat4Perspective(proj, fov, asp, 0.1, 1000);

        var ex = this._camera.x, ey = this._camera.y, ez = this._camera.z;
        var lx = ex - Math.sin(this._camera.yaw) * Math.cos(this._camera.pitch);
        var ly = ey + Math.sin(this._camera.pitch);
        var lz = ez - Math.cos(this._camera.yaw) * Math.cos(this._camera.pitch);
        var view = this._mat4Create();
        this._mat4LookAt(view, [ex, ey, ez], [lx, ly, lz], [0, 1, 0]);

        // Dynamic chunk loading
        this._updateViewerChunkQueue();
        this._loadQueuedChunks();

        // Pass 1: Sky
        this._renderSky(proj, view);

        // Pass 2: Terrain
        if (!this._meshBuffers._firstFrameBuilt) {
            this._meshBuffers._firstFrameBuilt = true;
            this._chunks.forEach(function (ch) { self._dirtyChunks.add(ch.chunkX + ',' + ch.chunkZ); });
        }

        // Check if camera entered/exited a block — triggers viewer-aware mesh rebuild
        self._checkCameraBlockChange();

        // Build dirty chunk meshes — skip chunks that returned null from buffer creation failure
        var validChunkKeys = new Set();
        this._chunks.forEach(function (ch) {
            var result = self._buildChunkMesh(ch);
            if (result && result.count > 0) {
                validChunkKeys.add(ch.chunkX + ',' + ch.chunkZ);
            }
        });

        gl.useProgram(this._terrainProgram);
        gl.uniformMatrix4fv(this._terrainLocs.uProjection, false, proj);
        gl.uniformMatrix4fv(this._terrainLocs.uView, false, view);
        gl.uniform3f(this._terrainLocs.uFogColor, 0.53, 0.81, 0.92);
        gl.uniform1f(this._terrainLocs.uFogDensity, 0.006);
        gl.uniform1f(this._terrainLocs.uLightFactor, 1.0);

        // Sort chunks by depth
        var chunkList = [];
        var cs2 = Donkeycraft.Config.CHUNK_SIZE;
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

        // Render with alpha blending
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);

        for (var i = 0; i < chunkList.length; i++) {
            var ch2 = chunkList[i].chunk;
            var chunkKey = ch2.chunkX + ',' + ch2.chunkZ;

            // Skip chunks not in valid set (buffer creation failed or empty)
            if (!validChunkKeys.has(chunkKey)) continue;

            var buf = this._meshBuffers[chunkKey];
            if (!buf || buf.count === 0) continue;

            // Validate buffers before drawing
            if (!buf.posBuf || !buf.colorBuf || !buf.alphaBuf || !buf.normBuf) {
                console.error('[DebugTerrain] Missing buffer for chunk', chunkKey);
                continue;
            }

            var cm = this._mat4Create();
            this._mat4Identity(cm);
            cm[12] = ch2.chunkX * cs2;
            cm[14] = ch2.chunkZ * cs2;
            gl.uniformMatrix4fv(this._terrainLocs.uModel, false, cm);

            gl.enableVertexAttribArray(this._terrainLocs.aPosition);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf.posBuf);
            gl.vertexAttribPointer(this._terrainLocs.aPosition, 3, gl.FLOAT, false, 0, 0);

            gl.enableVertexAttribArray(this._terrainLocs.aColor);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf.colorBuf);
            gl.vertexAttribPointer(this._terrainLocs.aColor, 3, gl.FLOAT, false, 0, 0);

            gl.enableVertexAttribArray(this._terrainLocs.aAlpha);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf.alphaBuf);
            gl.vertexAttribPointer(this._terrainLocs.aAlpha, 1, gl.FLOAT, false, 0, 0);

            gl.enableVertexAttribArray(this._terrainLocs.aNormal);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf.normBuf);
            gl.vertexAttribPointer(this._terrainLocs.aNormal, 3, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.TRIANGLES, 0, buf.count);
        }

        // Restore state
        gl.disable(gl.BLEND);
        gl.depthMask(true);

        for (var i = 0; i < 8; i++) {
            gl.disableVertexAttribArray(i);
        }

        requestAnimationFrame(this._renderLoop.bind(this));
    };

    // ============================================================
    // Speed Level Constants
    // ============================================================

    /**
     * Speed levels: [walk, jog, sprint] in blocks/sec.
     * @type {number[]}
     * @private
     */
    var SPEED_LEVELS = [4, 8, 16];

    /**
     * Speed level display names.
     * @type {string[]}
     * @private
     */
    var SPEED_NAMES = ['Walk', 'Jog', 'Sprint'];

    /**
     * Speed level emoji icons.
     * @type {string[]}
     * @private
     */
    var SPEED_EMOJIS = ['🚶', '🏃', '⚡'];

})();
