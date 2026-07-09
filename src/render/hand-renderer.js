// Donkeycraft — Hand Renderer
// First-person hand/item rendering in bottom-right corner.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * HandRenderer — Renders the player's held item in first-person view.
   */
  Donkeycraft.HandRenderer = function (gl, shaderManager) {
    this._gl = gl;
    this._shaderManager = shaderManager;

    // Item quad geometry and buffers
    this._itemGeometry = null;
    this._itemVertexBuf = null;
    this._itemIndexBuf = null;

    // Current held item ID
    this._heldItemId = 1; // Default: stone
    this._bobAngle = 0;

    // Context lost flag — prevents rendering after context loss
    this._contextLost = false;

    // Listen for context loss/restore on the source canvas
    if (gl && gl.canvas) {
      var self = this;
      gl.canvas.addEventListener('webglcontextlost', function (e) {
        e.preventDefault();
        self._contextLost = true;
      });
      gl.canvas.addEventListener('webglcontextrestored', function () {
        self._contextLost = false;
      });
    }

    // Cached projection matrix (avoids per-frame allocation)
    this._projMatrixCache = null;
    this._lastAspect = null;

    // Reusable vertex buffer for color updates
    this._itemColorBuffer = null;

    this._buildItemGeometry();
    this._initBuffers();
  };

  /**
   * Build the item quad geometry.
   * @private
   */
  Donkeycraft.HandRenderer.prototype._buildItemGeometry = function () {
    var size = 1.0;
    var half = size / 2;

    var vertices = new Float32Array([
      // Position (3) + UV (2) + Color (4) = 9 floats
      -half,
      -half,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      half,
      -half,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      half,
      half,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      -half,
      half,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
    ]);

    var indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    this._itemGeometry = {
      vertices: vertices,
      indices: indices,
      vertexCount: 4,
      indexCount: 6,
    };
  };

  /**
   * Set the currently held item ID.
   * @param {number} itemId - The item/block ID being held.
   */
  Donkeycraft.HandRenderer.prototype.setHeldItem = function (itemId) {
    this._heldItemId = itemId;
  };

  /**
   * Get the current held item ID.
   * @returns {number}
   */
  Donkeycraft.HandRenderer.prototype.getHeldItem = function () {
    return this._heldItemId;
  };

  /**
   * Update the bob animation angle.
   * @param {number} angle - Current bob angle in radians.
   */
  Donkeycraft.HandRenderer.prototype.setBobAngle = function (angle) {
    this._bobAngle = angle;
  };

  /**
   * Get the current bob animation angle.
   * @returns {number} Bob angle in radians.
   */
  Donkeycraft.HandRenderer.prototype.getBobAngle = function () {
    return this._bobAngle;
  };

  /**
   * Get or create a cached orthographic projection matrix.
   * @private
   */
  Donkeycraft.HandRenderer.prototype._getCachedProjMatrix = function (
    canvasWidth,
    canvasHeight
  ) {
    var aspect = canvasWidth / canvasHeight;
    if (this._projMatrixCache && this._lastAspect === aspect) {
      return this._projMatrixCache;
    }
    this._projMatrixCache = Donkeycraft.Matrix4.createOrthographic(
      -aspect,
      aspect,
      -1,
      1,
      -1,
      1
    );
    this._lastAspect = aspect;
    return this._projMatrixCache;
  };

  /**
   * Render the held item in the bottom-right corner of the screen.
   * The hand renderer uses vertex colors (not textures) for item rendering.
   * @param {Camera} camera - The camera instance.
   * @param {number} canvasWidth - Current canvas width in pixels.
   * @param {number} canvasHeight - Current canvas height in pixels.
   */
  Donkeycraft.HandRenderer.prototype.render = function (
    camera,
    canvasWidth,
    canvasHeight
  ) {
    var gl = this._gl;
    if (!gl || !this._shaderManager || !canvasWidth || !canvasHeight) return;

    if (!this._shaderManager.use('gui')) return;

    // Disable depth writes so the hand renders on top of terrain (translucent overlay).
    gl.depthMask(false);

    try {
      // Orthographic projection for screen-space rendering (cached)
      var projMatrix = this._getCachedProjMatrix(canvasWidth, canvasHeight);
      this._shaderManager.setMat4('uProjection', projMatrix);
      this._shaderManager.setMat4(
        'uView',
        Donkeycraft.Matrix4.createIdentity()
      );

      // Bob animation (subtle up/down oscillation)
      var bobY = Math.sin(this._bobAngle) * 0.05;
      var bobX = Math.cos(this._bobAngle * 0.5) * 0.02;

      // Position item in bottom-right corner (screen space)
      var itemX = 0.6 + bobX;
      var itemY = -0.4 + bobY;

      // Scale based on canvas aspect ratio
      var scaleX = 0.3 / Math.max(canvasWidth / canvasHeight, 1);
      var scaleY = 0.3;

      // Slight rotation sway
      var itemAngle = -0.3 + Math.sin(this._bobAngle * 0.3) * 0.05;

      // Build model matrix: scale → rotate → translate
      var translateMatrix = Donkeycraft.Matrix4.createTranslation(
        itemX,
        itemY,
        0
      );
      var scaleMatrix = Donkeycraft.Matrix4.createScale(scaleX, scaleY, 1);
      var rotMatrix = Donkeycraft.Matrix4.createRotation(
        itemAngle,
        new Donkeycraft.Vector3(0, 1, 0)
      );

      var modelMatrix = Donkeycraft.Matrix4.multiply(
        translateMatrix,
        Donkeycraft.Matrix4.multiply(rotMatrix, scaleMatrix)
      );
      this._shaderManager.setMat4('uModel', modelMatrix);

      // Reusable vertex buffer for color updates
      if (
        !this._itemColorBuffer ||
        this._itemColorBuffer.length !== this._itemGeometry.vertices.length
      ) {
        this._itemColorBuffer = new Float32Array(
          this._itemGeometry.vertices.length
        );
      }
      var vertices = this._itemColorBuffer;
      vertices.set(this._itemGeometry.vertices);

      // Get item color and modify vertex data for per-vertex color
      var itemColor = this._getItemColor(this._heldItemId);
      for (var v = 0; v < 4; v++) {
        var ci = v * 9 + 5;
        vertices[ci] = itemColor.r;
        vertices[ci + 1] = itemColor.g;
        vertices[ci + 2] = itemColor.b;
        vertices[ci + 3] = 1.0;
      }

      // Ensure buffers exist — init lazily if context was lost and restored
      if (!this._itemVertexBuf || !this._itemIndexBuf) {
        this._initBuffers();
      }
      if (!this._itemVertexBuf || !this._itemIndexBuf) return;

      // Upload modified vertex data to persistent buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, this._itemVertexBuf);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

      var posLoc = this._shaderManager.getAttribute('aPosition');
      var uvLoc = this._shaderManager.getAttribute('aUV');
      var colorLoc = this._shaderManager.getAttribute('aColor');

      if (posLoc >= 0) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 9 * 4, 0);
      }
      if (uvLoc >= 0) {
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 9 * 4, 12);
      }
      if (colorLoc >= 0) {
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 9 * 4, 20);
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._itemIndexBuf);
      gl.drawElements(
        gl.TRIANGLES,
        this._itemGeometry.indexCount,
        gl.UNSIGNED_SHORT,
        0
      );

      if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
      if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
      if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    } finally {
      // Always restore depth writes, even on error.
      gl.depthMask(true);
    }
  };

  /**
   * Get the color for a given item/block ID.
   * Delegates to Donkeycraft.BlockRegistry.getBlock() when available for accurate colors.
   * @private
   * @param {number} itemId - The item/block ID.
   * @returns {{r: number, g: number, b: number}} RGB color object.
   */
  Donkeycraft.HandRenderer.prototype._getItemColor = function (itemId) {
    // Use BlockRegistry for accurate block colors when available.
    if (
      Donkeycraft.BlockRegistry &&
      typeof Donkeycraft.BlockRegistry.getBlock === 'function'
    ) {
      var blockInfo = Donkeycraft.BlockRegistry.getBlock(itemId);
      if (blockInfo && blockInfo.hardness !== undefined) {
        // Block exists — compute a color from its properties.
        return this._colorFromBlockInfo(blockInfo);
      }
    }
    // Fallback: known item colors + generic gray.
    switch (itemId) {
      case 1:
        return { r: 0.5, g: 0.5, b: 0.5 }; // stone
      case 2:
        return { r: 0.3, g: 0.6, b: 0.2 }; // grass
      case 3:
        return { r: 0.6, g: 0.4, b: 0.2 }; // dirt
      case 4:
        return { r: 0.8, g: 0.78, b: 0.35 }; // sand
      case 5:
        return { r: 0.8, g: 0.75, b: 0.3 }; // gold block
      case 6:
        return { r: 0.4, g: 0.5, b: 0.8 }; // diamond
      case 7:
        return { r: 0.55, g: 0.35, b: 0.2 }; // oak log
      case 8:
        return { r: 0.65, g: 0.45, b: 0.25 }; // oak plank
      case 9:
        return { r: 0.45, g: 0.25, b: 0.15 }; // cobblestone
      case 10:
        return { r: 0.7, g: 0.15, b: 0.15 }; // redstone ore
      default:
        return { r: 0.5, g: 0.5, b: 0.5 }; // fallback gray
    }
  };

  /**
   * Compute an RGB color from a block info object.
   * @private
   * @param {Object} blockInfo - Block info from BlockRegistry.
   * @returns {{r: number, g: number, b: number}}
   */
  Donkeycraft.HandRenderer.prototype._colorFromBlockInfo = function (
    blockInfo
  ) {
    // Use texture name to derive a color hint.
    var tex = blockInfo.texture || blockInfo.textures || '';
    if (typeof tex === 'string') {
      // Map common texture names to approximate colors.
      var t = tex.toLowerCase();
      if (t.indexOf('stone') !== -1) return { r: 0.5, g: 0.5, b: 0.5 };
      if (t.indexOf('grass') !== -1) return { r: 0.3, g: 0.6, b: 0.2 };
      if (t.indexOf('dirt') !== -1) return { r: 0.6, g: 0.4, b: 0.2 };
      if (t.indexOf('sand') !== -1) return { r: 0.8, g: 0.78, b: 0.35 };
      if (t.indexOf('iron') !== -1 || t.indexOf('iron_block') !== -1)
        return { r: 0.75, g: 0.7, b: 0.65 };
      if (t.indexOf('gold') !== -1) return { r: 0.8, g: 0.75, b: 0.2 };
      if (t.indexOf('diamond') !== -1) return { r: 0.4, g: 0.7, b: 0.85 };
      if (t.indexOf('emerald') !== -1) return { r: 0.15, g: 0.7, b: 0.3 };
      if (t.indexOf('lapis') !== -1) return { r: 0.15, g: 0.3, b: 0.7 };
      if (t.indexOf('coal') !== -1) return { r: 0.2, g: 0.2, b: 0.2 };
      if (t.indexOf('wood') !== -1 || t.indexOf('log') !== -1)
        return { r: 0.45, g: 0.3, b: 0.18 };
      if (t.indexOf('plank') !== -1) return { r: 0.62, g: 0.45, b: 0.25 };
      if (t.indexOf('water') !== -1) return { r: 0.2, g: 0.4, b: 0.8 };
      if (t.indexOf('lava') !== -1) return { r: 0.8, g: 0.3, b: 0.05 };
      if (t.indexOf('glass') !== -1) return { r: 0.75, g: 0.85, b: 0.9 };
      if (t.indexOf('brick') !== -1) return { r: 0.55, g: 0.25, b: 0.18 };
      if (t.indexOf('snow') !== -1) return { r: 0.95, g: 0.95, b: 0.97 };
      if (t.indexOf('leaf') !== -1 || t.indexOf('leaves') !== -1)
        return { r: 0.2, g: 0.55, b: 0.15 };
      if (t.indexOf('wool') !== -1) return { r: 0.7, g: 0.7, b: 0.7 };
      if (t.indexOf('bedrock') !== -1) return { r: 0.2, g: 0.2, b: 0.2 };
      if (t.indexOf('obsidian') !== -1) return { r: 0.12, g: 0.1, b: 0.18 };
    }
    // Default: medium gray.
    return { r: 0.5, g: 0.5, b: 0.5 };
  };

  /**
   * Initialize item mesh buffers.
   */
  Donkeycraft.HandRenderer.prototype._initBuffers = function () {
    var gl = this._gl;
    if (!gl || !this._itemGeometry) return;

    // Index buffer (static, never changes)
    this._itemIndexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._itemIndexBuf);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this._itemGeometry.indices,
      gl.STATIC_DRAW
    );

    // Persistent vertex buffer (updated every frame with color data)
    this._itemVertexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._itemVertexBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this._itemGeometry.vertices,
      gl.DYNAMIC_DRAW
    );
  };

  /**
   * Destroy hand renderer resources.
   */
  Donkeycraft.HandRenderer.prototype.destroy = function () {
    var gl = this._gl;
    if (!gl) return;

    if (this._itemIndexBuf) {
      gl.deleteBuffer(this._itemIndexBuf);
      this._itemIndexBuf = null;
    }
    if (this._itemVertexBuf) {
      gl.deleteBuffer(this._itemVertexBuf);
      this._itemVertexBuf = null;
    }

    this._itemGeometry = null;
  };
})();
