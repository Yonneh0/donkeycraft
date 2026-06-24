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
        var wrapped = function() {
            // Remove from listeners directly to avoid off() matching issues
            if (self._listeners[key]) {
                self._listeners[key] = self._listeners[key].filter(function(entry) {
                    return entry.callback !== wrapped;
                });
            }
            callback.apply(context || self, arguments);
        };
        this.on(event, wrapped, context);
    };

    /**
     * Remove a listener for an event.
     * @param {string} event - Event name.
     * @param {Function} callback - Callback to remove (or wrapped function if once).
     */
    Donkeycraft.EventBus.prototype.off = function(event, callback) {
        var key = this._namespace + event;
        if (!this._listeners[key]) return;

        this._listeners[key] = this._listeners[key].filter(function(entry) {
            return entry.callback !== callback && entry.callback._original !== callback;
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

})();