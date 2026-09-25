/**
 * Spell runner (M1W2D2 — first Mage slice).
 *
 * Owns transient spell/projectile state for staff skills. Deliberately small:
 * three skill records (lib/staffSkills) + one instance list updated from the
 * player's frame loop. NOT a spell framework — a future staff adds another
 * skill table; a future behaviour adds another SpellKind branch here.
 *
 * Invariants:
 * - Every damage application goes through the existing enemy `takeDamage`
 *   funnel (the authoritative combat path). Spell code never touches enemy HP.
 * - Each spell instance damages any single target at most once
 *   (`hitIds` per instance); duplicate frames cannot multi-hit.
 * - Dead/invalid targets are filtered before damage.
 * - Instances have finite lifetime and are removed on expiry/impact — no
 *   post-expiration damage, no stale references kept.
 * - No per-frame allocation in the hot path: instances are reused pooled
 *   objects; vectors are module-scoped scratch.
 */

import * as THREE from 'three';
import { enemyTargets } from '@/lib/store';
import type { StaffSkill } from '@/lib/staffSkills';

export type SpellVisualId = 'waterball' | 'waterslicer' | 'waterbullet';

export interface SpellInstance {
  active: boolean;
  visualId: SpellVisualId;
  skill: StaffSkill;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  traveled: number;
  life: number;
  /** Enemy ids this instance has already damaged (one hit per target). */
  hitIds: Set<string>;
  /** Wavelength/visual phase for the wave kind. */
  age: number;
}

const MAX_ACTIVE_SPELLS = 24;

/** Fixed pool — avoids gameplay-path allocation. */
const pool: SpellInstance[] = [];
for (let i = 0; i < MAX_ACTIVE_SPELLS; i++) {
  pool.push({
    active: false,
    visualId: 'waterball',
    skill: null as unknown as StaffSkill,
    pos: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, 1),
    traveled: 0,
    life: 0,
    hitIds: new Set<string>(),
    age: 0,
  });
}

/** Active spell instances (subset of the pool; `active === true`). */
export function getActiveSpells(): readonly SpellInstance[] {
  return pool;
}

/** Scratch vector — reused by castSpells; never retained. */
const _tmp = new THREE.Vector3();

/** E1b: payload of a confirmed spell hit. `damage` is the exact value handed to
 *  the authoritative `takeDamage` funnel on the frame the hit was accepted. */
export interface SpellHitEvent {
  x: number;
  y: number;
  z: number;
  damage: number;
}

/** E1b: optional hit notification for callers driving impact feedback. Purely
 *  additive — a caller that passes nothing behaves exactly as before. */
export interface SpellCallbacks {
  /** Called once per confirmed spell hit (post-damage-acceptance). */
  onHit?: (hit: SpellHitEvent) => void;
}

/**
 * Tick all active spells. `origin`/`facing` are only read.
 * Returns nothing; mutates pooled instances only.
 */
export function updateSpells(delta: number, cb?: SpellCallbacks): void {
  if (delta <= 0 || !Number.isFinite(delta)) return;
  for (const sp of pool) {
    if (!sp.active) continue;
    sp.age += delta;
    sp.life -= delta;
    const step = sp.skill.speed * delta;
    sp.pos.addScaledVector(sp.dir, step);
    sp.traveled += step;

    // Collision + damage: one hit per target per instance, dead targets
    // skipped, damage via the authoritative takeDamage funnel only.
    // Wave kind uses a wider forward swept radius; projectiles a tight one.
    const hitRadius = sp.skill.kind === 'wave' ? 1.6 : 0.7;
    for (const target of enemyTargets.values()) {
      if (sp.hitIds.has(target.id)) continue;
      const tPos = target.getPosition();
      // XZ-only offset: enemies register their root/ground position while casts
      // originate at chest height, so a 3D centre distance can never satisfy
      // the hit radius and the projectile skills never damage anything
      // (confirmed at runtime: Waterball/Waterbullet produced zero hits while
      // the wider wave did). Melee range is likewise resolved on XZ.
      _tmp.set(tPos.x - sp.pos.x, 0, tPos.z - sp.pos.z);
      // Only enemies we have reached or passed (within hit radius of the
      // spell center, or overtaken this frame).
      const along = _tmp.dot(sp.dir);
      const perp = _tmp.addScaledVector(sp.dir, -along).length();
      if (along >= -step && along <= hitRadius + step && perp <= hitRadius) {
        sp.hitIds.add(target.id);
        // Combo stage 1 → standard knockback profile through the funnel.
        const accepted = target.takeDamage(sp.skill.damage, sp.pos, 1);
        // E1b: surface the confirmed hit at the same site with the same damage
        // value — no second hit path, no second damage funnel. Rejected
        // contacts (target i-frames) stay silent, exactly like arrowRunner.
        if (accepted && cb?.onHit) {
          cb.onHit({ x: sp.pos.x, y: sp.pos.y, z: sp.pos.z, damage: sp.skill.damage });
        }
        // Projectiles stop on first impact; waves sweep through.
        if (sp.skill.kind === 'projectile') {
          sp.life = 0;
          break;
        }
      }
    }

    if (sp.life <= 0 || sp.traveled >= sp.skill.maxDistance) {
      sp.active = false; // released back to the pool; no post-expiry damage
    }
  }
}

/** Fired-spell visual ids currently active (for Player.tsx to render). */
export function resetSpells(): void {
  for (const sp of pool) sp.active = false;
}

/** Allocate an instance from the pool, or null if saturated (safe drop). */
export function spawnSpell(
  skill: StaffSkill,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
): SpellInstance | null {
  if (!Number.isFinite(origin.x) || !Number.isFinite(dir.x)) return null;
  const len = dir.length();
  if (len < 0.0001) return null;
  for (const sp of pool) {
    if (sp.active) continue;
    sp.active = true;
    sp.visualId = skill.id;
    sp.skill = skill;
    sp.pos.copy(origin);
    sp.dir.copy(dir).divideScalar(len);
    sp.traveled = 0;
    sp.life = skill.lifetime;
    sp.age = 0;
    sp.hitIds.clear();
    return sp;
  }
  return null;
}

// ── Sword skill runtime (Fatamorgana / Dozens of Slashes) ────────────
// Kept beside the spell runner because it reuses the same invariants:
// authoritative damage funnel, one hit per target per cast, bounded
// lifetime, pooled/no hot-path allocation.

export interface SwordSlashFx {
  active: boolean;
  /** 0..1 normalised progress through the effect. */
  progress: number;
  /** Angle around the player for this slash element (radians). */
  angle: number;
  /** Populated at spawn: effect centre (player position at cast). */
  cx: number;
  cy: number;
  cz: number;
}

const SLASH_FX_POOL_SIZE = 32; // > 17 max slashes; reused across casts
const slashFxPool: SwordSlashFx[] = Array.from({ length: SLASH_FX_POOL_SIZE }, () => ({
  active: false, progress: 0, angle: 0, cx: 0, cy: 0, cz: 0,
}));

export function getActiveSlashFx(): readonly SwordSlashFx[] {
  return slashFxPool;
}

export function tickSlashFx(delta: number): void {
  if (delta <= 0 || !Number.isFinite(delta)) return;
  for (const fx of slashFxPool) {
    if (!fx.active) continue;
    fx.progress += delta / 0.5; // matches DOZENS_OF_SLASHES.aoeDuration
    if (fx.progress >= 1) fx.active = false;
  }
}

/** Spawn exactly 17 slash elements in a deterministic ring. */
export function spawnSlashBurst(cx: number, cy: number, cz: number): void {
  let spawned = 0;
  for (let i = 0; i < SLASH_FX_POOL_SIZE && spawned < 17; i++) {
    const fx = slashFxPool[i];
    if (fx.active) continue;
    fx.active = true;
    fx.progress = 0;
    fx.angle = (spawned / 17) * Math.PI * 2; // deterministic ring order
    fx.cx = cx; fx.cy = cy; fx.cz = cz;
    spawned++;
  }
}

export function resetSlashFx(): void {
  for (const fx of slashFxPool) fx.active = false;
}
