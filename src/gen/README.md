# Donkeycraft — Generation Module Documentation

Procedural generation system for Donkeycraft Minecraft-like voxel game. Handles terrain generation, cave systems, ore placement, dimension-specific generators (Overworld, Nether, End), textures, mob spawning, water, and sound.

## Table of Contents

| # | Module | Description |
|---|--------|-------------|
| 1 | [noise.js](#noisjs) | Noise utilities — Perlin noise, FBM, PRNG |
| 2 | [terrain-generator.js](#terrain-generatorjs) | Heightmap generation and terrain shaping |
| 3 | [cave-generator.js](#cave-generatorjs) | 3D noise-based cave systems |
| 4 | [ore-generator.js](#ore-generatorjs) | Ore vein placement |
| 5 | [water-generator.js](#water-generatorjs) | Water source placement |
| 6 | [structure-generator.js](#structure-generatorjs) | Chunk generation orchestrator |
| 7 | [nether-generator.js](#nether-generatorjs) | Nether dimension terrain |
| 8 | [end-generator.js](#end-generatorjs) | End dimension terrain |
| 9 | [mob-spawning.js](#mob-spawningjs) | Mob spawning system |
| 10 | [texture-core.js](#texture-corejs) | Texture core infrastructure |
| 11 | [texture-terrain.js](#texture-terrainjs) | Terrain block textures |
| 12 | [texture-blocks.js](#texture-blocksjs) | Block textures (ores, glass, bricks) |
| 13 | [texture-special.js](#texture-specialjs) | Special/dimension textures |
| 14 | [texture-decorative.js](#texture-decorativejs) | Decorative textures and block mapping |
| 15 | [sound-manager.js](#sound-managerjs) | Sound generation and asset management |

---

## noise.js

Shared noise functions for all texture generators and procedural systems. Provides Perlin noise, Fractal Brownian Motion (FBM), and a deterministic PRNG.

### Global State (Private)
- `_perm[]` — permutation table (512 entries, shuffled from seed)
- `_rngState` — Mulberry32 PRNG state

### API

| Function | Return | Description |
|----------|--------|-------------|
| `init(seed?)` | `void` | Initialize noise with a seed. Called automatically by terrain generator. |
| `_noise2D(x, y, [perm])` | `number` | 2D Perlin noise, returns value in [-1, 1]. Private. |
| `_fbm(x, y, octaves, frequency, amplitude, [perm])` | `number` | Fractal Brownian Motion — sums multiple noise octaves. Returns [-1, 1]. Private. |
| `_seedRng(seed)` | `void` | Seed the Mulberry32 PRNG. Private. |
| `_rng()` | `number` | Generate deterministic random in [0, 1). Private. |
| `_shufflePerm(seed)` | `void` | Shuffle permutation table deterministically. Private. |
| `_createShuffledPerm(seed)` | `number[]` | Create a NEW shuffled perm array (no global state mutation). Private. |

### Public Namespace
All noise utilities are exposed on `Donkeycraft._gen`:

```js
Donkeycraft._gen._shufflePerm(seed)
Donkeycraft._gen._createShuffledPerm(seed)
Donkeycraft._gen._noise2D(x, y, perm?)
Donkeycraft._gen._fbm(x, y, octaves, frequency, amplitude, perm?)
Donkeycraft._gen._seedRng(seed)
Donkeycraft._gen._rng()
```

### Usage Notes
- `fbm` parameters: `octaves` controls detail depth, `frequency` doubles each octave, `amplitude` halves each octave.
- The noise system uses a shared permutation table — call `_shufflePerm()` before texture generation to isolate results.

---

## terrain-generator.js

Generates heightmaps for the Overworld using multi-octave Perlin noise with biome-specific parameters.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `generateHeightmap(chunkX, chunkZ, [biome])` | `number[]` | Generate heightmap array (size `CHUNK_SIZE × CHUNK_SIZE`). |
| `getHeightAt(chunkX, chunkZ, localX, localZ, heightmap)` | `number` | Get height at local position within a heightmap. |
| `generate(chunkX, chunkZ)` | `number[]` | Convenience wrapper for `generateHeightmap`. |
| `getInstance()` | `object` | Returns the TerrainGenerator module object. |

### Biome Height Behavior

| Biome Type | Base Height | Variation |
|------------|-------------|-----------|
| Ocean | 20 | ±5 |
| Desert | 60 | ±10 |
| Extreme Hills | 100 | ±80 (with peak boost) |
| Snow biome | 70 | ±30 |
| Plains/Forest/Swamp/Taiga | 64 | ±20 |

### Usage
```js
var heightmap = Donkeycraft.TerrainGenerator.generateHeightmap(chunkX, chunkZ, biome);
// heightmap[x + z * 16] gives height at local position
```

---

## cave-generator.js

3D noise-based cave generation with lava caves and biome-specific density variation.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `generateCaves(chunk, biomeId, [dimConfig])` | `void` | Generate caves in a chunk. |
| `getDensity()` | `number` | Get current cave density threshold. |
| `setDensity(value)` | `void` | Set cave density (range [0, 1]). Higher = more caves. |
| `getRadius()` | `number` | Get base tunnel radius in blocks. |
| `setRadius(value)` | `void` | Set base tunnel radius. |
| `getLavaYLevel()` | `number` | Get Y level below which lava caves generate. |
| `getInstance()` | `object` | Returns the CaveGenerator module object. |
| `destroy()` | `void` | Free resources. |

### Configuration (Private)
- `_caveDensity = -0.7` — fbm threshold for cave carving
- `_caveRadius = 3.0` — base tunnel radius
- `_lavaYLevel = 10` — lava caves below this Y

### Biome Adjustments
| Biome | Density Adjustment | Radius |
|-------|-------------------|--------|
| Ocean | -0.9 (fewer caves) | 50% |
| Desert | -0.8 (slightly fewer) | Normal |
| Default | -0.7 | Normal |

### Usage
```js
Donkeycraft.CaveGenerator.generateCaves(chunk, biomeId);
Donkeycraft.CaveGenerator.setDensity(-0.6); // More caves
```

---

## ore-generator.js

Places ore veins in chunks based on definitions with Y-level ranges, vein sizes, rarity, and biome restrictions.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `init()` | `void` | Resolve all ore block IDs from BlockRegistry. |
| `placeOres(chunk, biomeId)` | `void` | Place ores in a chunk. Auto-initializes on first call. |
| `getMinY(oreName)` | `number` | Get minimum Y for an ore type. Returns -1 if not found. |
| `getMaxY(oreName)` | `number` | Get maximum Y for an ore type. Returns -1 if not found. |
| `getOreDefinitions()` | `Array` | Get all ore definition objects. |
| `getOreCount()` | `number` | Number of ore types defined. |
| `getInstance()` | `object` | Returns the OreGenerator module object. |
| `destroy()` | `void` | Free resources. |

### Ore Definitions

| Ore | Block Name | Y Range | Vein Size | Rarity | Biome Filter |
|-----|-----------|---------|-----------|--------|--------------|
| Coal | `coal_ore` | 0–160 | 8 | 12 | All |
| Iron | `iron_ore` | 0–164 | 6 | 10 | All |
| Gold | `gold_ore` | 0–64 | 4 | 20 | All |
| Diamond | `diamond_ore` | 0–32 | 3 | 28 | All |
| Redstone | `redstone_ore` | 0–32 | 5 | 16 | All |
| Lapis | `lapis_ore` | 0–64 | 4 | 18 | All |
| Emerald | `emerald_ore` | 0–32 | 2 | 30 | Extreme Hills only |

### Usage
```js
Donkeycraft.OreGenerator.placeOres(chunk, biomeId);
var minY = Donkeycraft.OreGenerator.getMinY('diamond_ore'); // 0
```

---

## water-generator.js

Places water sources: ocean water filling, surface water in low areas, and underground lakes.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `placeWater(chunk, biomeId, heightmap)` | `void` | Place water in a chunk. |
| `getWaterLevel()` | `number` | Get default water level (sea level). |
| `setWaterLevel(value)` | `void` | Set water level. |
| `isLiquidBlock(blockId)` | `boolean` | Check if block ID is a liquid. |
| `getLiquidBlockIds()` | `number[]` | Get all known liquid block IDs. |
| `getInstance()` | `object` | Returns the WaterGenerator module object. |
| `destroy()` | `void` | Free resources. |

### Behavior by Biome
- **Ocean biomes**: Fill from surface to water level (Y=63)
- **Overworld biomes**: Fill low areas below water level
- **Underground lakes**: 1–3 random lakes per chunk at Y 40–100

### Usage
```js
Donkeycraft.WaterGenerator.placeWater(chunk, biomeId, heightmap);
Donkeycraft.WaterGenerator.setWaterLevel(70);
```

---

## structure-generator.js

Chunk generation orchestrator — coordinates the full pipeline: terrain → surface → ores → caves → water → decoration.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `generateChunkFull(chunk, biomeId)` | `void` | Generate a complete chunk. |
| `invalidateBlockIdCache()` | `void` | Clear cached block references and re-resolve from BlockRegistry. |

### Generation Pipeline
1. Fill chunk with air
2. Generate heightmap (via TerrainGenerator)
3. Place terrain blocks (bedrock, stone, dirt)
4. Apply surface layer (via TerrainSurface)
5. Place ores (via OreGenerator)
6. Generate caves (via CaveGenerator)
7. Place water (via WaterGenerator)
8. Surface decoration (trees, flowers, grass, cacti)

### Usage
```js
Donkeycraft.StructureGenerator.generateChunkFull(chunk, biomeId);
```

---

## nether-generator.js

Nether dimension terrain: bedrock ceiling/floor, lava seas at Y=31, netherrack fill, ore veins, and unique features.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `setChunkManager(chunkManager)` | `void` | Set ChunkManager reference for terrain generation. |
| `generateNetherTerrain(chunkOrX, [chunkZ], [optChunkZ])` | `void` | Generate full nether terrain. Supports both signatures. |
| `generateNetherHeightmap(chunkX, chunkZ)` | `number[]` | Generate heightmap array. |
| `isLavaSeaLevel(y)` | `boolean` | Check if Y is lava sea level (31–32). |
| `getLavaSeaLevel()` | `number` | Get lava sea level (returns 31). |
| `invalidateBlockIdCache()` | `void` | Re-resolve cached block IDs from BlockRegistry. |
| `getInstance()` | `object` | Returns the NetherGenerator module object. |
| `destroy()` | `void` | Free resources. |

### Terrain Structure
| Layer | Y Range | Content |
|-------|---------|---------|
| Bedrock floor | 0–~5 | 3–5 layers of bedrock |
| Netherrack fill | ~6–~WORLD_HEIGHT-6 | Netherrack |
| Lava seas | 31–32 | Lava |
| Bedrock ceiling | ~WORLD_HEIGHT-5–end | 3–5 layers |

### Features Generated
- Soul sand layers (Y=18–42)
- Basalt columns (Y=40–70)
- Blackstone clusters
- Quartz ore, nether gold ore, gilded blackstone, magma blocks, ancient debris (Y=8–22)

### Usage
```js
Donkeycraft.NetherGenerator.setChunkManager(chunkManager);
Donkeycraft.NetherGenerator.generateNetherTerrain(chunk);
```

---

## end-generator.js

End dimension terrain: obsidian platform, floating islands (midlands/highlands/outer), chorus plants/flowers, end cities.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `setChunkManager(chunkManager)` | `void` | Set ChunkManager reference. |
| `generateEndTerrain(chunkOrX, [optChunkX], [optChunkZ])` | `void` | Generate full End terrain. Supports both signatures. |
| `generateEndHeightmap(chunkX, chunkZ)` | `number[]` | Generate heightmap array. |
| `isIslandChunk(chunkX, chunkZ)` | `boolean` | Check if position is on an island. |
| `getBaseYForIslandType(islandType)` | `number` | Get base Y for island type string. |
| `invalidateBlockIdCache()` | `void` | Re-resolve cached block IDs from BlockRegistry. |
| `getInstance()` | `object` | Returns the EndGenerator module object. |
| `destroy()` | `void` | Free resources. |

### Island Types

| Type | Distance from Center | Base Y | Description |
|------|---------------------|--------|-------------|
| Inner | 0–2 chunks | — | Void (no islands) |
| Midlands | 2–12 chunks | 49 | Moderate 2–8 block islands |
| Highlands | 12–30 chunks | 55 | Large 4–14 block elevated islands |
| Outer | 30+ chunks | 45 | Sparse 1–3 block islands |

### End Cities
- Generated only on highlands chunks (~5% chance)
- 3×3 hollow tower with purpur blocks
- Purpur pillars on corners
- Shroomlight decoration

### Usage
```js
Donkeycraft.EndGenerator.setChunkManager(chunkManager);
Donkeycraft.EndGenerator.generateEndTerrain(chunk);
var isIsland = Donkeycraft.EndGenerator.isIslandChunk(cx, cz);
```

---

## mob-spawning.js

Chunk-based mob spawning system with light level checks, biome filters, mob caps, and group spawning.

### Constants

```js
Donkeycraft.SpawnType = {
    MONSTER: 'monster',  // Hostile — dark areas
    CREATURE: 'creature', // Passive — daylight
    AMBIENT: 'ambient',   // Bats — caves
    WATER: 'water'        // Squid/fish — water
};
```

### Classes

#### `Donkeycraft.MobSpawnDefinition(config)`
Spawn configuration object.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | string | `'zombie'` | Mob type identifier |
| `spawnType` | string | `SpawnType.MONSTER` | Condition type |
| `maxCount` | number | 70 | Max per type in loaded chunks |
| `maxGroupSize` | number | 4 | Maximum group size |
| `minGroupSize` | number | 1 | Minimum group size |
| `weight` | number | 5 | Spawn probability weight |
| `minY` / `maxY` | number | 0/255 | Y-level range |
| `minLightLevel` / `maxLightLevel` | number | 0/7 | Light range |
| `biomes` | string[] | [] | Biome filter (empty = all) |
| `requireSolidBelow` | boolean | true | Needs solid block below |

#### `Donkeycraft.MobSpawner()`
Main spawner object.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `totalMobCap` | number | 256 | Total active entity cap |
| `monsterMobCap` | number | 70 | Monster cap |
| `creatureMobCap` | number | 15 | Creature cap |
| `spawnCheckInterval` | number | 400 | Ticks between checks |
| `enabled` | boolean | true | Whether spawning is enabled |
| `despawnRadius` | number | 128 | Despawn distance |
| `despawnDelay` | number | 600 | Linger ticks before despawn |

### API

| Function | Return | Description |
|----------|--------|-------------|
| `registerSpawn(definition)` | `void` | Register a spawn definition. |
| `getDefinitions()` | `MobSpawnDefinition[]` | Get all registered definitions. |
| `getCurrentCount(type)` | `number` | Get current count for a mob type. |
| `getTotalCount()` | `number` | Get total active mob count. |
| `isMobCapReached(definition)` | `boolean` | Check if mob cap is reached. |
| `isValidSpawnChunk(chunkX, chunkZ, getChunkInfo)` | `boolean` | Check if chunk is valid for spawning. |
| `validateSpawnPosition(def, x, y, z, getBlockLight, isBlockSolid)` | `boolean` | Validate spawn position. |
| `findSpawnPosition(def, chunkX, chunkZ, ...)` | `object\|null` | Find valid spawn position `{x, y, z}` or null. |
| `spawnMobAt(def, x, y, z, createMob, spawnEntity)` | `Entity\|null` | Spawn a mob at position. |
| `tick(deltaTime, worldInfo)` | `void` | Run one spawn cycle. |
| `resetCounts()` | `void` | Reset all mob counts. |
| `destroy()` | `void` | Free resources. |

### Default Definitions
Includes zombie, skeleton, spider, creeper (monsters) and cow, pig, sheep, chicken (creatures) with biome and light restrictions.

### Usage
```js
var spawner = new Donkeycraft.MobSpawner();
spawner.registerSpawn(new Donkeycraft.MobSpawnDefinition({
    type: 'zombie',
    spawnType: Donkeycraft.SpawnType.MONSTER,
    minLightLevel: 0, maxLightLevel: 7
}));
spawner.tick(1/20, worldInfo);
```

---

## texture-core.js

Core infrastructure for procedural texture generation. Provides shared cache, canvas helpers, and color definitions.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `_createCanvas(width, height)` | `HTMLCanvasElement` | Create offscreen canvas. Private. |
| `_cacheTexture(prefix, key, img)` | `HTMLImageElement` | Cache texture with LRU eviction (max 4096). Private. |
| `clearTextureCache()` | `void` | Clear the texture cache. |
| `_canvasToImage(canvas)` | `HTMLImageElement` | Convert canvas to Image via data URL. Private. |

### Public Properties
| Property | Type | Description |
|----------|------|-------------|
| `Donkeycraft.TextureGenerator._textureCache` | `Object` | Texture cache by key |
| `Donkeycraft.TextureGenerator._cacheInsertionOrder` | `string[]` | Cache order tracking (for debugging) |
| `Donkeycraft.TextureGenerator._createCanvas` | `Function` | Canvas creation helper |
| `Donkeycraft.TextureGenerator._cacheTexture` | `Function` | Cached texture storage |
| `Donkeycraft.TextureGenerator.clearTextureCache` | `Function` | Cache clearing |
| `Donkeycraft.TextureGenerator._canvasToImage` | `Function` | Canvas-to-image conversion |
| `Donkeycraft.TextureGenerator.COLOR_MAP` | `Object` | Color name → RGB mapping (16 standard colors) |
| `Donkeycraft.TextureGenerator.TEX_SIZE` | `number` | Texture size (16) |

### COLOR_MAP
```js
{
    white: {r:240, g:240, b:240}, orange: {r:234, g:131, b:36},
    magenta: {r:183, g:71, b:185}, light_blue: {r:100, g:198, b:232},
    yellow: {r:240, g:222, b:64}, lime: {r:125, g:227, b:56},
    // ... (16 total colors)
}
```

---

## texture-terrain.js

Terrain block textures: stone family, dirt, grass, wood/planks, wool, concrete, sand, snow, terracotta, sandstone, sponge.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `generateStone([seed])` | `HTMLImageElement` | Generate stone texture |
| `generateDirt([seed])` | `HTMLImageElement` | Generate dirt texture |
| `generateGrassTop()` | `HTMLImageElement` | Grass block top (cached) |
| `generateGrassSide()` | `HTMLImageElement` | Grass block side with drips (cached) |
| `generateLogSide(seed)` | `HTMLImageElement` | Log/bark side texture |
| `generateLogTop([seed])` | `HTMLImageElement` | Log top with growth rings |
| `generateWood(seed)` | `HTMLImageElement` | Wood (bark all sides) |
| `generatePlanks(r, g, b, seed)` | `HTMLImageElement` | Plank texture with vertical lines |
| `generateWool(r, g, b)` | `HTMLImageElement` | Colored wool with woven pattern |
| `generateConcrete(r, g, b)` | `HTMLImageElement` | Smooth concrete |
| `generateConcretePowder(r, g, b)` | `HTMLImageElement` | Rougher concrete powder |
| `generateSand(r, g, b)` | `HTMLImageElement` | Colored sand |
| `generateSnow()` | `HTMLImageElement` | Snow layer texture |
| `generateSnowBlock()` | `HTMLImageElement` | Solid snow block |
| `generateTerracotta(r, g, b)` | `HTMLImageElement` | Colored terracotta |
| `generateSandstone()` | `HTMLImageElement` | Sandstone with layer effect |
| `generateChiseledSandstone()` | `HTMLImageElement` | Chiseled sandstone |
| `generateCutSandstone()` | `HTMLImageElement` | Cut sandstone |
| `generateCoralBlock(color)` | `HTMLImageElement` | Coral block (dead/purple/blue/orange/pink) |
| `generateSponge()` | `HTMLImageElement` | Sponge with holes |
| `generateWetSponge()` | `HTMLImageElement` | Darker wet sponge |
| `generateSmoothStone()` | `HTMLImageElement` | Smooth stone variant |
| `generatePolishedGranite()` | `HTMLImageElement` | Polished granite |
| `generatePolishedDiorite()` | `HTMLImageElement` | Polished diorite |
| `generatePolishedAndesite()` | `HTMLImageElement` | Polished andesite |

### Aliases
```js
Donkeycraft.TextureGenerator.generateRedSand()    // generateSand(183, 105, 63)
Donkeycraft.TextureGenerator.generateSnowBlock()  // snow block texture
Donkeycraft.TextureGenerator.generateGrass()      // alias for generateGrassTop()
```

---

## texture-blocks.js

Block textures: glass, ice, bricks, ores (all types), metal blocks, quartz variants, deepslate family.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `generateGlass(r, g, b)` | `HTMLImageElement` | Transparent glass with border |
| `generateIce()` | `HTMLImageElement` | Ice texture |
| `generateBlueIce()` | `HTMLImageElement` | Opaque deep blue ice |
| `generateBricks(r, g, b)` | `HTMLImageElement` | Brick pattern with mortar |
| `generateOre(oreR, oreG, oreB)` | `HTMLImageElement` | Ore veins in stone |
| `generateCoalOre()` | `HTMLImageElement` | Coal ore (dark gray) |
| `generateIronOre()` | `HTMLImageElement` | Iron ore (light brown) |
| `generateGoldOre()` | `HTMLImageElement` | Gold ore (yellow) |
| `generateDiamondOre()` | `HTMLImageElement` | Diamond ore (cyan) |
| `generateEmeraldOre()` | `HTMLImageElement` | Emerald ore (green) |
| `generateRedstoneOre()` | `HTMLImageElement` | Redstone ore (red) |
| `generateLitRedstoneOre()` | `HTMLImageElement` | Glowing redstone ore |
| `generateLapisOre()` | `HTMLImageElement` | Lapis ore (blue) |
| `generateNetherQuartzOre()` | `HTMLImageElement` | Nether quartz (cream in netherrack) |
| `generateNetherGoldOre()` | `HTMLImageElement` | Nether gold (gold in netherrack) |
| `generateGoldBlock()` | `HTMLImageElement` | Gold ingot block |
| `generateIronBlock()` | `HTMLImageElement` | Iron ingot block |
| `generateDiamondBlock()` | `HTMLImageElement` | Diamond block |
| `generateEmeraldBlock()` | `HTMLImageElement` | Emerald block |
| `generateCoalBlock()` | `HTMLImageElement` | Coal block |
| `generateRedstoneBlock()` | `HTMLImageElement` | Redstone block |
| `generateLapisBlock()` | `HTMLImageElement` | Lapis block |
| `generateQuartzPillar()` | `HTMLImageElement` | Quartz pillar (horizontal stripes) |
| `generateQuartzBlock()` | `HTMLImageElement` | Plain quartz block |
| `generateChiseledQuartz()` | `HTMLImageElement` | Chiseled quartz |
| `generateQuartzBricks()` | `HTMLImageElement` | Quartz brick pattern |
| `generateDeepslate()` | `HTMLImageElement` | Deepslate texture |
| `generateCobbledDeepslate()` | `HTMLImageElement` | Cobbled deepslate |
| `generatePolishedDeepslate()` | `HTMLImageElement` | Polished deepslate |

---

## texture-special.js

Special/dimension textures: glow, bedrock, basalt, slime, honey, prismarine, nether wood, end blocks, nether brick variants.

### API

| Function | Return | Description |
|----------|--------|-------------|
| `generateGlow(r, g, b)` | `HTMLImageElement` | Glowing block with radial gradient |
| `generateBedrock()` | `HTMLImageElement` | Dark bedrock texture |
| `generateBasalt()` | `HTMLImageElement` | Basalt with vertical grain |
| `generatePolished(r, g, b)` | `HTMLImageElement` | Smooth polished stone |
| `generatePolishedBasalt()` | `HTMLImageElement` | Polished basalt |
| `generateSlime(r, g, b)` | `HTMLImageElement` | Slime block with grid pattern |
| `generateHoney()` | `HTMLImageElement` | Honey block (golden transparent) |
| `generatePrismarine(variant)` | `HTMLImageElement` | Prismarine: "normal", "bricks", "dark" |
| `generateWarpedStem()` | `HTMLImageElement` | Warped stem (teal/green) |
| `generateCrimsonStem()` | `HTMLImageElement` | Crimson stem (deep red) |
| `generateNylium(isWarped)` | `HTMLImageElement` | Nylium: warped or crimson |
| `generatePolishedBlackstone()` | `HTMLImageElement` | Polished blackstone |
| `generateNetherrack()` | `HTMLImageElement` | Netherrack (red noise) |
| `generateGlowstone()` | `HTMLImageElement` | Glowstone with bright spots |
| `generateShroomlight()` | `HTMLImageElement` | Shroomlight with glow spots |
| `generateMagma()` | `HTMLImageElement` | Magma block with cracks |
| `generateSoulSand()` | `HTMLImageElement` | Soul sand (dark gray) |
| `generateSoulSoil()` | `HTMLImageElement` | Soul soil (darker) |
| `generateAncientDebris()` | `HTMLImageElement` | Ancient debris in netherrack |
| `generateGildedBlackstone()` | `HTMLImageElement` | Gilded blackstone with gold specks |
| `generateEndStone()` | `HTMLImageElement` | End stone (yellowish) |
| `generatePurpurBlock()` | `HTMLImageElement` | Purpur block (purple vertical lines) |
| `generatePurpurPillar()` | `HTMLImageElement` | Purpur pillar (horizontal lines) |
| `generateHayBale()` | `HTMLImageElement` | Hay bale with horizontal lines |
| `generateNetherBrick()` | `HTMLImageElement` | Nether brick pattern |
| `generateRedNetherBrick()` | `HTMLImageElement` | Red nether brick |
| `generateMossyStoneBrick()` | `HTMLImageElement` | Mossy stone brick |

---

## texture-decorative.js

Decorative textures, plant textures, redstone components, doors, fences, liquids, beds, signs, and the block name → generator mapping system.

### Key Functions

| Function | Return | Description |
|----------|--------|-------------|
| `getGeneratorForBlock(blockName)` | `Function\|null` | Get generator function for a block name |
| `generateTextureForBlock(blockName)` | `HTMLImageElement\|null` | Generate texture by block name |
| `generateAllTextures()` | `Object.<number, HTMLImageElement>` | Generate textures for all registered blocks |
| `getTextureNameForBlock(blockId)` | `string\|null` | Get texture name for block ID |
| `getNameMap()` | `Object.<number, string>` | Block ID → texture filename map |

### Covered Block Categories
- **Plants**: leaves, grass, tall_grass, fern, flowers, rose_bush, sunflower, lily_pad, dead_bush, vine, cave_vines, sugar_cane, cactus, chorus_plant, cocoa
- **Redstone**: wire, torch, lamp (lit/unlit), dispenser, dropper, observer, repeater, piston, sticky_piston, TNT
- **Storage**: chest, trapped_chest, barrel, furnace, smoker, blast_furnace, crafting_table, bookshelf, chiseled_bookshelf, lectern
- **Doors**: oak, iron, spruce (wood/iron variants)
- **Fences/Walls**: fence, cobblestone_wall, brick_wall, nether_brick_wall
- **Mechanisms**: lever, button, pressure_plate, end_rod, chain
- **Special**: end_portal_frame, end_portal, nether_portal, mob_spawner, enchanting_table, brewing_stand, cauldron, respawn_anchor
- **Beds**: all 16 colors
- **Signs**: all 6 wood types
- **Liquids**: water, lava

### Usage
```js
var gen = Donkeycraft.TextureGenerator.getGeneratorForBlock('oak_log');
if (gen) var img = gen();

var all = Donkeycraft.TextureGenerator.generateAllTextures();
// all[blockId] → HTMLImageElement
```

---

## sound-manager.js

Procedural sound generation via Web Audio API, asset management, and texture atlas generation.

### SoundGenerator

| Function | Return | Description |
|----------|--------|-------------|
| `getSound(ctx, category, [material])` | `Promise<AudioBuffer>` | Get/generate sound by category |
| `getCategories()` | `string[]` | Available categories: `['step', 'break', 'place', 'hit', 'footstep']` |
| `clearCache()` | `void` | Clear sound cache |

### AssetManager

| Function | Return | Description |
|----------|--------|-------------|
| `init(ctx)` | `void` | Initialize with AudioContext |
| `generateAllBlockTextures()` | `Object.<number, HTMLImageElement>` | Generate all block textures |
| `getTexture(blockId)` | `HTMLImageElement\|null` | Get texture for block ID |
| `getAllTextures()` | `Object` | Get all generated textures |
| `preloadSounds(categories)` | `Promise[]` | Preload sound categories |
| `getNameMap()` | `Object.<number, string>` | Get texture name map |
| `generateAtlasCanvas()` | `HTMLCanvasElement` | Generate procedural texture atlas (80×80 cells) |
| `getAssetInfo()` | `Object` | Asset statistics |
| `reset()` | `void` | Reset all cached data |

### AssetGenerator (Promise wrapper)

| Function | Return | Description |
|----------|--------|-------------|
| `generateAllTextures()` | `Promise<Object>` | Resolves with blockId → Image map |
| `generateMissingTexture()` | `HTMLImageElement\|null` | Generate checkerboard fallback texture |

### Usage
```js
// Sound
var audioBuffer = await Donkeycraft.SoundGenerator.getSound(audioCtx, 'step', 'stone');

// Textures
Donkeycraft.AssetManager.init(audioCtx);
var textures = await Donkeycraft.AssetGenerator.generateAllTextures();

// Atlas (debugging)
var atlas = Donkeycraft.AssetManager.generateAtlasCanvas();
```

---

## Architecture Overview

```
src/gen/
├── noise.js              ← Foundation: Perlin noise, FBM, PRNG
├── terrain-generator.js  ← Overworld heightmaps
├── cave-generator.js     ← 3D cave systems
├── ore-generator.js      ← Ore veins
├── water-generator.js    ← Water placement
├── structure-generator.js ← Pipeline orchestrator
├── nether-generator.js   ← Nether dimension
├── end-generator.js      ← End dimension
├── mob-spawning.js       ← Mob spawning
├── texture-core.js       ← Texture infrastructure
├── texture-terrain.js    ← Terrain textures
├── texture-blocks.js     ← Ore/glass/brick textures
├── texture-special.js    ← Dimension special textures
├── texture-decorative.js ← Plants/decor/block mapping
└── sound-manager.js      ← Sound + asset management
```

### Module Dependencies
- `noise.js` → base module, no dependencies
- `terrain-generator.js` → depends on `noise.js`
- `cave-generator.js` → depends on `noise.js`, uses `PerlinNoise.fbm()`
- `ore-generator.js` → depends on `BlockRegistry`
- `water-generator.js` → depends on `BlockRegistry`, `BiomeRegistry`
- `structure-generator.js` → orchestrator, depends on all generators
- `nether-generator.js` → depends on `noise.js`, `BlockRegistry`
- `end-generator.js` → depends on `noise.js`, `BlockRegistry`
- `mob-spawning.js` → depends on `Config`
- `texture-core.js` → base texture module
- `texture-terrain.js` → depends on `noise.js`, `texture-core.js`
- `texture-blocks.js` → depends on `noise.js`, `texture-core.js`
- `texture-special.js` → depends on `noise.js`, `texture-core.js`
- `texture-decorative.js` → depends on all texture modules, `BlockRegistry`
- `sound-manager.js` → depends on Web Audio API, `BlockRegistry`

### Common Patterns
1. **Module IIFE**: All modules use `(function() { 'use strict'; ... })()` pattern
2. **Instance accessor**: Most expose `getInstance()` returning the module object
3. **Block ID caching**: Generators cache block IDs from BlockRegistry with `invalidateBlockIdCache()` methods
4. **Texture caching**: Textures use LRU eviction (max 4096 entries) with prefix:key format
5. **Dual signatures**: Dimension generators accept both `(chunk, cx, cz)` and `(cx, cz)` calling conventions