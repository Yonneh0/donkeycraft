# Procedural Terrain Generation Redesign Plan

## Overview

Complete redesign of the procedural terrain generation system to produce more realistic, natural-looking terrain with proper chunk boundary contiguity, fractal-based heightmaps, multi-pass cave systems, and efficient browser caching.

## Core Requirements

1. **12-chunk base grid**: Always generate a contiguous grid of 12 chunks (6×6) before any branching
2. **Contiguous chunk boundaries**: Terrain features flow seamlessly across chunk edges using shared global noise coordinates
3. **Fractal surface terrain**: Multi-pass fBm + ridged multifractal for natural features (valleys, cliffs, mountains, lakes, proper caves)
4. **Multi-pass cave system**: Multiple carving passes for realistic cave networks with entrances
5. **Efficient caching**: Results cached in browser storage (localStorage + IndexedDB) with LRU eviction
6. **Deterministic generation**: Entirely from a 32-bit seed — nothing random
7. **Surface heightmap**: Proper heightmap output for all terrain types
8. **Simplified biomes**: Grass, Arctic, Desert, Forest (4 total)

---

## Phase 1: Foundation & Infrastructure

### New Files to Create:

#### `src/gen/terrain-core.js` — Centralized Terrain Engine
- Single entry point for all terrain generation
- Manages the 32-bit seed and chunk grid layout
- Implements "12-chunk base grid" concept
- Handles caching coordination
- Provides API for chunk generation requests

#### `src/gen/chunk-grid.js` — Chunk Grid Manager
- Manages the 12-chunk base grid structure
- Tracks loaded/unloaded chunks relative to center
- Ensures contiguous terrain via edge alignment
- Provides grid expansion/contraction API

#### `src/core/storage.js` — Browser Storage Cache Manager
- Hybrid localStorage + IndexedDB caching
- Cache keys based on (chunkX, chunkZ, biomeId, seed)
- Automatic cache eviction near quota limit
- Async read/write with batching
- Cache validation via generation signature

### Existing Files to Update:

#### `src/gen/noise.js` — Enhanced Fractal Noise System
- Add multi-scale fBm with configurable octaves
- Implement ridged multifractal noise for mountains/cliffs
- Add valley detection noise layer
- Ensure ALL noise uses same 32-bit seed deterministically
- Add noise composition system

---

## Phase 2: Surface Terrain Generation

#### `src/gen/surface-generator.js` — Fractal Surface Heightmap (NEW)
Multi-pass terrain height generation:
- **Pass 1**: Continental noise (0.002-0.005 scale) — land vs water regions
- **Pass 2**: Terrain shaping (0.01-0.02 scale) — hills/valleys
- **Pass 3**: Detail noise (0.04-0.08 scale) — texture and variation
- **Pass 4**: Ridged multifractal (0.008-0.015 scale) — mountains/cliffs
- **Pass 5**: Micro-detail (0.1+ scale) — surface roughness

Output: heightmap array (CHUNK_SIZE × CHUNK_SIZE) with proper Y values
Includes shore/beach transition zones and lake basin detection

#### `src/game/biome.js` — Simplified Biome System (REWRITE)
Reduce to 4 biomes, each with unique parameters:
- **Grass**: Moderate terrain, mixed elevation, sea level Y=63
- **Arctic**: Flatter terrain, snow caps, lower sea level, ice lake basins
- **Desert**: Rolling dunes, extreme elevation variance, dry basins
- **Forest**: Rich variation, valleys for water, moderate mountains

---

## Phase 3: Chunk Boundary Contiguity

### Implementation in `src/gen/terrain-core.js`:
- Sample noise at overlapping edges using shared global coordinates
- Seamless Perlin noise ensures features naturally continue across chunks
- Edge smoothing pass to eliminate artifacts

### Implementation in `src/gen/chunk-grid.js`:
- Base grid always 12 chunks (configurable)
- New chunks align with existing edge noise when expanding

---

## Phase 4: Cave System

#### `src/gen/cave-generator.js` — Multi-Pass Cave System (REWRITE)

5-pass cave generation:
1. **Main cave network**: Large tunnels using fbm at low threshold
2. **Small cave branches**: Finer noise for secondary passages
3. **Cave entrance carving**: Detect surface-adjacent caves, carve natural entrances
4. **Lava caves**: Deep caves below Y=10 with lava filling
5. **Decoration caves**: Special caves with glowstone/crystal formations

Features:
- Smooth tunnel shapes using spherical carving with noise-based radius
- Ceiling/floor height variation for natural appearance
- Adaptive Y stepping for connected networks

---

## Phase 5: Ore Distribution

#### `src/gen/ore-generator.js` — Realistic Ore System (REWRITE)

Geological ore placement:
- **Coal/Stone**: Broad distribution at multiple Y levels
- **Iron/Gold**: Concentrated in specific depth ranges
- **Diamond/Emery**: Deep underground in vein clusters
- **Biome-specific**: Emerald in mountains, redstone near lava

Vein types:
- Spheres (magmatic deposits)
- Flat layers (sedimentary)
- Vertical pipes (hydrothermal veins)

Features:
- Noise-based density falloff within veins
- Validates ore placed inside solid rock
- Biome-aware placement

---

## Phase 6: Water System

#### `src/gen/water-generator.js` — Realistic Water (REWRITE)

Water features:
- **Oceans**: Filled to sea level with shore transitions
- **Rivers**: Noise-based channel carving from mountains to low areas
- **Lakes**: Basin detection + water filling
- **Underground**: Caves near water table partially flooded

Biome-specific behavior:
- Grass: Standard water table at Y=63
- Arctic: Frozen surface, ice layer on water bodies
- Desert: No surface water, underground aquifers only
- Forest: Higher water table, more surface features

---

## Phase 7: Surface Layer & Decoration

#### `src/game/terrain-surface.js` — Biome-Appropriate Surface (UPDATE)
- Grass: Grass block top, dirt sub-surface, stone deep
- Arctic: Snow block top, ice in shallow water, packed ice at depth
- Desert: Sand top, sandstone layers below, desert rock at depth
- Forest: Grass block top, rich dirt (2 layers), stone deep

#### `src/gen/structure-generator.js` — Biome-Specific Decoration (UPDATE)
- Grass: Oak trees, flowers, tall grass
- Arctic: Snow layers, ice formations, sparse dead trees
- Desert: Cacti, dead bushes, no trees
- Forest: Dense trees (oak + birch), underbrush, mushrooms

---

## Phase 8: Caching System

#### `src/gen/terrain-core.js` — Terrain Caching
- Heightmap cache: keyed by (chunkX, chunkZ, biomeId, seed)
- Full chunk cache: complete block data for generated chunks
- Cache validation: check if seed/biome changed
- Memory management: LRU eviction for off-screen chunks
- Persistence: write to IndexedDB, read on load

#### `src/core/storage.js` — Chunk Persistence
- Efficient serialization (run-length encoding for air areas)
- Batch writes for multiple chunks
- Background async saves during idle time

---

## Phase 9: terrain.html Updates

### UI Changes:
- Biome selector: 4 options (grass, arctic, desert, forest)
- Chunk grid display: 12-chunk base grid (configurable expansion)
- Controls for grid expansion/contraction in each direction
- Stats display: cache hit rate, generation time
- Seed input with regenerate button
- Generation option toggles (caves, ores, water, surface)

### Rendering Updates:
- Surface heightmap visualization with fractal terrain
- Biome-specific color palettes
- Cave visibility toggle
- Water overlay toggle
- Ore visibility toggle

---

## Phase 10: index.html Updates

### Integration Changes:
- Wire new terrain-core.js into chunk manager pipeline
- Update biome selector in GUI to 4 biomes
- Integrate caching with world storage
- Update debug overlay (F3) to show terrain generation stats

### Initialization Updates:
- Initialize new generators during startup
- Wire chunk manager to use terrain-core.js
- Ensure backward compatibility with existing saves

---

## Phase 11: Testing & Optimization

### Verification:
- Same seed + coordinates = identical output every time
- Test across all 4 biomes
- Verify 32-bit seed produces full terrain range

### Performance:
- Chunk generation < 50ms per chunk
- Cache hit rate > 80% for revisited chunks
- Memory usage reasonable with many chunks loaded

### Visual Quality:
- Chunk boundaries seamless (no visible seams)
- Terrain features natural (mountains, valleys, cliffs, lakes)
- Caves look realistic with proper entrances
- Ore veins look geologically plausible
- Water flows naturally

---

## File Changes Summary

### New Files (4):
1. `src/gen/terrain-core.js` — Central terrain engine
2. `src/gen/chunk-grid.js` — Chunk grid manager (12-chunk base)
3. `src/gen/surface-generator.js` — Fractal surface heightmap
4. `src/core/storage.js` — Browser storage cache manager

### Rewritten Files (4):
1. `src/gen/noise.js` — Enhanced fractal noise system
2. `src/gen/cave-generator.js` — Multi-pass cave system
3. `src/gen/ore-generator.js` — Realistic ore distribution
4. `src/gen/water-generator.js` — Realistic water systems

### Updated Files (5):
1. `src/game/biome.js` — Simplified to 4 biomes
2. `src/game/terrain-surface.js` — Biome-appropriate surface layers
3. `src/gen/structure-generator.js` — Updated decoration system
4. `terrain.html` — New UI for 12-chunk grid + simplified biomes
5. `index.html` — Integration with main game

### Documentation:
1. `procedural terrain generation plan.md` — This document

---

## Implementation Order

1. ✅ Write this plan to "procedural terrain generation plan.md"
2. Create infrastructure files (terrain-core.js, chunk-grid.js, storage.js)
3. Implement noise system enhancements
4. Build surface generator with fractal patterns
5. Rewrite cave generator with multi-pass system
6. Rewrite ore generator with realistic distribution
7. Rewrite water generator with rivers/lakes
8. Update biome system to 4 biomes
9. Update surface layers and decoration
10. Implement caching system
11. Update terrain.html
12. Update index.html
13. Test and optimize