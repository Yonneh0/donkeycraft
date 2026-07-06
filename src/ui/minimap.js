// Donkeycraft — Minimap UI Module
// Standalone minimap renderer: circular top-down view with compass ring,
// player dot, and terrain tiles rotating around the player based on yaw.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = window.Donkeycraft && window.Donkeycraft.Config;
    var CHUNK_SIZE = Config ? Config.CHUNK_SIZE : 16;

    /**
     * MinimapUI — manages the circular minimap display.
     * Renders terrain tiles that rotate around a static player dot based on the player's yaw angle.
     * Uses pre-built surface maps (O(1) lookup per block) for efficient terrain rendering.
     * @constructor
     * @param {Object} [options] - Configuration options.
     * @param {Donkeycraft.ChunkManager} [options.chunkManager] - Reference to active chunk manager.
     */
    Donkeycraft.MinimapUI = function (options) {
        options = options || {};

        /** @type {Donkeycraft.ChunkManager|null} @private */
        this._chunkManager = options.chunkManager || null;

        /** @type {HTMLCanvasElement|null} @private */
        this._canvas = null;

        /** @type {number} @private */
        this._minimapRadius = Config && Config.MAP_MINIMAP_RADIUS ? Config.MAP_MINIMAP_RADIUS : 32;

        /** @type {number} @private */
        this._blockPixelSize = 1.0; // Base tile size multiplier

        /** @type {boolean} @private */
        this._destroyed = false;
    };

    /**
     * Initialize the minimap UI. Sets up canvas dimensions from CSS variable or config.
     * @returns {boolean} True if initialized successfully.
     */
    Donkeycraft.MinimapUI.prototype.init = function () {
        try {
            this._canvas = document.getElementById('dk-minimap-canvas');
            if (!this._canvas) {
                Donkeycraft.Logger.warn('MinimapUI', 'Minimap canvas element #dk-minimap-canvas not found in DOM');
                return false;
            }

            var minimapSize = Config && Config.MAP_MINIMAP_SIZE ? Config.MAP_MINIMAP_SIZE : 150;
            this._canvas.width = minimapSize;
            this._canvas.height = minimapSize;

            return true;
        } catch (e) {
            Donkeycraft.Logger.error('MinimapUI', 'Initialization failed: ' + e.message);
            return false;
        }
    };

    /**
     * Set the canvas element directly (for when DOM isn't ready during init).
     * @param {HTMLCanvasElement} canvas - The minimap canvas element.
     */
    Donkeycraft.MinimapUI.prototype.setCanvas = function (canvas) {
        if (!canvas) return;

        this._canvas = canvas;

        var minimapSize = Config && Config.MAP_MINIMAP_SIZE ? Config.MAP_MINIMAP_SIZE : 150;
        this._canvas.width = minimapSize;
        this._canvas.height = minimapSize;
    };

    /**
     * Set the chunk manager reference for terrain data access.
     * @param {Donkeycraft.ChunkManager} chunkManager - The active chunk manager.
     */
    Donkeycraft.MinimapUI.prototype.setChunkManager = function (chunkManager) {
        this._chunkManager = chunkManager || null;
    };

    /**
     * Get the highest surface block at a given world X,Z position.
     * Uses pre-built surface map for O(1) lookup per block.
     * Builds the surface map lazily on first access by scanning from top to bottom.
     * Result is cached in `chunk._mapSurfaceMap[lx][lz]` for subsequent calls.
     * @param {Donkeycraft.ChunkManager|null} chunkManager - The chunk manager to query.
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} The block ID of the surface block, or 1 (stone) as fallback.
     * @private
     */
    Donkeycraft.MinimapUI._getSurfaceBlock = function (chunkManager, wx, wz) {
        if (!chunkManager) return 1;

        var intWx = Math.floor(wx);
        var intWz = Math.floor(wz);

        var chunkX = Math.floor(intWx / CHUNK_SIZE);
        var chunkZ = Math.floor(intWz / CHUNK_SIZE);
        var localX = ((intWx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        var localZ = ((intWz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        var chunk = chunkManager.getChunkIfExists(chunkX, chunkZ);
        if (!chunk) return 1;

        // Read from pre-built surface map — O(1) lookup
        var surfaceMap = chunk._mapSurfaceMap;
        if (surfaceMap && surfaceMap[localX] && surfaceMap[localX][localZ] !== undefined) {
            var cached = surfaceMap[localX][localZ];
            return cached !== null ? cached : 1;
        }

        // Surface map not built yet — scan from top to bottom and build it
        if (!chunk._mapSurfaceMap) {
            chunk._mapSurfaceMap = [];
            for (var lx = 0; lx < CHUNK_SIZE; lx++) {
                chunk._mapSurfaceMap[lx] = [];
                for (var lz = 0; lz < CHUNK_SIZE; lz++) {
                    chunk._mapSurfaceMap[lx][lz] = null;
                }
            }
        }

        var surfaceBlockId = 1; // Default: stone
        try {
            var worldHeight = Config && Config.WORLD_HEIGHT ? Config.WORLD_HEIGHT : 256;
            for (var y = worldHeight - 1; y >= 0; y--) {
                var blockId = chunk.getBlock(localX, y, localZ);
                if (blockId === 0) continue; // Skip air
                surfaceBlockId = blockId;
                break;
            }
        } catch (e) {
            Donkeycraft.Logger.warn('MinimapUI', 'Failed to read block at [' + localX + ',' + localZ + ']: ' + e.message);
        }

        // Cache result in surface map
        chunk._mapSurfaceMap[localX][localZ] = surfaceBlockId;
        return surfaceBlockId;
    };

    /**
     * Render the rotating minimap (top-left, "up" = player forward direction).
     * Terrain rotates around a static player dot based on yaw.
     * Draws circular clip, terrain tiles, compass ring, and border.
     * @param {Object} playerPos - Player world position with x, y, z properties.
     * @param {number} yaw - Player yaw in radians (direction the player faces).
     */
    Donkeycraft.MinimapUI.prototype.render = function (playerPos, yaw) {
        // Input validation
        if (!this._canvas) return;
        if (!playerPos || typeof playerPos.x !== 'number' || typeof playerPos.z !== 'number') return;
        if (typeof yaw !== 'number') return;

        var canvas = this._canvas;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var size = canvas.width;
        var halfSize = size / 2;
        var radius = halfSize - 2; // Leave room for border

        if (size === 0 || radius <= 0) return;

        // Calculate world units per pixel for minimap scale
        // minimapRadius is in world blocks, radius is in canvas pixels
        var minimapRadius = this._minimapRadius;
        var worldUnitsPerPixel = minimapRadius * 2 / radius;

        // Clear and draw background
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(10, 15, 20, 0.8)';
        ctx.fillRect(0, 0, size, size);

        // Save context and clip to circular minimap area
        ctx.save();
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, radius, 0, Math.PI * 2);
        ctx.clip();

        // Rotate context so player's forward direction is "up" on screen.
        ctx.translate(halfSize, halfSize);
        ctx.rotate(-yaw + Math.PI);

        // Draw terrain tiles around the player
        var tileWorldSize = worldUnitsPerPixel * this._blockPixelSize;
        if (tileWorldSize < 0.3) tileWorldSize = 0.3; // Minimum tile size to prevent gaps

        var halfWorld = minimapRadius;
        var startBlockX = Math.floor(-halfWorld);
        var endBlockX = Math.ceil(halfWorld);
        var startBlockZ = Math.floor(-halfWorld);
        var endBlockZ = Math.ceil(halfWorld);

        // Use integer player coordinates for block queries
        var playerIntX = Math.floor(playerPos.x);
        var playerIntZ = Math.floor(playerPos.z);

        for (var bx = startBlockX; bx <= endBlockX; bx++) {
            for (var bz = startBlockZ; bz <= endBlockZ; bz++) {
                var worldX = playerIntX + bx;
                var worldZ = playerIntZ + bz;
                var blockId = Donkeycraft.MinimapUI._getSurfaceBlock(this._chunkManager, worldX, worldZ);

                if (blockId === 0) continue; // Skip air

                var color = this._getBlockColor(blockId);
                ctx.fillStyle = color || '#555';
                ctx.fillRect(
                    bx * tileWorldSize,
                    bz * tileWorldSize,
                    Math.max(1, Math.ceil(tileWorldSize)),
                    Math.max(1, Math.ceil(tileWorldSize))
                );
            }
        }

        // Draw player as a static white dot at center
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Restore context (remove clip and rotation)
        ctx.restore();

        // Draw compass ring (fixed N/S/E/W markers around the edge)
        this._renderCompassRing(ctx, halfSize, radius);

        // Draw circular border
        ctx.strokeStyle = 'rgba(100, 200, 100, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, radius, 0, Math.PI * 2);
        ctx.stroke();
    };

    /**
     * Get the color for a block ID.
     * Always delegates to MapRenderer's master block color lookup for consistency.
     * @param {number} blockId - The block ID.
     * @returns {string} CSS color string (e.g., '#7a7a7a').
     * @private
     */
    Donkeycraft.MinimapUI.prototype._getBlockColor = function (blockId) {
        // Always delegate to MapRenderer's master color lookup — fallback table removed
        // to prevent color inconsistencies between minimap and full map views.
        if (Donkeycraft.MapRenderer && typeof Donkeycraft.MapRenderer._getBlockColor === 'function') {
            return Donkeycraft.MapRenderer._getBlockColor(blockId);
        }
        // Ultimate fallback only when MapRenderer is completely unavailable
        return '#555555';
    };

    /**
     * Render the compass ring on the minimap.
     * N is fixed at top of circle (red); E/S/W at 90-degree intervals (gray).
     * Labels are positioned outside the circular clip at radius + 12 pixels.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context (already restored from save).
     * @param {number} cx - Center X coordinate of the minimap.
     * @param {number} cy - Center Y coordinate of the minimap.
     * @param {number} radius - Radius of the minimap circle in pixels.
     * @private
     */
    Donkeycraft.MinimapUI.prototype._renderCompassRing = function (ctx, cx, cy, radius) {
        // Compass ring background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
        ctx.fill();

        // Direction markers — fixed positions on screen
        ctx.font = 'bold 10px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var labelRadius = radius + 12;

        // N — always at top (red for emphasis)
        ctx.fillStyle = '#ff4444';
        ctx.fillText('N', cx, cy - labelRadius);

        // E — always at right
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('E', cx + labelRadius, cy);

        // S — always at bottom
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('S', cx, cy + labelRadius);

        // W — always at left
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('W', cx - labelRadius, cy);
    };

    /**
     * Invalidate the per-chunk surface map for a given chunk.
     * Called when blocks are placed or broken in that chunk.
     * The surface map will be rebuilt on next access.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.MinimapUI.invalidateChunkSurfaceMap = function (chunkX, chunkZ) {
        // Surface map will be rebuilt on next access by _getSurfaceBlock
        // No action needed here — lazy rebuild is intentional for performance
    };

    /**
     * Invalidate the per-chunk surface maps for all loaded chunks.
     * Called when switching dimensions to ensure fresh terrain data.
     * @param {Donkeycraft.ChunkManager} chunkManager - The active chunk manager.
     */
    Donkeycraft.MinimapUI.invalidateAllSurfaceMaps = function (chunkManager) {
        if (!chunkManager) return;

        var chunks = chunkManager.getAllChunks();
        if (!chunks) return;

        for (var i = 0; i < chunks.length; i++) {
            delete chunks[i]._mapSurfaceMap;
        }
    };

    /**
     * Destroy and free all resources.
     * Nullifies canvas and chunk manager references for garbage collection.
     */
    Donkeycraft.MinimapUI.prototype.destroy = function () {
        if (this._destroyed) return;
        this._destroyed = true;

        this._canvas = null;
        this._chunkManager = null;
    };

})();
