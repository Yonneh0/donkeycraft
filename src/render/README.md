# Donkeycraft — Render Module

WebGL 1 rendering subsystem for Donkeycraft. Manages everything from WebGL context creation, shader compilation, terrain mesh generation, and chunk rendering to GUI overlays, lighting, sky, and weather.

## Table of Contents

| # | File | Description |
|---|------|-------------|
| 1 | [gl-context.js](#gl-contextjs) | WebGL 1 context creation and capability queries |
| 2 | [shader-manager.js](#shader-managerjs) | Shader compilation, program linking, uniform caching |
| 3 | [shaders/](#shaders-directory) | GLSL vertex and fragment shader source strings |
| 4 | [camera.js](#camerajs) | First-person camera with position, rotation, projection |
| 5 | [chunk-mesh.js](#chunkmeshjs) | Per-chunk WebGL buffer management and draw calls |
| 6 | [geometry-builder.js](#geometry-builderjs) | Vertex data generation for chunk meshes |
| 7 | [mesh-optimizer.js](#mesh-optimizerjs) | Face culling and vertex deduplication |
| 8 | [terrain-renderer.js](#terrain-rendererjs) | Main terrain rendering loop, frustum culling |
| 9 | [fog.js](#fogjs) | Distance fog with time-based color |
| 10 | [lighting.js](#lightingjs) | Directional sun light, ambient, sky color computation |
| 11 | [sky.js](#skyjs) | Sky dome, sun/moon discs, star field rendering |
| 12 | [gui-renderer.js](#gui-rendererjs) | HUD overlay: crosshair, hotbar, hearts, hunger |
| 13 | [hand-renderer.js](#hand-rendererjs) | First-person held item rendering |
| 14 | [break-particles.js](#break-particlesjs) | Block breaking particle system |
| 15 | [weather.js](#weatherjs) | Weather state management and particle rendering |

---

## gl-context.js

**WebGL 1 context wrapper** with error handling, capability queries, and extension management.

### Constructor
```js
new Donkeycraft.GLContext(canvas)
```
- `canvas` — HTMLCanvasElement to create context from

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getGL()` / `getContext()` | `WebGLRenderingContext` | Get the WebGL 1 context object |
| `isValid()` | `boolean` | True if context is valid and not lost |
| `isContextLost()` | `boolean` | True if context was lost (GPU reset, crash) |
| `getMaxTextureSize()` | `number` | Maximum texture size supported by GPU |
| `getMaxVertexUniforms()` | `number` | Max vertex uniform vectors |
| `isExtensionSupported(name)` | `boolean` | Check if extension is available (caches result) |
| `getExtension(name)` | `Object\|null` | Get cached extension object |
| `getError()` | `number\|null` | First WebGL error code; drains entire error queue |
| `resetErrorCount()` | `void` | Reset internal error counter |
| `getErrorCount()` | `number` | Number of errors detected since last reset |
| `getCapabilities()` | `Object` | Capabilities: maxTextureSize, renderer, vendor, version, etc. |
| `getContextAttributes()` | `GLContextAttributes\|null` | Context attributes (alpha, antialias, depth, preserveDrawingBuffer) |
| `hasContextRestoreSupport()` | `boolean` | True if preserveDrawingBuffer is enabled |
| `setViewport(width, height)` | `void` | Set canvas viewport dimensions |
| `destroy()` | `void` | Destroy context via loseContext(), unbind listeners |

### Events
Listens for `webglcontextlost` and `webglcontextrestored` on the canvas.

---

## shader-manager.js

**Shader compilation, linking, and uniform/location caching.** Creates programs from GLSL source strings.

### Constructor
```js
new Donkeycraft.ShaderManager(gl)
```
- `gl` — WebGLRenderingContext

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `compileShader(source, type)` | `WebGLShader\|null` | Compile a shader ('vertex' or 'fragment') |
| `linkProgram(vertShader, fragShader, attribLocations)` | `WebGLProgram\|null` | Link vertex + fragment shaders into a program |
| `createProgram(name, vertSource, fragSource, attribLocations)` | `WebGLProgram\|null` | Compile + link in one call, cache by name |
| `createProgramsFromDOM()` | `Object\|null` | Parse DOM `<script>` tags, create 'terrain', 'sky', 'gui', 'break' programs |
| `use(name)` | `boolean` | Activate a cached program by name |
| `useProgram(program)` | `boolean` | Activate a program directly |
| `setMat4(name, value)` | `boolean` | Set mat4 uniform (value must have getData()) |
| `setVec3(name, x, y, z)` | `boolean` | Set vec3 uniform |
| `setVec4(name, x, y, z, w)` | `boolean` | Set vec4 uniform |
| `setVec2(name, x, y)` | `boolean` | Set vec2 uniform |
| `setFloat(name, value)` | `boolean` | Set float uniform |
| `setInt(name, value)` | `boolean` | Set integer uniform |
| `setSampler(name, unit)` | `boolean` | Set texture sampler (default unit 0) |
| `getAttribute(name)` | `number` | Get attribute location index (-1 if not found) |
| `getUniformLocation(name)` | `WebGLUniformLocation\|null` | Get uniform location |
| `getProgram(name)` | `WebGLProgram\|null` | Get cached program by name |
| `getStats()` | `{shaders: number, programs: number}` | Compilation statistics |
| `destroy()` | `void` | Delete all programs and clear caches |

---

## shaders/ Directory

GLSL shader source strings stored in JavaScript template literals.

### fragment-shaders.glsl

| Shader Variable | Usage |
|-----------------|-------|
| `TERRAIN_FRAGMENT_SHADER` | Terrain lighting, fog, texture sampling |
| `FOG_FRAGMENT_SHADER` | Solid color fog pass |
| `GUI_FRAGMENT_SHADER` | HUD, particles |
| `SKY_FRAGMENT_SHADER` | Sky dome gradient |
| `HAND_FRAGMENT_SHADER` | Reserved for future hand/item rendering |
| `PARTICLE_FRAGMENT_SHADER` | Reserved for future particle rendering |

### vertex-shaders.glsl

| Shader Variable | Usage |
|-----------------|-------|
| `TERRAIN_VERTEX_SHADER` | Terrain vertex transformation, fog depth |
| `BREAK_VERTEX_SHADER` | Block breaking particles (billboard quads) |
| `GUI_VERTEX_SHADER` | HUD overlay rendering |
| `SKY_VERTEX_SHADER` | Sky dome positioning |
| `HAND_VERTEX_SHADER` | Reserved for future hand/item rendering |

### Common Uniforms

**Terrain program:** `uProjection`, `uView`, `uModel`, `uTexture`, `uFogColor`, `uFogDensity`, `uLightFactor`
**GUI/Break program:** `uProjection`, `uView`, `uModel`, `uTexture`, `uHasTexture`
**Sky program:** `uProjection`, `uView`, `uTopColor`, `uBottomColor`, `uHorizon`

### Common Attributes

**Terrain:** `aPosition`, `aUV`, `aNormal`, `aLight`
**GUI/Break:** `aPosition`, `aUV`, `aColor`

---

## camera.js

**First-person camera** with position, rotation, and projection matrix.

### Constructor
```js
new Donkeycraft.Camera(fov, near, far)
```
- `fov` — Field of view in degrees (default: 60)
- `near` — Near clipping plane (default: 0.1)
- `far` — Far clipping plane (default: 1000)

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getPosition()` | `Vector3` | Get camera position |
| `setPosition(x, y, z)` | `void` | Set camera position |
| `getYaw()` / `getPitch()` | `number` | Get rotation angles in radians |
| `setRotation(yaw, pitch)` | `void` | Set camera rotation |
| `applyMouseDelta(deltaX, deltaY, sensitivity)` | `void` | Apply mouse movement to rotation |
| `getForward()` | `Vector3` | Horizontal forward vector (Y=0, walking) |
| `getForward3D()` | `Vector3` | Full 3D forward vector (flying) |
| `getRight()` | `Vector3` | Horizontal right vector (Y=0) |
| `getUp()` | `Vector3` | Up vector (always [0,1,0]) |
| `getTarget()` | `Vector3` | Position + forward direction |
| `getProjection()` | `Matrix4` | Get/update projection matrix |
| `getView()` | `Matrix4` | Get/update view matrix |
| `getMatrices()` | `{view, projection}` | Get both matrices |
| `setAspect(aspect)` / `getAspect()` | `void`/`number` | Set/get viewport aspect ratio |
| `moveForward(amount)` | `void` | Move horizontally (walking) |
| `moveForward3D(amount)` | `void` | Move with pitch (flying) |
| `moveRight(amount)` | `void` | Strafe horizontally (walking) |
| `moveRight3D(amount)` | `void` | Strafe horizontally (flying) |
| `moveUp(amount)` | `void` | Move vertically |
| `reset()` | `void` | Reset to default position [0, 64, 0] |

---

## chunk-mesh.js

**Per-chunk WebGL buffer management.** Handles vertex/index buffers, dirty tracking, and draw calls.

### Constructor
```js
new Donkeycraft.ChunkMesh(gl, shaderManager)
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `update(geometry)` | `void` | Set geometry data (vertices, indices, counts) |
| `uploadBuffers()` | `boolean` | Upload geometry to GPU buffers |
| `draw()` | `boolean` | Bind attributes and call drawElements |
| `isDirty()` | `boolean` | True if buffers need updating |
| `markDirty()` / `markClean()` | `void` | Set/clear dirty flag |
| `getIndexCount()` / `getVertexCount()` | `number` | Get index/vertex counts |
| `destroy()` | `void` | Delete GPU buffers and free resources |

### Properties
- `_supportsUint32Indices` — True if OES_element_index_uint extension is available
- `_geometryUsesUint32` — Whether current geometry uses Uint32 indices

---

## geometry-builder.js

**Vertex data generation** for chunk meshes. Builds position, UV, normal, and light arrays.

### Constructor
```js
new Donkeycraft.GeometryBuilder()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `buildChunk(chunkX, chunkZ, getBlockFunc)` | `{vertices, indices, vertexCount, indexCount}` | Build full chunk geometry with face culling |
| `buildQuad(size, y)` | `{vertices, indices, ...}` | Build a simple test quad |
| `buildCube(size, y)` | `{vertices, indices, ...}` | Build a simple test cube (24 verts) |
| `isTransparent(blockId)` | `boolean` | Check if block is transparent (delegates to BlockTypes) |

### Face Definitions
Six directional faces with baked light intensities: `+X`(0.8), `-X`(0.7), `+Y`(1.0), `-Y`(0.5), `+Z`(0.9), `-Z`(0.6).

---

## mesh-optimizer.js

**Mesh optimization** via face culling and vertex deduplication.

### Constructor
```js
new Donkeycraft.MeshOptimizer()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `generateIndexBuffer(geometry, epsilon)` | `{vertices, indices, ...}` | Deduplicate vertices using hash-based lookup |
| `cullBackFaces(geometry, cameraPos)` | `{vertices, indices, ...}` | Remove faces with normals pointing away from camera |
| `optimize(geometry, cameraPos)` | `{vertices, indices, ...}` | Run all optimization passes |

### Notes
- `generateIndexBuffer` preserves the original index type (Uint16Array or Uint32Array)
- `cullBackFaces` always returns Uint32Array to handle large triangle counts
- Position + normal + light used as hash key (UV excluded for vertex merging)

---

## terrain-renderer.js

**Main terrain rendering.** Manages chunk iteration, frustum culling, batched draws.

### Constructor
```js
new Donkeycraft.TerrainRenderer(gl, shaderManager, fog, lighting)
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `setWorldData(getBlockFunc)` | `void` | Set world block getter function |
| `setCamera(camera)` | `void` | Set camera for back-face culling |
| `setLighting(lighting)` | `void` | Set lighting system for time-of-day |
| `setTextureAtlas(atlas)` | `void` | Set texture atlas for terrain textures |
| `getLighting()` | `Lighting\|null` | Get current lighting instance |
| `setRenderDistance(distance)` | `void` | Set render distance in chunks |
| `getRenderDistance()` | `number` | Get current render distance |
| `markChunkDirty(chunkX, chunkZ)` | `void` | Mark chunk for rebuild |
| `updateChunks(playerChunkX, playerChunkZ)` | `void` | Update all visible chunks |
| `rebuildChunk(chunkX, chunkZ)` | `void` | Force rebuild a specific chunk |
| `render(camera)` | `void` | Render all visible chunks |
| `getChunkCount()` | `number` | Get number of active chunks |
| `getRenderStats()` | `{chunksRendered, meshesBuilt, drawCalls}` | Get render statistics |
| `destroy()` | `void` | Destroy all chunk meshes |

### Frustum Culling
Automatically extracts frustum planes from view-projection matrix and culls chunks outside the view volume. Uses AABB-vs-frustum intersection test.

---

## fog.js

**Distance fog** with exponential attenuation and time-based color.

### Constructor
```js
new Donkeycraft.Fog()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `setDensity(density)` / `getDensity()` | `void`/`number` | Set/get fog density (default: 0.015) |
| `setEnabled(enabled)` / `isEnabled()` | `void`/`boolean` | Enable/disable fog |
| `setColor(r, g, b)` | `void` | Set fog color [0,1] |
| `getColor()` | `{r,g,b}` | Get current fog color |
| `updateFromSky(skyColor)` | `void` | Sync fog color from lighting sky color |
| `applyToFogUniforms(shaderManager)` | `boolean` | Set uFogColor and uFogDensity uniforms |

---

## lighting.js

**Dynamic lighting** — sun intensity, ambient light, sky color based on world time of day.

### Constructor
```js
new Donkeycraft.Lighting()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `setTimeOfDay(t)` / `getTimeOfDay()` | `void`/`number` | Set/get time [0,1). 0.25=sunrise, 0.5=noon, 0.75=sunset |
| `getSunIntensity()` | `number` | Sun intensity [0,1]. 1.0 at noon, 0.0 at midnight |
| `getAmbientLight()` | `number` | Ambient level [0.08, 1.0] |
| `getSkyColor()` | `{r,g,b}` | Sky color with smooth piecewise interpolation |
| `getSunDirection()` | `Vector3` | Normalized sun direction vector |
| `applyToShader(shaderManager)` | `boolean` | Set uLightFactor uniform (sunIntensity × ambient) |

### Sky Color Keyframes
Smooth interpolation between: midnight → pre-dawn → sunrise → morning → midday → sunset → dusk → midnight.

---

## sky.js

**Sky rendering** — dome, sun disc, moon disc, star field.

### Constructor
```js
new Donkeycraft.Sky(gl, shaderManager)
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `setTimeOfDay(t)` / `getTimeOfDay()` | `void`/`number` | Set/get time of day |
| `setStarsVisible(visible)` / `getStarsVisible()` | `void`/`boolean` | Toggle star visibility |
| `setSunMoonVisible(visible)` / `getSunMoonVisible()` | `void`/`boolean` | Toggle sun/moon visibility |
| `render(camera, lighting)` | `void` | Render sky dome, sun, moon, stars |
| `destroy()` | `void` | Free GPU resources |

### Rendering Details
- **Sky dome**: 16×8 hemisphere segments, radius 400, depthMask(false)
- **Sun disc**: 12-segment circle, radius 8, intensity-based alpha
- **Moon disc**: 12-segment circle, radius 5, opposite sun direction
- **Stars**: 500 point sprites on upper hemisphere, seeded PRNG for reproducibility

---

## gui-renderer.js

**HUD overlay** — crosshair, hotbar, health hearts, hunger drumsticks.

### Constructor
```js
new Donkeycraft.GUIRenderer(gl, shaderManager)
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `renderCrosshair(canvasWidth, canvasHeight)` | `void` | Draw centered crosshair |
| `renderHotbar(selectedSlot, canvasWidth, canvasHeight)` | `void` | Draw hotbar with selected slot highlight |
| `renderHearts(health, maxHealth, canvasWidth, canvasHeight)` | `void` | Draw health hearts row (0–20) |
| `renderHunger(food, maxFood, canvasWidth, canvasHeight)` | `void` | Draw hunger drumsticks row (0–20) |
| `renderDebugInfo(debugInfo, canvasWidth, canvasHeight)` | `void` | No-op (HTML overlay handles this) |
| `renderAll(state, canvasWidth, canvasHeight)` | `void` | Render all HUD elements in order |
| `destroy()` | `void` | Free GPU resources |

### renderAll State Object
```js
{
  hearts: true,      // Render hearts (default true)
  hunger: true,      // Render hunger (default true)
  hotbar: true,      // Render hotbar (default true)
  crosshair: true,   // Render crosshair (default true)
  health: 20,        // Health value (0-20)
  maxHealth: 20,     // Max health
  food: 20,          // Food value (0-20)
  maxFood: 20,       // Max food
  selectedSlot: 0    // Selected hotbar slot (0-8)
}
```

---

## hand-renderer.js

**First-person held item** rendering in bottom-right corner.

### Constructor
```js
new Donkeycraft.HandRenderer(gl, shaderManager)
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `setHeldItem(itemId)` / `getHeldItem()` | `void`/`number` | Set/get held item ID |
| `setBobAngle(angle)` / `getBobAngle()` | `void`/`number` | Set/get bob animation angle |
| `render(camera, canvasWidth, canvasHeight)` | `void` | Render held item with bob animation |
| `destroy()` | `void` | Free GPU resources |

### Animation
Subtle sinusoidal bob: Y oscillation at `sin(angle)`, X sway at `cos(angle*0.5)`, rotation sway at `sin(angle*0.3)`.

---

## break-particles.js

**Block breaking particle system** — spawn, physics update, billboard quad rendering.

### Constructor
```js
new Donkeycraft.BreakParticles(gl, shaderManager)
```

### Classes

#### BreakParticle
Individual particle with position (x,y,z), velocity (vx,vy,vz), RGB color, and lifetime.

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `spawn(x, y, z, blockId)` | `void` | Spawn 8 particles for a broken block |
| `update(deltaTime, gravity)` | `void` | Physics simulation (velocity + gravity) |
| `render(camera)` | `void` | Render all active particles as billboard quads |
| `clear()` | `void` | Remove all particles |
| `getCount()` / `getMaxCount()` | `number` | Active / max particle count |
| `destroy()` | `void` | Free GPU vertex buffer |

### Details
- Pre-allocated vertex buffer: 256 particles × 6 verts × 9 floats = 432 floats
- Gravity default: -15.0 blocks/s²
- Particle colors derived from BlockRegistry or fallback palette
- Particles fade out over 0.5–1.0 second lifetime

---

## weather.js

**Weather system** — state management, duration, biome restrictions, and particle rendering.

### Constants
```js
Donkeycraft.WEATHER_CLEAR   // 'clear'
Donkeycraft.WEATHER_RAIN    // 'rain'
Donkeycraft.WEATHER_THUNDER // 'thunder'
Donkeycraft.WEATHER_SNOW    // 'snow'
```

### Weather (State Management)

#### Constructor
```js
new Donkeycraft.Weather()
```

| Method | Returns | Description |
|--------|---------|-------------|
| `setWeather(state)` | `void` | Set weather state |
| `getWeather()` | `string` | Get current state |
| `isRaining()` / `isThundering()` / `isSnowing()` | `boolean` | Check weather types |
| `getWeatherDuration()` | `number` | Ticks remaining until change |
| `setWeatherDuration(duration)` | `void` | Set duration in ticks |
| `getThunderIntensity()` / `setThunderIntensity(intensity)` | `number`/`void` | Thunder intensity [0,1] |
| `getParticleDensity()` | `number` | Particle density [0,1] |
| `tick(biomeAtPlayer)` | `void` | Advance timer, check for weather change |
| `shouldChangeWeather(biomeAtPlayer)` | `boolean` | 5% random chance after 100 ticks |
| `changeToRandomWeather(biomeAtPlayer)` | `void` | Weighted random selection |
| `getBiomeWeather(biomeId)` | `{canRain, canSnow}` | Default biome restrictions |
| `getBiomeWeatherRestrictions(biomeId)` | `{canRain, canSnow}` | Including custom registrations |
| `setBiomeWeatherRestriction(biomeId, permissions)` | `void` | Register custom restrictions |
| `forceChange(state)` / `clear()` | `void` | Immediate weather change/clear |
| `serialize()` / `deserialize(data)` | `Object`/`this` | State serialization |
| `destroy()` | `void` | Reset to defaults |

### WeatherRenderer (Particle Rendering)

#### Constructor
```js
new Donkeycraft.WeatherRenderer(gl, shaderManager)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `activate()` / `deactivate()` | `void` | Enable/disable weather rendering |
| `spawnInitialParticles(count)` | `void` | Spawn N particles at random positions |
| `update(deltaTime, playerPos)` | `void` | Update particle physics and respawn |
| `render(camera, particleDensity, type)` | `boolean` | Render particles as billboard quads |
| `getParticleCount()` | `number` | Active particle count |
| `destroy()` | `void` | Free GPU resources |

### Details
- Max 2000 particles (Structure of Arrays layout)
- Rain: fast fall (-8 to -12 blocks/s), slight wind toward +Z
- Snow: slow fall (-0.5 to -1.0), gentle drift
- Particles respawn at y=128 when below y=0 or >60 blocks horizontally from player
- Fade-in over 0.2s to prevent popping

---

## Architecture Overview

```
game.js
  │
  ├─ GLContext          → WebGL 1 context wrapper
  ├─ ShaderManager      → Compiles terrain/sky/gui/break programs
  │     └─ shaders/     → GLSL source strings
  │
  ├─ Camera             → Position, rotation, projection
  │
  ├─ TerrainRenderer    → Chunk iteration, frustum culling, batched draws
  │     ├─ ChunkMesh    → Per-chunk buffers (VAO-free attribute binding)
  │     ├─ GeometryBuilder → Vertex data generation
  │     └─ MeshOptimizer → Face culling + vertex deduplication
  │
  ├─ Fog                → Exponential distance fog uniforms
  ├─ Lighting           → Time-of-day sun/ambient/sky color
  ├─ Sky                → Dome, sun, moon, stars
  │
  ├─ GUIRenderer        → HUD overlay (crosshair, hotbar, hearts, hunger)
  ├─ HandRenderer       → First-person held item
  ├─ BreakParticles     → Block breaking VFX
  └─ WeatherRenderer    → Rain/snow particles
```

All renderers use **manual attribute binding** (no VAOs in WebGL 1) and handle **WebGL context loss/restoration** via canvas event listeners. Vertex buffers are pre-allocated or lazily created to minimize per-frame GC pressure.