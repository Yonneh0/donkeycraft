// Donkeycraft — Sound Generator, Asset Manager, and Asset Generator Wrapper
// Procedural sound generation via Web Audio API, asset coordination, and init-sequence wrapper.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  // ============================================================
  // SoundGenerator — procedural sound generation via Web Audio API
  // ============================================================

  /**
   * SoundGenerator — generates sound effects using Web Audio API oscillators.
   */
  Donkeycraft.SoundGenerator = (function () {
    var _soundCache = {};

    /**
     * Create a short noise buffer for impact sounds.
     * @param {AudioContext} ctx - Audio context.
     * @param {number} duration - Duration in seconds.
     * @returns {AudioBuffer}
     * @private
     */
    function _createNoiseBuffer(ctx, duration) {
      var sampleRate = ctx.sampleRate;
      var length = sampleRate * duration;
      var buffer = ctx.createBuffer(1, length, sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
      return buffer;
    }

    /**
     * Generate a block step sound.
     * @param {AudioContext} ctx - Web Audio API context.
     * @param {string} [material='stone'] - Material type ("stone", "wood", "sand", etc.).
     * @returns {AudioBuffer} Procedural noise buffer for footsteps.
     * @private
     */
    function generateStepSound(ctx, material) {
      var key = 'step:' + (material || 'stone');
      if (_soundCache[key]) return _soundCache[key];
      var buffer = _createNoiseBuffer(ctx, 0.1);
      _soundCache[key] = buffer;
      return buffer;
    }

    /**
     * Generate a block break sound (crunchy noise).
     * @param {AudioContext} ctx - Web Audio API context.
     * @param {string} [material='stone'] - Material type.
     * @returns {AudioBuffer} Procedural noise buffer for breaking blocks.
     * @private
     */
    function generateBreakSound(ctx, material) {
      var key = 'break:' + (material || 'stone');
      if (_soundCache[key]) return _soundCache[key];
      var buffer = _createNoiseBuffer(ctx, 0.2);
      _soundCache[key] = buffer;
      return buffer;
    }

    /**
     * Generate a block place sound (thud).
     * @param {AudioContext} ctx - Web Audio API context.
     * @param {string} [material='stone'] - Material type.
     * @returns {AudioBuffer} Procedural thud sound via OfflineAudioContext.
     * @private
     */
    function generatePlaceSound(ctx, material) {
      var key = 'place:' + (material || 'stone');
      if (_soundCache[key]) return _soundCache[key];
      try {
        var duration = 0.15;
        var offline = new OfflineAudioContext(
          1,
          ctx.sampleRate * duration,
          ctx.sampleRate
        );
        var osc = offline.createOscillator();
        var gain = offline.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, offline.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          100,
          offline.currentTime + 0.1
        );
        gain.gain.setValueAtTime(0.3, offline.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, offline.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(offline.currentTime);
        osc.stop(offline.currentTime + duration);
        var renderedBuffer = offline.startRendering().wait();
        _soundCache[key] = renderedBuffer;
        return renderedBuffer;
      } catch (e) {
        if (Donkeycraft.Logger) {
          Donkeycraft.Logger.error(
            'SoundGenerator',
            'Failed to generate place sound: ' + e.message
          );
        }
        return _createNoiseBuffer(ctx, 0.15);
      }
    }

    /**
     * Generate a block hit sound (clink).
     * @param {AudioContext} ctx - Web Audio API context.
     * @param {string} [material='stone'] - Material type.
     * @returns {AudioBuffer} Procedural clink sound via OfflineAudioContext.
     * @private
     */
    function generateHitSound(ctx, material) {
      var key = 'hit:' + (material || 'stone');
      if (_soundCache[key]) return _soundCache[key];
      try {
        var duration = 0.08;
        var offline = new OfflineAudioContext(
          1,
          ctx.sampleRate * duration,
          ctx.sampleRate
        );
        var osc = offline.createOscillator();
        var gain = offline.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, offline.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          400,
          offline.currentTime + 0.05
        );
        gain.gain.setValueAtTime(0.15, offline.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.01,
          offline.currentTime + duration
        );
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(offline.currentTime);
        osc.stop(offline.currentTime + duration);
        var renderedBuffer = offline.startRendering().wait();
        _soundCache[key] = renderedBuffer;
        return renderedBuffer;
      } catch (e) {
        if (Donkeycraft.Logger)
          Donkeycraft.Logger.error(
            'SoundGenerator',
            'Failed to generate hit sound: ' + e.message
          );
        return _createNoiseBuffer(ctx, 0.08);
      }
    }

    /**
     * Generate a footstep sound for walking.
     * @param {AudioContext} ctx - Web Audio API context.
     * @returns {AudioBuffer} Procedural noise buffer for footsteps.
     * @private
     */
    function generateFootstepSound(ctx) {
      var key = 'footstep';
      if (_soundCache[key]) return _soundCache[key];
      var buffer = _createNoiseBuffer(ctx, 0.06);
      _soundCache[key] = buffer;
      return buffer;
    }

    /**
     * Get or generate a sound by category. All generators return AudioBuffer synchronously.
     * @param {AudioContext} ctx - Web Audio API context.
     * @param {string} category - Sound category ("step", "break", "place", "hit", "footstep").
     * @param {string} [material] - Optional material specifier.
     * @returns {AudioBuffer} Audio buffer for the requested sound.
     */
    function getSound(ctx, category, material) {
      switch (category) {
        case 'step':
          return generateStepSound(ctx, material);
        case 'break':
          return generateBreakSound(ctx, material);
        case 'place':
          return generatePlaceSound(ctx, material);
        case 'hit':
          return generateHitSound(ctx, material);
        case 'footstep':
          return generateFootstepSound(ctx);
        default:
          if (Donkeycraft.Logger) {
            Donkeycraft.Logger.warn(
              'SoundGenerator',
              'Unknown sound category: ' + category
            );
          }
          return _createNoiseBuffer(ctx, 0.1);
      }
    }

    /**
     * Get all available sound categories.
     * @returns {string[]} Array of category name strings.
     */
    function getCategories() {
      return ['step', 'break', 'place', 'hit', 'footstep'];
    }

    /**
     * Clear the internal sound cache. Call during game reset/shutdown.
     */
    function clearCache() {
      _soundCache = {};
    }

    return {
      getSound: getSound,
      getCategories: getCategories,
      clearCache: clearCache,
      generateStepSound: generateStepSound,
      generateBreakSound: generateBreakSound,
      generatePlaceSound: generatePlaceSound,
      generateHitSound: generateHitSound,
      generateFootstepSound: generateFootstepSound,
    };
  })();

  // ============================================================
  // AssetManager — coordinates texture and sound generation
  // ============================================================

  /**
   * AssetManager — manages procedural asset generation for the game.
   */
  Donkeycraft.AssetManager = (function () {
    var _generatedTextures = null;
    var _audioContext = null;
    var _atlasCache = null;

    /**
     * Initialize the asset manager with an AudioContext.
     * @param {AudioContext} ctx - Web Audio API context.
     */
    function init(ctx) {
      _audioContext = ctx;
    }

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
     * Preload sounds for common categories.
     * @param {string[]} categories - Sound categories to preload.
     * @returns {Promise[]} Array of promises.
     */
    function preloadSounds(categories) {
      if (!_audioContext) return [];
      var promises = [];
      for (var i = 0; i < categories.length; i++) {
        promises.push(
          Donkeycraft.SoundGenerator.getSound(_audioContext, categories[i])
        );
      }
      return promises;
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
     * Useful for debugging or saving to disk.
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
      var soundCategories = Donkeycraft.SoundGenerator.getCategories().length;

      return {
        totalBlocks: blockCount,
        generatedTextures: textureCount,
        soundCategories: soundCategories,
        hasAudioContext: !!_audioContext,
      };
    }

    /**
     * Reset all cached data.
     */
    function reset() {
      _generatedTextures = null;
      _atlasCache = null;
      Donkeycraft.SoundGenerator.clearCache();
    }

    return {
      init: init,
      generateAllBlockTextures: generateAllBlockTextures,
      getTexture: getTexture,
      getAllTextures: getAllTextures,
      preloadSounds: preloadSounds,
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
     * Generate all procedural block textures and return them as a Promise.
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
      generateMissingTexture: generateMissingTexture,
    };
  })();
})();
