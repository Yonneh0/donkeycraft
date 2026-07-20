// Donkeycraft — Texture Asset Manager and Generator Wrapper
// Coordinates procedural texture generation and provides init-sequence wrapper.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  // ============================================================
  // AssetManager — manages procedural texture generation
  // ============================================================

  /**
   * AssetManager — manages procedural texture generation for the game.
   */
  Donkeycraft.AssetManager = (function () {
    var _generatedTextures = null;
    var _atlasCache = null;

    /**
     * Generate all textures for registered blocks.
     * @returns {Object.<number, HTMLImageElement>} Map of blockId -> texture image.
     */
    function generateAllBlockTextures() {
      _generatedTextures = Donkeycraft.TextureGenerator.generateAllTextures();
      return _generatedTextures;
    }

    /**
     * Get a generated texture for a block ID.
     * @param {number} blockId - Block ID.
     * @returns {HTMLImageElement|null}
     */
    function getTexture(blockId) {
      if (!_generatedTextures) return null;
      return _generatedTextures[blockId] || null;
    }

    /**
     * Get all generated textures.
     * @returns {Object.<number, HTMLImageElement>}
     */
    function getAllTextures() {
      return _generatedTextures;
    }

    /**
     * Get the texture name map for atlas building.
     * @returns {Object.<number, string>}
     */
    function getNameMap() {
      return Donkeycraft.TextureGenerator.getNameMap();
    }

    /**
     * Generate a procedural texture atlas canvas.
     * Each texture cell is 80×80 pixels. Dynamically sized to fit all block IDs.
     * @returns {HTMLCanvasElement}
     */
    function generateAtlasCanvas() {
      if (_atlasCache) return _atlasCache;

      var CELL_SIZE = 80;
      var GRID_COLS = 32;
      var atlasCanvas = document.createElement('canvas');
      var blocks = Donkeycraft.BlockRegistry
        ? Donkeycraft.BlockRegistry.getAllBlocks()
        : [];
      var maxId = 0;
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].id > maxId) maxId = blocks[i].id;
      }
      var gridRows = Math.ceil((maxId + 1) / GRID_COLS);
      atlasCanvas.width = CELL_SIZE * GRID_COLS;
      atlasCanvas.height = CELL_SIZE * gridRows;
      var ctx = atlasCanvas.getContext('2d');

      var textures = generateAllBlockTextures();

      for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var id = block.id;
        var col = id % GRID_COLS;
        var row = Math.floor(id / GRID_COLS);
        var tex = textures[id];

        if (tex) {
          ctx.drawImage(
            tex,
            col * CELL_SIZE,
            row * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
          );
        } else {
          ctx.fillStyle = '#FF00FF';
          ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(col * CELL_SIZE + 4, row * CELL_SIZE + 4);
          ctx.lineTo(
            col * CELL_SIZE + CELL_SIZE - 4,
            row * CELL_SIZE + CELL_SIZE - 4
          );
          ctx.moveTo(col * CELL_SIZE + CELL_SIZE - 4, row * CELL_SIZE + 4);
          ctx.lineTo(col * CELL_SIZE + 4, row * CELL_SIZE + CELL_SIZE - 4);
          ctx.stroke();
        }
      }

      _atlasCache = atlasCanvas;
      return atlasCanvas;
    }

    /**
     * Get information about available assets.
     * @returns {Object} Asset statistics.
     */
    function getAssetInfo() {
      var blocks = Donkeycraft.BlockRegistry
        ? Donkeycraft.BlockRegistry.getAllBlocks()
        : [];
      var blockCount = blocks.length;
      var textureCount = _generatedTextures
        ? Object.keys(_generatedTextures).length
        : 0;

      return {
        totalBlocks: blockCount,
        generatedTextures: textureCount,
      };
    }

    /**
     * Reset all cached data.
     */
    function reset() {
      _generatedTextures = null;
      _atlasCache = null;
    }

    return {
      generateAllBlockTextures: generateAllBlockTextures,
      getTexture: getTexture,
      getAllTextures: getAllTextures,
      getNameMap: getNameMap,
      generateAtlasCanvas: generateAtlasCanvas,
      getAssetInfo: getAssetInfo,
      reset: reset,
    };
  })();

  // ============================================================
  // AssetGenerator — Promise-based wrapper for init-sequence
  // ============================================================

  /**
   * AssetGenerator — thin Promise-based wrapper around TextureGenerator + AssetManager.
   * Used by init-sequence.js to generate all procedural textures before the game loop starts.
   * @namespace
   */
  Donkeycraft.AssetGenerator = (function () {
    /**
     * Generate all procedural block textures synchronously and return them as a Promise.
     * @returns {Promise<Object>} Resolves with { blockId: HTMLImageElement } map.
     */
    function generateAllTextures() {
      return new Promise(function (resolve) {
        try {
          if (!Donkeycraft.BlockRegistry || !Donkeycraft.TextureGenerator) {
            Donkeycraft.Logger.warn(
              'AssetGenerator',
              'BlockRegistry or TextureGenerator not available — skipping texture generation'
            );
            resolve({});
            return;
          }

          var textures = Donkeycraft.TextureGenerator.generateAllTextures();

          if (!Donkeycraft.AssetManager) {
            Donkeycraft.Logger.warn(
              'AssetGenerator',
              'AssetManager not available'
            );
            resolve(textures || {});
            return;
          }

          Donkeycraft.AssetManager.generateAllBlockTextures();

          resolve(textures || {});
        } catch (e) {
          Donkeycraft.Logger.error(
            'AssetGenerator',
            'Texture generation failed: ' + e.message
          );
          resolve({});
        }
      });
    }

    /**
     * Generate all procedural block textures asynchronously using chunked processing.
     * Uses requestIdleCallback to keep the main thread responsive during generation.
     * Emits progress updates via onProgress callback if provided.
     * @param {Function} [onProgress] - Optional callback(progress, message) for UI updates.
     * @returns {Promise<Object>} Resolves with { textures, totalBlocks } when ready.
     */
    function generateAllTexturesAsync(onProgress) {
      return new Promise(function (resolve, reject) {
        try {
          if (!Donkeycraft.BlockRegistry || !Donkeycraft.TextureGenerator) {
            Donkeycraft.Logger.warn(
              'AssetGenerator',
              'BlockRegistry or TextureGenerator not available — falling back to sync'
            );
            // Fall back to synchronous generation
            var syncTextures = Donkeycraft.TextureGenerator.generateAllTextures();
            resolve({ textures: syncTextures || {}, totalBlocks: 0 });
            return;
          }

          // Check if async version is available
          if (typeof Donkeycraft.TextureGenerator.generateAllTexturesAsync !== 'function') {
            Donkeycraft.Logger.warn(
              'AssetGenerator',
              'generateAllTexturesAsync not available — falling back to sync'
            );
            var syncTextures2 = Donkeycraft.TextureGenerator.generateAllTextures();
            resolve({ textures: syncTextures2 || {}, totalBlocks: 0 });
            return;
          }

          // Use async chunked generation
          Donkeycraft.TextureGenerator.generateAllTexturesAsync(50)
            .then(function (result) {
              var textures = result.textures;
              var totalBlocks = result.totalBlocks;

              if (Donkeycraft.AssetManager && typeof Donkeycraft.AssetManager.generateAllBlockTextures === 'function') {
                try {
                  Donkeycraft.AssetManager.generateAllBlockTextures();
                } catch (e) {
                  Donkeycraft.Logger.warn(
                    'AssetGenerator',
                    'Failed to wire textures to AssetManager: ' + e.message
                  );
                }
              }

              if (onProgress) {
                onProgress(100, 'Textures generated (' + totalBlocks + ' blocks)');
              }

              resolve({ textures: textures, totalBlocks: totalBlocks });
            })
            .catch(function (err) {
              Donkeycraft.Logger.error(
                'AssetGenerator',
                'Async texture generation failed: ' + err.message
              );
              // Fall back to sync
              try {
                var fallback = Donkeycraft.TextureGenerator.generateAllTextures();
                resolve({ textures: fallback || {}, totalBlocks: 0 });
              } catch (e2) {
                resolve({});
              }
            });
        } catch (e) {
          Donkeycraft.Logger.error(
            'AssetGenerator',
            'Texture generation error: ' + e.message
          );
          resolve({});
        }
      });
    }

    /**
     * Generate a missing-texture checkerboard image for fallback rendering.
     * @returns {HTMLImageElement|null} HTML image element, or null if canvas not available.
     */
    function generateMissingTexture() {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        var ctx = canvas.getContext('2d');

        var size = 8;
        for (var row = 0; row < 2; row++) {
          for (var col = 0; col < 2; col++) {
            ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#ff00ff';
            ctx.fillRect(col * size, row * size, size, size);
          }
        }

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.lineTo(14, 14);
        ctx.moveTo(14, 2);
        ctx.lineTo(2, 14);
        ctx.stroke();

        var img = new Image();
        img.src = canvas.toDataURL('image/png');
        return img;
      } catch (e) {
        if (Donkeycraft.Logger) {
          Donkeycraft.Logger.error(
            'AssetGenerator',
            'Failed to generate missing texture: ' + e.message
          );
        }
        return null;
      }
    }

    /**
     * Get the module object itself as the "instance".
     * @returns {object} The AssetGenerator module.
     */
    function getInstance() {
      return Donkeycraft.AssetGenerator;
    }

    return {
      getInstance: getInstance,
      generateAllTextures: generateAllTextures,
      generateAllTexturesAsync: generateAllTexturesAsync,
      generateMissingTexture: generateMissingTexture,
    };
  })();
})();