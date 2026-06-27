// Donkeycraft — Creative Inventory
// Creative inventory GUI with tab navigation, item search, and grid display.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * CreativeInventory — manages the creative mode inventory GUI.
     * @param {HTMLElement} container - DOM container for the creative inventory.
     */
    Donkeycraft.CreativeInventory = function(container) {
        this._container = container || null;

        // Tab definitions
        this._tabs = [
            'building',
            'decoration',
            'redstone',
            'food',
            'materials',
            'tools'
        ];
        this._currentTab = this._tabs[0];

        // Item lists per tab (block IDs)
        this._tabItems = {};
        this._buildItemLists();

        // Search query
        this._searchQuery = '';

        // Listeners
        this._listeners = {
            onItemSelected: [],
            onTabChange: []
        };

        // DOM elements
        this._tabBarEl = null;
        this._gridEl = null;
        this._searchEl = null;

        // Build DOM if container provided
        if (this._container) {
            this._buildDOM();
        }
    };

    /**
     * _buildItemLists — populates the tab-to-item-ID mapping.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._buildItemLists = function() {
        // Building blocks
        this._tabItems['building'] = [1, 3, 4, 5, 6, 7, 12, 24, 30, 35, 36, 43, 44, 45, 52, 53, 73, 77, 78, 79, 80, 81, 82, 87, 88, 89, 90, 91, 92, 93, 94, 95, 109, 112, 113, 114, 119, 120, 126, 127, 128, 129, 132, 133, 134, 135, 136, 137, 138, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170];

        // Decoration
        this._tabItems['decoration'] = [23, 25, 26, 27, 28, 34, 37, 38, 39, 40, 41, 42, 46, 47, 48, 49, 50, 51, 54, 55, 56, 57, 58, 59, 60, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 74, 75, 76, 83, 84, 85, 86, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 115, 116, 117, 118, 121, 122, 123, 124, 125, 130, 131, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152];

        // Redstone
        this._tabItems['redstone'] = [141, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194];

        // Food
        this._tabItems['food'] = [245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309];

        // Materials
        this._tabItems['materials'] = [214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244];

        // Tools
        this._tabItems['tools'] = [310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360];
    };

    /**
     * _buildDOM — creates the creative inventory DOM structure.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._buildDOM = function() {
        var self = this;
        this._container.className = 'dk-creative-inventory';
        this._container.style.cssText = 'display: flex; width: 100%; height: 100%; background: rgba(20,20,30,0.95); border-radius: 6px; overflow: hidden;';

        // Left panel: tabs + search
        var leftPanel = document.createElement('div');
        leftPanel.style.cssText = 'width: 180px; background: rgba(40,40,50,0.9); border-right: 2px solid #333; display: flex; flex-direction: column;';

        // Tab bar
        this._tabBarEl = document.createElement('div');
        this._tabBarEl.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';

        for (var t = 0; t < this._tabs.length; t++) {
            var tabBtn = document.createElement('div');
            tabBtn.className = 'dk-inv-tab' + (this._tabs[t] === this._currentTab ? ' active' : '');
            tabBtn.style.cssText = 'padding: 8px 12px; margin: 2px 0; cursor: pointer; border-radius: 3px; color: #ccc; font-size: 13px; text-align: center;';
            tabBtn.textContent = this._tabs[t].charAt(0).toUpperCase() + this._tabs[t].slice(1);

            if (this._tabs[t] === this._currentTab) {
                tabBtn.style.background = 'rgba(80,120,200,0.5)';
                tabBtn.style.color = '#fff';
            }

            // Store tab name in dataset for reliable identification
            tabBtn.dataset.tabName = this._tabs[t];

            tabBtn.addEventListener('click', (function(tabName) {
                return function() { self.selectTab(tabName); };
            })(this._tabs[t]));

            this._tabBarEl.appendChild(tabBtn);
        }

        // Search bar
        var searchContainer = document.createElement('div');
        searchContainer.style.cssText = 'padding: 8px; border-top: 1px solid #333;';

        this._searchEl = document.createElement('input');
        this._searchEl.type = 'text';
        this._searchEl.placeholder = 'Search items...';
        this._searchEl.style.cssText = 'width: 100%; padding: 6px 8px; background: #222; border: 1px solid #555; color: #ccc; border-radius: 3px; font-size: 12px; box-sizing: border-box;';

        this._searchEl.addEventListener('input', (function() {
            return function() { self._onSearchChange(); };
        })());

        searchContainer.appendChild(this._searchEl);
        leftPanel.appendChild(this._tabBarEl);
        leftPanel.appendChild(searchContainer);

        // Right panel: item grid
        this._gridEl = document.createElement('div');
        this._gridEl.style.cssText = 'flex: 1; padding: 16px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; align-content: start;';

        this._container.appendChild(leftPanel);
        this._container.appendChild(this._gridEl);

        // Initial render
        this._renderGrid();
    };

    /**
     * _renderGrid — renders the item grid for the current tab.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._renderGrid = function() {
        if (!this._gridEl) return;

        var items = this._getFilteredItems();
        this._gridEl.innerHTML = '';

        for (var i = 0; i < items.length; i++) {
            var itemEl = document.createElement('div');
            itemEl.className = 'dk-creative-item';
            itemEl.style.cssText = 'width: 40px; height: 40px; background: rgba(80,80,80,0.6); border: 1px solid #555; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer;';
            itemEl.textContent = this._getItemDisplayChar(items[i]);
            itemEl.dataset.itemId = items[i];

            var self = this;
            itemEl.addEventListener('click', (function(id) {
                return function() { self._onItemClick(id); };
            })(items[i]));

            this._gridEl.appendChild(itemEl);
        }
    };

    /**
     * _getFilteredItems — gets the list of item IDs for the current tab, filtered by search.
     * @returns {number[]} Array of block/item IDs.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._getFilteredItems = function() {
        var items = this._tabItems[this._currentTab] || [];

        // Filter by search query if present
        if (this._searchQuery && this._searchQuery.length > 0) {
            // In the full game, this would match against item names
            // For now, return all items (Phase 19+ will add name matching)
            return items;
        }

        return items;
    };

    /**
     * _onSearchChange — handles search input changes.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._onSearchChange = function() {
        this._searchQuery = (this._searchEl.value || '').toLowerCase().trim();
        this._renderGrid();
    };

    /**
     * _onItemClick — handles clicking an item in the grid.
     * @param {number} itemId - The clicked item's ID.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._onItemClick = function(itemId) {
        if (this._listeners.onItemSelected) {
            for (var i = 0; i < this._listeners.onItemSelected.length; i++) {
                try { this._listeners.onItemSelected[i](itemId); } catch (e) {}
            }
        }
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * @param {number} itemId - Block/item ID.
     * @returns {string}
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._getItemDisplayChar = function(itemId) {
        var displayMap = {
            1: '🪨', 3: '🟫', 4: '🟩', 5: '🪵', 6: '🟨', 7: '🟫',
            24: '🪵', 30: '🟨', 45: '🔲', 54: '📦', 61: '🔥',
            138: '🪨', 184: '📚', 187: '📦', 191: '🔥', 195: '🔨',
            214: '⚫', 218: '💎', 219: '🟢', 220: '🔵', 221: '⚪',
            222: '🟡', 225: '🟡', 226: '⚪', 227: '💎',
            310: '🥢', 312: '🔦'
        };
        return displayMap[itemId] || '▪';
    };

    /**
     * getTabs — gets the available tab names.
     * @returns {string[]} Array of tab name strings.
     */
    Donkeycraft.CreativeInventory.prototype.getTabs = function() {
        return this._tabs.slice();
    };

    /**
     * selectTab — switches to a different tab.
     * @param {string} tabName - Tab name to switch to.
     */
    Donkeycraft.CreativeInventory.prototype.selectTab = function(tabName) {
        if (this._currentTab === tabName) return;

        var oldTab = this._currentTab;
        this._currentTab = tabName;

        // Update tab button styles
        if (this._tabBarEl) {
            var btns = this._tabBarEl.querySelectorAll('.dk-inv-tab');
            for (var i = 0; i < btns.length; i++) {
                var btn = btns[i];
                // Use dataset.tabName for reliable identification instead of textContent
                if (btn.dataset.tabName === tabName) {
                    btn.style.background = 'rgba(80,120,200,0.5)';
                    btn.style.color = '#fff';
                    btn.className = 'dk-inv-tab active';
                } else {
                    btn.style.background = '';
                    btn.style.color = '#ccc';
                    btn.className = 'dk-inv-tab';
                }
            }
        }

        // Re-render grid
        this._renderGrid();

        // Emit tab change event
        if (this._listeners.onTabChange) {
            for (var j = 0; j < this._listeners.onTabChange.length; j++) {
                try { this._listeners.onTabChange[j](tabName, oldTab); } catch (e) {}
            }
        }
    };

    /**
     * getCurrentTab — gets the current tab name.
     * @returns {string}
     */
    Donkeycraft.CreativeInventory.prototype.getCurrentTab = function() {
        return this._currentTab;
    };

    /**
     * searchItems — searches for items across all tabs by name or ID.
     * Uses block.js definitions for name matching when available.
     * @param {string} query - Search query string.
     * @returns {number[]} Array of matching item IDs.
     */
    Donkeycraft.CreativeInventory.prototype.searchItems = function(query) {
        var queryLower = (query || '').toLowerCase().trim();
        if (!queryLower) {
            // Empty query returns all items from current tab
            return this._tabItems[this._currentTab] ? this._tabItems[this._currentTab].slice() : [];
        }

        var matchingIds = [];
        var seen = {};

        // Build a name->ID lookup from block.js if available
        var nameLookup = null;
        if (Donkeycraft.BlockRegistry && typeof Donkeycraft.BlockRegistry.getAllBlocks === 'function') {
            nameLookup = {};
            try {
                var allBlocks = Donkeycraft.BlockRegistry.getAllBlocks();
                for (var bi = 0; bi < allBlocks.length; bi++) {
                    var block = allBlocks[bi];
                    if (block && block.id !== undefined && block.name) {
                        nameLookup[block.id] = block.name;
                    }
                }
            } catch (e) {}
        }

        for (var tab in this._tabItems) {
            if (this._tabItems.hasOwnProperty(tab)) {
                var items = this._tabItems[tab];
                for (var i = 0; i < items.length; i++) {
                    var id = items[i];
                    if (seen[id]) continue;

                    // Try matching by ID first
                    if (String(id).indexOf(queryLower) !== -1 || String(id) === queryLower) {
                        matchingIds.push(id);
                        seen[id] = true;
                        continue;
                    }

                    // Try matching against block names from block.js
                    var name = null;
                    if (nameLookup && nameLookup.hasOwnProperty(id)) {
                        name = nameLookup[id];
                    }
                    if (name && name.toLowerCase().indexOf(queryLower) !== -1) {
                        matchingIds.push(id);
                        seen[id] = true;
                    }
                }
            }
        }

        return matchingIds;
    };

    /**
     * getItemByIndex — gets the item at a specific index in the current tab's grid.
     * @param {number} index - Grid index within the current tab.
     * @returns {number} Block/item ID, or 0 if out of bounds.
     */
    Donkeycraft.CreativeInventory.prototype.getItemByIndex = function(index) {
        var items = this._tabItems[this._currentTab] || [];
        if (index < 0 || index >= items.length) return 0;
        return items[index];
    };

    /**
     * getGridSize — gets the dimensions of the item grid.
     * @returns {Object} { rows, cols } dimensions.
     */
    Donkeycraft.CreativeInventory.prototype.getGridSize = function() {
        var count = (this._tabItems[this._currentTab] || []).length;
        // Grid columns based on container width (approximate)
        var cols = 10;
        var rows = Math.ceil(count / cols);
        return { rows: rows, cols: cols };
    };

    /**
     * onItemSelected — subscribes to item selection events.
     * @param {Function} callback - Called with (itemId) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.CreativeInventory.prototype.onItemSelected = function(callback) {
        this._listeners.onItemSelected.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onItemSelected.indexOf(callback);
            if (idx >= 0) self._listeners.onItemSelected.splice(idx, 1);
        };
    };

    /**
     * onTabChange — subscribes to tab change events.
     * @param {Function} callback - Called with (newTab, oldTab) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.CreativeInventory.prototype.onTabChange = function(callback) {
        this._listeners.onTabChange.push(callback);
        var self = this;
        return function() {
            var idx = self._listeners.onTabChange.indexOf(callback);
            if (idx >= 0) self._listeners.onTabChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.CreativeInventory.prototype.destroy = function() {
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
        }
        this._listeners = null;
    };

})();