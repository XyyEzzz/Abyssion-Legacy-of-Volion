'use client';

import { useRef, useState, useEffect } from 'react';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, registerEnemyTarget, unregisterEnemyTarget } from '@/lib/store';
import { COMBAT_CONFIG as CC } from '@/lib/combatConfig';

interface EnemyDummyProps {
  position: [number, number, number];
  name: string;
  color?: string;
}

export default function EnemyDummy({ position, name, color = '#ef4444' }: EnemyDummyProps) {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const spawnPosRef = useRef(position);
  const [hp, setHp] = useState(100);
  const maxHp = 100;
  const [hitFlash, setHitFlash] = useState(false);

  const lastPosRef = useRef({ x: position[0], y: position[1], z: position[2] });
  const lastComboStageRef = useRef(1);
  const hitFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const _cachedPos = useRef(new THREE.Vector3()).current;

  useEffect(() => {
    if (hp <= 0) {
      useGameStore.getState().addLootDrop({
        name: 'Gold Coins',
        type: 'coin',
        x: lastPosRef.current.x,
        y: lastPosRef.current.y + 0.5,
        z: lastPosRef.current.z,
        amount: 25 * lastComboStageRef.current,
        color: '#facc15'
      });
      useGameStore.getState().addNotification(`${name} Defeated!`);
      useGameStore.getState().onEnemyKilled(
        name,
        `${name}#${Math.random().toString(36).slice(2, 10)}`,
      );
      const timer = setTimeout(() => {
        if (rigidBodyRef.current) {
          const [sx, sy, sz] = spawnPosRef.current;
          rigidBodyRef.current.setTranslation({ x: sx, y: sy, z: sz }, true);
          rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          rigidBodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        }
        setHp(100);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [hp, name]);

  useEffect(() => {
    const id = `dummy_${Math.random().toString(36).substring(2, 9)}`;
    const dummyFaction = name.includes(' Friendly') ? 'friendly' : 'hostile';
    registerEnemyTarget({
      id,
      faction: dummyFaction,
      getPosition: () => {
        if (rigidBodyRef.current) {
          const t = rigidBodyRef.current.translation();
          return _cachedPos.set(t.x, t.y, t.z);
        }
        return _cachedPos.set(position[0], position[1], position[2]);
      },
      takeDamage: (damage, sourcePos, comboStage) => {
        const currentPos = rigidBodyRef.current
          ? rigidBodyRef.current.translation()
          : { x: position[0], y: position[1], z: position[2] };

        lastPosRef.current = currentPos;
        lastComboStageRef.current = comboStage;

        // Dummy is stationary — no knockback impulse applied

        setHp((prev) => Math.max(0, prev - damage));

        setHitFlash(true);
        if (hitFlashRef.current) clearTimeout(hitFlashRef.current);
        hitFlashRef.current = setTimeout(() => { hitFlashRef.current = null; setHitFlash(false); }, CC.hitFlashDurationMs);

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
      }
    });

    return () => {
      unregisterEnemyTarget(id);
      if (hitFlashRef.current) { clearTimeout(hitFlashRef.current); hitFlashRef.current = null; }
    };
  }, [position, name]);

  return (
    <RigidBody ref={rigidBodyRef} type="kinematicPosition" position={position} mass={5}>
      <mesh receiveShadow castShadow position={[0, 1, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 2]} />
        <meshStandardMaterial color={hitFlash ? '#ffffff' : color} emissive={hitFlash ? '#ffffff' : '#000000'} emissiveIntensity={hitFlash ? 0.8 : 0} />
      </mesh>

      <Html position={[0, 2.4, 0]} center distanceFactor={12}>
        <div className="w-20 h-2 bg-gray-900/80 rounded-full border border-gray-700 overflow-hidden shadow-md">
          <div
            className="h-full bg-red-500 transition-all duration-150"
            style={{ width: `${(hp / maxHp) * 100}%` }}
          />
        </div>
        <div className="text-[10px] text-white font-bold text-center mt-0.5 drop-shadow select-none pointer-events-none">{name}</div>
      </Html>
    </RigidBody>
  );
}
