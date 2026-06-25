// Donkeycraft — Vertex Shaders
// All vertex shaders as string resources for terrain, particles, and GUI rendering.

// ============================================================
// Terrain Vertex Shader
// ============================================================
var TERRAIN_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUV;
attribute vec3 aNormal;
attribute float aLight;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

varying vec2 vUV;
varying vec3 vNormal;
varying float vLight;
varying float vDepth;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);

    // Pass UV coordinates to fragment shader
    vUV = aUV;

    // Pass normal for lighting calculation
    vNormal = (uView * uModel * vec4(aNormal, 0.0)).xyz;
    vNormal = normalize(vNormal);

    // Pass light intensity (pre-computed during geometry build)
    vLight = aLight;

    // Calculate depth for fog
    vDepth = gl_Position.w;
}
`;

// ============================================================
// Block Break Vertex Shader (Particles)
// ============================================================
var BREAK_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUV;
attribute vec4 aColor;

uniform mat4 uProjection;
uniform mat4 uView;

varying vec2 vUV;
varying vec4 vColor;

void main() {
    gl_Position = uProjection * uView * vec4(aPosition, 1.0);
    vUV = aUV;
    vColor = aColor;
}
`;

// ============================================================
// GUI Vertex Shader (Orthographic overlay)
// ============================================================
var GUI_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUV;
attribute vec4 aColor;

uniform mat4 uProjection;
uniform mat4 uView;

varying vec2 vUV;
varying vec4 vColor;

void main() {
    gl_Position = uProjection * uView * vec4(aPosition, 1.0);
    vUV = aUV;
    vColor = aColor;
}
`;

// ============================================================
// Sky Vertex Shader (Large sphere for skybox)
// ============================================================
var SKY_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUV;

uniform mat4 uProjection;
uniform mat4 uView;

varying vec2 vUV;
varying vec3 vWorldPos;

void main() {
    // Remove translation from view matrix for sky (keep rotation only)
    mat4 skyView = uView;
    skyView[3] = vec4(0.0, 0.0, 0.0, 1.0);

    gl_Position = uProjection * skyView * vec4(aPosition, 1.0);
    vUV = aUV;
    vWorldPos = aPosition;
}
`;