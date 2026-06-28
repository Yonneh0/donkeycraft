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

        // Tab definitions — ordered display order
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

        // Currently selected item ID (for keyboard navigation)
        this._selectedItemId = null;

        // Event subscriptions tracking
        this._subscriptions = [];

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
        // Building blocks: stone family, wood, glass, concrete, etc.
        this._tabItems['building'] = [
            1, 3, 4, 5, 6, 7, 12, 24, 30, 35, 36, 43, 44, 45, 52, 53, 54, 55, 56, 57,
            58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76,
            77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
            101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115,
            116, 117, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139,
            141, 142, 151, 152, 153, 154, 155, 233, 234, 235, 236, 280, 281
        ];

        // Decoration: plants, flowers, banners, carpets, glass panes, etc.
        this._tabItems['decoration'] = [
            23, 25, 26, 27, 28, 34, 37, 38, 39, 40, 41, 42, 46, 47, 48, 49, 50, 51,
            73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
            91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 118, 119, 120,
            121, 122, 123, 124, 125, 126, 143, 144, 145, 146, 147, 156, 157, 158, 159,
            160, 161, 162, 163, 164, 165, 166, 168, 169, 170, 171, 172, 239, 240, 258,
            259, 274, 278, 279, 284
        ];

        // Redstone: dust, torches, repeaters, comparators, observers, pistons, TNT
        this._tabItems['redstone'] = [
            173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186,
            230, 231, 232
        ];

        // Food: all food items (wheat, bread, apples, meats, etc.)
        this._tabItems['food'] = [
            245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258,
            259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272,
            273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286,
            287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300,
            301, 302, 303, 304, 305, 306, 307, 308, 309
        ];

        // Materials: ingots, ores, gems, raw materials, dyes
        this._tabItems['materials'] = [
            214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227,
            228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240
        ];

        // Tools & equipment: weapons, armor, tools, utility items
        this._tabItems['tools'] = [
            310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323,
            324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337,
            338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351,
            352, 353, 354, 355, 356, 357, 358, 359, 360
        ];
    };

    /**
     * _buildDOM — creates the creative inventory DOM structure.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._buildDOM = function() {
        var self = this;
        if (!this._container) return;

        this._container.className = 'dk-creative-inventory';
        this._container.style.cssText = 'display: flex; width: 100%; height: 100%; background: rgba(20,20,30,0.95); border-radius: 6px; overflow: hidden;';

        // Left panel: tabs + search
        var leftPanel = document.createElement('div');
        leftPanel.className = 'dk-creative-left-panel';
        leftPanel.style.cssText = 'width: 180px; background: rgba(40,40,50,0.9); border-right: 2px solid #333; display: flex; flex-direction: column;';

        // Tab bar
        this._tabBarEl = document.createElement('div');
        this._tabBarEl.className = 'dk-creative-tab-bar';
        this._tabBarEl.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';

        for (var t = 0; t < this._tabs.length; t++) {
            var tabBtn = document.createElement('div');
            tabBtn.className = 'dk-inv-tab' + (this._tabs[t] === this._currentTab ? ' active' : '');
            tabBtn.style.cssText = 'padding: 8px 12px; margin: 2px 0; cursor: pointer; border-radius: 3px; color: #ccc; font-size: 13px; text-align: center; user-select: none;';
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

        // Search bar container
        var searchContainer = document.createElement('div');
        searchContainer.className = 'dk-creative-search-container';
        searchContainer.style.cssText = 'padding: 8px; border-top: 1px solid #333;';

        this._searchEl = document.createElement('input');
        this._searchEl.type = 'text';
        this._searchEl.className = 'dk-creative-search-input';
        this._searchEl.placeholder = 'Search items...';
        this._searchEl.style.cssText = 'width: 100%; padding: 6px 8px; background: #222; border: 1px solid #555; color: #ccc; border-radius: 3px; font-size: 12px; box-sizing: border-box; outline: none;';

        this._searchEl.addEventListener('input', (function() {
            return function() { self._onSearchChange(); };
        })());

        searchContainer.appendChild(this._searchEl);
        leftPanel.appendChild(this._tabBarEl);
        leftPanel.appendChild(searchContainer);

        // Right panel: item grid
        this._gridEl = document.createElement('div');
        this._gridEl.className = 'dk-creative-item-grid';
        this._gridEl.style.cssText = 'flex: 1; padding: 16px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; align-content: start;';

        this._container.appendChild(leftPanel);
        this._container.appendChild(this._gridEl);

        // Initial render
        this._renderGrid();
    };

    /**
     * _getItemName — gets the display name for a block ID from BlockRegistry.
     * @param {number} itemId - Block/item ID.
     * @returns {string} Block name, or 'item_' + id if not found.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._getItemName = function(itemId) {
        if (typeof itemId !== 'number' || isNaN(itemId)) {
            return 'item_' + itemId;
        }

        try {
            if (Donkeycraft.BlockRegistry && typeof Donkeycraft.BlockRegistry.getBlockById === 'function') {
                var block = Donkeycraft.BlockRegistry.getBlockById(itemId);
                if (block && block.name) {
                    return block.name;
                }
            }
        } catch (e) {
            // BlockRegistry unavailable — fall through to default
        }

        return 'item_' + itemId;
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
            var itemId = items[i];
            var itemEl = document.createElement('div');
            itemEl.className = 'dk-creative-item';
            itemEl.setAttribute('role', 'button');
            itemEl.setAttribute('tabindex', '0');
            itemEl.setAttribute('aria-label', this._getItemName(itemId) + ' (ID: ' + itemId + ')');
            itemEl.style.cssText = 'width: 40px; height: 40px; background: rgba(80,80,80,0.6); border: 1px solid #555; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; transition: background 0.1s;';

            // Use Unicode block characters for visual variety based on ID
            itemEl.textContent = this._getItemDisplayChar(itemId);
            itemEl.dataset.itemId = itemId;

            if (this._selectedItemId === itemId) {
                itemEl.style.borderColor = '#6af';
                itemEl.style.background = 'rgba(80,120,200,0.3)';
            }

            var self = this;
            itemEl.addEventListener('click', (function(id) {
                return function() { self._onItemClick(id); };
            })(itemId));

            // Keyboard support: Enter/Space to select
            itemEl.addEventListener('keydown', (function(id, el) {
                return function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        self._onItemClick(id);
                    }
                };
            })(itemId, itemEl));

            // Hover effects
            itemEl.addEventListener('mouseenter', function() {
                this.style.background = 'rgba(100,100,120,0.8)';
            });
            itemEl.addEventListener('mouseleave', function() {
                if (this.dataset.itemId !== String(self._selectedItemId)) {
                    this.style.background = 'rgba(80,80,80,0.6)';
                }
            });

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

        // Filter by search query if present — delegate to searchItems for cross-tab matching
        if (this._searchQuery && this._searchQuery.length > 0) {
            try {
                var results = this.searchItems(this._searchQuery);
                return results;
            } catch (e) {
                if (Donkeycraft.Logger) {
                    Donkeycraft.Logger.warn('CreativeInventory: searchItems failed: ' + e.message);
                }
                return items; // Fallback to unfiltered tab items
            }
        }

        return items;
    };

    /**
     * _onSearchChange — handles search input changes.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._onSearchChange = function() {
        this._searchQuery = (this._searchEl.value || '').toLowerCase().trim();
        this._selectedItemId = null; // Clear selection on search change
        this._renderGrid();
    };

    /**
     * _onItemClick — handles clicking an item in the grid.
     * @param {number} itemId - The clicked item's ID.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._onItemClick = function(itemId) {
        this._selectedItemId = itemId;
        this._renderGrid(); // Re-render to update selection highlight

        if (this._subscriptions.onItemSelected) {
            for (var i = 0; i < this._subscriptions.onItemSelected.length; i++) {
                try { this._subscriptions.onItemSelected[i](itemId); } catch (e) {}
            }
        }
    };

    /**
     * _getItemDisplayChar — gets a display character for an item ID.
     * Uses Unicode geometric shapes and block characters for visual variety.
     * @param {number} itemId - Block/item ID.
     * @returns {string} Display character.
     * @private
     */
    Donkeycraft.CreativeInventory.prototype._getItemDisplayChar = function(itemId) {
        if (typeof itemId !== 'number' || isNaN(itemId) || itemId <= 0) {
            return '\u25A0'; // BLACK SQUARE for invalid/empty
        }

        // Primary emoji display map for key items
        var displayMap = {
            1: '\u2B1B',     // ⬛ stone (black square)
            3: '\u25AB',     // ▫ white small square
            4: '\u25A0',     // ■ black square
            5: '\u25AD',     // ▭ white rectangle
            6: '\u25A1',     // □ white square
            7: '\u25AA',     // ▪ black small square
            24: '\u25AE',    // ▮ black right rectangle
            30: '\u25AF',    // ▯ white vertical rectangle
            45: '\u25A1',    // □ glass
            54: '\u2303',    // ⌃ up arrow (chest approximation)
            61: '\u2603',    // ☃ snowman (fire approximation)
            138: '\u2B1C',   // ⬜ white square
            184: '\u2551',   // ║ bookshelf approximation
            187: '\u2303',   // ⌃ trapped chest
            191: '\u26A1',   // ⚡ furnace (lightning)
            195: '\u25FF',   // ╿ crafting table
            214: '\u25CF',   // ● black circle (coal)
            218: '\u25C7',   // ◇ white diamond (diamond)
            219: '\u25A3',   // ▣ green square (emerald)
            220: '\u25CB',   // ○ white circle (lapis)
            221: '\u25EF',   // ◯ large circle (iron)
            222: '\u2B50',   // ⭐ star (gold)
            225: '\u25FC',   // ◼ black medium square
            226: '\u25FB',   // ◻ white medium square
            227: '\u25FE',   // ◾ black medium small square
            228: '\u25FD',   // ◽ white medium small square
            310: '\u2717',   // ✗ sticks (cross)
            312: '\u26A1'    // ⚡ torch (lightning bolt)
        };

        if (displayMap[itemId]) {
            return displayMap[itemId];
        }

        // Generate a consistent character based on item ID for visual variety
        // Uses a cycling set of Unicode shapes
        var shapes = [
            '\u25A0', '\u25A1', '\u25AA', '\u25AB', '\u25AD', '\u25AE',
            '\u25AF', '\u25B0', '\u25B1', '\u25BC', '\u25BD', '\u25BE',
            '\u25BF', '\u25C0', '\u25C1', '\u25C2', '\u25C3', '\u25C4',
            '\u25C5', '\u25C6', '\u25C7', '\u25C8', '\u25C9', '\u25CA',
            '\u25CB', '\u25CC', '\u25CD', '\u25CE', '\u25CF', '\u25D0',
            '\u25D1', '\u25D2', '\u25D3', '\u25D4', '\u25D5', '\u25D6',
            '\u25D7', '\u25D8', '\u25D9', '\u25DA', '\u25DB', '\u25DC',
            '\u25DD', '\u25DE', '\u25DF', '\u25E0', '\u25E1', '\u25E2'
        ];

        return shapes[itemId % shapes.length];
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
        // Validate tab name
        if (this._tabs.indexOf(tabName) === -1) return;

        if (this._currentTab === tabName) return;

        var oldTab = this._currentTab;
        this._currentTab = tabName;
        this._selectedItemId = null; // Clear selection on tab change

        // Update tab button styles — use dataset.tabName for reliable identification
        if (this._tabBarEl) {
            var btns = this._tabBarEl.querySelectorAll('.dk-inv-tab');
            for (var i = 0; i < btns.length; i++) {
                var btn = btns[i];
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
        if (this._subscriptions.onTabChange) {
            for (var j = 0; j < this._subscriptions.onTabChange.length; j++) {
                try { this._subscriptions.onTabChange[j](tabName, oldTab); } catch (e) {}
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
     * ID matching is exact-only to prevent false positives (e.g., "1" won't match ID 10).
     * @param {string|number} query - Search query string or numeric ID.
     * @returns {number[]} Array of matching item IDs.
     */
    Donkeycraft.CreativeInventory.prototype.searchItems = function(query) {
        // Validate and normalize input
        if (query === null || query === undefined) {
            return this._tabItems[this._currentTab] ? this._tabItems[this._currentTab].slice() : [];
        }

        var queryStr = String(query).toLowerCase().trim();
        if (!queryStr) {
            // Empty query returns all items from current tab
            return this._tabItems[this._currentTab] ? this._tabItems[this._currentTab].slice() : [];
        }

        var matchingIds = [];
        var seen = {};

        // Build a name->ID lookup from block.js if available
        var nameLookup = null;
        try {
            if (Donkeycraft.BlockRegistry && typeof Donkeycraft.BlockRegistry.getAllBlocks === 'function') {
                var allBlocks = Donkeycraft.BlockRegistry.getAllBlocks();
                if (allBlocks && Array.isArray(allBlocks)) {
                    nameLookup = {};
                    for (var bi = 0; bi < allBlocks.length; bi++) {
                        var block = allBlocks[bi];
                        if (block && block.id !== undefined && block.name) {
                            nameLookup[block.id] = block.name;
                        }
                    }
                }
            }
        } catch (e) {
            // BlockRegistry unavailable — will only match by ID
        }

        // Search across ALL tabs for cross-tab matching
        for (var tab in this._tabItems) {
            if (this._tabItems.hasOwnProperty(tab)) {
                var items = this._tabItems[tab];
                if (!Array.isArray(items)) continue;

                for (var i = 0; i < items.length; i++) {
                    var id = items[i];
                    if (seen[id]) continue;

                    // Try exact ID match first (prevents "1" matching IDs 10, 11, etc.)
                    if (String(id) === queryStr) {
                        matchingIds.push(id);
                        seen[id] = true;
                        continue;
                    }

                    // Try partial name matching against block names from block.js
                    var name = null;
                    if (nameLookup && nameLookup.hasOwnProperty(id)) {
                        name = nameLookup[id];
                    }
                    if (name && name.toLowerCase().indexOf(queryStr) !== -1) {
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
        if (typeof index !== 'number' || isNaN(index) || index < 0 || index >= items.length) {
            return 0;
        }
        return items[index];
    };

    /**
     * getGridSize — gets the dimensions of the item grid.
     * @returns {Object} { rows, cols } dimensions.
     */
    Donkeycraft.CreativeInventory.prototype.getGridSize = function() {
        var count = (this._tabItems[this._currentTab] || []).length;

        // Calculate columns based on container width if available
        var cols = 10;
        if (this._gridEl && this._gridEl.parentElement) {
            var parentWidth = this._gridEl.parentElement.clientWidth || 600;
            // Each item is 44px (40px + 4px gap)
            cols = Math.max(3, Math.floor(parentWidth / 44));
        }

        var rows = Math.ceil(count / cols);
        return { rows: rows, cols: cols };
    };

    /**
     * getItemCount — gets the number of visible items in the current view.
     * @returns {number} Number of items displayed (after search filtering).
     */
    Donkeycraft.CreativeInventory.prototype.getItemCount = function() {
        return this._getFilteredItems().length;
    };

    /**
     * getSelectedItem — gets the currently selected item ID.
     * @returns {number|null} The selected item ID, or null if none selected.
     */
    Donkeycraft.CreativeInventory.prototype.getSelectedItem = function() {
        return this._selectedItemId;
    };

    /**
     * setSelectedItem — sets the selected item (for keyboard navigation).
     * @param {number} itemId - Item ID to select.
     */
    Donkeycraft.CreativeInventory.prototype.setSelectedItem = function(itemId) {
        if (this._selectedItemId === itemId) return;
        this._selectedItemId = itemId;

        // Update visual highlight if grid is rendered
        if (this._gridEl) {
            var itemEls = this._gridEl.querySelectorAll('.dk-creative-item');
            for (var i = 0; i < itemEls.length; i++) {
                var el = itemEls[i];
                if (el.dataset.itemId === String(itemId)) {
                    el.style.borderColor = '#6af';
                    el.style.background = 'rgba(80,120,200,0.3)';
                } else {
                    el.style.borderColor = '#555';
                    el.style.background = 'rgba(80,80,80,0.6)';
                }
            }
        }
    };

    /**
     * onItemSelected — subscribes to item selection events.
     * @param {Function} callback - Called with (itemId) argument.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.CreativeInventory.prototype.onItemSelected = function(callback) {
        if (!this._subscriptions.onItemSelected) {
            this._subscriptions.onItemSelected = [];
        }
        this._subscriptions.onItemSelected.push(callback);

        var self = this;
        return function() {
            var idx = self._subscriptions.onItemSelected.indexOf(callback);
            if (idx >= 0) self._subscriptions.onItemSelected.splice(idx, 1);
        };
    };

    /**
     * onTabChange — subscribes to tab change events.
     * @param {Function} callback - Called with (newTab, oldTab) arguments.
     * @returns {Function} Unsubscribe function.
     */
    Donkeycraft.CreativeInventory.prototype.onTabChange = function(callback) {
        if (!this._subscriptions.onTabChange) {
            this._subscriptions.onTabChange = [];
        }
        this._subscriptions.onTabChange.push(callback);

        var self = this;
        return function() {
            var idx = self._subscriptions.onTabChange.indexOf(callback);
            if (idx >= 0) self._subscriptions.onTabChange.splice(idx, 1);
        };
    };

    /**
     * destroy — cleans up resources.
     */
    Donkeycraft.CreativeInventory.prototype.destroy = function() {
        // Clear container DOM
        if (this._container) {
            while (this._container.firstChild) {
                this._container.removeChild(this._container.firstChild);
            }
            this._container = null;
        }

        // Null out element references
        this._tabBarEl = null;
        this._gridEl = null;
        this._searchEl = null;

        // Clear all subscriptions
        this._subscriptions = {};
    };

})();