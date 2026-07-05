(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    /**
     * Cow — A passive mob entity that spawns as a cow.
     * @constructor
     * @extends Donkeycraft.PassiveMob
     * @param {Object} [config] - Entity configuration.
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     */
    Donkeycraft.Cow = function (config) {
        config = config || {};
        // Call PassiveMob constructor (it forwards type, x, y, z, height, width to Entity)
        Donkeycraft.PassiveMob.call(this, {
            type: 'cow',
            x: config.x,
            y: config.y,
            z: config.z
        });

        // Set properties that PassiveMob/Entity constructors don't forward from config
        this.displayName = config.displayName || 'Cow';
        this._isAggro = config.isAggro || false;
        this.showNametag = config.showNametag !== undefined ? !!config.showNametag : true;
        this.skeleton = config.skeleton || 'quadruped';
    };

    Donkeycraft.Cow.prototype = Object.create(Donkeycraft.PassiveMob.prototype);
    Donkeycraft.Cow.prototype.constructor = Donkeycraft.Cow;

    /**
     * _ensureAnimationSystem — Initialize skeletal animation after skeleton is set.
     * Called when skeleton/animation dependencies load after entity construction.
     * Fixes the race condition where Entity constructor sets useAnimation=true during
     * _initAnimationSystem(), but SkeletonTemplates may not be loaded yet.
     * @private
     */
    Donkeycraft.Cow.prototype._ensureAnimationSystem = function () {
        // Check if animation system is already fully initialized (bones + controller ready)
        if (this.bones && Array.isArray(this.bones) && this._animationController && this._animationController.getState) {
            return; // Already ready
        }

        // If no skeleton template available yet, skip (will be retried next tick)
        if (!this.skeleton || !Donkeycraft.SkeletonTemplates) {
            return;
        }

        var skeletonTemplate = Donkeycraft.SkeletonTemplates[this.skeleton];
        if (!skeletonTemplate || !Array.isArray(skeletonTemplate)) {
            return; // Skeleton not found, give up
        }

        // Set bones if not already set
        if (!this.bones) {
            this.bones = skeletonTemplate;
            this.useAnimation = true;
        }

        // Create animation controller if not already created
        if (!this._animationController) {
            var typeDef = Donkeycraft.EntityTypeDB ? Donkeycraft.EntityTypeDB[this.type] : null;
            this._createAnimationController(typeDef);
        }
    };

    // Auto-register type definition with EntityTypeDB
    if (Donkeycraft.EntityTypeDB) {
        Donkeycraft.EntityTypeDB.cow = {
            skeleton: 'quadruped',
            animations: ['quadrupedWalk', 'idle'],
            displayName: 'Cow',
            isAggro: false,
            showNametag: true,
            height: 1.4,
            width: 1.4
        };
    }

    // Auto-register shape definitions for rendering (defer if EntityShapeDefs not yet available)
    if (Donkeycraft.EntityShapeDefs) {
        if (!Donkeycraft.EntityShapeDefs.cow) {
            Donkeycraft.EntityShapeDefs.cow = [
                { name: 'body', meshType: 'box', dimensions: { w: 1.4, h: 1.0, d: 0.7 }, color: '#8B4513', offset: { x: 0, y: 0.5, z: 0 } },
                { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#A0522D', offset: { x: 0, y: 1.0, z: 0.7 } },
                { name: 'frontLeftLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513', offset: { x: -0.4, y: 0.35, z: 0.3 }, pivot: { x: 0, y: 0.35, z: 0 } },
                { name: 'frontRightLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513', offset: { x: 0.4, y: 0.35, z: 0.3 }, pivot: { x: 0, y: 0.35, z: 0 } },
                { name: 'rearLeftLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513', offset: { x: -0.4, y: 0.35, z: -0.3 }, pivot: { x: 0, y: 0.35, z: 0 } },
                { name: 'rearRightLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513', offset: { x: 0.4, y: 0.35, z: -0.3 }, pivot: { x: 0, y: 0.35, z: 0 } }
            ];
        }
    } else {
        // EntityShapeDefs not yet defined — register after entity-renderer.js loads
        var _registerCowShapeDef = function () {
            if (!Donkeycraft.EntityShapeDefs) {
                setTimeout(_registerCowShapeDef, 50);
                return;
            }
            if (!Donkeycraft.EntityShapeDefs.cow) {
                Donkeycraft.EntityShapeDefs.cow = [
                    { name: 'body', meshType: 'box', dimensions: { w: 1.4, h: 1.0, d: 0.7 }, color: '#8B4513', offset: { x: 0, y: 0.5, z: 0 } },
                    { name: 'head', meshType: 'box', dimensions: { w: 0.5, h: 0.5, d: 0.5 }, color: '#A0522D', offset: { x: 0, y: 1.0, z: 0.7 } },
                    { name: 'frontLeftLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513', offset: { x: -0.4, y: 0.35, z: 0.3 }, pivot: { x: 0, y: 0.35, z: 0 } },
                    { name: 'frontRightLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513', offset: { x: 0.4, y: 0.35, z: 0.3 }, pivot: { x: 0, y: 0.35, z: 0 } },
                    { name: 'rearLeftLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513', offset: { x: -0.4, y: 0.35, z: -0.3 }, pivot: { x: 0, y: 0.35, z: 0 } },
                    { name: 'rearRightLeg', meshType: 'cylinder', dimensions: { r: 0.1, h: 0.7 }, color: '#8B4513', offset: { x: 0.4, y: 0.35, z: -0.3 }, pivot: { x: 0, y: 0.35, z: 0 } }
                ];
            }
        };
        _registerCowShapeDef();
    }

    // ============================================================
    // Override tick to ensure animation system is initialized
    // ============================================================

    /**
     * tick — Override parent tick to ensure animation system is initialized,
     * then delegate to PassiveMob (which delegates to Entity).
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Cow.prototype.tick = function (deltaTime) {
        if (this._destroyed) return;

        // Ensure animation system is ready (handles deferred loading case)
        this._ensureAnimationSystem();

        // Call parent tick (PassiveMob → Entity)
        Donkeycraft.PassiveMob.prototype.tick.call(this, deltaTime);
    };

})();