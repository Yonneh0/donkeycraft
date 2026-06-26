# Donkeycraft

A Minecraft clone built entirely in HTML, CSS, and JavaScript — no servers, no build tools, no ES modules. Runs directly from `file:///` in Chrome.

## Features

- Voxel world with chunk-based rendering
- Terrain generation with biomes, caves, ores
- First-person player movement and collision
- Block breaking and placement
- Inventory system with hotbar
- Crafting system (2×2 and 3×3)
- Mobs: passive and hostile with AI
- Redstone mechanics
- Day/night cycle and weather
- Multiple dimensions (Overworld, Nether, End)
- Save/load worlds to IndexedDB
- Survival and Creative game modes

## Running

Simply open `index.html` in your browser. No server required.

```
file:///path/to/donkeycraft/index.html
```

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D | Move |
| Space | Jump |
| Shift | Sprint / Descend (Creative) |
| Left Click | Break block |
| Right Click | Place block / Interact |
| 1-9 | Select hotbar slot |
| E | Open inventory |
| F3 | Debug screen |
| F | Toggle fly mode (Creative) |

## Project Structure

```
index.html          # Entry point
css/                # Stylesheets
src/
  core/             # Core infrastructure
    namespace.js    # Global Donkeycraft namespace
    eventbus.js     # Pub/sub event system
    config.js       # Game configuration constants
    logger.js       # Tiered logging system
    timer.js        # Game loop with delta time
    input.js        # Keyboard/mouse/pointer lock
    math-utils.js   # Vector3, Matrix4, Quaternion
    audio.js        # Web Audio API wrapper
  render/           # WebGL rendering engine
    gl-context.js       # WebGL 1 context wrapper
    shader-manager.js   # Shader compilation and program management
    shaders/
      vertex-shaders.glsl    # Vertex shader sources
      fragment-shaders.glsl  # Fragment shader sources
    geometry-builder.js  # Vertex data generation
    mesh-optimizer.js    # Face culling and index generation
    chunk-mesh.js        # Per-chunk GPU buffers
    terrain-renderer.js  # Chunk rendering with frustum culling
    camera.js            # First-person camera
    fog.js               # Distance fog
    sky.js               # Sky dome rendering
    lighting.js          # Sun/ambient light, time cycle
    hand-renderer.js     # First-person held item
    break-particles.js   # Block breaking particles
    gui-renderer.js      # HUD overlay (crosshair, hotbar)
  world/            # Blocks, chunks, terrain generation
    block.js             # Block definitions (257 blocks)
    block-state.js       # Block state system with variants
    block-types.js       # Block classification (solid, liquid, etc.)
    texture-atlas.js     # 16×16 texture atlas
    block-models.js      # Face/texture models with AO
    recipe-registry.js   # Crafting and smelt recipes
    chunk.js             # 16×256×16 chunk volume
    chunk-manager.js     # Chunk loading/unloading
    biome.js             # Biome classification
    terrain-generator.js # Heightmap generation
    ore-generator.js     # Ore vein placement
    cave-generator.js    # Cave tunnel systems
    structure-generator.js # Surface structures
    water-generator.js   # Water filling
    terrain-surface.js   # Biome surface layers
    lighting-engine.js   # Block light propagation
    physics.js           # Gravity-affected blocks
  player/           # Player entity, movement, collision
  interaction/      # Mining, placing, raycasting
  ui/               # Inventory, HUD, GUI screens
  crafting/         # Crafting logic and recipes
  entity/           # Mobs and entities
  redstone/         # Redstone system
  game/             # Enchantments, potions, tools
  storage/          # World save/load
  game.js           # Main game class
  loader.js         # Script loader
assets/
  textures/         # Block, item, entity sprites
  sounds/           # Sound effects and music
PLAN.md             # Development plan with phase tracking
```

## Development

See [PLAN.md](PLAN.md) for the full development plan with phase-by-phase breakdown.

## License

MIT