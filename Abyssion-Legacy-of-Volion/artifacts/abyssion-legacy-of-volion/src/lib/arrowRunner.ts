/**
 * Arrow projectile runner (M1W2D6 #5 — Crossbow).
 *
 * Owns transient arrow state for Crossbow basic fire + Triplex Lactus +
 * Mimique de Ametralladora. Reuses the spell-runner invariants:
 * - All damage goes through the authoritative enemy takeDamage funnel.
 * - One hit per target per instance (hitIds); no multi-hit frames.
 * - Finite lifetime; no damage after despawn; dead targets skipped.
 * - Pooled instances, module-scoped scratch vectors, zero hot-path allocation.
 *
 * This is NOT a second damage pipeline: arrows compute a final damage number
 * and hand it to `target.takeDamage`, exactly like spells/melee do.
 */

import * as THREE from 'three';
import { enemyTargets, npcPositions } from '@/lib/store';
// BUG-009: the single existing world-solid data structure — the NPC pathing
// obstacle list. No second obstacle list is defined here; this is the same
// authoritative list NPC.tsx uses for its blocked-position test.
import { OBSTACLES } from '@/components/game/NPC';

export interface ArrowInstance {
  active: boolean;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  traveled: number;
  life: number;
  /** Damage at hit time: base + travelled * perMetre (Triplex), else fixed. */
  baseDamage: number;
  damagePerMetre: number;
  /** Enemy ids this arrow has already damaged (one hit per target). */
  hitIds: Set<string>;
  /** Set by the owner on spawn; can be cleared to cancel a Mimique burst. */
  fromSkill: boolean;
}

const MAX_ACTIVE_ARROWS = 48;

const pool: ArrowInstance[] = Array.from({ length: MAX_ACTIVE_ARROWS }, () => ({
  active: false,
  pos: new THREE.Vector3(),
  dir: new THREE.Vector3(0, 0, 1),
  traveled: 0,
  life: 0,
  baseDamage: 0,
  damagePerMetre: 0,
  hitIds: new Set<string>(),
  fromSkill: false,
}));

export function getActiveArrows(): readonly ArrowInstance[] {
  return pool;
}

export function resetArrows(): void {
  for (const a of pool) a.active = false;
}

export interface ArrowHitEvent {
  x: number;
  y: number;
  z: number;
  /** E1b: the exact damage value handed to the enemy's authoritative
   *  `takeDamage` funnel on the frame the hit was accepted. */
  damage: number;
}

export interface ArrowCallbacks {
  /** Called once per confirmed arrow hit (post-damage-acceptance). */
  onHit?: (hit: ArrowHitEvent) => void;
  /** Called once when an arrow despawns without ever hitting anything. */
  onMiss?: () => void;
}

const _tmp = new THREE.Vector3();

/** BUG-009 contact radii (XZ plane). ARROW_RADIUS is the shaft's own
 *  thickness; NPC_CONTACT_RADIUS mirrors the body radius NPC.tsx uses for
 *  the same NPCs. */
const ARROW_RADIUS = 0.25;
const NPC_CONTACT_RADIUS = 0.5;

/**
 * BUG-009 — swept contact test between the arrow's step segment and a disc in
 * the XZ plane. Same cheap along/perp idea as the enemy check, but exact for
 * the segment (no false contact behind the arrow): zero allocation, no sqrt.
 */
function arrowTouchesDisc(
  a: ArrowInstance,
  step: number,
  cx: number,
  cz: number,
  radius: number,
): boolean {
  const dx = cx - a.pos.x;
  const dz = cz - a.pos.z;
  const along = dx * a.dir.x + dz * a.dir.z;
  const distSq = dx * dx + dz * dz;
  const r2 = radius * radius;
  if (along <= 0) return distSq <= r2;
  if (along >= step) {
    const beyond = along - step;
    return distSq - along * along + beyond * beyond <= r2;
  }
  return distSq - along * along <= r2;
}

/**
 * Tick all active arrows. Damage callbacks fire exactly once per arrow.
 */
export function updateArrows(delta: number, cb?: ArrowCallbacks): void {
  if (delta <= 0 || !Number.isFinite(delta)) return;
  for (const a of pool) {
    if (!a.active) continue;
    const step = Math.min(a.life, delta) * Math.max(0.0001, speedOf(a));
    // speedOf derives from dir being normalised at spawn; we bake speed into
    // life at spawn (life = flight time) and travel at arrowSpeed m/s.
    a.life -= delta;
    a.pos.addScaledVector(a.dir, step);
    a.traveled += step;

    let hit = false;
    for (const target of enemyTargets.values()) {
      if (a.hitIds.has(target.id)) continue;
      const tPos = target.getPosition();
      // XZ-only distance: enemies register root/ground positions.
      _tmp.set(tPos.x - a.pos.x, 0, tPos.z - a.pos.z);
      const along = _tmp.dot(a.dir);
      const perp = _tmp.addScaledVector(a.dir, -along).length();
      if (along >= -step && along <= 0.7 + step && perp <= 0.7) {
        a.hitIds.add(target.id);
        // Distance-scaled damage (Triplex Lactus); basic/Mimique use 0 scaling.
        const dmg = a.baseDamage + a.traveled * a.damagePerMetre;
        const accepted = target.takeDamage(dmg, a.pos, 1);
        if (accepted) {
          if (cb?.onHit) cb.onHit({ x: a.pos.x, y: a.pos.y, z: a.pos.z, damage: dmg });
        } else if (cb?.onMiss) {
          // Contact rejected (target i-frames): the projectile is consumed
          // without landing damage, so it resolves through the same onMiss
          // outcome as an expiry — the streak must not stay stale.
          cb.onMiss();
        }
        hit = accepted || hit;
        a.active = false; // arrows stop on first contact
        break;
      }
    }

    // BUG-009: first contact with ANY other solid also consumes the arrow.
    // NPCs use their live shared positions; world solids reuse the single
    // existing obstacle list (OBSTACLES in NPC.tsx) — no second list, no new
    // update loop, no Rapier here. No damage and no hit callback: the arrow
    // resolves through the existing inactive path.
    if (a.active) {
      let solid = false;
      for (const npc of npcPositions.values()) {
        if (arrowTouchesDisc(a, step, npc.x, npc.z, ARROW_RADIUS + NPC_CONTACT_RADIUS)) {
          solid = true;
          break;
        }
      }
      if (!solid) {
        for (const obs of OBSTACLES) {
          if (obs.kind === 'circle') {
            if (arrowTouchesDisc(a, step, obs.x, obs.z, ARROW_RADIUS + obs.radius)) {
              solid = true;
              break;
            }
          } else {
            // AABB rejection first: nearest point on the box, then disc test.
            const nx = Math.max(obs.x - obs.halfW, Math.min(a.pos.x, obs.x + obs.halfW));
            const nz = Math.max(obs.z - obs.halfD, Math.min(a.pos.z, obs.z + obs.halfD));
            if (arrowTouchesDisc(a, step, nx, nz, ARROW_RADIUS)) {
              solid = true;
              break;
            }
          }
        }
      }
      if (solid) {
        a.active = false;
        if (cb?.onMiss) cb.onMiss();
      }
    }

    if (a.active && (a.life <= 0 || a.traveled > 60)) {
      a.active = false;
      if (!hit && cb?.onMiss) cb.onMiss();
    }
  }
}

// Arrow speed is fixed; dir is unit length so step = ARROW_SPEED * delta.
const ARROW_SPEED = 26;

function speedOf(_a: ArrowInstance): number {
  return ARROW_SPEED;
}

/** Allocate an arrow from the pool, or null if saturated (safe drop). */
export function spawnArrow(
  origin: THREE.Vector3,
  dirX: number,
  dirZ: number,
  baseDamage: number,
  damagePerMetre: number,
  lifetime: number,
  fromSkill: boolean,
): ArrowInstance | null {
  if (!Number.isFinite(origin.x) || !Number.isFinite(dirX) || !Number.isFinite(dirZ)) return null;
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (len < 0.0001) return null;
  for (const a of pool) {
    if (a.active) continue;
    a.active = true;
    a.pos.copy(origin);
    a.dir.set(dirX / len, 0, dirZ / len);
    a.traveled = 0;
    a.life = lifetime;
    a.baseDamage = baseDamage;
    a.damagePerMetre = damagePerMetre;
    a.hitIds.clear();
    a.fromSkill = fromSkill;
    return a;
  }
  return null;
}
