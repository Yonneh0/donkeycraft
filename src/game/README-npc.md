# NPC/Mob System Subsystem

Manages all non-player entities including passive mobs, hostile mobs, animals, bosses, and the base entity framework with AI utilities. Entities form the living world that players interact with.

## Table of Contents

- [Overview](#overview)
- [Base Entity](#entityjs)
- [Entity Manager](#entity-managerjs)
- [Passive Mobs](#passive-mobsjs)
- [Animals](#animalsjs)
- [Hostile Mobs](#hostile-mobsjs)
- [Boss Mobs](#boss-mobsjs)
- [Mob AI Utilities](#mob-aijs)
- [Player Statistics](#statsjs)
- [Cross-references](#cross-references)

---

## Overview

The NPC/Mob subsystem provides the entity framework for Donkeycraft's living world. All entities (mobs, bosses, projectiles) inherit from the base Entity class, managed by EntityManager for lifecycle and typed queries. Passive mobs wander and flee; hostile mobs chase and attack; boss mobs have multi-phase combat with unique loot.

**Dependencies:**
- `entity.js` — Base class all entities inherit from
- `entity-manager.js` — Lifecycle management for all entities
- `mob-ai.js` — Shared AI utilities (pathfinding, line-of-sight)
- `damage.js` — Entity damage handling via HurtBox
- `stats.js` — Player stats track entity kills

---

## Files

### [entity.js](entity.js) — Base Entity Class

All entities (mobs, bosses, projectiles) inherit from this base class. Provides position, velocity, rotation, health, and lifecycle management.

**Key Class:**
- `Donkeycraft.Entity(config)` — Base entity constructor

**Constructor Options:**
```js
{
  type: 'generic',    // Entity type identifier
  x: 0, y: 64, z: 0, // Initial position
  height: 1.8,        // Entity height in blocks
  width: 0.6,         // Entity width in blocks
  health: 20,         // Starting health (clamped to maxHealth)
  maxHealth: 20       // Maximum health
}
```

**Entity API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getPosition()` | `Vector3|null` | Current position (null if destroyed) |
| `setPosition(x, y, z)` | `void` | Set position |
| `getVelocity()` | `Vector3|null` | Current velocity |
| `setVelocity(vx, vy, vz)` | `void` | Set velocity components |
| `getRotation()` | `{yaw, pitch}|null` | Rotation in radians |
| `setRotation(yaw, pitch)` | `void` | Set rotation (yaw normalized, pitch clamped) |
| `getDimensions()` | `{height, width}|null` | Entity dimensions |
| `getBoundingBox()` | `AABB|null` | Entity AABB bounding box |
| `getEyePosition()` | `Vector3|null` | Eye position (height × 0.85) |
| `getForwardDirection()` | `Vector3|null` | Forward direction from yaw |
| `isAlive()` | `boolean` | Alive AND not despawned |
| `setAlive(alive)` | `void` | Set alive/dead (triggers onDeath) |
| `getHealth()` | `number` | Current health |
| `setHealth(health)` | `void` | Set health (clamped, triggers death if 0) |
| `takeDamage(amount, source)` | `number` | Take damage (returns amount dealt) |
| `heal(amount)` | `void` | Heal (clamped to maxHealth) |
| `onDeath()` | `void` | Override for custom death behavior |
| `tick(deltaTime)` | `void` | Apply velocity to position, notify subscribers |
| `onTick(callback)` | `Function` | Subscribe to tick (returns unsubscribe) |
| `despawn()` | `void` | Mark as despawned |
| `isDespawned()` | `boolean` | Despawn check |
| `serialize()` | `object|null` | Serialized state for save/load |
| `fromObject(data)` | `void` | Restore from serialized data |
| `destroy()` | `void` | Free resources (all getters return null) |

**Properties:**
- `type` — Entity type identifier string
- `alive` — Death state
- `health`, `maxHealth` — Health values
- `nameTag` — Custom name tag (nullable)

---

### [entity-manager.js](entity-manager.js) — Entity Lifecycle Manager

Manages all active entities: spawn, despawn, tick, and typed queries.

**Key Class:**
- `Donkeycraft.EntityManager()` — Entity manager with indexed storage

**EntityManager API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `spawn(entity)` | `number|null` | Spawn entity (returns ID or null) |
| `despawn(id)` | `void` | Despawn by ID |
| `getEntity(id)` | `Entity|null` | Get by ID |
| `getByType(type, maxResults=100)` | `Entity[]` | All alive entities of type |
| `getEntitiesInRange(cx, cy, cz, range)` | `Entity[]` | Entities within spherical range (3D) or horizontal range (2D) |
| `getAllEntities()` | `Entity[]` | All alive entities |
| `getCount()` | `number` | Total entities (alive + dead) |
| `getAliveCount()` | `number` | Alive entity count |
| `tick(deltaTime)` | `void` | Tick all alive, remove dead |
| `hasEntity(id)` | `boolean` | Entity exists by ID |
| `clear()` | `void` | Destroy all entities |
| `destroy()` | `void` | Clear and free resources |

**Properties:**
- `maxEntities` — Maximum allowed (default 1000)

**Event Emission:**
- `entity:spawn` — Emitted on spawn with {entity, id, type}
- `entity:despawn` — Emitted on despawn with {entity, id}

---

### [passive-mobs.js](passive-mobs.js) — Passive Mobs

Cow, pig, sheep, chicken — wander randomly, flee from players when too close.

**Key Class:**
- `Donkeycraft.PassiveMob(config)` — Passive mob base class (extends Entity)

**Constructor Options:**
```js
{
  type: 'cow',    // 'cow', 'pig', 'sheep', 'chicken'
  x: 0, y: 64, z: 0
}
```

**PassiveMob API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `isPlayerNearby(player, fleeRange=8)` | `boolean` | Player within flee range |
| `fleeFrom(playerPos)` | `void` | Flee from position (2 seconds) |
| `getDropItem()` | `string` | Item dropped on death |
| `getDropCount()` | `[min, max]` | Drop count range |
| `tick(deltaTime)` | `void` | Wander + flee logic |

**MobStats:**
| Type | Health | Height | Width | Speed | DropItem | DropCount |
|------|--------|--------|-------|-------|----------|-----------|
| cow | 10 | 1.4 | 1.4 | 1.0 | leather | [0, 2] |
| pig | 10 | 0.9 | 0.9 | 1.2 | porkchop | [1, 3] |
| sheep | 8 | 0.9 | 0.9 | 1.0 | wool | [1, 3] |
| chicken | 4 | 0.6 | 0.4 | 1.3 | feather | [0, 2] |

**Key Behaviors:**
- Wander: random target 3–10 blocks away, 2–5 second intervals
- Flee: 2-second flee when player within 8 blocks (default)
- Death: emits `mob:drop` event via EventBus

---

### [animals.js](animals.js) — Animal-Specific Behavior

Extends PassiveMob with breeding, leads, name tags, and baby speed.

**Key Class:**
- `Donkeycraft.Animal(config)` — Animal class (extends PassiveMob)

**Constructor Options:**
```js
{
  type: 'cow',       // 'cow', 'pig', 'sheep', 'chicken'
  x: 0, y: 64, z: 0,
  isBaby: false      // Baby animals move 1.5x faster
}
```

**Animal API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `feed(foodItem)` | `boolean` | Feed animal (triggers love mode or growth) |
| `canBreed()` | `boolean` | Ready to breed (not baby, in love, cooldown expired) |
| `enterLoveMode()` | `void` | Enter love mode |
| `exitLoveMode()` | `void` | Exit love mode |
| `canBreedWith(other)` | `boolean` | Both same type and ready |
| `breedWith(partner)` | `Animal|null` | Create baby at midpoint |
| `setOnLead(led, owner)` | `void` | Set lead state |
| `isOnLead()` | `boolean` | On lead check |
| `getSpeedMultiplier()` | `number` | Baby=1.5x, led=0.8x (stacked) |
| `feed(foodItem)` | `boolean` | Feed: babies grow faster, adults enter love mode |

**Key Behaviors:**
- Food items: cow/sheep = 'wheat', pig = 'carrot', chicken = 'seed'
- Love mode: 30-second cooldown after breeding
- Baby growth: +6000 ticks per feed, or natural 24000-tick timer
- Lead following: moves at 80% speed toward lead owner when > 4 blocks away
- Baby speed: 1.5× base speed (stacks with lead penalty)

---

### [hostile-mobs.js](hostile-mobs.js) — Hostile Mobs

Zombie, skeleton, spider, creeper, enderman — chase and attack players.

**Key Class:**
- `Donkeycraft.HostileMob(config)` — Hostile mob base class (extends Entity)

**Constructor Options:**
```js
{
  type: 'zombie',    // 'zombie', 'skeleton', 'spider', 'creeper', 'enderman'
  x: 0, y: 64, z: 0
}
```

**HostileMob API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `findTargetPlayer(player)` | `boolean` | Player within sight range |
| `attack()` | `void` | Melee/ranged attack on target |
| `handleCreeperProximity(player)` | `void` | Start/stop creeper ignition |
| `explode()` | `boolean` | Trigger creeper explosion |
| `teleportRandomly()` | `void` | Enderman short-range teleport |
| `tick(deltaTime)` | `void` | Chase + attack logic |

**MobStats:**
| Type | Health | Height | Width | Speed | Damage | SightRange | Special |
|------|--------|--------|-------|-------|--------|------------|---------|
| zombie | 20 | 1.9 | 0.6 | 1.0 | 3 | 16 | — |
| skeleton | 20 | 1.9 | 0.6 | 1.0 | 2 | 20 | Ranged |
| spider | 16 | 1.1 | 1.4 | 1.2 | 2 | 16 | — |
| creeper | 10 | 1.7 | 0.6 | 1.0 | 25 | 10 | Explodes |
| enderman | 40 | 2.9 | 0.6 | 1.5 | 5 | 32 | Teleports |

**Key Behaviors:**
- Creeper: 1.5-second ignition timer when within 3 blocks, cancels at 4+ blocks
- Enderman: random teleport chance (0.5% per tick), teleports within 8 blocks
- Death: creepers explode if ignited

---

### [boss-mobs.js](boss-mobs.js) — Boss Mobs

Ender Dragon and Wither — multi-phase behavior, attacks, death rewards.

**Key Class:**
- `Donkeycraft.BossMob(config)` — Boss mob base class (extends Entity)

**Constructor Options:**
```js
{
  type: 'ender_dragon',  // 'ender_dragon', 'wither'
  x: 0, y: 64, z: 0
}
```

**BossMob API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `findTargetPlayer(player)` | `boolean` | Player within sight range |
| `attack()` | `void` | Attack target player |
| `emitBreathAttack()` | `void` | Dragon fireball/breath event |
| `shootProjectile()` | `void` | Wither projectile event |
| `tick(deltaTime)` | `void` | Phase management + attack |

**BossStats:**
| Type | Health | Height | Width | Speed | Damage | Phases | Loot |
|------|--------|--------|-------|-------|--------|--------|------|
| ender_dragon | 200 | 8.0 | 11.4 | 3.0 | 10 | fly, land, breath, death | dragon_egg |
| wither | 300 | 2.9 | 0.95 | 1.5 | 8 | charge, attack, death | nether_star |

**Key Behaviors:**
- Phase transitions: 3–8 second random duration per phase
- Death phase: enters at 25% health, 5-second animation
- Attack interval: 3 seconds between attacks
- Loot: awarded once on death via `boss:loot` event

---

### [mob-ai.js](mob-ai.js) — Mob AI Utilities

Shared AI utilities for pathfinding, line-of-sight, chase/flee behavior.

**Key Class:**
- `Donkeycraft.MobAI` — Static utility singleton

**MobAI API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `hasLineOfSight(x1,y1,z1,x2,y2,z2,isBlockSolid)` | `boolean` | DDA line-of-sight check |
| `findPath(startX,startY,startZ,endX,endY,endZ,isWalkable,maxSteps=200)` | `{steps,distance}|null` | Greedy best-first pathfinding |
| `calculateChaseVelocity(mobX,mobZ,targetX,targetZ,speed)` | `{vx,vz}` | Chase direction |
| `calculateFleeVelocity(mobX,mobZ,sourceX,sourceZ,speed)` | `{vx,vz}` | Flee direction |
| `canMobSeePlayer(mob,player,getBlockId)` | `boolean` | Mob vision check (air transparent) |
| `shouldFlee(mob,player,fleeDistance=5)` | `boolean` | Low health flee decision |
| `getWanderTarget(centerX,centerZ,maxRadius=10)` | `{x,z}` | Random wander position |

**Direction Constants:**
- `Donkeycraft.AIDirection.NONE`, `NORTH`, `SOUTH`, `EAST`, `WEST`, `UP`, `DOWN`
- `Donkeycraft.AIDirectionDeltas` — {dx, dy, dz} for each direction

**Pathfinding Notes:**
- Greedy best-first (not full A*) — sufficient for basic mob movement
- Max steps: 200 (prevents infinite loops)
- Loop detection via visited set

---

### [stats.js](stats.js) — Player Statistics

Tracks player statistics including entity kills recorded by the NPC subsystem. See [README-player.md](README-player.md#statsjs) for full API reference.

**Key Integration Points:**
- `recordEntityKill(entityType)` — Called when hostile mob dies by player action
- `recordDamageDealt(amount)` — Called when mob damage is dealt to player
- `recordDeath(cause)` — Called when player dies to mob

---

## Cross-references

- See [README-player.md](README-player.md) — Player stats track entity kills; hostile mobs chase the player
- See [README-combat.md](README-combat.md) — Damage system handles mob-to-player and player-to-mob combat
- See [README-interaction.md](README-interaction.md) — Right-click interactions with interactive blocks may aggro nearby mobs