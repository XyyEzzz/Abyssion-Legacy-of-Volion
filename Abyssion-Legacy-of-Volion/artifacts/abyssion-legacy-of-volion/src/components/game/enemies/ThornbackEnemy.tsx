'use client';

/**
 * Thornback (M1W2D6 #5 — P1). Ground melee creature built on the existing
 * BaseEnemy architecture. Adds one custom behaviour on top of the shared
 * state machine: a medium-range charge with wind-up, travel, damage, and a
 * 5s cooldown. All movement goes through the authoritative rigid body —
 * no teleporting, no rubber-banding, no new framework.
 *
 * Stats (exact per spec):
 *   HP 80 · melee damage 8 · charge damage 14 · speed 2.2
 *   detection 10 · melee range 1.6 · charge distance 4 · charge cooldown 5
 *
 * Drops: 100% chance 1 Thornback Spine, +25% chance 1 additional spine.
 */

import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyConfig, EnemyProps } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';

const THORNBACK_CONFIG: EnemyConfig = {
  name: 'Thornback',
  maxHp: 80,
  moveSpeed: 2.2,
  patrolSpeed: 1.1,
  detectionRange: 10.0,
  attackRange: 1.6,
  attackCooldown: 2.5,
  attackWindup: 0.4,
  attackRecovery: 0.6,
  damage: 8,
  knockback: 3,
  faction: 'thornback',
  expReward: 22,
  extraDropId: 'thornback_spine', // 100% one spine; BaseEnemy adds the +25% second
};

// Charge behaviour constants (exact per spec).
const CHARGE = {
  triggerRangeMin: 3.0, // medium distance band start
  triggerRangeMax: 7.0, // medium distance band end
  distance: 4, // maximum charge travel
  speed: 7.5, // travel speed during the charge
  windup: 0.5, // short wind-up before the charge
  cooldown: 5, // seconds between charges
  hitRadius: 1.4, // collision range during the charge
} as const;


export default function ThornbackEnemy({ position, name, arenaBounds }: EnemyProps) {
  const config = {
    ...THORNBACK_CONFIG,
    name: name || THORNBACK_CONFIG.name,
    ...(arenaBounds ? { arenaBounds } : {}),
  };
  const groupRef = useRef<THREE.Group>(null);

  // Custom phases layered over the base state machine: 'none' = default
  // (BaseEnemy owns idle/patrol/chase/melee), 'windup'/'charge'/'recover' =
  // the charge sequence.
  const [phase, setPhase] = useState<'none' | 'windup' | 'charge' | 'recover'>('none');
  const phaseTimerRef = useRef(0);
  const chargeCooldownRef = useRef(0);
  const chargeDirRef = useRef(new THREE.Vector3());
  const chargeTraveledRef = useRef(0);
  const chargeHitRef = useRef(false);

  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, setState, rigidBodyRef, playerPos, distToPlayer, enemyId } = ctx;
    if (!rigidBodyRef.current || state === 'death') return false;

    const t = rigidBodyRef.current.translation();

    // Tick charge cooldown regardless of phase.
    if (chargeCooldownRef.current > 0) {
      chargeCooldownRef.current = Math.max(0, chargeCooldownRef.current - delta);
    }

    // Leaving chase/attack (stun/hurt/leash/death) cancels any charge cleanly.
    if (state !== 'chase' && state !== 'attack') {
      if (phase !== 'none') {
        setPhase('none');
        chargeTraveledRef.current = 0;
        chargeHitRef.current = false;
      }
      return false;
    }

    // Start a charge: medium band, off cooldown, currently just chasing.
    if (
      phase === 'none' &&
      state === 'chase' &&
      chargeCooldownRef.current <= 0 &&
      distToPlayer >= CHARGE.triggerRangeMin &&
      distToPlayer <= CHARGE.triggerRangeMax
    ) {
      setPhase('windup');
      phaseTimerRef.current = CHARGE.windup;
      chargeDirRef.current.set(playerPos.x - t.x, 0, playerPos.z - t.z).normalize();
      chargeTraveledRef.current = 0;
      chargeHitRef.current = false;
      return true;
    }

    if (phase === 'windup') {
      // Plant in place and face the charge direction.
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true);
      if (groupRef.current) {
        groupRef.current.rotation.y = Math.atan2(chargeDirRef.current.x, chargeDirRef.current.z);
      }
      phaseTimerRef.current -= delta;
      if (phaseTimerRef.current <= 0) {
        setPhase('charge');
        setState('attack');
      }
      return true;
    }

    if (phase === 'charge') {
      // Move directly along the locked charge direction through the rigid body.
      const step = CHARGE.speed * delta;
      chargeTraveledRef.current += step;
      rigidBodyRef.current.setLinvel(
        { x: chargeDirRef.current.x * CHARGE.speed, y: rigidBodyRef.current.linvel().y, z: chargeDirRef.current.z * CHARGE.speed },
        true
      );
      if (groupRef.current) {
        groupRef.current.rotation.y = Math.atan2(chargeDirRef.current.x, chargeDirRef.current.z);
      }

      // Collision with the player: authoritative damage through damagePlayer.
      if (!chargeHitRef.current && distToPlayer <= CHARGE.hitRadius) {
        chargeHitRef.current = true;
        const hitTaken = useGameStore.getState().damagePlayer(14);
        if (hitTaken && playerRigidBodyRef.current) {
          guardedPlayerImpulse({ x: chargeDirRef.current.x * 6, y: 2.5, z: chargeDirRef.current.z * 6});
        }
      }

      // End conditions: hit the player, travelled max distance, or overshot.
      if (chargeHitRef.current || chargeTraveledRef.current >= CHARGE.distance) {
        setPhase('recover');
        phaseTimerRef.current = 0.6;
        rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true);
      }
      return true;
    }

    if (phase === 'recover') {
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true);
      phaseTimerRef.current -= delta;
      if (phaseTimerRef.current <= 0) {
        chargeCooldownRef.current = CHARGE.cooldown;
        setPhase('none');
        setState('chase');
      }
      return true;
    }

    return false; // BaseEnemy handles idle/patrol/detect/chase/melee
  };

  const renderMesh = (ctx: EnemyContext) => (
    <group ref={groupRef} position={[0, 0.4, 0]}>
      {/* Armoured carapace body */}
      <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[1.0, 0.7, 1.3]} />
        <meshStandardMaterial color={ctx.hitFlash ? '#ffffff' : '#4d3a2a'} roughness={0.85} />
      </mesh>
      {/* Spiked ridge — the "thornback" silhouette */}
      {[-0.45, -0.15, 0.15, 0.45].map((z, i) => (
        <mesh key={i} position={[0, 0.85, z]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.09, 0.3, 4]} />
          <meshStandardMaterial color="#2c2016" roughness={0.9} />
        </mesh>
      ))}
      {/* Head */}
      <mesh castShadow position={[0, 0.45, 0.85]}>
        <boxGeometry args={[0.6, 0.45, 0.5]} />
        <meshStandardMaterial color={ctx.hitFlash ? '#ffffff' : '#3a2b1d'} roughness={0.85} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.16, 0.6, 1.05]}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[-0.16, 0.6, 1.05]}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={1.2} />
      </mesh>
      {/* Sturdy legs */}
      {[[0.5, 0.4], [-0.5, 0.4], [0.5, -0.4], [-0.5, -0.4]].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.1, z]}>
          <boxGeometry args={[0.18, 0.35, 0.18]} />
          <meshStandardMaterial color="#2c2016" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );

  return (
    <BaseEnemy
      position={position}
      config={config}
      customUpdate={handleCustomUpdate}
      renderMesh={renderMesh}
    />
  );
}
