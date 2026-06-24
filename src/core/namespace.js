// Donkeycraft — Core Namespace
// Global namespace object for all Donkeycraft classes.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft = {
        VERSION: '0.1.0',
        NAME: 'Donkeycraft',
        // Registry for all systems, populated as they initialize
        systems: {},
        // Whether the game is currently running
        isRunning: false
    };

})();