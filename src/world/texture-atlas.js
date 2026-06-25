// Donkeycraft — Texture Atlas
// Atlas generation: compiles all block textures into single WebGL texture, UV mapping.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // Atlas constants
    var TEX_SIZE = 16;           // Each texture is 16×16 texels
    var ATLAS_COLS = 16;         // Textures per row in atlas
    var ATLAS_ROWS = 16;         // Textures per column in atlas
    var ATLAS_SIZE = TEX_SIZE * ATLAS_COLS; // 256 pixels

    // ============================================================
    // TextureAtlas — stitches block textures into a single WebGL texture
    // ============================================================

    /**
     * TextureAtlas — compiles all block textures into a single WebGL 2D texture.
     * @param {WebGLRenderingContext} gl - The WebGL 1 rendering context.
     */
    Donkeycraft.TextureAtlas = function(gl) {
        this._gl = gl;
        this._texture = null;
        this._images = {};         // blockId -> HTMLImageElement
        this._uvMap = {};          // blockId -> {u, v, uSize, vSize}
        this._loadedCount = 0;
        this._totalToLoad = 0;
        this._onReadyCallback = null;
    };

    /**
     * Register a texture image for a block.
     * @param {number} blockId - Block ID.
     * @param {HTMLImageElement} image - The image element containing the 16×16 texture.
     */
    Donkeycraft.TextureAtlas.prototype.registerBlockTexture = function(blockId, image) {
        this._images[blockId] = image;
    };

    /**
     * Register a texture by path (loads image asynchronously).
     * @param {number} blockId - Block ID.
     * @param {string} imagePath - Path to the 16×16 texture PNG.
     * @param {Function} [onReady] — Callback when atlas is fully loaded.
     */
    Donkeycraft.TextureAtlas.prototype.registerTexturePath = function(blockId, imagePath, onReady) {
        var img = new Image();
        img.onload = (function(id) {
            return function() {
                this._images[id] = img;
            };
        })(blockId);
        img.onerror = function() {
            Donkeycraft.Logger.warn('TextureAtlas', 'Failed to load texture: ' + imagePath);
        };
        img.src = imagePath;
        this._images[blockId] = img;

        if (onReady) {
            this._onReadyCallback = onReady;
        }
    };

    /**
     * Generate the atlas texture from registered images.
     * Creates a 256×256 WebGL texture and uploads each 16×16 block image
     * to its correct position in the grid.
     * @returns {boolean} True if atlas generation succeeded.
     */
    Donkeycraft.TextureAtlas.prototype.generate = function() {
        var gl = this._gl;
        if (!gl) {
            Donkeycraft.Logger.error('TextureAtlas', 'No WebGL context available');
            return false;
        }

        // Create texture
        this._texture = gl.createTexture();
        if (!this._texture) {
            Donkeycraft.Logger.error('TextureAtlas', 'Failed to create WebGL texture');
            return false;
        }

        gl.bindTexture(gl.TEXTURE_2D, this._texture);

        // Use a 1-pixel blue image as placeholder (in case some textures fail to load)
        var placeholder = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
        for (var i = 0; i < placeholder.length; i += 4) {
            placeholder[i] = 0;     // R
            placeholder[i + 1] = 0; // G
            placeholder[i + 2] = 255; // B
            placeholder[i + 3] = 255; // A
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_SIZE, ATLAS_SIZE, 0,
                      gl.RGBA, gl.UNSIGNED_BYTE, placeholder);

        // Build UV map and upload each block texture
        var tempCanvas = document.createElement('canvas');
        tempCanvas.width = TEX_SIZE;
        tempCanvas.height = TEX_SIZE;
        var tempCtx = tempCanvas.getContext('2d');

        var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
        var blockCount = blocks.length;

        for (var b = 0; b < blockCount; b++) {
            var block = blocks[b];
            var id = block.id;

            // Calculate atlas position: column and row in the grid
            var col = id % ATLAS_COLS;
            var row = Math.floor(id / ATLAS_COLS);

            var u = col * TEX_SIZE;
            var v = row * TEX_SIZE;

            // Store UV coordinates (normalized to 0-1 range)
            this._uvMap[id] = {
                u: u / ATLAS_SIZE,
                v: v / ATLAS_SIZE,
                uSize: TEX_SIZE / ATLAS_SIZE,
                vSize: TEX_SIZE / ATLAS_SIZE,
                // Pixel-space UVs for non-normalized systems
                pixelU: u,
                pixelV: v,
                pixelUSize: TEX_SIZE,
                pixelVSize: TEX_SIZE
            };

            // Upload image to atlas if available
            if (this._images[id]) {
                var img = this._images[id];
                tempCtx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
                tempCtx.drawImage(img, 0, 0, TEX_SIZE, TEX_SIZE);

                // Upload this tile to the atlas at the correct position
                gl.texSubImage2D(gl.TEXTURE_2D, 0,
                    u, v, TEX_SIZE, TEX_SIZE,
                    gl.RGBA, gl.UNSIGNED_BYTE, tempCtx.getImageData(0, 0, TEX_SIZE, TEX_SIZE));
            }
        }

        // Set texture parameters for nearest-neighbor filtering (pixelated Minecraft look)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Generate mipmaps for smoother distant rendering (optional)
        // gl.generateMipmap(gl.TEXTURE_2D);

        Donkeycraft.Logger.info('TextureAtlas', 'Atlas generated: ' + blockCount + ' blocks, size=' + ATLAS_SIZE + '×' + ATLAS_SIZE);
        return true;
    };

    /**
     * Get UV coordinates for a block.
     * @param {number} blockId - Block ID.
     * @returns {{u: number, v: number, uSize: number, vSize: number}|null} UV coords normalized to 0-1, or null if not found.
     */
    Donkeycraft.TextureAtlas.prototype.getUVs = function(blockId) {
        return this._uvMap[blockId] || null;
    };

    /**
     * Get pixel-space UV coordinates for a block.
     * @param {number} blockId - Block ID.
     * @returns {{pixelU: number, pixelV: number, pixelUSize: number, pixelVSize: number}|null}
     */
    Donkeycraft.TextureAtlas.prototype.getPixelUVs = function(blockId) {
        var uv = this._uvMap[blockId];
        if (!uv) return null;
        return {
            pixelU: uv.pixelU,
            pixelV: uv.pixelV,
            pixelUSize: uv.pixelUSize,
            pixelVSize: uv.pixelVSize
        };
    };

    /**
     * Bind the atlas as the active texture unit 0.
     */
    Donkeycraft.TextureAtlas.prototype.bind = function() {
        var gl = this._gl;
        if (!this._texture) return;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._texture);
    };

    /**
     * Get the WebGL texture object.
     * @returns {WebGLTexture}
     */
    Donkeycraft.TextureAtlas.prototype.getTexture = function() {
        return this._texture;
    };

    /**
     * Check if the atlas has been generated.
     * @returns {boolean}
     */
    Donkeycraft.TextureAtlas.prototype.isReady = function() {
        return this._texture !== null;
    };

    /**
     * Get the number of registered textures.
     * @returns {number}
     */
    Donkeycraft.TextureAtlas.prototype.getTextureCount = function() {
        return Object.keys(this._images).length;
    };

    /**
     * Destroy the atlas and free WebGL resources.
     */
    Donkeycraft.TextureAtlas.prototype.destroy = function() {
        var gl = this._gl;
        if (this._texture && gl) {
            gl.deleteTexture(this._texture);
            this._texture = null;
        }
        this._images = {};
        this._uvMap = {};
        Donkeycraft.Logger.info('TextureAtlas', 'Atlas destroyed');
    };

    // ============================================================
    // TextureAtlasBuilder — helper for creating atlas from paths
    // ============================================================

    /**
     * TextureAtlasBuilder — utility for building an atlas from texture path mappings.
     */
    Donkeycraft.TextureAtlasBuilder = (function() {
        /**
         * Build a texture atlas by loading images from a base path pattern.
         * @param {WebGLRenderingContext} gl - WebGL context.
         * @param {string} basePath - Base directory for textures (e.g., "./assets/textures/blocks/").
         * @param {Object.<number, string>} nameMap — blockId -> texture filename (without extension).
         * @returns {Donkeycraft.TextureAtlas}
         */
        function buildFromPaths(gl, basePath, nameMap) {
            var atlas = new Donkeycraft.TextureAtlas(gl);

            var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i];
                var id = block.id;
                if (nameMap[id]) {
                    atlas.registerTexturePath(id, basePath + nameMap[id] + '.png');
                } else {
                    // Use block name as filename
                    atlas.registerTexturePath(id, basePath + block.name + '.png');
                }
            }

            return atlas;
        }

        /**
         * Generate a procedural placeholder atlas for testing (no image files needed).
         * Each block gets a unique color based on its ID.
         * @param {WebGLRenderingContext} gl - WebGL context.
         * @returns {Donkeycraft.TextureAtlas}
         */
        function buildProcedural(gl) {
            var atlas = new Donkeycraft.TextureAtlas(gl);
            var tempCanvas = document.createElement('canvas');
            tempCanvas.width = TEX_SIZE;
            tempCanvas.height = TEX_SIZE;
            var tempCtx = tempCanvas.getContext('2d');

            var blocks = Donkeycraft.BlockRegistry.getAllBlocks();
            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i];
                var id = block.id;

                // Generate a deterministic color from the block ID
                var hue = (id * 137.508) % 360;  // Golden angle distribution
                var sat = 40 + (id % 40);
                var light = 25 + (id % 50);

                tempCtx.fillStyle = 'hsl(' + hue + ', ' + sat + '%, ' + light + '%)';
                tempCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

                // Add a border for visibility
                tempCtx.strokeStyle = 'rgba(0,0,0,0.3)';
                tempCtx.strokeRect(0, 0, TEX_SIZE - 1, TEX_SIZE - 1);

                // Create image from canvas
                var imgData = tempCtx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
                var img = new Image();
                img.src = tempCanvas.toDataURL();
                atlas.registerBlockTexture(id, img);

                // Clear canvas for next iteration
                tempCtx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
            }

            atlas.generate();
            return atlas;
        }

        return {
            buildFromPaths: buildFromPaths,
            buildProcedural: buildProcedural
        };
    })();

})();