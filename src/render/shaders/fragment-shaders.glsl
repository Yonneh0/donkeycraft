// Donkeycraft — Fragment Shaders
// All fragment shaders for terrain lighting, fog, sky, and GUI rendering.

// Terrain Fragment Shader
var TERRAIN_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec3 vNormal;
varying float vLight;
varying float vDepth;

uniform sampler2D uTexture;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uLightFactor;

// DEBUG_MODE: Set to 1 to output solid magenta when texture alpha is zero (indicates UV mismatch)
#define DEBUG_TEXTURE_SAMPLING 0

void main() {
    // Sample the texture atlas using UV coordinates
    vec4 texColor = texture2D(uTexture, vUV);

    // Debug: if texture alpha is zero, output magenta to indicate UV sampling issue
    #if DEBUG_TEXTURE_SAMPLING == 1
    if (texColor.a < 0.1) {
        gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
        return;
    }
    #endif

    // Apply vertex lighting (baked face light) to sampled color
    vec3 finalColor = texColor.rgb * vLight * uLightFactor;

    // Exponential distance fog
    float fogFactor = 1.0 - exp(-vDepth * uFogDensity);
    fogFactor = clamp(fogFactor, 0.0, 1.0);
    finalColor = mix(finalColor, uFogColor, fogFactor);

    gl_FragColor = vec4(finalColor, texColor.a);
}
`;


// Fog Fragment Shader
var FOG_FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 uFogColor;

void main() {
    gl_FragColor = uFogColor;
}
`;

// GUI Fragment Shader
var GUI_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec4 vColor;

uniform sampler2D uTexture;
uniform int uHasTexture;

void main() {
    vec4 color = vColor;
    if (uHasTexture == 1) {
        color = texture2D(uTexture, vUV) * color;
    }
    if (color.a < 0.1) discard;
    gl_FragColor = color;
}
`;

// Sky Fragment Shader
var SKY_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec3 vWorldPos;

uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uHorizon;

void main() {
    float t = smoothstep(uHorizon - 0.1, uHorizon + 0.1, normalize(vWorldPos).y);
    gl_FragColor = vec4(mix(uBottomColor, uTopColor, t), 1.0);
}
`;

// Hand/Item Fragment Shader (reserved for future use — currently uses 'gui' shader program instead)
var HAND_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec4 vColor;

uniform sampler2D uTexture;

void main() {
    vec4 texColor = texture2D(uTexture, vUV);
    if (texColor.a < 0.1) discard;
    gl_FragColor = vec4(texColor.rgb * vColor.rgb, texColor.a * vColor.a);
}
`;

// Particle Fragment Shader (reserved for future use — currently uses 'gui' shader program instead)
var PARTICLE_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec4 vColor;

uniform sampler2D uTexture;

void main() {
    vec4 texColor = texture2D(uTexture, vUV);
    if (vColor.a * texColor.a < 0.1) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * texColor.a);
}
`;
