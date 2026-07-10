// Donkeycraft — Sky
// Sky rendering: day/night gradient, sun disc, moon disc, and star field.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * Sky — Renders the sky dome with day/night gradient, sun disc, moon disc, and star field.
   * All elements are rendered as overlays on top of terrain using depthMask(false).
   * @param {WebGLRenderingContext} gl - The WebGL 1 rendering context.
   * @param {Donkeycraft.ShaderManager} shaderManager - The shader manager instance.
   */
  Donkeycraft.Sky = function (gl, shaderManager) {
    this._gl = gl;
    this._shaderManager = shaderManager;
    this._timeOfDay = 0.5;
    this._starsVisible = true;
    this._sunMoonVisible = true;

    // Sky dome geometry and buffers
    this._skyDomeGeometry = null;
    this._skyDomeVertBuf = null;
    this._skyDomeIndexBuf = null;

    // Sun disc geometry and buffers
    this._sunGeometry = null;
    this._sunVertBuf = null;
    this._sunIndexBuf = null;
    this._sunColorBuffer = null; // Reusable vertex buffer for sun color data

    // Moon disc geometry and buffers
    this._moonGeometry = null;
    this._moonVertBuf = null;
    this._moonIndexBuf = null;
    this._moonColorBuffer = null; // Reusable vertex buffer for moon color data

    // Star field geometry and buffers
    this._starCount = 500;
    this._starGeometry = null;
    this._starVertBuf = null;

    // Skybox state
    this._skyboxReady = false;
    this._skyboxTexture = null;
    this._skyboxGeometry = null;
    this._skyboxVertBuf = null;
    this._skyboxIndexBuf = null;

    // Time-of-day tint keyframes: [timeOfDay, r, g, b, intensity]
    // Intensity controls how strongly the tint is applied (0.9 = subtle night tint, 1.0 = full day tint)
    this._tintKeyframes = [
      { t: 0.0, r: 0.02, g: 0.02, b: 0.08, intensity: 0.9 },
      { t: 0.2, r: 0.03, g: 0.02, b: 0.06, intensity: 0.9 },
      { t: 0.3, r: 0.9, g: 0.5, b: 0.15, intensity: 1.0 },
      { t: 0.45, r: 0.4, g: 0.65, b: 0.95, intensity: 1.0 },
      { t: 0.55, r: 0.3, g: 0.55, b: 0.95, intensity: 1.0 },
      { t: 0.7, r: 0.85, g: 0.45, b: 0.1, intensity: 1.0 },
      { t: 0.8, r: 0.03, g: 0.02, b: 0.06, intensity: 0.9 },
      { t: 1.0, r: 0.02, g: 0.02, b: 0.08, intensity: 0.9 },
    ];

    // View matrix transform for sky dome (zeroed translation)
    this._skyViewTemp = new Float32Array(16);

    // Build geometry and initialize buffers
    this._buildSkyDome();
    this._buildSunDisc();
    this._buildMoonDisc();
    this._buildStarField();
    this._buildSkyboxGeometry();
    this._loadSkyboxTextures();
    this._initBuffers();
  };

  /**
   * Build a large hemisphere geometry for the sky dome.
   * Uses 16 segments × 8 rings for smooth curvature with minimal vertices.
   * @private
   * @returns {void}
   */
  Donkeycraft.Sky.prototype._buildSkyDome = function () {
    var segments = 16;
    var rings = 8;
    var radius = 400;
    var vertices = [];
    var indices = [];

    for (var ring = 0; ring <= rings; ring++) {
      var phi = (ring / rings) * (Math.PI / 2);
      for (var seg = 0; seg <= segments; seg++) {
        var theta = (seg / segments) * Math.PI * 2;
        vertices.push(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        );
      }
    }

    for (var ring = 0; ring < rings; ring++) {
      for (var seg = 0; seg < segments; seg++) {
        var first = ring * (segments + 1) + seg;
        var second = first + segments + 1;
        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    this._skyDomeGeometry = {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 3,
      indexCount: indices.length,
    };
  };

  /**
   * Build a small disc geometry for the sun (13 vertices: 1 center + 12 perimeter).
   * @private
   * @returns {void}
   */
  Donkeycraft.Sky.prototype._buildSunDisc = function () {
    var segments = 12;
    var radius = 8;
    var vertices = [0, radius, 0]; // center

    for (var i = 0; i <= segments; i++) {
      var angle = (i / segments) * Math.PI * 2;
      vertices.push(radius * Math.cos(angle), radius * Math.sin(angle), 0);
    }

    var indices = [];
    for (var i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1);
    }

    this._sunGeometry = {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 3,
      indexCount: indices.length,
    };
  };

  /**
   * Build a small disc geometry for the moon (13 vertices: 1 center + 12 perimeter).
   * @private
   * @returns {void}
   */
  Donkeycraft.Sky.prototype._buildMoonDisc = function () {
    var segments = 12;
    var radius = 5;
    var vertices = [0, radius, 0]; // center

    for (var i = 0; i <= segments; i++) {
      var angle = (i / segments) * Math.PI * 2;
      vertices.push(radius * Math.cos(angle), radius * Math.sin(angle), 0);
    }

    var indices = [];
    for (var i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1);
    }

    this._moonGeometry = {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 3,
      indexCount: indices.length,
    };
  };

  /**
   * Build a star field as small triangle sprite billboards using a seeded PRNG.
   * Each star is a 2-triangle quad (6 vertices) so it renders correctly without
   * needing GLSL changes — no gl_PointSize required since WebGL 1 has no gl.pointSize().
   * Stars are distributed only on the upper hemisphere (sky visible above horizon).
   * Vertex layout: position(3) + color(4) = 7 floats per vertex.
   * @private
   * @returns {void}
   */
  Donkeycraft.Sky.prototype._buildStarField = function () {
    var starData = [];
    var seed = 42;
    var STAR_SIZE = 1.5; // Billboard size in world units

    // Simple seeded PRNG for reproducible star positions
    function seededRandom() {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    for (var i = 0; i < this._starCount; i++) {
      // Random position on upper hemisphere
      var theta = seededRandom() * Math.PI * 2;
      var phi = seededRandom() * (Math.PI / 2); // only upper hemisphere
      var r = 390;

      var sx = r * Math.sin(phi) * Math.cos(theta);
      var sy = r * Math.cos(phi);
      var sz = r * Math.sin(phi) * Math.sin(theta);
      var alpha = 0.8 + seededRandom() * 0.2;

      // Build a 2-triangle billboard quad centered at (sx, sy, sz).
      // Billboard is aligned with world axes — sufficient for distant stars.
      starData.push(
        // Triangle 1: bottom-left
        sx - STAR_SIZE,
        sy - STAR_SIZE,
        sz,
        1.0,
        1.0,
        1.0,
        alpha,
        // Triangle 1: top-right
        sx + STAR_SIZE,
        sy + STAR_SIZE,
        sz,
        1.0,
        1.0,
        1.0,
        alpha,
        // Triangle 1: bottom-right
        sx + STAR_SIZE,
        sy - STAR_SIZE,
        sz,
        1.0,
        1.0,
        1.0,
        alpha,

        // Triangle 2: bottom-left
        sx - STAR_SIZE,
        sy - STAR_SIZE,
        sz,
        1.0,
        1.0,
        1.0,
        alpha,
        // Triangle 2: top-left
        sx - STAR_SIZE,
        sy + STAR_SIZE,
        sz,
        1.0,
        1.0,
        1.0,
        alpha,
        // Triangle 2: top-right
        sx + STAR_SIZE,
        sy + STAR_SIZE,
        sz,
        1.0,
        1.0,
        1.0,
        alpha
      );
    }

    this._starGeometry = {
      data: new Float32Array(starData),
      count: this._starCount * 6, // 6 vertices per star (2 triangles)
      indexCount: this._starCount * 6,
      floatsPerVertex: 7, // position(3) + color(4)
    };
  };

  /**
   * Build a unit cube geometry for the skybox.
   * The cube is centered at origin with radius 1.0.
   * Each face has unique UV coordinates mapped from the 6-face atlas grid defined in skybox.js.
   * Atlas layout (4 columns × 3 rows, each cell = 512×512):
   *   Row 0: [empty, UP(+Y), empty, empty]
   *   Row 1: [LEFT(-X), FORWARD(+Z), RIGHT(+X), BACK(-Z)]
   *   Row 2: [empty, DOWN(-Y), empty, empty]
   * UV cell sizes: width = 0.25, height = 1/3 per cell.
   * Vertex layout: position(3) + uv(2) = 5 floats per vertex.
   * Face order: +X(right), -X(left), +Y(up), -Y(down), +Z(forward), -Z(back).
   * @private
   * @returns {void}
   */
  Donkeycraft.Sky.prototype._buildSkyboxGeometry = function () {
    // Face definitions with normal vectors and UV atlas base coordinates.
    // uBase/vBase = bottom-left corner of each face's cell in the 4×3 grid.
    // Cell dimensions: cellW = 0.25 (1/4 cols), cellH = 1/3 (1/3 rows).
    var faces = [
      { nx: 1, ny: 0, nz: 0, uBase: 0.5, vBase: 1.0 / 3.0 }, // +X right  = row1_col2
      { nx: -1, ny: 0, nz: 0, uBase: 0.0, vBase: 1.0 / 3.0 }, // -X left   = row1_col0
      { nx: 0, ny: 1, nz: 0, uBase: 0.25, vBase: 2.0 / 3.0 }, // +Y up     = row0_col1
      { nx: 0, ny: -1, nz: 0, uBase: 0.25, vBase: 0.0 }, // -Y down   = row2_col1
      { nx: 0, ny: 0, nz: 1, uBase: 0.25, vBase: 1.0 / 3.0 }, // +Z forward= row1_col1
      { nx: 0, ny: 0, nz: -1, uBase: 0.75, vBase: 1.0 / 3.0 }, // -Z back   = row1_col3
    ];

    var vertices = [];
    var indices = [];
    var vertexCount = 0;
    var cellW = 0.25; // Each cell is 1/4 of total width (4 columns)
    var cellH = 1.0 / 3.0; // Each cell is 1/3 of total height (3 rows)

    for (var f = 0; f < faces.length; f++) {
      var face = faces[f];
      var nx = face.nx,
        ny = face.ny,
        nz = face.nz;
      var uBase = face.uBase,
        vBase = face.vBase;

      // 4 corners of the face quad (CCW winding for front-face culling).
      // Corner coordinates (-1,-1) to (1,1) map to UV [0,1] within each cell.
      var corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];

      for (var c = 0; c < 4; c++) {
        var cx = corners[c][0];
        var cy = corners[c][1];

        // Compute 3D position based on face normal.
        // The corner coordinates define the local X/Y axes on each face plane.
        var px, py, pz;
        if (Math.abs(nx) > 0.5) {
          // Right/Left face: normal is ±X, face plane is YZ
          px = nx;
          py = cx;
          pz = cy;
        } else if (Math.abs(ny) > 0.5) {
          // Up/Down face: normal is ±Y, face plane is XZ
          px = cx;
          py = ny;
          pz = cy;
        } else {
          // Forward/Back face: normal is ±Z, face plane is XY
          px = cx;
          py = cy;
          pz = nz;
        }

        // Map corner (-1,-1)→(1,1) to UV within the cell.
        var u = uBase + ((cx + 1) / 2.0) * cellW;
        var v = vBase + ((cy + 1) / 2.0) * cellH;

        vertices.push(px, py, pz, u, v);
      }

      // Two triangles per quad (CCW winding for front-face culling).
      indices.push(vertexCount, vertexCount + 1, vertexCount + 2);
      indices.push(vertexCount, vertexCount + 2, vertexCount + 3);
      vertexCount += 4;
    }

    this._skyboxGeometry = {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertexCount,
      indexCount: indices.length,
      floatsPerVertex: 5, // position(3) + uv(2)
    };
  };

  /**
   * Load skybox textures from global variables defined in skybox.js.
   * Creates a WebGL cube map texture from the 6 base64 PNG images.
   * Validates that all 6 texture variables exist before loading, and logs
   * per-face success/failure for debugging.
   *
   * Texture mapping (matches skybox.js variable names):
   *   GL_TEXTURE_CUBE_MAP_POSITIVE_X (+X, right)  = texture_row1_col2
   *   GL_TEXTURE_CUBE_MAP_NEGATIVE_X (-X, left)   = texture_row1_col0
   *   GL_TEXTURE_CUBE_MAP_POSITIVE_Y (+Y, up)     = texture_row0_col1
   *   GL_TEXTURE_CUBE_MAP_NEGATIVE_Y (-Y, down)   = texture_row2_col1
   *   GL_TEXTURE_CUBE_MAP_POSITIVE_Z (+Z, forward)= texture_row1_col1
   *   GL_TEXTURE_CUBE_MAP_NEGATIVE_Z (-Z, back)   = texture_row1_col3
   *
   * @private
   * @returns {void}
   */
  Donkeycraft.Sky.prototype._loadSkyboxTextures = function () {
    var gl = this._gl;
    if (!gl) return;

    // Map of cube map faces to global variable names from skybox.js.
    var faceMap = [
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, varName: 'texture_row1_col2' }, // right (+X)
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, varName: 'texture_row1_col0' }, // left (-X)
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, varName: 'texture_row0_col1' }, // up (+Y)
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, varName: 'texture_row2_col1' }, // down (-Y)
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, varName: 'texture_row1_col1' }, // forward (+Z)
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, varName: 'texture_row1_col3' }, // back (-Z)
    ];

    // Pre-flight validation: check all 6 texture variables exist before creating buffers.
    // This prevents allocating GPU memory for a skybox that will fail anyway.
    var missingVars = [];
    for (var i = 0; i < faceMap.length; i++) {
      if (
        !window[faceMap[i].varName] ||
        typeof window[faceMap[i].varName] !== 'string'
      ) {
        missingVars.push(faceMap[i].varName);
      }
    }
    if (missingVars.length > 0) {
      Donkeycraft.Logger.warn(
        'Sky',
        'Skybox texture variables missing: ' +
          missingVars.join(', ') +
          ' — using gradient fallback'
      );
      this._skyboxReady = false;
      return;
    }

    // Create the cube map texture.
    this._skyboxTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._skyboxTexture);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    var loadedCount = 0;
    var errorCount = 0;
    var totalFaces = faceMap.length;
    var self = this;

    function checkComplete() {
      loadedCount++;
      if (loadedCount + errorCount === totalFaces) {
        // All faces processed — skybox is only ready if ALL faces succeeded.
        // WebGL cube maps require all 6 faces; a single missing face makes the texture invalid.
        self._skyboxReady = errorCount === 0;
        if (self._skyboxReady) {
          Donkeycraft.Logger.info(
            'Sky',
            'Skybox textures loaded successfully (' +
              totalFaces +
              '/' +
              totalFaces +
              ' faces)'
          );
        } else {
          Donkeycraft.Logger.warn(
            'Sky',
            'Skybox loading incomplete: ' +
              errorCount +
              '/' +
              totalFaces +
              ' faces failed — using gradient fallback'
          );
        }
      }
    }

    for (var i = 0; i < faceMap.length; i++) {
      (function (face, idx) {
        var imgSrc = window[face.varName];
        var image = new Image();
        image.crossOrigin = 'anonymous';

        image.onload = function () {
          // Verify image has valid dimensions before uploading.
          if (image.width === 0 || image.height === 0) {
            Donkeycraft.Logger.warn(
              'Sky',
              'Invalid texture dimensions for: ' + face.varName
            );
            errorCount++;
            checkComplete();
            return;
          }
          gl.bindTexture(gl.TEXTURE_CUBE_MAP, self._skyboxTexture);
          gl.texImage2D(
            face.target,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image
          );
          Donkeycraft.Logger.debug(
            'Sky',
            'Loaded skybox face: ' +
              face.varName +
              ' (' +
              image.width +
              'x' +
              image.height +
              ')'
          );
          checkComplete();
        };

        image.onerror = function () {
          Donkeycraft.Logger.warn(
            'Sky',
            'Failed to load skybox texture: ' + face.varName
          );
          errorCount++;
          checkComplete();
        };

        image.src = imgSrc;
      })(faceMap[i], i);
    }
  };

  /**
   * Get the time-of-day tint color for skybox rendering.
   * Interpolates RGB values and intensity from predefined keyframes using smoothstep easing.
   * Intensity is interpolated between keyframe values to ensure smooth transitions at boundaries.
   *
   * Tint keyframe schedule:
   * - t=0.00 (midnight):    dark blue-black (0.02, 0.02, 0.08) — intensity 0.9
   * - t=0.20 (pre-dawn):    very dark (0.03, 0.02, 0.06) — intensity 0.9
   * - t=0.30 (sunrise):     orange-pink (0.9, 0.5, 0.15) — intensity 1.0
   * - t=0.45 (morning):     blue sky (0.4, 0.65, 0.95) — intensity 1.0
   * - t=0.55 (midday):      deep blue sky (0.3, 0.55, 0.95) — intensity 1.0
   * - t=0.70 (sunset):      orange (0.85, 0.45, 0.1) — intensity 1.0
   * - t=0.80 (dusk):        dark (0.03, 0.02, 0.06) — intensity 0.9
   * - t=1.00 (midnight):    dark blue-black again — intensity 0.9
   *
   * @private
   * @param {number} timeOfDay - Time value in [0, 1). 0.25=sunrise, 0.5=noon, 0.75=sunset.
   * @returns {{r: number, g: number, b: number, intensity: number}} Tint color and intensity.
   */
  Donkeycraft.Sky.prototype._getTintColor = function (timeOfDay) {
    var kf = this._tintKeyframes;
    var t = timeOfDay;

    // Find surrounding keyframes for interpolation.
    var lower = kf[0];
    var upper = kf[kf.length - 1];

    for (var i = 0; i < kf.length - 1; i++) {
      if (t >= kf[i].t && t <= kf[i + 1].t) {
        lower = kf[i];
        upper = kf[i + 1];
        break;
      }
    }

    // Compute local phase within the current keyframe pair.
    var range = upper.t - lower.t;
    var phase = range > 0 ? (t - lower.t) / range : 0;

    // Apply smoothstep easing for smooth color transitions.
    phase = phase * phase * (3 - 2 * phase);

    // Interpolate intensity between keyframe values (not global linear ramp).
    // This ensures intensity matches the color transition at each keyframe boundary.
    var intensity = Donkeycraft.lerp(lower.intensity, upper.intensity, phase);

    return {
      r: lower.r + (upper.r - lower.r) * phase,
      g: lower.g + (upper.g - lower.g) * phase,
      b: lower.b + (upper.b - lower.b) * phase,
      intensity: intensity,
    };
  };

  /**
   * Render the skybox cube map.
   * Draws a large unit cube (400×400×400 world units) centered at the origin,
   * with the camera positioned inside it. The cube map texture is sampled
   * using the normalized direction vector from the camera to each fragment.
   *
   * Time-of-day tinting is applied per-frame by multiplying the texture color
   * with the interpolated tint color from `_getTintColor()`.
   *
   * CRITICAL: The view matrix translation is zeroed out (components 12-14) to keep
   * the skybox fixed at world center regardless of camera position. Without this,
   * the skybox would appear to move with the camera.
   *
   * @private
   * @param {Donkeycraft.Camera} camera - The camera instance.
   * @param {number} timeOfDay - Time value in [0, 1). 0.25=sunrise, 0.5=noon, 0.75=sunset.
   * @returns {boolean} True if rendered successfully.
   */
  Donkeycraft.Sky.prototype._renderSkybox = function (camera, timeOfDay) {
    var gl = this._gl;
    if (!gl) return false;

    // Guard: skip rendering if the WebGL context was lost.
    if (gl.isContextLost()) return false;

    // Validate required resources exist.
    if (!this._skyboxTexture || !this._skyboxVertBuf || !this._skyboxIndexBuf) {
      return false;
    }

    // Validate skybox geometry data.
    if (!this._skyboxGeometry || !this._skyboxGeometry.indexCount) {
      Donkeycraft.Logger.warn(
        'Sky',
        '_renderSkybox: skybox geometry invalid — skipping'
      );
      return false;
    }

    if (!this._shaderManager.use('sky')) {
      return false;
    }

    // Scale the skybox to a large radius (400 world units) so it fills the visible scene.
    // Translation is zero since the camera sits inside the cube at the origin.
    var modelMatrix = Donkeycraft.Matrix4.createScale(400, 400, 400);

    // Set projection matrix from camera.
    var camData = camera.getMatrices();
    this._shaderManager.setMat4('uProjection', camData.projection);

    // Zero out view matrix translation to keep skybox fixed at world center.
    // The view matrix normally encodes camera position, but the skybox must not
    // move with the camera — it should appear as a distant background.
    for (var i = 0; i < 16; i++) {
      this._skyViewTemp[i] = camData.view.getData()[i];
    }
    this._skyViewTemp[12] = 0; // Zero X translation
    this._skyViewTemp[13] = 0; // Zero Y translation
    this._skyViewTemp[14] = 0; // Zero Z translation
    var skyboxViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);
    this._shaderManager.setMat4('uView', skyboxViewMatrix);

    // Set model matrix (scale only, no translation).
    this._shaderManager.setMat4('uModel', modelMatrix);

    // Bind the cube map texture to texture unit 0.
    this._shaderManager.setInt('uUseSkybox', 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._skyboxTexture);
    this._shaderManager.setInt('uSkyboxTexture', 0);

    // Apply time-of-day tint color.
    var tint = this._getTintColor(timeOfDay);
    if (
      typeof tint.r !== 'number' ||
      typeof tint.g !== 'number' ||
      typeof tint.b !== 'number'
    ) {
      Donkeycraft.Logger.warn(
        'Sky',
        '_renderSkybox: invalid tint color — using default'
      );
      tint = { r: 0.5, g: 0.65, b: 0.95, intensity: 1.0 };
    }
    this._shaderManager.setVec3('uTintColor', tint.r, tint.g, tint.b);
    this._shaderManager.setFloat(
      'uTintIntensity',
      typeof tint.intensity === 'number' ? tint.intensity : 1.0
    );

    // Disable gradient uniforms — not used when rendering skybox.
    this._shaderManager.setInt('uHasColorOverlay', 0);

    // Bind vertex attributes: position(3) + UV(2) = 5 floats per vertex.
    gl.bindBuffer(gl.ARRAY_BUFFER, this._skyboxVertBuf);
    var posLoc = this._shaderManager.getAttribute('aPosition');
    var uvLoc = this._shaderManager.getAttribute('aUV');

    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 5 * 4, 0);
    }
    if (uvLoc >= 0) {
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 5 * 4, 12);
    }

    // Draw the skybox cube (36 indices = 6 faces × 2 triangles × 3 vertices).
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyboxIndexBuf);
    try {
      gl.drawElements(
        gl.TRIANGLES,
        this._skyboxGeometry.indexCount,
        gl.UNSIGNED_SHORT,
        0
      );
    } catch (e) {
      Donkeycraft.Logger.error(
        'Sky',
        '_renderSkybox: drawElements failed — ' +
          (e && e.message ? e.message : String(e))
      );
      // Reset skybox uniform even on error.
      this._shaderManager.setInt('uUseSkybox', 0);
      return false;
    }

    // Disable attribute arrays to prevent state leakage.
    if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
    if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);

    // Reset skybox uniform for subsequent rendering passes (sun/moon/stars).
    this._shaderManager.setInt('uUseSkybox', 0);
    return true;
  };

  /**
   * Set the time of day (0-1). Normalizes to [0, 1) range.
   * @param {number} t - Time value (any number, normalized internally).
   */
  Donkeycraft.Sky.prototype.setTimeOfDay = function (t) {
    this._timeOfDay = t - Math.floor(t);
    if (this._timeOfDay < 0) this._timeOfDay += 1;
  };

  /**
   * Get the current time of day.
   * @returns {number} Time value in [0, 1).
   */
  Donkeycraft.Sky.prototype.getTimeOfDay = function () {
    return this._timeOfDay;
  };

  /**
   * Render the sun disc at the given position using solid color rendering.
   * Uses a persistent vertex buffer with per-vertex color data (position(3) + unused(2) + color(4)).
   * Depth write is disabled so the sun renders on top of terrain without corrupting depth.
   * @private
   * @param {Donkeycraft.Camera} camera - The camera instance.
   * @param {Donkeycraft.Vector3} sunDir - Normalized sun direction vector.
   * @param {number} sunIntensity - Sun intensity (0-1) for alpha and color brightness.
   * @returns {boolean} True if rendered successfully.
   */
  Donkeycraft.Sky.prototype._renderSunDisc = function (
    camera,
    sunDir,
    sunIntensity
  ) {
    var gl = this._gl;
    if (!gl || !this._sunVertBuf || !this._sunIndexBuf) return false;

    // Build a model matrix: translate to sun position + scale.
    var sunPos = new Donkeycraft.Vector3(
      sunDir.x * 350,
      Math.max(sunDir.y * 350, 10),
      sunDir.z * 350
    );

    var translateMatrix = Donkeycraft.Matrix4.createTranslation(
      sunPos.x,
      sunPos.y,
      sunPos.z
    );
    var scaleMatrix = Donkeycraft.Matrix4.createScale(16, 16, 1);
    var modelMatrix = Donkeycraft.Matrix4.multiply(
      translateMatrix,
      scaleMatrix
    );

    // Use the sky shader — it supports uModel for sun/moon positioning.
    if (!this._shaderManager.use('sky')) {
      gl.depthMask(true);
      return false;
    }

    // Sun color: bright yellow-white, intensity-based alpha
    var r = 1.0,
      g = 0.95,
      b = 0.7,
      a = sunIntensity;

    // Build vertex data with per-vertex color (position(3) + uv(2) unused + color(4))
    var verts = this._sunGeometry.vertices;
    var vertCount = this._sunGeometry.vertexCount;
    var totalFloats = vertCount * 9;

    if (!this._sunColorBuffer || this._sunColorBuffer.length < totalFloats) {
      this._sunColorBuffer = new Float32Array(totalFloats);
    }
    var buf = this._sunColorBuffer;

    for (var i = 0; i < vertCount; i++) {
      var base = i * 9;
      buf[base] = verts[base]; // position x
      buf[base + 1] = verts[base + 1]; // position y
      buf[base + 2] = verts[base + 2]; // position z
      buf[base + 3] = 0; // uv u (unused)
      buf[base + 4] = 0; // uv v (unused)
      buf[base + 5] = r; // color r
      buf[base + 6] = g; // color g
      buf[base + 7] = b; // color b
      buf[base + 8] = a; // color a
    }

    try {
      // Disable depth write so sun renders on top of terrain without corrupting depth buffer.
      gl.depthMask(false);

      // Set camera matrices — sky shader needs uProjection/uView for proper positioning.
      var camData = camera.getMatrices();
      this._shaderManager.setMat4('uProjection', camData.projection);

      // Zero out view translation to keep sun at world position (no camera-relative offset).
      for (var _si = 0; _si < 16; _si++)
        this._skyViewTemp[_si] = camData.view.getData()[_si];
      this._skyViewTemp[12] = 0;
      this._skyViewTemp[13] = 0;
      this._skyViewTemp[14] = 0;
      var sunViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);
      this._shaderManager.setMat4('uView', sunViewMatrix);

      // Set model matrix for sun position + scale.
      this._shaderManager.setMat4('uModel', modelMatrix);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._sunVertBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        buf.subarray(0, totalFloats),
        gl.DYNAMIC_DRAW
      );

      var posLoc = this._shaderManager.getAttribute('aPosition');
      var colorLoc = this._shaderManager.getAttribute('aColor');

      if (posLoc >= 0) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 9 * 4, 0);
      }
      // UV is unused for sun — skip enabling it
      if (colorLoc >= 0) {
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 9 * 4, 20);
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._sunIndexBuf);
      gl.drawElements(
        gl.TRIANGLES,
        this._sunGeometry.indexCount,
        gl.UNSIGNED_SHORT,
        0
      );

      if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
      if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    } finally {
      // Always restore depth write state.
      gl.depthMask(true);
    }
  };

  /**
   * Render the moon disc at the given position using solid color rendering.
   * Moon is positioned opposite the sun direction.
   * Uses a persistent vertex buffer with per-vertex color data (position(3) + unused(2) + color(4)).
   * Depth write is disabled so the moon renders on top of terrain without corrupting depth.
   * @private
   * @param {Donkeycraft.Camera} camera - The camera instance.
   * @param {Donkeycraft.Vector3} moonDir - Normalized moon direction vector.
   * @returns {boolean} True if rendered successfully.
   */
  Donkeycraft.Sky.prototype._renderMoonDisc = function (camera, moonDir) {
    var gl = this._gl;
    if (!gl || !this._moonVertBuf || !this._moonIndexBuf) return false;

    // Moon is opposite the sun
    var moonPos = new Donkeycraft.Vector3(
      moonDir.x * 350,
      Math.max(moonDir.y * 350, 10),
      moonDir.z * 350
    );

    var translateMatrix = Donkeycraft.Matrix4.createTranslation(
      moonPos.x,
      moonPos.y,
      moonPos.z
    );
    var scaleMatrix = Donkeycraft.Matrix4.createScale(10, 10, 1);
    var modelMatrix = Donkeycraft.Matrix4.multiply(
      translateMatrix,
      scaleMatrix
    );

    // Use the sky shader — it now supports uModel and aColor for sun/moon.
    if (!this._shaderManager.use('sky')) {
      gl.depthMask(true);
      return false;
    }

    // Moon color: pale silver
    var r = 0.8,
      g = 0.82,
      b = 0.9,
      a = 1.0;

    // Build vertex data with per-vertex color (position(3) + uv(2) unused + color(4))
    var verts = this._moonGeometry.vertices;
    var vertCount = this._moonGeometry.vertexCount;
    var totalFloats = vertCount * 9;

    if (!this._moonColorBuffer || this._moonColorBuffer.length < totalFloats) {
      this._moonColorBuffer = new Float32Array(totalFloats);
    }
    var buf = this._moonColorBuffer;

    for (var i = 0; i < vertCount; i++) {
      var base = i * 9;
      buf[base] = verts[base];
      buf[base + 1] = verts[base + 1];
      buf[base + 2] = verts[base + 2];
      buf[base + 3] = 0;
      buf[base + 4] = 0;
      buf[base + 5] = r;
      buf[base + 6] = g;
      buf[base + 7] = b;
      buf[base + 8] = a;
    }

    try {
      // Disable depth write so moon renders on top of terrain without corrupting depth buffer.
      gl.depthMask(false);

      // Set camera matrices — sky shader needs uProjection/uView for proper positioning.
      var camData2 = camera.getMatrices();
      this._shaderManager.setMat4('uProjection', camData2.projection);

      // Zero out view translation to keep moon at world position (no camera-relative offset).
      for (var _mi = 0; _mi < 16; _mi++)
        this._skyViewTemp[_mi] = camData2.view.getData()[_mi];
      this._skyViewTemp[12] = 0;
      this._skyViewTemp[13] = 0;
      this._skyViewTemp[14] = 0;
      var moonViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);
      this._shaderManager.setMat4('uView', moonViewMatrix);

      // Set model matrix for moon position + scale.
      this._shaderManager.setMat4('uModel', modelMatrix);

      // Enable color overlay so fragment shader uses per-vertex color instead of gradient.
      this._shaderManager.setInt('uHasColorOverlay', 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._moonVertBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        buf.subarray(0, totalFloats),
        gl.DYNAMIC_DRAW
      );

      var posLoc = this._shaderManager.getAttribute('aPosition');
      var colorLoc = this._shaderManager.getAttribute('aColor');

      if (posLoc >= 0) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 9 * 4, 0);
      }
      if (colorLoc >= 0) {
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 9 * 4, 20);
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._moonIndexBuf);
      gl.drawElements(
        gl.TRIANGLES,
        this._moonGeometry.indexCount,
        gl.UNSIGNED_SHORT,
        0
      );

      if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
      if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    } finally {
      // Always restore depth write state.
      gl.depthMask(true);
    }
  };

  /**
   * Render the star field as triangle sprite billboards using the sky shader with per-vertex color.
   * Each star is a small quad (2 triangles, 6 vertices) rendered with TRIANGLES mode.
   * This avoids the need for gl.pointSize() which doesn't exist in WebGL 1 — point size
   * must be set via the vertex shader's gl_PointSize built-in, which would require GLSL changes.
   * Depth write must be disabled so stars render as translucent overlays on terrain.
   *
   * @private
   * @returns {boolean} True if rendered successfully.
   */
  Donkeycraft.Sky.prototype._renderStars = function () {
    var gl = this._gl;
    if (!gl || !this._starVertBuf || !this._starGeometry) return false;

    gl.bindBuffer(gl.ARRAY_BUFFER, this._starVertBuf);

    var posLoc = this._shaderManager.getAttribute('aPosition');
    var colorLoc = this._shaderManager.getAttribute('aColor');

    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(
        posLoc,
        3,
        gl.FLOAT,
        false,
        this._starGeometry.floatsPerVertex * 4,
        0
      );
    }
    if (colorLoc >= 0) {
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(
        colorLoc,
        4,
        gl.FLOAT,
        false,
        this._starGeometry.floatsPerVertex * 4,
        12
      );
    }

    try {
      // Render as triangles — each star is a 6-vertex billboard quad.
      gl.drawArrays(gl.TRIANGLES, 0, this._starGeometry.count);
    } finally {
      // Always disable attribute arrays to prevent state leakage.
      if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
      if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    }

    return true;
  };

  /**
   * Render the sky dome, sun, moon, and stars using the sky shader program.
   *
   * Rendering order:
   * 1. Sky dome (depth write disabled, face culling disabled)
   * 2. Sun disc (translucent overlay, depth write disabled)
   * 3. Moon disc (translucent overlay, depth write disabled)
   * 4. Stars (translucent triangle sprite billboards, depth write disabled)
   *
   * CRITICAL: All rendering uses depthMask(false). A try/finally block ensures
   * depthMask(true) is always restored before returning, preventing terrain/particles/GUI
   * from silently depth-failing on subsequent frames.
   *
   * Face culling is disabled because the camera is inside the sky dome — outward-facing
   * triangles would otherwise be culled as back-faces. The original CULL_FACE state is
   * saved and restored to avoid affecting subsequent renderers.
   *
   * @param {Donkeycraft.Camera} camera - The camera instance.
   * @param {Donkeycraft.Lighting} lighting - The lighting system instance.
   * @returns {boolean} True if sky was rendered successfully.
   */
  Donkeycraft.Sky.prototype.render = function (camera, lighting) {
    var gl = this._gl;
    if (!gl || !this._shaderManager) return false;

    // Guard: skip rendering if the WebGL context was lost.
    if (gl.isContextLost()) return false;

    // Save current GL state for restoration after sky rendering.
    var prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
    var prevCullFace = false;
    try {
      prevCullFace = gl.isEnabled(gl.CULL_FACE);
    } catch (e) {
      /* context may be lost */
    }

    // ---- Enable depth write protection and disable face culling ----
    // CRITICAL: Disable face culling — camera is inside the sky dome.
    // Outward-facing normals + inside camera = all triangles appear as back-faces.
    gl.disable(gl.CULL_FACE);

    try {
      // Get sun intensity at the top so it's available for all rendering passes
      var sunIntensity = lighting.getSunIntensity();

      // ---- Skybox (rendered first, depth write disabled) ----
      gl.depthMask(false);

      var skyboxRendered = false;
      if (this._skyboxReady) {
        skyboxRendered = this._renderSkybox(camera, this._timeOfDay);
      }

      // ---- Sky dome gradient fallback (only if skybox not ready) ----
      if (!skyboxRendered) {
        if (!this._shaderManager.use('sky')) {
          Donkeycraft.Logger.warn(
            'Sky',
            'render: sky shader not available — skipping sky render'
          );
          return;
        }

        // CRITICAL: Reset color overlay flag at the start to prevent state leakage.
        // If sun/moon rendering is skipped (e.g., sunIntensity < 0.1), the flag may
        // retain a previous value from an earlier frame, causing stars to render
        // with incorrect color overlay behavior.
        this._shaderManager.setInt('uHasColorOverlay', 0);

        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);

        // Zero out view translation to keep sky fixed at world center.
        var viewData = matrices.view.getData();
        for (var _gv = 0; _gv < 16; _gv++)
          this._skyViewTemp[_gv] = viewData[_gv];
        this._skyViewTemp[12] = 0;
        this._skyViewTemp[13] = 0;
        this._skyViewTemp[14] = 0;
        var skyViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);

        this._shaderManager.setMat4('uView', skyViewMatrix);

        // Set sky colors from lighting
        var skyColor = lighting.getSkyColor();

        this._shaderManager.setVec3(
          'uTopColor',
          skyColor.r * (0.5 + 0.5 * sunIntensity),
          skyColor.g * (0.5 + 0.5 * sunIntensity),
          skyColor.b * (0.5 + 0.5 * sunIntensity)
        );

        this._shaderManager.setVec3(
          'uBottomColor',
          skyColor.r * 0.8,
          skyColor.g * 0.8,
          skyColor.b * 0.8
        );

        this._shaderManager.setFloat('uHorizon', 0.1);

        // Draw sky dome — only aPosition is needed since uHasColorOverlay=0 uses gradient.
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyDomeVertBuf);
        var posLoc = this._shaderManager.getAttribute('aPosition');

        if (posLoc >= 0) {
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 3 * 4, 0);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeIndexBuf);
        gl.drawElements(
          gl.TRIANGLES,
          this._skyDomeGeometry.indexCount,
          gl.UNSIGNED_SHORT,
          0
        );

        if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
      }

      // ---- Sun disc (visible during day) — translucent overlay ----
      if (this._sunMoonVisible && sunIntensity > 0.1) {
        var sunDir = lighting.getSunDirection();
        this._renderSunDisc(camera, sunDir, sunIntensity);
      }

      // ---- Moon disc (visible at night or twilight — translucent overlay) ----
      if (this._sunMoonVisible && sunIntensity < 0.8) {
        var sunD = lighting.getSunDirection();
        var moonDir = new Donkeycraft.Vector3(
          -sunD.x,
          -sunD.y,
          -sunD.z
        ).normalized();
        this._renderMoonDisc(camera, moonDir);
      }

      // Reset color overlay and skybox flags after all sky rendering is done
      this._shaderManager.setInt('uHasColorOverlay', 0);
      this._shaderManager.setInt('uUseSkybox', 0);

      // ---- Stars (visible at night, translucent point sprites) ----
      if (this._starsVisible && sunIntensity < 0.3 && this._starVertBuf) {
        gl.depthMask(false);

        // Re-ensure sky shader is active for stars.
        if (!this._shaderManager.use('sky')) {
          Donkeycraft.Logger.warn(
            'Sky',
            'render: sky shader unavailable during star pass — skipping'
          );
        } else {
          var starMatrices = camera.getMatrices();
          this._shaderManager.setMat4('uProjection', starMatrices.projection);

          // Zero out view translation for stars (keep sky fixed at world center).
          for (var _si = 0; _si < 16; _si++)
            this._skyViewTemp[_si] = starMatrices.view.getData()[_si];
          this._skyViewTemp[12] = 0;
          this._skyViewTemp[13] = 0;
          this._skyViewTemp[14] = 0;
          var starViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);
          this._shaderManager.setMat4('uView', starViewMatrix);
          this._shaderManager.setMat4(
            'uModel',
            Donkeycraft.Matrix4.createIdentity()
          );

          // Enable color overlay so stars render with their per-vertex white/bright colors.
          this._shaderManager.setInt('uHasColorOverlay', 1);

          this._renderStars();
        }
      }
    } finally {
      // CRITICAL: Always restore depth writes before returning.
      // If we exit with depthMask(false), terrain/particles/hand/GUI
      // cannot write to the depth buffer and will silently depth-fail.
      gl.depthMask(prevDepthMask);

      // Restore face culling state.
      if (prevCullFace) {
        gl.enable(gl.CULL_FACE);
      } else {
        gl.disable(gl.CULL_FACE);
      }
    }
  };

  /**
   * Create persistent vertex and index buffers for all sky elements.
   * Called once during construction after geometry is built.
   */
  Donkeycraft.Sky.prototype._initBuffers = function () {
    var gl = this._gl;
    if (!gl) return;

    // === Skybox buffers ===
    if (this._skyboxGeometry) {
      this._skyboxVertBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._skyboxVertBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this._skyboxGeometry.vertices,
        gl.STATIC_DRAW
      );

      this._skyboxIndexBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyboxIndexBuf);
      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        this._skyboxGeometry.indices,
        gl.STATIC_DRAW
      );
    }

    // Sky dome
    if (this._skyDomeGeometry) {
      this._skyDomeVertBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._skyDomeVertBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this._skyDomeGeometry.vertices,
        gl.STATIC_DRAW
      );

      this._skyDomeIndexBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyDomeIndexBuf);
      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        this._skyDomeGeometry.indices,
        gl.STATIC_DRAW
      );
    }

    // Sun disc
    if (this._sunGeometry) {
      this._sunVertBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._sunVertBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this._sunGeometry.vertices,
        gl.STATIC_DRAW
      );

      this._sunIndexBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._sunIndexBuf);
      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        this._sunGeometry.indices,
        gl.STATIC_DRAW
      );
    }

    // Moon disc
    if (this._moonGeometry) {
      this._moonVertBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._moonVertBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this._moonGeometry.vertices,
        gl.STATIC_DRAW
      );

      this._moonIndexBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._moonIndexBuf);
      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        this._moonGeometry.indices,
        gl.STATIC_DRAW
      );
    }

    // Star field (points) — use the new interleaved format: position(3) + color(4) = 7 floats/vertex.
    if (this._starGeometry && this._starGeometry.data) {
      this._starVertBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._starVertBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this._starGeometry.data, gl.STATIC_DRAW);
    }
  };

  /**
   * Destroy sky resources and free GPU memory.
   * Deletes all WebGL buffers and nulls internal geometry references.
   */
  Donkeycraft.Sky.prototype.destroy = function () {
    var gl = this._gl;
    if (!gl) return;

    // === Skybox resources ===
    if (this._skyboxTexture) {
      gl.deleteTexture(this._skyboxTexture);
      this._skyboxTexture = null;
    }
    if (this._skyboxVertBuf) {
      gl.deleteBuffer(this._skyboxVertBuf);
      this._skyboxVertBuf = null;
    }
    if (this._skyboxIndexBuf) {
      gl.deleteBuffer(this._skyboxIndexBuf);
      this._skyboxIndexBuf = null;
    }

    if (this._skyDomeVertBuf) {
      gl.deleteBuffer(this._skyDomeVertBuf);
      this._skyDomeVertBuf = null;
    }
    if (this._skyDomeIndexBuf) {
      gl.deleteBuffer(this._skyDomeIndexBuf);
      this._skyDomeIndexBuf = null;
    }
    if (this._sunVertBuf) {
      gl.deleteBuffer(this._sunVertBuf);
      this._sunVertBuf = null;
    }
    if (this._sunIndexBuf) {
      gl.deleteBuffer(this._sunIndexBuf);
      this._sunIndexBuf = null;
    }
    if (this._moonVertBuf) {
      gl.deleteBuffer(this._moonVertBuf);
      this._moonVertBuf = null;
    }
    if (this._moonIndexBuf) {
      gl.deleteBuffer(this._moonIndexBuf);
      this._moonIndexBuf = null;
    }
    if (this._starVertBuf) {
      gl.deleteBuffer(this._starVertBuf);
      this._starVertBuf = null;
    }

    this._skyDomeGeometry = null;
    this._sunGeometry = null;
    this._moonGeometry = null;
    this._starGeometry = null;
    this._skyViewTemp = null;
    this._sunColorBuffer = null;
    this._moonColorBuffer = null;
  };
})();
