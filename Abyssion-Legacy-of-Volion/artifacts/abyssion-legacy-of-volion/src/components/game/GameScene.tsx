'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { KeyboardControls, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import Player, { playerRigidBodyRef } from './Player';
import { useGameStore } from '@/lib/store';
import SlimeEnemy from './enemies/SlimeEnemy';
import WolfEnemy from './enemies/WolfEnemy';
import BanditEnemy from './enemies/BanditEnemy';
import MageEnemy from './enemies/MageEnemy';
import ThornbackEnemy from './enemies/ThornbackEnemy';
import Checkpoint from './Checkpoint';
import NPC from './NPC';
import InteractionManager from './InteractionManager';
import { NPCS_DATA } from '@/lib/questData';
import EncounterArea from './EncounterArea';
import EnemyDummy from './EnemyDummy';
import { useFrame } from '@react-three/fiber';
import { useEffect } from 'react';

/** ── Outdoor house (P2.3): four walls + separate sloped roof with overhang,
 *    door opening, two windows, entrance path. Wall and roof are separate
 *    geometry groups with distinct materials. NOT a single cuboid. ── */
function VillageHouse({
  position,
  wallColor = '#b45309',
  scale = 1,
}: {
  position: [number, number, number];
  wallColor?: string;
  scale?: number;
}) {
  const W = 3 * scale;   // width (x)
  const D = 3 * scale;   // depth (z)
  const H = 2.8 * scale; // wall height
  const T = 0.15;        // wall thickness
  const DOOR_W = 0.9 * scale;
  const doorOffset = W / 2 - DOOR_W / 2; // door on the +z wall, off-centre
  return (
    <group position={position}>
      {/* Entrance access path (ground-level, no collision) */}
      <mesh position={[0, 0.011, D / 2 + 0.9]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.4 * scale, 1.8 * scale]} />
        <meshStandardMaterial color="#a3a37a" roughness={1} />
      </mesh>
      {/* Four walls — front wall built from segments so the door opening is real */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2, H / 2, T / 2]} position={[0, H / 2, -D / 2]} />
        <CuboidCollider args={[T / 2, H / 2, D / 2]} position={[-W / 2, H / 2, 0]} />
        <CuboidCollider args={[T / 2, H / 2, D / 2]} position={[W / 2, H / 2, 0]} />
        {/* Front (+z): two segments around the door gap + header above the door */}
        <CuboidCollider args={[doorOffset / 2, H / 2, T / 2]} position={[-(W / 2 - doorOffset / 2), H / 2, D / 2]} />
        <CuboidCollider args={[doorOffset / 2, H / 2, T / 2]} position={[W / 2 - doorOffset / 2, H / 2, D / 2]} />
        <CuboidCollider args={[DOOR_W, (H - 1.9 * scale) / 2, T / 2]} position={[doorOffset, 1.9 * scale + (H - 1.9 * scale) / 2, D / 2]} />
      </RigidBody>
      <group>
        <mesh position={[0, H / 2, -D / 2]} castShadow receiveShadow>
          <boxGeometry args={[W, H, T]} />
          <meshStandardMaterial color={wallColor} roughness={0.9} />
        </mesh>
        <mesh position={[-W / 2, H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[T, H, D]} />
          <meshStandardMaterial color={wallColor} roughness={0.9} />
        </mesh>
        <mesh position={[W / 2, H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[T, H, D]} />
          <meshStandardMaterial color={wallColor} roughness={0.9} />
        </mesh>
        {/* Front wall segments + door header */}
        <mesh position={[-(W / 2 - doorOffset / 2), H / 2, D / 2]} castShadow receiveShadow>
          <boxGeometry args={[doorOffset, H, T]} />
          <meshStandardMaterial color={wallColor} roughness={0.9} />
        </mesh>
        <mesh position={[W / 2 - doorOffset / 2, H / 2, D / 2]} castShadow receiveShadow>
          <boxGeometry args={[doorOffset, H, T]} />
          <meshStandardMaterial color={wallColor} roughness={0.9} />
        </mesh>
        <mesh position={[doorOffset, 1.9 * scale + (H - 1.9 * scale) / 2, D / 2]} castShadow receiveShadow>
          <boxGeometry args={[DOOR_W, H - 1.9 * scale, T]} />
          <meshStandardMaterial color={wallColor} roughness={0.9} />
        </mesh>
        {/* Two windows (front + side), slightly inset frames — separate material */}
        <mesh position={[-W / 4, H * 0.62, D / 2 + 0.01]} castShadow>
          <boxGeometry args={[0.5 * scale, 0.5 * scale, 0.05]} />
          <meshStandardMaterial color="#1e293b" emissive="#38bdf8" emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
        <mesh position={[W / 2 + 0.01, H * 0.62, -D / 4]} castShadow>
          <boxGeometry args={[0.05, 0.5 * scale, 0.5 * scale]} />
          <meshStandardMaterial color="#1e293b" emissive="#38bdf8" emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
      </group>
      {/* Separate sloped roof with visible overhang (4-sided pyramid)
          — its own geometry group + material, extending past the walls. */}
      <group>
        <mesh position={[0, H + 0.55 * scale, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[W * 0.95, 1.1 * scale, 4]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

/** House interior door sensor: when the player steps into the entrance zone,
 *  triggers the exterior→interior transition (one-shot until they leave). */
function HouseDoorSensor({
  doorPos,
  interiorId,
  radius = 1.6,
}: {
  doorPos: [number, number, number];
  interiorId: string;
  radius?: number;
}) {
  const armedRef = useRef(true);
  useFrame(() => {
    const t = readPlayerBody();
    if (!t) return;
    const dx = t.x - doorPos[0];
    const dz = t.z - doorPos[2];
    const inside = dx * dx + dz * dz <= radius * radius;
    const s = useGameStore.getState();
    if (inside && armedRef.current && !s.houseInterior && !s.activeDialogue && s.gamePhase === 'playing') {
      armedRef.current = false;
      s.enterHouseInterior(interiorId);
    } else if (!inside && !armedRef.current) {
      armedRef.current = true;
    }
  });
  return null;
}

/** Interior exit zone: stepping into it returns to the exterior world. */
function ExitDoorZone({ exitPos, radius = 1.2 }: { exitPos: [number, number, number]; radius?: number }) {
  const armedRef = useRef(true);
  useFrame(() => {
    const t = readPlayerBody();
    if (!t) return;
    const dx = t.x - exitPos[0];
    const dz = t.z - exitPos[2];
    const inside = dx * dx + dz * dz <= radius * radius;
    const s = useGameStore.getState();
    if (inside && armedRef.current && s.houseInterior) {
      armedRef.current = false;
      s.exitHouseInterior();
    } else if (!inside && !armedRef.current) {
      armedRef.current = true;
    }
  });
  return null;
}

/** Exterior→interior transition: teleports the player body to the interior
 *  spawn point once per armed press. */
function InteriorTeleporter({ target }: { target: [number, number, number] }) {
  const prevInteriorRef = useRef<string | null>(null);
  useFrame(() => {
    const s = useGameStore.getState();
    if (prevInteriorRef.current === null && s.houseInterior !== null) {
      teleportPlayerBody(target);
    }
    prevInteriorRef.current = s.houseInterior;
  });
  return null;
}


/** P0 lifecycle-safe read of the shared player rigid body. A destroyed Rapier
 *  body throws from Rust; when that happens we clear the stale ref so it can
 *  never be read again, and report the body as unavailable this frame. */
function readPlayerBody(): { x: number; y: number; z: number } | null {
  const body = playerRigidBodyRef.current;
  if (!body) return null;
  try {
    return body.translation();
  } catch {
    // Body was destroyed between mount and this frame — drop the stale ref.
    playerRigidBodyRef.current = null;
    return null;
  }
}

/** P0 lifecycle-safe WRITE to the shared player rigid body (same contract as
 *  readPlayerBody): existence check first, and if the underlying Rapier body
 *  was destroyed before the call, the throw is absorbed only to drop the
 *  stale ref so it can never be read or written again. */
function teleportPlayerBody(target: [number, number, number]): void {
  const body = playerRigidBodyRef.current;
  if (!body) return;
  try {
    body.setTranslation({ x: target[0], y: target[1], z: target[2] }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  } catch {
    // Body was destroyed between the ref check and the call — drop the stale
    // ref instead of surfacing a Rust null-pointer error.
    playerRigidBodyRef.current = null;
  }
}

/** Arrow Bundle world pickup (M1W2D6 #5): spawns one bundle into the loot
 *  system per session while the crossbow exists in the world economy. Uses
 *  the existing loot-drop collection path — no second pickup system. */
function ArrowBundlePickup({ position }: { position: [number, number, number] }) {
  const spawnRef = useRef(false);
  useFrame(() => {
    const s = useGameStore.getState();
    if (spawnRef.current) return;
    if (s.gamePhase === 'playing') {
      spawnRef.current = true;
      s.addLootDrop({
        name: 'Arrow Bundle',
        type: 'material',
        x: position[0],
        y: position[1] + 0.5,
        z: position[2],
        amount: 1,
        color: '#d6b370',
      });
    }
  });
  return null;
}

/** Simple tree component */
function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <RigidBody type="fixed">
      <group position={position} scale={[scale, scale, scale]}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <coneGeometry args={[0.8, 2.5, 8]} />
          <meshStandardMaterial color="#166534" />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.2, 0.6, 6]} />
          <meshStandardMaterial color="#78350f" />
        </mesh>
      </group>
    </RigidBody>
  );
}

/** Simple rock component */
function Rock({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <RigidBody type="fixed">
      <mesh position={position} castShadow scale={[scale, scale, scale]}>
        <dodecahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}

/** Dead tree for wilderness */
function DeadTree({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody type="fixed">
      <group position={position}>
        <mesh position={[0, 0.8, 0]} rotation={[0, 0, 0.15]} castShadow>
          <cylinderGeometry args={[0.08, 0.15, 1.6, 6]} />
          <meshStandardMaterial color="#451a03" />
        </mesh>
        <mesh position={[0.3, 1.2, 0]} rotation={[0, 0, -0.4]} castShadow>
          <cylinderGeometry args={[0.04, 0.06, 0.8, 5]} />
          <meshStandardMaterial color="#451a03" />
        </mesh>
        <mesh position={[-0.2, 1.4, 0.1]} rotation={[0, 0, 0.3]} castShadow>
          <cylinderGeometry args={[0.03, 0.05, 0.6, 5]} />
          <meshStandardMaterial color="#451a03" />
        </mesh>
      </group>
    </RigidBody>
  );
}

export default function GameScene() {
  const worldPaused = useGameStore((state) => state.ui.showSettings || state.ui.showInventory || state.hudEditMode);
  const houseInterior = useGameStore((state) => state.houseInterior);
  const shadowsEnabled = useGameStore((state) => state.settings.shadows);
  // WebGL support gate: R3F's root.configure() creates the WebGLRenderer with no
  // try/catch. When context creation throws (e.g. no GPU/software GL), the root's
  // internal `pending` promise never resolves, the reconciler never mounts the
  // Canvas subtree, and the world silently never exists — NPCs, interaction
  // prompts, movement all dead while the 2D HUD keeps rendering. Detect that
  // condition up front and fail loudly instead.
  const [webglSupported] = useState(() => {
    if (typeof document === 'undefined') return true;
    try {
      // A bare getContext('webgl') probe can succeed while R3F's actual
      // WebGLRenderer construction fails (it needs a working GL context with
      // shader compilation). When that happened the world silently never
      // mounted — NPCs, prompts, movement all dead. Probe with the real thing.
      const test = document.createElement('canvas');
      const gl = test.getContext('webgl2') || test.getContext('webgl');
      if (!gl) return false;
      const shader = gl.createShader(gl.VERTEX_SHADER);
      if (!shader) return false;
      gl.shaderSource(shader, 'void main() { gl_Position = vec4(0.0); }');
      gl.compileShader(shader);
      const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      gl.deleteShader(shader);
      return ok;
    } catch {
      return false;
    }
  });
  const keyboardMap = useMemo(() => [
    { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
    { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
    { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
    { name: 'right', keys: ['ArrowRight', 'KeyD'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'sprint', keys: ['Shift'] },
    { name: 'attack', keys: ['KeyJ'] },
    { name: 'dodge', keys: ['KeyK'] },
    // Skill keys Z/X/C — shared by Water Staff (Z Waterball, X Waterslicer,
    // C Waterbullet) and Sword (Z Fatamorgana, X Dozens of Slashes).
    { name: 'skill1', keys: ['KeyZ'] },
    { name: 'skill2', keys: ['KeyX'] },
    { name: 'skill3', keys: ['KeyC'] },
    { name: 'skill4', keys: ['KeyV'] }, // Core special ultimate (V — Resonant Overdrive)
    { name: 'skill5', keys: ['KeyF'] }, // Core movement skill (F — Echo Step)
  ], []);

  return (
    <div className="absolute inset-0 z-0">
      {!webglSupported ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center p-8">
          <h2 className="text-xl font-bold text-amber-300 mb-3">WebGL Unavailable</h2>
          <p className="text-sm text-gray-400 max-w-md">
            Abyssion needs WebGL to render its 3D world. Enable hardware acceleration
            in your browser settings or try a different browser, then reload.
          </p>
        </div>
      ) : (
      <KeyboardControls map={keyboardMap}>
        <Canvas shadows={shadowsEnabled} dpr={[1, 1.5]} camera={{ position: [0, 5, 10], fov: 60 }} frameloop={worldPaused ? 'never' : 'always'}>
          <color attach="background" args={['#87CEEB']} />
          <ambientLight intensity={0.5} />
          <directionalLight
            castShadow={shadowsEnabled}
            position={[10, 20, 10]}
            intensity={1.5}
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          <Sky sunPosition={[10, 20, 10]} />

          <Suspense fallback={null}>
            <Physics>
              <Player />

              {/* ═══════════════════════════════════════════════════════
                  CHECKPOINTS — Spawn 1: Village center, Spawn 2: Wilderness entrance
                  ═══════════════════════════════════════════════════════ */}
              <InteractionManager />
              <Checkpoint position={[0, 0, 0]} name="Village Haven" />
              <Checkpoint position={[0, 0, -18]} name="Wilderness Entrance" />

              {/* ═══════════════════════════════════════════════════════
                  NPCs — Settlement cluster
                  ═══════════════════════════════════════════════════════ */}
              {NPCS_DATA.map((npc) => (
                <NPC key={npc.id} data={npc} />
              ))}

              {/* ═══════════════════════════════════════════════════════
                  SETTLEMENT STRUCTURES
                  ═══════════════════════════════════════════════════════ */}

              {/* Marcus — Market Stall (east side) */}
              <RigidBody type="fixed" position={[6, 0, 2]}>
                <group>
                  <mesh position={[0, 2.5, 0]} castShadow>
                    <boxGeometry args={[2.5, 0.15, 2]} />
                    <meshStandardMaterial color="#78350f" />
                  </mesh>
                  {[[-1.1, 1.3, 0.8],[1.1, 1.3, 0.8],[-1.1, 1.3, -0.8],[1.1, 1.3, -0.8]].map(([x,y,z],i) => (
                    <mesh key={i} position={[x,y,z]} castShadow>
                      <cylinderGeometry args={[0.04, 0.04, 2.5, 8]} />
                      <meshStandardMaterial color="#92400e" />
                    </mesh>
                  ))}
                  <mesh position={[0, 0.5, 1]} castShadow>
                    <boxGeometry args={[2.5, 0.8, 0.3]} />
                    <meshStandardMaterial color="#78350f" />
                  </mesh>
                </group>
              </RigidBody>

              {/* Garrick — Forge (west side) */}
              <RigidBody type="fixed" position={[-6, 0, 3]}>
                <group>
                  <mesh position={[0, 0.4, 0]} castShadow>
                    <boxGeometry args={[0.5, 0.4, 0.4]} />
                    <meshStandardMaterial color="#475569" metalness={0.8} />
                  </mesh>
                  <mesh position={[0.8, 0.3, 0.5]} castShadow>
                    <boxGeometry args={[0.6, 0.5, 0.6]} />
                    <meshStandardMaterial color="#334155" />
                  </mesh>
                  <mesh position={[0.8, 0.6, 0.5]}>
                    <sphereGeometry args={[0.2, 8, 8]} />
                    <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
                  </mesh>
                </group>
              </RigidBody>

              {/* Hektor — Guard Post (south edge) */}
              <RigidBody type="fixed" position={[3, 0, -6]}>
                <group>
                  <mesh position={[0, 0.8, 0]} castShadow>
                    <boxGeometry args={[0.6, 1.6, 0.6]} />
                    <meshStandardMaterial color="#1e3a8a" />
                  </mesh>
                  <mesh position={[0, 1.7, 0]} castShadow>
                    <boxGeometry args={[0.8, 0.1, 0.8]} />
                    <meshStandardMaterial color="#1e40af" />
                  </mesh>
                </group>
              </RigidBody>

              {/* Seraphina — Healing Hut (north-west) */}
              <RigidBody type="fixed" position={[-4, 0, -5]}>
                <group>
                  <mesh position={[0, 1.2, 0]} castShadow>
                    <boxGeometry args={[1.8, 1.8, 1.8]} />
                    <meshStandardMaterial color="#065f46" />
                  </mesh>
                  <mesh position={[0, 2.3, 0]} castShadow>
                    <coneGeometry args={[1.4, 1, 4]} />
                    <meshStandardMaterial color="#047857" />
                  </mesh>
                  <mesh position={[0, 1.8, 0.91]}>
                    <boxGeometry args={[0.3, 0.1, 0.02]} />
                    <meshStandardMaterial color="#d1fae5" emissive="#10b981" emissiveIntensity={1} />
                  </mesh>
                  <mesh position={[0, 1.8, 0.91]}>
                    <boxGeometry args={[0.1, 0.3, 0.02]} />
                    <meshStandardMaterial color="#d1fae5" emissive="#10b981" emissiveIntensity={1} />
                  </mesh>
                </group>
              </RigidBody>

              {/* Village houses — the first house has an enterable interior.
                  The interior renders as a separate small space (only when
                  houseInterior is set) so the main world never carries all
                  interiors simultaneously (low-spec budget). */}
              <HouseDoorSensor doorPos={[4, 0, 5.6]} interiorId="village_house_1" />
              {/* Enterable house (door faces +z toward the door sensor). */}
              <VillageHouse position={[4, 0, 4]} wallColor="#b45309" />
              <VillageHouse position={[-5, 0, 5]} wallColor="#a16207" scale={0.9} />
              <VillageHouse position={[2, 0, -3]} wallColor="#92400e" scale={0.8} />

              {/* Campfire near Arthur */}
              <RigidBody type="fixed" position={[1.5, 0, 2]}>
                <group>
                  {/* Fire base stones */}
                  {[0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6].map((angle, i) => (
                    <mesh key={i} position={[Math.cos(angle) * 0.4, 0.1, Math.sin(angle) * 0.4]} castShadow>
                      <sphereGeometry args={[0.12, 6, 6]} />
                      <meshStandardMaterial color="#6b7280" />
                    </mesh>
                  ))}
                  {/* Fire glow */}
                  <mesh position={[0, 0.3, 0]}>
                    <sphereGeometry args={[0.25, 8, 8]} />
                    <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={3} transparent opacity={0.8} />
                  </mesh>
                  <mesh position={[0, 0.5, 0]}>
                    <coneGeometry args={[0.15, 0.4, 6]} />
                    <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} transparent opacity={0.7} />
                  </mesh>
                </group>
              </RigidBody>

              {/* ═══════════════════════════════════════════════════════
                  WINDING PATH — Village → Wilderness
                  ═══════════════════════════════════════════════════════ */}
              {/* Path segments with curves */}
              {[
                [-1, -8], [0, -10], [-1, -12], [1, -14],
                [0, -16], [-1, -18],
              ].map(([x, z], i) => (
                <RigidBody key={`path-${i}`} type="fixed">
                  <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[3, 4]} />
                    <meshStandardMaterial color="#a3a37a" roughness={1} />
                  </mesh>
                </RigidBody>
              ))}

              {/* Path-side trees */}
              <Tree position={[-5, 0, -9]} />
              <Tree position={[5, 0, -10]} />
              <Tree position={[-4, 0, -13]} />
              <Tree position={[4, 0, -14]} />
              <Tree position={[-3, 0, -16]} />
              <Tree position={[5, 0, -17]} />

              {/* Path-side rocks */}
              <Rock position={[-3, 0, -11]} />
              <Rock position={[3, 0, -15]} />
              <Rock position={[-2, 0, -17]} />

              {/* Transition trees (darker, wilder) */}
              <Tree position={[-6, 0, -19]} scale={1.2} />
              <Tree position={[6, 0, -19]} scale={1.1} />
              <DeadTree position={[-4, 0, -20]} />
              <DeadTree position={[5, 0, -20]} />

              {/* ═══════════════════════════════════════════════════════
                  ENEMY ZONE — Distinct encounter areas
                  ═══════════════════════════════════════════════════════ */}

              {/* Zone label */}
              <Html position={[0, 4, -22]} center distanceFactor={20}>
                <div className="bg-red-950/80 text-red-200 border border-red-500/50 px-3 py-1 rounded-lg text-xs font-bold shadow-xl">
                  ⚔️ Dangerous Territory
                </div>
              </Html>

              {/* ── Slime Clearing (left side, z ≈ -23 to -29) ── */}
              <Html position={[-8, 3, -26]} center distanceFactor={20}>
                <div className="bg-green-950/60 text-green-200 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  🟢 Slime Clearing
                </div>
              </Html>
              <SlimeEnemy position={[-8, 0, -23]} name="Bouncy Slime" />
              <SlimeEnemy position={[-5, 0, -26]} name="Bouncy Slime" />
              <SlimeEnemy position={[-11, 0, -28]} name="Bouncy Slime" />
              {/* Slime area rocks and vegetation */}
              <Rock position={[-7, 0, -23]} scale={0.8} />
              <Rock position={[-11, 0, -25]} scale={0.6} />
              <Tree position={[-12, 0, -24]} />
              <Tree position={[-5, 0, -28]} />

              {/* ── Wolf Path (center-left, z ≈ -28 to -34) ── */}
              <Html position={[2, 3, -31]} center distanceFactor={20}>
                <div className="bg-amber-950/60 text-amber-200 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  🐺 Wolf Path
                </div>
              </Html>
              <WolfEnemy position={[1, 0, -28]} name="Dire Wolf" />
              <WolfEnemy position={[5, 0, -31]} name="Dire Wolf" />
              <WolfEnemy position={[-2, 0, -34]} name="Dire Wolf" />
              {/* Thornbacks — rocky outskirts beyond the wolf path */}
              <ThornbackEnemy position={[9, 0, -30]} name="Thornback" />
              <ThornbackEnemy position={[13, 0, -33]} name="Thornback" />
              {/* Arrow Bundle supply drop for crossbow ammo */}
              <ArrowBundlePickup position={[8, 0, -27]} />
              {/* Wolf area rocks and dead trees */}
              <Rock position={[3, 0, -27]} scale={0.7} />
              <DeadTree position={[5, 0, -29]} />
              <DeadTree position={[-1, 0, -32]} />
              <Rock position={[1, 0, -33]} scale={0.9} />

              {/* ── Bandit Camp (center-right, z ≈ -30 to -36) ── */}
              <Html position={[-8, 3, -33]} center distanceFactor={20}>
                <div className="bg-orange-950/60 text-orange-200 border border-orange-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  ⚔️ Bandit Camp
                </div>
              </Html>
              <BanditEnemy position={[-5, 0, -30]} name="Bandit Fighter" />
              <BanditEnemy position={[-10, 0, -33]} name="Bandit Fighter" />
              <BanditEnemy position={[-6, 0, -37]} name="Bandit Fighter" />
              {/* Bandit camp props */}
              <RigidBody type="fixed" position={[-7, 0, -32]}>
                <mesh castShadow position={[0, 0.3, 0]}>
                  <boxGeometry args={[1.5, 0.6, 1]} />
                  <meshStandardMaterial color="#78350f" />
                </mesh>
              </RigidBody>
              <Rock position={[-5, 0, -30]} scale={0.5} />
              <Rock position={[-11, 0, -32]} scale={0.7} />

              {/* ── Mage Area (far right, z ≈ -34 to -40) ── */}
              <Html position={[8, 3, -37]} center distanceFactor={20}>
                <div className="bg-purple-950/60 text-purple-200 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  🔮 Arcane Grounds
                </div>
              </Html>
              <MageEnemy position={[7, 0, -34]} name="Arcane Mage" />
              <MageEnemy position={[11, 0, -37]} name="Arcane Mage" />
              <MageEnemy position={[5, 0, -40]} name="Arcane Mage" />
              {/* Mage area rocks and mystical elements */}
              <Rock position={[7, 0, -33]} scale={1.0} />
              <Rock position={[11, 0, -35]} scale={0.8} />
              <DeadTree position={[9, 0, -38]} />
              {/* Mystical crystal */}
              <RigidBody type="fixed">
                <mesh position={[8, 0.8, -35]} castShadow>
                  <octahedronGeometry args={[0.4, 0]} />
                  <meshStandardMaterial color="#a855f7" emissive="#7c3aed" emissiveIntensity={2} transparent opacity={0.8} />
                </mesh>
              </RigidBody>

              {/* Enemy zone environment dressing */}
              {[
                [-13, -26], [13, -28], [-12, -35], [14, -33],
                [-14, -38], [12, -40], [-8, -40], [8, -42],
              ].map(([x, z], i) => (
                <Rock key={`erock-${i}`} position={[x, 0, z]} scale={0.5 + (i % 3) * 0.2} />
              ))}
              {[
                [-15, -30], [15, -32], [-10, -42], [10, -44],
              ].map(([x, z], i) => (
                <DeadTree key={`etree-${i}`} position={[x, 0, z]} />
              ))}

              {/* Target Dummy — in village for training */}
              <EnemyDummy position={[0, 0, -7]} name="Training Dummy" color="#ef4444" />

              {/* ═══════════════════════════════════════════════════════
                  TRIAL ARENA — Accessible from the east side
                  ═══════════════════════════════════════════════════════ */}
              <EncounterArea />

              {/* Floor */}
              <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[50, 0.5, 50]} position={[0, -0.5, 0]} />
                <mesh position={[0, -0.5, 0]} receiveShadow>
                  <boxGeometry args={[100, 1, 100]} />
                  <meshStandardMaterial color="#4ade80" />
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

              {/* ── HOUSE INTERIOR (separate space, rendered only while
                  occupied — never alongside the exterior world) ── */}
              {houseInterior === 'village_house_1' && (
                <group>
                  <InteriorTeleporter target={[40, 1, 40]} />
                  {/* Floor + walls of the small interior room */}
                  <RigidBody type="fixed" colliders={false}>
                    <CuboidCollider args={[4, 0.5, 4]} position={[40, -0.5, 40]} />
                  </RigidBody>
                  <mesh position={[40, 0.01, 40]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[8, 8]} />
                    <meshStandardMaterial color="#8a6b4a" roughness={1} />
                  </mesh>
                  {([
                    [[40, 2, 36.05], [8, 4, 0.1]],
                    [[40, 2, 43.95], [8, 4, 0.1]],
                    [[36.05, 2, 40], [0.1, 4, 8]],
                  ] as const).map(([pos, size], i) => (
                    <RigidBody key={`hwall-${i}`} type="fixed">
                      <mesh position={pos as unknown as [number, number, number]} castShadow receiveShadow>
                        <boxGeometry args={size as unknown as [number, number, number]} />
                        <meshStandardMaterial color="#a16207" />
                      </mesh>
                    </RigidBody>
                  ))}
                  {/* South wall with a doorway gap; exiting through it leaves */}
                  <RigidBody type="fixed">
                    <mesh position={[38, 2, 43.9]} castShadow receiveShadow>
                      <boxGeometry args={[4, 4, 0.1]} />
                      <meshStandardMaterial color="#a16207" />
                    </mesh>
                  </RigidBody>
                  <ExitDoorZone exitPos={[42, 0, 43.4]} />
                  {/* Ceiling/roof boundary (P2.2): visually closes the room; no
                      collider needed — the player cannot jump out of bounds. */}
                  <mesh position={[40, 4.05, 40]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[8, 8]} />
                    <meshStandardMaterial color="#5a3d22" roughness={1} side={THREE.DoubleSide} />
                  </mesh>
                  {/* Interior light source (P2.2) */}
                  <pointLight position={[40, 3.4, 40]} intensity={18} distance={12} color="#ffd9a0" castShadow={false} />
                  <mesh position={[40, 3.7, 40]}>
                    <sphereGeometry args={[0.12, 8, 8]} />
                    <meshStandardMaterial color="#ffe9c4" emissive="#ffd9a0" emissiveIntensity={2} />
                  </mesh>
                  {/* Functional-looking static props (P2.2): bed, table, chair,
                      storage chest — grouped geometry, low-spec primitives. */}
                  <RigidBody type="fixed">
                    {/* Bed: frame + mattress + pillow */}
                    <group position={[36.8, 0, 37.6]}>
                      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
                        <boxGeometry args={[1.1, 0.5, 2.2]} />
                        <meshStandardMaterial color="#5a3d22" />
                      </mesh>
                      <mesh position={[0, 0.58, 0.1]} castShadow>
                        <boxGeometry args={[1, 0.16, 2]} />
                        <meshStandardMaterial color="#9ca3af" />
                      </mesh>
                      <mesh position={[0, 0.7, -0.75]} castShadow>
                        <boxGeometry args={[0.7, 0.14, 0.4]} />
                        <meshStandardMaterial color="#e5e7eb" />
                      </mesh>
                    </group>
                  </RigidBody>
                  <RigidBody type="fixed">
                    {/* Table: top + four legs */}
                    <group position={[41.8, 0, 38.2]}>
                      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
                        <boxGeometry args={[1.3, 0.08, 0.8]} />
                        <meshStandardMaterial color="#6b4a2a" />
                      </mesh>
                      {[[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]].map(([lx, lz], i) => (
                        <mesh key={i} position={[lx, 0.36, lz]} castShadow>
                          <boxGeometry args={[0.08, 0.72, 0.08]} />
                          <meshStandardMaterial color="#5a3d22" />
                        </mesh>
                      ))}
                    </group>
                  </RigidBody>
                  <RigidBody type="fixed">
                    {/* Chair: seat + backrest + legs */}
                    <group position={[41.2, 0, 39.3]} rotation={[0, -0.6, 0]}>
                      <mesh position={[0, 0.45, 0]} castShadow>
                        <boxGeometry args={[0.45, 0.06, 0.45]} />
                        <meshStandardMaterial color="#7c5a33" />
                      </mesh>
                      <mesh position={[0, 0.75, -0.2]} castShadow>
                        <boxGeometry args={[0.45, 0.55, 0.06]} />
                        <meshStandardMaterial color="#7c5a33" />
                      </mesh>
                      {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([lx, lz], i) => (
                        <mesh key={i} position={[lx, 0.22, lz]} castShadow>
                          <boxGeometry args={[0.06, 0.45, 0.06]} />
                          <meshStandardMaterial color="#5a3d22" />
                        </mesh>
                      ))}
                    </group>
                  </RigidBody>
                  <RigidBody type="fixed">
                    {/* Storage chest: body + lid + latch */}
                    <group position={[43.2, 0, 37.2]}>
                      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
                        <boxGeometry args={[0.9, 0.7, 0.6]} />
                        <meshStandardMaterial color="#4a3220" />
                      </mesh>
                      <mesh position={[0, 0.73, 0]} castShadow>
                        <boxGeometry args={[0.95, 0.1, 0.65]} />
                        <meshStandardMaterial color="#3b2718" />
                      </mesh>
                      <mesh position={[0, 0.55, 0.32]}>
                        <boxGeometry args={[0.1, 0.14, 0.04]} />
                        <meshStandardMaterial color="#d68a31" metalness={0.6} roughness={0.4} />
                      </mesh>
                    </group>
                  </RigidBody>
                </group>
              )}
            </Physics>
          </Suspense>
        </Canvas>
      </KeyboardControls>
      )}
    </div>
  );
}
