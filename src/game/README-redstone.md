# Redstone Engine Subsystem

Manages all redstone mechanics: signal propagation, repeaters, comparators, observers, pistons, and TNT explosions. Provides a complete redstone simulation running at game speed (20 TPS).

## Table of Contents

- [Overview](#overview)
- [Core Engine](#redstone-enginejs)
- [Redstone Wiring](#wiringjs)
- [Repeaters & Comparators](#repeater-comparatorjs)
- [Observers](#observersjs)
- [Pistons](#pistonsjs)
- [TNT](#tntjs)
- [Cross-references](#cross-references)

---

## Overview

The Redstone subsystem provides a complete redstone simulation for Donkeycraft. The core engine orchestrates ticks at 20 TPS, processing dirty blocks in priority order (TNT → observers → repeaters → pistons → wiring). Each subsystem handles its own block behavior and communicates via the EventBus.

**Dependencies:**
- `chunk-manager.js` — Block access for all subsystems
- `event-bus.js` — Cross-system communication
- `timer.js` — Tick scheduling (optional)

---

## Files

### [redstone-engine.js](redstone-engine.js) — Core Redstone Tick Orchestrator

Central redstone tick system running at game speed (20 TPS). Manages dirty block queue, priority processing order, and coordinates all subsystems.

**Key Class:**
- `Donkeycraft.RedstoneEngine` — Static singleton module

**Subsystem Registration:**
| Method | Parameter | Description |
|--------|-----------|-------------|
| `setEventBus(bus)` | EventBus | Cross-system communication |
| `setChunkManager(cm)` | ChunkManager | Block access |
| `setWiring(wiring)` | Object | Redstone wire subsystem |
| `setRepeaterComparator(rc)` | Object | Repeater/comparator subsystem |
| `setObservers(obs)` | Object | Observer subsystem |
| `setPistons(pist)` | Object | Piston subsystem |
| `setTNT(tnt)` | Object | TNT subsystem |
| `setTimer(timer)` | Timer | Tick scheduling |

**Engine API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Function` | Start tick loop (returns unsubscribe) |
| `stop()` | `void` | Stop engine |
| `markDirty(x, y, z)` | `void` | Queue block for processing |
| `markDirtyRange(x1,y1,z1,x2,y2,z2)` | `void` | Queue rectangular range |
| `getDirtyQueueLength()` | `number` | Pending blocks count |
| `clearDirtyQueue()` | `void` | Clear queue |
| `getCurrentTick()` | `number` | Current tick count |
| `isRunning()` | `boolean` | Engine active check |
| `_processTick()` | `void` | Process one tick (private) |
| `destroy()` | `void` | Stop and clear state |

**Processing Priority Order:**
1. TNT fuses (time-critical)
2. Observers (immediate response)
3. Repeaters/Comparators (delayed signal)
4. Pistons (mechanical action)
5. Wiring (signal propagation)

---

### [wiring.js](wiring.js) — Redstone Dust/Wire Signal Propagation

Signal strength (0–15), branching, underground routing, power source detection.

**Key Class:**
- `Donkeycraft.RedstoneWiring` — Static singleton module

**Block IDs:**
| ID | Name | Type |
|----|------|------|
| 173 | redstone_wire | Wire |
| 229 | redstone_dust | Wire |
| 174 | redstone_torch | Torch |
| 175 | redstone_lamp | Lamp (off) |
| 176 | lit_redstone_lamp | Lamp (on) |
| 230 | redstone_block | Power source |

**Wiring API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `setChunkManager(cm)` | `void` | Set chunk manager reference |
| `getSignalStrength(x, y, z)` | `number` | Signal at position (0–15) |
| `setSignalStrength(x, y, z, strength)` | `void` | Override signal strength |
| `getStrengthAt(x, y, z)` | `number` | Alias for getSignalStrength |
| `getWireBlockIds()` | `Object` | {blockId: true} lookup map |
| `getMaxSignalDistance()` | `number` | Max distance (15) |
| `clearAllSignals()` | `void` | Clear all signal data |
| `_processDirtyWire(entry, chunk)` | `void` | Process dirty wire (private) |
| `_processTorch(entry, chunk)` | `void` | Process torch state (private) |
| `destroy()` | `void` | Clear state |

**Signal Propagation Rules:**
- Wire-to-wire: neighbor strength - 1 (decay per block)
- Power sources (redstone block): constant 15-strength
- Lit redstone lamp: 15-strength
- Redstone torch: 15-strength when unpowered, 0 when powered
- Solid power sources detected on adjacent blocks
- Signal propagates in all 6 directions

**Redstone Torch Logic:**
- Attached to solid opaque block below
- Powered (signal = 0) when block below has signal > 0
- Unpowered (signal = 15) otherwise
- State changes propagate to neighbors

---

### [repeater-comparator.js](repeater-comparator.js) — Repeaters & Comparators

Redstone repeater delay (1–4 ticks, max output 15), comparator block compare and difference modes.

**Key Class:**
- `Donkeycraft.RedstoneRepeaterComparator` — Static singleton module

**Block IDs:**
| ID | Name | Type |
|----|------|------|
| 180 | repeater | Repeater |
| 232 | comparator | Comparator |

**Facing Directions:**
| Constant | Value | Direction |
|----------|-------|-----------|
| FACING_SOUTH | 0 | +Z |
| FACING_WEST | 1 | -X |
| FACING_NORTH | 2 | -Z |
| FACING_EAST | 3 | +X |

**Comparator Modes:**
| Constant | Value | Behavior |
|----------|-------|----------|
| COMP_MODE_BLOCK_COMPARE | 0 | Output = inputA if inputA >= inputB |
| COMP_MODE_DIFFERENCE | 1 | Output = \|inputA - inputB\| |

**Repeater API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `setRepeaterDelay(x, y, z, delay)` | `void` | Set delay (1–4 ticks) |
| `lockRepeater(x, y, z, locked)` | `void` | Lock via powered comparator |
| `getRepeaterState(x, y, z)` | `Object|null` | {delay, locked, outputStrength, facing} |

**Comparator API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `setComparatorMode(x, y, z, mode)` | `void` | Set mode (0 or 1) |
| `getComparatorState(x, y, z)` | `Object|null` | {mode, inputA, inputB, outputStrength, facing} |

**Repeater Behavior:**
- Input from block behind (opposite to facing direction)
- Detects redstone wire signal or powered solid blocks
- When input > 0: starts delay timer, outputs full strength after delay
- When input = 0: resets output to 0
- Locked repeaters ignore input changes

**Comparator Behavior:**
- Block compare mode: compares container signal (behind) vs adjacent wire signal (sides)
- Difference mode: outputs absolute difference between the two inputs
- Container signals: chests/furnaces output based on fill level
- Powered blocks emit 15-strength

---

### [observers.js](observers.js) — Observer Blocks

Observer blocks detect block changes in front face and emit a 1-tick pulse on the back face.

**Key Class:**
- `Donkeycraft.RedstoneObservers` — Static singleton module

**Block ID:**
| ID | Name | Type |
|----|------|------|
| 179 | observer | Observer |

**Facing Directions:**
| Constant | Value | Direction |
|----------|-------|-----------|
| FACING_SOUTH | 0 | +Z |
| FACING_WEST | 1 | -X |
| FACING_NORTH | 2 | -Z |
| FACING_EAST | 3 | +X |
| FACING_UP | 4 | +Y |
| FACING_DOWN | 5 | -Y |

**Observer API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `init()` | `void` | Initialize system |
| `setObserverFacing(x, y, z, facing)` | `void` | Set facing direction (0–5) |
| `getObserverState(x, y, z)` | `Object|null` | {facing, lastBlockId, cooldown} |
| `forceEmit(x, y, z)` | `void` | Force pulse emission (testing) |
| `_processObserver(entry, chunk)` | `void` | Process dirty observer (private) |
| `clearAllStates()` | `void` | Clear all state |
| `destroy()` | `void` | Clear and free resources |

**Observer Behavior:**
- Detects block changes in front face position (based on facing direction)
- Emits 1-tick pulse from back face when change detected
- 1-tick cooldown prevents re-triggering
- Pulse activates adjacent redstone wire and pistons
- State tracks last known block ID for comparison

---

### [pistons.js](pistons.js) — Pistons & Sticky Pistons

Push up to 12 blocks, pull (sticky), crush detection, tile entity protection.

**Key Class:**
- `Donkeycraft.RedstonePistons` — Static singleton module

**Block IDs:**
| ID | Name | Type |
|----|------|------|
| 181 | piston | Piston |
| 182 | sticky_piston | Sticky Piston |
| 52 | piston_head | Piston Head |

**Facing Directions:**
| Constant | Value | Direction |
|----------|-------|-----------|
| FACING_DOWN | 0 | -Y |
| FACING_UP | 1 | +Y |
| FACING_SOUTH | 2 | +Z |
| FACING_NORTH | 3 | -Z |
| FACING_WEST | 4 | -X |
| FACING_EAST | 5 | +X |

**Piston API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `init()` | `void` | Initialize system |
| `setPistonFacing(x, y, z, facing)` | `void` | Set facing direction (0–5) |
| `getPistonState(x, y, z)` | `Object|null` | {extended, extending, retracting, facing, isSticky} |
| `getMaxPushDistance()` | `number` | Max push distance (12) |
| `isUnpushable(blockId)` | `boolean` | Cannot be pushed check |
| `_processPiston(entry, chunk)` | `void` | Process dirty piston (private) |
| `clearAllStates()` | `void` | Clear all state |
| `destroy()` | `void` | Clear and free resources |

**Unpushable Blocks:**
Air(0), Water(8,9), Lava(8,9), Bedrock(37), PistonHead(52), Obsidian(46), EndPortal(119), EndGateway(207)

**Tile Entity Blocks (sticky only):**
Chest(54), Furnace(61), Door(64 upper), Trapdoor(70), Dispenser(71), Dropper(72), NoteBlock(146), RedstoneTorch(150), Button(151), Lever(76), Cake(130), Painting(32), Sign(90)

**Piston Behavior:**
- Powered by: redstone torch, lit lamp, redstone block, redstone wire at piston level, powered adjacent blocks
- Push chain: up to 12 blocks calculated from piston face
- Crush detection: fails if no room for last block in chain
- Tile entity blocks: only pulled by sticky pistons, never pushed
- Piston head placed at first push position
- Retraction: sticky pistons pull one block behind

---

### [tnt.js](tnt.js) — Redstone TNT

TNT fuse timer, explosion logic, block destruction, entity damage.

**Key Class:**
- `Donkeycraft.RedstoneTNT` — Static singleton module

**Block ID:**
| ID | Name | Type |
|----|------|------|
| 183 | tnt | TNT |

**Constants:**
| Constant | Value | Description |
|----------|-------|-------------|
| FUSE_TICKS | 40 | 2 seconds at 20 TPS |
| EXPLOSION_RADIUS | 8 | Blast radius in blocks |
| EXPLOSION_DAMAGE | 10 | Max entity damage |

**TNT API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `init()` | `void` | Initialize system |
| `getTNTState(x, y, z)` | `Object|null` | {fuseTicks, lit, primeTick} |
| `getFuseTicks(x, y, z)` | `number` | Remaining fuse ticks (0 if not lit) |
| `getExplosionRadius()` | `number` | Explosion radius (8) |
| `getFuseDuration()` | `number` | Fuse duration (40 ticks) |
| `_processTNT(entry, chunk)` | `void` | Process dirty TNT (private) |
| `clearAllStates()` | `void` | Clear all state |
| `destroy()` | `void` | Clear and free resources |

**TNT Activation Sources:**
- Redstone wire/dust with signal > 0
- Redstone torch, lit lamp, redstone block
- Another lit TNT (chain explosion)
- Observer pulse

**Explosion Behavior:**
- Checks all blocks within spherical radius
- Blast strength: `1 - (distance / radius)` (0–1 scale)
- Block resistance: stone=0, deepslate=0, obsidian=1 (immune), bedrock=1 (immune), default=0.3
- Blocks destroyed when blastStrength > blockResistance
- Entity damage: maxDamage × (1 - distance/radius)

**Event Emission:**
- `tnt:lit` — When fuse starts
- `tnt:explode` — On explosion with {x, y, z, radius, damage}
- `tnt:entity-damage` — Entity damage event with {x, y, z, radius, maxDamage}

---

## Cross-references

- See [README-interaction.md](README-interaction.md) — Interactive blocks (levers, buttons) emit redstone signals; TNT can be activated by redstone wiring
- See [README-world.md](README-world.md) — ChunkManager provides block access for all redstone subsystems
- See [README-physics-env.md](README-physics-env.md) — Physics system processes piston block movements