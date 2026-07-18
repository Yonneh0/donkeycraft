
add/improve mining:
left mouse button, or tapping/holding "T", should mine the block, infront of the player.
blocks should have health, and require a specific amount of mining, to complete.
each hit, should apply a randomly generated fractal crack overlay on the block, with more fractures near where it was hit. these should be cumulitive- each hit adding more fractures to the pattern, depending on the hit location
when destroyed, the block should drop to the ground, as a spinning animated inventory item, that the player has to run over to pick up.
when the player runs over blocks on the ground, they should be automatically scooped up into their inventory, and properly added to existing stacks.
ensure the system is robust, and covers all possible UX.
different materials should have different health and hardness settings, to require different mining tools, and speeds.
implement the different mining tools, with intuitive stat displays, damage level, etc
ensure everything is highly polished and release ready. every visual change should have an associated animation or transition
perform a final polishing pass, auding code for poor programming practices, and bugs- ensure everything is extremely robust, with proper jsDoc documentation, covered in the subfolder readme. update the core @/README.md with new files and functionality.

@/README.md perform a thorough functional audit on `src/render/map-renderer.js`, and all references.
- fix all bugs
- finish all incomplete functions
- ensure everything is 100% functional and complete, with robust error handling and jsdocs
- ensure all functionality is properly linked up where it is supposed to be.
- perform a final polishing pass, to ensure everything is efficient, and release ready.
- perform your updates in targeted replace_in_file calls.
- ensure all external usage is appropriate, and performing as expected

@/src/ui/minimap.js @/src/ui/map.js @/src/render/map-renderer.js


- search the project for duplicate css or related orphaned code, and clean it up
  

`src/ui/minimap.css` `src/ui/minimap.js`
`src/ui/map.css` `src/ui/map.js`
`src/ui/tod.js` `src/ui/tod.css`
`src/render/map-renderer.js`

`index.html` `src/core.css` `src/game.js`



---

@/src/render/water-renderer.js @/README.md @/src/render/geometry-builder.js @/src/render/gl-context.js @/src/render/lighting.js @/src/render/map-renderer.js @/src/render/mesh-optimizer.js @/src/render/shader-manager.js @/src/render/terrain-renderer.js @/src/render/entity-renderer.js @/src/render/chunk-mesh.js @/src/render/camera.js @/src/render/break-particles.js @/src/render/weather.js @/src/render/sky.js 
perform a thorough functional audit on the rendering pipeline, and all references.
- fix all bugs. carefully review all face ordering, texture atlas uv coordinates- all of the common issues- there are several small issues and a couple large ones.
- finish all incomplete functions
- ensure everything is 100% functional and complete, with robust error handling and jsdocs
- ensure all functionality is properly linked up where it is supposed to be.
- perform a final polishing pass, to ensure everything is efficient, and release ready.
- perform your updates in targeted replace_in_file calls.
- ensure all external usage is appropriate, and performing as expected

---

design and implement selection renderer/selected item UI panel:
new files
  - src/render/selection-renderer.js
    - renders faint gridlines over, and highlights the player's selection (target) block, or entity.
    - for entities- should just be wire frame cube, highlighting the blocks that the entity is occupying
  - src/ui/selection-ui.js
    - compact panel, offset to the right of the hotbar, showing the player's current target info:
    - inventory icon, display name, distance, heading
    - for entities, show health bar, other stats, etc
  - src/ui/selection-ui.css
    - animations and styles for the selected item panel
  
the player's selected item should be maintained by the player object- with efficient caching. when the player moves/is moved- it should simply raycast the player's crosshair, and return the first block or entity hit- and store that for external access

add config variable for max selection distance, default 10 meters
if selection is air - selection renderer should no-op

---

perform a thorough functional audit on these modules, and all references.
- fix all bugs.
- finish all incomplete functions
- ensure everything is 100% functional and complete, with robust error handling and jsdocs
- ensure all functionality is properly linked up where it is supposed to be.
- perform a final polishing pass, to ensure everything is efficient, and release ready.
- perform your updates in targeted replace_in_file calls.
- ensure all external usage is appropriate, and performing as expected
- ensure it is properly represented in @/README.md

redesign, and implement Inventory (including Creative Inventory)
don't worry about icons or items yet- review hotbar for item slot placement example.
the inventory should occupy the right 1/3 of the screen when opened, 100px from the top, 25px from the right, and 25px from the bottom of the screen.
across the top, should be a titlebar, with "Inventory of Player" with a close [X] button in the top right.
the main content is split between 2 panes:
  on the right, there should be 9 inventory slots, in a vertical stack. These are Container slots: the icon should be 15% larger than the inventory icons
  on the left, there should be a player paperdoll, surrounded by armor /equipment slots:
    starting to the left of the player's head, there is a stack of 4 inventory slots, a half-space, then a 5th inventory slot
    on the right of the player, there should be 8 slots, in 2 columns of 4, then a half space, and 2 more slots- horizontally aligned with the one on the left.
below the paperdoll, taking up the bottom 2/5 of the inventory, is the actual inventory:
43 rows of 6 inventory icons, with a vertical scrollbar. (258 slots)
the inventory should have a fast (1s) transition in, and scale up, from the bottom center of the screen (to look like it is coming out of the hotbar)
it should have a slow (2s) fade/dissolve out, in-place.



this implementation is purely visual- none of the slots should be tied to anything. For initial testing, add a button to the left of the hotbar, to open and close the inventory. the button should have a backpack emoji/unicode




## Additional Suggestions for Robust Maintainability

1. __Event-Driven Architecture__: Use EventBus for all item events (`item:added`, `item:removed`, `item:durability:changed`, `item:consumed`). This decouples systems and makes debugging easier.

2. __Item Use Case System__: Define how items are used:

   - `onBlockBreak(player, block, itemStack)` — Tool usage
   - `onBlockPlace(player, blockPos, itemStack)` — Placement
   - `onRightClick(world, player, itemStack)` — Interaction
   - `onFoodEaten(player, itemStack)` — Consumption
   - `onArmorEquipped(player, slot, itemStack)` — Equipment

3. __Item Tag System Extension__: Expand NBT-like tags to support:

   - `customName` — Player-defined display name
   - `enchantments` — Array of {id, level}
   - `attributeModifiers` — Attack damage, speed, etc.
   - `lore` — Additional description text
   - `repairCost` — Anvil repair cost

4. __Item Crafting Integration__: Create a `ItemCrafting` module that bridges with the existing recipe system, allowing crafted items to be properly instantiated with correct properties.

5. __Item Drop System__: Extend the existing `block-action.js` break system to drop proper ItemStacks instead of raw block IDs. Use `ItemDefinitionRegistry` to look up the correct item for drops.

6. __Item Tooltip System__: Create a universal tooltip that shows on hover, displaying:

   - Item name (with rarity color: white/common, green/uncommon, blue/rare, purple/epic, gold/legendary)
   - Durability if applicable
   - Enchantments with tooltip descriptions
   - "Right-click to split" hint
   - "Shift+click to move" hint

7. __Item Rarity System__: Add rarity levels that affect tooltip color and potentially drop rates:

   - Common (white), Uncommon (green), Rare (blue), Epic (purple), Legendary (orange)

8. __Item Sound Effects__: Integrate with the existing `sound-manager.js` to play sounds on:

   - Item pickup
   - Item drop
   - Item break (durability reaches 0)
   - Food eating
   - Potion drinking

9. __Item Animation System__: For first-person hand rendering, show different animations based on item type:

   - Eating/drinking animation
   - Tool swing animation
   - Bow draw animation
   - Potion throw animation

10. __Serialization Versioning__: Include a version number in serialized item data to handle future schema changes gracefully during world upgrades.



---

@/skybox_implementation.md @/README.md @/changes.diff 
perform a thorough functional audit on the entire skybox system, initialization, timers, events, integration with time of day controls/system, etc.
@/src/render/sky.js @/index.html @/src/ui/tod.js @/src/game.js 
- fix all bugs
- finish all incomplete functions
- ensure everything is 100% functional and complete, with robust error handling and jsdocs
- ensure all functionality is properly linked up where it is supposed to be.
- perform a final polishing pass, to ensure everything is efficient, and release ready.
- perform your updates in targeted replace_in_file calls.
- ensure all external usage is appropriate, and performing as expected

---
src/entitles/skybox.js has a standard skybox defined in the following format. do not attempt to read this file, it is 2.5mb.
```
// === Texture Export - Generated by Texture Pack Extractor ===
// Image: Daylight Box UV.png
// Chunk Size: 512x512 | Gap: 0x0 | Offset: (0, 0) | Grid: 3 rows x 4 cols

var texture_row0_col1 = "data:image/png;base64,iVBORw0KGgoAAAA...";
var texture_row1_col0 = "data:image/png;base64,iVBORw0KGgoAAAA...";
var texture_row1_col1 = "data:image/png;base64,iVBORw0KGgoAAAA...";
var texture_row1_col2 = "data:image/png;base64,iVBORw0KGgoAAAA...";
var texture_row1_col3 = "data:image/png;base64,iVBORw0KGgoAAAA...";
var texture_row2_col1 = "data:image/png;base64,iVBORw0KGgoAAAA...";

// === End Export ===
```