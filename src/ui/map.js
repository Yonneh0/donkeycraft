/* Donkeycraft — Full Map Panel UI Module */
// Manages the full-screen panning/zooming 2D map panel, toggle button,
// close button, and canvas interaction handlers.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = window.Donkeycraft && window.Donkeycraft.Config;
    var CHUNK_SIZE = Config ? Config.CHUNK_SIZE : 16;

    /**
     * MapPanelUI — manages the full-screen map panel DOM, toggle button,
     * canvas drag/zoom interactions, and overlay rendering.
     * @constructor
     * @param {Object} [options] - Configuration options.
     * @param {Donkeycraft.ChunkManager} [options.chunkManager] - Reference to active chunk manager.
     */
    Donkeycraft.MapPanelUI = function (options) {
        options = options || {};

        /** @type {Donkeycraft.ChunkManager|null} @private */
        this._chunkManager = options.chunkManager || null;
        /** @type {HTMLCanvasElement|null} @private */
        this._fullMapCanvas = null;
        /** @type {HTMLCanvasElement|null} @private */
        this._fullMapOffscreen = null;
        /** @type {CanvasRenderingContext2D|null} @private */
        this._fullMapCtx = null;
        /** @type {boolean} @private */
        this._visible = false;
        /** @type {number} @private */
        this._zoom = 1.0;
        /** @type {number} @private */
        this._offsetX = 0;
        /** @type {number} @private */
        this._offsetY = 0;
        /** @type {boolean} @private */
        this._dragging = false;
        /** @type {number} @private */
        this._dragLastX = 0;
        /** @type {number} @private */
        this._dragLastY = 0;
        /** @type {string} @private */
        this._dimensionName = 'Overworld';
        /** @type {HTMLElement|null} @private */
        this._mapPanel = null;
        /** @type {HTMLButtonElement|null} @private */
        this._toggleBtn = null;
        /** @type {HTMLButtonElement|null} @private */
        this._closeBtn = null;
        /** @type {boolean} @private */
        this._ownsPanel = false;
        /** @type {boolean} @private */
        this._ownsToggleBtn = false;
        /** @type {boolean} @private */
        this._destroyed = false;
        /** @type {number|null} @private */
        this._lastChunkCount = -1;
        /** @type {number|null} @private */
        this._lastCenterX = null;
        /** @type {number|null} @private */
        this._lastCenterZ = null;
        /** @type {number} @private */
        this._centerThreshold = 5.0; // Blocks — re-center only when player moves >= 5 blocks
        /** @type {number} @private */
        this._blockPixelSize = 1.0;

        // Named handler references for proper event listener cleanup
        this._handlers = {
            _onWheel: null,
            _onMouseDown: null,
            _onMouseUp: null,
            _onMouseMove: null,
            _onMouseLeave: null,
            _onToggleClick: null,
            _onCloseClick: null,
            _onKeydown: null
        };
    };

    /**
     * Initialize the map panel UI. Sets up internal canvases and block colors.
     * @returns {boolean} True if initialized successfully.
     */
    Donkeycraft.MapPanelUI.prototype.init = function () {
        try {
            this._fullMapOffscreen = document.createElement('canvas');
            this._fullMapCtx = this._fullMapOffscreen.getContext('2d');
            if (!this._fullMapCtx) {
                Donkeycraft.Logger.error('MapPanelUI', 'Failed to create 2D context for offscreen canvas');
                return false;
            }
            return true;
        } catch (e) {
            Donkeycraft.Logger.error('MapPanelUI', 'Initialization failed: ' + e.message);
            return false;
        }
    };

    /**
     * Create the map panel DOM element if it doesn't already exist.
     * Creates the canvas element directly inside the panel with explicit dimensions.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._createMapPanel = function () {
        if (this._mapPanel) return;

        var panel = document.getElementById('dk-map-panel');
        if (panel) {
            this._mapPanel = panel;
            this._ownsPanel = false;
        } else {
            panel = document.createElement('div');
            panel.id = 'dk-map-panel';
            panel.className = 'dk-map-panel';
            this._mapPanel = panel;
            this._ownsPanel = true;
        }

        // Close button
        var closeBtn = document.getElementById('dk-map-close-btn');
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.id = 'dk-map-close-btn';
            closeBtn.className = 'dk-map-close-btn';
            closeBtn.title = 'Close Map (Esc)';
            closeBtn.textContent = '\u2715';
            this._mapPanel.appendChild(closeBtn);
        }
        this._closeBtn = closeBtn;

        var renderer = this;
        this._handlers._onCloseClick = function () {
            renderer.hideMap();
        };
        this._closeBtn.addEventListener('click', this._handlers._onCloseClick);

        // Full map canvas — create directly in panel if not found in DOM
        var canvas = document.getElementById('dk-map-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'dk-map-canvas';
            this._mapPanel.appendChild(canvas);
        }

        // Set explicit dimensions for event handling (use window-relative sizing since panel is hidden)
        var canvasW = Math.floor(window.innerWidth * 0.66);
        var canvasH = Math.floor(window.innerHeight * 0.66);
        if (canvas.width <= 0 || canvas.height <= 0) {
            canvas.width = canvasW;
            canvas.height = canvasH;
        }
        this._fullMapCanvas = canvas;

        // Attach drag/zoom listeners to the canvas
        if (this._fullMapCanvas) {
            this._attachCanvasListeners(this._fullMapCanvas);
        }

        // Append panel to body if we own it and not in DOM
        if (this._ownsPanel && !document.getElementById('dk-map-panel')) {
            document.body.appendChild(this._mapPanel);
        }
    };

    /**
     * Attach canvas event listeners for drag and zoom interaction.
     * Uses capture phase (true) to intercept events before the game's pointer lock
     * or other input handlers can consume them.
     * Listeners are only attached once — if handlers already exist, this is a no-op.
     * @param {HTMLCanvasElement} canvas - The canvas element.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._attachCanvasListeners = function (canvas) {
        if (!canvas) return;
        var renderer = this;

        // Only attach listeners once — check if any handler is already set
        if (this._handlers._onWheel) return;

        this._handlers._onWheel = function (e) {
            e.preventDefault();
            e.stopPropagation();
            renderer._onWheel(e);
        };
        // Use capture phase to intercept before game handlers
        canvas.addEventListener('wheel', this._handlers._onWheel, { passive: false, capture: true });

        this._handlers._onMouseDown = function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.button === 0) {
                renderer._dragging = true;
                renderer._dragLastX = e.clientX;
                renderer._dragLastY = e.clientY;
                canvas.style.cursor = 'grabbing';
            }
        };
        canvas.addEventListener('mousedown', this._handlers._onMouseDown, { capture: true });

        this._handlers._onMouseUp = function (e) {
            e.stopPropagation();
            renderer._dragging = false;
            if (canvas) canvas.style.cursor = '';
        };
        canvas.addEventListener('mouseup', this._handlers._onMouseUp, { capture: true });

        this._handlers._onMouseMove = function (e) {
            e.stopPropagation();
            if (renderer._dragging) {
                var dx = e.clientX - renderer._dragLastX;
                var dy = e.clientY - renderer._dragLastY;
                renderer._offsetX -= dx / renderer._zoom;
                renderer._offsetY -= dy / renderer._zoom;
                renderer._dragLastX = e.clientX;
                renderer._dragLastY = e.clientY;
            }
        };
        canvas.addEventListener('mousemove', this._handlers._onMouseMove, { capture: true });

        this._handlers._onMouseLeave = function () {
            renderer._dragging = false;
            if (canvas) canvas.style.cursor = '';
        };
        canvas.addEventListener('mouseleave', this._handlers._onMouseLeave);
    };

    /**
     * Create the toggle button DOM element if it doesn't already exist.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._createToggleButton = function () {
        if (this._toggleBtn) return;

        var btn = document.getElementById('dk-map-toggle-btn');
        if (btn) {
            this._toggleBtn = btn;
            this._ownsToggleBtn = false;
            return;
        }

        btn = document.createElement('button');
        btn.id = 'dk-map-toggle-btn';
        btn.className = 'dk-map-toggle-btn';
        btn.textContent = '\u2630 Map';
        btn.title = 'Toggle Map View (M)';
        this._toggleBtn = btn;
        this._ownsToggleBtn = true;

        var renderer = this;
        this._handlers._onToggleClick = function () {
            if (renderer.isVisible()) {
                renderer.hideMap();
            } else {
                renderer.showMap();
            }
        };
        btn.addEventListener('click', this._handlers._onToggleClick);

        document.body.appendChild(btn);
    };

    /**
     * Set the canvas elements from DOM after they are available.
     * Sets explicit internal dimensions so the canvas can receive mouse events.
     * Never shrinks the canvas below its current valid size when panel is hidden (display:none returns 0x0).
     * @param {HTMLCanvasElement} fullMapCanvas - The full map canvas element.
     * @param {HTMLCanvasElement} minimapCanvas - The minimap canvas element (unused, kept for API compat).
     */
    Donkeycraft.MapPanelUI.prototype.setCanvases = function (fullMapCanvas, minimapCanvas) {
        this._fullMapCanvas = fullMapCanvas || this._fullMapCanvas;

        if (this._fullMapCanvas) {
            // Default fallback dimensions (window-relative since panel may be hidden)
            var canvasW = Math.floor(window.innerWidth * 0.66);
            var canvasH = Math.floor(window.innerHeight * 0.66);

            // Try to get actual panel dimensions, but only if non-zero
            if (this._mapPanel) {
                var panelRect = this._mapPanel.getBoundingClientRect();
                if (panelRect.width > 0 && panelRect.height > 0) {
                    canvasW = Math.floor(panelRect.width);
                    canvasH = Math.floor(panelRect.height);
                }
            }

            // Never shrink the canvas below its current valid size
            // (getBoundingClientRect returns 0x0 when display:none)
            var curW = this._fullMapCanvas.width;
            var curH = this._fullMapCanvas.height;
            if (curW > 0 && curH > 0) {
                canvasW = Math.max(canvasW, curW);
                canvasH = Math.max(canvasH, curH);
            }

            this._fullMapCanvas.width = canvasW;
            this._fullMapCanvas.height = canvasH;

            if (!this._handlers._onWheel) {
                this._attachCanvasListeners(this._fullMapCanvas);
            }
        }
    };

    /**
     * Set the chunk manager reference.
     * @param {Donkeycraft.ChunkManager} chunkManager - The active chunk manager.
     */
    Donkeycraft.MapPanelUI.prototype.setChunkManager = function (chunkManager) {
        this._chunkManager = chunkManager || null;
    };

    /**
     * Set the dimension name for display overlay.
     * @param {string} name - Dimension name.
     */
    Donkeycraft.MapPanelUI.prototype.setDimensionName = function (name) {
        this._dimensionName = name || 'Unknown';
    };

    /**
     * Handle mousewheel zoom on the full map canvas.
     * Zooms toward cursor position with clamped factor (0.7x–1.4x per event).
     * Zoom levels are clamped to [MAP_ZOOM_MIN, MAP_ZOOM_MAX] (default: 0.05–4.0).
     * @param {WheelEvent} e - The wheel event.
     */
    Donkeycraft.MapPanelUI.prototype._onWheel = function (e) {
        if (!this._fullMapCanvas || !this._visible) return;

        // Clamp delta to prevent extreme zoom factors from fast scrolling
        var clampedDeltaY = Math.max(-200, Math.min(200, e.deltaY));
        var zoomFactor = 1.0;
        if (clampedDeltaY < 0) {
            zoomFactor = 1.15;
        } else if (clampedDeltaY > 0) {
            zoomFactor = 1.0 / 1.15;
        }

        // Clamp zoom factor to reasonable range per wheel event
        zoomFactor = Math.max(0.7, Math.min(1.4, zoomFactor));

        var rect = this._fullMapCanvas.getBoundingClientRect();
        var mouseX = e.clientX - rect.left;
        var mouseY = e.clientY - rect.top;

        var canvasWidth = this._fullMapCanvas.width;
        var canvasHeight = this._fullMapCanvas.height;

        var worldXBefore = this._offsetX + (mouseX / canvasWidth) * (canvasWidth / this._zoom);
        var worldYBefore = this._offsetY + (mouseY / canvasHeight) * (canvasHeight / this._zoom);

        var newZoom = this._zoom * zoomFactor;
        var zoomMin = Config && Config.MAP_ZOOM_MIN ? Config.MAP_ZOOM_MIN : 0.05;
        var zoomMax = Config && Config.MAP_ZOOM_MAX ? Config.MAP_ZOOM_MAX : 4.0;
        newZoom = Math.max(zoomMin, Math.min(zoomMax, newZoom));

        this._offsetX = worldXBefore - (mouseX / canvasWidth) * (canvasWidth / newZoom);
        this._offsetY = worldYBefore - (mouseY / canvasHeight) * (canvasHeight / newZoom);
        this._zoom = newZoom;

        if (this._fullMapOffscreen) {
            this._fullMapOffscreen.width = canvasWidth;
            this._fullMapOffscreen.height = canvasHeight;
        }
    };

    /**
     * Center the map view on a world position with hysteresis to prevent
     * excessive re-centering during small player movements.
     * Only re-centers when the player has moved >= _centerThreshold (5 blocks)
     * from the last center position.
     * @param {number} worldX - World X coordinate.
     * @param {number} worldZ - World Z coordinate.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._centerOnPosition = function (worldX, worldZ) {
        if (!this._fullMapCanvas) return;

        var lastX = this._lastCenterX;
        var lastZ = this._lastCenterZ;
        if (lastX !== null && lastZ !== null) {
            var dx = Math.abs(worldX - lastX);
            var dz = Math.abs(worldZ - lastZ);
            var threshold = this._centerThreshold;
            if (dx < threshold && dz < threshold) return;
        }

        var canvasWidth = this._fullMapCanvas.width;
        var canvasHeight = this._fullMapCanvas.height;
        var zoom = this._zoom;

        this._offsetX = worldX - (canvasWidth / 2) / zoom;
        this._offsetY = worldZ - (canvasHeight / 2) / zoom;

        this._lastCenterX = worldX;
        this._lastCenterZ = worldZ;
    };

    /**
     * Calculate the auto-zoom level to fit all loaded chunks within the canvas.
     * Padding is proportional to canvas size for consistent appearance at different resolutions.
     * Skips recalculation if chunk count hasn't changed.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._calculateAutoZoom = function () {
        if (!this._chunkManager || !this._fullMapCanvas) return;

        var chunks = this._chunkManager.getAllChunks();
        if (!chunks || chunks.length === 0) return;

        var currentCount = chunks.length;
        if (currentCount === this._lastChunkCount) return;
        this._lastChunkCount = currentCount;

        var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (var i = 0; i < chunks.length; i++) {
            var cx = chunks[i].chunkX * CHUNK_SIZE;
            var cz = chunks[i].chunkZ * CHUNK_SIZE;
            if (cx < minX) minX = cx;
            if (cx + CHUNK_SIZE > maxX) maxX = cx + CHUNK_SIZE;
            if (cz < minZ) minZ = cz;
            if (cz + CHUNK_SIZE > maxZ) maxZ = cz + CHUNK_SIZE;
        }

        var canvasWidth = this._fullMapCanvas.width;
        var canvasHeight = this._fullMapCanvas.height;

        var worldWidth = maxX - minX;
        var worldHeight = maxZ - minZ;

        // Padding proportional to average canvas dimension for consistent appearance
        var avgCanvasDim = (canvasWidth + canvasHeight) / 2;
        var padding = Math.max(4, avgCanvasDim * 0.02); // 2% of canvas size, minimum 4 blocks

        var zoomX = canvasWidth / (worldWidth + padding * 2);
        var zoomY = canvasHeight / (worldHeight + padding * 2);
        var newZoom = Math.min(zoomX, zoomY);

        var zoomMin = Config && Config.MAP_ZOOM_MIN ? Config.MAP_ZOOM_MIN : 0.05;
        var zoomMax = Config && Config.MAP_ZOOM_MAX ? Config.MAP_ZOOM_MAX : 4.0;
        newZoom = Math.max(zoomMin, Math.min(zoomMax, newZoom));

        if (Math.abs(newZoom - this._zoom) > 0.01) {
            this._zoom = newZoom;

            var centerX = minX + worldWidth / 2;
            var centerY = minZ + worldHeight / 2;
            this._offsetX = centerX - (canvasWidth / 2) / this._zoom;
            this._offsetY = centerY - (canvasHeight / 2) / this._zoom;

            if (this._fullMapOffscreen) {
                this._fullMapOffscreen.width = canvasWidth;
                this._fullMapOffscreen.height = canvasHeight;
            }
        }
    };

    /**
     * Render surface blocks for a chunk onto the canvas using pre-built surface map (O(1) lookup).
     * Skips air blocks and defaults to stone (ID: 1) for missing/unloaded chunks.
     * Renders block borders when blockPixelSize >= 1.5 pixels.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     * @param {number} canvasX - Canvas X offset for this chunk's top-left corner.
     * @param {number} canvasY - Canvas Y offset for this chunk's top-left corner.
     * @param {number} blockPixelSize - Size in pixels of one block.
     * @param {number} zoom - Current zoom level (used for border visibility threshold).
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._renderSurfaceBlocks = function (ctx, chunkX, chunkZ, canvasX, canvasY, blockPixelSize, zoom) {
        var chunk = this._chunkManager ? this._chunkManager.getChunkIfExists(chunkX, chunkZ) : null;
        if (!chunk) return;

        if (blockPixelSize < 0.5) return;

        var showBorders = blockPixelSize >= 1.5;
        var surfaceMap = chunk._mapSurfaceMap;

        for (var lx = 0; lx < CHUNK_SIZE; lx++) {
            for (var lz = 0; lz < CHUNK_SIZE; lz++) {
                var blockId = 1; // Default: stone

                // Read from pre-built surface map if available
                if (surfaceMap && surfaceMap[lx] && surfaceMap[lx][lz] !== undefined) {
                    blockId = surfaceMap[lx][lz];
                }

                // Skip air blocks; stone is default for unloaded/missing chunks
                if (blockId === 0) continue;

                var color = this._getBlockColor(blockId);
                ctx.fillStyle = color || '#555';

                var bx = Math.floor(canvasX + lx * blockPixelSize);
                var by = Math.floor(canvasY + lz * blockPixelSize);
                var bw = Math.max(1, Math.ceil(blockPixelSize));
                var bh = Math.max(1, Math.ceil(blockPixelSize));

                ctx.fillRect(bx, by, bw, bh);

                if (showBorders) {
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(bx, by, bw, bh);
                }
            }
        }
    };

    /**
     * Get the color for a block ID.
     * Always delegates to MapRenderer's master block color lookup for consistency.
     * @param {number} blockId - The block ID.
     * @returns {string} CSS color string.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._getBlockColor = function (blockId) {
        // Always delegate to MapRenderer's master color lookup — fallback table removed
        // to prevent color inconsistencies between map panel and minimap views.
        if (Donkeycraft.MapRenderer && typeof Donkeycraft.MapRenderer._getBlockColor === 'function') {
            return Donkeycraft.MapRenderer._getBlockColor(blockId);
        }
        // Ultimate fallback only when MapRenderer is completely unavailable
        return '#555555';
    };

    /**
     * Draw grid lines every 64 blocks for world orientation.
     * Uses half-pixel offset for crisp anti-aliased lines.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {number} worldLeft - Left edge of visible world range.
     * @param {number} worldTop - Top edge of visible world range.
     * @param {number} worldRight - Right edge of visible world range.
     * @param {number} worldBottom - Bottom edge of visible world range.
     * @param {number} zoom - Current zoom level.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._drawGridLines = function (ctx, worldLeft, worldTop, worldRight, worldBottom, zoom) {
        var gridSpacing = 64;

        // Vertical grid lines
        var startGX = Math.floor(worldLeft / gridSpacing) * gridSpacing;
        for (var gx = startGX; gx <= worldRight; gx += gridSpacing) {
            var canvasGX = (gx - this._offsetX) * zoom;
            var canvasTopY = (worldTop - this._offsetY) * zoom;
            var canvasBottomY = (worldBottom - this._offsetY) * zoom;
            ctx.strokeStyle = 'rgba(100, 200, 100, 0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(Math.floor(canvasGX) + 0.5, Math.floor(canvasTopY));
            ctx.lineTo(Math.floor(canvasGX) + 0.5, Math.floor(canvasBottomY));
            ctx.stroke();
        }

        // Horizontal grid lines
        var startGZ = Math.floor(worldTop / gridSpacing) * gridSpacing;
        for (var gz = startGZ; gz <= worldBottom; gz += gridSpacing) {
            var canvasGZ = (gz - this._offsetY) * zoom;
            var canvasLeftX = (worldLeft - this._offsetX) * zoom;
            var canvasRightX = (worldRight - this._offsetX) * zoom;
            ctx.beginPath();
            ctx.moveTo(Math.floor(canvasLeftX), Math.floor(canvasGZ) + 0.5);
            ctx.lineTo(Math.floor(canvasRightX), Math.floor(canvasGZ) + 0.5);
            ctx.stroke();
        }
    };

    /**
     * Render the player indicator on the full map: white dot with red direction arrow.
     * Clipped to canvas bounds with 20-pixel margin.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {Object} playerPos - Player world position {x, y, z}.
     * @param {number} yaw - Player yaw in radians (direction the player faces).
     * @param {number} w - Canvas width.
     * @param {number} h - Canvas height.
     * @param {number} zoom - Current zoom level.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._renderPlayerIndicator = function (ctx, playerPos, yaw, w, h, zoom) {
        if (!playerPos) return;

        var canvasX = (playerPos.x - this._offsetX) * zoom;
        var canvasY = (playerPos.z - this._offsetY) * zoom;

        if (canvasX < -20 || canvasX > w + 20 || canvasY < -20 || canvasY > h + 20) return;

        // Player dot
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Direction arrow
        var arrowLength = 10;
        var arrowEndX = canvasX - Math.sin(yaw) * arrowLength;
        var arrowEndY = canvasY - Math.cos(yaw) * arrowLength;

        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvasX, canvasY);
        ctx.lineTo(arrowEndX, arrowEndY);
        ctx.stroke();

        // Arrowhead
        var arrowAngle = Math.atan2(arrowEndY - canvasY, arrowEndX - canvasX);
        var headSize = 4;
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.moveTo(arrowEndX, arrowEndY);
        ctx.lineTo(
            arrowEndX - headSize * Math.cos(arrowAngle - Math.PI / 6),
            arrowEndY - headSize * Math.sin(arrowAngle - Math.PI / 6)
        );
        ctx.lineTo(
            arrowEndX - headSize * Math.cos(arrowAngle + Math.PI / 6),
            arrowEndY - headSize * Math.sin(arrowAngle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
    };

    /**
     * Render the dimension label and stats overlay in the top-left corner.
     * Displays: dimension name (truncated to 16 chars), zoom level, loaded chunk count.
     * Dimensions are clamped to prevent overflow beyond canvas bounds.
     * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
     * @param {number} w - Canvas width (ensures overlay fits within bounds).
     * @param {number} h - Canvas height.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._renderOverlay = function (ctx, w, h) {
        // Clamp overlay dimensions to canvas bounds
        var overlayWidth = Math.min(200, w - 16);
        var overlayHeight = Math.min(60, h - 16);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(8, 8, overlayWidth, overlayHeight);

        ctx.font = '12px Consolas, Monaco, Courier New, monospace';
        ctx.textBaseline = 'top';

        // Dimension name (truncated if too long)
        var dimName = this._dimensionName || 'Unknown';
        if (dimName.length > 16) dimName = dimName.substring(0, 14) + '..';
        ctx.fillStyle = '#8f8';
        ctx.fillText(dimName, 14, 14);

        // Zoom level with validation
        var zoomVal = typeof this._zoom === 'number' ? this._zoom : 1.0;
        ctx.fillStyle = '#ccc';
        ctx.fillText('Zoom: ' + zoomVal.toFixed(2) + 'x', 14, 30);

        // Chunk count with validation
        var chunkCount = 0;
        if (this._chunkManager && typeof this._chunkManager.getChunkCount === 'function') {
            chunkCount = this._chunkManager.getChunkCount();
        }
        if (typeof chunkCount !== 'number' || isNaN(chunkCount)) chunkCount = 0;
        ctx.fillText('Chunks: ' + chunkCount, 14, 46);
    };

    /**
     * Render the full map view (top-down, Y-axis looking down).
     * Displays terrain tiles for all loaded chunks in the current dimension,
     * with grid lines, player indicator, and stats overlay.
     * @param {Object} [playerPos] - Player world position {x, y, z}.
     * @param {number} [yaw] - Player yaw in radians.
     * @param {number} [pitch] - Player pitch (unused in 2D view).
     */
    Donkeycraft.MapPanelUI.prototype.renderFullMap = function (playerPos, yaw, pitch) {
        // Guard: only render when visible with valid canvas
        if (!this._visible || !this._fullMapCanvas) return;

        var canvas = this._fullMapCanvas;
        var w = canvas.width;
        var h = canvas.height;

        // Skip rendering for zero-size canvas (panel not yet laid out)
        if (w <= 0 || h <= 0) return;

        this._calculateAutoZoom();

        // Re-sync offscreen canvas size if needed
        if (this._fullMapOffscreen.width !== w || this._fullMapOffscreen.height !== h) {
            this._fullMapOffscreen.width = w;
            this._fullMapOffscreen.height = h;
        }

        var ctx = this._fullMapCtx || canvas.getContext('2d');
        if (!ctx) return;

        // Validate player position and yaw before passing downstream
        var validPlayerPos = (playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') ? playerPos : null;
        var validYaw = (typeof yaw === 'number') ? yaw : 0;

        ctx.fillStyle = '#0a0f14';
        ctx.fillRect(0, 0, w, h);

        var zoom = this._zoom;
        var blockPixelSize = this._blockPixelSize * zoom;

        // Center map on player position when valid
        if (validPlayerPos) {
            this._centerOnPosition(validPlayerPos.x, validPlayerPos.z);
        }

        var worldLeft = this._offsetX;
        var worldTop = this._offsetY;
        var worldRight = this._offsetX + (w / zoom);
        var worldBottom = this._offsetY + (h / zoom);

        var startChunkX = Math.floor(worldLeft / CHUNK_SIZE) - 1;
        var endChunkX = Math.ceil(worldRight / CHUNK_SIZE) + 1;
        var startChunkZ = Math.floor(worldTop / CHUNK_SIZE) - 1;
        var endChunkZ = Math.ceil(worldBottom / CHUNK_SIZE) + 1;

        var loadedChunkSet = null;
        if (this._chunkManager) {
            var allChunks = this._chunkManager.getAllChunks();
            if (allChunks) {
                loadedChunkSet = Object.create(null);
                for (var a = 0; a < allChunks.length; a++) {
                    var key = allChunks[a].chunkX + ',' + allChunks[a].chunkZ;
                    loadedChunkSet[key] = true;
                }
            }
        }

        for (var cx = startChunkX; cx <= endChunkX; cx++) {
            for (var cz = startChunkZ; cz <= endChunkZ; cz++) {
                var chunkKey = cx + ',' + cz;
                if (loadedChunkSet && !loadedChunkSet[chunkKey]) continue;

                var chunkWorldX = cx * CHUNK_SIZE;
                var chunkWorldZ = cz * CHUNK_SIZE;

                var canvasX = ((chunkWorldX - this._offsetX) * zoom);
                var canvasY = ((chunkWorldZ - this._offsetY) * zoom);
                var chunkPixelSize = CHUNK_SIZE * blockPixelSize;

                ctx.fillStyle = '#0d1218';
                ctx.fillRect(
                    Math.floor(canvasX),
                    Math.floor(canvasY),
                    Math.ceil(chunkPixelSize) + 1,
                    Math.ceil(chunkPixelSize) + 1
                );

                this._renderSurfaceBlocks(ctx, cx, cz, canvasX, canvasY, blockPixelSize, zoom);

                ctx.strokeStyle = 'rgba(100, 200, 100, 0.12)';
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    Math.floor(canvasX),
                    Math.floor(canvasY),
                    Math.ceil(chunkPixelSize),
                    Math.ceil(chunkPixelSize)
                );
            }
        }

        this._drawGridLines(ctx, worldLeft, worldTop, worldRight, worldBottom, zoom);
        this._renderPlayerIndicator(ctx, validPlayerPos, validYaw, w, h, zoom);
        this._renderOverlay(ctx, w, h);

        var visibleCtx = this._fullMapCanvas.getContext('2d');
        if (visibleCtx) {
            visibleCtx.clearRect(0, 0, w, h);
            visibleCtx.drawImage(this._fullMapOffscreen, 0, 0);
        }
    };

    /**
     * Register the Escape key handler to close the map panel.
     * Should be called once during initialization (delegates to global handler).
     */
    Donkeycraft.MapPanelUI.prototype.registerEscapeHandler = function () {
        var renderer = this;

        // Only register if handler not already attached
        if (this._handlers._onKeydown) return;

        this._handlers._onKeydown = function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                if (renderer.isVisible()) {
                    renderer.hideMap();
                    e.preventDefault();
                }
            }
        };

        // Register with global keybindings system if available, otherwise attach to window
        if (Donkeycraft.Input && typeof Donkeycraft.Input.registerKeyHandler === 'function') {
            Donkeycraft.Input.registerKeyHandler('Escape', this._handlers._onKeydown);
        } else {
            window.addEventListener('keydown', this._handlers._onKeydown);
        }
    };

    /**
     * Show the full-screen map view.
     * Releases pointer lock (if active) so mouse events reach the canvas for panning/zooming.
     * The minimap remains visible — both displays can be used simultaneously.
     */
    Donkeycraft.MapPanelUI.prototype.showMap = function () {
        if (this._visible) return;

        this._visible = true;

        // Release pointer lock so mouse events reach the map canvas
        if (document.pointerLockElement) {
            try {
                document.exitPointerLock();
            } catch (e) {
                // Ignore errors from exitPointerLock
            }
        }

        this._createMapPanel();
        if (this._mapPanel) {
            this._mapPanel.style.display = 'block';
        }

        this._createToggleButton();
        if (this._toggleBtn) {
            this._toggleBtn.style.display = 'none';
        }

        // Minimap remains visible — no class toggle needed
        this._resizeCanvases();
        this._lastChunkCount = -1;
    };

    /**
     * Hide the full-screen map view.
     * The minimap remains visible.
     */
    Donkeycraft.MapPanelUI.prototype.hideMap = function () {
        if (!this._visible) return;

        this._visible = false;

        // Reset drag state when hiding
        this._dragging = false;

        if (this._mapPanel) {
            this._mapPanel.style.display = 'none';
        }

        if (this._toggleBtn) {
            this._toggleBtn.style.display = 'block';
        }

        // Minimap remains visible — no class toggle needed
    };

    /**
     * Check if the full map view is currently visible.
     * @returns {boolean} True if the map is visible.
     */
    Donkeycraft.MapPanelUI.prototype.isVisible = function () {
        return this._visible;
    };

    /**
     * Resize canvases to fit their containers.
     * Never shrinks the canvas below its current valid size when panel is hidden (display:none returns 0x0 from getBoundingClientRect).
     * Uses window-relative fallback dimensions (66% of viewport) when panel dimensions are unavailable.
     * @private
     */
    Donkeycraft.MapPanelUI.prototype._resizeCanvases = function () {
        if (!this._fullMapCanvas) return;

        var fallbackW = Math.floor(window.innerWidth * 0.66);
        var fallbackH = Math.floor(window.innerHeight * 0.66);

        if (this._mapPanel) {
            var panelRect = this._mapPanel.getBoundingClientRect();
            var panelW = Math.floor(panelRect.width);
            var panelH = Math.floor(panelRect.height);

            // Only resize if panel has non-zero dimensions AND is actually visible
            var isVisible = this._mapPanel.style.display !== 'none';
            if (panelW > 0 && panelH > 0 && isVisible) {
                this._fullMapCanvas.width = panelW;
                this._fullMapCanvas.height = panelH;
            } else if (!isVisible) {
                // Panel is hidden — never shrink below current valid size
                // (display:none causes getBoundingClientRect to return 0x0)
                var curW = this._fullMapCanvas.width;
                var curH = this._fullMapCanvas.height;
                if (curW <= 0 || curH <= 0) {
                    this._fullMapCanvas.width = fallbackW;
                    this._fullMapCanvas.height = fallbackH;
                }
                // else: keep current dimensions — they're already valid
            } else {
                // Panel visible but getBoundingClientRect returned 0x0 (rare race condition)
                this._fullMapCanvas.width = panelW || fallbackW;
                this._fullMapCanvas.height = panelH || fallbackH;
            }
        } else {
            // No panel reference — use window-relative sizing directly
            this._fullMapCanvas.width = fallbackW;
            this._fullMapCanvas.height = fallbackH;
        }
    };

    /**
     * Handle window resize event.
     */
    Donkeycraft.MapPanelUI.prototype.onWindowResize = function () {
        this._resizeCanvases();
        if (this._visible) {
            this._lastChunkCount = -1;
            this._calculateAutoZoom();
        }
    };

    /**
     * Called when the chunk manager switches dimensions.
     * @param {string} dimName - New dimension name.
     */
    Donkeycraft.MapPanelUI.prototype.onDimensionChange = function (dimName) {
        this._dimensionName = dimName || 'Unknown';
        var chunks = this._chunkManager ? this._chunkManager.getAllChunks() : [];
        for (var i = 0; i < chunks.length; i++) {
            delete chunks[i]._mapSurfaceMap;
        }
        if (this._visible) {
            this._lastChunkCount = -1;
            this._calculateAutoZoom();
        }
    };

    /**
     * Destroy and free all resources.
     */
    Donkeycraft.MapPanelUI.prototype.destroy = function () {
        if (this._destroyed) return;
        this._destroyed = true;

        var canvas = this._fullMapCanvas;

        if (canvas) {
            if (this._handlers._onWheel) canvas.removeEventListener('wheel', this._handlers._onWheel);
            if (this._handlers._onMouseDown) canvas.removeEventListener('mousedown', this._handlers._onMouseDown);
            if (this._handlers._onMouseUp) canvas.removeEventListener('mouseup', this._handlers._onMouseUp);
            if (this._handlers._onMouseMove) canvas.removeEventListener('mousemove', this._handlers._onMouseMove);
            if (this._handlers._onMouseLeave) canvas.removeEventListener('mouseleave', this._handlers._onMouseLeave);
        }

        if (this._toggleBtn && this._handlers._onToggleClick) {
            this._toggleBtn.removeEventListener('click', this._handlers._onToggleClick);
        }

        if (this._closeBtn && this._handlers._onCloseClick) {
            this._closeBtn.removeEventListener('click', this._handlers._onCloseClick);
        }

        // Remove Escape key handler
        if (this._handlers._onKeydown) {
            if (Donkeycraft.Input && typeof Donkeycraft.Input.unregisterKeyHandler === 'function') {
                Donkeycraft.Input.unregisterKeyHandler('Escape', this._handlers._onKeydown);
            } else {
                window.removeEventListener('keydown', this._handlers._onKeydown);
            }
        }

        for (var key in this._handlers) {
            if (this._handlers.hasOwnProperty(key)) {
                this._handlers[key] = null;
            }
        }

        if (this._ownsToggleBtn && this._toggleBtn && this._toggleBtn.parentNode) {
            this._toggleBtn.parentNode.removeChild(this._toggleBtn);
        }
        this._toggleBtn = null;

        if (this._ownsPanel && this._mapPanel && this._mapPanel.parentNode) {
            this._mapPanel.parentNode.removeChild(this._mapPanel);
        }
        this._mapPanel = null;
        this._ownsPanel = false;
        this._ownsToggleBtn = false;

        this._fullMapCanvas = null;
        this._fullMapOffscreen = null;
        this._fullMapCtx = null;
        this._chunkManager = null;
    };

})();