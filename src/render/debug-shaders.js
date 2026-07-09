// Donkeycraft — Debug Renderer Shaders
// Shader definitions for the terrain viewer/debugger (debug-render.js)
//
// This module defines all WebGL shader programs used by the DebugTerrainRenderer:
//   - DK_TERRAIN_VS/FS: Main terrain rendering with lighting, fog, and alpha blending
//   - DK_SKY_VS/FS: Sky dome rendering with depth mask disabled
//   - DK_DEPTH_VS/FS: Depth-only pass (placeholder, for future use)
//
// @module debug-shaders
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  if (!Donkeycraft) return;

  /**
   * Terrain vertex shader — processes block vertex data with position, color, alpha, and normal.
   *
   * Transforms vertices from model space to clip space using the standard MVP matrix pipeline.
   * Passes color, alpha, normal, world position, and depth to the fragment shader via varyings.
   *
   * Attributes:
   *   - aPosition: Vertex position in block coordinates (vec3)
   *   - aColor: Block RGB color (vec3)
   *   - aAlpha: Block transparency factor [0, 1] (float)
   *   - aNormal: Face normal vector for lighting (vec3)
   *
   * Uniforms:
   *   - uProjection: Perspective projection matrix (mat4)
   *   - uView: Camera view matrix (mat4)
   *   - uModel: Chunk model offset matrix (mat4)
   *
   * @type {string}
   */
  Donkeycraft.DK_TERRAIN_VS = [
    'attribute vec3 aPosition;',
    'attribute vec3 aColor;',
    'attribute float aAlpha;',
    'attribute vec3 aNormal;',
    'uniform mat4 uProjection;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'varying vec3 vColor;',
    'varying vec3 vNormal;',
    'varying float vAlpha;',
    'varying float vDepth;',
    'varying vec3 vWorldPos;',
    'void main() {',
    '    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);',
    '    vColor = aColor;',
    '    vAlpha = aAlpha;',
    '    vNormal = normalize(aNormal);',
    '    vWorldPos = (uView * uModel * vec4(aPosition, 1.0)).xyz;',
    '    vDepth = -gl_Position.z;',
    '}',
  ].join('\n');

  /**
   * Terrain fragment shader — applies directional lighting, exponential fog, and alpha blending.
   *
   * Lighting model:
   *   - Ambient factor: 0.55 (base illumination)
   *   - Diffuse factor: 0.45 × max(dot(normal, lightDir), 0)
   *   - Total lighting: 0.55 + diffuse * lightFactor uniform
   *
   * Fog:
   *   - Exponential fog with density controlled by uFogDensity uniform
   *   - Fog color matches sky color (uFogColor) for seamless blending
   *   - Depth-based falloff: 1 - exp(-depth * density), clamped to [0, 1]
   *
   * Alpha blending:
   *   - Output alpha comes directly from vertex alpha (aAlpha)
   *   - Enables transparent blocks (glass, water) to blend with background
   *
   * @type {string}
   */
  Donkeycraft.DK_TERRAIN_FS = [
    'precision mediump float;',
    'varying vec3 vColor;',
    'varying vec3 vNormal;',
    'varying float vAlpha;',
    'varying float vDepth;',
    'uniform vec3 uFogColor;',
    'uniform float uFogDensity;',
    'uniform float uLightFactor;',
    'void main() {',
    '    // Simple directional lighting: ambient + diffuse',
    '    vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));',
    '    float diff = max(dot(normalize(vNormal), lightDir), 0.0);',
    '    float lighting = 0.55 + diff * 0.45;',
    '    vec3 finalColor = vColor * lighting * uLightFactor;',
    '',
    '    // Fog with exponential falloff',
    '    float fogFactor = 1.0 - exp(-vDepth * uFogDensity);',
    '    fogFactor = clamp(fogFactor, 0.0, 1.0);',
    '    finalColor = mix(finalColor, uFogColor, fogFactor);',
    '',
    '    gl_FragColor = vec4(finalColor, vAlpha);',
    '}',
  ].join('\n');

  /**
   * Sky vertex shader — renders a large dome surrounding the world.
   *
   * Removes translation from the view matrix to keep the sky fixed relative to the camera
   * (prevents the sky from moving when the camera translates). Only rotation is applied.
   *
   * Attributes:
   *   - aPosition: Vertex position on the sky dome (vec3)
   *   - aColor: Pre-multiplied sky color per vertex (vec4, includes alpha)
   *
   * Uniforms:
   *   - uProjection: Perspective projection matrix (mat4)
   *   - uView: Camera view matrix (mat4, translation stripped)
   *   - uModel: Model matrix for sky dome scaling/positioning (mat4)
   *
   * @type {string}
   */
  Donkeycraft.DK_SKY_VS = [
    'attribute vec3 aPosition;',
    'attribute vec4 aColor;',
    'uniform mat4 uProjection;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'varying vec4 vColor;',
    'void main() {',
    '    mat4 viewNoTranslate = uView;',
    '    viewNoTranslate[3][0] = 0.0;',
    '    viewNoTranslate[3][1] = 0.0;',
    '    viewNoTranslate[3][2] = 0.0;',
    '    gl_Position = uProjection * viewNoTranslate * uModel * vec4(aPosition, 1.0);',
    '    vColor = aColor;',
    '}',
  ].join('\n');

  /**
   * Sky fragment shader — outputs the interpolated sky color directly.
   *
   * No lighting or fog calculations needed since vertex colors already encode
   * the gradient from horizon to zenith. The sky is rendered with depth mask
   * disabled so it appears behind all terrain.
   *
   * @type {string}
   */
  Donkeycraft.DK_SKY_FS = [
    'precision mediump float;',
    'varying vec4 vColor;',
    'void main() { gl_FragColor = vColor; }',
  ].join('\n');

  /**
   * Depth-only vertex shader — writes depth without outputting color.
   *
   * Used for future depth-prepass optimization (e.g., hardware Z-test culling).
   * Currently a minimal implementation that outputs position but no fragment color.
   *
   * Attributes:
   *   - aPosition: Vertex position in block coordinates (vec3)
   *
   * Uniforms:
   *   - uProjection: Perspective projection matrix (mat4)
   *   - uView: Camera view matrix (mat4)
   *   - uModel: Chunk model offset matrix (mat4)
   *
   * @type {string}
   */
  Donkeycraft.DK_DEPTH_VS = [
    'attribute vec3 aPosition;',
    'uniform mat4 uProjection;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'void main() {',
    '    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);',
    '}',
  ].join('\n');

  /**
   * Depth-only fragment shader — outputs nothing, only writes depth buffer.
   *
   * Empty main function means no color is written, but the depth value
   * from the vertex shader is still stored in the depth buffer. This is
   * useful for deferred rendering techniques and occlusion culling.
   *
   * @type {string}
   */
  Donkeycraft.DK_DEPTH_FS = [
    'precision mediump float;',
    'void main() { }',
  ].join('\n');
})();
