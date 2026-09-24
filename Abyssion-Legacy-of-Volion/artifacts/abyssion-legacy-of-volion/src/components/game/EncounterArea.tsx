'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/lib/store';
import { ENCOUNTER_CONFIG as EC } from '@/lib/encounterConfig';
import SlimeEnemy from './enemies/SlimeEnemy';
import WolfEnemy from './enemies/WolfEnemy';
import BanditEnemy from './enemies/BanditEnemy';

export default function EncounterArea() {
  const portalRef = useRef<THREE.Mesh>(null);
  const portalLightRef = useRef<THREE.PointLight>(null);
  const portalRotationRef = useRef(0);
  const completedRef = useRef(false);

  const enemyNames = useMemo(
    () => EC.enemies.map((e) => e.name),
    []
  );

  const arenaCenter = useMemo(
    () => new THREE.Vector3(EC.centerX, 0, EC.centerZ),
    []
  );

  const portalWorldPos = useMemo(
    () => new THREE.Vector3(EC.centerX, 0, EC.centerZ + EC.portalZ),
    []
  );

  useFrame((_, delta) => {
    if (portalRef.current) {
      portalRotationRef.current += delta * 2;
      portalRef.current.rotation.z = portalRotationRef.current;
      const pulse = 1 + Math.sin(portalRotationRef.current * 3) * 0.06;
      portalRef.current.scale.set(pulse, pulse, 1);
    }

    if (completedRef.current) return;

    const { encounterDefeats, player, addExp, addNotification, setPlayerHealth } =
      useGameStore.getState();

    const allDefeated = enemyNames.every((n) => encounterDefeats.includes(n));
    if (!allDefeated) return;

    // Check proximity to portal
    const dx = player.position[0] - portalWorldPos.x;
    const dz = player.position[2] - portalWorldPos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq <= EC.portalProximityDist * EC.portalProximityDist) {
      completedRef.current = true;
      addExp(EC.rewardExp);
      setPlayerHealth(player.health); // clamp via setter, no actual change
      addNotification('Encounter Complete! Area Cleared!');
      useGameStore.setState({
        player: { ...player, gold: player.gold + EC.rewardGold },
      });
      addNotification(`+${EC.rewardGold} Gold, +${EC.rewardExp} EXP`);
    }
  });

  const allDefeatedLive = useGameStore((s) =>
    enemyNames.every((n) => s.encounterDefeats.includes(n))
  );

  return (
    <>
    <group position={[EC.centerX, 0, EC.centerZ]}>
      {/* Arena floor */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[EC.floorWidth / 2, 0.5, EC.floorDepth / 2]}
           position={[0, -0.47, 0]}
        />
         <mesh position={[0, -0.47, 0]} receiveShadow>
          <boxGeometry args={[EC.floorWidth, 1, EC.floorDepth]} />
          <meshStandardMaterial color={EC.floorColor} roughness={0.9} />
        </mesh>
      </RigidBody>

      {/* Arena walls (low, visual boundary + collision) */}
      {/* Back wall — solid */}
      <RigidBody type="fixed" position={[0, EC.wallHeight / 2, -EC.floorDepth / 2]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[EC.floorWidth, EC.wallHeight, 0.5]} />
          <meshStandardMaterial color={EC.wallColor} roughness={0.85} />
        </mesh>
      </RigidBody>
      {/* Front wall — split with 4-unit entrance gap in the center */}
      {(() => {
        const gapWidth = 4;
        const segWidth = (EC.floorWidth - gapWidth) / 2;
        const segCenter = (EC.floorWidth + gapWidth) / 4;
        return (
          <>
            <RigidBody type="fixed" position={[-segCenter, EC.wallHeight / 2, EC.floorDepth / 2]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[segWidth, EC.wallHeight, 0.5]} />
                <meshStandardMaterial color={EC.wallColor} roughness={0.85} />
              </mesh>
            </RigidBody>
            <RigidBody type="fixed" position={[segCenter, EC.wallHeight / 2, EC.floorDepth / 2]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[segWidth, EC.wallHeight, 0.5]} />
                <meshStandardMaterial color={EC.wallColor} roughness={0.85} />
              </mesh>
            </RigidBody>
            {/* Entrance gate pillars */}
            <RigidBody type="fixed" position={[-gapWidth / 2, EC.pillarHeight / 2, EC.floorDepth / 2]}>
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[EC.pillarRadius, EC.pillarRadius, EC.pillarHeight, 8]} />
                <meshStandardMaterial color={EC.pillarColor} roughness={0.8} />
              </mesh>
            </RigidBody>
            <RigidBody type="fixed" position={[gapWidth / 2, EC.pillarHeight / 2, EC.floorDepth / 2]}>
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[EC.pillarRadius, EC.pillarRadius, EC.pillarHeight, 8]} />
                <meshStandardMaterial color={EC.pillarColor} roughness={0.8} />
              </mesh>
            </RigidBody>
          </>
        );
      })()}
      <RigidBody type="fixed" position={[-EC.floorWidth / 2, EC.wallHeight / 2, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.5, EC.wallHeight, EC.floorDepth]} />
          <meshStandardMaterial color={EC.wallColor} roughness={0.85} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" position={[EC.floorWidth / 2, EC.wallHeight / 2, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.5, EC.wallHeight, EC.floorDepth]} />
          <meshStandardMaterial color={EC.wallColor} roughness={0.85} />
        </mesh>
      </RigidBody>

      {/* Corner pillars */}
      {[
        [-EC.floorWidth / 2 + 1.5, -EC.floorDepth / 2 + 1.5],
        [EC.floorWidth / 2 - 1.5, -EC.floorDepth / 2 + 1.5],
        [-EC.floorWidth / 2 + 1.5, EC.floorDepth / 2 - 1.5],
        [EC.floorWidth / 2 - 1.5, EC.floorDepth / 2 - 1.5],
      ].map(([px, pz], i) => (
        <RigidBody key={i} type="fixed" position={[px, EC.pillarHeight / 2, pz]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[EC.pillarRadius, EC.pillarRadius, EC.pillarHeight, 8]} />
            <meshStandardMaterial color={EC.pillarColor} roughness={0.8} />
          </mesh>
        </RigidBody>
      ))}

      {/* Entrance marker — glowing strip on the near wall */}
      <mesh position={[0, 0.05, EC.entranceMarkerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 0.3]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.8} />
      </mesh>
    </group>

      {/* Encounter enemies use world-space rigid-body positions so the shared
          enemy FSM compares them correctly with the world-space player. */}
      {/* Arena bounds prevent enemies from escaping through walls or the entrance gap. */}
      <group>
      {EC.enemies.map((enemy) => {
        const worldPosition: [number, number, number] = [
          EC.centerX + enemy.position[0],
          enemy.position[1],
          EC.centerZ + enemy.position[2],
        ];
        const bounds = {
          minX: EC.centerX - EC.floorWidth / 2,
          maxX: EC.centerX + EC.floorWidth / 2,
          minZ: EC.centerZ - EC.floorDepth / 2,
          maxZ: EC.centerZ + EC.floorDepth / 2,
        };
        if (enemy.name.includes('Slime')) {
          return <SlimeEnemy key={enemy.name} position={worldPosition} name={enemy.name} arenaBounds={bounds} />;
        }
        if (enemy.name.includes('Wolf')) {
          return <WolfEnemy key={enemy.name} position={worldPosition} name={enemy.name} arenaBounds={bounds} />;
        }
        return <BanditEnemy key={enemy.name} position={worldPosition} name={enemy.name} arenaBounds={bounds} />;
      })}
      </group>

      {/* Completion portal — visible only when all enemies defeated */}
      <group position={[EC.centerX, 0, EC.centerZ]}>
      {allDefeatedLive && (
        <group position={[0, 1, EC.portalZ]}>
          <mesh ref={portalRef}>
            <torusGeometry args={[EC.portalRadius, 0.15, 16, 32]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#0ea5e9"
              emissiveIntensity={1.2}
              transparent
              opacity={0.85}
            />
          </mesh>
          <mesh rotation={[0, 0, 0]}>
            <circleGeometry args={[EC.portalRadius - 0.1, 32]} />
            <meshBasicMaterial color="#0ea5e9" transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
          <pointLight
            ref={portalLightRef}
            color="#38bdf8"
            intensity={3}
            distance={8}
          />
          <Html position={[0, 2.5, 0]} center distanceFactor={12}>
            <div className="bg-sky-950/90 text-sky-200 border border-sky-500/60 px-3 py-1.5 rounded-lg text-sm font-bold shadow-xl animate-pulse whitespace-nowrap">
              Enter to Complete
            </div>
          </Html>
        </group>
      )}

      {/* Area label — level derived from authoritative arena state */}
      <Html position={[0, 5, -EC.floorDepth / 2]} center distanceFactor={15}>
        <div className="bg-gray-950/80 text-amber-200 border border-amber-600/40 px-3 py-1 rounded-lg text-xs font-bold shadow-xl">
          Trial Arena · Lv {useGameStore((s) => s.arena.level)}
        </div>
      </Html>
      </group>
    </>
  );
}
