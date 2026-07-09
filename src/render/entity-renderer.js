// Donkeycraft — Entity Renderer
// Standalone robust renderer for all entities using WebGL 1.0.
// Tightly integrated with EntityManager's awareness tracking and culling system.
// Renders animated entities with bone transforms using per-mesh draw calls.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  if (!Donkeycraft) return;

  // Logger fallback for standalone usage (e.g., inv.html).
  if (!Donkeycraft.Logger) {
    Donkeycraft.Logger = {
      debug: function () {},
      info: function () {},
      warn: function () {},
      error: function () {},
    };
  }

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
   * entities that are within range but behind or to the side of the camera view.
   * The dot product of (entityDirection, cameraForward) ranges from -1 (directly behind)
   * to 1 (directly in front). A value of 0.0 means perpendicular to camera (90° to side),
   * while 0.1 corresponds to approximately 84° from the camera's forward direction.
   * Entities with a dot product below this threshold are culled (i.e., outside a ~168°
   * total viewing cone centered on the camera's forward direction).
   * @constant {number}
   * @default 0.1
   */
  var FRUSTUM_FORWARD_THRESHOLD = 0.1;

  /**
   * Minimum distance for normalization in frustum culling — entities closer than this
   * are not subject to forward-facing check to avoid division by near-zero.
   * @constant {number}
   * @default 0.001
   */
  var FRUSTUM_MIN_DISTANCE = 0.001;

  /**
   * Bytes per float in WebGL.
   * @constant {number}
   * @default 4
   */
  var BYTES_PER_FLOAT = 4;

  /**
   * Vertex byte stride — total bytes per vertex including all components.
   * Computed from position (3) + normal (3) + UV (2) = 8 floats × 4 bytes = 32 bytes.
   * Entity shader uses flat color rendering — UV attributes are present in mesh data
   * but not bound/used by the entity shader program.
   * @constant {number}
   * @default 32
   */
  var VERTEX_BYTE_STRIDE = 8 * BYTES_PER_FLOAT;

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
  Donkeycraft.EntityMeshBuilder.createBoxMesh = function (
    width,
    height,
    depth
  ) {
    var hw = width / 2;
    var hh = height / 2;
    var hd = depth / 2;

    var vertices = new Float32Array([
      // Front face (z = +hd), normal = (0, 0, 1)
      -hw,
      -hh,
      hd,
      0,
      0,
      1,
      0,
      0,
      hw,
      -hh,
      hd,
      0,
      0,
      1,
      1,
      0,
      hw,
      hh,
      hd,
      0,
      0,
      1,
      1,
      1,
      -hw,
      hh,
      hd,
      0,
      0,
      1,
      0,
      1,

      // Back face (z = -hd), normal = (0, 0, -1)
      hw,
      -hh,
      -hd,
      0,
      0,
      -1,
      0,
      0,
      -hw,
      -hh,
      -hd,
      0,
      0,
      -1,
      1,
      0,
      -hw,
      hh,
      -hd,
      0,
      0,
      -1,
      1,
      1,
      hw,
      hh,
      -hd,
      0,
      0,
      -1,
      0,
      1,

      // Top face (y = +hh), normal = (0, 1, 0)
      -hw,
      hh,
      hd,
      0,
      1,
      0,
      0,
      0,
      hw,
      hh,
      hd,
      0,
      1,
      0,
      1,
      0,
      hw,
      hh,
      -hd,
      0,
      1,
      0,
      1,
      1,
      -hw,
      hh,
      -hd,
      0,
      1,
      0,
      0,
      1,

      // Bottom face (y = -hh), normal = (0, -1, 0)
      -hw,
      -hh,
      -hd,
      0,
      -1,
      0,
      0,
      0,
      hw,
      -hh,
      -hd,
      0,
      -1,
      0,
      1,
      0,
      hw,
      -hh,
      hd,
      0,
      -1,
      0,
      1,
      1,
      -hw,
      -hh,
      hd,
      0,
      -1,
      0,
      0,
      1,

      // Right face (x = +hw), normal = (1, 0, 0)
      hw,
      -hh,
      hd,
      1,
      0,
      0,
      0,
      0,
      hw,
      -hh,
      -hd,
      1,
      0,
      0,
      1,
      0,
      hw,
      hh,
      -hd,
      1,
      0,
      0,
      1,
      1,
      hw,
      hh,
      hd,
      1,
      0,
      0,
      0,
      1,

      // Left face (x = -hw), normal = (-1, 0, 0)
      -hw,
      -hh,
      -hd,
      -1,
      0,
      0,
      0,
      0,
      -hw,
      -hh,
      hd,
      -1,
      0,
      0,
      1,
      0,
      -hw,
      hh,
      hd,
      -1,
      0,
      0,
      1,
      1,
      -hw,
      hh,
      -hd,
      -1,
      0,
      0,
      0,
      1,
    ]);

    var indices = new Uint16Array([
      0,
      1,
      2,
      0,
      2,
      3, // Front (z+)
      4,
      5,
      6,
      4,
      6,
      7, // Back (z-)
      8,
      9,
      10,
      8,
      10,
      11, // Top (y+)
      12,
      13,
      14,
      12,
      14,
      15, // Bottom (y-)
      16,
      17,
      18,
      16,
      18,
      19, // Right (x+)
      20,
      21,
      22,
      20,
      22,
      23, // Left (x-)
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
  Donkeycraft.EntityMeshBuilder.createCylinderMesh = function (
    radius,
    height,
    segments
  ) {
    segments = segments != null ? segments : 8;
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
      vertices.push(
        cos2 * radius,
        -hh,
        sin2 * radius,
        0,
        -1,
        0,
        j / segments,
        0
      );
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
      indices.push(
        bottomCenterIdx2,
        bottomStartIdx + n + 1,
        bottomStartIdx + n
      );
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
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
   * - offset: (optional) Bone offset relative to entity origin {x, y, z}
   * - pivot: (optional) Rotation pivot point for the bone {x, y, z}. When provided,
   *   rotations occur around this point rather than the mesh center.
   *
   * @type {Object.<string, Array<{name: string, meshType: string, dimensions: Object, color: string, offset?: {x:number,y:number,z:number}, pivot?: {x:number,y:number,z:number}}>}
   */
  Donkeycraft.EntityShapeDefs = {
    cow: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 1.4, h: 1.0, d: 0.7 },
        color: '#8B4513',
        offset: { x: 0, y: 0.5, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.5, h: 0.5, d: 0.5 },
        color: '#A0522D',
        offset: { x: 0, y: 1.0, z: 0.7 },
      },
      {
        name: 'frontLeftLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.1, h: 0.7 },
        color: '#8B4513',
        offset: { x: -0.4, y: 0.35, z: 0.3 },
        pivot: { x: 0, y: 0.35, z: 0 },
      },
      {
        name: 'frontRightLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.1, h: 0.7 },
        color: '#8B4513',
        offset: { x: 0.4, y: 0.35, z: 0.3 },
        pivot: { x: 0, y: 0.35, z: 0 },
      },
      {
        name: 'rearLeftLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.1, h: 0.7 },
        color: '#8B4513',
        offset: { x: -0.4, y: 0.35, z: -0.3 },
        pivot: { x: 0, y: 0.35, z: 0 },
      },
      {
        name: 'rearRightLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.1, h: 0.7 },
        color: '#8B4513',
        offset: { x: 0.4, y: 0.35, z: -0.3 },
        pivot: { x: 0, y: 0.35, z: 0 },
      },
    ],
    pig: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 0.9, h: 0.6, d: 0.5 },
        color: '#FFC0CB',
        offset: { x: 0, y: 0.3, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.35, h: 0.35, d: 0.4 },
        color: '#FFB6C1',
        offset: { x: 0, y: 0.55, z: 0.5 },
      },
      {
        name: 'frontLeftLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.08, h: 0.5 },
        color: '#FFC0CB',
        offset: { x: -0.25, y: 0.25, z: 0.2 },
        pivot: { x: 0, y: 0.25, z: 0 },
      },
      {
        name: 'frontRightLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.08, h: 0.5 },
        color: '#FFC0CB',
        offset: { x: 0.25, y: 0.25, z: 0.2 },
        pivot: { x: 0, y: 0.25, z: 0 },
      },
      {
        name: 'rearLeftLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.08, h: 0.5 },
        color: '#FFC0CB',
        offset: { x: -0.25, y: 0.25, z: -0.2 },
        pivot: { x: 0, y: 0.25, z: 0 },
      },
      {
        name: 'rearRightLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.08, h: 0.5 },
        color: '#FFC0CB',
        offset: { x: 0.25, y: 0.25, z: -0.2 },
        pivot: { x: 0, y: 0.25, z: 0 },
      },
    ],
    donkey: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 1.0, h: 1.2, d: 0.5 },
        color: '#808080',
        offset: { x: 0, y: 0.6, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.4, h: 0.6, d: 0.35 },
        color: '#A9A9A9',
        offset: { x: 0, y: 1.3, z: 0.5 },
      },
      {
        name: 'frontLeftLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.1, h: 0.8 },
        color: '#696969',
        offset: { x: -0.3, y: 0.4, z: 0.25 },
        pivot: { x: 0, y: 0.8, z: 0 },
      },
      {
        name: 'frontRightLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.1, h: 0.8 },
        color: '#696969',
        offset: { x: 0.3, y: 0.4, z: 0.25 },
        pivot: { x: 0, y: 0.8, z: 0 },
      },
      {
        name: 'rearLeftLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.1, h: 0.8 },
        color: '#696969',
        offset: { x: -0.3, y: 0.4, z: -0.25 },
        pivot: { x: 0, y: 0.8, z: 0 },
      },
      {
        name: 'rearRightLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.1, h: 0.8 },
        color: '#696969',
        offset: { x: 0.3, y: 0.4, z: -0.25 },
        pivot: { x: 0, y: 0.8, z: 0 },
      },
    ],
    chicken: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 0.4, h: 0.35, d: 0.3 },
        color: '#FFFFFF',
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.2, h: 0.2, d: 0.2 },
        color: '#FF0000',
      },
    ],
    zombie: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 0.6, h: 0.9, d: 0.3 },
        color: '#4B0082',
        offset: { x: 0, y: 0.85, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.5, h: 0.5, d: 0.5 },
        color: '#228B22',
        offset: { x: 0, y: 1.55, z: 0 },
      },
      {
        name: 'leftArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.8, d: 0.25 },
        color: '#228B22',
        offset: { x: -0.42, y: 0.9, z: 0 },
        pivot: { x: 0, y: 0.4, z: 0 },
      },
      {
        name: 'rightArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.8, d: 0.25 },
        color: '#228B22',
        offset: { x: 0.42, y: 0.9, z: 0 },
        pivot: { x: 0, y: 0.4, z: 0 },
      },
      {
        name: 'leftLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.9, d: 0.25 },
        color: '#000080',
        offset: { x: -0.15, y: 0.45, z: 0 },
        pivot: { x: 0, y: 0.45, z: 0 },
      },
      {
        name: 'rightLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.9, d: 0.25 },
        color: '#000080',
        offset: { x: 0.15, y: 0.45, z: 0 },
        pivot: { x: 0, y: 0.45, z: 0 },
      },
    ],
    skeleton: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 0.5, h: 0.8, d: 0.25 },
        color: '#F5F5DC',
        offset: { x: 0, y: 0.8, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.45, h: 0.45, d: 0.45 },
        color: '#FAFAD2',
        offset: { x: 0, y: 1.45, z: 0 },
      },
      {
        name: 'leftArm',
        meshType: 'cylinder',
        dimensions: { r: 0.08, h: 0.7 },
        color: '#F5F5DC',
        offset: { x: -0.35, y: 0.85, z: 0 },
        pivot: { x: 0, y: 0.35, z: 0 },
      },
      {
        name: 'rightArm',
        meshType: 'cylinder',
        dimensions: { r: 0.08, h: 0.7 },
        color: '#F5F5DC',
        offset: { x: 0.35, y: 0.85, z: 0 },
        pivot: { x: 0, y: 0.35, z: 0 },
      },
      {
        name: 'leftLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.08, h: 0.8 },
        color: '#F5F5DC',
        offset: { x: -0.12, y: 0.4, z: 0 },
        pivot: { x: 0, y: 0.4, z: 0 },
      },
      {
        name: 'rightLeg',
        meshType: 'cylinder',
        dimensions: { r: 0.08, h: 0.8 },
        color: '#F5F5DC',
        offset: { x: 0.12, y: 0.4, z: 0 },
        pivot: { x: 0, y: 0.4, z: 0 },
      },
    ],
    creeper: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 0.6, h: 1.0, d: 0.3 },
        color: '#00FF00',
        offset: { x: 0, y: 0.85, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.5, h: 0.5, d: 0.5 },
        color: '#00CC00',
        offset: { x: 0, y: 1.6, z: 0 },
      },
      {
        name: 'leftArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.8, d: 0.25 },
        color: '#00FF00',
        offset: { x: -0.42, y: 0.9, z: 0 },
        pivot: { x: 0, y: 0.4, z: 0 },
      },
      {
        name: 'rightArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.8, d: 0.25 },
        color: '#00FF00',
        offset: { x: 0.42, y: 0.9, z: 0 },
        pivot: { x: 0, y: 0.4, z: 0 },
      },
      {
        name: 'leftLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.9, d: 0.25 },
        color: '#00FF00',
        offset: { x: -0.15, y: 0.45, z: 0 },
        pivot: { x: 0, y: 0.45, z: 0 },
      },
      {
        name: 'rightLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.9, d: 0.25 },
        color: '#00FF00',
        offset: { x: 0.15, y: 0.45, z: 0 },
        pivot: { x: 0, y: 0.45, z: 0 },
      },
    ],
    spider: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 1.4, h: 0.8, d: 1.0 },
        color: '#2F4F4F',
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.5, h: 0.4, d: 0.5 },
        color: '#000000',
      },
    ],
    enderman: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 0.6, h: 1.4, d: 0.3 },
        color: '#000000',
        offset: { x: 0, y: 1.0, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.5, h: 0.5, d: 0.5 },
        color: '#000000',
        offset: { x: 0, y: 1.95, z: 0 },
      },
      {
        name: 'leftArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 1.0, d: 0.25 },
        color: '#000000',
        offset: { x: -0.42, y: 1.05, z: 0 },
        pivot: { x: 0, y: 0.5, z: 0 },
      },
      {
        name: 'rightArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 1.0, d: 0.25 },
        color: '#000000',
        offset: { x: 0.42, y: 1.05, z: 0 },
        pivot: { x: 0, y: 0.5, z: 0 },
      },
      {
        name: 'leftLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 1.2, d: 0.25 },
        color: '#000000',
        offset: { x: -0.15, y: 0.6, z: 0 },
        pivot: { x: 0, y: 0.6, z: 0 },
      },
      {
        name: 'rightLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 1.2, d: 0.25 },
        color: '#000000',
        offset: { x: 0.15, y: 0.6, z: 0 },
        pivot: { x: 0, y: 0.6, z: 0 },
      },
    ],
    player: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 0.6, h: 0.9, d: 0.3 },
        color: '#3366CC',
        offset: { x: 0, y: 0.85, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.5, h: 0.5, d: 0.5 },
        color: '#FFCC99',
        offset: { x: 0, y: 1.55, z: 0 },
      },
      {
        name: 'leftEye',
        meshType: 'box',
        dimensions: { w: 0.08, h: 0.06, d: 0.08 },
        color: '#1a1a2e',
        offset: { x: -0.12, y: 1.65, z: 0.24 },
        parent: 'head',
      },
      {
        name: 'rightEye',
        meshType: 'box',
        dimensions: { w: 0.08, h: 0.06, d: 0.08 },
        color: '#1a1a2e',
        offset: { x: 0.12, y: 1.65, z: 0.24 },
        parent: 'head',
      },
      {
        name: 'hair',
        meshType: 'box',
        dimensions: { w: 0.54, h: 0.18, d: 0.52 },
        color: '#4a3728',
        offset: { x: 0, y: 1.82, z: -0.02 },
        parent: 'head',
      },
      {
        name: 'leftArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.8, d: 0.25 },
        color: '#FFCC99',
        offset: { x: -0.42, y: 1.15, z: 0 },
        pivot: { x: -0.42, y: 1.25, z: 0 },
      },
      {
        name: 'rightArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.8, d: 0.25 },
        color: '#FFCC99',
        offset: { x: 0.42, y: 1.15, z: 0 },
        pivot: { x: 0.42, y: 1.25, z: 0 },
      },
      {
        name: 'leftLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.9, d: 0.25 },
        color: '#3366CC',
        offset: { x: -0.15, y: 0.45, z: 0 },
        pivot: { x: -0.15, y: 0.45, z: 0 },
      },
      {
        name: 'rightLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.9, d: 0.25 },
        color: '#3366CC',
        offset: { x: 0.15, y: 0.45, z: 0 },
        pivot: { x: 0.15, y: 0.45, z: 0 },
      },
    ],
    npc: [
      {
        name: 'body',
        meshType: 'box',
        dimensions: { w: 0.6, h: 0.9, d: 0.3 },
        color: '#8B0000',
        offset: { x: 0, y: 0.85, z: 0 },
      },
      {
        name: 'head',
        meshType: 'box',
        dimensions: { w: 0.5, h: 0.5, d: 0.5 },
        color: '#FFCC99',
        offset: { x: 0, y: 1.55, z: 0 },
      },
      {
        name: 'leftEye',
        meshType: 'box',
        dimensions: { w: 0.08, h: 0.06, d: 0.08 },
        color: '#1a1a2e',
        offset: { x: -0.12, y: 1.65, z: 0.24 },
        parent: 'head',
      },
      {
        name: 'rightEye',
        meshType: 'box',
        dimensions: { w: 0.08, h: 0.06, d: 0.08 },
        color: '#1a1a2e',
        offset: { x: 0.12, y: 1.65, z: 0.24 },
        parent: 'head',
      },
      {
        name: 'hair',
        meshType: 'box',
        dimensions: { w: 0.54, h: 0.18, d: 0.52 },
        color: '#2c1810',
        offset: { x: 0, y: 1.82, z: -0.02 },
        parent: 'head',
      },
      {
        name: 'leftArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.8, d: 0.25 },
        color: '#FFCC99',
        offset: { x: -0.42, y: 1.15, z: 0 },
        pivot: { x: -0.42, y: 1.25, z: 0 },
      },
      {
        name: 'rightArm',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.8, d: 0.25 },
        color: '#FFCC99',
        offset: { x: 0.42, y: 1.15, z: 0 },
        pivot: { x: 0.42, y: 1.25, z: 0 },
      },
      {
        name: 'leftLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.9, d: 0.25 },
        color: '#8B0000',
        offset: { x: -0.15, y: 0.45, z: 0 },
        pivot: { x: -0.15, y: 0.45, z: 0 },
      },
      {
        name: 'rightLeg',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.9, d: 0.25 },
        color: '#8B0000',
        offset: { x: 0.15, y: 0.45, z: 0 },
        pivot: { x: 0.15, y: 0.45, z: 0 },
      },
    ],
    door: [
      {
        name: 'doorPanel',
        meshType: 'box',
        dimensions: { w: 0.75, h: 1.8, d: 0.1 },
        color: '#8B4513',
      },
    ],
    sign_post: [
      {
        name: 'post',
        meshType: 'cylinder',
        dimensions: { r: 0.05, h: 1.0 },
        color: '#8B4513',
      },
      {
        name: 'sign',
        meshType: 'box',
        dimensions: { w: 0.8, h: 0.4, d: 0.05 },
        color: '#A0522D',
      },
    ],
    chest: [
      {
        name: 'chest',
        meshType: 'box',
        dimensions: { w: 0.98, h: 0.875, d: 0.98 },
        color: '#8B6914',
      },
    ],
    furnace: [
      {
        name: 'furnace',
        meshType: 'box',
        dimensions: { w: 0.98, h: 1.0, d: 0.98 },
        color: '#696969',
      },
    ],
    arrow: [
      {
        name: 'shaft',
        meshType: 'cylinder',
        dimensions: { r: 0.01, h: 0.8 },
        color: '#8B4513',
      },
      {
        name: 'tip',
        meshType: 'box',
        dimensions: { w: 0.04, h: 0.06, d: 0.04 },
        color: '#C0C0C0',
      },
    ],
    snowball: [
      {
        name: 'sphere',
        meshType: 'box',
        dimensions: { w: 0.25, h: 0.25, d: 0.25 },
        color: '#FFFFFF',
      },
    ],
  };

  /**
   * _toArray — Convert an iterable (Array, Set, Map, or other list-like object)
   * to a plain Array. This ensures compatibility with EntityManager implementations
   * that may return Sets or Maps from getNearEntities/getFarEntities.
   * @private
   * @param {*} iterable - Value to convert to an array.
   * @returns {Array} Plain array containing the same elements, or empty array if null/undefined.
   */
  function _toArray(iterable) {
    if (iterable == null) return [];
    if (Array.isArray(iterable)) return iterable;
    if (iterable instanceof Set) return Array.from(iterable);
    if (iterable instanceof Map) {
      var result = [];
      iterable.forEach(function (v) {
        result.push(v);
      });
      return result;
    }
    // Fallback: assume array-like (has length property).
    // Wrap in try-catch to guard against hostile objects with a getter
    // on 'length' that throws an exception.
    if (typeof iterable.length === 'number') {
      try {
        return Array.prototype.slice.call(iterable);
      } catch (e) {
        // If slice fails, fall through to empty array.
        return [];
      }
    }
    return [];
  }

  /**
   * _normalizeMeshKey — Generate a robust cache key from mesh type and dimensions.
   * Rounds floating-point values to 4 decimal places to avoid precision-based cache misses
   * while preserving visually significant differences in mesh dimensions (0.0001 resolution).
   * Unknown mesh types include the full mesh type string prefixed with 'unknown:' to prevent
   * collisions between different unrecognized mesh types.
   * @private
   * @param {string} meshType - Mesh type ('box' or 'cylinder').
   * @param {Object} dimensions - Dimension properties (w/h/d for boxes, r/h for cylinders).
   * @returns {string} Normalized cache key string.
   */
  function _normalizeMeshKey(meshType, dimensions) {
    var round4 = function (v) {
      return Math.round(v * 10000) / 10000;
    };

    if (meshType === 'box') {
      var d = dimensions || {};
      return (
        'box:' +
        round4(d.w || 1) +
        ':' +
        round4(d.h || 1) +
        ':' +
        round4(d.d || 1)
      );
    } else if (meshType === 'cylinder') {
      var dim = dimensions || {};
      return 'cyl:' + round4(dim.r || 0.1) + ':' + round4(dim.h || 1);
    }
    // Prefix with 'unknown:' to prevent collisions between different unrecognized mesh types.
    return 'unknown:' + meshType;
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
   * @constructor
   * @param {WebGLRenderingContext} gl - WebGL 1.0 context.
   * @param {Object} shaderManager - ShaderManager instance with compiled shaders and uniform setters.
   */
  Donkeycraft.EntityRenderer = function (gl, shaderManager) {
    this._gl = gl || null;
    this._shaderManager = shaderManager || null;
    this._entityManager = null;
    this._camera = null;
    this._meshCache = {};
    this.enabled = true;
    this.maxRenderEntities = DEFAULT_MAX_RENDER_ENTITIES;
    this.renderDistance = DEFAULT_RENDER_DISTANCE;
    this.enableAlphaBlending = false;

    // Set up WebGL context loss handling immediately after construction.
    this._setupContextLossListener();
  };

  /**
   * setGL — Set the WebGL rendering context (alternative to constructor injection).
   * @param {WebGLRenderingContext} gl - WebGL 1.0 context.
   */
  Donkeycraft.EntityRenderer.prototype.setGL = function (gl) {
    this._gl = gl || null;
  };

  /**
   * setShaderManager — Set the shader manager reference.
   * @param {Object} shaderManager - ShaderManager instance.
   */
  Donkeycraft.EntityRenderer.prototype.setShaderManager = function (
    shaderManager
  ) {
    this._shaderManager = shaderManager || null;
  };

  /**
   * setEntityManager — Set the entity manager reference for awareness queries.
   * @param {Donkeycraft.EntityManager} entityManager - EntityManager instance.
   */
  Donkeycraft.EntityRenderer.prototype.setEntityManager = function (
    entityManager
  ) {
    this._entityManager = entityManager || null;
  };

  /**
   * setCamera — Set the camera reference for frustum culling.
   *
   * The camera object must provide the following methods:
   * - getPosition() → {x: number, y: number, z: number} or null
   * - getForwardDirection() → {x: number, y: number, z: number} or null (normalized forward vector)
   *
   * For accurate AABB frustum culling (Stage 3), the camera should also provide:
   * - getViewMatrix() → { getData(): Float32Array(16) } (column-major view matrix)
   * - getProjectionMatrix() → { getData(): Float32Array(16) } (column-major projection matrix)
   *
   * If view/projection matrices are unavailable, a simplified cone-based fallback
   * is used for frustum culling which is less accurate but still functional.
   *
   * @param {Object} camera - Camera instance.
   */
  Donkeycraft.EntityRenderer.prototype.setCamera = function (camera) {
    this._camera = camera || null;
  };

  /**
   * setRenderDistance — Set the entity render distance in blocks.
   * The value is clamped to the valid range [4, 64] blocks.
   * @param {number} distance - Render distance in blocks (clamped to [4, 64]).
   */
  Donkeycraft.EntityRenderer.prototype.setRenderDistance = function (distance) {
    this.renderDistance = Math.max(
      MIN_RENDER_DISTANCE,
      Math.min(MAX_RENDER_DISTANCE, distance)
    );
  };

  /**
   * _buildModelMatrix — Build a 4×4 model matrix from position and rotation.
   *
   * Creates an identity matrix, applies rotations in YXZ order (yaw → pitch → roll)
   * using Donkeycraft.Matrix4, then sets the translation component.
   *
   * When a pivot is provided, the translation is adjusted so that rotations occur
   * around the pivot point rather than the mesh center: T' = P - R × P.
   *
   * @param {number} px - World X position.
   * @param {number} py - World Y position.
   * @param {number} pz - World Z position.
   * @param {number} rx - Rotation around X axis in radians.
   * @param {number} ry - Rotation around Y axis in radians.
   * @param {number} rz - Rotation around Z axis in radians.
   * @param {Object} [pivot] - Optional pivot point {x, y, z} for rotation center.
   * @returns {Float32Array} New column-major 4×4 model matrix (16 elements).
   */
  Donkeycraft.EntityRenderer.prototype._buildModelMatrix = function (
    px,
    py,
    pz,
    rx,
    ry,
    rz,
    pivot
  ) {
    // Build rotation matrix using YXZ order (yaw → pitch → roll).
    var m = Donkeycraft.Matrix4.createIdentity();
    if (ry !== 0)
      m = Donkeycraft.Matrix4.multiply(
        m,
        Donkeycraft.Matrix4.createRotation(ry, new Donkeycraft.Vector3(0, 1, 0))
      );
    if (rx !== 0)
      m = Donkeycraft.Matrix4.multiply(
        m,
        Donkeycraft.Matrix4.createRotation(rx, new Donkeycraft.Vector3(1, 0, 0))
      );
    if (rz !== 0)
      m = Donkeycraft.Matrix4.multiply(
        m,
        Donkeycraft.Matrix4.createRotation(rz, new Donkeycraft.Vector3(0, 0, 1))
      );

    // Adjust translation for pivot-based rotation: T' = P - R × P.
    var tx = px,
      ty = py,
      tz = pz;
    if (pivot) {
      var pxv = pivot.x || 0,
        pyv = pivot.y || 0,
        pzv = pivot.z || 0;
      // R × P for rotation-only matrix (translation components 12-14 are zero).
      tx = px - (m._data[0] * pxv + m._data[1] * pyv + m._data[2] * pzv);
      ty = py - (m._data[4] * pxv + m._data[5] * pyv + m._data[6] * pzv);
      tz = pz - (m._data[8] * pxv + m._data[9] * pyv + m._data[10] * pzv);
    }

    // Set translation components directly.
    m._data[12] = tx;
    m._data[13] = ty;
    m._data[14] = tz;

    return m._data;
  };

  /**
   * _buildBoneHierarchy — Build a hierarchical bone transform map from root to leaves.
   *
   * Processes bones in topological order (root → children → grandchildren) so that each
   * child bone's world transform is computed relative to its parent's world transform.
   * This ensures correct skeletal animation where limb segments rotate around their joints.
   *
   * For parented bones (e.g., eyes/hair attached to head), the child inherits the parent's
   * final animation rotation so it stays visually attached and does not rotate independently.
   *
   * World transform = entityPos + yawRotation × (offset) for root bones
   * World transform = parentWorld + yawRotation × (childOffset - parentOffset) + parentAnimRot for children
   *
   * @param {Object} entity - Entity instance with getPosition(), getRotation(), getBones() methods.
   * @param {Object.<string, {rx: number, ry: number, rz: number}>} boneTransforms - Bone rotation transforms from animation controller.
   * @returns {Object.<string, {x: number, y: number, z: number, rx: number, ry: number, rz: number, pivot: Object|null}>} Bone world transforms keyed by bone name.
   */
  Donkeycraft.EntityRenderer.prototype._buildBoneHierarchy = function (
    entity,
    boneTransforms
  ) {
    var pos = entity.getPosition();
    if (!pos) return {};

    var rot = entity.getRotation();
    var bones = entity.getBones();
    if (!bones || !Array.isArray(bones)) return {};

    // Build a Map: boneName → boneDef for O(1) lookup.
    var boneMap = new Map();
    for (var bi = 0; bi < bones.length; bi++) {
      boneMap.set(bones[bi].name, bones[bi]);
    }

    // Separate root bones (no parent or parent not in skeleton) from child bones.
    var rootBones = [];
    var childBones = [];
    for (var j = 0; j < bones.length; j++) {
      var b = bones[j];
      if (b.parent && boneMap.has(b.parent)) {
        childBones.push(b);
      } else {
        rootBones.push(b);
      }
    }

    // World transform cache: boneName → {x, y, z, rx, ry, rz, pivot}.
    var worldTransforms = {};

    // Entity yaw: use a local variable to avoid cross-entity contamination.
    var entityYaw = rot ? rot.yaw : 0;

    /**
     * Apply YXZ rotation (yaw → pitch → roll) to a vector.
     * @param {number} vx - X component.
     * @param {number} vy - Y component.
     * @param {number} vz - Z component.
     * @param {number} rx - Pitch rotation in radians.
     * @param {number} ry - Yaw rotation in radians.
     * @param {number} rz - Roll rotation in radians.
     * @returns {{x: number, y: number, z: number}} Rotated vector.
     */
    function applyRotToVec(vx, vy, vz, rx, ry, rz) {
      // Y rotation (yaw)
      var x1 = vx * Math.cos(ry) - vz * Math.sin(ry);
      var z1 = vx * Math.sin(ry) + vz * Math.cos(ry);
      var y1 = vy;
      // X rotation (pitch)
      var y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx);
      var z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx);
      var x2 = x1;
      // Z rotation (roll)
      var x3 = x2 * Math.cos(rz) - y2 * Math.sin(rz);
      var y3 = x2 * Math.sin(rz) + y2 * Math.cos(rz);
      var z3 = z2;
      return { x: x3, y: y3, z: z3 };
    }

    /**
     * Compute world transform for a bone given its parent's world transform (or entity origin).
     * @param {Object} boneDef - Bone definition with offset, pivot, and optional parent.
     * @param {Object|null} parentWorld - Parent bone's world transform, or null for root bones.
     * @param {Object} boneAnim - Animation transform for this bone {rx, ry, rz}.
     * @returns {{x: number, y: number, z: number, rx: number, ry: number, rz: number, pivot: Object|null}} World transform.
     */
    function computeBoneWorld(boneDef, parentWorld, boneAnim) {
      // Skip if already computed (prevents infinite recursion).
      if (worldTransforms[boneDef.name]) return worldTransforms[boneDef.name];

      var offset = boneDef.offset || { x: 0, y: 0, z: 0 };
      var pivot = boneDef.pivot || null;

      if (!parentWorld) {
        // Root bone: transform is entity position + yaw-rotated bone offset.
        var cosYaw = Math.cos(entityYaw);
        var sinYaw = Math.sin(entityYaw);
        return {
          x: pos.x + (offset.x * cosYaw - offset.z * sinYaw),
          y: pos.y + offset.y,
          z: pos.z + (offset.x * sinYaw + offset.z * cosYaw),
          rx: 0,
          ry: 0,
          rz: 0,
          pivot: pivot,
        };
      }

      // Child bone: position is parent world + yaw-rotated relative offset.
      var px = parentWorld.x;
      var py = parentWorld.y;
      var pz = parentWorld.z;

      // Compute relative offset in entity-local space, then apply yaw rotation.
      var cosYaw2 = Math.cos(entityYaw);
      var sinYaw2 = Math.sin(entityYaw);
      var localOffsetX = offset.x * cosYaw2 - offset.z * sinYaw2;
      var localOffsetZ = offset.x * sinYaw2 + offset.z * cosYaw2;
      var localOffsetY = offset.y;

      // Apply parent's animation rotation to the relative offset.
      var rotated = applyRotToVec(
        localOffsetX,
        localOffsetY,
        localOffsetZ,
        parentWorld.rx || 0,
        parentWorld.ry || 0,
        parentWorld.rz || 0
      );

      // CRITICAL: Child bones inherit their parent's animation rotation exactly.
      // This ensures eyes/hair stay visually attached to the head and do not rotate independently.
      return {
        x: px + rotated.x,
        y: py + rotated.y,
        z: pz + rotated.z,
        rx: parentWorld.rx != null ? Number(parentWorld.rx) : 0,
        ry: parentWorld.ry != null ? Number(parentWorld.ry) : 0,
        rz: parentWorld.rz != null ? Number(parentWorld.rz) : 0,
        pivot: pivot,
      };
    }

    // Process root bones first (no parent).
    for (var k = 0; k < rootBones.length; k++) {
      var rb = rootBones[k];
      var boneAnim = boneTransforms[rb.name] || { rx: 0, ry: 0, rz: 0 };
      worldTransforms[rb.name] = computeBoneWorld(rb, null, boneAnim);
    }

    // Process child bones (topological order — parents already computed).
    for (var m = 0; m < childBones.length; m++) {
      var cb = childBones[m];
      var parentWorld = worldTransforms[cb.parent] || null;
      var boneAnim = boneTransforms[cb.name] || { rx: 0, ry: 0, rz: 0 };
      worldTransforms[cb.name] = computeBoneWorld(cb, parentWorld, boneAnim);
    }

    return worldTransforms;
  };

  /**
   * _getOrBuildMesh — Get a cached mesh or build a new one for the given shape definition.
   * Creates WebGL buffers from the mesh geometry and caches them for reuse.
   * @private
   * @param {Object} shapeDef - Shape definition with meshType and dimensions.
   * @returns {{vbo: WebGLBuffer, ibo: WebGLBuffer, vertexCount: number, vertexByteStride: number}|null} Mesh cache entry, or null on failure.
   */
  Donkeycraft.EntityRenderer.prototype._getOrBuildMesh = function (shapeDef) {
    if (!this._gl || this._contextLost) return null;

    var key = _normalizeMeshKey(shapeDef.meshType, shapeDef.dimensions);
    if (this._meshCache[key]) {
      return this._meshCache[key];
    }

    var gl = this._gl;
    var meshData = null;

    if (shapeDef.meshType === 'box') {
      var d = shapeDef.dimensions || {};
      meshData = Donkeycraft.EntityMeshBuilder.createBoxMesh(
        d.w || 1,
        d.h || 1,
        d.d || 1
      );
    } else if (shapeDef.meshType === 'cylinder') {
      var dim = shapeDef.dimensions || {};
      meshData = Donkeycraft.EntityMeshBuilder.createCylinderMesh(
        dim.r || 0.1,
        dim.h || 1,
        8
      );
    }

    if (!meshData) return null;

    // Validate mesh data has non-empty vertex and index arrays before GPU upload.
    if (
      !meshData.vertices ||
      meshData.vertices.length === 0 ||
      !meshData.indices ||
      meshData.indices.length === 0
    ) {
      if (Donkeycraft.Logger && typeof Donkeycraft.Logger.warn === 'function') {
        Donkeycraft.Logger.warn(
          'EntityRenderer',
          'Empty mesh data for key "' + key + '" — skipping GPU upload.'
        );
      }
      return null;
    }

    var vbo = gl.createBuffer();
    if (!vbo) {
      if (Donkeycraft.Logger && typeof Donkeycraft.Logger.warn === 'function') {
        Donkeycraft.Logger.warn(
          'EntityRenderer',
          'gl.createBuffer() failed for VBO — context may be lost.'
        );
      }
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, meshData.vertices, gl.STATIC_DRAW);

    var ibo = gl.createBuffer();
    if (!ibo) {
      if (Donkeycraft.Logger && typeof Donkeycraft.Logger.warn === 'function') {
        Donkeycraft.Logger.warn(
          'EntityRenderer',
          'gl.createBuffer() failed for IBO — context may be lost.'
        );
      }
      // Clean up VBO to prevent GPU memory leak
      gl.deleteBuffer(vbo);
      return null;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshData.indices, gl.STATIC_DRAW);

    var cached = {
      vbo: vbo,
      ibo: ibo,
      vertexCount: meshData.indices.length,
      vertexByteStride: VERTEX_BYTE_STRIDE,
    };
    this._meshCache[key] = cached;

    return cached;
  };

  /**
   * _computeBoneYaw — Compute yaw-adjusted position for a single bone offset.
   *
   * Utility method for external code that needs to apply entity yaw to a bone's offset
   * without building the full hierarchy. Uses the same rotation logic as _buildBoneHierarchy
   * but operates on a single offset vector.
   *
   * @private
   * @param {number} offsetX - Bone offset X in entity-local space.
   * @param {number} offsetY - Bone offset Y in entity-local space.
   * @param {number} offsetZ - Bone offset Z in entity-local space.
   * @param {number} yaw - Entity yaw in radians.
   * @param {{x: number, y: number, z: number}} entityPos - Entity world position.
   * @returns {{x: number, y: number, z: number}} World-space position after yaw rotation.
   */
  Donkeycraft.EntityRenderer.prototype._computeBoneYaw = function (
    offsetX,
    offsetY,
    offsetZ,
    yaw,
    entityPos
  ) {
    var cosYaw = Math.cos(yaw);
    var sinYaw = Math.sin(yaw);

    var localOffsetX = offsetX * cosYaw - offsetZ * sinYaw;
    var localOffsetZ = offsetX * sinYaw + offsetZ * cosYaw;
    var localOffsetY = offsetY;

    return {
      x: entityPos.x + localOffsetX,
      y: entityPos.y + localOffsetY,
      z: entityPos.z + localOffsetZ,
    };
  };

  /**
   * _computeBoneWorldTransform — Compute the world-space transform for a bone (legacy single-bone version).
   *
   * This method is retained for backward compatibility when only a single bone needs
   * computation (e.g., single-entity rendering without hierarchy). For batch rendering,
   * prefer _buildBoneHierarchy which processes all bones in topological order.
   *
   * Combines entity position + yaw rotation with bone offset/pivot for correct positioning.
   * Bone rotations are kept in entity-local space (the animation controller provides
   * rotations relative to the entity's facing direction).
   *
   * The bone's `offset` determines its world-space position relative to the entity origin.
   * The bone's `pivot` (when defined) is used for rotation adjustment — it specifies the
   * point around which bone rotations occur, ensuring limbs rotate naturally from their
   * joints rather than from the mesh center.
   *
   * @private
   * @param {Object} entity - Entity instance with getPosition(), getRotation(), getBones() methods.
   * @param {string} boneName - Bone name to compute transform for.
   * @param {Object.<string, {rx: number, ry: number, rz: number}>} boneTransforms - Bone rotation transforms from animation controller.
   * @returns {{x: number, y: number, z: number, rx: number, ry: number, rz: number, pivot: Object|null}} World-space position (at offset), local rotation, and pivot for rotation adjustment.
   */
  Donkeycraft.EntityRenderer.prototype._computeBoneWorldTransform = function (
    entity,
    boneName,
    boneTransforms
  ) {
    var pos = entity.getPosition();
    if (!pos) return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, pivot: null };

    var rot = entity.getRotation();
    var bones = entity.getBones();
    var boneAnim = boneTransforms[boneName] || { rx: 0, ry: 0, rz: 0 };

    // Find bone definition to get offset and pivot
    var boneDef = null;
    if (bones && Array.isArray(bones)) {
      for (var i = 0; i < bones.length; i++) {
        if (bones[i].name === boneName) {
          boneDef = bones[i];
          break;
        }
      }
    }

    var offset =
      boneDef && boneDef.offset ? boneDef.offset : { x: 0, y: 0, z: 0 };
    var pivot = boneDef && boneDef.pivot ? boneDef.pivot : null;

    // Apply entity yaw rotation to bone offset for correct world-space positioning.
    var yaw = rot ? rot.yaw : 0;
    var cosYaw = Math.cos(yaw);
    var sinYaw = Math.sin(yaw);

    // Rotate the offset by entity yaw (only XZ plane since yaw is Y-axis rotation)
    var localOffsetX = offset.x * cosYaw - offset.z * sinYaw;
    var localOffsetZ = offset.x * sinYaw + offset.z * cosYaw;
    var localOffsetY = offset.y;

    // World-space position uses the rotated offset (not pivot).
    var finalX = pos.x + localOffsetX;
    var finalY = pos.y + localOffsetY;
    var finalZ = pos.z + localOffsetZ;

    // Use Number() with fallback to handle falsy animation values (0, null, undefined)
    // without treating 0 radians as "no rotation" — 0 is a valid rotation.
    var animRx = boneAnim.rx != null ? Number(boneAnim.rx) : 0;
    var animRy = boneAnim.ry != null ? Number(boneAnim.ry) : 0;
    var animRz = boneAnim.rz != null ? Number(boneAnim.rz) : 0;

    return {
      x: finalX,
      y: finalY,
      z: finalZ,
      rx: animRx,
      ry: animRy,
      rz: animRz,
      pivot: pivot,
    };
  };

  /**
   * _colorCache — LRU cache for parsed hex colors to avoid redundant string parsing.
   * Key: normalized hex string (e.g., '#8B4513'), Value: {r, g, b, _accessOrder}.
   * Maximum size is capped at MAX_COLOR_CACHE_ENTRIES to prevent unbounded memory growth.
   * When the cache exceeds the limit, the oldest entry (lowest access order) is evicted.
   * @type {Object.<string, {r: number, g: number, b: number, _accessOrder: number}>}
   * @private
   */
  var _colorCache = {};
  var _colorCacheOrder = 0;
  var MAX_COLOR_CACHE_ENTRIES = 256;

  /**
   * _parseHexColor — Parse a hex color string (#RGB or #RRGGBB) to normalized RGB values.
   * Results are cached by normalized color key to avoid redundant parsing on subsequent calls.
   * Logs a warning via Donkeycraft.Logger (if available) for invalid color strings.
   * @private
   * @param {string} color - Hex color string (e.g., '#8B4513' or '#F00').
   * @returns {{r: number, g: number, b: number}} RGB values in [0, 1] range.
   */
  Donkeycraft.EntityRenderer.prototype._parseHexColor = function (color) {
    var DEFAULT_RED = 1,
      DEFAULT_GREEN = 0,
      DEFAULT_BLUE = 1;

    if (!color || typeof color !== 'string' || color.charAt(0) !== '#') {
      if (Donkeycraft.Logger && typeof Donkeycraft.Logger.warn === 'function') {
        Donkeycraft.Logger.warn(
          'EntityRenderer',
          'Invalid color string "' +
            color +
            '" — rendering as magenta (#FF00FF).'
        );
      }
      return { r: DEFAULT_RED, g: DEFAULT_GREEN, b: DEFAULT_BLUE };
    }

    // Use normalized key for cache lookup.
    var cacheKey = color;
    if (color.length === 4) {
      // Expand shorthand #RGB to #RRGGBB for caching.
      cacheKey =
        '#' +
        color.charAt(1) +
        color.charAt(1) +
        color.charAt(2) +
        color.charAt(2) +
        color.charAt(3) +
        color.charAt(3);
    }

    if (_colorCache[cacheKey]) {
      return _colorCache[cacheKey];
    }

    var hex = color.substring(1);
    var result = null;

    if (hex.length === 6) {
      var red = parseInt(hex.substring(0, 2), 16);
      var green = parseInt(hex.substring(2, 4), 16);
      var blue = parseInt(hex.substring(4, 6), 16);
      if (isNaN(red) || isNaN(green) || isNaN(blue)) {
        if (
          Donkeycraft.Logger &&
          typeof Donkeycraft.Logger.warn === 'function'
        ) {
          Donkeycraft.Logger.warn(
            'EntityRenderer',
            'Invalid hex color "' +
              color +
              '" — rendering as magenta (#FF00FF).'
          );
        }
        result = { r: DEFAULT_RED, g: DEFAULT_GREEN, b: DEFAULT_BLUE };
      } else {
        result = { r: red / 255, g: green / 255, b: blue / 255 };
      }
    } else if (hex.length === 3) {
      var r2 = parseInt(hex.charAt(0) + hex.charAt(0), 16);
      var g2 = parseInt(hex.charAt(1) + hex.charAt(1), 16);
      var b2 = parseInt(hex.charAt(2) + hex.charAt(2), 16);
      if (isNaN(r2) || isNaN(g2) || isNaN(b2)) {
        if (
          Donkeycraft.Logger &&
          typeof Donkeycraft.Logger.warn === 'function'
        ) {
          Donkeycraft.Logger.warn(
            'EntityRenderer',
            'Invalid shorthand hex color "' +
              color +
              '" — rendering as magenta (#FF00FF).'
          );
        }
        result = { r: DEFAULT_RED, g: DEFAULT_GREEN, b: DEFAULT_BLUE };
      } else {
        result = { r: r2 / 255, g: g2 / 255, b: b2 / 255 };
      }
    } else {
      if (Donkeycraft.Logger && typeof Donkeycraft.Logger.warn === 'function') {
        Donkeycraft.Logger.warn(
          'EntityRenderer',
          'Invalid hex color length "' +
            color +
            '" — rendering as magenta (#FF00FF).'
        );
      }
      result = { r: DEFAULT_RED, g: DEFAULT_GREEN, b: DEFAULT_BLUE };
    }

    // Cache the result (use normalized key for shorthand colors).
    // Evict oldest entry if cache is full.
    var cacheKeys = Object.keys(_colorCache);
    if (cacheKeys.length >= MAX_COLOR_CACHE_ENTRIES) {
      // Find the oldest entry (lowest _accessOrder).
      var oldestKey = null;
      var oldestOrder = Infinity;
      for (var i = 0; i < cacheKeys.length; i++) {
        if (_colorCache[cacheKeys[i]]._accessOrder < oldestOrder) {
          oldestOrder = _colorCache[cacheKeys[i]]._accessOrder;
          oldestKey = cacheKeys[i];
        }
      }
      if (oldestKey) delete _colorCache[oldestKey];
    }

    _colorCache[cacheKey] = {
      r: result.r,
      g: result.g,
      b: result.b,
      _accessOrder: ++_colorCacheOrder,
    };
    return result;
  };

  /**
   * _bindMeshAttributes — Bind vertex attributes for a mesh using the shader manager.
   * Sets up position (aPosition) and normal (aNormal) attribute pointers.
   * Note: Entity shader does not use UV attributes (flat color rendering).
   * @private
   * @param {Object} meshCache - Cached mesh data with VBO and vertexByteStride.
   * @param {Object} shaderManager - ShaderManager instance for getting attribute locations.
   * @returns {boolean} True if all attributes were bound successfully.
   */
  Donkeycraft.EntityRenderer.prototype._bindMeshAttributes = function (
    meshCache,
    shaderManager
  ) {
    var gl = this._gl;
    if (!gl || !meshCache || !shaderManager) return false;

    gl.bindBuffer(gl.ARRAY_BUFFER, meshCache.vbo);

    var posLoc = shaderManager.getAttribute('aPosition');
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(
        posLoc,
        3,
        gl.FLOAT,
        false,
        meshCache.vertexByteStride,
        0
      );
    }

    var normLoc = shaderManager.getAttribute('aNormal');
    if (normLoc >= 0) {
      gl.enableVertexAttribArray(normLoc);
      gl.vertexAttribPointer(
        normLoc,
        3,
        gl.FLOAT,
        false,
        meshCache.vertexByteStride,
        3 * BYTES_PER_FLOAT
      );
    }

    // Note: Entity shader uses flat color rendering — no UV attributes needed.

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
   * @param {Object} [pivot] - Optional pivot point {x, y, z} for rotation center adjustment.
   * @returns {boolean} True if the draw call was issued successfully.
   */
  Donkeycraft.EntityRenderer.prototype._drawMesh = function (
    meshCache,
    px,
    py,
    pz,
    rx,
    ry,
    rz,
    color,
    pivot
  ) {
    var gl = this._gl;
    var shaderManager = this._shaderManager;
    if (!gl || !meshCache || !shaderManager) return false;

    var rgb = this._parseHexColor(color);
    var modelMatrix = this._buildModelMatrix(px, py, pz, rx, ry, rz, pivot);

    if (!this._bindMeshAttributes(meshCache, shaderManager)) {
      return false;
    }

    // Set model matrix uniform (uModel)
    shaderManager.setMat4('uModel', {
      getData: function () {
        return modelMatrix;
      },
    });

    // Set flat color uniform (uColor) — entity RGB color
    shaderManager.setVec3('uColor', rgb.r, rgb.g, rgb.b);

    // Enable entity rendering mode (uUseColor = 1) so the shader uses flat color instead of texture
    shaderManager.setInt('uUseColor', 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshCache.ibo);
    gl.drawElements(gl.TRIANGLES, meshCache.vertexCount, gl.UNSIGNED_SHORT, 0);

    var err = gl.getError();
    if (err !== gl.NO_ERROR) {
      if (Donkeycraft.Logger && typeof Donkeycraft.Logger.warn === 'function') {
        Donkeycraft.Logger.warn(
          'EntityRenderer',
          'WebGL draw error: ' + err.toString(16)
        );
      }
      return false;
    }

    this.drawCalls++;
    return true;
  };

  /**
   * _extractFrustumPlanes — Extract the 6 frustum planes from the camera's view and projection matrices.
   *
   * Each plane is stored as {nx, ny, nz, d} where (nx,ny,nz) is the outward-pointing
   * normal and d is the signed distance from the origin along that normal. A point p
   * is inside the plane when dot(p, normal) + d >= 0 (i.e., it's on the positive side).
   *
   * The camera object must provide:
   * - getViewMatrix() → { getData(): Float32Array(16) } (column-major view matrix)
   * - getProjectionMatrix() → { getData(): Float32Array(16) } (column-major projection matrix)
   *
   * @private
   * @returns {Array<{nx:number, ny:number, nz:number, d:number}>|null} Array of 6 plane objects
   *   [left, right, bottom, top, near, far], or null if matrices unavailable.
   */
  Donkeycraft.EntityRenderer.prototype._extractFrustumPlanes = function () {
    var camera = this._camera;
    if (!camera || !camera.getViewMatrix || !camera.getProjectionMatrix)
      return null;

    var viewData = camera.getViewMatrix && camera.getViewMatrix().getData();
    var projData =
      camera.getProjectionMatrix && camera.getProjectionMatrix().getData();
    if (!viewData || !projData) return null;

    // Multiply projection × view to get the combined clip-space matrix (column-major).
    var m = new Float32Array(16);
    for (var j = 0; j < 4; j++) {
      m[j] =
        projData[0] * viewData[j] +
        projData[4] * viewData[j + 4] +
        projData[8] * viewData[j + 8] +
        projData[12] * viewData[j + 12];
      m[j + 4] =
        projData[1] * viewData[j] +
        projData[5] * viewData[j + 4] +
        projData[9] * viewData[j + 8] +
        projData[13] * viewData[j + 12];
      m[j + 8] =
        projData[2] * viewData[j] +
        projData[6] * viewData[j + 4] +
        projData[10] * viewData[j + 8] +
        projData[14] * viewData[j + 12];
      m[j + 12] =
        projData[3] * viewData[j] +
        projData[7] * viewData[j + 4] +
        projData[11] * viewData[j + 8] +
        projData[15] * viewData[j + 12];
    }

    // Extract 6 frustum planes from the combined matrix.
    var planes = [];

    // Left plane
    planes.push({
      nx: m[3] + m[0],
      ny: m[7] + m[4],
      nz: m[11] + m[8],
      d: m[15] + m[12],
    });
    // Right plane
    planes.push({
      nx: m[3] - m[0],
      ny: m[7] - m[4],
      nz: m[11] - m[8],
      d: m[15] - m[12],
    });
    // Bottom plane
    planes.push({
      nx: m[3] + m[1],
      ny: m[7] + m[5],
      nz: m[11] + m[9],
      d: m[15] + m[13],
    });
    // Top plane
    planes.push({
      nx: m[3] - m[1],
      ny: m[7] - m[5],
      nz: m[11] - m[9],
      d: m[15] - m[13],
    });
    // Near plane
    planes.push({
      nx: m[3] + m[2],
      ny: m[7] + m[6],
      nz: m[11] + m[10],
      d: m[15] + m[14],
    });
    // Far plane
    planes.push({
      nx: m[3] - m[2],
      ny: m[7] - m[6],
      nz: m[11] - m[10],
      d: m[15] - m[14],
    });

    // Normalize each plane so that the normal vector has unit length.
    for (var j = 0; j < planes.length; j++) {
      var p = planes[j];
      var len = Math.sqrt(p.nx * p.nx + p.ny * p.ny + p.nz * p.nz);
      if (len > 1e-6) {
        p.nx /= len;
        p.ny /= len;
        p.nz /= len;
        p.d /= len;
      }
    }

    return planes;
  };

  /**
   * _isAABBInFrustum — Test whether an axis-aligned bounding box intersects the frustum.
   *
   * Uses the separating axis test: if any frustum plane has all AABB corners on its
   * negative side, the box is outside the frustum. If no such plane exists, the box
   * intersects (or is inside) the frustum.
   *
   * @private
   * @param {number} cx - Box center X.
   * @param {number} cy - Box center Y.
   * @param {number} cz - Box center Z.
   * @param {number} halfW - Half-width (X extent of the AABB).
   * @param {number} halfH - Half-height (Y extent of the AABB).
   * @param {number} halfD - Half-depth (Z extent of the AABB).
   * @param {Array<{nx:number, ny:number, nz:number, d:number}>} planes - Frustum planes from _extractFrustumPlanes.
   * @returns {boolean} True if the box intersects the frustum.
   */
  Donkeycraft.EntityRenderer.prototype._isAABBInFrustum = function (
    cx,
    cy,
    cz,
    halfW,
    halfH,
    halfD,
    planes
  ) {
    for (var i = 0; i < planes.length; i++) {
      var p = planes[i];
      var dist = cx * p.nx + cy * p.ny + cz * p.nz + p.d;
      var radius =
        halfW * Math.abs(p.nx) +
        halfH * Math.abs(p.ny) +
        halfD * Math.abs(p.nz);

      if (dist < -radius) {
        return false;
      }
    }

    return true;
  };

  /**
   * _isEntityInFrustum — Check if an entity is within the camera's view frustum.
   *
   * Uses a multi-stage culling pipeline:
   * 1. Distance check: Entity must be within render distance squared (fast rejection)
   * 2. Forward-facing check: Dot product of (entityDir, cameraForward) must exceed threshold
   *    to ensure entities behind or perpendicular to the camera are culled
   * 3. AABB vs frustum plane test: Entity bounding box is tested against all 6 frustum planes
   *    extracted from the view-projection matrix for accurate visibility detection
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

    // Stage 1: Distance-based culling (fast rejection).
    var dx = entPos.x - camPos.x;
    var dy = entPos.y - camPos.y;
    var dz = entPos.z - camPos.z;
    var distSq = dx * dx + dy * dy + dz * dz;
    var renderDistSq = this.renderDistance * this.renderDistance;

    if (distSq > renderDistSq) return false;

    // Stage 2: Forward-facing check — cull entities behind the camera.
    var camForward =
      this._camera.getForwardDirection && this._camera.getForwardDirection();
    if (camForward) {
      var dist = Math.sqrt(distSq);
      if (dist > FRUSTUM_MIN_DISTANCE) {
        var dot =
          (dx * camForward.x + dy * camForward.y + dz * camForward.z) / dist;
        if (dot < FRUSTUM_FORWARD_THRESHOLD) return false;
      }
    }

    // Stage 3: AABB vs frustum plane test for accurate visibility detection.
    var dims = entity.getDimensions && entity.getDimensions();
    if (dims) {
      var halfW = (dims.width || 0.6) / 2;
      var entHeight = dims.height || 1.8;

      // Try frustum plane extraction first. If the camera provides view/projection
      // matrices, use exact AABB-vs-plane testing for accurate culling.
      var planes = this._extractFrustumPlanes();
      if (planes) {
        return this._isAABBInFrustum(
          entPos.x,
          entPos.y,
          entPos.z,
          halfW,
          entHeight,
          halfW,
          planes
        );
      }

      // Fallback: if the camera doesn't provide view/projection matrices, use a
      // simplified angle check relative to the camera's forward direction.
      // Uses FRUSTUM_FORWARD_THRESHOLD for consistency with the main path.
      if (camForward) {
        var horizDist = Math.sqrt(dx * dx + dz * dz);
        var entDist = Math.sqrt(horizDist * horizDist + dy * dy);
        if (entDist > FRUSTUM_MIN_DISTANCE) {
          var dot =
            (dx * camForward.x + dy * camForward.y + dz * camForward.z) /
            entDist;
          if (dot < FRUSTUM_FORWARD_THRESHOLD) {
            return false;
          }
        }
      }
    }

    return true;
  };

  /**
   * _sortEntitiesByDistance — Sort entity IDs by distance from camera (far to near).
   * Far-to-near sorting ensures transparent entities render correctly and distant
   * entities are drawn first for better depth buffer coverage.
   *
   * When the camera is unavailable, returns all alive entities unsorted (with distSq = 0)
   * so that rendering still proceeds — just without distance-based ordering.
   *
   * @private
   * @param {Array<number>} entityIds - Array of entity IDs to sort.
   * @returns {Array<{id: number, distSq: number}>} Sorted array (far to near), filtered by render distance. Unsorted alive entities if camera unavailable.
   */
  Donkeycraft.EntityRenderer.prototype._sortEntitiesByDistance = function (
    entityIds
  ) {
    var camPos = null;

    if (this._camera && this._camera.getPosition) {
      camPos = this._camera.getPosition();
    }

    var renderDistSq = this.renderDistance * this.renderDistance;
    var result = [];

    for (var i = 0; i < entityIds.length; i++) {
      var entity = this._entityManager.getEntity(entityIds[i]);
      if (!entity || !entity.isAlive()) continue;

      var pos = entity.getPosition();
      if (!pos) continue;

      var distSq = 0;

      if (camPos) {
        var dx = pos.x - camPos.x;
        var dy = pos.y - camPos.y;
        var dz = pos.z - camPos.z;
        distSq = dx * dx + dy * dy + dz * dz;

        if (distSq > renderDistSq) continue;
      }

      result.push({ id: entityIds[i], distSq: distSq });
    }

    // Sort far to near (descending distance) when camera is available.
    if (camPos) {
      result.sort(function (a, b) {
        return b.distSq - a.distSq;
      });
    }

    return result;
  };

  /**
   * _applyRenderState — Apply common WebGL render state for entity rendering.
   * Saves the current WebGL state so it can be restored via _restoreRenderState().
   * Enables depth testing and face culling unconditionally; alpha blending is
   * controlled by the alphaEnabled parameter. Depth write mask is set based on
   * alpha blending: disabled when alpha is enabled (to prevent z-fighting on
   * transparent surfaces), enabled otherwise.
   *
   * CRITICAL: Also saves the ShaderManager's current program reference so it can
   * be restored after entity rendering. Without this, the terrain shader's uniforms
   * (uColor=entity color, uUseColor=1) would leak into subsequent terrain rendering.
   *
   * @private
   * @param {boolean} [alphaEnabled=false] - Whether alpha blending is enabled.
   */
  Donkeycraft.EntityRenderer.prototype._applyRenderState = function (
    alphaEnabled
  ) {
    var gl = this._gl;
    if (!gl) return;

    var depthTestEnabled = true;
    var cullFaceEnabled = true;
    var blendEnabled = false;
    var depthWriteEnabled = true;

    try {
      depthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
      cullFaceEnabled = gl.isEnabled(gl.CULL_FACE);
      blendEnabled = gl.isEnabled(gl.BLEND);
      depthWriteEnabled = gl.getParameter(gl.DEPTH_WRITEMASK);
    } catch (e) {
      return;
    }

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    if (alphaEnabled) {
      gl.depthMask(false);
    } else {
      gl.depthMask(true);
    }

    if (alphaEnabled) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
    }

    this._savedRenderState = {
      depthTest: depthTestEnabled,
      cullFace: cullFaceEnabled,
      blend: blendEnabled,
      depthWrite: depthWriteEnabled,
    };
  };

  /**
   * _restoreRenderState — Restore WebGL render state to pre-render values.
   * Restores depth test, face culling, alpha blending, and depth write mask
   * to their pre-render state.
   * @private
   */
  Donkeycraft.EntityRenderer.prototype._restoreRenderState = function () {
    var gl = this._gl;
    if (!gl || !this._savedRenderState) return;

    if (this._savedRenderState.depthTest) {
      gl.enable(gl.DEPTH_TEST);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }

    if (this._savedRenderState.cullFace) {
      gl.enable(gl.CULL_FACE);
    } else {
      gl.disable(gl.CULL_FACE);
    }

    if (this._savedRenderState.blend) {
      gl.enable(gl.BLEND);
    } else {
      gl.disable(gl.BLEND);
    }

    if (this._savedRenderState.depthWrite !== undefined) {
      gl.depthMask(this._savedRenderState.depthWrite);
    }

    this._savedRenderState = null;
  };

  /**
   * _renderEntityParts — Render all body parts for a single entity.
   * Shared code path for both batch and single-entity rendering.
   * Uses hierarchical bone transforms: each child bone's world position is computed
   * relative to its parent bone's world transform, ensuring correct skeletal animation.
   * @private
   * @param {Donkeycraft.Entity} entity - Entity to render.
   * @param {boolean} [isBatch=false] - Whether called from batch render (for stats tracking).
   * @returns {{partsRendered: number, drawCalls: number}} Render statistics for this entity.
   */
  Donkeycraft.EntityRenderer.prototype._renderEntityParts = function (
    entity,
    isBatch
  ) {
    var gl = this._gl;
    var shaderManager = this._shaderManager;

    if (!gl || !shaderManager) return { partsRendered: 0, drawCalls: 0 };

    // Get shape definitions for this entity type
    var shapeDefs = Donkeycraft.EntityShapeDefs[entity.type];
    if (!shapeDefs) {
      var dims = entity.getDimensions ? entity.getDimensions() : null;
      var entWidth =
        (dims && dims.width) != null ? dims.width : entity.width || 0.6;
      var entHeight =
        (dims && dims.height) != null ? dims.height : entity.height || 1.8;

      shapeDefs = [
        {
          name: 'body',
          meshType: 'box',
          dimensions: { w: entWidth, h: entHeight, d: entWidth },
          color: '#FF00FF', // Magenta = unknown type
        },
      ];
    }

    var boneTransforms = entity.getBoneTransforms
      ? entity.getBoneTransforms()
      : {};

    var partsRendered = 0;
    var drawCalls = 0;

    // Build hierarchical bone transforms (root → children → grandchildren)
    var boneHierarchy = this._buildBoneHierarchy(entity, boneTransforms);

    for (var i = 0; i < shapeDefs.length; i++) {
      var shapeDef = shapeDefs[i];

      // Look up the bone's world transform from the hierarchy
      var boneWorld = boneHierarchy[shapeDef.name];

      if (!boneWorld) {
        if (
          Donkeycraft.Logger &&
          typeof Donkeycraft.Logger.warn === 'function'
        ) {
          Donkeycraft.Logger.warn(
            'EntityRenderer',
            'Bone "' +
              shapeDef.name +
              '" not found in entity "' +
              entity.type +
              '" — skipping.'
          );
        }
        continue;
      }

      var meshCache = this._getOrBuildMesh(shapeDef);
      if (!meshCache) continue;

      var success = this._drawMesh(
        meshCache,
        boneWorld.x,
        boneWorld.y,
        boneWorld.z,
        boneWorld.rx,
        boneWorld.ry,
        boneWorld.rz,
        shapeDef.color,
        boneWorld.pivot
      );

      if (success) {
        partsRendered++;
        drawCalls++;
      }
    }

    // Track stats — only in batch mode to avoid overwriting frame totals
    if (isBatch) {
      this.entitiesRendered++;
      this.drawCalls += drawCalls;
    }

    return { partsRendered: partsRendered, drawCalls: drawCalls };
  };

  /**
   * _onContextLost — Handler for WebGL context loss events.
   * Sets the internal `_contextLost` flag to prevent further render calls.
   * @private
   * @param {Event} event - The context loss event.
   */
  Donkeycraft.EntityRenderer.prototype._onContextLost = function (event) {
    this._contextLost = true;
    event.preventDefault();
  };

  /**
   * _restoreFromContextLoss — Rebuild mesh cache after WebGL context restoration.
   * Called when the `webglcontextrestored` event fires. Clears all cached GPU buffers
   * so they will be recreated on the next render call.
   * @private
   */
  Donkeycraft.EntityRenderer.prototype._restoreFromContextLoss = function () {
    this._contextLost = false;
    this.clearMeshCache();
  };

  /**
   * render — Render all visible entities using awareness-based culling.
   *
   * Renders NEAR-tier and FAR-tier entities with distance-sorted batch rendering.
   * Entities are sorted by distance (far-to-near) and frustum-culled before drawing.
   * WebGL state is saved before rendering and restored afterward to maintain
   * compatibility with the larger render pipeline. State restoration is guaranteed
   * via try-finally even if rendering errors occur.
   *
   * Updates `this.entitiesRendered` and `this.drawCalls` statistics each frame.
   *
   * Prerequisites:
   * - EntityManager must be set via setEntityManager()
   * - Camera must be set via setCamera() for frustum culling
   * - Shader programs ('terrain') must be compiled in the ShaderManager
   *
   * @param {Object} [options] - Render options.
   * @param {boolean} [options.alphaBlending] - Enable alpha blending for transparent rendering.
   *   If omitted, falls back to this.enableAlphaBlending instance default.
   */
  Donkeycraft.EntityRenderer.prototype.render = function (options) {
    if (!this.enabled || !this._gl || !this._entityManager || this._contextLost)
      return;

    var gl = this._gl;
    var shaderManager = this._shaderManager;
    var opts = options || {};

    this.entitiesRendered = 0;
    this.drawCalls = 0;

    var alphaEnabled =
      opts.alphaBlending !== undefined
        ? opts.alphaBlending
        : this.enableAlphaBlending;

    this._applyRenderState(alphaEnabled);

    // Use the dedicated entity shader program which supports flat color rendering.
    if (shaderManager) {
      shaderManager.use('entity');
    }

    try {
      var nearRaw = this._entityManager.getNearEntities();
      var farRaw = this._entityManager.getFarEntities();
      var nearIds = _toArray(nearRaw);
      var farIds = _toArray(farRaw);

      var allIds = nearIds.concat(farIds);

      var sorted = this._sortEntitiesByDistance(allIds);

      var renderList = sorted.slice(0, this.maxRenderEntities);

      var frustumSkipped = 0;
      var aliveSkipped = 0;
      var totalPartsRendered = 0;

      for (var k = 0; k < renderList.length; k++) {
        var entData = renderList[k];
        var entity = this._entityManager.getEntity(entData.id);

        if (!entity || !entity.isAlive()) {
          aliveSkipped++;
          continue;
        }

        if (!this._isEntityInFrustum(entity)) {
          frustumSkipped++;
          continue;
        }

        var stats = this._renderEntityParts(entity, true);
        totalPartsRendered += stats.partsRendered;
      }

      // Diagnostic logging (only when debug logging is enabled)
      if (
        Donkeycraft.Logger &&
        typeof Donkeycraft.Logger.debug === 'function'
      ) {
        Donkeycraft.Logger.debug(
          'EntityRenderer',
          'Entities: near=' +
            nearIds.length +
            ' far=' +
            farIds.length +
            ' sorted=' +
            sorted.length +
            ' rendered=' +
            this.entitiesRendered +
            ' parts=' +
            totalPartsRendered +
            ' drawCalls=' +
            this.drawCalls +
            ' frustumSkipped=' +
            frustumSkipped +
            ' aliveSkipped=' +
            aliveSkipped
        );
      }
    } finally {
      // CRITICAL: Reset shader uniforms to prevent terrain renderer pollution.
      // The entity renderer sets uUseColor=1 and uColor=entity RGB for flat-color rendering.
      // If these persist, the terrain shader will render all blocks as solid entity colors instead of textures.
      if (shaderManager) {
        shaderManager.setInt('uUseColor', 0);
        shaderManager.setVec3('uColor', 0, 0, 0);
      }
      this._restoreRenderState();
    }
  };

  /**
   * renderEntity — Render a single entity (for debugging/specific targeting).
   *
   * Useful for rendering a specific entity without going through the full batch pipeline,
   * such as highlighting a selected entity or rendering a debug representation.
   * Activates the terrain shader program before rendering.
   * WebGL state is saved before rendering and restored afterward via try-finally.
   *
   * Updates `this.entitiesRendered` (set to 1) and `this.drawCalls` (actual draw call count).
   *
   * @param {Donkeycraft.Entity} entity - Entity to render. Must be alive (isAlive() returns true).
   */
  Donkeycraft.EntityRenderer.prototype.renderEntity = function (entity) {
    if (!this._gl || !entity || !entity.isAlive() || this._contextLost) return;

    var gl = this._gl;
    var shaderManager = this._shaderManager;

    // Use the dedicated entity shader program which supports flat color rendering.
    if (shaderManager) {
      shaderManager.use('entity');
    }

    this._applyRenderState(this.enableAlphaBlending);

    try {
      var stats = this._renderEntityParts(entity, false);

      this.entitiesRendered = 1;
      this.drawCalls = stats.drawCalls;
    } finally {
      // CRITICAL: Reset shader uniforms to prevent terrain renderer pollution.
      if (shaderManager) {
        shaderManager.setInt('uUseColor', 0);
        shaderManager.setVec3('uColor', 0, 0, 0);
      }
      this._restoreRenderState();
    }
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
    this._removeContextLossListener();
    this.clearMeshCache();
    this._entityManager = null;
    this._camera = null;
    this._shaderManager = null;
    this._savedRenderState = null;
    this._contextLossHandler = null;
  };

  /**
   * _removeContextLossListener — Remove the WebGL context loss event listener.
   * Safely removes both 'webglcontextlost' and 'webglcontextrestored' listeners
   * without throwing if the canvas or handler is invalid.
   * @private
   */
  Donkeycraft.EntityRenderer.prototype._removeContextLossListener =
    function () {
      if (this._contextLossHandler && this._gl && this._gl.canvas) {
        var gl = this._gl;
        gl.canvas.removeEventListener(
          'webglcontextlost',
          this._contextLossHandler
        );
        gl.canvas.removeEventListener(
          'webglcontextrestored',
          this._contextLossHandler
        );
        this._contextLossHandler = null;
      }
    };

  /**
   * _setupContextLossListener — Register a listener for WebGL context loss/restoration events.
   * Ensures only one handler is registered by removing existing listeners first.
   * The handler dispatches to `_onContextLost` and `_restoreFromContextLoss` based on event type.
   * @private
   */
  Donkeycraft.EntityRenderer.prototype._setupContextLossListener = function () {
    var gl = this._gl;
    if (!gl || !gl.canvas) return;

    this._removeContextLossListener();

    var self = this;
    this._contextLossHandler = function (event) {
      if (event.type === 'webglcontextlost') {
        self._onContextLost(event);
      } else if (event.type === 'webglcontextrestored') {
        self._restoreFromContextLoss();
      }
    };

    gl.canvas.addEventListener(
      'webglcontextlost',
      this._contextLossHandler,
      false
    );
    gl.canvas.addEventListener(
      'webglcontextrestored',
      this._contextLossHandler,
      false
    );
  };

  /**
   * validateShaderCompatibility — Check that the ShaderManager has all required
   * attributes and uniforms for entity rendering.
   *
   * This method should be called after constructing the renderer and setting up
   * the ShaderManager to catch configuration errors early (before the first render).
   *
   * Required by _bindMeshAttributes:
   * - aPosition: Vertex position attribute (3 floats)
   * - aNormal: Vertex normal attribute (3 floats)
   * Note: Entity shader uses flat color rendering — no UV attributes required.
   *
   * Required by _drawMesh:
   * - uModel: Model matrix uniform (mat4)
   * - uColor: Flat color uniform (vec3)
   *
   * @returns {{valid: boolean, errors: string[], missingAttrs: string[], missingUniforms: string[]}}
   *   - valid: True if all required components are present.
   *   - errors: Array of human-readable error descriptions (empty if valid).
   *   - missingAttrs: List of missing attribute names.
   *   - missingUniforms: List of missing uniform names.
   */
  Donkeycraft.EntityRenderer.prototype.validateShaderCompatibility =
    function () {
      var result = {
        valid: true,
        errors: [],
        missingAttrs: [],
        missingUniforms: [],
      };

      if (!this._shaderManager) {
        result.valid = false;
        result.errors.push(
          'ShaderManager is null — entity rendering will not work.'
        );
        result.missingAttrs.push('(N/A — no ShaderManager)');
        result.missingUniforms.push('(N/A — no ShaderManager)');
        return result;
      }

      // CRITICAL: Activate the entity shader program before querying attribute locations.
      // getAttribute() queries the currently active program, so we must ensure the entity
      // shader is active to get correct attribute locations. Without this, getAttribute()
      // returns -1 (not found) when no program is active, causing false positive errors.
      var entityProg = this._shaderManager.getProgram('entity');
      var wasActiveProgram = this._shaderManager._getActiveProgram();
      if (entityProg) {
        this._shaderManager.useProgram(entityProg);
      }

      try {
        // Entity shader only requires aPosition and aNormal (flat color, no UV).
        var requiredAttrs = ['aPosition', 'aNormal'];
        for (var i = 0; i < requiredAttrs.length; i++) {
          var attrName = requiredAttrs[i];
          var loc = this._shaderManager.getAttribute(attrName);
          if (loc == null || loc < 0) {
            result.valid = false;
            result.missingAttrs.push(attrName);
            result.errors.push(
              'Missing vertex attribute "' +
                attrName +
                '" — meshes cannot be rendered.'
            );
          }
        }
      } finally {
        // Restore the previously active program (or deactivate if none was active).
        if (wasActiveProgram) {
          this._shaderManager.useProgram(wasActiveProgram);
        } else if (entityProg) {
          this._shaderManager.useProgram(null);
        }
      }

      if (typeof this._shaderManager.setMat4 !== 'function') {
        result.valid = false;
        result.missingUniforms.push('uModel');
        result.errors.push(
          'ShaderManager lacks setMat4 method — uModel uniform cannot be set.'
        );
      }
      if (typeof this._shaderManager.setVec3 !== 'function') {
        result.valid = false;
        result.missingUniforms.push('uColor');
        result.errors.push(
          'ShaderManager lacks setVec3 method — uColor uniform cannot be set.'
        );
      }

      return result;
    };

  /**
   * getStats — Get renderer statistics since the last render call.
   * @returns {{entitiesRendered: number, drawCalls: number, cachedMeshes: number}}
   *   - entitiesRendered: Number of entity instances rendered last frame
   *   - drawCalls: Number of gl.drawElements calls made last frame
   *   - cachedMeshes: Total number of unique mesh definitions currently cached
   */
  Donkeycraft.EntityRenderer.prototype.getStats = function () {
    return {
      entitiesRendered: this.entitiesRendered,
      drawCalls: this.drawCalls,
      cachedMeshes: Object.keys(this._meshCache).length,
    };
  };
})();
