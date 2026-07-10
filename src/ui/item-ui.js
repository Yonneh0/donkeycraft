// Donkeycraft — Item UI Components
// Universal item icon, selection, splitting UI, stack count, condition meter.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  // ============================================================
  // ItemUI — universal item rendering and interaction utilities
  // ============================================================

  /**
   * ItemUI — static class with item UI rendering and interaction helpers.
   * @namespace
   */
  Donkeycraft.ItemUI = (function () {
    var _dragState = null; // Current drag state for split operations

    // Rarity colors for tooltip/item border
    var RARITY_COLORS = [
      '#FFFFFF', // 0: Common
      '#55FF55', // 1: Uncommon
      '#55FFFF', // 2: Rare
      '#FF55FF', // 3: Epic
      '#FFAA00'  // 4: Legendary
    ];

    /**
     * renderIcon — renders an item icon into a container element.
     * @param {HTMLElement} container - Target container element.
     * @param {Donkeycraft.ItemStack} stack - Item stack to render.
     * @param {Object} [options={}] - Render options.
     * @param {boolean} [options.showCount=true] - Show stack count.
     * @param {boolean} [options.showCondition=true] - Show condition meter.
     * @param {boolean} [options.selected=false] - Highlight as selected.
     */
    function renderIcon(container, stack, options) {
      if (!container || !stack || stack.isEmpty()) {
        container.innerHTML = '';
        return;
      }

      options = options || {};
      var showCount = options.showCount !== false;
      var showCondition = options.showCondition !== false;
      var selected = options.selected || false;

      // Clear container
      container.innerHTML = '';

      // Get item definition for display info
      var itemDef = Donkeycraft.ItemDefinitionRegistry.get(stack.getItemId());
      if (!itemDef) return;

      // Create icon wrapper
      var iconEl = document.createElement('div');
      iconEl.className = 'dk-item-icon';
      if (selected) iconEl.classList.add('dk-item-selected');

      // Item display character/emoji
      var displayChar = getDisplayCharacter(itemDef);
      var charEl = document.createElement('span');
      charEl.className = 'dk-item-char';
      charEl.textContent = displayChar;
      iconEl.appendChild(charEl);

      // Stack count badge
      if (showCount && stack.getCount() > 1) {
        var countEl = document.createElement('span');
        countEl.className = 'dk-item-count';
        countEl.textContent = stack.getCount();
        iconEl.appendChild(countEl);
      }

      // Condition meter (for durable items)
      if (showCondition && itemDef.isDurable()) {
        var conditionEl = document.createElement('div');
        conditionEl.className = 'dk-item-condition';

        var currentDur = stack.getDurability();
        var maxDur = itemDef.getMaxDurability();
        var fraction = 1.0 - (currentDur / maxDur); // 0 = new, 1 = broken
        var pct = Math.max(0, Math.min(100, fraction * 100));

        var fillEl = document.createElement('div');
        fillEl.className = 'dk-item-condition-fill';
        fillEl.style.width = pct + '%';

        // Color based on remaining durability
        var remainingPct = ((maxDur - currentDur) / maxDur) * 100;
        if (remainingPct > 50) fillEl.classList.add('dk-condition-good');
        else if (remainingPct > 25) fillEl.classList.add('dk-condition-worn');
        else fillEl.classList.add('dk-condition-broken');

        conditionEl.appendChild(fillEl);
        iconEl.appendChild(conditionEl);
      }

      // Selection overlay
      if (selected) {
        var selOverlay = document.createElement('div');
        selOverlay.className = 'dk-item-selected-overlay';
        iconEl.appendChild(selOverlay);
      }

      container.appendChild(iconEl);
    }

    /**
     * createSlotElement — creates a slot DOM element.
     * @param {number} index - Slot index.
     * @param {Object} [options={}] - Slot options.
     * @returns {HTMLElement}
     */
    function createSlotElement(index, options) {
      options = options || {};
      var slotEl = document.createElement('div');
      slotEl.className = 'dk-slot';
      slotEl.dataset.slot = index;

      // Slot number indicator (optional)
      if (options.showNumber) {
        var numEl = document.createElement('span');
        numEl.className = 'dk-slot-number';
        numEl.textContent = index + 1;
        slotEl.appendChild(numEl);
      }

      return slotEl;
    }

    /**
     * updateSlot — updates a slot element with an item stack.
     * @param {HTMLElement} slotEl - Slot element to update.
     * @param {Donkeycraft.ItemStack} stack - Item stack to display.
     * @param {Object} [options={}] - Render options.
     */
    function updateSlot(slotEl, stack, options) {
      if (!slotEl) return;

      // Remove old icon container if not present
      var iconContainer = slotEl.querySelector('.dk-item-icon-container');
      if (!iconContainer) {
        iconContainer = document.createElement('div');
        iconContainer.className = 'dk-item-icon-container';
        // Insert before number element if exists
        var numEl = slotEl.querySelector('.dk-slot-number');
        if (numEl) slotEl.insertBefore(iconContainer, numEl);
        else slotEl.appendChild(iconContainer);
      }

      renderIcon(iconContainer, stack, options);
    }

    /**
     * handleSplitDrag — initiates a split drag operation from a slot.
     * @param {HTMLElement} slotEl - Source slot element.
     * @param {Donkeycraft.ItemStack} stack - Stack to split.
     * @param {MouseEvent} event - Mouse event that triggered the drag.
     * @param {Function} onSplit - Callback when split is completed.
     * @param {Function} [onCancel=null] - Callback when drag is canceled.
     */
    function handleSplitDrag(slotEl, stack, event, onSplit, onCancel) {
      if (!stack || stack.isEmpty() || stack.getCount() <= 1) return;

      // Create ghost element for dragging
      var ghostEl = document.createElement('div');
      ghostEl.className = 'dk-item-drag-ghost';
      renderIcon(ghostEl, stack, { showCount: false, showCondition: false });
      ghostEl.style.left = event.clientX + 'px';
      ghostEl.style.top = event.clientY + 'px';
      document.body.appendChild(ghostEl);

      // Create drop target indicator
      var dropIndicator = document.createElement('div');
      dropIndicator.className = 'dk-item-drop-indicator';
      dropIndicator.style.display = 'none';
      document.body.appendChild(dropIndicator);

      _dragState = {
        sourceSlot: slotEl,
        sourceStack: stack,
        ghostEl: ghostEl,
        dropIndicator: dropIndicator,
        onSplit: onSplit,
        onCancel: onCancel || null,
        splitCount: Math.ceil(stack.getCount() / 2) // Default split: half
      };

      // Track mouse movement
      var onMouseMove = function (e) {
        ghostEl.style.left = (e.clientX - 16) + 'px';
        ghostEl.style.top = (e.clientY - 16) + 'px';

        // Find element under cursor for drop indicator
        dropIndicator.style.display = 'none';
        var target = document.elementFromPoint(e.clientX, e.clientY);
        if (target) {
          var targetSlot = target.closest('.dk-slot');
          if (targetSlot && targetSlot !== slotEl) {
            targetSlot.appendChild(dropIndicator);
            dropIndicator.style.display = '';
          }
        }
      };

      var onMouseUp = function (e) {
        // Remove event listeners
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Find drop target
        var targetSlot = null;
        var target = document.elementFromPoint(e.clientX, e.clientY);
        if (target) {
          targetSlot = target.closest('.dk-slot');
        }

        // Remove ghost and indicator
        if (ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl);
        if (dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);

        if (targetSlot && targetSlot !== slotEl) {
          // Perform split to target slot
          onSplit(slotEl.dataset.slot, targetSlot.dataset.slot, _dragState.splitCount);
        } else if (onCancel) {
          onCancel();
        }

        _dragState = null;
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * getDisplayCharacter — gets a display character for an item type.
     * @param {Donkeycraft.Item} itemDef - Item definition.
     * @returns {string} Display character/emoji.
     */
    function getDisplayCharacter(itemDef) {
      if (!itemDef) return '';
      var name = itemDef.name.toLowerCase();

      // Tools
      if (name.indexOf('pickaxe') >= 0) return '⛏️';
      if (name.indexOf('shovel') >= 0 || name.indexOf('spade') >= 0) return '🔧';
      if (name.indexOf('axe') >= 0) return '🪓';
      if (name.indexOf('hoe') >= 0) return '🌾';

      // Weapons
      if (name.indexOf('sword') >= 0) return '⚔️';

      // Armor
      if (name.indexOf('helmet') >= 0) return '⛑️';
      if (name.indexOf('chestplate') >= 0) return '🦺';
      if (name.indexOf('leggings') >= 0) return '👖';
      if (name.indexOf('boots') >= 0) return '👢';

      // Food
      if (name.indexOf('apple') >= 0) return '🍎';
      if (name.indexOf('bread') >= 0) return '🍞';
      if (name.indexOf('porkchop') >= 0) return '🥩';
      if (name.indexOf('beef') >= 0) return '🥩';
      if (name.indexOf('chicken') >= 0) return '🍗';
      if (name.indexOf('fish') >= 0) return '🐟';
      if (name.indexOf('potato') >= 0) return '🥔';
      if (name.indexOf('melon') >= 0) return '🍈';
      if (name.indexOf('carrot') >= 0) return '🥕';
      if (name.indexOf('cookie') >= 0) return '🍪';
      if (name.indexOf('berry') >= 0) return '🫐';
      if (name.indexOf('soup') >= 0 || name.indexOf('stew') >= 0) return '🍲';

      // Potions
      if (name.indexOf('potion') >= 0) return '🧪';

      // Materials
      if (name.indexOf('diamond') >= 0) return '💎';
      if (name.indexOf('emerald') >= 0) return '💚';
      if (name.indexOf('iron') >= 0) return '⬜';
      if (name.indexOf('gold') >= 0 && name.indexOf('ingot') >= 0) return '🟡';
      if (name.indexOf('netherite') >= 0) return '⬛';
      if (name.indexOf('coal') >= 0 || name.indexOf('charcoal') >= 0) return '⬛';
      if (name.indexOf('stick') >= 0) return '🥢';
      if (name.indexOf('flint') >= 0) return '🪨';
      if (name.indexOf('feather') >= 0) return '🪶';
      if (name.indexOf('leather') >= 0) return '🟫';
      if (name.indexOf('bone') >= 0) return '🦴';
      if (name.indexOf('string') >= 0) return '🧵';
      if (name.indexOf('paper') >= 0) return '📄';
      if (name.indexOf('pearl') >= 0) return '⚪';
      if (name.indexOf('eye') >= 0) return '👁️';
      if (name.indexOf('blaze') >= 0) return '🔥';
      if (name.indexOf('magma') >= 0) return '🟠';
      if (name.indexOf('ghast') >= 0) return '👻';
      if (name.indexOf('nugget') >= 0) return '🟡';
      if (name.indexOf('star') >= 0) return '⭐';

      // Blocks (generic)
      return '▪';
    }

    /**
     * getRarityColor — gets the color for an item rarity level.
     * @param {number} rarity - Rarity level (0-4).
     * @returns {string} Hex color code.
     */
    function getRarityColor(rarity) {
      return RARITY_COLORS[rarity] || RARITY_COLORS[0];
    }

    /**
     * createContextMenu — creates a right-click context menu for an item.
     * @param {Donkeycraft.ItemStack} stack - The item stack.
     * @param {number} x - X position.
     * @param {number} y - Y position.
     * @param {Object} actions - Available actions: { drop, split, use, repair }.
     */
    function createContextMenu(stack, x, y, actions) {
      // Remove existing menu
      removeContextMenu();

      var menuEl = document.createElement('div');
      menuEl.className = 'dk-item-context-menu';
      menuEl.id = 'dk-item-context-menu';

      // Drop action
      if (actions && actions.drop) {
        var dropBtn = document.createElement('button');
        dropBtn.className = 'dk-context-btn dk-context-drop';
        dropBtn.textContent = 'Drop';
        dropBtn.addEventListener('click', function () {
          actions.drop();
          removeContextMenu();
        });
        menuEl.appendChild(dropBtn);
      }

      // Split action
      if (actions && actions.split) {
        var splitBtn = document.createElement('button');
        splitBtn.className = 'dk-context-btn dk-context-split';
        splitBtn.textContent = 'Split';
        splitBtn.addEventListener('click', function () {
          actions.split();
          removeContextMenu();
        });
        menuEl.appendChild(splitBtn);
      }

      // Use action
      if (actions && actions.use) {
        var useBtn = document.createElement('button');
        useBtn.className = 'dk-context-btn dk-context-use';
        useBtn.textContent = 'Use';
        useBtn.addEventListener('click', function () {
          actions.use();
          removeContextMenu();
        });
        menuEl.appendChild(useBtn);
      }

      // Repair action
      if (actions && actions.repair) {
        var repairBtn = document.createElement('button');
        repairBtn.className = 'dk-context-btn dk-context-repair';
        repairBtn.textContent = 'Repair';
        repairBtn.addEventListener('click', function () {
          actions.repair();
          removeContextMenu();
        });
        menuEl.appendChild(repairBtn);
      }

      // Position and add to body
      menuEl.style.left = x + 'px';
      menuEl.style.top = y + 'px';
      document.body.appendChild(menuEl);

      // Close on outside click
      var onClose = function (e) {
        if (!menuEl.contains(e.target)) {
          removeContextMenu();
        }
      };
      setTimeout(function () {
        document.addEventListener('click', onClose, { once: true });
      }, 0);
    }

    /**
     * removeContextMenu — removes the context menu if present.
     */
    function removeContextMenu() {
      var menu = document.getElementById('dk-item-context-menu');
      if (menu && menu.parentNode) {
        menu.parentNode.removeChild(menu);
      }
    }

    return {
      renderIcon: renderIcon,
      createSlotElement: createSlotElement,
      updateSlot: updateSlot,
      handleSplitDrag: handleSplitDrag,
      getDisplayCharacter: getDisplayCharacter,
      getRarityColor: getRarityColor,
      createContextMenu: createContextMenu,
      removeContextMenu: removeContextMenu,
      _dragState: _dragState // Expose for testing/debugging
    };
  })();

})();