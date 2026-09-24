'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, npcPositions, updateNpcPosition } from '@/lib/store';
import { NPCData } from '@/lib/questData';
import {
  npcPositionCache,
  registerNpcPosition,
  unregisterNpcPosition,
} from './InteractionManager';

interface NPCProps {
  data: NPCData;
}

/** Obstacle positions for collision avoidance.
 *  Uses AABB (axis-aligned bounding box) for rectangular structures
 *  and circular collision for round objects. Each obstacle has:
 *  - center position (x, z)
 *  - halfWidth/halfDepth for rectangular structures (AABB)
 *  - OR radius for circular objects
 *  NPCs are blocked when their body (NPC_BODY_RADIUS) overlaps the obstacle. */
interface ObstacleCircle { kind: 'circle'; x: number; z: number; radius: number; }
interface ObstacleBox { kind: 'box'; x: number; z: number; halfW: number; halfD: number; }
type Obstacle = ObstacleCircle | ObstacleBox;

export const OBSTACLES: Obstacle[] = [
  // Marcus stall — counter at (6, 0.5, 3), roof at (6, 2.5, 2)
  // Box covers roof area; stops before counter so Marcus can stand at z=3
  { kind: 'box', x: 6, z: 2, halfW: 1.25, halfD: 0.45 },
  // Garrick forge — two separate pieces:
  //   anvil at (-6, 0.4, 3) size 0.5x0.6
  { kind: 'box', x: -6, z: 3, halfW: 0.35, halfD: 0.4 },
  //   furnace at (-5.2, 0.3, 3.5) size 0.6x0.6
  { kind: 'box', x: -5.2, z: 3.5, halfW: 0.4, halfD: 0.4 },
  // Hektor guard post — post at (3, 0.8, -6) size 0.6x0.6
  { kind: 'box', x: 3, z: -6, halfW: 0.4, halfD: 0.4 },
  // Seraphina healing hut — 1.8x1.8x1.8 box at (-4, 1.2, -5)
  // Box covers core hut area; stops before Seraphina's standing position at z=-4
  { kind: 'box', x: -4, z: -5, halfW: 0.9, halfD: 0.4 },
  // Village houses — 3x3x3 boxes (half-extent 1.5)
  { kind: 'box', x: 4, z: 4, halfW: 1.5, halfD: 1.5 },
  { kind: 'box', x: -5, z: 5, halfW: 1.5, halfD: 1.5 },
  { kind: 'box', x: 2, z: -3, halfW: 1.25, halfD: 1.25 },
  // Decorative campfire — small circular fire at (1.5, 0, 2)
  { kind: 'circle', x: 1.5, z: 2, radius: 0.6 },
];

/** NPC body radius — used to prevent visual overlap with obstacles */
const NPC_BODY_RADIUS = 0.5;

function isPositionBlocked(x: number, z: number, excludeNpcId?: string): boolean {
  for (const obs of OBSTACLES) {
    if (obs.kind === 'circle') {
      const dx = x - obs.x;
      const dz = z - obs.z;
      const minDist = obs.radius + NPC_BODY_RADIUS;
      if (dx * dx + dz * dz < minDist * minDist) return true;
    } else {
      // AABB: check if NPC circle overlaps the rectangle
      // Closest point on rectangle to NPC center
      const closestX = Math.max(obs.x - obs.halfW, Math.min(x, obs.x + obs.halfW));
      const closestZ = Math.max(obs.z - obs.halfD, Math.min(z, obs.z + obs.halfD));
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < NPC_BODY_RADIUS * NPC_BODY_RADIUS) return true;
    }
  }
  // Check other NPCs using LIVE positions from shared tracking
  for (const [npcId, pos] of npcPositions) {
    if (npcId === excludeNpcId) continue;
    const dx = x - pos.x;
    const dz = z - pos.z;
    // Two NPCs must not overlap — combine body radii
    const minDist = NPC_BODY_RADIUS + NPC_BODY_RADIUS;
    if (dx * dx + dz * dz < minDist * minDist) return true;
  }
  return false;
}

// Module-level social-claim map: an initiator claims its partner id so two
// NPCs can never independently start separate social interactions with each
// other. Entries are bounded (max one per initiator, cleared on end/unmount).
const socialClaims = new Map<string, string>(); // initiatorId -> partnerId

export default function NPC({ data }: NPCProps) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const propRef = useRef<THREE.Mesh>(null);
  const wanderTimerRef = useRef(Math.random() * 3 + 2);
  const wanderTargetRef = useRef(new THREE.Vector3(data.position[0], data.position[1], data.position[2]));
  const homePosRef = useRef(new THREE.Vector3(data.position[0], data.position[1], data.position[2]));
  const WANDER_RADIUS = data.id === 'npc_arthur' ? 1.5 : 2.5;
  const WANDER_SPEED = 0.5;
  const ENEMY_ZONE_Z = -8;

  // ── Ambient activity state machine (M1W2D6 #2 Living World) ──
  // Lightweight extension of the existing wander loop: the NPC cycles
  // idle → moving → acting at bounded activity points around its home,
  // and pauses to face the player when they come close. All timing is
  // per-NPC local refs — no intervals, no global simulation.
  type ActivityState = 'idle' | 'moving' | 'acting' | 'reacting';
  const activityStateRef = useRef<ActivityState>('idle');
  const activityTimerRef = useRef(0);
  const reactionTimerRef = useRef(0);
  const resumeStateRef = useRef<ActivityState>('idle');
  // Deterministic per-NPC stagger derived from spawn position (constant per
  // NPC instance) so villagers never transition in lock-step.
  const staggerOffsetRef = useRef(((data.position[0] * 7 + data.position[2] * 13) % 4 + 4) % 4);
  // Watchdog refs (stuck detection): allocation-free, updated only while walking.
  const lastXRef = useRef(0);
  const lastZRef = useRef(0);
  const stuckCheckAccumRef = useRef(0);

  // ── NPC-to-NPC social ambient interaction (M1W2D6 #2 final pass) ──
  // Instance-local refs only — no store state, no global manager. One NPC
  // initiates, claims the partner via a module-level claim map (both sides
  // can never independently pair with each other), both face each other for
  // a bounded pause, then both return to valid activity.
  const socialStateRef = useRef<'none' | 'engaged'>('none');
  const socialTimerRef = useRef(0);
  const socialPartnerRef = useRef<string | null>(null);
  const socialResumeRef = useRef<ActivityState>('idle');
  // Occasional, not continuous: a fresh social roll only after a bounded
  // cooldown, seeded with the per-NPC stagger offset.
  const socialCooldownRef = useRef(10 + staggerOffsetRef.current * 2);

  // ── Environmental NPC reaction (M1W2D6 #2 final feature) ──
  // NPCs notice nearby player combat impacts via the authoritative camera-
  // shake request id (every confirmed hit/enemy cast calls triggerCameraShake
  // — one monotonic id, already in the store). Bounded polling (~4 Hz per
  // NPC, one number comparison) — no event framework, no world scan.
  type ActivityStateX = ActivityState | 'alerted';
  const envStateRef = useRef<ActivityStateX>('idle');
  const envTimerRef = useRef(0);
  const envCooldownRef = useRef(0); // same-category cooldown after reacting
  const lastSeenShakeIdRef = useRef(0);

  // ── Combat awareness (Feature 5, priority below environmental alert) ──
  // Event source: the store's authoritative `damageNumbers` array — every
  // ACCEPTED damage event (player→enemy, enemy→player, faction) appends an
  // entry carrying world position + createdAt, and expired entries are
  // removed. Polling is a bounded array-length compare per NPC on a ~4 Hz
  // cadence; no event bus, no allocations, no world scan.
  const combatAwareRef = useRef(false);
  const combatTimerRef = useRef(0);
  const combatCooldownRef = useRef(0);
  const combatSrcXRef = useRef(0);
  const combatSrcZRef = useRef(0);
  const lastDamageCountRef = useRef(0);
  const combatPollAccumRef = useRef(0);

  // State safety: clear all social state when this NPC unmounts (house
  // enter/exit, New Game) so a stale claim can never lock another NPC out.
  // Also drop this NPC's interaction-cache entries: registration runs every
  // frame, so without the unregister the stale position would keep the
  // unmounted NPC interactable (and keep blocking other NPCs' movement).
  React.useEffect(() => {
    return () => {
      if (socialPartnerRef.current) socialClaims.delete(data.id);
      unregisterNpcPosition(data.id);
      npcPositions.delete(data.id);
    };
  }, [data.id]);

  // Bounded activity points: fixed offsets relative to home. Choosing among
  // them is validated against obstacles; NPCs never stray beyond the same
  // WANDER_RADIUS clamp the old wander used.
  const ACTIVITY_OFFSETS: [number, number][] = [
    [1.2, 0.6], [-1.0, 1.1], [0.4, -1.3], [-1.3, -0.5],
  ];

  /** Pick an unblocked activity point near home; falls back to staying put. */
  const chooseActivityTarget = () => {
    const idx = Math.floor(Math.random() * ACTIVITY_OFFSETS.length);
    for (let i = 0; i < ACTIVITY_OFFSETS.length; i++) {
      const [ox, oz] = ACTIVITY_OFFSETS[(idx + i) % ACTIVITY_OFFSETS.length];
      const tx = homePosRef.current.x + ox;
      const tz = homePosRef.current.z + oz;
      const clampedX = THREE.MathUtils.clamp(tx, -15, 15);
      const clampedZ = Math.max(tz, ENEMY_ZONE_Z);
      if (!isPositionBlocked(clampedX, clampedZ, data.id)) {
        wanderTargetRef.current.set(clampedX, homePosRef.current.y, clampedZ);
        activityStateRef.current = 'moving';
        // Travel time scales with distance so short hops pause sooner.
        activityTimerRef.current = Math.random() * 2 + 3 + staggerOffsetRef.current * 0.25;
        return;
      }
    }
    // Every point blocked — stay idle here.
    activityStateRef.current = 'idle';
    activityTimerRef.current = Math.random() * 2 + 2;
  };

  // Reusable temp vector for collision checks
  const _tempPos = useRef(new THREE.Vector3()).current;

  const quests = useGameStore((state) => state.quests);

  // Determine overhead quest marker state
  const quest = quests.find((q) => q.id === data.questId);
  let questMarker: 'available' | 'turnIn' | 'inProgress' | null = null;
  if (quest) {
    if (quest.status === 'unaccepted') {
      const completedIds = useGameStore.getState().completedQuestIds;
      const prereqMet = !quest.prerequisiteQuestId || completedIds.includes(quest.prerequisiteQuestId);
      if (prereqMet) questMarker = 'available';
    } else if (quest.status === 'ready_to_turn_in') {
      questMarker = 'turnIn';
    } else if (quest.status === 'active') {
      const allDone = quest.objectives.every((o) => o.currentAmount >= o.requiredAmount);
      questMarker = allDone ? 'turnIn' : 'inProgress';
    }
  }

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const time = state.clock.getElapsedTime();

    // ── Ambient activity state machine (extends the old wander loop) ──
    // Player proximity check: single distance test per NPC per frame using
    // the already-fetched store snapshot — no allocations, no global scan.
    const activeDialogue = useGameStore.getState().activeDialogue;
    if (!activeDialogue) {
      const pArr = useGameStore.getState().player.position;
      const pdx = pArr[0] - groupRef.current.position.x;
      const pdz = pArr[2] - groupRef.current.position.z;
      const playerDistSq = pdx * pdx + pdz * pdz;
      const REACT_RADIUS_SQ = 3.5 * 3.5;
      const LEAVE_RADIUS_SQ = 4.5 * 4.5;

      // Player reaction: when the player comes close, stop the current
      // activity, face them briefly, then resume. Hysteresis (enter 3.5,
      // leave 4.5) prevents flicker while the player stands at the edge.
      // Player priority: entering reaction suspends any social interaction
      // and releases its partner claim immediately.
      if (activityStateRef.current !== 'reacting') {
        if (playerDistSq <= REACT_RADIUS_SQ) {
          if (socialStateRef.current === 'engaged' && socialPartnerRef.current) {
            socialClaims.delete(data.id);
            socialStateRef.current = 'none';
            socialPartnerRef.current = null;
            socialCooldownRef.current = Math.max(socialCooldownRef.current, 6);
          }
          resumeStateRef.current = activityStateRef.current;
          activityStateRef.current = 'reacting';
          reactionTimerRef.current = 1.2 + (staggerOffsetRef.current % 3) * 0.2;
        }
      } else {
        // Face the player while reacting.
        groupRef.current.rotation.y = Math.atan2(pdx, pdz);
        reactionTimerRef.current -= delta;
        if (playerDistSq > LEAVE_RADIUS_SQ || reactionTimerRef.current <= 0) {
          // BUG FIX (activity-resume edge case): when the reaction timer ends
          // while the player is STILL within the enter radius, resuming
          // 'moving' made the NPC take one step and instantly re-react — a
          // step-react livelock. While the player remains close, suspend in
          // idle instead; a resumed walk only restarts once the player has
          // actually left the enter radius.
          if (playerDistSq <= REACT_RADIUS_SQ) {
            activityStateRef.current = 'idle';
            activityTimerRef.current = 0.5; // re-evaluate shortly
          } else {
            activityStateRef.current = resumeStateRef.current === 'moving' ? 'idle' : resumeStateRef.current;
            if (resumeStateRef.current === 'moving') {
              // The saved target may be stale (obstacles, NPC crowding, or
              // another NPC claiming the same spot). Restart from a valid
              // idle → the normal choice path picks a fresh, checked point.
              activityTimerRef.current = 0.2;
            }
          }
        }
      }

      // Activity progression — only runs when NOT reacting to the player
      // and NOT alerted by an environmental event (an alerted NPC pauses:
      // otherwise the movement branch would fight the alert facing each
      // frame and the NPC would walk away mid-reaction).
      if (activityStateRef.current !== 'reacting' && envStateRef.current !== 'alerted' && !combatAwareRef.current) {
        if (activityStateRef.current === 'idle') {
          activityTimerRef.current -= delta;
          if (activityTimerRef.current <= 0) chooseActivityTarget();
        } else if (activityStateRef.current === 'acting') {
          // Pause/perform at the activity point.
          activityTimerRef.current -= delta;
          if (activityTimerRef.current <= 0) {
            activityStateRef.current = 'idle';
            activityTimerRef.current = Math.random() * 2 + 1.5 + (staggerOffsetRef.current % 3) * 0.5;
          }
        } else if (activityStateRef.current === 'moving') {
          activityTimerRef.current -= delta;
          const cx = groupRef.current.position.x;
          const cz = groupRef.current.position.z;
          const tx = wanderTargetRef.current.x;
          const tz = wanderTargetRef.current.z;
          const dx = tx - cx;
          const dz = tz - cz;
          const wanderDist = Math.sqrt(dx * dx + dz * dz);
          if (wanderDist > 0.15) {
            const step = Math.min(WANDER_SPEED * delta, wanderDist);
            const nextX = cx + (dx / wanderDist) * step;
            const nextZ = cz + (dz / wanderDist) * step;
            // Segment-safe movement (collision bug fix): the previous
            // midpoint+destination sampling could straddle a narrow blocked
            // region when a frame hitch made one step large (step = speed ×
            // delta spikes with delta). Subdivide the step into ≤0.05 u
            // sub-steps and reject the WHOLE step if any sub-point is
            // blocked — the NPC can never cross a blocked position. Normal
            // frames: a single sub-step (same cost as the old midpoint
            // check); hitches: a few extra bounded checks.
            const segLen = Math.sqrt(step * step); // == step
            const subSteps = Math.max(1, Math.ceil(segLen / 0.05));
            let stepClear = true;
            for (let ss = 1; ss <= subSteps; ss++) {
              const t = ss / subSteps;
              const sx = cx + (dx / wanderDist) * step * t;
              const sz = cz + (dz / wanderDist) * step * t;
              if (isPositionBlocked(sx, sz, data.id)) {
                stepClear = false;
                break;
              }
            }
            if (stepClear) {
              groupRef.current.position.x = nextX;
              groupRef.current.position.z = nextZ;
              groupRef.current.rotation.y = Math.atan2(dx, dz);
            } else {
              // Blocked mid-walk — give up on this point and idle.
              activityStateRef.current = 'idle';
              activityTimerRef.current = Math.random() * 2 + 1.5;
            }
          } else {
            // Arrived: perform at the point for a bounded pause.
            activityStateRef.current = 'acting';
            activityTimerRef.current = Math.random() * 3 + 2 + (staggerOffsetRef.current % 3) * 0.7;
          }
          // Safety timeout: a walk that cannot finish (constant obstacle
          // churn) gives up instead of oscillating forever.
          if (activityTimerRef.current <= 0) {
            activityStateRef.current = 'idle';
            activityTimerRef.current = Math.random() * 2 + 1.5;
          }
          // Stuck watchdog: barely moved this frame while nominally walking →
          // abandon the target so the NPC cannot oscillate against an obstacle.
          if (activityStateRef.current === 'moving') {
            const movedSq = (groupRef.current.position.x - lastXRef.current) ** 2 +
              (groupRef.current.position.z - lastZRef.current) ** 2;
            stuckCheckAccumRef.current += delta;
            if (stuckCheckAccumRef.current >= 1) {
              if (movedSq < 0.0025) {
                activityStateRef.current = 'idle';
                activityTimerRef.current = Math.random() * 2 + 1.5;
              }
              lastXRef.current = groupRef.current.position.x;
              lastZRef.current = groupRef.current.position.z;
              stuckCheckAccumRef.current = 0;
            }
          }
        }
      }

      // ── Environmental reaction (priority: below player reaction, above
      // social interaction) ──
      // Detect NEW player combat impacts near this NPC: the store's camera-
      // shake request carries a monotonic id set by every confirmed
      // hit/cast. Compare the id (one integer compare) on a ~4 Hz cadence
      // per NPC; only react if the impact was close (≤6 u).
      const shake = useGameStore.getState().cameraShakeRequest;
      if (shake && shake.id !== lastSeenShakeIdRef.current) {
        const isNew = shake.id > lastSeenShakeIdRef.current;
        lastSeenShakeIdRef.current = shake.id;
        const sdx = useGameStore.getState().player.position[0] - groupRef.current.position.x;
        const sdz = useGameStore.getState().player.position[2] - groupRef.current.position.z;
        const eventDistSq = sdx * sdx + sdz * sdz;
        if (
          isNew && envCooldownRef.current <= 0 && eventDistSq <= 36 &&
          activityStateRef.current !== 'reacting' &&
          envStateRef.current !== 'alerted'
        ) {
          // Player priority is preserved: 'reacting' is excluded above and
          // the player-reaction block can re-enter this NPC at any time.
          if (socialStateRef.current === 'engaged' && socialPartnerRef.current) {
            // Interrupting a social interaction releases the claim so the
            // partner is never permanently locked.
            socialClaims.delete(data.id);
            socialStateRef.current = 'none';
            socialPartnerRef.current = null;
            socialCooldownRef.current = Math.max(socialCooldownRef.current, 6);
          }
          envStateRef.current = 'alerted';
          envTimerRef.current = 1.4 + (staggerOffsetRef.current % 3) * 0.3;
          envCooldownRef.current = 8 + Math.random() * 6;
          // Face the event source (the player position where the impact
          // happened) and pause ambient activity for the bounded duration.
          groupRef.current.rotation.y = Math.atan2(sdx, sdz);
        }
      }
      if (envStateRef.current === 'alerted') {
        envTimerRef.current -= delta;
        envCooldownRef.current = Math.max(0, envCooldownRef.current - delta);
        if (envTimerRef.current <= 0) {
          // Return to a VALID ambient state — never the stale movement
          // target; idle re-enters the normal obstacle-checked choice path.
          envStateRef.current = 'idle';
          activityStateRef.current = 'idle';
          activityTimerRef.current = Math.random() * 1.5 + 1;
        }
      } else {
        envCooldownRef.current = Math.max(0, envCooldownRef.current - delta);
      }

      // ── NPC-to-NPC social ambient interaction ──
      // Occasional event: a cooldown gate keeps NPCs mostly in normal
      // activity. Only an idle NPC initiates (never while reacting/moving/
      // acting/socially engaged), and player reaction has absolute priority.
      if (
        envStateRef.current !== 'alerted' &&
        !combatAwareRef.current &&
        activityStateRef.current === 'idle' &&
        socialStateRef.current === 'none' &&
        socialCooldownRef.current <= 0
      ) {
        // Social discovery (unchanged behaviour, additional gates).
        const myX = groupRef.current.position.x;
        const myZ = groupRef.current.position.z;
        const SOCIAL_RANGE_SQ = 2.6 * 2.6;
        let found: string | null = null;
        let scan = 0;
        for (const [otherId, otherPos] of npcPositionCache) {
          if (otherId === data.id) continue;
          if (socialClaims.has(otherId)) continue;
          const ddx = otherPos.x - myX;
          const ddz = otherPos.z - myZ;
          if (ddx * ddx + ddz * ddz > SOCIAL_RANGE_SQ) continue;
          scan++;
          if ((scan + staggerOffsetRef.current) % 2 === 0) {
            found = otherId;
            break;
          }
        }
        if (found) {
          socialClaims.set(data.id, found);
          socialStateRef.current = 'engaged';
          socialPartnerRef.current = found;
          socialResumeRef.current = 'idle';
          socialTimerRef.current = 2.2 + (staggerOffsetRef.current % 3) * 0.4;
          socialCooldownRef.current = 14 + Math.random() * 8 + staggerOffsetRef.current;
          activityTimerRef.current = Math.max(activityTimerRef.current, socialTimerRef.current);
        } else {
          socialCooldownRef.current = 6 + Math.random() * 4;
        }
      }
      if (envStateRef.current !== 'alerted' && !combatAwareRef.current) {
        socialCooldownRef.current = Math.max(0, socialCooldownRef.current - delta);
      }
      combatPollAccumRef.current += delta;
      if (combatPollAccumRef.current >= 0.25) {
        combatPollAccumRef.current = 0;
        const dn = useGameStore.getState().damageNumbers;
        if (dn.length > lastDamageCountRef.current) {
          lastDamageCountRef.current = dn.length;
          // Only react when nothing higher-priority is active.
          if (
            !combatAwareRef.current &&
            combatCooldownRef.current <= 0 &&
            activityStateRef.current !== 'reacting' &&
            envStateRef.current !== 'alerted'
          ) {
            // Newest entry first: find the most recent event within range.
            for (let i = dn.length - 1; i >= 0; i--) {
              const ev = dn[i];
              const cdx = ev.x - groupRef.current.position.x;
              const cdz = ev.z - groupRef.current.position.z;
              const dSq = cdx * cdx + cdz * cdz;
              if (dSq <= 7 * 7) {
                // Interrupt any social interaction cleanly: release the
                // claim so the partner is never locked out.
                if (socialStateRef.current === 'engaged' && socialPartnerRef.current) {
                  socialClaims.delete(data.id);
                  socialStateRef.current = 'none';
                  socialPartnerRef.current = null;
                  socialCooldownRef.current = Math.max(socialCooldownRef.current, 6);
                }
                combatAwareRef.current = true;
                combatTimerRef.current = 1.6 + (staggerOffsetRef.current % 3) * 0.3;
                combatCooldownRef.current = 10 + Math.random() * 6;
                combatSrcXRef.current = ev.x;
                combatSrcZRef.current = ev.z;
                // Face the authoritative event position (a reliable source
                // position — the actual accepted-damage location).
                groupRef.current.rotation.y = Math.atan2(cdx, cdz);
                break;
              }
            }
          } else if (dn.length > lastDamageCountRef.current) {
            lastDamageCountRef.current = dn.length;
          }
        } else {
          lastDamageCountRef.current = dn.length;
        }
      }
      // Awareness progression: face the combat source, hold the bounded
      // timer, then return to a FRESH idle (never an old movement target).
      if (combatAwareRef.current) {
        if (
          activityStateRef.current === 'reacting' ||
          envStateRef.current === 'alerted'
        ) {
          // Higher priority took over: clear immediately, no stale state.
          combatAwareRef.current = false;
          combatTimerRef.current = 0;
        } else {
          combatTimerRef.current -= delta;
          if (combatTimerRef.current <= 0) {
            combatAwareRef.current = false;
            combatTimerRef.current = 0;
            activityStateRef.current = 'idle';
            activityTimerRef.current = Math.random() * 1.5 + 1;
          }
        }
      }
      combatCooldownRef.current = Math.max(0, combatCooldownRef.current - delta);
      // Social engagement progression: face the partner for the bounded
      // social pause; end automatically and release the claim.
      if (socialStateRef.current === 'engaged') {
        const partner = socialPartnerRef.current
          ? npcPositionCache.get(socialPartnerRef.current)
          : null;
        if (partner && groupRef.current) {
          groupRef.current.rotation.y = Math.atan2(
            partner.x - groupRef.current.position.x,
            partner.z - groupRef.current.position.z,
          );
        }
        socialTimerRef.current -= delta;
        if (socialTimerRef.current <= 0 || !partner) {
          socialClaims.delete(data.id);
          socialStateRef.current = 'none';
          socialPartnerRef.current = null;
          activityStateRef.current = 'idle';
          activityTimerRef.current = Math.random() * 2 + 1.5 + (staggerOffsetRef.current % 3) * 0.5;
        }
      }
    }

    if (groupRef.current) {
      const baseY = homePosRef.current.y;
      groupRef.current.position.y = baseY + Math.sin(time * 2.5 + data.position[0]) * 0.04;
      // Update shared position tracking for other NPCs' collision checks
      updateNpcPosition(data.id, groupRef.current.position.x, groupRef.current.position.z);
      // Register position for centralized interaction manager
      _tempPos.set(groupRef.current.position.x, groupRef.current.position.y, groupRef.current.position.z);
      registerNpcPosition(data.id, _tempPos);
    }

    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(time * 1.5) * 0.1;
    }

    if (propRef.current) {
      if (data.type === 'researcher') {
        propRef.current.position.y = 1.6 + Math.sin(time * 3) * 0.12;
        propRef.current.rotation.y += delta * 2;
      } else if (data.type === 'merchant') {
        propRef.current.rotation.y = Math.sin(time * 1.2) * 0.08;
      }
    }
  });

  const handleInteract = () => {
    const s = useGameStore.getState();
    if (!s.activeDialogue) {
      s.openDialogueForNpc(data.id);
    }
  };

  const getStyleColors = () => {
    switch (data.type) {
      case 'villager':
        return { body: '#15803d', tunic: '#166534', hat: '#78350f', accent: '#fef08a' };
      case 'merchant':
        return { body: '#b45309', tunic: '#d97706', hat: '#f59e0b', accent: '#fef08a' };
      case 'blacksmith':
        return { body: '#475569', tunic: '#334155', hat: '#1e293b', accent: '#94a3b8' };
      case 'guard':
        return { body: '#0284c7', tunic: '#0369a1', hat: '#e2e8f0', accent: '#38bdf8' };
      case 'researcher':
        return { body: '#7e22ce', tunic: '#6b21a8', hat: '#a855f7', accent: '#c084fc' };
      case 'healer':
        return { body: '#059669', tunic: '#047857', hat: '#d1fae5', accent: '#6ee7b7' };
      default:
        return { body: '#475569', tunic: '#334155', hat: '#1e293b', accent: '#f8fafc' };
    }
  };

  const colors = getStyleColors();

  return (
    <group
      ref={groupRef}
      position={data.position}
      rotation={[0, data.rotationY || 0, 0]}
      onClick={handleInteract}
    >
      {/* Base Ring / Shadow */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[0.8, 0.9, 0.04, 16]} />
        <meshStandardMaterial color="#1e293b" opacity={0.6} transparent />
      </mesh>

      {/* Body / Tunic */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.45, 1.3, 12]} />
        <meshStandardMaterial color={colors.tunic} roughness={0.6} />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 1.75, 0]} castShadow>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#fde047" roughness={0.4} />
      </mesh>

      {/* Eyes */}
      <mesh position={[0.09, 1.8, 0.22]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      <mesh position={[-0.09, 1.8, 0.22]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>

      {/* Hat / Helm */}
      {data.type === 'villager' && (
        <mesh position={[0, 1.95, 0]}>
          <coneGeometry args={[0.35, 0.4, 12]} />
          <meshStandardMaterial color={colors.hat} />
        </mesh>
      )}
      {data.type === 'guard' && (
        <mesh position={[0, 1.9, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.32]} />
          <meshStandardMaterial color={colors.hat} metalness={0.8} roughness={0.2} />
        </mesh>
      )}
      {data.type === 'researcher' && (
        <mesh position={[0, 2.0, 0]}>
          <coneGeometry args={[0.4, 0.6, 12]} />
          <meshStandardMaterial color={colors.hat} />
        </mesh>
      )}
      {data.type === 'healer' && (
        <mesh position={[0, 1.95, 0]}>
          <cylinderGeometry args={[0.3, 0.28, 0.3, 12]} />
          <meshStandardMaterial color={colors.hat} />
        </mesh>
      )}

      {/* Role Prop */}
      {data.type === 'villager' && (
        <mesh position={[0.4, 1.0, 0.2]} rotation={[0, 0, -0.15]}>
          <cylinderGeometry args={[0.03, 0.03, 1.6, 8]} />
          <meshStandardMaterial color="#78350f" />
        </mesh>
      )}
      {data.type === 'guard' && (
        <mesh position={[0.42, 1.2, 0.2]}>
          <cylinderGeometry args={[0.02, 0.03, 2.2, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} />
        </mesh>
      )}
      {data.type === 'blacksmith' && (
        <group position={[-0.5, 0.5, 0.3]}>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.5, 0.4, 0.6]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>
        </group>
      )}
      {data.type === 'merchant' && (
        <group position={[0, 0.4, 0.5]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[1.2, 0.4, 0.5]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          <mesh position={[-0.3, 0.45, 0]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
          <mesh position={[0.3, 0.45, 0]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
        </group>
      )}
      {data.type === 'researcher' && (
        <mesh ref={propRef} position={[0.4, 1.6, 0]}>
          <octahedronGeometry args={[0.16, 2]} />
          <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={2} />
        </mesh>
      )}
      {data.type === 'healer' && (
        <group position={[0.4, 0.8, 0.3]}>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.5, 8]} />
            <meshStandardMaterial color="#059669" />
          </mesh>
          <mesh position={[0, 0.8, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#6ee7b7" emissive="#10b981" emissiveIntensity={1.5} />
          </mesh>
        </group>
      )}

      {/* Overhead Quest Indicator */}
      {questMarker && (
        <Html position={[0, 2.6, 0]} center distanceFactor={10}>
          <div
            onClick={handleInteract}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-sm sm:text-base border-2 shadow-xl cursor-pointer transition-transform hover:scale-125 animate-bounce ${
              questMarker === 'turnIn'
                ? 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-emerald-500/50 scale-110'
                : questMarker === 'available'
                ? 'bg-amber-400 text-amber-950 border-amber-200 shadow-amber-400/50 scale-110'
                : 'bg-slate-700 text-slate-300 border-slate-500'
            }`}
          >
            {questMarker === 'turnIn' ? '?' : questMarker === 'available' ? '!' : '?'}
          </div>
        </Html>
      )}

      {/* Name and Interaction Badge */}
      <Html position={[0, 2.2, 0]} center distanceFactor={12}>
        <div
          onClick={handleInteract}
          className="bg-slate-900/85 text-slate-100 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700/80 shadow-md text-center pointer-events-auto cursor-pointer select-none hover:border-amber-400 transition-colors"
        >
          <div className="text-[11px] font-bold whitespace-nowrap text-amber-300 flex items-center justify-center gap-1">
            <span>{data.name}</span>
          </div>
          <div className="text-[9px] text-slate-400 leading-tight">{data.role}</div>
        </div>
      </Html>
    </group>
  );
}
