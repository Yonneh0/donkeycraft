# Donkeycraft UI Module

UI subsystem for Donkeycraft — DOM-based rendering, inventory management, and GUI interaction.

## Table of Contents

| File | Description |
|------|-------------|
| [anvil-ui.js](#anvilui) | Anvil GUI for renaming, repairing, and enchantment merging |
| [chest-ui.js](#chestui) | Chest inventory GUI (27 or 54 slots) with drag-drop support |
| [crafting-grid.js](#craftinggrid) | 3×3 crafting table with recipe matching and result output |
| [creative-inventory.js](#creativeinventory) | Creative mode inventory with tabs, search, and grid display |
| [debug-overlay.js](#debugoverlay) | F3 debug screen collecting FPS, coords, chunk, and biome data |
| [enchanting-ui.js](#enchantingui) | Enchanting table GUI with random enchantment options and XP validation |
| [furnace-ui.js](#furnaceui) | Furnace GUI with fuel/input/output slots and progress tracking |
| [gui-elements.js](#gui-elements) | Reusable DOM components: drag-drop, buttons, tabs, text input |
| [gui-manager.js](#guimanager) | Central GUI manager — modal stacking, keyboard routing, input dispatch |
| [health-bar.js](#healthbar) | Heart-based health display with animations and overlay effects |
| [hotbar.js](#hotbar) | Player hotbar (9 slots) with selection highlighting |
| [hunger-bar.js](#hungerbar) | Drumstick-based hunger display with animations |
| [inventory.js](#inventory) | Generic inventory data structure with slot management and shift-click |
| [item-stack.js](#itemstack) | Core ItemStack data structure (ID, count, NBT tag, enchantments) |
| [keybindings-panel.js](#keybindingspanel) | Display-only top-center keybinding display panel |
| [loading-screen.js](#loadingscreen) | Loading screen with progress bar, tips, and error handling |
| [xp-bar.js](#xppar) | Animated XP bar with progressive level badge visualization |

---

## AnvilUI

**Constructor:** `new Donkeycraft.AnvilUI(container)`

### State
| Method | Returns | Description |
|--------|---------|-------------|
| `getLeftSlot()` | `ItemStack\|null` | Left input slot content |
| `getRightSlot()` | `ItemStack\|null` | Right input slot content |
| `getResultSlot()` | `ItemStack\|null` | Output/result slot content |
| `getRenameText()` | `string` | Current rename text |
| `setRenameText(text)` | `boolean` | Set rename text |
| `getPrice()` | `number` | XP level cost |
| `getPlayer()` | `Player\|null` | Player reference (for XP validation) |
| `canAffordPrice()` | `boolean` | Whether player has enough levels |

### Slot Management
| Method | Returns | Description |
|--------|---------|-------------|
| `setLeftSlot(stack)` | `boolean` | Set left input slot |
| `setRightSlot(stack)` | `boolean` | Set right input slot |
| `takeResult()` | `ItemStack\|null` | Take result (deducts XP) |
| `calculateResult()` | `ItemStack\|null` | Recalculate output |

### Input Handling
| Method | Returns | Description |
|--------|---------|-------------|
| `handleClick(x, y, button)` | — | Handle mouse click (0=left, 2=right) |
| `handleDrop(itemStack, slotIndex)` | `boolean` | Drop item onto anvil (slot 0 or 1) |
| `handleKeyPress(key)` | `boolean` | Route keyboard input |

### Events
| Method | Description |
|--------|-------------|
| `onResultChange(callback)` → `unsubscribe` | Fired when result changes |
| `onSlotChange(callback)` → `unsubscribe` | Fired when a slot changes `(index, newStack, oldStack)` |

### Lifecycle
| Method | Description |
|--------|-------------|
| `setPlayer(player)` | Set player reference for XP validation |
| `destroy()` | Clean up resources |

---

## ChestUI

**Constructor:** `new Donkeycraft.ChestUI(container, config)`

### Config Options
- `doubleChest` (boolean) — 54 slots if true, 27 default
- `chestKey` (string) — Storage key for persistence
- `preloadedSlots` (array) — Pre-loaded slot data

### State
| Method | Returns | Description |
|--------|---------|-------------|
| `isDoubleChest()` | `boolean` | Whether this is a double chest |
| `getSlotCount()` | `number` | Total slots (27 or 54) |
| `getSlot(index)` | `ItemStack\|null` | Get slot content |
| `setSlot(index, stack)` | `boolean` | Set slot content |
| `takeItem(index)` | `ItemStack\|null` | Take entire stack from slot |
| `takePartialItem(index, count)` | `ItemStack\|null` | Take partial amount from slot |

### Input Handling
| Method | Returns | Description |
|--------|---------|-------------|
| `handleClick(slotIndex, button)` | `ItemStack\|null` | Left-click takes full, right-click takes half |
| `handleDrop(itemStack, slotIndex)` | `boolean` | Drop item (slot -1 = first empty) |
| `handleKeyPress(key)` | `boolean` | Digit0-9 quick-move, Q drop first slot |

### Persistence
| Method | Returns | Description |
|--------|---------|-------------|
| `loadData(data)` | — | Load from `{key, slots}` object |
| `serializeData()` | `Object` | Serialize current state |

### Events
| Method | Description |
|--------|-------------|
| `onSlotChange(callback)` → `unsubscribe` | Slot change event |
| `onDrop(callback)` → `unsubscribe` | Drop event (Q key or drag) |

### Lifecycle
| Method | Description |
|--------|-------------|
| `destroy()` | Clean up resources |

---

## CraftingGrid

**Constructor:** `new Donkeycraft.CraftingGrid(container, recipeRegistry)`

### State
| Method | Returns | Description |
|--------|---------|-------------|
| `getGrid()` | `Array` | Flat array of 9 ItemStack\|null |
| `getGridAs2D()` | `number[][]` | 3×3 array of block IDs (0 = empty) |
| `getResultStack()` | `ItemStack\|null` | Current crafted result |
| `matchRecipe()` | `Recipe\|null` | Match current grid against recipes |
| `isMatchValid()` | `boolean` | Whether grid matches any recipe |

### Slot Management
| Method | Returns | Description |
|--------|---------|-------------|
| `setGridSlot(index, stack)` | `Object` | Set ingredient `{oldStack, newStack}` |
| `clearGrid()` | — | Clear all ingredients and result |
| `takeResult()` | `ItemStack\|null` | Take crafted result |

### Input Handling
| Method | Returns | Description |
|--------|---------|-------------|
| `handleKeyPress(key, hotbarItem)` | `boolean` | Enter takes result, Digit1-9 places items |

### Events
| Method | Description |
|--------|-------------|
| `onResultChange(callback)` → `unsubscribe` | Fired when result changes |

### Lifecycle
| Method | Description |
|--------|-------------|
| `destroy()` | Clean up resources |

---

## CreativeInventory

**Constructor:** `new Donkeycraft.CreativeInventory(container)`

### Tabs
| Method | Returns | Description |
|--------|---------|-------------|
| `getTabs()` | `string[]` | Available tab names |
| `getCurrentTab()` | `string` | Current active tab |
| `selectTab(tabName)` | — | Switch to a different tab |

### Item Lookup
| Method | Returns | Description |
|--------|---------|-------------|
| `searchItems(query)` | `number[]` | Search across all tabs by name or ID |
| `getItemByIndex(index)` | `number` | Get item ID at grid index in current tab |
| `getGridSize()` | `{rows, cols}` | Grid dimensions |
| `getItemCount()` | `number` | Number of visible items (after filter) |
| `getSelectedItem()` | `number\|null` | Currently selected item ID |
| `setSelectedItem(itemId)` | — | Set selected item (keyboard nav) |

### Events
| Method | Description |
|--------|-------------|
| `onItemSelected(callback)` → `unsubscribe` | Item clicked/selected `(itemId)` |
| `onTabChange(callback)` → `unsubscribe` | Tab changed `(newTab, oldTab)` |

### Lifecycle
| Method | Description |
|--------|-------------|
| `destroy()` | Clean up resources |

---

## DebugOverlay

**Constructor:** `new Donkeycraft.DebugOverlay(eventBus, config)`

### State Access
| Method | Returns | Description |
|--------|---------|-------------|
| `getFPS()` | `number` | Current FPS |
| `setFPS(fps)` | — | Set FPS directly |
| `getPlayerCoords()` | `{x, y, z, pitch, yaw, mode}` | Player position & rotation |
| `getChunkInfo()` | `{loaded, renderDistance}` | Chunk debug data |
| `getBiomeName()` | `string` | Current biome name |
| `getGameMode()` | `string` | Current game mode |
| `getLightLevels()` | `{sky, block}` | Light levels (0-15) |
| `collectData(player, chunkManager)` | `Object` | Complete debug data object |

### References
| Method | Description |
|--------|-------------|
| `setTimer(timer)` | Set Timer reference for delta time |
| `setPlayer(player)` | Set player reference |
| `setChunkManager(chunkManager)` | Set chunk manager reference |
| `setBiome(biome)` | Set biome definitions |
| `setGameMode(mode)` | Set game mode string |
| `setTerrainRenderer(renderer)` | Set terrain renderer for stats |
| `setWireframeRenderer(renderer)` | Set wireframe renderer reference |

### Lifecycle
| Method | Description |
|--------|-------------|
| `update(player, chunkManager)` | Update data and render DOM |
| `startListening()` | Auto-update on each render frame |
| `stopListening()` | Stop auto-updating |
| `destroy()` | Clean up resources |

---

## EnchantingUI

**Constructor:** `new Donkeycraft.EnchantingUI(container)`

### State
| Method | Returns | Description |
|--------|---------|-------------|
| `getInputSlot()` | `ItemStack\|null` | Input slot (item to enchant) |
| `setInputSlot(stack)` | `boolean` | Set input slot |
| `getLapisCount()` | `number` | Current lapis lazuli count |
| `setLapisCount(n)` | `boolean` | Set lapis count (non-negative int) |
| `setPlayerLevels(levels)` | `boolean` | Set player XP levels |
| `getAvailableEnchantments()` | `Array` | Array of `{id, name, level, cost, lapisCost}` |
| `getLevelCost()` | `number` | XP cost for selected option |

### Enchantment Operations
| Method | Returns | Description |
|--------|---------|-------------|
| `selectEnchantment(index)` | — | Select option 0, 1, or 2 |
| `applyEnchantment()` | `ItemStack\|null` | Apply enchantment to input item |
| `takeResult()` | `Object\|null` | Take enchanted output `{item, levelCost, lapisCost}` |

### Input Handling
| Method | Returns | Description |
|--------|---------|-------------|
| `handleKeyPress(key)` | `boolean` | Route keyboard input |

### Events
| Method | Description |
|--------|-------------|
| `onResultChange(callback)` → `unsubscribe` | Fired when result changes |

### Lifecycle
| Method | Description |
|--------|-------------|
| `destroy()` | Clean up resources |

---

## FurnaceUI

**Constructor:** `new Donkeycraft.FurnaceUI(container)`

### Slots
| Method | Returns | Description |
|--------|---------|-------------|
| `getInputSlot()` | `ItemStack\|null` | Input slot (index 1) |
| `getFuelSlot()` | `ItemStack\|null` | Fuel slot (index 0) |
| `getOutputSlot()` | `ItemStack\|null` | Output slot (index 2) |
| `setSlot(index, stack)` | `boolean` | Set any slot |
| `getSlotCount()` | `number` | Always 3 |
| `getSlots()` | `Array` | Copy of all slots |

### Progress
| Method | Returns | Description |
|--------|---------|-------------|
| `getProgress()` | `number` | Burn progress (0.0–1.0) |
| `setProgress(pct)` | `boolean` | Set progress with validation |
| `isBurning()` | `boolean` | Whether furnace is burning |
| `getCookingTime()` | `number` | Current recipe cooking time |
| `getTotalBurnTime()` | `number` | Total burn time of current fuel |
| `hasValidRecipe()` | `boolean` | Whether input has a smelting recipe |
| `resetProgress()` | `boolean` | Reset progress without stopping |

### Fuel Registry (static)
| Method | Returns | Description |
|--------|---------|-------------|
| `FurnaceUI.registerFuel(itemId, burnTime)` | — | Register item as fuel |
| `FurnaceUI.isFuel(itemId)` | `boolean` | Check if item is fuel |
| `FurnaceUI.getFuelBurnTime(itemId)` | `number` | Get burn time for item ID |
| `FurnaceUI.getSmeltableItems()` | `number[]` | All smeltable item IDs |
| `FurnaceUI.getFuelCount()` | `number` | Number of registered fuel types |

### Tick & Events
| Method | Returns | Description |
|--------|---------|-------------|
| `tick()` | `Object\|null` | Advance one tick, return output if ready |
| `setTimer(timer)` | `boolean` | Set Timer for auto-ticking |
| `startListening()` | — | Auto-tick on render frame |
| `stopListening()` | — | Stop auto-ticking |
| `onSlotChange(callback)` → `unsubscribe` | — | Slot change event |
| `onProgressChange(callback)` → `unsubscribe` | — | Progress change event |
| `onOutputReady(callback)` → `unsubscribe` | — | Smelting complete event |

### Lifecycle
| Method | Description |
|--------|-------------|
| `destroy()` | Clean up resources |

---

## GuiElements

Collection of reusable DOM UI components.

### GuiDragDrop
**Constructor:** `new Donkeycraft.GuiDragDrop(container, options)`

| Method | Returns | Description |
|--------|---------|-------------|
| `on(event, callback)` → `unsubscribe` | `Function` | Subscribe to `drag:start`, `drag:end` |
| `isDragging()` | `boolean` | Check if drag is active |
| `cancelDrag()` | — | Cancel current drag |
| `destroy()` | — | Clean up listeners |

### GuiButton
**Constructor:** `new Donkeycraft.GuiButton(text, options)`

| Method | Returns | Description |
|--------|---------|-------------|
| `getElement()` | `HTMLButtonElement` | Get button DOM element |
| `setText(text)` | — | Update label |
| `getText()` | `string` | Get current label |
| `setDisabled(disabled)` | — | Enable/disable button |
| `isDisabled()` | `boolean` | Check disabled state |
| `setVisible(visible)` | — | Show/hide button |
| `isVisible()` | `boolean` | Check visibility |
| `onClick(callback)` → `unsubscribe` | — | Click event |
| `onMouseEnter(callback)` → `unsubscribe` | — | Mouse enter event |
| `onMouseLeave(callback)` → `unsubscribe` | — | Mouse leave event |
| `destroy()` | — | Remove from DOM |

### GuiTabNavigator
**Constructor:** `new Donkeycraft.GuiTabNavigator(container, tabs, options)`

| Method | Returns | Description |
|--------|---------|-------------|
| `getElement()` | `HTMLElement\|null` | Root container element |
| `getActiveTab()` | `number` | Current tab index |
| `getTabCount()` | `number` | Total tabs |
| `getTabName(index)` | `string\|null` | Tab name by index |
| `setContent(html)` | — | Set active tab content |
| `setContentForTab(index, html)` | — | Set content for specific tab |
| `getContentForTab(index)` | `string` | Get content for specific tab |
| `on(event, callback)` → `unsubscribe` | — | Subscribe to `tab:change`, `close` |
| `destroy()` | — | Clean up DOM and listeners |

### GuiTextInput
**Constructor:** `new Donkeycraft.GuiTextInput(options)`

| Method | Returns | Description |
|--------|---------|-------------|
| `getElement()` | `HTMLInputElement` | Get input DOM element |
| `getValue()` | `string` | Get current value |
| `setValue(value)` | — | Set value (fires input events) |
| `getMaxLength()` | `number` | Max input length |
| `setMaxLength(max)` | — | Set max length |
| `setError(error, message)` | — | Set/clear error state |
| `isErrored()` | `boolean` | Check error state |
| `focus()` | — | Focus input |
| `blur()` | — | Blur input |
| `setVisible(visible)` | — | Show/hide |
| `isVisible()` | `boolean` | Check visibility |
| `onInput(callback)` → `unsubscribe` | — | Input event `(value)` |
| `onBlur(callback)` → `unsubscribe` | — | Blur event `(value)` |
| `onKeyDown(callback)` → `unsubscribe` | — | Keydown event `(event, value)` |
| `destroy()` | — | Remove from DOM |

---

## GuiManager

**Constructor:** `new Donkeycraft.GuiManager(container, backdrop)`

### GUI Stack
| Method | Returns | Description |
|--------|---------|-------------|
| `open(type, data)` | `Object\|null` | Open GUI `{type, data, ui, panelEl}` |
| `close()` | `Object\|null` | Close top GUI |
| `clearAll()` | — | Close all open GUIs |
| `isOpen()` / `hasOpenScreens()` | `boolean` | Whether any GUI is open |
| `getCurrentType()` | `string\|null` | Type of top GUI |
| `getStack()` | `Array` | Copy of GUI stack |
| `closeTopScreen()` | — | Alias for close |

### Input Routing
| Method | Returns | Description |
|--------|---------|-------------|
| `handleKeyPress(key)` | `boolean` | Route key to top GUI (Escape closes) |
| `handleMouseClick(x, y, button)` | — | Dispatch click to top GUI |
| `handleDrop(itemStack, slotIndex)` | — | Dispatch drop to top GUI |

### Registration & Events
| Method | Description |
|--------|-------------|
| `registerComponent(type, constructor)` | Register UI constructor by type |
| `onOpen(callback)` → `unsubscribe` | GUI opened `(type)` |
| `onClose(callback)` → `unsubscribe` | GUI closed `(type)` |

### Player Reference
| Method | Returns | Description |
|--------|---------|-------------|
| `setPlayer(player)` | — | Set player reference |
| `getPlayer()` | `Player\|null` | Get player reference |

### Lifecycle
| Method | Description |
|--------|-------------|
| `destroy()` | Clean up all resources |

---

## HealthBar

**Constructor:** `new Donkeycraft.HealthBar(container, hurtBox)`

Listens to `health:changed` EventBus events.

| Method | Description |
|--------|-------------|
| `updateFromHealth(data)` | Main entry — `{health, maxHealth, delta}` |
| `resetUI()` | Clear all animations and effects |
| `destroy()` | Clean up DOM, listeners, overlay |

---

## Hotbar

**Constructor:** `new Donkeycraft.Hotbar(container, guiRenderer, canvas)`

### State
| Method | Returns | Description |
|--------|---------|-------------|
| `getSelectedSlot()` | `number` | Currently selected slot (0-8) |
| `setSelectedSlot(n)` | — | Set selected slot with highlight |
| `selectNext()` | — | Cycle to next slot |
| `selectPrev()` | — | Cycle to previous slot |
| `setSlots(stacks)` | — | Update all 9 slots from ItemStack array |

### Events
| Method | Description |
|--------|-------------|
| `onSlotChange(callback)` → `unsubscribe` | Slot changed `(slotIndex, stack)` |
| `onSelectedChange(callback)` → `unsubscribe` | Selection changed `(newSlot, oldSlot)` |

### Lifecycle
| Method | Description |
|--------|-------------|
| `destroy()` | Clean up resources |

---

## HungerBar

**Constructor:** `new Donkeycraft.HungerBar(container, hunger)`

Listens to `hunger:changed` EventBus events. Right-aligned drumstick display.

| Method | Description |
|--------|-------------|
| `updateFromFood(data)` | Main entry — `{foodLevel, delta}` |
| `resetUI()` | Clear all animations and effects |
| `destroy()` | Clean up DOM, listeners, overlay |

---

## Inventory

**Constructor:** `new Donkeycraft.Inventory(slotCount, title)`

### Slot Management
| Method | Returns | Description |
|--------|---------|-------------|
| `getSlot(index)` | `ItemStack\|null` | Get slot content |
| `setSlot(index, stack)` | `boolean` | Set slot content |
| `clearSlot(index)` | — | Clear a specific slot |
| `getAllSlots()` | `Array` | Copy of all slots |
| `getSlotCount()` | `number` | Total slots |
| `getTitle()` | `string\|null` | Inventory title |

### Item Operations
| Method | Returns | Description |
|--------|---------|-------------|
| `findEmptySlot()` | `number` | First empty slot index (-1 if none) |
| `addItem(stack)` | `number` | Items successfully added |
| `removeItem(stack)` | `ItemStack\|null` | Removed matching items |
| `contains(itemId, count)` | `boolean` | Inventory contains item |
| `getItemCount(itemId)` | `number` | Total count of item across slots |

### Drag & Shift-Click
| Method | Returns | Description |
|--------|---------|-------------|
| `beginDrag(slotIndex)` | `Object\|null` | Start drag from slot |
| `endDrag(dragState)` | — | End drag, restore source slot |
| `processDrop(sourceSlot, targetSlot)` | `ItemStack\|null` | Handle drop, return remaining stack |
| `shiftClick(slotIndex)` | `ItemStack` | Shift-click move (empty on success) |

### Serialization
| Method | Returns | Description |
|--------|---------|-------------|
| `serialize()` | `Object` | `{slots, title}` for JSON |
| `deserialize(data)` | — | Restore from serialized data |
| `getHotbarStacks()` | `Array` | First 9 slots as Hotbar-compatible array |

### Events
| Method | Description |
|--------|-------------|
| `onSlotChange(callback)` → `unsubscribe` | Slot changed `(index, newStack, oldStack)` |

### Lifecycle
| Method | Description |
|--------|-------------|
| `destroy()` | Clean up resources |

---

## ItemStack

**Constructor:** `new Donkeycraft.ItemStack(itemId, count, tag)`

### Core Properties
| Method | Returns | Description |
|--------|---------|-------------|
| `isEmpty()` | `boolean` | True if air or zero count |
| `getItemId()` / `getItem()` | `number` | Block/item ID (0 = air) |
| `getCount()` | `number` | Stack count |
| `setCount(n)` | — | Set count (clamped to 0 min) |
| `increment(n)` | — | Add to count (default 1) |
| `decrement(n)` | — | Subtract from count (clamped) |

### NBT Tag
| Method | Returns | Description |
|--------|---------|-------------|
| `getTag()` | `Object\|null` | NBT metadata object |
| `setTag(tag)` | — | Set tag |
| `hasTag()` | `boolean` | Has non-null tag |

### Durability & Enchantments
| Method | Returns | Description |
|--------|---------|-------------|
| `getDurability()` | `number` | Durability from tag |
| `setDurability(val)` | — | Set durability in tag |
| `getEnchantments()` | `Array` | Array of `{id, level}` |
| `addEnchantment(id, level)` | — | Add/update enchantment |

### Comparison & Stacking
| Method | Returns | Description |
|--------|---------|-------------|
| `matches(other)` | `boolean` | Same ID and tag (ignores count) |
| `canStackWith(other)` | `boolean` | Can merge into one stack |

### Serialization
| Method | Returns | Description |
|--------|---------|-------------|
| `clone()` | `ItemStack` | Deep copy |
| `serialize()` | `Object` | `{id, count, tag}` |
| `static fromObject(obj)` | `ItemStack` | Deserialize from object |
| `toString()` | `string` | Debug string |

---

## KeybindingsPanel

**Constructor:** `new Donkeycraft.KeybindingsPanel()`

Display-only top-center panel. Transparent, non-interactive (pointer-events: none).

| Method | Description |
|--------|-------------|
| `update(input)` | Refresh keybinding display + input lock status |
| `startListening(timer)` | Auto-update on each render frame |
| `stopListening()` | Stop auto-updating |
| `destroy()` | Clean up resources |

---

## LoadingScreen

**Constructor:** `new Donkeycraft.LoadingScreen(container)`

### Static Data
- `Donkeycraft.LoadingScreenTips` — Array of loading tip strings

### API
| Method | Description |
|--------|-------------|
| `updateProgress(percent)` | Set progress bar (0-100, clamped) |
| `setMessage(message)` | Set status message text |
| `showError(errorMessage)` | Display error state |
| `hide()` | Remove from DOM |
| `dispose()` | Remove DOM and free references |

---

## XPBar

**Constructor:** `new Donkeycraft.XPBar(container, experience)`

Listens to `xp:changed` EventBus events. Progressive tier-based badge visualization.

### Tier System (static)
- `XPBar.LEVEL_TIERS` — Array of tier configs `{min, max, text, bg, glow, size, hasText, ambient}`
- `XPBar.TIER_FILL_COLORS` — Fill bar gradient colors per tier

| Method | Description |
|--------|-------------|
| `updateFromExperience(data)` | Main entry — `{level, points, totalXP}` |
| `resetUI()` | Clear all animations and particles |
| `destroy()` | Clean up DOM, listeners, timers |