# Donkeycraft

A Minecraft-like voxel game built entirely in HTML, CSS, and JavaScript — no servers, no build tools, no external dependencies. Runs directly from `file:///` in Chrome.

## Overview

Donkeycraft is a fully functional voxel sandbox game featuring procedurally generated worlds with multiple biomes, terrain types, and dimensions. It implements a custom WebGL 1.0 rendering pipeline, a complete redstone logic system, mob AI with pathfinding, and persistent world storage — all running in pure JavaScript using the IIFE pattern with no build tools or bundlers.

The game supports Survival mode (with health, hunger, XP, and crafting), Creative mode (unlimited resources, flying), and Spectator mode (pass-through movement). The world spans three dimensions: the Overworld, the Nether, and the End, each with unique terrain generation, biomes, and structures.

## Features

### World
- **Procedural terrain generation** — Perlin noise-based heightmaps with biome-specific variation, shore/beach/cliff transitions
- **15+ biome types** — Plains, forests, deserts, oceans, taiga, swamps, extreme hills, and more
- **Cave systems** — 3D noise-based cave generation with lava caves and mushroom caves
- **Ore distribution** — Realistic Y-level ranges for stone, coal, iron, gold, diamond, redstone, lapis, and emerald
- **Structures** — Trees per biome, cacti in deserts, underground ore veins, surface structures
- **Surface layers** — Biome-appropriate top blocks (grass, sand, snow, stone)
- **Water systems** — Lake detection, surface water flow, still vs flowing water
- **Three dimensions** — Overworld (standard), Nether (bedrock, lava seas, netherrack, basalt columns), End (island platforms, end cities, chorus plants)
- **Portals** — Obsidian frame detection and inter-dimensional travel
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
- **HUD overlay** — Crosshair, hotbar, health/hunger bars
- **Debug screen (F3)** — FPS, chunk info, biome, coordinates, light levels

### Player & Movement
- **WASD movement** — Walking, sprinting, swimming with game-mode-specific speed modifiers
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
- **Furnace** — Smelting with fuel management and progress tracking
- **Chest** — Single (27 slots) and double (54 slots) chests
- **Anvil** — Rename items, combine/repair with durability averaging, enchantment merging
- **Enchanting** — 3 random enchantment options from 24 vanilla enchantments with level cost validation
- **Potions** — 18 effects, 40 potions, brewing recipe system with awkward base potion
- **Hunger & starvation** — Food consumption, saturation mechanics, auto-regeneration, starvation damage
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

## Project Structure

```
index.html          # Entry point — loads all scripts and UI elements
css/
  style.css         # Base styles: full-screen canvas, overlay positioning
  gui.css           # GUI styles: panels, tabs, slots, buttons
src/
  core/             # Core infrastructure
    namespace.js        # Global Donkeycraft namespace object
    eventbus.js         # Pub/sub event system
    config.js           # Game configuration constants
    logger.js           # Tiered logging (debug/info/warn/error)
    timer.js            # Delta-time accumulator, tick scheduler
    input.js            # Keyboard/mouse/pointer lock handler
    math-utils.js       # Vector3, Matrix4, Quaternion, noise functions
    audio.js            # Web Audio API wrapper
    init-sequence.js    # Async initialization pipeline
    asset-generator.js  # Procedural textures & sounds
  render/           # WebGL rendering engine
    gl-context.js           # WebGL 1 context creation
    shader-manager.js       # Shader compilation and caching
    shaders/
      vertex-shaders.glsl       # Vertex shader sources
      fragment-shaders.glsl     # Fragment shader sources
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
  game/            # Blocks, chunks, terrain generation
    block.js              # Block definitions (257 blocks)
    block-state.js        # Block state variants
    block-types.js        # Block classification
    texture-atlas.js      # 16×16 texture atlas
    block-models.js       # Face/texture models with AO
    recipe-registry.js    # Crafting and smelt recipes
    chunk.js              # 16×256×16 chunk volume
    chunk-manager.js      # Chunk loading/unloading
    biome.js              # Biome classification
    terrain-generator.js  # Heightmap generation
    ore-generator.js      # Ore vein placement
    cave-generator.js     # Cave tunnel systems
    structure-generator.js# Surface structures
    water-generator.js    # Water filling
    terrain-surface.js    # Biome surface layers
    lighting-engine.js    # Block light propagation
    physics.js            # Gravity-affected blocks
    world-utils.js        # Coordinate utilities
    dimension.js          # Overworld/Nether/End
    portal.js             # Inter-dimensional portals
    nether-generator.js   # Nether terrain
    end-generator.js      # End terrain
    time.js               # World time cycle
  game/           # Player entity, movement, collision, stats
    player.js             # Player entity (position, velocity, rotation)
    movement.js           # Walking, sprinting, swimming, flying speeds
    collision.js          # AABB collision detection
    jumping.js            # Jump mechanics
    flying.js             # Creative/spectator flying
    damage.js           # Hitbox, damage, knockback, fall damage
    game-mode.js          # Survival/Creative/Spectator modes
    stats.js              # Achievements and statistics
    hunger.js             # Food, saturation, starvation
    experience.js         # XP levels and orbs
  game/      # Mining, placing, raycasting
    raycast.js            # DDA voxel raycasting
    block-action.js       # Block breaking with tool multipliers
    block-placement.js    # Block placement with collision checks
    interactable-blocks.js# Right-click interactions (doors, chests, etc.)
  ui/               # Inventory, HUD, GUI screens
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
    gui-elements.js         # DOM UI components
    loading-screen.js       # Loading screen UI
  game/           # Mobs and entities
    entity.js               # Base entity class
    entity-manager.js       # Spawn/despawn/tick management
    passive-mobs.js         # Cow, pig, sheep, chicken
    hostile-mobs.js         # Zombie, skeleton, spider, creeper
    boss-mobs.js            # Ender Dragon, Wither
    mob-ai.js               # A* pathfinding, line-of-sight
    projectiles.js          # Arrows, snowballs, ender pearls
    animals.js              # Animal breeding logic
    mob-spawning.js         # Spawn definitions and caps
  game/         # Redstone logic system
    redstone-engine.js      # Tick-based signal propagation
    repeater-comparator.js  # Repeaters (1-4 ticks) and comparators
    observers.js            # Observer blocks
    tnt.js                  # TNT explosions
    pistons.js              # Pistons and sticky pistons
    wiring.js               # Redstone dust/wire
  game/             # Enchantments, potions, tools
    enchantment.js          # 24 vanilla enchantments
    potion.js               # 18 effects, 40 potions
    tool.js                 # 7 material tiers
  core/          # World save/load
    world-store.js          # IndexedDB chunk storage
    level-data.js           # Spawn, mode, time, player data
game.js             # Main game class: loop, init, pause/resume

assets/
  sounds/           # (Generated procedurally — no files needed)
  textures/         # (Generated procedurally — no files needed)
PLAN.md             # Development plan with file inventory and dependency order
README.md           # This file
```

## Development

See [PLAN.md](PLAN.md) for the complete file inventory with line counts, module organization, and dependency order.

See [AGENTS.md](AGENTS.md) for AI agent workflow rules and coding standards.

## License

MIT