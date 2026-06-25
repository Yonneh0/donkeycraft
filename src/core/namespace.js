// Donkeycraft — Core Namespace
// Global namespace object for all Donkeycraft classes.
(function() {
    'use strict';

    // Defensive check: preserve existing namespace if file is loaded twice.
    // Explicitly initialize missing properties to avoid undefined references
    // when the file is accidentally included multiple times.
    var Donkeycraft = window.Donkeycraft = window.Donkeycraft || {};
    Donkeycraft.VERSION = Donkeycraft.VERSION || '0.1.0';
    Donkeycraft.NAME = Donkeycraft.NAME || 'Donkeycraft';
    Donkeycraft.systems = Donkeycraft.systems || {};
    Donkeycraft.isRunning = (Donkeycraft.isRunning !== undefined) ? Donkeycraft.isRunning : false;

})();
