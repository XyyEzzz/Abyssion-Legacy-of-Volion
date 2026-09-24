/**
 * Sword skill definitions (M1W2D2 — first Sword slice).
 *
 * Same philosophy as lib/staffSkills: a small explicit data model, not a
 * skill framework. Two skills only:
 *
 * - Fatamorgana (Z): a burst dash covering roughly one second of full-speed
 *   sprint distance, with a visual-only afterimage. Movement is applied
 *   through the authoritative physics body (setLinvel), preserving collision.
 * - Dozens of Slashes (X): one bounded AoE — exactly 17 visual slash
 *   elements, damage to valid in-area targets through the authoritative
 *   `takeDamage` funnel, once per target per cast.
 *
 * Balance values are deterministic — no RNG.
 */

export type SwordSkillId = 'fatamorgana' | 'dozens_of_slashes';

export interface SwordSkill {
  id: SwordSkillId;
  name: string;
  /** Total dash distance for Fatamorgana (world units). */
  dashDistance?: number;
  /** Duration of the dash burst (seconds). */
  dashDuration?: number;
  /** AoE radius for Dozens of Slashes (world units). */
  aoeRadius?: number;
  /** Active window of the AoE (seconds). */
  aoeDuration?: number;
  /** AoE damage per target. */
  aoeDamage?: number;
  /** Visual slash element count (spec-fixed at 17). */
  slashCount?: number;
}

export const FATAMORGANA: SwordSkill = {
  id: 'fatamorgana',
  name: 'Fatamorgana',
  dashDistance: 9,
  dashDuration: 0.18,
};

export const DOZENS_OF_SLASHES: SwordSkill = {
  id: 'dozens_of_slashes',
  name: 'Dozens of Slashes',
  aoeRadius: 3.5,
  aoeDuration: 0.5,
  aoeDamage: 30,
  slashCount: 17,
};

/** Slot order: Z → Fatamorgana, X → Dozens of Slashes. */
export const SWORD_SKILLS: readonly SwordSkill[] = [
  FATAMORGANA,
  DOZENS_OF_SLASHES,
];

/** Cooldowns (seconds) — prevents uncontrolled spam. */
export const SWORD_SKILL_COOLDOWNS: Readonly<Record<SwordSkillId, number>> = {
  fatamorgana: 2.5,
  dozens_of_slashes: 6,
};
