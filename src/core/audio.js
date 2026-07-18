// Donkeycraft — Audio System
// Web Audio API wrapper: sound playback, music, ambient sounds, positional audio.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * AudioSystem — manages Web Audio API for game sounds.
   * Handles sound loading, playback, positional audio, and master volume control.
   *
   * Audio contexts on modern browsers (especially mobile) may start in a 'suspended'
   * state and require a user gesture to resume. Use `resumeContext()` after the first
   * user interaction (click/keydown) to activate audio.
   *
   * @constructor
   */
  Donkeycraft.AudioSystem = function () {
    /** @type {AudioContext|null} */
    this._context = null;

    /** @type {GainNode|null} */
    this._masterGain = null;

    /** @type {Object.<string, AudioBuffer>} */
    this._soundCache = {};

    /** @type {number} — Master volume (0.0 to 1.0). */
    this._volume = 1.0;

    /** @type {boolean} */
    this._enabled = true;

    /** @type {boolean} — True when the audio context is initialized and running. */
    this._audioReady = false;
  };

  /**
   * Initialize the audio system. Must be called from a user gesture context
   * (click, keypress, etc.) because browsers block AudioContext creation otherwise.
   *
   * Sets `_audioReady` to true only when the context state is 'running'.
   * On some browsers (especially mobile), the context starts in 'suspended' state
   * and requires a user gesture to resume. Use `resumeContext()` after first interaction.
   *
   * @returns {Promise<void>}
   */
  Donkeycraft.AudioSystem.prototype.init = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      try {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        self._context = new AudioContext();
        self._masterGain = self._context.createGain();
        self._masterGain.gain.value = self._volume;
        self._masterGain.connect(self._context.destination);

         // Context is ready to play only if already running.
         // On browsers that defer audio creation, it starts suspended and
         // requires a user gesture to resume — the game will call resumeContext()
         // after the first click/keydown.
         self._audioReady = self._context.state === 'running';

         resolve();
      } catch (e) {
        if (Donkeycraft.Logger) {
          Donkeycraft.Logger.warn('Web Audio API not available:', e);
        }
        reject(e);
      }
    });
  };

  /**
   * Set master volume (0.0 to 1.0).
   * @param {number} volume - Volume level, clamped to [0, 1].
   */
  Donkeycraft.AudioSystem.prototype.setVolume = function (volume) {
    this._volume = Donkeycraft.clamp(volume, 0, 1);
    if (this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  };

  /**
   * Get master volume.
   * @returns {number}
   */
  Donkeycraft.AudioSystem.prototype.getVolume = function () {
    return this._volume;
  };

  /**
   * Enable or disable audio playback.
   * When disabled, `play()` becomes a no-op. Does not affect `_audioReady`.
   * @param {boolean} enabled - True to enable, false to disable.
   */
  Donkeycraft.AudioSystem.prototype.setEnabled = function (enabled) {
    this._enabled = enabled;
  };

  /**
   * Resume the audio context if it is currently suspended.
   * Call this after the first user interaction (click/keypress) on browsers
   * that defer audio context creation until a user gesture (common on mobile).
   * @returns {Promise<boolean>} True if the context was successfully resumed and is running.
   */
   Donkeycraft.AudioSystem.prototype.resumeContext = function () {
     var self = this;
     if (!this._context) return Promise.resolve(false);

     if (this._context.state === 'running') {
       this._audioReady = true;
       return Promise.resolve(true);
     }

     // Guard against hangs: resume() can block indefinitely on browsers that
     // require a user gesture.  Resolve after 500 ms with whatever state we have.
     var timeout = new Promise(function (resolve) {
       setTimeout(resolve, 500);
     });

     return Promise.race([
       this._context.resume().then(function () {
         self._audioReady = self._context.state === 'running';
         return self._audioReady;
       }),
       timeout.then(function () {
         // Check state one more time after the timeout fires
         self._audioReady = self._context.state === 'running';
         return self._audioReady;
       }),
     ]).catch(function (e) {
       if (Donkeycraft.Logger) {
         Donkeycraft.Logger.warn(
           'AudioSystem',
           'Failed to resume audio context:',
           e
         );
       }
       return false;
     });
   };

  /**
   * Check if the audio system is ready to play sounds.
   * @returns {boolean} True if context is initialized and running.
   */
  Donkeycraft.AudioSystem.prototype.isReady = function () {
    return !!this._audioReady;
  };

  /**
   * Load and decode a sound from a URL or ArrayBuffer. Results are cached by `name`.
   * @param {string} name - Unique sound identifier.
   * @param {string|ArrayBuffer} source - HTTP(S) URL path or raw ArrayBuffer of audio data.
   * @returns {Promise<void>}
   */
  Donkeycraft.AudioSystem.prototype.loadSound = function (name, source) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (typeof source === 'string') {
        // Load from URL — use XHR for file:/// compatibility
        var xhr = new XMLHttpRequest();
        xhr.open('GET', source, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function () {
          if (xhr.status === 200 || xhr.status === 0) {
            self._decodeAudio(name, xhr.response, resolve, reject);
          } else {
            reject(
              new Error(
                'Failed to load audio: ' +
                  source +
                  ' (status ' +
                  xhr.status +
                  ')'
              )
            );
          }
        };
        xhr.onerror = function () {
          reject(new Error('Failed to load audio: ' + source));
        };
        xhr.send();
      } else {
        // Direct ArrayBuffer
        self._decodeAudio(name, source, resolve, reject);
      }
    });
  };

  /**
   * Decode raw audio buffer data and cache the resulting AudioBuffer.
   * @param {string} name - Sound identifier to store in cache.
   * @param {ArrayBuffer} buffer - Raw PCM audio data to decode.
   * @param {Function} resolve - Promise resolve callback (called on success).
   * @param {Function} reject - Promise reject callback (called on failure).
   * @private
   */
  Donkeycraft.AudioSystem.prototype._decodeAudio = function (
    name,
    buffer,
    resolve,
    reject
  ) {
    var self = this;
    if (!this._context) {
      reject(new Error('Audio context not initialized'));
      return;
    }
    this._context.decodeAudioData(
      buffer,
      function (audioBuffer) {
        self._soundCache[name] = audioBuffer;
        resolve();
      },
      function (e) {
        if (Donkeycraft.Logger) {
          Donkeycraft.Logger.error('Failed to decode audio:', name);
        }
        reject(new Error('Failed to decode audio: ' + name));
      }
    );
  };

  /**
   * Play a sound by name with optional pitch, volume, looping, and positional audio.
   *
   * If `options.position` is provided and the browser supports `PannerNode`,
   * the sound is rendered with spatial attenuation using HRTF (or equal-power fallback).
   *
   * @param {string} name - Sound identifier (must have been loaded via `loadSound()`).
   * @param {Object} [options] - Optional playback parameters.
   * @param {number} [options.volume=1] - Volume multiplier (0-1).
   * @param {number} [options.pitch=1] - Playback rate multiplier (e.g., 2.0 = one octave up).
   * @param {boolean} [options.loop=false] - Whether the sound should loop.
   * @param {number} [options.maxDistance=16] — Max distance for positional audio attenuation.
   * @param {{x: number, y: number, z: number}} [options.position] — 3D position for spatial audio.
   * @returns {AudioBufferSourceNode|null} The created source node, or null if playback was suppressed.
   */
  Donkeycraft.AudioSystem.prototype.play = function (name, options) {
    options = options || {};
    if (!this._enabled || !this._audioReady) return;
    if (!this._soundCache[name]) return;

    var self = this;
    var buffer = this._soundCache[name];
    var source = this._context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value =
      options.pitch !== undefined && options.pitch !== null ? options.pitch : 1;

    var gainNode = this._context.createGain();
    gainNode.gain.value =
      (options.volume !== undefined && options.volume !== null
        ? options.volume
        : 1) * this._volume;

    // Positional audio: create panner if position provided and API is available
    var panner = null;
    if (options.position && this._context.createPanner) {
      try {
        panner = this._context.createPanner();

        // Use safe fallback values — some browsers don't support 'HRTF'/'inverse'
        if (typeof panner.panningModel !== 'undefined') {
          try {
            panner.panningModel = 'HRTF';
          } catch (e2) {
            panner.panningModel = 'equal-power';
          }
        }
        if (typeof panner.distanceModel !== 'undefined') {
          try {
            panner.distanceModel = 'inverse';
          } catch (e3) {
            panner.distanceModel = 'linear';
          }
        }

        // Use setPosition() if available (modern API), fall back to direct AudioParam access
        if (typeof panner.setPosition === 'function') {
          panner.setPosition(
            options.position.x,
            options.position.y,
            options.position.z
          );
        } else if (panner.positionX) {
          panner.positionX.value = options.position.x;
          panner.positionY.value = options.position.y;
          panner.positionZ.value = options.position.z;
        }

        panner.maxDistance = options.maxDistance || 16;
        panner.refDistance = 1;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 0;
        panner.coneOuterGain = 0;

        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(this._masterGain);
      } catch (e) {
        // Panner creation failed — fall back to non-positional audio
        source.connect(gainNode);
        gainNode.connect(this._masterGain);
      }
    } else {
      source.connect(gainNode);
      gainNode.connect(this._masterGain);
    }

    if (options.loop) {
      source.loop = true;
    }

    try {
      if (source.start) {
        source.start(0);
      } else {
        source.noteOn(0);
      }
    } catch (e) {
      // Silently ignore playback errors
    }

    return source;
  };

  /**
   * Stop a previously-created AudioBufferSourceNode.
   * Safe to call with null/undefined — silently returns.
   * @param {AudioBufferSourceNode|null} source - Source node to stop.
   */
  Donkeycraft.AudioSystem.prototype.stop = function (source) {
    if (!source) return;
    try {
      if (source.stop) {
        source.stop(0);
      } else {
        source.noteOff(0);
      }
    } catch (e) {
      // Silently ignore
    }
  };

  /**
   * Load and decode multiple sounds in parallel.
   * @param {{name: string, url: string}[]} sounds - Array of {name, url} pairs.
   * @returns {Promise<void>} Resolves when all sounds are loaded.
   */
  Donkeycraft.AudioSystem.prototype.preload = function (sounds) {
    var self = this;
    var promises = [];
    for (var i = 0; i < sounds.length; i++) {
      promises.push(this.loadSound(sounds[i].name, sounds[i].url));
    }
    return Promise.all(promises).then(function () {
      // Ensure context is running after preload completes
      if (self._context && self._context.state !== 'running') {
        return self.resumeContext();
      }
      return true;
    });
  };

  /**
   * Destroy the audio system: remove event listeners, close the AudioContext,
   * clear the sound cache, and nullify all internal references for garbage collection.
   *
   * Returns a Promise that resolves when the AudioContext is fully closed.
   * @returns {Promise<void>}
   */
  Donkeycraft.AudioSystem.prototype.destroy = function () {
    var self = this;

    if (this._context) {
      // AudioContext.close() returns a Promise in modern browsers
      return this._context
        .close()
        .then(function () {
          self._context = null;
          self._soundCache = {};
          self._masterGain = null;
        })
        .catch(function (e) {
          // If close() fails, clean up manually anyway
          if (Donkeycraft.Logger) {
            Donkeycraft.Logger.warn(
              'AudioSystem',
              'Failed to close AudioContext:',
              e
            );
          }
          self._context = null;
          self._soundCache = {};
          self._masterGain = null;
        });
    }
    this._soundCache = {};
    this._masterGain = null;
    return Promise.resolve();
  };
})();
