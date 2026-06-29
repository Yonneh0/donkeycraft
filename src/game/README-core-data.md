# Core Data & Rendering Subsystem

Defines block definitions, 3D models, texture atlas generation, and block state variants. This is the foundational data layer that other systems depend on for block information, rendering, and visual representation.

## Table of Contents

- [Overview](#overview)
- [Block Registry](#blockjs)
- [Block Type Classification](#block-typesjs)
- [Block State System](#block-statejs)
- [3D Block Models](#block-modelsjs)
- [Texture Atlas](#texture-atlasjs)
- [Cross-references](#cross-references)

---

## Overview

The Core Data subsystem provides the definitive source of block information for Donkeycraft. It defines all 256+ vanilla blocks, classifies them by type (solid, transparent, liquid), manages block state variants (colors, axis directions), defines 3D baked models with ambient occlusion, and compiles textures into a single WebGL texture atlas for rendering.

**Dependencies:**
- None — this is the foundational layer; all other subsystems depend on it

---

## Files

### [block.js](block.js) — Block Definitions Registry

Defines all 256+ vanilla Minecraft blocks with metadata (hardness, blast resistance, drops, transparency, light emission).

**Key Classes:**
- `Donkeycraft.Block(id, name, hardness, blastResistance, dropBlockId, dropItemCount, transparent, emissive, lightLevel, lightOpacity)` — Individual block definition
- `Donkeycraft.BlockRegistry` — Central registry singleton

**BlockRegistry API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getBlockById(id)` | `Block|null` | Lookup by numeric ID |
| `getBlockByName(name)` | `Block|null` | Lookup by string name |
| `getAllBlocks()` | `Block[]` | All registered blocks |
| `getBlockCount()` | `number` | Total block count |
| `isTransparent(id)` | `boolean` | Is block transparent |
| `isSolid(id)` | `boolean` | Has full collision box |
| `isOpaque(id)` | `boolean` | Fully blocks light (opacity ≥ 15) |
| `isLiquid(id)` | `boolean` | Is water or lava |
| `isReplaceable(id)` | `boolean` | Grass, flowers, replaceable |
| `getDropBlockId(id)` | `number` | Drop block ID (-1 = none) |
| `getDropItemCount(id)` | `number` | Items dropped |

**Notable Blocks:**
| ID | Name | Hardness | Blast Resistance | Special |
|----|------|----------|-----------------|---------|
| 0 | air | — | — | Always first, special case |
| 1000 | bedrock | -1 | 3,600,000 | Unbreakable |
| 212 | water | — | — | Liquid with transparency |
| 213 | lava | — | — | Liquid with light emission |

---

### [block-types.js](block-types.js) — Block Type Classification

Fast boolean lookup tables for block type queries. Pre-computed from BlockRegistry at initialization.

**Key Class:**
- `Donkeycraft.BlockTypes` — Static singleton with lookup functions

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `isSolid(id)` | `boolean` | Has full collision box |
| `isTransparent(id)` | `boolean` | Alpha/see-through |
| `isOpaque(id)` | `boolean` | Fully blocks light |
| `isLiquid(id)` | `boolean` | Water or lava |
| `isReplaceable(id)` | `boolean` | Grass, flowers, plants |
| `isFullBlock(id)` | `boolean` | Occupies entire 16×16×16 block |
| `isCollidable(id)` | `boolean` | Solid or liquid |
| `blocksLight(id)` | `boolean` | Opacity ≥ 15 |
| `getLightOpacity(id)` | `number` | Light opacity value (0-15) |
| `getIdsByType(type)` | `number[]` | All IDs matching type |

**Type Constants:** `"solid"`, `"transparent"`, `"opaque"`, `"liquid"`, `"replaceable"`, `"fullBlock"`

---

### [block-state.js](block-state.js) — Block State System

Manages block variants with property key-value pairs (e.g., oak log axis direction, wool color).

**Key Classes:**
- `Donkeycraft.BlockState(properties)` — Holds property map for a block variant
- `Donkeycraft.BlockStateRegistry` — Maps base block IDs to possible states

**BlockState API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `get(name)` | `value|null` | Property value by name |
| `set(name, value)` | `BlockState` | Set property (chainable) |
| `matches(other)` | `boolean` | All properties equal |
| `getPropertyNames()` | `string[]` | All property names |
| `isEmpty()` | `boolean` | No properties set |
| `clone()` | `BlockState` | Deep copy |

**BlockStateRegistry API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `registerStates(blockId, states)` | `number` | Number of states registered |
| `getPossibleStates(blockId)` | `BlockState[]` | All valid states for block |
| `getStateByString(blockId, stateStr)` | `BlockState|null` | Lookup by string key |
| `getStateString(state)` | `string` | Serialize to "key=value,key2=value2" |
| `hasStates(blockId)` | `boolean` | Block has variants |
| `getDefaultState(blockId)` | `BlockState` | First/default state |
| `findMatchingState(blockId, props)` | `BlockState|null` | Find by property map |

**Property Value Constants:**
| Constant | Values | Used By |
|----------|--------|---------|
| `Donkeycraft.AxisValues` | `{X: 'x', Y: 'y', Z: 'z'}` | Logs, fences |
| `Donkeycraft.FacingValues` | `{NORTH, SOUTH, EAST, WEST, UP, DOWN}` | Torches, levers, pistons |
| `Donkeycraft.ColorValues` | 16 wool/dye color strings | Wool, concrete, glass |
| `Donkeycraft.HalfValues` | `{LOWER: 'lower', UPPER: 'upper'}` | Stairs, beds |
| `Donkeycraft.WaterloggedValues` | `{TRUE: 'true', FALSE: 'false'}` | Waterlogged blocks |

**Registered Variants:**
| Block Type | Property | Count |
|------------|----------|-------|
| Logs (oak, spruce, birch, etc.) | axis | 3 |
| Wool | color | 16 |
| Concrete | color | 16 |
| Stained Glass | color | 16 |
| Redstone wire | power | 16 (0–15) |
| Redstone torch | on/off | 2 |
| Repeater | delay, locked | 4 × 2 |
| Lever | facing, power | 6 × 2 |

---

### [block-models.js](block-models.js) — Baked Block Models

3D model definitions for each block with face textures, ambient occlusion data, and UV coordinates.

**Key Classes:**
- `Donkeycraft.BlockModel(blockId, options)` — Single baked block model
- `Donkeycraft.BlockModelRegistry` — Maps block IDs to models

**BlockModel API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getFaceTexture(faceName)` | `string` | Texture name for face |
| `hasAO()` | `boolean` | Uses ambient occlusion |
| `getAOWeights(faceName)` | `number[]` | 4 AO weight values (0-1) |
| `getFaceCorners(faceName)` | `Object[]` | Corner positions with UVs |

**BlockModelRegistry API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getBlockModel(blockId)` | `BlockModel` | Model for block ID |
| `getDefaultModel(blockId)` | `BlockModel` | Default cube model |
| `getFaceUV(blockId, faceName)` | `Object|null` | UV coords from atlas grid |
| `hasAO(blockId)` | `boolean` | Block uses AO |
| `registerCustomModel(blockId, model)` | `void` | Override model |
| `getAllModels()` | `BlockModel[]` | All registered models |
| `getModelCount()` | `number` | Model count |

**Face Names:** `"up"`, `"down"`, `"north"`, `"south"`, `"east"`, `"west"`

**UV Mapping:** Atlas is 16×16 grid (256 slots). UV = `(col/16, row/16)` where `col = id % 16`, `row = floor(id / 16)`.

---

### [texture-atlas.js](texture-atlas.js) — Texture Atlas

Compiles all block textures into a single WebGL 2D texture for rendering.

**Key Classes:**
- `Donkeycraft.TextureAtlas(gl)` — Atlas manager for WebGL context
- `Donkeycraft.TextureAtlasBuilder` — Helper utility for atlas creation

**TextureAtlas API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `registerBlockTexture(blockId, image)` | `void` | Register HTMLImageElement |
| `registerTexturePath(blockId, path, onReady)` | `void` | Load from file path |
| `generate()` | `boolean` | Build atlas texture (returns success) |
| `getUVs(blockId)` | `Object|null` | Normalized UV coords [0-1] |
| `getPixelUVs(blockId)` | `Object|null` | Pixel-space UV coords |
| `bind()` | `void` | Bind as active texture unit 0 |
| `getTexture()` | `WebGLTexture` | WebGL texture object |
| `isReady()` | `boolean` | Atlas generated |
| `getTextureCount()` | `number` | Registered textures |
| `destroy()` | `void` | Free WebGL resources |

**TextureAtlasBuilder API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `buildFromPaths(gl, basePath, nameMap)` | `TextureAtlas` | Load from file paths |
| `buildProcedural(gl)` | `TextureAtlas` | Generate placeholder colors (testing) |

**Constants:** `TEX_SIZE = 16`, `ATLAS_COLS = 16`, `ATLAS_ROWS = 16`, `ATLAS_SIZE = 256`

**Filtering:** Uses `NEAREST` for both min/mag filter (pixelated Minecraft look).

---

## Cross-references

- See [README-world.md](README-world.md) — Chunk data stores block IDs defined here; biome system uses block types for surface placement
- See [README-physics-env.md](README-physics-env.md) — Lighting engine reads light opacity from block definitions
- See [README-interaction.md](README-interaction.md) — Block placement/breaking uses BlockRegistry for drop information