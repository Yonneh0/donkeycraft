// Donkeycraft — Entity Engine
// Handles entity animations, movement kinematics, bone transforms, and state machines.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    /**
     * Catmull-Rom tension parameter for spline interpolation (0=loose, 0.5=standard, 1=tight).
     * @constant {number}
     */
    var CATMULL_ROM_TENSION = 0.5;

    /** Default animation transition duration in seconds. */
    var DEFAULT_TRANSITION_DURATION = 0.2;

    /** Maximum delta time for physics updates (prevents physics explosions on tab switch). */
    var MAX_DELTA_TIME = 0.1;

    /** Base rate multiplier for ground friction (prevents frame-rate dependency). */
    var GROUND_FRICTION_BASE_RATE = 5.0;

    /** Maximum animation clip cache size (LRU eviction when exceeded). */
    var MAX_ANIMATION_CACHE_SIZE = 64;

    // ============================================================
    // Animation System — Keyframe-based skeletal animation
    // ============================================================

    /**
     * AnimationClip — Defines a single animation with bone keyframes.
     * Uses Catmull-Rom splines for smooth interpolation between keyframes.
     * @constructor
     * @param {string} name - Animation name (e.g., 'idle', 'walk', 'run').
     * @param {number} duration - Animation duration in seconds.
     * @param {boolean} [loop=true] - Whether the animation loops.
     * @param {Object.<string, Array>} keyframes - Map of bone name to array of {time, rx, ry, rz}.
     */
    Donkeycraft.AnimationClip = function (name, duration, loop, keyframes) {
        /**
         * Animation name identifier.
         * @type {string}
         */
        this.name = name || 'idle';

        /**
         * Total animation duration in seconds.
         * @type {number}
         */
        this.duration = duration || 1.0;

        /**
         * Whether the animation loops seamlessly.
         * @type {boolean}
         */
        this.loop = loop !== undefined ? !!loop : true;

        /**
         * Bone keyframes: { boneName: [{time, rx, ry, rz}, ...] }.
         * @type {Object.<string, Array<{time: number, rx: number, ry: number, rz: number}>>}
         */
        this.keyframes = keyframes || {};

        /**
         * Pre-computed tangent data for cubic Hermite interpolation.
         * Computed once during construction from adjacent keyframes.
         * @type {Object.<string, Array<{tangentIn: {rx,ry,rz}, tangentOut: {rx,ry,rz}}>>}
         * @private
         */
        this._tangents = {};

        // Pre-compute tangents for smooth interpolation
        this._computeTangents();
    };

    /**
     * _computeTangents — Pre-compute Catmull-Rom tangents for each bone's keyframe array.
     * Validates that keyframe times are strictly increasing.
     * @private
     */
    Donkeycraft.AnimationClip.prototype._computeTangents = function () {
        var bones = this.keyframes;
        for (var boneName in bones) {
            if (!bones.hasOwnProperty(boneName)) continue;
            var kf = bones[boneName];
            var tangents = [];

            // Validate: keyframe times must be strictly increasing
            if (kf.length > 1) {
                for (var v = 1; v < kf.length; v++) {
                    if (kf[v].time <= kf[v - 1].time) {
                        if (Donkeycraft.Logger && typeof Donkeycraft.Logger.warn === 'function') {
                            Donkeycraft.Logger.warn('AnimationClip', 'Keyframe times for bone "' + boneName + '" are not strictly increasing.');
                        }
                        break;
                    }
                }
            }

            for (var i = 0; i < kf.length; i++) {
                var prev = i > 0 ? kf[i - 1] : kf[kf.length <= 1 ? 0 : kf.length - 2];
                var next = i < kf.length - 1 ? kf[i + 1] : kf[kf.length <= 1 ? kf.length - 1 : 0];

                var dt = (next.time - prev.time);
                // Guard against zero-delta: when there's only one keyframe or adjacent keys share the same time,
                // use a default delta to avoid division by zero. The tangent values will be zero (no interpolation).
                if (dt === 0) {
                    tangents.push({
                        tangentIn: { rx: 0, ry: 0, rz: 0 },
                        tangentOut: { rx: 0, ry: 0, rz: 0 }
                    });
                    continue;
                }

                tangents.push({
                    tangentIn: {
                        rx: CATMULL_ROM_TENSION * (next.rx - prev.rx) / dt,
                        ry: CATMULL_ROM_TENSION * (next.ry - prev.ry) / dt,
                        rz: CATMULL_ROM_TENSION * (next.rz - prev.rz) / dt
                    },
                    tangentOut: {
                        rx: CATMULL_ROM_TENSION * (next.rx - prev.rx) / dt,
                        ry: CATMULL_ROM_TENSION * (next.ry - prev.ry) / dt,
                        rz: CATMULL_ROM_TENSION * (next.rz - prev.rz) / dt
                    }
                });
            }

            this._tangents[boneName] = tangents;
        }
    };

    /**
     * Evaluate bone rotations at a given time using cubic Hermite interpolation.
     * @param {number} time - Current animation time in seconds (wrapped to duration if looping).
     * @returns {Object.<string, {rx: number, ry: number, rz: number}>} Interpolated rotation per bone name.
     */
    Donkeycraft.AnimationClip.prototype.evaluate = function (time) {
        var result = {};
        var dur = this.duration;
        var wrappedTime = this.loop ? ((time % dur) + dur) % dur : Math.min(time, dur);

        var bones = this.keyframes;
        for (var boneName in bones) {
            if (!bones.hasOwnProperty(boneName)) continue;
            var kf = bones[boneName];
            var tan = this._tangents[boneName];

            if (!kf || kf.length === 0) {
                result[boneName] = { rx: 0, ry: 0, rz: 0 };
                continue;
            }

            // Find surrounding keyframes
            var prevKf = kf[0];
            var nextKf = kf[kf.length - 1];
            var prevTanOut = { rx: 0, ry: 0, rz: 0 };
            var nextTanIn = { rx: 0, ry: 0, rz: 0 };

            for (var i = 0; i < kf.length - 1; i++) {
                if (wrappedTime >= kf[i].time && wrappedTime <= kf[i + 1].time) {
                    prevKf = kf[i];
                    nextKf = kf[i + 1];
                    prevTanOut = tan[i] ? tan[i].tangentOut : { rx: 0, ry: 0, rz: 0 };
                    nextTanIn = tan[i + 1] ? tan[i + 1].tangentIn : { rx: 0, ry: 0, rz: 0 };
                    break;
                }
            }

            // Normalize time between keyframes [0, 1]
            var t = (nextKf.time - prevKf.time) > 0 ? (wrappedTime - prevKf.time) / (nextKf.time - prevKf.time) : 0;
            t = Math.max(0, Math.min(1, t));

            // Cubic Hermite interpolation (Catmull-Rom formulation)
            var t2 = t * t;
            var t3 = t2 * t;
            var h00 = 2 * t3 - 3 * t2 + 1;
            var h10 = t3 - 2 * t2 + t;
            var h01 = -2 * t3 + 3 * t2;
            var h11 = t3 - t2;

            result[boneName] = {
                rx: h00 * prevKf.rx + h10 * prevTanOut.rx + h01 * nextKf.rx + h11 * nextTanIn.rx,
                ry: h00 * prevKf.ry + h10 * prevTanOut.ry + h01 * nextKf.ry + h11 * nextTanIn.ry,
                rz: h00 * prevKf.rz + h10 * prevTanOut.rz + h01 * nextKf.rz + h11 * nextTanIn.rz
            };
        }

        return result;
    };

    // ============================================================
    // Animation State Machine
    // ============================================================

    /**
     * AnimationState — Represents a named animation state with smooth transitions.
     * @constructor
     * @param {string} name - State name (e.g., 'idle', 'walk').
     * @param {Donkeycraft.AnimationClip} clip - Animation clip for this state.
     */
    Donkeycraft.AnimationState = function (name, clip) {
        /**
         * State name identifier.
         * @type {string}
         */
        this.name = name || 'idle';

        /**
         * Animation clip playing in this state.
         * @type {Donkeycraft.AnimationClip}
         */
        this.clip = clip;

        /**
         * Current play time within the animation clip.
         * @type {number}
         */
        this.time = 0;

        /**
         * Animation playback speed multiplier (1.0 = normal).
         * @type {number}
         */
        this.speed = 1.0;

        /**
         * Blend factor [0, 1] when transitioning from another state.
         * 0 = fully in this state, 1 = fully blended from previous.
         * @type {number}
         */
        this.blendFactor = 0;

        /**
         * Transition duration in seconds.
         * @type {number}
         */
        this.transitionDuration = 0.2;
    };

    /**
     * AnimationStateMachine — Manages animation states, transitions, and blending.
     * @constructor
     * @property {Object.<string, Donkeycraft.AnimationState>} _states - Registered animation states.
     * @property {string|null} _activeState - Currently active state name.
     * @property {Donkeycraft.AnimationState|null} _previousState - Previous state for blending.
     * @property {number} _transitionTime - Time spent in current transition.
     * @property {Object.<string, {rx: number, ry: number, rz: number}>} _boneTransforms - Cached bone transforms.
     * @property {Array<string>} _allBones - All tracked bone names.
     */
    Donkeycraft.AnimationStateMachine = function () {
        /**
         * Registered animation states: { stateName: AnimationState }.
         * @type {Object.<string, Donkeycraft.AnimationState>}
         * @private
         */
        this._states = {};

        /**
         * Currently active state name.
         * @type {string|null}
         * @private
         */
        this._activeState = null;

        /**
         * Previous active state (for blending during transitions).
         * @type {Donkeycraft.AnimationState|null}
         * @private
         */
        this._previousState = null;

        /**
         * Time spent in the current transition.
         * @type {number}
         * @private
         */
        this._transitionTime = 0;

        /**
         * Cached bone transforms: { boneName: {rx, ry, rz} }.
         * @type {Object.<string, {rx: number, ry: number, rz: number}>}
         * @private
         */
        this._boneTransforms = {};

        /**
         * All bone names that can be animated.
         * @type {Array<string>}
         * @private
         */
        this._allBones = [];
    };

    /**
     * registerState — Add an animation state to the state machine.
     * @param {string} name - State name (e.g., 'idle', 'walk').
     * @param {Donkeycraft.AnimationClip} clip - Animation clip for this state.
     */
    Donkeycraft.AnimationStateMachine.prototype.registerState = function (name, clip) {
        if (!name || !clip) return;
        this._states[name] = new Donkeycraft.AnimationState(name, clip);

        // Track all bone names
        var bones = clip.keyframes;
        for (var boneName in bones) {
            if (bones.hasOwnProperty(boneName)) {
                var idx = this._allBones.indexOf(boneName);
                if (idx === -1) this._allBones.push(boneName);
            }
        }
    };

    /**
     * setState — Switch to a named animation state with optional transition.
     * @param {string} name - Target state name.
     * @param {number} [transitionDuration=0.2] - Transition time in seconds.
     */
    Donkeycraft.AnimationStateMachine.prototype.setState = function (name, transitionDuration) {
        if (!name || !this._states[name]) return;

        // If switching to a different state, set up transition
        if (this._activeState !== name) {
            // Save the current state's time as the "previous" for smooth blending.
            this._previousState = this._states[this._activeState] || null;
            this._activeState = name;
            this._transitionTime = 0;

            // Reset target state animation time to start from beginning.
            this._states[name].time = 0;

            // Store transition duration on the target state.
            this._states[name].transitionDuration = transitionDuration != null ? transitionDuration : DEFAULT_TRANSITION_DURATION;
        }
    };

    /**
     * getState — Get the current active state name.
     * @returns {string|null} Current state name or null.
     */
    Donkeycraft.AnimationStateMachine.prototype.getState = function () {
        return this._activeState;
    };

    /**
     * tick — Update animation state machine for one frame.
     * @param {number} deltaTime - Time since last frame in seconds.
     * @returns {Object.<string, {rx: number, ry: number, rz: number}>} Interpolated bone transforms.
     */
    Donkeycraft.AnimationStateMachine.prototype.tick = function (deltaTime) {
        if (!this._activeState || !this._states[this._activeState]) {
            return {};
        }

        var active = this._states[this._activeState];
        var prev = this._previousState;

        // Advance animation time
        active.time += deltaTime * (active.speed || 1.0);

        // Handle loop wrap
        if (active.clip && active.clip.loop) {
            while (active.time > active.clip.duration) {
                active.time -= active.clip.duration;
            }
        }

        // Evaluate current state animation
        var currentTransforms = active.clip ? active.clip.evaluate(active.time) : {};

        // Handle transition blending — smooth crossfade from previous to current state.
        if (prev && prev.clip && this._transitionTime < prev.transitionDuration) {
            this._transitionTime += deltaTime;
            var blendT = Math.min(1, this._transitionTime / prev.transitionDuration);

            // Evaluate previous state at its current play time.
            var prevTransforms = prev.clip.evaluate(prev.clip.loop ?
                ((prev.time % prev.clip.duration) + prev.clip.duration) % prev.clip.duration :
                Math.min(prev.time, prev.clip.duration));

            // Advance previous animation time during transition.
            if (prev.time !== undefined) {
                prev.time += deltaTime * (prev.speed || 1.0);
            }

            // Blend: current fades IN as blendT goes 0→1, previous fades OUT.
            for (var i = 0; i < this._allBones.length; i++) {
                var bn = this._allBones[i];
                var curr = currentTransforms[bn] || { rx: 0, ry: 0, rz: 0 };
                var prv = prevTransforms[bn] || { rx: 0, ry: 0, rz: 0 };

                this._boneTransforms[bn] = {
                    rx: curr.rx * blendT + prv.rx * (1 - blendT),
                    ry: curr.ry * blendT + prv.ry * (1 - blendT),
                    rz: curr.rz * blendT + prv.rz * (1 - blendT)
                };
            }
        } else {
            // No transition — use current transforms directly.
            this._boneTransforms = {};
            for (var j = 0; j < this._allBones.length; j++) {
                var boneName = this._allBones[j];
                this._boneTransforms[boneName] = currentTransforms[boneName] || { rx: 0, ry: 0, rz: 0 };
            }
        }

        // Clear previous state once transition is complete
        if (this._transitionTime >= (prev ? prev.transitionDuration : 0.2)) {
            this._previousState = null;
            this._transitionTime = 0;
        }

        return this._boneTransforms;
    };

    // ============================================================
    // Bone Hierarchy
    // ============================================================

    /**
     * BoneDefinition — Defines a single bone in the skeleton hierarchy.
     * @constructor
     * @param {string} name - Bone name (e.g., 'head', 'leftArm').
     * @param {Object} [config] - Bone configuration.
     * @param {string} [config.parent=null] - Parent bone name.
     * @param {Vector3} [config.offset={x:0, y:0, z:0}] - Bone position offset from parent.
     * @param {Vector3} [config.pivot={x:0, y:0, z:0}] - Rotation pivot point within the bone.
     */
    Donkeycraft.BoneDefinition = function (name, config) {
        config = config || {};

        /**
         * Bone name identifier.
         * @type {string}
         */
        this.name = name;

        /**
         * Parent bone name (null for root bone).
         * @type {string|null}
         */
        this.parent = config.parent || null;

        /**
         * Bone position offset from parent.
         * @type {Donkeycraft.Vector3}
         */
        this.offset = config.offset || new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Rotation pivot point within the bone.
         * @type {Donkeycraft.Vector3}
         */
        this.pivot = config.pivot || new Donkeycraft.Vector3(0, 0, 0);
    };

    // ============================================================
    // Skeleton Templates
    // ============================================================

    /**
     * SkeletonTemplates — Pre-defined skeleton definitions for common entity types.
     * @type {Object.<string, Array<Donkeycraft.BoneDefinition>>}
     */
    Donkeycraft.SkeletonTemplates = {

        /** Bipedal skeleton — For humanoid entities. */
        bipedal: [
            new Donkeycraft.BoneDefinition('root', { offset: new Donkeycraft.Vector3(0, 0, 0), pivot: new Donkeycraft.Vector3(0, 0, 0) }),
            new Donkeycraft.BoneDefinition('spine', { parent: 'root', offset: new Donkeycraft.Vector3(0, 0.9, 0), pivot: new Donkeycraft.Vector3(0, 0, 0) }),
            new Donkeycraft.BoneDefinition('head', { parent: 'spine', offset: new Donkeycraft.Vector3(0, 0.9, 0), pivot: new Donkeycraft.Vector3(0, 0.15, 0) }),
            new Donkeycraft.BoneDefinition('leftArm', { parent: 'spine', offset: new Donkeycraft.Vector3(-0.4, 0.7, 0), pivot: new Donkeycraft.Vector3(-0.2, 0, 0) }),
            new Donkeycraft.BoneDefinition('rightArm', { parent: 'spine', offset: new Donkeycraft.Vector3(0.4, 0.7, 0), pivot: new Donkeycraft.Vector3(0.2, 0, 0) }),
            new Donkeycraft.BoneDefinition('leftLeg', { parent: 'root', offset: new Donkeycraft.Vector3(-0.2, 0, 0), pivot: new Donkeycraft.Vector3(-0.1, 0.45, 0) }),
            new Donkeycraft.BoneDefinition('rightLeg', { parent: 'root', offset: new Donkeycraft.Vector3(0.2, 0, 0), pivot: new Donkeycraft.Vector3(0.1, 0.45, 0) })
        ],

        /** Quadruped skeleton — For four-legged animals. */
        quadruped: [
            new Donkeycraft.BoneDefinition('root', { offset: new Donkeycraft.Vector3(0, 0, 0), pivot: new Donkeycraft.Vector3(0, 0, 0) }),
            new Donkeycraft.BoneDefinition('body', { parent: 'root', offset: new Donkeycraft.Vector3(0, 0.7, 0), pivot: new Donkeycraft.Vector3(0, 0, 0) }),
            new Donkeycraft.BoneDefinition('head', { parent: 'body', offset: new Donkeycraft.Vector3(0.6, 0.4, 0), pivot: new Donkeycraft.Vector3(0.3, 0, 0) }),
            new Donkeycraft.BoneDefinition('frontLeftLeg', { parent: 'root', offset: new Donkeycraft.Vector3(0.4, 0, 0.3), pivot: new Donkeycraft.Vector3(0.2, 0.45, 0.15) }),
            new Donkeycraft.BoneDefinition('frontRightLeg', { parent: 'root', offset: new Donkeycraft.Vector3(0.4, 0, -0.3), pivot: new Donkeycraft.Vector3(0.2, 0.45, -0.15) }),
            new Donkeycraft.BoneDefinition('rearLeftLeg', { parent: 'root', offset: new Donkeycraft.Vector3(-0.4, 0, 0.3), pivot: new Donkeycraft.Vector3(-0.2, 0.45, 0.15) }),
            new Donkeycraft.BoneDefinition('rearRightLeg', { parent: 'root', offset: new Donkeycraft.Vector3(-0.4, 0, -0.3), pivot: new Donkeycraft.Vector3(-0.2, 0.45, -0.15) })
        ],

        /** Small entity skeleton — For chickens and small animals. */
        small: [
            new Donkeycraft.BoneDefinition('root', { offset: new Donkeycraft.Vector3(0, 0, 0), pivot: new Donkeycraft.Vector3(0, 0, 0) }),
            new Donkeycraft.BoneDefinition('body', { parent: 'root', offset: new Donkeycraft.Vector3(0, 0.3, 0), pivot: new Donkeycraft.Vector3(0, 0.15, 0) }),
            new Donkeycraft.BoneDefinition('head', { parent: 'body', offset: new Donkeycraft.Vector3(0.2, 0.2, 0), pivot: new Donkeycraft.Vector3(0.1, 0, 0) })
        ],

        /** Static object skeleton — For doors, sign posts, chests. */
        static: [
            new Donkeycraft.BoneDefinition('root', { offset: new Donkeycraft.Vector3(0, 0, 0), pivot: new Donkeycraft.Vector3(0, 0, 0) })
        ],

        /** Door skeleton — For interactive door blocks. */
        door: [
            new Donkeycraft.BoneDefinition('root', { offset: new Donkeycraft.Vector3(0, 0, 0), pivot: new Donkeycraft.Vector3(0, 0, 0) }),
            new Donkeycraft.BoneDefinition('doorPanel', { parent: 'root', offset: new Donkeycraft.Vector3(0, 0.9, 0), pivot: new Donkeycraft.Vector3(-0.45, 0, 0) })
        ],

        /** Projectile skeleton — For arrows, snowballs, ender pearls. */
        projectile: [
            new Donkeycraft.BoneDefinition('root', { offset: new Donkeycraft.Vector3(0, 0, 0), pivot: new Donkeycraft.Vector3(0, 0, 0) })
        ]
    };

    // ============================================================
    // Animation Definitions
    // ============================================================

    /**
     * AnimationDefinitions — Standard animation clips for entity behaviors.
     * @type {Object.<string, Object>}
     */
    Donkeycraft.AnimationDefinitions = {

        /** Idle animation — Subtle breathing bob for stationary entities. */
        idle: {
            duration: 2.0,
            loop: true,
            keyframes: {
                spine: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 1.0, rx: -0.05, ry: 0, rz: 0 },
                    { time: 2.0, rx: 0, ry: 0, rz: 0 }
                ],
                head: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 1.0, rx: -0.03, ry: 0.05, rz: 0 },
                    { time: 2.0, rx: 0, ry: 0, rz: 0 }
                ]
            }
        },

        /** Walk animation — Side-to-side limb swing for bipedal entities. */
        walk: {
            duration: 0.8,
            loop: true,
            keyframes: {
                spine: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 0.2, rx: 0.05, ry: 0, rz: 0.03 },
                    { time: 0.5, rx: 0, ry: 0, rz: 0 },
                    { time: 0.7, rx: -0.05, ry: 0, rz: -0.03 },
                    { time: 0.8, rx: 0, ry: 0, rz: 0 }
                ],
                head: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 0.25, rx: -0.08, ry: 0, rz: 0 },
                    { time: 0.5, rx: 0, ry: 0, rz: 0 },
                    { time: 0.75, rx: -0.04, ry: 0, rz: 0 },
                    { time: 0.8, rx: 0, ry: 0, rz: 0 }
                ],
                leftArm: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0.3 },
                    { time: 0.25, rx: -0.6, ry: 0, rz: 0.1 },
                    { time: 0.5, rx: 0, ry: 0, rz: -0.3 },
                    { time: 0.75, rx: 0.4, ry: 0, rz: -0.1 },
                    { time: 0.8, rx: 0, ry: 0, rz: 0.3 }
                ],
                rightArm: [
                    { time: 0.0, rx: 0, ry: 0, rz: -0.3 },
                    { time: 0.25, rx: 0.4, ry: 0, rz: -0.1 },
                    { time: 0.5, rx: 0, ry: 0, rz: 0.3 },
                    { time: 0.75, rx: -0.6, ry: 0, rz: 0.1 },
                    { time: 0.8, rx: 0, ry: 0, rz: -0.3 }
                ],
                leftLeg: [
                    { time: 0.0, rx: -0.5, ry: 0, rz: 0 },
                    { time: 0.25, rx: 0, ry: 0, rz: 0 },
                    { time: 0.5, rx: 0.5, ry: 0, rz: 0 },
                    { time: 0.75, rx: 0, ry: 0, rz: 0 },
                    { time: 0.8, rx: -0.5, ry: 0, rz: 0 }
                ],
                rightLeg: [
                    { time: 0.0, rx: 0.5, ry: 0, rz: 0 },
                    { time: 0.25, rx: 0, ry: 0, rz: 0 },
                    { time: 0.5, rx: -0.5, ry: 0, rz: 0 },
                    { time: 0.75, rx: 0, ry: 0, rz: 0 },
                    { time: 0.8, rx: 0.5, ry: 0, rz: 0 }
                ]
            }
        },

        /** Run animation — Faster, exaggerated limb swing. */
        run: {
            duration: 0.4,
            loop: true,
            keyframes: {
                spine: [
                    { time: 0.0, rx: 0.1, ry: 0, rz: 0 },
                    { time: 0.25, rx: -0.05, ry: 0, rz: 0.05 },
                    { time: 0.5, rx: 0.1, ry: 0, rz: 0 }
                ],
                head: [
                    { time: 0.0, rx: -0.15, ry: 0, rz: 0 },
                    { time: 0.25, rx: 0.05, ry: 0, rz: 0 },
                    { time: 0.5, rx: -0.15, ry: 0, rz: 0 }
                ],
                leftArm: [
                    { time: 0.0, rx: -1.2, ry: 0, rz: 0.4 },
                    { time: 0.25, rx: 0.8, ry: 0, rz: -0.3 },
                    { time: 0.5, rx: -1.2, ry: 0, rz: 0.4 }
                ],
                rightArm: [
                    { time: 0.0, rx: 0.8, ry: 0, rz: -0.3 },
                    { time: 0.25, rx: -1.2, ry: 0, rz: 0.4 },
                    { time: 0.5, rx: 0.8, ry: 0, rz: -0.3 }
                ],
                leftLeg: [
                    { time: 0.0, rx: -1.0, ry: 0, rz: 0 },
                    { time: 0.25, rx: 0.8, ry: 0, rz: 0 },
                    { time: 0.5, rx: -1.0, ry: 0, rz: 0 }
                ],
                rightLeg: [
                    { time: 0.0, rx: 0.8, ry: 0, rz: 0 },
                    { time: 0.25, rx: -1.0, ry: 0, rz: 0 },
                    { time: 0.5, rx: 0.8, ry: 0, rz: 0 }
                ]
            }
        },

        /** Attack animation — Forward arm swing for melee combat. */
        attack: {
            duration: 0.5,
            loop: false,
            keyframes: {
                spine: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 0.15, rx: 0, ry: 0.3, rz: 0 },
                    { time: 0.3, rx: 0, ry: -0.2, rz: 0 },
                    { time: 0.5, rx: 0, ry: 0, rz: 0 }
                ],
                rightArm: [
                    { time: 0.0, rx: 0, ry: 0, rz: -0.3 },
                    { time: 0.1, rx: -1.5, ry: 0, rz: -0.5 },
                    { time: 0.2, rx: 0.5, ry: 0, rz: 0.3 },
                    { time: 0.5, rx: 0, ry: 0, rz: -0.3 }
                ],
                leftArm: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0.3 },
                    { time: 0.1, rx: -0.5, ry: 0, rz: 0.2 },
                    { time: 0.2, rx: 0, ry: 0, rz: 0.3 },
                    { time: 0.5, rx: 0, ry: 0, rz: 0.3 }
                ]
            }
        },

        /** Defend animation — Arms crossed for blocking. */
        defend: {
            duration: 0.3,
            loop: true,
            keyframes: {
                leftArm: [
                    { time: 0.0, rx: -0.5, ry: 0, rz: 1.2 },
                    { time: 0.3, rx: -0.5, ry: 0, rz: 1.2 }
                ],
                rightArm: [
                    { time: 0.0, rx: -0.5, ry: 0, rz: -1.2 },
                    { time: 0.3, rx: -0.5, ry: 0, rz: -1.2 }
                ]
            }
        },

        /** Hurt animation — Brief recoil and head shake. */
        hurt: {
            duration: 0.4,
            loop: false,
            keyframes: {
                spine: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 0.1, rx: 0, ry: 0, rz: -0.2 },
                    { time: 0.2, rx: 0.1, ry: 0, rz: 0.1 },
                    { time: 0.4, rx: 0, ry: 0, rz: 0 }
                ],
                head: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 0.1, rx: 0.2, ry: 0, rz: -0.3 },
                    { time: 0.2, rx: -0.1, ry: 0, rz: 0.2 },
                    { time: 0.4, rx: 0, ry: 0, rz: 0 }
                ]
            }
        },

        /** Quadruped walk animation — Diagonal leg pairs swing together. */
        quadrupedWalk: {
            duration: 0.8,
            loop: true,
            keyframes: {
                body: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 0.2, rx: 0.05, ry: 0, rz: 0.03 },
                    { time: 0.5, rx: 0, ry: 0, rz: 0 },
                    { time: 0.7, rx: -0.05, ry: 0, rz: -0.03 },
                    { time: 0.8, rx: 0, ry: 0, rz: 0 }
                ],
                head: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 0.25, rx: -0.1, ry: 0, rz: 0 },
                    { time: 0.5, rx: 0, ry: 0, rz: 0 },
                    { time: 0.75, rx: -0.05, ry: 0, rz: 0 },
                    { time: 0.8, rx: 0, ry: 0, rz: 0 }
                ],
                frontLeftLeg: [
                    { time: 0.0, rx: -0.4, ry: 0, rz: 0.1 },
                    { time: 0.25, rx: 0.3, ry: 0, rz: -0.05 },
                    { time: 0.5, rx: 0.4, ry: 0, rz: -0.1 },
                    { time: 0.75, rx: -0.3, ry: 0, rz: 0.05 },
                    { time: 0.8, rx: -0.4, ry: 0, rz: 0.1 }
                ],
                frontRightLeg: [
                    { time: 0.0, rx: 0.3, ry: 0, rz: -0.05 },
                    { time: 0.25, rx: -0.4, ry: 0, rz: 0.1 },
                    { time: 0.5, rx: 0.3, ry: 0, rz: -0.05 },
                    { time: 0.75, rx: -0.4, ry: 0, rz: 0.1 },
                    { time: 0.8, rx: 0.3, ry: 0, rz: -0.05 }
                ],
                rearLeftLeg: [
                    { time: 0.0, rx: 0.3, ry: 0, rz: -0.05 },
                    { time: 0.25, rx: -0.4, ry: 0, rz: 0.1 },
                    { time: 0.5, rx: 0.3, ry: 0, rz: -0.05 },
                    { time: 0.75, rx: -0.4, ry: 0, rz: 0.1 },
                    { time: 0.8, rx: 0.3, ry: 0, rz: -0.05 }
                ],
                rearRightLeg: [
                    { time: 0.0, rx: -0.4, ry: 0, rz: 0.1 },
                    { time: 0.25, rx: 0.3, ry: 0, rz: -0.05 },
                    { time: 0.5, rx: -0.4, ry: 0, rz: 0.1 },
                    { time: 0.75, rx: 0.3, ry: 0, rz: -0.05 },
                    { time: 0.8, rx: -0.4, ry: 0, rz: 0.1 }
                ]
            }
        },

        /** Chicken bob animation — Gentle up-down bob with head pecking. */
        chickenBob: {
            duration: 0.6,
            loop: true,
            keyframes: {
                body: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 0.3, rx: 0.1, ry: 0, rz: 0 },
                    { time: 0.6, rx: 0, ry: 0, rz: 0 }
                ],
                head: [
                    { time: 0.0, rx: -0.3, ry: 0, rz: 0 },
                    { time: 0.15, rx: 0.5, ry: 0, rz: 0 },
                    { time: 0.3, rx: -0.1, ry: 0, rz: 0 },
                    { time: 0.45, rx: 0.4, ry: 0, rz: 0 },
                    { time: 0.6, rx: -0.3, ry: 0, rz: 0 }
                ]
            }
        },

        /** Door open animation — Smooth rotation around hinge pivot. */
        doorOpen: {
            duration: 1.0,
            loop: false,
            keyframes: {
                doorPanel: [
                    { time: 0.0, rx: 0, ry: 0, rz: 0 },
                    { time: 1.0, rx: 0, ry: Math.PI / 2, rz: 0 }
                ]
            }
        },

        /** Door close animation — Smooth rotation back to closed position. */
        doorClose: {
            duration: 0.8,
            loop: false,
            keyframes: {
                doorPanel: [
                    { time: 0.0, rx: 0, ry: Math.PI / 2, rz: 0 },
                    { time: 0.8, rx: 0, ry: 0, rz: 0 }
                ]
            }
        }
    };

    // ============================================================
    // Movement Kinematics
    // ============================================================

    /**
     * KinematicState — Physics state for entity movement.
     * @constructor
     */
    Donkeycraft.KinematicState = function () {
        /**
         * Current velocity (blocks/second).
         * @type {Donkeycraft.Vector3}
         */
        this.velocity = new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Applied acceleration (blocks/second²).
         * @type {Donkeycraft.Vector3}
         */
        this.acceleration = new Donkeycraft.Vector3(0, 0, 0);

        /**
         * Gravity constant (blocks/second²). Negative = downward.
         * @type {number}
         */
        this.gravity = -20.0;

        /**
         * Terminal velocity (minimum Y velocity — max fall speed).
         * @type {number}
         */
        this.terminalVelocity = -60.0;

        /**
         * Air damping factor per second (1.0 = no damping, 0.95 = light air resistance).
         * @type {number}
         */
        this.airDamping = 0.98;

        /**
         * Ground friction factor per second (applied to horizontal velocity when grounded).
         * @type {number}
         */
        this.groundFriction = 0.85;

        /**
         * Jump impulse velocity (blocks/second upward).
         * @type {number}
         */
        this.jumpVelocity = 8.0;

        /**
         * Whether the entity is currently on solid ground.
         * @type {boolean}
         */
        this.onGround = false;

        /**
         * Cached ground Y level (block surface Y).
         * @type {number|null}
         */
        this.groundHeight = null;

        /**
         * Jump cooldown timer (seconds remaining before next jump allowed).
         * @type {number}
         */
        this.jumpCooldown = 0;

        /**
         * Maximum jump cooldown duration in seconds.
         * @type {number}
         */
        this.maxJumpCooldown = 0.1;
    };

    /**
     * tick — Update kinematic state for one frame using semi-implicit Euler integration.
     * @param {number} deltaTime - Time since last frame in seconds.
     * @param {Function} [groundCheck] - Optional function returning Y of ground at entity position, or null.
     * @returns {{onGround: boolean, groundY: number|null}} Ground detection result.
     */
    Donkeycraft.KinematicState.prototype.tick = function (deltaTime, groundCheck) {
        if (deltaTime <= 0) return { onGround: this.onGround, groundY: this.groundHeight };
        if (deltaTime > MAX_DELTA_TIME) deltaTime = MAX_DELTA_TIME;

        this.acceleration.y += this.gravity;

        // Semi-implicit Euler: update velocity first, then position
        this.velocity.x += this.acceleration.x * deltaTime;
        this.velocity.y += this.acceleration.y * deltaTime;
        this.velocity.z += this.acceleration.z * deltaTime;

        if (this.velocity.y < this.terminalVelocity) {
            this.velocity.y = this.terminalVelocity;
        }

        var damping = Math.pow(this.airDamping, deltaTime);
        this.velocity.x *= damping;
        this.velocity.z *= damping;

        // Ground detection
        this.onGround = false;
        this.groundHeight = null;

        if (groundCheck && typeof groundCheck === 'function') {
            var groundY = groundCheck();
            if (groundY !== null && groundY !== undefined) {
                this.onGround = true;
                this.groundHeight = groundY;

                // Snap vertical velocity to zero when grounded
                if (this.velocity.y <= 0) {
                    this.velocity.y = 0;
                }

                // Apply ground friction to horizontal movement (frame-rate independent).
                var frictionDamp = Math.pow(this.groundFriction, deltaTime * GROUND_FRICTION_BASE_RATE);
                this.velocity.x *= frictionDamp;
                this.velocity.z *= frictionDamp;
            }
        }

        // Update jump cooldown
        if (this.jumpCooldown > 0) {
            this.jumpCooldown -= deltaTime;
            if (this.jumpCooldown < 0) this.jumpCooldown = 0;
        }

        this.acceleration.x = 0;
        this.acceleration.z = 0;

        return { onGround: this.onGround, groundY: this.groundHeight };
    };

    /**
     * jump — Apply upward impulse for jumping.
     * @param {boolean} [canJump=true] - Whether jumping is allowed.
     */
    Donkeycraft.KinematicState.prototype.jump = function (canJump) {
        canJump = canJump !== undefined ? !!canJump : true;

        if (!canJump) return;

        if (this.onGround && this.jumpCooldown <= 0) {
            this.velocity.y = this.jumpVelocity;
            this.jumpCooldown = this.maxJumpCooldown;
        }
    };

    /**
     * getHorizontalSpeed — Get current horizontal speed magnitude.
     * @returns {number} Speed in blocks/second.
     */
    Donkeycraft.KinematicState.prototype.getHorizontalSpeed = function () {
        return Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    };

    /**
     * setHorizontalSpeed — Set the horizontal speed magnitude and direction from an angle.
     * Converts a speed (blocks/s) and yaw (radians) into velocity components on the XZ plane.
     * Yaw of 0 points toward negative Z (forward), consistent with the entity rotation system.
     * @param {number} speed - Horizontal speed in blocks/second (non-negative).
     * @param {number} yaw - Direction angle in radians (0 = negative Z / forward).
     */
    Donkeycraft.KinematicState.prototype.setHorizontalSpeed = function (speed, yaw) {
        if (speed < 0) speed = 0;
        this.velocity.x = -Math.sin(yaw) * speed;
        this.velocity.z = -Math.cos(yaw) * speed;
    };

    // ============================================================
    // Entity Animation Controller
    // ============================================================

    /**
     * EntityAnimationController — Per-entity animation and kinematics controller.
     * @constructor
     * @property {Donkeycraft.AnimationStateMachine} _stateMachine - Animation state machine.
     * @property {Donkeycraft.KinematicState} _kinematics - Kinematic physics state.
     * @property {number} animationSpeedMultiplier - Animation speed multiplier.
     * @property {number} _lastSpeed - Last known horizontal speed.
     * @property {number} walkSpeedThreshold - Speed threshold for walk animation.
     * @property {number} runSpeedThreshold - Speed threshold for run animation.
     * @property {string|null} forcedState - Currently forced animation state.
     * @property {number} forcedStateDuration - Forced state duration in seconds.
     * @property {number} _forcedStateTimer - Remaining forced state time.
     * @property {Object.<string, {rx: number, ry: number, rz: number}>} _cachedTransforms - Cached bone transforms.
     * @property {boolean} _transformsDirty - Whether transforms need recomputation.
     */
    Donkeycraft.EntityAnimationController = function () {
        /**
         * Animation state machine for this entity.
         * @type {Donkeycraft.AnimationStateMachine}
         * @private
         */
        this._stateMachine = new Donkeycraft.AnimationStateMachine();

        /**
         * Kinematic physics state.
         * @type {Donkeycraft.KinematicState}
         * @private
         */
        this._kinematics = new Donkeycraft.KinematicState();

        /**
         * Current animation speed multiplier (affected by movement speed).
         * @type {number}
         */
        this.animationSpeedMultiplier = 1.0;

        /**
         * Last known horizontal speed (for auto-animation state selection).
         * @type {number}
         * @private
         */
        this._lastSpeed = 0;

        /**
         * Auto-transition threshold: speed above which walk animation triggers.
         * @type {number}
         */
        this.walkSpeedThreshold = 0.3;

        /**
         * Auto-transition threshold: speed above which run animation triggers.
         * @type {number}
         */
        this.runSpeedThreshold = 2.5;

        /**
         * Currently forced animation state (null = auto-select based on speed).
         * Set manually for combat, defending, etc.
         * @type {string|null}
         */
        this.forcedState = null;

        /**
         * Forced state duration in seconds (for timed animations like attack/hurt).
         * @type {number}
         */
        this.forcedStateDuration = 0;

        /**
         * Remaining forced state time.
         * @type {number}
         * @private
         */
        this._forcedStateTimer = 0;

        /**
         * Cached bone transform results.
         * @type {Object.<string, {rx: number, ry: number, rz: number}>}
         * @private
         */
        this._cachedTransforms = {};

        /**
         * Whether transforms have been computed this frame.
         * @type {boolean}
         * @private
         */
        this._transformsDirty = true;
    };

    /**
     * registerAnimations — Register all animation states for an entity type.
     * @param {Array<Donkeycraft.AnimationClip>} clips - Array of AnimationClip objects to register.
     */
    Donkeycraft.EntityAnimationController.prototype.registerAnimations = function (clips) {
        if (!clips || !Array.isArray(clips)) return;
        for (var i = 0; i < clips.length; i++) {
            this._stateMachine.registerState(clips[i].name, clips[i]);
        }
    };

    /**
     * setForcedState — Force a specific animation state for a duration.
     * @param {string} state - Animation state name (e.g., 'attack', 'hurt').
     * @param {number} [duration=0] - Duration in seconds (0 = until cleared).
     */
    Donkeycraft.EntityAnimationController.prototype.setForcedState = function (state, duration) {
        this.forcedState = state;
        this.forcedStateDuration = duration || 0;
        this._forcedStateTimer = duration || 0;
    };

    /**
     * clearForcedState — Clear any forced animation state, returning to auto-selection.
     */
    Donkeycraft.EntityAnimationController.prototype.clearForcedState = function () {
        this.forcedState = null;
        this.forcedStateDuration = 0;
        this._forcedStateTimer = 0;
    };

    /**
     * tick — Update animation and kinematics for one frame.
     * @param {number} deltaTime - Time since last frame in seconds.
     * @param {Function} [groundCheck] - Optional ground detection callback.
     * @returns {{transforms: Object, kinematics: Donkeycraft.KinematicState, ground: {onGround: boolean, groundY: number|null}}} Bone transforms, kinematics, and ground result.
     */
    Donkeycraft.EntityAnimationController.prototype.tick = function (deltaTime, groundCheck) {
        // Update forced state timer
        if (this.forcedState && this.forcedStateDuration > 0) {
            this._forcedStateTimer -= deltaTime;
            if (this._forcedStateTimer <= 0) {
                this.clearForcedState();
            }
        }

        // Determine animation state
        var targetState = null;
        if (!this.forcedState) {
            var speed = this._kinematics.getHorizontalSpeed();
            if (speed < this.walkSpeedThreshold) {
                targetState = 'idle';
            } else if (speed < this.runSpeedThreshold) {
                targetState = 'walk';
            } else {
                targetState = 'run';
            }
        } else {
            targetState = this.forcedState;
        }

        // Update animation state machine
        this._cachedTransforms = this._stateMachine.tick(deltaTime * this.animationSpeedMultiplier);
        this._transformsDirty = false;

        // Update kinematics
        var groundResult = this._kinematics.tick(deltaTime, groundCheck);

        return {
            transforms: this._cachedTransforms,
            kinematics: this._kinematics,
            ground: groundResult
        };
    };

    /**
     * getBoneTransforms — Get the current bone rotation transforms computed last tick.
     * @returns {Object.<string, {rx: number, ry: number, rz: number}>} Map of bone name to rotation in radians.
     */
    Donkeycraft.EntityAnimationController.prototype.getBoneTransforms = function () {
        return this._cachedTransforms;
    };

    /**
     * getKinematics — Get the kinematic state for inspection/modification.
     * @returns {Donkeycraft.KinematicState} The current kinematic state.
     */
    Donkeycraft.EntityAnimationController.prototype.getKinematics = function () {
        return this._kinematics;
    };

    /**
     * setSpeed — Set entity horizontal movement speed and direction.
     * @param {number} speed - Speed in blocks/second (absolute value used).
     * @param {number} yaw - Movement direction in radians (0 = negative Z / forward).
     */
    Donkeycraft.EntityAnimationController.prototype.setSpeed = function (speed, yaw) {
        this._kinematics.setHorizontalSpeed(Math.abs(speed), yaw);
        this._lastSpeed = Math.abs(speed);
    };

    /**
     * applyVelocity — Directly set kinematic velocity components.
     * @param {number} vx - X velocity (blocks/s).
     * @param {number} vy - Y velocity (blocks/s).
     * @param {number} vz - Z velocity (blocks/s).
     */
    Donkeycraft.EntityAnimationController.prototype.applyVelocity = function (vx, vy, vz) {
        this._kinematics.velocity.x = vx || 0;
        this._kinematics.velocity.y = vy || 0;
        this._kinematics.velocity.z = vz || 0;
    };

    /**
     * Animation clip cache to avoid redundant object creation.
     * @type {Object.<string, Donkeycraft.AnimationClip>}
     * @private
     */
    var _animationClipCache = {};

    /**
     * LRU access order for cache eviction: [key1, key2, ...] (most recent at end).
     * @type {Array<string>}
     * @private
     */
    var _animationCacheOrder = [];

    /**
     * _getCachedClip — Retrieve a cached animation clip, promoting it to most-recently-used.
     * Returns null if the clip is not cached.
     * @private
     * @param {string} name - Clip name.
     * @returns {Donkeycraft.AnimationClip|null} Cached clip or null.
     */
    function _getCachedClip (name) {
        var idx = _animationCacheOrder.indexOf(name);
        if (idx === -1) return null;

        // Promote to most-recently-used
        _animationCacheOrder.splice(idx, 1);
        _animationCacheOrder.push(name);
        return _animationClipCache[name];
    }

    /**
     * _cacheClip — Cache an animation clip with LRU eviction when full.
     * @private
     * @param {string} name - Clip name.
     * @param {Donkeycraft.AnimationClip} clip - Clip to cache.
     */
    function _cacheClip (name, clip) {
        // Evict least-recently-used if at capacity
        while (_animationCacheOrder.length >= MAX_ANIMATION_CACHE_SIZE) {
            var oldest = _animationCacheOrder.shift();
            delete _animationClipCache[oldest];
        }

        _animationClipCache[name] = clip;

        var existingIdx = _animationCacheOrder.indexOf(name);
        if (existingIdx !== -1) {
            _animationCacheOrder.splice(existingIdx, 1);
        }
        _animationCacheOrder.push(name);
    }

    /**
     * clearAnimationClipCache — Clear all cached animation clips. Useful for memory management.
     */
    Donkeycraft.clearAnimationClipCache = function () {
        _animationClipCache = {};
        _animationCacheOrder = [];
    };

    /**
     * playAnimation — Immediately play a named animation (bypasses state machine auto-selection).
     * Uses cached clips when available to avoid redundant object creation.
     * @param {string} name - Animation clip name (must exist in Donkeycraft.AnimationDefinitions).
     */
    Donkeycraft.EntityAnimationController.prototype.playAnimation = function (name) {
        var def = Donkeycraft.AnimationDefinitions[name];
        if (!def) return;

        var cachedClip = _getCachedClip(name);
        if (!cachedClip) {
            cachedClip = new Donkeycraft.AnimationClip(name, def.duration, def.loop, def.keyframes);
            _cacheClip(name, cachedClip);
        }

        // Clone the cached clip so each entity gets its own independent instance.
        var animationClip = new Donkeycraft.AnimationClip(
            cachedClip.name,
            cachedClip.duration,
            cachedClip.loop,
            cachedClip.keyframes
        );
        this._stateMachine.registerState(name, animationClip);
        this._stateMachine.setState(name);
    };

    // ============================================================
    // Entity Type Database
    // ============================================================

    /**
     * EntityTypeDatabase — Entity type definitions (skeleton, animations, dimensions).
     * @type {Object.<string, {skeleton: string, animations: string[], height: number, width: number}>}
     */
    Donkeycraft.EntityTypeDB = {
        cow: {
            skeleton: 'quadruped',
            animations: ['idle', 'quadrupedWalk'],
            walkState: 'quadrupedWalk',
            height: 1.4,
            width: 1.4
        },
        pig: {
            skeleton: 'quadruped',
            animations: ['idle', 'quadrupedWalk'],
            walkState: 'quadrupedWalk',
            height: 0.9,
            width: 0.9
        },
        donkey: {
            skeleton: 'quadruped',
            animations: ['idle', 'quadrupedWalk'],
            walkState: 'quadrupedWalk',
            height: 1.6,
            width: 1.0
        },
        chicken: {
            skeleton: 'small',
            animations: ['idle', 'chickenBob'],
            walkState: 'chickenBob',
            height: 0.6,
            width: 0.4
        },
        zombie: {
            skeleton: 'bipedal',
            animations: ['idle', 'walk', 'run', 'attack', 'hurt'],
            walkState: 'walk',
            height: 1.9,
            width: 0.6
        },
        skeleton: {
            skeleton: 'bipedal',
            animations: ['idle', 'walk', 'run', 'attack', 'hurt'],
            walkState: 'walk',
            height: 1.9,
            width: 0.6
        },
        creeper: {
            skeleton: 'bipedal',
            animations: ['idle', 'walk', 'hurt'],
            walkState: 'walk',
            height: 1.7,
            width: 0.6
        },
        spider: {
            skeleton: 'quadruped',
            animations: ['idle', 'quadrupedWalk'],
            walkState: 'quadrupedWalk',
            height: 1.1,
            width: 1.4
        },
        enderman: {
            skeleton: 'bipedal',
            animations: ['idle', 'walk', 'run', 'hurt'],
            walkState: 'walk',
            height: 2.9,
            width: 0.6
        },
        player: {
            skeleton: 'bipedal',
            animations: ['idle', 'walk', 'run', 'attack', 'defend', 'hurt'],
            walkState: 'walk',
            height: 1.8,
            width: 0.6
        },
        npc: {
            skeleton: 'bipedal',
            animations: ['idle', 'walk', 'run', 'attack', 'defend', 'hurt'],
            walkState: 'walk',
            height: 1.8,
            width: 0.6
        },
        door: {
            skeleton: 'door',
            animations: ['doorOpen', 'doorClose'],
            height: 1.8,
            width: 0.75
        },
        sign_post: {
            skeleton: 'static',
            animations: ['idle'],
            height: 1.5,
            width: 0.5
        },
        chest: {
            skeleton: 'static',
            animations: ['idle'],
            height: 0.875,
            width: 0.98
        },
        furnace: {
            skeleton: 'static',
            animations: ['idle'],
            height: 1.0,
            width: 0.98
        },
        arrow: {
            skeleton: 'projectile',
            animations: [],
            height: 0.05,
            width: 0.05
        },
        snowball: {
            skeleton: 'projectile',
            animations: [],
            height: 0.25,
            width: 0.25
        }
    };

})();