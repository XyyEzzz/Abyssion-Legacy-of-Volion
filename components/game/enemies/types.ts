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
}

export interface EnemyProps {
  position: [number, number, number];
  name?: string;
}

const activeAttackers = new Set<string>();
const MAX_ATTACKERS = 2;

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

export function getActiveAttackerCount(): number {
  return activeAttackers.size;
}
