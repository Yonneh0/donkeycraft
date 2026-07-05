// Donkeycraft — Hunger & Hydration Bar UI
// Hunger display: 6 drumstick icons with half-icon granularity (cap = 12 food).
// Hydration display: 3 water drop icons with half-icon granularity (cap = 6 hydration).
// Both bars fill from right to left and feature change animations.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    // ============================================================
    // Constants
    // ============================================================

    /**
     * MAX_FOOD — Maximum food level (12 points = 6 drumstick icons).
     * Each icon represents 2 food points.
     * @type {number}
     */
    var MAX_FOOD = 12;

    /**
     * NUM_HUNGER_ICONS — Number of hunger drumstick icons displayed.
     * @type {number}
     */
    var NUM_HUNGER_ICONS = 6;

    /**
     * MAX_HYDRATION — Maximum hydration level (6 points = 3 water drop icons).
     * Each icon represents 2 hydration points.
     * @type {number}
     */
    var MAX_HYDRATION = 6;

    /**
     * NUM_HYDRATION_ICONS — Number of hydration water drop icons displayed.
     * @type {number}
     */
    var NUM_HYDRATION_ICONS = 3;

    /**
     * Instance counter for generating unique SVG clipPath IDs per HungerBar instance.
     * Prevents ID collisions when multiple hunger bars exist on the page.
     * @type {number}
     */
    var _instanceCounter = 0;

    // ============================================================
    // HungerBar Constructor
    // ============================================================

    /**
     * HungerBar — manages the hunger bar DOM, animations, and overlay effects.
     * Also manages the hydration bar (water drops) with its own DOM, animations, and overlay.
     *
     * Hunger fills from right to left (index 9 first → index 4 last for 6 icons).
     * Hydration fills from right to left (index 2 first → index 0 last for 3 icons).
     *
     * @param {HTMLElement} container - Parent container for hunger & hydration bar DOM.
     * @param {Donkeycraft.Hunger} hunger - Hunger instance to observe.
     */
    Donkeycraft.HungerBar = function (container, hunger) {
        this._hunger = hunger;
        this._container = container;

        // --- Unified hunger/hydration bar DOM references ---
        this._barRow = null;                    // .dk-hunger-hydration-bar (single row for all icons)
        this._drumstickContainers = [];         // Array of drumstick container elements (6)
        this._hungerOverlay = null;             // .dk-hunger-overlay (full-screen brown overlay)

        // --- Hydration bar DOM references ---
        this._dropContainers = [];              // Array of water drop container elements (3)
        this._hydrationOverlay = null;          // .dk-hydration-overlay (full-screen blue overlay)

        // --- Unique SVG clipPath IDs for this instance ---
        var instanceId = ++_instanceCounter;
        this._hungerClipId = 'dk-hunger-clip-bottom-' + instanceId;
        this._hydrationClipId = 'dk-hydration-clip-bottom-' + instanceId;

        // --- State tracking ---
        this._prevFood = 0;
        this._prevHydration = 0;
        this._shakeTimeout = null;
        this._flashTimeouts = [];

        // --- Bind + build ---
        var self = this;
        this._onHungerChanged = function (data) { self.updateFromFood(data); };

        this._buildDOM();
        this._createOverlays();
        this._subscribeToEvents();

        // Capture initial values BEFORE update to prevent spurious animation delta.
        var initFood = hunger.getFoodLevel();
        this._prevFood = initFood;

        var initHydration = hunger.getHydration();
        this._prevHydration = initHydration;

        this.updateFromFood({
            foodLevel: initFood,
            hydration: initHydration
        });
    };

    // ============================================================
    // Event Subscription
    // ============================================================

    /**
     * _subscribeToEvents — listen for hunger:changed events on the global EventBus.
     * @private
     */
    Donkeycraft.HungerBar.prototype._subscribeToEvents = function () {
        var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
        if (globalBus) {
            try {
                globalBus.on('hunger:changed', this._onHungerChanged);
            } catch (e) {
                Donkeycraft.Logger.warn('HungerBar', 'Failed to subscribe to hunger:changed: ' + e.message);
            }
        } else {
            Donkeycraft.Logger.warn('HungerBar', 'No global EventBus instance available — hunger bar will not receive updates');
        }
    };

    // ============================================================
    // DOM Construction
    // ============================================================

    /**
     * _buildDOM — create all hunger and hydration bar elements inside the container.
     * Builds a single unified row: 6 hunger drumsticks followed by 3 hydration drops.
     * Also injects unique clipPath definitions into the container for SVG clipping.
     * @private
     */
    Donkeycraft.HungerBar.prototype._buildDOM = function () {
        var container = this._container;
        if (!container) return;

        container.innerHTML = '';
        container.classList.add('dk-hunger-bar-wrapper');

        // Inject unique clipPath definitions for SVG clipping (prevents ID collisions).
        // These are referenced by _getDrumstickSVG and _getDropSVG via url(#id).
        var defs = document.createElement('div');
        defs.style.display = 'none';
        defs.innerHTML = '<svg width="0" height="0" style="position:absolute;">' +
            '<defs>' +
            '<clipPath id="' + this._hungerClipId + '">' +
            '<rect x="0" y="512" width="1024" height="512"/>' +
            '</clipPath>' +
            '<clipPath id="' + this._hydrationClipId + '">' +
            '<rect x="0" y="10" width="18" height="10"/>' +
            '</clipPath>' +
            '</defs>' +
            '</svg>';
        container.appendChild(defs);

        // --- Single unified row for all hunger + hydration icons ---
        var barRow = document.createElement('div');
        barRow.className = 'dk-hunger-hydration-bar';
        barRow.style.overflow = 'visible';

        // Create 6 drumstick containers (index 0 = leftmost, index 5 = rightmost)
        for (var i = 0; i < NUM_HUNGER_ICONS; i++) {
            var drumContainer = document.createElement('div');
            drumContainer.className = 'dk-drumstick-container dk-drumstick-empty';
            drumContainer.innerHTML = this._getDrumstickSVG('empty');
            barRow.appendChild(drumContainer);
            this._drumstickContainers.push(drumContainer);
        }

        // Create 3 water drop containers (index 0 = leftmost, index 2 = rightmost)
        for (var j = 0; j < NUM_HYDRATION_ICONS; j++) {
            var dropContainer = document.createElement('div');
            dropContainer.className = 'dk-drop-container dk-drop-empty';
            dropContainer.innerHTML = this._getDropSVG('empty');
            barRow.appendChild(dropContainer);
            this._dropContainers.push(dropContainer);
        }

        container.appendChild(barRow);
        this._barRow = barRow;
    };

    /**
     * _createOverlays — create both the brown (hunger) and blue (hydration) full-screen overlays.
     * @private
     */
    Donkeycraft.HungerBar.prototype._createOverlays = function () {
        // Brown overlay for low hunger (styling defined in css/gui.css .dk-hunger-overlay)
        var hungerOverlay = document.createElement('div');
        hungerOverlay.className = 'dk-hunger-overlay';
        document.body.appendChild(hungerOverlay);
        this._hungerOverlay = hungerOverlay;

        // Blue overlay for low hydration (styling defined in css/gui.css .dk-hydration-overlay)
        var hydrationOverlay = document.createElement('div');
        hydrationOverlay.className = 'dk-hydration-overlay';
        document.body.appendChild(hydrationOverlay);
        this._hydrationOverlay = hydrationOverlay;
    };

    // ============================================================
    // Hunger Icon State & SVG
    // ============================================================

    /**
     * _getDrumstickState — determine the visual state for a given food level at a specific drumstick index.
     * Hunger fills from right to left (index 5 first, then 4, ..., down to 0).
     * Each drumstick represents 2 food points.
     * @private
     * @param {number} food - Current food level (0-12).
     * @param {number} index - Drumstick container index (0-5).
     * @returns {string} 'full', 'half', or 'empty'.
     */
    Donkeycraft.HungerBar.prototype._getDrumstickState = function (food, index) {
        food = Math.max(0, Math.round(food));
        // Each drumstick represents 2 food points.
        // Index 5 covers food values 11-12, index 4 covers 9-10, ..., index 0 covers 0-1.
        var baseFood = (NUM_HUNGER_ICONS - 1 - index) * 2; // food value this drumstick starts at
        var remaining = food - baseFood;
        if (remaining >= 2) return 'full';
        if (remaining === 1) return 'half';
        return 'empty';
    };

    /**
     * _getDrumstickSVG — return SVG markup for a drumstick in the given state.
     * Uses the exact paths from the reference drumstick icon (1024x1024 viewBox).
     * All 3 states share an identical bone shape (whiteBody path with #F2F5FB fill + dark outline).
     *   full  — complete drumstick with all layers and colors
     *   half  — body fills clipped to bottom half, bone fully visible
     *   empty — outlines only, no meat shadow, identical bone
     * Uses the instance-unique clipPath ID to prevent collisions across multiple HungerBar instances.
     * @private
     * @param {string} state - 'full', 'half', or 'empty'.
     * @returns {string} SVG markup string.
     */
    Donkeycraft.HungerBar.prototype._getDrumstickSVG = function (state) {
        // Reference SVG paths extracted from ref/drumstick.svg
        var bone = 'M241 919.7c-9.3 4.2-19.4 6.3-29.9 6.1-18.3-0.4-35.2-7.9-47.9-21.1-9.8-10.2-16-22.9-18-36.6-13.6-2.7-26-9.5-35.8-19.7-26-27.2-25-70.6 2.2-96.6 24.3-23.2 61.4-24.9 87.6-5.7L343.8 608c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1L271 822c16.3 26.8 12.4 62.4-11.2 85-5.5 5.2-11.9 9.5-18.8 12.7z';
        var meatFill = 'M358.6 628.4c-6.3-6.6-26 3.7-21.1 8.9 6.6 6.9 7 3.9 13.4 12 12.7 15.9 3 25.2 0.2 27.8l-132 125.3c13.7 22.5 7.3 45.9-7.7 56.6-16.1 11.5-49 13.9-59.4 3.8 2.6 5.4 6.1 10.5 10.4 14.9 10.8 11.3 29.5 31.7 45.2 32.1 9 0.2 17.7-1.6 25.7-5.2 5.9-2.7 11.4-6.4 16.2-11 20.3-19.4 19.6-63.9 5.5-86.9l125-119.4c2.8-2.7 15.7-13.5 15-17.3-2.3-12.2-29.6-34.5-36.4-41.6z';
        var mainBody = 'M314.5 642.2l110.3-400.7s37-66.3 117.1-103.9 244.8-28.7 301.5 51.9C900 270.2 962 423.1 876.1 531.1S408.8 703.5 408.8 703.5L391 658.8l-30.7-24.3-45.8 7.7z';
        var shadowFill = 'M864.7 218.4C830.4 169.6 721 89 635.1 128.2c28.4 11.9 113.6 32.1 147.2 74.2 73.4 92 98.5 206.8 12.6 314.8-58.6 73.7-288 110.2-406.7 136.7l-3.8 56.6s392.8-50.9 478.8-159 58.1-252.4 1.5-333.1z';
        var outlinePath = 'M240 917.4c-9.3 4.2-19.4 6.3-29.9 6.1-18.3-0.4-35.2-7.9-47.9-21.1-9.8-10.2-16-22.9-18-36.6-13.6-2.7-26-9.5-35.8-19.7-26-27.2-25-70.6 2.2-96.6 24.3-23.2 61.4-24.9 87.6-5.7l144.6-138.1c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1L270 819.7c16.3 26.8 12.4 62.4-11.2 85-5.5 5.3-11.9 9.6-18.8 12.7z m-98.3-154c-3.9 1.8-7.5 4.2-10.7 7.3-15.6 14.9-16.1 39.6-1.3 55.2 7.4 7.8 17.5 12 28.4 11.9 4 0 7.9 1.6 10.7 4.5 2.8 2.9 4.2 6.8 4 10.9-0.6 10.9 3.2 21.2 10.6 28.9 7.2 7.5 16.9 11.8 27.3 12.1 10.4 0.2 20.3-3.6 27.9-10.8 15.6-14.9 16.1-39.6 1.3-55.2-5.6-5.9-5.4-15.1 0.5-20.7l141.9-135.6c-6.5-5.1-12.6-10.5-18.1-16.3-4.9-5.1-9.5-10.7-13.9-16.6L208.5 774.5c-2.9 2.8-6.8 4.2-10.8 4-4-0.2-7.8-2-10.4-5-0.3-0.3-1.2-1.5-1.6-2-11.7-12-29.5-14.8-44-8.1z';
        var detailPath = 'M771 634.4c-18.6 8.5-38.5 15.1-59.3 19.5l-348.6 73.8c-6.4 1.4-12.9-1.7-16-7.5-3.1-5.8-1.9-12.9 2.8-17.4l32.4-30.9c-6.5-5.1-12.6-10.5-18.1-16.3-4.9-5.1-9.5-10.7-13.9-16.6l-35.2 33.7c-4.7 4.5-11.9 5.4-17.6 2-5.6-3.3-8.4-10-6.8-16.3l90.9-349.8C414.8 180.9 530 94.4 661.9 98.4c152.7 4.5 275 132.5 272.5 285.2-1.8 110.6-66.5 206.6-163.4 250.8z m-363.5 54l298.2-63.1c115.5-24.5 197.6-124 199.4-242.1 2.2-136.8-107.3-251.4-244.1-255.4-118-3.5-221.3 73.9-250.9 188.2l-77.9 299.9 10.7-10.2c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1l-8 7.7z';
        var eye = 'M474.4 627.1c-3.5 1.6-7.7 1.8-11.5 0.3-1.6-0.7-40.2-16.6-63.3-65.4-3.5-7.3-0.3-16.1 7-19.5 7.4-3.4 16.1-0.3 19.5 7 17.9 37.9 47.4 50.6 47.7 50.7 7.5 3 11.2 11.5 8.2 19.1-1.6 3.6-4.3 6.3-7.6 7.8z';
        var eyeDots = '<circle cx="485.8" cy="334.4" r="16.9" fill="#004364"/><circle cx="500.4" cy="246.1" r="16.9" fill="#004364"/><circle cx="606.6" cy="181.1" r="16.9" fill="#004364"/><circle cx="701.1" cy="211.4" r="16.9" fill="#004364"/><circle cx="588.7" cy="281.2" r="16.9" fill="#004364"/>';
        var clipId = this._hungerClipId;

         if (state === 'half') {
             // Pattern matches health-bar.js: outline/body paths drawn FIRST as background,
             // then colored body fills clipped to bottom half drawn on top.
             // This shows the full outline/empty state as base, with meat colors appearing only in bottom half.
             return '<svg viewBox="0 0 1024 1024" class="dk-drumstick dk-drumstick-half">' +
                 '<defs>' +
                 '<clipPath id="' + clipId + '">' +
                 '<rect x="0" y="512" width="1024" height="512"/>' +
                 '</clipPath>' +
                 '</defs>' +
                 // Bone — identical in all states, fully visible (DRAWN FIRST = background)
                 '<path d="' + bone + '" fill="#F2F5FB" stroke="#004364" stroke-width="3"/>' +
                 // Outline/detail/eye layers — fully visible as base background (DRAWN SECOND)
                 '<path d="' + outlinePath + '" fill="#004364"/>' +
                 '<path d="' + detailPath + '" fill="#004364"/>' +
                 '<path d="' + eye + '" fill="#004364"/>' +
                 eyeDots +
                 // Body fills — clipped to bottom half only (DRAWN LAST = on top, showing meat colors in bottom half)
                 '<g clip-path="url(#' + clipId + ')">' +
                 '<path d="' + meatFill + '" fill="#DEEAF4"/>' +
                 '<path d="' + mainBody + '" fill="#DD9121"/>' +
                 '<path d="' + shadowFill + '" fill="#CE790A"/>' +
                 '</g>' +
                 '</svg>';
         }
        if (state === 'full') {
            // Complete drumstick: bone + all layers and colors from reference
            return '<svg viewBox="0 0 1024 1024" class="dk-drumstick dk-drumstick-full">' +
                // Bone — identical in all states
                '<path d="' + bone + '" fill="#F2F5FB" stroke="#004364" stroke-width="3"/>' +
                '<path d="' + meatFill + '" fill="#DEEAF4"/>' +
                '<path d="' + mainBody + '" fill="#DD9121"/>' +
                '<path d="' + shadowFill + '" fill="#CE790A"/>' +
                '<path d="' + outlinePath + '" fill="#004364"/>' +
                '<path d="' + detailPath + '" fill="#004364"/>' +
                '<path d="' + eye + '" fill="#004364"/>' +
                eyeDots +
                '</svg>';
        }
        // Empty — outlines only, no meat shadow layer. Bone identical to other states.
        return '<svg viewBox="0 0 1024 1024" class="dk-drumstick dk-drumstick-empty-svg">' +
            // Bone — identical in all states
            '<path d="' + bone + '" fill="#F2F5FB" stroke="#004364" stroke-width="3"/>' +
            // Outlines with thick strokes so visible at small scale (no shadow/meat layers)
            '<path d="' + meatFill + '" fill="none" stroke="#7a6a5a" stroke-width="24"/>' +
            '<path d="' + mainBody + '" fill="none" stroke="#b8760a" stroke-width="24"/>' +
            '<path d="' + outlinePath + '" fill="none" stroke="#004364" stroke-width="32"/>' +
            '<path d="' + detailPath + '" fill="none" stroke="#004364" stroke-width="24"/>' +
            '<path d="' + eye + '" fill="none" stroke="#004364" stroke-width="24"/>' +
            // Bone dots stay filled #004364 in all states
            eyeDots +
            '</svg>';
    };

    // ============================================================
    // Hydration Drop State & SVG
    // ============================================================

    /**
     * _getDropState — determine the visual state for a given hydration level at a specific drop index.
     * Hydration fills from right to left (index 2 first, then 1, down to 0).
     * Each water drop represents 2 hydration points.
     * @private
     * @param {number} hydration - Current hydration level (0-6).
     * @param {number} index - Water drop container index (0-2).
     * @returns {string} 'full', 'half', or 'empty'.
     */
    Donkeycraft.HungerBar.prototype._getDropState = function (hydration, index) {
        hydration = Math.max(0, Math.round(hydration));
        // Each water drop represents 2 hydration points.
        // Index 2 covers hydration values 5-6, index 1 covers 3-4, index 0 covers 0-2.
        var baseHydration = (NUM_HYDRATION_ICONS - 1 - index) * 2; // hydration value this drop starts at
        var remaining = hydration - baseHydration;
        if (remaining >= 2) return 'full';
        if (remaining === 1) return 'half';
        return 'empty';
    };

    /**
     * _getDropSVG — return SVG markup for a water drop in the given state.
     * Uses a water droplet shape with three visual states:
     *   full  — solid blue water drop with highlight
     *   half  — outline with bottom half filled (water level at middle)
     *   empty — outline only, no fill (appears as a hollow drop)
     * References clipPath defined in defs SVG (injected during _buildDOM).
     * @private
     * @param {string} state - 'full', 'half', or 'empty'.
     * @returns {string} SVG markup string.
     */
    Donkeycraft.HungerBar.prototype._getDropSVG = function (state) {
        // Water drop path — centered in 18x20 viewBox
        var dropPath = 'M9 1.5C9 1.5 2 9 2 13a7 7 0 0 0 14 0C16 9 9 1.5 9 1.5z';
        // Highlight/reflection on the left side of the drop
        var highlightPath = 'M5.5 12.5a4.5 4.5 0 0 0 4 4.4c-0.8-1.2-1.3-2.6-1.3-4.1 0-1.5 0.5-2.9 1.3-4.1a4.5 4.5 0 0 0-4 3.8z';
        var clipId = this._hydrationClipId;

        if (state === 'half') {
            // Pattern matches health-bar.js: outline drawn FIRST as background,
            // then colored body fill clipped to bottom half drawn on top.
            // This shows the full outline/empty state as base, with blue fill appearing only in bottom half.
            return '<svg viewBox="0 0 18 20" class="dk-drop dk-drop-half">' +
                '<defs>' +
                '<clipPath id="' + clipId + '">' +
                '<rect x="0" y="10" width="18" height="10"/>' +
                '</clipPath>' +
                '</defs>' +
                // Outline — drawn FIRST as background (the "empty" appearance)
                '<path d="' + dropPath + '" fill="none" stroke="#4a90d9" stroke-width="1.2" stroke-linejoin="round"/>' +
                // Highlight/reflection — fully visible on top of outline
                '<path d="' + highlightPath + '" fill="rgba(255,255,255,0.3)"/>' +
                // Body fill — clipped to bottom half only (DRAWN LAST = on top, showing blue in bottom half)
                '<g clip-path="url(#' + clipId + ')">' +
                '<path d="' + dropPath + '" fill="#3498db"/>' +
                '</g>' +
                '</svg>';
        }
        if (state === 'full') {
            // Complete water drop: blue fill, highlight, and outline
            return '<svg viewBox="0 0 18 20" class="dk-drop dk-drop-full">' +
                '<path d="' + dropPath + '" fill="#3498db"/>' +
                '<path d="' + highlightPath + '" fill="rgba(255,255,255,0.3)"/>' +
                '<path d="' + dropPath + '" fill="none" stroke="#4a90d9" stroke-width="1.2" stroke-linejoin="round"/>' +
                '</svg>';
        }
        // Empty — outline only, no fill
        return '<svg viewBox="0 0 18 20" class="dk-drop dk-drop-empty-svg">' +
            '<path d="' + dropPath + '" fill="none" stroke="#4a90d9" stroke-width="1.2" stroke-linejoin="round"/>' +
            '</svg>';
    };

    // ============================================================
    // Update Entry Point
    // ============================================================

    /**
     * updateFromFood — main entry point called on hunger:changed events.
     * Clamps food and hydration values to valid ranges, recalculates actual deltas after clamping,
     * then updates DOM for both hunger and hydration bars with animations.
     * @param {Object} data - { foodLevel, delta, hydration }.
     */
    Donkeycraft.HungerBar.prototype.updateFromFood = function (data) {
        var oldFood = this._prevFood;

        // Clamp food to valid range [0, MAX_FOOD]
        var newFood = Math.max(0, Math.min(MAX_FOOD, data.foodLevel != null ? data.foodLevel : oldFood));

        // Clamp hydration to valid range [0, MAX_HYDRATION]
        var newHydration = Math.max(0, Math.min(MAX_HYDRATION, data.hydration != null ? data.hydration : this._prevHydration));

        // Recalculate delta after clamping to ensure displayed +/- matches actual change
        var foodDelta = newFood - oldFood;

        // Update hunger drumsticks
        this._renderDrumsticks(newFood);

        // Update hydration drops
        this._renderDrops(newHydration);

        // Animate on food change (only if food level actually changed)
        if (foodDelta !== 0) {
            this._animateOnFoodChange(foodDelta, oldFood, newFood);
        }

        // Animate on hydration change (only if hydration actually changed)
        var hydrationDelta = newHydration - this._prevHydration;
        if (hydrationDelta !== 0) {
            this._animateOnHydrationChange(hydrationDelta, this._prevHydration, newHydration);
        }

        // Update brown overlay based on food percentage
        this._updateBrownOverlay(newFood);

        // Update blue overlay based on hydration percentage
        this._updateBlueOverlay(newHydration);

        // Update state tracking
        this._prevFood = newFood;
        this._prevHydration = newHydration;
    };

    // ============================================================
    // Hunger Rendering & Animation
    // ============================================================

    /**
     * _renderDrumsticks — update all 6 drumstick containers to reflect current food level.
     * Fills from right (index 5) to left (index 0), matching Minecraft's hunger behavior.
     * @private
     * @param {number} foodLevel - Current food level (0-12).
     */
    Donkeycraft.HungerBar.prototype._renderDrumsticks = function (foodLevel) {
        for (var i = 0; i < NUM_HUNGER_ICONS; i++) {
            var container = this._drumstickContainers[i];
            if (!container) continue;

            var state = this._getDrumstickState(foodLevel, i);

            // Update class and SVG
            container.className = 'dk-drumstick-container dk-drumstick-' + state;
            container.innerHTML = this._getDrumstickSVG(state);
        }
    };

    /**
     * _animateOnFoodChange — trigger animations based on food delta.
     * @private
     * @param {number} delta - Food change (positive = eating, negative = starving).
     * @param {number} oldFood - Food level before the change.
     * @param {number} newFood - Food level after the change.
     */
    Donkeycraft.HungerBar.prototype._animateOnFoodChange = function (delta, oldFood, newFood) {
        if (delta > 0) {
            // Eating — pulse the drumsticks that were filled
            this._pulseEatenDrumsticks(delta, oldFood, newFood);
        } else if (delta < 0) {
            // Starving — dim the drumsticks that were depleted (pass negative delta directly)
            this._dimDepletedDrumsticks(delta, oldFood, newFood);
        }
    };

    /**
     * _pulseEatenDrumsticks — pulse on the drumsticks that were just eaten.
     * Compares each drumstick's state at oldFood vs newFood and pulses only changed ones.
     * @private
     * @param {number} foodGain - Amount of food restored (positive).
     * @param {number} oldFood - Food level before eating.
     * @param {number} newFood - Food level after eating.
     */
    Donkeycraft.HungerBar.prototype._pulseEatenDrumsticks = function (foodGain, oldFood, newFood) {
        if (!this._barRow) return;

        var changedIndices = [];

        // Check each drumstick to see if its state changed between oldFood and newFood
        for (var i = 0; i < NUM_HUNGER_ICONS; i++) {
            var oldState = this._getDrumstickState(oldFood, i);
            var newState = this._getDrumstickState(newFood, i);
            if (oldState !== newState) {
                changedIndices.push(i);
            }
        }

        // Pulse each changed drumstick
        for (var j = 0; j < changedIndices.length; j++) {
            var idx = changedIndices[j];
            var container = this._drumstickContainers[idx];
            if (!container) continue;
            container.classList.add('dk-drumstick-eat-pulse');
            var self = this;
            setTimeout((function (el) {
                el.classList.remove('dk-drumstick-eat-pulse');
            }).bind(this, container), 400);
        }

        // Position text above the center of the changed range
        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHungerTextAt(foodGain, centerIdx);
        }
    };

    /**
     * _dimDepletedDrumsticks — dim the drumsticks that were depleted.
     * Compares each drumstick's state at oldFood vs newFood and dims only changed ones.
     * @private
     * @param {number} foodLoss - Amount of food lost (positive value).
     * @param {number} oldFood - Food level before starving.
     * @param {number} newFood - Food level after starving.
     */
    Donkeycraft.HungerBar.prototype._dimDepletedDrumsticks = function (delta, oldFood, newFood) {
        // delta is negative (e.g., -1, -5). Use directly for text display.
        if (!this._barRow) return;

        var changedIndices = [];

        // Check each drumstick to see if its state changed between oldFood and newFood
        for (var i = 0; i < NUM_HUNGER_ICONS; i++) {
            var oldState = this._getDrumstickState(oldFood, i);
            var newState = this._getDrumstickState(newFood, i);
            if (oldState !== newState) {
                changedIndices.push(i);
            }
        }

        // Dim each changed drumstick
        for (var j = 0; j < changedIndices.length; j++) {
            var idx = changedIndices[j];
            var container = this._drumstickContainers[idx];
            if (!container) continue;
            container.classList.add('dk-drumstick-dim');
            var self = this;
            setTimeout((function (el) {
                el.classList.remove('dk-drumstick-dim');
            }).bind(this, container), 300);
        }

        // Position text above the center of the changed range (delta is already negative)
        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHungerTextAt(delta, centerIdx);
        }
    };

    /**
     * _spawnHungerTextAt — spawn floating +/- text at a specific drumstick index.
     * @private
     * @param {number} delta - Food change (positive = eat, negative = starve).
     * @param {number} drumIndex - Index of the affected drumstick (0-5).
     */
    Donkeycraft.HungerBar.prototype._spawnHungerTextAt = function (delta, drumIndex) {
        if (!this._barRow || !this._drumstickContainers[drumIndex]) return;

        var textEl = document.createElement('div');
        textEl.className = 'dk-hunger-text';
        textEl.textContent = (delta > 0 ? '+' : '') + delta;
        textEl.style.color = delta > 0 ? '#d4a574' : '#8b6914';

        // Position above the changed drumstick container using relative positioning
        var drumContainer = this._drumstickContainers[drumIndex];
        drumContainer.style.position = 'relative';
        textEl.style.left = '50%';
        textEl.style.top = '-16px';
        textEl.style.transform = 'translateX(-50%)';

        drumContainer.appendChild(textEl);

        // Remove after animation completes
        setTimeout((function (el) {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }).bind(this, textEl), 800);
    };

    /**
     * _updateBrownOverlay — update the full-screen brown overlay opacity based on food level.
     * 66% opacity at 0 food → 0% opacity at 6 food → stays 0% above 6 food.
     * @private
     * @param {number} foodLevel - Current food level (0-12).
     */
    Donkeycraft.HungerBar.prototype._updateBrownOverlay = function (foodLevel) {
        if (!this._hungerOverlay) return;

        var f = Math.max(0, Math.min(MAX_FOOD, foodLevel));
        // 66% opacity at 0 food → 0% opacity at 6 food → stays 0% above 6 food
        var opacity = 0;
        if (f < 6) {
            opacity = 0.66 - ((f / 6) * 0.66); // 0.66 at f=0, 0 at f=6
        }
        this._hungerOverlay.style.opacity = Math.max(0, opacity);
    };

    // ============================================================
    // Hydration Rendering & Animation
    // ============================================================

    /**
     * _renderDrops — update all 3 water drop containers to reflect current hydration level.
     * Fills from right (index 2) to left (index 0), matching Minecraft's hunger behavior.
     * @private
     * @param {number} hydrationLevel - Current hydration level (0-6).
     */
    Donkeycraft.HungerBar.prototype._renderDrops = function (hydrationLevel) {
        for (var i = 0; i < NUM_HYDRATION_ICONS; i++) {
            var container = this._dropContainers[i];
            if (!container) continue;

            var state = this._getDropState(hydrationLevel, i);

            // Update class and SVG
            container.className = 'dk-drop-container dk-drop-' + state;
            container.innerHTML = this._getDropSVG(state);
        }
    };

    /**
     * _animateOnHydrationChange — trigger animations based on hydration delta.
     * Mirrors the hunger change animation logic: positive delta triggers drink pulse,
     * negative delta triggers dim depletion.
     * @private
     * @param {number} delta - Hydration change (positive = drinking, negative = dehydrating).
     * @param {number} oldHydration - Hydration level before the change.
     * @param {number} newHydration - Hydration level after the change.
     */
    Donkeycraft.HungerBar.prototype._animateOnHydrationChange = function (delta, oldHydration, newHydration) {
        if (delta > 0) {
            // Drinking — pulse the drops that were filled
            this._pulseDrankDrops(delta, oldHydration, newHydration);
        } else if (delta < 0) {
            // Dehydrating — dim the drops that were depleted (pass negative delta directly)
            this._dimDepletedDrops(delta, oldHydration, newHydration);
        }
    };

    /**
     * _pulseDrankDrops — pulse on the water drops that were just filled.
     * Compares each drop's state at oldHydration vs newHydration and pulses only changed ones.
     * @private
     * @param {number} hydrationGain - Amount of hydration restored (positive).
     * @param {number} oldHydration - Hydration level before drinking.
     * @param {number} newHydration - Hydration level after drinking.
     */
    Donkeycraft.HungerBar.prototype._pulseDrankDrops = function (hydrationGain, oldHydration, newHydration) {
        if (!this._barRow) return;

        var changedIndices = [];

        // Check each water drop to see if its state changed between oldHydration and newHydration
        for (var i = 0; i < NUM_HYDRATION_ICONS; i++) {
            var oldState = this._getDropState(oldHydration, i);
            var newState = this._getDropState(newHydration, i);
            if (oldState !== newState) {
                changedIndices.push(i);
            }
        }

        // Pulse each changed water drop
        for (var j = 0; j < changedIndices.length; j++) {
            var idx = changedIndices[j];
            var container = this._dropContainers[idx];
            if (!container) continue;
            container.classList.add('dk-drop-drink-pulse');
            var self = this;
            setTimeout((function (el) {
                el.classList.remove('dk-drop-drink-pulse');
            }).bind(this, container), 400);
        }

        // Position text above the center of the changed range
        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHydrationTextAt(hydrationGain, centerIdx);
        }
    };

    /**
     * _dimDepletedDrops — dim the water drops that were depleted.
     * Compares each drop's state at oldHydration vs newHydration and dims only changed ones.
     * @private
     * @param {number} hydrationLoss - Amount of hydration lost (positive value).
     * @param {number} oldHydration - Hydration level before dehydrating.
     * @param {number} newHydration - Hydration level after dehydrating.
     */
    Donkeycraft.HungerBar.prototype._dimDepletedDrops = function (delta, oldHydration, newHydration) {
        // delta is negative (e.g., -1, -5). Use directly for text display.
        if (!this._barRow) return;

        var changedIndices = [];

        // Check each water drop to see if its state changed between oldHydration and newHydration
        for (var i = 0; i < NUM_HYDRATION_ICONS; i++) {
            var oldState = this._getDropState(oldHydration, i);
            var newState = this._getDropState(newHydration, i);
            if (oldState !== newState) {
                changedIndices.push(i);
            }
        }

        // Dim each changed water drop
        for (var j = 0; j < changedIndices.length; j++) {
            var idx = changedIndices[j];
            var container = this._dropContainers[idx];
            if (!container) continue;
            container.classList.add('dk-drop-dim');
            var self = this;
            setTimeout((function (el) {
                el.classList.remove('dk-drop-dim');
            }).bind(this, container), 300);
        }

        // Position text above the center of the changed range (delta is already negative)
        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHydrationTextAt(delta, centerIdx);
        }
    };

    /**
     * _spawnHydrationTextAt — spawn floating +/- text at a specific water drop index.
     * @private
     * @param {number} delta - Hydration change (positive = drink, negative = dehydrate).
     * @param {number} dropIndex - Index of the affected water drop (0-2).
     */
    Donkeycraft.HungerBar.prototype._spawnHydrationTextAt = function (delta, dropIndex) {
        if (!this._barRow || !this._dropContainers[dropIndex]) return;

        var textEl = document.createElement('div');
        textEl.className = 'dk-hydration-text';
        textEl.textContent = (delta > 0 ? '+' : '') + delta;
        textEl.style.color = delta > 0 ? '#5dade2' : '#2c6f9e';

        // Position above the changed water drop container using relative positioning
        var dropContainer = this._dropContainers[dropIndex];
        dropContainer.style.position = 'relative';
        textEl.style.left = '50%';
        textEl.style.top = '-16px';
        textEl.style.transform = 'translateX(-50%)';

        dropContainer.appendChild(textEl);

        // Remove after animation completes
        setTimeout((function (el) {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }).bind(this, textEl), 800);
    };

    /**
     * _updateBlueOverlay — update the full-screen blue overlay opacity based on hydration level.
     * 66% opacity at 0 hydration → 0% opacity at 3 hydration → stays 0% above 3 hydration.
     * @private
     * @param {number} hydrationLevel - Current hydration level (0-6).
     */
    Donkeycraft.HungerBar.prototype._updateBlueOverlay = function (hydrationLevel) {
        if (!this._hydrationOverlay) return;

        var h = Math.max(0, Math.min(MAX_HYDRATION, hydrationLevel));
        // 66% opacity at 0 hydration → 0% opacity at 3 hydration → stays 0% above 3 hydration
        var opacity = 0;
        if (h < 3) {
            opacity = 0.66 - ((h / 3) * 0.66); // 0.66 at h=0, 0 at h=3
        }
        this._hydrationOverlay.style.opacity = Math.max(0, opacity);
    };

    // ============================================================
    // Cleanup
    // ============================================================

    /**
     * resetUI — clear all animations and effects for both hunger and hydration bars.
     */
    Donkeycraft.HungerBar.prototype.resetUI = function () {
        // Clear shake timeout
        if (this._shakeTimeout) clearTimeout(this._shakeTimeout);

        // Clear flash timeouts
        for (var i = 0; i < this._flashTimeouts.length; i++) {
            clearTimeout(this._flashTimeouts[i]);
        }
        this._flashTimeouts = [];

        // Remove animation classes from all drumsticks
        for (var j = 0; j < this._drumstickContainers.length; j++) {
            if (this._drumstickContainers[j]) {
                this._drumstickContainers[j].classList.remove('dk-drumstick-eat-pulse', 'dk-drumstick-dim');
            }
        }

        // Remove animation classes from all water drops
        for (var k = 0; k < this._dropContainers.length; k++) {
            if (this._dropContainers[k]) {
                this._dropContainers[k].classList.remove('dk-drop-drink-pulse', 'dk-drop-dim');
            }
        }

        // Reset overlays
        if (this._hungerOverlay) {
            this._hungerOverlay.style.opacity = '0';
        }
        if (this._hydrationOverlay) {
            this._hydrationOverlay.style.opacity = '0';
        }
    };

    /**
     * destroy — clean up all DOM and event listeners for both bars.
     * Removes overlays, clears container content (which also removes clipPath defs),
     * and unsubscribes from the EventBus.
     */
    Donkeycraft.HungerBar.prototype.destroy = function () {
        this.resetUI();

        // Unsubscribe from events
        var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
        if (globalBus && this._onHungerChanged) {
            try {
                globalBus.off('hunger:changed', this._onHungerChanged);
            } catch (e) { }
        }

        // Remove overlays from DOM
        if (this._hungerOverlay && this._hungerOverlay.parentNode) {
            this._hungerOverlay.parentNode.removeChild(this._hungerOverlay);
        }
        if (this._hydrationOverlay && this._hydrationOverlay.parentNode) {
            this._hydrationOverlay.parentNode.removeChild(this._hydrationOverlay);
        }

        // Clean up container (removes clipPath defs + bar rows)
        if (this._container) {
            this._container.innerHTML = '';
        }

        // Null out references
        this._hunger = null;
        this._container = null;
        this._barRow = null;
        this._drumstickContainers = [];
        this._hungerOverlay = null;
        this._dropContainers = [];
        this._hydrationOverlay = null;
        this._hungerClipId = null;
        this._hydrationClipId = null;
        this._onHungerChanged = null;
    };

})();