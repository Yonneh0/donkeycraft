// Donkeycraft — Hostile Mobs
// Zombie, skeleton, spider, creeper, enderman — chase, attack, explode.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;
  var Config = Donkeycraft.Config;

  /**
   * MobType.HOSTILE — entity type constants for hostile mobs.
   * Merged safely to avoid overwriting PASSIVE or other types.
   */
  Donkeycraft.MobType = Donkeycraft.MobType || {};
  Donkeycraft.MobType.HOSTILE = {
    ZOMBIE: 'zombie',
    SKELETON: 'skeleton',
    SPIDER: 'spider',
    CREEPER: 'creeper',
    ENDERMAN: 'enderman',
  };

  /**
   * HostileMobStats — mob-specific statistics for hostile mobs.
   */
  Donkeycraft.HostileMobStats = {
    zombie: {
      health: 20,
      height: 1.9,
      width: 0.6,
      speed: 1.0,
      damage: 3,
      sightRange: 16,
      glow: false,
      attackInterval: 2,
    },
    skeleton: {
      health: 20,
      height: 1.9,
      width: 0.6,
      speed: 1.0,
      damage: 2,
      sightRange: 20,
      glow: false,
      attackInterval: 1.5,
    },
    spider: {
      health: 16,
      height: 1.1,
      width: 1.4,
      speed: 1.2,
      damage: 2,
      sightRange: 16,
      glow: false,
      attackInterval: 2,
    },
    creeper: {
      health: 10,
      height: 1.7,
      width: 0.6,
      speed: 1.0,
      damage: 25,
      sightRange: 10,
      glow: true,
      explodes: true,
      attackInterval: 1,
    },
    enderman: {
      health: 40,
      height: 2.9,
      width: 0.6,
      speed: 1.5,
      damage: 5,
      sightRange: 32,
      glow: false,
      teleports: true,
      attackInterval: 2,
    },
  };

  /**
   * HostileMob — base class for hostile mobs that chase and attack players.
   * @param {object} config - Mob configuration.
   * @param {string} config.type - Mob type (zombie, skeleton, spider, creeper, enderman).
   * @param {number} [config.x=0] - Initial X position.
   * @param {number} [config.y=64] - Initial Y position.
   * @param {number} [config.z=0] - Initial Z position.
   */
  Donkeycraft.HostileMob = function (config) {
    config = config || {};

    var stats = Donkeycraft.HostileMobStats[config.type];
    if (!stats) {
      stats = Donkeycraft.HostileMobStats.zombie; // Default to zombie
    }

    // Call base Entity constructor
    Donkeycraft.Entity.call(this, {
      type: config.type,
      x: config.x,
      y: config.y,
      z: config.z,
      height: stats.height,
      width: stats.width,
    });

    this.health = stats.health;
    this.maxHealth = stats.health;

    /**
     * Mob movement speed in blocks/second.
     * @type {number}
     */
    this.speed = stats.speed;

    /**
     * Melee/ranged damage dealt on hit.
     * @type {number}
     */
    this.damage = stats.damage;

    /**
     * Sight range in blocks for detecting players.
     * @type {number}
     */
    this.sightRange = stats.sightRange;

    /**
     * Whether the mob glows (visible through blocks).
     * @type {boolean}
     */
    this.glow = stats.glow || false;

    /**
     * Closest player within sight range.
     * @type {Donkeycraft.Player|null}
     * @private
     */
    this._targetPlayer = null;

    /**
     * Attack cooldown timer (seconds).
     * @type {number}
     * @private
     */
    this._attackCooldown = 0;

    /**
     * Attack interval in seconds.
     * @type {number}
     */
    this.attackInterval = stats.attackInterval || 2;

    /**
     * Whether the mob explodes on death/approach (creeper).
     * @type {boolean}
     */
    this.explodes = stats.explodes || false;

    /**
     * Whether the mob teleports (enderman).
     * @type {boolean}
     */
    this.teleports = stats.teleports || false;

    /**
     * Creeper ignition timer (for approaching players).
     * @type {number}
     * @private
     */
    this._creeperIgniteTimer = 0;

    /**
     * Whether the creeper is ignited (about to explode).
     * @type {boolean}
     * @private
     */
    this._isIgnited = false;

    /**
     * Last known player position for teleport tracking (enderman).
     * @type {{x: number, y: number, z: number}|null}
     * @private
     */
    this._lastPlayerPos = null;
  };

  // Inherit from Entity
  Donkeycraft.HostileMob.prototype = Object.create(
    Donkeycraft.Entity.prototype
  );
  Donkeycraft.HostileMob.prototype.constructor = Donkeycraft.HostileMob;

  /**
   * Find the closest player within sight range.
   * @param {Donkeycraft.Player} player - Player to check against.
   * @returns {boolean} True if a player was found.
   */
  Donkeycraft.HostileMob.prototype.findTargetPlayer = function (player) {
    var pos = this._position;
    var pPos = player.getPosition();

    var dx = pos.x - pPos.x;
    var dy = pos.y - pPos.y;
    var dz = pos.z - pPos.z;
    var distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance <= this.sightRange && player.isAlive()) {
      this._targetPlayer = player;
      return true;
    }

    this._targetPlayer = null;
    return false;
  };

  /**
   * Move toward a target position with optional Y-level adjustment.
   * @param {number} targetX - Target X.
   * @param {number} targetZ - Target Z.
   * @param {number} [targetY] - Optional target Y (for flying/jumping mobs).
   * @private
   */
  Donkeycraft.HostileMob.prototype._moveToward = function (
    targetX,
    targetZ,
    targetY
  ) {
    var dx = targetX - this._position.x;
    var dy = targetY !== undefined ? targetY - this._position.y : 0;
    var dz = targetZ - this._position.z;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 0.5) {
      this._velocity.x = (dx / dist) * this.speed;
      this._velocity.z = (dz / dist) * this.speed;
      // Adjust vertical movement if target Y provided
      if (targetY !== undefined) {
        this._velocity.y = (dy / dist) * this.speed * 0.5;
      }
    } else {
      this._velocity.x = 0;
      this._velocity.z = 0;
      this._velocity.y = 0;
    }
  };

  /**
   * Check if close enough to attack the target player.
   * @returns {boolean}
   * @private
   */
  Donkeycraft.HostileMob.prototype._isCloseEnoughToAttack = function () {
    if (!this._targetPlayer) {
      return false;
    }

    var dx = this._position.x - this._targetPlayer.getPosition().x;
    var dz = this._position.z - this._targetPlayer.getPosition().z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    return dist < 2.5; // Melee range
  };

  /**
   * Attack the target player.
   */
  Donkeycraft.HostileMob.prototype.attack = function () {
    if (!this._targetPlayer) {
      return;
    }

    // Check if target is alive (only if it has isAlive method)
    if (
      typeof this._targetPlayer.isAlive === 'function' &&
      !this._targetPlayer.isAlive()
    ) {
      return;
    }

    // Check if on cooldown
    if (this._attackCooldown > 0) {
      return;
    }

    this._attackCooldown = this.attackInterval;

    // Deal damage to player through available systems — Player is the single source of truth
    if (typeof this._targetPlayer.takeDamage === 'function') {
      // Player has direct takeDamage method
      this._targetPlayer.takeDamage(this.damage, this.type);
    } else if (this._targetPlayer.health !== undefined) {
      // Player has simple health property (from entity.js)
      this._targetPlayer.health = Math.max(
        0,
        this._targetPlayer.health - this.damage
      );
      if (this._targetPlayer.health <= 0) {
        this._targetPlayer.setAlive(false);
      }
    }

    // Always emit damage event via global EventBus for external systems
    if (Donkeycraft.EventBus) {
      try {
        Donkeycraft.EventBus.emitSafe('entity:damage', {
          attacker: this,
          target: this._targetPlayer,
          damage: this.damage,
          source: this.type,
        });
      } catch (e) {
        // EventBus may not be available in tests
      }
    }
  };

  /**
   * Handle creeper proximity ignition.
   * @param {Donkeycraft.Player} player - Player to check proximity against.
   */
  Donkeycraft.HostileMob.prototype.handleCreeperProximity = function (player) {
    if (!this.explodes) {
      return;
    }

    var dx = this._position.x - player.getPosition().x;
    var dz = this._position.z - player.getPosition().z;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 3 && !this._isIgnited) {
      // Start igniting
      this._isIgnited = true;
      this._creeperIgniteTimer = 1.5; // 1.5 seconds to explode
    } else if (dist >= 4 && this._isIgnited) {
      // Player moved away — cancel ignition (slightly larger range to prevent flickering)
      this._isIgnited = false;
      this._creeperIgniteTimer = 0;
    }
  };

  /**
   * Explode the creeper (if applicable).
   * @returns {boolean} True if explosion occurred.
   */
  Donkeycraft.HostileMob.prototype.explode = function () {
    if (!this.explodes || !this._isIgnited) {
      return false;
    }

    // Emit explosion event via global EventBus
    if (Donkeycraft.EventBus) {
      try {
        Donkeycraft.EventBus.emitSafe('entity:explode', {
          entity: this,
          x: Math.floor(this._position.x),
          y: Math.floor(this._position.y),
          z: Math.floor(this._position.z),
          radius: 4,
        });
      } catch (e) {
        // EventBus may not be available in tests
      }
    }

    return true;
  };

  /**
   * Teleport the enderman randomly (short-range teleport for repositioning).
   */
  Donkeycraft.HostileMob.prototype.teleportRandomly = function () {
    if (!this.teleports) {
      return;
    }

    // Teleport to a random position within 8 blocks
    var offsetX = (Math.random() - 0.5) * 16;
    var offsetY = (Math.random() - 0.5) * 4;
    var offsetZ = (Math.random() - 0.5) * 16;

    this._position.x += offsetX;
    this._position.y += offsetY;
    this._position.z += offsetZ;

    // Emit teleport event via global EventBus
    if (Donkeycraft.EventBus) {
      try {
        Donkeycraft.EventBus.emitSafe('entity:teleport', {
          entity: this,
          oldX: this._position.x - offsetX,
          oldY: this._position.y - offsetY,
          oldZ: this._position.z - offsetZ,
          newX: this._position.x,
          newY: this._position.y,
          newZ: this._position.z,
        });
      } catch (e) {
        // EventBus may not be available in tests
      }
    }
  };

  /**
   * Called when the mob dies.
   * @private
   */
  Donkeycraft.HostileMob.prototype.onDeath = function () {
    if (this.explodes && this._isIgnited) {
      this.explode();
    }
  };

  /**
   * Tick method — chase players, attack on contact.
   * @param {number} deltaTime - Time since last tick in seconds.
   */
  Donkeycraft.HostileMob.prototype.tick = function (deltaTime) {
    if (this._destroyed) return;

    // Call base tick (applies velocity to position)
    Donkeycraft.Entity.prototype.tick.call(this, deltaTime);

    // Decrease attack cooldown
    this._attackCooldown -= deltaTime;

    // Handle creeper ignition
    if (this._isIgnited) {
      this._creeperIgniteTimer -= deltaTime;
      if (this._creeperIgniteTimer <= 0) {
        this.explode();
        this.setAlive(false);
        return;
      }
    }

    // Chase target player (only if it has isAlive method and is alive)
    if (
      this._targetPlayer &&
      (typeof this._targetPlayer.isAlive !== 'function' ||
        this._targetPlayer.isAlive())
    ) {
      var pPos = this._targetPlayer.getPosition();
      this._moveToward(pPos.x, pPos.z, pPos.y);

      // Auto-ignite creepers when near target player
      if (this.explodes) {
        this.handleCreeperProximity(this._targetPlayer);
      }

      // Enderman: periodically teleport randomly
      if (this.teleports && Math.random() < 0.005) {
        this.teleportRandomly();
      }

      // Attack if close enough
      if (this._isCloseEnoughToAttack()) {
        this.attack();
      }
    } else {
      // No target — wander randomly
      this._velocity.x = 0;
      this._velocity.z = 0;
    }

    // Simple gravity
    this._velocity.y -= Config.GRAVITY * deltaTime * 0.1;
    if (this._velocity.y < -5) {
      this._velocity.y = -5;
    }
  };

  /**
   * Create a hostile mob by type.
   * @param {string} type - Mob type (zombie, skeleton, spider, creeper, enderman).
   * @param {number} x - X position.
   * @param {number} y - Y position.
   * @param {number} z - Z position.
   * @returns {Donkeycraft.HostileMob|null}
   */
  Donkeycraft.HostileMob.create = function (type, x, y, z) {
    if (!Donkeycraft.HostileMobStats[type]) {
      return null; // Unknown type
    }

    return new Donkeycraft.HostileMob({
      type: type,
      x: x,
      y: y,
      z: z,
    });
  };
})();
