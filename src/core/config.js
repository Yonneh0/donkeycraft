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
     *
     * @namespace
     */
    Donkeycraft.Config = (function () {
        return {
            // World settings
            CHUNK_SIZE: 16,           // Chunks are 16 blocks wide/deep
            WORLD_HEIGHT: 256,        // Total world height (0 to 255)
            RENDER_DISTANCE: 10,       // Render radius in chunks (default, adjustable)
            MAX_RENDER_DISTANCE: 12,  // Hard cap on render distance for performance
            SEED: 1337,                 // Default world seed

            // Tick rates
            GAME_TICKS_PER_SECOND: 20,    // Game logic ticks (blocks, entities, redstone)
            RENDER_FPS_TARGET: 60,        // Target render FPS
            AUTO_SAVE_INTERVAL: 30000,    // Auto-save every 30 seconds (ms)

            // Player settings
            PLAYER_HEIGHT: 1.8,         // Player height in blocks
            PLAYER_WIDTH: 0.6,          // Player width in blocks
            PLAYER_EYE_HEIGHT: 1.62,    // Eye height for raycasting
            PLAYER_SPEED: 5.0,          // Walking speed (blocks/sec)
            PLAYER_SPRINT_SPEED: 7.8,   // Sprinting speed (blocks/sec)
            PLAYER_SNEAK_SPEED: 2.0,    // Sneak speed (blocks/sec) — 0.4x walk

            // Creative mode grounded turbo speed (slider position 3)
            CREATIVE_TURBO_SPEED: 20.0, // Creative turbo on ground (4x walk speed)

            // Flying speed modes — used by the speed indicator slider when flying
            // [normal, fast, turbo, ultra]
            PLAYER_FLY_SPEED_NORMAL: 5.0,   // Normal fly speed (1x walk speed)
            PLAYER_FLY_SPEED_FAST: 10.0,    // Fast fly speed (2x walk speed)
            PLAYER_FLY_SPEED_TURBO: 30.0,   // Turbo fly speed (6x walk speed)
            PLAYER_FLY_SPEED_ULTRA: 60.0,   // Ultra fly speed (12x walk speed)

            // Terrain-based slow effects (multipliers applied to base speed)
            HONEY_BLOCK_SLOW: 0.5,          // Honey block surface — 50% speed
            MUD_SLOW: 0.7,                  // Mud/packed mud — 70% speed
            POWDER_SNOW_SLOW: 0.6,          // Powder snow — 60% speed
            PLAYER_JUMP_FORCE: 14.0,      // Jump velocity (blocks/s) — gives ~5.0 block jump height with GRAVITY=19.6
            PLAYER_REACH: 6.0,          // Block interaction reach distance

            // Camera settings
            FOV: 70,                    // Field of view (degrees)
            MOUSE_SENSITIVITY: 0.01,    // Mouse look sensitivity
            MOUSE_SCROLL_SENSITIVITY: 1,// Hotbar scroll sensitivity
            KEYBOARD_TURN_SPEED: 0.04,  // Radians per tick for A/D keyboard turn (~2.3 degrees/tick)

            // Physics
            GRAVITY: -20.0,                        // Gravity acceleration (blocks/s^2)
            TERMINAL_VELOCITY: -40.0,              // Max fall speed (blocks/s)
            FLYING_TERMINAL_VELOCITY: -20.0,       // Max downward fly speed (blocks/s)

            // Flying vertical speed normalization baseline — used to convert dt to a frame-rate-independent value.
            // Matches RENDER_FPS_TARGET by default; change both if targeting a different fixed framerate.
            FLY_BASELINE_FPS: 60,                  // Delta-time normalization baseline for flying movement

            // Player mechanics
            SWIM_BOOST: 0.15,            // Upward velocity boost when swimming with jump key (blocks/s)
            SWIM_DOWNSPEED: 0.12,        // Downward velocity when swimming with shift in water (blocks/s)
            JUMP_COOLDOWN: 0.1,          // Cooldown between jumps (seconds)
            FALL_DAMAGE_THRESHOLD: 3,    // Blocks of free fall before damage begins
            FALL_DAMAGE_MULTIPLIER: 1.0, // HP damage per block beyond threshold

            // Lighting (reserved for future use — current implementation uses block lightOpacity/lightLevel properties)
            SKY_LIGHT_DECAY: 1,         // Sky light decay per block (unused)
            BLOCK_LIGHT_DECAY: 1,       // Block light decay per tick (unused)

            // Time settings
            WORLD_TIME_SCALE: 60,       // Ticks per second for time-of-day (60s = full day cycle)

            // Key bindings (keyboard only — mouse buttons are accessed via Input.getMouseState())
            KEYBINDS: {
                MOVE_FORWARD: 'KeyW',
                MOVE_BACKWARD: 'KeyS',
                MOVE_LEFT: 'KeyA',
                MOVE_RIGHT: 'KeyD',
                JUMP: 'Space',
                SPEED_CYCLE: 'ShiftLeft',   // Toggle speed up one step (cycles back to first at max)
                INVENTORY: 'KeyE',
                DEBUG_SCREEN: 'F3',
                FLY_TOGGLE: 'KeyF',         // Creative mode only — toggles flying
                TURBO_TOGGLE: 'KeyT',       // Creative mode only — toggles turbo speed while flying
                PICK_ITEM_1: 'Digit1',
                PICK_ITEM_2: 'Digit2',
                PICK_ITEM_3: 'Digit3',
                PICK_ITEM_4: 'Digit4',
                PICK_ITEM_5: 'Digit5',
                PICK_ITEM_6: 'Digit6',
                PICK_ITEM_7: 'Digit7',
                PICK_ITEM_8: 'Digit8',
                PICK_ITEM_9: 'Digit9',
                DROP_ITEM: 'KeyP',          // Drop item (moved from Q)
                SPEED_DOWN: 'KeyZ',         // Grounded: decrease speed / Swimming/Flying: go down
                SPEED_UP: 'KeyQ'            // Grounded: increase speed / Swimming/Flying: go up
            },

            // Chunk persistence (used by Game._saveDirtyChunks for auto-save batching)
            CHUNKS_PER_SAVE: 4,       // Number of chunks to save per batch
            SAVE_BATCH_DELAY: 100,    // Delay in ms between batch save operations (reserved)

            // Level data auto-save interval (ms) — also available as Donkeycraft.DEFAULT_AUTO_SAVE_INTERVAL
            LEVEL_DATA_AUTO_SAVE_INTERVAL: 60000, // Auto-save level data every 60 seconds

            // Asset cache settings
            ASSET_CACHE_VERSION: 1,   // Increment to force cache invalidation
            ASSET_CACHE_MAX_AGE_MS: 86400000, // 24 hours — expired entries cleared on quota

            // Dimension settings
            NETHER_SCALE: 8,          // Overworld coords / 8 = Nether coords (and vice versa)
            END_SCALE: 1,             // Overworld coords × 1 = End coords
            NETHER_HEIGHT: 128,       // Nether world height (Y: 0-127)
            END_HEIGHT: 256,          // End world height (Y: 0-255)

            // Map view settings
            MAP_MINIMAP_SIZE: 150,    // Minimap diameter in pixels
            MAP_ZOOM_MIN: 0.05,       // Minimum zoom (showing ~200 chunks)
            MAP_ZOOM_MAX: 4.0,        // Maximum zoom (showing ~1 chunk)
            MAP_MINIMAP_RADIUS: 32    // Minimap radius in blocks
        };
    })();

})();