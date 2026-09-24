'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, registerEnemyTarget, unregisterEnemyTarget, enemyTargets } from '@/lib/store';
import { EnemyConfig, EnemyState, EnemyFaction, FACTION_HOSTILITY, requestAttackerToken, releaseAttackerToken, hasAttackerToken, tickEnemyStatuses, isStunned, clearEnemyStatuses, getEnemyStatus } from './types';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';
import { COMBAT_CONFIG as CC } from '@/lib/combatConfig';
import { combatAudio } from '@/lib/combatAudio';

export interface EnemyContext {
  state: EnemyState;
  setState: (s: EnemyState) => void;
  hp: number;
  maxHp: number;
  hitFlash: boolean;
  isDodging: boolean;
  setIsDodging: (d: boolean) => void;
  position: THREE.Vector3;
  spawnPos: THREE.Vector3;
  playerPos: THREE.Vector3;
  distToPlayer: number;
  distToSpawn: number;
  attackTimer: number;
  cooldownTimer: number;
  attackPhase: 'windup' | 'active' | 'recovery' | 'none';
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
  enemyId: string;
  config: EnemyConfig;
  /** Scaled stats from base config + player level. */
  scaledConfig: EnemyConfig;
  /** Ref to store an attack-phase timeout so subcomponents can clean it up. */
  attackTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

interface BaseEnemyProps {
  position: [number, number, number];
  config: EnemyConfig;
  customUpdate?: (ctx: EnemyContext, delta: number) => boolean; // return true if handled movement/attack customly
  renderMesh: (ctx: EnemyContext) => React.ReactNode;
}


export default function BaseEnemy({ position, config, customUpdate, renderMesh }: BaseEnemyProps) {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const meshGroupRef = useRef<THREE.Group>(null);
  const spawnPosRef = useRef(new THREE.Vector3(...position));

  // Compute level-scaled stats from base config + player level
  const playerLevel = useGameStore(s => s.player.level);
  const scaleFactor = 1 + (playerLevel - 1) * 0.08; // 8% per level above 1
  const scaledConfig: EnemyConfig = {
    ...config,
    maxHp: Math.round(config.maxHp * scaleFactor),
    damage: Math.round(config.damage * scaleFactor),
    knockback: config.knockback,
    expReward: Math.round((config.expReward ?? 20) * scaleFactor),
  };

  const [hp, setHp] = useState(scaledConfig.maxHp);
  const [state, setState] = useState<EnemyState>('idle');
  const [hitFlash, setHitFlash] = useState(false);
  const [isDodging, setIsDodging] = useState(false);

  // Timers and State variables
  const idleTimerRef = useRef(1.5);
  const patrolPointRef = useRef(new THREE.Vector3(...position));
  const cooldownTimerRef = useRef(0);
  const attackTimerRef = useRef(0);
  const attackPhaseRef = useRef<'windup' | 'active' | 'recovery' | 'none'>('none');
  const alertTimerRef = useRef(0);
  const hurtTimerRef = useRef(0);
  const staggerTiltRef = useRef(0);

  const lastPosRef = useRef({ x: position[0], y: position[1], z: position[2] });
  const isDeadRef = useRef(false);
  const enemyIdRef = useRef<string>('');
  const respawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hitFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for values accessed inside the registered takeDamage callback.
  // These let us read the latest state without re-registering the target
  // (which would create hit-detection gaps during state transitions).
  const isDodgingRef = useRef(false);
  const stateRef = useRef<EnemyState>('idle');
  const cachedPos = useRef(new THREE.Vector3()).current;

  // Reusable per-frame vectors (avoid GC pressure from repeated allocations)
  const _pos = useRef(new THREE.Vector3()).current;
  const _playerPos = useRef(new THREE.Vector3()).current;
  const _dir = useRef(new THREE.Vector3()).current;

  const _knockbackDir = useRef(new THREE.Vector3()).current;

  // Keep refs in sync with state for the registered callbacks
  useEffect(() => { isDodgingRef.current = isDodging; }, [isDodging]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Handle Death / Respawn Side Effects
  useEffect(() => {
    if (hp <= 0 && !isDeadRef.current) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      isDeadRef.current = true;
      setState('death');
      releaseAttackerToken(enemyIdRef.current);
      clearEnemyStatuses(enemyIdRef.current);

      combatAudio.enemyDeath({ enemyName: config.name, position: [lastPosRef.current.x, lastPosRef.current.y, lastPosRef.current.z] });

      // Drop Loot — coins
      useGameStore.getState().addLootDrop({
        name: config.lootName || 'Gold Coins',
        type: 'coin',
        x: lastPosRef.current.x,
        y: lastPosRef.current.y + 0.5,
        z: lastPosRef.current.z,
        amount: config.lootAmount || 25,
        color: config.lootColor || '#facc15',
      });

      // Grant EXP reward
      const expReward = scaledConfig.expReward ?? 20;
      if (expReward > 0) {
        useGameStore.getState().grantExpReward(expReward);
        useGameStore.getState().addNotification(`+${expReward} EXP`);
      }

      // Optional extra item drop (chance-based, e.g. Thornback Spine).
      // Thornback rule (M1W2D6 #5): 100% one spine, +25% a second spine.
      if (config.extraDropId) {
        const spineDrop = (jitter: number) => useGameStore.getState().addLootDrop({
          name: config.extraDropId as string,
          type: 'material',
          x: lastPosRef.current.x + jitter,
          y: lastPosRef.current.y + 0.5,
          z: lastPosRef.current.z + (Math.random() - 0.5) * 1.2,
          amount: 1,
          color: '#a3a3a3',
        });
        spineDrop((Math.random() - 0.5) * 1.2);
        if (Math.random() < 0.25) spineDrop((Math.random() - 0.5) * 1.2 + 0.3);
      }

      // Drop healing item (chance-based)
      if (config.healingDropId && Math.random() < (config.healingDropChance ?? 0.35)) {
        useGameStore.getState().addLootDrop({
          name: config.healingDropId,
          type: 'material',
          x: lastPosRef.current.x + (Math.random() - 0.5) * 1.5,
          y: lastPosRef.current.y + 0.5,
          z: lastPosRef.current.z + (Math.random() - 0.5) * 1.5,
          amount: 1,
          color: '#22c55e',
        });
      }

      useGameStore.getState().addNotification(`${config.name} Defeated!`);
      // Stable per-instance death id: guarantees the reward exactly-once guard
      // can never double-reward this enemy even if the death effect re-fires.
      const deathId = `${config.name}#${Math.random().toString(36).slice(2, 10)}`;
      useGameStore.getState().onEnemyKilled(config.name, deathId);

      // Respawn timer — read the LATEST scaledConfig from the ref so a
      // player level-up while the enemy is dead does not restore stale HP.
      respawnTimerRef.current = setTimeout(() => {
        respawnTimerRef.current = null;
        if (rigidBodyRef.current) {
          const sp = spawnPosRef.current;
          rigidBodyRef.current.setTranslation({ x: sp.x, y: sp.y, z: sp.z }, true);
          rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          rigidBodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        }
        idleTimerRef.current = 1.5;
        patrolPointRef.current.copy(spawnPosRef.current);
        cooldownTimerRef.current = 0;
        attackTimerRef.current = 0;
        attackPhaseRef.current = 'none';
        alertTimerRef.current = 0;
        hurtTimerRef.current = 0;
        staggerTiltRef.current = 0;
        if (attackTimeoutRef.current) {
          clearTimeout(attackTimeoutRef.current);
          attackTimeoutRef.current = null;
        }
        // Read fresh stats in case the player leveled up while this enemy was dead
        const freshLevel = useGameStore.getState().player.level;
        const freshScale = 1 + (freshLevel - 1) * 0.08;
        const freshMaxHp = Math.round(config.maxHp * freshScale);
        setHp(freshMaxHp);
        setHitFlash(false);
        setIsDodging(false);
        isDeadRef.current = false;
        setState('idle');
      }, 3000);

      return () => {
        if (respawnTimerRef.current) {
          clearTimeout(respawnTimerRef.current);
          respawnTimerRef.current = null;
        }
      };
    }
    return undefined;
  }, [hp, config.maxHp, config.name, config.lootName, config.lootAmount, config.lootColor, scaledConfig.maxHp, scaledConfig.expReward]);

  // Target Registration for Combat
  useEffect(() => {
    const id = `enemy_${Math.random().toString(36).substring(2, 9)}`;
    enemyIdRef.current = id;
    const faction = config.faction ?? 'hostile';
    registerEnemyTarget({
      id,
      faction,
      getPosition: () => {
        if (rigidBodyRef.current) {
          const t = rigidBodyRef.current.translation();
          return cachedPos.set(t.x, t.y, t.z);
        }
        return cachedPos.copy(spawnPosRef.current);
      },
      takeDamage: (damage, sourcePos, comboStage) => {
        if (isDeadRef.current) return false;

        // If enemy is currently dodging (i-frames)
        if (isDodgingRef.current) {
          const currPos = rigidBodyRef.current ? rigidBodyRef.current.translation() : spawnPosRef.current;
          useGameStore.getState().addDamageNumber(currPos.x, currPos.y + 2.0, currPos.z, 'DODGED!', '#3b82f6');
          return false;
        }

        const currentPos = rigidBodyRef.current
          ? rigidBodyRef.current.translation()
          : { x: position[0], y: position[1], z: position[2] };

        lastPosRef.current = currentPos;

        // Knockback vector
        _knockbackDir.set(currentPos.x - sourcePos.x, 0, currentPos.z - sourcePos.z);
        if (_knockbackDir.lengthSq() > 0.001) _knockbackDir.normalize();

        const knockbackImpulse = comboStage === 3 ? CC.knockbackStage3 : comboStage === 2 ? CC.knockbackStage2 : CC.knockbackStage1;
        if (rigidBodyRef.current) {
           // Reset all velocity before applying knockback so residual motion
           // from a prior hit (including vertical lift) cannot compound with
           // stage-2 or stage-3 impulses.
           rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rigidBodyRef.current.applyImpulse(
            { x: _knockbackDir.x * knockbackImpulse, y: CC.knockbackVertical, z: _knockbackDir.z * knockbackImpulse },
            true
          );
        }

        setHp((prev) => Math.max(0, prev - damage));
        setHitFlash(true);
        if (hitFlashRef.current) clearTimeout(hitFlashRef.current);
        hitFlashRef.current = setTimeout(() => { hitFlashRef.current = null; setHitFlash(false); }, CC.hitFlashDurationMs);

        if (stateRef.current !== 'attack') {
          setState('hurt');
          hurtTimerRef.current = CC.staggerDuration;
          staggerTiltRef.current = CC.staggerTiltAngle;
        }

        const isCrit = comboStage === 3;
        queueMicrotask(() => {
          const store = useGameStore.getState();
          store.addDamageNumber(
            currentPos.x + (Math.random() - 0.5) * 0.4,
            currentPos.y + 2.2,
            currentPos.z + (Math.random() - 0.5) * 0.4,
            isCrit ? `CRIT! -${damage}` : `-${damage}`,
            isCrit ? '#f59e0b' : '#ef4444'
          );
        });

        return true;
      },
    });

    return () => {
      releaseAttackerToken(id);
      unregisterEnemyTarget(id);
    };
  }, [
    position[0],
    position[1],
    position[2],
    config.name,
  ]);

  // Cleanup attack-phase and hitFlash timeouts on unmount (prevents memory
  // leaks and stale callbacks firing against unmounted state).
  useEffect(() => {
    return () => {
      if (attackTimeoutRef.current) {
        clearTimeout(attackTimeoutRef.current);
        attackTimeoutRef.current = null;
      }
      if (hitFlashRef.current) {
        clearTimeout(hitFlashRef.current);
        hitFlashRef.current = null;
      }
    };
  }, []);

  // ── Faction-based enemy-vs-enemy damage ───────────────────────
  const factionCooldownRef = useRef(0);

  const dealFactionDamage = () => {
    if (!config.faction) return;
    if (factionCooldownRef.current > 0) return;

    const hostiles = FACTION_HOSTILITY[config.faction];
    if (!hostiles || hostiles.length === 0) return;

    const myPos = rigidBodyRef.current?.translation();
    if (!myPos) return;

    const factionDamage = Math.round(scaledConfig.damage * 0.5);
    const factionRange = config.attackRange + 1.5;

    enemyTargets.forEach((target) => {
      if (target.id === enemyIdRef.current) return;
      // Use the authoritative faction data stored on the target, not ID parsing
      const targetPos = target.getPosition();
      const dist = Math.sqrt(
        (myPos.x - targetPos.x) ** 2 + (myPos.z - targetPos.z) ** 2
      );
      if (dist <= factionRange) {
        const isHostile = target.faction != null && hostiles.includes(target.faction as EnemyFaction);
        if (isHostile) {
          const dir = new THREE.Vector3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
          if (dir.lengthSq() > 0.001) dir.normalize();
          target.takeDamage(factionDamage, new THREE.Vector3(myPos.x, myPos.y, myPos.z), 1);
          factionCooldownRef.current = 2.0; // 2s cooldown between faction hits
        }
      }
    });
  };

  // Main FSM Loop
  useFrame((_, delta) => {
    if (!rigidBodyRef.current || isDeadRef.current) return;

    // ── Status effects (stun / bleeding) — authoritative per-enemy state ──
    const bleedDmg = tickEnemyStatuses(enemyIdRef.current, delta);
    if (bleedDmg > 0) {
      // Bleeding damage bypasses knockback but uses the same HP/damage funnel.
      const cur = rigidBodyRef.current.translation();
      setHp((prev) => Math.max(0, prev - bleedDmg));
      useGameStore.getState().addDamageNumber(cur.x, cur.y + 1.8, cur.z, `Bleed -${bleedDmg}`, '#f87171');
    }
    const stunned = isStunned(enemyIdRef.current);
    if (stunned && stateRef.current !== 'hurt') {
      // Stunned enemies cannot move or attack: release their attacker slot
      // AND leave the attack state, so another enemy can take the freed slot
      // without this one continuing to swing tokenless (swarm leak).
      releaseAttackerToken(enemyIdRef.current);
      if (stateRef.current === 'attack') {
        attackPhaseRef.current = 'none';
        setState('hurt');
      }
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true);
    }
    // Token-ownership validation: if we lost the attacker token while in the
    // attack state (stun/knockback interrupt above), abort the attack. The
    // attacker cap must remain authoritative through the whole attack.
    if (stateRef.current === 'attack' && !hasAttackerToken(enemyIdRef.current)) {
      attackPhaseRef.current = 'none';
      cooldownTimerRef.current = Math.max(cooldownTimerRef.current, 0.4);
      setState('chase');
    }

    const t = rigidBodyRef.current.translation();
    _pos.set(t.x, t.y, t.z);
    const pos = _pos;
    const pPosArr = useGameStore.getState().player.position;
    _playerPos.set(pPosArr[0], pPosArr[1], pPosArr[2]);
    const playerPos = _playerPos;

    const distToPlayer = pos.distanceTo(playerPos);
    const distToSpawn = pos.distanceTo(spawnPosRef.current);

    // ── Pre-movement arena bounds clamp ──────────────────────────
    // Ensure position is inside bounds BEFORE any movement logic runs,
    // so a wolf lunge or chase velocity cannot overshoot in a single frame.
    if (config.arenaBounds && rigidBodyRef.current && state !== 'death') {
      const preT = rigidBodyRef.current.translation();
      const preClampedX = Math.max(config.arenaBounds.minX, Math.min(config.arenaBounds.maxX, preT.x));
      const preClampedZ = Math.max(config.arenaBounds.minZ, Math.min(config.arenaBounds.maxZ, preT.z));
      if (preClampedX !== preT.x || preClampedZ !== preT.z) {
        rigidBodyRef.current.setTranslation({ x: preClampedX, y: preT.y, z: preClampedZ }, true);
        const vel = rigidBodyRef.current.linvel();
        const cX = (preClampedX === config.arenaBounds.minX && vel.x < 0) || (preClampedX === config.arenaBounds.maxX && vel.x > 0) ? 0 : vel.x;
        const cZ = (preClampedZ === config.arenaBounds.minZ && vel.z < 0) || (preClampedZ === config.arenaBounds.maxZ && vel.z > 0) ? 0 : vel.z;
        if (cX !== vel.x || cZ !== vel.z) {
          rigidBodyRef.current.setLinvel({ x: cX, y: vel.y, z: cZ }, true);
        }
        // Re-read position after clamp for correct distance calculations below
        _pos.set(preClampedX, preT.y, preClampedZ);
      }
    }

    // Decrement timers
    if (cooldownTimerRef.current > 0) cooldownTimerRef.current -= delta;
    if (factionCooldownRef.current > 0) factionCooldownRef.current -= delta;

    const ctx: EnemyContext = {
      state,
      setState,
      hp,
      maxHp: scaledConfig.maxHp,
      attackTimeoutRef,
      hitFlash,
      isDodging,
      setIsDodging,
      position: pos,
      spawnPos: spawnPosRef.current,
      playerPos,
      distToPlayer,
      distToSpawn,
      attackTimer: attackTimerRef.current,
      cooldownTimer: cooldownTimerRef.current,
      attackPhase: attackPhaseRef.current,
      rigidBodyRef,
      enemyId: enemyIdRef.current,
      config,
      scaledConfig,
    };

    // If custom update handles logic, skip default movement/attack handling
    if (stunned) {
      // Stun overrides both custom and default behaviour — the enemy is
      // fully disabled (status ticks above already handled damage).
      return;
    }
    const handledCustomly = customUpdate ? customUpdate(ctx, delta) : false;

    if (!handledCustomly) {
      // DEFAULT STATE MACHINE
      switch (state) {
        case 'idle': {
          idleTimerRef.current -= delta;
          if (distToPlayer <= config.detectionRange) {
            setState('detect');
            alertTimerRef.current = 0.4;
          } else if (idleTimerRef.current <= 0) {
            // Pick patrol target
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 5 + 2;
            patrolPointRef.current.set(
              spawnPosRef.current.x + Math.cos(angle) * dist,
              spawnPosRef.current.y,
              spawnPosRef.current.z + Math.sin(angle) * dist
            );
            setState('patrol');
          }
          break;
        }

        case 'patrol': {
          if (distToPlayer <= config.detectionRange) {
            setState('detect');
            alertTimerRef.current = 0.4;
            break;
          }
          const pDist = pos.distanceTo(patrolPointRef.current);
          if (pDist <= 0.8) {
            idleTimerRef.current = Math.random() * 2 + 1;
            setState('idle');
          } else {
            // Move toward patrol point
            const speed = config.patrolSpeed || config.moveSpeed * 0.5;
            _dir.copy(patrolPointRef.current).sub(pos);
            _dir.y = 0;
            if (_dir.lengthSq() > 0.01) {
              _dir.normalize();
              rigidBodyRef.current.setLinvel({ x: _dir.x * speed, y: rigidBodyRef.current.linvel().y, z: _dir.z * speed }, true);
              if (meshGroupRef.current) {
                const targetRot = Math.atan2(_dir.x, _dir.z);
                meshGroupRef.current.rotation.y = THREE.MathUtils.lerp(meshGroupRef.current.rotation.y, targetRot, delta * 8);
              }
            }
          }
          break;
        }

        case 'detect': {
          alertTimerRef.current -= delta;
          // Face player
          _dir.copy(playerPos).sub(pos);
          _dir.y = 0;
          if (_dir.lengthSq() > 0.01 && meshGroupRef.current) {
            meshGroupRef.current.rotation.y = Math.atan2(_dir.x, _dir.z);
          }
          if (alertTimerRef.current <= 0) {
            setState('chase');
          }
          break;
        }

        case 'chase': {
          const leash = config.leashRange || 22;
          if (distToSpawn > leash) {
            releaseAttackerToken(enemyIdRef.current);
            setState('returnToSpawn');
            break;
          }

          if (distToPlayer <= config.attackRange && cooldownTimerRef.current <= 0) {
            if (requestAttackerToken(enemyIdRef.current)) {
              setState('attack');
              attackPhaseRef.current = 'windup';
              attackTimerRef.current = config.attackWindup;
              break;
            } else {
              // Wait / Reposition around player if max active attackers (2) reached
              const circleAngle = (Date.now() / 1000) % (Math.PI * 2);
              const circleRadius = config.attackRange + 1.5;
              const targetX = playerPos.x + Math.cos(circleAngle) * circleRadius;
              const targetZ = playerPos.z + Math.sin(circleAngle) * circleRadius;
              _dir.set(targetX - pos.x, 0, targetZ - pos.z);
              if (_dir.lengthSq() > 0.01) {
                _dir.normalize();
                rigidBodyRef.current.setLinvel({ x: _dir.x * config.moveSpeed * 0.6, y: rigidBodyRef.current.linvel().y, z: _dir.z * config.moveSpeed * 0.6 }, true);
              }
              break;
            }
          }

          // Move towards player
          _dir.copy(playerPos).sub(pos);
          _dir.y = 0;
          if (_dir.lengthSq() > 0.01) {
            _dir.normalize();
            rigidBodyRef.current.setLinvel({ x: _dir.x * config.moveSpeed, y: rigidBodyRef.current.linvel().y, z: _dir.z * config.moveSpeed }, true);
            if (meshGroupRef.current) {
              const targetRot = Math.atan2(_dir.x, _dir.z);
              meshGroupRef.current.rotation.y = THREE.MathUtils.lerp(meshGroupRef.current.rotation.y, targetRot, delta * 10);
            }
          }
          break;
        }

        case 'attack': {
          attackTimerRef.current -= delta;
          // Face player
          _dir.copy(playerPos).sub(pos);
          _dir.y = 0;
          if (_dir.lengthSq() > 0.01 && meshGroupRef.current) {
            meshGroupRef.current.rotation.y = Math.atan2(_dir.x, _dir.z);
          }

          if (attackPhaseRef.current === 'windup' && attackTimerRef.current <= 0) {
            attackPhaseRef.current = 'active';
            attackTimerRef.current = 0.2; // Hit active duration
            dealFactionDamage();

            // Deal standard melee damage if player in range
            if (distToPlayer <= config.attackRange + 0.5) {
              const hitTaken = useGameStore.getState().damagePlayer(scaledConfig.damage);
              if (hitTaken && config.knockback > 0 && playerRigidBodyRef.current) {
                _dir.copy(playerPos).sub(pos).normalize();
                guardedPlayerImpulse({ x: _dir.x * config.knockback, y: 3, z: _dir.z * config.knockback});
              }
            }
          } else          if (attackPhaseRef.current === 'active' && attackTimerRef.current <= 0) {
            attackPhaseRef.current = 'recovery';
            attackTimerRef.current = scaledConfig.attackRecovery;
            dealFactionDamage();
          } else if (attackPhaseRef.current === 'recovery' && attackTimerRef.current <= 0) {
            attackPhaseRef.current = 'none';
            releaseAttackerToken(enemyIdRef.current);
            cooldownTimerRef.current = config.attackCooldown;
            setState('chase');
          }
          break;
        }

        case 'hurt': {
          hurtTimerRef.current -= delta;
          // Recover stagger tilt smoothly
          if (staggerTiltRef.current > 0 && meshGroupRef.current) {
            staggerTiltRef.current = THREE.MathUtils.lerp(staggerTiltRef.current, 0, Math.min(1, delta * 10));
            meshGroupRef.current.rotation.x = staggerTiltRef.current;
          }
          if (hurtTimerRef.current <= 0) {
            if (meshGroupRef.current) meshGroupRef.current.rotation.x = 0;
            setState('chase');
          }
          break;
        }

        case 'returnToSpawn': {
          if (distToSpawn <= 1.0) {
            setHp(scaledConfig.maxHp);
            idleTimerRef.current = 2.0;
            setState('idle');
          } else {
            _dir.copy(spawnPosRef.current).sub(pos);
            _dir.y = 0;
            if (_dir.lengthSq() > 0.01) {
              _dir.normalize();
              const returnSpeed = config.moveSpeed * 1.5;
              rigidBodyRef.current.setLinvel({ x: _dir.x * returnSpeed, y: rigidBodyRef.current.linvel().y, z: _dir.z * returnSpeed }, true);
              if (meshGroupRef.current) {
                meshGroupRef.current.rotation.y = Math.atan2(_dir.x, _dir.z);
              }
            }
          }
          break;
        }

        case 'death':
          // Handled via useEffect
          break;
      }
    }

    // ── Arena bounds clamping ─────────────────────────────────────
    // Prevent enemies from escaping their arena through walls or the entrance gap.
    if (config.arenaBounds && rigidBodyRef.current && state !== 'death') {
      const t2 = rigidBodyRef.current.translation();
      const clampedX = Math.max(config.arenaBounds.minX, Math.min(config.arenaBounds.maxX, t2.x));
      const clampedZ = Math.max(config.arenaBounds.minZ, Math.min(config.arenaBounds.maxZ, t2.z));
      if (clampedX !== t2.x || clampedZ !== t2.z) {
        rigidBodyRef.current.setTranslation({ x: clampedX, y: t2.y, z: clampedZ }, true);
        // Cancel outward velocity to prevent bouncing against the boundary
        const vel = rigidBodyRef.current.linvel();
        const correctedX = (clampedX === config.arenaBounds.minX && vel.x < 0) || (clampedX === config.arenaBounds.maxX && vel.x > 0) ? 0 : vel.x;
        const correctedZ = (clampedZ === config.arenaBounds.minZ && vel.z < 0) || (clampedZ === config.arenaBounds.maxZ && vel.z > 0) ? 0 : vel.z;
        if (correctedX !== vel.x || correctedZ !== vel.z) {
          rigidBodyRef.current.setLinvel({ x: correctedX, y: vel.y, z: correctedZ }, true);
        }
      }
    }
  });

  const _renderPos = useRef(new THREE.Vector3(...position)).current;
  const _renderSpawnPos = useRef(new THREE.Vector3(...position)).current;
  const _renderPlayerPos = useRef(new THREE.Vector3()).current;

  const ctxForRender: EnemyContext = {
    state,
    setState,
    hp,
    maxHp: scaledConfig.maxHp,
    hitFlash,
    isDodging,
    setIsDodging,
    position: _renderPos,
    spawnPos: _renderSpawnPos,
    playerPos: _renderPlayerPos,
    distToPlayer: 0,
    distToSpawn: 0,
    attackTimer: 0,
    cooldownTimer: 0,
    attackPhase: 'none',
    rigidBodyRef,
    enemyId: enemyIdRef.current,
    config,
    scaledConfig,
    attackTimeoutRef,
  };

  return (
    <RigidBody ref={rigidBodyRef} type="dynamic" position={position} mass={4} enabledRotations={[false, false, false]}>
      <group ref={meshGroupRef}>
        {renderMesh(ctxForRender)}
      </group>

      {/* Floating UI: Alert emote + Health Bar */}
      {state !== 'death' && (
        <Html position={[0, 2.5, 0]} center distanceFactor={12}>
          <div className="flex flex-col items-center select-none pointer-events-none">
            {state === 'detect' && (
              <div className="text-red-500 font-black text-2xl animate-bounce drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none mb-1">
                !
              </div>
            )}
            <div className="w-20 h-2 bg-gray-900/80 rounded-full border border-gray-700 overflow-hidden shadow-md">
              <div
                className="h-full bg-red-500 transition-all duration-150"
                style={{ width: `${(hp / scaledConfig.maxHp) * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-white font-bold text-center mt-0.5 drop-shadow">
              {config.name}
            </div>
          </div>
        </Html>
      )}
    </RigidBody>
  );
}
