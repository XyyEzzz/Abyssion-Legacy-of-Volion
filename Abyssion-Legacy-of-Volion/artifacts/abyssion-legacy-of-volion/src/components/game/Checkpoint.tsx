'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/lib/store';
import { registerCheckpointPosition, unregisterCheckpointPosition } from './InteractionManager';

interface CheckpointProps {
  position: [number, number, number];
  name?: string;
}

export default function Checkpoint({ position, name = 'Campfire Checkpoint' }: CheckpointProps) {
  const flameMeshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  // Reusable vector for registering position with InteractionManager
  const _cpPos = useRef(new THREE.Vector3(position[0], position[1], position[2])).current;

  const activateCheckpoint = useGameStore((state) => state.activateCheckpoint);
  const checkpointPos = useGameStore((state) => state.player.checkpointPos);

  const isActive = checkpointPos
    ? Math.abs(checkpointPos[0] - position[0]) < 0.5 && Math.abs(checkpointPos[2] - position[2]) < 0.5
    : false;

  // Interaction-cache id, shared by registration and cleanup so the pair can
  // never drift. Registration runs every frame, so the entry must be dropped
  // on unmount (BUG-015) or a removed checkpoint stays interactable.
  const interactId = `cp_${position[0]}_${position[2]}`;
  React.useEffect(() => () => unregisterCheckpointPosition(interactId), [interactId]);

  useFrame((_, delta) => {
    // Animate flame glow
    if (flameMeshRef.current) {
      const pulse = Math.sin(Date.now() * 0.006) * 0.15 + 1;
      flameMeshRef.current.scale.set(pulse, pulse * 1.2, pulse);
    }
    if (lightRef.current) {
      lightRef.current.intensity = isActive ? 3.0 + Math.sin(Date.now() * 0.008) * 0.5 : 1.2;
    }

    // Register checkpoint position for InteractionManager proximity checks
    registerCheckpointPosition(interactId, _cpPos);
  });

  const handleInteract = () => {
    activateCheckpoint(position);
  };

  return (
    <group position={position} onClick={handleInteract}>
      {/* Stone Base Ring */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[1.2, 1.4, 0.2, 12]} />
        <meshStandardMaterial color="#475569" roughness={0.9} />
      </mesh>

      {/* Wooden Logs / Rune Pillars */}
      {Array.from({ length: 5 }).map((_, i) => {
        const angle = (i / 5) * Math.PI * 2;
        const x = Math.cos(angle) * 0.7;
        const z = Math.sin(angle) * 0.7;
        return (
          <mesh key={i} position={[x, 0.25, z]} rotation={[0.2, angle, 0.2]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, 0.6, 6]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
        );
      })}

      {/* Flame / Energy Orb */}
      <mesh ref={flameMeshRef} position={[0, 0.6, 0]}>
        <octahedronGeometry args={[0.35, 2]} />
        <meshStandardMaterial
          color={isActive ? '#f59e0b' : '#38bdf8'}
          emissive={isActive ? '#f59e0b' : '#0284c7'}
          emissiveIntensity={isActive ? 2.5 : 1.2}
          roughness={0.2}
        />
      </mesh>

      {/* Light source */}
      <pointLight
        ref={lightRef}
        position={[0, 0.8, 0]}
        color={isActive ? '#f59e0b' : '#38bdf8'}
        distance={10}
      />

      {/* Floating 3D Badge */}
      <Html position={[0, 1.8, 0]} center distanceFactor={12}>
        <div
          onClick={handleInteract}
          className={`px-3 py-1 rounded-full text-xs font-bold shadow-lg border cursor-pointer transition-all duration-300 flex items-center gap-1.5 whitespace-nowrap ${
            isActive
              ? 'bg-amber-500/90 text-amber-950 border-amber-300 scale-105 animate-pulse'
              : 'bg-slate-900/80 text-sky-300 border-sky-500/50 hover:bg-sky-900/80'
          }`}
        >
          <span>{isActive ? '🔥 Active Checkpoint' : '⛺ Rest Checkpoint'}</span>
        </div>
      </Html>
    </group>
  );
}
