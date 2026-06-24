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
  render/           # WebGL rendering engine
  world/            # Blocks, chunks, terrain generation
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