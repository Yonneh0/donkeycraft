// Donkeycraft — Geometry Builder
// Builds vertex buffers: position, UV, normal, and light data for chunk meshes.
//
// Vertex Layout (9 floats per vertex):
//   - [0-2]   position:  x, y, z in world coordinates
//   - [3]     light:     baked face light intensity (0.0–1.0)
//   - [4-5]   UV:        normalized texture atlas coordinates
//   - [6-8]   normal:    face normal vector (nx, ny, nz)
//
// UV Mapping: delegates to BlockModelRegistry.getFaceUV() for face-specific textures
// (grass block top vs side, log bark vs wood, etc.), falling back to
// TextureAtlas.getBlockUV() for simple single-texture blocks.
// texSubImage2D places canvas row 0 at V=0 (bottom of texture). Side faces flip V so
// canvas row 0 (visual top) → world-top (+Y), ensuring textures render upright.
//
// @module geometry-builder
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE; // 16
    var WORLD_HEIGHT = Donkeycraft.Config.WORLD_HEIGHT; // 256

    /**
     * Number of texture tiles per row/column in the atlas grid.
     * Must match ATLAS_GRID from texture-atlas.js and ATLAS_COLS/ROWS from block-models.js.
     * @constant {number}
     */
    var ATLAS_GRID = 16;

    /**
     * Maximum block ID that fits in the atlas.
     * Block IDs >= MAX_BLOCK_ID fall back to placeholder texture (ID 0).
     * @constant {number}
     */
    var MAX_BLOCK_ID = ATLAS_GRID * ATLAS_GRID; // 256

    // ============================================================
    // Face definitions for visible block faces
    // ============================================================

    /**
     * Face definitions for the six visible block faces.
     *
     * Each face entry defines:
     * - `dir`: Outward normal direction as `[dx, dy, dz]`.
     * - `name`: Human-readable face name used for UV texture lookup
     *   (`"up"`, `"down"`, `"north"`, `"south"`, `"east"`, `"west"`).
     * - `light`: Baked light intensity factor in range `[0.5, 1.0]`.
     *   Higher values = brighter face. Based on standard Minecraft-style lighting:
     *   - Top (+Y): brightest (sun-facing)
     *   - South (+Z): bright (direct sunlight exposure)
     *   - East (+X): medium-bright (partial shadow)
     *   - West (-X): medium (partial shadow)
     *   - North (-Z): dimmer (least sun exposure)
     *   - Bottom (-Y): darkest (no direct light)
     * - `corners`: Four corner positions relative to block origin `[0,0,0]–[1,1,1]`,
     *   ordered counter-clockwise when viewed from outside the block (for `gl.FRONT`
     *   winding order). Each corner is `[x, y, z]`.
     * - `uvCorners`: UV factor pairs for each corner. Each value is `[uFactor, vFactor]`
     *   where `0` maps to `uMin`/`vMin` and `1` maps to `uMax`/`vMax`. The factors are
     *   chosen so that U aligns with the horizontal axis on the face and V aligns with
     *   vertical (Y), ensuring textures render upright on all faces.
     *
     * Vertex layout per vertex: `position(3) + light(1) + UV(2) + normal(3) = 9 floats`.
     * Each quad is split into two triangles: `(v0, v1, v2)` and `(v0, v2, v3)`.
     *
     * @type {Object[]}
     */
    var FACES = [
        // +Y face (top): normal = [0, +1, 0] — sun-facing, brightest
        // UV mapping: U follows +X axis (horizontal), V follows +Z axis (depth)
        {
            dir: [0, 1, 0], name: 'up', light: 0.9,
            corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
            uvCorners: [[0, 0], [0, 1], [1, 1], [1, 0]]
        },

        // -Y face (bottom): normal = [0, -1, 0] — darkest, no direct light
        // UV mapping: U follows +X axis (horizontal), V follows +Z axis (depth)
        {
            dir: [0, -1, 0], name: 'down', light: 0.5,
            corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
            uvCorners: [[0, 0], [1, 0], [1, 1], [0, 1]]
        },

        // +Z face (south): normal = [0, 0, +1] — facing toward positive Z, bright
        // UV mapping: U follows +X axis (horizontal), V follows +Y axis (vertical)
        // texSubImage2D places canvas row 0 at V=0. Side faces need visual-top at world-top (+Y).
        // Flip V: vMin=1, vMax=0 so canvas row 0 (visual top) → V=1 (world-top).
        {
            dir: [0, 0, 1], name: 'south', light: 0.9,
            corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
            uvCorners: [[0, 1], [1, 1], [1, 0], [0, 0]]
        },

        // -Z face (north): normal = [0, 0, -1] — facing toward negative Z, dimmer
        // UV mapping: U follows +X axis (horizontal on face), V follows +Y axis (vertical)
        // Flip V for same reason.
        {
            dir: [0, 0, -1], name: 'north', light: 0.6,
            corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
            uvCorners: [[0, 1], [0, 0], [1, 0], [1, 1]]
        },

        // +X face (east): normal = [+1, 0, 0] — right side, medium-bright
        // UV mapping: U follows +Z axis (horizontal on face), V follows +Y axis (vertical)
        // Flip V.
        {
            dir: [1, 0, 0], name: 'east', light: 0.8,
            corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
            uvCorners: [[0, 1], [0, 0], [1, 0], [1, 1]]
        },

        // -X face (west): normal = [-1, 0, 0] — left side, medium
        // UV mapping: U follows +Z axis (horizontal on face), V follows +Y axis (vertical)
        // Flip V.
        {
            dir: [-1, 0, 0], name: 'west', light: 0.8,
            corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
            uvCorners: [[0, 1], [1, 1], [1, 0], [0, 0]]
        }
    ];

    // ============================================================
    // GeometryBuilder — Builds vertex data arrays for chunk mesh rendering
    // ============================================================

    /**
     * GeometryBuilder — Builds vertex data arrays for chunk mesh rendering.
     *
     * Iterates over all blocks in a chunk, exposing faces adjacent to transparent
     * blocks (face culling). Generates position, light intensity, UV coordinates,
     * and normal vectors for each visible face.
     *
     * Vertex layout: position(3) + light(1) + UV(2) + normal(3) = 9 floats per vertex.
     *
     * @constructor
     * @alias Donkeycraft.GeometryBuilder
     */
    Donkeycraft.GeometryBuilder = function () {
        /**
         * Number of floats per vertex in the vertex layout.
         * @type {number}
         * @private
         */
        this._vertexSize = 9; // position(3) + light(1) + UV(2) + normal(3)
    };

    /**
     * Check if a block is transparent (should show adjacent faces).
     *
     * Transparent blocks allow neighboring blocks' faces to be rendered.
     * Delegates to Donkeycraft.BlockTypes.isTransparent() when available,
     * falling back to hardcoded block ID checks.
     *
     * @param {number} blockId - The block ID to check.
     * @returns {boolean} True if the block is transparent/non-solid.
     */
    Donkeycraft.GeometryBuilder.prototype.isTransparent = function (blockId) {
        // Validate input
        if (!Number.isInteger(blockId) || blockId < 0) {
            return false;
        }

        // Prefer BlockTypes for accurate transparency checks.
        if (Donkeycraft.BlockTypes && typeof Donkeycraft.BlockTypes.isTransparent === 'function') {
            return Donkeycraft.BlockTypes.isTransparent(blockId);
        }
        // Fallback: air, water, lava, and common transparent blocks.
        switch (blockId) {
            case 0:  // air
            case 9:  // water
            case 10: // lava
            case 11: // still lava
                return true;
            default:
                return false;
        }
    };

    /**
     * Compute the Y bounds of actual blocks in a chunk for optimized mesh building.
     *
     * Scans upward from Y=0 to find the first non-air block (minY), then scans
     * downward from the world height limit to find the last non-air block (maxY).
     * Returns early once both bounds are found, avoiding iteration over all 256
     * levels when terrain is sparse.
     *
     * A block is any block with ID > 0 (including transparent blocks like water and lava).
     * This ensures that face culling correctly exposes adjacent chunk faces at terrain
     * boundaries. Adds 1 block of padding on each side to handle neighbor lookups
     * at chunk edges.
     *
     * Early exit optimization: breaks inner loops as soon as a non-air block is found
     * for each bound, then continues to the next bound search.
     *
     * @private
     * @param {Function} getBlockFunc - Function(localX, y, localZ) returning block ID at chunk position.
     * @returns {{minY: number, maxY: number}} Y bounds (inclusive), or `{minY: 0, maxY: WORLD_HEIGHT - 1}`
     *    if no blocks are found in the chunk.
     */
    Donkeycraft.GeometryBuilder.prototype._computeChunkYBounds = function (getBlockFunc) {
        var minY = -1, maxY = -1;

        // Scan upward from Y=0 to find minY
        for (var y = 0; y < WORLD_HEIGHT && minY < 0; y++) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    if (getBlockFunc(x, y, z) !== 0) { minY = y; break; }
                }
                if (minY >= 0) break;
            }
        }

        // Scan downward from Y=WORLD_HEIGHT-1 to find maxY
        for (var y = WORLD_HEIGHT - 1; y >= 0 && maxY < 0; y--) {
            for (var x = 0; x < CHUNK_SIZE; x++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    if (getBlockFunc(x, y, z) !== 0) { maxY = y; break; }
                }
                if (maxY >= 0) break;
            }
        }

        // No blocks found — return full range
        if (minY < 0 || maxY < 0) return { minY: 0, maxY: WORLD_HEIGHT - 1 };

        // Add 1 block padding for neighbor face culling
        if (minY > 0) minY--;
        if (maxY < WORLD_HEIGHT - 1) maxY++;
        return { minY: Math.max(0, minY), maxY: Math.min(WORLD_HEIGHT - 1, maxY) };
    };

    /**
     * Build geometry data for a single chunk mesh.
     *
     * Iterates over all blocks in the chunk's Y-bounds, checking each of the six
     * face directions. A face is included only if the adjacent block is transparent
     * (face culling). Uses pre-allocated typed arrays with worst-case capacity to
     * minimize GC pressure, then trims to actual size before returning.
     *
     * For each visible face:
     * 1. Computes world-space corner positions from face geometry
     * 2. Looks up face-specific UV coordinates via BlockModelRegistry (handles special
     *    blocks like grass, logs, chests with per-face textures)
     * 3. Bakes the face's light intensity into vertex data
     * 4. Stores the face normal for lighting calculations in the shader
     *
     * Y-bounds optimization: computes minY/maxY for the chunk and only iterates
     * blocks within that range, avoiding unnecessary work on empty Y levels.
     *
     * Vertex layout (9 floats per vertex):
     *   [0-2]   position:  x, y, z in world coordinates
     *   [3]     light:     baked face light intensity (0.0–1.0)
     *   [4-5]   UV:        normalized texture atlas coordinates
     *   [6-8]   normal:    face normal vector (nx, ny, nz)
     *
     * Index layout (6 indices per quad): two triangles with CCW winding
     * `(v0, v1, v2)` and `(v0, v2, v3)`.
     *
     * @param {number} chunkX - X coordinate of the chunk.
     * @param {number} chunkZ - Z coordinate of the chunk.
     * @param {Function} getBlockFunc - Function(localX, y, localZ) returning block ID at chunk position.
     * @returns {{vertices: Float32Array, indices: Uint32Array, vertexCount: number, indexCount: number, useUint32: boolean}}
     *    Geometry object with trimmed vertex/index arrays and counts. Returns empty
     *    geometry (0 vertices, 0 indices) if `getBlockFunc` is invalid or all blocks are air.
     */
    Donkeycraft.GeometryBuilder.prototype.buildChunk = function (chunkX, chunkZ, getBlockFunc) {
        // Validate chunk coordinates are integers
        if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
            Donkeycraft.Logger.warn('GeometryBuilder',
                'buildChunk: non-integer chunk coordinates [' + chunkX + ',' + chunkZ + '] — clamping');
            chunkX = Math.floor(chunkX);
            chunkZ = Math.floor(chunkZ);
        }

        // Validate the block getter function
        if (typeof getBlockFunc !== 'function') {
            Donkeycraft.Logger.error('GeometryBuilder',
                'buildChunk: getBlockFunc is not a function for chunk [' + chunkX + ',' + chunkZ + ']');
            return { vertices: new Float32Array(0), indices: new Uint32Array(0), vertexCount: 0, indexCount: 0, useUint32: true };
        }

        // Compute Y bounds to avoid iterating all 256 levels when terrain is sparse.
        var yBounds = this._computeChunkYBounds(getBlockFunc);
        var startY = yBounds.minY;
        var endY = yBounds.maxY;

        // Pre-allocate with worst-case capacity (all faces visible) to prevent silent
        // data loss from typed array overflow when terrain has many transparent blocks.
        // Arrays are trimmed to actual size before returning via subarray().
        var yRange = endY - startY + 1;
        var maxVerts = CHUNK_SIZE * yRange * CHUNK_SIZE * 6 * 4; // Worst case: all faces visible
        var maxIndices = maxVerts / 4 * 6; // 6 indices per quad

        var vertices = new Float32Array(maxVerts * 9);
        var indices = new Uint32Array(maxIndices);

        var vertOffset = 0;
        var idxOffset = 0;

        for (var x = 0; x < CHUNK_SIZE; x++) {
            for (var y = startY; y <= endY; y++) {
                for (var z = 0; z < CHUNK_SIZE; z++) {
                    var blockId = getBlockFunc(x, y, z);

                    // Skip air blocks — they have no visible faces
                    if (!Number.isInteger(blockId) || blockId <= 0) continue;

                    var worldX = chunkX * CHUNK_SIZE + x;
                    var worldY = y;
                    var worldZ = chunkZ * CHUNK_SIZE + z;

                    for (var f = 0; f < FACES.length; f++) {
                        var face = FACES[f];
                        var nx = worldX + face.dir[0];
                        var ny = worldY + face.dir[1];
                        var nz = worldZ + face.dir[2];

                        var adjBlock = this._getBlockAt(nx, ny, nz, getBlockFunc, chunkX, chunkZ);

                        if (!this.isTransparent(adjBlock)) continue;

                        // Look up face-specific UV coordinates via BlockModelRegistry.
                        // This ensures special blocks (grass, logs, chests, furnaces, etc.)
                        // render with the correct texture for each face direction.
                        var uvOffset = this._getBlockUV(blockId, face.name);
                        var dir = face.dir;
                        var light = face.light;

                        // Reserve space for 4 vertices (one quad)
                        var vertBase = vertOffset;
                        for (var c = 0; c < 4; c++) {
                            var corner = face.corners[c];
                            var uvCorner = face.uvCorners[c];
                            var vBase = vertOffset * 9;
                            vertices[vBase] = worldX + corner[0];
                            vertices[vBase + 1] = worldY + corner[1];
                            vertices[vBase + 2] = worldZ + corner[2];
                            vertices[vBase + 3] = light;
                            vertices[vBase + 4] = uvOffset.u0 + uvCorner[0] * (uvOffset.u1 - uvOffset.u0);
                            vertices[vBase + 5] = uvOffset.v0 + uvCorner[1] * (uvOffset.v1 - uvOffset.v0);
                            vertices[vBase + 6] = dir[0];
                            vertices[vBase + 7] = dir[1];
                            vertices[vBase + 8] = dir[2];
                            vertOffset++;
                        }

                        // Reserve space for 6 indices (two triangles)
                        var idxBase = idxOffset;
                        indices[idxBase] = vertBase + 0;
                        indices[idxBase + 1] = vertBase + 1;
                        indices[idxBase + 2] = vertBase + 2;
                        indices[idxBase + 3] = vertBase + 0;
                        indices[idxBase + 4] = vertBase + 2;
                        indices[idxBase + 5] = vertBase + 3;
                        idxOffset += 6;
                    }
                }
            }
        }

        // Trim arrays to actual size (removes unused pre-allocated space)
        var vertexCount = vertOffset;
        var indexCount = idxOffset;

        return {
            vertices: vertices.subarray(0, vertexCount * 9),
            indices: indices.subarray(0, indexCount),
            vertexCount: vertexCount,
            indexCount: indexCount,
            useUint32: true
        };
    };

    /**
     * Get block ID at world coordinates, handling chunk boundary lookups.
     *
     * For in-bounds coordinates (within the current chunk's X/Z range and valid Y),
     * delegates to `getBlockFunc` with local chunk coordinates. Returns air (0) for
     * out-of-bounds coordinates to expose chunk-edge faces, matching the debug
     * renderer's behavior when adjacent chunks are missing or unloaded.
     *
     * This ensures that:
     * - Chunk edges always show faces when neighbor chunks are not yet loaded
     * - Underground tunnels/caves correctly expose interior faces
     * - No out-of-bounds errors occur during face culling lookups
     *
     * @private
     * @param {number} nx - Neighboring X coordinate (world space).
     * @param {number} ny - Neighboring Y coordinate (world space).
     * @param {number} nz - Neighboring Z coordinate (world space).
     * @param {Function} getBlockFunc - Block getter function `getBlockFunc(localX, y, localZ)`.
     * @param {number} chunkX - Current chunk X coordinate (world space).
     * @param {number} chunkZ - Current chunk Z coordinate (world space).
     * @returns {number} Block ID at the given world coordinates. Returns 0 (air) for
     *    out-of-bounds lookups.
     */
    Donkeycraft.GeometryBuilder.prototype._getBlockAt = function (nx, ny, nz, getBlockFunc, chunkX, chunkZ) {
        var localX = nx - chunkX * CHUNK_SIZE;
        var localZ = nz - chunkZ * CHUNK_SIZE;

        // Validate all parameters before lookup
        if (typeof getBlockFunc !== 'function' ||
            !Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
            return 0;
        }

        if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT) {
            var blockId = getBlockFunc(localX, ny, localZ);
            // Ensure we return a valid integer block ID
            return Number.isInteger(blockId) ? blockId : 0;
        }

        // Out of bounds — treat as air (show faces on chunk edges).
        // This matches the debug renderer's behavior and ensures chunk-edge faces
        // are exposed when adjacent chunks are missing or unloaded.
        return 0;
    };

    /**
     * Get UV coordinates for a block face from the texture atlas.
     *
     * Three-tier lookup strategy ensures correct textures for all block types:
     * 1. **Primary**: `BlockModelRegistry.getFaceUV()` — provides face-specific texture
     *    lookups for special blocks (grass block top vs side, log bark vs wood, chest front vs side, etc.)
     * 2. **Secondary**: `TextureAtlas.getBlockUV()` static method — simple single-texture blocks
     * 3. **Fallback**: Tile-based calculation using the standard atlas grid layout
     *    (`col = blockId % 16`, `row = floor(blockId / 16)`)
     *
     * Vertex UV mapping uses the returned coordinates with linear interpolation:
     *   `u = u0 + cornerU * (u1 - u0)`
     *   `v = v0 + cornerV * (v1 - v0)`
     *
     * Block IDs >= 256 fall back to the placeholder texture (ID 0) in tiers 1 and 2.
     * Tier 3 clamps tileV to atlas bounds for overflow block IDs.
     *
     * @private
     * @param {number} blockId - The block ID (must be a non-negative integer).
     * @param {string} faceName - Face name (e.g., `"up"`, `"down"`, `"north"`, `"south"`, `"east"`, `"west"`).
     * @returns {{u0: number, v0: number, u1: number, v1: number}} UV corner coordinates in normalized [0,1] range.
     *    `{u0, v0}` = bottom-left corner, `{u1, v1}` = top-right corner of the texture tile.
     *    Returns a single-tile UV on invalid blockId (fallback to placeholder).
     */
    Donkeycraft.GeometryBuilder.prototype._getBlockUV = function (blockId, faceName) {
        // Validate blockId is a non-negative integer
        if (!Number.isInteger(blockId) || blockId < 0) {
            Donkeycraft.Logger.warn('GeometryBuilder',
                '_getBlockUV: invalid blockId ' + blockId + ' — returning placeholder UV');
            return { u0: 0, v0: 0, u1: 1 / ATLAS_GRID, v1: 1.0 };
        }

        // Validate faceName
        if (typeof faceName !== 'string' || faceName.length === 0) {
            Donkeycraft.Logger.warn('GeometryBuilder',
                '_getBlockUV: invalid faceName "' + faceName + '" — falling back to tile-based UV');
            // Fall through to tile-based fallback
            faceName = null;
        }

        // ---- Tier 1: BlockModelRegistry for face-specific UV lookup ----
        // Handles special blocks with different textures per face:
        //   grass_block → top=grass_block_top, sides=grass_block_side, bottom=dirt
        //   oak_log → top/bottom=oak_log_top, sides=oak_log_side
        //   chest → front=chest_front, sides=top/bottom=oak_planks
        //   furnace → top/bottom/sides=smooth_stone, front=furnace_front
        if (Donkeycraft.BlockModelRegistry && typeof Donkeycraft.BlockModelRegistry.getFaceUV === 'function') {
            var faceUV = Donkeycraft.BlockModelRegistry.getFaceUV(blockId, faceName);
            if (faceUV && faceUV.u !== undefined) {
                return {
                    u0: faceUV.u,
                    v0: faceUV.v,
                    u1: faceUV.u + faceUV.uSize,
                    v1: faceUV.v + faceUV.vSize
                };
            }
        }

        // ---- Tier 2: TextureAtlas static method for simple block UV lookup ----
        // Used by blocks with a single texture per face (most standard blocks).
        if (Donkeycraft.TextureAtlas && typeof Donkeycraft.TextureAtlas.getBlockUV === 'function') {
            var uv = Donkeycraft.TextureAtlas.getBlockUV(blockId);
            if (uv && uv.u0 !== undefined) {
                return {
                    u0: uv.u0,
                    v0: uv.v0,
                    u1: uv.u1,
                    v1: uv.v1
                };
            }
        }

        // ---- Tier 3: Tile-based UV calculation (ultimate fallback) ----
        // Assumes a 16-tile-wide atlas where blockId maps to tile position:
        //   col = blockId % 16, row = floor(blockId / 16)
        // texSubImage2D places row 0 at V=0, so no V-flip needed.
        var tileU = blockId % ATLAS_GRID;
        var tileV = Math.floor(blockId / ATLAS_GRID);

        // Clamp tileV to atlas bounds for block IDs >= 256 (overflow the 16×16 grid).
        if (tileV >= ATLAS_GRID) tileV = ATLAS_GRID - 1;

        return {
            u0: tileU / ATLAS_GRID,
            v0: tileV / ATLAS_GRID,
            u1: (tileU + 1) / ATLAS_GRID,
            v1: (tileV + 1) / ATLAS_GRID
        };
    };

    /**
     * Build a simple test quad for shader testing and debugging.
     *
     * Creates a single flat quad centered at `(0, y, 0)` with the given size.
     * All four vertices share the same normal `[0, 1, 0]` (pointing up)
     * and maximum light intensity `1.0`. UVs span `[0, 1] × [0, 1]`.
     *
     * Vertex layout (9 floats per vertex):
     *   [0-2] position:  world-space coordinates
     *   [3]   light:     1.0 (full brightness)
     *   [4-5] UV:        normalized `[0,1] × [0,1]`
     *   [6-8] normal:    `[0, 1, 0]` (upward-facing)
     *
     * @param {number} [size=1.0] - Width and height of the quad in blocks.
     * @param {number} [y=0.0] - Y coordinate (vertical position) of the quad.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     *    Geometry object with 4 vertices and 6 indices (two CCW triangles).
     */
    Donkeycraft.GeometryBuilder.prototype.buildQuad = function (size, y) {
        size = Math.max(0.001, size || 1.0);
        y = (y !== undefined) ? y : 0.0;
        var half = size / 2;

        // 4 vertices: position(3) + light(1) + UV(2) + normal(3) = 9 floats each
        // Winding: v0→v1→v2 (CCW), v0→v2→v3 (CCW) — front-facing when viewed from above
        return {
            vertices: new Float32Array([
                -half, y, -half, 1.0, 0, 0, 0, 1, 0,
                half, y, -half, 1.0, 1, 0, 0, 1, 0,
                half, y, half, 1.0, 1, 1, 0, 1, 0,
                -half, y, half, 1.0, 0, 1, 0, 1, 0
            ]),
            indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
            vertexCount: 4,
            indexCount: 6
        };
    };

    /**
     * Build a simple test cube for shader testing and debugging.
     *
     * Creates a cube centered at `(0, y, 0)` with equal dimensions on all axes.
     * Each face uses its own baked light intensity and normal vector:
     *   - +X (east):  light=0.8, normal=[1,0,0]
     *   - -X (west):  light=0.7, normal=[-1,0,0]
     *   - +Y (top):   light=1.0, normal=[0,1,0]
     *   - -Y (bottom):light=0.5, normal=[0,-1,0]
     *   - +Z (front): light=0.9, normal=[0,0,1]
     *   - -Z (back):  light=0.6, normal=[0,0,-1]
     *
     * UV coordinates are hardcoded per face for testing purposes (not atlas-based).
     * All vertices use CCW winding order for front-facing triangles.
     *
     * Vertex layout (9 floats per vertex):
     *   [0-2] position:  world-space coordinates relative to center
     *   [3]   light:     baked face intensity per face definition above
     *   [4-5] UV:        hardcoded test UVs (not atlas-mapped)
     *   [6-8] normal:    face normal vector
     *
     * @param {number} [size=1.0] - Width, height, and depth of the cube in blocks.
     * @param {number} [y=0.0] - Y coordinate of the cube's center.
     * @returns {{vertices: Float32Array, indices: Uint16Array, vertexCount: number, indexCount: number}}
     *    Geometry object with 24 vertices (6 faces × 4 corners) and 36 indices
     *    (6 faces × 2 triangles × 3 vertices).
     */
    Donkeycraft.GeometryBuilder.prototype.buildCube = function (size, y) {
        size = Math.max(0.001, size || 1.0);
        y = (y !== undefined) ? y : 0.0;
        var half = size / 2;

        // 24 vertices (6 faces × 4 corners)
        // Layout: position(3) + light(1) + UV(2) + normal(3) = 9 floats per vertex
        return {
            vertices: new Float32Array([
                // +X face
                half, y - half, -half, 0.8, 0.875, 0.75, 1, 0, 0,
                half, y + half, -half, 0.8, 0.875, 0.875, 1, 0, 0,
                half, y + half, half, 0.8, 0.875, 1.0, 1, 0, 0,
                half, y - half, half, 0.8, 0.875, 0.75, 1, 0, 0,
                // -X face
                -half, y - half, half, 0.7, 0.75, 0.75, -1, 0, 0,
                -half, y + half, half, 0.7, 0.75, 0.875, -1, 0, 0,
                -half, y + half, -half, 0.7, 0.75, 1.0, -1, 0, 0,
                -half, y - half, -half, 0.7, 0.75, 0.75, -1, 0, 0,
                // +Y face (top) — CCW viewed from above: cross product gives [0,+1,0]
                -half, y + half, 0, 1.0, 0.0, 0.0, 0, 1, 0,
                -half, y + half, half, 1.0, 0.125, 0.0, 0, 1, 0,
                half, y + half, half, 1.0, 0.125, 0.125, 0, 1, 0,
                half, y + half, 0, 1.0, 0.0, 0.125, 0, 1, 0,
                // -Y face (bottom) — CCW viewed from below: cross product gives [0,-1,0]
                -half, y - half, 0, 0.5, 0.0, 0.0, 0, -1, 0,
                half, y - half, 0, 0.5, 0.125, 0.0, 0, -1, 0,
                half, y - half, half, 0.5, 0.125, 0.125, 0, -1, 0,
                -half, y - half, half, 0.5, 0.0, 0.125, 0, -1, 0,
                // +Z face (front)
                half, y - half, half, 0.9, 0.25, 0.75, 0, 0, 1,
                half, y + half, half, 0.9, 0.25, 0.875, 0, 0, 1,
                -half, y + half, half, 0.9, 0.375, 0.875, 0, 0, 1,
                -half, y - half, half, 0.9, 0.375, 0.75, 0, 0, 1,
                // -Z face (back)
                -half, y - half, -half, 0.6, 0.25, 0.75, 0, 0, -1,
                -half, y + half, -half, 0.6, 0.25, 0.875, 0, 0, -1,
                half, y + half, -half, 0.6, 0.375, 0.875, 0, 0, -1,
                half, y - half, -half, 0.6, 0.375, 0.75, 0, 0, -1
            ]),
            indices: new Uint16Array([
                0, 1, 2, 0, 2, 3,       // +X
                4, 5, 6, 4, 6, 7,       // -X
                8, 9, 10, 8, 10, 11,     // +Y
                12, 13, 14, 12, 14, 15,  // -Y
                16, 17, 18, 16, 18, 19,  // +Z
                20, 21, 22, 20, 22, 23   // -Z
            ]),
            vertexCount: 24,
            indexCount: 36
        };
    };

})();