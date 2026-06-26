// Donkeycraft — GUI Manager
// Central GUI system managing open screens, modal stacking, and keyboard routing.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * GuiManager — manages the stack of open GUI screens and routes input to them.
     * @param {Object} eventBus - The global EventBus instance.
     * @param {Donkeycraft.Player} [player=null] - Reference to the player entity.
     */
    Donkeycraft.GuiManager = function(eventBus, player) {
        this._eventBus = eventBus;
        this._player = player || null;
        this._guiStack = []; // Stack of { type, data, ui }
        this._listeners = {};

        // Registered UI components
        this._uiComponents = {};
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
     * @param {string} type - GUI type ('inventory', 'crafting_table', 'furnace', etc.).
     * @param {Object} [data=null] - Optional data to pass to the UI component.
     */
    Donkeycraft.GuiManager.prototype.open = function(type, data) {
        data = data || {};

        // Create UI component if registered
        var ui = null;
        if (this._uiComponents[type]) {
            try {
                ui = new this._uiComponents[type](data);
            } catch (e) {
                if (Donkeycraft.Logger) Donkeycraft.Logger.error('GuiManager: Failed to create UI for type "' + type + '": ' + e.message);
            }
        }

        var guiEntry = {
            type: type,
            data: data,
            ui: ui
        };

        this._guiStack.push(guiEntry);

        // Emit open event
        if (this._eventBus) {
            this._eventBus.emit('gui:open', { type: type, stackDepth: this._guiStack.length });
        }

        if (this._listeners._onOpen) {
            for (var i = 0; i < this._listeners._onOpen.length; i++) {
                try { this._listeners._onOpen[i](type); } catch (e) {}
            }
        }
    };

    /**
     * close — closes the top GUI screen.
     */
    Donkeycraft.GuiManager.prototype.close = function() {
        if (this._guiStack.length === 0) return;

        var removed = this._guiStack.pop();

        // Clean up UI component
        if (removed && removed.ui && removed.ui.destroy) {
            try { removed.ui.destroy(); } catch (e) {}
        }

        // Emit close event
        if (this._eventBus) {
            this._eventBus.emit('gui:close', { type: removed.type, stackDepth: this._guiStack.length });
        }

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
     * getCurrentType — gets the type of the top GUI screen.
     * @returns {string|null}
     */
    Donkeycraft.GuiManager.prototype.getCurrentType = function() {
        if (this._guiStack.length === 0) return null;
        return this._guiStack[this._guiStack.length - 1].type;
    };

    /**
     * getStack — gets a copy of the GUI stack.
     * @returns {Array} Array of { type, data, ui } objects.
     */
    Donkeycraft.GuiManager.prototype.getStack = function() {
        return this._guiStack.slice();
    };

    /**
     * handleKeyPress — routes a key press to the top GUI.
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
        if (top.ui && top.ui.handleKeyPress) {
            try {
                var consumed = top.ui.handleKeyPress(key);
                if (consumed) return true;
            } catch (e) {}
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
        if (top.ui && top.ui.handleClick) {
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
        if (top.ui && top.ui.handleDrop) {
            try { top.ui.handleDrop(itemStack, slotIndex); } catch (e) {}
        }
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
     * getPlayer — gets the associated player entity.
     * @returns {Donkeycraft.Player|null}
     */
    Donkeycraft.GuiManager.prototype.getPlayer = function() {
        return this._player;
    };

    /**
     * destroy — cleans up all resources and listeners.
     */
    Donkeycraft.GuiManager.prototype.destroy = function() {
        this.clearAll();
        this._listeners = {};
        this._uiComponents = {};
        this._player = null;
    };

})();