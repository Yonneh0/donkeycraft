// Donkeycraft — GUI Manager
// Central GUI system managing open screens, modal stacking, and keyboard routing.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * GuiManager — manages the stack of open GUI screens and routes input to them.
     * @param {HTMLElement} [container=null] - DOM container for GUI panels.
     * @param {HTMLElement} [backdrop=null] - DOM backdrop element for modal dimming.
     */
    Donkeycraft.GuiManager = function(container, backdrop) {
        this._container = container || null;
        this._backdrop = backdrop || null;

        // Stack of open GUI screens: { type, data, ui, panelEl }
        this._guiStack = [];

        // Registered UI components by type
        this._uiComponents = {};

        // Event listeners for internal events
        this._listeners = {
            _onOpen: [],
            _onClose: []
        };
    };

    /**
     * registerComponent — registers a UI component by type.
     * @param {string} type - GUI type identifier.
     * @param {Function} constructor - Constructor function for the UI component.
     */
    Donkeycraft.GuiManager.prototype.registerComponent = function(type, constructor) {
        this._uiComponents[type] = constructor;
    };

    /**
     * open — opens a GUI screen on top of the stack.
     * Creates a panel element, instantiates the UI component, and appends to DOM.
     * @param {string} type - GUI type ('inventory', 'crafting_table', 'furnace', etc.).
     * @param {Object} [data=null] - Optional data to pass to the UI component.
     */
    Donkeycraft.GuiManager.prototype.open = function(type, data) {
        data = data || {};

        // Create panel element for this GUI
        var panelEl = document.createElement('div');
        panelEl.className = 'dk-gui-panel dk-interactive';
        panelEl.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 50;';

        // Create UI component if registered — pass panelEl as container
        var ui = null;
        if (this._uiComponents[type]) {
            try {
                ui = new this._uiComponents[type](panelEl, data);
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('GuiManager: Failed to create UI for type "' + type + '": ' + e.message);
                return;
            }
        }

        var guiEntry = {
            type: type,
            data: data,
            ui: ui,
            panelEl: panelEl
        };

        // Append panel to container
        if (this._container && panelEl.parentNode !== this._container) {
            this._container.appendChild(panelEl);
        }

        // Show backdrop when first GUI opens
        if (this._backdrop && this._guiStack.length === 0) {
            this._backdrop.style.display = 'block';
        }

        this._guiStack.push(guiEntry);

        // Emit open event via global EventBus
        try {
            var globalBus = Donkeycraft.EventBus.getGlobal ? Donkeycraft.EventBus.getGlobal() : null;
            if (globalBus) {
                globalBus.emit('gui:open', { type: type, stackDepth: this._guiStack.length });
            }
        } catch (e) {}

        // Call internal listeners
        if (this._listeners._onOpen) {
            for (var i = 0; i < this._listeners._onOpen.length; i++) {
                try { this._listeners._onOpen[i](type); } catch (e) {}
            }
        }
    };

    /**
     * close — closes the top GUI screen.
     * Removes panel from DOM, destroys UI component, hides backdrop if empty.
     */
    Donkeycraft.GuiManager.prototype.close = function() {
        if (this._guiStack.length === 0) return;

        var removed = this._guiStack.pop();

        // Remove panel from DOM
        if (removed && removed.panelEl && removed.panelEl.parentNode) {
            removed.panelEl.parentNode.removeChild(removed.panelEl);
        }

        // Clean up UI component
        if (removed && removed.ui && removed.ui.destroy) {
            try { removed.ui.destroy(); } catch (e) {}
        }

        // Hide backdrop when last GUI closes
        if (this._backdrop && this._guiStack.length === 0) {
            this._backdrop.style.display = 'none';
        }

        // Emit close event via global EventBus
        try {
            var globalBus = Donkeycraft.EventBus.getGlobal ? Donkeycraft.EventBus.getGlobal() : null;
            if (globalBus) {
                globalBus.emit('gui:close', { type: removed.type, stackDepth: this._guiStack.length });
            }
        } catch (e) {}

        // Call internal listeners
        if (this._listeners._onClose) {
            for (var i = 0; i < this._listeners._onClose.length; i++) {
                try { this._listeners._onClose[i](removed.type); } catch (e) {}
            }
        }
    };

    /**
     * isOpen — checks if any GUI is currently open.
     * @returns {boolean}
     */
    Donkeycraft.GuiManager.prototype.isOpen = function() {
        return this._guiStack.length > 0;
    };

    /**
     * hasOpenScreens — alias for isOpen (external API compatibility).
     * @returns {boolean}
     */
    Donkeycraft.GuiManager.prototype.hasOpenScreens = function() {
        return this.isOpen();
    };

    /**
     * getCurrentType — gets the type of the top GUI screen.
     * @returns {string|null}
     */
    Donkeycraft.GuiManager.prototype.getCurrentType = function() {
        if (this._guiStack.length === 0) return null;
        return this._guiStack[this._guiStack.length - 1].type;
    };

    /**
     * getStack — gets a copy of the GUI stack.
     * @returns {Array} Array of { type, data, ui, panelEl } objects.
     */
    Donkeycraft.GuiManager.prototype.getStack = function() {
        return this._guiStack.slice();
    };

    /**
     * handleKeyPress — routes a key press to the top GUI.
     * Escape always closes the top GUI regardless of component handling.
     * @param {string} key - Key identifier (e.g., 'Escape', 'Digit1').
     * @returns {boolean} True if the key was consumed.
     */
    Donkeycraft.GuiManager.prototype.handleKeyPress = function(key) {
        if (this._guiStack.length === 0) return false;

        var top = this._guiStack[this._guiStack.length - 1];

        // Escape always closes the top GUI
        if (key === 'Escape') {
            this.close();
            return true;
        }

        // Route to UI component if it has handleKeyPress
        if (top.ui && typeof top.ui.handleKeyPress === 'function') {
            try {
                var consumed = top.ui.handleKeyPress(key);
                if (consumed) return true;
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.warn('GuiManager: UI handleKeyPress error: ' + e.message);
            }
        }

        return false;
    };

    /**
     * handleMouseClick — routes a mouse click to the top GUI.
     * @param {number} x - Click X coordinate (0-1 normalized).
     * @param {number} y - Click Y coordinate (0-1 normalized).
     * @param {number} [button=0] - Mouse button (0=left, 1=right, 2=middle).
     */
    Donkeycraft.GuiManager.prototype.handleMouseClick = function(x, y, button) {
        button = button || 0;
        if (this._guiStack.length === 0) return;

        var top = this._guiStack[this._guiStack.length - 1];
        if (top.ui && typeof top.ui.handleClick === 'function') {
            try { top.ui.handleClick(x, y, button); } catch (e) {}
        }
    };

    /**
     * handleDrop — handles dropping an item onto the current GUI.
     * @param {Donkeycraft.ItemStack} itemStack - The dropped item stack.
     * @param {number} slotIndex - Target slot index.
     */
    Donkeycraft.GuiManager.prototype.handleDrop = function(itemStack, slotIndex) {
        if (this._guiStack.length === 0) return;

        var top = this._guiStack[this._guiStack.length - 1];
        if (top.ui && typeof top.ui.handleDrop === 'function') {
            try { top.ui.handleDrop(itemStack, slotIndex); } catch (e) {}
        }
    };

    /**
     * closeTopScreen — alias for close (external API compatibility).
     */
    Donkeycraft.GuiManager.prototype.closeTopScreen = function() {
        this.close();
    };

    /**
     * onOpen — subscribes to GUI open events.
     * @param {Function} callback - Called with (type) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiManager.prototype.onOpen = function(callback) {
        if (!this._listeners._onOpen) this._listeners._onOpen = [];
        this._listeners._onOpen.push(callback);

        var self = this;
        return function() {
            var idx = self._listeners._onOpen.indexOf(callback);
            if (idx >= 0) self._listeners._onOpen.splice(idx, 1);
        };
    };

    /**
     * onClose — subscribes to GUI close events.
     * @param {Function} callback - Called with (type) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiManager.prototype.onClose = function(callback) {
        if (!this._listeners._onClose) this._listeners._onClose = [];
        this._listeners._onClose.push(callback);

        var self = this;
        return function() {
            var idx = self._listeners._onClose.indexOf(callback);
            if (idx >= 0) self._listeners._onClose.splice(idx, 1);
        };
    };

    /**
     * clearAll — closes all open GUIs.
     */
    Donkeycraft.GuiManager.prototype.clearAll = function() {
        while (this._guiStack.length > 0) {
            this.close();
        }
    };

    /**
     * destroy — cleans up all resources and listeners.
     */
    Donkeycraft.GuiManager.prototype.destroy = function() {
        this.clearAll();
        this._listeners = {};
        this._uiComponents = {};
        this._container = null;
        this._backdrop = null;
    };

})();