// Donkeycraft — GUI Elements
// DOM-based UI interaction layer: drag-drop, buttons, tabs, text input.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    // ============================================================
    // GuiDragDrop — drag-and-drop handler for inventory slots
    // ============================================================

    /**
     * GuiDragDrop — manages drag-and-drop operations between GUI slots.
     * @param {HTMLElement|null} container - Parent container element.
     * @param {Object} [options={}] - Configuration options.
     * @param {Function} [options.onDragStart] - Callback when drag starts, called with (slotIndex, slotData).
     * @param {Function} [options.onDragEnd] - Callback when drag ends, called with (targetSlotIndex).
     * @param {Function} [options.onDrop] - Callback on drop, called with (sourceSlot, targetSlot, stack).
     */
    Donkeycraft.GuiDragDrop = function (container, options) {
        this._container = container || null;
        this._onDragStart = options && options.onDragStart ? options.onDragStart : null;
        this._onDragEnd = options && options.onDragEnd ? options.onDragEnd : null;
        this._onDrop = options && options.onDrop ? options.onDrop : null;

        this._dragState = {
            active: false,
            sourceSlot: null,
            sourceStack: null,
            dragElement: null
        };

        this._listeners = {};
        this._boundHandlers = {};

        if (this._container && this._container.nodeType === 1) {
            this._bindEvents();
        }
    };

    /**
     * _bindEvents — attaches DOM event listeners for drag-and-drop.
     * @private
     */
    Donkeycraft.GuiDragDrop.prototype._bindEvents = function () {
        var self = this;

        // Mouse down on slots (delegated from container)
        this._boundHandlers.mouseDown = function (e) {
            var slotEl = e.target.closest('.dk-slot, .dk-hotbar-slot, .dk-item-slot');
            if (!slotEl) return;

            var slotIndex = parseInt(slotEl.dataset.slotIndex, 10);
            if (isNaN(slotIndex)) return;

            // Check if dragging with left button (click-and-drag), middle button, or shift+left
            // Left-click drag is the primary interaction mode for inventory management.
            if (e.button === 0 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
                e.preventDefault();
                self._startDrag(slotIndex, e);
            }
        };

        // Mouse move on document
        this._boundHandlers.mouseMove = function (e) {
            if (!self._dragState.active) return;
            e.preventDefault();
            self._updateDragVisual(e);
            self._highlightDropTarget(e);
        };

        // Mouse up on document
        this._boundHandlers.mouseUp = function (e) {
            if (!self._dragState.active) return;
            self._endDrag(e);
        };

        this._container.addEventListener('mousedown', this._boundHandlers.mouseDown);
        document.addEventListener('mousemove', this._boundHandlers.mouseMove);
        document.addEventListener('mouseup', this._boundHandlers.mouseUp);
    };

    /**
     * _startDrag — initiates a drag operation from a slot.
     * @param {number} slotIndex - Source slot index.
     * @param {MouseEvent} e - Mouse event.
     * @private
     */
    Donkeycraft.GuiDragDrop.prototype._startDrag = function (slotIndex, e) {
        if (this._dragState.active) return;

        this._dragState.active = true;
        this._dragState.sourceSlot = slotIndex;

        // Capture the source stack data before any operations
        var slotData = this._getSlotData(slotIndex);
        this._dragState.sourceStack = slotData ? slotData.itemText : '';

        // Create drag visual element
        var sourceEl = this._container.querySelector('[data-slot-index="' + slotIndex + '"]');
        if (sourceEl) {
            var itemEl = sourceEl.querySelector('.dk-slot-item');
            var countEl = sourceEl.querySelector('.dk-slot-count');

            this._dragState.dragElement = document.createElement('div');
            this._dragState.dragElement.className = 'dk-drag-ghost dk-interactive';
            // Hidden initially — shown on mousemove to avoid interfering with hit tests
            // All static styles (position, z-index, font-size, opacity, transform, display) are defined in .dk-drag-ghost CSS
            this._dragState.dragElement.textContent = itemEl ? itemEl.textContent : '';

            if (countEl && countEl.style.display !== 'none') {
                var countSpan = document.createElement('span');
                countSpan.className = 'dk-drag-ghost-count';
                countSpan.textContent = countEl.textContent;
                this._dragState.dragElement.appendChild(countSpan);
            }

            document.body.appendChild(this._dragState.dragElement);
            // Position immediately but keep hidden until first mousemove
            this._dragState.dragElement.style.left = e.clientX + 'px';
            this._dragState.dragElement.style.top = e.clientY + 'px';
        }

        // Notify callback
        if (this._onDragStart) {
            try { this._onDragStart(slotIndex, this._getSlotData(slotIndex)); } catch (ex) { }
        }

        // Emit event
        this._emit('drag:start', { slotIndex: slotIndex });
    };

    /**
     * _updateDragVisual — updates the drag ghost position and reveals it.
     * @param {MouseEvent} e - Mouse move event.
     * @private
     */
    Donkeycraft.GuiDragDrop.prototype._updateDragVisual = function (e) {
        if (this._dragState.dragElement) {
            // Reveal on first movement so the ghost doesn't interfere with initial hit tests
            this._dragState.dragElement.style.display = '';
            this._dragState.dragElement.style.left = e.clientX + 'px';
            this._dragState.dragElement.style.top = e.clientY + 'px';
        }
    };

    /**
     * _highlightDropTarget — highlights the slot under the cursor.
     * Removes highlights from this._container only, then adds highlight to target if within container.
     * @param {MouseEvent} e - Mouse move event.
     * @private
     */
    Donkeycraft.GuiDragDrop.prototype._highlightDropTarget = function (e) {
        // Remove previous highlights only from this container (scoped to avoid affecting other drag-drop instances)
        if (this._container) {
            var prev = this._container.querySelectorAll('.dk-slot.drag-over, .dk-hotbar-slot.drag-over, .dk-item-slot.drag-over');
            for (var i = 0; i < prev.length; i++) {
                prev[i].classList.remove('drag-over');
            }
        }

        var targetEl = document.elementFromPoint(e.clientX, e.clientY);
        if (!targetEl) return;

        var slotEl = targetEl.closest('.dk-slot, .dk-hotbar-slot, .dk-item-slot');
        // Only highlight slots within this container
        if (slotEl && (!this._container || this._container.contains(slotEl))) {
            slotEl.classList.add('drag-over');
        }
    };

    /**
     * _endDrag — completes the drag operation.
     * @param {MouseEvent} e - Mouse up event.
     * @private
     */
    Donkeycraft.GuiDragDrop.prototype._endDrag = function (e) {
        if (!this._dragState.active) return;

        var targetSlot = null;

        // Clean up drag visual first — remove before hit-testing so elementFromPoint works correctly
        if (this._dragState.dragElement && this._dragState.dragElement.parentNode) {
            this._dragState.dragElement.parentNode.removeChild(this._dragState.dragElement);
            this._dragState.dragElement = null;
        }

        // Remove all drag-over highlights from document body (global cleanup)
        var highlights = document.querySelectorAll('.drag-over');
        for (var i = 0; i < highlights.length; i++) {
            highlights[i].classList.remove('drag-over');
        }

        // Find drop target after all cleanup is complete
        var targetEl = document.elementFromPoint(e.clientX, e.clientY);
        if (targetEl) {
            var slotEl = targetEl.closest('.dk-slot, .dk-hotbar-slot, .dk-item-slot');
            // Only accept drops within this container
            if (slotEl && (!this._container || this._container.contains(slotEl))) {
                targetSlot = parseInt(slotEl.dataset.slotIndex, 10);
            }
        }

        // Notify drop callback
        if (targetSlot !== null && targetSlot !== this._dragState.sourceSlot && this._onDrop) {
            try {
                this._onDrop(this._dragState.sourceSlot, targetSlot, this._dragState.sourceStack);
            } catch (ex) { }
        }

        // Notify end callback
        if (this._onDragEnd) {
            try { this._onDragEnd(targetSlot); } catch (ex) { }
        }

        this._emit('drag:end', {
            sourceSlot: this._dragState.sourceSlot,
            targetSlot: targetSlot
        });

        // Reset drag state
        this._dragState.active = false;
        this._dragState.sourceSlot = null;
        this._dragState.sourceStack = null;
        this._dragState.dragElement = null;
    };

    /**
     * _getSlotData — retrieves data from a slot by index.
     * @param {number} slotIndex - Slot index.
     * @returns {Object|null} Slot data object with itemText and countText, or null.
     * @private
     */
    Donkeycraft.GuiDragDrop.prototype._getSlotData = function (slotIndex) {
        if (!this._container) return null;

        var slotEl = this._container.querySelector('[data-slot-index="' + slotIndex + '"]');
        if (!slotEl) return null;

        var itemEl = slotEl.querySelector('.dk-slot-item');
        var countEl = slotEl.querySelector('.dk-slot-count');

        return {
            slotIndex: slotIndex,
            itemText: itemEl ? itemEl.textContent : '',
            countText: countEl ? countEl.textContent : ''
        };
    };

    /**
     * _emit — emits a drag-and-drop event to all registered listeners.
     * @param {string} event - Event name ('drag:start', 'drag:end').
     * @param {Object} data - Event data object.
     * @private
     */
    Donkeycraft.GuiDragDrop.prototype._emit = function (event, data) {
        if (this._listeners[event]) {
            for (var i = 0; i < this._listeners[event].length; i++) {
                try { this._listeners[event][i](data); } catch (ex) { }
            }
        }
    };

    /**
     * on — subscribes to a drag-and-drop event.
     * @param {string} event - Event name ('drag:start', 'drag:end').
     * @param {Function} callback - Callback function called with (data).
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiDragDrop.prototype.on = function (event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);

        var self = this;
        return function () {
            var idx = self._listeners[event].indexOf(callback);
            if (idx >= 0) self._listeners[event].splice(idx, 1);
        };
    };

    /**
     * cancelDrag — forcibly cancels the current drag operation.
     * Cleans up the drag ghost element and all drag-over highlights from the document.
     */
    Donkeycraft.GuiDragDrop.prototype.cancelDrag = function () {
        if (!this._dragState.active) return;

        if (this._dragState.dragElement && this._dragState.dragElement.parentNode) {
            this._dragState.dragElement.parentNode.removeChild(this._dragState.dragElement);
        }

        // Remove all drag-over highlights from document body
        var highlights = document.querySelectorAll('.drag-over');
        for (var i = 0; i < highlights.length; i++) {
            highlights[i].classList.remove('drag-over');
        }

        this._dragState.active = false;
        this._dragState.sourceSlot = null;
        this._dragState.sourceStack = null;
        this._dragState.dragElement = null;
    };

    /**
     * isDragging — checks if a drag operation is in progress.
     * @returns {boolean}
     */
    Donkeycraft.GuiDragDrop.prototype.isDragging = function () {
        return this._dragState.active;
    };

    /**
     * destroy — cleans up all DOM event listeners and internal state.
     */
    Donkeycraft.GuiDragDrop.prototype.destroy = function () {
        this.cancelDrag();

        if (this._container && this._boundHandlers.mouseDown) {
            this._container.removeEventListener('mousedown', this._boundHandlers.mouseDown);
        }
        if (this._boundHandlers.mouseMove) {
            document.removeEventListener('mousemove', this._boundHandlers.mouseMove);
        }
        if (this._boundHandlers.mouseUp) {
            document.removeEventListener('mouseup', this._boundHandlers.mouseUp);
        }

        this._listeners = {};
        this._boundHandlers = {};
    };

    // ============================================================
    // GuiButton — reusable button component
    // ============================================================

    /**
     * GuiButton — creates a styled button with state management.
     * @param {string} text - Button label text.
     * @param {Object} [options={}] - Configuration options.
     * @param {string} [options.className='dk-button'] - CSS class name.
     * @param {boolean} [options.disabled=false] - Initial disabled state.
     * @param {HTMLElement} [options.container=null] - Optional parent container element.
     */
    Donkeycraft.GuiButton = function (text, options) {
        options = options || {};
        this._text = text || '';
        this._className = options.className || 'dk-button';
        this._disabled = options.disabled || false;
        this._primary = this._className.indexOf('dk-button-primary') >= 0;
        this._danger = this._className.indexOf('dk-button-danger') >= 0;

        this._element = document.createElement('button');
        this._element.className = this._className;
        this._element.textContent = this._text;

        if (this._disabled) {
            this._element.disabled = true;
            this._element.setAttribute('data-disabled', 'true');
        }

        this._listeners = {};
        this._boundHandlers = {};

        // Bind events eagerly so event subscriptions work before getElement() is called
        this._bindEvents();

        if (options.container) {
            options.container.appendChild(this._element);
        }
    };

    /**
     * _bindEvents — attaches click and hover handlers to the button element.
     * @private
     */
    Donkeycraft.GuiButton.prototype._bindEvents = function () {
        var self = this;

        this._boundHandlers.click = function (e) {
            if (self._disabled) return;
            if (self._listeners.click) {
                for (var i = 0; i < self._listeners.click.length; i++) {
                    try { self._listeners.click[i](e); } catch (ex) { }
                }
            }
        };

        this._boundHandlers.mouseEnter = function (e) {
            if (self._disabled) return;
            if (self._listeners.mouseenter) {
                for (var i = 0; i < self._listeners.mouseenter.length; i++) {
                    try { self._listeners.mouseenter[i](e); } catch (ex) { }
                }
            }
        };

        this._boundHandlers.mouseLeave = function (e) {
            if (self._disabled) return;
            if (self._listeners.mouseleave) {
                for (var i = 0; i < self._listeners.mouseleave.length; i++) {
                    try { self._listeners.mouseleave[i](e); } catch (ex) { }
                }
            }
        };

        this._element.addEventListener('click', this._boundHandlers.click);
        this._element.addEventListener('mouseenter', this._boundHandlers.mouseEnter);
        this._element.addEventListener('mouseleave', this._boundHandlers.mouseLeave);
    };

    /**
     * getElement — gets the button DOM element.
     * @returns {HTMLButtonElement}
     */
    Donkeycraft.GuiButton.prototype.getElement = function () {
        return this._element;
    };

    /**
     * setText — updates the button label.
     * @param {string} text - New label text.
     */
    Donkeycraft.GuiButton.prototype.setText = function (text) {
        this._text = text || '';
        this._element.textContent = this._text;
    };

    /**
     * getText — gets the current button label.
     * @returns {string}
     */
    Donkeycraft.GuiButton.prototype.getText = function () {
        return this._text;
    };

    /**
     * setDisabled — enables or disables the button.
     * @param {boolean} disabled - Whether to disable the button.
     */
    Donkeycraft.GuiButton.prototype.setDisabled = function (disabled) {
        this._disabled = !!disabled;
        this._element.disabled = this._disabled;
        this._element.setAttribute('data-disabled', this._disabled ? 'true' : 'false');
    };

    /**
     * isDisabled — checks if the button is disabled.
     * @returns {boolean}
     */
    Donkeycraft.GuiButton.prototype.isDisabled = function () {
        return this._disabled;
    };

    /**
     * setVisible — shows or hides the button.
     * @param {boolean} visible - Whether to show the button.
     */
    Donkeycraft.GuiButton.prototype.setVisible = function (visible) {
        this._element.style.display = visible ? '' : 'none';
    };

    /**
     * isVisible — checks if the button is visible.
     * @returns {boolean}
     */
    Donkeycraft.GuiButton.prototype.isVisible = function () {
        return this._element.style.display !== 'none';
    };

    /**
     * onClick — subscribes to click events.
     * @param {Function} callback - Called with (event) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiButton.prototype.onClick = function (callback) {
        if (!this._listeners.click) this._listeners.click = [];
        this._listeners.click.push(callback);

        var self = this;
        return function () {
            var idx = self._listeners.click.indexOf(callback);
            if (idx >= 0) self._listeners.click.splice(idx, 1);
        };
    };

    /**
     * onMouseEnter — subscribes to mouse enter events.
     * @param {Function} callback - Called with (event) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiButton.prototype.onMouseEnter = function (callback) {
        if (!this._listeners.mouseenter) this._listeners.mouseenter = [];
        this._listeners.mouseenter.push(callback);

        var self = this;
        return function () {
            var idx = self._listeners.mouseenter.indexOf(callback);
            if (idx >= 0) self._listeners.mouseenter.splice(idx, 1);
        };
    };

    /**
     * onMouseLeave — subscribes to mouse leave events.
     * @param {Function} callback - Called with (event) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiButton.prototype.onMouseLeave = function (callback) {
        if (!this._listeners.mouseleave) this._listeners.mouseleave = [];
        this._listeners.mouseleave.push(callback);

        var self = this;
        return function () {
            var idx = self._listeners.mouseleave.indexOf(callback);
            if (idx >= 0) self._listeners.mouseleave.splice(idx, 1);
        };
    };

    /**
     * destroy — removes the button from DOM and cleans up event listeners.
     */
    Donkeycraft.GuiButton.prototype.destroy = function () {
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._listeners = {};
        this._boundHandlers = {};
    };

    // ============================================================
    // GuiTabNavigator — tab navigation for creative inventory
    // ============================================================

    /**
     * GuiTabNavigator — manages tabbed UI navigation.
     * @param {HTMLElement|null} container - Parent container element.
     * @param {Array<string>} tabs - Array of tab label strings.
     * @param {Object} [options={}] - Configuration options.
     * @param {string} [options.title='Creative Inventory'] - Panel title text.
     * @param {boolean} [options.showCloseButton=true] - Whether to show the close button.
     */
    Donkeycraft.GuiTabNavigator = function (container, tabs, options) {
        options = options || {};
        this._container = container || null;
        this._tabs = tabs || [];
        this._activeTabIndex = 0;
        this._title = options.title || 'Creative Inventory';
        this._showCloseButton = options.showCloseButton !== false;

        this._tabBarEl = null;
        this._tabContentEl = null;
        this._tabElements = [];
        this._listeners = {};

        if (this._container) {
            this._buildDOM();
        }
    };

    /**
     * _buildDOM — creates the tab bar and content area inside the container.
     * @private
     */
    Donkeycraft.GuiTabNavigator.prototype._buildDOM = function () {
        if (!this._container) return;

        var self = this;

        // Preserve existing classes, add required ones
        this._container.classList.add('dk-gui-panel');
        this._container.classList.add('dk-interactive');

        // Title
        var titleEl = document.createElement('div');
        titleEl.className = 'dk-panel-title';
        titleEl.textContent = this._title;
        this._container.appendChild(titleEl);

        // Close button (only if configured) — stored for cleanup
        if (this._showCloseButton) {
            this._closeBtn = document.createElement('button');
            this._closeBtn.className = 'dk-panel-close dk-interactive';
            this._closeBtn.textContent = '\u00D7';
            this._closeBtn.addEventListener('click', (function () {
                this._emit('close');
            }).bind(this));
            this._container.appendChild(this._closeBtn);
        }

        // Tab bar
        this._tabBarEl = document.createElement('div');
        this._tabBarEl.className = 'dk-tab-bar dk-interactive';
        this._container.appendChild(this._tabBarEl);

        // Tab content area
        this._tabContentEl = document.createElement('div');
        this._tabContentEl.className = 'dk-tab-content';
        this._container.appendChild(this._tabContentEl);

        // Create tab elements and initialize per-tab content storage
        for (var i = 0; i < this._tabs.length; i++) {
            var tabEl = document.createElement('button');
            tabEl.className = 'dk-tab' + (i === 0 ? ' active' : '');
            tabEl.textContent = this._tabs[i];
            tabEl.addEventListener('click', (function (idx) {
                return function () { self._setActiveTab(idx); };
            })(i));
            this._tabBarEl.appendChild(tabEl);
            this._tabElements.push(tabEl);
        }

        // Initialize per-tab content storage for persistence across tab switches
        this._tabContents = {};
        for (var j = 0; j < this._tabs.length; j++) {
            this._tabContents[j] = '';
        }
    };

    /**
     * _setActiveTab — switches to the specified tab.
     * @param {number} index - Tab index.
     * @private
     */
    Donkeycraft.GuiTabNavigator.prototype._setActiveTab = function (index) {
        if (index < 0 || index >= this._tabs.length) return;
        if (index === this._activeTabIndex) return;

        // Save current tab content before switching
        if (this._tabContentEl && this._tabContentEl.innerHTML) {
            this._tabContents[this._activeTabIndex] = this._tabContentEl.innerHTML;
        }

        // Update tab styles
        for (var i = 0; i < this._tabElements.length; i++) {
            this._tabElements[i].classList.toggle('active', i === index);
        }

        var oldTab = this._activeTabIndex;
        this._activeTabIndex = index;

        // Restore content for the new active tab
        if (this._tabContentEl) {
            this._tabContentEl.innerHTML = this._tabContents[index] || '';
        }
        this._emit('tab:change', { tabIndex: index, oldTab: oldTab });
    };

    /**
     * getActiveTab — gets the currently active tab index.
     * @returns {number}
     */
    Donkeycraft.GuiTabNavigator.prototype.getActiveTab = function () {
        return this._activeTabIndex;
    };

    /**
     * getTabCount — gets the total number of tabs.
     * @returns {number}
     */
    Donkeycraft.GuiTabNavigator.prototype.getTabCount = function () {
        return this._tabs.length;
    };

    /**
     * getTabName — gets the name of a tab by index.
     * @param {number} index - Tab index.
     * @returns {string|null} Tab name or null if out of bounds.
     */
    Donkeycraft.GuiTabNavigator.prototype.getTabName = function (index) {
        if (index < 0 || index >= this._tabs.length) return null;
        return this._tabs[index];
    };

    /**
     * setContent — sets the content HTML for the active tab.
     * @param {string} html - HTML content string.
     */
    Donkeycraft.GuiTabNavigator.prototype.setContent = function (html) {
        if (this._tabContentEl) {
            this._tabContentEl.innerHTML = html || '';
            // Also persist in the per-tab storage for the current active tab
            this._tabContents[this._activeTabIndex] = html || '';
        }
    };

    /**
     * setContentForTab — sets the content HTML for a specific tab by index.
     * @param {number} index - Tab index to set content for.
     * @param {string} html - HTML content string.
     */
    Donkeycraft.GuiTabNavigator.prototype.setContentForTab = function (index, html) {
        if (index < 0 || index >= this._tabs.length) return;
        this._tabContents[index] = html || '';
        // If this is the currently active tab, update the DOM immediately
        if (index === this._activeTabIndex && this._tabContentEl) {
            this._tabContentEl.innerHTML = html || '';
        }
    };

    /**
     * getContentForTab — gets the content HTML for a specific tab by index.
     * @param {number} index - Tab index.
     * @returns {string|null} Tab content HTML or null if out of bounds.
     */
    Donkeycraft.GuiTabNavigator.prototype.getContentForTab = function (index) {
        if (index < 0 || index >= this._tabs.length) return null;
        return this._tabContents[index] || '';
    };

    /**
     * getElement — gets the root container element.
     * @returns {HTMLElement|null}
     */
    Donkeycraft.GuiTabNavigator.prototype.getElement = function () {
        return this._container;
    };

    /**
     * _emit — emits an event to all registered listeners.
     * @param {string} event - Event name.
     * @param {Object} data - Event data.
     * @private
     */
    Donkeycraft.GuiTabNavigator.prototype._emit = function (event, data) {
        if (this._listeners[event]) {
            for (var i = 0; i < this._listeners[event].length; i++) {
                try { this._listeners[event][i](data); } catch (ex) { }
            }
        }
    };

    /**
     * on — subscribes to an event.
     * @param {string} event - Event name ('tab:change', 'close').
     * @param {Function} callback - Callback function called with (data).
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiTabNavigator.prototype.on = function (event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);

        var self = this;
        return function () {
            var idx = self._listeners[event].indexOf(callback);
            if (idx >= 0) self._listeners[event].splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources, DOM elements, and event listeners.
     */
    Donkeycraft.GuiTabNavigator.prototype.destroy = function () {
        // Remove close button from DOM
        if (this._closeBtn && this._closeBtn.parentNode) {
            this._closeBtn.parentNode.removeChild(this._closeBtn);
        }
        this._closeBtn = null;

        // Clear container content
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }

        this._listeners = {};
        this._tabContents = {};
        this._tabElements = [];
    };

    // ============================================================
    // GuiTextInput — text input field component
    // ============================================================

    /**
     * GuiTextInput — creates a styled text input field.
     * @param {Object} [options={}] - Configuration options.
     * @param {string} [options.placeholder=''] - Placeholder text.
     * @param {string} [options.value=''] - Initial value.
     * @param {number} [options.maxLength=100] - Maximum input length.
     * @param {HTMLElement} [options.container=null] - Optional parent container element.
     */
    Donkeycraft.GuiTextInput = function (options) {
        options = options || {};
        this._placeholder = options.placeholder || '';
        this._maxLength = options.maxLength !== undefined && options.maxLength !== null ? Math.max(1, options.maxLength) : 100;
        this._error = false;

        this._element = document.createElement('input');
        this._element.type = 'text';
        this._element.className = 'dk-text-input dk-interactive';
        this._element.placeholder = this._placeholder;
        this._element.maxLength = this._maxLength;
        this._element.value = options.value || '';

        this._listeners = {};
        this._boundHandlers = {};

        // Bind events eagerly so event subscriptions work before getElement() is called
        this._bindEvents();

        if (options.container) {
            options.container.appendChild(this._element);
        }
    };

    /**
     * _bindEvents — attaches input, blur, and keydown handlers to the input element.
     * @private
     */
    Donkeycraft.GuiTextInput.prototype._bindEvents = function () {
        var self = this;

        this._boundHandlers.input = function (e) {
            if (self._error) {
                self._element.classList.remove('error');
                self._error = false;
            }
            if (self._listeners.input) {
                for (var i = 0; i < self._listeners.input.length; i++) {
                    try { self._listeners.input[i](self._element.value); } catch (ex) { }
                }
            }
        };

        this._boundHandlers.blur = function (e) {
            if (self._listeners.blur) {
                for (var i = 0; i < self._listeners.blur.length; i++) {
                    try { self._listeners.blur[i](self._element.value); } catch (ex) { }
                }
            }
        };

        this._boundHandlers.keyDown = function (e) {
            if (self._listeners.keydown) {
                for (var i = 0; i < self._listeners.keydown.length; i++) {
                    try { self._listeners.keydown[i](e, self._element.value); } catch (ex) { }
                }
            }
        };

        this._element.addEventListener('input', this._boundHandlers.input);
        this._element.addEventListener('blur', this._boundHandlers.blur);
        this._element.addEventListener('keydown', this._boundHandlers.keyDown);
    };

    /**
     * getElement — gets the input DOM element.
     * @returns {HTMLInputElement}
     */
    Donkeycraft.GuiTextInput.prototype.getElement = function () {
        return this._element;
    };

    /**
     * getValue — gets the current input value.
     * @returns {string}
     */
    Donkeycraft.GuiTextInput.prototype.getValue = function () {
        return this._element ? this._element.value : '';
    };

    /**
     * setValue — sets the input value programmatically and fires input events.
     * @param {string} value - New value.
     */
    Donkeycraft.GuiTextInput.prototype.setValue = function (value) {
        var newValue = value || '';
        if (this._element && this._element.value !== newValue) {
            this._element.value = newValue;
            // Fire input listeners to notify the UI layer of the programmatic change
            if (this._listeners.input) {
                for (var i = 0; i < this._listeners.input.length; i++) {
                    try { this._listeners.input[i](newValue); } catch (ex) { }
                }
            }
        }
    };

    /**
     * getMaxLength — gets the maximum allowed input length.
     * @returns {number}
     */
    Donkeycraft.GuiTextInput.prototype.getMaxLength = function () {
        return this._maxLength;
    };

    /**
     * setMaxLength — sets the maximum allowed input length.
     * @param {number} max - Maximum length (minimum 1).
     */
    Donkeycraft.GuiTextInput.prototype.setMaxLength = function (max) {
        this._maxLength = (max !== undefined && max !== null) ? Math.max(1, max) : 100;
        if (this._element) {
            this._element.maxLength = this._maxLength;
        }
    };

    /**
     * setError — sets or clears the error state.
     * @param {boolean} error - Whether to show error state.
     * @param {string} [message=''] - Optional error message (not used in DOM, passed to listeners).
     */
    Donkeycraft.GuiTextInput.prototype.setError = function (error, message) {
        this._error = !!error;
        if (this._element) {
            this._element.classList.toggle('error', this._error);
        }
        if (this._listeners.error) {
            for (var i = 0; i < this._listeners.error.length; i++) {
                try { this._listeners.error[i](this._error, message || ''); } catch (ex) { }
            }
        }
    };

    /**
     * isErrored — checks if the input is in error state.
     * @returns {boolean}
     */
    Donkeycraft.GuiTextInput.prototype.isErrored = function () {
        return this._error;
    };

    /**
     * focus — focuses the input element.
     */
    Donkeycraft.GuiTextInput.prototype.focus = function () {
        if (this._element) {
            try { this._element.focus(); } catch (ex) { }
        }
    };

    /**
     * blur — removes focus from the input element.
     */
    Donkeycraft.GuiTextInput.prototype.blur = function () {
        if (this._element) {
            try { this._element.blur(); } catch (ex) { }
        }
    };

    /**
     * setVisible — shows or hides the input.
     * @param {boolean} visible - Whether to show the input.
     */
    Donkeycraft.GuiTextInput.prototype.setVisible = function (visible) {
        if (this._element) {
            this._element.style.display = visible ? '' : 'none';
        }
    };

    /**
     * isVisible — checks if the input is visible.
     * @returns {boolean}
     */
    Donkeycraft.GuiTextInput.prototype.isVisible = function () {
        return this._element && this._element.style.display !== 'none';
    };

    /**
     * onInput — subscribes to input events.
     * @param {Function} callback - Called with (value) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiTextInput.prototype.onInput = function (callback) {
        if (!this._listeners.input) this._listeners.input = [];
        this._listeners.input.push(callback);

        var self = this;
        return function () {
            var idx = self._listeners.input.indexOf(callback);
            if (idx >= 0) self._listeners.input.splice(idx, 1);
        };
    };

    /**
     * onBlur — subscribes to blur events.
     * @param {Function} callback - Called with (value) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiTextInput.prototype.onBlur = function (callback) {
        if (!this._listeners.blur) this._listeners.blur = [];
        this._listeners.blur.push(callback);

        var self = this;
        return function () {
            var idx = self._listeners.blur.indexOf(callback);
            if (idx >= 0) self._listeners.blur.splice(idx, 1);
        };
    };

    /**
     * onKeyDown — subscribes to keydown events.
     * @param {Function} callback - Called with (event, value) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.GuiTextInput.prototype.onKeyDown = function (callback) {
        if (!this._listeners.keydown) this._listeners.keydown = [];
        this._listeners.keydown.push(callback);

        var self = this;
        return function () {
            var idx = self._listeners.keydown.indexOf(callback);
            if (idx >= 0) self._listeners.keydown.splice(idx, 1);
        };
    };

    /**
     * destroy — removes the input from DOM and cleans up event listeners.
     */
    Donkeycraft.GuiTextInput.prototype.destroy = function () {
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._listeners = {};
        this._boundHandlers = {};
    };

})();