// Donkeycraft — Entity Renderer
// Standalone robust renderer for all entities using WebGL 1.0.
// Tightly integrated with EntityManager's awareness tracking and culling system.
// Renders animated entities with bone transforms using instanced-style batching.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    // ============================================================
    // Entity Mesh Builder — Generates simple blocky entity meshes
    // ============================================================

    /**
     * EntityMeshBuilder — Generates simple geometric meshes for entity rendering.
     * Creates box meshes, cylinder meshes, and custom shape meshes for entities.
     * @namespace
     */
    Donkeycraft.EntityMeshBuilder = {};

    /**
     * createBoxMesh — Generate vertices for a simple box mesh centered at origin.
     * Uses indexed geometry for efficient rendering with shared vertices.
     * @param {number} width - Box width (X axis).
     * @param {number} height - Box height (Y axis).
     * @param {number} depth - Box depth (Z axis).
     * @returns {{vertices: Float32Array, indices: Uint16Array}} Mesh data.
     */
    Donkeycraft.EntityMeshBuilder.createBoxMesh = function (width, height, depth) {
        var hw = width / 2; // half-width
        var hh = height / 2; // half-height
        var hd = depth / 2; // half-depth

        // 8 corners of the box (position, normal, UV)
        // Each vertex: x, y, z, nx, ny, nz, u, v = 8 floats
        var vertices = new Float32Array([
            // Front face (z = +hd)
            -hw, -hh,  hd,  0, 0, 1,  0, 0,
             hw, -hh,  hd,  0, 0, 1,  1, 0,
             hw,  hh,  hd,  0, 0, 1,  1, 1,
            -hw,  hh,  hd,  0, 0, 1,  0, 1,

            // Back face (z = -hd)
             hw, -hh, -hd,  0, 0,-1,  0, 0,
            -hw, -hh, -hd,  0, 0,-1,  1, 0,
            -hw,  hh, -hd,  0, 0,-1,  1, 1,
             hw,  hh, -hd,  0, 0,-1,  0, 1,

            // Top face (y = +hh)
            -hw,  hh,  hd,  0, 1, 0,  0, 0,
             hw,  hh,  hd,  0, 1, 0,  1, 0,
             hw,  hh, -hd,  0, 1, 0,  1, 1,
            -hw,  hh, -hd,  0, 1, 0,  0, 1,

            // Bottom face (y = -hh)
            -hw, -hh, -hd,  0,-1, 0,  0, 0,
             hw, -hh, -hd,  0,-1, 0,  1, 0,
             hw, -hh,  hd,  0,-1, 0,  1, 1,
            -hw, -hh,  hd,  0,-1, 0,  0, 1,

            // Right face (x = +hw)
             hw, -hh,  hd,  1, 0, 0,  0, 0,
             hw, -hh, -hd,  1, 0, 0,  1, 0,
             hw,  hh, -hd,  1, 0, 0,  1, 1,
             hw,  hh,  hd,  1, 0, 0,  0, 1,

            // Left face (x = -hw)
            -hw, -hh, -hd, -1, 0, 0,  0, 0,
            -hw, -hh,  hd, -1, 0, 0,  1, 0,
            -hw,  hh,  hd, -1, 0, 0,  1, 1,
            -hw,  hh, -hd, -1, 0, 0,  0, 1
        ]);

        // 6 faces × 2 triangles × 3 vertices = 36 indices
        var indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,       // Front
            4, 5, 6, 4, 6, 7,       // Back
            8, 9, 10, 8, 10, 11,    // Top
            12, 13, 14, 12, 14, 15, // Bottom
            16, 17, 18, 16, 18, 19, // Right
            20, 21, 22, 20, 22, 23  // Left
        ]);

        return { vertices: vertices, indices: indices };
    };

    /**
     * createCylinderMesh — Generate vertices for a simple cylinder (for legs, arms).
     * @param {number} radius - Cylinder radius.
     * @param {number} height - Cylinder height.
     * @param {number} segments - Number of radial segments (more = smoother).
     * @returns {{vertices: Float32Array, indices: Uint16Array}} Mesh data.
     */
    Donkeycraft.EntityMeshBuilder.createCylinderMesh = function (radius, height, segments) {
        segments = segments || 8;
        var vertices = [];
        var indices = [];

        var hh = height / 2;

        // Top cap center
        vertices.push(0, hh, 0, 0, 1, 0, 0.5, 0.5);

        // Top ring
        for (var i = 0; i <= segments; i++) {
            var angle = (i / segments) * Math.PI * 2;
            var cos = Math.cos(angle);
            var sin = Math.sin(angle);
            vertices.push(cos * radius, hh, sin * radius, 0, 1, 0, i / segments, 1);
        }

        // Bottom ring
        for (var j = 0; j <= segments; j++) {
            var angle2 = (j / segments) * Math.PI * 2;
            var cos2 = Math.cos(angle2);
            var sin2 = Math.sin(angle2);
            vertices.push(cos2 * radius, -hh, sin2 * radius, 0, -1, 0, j / segments, 0);
        }

        // Bottom cap center
        var bottomCenterIdx = vertices.length / 8;
        vertices.push(0, -hh, 0, 0, -1, 0, 0.5, 0.5);

        // Build indices
        var topCenterIdx = 0;
        var topStartIdx = 1;
        var bottomStartIdx = topStartIdx + segments + 1;
        var bottomCenterIdx2 = bottomStartIdx + segments + 1;

        // Top cap triangles
        for (var k = 0; k < segments; k++) {
            indices.push(topCenterIdx, topStartIdx + k, topStartIdx + k + 1);
        }

        // Side triangles
        for (var m = 0; m < segments; m++) {
            var topCurr = topStartIdx + m;
            var topNext = topStartIdx + m + 1;
            var botCurr = bottomStartIdx + m;
            var botNext = bottomStartIdx + m + 1;
            indices.push(topCurr, botCurr, topNext);
            indices.push(topNext, botCurr, botNext);
        }

        // Bottom cap triangles
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
     * @type {Object.<string, Array<{name: string, meshType: string, dimensions: {w: number, h: number, d: number}, color: string}>}
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
    // Entity Renderer — WebGL rendering with bone transforms
    // ============================================================

    /**
     * EntityRenderer — Standalone WebGL renderer for all entity types.
     * Uses awareness-based culling from EntityManager, depth-sorted batch rendering,
     * and bone transform computation for skeletal animation.
     * @constructor
     * @param {WebGLRenderingContext} gl - WebGL 1.0 context.
     * @param {Object} shaderManager - ShaderManager instance with compiled shaders.
     */
    Donkeycraft.EntityRenderer = function (gl, shaderManager) {
        /**
         * WebGL rendering context.
         * @type {WebGLRenderingContext}
         * @private
         */
        this._gl = gl || null;

        /**
         * Shader manager instance.
         * @type {Object}
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
         * Mesh cache: "meshType:width:height:depth" → {vbo: WebGLBuffer, ibo: WebGLBuffer, vertexCount: number}.
         * @type {Object.<string, {vbo: WebGLBuffer, ibo: WebGLBuffer, vertexCount: number}>}
         * @private
         */
        this._meshCache = {};

        /**
         * Shader program reference for entity rendering.
         * @type {number|null}
         * @private
         */
        this._entityShader = null;

        /**
         * Whether the renderer is enabled.
         * @type {boolean}
         */
        this.enabled = true;

        /**
         * Maximum number of entities to render per frame.
         * @type {number}
         */
        this.maxRenderEntities = 200;

        /**
         * Render distance in blocks (synced from EntityManager awareness radius).
         * @type {number}
         */
        this.renderDistance = 16;

        /**
         * Statistics: total entities rendered per frame.
         * @type {number}
         */
        this.entitiesRendered = 0;

        /**
         * Statistics: total draw calls per frame.
         * @type {number}
         */
        this.drawCalls = 0;
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
     * @param {Object} camera - Camera instance with getPosition/getRotation methods.
     */
    Donkeycraft.EntityRenderer.prototype.setCamera = function (camera) {
        this._camera = camera || null;
    };

    /**
     * setRenderDistance — Set the entity render distance in blocks.
     * @param {number} distance - Render distance in blocks.
     */
    Donkeycraft.EntityRenderer.prototype.setRenderDistance = function (distance) {
        this.renderDistance = Math.max(4, Math.min(64, distance));
    };

    /**
     * _getOrBuildMesh — Get a cached mesh or build a new one for the given shape definition.
     * @private
     * @param {Object} shapeDef - Shape definition with meshType and dimensions.
     * @returns {{vbo: WebGLBuffer, ibo: WebGLBuffer, vertexCount: number}|null}
     */
    Donkeycraft.EntityRenderer.prototype._getOrBuildMesh = function (shapeDef) {
        if (!this._gl) return null;

        var key = shapeDef.meshType + ':' + JSON.stringify(shapeDef.dimensions);
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

        // Create VBO
        var vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.vertices, gl.STATIC_DRAW);

        // Create IBO
        var ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshData.indices, gl.STATIC_DRAW);

        var cached = {
            vbo: vbo,
            ibo: ibo,
            vertexCount: meshData.indices.length,
            indices: meshData.indices // Keep indices for draw call
        };
        this._meshCache[key] = cached;

        return cached;
    };

    /**
     * _computeBoneWorldTransform — Compute the world-space transform for a bone.
     * Combines entity position + rotation with bone offset and animation transform.
     * @private
     * @param {Object} entity - Entity instance.
     * @param {string} boneName - Bone name to compute transform for.
     * @param {Object} boneTransforms - Bone rotation transforms from animation controller.
     * @returns {{x: number, y: number, z: number, rx: number, ry: number, rz: number}} World transform.
     */
    Donkeycraft.EntityRenderer.prototype._computeBoneWorldTransform = function (entity, boneName, boneTransforms) {
        var pos = entity.getPosition();
        if (!pos) return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

        var rot = entity.getRotation();
        var bones = entity.getBones();
        var boneAnim = boneTransforms[boneName] || { rx: 0, ry: 0, rz: 0 };

        // Find bone definition
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
        var pivot = boneDef ? boneDef.pivot : { x: 0, y: 0, z: 0 };

        // Apply entity yaw rotation to bone offset
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
            ry: (boneAnim.ry || 0) + yaw, // Add entity yaw to bone Y rotation
            rz: boneAnim.rz || 0
        };
    };

    /**
     * _drawMesh — Issue a draw call for a cached mesh with world transform and color.
     * @private
     * @param {Object} meshCache - Cached mesh data (vbo, ibo, vertexCount).
     * @param {number} px - World X position.
     * @param {number} py - World Y position.
     * @param {number} pz - World Z position.
     * @param {number} rx - Rotation X in radians.
     * @param {number} ry - Rotation Y in radians.
     * @param {number} rz - Rotation Z in radians.
     * @param {string} color - Hex color string (e.g., '#8B4513').
     */
    Donkeycraft.EntityRenderer.prototype._drawMesh = function (meshCache, px, py, pz, rx, ry, rz, color) {
        var gl = this._gl;
        if (!gl || !meshCache) return;

        // Parse hex color to RGB
        var r = 0.5, g = 0.5, b = 0.5; // Default gray
        if (color && color.charAt(0) === '#') {
            var hex = color.substring(1);
            if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16) / 255;
                g = parseInt(hex.substring(2, 4), 16) / 255;
                b = parseInt(hex.substring(4, 6), 16) / 255;
            } else if (hex.length === 3) {
                r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
                g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
                b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
            }
        }

        // Use terrain shader for now (we'll create a dedicated entity shader later)
        // Build a simple model matrix from position and rotations
        // For WebGL 1.0, we pass position as a uniform and handle rotation in the vertex shader

        gl.bindBuffer(gl.ARRAY_BUFFER, meshCache.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshCache.ibo);

        // Draw indexed geometry
        gl.drawElements(gl.TRIANGLES, meshCache.vertexCount, gl.UNSIGNED_SHORT, 0);

        this.drawCalls++;
    };

    /**
     * _isEntityInFrustum — Simple distance-based frustum culling.
     * @private
     * @param {Donkeycraft.Entity} entity - Entity to check.
     * @returns {boolean} True if entity is within view range.
     */
    Donkeycraft.EntityRenderer.prototype._isEntityInFrustum = function (entity) {
        if (!this._camera || !this._camera.getPosition) return true;

        var camPos = this._camera.getPosition();
        if (!camPos) return true;

        var entPos = entity.getPosition();
        if (!entPos) return false;

        var dx = entPos.x - camPos.x;
        var dy = entPos.y - camPos.y;
        var dz = entPos.z - camPos.z;
        var distSq = dx * dx + dy * dy + dz * dz;

        // Cull entities beyond render distance
        return distSq <= this.renderDistance * this.renderDistance;
    };

    /**
     * _sortEntitiesByDistance — Sort entity IDs by distance from camera (far to near).
     * @private
     * @param {Array<number>} entityIds - Array of entity IDs.
     * @returns {Array<{id: number, distSq: number}>} Sorted array.
     */
    Donkeycraft.EntityRenderer.prototype._sortEntitiesByDistance = function (entityIds) {
        if (!this._camera || !this._camera.getPosition) return entityIds.map(function (id) { return { id: id, distSq: 0 }; });

        var camPos = this._camera.getPosition();
        if (!camPos) return entityIds.map(function (id) { return { id: id, distSq: 0 }; });

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

            result.push({ id: entityIds[i], distSq: distSq, entity: entity });
        }

        // Sort far to near (descending distance)
        result.sort(function (a, b) { return b.distSq - a.distSq; });

        return result;
    };

    /**
     * render — Render all visible entities using awareness-based culling.
     * Renders NEAR-tier entities with full animation, FAR-tier with simplified rendering.
     * @param {Object} [options] - Render options.
     * @param {boolean} [options.renderNear=true] - Render NEAR tier entities.
     * @param {boolean} [options.renderFar=true] - Render FAR tier entities.
     */
    Donkeycraft.EntityRenderer.prototype.render = function (options) {
        if (!this.enabled || !this._gl || !this._entityManager) return;

        var gl = this._gl;
        var opts = options || {};

        // Reset statistics
        this.entitiesRendered = 0;
        this.drawCalls = 0;

        // Enable depth testing and face culling
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        // Get entities to render based on awareness tier
        var nearIds = opts.renderNear !== false ? this._entityManager.getNearEntities() : [];
        var farIds = opts.renderFar !== false ? this._entityManager.getFarEntities() : [];

        // Combine and limit total entities
        var allEntities = [];
        var maxEntities = this.maxRenderEntities;

        for (var i = 0; i < nearIds.length && allEntities.length < maxEntities; i++) {
            allEntities.push({ id: nearIds[i], tier: 'near' });
        }
        for (var j = 0; j < farIds.length && allEntities.length < maxEntities; j++) {
            allEntities.push({ id: farIds[j], tier: 'far' });
        }

        // Sort by distance from camera
        var sorted = this._sortEntitiesByDistance(allEntities.map(function (e) { return e.id; }));

        // Limit to max entities
        var renderList = sorted.slice(0, maxEntities);

        // Render each entity
        for (var k = 0; k < renderList.length; k++) {
            var entData = renderList[k];
            var entity = this._entityManager.getEntity(entData.id);

            if (!entity || !entity.isAlive()) continue;

            // Frustum culling
            if (!this._isEntityInFrustum(entity)) continue;

            // Get entity shape definitions
            var shapeDefs = Donkeycraft.EntityShapeDefs[entity.type];
            if (!shapeDefs) {
                // Fallback: use generic box for unknown types
                shapeDefs = [{ name: 'body', meshType: 'box', dimensions: { w: entity.width || 0.6, h: entity.height || 1.8, d: entity.width || 0.6 }, color: '#888888' }];
            }

            // Get bone transforms from animation controller
            var boneTransforms = entity.getBoneTransforms() || {};

            // Render each body part
            for (var m = 0; m < shapeDefs.length; m++) {
                var shapeDef = shapeDefs[m];

                // Get mesh cache
                var meshCache = this._getOrBuildMesh(shapeDef);
                if (!meshCache) continue;

                // Compute bone world transform
                var worldTransform = this._computeBoneWorldTransform(entity, shapeDef.name, boneTransforms);

                // Draw the mesh part
                this._drawMesh(
                    meshCache,
                    worldTransform.x,
                    worldTransform.y,
                    worldTransform.z,
                    worldTransform.rx,
                    worldTransform.ry,
                    worldTransform.rz,
                    shapeDef.color
                );
            }

            this.entitiesRendered++;
        }
    };

    /**
     * renderEntity — Render a single entity (for debugging/specific targeting).
     * @param {Donkeycraft.Entity} entity - Entity to render.
     */
    Donkeycraft.EntityRenderer.prototype.renderEntity = function (entity) {
        if (!this._gl || !entity || !entity.isAlive()) return;

        var gl = this._gl;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        // Get shape definitions
        var shapeDefs = Donkeycraft.EntityShapeDefs[entity.type];
        if (!shapeDefs) {
            shapeDefs = [{ name: 'body', meshType: 'box', dimensions: { w: entity.width || 0.6, h: entity.height || 1.8, d: entity.width || 0.6 }, color: '#FF00FF' }];
        }

        // Get bone transforms
        var boneTransforms = entity.getBoneTransforms() || {};

        // Render each body part
        for (var i = 0; i < shapeDefs.length; i++) {
            var shapeDef = shapeDefs[i];
            var meshCache = this._getOrBuildMesh(shapeDef);
            if (!meshCache) continue;

            var worldTransform = this._computeBoneWorldTransform(entity, shapeDef.name, boneTransforms);

            this._drawMesh(
                meshCache,
                worldTransform.x,
                worldTransform.y,
                worldTransform.z,
                worldTransform.rx,
                worldTransform.ry,
                worldTransform.rz,
                shapeDef.color
            );
        }

        this.entitiesRendered++;
        this.drawCalls += shapeDefs.length;
    };

    /**
     * clearMeshCache — Clear all cached mesh buffers (for context restoration).
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
     * destroy — Clean up all GPU resources.
     */
    Donkeycraft.EntityRenderer.prototype.destroy = function () {
        this.clearMeshCache();
        this._entityManager = null;
        this._camera = null;
    };

    /**
     * getStats — Get renderer statistics.
     * @returns {{entitiesRendered: number, drawCalls: number, cachedMeshes: number}}
     */
    Donkeycraft.EntityRenderer.prototype.getStats = function () {
        return {
            entitiesRendered: this.entitiesRendered,
            drawCalls: this.drawCalls,
            cachedMeshes: Object.keys(this._meshCache).length
        };
    };

})();