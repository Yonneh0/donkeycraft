// Donkeycraft — WebGL Context
// WebGL 1 context creation, error handling, capability queries.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * GLContext — WebGL 1 context wrapper with error handling, capability queries, and extension management.
     * Listens for 'webglcontextlost' and 'webglcontextrestored' events on the canvas.
     * @param {HTMLCanvasElement} canvas - The canvas element to create the WebGL context from.
     */
    Donkeycraft.GLContext = function (canvas) {
        this._canvas = canvas;
        this._context = null;
        this._capabilities = {};
        this._extensions = {};
        this._errorCount = 0;
        this._contextLost = false;
        this._onContextLost = null;
        this._onContextRestored = null;

        var success = this._createContext();
        if (!success) {
            Donkeycraft.Logger.error('GLContext', 'WebGL context creation failed during construction');
        }
    };

    /**
     * Create the WebGL 1 context from the canvas element and bind context lost/restored handlers.
     * @private
     * @returns {boolean}
     */
    Donkeycraft.GLContext.prototype._createContext = function () {
        var self = this;

        // Bind webglcontextlost handler
        this._onContextLost = function (event) {
            self._contextLost = true;
            event.preventDefault();
            Donkeycraft.Logger.error('GLContext', 'WebGL context lost — browser-initiated (GPU reset, tab crash, driver update)');
        };

        // Bind webglcontextrestored handler
        this._onContextRestored = function () {
            self._contextLost = false;
            self._queryCapabilities();
            Donkeycraft.Logger.info('GLContext', 'WebGL context restored — capabilities re-queried');
        };

        this._canvas.addEventListener('webglcontextlost', this._onContextLost, false);
        this._canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);

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
    Donkeycraft.GLContext.prototype._queryCapabilities = function () {
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
    Donkeycraft.GLContext.prototype.getGL = function () {
        return this._context;
    };

    /**
     * Get the WebGL context object (alias for getGL).
     * @returns {WebGLRenderingContext} The WebGL 1 rendering context.
     */
    Donkeycraft.GLContext.prototype.getContext = function () {
        return this._context;
    };

    /**
     * Get maximum texture size supported by the GPU.
     * @returns {number} Maximum texture size in pixels.
     */
    Donkeycraft.GLContext.prototype.getMaxTextureSize = function () {
        return this._capabilities.maxTextureSize || 0;
    };

    /**
     * Get maximum vertex uniforms count.
     * @returns {number} Max vertex uniform vectors.
     */
    Donkeycraft.GLContext.prototype.getMaxVertexUniforms = function () {
        return this._capabilities.maxVertexUniforms || 0;
    };

    /**
     * Check if a WebGL extension is supported and cache it for later use.
     * @param {string} name - Extension name (e.g., "OES_standard_derivatives").
     * @returns {boolean} True if the extension is available.
     */
    Donkeycraft.GLContext.prototype.isExtensionSupported = function (name) {
        if (!this._context || this._contextLost) return false;
        var ext = this._context.getExtension(name);
        if (ext) {
            this._extensions[name] = ext;
        }
        return ext !== null;
    };

    /**
     * Get a previously retrieved WebGL extension object.
     * @param {string} name - Extension name (e.g., "OES_standard_derivatives").
     * @returns {Object|null} The extension object, or null if not available.
     */
    Donkeycraft.GLContext.prototype.getExtension = function (name) {
        return this._extensions[name] || null;
    };

    /**
     * Check if the context is valid, active, and not lost.
     * @returns {boolean} True if context exists, is usable, and not lost.
     */
    Donkeycraft.GLContext.prototype.isValid = function () {
        return this._context !== null && !this._contextLost;
    };

    /**
     * Get the first WebGL error code and drain the entire error queue.
     * Logs each error found via Logger.warn. Returns null if no errors were found.
     * @returns {number|null} First WebGL error code (e.g., 0x0501 for INVALID_ENUM), or null if the queue was empty.
     */
    Donkeycraft.GLContext.prototype.getError = function () {
        if (!this._context || this._contextLost) return null;
        var firstErr = null;
        var err = this._context.getError();
        while (err !== 0) {
            this._errorCount++;
            if (firstErr === null) {
                firstErr = err;
            }
            Donkeycraft.Logger.warn('GLContext', 'WebGL error 0x' + err.toString(16));
            err = this._context.getError();
        }
        return firstErr;
    };

    /**
     * Reset the internal error counter to zero.
     */
    Donkeycraft.GLContext.prototype.resetErrorCount = function () {
        this._errorCount = 0;
    };

    /**
     * Get the current error count since the last reset.
     * @returns {number} Number of errors detected.
     */
    Donkeycraft.GLContext.prototype.getErrorCount = function () {
        return this._errorCount;
    };

    /**
     * Get queried capabilities.
     * @returns {Object} Capabilities object with texture size, units, renderer info, etc.
     */
    Donkeycraft.GLContext.prototype.getCapabilities = function () {
        return this._capabilities;
    };

    /**
     * Get the WebGL context attributes (alpha, antialias, depth, etc.).
     * @returns {GLContextAttributes|null} Context attributes object, or null if context is invalid.
     */
    Donkeycraft.GLContext.prototype.getContextAttributes = function () {
        if (!this._context || this._contextLost) return null;
        try {
            return this._context.getContextAttributes();
        } catch (e) {
            return null;
        }
    };

    /**
     * Check if the context was lost due to an external event (GPU reset, tab crash, etc.).
     * @returns {boolean} True if the context has been lost.
     */
    Donkeycraft.GLContext.prototype.isContextLost = function () {
        return this._contextLost;
    };

    /**
     * Set the canvas viewport dimensions.
     * @param {number} width - Viewport width in pixels.
     * @param {number} height - Viewport height in pixels.
     */
    Donkeycraft.GLContext.prototype.setViewport = function (width, height) {
        if (this._context) {
            this._context.viewport(0, 0, width, height);
        }
    };

    /**
     * Check whether the browser supports WebGL context restoration after a context lost event.
     * @returns {boolean} True if the context attribute 'preserveDrawingBuffer' is true (enabling restore).
     */
    Donkeycraft.GLContext.prototype.hasContextRestoreSupport = function () {
        var attrs = this.getContextAttributes();
        return attrs !== null && !!attrs.preserveDrawingBuffer;
    };

    /**
     * Destroy the context and free all WebGL resources.
     * Unbinds context lost/restored event listeners and gracefully loses the WebGL context via loseContext().
     */
    Donkeycraft.GLContext.prototype.destroy = function () {
        // Unbind context lost/restored event listeners
        if (this._canvas) {
            if (this._onContextLost) {
                this._canvas.removeEventListener('webglcontextlost', this._onContextLost, false);
                this._onContextLost = null;
            }
            if (this._onContextRestored) {
                this._canvas.removeEventListener('webglcontextrestored', this._onContextRestored, false);
                this._onContextRestored = null;
            }
        }

        if (this._context && !this._contextLost) {
            try {
                // Attempt graceful context loss (preserves drawing buffer if preserveDrawingBuffer was true).
                // loseContext is a non-standard extension method — check availability first.
                if (typeof this._context.loseContext === 'function') {
                    this._context.loseContext(true);
                }
            } catch (e) {
                // loseContext may not be supported on all browsers/platforms
                Donkeycraft.Logger.warn('GLContext', 'loseContext not available: ' + e.message);
            }
        }
        this._context = null;
        this._contextLost = true;
        this._capabilities = {};
        this._extensions = {};
        Donkeycraft.Logger.info('GLContext', 'Context destroyed');
    };

})();
