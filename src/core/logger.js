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
     * Logger — tiered logging system with debug/info/warn/error levels and tag toggle.
     *
     * Usage:
     *   Donkeycraft.Logger.setLevel(Donkeycraft.LogLevel.DEBUG);  // show all logs
     *   Donkeycraft.Logger.setSilent(true);                       // silence all logs
     *   Donkeycraft.Logger.resetLevel();                          // restore default (INFO)
     */
    Donkeycraft.Logger = (function() {
        var _level = Donkeycraft.LogLevel.INFO;
        var _tagEnabled = true;

        return {
            /**
             * Set the minimum log level. Only messages at this level or higher will be shown.
             * @param {Donkeycraft.LogLevel} level — One of Donkeycraft.LogLevel values.
             * @returns {boolean} True if the level was changed successfully.
             */
            setLevel: function(level) {
                if (typeof level !== 'number' || level < 0 || level > 4) return false;
                _level = level;
                return true;
            },

            /**
             * Get the current log level.
             * @returns {Donkeycraft.LogLevel} The active log level.
             */
            getLevel: function() {
                return _level;
            },

            /**
             * Silence all log output, or restore normal logging.
             * @param {boolean} enabled — true to silence, false to restore.
             * @returns {boolean} True if the state was changed successfully.
             */
            setSilent: function(enabled) {
                var wasSilent = _level === Donkeycraft.LogLevel.SILENT;
                _level = !!enabled ? Donkeycraft.LogLevel.SILENT : Donkeycraft.LogLevel.INFO;
                return _level !== wasSilent || wasSilent;
            },

            /**
             * Check whether logging is currently silenced.
             * @returns {boolean} True if SILENT mode is active.
             */
            isSilent: function() {
                return _level === Donkeycraft.LogLevel.SILENT;
            },

            /**
             * Reset the log level back to the default (INFO).
             * @returns {Donkeycraft.LogLevel} The restored log level (INFO).
             */
            resetLevel: function() {
                _level = Donkeycraft.LogLevel.INFO;
                return _level;
            },

            /**
             * Enable or disable the [Donkeycraft] tag in log output.
             * @param {boolean} enabled — true to show tag, false to hide it.
             * @returns {boolean} The new tag-enabled state.
             */
            setTagEnabled: function(enabled) {
                var prev = _tagEnabled;
                _tagEnabled = !!enabled;
                return _tagEnabled;
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
             * Internal log method — routes args to the appropriate console method.
             * @param {string} level — One of 'DEBUG', 'INFO', 'WARN', 'ERROR'.
             * @param {*[]} args — Arguments to pass to the console.
             * @private
             */
            _log: function(level, args) {
                var tag = '[Donkeycraft]';
                if (_tagEnabled) {
                    args.unshift(tag);
                }

                // Defensive checks in case console methods are missing or overridden.
                var fn;
                switch (level) {
                    case 'ERROR':
                        fn = console.error;
                        break;
                    case 'WARN':
                        fn = console.warn;
                        break;
                    default:
                        fn = console.log;
                        break;
                }

                if (typeof fn === 'function') {
                    fn.apply(console, args);
                } else if (typeof console.log === 'function') {
                    // Fallback: route everything through console.log.
                    console.log.apply(console, args);
                }
            }
        };
    })();

})();