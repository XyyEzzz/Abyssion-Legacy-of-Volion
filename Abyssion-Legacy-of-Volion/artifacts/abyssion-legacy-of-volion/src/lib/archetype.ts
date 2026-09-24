/**
 * Combat archetype domain (M1W2D2 — Fighter/Mage restriction).
 *
 * The archetype is authoritative gameplay state, not a UI label. Ownership of
 * an item does NOT imply usability: a Mage may own a Sword, but cannot wield
 * Fighter weapon skills, and vice versa.
 *
 * Deliberately small: no class trees, no stats, no progression. One character
 * with a current archetype.
 */

export type Archetype = 'fighter' | 'mage';

/** Weapons each archetype may actively equip/use. */
export const ARCHETYPE_WEAPONS: Record<Archetype, readonly string[]> = {
  fighter: ['iron_sword', 'wooden_sword', 'dual_dagger'],
  mage: ['water_staff'],
};

export function canUseWeapon(archetype: Archetype, itemId: string | null): boolean {
  if (!itemId) return true;
  return ARCHETYPE_WEAPONS[archetype].includes(itemId);
}

/** Human-readable label for UI. */
export function archetypeLabel(archetype: Archetype): string {
  return archetype === 'fighter' ? 'Fighter' : 'Mage';
}
