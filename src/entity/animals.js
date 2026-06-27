// Donkeycraft — Animal-Specific Behavior
// Breeding, lead, name tags, baby speed for passive mobs.
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;
    var Config = Donkeycraft.Config;

    /**
     * Animal — extends PassiveMob with animal-specific features:
     * - Breeding: two animals of the same type in love mode produce a baby.
     * - Leads: players can lead animals with reduced speed.
     * - Baby speed: baby animals move 1.5x faster.
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
         * Baby animal speed multiplier (1.5x base speed).
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
         * Love mode cooldown timer (seconds before can enter love mode again).
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
         * Food item that triggers love mode (e.g., 'wheat' for cows).
         * @type {string}
         */
        this.foodItem = this._getFoodItem();

        /**
         * Age timer in ticks — babies start at negative age and grow to 0.
         * Negative values = baby, positive = adult with cooldown.
         * @type {number}
         */
        this.age = config.isBaby ? -24000 : 0;
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
     * Feed this animal — triggers love mode if the food matches.
     * @param {string} foodItem - Item name fed to the animal.
     * @returns {boolean} True if food was accepted.
     */
    Donkeycraft.Animal.prototype.feed = function(foodItem) {
        if (foodItem !== this.foodItem) {
            return false; // Wrong food
        }

        // If baby, accelerate growth
        if (this.isBaby && this.age < 0) {
            this.age += 6000; // Speed up growth by 6000 ticks per feed
            if (this.age >= 0) {
                // Fully grown — transition to adult
                this.isBaby = false;
                this.age = 0;
            }
            return true;
        }

        // If adult and on cooldown, check cooldown
        if (!this.isBaby && this._loveCooldown > 0) {
            return false; // Still in cooldown
        }

        // Enter love mode
        this.enterLoveMode();
        return true;
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
        this._loveCooldown = 0; // Cooldown starts at 0 — resets to 30 after breeding
    };

    /**
     * Exit love mode.
     */
    Donkeycraft.Animal.prototype.exitLoveMode = function() {
        this._inLove = false;
    };

    /**
     * Check if two animals can breed together.
     * Both must be same type, in love mode, and not babies.
     * @param {Donkeycraft.Animal} other - Other animal.
     * @returns {boolean} True if both can breed.
     */
    Donkeycraft.Animal.prototype.canBreedWith = function(other) {
        if (!other || other.type !== this.type) {
            return false; // Must be same type
        }

        return this.canBreed() && other.canBreed();
    };

    /**
     * Breed with another animal — creates a baby animal at midpoint.
     * @param {Donkeycraft.Animal} partner - Breeding partner.
     * @returns {Donkeycraft.Animal|null} Baby animal or null if breeding failed.
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

        // Emit breed event via global EventBus
        if (Donkeycraft.EventBus) {
            try {
                Donkeycraft.EventBus.emitSafe('animal:bred', {
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
     * Babies get 1.5x, led animals get 0.8x, both stack multiplicatively.
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
     * Tick method — handle love mode cooldown, lead following, age progression.
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

        // Age progression (babies grow over time — 1000 ticks per second of game time)
        if (this.isBaby && this.age < 0) {
            this.age += Math.floor(deltaTime * 1000);
            if (this.age >= 0) {
                // Fully grown — transition to adult
                this.isBaby = false;
                this.age = 0;
            }
        }

        // Lead following behavior
        if (this._onLead && this.leadOwner && this.leadOwner.getPosition) {
            var ownerPos = this.leadOwner.getPosition();
            if (ownerPos) {
                var dx = ownerPos.x - this._position.x;
                var dz = ownerPos.z - this._position.z;
                var dist = Math.sqrt(dx * dx + dz * dz);

                if (dist > 4) {
                    // Follow owner slowly — use getSpeedMultiplier() which accounts for baby speed and lead penalty
                    var speedMult = this.getSpeedMultiplier();
                    this._velocity.x = (dx / dist) * this.speed * speedMult * 0.5;
                    this._velocity.z = (dz / dist) * this.speed * speedMult * 0.5;
                } else {
                    this._velocity.x = 0;
                    this._velocity.z = 0;
                }
            }
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