(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    /**
     * ElegantStoneDoubleDoor — A decorative double door entity that can be opened and closed.
     * @constructor
     * @extends Donkeycraft.Entity
     * @param {Object} [config] - Entity configuration.
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     * @param {boolean} [config.isOpen=false] - Whether the door starts open.
     */
    Donkeycraft.ElegantStoneDoubleDoor = function (config) {
        config = config || {};

        // Call parent constructor
        Donkeycraft.Entity.call(this, {
            type: 'elegant_stone_double_door',
            x: config.x,
            y: config.y,
            z: config.z,
            height: 2.0,
            width: 1.6,
            displayName: 'Stone Door',
            isAggro: false,
            showNametag: false,
            skeleton: 'door'
        });

        // Door state
        this.isOpen = config.isOpen || false;
        this.openProgress = config.isOpen ? 1.0 : 0.0;
        this.isAnimating = false;
        this.animationSpeed = 2.0; // Speed of door open/close animation
    };

    Donkeycraft.ElegantStoneDoubleDoor.prototype = Object.create(Donkeycraft.Entity.prototype);
    Donkeycraft.ElegantStoneDoubleDoor.prototype.constructor = Donkeycraft.ElegantStoneDoubleDoor;

    /**
     * open — Open the door (start animation).
     */
    Donkeycraft.ElegantStoneDoubleDoor.prototype.open = function () {
        if (this.isOpen || this.isAnimating) return;
        this.isOpen = true;
        this.isAnimating = true;
    };

    /**
     * close — Close the door (start animation).
     */
    Donkeycraft.ElegantStoneDoubleDoor.prototype.close = function () {
        if (!this.isOpen || this.isAnimating) return;
        this.isOpen = false;
        this.isAnimating = true;
    };

    /**
     * toggle — Toggle the door state.
     */
    Donkeycraft.ElegantStoneDoubleDoor.prototype.toggle = function () {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    };

    /**
     * tick — Override parent tick to handle door animation.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.ElegantStoneDoubleDoor.prototype.tick = function (deltaTime) {
        // Call parent tick first
        Donkeycraft.Entity.prototype.tick.call(this, deltaTime);

        // Handle door animation progress update (only while animating)
        if (this.isAnimating) {
            var targetProgress = this.isOpen ? 1.0 : 0.0;
            var speed = this.animationSpeed * deltaTime;

            if (this.openProgress < targetProgress) {
                this.openProgress = Math.min(this.openProgress + speed, targetProgress);
            } else if (this.openProgress > targetProgress) {
                this.openProgress = Math.max(this.openProgress - speed, targetProgress);
            }

            // Animation complete
            if (Math.abs(this.openProgress - targetProgress) < 0.01) {
                this.openProgress = targetProgress;
                this.isAnimating = false;
            }
        }

        // Always update door panel animation state — even after animation completes,
        // the forced state must persist to prevent auto-selection from reverting to 'idle'.
        if (this._animationController) {
            if (this.openProgress > 0 && this.openProgress < 1) {
                // During animation, hold the current target state with duration matching remaining animation time
                var remainingTime = this.isOpen ?
                    (1.0 - this.openProgress) / this.animationSpeed :
                    this.openProgress / this.animationSpeed;
                this._animationController.setForcedState(this.isOpen ? 'doorOpen' : 'doorClose', Math.max(remainingTime, 0.05));
            } else if (this.openProgress >= 1.0) {
                // Animation complete — keep state permanently forced so auto-selection doesn't override it.
                // Static entities (doors, signs, chests) must never revert to 'idle' based on speed=0.
                this._animationController.setForcedState('doorOpen', Infinity);
            } else {
                // openProgress <= 0 — door is fully closed
                this._animationController.setForcedState('doorClose', Infinity);
            }
        }
    };

    // Auto-register type definition with EntityTypeDB
    if (Donkeycraft.EntityTypeDB) {
        Donkeycraft.EntityTypeDB.elegant_stone_double_door = {
            skeleton: 'door',
            animations: ['doorOpen', 'doorClose'],
            displayName: 'Stone Door',
            isAggro: false,
            showNametag: false,
            height: 2.0,
            width: 1.6
        };
    }

    // Auto-register shape definitions for rendering (defer if EntityShapeDefs not yet available)
    // Bone names MUST match the 'door' skeleton template: ['root', 'doorPanel']
    // Shape offset must align with skeleton template's doorPanel offset {x:0, y:0.9, z:0}
    // and pivot {x:-0.45, y:0, z:0} for correct hinge rotation.
    if (Donkeycraft.EntityShapeDefs) {
        if (!Donkeycraft.EntityShapeDefs.elegant_stone_double_door) {
            Donkeycraft.EntityShapeDefs.elegant_stone_double_door = [
                { name: 'doorPanel', meshType: 'box', dimensions: { w: 0.8, h: 2.0, d: 0.15 }, color: '#808080', offset: { x: 0, y: 0.9, z: 0 } }
            ];
        }
    } else {
        // EntityShapeDefs not yet defined — register after entity-renderer.js loads
        var _registerDoorShapeDef = function () {
            if (!Donkeycraft.EntityShapeDefs) {
                setTimeout(_registerDoorShapeDef, 50);
                return;
            }
            if (!Donkeycraft.EntityShapeDefs.elegant_stone_double_door) {
                Donkeycraft.EntityShapeDefs.elegant_stone_double_door = [
                    { name: 'doorPanel', meshType: 'box', dimensions: { w: 0.8, h: 2.0, d: 0.15 }, color: '#808080', offset: { x: 0, y: 0.9, z: 0 } }
                ];
            }
        };
        _registerDoorShapeDef();
    }

})();
