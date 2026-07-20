// Donkeycraft — Loading Screen (Checklist Design)
// DOM-based loading screen with per-phase checklist, animated mini progress bars,
// phase timing, and overall completion percentage.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * LoadingScreenTips — loading tips displayed during initialization.
   */
  Donkeycraft.LoadingScreenTips = [
    'Break stone with a pickaxe',
    'Craft wooden planks from logs',
    'Build shelter before nightfall',
    'Pistons can push up to 12 blocks',
    'Redstone torches emit signal level 15',
    'Creeper hisses before exploding',
    'Endermen teleport when hit',
    'Fishing can yield XP and enchantments',
    'Obsidian is resistant to explosions',
    'Diamond ore generates deep underground',
    'Slime blocks bounce entities',
    'Hoppers can collect items from chests',
    'Note blocks play different notes based on height',
    'Lever can power redstone devices',
    'Buttons can be pressed to open doors',
  ];

  /**
   * Phase metadata for display names and ordering.
   */
  var PHASE_ORDER = ['config', 'indexeddb', 'texture-atlas'];
  var PHASE_LABELS = {
    config: 'Validating configuration',
    indexeddb: 'Initializing storage',
    'texture-atlas': 'Generating textures',
  };

  /**
   * LoadingScreen — checklist-based loading screen UI.
   * @param {HTMLElement} [container] - Container element to append the loading screen to.
   */
  Donkeycraft.LoadingScreen = function (container) {
    this._container = container || document.body;
    this._element = null;
    this._percentEl = null;
    this._messageEl = null;
    this._overallBar = null;
    this._checklist = null;
    this._errorEl = null;
    this._historyEl = null;
    this._disposed = false;

    // Phase state tracking
    this._phases = {}; // { phaseName: { status: 'pending'|'active'|'complete'|'error', progress: 0-100, startTime: ms, subMessage: '' } }

    this._create();
  };

  /**
   * _formatDuration — format milliseconds into a human-readable string.
   * @private
   * @param {number} ms - Duration in milliseconds.
   * @returns {string} Formatted duration (e.g., "1.2s", "342ms").
   */
  Donkeycraft.LoadingScreen.prototype._formatDuration = function (ms) {
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  };

  /**
   * _getPhaseStatus — get the current status icon for a phase.
   * @private
   * @param {string} status - Phase status string.
   * @returns {string} HTML entity for the icon.
   */
  Donkeycraft.LoadingScreen.prototype._getPhaseIcon = function (status) {
    switch (status) {
      case 'pending': return '<span class="dk-phase-icon">○</span>';
      case 'active': return '<span class="dk-phase-icon">●</span>';
      case 'complete': return '<span class="dk-phase-icon">✓</span>';
      case 'error': return '<span class="dk-phase-icon">✗</span>';
      default: return '<span class="dk-phase-icon">○</span>';
    }
  };

  /**
   * _create — build the checklist loading screen DOM structure.
   * @private
   */
  Donkeycraft.LoadingScreen.prototype._create = function () {
    var self = this;
    this._element = document.createElement('div');
    this._element.className = 'dk-loading-screen';

    // Title
    var title = document.createElement('div');
    title.className = 'dk-loading-title';
    title.textContent = 'Donkeycraft';
    this._element.appendChild(title);

    // Percentage text
    this._percentEl = document.createElement('div');
    this._percentEl.className = 'dk-loading-percent';
    this._percentEl.textContent = '0%';
    this._element.appendChild(this._percentEl);

    // Overall progress bar
    var overallWrap = document.createElement('div');
    overallWrap.className = 'dk-loading-overall-container';
    this._overallBar = document.createElement('div');
    this._overallBar.className = 'dk-loading-overall';
    this._overallBar.style.width = '0%';
    overallWrap.appendChild(this._overallBar);
    this._element.appendChild(overallWrap);

    // Status message
    this._messageEl = document.createElement('div');
    this._messageEl.className = 'dk-loading-message';
    this._messageEl.textContent = 'Starting initialization...';
    this._element.appendChild(this._messageEl);

    // Checklist container
    this._checklist = document.createElement('div');
    this._checklist.className = 'dk-loading-checklist';

    // Create phase items for each known phase
    var self2 = this;
    PHASE_ORDER.forEach(function (phaseName) {
      var item = document.createElement('div');
      item.className = 'dk-checklist-item';
      item.setAttribute('data-phase', phaseName);

      // Icon
      var icon = document.createElement('span');
      icon.className = 'dk-phase-icon';
      icon.textContent = '○';
      item.appendChild(icon);

      // Phase info
      var info = document.createElement('div');
      info.className = 'dk-phase-info';

      var nameEl = document.createElement('div');
      nameEl.className = 'dk-phase-name';
      nameEl.textContent = PHASE_LABELS[phaseName] || phaseName;
      info.appendChild(nameEl);

      var subEl = document.createElement('div');
      subEl.className = 'dk-phase-sub';
      subEl.textContent = 'Waiting...';
      info.appendChild(subEl);

      item.appendChild(info);

      // Mini progress bar
      var progressWrap = document.createElement('div');
      progressWrap.className = 'dk-phase-progress-wrap';
      var progressBar = document.createElement('div');
      progressBar.className = 'dk-phase-progress';
      progressBar.style.width = '0%';
      progressWrap.appendChild(progressBar);
      item.appendChild(progressWrap);

      // Duration display
      var durationEl = document.createElement('span');
      durationEl.className = 'dk-phase-duration';
      durationEl.textContent = '';
      item.appendChild(durationEl);

      self2._checklist.appendChild(item);

      // Store references for later updates
      self2._phases[phaseName] = {
        element: item,
        iconEl: icon,
        nameEl: nameEl,
        subEl: subEl,
        progressEl: progressBar,
        durationEl: durationEl,
        status: 'pending',
        progress: 0,
        startTime: null,
      };
    });

    this._element.appendChild(this._checklist);

    // Loading history panel (shown after all phases complete)
    this._historyEl = document.createElement('div');
    this._historyEl.className = 'dk-loading-steps';
    this._element.appendChild(this._historyEl);

    // Error display
    this._errorEl = document.createElement('div');
    this._errorEl.className = 'dk-loading-error';
    this._errorEl.textContent = '';
    this._element.appendChild(this._errorEl);

    // Append to container
    this._container.appendChild(this._element);
  };

  /**
   * _updatePhaseUI — update the DOM for a specific phase item.
   * @private
   * @param {string} phaseName - Phase name.
   */
  Donkeycraft.LoadingScreen.prototype._updatePhaseUI = function (phaseName) {
    var phase = this._phases[phaseName];
    if (!phase) return;

    var status = phase.status;
    var p = phase.progress;

    // Update class
    phase.element.className = 'dk-checklist-item' +
      (status === 'active' ? ' active' : '') +
      (status === 'complete' ? ' complete' : '') +
      (status === 'error' ? ' error' : '');

    // Update icon
    phase.iconEl.textContent = status === 'pending' ? '○' :
                               status === 'active' ? '●' :
                               status === 'complete' ? '✓' : '✗';

    // Update progress bar
    phase.progressEl.style.width = p + '%';

    // Update duration if complete or error
    if (status === 'complete' || status === 'error') {
      var elapsed = performance.now() - (phase.startTime || performance.now());
      phase.durationEl.textContent = this._formatDuration(elapsed);
    } else if (status === 'active') {
      var elapsed2 = performance.now() - (phase.startTime || performance.now());
      phase.durationEl.textContent = this._formatDuration(elapsed2);
    } else {
      phase.durationEl.textContent = '';
    }
  };

  /**
   * _updateOverallProgress — recalculate and update the overall progress percentage.
   * @private
   */
  Donkeycraft.LoadingScreen.prototype._updateOverallProgress = function () {
    if (this._disposed) return;

    var totalPhases = PHASE_ORDER.length;
    var completedCount = 0;
    var totalProgress = 0;

    for (var i = 0; i < PHASE_ORDER.length; i++) {
      var phase = this._phases[PHASE_ORDER[i]];
      if (!phase) continue;

      if (phase.status === 'complete') {
        completedCount++;
        totalProgress += 100;
      } else if (phase.status === 'active' || phase.status === 'error') {
        totalProgress += phase.progress;
      }
    }

    // Add completed phases as full marks
    var overall = (totalProgress / totalPhases);
    overall = Math.max(0, Math.min(100, Math.round(overall)));

    if (this._percentEl) this._percentEl.textContent = overall + '%';
    if (this._overallBar) this._overallBar.style.width = overall + '%';
  };

  /**
   * updateProgress — set overall progress percentage (0-100).
   * @param {number} percent - Progress percentage (clamped 0-100).
   */
  Donkeycraft.LoadingScreen.prototype.updateProgress = function (percent) {
    if (this._disposed) return;
    var p = Math.max(0, Math.min(100, percent));
    if (this._percentEl) this._percentEl.textContent = p + '%';
    if (this._overallBar) this._overallBar.style.width = p + '%';
  };

  /**
   * setMessage — set the loading message text.
   * @param {string} message - Message to display.
   */
  Donkeycraft.LoadingScreen.prototype.setMessage = function (message) {
    if (this._disposed || !this._messageEl) return;
    this._messageEl.textContent = message;
  };

  /**
   * handlePhaseStart — called when an init phase starts.
   * @param {Object} data - Phase data with { phase } name.
   */
  Donkeycraft.LoadingScreen.prototype.handlePhaseStart = function (data) {
    if (this._disposed) return;

    var phaseName = data.phase || 'unknown';
    if (!this._phases[phaseName]) {
      // Unknown phase — create a dynamic entry
      this._createDynamicPhase(phaseName);
    }

    var phase = this._phases[phaseName];
    phase.status = 'active';
    phase.progress = 0;
    phase.startTime = performance.now();
    phase.subMessage = '';

    this._updatePhaseUI(phaseName);
    this._updateOverallProgress();

    var label = PHASE_LABELS[phaseName] || phaseName;
    this.setMessage('Initializing ' + label.toLowerCase() + '...');
  };

  /**
   * handlePhaseEnd — called when an init phase completes.
   * @param {Object} data - Phase data with { phase } name.
   */
  Donkeycraft.LoadingScreen.prototype.handlePhaseEnd = function (data) {
    if (this._disposed) return;

    var phaseName = data.phase || 'unknown';
    if (!this._phases[phaseName]) return;

    var phase = this._phases[phaseName];
    phase.status = 'complete';
    phase.progress = 100;

    var elapsed = performance.now() - (phase.startTime || performance.now());
    phase.durationEl.textContent = this._formatDuration(elapsed);

    this._updatePhaseUI(phaseName);
    this._updateOverallProgress();

    // Show history panel on first completion
    if (!this._historyVisible) {
      this._historyVisible = true;
      if (this._historyEl) this._historyEl.classList.add('visible');
    }

    // Add to history
    this._addHistoryEntry(PHASE_LABELS[phaseName] || phaseName, elapsed);
  };

  /**
   * _createDynamicPhase — create a checklist item for an unknown phase.
   * @private
   * @param {string} phaseName - Phase name.
   */
  Donkeycraft.LoadingScreen.prototype._createDynamicPhase = function (phaseName) {
    var label = PHASE_LABELS[phaseName] || phaseName.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });

    this._phases[phaseName] = {
      element: null,
      iconEl: null,
      nameEl: null,
      subEl: null,
      progressEl: null,
      durationEl: null,
      status: 'pending',
      progress: 0,
      startTime: null,
    };

    var item = document.createElement('div');
    item.className = 'dk-checklist-item';
    item.setAttribute('data-phase', phaseName);

    var icon = document.createElement('span');
    icon.className = 'dk-phase-icon';
    icon.textContent = '○';
    item.appendChild(icon);

    var info = document.createElement('div');
    info.className = 'dk-phase-info';

    var nameEl = document.createElement('div');
    nameEl.className = 'dk-phase-name';
    nameEl.textContent = label;
    info.appendChild(nameEl);

    var subEl = document.createElement('div');
    subEl.className = 'dk-phase-sub';
    subEl.textContent = 'Waiting...';
    info.appendChild(subEl);

    item.appendChild(info);

    var progressWrap = document.createElement('div');
    progressWrap.className = 'dk-phase-progress-wrap';
    var progressBar = document.createElement('div');
    progressBar.className = 'dk-phase-progress';
    progressBar.style.width = '0%';
    progressWrap.appendChild(progressBar);
    item.appendChild(progressWrap);

    var durationEl = document.createElement('span');
    durationEl.className = 'dk-phase-duration';
    durationEl.textContent = '';
    item.appendChild(durationEl);

    this._checklist.appendChild(item);

    this._phases[phaseName] = {
      element: item,
      iconEl: icon,
      nameEl: nameEl,
      subEl: subEl,
      progressEl: progressBar,
      durationEl: durationEl,
      status: 'pending',
      progress: 0,
      startTime: null,
    };
  };

  /**
   * _addHistoryEntry — add a timing entry to the loading history.
   * @private
   * @param {string} label - Description of the stage.
   * @param {number} duration - Duration in milliseconds.
   */
  Donkeycraft.LoadingScreen.prototype._addHistoryEntry = function (label, duration) {
    if (!this._historyEl) return;

    var entry = document.createElement('div');
    entry.className = 'dk-loading-step complete';

    var icon = document.createElement('span');
    icon.className = 'dk-loading-step-icon';
    icon.textContent = '✓';

    var text = document.createElement('span');
    text.className = 'dk-loading-step-text';
    text.textContent = label + ' — ' + this._formatDuration(duration);

    entry.appendChild(icon);
    entry.appendChild(text);
    this._historyEl.appendChild(entry);
  };

  /**
   * handleSubPhase — called for granular sub-phase progress within a phase.
   * @param {Object} data - Sub-phase data with { phase, subPhase, message, progress }.
   */
  Donkeycraft.LoadingScreen.prototype.handleSubPhase = function (data) {
    if (this._disposed) return;

    // Update the main status message with the sub-phase description
    if (data.message) {
      this.setMessage(data.message);
    }

    // If a phase is specified, update that phase's progress bar
    if (data.phase && this._phases[data.phase]) {
      var phase = this._phases[data.phase];
      phase.status = 'active';
      if (typeof data.progress === 'number') {
        phase.progress = Math.max(0, Math.min(100, data.progress));
      }
      if (data.subPhase) {
        phase.subEl.textContent = data.subPhase;
      }
      phase.subEl.textContent = data.message || '';
      this._updatePhaseUI(data.phase);
      this._updateOverallProgress();
    } else if (typeof data.progress === 'number') {
      // Fallback: update overall progress directly
      this.updateProgress(data.progress);
    }
  };

  /**
   * handleProgress — called for fine-grained overall progress updates.
   * @param {Object} data - Progress data with { percent, message }.
   */
  Donkeycraft.LoadingScreen.prototype.handleProgress = function (data) {
    if (this._disposed) return;

    if (typeof data.percent === 'number') {
      this.updateProgress(data.percent);
    }
    if (data.message) {
      this.setMessage(data.message);
    }
  };

  /**
   * showError — display error state.
   * @param {string} errorMessage - Error message to display.
   */
  Donkeycraft.LoadingScreen.prototype.showError = function (errorMessage) {
    if (this._disposed) return;

    // Show error in main display area
    this._errorEl.style.display = 'block';
    this._errorEl.textContent = 'ERROR: ' + errorMessage;

    // Update message color
    if (this._messageEl) {
      this._messageEl.textContent = 'Failed to initialize';
      this._messageEl.classList.add('dk-loading-message-error');
    }

    // Mark any active phases as errors
    for (var key in this._phases) {
      if (this._phases.hasOwnProperty(key) && this._phases[key].status === 'active') {
        this._phases[key].status = 'error';
        this._updatePhaseUI(key);
      }
    }
  };

  /**
   * hide — remove loading screen from DOM.
   */
  Donkeycraft.LoadingScreen.prototype.hide = function () {
    if (this._disposed || !this._element) return;
    if (this._element.parentNode) {
      this._element.parentNode.removeChild(this._element);
    }
  };

  /**
   * dispose — remove DOM elements and free references.
   */
  Donkeycraft.LoadingScreen.prototype.dispose = function () {
    this.hide();
    this._disposed = true;
    this._element = null;
    this._percentEl = null;
    this._messageEl = null;
    this._overallBar = null;
    this._checklist = null;
    this._errorEl = null;
    this._historyEl = null;
    this._container = null;
    this._phases = null;
  };
})();