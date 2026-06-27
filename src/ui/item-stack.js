// Donkeycraft — Item Stack
// Core item data structure representing a stack of identical items.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * ItemStack — represents a stack of identical items in an inventory.
     * @param {number} [itemId=0] - Block/item ID (0 = air/empty).
     * @param {number} [count=1] - Number of items in the stack.
     * @param {Object} [tag=null] - NBT-like metadata object (durability, enchantments, customName).
     */
    Donkeycraft.ItemStack = function(itemId, count, tag) {
        this._itemId = itemId || 0;
        this._count = Math.max(0, count || 0);
        this._tag = tag || null;
    };

    /**
     * isEmpty — checks if this stack is empty (air or zero count).
     * @returns {boolean}
     */
    Donkeycraft.ItemStack.prototype.isEmpty = function() {
        return this._itemId === 0 || this._count <= 0;
    };

    /**
     * getItemId — gets the block/item ID of this stack.
     * @returns {number}
     */
    Donkeycraft.ItemStack.prototype.getItemId = function() {
        return this._itemId;
    };

    /**
     * getCount — gets the number of items in this stack.
     * @returns {number}
     */
    Donkeycraft.ItemStack.prototype.getCount = function() {
        return this._count;
    };

    /**
     * setCount — sets the stack count (clamped to 0 minimum).
     * @param {number} n - New count.
     */
    Donkeycraft.ItemStack.prototype.setCount = function(n) {
        this._count = Math.max(0, n);
    };

    /**
     * increment — adds to the stack count.
     * @param {number} [n=1] - Amount to add.
     */
    Donkeycraft.ItemStack.prototype.increment = function(n) {
        n = n || 1;
        this._count += n;
    };

    /**
     * decrement — subtracts from the stack count (clamped to 0 minimum).
     * @param {number} [n=1] - Amount to subtract.
     */
    Donkeycraft.ItemStack.prototype.decrement = function(n) {
        n = n || 1;
        this._count = Math.max(0, this._count - n);
    };

    /**
     * getItem — alias for getItemId (compatibility).
     * @returns {number}
     */
    Donkeycraft.ItemStack.prototype.getItem = function() {
        return this._itemId;
    };

    /**
     * getTag — gets the NBT-like metadata object.
     * @returns {Object|null}
     */
    Donkeycraft.ItemStack.prototype.getTag = function() {
        return this._tag;
    };

    /**
     * setTag — sets the NBT-like metadata object.
     * @param {Object|null} tag - New tag object.
     */
    Donkeycraft.ItemStack.prototype.setTag = function(tag) {
        this._tag = tag;
    };

    /**
     * hasTag — checks if this stack has a non-null tag.
     * @returns {boolean}
     */
    Donkeycraft.ItemStack.prototype.hasTag = function() {
        return this._tag !== null;
    };

    /**
     * getDurability — gets the durability value from the tag.
     * @returns {number}
     */
    Donkeycraft.ItemStack.prototype.getDurability = function() {
        if (!this._tag || this._tag.durability === undefined) return 0;
        return this._tag.durability;
    };

    /**
     * setDurability — sets the durability value in the tag.
     * @param {number} val - Durability value.
     */
    Donkeycraft.ItemStack.prototype.setDurability = function(val) {
        if (!this._tag) this._tag = {};
        this._tag.durability = val;
    };

    /**
     * getEnchantments — gets the enchantment list from the tag.
     * @returns {Array} Array of {id, level} objects.
     */
    Donkeycraft.ItemStack.prototype.getEnchantments = function() {
        if (!this._tag || !this._tag.enchantments) return [];
        return this._tag.enchantments;
    };

    /**
     * addEnchantment — adds an enchantment to the item tag.
     * @param {number} id - Enchantment ID.
     * @param {number} level - Enchantment level.
     */
    Donkeycraft.ItemStack.prototype.addEnchantment = function(id, level) {
        if (!this._tag) this._tag = {};
        if (!this._tag.enchantments) this._tag.enchantments = [];
        // Remove existing enchantment with same ID to update level
        for (var i = 0; i < this._tag.enchantments.length; i++) {
            if (this._tag.enchantments[i].id === id) {
                this._tag.enchantments[i].level = level;
                return;
            }
        }
        this._tag.enchantments.push({ id: id, level: level });
    };

    /**
     * clone — creates a deep copy of this item stack.
     * Uses JSON parse/stringify for proper deep copy of nested objects.
     * @returns {Donkeycraft.ItemStack}
     */
    Donkeycraft.ItemStack.prototype.clone = function() {
        var tagCopy = null;
        if (this._tag) {
            try {
                tagCopy = JSON.parse(JSON.stringify(this._tag));
            } catch (e) {
                // Fallback for non-serializable objects: shallow copy
                tagCopy = {};
                for (var key in this._tag) {
                    if (this._tag.hasOwnProperty(key)) {
                        tagCopy[key] = this._tag[key];
                    }
                }
            }
        }
        return new Donkeycraft.ItemStack(this._itemId, this._count, tagCopy);
    };

    /**
     * matches — checks if another stack has the same item ID and compatible tag (ignores count).
     * Uses a custom deep equality check instead of JSON.stringify for better performance.
     * @param {Donkeycraft.ItemStack} other - The other stack to compare.
     * @returns {boolean}
     */
    Donkeycraft.ItemStack.prototype.matches = function(other) {
        if (!other || this._itemId !== other.getItemId()) return false;
        // If neither has a tag, they match
        if (!this._tag && !other.getTag()) return true;
        // If only one has a tag, they don't match
        if (!this._tag || !other.getTag()) return false;
        // Custom deep equality check (faster than JSON.stringify)
        return this._deepEquals(this._tag, other.getTag());
    };

    /**
     * _deepEquals — checks deep equality between two values.
     * Handles primitives, arrays, and plain objects without JSON overhead.
     * @param {*} a - First value.
     * @param {*} b - Second value.
     * @returns {boolean}
     * @private
     */
    Donkeycraft.ItemStack.prototype._deepEquals = function(a, b) {
        // Same reference or both undefined/null
        if (a === b) return true;
        if (a == null || b == null) return false;

        // Different types
        if (typeof a !== typeof b) return false;

        // Arrays
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) {
                if (!this._deepEquals(a[i], b[i])) return false;
            }
            return true;
        }

        // Objects (but not functions/Date/etc.)
        if (typeof a === 'object') {
            var keysA = Object.keys(a);
            var keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;
            for (var j = 0; j < keysA.length; j++) {
                if (!this._deepEquals(a[keysA[j]], b[keysB[j]])) return false;
            }
            return true;
        }

        // Primitives (number, string, boolean)
        return a === b;
    };

    /**
     * canStackWith — checks if two stacks can be merged into one stack.
     * Uses matches() for tag comparison.
     * @param {Donkeycraft.ItemStack} other - The other stack.
     * @returns {boolean}
     */
    Donkeycraft.ItemStack.prototype.canStackWith = function(other) {
        if (!other || this.isEmpty() || other.isEmpty()) return false;
        if (this._itemId !== other.getItemId()) return false;
        // Tags must match for stacking (reuse matches logic)
        if (!this._tag && !other.getTag()) return true;
        if (!this._tag || !other.getTag()) return false;
        return this._deepEquals(this._tag, other.getTag());
    };

    /**
     * serialize — serializes this stack to a JSON-safe object.
     * @returns {Object}
     */
    Donkeycraft.ItemStack.prototype.serialize = function() {
        var obj = {
            id: this._itemId,
            count: this._count
        };
        if (this._tag) {
            obj.tag = JSON.parse(JSON.stringify(this._tag));
        }
        return obj;
    };

    /**
     * toString — returns a debug string representation.
     * @returns {string}
     */
    Donkeycraft.ItemStack.prototype.toString = function() {
        return 'ItemStack{id=' + this._itemId + ', count=' + this._count + '}';
    };

    /**
     * fromObject — creates an ItemStack from a serialized object.
     * @param {Object} obj - Serialized stack object.
     * @returns {Donkeycraft.ItemStack}
     */
    Donkeycraft.ItemStack.fromObject = function(obj) {
        if (!obj || obj.id === undefined) {
            return new Donkeycraft.ItemStack(0, 0);
        }
        var tag = obj.tag ? JSON.parse(JSON.stringify(obj.tag)) : null;
        return new Donkeycraft.ItemStack(obj.id, obj.count || 0, tag);
    };

})();