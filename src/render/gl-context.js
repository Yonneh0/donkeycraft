// Donkeycraft — WebGL Context
// WebGL 1 context creation, error handling, capability queries.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * GLContext — WebGL 1 context wrapper with error handling and capability queries.
     */
    Donkeycraft.GLContext = function(canvas) {
        this._canvas = canvas;
        this._context = null;
        this._capabilities = {};
        this._errorCount = 0;

        var success = this._createContext();
        if (!success) {
            Donkeycraft.Logger.error('GLContext', 'WebGL context creation failed during construction');
        }
    };

    /**
     * Create the WebGL 1 context from the canvas element.
     * @private
     * @returns {boolean}
     */
    Donkeycraft.GLContext.prototype._createContext = function() {
        try {
            this._context = this._canvas.getContext('webgl', {
                alpha: false,
                antialias: false,
                depth: true,
                stencil: false,
                preserveDrawingBuffer: true
            });

            if (!this._context) {
                Donkeycraft.Logger.error('GLContext', 'Failed to create WebGL 1 context');
                return false;
            }

            this._queryCapabilities();
            return true;

        } catch (e) {
            Donkeycraft.Logger.error('GLContext', 'WebGL context creation threw error: ' + e.message);
            return false;
        }
    };

    /**
     * Query WebGL capabilities and limits.
     * @private
     * @returns {void}
     */
    Donkeycraft.GLContext.prototype._queryCapabilities = function() {
        var gl = this._context;
        if (!gl) return;

        this._capabilities = {
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
            maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
            maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
            maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
            maxVertexTextureUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
            renderer: gl.getParameter(gl.RENDERER),
            vendor: gl.getParameter(gl.VENDOR),
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
        };

        Donkeycraft.Logger.info('GLContext', 'Capabilities: maxTextureSize=' +
            this._capabilities.maxTextureSize + ', textureUnits=' +
            this._capabilities.maxTextureUnits + ', renderer=' + this._capabilities.renderer);
    };

    /**
     * Get the WebGL context object.
     * @returns {WebGLRenderingContext} The WebGL 1 rendering context.
     */
    Donkeycraft.GLContext.prototype.getGL = function() {
        return this._context;
    };

    /**
     * Get the WebGL context object (alias for getGL).
     * @returns {WebGLRenderingContext} The WebGL 1 rendering context.
     */
    Donkeycraft.GLContext.prototype.getContext = function() {
        return this._context;
    };

    /**
     * Get maximum texture size supported by the GPU.
     * @returns {number} Maximum texture size in pixels.
     */
    Donkeycraft.GLContext.prototype.getMaxTextureSize = function() {
        return this._capabilities.maxTextureSize || 0;
    };

    /**
     * Get maximum vertex uniforms count.
     * @returns {number} Max vertex uniform vectors.
     */
    Donkeycraft.GLContext.prototype.getMaxVertexUniforms = function() {
        return this._capabilities.maxVertexUniforms || 0;
    };

    /**
     * Check if a WebGL extension is supported.
     * @param {string} name - Extension name (e.g., "OES_standard_derivatives").
     * @returns {boolean} True if the extension is available.
     */
    Donkeycraft.GLContext.prototype.isExtensionSupported = function(name) {
        if (!this._context) return false;
        return this._context.getExtension(name) !== null;
    };

    /**
     * Check if the context is valid and active.
     * @returns {boolean} True if context exists and is usable.
     */
    Donkeycraft.GLContext.prototype.isValid = function() {
        return this._context !== null;
    };

    /**
     * Get queried capabilities.
     * @returns {Object} Capabilities object with texture size, units, etc.
     */
    Donkeycraft.GLContext.prototype.getCapabilities = function() {
        return this._capabilities;
    };

    /**
     * Get the last WebGL error, if any.
     * @returns {number|null} WebGL error code or null if no error.
     */
    Donkeycraft.GLContext.prototype.getError = function() {
        if (!this._context) return null;
        var err = this._context.getError();
        if (err !== 0) {
            this._errorCount++;
            Donkeycraft.Logger.warn('GLContext', 'WebGL error detected: ' + err);
        }
        return err;
    };

    /**
     * Get the canvas element.
     * @returns {HTMLCanvasElement}
     */
    Donkeycraft.GLContext.prototype.getCanvas = function() {
        return this._canvas;
    };

    /**
     * Set the canvas viewport dimensions.
     * @param {number} width - Viewport width in pixels.
     * @param {number} height - Viewport height in pixels.
     */
    Donkeycraft.GLContext.prototype.setViewport = function(width, height) {
        if (this._context) {
            this._context.viewport(0, 0, width, height);
        }
    };

    /**
     * Destroy the context and free resources.
     */
    Donkeycraft.GLContext.prototype.destroy = function() {
        if (this._context) {
            this._context.clearColor(0, 0, 0, 1);
            this._context.clear(this._context.COLOR_BUFFER_BIT | this._context.DEPTH_BUFFER_BIT);
        }
        this._capabilities = {};
        Donkeycraft.Logger.info('GLContext', 'Context destroyed');
    };

})();