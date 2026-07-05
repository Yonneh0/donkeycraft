# Donkeycraft

A Minecraft-like voxel game built entirely in HTML, CSS, and JavaScript — no servers, no build tools, no external dependencies. Runs directly from `file:///` in Chrome.

## Overview

Donkeycraft is a fully functional voxel sandbox game featuring procedurally generated worlds with multiple biomes, terrain types, and dimensions. It implements a custom WebGL 1.0 rendering pipeline, a complete redstone logic system, mob AI with pathfinding, and persistent world storage — all running in pure JavaScript using the IIFE pattern with no build tools or bundlers.

The game supports Survival mode (with health, hunger, XP, and crafting), Creative mode (unlimited resources, flying), and Spectator mode (pass-through movement). The world spans three dimensions: the Overworld, the Nether, and the End, each with unique terrain generation, biomes, and structures.

## Features

### World
- **Procedural terrain generation** — Perlin noise-based heightmaps with biome-specific variation, shore/beach/cliff transitions
- **15+ biome types** — Plains, forests, deserts, oceans, taiga, swamps, extreme hills, and more
- **Cave systems** — 3D noise-based cave generation with lava caves and mushroom caves (gen/cave-generator.js)
- **Ore distribution** — Realistic Y-level ranges for stone, coal, iron, gold, diamond, redstone, lapis, and emerald
- **Structures** — Trees per biome, cacti in deserts, underground ore veins, surface structures
- **Surface layers** — Biome-appropriate top blocks (grass, sand, snow, stone)
- **Water systems** — Lake detection, surface water flow, still vs flowing water
- **Three dimensions** — Overworld (standard), Nether (bedrock, lava seas, netherrack, basalt columns), End (island platforms, end cities, chorus plants)
- **Portals** — Obsidian frame detection and inter-dimensional travel (gen/portal.js — 666 lines)
- **Day/night cycle** — 24000-tick day with moon phases, sky gradients, sun/moon/stars
- **Weather** — Rain, thunder, and snow with biome restrictions and particle effects
- **Persistent worlds** — IndexedDB save/load with chunk dirty batching

### Rendering
- **Custom WebGL 1.0 pipeline** — No Three.js, no external libraries
- **Chunk-based rendering** — 16×256×16 chunks with frustum culling
- **Mesh optimization** — Face culling removes hidden faces between solid blocks
- **Procedural assets** — 285+ block textures and 13 sound categories generated via Simplex noise and Web Audio API
- **Lighting** — Directional sunlight, ambient light, block light propagation with BFS flood fill
- **Distance fog** — Biome-aware fog density and sky color
- **Sky rendering** — Day/night gradient with sun, moon, stars, and cloud layer
- **First-person hand** — Held item rendered in bottom-right corner
- **Block breaking particles** — Animated sprites with fade-out
- **HUD overlay** — Crosshair, hotbar, health/hunger bars, XP bar, stamina bar
- **Game mode badge** — Top-right corner indicator (SURVIVAL/CREATIVE) with click-to-swap between modes
- **Speed indicator** — Top-right button bar showing 🐌 sneak, 🚶 walk, 🏃 run states; ⚡ turbo in creative; click-to-lock crouch/run modes
- **Debug screen (F3)** — FPS, chunk info, biome, coordinates, light levels
- **Minimap** — Rotating 2D top-down view showing terrain tiles around the player, green directional triangle, compass ring (N/E/S/W fixed markers), and circular border; uses per-block surface cache for accurate terrain colors
- **Time-of-day dial** — Small circular dial showing partial arc ring (sunrise → day → sunset), animated sun/moon pointer, star dots at night, hour tick marks, and digital clock; creative mode click opens time slider with freeze/unfreeze controls
- **2D map view** — Full-screen panning/zooming map (press M) with chunk grid lines, block borders at close zoom, 64-block orientation grid, player dot with red direction arrow, dimension label, zoom level, and chunk count overlay; mousewheel zooms toward cursor, left-click drag pans

### Player & Movement
- **WASD movement** — Walking, sprinting, swimming with game-mode-specific speed modifiers
- **Stamina system** — 10-point yellow health bar (5 hearts) that absorbs damage before health; depleted by physical attacks, fall damage, and fire; restored via hunger-based auto-regeneration when food > 18
- **First-person camera** — Pointer lock mouse look with pitch clamping
- **Collision detection** — AABB axis-separated collision resolution with wall sliding
- **Jump mechanics** — Ground detection, cooldown timer, water swimming
- **Creative flying** — Toggle fly mode, up/down control, shift to sprint (2× speed)
- **Spectator mode** — Pass through blocks, no interaction

### Gameplay
- **Block interactions** — Raycast-based mining and placement with reach distance (1–12 blocks)
- **Tool system** — 7 material tiers (None through Netherite) with speed multipliers and correct-for-drop detection
- **Inventory system** — Multi-slot inventories with drag-and-drop and shift-click distribution
- **Crafting** — 2×2 furnace crafting, 3×3 crafting table with 57 shaped + 28 shapeless recipes
- **Furnace** — Smelting with fuel management and progress tracking (furnace-ui.js: 782 lines)
- **Chest** — Single (27 slots) and double (54 slots) chests
- **Anvil** — Rename items, combine/repair with durability averaging, enchantment merging
- **Enchanting** — 3 random enchantment options from 24 vanilla enchantments with level cost validation
- **Potions** — 18 effects, 40 potions, brewing recipe system with awkward base potion
- **Hunger & starvation** — Food consumption, hydration mechanics, auto-regeneration, starvation damage
- **Experience** — XP levels, orb pickup, spending on enchanting/anvil

### Entities & Mobs
- **Passive mobs** — Cow, pig, sheep, chicken with wandering, fleeing, and item drops
- **Hostile mobs** — Zombie, skeleton, spider, creeper (proximity ignition/explosion), enderman
- **Boss mobs** — Ender Dragon and Wither with phase-based behavior (fly/land/breath/attack/death)
- **Mob AI** — A* pathfinding on block grid, line-of-sight raycasting, chase/flee logic
- **Projectiles** — Arrows, snowballs, ender pearls, dragon breath with gravity and impact behavior
- **Animal breeding** — Food-based breeding with love mode, cooldowns, and baby speed multiplier
- **Mob spawning** — Chunk/light/biome checks with per-type and global mob caps

### Redstone
- **Redstone wiring** — Signal strength (0–15), branching, underground routing, torch states
- **Repeaters** — Configurable delay (1–4 ticks) with signal boosting
- **Comparators** — Block compare mode and difference mode with facing directions
- **Observers** — Detect block changes on front face, emit pulse on back face
- **Pistons** — Push up to 12 blocks, sticky pistons for pulling, crush detection
- **TNT** — 40-tick fuse (2 seconds), explosion radius 8, chain explosions

### Technical
- **No ES Modules** — IIFE pattern with global `Donkeycraft` namespace
- **No build tools** — Raw JS loaded via `<script>` tags
- **No server required** — Runs from `file:///` protocol
- **WebGL 1.0 only** — Compatible with older hardware and browsers
- **Event-driven architecture** — EventBus for decoupled inter-system communication
- **Delta-time game loop** — Consistent physics regardless of frame rate

## Running

Open `index.html` in Chrome (recommended) or any modern browser:

```
file:///path/to/donkeycraft/index.html
```

No server, no installation, no dependencies.

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D | Move (forward/left/back/right) |
| Space | Jump / Swim upward |
| Shift | Sprint (Survival) / Descend (Creative) |
| Left Click | Break block |
| Right Click | Place block / Interact |
| 1-9 | Select hotbar slot |
| E | Open creative inventory |
| F3 | Debug screen |
| F | Toggle fly mode (Creative) |
| M | Toggle full-screen 2D map view (pan with drag, zoom with scroll) |
| Click game mode badge | Swap between Survival and Creative modes |

## Project Structure

```
index.html          # Entry point — loads all scripts and UI elements
src/
  core/             # Core infrastructure (12 files, ~3,670 lines)
    namespace.js        # Global Donkeycraft namespace object
    eventbus.js         # Pub/sub event system
    config.js           # Game configuration constants
    logger.js           # Tiered logging (debug/info/warn/error)
    timer.js            # Delta-time accumulator, tick scheduler
    input.js            # Keyboard/mouse/pointer lock handler
    math-utils.js       # Vector3, Matrix4, Quaternion, noise functions
    audio.js            # Web Audio API wrapper
    init-sequence.js    # Async initialization pipeline
    world-store.js      # IndexedDB chunk storage
    level-data.js       # Spawn, mode, time, player data, auto-save
    cache.js            # Asset cache (texture atlases, sounds)
  gen/              # Procedural generation (15 files, ~6,843 lines)
    noise.js              # Permutation table, fade, lerp, grad, 2D Perlin, FBM, Mulberry32
    terrain-generator.js  # Heightmap generation with Perlin noise layers
    ore-generator.js      # Ore vein placement per biome/Y-level
    cave-generator.js     # 3D noise-based cave systems
    water-generator.js    # Lake detection, surface water flow
    structure-generator.js# Surface structures
    nether-generator.js   # Nether terrain: bedrock, lava, basalt columns
    end-generator.js      # End terrain: island classification, end cities
    mob-spawning.js       # Spawn definitions, chunk/light/biome checks, mob caps
    texture-core.js       # TextureGenerator core: canvas, cache, base generators
    texture-terrain.js    # Terrain textures: sand, snow, ice, lava, bedrock
    texture-blocks.js     # Block textures: ores, metals, concrete/wool families
    texture-special.js    # Nether/end textures: basalt, ancient debris, magma
    texture-decorative.js # Plants, redstone components, furniture, block mapping
    sound-manager.js      # SoundGenerator, AssetManager, AssetGenerator
  game/             # Game logic (47 files, ~16,812 lines)
    # Blocks & terrain
    block.js              # Block definitions (257 blocks)
    block-state.js        # Block state variants (direction, color)
    block-types.js        # Block classification (solid, transparent, liquid)
    texture-atlas.js      # 16×16 texture atlas compilation
    block-models.js       # Face/texture models with AO
    recipe-registry.js    # Crafting and smelt recipes (722 lines)
    chunk.js              # 16×256×16 chunk volume
    chunk-manager.js      # Chunk loading/unloading
    biome.js              # Biome classification
    terrain-surface.js    # Biome surface layers
    lighting-engine.js    # Block light propagation (BFS flood fill)
    physics.js            # Gravity-affected blocks, liquid flow
    world-utils.js        # Coordinate utilities
    dimension.js          # Overworld/Nether/End dimension system
    portal.js             # Inter-dimensional portals
    time.js               # World time cycle
    # Player & movement
    player.js             # Player entity (position, velocity, rotation)
    movement.js           # Walking, sprinting, swimming, flying speeds
    collision.js          # AABB collision detection
    jumping.js            # Jump mechanics
    flying.js             # Creative/spectator flying
    damage.js             # Hitbox, damage, knockback, fall damage, stamina management
    game-mode.js          # Survival/Creative/Spectator modes
    stats.js              # Achievements and statistics
    hunger.js             # Food, hydration, starvation
    experience.js         # XP levels and orbs
    # Interaction
    raycast.js            # DDA voxel raycasting
    block-action.js       # Block breaking with tool multipliers
    block-placement.js    # Block placement with collision checks
    interactable-blocks.js# Right-click interactions (doors, chests, etc.)
    # Entities & mobs
    entity.js               # Base entity class
    entity-manager.js       # Spawn/despawn/tick management
    passive-mobs.js         # Cow, pig, sheep, chicken
    hostile-mobs.js         # Zombie, skeleton, spider, creeper
    boss-mobs.js            # Ender Dragon, Wither
    mob-ai.js               # A* pathfinding, line-of-sight
    projectiles.js          # Arrows, snowballs, ender pearls
    animals.js              # Animal breeding logic
    # Redstone
    redstone-engine.js      # Tick-based signal propagation
    repeater-comparator.js  # Repeaters (1-4 ticks) and comparators
    observers.js            # Observer blocks
    pistons.js              # Pistons and sticky pistons
    tnt.js                  # TNT explosions
    wiring.js               # Redstone dust/wire
    # Game systems
    enchantment.js          # 24 vanilla enchantments
    potion.js               # 18 effects, 40 potions
    tool.js                 # 7 material tiers
  render/           # WebGL rendering engine (16 files, ~3,940 lines)
    gl-context.js           # WebGL 1 context creation
    shader-manager.js       # Shader compilation and caching
    geometry-builder.js   # Vertex buffer generation
    mesh-optimizer.js     # Face culling and index buffers
    chunk-mesh.js         # Per-chunk GPU buffer management
    terrain-renderer.js   # Chunk rendering with frustum culling
    camera.js             # First-person camera
    fog.js                # Distance fog
    sky.js                # Sky dome rendering
    lighting.js           # Sun/ambient light
    hand-renderer.js      # First-person held item
    break-particles.js    # Block breaking particles
    gui-renderer.js       # HUD overlay (crosshair, hotbar)
    weather.js            # Weather particle effects
    map-renderer.js       # 2D overhead map, rotating minimap, time-of-day dial, surface cache
  ui/                 # Inventory, HUD, GUI screens (19 files, ~7,800 lines)
    gui-core.css            # GUI styles: panels, tabs, slots, buttons
    item-stack.js           # Item stacks with NBT-like tags
    inventory.js            # Multi-slot inventories
    gui-manager.js          # Screen open/close system
    hotbar.js               # Hotbar UI (9 slots)
    crafting-grid.js        # 3×3 crafting table
    creative-inventory.js   # Creative item browser
    furnace-ui.js           # Furnace GUI
    chest-ui.js             # Chest GUI
    anvil-ui.js             # Anvil rename/repair
    enchanting-ui.js        # Enchanting GUI
    debug-overlay.js        # F3 debug screen
    gui-elements.js         # DOM UI components (drag-drop, tabs, buttons)
    loading-screen.js       # Loading screen UI
    health-bar.js           # Health HUD overlay
    hunger-bar.js           # Hunger HUD overlay
    xp-bar.js               # XP level bar
    hotbar.js               # Hotbar UI with integrated stamina bar (yellow progress, semi-transparent, animated)
    keybindings-panel.js    # Keybind configuration UI
    gamemode-badge.js       # Game mode badge (SURVIVAL/CREATIVE) with click-to-swap
    speed-indicator.js      # Speed indicator/control (sneak/walk/run/turbo buttons)
    
core.css           # Base styles: full-screen canvas, overlay positioning
game.js             # Main game class: loop, init, pause/resume (1,639 lines)

assets/
  sounds/           # (Generated procedurally — no files needed)
  textures/         # (Generated procedurally — no files needed)
README.md           # This file
```

## Code Statistics

| Module Group | Files | Lines |
|--------------|-------|-------|
| Core Infrastructure | 12 | ~3,670 |
| Asset & World Generation | 15 | ~6,843 |
| Game Logic | 47 | ~16,812 |
| WebGL Rendering Engine | 16 | ~3,940 |
| Inventory & GUI System | 19 | ~7,800 |
| Main Entry Point | 1 | 1,639 |
| **TOTAL** | **108 files** | **~40,140 lines of JS** |

## Technical Risks & Mitigations

### WebGL 1.0 Batching Limitations
WebGL 1.0 does not support `gl.drawElementsInstanced`. To batch chunk meshes, you must either merge all chunk vertex buffers into one massive buffer (extremely slow to update when a single block changes) or issue one draw call per chunk (256 draw calls per frame). 256 draw calls is acceptable for WebGL 1.0 but requires careful state management.

### Runtime Texture Atlas Generation
Compiling 285+ 16x16 textures into a single atlas at runtime will cause a significant hitch on load. The init-sequence module handles this with an async pipeline that generates textures procedurally during startup. Consider pre-generating the atlas as a single image file for production builds.

### Async Chunk Loading
IndexedDB is asynchronous. The chunk manager needs to handle missing chunks gracefully. If a chunk isn't loaded yet, the renderer must skip it or render a placeholder to prevent rendering gaps.

### Audio Preloading
AudioBuffers must be decoded asynchronously. The init-sequence module handles this with an async pipeline that ensures all sounds are ready before the game loop starts.

### Pointer Lock
`requestPointerLock()` must be called on an element that has focus and is in the foreground. Check `document.pointerLockElement` to verify lock state. Mouse delta (`movementX`/`movementY`) is only available when pointer lock is active.

### File Protocol Limitations
The `file:///` protocol may block XHR/Fetch for external assets. All textures are procedurally generated and all sounds use Web Audio API with programmatically generated buffers — no external file loading required at runtime.

## Development

See [.clinerules/QWEN.md](.clinerules/QWEN.md) for AI agent workflow rules and coding standards.

## License

MIT