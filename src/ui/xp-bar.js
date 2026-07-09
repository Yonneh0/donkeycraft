// Donkeycraft — XP Bar UI
// Animated XP progress bar with progressive level badge visualization.
// Listens to xp:changed events and updates DOM with effects.
// At max level (100), displays the level 99 badge with a full XP bar.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var EventBus = Donkeycraft.EventBus;

  /**
   * XPBar — manages the XP bar DOM, animations, and progressive level badge.
   * @param {HTMLElement} container - Parent container for XP bar DOM.
   * @param {Donkeycraft.Experience} experience - Experience instance to observe.
   */
  Donkeycraft.XPBar = function (container, experience) {
    this._experience = experience;
    this._container = container;

    // DOM element references (set by _buildDOM)
    this._segBg = null; // .dk-xp-segmented-bg
    this._fill = null; // .dk-xp-fill
    this._watermark = null; // .dk-xp-watermark
    this._badgeContainer = null; // .dk-xp-badge-container
    this._badgeBg = null; // .dk-xp-badge-bg
    this._badgeText = null; // .dk-xp-badge-text
    this._badgeGlow = null; // .dk-xp-badge-glow
    this._particleContainer = null; // particle container

    // State tracking (for change detection)
    this._prevLevel = 0;
    this._prevPoints = 0;
    this._prevTotalXP = 0;
    this._currentTier = -1; // index into LEVEL_TIERS

    // Animation locks
    this._animating = false;
    this._ambientTimer = null;
    this._watermarkTimeout = null;
    this._flashTimeout = null;

    // Bind + build
    var self = this;
    this._onXPChanged = function (data) {
      self.updateFromExperience(data);
    };

    this._buildDOM();
    this._subscribeToEvents();
    this.updateFromExperience({
      level: experience.getLevel(),
      points: experience.getPoints(),
      totalXP: experience.getTotalXP(),
    });
  };

  /**
   * LEVEL_TIERS — static configuration for progressive badge styles.
   * Level 100 (max) uses the same tier as level 99 (rainbow) with "MAX" text.
   * @private
   */
  Donkeycraft.XPBar.LEVEL_TIERS = [
    {
      min: 1,
      max: 9,
      text: '#ffffff',
      bg: 'rgba(200,200,200,0.3)',
      glow: 'transparent',
      size: 36,
      hasText: true,
      ambient: 'none',
      sparkColor: '#ccc',
    },
    {
      min: 10,
      max: 24,
      text: '#00d4ff',
      bg: 'rgba(0,150,255,0.4)',
      glow: 'rgba(0,150,255,0.8)',
      size: 38,
      hasText: true,
      ambient: 'pulse-glow',
      sparkColor: '#00d4ff',
    },
    {
      min: 25,
      max: 49,
      text: '#b44aff',
      bg: 'rgba(150,50,255,0.5)',
      glow: 'rgba(150,50,255,0.6)',
      size: 42,
      hasText: true,
      ambient: 'ring-rotate',
      sparkColor: '#b44aff',
    },
    {
      min: 50,
      max: 74,
      text: '#ffd700',
      bg: 'rgba(255,200,0,0.6)',
      glow: 'rgba(255,200,0,0.8)',
      size: 48,
      hasText: true,
      ambient: 'spark-float',
      sparkColor: '#ffd700',
    },
    {
      min: 75,
      max: 98,
      text: '#ff4422',
      bg: 'rgba(255,80,0,0.7)',
      glow: 'rgba(255,80,0,0.9)',
      size: 52,
      hasText: true,
      ambient: 'intensified-pulse',
      sparkColor: '#ff4422',
    },
    {
      min: 99,
      max: 100,
      text: '#ff66cc',
      bg: 'linear-gradient(45deg,#f00,#ff0,#0f0,#0ff,#00f,#f00)',
      glow: 'multi-color',
      size: 56,
      hasText: true,
      textOverride: 'MAX',
      ambient: 'rainbow-shift',
      sparkColor: '#ff66cc',
    },
  ];

  /**
   * TIER_FILL_COLORS — fill bar gradient colors per tier.
   * @private
   */
  Donkeycraft.XPBar.TIER_FILL_COLORS = [
    'linear-gradient(90deg, #666, #999)', // Tier 1: gray
    'linear-gradient(90deg, #0088cc, #00d4ff)', // Tier 2: cyan-blue
    'linear-gradient(90deg, #7b2fff, #b44aff)', // Tier 3: purple
    'linear-gradient(90deg, #cc9900, #ffd700)', // Tier 4: gold
    'linear-gradient(90deg, #cc3300, #ff6644)', // Tier 5: red-orange
    'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff0000)', // Tier 6: rainbow (levels 99-100)
  ];

  /**
   * _subscribeToEvents — listen for xp:changed events.
   * @private
   */
  Donkeycraft.XPBar.prototype._subscribeToEvents = function () {
    // Get the global EventBus instance (set by game.js via EventBus.setGlobal)
    var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
    if (globalBus) {
      try {
        globalBus.on('xp:changed', this._onXPChanged);
      } catch (e) {
        Donkeycraft.Logger.warn(
          'XPBar',
          'Failed to subscribe to xp:changed: ' + e.message
        );
      }
    } else {
      Donkeycraft.Logger.warn(
        'XPBar',
        'No global EventBus instance available — XP bar will not receive updates'
      );
    }
  };

  /**
   * _buildDOM — create all XP bar elements inside the container.
   * @private
   */
  Donkeycraft.XPBar.prototype._buildDOM = function () {
    var container = this._container;
    if (!container) return;

    // Clear existing content
    container.innerHTML = '';
    container.classList.add('dk-xp-bar-wrapper');

    // Inner bar container
    var barContainer = document.createElement('div');
    barContainer.className = 'dk-xp-bar-container';

    // Segmented background
    var segBg = document.createElement('div');
    segBg.className = 'dk-xp-segmented-bg';
    for (var i = 0; i < 20; i++) {
      var seg = document.createElement('div');
      seg.className = 'dk-xp-segment';
      segBg.appendChild(seg);
    }
    barContainer.appendChild(segBg);
    this._segBg = segBg;

    // Fill bar
    var fill = document.createElement('div');
    fill.className = 'dk-xp-fill';
    barContainer.appendChild(fill);
    this._fill = fill;

    // Watermark text
    var watermark = document.createElement('div');
    watermark.className = 'dk-xp-watermark';
    barContainer.appendChild(watermark);
    this._watermark = watermark;

    // Badge container
    var badgeContainer = document.createElement('div');
    badgeContainer.className = 'dk-xp-badge-container';

    // Badge background
    var badgeBg = document.createElement('div');
    badgeBg.className = 'dk-xp-badge-bg';
    badgeContainer.appendChild(badgeBg);
    this._badgeBg = badgeBg;

    // Badge text
    var badgeText = document.createElement('span');
    badgeText.className = 'dk-xp-badge-text';
    badgeText.textContent = '1';
    badgeBg.appendChild(badgeText);
    this._badgeText = badgeText;

    // Badge glow
    var badgeGlow = document.createElement('div');
    badgeGlow.className = 'dk-xp-badge-glow';
    badgeContainer.appendChild(badgeGlow);
    this._badgeGlow = badgeGlow;

    barContainer.appendChild(badgeContainer);
    this._badgeContainer = badgeContainer;

    // Particle container (for burst particles)
    var particleContainer = document.createElement('div');
    particleContainer.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible;';
    barContainer.appendChild(particleContainer);
    this._particleContainer = particleContainer;

    container.appendChild(barContainer);
  };

  /**
   * updateFromExperience — main entry point called on xp:changed events.
   * Compares old vs new state and triggers appropriate animations.
   * @param {Object} data - { level, points, totalXP }.
   */
  Donkeycraft.XPBar.prototype.updateFromExperience = function (data) {
    var newLevel = data.level || 0;
    var newPoints = data.points || 0;
    var newTotalXP = data.totalXP || 0;

    var threshold = this._experience.getLevelThreshold();
    var progress = Math.min(newPoints / threshold, 1.0);

    // Detect changes
    var levelChanged = newLevel !== this._prevLevel;
    var pointsChanged = newPoints !== this._prevPoints;

    // Get tier info (static method)
    var newTier = Donkeycraft.XPBar._getTier(newLevel);
    var oldTier =
      this._currentTier >= 0
        ? Donkeycraft.XPBar.LEVEL_TIERS[this._currentTier]
        : null;

    // 1. Always animate fill if points changed
    if (pointsChanged) {
      this._animateFill(progress, newTier);
      this._animateWatermark(progress, newPoints, threshold);
      this._triggerColorFlash(newTier);
    }

    // 2. Animate level badge if level changed
    if (levelChanged) {
      this._animateLevelBadge(newLevel, newTier);
      this._triggerLevelBurst();
      var particleCount = newLevel >= 75 ? 24 : newLevel >= 25 ? 18 : 12;
      this._spawnParticles(particleCount, newTier);
      if (newLevel >= 75) {
        this._triggerScreenShake();
      }
    }

    // 3. Update ambient animation if tier changed
    if (newTier && (!oldTier || oldTier.ambient !== newTier.ambient)) {
      this._updateAmbientAnimation(newTier, oldTier);
    }

    // 4. Update static badge properties every time (handles initial load)
    this._updateBadgeStatic(newLevel, newTier);

    // 4b. Show/hide XP bar based on level visibility
    this._updateVisibility(newLevel);

    // 5. Update state tracking
    this._prevLevel = newLevel;
    this._prevPoints = newPoints;
    this._prevTotalXP = newTotalXP;
    if (newTier) {
      this._currentTier = Donkeycraft.XPBar.LEVEL_TIERS.indexOf(newTier);
    }
  };

  /**
   * _getTier — find the tier config for a given level.
   * Levels 99-100 both map to the rainbow "MAX" tier.
   * @private
   * @param {number} level - XP level.
   * @returns {Object} Tier configuration.
   */
  Donkeycraft.XPBar._getTier = function (level) {
    var tiers = Donkeycraft.XPBar.LEVEL_TIERS;
    for (var i = 0; i < tiers.length; i++) {
      if (level >= tiers[i].min && level <= tiers[i].max) {
        return tiers[i];
      }
    }
    // Default to tier 1 for any unexpected level values
    return tiers[0];
  };

  /**
   * _animateFill — animate the XP fill bar width and color.
   * @private
   * @param {number} progress - Fraction 0-1.
   * @param {Object} tier - Current tier config.
   */
  Donkeycraft.XPBar.prototype._animateFill = function (progress, tier) {
    if (!this._fill) return;

    var pct = Math.max(0, Math.min(100, progress * 100));
    this._fill.style.width = pct + '%';

    // Set fill color based on tier
    var tierIdx = Donkeycraft.XPBar.LEVEL_TIERS.indexOf(tier);
    if (tierIdx >= 0 && Donkeycraft.XPBar.TIER_FILL_COLORS[tierIdx]) {
      this._fill.style.background = Donkeycraft.XPBar.TIER_FILL_COLORS[tierIdx];
    }

    // Update box-shadow to match tier glow
    if (
      tier &&
      tier.glow &&
      tier.glow !== 'transparent' &&
      tier.glow !== 'multi-color'
    ) {
      this._fill.style.boxShadow =
        'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 8px ' + tier.glow;
    } else if (tier && tier.glow === 'multi-color') {
      this._fill.style.boxShadow =
        'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 8px rgba(255,102,204,0.6)';
    } else {
      this._fill.style.boxShadow =
        'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 4px rgba(200,200,200,0.3)';
    }
  };

  /**
   * _animateWatermark — position and flash the watermark text.
   * @private
   * @param {number} progress - Fraction 0-1.
   * @param {number} points - Current points.
   * @param {number} threshold - Level threshold.
   */
  Donkeycraft.XPBar.prototype._animateWatermark = function (
    progress,
    points,
    threshold
  ) {
    if (!this._watermark) return;

    var pct = Math.round(progress * 100);
    this._watermark.textContent = pct + '% (' + points + '/' + threshold + ')';

    // Position at fill edge
    var barWidth = this._container ? this._container.offsetWidth : 320;
    var fillEdgePx = progress * barWidth - 40; // offset text to left of fill edge
    fillEdgePx = Math.max(4, Math.min(fillEdgePx, barWidth - 80));
    this._watermark.style.left = fillEdgePx + 'px';

    // Flash animation
    this._watermark.style.animation = 'none';
    // Force reflow
    void this._watermark.offsetWidth;
    this._watermark.style.animation = 'watermark-flash 350ms ease-out';

    // Clear any existing timeout
    if (this._watermarkTimeout) {
      clearTimeout(this._watermarkTimeout);
    }
    // After flash, settle to semi-transparent display
    var wmRef = this._watermark;
    this._watermarkTimeout = setTimeout(function () {
      if (wmRef) {
        wmRef.style.opacity = '0.7';
      }
    }, 350);
  };

  /**
   * _animateLevelBadge — morph badge when level changes.
   * @private
   * @param {number} newLevel - New level value.
   * @param {Object} newTier - New tier config.
   */
  Donkeycraft.XPBar.prototype._animateLevelBadge = function (
    newLevel,
    newTier
  ) {
    if (!this._badgeBg || !this._badgeText) return;

    // Update text to new level BEFORE animation so it's visible during spin
    var displayText = newTier.textOverride || String(newLevel);
    this._badgeText.textContent = displayText;

    // Apply spin animation with proper transform-origin
    this._badgeBg.style.transformOrigin = 'center center';
    this._badgeBg.style.animation = 'none';
    void this._badgeBg.offsetWidth; // force reflow
    this._badgeBg.style.animation = 'badge-spin-scale 500ms ease-out';

    // Reset badge text animation (text stays inside badge-bg during spin)
    this._badgeText.style.transformOrigin = 'center center';
    this._badgeText.style.animation = 'none';
    void this._badgeText.offsetWidth;
    this._badgeText.style.animation = 'badge-bounce 500ms ease-out';
  };

  /**
   * _triggerLevelBurst — spawn expanding ring animation.
   * @private
   */
  Donkeycraft.XPBar.prototype._triggerLevelBurst = function () {
    if (!this._container) return;

    var burst = document.createElement('div');
    burst.className = 'dk-xp-level-burst';

    // Get tier color for burst (static method call)
    var tier = Donkeycraft.XPBar._getTier(this._prevLevel);
    var burstColor = tier && tier.glow ? tier.glow : 'rgba(200,200,200,0.8)';

    burst.style.cssText =
      'border-color:' +
      burstColor +
      ';animation:level-burst 400ms ease-out forwards;';

    this._container.appendChild(burst);

    // Remove after animation completes
    setTimeout(
      function (el) {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }.bind(this, burst),
      400
    );
  };

  /**
   * _spawnParticles — create DOM particle elements with animated trajectories.
   * @private
   * @param {number} count - Number of particles.
   * @param {Object} tier - Tier config (for colors).
   */
  Donkeycraft.XPBar.prototype._spawnParticles = function (count, tier) {
    if (!this._particleContainer || !tier) return;

    var particleColor = tier.sparkColor || '#ffffff';
    var containerRect = this._container
      ? this._container.getBoundingClientRect()
      : null;

    for (var i = 0; i < count; i++) {
      var particle = document.createElement('span');
      particle.className = 'dk-xp-particle';

      // Random trajectory
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var distance = 30 + Math.random() * 50;
      var dx = Math.cos(angle) * distance;
      var dy = Math.sin(angle) * distance - 20; // bias upward

      particle.style.cssText =
        'left:50%;top:50%;background:' +
        particleColor +
        ';opacity:1;animation:particle-fall ' +
        (400 + Math.random() * 200) +
        'ms ease-out ' +
        i * 15 +
        'ms forwards;--dx:' +
        dx +
        'px;--dy:' +
        dy +
        'px;';

      this._particleContainer.appendChild(particle);

      // Remove after animation
      var totalDuration = 600 + i * 15;
      setTimeout(
        function (el) {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        }.bind(this, particle),
        totalDuration
      );
    }
  };

  /**
   * _triggerScreenShake — apply shake animation to XP bar container.
   * @private
   */
  Donkeycraft.XPBar.prototype._triggerScreenShake = function () {
    // Shake only the badge background instead of the entire container.
    // Applying transform-based shake to the wrapper caused the whole XP bar
    // to shift layout on levels 75+. Shaking just the badge avoids this.
    if (!this._badgeBg) return;

    this._badgeBg.style.animation = 'badge-shake 150ms ease-out';
    setTimeout(
      function (el) {
        el.style.animation = 'none';
        void el.offsetWidth; // force reflow
      }.bind(this, this._badgeBg),
      150
    );
  };

  /**
   * _updateBadgeStatic — update badge size, colors, and glow without animation.
   * @private
   * @param {number} level - Current level.
   * @param {Object} tier - Tier config.
   */
  Donkeycraft.XPBar.prototype._updateBadgeStatic = function (level, tier) {
    if (!this._badgeBg || !this._badgeText || !this._badgeGlow || !tier) return;

    // Calculate size using formula: size = 36 + Math.min(level, 100) * 0.28, clamped to tier max
    var formulaSize = 36 + Math.min(level, 100) * 0.28;
    var size = Math.round(formulaSize);
    // Clamp to tier-defined sizes for consistency
    if (size < tier.size) size = tier.size;
    else size = Math.min(size, tier.size + 4);

    this._badgeBg.style.width = size + 'px';
    this._badgeBg.style.height = size + 'px';

    // Background color
    if (tier.bg === 'linear-gradient(45deg,#f00,#ff0,#0f0,#0ff,#00f,#f00)') {
      this._badgeBg.style.background = tier.bg;
    } else {
      this._badgeBg.style.background = tier.bg;
    }

    // Text color
    if (tier.hasText && tier.text) {
      this._badgeText.style.color = tier.text;
      this._badgeText.style.display = 'block';
      // Scale font size based on badge size
      var fontSize = Math.max(12, Math.min(20, size * 0.45));
      this._badgeText.style.fontSize = fontSize + 'px';
    } else {
      this._badgeText.style.display = 'none';
    }

    // Glow ring
    if (
      tier.glow &&
      tier.glow !== 'transparent' &&
      tier.glow !== 'multi-color'
    ) {
      this._badgeGlow.style.borderColor = tier.glow;
      this._badgeGlow.style.width = size + 10 + 'px';
      this._badgeGlow.style.height = size + 10 + 'px';
    } else if (tier.glow === 'multi-color') {
      this._badgeGlow.style.borderColor = 'rgba(255,102,204,0.6)';
      this._badgeGlow.style.width = size + 10 + 'px';
      this._badgeGlow.style.height = size + 10 + 'px';
    } else {
      this._badgeGlow.style.borderColor = 'transparent';
    }
  };

  /**
   * _triggerColorFlash — flash the XP bar background with tier color.
   * @private
   * @param {Object} tier - Current tier config.
   */
  Donkeycraft.XPBar.prototype._triggerColorFlash = function (tier) {
    if (!this._fill) return;

    this._fill.style.animation = 'none';
    void this._fill.offsetWidth; // force reflow
    this._fill.style.animation = 'xp-color-flash 300ms ease-out';

    // Clear after flash
    if (this._flashTimeout) {
      clearTimeout(this._flashTimeout);
    }
    this._flashTimeout = setTimeout(
      function () {
        if (this._fill) {
          this._fill.style.animation = 'none';
        }
      }.bind(this),
      300
    );
  };

  /**
   * _updateAmbientAnimation — apply/remove continuous ambient effects.
   * @private
   * @param {Object} newTier - New tier config.
   * @param {Object} oldTier - Previous tier config.
   */
  Donkeycraft.XPBar.prototype._updateAmbientAnimation = function (
    newTier,
    oldTier
  ) {
    // Remove old ambient effects
    if (oldTier && this._badgeBg) {
      this._badgeBg.style.animation = 'none';
      this._badgeBg.style.filter = 'none';
    }

    // Apply new ambient effect
    if (!newTier || !this._badgeBg) return;

    var ambient = newTier.ambient;
    var glowColor = newTier.glow || 'rgba(200,200,200,0.5)';

    if (ambient === 'pulse-glow') {
      this._badgeBg.style.animation =
        'badge-pulse-glow 2s ease-in-out infinite';
      this._badgeBg.style.setProperty('--glow-color', glowColor);
    } else if (ambient === 'intensified-pulse') {
      this._badgeBg.style.animation =
        'intensified-pulse 1.5s ease-in-out infinite';
    } else if (ambient === 'ring-rotate') {
      // Create rotating ring element if not exists
      this._ensureAmbientRing(newTier);
    } else if (ambient === 'spark-float') {
      this._ensureSparkElements(newTier);
    } else if (ambient === 'rainbow-shift') {
      this._badgeBg.style.animation = 'rainbow-shift 3s linear infinite';
    } else if (ambient === 'golden-spectacle') {
      this._badgeBg.style.animation =
        'golden-spectacle 2s ease-in-out infinite';
    }
    // 'none' tier has no ambient animation
  };

  /**
   * _ensureAmbientRing — create rotating ring element for tier 3.
   * @private
   * @param {Object} tier - Tier config.
   */
  Donkeycraft.XPBar.prototype._ensureAmbientRing = function (tier) {
    if (!this._badgeContainer) return;

    // Remove existing ring
    var existing = this._badgeContainer.querySelector(
      '.dk-xp-badge-ambient-ring'
    );
    if (existing) existing.remove();

    var ring = document.createElement('div');
    ring.className = 'dk-xp-badge-ambient-ring';
    var badgeSize = this._badgeBg
      ? parseInt(this._badgeBg.style.width) || 42
      : 42;
    // Reduced offset from +16 to +8 to keep ring inside badge boundary and prevent overlap with food bar
    ring.style.width = badgeSize + 8 + 'px';
    ring.style.height = badgeSize - 2 + 'px';
    ring.style.borderColor = 'rgba(150, 50, 255, 0.4)';
    ring.style.animation = 'badge-ring-rotate 1.5s linear infinite';

    this._badgeContainer.appendChild(ring);
  };

  /**
   * _ensureSparkElements — create orbiting spark elements for tier 4.
   * @private
   * @param {Object} tier - Tier config.
   */
  Donkeycraft.XPBar.prototype._ensureSparkElements = function (tier) {
    if (!this._badgeContainer) return;

    // Remove existing sparks
    var existingSparks = this._badgeContainer.querySelectorAll('.dk-xp-spark');
    for (var i = 0; i < existingSparks.length; i++) {
      existingSparks[i].remove();
    }

    var badgeSize = this._badgeBg
      ? parseInt(this._badgeBg.style.width) || 48
      : 48;
    var sparkRadius = badgeSize / 2 + 8;
    var sparkCount = 6;

    for (var s = 0; s < sparkCount; s++) {
      var spark = document.createElement('div');
      spark.className = 'dk-xp-spark';
      spark.style.background = tier.sparkColor || '#ffd700';

      // Position sparks around badge
      var angle = (360 * s) / sparkCount;
      spark.style.cssText +=
        ';position:absolute;left:50%;top:50%;' +
        'animation:spark-float ' +
        (0.8 + Math.random() * 0.4) +
        's linear infinite ' +
        s * (1000 / sparkCount) +
        'ms;' +
        '--spark-radius:' +
        sparkRadius +
        'px;';

      this._badgeContainer.appendChild(spark);
    }
  };

  /**
   * _updateVisibility — show/hide XP bar based on level.
   * Always visible for levels ≥ 1 (including max level 100).
   * @private
   * @param {number} level - Current level.
   */
  Donkeycraft.XPBar.prototype._updateVisibility = function (level) {
    if (!this._container) return;

    if (level >= 1) {
      this._container.classList.add('dk-visible');
    } else {
      this._container.classList.remove('dk-visible');
    }
  };

  /**
   * resetUI — clear all animations, particles, and ambient effects.
   * Called when XP is reset to level 0.
   * @private
   */
  Donkeycraft.XPBar.prototype.resetUI = function () {
    // Clear particle elements
    if (this._particleContainer) {
      this._particleContainer.innerHTML = '';
    }

    // Remove burst ring elements
    var bursts = this._container
      ? this._container.querySelectorAll('.dk-xp-level-burst')
      : [];
    for (var i = 0; i < bursts.length; i++) {
      bursts[i].remove();
    }

    // Remove ambient ring element
    if (this._badgeContainer) {
      var ambientRing = this._badgeContainer.querySelector(
        '.dk-xp-badge-ambient-ring'
      );
      if (ambientRing) ambientRing.remove();
      var sparks = this._badgeContainer.querySelectorAll('.dk-xp-spark');
      for (var j = 0; j < sparks.length; j++) {
        sparks[j].remove();
      }
    }

    // Reset badge animations
    if (this._badgeBg) {
      this._badgeBg.style.animation = 'none';
      this._badgeBg.style.filter = 'none';
      this._badgeBg.style.transformOrigin = '';
    }

    // Reset fill animation
    if (this._fill) {
      this._fill.style.animation = 'none';
    }

    // Reset watermark
    if (this._watermark) {
      this._watermark.style.animation = 'none';
      this._watermark.style.opacity = '0';
    }

    // Clear the badge shake (redirected from container in levels 75+ fix)
    if (this._badgeBg) {
      this._badgeBg.style.animation = 'none';
    }

    // Clear timers
    if (this._watermarkTimeout) clearTimeout(this._watermarkTimeout);
    if (this._flashTimeout) clearTimeout(this._flashTimeout);
    if (this._ambientTimer) clearTimeout(this._ambientTimer);
  };

  /**
   * destroy — clean up all DOM and event listeners.
   */
  Donkeycraft.XPBar.prototype.destroy = function () {
    // Clear animations first
    this.resetUI();

    // Unsubscribe from events using global EventBus instance
    var globalBus = Donkeycraft.EventBus && Donkeycraft.EventBus._global;
    if (globalBus && this._onXPChanged) {
      try {
        globalBus.off('xp:changed', this._onXPChanged);
      } catch (e) {}
    }

    // Clear timers
    if (this._watermarkTimeout) clearTimeout(this._watermarkTimeout);
    if (this._flashTimeout) clearTimeout(this._flashTimeout);
    if (this._ambientTimer) clearTimeout(this._ambientTimer);

    // Clean up DOM children
    if (this._container) {
      this._container.innerHTML = '';
    }

    // Null out references
    this._experience = null;
    this._container = null;
    this._segBg = null;
    this._fill = null;
    this._watermark = null;
    this._badgeContainer = null;
    this._badgeBg = null;
    this._badgeText = null;
    this._badgeGlow = null;
    this._particleContainer = null;
    this._onXPChanged = null;
  };
})();
