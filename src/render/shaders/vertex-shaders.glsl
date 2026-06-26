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

    vUV = aUV;

    // Transform normal by model matrix (rotation+translation only, no non-uniform scale)
    vNormal = normalize(mat3(uModel) * aNormal);

    vLight = aLight;

    // Compute view-space Z for exponential distance fog.
    // In OpenGL, camera looks down -Z, so we negate to get positive distance.
    vec4 viewPos = uView * uModel * vec4(aPosition, 1.0);
    vDepth = -viewPos.z;
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
uniform mat4 uModel;

varying vec2 vUV;
varying vec4 vColor;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    vUV = aUV;
    vColor = aColor;
}
`;

// ============================================================
// Sky Vertex Shader (Large sphere for skybox)
// The view matrix must have translation zeroed out (rotation-only).
// ============================================================
var SKY_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUV;

uniform mat4 uProjection;
uniform mat4 uView;

varying vec2 vUV;
varying vec3 vWorldPos;

void main() {
    gl_Position = uProjection * uView * vec4(aPosition, 1.0);
    vUV = aUV;
    vWorldPos = aPosition;
}
`;

// ============================================================
// Hand/Item Vertex Shader (First-person item rendering)
// ============================================================
var HAND_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUV;
attribute vec3 aNormal;
attribute float aLight;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

varying vec2 vUV;
varying vec4 vColor;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    vUV = aUV;
    // Pass light as color for simple item rendering
    vColor = vec4(aLight, aLight, aLight, 1.0);
}
`;