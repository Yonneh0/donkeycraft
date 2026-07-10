// Donkeycraft — Item Examine UI
// Shows detailed item info when hovering/examining an item stack.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var EventBus = Donkeycraft.EventBus;

  /**
   * ItemExamineUI — displays detailed item information in a tooltip-style panel.
   * @param {HTMLElement} [container=null] - Container element (defaults to body).
   */
  Donkeycraft.ItemExamineUI = function (container) {
    this._container = container || document.body;
    this._visible = false;

    // DOM elements
    this._panel = null;
    this._iconEl = null;
    this._typeEl = null;
    this._durabilityMeterEl = null;
    this._propertiesEl = null;
    this._loreEl = null;

    // Current item being examined
    this._currentStack = null;
    this._currentSlot = -1;

    // Build DOM if container provided
    if (this._container) {
      this._buildDOM();
    }
  };

  /**
   * _buildDOM — creates the examine panel DOM elements.
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._buildDOM = function () {
    var self = this;

    // Create panel
    this._panel = document.createElement('div');
    this._panel.className = 'dk-item-examine';
    this._panel.style.display = 'none';

    // Icon container
    this._iconEl = document.createElement('div');
    this._iconEl.className = 'dk-examine-icon';
    this._panel.appendChild(this._iconEl);

    // Info container
    var infoEl = document.createElement('div');
    infoEl.className = 'dk-examine-info';

    // Name
    this._nameEl = document.createElement('div');
    this._nameEl.className = 'dk-examine-name';
    infoEl.appendChild(this._nameEl);

    // Type
    this._typeEl = document.createElement('div');
    this._typeEl.className = 'dk-examine-type';
    infoEl.appendChild(this._typeEl);

    // Durability meter
    this._durabilityMeterEl = document.createElement('div');
    this._durabilityMeterEl.className = 'dk-examine-durability-meter';
    var meterFill = document.createElement('div');
    meterFill.className = 'dk-examine-durability-fill';
    this._durabilityMeterEl.appendChild(meterFill);
    this._durabilityMeterEl._fillEl = meterFill;
    infoEl.appendChild(this._durabilityMeterEl);

    // Properties list
    this._propertiesEl = document.createElement('div');
    this._propertiesEl.className = 'dk-examine-properties';
    infoEl.appendChild(this._propertiesEl);

    // Lore/description
    this._loreEl = document.createElement('div');
    this._loreEl.className = 'dk-examine-lore';
    infoEl.appendChild(this._loreEl);

    this._panel.appendChild(infoEl);

    // Append to container
    this._container.appendChild(this._panel);
  };

  /**
   * show — displays the examine panel for a given item stack.
   * @param {Donkeycraft.ItemStack} stack - The item stack to examine.
   * @param {number} [slot=-1] - Source slot index.
   * @param {number} [x=0] - X position for panel placement.
   * @param {number} [y=0] - Y position for panel placement.
   */
  Donkeycraft.ItemExamineUI.prototype.show = function (stack, slot, x, y) {
    if (!stack || stack.isEmpty()) {
      this.hide();
      return;
    }

    this._currentStack = stack;
    this._currentSlot = slot !== undefined ? slot : -1;

    var itemDef = Donkeycraft.ItemDefinitionRegistry.get(stack.getItemId());
    if (!itemDef) {
      this.hide();
      return;
    }

    // Update name with rarity color
    var rarityColors = ['#FFFFFF', '#7E7E7E', '#1AC8FF', '#B24AE6', '#FF8C00']; // common, uncommon, rare, epic, legendary
    var rarityName =
      ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][
        itemDef.getRarity()
      ] || '';
    this._nameEl.textContent = itemDef.name;
    this._nameEl.style.color = rarityColors[itemDef.getRarity()] || '#FFFFFF';

    // Update type
    var typeStr = this._getTypeString(itemDef);
    if (rarityName) typeStr += ' — ' + rarityName;
    this._typeEl.textContent = typeStr;

    // Update icon
    this._updateIcon(itemDef, stack);

    // Update durability meter (if applicable)
    if (
      itemDef.isDurable() &&
      stack.hasTag() &&
      stack.getTag().durability !== undefined
    ) {
      var currentDur = stack.getDurability();
      var maxDur = itemDef.getMaxDurability();
      var fraction = 1.0 - currentDur / maxDur; // 0 = new, 1 = broken
      var pct = Math.max(0, Math.min(100, fraction * 100));

      this._durabilityMeterEl.style.display = '';
      this._durabilityMeterEl._fillEl.style.width = pct + '%';

      // Color based on remaining durability
      var remainingPct = ((maxDur - currentDur) / maxDur) * 100;
      var color;
      if (remainingPct > 50)
        color = '#4CAF50'; // green
      else if (remainingPct > 25)
        color = '#FFC107'; // yellow
      else color = '#F44336'; // red
      this._durabilityMeterEl._fillEl.style.backgroundColor = color;

      // Add durability text
      var durText = Math.floor(maxDur - currentDur) + '/' + maxDur;
      if (!this._durabilityMeterEl._textEl) {
        this._durabilityMeterEl._textEl = document.createElement('span');
        this._durabilityMeterEl._textEl.className =
          'dk-examine-durability-text';
        this._durabilityMeterEl.appendChild(this._durabilityMeterEl._textEl);
      }
      this._durabilityMeterEl._textEl.textContent = durText;
    } else if (itemDef.isDurable()) {
      // New item or no durability tag
      this._durabilityMeterEl.style.display = '';
      this._durabilityMeterEl._fillEl.style.width = '100%';
      this._durabilityMeterEl._fillEl.style.backgroundColor = '#4CAF50';
      if (this._durabilityMeterEl._textEl) {
        this._durabilityMeterEl._textEl.textContent = 'Full';
      }
    } else {
      this._durabilityMeterEl.style.display = 'none';
    }

    // Update properties
    this._propertiesEl.innerHTML = '';
    this._updateProperties(itemDef, stack);

    // Update lore
    if (stack.hasTag() && stack.getTag().lore) {
      this._loreEl.textContent = stack.getTag().lore;
      this._loreEl.style.display = '';
    } else {
      this._loreEl.textContent = '';
      this._loreEl.style.display = 'none';
    }

    // Position panel
    if (x !== undefined && y !== undefined) {
      this._panel.style.left = x + 16 + 'px';
      this._panel.style.top = y - 8 + 'px';
    } else {
      this._panel.style.left = '';
      this._panel.style.top = '';
    }

    // Show panel
    this._panel.style.display = '';
    this._panel.classList.add('visible');
    this._visible = true;
  };

  /**
   * hide — hides the examine panel.
   */
  Donkeycraft.ItemExamineUI.prototype.hide = function () {
    if (this._panel) {
      this._panel.style.display = 'none';
      this._panel.classList.remove('visible');
    }
    this._visible = false;
    this._currentStack = null;
    this._currentSlot = -1;
  };

  /**
   * toggle — shows if hidden, hides if shown.
   * @param {Donkeycraft.ItemStack} stack - The item stack to examine.
   * @param {number} [slot=-1] - Source slot index.
   * @param {number} [x=0] - X position.
   * @param {number} [y=0] - Y position.
   */
  Donkeycraft.ItemExamineUI.prototype.toggle = function (stack, slot, x, y) {
    if (
      this._visible &&
      this._currentStack &&
      this._currentStack.matches(stack)
    ) {
      this.hide();
    } else {
      this.show(stack, slot, x, y);
    }
  };

  /**
   * _getTypeString — gets a human-readable type string.
   * @param {Donkeycraft.Item} itemDef - Item definition.
   * @returns {string}
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._getTypeString = function (itemDef) {
    var typeStr;
    switch (itemDef.type) {
      case Donkeycraft.ItemType.TOOL:
        typeStr = 'Tool (' + this._getTierName(itemDef.getMaterialTier()) + ')';
        if (itemDef.getToolType())
          typeStr +=
            ' — ' +
            itemDef.getToolType().charAt(0).toUpperCase() +
            itemDef.getToolType().slice(1);
        break;
      case Donkeycraft.ItemType.WEAPON:
        typeStr =
          'Weapon (' + this._getTierName(itemDef.getMaterialTier()) + ')';
        if (itemDef.getDamage() > 0)
          typeStr += ' — ' + itemDef.getDamage() + ' damage';
        break;
      case Donkeycraft.ItemType.ARMOR:
        typeStr =
          'Armor (' + this._getTierName(itemDef.getMaterialTier()) + ')';
        if (itemDef.getDefense() > 0)
          typeStr += ' — ' + itemDef.getDefense() + ' defense';
        break;
      case Donkeycraft.ItemType.FOOD:
        typeStr = 'Food';
        if (itemDef.getFoodRestore() > 0)
          typeStr += ' — +' + itemDef.getFoodRestore() / 2 + ' hunger';
        break;
      case Donkeycraft.ItemType.POTION:
        typeStr = 'Potion';
        var effects = itemDef.getBrewingEffects();
        if (effects && effects.length > 0) {
          var effectNames = [];
          for (var i = 0; i < effects.length; i++) {
            effectNames.push(this._getEffectName(effects[i].effectId));
          }
          typeStr += ' — ' + effectNames.join(', ');
        }
        break;
      case Donkeycraft.ItemType.BLOCK:
        typeStr = 'Block';
        break;
      case Donkeycraft.ItemType.MATERIAL:
        typeStr = 'Material';
        break;
      case Donkeycraft.ItemType.ENTITY_ITEM:
        typeStr = 'Item';
        break;
      default:
        typeStr = 'Item';
    }
    return typeStr;
  };

  /**
   * _getTierName — gets a human-readable tier name.
   * @param {number} tier - Material tier.
   * @returns {string}
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._getTierName = function (tier) {
    var tiers = [
      'None',
      'Wood',
      'Stone',
      'Iron',
      'Diamond',
      'Gold',
      'Netherite',
    ];
    return tiers[tier] || 'Unknown';
  };

  /**
   * _getEffectName — gets a human-readable effect name.
   * @param {number} effectId - Effect ID.
   * @returns {string}
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._getEffectName = function (effectId) {
    var names = {
      1: 'Healing',
      2: 'Regeneration',
      3: 'Strength',
      4: 'Swiftness',
      5: 'Slowness',
      6: 'Leaping',
      7: 'Fire Resistance',
      8: 'Water Breathing',
      9: 'Invisibility',
      10: 'Night Vision',
      11: 'Weakness',
      12: 'Slow Falling',
    };
    return names[effectId] || 'Effect ' + effectId;
  };

  /**
   * _updateIcon — updates the icon display.
   * @param {Donkeycraft.Item} itemDef - Item definition.
   * @param {Donkeycraft.ItemStack} stack - Item stack.
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._updateIcon = function (itemDef, stack) {
    this._iconEl.innerHTML = '';

    // Use emoji display for now (will be replaced with textures)
    var displayChar = this._getItemDisplayChar(itemDef);
    if (displayChar) {
      var iconSpan = document.createElement('span');
      iconSpan.className = 'dk-examine-icon-char';
      iconSpan.textContent = displayChar;
      this._iconEl.appendChild(iconSpan);
    }

    // Stack count badge
    if (stack.getCount() > 1) {
      var countBadge = document.createElement('span');
      countBadge.className = 'dk-examine-count';
      countBadge.textContent = stack.getCount();
      this._iconEl.appendChild(countBadge);
    }
  };

  /**
   * _updateProperties — updates the properties list.
   * @param {Donkeycraft.Item} itemDef - Item definition.
   * @param {Donkeycraft.ItemStack} stack - Item stack.
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._updateProperties = function (
    itemDef,
    stack
  ) {
    var hasProperties = false;
    var props = [];

    // Tool properties
    if (itemDef.isTool() && itemDef.getToolType()) {
      hasProperties = true;
      props.push(
        '<span class="dk-prop dk-prop-tool">⛏️ ' +
          itemDef.getToolType().replace('_', ' ') +
          '</span>'
      );
    }

    // Weapon damage
    if (itemDef.isWeapon() && itemDef.getDamage() > 0) {
      hasProperties = true;
      props.push(
        '<span class="dk-prop dk-prop-damage">⚔️ +' +
          itemDef.getDamage() +
          ' damage</span>'
      );
    }

    // Armor defense
    if (itemDef.isArmor() && itemDef.getDefense() > 0) {
      hasProperties = true;
      props.push(
        '<span class="dk-prop dk-prop-defense">🛡️ +' +
          itemDef.getDefense() +
          ' defense</span>'
      );
    }

    // Food info
    if (itemDef.isFood() && itemDef.getFoodRestore() > 0) {
      hasProperties = true;
      props.push(
        '<span class="dk-prop dk-prop-food">🍖 +' +
          itemDef.getFoodRestore() / 2 +
          ' hunger</span>'
      );
    }

    // Enchantments
    var enchantments = stack.getEnchantments();
    if (enchantments && enchantments.length > 0) {
      hasProperties = true;
      for (var i = 0; i < enchantments.length; i++) {
        var ench = enchantments[i];
        props.push(
          '<span class="dk-prop dk-prop-enchant">✨ ' +
            this._getEnchantmentName(ench.id) +
            ' ' +
            this._getRomanNumeral(ench.level) +
            '</span>'
        );
      }
    }

    // Block placeable
    if (itemDef.isBlock() && itemDef.getBlockId() > 0) {
      hasProperties = true;
      props.push('<span class="dk-prop dk-prop-place">📦 Placeable</span>');
    }

    this._propertiesEl.innerHTML = props.join('');
  };

  /**
   * _getItemDisplayChar — gets a display character for an item.
   * @param {Donkeycraft.Item} itemDef - Item definition.
   * @returns {string}
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._getItemDisplayChar = function (itemDef) {
    var name = itemDef.name.toLowerCase();
    if (name.indexOf('pickaxe') >= 0) return '⛏️';
    if (name.indexOf('shovel') >= 0 || name.indexOf('spade') >= 0) return '🔧';
    if (name.indexOf('axe') >= 0) return '🪓';
    if (name.indexOf('hoe') >= 0) return '🌾';
    if (name.indexOf('sword') >= 0) return '⚔️';
    if (name.indexOf('helmet') >= 0) return '⛑️';
    if (name.indexOf('chestplate') >= 0) return '🦺';
    if (name.indexOf('leggings') >= 0) return '👖';
    if (name.indexOf('boots') >= 0) return '👢';
    if (name.indexOf('apple') >= 0) return '🍎';
    if (name.indexOf('bread') >= 0) return '🍞';
    if (name.indexOf('potion') >= 0) return '🧪';
    if (name.indexOf('diamond') >= 0) return '💎';
    if (name.indexOf('iron') >= 0) return '⚪';
    if (name.indexOf('gold') >= 0) return '🟡';
    if (name.indexOf('stone') >= 0) return '🪨';
    if (name.indexOf('wooden') >= 0 || name.indexOf('wood') >= 0) return '🪵';
    return '▪';
  };

  /**
   * _getEnchantmentName — gets a human-readable enchantment name.
   * @param {number} enchId - Enchantment ID.
   * @returns {string}
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._getEnchantmentName = function (enchId) {
    var names = {
      1: 'Power',
      2: 'Punch',
      3: 'Flame',
      4: 'Infinity',
      5: 'Unbreaking',
      6: 'Fortune',
      7: 'Efficiency',
      8: 'Sharpness',
      9: 'Smite',
      10: 'Bane of Arthropods',
      11: 'Knockback',
      12: 'Fire Aspect',
      13: 'Looting',
      14: 'Feather Falling',
      15: 'Depth Strider',
      16: 'Frost Walker',
      17: 'Soul Speed',
      18: 'Swift Sneak',
      19: 'Mending',
      20: 'Vanishing Curse',
      21: 'Curse of Binding',
      22: 'Riptide',
      23: 'Loyalty',
      24: 'Channeling',
    };
    return names[enchId] || 'Enchantment ' + enchId;
  };

  /**
   * _getRomanNumeral — converts a number to Roman numeral string.
   * @param {number} n - Number to convert.
   * @returns {string}
   * @private
   */
  Donkeycraft.ItemExamineUI.prototype._getRomanNumeral = function (n) {
    var numerals = ['', 'I', 'II', 'III', 'IV', 'V'];
    return numerals[n] || n.toString();
  };

  /**
   * isVisible — checks if the panel is currently visible.
   * @returns {boolean}
   */
  Donkeycraft.ItemExamineUI.prototype.isVisible = function () {
    return this._visible;
  };

  /**
   * destroy — cleans up all DOM elements and references.
   */
  Donkeycraft.ItemExamineUI.prototype.destroy = function () {
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
    }
    this._panel = null;
    this._iconEl = null;
    this._nameEl = null;
    this._typeEl = null;
    this._durabilityMeterEl = null;
    this._propertiesEl = null;
    this._loreEl = null;
    this._container = null;
    this._currentStack = null;
  };
})();
