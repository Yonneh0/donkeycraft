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
Each file is designed to be self-contained within its module group. Files only depend on:
- Core infrastructure — universally needed
- Lower-numbered groups in order

A file in `src/render/` should never import from `src/player/` or `src/world/`. Communication between modules happens through the `Donkeycraft` namespace and/or the event bus.

---

## File Inventory by Module Group

### 1. Core Infrastructure
Foundation layer — event system, math utilities, input handling, audio, configuration, initialization sequence.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 1 | `src/core/namespace.js` | Global `Donkeycraft` namespace object, version, utility constants | 42 |
| 2 | `src/core/eventbus.js` | Publish/subscribe event system for decoupled communication between systems | 139 |
| 3 | `src/core/config.js` | Game configuration: render distance, chunk size, tick rates, keybinds | 85 |
| 4 | `src/core/logger.js` | Tiered logging system (debug, info, warn, error) with toggle | 156 |
| 5 | `src/core/timer.js` | Delta-time accumulator, tick scheduler (game ticks at 20 TPS) | 146 |
| 6 | `src/core/input.js` | Keyboard/mouse input handler: key states, mouse capture, wheel events | 356 |
| 7 | `src/core/math-utils.js` | Vector3, Matrix4, Quaternion classes, noise functions (Perlin/Simplex) | 950 |
| 8 | `src/core/audio.js` | Web Audio API wrapper: sound playback, music, ambient sounds, positional audio | 218 |
| 9 | `src/core/init-sequence.js` | Async initialization pipeline: config → texture atlas → audio → IndexedDB | 216 |

**Subtotal: 9 files, ~2,308 lines**

---

### 2. Asset Generation
Procedural texture and sound generation.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 10 | `src/core/asset-generator.js` | Procedural textures (285+ block types via Simplex noise), procedural sounds (13 categories via Web Audio API), texture atlas canvas generation | 4,732 |

**Subtotal: 1 file, ~4,732 lines**

---

### 3. WebGL Rendering Engine
Custom WebGL rendering pipeline — shaders, meshes, chunks, camera, lighting, sky, weather, HUD.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 11 | `src/render/gl-context.js` | WebGL 1 context creation, error handling, capability queries | 252 |
| 12 | `src/render/shader-manager.js` | Shader compilation, linking, uniform/location caching | 406 |
| 13 | `src/render/shaders/vertex-shaders.glsl` | All vertex shaders as string resources (terrain, block break, GUI) | 87 |
| 14 | `src/render/shaders/fragment-shaders.glsl` | All fragment shaders (terrain lighting, fog, sky, GUI) | 86 |
| 15 | `src/render/geometry-builder.js` | Builds vertex buffers: position, UV, normal, light data for chunk meshes | 206 |
| 16 | `src/render/mesh-optimizer.js` | Face culling: removes faces between solid blocks, generates index buffers | 159 |
| 17 | `src/render/chunk-mesh.js` | Per-chunk mesh object: buffer management, update methods, draw calls | 191 |
| 18 | `src/render/terrain-renderer.js` | Main rendering: chunk iteration, frustum culling, batched draws | 439 |
| 19 | `src/render/camera.js` | First-person camera: position, rotation, projection matrix, FOV | 260 |
| 20 | `src/render/fog.js` | Distance fog, sky color based on biome/time, fog density | 80 |
| 21 | `src/render/sky.js` | Sky rendering: day/night gradient, sun, moon, stars, cloud layer | 172 |
| 22 | `src/render/lighting.js` | Directional light (sun), ambient light, sky color computation | 102 |
| 23 | `src/render/hand-renderer.js` | First-person hand/item rendering in bottom-right | 199 |
| 24 | `src/render/break-particles.js` | Block breaking particle system: animation, sprites, fade-out | 215 |
| 25 | `src/render/gui-renderer.js` | HUD overlay rendering: crosshair, hotbar background, health/hunger bars | 273 |
| 26 | `src/render/weather.js` | Weather rendering: rain/thunder/snow particles, biome restrictions, thunder intensity | 337 |

**Subtotal: 15 files, ~3,404 lines**

---

### 4. Block System
Block definitions, textures, models, and recipe registry.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 27 | `src/world/block.js` | Block definitions: IDs, names, hardness, blast resistance, drop, transparency flags, all 257 vanilla blocks + query methods | 531 |
| 28 | `src/world/block-state.js` | Block state metadata: variants (oak log direction, wool color), property system | 369 |
| 29 | `src/world/block-types.js` | Special block type classification: solid, transparent, liquid, opaque, full-block, replaceable | 286 |
| 30 | `src/world/texture-atlas.js` | Atlas generation: compiles all block textures into single WebGL texture, UV mapping | 270 |
| 31 | `src/world/block-models.js` | Baked models: face definitions for each block, AO data, BlockModelRegistry | 395 |
| 32 | `src/world/recipe-registry.js` | Central registry for all crafting recipes, furnace recipes, shapeless recipes with matching logic | 585 |

**Subtotal: 6 files, ~2,436 lines**

---

### 5. World Generation & Management
Chunks, terrain generation, biomes, structures, lighting engine, physics, dimensions, portals, time.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 33 | `src/world/chunk.js` | Chunk data structure: 16×256×16 array, block storage, lighting arrays, dirty flags | 263 |
| 34 | `src/world/chunk-manager.js` | Chunk loading/unloading: radius management, spawn/destroy, dirty tracking | 381 |
| 35 | `src/world/terrain-generator.js` | Heightmap generation: Perlin noise layers, biome height variation | 126 |
| 36 | `src/world/biome.js` | Biome definitions: temperature, rainfall, colors, grass/leaf color, spawn rates | 264 |
| 37 | `src/world/structure-generator.js` | Structure placement: ore veins, underground caves, surface structures | 262 |
| 38 | `src/world/ore-generator.js` | Ore distribution: vein placement per biome, rarity, Y-level ranges | 200 |
| 39 | `src/world/cave-generator.js` | Cave system: 3D noise-based cave generation, lava caves, mushroom caves | 159 |
| 40 | `src/world/water-generator.js` | Water source placement: lake detection, surface water flow | 166 |
| 41 | `src/world/terrain-surface.js` | Surface layer: top block per biome (grass→dirt→stone), sand beaches, snow | 170 |
| 42 | `src/world/lighting-engine.js` | Sky light & block light propagation: BFS flood fill, light updates | 235 |
| 43 | `src/world/physics.js` | Block physics: gravity blocks (sand/gravel), liquid flow, redstone signal propagation | 252 |
| 44 | `src/world/world-utils.js` | Shared coordinate and block access utilities | 144 |
| 45 | `src/world/dimension.js` | Dimension system: Overworld/Nether/End types, coordinate transformation, chunk isolation | 380 |
| 46 | `src/world/portal.js` | Portal detection, creation, dimension travel with coordinate transformation | 480 |
| 47 | `src/world/nether-generator.js` | Nether terrain: bedrock, lava sea level, netherrack, nether ores, basalt columns | 309 |
| 48 | `src/world/end-generator.js` | End terrain: island classification, end stone platform, end cities, chorus plants | 346 |
| 49 | `src/world/time.js` | World time: 24000 tick day cycle, moon phases, hour/minute calculations | 206 |

**Subtotal: 17 files, ~4,323 lines**

---

### 6. Player System
Player entity, movement physics, collision detection, jumping, flying, game modes, stats, hunger, XP, hurt box.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 50 | `src/player/player.js` | Player entity: position, velocity, rotation, dimensions (1.8×0.6), game mode, knockback | 346 |
| 51 | `src/player/movement.js` | Movement physics: walking, sprinting, swimming, flying, speed modifiers | 340 |
| 52 | `src/player/collision.js` | AABB collision detection & response against blocks, axis-separated resolution | 320 |
| 53 | `src/player/jumping.js` | Jump mechanics: height, frequency, cooldown timer, water swimming | 121 |
| 54 | `src/player/flying.js` | Creative/spectator flying: enable/disable, up/down, speed boost | 171 |
| 55 | `src/player/hurt-box.js` | Hitbox management, damage reception with absorption, knockback, fall damage | 342 |
| 56 | `src/player/game-mode.js` | Game modes: Survival (health, hunger, damage), Creative, Spectator | 239 |
| 57 | `src/player/stats.js` | Player stats: achievements/advancements, statistics tracking | 301 |
| 58 | `src/player/hunger.js` | Hunger system: food value, saturation, starvation damage, auto-regeneration | 244 |
| 59 | `src/player/experience.js` | XP system: levels, XP orbs, enchanting costs | 240 |

**Subtotal: 10 files, ~2,664 lines**

---

### 7. Interaction System
Raycasting, block mining/placing, right-click interactions with interactive blocks.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 60 | `src/interaction/raycast.js` | DDA raycasting through voxels: hit detection, block face normal, reach distance | 287 |
| 61 | `src/interaction/block-action.js` | Block breaking: hardness timer, tool speed multipliers, drop spawning | 356 |
| 62 | `src/interaction/block-placement.js` | Block placement: face normal handling, snap to grid, AABB player collision | 166 |
| 63 | `src/interaction/interactable-blocks.js` | Right-click interactions: doors, chests, furnaces, levers, buttons, dispensers | 474 |

**Subtotal: 4 files, ~1,283 lines**

---

### 8. Inventory & GUI System
Item stacks, inventories, GUI screens, hotbar, crafting grid, creative inventory, specialized UIs (furnace, chest, anvil, enchanting), debug overlay, DOM GUI elements, loading screen.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 64 | `src/ui/item-stack.js` | Item stack: item reference, count, NBT-like tag, clone, matches, canStackWith | 249 |
| 65 | `src/ui/inventory.js` | Inventory data: slots, content, drag state, shift-click logic, serialization | 375 |
| 66 | `src/ui/gui-manager.js` | GUI system: open/close screens, modal stacking, keyboard/mouse routing | 203 |
| 67 | `src/ui/hotbar.js` | Hotbar UI: slot rendering, number keys 1-9, scroll wheel selection | 275 |
| 68 | `src/ui/crafting-grid.js` | Crafting table GUI: 3×3 grid + output, recipe matching | 287 |
| 69 | `src/ui/creative-inventory.js` | Creative inventory: tab navigation (6 tabs), item search by name/ID | 341 |
| 70 | `src/ui/furnace-ui.js` | Furnace GUI: input slot, fuel slot, output, progress bar | 238 |
| 71 | `src/ui/chest-ui.js` | Chest GUI: 27 slots (single) / 54 slots (double), takeItem | 202 |
| 72 | `src/ui/anvil-ui.js` | Anvil GUI: rename, combine/repair with durability averaging, enchantment merging | 318 |
| 73 | `src/ui/enchanting-ui.js` | Enchanting GUI: 3 random enchantment options, level cost validation | 414 |
| 74 | `src/ui/debug-overlay.js` | Debug screen (F3): FPS, chunk info, biome, coordinates, light levels | 306 |
| 75 | `src/ui/gui-elements.js` | DOM-based UI components: drag-drop, tabs, buttons, text input | 811 |
| 76 | `src/ui/loading-screen.js` | DOM-based loading screen: progress bar, rotating tips, error display | 156 |

**Subtotal: 13 files, ~4,175 lines**

---

### 9. Entity & Mob System
Base entity system, passive mobs, hostile mobs, bosses, AI, projectiles, animal breeding, mob spawning.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 77 | `src/entity/entity.js` | Base entity class: position, velocity, rotation, health, bounding box, tick, serialize/deserialize | 368 |
| 78 | `src/entity/entity-manager.js` | Entity management: spawn, despawn, tick all entities, by-type queries | 214 |
| 79 | `src/entity/passive-mobs.js` | Passive mobs: cow, pig, sheep, chicken — wander, flee, drop items | 233 |
| 80 | `src/entity/hostile-mobs.js` | Hostile mobs: zombie, skeleton, spider, creeper, enderman — chase, attack, explode | 329 |
| 81 | `src/entity/boss-mobs.js` | Boss entities: Ender Dragon, Wither — phases, attacks, death animation | 348 |
| 82 | `src/entity/mob-ai.js` | Mob AI: A* pathfinding, line-of-sight raycasting, chase/flee, wander targeting | 258 |
| 83 | `src/entity/projectiles.js` | Projectiles: arrows, snowballs, ender pearls, dragon breath — gravity, impact behavior | 288 |
| 84 | `src/entity/animals.js` | Animal-specific: breeding, leads, baby speed multiplier, food items | 244 |
| 85 | `src/entity/mob-spawning.js` | Spawning system: spawn definitions, chunk/light/biome checks, mob caps | 497 |

**Subtotal: 9 files, ~2,779 lines**

---

### 10. Redstone System
Redstone logic engine: wiring, repeaters, comparators, observers, pistons, TNT.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 86 | `src/redstone/redstone-engine.js` | Redstone tick system: updates at game speed, signal propagation, dirty queue | 285 |
| 87 | `src/redstone/repeater-comparator.js` | Redstone repeater (delay 1-4 ticks), comparator (block compare/difference modes) | 439 |
| 88 | `src/redstone/observers.js` | Observer blocks: detect block changes, emit 1-tick pulse, cooldown system | 225 |
| 89 | `src/redstone/tnt.js` | TNT: 40-tick fuse, explosion radius 8, block destruction with blast resistance | 323 |
| 90 | `src/redstone/pistons.js` | Pistons & sticky pistons: push up to 12 blocks, pull, crush detection | 460 |
| 91 | `src/redstone/wiring.js` | Redstone dust/wire: signal strength (0-15), branching, torch states | 445 |

**Subtotal: 6 files, ~2,177 lines**

---

### 11. Game Systems
Enchantments, potions, and tool durability.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 92 | `src/game/enchantment.js` | Enchantment registry: 24 vanilla enchantments, compatibility rules, application logic | 292 |
| 93 | `src/game/potion.js` | Potion system: 18 potion effects, 40 potions, brewing recipes, active potion management | 514 |
| 94 | `src/game/tool.js` | Tool system: 7 material tiers, speed multipliers, correct-for-drop detection, durability | 461 |

**Subtotal: 3 files, ~1,267 lines**

---

### 12. Save/Load System
IndexedDB world storage and level data persistence.

| # | File | Description | Lines |
|---|------|-------------|-------|
| 95 | `src/storage/world-store.js` | IndexedDB world storage: save/load chunks, world info, dirty chunk batching | 375 |
| 96 | `src/storage/level-data.js` | Level data: spawn position, game mode, time, seed, player data, validation | 374 |

**Subtotal: 2 files, ~749 lines**

---

### 13. Main Entry Point

| # | File | Description | Lines |
|---|------|-------------|-------|
| 97 | `src/game.js` | Main game class: initialization, main loop (update + render), pause/resume, destroy, camera-player sync | 1,195 |

**Subtotal: 1 file, ~1,195 lines**

---

## Grand Totals

| Module Group | Files | Estimated Lines |
|--------------|-------|-----------------|
| 1. Core Infrastructure | 9 | ~2,308 |
| 2. Asset Generation | 1 | ~4,732 |
| 3. WebGL Rendering Engine | 15 | ~3,404 |
| 4. Block System | 6 | ~2,436 |
| 5. World Generation & Management | 17 | ~4,323 |
| 6. Player System | 10 | ~2,664 |
| 7. Interaction System | 4 | ~1,283 |
| 8. Inventory & GUI System | 13 | ~4,175 |
| 9. Entity & Mob System | 9 | ~2,779 |
| 10. Redstone System | 6 | ~2,177 |
| 11. Game Systems | 3 | ~1,267 |
| 12. Save/Load System | 2 | ~749 |
| 13. Main Entry Point | 1 | ~1,195 |
| **TOTAL** | **97 files** | **~27,492 lines of JS/GLSL** |

---

## Dependency Order

Scripts are loaded in this order in `index.html`:

```
1.  src/core/namespace.js          ← must be first
2.  src/core/eventbus.js
3.  src/core/config.js
4.  src/core/logger.js
5.  src/core/timer.js
6.  src/core/input.js
7.  src/core/math-utils.js
8.  src/core/audio.js
9.  src/core/init-sequence.js
10. src/core/asset-generator.js
11. src/render/gl-context.js
12. src/render/shader-manager.js
13. src/render/geometry-builder.js
14. src/render/mesh-optimizer.js
15. src/render/chunk-mesh.js
16. src/render/terrain-renderer.js
17. src/render/camera.js
18. src/render/fog.js
19. src/render/sky.js
20. src/render/lighting.js
21. src/render/hand-renderer.js
22. src/render/break-particles.js
23. src/render/gui-renderer.js
24. src/render/weather.js
25. src/world/block.js
26. src/world/block-state.js
27. src/world/block-types.js
28. src/world/texture-atlas.js
29. src/world/block-models.js
30. src/world/recipe-registry.js
31. src/world/chunk.js
32. src/world/chunk-manager.js
33. src/world/biome.js
34. src/world/terrain-generator.js
35. src/world/ore-generator.js
36. src/world/cave-generator.js
37. src/world/structure-generator.js
38. src/world/water-generator.js
39. src/world/terrain-surface.js
40. src/world/lighting-engine.js
41. src/world/physics.js
42. src/world/world-utils.js
43. src/world/dimension.js
44. src/world/portal.js
45. src/world/nether-generator.js
46. src/world/end-generator.js
47. src/world/time.js
48. src/player/player.js
49. src/player/movement.js
50. src/player/collision.js
51. src/player/jumping.js
52. src/player/flying.js
53. src/player/hurt-box.js
54. src/player/game-mode.js
55. src/player/stats.js
56. src/player/hunger.js
57. src/player/experience.js
58. src/interaction/raycast.js
59. src/interaction/block-action.js
60. src/interaction/block-placement.js
61. src/interaction/interactable-blocks.js
62. src/ui/item-stack.js
63. src/ui/inventory.js
64. src/ui/gui-manager.js
65. src/ui/hotbar.js
66. src/ui/crafting-grid.js
67. src/ui/creative-inventory.js
68. src/ui/furnace-ui.js
69. src/ui/chest-ui.js
70. src/ui/anvil-ui.js
71. src/ui/enchanting-ui.js
72. src/ui/debug-overlay.js
73. src/ui/gui-elements.js
74. src/ui/loading-screen.js
75. src/entity/entity.js
76. src/entity/entity-manager.js
77. src/entity/passive-mobs.js
78. src/entity/hostile-mobs.js
79. src/entity/boss-mobs.js
80. src/entity/mob-ai.js
81. src/entity/projectiles.js
82. src/entity/animals.js
83. src/entity/mob-spawning.js
84. src/redstone/redstone-engine.js
85. src/redstone/repeater-comparator.js
86. src/redstone/observers.js
87. src/redstone/tnt.js
88. src/redstone/pistons.js
89. src/redstone/wiring.js
90. src/game/enchantment.js
91. src/game/potion.js
92. src/game/tool.js
93. src/storage/world-store.js
94. src/storage/level-data.js
95. src/game.js                    ← loaded last
```

---

## Technical Risks & Mitigations

### WebGL 1.0 Batching Limitations
WebGL 1.0 does not support `gl.drawElementsInstanced`. To batch chunk meshes, you must either merge all chunk vertex buffers into one massive buffer (extremely slow to update when a single block changes) or issue one draw call per chunk (256 draw calls per frame). 256 draw calls is acceptable for WebGL 1.0 but requires careful state management.

### Runtime Texture Atlas Generation
Compiling 256+ 16x16 textures into a single atlas at runtime will cause a significant hitch on load. Consider pre-generating the atlas as a single image file, or using a Web Worker to generate it asynchronously. The current implementation uses `asset-generator.js` for procedural generation during the init sequence.

### Async Chunk Loading
IndexedDB is asynchronous. The chunk manager needs to handle missing chunks gracefully. If a chunk isn't loaded yet, the renderer must skip it or render a placeholder to prevent rendering gaps.

### Audio Preloading
AudioBuffers must be decoded asynchronously. The init-sequence module handles this with an async pipeline that ensures all sounds are ready before the game loop starts.

### Pointer Lock
`requestPointerLock()` must be called on an element that has focus and is in the foreground. Check `document.pointerLockElement` to verify lock state. Mouse delta (`movementX`/`movementY`) is only available when pointer lock is active.

### File Protocol Limitations
The `file:///` protocol may block XHR/Fetch for external assets. All textures are procedurally generated and all sounds use Web Audio API with programmatically generated buffers — no external file loading required at runtime.