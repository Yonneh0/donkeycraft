# World & Chunk Management Subsystem

Manages world data storage, chunk loading/unloading, dimension handling, biome definitions, terrain surface layers, and coordinate utilities. This subsystem provides the spatial infrastructure that all other game systems depend on.

## Table of Contents

- [Overview](#overview)
- [Chunk Data Structure](#chunkjs)
- [Chunk Loading/Unloading](#chunk-managerjs)
- [Dimension System](#dimensionjs)
- [World Utilities](#world-utilsjs)
- [Biomes](#biomes)
  - [Biome Definitions](#biomejs)
- [Terrain Surface](#terrain-surface)
  - [Surface Layer Application](#terrain-surfacejs)
- [Cross-references](#cross-references)

---

## Overview

The World subsystem provides the spatial foundation for Donkeycraft's game world. It manages chunk-based world storage with dimension isolation (Overworld, Nether, End), biome classification for terrain generation, and coordinate utilities shared across all systems.

**Dependencies:**
- `block.js` — Block definitions for block ID lookups
- `biome.js` — Biome definitions used by terrain generation
- `physics.js` — Liquid flow and gravity block processing per chunk
- `lighting-engine.js` — Sky/block light calculation per chunk

---

## Files

### [chunk.js](chunk.js) — Chunk Data Structure

Stores block data, sky light, and block light for a 16×WORLD_HEIGHT×16 region using typed arrays.

**Key Class:**
- `Donkeycraft.Chunk(chunkX, chunkZ)` — Single chunk container

**Chunk API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getBlock(x, y, z)` | `number` | Block ID at local coords (0 = air) |
| `setBlock(x, y, z, blockId)` | `void` | Set block ID (marks dirty if changed) |
| `getSkyLight(x, y, z)` | `number` | Sky light value (0-15) |
| `setSkyLight(x, y, z, light)` | `void` | Set sky light value |
| `getBlockLight(x, y, z)` | `number` | Block light value (0-15) |
| `setBlockLight(x, y, z, light)` | `void` | Set block light value |
| `globalX()` | `number` | Global X = chunkX × CHUNK_SIZE |
| `globalZ()` | `number` | Global Z = chunkZ × CHUNK_SIZE |
| `globalToLocal(gx, gz)` | `{lx, lz}` | Convert global to local coords |
| `isDirty()` | `boolean` | Needs mesh regeneration |
| `markClean()` | `void` | Changes applied |
| `markDirty()` | `void` | Signal mesh needs update |
| `clearLight()` | `void` | Zero all light data |
| `fill(blockId)` | `void` | Fill entire chunk with block |
| `getBlockData()` | `Uint16Array` | Raw block data for WebGL upload |
| `getBlockEntity(x, y, z)` | `Object|null` | Block entity data |
| `setBlockEntity(x, y, z, entity)` | `void` | Store block entity |
| `removeBlockEntity(x, y, z)` | `boolean` | Remove block entity |
| `getAllBlockEntities()` | `Object[]` | All {x, y, z, entity} objects |
| `clearBlockEntities()` | `void` | Remove all block entities |
| `serializeBlockEntities()` | `Array` | For persistence |
| `deserializeBlockEntities(entities)` | `void` | Restore from serialized data |
| `destroy()` | `void` | Free internal arrays |

**Properties:**
- `chunkX`, `chunkZ` — Chunk coordinates
- `blocks` — Uint16Array (supports IDs > 255)
- `skyLight`, `blockLight` — Uint8Array (0-15 per block)
- `generated` — boolean, terrain placed
- `biomeId` — biome ID for this chunk

---

### [chunk-manager.js](chunk-manager.js) — Chunk Loading/Unloading

Manages which chunks are loaded within render distance. Handles dirty tracking and terrain generation delegation.

**Key Class:**
- `Donkeycraft.ChunkManager(options)` — Chunk manager with render distance

**Constructor Options:**
```js
{
  renderDistance: 8,           // Radius in chunks
  useStructureGenerator: false, // Delegate to StructureGenerator
  terrainEnabled: true         // Generate terrain for new chunks
}
```

**ChunkManager API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getChunk(chunkX, chunkZ)` | `Chunk` | Get or create chunk |
| `hasChunk(chunkX, chunkZ)` | `boolean` | Chunk exists |
| `getChunkIfExists(chunkX, chunkZ)` | `Chunk|null` | Non-creating lookup |
| `unloadChunk(chunkX, chunkZ)` | `boolean` | Remove chunk (returns true if removed) |
| `getAllChunks()` | `Chunk[]` | All loaded chunks |
| `getChunkCount()` | `number` | Loaded chunk count |
| `markChunkDirty(chunkX, chunkZ)` | `void` | Mark for mesh regen |
| `markChunkClean(chunkX, chunkZ)` | `void` | Mark as clean |
| `isChunkDirty(chunkX, chunkZ)` | `boolean` | Is dirty |
| `getDirtyChunks()` | `Array{chunk, chunkX, chunkZ}` | All dirty chunks |
| `getDirtyCount()` | `number` | Dirty count |
| `updatePlayerPosition(playerChunkX, playerChunkZ)` | `void` | Load/unload based on position |
| `updateRenderDistance(newRadius)` | `void` | Change render radius |
| `destroy()` | `void` | Destroy all chunks |
| `clearAll()` | `void` | Clear without destroy |
| `generateChunkTerrain(chunkX, chunkZ)` | `boolean` | Generate terrain (delegates to dimension-specific generators) |

**Callbacks (wired by dimension.js):**
- `onChunkLoad(chunk)` — Called when new chunk created
- `onChunkUnload(chunk)` — Called when chunk removed
- `onChunksChanged()` — Called when chunk radius/position changes

---

### [dimension.js](dimension.js) — Dimension System

Manages Overworld, Nether, and End dimensions with isolated chunk data and coordinate transformation.

**Key Classes:**
- `Donkeycraft.Dimension(type, name, height, minY, maxY, hasSkyLight, hasCeiling, ambientDarkness, respawnAtSpawn, hasPiglins, hasWeather, musicDisc, bedWorks, coordinateScale)`
- `Donkeycraft.Dimensions` — Central registry singleton
- `Donkeycraft.DimensionType` — Constants: `{OVERWORLD: 0, NETHER: 1, END: 2}`

**Dimension Properties:**
- `type`, `name`, `height`, `minY`, `maxY`
- `hasSkyLight`, `hasCeiling`, `ambientDarkness` (0-1)
- `respawnAtSpawn`, `hasPiglins`, `hasWeather`, `musicDisc`, `bedWorks`, `coordinateScale`

**Dimensions API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getDimension(type)` | `Dimension|null` | By type constant |
| `getAllDimensions()` | `Dimension[]` | All dimensions |
| `hasDimension(type)` | `boolean` | Exists check |
| `getCurrentDimension()` | `number` | Active dimension type |
| `setCurrentDimension(type)` | `void` | Switch active dimension |
| `getSpawnPosition(type)` | `{x, y, z}` | Dimension spawn point |
| `setSpawnPosition(type, x, y, z)` | `void` | Set spawn point |
| `transformCoordinates(fromType, toType, x, y, z)` | `{x, y, z}` | Transform coords (÷8 for Nether) |
| `getChunkManagerForDimension(type, options)` | `ChunkManager` | Get/create dimension's chunk manager |
| `getChunkManagerForDimensionIfExists(type)` | `ChunkManager|null` | Non-creating lookup |
| `getCurrentChunkManager(options)` | `ChunkManager` | Current dimension's manager |
| `clearChunkManager(type)` | `void` | Destroy dimension's chunk manager |
| `getDimensionHeight(type)` | `number` | Dimension height |
| `bedsWorkInDimension(type)` | `boolean` | Bed usable? |
| `hasPiglinsInDimension(type)` | `boolean` | Piglin hostility? |
| `hasWeatherInDimension(type)` | `boolean` | Rain/snow? |
| `getAmbientDarkness(type)` | `number` | 0-1 darkness level |
| `hasSkyLightInDimension(type)` | `boolean` | Sky light reaches surface? |
| `destroy()` | `void` | Clear all chunk managers |

**Dimension Config:**
| Dimension | Y Range | Sky Light | Piglins | Weather | Coordinate Scale |
|-----------|---------|-----------|---------|---------|------------------|
| Overworld | 0–255 | Yes | No | Yes | 1 |
| Nether | 0–127 | No (ceiling) | Yes | No | 8 |
| End | 0–256 | Ambient darkness 1.0 | No | No | 1 |

---

### [world-utils.js](world-utils.js) — World Utilities

Shared coordinate and block access utilities to reduce duplication across modules.

**Key Class:**
- `Donkeycraft.WorldUtils` — Static utility singleton

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getBlockAt(chunkManager, gx, gy, gz)` | `number` | Block ID at global coords (0 if unloaded) |
| `setBlockAt(chunkManager, gx, gy, gz, blockId)` | `boolean` | Set block (marks chunk dirty) |
| `isChunkLoaded(chunkManager, gx, gz)` | `boolean` | Chunk currently loaded? |
| `getChunkAndLocalCoords(chunkManager, gx, gy, gz)` | `{chunk, lx, ly, lz}` | Chunk + local coords |
| `calculateRaycastMaxSteps(reach)` | `number` | DDA steps = ceil(reach × √3) + 2 |
| `makeStateKey(x, y, z)` | `string` | Composite key "x,y,z" |
| `parseStateKey(key)` | `{x, y, z}` | Parse "x,y,z" back |
| `makeChunkKey(globalX, globalZ)` | `string` | Chunk key "chunkX,chunkZ" |

**Note:** All functions use `getChunkIfExists` (non-creating) to avoid loading unloaded chunks.

---

## Biomes

### [biome.js](biome.js) — Biome Definitions

Defines 15 biome types with temperature, rainfall, colors, ground/grass/leaf/water colors, mob spawn rates, and decoration counts. Used by terrain generation systems to determine surface blocks and world appearance.

**Key Classes:**
- `Donkeycraft.Biome(id, name, temperature, rainfall, groundColor, grassColor, leafColor, config)` — Biome definition
- `Donkeycraft.BiomeRegistry` — Static registry singleton

**BiomeID Constants:**
| ID | Name | ID | Name |
|----|------|----|------|
| 1 | plains | 9 | sunflower_plains |
| 2 | desert | 10 | flower_forest |
| 3 | forest | 11 | ice_plains |
| 4 | swamp | 12 | desert_hills |
| 5 | taiga | 13 | forest_hills |
| 6 | ocean | 14 | taiga_hills |
| 7 | extreme_hills | 15 | swamp_hills |
| 8 | snowy_tundra | — | — |

**Biome Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `id` | `number` | Biome ID (1–15) |
| `name` | `string` | Biome name (e.g., 'plains', 'desert') |
| `temperature` | `number` | Temperature [0, 1] |
| `rainfall` | `number` | Rainfall [0, 1] |
| `groundColor` | `number` | Ground color as RGB integer |
| `grassColor` | `number\|null` | Grass color override (null = auto) |
| `leafColor` | `number\|null` | Leaf color override (null = auto) |
| `waterColor` | `number` | Water color override (default: 0x4fc3f7) |
| `hasSnow` | `boolean` | True if temperature < 0.15 |
| `isOcean` | `boolean` | True if biome ID = OCEAN |
| `isDesert` | `boolean` | True if DESERT or DESERT_M |
| `isExtremeHills` | `boolean` | True if EXTREME_HILLS |
| `spawnRates` | `{passive, hostile, aqua}` | Mob spawn rates per tick |
| `decoration` | `{trees, flowers, grass, cacti}` | Surface decoration counts per chunk |

**BiomeRegistry API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getBiomeById(id)` | `Biome|null` | Lookup by numeric ID |
| `getBiomeByName(name)` | `Biome|null` | Lookup by string name |
| `getAllBiomes()` | `Biome[]` | All registered biomes |
| `getBiomeCount()` | `number` | Total biome count (15) |
| `hasBiome(id)` | `boolean` | Exists check |
| `getRandomBiome()` | `Biome` | Random biome selection |
| `getBiomeByClimate(temperature, rainfall)` | `Biome|null` | Nearest match by Manhattan distance |

**Biome Climate Data:**
| Biome | Temperature | Rainfall | Has Snow | Is Desert | Spawn Rates (passive/hostile/aqua) | Decoration (trees/flowers/grass/cacti) |
|-------|-------------|----------|----------|-----------|-------------------------------------|----------------------------------------|
| plains | 0.8 | 0.4 | No | No | 0.01 / 0.025 / 0.005 | 2 / 3 / 6 / 0 |
| desert | 1.0 | 0.0 | No | Yes | 0.005 / 0.035 / 0 | 0 / 0 / 0 / 3 |
| forest | 0.7 | 0.5 | No | No | 0.01 / 0.025 / 0.005 | 8 / 2 / 3 / 0 |
| swamp | 0.7 | 0.8 | No | No | 0.01 / 0.025 / 0.005 | 4 / 1 / 5 / 0 |
| taiga | 0.3 | 0.5 | No | No | 0.008 / 0.03 / 0.003 | 6 / 1 / 4 / 0 |
| ocean | 0.5 | 0.5 | No | No | 0 / 0.015 / 0.03 | 0 / 0 / 0 / 0 |
| extreme_hills | 0.5 | 0.4 | No | No | 0.006 / 0.035 / 0.002 | 1 / 1 / 5 / 0 |
| snowy_tundra | 0.05 | 0.3 | Yes | No | 0.005 / 0.02 / 0.002 | 3 / 0 / 2 / 0 |
| sunflower_plains | 0.8 | 0.4 | No | No | 0.01 / 0.025 / 0.005 | 2 / 8 / 6 / 0 |
| flower_forest | 0.7 | 0.5 | No | No | 0.01 / 0.025 / 0.005 | 8 / 15 / 3 / 0 |
| ice_plains | 0.05 | 0.3 | Yes | No | 0.004 / 0.025 / 0.002 | 1 / 0 / 2 / 0 |

---

## Terrain Surface

### [terrain-surface.js](terrain-surface.js) — Terrain Surface Layer Application

Applies biome-specific surface blocks (grass, sand, snow, stone, clay) to chunks based on biome ID and heightmap. Called during terrain generation after base terrain is placed.

**Key Class:**
- `Donkeycraft.TerrainSurface` — Static singleton module

**API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `applySurfaceLayer(chunk, biomeId, heightmap)` | `void` | Apply surface layer to chunk |

**Surface Type by Biome:**
| Biome(s) | Surface Type | Top Block | Sub-Surface |
|----------|-------------|-----------|-------------|
| plains, forest, flower_forest, forest_hills, ocean, sunflower_plains | Grass | grass_block | 1–2 layers of dirt over stone |
| desert, desert_hills | Sand | sand | 1–3 layers of sand over stone/dirt |
| taiga, taiga_hills, ice_plains, snowy_tundra | Snow | grass_block + snow_layer | 1–2 layers of dirt over stone |
| extreme_hills, snowy_tundra (alternate) | Stone | stone | stone only |
| swamp, swamp_hills | Swamp | dirt | clay layer under stone |

**Surface Processing Rules:**
- Iterates each column in the chunk (0–15 for x and z)
- Uses heightmap to find surface Y coordinate
- Validates Y is within world bounds [1, WORLD_HEIGHT)
- Replaces top block with appropriate surface block
- Adds sub-surface layers below (dirt, sand, clay, snow)
- Snow layer placed one block above surface if space is empty

**Dependencies:**
- `BlockRegistry` — Resolves block IDs for grass_block, stone, dirt, sand, snow_block, snow_layer, clay

---

## Cross-references

- See [README-physics-env.md](README-physics-env.md) — Lighting engine processes chunk light data; physics system processes gravity blocks and liquid flow per chunk
- See [README-interaction.md](README-interaction.md) — Block placement/breaking uses ChunkManager for block lookups
- See [README-player.md](README-player.md) — Player collision detection uses ChunkManager for solid block checks