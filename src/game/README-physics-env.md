# Physics & Environment Subsystem

Handles physical block behaviors (gravity, liquid flow), lighting engine (sky/block light propagation), and world time management (day cycle, moon phases).

## Table of Contents

- [Overview](#overview)
- [Block Physics](#physicsjs)
- [Lighting Engine](#lighting-enginejs)
- [World Time](#timejs)
- [Cross-references](#cross-references)

---

## Overview

The Physics & Environment subsystem provides the physical simulation and environmental systems for Donkeycraft. Gravity blocks (sand, gravel) fall when unsupported, liquids flow and spread, light propagates through voxels via BFS flood fill, and world time drives the 24000-tick day cycle with moon phases.

**Dependencies:**
- `block.js` — Block definitions for hardness, light emission, opacity values
- `chunk-manager.js` — Chunk access for block lookups and lighting updates
- `biome.js` — Biome temperature determines snow generation

---

## Files

### [physics.js](physics.js) — Block Physics

Block physics: gravity blocks (sand/gravel), liquid flow simulation.

**Key Class:**
- `Donkeycraft.Physics` — Static singleton module

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `init()` | `void` | Initialize block sets |
| `reinit()` | `void` | Re-resolve after dynamic block changes |
| `applyGravity(chunk, x, y, z)` | `boolean` | Apply gravity to single block |
| `applyGravityToChunk(chunk)` | `void` | Process all blocks in chunk |
| `applyGravityColumn(chunk, x, z)` | `void` | Process column |
| `flowLiquid(chunk, x, y, z, sourceLevel)` | `number` | Simulate liquid flow |
| `simulateLiquidFlow(chunk)` | `void` | Flow all liquids in chunk |
| `isGravityBlock(blockId)` | `boolean` | Gravity-affected check |
| `isLiquidBlock(blockId)` | `boolean` | Liquid check |
| `getGravityBlockIds()` | `number[]` | All gravity block IDs |
| `getLiquidBlockIds()` | `number[]` | All liquid block IDs |
| `destroy()` | `void` | Clear state |

**Gravity Blocks:**
- Sand (ID 19, 20)
- Gravel (ID 9)
- Processed top-to-bottom (prevents multi-fall per tick)
- Only falls into air or liquids
- Cannot fall below world bottom (y ≤ 0)

**Liquid Flow:**
- Processes liquids from lowest Y upward (prevents cascading)
- Flows to adjacent blocks based on level difference
- Spreads horizontally and downward
- Default liquid level: 8 (full)
- New level = max(sourceLevel - decay, 0) where decay depends on destination

**Flow Rules:**
| Destination | Level Change |
|-------------|-------------|
| Air | -2 (fast spread) |
| Same liquid type | -1 if neighbor level < source |
| Different liquid type | -1 if neighbor level < source - 1 |

---

### [lighting-engine.js](lighting-engine.js) — Lighting Engine

Sky light and block light propagation: BFS flood fill, light updates on block change.

**Key Class:**
- `Donkeycraft.LightingEngine` — Static singleton module

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `init()` | `void` | Initialize opacity cache |
| `calculateSkyLight(chunk, heightmap?)` | `void` | Calculate sky light for chunk |
| `calculateBlockLight(chunk)` | `void` | Calculate block light for chunk |
| `updateBlockLighting(chunk, x, y, z)` | `void` | Update single block position |
| `updateChunkLighting(chunk)` | `void` | Full recalculation of chunk |
| `getLightOpacity(blockId)` | `number` | Light opacity (0–15) |
| `invalidateCache()` | `void` | Rebuild cache from BlockRegistry |
| `destroy()` | `void` | Clear state |

**Sky Light Calculation:**
- **Fast mode (with heightmap):** Exponential falloff from surface level
  - Formula: `light = round(15 × 0.85^depthBelowSurface)`
  - At surface (depth=0): 15, depth=4: ~12, depth=8: ~9, depth=16: ~5
- **Precise mode (no heightmap):** BFS from top down through each column
  - Light decreases by block opacity at each step

**Block Light Calculation:**
- BFS flood fill from all light-emitting blocks
- Allows re-queueing when stronger light path found
- Max iterations: `CHUNK_SIZE × WORLD_HEIGHT × CHUNK_SIZE × 4` (prevents infinite loops)
- Visited array tracks best known light level per block

**Light Opacity:**
| Block Type | Opacity |
|------------|---------|
| Air (ID 0) | 0 (fully transparent) |
| Liquids | 1 (partial light absorption) |
| Transparent blocks | 1 |
| Solid opaque blocks | 15 (fully opaque) |
| Unknown blocks | 2 (default) |

**Light Emission:**
- Read from `block.lightLevel` property (0–15)
- Examples: redstone_torch=7, lava=15, glowstone=15, end_rod=1

**Incremental Updates:**
- `updateBlockLighting(x, y, z)` recalculates sky light for column
- Block light re-run if emitting block changed
- Used by dimension.js on chunk generation and block changes

---

### [time.js](time.js) — World Time

World time: 24000 tick day cycle, time of day calculations, moon phases.

**Key Class:**
- `Donkeycraft.WorldTime` — Instance-based (one per world)

**Constants:**
| Constant | Value | Description |
|----------|-------|-------------|
| TICKS_PER_DAY | 24000 | Full day cycle |
| TICKS_PER_HOUR | 1000 | 24 hours per day |
| MOON_PHASE_CYCLE | 168000 | Moon cycles every 7 days |

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `tick()` | `void` | Advance by one tick |
| `advance(count)` | `void` | Advance by N ticks |
| `getTotalTicks()` | `number` | Total elapsed ticks |
| `setTotalTicks(ticks)` | `void` | Set total (clamped ≥ 0) |
| `getDays()` | `number` | Full days elapsed |
| `getTicksInDay()` | `number` | Ticks in current day [0, 23999] |
| `getTimeOfDay()` | `number` | Normalized time [0, 1) |
| `isDaytime()` | `boolean` | Currently daytime? |
| `isNight()` | `boolean` | Currently nighttime? |
| `getHour()` | `number` | Hour [0, 23] |
| `getMinute()` | `number` | Minute [0, 59] |
| `getMoonPhase()` | `number` | Phase [0, 7] |
| `getMoonPhaseName()` | `string` | Human-readable phase name |
| `getMoonIllumination()` | `number` | Illumination fraction [0, 1] |
| `reset()` | `void` | Reset to zero |
| `serialize()` | `{totalTicks}` | Serialized state |
| `deserialize(data)` | `WorldTime` | Restore from data |
| `destroy()` | `void` | Reset ticks |

**Static Methods:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getDayLength()` | `number` | Always 24000 |
| `todToTicks(tod)` | `number` | Time-of-day → ticks |
| `ticksToTod(ticksInDay)` | `number` | Ticks → time-of-day |
| `fromTimeOfDay(tod, currentTotal)` | `WorldTime` | Create from ToD |

**Time of Day Reference:**
| ToD | Ticks | Time | Description |
|-----|-------|------|-------------|
| 0.0 | 0 | 6:00 AM | Sunrise |
| 0.2 | 4800 | ~7:20 AM | Day begins |
| 0.25 | 6000 | 9:00 AM | Noon |
| 0.5 | 12000 | 3:00 PM | Sunset begins |
| 0.75 | 18000 | 9:00 PM | Night begins |
| 1.0 | 24000 | 6:00 AM | Next day |

**Daytime/Nighttime:**
- Daytime: ToD ∈ [0.2, 0.75) — approximately 6 AM to 6 PM in-game
- Nighttime: ToD ∈ [0.75, 1.0) ∪ [0, 0.2) — sunset to pre-sunrise

**Moon Phases:**
| Phase | Name | Illumination |
|-------|------|-------------|
| 0 | New Moon | 0% |
| 1 | Waxing Crescent | 25% |
| 2 | First Quarter | 50% |
| 3 | Waxing Gibbous | 75% |
| 4 | Full Moon | 100% |
| 5 | Waning Gibbous | 75% |
| 6 | Last Quarter | 50% |
| 7 | Waning Crescent | 25% |

**Moon Illumination Formula:**
- Waxing (phase ≤ 4): `illumination = phase / 4`
- Waning (phase > 4): `illumination = (8 - phase) / 4`

---

## Cross-references

- See [README-world.md](README-world.md) — Lighting engine processes chunk light data; physics system processes gravity blocks and liquid flow per chunk
- See [README-interaction.md](README-interaction.md) — Block placement/breaking triggers lighting updates
- See [README-npc.md](README-npc.md) — Hostile mobs spawn at nighttime; moon phase affects visual atmosphere