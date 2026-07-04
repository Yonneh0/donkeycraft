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
| `getEyePosition()` | `Vector3` | Eye position for raycasting (y + 1.62) |
| `getHurtBox()` | `{minX, minY, minZ, maxX, maxY, maxZ}` | Player AABB bounding box |
| `getForwardDirection()` | `Vector3` | Forward direction vector (normalized) |
| `getRightDirection()` | `Vector3` | Right direction vector (90° clockwise from forward) |
| `getKnockback()` | `Vector3` | Current knockback velocity |
| `applyKnockback(direction, strength, upwardForce)` | `void` | Apply knockback |
| `clearKnockback()` | `void` | Clear knockback velocity |
| `trackFallDistance(deltaY)` | `void` | Track downward displacement for fall damage (positive = falling) |
| `getFallDistance()` | `number` | Current fall distance in blocks |
| `onTick(callback)` | `Function` | Subscribe to tick (returns unsubscribe function) |
| `destroy()` | `void` | Free resources |

**Properties:**
- `height` — Player height (default 1.8 blocks, from `Config.PLAYER_HEIGHT`)
- `width` — Player width (default 0.6 blocks, from `Config.PLAYER_WIDTH`)
- `gameMode` — Current game mode string (`'survival'`, `'creative'`, `'spectator'`)
- `onGround` — Updated by collision resolution each tick
- `flyEnabled` — Creative/spectator fly toggle (false in survival)
- `maxFallDistance` — Accumulated downward displacement; reset on landing
- `alive` — Death state

**Key Behaviors:**
- Position is stored as center point (not corner)
- Yaw is normalized to [0, 2π) using modulo arithmetic
- Pitch is clamped to [-π/2, π/2] (straight down to straight up)
- Fall distance tracking: positive deltaY values are accumulated; reset handled by Movement system
- Knockback is stored as velocity and applied separately from normal movement

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
| `setMouseLocked(locked)` | `void` | Set pointer lock state (A/D turn vs strafe) |
| `setLockedSpeed(mode)` | `void` | Force speed mode override (`'sneak'`, `'walk'`, `'run'`, `'turbo'`) |
| `setSpeedLockClearedCallback(callback)` | `void` | Set callback when speed lock is cleared by code |
| `getActiveSpeedMode()` | `string` | Current active speed mode for UI display (respects lock) |
| `tick(deltaTime)` | `void` | Main movement tick (reads input, applies physics) |
| `getHorizontalSpeed()` | `number` | Current horizontal speed (blocks/s) |
| `isSwimming()` | `boolean` | Player body in water |
| `isInWater()` | `boolean` | Player's eyes in water |
| `isInLava()` | `boolean` | Player in lava (multi-point check) |
| `getGameMode()` | `string` | Current game mode |
| `setGameMode(mode)` | `void` | Set game mode |
| `destroy()` | `void` | Free references |

**Movement Modes:**
| Mode | Speed (blocks/s) | Behavior |
|------|------------------|----------|
| Walking | `Config.PLAYER_SPEED` | Normal movement |
| Sneaking | `Config.PLAYER_SNEAK_SPEED` | Slow, consistent |
| Sprinting | `Config.PLAYER_SPRINT_SPEED` | ~60% faster, drains hunger |
| Flying | `Config.PLAYER_FLY_SPEED` | No gravity, Space/Shift vertical |
| Turbo (Creative) | `Config.PLAYER_TURBO_SPEED` | Double fly speed |
| Spectator | `Config.PLAYER_FLY_SPEED` | Clip through blocks |

**Internal Methods:**
- `_getSpeedModeFromInput(gameMode)` — Determines speed mode from current key input (sneak > sprint priority; sprint disabled in creative)
- `_getSpeedForMode(mode, gameMode)` — Returns speed value for a given mode string
- `_isPlayerInLiquid(pos, dimensions)` — Multi-point liquid detection (see Liquid Detection section)

**Key Behaviors:**
- **Delta-time based**: All movement uses `velocity * deltaTime` for frame-rate independence; `deltaTime` is clamped to 0.1s to prevent physics instability on frame drops
- **Per-axis collision resolution**: X → Y → Z order prevents getting stuck on corners
- **Ground snap**: When landing (downward collision), player Y is snapped to exact block top to prevent micro-sliding
- **Swimming**: Velocity dampened × 0.85, neutral buoyancy (×0.9 decay), Space adds `Config.SWIM_BOOST` upward, Shift adds `-Config.SWIM_DOWNSPEED` downward
- **Gravity**: `GRAVITY * deltaTime` per tick (terminal velocity: `Config.TERMINAL_VELOCITY`, typically -20 blocks/s)
- **Fall damage**: Applied on landing if `maxFallDistance > Config.FALL_DAMAGE_THRESHOLD` (3 blocks free fall)
- **Hunger degradation**: Sprint = 1 food/2.5 blocks, Walk = 1 food/8 blocks (accumulated every 0.5 blocks of distance)
- **Sprint-flying boost**: In creative mode, pressing Space + forward activates `Config.PLAYER_FLY_SPEED_BOOST` for doubled horizontal fly speed (handled in `_tickCreativeFly`)

**Liquid Detection:**
- `_isPlayerInLiquid(pos, dimensions)` samples 3 heights along player body:
  1. Feet level (`pos.y`)
  2. Mid-body (`pos.y + height × 0.5`)
  3. Near head (`pos.y + height - 0.1`)
- If ANY sample point is in a liquid block, returns `true` — prevents false negatives when spawning with feet in water but eyes above it
- `isInLava()` checks 3 specific Y positions (feet, mid-body, head) using `collision.isBlockLiquid()` for consistent liquid detection across the game
- `isSwimming()` checks a single point at `pos.y + 0.5` for quick liquid detection
- `isInWater()` checks the player's eye position specifically

**Speed Lock UI Integration:**
- `setLockedSpeed(mode)` forces a specific speed mode regardless of input keys
- `getActiveSpeedMode()` returns the current active speed mode for UI display (respects lock)
- Pressing the same-mode key does NOT clear the lock (allows temporary override, e.g., locked to walk → press sprint to temporarily run)
- Pressing a different-mode key clears the lock and switches to that mode
- `setSpeedLockClearedCallback(callback)` registers a callback that fires when the lock is cleared by code
- Turbo mode is only valid in creative mode; attempting to set it in survival falls back to input-driven mode (`'walk'` or `'run'`)
- Speed lock clearing checks: pressing sprint clears lock only if locked mode is not `'run'` or `'turbo'`; pressing sneak clears lock only if not locked to `'sneak'`

---

### [collision.js](collision.js) — Collision Detection

AABB collision detection and response against solid/liquid blocks and entity bounds. Used by movement system for per-axis resolution. Provides frame-rate-independent movement through velocity-based API.

**Known Limitations:**
- Unloaded chunks return `false` for solid/liquid checks — player can clip through terrain at chunk boundaries until the chunk loads. This is intentional to avoid blocking on missing data.

**Key Class:**
- `Donkeycraft.Collision(chunkManager, config)` — Collision system

**Constructor Dependencies:**
- `chunkManager` — ChunkManager instance for block lookups
- `config` — Optional configuration object (not currently used)

**Collision API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `checkMovement(position, width, height, deltaX, deltaY, deltaZ)` | `{collisionX, collisionY, collisionZ}` | Check per-axis collisions without resolving |
| `resolveMovementWithDelta(position, velocity, width, height, deltaTime)` | `{newX, newY, newZ, onGround}` | Resolve movement with collision (recommended) |
| `isBlockSolid(gx, gy, gz)` | `boolean` | True if block blocks movement |
| `isBlockReplaceable(gx, gy, gz)` | `boolean` | True if block is air/liquid/plant |
| `isBlockLiquid(gx, gy, gz)` | `boolean` | True if block is water or lava |
| `getOverlappingBlocks(minX, minY, minZ, maxX, maxY, maxZ)` | `Array{x, y, z, blockId}` | All solid blocks in AABB |
| `checkEntityCollision(position, width, height, entities)` | `Entity|null` | First overlapping entity, or null |
| `getChunkManager()` | `ChunkManager\|null` | Reference to chunk manager (null if destroyed) |
| `destroy()` | `void` | Free references |

**Resolution Order:** X → Y → Z (per-axis resolution prevents getting stuck on corners)
- X axis: if collision, deltaX = 0 (horizontal wall slide)
- Y axis: if collision and deltaY < 0, onGround = true; snap to exact block top to prevent micro-sliding
- Z axis: if collision, deltaZ = 0 (horizontal wall slide)

**Core Methods:**
- `resolveMovementWithDelta()` — **Recommended**: accepts velocity (blocks/s) and deltaTime for frame-rate-independent movement; converts velocity to displacement internally via `velocity × deltaTime`
- `checkMovement()` — Returns collision flags per axis without resolving; useful for preview checks before committing to movement. Only axes with non-zero deltas are tested — axes with delta === 0 always return `collision: false`.

**Embedding Resolution:**
- If player spawns inside a solid or liquid block, `_pushOutOfBlocks()` detects overlap using early-exit iteration
- `_resolveEmbedding()` tries push-out directions in priority order: Up → Down → ±X → ±Z
- Step size: 0.05 blocks, max 40 steps (2 blocks total push)
- Uses `_aabbOverlapsSolidsAndLiquids()` for consistent embedding verification
- Falls back to straight-up push if all directional pushes fail (max 2 blocks up)
- Liquid blocks are included in embedding detection to prevent stuck players spawned in water

**Block Lookups:**
- `isBlockSolid()` uses `Donkeycraft.BlockRegistry.isSolid()` for classification; below world bottom (Y < 0) returns true (bedrock barrier); unloaded chunks return false
- `isBlockLiquid()` uses `Donkeycraft.BlockRegistry.isLiquid()` (water/lava only); unloaded chunks return false
- `isBlockReplaceable()` uses `Donkeycraft.BlockRegistry.isReplaceable()` (grass, flowers, plants); unloaded chunks return true (treated as air)

**Internal Methods:**
- `_checkAABBAgainstBlocks(minX, minY, minZ, maxX, maxY, maxZ)` — Core collision check; iterates block positions within AABB, returns true on first solid block (early exit)
- `_aabbOverlapsSolid(minX, minY, minZ, maxX, maxY, maxZ)` — Checks if AABB overlaps any solid block only; used during embedding resolution verification
- `_aabbOverlapsSolidsAndLiquids(minX, minY, minZ, maxX, maxY, maxZ)` — Checks if AABB overlaps any solid OR liquid block; used by embedding resolution to ensure complete push-out
- `_pushOutOfBlocks(aabb)` — Returns boolean (true if embedded in solid or liquid)
- `_resolveEmbedding(aabb)` — Tries directional push-out sequences, returns true if successfully pushed out

**Error Handling:**
- All public methods validate parameters before processing
- `checkMovement()` returns `{collisionX: false, ...}` for null/invalid inputs
- `resolveMovementWithDelta()` returns current position with `onGround: false` for invalid inputs
- `_resolveDisplacement()` returns safe defaults for null/invalid parameters
- `getOverlappingBlocks()` validates AABB bounds (returns empty array for inverted/degenerate AABB)

**Integration:**
- Wired in `game.js` via `new Collision(this._chunkManager)`
- Used by `Movement.tick()` via `collision.resolveMovementWithDelta(pos, velocity, width, height, deltaTime)`
- Used by `Movement._tickCreativeFly()` via `collision._resolveDisplacement()` for creative fly collision

**Entity Collision:**
- `checkEntityCollision()` is available but **not currently wired** in the game loop — entity-player collision detection requires an EntityManager to be active and called during the tick phase. This is a known limitation for future integration.

---

### [jumping.js](jumping.js) — Jump Mechanics

Handles jump force, cooldown timer, and jump eligibility checks. Swimming upward motion is handled by `Movement._tickSurvival()` to avoid double-boost conflicts with jump mechanics.

**Key Class:**
- `Donkeycraft.Jumping(player, input)` — Jump system

**Constructor Dependencies:**
- `player` — Player entity (for `onGround` state and velocity)
- `input` — Input handler (for JUMP key detection)

**Note:** The `collision` parameter was removed — swimming upward is now handled entirely by `Movement._tickSurvival()` to keep concerns separated between physics and jump mechanics.

**Jumping API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `tick(deltaTime)` | `void` | Main tick (handles jump cooldown, swimming) |
| `canJump()` | `boolean` | On ground and cooldown expired |
| `performJump()` | `boolean` | Apply jump force (true if performed) |
| `getJumpForce()` | `number` | Jump force from config |
| `getCooldown()` | `number` | Remaining cooldown (seconds) |
| `destroy()` | `void` | Free references |

**Key Behaviors:**
- Jump force: `Config.PLAYER_JUMP_FORCE` (vertical velocity applied instantly on jump)
- Cooldown: `Config.JUMP_COOLDOWN` (prevents rapid double-jumps; decremented each tick)
- Swimming upward: Handled by `Movement._tickSurvival()` — keeps concerns separate between physics and jump mechanics
- Spectator mode: No jumping (always flying, vertical controlled by Space/Shift)
- Creative flying: No jumping (vertical controlled by Space/Shift)
- Survival mode: Normal jumping with gravity-based physics
- Jump is only possible when `player.onGround` is true and cooldown has expired
- Dead players cannot jump (checked at start of tick)

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
| `tick(deltaTime)` | `void` | Tick (state management only; physics in Movement) |
| `isFlying()` | `boolean` | Currently flying (spectator always true) |
| `toggleFlyMode()` | `boolean` | Toggle creative fly (F key) |
| `enableFlyMode()` | `boolean` | Enable fly (creative/spectator only) |
| `disableFlyMode()` | `boolean` | Disable fly (spectator cannot disable) |
| `getFlySpeed()` | `number` | Fly speed |
| `canSpectate()` | `boolean` | In spectator mode |
| `shouldClipThroughBlocks()` | `boolean` | Spectator mode only |
| `isEnabled()` | `boolean` | Creative fly flag state |
| `setEnabled(enabled)` | `void` | Set creative fly flag |
| `destroy()` | `void` | Free references |

**Key Behaviors:**
- **Spectator**: Always flies (`isFlying()` always true), clips through blocks (no collision in movement), cannot disable flight, `isEnabled()` returns true regardless of `_flyEnabled` flag
- **Creative**: Requires toggle (`_flyEnabled` flag set via F key), collides with blocks via collision resolution
- **Survival**: Cannot fly; `isFlying()`, `enableFlyMode()`, `toggleFlyMode()` all return false
- **Fly speed**: `Config.PLAYER_FLY_SPEED` — no horizontal sprint boost (Shift controls vertical descent)
  - `getFlySpeed()` always returns base speed since Shift controls vertical movement, not sprint
  - Note: Sprint-flying boost is handled by `Movement._tickCreativeFly()`, not this module
- **Terminal velocity**: `Config.FLYING_TERMINAL_VELOCITY` (-20 downward blocks/s)
- **State separation**: Flying manages state only (`_flyEnabled` flag); Movement applies physics (no duplicate velocity writes)

**Mode Differences:**
| Feature | Creative | Spectator |
|---------|----------|-----------|
| Requires toggle | Yes (F key) | Always on |
| Collides with blocks | Yes | No (clip through) |
| Can disable | Yes | No |
| Vertical control | Space/Shift | Space/Shift |

---

### [game-mode.js](game-mode.js) — Game Mode System

Manages Survival/Creative/Spectator mode behaviors and restrictions.

**Key Class:**
- `Donkeycraft.GameMode(player)` — Game mode system

**GameMode API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getGameMode()` | `string` | Current game mode |
| `setGameMode(mode)` | `void` | Set mode (transitions: syncs flying state) |
| `isSurvival()` | `boolean` | In survival mode |
| `isCreative()` | `boolean` | In creative mode |
| `isSpectator()` | `boolean` | In spectator mode |
| `canTakeDamage()` | `boolean` | False for creative |
| `canPlaceBlocks()` | `boolean` | False for spectator |
| `canBreakBlocks()` | `boolean` | False for spectator |
| `hasInfiniteItems()` | `boolean` | True for creative |
| `toggleCreativeFly()` | `boolean` | Toggle fly in creative mode |
| `enableCreativeFly()` | `boolean` | Enable fly (creative only) |
| `disableCreativeFly()` | `boolean` | Disable fly (creative only; spectator/survival return false) |
| `isCreativeFlying()` | `boolean` | Creative flying active |
| `canInteract()` | `boolean` | False for spectator |
| `canPickupItems()` | `boolean` | False for spectator |
| `isVulnerable()` | `boolean` | Same as canTakeDamage |
| `getStackLimit()` | `number` | Stack size limit (always 64) |
| `tick(deltaTime)` | `void` | Tick (notifies subscribers) |
| `onTick(callback)` | `Function` | Subscribe to tick |
| `destroy()` | `void` | Free references |

**Mode Transition Behavior (`setGameMode`):**
| Transition | `_creativeFlying` | `_creativeInfinite` | `player.flyEnabled` |
|------------|-------------------|---------------------|---------------------|
| → survival | `false` | `false` | `false` (explicit sync) |
| → creative | synced from `player.flyEnabled` | `true` | unchanged |
| → spectator | `false` | `false` | `true` (explicit sync) |

**Event Emission:**
- `gameMode:changed` — Emitted when mode changes ({oldMode, newMode})
- `flyMode:changed` — Emitted when creative fly toggled ({flying: boolean})

---

### [damage.js](damage.js) — HurtBox & Damage System

Manages player health, absorption hearts, fire damage, fall damage, knockback, and death.

**Key Class:**
- `Donkeycraft.HurtBox(player)` — HurtBox system

**HurtBox API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getHealth()` | `number` | Current HP (0–20) |
| `getMaxHealth()` | `number` | Maximum health points |
| `getAbsorption()` | `number` | Absorption (yellow) hearts |
| `setAbsorption(amount)` | `void` | Set absorption points |
| `getSaturation()` | `number` | Saturation level |
| `setSaturation(amount)` | `void` | Set saturation value |
| `isOnFire()` | `boolean` | Currently on fire |
| `setOnFire(onFire)` | `void` | Set fire state |
| `takeDamage(amount, source)` | `number` | Receive damage (returns amount dealt) |
| `heal(amount)` | `number` | Restore health (returns actual restored) |
| `getKnockback()` | `Vector3` | Current knockback velocity |
| `applyKnockback(direction, strength, upwardForce)` | `void` | Apply knockback |
| `clearKnockback()` | `void` | Clear knockback velocity |
| `getFallDistance()` | `number` | Current fall distance |
| `calculateFallDamage(fallDistance)` | `number` | Calculate damage from fall |
| `applyFallDamage()` | `number` | Apply fall damage + reset tracking |
| `getHurtBox()` | `{minX, minY, minZ, maxX, maxY, maxZ}` | Player AABB |
| `isCreative()` | `boolean` | In creative mode |
| `setOnDeath(callback)` | `void` | Register death callback |
| `tick(deltaTime)` | `void` | Handle fire damage tick |
| `reset()` | `void` | Full health reset |
| `destroy()` | `void` | Free resources |

**Damage Application Order:**
1. Absorption hearts (yellow) absorb first
2. Remaining damage applied to health (red)
3. If health ≤ 0, trigger death event

**Fall Damage Formula:**
- First `Config.FALL_DAMAGE_THRESHOLD` blocks: no damage (typically 3 blocks free fall)
- Beyond threshold: `(fallDistance - FALL_DAMAGE_THRESHOLD) × Config.FALL_DAMAGE_MULTIPLIER` HP per block
- Example: 10-block fall = (10 - 3) × `FALL_DAMAGE_MULTIPLIER` HP damage

**Fire Damage:**
- 1 HP every 0.5 seconds while on fire (matches vanilla Minecraft)
- Creative mode: immune to all tick-based damage
- Fire timer resets when extinguished or when health reaches 0

**Creative Mode Immunity:**
- Creative mode players take 0 damage from all sources
- Fall distance is still tracked but never deals damage

**Event Emission:**
- `health:changed` — Emitted on any health change ({health, maxHealth, delta})
- `player:death` — Emitted on death ({source, health: 0, player})

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

**Starvation Threshold:** `min(5, maxHealth / 2)` — only takes damage below this health level

**Hunger Degradation Rates (tracked by Movement):**
| Activity | Rate |
|----------|------|
| Sprinting | 1 food per 2.5 blocks |
| Walking | 1 food per 8 blocks |

**Event Emission:**
- `hunger:changed` — Emitted on food level change ({foodLevel, delta})

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
- `stat:changed` — Emitted on increment ({name, value})

---

## Cross-references

- See [README-combat.md](README-combat.md) — HurtBox applies fall damage tracked by player; experience system tracks kills recorded by stats
- See [README-npc.md](README-npc.md) — Player stats track entity kills; hostile mobs chase the player
- See [README-world.md](README-world.md) — Collision detection uses ChunkManager for block lookups
- See [README-interaction.md](README-interaction.md) — Block placement/breaking records stats

## Architecture Notes

### System Separation
- **Player** holds state (position, velocity, rotation, game mode)
- **Movement** reads input and applies physics (walking, flying, swimming, gravity)
- **Collision** resolves movement against blocks (AABB detection)
- **Flying** manages fly state (enabled/disabled), Movement applies fly physics
- **Jumping** handles jump force/cooldown, Movement handles swimming upward
- **HurtBox** manages health/damage, Movement applies fall damage on landing
- **GameMode** manages restrictions, HurtBox checks for damage immunity

### Tick Order (from game.js)
1. `Input.update()` — Read key states
2. `Player.adjustRotation()` — Apply mouse look
3. `Flying.tick()` — State management only
4. `Jumping.tick()` — Jump cooldown, swimming detection
5. `Movement.tick()` — Physics, collision resolution, hunger tracking
6. `HurtBox.tick()` — Fire damage
7. `Hunger.tick()` — Saturation drain, regeneration, starvation
8. `PlayerStats.tick()` — Time tracking

### Known Design Decisions
- **Fall distance reset** is in Movement (not Player) to keep damage logic centralized — Movement knows when landing occurs via collision resolution
- **Swimming upward** is in Movement (not Jumping) to avoid double-boost with jump mechanics — jumping and swimming are mutually exclusive movement states
- **Flying physics** is in Movement (not Flying) to avoid duplicate velocity writes — Flying manages state only, Movement applies physics
- **Speed lock UI** uses key-just-pressed detection to distinguish intentional overrides from accidental key presses
- **Fall damage** uses `Config.FALL_DAMAGE_MULTIPLIER` for vanilla-compatible calculation; threshold of 3 blocks matches Minecraft behavior
- **Swimming vertical controls** use `Config.SWIM_BOOST` and `Config.SWIM_DOWNSPEED` for configurable movement in liquids
- **Delta-time clamping** to 0.1s prevents physics instability on frame drops (e.g., during GC pauses or tab switching)
- **Embedding resolution** tries Up → Down → ±X → ±Z push-out directions; max 2 blocks total push prevents infinite loops; checks both solids AND liquids for consistent push-out
- **Collision uses velocity × deltaTime** for frame-rate-independent movement; the deprecated `resolveMovement()` was removed — only `resolveMovementWithDelta()` is now supported
- **Jumping no longer requires collision parameter** — swimming upward moved to Movement system, simplifying constructor to `(player, input)`
- **Flying `isEnabled()` returns true for spectator** — spectators always fly regardless of `_flyEnabled` flag state
- **Game mode transitions sync `player.flyEnabled` explicitly** — survival sets it false, spectator sets it true, creative reads from current player state (no forced toggle)
- **`disableCreativeFly()` checks game mode** — returns false for spectator/survival; only creative can actually disable flying
- **Collision public methods validate parameters** — null/invalid inputs return safe defaults instead of throwing
