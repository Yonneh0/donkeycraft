// Donkeycraft — Terrain Renderer
// Main rendering: chunk iteration, frustum culling, batched draws.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var CHUNK_SIZE = Donkeycraft.Config.CHUNK_SIZE; // 16
    var RENDER_DISTANCE = Donkeycraft.Config.RENDER_DISTANCE; // 8

    /**
     * TerrainRenderer — Manages rendering of the chunk-based terrain.
     * @param {WebGLRenderingContext} gl - The WebGL rendering context.
     * @param {ShaderManager} shaderManager - The shared shader manager instance.
     * @param {Fog} fog - The fog system instance.
     */
    Donkeycraft.TerrainRenderer = function(gl, shaderManager, fog) {
        this._gl = gl;
        this._shaderManager = shaderManager;
        this._fog = fog;

        // Chunk mesh storage: map "chunkX,chunkZ" → ChunkMesh
        this._chunks = {};
        this._chunkCount = 0;

        // Geometry builder and mesh optimizer
        this._geometryBuilder = new Donkeycraft.GeometryBuilder();
        this._meshOptimizer = new Donkeycraft.MeshOptimizer();

        // World data access — set by game loop
        this._getBlockFunc = null;
        this._loadedChunks = {}; // chunk key → { x, z }

        // Render state
        this._renderDistance = RENDER_DISTANCE;
    };

    /**
     * Set the world block getter function.
     * @param {Function} getBlockFunc - Function(worldX, worldY, worldZ) returning block ID.
     */
    Donkeycraft.TerrainRenderer.prototype.setWorldData = function(getBlockFunc) {
        this._getBlockFunc = getBlockFunc;
    };

    /**
     * Set the render distance in chunks.
     * @param {number} distance - Number of chunks to render (radius).
     */
    Donkeycraft.TerrainRenderer.prototype.setRenderDistance = function(distance) {
        this._renderDistance = distance;
    };

    /**
     * Get the current render distance.
     * @returns {number}
     */
    Donkeycraft.TerrainRenderer.prototype.getRenderDistance = function() {
        return this._renderDistance;
    };

    /**
     * Update chunk meshes that need rebuilding.
     * Called when blocks change or chunks enter render distance.
     * @param {number} playerChunkX - Player's chunk X coordinate.
     * @param {number} playerChunkZ - Player's chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype.updateChunks = function(playerChunkX, playerChunkZ) {
        var gl = this._gl;
        if (!gl || !this._getBlockFunc) return;

        // Determine which chunks should be loaded
        var neededChunks = {};
        for (var dx = -this._renderDistance; dx <= this._renderDistance; dx++) {
            for (var dz = -this._renderDistance; dz <= this._renderDistance; dz++) {
                if (dx * dx + dz * dz > this._renderDistance * this._renderDistance) continue;

                var cx = playerChunkX + dx;
                var cz = playerChunkZ + dz;
                var key = cx + ',' + cz;
                neededChunks[key] = { x: cx, z: cz };

                // Create chunk mesh if it doesn't exist
                if (!this._chunks[key]) {
                    this._createChunkMesh(cx, cz);
                }
            }
        }

        // Remove chunks that are no longer needed
        for (var key in this._chunks) {
            if (this._chunks.hasOwnProperty(key) && !neededChunks[key]) {
                this._chunks[key].destroy();
                delete this._chunks[key];
                this._chunkCount--;
            }
        }

        this._loadedChunks = neededChunks;
    };

    /**
     * Create a new chunk mesh.
     * @private
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype._createChunkMesh = function(chunkX, chunkZ) {
        var gl = this._gl;
        if (!gl || !this._getBlockFunc) return;

        // Build geometry
        var geometry = this._geometryBuilder.buildChunk(chunkX, chunkZ, this._getBlockFunc);

        // Optimize geometry
        var isBlockSolid = function(blockId) {
            return blockId !== 0 && blockId !== 9 && blockId !== 10 && blockId !== 11;
        };
        geometry = this._meshOptimizer.optimize(geometry, isBlockSolid);

        // Create chunk mesh object
        var chunkMesh = new Donkeycraft.ChunkMesh(gl, this._shaderManager);
        chunkMesh.update(geometry);

        var key = chunkX + ',' + chunkZ;
        this._chunks[key] = chunkMesh;
        this._chunkCount++;
    };

    /**
     * Force rebuild a specific chunk's mesh.
     * @param {number} chunkX - Chunk X coordinate.
     * @param {number} chunkZ - Chunk Z coordinate.
     */
    Donkeycraft.TerrainRenderer.prototype.rebuildChunk = function(chunkX, chunkZ) {
        var key = chunkX + ',' + chunkZ;
        if (this._chunks[key]) {
            this._chunks[key].destroy();
            delete this._chunks[key];
        }
        this._createChunkMesh(chunkX, chunkZ);
    };

    /**
     * Render all visible chunks.
     * @param {Camera} camera - The camera instance.
     */
    Donkeycraft.TerrainRenderer.prototype.render = function(camera) {
        var gl = this._gl;
        if (!gl || !this._shaderManager || !this._getBlockFunc) return;

        // Use terrain shader program
        if (!this._shaderManager.use('terrain')) return;

        // Set camera matrices
        var matrices = camera.getMatrices();
        this._shaderManager.setMat4('uProjection', matrices.projection);
        this._shaderManager.setMat4('uView', matrices.view);

        // Set model matrix (identity for world-space rendering)
        var identity = Donkeycraft.Matrix4.createIdentity();
        this._shaderManager.setMat4('uModel', identity);

        // Set texture unit (atlas on unit 0)
        gl.activeTexture(gl.TEXTURE0);
        // In Phase 2, use a placeholder — bind null texture or create one in Phase 3
        var placeholderTex = this._getPlaceholderTexture();
        if (placeholderTex) {
            gl.bindTexture(gl.TEXTURE_2D, placeholderTex);
        }
        this._shaderManager.setSampler('uTexture', 0);

        // Set fog uniforms
        if (this._fog) {
            this._fog.applyToFogUniforms(this._shaderManager);
        }

        // Draw each chunk
        for (var key in this._chunks) {
            if (this._chunks.hasOwnProperty(key)) {
                this._drawChunk(this._chunks[key]);
            }
        }
    };

    /**
     * Draw a single chunk mesh.
     * @private
     * @param {ChunkMesh} chunkMesh - The chunk mesh to draw.
     */
    Donkeycraft.TerrainRenderer.prototype._drawChunk = function(chunkMesh) {
        if (!chunkMesh || chunkMesh.getIndexCount() === 0) return;
        chunkMesh.draw();
    };

    /**
     * Get or create a placeholder texture for Phase 2.
     * @private
     * @returns {WebGLTexture|null}
     */
    Donkeycraft.TerrainRenderer.prototype._getPlaceholderTexture = function() {
        if (!this._gl) return null;

        if (!this._placeholderTexture) {
            // Create a 1×1 white texture as placeholder
            var gl = this._gl;
            this._placeholderTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this._placeholderTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        }

        return this._placeholderTexture;
    };

    /**
     * Get the number of rendered chunks.
     * @returns {number}
     */
    Donkeycraft.TerrainRenderer.prototype.getChunkCount = function() {
        return this._chunkCount;
    };

    /**
     * Destroy all chunk meshes and free resources.
     */
    Donkeycraft.TerrainRenderer.prototype.destroy = function() {
        for (var key in this._chunks) {
            if (this._chunks.hasOwnProperty(key)) {
                this._chunks[key].destroy();
            }
        }
        this._chunks = {};
        this._chunkCount = 0;

        // Delete placeholder texture
        if (this._gl && this._placeholderTexture) {
            this._gl.deleteTexture(this._placeholderTexture);
            this._placeholderTexture = null;
        }
    };

})();