# AC Client Magic System Implementation Plan

## Overview

Implement a fully functional spellcasting system compatible with the AC client's `Magic.cs` system, adapted for Donkeycraft's voxel sandbox game. The system is completely isolated from existing game systems but integrates with the EventBus for notifications and awards XP on successful casts.

---

## Architecture

### Core Design Principles
- **Isolated system**: Magic system lives in its own namespace `Donkeycraft.Magic`
- **Data-driven**: All spells and components defined as static data tables
- **Event-driven**: Uses Donkeycraft.EventBus for cross-system communication
- **Browser-storage persisted**: Spell book, components, and active enchantments saved to IndexedDB
- **Simple component tracking**: Count-based (not inventory items), no weight limits

### Data Flow
```
Player → SpellBook (learned spells) → ClientMagicSystem (casting)
                                      ↓
                              EnchantmentRegistry (active effects)
                                      ↓
                                 Player Stats
```

---

## File Structure

```
src/game/magic/
  spell-definition.js       — SpellDefinition class + MAGIC_SPELLS data
  spell-formula.js          — SpellFormula class
  spell-component.js        — SpellComponentBase, SpellComponentTable, SPELL_COMPONENTS data
  spell-book.js             — SpellBook, SpellBookPage classes
  enchantment.js            — Enchantment, StatMod classes
  enchantment-registry.js   — EnchantmentRegistry class
  spell-set.js              — SpellSet stub (reserved for future)
  magic-system.js           — ClientMagicSystem singleton
  magic-storage.js          — Browser storage persistence (save/load)

src/ui/
  spellbook-ui.js           — Tabbed spellbook panel DOM
  active-spells-ui.js       — Active buffs list with timers
  spellcasting-ui.js        — Cast panel with components display

spellcasting-test.html      — Standalone test page with all UIs and test assertions
spellcasting-plan.md        — This file
```

---

## Core Data Types

### C# → JavaScript Type Mapping

| C# Type | JavaScript Type | Usage |
|---------|-----------------|-------|
| `UInt32` | `Number` | Spell IDs, component IDs, entity IDs |
| `Int32` | `Number` | Power levels, stat values |
| `Single` (float32) | `Number` | Durations, mana costs, modifiers |
| `Double` (float64) | `Number` | Timestamps (start time, duration) |
| `Byte` (uint8) | `Number` | Boolean flags, category IDs |
| `PTR<T>` | `Object ref` | Not needed for isolated system |

---

## Classes to Implement

### 1. SpellDefinition (`src/game/magic/spell-definition.js`)

**Purpose**: Immutable spell data template.

**Properties**:
- `id` (UInt32) — Unique spell identifier
- `name` (string) — Display name
- `school` (UInt32) — Magic school (1=Enchantment, 2=Invocation, 3=Life, 4=MagicItem, 5=War, 6=Arcane)
- `iconIndex` (UInt32) — Texture atlas index for icon
- `manaCost` (Int32) — MP cost to cast
- `range` (Single) — Cast range in blocks
- `power` (Int32) — Base power level
- `castTime` (Single) — Seconds to complete cast
- `duration` (Single) — Effect duration (0 = instantaneous)
- `componentLoss` (Single) — Chance components are destroyed (0.0-1.0)
- `targetingType` (Byte) — 0=Self, 1=Selected, 2=Free Target, 3=Location
- `targetTypeId` (UInt32) — Required target type filter (0=any)
- `xpReward` (Int32) — XP awarded on successful cast
- `formula` (SpellFormula reference) — Component recipe

**Methods**:
- `static getSpellById(id)` — Lookup by ID
- `static getAllSpells()` — Return all spell definitions
- `static getSpellsBySchool(school)` — Filter by school

---

### 2. SpellFormula (`src/game/magic/spell-formula.js`)

**Purpose**: Component recipe for a spell (up to 8 components).

**Properties**:
- `_comps` (Array<UInt32>) — Up to 8 component IDs
- `_numComps` (Int32) — Number of actual components used

**Methods**:
- `constructor()` — Initialize empty formula
- `addComponent(num, compId)` — Set component at position
- `getComponent(num)` — Get component ID at position
- `getNumComponents()` — Return number of components
- `getTargetingType()` — Derive targeting from formula
- `getPowerLevelOfPowerComponent()` — Return highest power component level

---

### 3. SpellComponentBase (`src/game/magic/spell-component.js`)

**Purpose**: Individual spell component definition.

**Properties**:
- `id` (UInt32) — Unique component identifier
- `name` (string) — Display name
- `category` (UInt32) — Component category (Power, Focus, Coordination, etc.)
- `iconIndex` (UInt32) — Icon atlas index
- `type` (UInt32) — Component type
- `gesture` (UInt32) — Animation gesture ID
- `time` (Single) — Cast time modifier
- `text` (string) — Description text
- `cdm` (Single) — Component degradation modifier

---

### 4. SpellComponentTable (`src/game/magic/spell-component.js`)

**Purpose**: Registry of all spell components.

**Methods**:
- `static getComponent(id)` — Lookup component by ID
- `static getAllComponents()` — Return all components
- `static getComponentsByCategory(category)` — Filter by category

---

### 5. SpellBookPage (`src/game/magic/spell-book.js`)

**Purpose**: Per-spell metadata in the spellbook.

**Properties**:
- `_castingLikelihood` (Single) — Frequency of use (for UI sorting)

---

### 6. SpellBook (`src/game/magic/spell-book.js`)

**Purpose**: Player's learned spells.

**Properties**:
- `_spellbook` (Map<UInt32, SpellBookPage>) — Learned spells

**Methods**:
- `addSpell(spellId, page)` — Learn a spell
- `removeSpell(spellId)` — Forget a spell, returns page data
- `exists(spellId)` — Check if spell is learned
- `getSpell(spellId)` — Get spell book page data
- `transcribeSpells(list)` — Return array of all learned spell IDs
- `clear()` — Remove all spells

---

### 7. StatMod (`src/game/magic/enchantment.js`)

**Purpose**: Stat modification from an enchantment.

**Properties**:
- `stat` (string) — Stat being modified ('attackSkill', 'defenseRating', 'movementSpeed', 'healthRecovery', etc.)
- `modType` (Byte) — 0=Additive, 1=Multiplicative, 2=Override
- `value` (Number) — Modification value

---

### 8. Enchantment (`src/game/magic/enchantment.js`)

**Purpose**: Active spell effect instance on a target.

**Properties**:
- `_id` (UInt32) — Unique enchantment ID (EID), auto-incrementing
- `spellSetId` (UInt32) — Parent SpellSet ID (0 = standalone)
- `spellCategory` (UInt32) — Category for filtering
- `_powerLevel` (Int32) — Current power level
- `_startTime` (Double) — Timestamp when applied
- `_duration` (Double) — Duration in seconds
- `_casterId` (UInt32) — Entity ID of caster
- `_degradeModifier` (Single) — Decay rate per second
- `_degradeLimit` (Single) — Minimum power before removal
- `_lastTimeDegraded` (Double) — Last degradation timestamp
- `_smod` (StatMod) — Stat modification applied

**Methods**:
- `constructor(spellId)` — Create from spell definition
- `getId()` — Get enchantment ID
- `getPowerLevel()` — Get current power (with degradation)
- `getRemainingTime()` — Seconds remaining
- `isExpired()` — Check if duration elapsed
- `applyToTarget(targetStats)` — Apply StatMod to target object
- `removeFromTarget(targetStats)` — Revert StatMod
- `serialize()` / `deserialize(data)` — Persistence

---

### 9. EnchantmentRegistry (`src/game/magic/enchantment-registry.js`)

**Purpose**: Manages all active enchantments on an entity.

**Properties**:
- `_multList` (Array<Enchantment>) — Multiplicative enchantments
- `_addList` (Array<Enchantment>) — Additive enchantments
- `_cooldownList` (Array<Enchantment>) — Cooldown enchantments
- `_vitae` (Enchantment|null) — Death shield
- `_helpfulCount` (UInt32) — Count of beneficial enchantments
- `_harmfulCount` (UInt32) — Count of harmful enchantments

**Methods**:
- `addEnchantment(enchant, listType)` — Add to appropriate list
- `removeEnchantment(eid)` — Remove by ID, returns removed enchantment
- `removeEnchantments(eidList)` — Bulk remove
- `purgeBadEnchantments()` — Remove expired/invalid enchantments
- `updateEnchantments(deltaTime)` — Tick all enchantments, apply degradation
- `getActiveEnchantments()` — Return all active enchantments
- `getEnchantmentCount()` — Total count
- `hasEnchantment(eid)` — Check existence
- `duelEnchantments(challenger, list)` — Conflict resolution
- `serialize()` / `deserialize(data)` — Persistence

---

### 10. ClientMagicSystem (`src/game/magic/magic-system.js`)

**Purpose**: Central controller for spellcasting.

**Properties**:
- `_spellTable` — Reference to SpellComponentTable
- `_selectedSpellId` (UInt32) — Currently selected spell
- `_iconCache` (Map<UInt32, HTMLImageElement>) — Icon caching (for UI)

**Static Methods**:
- `static getInstance()` — Singleton accessor
- `static castSpell(spellId, targetId)` — Cast a spell (static convenience)

**Instance Methods**:
- `selectSpell(spellId)` — Set selected spell
- `castSpell(targetId, targetIsSelected)` — Execute spell cast
  - Validates mana
  - Checks component availability
  - Consumes components based on componentLoss
  - Creates Enchantment
  - Adds to registry
  - Awards XP
  - Fires EventBus events
- `removeEnchantment(eid, notify)` — Remove specific enchantment
- `removeSpell(spellId)` — Remove from spellbook
- `updateEnchantments(deltaTime)` — Tick all enchantments
- `purgeBadEnchantments()` — Clean up expired
- `areSpellComponentsRequired()` — Always true for now
- `getSpellDescription(spellId)` — Get spell description string
- `getSpellName(spellId)` — Get spell name string

---

### 11. SpellSet / SpellSetTierList (`src/game/magic/spell-set.js`)

**Purpose**: Stub classes reserved for future multi-piece enchantment sets (endowment system).

**Implementation**: Minimal stubs matching the C# struct definitions but non-functional.

---

### 12. Magic Storage (`src/game/magic/magic-storage.js`)

**Purpose**: Browser storage persistence for magic system state.

**Storage Keys**:
- `donkeycraft_magic_spellbook` — Learned spells
- `donkeycraft_magic_components` — Component counts
- `donkeycraft_magic_enchantments` — Active enchantments

**Methods**:
- `saveSpellBook(spellBookData)`
- `loadSpellBook()` → spellBookData
- `saveComponents(componentCounts)`
- `loadComponents()` → componentCounts
- `saveEnchantments(enchantmentData)`
- `loadEnchantments()` → enchantmentData
- `clearAll()` — Reset all magic data

---

## Initial Spell Data (46 Spells)

### Basic Enchantments (4)

| ID | Name | School | Mana | Range | Power | Duration | XP | Components |
|----|------|--------|------|-------|-------|----------|-----|------------|
| 1 | Blood Drinker | Enchantment | 5 | 3.0 | 10 | 300s | 3 | 1x Blood Stone |
| 2 | Armor | Enchantment | 10 | Self | 20 | 600s | 5 | 1x Armor Stone |
| 3 | Sprint | Enchantment | 8 | Self | 15 | 300s | 4 | 1x Speed Stone |
| 4 | Heal Self | Life | 15 | Self | 25 | Instant | 5 | 1x Healing Stone |

### Elemental Bolts (7 × 6 = 42)

Each element has Bolt I-VI, Arc I-VI, Streak I-VI:

| Element | Bolt Power | Arc Power | Streak Power |
|---------|------------|-----------|--------------|
| Fire | 10-60 | 15-90 | 20-120 |
| Cold | 10-60 | 15-90 | 20-120 |
| Lightning | 10-60 | 15-90 | 20-120 |
| Acid | 10-60 | 15-90 | 20-120 |
| Poison | 10-60 | 15-90 | 20-120 |
| Nature | 10-60 | 15-90 | 20-120 |
| Undead | 10-60 | 15-90 | 20-120 |

**Targeting**: Bolt = single target, Arc = cone AoE (3 targets), Streak = line (5 targets)

**Mana scaling**: I=5, II=10, III=18, IV=28, V=40, VI=55

**XP scaling**: I=1, II=2, III=3, IV=5, V=7, VI=10

---

## Spell Components (Initial Set)

| ID | Name | Category | IconIndex | Time | CDM |
|----|------|----------|-----------|------|-----|
| 1001 | Blood Stone | Power | 200 | 0.5 | 0.1 |
| 1002 | Armor Stone | Power | 201 | 0.3 | 0.05 |
| 1003 | Speed Stone | Focus | 202 | 0.4 | 0.08 |
| 1004 | Healing Stone | Coordination | 203 | 0.6 | 0.1 |
| 1005 | Fire Stone | Power | 204 | 0.5 | 0.1 |
| 1006 | Cold Stone | Power | 205 | 0.5 | 0.1 |
| 1007 | Lightning Stone | Power | 206 | 0.5 | 0.1 |
| 1008 | Acid Stone | Power | 207 | 0.5 | 0.1 |
| 1009 | Poison Stone | Power | 208 | 0.5 | 0.1 |
| 1010 | Nature Stone | Power | 209 | 0.5 | 0.1 |
| 1011 | Undead Stone | Power | 210 | 0.5 | 0.1 |

---

## UI Components

### 1. Spellbook UI (`src/ui/spellbook-ui.js`)

**Layout**: Tabbed panel, one tab per magic school.
**Theme**: Dark Donkeycraft GUI (dark panels, pixel-art aesthetic).

**Features**:
- Tabs: Enchantment | Invocation | Life | Magic Item | War | Arcane
- Grid of spell icons with names underneath
- Selected spell highlighted with border glow
- Click to select spell → notifies ClientMagicSystem
- Right-click for tooltip (name, description, mana cost, range)
- Sort by: name (default), casting likelihood, power level

**DOM Structure**:
```html
<div class="spellbook-panel">
  <div class="spellbook-tabs">...</div>
  <div class="spellbook-grid">
    <div class="spell-slot selected">
      <img class="spell-icon" src="...">
      <span class="spell-name">Fire Bolt II</span>
    </div>
  </div>
</div>
```

### 2. Active Spells UI (`src/ui/active-spells-ui.js`)

**Layout**: Vertical list of active enchantments.

**Features**:
- Each entry shows: icon, name, power level, countdown timer
- Click to remove (if self-targeted and not expired)
- Color-coded by type (green=helpful, red=harmful, yellow=neutral)
- Auto-refresh every 0.5 seconds for timer display

**DOM Structure**:
```html
<div class="active-spells-panel">
  <div class="active-spell-entry helpful">
    <img class="spell-icon" src="...">
    <span class="spell-name">Sprint</span>
    <span class="spell-power">Power: 15</span>
    <span class="spell-timer">04:32</span>
    <button class="remove-btn">×</button>
  </div>
</div>
```

### 3. Spellcasting UI (`src/ui/spellcasting-ui.js`)

**Layout**: Compact panel showing selected spell + components needed.

**Features**:
- Shows selected spell icon, name, mana cost
- Lists required components with player's available count
- Cast button (disabled if insufficient mana/components)
- Target indicator (Self / Selected Target / Location)
- Cast progress bar (fills during cast time)

**DOM Structure**:
```html
<div class="spellcasting-panel">
  <div class="selected-spell">
    <img class="spell-icon" src="...">
    <span class="spell-name">Fire Bolt III</span>
    <span class="mana-cost">MP: 18</span>
  </div>
  <div class="component-list">
    <div class="component-item">
      <img class="component-icon" src="...">
      <span class="component-name">Fire Stone</span>
      <span class="component-count">5/1</span>
    </div>
  </div>
  <div class="cast-progress"><div class="bar"></div></div>
  <button class="cast-btn" disabled>Cast</button>
</div>
```

---

## Test Page (`spellcasting-test.html`)

### Layout
- Three panels side by side: Spellbook | Active Spells | Spellcasting
- Control panel below with test buttons
- Console log viewer for event debugging

### Mock Player Entity
```javascript
var mockPlayer = {
    entityId: 1,
    mana: 100,
    maxMana: 100,
    xp: 0,
    xpLevel: 0,
    stats: {
        attackSkill: 50,
        defenseRating: 30,
        movementSpeed: 1.0,
        healthRecovery: 0.5
    },
    position: { x: 0, y: 64, z: 0 }
};
```

### Test Controls
- **Learn Spells**: Buttons to learn all 46 spells at once or individually
- **Add Components**: Buttons to add specific components in specific quantities
- **Cast Spell**: Dropdown to select spell + target type (Self / Mock Target)
- **Apply Damage**: Simulate target taking damage to test Blood Drinker
- **Remove Enchantments**: Button to remove specific enchantment by ID
- **Purge Expired**: Manual trigger for purgeBadEnchantments
- **Save/Load**: Buttons to force save/load from browser storage
- **Reset All**: Clear all magic data and reset

### Test Assertions
1. SpellBook.addSpell returns true, exists returns true
2. SpellBook.removeSpell returns correct page data, exists returns false after
3. SpellBook.transcribeSpells returns correct count
4. Enchantment constructor creates with correct properties
5. Enchantment.getRemainingTime decreases over time
6. Enchantment.isExpired returns true after duration
7. EnchantmentRegistry.addEnchantment adds to correct list
8. EnchantmentRegistry.removeEnchantment returns correct enchantment
9. EnchantmentRegistry.purgeBadEnchantments removes expired only
10. EnchantmentRegistry.updateEnchantments applies degradation correctly
11. ClientMagicSystem.castSpell creates enchantment and awards XP
12. ClientMagicSystem.castSpell consumes components when componentLoss > 0
13. ClientMagicSystem.castSpell fails when mana insufficient
14. ClientMagicSystem.castSpell fails when components unavailable
15. Spell targeting: Self spells work without target
16. Spell targeting: Target spells require valid target
17. Spell targeting: Arc spells affect multiple targets
18. Spell targeting: Streak spells affect line of targets
19. StatMod applies correctly to player stats
20. StatMod removes correctly when enchantment removed
21. Magic storage save/load roundtrips correctly
22. All 46 spells have valid data (no null/undefined fields)
23. All 11 components have valid data
24. EventBus fires correct events on cast
25. XP is awarded and tracked correctly

---

## Integration Points

### EventBus Events Fired
- `magic:spellCast` — { spellId, spellName, targetId, xpReward }
- `magic:enchantmentAdded` — { enchantmentId, spellId, duration }
- `magic:enchantmentRemoved` — { enchantmentId, spellId, reason }
- `magic:enchantmentExpired` — { enchantmentId, spellId }
- `magic:componentConsumed` — { componentId, amount }
- `magic:spellBookUpdated` — { action: 'add'|'remove', spellId }
- `magic:xpAwarded` — { amount, totalXp, level }

### Donkeycraft Integration
- `Donkeycraft.EventBus.emit()` for all notifications
- `Donkeycraft.LevelData` for world persistence (auto-save)
- Existing `src/ui/gui-elements.js` patterns for DOM manipulation

---

## Implementation Order

1. **Core data classes** (no dependencies): SpellDefinition, SpellFormula, StatMod
2. **Component system**: SpellComponentBase, SpellComponentTable, magic-data.js
3. **Spell book**: SpellBookPage, SpellBook
4. **Enchantment system**: Enchantment, EnchantmentRegistry
5. **Central system**: ClientMagicSystem (ties everything together)
6. **Storage**: Magic storage persistence
7. **UI components**: Spellbook UI, Active Spells UI, Spellcasting UI
8. **Test page**: spellcasting-test.html with all controls and assertions
9. **Verification**: Run all tests, fix any issues

---

## Tuning Notes

XP values are intentionally set low for initial release. Tuning guidelines:
- Small spells (Bolts): 1-10 XP based on level
- Medium spells (Arcs): 2-15 XP based on level
- Large spells (Streaks): 3-20 XP based on level
- Enchantments: 3-10 XP based on duration and power
- Healing: 1-5 XP based on amount healed

Future tuning can adjust these values via magic-data.js without code changes.

---

## Future Expansion

- SpellSet system (endowment items, multi-piece bonuses)
- Mana regeneration system
- Spell research/unlock progression
- Spell customization (account-specific formula overrides)
- Spell component vendors
- Spell tome crafting (learn from scroll)
- Combat magic (damage over time, spell resistance)
- Guild spells (unlockable at higher levels)