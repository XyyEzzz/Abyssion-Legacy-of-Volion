'use client';

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyConfig, EnemyProps, requestAttackerToken, releaseAttackerToken } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';

const SLIME_CONFIG: EnemyConfig = {
  name: 'Bouncy Slime',
  maxHp: 60,
  moveSpeed: 1.8,
  patrolSpeed: 1.0,
  detectionRange: 8.0,
  attackRange: 3.2,
  leashRange: 18.0,
  attackCooldown: 4.5,
  attackWindup: 0.9,
  attackRecovery: 1.2,
  damage: 10,
  knockback: 4,
  lootName: 'Apple & Gold',
  lootAmount: 20,
  lootColor: '#ef4444',
  faction: 'slime',
  expReward: 15,
  healingDropId: 'apple',
  healingDropChance: 0.3,
};


export default function SlimeEnemy({ position, name, arenaBounds }: EnemyProps) {
  const config = { ...SLIME_CONFIG, name: name || SLIME_CONFIG.name, ...(arenaBounds ? { arenaBounds } : {}) };
  const meshRef = useRef<THREE.Group>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  
  const [slamPhase, setSlamPhase] = useState<'none' | 'windup' | 'jumping' | 'impact'>('none');
  const jumpTargetRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const leapProgressRef = useRef(0);
  const startPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const shockwaveScaleRef = useRef(0);

  // Custom behavior override for Slime Leap Slam
  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, setState, rigidBodyRef, playerPos, distToPlayer, distToSpawn, enemyId, config, attackTimeoutRef } = ctx;

    if (!rigidBodyRef.current || state === 'death') return false;

    const t = rigidBodyRef.current.translation();
    const currPos = new THREE.Vector3(t.x, t.y, t.z);

    // Expand impact shockwave if active
    if (shockwaveRef.current && shockwaveScaleRef.current > 0) {
      shockwaveScaleRef.current += delta * 12;
      shockwaveRef.current.scale.set(shockwaveScaleRef.current, shockwaveScaleRef.current, 1);
      (shockwaveRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - shockwaveScaleRef.current / 4);
      if (shockwaveScaleRef.current >= 4) {
        shockwaveScaleRef.current = 0;
      }
    }

    if (state === 'attack') {
      if (slamPhase === 'none') {
        setSlamPhase('windup');
        leapProgressRef.current = 0;
        startPosRef.current.copy(currPos);
        jumpTargetRef.current.copy(playerPos);
      }

      if (slamPhase === 'windup') {
        leapProgressRef.current += delta;
        // Squish down visually during windup
        if (meshRef.current) {
          meshRef.current.scale.set(1.4, 0.5, 1.4);
        }
        if (leapProgressRef.current >= config.attackWindup) {
          setSlamPhase('jumping');
          leapProgressRef.current = 0;
        }
        return true;
      }

      if (slamPhase === 'jumping') {
        leapProgressRef.current += delta * 1.8; // Duration ~ 0.55s
        const p = Math.min(1, leapProgressRef.current);

        // Parabolic arc interpolation
        const currentLoc = new THREE.Vector3().lerpVectors(startPosRef.current, jumpTargetRef.current, p);
        const arcHeight = Math.sin(p * Math.PI) * 3.5;
        currentLoc.y = startPosRef.current.y + arcHeight;

        rigidBodyRef.current.setTranslation({ x: currentLoc.x, y: currentLoc.y, z: currentLoc.z }, true);

        // Stretch mesh during leap
        if (meshRef.current) {
          meshRef.current.scale.set(0.7, 1.4, 0.7);
        }

        if (p >= 1) {
          // Slam Impact!
          setSlamPhase('impact');
          shockwaveScaleRef.current = 0.5;
          if (shockwaveRef.current) {
            shockwaveRef.current.position.set(currentLoc.x, currentLoc.y - 0.2, currentLoc.z);
            shockwaveRef.current.visible = true;
          }

          // Check if player in impact zone (radius 3.2m)
          const impactDist = currentLoc.distanceTo(playerPos);
          if (impactDist <= 3.2) {
            const hitTaken = useGameStore.getState().damagePlayer(config.damage);
            if (hitTaken) {
              useGameStore.getState().applyPlayerSlow(1000, 0.6); // 40% slow for 1s
              useGameStore.getState().addNotification('Slowed by Slime Slam!');

              if (playerRigidBodyRef.current) {
                const kbDir = playerPos.clone().sub(currentLoc).normalize();
                guardedPlayerImpulse({ x: kbDir.x * 8, y: 4, z: kbDir.z * 8 });
              }
            }
          }

          // Use the shared attackTimeoutRef so BaseEnemy can clean it up
          // if the component unmounts during the impact phase.
          if (attackTimeoutRef.current) clearTimeout(attackTimeoutRef.current);
          attackTimeoutRef.current = setTimeout(() => {
            attackTimeoutRef.current = null;
            releaseAttackerToken(enemyId);
            setSlamPhase('none');
            setState('chase');
          }, config.attackRecovery * 1000);
        }
        return true;
      }

      if (slamPhase === 'impact') {
        // Flatten on land
        if (meshRef.current) {
          meshRef.current.scale.set(1.5, 0.4, 1.5);
        }
        return true;
      }
    } else {
      if (slamPhase !== 'none') setSlamPhase('none');
      // Bouncy idle/moving scale oscillation
      if (meshRef.current) {
        const velSq = rigidBodyRef.current.linvel();
        const speedSq = velSq.x * velSq.x + velSq.z * velSq.z;
        if (speedSq > 0.1) {
          const bounce = Math.sin(Date.now() * 0.012) * 0.2;
          meshRef.current.scale.set(1 - bounce, 1 + bounce, 1 - bounce);
        } else {
          meshRef.current.scale.set(1, 1, 1);
        }
      }
    }

    return false; // Let default FSM handle standard chase/patrol/idle movement
  };

  const renderMesh = (ctx: EnemyContext) => {
    return (
      <group ref={meshRef}>
        {/* Slime Body */}
        <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
          <sphereGeometry args={[0.7, 16, 16]} />
          <meshStandardMaterial
            color={ctx.hitFlash ? '#ffffff' : '#22c55e'}
            roughness={0.2}
            transparent
            opacity={0.9}
            emissive={ctx.hitFlash ? '#ffffff' : '#15803d'}
            emissiveIntensity={ctx.hitFlash ? 0.9 : 0.2}
          />
        </mesh>

        {/* Cute Eyes */}
        <mesh position={[0.25, 0.8, 0.5]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[-0.25, 0.8, 0.5]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#000000" />
        </mesh>

        {/* Shockwave Ring */}
        <mesh ref={shockwaveRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.5, 0.8, 32]} />
          <meshBasicMaterial color="#4ade80" transparent opacity={0.8} />
        </mesh>
      </group>
    );
  };

  return (
    <BaseEnemy
      position={position}
      config={config}
      customUpdate={handleCustomUpdate}
      renderMesh={renderMesh}
    />
  );
}
