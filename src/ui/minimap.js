// Donkeycraft — Minimap UI Module
// Standalone minimap renderer: circular top-down view with compass ring,
// player dot, and terrain tiles rotating around the player based on yaw.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = window.Donkeycraft && window.Donkeycraft.Config;
    var CHUNK_SIZE = Config ? Config.CHUNK_SIZE : 16;

    // Reference to the block color lookup from map-renderer.js
    // This module expects Donkeycraft.MapRenderer._getBlockColor to be available
    // or uses its own internal color table.

    /**
     * MinimapUI — manages the circular minimap display.
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
     * Initialize the minimap UI. Sets up canvas and block colors.
     * @returns {boolean} True if initialized successfully.
     */
    Donkeycraft.MinimapUI.prototype.init = function () {
        try {
            this._canvas = document.getElementById('dk-minimap-canvas');
            if (this._canvas) {
                var minimapSize = Config && Config.MAP_MINIMAP_SIZE ? Config.MAP_MINIMAP_SIZE : 150;
                this._canvas.width = minimapSize;
                this._canvas.height = minimapSize;
            } else {
                Donkeycraft.Logger.warn('MinimapUI', 'Minimap canvas element not found in DOM');
            }
            return true;
        } catch (e) {
            Donkeycraft.Logger.error('MinimapUI', 'Initialization failed: ' + e.message);
            return false;
        }
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
     * @param {Donkeycraft.ChunkManager} chunkManager - The chunk manager to query.
     * @param {number} wx - World X coordinate.
     * @param {number} wz - World Z coordinate.
     * @returns {number} The block ID of the surface block, or 1 (stone) as fallback.
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
        if (surfaceMap && surfaceMap[localX] && surfaceMap[localX][localZ]) {
            return surfaceMap[localX][localZ];
        }

        // Surface map not built — scan from top to bottom and build it
        var worldHeight = Config && Config.WORLD_HEIGHT ? Config.WORLD_HEIGHT : 256;
        var surfaceY = -1;
        var surfaceBlockId = 1; // Default: stone
        try {
            for (var y = worldHeight - 1; y >= 0; y--) {
                var blockId = chunk.getBlock(localX, y, localZ);
                if (blockId === 0) continue; // Air
                surfaceY = y;
                surfaceBlockId = blockId;
                break;
            }
        } catch (e) { /* ignore */ }

        // Build surface map on first access (one-time cost per chunk)
        if (!chunk._mapSurfaceMap) {
            chunk._mapSurfaceMap = [];
            for (var lx = 0; lx < CHUNK_SIZE; lx++) {
                chunk._mapSurfaceMap[lx] = [];
                for (var lz = 0; lz < CHUNK_SIZE; lz++) {
                    chunk._mapSurfaceMap[lx][lz] = null;
                }
            }
        }

        var result = (surfaceY >= 0) ? surfaceBlockId : 1;
        chunk._mapSurfaceMap[localX][localZ] = result;
        return result;
    };

    /**
     * Render the rotating minimap (top-left, "up" = player forward direction).
     * Terrain rotates around a static player dot based on yaw.
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians.
     */
    Donkeycraft.MinimapUI.prototype.render = function (playerPos, yaw) {
        if (!this._canvas) return;

        var canvas = this._canvas;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var size = canvas.width;
        var halfSize = size / 2;
        var radius = halfSize - 2; // Leave room for border

        if (size === 0 || radius <= 0) return;

        // Calculate blocks per pixel for minimap scale
        var minimapRadius = this._minimapRadius;
        var blocksPerPixel = minimapRadius * 2 / radius;

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
        var tileWorldSize = blocksPerPixel * this._blockPixelSize;
        if (tileWorldSize < 0.3) tileWorldSize = 0.3;

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

                if (blockId === 0) continue; // Skip air only

                var color = this._getBlockColor(blockId);
                ctx.fillStyle = color || '#555';
                ctx.fillRect(
                    bx * tileWorldSize,
                    bz * tileWorldSize,
                    Math.ceil(tileWorldSize),
                    Math.ceil(tileWorldSize)
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
     * @param {number} blockId - The block ID.
     * @returns {string} CSS color string.
     * @private
     */
    Donkeycraft.MinimapUI.prototype._getBlockColor = function (blockId) {
        // Use the MapRenderer's block color lookup if available
        if (Donkeycraft.MapRenderer && typeof Donkeycraft.MapRenderer._getBlockColor === 'function') {
            return Donkeycraft.MapRenderer._getBlockColor(blockId);
        }
        // Fallback color table
        var colors = {};
        colors[1] = '#7a7a7a'; // stone
        colors[8] = '#4a8c2c'; // grass_block
        colors[13] = 'rgba(48,96,192,0.55)'; // water
        colors[17] = '#6b4c2a'; // oak_log
        colors[18] = '#2d5a1e'; // oak_leaves
        return colors[blockId] || '#555555';
    };

    /**
     * Render the compass ring on the minimap.
     * N is fixed at top of circle; E/S/W at 90-degree intervals.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {number} cx - Center X coordinate.
     * @param {number} cy - Center Y coordinate.
     * @param {number} radius - Radius of the minimap circle.
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
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.MinimapUI.invalidateChunkSurfaceMap = function (chunkX, chunkZ) {
        // Surface map will be rebuilt on next access
    };

    /**
     * Destroy and free all resources.
     */
    Donkeycraft.MinimapUI.prototype.destroy = function () {
        if (this._destroyed) return;
        this._destroyed = true;
        this._canvas = null;
        this._chunkManager = null;
    };

})();