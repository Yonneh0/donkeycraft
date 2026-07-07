// Donkeycraft — Debug Renderer Shaders
// Shader definitions for the terrain viewer/debugger (debug-render.js)
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    /**
     * Terrain vertex shader with alpha support, edge detection, and proper lighting.
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
        '}'
    ].join('\n');

    /**
     * Terrain fragment shader with lighting, fog, and alpha blending.
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
        '}'
    ].join('\n');

    /**
     * Sky vertex shader.
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
        '}'
    ].join('\n');

    /**
     * Sky fragment shader.
     */
    Donkeycraft.DK_SKY_FS = [
        'precision mediump float;',
        'varying vec4 vColor;',
        'void main() { gl_FragColor = vColor; }'
    ].join('\n');

    /**
     * Depth-only vertex shader for pre-pass.
     */
    Donkeycraft.DK_DEPTH_VS = [
        'attribute vec3 aPosition;',
        'uniform mat4 uProjection;',
        'uniform mat4 uView;',
        'uniform mat4 uModel;',
        'void main() {',
        '    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);',
        '}'
    ].join('\n');

    /**
     * Depth-only fragment shader.
     */
    Donkeycraft.DK_DEPTH_FS = [
        'precision mediump float;',
        'void main() { }'
    ].join('\n');

})();