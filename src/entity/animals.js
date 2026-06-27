// Donkeycraft — Animal-Specific Behavior
// Breeding, lead, name tags, baby speed for passive mobs.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Animal — extends PassiveMob with animal-specific features.
     * @param {object} config - Animal configuration.
     * @param {string} config.type - Mob type (cow, pig, sheep, chicken).
     * @param {number} [config.x=0] - Initial X position.
     * @param {number} [config.y=64] - Initial Y position.
     * @param {number} [config.z=0] - Initial Z position.
     * @param {boolean} [config.isBaby=false] - Whether this is a baby animal.
     */
    Donkeycraft.Animal = function(config) {
        config = config || {};

        // Call PassiveMob constructor
        Donkeycraft.PassiveMob.call(this, {
            type: config.type,
            x: config.x,
            y: config.y,
            z: config.z
        });

        /**
         * Whether this is a baby animal.
         * @type {boolean}
         */
        this.isBaby = !!config.isBaby;

        /**
         * Baby animal speed multiplier.
         * @type {number}
         */
        this.babySpeedMultiplier = 1.5;

        /**
         * Whether this animal is in "love mode" (wants to breed).
         * @type {boolean}
         * @private
         */
        this._inLove = false;

        /**
         * Love mode cooldown timer.
         * @type {number}
         * @private
         */
        this._loveCooldown = 0;

        /**
         * Whether this animal has been led by a player.
         * @type {boolean}
         * @private
         */
        this._onLead = false;

        /**
         * Lead owner entity (player).
         * @type {Donkeycraft.Entity|null}
         */
        this.leadOwner = null;

        /**
         * Food item that triggers love mode.
         * @type {string}
         */
        this.foodItem = this._getFoodItem();
    };

    // Inherit from PassiveMob
    Donkeycraft.Animal.prototype = Object.create(Donkeycraft.PassiveMob.prototype);
    Donkeycraft.Animal.prototype.constructor = Donkeycraft.Animal;

    /**
     * Get the food item that triggers love mode for this animal type.
     * @returns {string}
     * @private
     */
    Donkeycraft.Animal.prototype._getFoodItem = function() {
        var foodMap = {
            cow: 'wheat',
            pig: 'carrot',
            sheep: 'wheat',
            chicken: 'seed'
        };
        return foodMap[this.type] || 'wheat';
    };

    /**
     * Check if this animal can breed.
     * @returns {boolean}
     */
    Donkeycraft.Animal.prototype.canBreed = function() {
        return this._inLove && !this.isBaby && this._loveCooldown <= 0;
    };

    /**
     * Enter love mode.
     */
    Donkeycraft.Animal.prototype.enterLoveMode = function() {
        if (this.isBaby || this._inLove) {
            return;
        }

        this._inLove = true;
        this._loveCooldown = 30; // 30 seconds cooldown after breeding
    };

    /**
     * Exit love mode.
     */
    Donkeycraft.Animal.prototype.exitLoveMode = function() {
        this._inLove = false;
    };

    /**
     * Check if two animals can breed together.
     * @param {Donkeycraft.Animal} other - Other animal.
     * @returns {boolean} True if both can breed.
     */
    Donkeycraft.Animal.prototype.canBreedWith = function(other) {
        if (!other || other.type !== this.type) {
            return false;
        }

        return this.canBreed() && other.canBreed();
    };

    /**
     * Breed with another animal — creates a baby animal.
     * @param {Donkeycraft.Animal} partner - Breeding partner.
     * @returns {Donkeycraft.Animal|null} Baby animal or null.
     */
    Donkeycraft.Animal.prototype.breedWith = function(partner) {
        if (!this.canBreedWith(partner)) {
            return null;
        }

        // Exit love mode for both
        this.exitLoveMode();
        partner.exitLoveMode();

        // Reset cooldowns
        this._loveCooldown = 30;
        partner._loveCooldown = 30;

        // Calculate baby position (midpoint between parents)
        var babyX = (this._position.x + partner._position.x) / 2;
        var babyY = this._position.y;
        var babyZ = (this._position.z + partner._position.z) / 2;

        // Create baby animal
        var baby = new Donkeycraft.Animal({
            type: this.type,
            x: babyX,
            y: babyY,
            z: babyZ,
            isBaby: true
        });

        // Emit breed event
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emit('animal:bred', {
                    parent1: this,
                    parent2: partner,
                    baby: baby,
                    x: babyX,
                    y: babyY,
                    z: babyZ
                });
            } catch (e) {
                // EventBus may not be available in tests
            }
        }

        return baby;
    };

    /**
     * Set whether this animal is on a lead.
     * @param {boolean} led - True if on lead.
     * @param {Donkeycraft.Entity} [owner] - Lead owner entity.
     */
    Donkeycraft.Animal.prototype.setOnLead = function(led, owner) {
        this._onLead = !!led;
        if (this._onLead) {
            this.leadOwner = owner || null;
        } else {
            this.leadOwner = null;
        }
    };

    /**
     * Check if this animal is on a lead.
     * @returns {boolean}
     */
    Donkeycraft.Animal.prototype.isOnLead = function() {
        return this._onLead;
    };

    /**
     * Get the effective speed multiplier for this animal.
     * @returns {number}
     */
    Donkeycraft.Animal.prototype.getSpeedMultiplier = function() {
        var mult = this.isBaby ? this.babySpeedMultiplier : 1.0;
        if (this._onLead && this.leadOwner) {
            mult *= 0.8; // Slower when led
        }
        return mult;
    };

    /**
     * Tick method — handle love mode cooldown, lead following.
     * @param {number} deltaTime - Time since last tick in seconds.
     */
    Donkeycraft.Animal.prototype.tick = function(deltaTime) {
        // Call parent tick (wander + flee)
        Donkeycraft.PassiveMob.prototype.tick.call(this, deltaTime);

        // Decrease love cooldown
        if (this._loveCooldown > 0) {
            this._loveCooldown -= deltaTime;
            if (this._loveCooldown < 0) {
                this._loveCooldown = 0;
            }
        }

        // Lead following behavior
        if (this._onLead && this.leadOwner && this.leadOwner.getPosition) {
            var ownerPos = this.leadOwner.getPosition();
            var dx = ownerPos.x - this._position.x;
            var dz = ownerPos.z - this._position.z;
            var dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 4) {
                // Follow owner slowly
                var speedMult = this.getSpeedMultiplier();
                this._velocity.x = (dx / dist) * this.speed * speedMult * 0.5;
                this._velocity.z = (dz / dist) * this.speed * speedMult * 0.5;
            } else {
                this._velocity.x = 0;
                this._velocity.z = 0;
            }
        }

        // Baby animals have faster movement
        if (this.isBaby) {
            this._velocity.x *= this.babySpeedMultiplier;
            this._velocity.z *= this.babySpeedMultiplier;
        }
    };

    /**
     * Create an animal by type.
     * @param {string} type - Animal type (cow, pig, sheep, chicken).
     * @param {number} x - X position.
     * @param {number} y - Y position.
     * @param {number} z - Z position.
     * @param {boolean} [isBaby=false] - Whether this is a baby.
     * @returns {Donkeycraft.Animal|null}
     */
    Donkeycraft.Animal.create = function(type, x, y, z, isBaby) {
        if (!Donkeycraft.MobStats || !Donkeycraft.MobStats[type]) {
            return null; // Unknown type
        }

        return new Donkeycraft.Animal({
            type: type,
            x: x,
            y: y,
            z: z,
            isBaby: !!isBaby
        });
    };

})();