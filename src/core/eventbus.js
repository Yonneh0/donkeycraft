// Donkeycraft — Event Bus
// Publish/subscribe event system for decoupled communication between systems.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * EventBus — manages event listeners and dispatches events.
     * @param {string} namespace - Optional namespace prefix for events (e.g., 'world', 'player').
     */
    Donkeycraft.EventBus = function(namespace) {
        this._namespace = namespace || '';
        this._listeners = {};
    };

    /**
     * Register a listener for an event.
     * @param {string} event - Event name.
     * @param {Function} callback - Function to call when event fires.
     * @param {*} context - Optional context to bind callback to.
     * @returns {Function} - Unsubscribe function.
     */
    Donkeycraft.EventBus.prototype.on = function(event, callback, context) {
        var key = this._namespace + event;
        if (!this._listeners[key]) {
            this._listeners[key] = [];
        }
        var entry = { callback: callback, context: context || this };
        this._listeners[key].push(entry);

        // Return unsubscribe function
        var self = this;
        return function() {
            self.off(event, callback);
        };
    };

    /**
     * Register a one-time listener for an event.
     * @param {string} event - Event name.
     * @param {Function} callback - Function to call when event fires.
     * @param {*} context - Optional context to bind callback to.
     */
    Donkeycraft.EventBus.prototype.once = function(event, callback, context) {
        var self = this;
        var key = this._namespace + event;
        var fired = false;

        var wrapped = function() {
            if (fired) return;
            fired = true;
            // Remove from listeners immediately after firing
            if (self._listeners[key]) {
                self._listeners[key] = self._listeners[key].filter(function(entry) {
                    return entry.callback !== wrapped;
                });
            }
            callback.apply(context || self, arguments);
        };

        var unsub = this.on(event, wrapped, context);

        // Store original callback reference on the entry so off(event, originalCallback) works
        var listeners = this._listeners[key];
        if (listeners && listeners.length > 0) {
            listeners[listeners.length - 1]._originalCallback = callback;
        }

        // Return a combined unsubscribe that also prevents firing if called before emit
        return function() {
            fired = true;
            unsub();
        };
    };

    /**
     * Remove a listener for an event.
     * @param {string} event - Event name.
     * @param {Function} callback - Callback to remove. Works with both regular and once() callbacks.
     */
    Donkeycraft.EventBus.prototype.off = function(event, callback) {
        var key = this._namespace + event;
        if (!this._listeners[key]) return;

        this._listeners[key] = this._listeners[key].filter(function(entry) {
            return entry.callback !== callback && entry._originalCallback !== callback;
        });

        // Clean up empty arrays
        if (this._listeners[key].length === 0) {
            delete this._listeners[key];
        }
    };

    /**
     * Dispatch an event to all registered listeners.
     * @param {string} event - Event name.
     * @param {...*} args - Arguments to pass to listeners.
     */
    Donkeycraft.EventBus.prototype.emit = function(event) {
        var key = this._namespace + event;
        if (!this._listeners[key]) return;

        var args = Array.prototype.slice.call(arguments, 1);
        var listenersCopy = this._listeners[key].slice();
        for (var i = 0; i < listenersCopy.length; i++) {
            try {
                listenersCopy[i].callback.apply(listenersCopy[i].context, args);
            } catch (e) {
                if (Donkeycraft.Logger) {
                    Donkeycraft.Logger.error('EventBus error on "' + event + '":', e);
                }
            }
        }
    };

    /**
     * Clear all listeners.
     */
    Donkeycraft.EventBus.prototype.clear = function() {
        this._listeners = {};
    };

    /**
     * Safely emit an event on the global EventBus (if available).
     * @param {string} event - Event name.
     * @param {...*} args - Arguments to pass to listeners.
     */
    Donkeycraft.EventBus.emitSafe = function(event) {
        if (!Donkeycraft.EventBus._global) return;
        var args = Array.prototype.slice.call(arguments, 1);
        Donkeycraft.EventBus._global.emit.apply(Donkeycraft.EventBus._global, [event].concat(args));
    };

    /**
     * Set the global EventBus instance for emitSafe to use.
     * @param {Donkeycraft.EventBus} instance - Global EventBus instance.
     */
    Donkeycraft.EventBus.setGlobal = function(instance) {
        Donkeycraft.EventBus._global = instance;
    };

})();
