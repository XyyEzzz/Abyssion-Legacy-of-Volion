'use client';

import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyConfig, EnemyProps, requestAttackerToken, releaseAttackerToken } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';

const WOLF_CONFIG: EnemyConfig = {
  name: 'Dire Wolf',
  maxHp: 75,
  moveSpeed: 4.2,
  patrolSpeed: 1.8,
  detectionRange: 10.0,
  attackRange: 2.8,
  leashRange: 20.0,
  attackCooldown: 3.5,
  attackWindup: 0.5,
  attackRecovery: 0.8,
  damage: 14,
  knockback: 4,
  lootName: 'Bread & Gold',
  lootAmount: 25,
  lootColor: '#f97316',
};

export default function WolfEnemy({ position, name }: EnemyProps) {
  const config = { ...WOLF_CONFIG, name: name || WOLF_CONFIG.name };
  const wolfGroupRef = useRef<THREE.Group>(null);

  // States: 'chase' -> 'circling' -> 'lunge' -> 'reposition'
  const [wolfPhase, setWolfPhase] = useState<'none' | 'circling' | 'lunge' | 'reposition'>('none');
  const circleTimerRef = useRef(0);
  const circleAngleRef = useRef(0);
  const lungeDirRef = useRef(new THREE.Vector3());
  const lungeTimerRef = useRef(0);

  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, setState, rigidBodyRef, playerPos, distToPlayer, distToSpawn, config } = ctx;

    if (!rigidBodyRef.current || state === 'death') return false;

    const t = rigidBodyRef.current.translation();
    const currPos = new THREE.Vector3(t.x, t.y, t.z);

    if (state === 'chase') {
      // If close to player and not currently circling/lunging, start circling!
      if (distToPlayer <= 5.0 && wolfPhase === 'none') {
        setWolfPhase('circling');
        circleTimerRef.current = 1.5 + Math.random() * 0.8; // Circle for 1.5 - 2.3s
        circleAngleRef.current = Math.atan2(currPos.z - playerPos.z, currPos.x - playerPos.x);
      }

      if (wolfPhase === 'circling') {
        circleTimerRef.current -= delta;
        circleAngleRef.current += delta * 2.2; // Orbit around player

        const targetRadius = 3.8;
        const targetX = playerPos.x + Math.cos(circleAngleRef.current) * targetRadius;
        const targetZ = playerPos.z + Math.sin(circleAngleRef.current) * targetRadius;

        const moveDir = new THREE.Vector3(targetX - currPos.x, 0, targetZ - currPos.z);
        if (moveDir.lengthSq() > 0.01) {
          moveDir.normalize();
          rigidBodyRef.current.setLinvel(
            { x: moveDir.x * config.moveSpeed, y: rigidBodyRef.current.linvel().y, z: moveDir.z * config.moveSpeed },
            true
          );

          // Face player while circling
          if (wolfGroupRef.current) {
            const faceDir = playerPos.clone().sub(currPos);
            wolfGroupRef.current.rotation.y = Math.atan2(faceDir.x, faceDir.z);
          }
        }

        if (circleTimerRef.current <= 0) {
          // Check if attacker token available
          if (requestAttackerToken('wolf_attacker')) {
            setWolfPhase('lunge');
            setState('attack');
            lungeTimerRef.current = 0.45;
            lungeDirRef.current = playerPos.clone().sub(currPos).normalize();
            lungeDirRef.current.y = 0;
          } else {
            // Keep circling if max active attackers reached
            circleTimerRef.current = 0.8;
          }
        }

        return true;
      }
    }

    if (state === 'attack') {
      if (wolfPhase === 'lunge') {
        lungeTimerRef.current -= delta;

        // Dash forward
        const dashSpeed = 10.0;
        rigidBodyRef.current.setLinvel(
          { x: lungeDirRef.current.x * dashSpeed, y: rigidBodyRef.current.linvel().y, z: lungeDirRef.current.z * dashSpeed },
          true
        );

        if (wolfGroupRef.current) {
          wolfGroupRef.current.rotation.y = Math.atan2(lungeDirRef.current.x, lungeDirRef.current.z);
        }

        // Hit check
        if (distToPlayer <= 2.2) {
          const hitTaken = useGameStore.getState().damagePlayer(config.damage);
          if (hitTaken && playerRigidBodyRef.current) {
            playerRigidBodyRef.current.applyImpulse(
              { x: lungeDirRef.current.x * config.knockback, y: 3, z: lungeDirRef.current.z * config.knockback },
              true
            );
          }
        }

        if (lungeTimerRef.current <= 0) {
          // Reposition phase (back away)
          setWolfPhase('reposition');
          lungeTimerRef.current = 0.5;
        }
        return true;
      }

      if (wolfPhase === 'reposition') {
        lungeTimerRef.current -= delta;

        // Dash backwards
        const backSpeed = -5.0;
        rigidBodyRef.current.setLinvel(
          { x: lungeDirRef.current.x * backSpeed, y: rigidBodyRef.current.linvel().y, z: lungeDirRef.current.z * backSpeed },
          true
        );

        if (lungeTimerRef.current <= 0) {
          releaseAttackerToken('wolf_attacker');
          setWolfPhase('none');
          setState('chase');
        }
        return true;
      }
    }

    if (state !== 'chase' && state !== 'attack') {
      if (wolfPhase !== 'none') setWolfPhase('none');
    }

    return false;
  };

  const renderMesh = (ctx: EnemyContext) => {
    return (
      <group ref={wolfGroupRef} position={[0, 0.4, 0]}>
        {/* Main Body */}
        <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[0.7, 0.7, 1.4]} />
          <meshStandardMaterial color={ctx.hitFlash ? '#ffffff' : '#334155'} />
        </mesh>

        {/* Wolf Head */}
        <mesh castShadow position={[0, 0.7, 0.8]}>
          <boxGeometry args={[0.5, 0.5, 0.6]} />
          <meshStandardMaterial color={ctx.hitFlash ? '#ffffff' : '#1e293b'} />
        </mesh>

        {/* Snout */}
        <mesh castShadow position={[0, 0.6, 1.2]}>
          <boxGeometry args={[0.3, 0.3, 0.4]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>

        {/* Glowing Red Eyes */}
        <mesh position={[0.15, 0.8, 1.0]}>
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} />
        </mesh>
        <mesh position={[-0.15, 0.8, 1.0]}>
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} />
        </mesh>

        {/* Ears */}
        <mesh position={[0.2, 1.05, 0.7]} rotation={[0.2, 0, 0]}>
          <coneGeometry args={[0.12, 0.3, 4]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[-0.2, 1.05, 0.7]} rotation={[0.2, 0, 0]}>
          <coneGeometry args={[0.12, 0.3, 4]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>

        {/* Tail */}
        <mesh position={[0, 0.5, -0.9]} rotation={[-0.5, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.15, 0.8]} />
          <meshStandardMaterial color="#1e293b" />
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
