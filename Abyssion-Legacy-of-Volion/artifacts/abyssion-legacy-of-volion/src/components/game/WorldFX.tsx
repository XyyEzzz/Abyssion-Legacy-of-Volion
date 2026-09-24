'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, BallCollider } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/lib/store';
import { COMBAT_CONFIG as CC } from '@/lib/combatConfig';

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
    const elapsed = Math.min(1, (Date.now() - spark.createdAt) / CC.hitSparkDurationMs);
    const scale = 0.5 + elapsed * (CC.hitSparkScaleMax - 0.5);
    groupRef.current.scale.set(scale, scale, scale);
    const opacity = 0.9 * (1 - elapsed);
    groupRef.current.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.MeshBasicMaterial).opacity = opacity;
      }
    });
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

function SlashParticleMesh({ particle }: { particle: { id: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; color: string; size: number; createdAt: number; lifetime: number } }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!meshRef.current) return;
    const elapsed = (Date.now() - particle.createdAt) / 1000;
    const t = elapsed / particle.lifetime;
    if (t >= 1) return;
    meshRef.current.position.x = particle.x + particle.vx * elapsed;
    meshRef.current.position.y = particle.y + particle.vy * elapsed - 0.5 * 9.8 * elapsed * elapsed;
    meshRef.current.position.z = particle.z + particle.vz * elapsed;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 1 - t;
    const scale = 1 - t * 0.5;
    meshRef.current.scale.set(scale, scale, scale);
  });
  return (
    <mesh ref={meshRef} position={[particle.x, particle.y, particle.z]}>
      <boxGeometry args={[particle.size, particle.size, particle.size]} />
      <meshBasicMaterial color={particle.color} transparent opacity={1} depthWrite={false} />
    </mesh>
  );
}

function SlashParticles() {
  const slashParticles = useGameStore((state) => state.slashParticles);
  return (
    <group>
      {slashParticles.map((p) => (
        <SlashParticleMesh key={p.id} particle={p} />
      ))}
    </group>
  );
}

export default function WorldFX() {
  return (
    <>
      <DamageNumbers />
      <LootDrops />
      <HitSparks />
      <SlashParticles />
    </>
  );
}
