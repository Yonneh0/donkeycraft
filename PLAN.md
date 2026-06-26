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
| 41 | `src/world/world-utils.js` | Shared coordinate and block access utilities: getBlockAt, setBlockAt, isChunkLoaded, getChunkAndLocalCoords, calculateRaycastMaxSteps, makeStateKey, parseStateKey, makeChunkKey | 172 | [FULLY OPERATIONAL] — verified: block lookup/set at global coords, chunk load checks, coordinate conversion, raycast max steps formula ceil(reach*sqrt(3))+2, state/chunk key helpers |

**Subtotal Phase 4: ~2,152 lines, 12 files**

---

## Phase 5: Player & Movement [STATUS: FULLY OPERATIONAL]

Player entity, movement physics, collision detection, jumping, flying.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 42 | `src/player/player.js` | Player entity: position, velocity, rotation, dimensions (1.8×0.6), game mode, knockback, fall distance, eye position | 386 | [FULLY OPERATIONAL] — verified: position/velocity/rotation getters/setters, pitch clamping to π/2, game modes (survival/creative/spectator), AABB hurt box calculation, forward/right direction vectors, knockback application/clearing, fall distance tracking, destroy() |
| 43 | `src/player/movement.js` | Movement physics: walking, sprinting, swimming, flying, speed modifiers, game-mode-specific horizontal speeds | 407 | [FULLY OPERATIONAL] — verified: survival walking speed 5.0 blocks/s, creative flying speed 5.0 (10.0 with shift), sprint key detection, swimming/slowness modifiers, getGameMode/setGameMode accessors, tick-based velocity application |
| 44 | `src/player/collision.js` | AABB collision detection & response against blocks, entity bounds, axis-separated resolution for wall sliding | 395 | [FULLY OPERATIONAL] — verified: resolveMovement axis-separated collision (X/Y/Z independent), checkMovement for per-axis overlap, isBlockSolid queries, getOverlappingBlocks returns intersecting block list, onGround flag set when blocked from below |
| 45 | `src/player/jumping.js` | Jump mechanics: height (0.42 force), frequency, cooldown timer, water swimming (Space key upward movement) | 156 | [FULLY OPERATIONAL] — verified: canJump ground+cooldown check, performJump applies 0.42 upward force, cooldown prevents rapid jumps, isSwimmingUp for water movement, jump force configurable via getJumpForce |
| 46 | `src/player/flying.js` | Creative/spectator flying: enable/disable toggle, up/down, speed boost (shift = 2x), spectator clipping through blocks | 205 | [FULLY OPERATIONAL] — verified: isFlying/isEnabled state tracking, toggleFlyMode, setEnabled, normal fly speed 5.0, sprint fly speed 10.0, canSpectate for creative/spectator modes, shouldClipThroughBlocks for spectator mode, survival mode cannot enable flying |
| 47 | `src/player/hurt-box.js` | Hitbox management, damage reception with absorption hearts, knockback, fall damage calculation, healing, death callbacks | 399 | [FULLY OPERATIONAL] — verified: takeDamage returns amount dealt, health tracking with absorption (absorbs first then damages health), heal restores up to max, creative mode immunity (returns 0), fall damage formula (distance-3)/2, knockback application/clearing, death callback with source tracking, reset revives and restores health |

**Subtotal Phase 5: ~1,948 lines, 6 files**

---

## Phase 6: Interaction (Mining, Placing, Raycasting) [STATUS: FULLY OPERATIONAL]

Raycasting, block breaking/placing, right-click interactions. All 191 tests passing.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 48 | `src/interaction/raycast.js` | DDA raycasting through voxels: hit detection, block face normal, reach distance, ignoreIds, direction-from-rotation | 332 | [FULLY OPERATIONAL] — verified: RaycastResult class, wall hit detection (X/Y/Z axes), reach enforcement (1.0–12.0 clamp), ignoreIds filtering, zero/near-zero direction handling, origin-inside-block DDA stepping, post-step reach clamp, calculateRaycastMaxSteps formula |
| 49 | `src/interaction/block-action.js` | Block breaking: hardness timer, tool speed multipliers, drop spawning, chunk-index cleanup, break progress pause on unload | 405 | [FULLY OPERATIONAL] — verified: air hardness=0, all tool tiers (naked→netherite), break time calculation, chunk-index O(1) clearChunkBreakStates, debounced progress events with stage field, block re-verification on completion, float coordinate flooring, concurrent break states in different chunks |
| 50 | `src/interaction/block-placement.js` | Block placement: face normal handling, snap to grid, AABB player collision, WorldUtils integration | 186 | [FULLY OPERATIONAL] — verified: placement against wall via raycast face normal, top/bottom/left/right/front/back positions, player AABB overlap rejection, world bounds (Y<0, Y≥WORLD_HEIGHT), chunk boundary (local X=15), unloaded chunk rejection, float coordinate flooring |
| 51 | `src/interaction/interactable-blocks.js` | Right-click interactions: doors, chests, furnaces, levers, buttons, dispensers, note blocks — tick-based state management | 534 | [FULLY OPERATIONAL] — verified: isInteractiveBlock O(1) Set lookup, all interaction types, toggleDoor/toggleLever state persistence, pressButton tick-based cooldown with auto-cleanup, clearChunkButtonStates O(K) via chunk index, serializeState/deserializeState, float coordinate flooring in handleRightClick |

**Subtotal Phase 6: ~1,457 lines, 4 files**

---

## Phase 6.5: Loading Screen & Initialization [STATUS: PENDING]

Async initialization sequence and loading screen UI. Required because IndexedDB, AudioBuffer decoding, and texture atlas generation are asynchronous and must complete before the game loop starts.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 52 | `src/core/init-sequence.js` | Async initialization: loads textures, decodes audio buffers, initializes IndexedDB, then starts game loop | 150 | [ ] |
| 53 | `src/ui/loading-screen.js` | DOM-based loading screen: progress bar, loading tips, error handling | 100 | [ ] |

**Subtotal Phase 6.5: ~250 lines, 2 files**

---

## Phase 7: Inventory & UI System [STATUS: PENDING]

Item stacks, inventories, GUI screens, hotbar, crafting grid, HUD, debug overlay.
*Note: HUD rendering is handled by Phase 2's `gui-renderer.js`. This phase focuses on DOM-based GUI screens and inventory logic.*

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 54 | `src/ui/item-stack.js` | Item stack: item reference, count, NBT-like tag (durability, enchantments) | 100 | [ ] |
| 55 | `src/ui/inventory.js` | Inventory data: slots, content, drag state, shift-click logic | 150 | [ ] |
| 56 | `src/ui/gui-manager.js` | GUI system: open/close screens, modal stacking, keyboard routing | 120 | [ ] |
| 57 | `src/ui/hotbar.js` | Hotbar UI: slot rendering, number keys 1-9, scroll wheel selection | 100 | [ ] |
| 58 | `src/ui/crafting-grid.js` | Crafting table GUI: 3×3 grid + output, recipe matching, result drag | 180 | [ ] |
| 59 | `src/ui/creative-inventory.js` | Creative inventory: tab navigation, item search, grid display | 200 | [ ] |
| 60 | `src/ui/furnace-ui.js` | Furnace GUI: input slot, fuel slot, output, progress bar | 100 | [ ] |
| 61 | `src/ui/chest-ui.js` | Chest GUI: 27+27 slots, double-chest detection | 80 | [ ] |
| 62 | `src/ui/anvil-ui.js` | Anvil GUI: rename, combine, show price | 100 | [ ] |
| 63 | `src/ui/enchanting-ui.js` | Enchanting GUI: levels cost, enchantment options, table visual | 120 | [ ] |
| 64 | `src/ui/debug-overlay.js` | Debug screen (F3): FPS, chunk info, biome, coordinates, light levels | 150 | [ ] |

**Subtotal Phase 7: ~1,450 lines, 11 files**

---

## Phase 8: Crafting & Recipes [STATUS: REMOVED]

*Removed: Phase 3's `recipe-registry.js` already covers all crafting logic, recipe definitions, and matching. No separate phase needed.*

---

## Phase 9: Entities & Mobs [STATUS: PENDING]

Entity system, passive mobs, hostile mobs, bosses, AI, projectiles, spawning.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 65 | `src/entity/entity.js` | Base entity class: position, velocity, type, alive flag, tick method | 100 | [ ] |
| 66 | `src/entity/entity-manager.js` | Entity management: spawn, despawn, tick all entities, by-type queries | 100 | [ ] |
| 67 | `src/entity/passive-mobs.js` | Passive mobs: cow, pig, sheep, chicken — spawn, wander, flee players | 200 | [ ] |
| 68 | `src/entity/hostile-mobs.js` | Hostile mobs: zombie, skeleton, spider, creeper, enderman — spawn in dark, path toward players | 300 | [ ] |
| 69 | `src/entity/boss-mobs.js` | Boss entities: Ender Dragon, Wither — health, phases, attacks | 250 | [ ] |
| 70 | `src/entity/mob-ai.js` | Mob AI: pathfinding (A* on block grid), line-of-sight, attack behavior, flee | 350 | [ ] |
| 71 | `src/entity/projectiles.js` | Projectiles: arrows, snowballs, ender pearls, dragon breath, lava buckets | 150 | [ ] |
| 72 | `src/entity/animals.js` | Animal-specific: breeding, lead, name tags, baby speed | 120 | [ ] |
| 73 | `src/entity/mob-spawning.js` | Spawning system: chunk checks, light levels, biome rates, mob caps | 180 | [ ] |

**Subtotal Phase 9: ~1,650 lines, 9 files**

---

## Phase 10: Redstone System [STATUS: PENDING]

Redstone mechanics: wiring, repeaters, comparators, observers, pistons, TNT, dispensers.
*Note: Levers, buttons, and dispensers are handled by Phase 6's `interactable-blocks.js`. This phase focuses on redstone logic and advanced block mechanics.*

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 74 | `src/redstone/redstone-engine.js` | Redstone tick system: updates at game speed, signal propagation order | 150 | [ ] |
| 75 | `src/redstone/repeater-comparator.js` | Redstone repeater (delay, max 4), comparator (block compare, difference) | 150 | [ ] |
| 76 | `src/redstone/observers.js` | Observer blocks: detect block changes, emit pulse | 80 | [ ] |
| 77 | `src/redstone/tnt.js` | TNT: fuse timer, explosion logic, block destruction, damage | 120 | [ ] |
| 78 | `src/redstone/pistons.js` | Pistons & sticky pistons: push up to 12 blocks, pull, crush detection | 150 | [ ] |
| 79 | `src/redstone/wiring.js` | Redstone dust/wire: signal strength (0-15), branching, underground routing | 200 | [ ] |

**Subtotal Phase 10: ~850 lines, 6 files**

---

## Phase 11: Fluids [STATUS: REMOVED]

*Removed: Phase 4's `physics.js` already covers liquid flow simulation. No separate phase needed.*

---

## Phase 12: Dimensions & Portals [STATUS: PENDING]

Overworld, Nether, End dimensions and portal system.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 80 | `src/world/dimension.js` | Dimension system: Overworld, Nether, End — chunk data isolation, respawn anchors | 150 | [ ] |
| 81 | `src/world/portal.js` | Portal system: Nether portal frame detection, portal creation, dimension travel | 150 | [ ] |
| 82 | `src/world/nether-generator.js` | Nether terrain: bedrock ceiling/floor, lava seas, ghast spawn, unique structures | 120 | [ ] |
| 83 | `src/world/end-generator.js` | End terrain: obsidian platform, end islands, end midlands, outer end, end cities | 150 | [ ] |

**Subtotal Phase 12: ~570 lines, 4 files**

---

## Phase 13: Day/Night Cycle & Weather [STATUS: PENDING]

World time and weather rendering.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 84 | `src/world/time.js` | World time: 24000 tick day cycle, time of day calculations, moon phases | 100 | [ ] |
| 85 | `src/render/weather.js` | Weather: rain particles, thunder lightning, snow, wind effects | 150 | [ ] |

**Subtotal Phase 13: ~250 lines, 2 files**

---

## Phase 14: Save/Load System [STATUS: PENDING]

IndexedDB world storage and level data persistence.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 86 | `src/storage/world-store.js` | IndexedDB world storage: save chunks, load chunks, world info | 200 | [ ] |
| 87 | `src/storage/level-data.js` | Level data: spawn position, game mode, time, seed, player data | 100 | [ ] |

**Subtotal Phase 14: ~300 lines, 2 files**

---

## Phase 15: Game Modes & Player Stats [STATUS: PENDING]

Survival, Creative, Spectator modes and player statistics.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 88 | `src/player/game-mode.js` | Game modes: Survival (health, hunger, damage), Creative (fly, no damage, infinite items), Spectator (through blocks) | 150 | [ ] |
| 89 | `src/player/stats.js` | Player stats: achievements/advancements, statistics (blocks mined, entities killed) | 120 | [ ] |

**Subtotal Phase 15: ~270 lines, 2 files**

---

## Phase 16: Enchanting & Potions [STATUS: PENDING]

Enchantment system and potion effects.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 90 | `src/game/enchantment.js` | Enchantment system: available enchantments, levels, compatibility rules, application | 200 | [ ] |
| 91 | `src/game/potion.js` | Potion system: brewing recipe matching, effect application, duration, amplifier | 180 | [ ] |

**Subtotal Phase 16: ~380 lines, 2 files**

---

## Phase 17: Tools & Item Durability [STATUS: PENDING]

Tool system with material tiers and durability.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 92 | `src/game/tool.js` | Tool system: material tiers (wood→netherite), speed multipliers, correct-for-drop, durability | 180 | [ ] |

**Subtotal Phase 17: ~180 lines, 1 file**

---

## Phase 18: Health/Hunger/XP Systems [STATUS: PENDING]

Player survival mechanics.
*Note: Core health, damage, and absorption are handled by Phase 5's `hurt-box.js`. This phase focuses on hunger and XP.*

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 93 | `src/player/hunger.js` | Hunger system: food value, saturation, starvation damage, auto-regeneration | 150 | [ ] |
| 94 | `src/player/experience.js` | XP system: levels, XP orbs, enchanting costs, fishing XP, trade XP | 130 | [ ] |

**Subtotal Phase 18: ~280 lines, 2 files**

---

## Phase 19: Assets (Textures & Sounds) [STATUS: PENDING]

External asset files — textures and sounds.

| # | Path | Description | Status |
|------|-------|-------------|--------|
| 95 | `assets/textures/blocks/` | Block textures: 16×16 PNG spritesheet for all blocks (~256+ textures) | [ ] |
| 96 | `assets/textures/items/` | Item textures: tools, weapons, food, materials, decorations | [ ] |
| 97 | `assets/textures/entities/` | Mob & player textures: skin, mobs, items in hand | [ ] |
| 98 | `assets/sounds/block/` | Block sounds: step, break, place, hit for each material type | [ ] |
| 99 | `assets/sounds/entity/` | Entity sounds: mob ambience, player sounds, item use | [ ] |
| 100 | `assets/sounds/music/` | Music discs (as looped audio), ambient music tracks | [ ] |

**Subtotal Phase 19: Assets only, no code lines**

---

## Phase 20: UI / HTML/CSS Layer [STATUS: PENDING]

HTML entry point, stylesheets, DOM-based UI elements.

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 101 | `index.html` | Main HTML: canvas, overlay divs for GUI screens, debug HUD, loading screen | 100 | [ ] |
| 102 | `css/style.css` | Base styles: full-screen canvas, overlay positioning, cursor, scrollbar hiding | 80 | [ ] |
| 103 | `css/gui.css` | GUI styles: inventory grid, hotbar, buttons, text, scroll containers | 200 | [ ] |
| 104 | `src/ui/gui-elements.js` | DOM-based UI: crafting grid drag-drop, creative inventory tabs, button clicks | 350 | [ ] |

**Subtotal Phase 20: ~730 lines, 4 files**

---

## Phase 21: Main Entry Point & Game Loop [STATUS: PENDING]

Main game class and script loader.
*Note: `loader.js` removed. Scripts are loaded via `<script>` tags in `index.html`.*

| # | File | Description | Lines | Status |
|---|------|-------------|-------|--------|
| 105 | `src/game.js` | Main game class: initialization, main loop (update + render), pause/resume | 200 | [ ] |

**Subtotal Phase 21: ~200 lines, 1 file**

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

### Milestone 4: "Crafting & Survival" [After Phase 7]
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
| Phase 3: Block System | 6 | ~2,534 |
| Phase 4: World Generation | 12 | ~2,152 |
| Phase 5: Player & Movement | 6 | ~1,948 |
| Phase 6: Interaction | 4 | ~1,457 |
| Phase 6.5: Loading Screen | 2 | ~250 |
| Phase 7: Inventory & UI | 11 | ~1,450 |
| Phase 9: Entities & Mobs | 9 | ~1,650 |
| Phase 10: Redstone | 6 | ~850 |
| Phase 12: Dimensions | 4 | ~570 |
| Phase 13: Time & Weather | 2 | ~250 |
| Phase 14: Save/Load | 2 | ~300 |
| Phase 15: Game Modes | 2 | ~270 |
| Phase 16: Enchanting & Potions | 2 | ~380 |
| Phase 17: Tools | 1 | ~180 |
| Phase 18: Health/Hunger/XP | 2 | ~280 |
| Phase 19: Assets | — | (external) |
| Phase 20: UI / HTML/CSS | 4 | ~730 |
| Phase 21: Main Entry & Loop | 1 | ~200 |
| **TOTAL** | **~86 files** | **~16,036 lines of JS** |

---

## Recommended Development Order

1. **Phase 1 → 2**: Get a rotating cube on screen with WebGL
2. **Phase 3 → 4**: Generate a chunked voxel world with terrain
3. **Phase 5 → 6**: Walk around, look around, break/place blocks
4. **Phase 6.5**: Implement loading screen and async initialization
5. **Phase 7**: Inventory system + crafting recipes
6. **Phase 18 → 15**: Health, hunger, game modes (survival loop)
7. **Phase 9**: Add mobs with basic AI
8. **Phase 10**: Redstone mechanics
9. **Phase 12**: Nether & End dimensions
10. **Phase 13 → 14**: Day/night cycle, weather, world save/load
11. **Phase 16 → 17**: Enchanting, potions, tools
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
23-29. Phase 3 files (world/block*)
30-41. Phase 4 files (world/)
42-47. Phase 5 files (player/)
48-51. Phase 6 files (interaction/)
52-53. Phase 6.5 files (init-sequence, loading-screen)
54-64. Phase 7 files (ui/)
65-73. Phase 9 files (entity/)
74-79. Phase 10 files (redstone/)
80-83. Phase 12 files (world/dimension*)
84-85. Phase 13 files (world/time, render/weather)
86-87. Phase 14 files (storage/)
88-89. Phase 15 files (player/game-mode, player/stats)
90-91. Phase 16 files (game/enchantment, game/potion)
92. Phase 17 file (game/tool)
93-94. Phase 18 files (player/hunger, player/experience)
101-104. Phase 20 files (UI/HTML)
105. `src/game.js` last

### Updating This Plan
The only changes future AIs should make to PLAN.md are:
1. Adding "FULLY OPERATIONAL" after thoroughly auditing a phase
2. Changing `[ ]` to `[FULLY OPERATIONAL]` for each completed phase
3. Adding notes under a phase's status marker if important findings were discovered

No changelogs, no bugfix reports — this is a living plan document, not a change log.

### Technical Risks & Mitigations
- **WebGL 1.0 Batching Limitations**: WebGL 1.0 does not support `gl.drawElementsInstanced`. To batch chunk meshes, you will either have to merge all chunk vertex buffers into one massive buffer (which is extremely slow to update when a single block changes) or issue one draw call per chunk (256 draw calls per frame). 256 draw calls is acceptable for WebGL 1.0, but you must be careful not to attempt instancing.
- **Runtime Texture Atlas Generation**: Phase 3's `texture-atlas.js` implies runtime generation. Compiling 256+ 16x16 textures into a single atlas at runtime will cause a significant hitch on load. Consider pre-generating the atlas as a single image file, or using a Web Worker to generate it asynchronously.
- **Async Chunk Loading**: Phase 14 uses IndexedDB, which is asynchronous. Phase 4's `chunk-manager.js` needs to explicitly handle missing chunks. If a chunk isn't loaded yet, the renderer must either skip it or render a placeholder (e.g., a solid gray cube) to prevent rendering gaps.
- **Audio Preloading**: Phase 1's `audio.js` mentions "pre-loaded AudioBuffer objects". AudioBuffers must be decoded asynchronously. You will need an async initialization phase before the game loop starts to ensure all sounds are ready.