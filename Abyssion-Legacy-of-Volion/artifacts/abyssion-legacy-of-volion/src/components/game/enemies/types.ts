import * as THREE from 'three';

export type EnemyState = 
  | 'idle'
  | 'patrol'
  | 'detect'
  | 'chase'
  | 'attack'
  | 'hurt'
  | 'death'
  | 'returnToSpawn';

export type EnemyFaction = 'slime' | 'wolf' | 'bandit' | 'mage' | 'thornback';

/** Faction pairs that are hostile to each other. */
export const FACTION_HOSTILITY: Record<EnemyFaction, EnemyFaction[]> = {
  slime: ['wolf', 'bandit', 'mage'],
  wolf: ['slime', 'bandit', 'mage'],
  bandit: ['slime', 'wolf', 'mage'],
  mage: ['slime', 'wolf', 'bandit'],
  thornback: ['slime', 'wolf', 'bandit', 'mage'],
};

export interface EnemyConfig {
  name: string;
  maxHp: number;
  moveSpeed: number;
  patrolSpeed?: number;
  detectionRange: number;
  attackRange: number;
  leashRange?: number;
  attackCooldown: number;
  attackWindup: number;
  attackRecovery: number;
  damage: number;
  knockback: number;
  lootName?: string;
  lootAmount?: number;
  lootColor?: string;
  /** Faction identifier for friendly-fire rules. */
  faction?: EnemyFaction;
  /** Base exp granted on kill (before level scaling). */
  expReward?: number;
  /** Healing item dropped on death (itemId). */
  healingDropId?: string;
  /** Chance (0-1) that healing item drops. */
  healingDropChance?: number;
  /** Optional extra material drop (itemId). Thornback uses this for its
   *  100% spine + 25% extra spine loot rule (M1W2D6 #5). */
  extraDropId?: string;
  /** Optional arena bounds — when set, enemy position is clamped within these bounds each frame. */
  arenaBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface EnemyProps {
  position: [number, number, number];
  name?: string;
  /** Optional arena bounds — when set, enemy position is clamped within these bounds each frame. */
  arenaBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const activeAttackers = new Set<string>();
const MAX_ATTACKERS = 2;

// ── Enemy status effects (M1W2D5 C3) ────────────────────────────────────────
// Stun and Bleeding are authoritative gameplay state owned by the enemy
// system, applied only to enemies actually hit by a serial attack.
// Bleeding damage escalates over time (progressive ticking).

export interface EnemyStatusState {
  /** Remaining stun time (seconds). 0 = not stunned. */
  stunUntil: number;
  /** Remaining bleeding duration (seconds). 0 = not bleeding. */
  bleedRemaining: number;
  /** Elapsed bleeding time — drives the escalation curve. */
  bleedElapsed: number;
  /** Next bleed tick countdown (seconds). */
  bleedTickTimer: number;
}

const enemyStatuses = new Map<string, EnemyStatusState>();

/** How often bleeding ticks (seconds). */
export const BLEED_TICK_INTERVAL = 0.5;

/** Base bleed damage per tick; escalates the longer bleeding has run. */
export function bleedTickDamage(elapsedSeconds: number): number {
  return 2 + Math.floor(elapsedSeconds / BLEED_TICK_INTERVAL) * 1.5;
}

export function getEnemyStatus(enemyId: string): EnemyStatusState | undefined {
  return enemyStatuses.get(enemyId);
}

/** Apply stun (adds to any remaining stun — serial hits can chain). */
export function applyStun(enemyId: string, duration: number): void {
  const s = enemyStatuses.get(enemyId);
  if (s) s.stunUntil = Math.max(s.stunUntil, duration);
}

/** Apply bleeding for `duration` seconds (re application refreshes it). */
export function applyBleeding(enemyId: string, duration: number): void {
  let s = enemyStatuses.get(enemyId);
  if (!s) {
    s = { stunUntil: 0, bleedRemaining: 0, bleedElapsed: 0, bleedTickTimer: BLEED_TICK_INTERVAL };
    enemyStatuses.set(enemyId, s);
  }
  s.bleedRemaining = Math.max(s.bleedRemaining, duration);
}

/** Advance statuses for this enemy; returns damage dealt by bleeding ticks this frame. */
export function tickEnemyStatuses(enemyId: string, delta: number): number {
  const s = enemyStatuses.get(enemyId);
  if (!s) return 0;
  let bleedDamage = 0;
  if (s.stunUntil > 0) s.stunUntil = Math.max(0, s.stunUntil - delta);
  if (s.bleedRemaining > 0) {
    s.bleedRemaining -= delta;
    s.bleedElapsed += delta;
    s.bleedTickTimer -= delta;
    while (s.bleedTickTimer <= 0 && s.bleedRemaining > 0) {
      s.bleedTickTimer += BLEED_TICK_INTERVAL;
      bleedDamage += bleedTickDamage(s.bleedElapsed - delta);
    }
  }
  if (s.stunUntil <= 0 && s.bleedRemaining <= 0) enemyStatuses.delete(enemyId);
  return bleedDamage;
}

export function isStunned(enemyId: string): boolean {
  return (enemyStatuses.get(enemyId)?.stunUntil ?? 0) > 0;
}

export function clearEnemyStatuses(enemyId: string): void {
  enemyStatuses.delete(enemyId);
}

export function requestAttackerToken(enemyId: string): boolean {
  if (activeAttackers.has(enemyId)) return true;
  if (activeAttackers.size < MAX_ATTACKERS) {
    activeAttackers.add(enemyId);
    return true;
  }
  return false;
}

export function releaseAttackerToken(enemyId: string): void {
  activeAttackers.delete(enemyId);
}

/** True when this enemy currently owns an attacker token. Attack handlers
 *  validate this after interruptions (stun/hurt) so a tokenless enemy can
 *  never keep executing an active attack. */
export function hasAttackerToken(enemyId: string): boolean {
  return activeAttackers.has(enemyId);
}

export function getActiveAttackerCount(): number {
  return activeAttackers.size;
}
