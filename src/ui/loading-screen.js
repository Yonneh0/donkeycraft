// Donkeycraft — Loading Screen
// DOM-based loading screen with progress bar, tips, and error handling.
(function() {
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
        'Buttons can be pressed to open doors'
    ];

    /**
     * LoadingScreen — DOM-based loading screen UI.
     * @param {HTMLElement} [container] - Container element to append the loading screen to.
     */
    Donkeycraft.LoadingScreen = function(container) {
        this._container = container || document.body;
        this._element = null;
        this._progressBar = null;
        this._messageEl = null;
        this._tipEl = null;
        this._errorEl = null;
        this._tipIndex = 0;
        this._disposed = false;
        this._lastProgress = -1; // Track last progress to prevent duplicate tip rotation
        this._create();
    };

    /**
     * _create — build the loading screen DOM structure.
     * @private
     */
    Donkeycraft.LoadingScreen.prototype._create = function() {
        var self = this;

        // Main overlay
        this._element = document.createElement('div');
        this._element.className = 'dk-loading-screen';
        this._element.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;font-family:sans-serif;color:#e0e0e0;';

        // Title
        var title = document.createElement('div');
        title.className = 'dk-loading-title';
        title.style.cssText = 'font-size:2em;margin-bottom:20px;color:#4CAF50;font-weight:bold;letter-spacing:2px;';
        title.textContent = 'Donkeycraft';
        this._element.appendChild(title);

        // Status message
        this._messageEl = document.createElement('div');
        this._messageEl.className = 'dk-loading-message';
        this._messageEl.style.cssText = 'font-size:1.1em;margin-bottom:16px;color:#aaa;min-height:1.4em;';
        this._messageEl.textContent = 'Initializing...';
        this._element.appendChild(this._messageEl);

        // Progress bar container
        var barContainer = document.createElement('div');
        barContainer.style.cssText = 'width:400px;max-width:90vw;height:20px;background:#333;border-radius:10px;overflow:hidden;margin-bottom:16px;border:1px solid #555;';

        // Progress bar fill
        this._progressBar = document.createElement('div');
        this._progressBar.className = 'dk-loading-progress';
        this._progressBar.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#4CAF50,#66BB6A);transition:width 0.3s ease;border-radius:10px;';
        barContainer.appendChild(this._progressBar);
        this._element.appendChild(barContainer);

        // Loading tips
        this._tipEl = document.createElement('div');
        this._tipEl.className = 'dk-loading-tip';
        this._tipEl.style.cssText = 'font-size:0.9em;color:#777;font-style:italic;max-width:400px;text-align:center;padding:0 20px;';
        this._tipEl.textContent = '[Tip] ' + Donkeycraft.LoadingScreenTips[0];
        this._element.appendChild(this._tipEl);

        // Error display (hidden by default)
        this._errorEl = document.createElement('div');
        this._errorEl.className = 'dk-loading-error';
        this._errorEl.style.cssText = 'display:none;width:400px;max-width:90vw;padding:16px;background:#3d0a0a;border:1px solid #e74c3c;border-radius:8px;color:#ff6b6b;font-size:0.95em;text-align:center;margin-top:10px;';
        this._errorEl.textContent = '';
        this._element.appendChild(this._errorEl);

        // Append to container
        this._container.appendChild(this._element);
    };

    /**
     * updateProgress — set progress percentage (0-100).
     * @param {number} percent - Progress percentage (clamped 0-100).
     */
    Donkeycraft.LoadingScreen.prototype.updateProgress = function(percent) {
        if (this._disposed || !this._progressBar) return;

        // Clamp to 0-100
        var p = Math.max(0, Math.min(100, percent));

        // Save old progress before updating
        var oldProgress = this._lastProgress;

        // Only update DOM if progress actually changed
        if (p === oldProgress) return;
        this._lastProgress = p;

        this._progressBar.style.width = p + '%';

        // Rotate tips at 25% thresholds, but only when progress increases
        if (p % 25 === 0 && p > 0 && p > oldProgress) {
            this._tipIndex = (this._tipIndex + 1) % Donkeycraft.LoadingScreenTips.length;
            this._tipEl.textContent = '[Tip] ' + Donkeycraft.LoadingScreenTips[this._tipIndex];
        }
    };

    /**
     * setMessage — set the loading message text.
     * @param {string} message - Message to display.
     */
    Donkeycraft.LoadingScreen.prototype.setMessage = function(message) {
        if (this._disposed || !this._messageEl) return;
        this._messageEl.textContent = message;
    };

    /**
     * showError — display error state.
     * @param {string} errorMessage - Error message to display.
     */
    Donkeycraft.LoadingScreen.prototype.showError = function(errorMessage) {
        if (this._disposed) return;

        // Hide progress bar and tip
        if (this._progressBar) this._progressBar.style.display = 'none';
        if (this._tipEl) this._tipEl.style.display = 'none';

        // Show error (use textContent to prevent XSS)
        this._errorEl.style.display = 'block';
        this._errorEl.textContent = 'ERROR: ' + errorMessage;

        // Update message
        if (this._messageEl) {
            this._messageEl.textContent = 'Failed to initialize';
            this._messageEl.style.color = '#e74c3c';
        }
    };

    /**
     * hide — remove loading screen from DOM.
     */
    Donkeycraft.LoadingScreen.prototype.hide = function() {
        if (this._disposed || !this._element) return;
        if (this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
    };

    /**
     * dispose — remove DOM elements and free references.
     */
    Donkeycraft.LoadingScreen.prototype.dispose = function() {
        this._disposed = true;
        this.hide();
        this._element = null;
        this._progressBar = null;
        this._messageEl = null;
        this._tipEl = null;
        this._errorEl = null;
        this._container = null;
    };
})();