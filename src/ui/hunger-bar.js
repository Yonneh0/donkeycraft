// Donkeycraft — Hunger & Hydration Bar UI
// Vertical proportional fill system matching health bar design.
// Hunger: 5 drumstick icons, each representing 10 points (total 50).
// Hydration: 2 water drop icons, each representing 10 points (total 20).
// Both bars fill from bottom to top in 10 steps per icon.
// Shake animation intensity increases as bars deplete.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var EventBus = Donkeycraft.EventBus;

    // ============================================================
    // Constants
    // ============================================================

    /**
     * MAX_FOOD — Maximum food level (50 points = 5 drumstick icons).
     * Each icon represents 10 food points, fills vertically in 10 steps.
     * @type {number}
     */
    var MAX_FOOD = 50;

    /**
     * NUM_HUNGER_ICONS — Number of hunger drumstick icons displayed.
     * @type {number}
     */
    var NUM_HUNGER_ICONS = 5;

    /**
     * MAX_HYDRATION — Maximum hydration level (20 points = 2 water drop icons).
     * Each icon represents 10 hydration points, fills vertically in 10 steps.
     * @type {number}
     */
    var MAX_HYDRATION = 20;

    /**
     * NUM_HYDRATION_ICONS — Number of hydration water drop icons displayed.
     * @type {number}
     */
    var NUM_HYDRATION_ICONS = 2;

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
     * Icons fill from right to left (index max first, then decreasing), so they deplete left to right.
     * Each icon fills vertically in 10 steps (matching health bar pattern).
     *
     * @param {HTMLElement} container - Parent container for hunger & hydration bar DOM.
     * @param {Donkeycraft.Hunger} hunger - Hunger instance to observe.
     */
    Donkeycraft.HungerBar = function (container, hunger) {
        this._hunger = hunger;
        this._container = container;

        // --- Unified hunger/hydration bar DOM references ---
        this._barRow = null;                    // .dk-hunger-hydration-bar (single row for all icons)
        this._drumstickContainers = [];         // Array of drumstick container elements (5)
        this._hungerOverlay = null;             // .dk-hunger-overlay (full-screen brown overlay)

        // --- Hydration bar DOM references ---
        this._dropContainers = [];              // Array of water drop container elements (2)
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
     * Builds a single unified row: 5 hunger drumsticks followed by 2 hydration drops.
     * Also injects unique clipPath definitions into the container for SVG clipping.
     * @private
     */
    Donkeycraft.HungerBar.prototype._buildDOM = function () {
        var container = this._container;
        if (!container) return;

        container.innerHTML = '';
        container.classList.add('dk-hunger-bar-wrapper');

        // Inject unique clipPath definitions for SVG clipping (prevents ID collisions).
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

        // Create 5 drumstick containers (index 0 = leftmost, index 4 = rightmost)
        for (var i = 0; i < NUM_HUNGER_ICONS; i++) {
            var drumContainer = document.createElement('div');
            drumContainer.className = 'dk-drumstick-container dk-drumstick-empty';
            drumContainer.innerHTML = this._getDrumstickSVG(0); // Start with 0 fill
            barRow.appendChild(drumContainer);
            this._drumstickContainers.push(drumContainer);
        }

        // Create 2 water drop containers (index 0 = leftmost, index 1 = rightmost)
        for (var j = 0; j < NUM_HYDRATION_ICONS; j++) {
            var dropContainer = document.createElement('div');
            dropContainer.className = 'dk-drop-container dk-drop-empty';
            dropContainer.innerHTML = this._getDropSVG(0); // Start with 0 fill
            barRow.appendChild(dropContainer);
            this._dropContainers.push(dropContainer);
        }

        container.appendChild(barRow);
        this._barRow = barRow;
    };

    /**
     * _createOverlays — create the brown (hunger) and blue (hydration) full-screen overlays.
     * @private
     */
    Donkeycraft.HungerBar.prototype._createOverlays = function () {
        // Brown overlay for low hunger
        var hungerOverlay = document.createElement('div');
        hungerOverlay.className = 'dk-hunger-overlay';
        document.body.appendChild(hungerOverlay);
        this._hungerOverlay = hungerOverlay;

        // Blue overlay for low hydration
        var hydrationOverlay = document.createElement('div');
        hydrationOverlay.className = 'dk-hydration-overlay';
        document.body.appendChild(hydrationOverlay);
        this._hydrationOverlay = hydrationOverlay;
    };

    // ============================================================
    // Fill Level Calculation (matches health bar pattern)
    // ============================================================

    /**
     * _getDrumstickFillLevel — determine the fill level (0-10) for a given food level at a specific drumstick index.
     * Icons fill from right to left (index 4 first → index 0 last), so they deplete left to right.
     * Each icon represents 10 food points and fills vertically in 10 steps.
     * @private
     * @param {number} food - Current total food level (0-50).
     * @param {number} index - Drumstick container index (0-4).
     * @returns {number} Fill level from 0 (empty) to 10 (full).
     */
    Donkeycraft.HungerBar.prototype._getDrumstickFillLevel = function (food, index) {
        food = Math.max(0, Math.round(food));
        var pointsPerIcon = 10;
        // Reverse order: rightmost icon (index 4) fills first, leftmost (index 0) depletes first
        var baseIndex = (NUM_HUNGER_ICONS - 1 - index);
        var startHP = baseIndex * pointsPerIcon;     // Food this icon starts at
        var endHP = startHP + pointsPerIcon;         // Food this icon ends at

        if (food <= startHP) return 0;               // Icon is empty
        if (food >= endHP) return 10;                // Icon is full
        return food - startHP;                       // Partial fill (1-9)
    };

    /**
     * _getDropFillLevel — determine the fill level (0-10) for a given hydration level at a specific drop index.
     * Icons fill from right to left (index 1 first → index 0 last), so they deplete left to right.
     * Each icon represents 10 hydration points and fills vertically in 10 steps.
     * @private
     * @param {number} hydration - Current total hydration level (0-20).
     * @param {number} index - Water drop container index (0-1).
     * @returns {number} Fill level from 0 (empty) to 10 (full).
     */
    Donkeycraft.HungerBar.prototype._getDropFillLevel = function (hydration, index) {
        hydration = Math.max(0, Math.round(hydration));
        var pointsPerIcon = 10;
        // Reverse order: rightmost icon (index 1) fills first, leftmost (index 0) depletes first
        var baseIndex = (NUM_HYDRATION_ICONS - 1 - index);
        var startHP = baseIndex * pointsPerIcon;
        var endHP = startHP + pointsPerIcon;

        if (hydration <= startHP) return 0;
        if (hydration >= endHP) return 10;
        return hydration - startHP;
    };

    // ============================================================
    // Hunger Icon SVG Generation (vertical proportional masking)
    // ============================================================

    /**
     * _getDrumstickSVG — return SVG markup for a drumstick with vertical proportional masking.
     * The drumstick fills from bottom to top based on fillLevel (0-10).
     * Uses the exact paths from the reference drumstick icon (1024x1024 viewBox).
     * @private
     * @param {number} fillLevel - Number of segments filled (0-10).
     * @returns {string} SVG markup string.
     */
    Donkeycraft.HungerBar.prototype._getDrumstickSVG = function (fillLevel) {
        fillLevel = Math.max(0, Math.min(10, Math.round(fillLevel)));

        // Calculate clip rectangle: height percentage and Y position (bottom-aligned)
        var fillPercent = fillLevel / 10;
        var clipHeight = fillPercent * 1024; // SVG viewBox height is 1024
        var clipY = 1024 - clipHeight;       // Bottom-aligned clip

        // Unique ID for clipPath to avoid conflicts
        var clipId = 'dk-hb-' + Math.random().toString(36).substr(2, 9);

        // Reference SVG paths extracted from ref/drumstick.svg
        var bone = 'M241 919.7c-9.3 4.2-19.4 6.3-29.9 6.1-18.3-0.4-35.2-7.9-47.9-21.1-9.8-10.2-16-22.9-18-36.6-13.6-2.7-26-9.5-35.8-19.7-26-27.2-25-70.6 2.2-96.6 24.3-23.2 61.4-24.9 87.6-5.7L343.8 608c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1L271 822c16.3 26.8 12.4 62.4-11.2 85-5.5 5.2-11.9 9.5-18.8 12.7z';
        var meatFill = 'M358.6 628.4c-6.3-6.6-26 3.7-21.1 8.9 6.6 6.9 7 3.9 13.4 12 12.7 15.9 3 25.2 0.2 27.8l-132 125.3c13.7 22.5 7.3 45.9-7.7 56.6-16.1 11.5-49 13.9-59.4 3.8 2.6 5.4 6.1 10.5 10.4 14.9 10.8 11.3 29.5 31.7 45.2 32.1 9 0.2 17.7-1.6 25.7-5.2 5.9-2.7 11.4-6.4 16.2-11 20.3-19.4 19.6-63.9 5.5-86.9l125-119.4c2.8-2.7 15.7-13.5 15-17.3-2.3-12.2-29.6-34.5-36.4-41.6z';
        var mainBody = 'M314.5 642.2l110.3-400.7s37-66.3 117.1-103.9 244.8-28.7 301.5 51.9C900 270.2 962 423.1 876.1 531.1S408.8 703.5 408.8 703.5L391 658.8l-30.7-24.3-45.8 7.7z';
        var shadowFill = 'M864.7 218.4C830.4 169.6 721 89 635.1 128.2c28.4 11.9 113.6 32.1 147.2 74.2 73.4 92 98.5 206.8 12.6 314.8-58.6 73.7-288 110.2-406.7 136.7l-3.8 56.6s392.8-50.9 478.8-159 58.1-252.4 1.5-333.1z';
        var outlinePath = 'M240 917.4c-9.3 4.2-19.4 6.3-29.9 6.1-18.3-0.4-35.2-7.9-47.9-21.1-9.8-10.2-16-22.9-18-36.6-13.6-2.7-26-9.5-35.8-19.7-26-27.2-25-70.6 2.2-96.6 24.3-23.2 61.4-24.9 87.6-5.7l144.6-138.1c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1L270 819.7c16.3 26.8 12.4 62.4-11.2 85-5.5 5.3-11.9 9.6-18.8 12.7z m-98.3-154c-3.9 1.8-7.5 4.2-10.7 7.3-15.6 14.9-16.1 39.6-1.3 55.2 7.4 7.8 17.5 12 28.4 11.9 4 0 7.9 1.6 10.7 4.5 2.8 2.9 4.2 6.8 4 10.9-0.6 10.9 3.2 21.2 10.6 28.9 7.2 7.5 16.9 11.8 27.3 12.1 10.4 0.2 20.3-3.6 27.9-10.8 15.6-14.9 16.1-39.6 1.3-55.2-5.6-5.9-5.4-15.1 0.5-20.7l141.9-135.6c-6.5-5.1-12.6-10.5-18.1-16.3-4.9-5.1-9.5-10.7-13.9-16.6L208.5 774.5c-2.9 2.8-6.8 4.2-10.8 4-4-0.2-7.8-2-10.4-5-0.3-0.3-1.2-1.5-1.6-2-11.7-12-29.5-14.8-44-8.1z';
        var detailPath = 'M771 634.4c-18.6 8.5-38.5 15.1-59.3 19.5l-348.6 73.8c-6.4 1.4-12.9-1.7-16-7.5-3.1-5.8-1.9-12.9 2.8-17.4l32.4-30.9c-6.5-5.1-12.6-10.5-18.1-16.3-4.9-5.1-9.5-10.7-13.9-16.6l-35.2 33.7c-4.7 4.5-11.9 5.4-17.6 2-5.6-3.3-8.4-10-6.8-16.3l90.9-349.8C414.8 180.9 530 94.4 661.9 98.4c152.7 4.5 275 132.5 272.5 285.2-1.8 110.6-66.5 206.6-163.4 250.8z m-363.5 54l298.2-63.1c115.5-24.5 197.6-124 199.4-242.1 2.2-136.8-107.3-251.4-244.1-255.4-118-3.5-221.3 73.9-250.9 188.2l-77.9 299.9 10.7-10.2c3.2-3.1 7.7-4.5 12.2-3.9 4.4 0.6 8.4 3.3 10.6 7.1 5.8 9.9 12.4 18.8 19.8 26.5 7.9 8.3 17.2 15.8 27.7 22.3 3.9 2.4 6.4 6.4 6.8 10.9 0.5 4.5-1.2 9-4.5 12.1l-8 7.7z';
        var eye = 'M474.4 627.1c-3.5 1.6-7.7 1.8-11.5 0.3-1.6-0.7-40.2-16.6-63.3-65.4-3.5-7.3-0.3-16.1 7-19.5 7.4-3.4 16.1-0.3 19.5 7 17.9 37.9 47.4 50.6 47.7 50.7 7.5 3 11.2 11.5 8.2 19.1-1.6 3.6-4.3 6.3-7.6 7.8z';
        var eyeDots = '<circle cx="485.8" cy="334.4" r="16.9" fill="#004364"/><circle cx="500.4" cy="246.1" r="16.9" fill="#004364"/><circle cx="606.6" cy="181.1" r="16.9" fill="#004364"/><circle cx="701.1" cy="211.4" r="16.9" fill="#004364"/><circle cx="588.7" cy="281.2" r="16.9" fill="#004364"/>';

        if (fillLevel === 0) {
            // Empty drumstick — dark outline only
            return '<svg viewBox="0 0 1024 1024" class="dk-drumstick dk-drumstick-empty-svg">' +
                '<path d="' + bone + '" fill="#F2F5FB" stroke="#004364" stroke-width="3"/>' +
                '<path d="' + meatFill + '" fill="none" stroke="#7a6a5a" stroke-width="24"/>' +
                '<path d="' + mainBody + '" fill="none" stroke="#b8760a" stroke-width="24"/>' +
                '<path d="' + outlinePath + '" fill="none" stroke="#004364" stroke-width="32"/>' +
                '<path d="' + detailPath + '" fill="none" stroke="#004364" stroke-width="24"/>' +
                '<path d="' + eye + '" fill="none" stroke="#004364" stroke-width="24"/>' +
                eyeDots +
                '</svg>';
        }

        // Drumstick with proportional vertical fill (bottom to top)
        return '<svg viewBox="0 0 1024 1024" class="dk-drumstick dk-drumstick-fill">' +
            '<defs>' +
            '<clipPath id="' + clipId + '">' +
            '<rect x="0" y="' + clipY + '" width="1024" height="' + clipHeight + '"/>' +
            '</clipPath>' +
            '</defs>' +
            // Dark outline (always visible underneath)
            '<path d="' + bone + '" fill="#F2F5FB" stroke="#004364" stroke-width="3"/>' +
            '<path d="' + meatFill + '" fill="none" stroke="#7a6a5a" stroke-width="24"/>' +
            '<path d="' + mainBody + '" fill="none" stroke="#b8760a" stroke-width="24"/>' +
            '<path d="' + outlinePath + '" fill="none" stroke="#004364" stroke-width="32"/>' +
            '<path d="' + detailPath + '" fill="none" stroke="#004364" stroke-width="24"/>' +
            '<path d="' + eye + '" fill="none" stroke="#004364" stroke-width="24"/>' +
            eyeDots +
            // Colored body fills — clipped to fill level (on top of outline)
            '<g clip-path="url(#' + clipId + ')">' +
            '<path d="' + meatFill + '" fill="#DEEAF4"/>' +
            '<path d="' + mainBody + '" fill="#DD9121"/>' +
            '<path d="' + shadowFill + '" fill="#CE790A"/>' +
            '</g>' +
            '</svg>';
    };

    // ============================================================
    // Hydration Drop SVG Generation (vertical proportional masking)
    // ============================================================

    /**
     * _getDropSVG — return SVG markup for a water drop with vertical proportional masking.
     * The drop fills from bottom to top based on fillLevel (0-10).
     * @private
     * @param {number} fillLevel - Number of segments filled (0-10).
     * @returns {string} SVG markup string.
     */
    Donkeycraft.HungerBar.prototype._getDropSVG = function (fillLevel) {
        fillLevel = Math.max(0, Math.min(10, Math.round(fillLevel)));

        // Calculate clip rectangle: height percentage and Y position (bottom-aligned)
        var fillPercent = fillLevel / 10;
        var clipHeight = fillPercent * 20; // SVG viewBox height is 20
        var clipY = 20 - clipHeight;       // Bottom-aligned clip

        // Unique ID for clipPath to avoid conflicts
        var clipId = 'dk-hb-' + Math.random().toString(36).substr(2, 9);

        // Water drop path — centered in 18x20 viewBox
        var dropPath = 'M9 1.5C9 1.5 2 9 2 13a7 7 0 0 0 14 0C16 9 9 1.5 9 1.5z';
        // Highlight/reflection on the left side of the drop
        var highlightPath = 'M5.5 12.5a4.5 4.5 0 0 0 4 4.4c-0.8-1.2-1.3-2.6-1.3-4.1 0-1.5 0.5-2.9 1.3-4.1a4.5 4.5 0 0 0-4 3.8z';

        if (fillLevel === 0) {
            // Empty drop — outline only
            return '<svg viewBox="0 0 18 20" class="dk-drop dk-drop-empty-svg">' +
                '<path d="' + dropPath + '" fill="none" stroke="#4a90d9" stroke-width="1.2" stroke-linejoin="round"/>' +
                '</svg>';
        }

        // Drop with proportional vertical fill (bottom to top)
        return '<svg viewBox="0 0 18 20" class="dk-drop dk-drop-fill">' +
            '<defs>' +
            '<clipPath id="' + clipId + '">' +
            '<rect x="-1" y="' + clipY + '" width="20" height="' + clipHeight + '"/>' +
            '</clipPath>' +
            '</defs>' +
            // Outline (always visible underneath)
            '<path d="' + dropPath + '" fill="none" stroke="#4a90d9" stroke-width="1.2" stroke-linejoin="round"/>' +
            // Blue fill — clipped to fill level
            '<g clip-path="url(#' + clipId + ')">' +
            '<path d="' + dropPath + '" fill="#3498db"/>' +
            '</g>' +
            // Highlight/reflection — fully visible on top
            '<path d="' + highlightPath + '" fill="rgba(255,255,255,0.3)"/>' +
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
     * _renderDrumsticks — update all 5 drumstick containers to reflect current food level.
     * Icons deplete from left (index 0) to right (index 4), each filling vertically in 10 steps.
     * @private
     * @param {number} foodLevel - Current food level (0-50).
     */
    Donkeycraft.HungerBar.prototype._renderDrumsticks = function (foodLevel) {
        for (var i = 0; i < NUM_HUNGER_ICONS; i++) {
            var container = this._drumstickContainers[i];
            if (!container) continue;

            var fillLevel = this._getDrumstickFillLevel(foodLevel, i);

            // Update class and SVG
            container.className = 'dk-drumstick-container';
            if (fillLevel === 10) {
                container.classList.add('dk-drumstick-full');
            } else if (fillLevel === 0) {
                container.classList.add('dk-drumstick-empty');
            } else {
                container.classList.add('dk-drumstick-partial');
            }
            container.innerHTML = this._getDrumstickSVG(fillLevel);
        }
    };

    /**
     * _renderDrops — update all 2 water drop containers to reflect current hydration level.
     * Icons deplete from left (index 0) to right (index 1), each filling vertically in 10 steps.
     * @private
     * @param {number} hydrationLevel - Current hydration level (0-20).
     */
    Donkeycraft.HungerBar.prototype._renderDrops = function (hydrationLevel) {
        for (var i = 0; i < NUM_HYDRATION_ICONS; i++) {
            var container = this._dropContainers[i];
            if (!container) continue;

            var fillLevel = this._getDropFillLevel(hydrationLevel, i);

            // Update class and SVG
            container.className = 'dk-drop-container';
            if (fillLevel === 10) {
                container.classList.add('dk-drop-full');
            } else if (fillLevel === 0) {
                container.classList.add('dk-drop-empty');
            } else {
                container.classList.add('dk-drop-partial');
            }
            container.innerHTML = this._getDropSVG(fillLevel);
        }
    };

    // ============================================================
    // Shake Animation System (escalating intensity)
    // ============================================================

    /**
     * _calculateShakeIntensity — determine shake intensity based on remaining percentage.
     * Returns an object with amplitude multiplier, iteration count, and animation duration.
     * Intensity increases progressively as bars deplete.
     * @private
     * @param {number} currentLevel - Current level value.
     * @param {number} maxLevel - Maximum level value.
     * @returns {{amplitude: number, iterations: number, duration: number}} Shake parameters.
     */
    Donkeycraft.HungerBar.prototype._calculateShakeIntensity = function (currentLevel, maxLevel) {
        var percentage = maxLevel > 0 ? (currentLevel / maxLevel) * 100 : 0;

        if (percentage <= 15) {
            // Critical (<15%): violent shake — large amplitude, many iterations, long duration
            return { amplitude: 6, iterations: 10, duration: 800 };
        } else if (percentage <= 30) {
            // Low (15-30%): strong shake
            return { amplitude: 4, iterations: 8, duration: 700 };
        } else if (percentage <= 50) {
            // Moderate-low (30-50%): moderate shake
            return { amplitude: 3, iterations: 6, duration: 600 };
        } else if (percentage <= 70) {
            // Mild (50-70%): light shake
            return { amplitude: 2, iterations: 5, duration: 500 };
        } else {
            // Safe (>70%): no shake
            return { amplitude: 0, iterations: 0, duration: 0 };
        }
    };

    /**
     * _triggerShake — apply shake animation to the bar row container.
     * Intensity increases progressively as bars deplete.
     * Uses Web Animations API for dynamic amplitude, iterations, and duration.
     * @private
     * @param {number} currentLevel - Current level value.
     * @param {number} maxLevel - Maximum level value.
     */
    Donkeycraft.HungerBar.prototype._triggerShake = function (currentLevel, maxLevel) {
        if (!this._barRow) return;

        // Clear any existing shake
        if (this._shakeTimeout) {
            clearTimeout(this._shakeTimeout);
        }

        var intensity = this._calculateShakeIntensity(currentLevel, maxLevel);

        if (intensity.amplitude === 0) return; // No shake needed

        // Add will-change for smoother animation
        this._barRow.style.willChange = 'transform';

        // Generate dynamic keyframes based on intensity
        // Start with a slight jolt forward first for more noticeable effect
        var keyframes = [
            { transform: 'translateX(0)', offset: 0 },
            { transform: 'translateX(' + (intensity.amplitude * 0.5) + 'px)', offset: 0.02 }
        ];

        for (var i = 1; i <= intensity.iterations * 2; i++) {
            var sign = i % 2 === 0 ? 1 : -1;
            keyframes.push({
                transform: 'translateX(' + (sign * intensity.amplitude) + 'px)',
                offset: Math.min(1, i / (intensity.iterations * 2))
            });
        }

        // End at zero
        keyframes.push({ transform: 'translateX(0)', offset: 1 });

        // Apply animation using Web Animations API for dynamic parameters
        var animation = this._barRow.animate(keyframes, {
            duration: intensity.duration,
            easing: 'ease-in-out',
            fill: 'forwards'
        });

        // Clean up will-change after animation completes
        animation.onfinish = (function(self) {
            if (self._barRow) {
                self._barRow.style.willChange = 'auto';
            }
        }).bind(this);

        var self = this;
        this._shakeTimeout = setTimeout(function () {
            if (self._barRow) {
                self._barRow.style.animation = 'none';
                void self._barRow.offsetWidth; // force reflow
                self._barRow.style.willChange = 'auto';
            }
        }, intensity.duration);
    };

    // ============================================================
    // Food Change Animation
    // ============================================================

    /**
     * _animateOnFoodChange — trigger animations based on food delta.
     * All subtractions trigger shake; healing triggers pulse animation.
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
            // Starving — shake + dim depleted drumsticks
            var absDelta = Math.abs(delta);
            this._triggerShake(newFood, MAX_FOOD);

            // Dim the drumsticks that were depleted
            this._dimDepletedDrumsticks(delta, oldFood, newFood);
        }
    };

    /**
     * _animateOnHydrationChange — trigger animations based on hydration delta.
     * All subtractions trigger shake; healing triggers pulse animation.
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
            // Dehydrating — shake + dim depleted drops
            var absDelta = Math.abs(delta);
            this._triggerShake(newHydration, MAX_HYDRATION);

            // Dim the drops that were depleted
            this._dimDepletedDrops(delta, oldHydration, newHydration);
        }
    };

    // ============================================================
    // Eating/Drinking Animations
    // ============================================================

    /**
     * _pulseEatenDrumsticks — pulse on the drumsticks that were just eaten.
     * Compares each drumstick's fill level at oldFood vs newFood and pulses only changed ones.
     * @private
     * @param {number} foodGain - Amount of food restored (positive).
     * @param {number} oldFood - Food level before eating.
     * @param {number} newFood - Food level after eating.
     */
    Donkeycraft.HungerBar.prototype._pulseEatenDrumsticks = function (foodGain, oldFood, newFood) {
        if (!this._barRow) return;

        var changedIndices = [];

        for (var i = 0; i < NUM_HUNGER_ICONS; i++) {
            var oldFill = this._getDrumstickFillLevel(oldFood, i);
            var newFill = this._getDrumstickFillLevel(newFood, i);
            if (oldFill !== newFill) {
                changedIndices.push(i);
            }
        }

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

        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHungerTextAt(foodGain, centerIdx);
        }
    };

    /**
     * _pulseDrankDrops — pulse on the water drops that were just filled.
     * Compares each drop's fill level at oldHydration vs newHydration and pulses only changed ones.
     * @private
     * @param {number} hydrationGain - Amount of hydration restored (positive).
     * @param {number} oldHydration - Hydration level before drinking.
     * @param {number} newHydration - Hydration level after drinking.
     */
    Donkeycraft.HungerBar.prototype._pulseDrankDrops = function (hydrationGain, oldHydration, newHydration) {
        if (!this._barRow) return;

        var changedIndices = [];

        for (var i = 0; i < NUM_HYDRATION_ICONS; i++) {
            var oldFill = this._getDropFillLevel(oldHydration, i);
            var newFill = this._getDropFillLevel(newHydration, i);
            if (oldFill !== newFill) {
                changedIndices.push(i);
            }
        }

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

        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHydrationTextAt(hydrationGain, centerIdx);
        }
    };

    // ============================================================
    // Depletion Animations (dim effect)
    // ============================================================

    /**
     * _dimDepletedDrumsticks — dim the drumsticks that were depleted.
     * @private
     * @param {number} delta - Food change (negative value).
     * @param {number} oldFood - Food level before starving.
     * @param {number} newFood - Food level after starving.
     */
    Donkeycraft.HungerBar.prototype._dimDepletedDrumsticks = function (delta, oldFood, newFood) {
        if (!this._barRow) return;

        var changedIndices = [];

        for (var i = 0; i < NUM_HUNGER_ICONS; i++) {
            var oldFill = this._getDrumstickFillLevel(oldFood, i);
            var newFill = this._getDrumstickFillLevel(newFood, i);
            if (oldFill !== newFill) {
                changedIndices.push(i);
            }
        }

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

        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHungerTextAt(delta, centerIdx);
        }
    };

    /**
     * _dimDepletedDrops — dim the water drops that were depleted.
     * @private
     * @param {number} delta - Hydration change (negative value).
     * @param {number} oldHydration - Hydration level before dehydrating.
     * @param {number} newHydration - Hydration level after dehydrating.
     */
    Donkeycraft.HungerBar.prototype._dimDepletedDrops = function (delta, oldHydration, newHydration) {
        if (!this._barRow) return;

        var changedIndices = [];

        for (var i = 0; i < NUM_HYDRATION_ICONS; i++) {
            var oldFill = this._getDropFillLevel(oldHydration, i);
            var newFill = this._getDropFillLevel(newHydration, i);
            if (oldFill !== newFill) {
                changedIndices.push(i);
            }
        }

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

        if (changedIndices.length > 0) {
            var centerIdx = Math.round((changedIndices[0] + changedIndices[changedIndices.length - 1]) / 2);
            this._spawnHydrationTextAt(delta, centerIdx);
        }
    };

    // ============================================================
    // Floating Text
    // ============================================================

    /**
     * _spawnHungerTextAt — spawn floating +/- text at a specific drumstick index.
     * @private
     * @param {number} delta - Food change (positive = eat, negative = starve).
     * @param {number} drumIndex - Index of the affected drumstick (0-4).
     */
    Donkeycraft.HungerBar.prototype._spawnHungerTextAt = function (delta, drumIndex) {
        if (!this._barRow || !this._drumstickContainers[drumIndex]) return;

        var textEl = document.createElement('div');
        textEl.className = 'dk-hunger-text';
        textEl.textContent = (delta > 0 ? '+' : '') + delta;
        textEl.style.color = delta > 0 ? '#d4a574' : '#8b6914';

        var drumContainer = this._drumstickContainers[drumIndex];
        drumContainer.style.position = 'relative';
        textEl.style.left = '50%';
        textEl.style.top = '-16px';
        textEl.style.transform = 'translateX(-50%)';

        drumContainer.appendChild(textEl);

        setTimeout((function (el) {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }).bind(this, textEl), 800);
    };

    /**
     * _spawnHydrationTextAt — spawn floating +/- text at a specific water drop index.
     * @private
     * @param {number} delta - Hydration change (positive = drink, negative = dehydrate).
     * @param {number} dropIndex - Index of the affected water drop (0-1).
     */
    Donkeycraft.HungerBar.prototype._spawnHydrationTextAt = function (delta, dropIndex) {
        if (!this._barRow || !this._dropContainers[dropIndex]) return;

        var textEl = document.createElement('div');
        textEl.className = 'dk-hydration-text';
        textEl.textContent = (delta > 0 ? '+' : '') + delta;
        textEl.style.color = delta > 0 ? '#5dade2' : '#2c6f9e';

        var dropContainer = this._dropContainers[dropIndex];
        dropContainer.style.position = 'relative';
        textEl.style.left = '50%';
        textEl.style.top = '-16px';
        textEl.style.transform = 'translateX(-50%)';

        dropContainer.appendChild(textEl);

        setTimeout((function (el) {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }).bind(this, textEl), 800);
    };

    // ============================================================
    // Overlay Updates
    // ============================================================

    /**
     * _updateBrownOverlay — update the full-screen brown overlay opacity based on food level.
     * 66% opacity at 0 food → 0% opacity at 25 food → stays 0% above 25 food.
     * @private
     * @param {number} foodLevel - Current food level (0-50).
     */
    Donkeycraft.HungerBar.prototype._updateBrownOverlay = function (foodLevel) {
        if (!this._hungerOverlay) return;

        var f = Math.max(0, Math.min(MAX_FOOD, foodLevel));
        // 66% opacity at 0 food → 0% opacity at 25 food (50%)
        var opacity = 0;
        if (f < 25) {
            opacity = 0.66 - ((f / 25) * 0.66); // 0.66 at f=0, 0 at f=25
        }
        this._hungerOverlay.style.opacity = Math.max(0, opacity);
    };

    /**
     * _updateBlueOverlay — update the full-screen blue overlay opacity based on hydration level.
     * 66% opacity at 0 hydration → 0% opacity at 10 hydration (50%) → stays 0% above 10.
     * @private
     * @param {number} hydrationLevel - Current hydration level (0-20).
     */
    Donkeycraft.HungerBar.prototype._updateBlueOverlay = function (hydrationLevel) {
        if (!this._hydrationOverlay) return;

        var h = Math.max(0, Math.min(MAX_HYDRATION, hydrationLevel));
        // 66% opacity at 0 hydration → 0% opacity at 10 hydration (50%)
        var opacity = 0;
        if (h < 10) {
            opacity = 0.66 - ((h / 10) * 0.66); // 0.66 at h=0, 0 at h=10
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
        if (this._shakeTimeout) clearTimeout(this._shakeTimeout);

        for (var i = 0; i < this._flashTimeouts.length; i++) {
            clearTimeout(this._flashTimeouts[i]);
        }
        this._flashTimeouts = [];

        for (var j = 0; j < this._drumstickContainers.length; j++) {
            if (this._drumstickContainers[j]) {
                this._drumstickContainers[j].classList.remove('dk-drumstick-eat-pulse', 'dk-drumstick-dim');
            }
        }

        for (var k = 0; k < this._dropContainers.length; k++) {
            if (this._dropContainers[k]) {
                this._dropContainers[k].classList.remove('dk-drop-drink-pulse', 'dk-drop-dim');
            }
        }

        if (this._hungerOverlay) {
            this._hungerOverlay.style.opacity = '0';
        }
        if (this._hydrationOverlay) {
            this._hydrationOverlay.style.opacity = '0';
        }
    };

    /**
     * destroy — clean up all DOM and event listeners for both bars.
     */
    Donkeycraft.HungerBar.prototype.destroy = function () {
        this.resetUI();

        var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
        if (globalBus && this._onHungerChanged) {
            try {
                globalBus.off('hunger:changed', this._onHungerChanged);
            } catch (e) { }
        }

        if (this._hungerOverlay && this._hungerOverlay.parentNode) {
            this._hungerOverlay.parentNode.removeChild(this._hungerOverlay);
        }
        if (this._hydrationOverlay && this._hydrationOverlay.parentNode) {
            this._hydrationOverlay.parentNode.removeChild(this._hydrationOverlay);
        }

        if (this._container) {
            this._container.innerHTML = '';
        }

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