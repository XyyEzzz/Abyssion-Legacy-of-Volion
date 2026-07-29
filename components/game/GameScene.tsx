'use client';

import { Suspense, useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider, BallCollider, RapierRigidBody } from '@react-three/rapier';
import { KeyboardControls, Environment, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import Player from './Player';
import { useGameStore, registerEnemyTarget, unregisterEnemyTarget } from '@/lib/store';
import SlimeEnemy from './enemies/SlimeEnemy';
import WolfEnemy from './enemies/WolfEnemy';
import BanditEnemy from './enemies/BanditEnemy';
import MageEnemy from './enemies/MageEnemy';
import Checkpoint from './Checkpoint';
import NPC from './NPC';
import { NPCS_DATA } from '@/lib/questData';

interface EnemyDummyProps {
  position: [number, number, number];
  name: string;
  color?: string;
}

function EnemyDummy({ position, name, color = '#ef4444' }: EnemyDummyProps) {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const spawnPosRef = useRef(position);
  const [hp, setHp] = useState(100);
  const maxHp = 100;
  const [hitFlash, setHitFlash] = useState(false);

  const lastPosRef = useRef({ x: position[0], y: position[1], z: position[2] });
  const lastComboStageRef = useRef(1);

  // Handle defeat side effects cleanly in useEffect after render
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
      useGameStore.getState().onEnemyKilled(name);
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
  }, [hp, name]);

  useEffect(() => {
    const id = `dummy_${Math.random().toString(36).substring(2, 9)}`;
    registerEnemyTarget({
      id,
      getPosition: () => {
        if (rigidBodyRef.current) {
          const t = rigidBodyRef.current.translation();
          return new THREE.Vector3(t.x, t.y, t.z);
        }
        return new THREE.Vector3(position[0], position[1], position[2]);
      },
      takeDamage: (damage, sourcePos, comboStage) => {
        const currentPos = rigidBodyRef.current 
          ? rigidBodyRef.current.translation() 
          : { x: position[0], y: position[1], z: position[2] };
        
        lastPosRef.current = currentPos;
        lastComboStageRef.current = comboStage;

        const dir = new THREE.Vector3(currentPos.x - sourcePos.x, 0, currentPos.z - sourcePos.z);
        if (dir.lengthSq() > 0.001) dir.normalize();

        const knockbackForce = comboStage === 3 ? 12 : comboStage === 2 ? 7 : 4;
        if (rigidBodyRef.current) {
          rigidBodyRef.current.applyImpulse({ x: dir.x * knockbackForce, y: 3, z: dir.z * knockbackForce }, true);
        }

        // Pure state update
        setHp((prev) => Math.max(0, prev - damage));

        setHitFlash(true);
        setTimeout(() => setHitFlash(false), 150);

        // Defer damage number store update so DamageNumbers doesn't update synchronously while EnemyDummy is rendering
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
      }
    });

    return () => unregisterEnemyTarget(id);
  }, [position, name]);

  return (
    <RigidBody ref={rigidBodyRef} type="dynamic" position={position} mass={5}>
      <mesh receiveShadow castShadow position={[0, 1, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 2]} />
        <meshStandardMaterial color={hitFlash ? '#ffffff' : color} emissive={hitFlash ? '#ffffff' : '#000000'} emissiveIntensity={hitFlash ? 0.8 : 0} />
      </mesh>
      
      {/* Floating Health Bar */}
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

function DamageNumbers() {
  const damageNumbers = useGameStore(state => state.damageNumbers);

  return (
    <>
      {damageNumbers.map((d) => (
        <Html key={d.id} position={[d.x, d.y, d.z]} center distanceFactor={10}>
          <div 
            className="font-black text-xl sm:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] animate-bounce select-none pointer-events-none"
            style={{ color: d.color }}
          >
            {d.text}
          </div>
        </Html>
      ))}
    </>
  );
}

function LootItem({ loot }: { loot: any }) {
  const collectLootDrop = useGameStore((state) => state.collectLootDrop);
  const collectedRef = useRef(false);

  const handleCollect = () => {
    if (!collectedRef.current) {
      collectedRef.current = true;
      collectLootDrop(loot.id);
    }
  };

  return (
    <RigidBody type="fixed" position={[loot.x, loot.y, loot.z]}>
      <BallCollider 
        args={[1.5]} 
        sensor 
        onIntersectionEnter={() => handleCollect()} 
      />
      <mesh 
        position={[0, 0.4, 0]} 
        onClick={() => handleCollect()}
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={loot.color} emissive={loot.color} emissiveIntensity={0.5} />
      </mesh>
      <Html position={[0, 1, 0]} center distanceFactor={12}>
        <button 
          onClick={() => handleCollect()}
          className="px-2 py-0.5 bg-yellow-500 text-black font-bold text-xs rounded-full shadow-lg border border-yellow-300 hover:scale-110 active:scale-95 transition-transform"
        >
          {loot.name}
        </button>
      </Html>
    </RigidBody>
  );
}

function LootDrops() {
  const lootDrops = useGameStore((state) => state.lootDrops);

  return (
    <>
      {lootDrops.map((loot) => (
        <LootItem key={loot.id} loot={loot} />
      ))}
    </>
  );
}

function HitSparkMesh({ spark }: { spark: { id: string; x: number; y: number; z: number; color: string; createdAt: number } }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = Math.min(1, (Date.now() - spark.createdAt) / 250);
    const scale = 0.5 + elapsed * 1.8;
    groupRef.current.scale.set(scale, scale, scale);
  });

  return (
    <group ref={groupRef} position={[spark.x, spark.y, spark.z]}>
      <mesh>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshBasicMaterial color={spark.color} transparent opacity={0.9} />
      </mesh>
      {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((angle, i) => (
        <mesh key={i} rotation={[0, 0, angle]}>
          <boxGeometry args={[0.7, 0.05, 0.05]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function HitSparks() {
  const hitSparks = useGameStore((state) => state.hitSparks);

  return (
    <group>
      {hitSparks.map((spark) => (
        <HitSparkMesh key={spark.id} spark={spark} />
      ))}
    </group>
  );
}

export default function GameScene() {
  const keyboardMap = useMemo(() => [
    { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
    { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
    { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
    { name: 'right', keys: ['ArrowRight', 'KeyD'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'sprint', keys: ['Shift'] },
    { name: 'attack', keys: ['KeyJ', 'Click'] },
    { name: 'dodge', keys: ['KeyK'] },
    { name: 'interact', keys: ['KeyF'] },
  ], []);

  return (
    <div className="absolute inset-0 z-0">
      <KeyboardControls map={keyboardMap}>
        <Canvas shadows camera={{ position: [0, 5, 10], fov: 60 }}>
          <color attach="background" args={['#87CEEB']} />
          <ambientLight intensity={0.5} />
          <directionalLight
            castShadow
            position={[10, 20, 10]}
            intensity={1.5}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          <Sky sunPosition={[10, 20, 10]} />
          
          <Suspense fallback={null}>
            <Physics>
              <Player />
              
              {/* Checkpoints */}
              <Checkpoint position={[0, 0, 3]} name="Town Haven Checkpoint" />
              <Checkpoint position={[15, 0, -15]} name="Wilderness Outpost Checkpoint" />

              {/* NPCs */}
              {NPCS_DATA.map((npc) => (
                <NPC key={npc.id} data={npc} />
              ))}

              {/* Ancient Ruins Landmark */}
              <group position={[-20, 0, -20]}>
                <RigidBody type="fixed">
                  <mesh position={[0, 3, 0]} castShadow receiveShadow>
                    <cylinderGeometry args={[2, 2.5, 6, 8]} />
                    <meshStandardMaterial color="#475569" roughness={0.8} />
                  </mesh>
                  <mesh position={[-4, 2, -2]} castShadow receiveShadow>
                    <boxGeometry args={[1.5, 4, 1.5]} />
                    <meshStandardMaterial color="#334155" roughness={0.9} />
                  </mesh>
                  <mesh position={[4, 2, 2]} castShadow receiveShadow>
                    <boxGeometry args={[1.5, 4, 1.5]} />
                    <meshStandardMaterial color="#334155" roughness={0.9} />
                  </mesh>
                </RigidBody>
                <Html position={[0, 6.5, 0]} center distanceFactor={15}>
                  <div className="bg-purple-950/80 text-purple-200 border border-purple-500/50 px-2.5 py-1 rounded-lg text-xs font-bold shadow-xl animate-pulse">
                    🏛️ Ancient Ruins
                  </div>
                </Html>
              </group>

              {/* Target Dummies / Enemies */}
              <EnemyDummy position={[0, 0, -8]} name="Training Dummy" color="#ef4444" />
              <SlimeEnemy position={[-8, 0, -5]} name="Bouncy Slime" />
              <WolfEnemy position={[10, 0, -10]} name="Dire Wolf" />
              <BanditEnemy position={[8, 0, 8]} name="Bandit Fighter" />
              <MageEnemy position={[-12, 0, 10]} name="Arcane Mage" />

              {/* World FX */}
              <DamageNumbers />
              <LootDrops />
              <HitSparks />

              {/* Floor */}
              <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[50, 0.5, 50]} position={[0, -0.5, 0]} />
                <mesh position={[0, -0.5, 0]} receiveShadow>
                  <boxGeometry args={[100, 1, 100]} />
                  <meshStandardMaterial color="#4ade80" />
                </mesh>
              </RigidBody>

              {/* Village / Objects */}
              <RigidBody type="fixed" position={[5, 0, -5]}>
                <mesh receiveShadow castShadow position={[0, 2, 0]}>
                  <boxGeometry args={[4, 4, 4]} />
                  <meshStandardMaterial color="#b45309" />
                </mesh>
              </RigidBody>

              <RigidBody type="fixed" position={[-8, 0, -10]}>
                <mesh receiveShadow castShadow position={[0, 1.5, 0]}>
                  <boxGeometry args={[3, 3, 3]} />
                  <meshStandardMaterial color="#b45309" />
                </mesh>
              </RigidBody>

              {/* Walls/Boundaries */}
              <RigidBody type="fixed" position={[0, 0, -50]}>
                <mesh receiveShadow>
                  <boxGeometry args={[100, 10, 1]} />
                  <meshStandardMaterial color="#1e293b" />
                </mesh>
              </RigidBody>
              <RigidBody type="fixed" position={[0, 0, 50]}>
                <mesh receiveShadow>
                  <boxGeometry args={[100, 10, 1]} />
                  <meshStandardMaterial color="#1e293b" />
                </mesh>
              </RigidBody>
              <RigidBody type="fixed" position={[-50, 0, 0]}>
                <mesh receiveShadow>
                  <boxGeometry args={[1, 10, 100]} />
                  <meshStandardMaterial color="#1e293b" />
                </mesh>
              </RigidBody>
              <RigidBody type="fixed" position={[50, 0, 0]}>
                <mesh receiveShadow>
                  <boxGeometry args={[1, 10, 100]} />
                  <meshStandardMaterial color="#1e293b" />
                </mesh>
              </RigidBody>

            </Physics>
          </Suspense>
        </Canvas>
      </KeyboardControls>
    </div>
  );
}
