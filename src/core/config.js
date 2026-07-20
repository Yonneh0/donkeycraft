// Donkeycraft — Configuration
// Game configuration: render distance, chunk size, tick rates, keybinds, physics, and persistence.
// All values are constants — do not modify at runtime.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  /**
   * Config — global game configuration object.
   *
   * This object is loaded once during initialization and provides constants
   * used throughout the game engine. All properties are read-only after creation.
   * Do not modify at runtime — changes will affect all systems immediately.
   *
   * @namespace
   */
  Donkeycraft.Config = (function () {
    return {
      // World settings — geometry and generation parameters
      CHUNK_SIZE: 16, // Chunks are 16 blocks wide/deep (16×256×16 volume)
      WORLD_HEIGHT: 256, // Total world height (Y: 0 to 255)
      RENDER_DISTANCE: 10, // Render radius in chunks from player (default, adjustable)
      MAX_RENDER_DISTANCE: 12, // Hard cap on render distance for performance
      SEED: 1337, // Default world seed (used if no saved seed exists)

      // Tick rates — simulation and rendering timing
      GAME_TICKS_PER_SECOND: 20, // Game logic ticks per second (blocks, entities, redstone)
      RENDER_FPS_TARGET: 60, // Target render frames per second
      AUTO_SAVE_INTERVAL: 30000, // Auto-save interval in milliseconds (30 seconds)

      // Player settings — dimensions, speeds, and camera parameters
      PLAYER_HEIGHT: 1.8, // Player height in blocks (collision AABB)
      PLAYER_WIDTH: 0.6, // Player width in blocks (collision AABB)
      PLAYER_EYE_HEIGHT: 1.62, // Eye height from feet for raycasting
      PLAYER_SPEED: 5.0, // Base walking speed in blocks per second
      PLAYER_SPRINT_SPEED: 7.8, // Sprinting speed (1.56× walk speed)
      PLAYER_SNEAK_SPEED: 2.0, // Sneak speed (0.4× walk speed)

      // Creative mode movement — grounded and flying speeds
      CREATIVE_TURBO_SPEED: 20.0, // Creative turbo on ground (4× walk speed, slider position 3)

      // Flying speed modes — used by the speed indicator slider when flying
      // Order: [normal, fast, turbo, ultra] — cycling via ShiftLeft key
      PLAYER_FLY_SPEED_NORMAL: 5.0, // Normal fly speed (1× walk speed)
      PLAYER_FLY_SPEED_FAST: 10.0, // Fast fly speed (2× walk speed)
      PLAYER_FLY_SPEED_TURBO: 30.0, // Turbo fly speed (6× walk speed)
      PLAYER_FLY_SPEED_ULTRA: 60.0, // Ultra fly speed (12× walk speed)

      // Terrain-based slow effects and physics constants
      HONEY_BLOCK_SLOW: 0.5, // Honey block surface — 50% movement speed
      MUD_SLOW: 0.7, // Mud/packed mud — 70% movement speed
      POWDER_SNOW_SLOW: 0.6, // Powder snow — 60% movement speed
      PLAYER_JUMP_FORCE: 14.0, // Initial upward velocity for jump (blocks/s²); ~5.0 block height with GRAVITY=-20
      PLAYER_REACH: 6.0, // Maximum block interaction reach distance in blocks

      // Camera settings — field of view and input sensitivity
      FOV: 70, // Horizontal field of view in degrees (perspective projection)
      MOUSE_SENSITIVITY: 0.01, // Mouse look sensitivity (radians per pixel)
      MOUSE_SCROLL_SENSITIVITY: 1, // Hotbar slot scroll sensitivity
      KEYBOARD_TURN_SPEED: 0.04, // Radians per tick for A/D keyboard turn (~2.3°/tick at 60fps)

      // Physics constants — gravity, velocity limits, and movement
      GRAVITY: -20.0, // Downward acceleration in blocks per second squared
      TERMINAL_VELOCITY: -40.0, // Maximum downward velocity during fall (blocks/s)
      FLYING_TERMINAL_VELOCITY: -20.0, // Maximum downward velocity while flying (blocks/s)

      // Flying movement delta-time normalization — ensures frame-rate-independent flying speed
      FLY_BASELINE_FPS: 60, // Delta-time normalization baseline (matches RENDER_FPS_TARGET)

      // Player mechanics — swimming, jumping, and damage thresholds
      SWIM_BOOST: 0.15, // Upward velocity boost when pressing jump while swimming (blocks/s)
      SWIM_DOWNSPEED: 0.12, // Constant downward velocity when pressing shift while swimming (blocks/s)
      JUMP_COOLDOWN: 0.1, // Cooldown period between jumps in seconds (prevents rapid double-jumps)
      FALL_DAMAGE_THRESHOLD: 3, // Free-fall distance in blocks before damage begins (3+ blocks)
      FALL_DAMAGE_MULTIPLIER: 1.0, // Health points lost per block beyond threshold (1 HP per block)

      // Lighting settings — reserved for future light propagation system
      SKY_LIGHT_DECAY: 1, // Sky light decay rate per block (currently unused; lightOpacity handles this)
      BLOCK_LIGHT_DECAY: 1, // Block light decay per tick (currently unused; BFS flood fill handles this)

      // Time settings — day/night cycle duration
      WORLD_TIME_SCALE: 60, // Ticks per second for time-of-day; 24000 ticks = 60 seconds = full day cycle

      // Key bindings — keyboard input mappings (mouse buttons accessed via Input.getMouseState())
      KEYBINDS: {
        MOVE_FORWARD: 'KeyW',
        MOVE_BACKWARD: 'KeyS',
        MOVE_LEFT: 'KeyA',
        MOVE_RIGHT: 'KeyD',
        JUMP: 'Space',
        SPEED_CYCLE: 'ShiftLeft', // Toggle speed up one step (cycles back to first at max)
        INVENTORY: 'KeyE',
        DEBUG_SCREEN: 'F3',
        FLY_TOGGLE: 'KeyF', // Creative mode only — toggles flying
        TURBO_TOGGLE: 'KeyT', // Creative mode only — toggles turbo speed while flying
        PICK_ITEM_1: 'Digit1',
        PICK_ITEM_2: 'Digit2',
        PICK_ITEM_3: 'Digit3',
        PICK_ITEM_4: 'Digit4',
        PICK_ITEM_5: 'Digit5',
        PICK_ITEM_6: 'Digit6',
        PICK_ITEM_7: 'Digit7',
        PICK_ITEM_8: 'Digit8',
        PICK_ITEM_9: 'Digit9',
        DROP_ITEM: 'KeyP', // Drop item (moved from Q)
        SPEED_DOWN: 'KeyZ', // Grounded: decrease speed / Swimming/Flying: go down
        SPEED_UP: 'KeyQ', // Grounded: increase speed / Swimming/Flying: go up
      },

      // Chunk persistence settings — batched auto-save parameters
      CHUNKS_PER_SAVE: 4, // Number of dirty chunks to save per batch (prevents main-thread blocking)
      SAVE_BATCH_DELAY: 100, // Millisecond delay between batch save operations (reserved for future use)

      // Level data auto-save interval in milliseconds
      LEVEL_DATA_AUTO_SAVE_INTERVAL: 60000, // Auto-save level data (spawn, time, player state) every 60 seconds

      // Asset cache settings — IndexedDB-based texture persistence
      ASSET_CACHE_VERSION: 1, // Cache version number; increment to force full cache invalidation
      ASSET_CACHE_MAX_AGE_MS: 86400000, // Maximum age for cached assets before expiration (24 hours in ms)

      // Dimension settings — inter-dimensional scaling and height limits
      NETHER_SCALE: 8, // Overworld coordinates ÷ 8 = Nether coordinates (and vice versa for return)
      END_SCALE: 1, // Overworld coordinates × 1 = End coordinates (portal-based travel only)
      NETHER_HEIGHT: 128, // Nether world height limit (Y: 0 to 127)
      END_HEIGHT: 256, // End world height limit (Y: 0 to 255)

      // Map view settings — minimap and full-screen map UI parameters
      MAP_MINIMAP_SIZE: 150, // Minimap circular diameter in pixels
      MAP_ZOOM_MIN: 0.05, // Minimum zoom level (showing ~200 chunks at player position)
      MAP_ZOOM_MAX: 4.0, // Maximum zoom level (showing ~1 chunk at player position)
      MAP_MINIMAP_RADIUS: 32, // Minimap display radius in blocks (world units)
    };
  })();
})();
