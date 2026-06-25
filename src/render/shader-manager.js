// Donkeycraft — Shader Manager
// Shader compilation, linking, uniform/location caching.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

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

        // Cache uniform and attribute locations
        this._cacheLocations(program);

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
     * Get a unique key for a program.
     * Uses the WebGLProgram object's identity (via a permanent internal property)
     * so that re-linking the same program doesn't invalidate cached locations.
     * @private
     * @param {WebGLProgram} program
     * @returns {string}
     */
    Donkeycraft.ShaderManager.prototype._getProgramKey = function(program) {
        var key = program._dcKey;
        if (key) return key;

        // Assign a permanent key based on the object's internal identity.
        // We use a counter since WebGLProgram objects don't have stable numeric IDs.
        if (!Donkeycraft.ShaderManager._dcCounter) {
            Donkeycraft.ShaderManager._dcCounter = 0;
        }
        program._dcKey = 'prog_' + (Donkeycraft.ShaderManager._dcCounter++);
        return program._dcKey;
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
     * Get the WebGLProgram for the currently active program.
     * @private
     * @returns {WebGLProgram|null}
     */
    Donkeycraft.ShaderManager.prototype._getActiveWebGLProgram = function() {
        if (this._currentProgram) return this._currentProgram;
        var gl = this._gl;
        return gl && gl.currentProgram || null;
    };

    /**
     * Set a mat4 uniform.
     * @param {string} name - Uniform name.
     * @param {Donkeycraft.Matrix4} value - Matrix4 value.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setMat4 = function(name, value) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveWebGLProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program currently active');
            return false;
        }

        // Try cached location first, fall back to GPU query + cache on miss
        var currentKey = this._getCurrentProgramKey();
        var loc = null;
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].uniforms[name] !== undefined) {
            loc = this._cachedLocations[currentKey].uniforms[name];
        } else {
            loc = gl.getUniformLocation(prog, name);
            // Cache on miss so future calls don't hit the GPU
            if (loc !== null && currentKey) {
                this._cachedLocations[currentKey].uniforms[name] = loc;
            }
        }

        if (!loc) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found: ' + name);
            return false;
        }

        gl.uniformMatrix4fv(loc, false, value.getData());
        return true;
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
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveWebGLProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program currently active');
            return false;
        }

        var currentKey = this._getCurrentProgramKey();
        var loc = null;
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].uniforms[name] !== undefined) {
            loc = this._cachedLocations[currentKey].uniforms[name];
        } else {
            loc = gl.getUniformLocation(prog, name);
            if (loc !== null && currentKey) {
                this._cachedLocations[currentKey].uniforms[name] = loc;
            }
        }

        if (!loc) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found: ' + name);
            return false;
        }

        gl.uniform3f(loc, x, y, z);
        return true;
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
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveWebGLProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program currently active');
            return false;
        }

        var currentKey = this._getCurrentProgramKey();
        var loc = null;
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].uniforms[name] !== undefined) {
            loc = this._cachedLocations[currentKey].uniforms[name];
        } else {
            loc = gl.getUniformLocation(prog, name);
            if (loc !== null && currentKey) {
                this._cachedLocations[currentKey].uniforms[name] = loc;
            }
        }

        if (!loc) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found: ' + name);
            return false;
        }

        gl.uniform4f(loc, x, y, z, w);
        return true;
    };

    /**
     * Set a vec2 uniform.
     * @param {string} name - Uniform name.
     * @param {number} x - X component.
     * @param {number} y - Y component.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setVec2 = function(name, x, y) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveWebGLProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program currently active');
            return false;
        }

        var currentKey = this._getCurrentProgramKey();
        var loc = null;
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].uniforms[name] !== undefined) {
            loc = this._cachedLocations[currentKey].uniforms[name];
        } else {
            loc = gl.getUniformLocation(prog, name);
            if (loc !== null && currentKey) {
                this._cachedLocations[currentKey].uniforms[name] = loc;
            }
        }

        if (!loc) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found: ' + name);
            return false;
        }

        gl.uniform2f(loc, x, y);
        return true;
    };

    /**
     * Set a float uniform.
     * @param {string} name - Uniform name.
     * @param {number} value - Float value.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setFloat = function(name, value) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveWebGLProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program currently active');
            return false;
        }

        var currentKey = this._getCurrentProgramKey();
        var loc = null;
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].uniforms[name] !== undefined) {
            loc = this._cachedLocations[currentKey].uniforms[name];
        } else {
            loc = gl.getUniformLocation(prog, name);
            if (loc !== null && currentKey) {
                this._cachedLocations[currentKey].uniforms[name] = loc;
            }
        }

        if (!loc) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found: ' + name);
            return false;
        }

        gl.uniform1f(loc, value);
        return true;
    };

    /**
     * Set an integer uniform (converted to float for WebGL).
     * @param {string} name - Uniform name.
     * @param {number} value - Integer value.
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setInt = function(name, value) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveWebGLProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program currently active');
            return false;
        }

        var currentKey = this._getCurrentProgramKey();
        var loc = null;
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].uniforms[name] !== undefined) {
            loc = this._cachedLocations[currentKey].uniforms[name];
        } else {
            loc = gl.getUniformLocation(prog, name);
            if (loc !== null && currentKey) {
                this._cachedLocations[currentKey].uniforms[name] = loc;
            }
        }

        if (!loc) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found: ' + name);
            return false;
        }

        gl.uniform1i(loc, value);
        return true;
    };

    /**
     * Set a sampler (texture unit) uniform.
     * @param {string} name - Uniform name.
     * @param {number} unit - Texture unit number (0-7 for WebGL 1).
     * @returns {boolean} True if uniform was set successfully.
     */
    Donkeycraft.ShaderManager.prototype.setSampler = function(name, unit) {
        var gl = this._gl;
        if (!gl) return false;

        var prog = this._getActiveWebGLProgram();
        if (!prog) {
            Donkeycraft.Logger.warn('ShaderManager', 'No program currently active');
            return false;
        }

        var currentKey = this._getCurrentProgramKey();
        var loc = null;
        if (currentKey && this._cachedLocations[currentKey] &&
            this._cachedLocations[currentKey].uniforms[name] !== undefined) {
            loc = this._cachedLocations[currentKey].uniforms[name];
        } else {
            loc = gl.getUniformLocation(prog, name);
            if (loc !== null && currentKey) {
                this._cachedLocations[currentKey].uniforms[name] = loc;
            }
        }

        if (!loc) {
            Donkeycraft.Logger.warn('ShaderManager', 'Uniform not found: ' + name);
            return false;
        }

        gl.activeTexture(gl.TEXTURE0 + (unit || 0));
        gl.uniform1i(loc, unit || 0);
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
     * Get a uniform location by name.
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
        var prog = this._getActiveWebGLProgram();
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
     * Get the current program's cache key.
     * @private
     * @returns {string|null}
     */
    Donkeycraft.ShaderManager.prototype._getCurrentProgramKey = function() {
        // Use tracked _currentProgram first, fall back to gl.currentProgram
        var prog = this._currentProgram;
        if (!prog) {
            var gl = this._gl;
            prog = gl && gl.currentProgram || null;
        }
        if (!prog) return null;

        // Return the cache key for this program
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