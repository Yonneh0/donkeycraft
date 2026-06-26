# Donkeycraft — AI Agent Guidelines

This document defines the mandatory workflow and coding standards for all AI agents working on this project. Violating these rules will result in incorrect implementations or broken codebases.

For detailed file structure, phase breakdowns, configuration constants, dependency order, and milestone definitions, see **`PLAN.md`**.

---

## 1. Mandatory Workflow Rules

### 1.1 Follow PLAN.md Strictly

- **Always read `PLAN.md` before starting any implementation.** It defines the exact file structure, class responsibilities, line estimates, phase order, and dependency chain.
- **Implement phases in the order specified by `PLAN.md`.** Do not skip ahead or implement out of order.
- **Do NOT modify `PLAN.md` under any circumstances without explicit user approval.** The only allowed changes are:
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
3. **Verify the dependency order** in `PLAN.md`'s "Dependency Order" section is respected.

### 1.3 Commit Every Change with Git

- **Commit after every discrete change.** One file created or modified = one commit. Do not batch unrelated changes.
- **Use descriptive commit messages** following this format:
  ```
  <phase>: <short description of change>

  - Added/modified <file>
  - Implemented <feature/method>
  - Fixed <issue>
  ```
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

1. **Run all functional tests** for the phase as defined in `PLAN.md` Section 4 (Testing & Validation).
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

## 2. Coding Standards

### 2.1 Core Constraints

| Constraint | Rule |
|------------|------|
| **No ES Modules** | All code uses IIFE pattern, attaching to global `Donkeycraft` namespace |
| **No Build Tools** | Raw JS files loaded directly via `<script>` tags — no bundlers, transpilers, or compilers |
| **No Server Required** | Everything runs from `file:///` — no localhost API calls, no fetch() to servers |
| **WebGL 1.0 Only** | No WebGL 2.0 features; use WebGL 1-compatible shaders and buffers |

See `PLAN.md` for full details on the single entry point, namespace pattern, and dependency order.

### 2.2 Namespace Pattern (IIFE)

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

### 2.3 Naming Conventions

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

### 2.4 Docblock Comments

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

### 2.5 Error Handling

- Wrap external API calls (WebGL, AudioContext, IndexedDB) in try/catch blocks.
- Log errors using `Donkeycraft.Logger.error()` — never use bare `console.error`.
- Silently ignore non-critical errors (e.g., audio playback failures) to prevent game crashes.
- Always provide fallback behavior when optional features are unavailable.

### 2.6 Memory Management

- Call `.destroy()` on all systems during game shutdown to free resources (event listeners, WebGL contexts, AudioContext).
- Use the unsubscribe functions returned by `EventBus.on()`, `Timer.onTick()`, and `Timer.onRender()`.
- Clear arrays and objects when destroying systems (`this._listeners = {}`).

### 2.7 File Independence Principle

Each file is designed to be self-contained within its phase. Files only depend on:
- Core infrastructure (Phase 1) — universally needed
- Lower-numbered phases in order

A file in `src/render/` should never import from `src/player/` or `src/world/`. Communication between phases happens through the `Donkeycraft` namespace and/or the event bus. See `PLAN.md` for the full dependency order.

---

## 3. Common Pitfalls

### 3.1 Web Audio API

- `AudioContext` must be created in response to a user gesture (click/keypress). It cannot be created during module initialization.
- On some browsers, `AudioContext` starts in a suspended state — call `resume()` before use.
- File protocol (`file:///`) may block XHR for audio files — use base64 data URIs as fallback.

### 3.2 Pointer Lock

- `requestPointerLock()` must be called on an element that has focus and is in the foreground.
- Check `document.pointerLockElement` to verify lock state — do not rely solely on internal flags.
- Mouse delta (`movementX`/`movementY`) is only available when pointer lock is active.

### 3.3 WebGL 1 Constraints

- Maximum vertex shader uniforms: typically 128 (vec4).
- Maximum texture units: typically 8.
- No `textureSize()` in fragment shaders — pass texture dimensions as uniforms.
- No `float` textures — use `UNSIGNED_BYTE` with manual division.

### 3.4 IIFE Gotchas

- Forgetting `'use strict';` causes silent failures from accidental globals.
- Not wrapping in IIFE leaks variables to the global scope, overwriting `Donkeycraft` namespace entries from other files.
- Accidentally loading a file twice creates duplicate namespace entries — the namespace file handles this with defensive checks.

### 3.5 Timer / Delta Time

- Never use `Date.now()` for game logic delta — always use `Timer.getDeltaTime()`.
- The accumulator prevents spiral-of-death but can cause "rubber-banding" if delta spikes too large (e.g., tab was backgrounded). The 500ms cap mitigates this.

### 3.6 Event Bus

- Listeners that throw exceptions do not prevent other listeners from firing (each is wrapped in try/catch).
- Removing a listener while an event is being emitted does NOT affect currently iterating listeners (array is copied before iteration).
- `once()` callbacks can be cancelled by calling the returned unsubscribe function before the event fires.

---

## 4. Quick Reference

### 4.1 Status Markers

- `[ ]` — Not started
- `[PARTIAL]` — Files created but not yet functionally verified
- `[FULLY OPERATIONAL]` — Implemented and verified with functional tests

### 4.2 Testing

Each phase must be validated with a **standalone functional test** before marking it as `[FULLY OPERATIONAL]` in `PLAN.md`. See `PLAN.md` Section 4 for per-phase validation criteria and milestone definitions.

---

**Remember:** When in doubt, re-read `PLAN.md`, follow the coding standards in this document, and commit your work with a clear message. Never skip auditing.