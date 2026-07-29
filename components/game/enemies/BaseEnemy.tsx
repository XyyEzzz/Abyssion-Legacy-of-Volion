'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, registerEnemyTarget, unregisterEnemyTarget } from '@/lib/store';
import { EnemyConfig, EnemyState, requestAttackerToken, releaseAttackerToken } from './types';
import { playerRigidBodyRef } from '../Player';

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
  attackPhase: 'windup' | 'active' | 'recovery' | 'none';
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
  config: EnemyConfig;
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

  const [hp, setHp] = useState(config.maxHp);
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

  const lastPosRef = useRef({ x: position[0], y: position[1], z: position[2] });
  const isDeadRef = useRef(false);
  const enemyIdRef = useRef<string>('');

  // Handle Death / Respawn Side Effects
  useEffect(() => {
    if (hp <= 0 && !isDeadRef.current) {
      isDeadRef.current = true;
      setState('death');
      releaseAttackerToken(enemyIdRef.current);

      // Drop Loot
      useGameStore.getState().addLootDrop({
        name: config.lootName || 'Gold Coins',
        type: 'coin',
        x: lastPosRef.current.x,
        y: lastPosRef.current.y + 0.5,
        z: lastPosRef.current.z,
        amount: config.lootAmount || 25,
        color: config.lootColor || '#facc15',
      });

      useGameStore.getState().addNotification(`${config.name} Defeated!`);
      useGameStore.getState().onEnemyKilled(config.name);

      // Respawn timer
      const timer = setTimeout(() => {
        if (rigidBodyRef.current) {
          const sp = spawnPosRef.current;
          rigidBodyRef.current.setTranslation({ x: sp.x, y: sp.y, z: sp.z }, true);
          rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          rigidBodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        }
        setHp(config.maxHp);
        isDeadRef.current = false;
        setState('idle');
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [hp, config]);

  // Target Registration for Combat
  useEffect(() => {
    const id = `enemy_${Math.random().toString(36).substring(2, 9)}`;
    enemyIdRef.current = id;
    registerEnemyTarget({
      id,
      getPosition: () => {
        if (rigidBodyRef.current) {
          const t = rigidBodyRef.current.translation();
          return new THREE.Vector3(t.x, t.y, t.z);
        }
        return spawnPosRef.current.clone();
      },
      takeDamage: (damage, sourcePos, comboStage) => {
        if (isDeadRef.current) return;

        // If enemy is currently dodging (i-frames)
        if (isDodging) {
          const currPos = rigidBodyRef.current ? rigidBodyRef.current.translation() : spawnPosRef.current;
          useGameStore.getState().addDamageNumber(currPos.x, currPos.y + 2.0, currPos.z, 'DODGED!', '#3b82f6');
          return;
        }

        const currentPos = rigidBodyRef.current
          ? rigidBodyRef.current.translation()
          : { x: position[0], y: position[1], z: position[2] };

        lastPosRef.current = currentPos;

        // Knockback vector
        const dir = new THREE.Vector3(currentPos.x - sourcePos.x, 0, currentPos.z - sourcePos.z);
        if (dir.lengthSq() > 0.001) dir.normalize();

        const knockbackImpulse = comboStage === 3 ? 12 : comboStage === 2 ? 7 : 4;
        if (rigidBodyRef.current) {
          rigidBodyRef.current.applyImpulse(
            { x: dir.x * knockbackImpulse, y: 2.5, z: dir.z * knockbackImpulse },
            true
          );
        }

        setHp((prev) => Math.max(0, prev - damage));
        setHitFlash(true);
        setTimeout(() => setHitFlash(false), 150);

        if (state !== 'attack') {
          setState('hurt');
          hurtTimerRef.current = 0.25;
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
          store.triggerHitStop(50);
          store.triggerCameraShake(isCrit ? 0.6 : 0.3);
          store.addHitSpark(currentPos.x, currentPos.y + 1.2, currentPos.z, isCrit ? '#f59e0b' : '#facc15');
        });
      },
    });

    return () => {
      releaseAttackerToken(id);
      unregisterEnemyTarget(id);
    };
  }, [position, config, isDodging, state]);

  // Main FSM Loop
  useFrame((_, delta) => {
    if (!rigidBodyRef.current || isDeadRef.current) return;

    const t = rigidBodyRef.current.translation();
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const pPosArr = useGameStore.getState().player.position;
    const playerPos = new THREE.Vector3(pPosArr[0], pPosArr[1], pPosArr[2]);

    const distToPlayer = pos.distanceTo(playerPos);
    const distToSpawn = pos.distanceTo(spawnPosRef.current);

    // Decrement timers
    if (cooldownTimerRef.current > 0) cooldownTimerRef.current -= delta;

    const ctx: EnemyContext = {
      state,
      setState,
      hp,
      maxHp: config.maxHp,
      hitFlash,
      isDodging,
      setIsDodging,
      position: pos,
      spawnPos: spawnPosRef.current,
      playerPos,
      distToPlayer,
      distToSpawn,
      attackTimer: attackTimerRef.current,
      attackPhase: attackPhaseRef.current,
      rigidBodyRef,
      config,
    };

    // If custom update handles logic, skip default movement/attack handling
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
            const dir = patrolPointRef.current.clone().sub(pos);
            dir.y = 0;
            if (dir.lengthSq() > 0.01) {
              dir.normalize();
              rigidBodyRef.current.setLinvel({ x: dir.x * speed, y: rigidBodyRef.current.linvel().y, z: dir.z * speed }, true);
              if (meshGroupRef.current) {
                const targetRot = Math.atan2(dir.x, dir.z);
                meshGroupRef.current.rotation.y = THREE.MathUtils.lerp(meshGroupRef.current.rotation.y, targetRot, delta * 8);
              }
            }
          }
          break;
        }

        case 'detect': {
          alertTimerRef.current -= delta;
          // Face player
          const dir = playerPos.clone().sub(pos);
          dir.y = 0;
          if (dir.lengthSq() > 0.01 && meshGroupRef.current) {
            meshGroupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
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
              const dir = new THREE.Vector3(targetX - pos.x, 0, targetZ - pos.z);
              if (dir.lengthSq() > 0.01) {
                dir.normalize();
                rigidBodyRef.current.setLinvel({ x: dir.x * config.moveSpeed * 0.6, y: rigidBodyRef.current.linvel().y, z: dir.z * config.moveSpeed * 0.6 }, true);
              }
              break;
            }
          }

          // Move towards player
          const dir = playerPos.clone().sub(pos);
          dir.y = 0;
          if (dir.lengthSq() > 0.01) {
            dir.normalize();
            rigidBodyRef.current.setLinvel({ x: dir.x * config.moveSpeed, y: rigidBodyRef.current.linvel().y, z: dir.z * config.moveSpeed }, true);
            if (meshGroupRef.current) {
              const targetRot = Math.atan2(dir.x, dir.z);
              meshGroupRef.current.rotation.y = THREE.MathUtils.lerp(meshGroupRef.current.rotation.y, targetRot, delta * 10);
            }
          }
          break;
        }

        case 'attack': {
          attackTimerRef.current -= delta;
          // Face player
          const dir = playerPos.clone().sub(pos);
          dir.y = 0;
          if (dir.lengthSq() > 0.01 && meshGroupRef.current) {
            meshGroupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
          }

          if (attackPhaseRef.current === 'windup' && attackTimerRef.current <= 0) {
            attackPhaseRef.current = 'active';
            attackTimerRef.current = 0.2; // Hit active duration

            // Deal standard melee damage if player in range
            if (distToPlayer <= config.attackRange + 0.5) {
              const hitTaken = useGameStore.getState().damagePlayer(config.damage);
              if (hitTaken && config.knockback > 0 && playerRigidBodyRef.current) {
                const kbDir = playerPos.clone().sub(pos).normalize();
                playerRigidBodyRef.current.applyImpulse(
                  { x: kbDir.x * config.knockback, y: 3, z: kbDir.z * config.knockback },
                  true
                );
              }
            }
          } else if (attackPhaseRef.current === 'active' && attackTimerRef.current <= 0) {
            attackPhaseRef.current = 'recovery';
            attackTimerRef.current = config.attackRecovery;
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
          if (hurtTimerRef.current <= 0) {
            setState('chase');
          }
          break;
        }

        case 'returnToSpawn': {
          if (distToSpawn <= 1.0) {
            setHp(config.maxHp);
            idleTimerRef.current = 2.0;
            setState('idle');
          } else {
            const dir = spawnPosRef.current.clone().sub(pos);
            dir.y = 0;
            if (dir.lengthSq() > 0.01) {
              dir.normalize();
              const returnSpeed = config.moveSpeed * 1.5;
              rigidBodyRef.current.setLinvel({ x: dir.x * returnSpeed, y: rigidBodyRef.current.linvel().y, z: dir.z * returnSpeed }, true);
              if (meshGroupRef.current) {
                meshGroupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
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
  });

  const ctxForRender: EnemyContext = {
    state,
    setState,
    hp,
    maxHp: config.maxHp,
    hitFlash,
    isDodging,
    setIsDodging,
    position: new THREE.Vector3(...position),
    spawnPos: new THREE.Vector3(...position),
    playerPos: new THREE.Vector3(),
    distToPlayer: 0,
    distToSpawn: 0,
    attackTimer: 0,
    attackPhase: 'none',
    rigidBodyRef,
    config,
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
                style={{ width: `${(hp / config.maxHp) * 100}%` }}
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
