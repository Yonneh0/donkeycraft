# Donkeycraft Core API Reference

Quick-reference guide for all core modules. Designed for AI assistant RAG — each section is self-contained so assistants don't need to scan individual source files.

## Table of Contents

- [namespace.js](#namespacejs)
- [eventbus.js](#eventbusjs)
- [config.js](#configjs)
- [logger.js](#loggerjs)
- [timer.js](#timerjs)
- [input.js](#inputjs)
- [math-utils.js](#math-utilsjs)
- [audio.js](#audiojs)
- [init-sequence.js](#init-sequencejs)
- [cache.js](#cachejs)
- [level-data.js](#level-datajs)
- [world-store.js](#world-storejs)

---

## namespace.js

**Purpose:** Registers the global `window.Donkeycraft` namespace object. All public classes, constants, and utilities attach to this namespace via IIFE pattern. Defensive against double-loading.

### Static Properties

| Property | Type | Description |
|----------|------|-------------|
| `Donkeycraft.VERSION` | `string` | Semantic version (e.g., `'0.1.0'`) |
| `Donkeycraft.NAME` | `string` | Display name (`'Donkeycraft'`) |
| `Donkeycraft.systems` | `Object` | Runtime system registry, populated during async init |
| `Donkeycraft.isRunning` | `boolean` | `true` when main game loop is active |

---

## eventbus.js

**Purpose:** Publish/subscribe event system for decoupled communication between systems. Supports namespaced events, one-time listeners, and safe static emission.

### Constructor

```js
new Donkeycraft.EventBus(namespace)
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `namespace` | `string` | `''` | Optional namespace prefix for all events |

### Instance Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `on(event, callback, context)` | `(string, Function, \*) → Function` | Register listener. Returns **unsubscribe** function. |
| `once(event, callback, context)` | `(string, Function, \*) → Function` | One-time listener. Returns unsubscribe function. |
| `off(event, callback)` | `(string, Function) → void` | Remove a previously registered listener. |
| `emit(event, ...args)` | `(string, ...*) → void` | Dispatch event to all listeners (in registration order). Exceptions are caught and logged. |
| `clear()` | `() → void` | Remove all listeners. |

### Static Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `emitSafe(event, ...args)` | `(string, ...*) → void` | Safely emit on the globally-registered EventBus (set via `setGlobal()`). No namespace prefix. |
| `setGlobal(instance)` | `(EventBus) → void` | Register the global EventBus instance for `emitSafe()`. |

### Events Emitted

Examples: `'init:phase:start'`, `'init:phase:end'`, `'init:complete'`, `'init:error'`, `'world:saved'`, `'world:loaded'`, etc. (domain-specific).

---

## config.js

**Purpose:** Global game configuration object. All values are constants — do not modify at runtime. Loaded once during initialization.

### Key Constants

```js
var C = Donkeycraft.Config;
```

| Constant | Value | Description |
|----------|-------|-------------|
| `C.CHUNK_SIZE` | `16` | Chunks are 16×16 blocks |
| `C.WORLD_HEIGHT` | `256` | Total world height (Y: 0–255) |
| `C.RENDER_DISTANCE` | `8` | Default render radius in chunks |
| `C.MAX_RENDER_DISTANCE` | `12` | Hard cap on render distance |
| `C.SEED` | `42` | Default world seed |
| `C.GAME_TICKS_PER_SECOND` | `20` | Game logic tick rate |
| `C.RENDER_FPS_TARGET` | `60` | Target render FPS |
| `C.AUTO_SAVE_INTERVAL` | `30000` | Auto-save every 30 seconds (ms) |
| `C.PLAYER_HEIGHT` | `1.8` | Player height in blocks |
| `C.PLAYER_WIDTH` | `0.6` | Player width in blocks |
| `C.PLAYER_EYE_HEIGHT` | `1.62` | Eye height for raycasting |
| `C.PLAYER_SPEED` | `5.0` | Walking speed (blocks/sec) |
| `C.PLAYER_SPRINT_SPEED` | `7.8` | Sprinting speed (blocks/sec) |
| `C.PLAYER_FLY_SPEED` | `5.0` | Creative fly speed |
| `C.PLAYER_FLY_SPEED_BOOST` | `10.0` | Creative fly speed with sprint |
| `C.PLAYER_JUMP_FORCE` | `5.0` | Jump velocity (blocks/s) — gives ~0.6 block jump height with GRAVITY=-20 |
| `C.PLAYER_REACH` | `6.0` | Block interaction reach distance |
| `C.FOV` | `70` | Field of view (degrees) |
| `C.MOUSE_SENSITIVITY` | `0.01` | Mouse look sensitivity |
| `C.MOUSE_SCROLL_SENSITIVITY` | `1` | Hotbar scroll sensitivity |
| `C.GRAVITY` | `-20.0` | Gravity acceleration (blocks/s²) |
| `C.TERMINAL_VELOCITY` | `-40.0` | Max fall speed (blocks/s) |
| `C.FLYING_TERMINAL_VELOCITY` | `-20.0` | Max downward fly speed (blocks/s) |
| `C.FLY_BASELINE_FPS` | `60` | Delta-time normalization baseline for flying movement |
| `C.SWIM_BOOST` | `0.15` | Upward velocity boost when swimming with jump (blocks/s) |
| `C.JUMP_COOLDOWN` | `0.1` | Cooldown between jumps (seconds) |
| `C.FALL_DAMAGE_THRESHOLD` | `3` | Blocks of free fall before damage begins |
| `C.WORLD_TIME_SCALE` | `60` | Ticks per second for time-of-day (60s = full day cycle) |
| `C.CHUNKS_PER_SAVE` | `4` | Chunks to save per batch |
| `C.LEVEL_DATA_AUTO_SAVE_INTERVAL` | `60000` | Level data auto-save interval (ms) |
| `C.ASSET_CACHE_VERSION` | `1` | Asset cache version (increment to invalidate) |
| `C.ASSET_CACHE_MAX_AGE_MS` | `86400000` | 24 hours — expired entries cleared on quota |
| `C.NETHER_SCALE` | `8` | Overworld coords / 8 = Nether coords (and vice versa) |
| `C.END_SCALE` | `1` | Overworld coords × 1 = End coords |
| `C.NETHER_HEIGHT` | `128` | Nether world height (Y: 0–127) |
| `C.END_HEIGHT` | `256` | End world height (Y: 0–255) |

### Keybinds

```js
C.KEYBINDS = {
    MOVE_FORWARD: 'KeyW',     MOVE_BACKWARD: 'KeyS',
    MOVE_LEFT: 'KeyA',        MOVE_RIGHT: 'KeyD',
    JUMP: 'Space',            SPRINT: 'ShiftLeft',
    SNEAK: 'ControlLeft',     INVENTORY: 'KeyE',
    DEBUG_SCREEN: 'F3',       FLY_TOGGLE: 'KeyF',
    DROP_ITEM: 'KeyQ',
    PICK_ITEM_1: 'Digit1', ... PICK_ITEM_9: 'Digit9'
};
```

---

## logger.js

**Purpose:** Tiered logging system with debug/info/warn/error levels and tag toggle.

### LogLevel Enum

```js
Donkeycraft.LogLevel.DEBUG   // 0 — show all
Donkeycraft.LogLevel.INFO    // 1 — default
Donkeycraft.LogLevel.WARN    // 2
Donkeycraft.LogLevel.ERROR   // 3
Donkeycraft.LogLevel.SILENT  // 4 — no output
```

### Static Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `setLevel(level)` | `(LogLevel) → boolean` | `true` if changed | Set minimum log level |
| `getLevel()` | `() → LogLevel` | Active log level | Get current level |
| `setSilent(enabled)` | `(boolean) → boolean` | State change result | Silence or restore all logs |
| `isSilent()` | `() → boolean` | `true` if SILENT | Check if silenced |
| `resetLevel()` | `() → LogLevel` | `INFO` | Reset to default level |
| `setTagEnabled(enabled)` | `(boolean) → boolean` | New state | Show/hide `[Donkeycraft]` tag |
| `getTagEnabled()` | `() → boolean` | `true` if enabled | Check tag status |
| `debug(...args)` | `(...*) → void` | — | Log debug message |
| `info(...args)` | `(...*) → void` | — | Log info message |
| `warn(...args)` | `(...*) → void` | — | Log warning message |
| `error(...args)` | `(...*) → void` | — | Log error message |

### Usage

```js
Donkeycraft.Logger.setLevel(Donkeycraft.LogLevel.DEBUG);
Donkeycraft.Logger.info('World loaded at seed', seed);
Donkeycraft.Logger.warn('[Chunk] Failed to load:', chunkKey);
```

---

## timer.js

**Purpose:** Delta-time accumulator and game tick scheduler. Manages fixed-timestep game logic (20 TPS) alongside variable-framerate rendering.

### Constructor

```js
new Donkeycraft.Timer(ticksPerSecond)  // default: 20
```

### Instance Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `onTick(callback)` | `(Function) → Function` | unsubscribe | Called each game tick: `callback(dt, tickCount)` |
| `onRender(callback)` | `(Function) → Function` | unsubscribe | Called each frame: `callback(dt)` |
| `start()` | `() → void` | — | Start the timer loop |
| `stop()` | `() → void` | — | Stop the timer loop |
| `getDeltaTime()` | `() → number` | seconds | Current delta time (capped at 100ms) |
| `getFPS()` | `() → number` | FPS | Current frames per second |
| `getTickCount()` | `() → number` | count | Total game ticks elapsed |
| `getFrameCount()` | `() → number` | count | Total frames since creation |
| `destroy()` | `() → void` | — | Stop loop, clear callbacks, free resources |

### Usage

```js
var timer = new Donkeycraft.Timer(20);
timer.onTick(function(dt, tick) { /* game logic */ });
timer.onRender(function(dt) { /* render */ });
timer.start();
```

---

## input.js

**Purpose:** Keyboard/mouse input handler. Tracks key states, mouse delta (pointer lock), wheel scroll, and button press events.

### Constructor

```js
var input = new Donkeycraft.Input();
```

### Mouse Capture

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `captureMouse(element)` | `(HTMLElement) → void` | — | Request pointer lock on element |
| `releaseMouse()` | `() → void` | — | Release pointer lock |
| `isMouseCaptured()` | `() → boolean` | `true` if locked | Check capture state |

### Keyboard Input

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `isKeyDown(keyCode)` | `(string) → boolean` | held? | Is key currently held? (e.g., `'KeyW'`) |
| `isKeyJustPressed(keyCode)` | `(string) → boolean` | just pressed? | Was key pressed this frame |
| `updateKeyStates()` | `() → void` | — | Call at start of each frame |

### Mouse Button Input

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `isMouseButtonPressed(button)` | `('left'\|'right'\|'middle') → boolean` | held? | Is button currently held? |
| `isMouseButtonJustPressed(button)` | `('left'\|'right'\|'middle') → boolean` | just pressed? | Was button pressed this frame |
| `updateMouseButtonStates()` | `() → void` | — | Call at start of each frame |

### Mouse Position & Delta

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getMouseState()` | `() → Object` | state | `{left, right, middle, x, y, deltaX, deltaY}` |
| `getMouseDelta()` | `() → {deltaX, deltaY}` | delta | Accumulated mouse delta (auto-resets) |
| `resetMouseDelta()` | `() → void` | — | Reset delta to zero without reading |

### Wheel Input

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getWheelDelta()` | `() → number` | delta | Accumulated wheel Y delta (auto-resets) |

### Cleanup

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `destroy()` | `() → void` | — | Remove all listeners, release pointer lock, clear state |

### Usage

```js
input.updateKeyStates();
input.updateMouseButtonStates();
if (input.isKeyDown(Donkeycraft.Config.KEYBINDS.MOVE_FORWARD)) { /* move */ }
var delta = input.getMouseDelta(); // auto-resets
```

---

## math-utils.js

**Purpose:** Vector3, Matrix4, Quaternion classes, Perlin noise functions, and utility helpers. All methods that mutate return `this` for chaining.

### Vector3

```js
var v = new Donkeycraft.Vector3(x, y, z);  // defaults: 0, 0, 0
```

| Static Factory | Returns | Description |
|----------------|---------|-------------|
| `Vector3.zero()` | `Vector3` | `(0, 0, 0)` |
| `Vector3.one()` | `Vector3` | `(1, 1, 1)` |
| `Vector3.copy(v)` | `Vector3` | Shallow copy |
| `Vector3.fromArray(arr)` | `Vector3` | From `[x, y, z]` |
| `Vector3.lerp(a, b, t)` | `Vector3` | Linear interpolation |
| `Vector3.fromSpherical(length, phi, theta)` | `Vector3` | Spherical → Cartesian (phi from +Y) |

| Instance Method | Returns | Description |
|-----------------|---------|-------------|
| `v.set(x, y, z)` | `this` | Set components |
| `v.add(v2)` | `this` | Add vector |
| `v.sub(v2)` | `this` | Subtract vector |
| `v.scale(s)` | `this` | Multiply by scalar |
| `v.dot(v2)` | `number` | Dot product |
| `v.cross(v2)` | `this` | Cross product |
| `v.lengthSq()` | `number` | Length squared |
| `v.length()` | `number` | Magnitude |
| `v.normalize()` | `this` | Normalize in place |
| `v.normalized()` | `Vector3` | Normalized copy |
| `v.distanceTo(v2)` | `number` | Euclidean distance |
| `v.distanceToSq(v2)` | `number` | Distance squared |
| `v.floor()` | `this` | Floor components |
| `v.equals(v2, epsilon)` | `boolean` | Approximate equality (default ε=0.001) |
| `v.isZero()` | `boolean` | All components zero |

### Matrix4

```js
var m = new Donkeycraft.Matrix4(Float32Array(16));  // column-major
```

| Static Factory | Signature | Returns | Description |
|----------------|-----------|---------|-------------|
| `Matrix4.createIdentity()` | — | `Matrix4` | Identity matrix |
| `Matrix4.createPerspective(fov, aspect, near, far)` | — | `Matrix4` | Perspective projection |
| `Matrix4.createOrthographic(left, right, bottom, top, near, far)` | — | `Matrix4` | Orthographic projection |
| `Matrix4.createLookAt(eye, target, up)` | — | `Matrix4` | View matrix |
| `Matrix4.createTranslation(x, y, z)` | — | `Matrix4` | Translation |
| `Matrix4.createScale(x, y, z)` | — | `Matrix4` | Scale |
| `Matrix4.createRotation(angle, axis)` | — | `Matrix4` | Rotation around axis |
| `Matrix4.multiply(a, b)` | `(Matrix4, Matrix4) → Matrix4` | Product `a × b` |

| Instance Method | Returns | Description |
|-----------------|---------|-------------|
| `m.multiply(m2)` | `this` (new) | Post-multiply |
| `m.transformVector(v, w)` | `Vector3` | Transform vector (w=0 direction, w=1 position) |
| `m.getData()` | `Float32Array` | Raw column-major data |
| `m.clone()` | `Matrix4` | Deep copy |
| `m.transpose()` | `this` | Transpose in place |
| `m.invert()` | `Matrix4` | Inverse (new matrix) |
| `m.getInverse()` | `Matrix4` | Alias for `invert()` |

### Quaternion

```js
var q = new Donkeycraft.Quaternion(x, y, z, w);  // defaults: 0, 0, 0, 1
```

| Static Factory | Signature | Returns | Description |
|----------------|-----------|---------|-------------|
| `Quaternion.identity()` | — | `Quaternion` | `(0, 0, 0, 1)` |
| `Quaternion.fromAxisAngle(axis, angle)` | — | `Quaternion` | Axis-angle rotation |
| `Quaternion.fromEuler(yaw, pitch, roll)` | — | `Quaternion` | Euler angles (YXZ order) |
| `Quaternion.slerp(a, b, t)` | — | `Quaternion` | Spherical linear interpolation |

| Instance Method | Returns | Description |
|-----------------|---------|-------------|
| `q.multiply(q2)` | `Quaternion` | Quaternion product |
| `q.applyToVector(v)` | `Vector3` | Rotate vector |
| `q.toEuler()` | `{yaw, pitch, roll}` | Euler angles (YXZ) |
| `q.conjugate()` | `Quaternion` | Conjugate |
| `q.inverse()` | `Quaternion` | Inverse (assumes unit) |
| `q.normalize()` | `this` | Normalize in place |
| `q.normalized()` | `Quaternion` | Normalized copy |
| `q.clone()` | `Quaternion` | Deep copy |

### PerlinNoise

```js
// Seeded during init-sequence.js; do not seed manually.
Donkeycraft.PerlinNoise.init(seed);  // default seed: 42
```

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `PerlinNoise.init(seed)` | `(number) → void` | — | Re-seed the noise generator |
| `PerlinNoise.noise1D(x)` | `(number) → number` | [-1, 1] | 1D Perlin noise |
| `PerlinNoise.noise2D(x, y)` | `(number, number) → number` | [-1, 1] | 2D Perlin noise |
| `PerlinNoise.noise3D(x, y, z)` | `(number, number, number) → number` | [-1, 1] | 3D Perlin noise |
| `PerlinNoise.fbm(x, y, z, octaves, persistence, lacunarity)` | — | [-1, 1] | Fractal Brownian Motion |

### Utility Functions

| Function | Signature | Returns | Description |
|----------|-----------|---------|-------------|
| `Donkeycraft.lerp(a, b, t)` | `(number, number, number) → number` | interpolated | Linear interpolation [0, 1] |
| `Donkeycraft.clamp(v, min, max)` | `(number, number, number) → number` | clamped | Clamp value to range |
| `Donkeycraft.map(v, inMin, inMax, outMin, outMax)` | — | mapped | Range remapping |
| `Donkeycraft.round(n)` | `(number) → number` | rounded | Round to nearest integer |
| `Donkeycraft.inRange(v, min, max)` | `(number, number, number) → boolean` | bool | Check if within range |

---

## audio.js

**Purpose:** Web Audio API wrapper for sound playback, music, ambient sounds, and positional (spatial) audio.

### Constructor

```js
var audio = new Donkeycraft.AudioSystem();
```

### Instance Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | `() → Promise` | resolves | Initialize AudioContext (must be called from user gesture) |
| `setVolume(volume)` | `(number) → void` | — | Set master volume 0.0–1.0 |
| `getVolume()` | `() → number` | volume | Get current master volume |
| `setEnabled(enabled)` | `(boolean) → void` | — | Enable/disable all audio |
| `resumeContext()` | `() → Promise<boolean>` | resumed? | Resume suspended AudioContext (call after user gesture on mobile browsers) |
| `isReady()` | `() → boolean` | ready? | True if context is initialized and running |
| `loadSound(name, source)` | `(string, string\|ArrayBuffer) → Promise` | resolves | Load sound from URL or ArrayBuffer |
| `play(name, options)` | `(string, Object) → AudioBufferSourceNode\|void` | source node | Play a cached sound |
| `stop(source)` | `(AudioBufferSourceNode) → void` | — | Stop a playing sound source |
| `preload(sounds)` | `({name, url}[]) → Promise` | resolves | Preload multiple sounds |
| `destroy()` | `() → Promise` | resolves | Close AudioContext, free resources |

### `play()` Options

```js
audio.play('step', {
    volume: 0.5,           // 0–1, default 1
    pitch: 1.0,            // playback rate multiplier, default 1
    loop: false,           // loop playback
    maxDistance: 16,       // for positional audio falloff
    position: new Donkeycraft.Vector3(x, y, z)  // spatial audio source position
});
```

### Usage

```js
var audio = systems.audioSystem;
audio.setVolume(0.7);
audio.play('block_break', { volume: 0.8, pitch: 1.2 });
```

---

## init-sequence.js

**Purpose:** Orchestrates the async initialization pipeline. Runs phases sequentially: config → texture-atlas → audio → indexeddb. Emits lifecycle events for LoadingScreen integration.

### Constructor

```js
var init = new Donkeycraft.InitSequence(config);  // defaults to window.Donkeycraft.Config
```

### Instance Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `initialize()` | `() → Promise<Object>` | `{config, eventBus, ...}` | Run full async pipeline |
| `getPhase()` | `() → string` | phase name | Current/last phase: `'config'`, `'texture-atlas'`, `'audio'`, `'indexeddb'`, `'none'` |
| `getSystems()` | `() → Object\|null` | systems or null | Returned systems object, or null before init completes |
| `on(eventName, callback)` | `(string, Function) → Function` | unsubscribe | Subscribe to lifecycle events |
| `destroy()` | `() → void` | — | Cancel in-progress init, clear resources. In-flight promises reject. |

### Lifecycle Events

| Event | Payload | Description |
|-------|---------|-------------|
| `init:phase:start` | `{phase: string}` | Phase beginning |
| `init:phase:end` | `{phase: string}` | Phase completed |
| `init:complete` | `{systems: Object}` | All phases done — systems object contains: `config`, `eventBus`, `generatedTextures`, `audioSystem`, `perlinNoiseReady`, `worldStore`, `assetCache` |
| `init:error` | `{error: Error, phase: string}` | Initialization failed at a phase |

### Usage

```js
var init = new Donkeycraft.InitSequence();
init.on('init:phase:end', function(data) {
    loadingScreen.updateProgress(data.phase);
});
var systems = await init.initialize();
// systems.eventBus, systems.audioSystem, systems.worldStore, etc.
```

---

## cache.js

**Purpose:** IndexedDB-based persistent cache for procedurally generated assets (texture atlas canvases as ImageData, sounds as base64 data URIs). Checksum-based invalidation ready.

### Constructor

```js
var cache = new Donkeycraft.AssetCache(dbName);  // default: 'donkeycraft-assets'
```

### Instance Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | `() → Promise<boolean>` | `true` if DB ready | Open IndexedDB connection |
| `isReady()` | `() → boolean` | ready? | Check if cache is operational |
| `getTextureAtlas(worldName)` | `(string) → Promise<HTMLCanvasElement\|null>` | canvas or null | Load cached texture atlas |
| `setTextureAtlas(canvas, worldName)` | `(HTMLCanvasElement, string) → Promise<boolean>` | success? | Cache texture atlas as ImageData |
| `getSound(soundName)` | `(string) → Promise<string\|null>` | base64 URI or null | Load cached sound |
| `setSound(soundName, base64Data)` | `(string, string) → Promise<boolean>` | success? | Cache sound as base64 data URI |
| `has(key)` | `(string) → Promise<boolean>` | exists? | Check if key exists in cache (validates key is non-empty string) |
| `delete(key)` | `(string) → Promise<boolean>` | deleted? | Delete a cached asset (returns false if not found; single-transaction) |
| `clearExpired(maxAgeMs)` | `(number) → Promise<number>` | cleared count | Remove entries older than maxAgeMs (default: 86400000 = 24h) |
| `clearAll()` | `() → Promise<number>` | cleared count | Clear all cached assets |
| `getUsageStats()` | `() → Promise<Object>` | `{entryCount, totalSize, entries}` | Cache statistics |
| `getTotalSize()` | `() → Promise<number>` | bytes | Approximate cache size in bytes |
| `destroy()` | `() → void` | — | Close IndexedDB connection |

### Usage

```js
await cache.init();
if (cache.isReady()) {
    var atlas = await cache.getTextureAtlas('DefaultWorld');
    if (!atlas) {
        // generate and cache
        await cache.setTextureAtlas(generatedCanvas, 'DefaultWorld');
    }
}
```

---

## level-data.js

**Purpose:** Manages world-level data: spawn position, game mode, world time, seed, player state. Supports periodic auto-save to WorldStore.

### Constants

```js
Donkeycraft.DEFAULT_SPAWN_X = 0;
Donkeycraft.DEFAULT_SPAWN_Y = 64;
Donkeycraft.DEFAULT_SPAWN_Z = 0;
Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL = 60000;  // 1 minute
```

### Constructor

```js
var levelData = new Donkeycraft.LevelData();
```

### World Properties

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `setSpawn(x, y, z)` | `(number, number, number) → void` | — | Set spawn position |
| `getSpawn()` | `() → {x, y, z}` | coords | Get spawn coordinates |
| `getSpawnX()` / `getSpawnY()` / `getSpawnZ()` | `() → number` | coord | Individual spawn getters |
| `setGameMode(mode)` | `(string) → void` | — | Set mode: `'survival'`, `'creative'`, `'spectator'` |
| `getGameMode()` | `() → string` | mode | Get current game mode |
| `setTime(ticks)` | `(number) → void` | — | Set world time (total ticks) |
| `getTime()` | `() → number` | ticks | Get total tick count |
| `setSeed(seed)` | `(number) → void` | — | Set world seed |
| `getSeed()` | `() → number` | seed | Get world seed |
| `setWorldName(name)` | `(string) → void` | — | Set world name |
| `getWorldName()` | `() → string` | name | Get world name |
| `isValid()` | `() → boolean` | valid | Validate required fields |
| `reset()` | `() → void` | — | Reset to defaults |
| `serialize()` | `() → Object` | serialized | Serialize for storage |
| `deserialize(data)` | `(Object) → LevelData` | this | Deserialize from stored object |

### Player Data

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `setPlayerData(data)` | `(Object) → void` | — | Set full player data |
| `getPlayerData()` | `() → Object\|null` | copy or null | Get player data (defensive copy) |
| `setPlayerPosition(x, y, z)` | `(number, number, number) → void` | — | Update position |
| `setPlayerRotation(yaw, pitch)` | `(number, number) → void` | — | Update rotation (radians) |
| `setPlayerHealth(health)` | `(number) → void` | — | Set health 0–20 |
| `isPlayerAlive()` | `() → boolean` | alive? | Check if player is alive |
| `setFallDistance(distance)` | `(number) → void` | — | Update fall distance |
| `getFallDistance()` | `() → number` | blocks | Get fall distance |
| `setHunger(hunger)` | `(number) → void` | — | Set hunger 0–20 |
| `getHunger()` | `() → number` | hunger | Get hunger level |
| `setSaturation(saturation)` | `(number) → void` | — | Set saturation |
| `getSaturation()` | `() → number` | saturation | Get saturation |
| `setXpLevels(levels)` | `(number) → void` | — | Set XP levels |
| `setXpPoints(points)` | `(number) → void` | — | Set XP points |
| `getXpLevels()` / `getXpPoints()` | `() → number` | value | Get XP values |
| `setInventory(inventory)` | `(Array) → void` | — | Set inventory array |
| `getInventory()` | `() → Array` | copy | Get inventory (defensive copy) |

### Auto-Save System

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `startAutoSave(worldStore, worldName, intervalMs)` | `(WorldStore, string, number?) → void` | — | Start periodic auto-save |
| `stopAutoSave()` | `() → void` | — | Stop auto-save |
| `isAutoSaveEnabled()` | `() → boolean` | enabled? | Check auto-save status |
| `tickAutoSave(dt)` | `(number) → void` | — | Call once per game tick (dt in seconds) |
| `persistToStore()` | `() → Promise<boolean>` | success? | Trigger immediate save to WorldStore (logs warnings on failure) |
| `markSaved()` | `() → void` | — | Record current timestamp |
| `getLastSaved()` | `() → number` | ms timestamp | Last save time |

### Usage

```js
levelData.setSpawn(0, 64, 0);
levelData.setPlayerPosition(player.x, player.y, player.z);
levelData.setPlayerRotation(yaw, pitch);
levelData.tickAutoSave(deltaTime);  // in game loop
```

---

## world-store.js

**Purpose:** IndexedDB world storage for saving/loading worlds (level data + chunks). Supports individual chunk operations and dirty-chunk batch saves.

### Constants

```js
Donkeycraft.WORLD_STORE_DB_NAME = 'donkeycraft-worlds';
Donkeycraft.WORLD_STORE_VERSION = 1;
Donkeycraft.WORLD_STORE_STORE_NAME = 'worlds';
```

### Constructor

```js
var store = new Donkeycraft.WorldStore(dbName);  // default: 'donkeycraft-worlds'
```

### Instance Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | `() → Promise<boolean>` | ready? | Open IndexedDB connection |
| `isReady()` | `() → boolean` | ready? | Check if store is operational |
| `setChunkManager(chunkManager)` | `(ChunkManager) → void` | — | Set reference for `saveDirtyChunks()` |
| `setEventBus(eventBus)` | `(EventBus) → void` | — | Set event bus for storage events |
| `saveWorld(worldName, levelData, chunks)` | `(string, Object, Array) → Promise<boolean>` | success? | Save full world (level data + chunk array) |
| `loadWorld(worldName)` | `(string) → Promise<Object\|null>` | `{levelData, chunks, savedAt}` or null | Load full world (normalizes chunk formats) |
| `deleteWorld(worldName)` | `(string) → Promise<boolean>` | deleted? | Delete a world |
| `listWorlds()` | `() → Promise<string[]>` | world names | List all saved world names |
| `saveChunk(worldName, cx, cz, chunkData)` | `(string, number, number, Object) → Promise<boolean>` | success? | Save single chunk |
| `loadChunk(worldName, cx, cz)` | `(string, number, number) → Promise<Object\|null>` | chunk data or null | Load single chunk |
| `getLevelData(worldName)` | `(string) → Promise<Object\|null>` | level data or null | Get world's level data |
| `setLevelData(worldName, levelData)` | `(string, Object) → Promise<boolean>` | success? | Update world's level data |
| `saveDirtyChunks(worldName)` | `(string) → Promise<number>` | saved count | Save all dirty chunks in batches (uses Config.CHUNKS_PER_SAVE) |
| `destroy()` | `() → void` | — | Close IndexedDB connection |

### Chunk Data Format

```js
{
    cx: 0,          // chunk X coordinate
    cz: 0,          // chunk Z coordinate
    data: {
        blockData: Uint16Array,   // 16×256×16 block IDs
        skyLight: Uint8Array,     // 16×16×16 sky light levels
        blockLight: Uint8Array    // 16×16×16 block light levels
    }
}
```

### Storage Events

| Event | Payload | Description |
|-------|---------|-------------|
| `storage:ready` | `{}` | Database opened successfully |
| `storage:error` | `{error: Error}` | Database error |
| `storage:quota-exceeded` | `{worldName: string}` | Storage limit reached |
| `storage:closed` | `{}` | Connection closed |
| `world:saved` | `{worldName: string}` | World saved |
| `world:loaded` | `{worldName: string}` | World loaded |
| `world:save-error` | `{worldName, error}` | Save failed |
| `world:load-error` | `{worldName, error}` | Load failed |
| `world:deleted` | `{worldName: string}` | World deleted |
| `worlds:listed` | `{count: number}` | World list retrieved |
| `chunks:saved` | `{worldName, count}` | Dirty chunks saved |

### Usage

```js
await store.init();
if (store.isReady()) {
    var world = await store.loadWorld('DefaultWorld');
    if (world) {
        // world.levelData, world.chunks, world.savedAt
    }
}
// With chunk manager set:
store.setChunkManager(chunkManager);
await store.saveDirtyChunks('DefaultWorld');