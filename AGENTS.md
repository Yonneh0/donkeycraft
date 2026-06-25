# Donkeycraft — AI Agent Guidelines

This document defines the mandatory workflow and coding standards for all AI agents working on this project. Violating these rules will result in incorrect implementations or broken codebases.

---

## 1. Mandatory Workflow Rules

### 1.1 Follow PLAN.md Strictly

- **Always read `PLAN.md` before starting any implementation.** It defines the exact file structure, class responsibilities, line estimates, and phase order.
- **Implement phases in the order specified by `PLAN.md`.** Do not skip ahead or implement out of order.
- **Do NOT modify `PLAN.md` under any circumstances without explicit user approval.** The only allowed changes to `PLAN.md` are:
  - Changing `[ ]` to `[FULLY OPERATIONAL]` for a phase after thorough functional audit confirms correctness.
  - Adding notes under a phase's status marker if important findings were discovered during audit.
- **No changelogs, bugfix reports, or development notes belong in `PLAN.md`.** It is a living plan document, not a change log.

### 1.2 Audit Before Committing

After every change (file creation, modification, or deletion), you **must**:

1. **Re-read the file(s) you modified** and verify:
   - All public API methods match the contract described in `PLAN.md`
   - No private methods are accidentally exposed on the `Donkeycraft` namespace
   - IIFE wrapping is correct (no stray global variables)
   - `'use strict';` is present at the top of every file
   - All docblock comments (`/** ... */`) are present and accurate
   - Method signatures match the parameter types described in `PLAN.md`
2. **Check cross-file dependencies** — ensure no file references a class that doesn't exist yet or references it before it's defined.
3. **Verify the dependency order** in `PLAN.md`'s "Script Loader" section is respected.

### 1.3 Commit Every Change with Git

- **Commit after every discrete change.** Do not batch multiple unrelated changes into a single commit.
- **Use descriptive commit messages** following this format:
  ```
  <phase>: <short description of change>

  - Added/modified <file>
  - Implemented <feature/method>
  - Fixed <issue>
  ```
- **Examples:**
  - `phase1: add eventbus with pub/sub and unsubscribe support`
  - `phase2: add gl-context with error handling and capability queries`
  - `phase4: fix cave generator y-level bounds in ore-generator.js`
- **Never commit without verifying the change first** (see rule 1.2).

### 1.4 Never Skip Auditing

Skipping the audit step is a critical error. An unaudited file may:
- Break the dependency chain by referencing undefined classes
- Leak internal state through improperly scoped variables
- Introduce subtle bugs in math utilities that cascade through rendering and physics
- Violate the IIFE pattern and pollute the global namespace

### 1.5 User Review Before Committing or Updating PLAN.md

**Before committing any changes to git and before updating `PLAN.md`, you MUST present the test results to the user and wait for confirmation.**

The required workflow is:

1. **Run all functional tests** for the phase as defined in Section 4 (Testing & Validation).
2. **Present a summary to the user** that includes:
   - Which files were created or modified
   - Which functional tests were executed
   - The results of each test (pass/fail with details)
   - Any errors, warnings, or unexpected behavior observed
   - Confirmation that coding standards were met (IIFE, strict mode, docblocks, naming)
3. **Wait for the user's approval** before proceeding with:
   - Git commits (`git add` / `git commit`)
   - Updating `PLAN.md` (changing `[ ]` or `[PARTIAL]` to `[FULLY OPERATIONAL]`, adding verification notes)
4. **Do not proceed** until the user explicitly confirms or provides feedback.

**Exception:** Routine per-file commits during implementation (Section 1.3) that are not tied to phase completion do not require user review. However, the final commit that marks a phase as complete and the corresponding `PLAN.md` update **always** requires user review first.

---

## 2. Project Architecture

### 2.1 Core Constraints

| Constraint | Rule |
|------------|------|
| **No ES Modules** | All code uses IIFE pattern, attaching to global `Donkeycraft` namespace |
| **No Build Tools** | Raw JS files loaded directly via `<script>` tags — no bundlers, transpilers, or compilers |
| **No Server Required** | Everything runs from `file:///` — no localhost API calls, no fetch() to servers |
| **WebGL 1.0 Only** | No WebGL 2.0 features; use WebGL 1-compatible shaders and buffers |
| **Single Entry Point** | `index.html` (created late in development) loads scripts via `<script>` tags |

### 2.2 Namespace Pattern

Every file registers itself on the global `Donkeycraft` object:

```javascript
(function() {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * MyClass — description.
     */
    Donkeycraft.MyClass = function(config) {
        // private fields
    };

    Donkeycraft.MyClass.prototype = {
        /**
         * publicMethod — public API.
         * @param {string} param - Description.
         * @returns {number}
         */
        publicMethod: function(param) {
            // implementation
        },

        /**
         * _privateMethod — private, not exposed on namespace.
         * @private
         */
        _privateMethod: function() {
            // implementation
        }
    };
})();
```

**Rules:**
- Every file **must** be wrapped in an IIFE `(function() { 'use strict'; ... })();`
- Every file **must** declare `'use strict';` immediately after the IIFE opens.
- Private methods/properties **must** use underscore prefix (`_methodName`, `_field`).
- Public methods **must not** use underscore prefix.
- Never assign directly to `window` — always use `var Donkeycraft = window.Donkeycraft;`.

### 2.3 Dependency Order

Scripts load in dependency order. A file can only reference classes defined in earlier files:

```
namespace.js → eventbus.js → config.js → logger.js → timer.js → input.js → math-utils.js → audio.js
```

When creating new files, place them in the correct phase directory and ensure they are loaded in the right order in `index.html`.

### 2.4 File Independence Principle

Each file is designed to be self-contained within its phase. Files only depend on:
- Core infrastructure (Phase 1) — universally needed
- Lower-numbered phases in order

A file in `src/render/` should never import from `src/player/` or `src/world/`. Communication between phases happens through the `Donkeycraft` namespace and/or the event bus.

---

## 3. Coding Standards

### 3.1 Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Class / Constructor | PascalCase | `Donkeycraft.Vector3`, `Donkeycraft.Chunk` |
| Public method | camelCase | `getBlock()`, `setBlock()` |
| Private method | underscore + camelCase | `_recalculateMesh()` |
| Public field | camelCase | `this.x`, `this.volume` |
| Private field | underscore + camelCase | `this._context`, `this._listeners` |
| Constant | UPPER_SNAKE_CASE | `CHUNK_SIZE`, `GRAVITY` |
| Variable | camelCase | `audioBuffer`, `renderDistance` |
| File name | kebab-case | `math-utils.js`, `chunk-manager.js` |
| Directory name | kebab-case | `src/core/`, `src/render/` |

### 3.2 Docblock Comments

Every public method, constructor, and class-level object **must** have a JSDoc-style docblock:

```javascript
/**
 * Description of what this does.
 * @param {string} param1 - Description of param1.
 * @param {number} [param2=10] - Optional param with default.
 * @returns {Donkeycraft.Vector3} Description of return value.
 */
```

**Type annotations must be accurate:**
- `{number}` — for integers and floats
- `{string}` — for strings
- `{boolean}` — for booleans
- `{Function}` — for callbacks
- `{HTMLElement}` — for DOM elements
- `{Donkeycraft.ClassName}` — for Donkeycraft types
- `{...}` for rest parameters, `{*}` for any type

### 3.3 Error Handling

- Wrap external API calls (WebGL, AudioContext, IndexedDB) in try/catch blocks.
- Log errors using `Donkeycraft.Logger.error()` — never use bare `console.error`.
- Silently ignore non-critical errors (e.g., audio playback failures) to prevent game crashes.
- Always provide fallback behavior when optional features are unavailable.

### 3.4 Memory Management

- Call `.destroy()` on all systems during game shutdown to free resources (event listeners, WebGL contexts, AudioContext).
- Use the unsubscribe functions returned by `EventBus.on()`, `Timer.onTick()`, and `Timer.onRender()`.
- Clear arrays and objects when destroying systems (`this._listeners = {}`).

---

## 4. Testing & Validation

### 4.1 Per-Phase Functional Tests

Each phase must be validated with a **standalone functional test** before marking it as `[FULLY OPERATIONAL]` in `PLAN.md`. These tests are self-contained and require no other phases to be implemented.

**General rule:** Create a minimal inline test script that can be pasted into a blank HTML page or run in the console. No dependencies on `index.html` or the full game.

### 4.2 Phase-Specific Validation

| Phase | Validation Test |
|-------|----------------|
| **1 — Core Infrastructure** | Instantiate each class, call every public method with known inputs, assert outputs match expected values. Verify: EventBus emits to correct listeners, Vector3 math is accurate, Timer accumulates delta correctly, Input captures/releases mouse, Audio loads and plays a buffer, Logger respects level thresholds. |
| **2 — WebGL Rendering** | Create a minimal canvas with WebGL 1 context. Compile and link a simple vertex+fragment shader pair. Upload a single triangle or quad vertex buffer. Verify the shape renders with correct color. Test camera matrix produces expected view transform. |
| **3 — Block System** | Instantiate block definitions. Verify all 256+ block IDs have correct names, hardness, blast resistance, and transparency flags. Verify texture atlas UV coordinates map correctly for each block face. |
| **4 — World Generation** | Generate a chunk in isolation. Verify heightmap values are within [0, WORLD_HEIGHT). Verify ore vein placement respects Y-level constraints and biome restrictions. Verify cave generation produces connected tunnels. |
| **5 — Player & Movement** | Simulate movement ticks with known inputs (e.g., forward + jump). Verify position changes match expected physics formulas (gravity, velocity, collision response). Test fly mode toggling. |
| **6 — Interaction** | Run DDA raycasting against a known block layout. Verify hit block coordinates, face normals, and reach distance enforcement. Test block placement snaps to correct grid position. |
| **7 — Inventory & UI** | Create inventories with items. Verify slot operations (put, take, swap, drag, shift-click). Verify hotbar selection with number keys. |
| **8 — Crafting** | Feed recipes into the crafting manager. Verify 2×2 and 3×3 shaped/shapeless matching produces correct output. |
| **9 — Entities & Mobs** | Spawn entities, tick them, verify position updates. Test mob AI pathfinding on a known block layout. |
| **10 — Redstone** | Place redstone wires, repeaters, comparators. Verify signal strength propagation and decay. Test piston push chains. |
| **11-21** | Similar isolated tests: validate each subsystem's public API with known inputs and assert expected outputs. |

### 4.3 What "FULLY OPERATIONAL" Means

A phase is marked `[FULLY OPERATIONAL]` only when:

1. All files listed in that phase of `PLAN.md` exist and are syntactically correct.
2. Every public method described in `PLAN.md` is implemented.
3. A standalone functional test has been run and all assertions passed.
4. No console errors or warnings appear during testing.
5. The file follows all coding standards (IIFE, strict mode, docblocks, naming).

### 4.4 Test Recording

When a phase passes its functional test, add a brief note under the phase status marker in `PLAN.md`:

```markdown
| ... | Status |
|---|------|
| `src/core/timer.js` | [FULLY OPERATIONAL] — verified: delta accumulation, tick scheduling at 20 TPS, FPS counter, render callbacks |
```

---

## 5. Git Workflow

### 5.1 Commit Frequency

- **Commit after every discrete change.** One file created or modified = one commit.
- **Never leave uncommitted work when switching tasks.** If you start Phase 3 before finishing Phase 2, commit Phase 3's partial work and return to Phase 2 later.

### 5.2 Commit Message Format

```
<phase>: <short description>

- Detailed bullet points about what was changed
- Mention specific files if relevant
- Note any design decisions or trade-offs
```

**Examples:**

```
phase1: add eventbus with pub/sub, once(), and unsubscribe support

- Implement EventBus class with namespace prefixing
- Add on(), off(), once(), clear() public methods
- Return unsubscribe functions from on() and once()
- Emit wraps callbacks in try/catch for error isolation
- Verified: listener registration, event emission, unsubscription, namespace scoping
```

```
phase4: implement cave generator with 3D noise-based tunnels

- Create cave-generator.js with fbm-based cave detection
- Configurable cave density and radius via noise thresholds
- Separate lava cave layer at low Y levels
- Verified: cave connectivity, Y-level distribution, performance on 16x256x16 chunk
```

### 5.3 Branch Strategy

- Work on `main` branch directly for now (no complex branching).
- If the user requests a feature branch, use `feature/<name>`.
- Always run `git status` before committing to verify only intended files are staged.

---

## 6. Common Pitfalls

### 6.1 Web Audio API

- `AudioContext` must be created in response to a user gesture (click/keypress). It cannot be created during module initialization.
- On some browsers, `AudioContext` starts in a suspended state — call `resume()` before use.
- File protocol (`file:///`) may block XHR for audio files — use base64 data URIs as fallback.

### 6.2 Pointer Lock

- `requestPointerLock()` must be called on an element that has focus and is in the foreground.
- Check `document.pointerLockElement` to verify lock state — do not rely solely on internal flags.
- Mouse delta (`movementX`/`movementY`) is only available when pointer lock is active.

### 6.3 WebGL 1 Constraints

- Maximum vertex shader uniforms: typically 128 (vec4).
- Maximum texture units: typically 8.
- No `textureSize()` in fragment shaders — pass texture dimensions as uniforms.
- No `float` textures — use `UNSIGNED_BYTE` with manual division.

### 6.4 IIFE Gotchas

- Forgetting `'use strict';` causes silent failures from accidental globals.
- Not wrapping in IIFE leaks variables to the global scope, overwriting `Donkeycraft` namespace entries from other files.
- Accidentally loading a file twice creates duplicate namespace entries — the namespace file handles this with defensive checks.

### 6.5 Timer / Delta Time

- Never use `Date.now()` for game logic delta — always use `Timer.getDeltaTime()`.
- The accumulator prevents spiral-of-death but can cause "rubber-banding" if delta spikes too large (e.g., tab was backgrounded). The 500ms cap mitigates this.

### 6.6 Event Bus

- Listeners that throw exceptions do not prevent other listeners from firing (each is wrapped in try/catch).
- Removing a listener while an event is being emitted does NOT affect currently iterating listeners (array is copied before iteration).
- `once()` callbacks can be cancelled by calling the returned unsubscribe function before the event fires.

---

## 7. Quick Reference

### 7.1 Project Structure

```
index.html          # Entry point (created late)
css/                # Stylesheets
src/
  core/             # Phase 1: Core infrastructure (COMPLETE)
  render/           # Phase 2: WebGL rendering
  world/            # Phases 3-4, 11-12, 14: Blocks, chunks, terrain, dimensions, storage
  player/           # Phases 5, 15, 18: Player, game modes, health/hunger/XP
  interaction/      # Phase 6: Mining, placing, raycasting
  ui/               # Phase 7: Inventory, HUD, GUI
  crafting/         # Phase 8: Crafting logic and recipes
  entity/           # Phase 9: Mobs and entities
  redstone/         # Phase 10: Redstone system
  game/             # Phases 16-17: Enchantments, potions, tools
  storage/          # Phase 14: World save/load
  game.js           # Phase 21: Main game class
  loader.js         # Phase 21: Script loader
assets/
  textures/         # Phase 19: Block, item, entity sprites
  sounds/           # Phase 19: Sound effects and music
PLAN.md             # Development plan (DO NOT MODIFY without approval)
AGENTS.md           # This file — agent guidelines
README.md           # Project overview
```

### 7.2 Status Markers

- `[ ]` — Not started
- `[PARTIAL]` — Files created but not yet functionally verified
- `[FULLY OPERATIONAL]` — Implemented and verified with functional tests

### 7.3 Key Configuration Values (from Config)

| Constant | Value | Purpose |
|----------|-------|---------|
| `CHUNK_SIZE` | 16 | Chunks are 16×16 blocks |
| `WORLD_HEIGHT` | 256 | World height (0–255) |
| `RENDER_DISTANCE` | 8 chunks | Default render radius |
| `GAME_TICKS_PER_SECOND` | 20 | Game logic tick rate |
| `PLAYER_SPEED` | 5.0 blocks/s | Walking speed |
| `GRAVITY` | -20.0 blocks/s² | Gravity acceleration |
| `FOV` | 70 degrees | Camera field of view |

---

**Remember:** When in doubt, re-read `PLAN.md`, follow the coding standards in this document, and commit your work with a clear message. Never skip auditing.