// Donkeycraft — Vertex Shaders
// All vertex shaders as string resources for terrain, particles, and GUI rendering.

// Terrain Vertex Shader
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
    vNormal = aNormal;
    vLight = aLight;

    // View-space Z for exponential distance fog
    vec4 viewPos = uView * uModel * vec4(aPosition, 1.0);
    vDepth = -viewPos.z;
}
`;

// Block Break Vertex Shader
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

// GUI Vertex Shader
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

// Sky Vertex Shader
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

// Hand/Item Vertex Shader (reserved for future use — currently uses 'gui' shader program instead)
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
    vColor = vec4(aLight, aLight, aLight, 1.0);
}
`;

// Wireframe Vertex Shader — renders colored line outlines for debug wireframes.
var WIREFRAME_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec4 aColor;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

varying vec4 vColor;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    vColor = aColor;
}
`;
