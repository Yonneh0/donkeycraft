# Combat & Items Subsystem

Handles player combat mechanics, tool materials and durability, enchantments, potion effects, experience points, and projectile entities. This subsystem governs damage, equipment, and consumable items.

## Table of Contents

- [Overview](#overview)
- [Hurt Box & Damage](#damagejs)
- [Tool System](#tooljs)
- [Enchantments](#enchantmentjs)
- [Potions](#potionjs)
- [Projectiles](#projectilesjs)
- [Experience](#experiencejs)
- [Cross-references](#cross-references)

---

## Overview

The Combat subsystem manages all aspects of player combat and equipment. Damage reception is handled by HurtBox, tools provide speed multipliers and durability management, enchantments add special abilities with compatibility rules, potions provide temporary effects, projectiles handle ranged attacks, and experience tracks progression.

**Dependencies:**
- `entity.js` — Entities use health/damage from Entity base class
- `player.js` — Player entity integration for damage and knockback
- `stats.js` — Records damage dealt/taken, mobs killed

---

## Files

### [damage.js](damage.js) — Hurt Box & Damage System

Manages player hitbox, health, absorption hearts, saturation, fire damage, fall damage calculation, and knockback.

**Key Class:**
- `Donkeycraft.HurtBox(player)` — Hurt box system

**Constructor Dependencies:**
- `player` — Player entity instance

**HurtBox API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getHealth()` | `number` | Current HP (0–20) |
| `getMaxHealth()` | `number` | Maximum HP |
| `getAbsorption()` | `number` | Yellow health points |
| `setAbsorption(amount)` | `void` | Set absorption value |
| `getSaturation()` | `number` | Current saturation level |
| `setSaturation(amount)` | `void` | Set saturation value |
| `isOnFire()` | `boolean` | Currently on fire |
| `setOnFire(onFire)` | `void` | Set fire state |
| `takeDamage(amount, source='generic')` | `number` | Take damage (returns amount dealt) |
| `heal(amount)` | `number` | Heal (returns actual healed) |
| `getKnockback()` | `Vector3` | Current knockback velocity |
| `applyKnockback(direction, strength, upwardForce=0)` | `void` | Apply knockback |
| `clearKnockback()` | `void` | Clear knockback velocity |
| `getFallDistance()` | `number` | Current fall distance |
| `calculateFallDamage(fallDistance)` | `number` | Calculate damage (first 3 blocks free) |
| `applyFallDamage()` | `number` | Apply and reset fall damage |
| `getHurtBox()` | `AABB` | Player bounding box |
| `isCreative()` | `boolean` | Creative mode check |
| `setOnDeath(callback)` | `void` | Register death callback |
| `onDeath(source)` | `void` | Handle death (emits events) |
| `tick(deltaTime)` | `void` | Fire damage tick only |
| `reset()` | `void` | Full health reset |
| `destroy()` | `void` | Free references |

**Damage Sources:** `'generic'`, `'fall'`, `'fire'`, `'attack'`, `'lava'`, `'suffocation'`, `'starvation'`

**Fall Damage Formula:** `max(0, (fallDistance - 3) × 0.5)` HP per block beyond threshold

**Fire Damage:** 1 HP per second while on fire

---

### [tool.js](tool.js) — Tool System

Tool material tiers, speed multipliers, correct-for-drop detection, and durability management.

**Key Classes:**
- `Donkeycraft.ToolMaterial(id, name, durabilityCount, speedMultiplier, hardnessLevel, enchantability, repairItemBlockId)` — Material definition
- `Donkeycraft.Tool(materialId, toolBlockId)` — Individual tool instance
- `Donkeycraft.ToolRegistry` — Static utility singleton

**Tool Materials:**
| ID | Name | Durability | Speed | Level | Enchantability | Repair Item |
|----|------|------------|-------|-------|----------------|-------------|
| 0 | None | 0 | 1.0 | 0 | 0 | — |
| 1 | Wood | 60 | 2.0 | 0 | 15 | oak_plank |
| 2 | Stone | 132 | 4.0 | 1 | 5 | cobblestone |
| 3 | Iron | 251 | 6.0 | 2 | 14 | iron_ingot |
| 4 | Diamond | 1562 | 8.0 | 3 | 10 | diamond |
| 5 | Gold | 196 | 12.0 | 0 | 22 | gold_ingot |
| 6 | Netherite | 2032 | 9.0 | 4 | 15 | netherite_ingot |

**ToolRegistry API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getToolMaterial(id)` | `ToolMaterial|null` | By ID |
| `getToolMaterialByName(name)` | `ToolMaterial|null` | Case-insensitive |
| `getAllToolMaterials()` | `ToolMaterial[]` | All materials |
| `getDurability(materialId)` | `number` | Max uses |
| `getSpeedMultiplier(materialId)` | `number` | Speed multiplier |
| `getEnchantability(materialId)` | `number` | Enchantability bonus |
| `getRepairItemBlockId(materialId)` | `number` | Repair item ID |
| `calculateBreakTime(blockHardness, materialId, toolType)` | `number` | Break time in ticks |
| `isCorrectForDrop(toolType, materialId)` | `boolean` | Tool valid for block |
| `isBlockMinedByPickaxe(blockId)` | `boolean` | Pickaxe required |
| `isBlockMinedByShovel(blockId)` | `boolean` | Shovel required |
| `isBlockMinedByAxe(blockId)` | `boolean` | Axe required |
| `isBlockMinedByHoe(blockId)` | `boolean` | Hoe required |
| `getCorrectToolForBlock(blockId)` | `string|null` | Optimal tool type |
| `getToolTypeFromBlockId(toolBlockId)` | `string|null` | Tool type from ID |
| `calculateDurabilityWithUnbreaking(materialId, baseDamage, unbreakingLevel)` | `number` | With unbreaking formula |

**Tool API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `takeDamage(amount=1)` | `boolean` | Apply damage (true if broken) |
| `getRemainingDurability()` | `number` | Remaining uses |
| `getMaxDurability()` | `number` | Max durability |
| `getDurabilityFraction()` | `number` | Ratio 0–1 |
| `isBroken()` | `boolean` | No durability left |
| `repairWithItem(repairItemBlockId)` | `number` | Restore durability (1/4 max per repair) |
| `getMaterialId()` | `number` | Material ID |
| `getToolBlockId()` | `number` | Tool block/item ID |
| `serialize()` | `Object` | Serialized state |
| `deserialize(data)` | `Tool` | Static: restore from data |
| `toString()` | `string` | Human-readable |

**Break Time Formula:** `blockHardness × 1.5 / (speedMultiplier × correctForDrop ? 3 : 1)`
- Correct tool type: 3× speed bonus
- Insufficient material level: ÷ 3 penalty
- Minimum: 0.05 ticks

---

### [enchantment.js](enchantment.js) — Enchantment System

Enchantment registry, compatibility rules, slot restrictions, and application logic.

**Key Classes:**
- `Donkeycraft.Enchantment(id, name, maxLevel, weight, slots, incompatible, compatibleWith, minLevel)` — Enchantment definition
- `Donkeycraft.EnchantmentRegistry` — Static utility singleton

**Registered Enchantments:**
| ID | Name | Max Level | Slots | Incompatible With |
|----|------|-----------|-------|-------------------|
| 1 | Sharpness | 5 | weapon | Smite(2), BaneOfArthropods(3) |
| 2 | Smite | 5 | weapon | Sharpness(1), BaneOfArthropods(3) |
| 3 | BaneOfArthropods | 5 | weapon | Sharpness(1), Smite(2) |
| 4 | Protection | 4 | armor | FireProtection(5), BlastProtection(6), ProjectileProtection(7) |
| 5 | FireProtection | 4 | armor | Protection(4), BlastProtection(6), ProjectileProtection(7) |
| 6 | BlastProtection | 4 | armor | Protection(4), FireProtection(5), ProjectileProtection(7) |
| 7 | ProjectileProtection | 4 | armor | Protection(4), FireProtection(5), BlastProtection(6) |
| 8 | Fortune | 3 | weapon | — |
| 9 | SilkTouch | 1 | weapon | Fortune(8) |
| 10 | Efficiency | 5 | weapon | — |
| 11 | Unbreaking | 3 | weapon, armor | — |
| 12 | FireAspect | 2 | weapon | — |
| 13 | Power | 5 | weapon | — |
| 14 | Punch | 2 | weapon | — |
| 15 | Infinity | 1 | weapon | Mending(16) |
| 16 | Mending | 1 | weapon, armor | Infinity(15) |
| 17 | Thorns | 3 | armor | — |
| 18 | FeatherFalling | 4 | armor | — |
| 19 | Looting | 3 | weapon | — |
| 20 | Lure | 3 | weapon | — |
| 21 | LuckOfTheSea | 3 | weapon | — |
| 22 | QuickCharge | 3 | weapon | — |
| 23 | Loyalty | 3 | weapon | Riptide(24), Channeling(25) |
| 24 | Riptide | 3 | weapon | Loyalty(23), Channeling(25) |
| 25 | Channeling | 1 | weapon | Loyalty(23), Riptide(24) |
| 26 | Impaling | 5 | weapon | — |
| 30 | CurseOfBinding | 1 | armor | — (cursed) |
| 31 | CurseOfVanishing | 1 | weapon, armor | — (cursed) |

**EnchantmentRegistry API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getEnchantment(id)` | `Enchantment|null` | By ID |
| `getEnchantmentByName(name)` | `Enchantment|null` | Case-insensitive |
| `areCompatible(enchantId1, enchantId2)` | `boolean` | Can coexist |
| `canApplyToItem(itemBlockId, enchantId)` | `boolean` | Valid slot check |
| `getEnchantmentsForSlot(slot)` | `Enchantment[]` | Weapon or armor |
| `calculateLevelCost(enchantId, level)` | `number` | XP level cost (level² × weightFactor) |
| `getMaxLevel(enchantId)` | `number` | Max level |
| `getAllEnchantments()` | `Enchantment[]` | All enchantments |
| `getEnchantmentCount()` | `number` | Total count |
| `isCursed(enchantId)` | `boolean` | Curse check (30, 31) |
| `getEnchantmentEffects(enchantId)` | `Object|null` | Effect definitions |
| `applyEnchantment(itemStack, enchantId, level)` | `{success, reason}` | Validate and apply |

**Effect Definitions:**
- Sharpness: +1.5 damage per level
- Smite: +2.5 damage vs undead per level
- Protection: -1 damage per level
- FireProtection: -25% fire damage per level
- FeatherFalling: -12% fall damage per level
- Fortune/SilkTouch: block drop behavior override

---

### [potion.js](potion.js) — Potion System

Brewing recipe matching, effect application, duration, and amplifier management.

**Key Classes:**
- `Donkeycraft.PotionEffect(id, name, r, g, b, minDuration, maxDuration, maxAmplifier)` — Effect definition
- `Donkeycraft.Potion(id, name, ingredientId, basePotionId, effects, isInstant, bucketColor)` — Potion definition
- `Donkeycraft.PotionRegistry` — Static registry of potions and effects
- `Donkeycraft.ActivePotion(effectId, amplifier, duration, maxDuration)` — Runtime active effect
- `Donkeycraft.ActivePotionManager` — Manages active effects per entity

**Registered Effects (19 total):**
Regeneration, Speed, Slowness, Haste, MiningFatigue, Strength, InstantHealth, InstantDamage, JumpBoost, Nausea, WorldBorder, Luck, Unluck, SlowFalling, ConduitPower, DolphinsGrace, BadOmen, HeroOfTheVillage, Weakness, Absorption, Saturation

**Registered Potions (40 total):**
Water Bottle, Awkward Potion, Mundane Potion, Thick Potion, Regeneration I/II, Swiftness I/II, Slowness I/II, Haste I/II, MiningFatigue, Strength I/II, Instant Health I/II, Instant Damage I/II, JumpBoost, Nausea, FireResistance I/II, NightVision I/II, Weakness, Poison I/II, WaterBreathing I/II, Healing I/II, Absorption I/II, Saturation

**PotionRegistry API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getPotion(id)` | `Potion|null` | By ID |
| `getPotionByName(name)` | `Potion|null` | Case-insensitive |
| `getEffect(id)` | `PotionEffect|null` | Effect by ID |
| `matchBrewingRecipe(ingredientId, basePotionId)` | `Potion|null` | Match recipe |
| `getEffects(potionId)` | `Object[]` | Effects array |
| `getAllPotions()` | `Potion[]` | All potions |
| `getPotionCount()` | `number` | Total count |
| `getEffectCount()` | `number` | Effect count |
| `getBrewingRecipes()` | `Object[]` | All recipes |
| `isInstant(potionId)` | `boolean` | Instant effect check |
| `getPotionBucketColor(potionId)` | `string|null` | Custom bucket color |

**ActivePotionManager API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `addPotion(entity, potionId, duration, amplifier)` | `ActivePotion[]` | Add effects to entity |
| `removePotion(entity, effectId)` | `boolean` | Remove specific effect |
| `tick(entity, deltaTime)` | `ActivePotion[]` | Update timers, remove expired |
| `getActiveEffects(entity)` | `ActivePotion[]` | All active effects |
| `hasActiveEffect(entity, effectId)` | `boolean` | Effect present check |
| `clearAll(entity)` | `void` | Remove all effects |
| `destroy()` | `void` | Clear all data |

---

### [projectiles.js](projectiles.js) — Projectiles

Arrows, snowballs, ender pearls, dragon breath, lava buckets — thrown entities with physics.

**Key Class:**
- `Donkeycraft.Projectile(config)` — Projectile entity (extends Entity)

**Constructor Options:**
```js
{
  type: 'arrow',           // 'arrow', 'snowball', 'ender_pearl', 'dragon_breath', 'lava_bucket'
  x: 0, y: 64, z: 0,
  vx: 0, vy: 0, vz: 0,   // Initial velocity
  owner: null             // Entity that fired this
}
```

**Projectile API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `isExpired()` | `boolean` | Lifetime expired or destroyed |
| `destroy()` | `void` | Free resources and despawn |
| `onHit(hitX, hitY, hitZ)` | `void` | Handle impact (type-specific behavior) |
| `hitsEntity(entity)` | `boolean` | AABB collision check |
| `tick(deltaTime)` | `void` | Move + gravity + lifetime |

**ProjectileStats:**
| Type | Speed | Damage | Gravity | Lifetime | Special Behavior |
|------|-------|--------|---------|----------|------------------|
| arrow | 2.0 | 3 | 0.05 | 60 ticks | Pierce: false |
| snowball | 1.5 | 0 | 0.1 | 20 ticks | Bounce: true |
| ender_pearl | 2.5 | 0 | 0.08 | 30 ticks | Teleport owner |
| dragon_breath | 0.3 | 1 | 0 | 300 ticks | Area effect (radius 3) |
| lava_bucket | 1.8 | 5 | 0.15 | 15 ticks | Explode (radius 3) |

**Event Emission:**
- `projectile:explode` — Lava bucket explosion
- `projectile:area` — Dragon breath area effect
- `entity:damage` — On hit (for damaging projectiles)

---

### [experience.js](experience.js) — Experience System

XP levels, points, orb pickup, and spending for enchanting costs.

**Key Class:**
- `Donkeycraft.Experience(player)` — XP system

**Experience API:**
| Method | Returns | Description |
|--------|---------|-------------|
| `getLevel()` | `number` | Current XP level |
| `setLevel(level)` | `void` | Set level (clamped ≥ 0) |
| `getPoints()` | `number` | Points in current level |
| `setPoints(points)` | `void` | Set points (clamped ≥ 0) |
| `getTotalXP()` | `number` | Total XP ever accumulated |
| `getLevelThreshold()` | `number` | Points needed for next level |
| `getProgressToNextLevel()` | `number` | Fraction 0–1 |
| `addXP(amount)` | `void` | Add XP (may level up) |
| `spendXP(amount)` | `boolean` | Spend from current points |
| `pickupOrb(amount)` | `void` | Pick up XP orb |
| `setLevelToZero(level)` | `void` | Set level with 0 points |
| `getTotalXPValue()` | `number` | Cumulative cost of all levels |
| `serialize()` | `Object` | Serialized state |
| `fromObject(data)` | `void` | Restore from data |
| `reset()` | `void` | Zero everything |
| `destroy()` | `void` | Free references |

**Level Threshold Formula:**
- Levels 0–16: `7 + level × 2`
- Levels 17+: `37 + (level - 16) × 3`

**Event Emission:**
- `xp:changed` — On addXP with {level, points, totalXP}
- `xp:spent` — On spendXP with {level, points, cost}
- `xp:orb` — On pickup with {amount, level, points}

---

## Cross-references

- See [README-player.md](README-player.md) — HurtBox applies fall damage tracked by player stats; hunger system handles starvation damage
- See [README-npc.md](README-npc.md) — Hostile mobs deal damage via HurtBox; player stats track entity kills
- See [README-interaction.md](README-interaction.md) — Block breaking uses tool speed multipliers; enchantments applied to tools