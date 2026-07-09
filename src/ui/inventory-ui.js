// Donkeycraft — Player Inventory UI
// Player inventory panel with paperdoll, equipment slots, backpack grid, and main inventory grid.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * InventoryUI — manages the player inventory GUI panel.
     * Uses static HTML from index.html for paperdoll, equipment, and backpack slots.
     * Dynamically generates only the main inventory grid (43×6 = 258 slots).
     * @param {HTMLElement} [container=null] - DOM container for the inventory panel (auto-found if null).
     * @param {Donkeycraft.Hotbar} [hotbar=null] - Hotbar reference for button positioning.
     */
    Donkeycraft.InventoryUI = function (container, hotbar) {
        this._container = container || null;
        this._hotbar = hotbar || null;
        this._open = false;
        this._closing = false;

        // Inventory data
        this._playerInventory = null; // Donkeycraft.Inventory instance
        this._backpackInventory = null; // Donkeycraft.Inventory instance

        // DOM elements
        this._panelEl = null;
        this._gridEl = null; // The dynamically generated inventory grid
        this._toggleBtnEl = null;

        // Event subscriptions
        this._subscriptions = {};

        // Build DOM (find static panel, create toggle button and dynamic grid)
        this._initDOM();
    };

    /**
     * _initDOM — initializes the DOM structure from static HTML and creates dynamic elements.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._initDOM = function () {
        // Find the static panel from index.html
        this._panelEl = document.getElementById('dk-inventory-panel');

        if (this._panelEl) {
            // Wire up close button
            var closeBtn = document.getElementById('dk-inventory-close-btn');
            if (closeBtn) {
                var self = this;
                closeBtn.addEventListener('click', function () { self.close(); });
            }

            // Find or create the inventory grid container
            this._gridEl = document.getElementById('dk-inventory-grid');
            if (!this._gridEl) {
                // Grid container doesn't exist — create it
                var gridSection = this._panelEl.querySelector('.dk-inventory-grid-section');
                if (gridSection) {
                    var wrapper = gridSection.querySelector('.dk-inventory-grid-wrapper');
                    if (wrapper) {
                        this._gridEl = document.createElement('div');
                        this._gridEl.id = 'dk-inventory-grid';
                        this._gridEl.className = 'dk-inventory-grid';
                        wrapper.appendChild(this._gridEl);
                    }
                }
            }

            // Generate the dynamic inventory grid (258 slots)
            if (this._gridEl) {
                this._generateInventoryGrid();
            }
        }

        // Create toggle button
        this._buildToggleButton();
    };

    /**
     * _generateInventoryGrid — dynamically creates 258 inventory slot elements (43 rows × 6 cols).
     * @private
     */
    Donkeycraft.InventoryUI.prototype._generateInventoryGrid = function () {
        if (!this._gridEl) return;

        for (var row = 0; row < 43; row++) {
            for (var col = 0; col < 6; col++) {
                var slotIdx = row * 6 + col;
                var invSlot = document.createElement('div');
                invSlot.className = 'dk-inv-slot';

                var numEl = document.createElement('span');
                numEl.className = 'dk-slot-number';
                numEl.textContent = slotIdx + 1;
                invSlot.appendChild(numEl);

                var itemEl = document.createElement('div');
                itemEl.className = 'dk-slot-item';
                invSlot.appendChild(itemEl);

                this._gridEl.appendChild(invSlot);
            }
        }
    };

    /**
     * _buildToggleButton — creates the backpack emoji button left of the hotbar.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._buildToggleButton = function () {
        var self = this;
        var btn = document.createElement('button');
        btn.className = 'dk-inventory-toggle-btn';
        btn.textContent = '\uD83C\uDF92'; // 🎒 backpack emoji
        btn.title = 'Inventory (I)';

        btn.addEventListener('click', function () {
            self.toggle();
        });

        // Append to the actual .dk-hotbar element (centered), not the container
        var hotbarEl = document.querySelector('.dk-hotbar');
        if (hotbarEl) {
            hotbarEl.appendChild(btn);
        } else {
            // Fallback: append to container if hotbar not yet created
            document.getElementById('dk-hotbar-container').appendChild(btn);
        }
        this._toggleBtnEl = btn;
    };

    /**
     * open — opens the inventory panel with animation.
     * If currently closing, cancels the close and re-opens immediately.
     */
    Donkeycraft.InventoryUI.prototype.open = function () {
        // If closing, cancel the close and re-open immediately
        if (this._closing) {
            this._cancelClose();
            return;
        }

        if (this._open) return;

        this._open = true;
        this._closing = false;

        if (this._panelEl) {
            // Clear inline styles set by close() so CSS classes take effect
            this._panelEl.style.opacity = '';
            this._panelEl.style.pointerEvents = '';
            this._panelEl.classList.remove('closing');
            this._panelEl.classList.add('open');
        }

        if (this._toggleBtnEl) {
            this._toggleBtnEl.classList.add('active');
        }

        // Emit open event
        if (this._subscriptions.onOpen) {
            for (var i = 0; i < this._subscriptions.onOpen.length; i++) {
                try { this._subscriptions.onOpen[i](); } catch (e) { }
            }
        }
    };

    /**
     * close — closes the inventory panel with animation.
     */
    Donkeycraft.InventoryUI.prototype.close = function () {
        if (!this._open || this._closing) return;

        this._closing = true;

        if (this._panelEl) {
            this._panelEl.classList.add('closing');
            // Remove open class to trigger fade-out transition
            this._panelEl.classList.remove('open');
        }

        // After close animation completes, fully hide panel
        var self = this;
        this._closeTimeout = setTimeout(function () {
            if (self._panelEl) {
                self._panelEl.classList.remove('closing');
                self._panelEl.style.opacity = '0';
                self._panelEl.style.pointerEvents = 'none';
            }
            self._open = false;
            self._closing = false;

            if (self._toggleBtnEl) {
                self._toggleBtnEl.classList.remove('active');
            }

            // Emit close event
            if (self._subscriptions.onClose) {
                for (var i = 0; i < self._subscriptions.onClose.length; i++) {
                    try { self._subscriptions.onClose[i](); } catch (e) { }
                }
            }
        }, 2000); // Match CSS close transition duration
    };

    /**
     * _cancelClose — cancels an in-progress close animation and re-opens immediately.
     *
     * Clears the close timeout, resets internal state, and delegates to `open()`
     * to handle DOM updates and event emission, reducing code duplication.
     *
     * @private
     */
    Donkeycraft.InventoryUI.prototype._cancelClose = function () {
        // Clear the close timeout
        if (this._closeTimeout) {
            clearTimeout(this._closeTimeout);
            this._closeTimeout = null;
        }

        this._closing = false;

        // Delegate to open() for DOM updates and event emission.
        this.open();
    };

    /**
     * toggle — toggles the inventory open/close state.
     */
    Donkeycraft.InventoryUI.prototype.toggle = function () {
        if (this._open) {
            this.close();
        } else {
            this.open();
        }
    };

    /**
     * isOpen — checks if the inventory is currently open.
     * @returns {boolean}
     */
    Donkeycraft.InventoryUI.prototype.isOpen = function () {
        return this._open;
    };

    /**
     * setInventory — sets the inventory data source for this panel.
     * @param {Donkeycraft.Inventory} playerInv - Player's inventory.
     * @param {Donkeycraft.Inventory} [backpackInv=null] - Backpack/container inventory.
     */
    Donkeycraft.InventoryUI.prototype.setInventory = function (playerInv, backpackInv) {
        this._playerInventory = playerInv;
        this._backpackInventory = backpackInv || null;

        // Subscribe to slot change events for auto-updates
        if (this._playerInventory) {
            var self = this;
            this._playerInventory.onSlotChange(function (slotIdx, newStack) {
                self._updateSlotDisplay('player', slotIdx, newStack);
            });
        }

        if (this._backpackInventory) {
            var self2 = this;
            this._backpackInventory.onSlotChange(function (slotIdx, newStack) {
                self2._updateSlotDisplay('backpack', slotIdx, newStack);
            });
        }

        // Initial render
        this._renderAllSlots();
    };

    /**
     * _renderAllSlots — renders all slot displays from current inventory data.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._renderAllSlots = function () {
        this._renderPlayerSlots();
        this._renderBackpackSlots();
    };

    /**
     * _renderPlayerSlots — renders the player inventory slots (258 main grid).
     * @private
     */
    Donkeycraft.InventoryUI.prototype._renderPlayerSlots = function () {
        if (!this._playerInventory) return;

        var slotCount = Math.min(this._playerInventory.getSlotCount(), 258);
        for (var i = 0; i < slotCount; i++) {
            var slot = this._playerInventory.getSlot(i);
            this._updateSlotDisplay('player', i, slot);
        }
    };

    /**
     * _renderBackpackSlots — renders the backpack container slots (9 slots).
     * @private
     */
    Donkeycraft.InventoryUI.prototype._renderBackpackSlots = function () {
        if (!this._backpackInventory) return;

        for (var i = 0; i < 9; i++) {
            var slot = this._backpackInventory.getSlot(i);
            this._updateSlotDisplay('backpack', i, slot);
        }
    };

    /**
     * _updateSlotDisplay — updates a single slot's visual display.
     * @param {string} type - Slot type ('player', 'backpack', or 'equipment').
     * @param {number} index - Slot index within its section.
     * @param {Donkeycraft.ItemStack|null} stack - Stack to display.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._updateSlotDisplay = function (type, index, stack) {
        var slotEl = null;
        var itemEl = null;
        var countEl = null;

        if (type === 'player') {
            // Find the slot element in the inventory grid
            if (this._gridEl && index < this._gridEl.children.length) {
                slotEl = this._gridEl.children[index];
            }
        } else if (type === 'backpack') {
            var bpSlots = this._panelEl.querySelectorAll('.dk-backpack-slot');
            if (index < bpSlots.length) {
                slotEl = bpSlots[index];
            }
        }

        if (!slotEl) return;

        itemEl = slotEl.querySelector('.dk-slot-item');
        countEl = slotEl.querySelector('.dk-slot-count');

        if (!itemEl) return;

        if (!stack || stack.isEmpty()) {
            itemEl.textContent = '';
            if (countEl) countEl.style.display = 'none';
        } else {
            // Display item as emoji/character
            var itemId = stack.getItemId();
            itemEl.textContent = this._getItemDisplayChar(itemId);

            if (stack.getCount() > 1) {
                if (!countEl) {
                    countEl = document.createElement('span');
                    countEl.className = 'dk-slot-count';
                    slotEl.appendChild(countEl);
                }
                countEl.textContent = stack.getCount();
                countEl.style.display = '';
            } else {
                if (countEl) countEl.style.display = 'none';
            }
        }
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.InventoryUI.prototype._getItemDisplayChar = function (itemId) {
        var displayMap = {
            0: '',
            1: '🪨',
            3: '🟫',
            4: '🟩',
            5: '🪵',
            6: '🟨',
            7: '🟫',
            10: '⬛',
            11: '🔴',
            12: '🟡',
            14: '🟢',
            24: '🪵',
            30: '🪵',
            45: '🔲',
            54: '📦',
            61: '🔥',
            138: '🪨',
            184: '📚',
            187: '📦',
            191: '🔥',
            195: '🔨',
            214: '⚫',
            218: '💎',
            219: '🟢',
            220: '🔵',
            221: '⚪',
            222: '🟡',
            225: '🟡',
            226: '⚪',
            227: '💎',
            229: '🔴',
            230: '🔴',
            310: '🥢',
            312: '🔦'
        };
        return displayMap[itemId] || '▪';
    };

    /**
     * getPanel — gets the panel DOM element.
     * @returns {HTMLElement|null}
     */
    Donkeycraft.InventoryUI.prototype.getPanel = function () {
        return this._panelEl;
    };

    /**
     * onOpen — subscribes to open events.
     * @param {Function} callback - Called when inventory opens.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.InventoryUI.prototype.onOpen = function (callback) {
        if (!this._subscriptions.onOpen) this._subscriptions.onOpen = [];
        this._subscriptions.onOpen.push(callback);
        var self = this;
        return function () {
            var idx = self._subscriptions.onOpen.indexOf(callback);
            if (idx >= 0) self._subscriptions.onOpen.splice(idx, 1);
        };
    };

    /**
     * onClose — subscribes to close events.
     * @param {Function} callback - Called when inventory closes.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.InventoryUI.prototype.onClose = function (callback) {
        if (!this._subscriptions.onClose) this._subscriptions.onClose = [];
        this._subscriptions.onClose.push(callback);
        var self = this;
        return function () {
            var idx = self._subscriptions.onClose.indexOf(callback);
            if (idx >= 0) self._subscriptions.onClose.splice(idx, 1);
        };
    };

    // ============================================================
    // PaperdollRenderer — WebGL entity rendering for inventory paperdoll
    // ============================================================

    /**
     * PaperdollRenderer — Renders a 3D player entity over the inventory paperdoll slot.
     *
     * Features animated entity with random state cycling, mouse hover pause/resume,
     * and head tracking via mouse position. The renderer creates an overlay WebGL canvas
     * positioned over the CSS-drawn paperdoll silhouette.
     *
     * @constructor
     * @param {HTMLElement} container - The .dk-paperdoll-container element.
     */
    Donkeycraft.PaperdollRenderer = function (container) {
    // PaperdollRenderer configuration constants
    this._HEAD_YAW_LIMIT = 0.52;    // ~30 degrees in radians
    this._HEAD_PITCH_LIMIT = 0.26;  // ~15 degrees in radians
    this._CANVAS_SIZE = 128;

        // DOM and WebGL references
        this._container = container || null;
        this._canvas = null;
        this._gl = null;

        // Runtime state
        this._running = false;
        this._paused = false;
        this._mouseInside = false;

        // Animation state
        this._animState = 'idle';
        this._animTime = 0;
        this._stateTimer = 0;
        this._lastTransforms = {};
        this._headOverride = { yaw: 0, pitch: 0 };

        // Camera (fixed front-facing view)
        this._camPos = { x: 0, y: 1.2, z: 3.5 };
        this._camTarget = { x: 0, y: 0.9, z: 0 };
        this._fov = 50;
        this._aspect = 1;

        // Entity
        this._entity = null;

        // WebGL shader resources
        this._shaderProgram = null;
        this._aPositionLoc = -1;
        this._aNormalLoc = -1;
        this._uModel = -1;
        this._uColor = -1;
        this._uUseColor = -1;
        this._uProjection = -1;
        this._uView = -1;
        this._uFogColor = -1;
        this._uFogDensity = -1;
        this._meshCache = {};

        // Animation loop timing
        this._lastFrameTime = 0;
        this._rafId = null;

        // Hover change subscribers
        this._onHoverChange = [];
    };

    /**
     * _createShaderProgram — Compile and link the entity shader program.
     *
     * Creates vertex and fragment shaders from inline GLSL source, links them into
     * a program, and caches attribute/uniform locations for fast per-frame access.
     *
     * @returns {boolean} True if shader compilation and linking succeeded.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._createShaderProgram = function () {
        var gl = this._gl;
        if (!gl) return false;

        // Entity Vertex Shader
        var vsSource = [
            'attribute vec3 aPosition;',
            'attribute vec3 aNormal;',
            'uniform mat4 uProjection;',
            'uniform mat4 uView;',
            'uniform mat4 uModel;',
            'varying vec3 vNormal;',
            'varying float vDepth;',
            'void main() {',
            '    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);',
            '    vNormal = aNormal;',
            '    vDepth = -(uView * uModel * vec4(aPosition, 1.0)).z;',
            '}'
        ].join('\n');

        // Entity Fragment Shader
        var fsSource = [
            'precision mediump float;',
            'varying vec3 vNormal;',
            'varying float vDepth;',
            'uniform vec3 uColor;',
            'uniform vec3 uFogColor;',
            'uniform float uFogDensity;',
            'void main() {',
            '    vec3 finalColor = uColor;',
            '    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));',
            '    float diff = max(dot(normalize(vNormal), lightDir), 0.25);',
            '    finalColor *= diff;',
            '    float fogFactor = 1.0 - exp(-vDepth * uFogDensity);',
            '    fogFactor = clamp(fogFactor, 0.0, 1.0);',
            '    finalColor = mix(finalColor, uFogColor, fogFactor);',
            '    gl_FragColor = vec4(finalColor, 1.0);',
            '}'
        ].join('\n');

        var vs = this._compileShader(gl.VERTEX_SHADER, vsSource);
        var fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return false;

        var program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            return false;
        }

        this._shaderProgram = program;
        this._aPositionLoc = gl.getAttribLocation(program, 'aPosition');
        this._aNormalLoc = gl.getAttribLocation(program, 'aNormal');
        this._uModel = gl.getUniformLocation(program, 'uModel');
        this._uColor = gl.getUniformLocation(program, 'uColor');
        this._uUseColor = gl.getUniformLocation(program, 'uUseColor');
        this._uProjection = gl.getUniformLocation(program, 'uProjection');
        this._uView = gl.getUniformLocation(program, 'uView');
        this._uFogColor = gl.getUniformLocation(program, 'uFogColor');
        this._uFogDensity = gl.getUniformLocation(program, 'uFogDensity');

        return true;
    };

    /**
     * _compileShader — Compile a shader from GLSL source string.
     *
     * @param {number} type - Shader type (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER).
     * @param {string} source - GLSL shader source code.
     * @returns {WebGLShader|null} Compiled shader, or null on failure.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._compileShader = function (type, source) {
        var gl = this._gl;
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            return null;
        }
        return shader;
    };

    /**
     * _createCanvas — Create and position the WebGL canvas over the paperdoll slot.
     *
     * Creates a 128×128 WebGL canvas positioned absolutely within the paperdoll container,
     * then initializes the WebGL context with alpha blending and antialiasing enabled.
     *
     * @returns {boolean} True if canvas creation and WebGL initialization succeeded.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._createCanvas = function () {
        var self = this;
        if (!this._container) return false;

        this._canvas = document.createElement('canvas');
        this._canvas.id = 'dk-paperdoll-canvas';

        // Size the canvas to match the CSS paperdoll container dimensions.
        var size = this._CANVAS_SIZE;
        this._canvas.style.position = 'absolute';
        this._canvas.style.left = '0px';
        this._canvas.style.top = '0px';
        this._canvas.style.width = size + 'px';
        this._canvas.style.height = size + 'px';
        this._canvas.style.pointerEvents = 'none';
        this._canvas.style.zIndex = '1';

        // Set explicit pixel dimensions for WebGL rendering.
        this._canvas.width = size;
        this._canvas.height = size;

        this._container.appendChild(this._canvas);

        try {
            this._gl = this._canvas.getContext('webgl', {
                alpha: true,
                antialias: true,
                premultipliedAlpha: false
            });
        } catch (e) {
            return false;
        }

        if (!this._gl) return false;

        this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
        this._aspect = this._canvas.width / this._canvas.height;

        return true;
    };

    /**
     * _createEntity — Create the player entity object with bone definitions and animation interface.
     *
     * The returned entity object conforms to the render loop interface:
     * `getPosition()`, `getRotation()`, `getDimensions()`, `isAlive()`, `getBones()`, `getBoneTransforms()`.
     *
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._createEntity = function () {
        var self = this;
        this._entity = {
            type: 'player',
            _pos: { x: 0, y: 0.9, z: 0 },
            _rot: { yaw: 0, pitch: 0 },
            _width: 0.6,
            _height: 1.8,

            getPosition: function () { return self._pos; },
            getRotation: function () { return self._rot; },
            getDimensions: function () { return { width: self._width, height: self._height }; },
            isAlive: function () { return true; },

            getBones: function () {
                return [
                    { name: 'body', meshType: 'box', dimensions: { w: 0.6, h: 0.9, d: 0.3 }, color: '#3366CC', offset: { x: 0, y: 0.85, z: 0 } },
                    { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#FFCC99', offset: { x: 0, y: 1.55, z: 0 } },
                    { name: 'leftArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#FFCC99', offset: { x: -0.42, y: 0.9, z: 0 }, pivot: { x: 0, y: 0.4, z: 0 } },
                    { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#3366CC', offset: { x: 0.42, y: 0.9, z: 0 }, pivot: { x: 0, y: 0.4, z: 0 } },
                    { name: 'leftLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#3366CC', offset: { x: -0.15, y: 0.45, z: 0 }, pivot: { x: 0, y: 0.45, z: 0 } },
                    { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#336969', offset: { x: 0.15, y: 0.45, z: 0 }, pivot: { x: 0, y: 0.45, z: 0 } }
                ];
            },

            getBoneTransforms: function () { return self._getLastTransforms(); }
        };
    };

    /**
     * _createBoxMesh — Generate indexed box mesh with per-face normals and UV coordinates.
     *
     * Each face has its own vertices (24 total) so each face can have a distinct normal vector.
     * Vertex layout: position (3 floats) + normal (3 floats) + UV (2 floats) = 8 floats per vertex.
     *
     * @param {number} w - Box width (X axis).
     * @param {number} h - Box height (Y axis).
     * @param {number} d - Box depth (Z axis).
     * @returns {{vertices: Float32Array, indices: Uint16Array}} Mesh geometry data.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._createBoxMesh = function (w, h, d) {
        var hw = w / 2, hh = h / 2, hd = d / 2;
        var verts = new Float32Array([
            -hw, -hh, hd, 0, 0, 1, 0, 0,
             hw, -hh, hd, 0, 0, 1, 1, 0,
             hw,  hh, hd, 0, 0, 1, 1, 1,
            -hw,  hh, hd, 0, 0, 1, 0, 1,
             hw, -hh, -hd, 0, 0,-1, 0, 0,
            -hw, -hh, -hd, 0, 0,-1, 1, 0,
            -hw,  hh, -hd, 0, 0,-1, 1, 1,
             hw,  hh, -hd, 0, 0,-1, 0, 1,
            -hw,  hh, hd, 0, 1, 0, 0, 0,
             hw,  hh, hd, 0, 1, 0, 1, 0,
             hw,  hh, -hd, 0, 1, 0, 1, 1,
            -hw,  hh, -hd, 0, 1, 0, 0, 1,
            -hw, -hh, -hd, 0,-1, 0, 0, 0,
             hw, -hh, -hd, 0,-1, 0, 1, 0,
             hw, -hh, hd, 0,-1, 0, 1, 1,
            -hw, -hh, hd, 0,-1, 0, 0, 1,
             hw, -hh, hd, 1, 0, 0, 0, 0,
             hw, -hh, -hd, 1, 0, 0, 1, 0,
             hw,  hh, -hd, 1, 0, 0, 1, 1,
             hw,  hh, hd, 1, 0, 0, 0, 1,
            -hw, -hh, -hd,-1, 0, 0, 0, 0,
            -hw, -hh, hd,-1, 0, 0, 1, 0,
            -hw,  hh, hd,-1, 0, 0, 1, 1,
            -hw,  hh, -hd,-1, 0, 0, 0, 1
        ]);
        var idx = new Uint16Array([
            0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11,
            12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23
        ]);
        return { vertices: verts, indices: idx, count: idx.length };
    };

    /**
     * _getOrBuildMesh — Retrieve a cached mesh or create and cache a new one.
     *
     * Meshes are keyed by normalized dimensions to ensure visual consistency while avoiding
     * floating-point precision issues in cache lookups. WebGL buffers (VBO + IBO) are created
     * on first request and cached for reuse.
     *
     * @param {number} w - Width.
     * @param {number} h - Height.
     * @param {number} d - Depth.
     * @returns {{vbo: WebGLBuffer, ibo: WebGLBuffer, count: number, stride: number}|null} Mesh cache entry, or null on failure.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._getOrBuildMesh = function (w, h, d) {
        var key = 'box:' + w.toFixed(2) + ':' + h.toFixed(2) + ':' + d.toFixed(2);
        if (this._meshCache[key]) return this._meshCache[key];

        var gl = this._gl;
        var mesh = this._createBoxMesh(w, h, d);
        var vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        var ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

        this._meshCache[key] = { vbo: vbo, ibo: ibo, count: mesh.count, stride: 8 * 4 };
        return this._meshCache[key];
    };

    /**
     * _mat4Identity — Create a 4×4 identity matrix (column-major).
     *
     * @returns {Float32Array} 16-element identity matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._mat4Identity = function () {
        return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    };

    /**
     * _mat4Multiply — Post-multiply two 4×4 column-major matrices (r = a × b).
     *
     * @param {Float32Array} a - Left matrix.
     * @param {Float32Array} b - Right matrix.
     * @returns {Float32Array} New 16-element result matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._mat4Multiply = function (a, b) {
        var r = new Float32Array(16);
        for (var j = 0; j < 4; j++) {
            r[j] = a[0]*b[j] + a[1]*b[4+j] + a[2]*b[8+j] + a[3]*b[12+j];
            r[4+j] = a[4]*b[j] + a[5]*b[4+j] + a[6]*b[8+j] + a[7]*b[12+j];
            r[8+j] = a[8]*b[j] + a[9]*b[4+j] + a[10]*b[8+j] + a[11]*b[12+j];
            r[12+j] = a[12]*b[j] + a[13]*b[4+j] + a[14]*b[8+j] + a[15]*b[12+j];
        }
        return r;
    };

    /**
     * _mat4RotateY — Post-multiply rotation around the Y axis (yaw).
     * Modifies the input matrix in place.
     *
     * @param {Float32Array} m - Input matrix (modified in place).
     * @param {number} rad - Rotation angle in radians.
     * @returns {Float32Array} The rotated matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._mat4RotateY = function (m, rad) {
        var c = Math.cos(rad), s = Math.sin(rad);
        var m0=m[0], m1=m[1], m2=m[2], m3=m[3];
        var m8=m[8], m9=m[9], m10=m[10], m11=m[11];
        m[0]=m0*c-m8*s; m[1]=m1*c-m9*s; m[2]=m2*c-m10*s; m[3]=m3*c-m11*s;
        m[8]=m0*s+m8*c; m[9]=m1*s+m9*c; m[10]=m2*s+m10*c; m[11]=m3*s+m11*c;
        return m;
    };

    /**
     * _mat4RotateX — Post-multiply rotation around the X axis (pitch).
     * Modifies the input matrix in place.
     *
     * @param {Float32Array} m - Input matrix (modified in place).
     * @param {number} rad - Rotation angle in radians.
     * @returns {Float32Array} The rotated matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._mat4RotateX = function (m, rad) {
        var c = Math.cos(rad), s = Math.sin(rad);
        var m4=m[4], m5=m[5], m6=m[6], m7=m[7];
        var m8=m[8], m9=m[9], m10=m[10], m11=m[11];
        m[4]=m4*c+m8*s; m[5]=m5*c+m9*s; m[6]=m6*c+m10*s; m[7]=m7*c+m11*s;
        m[8]=-m4*s+m8*c; m[9]=-m5*s+m9*c; m[10]=-m6*s+m10*c; m[11]=-m7*s+m11*c;
        return m;
    };

    /**
     * _mat4RotateZ — Post-multiply rotation around the Z axis (roll).
     * Modifies the input matrix in place.
     *
     * @param {Float32Array} m - Input matrix (modified in place).
     * @param {number} rad - Rotation angle in radians.
     * @returns {Float32Array} The rotated matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._mat4RotateZ = function (m, rad) {
        var c = Math.cos(rad), s = Math.sin(rad);
        var m0=m[0], m1=m[1], m2=m[2], m3=m[3];
        var m4=m[4], m5=m[5], m6=m[6], m7=m[7];
        m[0]=m0*c+m4*s; m[1]=m1*c+m5*s; m[2]=m2*c+m6*s; m[3]=m3*c+m7*s;
        m[4]=-m0*s+m4*c; m[5]=-m1*s+m5*c; m[6]=-m2*s+m6*c; m[7]=-m3*s+m7*c;
        return m;
    };

    /**
     * _mat4Translate — Set the translation components (indices 12-14) of a matrix.
     * Expects the input matrix to be in a "clean" state where translation components
     * (indices 12-14) are zero, typically right after creating an identity matrix
     * and applying rotations. Uses direct assignment for correctness.
     *
     * @param {Float32Array} m - Input matrix (modified in place).
     * @param {number} x - Translation X.
     * @param {number} y - Translation Y.
     * @param {number} z - Translation Z.
     * @returns {Float32Array} The translated matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._mat4Translate = function (m, x, y, z) {
        m[12] = x; m[13] = y; m[14] = z;
        return m;
    };

    /**
     * _buildModelMatrix — Build a model matrix from position and Euler angle rotations.
     *
     * Creates an identity matrix, applies rotations in YXZ order (yaw → pitch → roll),
     * then sets the translation component.
     *
     * @param {number} px - X position.
     * @param {number} py - Y position.
     * @param {number} pz - Z position.
     * @param {number} rx - Rotation around X axis (radians).
     * @param {number} ry - Rotation around Y axis (radians).
     * @param {number} rz - Rotation around Z axis (radians).
     * @returns {Float32Array} New column-major 4×4 model matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._buildModelMatrix = function (px, py, pz, rx, ry, rz) {
        var m = this._mat4Identity();
        if (ry !== 0) this._mat4RotateY(m, ry);
        if (rx !== 0) this._mat4RotateX(m, rx);
        if (rz !== 0) this._mat4RotateZ(m, rz);
        this._mat4Translate(m, px, py, pz);
        return m;
    };

    /**
     * _perspectiveMatrix — Create a perspective projection matrix (frustum).
     *
     * Uses the symmetric frustum formula with vertical FOV, aspect ratio,
     * and near/far clipping planes.
     *
     * @param {number} fovDeg - Vertical field of view in degrees.
     * @param {number} aspect - Width-to-height aspect ratio.
     * @param {number} near - Near clipping plane distance.
     * @param {number} far - Far clipping plane distance.
     * @returns {Float32Array} 16-element perspective projection matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._perspectiveMatrix = function (fovDeg, aspect, near, far) {
        var fovRad = fovDeg * Math.PI / 180;
        var f = 1.0 / Math.tan(fovRad / 2);
        var nf = near / (near - far);
        return new Float32Array([
            f/aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far+near)/nf, -1,
            0, 0, (2*far*near)/nf, 0
        ]);
    };

    /**
     * _lookAtMatrix — Create a look-at view matrix from eye, center, and up vectors.
     *
     * Computes an orthonormal basis from the camera position and forward direction,
     * then constructs the view transformation that maps world space to camera space.
     *
     * @param {{x:number,y:number,z:number}} eye - Camera position.
     * @param {{x:number,y:number,z:number}} center - Look-at target point.
     * @param {{x:number,y:number,z:number}} up - Up direction vector.
     * @returns {Float32Array} 16-element column-major view matrix.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._lookAtMatrix = function (eye, center, up) {
        var zx=eye.x-center.x, zy=eye.y-center.y, zz=eye.z-center.z;
        var len=Math.sqrt(zx*zx+zy*zy+zz*zz);
        zx/=len; zy/=len; zz/=len;
        var xx=up.y*zz-up.z*zy, xy=up.z*zx-up.x*zz, xz=up.x*zy-up.y*zx;
        len=Math.sqrt(xx*xx+xy*xy+xz*xz);
        xx/=len; xy/=len; xz/=len;
        var yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
        return new Float32Array([
            xx, yx, zx, 0,
            xy, yy, zy, 0,
            xz, yz, zz, 0,
            -(xx*eye.x+xy*eye.y+xz*eye.z),
            -(yx*eye.x+yy*eye.y+yz*eye.z),
            -(zx*eye.x+zy*eye.y+zz*eye.z),
            1
        ]);
    };

    /**
     * _drawMesh — Issue an indexed draw call for a cached mesh.
     *
     * Sets the shader program, model matrix, flat color (parsed from hex),
     * binds vertex attributes, and calls `gl.drawElements`.
     *
     * @param {{vbo: WebGLBuffer, ibo: WebGLBuffer, count: number, stride: number}} cache - Mesh cache entry.
     * @param {Float32Array} modelMatrix - 4×4 model matrix.
     * @param {string} color - Hex color string (e.g., '#3366CC').
     * @returns {boolean} True if the draw call succeeded.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._drawMesh = function (cache, modelMatrix, color) {
        var gl = this._gl;
        if (!gl || !cache) return false;

        gl.useProgram(this._shaderProgram);
        gl.uniformMatrix4fv(this._uModel, false, modelMatrix);

        // Parse hex color
        var hex = color.substring(1);
        var r, g, b;
        if (hex.length === 6) {
            r = parseInt(hex.substr(0,2),16)/255;
            g = parseInt(hex.substr(2,2),16)/255;
            b = parseInt(hex.substr(4,2),16)/255;
        } else {
            r = 1; g = 0; b = 1;
        }
        gl.uniform3f(this._uColor, r, g, b);
        gl.uniform1i(this._uUseColor, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, cache.vbo);
        gl.enableVertexAttribArray(this._aPositionLoc);
        gl.vertexAttribPointer(this._aPositionLoc, 3, gl.FLOAT, false, cache.stride, 0);
        gl.enableVertexAttribArray(this._aNormalLoc);
        gl.vertexAttribPointer(this._aNormalLoc, 3, gl.FLOAT, false, cache.stride, 12);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cache.ibo);
        gl.drawElements(gl.TRIANGLES, cache.count, gl.UNSIGNED_SHORT, 0);

        return true;
    };

    /**
     * _computeBoneTransforms — Compute per-bone rotation transforms based on the current animation state.
     *
     * Returns a map of bone name → `{rx, ry, rz}` rotation values. Each animation state
     * (idle, walk, run, wave) defines unique bone rotations. When the mouse is inside
     * the panel and not paused, head tracking overrides are applied to the head bone.
     *
     * @param {number} dt - Delta time in seconds since last frame.
     * @returns {Object.<string, {rx:number, ry:number, rz:number}>} Bone rotation map.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._computeBoneTransforms = function (dt) {
        var t = this._animTime;
        var transforms = {};

        switch (this._animState) {
            case 'idle': {
                // Subtle breathing: body oscillates slightly
                transforms.body = { rx: 0, ry: Math.sin(t * 0.8) * 0.05, rz: 0 };
                // Head sway
                transforms.head = { rx: Math.sin(t * 0.6) * 0.03, ry: Math.sin(t * 0.5) * 0.08, rz: 0 };
                // Arms slight sway
                transforms.leftArm = { rx: 0, ry: Math.sin(t * 0.7) * 0.04, rz: 0 };
                transforms.rightArm = { rx: 0, ry: Math.sin(t * 0.7 + 1) * 0.04, rz: 0 };
                // Legs mostly still
                transforms.leftLeg = { rx: 0, ry: Math.sin(t * 0.5) * 0.03, rz: 0 };
                transforms.rightLeg = { rx: 0, ry: Math.sin(t * 0.5 + 0.5) * 0.03, rz: 0 };
                break;
            }
            case 'walk': {
                var walkSpeed = 2.5;
                var swingAmount = 0.4;
                // Body slight lean
                transforms.body = { rx: 0.05, ry: Math.sin(t * walkSpeed) * 0.05, rz: 0 };
                // Head stable
                transforms.head = { rx: 0, ry: Math.sin(t * walkSpeed) * 0.03, rz: 0 };
                // Arms swing opposite to legs
                transforms.leftArm = { rx: -Math.sin(t * walkSpeed) * swingAmount, ry: 0, rz: 0 };
                transforms.rightArm = { rx: Math.sin(t * walkSpeed) * swingAmount, ry: 0, rz: 0 };
                // Legs swing
                transforms.leftLeg = { rx: Math.sin(t * walkSpeed) * swingAmount, ry: 0, rz: 0 };
                transforms.rightLeg = { rx: -Math.sin(t * walkSpeed) * swingAmount, ry: 0, rz: 0 };
                break;
            }
            case 'run': {
                var runSpeed = 4.5;
                var runSwing = 0.7;
                transforms.body = { rx: 0.15, ry: Math.sin(t * runSpeed) * 0.08, rz: 0 };
                transforms.head = { rx: -0.1, ry: Math.sin(t * runSpeed) * 0.06, rz: 0 };
                transforms.leftArm = { rx: -Math.sin(t * runSpeed) * runSwing, ry: 0, rz: 0 };
                transforms.rightArm = { rx: Math.sin(t * runSpeed) * runSwing, ry: 0, rz: 0 };
                transforms.leftLeg = { rx: Math.sin(t * runSpeed) * runSwing, ry: 0, rz: 0 };
                transforms.rightLeg = { rx: -Math.sin(t * runSpeed) * runSwing, ry: 0, rz: 0 };
                break;
            }
            case 'wave': {
                var waveCycle = Math.sin(t * 5);
                transforms.body = { rx: 0, ry: -0.15, rz: 0 };
                transforms.head = { rx: 0, ry: 0.1, rz: 0 };
                transforms.leftArm = { rx: 0, ry: 0, rz: 0 };
                // Right arm waves
                transforms.rightArm = { rx: -2.5 + waveCycle * 0.3, ry: 0.5 + waveCycle * 0.4, rz: 0.3 };
                transforms.leftLeg = { rx: 0, ry: 0, rz: 0 };
                transforms.rightLeg = { rx: 0, ry: 0, rz: 0 };
                break;
            }
        }

        // Apply head tracking override when mouse is inside panel
        if (this._mouseInside && !this._paused) {
            var headBase = transforms.head || { rx: 0, ry: 0, rz: 0 };
            transforms.head = {
                rx: headBase.rx + this._headOverride.pitch,
                ry: headBase.ry + this._headOverride.yaw,
                rz: headBase.rz
            };
        }

        // Store last transforms for pause/resume
        this._lastTransforms = transforms;
        return transforms;
    };

    /**
     * _getLastTransforms — Return the last computed bone transforms.
     *
     * Used by the entity's `getBoneTransforms()` method so that when animation is paused,
     * the renderer continues to output stable transforms instead of zero rotations.
     *
     * @returns {Object.<string, {rx:number, ry:number, rz:number}>} Last bone transform map.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._getLastTransforms = function () {
        return this._lastTransforms;
    };

    /**
     * _updateAnimationState — Advance the animation state machine by one tick.
     *
     * Increments animation time and checks if the state timer has expired. When expired,
     * randomly transitions to a new animation state (idle, walk, run, wave) weighted by
     * predefined probabilities. Skipped when paused.
     *
     * @param {number} dt - Delta time in seconds since last frame.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._updateAnimationState = function (dt) {
        if (this._paused) return;

        this._animTime += dt;
        this._stateTimer -= dt;

        if (this._stateTimer <= 0) {
            // Random state transition
            var states = ['idle', 'walk', 'run', 'wave'];
            var weights = [0.4, 0.25, 0.15, 0.2];
            var r = Math.random();
            var cumulative = 0;
            var newState = 'idle';
            for (var i = 0; i < states.length; i++) {
                cumulative += weights[i];
                if (r <= cumulative) {
                    newState = states[i];
                    break;
                }
            }
            if (newState !== this._animState) {
                this._animState = newState;
                this._stateTimer = 2 + Math.random() * 3; // 2-5 seconds per state
            } else {
                // Stay in same state, just reset timer
                this._stateTimer = 2 + Math.random() * 3;
            }
        }
    };

    /**
     * _renderFrame — Render a single animation frame.
     *
     * Updates animation state, computes bone transforms, and draws all entity bones.
     * The animation loop continues via `requestAnimationFrame` at the end of each frame
     * (within try-finally), even if rendering fails due to missing context or entity data.
     *
     * When `_running` is false (e.g., after `destroy()` was called), the render loop
     * exits immediately without scheduling another frame.
     *
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._renderFrame = function (timestamp) {
        if (!this._running) return;

        var gl = this._gl;

        try {
            // Calculate delta time and advance animation state every frame.
            if (this._lastFrameTime === 0) this._lastFrameTime = timestamp;
            var dt = Math.min((timestamp - this._lastFrameTime) / 1000, 0.1);
            this._lastFrameTime = timestamp;

            // Skip rendering if WebGL context is unavailable, but keep animating.
            if (gl) {
                gl.useProgram(this._shaderProgram);

                // Update animation state and compute bone transforms.
                this._updateAnimationState(dt);
                var transforms = this._entity ? this._entity.getBoneTransforms() : {};

                // Clear and set up rendering state.
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.enable(gl.DEPTH_TEST);
                gl.enable(gl.CULL_FACE);
                gl.cullFace(gl.BACK);

                // Set up projection and view matrices.
                var proj = this._perspectiveMatrix(this._fov, this._aspect, 0.1, 100);
                var view = this._lookAtMatrix(this._camPos, this._camTarget, { x: 0, y: 1, z: 0 });

                gl.uniformMatrix4fv(this._uProjection, false, proj);
                gl.uniformMatrix4fv(this._uView, false, view);
                gl.uniform3f(this._uFogColor, 0.53, 0.8, 0.97);
                gl.uniform1f(this._uFogDensity, 0.02);

                // Draw each bone if entity is available.
                var entity = this._entity;
                if (entity) {
                    var pos = entity.getPosition && entity.getPosition();
                    if (pos) {
                        var bones = entity.getBones();
                        if (bones) {
                            for (var i = 0; i < bones.length; i++) {
                                var bone = bones[i];
                                var transform = transforms[bone.name] || { rx: 0, ry: 0, rz: 0 };
                                var offset = bone.offset || { x: 0, y: 0, z: 0 };

                                // Apply entity yaw to offset for correct world positioning.
                                var rot = entity.getRotation();
                                var yaw = rot && rot.yaw !== undefined ? rot.yaw : 0;
                                var cosYaw = Math.cos(yaw);
                                var sinYaw = Math.sin(yaw);
                                var localX = offset.x * cosYaw - offset.z * sinYaw;
                                var localZ = offset.x * sinYaw + offset.z * cosYaw;
                                var localY = offset.y;

                                var modelMatrix = this._buildModelMatrix(
                                    pos.x + localX,
                                    pos.y + localY,
                                    pos.z + localZ,
                                    transform.rx, transform.ry, transform.rz
                                );

                                var meshCache = this._getOrBuildMesh(
                                    bone.dimensions.w || 1,
                                    bone.dimensions.h || 1,
                                    bone.dimensions.d || 1
                                );

                                if (meshCache) {
                                    this._drawMesh(meshCache, modelMatrix, bone.color || '#FF00FF');
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Silently swallow rendering errors to prevent them from breaking the animation loop.
        } finally {
            // Always request the next frame — this ensures the render loop never dies.
            this._rafId = requestAnimationFrame(this._renderFrame.bind(this));
        }
    };

    /**
     * init — Initialize the paperdoll renderer. Creates canvas, compiles shaders, creates entity.
     *
     * @returns {boolean} True if initialization succeeded.
     */
    Donkeycraft.PaperdollRenderer.prototype.init = function () {
        if (!this._createCanvas()) return false;
        if (!this._createShaderProgram()) return false;
        this._createEntity();

        // Set up mouse hover detection on the panel
        this._setupHoverDetection();

        // Start render loop
        this._running = true;
        this._lastFrameTime = 0;
        this._rafId = requestAnimationFrame(this._renderFrame.bind(this));

        return true;
    };

    /**
     * _setupHoverDetection — Set up mouse enter/leave/move listeners on the inventory panel.
     *
     * On mouse enter, pauses animation updates and notifies subscribers.
     * On mouse leave, resumes animation and notifies subscribers.
     * On mouse move within the panel, updates head tracking override for yaw/pitch.
     *
     * Handler references are stored in `_hoverHandlers` so they can be removed
     * during `destroy()` to prevent memory leaks and stale callback invocations.
     *
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._setupHoverDetection = function () {
        var panel = document.querySelector('.dk-inventory-panel');
        if (!panel) return;

        var self = this;

        var handleEnter = function () {
            self._mouseInside = true;
            self.pause();
            for (var i = 0; i < self._onHoverChange.length; i++) {
                try { self._onHoverChange[i](true); } catch (e) { }
            }
        };

        var handleLeave = function () {
            self._mouseInside = false;
            self.resume();
            for (var i = 0; i < self._onHoverChange.length; i++) {
                try { self._onHoverChange[i](false); } catch (e) { }
            }
        };

        var handleMouseMove = function (e) {
            if (!self._mouseInside) return;
            var rect = self._container.getBoundingClientRect();
            if (!rect) return;
            // Normalize mouse position to [-1, 1] relative to container center.
            var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            var my = ((e.clientY - rect.top) / rect.height) * 2 - 1;
            // Map to head rotation limits.
            self._headOverride.yaw = mx * self._HEAD_YAW_LIMIT;
            self._headOverride.pitch = my * self._HEAD_PITCH_LIMIT;
        };

        this._hoverHandlers = { enter: handleEnter, leave: handleLeave, move: handleMouseMove };

        panel.addEventListener('mouseenter', handleEnter);
        panel.addEventListener('mouseleave', handleLeave);
        panel.addEventListener('mousemove', handleMouseMove);
    };

    /**
     * pause — Pause the animation loop.
     *
     * When paused, bone transforms are no longer updated each frame, but the render
     * loop continues so the last frame remains visible. Animation state is preserved
     * so resuming picks up where it left off.
     */
    Donkeycraft.PaperdollRenderer.prototype.pause = function () {
        this._paused = true;
    };

    /**
     * resume — Resume the animation loop after a pause.
     *
     * Restores animation updates using the last computed bone transforms as the
     * starting point, ensuring smooth continuation without snapping.
     */
    Donkeycraft.PaperdollRenderer.prototype.resume = function () {
        this._paused = false;
    };

    /**
     * setMouseTrack — Set normalized mouse position for head tracking.
     *
     * Directly sets the head yaw and pitch override values, mapping [-1, 1]
     * input to the configured rotation limits.
     *
     * @param {number} x - Normalized X position in [-1, 1] (-1 = left, 1 = right).
     * @param {number} y - Normalized Y position in [-1, 1] (-1 = top, 1 = bottom).
     */
    Donkeycraft.PaperdollRenderer.prototype.setMouseTrack = function (x, y) {
        this._headOverride.yaw = x * this._HEAD_YAW_LIMIT;
        this._headOverride.pitch = y * this._HEAD_PITCH_LIMIT;
    };

    /**
     * clearMouseTrack — Clear the head tracking override.
     *
     * Resets yaw and pitch overrides to zero, returning head rotation
     * to its default animation state.
     */
    Donkeycraft.PaperdollRenderer.prototype.clearMouseTrack = function () {
        this._headOverride.yaw = 0;
        this._headOverride.pitch = 0;
    };

    /**
     * isRunning — Check if the renderer's animation loop is active.
     *
     * Returns `true` if `init()` was called successfully and `destroy()` has not been called.
     * Note: the render loop may be paused (via `pause()` or hover) but `isRunning` still returns true.
     *
     * @returns {boolean} True if the renderer is in its active lifecycle.
     */
    Donkeycraft.PaperdollRenderer.prototype.isRunning = function () {
        return this._running;
    };

    /**
     * destroy — Clean up all PaperdollRenderer resources.
     *
     * Stops the animation loop, deletes all WebGL buffers from the mesh cache,
     * removes the canvas from the DOM, and nullifies all references to allow GC.
     * After calling `destroy()`, the renderer cannot be restarted — create a new instance.
     *
     * Also removes all mouse event listeners attached to the inventory panel
     * to prevent memory leaks and stale callback invocations.
     */
    Donkeycraft.PaperdollRenderer.prototype.destroy = function () {
        // Signal the render loop to stop at the top of _renderFrame.
        this._running = false;

        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        // Remove mouse event listeners attached to the inventory panel.
        if (this._hoverHandlers) {
            var panel = document.querySelector('.dk-inventory-panel');
            if (panel) {
                panel.removeEventListener('mouseenter', this._hoverHandlers.enter);
                panel.removeEventListener('mouseleave', this._hoverHandlers.leave);
                panel.removeEventListener('mousemove', this._hoverHandlers.move);
            }
            this._hoverHandlers = null;
        }

        // Delete WebGL buffers from the mesh cache.
        if (this._gl) {
            for (var key in this._meshCache) {
                if (this._meshCache.hasOwnProperty(key)) {
                    var cache = this._meshCache[key];
                    if (cache.vbo) this._gl.deleteBuffer(cache.vbo);
                    if (cache.ibo) this._gl.deleteBuffer(cache.ibo);
                }
            }
        }
        this._meshCache = {};

        // Remove canvas from DOM.
        if (this._canvas && this._canvas.parentNode) {
            this._canvas.parentNode.removeChild(this._canvas);
        }
        this._canvas = null;
        this._gl = null;
        this._container = null;
        this._entity = null;
    };

    /**
     * onHoverChange — Subscribe to hover state changes.
     *
     * @param {Function} callback - Called with `(isHovered: boolean)`.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.PaperdollRenderer.prototype.onHoverChange = function (callback) {
        this._onHoverChange.push(callback);
        var self = this;
        return function () {
            var idx = self._onHoverChange.indexOf(callback);
            if (idx >= 0) self._onHoverChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up all DOM elements and event listeners for InventoryUI.
     *
     * Note: This is the InventoryUI.destroy(), not PaperdollRenderer.destroy().
     */
    Donkeycraft.InventoryUI.prototype.destroy = function () {
        // Close panel if open
        if (this._open) {
            this.close();
        }

        // Remove panel from DOM
        if (this._panelEl && this._panelEl.parentNode) {
            this._panelEl.parentNode.removeChild(this._panelEl);
        }

        // Remove toggle button
        if (this._toggleBtnEl && this._toggleBtnEl.parentNode) {
            this._toggleBtnEl.parentNode.removeChild(this._toggleBtnEl);
        }

        // Clear subscriptions
        this._subscriptions = {};
        this._playerInventory = null;
        this._backpackInventory = null;
    };

})();