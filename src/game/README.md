# Donkeycraft Game Systems

Comprehensive API reference for all game systems in Donkeycraft. This documentation is organized by subsystem to help AI assistants quickly find relevant functionality without scanning individual source files.

## Table of Contents

- [Core Data & Rendering](#core-data--rendering)
  - [README-core-data.md](README-core-data.md) — Block definitions, models, texture atlas
- [World & Chunk Management](#world--chunk-management)
  - [README-world.md](README-world.md) — Chunks, dimensions, biomes, terrain surface
- [Player Systems](#player-systems)
  - [README-player.md](README-player.md) — Player entity, movement, collision, game mode, hunger, stats
- [NPC/Mob System](#npcmob-system)
  - [README-npc.md](README-npc.md) — Entities, passive/hostile/boss mobs, AI
- [Combat & Items](#combat--items)
  - [README-combat.md](README-combat.md) — Damage, tools, enchantments, potions, projectiles, experience
- [Redstone Engine](#redstone-engine)
  - [README-redstone.md](README-redstone.md) — Core engine, wiring, repeaters, pistons, TNT
- [Block Interactions](#block-interactions)
  - [README-interaction.md](README-interaction.md) — Placement, breaking, raycast, portals, recipes
- [Physics & Environment](#physics--environment)
  - [README-physics-env.md](README-physics-env.md) — Physics, lighting, time

## Quick Reference Table

| File | Subsystem | Description |
|------|-----------|-------------|
| [block.js](README-core-data.md#block--blockregistry) | Core Data | Block definitions registry (256+ vanilla blocks) |
| [block-types.js](README-core-data.md#blocktypes) | Core Data | Block type classification (solid, transparent, liquid) |
| [block-state.js](README-core-data.md#blockstate--blockstateregistry) | Core Data | Block state metadata system (variants, properties) |
| [block-models.js](README-core-data.md#blockmodel--blockmodelregistry) | Core Data | Baked 3D models with ambient occlusion data |
| [texture-atlas.js](README-core-data.md#textureatlas) | Core Data | WebGL texture atlas generation |
| [chunk.js](README-world.md#chunk) | World | Chunk data structure (16×256×16 block array) |
| [chunk-manager.js](README-world.md#chunkmanager) | World | Chunk loading/unloading, dirty tracking |
| [dimension.js](README-world.md#dimensions) | World | Overworld/Nether/End dimensions |
| [world-utils.js](README-world.md#worldutils) | World | Shared coordinate/block access utilities |
| [biome.js](README-world.md#biomes) | World | Biome definitions (temperature, rainfall, colors, spawn rates) |
| [terrain-surface.js](README-world.md#terrain-surface) | World | Terrain surface layer application per biome |
| [player.js](README-player.md#player) | Player | Player entity (position, velocity, rotation) |
| [movement.js](README-player.md#movement) | Player | Walking, sprinting, swimming, flying physics |
| [collision.js](README-player.md#collision) | Player | AABB collision detection & response |
| [jumping.js](README-player.md#jumping) | Player | Jump mechanics, swimming upward |
| [flying.js](README-player.md#flying) | Player | Creative/spectator fly mode management |
| [game-mode.js](README-player.md#gamemode) | Player | Survival/Creative/Spectator behaviors |
| [hunger.js](README-player.md#hunger) | Player | Hunger mechanics, starvation, auto-regeneration |
| [stats.js](README-player.md#playerstats) | Player | Block mined/placed, mobs killed, distance walked |
| [entity.js](README-npc.md#entity) | NPC | Base entity class (all entities inherit) |
| [entity-manager.js](README-npc.md#entitymanager) | NPC | Entity lifecycle, spawn/despawn, tick |
| [passive-mobs.js](README-npc.md#passivemob) | NPC | Cow, pig, sheep, chicken AI |
| [animals.js](README-npc.md#animal) | NPC | Animal breeding, leads, baby speed |
| [hostile-mobs.js](README-npc.md#hostilemob) | NPC | Zombie, skeleton, spider, creeper, enderman |
| [boss-mobs.js](README-npc.md#bossmob) | NPC | Ender Dragon, Wither boss mechanics |
| [mob-ai.js](README-npc.md#mobai) | NPC | Pathfinding, line-of-sight, chase/flee utilities |
| [damage.js](README-combat.md#hurtbox) | Combat | HurtBox, damage reception, knockback, fall damage |
| [tool.js](README-combat.md#tool--toolregistry) | Combat | Tool materials, speed multipliers, durability |
| [enchantment.js](README-combat.md#enchantmentregistry) | Combat | Enchantment registry, compatibility rules |
| [potion.js](README-combat.md#potion-registry) | Combat | Brewing recipes, potion effects, active management |
| [projectiles.js](README-combat.md#projectile) | Combat | Arrows, snowballs, ender pearls, dragon breath |
| [experience.js](README-combat.md#experience) | Combat | XP levels, points, orb pickup, spending |
| [redstone-engine.js](README-redstone.md#redstoneengine) | Redstone | Core tick orchestrator (20 TPS) |
| [wiring.js](README-redstone.md#redstonewiring) | Redstone | Redstone dust/wire signal propagation (0-15) |
| [repeater-comparator.js](README-redstone.md#redstonerepeatercomparator) | Redstone | Repeaters (delay), comparators (modes) |
| [observers.js](README-redstone.md#redstoneobservers) | Redstone | Observer blocks, pulse detection |
| [pistons.js](README-redstone.md#redstonepistons) | Redstone | Push/pull mechanics, crush detection |
| [tnt.js](README-redstone.md#redstonetnt) | Redstone | Fuse timers, explosion logic, block destruction |
| [block-placement.js](README-interaction.md#blockplacement) | Interaction | Face normal handling, grid snapping |
| [block-action.js](README-interaction.md#blockaction) | Interaction | Block breaking, hardness timers, drops |
| [raycast.js](README-interaction.md#raycast) | Interaction | DDA raycasting, hit detection, face normals |
| [interactable-blocks.js](README-interaction.md#interactableblocks) | Interaction | Doors, chests, furnaces, levers, buttons |
| [portal.js](README-interaction.md#portal) | Interaction | Nether portal frame detection, dimension travel |
| [recipe-registry.js](README-interaction.md#recipe-registry) | Interaction | Crafting/smelt recipe registry (shaped, shapeless, smelting) |
| [physics.js](README-physics-env.md#physics) | Physics & Environment | Gravity blocks (sand/gravel), liquid flow |
| [lighting-engine.js](README-physics-env.md#lightingengine) | Physics & Environment | Sky light and block light propagation |
| [time.js](README-physics-env.md#worldtime) | Physics & Environment | 24000 tick day cycle, moon phases |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Game Loop                            │
└─────────────────────────────────────────────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Player    │ │     NPC     │ │   Redstone  │ │  Interaction│
│  Systems    │ │   / Mob     │ │   Engine    │   Systems     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                  World & Rendering                          │
│         Chunks · Dimensions · Biomes · Textures · Lighting  │
└─────────────────────────────────────────────────────────────┘
```

## Subsystem Documentation

- [Core Data & Rendering](README-core-data.md) — Block definitions, models, texture atlas
- [World & Chunk Management](README-world.md) — Chunks, dimensions, biomes, terrain surface
- [Player Systems](README-player.md) — Player entity, movement, collision, game mode, hunger, stats
- [NPC/Mob System](README-npc.md) — Entities, passive/hostile/boss mobs, AI
- [Combat & Items](README-combat.md) — Damage, tools, enchantments, potions, projectiles, experience
- [Redstone Engine](README-redstone.md) — Core engine, wiring, repeaters, pistons, TNT
- [Block Interactions](README-interaction.md) — Placement, breaking, raycast, portals, recipes
- [Physics & Environment](README-physics-env.md) — Physics, lighting, time

## Key Patterns

### Constructor Pattern
All game systems follow a consistent constructor pattern:
```javascript
Donkeycraft.SystemName = function (dependencies) {
    this._dependency = dependencies;
    // ... initialization
};
Donkeycraft.SystemName.prototype = Object.create(Donkeycraft.BaseClass.prototype);
```

### Event Bus Integration
Systems communicate via the global EventBus:
```javascript
if (Donkeycraft.EventBus) {
    Donkeycraft.EventBus.emitSafe('eventName', { data });
}
```

### Namespace Pattern
All public APIs are exposed under `window.Donkeycraft`:
```javascript
(function () {
    'use strict';
    var Donkeycraft = window.Donkeycraft;
    // ... implementation
})();
```

### Destroy Pattern
All systems implement a destroy() method for cleanup:
```javascript
Donkeycraft.SystemName.prototype.destroy = function () {
    this._dependency = null;
    // free resources
};