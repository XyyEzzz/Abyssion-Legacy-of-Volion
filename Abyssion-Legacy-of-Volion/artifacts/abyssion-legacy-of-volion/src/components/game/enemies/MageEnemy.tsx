'use client';

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyConfig, EnemyProps, requestAttackerToken, releaseAttackerToken, hasAttackerToken } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';

const MAGE_CONFIG: EnemyConfig = {
  name: 'Arcane Mage',
  maxHp: 80,
  moveSpeed: 2.5,
  patrolSpeed: 1.2,
  detectionRange: 11.0,
  attackRange: 8.5,
  leashRange: 20.0,
  attackCooldown: 4.0,
  attackWindup: 1.2,
  attackRecovery: 0.8,
  damage: 20,
  knockback: 6,
  lootName: 'Health Potion & Gold',
  lootAmount: 40,
  lootColor: '#a855f7',
  faction: 'mage',
  expReward: 35,
  healingDropId: 'health_potion',
  healingDropChance: 0.25,
};

interface Projectile {
  id: string;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  life: number;
}

const _playerPos = new THREE.Vector3();
const _currPos = new THREE.Vector3();
const _dirToPlayer = new THREE.Vector3();
const _awayDir = new THREE.Vector3();
const _sideDir = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _flyDir = new THREE.Vector3();
const _kbDir = new THREE.Vector3();


export default function MageEnemy({ position, name }: EnemyProps) {
  const config = { ...MAGE_CONFIG, name: name || MAGE_CONFIG.name };
  const mageMeshRef = useRef<THREE.Group>(null);
  const staffOrbRef = useRef<THREE.Mesh>(null);
  const explosionMeshRef = useRef<THREE.Mesh>(null);

  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const explosionRef = useRef<{ pos: THREE.Vector3; scale: number; opacity: number } | null>(null);

  const castTimerRef = useRef(0);
  const isCastingRef = useRef(false);
  const strafeDirRef = useRef(1);
  const currentPosRef = useRef(new THREE.Vector3(position[0], position[1], position[2]));

  // Animate active magic projectiles
  useFrame((_, delta) => {
    // Animate exploding shockwave if active (ref-driven, no React re-render)
    if (explosionRef.current && explosionMeshRef.current) {
      const exp = explosionRef.current;
      exp.scale += delta * 12;
      exp.opacity = Math.max(0, exp.opacity - delta * 2.5);
      if (exp.opacity <= 0) {
        explosionRef.current = null;
        explosionMeshRef.current.visible = false;
      } else {
        explosionMeshRef.current.visible = true;
        explosionMeshRef.current.scale.setScalar(exp.scale);
        (explosionMeshRef.current.material as THREE.MeshStandardMaterial).opacity = exp.opacity;
        explosionMeshRef.current.position.set(
          exp.pos.x - currentPosRef.current.x,
          exp.pos.y - currentPosRef.current.y,
          exp.pos.z - currentPosRef.current.z,
        );
      }
    }

    if (projectiles.length === 0) return;

    const pPosArr = useGameStore.getState().player.position;
    const playerPos = _playerPos.set(pPosArr[0], pPosArr[1] + 1.0, pPosArr[2]);

    setProjectiles((prev) => {
      const next: Projectile[] = [];

      for (const p of prev) {
        p.life -= delta;
        p.pos.addScaledVector(p.dir, p.speed * delta);

        // Collision check with player
        const distToPlayer = p.pos.distanceTo(playerPos);
        const hitGround = p.pos.y <= 0.3;

        if (distToPlayer <= 2.2 || hitGround || p.life <= 0) {
          // Explode!
          explosionRef.current = { pos: p.pos.clone(), scale: 0.8, opacity: 1.0 };

          if (distToPlayer <= 2.8) {
            const hitTaken = useGameStore.getState().damagePlayer(config.damage);
            if (hitTaken && playerRigidBodyRef.current) {
              const kbDir = _kbDir.copy(playerPos).sub(p.pos).normalize();
              guardedPlayerImpulse({ x: kbDir.x * config.knockback, y: 4, z: kbDir.z * config.knockback});
            }
          }
        } else {
          next.push(p);
        }
      }

      return next;
    });
  });

  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, setState, rigidBodyRef, playerPos, distToPlayer, config } = ctx;

    if (!rigidBodyRef.current || state === 'death') return false;

    const t = rigidBodyRef.current.translation();
    const currPos = _currPos.set(t.x, t.y, t.z);
    currentPosRef.current.copy(currPos);

    // Glow staff orb
    if (staffOrbRef.current) {
      const glow = (Math.sin(Date.now() * 0.008) + 1) * 0.5;
      (staffOrbRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + glow * 1.5;
    }

    // Handle Kiting / Distance Maintenance during Chase
    if (state === 'chase') {
      const preferredMinDist = 5.5;
      const preferredMaxDist = 9.0;

      // Face player
      const dirToPlayer = _dirToPlayer.copy(playerPos).sub(currPos);
      dirToPlayer.y = 0;
      if (dirToPlayer.lengthSq() > 0.01 && mageMeshRef.current) {
        mageMeshRef.current.rotation.y = Math.atan2(dirToPlayer.x, dirToPlayer.z);
      }

      // If in attack range and cooldown ready, let the base FSM handle the
      // attack transition — but only when an attacker token is available, so
      // multiple mages cannot bombard simultaneously (engagement limit).
      if (distToPlayer <= config.attackRange && ctx.cooldownTimer <= 0) {
        if (!requestAttackerToken(ctx.enemyId)) {
          // No slot: hold position and maintain spacing instead of attacking.
          return true;
        }
        return false;
      }

      // If player is too close (< 5.5m), backstep away!
      if (distToPlayer < preferredMinDist) {
        const awayDir = _awayDir.copy(currPos).sub(playerPos).normalize();
        awayDir.y = 0;
        rigidBodyRef.current.setLinvel(
          { x: awayDir.x * config.moveSpeed, y: rigidBodyRef.current.linvel().y, z: awayDir.z * config.moveSpeed },
          true
        );
        return true;
      }

      // If in ideal range (5.5m - 9.0m), strafe side-to-side!
      if (distToPlayer >= preferredMinDist && distToPlayer <= preferredMaxDist) {
        if (Math.random() < 0.02) strafeDirRef.current *= -1; // Randomly flip strafe direction
        const sideDir = _sideDir.set(-dirToPlayer.z * strafeDirRef.current, 0, dirToPlayer.x * strafeDirRef.current).normalize();

        rigidBodyRef.current.setLinvel(
          { x: sideDir.x * (config.moveSpeed * 0.7), y: rigidBodyRef.current.linvel().y, z: sideDir.z * (config.moveSpeed * 0.7) },
          true
        );
        return true;
      }
    }

    // Handle Spell Casting Attack
    if (state === 'attack') {
      // Token-ownership validation: an interrupted cast (stun/hurt released
      // the token) aborts instead of continuing to bombard tokenless.
      if (!hasAttackerToken(ctx.enemyId)) {
        isCastingRef.current = false;
        setState('chase');
        return true;
      }
      castTimerRef.current -= delta;

      // Face player while casting
      const dirToPlayer = _dirToPlayer.copy(playerPos).sub(currPos);
      dirToPlayer.y = 0;
      if (dirToPlayer.lengthSq() > 0.01 && mageMeshRef.current) {
        mageMeshRef.current.rotation.y = Math.atan2(dirToPlayer.x, dirToPlayer.z);
      }

      // Stop moving completely while casting spell!
      rigidBodyRef.current.setLinvel(
        { x: 0, y: rigidBodyRef.current.linvel().y, z: 0 },
        true
      );

      if (!isCastingRef.current) {
        isCastingRef.current = true;
        castTimerRef.current = config.attackWindup;
      } else if (castTimerRef.current <= 0) {
        // Spawn Magic Projectile (slow 8.0 m/s speed, readable telegraph)
        const spawnPos = _spawnPos.copy(currPos);
        spawnPos.y += 1.6;
        const flyDir = _flyDir.copy(playerPos);
        flyDir.y += 0.8;
        flyDir.sub(spawnPos).normalize();

        setProjectiles((prev) => [
          ...prev,
          {
            id: `proj_${Math.random().toString(36).substring(2, 9)}`,
            pos: spawnPos.clone(),
            dir: flyDir.clone(),
            speed: 8.0,
            life: 3.5,
          },
        ]);

        isCastingRef.current = false;
        releaseAttackerToken(ctx.enemyId);
        setState('chase');
      }
      return true;
    }

    return false;
  };

  const renderMesh = (ctx: EnemyContext) => {
    return (
      <group ref={mageMeshRef}>
        {/* Robe Body */}
        <mesh castShadow position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.3, 0.6, 1.4, 12]} />
          <meshStandardMaterial color={ctx.hitFlash ? '#ffffff' : '#581c87'} />
        </mesh>

        {/* Caster Hood/Head */}
        <mesh castShadow position={[0, 1.7, 0]}>
          <sphereGeometry args={[0.25, 12, 12]} />
          <meshStandardMaterial color="#3b0764" />
        </mesh>

        {/* Wizard Hat */}
        <mesh position={[0, 2.1, 0]} rotation={[0.2, 0, 0]}>
          <coneGeometry args={[0.4, 0.8, 12]} />
          <meshStandardMaterial color="#3b0764" />
        </mesh>

        {/* Magic Staff */}
        <group position={[0.4, 1.0, 0.2]}>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.8]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          {/* Staff Orb */}
          <mesh ref={staffOrbRef} position={[0, 0.95, 0]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={1.2} />
          </mesh>
        </group>

        {/* Flying Magic Projectiles — offset by current physics position, not spawn position */}
        {projectiles.map((p) => (
          <mesh key={p.id} position={[p.pos.x - currentPosRef.current.x, p.pos.y - currentPosRef.current.y, p.pos.z - currentPosRef.current.z]}>
            <sphereGeometry args={[0.35, 12, 12]} />
            <meshStandardMaterial color="#d8b4fe" emissive="#c084fc" emissiveIntensity={2.0} />
            <pointLight color="#a855f7" intensity={2} distance={5} />
          </mesh>
        ))}

        {/* Explosion Shockwave Effect — animated via ref, no per-frame React state */}
        <mesh ref={explosionMeshRef} visible={false}>
          <sphereGeometry args={[1.5, 16, 16]} />
          <meshStandardMaterial color="#a855f7" transparent opacity={0} emissive="#c084fc" emissiveIntensity={1.5} />
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
