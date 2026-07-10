# Skybox Implementation Plan

## Overview
Replace the current gradient-only sky dome in `src/render/sky.js` with a textured cube map skybox using 6 pre-loaded 512×512 PNG textures from `src/entities/skybox.js`. The skybox will render as a large unit cube surrounding the camera, with time-of-day tinting for day/night cycles.

## File Changes Summary
1. **index.html** — Add skybox.js script tag + extend sky fragment shader
2. **src/render/sky.js** — Complete rewrite of skybox loading and rendering logic

---

## Step 1: Add skybox.js Script Tag to index.html

**File:** `index.html`
**Location:** Line ~988, immediately before the existing `<script src="src/render/sky.js"></script>` line

**Action:** Insert this line before the sky.js script tag:
```html
    <!-- Skybox Textures (must load BEFORE sky.js) -->
    <script src="src/entities/skybox.js"></script>
```

**Resulting block should look like:**
```html
    <script src="src/render/fog.js"></script>
    <!-- Skybox Textures (must load BEFORE sky.js) -->
    <script src="src/entities/skybox.js"></script>
    <script src="src/render/sky.js"></script>
    <script src="src/render/lighting.js"></script>
```

**Why:** `skybox.js` defines global variables (`texture_row0_col1`, `texture_row1_col0`, etc.) that `sky.js` will read during construction. It MUST load first.

---

## Step 2: Extend Sky Fragment Shader with Cube Map Uniforms

**File:** `index.html`
**Location:** Lines ~699-726, inside the `SKY_FRAGMENT_SHADER` template literal

**Current shader code:**
```glsl
precision mediump float;

varying vec2 vUV;
varying vec3 vWorldPos;
varying vec4 vColor;

uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uHorizon;
uniform int uHasColorOverlay;

void main() {
    // Default: sky dome gradient (no color overlay).
    float t = smoothstep(uHorizon - 0.1, uHorizon + 0.1, normalize(vWorldPos).y);
    vec3 finalColor = mix(uBottomColor, uTopColor, t);
    float alpha = 1.0;

    // When a color overlay is active (sun/moon/stars), use the per-vertex color instead.
    if (uHasColorOverlay == 1) {
        finalColor = vColor.rgb;
        alpha = vColor.a;
    }

    gl_FragColor = vec4(finalColor, alpha);
}
```

**Add these uniform declarations after `uniform int uHasColorOverlay;`:**
```glsl
uniform samplerCube uSkyboxTexture;
uniform int uUseSkybox;
uniform vec3 uTintColor;
uniform float uTintIntensity;
```

**Replace the entire `main()` function body with:**
```glsl
void main() {
    vec3 finalColor;
    float alpha = 1.0;

    // === Skybox rendering (cube map) ===
    if (uUseSkybox == 1) {
        vec3 dir = normalize(vWorldPos);
        vec3 texColor = texture2D(uSkyboxTexture, dir).rgb;

        // Time-of-day tinting: multiply texture by interpolated tint color
        finalColor = texColor * uTintColor * uTintIntensity + texColor * (1.0 - uTintIntensity);
    }
    // === Fallback gradient rendering ===
    else {
        float t = smoothstep(uHorizon - 0.1, uHorizon + 0.1, normalize(vWorldPos).y);
        finalColor = mix(uBottomColor, uTopColor, t);

        // Color overlay for sun/moon/stars
        if (uHasColorOverlay == 1) {
            finalColor = vColor.rgb;
            alpha = vColor.a;
        }
    }

    gl_FragColor = vec4(finalColor, alpha);
}
```

**Explanation:**
- `uUseSkybox` — flag to enable cube map path (0 = gradient fallback)
- `uSkyboxTexture` — samplerCube for the 6-face skybox
- `uTintColor` — RGB tint color interpolated from time-of-day keyframes
- `uTintIntensity` — how strongly tint is applied (1.0 = full tint, 0.0 = no tint)
- The tint formula preserves texture detail while shifting colors for day/night

---

## Step 3: Rewrite src/render/sky.js — Constructor Changes

**File:** `src/render/sky.js`
**Location:** Lines 14-52, the constructor `Donkeycraft.Sky = function (gl, shaderManager) { ... }`

**Add these new instance variables to the constructor:**

```javascript
    // Skybox state
    this._skyboxReady = false;
    this._skyboxTexture = null;       // WebGL cube map texture
    this._skyboxGeometry = null;      // Unit cube geometry data
    this._skyboxVertBuf = null;       // Vertex buffer for unit cube
    this._skyboxIndexBuf = null;      // Index buffer for unit cube

    // Time-of-day tint keyframes: [timeOfDay, r, g, b]
    this._tintKeyframes = [
      { t: 0.0, r: 0.02, g: 0.02, b: 0.08 },   // midnight — dark blue-black
      { t: 0.2, r: 0.03, g: 0.02, b: 0.06 },   // pre-dawn — very dark
      { t: 0.3, r: 0.9, g: 0.5, b: 0.15 },     // sunrise — orange-pink
      { t: 0.45, r: 0.4, g: 0.65, b: 0.95 },   // morning — blue sky
      { t: 0.55, r: 0.3, g: 0.55, b: 0.95 },   // midday — deep blue
      { t: 0.7, r: 0.85, g: 0.45, b: 0.1 },    // sunset — orange
      { t: 0.8, r: 0.03, g: 0.02, b: 0.06 },   // dusk — dark
      { t: 1.0, r: 0.02, g: 0.02, b: 0.08 },   // midnight again
    ];
```

**Replace the existing `this._initBuffers()` call at end of constructor with:**
```javascript
    // Build geometry and initialize buffers
    this._buildSkyDome();
    this._buildSunDisc();
    this._buildMoonDisc();
    this._buildStarField();
    this._buildSkyboxGeometry();       // NEW: unit cube geometry
    this._loadSkyboxTextures();        // NEW: load from global variables
    this._initBuffers();
```

---

## Step 4: Add _buildSkyboxGeometry() Method

**File:** `src/render/sky.js`
**Location:** After `_buildStarField()` method (after line ~243)

**Add this new method:**

```javascript
  /**
   * Build a unit cube geometry for the skybox.
   * The cube is centered at origin with radius 1.0.
   * Each face has unique UV coordinates mapped from the 6-face atlas grid.
   * Vertex layout: position(3) + uv(2) = 5 floats per vertex.
   * @private
   * @returns {void}
   */
  Donkeycraft.Sky.prototype._buildSkyboxGeometry = function () {
    // Face definitions: [startVertex, normalX, normalY, normalZ, uBase, vBase]
    // Order: +X(right), -X(left), +Y(up), -Y(down), +Z(forward), -Z(back)
    // This matches the skybox.js texture variable mapping:
    //   row1_col0 = left (-X), row1_col1 = forward (+Z), row1_col2 = right (+X)
    //   row1_col3 = back (-Z), row0_col1 = up (+Y), row2_col1 = down (-Y)
    var faces = [
      { name: 'right',  nx: 1, ny: 0, nz: 0, uBase: 2/12, vBase: 5/12 },  // +X = row1_col2
      { name: 'left',   nx:-1, ny: 0, nz: 0, uBase: 1/12, vBase: 5/12 },  // -X = row1_col0
      { name: 'up',     nx: 0, ny: 1, nz: 0, uBase: 1.5/12, vBase: 1/12 }, // +Y = row0_col1
      { name: 'down',   nx: 0, ny:-1, nz: 0, uBase: 1.5/12, vBase: 9/12 }, // -Y = row2_col1
      { name: 'forward',nx: 0, ny: 0, nz: 1, uBase: 1/12, vBase: 5/12 },   // +Z = row1_col1
      { name: 'back',   nx: 0, ny: 0, nz:-1, uBase: 3/12, vBase: 5/12 },   // -Z = row1_col3
    ];

    var vertices = [];
    var indices = [];
    var vertexCount = 0;

    for (var f = 0; f < faces.length; f++) {
      var face = faces[f];
      var nx = face.nx, ny = face.ny, nz = face.nz;

      // Determine the two axes perpendicular to the face normal
      var axis1, axis2; // used for UV mapping on the face
      if (Math.abs(nx) > 0.5) {
        axis1 = 'z'; axis2 = 'y';
      } else if (Math.abs(ny) > 0.5) {
        axis1 = 'x'; axis2 = 'z';
      } else {
        axis1 = 'x'; axis2 = 'y';
      }

      // Build 4 corners of the face quad (CCW winding for front-face culling)
      var corners = [
        [-1, -1], [1, -1], [1, 1], [-1, 1]
      ];

      // Generate 4 vertices with position + UV
      for (var c = 0; c < 4; c++) {
        var cx = corners[c][0];
        var cy = corners[c][1];

        var px, py, pz, u, v;

        if (Math.abs(nx) > 0.5) {
          // Right/Left face: axis is ZY
          px = nx;
          py = cx * (axis1 === 'z' ? 1 : -1);
          pz = cy * (axis2 === 'y' ? 1 : -1);
          u = (cx + 1) / 2;
          v = (cy + 1) / 2;
        } else if (Math.abs(ny) > 0.5) {
          // Up/Down face: axis is XZ
          px = cx * (axis1 === 'x' ? 1 : -1);
          py = ny;
          pz = cy * (axis2 === 'z' ? 1 : -1);
          u = (cx + 1) / 2;
          v = (cy + 1) / 2;
        } else {
          // Forward/Back face: axis is XY
          px = cx;
          py = cy;
          pz = nz;
          u = (cx + 1) / 2;
          v = (cy + 1) / 2;
        }

        // Apply UV offset from atlas grid position
        u = u * (1/3) + face.uBase;  // Each face is 1/3 of total width in a 3x4 grid
        v = v * (1/3) + face.vBase;  // Each face is 1/3 of total height

        vertices.push(px, py, pz, u, v);
      }

      // Two triangles per quad (CCW winding)
      indices.push(vertexCount, vertexCount + 1, vertexCount + 2);
      indices.push(vertexCount, vertexCount + 2, vertexCount + 3);
      vertexCount += 4;
    }

    this._skyboxGeometry = {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      vertexCount: vertices.length / 5,  // 5 floats per vertex (pos3 + uv2)
      indexCount: indices.length,
      floatsPerVertex: 5,
    };
  };
```

---

## Step 5: Add _loadSkyboxTextures() Method

**File:** `src/render/sky.js`
**Location:** After `_buildSkyboxGeometry()` method

**Add this new method:**

```javascript
  /**
   * Load skybox textures from global variables defined in skybox.js.
   * Creates a WebGL cube map texture from the 6 base64 PNG images.
   * Texture mapping (matches skybox.js variable names):
   *   GL_TEXTURE_CUBE_MAP_POSITIVE_X (+X, right)  = texture_row1_col2
   *   GL_TEXTURE_CUBE_MAP_NEGATIVE_X (-X, left)   = texture_row1_col0
   *   GL_TEXTURE_CUBE_MAP_POSITIVE_Y (+Y, up)     = texture_row0_col1
   *   GL_TEXTURE_CUBE_MAP_NEGATIVE_Y (-Y, down)   = texture_row2_col1
   *   GL_TEXTURE_CUBE_MAP_POSITIVE_Z (+Z, forward)= texture_row1_col1
   *   GL_TEXTURE_CUBE_MAP_NEGATIVE_Z (-Z, back)   = texture_row1_col3
   * @private
   * @returns {void}
   */
  Donkeycraft.Sky.prototype._loadSkyboxTextures = function () {
    var gl = this._gl;
    if (!gl) return;

    // Check that skybox.js has defined the global texture variables
    var textures = window.Donkeycraft || {};
    var skyboxVars = window; // global scope where skybox.js defines variables

    // Map of cube map faces to global variable names
    var faceMap = [
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X,  varName: 'texture_row1_col2' }, // right (+X)
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,  varName: 'texture_row1_col0' }, // left (-X)
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,  varName: 'texture_row0_col1' }, // up (+Y)
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,  varName: 'texture_row2_col1' }, // down (-Y)
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,  varName: 'texture_row1_col1' }, // forward (+Z)
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,  varName: 'texture_row1_col3' }, // back (-Z)
    ];

    // Create the cube map texture
    this._skyboxTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._skyboxTexture);

    // Set default filter (will be overridden per-face if loading fails)
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    var loadedCount = 0;
    var errorCount = 0;
    var totalFaces = faceMap.length;

    var checkComplete = function () {
      loadedCount++;
      if (loadedCount + errorCount === totalFaces) {
        // All faces processed
        if (errorCount === 0) {
          this._skyboxReady = true;
          Donkeycraft.Logger.info('Sky', 'Skybox textures loaded successfully (' + totalFaces + ' faces)');
        } else {
          Donkeycraft.Logger.warn('Sky', 'Skybox texture loading had errors: ' + errorCount + '/' + totalFaces + ' faces failed — using gradient fallback');
          this._skyboxReady = false;
        }
      }
    }.bind(this);

    for (var i = 0; i < faceMap.length; i++) {
      var face = faceMap[i];
      var imgSrc = skyboxVars[face.varName];

      if (!imgSrc || typeof imgSrc !== 'string') {
        Donkeycraft.Logger.warn('Sky', 'Skybox texture variable not found: ' + face.varName);
        errorCount++;
        checkComplete();
        continue;
      }

      var image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = function () {
        gl.texImage2D(
          face.target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image
        );
        image.onload = null; // Prevent double-calling
        checkComplete();
      };
      image.onerror = function () {
        Donkeycraft.Logger.warn('Sky', 'Failed to load skybox texture: ' + face.varName);
        image.onload = null;
        errorCount++;
        checkComplete();
      };
      image.src = imgSrc;
    }
  };
```

---

## Step 6: Add _getTintColor() Method

**File:** `src/render/sky.js`
**Location:** After `_loadSkyboxTextures()` method

**Add this new method:**

```javascript
  /**
   * Get the time-of-day tint color for skybox rendering.
   * Interpolates from predefined keyframes using smoothstep easing.
   * @private
   * @param {number} timeOfDay - Time value in [0, 1).
   * @returns {{r: number, g: number, b: number, intensity: number}} Tint color and intensity.
   */
  Donkeycraft.Sky.prototype._getTintColor = function (timeOfDay) {
    var keyframes = this._tintKeyframes;
    var t = timeOfDay;

    // Find surrounding keyframes
    var lower = keyframes[0];
    var upper = keyframes[keyframes.length - 1];

    for (var i = 0; i < keyframes.length - 1; i++) {
      if (t >= keyframes[i].t && t <= keyframes[i + 1].t) {
        lower = keyframes[i];
        upper = keyframes[i + 1];
        break;
      }
    }

    var range = upper.t - lower.t;
    var phase = range > 0 ? (t - lower.t) / range : 0;

    // Smoothstep easing for smooth color transitions
    phase = phase * phase * (3 - 2 * phase);

    return {
      r: Donkeycraft.lerp(lower.r, upper.r, phase),
      g: Donkeycraft.lerp(lower.g, upper.g, phase),
      b: Donkeycraft.lerp(lower.b, upper.b, phase),
      intensity: Donkeycraft.lerp(0.9, 1.0, phase) // 0.9 at night → 1.0 at day
    };
  };
```

---

## Step 7: Add _renderSkybox() Method

**File:** `src/render/sky.js`
**Location:** After `_getTintColor()` method

**Add this new method:**

```javascript
  /**
   * Render the skybox cube map.
   * Draws a unit cube (scaled to world space) with cube map texture sampling.
   * Applies time-of-day tinting for day/night color shifts.
   * @private
   * @param {Donkeycraft.Camera} camera - The camera instance.
   * @param {number} timeOfDay - Time value in [0, 1).
   * @returns {boolean} True if rendered successfully.
   */
  Donkeycraft.Sky.prototype._renderSkybox = function (camera, timeOfDay) {
    var gl = this._gl;
    if (!gl || !this._skyboxTexture || !this._skyboxVertBuf || !this._skyboxIndexBuf) {
      return false;
    }

    // Get time-of-day tint color
    var tint = this._getTintColor(timeOfDay);

    // Use the sky shader
    if (!this._shaderManager.use('sky')) {
      return false;
    }

    // Build model matrix: scale to large radius, zero translation (camera is inside)
    var scaleMatrix = Donkeycraft.Matrix4.createScale(400, 400, 400);
    var identityMatrix = Donkeycraft.Matrix4.createIdentity();
    var modelMatrix = Donkeycraft.Matrix4.multiply(scaleMatrix, identityMatrix);

    // Set camera matrices — zero out view translation to keep skybox fixed at world center
    var camData = camera.getMatrices();
    this._shaderManager.setMat4('uProjection', camData.projection);

    for (var i = 0; i < 16; i++) this._skyViewTemp[i] = camData.view.getData()[i];
    this._skyViewTemp[12] = 0;
    this._skyViewTemp[13] = 0;
    this._skyViewTemp[14] = 0;
    var skyboxViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);
    this._shaderManager.setMat4('uView', skyboxViewMatrix);
    this._shaderManager.setMat4('uModel', modelMatrix);

    // Set cube map texture uniform
    this._shaderManager.setInt('uUseSkybox', 1);
    this._shaderManager.setInt('uSkyboxTexture', 0); // texture unit 0

    // Set tint uniforms
    this._shaderManager.setVec3('uTintColor', tint.r, tint.g, tint.b);
    this._shaderManager.setFloat('uTintIntensity', tint.intensity);

    // Disable gradient uniforms (not used with skybox)
    this._shaderManager.setInt('uHasColorOverlay', 0);

    // Bind and draw
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._skyboxTexture);

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

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._skyboxIndexBuf);
    gl.drawElements(gl.TRIANGLES, this._skyboxGeometry.indexCount, gl.UNSIGNED_SHORT, 0);

    if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
    if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);

    // Reset skybox uniform for subsequent rendering passes
    this._shaderManager.setInt('uUseSkybox', 0);

    return true;
  };
```

---

## Step 8: Add Skybox Buffer Initialization to _initBuffers()

**File:** `src/render/sky.js`
**Location:** `_initBuffers()` method (around line 753)

**Add skybox buffer creation at the START of `_initBuffers()`, before existing geometry buffers:**

```javascript
  Donkeycraft.Sky.prototype._initBuffers = function () {
    var gl = this._gl;
    if (!gl) return;

    // === Skybox buffers (create first, may be null if textures fail) ===
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

    // === Existing sky dome buffers (unchanged) ===
    if (this._skyDomeGeometry) {
      // ... existing code ...
    }
    // ... rest of existing method unchanged ...
  };
```

---

## Step 9: Update render() Method to Render Skybox First

**File:** `src/render/sky.js`
**Location:** `render()` method (around line 590)

**Replace the entire render method body. The key change is rendering the skybox BEFORE the gradient dome, and only rendering the gradient dome as fallback if skybox is not ready.**

**Find this section in render():**
```javascript
      // ---- Sky dome (always drawn first, depth write disabled) ----
      gl.depthMask(false);

      if (!this._shaderManager.use('sky')) {
```

**Replace with:**
```javascript
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

        // Reset color overlay flag at the start to prevent state leakage.
        this._shaderManager.setInt('uHasColorOverlay', 0);

        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);

        // Zero out view translation to keep sky fixed at world center.
        var viewData = matrices.view.getData();
        for (var _gv = 0; _gv < 16; _gv++) this._skyViewTemp[_gv] = viewData[_gv];
        this._skyViewTemp[12] = 0;
        this._skyViewTemp[13] = 0;
        this._skyViewTemp[14] = 0;
        var skyViewMatrix = new Donkeycraft.Matrix4(this._skyViewTemp);

        this._shaderManager.setMat4('uView', skyViewMatrix);

        // Set sky colors from lighting
        var skyColor = lighting.getSkyColor();
        var sunIntensity = lighting.getSunIntensity();

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
```

**Also reset `uUseSkybox` to 0 after the skybox/gradient rendering block, before sun/moon rendering:**

Find this line in existing code:
```javascript
      // Reset color overlay flag after sun/moon rendering so stars use default gradient passthrough.
      this._shaderManager.setInt('uHasColorOverlay', 0);
```

Add right after it:
```javascript
      // Reset skybox uniform after all sky rendering is done
      this._shaderManager.setInt('uUseSkybox', 0);
```

---

## Step 10: Update destroy() Method to Clean Up Skybox Resources

**File:** `src/render/sky.js`
**Location:** `destroy()` method (around line 826)

**Add skybox buffer deletion at the START of destroy(), before existing buffers:**

```javascript
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

    // === Existing resources (unchanged) ===
    if (this._skyDomeVertBuf) {
      // ... existing code ...
    }
    // ... rest of existing method unchanged ...
  };
```

---

## Verification Checklist

After implementation, verify:
- [ ] `src/entities/skybox.js` loads before `src/render/sky.js` in index.html
- [ ] All 6 texture variables (`texture_row0_col1`, `texture_row1_col0`, `texture_row1_col1`, `texture_row1_col2`, `texture_row1_col3`, `texture_row2_col1`) are defined globally
- [ ] Console log shows "Skybox textures loaded successfully (6 faces)" on game start
- [ ] Sky renders as textured cube map instead of plain gradient
- [ ] Day/night tinting works: sky shifts from blue (day) to dark blue-black (night)
- [ ] Sun/moon/stars still render on top of skybox
- [ ] No WebGL errors in console
- [ ] Fallback to gradient works if skybox textures fail to load