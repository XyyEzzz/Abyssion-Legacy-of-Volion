/**
 * Per-item progression (M1W2D4 — P6) and player stat foundation (P8).
 *
 * One authoritative source: each item (weapon/Core) owns its own EXP/level/
 * unlocked skills; the player owns one stat block. Both are persisted through
 * the existing save architecture by the store (never via a second save path).
 *
 * No global EXP pool: Sword A ≠ Sword B, Core A ≠ Core B.
 */

export type WeaponCategory = 'sword' | 'gun' | 'core' | 'dagger';

/** EXP required to go from level N to N+1. Simple thresholds, not over-engineered. */
export function expForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

export const MAX_ITEM_LEVEL = 10;

/** Skills unlock by item level (1-based index into the item's skill list). */
export const SKILL_UNLOCK_LEVELS: readonly number[] = [1, 1, 3, 3, 5];

export interface ItemProgression {
  exp: number;
  level: number;
}

export function createItemProgression(): ItemProgression {
  return { exp: 0, level: 1 };
}

export function grantItemExp(
  prog: ItemProgression,
  amount: number,
  skillCount: number,
): { prog: ItemProgression; leveledTo: number } {
  let { exp, level } = prog;
  let leveledTo = level;
  exp += amount;
  while (level < MAX_ITEM_LEVEL && exp >= expForLevel(level)) {
    exp -= expForLevel(level);
    level += 1;
    leveledTo = level;
  }
  if (level >= MAX_ITEM_LEVEL) exp = Math.min(exp, expForLevel(MAX_ITEM_LEVEL));
  return { prog: { exp, level }, leveledTo };
}

/** Is the skill at 0-based `index` unlocked for an item at `level`? */
export function isSkillUnlocked(level: number, index: number): boolean {
  const req = SKILL_UNLOCK_LEVELS[Math.min(index, SKILL_UNLOCK_LEVELS.length - 1)] ?? 1;
  return level >= req;
}

// ── Player stats (P8) ──────────────────────────────────────────────────────
// One authoritative block. Combat/UI read it; nothing else writes it.

export interface PlayerStats {
  hp: number; // → max health
  agility: number;
  speed: number; // → movement speed
  attack: number; // → outgoing damage scaling
  attackSpeed: number; // → attack interval scaling
  cooldown: number; // → skill cooldown scaling
  fightingStyle: number;
  sword: number;
  staff: number;
  bow: number;
  gun: number;
  abyssal: number;
  ancestral: number;
}

export function createPlayerStats(): PlayerStats {
  return {
    hp: 1, agility: 1, speed: 1, attack: 1, attackSpeed: 1, cooldown: 1,
    fightingStyle: 1, sword: 1, staff: 1, bow: 1, gun: 1, abyssal: 1, ancestral: 1,
  };
}

/** Derived multipliers (clamped so one stat point can never zero out gameplay). */
export function statMultipliers(stats: PlayerStats) {
  return {
    maxHealth: 1 + (stats.hp - 1) * 0.1,
    moveSpeed: 1 + (stats.speed - 1) * 0.05,
    damage: 1 + (stats.attack - 1) * 0.08,
    attackInterval: 1 / (1 + (stats.attackSpeed - 1) * 0.05),
    skillCooldown: 1 / (1 + (stats.cooldown - 1) * 0.04),
  };
}

/** Weapon category → its proficiency stat key. */
export function categoryStatKey(cat: WeaponCategory): keyof PlayerStats | null {
  switch (cat) {
    case 'sword': return 'sword';
    case 'gun': return 'gun';
    case 'core': return 'abyssal';
    case 'dagger': return 'fightingStyle';
    default: return null;
  }
}
