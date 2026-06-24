// Donkeycraft — Audio System
// Web Audio API wrapper: sound playback, music, ambient sounds, positional audio.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * AudioSystem — manages Web Audio API for game sounds.
     */
    Donkeycraft.AudioSystem = function() {
        this._context = null;
        this._masterGain = null;
        this._soundCache = {};
        this._volume = 1.0;
        this._enabled = true;
    };

    /**
     * Initialize the audio system. Must be called from a user gesture context.
     * @returns {Promise}
     */
    Donkeycraft.AudioSystem.prototype.init = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            try {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                self._context = new AudioContext();
                self._masterGain = self._context.createGain();
                self._masterGain.gain.value = self._volume;
                self._masterGain.connect(self._context.destination);
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
     * @param {number} volume
     */
    Donkeycraft.AudioSystem.prototype.setVolume = function(volume) {
        this._volume = Donkeycraft.clamp(volume, 0, 1);
        if (this._masterGain) {
            this._masterGain.gain.value = this._volume;
        }
    };

    /**
     * Get master volume.
     * @returns {number}
     */
    Donkeycraft.AudioSystem.prototype.getVolume = function() {
        return this._volume;
    };

    /**
     * Enable/disable audio.
     * @param {boolean} enabled
     */
    Donkeycraft.AudioSystem.prototype.setEnabled = function(enabled) {
        this._enabled = enabled;
    };

    /**
     * Load a sound from a URL (base64 or path).
     * @param {string} name - Sound identifier.
     * @param {string|ArrayBuffer} source - URL path or ArrayBuffer of audio data.
     * @returns {Promise}
     */
    Donkeycraft.AudioSystem.prototype.loadSound = function(name, source) {
        var self = this;
        return new Promise(function(resolve, reject) {
            if (typeof source === 'string') {
                // Fetch from URL
                fetch(source)
                    .then(function(response) { return response.arrayBuffer(); })
                    .then(function(data) { self._decodeAudio(name, data); resolve(); })
                    .catch(reject);
            } else {
                // Direct ArrayBuffer
                self._decodeAudio(name, source);
                resolve();
            }
        });
    };

    /**
     * Decode audio data and cache it.
     * @param {string} name
     * @param {ArrayBuffer} buffer
     * @private
     */
    Donkeycraft.AudioSystem.prototype._decodeAudio = function(name, buffer) {
        var self = this;
        if (!this._context) return;
        this._context.decodeAudioData(buffer, function(audioBuffer) {
            self._soundCache[name] = audioBuffer;
        }, function() {
            if (Donkeycraft.Logger) {
                Donkeycraft.Logger.error('Failed to decode audio:', name);
            }
        });
    };

    /**
     * Play a sound by name.
     * @param {string} name - Sound identifier.
     * @param {Object} [options]
     * @param {number} [options.volume=1] - Volume 0-1.
     * @param {number} [options.pitch=1] - Pitch multiplier.
     * @param {boolean} [options.loop=false] - Whether to loop.
     * @param {number} [options.maxDistance=16] - Max distance for positional audio.
     * @param {Donkeycraft.Vector3} [options.position] - Sound position for spatial audio.
     */
    Donkeycraft.AudioSystem.prototype.play = function(name, options) {
        options = options || {};
        if (!this._enabled || !this._context) return;
        if (!this._soundCache[name]) return;

        var self = this;
        var buffer = this._soundCache[name];
        var source = this._context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = options.pitch || 1;

        var gainNode = this._context.createGain();
        gainNode.gain.value = (options.volume !== undefined ? options.volume : 1) * this._volume;

        // Positional audio: create panner if position provided
        var panner = null;
        if (options.position && this._context.createPanner) {
            panner = this._context.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.positionX.value = options.position.x;
            panner.positionY.value = options.position.y;
            panner.positionZ.value = options.position.z;
            panner.maxDistance = options.maxDistance || 16;
            panner.refDistance = 1;
            panner.coneInnerAngle = 360;
            panner.coneOuterAngle = 0;
            panner.coneOuterGain = 0;

            source.connect(gainNode);
            gainNode.connect(panner);
            panner.connect(this._masterGain);
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
     * Stop a playing sound source.
     * @param {AudioBufferSourceNode} source
     */
    Donkeycraft.AudioSystem.prototype.stop = function(source) {
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
     * Preload multiple sounds.
     * @param {{name: string, url: string}[]} sounds
     * @returns {Promise}
     */
    Donkeycraft.AudioSystem.prototype.preload = function(sounds) {
        var self = this;
        var promises = [];
        for (var i = 0; i < sounds.length; i++) {
            promises.push(this.loadSound(sounds[i].name, sounds[i].url));
        }
        return Promise.all(promises);
    };

    /**
     * Destroy the audio system and free resources.
     */
    Donkeycraft.AudioSystem.prototype.destroy = function() {
        if (this._context) {
            this._context.close();
            this._context = null;
        }
        this._soundCache = {};
        this._masterGain = null;
    };

})();