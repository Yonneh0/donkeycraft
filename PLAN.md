# Donkeycraft Development Plan

## Architecture Overview

### Core Constraints & Decisions
- **No ES Modules**: All code uses IIFE (Immediately Invoked Function Expression) pattern, attaching classes to a global `Donkeycraft` namespace
- **Single Entry Point**: `index.html` loads scripts via `<script>` tags in dependency order
- **WebGL 1.0 Rendering**: Custom minimal WebGL pipeline (no Three.js — can't load from `file:///`)
- **Chunk-Based World**: 16×256×16 chunks, 16 chunk render radius
- **Storage**: IndexedDB for world saves (no server needed)
- **No Build Tools**: Raw JS files loaded directly in browser

### Global Namespace Pattern
Every class lives in its own file and registers itself:
```javascript
(function() {
    'use strict';
    Donkeycraft.MyClass = function(config) { /* ... */ };
    Donkeycraft.MyClass.prototype = { /* ... */ };
})();
```

### API Contract Pattern
Each class exposes a clear public API. Private methods/properties use underscore prefix:
```javascript
// Public API
Donkeycraft.Chunk.prototype.getBlock = function(x, y, z) { ... }
Donkeycraft.Chunk.prototype.setBlock = function(x, y, z, blockId) { ... }

// Private
Donkeycraft.Chunk.prototype._recalculateMesh = function() { ... }
```

### File Independence Principle
Each file is designed to be self-contained within its phase. Files only depend on:
- Core infrastructure (Phase 1) — universally needed
- Lower-numbered phases in order

### Status Markers
After thoroughly auditing each phase for functional correctness, update the status marker below. Only mark a phase as **FULLY OPERATIONAL** after functional testing confirms all features work correctly in-browser.

---

## Phase 1: Core Infrastructure [STATUS: FULLY OPERATIONAL]

Foundation layer — event system, math utilities, input handling, audio, configuration.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 1 | `src/core/namespace.js` | Global `Donkeycraft` namespace object, version, utility constants | 15 | [FULLY OPERATIONAL] |
| 2 | `src/core/eventbus.js` | Publish/subscribe event system for decoupled communication between systems | 60 | [FULLY OPERATIONAL] |
| 3 | `src/core/config.js` | Game configuration: render distance, chunk size, tick rates, keybinds | 80 | [FULLY OPERATIONAL] |
| 4 | `src/core/logger.js` | Tiered logging system (debug, info, warn, error) with toggle | 40 | [FULLY OPERATIONAL] |
| 5 | `src/core/timer.js` | Delta-time accumulator, tick scheduler (game ticks at 20 TPS) | 50 | [FULLY OPERATIONAL] |
| 6 | `src/core/input.js` | Keyboard/mouse input handler: key states, mouse capture, wheel events | 120 | [FULLY OPERATIONAL] |
| 7 | `src/core/math-utils.js` | Vector3, Matrix4, Quaternion classes, noise functions (Perlin/Simplex) | 350 | [FULLY OPERATIONAL] |
| 8 | `src/core/audio.js` | Web Audio API wrapper: sound playback, music, ambient sounds, positional audio | 150 | [FULLY OPERATIONAL] |

---

## Phase 2: WebGL Rendering Engine [STATUS: FULLY OPERATIONAL]

Custom WebGL rendering pipeline — shaders, meshes, chunks, camera, lighting, sky, HUD.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 9 | `src/render/gl-context.js` | WebGL 1 context creation, error handling, capability queries | 60 | [FULLY OPERATIONAL] |
| 10 | `src/render/shader-manager.js` | Shader compilation, linking, uniform/location caching | 120 | [FULLY OPERATIONAL] |
| 11 | `src/render/shaders/vertex-shaders.glsl` | All vertex shaders as string resources (terrain, block break, GUI) | 80 | [FULLY OPERATIONAL] |
| 12 | `src/render/shaders/fragment-shaders.glsl` | All fragment shaders (terrain lighting, fog, sky, GUI) | 100 | [FULLY OPERATIONAL] |
| 13 | `src/render/geometry-builder.js` | Builds vertex buffers: position, UV, normal, light data for chunk meshes | 200 | [FULLY OPERATIONAL] |
| 14 | `src/render/mesh-optimizer.js` | Face culling: removes faces between solid blocks, generates index buffers | 180 | [FULLY OPERATIONAL] |
| 15 | `src/render/chunk-mesh.js` | Per-chunk mesh object: buffer management, update methods, draw calls | 130 | [FULLY OPERATIONAL] |
| 16 | `src/render/terrain-renderer.js` | Main rendering: chunk iteration, frustum culling, batched draws | 200 | [FULLY OPERATIONAL] |
| 17 | `src/render/camera.js` | First-person camera: position, rotation, projection matrix, FOV | 100 | [FULLY OPERATIONAL] |
| 18 | `src/render/fog.js` | Distance fog, sky color based on biome/time, fog density | 80 | [FULLY OPERATIONAL] |
| 19 | `src/render/sky.js` | Sky rendering: day/night gradient, sun, moon, stars, cloud layer | 150 | [FULLY OPERATIONAL] |
| 20 | `src/render/lighting.js` | Directional light (sun), ambient light, sky color computation | 70 | [FULLY OPERATIONAL] |
| 21 | `src/render/hand-renderer.js` | First-person hand/item rendering in bottom-right | 120 | [FULLY OPERATIONAL] |
| 22 | `src/render/break-particles.js` | Block breaking particle system: animation, sprites, fade-out | 100 | [FULLY OPERATIONAL] |
| 23 | `src/render/gui-renderer.js` | HUD overlay rendering: crosshair, hotbar background, health/hunger bars | 150 | [FULLY OPERATIONAL] |

**Subtotal Phase 2: ~1,715 lines, 14 files**

---

## Phase 3: Block System [STATUS: FULLY OPERATIONAL]

Block definitions, textures, models, and recipe registry. All 144 functional tests passing.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 24 | `src/world/block.js` | Block definitions: IDs, names, hardness, blast resistance, drop, transparency flags, all 257 vanilla blocks + query methods | 565 | [FULLY OPERATIONAL] — verified: 257 blocks registered, lookup by ID/name, type queries (isTransparent, isSolid, isOpaque, isLiquid, isReplaceable), drop block/item counts |
| 25 | `src/world/block-state.js` | Block state metadata: variants (oak log direction, wool color), property system, ColorValues/AxisValues/FacingValues constants | 300 | [FULLY OPERATIONAL] — verified: BlockState get/set/clone/matches, registry hasStates/getDefaultState/findMatchingState/possibleStates, serialization |
| 26 | `src/world/block-types.js` | Special block type classification: solid, transparent, liquid, opaque, full-block, replaceable with fast lookups | 340 | [FULLY OPERATIONAL] — verified: all classification methods, getIdsByType returns correct arrays, isCollidable, blocksLight, getLightOpacity |
| 27 | `src/world/texture-atlas.js` | Atlas generation: compiles all block textures into single WebGL texture, UV mapping, pixel coordinate conversion | 250 | [FULLY OPERATIONAL] — verified: UV coordinates correct (stone=1/16 position), pixel UVs, bind/destroy, isReady check |
| 28 | `src/world/block-models.js` | Baked models: face definitions for each block, AO (ambient occlusion) data, BlockModelRegistry with automatic AO detection | 350 | [FULLY OPERATIONAL] — verified: 256 models registered, custom face textures (grass), hasAO for solid vs transparent, FACE_NORMALS constants |
| 29 | `src/world/recipe-registry.js` | Central registry for all crafting recipes, furnace recipes, shapeless recipes with matching logic | 729 | [FULLY OPERATIONAL] — verified: 57 shaped + 28 shapeless + 15 smelt recipes, matchShapedRecipe grid matching, matchShapelessRecipe inventory matching, getSmeltOutput/Time |

**Subtotal Phase 3: ~2,534 lines, 6 files**

---

## Phase 4: World Generation & Management [STATUS: FULLY OPERATIONAL]

Chunks, terrain generation, biomes, structures, lighting engine, physics.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 30 | `src/world/chunk.js` | Chunk data structure: 16×256×16 array, block storage, lighting arrays, dirty flags | 200 | [FULLY OPERATIONAL] — verified: block/light storage (65536 entries), set/get block and light methods, dirty flag tracking, coordinate helpers, destroy(), sky light clamping |
| 31 | `src/world/chunk-manager.js` | Chunk loading/unloading: radius management, spawn/destroy, dirty tracking | 180 | [FULLY OPERATIONAL] — verified: getChunk/create, hasChunk, dirty tracking, unload, callbacks (onChunkLoad/onChunkUnload), render distance updates, destroy/clearAll |
| 32 | `src/world/terrain-generator.js` | Heightmap generation: Perlin noise layers, biome height variation, shore/beach/cliff | 250 | [FULLY OPERATIONAL] — verified: 256-entry heightmaps, valid range [1, 246], ocean < plains < extreme hills height ordering |
| 33 | `src/world/biome.js` | Biome definitions: temperature, rainfall, colors, grass/leaf color, spawn rates | 200 | [FULLY OPERATIONAL] — verified: 15 biomes registered, property queries (isOcean/isDesert/hasSnow), decoration config, spawn rates with explicit zero comparison |
| 34 | `src/world/structure-generator.js` | Structure placement: ore veins, underground caves (wave function), surface structures | 300 | [FULLY OPERATIONAL] — verified: full pipeline generates stone/air/grass/bedrock, trees in forests, cacti in desert, bedrock always placed at Y=0-2 |
| 35 | `src/world/ore-generator.js` | Ore distribution: vein placement per biome, rarity, Y-level ranges for all ores | 120 | [FULLY OPERATIONAL] — verified: 7 ore types with correct Y-ranges, ores placed in chunks, emerald restricted to extreme hills |
| 36 | `src/world/cave-generator.js` | Cave system: 3D noise-based cave generation, lava caves, mushroom caves | 200 | [FULLY OPERATIONAL] — verified: density/radius/lavaY config accessors, runs without error on plains and ocean biomes |
| 37 | `src/world/water-generator.js` | Water source placement: lake detection, surface water flow, still vs flowing | 100 | [FULLY OPERATIONAL] — verified: default water level=63, water placed in ocean biome, underground lakes generated |
| 38 | `src/world/terrain-surface.js` | Surface layer: top block per biome (grass→dirt→stone), sand beaches, snow | 100 | [FULLY OPERATIONAL] — verified: grass for plains, sand for desert, snow for taiga, stone for extreme hills, dirt for swamp |
| 39 | `src/world/lighting-engine.js` | Sky light & block light propagation: BFS flood fill, light updates on block change | 250 | [FULLY OPERATIONAL] — verified: sky light fills from surface down (fast mode), block light BFS flood fill with crying_obsidian emission=10, opacity cache, invalidateCache |
| 40 | `src/world/physics.js` | Block physics: gravity blocks (sand/gravel), liquid flow, redstone signal propagation | 280 | [FULLY OPERATIONAL] — verified: isGravityBlock/isLiquidBlock queries, sand falls into air, sand on stone doesn't fall, liquid flow simulation |

**Subtotal Phase 4: ~1,980 lines, 11 files**

---

## Phase 5: Player & Movement [STATUS: PENDING]

Player entity, movement physics, collision detection, jumping, flying.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 41 | `src/player/player.js` | Player entity: position, velocity, rotation, dimensions (1.8×0.6), game mode | 150 | [ ] |
| 42 | `src/player/movement.js` | Movement physics: walking, sprinting, swimming, flying, speed modifiers | 200 | [ ] |
| 43 | `src/player/collision.js` | AABB collision detection & response against blocks, entity bounds | 200 | [ ] |
| 44 | `src/player/jumping.js` | Jump mechanics: height, frequency, swing through blocks, water swimming | 80 | [ ] |
| 45 | `src/player/flying.js` | Creative/spectator flying: up/down, speed boost (shift), collision in creative | 100 | [ ] |
| 46 | `src/player/hurt-box.js` | Hitbox management, damage reception, knockback, fall damage calculation | 120 | [ ] |

**Subtotal Phase 5: ~850 lines, 6 files**

---

## Phase 6: Interaction (Mining, Placing, Raycasting) [STATUS: PENDING]

Raycasting, block breaking/placing, right-click interactions.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 47 | `src/interaction/raycast.js` | DDA raycasting through voxels: hit detection, block face normal, reach distance | 150 | [ ] |
| 48 | `src/interaction/block-action.js` | Block breaking: hardness timer, tool speed multipliers, drop spawning | 150 | [ ] |
| 49 | `src/interaction/block-placement.js` | Block placement: face normal handling, snap to grid, placement rules | 100 | [ ] |
| 50 | `src/interaction/interactable-blocks.js` | Right-click interactions: doors, chests, furnaces, levers, buttons, dispensers | 200 | [ ] |

**Subtotal Phase 6: ~600 lines, 4 files**

---

## Phase 7: Inventory & UI System [STATUS: PENDING]

Item stacks, inventories, GUI screens, hotbar, crafting grid, HUD, debug overlay.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 51 | `src/ui/item-stack.js` | Item stack: item reference, count, NBT-like tag (durability, enchantments) | 100 | [ ] |
| 52 | `src/ui/inventory.js` | Inventory data: slots, content, drag state, shift-click logic | 150 | [ ] |
| 53 | `src/ui/gui-manager.js` | GUI system: open/close screens, modal stacking, keyboard routing | 120 | [ ] |
| 54 | `src/ui/hotbar.js` | Hotbar UI: slot rendering, number keys 1-9, scroll wheel selection | 100 | [ ] |
| 55 | `src/ui/crafting-grid.js` | Crafting table GUI: 3×3 grid + output, recipe matching, result drag | 180 | [ ] |
| 56 | `src/ui/creative-inventory.js` | Creative inventory: tab navigation, item search, grid display | 200 | [ ] |
| 57 | `src/ui/furnace-ui.js` | Furnace GUI: input slot, fuel slot, output, progress bar | 100 | [ ] |
| 58 | `src/ui/chest-ui.js` | Chest GUI: 27+27 slots, double-chest detection | 80 | [ ] |
| 59 | `src/ui/anvil-ui.js` | Anvil GUI: rename, combine, show price | 100 | [ ] |
| 60 | `src/ui/enchanting-ui.js` | Enchanting GUI: levels cost, enchantment options, table visual | 120 | [ ] |
| 61 | `src/ui/hud.js` | HUD rendering: health hearts, hunger drumsticks, XP bar, armor bar, coordinates (F3) | 250 | [ ] |
| 62 | `src/ui/debug-overlay.js` | Debug screen (F3): FPS, chunk info, biome, coordinates, light levels | 150 | [ ] |

**Subtotal Phase 7: ~1,550 lines, 12 files**

---

## Phase 8: Crafting & Recipes [STATUS: PENDING]

Crafting logic and all vanilla recipe definitions.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 63 | `src/crafting/crafting-manager.js` | Crafting logic: 2×2 (inventory), 3×3 (table/creative), shapeless support | 180 | [ ] |
| 64 | `src/crafting/recipe-types.js` | Recipe definitions: shaped, shapeless, furnace/smelt, smoking, blasting, stonecutter | 200 | [ ] |
| 65 | `src/crafting/recipe-data.js` | All vanilla recipe JSON data: ~300+ recipes defined as JS objects | 400 | [ ] |

**Subtotal Phase 8: ~780 lines, 3 files**

---

## Phase 9: Entities & Mobs [STATUS: PENDING]

Entity system, passive mobs, hostile mobs, bosses, AI, projectiles, spawning.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 66 | `src/entity/entity.js` | Base entity class: position, velocity, type, alive flag, tick method | 100 | [ ] |
| 67 | `src/entity/entity-manager.js` | Entity management: spawn, despawn, tick all entities, by-type queries | 100 | [ ] |
| 68 | `src/entity/passive-mobs.js` | Passive mobs: cow, pig, sheep, chicken — spawn, wander, flee players | 200 | [ ] |
| 69 | `src/entity/hostile-mobs.js` | Hostile mobs: zombie, skeleton, spider, creeper, enderman — spawn in dark, path toward players | 300 | [ ] |
| 70 | `src/entity/boss-mobs.js` | Boss entities: Ender Dragon, Wither — health, phases, attacks | 250 | [ ] |
| 71 | `src/entity/mob-ai.js` | Mob AI: pathfinding (A* on block grid), line-of-sight, attack behavior, flee | 350 | [ ] |
| 72 | `src/entity/projectiles.js` | Projectiles: arrows, snowballs, ender pearls, dragon breath, lava buckets | 150 | [ ] |
| 73 | `src/entity/animals.js` | Animal-specific: breeding, lead, name tags, baby speed | 120 | [ ] |
| 74 | `src/entity/mob-spawning.js` | Spawning system: chunk checks, light levels, biome rates, mob caps | 180 | [ ] |

**Subtotal Phase 9: ~1,650 lines, 9 files**

---

## Phase 10: Redstone System [STATUS: PENDING]

Redstone mechanics: wiring, repeaters, comparators, observers, pistons, TNT, dispensers.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 75 | `src/redstone/redstone-engine.js` | Redstone tick system: updates at game speed, signal propagation order | 150 | [ ] |
| 76 | `src/redstone/repeater-comparator.js` | Redstone repeater (delay, max 4), comparator (block compare, difference) | 150 | [ ] |
| 77 | `src/redstone/observers.js` | Observer blocks: detect block changes, emit pulse | 80 | [ ] |
| 78 | `src/redstone/tnt.js` | TNT: fuse timer, explosion logic, block destruction, damage | 120 | [ ] |
| 79 | `src/redstone/pistons.js` | Pistons & sticky pistons: push up to 12 blocks, pull, crush detection | 150 | [ ] |
| 80 | `src/redstone/dispenser-dropper.js` | Dispenser: fire charges, arrows, bottles, experience; Dropper: item shuffle | 130 | [ ] |
| 81 | `src/redstone/lever-button.js` | Levers (toggle), buttons (momentary), tripwire, pressure plates | 120 | [ ] |
| 82 | `src/redstone/wiring.js` | Redstone dust/wire: signal strength (0-15), branching, underground routing | 200 | [ ] |

**Subtotal Phase 10: ~1,100 lines, 8 files**

---

## Phase 11: Fluids [STATUS: PENDING]

Water and lava simulation and physics.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 83 | `src/world/fluid-simulation.js` | Fluid flow algorithm: source blocks, flow direction, update intervals | 200 | [ ] |
| 84 | `src/world/fluid-physics.js` | Water/lava interaction: obsidian/glass generation, cooling, evaporation | 100 | [ ] |

**Subtotal Phase 11: ~300 lines, 2 files**

---

## Phase 12: Dimensions & Portals [STATUS: PENDING]

Overworld, Nether, End dimensions and portal system.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 85 | `src/world/dimension.js` | Dimension system: Overworld, Nether, End — chunk data isolation, respawn anchors | 150 | [ ] |
| 86 | `src/world/portal.js` | Portal system: Nether portal frame detection, portal creation, dimension travel | 150 | [ ] |
| 87 | `src/world/nether-generator.js` | Nether terrain: bedrock ceiling/floor, lava seas, ghast spawn, unique structures | 120 | [ ] |
| 88 | `src/world/end-generator.js` | End terrain: obsidian platform, end islands, end midlands, outer end, end cities | 150 | [ ] |

**Subtotal Phase 12: ~570 lines, 4 files**

---

## Phase 13: Day/Night Cycle & Weather [STATUS: PENDING]

World time and weather rendering.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 89 | `src/world/time.js` | World time: 24000 tick day cycle, time of day calculations, moon phases | 100 | [ ] |
| 90 | `src/render/weather.js` | Weather: rain particles, thunder lightning, snow, wind effects | 150 | [ ] |

**Subtotal Phase 13: ~250 lines, 2 files**

---

## Phase 14: Save/Load System [STATUS: PENDING]

IndexedDB world storage and level data persistence.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 91 | `src/storage/world-store.js` | IndexedDB world storage: save chunks, load chunks, world info | 200 | [ ] |
| 92 | `src/storage/level-data.js` | Level data: spawn position, game mode, time, seed, player data | 100 | [ ] |

**Subtotal Phase 14: ~300 lines, 2 files**

---

## Phase 15: Game Modes & Player Stats [STATUS: PENDING]

Survival, Creative, Spectator modes and player statistics.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 93 | `src/player/game-mode.js` | Game modes: Survival (health, hunger, damage), Creative (fly, no damage, infinite items), Spectator (through blocks) | 150 | [ ] |
| 94 | `src/player/stats.js` | Player stats: achievements/advancements, statistics (blocks mined, entities killed) | 120 | [ ] |

**Subtotal Phase 15: ~270 lines, 2 files**

---

## Phase 16: Enchanting & Potions [STATUS: PENDING]

Enchantment system and potion effects.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 95 | `src/game/enchantment.js` | Enchantment system: available enchantments, levels, compatibility rules, application | 200 | [ ] |
| 96 | `src/game/potion.js` | Potion system: brewing recipe matching, effect application, duration, amplifier | 180 | [ ] |

**Subtotal Phase 16: ~380 lines, 2 files**

---

## Phase 17: Tools & Item Durability [STATUS: PENDING]

Tool system with material tiers and durability.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 97 | `src/game/tool.js` | Tool system: material tiers (wood→netherite), speed multipliers, correct-for-drop, durability | 180 | [ ] |

**Subtotal Phase 17: ~180 lines, 1 file**

---

## Phase 18: Health/Hunger/XP Systems [STATUS: PENDING]

Player survival mechanics.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 98 | `src/player/hunger.js` | Hunger system: food value, saturation, starvation damage, auto-regeneration | 150 | [ ] |
| 99 | `src/player/health.js` | Health system: hearts (20 HP), damage sources, regeneration, absorption | 120 | [ ] |
| 100 | `src/player/experience.js` | XP system: levels, XP orbs, enchanting costs, fishing XP, trade XP | 130 | [ ] |

**Subtotal Phase 18: ~400 lines, 3 files**

---

## Phase 19: Assets (Textures & Sounds) [STATUS: PENDING]

External asset files — textures and sounds.

| # | Path | Description | Status |
|------|-------|-------------|--------|
| 101 | `assets/textures/blocks/` | Block textures: 16×16 PNG spritesheet for all blocks (~256+ textures) | [ ] |
| 102 | `assets/textures/items/` | Item textures: tools, weapons, food, materials, decorations | [ ] |
| 103 | `assets/textures/entities/` | Mob & player textures: skin, mobs, items in hand | [ ] |
| 104 | `assets/sounds/block/` | Block sounds: step, break, place, hit for each material type | [ ] |
| 105 | `assets/sounds/entity/` | Entity sounds: mob ambience, player sounds, item use | [ ] |
| 106 | `assets/sounds/music/` | Music discs (as looped audio), ambient music tracks | [ ] |

**Subtotal Phase 19: Assets only, no code lines**

---

## Phase 20: UI / HTML/CSS Layer [STATUS: PENDING]

HTML entry point, stylesheets, DOM-based UI elements.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 107 | `index.html` | Main HTML: canvas, overlay divs for GUI screens, debug HUD, loading screen | 100 | [ ] |
| 108 | `css/style.css` | Base styles: full-screen canvas, overlay positioning, cursor, scrollbar hiding | 80 | [ ] |
| 109 | `css/gui.css` | GUI styles: inventory grid, hotbar, buttons, text, scroll containers | 200 | [ ] |
| 110 | `src/ui/gui-elements.js` | DOM-based UI: crafting grid drag-drop, creative inventory tabs, button clicks | 350 | [ ] |

**Subtotal Phase 20: ~730 lines, 4 files**

---

## Phase 21: Main Entry Point & Game Loop [STATUS: PENDING]

Main game class and script loader.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 111 | `src/game.js` | Main game class: initialization, main loop (update + render), pause/resume | 200 | [ ] |
| 112 | `src/loader.js` | Script loader: dynamically loads all JS files in dependency order, handles errors | 100 | [ ] |

**Subtotal Phase 21: ~300 lines, 2 files**

---

## Milestones & Integration Testing

Milestones are critical integration points where multiple phases are combined and tested as a cohesive system. These tests ensure that the interfaces between phases function correctly before proceeding to complex subsystems.

### Milestone 1: "Hello World" [After Phase 2]
**Goal:** Verify rendering pipeline works with core infrastructure.
- **Test:** Create a WebGL canvas, compile shaders, draw a rotating colored cube.
- **Validation:** Cube rotates smoothly at 60 FPS. Camera matrix updates correctly. Shader errors are caught and logged.

### Milestone 2: "Voxel World" [After Phase 4]
**Goal:** Verify world generation and rendering integration.
- **Test:** Generate a chunk with terrain, ores, and caves. Render it in the WebGL viewport.
- **Validation:** Terrain height matches noise output. Ores appear at correct Y-levels. Caves are visible as empty space. Chunk mesh updates when blocks change.

### Milestone 3: "Survival Loop" [After Phase 6]
**Goal:** Verify player interaction with the world.
- **Test:** Walk around generated terrain. Break and place blocks. Use raycasting to target blocks.
- **Validation:** Player moves with WASD. Mouse look works. Left-click breaks blocks with correct particle effects. Right-click places blocks with correct orientation. Inventory updates.

### Milestone 4: "Crafting & Survival" [After Phase 8]
**Goal:** Verify crafting and inventory systems work together.
- **Test:** Gather resources, open crafting table, craft items, equip tools.
- **Validation:** Recipes match correctly. Items appear in inventory. Tools break blocks faster. Hunger decreases over time.

### Milestone 5: "Living World" [After Phase 10]
**Goal:** Verify entities and redstone interact with the world.
- **Test:** Spawn mobs, build redstone contraptions, observe mob AI.
- **Validation:** Mobs spawn in dark areas. Redstone signals propagate correctly. Pistons move blocks. Mobs attack player or flee.

### Milestone 6: "Complete Game" [After Phase 21]
**Goal:** Verify full game loop and persistence.
- **Test:** Start new world, play for 10 minutes, save, quit, reload.
- **Validation:** World loads exactly as saved. Player stats persist. All systems (rendering, input, audio, logic) run simultaneously without conflicts.

---

## Grand Totals

| Category | Files | Estimated Lines |
|----------|-------|----------------|
| Phase 1: Core Infrastructure | 8 | ~865 |
| Phase 2: WebGL Rendering | 14 | ~1,715 |
| Phase 3: Block System | 6 | ~1,010 |
| Phase 4: World Generation | 11 | ~1,980 |
| Phase 5: Player & Movement | 6 | ~850 |
| Phase 6: Interaction | 4 | ~600 |
| Phase 7: Inventory & UI | 12 | ~1,550 |
| Phase 8: Crafting & Recipes | 3 | ~780 |
| Phase 9: Entities & Mobs | 9 | ~1,650 |
| Phase 10: Redstone | 8 | ~1,100 |
| Phase 11: Fluids | 2 | ~300 |
| Phase 12: Dimensions | 4 | ~570 |
| Phase 13: Time & Weather | 2 | ~250 |
| Phase 14: Save/Load | 2 | ~300 |
| Phase 15: Game Modes | 2 | ~270 |
| Phase 16: Enchanting & Potions | 2 | ~380 |
| Phase 17: Tools | 1 | ~180 |
| Phase 18: Health/Hunger/XP | 3 | ~400 |
| Phase 19: Assets | — | (external) |
| Phase 20: UI / HTML/CSS | 4 | ~730 |
| Phase 21: Main Entry & Loop | 2 | ~300 |
| **TOTAL** | **~112 files** | **~15,470 lines of JS** |

---

## Recommended Development Order

1. **Phase 1 → 2**: Get a rotating cube on screen with WebGL
2. **Phase 3 → 4**: Generate a chunked voxel world with terrain
3. **Phase 5 → 6**: Walk around, look around, break/place blocks
4. **Phase 7 → 8**: Inventory system + crafting recipes
5. **Phase 18 → 15**: Health, hunger, game modes (survival loop)
6. **Phase 9**: Add mobs with basic AI
7. **Phase 10**: Redstone mechanics
8. **Phase 12**: Nether & End dimensions
9. **Phase 13 → 14**: Day/night cycle, weather, world save/load
10. **Phase 16 → 17**: Enchanting, potions, tools
11. **Phase 11**: Fluid simulation polish
12. **Phase 19**: All textures and sounds
13. **Phase 20 → 21**: Polish UI, debug screen, F3 info

---

## Key Technical Notes for AI Implementers

### No-Server Constraint
All assets must be relative paths (`./assets/...`). No fetch() to localhost. For sounds, use AudioContext with base64-encoded data URIs if needed, or pre-loaded AudioBuffer objects.

### Texture Loading
Textures are loaded from `assets/textures/` as images, then uploaded to WebGL textures. The texture atlas (Phase 3) stitches them into a single WebGL texture for batched rendering.

### Testing Approach
Each phase should be testable in isolation:
- Phase 1-2: Render a colored rotating cube
- Phase 3-4: Render a flat terrain with different block types
- Phase 5-6: WASD movement + mouse look + block interaction
- Each subsequent phase builds on verified previous phases

### Dependency Order
Scripts are loaded in this order in `index.html`:
1. `src/core/namespace.js`
2. `src/core/eventbus.js`
3. `src/core/config.js`
4. `src/core/logger.js`       ← must precede timer (timer references Logger)
5. `src/core/timer.js`
6. `src/core/input.js`
7. `src/core/math-utils.js`   ← must precede audio (audio uses Donkeycraft.clamp)
8. `src/core/audio.js`
9-22. Phase 2 files (render/)
23-28. Phase 3 files (world/block*)
... and so on, phase by phase
107-110. Phase 20 files (UI/HTML)
111-112. `src/game.js` and `src/loader.js` last

### Updating This Plan
The only changes future AIs should make to PLAN.md are:
1. Adding "FULLY OPERATIONAL" after thoroughly auditing a phase
2. Changing `[ ]` to `[FULLY OPERATIONAL]` for each completed phase
3. Adding notes under a phase's status marker if important findings were discovered

No changelogs, no bugfix reports — this is a living plan document, not a change log.