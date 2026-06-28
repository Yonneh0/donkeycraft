// Donkeycraft — Core Namespace
// Global namespace object for all Donkeycraft classes.
(function() {
    'use strict';

    /**
     * Donkeycraft — global namespace object for all Donkeycraft classes and utilities.
     *
     * All public classes, constants, and utility functions register themselves on this
     * namespace via IIFE (Immediately Invoked Function Expression) pattern. The namespace
     * is defensive against double-loading: if this file is included twice in the DOM,
     * existing properties are preserved and re-initialized values are skipped.
     *
     * ## Dependency Order
     * Downstream modules register on this namespace in the following order (per PLAN.md):
     * 1. `eventbus.js` — Donkeycraft.EventBus
     * 2. `config.js` — Donkeycraft.Config (configuration constants)
     * 3. `logger.js` — Donkeycraft.Logger, Donkeycraft.LogLevel
     * 4. `timer.js` — Donkeycraft.Timer
     * 5. `input.js` — Donkeycraft.Input
     * 6. `math-utils.js` — Donkeycraft.Vector3, Donkeycraft.Matrix4, Donkeycraft.Quaternion,
     *    Donkeycraft.PerlinNoise, Donkeycraft.lerp, Donkeycraft.clamp, Donkeycraft.map,
     *    Donkeycraft.round, Donkeycraft.inRange
     * 7. `audio.js` — Donkeycraft.AudioSystem
     *
     * ## Properties
     * @property {string} VERSION - Semantic version string (e.g., '0.1.0').
     * @property {string} NAME - Display name of the game/engine.
     * @property {Object} systems - Runtime system registry. Populated by init-sequence.js
     *     during async initialization. Contains references to major subsystems:
     *     { input, timer, camera, player, chunkManager, eventBus, ... }.
     * @property {boolean} isRunning - Flag indicating whether the main game loop is active.
     *     Set to true by Game.start() and false by Game.stop().
     */

    // Defensive check: preserve existing namespace if file is loaded twice.
    // Explicitly initialize missing properties to avoid undefined references
    // when the file is accidentally included multiple times.
    var Donkeycraft = window.Donkeycraft = window.Donkeycraft || {};
    Donkeycraft.VERSION = Donkeycraft.VERSION || '0.1.0';
    Donkeycraft.NAME = Donkeycraft.NAME || 'Donkeycraft';
    Donkeycraft.systems = Donkeycraft.systems || {};
    Donkeycraft.isRunning = (Donkeycraft.isRunning !== undefined) ? Donkeycraft.isRunning : false;

})();
