// Donkeycraft — Shader Manager
// Shader compilation, linking, uniform/location caching.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // WeakMap for permanent program keys (avoids property pollution on WebGLProgram objects)
    var _programKeys = new WeakMap();
    var _programCounter = 0;

    /**
     * ShaderManager — Compiles and manages WebGL shaders and programs.
     */
    Donkeycraft.ShaderManager = function(gl) {
        this._gl = gl;
        this._programs = {};
        this._cachedLocations = {};
        this._shaderCount = 0;
        this._programCount = 0;
        this._currentProgram = null; // Track the currently active WebGLProgram
    };

    /**
     * Compile a shader from a source string.
     * @param {string} source - GLSL shader source code.
     * @param {number} type - Shader type: VERTEX_SHADER or FRAGMENT_SHADER.
     * @returns {WebGLShader|null} The compiled shader, or null on failure.
     */
    Donkeycraft.ShaderManager.prototype.compileShader = function(source, type) {
        var gl = this._gl;
        if (!gl) {
            Donkeycraft.Logger.error('ShaderManager', 'WebGL context not available');
            return null;
        }

        var shaderType = type === 'vertex' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
        var shader = gl.createShader(shaderType);

        if (!shader) {
            Donkeycraft.Logger.error('ShaderManager', 'Failed to create shader of type ' + type);
            return null;
        }

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (!compiled) {
            var errorMsg = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            var typeStr = type === 'vertex' ? 'vertex' : 'fragment';
            Donkeycraft.Logger.error('ShaderManager', typeStr + ' shader compilation failed:\n' + source + '\nError: ' + errorMsg);
            return null;
        }

        this._shaderCount++;
        return shader;
    };

    /**
     * Link a program from vertex and fragment shaders.
     * @param {WebGLShader} vertShader - Compiled vertex shader.
     * @param {WebGLShader} fragShader - Compiled fragment shader.
     * @param {string[]} [attribLocations] - Optional attribute location bindings.
     * @returns {WebGLProgram|null} The linked program, or null on failure.
     */
    Donkeycraft.ShaderManager.prototype.linkProgram = function(vertShader, fragShader, attribLocations) {
        var gl = this._gl;
        if (!gl) return null;

        var program = gl.createProgram();
        if (!program) {
            Donkeycraft.Logger.error('ShaderManager', 'Failed to create program');
            return null;
        }

        gl.attachShader(program, vertShader);
        gl.attachShader(program, fragShader);

        // Bind attribute locations if provided
        if (attribLocations && Array.isArray(attribLocations)) {
            for (var i = 0; i < attribLocations.length; i++) {
                gl.bindAttribLocation(program, attribLocations[i].location, attribLocations[i].name);
            }
        }

        gl.linkProgram(program);

        var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!linked) {
            var errorMsg = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            Donkeycraft.Logger.error('ShaderManager', 'Program linking failed:\nError: ' + errorMsg);
            return null;
        }

        // NOTE: Do NOT check VALIDATE_STATUS here. In WebGL 1, VALIDATE_STATUS can
        // return false when required runtime state is missing (uniforms not set,
        // textures not bound, no active vertex attributes). This is a known Safari/WebKit
        // behavior where validation fails silently with an empty info log even for
        // perfectly valid programs. Validation is only meaningful after a draw call
        // has been attempted, so we skip it at link time and rely on LINK_STATUS only.

        this._programCount++;
        return program;
    };

    /**
     * Cache uniform and attribute locations for a program.
     * If locations are already cached (e.g., from a previous link), they are preserved
     * since WebGLProgram objects maintain stable attribute/uniform layouts across links.
     * @private
     * @param {WebGLProgram} program - The linked program to cache locations for.
     */
    Donkeycraft.ShaderManager.prototype._cacheLocations = function(program) {
        var gl = this._gl;
        var cacheKey = this._getProgramKey(program);

        // Only cache if not already present — preserves locations across re-links
        if (this._cachedLocations[cacheKey]) return;

        this._cachedLocations[cacheKey] = { uniforms: {}, attributes: {} };

        var uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < uniformCount; i++) {
            var uniformInfo = gl.getActiveUniform(program, i);
            if (uniformInfo) {
                var loc = gl.getUniformLocation(program, uniformInfo.name);
                this._cachedLocations[cacheKey].uniforms[uniformInfo.name] = loc;

                // Handle arrays: cache each element individually
                if (uniformInfo.size > 1 && uniformInfo.type === gl.FLOAT_VEC4) {
                    for (var j = 0; j < uniformInfo.size; j++) {
                        var arrayName = uniformInfo.name + '[' + j + ']';
                        this._cachedLocations[cacheKey].uniforms[arrayName] =
                            gl.getUniformLocation(program, arrayName);
                    }
                }
            }
        }

        // Cache attributes
        var attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
        for (var i = 0; i < attribCount; i++) {
            var attribInfo = gl.getActiveAttrib(program, i);
            if (attribInfo) {
                var attrLoc = gl.getAttribLocation(program, attribInfo.name);
                this._cachedLocations[cacheKey].attributes[attribInfo.name] = attrLoc;
            }
        }
    };

    /**
     * Get or assign a permanent key for a WebGLProgram using WeakMap.
     * @private
     * @param {WebGLProgram} program
     * @returns {string}
     */
    Donkeycraft.ShaderManager.prototype._getProgramKey = function(program) {
        var key = _programKeys.get(program);
        if (key) return key;

        key = 'prog_' + (_programCounter++);
        _programKeys.set(program, key);
        return key;
    };

    /**
     * Create and link a program from source strings.
     * @param {string} name - Program identifier for caching.
     * @param {string} vertSource - Vertex shader GLSL source.
     * @param {string} fragSource - Fragment shader GLSL source.
     * @param {string[]} [attribLocations] - Optional attribute location bindings.
     * @returns {WebGLProgram|null}
     */
    Donkeycraft.ShaderManager.prototype.createProgram = function(name, vertSource, fragSource, attribLocations) {
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
     * Use a cached program by name.
     * @param {string} name - Program name.
     * @returns {boolean} True if program was found and activated.
     */
    Donkeycraft.ShaderManager.prototype.use = function(name) {
        var gl = this._gl;
        if (!gl || !name || !this._programs[name]) return false;

        var program = this._programs[name];
        gl.useProgram(program);
        this._currentProgram = program; // Track active program
        return true;
    };

    /**
     * Use a program directly.
     * @param {WebGLProgram} program - The program to use.
     * @returns {boolean} True if program is valid.
     */
    Donkeycraft.ShaderManager.prototype.useProgram = function(program) {
        var gl = this._gl;
        if (!gl || !program) return false;
        gl.useProgram(program);
        this._currentProgram = program; // Track active program
        return true;
    };

    /**
     * Get the active WebGLProgram.
     * @private
     * @returns {WebGLProgram|null}
     */
    Donkeycraft.ShaderManager.prototype._getActiveProgram = function() {
        if (this._currentProgram) return this._currentProgram;
        var gl = this._gl;
        return gl && gl.currentProgram || null;
    };

    /**
     * Get a cached or queried uniform location for the given program.
     * @private
     * @param {WebGLProgram} prog - The WebGL program.
     * @param {string} name - Uniform name.
     * @returns {WebGLUniformLocation|null}
     */
    Donkeycraft.ShaderManager.prototype._getUniformLocation = function(prog, name) {
        var cacheKey = this._getProgramKey(prog);

        if (this._cachedLocations[cacheKey] &&
            this._cachedLocations[cacheKey].uniforms[name] !== undefined) {
            return this._cachedLocations[cacheKey].uniforms[name];
        }

        var gl = this._gl;
        var loc = gl.getUniformLocation(prog, name);

        if (loc !== null && cacheKey) {
            // Ensure cache entry exists for this program
            if (!this._cachedLocations[cacheKey]) {
                this._cachedLocations[cacheKey] = { uniforms: {}, attributes: {} };
            }
            this._cachedLocations[cacheKey].uniforms[name] = loc;
        }

        return loc;
    };

    /**
     * Set a uniform by name, delegating to the appropriate WebGL call.
     * @private
     * @param {string} name - Uniform name.
     * @param {Function} setter - Function(gl, loc, ...) that writes the uniform value.
     * @param {...*} args - Arguments to pass to the setter function.
     * @returns {boolean} True if the uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype._setUniform = function(name, setter) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program active when setting uniform: ' + name);
            return false;
        }

        var loc = this._getUniformLocation(prog, name);
        if (loc === null) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found in shader: ' + name);
            return false;
        }

        // Extract arguments after 'name' and 'setter'
        var args = [];
        for (var i = 2; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        setter.apply(null, [gl, loc].concat(args));
        return true;
    };

    /**
     * Set a mat4 uniform.
     * @param {string} name - Uniform name.
     * @param {Donkeycraft.Matrix4} value - Matrix4 value.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setMat4 = function(name, value) {
        var self = this;
        return this._setUniform(name, function(gl, loc, val) {
            loc && gl.uniformMatrix4fv(loc, false, val.getData());
        }, value);
    };

    /**
     * Set a vec3 uniform.
     * @param {string} name - Uniform name.
     * @param {number} x - X component.
     * @param {number} y - Y component.
     * @param {number} z - Z component.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setVec3 = function(name, x, y, z) {
        return this._setUniform(name, function(gl, loc, a, b, c) { gl.uniform3f(loc, a, b, c); }, x, y, z);
    };

    /**
     * Set a vec4 uniform.
     * @param {string} name - Uniform name.
     * @param {number} x - X component.
     * @param {number} y - Y component.
     * @param {number} z - Z component.
     * @param {number} w - W component.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setVec4 = function(name, x, y, z, w) {
        return this._setUniform(name, function(gl, loc, a, b, c, d) { gl.uniform4f(loc, a, b, c, d); }, x, y, z, w);
    };

    /**
     * Set a vec2 uniform.
     * @param {string} name - Uniform name.
     * @param {number} x - X component.
     * @param {number} y - Y component.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setVec2 = function(name, x, y) {
        return this._setUniform(name, function(gl, loc, a, b) { gl.uniform2f(loc, a, b); }, x, y);
    };

    /**
     * Set a float uniform.
     * @param {string} name - Uniform name.
     * @param {number} value - Float value.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setFloat = function(name, value) {
        return this._setUniform(name, function(gl, loc, v) { gl.uniform1f(loc, v); }, value);
    };

    /**
     * Set an integer uniform.
     * @param {string} name - Uniform name.
     * @param {number} value - Integer value.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setInt = function(name, value) {
        return this._setUniform(name, function(gl, loc, v) { gl.uniform1i(loc, v); }, value);
    };

    /**
     * Set a sampler (texture unit) uniform.
     * @param {string} name - Uniform name.
     * @param {number} [unit=0] - Texture unit number (0-7 for WebGL 1).
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setSampler = function(name, unit) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program active when setting uniform: ' + name);
            return false;
        }

        unit = unit || 0;
        var loc = this._getUniformLocation(prog, name);
        if (loc === null) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found in shader: ' + name);
            return false;
        }

        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.uniform1i(loc, unit);
        return true;
    };

    /**
     * Get an attribute location by name.
     * @param {string} name - Attribute name.
     * @returns {number|null} Attribute location index, or null if not found.
     */
    Donkeycraft.ShaderManager.prototype.getAttribute = function(name) {
        var currentKey = this._getCurrentProgramKey();
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].attributes[name] !== undefined) {
            return this._cachedLocations[currentKey].attributes[name];
        }

        var gl = this._gl;
        if (!gl || !gl.currentProgram) return null;
        return gl.getAttribLocation(gl.currentProgram, name);
    };

    /**
     * Get a uniform location by name (queries active program).
     * @param {string} name - Uniform name.
     * @returns {WebGLUniformLocation|null}
     */
    Donkeycraft.ShaderManager.prototype.getUniformLocation = function(name) {
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
     * Get a cached program by name.
     * @param {string} name - Program name.
     * @returns {WebGLProgram|null}
     */
    Donkeycraft.ShaderManager.prototype.getProgram = function(name) {
        return this._programs[name] || null;
    };

    /**
     * Get the cache key for the active program.
     * @private
     * @returns {string|null}
     */
    Donkeycraft.ShaderManager.prototype._getCurrentProgramKey = function() {
        var prog = this._getActiveProgram();
        if (!prog) return null;
        return this._getProgramKey(prog);
    };

    /**
     * Get shader compilation statistics.
     * @returns {{shaders: number, programs: number}} Count of compiled shaders and programs.
     */
    Donkeycraft.ShaderManager.prototype.getStats = function() {
        return {
            shaders: this._shaderCount,
            programs: this._programCount
        };
    };

    /**
     * Destroy all programs and free resources.
     */
    Donkeycraft.ShaderManager.prototype.destroy = function() {
        var gl = this._gl;
        if (!gl) return;

        for (var name in this._programs) {
            if (this._programs.hasOwnProperty(name)) {
                gl.deleteProgram(this._programs[name]);
            }
        }

        this._programs = {};
        this._cachedLocations = {};
        this._shaderCount = 0;
        this._programCount = 0;
    };

})();