// Donkeycraft — HurtBox (DEPRECATED)
// This file is deprecated. All vitals (health, stamina, etc.) are now stored on the Player object.
// The HurtBox class has been removed — use Player methods directly:
//   player.getHealth(), player.heal(amount), player.takeDamage(amount, source), etc.
//
// Kept for backward compatibility only. Do NOT instantiate this module.
(function () {
    'use strict';

    var Donkeycraft = window.Donkeycraft;

    /**
     * @deprecated HurtBox has been removed. All operations throw an error.
     * Use Player methods directly instead:
     *   - hurtBox.getHealth() → player.getHealth()
     *   - hurtBox.heal(amount) → player.heal(amount)
     *   - hurtBox.takeDamage(amount, source) → player.takeDamage(amount, source)
     *   - hurtBox.getMaxHealth() → player.getMaxHealth()
     *   - hurtBox.getStamina() → player.getStamina()
     *   - hurtBox.setStamina(amount) → player.setStamina(amount)
     *   - hurtBox.getMaxStamina() → player.getMaxStamina()
     *   - hurtBox.isOnFire() → player.isOnFire()
     *   - hurtBox.setOnFire(onFire) → player.setOnFire(onFire)
     *   - hurtBox.getFallDistance() → player.getFallDistance()
     *   - hurtBox.calculateFallDamage(distance) → player.calculateFallDamage(distance)
     *   - hurtBox.applyFallDamage() → player.applyFallDamage()
     *   - hurtBox.getKnockback() → player.getKnockback()
     *   - hurtBox.applyKnockback(dir, strength, up) → player.applyKnockback(dir, strength, up)
     *   - hurtBox.clearKnockback() → player.clearKnockback()
     *   - hurtBox.getHurtBox() → player.getHurtBox()
     *   - hurtBox.reset() → player.resetVitals()
     */
    Donkeycraft.HurtBox = function () {
        throw new Error('HurtBox has been removed. Use Player methods directly.');
    };

})();