// Donkeycraft — Event Bus
// Publish/subscribe event system for decoupled communication between systems.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * EventBus — manages event listeners and dispatches events.
     * Supports namespaced events, one-time listeners, and safe static emission.
     * @param {string} [namespace=''] - Optional namespace prefix for events (e.g., 'world', 'player').
     */
    Donkeycraft.EventBus = function (namespace) {
        this._namespace = namespace || '';
        this._listeners = {};
    };

    /**
     * Register a listener for an event.
     * @param {string} event - Event name (namespace prefix is automatically prepended).
     * @param {Function} callback - Function to call when event fires.
     * @param {*} [context] - Optional context object to bind as `this` for the callback. Defaults to the EventBus instance.
     * @returns {Function} Unsubscribe function that removes this listener without firing it.
     */
    Donkeycraft.EventBus.prototype.on = function (event, callback, context) {
        var key = this._namespace + event;
        if (!this._listeners[key]) {
            this._listeners[key] = [];
        }
        this._listeners[key].push({ callback: callback, context: context || this });

        var self = this;
        return function () {
            self.off(event, callback);
        };
    };

    /**
     * Register a one-time listener for an event. The callback fires exactly once,
     * then is automatically removed. Calling the returned unsubscribe before the
     * event emits also prevents firing without removing from the listener array.
     * @param {string} event - Event name (namespace prefix is automatically prepended).
     * @param {Function} callback - Function to call when event fires (once).
     * @param {*} [context] - Optional context object to bind as `this` for the callback. Defaults to the EventBus instance.
     * @returns {Function} Unsubscribe function that prevents the one-time listener from ever firing.
     */
    Donkeycraft.EventBus.prototype.once = function (event, callback, context) {
        var self = this;
        var key = this._namespace + event;
        var fired = false;

        // Create a wrapped callback that removes itself after first invocation.
        var wrapped = function () {
            if (fired) return;
            fired = true;
            // Remove the wrapped callback from listeners array.
            if (self._listeners[key]) {
                self._listeners[key] = self._listeners[key].filter(function (entry) {
                    return entry.callback !== wrapped;
                });
            }
            callback.apply(context || self, arguments);
        };

        // Register the wrapped callback using the standard on() method.
        var unsubscribe = this.on(event, wrapped, context || this);

        // Tag the last-added entry so off(event, originalCallback) also removes it.
        var listeners = this._listeners[key];
        if (listeners && listeners.length > 0) {
            listeners[listeners.length - 1]._originalCallback = callback;
        }

        return function () {
            fired = true;
            // Immediately remove the wrapped callback without waiting for event emission.
            if (self._listeners[key]) {
                self._listeners[key] = self._listeners[key].filter(function (entry) {
                    return entry.callback !== wrapped && entry._originalCallback !== callback;
                });
            }
        };
    };

    /**
     * Remove a previously registered listener for an event.
     * Works with both regular (`on`) and one-time (`once`) callbacks.
     * For `once()` listeners, removes by matching the _originalCallback tag.
     * @param {string} event - Event name (namespace prefix is automatically prepended).
     * @param {Function} callback - The exact callback function reference to remove.
     */
    Donkeycraft.EventBus.prototype.off = function (event, callback) {
        var key = this._namespace + event;
        if (!this._listeners[key]) return;

        // Filter out entries matching either the wrapped callback or the original callback.
        var before = this._listeners[key].length;
        this._listeners[key] = this._listeners[key].filter(function (entry) {
            return entry.callback !== callback && entry._originalCallback !== callback;
        });

        // Clean up empty arrays to prevent memory leaks.
        if (this._listeners[key].length === 0) {
            delete this._listeners[key];
        }
    };

    /**
     * Dispatch an event to all registered listeners.
     * Listeners are invoked in registration order. Exceptions in one listener
     * do not prevent subsequent listeners from firing.
     * @param {string} event - Event name (namespace prefix is automatically prepended).
     * @param {...*} args - Arguments passed to each listener callback.
     */
    Donkeycraft.EventBus.prototype.emit = function (event) {
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
                } else {
                    console.error('EventBus error on "' + event + '":', e);
                }
            }
        }
    };

    /**
     * Clear all listeners.
     */
    Donkeycraft.EventBus.prototype.clear = function () {
        this._listeners = {};
    };

    /**
     * Safely emit an event on the globally-registered EventBus instance.
     * This is the correct method for standalone modules (entities, redstone, interaction)
     * that do not have a direct reference to their owning EventBus instance.
     * Call EventBus.setGlobal() during game initialization to register the global instance.
     * @param {string} event - Event name (no namespace prefix — uses the global instance directly).
     * @param {...*} args - Arguments passed to each listener callback.
     */
    Donkeycraft.EventBus.emitSafe = function (event) {
        var globalInstance = Donkeycraft.EventBus._global;
        if (!globalInstance || typeof globalInstance.emit !== 'function') return;
        var args = Array.prototype.slice.call(arguments, 1);
        globalInstance.emit.apply(globalInstance, [event].concat(args));
    };

    /**
     * Register the global EventBus instance for use by emitSafe().
     * Call this once during game initialization with the main game's EventBus.
     * @param {Donkeycraft.EventBus} instance - The global EventBus instance.
     */
    Donkeycraft.EventBus.setGlobal = function (instance) {
        if (instance && typeof instance.emit === 'function') {
            Donkeycraft.EventBus._global = instance;
        }
    };

})();
