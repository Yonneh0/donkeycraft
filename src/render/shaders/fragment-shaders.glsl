// Donkeycraft — Fragment Shaders
// All fragment shaders for terrain lighting, fog, sky, and GUI rendering.

// ============================================================
// Terrain Fragment Shader
// ============================================================
var TERRAIN_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec3 vNormal;
varying float vLight;
varying float vDepth;

uniform sampler2D uTexture;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogStart;
uniform float uFogEnd;

void main() {
    // Sample the texture atlas
    vec4 texColor = texture2D(uTexture, vUV);

    // Apply diffuse lighting
    vec3 finalColor = texColor.rgb * vLight;

    // Skip fully transparent fragments
    if (texColor.a < 0.5) {
        discard;
    }

    // Apply distance fog
    float fogDist = vDepth;
    float fogFactor = 1.0 - exp(-fogDist * uFogDensity);
    fogFactor = clamp(fogFactor, 0.0, 1.0);

    // Linear fog alternative: use start/end
    // float fogFactor = (uFogEnd - fogDist) / (uFogEnd - uFogStart);
    // fogFactor = clamp(fogFactor, 0.0, 1.0);

    finalColor = mix(finalColor, uFogColor, fogFactor);

    gl_FragColor = vec4(finalColor, texColor.a);
}
`;

// ============================================================
// Fog Fragment Shader (Solid fog overlay)
// ============================================================
var FOG_FRAGMENT_SHADER = `
precision mediump float;

uniform vec4 uFogColor;

void main() {
    gl_FragColor = uFogColor;
}
`;

// ============================================================
// GUI Fragment Shader (HUD overlay)
// ============================================================
var GUI_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec4 vColor;

uniform sampler2D uTexture;
uniform int uHasTexture;

void main() {
    vec4 color = vColor;

    // If a texture is provided, blend with it
    if (uHasTexture == 1) {
        vec4 texColor = texture2D(uTexture, vUV);
        color = texColor * color;
    }

    // Skip fully transparent fragments
    if (color.a < 0.1) {
        discard;
    }

    gl_FragColor = color;
}
`;

// ============================================================
// Sky Fragment Shader (Gradient sky)
// ============================================================
var SKY_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec3 vWorldPos;

uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uHorizon;

void main() {
    // Normalize the Y component
    float y = normalize(vWorldPos).y;

    // Mix between top and bottom colors based on height
    float t = smoothstep(uHorizon - 0.1, uHorizon + 0.1, y);
    vec3 skyColor = mix(uBottomColor, uTopColor, t);

    gl_FragColor = vec4(skyColor, 1.0);
}
`;

// ============================================================
// Hand/Item Fragment Shader (First-person item)
// ============================================================
var HAND_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec4 vColor;

uniform sampler2D uTexture;

void main() {
    vec4 texColor = texture2D(uTexture, vUV);
    vec3 finalColor = texColor.rgb * vColor.rgb;

    if (texColor.a < 0.1) {
        discard;
    }

    gl_FragColor = vec4(finalColor, texColor.a * vColor.a);
}
`;

// ============================================================
// Particle Fragment Shader (Block breaking particles)
// ============================================================
var PARTICLE_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUV;
varying vec4 vColor;

uniform sampler2D uTexture;

void main() {
    vec4 texColor = texture2D(uTexture, vUV);
    vec4 finalColor = vec4(vColor.rgb, vColor.a * texColor.a);

    if (finalColor.a < 0.1) {
        discard;
    }

    gl_FragColor = finalColor;
}
`;