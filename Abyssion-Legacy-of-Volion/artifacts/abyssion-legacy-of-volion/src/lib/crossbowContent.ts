/**
 * Crossbow weapon data (M1W2D6 #5 — P0).
 *
 * Same explicit data-model philosophy as swordSkills/weaponContent: small
 * per-item skill data, not a generic framework. Gameplay wiring lives in
 * Player.tsx (via the arrow runner) — this file is the authoritative source
 * of the weapon's numbers and skill identities.
 */

export const CROSSBOW_CONFIG = {
  ammoCapacity: 16, // total arrows per loaded supply
  damage: 10, // basic arrow damage
  // Basic-fire pacing (M1W2D3 #1 WS2). A press edge (click/tap) may follow up
  // at the fast click cadence; a sustained hold settles onto the slower hold
  // cadence. One arrow per shot — the gate never dumps the magazine.
  fireIntervalHold: 0.5, // seconds while held — 2 arrows/second
  fireIntervalClick: 0.286, // seconds between clicks — 3.5 arrows/second (75% faster)
  // Auto-reload when the counter reaches 0. Reloads are unlimited.
  reloadSeconds: 1.4, // mirrors the M1887 ranged-weapon reload
  arrowSpeed: 26, // projectile speed (m/s), matches ranged feel
  arrowLifetime: 1.2, // seconds of flight (~30m range)
} as const;

export type CrossbowSkillId = 'triplex_lactus' | 'mimique_ametralladora';

export interface CrossbowSkill {
  id: CrossbowSkillId;
  name: string;
  description: string;
}

export const CROSSBOW_SKILLS: readonly CrossbowSkill[] = [
  {
    id: 'triplex_lactus',
    name: 'Triplex Lactus',
    description: 'Fires 3 arrows in a −10°/0°/+10° fan. Damage grows with the distance each arrow travels before hitting (25 base).',
  },
  {
    id: 'mimique_ametralladora',
    name: 'Mimique de Ametralladora',
    description: 'Fires 1 arrow every 0.25s for 7.5s (30 arrows), sweeping a 60° orbital arc around the player. 5 damage per arrow.',
  },
];

export const CROSSBOW_SKILL_COOLDOWNS: Readonly<Record<CrossbowSkillId, number>> = {
  triplex_lactus: 5,
  mimique_ametralladora: 15,
};

// ── Triplex Lactus (Z) ──────────────────────────────────────────────────────
export const TRIPLEX_LACTUS = {
  arrowCount: 3,
  baseDamage: 25,
  spreadAnglesDeg: [-10, 0, 10] as const,
  /** Damage multiplier per metre travelled before the hit. At 10m an arrow
   *  deals 25 + 10*1.5 = 40 — farther hits clearly deal more. */
  damagePerMetre: 1.5,
  /** Ammo is consumed only if all three projectiles spawn successfully. */
} as const;

// ── Mimique de Ametralladora (X) ────────────────────────────────────────────
export const MIMIQUE = {
  damage: 5,
  fireInterval: 0.25, // exactly 1 arrow / 0.25s
  duration: 7.5, // total seconds — 30 firing intervals
  angularRangeDeg: 60, // sweep across the whole burst
  baseAngleDeg: -30, // start of the sweep (deterministic progression)
} as const;

// ── Hit-streak system ───────────────────────────────────────────────────────
// Deterministic: +1 per confirmed crossbow arrow hit, reset on a missed
// arrow (despawn without hit) or after 3s without a confirmed hit. Max 5.
export const CROSSBOW_STREAK = {
  resetSeconds: 3,
  max: 5,
  /** Bonus fraction per streak level 2..5; levels 0–1 give +0%. */
  bonusByStreak: [0, 0, 0.05, 0.1, 0.15, 0.2] as const,
} as const;

/** Authoritative crossbow damage multiplier for a current streak value. */
export function crossbowStreakMultiplier(streak: number): number {
  const clamped = Math.max(0, Math.min(CROSSBOW_STREAK.max, Math.round(streak)));
  return 1 + CROSSBOW_STREAK.bonusByStreak[clamped];
}
