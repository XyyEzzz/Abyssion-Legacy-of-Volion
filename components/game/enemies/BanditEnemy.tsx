'use client';

import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyConfig, EnemyProps, requestAttackerToken, releaseAttackerToken } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';

const BANDIT_CONFIG: EnemyConfig = {
  name: 'Bandit Fighter',
  maxHp: 90,
  moveSpeed: 3.5,
  patrolSpeed: 1.8,
  detectionRange: 9.0,
  attackRange: 2.2,
  leashRange: 20.0,
  attackCooldown: 3.5,
  attackWindup: 0.4,
  attackRecovery: 0.6,
  damage: 12,
  knockback: 4,
  lootName: 'Small Potion & Gold',
  lootAmount: 30,
  lootColor: '#38bdf8',
};

export default function BanditEnemy({ position, name }: EnemyProps) {
  const config = { ...BANDIT_CONFIG, name: name || BANDIT_CONFIG.name };
  const banditMeshRef = useRef<THREE.Group>(null);
  const swordRef = useRef<THREE.Group>(null);

  const [comboStage, setComboStage] = useState<0 | 1 | 2>(0);
  const comboTimerRef = useRef(0);
  const dodgeTimerRef = useRef(0);
  const dodgeCooldownRef = useRef(0);
  const dodgeDirRef = useRef(new THREE.Vector3());

  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, setState, rigidBodyRef, playerPos, distToPlayer, setIsDodging, isDodging, config } = ctx;

    if (!rigidBodyRef.current || state === 'death') return false;

    const t = rigidBodyRef.current.translation();
    const currPos = new THREE.Vector3(t.x, t.y, t.z);

    if (dodgeCooldownRef.current > 0) dodgeCooldownRef.current -= delta;

    // Handle Active Dodge Roll
    if (isDodging) {
      dodgeTimerRef.current -= delta;

      // Sideways dodge velocity
      const rollSpeed = 10.0;
      rigidBodyRef.current.setLinvel(
        { x: dodgeDirRef.current.x * rollSpeed, y: rigidBodyRef.current.linvel().y, z: dodgeDirRef.current.z * rollSpeed },
        true
      );

      // Rotate mesh during roll
      if (banditMeshRef.current) {
        banditMeshRef.current.rotation.z += delta * 15;
      }

      if (dodgeTimerRef.current <= 0) {
        setIsDodging(false);
        if (banditMeshRef.current) banditMeshRef.current.rotation.z = 0;
      }
      return true;
    }

    // Trigger Dodge Roll if player is close or attacking and dodge off cooldown
    if ((state === 'chase' || state === 'attack') && dodgeCooldownRef.current <= 0 && distToPlayer <= 3.8) {
      const isPlayerAttacking = useGameStore.getState().player.isAttacking;
      const shouldDodge = isPlayerAttacking || Math.random() < 0.25;

      if (shouldDodge) {
        setIsDodging(true);
        dodgeTimerRef.current = 0.45;
        dodgeCooldownRef.current = 6.0; // 6 seconds dodge cooldown (occasional dodge)

        // Pick perpendicular direction to player
        const toPlayer = playerPos.clone().sub(currPos).normalize();
        toPlayer.y = 0;
        const side = Math.random() < 0.5 ? 1 : -1;
        dodgeDirRef.current = new THREE.Vector3(-toPlayer.z * side, 0, toPlayer.x * side).normalize();

        useGameStore.getState().addNotification('Bandit Dodge Roll!');
        return true;
      }
    }

    // Handle Attack Combos
    if (state === 'attack') {
      comboTimerRef.current -= delta;

      // Face player
      const dir = playerPos.clone().sub(currPos);
      dir.y = 0;
      if (dir.lengthSq() > 0.01 && banditMeshRef.current) {
        banditMeshRef.current.rotation.y = Math.atan2(dir.x, dir.z);
      }

      // Combo Stage 1
      if (comboStage === 0) {
        setComboStage(1);
        comboTimerRef.current = 0.3; // Slash 1 duration

        // Animate Sword Slash 1
        if (swordRef.current) swordRef.current.rotation.y = Math.PI / 2;

        if (distToPlayer <= config.attackRange) {
          const hitTaken = useGameStore.getState().damagePlayer(config.damage);
          if (hitTaken && playerRigidBodyRef.current) {
            const kbDir = playerPos.clone().sub(currPos).normalize();
            playerRigidBodyRef.current.applyImpulse({ x: kbDir.x * 4, y: 2, z: kbDir.z * 4 }, true);
          }
        }
        return true;
      }

      // Combo Stage 2 (Secondary Strike)
      if (comboStage === 1 && comboTimerRef.current <= 0) {
        setComboStage(2);
        comboTimerRef.current = 0.35; // Slash 2 duration

        // Animate Sword Slash 2
        if (swordRef.current) swordRef.current.rotation.y = -Math.PI / 2;

        if (distToPlayer <= config.attackRange) {
          const hitTaken = useGameStore.getState().damagePlayer(config.damage + 8); // Extra damage on combo finish!
          if (hitTaken && playerRigidBodyRef.current) {
            const kbDir = playerPos.clone().sub(currPos).normalize();
            playerRigidBodyRef.current.applyImpulse({ x: kbDir.x * 7, y: 3, z: kbDir.z * 7 }, true);
          }
        }
        return true;
      }

      if (comboStage === 2 && comboTimerRef.current <= 0) {
        setComboStage(0);
        if (swordRef.current) swordRef.current.rotation.y = 0;
        setState('chase');
      }

      return true;
    }

    return false;
  };

  const renderMesh = (ctx: EnemyContext) => {
    return (
      <group ref={banditMeshRef}>
        {/* Humanoid Torso */}
        <mesh castShadow position={[0, 1.0, 0]}>
          <boxGeometry args={[0.6, 0.9, 0.4]} />
          <meshStandardMaterial color={ctx.hitFlash ? '#ffffff' : '#b91c1c'} />
        </mesh>

        {/* Head with Red Bandana */}
        <mesh castShadow position={[0, 1.65, 0]}>
          <sphereGeometry args={[0.25, 12, 12]} />
          <meshStandardMaterial color="#fca5a5" />
        </mesh>
        <mesh position={[0, 1.72, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.1, 12]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>

        {/* Sword Arm & Sword */}
        <group ref={swordRef} position={[0.4, 1.0, 0.2]}>
          {/* Arm */}
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.2, 0.6, 0.2]} />
            <meshStandardMaterial color="#b91c1c" />
          </mesh>
          {/* Iron Sword */}
          <mesh position={[0, -0.1, 0.6]} rotation={[Math.PI / 3, 0, 0]}>
            <boxGeometry args={[0.06, 0.08, 1.1]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
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
