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
        this._playerInventory = null;
        this._backpackInventory = null;

        // DOM elements
        this._panelEl = null;
        this._gridEl = null;
        this._toggleBtnEl = null;

        // Event subscriptions
        this._subscriptions = {};

        // Build DOM
        this._initDOM();
    };

    /**
     * _initDOM — initializes the DOM structure from static HTML and creates dynamic elements.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._initDOM = function () {
        this._panelEl = document.getElementById('dk-inventory-panel');

        if (this._panelEl) {
            var closeBtn = document.getElementById('dk-inventory-close-btn');
            if (closeBtn) {
                var self = this;
                closeBtn.addEventListener('click', function () { self.close(); });
            }

            this._gridEl = document.getElementById('dk-inventory-grid');
            if (!this._gridEl) {
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

            if (this._gridEl) {
                this._generateInventoryGrid();
            }
        }

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

        var hotbarEl = document.querySelector('.dk-hotbar');
        if (hotbarEl) {
            hotbarEl.appendChild(btn);
        } else {
            document.getElementById('dk-hotbar-container').appendChild(btn);
        }
        this._toggleBtnEl = btn;
    };

    /**
     * open — opens the inventory panel with animation.
     * If currently closing, cancels the close and re-opens immediately.
     */
    Donkeycraft.InventoryUI.prototype.open = function () {
        if (this._closing) {
            this._cancelClose();
            return;
        }

        if (this._open) return;

        this._open = true;
        this._closing = false;

        if (this._panelEl) {
            this._panelEl.style.opacity = '';
            this._panelEl.style.pointerEvents = '';
            this._panelEl.classList.remove('closing');
            this._panelEl.classList.add('open');
        }

        if (this._toggleBtnEl) {
            this._toggleBtnEl.classList.add('active');
        }

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
            this._panelEl.classList.remove('open');
        }

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

            if (self._subscriptions.onClose) {
                for (var i = 0; i < self._subscriptions.onClose.length; i++) {
                    try { self._subscriptions.onClose[i](); } catch (e) { }
                }
            }
        }, 2000);
    };

    /**
     * _cancelClose — cancels an in-progress close animation and re-opens immediately.
     * @private
     */
    Donkeycraft.InventoryUI.prototype._cancelClose = function () {
        if (this._closeTimeout) {
            clearTimeout(this._closeTimeout);
            this._closeTimeout = null;
        }
        this._closing = false;
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
            0: '', 1: '🪨', 3: '🟫', 4: '🟩', 5: '🪵', 6: '🟨', 7: '🟫',
            10: '⬛', 11: '🔴', 12: '🟡', 14: '🟢', 24: '🪵', 30: '🪵',
            45: '🔲', 54: '📦', 61: '🔥', 138: '🪨', 184: '📚', 187: '📦',
            191: '🔥', 195: '🔨', 214: '⚫', 218: '💎', 219: '🟢', 220: '🔵',
            221: '⚪', 222: '🟡', 225: '🟡', 226: '⚪', 227: '💎', 229: '🔴',
            230: '🔴', 310: '🥢', 312: '🔦'
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
     * PaperdollRenderer configuration constants.
     * @private
     */
    var _HEAD_YAW_LIMIT = 0.52;
    var _HEAD_PITCH_LIMIT = 0.26;
    var _CANVAS_WIDTH = 128;
    var _CANVAS_HEIGHT = 180;
    var _MAGENTA = { r: 1, g: 0, b: 1 };

    /**
     * EntityShapeDefs — Standardized bone shape definitions for all entity types.
     * Shared between PaperdollRenderer and EntityRenderer for visual consistency.
     * All offsets use feet-at-origin convention (Y=0 = ground level).
     * @private
     */
    var _PAPERDOLL_BONES = [
        // Torso — center of body mass
        { name: 'body',  meshType: 'box', dimensions: { w: 0.6, h: 0.9, d: 0.3 }, color: '#3366CC', offset: { x: 0, y: 0.85, z: 0 } },
        // Head — centered on top of body
        { name: 'head',  meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#FFCC99', offset: { x: 0, y: 1.55, z: 0 } },
        // Eyes — small dark boxes on front of head (parented to head bone)
        { name: 'leftEye',  meshType: 'box', dimensions: { w: 0.08, h: 0.06, d: 0.08 }, color: '#1a1a2e', offset: { x: -0.12, y: 1.65, z: 0.24 }, parent: 'head' },
        { name: 'rightEye', meshType: 'box', dimensions: { w: 0.08, h: 0.06, d: 0.08 }, color: '#1a1a2e', offset: { x: 0.12, y: 1.65, z: 0.24 }, parent: 'head' },
        // Hair — box on top/back of head (parented to head bone)
        { name: 'hair', meshType: 'box', dimensions: { w: 0.54, h: 0.18, d: 0.52 }, color: '#4a3728', offset: { x: 0, y: 1.82, z: -0.02 }, parent: 'head' },
        // Left arm — pivot at shoulder (top-left of body)
        { name: 'leftArm',  meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#FFCC99', offset: { x: -0.42, y: 1.15, z: 0 }, pivot: { x: -0.42, y: 1.25, z: 0 } },
        // Right arm — pivot at shoulder (top-right of body)
        { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25, h: 0.8, d: 0.25 }, color: '#FFCC99', offset: { x: 0.42, y: 1.15, z: 0 }, pivot: { x: 0.42, y: 1.25, z: 0 } },
        // Left leg — pivot at hip (bottom-left of body)
        { name: 'leftLeg',  meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#3366CC', offset: { x: -0.15, y: 0.45, z: 0 }, pivot: { x: -0.15, y: 0.45, z: 0 } },
        // Right leg — pivot at hip (bottom-right of body)
        { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25, h: 0.9, d: 0.25 }, color: '#3366CC', offset: { x: 0.15, y: 0.45, z: 0 }, pivot: { x: 0.15, y: 0.45, z: 0 } }
    ];

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

        // Camera (fixed front-facing view).
        // Adjusted for 128×180 canvas and 1.5× larger entity (height ≈ 2.7).
        // Entity center ≈ y=1.35; camera target centered on entity body.
        this._camPos = { x: 0, y: 1.35, z: 5.0 };
        this._camTarget = { x: 0, y: 1.2, z: 0 };
        this._fov = 45;
        this._aspect = _CANVAS_WIDTH / _CANVAS_HEIGHT;

        // Entity
        this._entity = null;

        // WebGL shader resources
        this._shaderProgram = null;
        this._aPositionLoc = -1;
        this._aNormalLoc = -1;
        this._uModel = -1;
        this._uColor = -1;
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
            console.error('[PaperdollRenderer] Shader program link failed:', gl.getProgramInfoLog(program));
            return false;
        }

        this._shaderProgram = program;
        this._aPositionLoc = gl.getAttribLocation(program, 'aPosition');
        this._aNormalLoc = gl.getAttribLocation(program, 'aNormal');
        this._uModel = gl.getUniformLocation(program, 'uModel');
        this._uColor = gl.getUniformLocation(program, 'uColor');
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
        if (!gl) return null;

        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            var typeStr = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
            console.error('[PaperdollRenderer] ' + typeStr + ' shader compilation failed:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
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

        // Use separate width/height constants for 128×180 canvas.
        // Position canvas at bottom of container so entity feet (Y=0) align near the bottom.
        this._canvas.style.position = 'absolute';
        this._canvas.style.left = '0px';
        this._canvas.style.bottom = '0px';
        this._canvas.style.top = 'auto';
        this._canvas.style.width = _CANVAS_WIDTH + 'px';
        this._canvas.style.height = _CANVAS_HEIGHT + 'px';
        this._canvas.style.pointerEvents = 'none';
        this._canvas.style.zIndex = '1';

        // Set pixel dimensions to match CSS size.
        this._canvas.width = _CANVAS_WIDTH;
        this._canvas.height = _CANVAS_HEIGHT;

        this._container.appendChild(this._canvas);

        try {
            this._gl = this._canvas.getContext('webgl', {
                alpha: true,
                antialias: true,
                premultipliedAlpha: false
            });
        } catch (e) {
            console.error('[PaperdollRenderer] WebGL context creation failed:', e.message || e);
            return false;
        }

        if (!this._gl) {
            console.error('[PaperdollRenderer] WebGL context is null');
            return false;
        }

        this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
        this._aspect = this._canvas.width / this._canvas.height;

        return true;
    };

    /**
     * _createEntity — Create the player entity object with bone definitions and animation interface.
     *
     * The returned entity conforms to the render loop interface:
     * `getPosition()`, `getRotation()`, `getDimensions()`, `isAlive()`, `getBones()`, `getBoneTransforms()`.
     *
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._createEntity = function () {
        var self = this;

        // Position entity so feet sit at Y=0 (bottom of container).
        // Entity height is 1.5× larger, total height ≈ 2.7.
        self._pos = { x: 0, y: 0, z: 0 };
        // yaw = 0: entity faces +Z toward camera. With symmetric box meshes,
        // yaw=π would swap left/right arms making it look like the back.
        self._rot = { yaw: 0, pitch: 0 };

        // Scale factor for 1.5× larger entity.
        var S = 1.5;

        this._entity = {
            type: 'player',
            _width: 0.6 * S,   // 0.9
            _height: 1.8 * S,   // 2.7

            getPosition: function () { return self._pos; },
            getRotation: function () { return self._rot; },
            getDimensions: function () { return { width: self._width, height: self._height }; },
            isAlive: function () { return true; },

            /**
             * getBones — Returns the player entity bone definitions with correct shoulder/hip pivots.
             *
             * Each bone defines a body part mesh and its attachment point relative to the entity origin.
             * The `pivot` property specifies the rotation center (e.g., shoulders for arms, hips for legs).
             *
             * @returns {Array<{name: string, meshType: string, dimensions: Object, color: string, offset: {x:number,y:number,z:number}, pivot: {x:number,y:number,z:number}}>} Bone definitions.
             */
            getBones: function () {
                return [
                    // Torso — center of body mass
                    { name: 'body',  meshType: 'box', dimensions: { w: 0.6 * S, h: 0.9 * S, d: 0.3 * S }, color: '#3366CC', offset: { x: 0, y: 0.85 * S, z: 0 } },
                    // Head — centered on top of body
                    { name: 'head',  meshType: 'box', dimensions: { w: 0.5 * S, h: 0.5 * S, d: 0.5 * S }, color: '#FFCC99', offset: { x: 0, y: 1.55 * S, z: 0 } },
                    // Eyes — small dark boxes on front of head (parented to head bone)
                    { name: 'leftEye',  meshType: 'box', dimensions: { w: 0.08 * S, h: 0.06 * S, d: 0.08 * S }, color: '#1a1a2e', offset: { x: -0.12 * S, y: 1.65 * S, z: 0.24 * S }, parent: 'head' },
                    { name: 'rightEye', meshType: 'box', dimensions: { w: 0.08 * S, h: 0.06 * S, d: 0.08 * S }, color: '#1a1a2e', offset: { x: 0.12 * S, y: 1.65 * S, z: 0.24 * S }, parent: 'head' },
                    // Hair — box on top/back of head (parented to head bone)
                    { name: 'hair', meshType: 'box', dimensions: { w: 0.54 * S, h: 0.18 * S, d: 0.52 * S }, color: '#4a3728', offset: { x: 0, y: 1.82 * S, z: -0.02 * S }, parent: 'head' },
                    // Left arm — pivot at shoulder (top-left of body)
                    { name: 'leftArm',  meshType: 'box', dimensions: { w: 0.25 * S, h: 0.8 * S, d: 0.25 * S }, color: '#FFCC99', offset: { x: -0.42 * S, y: 1.15 * S, z: 0 }, pivot: { x: -0.42 * S, y: 1.25 * S, z: 0 } },
                    // Right arm — pivot at shoulder (top-right of body)
                    { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25 * S, h: 0.8 * S, d: 0.25 * S }, color: '#FFCC99', offset: { x: 0.42 * S, y: 1.15 * S, z: 0 }, pivot: { x: 0.42 * S, y: 1.25 * S, z: 0 } },
                    // Left leg — pivot at hip (bottom-left of body)
                    { name: 'leftLeg',  meshType: 'box', dimensions: { w: 0.25 * S, h: 0.9 * S, d: 0.25 * S }, color: '#3366CC', offset: { x: -0.15 * S, y: 0.45 * S, z: 0 }, pivot: { x: -0.15 * S, y: 0.45 * S, z: 0 } },
                    // Right leg — pivot at hip (bottom-right of body)
                    { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25 * S, h: 0.9 * S, d: 0.25 * S }, color: '#3366CC', offset: { x: 0.15 * S, y: 0.45 * S, z: 0 }, pivot: { x: 0.15 * S, y: 0.45 * S, z: 0 } }
                ];
            },

            /**
             * getBoneTransforms — Returns the last computed bone rotation transforms.
             * Used by the render loop to apply skeletal animation per-frame.
             * @returns {Object.<string, {rx:number, ry:number, rz:number}>} Bone rotation map.
             */
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
            hw, hh, hd, 0, 0, 1, 1, 1,
            -hw, hh, hd, 0, 0, 1, 0, 1,
            hw, -hh, -hd, 0, 0, -1, 0, 0,
            -hw, -hh, -hd, 0, 0, -1, 1, 0,
            -hw, hh, -hd, 0, 0, -1, 1, 1,
            hw, hh, -hd, 0, 0, -1, 0, 1,
            -hw, hh, hd, 0, 1, 0, 0, 0,
            hw, hh, hd, 0, 1, 0, 1, 0,
            hw, hh, -hd, 0, 1, 0, 1, 1,
            -hw, hh, -hd, 0, 1, 0, 0, 1,
            -hw, -hh, -hd, 0, -1, 0, 0, 0,
            hw, -hh, -hd, 0, -1, 0, 1, 0,
            hw, -hh, hd, 0, -1, 0, 1, 1,
            -hw, -hh, hd, 0, -1, 0, 0, 1,
            hw, -hh, hd, 1, 0, 0, 0, 0,
            hw, -hh, -hd, 1, 0, 0, 1, 0,
            hw, hh, -hd, 1, 0, 0, 1, 1,
            hw, hh, hd, 1, 0, 0, 0, 1,
            -hw, -hh, -hd, -1, 0, 0, 0, 0,
            -hw, -hh, hd, -1, 0, 0, 1, 0,
            -hw, hh, hd, -1, 0, 0, 1, 1,
            -hw, hh, -hd, -1, 0, 0, 0, 1
        ]);
        var idx = new Uint16Array([
            0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11,
            12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23
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
        if (!this._gl || this._contextLost) return null;

        var key = 'box:' + w.toFixed(2) + ':' + h.toFixed(2) + ':' + d.toFixed(2);
        if (this._meshCache[key]) return this._meshCache[key];

        var gl = this._gl;
        var mesh = this._createBoxMesh(w, h, d);

        if (!mesh.vertices || mesh.vertices.length === 0 ||
            !mesh.indices || mesh.indices.length === 0) {
            console.warn('[PaperdollRenderer] Empty mesh data for key "' + key + '"');
            return null;
        }

        var vbo = gl.createBuffer();
        if (!vbo) {
            console.warn('[PaperdollRenderer] gl.createBuffer() failed — context may be lost');
            return null;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

        var ibo = gl.createBuffer();
        if (!ibo) {
            console.warn('[PaperdollRenderer] gl.createBuffer() failed for IBO — context may be lost');
            gl.deleteBuffer(vbo);
            return null;
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

        this._meshCache[key] = { vbo: vbo, ibo: ibo, count: mesh.count, stride: 8 * 4 };
        return this._meshCache[key];
    };

    /**
     * _drawMesh — Issue a draw call for a cached mesh with world transform and color.
     *
     * Sets the shader program, model matrix, flat color (parsed from hex),
     * binds vertex attributes, and calls `gl.drawElements`.
     *
     * Accepts either a raw Float32Array or a Matrix4 object with a `.getData()` method.
     *
     * @param {{vbo: WebGLBuffer, ibo: WebGLBuffer, count: number, stride: number}} cache - Mesh cache entry.
     * @param {Float32Array|Object} modelMatrix - 4×4 model matrix (raw Float32Array or Matrix4 object).
     * @param {string} color - Hex color string (e.g., '#3366CC').
     * @returns {boolean} True if the draw call succeeded.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._drawMesh = function (cache, modelMatrix, color) {
        var gl = this._gl;
        if (!gl || !cache) return false;

        // Extract raw Float32Array from Matrix4 object if needed.
        var matrixData = modelMatrix;
        if (modelMatrix && typeof modelMatrix.getData === 'function') {
            matrixData = modelMatrix.getData();
        }

        gl.useProgram(this._shaderProgram);
        gl.uniformMatrix4fv(this._uModel, false, matrixData);

        // Parse hex color (#RRGGBB or #RGB).
        var hex = color.substring(1);
        var r, g, b;
        if (hex.length === 6) {
            r = parseInt(hex.substr(0, 2), 16) / 255;
            g = parseInt(hex.substr(2, 2), 16) / 255;
            b = parseInt(hex.substr(4, 2), 16) / 255;
        } else if (hex.length === 3) {
            r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
            g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
            b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
        } else {
            r = _MAGENTA.r; g = _MAGENTA.g; b = _MAGENTA.b;
        }
        gl.uniform3f(this._uColor, r, g, b);

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
     * (idle, walk, run, wave) defines unique bone rotations. Static feature bones (eyes, hair)
     * inherit the head's final rotation so they stay attached to the head during all movement.
     *
     * Head tracking override is applied BEFORE propagating to child bones, ensuring eyes and hair
     * follow the mouse-corrected head rotation rather than the animation's raw rotation.
     *
     * @param {number} dt - Delta time in seconds since last frame.
     * @returns {Object.<string, {rx:number, ry:number, rz:number}>} Bone rotation map.
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._computeBoneTransforms = function (dt) {
        var t = this._animTime;
        var transforms = {};

        // Step 1: Compute base animation rotations for each state.
        switch (this._animState) {
            case 'idle': {
                // Subtle breathing: body oscillates slightly, arms sway gently
                transforms.body = { rx: 0, ry: Math.sin(t * 0.8) * 0.15, rz: 0 };
                transforms.head = { rx: Math.sin(t * 0.6) * 0.08, ry: Math.sin(t * 0.5) * 0.2, rz: 0 };
                transforms.leftArm = { rx: Math.sin(t * 0.7) * 0.1, ry: 0, rz: 0 };
                transforms.rightArm = { rx: Math.sin(t * 0.7 + 1) * 0.1, ry: 0, rz: 0 };
                transforms.leftLeg = { rx: 0, ry: Math.sin(t * 0.5) * 0.05, rz: 0 };
                transforms.rightLeg = { rx: 0, ry: Math.sin(t * 0.5 + 0.5) * 0.05, rz: 0 };
                break;
            }
            case 'walk': {
                var walkSpeed = 2.5;
                var swingAmount = 0.6;
                transforms.body = { rx: 0.05, ry: Math.sin(t * walkSpeed) * 0.1, rz: 0 };
                transforms.head = { rx: 0, ry: Math.sin(t * walkSpeed) * 0.08, rz: 0 };
                transforms.leftArm = { rx: -Math.sin(t * walkSpeed) * swingAmount, ry: 0, rz: 0 };
                transforms.rightArm = { rx: Math.sin(t * walkSpeed) * swingAmount, ry: 0, rz: 0 };
                transforms.leftLeg = { rx: Math.sin(t * walkSpeed) * swingAmount, ry: 0, rz: 0 };
                transforms.rightLeg = { rx: -Math.sin(t * walkSpeed) * swingAmount, ry: 0, rz: 0 };
                break;
            }
            case 'run': {
                var runSpeed = 4.5;
                var runSwing = 1.0;
                transforms.body = { rx: 0.2, ry: Math.sin(t * runSpeed) * 0.15, rz: 0 };
                transforms.head = { rx: -0.15, ry: Math.sin(t * runSpeed) * 0.1, rz: 0 };
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
                transforms.rightArm = { rx: -2.5 + waveCycle * 0.3, ry: 0.5 + waveCycle * 0.4, rz: 0.3 };
                transforms.leftLeg = { rx: 0, ry: 0, rz: 0 };
                transforms.rightLeg = { rx: 0, ry: 0, rz: 0 };
                break;
            }
        }

        // Step 2: Apply head tracking override BEFORE propagating to child bones.
        // This ensures eyes and hair follow the mouse-corrected head rotation.
        if (this._mouseInside) {
            transforms.head = {
                rx: this._headOverride.pitch,  // pitch from mouse Y
                ry: this._headOverride.yaw,    // yaw from mouse X
                rz: 0
            };
        }

        // Step 3: Propagate head rotation to child bones (eyes, hair).
        // These feature bones stay attached to the head and inherit its final rotation directly.
        var headRot = transforms.head || { rx: 0, ry: 0, rz: 0 };
        transforms.leftEye = { rx: headRot.rx, ry: headRot.ry, rz: headRot.rz };
        transforms.rightEye = { rx: headRot.rx, ry: headRot.ry, rz: headRot.rz };
        transforms.hair = { rx: headRot.rx, ry: headRot.ry, rz: headRot.rz };

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
            this._animState = newState;
            this._stateTimer = 2 + Math.random() * 3;
        }
    };

    /**
     * _renderFrame — Render a single animation frame.
     *
     * Updates animation state, computes bone transforms, and draws all entity bones.
     * When `_running` is false (e.g., after `destroy()` was called), the render loop
     * exits immediately without scheduling another frame.
     *
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._renderFrame = function (timestamp) {
        if (!this._running) return;

        var gl = this._gl;

        // Calculate delta time and advance animation state every frame.
        if (this._lastFrameTime === 0) this._lastFrameTime = timestamp;
        var dt = Math.min((timestamp - this._lastFrameTime) / 1000, 0.1);
        this._lastFrameTime = timestamp;

        // Always compute bone transforms (even when paused, for stable render).
        this._updateAnimationState(dt);
        var transforms = this._computeBoneTransforms(dt);

        if (!gl || !this._shaderProgram) {
            // Context lost or shader not ready — keep animating without rendering.
            this._rafId = requestAnimationFrame(this._renderFrame.bind(this));
            return;
        }

        try {
            gl.useProgram(this._shaderProgram);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);

            // Set up projection and view matrices using Donkeycraft.Matrix4.
            if (!Donkeycraft.Matrix4 || !Donkeycraft.Vector3) {
                throw new Error('Donkeycraft.Matrix4 or Vector3 not available');
            }

            var proj = Donkeycraft.Matrix4.createPerspective(this._fov * Math.PI / 180, this._aspect, 0.1, 100);
            var view = Donkeycraft.Matrix4.createLookAt(
                new Donkeycraft.Vector3(this._camPos.x, this._camPos.y, this._camPos.z),
                new Donkeycraft.Vector3(this._camTarget.x, this._camTarget.y, this._camTarget.z),
                new Donkeycraft.Vector3(0, 1, 0)
            );

            gl.uniformMatrix4fv(this._uProjection, false, proj.getData());
            gl.uniformMatrix4fv(this._uView, false, view.getData());
            gl.uniform3f(this._uFogColor, 0.53, 0.8, 0.97);
            gl.uniform1f(this._uFogDensity, 0.02);

            // Draw each bone if entity is available.
            var entity = this._entity;
            if (entity) {
                var pos = entity.getPosition && entity.getPosition();
                if (pos) {
                    var bones = entity.getBones();
                    if (bones) {
                        var rot = entity.getRotation();
                        var yaw = rot && rot.yaw !== undefined ? rot.yaw : 0;
                        var cosYaw = Math.cos(yaw);
                        var sinYaw = Math.sin(yaw);

                        // Step 1: Pre-compute world transforms (position + rotation) for all bones.
                        // All bone offsets are defined in ENTITY-LOCAL space.
                        // World position = entityPos + R_entityYaw × offset
                        // For parented bones, also apply parent's animation rotation around parent's world position.
                        var boneWorld = {};

                        /**
                         * Apply a rotation matrix (built from rx,ry,rz) to a vector.
                         * Uses YXZ rotation order matching the render loop.
                         */
                        function applyRotToVec(vx, vy, vz, rx, ry, rz) {
                            // Y rotation
                            var x1 = vx * Math.cos(ry) - vz * Math.sin(ry);
                            var z1 = vx * Math.sin(ry) + vz * Math.cos(ry);
                            var y1 = vy;
                            // X rotation
                            var y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx);
                            var z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx);
                            var x2 = x1;
                            // Z rotation
                            var x3 = x2 * Math.cos(rz) - y2 * Math.sin(rz);
                            var y3 = x2 * Math.sin(rz) + y2 * Math.cos(rz);
                            var z3 = z2;
                            return { x: x3, y: y3, z: z3 };
                        }

                        function computeBoneWorld(boneDef, animTransform) {
                            if (boneWorld[boneDef.name]) return boneWorld[boneDef.name];

                            var offset = boneDef.offset || { x: 0, y: 0, z: 0 };
                            var pivot = boneDef.pivot || null;
                            var parentName = boneDef.parent || null;

                            // Get animation transform for this bone (fall back to zero).
                            var anim = animTransform && animTransform[boneDef.name] ? animTransform[boneDef.name] : { rx: 0, ry: 0, rz: 0 };

                            var wx, wy, wz;

                            if (parentName) {
                                // Parented bone (e.g., eyes/hair attached to head).
                                // All offsets are in entity-local space.
                                // Step A: Find parent's world position and its offset.
                                var parentOffset = null;
                                var parentWorld = null;
                                for (var k = 0; k < bones.length; k++) {
                                    if (bones[k].name === parentName) {
                                        parentOffset = bones[k].offset || { x: 0, y: 0, z: 0 };
                                        parentWorld = computeBoneWorld(bones[k], animTransform);
                                        break;
                                    }
                                }

                                if (parentWorld && parentOffset) {
                                    // Step B: Apply entity yaw to both child and parent offsets.
                                    var childLocalX = offset.x * cosYaw - offset.z * sinYaw;
                                    var childLocalZ = offset.x * sinYaw + offset.z * cosYaw;
                                    var childLocalY = offset.y;

                                    var parentLocalX = parentOffset.x * cosYaw - parentOffset.z * sinYaw;
                                    var parentLocalZ = parentOffset.x * sinYaw + parentOffset.z * cosYaw;
                                    var parentLocalY = parentOffset.y;

                                    // Step C: Compute relative offset in entity-local space.
                                    var dx = childLocalX - parentLocalX;
                                    var dy = childLocalY - parentLocalY;
                                    var dz = childLocalZ - parentLocalZ;

                                    // Step D: Apply parent's animation rotation to the relative offset.
                                    var rotated = applyRotToVec(dx, dy, dz, anim.rx, anim.ry, anim.rz);

                                    // Step E: World position = parent world + rotated relative offset.
                                    wx = parentWorld.x + rotated.x;
                                    wy = parentWorld.y + rotated.y;
                                    wz = parentWorld.z + rotated.z;
                                } else {
                                    // Parent not found — fall back to simple yaw rotation.
                                    wx = pos.x + (offset.x * cosYaw - offset.z * sinYaw);
                                    wy = pos.y + offset.y;
                                    wz = pos.z + (offset.x * sinYaw + offset.z * cosYaw);
                                }
                            } else if (pivot) {
                                // Pivot bone: position relative to pivot point.
                                var dx2 = offset.x - pivot.x;
                                var dy2 = offset.y - pivot.y;
                                var dz2 = offset.z - pivot.z;
                                wx = (pivot.x + pos.x) + (dx2 * cosYaw - dz2 * sinYaw);
                                wy = (pivot.y + pos.y) + dy2;
                                wz = (pivot.z + pos.z) + (dx2 * sinYaw + dz2 * cosYaw);
                            } else {
                                // Simple bone: yaw-rotated offset from entity origin.
                                wx = pos.x + (offset.x * cosYaw - offset.z * sinYaw);
                                wy = pos.y + offset.y;
                                wz = pos.z + (offset.x * sinYaw + offset.z * cosYaw);
                            }

                            // Store world position AND animation rotation for child bone lookups.
                            boneWorld[boneDef.name] = { x: wx, y: wy, z: wz, rx: anim.rx, ry: anim.ry, rz: anim.rz };
                            return boneWorld[boneDef.name];
                        }

                        // Pre-compute all bones in a single pass (topological order ensures parents are computed before children).
                        for (var bi = 0; bi < bones.length; bi++) {
                            computeBoneWorld(bones[bi], transforms);
                        }

                        // Step 2: Render all bones using pre-computed world transforms.
                        // Build model matrix EXACTLY like EntityRenderer._buildModelMatrix:
                        // 1) Start with identity, multiply by rotations (Ry × Rx × Rz).
                        // 2) Then set translation components directly on _data[12-14].
                        for (var i = 0; i < bones.length; i++) {
                            var bone = bones[i];
                            var transform = transforms[bone.name] || { rx: 0, ry: 0, rz: 0 };
                            var bw = computeBoneWorld(bone);

                            // Build rotation matrix (same as EntityRenderer).
                            var modelMatrix = Donkeycraft.Matrix4.createIdentity();
                            if (transform.ry !== 0) modelMatrix = Donkeycraft.Matrix4.multiply(modelMatrix, Donkeycraft.Matrix4.createRotation(transform.ry, new Donkeycraft.Vector3(0, 1, 0)));
                            if (transform.rx !== 0) modelMatrix = Donkeycraft.Matrix4.multiply(modelMatrix, Donkeycraft.Matrix4.createRotation(transform.rx, new Donkeycraft.Vector3(1, 0, 0)));
                            if (transform.rz !== 0) modelMatrix = Donkeycraft.Matrix4.multiply(modelMatrix, Donkeycraft.Matrix4.createRotation(transform.rz, new Donkeycraft.Vector3(0, 0, 1)));

                            // Set translation directly on matrix data (matches EntityRenderer behavior).
                            modelMatrix._data[12] = bw.x;
                            modelMatrix._data[13] = bw.y;
                            modelMatrix._data[14] = bw.z;

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
        } catch (e) {
            console.error('[PaperdollRenderer] Render error:', e.message || e);
        }

        // Request next frame.
        this._rafId = requestAnimationFrame(this._renderFrame.bind(this));
    };

    /**
     * init — Initialize the paperdoll renderer. Creates canvas, compiles shaders, creates entity.
     *
     * Guards against double-initialization: if already running, returns true immediately
     * without creating duplicate canvases or starting duplicate animation loops.
     *
     * @returns {boolean} True if initialization succeeded (or was already initialized).
     */
    Donkeycraft.PaperdollRenderer.prototype.init = function () {
        if (this._running) return true;

        if (!this._container) {
            console.error('[PaperdollRenderer] No container element provided');
            return false;
        }

        if (!this._createCanvas()) {
            console.error('[PaperdollRenderer] Canvas creation failed');
            return false;
        }

        if (!this._createShaderProgram()) {
            console.error('[PaperdollRenderer] Shader program creation failed');
            return false;
        }

        this._createEntity();
        this._setupHoverDetection();

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
     * @private
     */
    Donkeycraft.PaperdollRenderer.prototype._setupHoverDetection = function () {
        var self = this;

        // Find the inventory panel and paperdoll container.
        var panel = document.querySelector('.dk-inventory-panel');
        var container = this._container;
        if (!panel || !container) return;

        // Head tracking: map mouse position within the paperdoll container to head rotation.
        // The _HEAD_YAW_LIMIT (0.52 rad ≈ 30°) and _HEAD_PITCH_LIMIT (0.26 rad ≈ 15°) define
        // the maximum head rotation. Mouse X maps to yaw (left/right), mouse Y maps to pitch (up/down).
        var globalMouseMove = function (e) {
            if (!self._mouseInside) return;
            var cRect = container.getBoundingClientRect();
            if (!cRect) return;

            // Normalize mouse position relative to the container.
            // Clamp to [-1, 1] so that even when the mouse is at the panel edges
            // (outside the container), the head rotation stays within the configured limits.
            var mx = Math.max(-1, Math.min(1, ((e.clientX - cRect.left) / cRect.width) * 2 - 1));
            var my = Math.max(-1, Math.min(1, ((e.clientY - cRect.top) / cRect.height) * 2 - 1));

            // Map to head rotation limits: max ~30° yaw, ~15° pitch.
            // Positive yaw turns LEFT in Y-up coords (counter-clockwise from above).
            // Mouse RIGHT (positive mx) should make the head turn RIGHT → negate yaw.
            self._headOverride.yaw = -mx * _HEAD_YAW_LIMIT;
            self._headOverride.pitch = my * _HEAD_PITCH_LIMIT;
        };

        var handleEnter = function () {
            self._mouseInside = true;
            // Pause animation state updates (but keep rendering).
            self.pause();
            // Start listening to global mouse move for head tracking.
            document.addEventListener('mousemove', globalMouseMove);
            for (var i = 0; i < self._onHoverChange.length; i++) {
                try { self._onHoverChange[i](true); } catch (e) { }
            }
        };

        var handleLeave = function () {
            self._mouseInside = false;
            self.resume();
            // Stop listening to global mouse move.
            document.removeEventListener('mousemove', globalMouseMove);
            // Clear head override so head returns to neutral.
            self._headOverride.yaw = 0;
            self._headOverride.pitch = 0;
            for (var i = 0; i < self._onHoverChange.length; i++) {
                try { self._onHoverChange[i](false); } catch (e) { }
            }
        };

        this._hoverHandlers = { enter: handleEnter, leave: handleLeave, move: globalMouseMove };

        // Attach enter/leave to the inventory panel so head tracking works
        // whenever the mouse is anywhere over the panel, not just the canvas.
        panel.addEventListener('mouseenter', handleEnter);
        panel.addEventListener('mouseleave', handleLeave);
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
     * Clamps input to [-1, 1] before mapping to configured rotation limits.
     *
     * @param {number} x - Normalized X position in [-1, 1] (-1 = left, 1 = right).
     * @param {number} y - Normalized Y position in [-1, 1] (-1 = top, 1 = bottom).
     */
    Donkeycraft.PaperdollRenderer.prototype.setMouseTrack = function (x, y) {
        var cx = Math.max(-1, Math.min(1, x));
        var cy = Math.max(-1, Math.min(1, y));
        // Negate yaw so positive X → head turns right (consistent with mouse tracking).
        this._headOverride.yaw = -cx * _HEAD_YAW_LIMIT;
        this._headOverride.pitch = cy * _HEAD_PITCH_LIMIT;
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
        if (this._open) {
            this.close();
        }

        if (this._panelEl && this._panelEl.parentNode) {
            this._panelEl.parentNode.removeChild(this._panelEl);
        }

        if (this._toggleBtnEl && this._toggleBtnEl.parentNode) {
            this._toggleBtnEl.parentNode.removeChild(this._toggleBtnEl);
        }

        this._subscriptions = {};
        this._playerInventory = null;
        this._backpackInventory = null;
    };

})();