// Donkeycraft — Entity Renderer
// Standalone robust renderer for all entities using WebGL 1.0.
// Tightly integrated with EntityManager's awareness tracking and culling system.
// Renders animated entities with bone transforms using per-mesh draw calls.
//
// Features:
// - Awareness-based culling (NEAR/FAR tiers from EntityManager)
// - Distance-sorted batch rendering (far-to-near for correct depth sorting)
// - Bone transform computation for skeletal animation
// - Mesh caching for efficient repeated rendering
// - Proper model matrix computation and shader uniform integration
//
// @module EntityRenderer
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    // ============================================================
    // Constants
    // ============================================================

    /**
     * Default maximum number of entities to render per frame.
     * @constant {number}
     * @default 200
     */
    var DEFAULT_MAX_RENDER_ENTITIES = 200;

    /**
     * Default render distance in blocks.
     * @constant {number}
     * @default 16
     */
    var DEFAULT_RENDER_DISTANCE = 16;

    /**
     * Minimum render distance in blocks.
     * @constant {number}
     * @default 4
     */
    var MIN_RENDER_DISTANCE = 4;

    /**
     * Maximum render distance in blocks.
     * @constant {number}
     * @default 64
     */
    var MAX_RENDER_DISTANCE = 64;

    /**
     * Frustum forward-facing check factor — dot product threshold for culling
     * entities that are within range but behind or perpendicular to camera view.
     * A value of 0.0 means perpendicular to camera, 1.0 means directly in front.
     * Entities with a dot product below this threshold are culled.
     * @constant {number}
     * @default 0.1
     */
    var FRUSTUM_FORWARD_THRESHOLD = 0.1;

    // ============================================================
    // Entity Mesh Builder — Generates simple blocky entity meshes
    // ============================================================

    /**
     * EntityMeshBuilder — Generates geometric meshes for entity rendering.
     * Creates box and cylinder meshes composed of blocky body parts that form
     * complete entities when combined (body, head, limbs).
     *
     * @namespace
     */
    Donkeycraft.EntityMeshBuilder = {};

    /**
     * createBoxMesh — Generate indexed geometry for a box centered at the origin.
     *
     * Each vertex contains: x, y, z (position), nx, ny, nz (normal), u, v (UV) = 8 floats.
     * Uses 24 vertices (6 faces × 4 corners) because each face needs its own normal.
     *
     * @param {number} width - Box width along the X axis.
     * @param {number} height - Box height along the Y axis.
     * @param {number} depth - Box depth along the Z axis.
     * @returns {{vertices: Float32Array, indices: Uint16Array}} Mesh data containing vertex positions/normals/UVs and triangle indices.
     *
     * @example
     * var mesh = Donkeycraft.EntityMeshBuilder.createBoxMesh(1.0, 1.0, 1.0);
     * // Returns 96 floats (24 vertices × 8 components) and 36 indices
     */
    Donkeycraft.EntityMeshBuilder.createBoxMesh = function (width, height, depth) {
        var hw = width / 2; // half-width
        var hh = height / 2; // half-height
        var hd = depth / 2; // half-depth

        // 8 unique corners × 6 faces (with shared edges having duplicate vertices for per-face normals)
        // Each vertex: x, y, z, nx, ny, nz, u, v = 8 floats
        var vertices = new Float32Array([
            // Front face (z = +hd), normal = (0, 0, 1)
            -hw, -hh,  hd,  0, 0, 1,  0, 0,
             hw, -hh,  hd,  0, 0, 1,  1, 0,
             hw,  hh,  hd,  0, 0, 1,  1, 1,
            -hw,  hh,  hd,  0, 0, 1,  0, 1,

            // Back face (z = -hd), normal = (0, 0, -1)
             hw, -hh, -hd,  0, 0,-1,  0, 0,
            -hw, -hh, -hd,  0, 0,-1,  1, 0,
            -hw,  hh, -hd,  0, 0,-1,  1, 1,
             hw,  hh, -hd,  0, 0,-1,  0, 1,

            // Top face (y = +hh), normal = (0, 1, 0)
            -hw,  hh,  hd,  0, 1, 0,  0, 0,
             hw,  hh,  hd,  0, 1, 0,  1, 0,
             hw,  hh, -hd,  0, 1, 0,  1, 1,
            -hw,  hh, -hd,  0, 1, 0,  0, 1,

            // Bottom face (y = -hh), normal = (0, -1, 0)
            -hw, -hh, -hd,  0,-1, 0,  0, 0,
             hw, -hh, -hd,  0,-1, 0,  1, 0,
             hw, -hh,  hd,  0,-1, 0,  1, 1,
            -hw, -hh,  hd,  0,-1, 0,  0, 1,

            // Right face (x = +hw), normal = (1, 0, 0)
             hw, -hh,  hd,  1, 0, 0,  0, 0,
             hw, -hh, -hd,  1, 0, 0,  1, 0,
             hw,  hh, -hd,  1, 0, 0,  1, 1,
             hw,  hh,  hd,  1, 0, 0,  0, 1,

            // Left face (x = -hw), normal = (-1, 0, 0)
            -hw, -hh, -hd, -1, 0, 0,  0, 0,
            -hw, -hh,  hd, -1, 0, 0,  1, 0,
            -hw,  hh,  hd, -1, 0, 0,  1, 1,
            -hw,  hh, -hd, -1, 0, 0,  0, 1
        ]);

        // 6 faces × 2 triangles × 3 vertices = 36 indices
        var indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,       // Front (z+)
            4, 5, 6, 4, 6, 7,       // Back (z-)
            8, 9, 10, 8, 10, 11,    // Top (y+)
            12, 13, 14, 12, 14, 15, // Bottom (y-)
            16, 17, 18, 16, 18, 19, // Right (x+)
            20, 21, 22, 20, 22, 23  // Left (x-)
        ]);

        return { vertices: vertices, indices: indices };
    };

    /**
     * createCylinderMesh — Generate geometry for a simple cylinder (for legs, arms).
     * Creates a vertical cylinder centered at the origin with caps on top and bottom.
     *
     * @param {number} radius - Cylinder radius.
     * @param {number} height - Cylinder height along the Y axis.
     * @param {number} [segments=8] - Number of radial segments (more = smoother circle).
     * @returns {{vertices: Float32Array, indices: Uint16Array}} Mesh data containing vertex positions/normals/UVs and triangle indices.
     *
     * @example
     * var mesh = Donkeycraft.EntityMeshBuilder.createCylinderMesh(0.1, 0.7, 8);
     */
    Donkeycraft.EntityMeshBuilder.createCylinderMesh = function (radius, height, segments) {
        segments = segments || 8;
        var vertices = [];
        var indices = [];

        var hh = height / 2;

        // Top cap center vertex: position, normal (0,1,0), UV
        vertices.push(0, hh, 0, 0, 1, 0, 0.5, 0.5);

        // Top ring vertices
        for (var i = 0; i <= segments; i++) {
            var angle = (i / segments) * Math.PI * 2;
            var cos = Math.cos(angle);
            var sin = Math.sin(angle);
            vertices.push(cos * radius, hh, sin * radius, 0, 1, 0, i / segments, 1);
        }

        // Bottom ring vertices
        for (var j = 0; j <= segments; j++) {
            var angle2 = (j / segments) * Math.PI * 2;
            var cos2 = Math.cos(angle2);
            var sin2 = Math.sin(angle2);
            vertices.push(cos2 * radius, -hh, sin2 * radius, 0, -1, 0, j / segments, 0);
        }

        // Bottom cap center vertex: position, normal (0,-1,0), UV
        var bottomCenterIdx = vertices.length / 8;
        vertices.push(0, -hh, 0, 0, -1, 0, 0.5, 0.5);

        // Index offsets
        var topCenterIdx = 0;
        var topStartIdx = 1;
        var bottomStartIdx = topStartIdx + segments + 1;
        var bottomCenterIdx2 = bottomStartIdx + segments + 1;

        // Top cap triangles (fan from center)
        for (var k = 0; k < segments; k++) {
            indices.push(topCenterIdx, topStartIdx + k, topStartIdx + k + 1);
        }

        // Side triangles (quads split into pairs)
        for (var m = 0; m < segments; m++) {
            var topCurr = topStartIdx + m;
            var topNext = topStartIdx + m + 1;
            var botCurr = bottomStartIdx + m;
            var botNext = bottomStartIdx + m + 1;
            indices.push(topCurr, botCurr, topNext);
            indices.push(topNext, botCurr, botNext);
        }

        // Bottom cap triangles (fan from center, reversed winding for outward normal)
        for (var n = 0; n < segments; n++) {
            indices.push(bottomCenterIdx2, bottomStartIdx + n + 1, bottomStartIdx + n);
        }

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint16Array(indices)
        };
    };

    // ============================================================
    // Entity Geometry — Shape definitions per entity type
    // ============================================================

    /**
     * EntityShapeDefinitions — Pre-defined body part shapes for each entity type.
     * Each entity is composed of multiple mesh parts (body, head, limbs) that are
     * attached to bones and rendered with bone transforms applied.
     *
     * Shape definitions map entity types to arrays of body part definitions:
     * - name: Bone name this part attaches to
     * - meshType: 'box' or 'cylinder'
     * - dimensions: Mesh dimensions (w/h/d for boxes, r/h for cylinders)
     * - color: Flat render color as hex string
     *
     * @type {Object.<string, Array<{name: string, meshType: string, dimensions: Object, color: string}>}
     */
    Donkeycraft.EntityShapeDefs = {
        cow: [
            { name: 'body', meshType: 'box', dimensions: { w: 1.4, h: 1.0, d: 0.7 }, color: '#8B4513' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#A0522D' },
            { name: 'frontLeftLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513' },
            { name: 'frontRightLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513' },
            { name: 'rearLeftLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513' },
            { name: 'rearRightLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513' }
        ],
        pig: [
            { name: 'body', meshType: 'box', dimensions: { w: 0.9, h: 0.6, d: 0.5 }, color: '#FFC0CB' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.35, h: 0.35, d: 0.4 }, color: '#FFB6C1' },
            { name: 'frontLeftLeg', meshType: 'cylinder', dimensions: { r: 0.08, h: 0.5 }, color: '#FFC0CB' },
            { name: 'frontRightLeg', meshType: 'cylinder', dimensions: { r: 0.08, h: 0.5 }, color: '#FFC0CB' },
            { name: 'rearLeftLeg', meshType: 'cylinder', dimensions: { r: 0.08, h: 0.5 }, color: '#FFC0CB' },
            { name: 'rearRightLeg', meshType: 'cylinder', dimensions: { r: 0.08, h: 0.5 }, color: '#FFC0CB' }
        ],
        donkey: [
            { name: 'body', meshType: 'box', dimensions: { w: 1.0, h: 1.2, d: 0.5 }, color: '#808080' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.4, h: 0.6, d: 0.35 }, color: '#A9A9A9' },
            { name: 'frontLeftLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.8 }, color: '#696969' },
            { name: 'frontRightLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.8 }, color: '#696969' },
            { name: 'rearLeftLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.8 }, color: '#696969' },
            { name: 'rearRightLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.8 }, color: '#696969' }
        ],
        chicken: [
            { name: 'body', meshType: 'box', dimensions: { w: 0.4, h: 0.35, d: 0.3 }, color: '#FFFFFF' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.2, h: 0.2, d: 0.2 }, color: '#FF0000' }
        ],
        zombie: [
            { name: 'body', meshType: 'box', dimensions: { w: 0.6, h: 0.9, d: 0.3 }, color: '#4B0082' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#228B22' },
            { name: 'leftArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#228B22' },
            { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#228B22' },
            { name: 'leftLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#000080' },
            { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#000080' }
        ],
        skeleton: [
            { name: 'body', meshType: 'box', dimensions: { w: 0.5, h: 0.8, d: 0.25 }, color: '#F5F5DC' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.45, h: 0.45, d: 0.45 }, color: '#FAFAD2' },
            { name: 'leftArm', meshType: 'cylinder', dimensions: { r: 0.08, h: 0.7 }, color: '#F5F5DC' },
            { name: 'rightArm', meshType: 'cylinder', dimensions: { r: 0.08, h: 0.7 }, color: '#F5F5DC' },
            { name: 'leftLeg', meshType: 'cylinder', dimensions: { r: 0.08, h: 0.8 }, color: '#F5F5DC' },
            { name: 'rightLeg', meshType: 'cylinder', dimensions: { r: 0.08, h: 0.8 }, color: '#F5F5DC' }
        ],
        creeper: [
            { name: 'body', meshType: 'box', dimensions: { w: 0.6, h: 1.0, d: 0.3 }, color: '#00FF00' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#00CC00' },
            { name: 'leftArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#00FF00' },
            { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#00FF00' },
            { name: 'leftLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#00FF00' },
            { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#00FF00' }
        ],
        spider: [
            { name: 'body', meshType: 'box', dimensions: { w: 1.4, h: 0.8, d: 1.0 }, color: '#2F4F4F' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.4, d: 0.5 }, color: '#000000' }
        ],
        enderman: [
            { name: 'body', meshType: 'box', dimensions: { w: 0.6, h: 1.2, d: 0.3 }, color: '#000000' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#000000' },
            { name: 'leftArm', meshType: 'box', dimensions: { w: 0.25, h: 1.0, d: 0.25 }, color: '#000000' },
            { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25, h: 1.0, d: 0.25 }, color: '#000000' },
            { name: 'leftLeg', meshType: 'box', dimensions: { w: 0.25, h: 1.2, d: 0.25 }, color: '#000000' },
            { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25, h: 1.2, d: 0.25 }, color: '#000000' }
        ],
        player: [
            { name: 'body', meshType: 'box', dimensions: { w: 0.6, h: 0.9, d: 0.3 }, color: '#3366CC' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#FFCC99' },
            { name: 'leftArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#FFCC99' },
            { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#3366CC' },
            { name: 'leftLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#3366CC' },
            { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#3366CC' }
        ],
        npc: [
            { name: 'body', meshType: 'box', dimensions: { w: 0.6, h: 0.9, d: 0.3 }, color: '#8B0000' },
            { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#FFCC99' },
            { name: 'leftArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#FFCC99' },
            { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#8B0000' },
            { name: 'leftLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#8B0000' },
            { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#8B0000' }
        ],
        door: [
            { name: 'doorPanel', meshType: 'box', dimensions: { w: 0.75, h: 1.8, d: 0.1 }, color: '#8B4513' }
        ],
        sign_post: [
            { name: 'post', meshType: 'cylinder', dimensions: { r: 0.05, h: 1.0 }, color: '#8B4513' },
            { name: 'sign', meshType: 'box', dimensions: { w: 0.8, h: 0.4, d: 0.05 }, color: '#A0522D' }
        ],
        chest: [
            { name: 'chest', meshType: 'box', dimensions: { w: 0.98, h: 0.875, d: 0.98 }, color: '#8B6914' }
        ],
        furnace: [
            { name: 'furnace', meshType: 'box', dimensions: { w: 0.98, h: 1.0, d: 0.98 }, color: '#696969' }
        ],
        arrow: [
            { name: 'shaft', meshType: 'cylinder', dimensions: { r: 0.01, h: 0.8 }, color: '#8B4513' },
            { name: 'tip', meshType: 'box', dimensions: { w: 0.04, h: 0.06, d: 0.04 }, color: '#C0C0C0' }
        ],
        snowball: [
            { name: 'sphere', meshType: 'box', dimensions: { w: 0.25, h: 0.25, d: 0.25 }, color: '#FFFFFF' }
        ]
    };

    // ============================================================
    // Matrix4 Helper — Simple column-major 4x4 matrix utilities
    // ============================================================

    /**
     * _createMat4 — Create a new identity 4x4 matrix (column-major Float32Array).
     * @returns {Float32Array} 16-element identity matrix.
     * @private
     */
    function _createMat4() {
        var m = new Float32Array(16);
        m[0] = 1;  m[1] = 0;  m[2] = 0;  m[3] = 0;
        m[4] = 0;  m[5] = 1;  m[6] = 0;  m[7] = 0;
        m[8] = 0;  m[9] = 0;  m[10] = 1; m[11] = 0;
        m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
        return m;
    }

    /**
     * _translateMat4 — Post-multiply a translation matrix.
     * @param {Float32Array} mat - Input matrix (modified in place).
     * @param {number} x - Translation X.
     * @param {number} y - Translation Y.
     * @param {number} z - Translation Z.
     * @returns {Float32Array} The translated matrix.
     * @private
     */
    function _translateMat4(mat, x, y, z) {
        mat[12] += x;
        mat[13] += y;
        mat[14] += z;
        return mat;
    }

    /**
     * _rotateMat4X — Post-multiply a rotation around the X axis.
     * @param {Float32Array} mat - Input matrix (modified in place).
     * @param {number} rad - Rotation angle in radians.
     * @returns {Float32Array} The rotated matrix.
     * @private
     */
    function _rotateMat4X(mat, rad) {
        var c = Math.cos(rad);
        var s = Math.sin(rad);
        var m5 = mat[5] * c - mat[9] * s;
        var m6 = mat[6] * c - mat[10] * s;
        var m7 = mat[7] * c - mat[11] * s;
        var m9 = mat[5] * s + mat[9] * c;
        var m10 = mat[6] * s + mat[10] * c;
        var m11 = mat[7] * s + mat[11] * c;
        mat[5] = m5; mat[6] = m6; mat[7] = m7;
        mat[9] = m9; mat[10] = m10; mat[11] = m11;
        return mat;
    }

    /**
     * _rotateMat4Y — Post-multiply a rotation around the Y axis.
     * @param {Float32Array} mat - Input matrix (modified in place).
     * @param {number} rad - Rotation angle in radians.
     * @returns {Float32Array} The rotated matrix.
     * @private
     */
    function _rotateMat4Y(mat, rad) {
        var c = Math.cos(rad);
        var s = Math.sin(rad);
        var m0 = mat[0] * c + mat[8] * s;
        var m2 = mat[2] * c + mat[10] * s;
        var m3 = mat[3] * c + mat[11] * s;
        var m8 = mat[8] * c - mat[0] * s;
        var m10 = mat[10] * c - mat[2] * s;
        var m11 = mat[11] * c - mat[3] * s;
        mat[0] = m0; mat[2] = m2; mat[3] = m3;
        mat[8] = m8; mat[10] = m10; mat[11] = m11;
        return mat;
    }

    /**
     * _rotateMat4Z — Post-multiply a rotation around the Z axis.
     * @param {Float32Array} mat - Input matrix (modified in place).
     * @param {number} rad - Rotation angle in radians.
     * @returns {Float32Array} The rotated matrix.
     * @private
     */
    function _rotateMat4Z(mat, rad) {
        var c = Math.cos(rad);
        var s = Math.sin(rad);
        var m0 = mat[0] * c - mat[4] * s;
        var m1 = mat[1] * c - mat[5] * s;
        var m2 = mat[2] * c - mat[6] * s;
        var m3 = mat[3] * c - mat[7] * s;
        var m4 = mat[0] * s + mat[4] * c;
        var m5 = mat[1] * s + mat[5] * c;
        var m6 = mat[2] * s + mat[6] * c;
        var m7 = mat[3] * s + mat[7] * c;
        mat[0] = m0; mat[1] = m1; mat[2] = m2; mat[3] = m3;
        mat[4] = m4; mat[5] = m5; mat[6] = m6; mat[7] = m7;
        return mat;
    }

    /**
     * _multiplyMat4 — Post-multiply two 4x4 matrices (r = a × b).
     * @param {Float32Array} a - Left matrix.
     * @param {Float32Array} b - Right matrix.
     * @returns {Float32Array} Result matrix (new allocation).
     * @private
     */
    function _multiplyMat4(a, b) {
        var r = new Float32Array(16);
        r[0] = a[0]*b[0] + a[1]*b[4] + a[2]*b[8] + a[3]*b[12];
        r[1] = a[0]*b[1] + a[1]*b[5] + a[2]*b[9] + a[3]*b[13];
        r[2] = a[0]*b[2] + a[1]*b[6] + a[2]*b[10] + a[3]*b[14];
        r[3] = a[0]*b[3] + a[1]*b[7] + a[2]*b[11] + a[3]*b[15];
        r[4] = a[4]*b[0] + a[5]*b[4] + a[6]*b[8] + a[7]*b[12];
        r[5] = a[4]*b[1] + a[5]*b[5] + a[6]*b[9] + a[7]*b[13];
        r[6] = a[4]*b[2] + a[5]*b[6] + a[6]*b[10] + a[7]*b[14];
        r[7] = a[4]*b[3] + a[5]*b[7] + a[6]*b[11] + a[7]*b[15];
        r[8] = a[8]*b[0] + a[9]*b[4] + a[10]*b[8] + a[11]*b[12];
        r[9] = a[8]*b[1] + a[9]*b[5] + a[10]*b[9] + a[11]*b[13];
        r[10] = a[8]*b[2] + a[9]*b[6] + a[10]*b[10] + a[11]*b[14];
        r[11] = a[8]*b[3] + a[9]*b[7] + a[10]*b[11] + a[11]*b[15];
        r[12] = a[12]*b[0] + a[13]*b[4] + a[14]*b[8] + a[15]*b[12];
        r[13] = a[12]*b[1] + a[13]*b[5] + a[14]*b[9] + a[15]*b[13];
        r[14] = a[12]*b[2] + a[13]*b[6] + a[14]*b[10] + a[15]*b[14];
        r[15] = a[12]*b[3] + a[13]*b[7] + a[14]*b[11] + a[15]*b[15];
        return r;
    }

    // ============================================================
    // Entity Renderer — WebGL rendering with bone transforms
    // ============================================================

    /**
     * EntityRenderer — Standalone WebGL renderer for all entity types.
     *
     * Uses awareness-based culling from EntityManager, depth-sorted batch rendering,
     * and bone transform computation for skeletal animation.
     *
     * Rendering pipeline:
     * 1. Query NEAR/FAR entities from EntityManager based on awareness tiers
     * 2. Sort entities by distance from camera (far-to-near)
     * 3. For each entity, compute bone world transforms from animation data
     * 4. Build model matrices and draw each body part mesh
     *
     * @constructor
     * @param {WebGLRenderingContext} gl - WebGL 1.0 context.
     * @param {Object} shaderManager - ShaderManager instance with compiled shaders and uniform setters.
     */
    Donkeycraft.EntityRenderer = function (gl, shaderManager) {
        /**
         * WebGL rendering context.
         * @type {WebGLRenderingContext|null}
         * @private
         */
        this._gl = gl || null;

        /**
         * Shader manager instance for uniform setting and program activation.
         * @type {Object|null}
         * @private
         */
        this._shaderManager = shaderManager || null;

        /**
         * EntityManager reference for awareness queries.
         * @type {Object|null}
         * @private
         */
        this._entityManager = null;

        /**
         * Camera reference for frustum culling.
         * @type {Object|null}
         * @private
         */
        this._camera = null;

        /**
         * Mesh cache: normalized key → {vbo, ibo, vertexCount, stride}.
         * Keys are formatted as "meshType:w:h:d" (boxes) or "meshType:r:h" (cylinders).
         * @type {Object.<string, {vbo: WebGLBuffer, ibo: WebGLBuffer, vertexCount: number, stride: number}>}
         * @private
         */
        this._meshCache = {};

        /**
         * Whether the renderer is enabled.
         * @type {boolean}
         */
        this.enabled = true;

        /**
         * Maximum number of entities to render per frame.
         * @type {number}
         */
        this.maxRenderEntities = DEFAULT_MAX_RENDER_ENTITIES;

        /**
         * Render distance in blocks (synced from EntityManager awareness radius).
         * @type {number}
         */
        this.renderDistance = DEFAULT_RENDER_DISTANCE;

        /**
         * Statistics: total entities rendered per frame (updated each render call).
         * @type {number}
         */
        this.entitiesRendered = 0;

        /**
         * Statistics: total draw calls per frame (updated each render call).
         * @type {number}
         */
        this.drawCalls = 0;

        /**
         * Temporary matrix array reused for model matrix computation to reduce GC pressure.
         * @type {Float32Array}
         * @private
         */
        this._modelMatrix = _createMat4();
    };

    /**
     * setEntityManager — Set the entity manager reference for awareness queries.
     * @param {Donkeycraft.EntityManager} entityManager - EntityManager instance.
     */
    Donkeycraft.EntityRenderer.prototype.setEntityManager = function (entityManager) {
        this._entityManager = entityManager || null;
    };

    /**
     * setCamera — Set the camera reference for frustum culling.
     * The camera object must provide:
     * - getPosition() → {x, y, z} or null
     * - getForwardDirection() → {x, y, z} or null (normalized forward vector)
     * @param {Object} camera - Camera instance.
     */
    Donkeycraft.EntityRenderer.prototype.setCamera = function (camera) {
        this._camera = camera || null;
    };

    /**
     * setRenderDistance — Set the entity render distance in blocks.
     * @param {number} distance - Render distance in blocks (clamped to [4, 64]).
     */
    Donkeycraft.EntityRenderer.prototype.setRenderDistance = function (distance) {
        this.renderDistance = Math.max(MIN_RENDER_DISTANCE, Math.min(MAX_RENDER_DISTANCE, distance));
    };

    /**
     * _normalizeMeshKey — Generate a robust cache key from mesh type and dimensions.
     * Rounds floating-point values to 3 decimal places to avoid precision-based cache misses.
     * @private
     * @param {string} meshType - Mesh type ('box' or 'cylinder').
     * @param {Object} dimensions - Dimension properties (w/h/d for boxes, r/h for cylinders).
     * @returns {string} Normalized cache key string.
     */
    Donkeycraft.EntityRenderer.prototype._normalizeMeshKey = function (meshType, dimensions) {
        var r = Math.round; // Alias for rounding
        if (meshType === 'box') {
            return 'box:' + r(dimensions.w || 1) + ':' + r(dimensions.h || 1) + ':' + r(dimensions.d || 1);
        } else if (meshType === 'cylinder') {
            return 'cyl:' + r(dimensions.r || 0.1) + ':' + r(dimensions.h || 1);
        }
        return meshType + ':unknown';
    };

    /**
     * _getOrBuildMesh — Get a cached mesh or build a new one for the given shape definition.
     * Creates WebGL buffers from the mesh geometry and caches them for reuse.
     * @private
     * @param {Object} shapeDef - Shape definition with meshType and dimensions.
     * @returns {{vbo: WebGLBuffer, ibo: WebGLBuffer, vertexCount: number, stride: number}|null} Mesh cache entry, or null on failure.
     */
    Donkeycraft.EntityRenderer.prototype._getOrBuildMesh = function (shapeDef) {
        if (!this._gl) return null;

        var key = this._normalizeMeshKey(shapeDef.meshType, shapeDef.dimensions);
        if (this._meshCache[key]) {
            return this._meshCache[key];
        }

        var gl = this._gl;
        var meshData = null;

        if (shapeDef.meshType === 'box') {
            var d = shapeDef.dimensions;
            meshData = Donkeycraft.EntityMeshBuilder.createBoxMesh(d.w || 1, d.h || 1, d.d || 1);
        } else if (shapeDef.meshType === 'cylinder') {
            var dim = shapeDef.dimensions;
            meshData = Donkeycraft.EntityMeshBuilder.createCylinderMesh(dim.r || 0.1, dim.h || 1, 8);
        }

        if (!meshData) return null;

        // Create vertex buffer object (VBO)
        var vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.vertices, gl.STATIC_DRAW);

        // Create index buffer object (IBO)
        var ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshData.indices, gl.STATIC_DRAW);

        var cached = {
            vbo: vbo,
            ibo: ibo,
            vertexCount: meshData.indices.length,
            stride: meshData.vertices.BYTES_PER_ELEMENT || 4 // bytes per vertex component
        };
        this._meshCache[key] = cached;

        return cached;
    };

    /**
     * _buildModelMatrix — Build a 4x4 model matrix from position and rotation.
     * The matrix is built as: Translate × RotateY × RotateX × RotateZ
     * This applies rotations first (in YXZ order), then translation.
     *
     * @private
     * @param {number} px - World X position.
     * @param {number} py - World Y position.
     * @param {number} pz - World Z position.
     * @param {number} rx - Rotation around X axis in radians.
     * @param {number} ry - Rotation around Y axis in radians.
     * @param {number} rz - Rotation around Z axis in radians.
     * @returns {Float32Array} Column-major 4x4 model matrix (16 elements).
     */
    Donkeycraft.EntityRenderer.prototype._buildModelMatrix = function (px, py, pz, rx, ry, rz) {
        // Reuse pre-allocated matrix to reduce GC pressure
        var m = this._modelMatrix;
        // Reset to identity
        m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
        m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
        m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
        m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;

        // Apply rotations (YXZ order — yaw first, then pitch, then roll)
        if (ry !== 0) _rotateMat4Y(m, ry);
        if (rx !== 0) _rotateMat4X(m, rx);
        if (rz !== 0) _rotateMat4Z(m, rz);

        // Apply translation
        _translateMat4(m, px, py, pz);

        return m;
    };

    /**
     * _computeBoneWorldTransform — Compute the world-space transform for a bone.
     *
     * Combines entity position + yaw rotation with bone offset and animation transforms.
     * Note: This implementation treats all bones as direct children of the root (flat hierarchy).
     * For hierarchical skeletons, parent bone positions would need to be traversed first.
     *
     * @private
     * @param {Object} entity - Entity instance with getPosition(), getRotation(), getBones() methods.
     * @param {string} boneName - Bone name to compute transform for.
     * @param {Object.<string, {rx: number, ry: number, rz: number}>} boneTransforms - Bone rotation transforms from animation controller.
     * @returns {{x: number, y: number, z: number, rx: number, ry: number, rz: number}} World-space position and rotation.
     */
    Donkeycraft.EntityRenderer.prototype._computeBoneWorldTransform = function (entity, boneName, boneTransforms) {
        var pos = entity.getPosition();
        if (!pos) return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

        var rot = entity.getRotation();
        var bones = entity.getBones();
        var boneAnim = boneTransforms[boneName] || { rx: 0, ry: 0, rz: 0 };

        // Find bone definition to get offset and pivot
        var boneDef = null;
        if (bones) {
            for (var i = 0; i < bones.length; i++) {
                if (bones[i].name === boneName) {
                    boneDef = bones[i];
                    break;
                }
            }
        }

        var offset = boneDef ? boneDef.offset : { x: 0, y: 0, z: 0 };

        // Apply entity yaw rotation to bone offset for correct world-space positioning
        var yaw = rot ? rot.yaw : 0;
        var cosYaw = Math.cos(yaw);
        var sinYaw = Math.sin(yaw);

        var localX = offset.x * cosYaw - offset.z * sinYaw;
        var localZ = offset.x * sinYaw + offset.z * cosYaw;
        var localY = offset.y;

        return {
            x: pos.x + localX,
            y: pos.y + localY,
            z: pos.z + localZ,
            rx: boneAnim.rx || 0,
            ry: (boneAnim.ry || 0) + yaw, // Add entity yaw to bone Y rotation for correct facing
            rz: boneAnim.rz || 0
        };
    };

    /**
     * _parseHexColor — Parse a hex color string (#RGB or #RRGGBB) to normalized RGB values.
     * @private
     * @param {string} color - Hex color string (e.g., '#8B4513' or '#F00').
     * @returns {{r: number, g: number, b: number}} RGB values in [0, 1] range.
     */
    Donkeycraft.EntityRenderer.prototype._parseHexColor = function (color) {
        var r = 0.5, g = 0.5, b = 0.5; // Default gray for invalid colors

        if (!color || color.charAt(0) !== '#') {
            return { r: r, g: g, b: b };
        }

        var hex = color.substring(1);

        if (hex.length === 6) {
            // Full hex color #RRGGBB
            r = parseInt(hex.substring(0, 2), 16) / 255;
            g = parseInt(hex.substring(2, 4), 16) / 255;
            b = parseInt(hex.substring(4, 6), 16) / 255;
        } else if (hex.length === 3) {
            // Shorthand hex color #RGB
            r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
            g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
            b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
        }

        return { r: r, g: g, b: b };
    };

    /**
     * _bindMeshAttributes — Bind vertex attributes for a mesh using the shader manager.
     * Sets up position (aPosition), normal (aNormal), and UV (aUV) attribute pointers.
     * @private
     * @param {Object} meshCache - Cached mesh data with VBO and stride.
     * @param {Object} shaderManager - ShaderManager instance for getting attribute locations.
     * @returns {boolean} True if all attributes were bound successfully.
     */
    Donkeycraft.EntityRenderer.prototype._bindMeshAttributes = function (meshCache, shaderManager) {
        var gl = this._gl;
        if (!gl || !meshCache || !shaderManager) return false;

        gl.bindBuffer(gl.ARRAY_BUFFER, meshCache.vbo);

        // Position attribute: 3 floats (x, y, z) at offset 0
        var posLoc = shaderManager.getAttribute('aPosition');
        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, meshCache.stride * 8, 0);
        }

        // Normal attribute: 3 floats (nx, ny, nz) at offset 3
        var normLoc = shaderManager.getAttribute('aNormal');
        if (normLoc >= 0) {
            gl.enableVertexAttribArray(normLoc);
            gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, meshCache.stride * 8, 3 * meshCache.stride);
        }

        // UV attribute: 2 floats (u, v) at offset 6
        var uvLoc = shaderManager.getAttribute('aUV');
        if (uvLoc >= 0) {
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, meshCache.stride * 8, 6 * meshCache.stride);
        }

        return true;
    };

    /**
     * _drawMesh — Issue a draw call for a cached mesh with world transform and color.
     * Computes the model matrix, sets shader uniforms (uModel, uColor), binds attributes,
     * and issues the indexed draw call.
     * @private
     * @param {Object} meshCache - Cached mesh data (vbo, ibo, vertexCount).
     * @param {number} px - World X position.
     * @param {number} py - World Y position.
     * @param {number} pz - World Z position.
     * @param {number} rx - Rotation X in radians.
     * @param {number} ry - Rotation Y in radians.
     * @param {number} rz - Rotation Z in radians.
     * @param {string} color - Hex color string (e.g., '#8B4513').
     * @returns {boolean} True if the draw call was issued successfully.
     */
    Donkeycraft.EntityRenderer.prototype._drawMesh = function (meshCache, px, py, pz, rx, ry, rz, color) {
        var gl = this._gl;
        var shaderManager = this._shaderManager;
        if (!gl || !meshCache || !shaderManager) return false;

        // Parse hex color to normalized RGB
        var rgb = this._parseHexColor(color);

        // Build model matrix from position and rotation
        var modelMatrix = this._buildModelMatrix(px, py, pz, rx, ry, rz);

        // Bind vertex attributes for the mesh
        if (!this._bindMeshAttributes(meshCache, shaderManager)) {
            return false;
        }

        // Set model matrix uniform (uModel)
        shaderManager.setMat4('uModel', { getData: function () { return modelMatrix; } });

        // Set flat color uniform (uColor) — overrides texture shading for entities
        shaderManager.setVec3('uColor', rgb.r, rgb.g, rgb.b);

        // Bind index buffer and draw
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshCache.ibo);
        gl.drawElements(gl.TRIANGLES, meshCache.vertexCount, gl.UNSIGNED_SHORT, 0);

        // Check for WebGL draw errors
        var err = gl.getError();
        if (err !== gl.NO_ERROR) {
            Donkeycraft.Logger.warn('EntityRenderer', 'WebGL draw error: ' + err.toString(16));
            return false;
        }

        this.drawCalls++;
        return true;
    };

    /**
     * _isEntityInFrustum — Check if an entity is within the camera's view frustum.
     *
     * Uses two culling tests:
     * 1. Distance check: Entity must be within render distance squared
     * 2. Forward-facing check: Dot product of (entityDir, cameraForward) must exceed threshold
     *    to ensure entities behind or perpendicular to the camera are culled.
     *
     * @private
     * @param {Donkeycraft.Entity} entity - Entity to check.
     * @returns {boolean} True if entity is potentially visible in the frustum.
     */
    Donkeycraft.EntityRenderer.prototype._isEntityInFrustum = function (entity) {
        if (!this._camera || !this._camera.getPosition) return true;

        var camPos = this._camera.getPosition();
        if (!camPos) return true;

        var entPos = entity.getPosition();
        if (!entPos) return false;

        // Distance-based culling
        var dx = entPos.x - camPos.x;
        var dy = entPos.y - camPos.y;
        var dz = entPos.z - camPos.z;
        var distSq = dx * dx + dy * dy + dz * dz;
        var renderDistSq = this.renderDistance * this.renderDistance;

        if (distSq > renderDistSq) return false;

        // Forward-facing check: cull entities behind the camera
        var forward = this._camera.getForwardDirection && this._camera.getForwardDirection();
        if (forward) {
            // Normalize direction vector
            var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len > 0.001) {
                var dot = (dx * forward.x + dy * forward.y + dz * forward.z) / len;
                if (dot < FRUSTUM_FORWARD_THRESHOLD) return false;
            }
        }

        return true;
    };

    /**
     * _sortEntitiesByDistance — Sort entity IDs by distance from camera (far to near).
     * Far-to-near sorting ensures transparent entities render correctly and distant
     * entities are drawn first for better depth buffer coverage.
     * @private
     * @param {Array<number>} entityIds - Array of entity IDs to sort.
     * @returns {Array<{id: number, distSq: number}>} Sorted array (far to near).
     */
    Donkeycraft.EntityRenderer.prototype._sortEntitiesByDistance = function (entityIds) {
        if (!this._camera || !this._camera.getPosition) {
            return entityIds.map(function (id) { return { id: id, distSq: 0 }; });
        }

        var camPos = this._camera.getPosition();
        if (!camPos) {
            return entityIds.map(function (id) { return { id: id, distSq: 0 }; });
        }

        var result = [];
        for (var i = 0; i < entityIds.length; i++) {
            var entity = this._entityManager.getEntity(entityIds[i]);
            if (!entity || !entity.isAlive()) continue;

            var pos = entity.getPosition();
            if (!pos) continue;

            var dx = pos.x - camPos.x;
            var dy = pos.y - camPos.y;
            var dz = pos.z - camPos.z;
            var distSq = dx * dx + dy * dy + dz * dz;

            result.push({ id: entityIds[i], distSq: distSq });
        }

        // Sort far to near (descending distance)
        result.sort(function (a, b) { return b.distSq - a.distSq; });

        return result;
    };

    /**
     * render — Render all visible entities using awareness-based culling.
     *
     * Renders NEAR-tier entities with full animation, FAR-tier with simplified rendering.
     * Entities are sorted by distance and frustum-culled before drawing.
     *
     * Prerequisites:
     * - EntityManager must be set via setEntityManager()
     * - Camera must be set via setCamera() for frustum culling
     * - Shader programs ('terrain') must be compiled in the ShaderManager
     *
     * @param {Object} [options] - Render options.
     * @param {boolean} [options.renderNear=true] - Render NEAR tier entities.
     * @param {boolean} [options.renderFar=true] - Render FAR tier entities.
     */
    Donkeycraft.EntityRenderer.prototype.render = function (options) {
        if (!this.enabled || !this._gl || !this._entityManager) return;

        var gl = this._gl;
        var shaderManager = this._shaderManager;
        var opts = options || {};

        // Reset per-frame statistics
        this.entitiesRendered = 0;
        this.drawCalls = 0;

        // Enable depth testing and face culling for correct rendering
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        // Activate terrain shader for entity rendering
        if (shaderManager) {
            shaderManager.use('terrain');
        }

        // Get entities to render based on awareness tier
        var nearIds = opts.renderNear !== false ? this._entityManager.getNearEntities() : [];
        var farIds = opts.renderFar !== false ? this._entityManager.getFarEntities() : [];

        // Combine entity IDs from both tiers
        var allIds = [];
        var maxEntities = this.maxRenderEntities;

        for (var i = 0; i < nearIds.length && allIds.length < maxEntities; i++) {
            allIds.push(nearIds[i]);
        }
        for (var j = 0; j < farIds.length && allIds.length < maxEntities; j++) {
            allIds.push(farIds[j]);
        }

        // Sort by distance from camera (far to near)
        var sorted = this._sortEntitiesByDistance(allIds);

        // Limit to max entities
        var renderList = sorted.slice(0, maxEntities);

        // Render each entity
        for (var k = 0; k < renderList.length; k++) {
            var entData = renderList[k];
            var entity = this._entityManager.getEntity(entData.id);

            if (!entity || !entity.isAlive()) continue;

            // Frustum culling
            if (!this._isEntityInFrustum(entity)) continue;

            // Get entity shape definitions for this entity type
            var shapeDefs = Donkeycraft.EntityShapeDefs[entity.type];
            if (!shapeDefs) {
                // Fallback: use a generic box for unknown entity types
                shapeDefs = [{
                    name: 'body',
                    meshType: 'box',
                    dimensions: { w: entity.width || 0.6, h: entity.height || 1.8, d: entity.width || 0.6 },
                    color: '#FF00FF' // Magenta = unknown type
                }];
            }

            // Get bone transforms from animation controller (if available)
            var boneTransforms = entity.getBoneTransforms ? entity.getBoneTransforms() : {};

            // Render each body part mesh
            for (var m = 0; m < shapeDefs.length; m++) {
                var shapeDef = shapeDefs[m];

                // Get or build mesh cache for this body part
                var meshCache = this._getOrBuildMesh(shapeDef);
                if (!meshCache) continue;

                // Compute bone world-space transform (position + rotation)
                var worldTransform = this._computeBoneWorldTransform(entity, shapeDef.name, boneTransforms);

                // Draw the mesh part with bone transform and color
                var success = this._drawMesh(
                    meshCache,
                    worldTransform.x,
                    worldTransform.y,
                    worldTransform.z,
                    worldTransform.rx,
                    worldTransform.ry,
                    worldTransform.rz,
                    shapeDef.color
                );

                if (success) {
                    this.entitiesRendered++;
                }
            }
        }
    };

    /**
     * renderEntity — Render a single entity (for debugging/specific targeting).
     * Useful for rendering a specific entity without going through the full batch pipeline.
     * @param {Donkeycraft.Entity} entity - Entity to render.
     */
    Donkeycraft.EntityRenderer.prototype.renderEntity = function (entity) {
        if (!this._gl || !entity || !entity.isAlive()) return;

        var gl = this._gl;
        var shaderManager = this._shaderManager;

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        // Activate terrain shader
        if (shaderManager) {
            shaderManager.use('terrain');
        }

        // Get shape definitions for this entity type
        var shapeDefs = Donkeycraft.EntityShapeDefs[entity.type];
        if (!shapeDefs) {
            shapeDefs = [{
                name: 'body',
                meshType: 'box',
                dimensions: { w: entity.width || 0.6, h: entity.height || 1.8, d: entity.width || 0.6 },
                color: '#FF00FF'
            }];
        }

        // Get bone transforms from animation controller
        var boneTransforms = entity.getBoneTransforms ? entity.getBoneTransforms() : {};

        // Render each body part
        var renderedParts = 0;
        for (var i = 0; i < shapeDefs.length; i++) {
            var shapeDef = shapeDefs[i];
            var meshCache = this._getOrBuildMesh(shapeDef);
            if (!meshCache) continue;

            var worldTransform = this._computeBoneWorldTransform(entity, shapeDef.name, boneTransforms);

            var success = this._drawMesh(
                meshCache,
                worldTransform.x,
                worldTransform.y,
                worldTransform.z,
                worldTransform.rx,
                worldTransform.ry,
                worldTransform.rz,
                shapeDef.color
            );

            if (success) renderedParts++;
        }

        this.entitiesRendered = renderedParts;
        this.drawCalls = renderedParts;
    };

    /**
     * clearMeshCache — Clear all cached mesh buffers (for context restoration/recovery).
     * Deletes all VBOs and IBOs from WebGL and resets the cache.
     */
    Donkeycraft.EntityRenderer.prototype.clearMeshCache = function () {
        if (!this._gl) return;

        var gl = this._gl;
        for (var key in this._meshCache) {
            if (this._meshCache.hasOwnProperty(key)) {
                var cache = this._meshCache[key];
                if (cache.vbo) gl.deleteBuffer(cache.vbo);
                if (cache.ibo) gl.deleteBuffer(cache.ibo);
            }
        }
        this._meshCache = {};
    };

    /**
     * destroy — Clean up all GPU resources and release references.
     * Call this when the renderer is no longer needed to prevent memory leaks.
     */
    Donkeycraft.EntityRenderer.prototype.destroy = function () {
        this.clearMeshCache();
        this._entityManager = null;
        this._camera = null;
        this._shaderManager = null;
        this._modelMatrix = null;
    };

    /**
     * getStats — Get renderer statistics since the last render call.
     * @returns {{entitiesRendered: number, drawCalls: number, cachedMeshes: number}}
     *   - entitiesRendered: Number of body parts successfully rendered last frame
     *   - drawCalls: Number of gl.drawElements calls made last frame
     *   - cachedMeshes: Total number of unique mesh definitions currently cached
     */
    Donkeycraft.EntityRenderer.prototype.getStats = function () {
        return {
            entitiesRendered: this.entitiesRendered,
            drawCalls: this.drawCalls,
            cachedMeshes: Object.keys(this._meshCache).length
        };
    };

})();