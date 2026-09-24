/**
 * Water Staff skill definitions (M1W2D2 — first Mage slice).
 *
 * A small explicit data model — not a spell framework. Each skill is a plain
 * record of the fields the three current skills actually need. A future staff
 * (Fire, Ice, …) can add another skill table without touching combat logic;
 * fields beyond these are deferred until a real consumer exists.
 *
 * Balance values are deterministic — no RNG anywhere in spell handling.
 */

/** Behaviour kinds currently supported by the spell runner. */
export type SpellKind = 'projectile' | 'wave';

export interface StaffSkill {
  id: 'waterball' | 'waterslicer' | 'waterbullet';
  name: string;
  kind: SpellKind;
  damage: number;
  /** World units per second. */
  speed: number;
  /** Seconds before the spell expires even without hitting anything. */
  lifetime: number;
  /** Maximum travel distance (speed × lifetime, kept explicit for clarity). */
  maxDistance: number;
}

export const WATERBALL: StaffSkill = {
  id: 'waterball',
  name: 'Waterball',
  kind: 'projectile',
  damage: 12,
  speed: 14,
  lifetime: 1.5,
  maxDistance: 21,
};

export const WATERSLICER: StaffSkill = {
  id: 'waterslicer',
  name: 'Slicing Water',
  kind: 'wave',
  damage: 16,
  speed: 18,
  lifetime: 0.65,
  maxDistance: 11.7,
};

export const WATERBULLET: StaffSkill = {
  id: 'waterbullet',
  name: 'Waterbullet',
  kind: 'projectile',
  damage: 7,
  speed: 24,
  lifetime: 0.9,
  maxDistance: 21.6,
};

/** Skill slot → skill mapping. Slot 0 = basic projectile, 1 = wave,
 * 2 = precision projectile. Extensible: a future staff adds another table. */
export const WATER_STAFF_SKILLS: readonly StaffSkill[] = [
  WATERBALL,
  WATERSLICER,
  WATERBULLET,
];

/** Cooldowns per skill (seconds) — prevents uncontrolled spam casting. */
export const SKILL_COOLDOWNS: Readonly<Record<StaffSkill['id'], number>> = {
  waterball: 0.8,
  waterslicer: 1.6,
  waterbullet: 0.35,
};
