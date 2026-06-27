// Donkeycraft — Configuration
// Game configuration: render distance, chunk size, tick rates, keybinds, physics, and persistence.
// All values are constants — do not modify at runtime.
(function() {
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
    Donkeycraft.Config = (function() {
        return {
            // World settings
            CHUNK_SIZE: 16,           // Chunks are 16 blocks wide/deep
            WORLD_HEIGHT: 256,        // Total world height (0 to 255)
            RENDER_DISTANCE: 8,       // Render radius in chunks (default, adjustable)
            MAX_RENDER_DISTANCE: 12,  // Hard cap on render distance for performance
            SEED: 42,                 // Default world seed

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
            PLAYER_FLY_SPEED: 5.0,      // Creative fly speed
            PLAYER_FLY_SPEED_BOOST: 10.0, // Creative fly speed with sprint
            PLAYER_JUMP_FORCE: 0.42,    // Jump velocity
            PLAYER_REACH: 6.0,          // Block interaction reach distance

            // Camera settings
            FOV: 70,                    // Field of view (degrees)
            MOUSE_SENSITIVITY: 0.15,    // Mouse look sensitivity
            MOUSE_SCROLL_SENSITIVITY: 1,// Hotbar scroll sensitivity

            // Physics
            GRAVITY: -20.0,                        // Gravity acceleration (blocks/s^2)
            TERMINAL_VELOCITY: -40.0,              // Max fall speed (blocks/s)
            FLYING_TERMINAL_VELOCITY: -20.0,       // Max downward fly speed (blocks/s)

            // Player mechanics
            SWIM_BOOST: 0.15,            // Upward velocity boost when swimming with jump (blocks/s)
            JUMP_COOLDOWN: 0.1,          // Cooldown between jumps (seconds)
            FALL_DAMAGE_THRESHOLD: 3,    // Blocks of free fall before damage begins

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
                SPRINT: 'ShiftLeft',
                SNEAK: 'ControlLeft',
                INVENTORY: 'KeyE',
                DEBUG_SCREEN: 'F3',
                FLY_TOGGLE: 'F5',
                PICK_ITEM_1: 'Digit1',
                PICK_ITEM_2: 'Digit2',
                PICK_ITEM_3: 'Digit3',
                PICK_ITEM_4: 'Digit4',
                PICK_ITEM_5: 'Digit5',
                PICK_ITEM_6: 'Digit6',
                PICK_ITEM_7: 'Digit7',
                PICK_ITEM_8: 'Digit8',
                PICK_ITEM_9: 'Digit9',
                DROP_ITEM: 'KeyQ'
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
            END_SCALE: 1              // Overworld coords × 1 = End coords
        };
    })();

})();