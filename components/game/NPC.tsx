'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/lib/store';
import { NPCData } from '@/lib/questData';

interface NPCProps {
  data: NPCData;
}

export default function NPC({ data }: NPCProps) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const propRef = useRef<THREE.Mesh>(null);
  const isNearRef = useRef(false);

  const setInteractPrompt = useGameStore((state) => state.setInteractPrompt);
  const openDialogueForNpc = useGameStore((state) => state.openDialogueForNpc);
  const quests = useGameStore((state) => state.quests);

  // Determine overhead quest marker state
  const quest = quests.find((q) => q.id === data.questId);
  let questMarker: 'available' | 'turnIn' | 'inProgress' | null = null;
  if (quest) {
    if (quest.status === 'unaccepted') {
      const completedIds = useGameStore.getState().completedQuestIds;
      const prereqMet = !quest.prerequisiteQuestId || completedIds.includes(quest.prerequisiteQuestId);
      if (prereqMet) questMarker = 'available';
    } else if (quest.status === 'ready_to_turn_in') {
      questMarker = 'turnIn';
    } else if (quest.status === 'active') {
      const allDone = quest.objectives.every((o) => o.currentAmount >= o.requiredAmount);
      questMarker = allDone ? 'turnIn' : 'inProgress';
    }
  }

  const distRef = useRef(999);

  // Proximity check with player
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (groupRef.current) {
      // Subtle breathing / idle sway
      groupRef.current.position.y = data.position[1] + Math.sin(time * 2.5 + data.position[0]) * 0.04;
    }

    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(time * 1.5) * 0.1;
    }

    // Role specific prop animation (e.g., Researcher floating orb)
    if (propRef.current) {
      if (data.type === 'researcher') {
        propRef.current.position.y = 1.6 + Math.sin(time * 3) * 0.12;
        propRef.current.rotation.y += delta * 2;
      } else if (data.type === 'merchant') {
        propRef.current.rotation.y = Math.sin(time * 1.2) * 0.08;
      }
    }

    // Proximity check with player
    const pPosArr = useGameStore.getState().player.position;
    const playerPos = new THREE.Vector3(pPosArr[0], pPosArr[1], pPosArr[2]);
    const npcPos = new THREE.Vector3(...data.position);
    const dist = playerPos.distanceTo(npcPos);
    distRef.current = dist;

    // Frame Debug Log
    console.log(`[Frame Log - NPC ${data.id} (${data.name})]:`, {
      playerPosition: pPosArr,
      npcPosition: data.position,
      distance: dist,
      isNear: isNearRef.current,
    });

    if (dist <= 3.8) {
      if (!isNearRef.current) {
        isNearRef.current = true;
        setInteractPrompt(`Press [E] or Click to Talk with ${data.name}`);
      }
    } else if (isNearRef.current) {
      isNearRef.current = false;
      setInteractPrompt(null);
    }

    // Update live debug overlay metrics if this is the closest NPC
    const storeState = useGameStore.getState();
    const isThisClosest = storeState.debug.nearestNpcName === data.name || dist < storeState.debug.currentDistance;
    if (isThisClosest) {
      storeState.updateDebug({
        nearestNpcName: data.name,
        currentDistance: parseFloat(dist.toFixed(2)),
        isNear: isNearRef.current,
      });
    }
  });

  const handleInteract = () => {
    console.log(`[Click Interact - NPC ${data.id} (${data.name})]: calling openDialogueForNpc`);
    openDialogueForNpc(data.id);
  };

  // Keyboard 'E' or 'e' listener when near
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'e' || e.key === 'E' || e.key === 'f' || e.key === 'F') {
        const storeState = useGameStore.getState();
        const pPosArr = storeState.player.position;
        const playerPos = new THREE.Vector3(pPosArr[0], pPosArr[1], pPosArr[2]);
        const npcPos = new THREE.Vector3(...data.position);
        const currentDist = playerPos.distanceTo(npcPos);

        const nowStr = new Date().toLocaleTimeString();
        storeState.updateDebug({
          ePressedCount: storeState.debug.ePressedCount + 1,
          lastEPressedTime: nowStr,
        });

        console.log(`[E pressed log - NPC ${data.id} (${data.name})]:`, {
          eventKey: e.key,
          currentDistance: currentDist,
          currentIsNearRef: isNearRef.current,
        });

        if (isNearRef.current) {
          console.log(`[E pressed - NPC ${data.id}]: calling openDialogueForNpc(${data.id})`);
          openDialogueForNpc(data.id);
        } else {
          console.log(`[E pressed - NPC ${data.id}]: openDialogueForNpc NOT called because isNearRef is false`);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data.id, data.position, data.name, openDialogueForNpc]);

  // Styling details per NPC type
  const getStyleColors = () => {
    switch (data.type) {
      case 'villager':
        return { body: '#15803d', tunic: '#166534', hat: '#78350f', accent: '#fef08a' };
      case 'merchant':
        return { body: '#b45309', tunic: '#d97706', hat: '#f59e0b', accent: '#fef08a' };
      case 'blacksmith':
        return { body: '#475569', tunic: '#334155', hat: '#1e293b', accent: '#94a3b8' };
      case 'guard':
        return { body: '#0284c7', tunic: '#0369a1', hat: '#e2e8f0', accent: '#38bdf8' };
      case 'researcher':
        return { body: '#7e22ce', tunic: '#6b21a8', hat: '#a855f7', accent: '#c084fc' };
      default:
        return { body: '#475569', tunic: '#334155', hat: '#1e293b', accent: '#f8fafc' };
    }
  };

  const colors = getStyleColors();

  return (
    <group
      ref={groupRef}
      position={data.position}
      rotation={[0, data.rotationY || 0, 0]}
      onClick={handleInteract}
    >
      {/* Base Ring / Shadow */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[0.8, 0.9, 0.04, 16]} />
        <meshStandardMaterial color="#1e293b" opacity={0.6} transparent />
      </mesh>

      {/* Body / Tunic */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.45, 1.3, 12]} />
        <meshStandardMaterial color={colors.tunic} roughness={0.6} />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 1.75, 0]} castShadow>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#fde047" roughness={0.4} />
      </mesh>

      {/* Eyes */}
      <mesh position={[0.09, 1.8, 0.22]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      <mesh position={[-0.09, 1.8, 0.22]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>

      {/* Hat / Helm / Hair */}
      {data.type === 'villager' && (
        <mesh position={[0, 1.95, 0]}>
          <coneGeometry args={[0.35, 0.4, 12]} />
          <meshStandardMaterial color={colors.hat} />
        </mesh>
      )}
      {data.type === 'guard' && (
        <mesh position={[0, 1.9, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.32]} />
          <meshStandardMaterial color={colors.hat} metalness={0.8} roughness={0.2} />
        </mesh>
      )}
      {data.type === 'researcher' && (
        <mesh position={[0, 2.0, 0]}>
          <coneGeometry args={[0.4, 0.6, 12]} />
          <meshStandardMaterial color={colors.hat} />
        </mesh>
      )}

      {/* Role Prop */}
      {data.type === 'villager' && (
        <mesh position={[0.4, 1.0, 0.2]} rotation={[0, 0, -0.15]}>
          <cylinderGeometry args={[0.03, 0.03, 1.6, 8]} />
          <meshStandardMaterial color="#78350f" />
        </mesh>
      )}
      {data.type === 'guard' && (
        <mesh position={[0.42, 1.2, 0.2]}>
          <cylinderGeometry args={[0.02, 0.03, 2.2, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} />
        </mesh>
      )}
      {data.type === 'blacksmith' && (
        <group position={[-0.5, 0.5, 0.3]}>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.5, 0.4, 0.6]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>
        </group>
      )}
      {data.type === 'merchant' && (
        <group position={[0, 0.4, 0.5]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[1.2, 0.4, 0.5]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          {/* Apples on table */}
          <mesh position={[-0.3, 0.45, 0]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
          <mesh position={[0.3, 0.45, 0]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
        </group>
      )}
      {data.type === 'researcher' && (
        <mesh ref={propRef} position={[0.4, 1.6, 0]}>
          <octahedronGeometry args={[0.16, 2]} />
          <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={2} />
        </mesh>
      )}

      {/* Overhead Quest Indicator */}
      {questMarker && (
        <Html position={[0, 2.6, 0]} center distanceFactor={10}>
          <div
            onClick={handleInteract}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-sm sm:text-base border-2 shadow-xl cursor-pointer transition-transform hover:scale-125 animate-bounce ${
              questMarker === 'turnIn'
                ? 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-emerald-500/50 scale-110'
                : questMarker === 'available'
                ? 'bg-amber-400 text-amber-950 border-amber-200 shadow-amber-400/50 scale-110'
                : 'bg-slate-700 text-slate-300 border-slate-500'
            }`}
          >
            {questMarker === 'turnIn' ? '?' : questMarker === 'available' ? '!' : '?'}
          </div>
        </Html>
      )}

      {/* Name and Interaction Badge */}
      <Html position={[0, 2.2, 0]} center distanceFactor={12}>
        <div
          onClick={handleInteract}
          className="bg-slate-900/85 text-slate-100 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700/80 shadow-md text-center pointer-events-auto cursor-pointer select-none hover:border-amber-400 transition-colors"
        >
          <div className="text-[11px] font-bold whitespace-nowrap text-amber-300 flex items-center justify-center gap-1">
            <span>{data.name}</span>
          </div>
          <div className="text-[9px] text-slate-400 leading-tight">{data.role}</div>
        </div>
      </Html>
    </group>
  );
}
