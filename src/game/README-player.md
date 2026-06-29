# Player Systems Subsystem

Handles the player entity, movement physics, collision detection, jumping, flying, game mode behaviors, hunger mechanics, and player statistics. This is the most interconnected subsystem, depending on chunks, collision, and multiple game systems.

## Table of Contents

- [Overview](#overview)
- [Player Entity](#playerjs)
- [Movement Physics](#movementjs)
- [Collision Detection](#collisionjs)
- [Jump Mechanics](#jumpingjs)
- [Flying System](#flyingjs)
- [Game Mode System](#game-modejs)
- [Hunger System](#hungerjs)
- [Player Statistics](#statsjs)
- [Cross-references](#cross-references)

---

## Overview

The Player subsystem manages the player character from input to physics to game state. It reads input keys and applies movement physics, handles collision resolution against blocks and entities, manages game mode behaviors (survival, creative, spectator), tracks hunger mechanics with starvation damage, and records player statistics.

**Dependencies:**
- `chunk-manager.js` — Block lookups for collision and liquid detection
- `entity.js` — Player inherits from Entity base class
- `damage.js` — HurtBox integration for fall damage application
- `hunger.js` — Hunger degradation tracking in movement system
- `stats.js` — Records distance, blocks mined/placed, combat events

---

## Files

### [player.js](player.js) — Player Entity

Represents the player entity with position, velocity, rotation, dimensions (1.8×0.6), and game mode state. Central object that all player subsystems operate on.

**Key Class:**
- `Donkeycraft.Player(config)` — Player entity constructor

**Constructor Options:**
```js
{
  x: 0, y: 64, z: 0,       // Initial position
  gameMode: 'survival'      // 'survival', 'creative', or 'spectator'
}
```

**Player API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getPosition()` | `Vector3` | Current position (center) |
| `setPosition(x, y, z)` | `void` | Set position |
| `getVelocity()` | `Vector3` | Current velocity (blocks/s) |
| `setVelocity(vx, vy, vz)` | `void` | Set velocity |
| `getRotation()` | `{yaw, pitch}` | Rotation in radians |
| `setRotation(yaw, pitch)` | `void` | Set rotation (yaw normalized to [0, 2π)) |
| `adjustYaw(deltaYaw)` | `void` | Adjust yaw by delta |
| `adjustPitch(deltaPitch)` | `void` | Adjust pitch (clamped to [-π/2, π/2]) |
| `getDimensions()` | `{height, width}` | Player dimensions |
| `getGameMode()` | `string` | Current game mode |
| `setGameMode(mode)` | `void` | Set game mode (disables flying in survival) |
| `isAlive()` | `boolean` | Alive check |
| `setAlive(alive)` | `void` | Set alive/dead |
| `getEyePosition()` | `Vector3` | Eye position for raycasting |
| `getHurtBox()` | `{minX, minY, minZ, maxX, maxY, maxZ}` | Player AABB bounding box |
| `getForwardDirection()` | `Vector3` | Forward direction vector (normalized) |
| `getRightDirection()` | `Vector3` | Right direction vector (90° clockwise from forward) |
| `getKnockback()` | `Vector3` | Current knockback velocity |
| `applyKnockback(direction, strength, upwardForce)` | `void` | Apply knockback |
| `clearKnockback()` | `void` | Clear knockback velocity |
| `trackFallDistance(deltaY)` | `void` | Track downward displacement for fall damage |
| `getFallDistance()` | `number` | Current fall distance (blocks) |
| `onTick(callback)` | `Function` | Subscribe to tick (returns unsubscribe function) |
| `destroy()` | `void` | Free resources |

**Properties:**
- `height` — Player height (default 1.8 blocks)
- `width` — Player width (default 0.6 blocks)
- `gameMode` — Current game mode string
- `onGround` — Updated by collision resolution each tick
- `flyEnabled` — Creative/spectator fly toggle
- `maxFallDistance` — Reset on landing, used for fall damage
- `alive` — Death state

---

### [movement.js](movement.js) — Movement Physics

Handles walking, sprinting, swimming, flying, and gravity. Reads input keys and applies physics. Integrates with hunger system for degradation tracking.

**Key Class:**
- `Donkeycraft.Movement(input, player, collision, chunkManager)` — Movement system

**Constructor Dependencies:**
- `input` — Input handler instance
- `player` — Player entity instance
- `collision` — Collision detection instance
- `chunkManager` — For block lookups (lava detection)

**Movement API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `setHurtBox(hurtBox)` | `void` | Reference for fall damage application |
| `setHungerSystem(hungerSystem)` | `void` | Reference for degradation tracking |
| `tick(deltaTime)` | `void` | Main movement tick (reads input, applies physics) |
| `getHorizontalSpeed()` | `number` | Current horizontal speed (blocks/s) |
| `isSwimming()` | `boolean` | Player body in water |
| `isInWater()` | `boolean` | Player's eyes in water |
| `isInLava()` | `boolean` | Player in lava (multi-point check) |
| `getGameMode()` | `string` | Current game mode |
| `setGameMode(mode)` | `void` | Set game mode |
| `destroy()` | `void` | Free references |

**Movement Modes:**
- **Survival**: Walking + gravity + swimming buoyancy + fall damage
- **Creative Flying**: Space/Shift for vertical, no gravity, collision resolution
- **Spectator**: Clip through blocks, always fly, no collision

**Key Behaviors:**
- Horizontal speed: `Config.PLAYER_SPEED` (walking) or `Config.PLAYER_SPRINT_SPEED` (sprinting)
- Fly speed: `Config.PLAYER_FLY_SPEED` (no sprint boost in creative/spectator)
- Terminal velocity: `Config.TERMINAL_VELOCITY` (-20 blocks/s downward)
- Gravity: `Config.GRAVITY * deltaTime` per tick
- Swimming: velocity × 0.85 damping, buoyancy +0.1, jump adds +0.15 upward
- Hunger degradation: sprint = 1 food/2.5 blocks, walk = 1 food/8 blocks

---

### [collision.js](collision.js) — Collision Detection

AABB collision detection and response against solid blocks. Used by movement system.

**Key Class:**
- `Donkeycraft.Collision(chunkManager, config)` — Collision system

**Collision API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `checkMovement(position, width, height, deltaX, deltaY, deltaZ)` | `{collisionX, collisionY, collisionZ}` | Check per-axis collisions |
| `resolveMovement(position, velocity, width, height)` | `{newX, newY, newZ, onGround}` | Resolve with collision (per-axis) |
| `isBlockSolid(gx, gy, gz)` | `boolean` | Block blocks movement |
| `isBlockReplaceable(gx, gy, gz)` | `boolean` | Block is air/liquid/plant |
| `isBlockLiquid(gx, gy, gz)` | `boolean` | Block is water or lava |
| `getOverlappingBlocks(minX, minY, minZ, maxX, maxY, maxZ)` | `Array{x, y, z, blockId}` | All solid blocks in AABB |
| `checkEntityCollision(position, width, height, entities)` | `Entity|null` | First entity overlap |
| `getChunkManager()` | `ChunkManager` | Reference to chunk manager |
| `destroy()` | `void` | Free references |

**Resolution Order:** X → Y → Z (per-axis resolution prevents getting stuck)
- X axis: if collision, deltaX = 0
- Y axis: if collision and deltaY < 0, onGround = true
- Z axis: if collision, deltaZ = 0

---

### [jumping.js](jumping.js) — Jump Mechanics

Handles jump force, cooldown, and swimming upward motion.

**Key Class:**
- `Donkeycraft.Jumping(player, input, collision)` — Jump system

**Constructor Dependencies:**
- `player` — Player entity
- `input` — Input handler (for JUMP key detection)
- `collision` — For liquid detection (swimming)

**Jumping API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `tick(deltaTime)` | `void` | Main tick (handles jump cooldown, swimming) |
| `canJump()` | `boolean` | On ground and cooldown expired |
| `performJump()` | `boolean` | Apply jump force (true if performed) |
| `isSwimmingUp()` | `boolean` | In water + JUMP key pressed |
| `getJumpForce()` | `number` | Jump force from config |
| `getCooldown()` | `number` | Remaining cooldown (seconds) |
| `destroy()` | `void` | Free references |

**Key Behaviors:**
- Jump force: `Config.PLAYER_JUMP_FORCE` (vertical velocity)
- Cooldown: `Config.JUMP_COOLDOWN` (prevents rapid double-jumps)
- Swimming: upward boost handled by `Movement._tickSurvival()` (not here)
- Spectator/Creative Flying: no jumping (vertical controlled by Space/Shift)

---

### [flying.js](flying.js) — Flying System

Manages creative and spectator flying state. Physics application delegated to Movement.

**Key Class:**
- `Donkeycraft.Flying(player, input)` — Flying system

**Constructor Dependencies:**
- `player` — Player entity
- `input` — Input handler (for sprint detection in fly speed)

**Flying API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `tick(deltaTime)` | `void` | Tick (state management only, physics in Movement) |
| `isFlying()` | `boolean` | Currently flying (spectator always true) |
| `toggleFlyMode()` | `boolean` | Toggle creative fly (F key) |
| `enableFlyMode()` | `boolean` | Enable fly (creative/spectator only) |
| `disableFlyMode()` | `boolean` | Disable fly (spectator cannot disable) |
| `getFlySpeed()` | `number` | Fly speed (sprint-boosted or normal) |
| `canSpectate()` | `boolean` | In spectator mode |
| `shouldClipThroughBlocks()` | `boolean` | Spectator mode only |
| `isEnabled()` | `boolean` | Creative fly flag state |
| `setEnabled(enabled)` | `void` | Set creative fly flag |
| `destroy()` | `void` | Free references |

**Key Behaviors:**
- Spectator: always flies, clips through blocks (no collision in movement)
- Creative: requires toggle (`_flyEnabled` flag), collides with blocks
- Fly speed: `Config.PLAYER_FLY_SPEED` or `Config.PLAYER_FLY_SPEED_BOOST` (sprinting)
- Terminal velocity: `Config.FLYING_TERMINAL_VELOCITY` (-20 downward)

---

### [game-mode.js](game-mode.js) — Game Mode System

Manages Survival/Creative/Spectator mode behaviors and restrictions.

**Key Class:**
- `Donkeycraft.GameMode(player)` — Game mode system

**GameMode API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getGameMode()` | `string` | Current game mode |
| `setGameMode(mode)` | `void` | Set mode (transitions: disables flying in survival) |
| `isSurvival()` | `boolean` | In survival mode |
| `isCreative()` | `boolean` | In creative mode |
| `isSpectator()` | `boolean` | In spectator mode |
| `canTakeDamage()` | `boolean` | False for creative |
| `canPlaceBlocks()` | `boolean` | False for spectator |
| `canBreakBlocks()` | `boolean` | False for spectator |
| `hasInfiniteItems()` | `boolean` | True for creative |
| `toggleCreativeFly()` | `boolean` | Toggle fly in creative mode |
| `enableCreativeFly()` | `boolean` | Enable fly (creative only) |
| `disableCreativeFly()` | `boolean` | Disable fly (spectator cannot) |
| `isCreativeFlying()` | `boolean` | Creative flying active |
| `canInteract()` | `boolean` | False for spectator |
| `canPickupItems()` | `boolean` | False for spectator |
| `isVulnerable()` | `boolean` | Same as canTakeDamage |
| `getStackLimit()` | `number` | Stack size limit (64 for creative) |
| `tick(deltaTime)` | `void` | Tick (notifies subscribers) |
| `onTick(callback)` | `Function` | Subscribe to tick |
| `destroy()` | `void` | Free references |

**Event Emission:**
- `gameMode:changed` — Emitted when mode changes (oldMode → newMode)
- `flyMode:changed` — Emitted when creative fly toggled

---

### [hunger.js](hunger.js) — Hunger System

Manages hunger mechanics: food level, saturation, starvation damage, and auto-regeneration. Integrated with Movement for degradation tracking and HurtBox for health-based effects.

**Key Class:**
- `Donkeycraft.Hunger(player, hurtBox)` — Hunger system

**Constructor Dependencies:**
- `player` — Player entity instance
- `hurtBox` — Optional HurtBox instance for health-based regen/starvation

**Hunger API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getFoodLevel()` | `number` | Food level (0–20) |
| `setFoodLevel(level)` | `void` | Set food level (clamped 0–20) |
| `getSaturation()` | `number` | Saturation value |
| `setSaturation(saturation)` | `void` | Set saturation value |
| `isStarving()` | `boolean` | Food level = 0? |
| `consumeFood(foodValue, saturationRatio)` | `number` | Restore food (returns actual restored) |
| `hasFood()` | `boolean` | Has food > 0? |
| `getSaturationFraction()` | `number` | Saturation as fraction of max (0–1) |
| `applySprintDegradation(distance)` | `void` | Apply sprint hunger drain |
| `applyWalkDegradation(distance)` | `void` | Apply walk hunger drain |
| `tick(deltaTime)` | `void` | Handle starvation, auto-regeneration |
| `reset()` | `void` | Full hunger reset |
| `destroy()` | `void` | Free references |

**Hunger Mechanics:**
| Condition | Behavior |
|-----------|----------|
| Saturation > 0, food > 0 | Drain saturation ~1/sec, regenerate if health < max |
| Food > 18, health < max | ~25% chance per second to heal 1 HP |
| Food = 0, health ≤ threshold | 1 HP starvation damage every 4 seconds |
| Creative mode | No hunger, full food and saturation always |

**Starvation Threshold:** `min(5, maxHealth / 2)` — only takes damage below this health

**Hunger Degradation Rates:**
| Activity | Rate |
|----------|------|
| Sprinting | 1 food per 2.5 blocks |
| Walking | 1 food per 8 blocks |

**Event Emission:**
- `hunger:changed` — Emitted on food level change with {foodLevel, delta}

---

### [stats.js](stats.js) — Player Statistics

Tracks player statistics: blocks mined/placed, mobs killed, distance walked, time played, and combat events.

**Key Class:**
- `Donkeycraft.PlayerStats(player)` — Stats system

**PlayerStats API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `increment(statName, amount=1)` | `void` | Increment stat |
| `getStat(statName)` | `number` | Get stat value |
| `setStat(statName, value)` | `void` | Set stat value |
| `getAllStats()` | `Object` | All stats as plain object |
| `getStatsByPrefix(prefix)` | `Object` | Filter by prefix |
| `tick(deltaTime)` | `void` | Update time-based stats |
| `recordDistance(distance, type)` | `void` | Record movement distance |
| `recordBlockMine(blockId)` | `void` | Record block mined |
| `recordBlockPlace(blockId)` | `void` | Record block placed |
| `recordBlockInteract(blockId)` | `void` | Record block interaction |
| `recordDamageDealt(amount)` | `void` | Record damage dealt |
| `recordDamageTaken(amount, source)` | `void` | Record damage taken |
| `recordEntityKill(entityType)` | `void` | Record entity kill |
| `recordDeath(cause)` | `void` | Record player death |
| `getTimeSinceDeath()` | `number` | Seconds since last death |
| `serialize()` | `Object` | Serialized state |
| `fromObject(data)` | `void` | Restore from data |
| `reset()` | `void` | Reset all stats to zero |
| `destroy()` | `void` | Free references |

**Key Stat Categories:**
| Category | Stats |
|----------|-------|
| Movement | `distanceWalked`, `distanceSprinted`, `distanceSwum`, `distanceFallen`, `jumpCount` |
| Blocks | `blockMine`, `blockPlaced`, `blockInteractedWith` |
| Combat | `damageDealt`, `damageTaken`, `mobsKilled`, `deaths` |
| Items | `itemUsed`, `itemDropped`, `itemPickedUp`, `chestOpened` |
| Time | `tickPlayed`, `timePlayed`, `timeSinceDeath` |

**Event Emission:**
- `stat:changed` — Emitted on increment with {name, value}

---

## Cross-references

- See [README-combat.md](README-combat.md) — HurtBox applies fall damage tracked by player; experience system tracks kills recorded by stats
- See [README-npc.md](README-npc.md) — Player stats track entity kills; hostile mobs chase the player
- See [README-world.md](README-world.md) — Collision detection uses ChunkManager for block lookups
- See [README-interaction.md](README-interaction.md) — Block placement/breaking records stats