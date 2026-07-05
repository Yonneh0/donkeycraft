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
- **Entity renderer** — Bone-based skeletal animation with per-mesh draw calls, pivot-point rotation centers, mesh caching (VBO/IBO), frustum culling (AABB vs 6-plane test + forward-facing cone check), depth-sorted batch rendering, and WebGL context loss handling with automatic mesh rebuild (src/render/entity-renderer.js)
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
src/                   # Source.
  core.css           # Base styles: full-screen canvas, overlay positioning
  game.js             # Main game class: loop, init, pause/resume
  core/                 # Core infrastructure
    audio.js              # Web Audio API wrapper
    cache.js              # Asset cache (texture atlases, sounds)
    config.js             # Game configuration constants
    eventbus.js           # Pub/sub event system
    init-sequence.js      # Async initialization pipeline
    input.js              # Keyboard/mouse/pointer lock handler
    level-data.js         # Spawn, mode, time, player data, auto-save
    logger.js             # Tiered logging (debug/info/warn/error)
    math-utils.js         # Vector3, Matrix4, Quaternion, noise functions
    namespace.js          # Global Donkeycraft namespace object
    timer.js              # Delta-time accumulator, tick scheduler
    world-store.js        # IndexedDB chunk storage
  gen/                  # Procedural generation
    cave-generator.js     # 3D noise-based cave systems
    end-generator.js      # End terrain: island classification, end cities
    mob-spawning.js       # Spawn definitions, chunk/light/biome checks, mob caps
    nether-generator.js   # Nether terrain: bedrock, lava, basalt columns
    noise.js              # Permutation table, fade, lerp, grad, 2D Perlin, FBM, Mulberry32
    ore-generator.js      # Ore vein placement per biome/Y-level
    sound-manager.js      # SoundGenerator, AssetManager, AssetGenerator
    structure-generator.js# Surface structures
    terrain-generator.js  # Heightmap generation with Perlin noise layers
    texture-blocks.js     # Block textures: ores, metals, concrete/wool families
    texture-core.js       # TextureGenerator core: canvas, cache, base generators
    texture-decorative.js # Plants, redstone components, furniture, block mapping
    texture-special.js    # Nether/end textures: basalt, ancient debris, magma
    texture-terrain.js    # Terrain textures: sand, snow, ice, lava, bedrock
    water-generator.js    # Lake detection, surface water flow
  game/                 # Game logic
    animals.js            # Animal breeding logic
    biome.js              # Biome classification
    block-action.js       # Block breaking with tool multipliers
    block-models.js       # Face/texture models with AO
    block-placement.js    # Block placement with collision checks
    block-state.js        # Block state variants (direction, color)
    block-types.js        # Block classification (solid, transparent, liquid)
    block.js              # Block definitions (257 blocks)
    boss-mobs.js          # Ender Dragon, Wither
    chunk-manager.js      # Chunk loading/unloading
    chunk.js              # 16×256×16 chunk volume
    collision.js          # AABB collision detection
    damage.js             # Hitbox, damage, knockback, fall damage, stamina management
    dimension.js          # Overworld/Nether/End dimension system
    enchantment.js        # 24 vanilla enchantments
    entity-manager.js     # Spawn/despawn/tick management
    entity.js             # Base entity class
    experience.js         # XP levels and orbs
    flying.js             # Creative/spectator flying
    game-mode.js          # Survival/Creative/Spectator modes
    hostile-mobs.js       # Zombie, skeleton, spider, creeper
    hunger.js             # Food, hydration, starvation
    interactable-blocks.js# Right-click interactions (doors, chests, etc.)
    jumping.js            # Jump mechanics
    lighting-engine.js    # Block light propagation (BFS flood fill)
    mob-ai.js             # A* pathfinding, line-of-sight
    movement.js           # Walking, sprinting, swimming, flying speeds
    observers.js          # Observer blocks
    passive-mobs.js       # Cow, pig, sheep, chicken
    physics.js            # Gravity-affected blocks, liquid flow
    pistons.js            # Pistons and sticky pistons
    player.js             # Player entity (position, velocity, rotation)
    portal.js             # Inter-dimensional portals
    potion.js             # 18 effects, 40 potions
    projectiles.js        # Arrows, snowballs, ender pearls
    raycast.js            # DDA voxel raycasting
    recipe-registry.js    # Crafting and smelt recipes
    redstone-engine.js    # Tick-based signal propagation
    repeater-comparator.js# Repeaters (1-4 ticks) and comparators
    stats.js              # Achievements and statistics
    terrain-surface.js    # Biome surface layers
    texture-atlas.js      # 16×16 texture atlas compilation
    time.js               # World time cycle
    tnt.js                # TNT explosions
    tool.js               # 7 material tiers
    wiring.js             # Redstone dust/wire
    world-utils.js        # Coordinate utilities
  render/               # WebGL rendering engine
    break-particles.js    # Block breaking particles
    camera.js             # First-person camera
    chunk-mesh.js         # Per-chunk GPU buffer management
    entity-renderer.js    # Bone-based skeletal animation, mesh caching, frustum culling, context loss recovery
    fog.js                # Distance fog
    geometry-builder.js   # Vertex buffer generation
    gl-context.js         # WebGL 1 context creation
    gui-renderer.js       # HUD overlay (crosshair, hotbar)
    hand-renderer.js      # First-person held item
    lighting.js           # Sun/ambient light
    map-renderer.js       # 2D overhead map, rotating minimap, time-of-day dial, surface cache
    mesh-optimizer.js     # Face culling and index buffers
    shader-manager.js     # Shader compilation and caching
    sky.js                # Sky dome rendering
    terrain-renderer.js   # Chunk rendering with frustum culling
    weather.js            # Weather particle effects
  ui/                   # Inventory, HUD, GUI screens
    anvil-ui.js             # Anvil UI (rename/repair)
    anvil-ui.css            # Anvil UI Styles
    chest-ui.js             # Chest GUI
    crafting-grid.js        # 3×3 crafting table
    creative-inventory.js   # Creative item browser
    debug-overlay.js        # F3 debug screen
    enchanting-ui.js        # Enchanting GUI
    furnace-ui.js           # Furnace GUI
    gamemode-badge.js       # Game mode badge (SURVIVAL/CREATIVE) with click-to-swap
    gui-core.css            # GUI styles: panels, tabs, slots, buttons
    gui-elements.js         # DOM UI components (drag-drop, tabs, buttons)
    gui-manager.js          # Screen open/close system
    health-bar.js           # Health HUD overlay
    hotbar.js               # Hotbar UI (9 slots)
    hotbar.js               # Hotbar UI with integrated stamina bar (yellow progress, semi-transparent, animated)
    hunger-bar.js           # Hunger HUD overlay
    inventory.js            # Multi-slot inventories
    item-stack.js           # Item stacks with NBT-like tags
    keybindings-panel.js    # Keybind configuration UI
    loading-screen.js       # Loading screen UI
    speed-indicator.js      # Speed indicator/control (sneak/walk/run/turbo buttons)
    xp-bar.js               # XP level bar
    

README.md           # This file
```

## License

MIT