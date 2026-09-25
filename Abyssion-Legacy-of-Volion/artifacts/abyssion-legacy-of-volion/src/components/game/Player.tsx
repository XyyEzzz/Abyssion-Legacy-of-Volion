'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, enemyTargets } from '@/lib/store';
import { MOVEMENT_CONFIG as C } from '@/lib/movementConfig';
import { COMBAT_CONFIG as CC } from '@/lib/combatConfig';
import { combatAudio } from '@/lib/combatAudio';
import { WATER_STAFF_SKILLS, SKILL_COOLDOWNS, type StaffSkill } from '@/lib/staffSkills';
import { M1887_CONFIG, M1887_SKILLS, M1887_SKILL_COOLDOWNS, type GunSkill, RESONANCE_SKILLS, RESONANCE_SKILL_COOLDOWNS, type CoreSkill, DAGGER_SKILLS, DAGGER_SKILL_COOLDOWNS, type DaggerSkill, CURSE_OF_HELL, TENS_OF_SLASHES } from '@/lib/weaponContent';
import { applyStun, applyBleeding } from './enemies/types';
import { weaponCategoryOf } from '@/lib/items';
import { CROSSBOW_CONFIG, CROSSBOW_SKILLS, CROSSBOW_SKILL_COOLDOWNS, TRIPLEX_LACTUS, MIMIQUE, CROSSBOW_STREAK, crossbowStreakMultiplier, type CrossbowSkill } from '@/lib/crossbowContent';
import { spawnArrow, updateArrows, resetArrows, getActiveArrows, type ArrowInstance, type ArrowHitEvent } from '@/lib/arrowRunner';
import type { SwordSkill } from '@/lib/swordSkills';
import { spawnSpell, updateSpells, resetSpells, getActiveSpells, spawnSlashBurst, tickSlashFx, resetSlashFx, getActiveSlashFx, type SpellInstance, type SwordSlashFx, type SpellCallbacks } from '@/lib/spellRunner';
import { FATAMORGANA, DOZENS_OF_SLASHES, SWORD_SKILL_COOLDOWNS, type SwordSkillId } from '@/lib/swordSkills';

const SPEED = C.walkSpeed;

/** M1W3D6 #1 E1: locomotion state blend window (seconds). The idle <-> walk
 *  ease runs for exactly this long; attack, dodge and airborne never blend. */
const LOCO_BLEND_S = 0.1;

/** M1W3D6 #1 E1b: per-weapon impact feedback — hitstop duration (ms), camera
 *  shake base intensity, and the weapon's element colour. There is no element
 *  palette anywhere in the codebase (audit A1.5 = none), so the trail colours
 *  are these fixed hex values. */
type ImpactWeapon = 'sword' | 'dagger' | 'm1887' | 'crossbow' | 'staff' | 'core';
const IMPACT: Record<ImpactWeapon, { hitStopMs: number; shake: number; color: string }> = {
  sword:    { hitStopMs: 80,  shake: 0.15, color: '#8B5A2B' }, // earth
  dagger:   { hitStopMs: 50,  shake: 0.10, color: '#3FA9F5' }, // water
  m1887:    { hitStopMs: 120, shake: 0.35, color: '#FF6A1F' }, // fire
  crossbow: { hitStopMs: 60,  shake: 0.15, color: '#8B5A2B' }, // earth
  staff:    { hitStopMs: 100, shake: 0.20, color: '#3FA9F5' }, // water
  core:     { hitStopMs: 80,  shake: 0.18, color: '#4B2A7A' }, // shadow
};

/** Resolve the impact row for a held weapon id (null = no row). */
function impactWeaponFor(itemId: string | null): ImpactWeapon | null {
  switch (itemId) {
    case 'iron_sword':
    case 'wooden_sword':
      return 'sword';
    case 'dual_dagger':
      return 'dagger';
    case 'm1887':
      return 'm1887';
    case 'crossbow':
      return 'crossbow';
    case 'water_staff':
      return 'staff';
    case 'resonance_core':
      return 'core';
    default:
      return null;
  }
}

/** Shake scale from the damage fraction of the weapon's heaviest single hit,
 *  clamped to [0.5, 1] so a light hit still reads as an impact. */
function damageScaleOf(damage: number, maxDamage: number): number {
  if (!(maxDamage > 0)) return 1;
  return Math.max(0.5, Math.min(1, damage / maxDamage));
}

/** E1b: heaviest single hit across the staff's skill table — the denominator
 *  for the water element's damage-scaled shake. Constant, computed once. */
const STAFF_MAX_HIT_DAMAGE = WATER_STAFF_SKILLS.reduce((m, s) => Math.max(m, s.damage), 0);

/** E1b: the crossbow's heaviest basic arrow — base damage at the maximum hit
 *  streak (CROSSBOW_STREAK.max is a constant in crossbowContent). */
const CROSSBOW_MAX_HIT_DAMAGE = CROSSBOW_CONFIG.damage * crossbowStreakMultiplier(CROSSBOW_STREAK.max);

/** E1b: the water staff's impact callback — one shared instance wired into every
 *  updateSpells call site so the per-frame spell tick allocates nothing.
 *  spellRunner stays the authority on what counts as a hit and on the damage
 *  the hit carried; this only maps the event onto the staff's IMPACT row. */
const staffSpellCallbacks: SpellCallbacks = {
  onHit: (ev) => {
    const hitSt = useGameStore.getState();
    hitSt.triggerHitStop(IMPACT.staff.hitStopMs);
    hitSt.triggerCameraShake(IMPACT.staff.shake * damageScaleOf(ev.damage, STAFF_MAX_HIT_DAMAGE));
  },
};

const SPRINT_MULT = C.sprintMultiplier;
const JUMP_FORCE = C.jumpForce;
const DOUBLE_JUMP_FORCE = C.doubleJumpForce;
const ROTATION_SPEED = C.rotationSpeed;

export const playerRigidBodyRef = { current: null as RapierRigidBody | null };

// Shared Dozens-of-Slashes FX assets — created once, reused across casts.
const slashArcGeometry = new THREE.TorusGeometry(1.4, 0.05, 6, 14, Math.PI * 0.6);
const slashArcMaterial = new THREE.MeshBasicMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.85 });
// Crossbow arrow visuals — created once, reused across every arrow.
const arrowShaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 5);
const arrowShaftMat = new THREE.MeshStandardMaterial({ color: '#d6b370', roughness: 0.8 });
const arrowHeadGeo = new THREE.ConeGeometry(0.05, 0.14, 5);
const arrowHeadMat = new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.7, roughness: 0.35 });

// Shared Water Staff spell visual assets — created once, reused across casts.
// Per-instance opacity is constant for every spell kind, so materials can be
// shared too; only transforms vary per instance.
const waveArcGeo = new THREE.TorusGeometry(0.55, 0.12, 8, 16, Math.PI);
const waveArcMat = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#0891b2', emissiveIntensity: 0.8, transparent: true, opacity: 0.85, metalness: 0.2, roughness: 0.2 });
const waveEdgeGeo = new THREE.BoxGeometry(1.1, 0.04, 0.12);
const waveEdgeMat = new THREE.MeshBasicMaterial({ color: '#a5f3fc', transparent: true, opacity: 0.9 });
const bulletOrbGeo = new THREE.SphereGeometry(0.1, 8, 8);
const bulletOrbMat = new THREE.MeshStandardMaterial({ color: '#67e8f9', emissive: '#06b6d4', emissiveIntensity: 1.0, metalness: 0.1, roughness: 0.1 });
const bulletTracerGeo = new THREE.CylinderGeometry(0.02, 0.05, 0.6, 6);
const bulletTracerMat = new THREE.MeshBasicMaterial({ color: '#a5f3fc', transparent: true, opacity: 0.45 });
const ballOrbGeo = new THREE.SphereGeometry(0.22, 12, 12);
const ballOrbMat = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#0284c7', emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.15 });
const ballHaloGeo = new THREE.SphereGeometry(0.32, 12, 12);
const ballHaloMat = new THREE.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.25, depthWrite: false });

// Module-level skill-edge tables — mutated in the frame loop instead of
// allocating a fresh array of edge objects every frame.
const STAFF_SKILL_EDGES: { key: string; pressed: boolean; skill: StaffSkill }[] = [
  { key: 'skill1', pressed: false, skill: WATER_STAFF_SKILLS[0] },
  { key: 'skill2', pressed: false, skill: WATER_STAFF_SKILLS[1] },
  { key: 'skill3', pressed: false, skill: WATER_STAFF_SKILLS[2] },
];
const SWORD_SKILL_EDGES: { key: string; pressed: boolean; skill: SwordSkill }[] = [
  { key: 'skill1', pressed: false, skill: FATAMORGANA },
  { key: 'skill2', pressed: false, skill: DOZENS_OF_SLASHES },
];
const GUN_SKILL_EDGES: { key: string; pressed: boolean; skill: GunSkill }[] = [
  { key: 'skill1', pressed: false, skill: M1887_SKILLS[0] },
  { key: 'skill2', pressed: false, skill: M1887_SKILLS[1] },
];
const CORE_SKILL_EDGES: { key: string; pressed: boolean; skill: CoreSkill }[] =
  RESONANCE_SKILLS.map((skill, i) => ({
    key: ['skill1', 'skill2', 'skill3', 'skill4', 'skill5'][i],
    pressed: false,
    skill,
  }));
const DAGGER_SKILL_EDGES: { key: string; pressed: boolean; skill: DaggerSkill }[] = [
  { key: 'skill1', pressed: false, skill: DAGGER_SKILLS[0] },
  { key: 'skill2', pressed: false, skill: DAGGER_SKILLS[1] },
];
const CROSSBOW_SKILL_EDGES: { key: string; pressed: boolean; skill: CrossbowSkill }[] = [
  { key: 'skill1', pressed: false, skill: CROSSBOW_SKILLS[0] },
  { key: 'skill2', pressed: false, skill: CROSSBOW_SKILLS[1] },
];

export default function Player() {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const playerMeshRef = useRef<THREE.Group>(null);
  const swordGroupRef = useRef<THREE.Group>(null);
  const swordPivotRef = useRef<THREE.Group>(null);
  const colliderRef = useRef<any>(null);
  
  const [, getKeys] = useKeyboardControls();
  // Four-piece armour (M1W2D6 #5): derive from the authoritative store state.
  // Attached as children of the body hierarchy so armour follows idle, walk,
  // jump, fall, attack, dodge and hit transforms.
  const armourSlots = useGameStore((s) => s.player.equippedArmourSlots);
  const armourArmorColor = '#8f9aa6';
  const armourMetalProps = { color: armourArmorColor, metalness: 0.55, roughness: 0.4 } as const;
  const { camera } = useThree() as { camera: THREE.PerspectiveCamera };
  const { rapier, world } = useRapier();
  const setPlayerPosition = useGameStore(state => state.setPlayerPosition);
  // Capture the loaded/new-game position once when the physics body mounts.
  // The store follows physics thereafter, so passing the live position prop
  // would continually try to reset the body while it moves.
  const initialPlayerPosition = useRef<[number, number, number]>([
    ...useGameStore.getState().player.position,
  ]).current;

  // Jump state refs
  const isGroundedRef = useRef(true);
  const hasJumpedInAirRef = useRef(false);
  const prevJumpInputRef = useRef(false);

  // Dodge state refs
  const prevDodgeInputRef = useRef(false);
  const isDodgingRef = useRef(false);
  const dodgeTimerRef = useRef(0);
  const dodgeCooldownRef = useRef(0);
  const dodgeDirRef = useRef(new THREE.Vector3());

  // Attack state refs
  const prevAttackInputRef = useRef(false);
  const attackTimerRef = useRef(0);
  const attackComboStageRef = useRef(0);
  const hitEnemiesThisSwingRef = useRef<Set<string>>(new Set());

  // Camera state refs
  const currentCameraPos = useRef(new THREE.Vector3(0, 5, 10)).current;
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0)).current;
  const localShakeRef = useRef(0);
  const lastShakeReqIdRef = useRef(0);
  const hitStopTimerRef = useRef(0);
  const lastHitStopReqIdRef = useRef(0);
  // ── BF4 body hierarchy refs (state-driven limb animation) ──
  const hipsGroupRef = useRef<THREE.Group>(null);
  const torsoGroupRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const leftArmGroupRef = useRef<THREE.Group>(null);
  const rightArmGroupRef = useRef<THREE.Group>(null);
  // Mesh-wrapper refs: first-person mode hides these (not the mesh root), so
  // the arm groups and the weapons they carry stay visible.
  const bodyMeshGroupRef = useRef<THREE.Group>(null);
  const armMeshRightRef = useRef<THREE.Group>(null);
  const armMeshLeftRef = useRef<THREE.Group>(null);
  const leftLegGroupRef = useRef<THREE.Group>(null);
  const rightLegGroupRef = useRef<THREE.Group>(null);
  const hitRecoilRef = useRef(0); // 0..1 decaying hit-reaction lean
  const lastDamageTimeRef = useRef(0);
  const smoothedDistRef = useRef(6);

  // Declare skill-edge refs before useFrame — they are synchronised in the
  // modal-blocked early-return path, which runs before the cast blocks.
  const prevSkillInputRefs = useRef<Record<string, boolean>>({});
  const prevSwordSkillInputRefs = useRef<Record<string, boolean>>({});

  // Movement polish refs
  const wasGroundedRef = useRef(true);       // for landing detection
  const landingDipRef = useRef(0);            // current camera dip offset (visual only)
  const squashScaleRef = useRef(1);           // body Y-scale for landing squash
  const headBobPhaseRef = useRef(0);          // accumulating phase for head bob
  // M1W3D6 #1 E1 locomotion blend state — scalars only, created once (no
  // per-frame allocation). `state` is the locomotion state rendered last frame
  // (null = airborne); `t` >= the blend window means "settled, no blend";
  // `from*` is the pose to ease from on a transition.
  const locoBlendRef = useRef<{
    state: 'idle' | 'walk' | null;
    t: number;
    fromL: number;
    fromR: number;
    fromLA: number;
    fromRA: number;
  }>({ state: null, t: LOCO_BLEND_S, fromL: 0, fromR: 0, fromLA: 0, fromRA: 0 });
  const prevFootstepDistRef = useRef(0);     // distance accumulator for footstep cadence
  const currentFovRef = useRef<number>(C.baseFov);    // smoothed FOV for sprint transition

  // Respawn state ref
  const prevDeathOverlayRef = useRef(false);

  // Mage (Water Staff) state — spell-specific, fully transient.
  const staffGroupRef = useRef<THREE.Group>(null);
  const castAnimRef = useRef(0); // 0..1 cast pose blend
  const skillCooldownRefs = useRef<Record<string, number>>({});
  const spellMeshRefs = useRef<Map<SpellInstance, THREE.Group>>(new Map());

  // Dual Dagger visual (M1W2D4): one held-weapon group per arm, shown when the
  // Dual Daggers occupy the selected hotbar slot. Visual-only -- equipment
  // truth remains the hotbar source. Refs needed for per-frame visibility.
  const daggerRightGroupRef = useRef<THREE.Group>(null);
  const daggerLeftGroupRef = useRef<THREE.Group>(null);
  // Gun + Core held visuals (M1W2D5): follow the same hotbar-derived
  // equipment flags as combat. Visual-only, no authority.
  const gunGroupRef = useRef<THREE.Group>(null);
  const crossbowGroupRef = useRef<THREE.Group>(null);
  const coreGroupRef = useRef<THREE.Group>(null);

  // Sword skill state (Fatamorgana / Dozens of Slashes) — fully transient.
  const ghostMeshRef = useRef<THREE.Group>(null);
  const swordSkillCooldownRefs = useRef<Record<string, number>>({});
  const dashTimerRef = useRef(0);
  const dashDirRef = useRef(new THREE.Vector3());
  const dashSpeedRef = useRef(0);
  const dashGhostRef = useRef(0); // 0..1 afterimage lifetime
  // Gun/Core skill state (transient).
  const gunSkillCooldownRefs = useRef<Record<string, number>>({});
  const coreSkillCooldownRefs = useRef<Record<string, number>>({});
  const prevGunSkillInputRefs = useRef<Record<string, boolean>>({});
  const prevCoreSkillInputRefs = useRef<Record<string, boolean>>({});
  const gunAmmoRef = useRef(M1887_CONFIG.ammoCapacity);
  const gunFireTimerRef = useRef(0); // rate-of-fire gate (basic fire)
  // M1887 muzzle flash: visible only during the 0.08s post-shot window.
  const gunMuzzleFlashRef = useRef<THREE.Mesh>(null);
  const gunMuzzleFlashTimerRef = useRef(0);
  const gunReloadTimerRef = useRef(0); // >0 while reloading
  const coreOverdriveRef = useRef(0);
  // Cataclysmic Resonance: 1.2s field phase, then the destructive pulse.
  const cataclysmTimerRef = useRef(0);
  const cataclysmBoostRef = useRef(1);
  const cataclysmFieldRef = useRef<THREE.Mesh>(null); // visual-only field ring
  // Dual Dagger skill state (transient) — Curse of Hell buff + serial attack.
  const daggerSkillCooldownRefs = useRef<Record<string, number>>({});
  const prevDaggerSkillInputRefs = useRef<Record<string, boolean>>({});
  const curseOfHellTimerRef = useRef(0); // >0 while the buff is active
  const tensOfSlashesRef = useRef({ active: false, elapsed: 0, struck: 0, timer: 0, hitIds: new Set<string>() });
  const slashFxMeshRefs = useRef<Map<SwordSlashFx, THREE.Group>>(new Map());
  // Crossbow state (M1W2D6 #5) — transient, instance-local.
  const crossbowSkillCooldownRefs = useRef<Record<string, number>>({});
  const prevCrossbowSkillInputRefs = useRef<Record<string, boolean>>({});
  const crossbowAmmoRef = useRef(CROSSBOW_CONFIG.ammoCapacity);
  const crossbowFireTimerRef = useRef(0); // basic-fire 0.25s gate
  const crossbowArrowMeshRefs = useRef<Map<ArrowInstance, THREE.Group>>(new Map());
  // Mimique de Ametralladora burst state.
  const mimiqueRef = useRef({ active: false, elapsed: 0, fireTimer: 0, shotsFired: 0 });
  // Hit-streak: confirmed hits increment, misses/3s-idle reset. Max 5.
  const crossbowStreakRef = useRef(0);
  const crossbowStreakTimerRef = useRef(0);

  // Transient spell state must not leak across session boundaries: leaving
  // gameplay (menu/new-game/load swaps gamePhase) clears the spell pool.
  const prevPhaseRef = useRef(useGameStore.getState().gamePhase);
  useEffect(() => useGameStore.subscribe((s) => {
    if (s.gamePhase !== 'playing' && prevPhaseRef.current === 'playing') {
      resetSpells();
      resetSlashFx();
      resetArrows();
      crossbowAmmoRef.current = CROSSBOW_CONFIG.ammoCapacity;
      crossbowFireTimerRef.current = 0;
      mimiqueRef.current.active = false;
      crossbowStreakRef.current = 0;
    }
    prevPhaseRef.current = s.gamePhase;
  }), []);

  // Unmount cleanup: remove any pooled spell meshes left in the scene.
  const sceneForCleanup = useThree(state => state.scene);
  useEffect(() => () => {
    // P0 lifecycle fix: the shared player rigid-body ref MUST be cleared when
    // the Player unmounts (scene teardown, house remount, new game). Without
    // this, GameScene door zones and enemies read a destroyed Rapier body and
    // Rust throws "null pointer passed to rust".
    playerRigidBodyRef.current = null;
    resetSpells();
    resetSlashFx();
    resetArrows();
    for (const [, group] of spellMeshRefs.current) sceneForCleanup.remove(group);
    for (const [, group] of slashFxMeshRefs.current) sceneForCleanup.remove(group);
    for (const [, group] of crossbowArrowMeshRefs.current) sceneForCleanup.remove(group);
    spellMeshRefs.current.clear();
    slashFxMeshRefs.current.clear();
    crossbowArrowMeshRefs.current.clear();
  }, [sceneForCleanup]);

  // Combat polish refs
  const weaponRecoilRef = useRef(0);           // current recoil offset
  const attackCamPushRef = useRef(0);          // current camera push offset
  const attackInputBufferRef = useRef(0);      // buffered attack press timer (seconds)
  const trailMeshRef = useRef<THREE.Mesh>(null);
  const trailAlphaRef = useRef(0);             // trail visibility alpha (0=hidden)

  // Reusable per-frame vectors (avoid GC pressure from repeated allocations)
  const _v1 = useRef(new THREE.Vector3()).current;
  const _v2 = useRef(new THREE.Vector3()).current;
  const _v3 = useRef(new THREE.Vector3()).current;
  const _v4 = useRef(new THREE.Vector3()).current;
  const _v5 = useRef(new THREE.Vector3()).current;
  const _groundRayDir = useRef(new THREE.Vector3(0, -1, 0)).current;
  const _groundRayOrigin = useRef(new THREE.Vector3()).current;
  // Reusable Ray objects — ground checks fire up to 5x/frame, camera 1x/frame.
  // Pre-allocating eliminates 6+ temporary Ray objects per frame.
  const _groundRay = useRef(new rapier.Ray(_groundRayOrigin, _groundRayDir)).current;
  const _camRay = useRef(new rapier.Ray(new THREE.Vector3(), new THREE.Vector3())).current;
  // Reusable position tuple for store updates (avoids a new array every frame)
  const _posTuple = useRef<[number, number, number]>([0, 0, 0]).current;

  // M1887 basic/skill shot: cone hit test from the player facing at gun range.
  // Damage per pellet scaled by multiplier; `stage` drives enemy stagger.
  const fireM1887Shot = (multiplier: number, stage: number) => {
    if (!rigidBodyRef.current) return;
    const t = rigidBodyRef.current.translation();
    _v2.set(t.x, t.y + 1.2, t.z);
    const rotY = playerMeshRef.current ? playerMeshRef.current.rotation.y : 0;
    _v3.set(Math.sin(rotY), 0, Math.cos(rotY));
    const dmg = M1887_CONFIG.damagePerPellet * M1887_CONFIG.pellets * multiplier;
    let hitAny = false;
    for (const target of enemyTargets.values()) {
      const ePos = target.getPosition();
      const dx = ePos.x - t.x;
      const dz = ePos.z - t.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= M1887_CONFIG.range && (dx * _v3.x + dz * _v3.z) / Math.max(dist, 0.001) > M1887_CONFIG.spreadCos - 0.35) {
        target.takeDamage(dmg, _v2, stage);
        hitAny = true;
      }
    }
    // E1b: impact feedback only on a confirmed hit. The shotgun's 8 pellets
    // resolve inside this one call, so this is inherently ONE hitstop for the
    // frame. Shake is scaled by the damage fraction and the existing muzzle
    // flash becomes the M1887's fire-coloured bloom (0.08s, in place).
    if (hitAny) {
      const hitSt = useGameStore.getState();
      hitSt.triggerHitStop(IMPACT.m1887.hitStopMs);
      hitSt.triggerCameraShake(IMPACT.m1887.shake * damageScaleOf(dmg, M1887_CONFIG.damagePerPellet * M1887_CONFIG.pellets));
      if (gunMuzzleFlashRef.current) {
        const mf = gunMuzzleFlashRef.current.material as THREE.MeshBasicMaterial;
        mf.color.set(IMPACT.m1887.color);
      }
    }
    // Muzzle flash: 0.08s window, originates at the barrel tip (the flash
    // mesh is parented to the gun barrel group facing +Z firing direction).
    gunMuzzleFlashTimerRef.current = 0.08;
  };

  /** E1b PHASE 4: point the existing melee trail at the held weapon's element
   *  colour. Called only when a swing starts — never per frame — so it adds no
   *  per-frame work and reuses the existing material. */
  const applyTrailColor = () => {
    const st = useGameStore.getState();
    const iw = impactWeaponFor(st.hotbar.slots[st.hotbar.selectedSlot]);
    if (!iw || !trailMeshRef.current) return;
    const mat = trailMeshRef.current.material as THREE.MeshBasicMaterial;
    mat.color.set(IMPACT[iw].color);
  };

  useFrame((state, delta) => {
    if (!rigidBodyRef.current || !playerMeshRef.current) return;
    playerRigidBodyRef.current = rigidBodyRef.current;

    // Respawn relocation. This must be observed HERE, above the blocking
    // early-return below: while the death overlay is up that branch returns
    // before reaching the ref update, so the overlay's true→false transition
    // was never seen and the rigid body was never moved back to the
    // checkpoint — respawn only healed the player in place, and the store's
    // position write was overwritten by the body on the next frame.
    const deathOverlay = useGameStore.getState().ui.deathOverlay;
    if (prevDeathOverlayRef.current && !deathOverlay) {
      const cp = useGameStore.getState().player.checkpointPos;
      rigidBodyRef.current.setTranslation({ x: cp[0], y: cp[1], z: cp[2] }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    prevDeathOverlayRef.current = deathOverlay;

    // Transient combat temporaries must not survive death. While the overlay
    // is up the swing/dodge/buff refs below simply freeze; if left alone the
    // respawned player would resume mid-swing, mid-dodge, or with a live
    // Cataclysm/Overdrive/Curse buff at the checkpoint. Cancel them once on
    // the respawn transition (attack → death, dodge → death, skill → death).
    if (prevDeathOverlayRef.current && !deathOverlay) {
      attackTimerRef.current = 0;
      attackComboStageRef.current = 0;
      hitEnemiesThisSwingRef.current.clear();
      attackInputBufferRef.current = 0;
      trailAlphaRef.current = 0;
      isDodgingRef.current = false;
      dodgeTimerRef.current = 0;
      dashTimerRef.current = 0;
      dashGhostRef.current = 0;
      coreOverdriveRef.current = 0;
      cataclysmTimerRef.current = 0;
      cataclysmBoostRef.current = 1;
      curseOfHellTimerRef.current = 0;
      tensOfSlashesRef.current.active = false;
      gunFireTimerRef.current = 0;
      // Crossbow transient state also dies with the player.
      crossbowFireTimerRef.current = 0;
      mimiqueRef.current.active = false;
      mimiqueRef.current.elapsed = 0;
      crossbowStreakRef.current = 0;
      crossbowStreakTimerRef.current = 0;
      // Locomotion blend is transient too: a respawn must snap to the state
      // pose rather than ease out of the pose the player died in.
      locoBlendRef.current.state = null;
      locoBlendRef.current.t = LOCO_BLEND_S;
      // E1b impact transients die with the player too.
      hitStopTimerRef.current = 0;
      localShakeRef.current = 0;
      if (playerMeshRef.current) { playerMeshRef.current.rotation.x = 0; playerMeshRef.current.position.y = 0; }
      if (swordGroupRef.current) swordGroupRef.current.rotation.set(0, 0, 0);
    }

    // Block all gameplay input while any modal, editor, dialogue, or death overlay is open.
    // Regeneration still ticks (harmless) but movement/combat/camera are frozen.
    const uiState = useGameStore.getState().ui;
    const hudEditMode = useGameStore.getState().hudEditMode;
    const activeDialogue = useGameStore.getState().activeDialogue;
    if (uiState.showSettings || uiState.showInventory || uiState.showQuestLog || uiState.mapOpen || hudEditMode || activeDialogue || uiState.deathOverlay) {
      // Zero out any residual velocity so the player doesn't drift (also
      // cancels an in-progress Fatamorgana dash if the map/modal opens mid-dash).
      dashTimerRef.current = 0;
      // Attack/dodge interruption: a swing or roll frozen behind a modal must
      // not resume when the modal closes — cancel it with its visuals
      // (attack → dialogue, attack → settings, dodge → dialogue, etc.).
      attackTimerRef.current = 0;
      attackInputBufferRef.current = 0;
      attackComboStageRef.current = 0;
      hitEnemiesThisSwingRef.current.clear();
      trailAlphaRef.current = 0;
      if (isDodgingRef.current) {
        isDodgingRef.current = false;
        dodgeTimerRef.current = 0;
        if (playerMeshRef.current) { playerMeshRef.current.rotation.x = 0; playerMeshRef.current.position.y = 0; }
      }
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true);
      // Spells already in flight finish their (finite) travel so they cannot
      // freeze mid-air and produce stale references; new casts stay blocked
      // because the cast block below is unreachable while this early-return
      // is active.
      // Keep input edge-tracking refs in sync while blocked, so keys held or
      // pressed during a modal cannot fire as a false "just pressed" edge on
      // the first unblocked frame (e.g. J closing the quest log must not
      // trigger an attack).
      const blockedKeys = getKeys();
      const blockedInputs = useGameStore.getState().inputs;
      prevJumpInputRef.current = blockedKeys.jump || blockedInputs.jump;
      prevAttackInputRef.current = blockedKeys.attack || blockedInputs.attack;
      prevDodgeInputRef.current = blockedKeys.dodge || blockedInputs.dodge;
      // Skill edges too: a Z/X/C press (or the mobile buttons) while blocked
      // must not fire as a false "just pressed" edge on the first unblocked
      // frame after the modal/map closes.
      const blockedHotbar = useGameStore.getState().hotbar;
      const blockedStaff =
        blockedHotbar.slots[blockedHotbar.selectedSlot] === 'water_staff' &&
        useGameStore.getState().player.archetype === 'mage';
      const blockedSkillKeys = [blockedKeys.skill1 || blockedInputs.skill1, blockedKeys.skill2 || blockedInputs.skill2, blockedKeys.skill3 || blockedInputs.skill3];
      if (blockedStaff) {
        ['skill1', 'skill2', 'skill3'].forEach((key, i) => { prevSkillInputRefs.current[key] = blockedSkillKeys[i]; });
      } else if (
        useGameStore.getState().player.archetype === 'fighter' &&
        (blockedHotbar.slots[blockedHotbar.selectedSlot] === 'iron_sword' ||
          blockedHotbar.slots[blockedHotbar.selectedSlot] === 'wooden_sword')
      ) {
        ['skill1', 'skill2'].forEach((key, i) => { prevSwordSkillInputRefs.current[key] = blockedSkillKeys[i]; });
      }
      // Gun/Core edges too: a Z/X/V/F press while blocked must not fire as a
      // false "just pressed" edge on the first unblocked frame.
      const blockedSel = blockedHotbar.slots[blockedHotbar.selectedSlot];
      if (blockedSel === 'm1887') {
        ['skill1', 'skill2'].forEach((key, i) => { prevGunSkillInputRefs.current[key] = blockedSkillKeys[i]; });
      } else if (blockedSel === 'resonance_core') {
        ['skill1', 'skill2', 'skill3', 'skill4', 'skill5'].forEach((key, i) => {
          const held = [blockedKeys.skill1 || blockedInputs.skill1, blockedKeys.skill2 || blockedInputs.skill2, blockedKeys.skill3 || blockedInputs.skill3, blockedKeys.skill4 || blockedInputs.skill4, blockedKeys.skill5 || blockedInputs.skill5][i];
          prevCoreSkillInputRefs.current[key] = held;
          // BUG-005: the Core gameplay edge path keys its "was pressed" state by
          // skill id, so the blocked-state sync must mirror that width or the
          // guard is silent. Both written keys are already-existing key spaces
          // (no third space is introduced).
          const coreSkillId = RESONANCE_SKILLS[i]?.id;
          if (coreSkillId) prevCoreSkillInputRefs.current[coreSkillId] = held;
        });
      } else if (blockedSel === 'dual_dagger') {
        ['skill1', 'skill2'].forEach((key, i) => { prevDaggerSkillInputRefs.current[key] = blockedSkillKeys[i]; });
      } else if (blockedSel === 'crossbow') {
        ['skill1', 'skill2'].forEach((key, i) => { prevCrossbowSkillInputRefs.current[key] = blockedSkillKeys[i]; });
      }
      return;
    }

    // Tick Passive Regeneration (Health/Stamina) and Combat Recovery
    useGameStore.getState().tickRegenerationAndCombat(delta);

    // Spell simulation continues even while modals are open so in-flight
    // spells finish their finite travel instead of freezing mid-air with
    // stale references. New casts stay blocked: the cast block below is
    // unreachable while this early-return is active.

    // Mage spell visuals: keep pooled meshes in sync with the spell pool.
    const seen = spellMeshRefs.current;
    const scene = state.scene;
    for (const [inst, group] of seen) {
      if (!inst.active) {
        scene.remove(group);
        seen.delete(inst);
      }
    }
    for (const inst of getActiveSpells()) {
      if (!inst.active || seen.has(inst)) continue;
      const g = new THREE.Group();
      // Shared geometry/materials — see module-level spell asset block.
      if (inst.skill.kind === 'wave') {
        // Slicing Water: crescent wave (torus arc) with a thin cutting edge.
        const arc = new THREE.Mesh(waveArcGeo, waveArcMat);
        arc.rotation.x = -Math.PI / 2;
        g.add(arc);
        g.add(new THREE.Mesh(waveEdgeGeo, waveEdgeMat));
      } else if (inst.visualId === 'waterbullet') {
        // Waterbullet: small fast droplet with a faint tracer.
        g.add(new THREE.Mesh(bulletOrbGeo, bulletOrbMat));
        const tracer = new THREE.Mesh(bulletTracerGeo, bulletTracerMat);
        tracer.rotation.x = Math.PI / 2;
        tracer.position.z = -0.35;
        g.add(tracer);
      } else {
        // Waterball: concentrated sphere + ripple halo.
        g.add(new THREE.Mesh(ballOrbGeo, ballOrbMat));
        g.add(new THREE.Mesh(ballHaloGeo, ballHaloMat));
      }
      scene.add(g);
      seen.set(inst, g);
    }
    // Sync transforms.
    for (const [inst, group] of seen) {
      group.position.copy(inst.pos);
      group.rotation.y = Math.atan2(inst.dir.x, inst.dir.z);
      if (inst.skill.kind === 'wave') {
        // Wave pitch + gentle spin for the compressed-water read.
        group.rotation.x = Math.sin(inst.age * 14) * 0.2;
      }
    }

    // Crossbow arrow visuals: keep pooled meshes in sync with the arrow pool.
    // Update runs below (after the blocked-frame early-return path re-ticks
    // updateArrows) — here we only mirror active instances into meshes.
    const arrowSeen = crossbowArrowMeshRefs.current;
    for (const [arrow, group] of arrowSeen) {
      if (!arrow.active) {
        scene.remove(group);
        arrowSeen.delete(arrow);
      }
    }
    for (const arrow of getActiveArrows()) {
      if (!arrow.active || arrowSeen.has(arrow)) continue;
      const g = new THREE.Group();
      // Shared geometry/material — no per-arrow allocation beyond the Group.
      const shaft = new THREE.Mesh(arrowShaftGeo, arrowShaftMat);
      g.add(shaft);
      const head = new THREE.Mesh(arrowHeadGeo, arrowHeadMat);
      head.position.z = 0.24;
      g.add(head);
      scene.add(g);
      arrowSeen.set(arrow, g);
    }
    for (const [arrow, group] of arrowSeen) {
      group.position.copy(arrow.pos);
      group.rotation.y = Math.atan2(arrow.dir.x, arrow.dir.z);
    }

    // Sword AoE slash FX: keep pooled meshes in sync with the slash pool.
    const slashSeen = slashFxMeshRefs.current;
    for (const [fx, group] of slashSeen) {
      if (!fx.active) {
        scene.remove(group);
        slashSeen.delete(fx);
      }
    }
    for (const fx of getActiveSlashFx()) {
      if (!fx.active || slashSeen.has(fx)) continue;
      const g = new THREE.Group();
      // One visual slash element: a thin arced plane, oriented radially.
      // Shared geometry/material — no per-cast allocation beyond the Group.
      const arc = new THREE.Mesh(
        slashArcGeometry,
        slashArcMaterial,
      );
      g.add(arc);
      scene.add(g);
      slashSeen.set(fx, g);
    }
    for (const [fx, group] of slashSeen) {
      const t = fx.progress;
      const r = 0.6 + t * 2.6; // expand outward through the AoE radius
      group.position.set(fx.cx, fx.cy, fx.cz);
      group.rotation.set(-Math.PI / 2 + t * 0.6, fx.angle, 0);
      group.scale.setScalar(r / 1.4);
      slashArcMaterial.opacity = 0.85 * (1 - t);
    }

    // Check camera shake and hit stop requests
    const { cameraShakeRequest, hitStopMsRequest } = useGameStore.getState();
    if (cameraShakeRequest && cameraShakeRequest.id !== lastShakeReqIdRef.current) {
      lastShakeReqIdRef.current = cameraShakeRequest.id;
      localShakeRef.current = Math.max(localShakeRef.current, cameraShakeRequest.intensity);
    }
    if (hitStopMsRequest && hitStopMsRequest.id !== lastHitStopReqIdRef.current) {
      lastHitStopReqIdRef.current = hitStopMsRequest.id;
      hitStopTimerRef.current = hitStopMsRequest.durationMs / 1000;
    }

    let effectiveDelta = delta;
    if (hitStopTimerRef.current > 0) {
      hitStopTimerRef.current -= delta;
      effectiveDelta = 0; // Freeze attack animation frame progress during hit stop
    }

    const { forward, backward, left, right, jump: keyJump, sprint: keySprint, attack: keyAttack, dodge: keyDodge, skill1: keySkill1, skill2: keySkill2, skill3: keySkill3, skill4: keySkill4, skill5: keySkill5 } = getKeys();
    const { joystick, jump: storeJump, attack: storeAttack, dodge: storeDodge, sprint: storeSprint, cameraAngle, cameraPitch, skill1: storeSkill1, skill2: storeSkill2, skill3: storeSkill3, skill4: storeSkill4, skill5: storeSkill5 } = useGameStore.getState().inputs;
    const cameraMode = useGameStore.getState().settings.cameraMode;
    
    const jumpInput = keyJump || storeJump;
    const dodgeInput = keyDodge || storeDodge;
    const attackInput = keyAttack || storeAttack;
    const sprintInput = keySprint || storeSprint;

    const velocity = rigidBodyRef.current.linvel();
    const translation = rigidBodyRef.current.translation();
    
    // -------------------------------------------------------------
    // 1. GROUND CHECK & JUMP LOGIC
    // -------------------------------------------------------------
    // Dynamically query player collider dimensions & world position
    let halfHeight = 0.5;
    let radius = 0.5;
    let colliderOffsetY = 1.0;

    const playerCollider = colliderRef.current ? ((colliderRef.current as any).raw || colliderRef.current) : undefined;
    const playerBody = rigidBodyRef.current ? ((rigidBodyRef.current as any).raw || rigidBodyRef.current) : undefined;

    if (playerCollider) {
      if (typeof playerCollider.halfHeight === 'function') {
        halfHeight = playerCollider.halfHeight();
      } else if (typeof playerCollider.halfHeight === 'number') {
        halfHeight = playerCollider.halfHeight;
      }

      if (typeof playerCollider.radius === 'function') {
        radius = playerCollider.radius();
      } else if (typeof playerCollider.radius === 'number') {
        radius = playerCollider.radius;
      }

      if (typeof playerCollider.translation === 'function') {
        const cTrans = playerCollider.translation();
        if (cTrans && typeof cTrans.y === 'number') {
          colliderOffsetY = cTrans.y - translation.y;
        }
      }
    }

    // Dynamic bottom Y of capsule collider in world coordinates
    const colliderBottomY = translation.y + colliderOffsetY - (halfHeight + radius);

    // Ray origin starts slightly inside the collider bottom (skin width = 0.1m)
    const skinWidth = 0.1;
    const rayOriginY = colliderBottomY + skinWidth;
    const maxCastDistance = skinWidth + 0.15; // Cast 0.15m below collider bottom

    // Multi-point raycast (center + 4 cardinal points around capsule base)
    const rayOffsets = [
      { x: 0, z: 0 },
      { x: radius * 0.5, z: 0 },
      { x: -radius * 0.5, z: 0 },
      { x: 0, z: radius * 0.5 },
      { x: 0, z: -radius * 0.5 },
    ];

    let groundedByRay = false;

    for (const offset of rayOffsets) {
      _groundRayOrigin.set(translation.x + offset.x, rayOriginY, translation.z + offset.z);
      _groundRay.origin = _groundRayOrigin;
      const hit = world.castRay(_groundRay, maxCastDistance, true, undefined, undefined, playerCollider, playerBody);

      if (hit !== null && hit.timeOfImpact <= maxCastDistance) {
        groundedByRay = true;
        break;
      }
    }

    const isGrounded = groundedByRay && Math.abs(velocity.y) < 2.5;

    if (isGrounded) {
      isGroundedRef.current = true;
      hasJumpedInAirRef.current = false;
    } else {
      isGroundedRef.current = false;
    }

    // Initialize target velocities from current linear velocity
    let targetVx = velocity.x;
    let targetVy = velocity.y;
    let targetVz = velocity.z;

    // ── Cheat: noclip — disable the player's own collider while active.
    // Only the player body is affected; NPCs/enemies/projectiles keep their
    // collision. Turning it off restores normal collision behaviour.
    const noclip = useGameStore.getState().cheat.noclip;
    if (colliderRef.current) {
      const raw = (colliderRef.current as unknown as { raw?: { setEnabled(v: boolean): void } }).raw;
      if (raw && typeof raw.setEnabled === 'function') raw.setEnabled(!noclip);
    }

    // ── Cheat: fly — camera-relative vertical movement through the existing
    // input architecture: Jump ascends, Sprint descends, gravity suspended.
    const fly = useGameStore.getState().cheat.fly;
    if (fly) {
      rigidBodyRef.current.setGravityScale(0, true);
      if (jumpInput) targetVy = SPEED;
      else if (sprintInput) targetVy = -SPEED;
      else targetVy = 0;
      // In fly mode the rest of the jump/gravity pipeline is skipped below;
      // horizontal movement still uses the normal camera-relative path.
    }

    // Edge-triggered Jump
    const jumpJustPressed = jumpInput && !prevJumpInputRef.current;
    prevJumpInputRef.current = jumpInput;

    if (jumpJustPressed && !isDodgingRef.current && !fly) {
      if (isGroundedRef.current) {
        targetVy = JUMP_FORCE;
        isGroundedRef.current = false;
      } else if (!hasJumpedInAirRef.current) {
        targetVy = DOUBLE_JUMP_FORCE;
        hasJumpedInAirRef.current = true;
      }
    }

    // Variable gravity: lighter while rising, heavier while falling.
    // This makes the apex feel natural and the landing feel heavier without
    // changing peak jump height.
    // Use targetVy (which includes the jump impulse) rather than the stale
    // current velocity so the first jump frame gets rising gravity, not fall.
    // Apply fall gravity when rising slowly (near apex) for a snappy transition,
    // or when actually falling. This eliminates the floaty hang at the top.
    // Fly mode manages its own gravity (set to 0 above) and skips this pipeline.
    if (!fly) {
      const isRising = targetVy > C.apexThreshold;
      const gravityScale = isRising ? C.jumpGravity : C.fallGravity;
      rigidBodyRef.current.setGravityScale(gravityScale, true);

      // Slope handling: when grounded and vertical velocity is small, dampen it
      // to reduce jitter and bouncing on uneven terrain. Uses isGroundedRef
      // (not the local isGrounded) so a just-triggered jump — which sets the
      // ref to false — is not overwritten back to zero.
      if (isGroundedRef.current && Math.abs(velocity.y) < C.slopeDampThreshold) {
        targetVy = velocity.y * C.slopeDampFactor;
      }
    }

    // Landing detection — trigger visual feedback on ground transition
    if (isGrounded && !wasGroundedRef.current) {
      const fallSpeed = Math.abs(velocity.y);
      if (fallSpeed >= C.landingMinFallSpeed) {
        landingDipRef.current = C.landingDipStrength;
        squashScaleRef.current = C.landingSquashScale;
      }
    }
    wasGroundedRef.current = isGrounded;

    // Recover landing dip and squash smoothly
    landingDipRef.current = THREE.MathUtils.lerp(landingDipRef.current, 0, Math.min(1, delta * C.landingDipSpeed));
    squashScaleRef.current = THREE.MathUtils.lerp(squashScaleRef.current, 1, Math.min(1, delta * C.landingSquashRecover));
    if (playerMeshRef.current) {
      playerMeshRef.current.scale.y = squashScaleRef.current;
    }

    // -------------------------------------------------------------
    // 2. DODGE LOGIC
    // -------------------------------------------------------------
    if (dodgeCooldownRef.current > 0) {
      dodgeCooldownRef.current -= delta;
    }

    const dodgeJustPressed = dodgeInput && !prevDodgeInputRef.current;
    prevDodgeInputRef.current = dodgeInput;

    if (dodgeJustPressed && !isDodgingRef.current && dodgeCooldownRef.current <= 0) {
      const dodgeSuccess = useGameStore.getState().triggerPlayerDodge();
      if (dodgeSuccess) {
        isDodgingRef.current = true;
        dodgeTimerRef.current = CC.dodgeDurationMs / 1000;
        dodgeCooldownRef.current = CC.dodgeCooldownSec; // Cooldown before next roll

        // Movement direction
        _v1.set(0, 0, 0);
        if (forward) _v1.z -= 1;
        if (backward) _v1.z += 1;
        if (left) _v1.x -= 1;
        if (right) _v1.x += 1;
        if (joystick.x !== 0 || joystick.y !== 0) {
          _v1.x = joystick.x;
          _v1.z = joystick.y;
        }
        
        if (_v1.lengthSq() > 0.01) {
          _v1.normalize();
          const finalX = _v1.x * Math.cos(cameraAngle) + _v1.z * Math.sin(cameraAngle);
          const finalZ = -_v1.x * Math.sin(cameraAngle) + _v1.z * Math.cos(cameraAngle);
          dodgeDirRef.current.set(finalX, 0, finalZ).normalize();
        } else {
          const rotY = playerMeshRef.current.rotation.y;

          dodgeDirRef.current.set(Math.sin(rotY), 0, Math.cos(rotY)).normalize();
        }
      }
    }

    // Handle Active Dodge Roll
    if (isDodgingRef.current) {
      dodgeTimerRef.current -= delta;
      const currentSpeed = sprintInput ? SPEED * SPRINT_MULT : SPEED;
      const dodgeSpeed = currentSpeed * CC.dodgeSpeedMultiplier;

      targetVx = dodgeDirRef.current.x * dodgeSpeed;
      targetVz = dodgeDirRef.current.z * dodgeSpeed;

      // Roll animation (M1W2D6 #5): distributed through the body hierarchy —
      // crouch → tucked roll → recovery. Physics displacement is untouched;
      // only visual group transforms are driven. The normal idle/walk block
      // below is skipped while dodging so limb poses cannot fight the roll.
      const rollProgress = 1 - Math.max(0, dodgeTimerRef.current / (CC.dodgeDurationMs / 1000));
      if (playerMeshRef.current) {
        // Crouch phase: 0..0.18 — hips drop, torso leans forward, root pitches
        // slightly to set the roll axis direction.
        // Roll phase: 0.18..0.82 — root pitches a full forward roll while the
        // limb groups tuck toward the torso.
        // Recovery: 0.82..1 — transforms ease back toward neutral.
        const crouch = Math.min(1, rollProgress / 0.18) * (1 - Math.max(0, (rollProgress - 0.18) / 0.06));
        const rollT = Math.min(1, Math.max(0, (rollProgress - 0.18) / 0.64));
        const recover = Math.max(0, (rollProgress - 0.82) / 0.18);
        const tuck = Math.sin(Math.min(1, rollT) * Math.PI); // 0→1→0 fold amount
        playerMeshRef.current.rotation.x = crouch * 0.25 + rollT * Math.PI * 2 * (1 - recover);
        // Ground-penetration fix (P2.4): while pitched mid-roll the body's
        // folded silhouette would dip below the terrain. A visual-only root
        // lift (peak 0.35u at mid-roll) keeps feet above the ground plane.
        // Physics displacement is untouched; the lift decays with the same
        // tuck envelope and resets to 0 on dodge expiry.
        playerMeshRef.current.position.y = tuck * 0.35;
        if (hipsGroupRef.current) {
          hipsGroupRef.current.position.y = 0.72 - crouch * 0.18 - tuck * 0.12 + recover * 0.3 * tuck;
        }
        if (torsoGroupRef.current) {
          torsoGroupRef.current.rotation.x = crouch * 0.5 + tuck * 0.9 - recover * tuck * 0.9;
        }
        if (leftArmGroupRef.current && rightArmGroupRef.current && attackTimerRef.current <= 0) {
          // Arms compact: fold inward/up toward the torso during the roll.
          const compact = crouch * 0.6 + tuck * 1.6 - recover * tuck * 1.6;
          leftArmGroupRef.current.rotation.x = compact;
          rightArmGroupRef.current.rotation.x = compact;
        }
        if (leftLegGroupRef.current && rightLegGroupRef.current) {
          // Knees bend then tuck toward the torso.
          const knee = crouch * 0.8 + tuck * 1.8 - recover * tuck * 1.8;
          leftLegGroupRef.current.rotation.x = knee;
          rightLegGroupRef.current.rotation.x = knee * 0.85;
        }
      }

      if (dodgeTimerRef.current <= 0) {
        isDodgingRef.current = false;
        if (playerMeshRef.current) { playerMeshRef.current.rotation.x = 0; playerMeshRef.current.position.y = 0; }
        if (hipsGroupRef.current) hipsGroupRef.current.position.y = 0.72;
        if (torsoGroupRef.current) torsoGroupRef.current.rotation.x = 0;
        if (leftArmGroupRef.current && attackTimerRef.current <= 0) leftArmGroupRef.current.rotation.x = 0;
        if (rightArmGroupRef.current && attackTimerRef.current <= 0) rightArmGroupRef.current.rotation.x = 0;
        if (leftLegGroupRef.current) leftLegGroupRef.current.rotation.x = 0;
        if (rightLegGroupRef.current) rightLegGroupRef.current.rotation.x = 0;
      }
    }

    // -------------------------------------------------------------
    // 2b. MAGE SPELL CASTING (Water Staff equipped)
    // -------------------------------------------------------------
    // Equipment is derived from the existing inventory/hotbar source of truth:
    // the staff is equipped when it sits in the selected hotbar slot.
    const hotbar = useGameStore.getState().hotbar;
    const selectedWeapon = hotbar.slots[hotbar.selectedSlot];
    // Archetype is authoritative gameplay state: a Fighter cannot cast even if
    // a Water Staff somehow occupies the slot (e.g. saved layout).
    const staffEquipped =
      hotbar.slots[hotbar.selectedSlot] === 'water_staff' &&
      useGameStore.getState().player.archetype === 'mage';

    if (staffEquipped) {
      // Spell skills fire on the input edge only (held input cannot spam).
      // Module-level edge table — avoids a per-frame array/object allocation.
      const skillEdges = STAFF_SKILL_EDGES;
      skillEdges[0].pressed = keySkill1 || storeSkill1;
      skillEdges[1].pressed = keySkill2 || storeSkill2;
      skillEdges[2].pressed = keySkill3 || storeSkill3;
      for (const { key, pressed, skill } of skillEdges) {
        const was = prevSkillInputRefs.current[key] ?? false;
        prevSkillInputRefs.current[key] = pressed;
        const cds = skillCooldownRefs.current;
        cds[skill.id] = Math.max(0, (cds[skill.id] ?? 0) - effectiveDelta);
        if (pressed && !was && !isDodgingRef.current && cds[skill.id] <= 0) {
          cds[skill.id] = SKILL_COOLDOWNS[skill.id];
          castAnimRef.current = 1;
          useGameStore.getState().reportSkillFired(skill.id);
          // Cast origin: staff head (chest height, slightly ahead of player).
          _v1.set(translation.x, translation.y + 1.2, translation.z);
          const rotY = playerMeshRef.current.rotation.y;

          _v3.set(Math.sin(rotY), 0, Math.cos(rotY));
          spawnSpell(skill, _v1, _v3);
        }
        // Keep the skill bar cooldown readout in sync with actual gameplay.
        if (cds[skill.id] > 0 || useGameStore.getState().skillState.cooldowns[skill.id] > 0) {
          useGameStore.getState().reportSkillCooldown(skill.id, cds[skill.id]);
        }
      }
    } else {
      // Equipment transitions reset skill edges so re-equipping mid-press
      // cannot fire a stale cast.
      prevSkillInputRefs.current = {};
    }

    // Tick spell simulation every frame (regardless of blocking later in the
    // frame — spells were spawned only while gameplay input was live).
    updateSpells(delta, staffSpellCallbacks);
    tickSlashFx(delta);
    if (castAnimRef.current > 0) {
      castAnimRef.current = Math.max(0, castAnimRef.current - delta * 4);
    }

    // ── DUAL DAGGER SKILLS (M1W2D5 C3) ──────────────────────────────
    // Exactly two slots: Z (Curse of Hell), X (Tens of Slashes).
    const daggerActive = selectedWeapon === 'dual_dagger';
    {
      const dcds = daggerSkillCooldownRefs.current;
      for (const id of Object.keys(dcds)) dcds[id] = Math.max(0, dcds[id] - effectiveDelta);
      if (daggerActive) {
        const dagSt = useGameStore.getState();
        const daggerEdges = DAGGER_SKILL_EDGES;
        daggerEdges[0].pressed = keySkill1 || storeSkill1;
        daggerEdges[1].pressed = keySkill2 || storeSkill2;
        for (const { key, pressed, skill } of daggerEdges) {
          const was = prevDaggerSkillInputRefs.current[key] ?? false;
          prevDaggerSkillInputRefs.current[key] = pressed;
          // Coerce undefined → 0: a fresh cooldown ref must never block the
          // first activation (undefined <= 0 is false).
          dcds[skill.id] = Math.max(0, (dcds[skill.id] ?? 0) - effectiveDelta);
          if (pressed && !was && !isDodgingRef.current && dcds[skill.id] <= 0) {
            if (!dagSt.isItemSkillUnlocked('dual_dagger', DAGGER_SKILLS.indexOf(skill))) {
              dagSt.addNotification(`${skill.name} requires a higher weapon level.`);
            } else {
              dcds[skill.id] = DAGGER_SKILL_COOLDOWNS[skill.id];
              dagSt.reportSkillFired(skill.id);
              dagSt.grantItemExpById('dual_dagger', 8);
              if (skill.id === 'curse_of_hell') {
                // Buff only — no direct damage. Applied through the
                // authoritative transient buff timer read by melee combat.
                curseOfHellTimerRef.current = CURSE_OF_HELL.duration;
                dagSt.addNotification('Curse of Hell: blades empowered (+30% damage, +40% attack speed, knockback hits) for 5s.');
              } else {
                // Serial attack: strikes begin on subsequent frames.
                const s = tensOfSlashesRef.current;
                s.active = true;
                s.elapsed = 0;
                s.struck = 0;
                s.timer = 0;
                s.hitIds.clear();
                dagSt.addNotification('Tens of Slashes unleashed!');
              }
            }
          }
          if (dcds[skill.id] > 0 || dagSt.skillState.cooldowns[skill.id] > 0) {
            dagSt.reportSkillCooldown(skill.id, dcds[skill.id]);
          }
        }
      } else {
        curseOfHellTimerRef.current = 0;
        tensOfSlashesRef.current.active = false;
      }
    }
    // Tens of Slashes serial execution: 10 timed strikes over 3s. Each
    // strike is a real hit event (individual damage + stun + bleed on
    // valid in-range targets). Damage happens per strike, not once at end.
    {
      const s = tensOfSlashesRef.current;
      if (s.active) {
        s.elapsed += effectiveDelta;
        s.timer -= effectiveDelta;
        const strikeInterval = TENS_OF_SLASHES.duration / TENS_OF_SLASHES.strikeCount;
        while (s.timer <= 0 && s.struck < TENS_OF_SLASHES.strikeCount) {
          s.struck += 1;
          s.timer += strikeInterval;
          // Alternate-hand visual slash particles.
          useGameStore.getState().addSlashParticles(translation.x, translation.y + 1.0, translation.z, Math.sin(playerMeshRef.current.rotation.y), Math.cos(playerMeshRef.current.rotation.y), '#fbbf24');
          const perStrike = TENS_OF_SLASHES.directDamage / TENS_OF_SLASHES.strikeCount; // 3 per strike = 30 total
          for (const target of enemyTargets.values()) {
            const ePos = target.getPosition();
            const dx = ePos.x - translation.x;
            const dz = ePos.z - translation.z;
            if (dx * dx + dz * dz <= TENS_OF_SLASHES.radius * TENS_OF_SLASHES.radius) {
              const dealt = target.takeDamage(perStrike, _v2.set(translation.x, translation.y + 1.0, translation.z), 2);
              if (dealt && !s.hitIds.has(target.id)) {
                s.hitIds.add(target.id);
                // Stun + bleeding only on enemies actually struck.
                applyStun(target.id, TENS_OF_SLASHES.stunDuration);
                applyBleeding(target.id, TENS_OF_SLASHES.bleedDuration);
              }
            }
          }
        }
        if (s.elapsed >= TENS_OF_SLASHES.duration) {
          s.active = false;
          s.hitIds.clear();
        }
      }
    }
    if (curseOfHellTimerRef.current > 0) {
      curseOfHellTimerRef.current = Math.max(0, curseOfHellTimerRef.current - effectiveDelta);
    }

    // ── SWORD SKILLS (staff NOT equipped) ────────────────────────────
    // Fatamorgana (Z): burst dash through the authoritative physics body.
    // Dozens of Slashes (X): one bounded AoE, 17 visual slashes, funnel damage.
    // Mirrors the skill-UI gate exactly: a Fighter needs an actual fighter
    // weapon in the selected slot. Without the equipment check the skills
    // fired bare-handed (confirmed at runtime) while the UI hid the buttons.
    // Sword SKILLS require an actual sword in hand. Dual Daggers are a
    // fighter weapon but have no sword skills — the previous "anything not a
    // staff" check made Z/X fire Sword skills while daggers were equipped.
    const swordEquipped =
      selectedWeapon === 'iron_sword' || selectedWeapon === 'wooden_sword';
    const daggerEquipped = selectedWeapon === 'dual_dagger';
    // Presentation guard: an in-flight reload animation must never leave the
    // gun visually hidden while a valid weapon is still equipped.
    const swordUsable =
      !staffEquipped &&
      useGameStore.getState().player.archetype === 'fighter' &&
      swordEquipped;
    if (swordUsable) {
      const swordEdges = SWORD_SKILL_EDGES;
      swordEdges[0].pressed = keySkill1 || storeSkill1;
      swordEdges[1].pressed = keySkill2 || storeSkill2;
      for (const { key, pressed, skill } of swordEdges) {
        const was = prevSwordSkillInputRefs.current[key] ?? false;
        prevSwordSkillInputRefs.current[key] = pressed;
        const cds = swordSkillCooldownRefs.current;
        cds[skill.id] = Math.max(0, (cds[skill.id] ?? 0) - effectiveDelta);
        if (pressed && !was && !isDodgingRef.current && cds[skill.id] <= 0 && dashTimerRef.current <= 0) {
          cds[skill.id] = SWORD_SKILL_COOLDOWNS[skill.id];
          useGameStore.getState().reportSkillFired(skill.id);
          if (skill.id === 'fatamorgana') {
            // Dash along current facing (XZ), authoritative body velocity.
            const rotY = playerMeshRef.current.rotation.y;
            dashDirRef.current.set(Math.sin(rotY), 0, Math.cos(rotY)).normalize();
            dashTimerRef.current = skill.dashDuration!;
            dashSpeedRef.current = skill.dashDistance! / skill.dashDuration!;
            dashGhostRef.current = 1; // afterimage lifetime (visual only)
          } else {
            // Dozens of Slashes: AoE around the player, one hit per target.
            _v2.set(translation.x, translation.y + 1.0, translation.z);
            spawnSlashBurst(translation.x, translation.y + 1.0, translation.z);
            for (const target of enemyTargets.values()) {
              const ePos = target.getPosition();
              const dx = ePos.x - translation.x;
              const dz = ePos.z - translation.z;
              if (dx * dx + dz * dz <= skill.aoeRadius! * skill.aoeRadius!) {
                target.takeDamage(skill.aoeDamage!, _v2, 2);
              }
            }
            useGameStore.getState().triggerCameraShake(CC.shakeLight);
          }
        }
        // Keep the skill bar cooldown readout in sync with actual gameplay.
        if (cds[skill.id] > 0 || useGameStore.getState().skillState.cooldowns[skill.id] > 0) {
          useGameStore.getState().reportSkillCooldown(skill.id, cds[skill.id]);
        }
      }
      // NOTE: the active-dash velocity override is applied *after* normal
      // movement (see APPLY COMBINED VELOCITY). Applying it here let the
      // movement block below overwrite targetVx/targetVz in the same frame,
      // so Fatamorgana produced no movement at all (confirmed at runtime).
    } else {
      // Equipment transitions reset sword skill edges — re-equipping
      // mid-press cannot fire a stale skill.
      prevSwordSkillInputRefs.current = {};
      dashTimerRef.current = 0;
    }
    // Afterimage decay (visual only).
    if (dashGhostRef.current > 0) {
      dashGhostRef.current = Math.max(0, dashGhostRef.current - delta * 3);
    }

    // ── M1887 GUN SKILLS (P7.1) ──────────────────────────────────────
    // M1W3D6 #1: this block is the M1887's — its fire gate, ammo ref (seeded
    // from M1887_CONFIG), reload timer, muzzle flash and GUN_SKILL_EDGES are
    // all M1887 state. `weaponCategoryOf` also returns 'gun' for the crossbow
    // (items.ts:28-30), which made one attack tap drive both the M1887 and
    // crossbow gates in the same frame. Gate the block on the M1887 itself.
    // Gameplay category checks elsewhere (melee suppression at the melee block,
    // `isRangedCategory`) deliberately still treat both guns the same.
    const gunEquipped = selectedWeapon === 'm1887';
    const gunCooldowns = gunSkillCooldownRefs.current;
    for (const id of Object.keys(gunCooldowns)) {
      gunCooldowns[id] = Math.max(0, gunCooldowns[id] - effectiveDelta);
    }
    if (gunEquipped) {
      const st = useGameStore.getState();
      // Basic fire: attack input fires one shell at rate-of-fire. Empty gun
      // auto-reloads (readable timing); skills require pre-loaded shells.
      gunFireTimerRef.current = Math.max(0, gunFireTimerRef.current - effectiveDelta);
      // M1W3D6 #1 WS1: one click fires one shell. The touch/mouse tap path
      // leaves the store's attack level true until the next press, so the hold
      // gate below would read a single tap as a held trigger and dump the
      // 2-shell magazine. Consume the click edge here — KeyJ is a separate
      // input source, so keyboard hold-to-fire is unaffected.
      // prevAttackInputRef still holds the previous gameplay frame's attack
      // level (the melee block writes it later in the frame), exactly as the
      // crossbow click-latch fix relies on.
      const gunClick = attackInput && !prevAttackInputRef.current;
      if (gunClick && storeAttack) useGameStore.getState().setInputs({ attack: false });
      // Muzzle flash visibility: exactly the post-shot window, then hidden.
      if (gunMuzzleFlashTimerRef.current > 0) {
        gunMuzzleFlashTimerRef.current -= effectiveDelta;
        if (gunMuzzleFlashTimerRef.current <= 0) gunMuzzleFlashTimerRef.current = 0;
      }
      if (gunMuzzleFlashRef.current) {
        gunMuzzleFlashRef.current.visible = gunMuzzleFlashTimerRef.current > 0;
      }
      if (attackInput && !isDodgingRef.current && gunFireTimerRef.current <= 0) {
        if (gunAmmoRef.current > 0) {
          gunAmmoRef.current -= 1;
          gunFireTimerRef.current = 1 / M1887_CONFIG.shotsPerSecond;
          fireM1887Shot(1.0, 0);
          st.reportSkillFired('__gun_basic');
          st.reportSkillCooldown('__gun_basic', gunFireTimerRef.current);
          st.grantItemExpById('m1887', 4);
          if (gunAmmoRef.current === 0) {
            gunReloadTimerRef.current = M1887_CONFIG.reloadSeconds;
            st.addNotification('Reloading\u2026');
          }
        } else if (gunReloadTimerRef.current <= 0) {
          gunReloadTimerRef.current = M1887_CONFIG.reloadSeconds;
          st.addNotification('Reloading\u2026');
        }
      }
      // Reload completes automatically when its timer runs out.
      if (gunReloadTimerRef.current > 0) {
        gunReloadTimerRef.current -= effectiveDelta;
        if (gunReloadTimerRef.current <= 0) {
          gunReloadTimerRef.current = 0;
          gunAmmoRef.current = M1887_CONFIG.ammoCapacity;
        }
      }
      // Keep the authoritative store ammo in sync for HUD/UI (transient).
      if (st.gunAmmo !== gunAmmoRef.current) {
        useGameStore.setState({ gunAmmo: gunAmmoRef.current });
      }
      // Keep the FIRE pill in sync with the actual rate-of-fire gate.
      if (st.skillState.cooldowns['__gun_basic'] > 0) {
        st.reportSkillCooldown('__gun_basic', gunFireTimerRef.current);
      }
      const gunEdges = GUN_SKILL_EDGES;
      gunEdges[0].pressed = keySkill1 || storeSkill1;
      gunEdges[1].pressed = keySkill2 || storeSkill2;
      for (const { key, pressed, skill } of gunEdges) {
          const was = prevGunSkillInputRefs.current[key] ?? false;
          prevGunSkillInputRefs.current[key] = pressed;
          gunCooldowns[skill.id] = Math.max(0, (gunCooldowns[skill.id] ?? 0) - effectiveDelta);
          if (pressed && !was && !isDodgingRef.current && gunCooldowns[skill.id] <= 0) {
          // Locked skills never fire — gameplay gates on the same progression
          // state the skill UI displays.
          const skillIndex = M1887_SKILLS.indexOf(skill);
          if (!st.isItemSkillUnlocked('m1887', skillIndex)) {
            st.addNotification(`${skill.name} requires a higher weapon level.`);
            continue;
          }
          if (gunAmmoRef.current < skill.shellsUsed) {
            if (gunReloadTimerRef.current <= 0) {
              gunReloadTimerRef.current = M1887_CONFIG.reloadSeconds;
              st.addNotification('Reloading\u2026');
            }
            continue;
          }
          gunCooldowns[skill.id] = M1887_SKILL_COOLDOWNS[skill.id];
          gunAmmoRef.current -= skill.shellsUsed;
          st.reportSkillFired(skill.id);
          fireM1887Shot(skill.damageMultiplier, skillIndex);
          if (gunAmmoRef.current === 0) {
            gunReloadTimerRef.current = M1887_CONFIG.reloadSeconds;
            st.addNotification('Reloading\u2026');
          }
        }
        // Report remaining cooldown for the skill bar (HUD derivation).
        if (gunCooldowns[skill.id] > 0 || st.skillState.cooldowns[skill.id] > 0) {
          st.reportSkillCooldown(skill.id, gunCooldowns[skill.id]);
        }
      }
    } else {
      prevGunSkillInputRefs.current = {};
    }

    // ── RESONANCE CORE SKILLS (P7.2) ─────────────────────────────────
    const coreEquipped = weaponCategoryOf(selectedWeapon) === 'core';
    const coreCooldowns = coreSkillCooldownRefs.current;

    // Seed every Core skill id once so a fresh cooldown map starts at 0
    // (off cooldown) rather than undefined — `undefined <= 0` is false and
    // would leave the two activation guards below unreachable forever.
    for (const { skill } of CORE_SKILL_EDGES) {
      if (coreCooldowns[skill.id] === undefined) coreCooldowns[skill.id] = 0;
    }
    for (const id of Object.keys(coreCooldowns)) {
      coreCooldowns[id] = Math.max(0, coreCooldowns[id] - effectiveDelta);
    }
    if (coreEquipped) {
      const coreEdges = CORE_SKILL_EDGES;
      coreEdges[0].pressed = keySkill1 || storeSkill1; // Z Resonant Pulse
      coreEdges[1].pressed = keySkill2 || storeSkill2; // X Harmonic Break
      coreEdges[2].pressed = keySkill3 || storeSkill3; // C Cataclysmic Resonance
      coreEdges[3].pressed = keySkill4 || storeSkill4; // V Resonant Overdrive
      coreEdges[4].pressed = keySkill5 || storeSkill5; // F Echo Step (key + skill-bar button)
      const overdriveActive = coreOverdriveRef.current > 0;
      const boost = overdriveActive ? 1.35 : 1;
      const coreSt = useGameStore.getState();
      // Coerce undefined cooldowns to 0 so a fresh ref never blocks the
      // first activation, then tick them down.
      for (const { pressed, skill } of coreEdges) {
        if (skill.id === 'echo_step') {
          // F — Echo Step: repositioning dash through authoritative body.
          const was = prevCoreSkillInputRefs.current[skill.id] ?? false;
          prevCoreSkillInputRefs.current[skill.id] = pressed;
          if (pressed && !was && !isDodgingRef.current && coreCooldowns[skill.id] <= 0 && dashTimerRef.current <= 0) {
            // Locked movement skill never fires — same progression gate as UI.
            if (!coreSt.isItemSkillUnlocked('resonance_core', RESONANCE_SKILLS.indexOf(skill))) {
              coreSt.addNotification(`${skill.name} requires a higher Core level.`);
            } else {
              coreCooldowns[skill.id] = RESONANCE_SKILL_COOLDOWNS[skill.id];
              coreSt.reportSkillFired(skill.id);
              const rotY = playerMeshRef.current.rotation.y;
              dashDirRef.current.set(Math.sin(rotY), 0, Math.cos(rotY)).normalize();
              dashTimerRef.current = 0.16;
              dashSpeedRef.current = skill.dashDistance! / 0.16;
              dashGhostRef.current = 1; // echo afterimage (same visual as sword dash)
              coreSt.grantItemExpById('resonance_core', 8);
            }
          }
          if (coreCooldowns[skill.id] > 0 || coreSt.skillState.cooldowns[skill.id] > 0) {
            coreSt.reportSkillCooldown(skill.id, coreCooldowns[skill.id]);
          }
          continue;
        }
        const was = prevCoreSkillInputRefs.current[skill.id] ?? false;
        prevCoreSkillInputRefs.current[skill.id] = pressed;
        if (pressed && !was && !isDodgingRef.current && coreCooldowns[skill.id] <= 0) {
          // Locked skills never fire — gameplay gates on the same progression
          // state the skill UI displays.
          if (!coreSt.isItemSkillUnlocked('resonance_core', RESONANCE_SKILLS.indexOf(skill))) {
            coreSt.addNotification(`${skill.name} requires a higher Core level.`);
            prevCoreSkillInputRefs.current[skill.id] = was;
            continue;
          }
          coreCooldowns[skill.id] = RESONANCE_SKILL_COOLDOWNS[skill.id];
          coreSt.reportSkillFired(skill.id);
          if (skill.id === 'resonant_overdrive') {
            coreOverdriveRef.current = skill.duration!;
            coreSt.addNotification('Resonant Overdrive: resonance skills empowered (+35% for 8s).');
          } else if (skill.id === 'cataclysmic_resonance') {
            // C — Cataclysmic Resonance (ultimate): authoritative data defines
            // duration 1.2s — a building resonance field, then the destructive
            // pulse. Field phase now, real damage on expiry (below).
            cataclysmTimerRef.current = skill.duration!;
            cataclysmBoostRef.current = boost;
            coreSt.triggerCameraShake(CC.shakeHeavy);
            coreSt.grantItemExpById('resonance_core', 20);
          } else {
            const origin = _v2.set(translation.x, translation.y + 1.0, translation.z);
            let confirmedHits = 0;
            for (const target of enemyTargets.values()) {
              const ePos = target.getPosition();
              const dx = ePos.x - translation.x;
              const dz = ePos.z - translation.z;
              if (dx * dx + dz * dz <= skill.radius! * skill.radius!) {
                if (target.takeDamage(skill.damage! * boost, origin, skill.id === 'harmonic_break' ? 2 : 1)) confirmedHits++;
              }
            }
            // Hit-confirmed feedback: shake only when damage was actually
            // accepted by the enemy damage funnel (not for empty AoEs).
            if (confirmedHits > 0) {
              // E1b: per-weapon hitstop + shake scaled by the empowered damage.
              coreSt.triggerHitStop(IMPACT.core.hitStopMs);
              coreSt.triggerCameraShake(IMPACT.core.shake * damageScaleOf(skill.damage! * boost, skill.damage!));
              coreSt.addHitSpark(translation.x, translation.y + 1.0, translation.z, '#a78bfa');
            }
            coreSt.grantItemExpById('resonance_core', 10);
          }
        }
        if (coreCooldowns[skill.id] > 0 || coreSt.skillState.cooldowns[skill.id] > 0) {
          coreSt.reportSkillCooldown(skill.id, coreCooldowns[skill.id]);
        }
      }
      if (coreOverdriveRef.current > 0) {
        coreOverdriveRef.current -= effectiveDelta;
      }
      // Cataclysmic Resonance field phase: tick down, then fire the pulse
      // through the authoritative enemy-damage path using the skill's own
      // damage/radius data.
      if (cataclysmTimerRef.current > 0) {
        cataclysmTimerRef.current -= effectiveDelta;
        if (cataclysmTimerRef.current <= 0) {
          cataclysmTimerRef.current = 0;
          const cs = RESONANCE_SKILLS.find((k) => k.id === 'cataclysmic_resonance');
          if (cs) {
            const origin = _v2.set(translation.x, translation.y + 1.0, translation.z);
            for (const target of enemyTargets.values()) {
              const ePos = target.getPosition();
              const dx = ePos.x - translation.x;
              const dz = ePos.z - translation.z;
              if (dx * dx + dz * dz <= cs.radius! * cs.radius!) {
                target.takeDamage(cs.damage! * cataclysmBoostRef.current, origin, 3);
              }
            }
            useGameStore.getState().triggerCameraShake(CC.shakeHeavy);
            // Visible field→pulse feedback at the moment of detonation.
            useGameStore.getState().addSlashParticles(translation.x, translation.y + 1.0, translation.z, 0, 0, '#a78bfa');
          }
          cataclysmBoostRef.current = 1;
        }
      }
    } else {
      prevCoreSkillInputRefs.current = {};
      coreOverdriveRef.current = 0;
      cataclysmTimerRef.current = 0;
      cataclysmBoostRef.current = 1;
    }

    // ── CROSSBOW (M1W2D6 #5) ────────────────────────────────────────
    // Basic fire + Triplex Lactus (Z) + Mimique de Ametralladora (X).
    // One authoritative ammo pool (crossbowAmmoRef + store mirror).
    const crossbowEquipped = selectedWeapon === 'crossbow';
    const crossbowCooldowns = crossbowSkillCooldownRefs.current;
    for (const id of Object.keys(crossbowCooldowns)) {
      crossbowCooldowns[id] = Math.max(0, crossbowCooldowns[id] - effectiveDelta);
    }
    // Hit-streak 3s decay: resets after 3 seconds without a confirmed hit.
    if (crossbowStreakRef.current > 0) {
      crossbowStreakTimerRef.current -= effectiveDelta;
      if (crossbowStreakTimerRef.current <= 0) {
        crossbowStreakRef.current = 0;
      }
    }
    const bumpCrossbowStreak = () => {
      crossbowStreakRef.current = Math.min(CROSSBOW_STREAK.max, crossbowStreakRef.current + 1);
      crossbowStreakTimerRef.current = CROSSBOW_STREAK.resetSeconds;
    };
    // E1b: arrow hits go through the same impact path. The arrow hit event now
    // carries the exact damage the hit was accepted with, so the crossbow's
    // shake is scaled by its damage fraction against its heaviest basic arrow.
    const crossbowArrowCb = {
      onHit: (ev: ArrowHitEvent) => {
        bumpCrossbowStreak();
        const hitSt = useGameStore.getState();
        hitSt.triggerHitStop(IMPACT.crossbow.hitStopMs);
        hitSt.triggerCameraShake(IMPACT.crossbow.shake * damageScaleOf(ev.damage, CROSSBOW_MAX_HIT_DAMAGE));
      },
      onMiss: () => { crossbowStreakRef.current = 0; },
    };
    updateArrows(delta, crossbowArrowCb);

    // Fire one arrow along a degree offset from the authoritative facing (XZ).
    const fireCrossbowArrow = (degOffset: number, baseDamage: number, dmgPerMetre: number): boolean => {
      if (!rigidBodyRef.current) return false;
      const t = rigidBodyRef.current.translation();
      _v2.set(t.x, t.y + 1.2, t.z);
      const rotY = (playerMeshRef.current ? playerMeshRef.current.rotation.y : 0) + (degOffset * Math.PI) / 180;
      _v3.set(Math.sin(rotY), 0, Math.cos(rotY));
      return spawnArrow(_v2, _v3.x, _v3.z, baseDamage, dmgPerMetre, CROSSBOW_CONFIG.arrowLifetime, dmgPerMetre > 0) !== null;
    };

    if (crossbowEquipped) {
      const st = useGameStore.getState();
      // Keep the store ammo mirror in sync for HUD (transient).
      if (st.crossbowAmmo !== crossbowAmmoRef.current) {
        useGameStore.setState({ crossbowAmmo: crossbowAmmoRef.current });
      }

      // Basic fire (M1W2D3 #1 WS2.2): one arrow per shot. The gate paces the
      // shot; it never dumps the magazine.
      //   • press edge (click / tap) → fast click cadence
      //   • sustained hold           → slower hold cadence
      // An empty counter auto-reloads: while it is at 0 the fire timer doubles
      // as the reload timer (no second timer ref), and reloads are unlimited.
      crossbowFireTimerRef.current = Math.max(0, crossbowFireTimerRef.current - effectiveDelta);
      // A click must fire at most once and never latch into continuous fire:
      // the touch/mouse tap path leaves the store's attack level true until the
      // next press, which the hold gate below would read as a held button.
      // Consume the edge here — KeyJ is a separate source, so keyboard
      // hold-to-fire is unaffected.
      const crossbowClick = attackInput && !prevAttackInputRef.current;
      if (crossbowClick && storeAttack) useGameStore.getState().setInputs({ attack: false });
      if (crossbowAmmoRef.current <= 0) {
        // RELOAD — clicks and holds are ignored until the counter refills.
        if (crossbowFireTimerRef.current <= 0) crossbowAmmoRef.current = CROSSBOW_CONFIG.ammoCapacity;
      } else if (attackInput && !isDodgingRef.current && crossbowFireTimerRef.current <= 0) {
        // prevAttackInputRef still holds the previous gameplay frame's attack
        // level here (the melee block writes it later in the frame), so
        // crossbowClick above is the click edge.
        if (fireCrossbowArrow(0, CROSSBOW_CONFIG.damage * crossbowStreakMultiplier(crossbowStreakRef.current), 0)) {
          crossbowAmmoRef.current -= 1;
          crossbowFireTimerRef.current = crossbowClick ? CROSSBOW_CONFIG.fireIntervalClick : CROSSBOW_CONFIG.fireIntervalHold;
          if (crossbowAmmoRef.current <= 0) {
            // Empty — start the reload; it supersedes the shot interval.
            crossbowFireTimerRef.current = CROSSBOW_CONFIG.reloadSeconds;
          }
          st.reportSkillFired('__crossbow_basic');
          st.reportSkillCooldown('__crossbow_basic', crossbowFireTimerRef.current);
          st.grantItemExpById('crossbow', 4);
        }
      }

      // Mimique de Ametralladora (X): 1 arrow / 0.25s for 7.5s (30 shots),
      // deterministic sweep across 60° (triangular orbital pattern). Stops
      // immediately at 0 ammo — no phantom arrows.
      const mim = mimiqueRef.current;
      if (mim.active) {
        mim.elapsed += effectiveDelta;
        mim.fireTimer -= effectiveDelta;
        if (mim.fireTimer <= 0 && mim.elapsed <= MIMIQUE.duration) {
          if (crossbowAmmoRef.current <= 0) {
            mim.active = false; // out of ammo — stop immediately
          } else {
            const progress = Math.min(1, mim.elapsed / MIMIQUE.duration);
            const angle = MIMIQUE.baseAngleDeg + progress * MIMIQUE.angularRangeDeg;
            if (fireCrossbowArrow(angle, MIMIQUE.damage, 0)) {
              crossbowAmmoRef.current -= 1;
              mim.shotsFired += 1;
              mim.fireTimer = MIMIQUE.fireInterval;
            }
          }
        }
        if (mim.elapsed > MIMIQUE.duration || mim.shotsFired >= MIMIQUE.duration / MIMIQUE.fireInterval) {
          mim.active = false;
        }
      }

      const crossbowEdges = CROSSBOW_SKILL_EDGES;
      crossbowEdges[0].pressed = keySkill1 || storeSkill1;
      crossbowEdges[1].pressed = keySkill2 || storeSkill2;
      for (const { key, pressed, skill } of crossbowEdges) {
        const was = prevCrossbowSkillInputRefs.current[key] ?? false;
        prevCrossbowSkillInputRefs.current[key] = pressed;
        if (pressed && !was && !isDodgingRef.current && crossbowCooldowns[skill.id] <= 0) {
          const skillIndex = CROSSBOW_SKILLS.indexOf(skill);
          if (!st.isItemSkillUnlocked('crossbow', skillIndex)) {
            st.addNotification(`${skill.name} requires a higher weapon level.`);
            continue;
          }
          if (skill.id === 'triplex_lactus') {
            // Z — Triplex Lactus: exactly 3 arrows at −10°/0°/+10°. Ammo is
            // consumed only if ALL three projectiles spawn successfully.
            if (crossbowAmmoRef.current < TRIPLEX_LACTUS.arrowCount) {
              st.addNotification('Not enough arrows.');
              continue;
            }
            const spawned =
              fireCrossbowArrow(TRIPLEX_LACTUS.spreadAnglesDeg[0], TRIPLEX_LACTUS.baseDamage, TRIPLEX_LACTUS.damagePerMetre) &&
              fireCrossbowArrow(TRIPLEX_LACTUS.spreadAnglesDeg[1], TRIPLEX_LACTUS.baseDamage, TRIPLEX_LACTUS.damagePerMetre) &&
              fireCrossbowArrow(TRIPLEX_LACTUS.spreadAnglesDeg[2], TRIPLEX_LACTUS.baseDamage, TRIPLEX_LACTUS.damagePerMetre);
            if (!spawned) {
              // Spawn failure (pool saturation) — no partial consumption.
              continue;
            }
            crossbowAmmoRef.current -= TRIPLEX_LACTUS.arrowCount;
            crossbowCooldowns[skill.id] = CROSSBOW_SKILL_COOLDOWNS[skill.id];
            st.reportSkillFired(skill.id);
            st.reportSkillCooldown(skill.id, crossbowCooldowns[skill.id]);
            st.grantItemExpById('crossbow', 10);
          } else {
            // X — Mimique de Ametralladora: start the deterministic burst.
            if (crossbowAmmoRef.current <= 0) {
              st.addNotification('Not enough arrows.');
              continue;
            }
            crossbowCooldowns[skill.id] = CROSSBOW_SKILL_COOLDOWNS[skill.id];
            st.reportSkillFired(skill.id);
            st.reportSkillCooldown(skill.id, crossbowCooldowns[skill.id]);
            st.grantItemExpById('crossbow', 8);
            mim.active = true;
            mim.elapsed = 0;
            mim.fireTimer = 0; // first arrow fires immediately
            mim.shotsFired = 0;
          }
        }
        if (crossbowCooldowns[skill.id] > 0 || st.skillState.cooldowns[skill.id] > 0) {
          st.reportSkillCooldown(skill.id, crossbowCooldowns[skill.id]);
        }
      }
    } else {
      // Unequipping the crossbow resets the streak and cancels the burst.
      prevCrossbowSkillInputRefs.current = {};
      mimiqueRef.current.active = false;
      crossbowStreakRef.current = 0;
    }

    // -------------------------------------------------------------
    // 3. ATTACK LOGIC & COMBOS
    // -------------------------------------------------------------
    const attackJustPressed = attackInput && !prevAttackInputRef.current;
    prevAttackInputRef.current = attackInput;

    // Melee combo is suppressed while the staff is the active weapon — the
    // staff uses its own spell state, never melee strike state. Gun uses its
    // own basic-fire path; Core has no melee at all.
    const meleeCategory = weaponCategoryOf(selectedWeapon);
    if (!staffEquipped && meleeCategory !== 'gun' && meleeCategory !== 'core') {
    // Input buffering: if attack is pressed during an active swing, remember it
    // so the next combo fires immediately when the current swing ends.
    if (attackJustPressed && !isDodgingRef.current) {
      if (attackTimerRef.current > 0) {
        // Buffer the press — will fire when current swing ends
        attackInputBufferRef.current = CC.attackInputBufferMs / 1000;
      } else {
        const comboStage = useGameStore.getState().triggerPlayerAttack();
        if (comboStage > 0) {
          attackComboStageRef.current = comboStage;
          // Curse of Hell attack-speed bonus shortens the swing duration.
          const buffMult = daggerActive && curseOfHellTimerRef.current > 0 ? 1 / CURSE_OF_HELL.attackSpeedMultiplier : 1;
          attackTimerRef.current = CC.attackDuration * buffMult;
          hitEnemiesThisSwingRef.current.clear();
          attackCamPushRef.current = CC.attackCameraPush;
          trailAlphaRef.current = 1;
          applyTrailColor();
          combatAudio.swing({ comboStage: comboStage as 1 | 2 | 3 });
          if (comboStage === 3) {
            useGameStore.getState().triggerCameraShake(CC.shakeLight);
          }
        }
      }
    }

    // Decay input buffer timer
    if (attackInputBufferRef.current > 0) {
      attackInputBufferRef.current -= delta;
      // If swing just ended and buffer is still valid, fire buffered attack
      if (attackTimerRef.current <= 0 && attackInputBufferRef.current > 0) {
        attackInputBufferRef.current = 0;
        const comboStage = useGameStore.getState().triggerPlayerAttack();
        if (comboStage > 0) {
          attackComboStageRef.current = comboStage;
          attackTimerRef.current = CC.attackDuration;
          hitEnemiesThisSwingRef.current.clear();
          attackCamPushRef.current = CC.attackCameraPush;
          trailAlphaRef.current = 1;
          applyTrailColor();
          combatAudio.swing({ comboStage: comboStage as 1 | 2 | 3 });
          if (comboStage === 3) {
            useGameStore.getState().triggerCameraShake(CC.shakeLight);
          }
        }
      }
    }

    // Handle Active Attack Swing & Hit Detection
    if (attackTimerRef.current > 0) {
      attackTimerRef.current -= effectiveDelta;
      const progress = 1 - Math.max(0, attackTimerRef.current / CC.attackDuration);

      // Animate the swing on the ARM groups (BUG-008): the weapons are children
      // of the arms, so driving the arm carries the weapon through the player's
      // facing direction. Rotation magnitudes are the previous weapon-group
      // values, moved to the owning arm (source-verified, not runtime-tested).
      if (rightArmGroupRef.current) {
        const stage = attackComboStageRef.current;
        if (stage === 1) {
          // Horizontal right to left slash
          rightArmGroupRef.current.rotation.set(0.2, -Math.PI / 2 + progress * Math.PI, -0.4);
        } else if (stage === 2) {
          // Diagonal left to right slash
          rightArmGroupRef.current.rotation.set(-0.5 + progress * 1.2, Math.PI / 2 - progress * Math.PI, 0.6);
        } else {
          // Stage 3: Heavy overhead chop
          rightArmGroupRef.current.rotation.set(-Math.PI / 1.1 + progress * Math.PI * 1.5, 0, 0);
        }
      }

      // Dual Daggers: both arms animate independent mirrored arcs so both hands
      // visibly participate (M1W2D5 C3 presentation).
      if (daggerActive && rightArmGroupRef.current && leftArmGroupRef.current) {
        const stage = attackComboStageRef.current;
        const arcY = stage === 1
          ? -Math.PI / 2 + progress * Math.PI
          : stage === 2
            ? Math.PI / 2 - progress * Math.PI
            : -Math.PI / 1.1 + progress * Math.PI * 1.5;
        // Alternate-hand counter-rotation: blades scissor through the arc.
        rightArmGroupRef.current.rotation.set(-arcY * 0.35, 0, arcY * 0.9);
        leftArmGroupRef.current.rotation.set(arcY * 0.35, 0, -arcY * 0.9);
      }

      // Hit detection — runs every frame within the hit window so enemies
      // entering range mid-swing are still caught. Per-enemy tracking
      // prevents the same swing from damaging one target more than once.
      if (progress >= CC.hitDetectStart && progress <= CC.hitDetectEnd) {
        _v2.set(translation.x, translation.y, translation.z); // playerPos
        const rotY = playerMeshRef.current.rotation.y;
        _v3.set(Math.sin(rotY), 0, Math.cos(rotY)).normalize(); // facingDir

        const stage = attackComboStageRef.current;
        let damage = stage === 1 ? 15 : stage === 2 ? 25 : 45;
        // Curse of Hell buff: damage multiplier applies ONLY to Dual Dagger
        // basic attacks while the buff timer is active.
        const curseActive = daggerActive && curseOfHellTimerRef.current > 0;
        if (curseActive) damage = Math.round(damage * CURSE_OF_HELL.damageMultiplier);

        // Query enemy targets
        // E1b: the held melee weapon's impact row, resolved once for the swing.
        const meleeImpact: ImpactWeapon = impactWeaponFor(selectedWeapon) ?? 'sword';
        enemyTargets.forEach((target) => {
          if (hitEnemiesThisSwingRef.current.has(target.id)) return;
          const enemyPos = target.getPosition();
          const dist = _v2.distanceTo(enemyPos);
          if (dist <= CC.attackRange) {
            _v4.copy(enemyPos).sub(_v2); // toEnemy
            _v4.y = 0;
            if (_v4.lengthSq() > 0.001) {
              _v4.normalize();
              const dot = _v3.dot(_v4);
              if (dot > CC.attackDotThreshold || dist < CC.attackCloseRange) {
                hitEnemiesThisSwingRef.current.add(target.id);
                // Curse of Hell: successful dagger hits produce a small extra
                // knockback (stage-2 impulse while buffed).
                const damageDealt = target.takeDamage(damage, _v2, curseActive ? 2 : stage);
                if (!damageDealt) return;
                // Per-weapon EXP on confirmed basic-melee hits (P6).
                {
                  const st = useGameStore.getState();
                  const hitItem = st.hotbar.slots[st.hotbar.selectedSlot];
                  if (hitItem) st.grantItemExpById(hitItem, 6);
                }
                useGameStore.getState().confirmComboHit();
                // E1b: per-weapon hitstop and camera shake, shake scaled by the
                // damage fraction against the heaviest stage's base damage (45).
                // Every enemy hit by this swing carries the same `damage`, so the
                // max-per-frame coalescing rule is satisfied without an
                // accumulator, and triggerHitStop assigns (never accumulates).
                const impact = IMPACT[meleeImpact];
                useGameStore.getState().triggerHitStop(impact.hitStopMs);
                useGameStore.getState().triggerCameraShake(impact.shake * damageScaleOf(damage, 45));
                useGameStore.getState().addHitSpark(enemyPos.x, enemyPos.y + 1.2, enemyPos.z, stage === 3 ? CC.hitSparkColorHeavy : CC.hitSparkColorNormal);
                // Directional slash particles — burst outward along attack direction
                useGameStore.getState().addSlashParticles(enemyPos.x, enemyPos.y + 1.0, enemyPos.z, _v3.x, _v3.z, stage === 3 ? CC.hitSparkColorHeavy : CC.slashParticleColor);
                // Weapon recoil on hit
                weaponRecoilRef.current = CC.weaponRecoilDistance;
                combatAudio.hit({ comboStage: stage as 1 | 2 | 3, enemyName: '', position: [enemyPos.x, enemyPos.y, enemyPos.z] });
              }
            }
          }
        });
      }

      if (attackTimerRef.current <= 0) {
        if (swordGroupRef.current) {
          swordGroupRef.current.rotation.set(0, 0, 0);
        }
        // Blades rest at their static local pose; the arm owns the swing, so no
        // yaw is written here (facing is inherited from the arm group).
        if (daggerRightGroupRef.current) {
          daggerRightGroupRef.current.rotation.set(0, 0, 0);
        }
        if (daggerLeftGroupRef.current) {
          daggerLeftGroupRef.current.rotation.set(0, 0, 0);
        }
        trailAlphaRef.current = 0;
      }
    } else {
      if (swordGroupRef.current) {
        swordGroupRef.current.rotation.set(0, 0, 0);
      }
      if (daggerRightGroupRef.current) {
        daggerRightGroupRef.current.rotation.set(0, 0, 0);
      }
      if (daggerLeftGroupRef.current) {
        daggerLeftGroupRef.current.rotation.set(0, 0, 0);
      }
      trailAlphaRef.current = 0;
    }

    // Weapon recoil recover
    if (weaponRecoilRef.current > 0.001) {
      weaponRecoilRef.current = THREE.MathUtils.lerp(weaponRecoilRef.current, 0, Math.min(1, delta * CC.weaponRecoilRecoverSpeed));
      if (swordGroupRef.current) {
        swordGroupRef.current.position.z = 0.2 + weaponRecoilRef.current;
      }
    } else if (swordGroupRef.current && swordGroupRef.current.position.z !== 0.2) {
      swordGroupRef.current.position.z = 0.2;
    }

    // Attack camera push recover (visual nudge forward on swing start)
    if (attackCamPushRef.current > 0.001) {
      attackCamPushRef.current = THREE.MathUtils.lerp(attackCamPushRef.current, 0, Math.min(1, delta * CC.attackCameraRecoverSpeed));
    } else {
      attackCamPushRef.current = 0;
    }

    // Weapon trail fade — visible during swing, fades quickly after
    if (trailAlphaRef.current > 0.001) {
      trailAlphaRef.current = Math.max(0, trailAlphaRef.current - delta / CC.weaponTrailLifetime);
      if (trailMeshRef.current) {
        trailMeshRef.current.visible = true;
        const mat = trailMeshRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = trailAlphaRef.current * 0.6;
        // Scale trail slightly with swing intensity
        const scale = 1 + (1 - trailAlphaRef.current) * 0.3;
        trailMeshRef.current.scale.set(scale, 1, 1);
      }
    } else if (trailMeshRef.current && trailMeshRef.current.visible) {
      trailMeshRef.current.visible = false;
    }
    } // end !staffEquipped (melee combo suppressed while staff equipped)

    // -------------------------------------------------------------
    // 4. NORMAL MOVEMENT (WHEN NOT DODGING)
    // -------------------------------------------------------------
    if (!isDodgingRef.current) {
      _v1.set(0, 0, 0);
      if (forward) _v1.z -= 1;
      if (backward) _v1.z += 1;
      if (left) _v1.x -= 1;
      if (right) _v1.x += 1;
      if (joystick.x !== 0 || joystick.y !== 0) {
        _v1.x = joystick.x;
        _v1.z = joystick.y;
      }

      if (_v1.lengthSq() > 0.01) {
        _v1.normalize();
        
        // Handle Sprint stamina consumption
        const storeState = useGameStore.getState();
        const canSprint = sprintInput && storeState.player.stamina > 2;
        if (canSprint) {
          storeState.setPlayerStamina(storeState.player.stamina - CC.sprintStaminaDrainPerSec * delta);
          storeState.recordStaminaUse();
        }

        const slowFactor = storeState.player.slowFactor ?? 1.0;
        const currentSpeed = (canSprint ? SPEED * SPRINT_MULT : SPEED) * slowFactor;
        
        // Attack slows movement slightly
        const speedMult = attackTimerRef.current > 0 ? CC.attackMoveSlow : 1.0;
        
        const desiredVx = (_v1.x * Math.cos(cameraAngle) + _v1.z * Math.sin(cameraAngle)) * currentSpeed * speedMult;
        const desiredVz = (-_v1.x * Math.sin(cameraAngle) + _v1.z * Math.cos(cameraAngle)) * currentSpeed * speedMult;

        // Frame-rate-independent acceleration toward desired velocity.
        // Air control is reduced to prevent unrealistic instant turns.
        const accelRate = isGrounded ? C.groundAccel : C.airAccel;
        const accel = Math.min(1, delta * accelRate);
        targetVx = THREE.MathUtils.lerp(velocity.x, desiredVx, accel);
        targetVz = THREE.MathUtils.lerp(velocity.z, desiredVz, accel);

        // Shortest-angle rotation towards movement direction
        const targetRotation = Math.atan2(desiredVx, desiredVz);
        const currentRotation = playerMeshRef.current.rotation.y;
        let diff = targetRotation - currentRotation;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        
        playerMeshRef.current.rotation.y = currentRotation + diff * Math.min(1, delta * ROTATION_SPEED);
      } else {
        // Damping towards 0 when no input, preserving residual knockback decay
        const decelRate = isGrounded ? C.groundDecel : C.airDecel;
        const damp = Math.min(1, delta * decelRate);
        targetVx = THREE.MathUtils.lerp(velocity.x, 0, damp);
        targetVz = THREE.MathUtils.lerp(velocity.z, 0, damp);
      }
    }

    // -------------------------------------------------------------
    // ACTIVE DASH (Fatamorgana) — owns horizontal velocity while it lasts.
    // Applied last so normal movement cannot overwrite it. Collision still
    // applies (Rapier resolves contacts); this is never a teleport.
    // -------------------------------------------------------------
    if (dashTimerRef.current > 0) {
      targetVx = dashDirRef.current.x * dashSpeedRef.current;
      targetVz = dashDirRef.current.z * dashSpeedRef.current;
      dashTimerRef.current = Math.max(0, dashTimerRef.current - delta);
    }

    // -------------------------------------------------------------
    // APPLY COMBINED VELOCITY (ONCE PER FRAME)
    // -------------------------------------------------------------
    rigidBodyRef.current.setLinvel({ x: targetVx, y: targetVy, z: targetVz }, true);

    // -------------------------------------------------------------
    // 5b. HEAD BOB, SPRINT FOV, FOOTSTEPS
    // -------------------------------------------------------------
    const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    const isMoving = horizontalSpeed > 0.5 && isGrounded && !isDodgingRef.current;
    const isSprinting = sprintInput && isMoving && horizontalSpeed > SPEED * 1.1;

    // Head bob — accumulate phase while moving, reset when stopped or airborne
    if (isMoving) {
      const freq = isSprinting ? C.headBobSprintFrequency : C.headBobFrequency;
      headBobPhaseRef.current += delta * freq;
    } else {
      headBobPhaseRef.current = 0;
    }

    // Footstep cadence — accumulate distance, trigger when threshold is reached.
    // Architecture supports future material-based footsteps by swapping the
    // sound callback based on ground surface; for now it's a no-op stub.
    if (isMoving) {
      prevFootstepDistRef.current += horizontalSpeed * delta;
      const stride = isSprinting ? C.footstepSprintStride : C.footstepWalkStride;
      if (prevFootstepDistRef.current >= stride) {
        prevFootstepDistRef.current = 0;
        // Footstep sound hook — material detection would go here in the future
        // playFootstep(getGroundMaterial(translation));
      }
    } else {
      prevFootstepDistRef.current = 0;
    }

    // Sprint FOV — smooth transition in/out of sprint
    const targetFov = isSprinting ? C.baseFov + C.sprintFovIncrease : C.baseFov;
    currentFovRef.current = THREE.MathUtils.lerp(currentFovRef.current, targetFov, Math.min(1, delta * C.sprintFovLerpSpeed));
    if (camera.fov !== currentFovRef.current) {
      camera.fov = currentFovRef.current;
      camera.updateProjectionMatrix();
    }

    // -------------------------------------------------------------
    // 5. CAMERA ORBIT & FOLLOW & STORE POSITION SYNC
    // -------------------------------------------------------------
    _v1.set(translation.x, translation.y, translation.z); // targetPos
    const desiredDist: number = C.cameraDistance;
    const baseHeight: number = C.cameraHeight;
    const dirSign = cameraMode === 'second' ? -1 : 1;

    let idealCameraPos: THREE.Vector3;
    let lookTarget: THREE.Vector3;

    if (cameraMode === 'first') {
      // First person: camera at the player's head, looking forward along yaw/pitch.
      // The player's forward direction is (-sin(θ), 0, -cos(θ)) — the same
      // convention used by the movement code — so the look offset must negate
      // both horizontal and pitch to match where the player actually faces.
      const headHeight = 1.6;
      _v2.set(0, headHeight, 0); // eyeOffset
      _v4.copy(_v1).add(_v2); // idealCameraPos = targetPos + eyeOffset

      const lookAhead = 5;
      _v5.set(
        -Math.sin(cameraAngle) * Math.cos(cameraPitch) * lookAhead,
        -Math.sin(cameraPitch) * lookAhead,
        -Math.cos(cameraAngle) * Math.cos(cameraPitch) * lookAhead,
      ); // lookOffset
      _v3.copy(_v4).add(_v5); // lookTarget = idealCameraPos + lookOffset
      idealCameraPos = _v4;
      lookTarget = _v3;
    } else {
      // Third / Second person: spherical orbit with camera collision
      const horizDist = desiredDist * Math.cos(cameraPitch);
      _v2.set(
        Math.sin(cameraAngle) * horizDist * dirSign,
        baseHeight + desiredDist * Math.sin(cameraPitch),
        Math.cos(cameraAngle) * horizDist * dirSign,
      ); // orbitOffset

      _v4.copy(_v1).add(_v2); // desiredCameraPos = targetPos + orbitOffset

      // Raycast from the player's head toward the desired camera position to
      // detect obstacles. The origin must be at head height (not the feet /
      // body center) so the ray doesn't start on the floor surface and report a
      // zero-distance self-hit. solid=false treats shapes as hollow so a ray
      // starting inside a shape still reports the exit boundary.
      const camPlayerBody = (rigidBodyRef.current as any).raw || rigidBodyRef.current;
      _v3.copy(_v1).add(_v5.set(0, 1.6, 0)); // rayOrigin = targetPos + (0,1.6,0)
      _v5.copy(_v4).sub(_v3).normalize(); // rayDir
      const rayLen = Math.max(0.1, _v3.distanceTo(_v4));
      _camRay.origin = _v3;
      _camRay.dir = _v5;
      const hit = world.castRay(_camRay, rayLen, false, undefined, undefined, undefined, camPlayerBody);

      let collisionDist = desiredDist;
      if (hit !== null && hit.timeOfImpact < rayLen) {
        // Place camera just in front of the obstacle (skin width 0.4)
        collisionDist = Math.max(0.5, hit.timeOfImpact - 0.4);
      }

      // Smoothly interpolate the collision-adjusted distance (no snapping)
      const lerpFactor = Math.min(1, delta * C.cameraCollisionLerp);
      smoothedDistRef.current = THREE.MathUtils.lerp(smoothedDistRef.current, collisionDist, lerpFactor);

      // Rebuild orbit offset using the smoothed distance
      const safeHoriz = smoothedDistRef.current * Math.cos(cameraPitch);
      _v2.set(
        Math.sin(cameraAngle) * safeHoriz * dirSign,
        baseHeight + smoothedDistRef.current * Math.sin(cameraPitch),
        Math.cos(cameraAngle) * safeHoriz * dirSign,
      ); // safeOffset (reuses orbitOffset slot)
      _v4.copy(_v1).add(_v2); // idealCameraPos
      _v3.copy(_v1).add(_v5.set(0, 1, 0)); // lookTarget = targetPos + (0,1,0)
      idealCameraPos = _v4;
      lookTarget = _v3;
    }

    const posLerp = cameraMode === 'first' ? C.cameraFirstPersonLerp : C.cameraPositionLerp;
    currentCameraPos.lerp(idealCameraPos, Math.min(1, delta * posLerp));
    camera.position.copy(currentCameraPos);

    // Apply attack camera push — slight forward nudge on swing, blends smoothly
    if (attackCamPushRef.current > 0.001) {
      _v2.set(-Math.sin(cameraAngle), 0, -Math.cos(cameraAngle)); // pushDir
      camera.position.add(_v2.multiplyScalar(attackCamPushRef.current));
    }

    // Apply head bob as a vertical offset on the camera (disabled in first
    // person to avoid discomfort, disabled while airborne)
    if (isMoving && cameraMode !== 'first') {
      const amp = isSprinting ? C.headBobSprintAmplitude : C.headBobAmplitude;
      camera.position.y += Math.sin(headBobPhaseRef.current) * amp;
    }

    // Apply landing dip as a downward camera offset (visual only)
    if (landingDipRef.current > 0.001) {
      camera.position.y -= landingDipRef.current;
    }

    // Apply camera shake AFTER all other camera offsets so the lerp doesn't smooth it away
    if (localShakeRef.current > 0.001) {
      const shake = localShakeRef.current;
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      camera.position.z += (Math.random() - 0.5) * shake;
      localShakeRef.current = THREE.MathUtils.lerp(localShakeRef.current, 0, delta * 15);
    } else {
      localShakeRef.current = 0;
    }

    const lookLerp = cameraMode === 'first' ? C.cameraFirstPersonLookLerp : C.cameraLookLerp;
    currentLookAt.lerp(lookTarget, Math.min(1, delta * lookLerp));
    camera.lookAt(currentLookAt);

    // First-person mode hides the body meshes, not the mesh root: the arm
    // groups stay visible because the held weapons are their children.
    // (Previously the weapons were siblings of the mesh root, so hiding the
    // root hid the body and left the weapons visible.)
    const showBody = cameraMode !== 'first';
    if (hipsGroupRef.current) hipsGroupRef.current.visible = showBody;
    if (bodyMeshGroupRef.current) bodyMeshGroupRef.current.visible = showBody;
    if (armMeshRightRef.current) armMeshRightRef.current.visible = showBody;
    if (armMeshLeftRef.current) armMeshLeftRef.current.visible = showBody;
    if (headGroupRef.current) headGroupRef.current.visible = showBody;
    // Weapon visuals follow the same hotbar-derived equipment flags the
    // combat logic uses: sword mesh only for actual swords, dagger mesh for
    // Dual Daggers, staff mesh for the staff. Never two at once.
    // No per-frame yaw sync: every weapon is a child of its arm group and
    // therefore inherits the player's facing from the hierarchy.
    if (staffGroupRef.current) {
      staffGroupRef.current.visible = staffEquipped;
    }
    if (swordPivotRef.current) {
      swordPivotRef.current.visible = swordUsable;
    }
    if (daggerRightGroupRef.current) daggerRightGroupRef.current.visible = daggerEquipped;
    if (daggerLeftGroupRef.current) daggerLeftGroupRef.current.visible = daggerEquipped;
    if (gunGroupRef.current) {
      gunGroupRef.current.visible = gunEquipped && !crossbowEquipped;
    }
    if (crossbowGroupRef.current) {
      crossbowGroupRef.current.visible = crossbowEquipped;
    }
    if (coreGroupRef.current) {
      coreGroupRef.current.visible = coreEquipped;
    }
    if (staffGroupRef.current) {
      staffGroupRef.current.rotation.x = -castAnimRef.current * 0.5;
    }
    // Fatamorgana afterimage: a translucent ghost silhouette mid-dash path,
    // visual only — no gameplay authority, no collision, no entity.
    if (ghostMeshRef.current) {
      const gAlive = dashGhostRef.current > 0.01;
      ghostMeshRef.current.visible = gAlive;
      if (gAlive && playerMeshRef.current) {
        ghostMeshRef.current.position.set(
          translation.x,
          translation.y,
          translation.z,
        );
        ghostMeshRef.current.rotation.y = playerMeshRef.current.rotation.y;
        const gm = ghostMeshRef.current.children[0] as THREE.Mesh;
        const gmat = gm.material as THREE.MeshBasicMaterial;
        gmat.opacity = dashGhostRef.current * 0.3;
      }
    }

    // Physics body is the single source of truth: store follows physics body
    _posTuple[0] = translation.x;
    _posTuple[1] = translation.y;
    _posTuple[2] = translation.z;
    // Cataclysmic Resonance field indication: a visual-only ground ring at
    // the player's position for the exact duration of the existing field
    // timer. Zero physics, zero per-frame allocations; hidden the moment the
    // timer expires (before/when the pulse resolves).
    if (cataclysmFieldRef.current) {
      const fieldAlive = cataclysmTimerRef.current > 0;
      cataclysmFieldRef.current.visible = fieldAlive;
      if (fieldAlive && playerMeshRef.current) {
        const cs = RESONANCE_SKILLS.find((k) => k.id === 'cataclysmic_resonance');
        const r = cs?.radius ?? 4;
        cataclysmFieldRef.current.position.set(translation.x, 0.06, translation.z);
        const pulse = 1 + 0.03 * Math.sin(performance.now() * 0.02);
        cataclysmFieldRef.current.scale.set(r * pulse, r * pulse, r * pulse);
        const fm = cataclysmFieldRef.current.material as THREE.MeshBasicMaterial;
        fm.opacity = Math.min(0.35, cataclysmTimerRef.current * 0.3);
      }
    }
    setPlayerPosition(_posTuple);
    // -- BF4 state-driven body animation --
    // Explicit, deterministic transforms per gameplay state. The physics body
    // is NEVER moved by animation; the dodge roll rotation is visual-only.
    {
      const tAnim = state.clock.getElapsedTime();
      const grounded = isGroundedRef.current;
      const moving = horizontalSpeed > 0.5 && grounded && !isDodgingRef.current;

      // Hit recoil: pulse on new accepted damage, decay deterministically.
      const storeDmg = useGameStore.getState().player.lastDamageTime;
      if (storeDmg !== lastDamageTimeRef.current) {
        lastDamageTimeRef.current = storeDmg;
        if (storeDmg > 0) hitRecoilRef.current = 1;
      }
      hitRecoilRef.current = Math.max(0, hitRecoilRef.current - delta * 4);

      if (
        !isDodgingRef.current && // dodge roll owns limb transforms (M1W2D6 #5)
        hipsGroupRef.current && torsoGroupRef.current && headGroupRef.current &&
        leftArmGroupRef.current && rightArmGroupRef.current &&
        leftLegGroupRef.current && rightLegGroupRef.current
      ) {
        // IDLE: periodic breathing (torso) + subtle weight shift (hips).
        const breathe = Math.sin(tAnim * 1.6) * 0.035;
        const shift = Math.sin(tAnim * 0.8) * 0.012;
        hipsGroupRef.current.position.x = shift;
        hipsGroupRef.current.rotation.z = shift * 0.6;
        headGroupRef.current.rotation.x = -breathe * 0.6;

        // Arms have exactly one owner per frame: while an attack swing is in
        // flight the attack branch owns them (BUG-008 precedence), so the
        // state poses below leave the arm alone on those frames.
        const armFree = attackTimerRef.current <= 0;
        if (!grounded) {
          // JUMP (rising) vs FALL (descending): distinct airborne poses.
          const velocityNow = rigidBodyRef.current.linvel();
          if (velocityNow.y > 0.5) {
            leftLegGroupRef.current.rotation.x = -0.9;
            rightLegGroupRef.current.rotation.x = -0.5;
            if (armFree) {
              leftArmGroupRef.current.rotation.x = -1.2;
              rightArmGroupRef.current.rotation.x = -0.7;
            }
          } else {
            leftLegGroupRef.current.rotation.x = 0.35;
            rightLegGroupRef.current.rotation.x = 0.55;
            if (armFree) {
              leftArmGroupRef.current.rotation.x = -0.4;
              rightArmGroupRef.current.rotation.x = -0.4;
            }
          }
        } else if (moving) {
          // WALK: legs alternate; arms swing in opposition -- deterministic
          // cycle from the existing head-bob phase accumulator.
          // E1: stride amplitude follows actual horizontal speed (idle -> full
          // stride), so a partial stick deflection or a slow start is not a
          // full-strength stride. At walk speed and above the scale is 1, so
          // the existing full-speed walk/sprint pose is unchanged.
          const speedScale = Math.min(1, horizontalSpeed / SPEED);
          const swing = Math.sin(headBobPhaseRef.current) * speedScale;
          leftLegGroupRef.current.rotation.x = swing * 0.55;
          rightLegGroupRef.current.rotation.x = -swing * 0.55;
          if (armFree) {
            leftArmGroupRef.current.rotation.x = -swing * 0.4;
            rightArmGroupRef.current.rotation.x = swing * 0.4;
          }
        } else {
          // Grounded idle limbs: neutral with breathing micro-swing.
          const micro = Math.sin(tAnim * 1.6) * 0.04;
          leftLegGroupRef.current.rotation.x = 0;
          rightLegGroupRef.current.rotation.x = 0;
          if (armFree) {
            leftArmGroupRef.current.rotation.x = micro;
            rightArmGroupRef.current.rotation.x = -micro;
          }
        }
        // E1 LOCOMOTION BLEND (M1W3D6 #1): exactly 0.1 s ease between the
        // locomotion states (idle <-> walk). The chain above still writes the
        // hard target and remains the ONLY writer of these four rotations;
        // this only smooths the approach to that target on the frames after a
        // state change. Nothing here can blend into or out of attack, dodge or
        // airborne: a non-locomotion state snaps, and the arms are blended
        // only on frames the locomotion chain owns them (armFree), so an
        // attack pose can never become a blend source or a blend target.
        const loco: 'idle' | 'walk' | null = !grounded ? null : (moving ? 'walk' : 'idle');
        const lb = locoBlendRef.current;
        if (loco !== lb.state) {
          // idle <-> walk eases; every other change snaps, by starting settled
          // (a re-entry from airborne/dodge must not ease out of that pose).
          const bothLoco = loco !== null && lb.state !== null;
          lb.state = loco;
          lb.t = bothLoco ? 0 : LOCO_BLEND_S;
        }
        if (loco !== null && lb.t < LOCO_BLEND_S) {
          lb.t = Math.min(LOCO_BLEND_S, lb.t + delta);
          const k = lb.t / LOCO_BLEND_S;
          leftLegGroupRef.current.rotation.x = lb.fromL + (leftLegGroupRef.current.rotation.x - lb.fromL) * k;
          rightLegGroupRef.current.rotation.x = lb.fromR + (rightLegGroupRef.current.rotation.x - lb.fromR) * k;
          if (armFree) {
            leftArmGroupRef.current.rotation.x = lb.fromLA + (leftArmGroupRef.current.rotation.x - lb.fromLA) * k;
            rightArmGroupRef.current.rotation.x = lb.fromRA + (rightArmGroupRef.current.rotation.x - lb.fromRA) * k;
          }
        } else if (loco !== null) {
          // Settled: this frame's pose becomes the next transition's source.
          // (Only locomotion frames are remembered, so an airborne or dodge
          // pose can never be eased out of later.)
          lb.fromL = leftLegGroupRef.current.rotation.x;
          lb.fromR = rightLegGroupRef.current.rotation.x;
          if (armFree) {
            lb.fromLA = leftArmGroupRef.current.rotation.x;
            lb.fromRA = rightArmGroupRef.current.rotation.x;
          }
        }

        // HIT/RECOIL: short backward lean layered on the breathing tilt --
        // only while the recoil impulse decays.
        torsoGroupRef.current.rotation.x = breathe - hitRecoilRef.current * 0.25;
      }
    }
    useGameStore.getState().checkLocationObjectives(_posTuple);
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      mass={1}
      type="dynamic"
      position={initialPlayerPosition}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider ref={colliderRef} args={[0.5, 0.5]} position={[0, 1, 0]} />
      {/* Ezra — lightweight stylised humanoid built from primitives.
          Same +Z facing convention as the old capsule (visor sat at z=+0.4).
          Hitbox/collider/physics untouched: the CapsuleCollider above remains
          the single authoritative hitbox. */}
      <group ref={playerMeshRef}>
        {/* -- BF4 explicit body hierarchy --
            pelvis(hips) -> torso -> neck/head; shoulders -> arms -> hands;
            hips -> legs -> boots. Every limb is parented at its anatomical
            joint, so limb-group rotations animate the whole limb. Weapons
            are parented to the arm groups, so arm rotations carry them. */}
        {/* Pelvis/hips - root of the leg chain and weight-shift origin */}
        <group ref={hipsGroupRef} position={[0, 0.72, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.36, 0.2, 0.24]} />
            <meshStandardMaterial color="#3f4a5a" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.05, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.08, 10]} />
            <meshStandardMaterial color="#4a3520" roughness={0.9} />
          </mesh>
          {/* Leggings (M1W2D6 #5): hip skirt attached to the pelvis group,
              following the leg chain origin. */}
          {armourSlots?.leggings && (
            <mesh position={[0, -0.18, 0]} castShadow>
              <cylinderGeometry args={[0.21, 0.23, 0.22, 10]} />
              <meshStandardMaterial {...armourMetalProps} />
            </mesh>
          )}

          {/* Upper leg L/R - parented at the hip joints */}
          <group ref={leftLegGroupRef} position={[0.13, -0.1, 0]}>
            <mesh position={[0, -0.3, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.1, 0.62, 8]} />
              <meshStandardMaterial color="#3a3f4b" roughness={0.9} />
            </mesh>
            {/* Lower leg + boot inside the same limb group */}
            <mesh position={[0, -0.62, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.08, 0.3, 8]} />
              <meshStandardMaterial color="#2f3540" roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.82, 0.04]} castShadow>
              <boxGeometry args={[0.16, 0.12, 0.26]} />
              <meshStandardMaterial color="#241d16" roughness={0.95} />
            </mesh>
            {/* Boot armour (M1W2D6 #5): attached inside the leg group so it
                follows every leg transform. */}
            {armourSlots?.boots && (
              <mesh position={[0, -0.84, 0.04]} castShadow>
                <boxGeometry args={[0.18, 0.1, 0.28]} />
                <meshStandardMaterial {...armourMetalProps} />
              </mesh>
            )}
          </group>
          <group ref={rightLegGroupRef} position={[-0.13, -0.1, 0]}>
            <mesh position={[0, -0.3, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.1, 0.62, 8]} />
              <meshStandardMaterial color="#3a3f4b" roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.62, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.08, 0.3, 8]} />
              <meshStandardMaterial color="#2f3540" roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.82, 0.04]} castShadow>
              <boxGeometry args={[0.16, 0.12, 0.26]} />
              <meshStandardMaterial color="#241d16" roughness={0.95} />
            </mesh>
            {/* Boot armour (M1W2D6 #5): attached inside the leg group so it
                follows every leg transform. */}
            {armourSlots?.boots && (
              <mesh position={[0, -0.84, 0.04]} castShadow>
                <boxGeometry args={[0.18, 0.1, 0.28]} />
                <meshStandardMaterial {...armourMetalProps} />
              </mesh>
            )}
          </group>
        </group>

        {/* Torso - connects to pelvis, carries the shoulder joints */}
        <group ref={torsoGroupRef} position={[0, 0.82, 0]}>
          {/* Torso meshes, wrapped: first-person mode hides this group instead
              of the torso group, because the arm groups (and the weapons they
              carry) are children of the torso. */}
          <group ref={bodyMeshGroupRef}>
            <mesh position={[0, 0.13, 0]} castShadow>
              <cylinderGeometry args={[0.24, 0.19, 0.68, 10]} />
              <meshStandardMaterial color="#3b5b8c" roughness={0.85} />
            </mesh>
            {/* Chestplate (M1W2D6 #5): attached to the torso group. */}
            {armourSlots?.chest && (
              <mesh position={[0, 0.15, 0.02]} castShadow>
                <cylinderGeometry args={[0.255, 0.2, 0.5, 10]} />
                <meshStandardMaterial {...armourMetalProps} />
              </mesh>
            )}
            <mesh position={[0.28, 0.42, 0]} castShadow>
              <sphereGeometry args={[0.11, 8, 8]} />
              <meshStandardMaterial color="#2c3e5c" roughness={0.8} />
            </mesh>
            <mesh position={[-0.28, 0.42, 0]} castShadow>
              <sphereGeometry args={[0.11, 8, 8]} />
              <meshStandardMaterial color="#2c3e5c" roughness={0.8} />
            </mesh>
          </group>
          {/* Arms originate at the shoulder positions. Right hand = weapon
              anchor. Each arm owns its meshes and the weapons it carries. */}
          <group ref={rightArmGroupRef} position={[0.31, 0.42, 0]}>
            <group ref={armMeshRightRef}>
              <mesh position={[0, -0.26, 0.03]} rotation={[0.12, 0, 0.12]} castShadow>
                <cylinderGeometry args={[0.06, 0.075, 0.52, 8]} />
                <meshStandardMaterial color="#3b5b8c" roughness={0.85} />
              </mesh>
              <mesh position={[0.01, -0.53, 0.07]} castShadow>
                <sphereGeometry args={[0.07, 6, 6]} />
                <meshStandardMaterial color="#d8a37a" roughness={0.9} />
              </mesh>
            </group>
            {/* Water Staff - child of the right arm group, shown only when
                equipped (derived from the hotbar source of truth). */}
            <group ref={staffGroupRef} visible={false}>
              <group position={[0.19, -0.14, 0.2]} rotation={[0.1, 0, -0.08]}>
                {/* Shaft */}
                <mesh position={[0, 0.1, 0]} castShadow>
                  <cylinderGeometry args={[0.045, 0.06, 1.7, 8]} />
                  <meshStandardMaterial color="#4a3520" roughness={0.8} />
                </mesh>
                {/* Bronze ferrule */}
                <mesh position={[0, 0.72, 0]} castShadow>
                  <cylinderGeometry args={[0.07, 0.07, 0.14, 8]} />
                  <meshStandardMaterial color="#8c6d2f" metalness={0.6} roughness={0.4} />
                </mesh>
                {/* Water orb head */}
                <mesh position={[0, 0.95, 0]} castShadow>
                  <sphereGeometry args={[0.14, 12, 12]} />
                  <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.7} metalness={0.2} roughness={0.15} />
                </mesh>
                {/* Orb glow halo */}
                <mesh position={[0, 0.95, 0]}>
                  <sphereGeometry args={[0.2, 12, 12]} />
                  <meshBasicMaterial color="#7dd3fc" transparent opacity={0.25} depthWrite={false} />
                </mesh>
              </group>
            </group>
            {/* M1887 - child of the right arm group, shown only when the gun
                occupies the selected hotbar slot. */}
            <group ref={gunGroupRef} visible={false}>
              <group position={[0.14, -0.19, 0.3]} rotation={[0.15, 0, -0.1]}>
                {/* Barrel + breech */}
                <mesh position={[0, 0.35, 0.15]} castShadow>
                  <boxGeometry args={[0.07, 0.7, 0.09]} />
                  <meshStandardMaterial color="#4a4f57" metalness={0.8} roughness={0.3} />
                </mesh>
                {/* Muzzle flash — parented at the actual barrel tip (z = 0.15 + 0.35 + 0.045),
                    faces +Z along the firing direction; visible only during the
                    0.08s post-shot window driven by gunMuzzleFlashTimerRef. */}
                <mesh ref={gunMuzzleFlashRef} position={[0, 0.35, 0.545]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
                  <coneGeometry args={[0.09, 0.3, 6]} />
                  <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} depthWrite={false} />
                </mesh>
                {/* Stock */}
                <mesh position={[0, -0.05, -0.05]} rotation={[0.25, 0, 0]} castShadow>
                  <boxGeometry args={[0.08, 0.45, 0.11]} />
                  <meshStandardMaterial color="#5a3d22" roughness={0.75} />
                </mesh>
                {/* Grip */}
                <mesh position={[0, -0.18, 0.06]} rotation={[0.5, 0, 0]} castShadow>
                  <boxGeometry args={[0.07, 0.24, 0.09]} />
                  <meshStandardMaterial color="#4a3018" roughness={0.7} />
                </mesh>
              </group>
            </group>
            {/* Crossbow (M1W2D6 #5) - child of the right arm group, shown only
                when the crossbow occupies the selected hotbar slot. */}
            <group ref={crossbowGroupRef} visible={false}>
              <group position={[0.14, -0.19, 0.3]} rotation={[0.15, 0, -0.1]}>
                {/* Stock + limbs */}
                <mesh position={[0, 0, 0.1]} castShadow>
                  <boxGeometry args={[0.07, 0.4, 0.5]} />
                  <meshStandardMaterial color="#5a3d22" roughness={0.75} />
                </mesh>
                <mesh position={[0, 0.1, 0.35]} castShadow>
                  <boxGeometry args={[0.06, 0.08, 0.5]} />
                  <meshStandardMaterial color="#4a4f57" metalness={0.8} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0.2, 0.3]} castShadow>
                  <boxGeometry args={[0.05, 0.05, 0.3]} />
                  <meshStandardMaterial color="#4a4f57" metalness={0.8} roughness={0.3} />
                </mesh>
                {/* Bowstring */}
                <mesh position={[0, 0.2, 0.1]}>
                  <boxGeometry args={[0.02, 0.02, 0.42]} />
                  <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
                </mesh>
              </group>
            </group>
            {/* Resonance Core - child of the right arm group, shown only when
                the Core occupies the selected hotbar slot. */}
            <group ref={coreGroupRef} visible={false}>
              <group position={[0.14, -0.24, 0.28]}>
                <mesh castShadow>
                  <octahedronGeometry args={[0.18, 0]} />
                  <meshStandardMaterial color="#a78bfa" emissive="#7c3aed" emissiveIntensity={0.9} metalness={0.3} roughness={0.15} />
                </mesh>
                <mesh>
                  <octahedronGeometry args={[0.26, 0]} />
                  <meshBasicMaterial color="#c4b5fd" transparent opacity={0.22} depthWrite={false} />
                </mesh>
              </group>
            </group>
            {/* Dual Daggers - right-arm blade (source label: "right-hand blade
                (bright)"). Two independent refs so each arm animates alone. */}
            <group ref={daggerRightGroupRef} visible={false}>
              <group position={[-0.76, -0.19, 0.25]} rotation={[0.25, 0, 0.3]}>
                {/* Left-hand blade (bright) */}
                <mesh position={[0, 0.28, 0]} castShadow>
                  <boxGeometry args={[0.05, 0.55, 0.1]} />
                  <meshStandardMaterial color="#dbe4ee" metalness={0.75} roughness={0.25} />
                </mesh>
                <mesh position={[0, -0.05, 0]} castShadow>
                  <boxGeometry args={[0.2, 0.05, 0.1]} />
                  <meshStandardMaterial color="#8c6d2f" metalness={0.5} roughness={0.4} />
                </mesh>
                <mesh position={[0, -0.16, 0]} castShadow>
                  <cylinderGeometry args={[0.03, 0.035, 0.2, 8]} />
                  <meshStandardMaterial color="#3a2a18" />
                </mesh>
              </group>
            </group>
            {/* Sword - child of the right arm group; the weapon world pose is
                inherited from the arm, so no per-frame yaw sync is needed. */}
            <group ref={swordPivotRef}>
              <group ref={swordGroupRef} position={[0.19, -0.14, 0.2]}>
                {/* Blade */}
                <mesh position={[0, 0.5, 0]} castShadow>
                  <boxGeometry args={[0.08, 1.1, 0.15]} />
                  <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* Guard */}
                <mesh position={[0, 0, 0]} castShadow>
                  <boxGeometry args={[0.35, 0.08, 0.15]} />
                  <meshStandardMaterial color="#eab308" />
                </mesh>
                {/* Handle */}
                <mesh position={[0, -0.2, 0]} castShadow>
                  <cylinderGeometry args={[0.04, 0.04, 0.3]} />
                  <meshStandardMaterial color="#78350f" />
                </mesh>
                {/* Weapon trail — lightweight plane that follows the blade tip */}
                <mesh ref={trailMeshRef} position={[0, 0.5, 0]} visible={false}>
                  <planeGeometry args={[0.12, 1.0]} />
                  <meshBasicMaterial color={CC.weaponTrailColor} transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            </group>
          </group>
          <group ref={leftArmGroupRef} position={[-0.31, 0.42, 0]}>
            <group ref={armMeshLeftRef}>
              <mesh position={[0, -0.26, 0.03]} rotation={[0.12, 0, -0.12]} castShadow>
                <cylinderGeometry args={[0.06, 0.075, 0.52, 8]} />
                <meshStandardMaterial color="#3b5b8c" roughness={0.85} />
              </mesh>
              <mesh position={[-0.01, -0.53, 0.07]} castShadow>
                <sphereGeometry args={[0.07, 6, 6]} />
                <meshStandardMaterial color="#d8a37a" roughness={0.9} />
              </mesh>
            </group>
            {/* Dual Daggers - left-arm blade (source label: "left-hand blade
                (blued)"). */}
            <group ref={daggerLeftGroupRef} visible={false}>
              <group position={[0.76, -0.19, 0.25]} rotation={[0.25, 0, -0.3]}>
                {/* Right-hand blade (blued) */}
                <mesh position={[0, 0.28, 0]} castShadow>
                  <boxGeometry args={[0.05, 0.55, 0.1]} />
                  <meshStandardMaterial color="#4b5a6b" metalness={0.75} roughness={0.3} />
                </mesh>
                <mesh position={[0, -0.05, 0]} castShadow>
                  <boxGeometry args={[0.2, 0.05, 0.1]} />
                  <meshStandardMaterial color="#8c6d2f" metalness={0.5} roughness={0.4} />
                </mesh>
                <mesh position={[0, -0.16, 0]} castShadow>
                  <cylinderGeometry args={[0.03, 0.035, 0.2, 8]} />
                  <meshStandardMaterial color="#3a2a18" />
                </mesh>
              </group>
            </group>
          </group>
          {/* Neck + head - above the torso */}
          <group ref={headGroupRef} position={[0, 0.5, 0]}>
            {/* Helmet (M1W2D6 #5): attached to the head group so it follows
                every head transform. */}
            {armourSlots?.helmet && (
              <mesh position={[0, 0.22, 0]} castShadow>
                <sphereGeometry args={[0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial {...armourMetalProps} />
              </mesh>
            )}
            <mesh position={[0, 0.02, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.16, 0.1, 10]} />
              <meshStandardMaterial color="#8c2f2f" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.18, 0]} castShadow>
              <sphereGeometry args={[0.19, 12, 12]} />
              <meshStandardMaterial color="#d8a37a" roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.25, -0.03]} castShadow>
              <sphereGeometry args={[0.2, 10, 10]} />
              <meshStandardMaterial color="#4a3520" roughness={0.95} />
            </mesh>
            <mesh position={[0, 0.19, 0.16]} castShadow>
              <boxGeometry args={[0.22, 0.06, 0.06]} />
              <meshStandardMaterial color="#1e3a8a" roughness={0.5} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Fatamorgana afterimage — visual-only ghost silhouette. */}
      <group ref={ghostMeshRef} visible={false}>
        <mesh position={[0, 1, 0]}>
          <capsuleGeometry args={[0.5, 1, 4, 12]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* Cataclysmic Resonance field ring - visual-only indicator of the
          active field phase; positioned/scaled/hidden in the frame loop. */}
      <mesh ref={cataclysmFieldRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.92, 1, 48]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </RigidBody>
  );
}
