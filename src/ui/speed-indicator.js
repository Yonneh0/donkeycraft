// Donkeycraft — Speed Indicator Slider UI
// Horizontal slider with snap-to positions for movement speed control.
// Displays emoji icons and labels at each speed stop point.
// Supports click-to-snaps and drag-to-slide interaction.
//
// Speed modes:
// - Survival:    sneak 🐌 | walk 🚶 | run 🏃
// - Creative:    sneak 🐌 | walk 🚶 | run 🏃 | turbo 🚀
// - Flying:      normal 🕊️ | fast ⚡ | turbo 🚀 | ultra 💫
//
// @module SpeedIndicator
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var Config = Donkeycraft.Config;

  /**
   * SpeedIndicator — horizontal slider for movement speed selection.
   *
   * Replaces the old button-based speed indicator with a smooth slider
   * that snaps to predefined speed positions. The slider automatically
   * adapts its options based on game mode and flying state.
   *
   * **Speed modes:**
   * - Survival:    sneak 🐌 | walk 🚶 | run 🏃
   * - Creative:    sneak 🐌 | walk 🚶 | run 🏃 | turbo 🚀
   * - Flying:      normal 🕊️ | fast ⚡ | turbo 🚀 | ultra 💫
   *
   * @constructor
   * @param {HTMLElement} container - DOM element to append the indicator to.
   */
  Donkeycraft.SpeedIndicator = function (container) {
    this._container = container;
    this._movementSystem = null;
    this._player = null;

    /**
     * Current slider position (0-based index into speed definitions).
     * @type {number}
     * @private
     */
    this._sliderIndex = 1; // Default to 'walk' / 'normal'

    /**
     * Current game mode ('survival', 'creative', 'spectator').
     * @type {string}
     * @private
     */
    this._gameMode = 'survival';

    /**
     * Whether the player is currently flying.
     * @type {boolean}
     * @private
     */
    this._isFlying = false;

    /**
     * DOM element references.
     * @type {Object}
     * @private
     */
    this._elements = {
      indicator: null, // Main container
      track: null, // Slider track area
      thumb: null, // Sliding thumb indicator
      stops: [], // Array of stop point elements
    };

    /**
     * Drag state tracking.
     * @type {Object}
     * @private
     */
    this._dragState = {
      isDragging: false,
      startX: 0,
      trackLeft: 0,
      trackWidth: 0,
    };

    /**
     * Callback fired when slider value changes.
     * @type {Function|null}
     * @private
     */
    this._onSliderChange = null;

    /**
     * Unsubscribe function for game mode change event.
     * @type {Function|null}
     * @private
     */
    this._unsubscribeGameModeEvent = null;

    /**
     * Unsubscribe function for flying state change event.
     * @type {Function|null}
     * @private
     */
    this._unsubscribeFlyingEvent = null;

    // Build the DOM structure
    this._buildDOM();
  };

  /**
   * Speed definitions for each mode.
   *
   * Each entry contains:
   * - id: Unique identifier string
   * - emoji: Unicode emoji character
   * - label: Display text (uppercase)
   * - title: Tooltip description with speed info
   *
   * @type {Array<Object>}
   * @private
   */
  var SURVIVAL_SPEEDS = [
    {
      id: 'sneak',
      emoji: '\uD83D\uDC0C',
      label: 'SNEAK',
      title: 'Sneak — 2.0 b/s (slow walk)',
    },
    {
      id: 'walk',
      emoji: '\uD83D\uDEB6',
      label: 'WALK',
      title: 'Walk — 5.0 b/s (normal speed)',
    },
    {
      id: 'run',
      emoji: '\uD83C\uDFC3',
      label: 'RUN',
      title: 'Run — 7.8 b/s (sprint)',
    },
  ];

  var CREATIVE_SPEEDS = [
    {
      id: 'sneak',
      emoji: '\uD83D\uDC0C',
      label: 'SNEAK',
      title: 'Sneak — 2.0 b/s (slow walk)',
    },
    {
      id: 'walk',
      emoji: '\uD83D\uDEB6',
      label: 'WALK',
      title: 'Walk — 5.0 b/s (normal speed)',
    },
    {
      id: 'run',
      emoji: '\uD83C\uDFC3',
      label: 'RUN',
      title: 'Run — 7.8 b/s (sprint)',
    },
    {
      id: 'turbo',
      emoji: '\uD83D\uDE80',
      label: 'TURBO',
      title: 'Turbo — 20.0 b/s (4x walk speed)',
    },
  ];

  var FLYING_SPEEDS = [
    {
      id: 'normal',
      emoji: '\uD83D\uDDA5\uFE0F',
      label: 'NORMAL',
      title: 'Normal fly — 5.0 b/s',
    },
    {
      id: 'fast',
      emoji: '\u26A1',
      label: 'FAST',
      title: 'Fast fly — 10.0 b/s (2x normal)',
    },
    {
      id: 'turbo',
      emoji: '\uD83D\uDE80',
      label: 'TURBO',
      title: 'Turbo fly — 30.0 b/s (6x normal)',
    },
    {
      id: 'ultra',
      emoji: '\uD83D\uDCAF',
      label: 'ULTRA',
      title: 'Ultra fly — 60.0 b/s (12x normal)',
    },
  ];

  /**
   * Get the speed definitions array for the current mode.
   *
   * @private
   * @returns {Array<Object>} Speed definitions array.
   */
  var _getSpeedsForMode = function () {
    if (this._isFlying) {
      return FLYING_SPEEDS;
    }
    if (this._gameMode === 'creative') {
      return CREATIVE_SPEEDS;
    }
    return SURVIVAL_SPEEDS;
  };

  /**
   * _buildDOM — create the slider DOM structure.
   *
   * Creates:
   * - Main indicator container with rounded background
   * - Track element with subtle outline line
   * - Sliding thumb that highlights the current selection
   * - Stop points positioned along the track
   *
   * @private
   */
  Donkeycraft.SpeedIndicator.prototype._buildDOM = function () {
    var self = this;
    var container = this._container;

    if (!container) {
      Donkeycraft.Logger.error(
        'SpeedIndicator',
        'No container element provided'
      );
      return;
    }

    // Main indicator container
    var indicator = document.createElement('div');
    indicator.className = 'dk-speed-indicator';
    indicator.style.display = 'none';
    container.appendChild(indicator);
    this._elements.indicator = indicator;

    // Slider track
    var track = document.createElement('div');
    track.className = 'dk-speed-track';
    indicator.appendChild(track);
    this._elements.track = track;

    // Sliding thumb
    var thumb = document.createElement('div');
    thumb.className = 'dk-speed-thumb';
    track.appendChild(thumb);
    this._elements.thumb = thumb;

    // Event listeners for click and drag on the track
    track.addEventListener(
      'mousedown',
      function (e) {
        self._onMouseDown(e);
      }.bind(this)
    );
    indicator.addEventListener(
      'mousedown',
      function (e) {
        e.stopPropagation();
      }.bind(this)
    );

    // Touch support
    track.addEventListener(
      'touchstart',
      function (e) {
        self._onTouchStart(e);
      }.bind(this),
      { passive: false }
    );

    // Global mouse/touch move and up handlers
    document.addEventListener(
      'mousemove',
      function (e) {
        self._onMouseMove(e);
      }.bind(this)
    );
    document.addEventListener(
      'mouseup',
      function (e) {
        self._onMouseUp(e);
      }.bind(this)
    );
    document.addEventListener(
      'touchmove',
      function (e) {
        self._onTouchMove(e);
      }.bind(this),
      { passive: false }
    );
    document.addEventListener(
      'touchend',
      function (e) {
        self._onTouchEnd(e);
      }.bind(this)
    );
  };

  /**
   * _updateStops — rebuild the stop point elements based on current speed definitions.
   *
   * Removes existing stops and creates new ones for the current mode's speeds.
   * Positions stops evenly along the track.
   *
   * @private
   */
  Donkeycraft.SpeedIndicator.prototype._updateStops = function () {
    var self = this;
    var track = this._elements.track;
    var indicator = this._elements.indicator;

    if (!track || !indicator) return;

    var speeds = _getSpeedsForMode.call(this);
    if (!speeds) return;

    // Remove existing stop elements
    var existingStops = track.querySelectorAll('.dk-speed-stop');
    for (var i = 0; i < existingStops.length; i++) {
      track.removeChild(existingStops[i]);
    }
    this._elements.stops = [];

    // Create stop elements for each speed
    for (var s = 0; s < speeds.length; s++) {
      var speed = speeds[s];
      var stop = document.createElement('div');
      stop.className = 'dk-speed-stop';
      stop.setAttribute('data-index', s);
      stop.title = speed.title;

      // Icon (emoji)
      var icon = document.createElement('span');
      icon.className = 'dk-speed-stop-icon';
      icon.textContent = speed.emoji;

      // Label text
      var label = document.createElement('span');
      label.className = 'dk-speed-stop-label';
      label.textContent = speed.label;

      stop.appendChild(icon);
      stop.appendChild(label);
      track.appendChild(stop);

      this._elements.stops.push(stop);
    }

    // Position stops evenly along the track
    this._positionStops();

    // Update active state
    this._updateVisualState();
  };

  /**
   * _positionStops — position stop points evenly along the track.
   *
   * Calculates percentage positions for each stop point,
   * distributing them evenly with proper padding from edges.
   * Uses percentage-based positioning so it works even when
   * the indicator container is hidden (display: none).
   *
   * @private
   */
  Donkeycraft.SpeedIndicator.prototype._positionStops = function () {
    var stops = this._elements.stops;
    if (!stops || stops.length === 0) return;

    // Use percentage-based positioning — works regardless of display state
    var paddingPercent = 4; // Left/right padding as percentage
    var count = stops.length;

    for (var i = 0; i < count; i++) {
      // Distribute evenly: first stop at padding%, last at (100 - padding)%
      var percent;
      if (count === 1) {
        percent = 50;
      } else {
        percent =
          paddingPercent + (i / (count - 1)) * (100 - paddingPercent * 2);
      }
      stops[i].style.left = percent + '%';
    }

    // Position thumb at current index
    this._positionThumb();
  };

  /**
   * _positionThumb — position the slider thumb at the current index.
   *
   * @private
   */
  Donkeycraft.SpeedIndicator.prototype._positionThumb = function () {
    var thumb = this._elements.thumb;
    var stops = this._elements.stops;

    if (!thumb || !stops || stops.length === 0) return;

    var index = Math.max(0, Math.min(this._sliderIndex, stops.length - 1));
    var stop = stops[index];
    if (stop) {
      thumb.style.left = stop.style.left;
    }
  };

  /**
   * _getIndexFromPosition — convert a pixel X position to a slider index.
   *
   * @private
   * @param {number} x - Client X coordinate.
   * @returns {number} Snap-to index.
   */
  Donkeycraft.SpeedIndicator.prototype._getIndexFromPosition = function (x) {
    var stops = this._elements.stops;
    if (!stops || stops.length === 0) return this._sliderIndex;

    var indicator = this._elements.indicator;
    if (!indicator) return this._sliderIndex;

    var indicatorRect = indicator.getBoundingClientRect();
    var count = stops.length;

    // Find which stop is closest to the click position
    var closestIndex = 0;
    var closestDist = Infinity;

    for (var i = 0; i < count; i++) {
      var stopRect = stops[i].getBoundingClientRect();
      var stopCenter = stopRect.left + stopRect.width / 2 - indicatorRect.left;
      var dist = Math.abs(x - stopCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }

    return closestIndex;
  };

  /**
   * _setSliderIndex — set the slider to a specific index and notify changes.
   *
   * @private
   * @param {number} index - The index to snap to.
   * @param {boolean} [animate=true] - Whether to animate the thumb movement.
   */
  Donkeycraft.SpeedIndicator.prototype._setSliderIndex = function (
    index,
    animate
  ) {
    var stops = this._elements.stops;
    if (!stops || stops.length === 0) return;

    var newIndex = Math.max(0, Math.min(index, stops.length - 1));

    // Only fire change if the index actually changed
    if (newIndex !== this._sliderIndex) {
      this._sliderIndex = newIndex;

      // Notify movement system of the speed change
      if (this._onSliderChange) {
        var speeds = _getSpeedsForMode.call(this);
        if (speeds && speeds[newIndex]) {
          this._onSliderChange(newIndex, speeds[newIndex].id);
        }
      }
    }

    // Animate thumb to new position
    if (!animate) {
      var thumb = this._elements.thumb;
      if (thumb) {
        thumb.style.transition = 'none';
      }
    } else {
      var thumb2 = this._elements.thumb;
      if (thumb2) {
        thumb2.style.transition = '';
      }
    }

    this._positionThumb();
    this._updateVisualState();
  };

  /**
   * _updateVisualState — update active states on stop points and thumb.
   *
   * @private
   */
  Donkeycraft.SpeedIndicator.prototype._updateVisualState = function () {
    var stops = this._elements.stops;
    if (!stops) return;

    // Update stop active states
    for (var i = 0; i < stops.length; i++) {
      if (i === this._sliderIndex) {
        stops[i].classList.add('dk-active');
      } else {
        stops[i].classList.remove('dk-active');
      }
    }

    // Pulse animation on thumb
    var thumb = this._elements.thumb;
    if (thumb) {
      thumb.classList.remove('dk-pulse');
      void thumb.offsetWidth; // Force reflow to restart animation
      thumb.classList.add('dk-pulse');
    }
  };

  /**
   * _onMouseDown — handle mousedown on the track for click/drag.
   *
   * @private
   * @param {MouseEvent} e - The mouse down event.
   */
  Donkeycraft.SpeedIndicator.prototype._onMouseDown = function (e) {
    e.preventDefault();
    this._dragState.isDragging = true;
    this._dragState.startX = e.clientX;

    var indicator = this._elements.indicator;
    if (indicator) {
      indicator.classList.add('dk-dragging');
    }

    // Snap to the clicked position immediately
    var newIndex = this._getIndexFromPosition(e.clientX);
    this._setSliderIndex(newIndex);
  };

  /**
   * _onMouseMove — handle mouse move during drag.
   *
   * @private
   * @param {MouseEvent} e - The mouse move event.
   */
  Donkeycraft.SpeedIndicator.prototype._onMouseMove = function (e) {
    if (!this._dragState.isDragging) return;

    // We track drag but snap to nearest stop on release
    // This provides smooth visual feedback without constant snapping
  };

  /**
   * _onMouseUp — handle mouse up to end drag.
   *
   * @private
   * @param {MouseEvent} e - The mouse up event.
   */
  Donkeycraft.SpeedIndicator.prototype._onMouseUp = function (e) {
    if (!this._dragState.isDragging) return;

    this._dragState.isDragging = false;

    var indicator = this._elements.indicator;
    if (indicator) {
      indicator.classList.remove('dk-dragging');
    }

    // Snap to nearest stop point
    var newIndex = this._getIndexFromPosition(e.clientX);
    this._setSliderIndex(newIndex);
  };

  /**
   * _onTouchStart — handle touch start for mobile support.
   *
   * @private
   * @param {TouchEvent} e - The touch start event.
   */
  Donkeycraft.SpeedIndicator.prototype._onTouchStart = function (e) {
    if (!e.touches || e.touches.length === 0) return;
    e.preventDefault();

    this._dragState.isDragging = true;
    this._dragState.startX = e.touches[0].clientX;

    var indicator = this._elements.indicator;
    if (indicator) {
      indicator.classList.add('dk-dragging');
    }
  };

  /**
   * _onTouchMove — handle touch move during drag.
   *
   * @private
   * @param {TouchEvent} e - The touch move event.
   */
  Donkeycraft.SpeedIndicator.prototype._onTouchMove = function (e) {
    if (!this._dragState.isDragging || !e.touches || e.touches.length === 0)
      return;
    e.preventDefault();
    // Snap during drag for immediate feedback
    var newIndex = this._getIndexFromPosition(e.touches[0].clientX);
    this._setSliderIndex(newIndex);
  };

  /**
   * _onTouchEnd — handle touch end to finalize selection.
   *
   * @private
   * @param {TouchEvent} e - The touch end event.
   */
  Donkeycraft.SpeedIndicator.prototype._onTouchEnd = function (e) {
    if (!this._dragState.isDragging) return;

    this._dragState.isDragging = false;

    var indicator = this._elements.indicator;
    if (indicator) {
      indicator.classList.remove('dk-dragging');
    }
  };

  /**
   * setPlayer — set the player reference for game mode tracking.
   *
   * Subscribes to game mode and flying state change events using the global
   * EventBus for reliable cross-module communication. Replaces the old
   * polling-based approach with event-driven updates.
   *
   * @param {Donkeycraft.Player} player - Player entity instance.
   */
  Donkeycraft.SpeedIndicator.prototype.setPlayer = function (player) {
    var self = this;

    // Unsubscribe from previous events if any
    this._cleanupEvents();

    this._player = player;

    if (!player) return;

    // Subscribe to game mode changes via global EventBus
    try {
      this._unsubscribeGameModeEvent = Donkeycraft.EventBus.onSafe(
        'gameMode:changed',
        function (data) {
          if (data && data.newMode) {
            self._onGameModeChanged(data.newMode);
          }
        }
      );
    } catch (e) {
      Donkeycraft.Logger.warn(
        'SpeedIndicator',
        'Failed to subscribe to gameMode:changed: ' + e.message
      );
    }

    // Subscribe to flying state changes via global EventBus
    try {
      this._unsubscribeFlyingEvent = Donkeycraft.EventBus.onSafe(
        'flying:stateChanged',
        function (data) {
          if (typeof data.isFlying === 'boolean') {
            self._isFlying = data.isFlying;
            self._updateStops.call(self);
          }
        }
      );
    } catch (e) {
      Donkeycraft.Logger.warn(
        'SpeedIndicator',
        'Failed to subscribe to flying:stateChanged: ' + e.message
      );
    }

    // Initial update — determine starting game mode
    var initialMode = player.getGameMode ? player.getGameMode() : null;
    if (initialMode) {
      this._onGameModeChanged(initialMode);
    }
  };

  /**
   * _cleanupEvents — unsubscribe from all event listeners.
   *
   * @private
   */
  Donkeycraft.SpeedIndicator.prototype._cleanupEvents = function () {
    if (this._unsubscribeGameModeEvent) {
      try {
        this._unsubscribeGameModeEvent();
      } catch (e) {}
      this._unsubscribeGameModeEvent = null;
    }
    if (this._unsubscribeFlyingEvent) {
      try {
        this._unsubscribeFlyingEvent();
      } catch (e) {}
      this._unsubscribeFlyingEvent = null;
    }
  };

  /**
   * setMovementSystem — set the movement system reference.
   *
   * @param {Donkeycraft.Movement} movement - Movement system instance.
   */
  Donkeycraft.SpeedIndicator.prototype.setMovementSystem = function (movement) {
    this._movementSystem = movement;
  };

  /**
   * setOnSliderChange — set the callback fired when slider value changes.
   *
   * @param {Function} callback - Function(index, speedId) => void.
   */
  Donkeycraft.SpeedIndicator.prototype.setOnSliderChange = function (callback) {
    this._onSliderChange = typeof callback === 'function' ? callback : null;
  };

  /**
   * _onGameModeChanged — handle game mode change to update speed options.
   *
   * Called when the game mode changes via EventBus or directly. Updates the
   * indicator visibility, flying state, and rebuilds speed stop points.
   *
   * @private
   * @param {string} mode - 'survival', 'creative', or 'spectator'.
   */
  Donkeycraft.SpeedIndicator.prototype._onGameModeChanged = function (mode) {
    this._gameMode = mode;

    // Show indicator for survival and creative only; hide for spectator
    if (mode !== 'survival' && mode !== 'creative') {
      var indicator = this._elements.indicator;
      if (indicator) {
        indicator.style.display = 'none';
      }
      return;
    }

    // Show the indicator container
    var indicator = this._elements.indicator;
    if (indicator) {
      indicator.style.display = 'flex';
    }

    // Update flying state from player reference
    this._isFlying = false;
    if (this._player && this._player.flyEnabled) {
      this._isFlying = true;
    }

    // Apply flying-specific CSS class for color theming
    if (indicator) {
      if (this._isFlying) {
        indicator.classList.add('dk-flying');
      } else {
        indicator.classList.remove('dk-flying');
      }
    }

    // Rebuild stops for the new mode
    this._updateStops();
  };

  /**
   * update — called every frame during render to sync the indicator state.
   *
   * Performs two functions:
   * 1. Detect flying state changes from the player object (fallback for event-driven updates)
   * 2. Sync the active stop highlight with the movement system's current speed mode
   *
   * @param {string} activeMode - The actual active speed mode string from movement system
   *                               (e.g., 'sneak', 'walk', 'run', 'turbo', 'normal', 'fast', 'ultra').
   * @private
   */
  Donkeycraft.SpeedIndicator.prototype.update = function (activeMode) {
    if (!this._elements.indicator) return;

    // Guard: skip if not in a visible game mode
    if (this._gameMode !== 'survival' && this._gameMode !== 'creative') return;

    // Detect flying state change from player reference (event-driven is preferred)
    var wasFlying = this._isFlying;
    var expectedFlying = false;
    if (
      this._player &&
      this._player.flyEnabled &&
      this._gameMode === 'creative'
    ) {
      expectedFlying = true;
    }

    // If flying state changed and event didn't catch it, update manually
    if (wasFlying !== expectedFlying) {
      this._isFlying = expectedFlying;
      this._onGameModeChanged(this._gameMode);
      return;
    }

    // Sync active stop highlight with movement system's current speed mode
    var stops = this._elements.stops;
    if (!stops || !activeMode) return;

    for (var i = 0; i < stops.length; i++) {
      var speedId = null;
      var speeds = _getSpeedsForMode.call(this);
      if (speeds && speeds[i]) {
        speedId = speeds[i].id;
      }
      if (speedId === activeMode) {
        stops[i].classList.add('dk-active');
        // Sync slider index to match active mode
        if (i !== this._sliderIndex) {
          this._sliderIndex = i;
          this._positionThumb();
        }
      } else {
        stops[i].classList.remove('dk-active');
      }
    }
  };

  /**
   * setSliderValue — programmatically set the slider to a specific index.
   *
   * Called by external code (e.g., keybinds) to change speed without user interaction.
   *
   * @param {number} index - The index to set (0-based).
   */
  Donkeycraft.SpeedIndicator.prototype.setSliderValue = function (index) {
    if (!this._elements.stops || this._elements.stops.length === 0) return;
    var safeIndex = Math.max(
      0,
      Math.min(index, this._elements.stops.length - 1)
    );
    this._setSliderIndex(safeIndex);
  };

  /**
   * getSliderIndex — get the current slider index.
   *
   * @returns {number} Current slider index (0-based).
   */
  Donkeycraft.SpeedIndicator.prototype.getSliderIndex = function () {
    return this._sliderIndex;
  };

  /**
   * getCurrentSpeedId — get the current speed mode ID string.
   *
   * @returns {string} Current speed ID (e.g., 'sneak', 'walk', 'run', 'turbo').
   */
  Donkeycraft.SpeedIndicator.prototype.getCurrentSpeedId = function () {
    var speeds = _getSpeedsForMode.call(this);
    if (!speeds || !speeds[this._sliderIndex]) return '';
    return speeds[this._sliderIndex].id;
  };

  /**
   * destroy — clean up all DOM and event listeners.
   *
   * Removes the indicator from its parent container, unsubscribes from all
   * EventBus listeners, and clears internal references for garbage collection.
   */
  Donkeycraft.SpeedIndicator.prototype.destroy = function () {
    // Unsubscribe from events
    this._cleanupEvents();

    // Clean up DOM
    var indicator = this._elements.indicator;
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }

    // Clear references
    this._elements = {
      indicator: null,
      track: null,
      thumb: null,
      stops: [],
    };
    this._container = null;
    this._movementSystem = null;
    this._player = null;
    this._onSliderChange = null;
  };
})();
