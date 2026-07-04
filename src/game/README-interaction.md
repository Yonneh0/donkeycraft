# Block Interaction Subsystem

Handles block placement, breaking mechanics, raycasting for hit detection, right-click interactions with special blocks, portal dimension travel, and crafting/smelt recipe registration.

## Table of Contents

- [Overview](#overview)
- [Block Placement](#block-placementjs)
- [Block Breaking](#block-actionjs)
- [Raycasting](#raycastjs)
- [Right-Click Interactions](#interactable-blocksjs)
- [Portal System](#portaljs)
- [Crafting Recipes](#recipe-registryjs)
- [Cross-references](#cross-references)

---

## Overview

The Block Interaction subsystem provides all player-block interaction mechanics. Raycasting detects what the player is looking at, block placement handles grid snapping and face normals, block breaking manages hardness timers and tool speed multipliers, interactive blocks handle right-click GUIs and toggles, portals enable dimension travel, and the recipe registry manages crafting and smelting recipes.

**Dependencies:**
- `chunk-manager.js` — Block access for all interactions
- `block.js` — Block definitions for drop information
- `tool.js` — Tool speed multipliers for breaking
- `redstone-engine.js` — Lever/button redstone signals

---

## Files

### [block-placement.js](block-placement.js) — Block Placement

Block placement with face normal handling, grid snapping, and placement validation rules.

**Key Class:**
- `Donkeycraft.BlockPlacement` — Static singleton module

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `placeBlock(chunkManager, x, y, z, blockId, player)` | `boolean` | Place block at global coords |
| `placeBlockFromRaycast(chunkManager, hitX,hitY,hitZ, faceNx,faceNy,faceNz, blockId, player)` | `boolean` | Place adjacent to hit face |
| `getPlacementPosition(hitX, hitY, hitZ, faceNx, faceNy, faceNz)` | `{x,y,z}` | Floored placement position |
| `canPlaceAt(chunkManager, x, y, z, player)` | `boolean` | No AABB overlap check |
| `getFaceNormals()` | `Object[]` | Array of 6 face normal objects |

**Placement Validation:**
1. Target must be air (block ID = 0)
2. Position must not overlap player AABB
3. Y must be within world bounds [0, WORLD_HEIGHT)

**Face Normal Handling:**
- Placement position = hitBlock - faceNormal
- Face normals: {x:-1,y:0,z:0}, {x:1,y:0,z:0}, {x:0,y:-1,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:-1}, {x:0,y:0,z:1}

**Events:**
- `blockPlaced` — Emitted on successful placement with {x, y, z, blockId}

---

### [block-action.js](block-action.js) — Block Breaking

Block breaking: hardness timer, tool speed multipliers, drop spawning.

**Key Class:**
- `Donkeycraft.BlockAction` — Static singleton module

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `startBreaking(x, y, z, blockId, drops, toolTier)` | `void` | Start breaking at coords |
| `tickBreakProgress(deltaTime)` | `Event[]` | Tick progress, return events |
| `cancelBreaking(x, y, z)` | `void` | Cancel break |
| `getBreakProgress(x, y, z)` | `number` | Progress 0–1, or 0 |
| `calculateBreakTime(blockId, toolTier='naked')` | `number` | Seconds to break |
| `getActiveBreakStates()` | `Object` | Map of key → state |
| `clearAll()` | `void` | Clear all states |
| `clearChunkBreakStates(chunkX, chunkZ)` | `void` | O(1) chunk cleanup |
| `setChunkManager(chunkManager)` | `void` | Set for re-verification |
| `getHardness(blockId)` | `number` | Block hardness value |
| `getToolMultiplier(tier)` | `number` | Speed multiplier for tier |
| `getAllToolMultipliers()` | `Object` | All tiers and multipliers |

**Tool Material Speed Multipliers:**
| Material | Multiplier |
|----------|-----------|
| naked | 1.0 |
| wood | 2.0 |
| stone | 4.0 |
| iron | 6.0 |
| gold | 12.0 |
| diamond | 8.0 |
| netherite | 9.0 |

**Break Time Formula:** `hardness / toolMultiplier` seconds

**Break Events:**
- `progress` — {type, x, y, z, progress, stage} — Emitted at ~6 stages (0–90%)
- `broken` — {type, x, y, z, blockId, drops} — Block fully broken

**State Management:**
- States keyed by `"x,y,z"` (floored coordinates)
- Chunk index for O(1) cleanup on chunk unload
- Break paused when player's chunk is not loaded (prevents drift)
- Re-verifies block ID before spawning drops (prevents double-drops)

---

### [raycast.js](raycast.js) — Raycasting

DDA raycasting through voxels: hit detection, block face normal, reach distance.

**Key Class:**
- `Donkeycraft.Raycast` — Static singleton module

**RaycastResult:**
| Property | Type | Description |
|----------|------|-------------|
| `blockX` | `number` | Global X of hit block |
| `blockY` | `number` | Global Y of hit block |
| `blockZ` | `number` | Global Z of hit block |
| `faceNormalX` | `number` | X of face normal |
| `faceNormalY` | `number` | Y of face normal |
| `faceNormalZ` | `number` | Z of face normal |
| `distance` | `number` | Distance from origin |
| `hitPosition` | `Vector3` | 3D hit point on face |

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `raycast(chunkManager, origin, direction, reach=6.0, ignoreIds?)` | `RaycastResult|null` | DDA raycast |
| `getDirectionFromRotation(yaw, pitch)` | `Vector3` | Forward direction vector |
| `getFaceNormals()` | `Object[]` | 6 face normal objects |

**Raycast Parameters:**
- `origin` — Ray origin (usually player eye position)
- `direction` — Normalized direction vector
- `reach` — Clamped to [1.0, 12.0], default PLAYER_REACH (6.0 creative, 3.0 survival)
- `ignoreIds` — Optional array of block IDs to skip

**DDA Algorithm:**
- Traverses voxel grid using Digital Differential Analyzer
- Samples at axis crossings for efficiency
- First solid block hit within reach returns result
- Starting voxel checked first (handles inside-block case)
- Max steps: `ceil(reach × √3) + 2`

---

### [interactable-blocks.js](interactable-blocks.js) — Right-Click Interactions

Right-click interactions with doors, chests, furnaces, levers, buttons, dispensers, and note blocks.

**Key Class:**
- `Donkeycraft.InteractableBlocks` — Static singleton module

**Interactive Block IDs:**
| ID | Name | Interaction Type |
|----|------|-----------------|
| 54 | chest | 'chest' |
| 61 | furnace | 'furnace' |
| 64 | door (wood) | 'door' |
| 71 | door (iron) | 'door' |
| 143 | trapdoor | 'trapdoor' |
| 69 | lever | 'lever' |
| 70 | button (stone) | 'button' |
| 147 | button (wood) | 'button' |
| 23 | dispenser | 'dispenser' |
| 121 | dropper | 'dispenser' |
| 25 | note_block | 'note_block' |

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `handleRightClick(chunkManager, player, x, y, z)` | `boolean` | Handle interaction |
| `isInteractiveBlock(blockId)` | `boolean` | Supports interaction |
| `getInteractionType(blockId)` | `string|null` | Type or null |
| `toggleDoor(chunkManager, x, y, z, isTrapdoor)` | `boolean` | Open/closed toggle |
| `toggleLever(chunkManager, x, y, z)` | `boolean` | On/off toggle |
| `pressButton(chunkManager, x, y, z)` | `boolean` | Momentary press |
| `openChest(chunkManager, player, x, y, z)` | `boolean` | Open GUI |
| `openFurnace(chunkManager, player, x, y, z)` | `boolean` | Open GUI |
| `activateDispenser(chunkManager, x, y, z)` | `boolean` | Activate |
| `playNoteBlock(chunkManager, x, y, z)` | `boolean` | Play note |
| `cancelAllButtonTimers()` | `void` | Cancel all button states |
| `getInteractiveBlockIds()` | `Object` | All interactive IDs |
| `setCurrentTick(tick)` | `void` | Set game tick (for button auto-reset) |
| `getCurrentTick()` | `number` | Current tick |
| `setEventBus(bus)` | `void` | Set EventBus for events |
| `clearChunkButtonStates(chunkX, chunkZ)` | `void` | O(1) chunk cleanup |
| `getInteractiveState(x, y, z)` | `Object|null` | Persistent state |
| `clearAllStates()` | `void` | Clear all states |
| `serializeState()` | `Object` | Serializable state |
| `deserializeState(data)` | `void` | Restore from data |

**Interaction Behaviors:**
- **Doors/Trapdoors:** Toggle open/closed, persistent state via `_interactiveStateStore`
- **Levers:** Toggle on/off, emit redstone signal if system exists
- **Buttons:** Momentary (10 ticks = 0.5s), auto-reset via tick-based system
- **Chests/Furnaces:** Open GUI events for UI system
- **Dispensers:** Activation event for redstone logic
- **Note Blocks:** Play note event

**Button State Management:**
- Uses tick-based system (`_buttonStates`) instead of setTimeout
- Duration: 10 ticks (0.5 seconds at 20 TPS)
- Chunk-indexed cleanup for O(1) unload performance
- Auto-cleanup via `setCurrentTick()` called from game loop

**Events:**
- `blockToggled` — {x, y, z, blockId, type, open/on}
- `buttonPressed` — {x, y, z}
- `guiOpen:chest` — {x, y, z, player}
- `guiOpen:furnace` — {x, y, z, player}
- `blockActivated:dispenser` — {x, y, z}
- `noteBlockPlayed` — {x, y, z}

---

### [portal.js](portal.js) — Portal System

Nether portal frame detection, creation, and dimension travel.

**Key Class:**
- `Donkeycraft.Portal` — Static singleton module

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `init(bus, chunkManager, dimensionType)` | `void` | Initialize system |
| `setEventBus(bus)` | `void` | Set EventBus |
| `setChunkManager(chunkManager)` | `void` | Set ChunkManager |
| `switchDimension(dimensionType)` | `void` | Switch active dimension |
| `isPortalBlock(blockId)` | `boolean` | Obsidian/crying obsidian |
| `isPortalActive(blockId)` | `boolean` | Portal block check |
| `detectNetherPortal(x, y, z)` | `Object|null` | Frame detection result |
| `createPortal(x, y, z, direction, dimensionType)` | `boolean` | Create portal frame |
| `findMatchingPortal(x, y, z, dimensionType)` | `Object|null` | Find nearby portal |
| `travelToDimension(fromDim, toDim, x, y, z)` | `Object|null` | Dimension travel |
| `isPortalAt(x, y, z)` | `boolean` | Portal block at position |
| `detectPortalAtPosition(x, y, z)` | `Object|null` | Detect portal at pos |
| `_checkPlayerInPortal(player)` | `boolean` | Auto-trigger travel |
| `getCurrentDimension()` | `number` | Current dimension type |
| `getAllPortals()` | `Object[]` | All registered portals |
| `clearAllPortals()` | `void` | Clear portal registry |
| `getObsidianId()` | `number` | Cached obsidian ID |
| `getNetherPortalId()` | `number` | Cached portal block ID |
| `getEndPortalId()` | `number` | Cached end portal ID |
| `invalidateBlockIdCache()` | `void` | Re-resolve block IDs |
| `destroy()` | `void` | Clear all state |

**Portal Frame Requirements:**
- Minimum 3-wide × 4-tall obsidian frame
- Interior filled with portal blocks
- Frame: 2 corner pillars (4 blocks each) + top bar + base
- Materials: obsidian or crying obsidian

**Coordinate Transformation:**
- Overworld → Nether: divide by 8 (NETHER_SCALE)
- Nether → Overworld: multiply by 8
- End: no coordinate change (scale = 1)

**Dimension Travel:**
- Auto-triggers when player stands in portal block
- Overworld ↔ Nether bidirectional travel
- Finds existing portal or auto-creates at destination
- Emits `portal:travel` event with {fromDimension, toDimension, position}

---

### [recipe-registry.js](recipe-registry.js) — Crafting Recipes

Central registry for all crafting recipes, furnace recipes, shapeless recipes.

**Key Class:**
- `Donkeycraft.Recipe` — Recipe definition
- `Donkeycraft.RecipeRegistry` — Static singleton module

**Recipe Types:**
| Type | Grid | Description |
|------|------|-------------|
| shaped | 2×2 or 3×3 | Position-sensitive crafting |
| shapeless | N/A | Order-independent crafting |
| smelt | — | Furnace smelting |

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `addRecipe(recipe)` | `void` | Auto-detect type |
| `addShapedRecipe(recipe)` | `void` | Add shaped recipe |
| `addShapelessRecipe(recipe)` | `void` | Add shapeless recipe |
| `addSmeltRecipe(recipe)` | `void` | Add smelting recipe |
| `matchShapedRecipe(inputGrid, rows, cols)` | `Recipe|null` | Match shaped recipe |
| `matchShapelessRecipe(itemCounts)` | `Recipe|null` | Match shapeless recipe |
| `getSmeltRecipe(inputBlockId)` | `Recipe|null` | Smelting output |
| `getSmeltOutput(inputBlockId)` | `number|null` | Output block ID |
| `getSmeltTime(inputBlockId)` | `number` | Cooking time in ticks |
| `getAllRecipes()` | `Recipe[]` | All recipes |
| `getRecipeById(id)` | `Recipe|null` | By unique ID |
| `getShapedCount()` | `number` | Shaped recipe count |
| `getShapelessCount()` | `number` | Shapeless recipe count |
| `getSmeltCount()` | `number` | Smelting recipe count |

**Registration Helpers:**
| Method | Parameters | Description |
|--------|-----------|-------------|
| `registerShaped(id, ingredients, gridSize, output, count)` | — | Shaped recipe |
| `registerShapeless(id, ingredients, output, count)` | — | Shapeless recipe |
| `registerSmelt(id, input, output, time)` | — | Smelting recipe |

**Shaped Recipe Matching:**
- Tries exact grid size first, falls back to smaller grids (3×3 → 2×2)
- Supports 4 rotations (0°, 90°, 180°, 270°)
- Null ingredients match empty slots
- Position-flexible within grid

**Registered Recipes:**
- Shaped: 57 recipes (planks, sticks, stairs, slabs, furniture, etc.)
- Shapeless: 30 recipes (decrafting, glass, smooth stone, ingot conversion)
- Smelting: 21 recipes (ores, sand→glass, raw→ingot, stone variants)

---

## Cross-references

- See [README-world.md](README-world.md) — ChunkManager provides block access for all interactions; portal uses Dimension system for coordinate transformation
- See [README-combat.md](README-combat.md) — Tool speed multipliers from tool.js used in block breaking
- See [README-redstone.md](README-redstone.md) — Levers and buttons emit redstone signals
- See [README-player.md](README-player.md) — Player stats record block interactions