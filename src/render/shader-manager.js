// Donkeycraft — Shader Manager
// Shader compilation, linking, uniform/location caching.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // WeakMap for permanent program keys (avoids property pollution on WebGLProgram objects)
    var _programKeys = new WeakMap();
    var _programCounter = 0;

    /**
     * ShaderManager — Compiles, links, and manages WebGL shaders and programs.
     * Provides uniform and attribute location caching for efficient per-frame updates.
     * Programs are validated lazily on first use (not at link time) because WebGL 1
     * validation depends on the current GL state, which may not be fully set up yet.
     * @param {WebGLRenderingContext} gl - The WebGL 1 rendering context.
     */
    Donkeycraft.ShaderManager = function (gl) {
        this._gl = gl;
        this._programs = {};
        this._cachedLocations = {};
        this._shaderCount = 0;
        this._programCount = 0;
        this._currentProgram = null;
    };

    /**
     * Compile a shader from a source string.
     * Returns null and logs the GLSL compilation error on failure.
     * @param {string} source - GLSL shader source code.
     * @param {string} type - Shader type: 'vertex' or 'fragment'.
     * @returns {WebGLShader|null} The compiled shader, or null on failure.
     */
    Donkeycraft.ShaderManager.prototype.compileShader = function (source, type) {
        var gl = this._gl;
        if (!gl) {
            return null;
        }

        var shaderType = type === 'vertex' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
        var shader = gl.createShader(shaderType);

        if (!shader) {
            return null;
        }

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            var errorMsg = gl.getShaderInfoLog(shader);
            var shaderTypeName = type === 'vertex' ? 'Vertex' : 'Fragment';
            Donkeycraft.Logger.error('ShaderManager', shaderTypeName + ' shader compilation failed: ' + errorMsg);
            gl.deleteShader(shader);
            return null;
        }

        this._shaderCount++;
        return shader;
    };

    /**
     * Link a program from vertex and fragment shaders.
     * Does NOT validate via gl.validateProgram() at link time because WebGL 1 validation
     * checks against the current GL state (bound textures, active programs, etc.), which
     * may not be fully set up yet. Real validation happens lazily on first use.
     * @param {WebGLShader} vertShader - Compiled vertex shader.
     * @param {WebGLShader} fragShader - Compiled fragment shader.
     * @param {Array<{location:number, name:string}>} [attribLocations] - Optional array of
     *    `{location, name}` objects for attribute binding via gl.bindAttribLocation().
     * @returns {WebGLProgram|null} The linked program, or null on failure.
     */
    Donkeycraft.ShaderManager.prototype.linkProgram = function (vertShader, fragShader, attribLocations) {
        var gl = this._gl;
        if (!gl) return null;

        var program = gl.createProgram();
        if (!program) {
            return null;
        }

        gl.attachShader(program, vertShader);
        gl.attachShader(program, fragShader);

        if (attribLocations && Array.isArray(attribLocations)) {
            for (var i = 0; i < attribLocations.length; i++) {
                gl.bindAttribLocation(program, attribLocations[i].location, attribLocations[i].name);
            }
        }

        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            var errorMsg = gl.getProgramInfoLog(program);
            Donkeycraft.Logger.error('ShaderManager', 'Program link failed: ' + errorMsg);
            gl.deleteProgram(program);
            return null;
        }

        this._programCount++;
        return program;
    };

    /**
     * Cache uniform and attribute locations for a program.
     * Locations are preserved across re-links since WebGLProgram objects maintain stable layouts.
     * Handles both scalar and array uniform types.
     * @private
     * @param {WebGLProgram} program - The linked WebGL program to cache locations for.
     */
    Donkeycraft.ShaderManager.prototype._cacheLocations = function (program) {
        var gl = this._gl;
        if (!gl) return;

        var cacheKey = this._getProgramKey(program);
        if (!cacheKey) return;

        // Early exit if locations are already cached for this program.
        if (this._cachedLocations[cacheKey]) return;

        this._cachedLocations[cacheKey] = { uniforms: {}, attributes: {} };

        // Cache uniform locations.
        var uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < uniformCount; i++) {
            var uniformInfo = gl.getActiveUniform(program, i);
            if (!uniformInfo) continue;

            var baseLoc = gl.getUniformLocation(program, uniformInfo.name);
            this._cachedLocations[cacheKey].uniforms[uniformInfo.name] = baseLoc;

            // Handle arrays: cache each element individually.
            if (uniformInfo.size > 1) {
                for (var j = 0; j < uniformInfo.size; j++) {
                    var arrayName = uniformInfo.name + '[' + j + ']';
                    this._cachedLocations[cacheKey].uniforms[arrayName] =
                        gl.getUniformLocation(program, arrayName);
                }
            }
        }

        // Cache attribute locations.
        var attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
        for (var k = 0; k < attribCount; k++) {
            var attribInfo = gl.getActiveAttrib(program, k);
            if (attribInfo) {
                this._cachedLocations[cacheKey].attributes[attribInfo.name] =
                    gl.getAttribLocation(program, attribInfo.name);
            }
        }
    };

    /**
     * Get or assign a permanent key for a WebGLProgram using WeakMap.
     * Keys are prefixed with 'prog_' and auto-incremented for uniqueness.
     * @private
     * @param {WebGLProgram} program - The WebGL program to get the key for.
     * @returns {string|null} The program cache key, or null if no key could be assigned.
     */
    Donkeycraft.ShaderManager.prototype._getProgramKey = function (program) {
        var key = _programKeys.get(program);
        if (key) return key;

        key = 'prog_' + (_programCounter++);
        _programKeys.set(program, key);
        return key;
    };

    /**
     * Activate a cached program by name, caching uniform/attribute locations on first use.
     * @param {string} name - Program name (must match a key in the internal programs cache).
     * @returns {boolean} True if the program was found and activated successfully.
     */
    Donkeycraft.ShaderManager.prototype.use = function (name) {
        var gl = this._gl;
        if (!gl || !name || !this._programs[name]) return false;

        var program = this._programs[name];
        gl.useProgram(program);
        this._currentProgram = program;

        // Cache locations on first use
        this._cacheLocations(program);

        return true;
    };

    /**
     * Activate a WebGLProgram directly by reference, caching uniform/attribute locations on first use.
     * @param {WebGLProgram} program - The WebGL program to activate.
     * @returns {boolean} True if the program is valid and was activated successfully.
     */
    Donkeycraft.ShaderManager.prototype.useProgram = function (program) {
        var gl = this._gl;
        if (!gl || !program) return false;

        gl.useProgram(program);
        this._currentProgram = program;
        this._cacheLocations(program);
        return true;
    };

    /**
     * Get the currently active WebGLProgram reference.
     * @private
     * @returns {WebGLProgram|null} The active program, or null if no program is active.
     */
    Donkeycraft.ShaderManager.prototype._getActiveProgram = function () {
        return this._currentProgram || null;
    };

    /**
     * Get a cached or queried uniform location for the given program.
     * Queries the WebGL context if not found in cache, then stores the result.
     * @private
     * @param {WebGLProgram} prog - The WebGL program to query.
     * @param {string} name - Uniform name (e.g., 'uProjection', 'uFogColor[0]').
     * @returns {WebGLUniformLocation|null} The uniform location, or null if not found.
     */
    Donkeycraft.ShaderManager.prototype._getUniformLocation = function (prog, name) {
        var cacheKey = this._getProgramKey(prog);

        if (this._cachedLocations[cacheKey] &&
            this._cachedLocations[cacheKey].uniforms[name] !== undefined) {
            return this._cachedLocations[cacheKey].uniforms[name];
        }

        var gl = this._gl;
        var loc = gl.getUniformLocation(prog, name);

        if (loc !== null && cacheKey) {
            if (!this._cachedLocations[cacheKey]) {
                this._cachedLocations[cacheKey] = { uniforms: {}, attributes: {} };
            }
            this._cachedLocations[cacheKey].uniforms[name] = loc;
        }

        return loc;
    };

    /**
     * Set a uniform by name, delegating to the appropriate WebGL call.
     * Extracts arguments after 'name' and 'setter' from the arguments array.
     * @private
     * @param {string} name - Uniform name (e.g., 'uProjection', 'uFogColor').
     * @param {Function} setter - Function(gl, loc, ...args) that performs the WebGL uniform call.
     * @returns {boolean} True if the uniform was found and set successfully.
     */
    Donkeycraft.ShaderManager.prototype._setUniform = function (name, setter) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveProgram();
        if (!prog) return false;

        var loc = this._getUniformLocation(prog, name);
        if (loc === null) return false;

        // Extract arguments after 'name' and 'setter'.
        var args = [];
        for (var i = 2; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        setter.apply(null, [gl, loc].concat(args));
        return true;
    };

    /**
     * Set a mat4 uniform from a Matrix4 object.
     * Calls gl.uniformMatrix4fv(false) to upload the matrix in column-major order.
     * @param {string} name - Uniform name (e.g., 'uProjection', 'uView', 'uModel').
     * @param {Donkeycraft.Matrix4} value - Matrix4 instance (must have getData() returning Float32Array).
     * @returns {boolean} True if the uniform was found and set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setMat4 = function (name, value) {
        if (!value || typeof value.getData !== 'function') return false;
        var self = this;
        return this._setUniform(name, function (gl, loc, val) {
            if (loc) gl.uniformMatrix4fv(loc, false, val.getData());
        }, value);
    };

    /**
     * Set a vec3 uniform via gl.uniform3f().
     * @param {string} name - Uniform name (e.g., 'uFogColor').
     * @param {number} x - X component.
     * @param {number} y - Y component.
     * @param {number} z - Z component.
     * @returns {boolean} True if the uniform was found and set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setVec3 = function (name, x, y, z) {
        return this._setUniform(name, function (gl, loc, a, b, c) { gl.uniform3f(loc, a, b, c); }, x, y, z);
    };

    /**
     * Set a vec4 uniform via gl.uniform4f().
     * @param {string} name - Uniform name (e.g., 'uTopColor' if used as vec4).
     * @param {number} x - X component.
     * @param {number} y - Y component.
     * @param {number} z - Z component.
     * @param {number} w - W component.
     * @returns {boolean} True if the uniform was found and set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setVec4 = function (name, x, y, z, w) {
        return this._setUniform(name, function (gl, loc, a, b, c, d) { gl.uniform4f(loc, a, b, c, d); }, x, y, z, w);
    };

    /**
     * Set a vec2 uniform via gl.uniform2f().
     * @param {string} name - Uniform name (e.g., 'aUV' if used as uniform).
     * @param {number} x - X component.
     * @param {number} y - Y component.
     * @returns {boolean} True if the uniform was found and set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setVec2 = function (name, x, y) {
        return this._setUniform(name, function (gl, loc, a, b) { gl.uniform2f(loc, a, b); }, x, y);
    };

    /**
     * Set a float (1D) uniform.
     * @param {string} name - Uniform name.
     * @param {number} value - Float value.
     * @returns {boolean} True if uniform was found and set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setFloat = function (name, value) {
        return this._setUniform(name, function (gl, loc, v) { gl.uniform1f(loc, v); }, value);
    };

    /**
     * Set an integer (1D) uniform via gl.uniform1i().
     * Commonly used for sampler units (e.g., `setSampler`) and boolean flags (int).
     * @param {string} name - Uniform name (e.g., 'uHasTexture', 'uHasColorOverlay').
     * @param {number} value - Integer value (0 or 1 for boolean-like uniforms).
     * @returns {boolean} True if the uniform was found and set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setInt = function (name, value) {
        return this._setUniform(name, function (gl, loc, v) { gl.uniform1i(loc, v); }, value);
    };

    /**
     * Set a sampler (texture unit) uniform.
     * Activates the specified texture unit before binding.
     * @param {string} name - Uniform name.
     * @param {number} [unit=0] - Texture unit number (typically 0-7 for WebGL 1).
     * @returns {boolean} True if uniform was found and set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setSampler = function (name, unit) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveProgram();
        if (!prog) return false;

        unit = unit || 0;
        var loc = this._getUniformLocation(prog, name);
        if (loc === null) return false;

        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.uniform1i(loc, unit);
        return true;
    };

    /**
     * Get an attribute location by name from the currently active program.
     * Queries the internal cache first, then falls back to gl.getAttribLocation().
     * @param {string} name - Attribute name (e.g., 'aPosition', 'aUV', 'aNormal').
     * @returns {number} Attribute location index (0-based), or -1 if not found.
     */
    Donkeycraft.ShaderManager.prototype.getAttribute = function (name) {
        var currentKey = this._getCurrentProgramKey();
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].attributes[name] !== undefined) {
            return this._cachedLocations[currentKey].attributes[name];
        }

        var gl = this._gl;
        if (!gl) return -1;
        var prog = this._getActiveProgram();
        if (!prog) return -1;
        return gl.getAttribLocation(prog, name);
    };

    /**
     * Get a cached uniform location by name from the currently active program.
     * Queries the internal cache first, then falls back to gl.getUniformLocation().
     * @param {string} name - Uniform name (e.g., 'uProjection', 'uFogColor').
     * @returns {WebGLUniformLocation|null} The uniform location, or null if not found.
     */
    Donkeycraft.ShaderManager.prototype.getUniformLocation = function (name) {
        var currentKey = this._getCurrentProgramKey();
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].uniforms[name] !== undefined) {
            return this._cachedLocations[currentKey].uniforms[name];
        }

        var gl = this._gl;
        var prog = this._getActiveProgram();
        if (!gl || !prog) return null;
        return gl.getUniformLocation(prog, name);
    };

    /**
     * Retrieve a cached WebGLProgram by its name key.
     * @param {string} name - Program name (e.g., 'terrain', 'sky', 'gui', 'break').
     * @returns {WebGLProgram|null} The program object, or null if not found.
     */
    Donkeycraft.ShaderManager.prototype.getProgram = function (name) {
        return this._programs[name] || null;
    };

    /**
     * Get the cache key for the currently active program.
     * @private
     * @returns {string|null} The program cache key (e.g., 'prog_0'), or null if no program is active.
     */
    Donkeycraft.ShaderManager.prototype._getCurrentProgramKey = function () {
        var prog = this._getActiveProgram();
        if (!prog) return null;
        return this._getProgramKey(prog);
    };

    /**
     * Get shader compilation statistics.
     * @returns {{shaders: number, programs: number}} Object with `shaders` and `programs` counts.
     */
    Donkeycraft.ShaderManager.prototype.getStats = function () {
        return {
            shaders: this._shaderCount,
            programs: this._programCount
        };
    };

    /**
     * Create a WebGL program from GLSL source strings with full error handling.
     * Compiles vertex and fragment shaders, links them, caches by name, and deletes
     * shader objects after linking (they are no longer needed).
     * @param {string} name - Program identifier for caching (e.g., 'terrain', 'sky').
     *    If null or empty, the program is returned but not cached.
     * @param {string} vertSource - Vertex shader GLSL source code.
     * @param {string} fragSource - Fragment shader GLSL source code.
     * @param {Array<{location:number, name:string}>} [attribLocations] - Optional array of
     *    `{location, name}` objects for attribute binding via gl.bindAttribLocation().
     * @returns {WebGLProgram|null} The linked program, or null on compilation/link failure.
     */
    Donkeycraft.ShaderManager.prototype.createProgram = function (name, vertSource, fragSource, attribLocations) {
        var vertShader = this.compileShader(vertSource, 'vertex');
        if (!vertShader) return null;

        var fragShader = this.compileShader(fragSource, 'fragment');
        if (!fragShader) {
            this._gl.deleteShader(vertShader);
            return null;
        }

        var program = this.linkProgram(vertShader, fragShader, attribLocations);
        if (!program) {
            this._gl.deleteShader(vertShader);
            this._gl.deleteShader(fragShader);
            return null;
        }

        // Delete shaders after linking (no longer needed)
        this._gl.deleteShader(vertShader);
        this._gl.deleteShader(fragShader);

        if (name) {
            this._programs[name] = program;
        }

        return program;
    };

    /**
     * Read shader sources from DOM script tags and create all standard programs.
     * Expects `<script type="text/plain" id="dk-vertex-shaders">` and
     * `<script type="text/plain" id="dk-fragment-shaders">` containing JavaScript
     * template literal variable declarations (e.g., `var TERRAIN_VERTEX_SHADER = \`...\`;`).
     * Creates the following programs: 'terrain', 'sky', 'gui', 'break'.
     * - **terrain**: TERRAIN_VERTEX_SHADER + TERRAIN_FRAGMENT_SHADER
     * - **sky**: SKY_VERTEX_SHADER + SKY_FRAGMENT_SHADER
     * - **gui**: GUI_VERTEX_SHADER + GUI_FRAGMENT_SHADER
     * - **break**: BREAK_VERTEX_SHADER + GUI_FRAGMENT_SHADER (particles use the GUI shader)
     * @returns {Object|null} Object with keys `{terrain, sky, gui, break}` mapping to WebGLProgram
     *    references, or null if any required shader source is missing.
     */
    Donkeycraft.ShaderManager.prototype.createProgramsFromDOM = function () {
        var gl = this._gl;
        if (!gl) return null;

        // Extract shader source code from DOM script tags
        var vertexScript = document.getElementById('dk-vertex-shaders');
        var fragmentScript = document.getElementById('dk-fragment-shaders');

        if (!vertexScript || !fragmentScript) return null;

        var vertexText = vertexScript.textContent || vertexScript.innerText;
        var fragmentText = fragmentScript.textContent || fragmentScript.innerText;

        // Parse shader variables from the text content.
        // Format: var SHADER_NAME = `...`;
        var self = this;

        function extractShaders(text) {
            var shaders = {};
            var regex = /var\s+(\w+_SHADER)\s*=\s*`([^`]*)`/g;
            var match;
            while ((match = regex.exec(text)) !== null) {
                shaders[match[1]] = match[2];
            }
            return shaders;
        }

        var vertexShaders = extractShaders(vertexText);
        var fragmentShaders = extractShaders(fragmentText);

        // Create terrain program (terrain vertex + terrain fragment)
        var terrainVert = vertexShaders.TERRAIN_VERTEX_SHADER;
        var terrainFrag = fragmentShaders.TERRAIN_FRAGMENT_SHADER;
        if (!terrainVert || !terrainFrag) return null;
        var terrainProg = this.createProgram('terrain', terrainVert, terrainFrag);

        // Create sky program (sky vertex + sky fragment)
        var skyVert = vertexShaders.SKY_VERTEX_SHADER;
        var skyFrag = fragmentShaders.SKY_FRAGMENT_SHADER;
        if (!skyVert || !skyFrag) return null;
        var skyProg = this.createProgram('sky', skyVert, skyFrag);

        // Create gui program (gui vertex + gui fragment)
        var guiVert = vertexShaders.GUI_VERTEX_SHADER;
        var guiFrag = fragmentShaders.GUI_FRAGMENT_SHADER;
        if (!guiVert || !guiFrag) return null;
        var guiProg = this.createProgram('gui', guiVert, guiFrag);

        // Create break program (break vertex + gui fragment — particles use GUI shader)
        var breakVert = vertexShaders.BREAK_VERTEX_SHADER;
        if (!breakVert || !guiFrag) return null;
        var breakProg = this.createProgram('break', breakVert, guiFrag);

        // Create water program (water vertex + water fragment — semi-transparent water surface)
        var waterVert = vertexShaders.WATER_VERTEX_SHADER;
        var waterFrag = fragmentShaders.WATER_FRAGMENT_SHADER;
        if (!waterVert || !waterFrag) return null;
        var waterProg = this.createProgram('water', waterVert, waterFrag);

        // Create entity program (entity vertex + entity fragment — flat-color animated entities)
        var entityVert = vertexShaders.ENTITY_VERTEX_SHADER;
        var entityFrag = fragmentShaders.ENTITY_FRAGMENT_SHADER;
        if (!entityVert || !entityFrag) return null;
        var entityProg = this.createProgram('entity', entityVert, entityFrag);

        // Verify all programs were created
        if (!terrainProg || !skyProg || !guiProg || !breakProg || !waterProg || !entityProg) return null;

        return {
            terrain: terrainProg,
            sky: skyProg,
            gui: guiProg,
            break: breakProg,
            water: waterProg,
            entity: entityProg
        };
    };

    /**
     * Destroy all programs, clear caches, and free GPU resources.
     * Resets all internal counters, state, and the active program reference.
     */
    Donkeycraft.ShaderManager.prototype.destroy = function () {
        var gl = this._gl;
        if (!gl) return;

        // Delete all cached programs to free GPU resources.
        for (var name in this._programs) {
            if (this._programs.hasOwnProperty(name)) {
                gl.deleteProgram(this._programs[name]);
            }
        }

        this._programs = {};
        this._cachedLocations = {};
        this._currentProgram = null;
        this._shaderCount = 0;
        this._programCount = 0;
    };

})();
