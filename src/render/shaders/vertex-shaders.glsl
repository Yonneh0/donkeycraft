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

    // Transform normal by model matrix only (normal matrix = inverse-transpose of model-view).
    // For rotation+translation matrices (no non-uniform scale), model matrix normal is sufficient.
    vNormal = mat3(uModel) * aNormal;
    vNormal = normalize(vNormal);

    // Pass light intensity (pre-computed during geometry build)
    vLight = aLight;

    // Compute view-space position for accurate exponential distance fog.
    // We use the negative of view-space Z because in OpenGL, camera looks down -Z.
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
// NOTE: The view matrix passed here must already have translation
// zeroed out (row 3 = [0, 0, 0, 1]). Do NOT try to modify the
// matrix inside the shader — GLSL ES 1.00 does not support
// matrix column indexing (skyView[3] = ...) is invalid.
// ============================================================
var SKY_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUV;

uniform mat4 uProjection;
uniform mat4 uView;

varying vec2 vUV;
varying vec3 vWorldPos;

void main() {
    // uView is already rotation-only (translation zeroed in JavaScript)
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
