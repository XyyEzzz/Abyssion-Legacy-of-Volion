/**
 * M1887 (gun) and Resonance Core skill definitions (M1W2D4 — P7).
 *
 * Same explicit data-model philosophy as swordSkills/staffSkills: small
 * per-item skill data, not a generic framework. Each item has exactly its
 * spec'd skill set with fixed names and gameplay roles.
 */

// ── M1887 ───────────────────────────────────────────────────────────────────

export const M1887_CONFIG = {
  ammoCapacity: 2,
  reloadSeconds: 1.4,
  range: 12, // metres
  pellets: 8,
  damagePerPellet: 20,
  shotsPerSecond: 0.8,
  armourPenetration: 0.1, // 10%
  spreadCos: 0.92, // ~23° half-angle cone
} as const;

export type GunSkillId = 'double_tap' | 'breach_shot';

export interface GunSkill {
  id: GunSkillId;
  name: string;
  shellsUsed: number;
  damageMultiplier: number;
  armourPenBonus?: number;
  knockback?: number;
  description: string;
}

export const M1887_SKILLS: readonly GunSkill[] = [
  {
    id: 'double_tap',
    name: 'Double Tap',
    shellsUsed: 2,
    damageMultiplier: 1.0,
    description: 'Rapidly fires both loaded shells. Close-range burst.',
  },
  {
    id: 'breach_shot',
    name: 'Breach Shot',
    shellsUsed: 1,
    damageMultiplier: 1.2,
    armourPenBonus: 0.2,
    knockback: 9,
    description: 'Armour-disrupting close shot with short knockback.',
  },
];

export const M1887_SKILL_COOLDOWNS: Readonly<Record<GunSkillId, number>> = {
  double_tap: 4,
  breach_shot: 6,
};

// ── Resonance Core ──────────────────────────────────────────────────────────

export type CoreSkillId =
  | 'resonant_pulse'
  | 'harmonic_break'
  | 'cataclysmic_resonance'
  | 'resonant_overdrive'
  | 'echo_step';

export interface CoreSkill {
  id: CoreSkillId;
  name: string;
  /** Key slot: Z X C V F. */
  slot: 'Z' | 'X' | 'C' | 'V' | 'F';
  damage?: number;
  radius?: number;
  duration?: number;
  dashDistance?: number;
  damageBoost?: number;
  cooldown: number;
  description: string;
}

export const RESONANCE_SKILLS: readonly CoreSkill[] = [
  {
    id: 'resonant_pulse',
    name: 'Resonant Pulse',
    slot: 'Z',
    damage: 14,
    radius: 3,
    cooldown: 2.5,
    description: 'Short-range pulse. Small area damage and light stagger.',
  },
  {
    id: 'harmonic_break',
    name: 'Harmonic Break',
    slot: 'X',
    damage: 34,
    radius: 2.2,
    cooldown: 7,
    description: 'Concentrated resonance: strong single-target damage, armour disruption.',
  },
  {
    id: 'cataclysmic_resonance',
    name: 'Cataclysmic Resonance',
    slot: 'C',
    damage: 70,
    radius: 7,
    duration: 1.2,
    cooldown: 25,
    description: 'Large-area resonance field, then a destructive pulse. Ultimate.',
  },
  {
    id: 'resonant_overdrive',
    name: 'Resonant Overdrive',
    slot: 'V',
    damageBoost: 1.35,
    duration: 8,
    cooldown: 30,
    description: 'Resonance skills deal +35% damage for 8 seconds.',
  },
  {
    id: 'echo_step',
    name: 'Echo Step',
    slot: 'F',
    dashDistance: 7,
    cooldown: 5,
    description: 'Resonance-assisted repositioning dash.',
  },
];

export const RESONANCE_SKILL_COOLDOWNS: Readonly<Record<CoreSkillId, number>> = {
  resonant_pulse: 2.5,
  harmonic_break: 7,
  cataclysmic_resonance: 25,
  resonant_overdrive: 30,
  echo_step: 5,
};

// ── Dual Dagger (M1W2D5 C3) ──────────────────────────────────────────────
// Exactly two skills (Z, X). No C/V/F — the dagger never invents slots.
// Names are authoritative per spec.

export type DaggerSkillId = 'curse_of_hell' | 'tens_of_slashes';

export interface DaggerSkill {
  id: DaggerSkillId;
  name: string;
  description: string;
}

export const DAGGER_SKILLS: readonly DaggerSkill[] = [
  {
    id: 'curse_of_hell',
    name: 'Curse of Hell',
    description: 'Combat buff: +40% attack speed and +30% damage for 5s; successful dagger hits knock enemies back. No direct damage.',
  },
  {
    id: 'tens_of_slashes',
    name: 'Tens of Slashes',
    description: 'Serial attack: 10 rapid strikes over 3s dealing 30 total damage. Hit enemies are stunned and begin bleeding, which escalates over time.',
  },
];

export const DAGGER_SKILL_COOLDOWNS: Readonly<Record<DaggerSkillId, number>> = {
  curse_of_hell: 10,
  tens_of_slashes: 15,
};

// Curse of Hell buff values (authoritative; combat reads these).
export const CURSE_OF_HELL = {
  duration: 5,
  attackSpeedMultiplier: 1.4,
  damageMultiplier: 1.3,
  knockbackImpulse: 6,
} as const;

// Tens of Slashes serial-attack values.
export const TENS_OF_SLASHES = {
  directDamage: 30,
  duration: 3,
  strikeCount: 10,
  stunDuration: 1.2,
  bleedDuration: 6,
  radius: 2.6,
} as const;

