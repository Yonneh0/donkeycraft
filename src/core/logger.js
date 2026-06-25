// Donkeycraft — Logger
// Tiered logging system (debug, info, warn, error) with toggle.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * LogLevel enum
     */
    Donkeycraft.LogLevel = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        SILENT: 4
    };

    /**
     * Logger — tiered logging system.
     */
    Donkeycraft.Logger = (function() {
        var _level = Donkeycraft.LogLevel.INFO;
        var _tagEnabled = true;

        return {
            /**
             * Set the minimum log level.
             * @param {Donkeycraft.LogLevel} level
             */
            setLevel: function(level) {
                _level = level;
            },

            /**
             * Get the current log level.
             * @returns {Donkeycraft.LogLevel}
             */
            getLevel: function() {
                return _level;
            },

            /**
             * Enable or disable the [Donkeycraft] tag in log output.
             * @param {boolean} enabled
             */
            setTagEnabled: function(enabled) {
                _tagEnabled = !!enabled;
            },

            /**
             * Check if the tag is currently enabled.
             * @returns {boolean}
             */
            getTagEnabled: function() {
                return _tagEnabled;
            },

            /**
             * Log a debug message.
             * @param {...*} args
             */
            debug: function() {
                if (_level > Donkeycraft.LogLevel.DEBUG) return;
                var args = Array.prototype.slice.call(arguments);
                this._log('DEBUG', args);
            },

            /**
             * Log an info message.
             * @param {...*} args
             */
            info: function() {
                if (_level > Donkeycraft.LogLevel.INFO) return;
                var args = Array.prototype.slice.call(arguments);
                this._log('INFO', args);
            },

            /**
             * Log a warning message.
             * @param {...*} args
             */
            warn: function() {
                if (_level > Donkeycraft.LogLevel.WARN) return;
                var args = Array.prototype.slice.call(arguments);
                this._log('WARN', args);
            },

            /**
             * Log an error message.
             * @param {...*} args
             */
            error: function() {
                if (_level > Donkeycraft.LogLevel.ERROR) return;
                var args = Array.prototype.slice.call(arguments);
                this._log('ERROR', args);
            },

            /**
             * Internal log method.
             * @param {string} level
             * @param {*[]} args
             * @private
             */
            _log: function(level, args) {
                var tag = '[Donkeycraft]';
                if (_tagEnabled) {
                    args.unshift(tag);
                }
                switch (level) {
                    case 'ERROR':
                        console.error.apply(console, args);
                        break;
                    case 'WARN':
                        console.warn.apply(console, args);
                        break;
                    default:
                        console.log.apply(console, args);
                        break;
                }
            }
        };
    })();

})();