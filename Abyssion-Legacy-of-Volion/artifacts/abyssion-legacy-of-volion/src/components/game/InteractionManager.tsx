'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/lib/store';
import { NPCS_DATA } from '@/lib/questData';
import type { NPCData, Quest } from '@/lib/questData';
import { t } from '@/lib/translations';
import type { Lang } from '@/lib/translations';

/**
 * Centralized interaction proximity manager.
 *
 * Runs inside the R3F Canvas via useFrame. Each frame it:
 * 1. Reads the player position from the store
 * 2. Reads all NPC positions from npcPositionCache (NPCs register each frame)
 * 3. Reads all checkpoint positions from checkpointPositionCache
 * 4. Finds the nearest NPC and nearest checkpoint
 * 5. Picks whichever entity is closest (distance-based priority)
 * 6. Updates the store only on change
 *
 * Key design: NPCs and checkpoints compete on equal footing.
 * The closest interactable wins, regardless of type.
 */

const NPC_INTERACT_RANGE = 4.0;
const CHECKPOINT_INTERACT_RANGE = 3.5;

// Lightweight NPC position cache - NPCs write their positions here each frame.
// This avoids reading from React refs across component boundaries.
export const npcPositionCache = new Map<string, THREE.Vector3>();

export function registerNpcPosition(id: string, pos: THREE.Vector3) {
  npcPositionCache.set(id, pos);
}

export function unregisterNpcPosition(id: string) {
  npcPositionCache.delete(id);
}

// Checkpoint position cache
export const checkpointPositionCache = new Map<string, THREE.Vector3>();

export function registerCheckpointPosition(id: string, pos: THREE.Vector3) {
  checkpointPositionCache.set(id, pos);
}

export function unregisterCheckpointPosition(id: string) {
  checkpointPositionCache.delete(id);
}

interface InteractableResult {
  type: 'npc' | 'checkpoint';
  id: string;
  dist: number;
  promptText: string | null;
  checkpointPos?: [number, number, number];
}

/**
 * Build the interaction prompt from the NPC's ACTUALLY available actions,
 * derived from the existing authoritative state (quests + npc type). Priority:
 * quest turn-in > quest offer > shop > plain talk. This mirrors what
 * openDialogueForNpc() will do with the same state — no duplicated action
 * logic lives here; the prompt is purely presentational.
 */
function npcPrompt(
  npcData: NPCData,
  s: { quests: Quest[]; completedQuestIds: string[] },
): string {
  const lang = s.quests && useGameStore.getState().settings.language as Lang;
  const name = npcData.name;
  if (npcData.questId) {
    const quest = s.quests.find(q => q.id === npcData.questId);
    if (quest) {
      const prereqMet =
        !quest.prerequisiteQuestId ||
        s.completedQuestIds.includes(quest.prerequisiteQuestId);
      if (quest.status === 'active') {
        const allDone = quest.objectives.every(
          o => o.currentAmount >= o.requiredAmount,
        );
        if (allDone) return t('interact.turnIn', lang, { name });
      } else if (quest.status === 'unaccepted' && prereqMet) {
        return t('interact.quest', lang, { name });
      }
    }
  }
  if (npcData.type === 'merchant') {
    // Marcus's dialogue offers the shop (questData: openShop choices).
    return t('interact.shop', lang, { name });
  }
  return t('interact.talk', lang, { name });
}

export default function InteractionManager() {
  const prevEntityRef = useRef<string | null>(null);
  const debugTelemetryAccum = useRef(0);

  const _playerPos = useRef(new THREE.Vector3()).current;

  useFrame(() => {
    const s = useGameStore.getState();

    // Don't update interaction while dialogue, settings, inventory, shop,
    // expanded map, etc. are open
    if (s.activeDialogue || s.ui.showSettings || s.ui.showInventory || s.ui.showQuestLog || s.ui.deathOverlay || s.ui.mapOpen || s.hudEditMode || s.ui.showShop) {
      // A modal cleared the store's nearestNpcId while this detector was
      // suspended, so the stale entity key must not survive the suspension.
      prevEntityRef.current = null;
      return;
    }

    const pArr = s.player.position;
    _playerPos.set(pArr[0], pArr[1], pArr[2]);

    const lang = s.settings.language as Lang;

    // ── Find nearest NPC ──
    let bestNpc: { id: string; dist: number; promptText: string | null } | null = null;

    for (const npcData of NPCS_DATA) {
      const npcPos = npcPositionCache.get(npcData.id);
      if (!npcPos) continue;
      const dist = _playerPos.distanceTo(npcPos);
      if (dist <= NPC_INTERACT_RANGE) {
        if (!bestNpc || dist < bestNpc.dist) {
          bestNpc = { id: npcData.id, dist, promptText: npcPrompt(npcData, s) };
        }
      }
    }

    // ── Find nearest checkpoint ──
    let bestCheckpoint: { id: string; dist: number; promptText: string | null; pos: [number, number, number] } | null = null;

    for (const [cpId, cpPos] of checkpointPositionCache) {
      const dist = _playerPos.distanceTo(cpPos);
      if (dist <= CHECKPOINT_INTERACT_RANGE) {
        if (!bestCheckpoint || dist < bestCheckpoint.dist) {
          const promptText = t('interact.checkpoint', lang, { name: 'Checkpoint' });
          bestCheckpoint = { id: cpId, dist, promptText, pos: [cpPos.x, cpPos.y, cpPos.z] };
        }
      }
    }

    // ── Pick the closest entity (NPC or checkpoint) ──
    let bestEntity: InteractableResult | null = null;

    if (bestNpc && bestCheckpoint) {
      // Both in range — pick the closer one
      if (bestNpc.dist <= bestCheckpoint.dist) {
        bestEntity = { type: 'npc', id: bestNpc.id, dist: bestNpc.dist, promptText: bestNpc.promptText };
      } else {
        bestEntity = { type: 'checkpoint', id: bestCheckpoint.id, dist: bestCheckpoint.dist, promptText: bestCheckpoint.promptText, checkpointPos: bestCheckpoint.pos };
      }
    } else if (bestNpc) {
      bestEntity = { type: 'npc', id: bestNpc.id, dist: bestNpc.dist, promptText: bestNpc.promptText };
    } else if (bestCheckpoint) {
      bestEntity = { type: 'checkpoint', id: bestCheckpoint.id, dist: bestCheckpoint.dist, promptText: bestCheckpoint.promptText, checkpointPos: bestCheckpoint.pos };
    }

    // ── Live debug telemetry (P2.4): write the real nearest-NPC values
    // from authoritative state. Throttled to ~4 Hz to avoid per-frame store
    // writes; values are computed fresh from the live player position above.
    debugTelemetryAccum.current += 1;
    if (debugTelemetryAccum.current >= 15) {
      debugTelemetryAccum.current = 0;
      const d = useGameStore.getState().debug;
      const name = bestNpc
        ? (NPCS_DATA.find((n) => n.id === bestNpc.id)?.name ?? bestNpc.id)
        : null;
      // Only write when a displayed value actually changed.
      if (
        d.nearestNpcName !== (name ?? 'None') ||
        Math.abs(d.currentDistance - (bestNpc?.dist ?? 999)) > 0.01 ||
        d.isNear !== !!bestNpc
      ) {
        useGameStore.setState((state) => ({
          debug: {
            ...state.debug,
            nearestNpcName: name ?? 'None',
            currentDistance: bestNpc?.dist ?? 999,
            isNear: !!bestNpc,
          },
        }));
      }
    }

    // ── Build a stable key for change detection ──
    const entityKey = bestEntity ? `${bestEntity.type}:${bestEntity.id}` : null;

    if (entityKey !== prevEntityRef.current) {
      prevEntityRef.current = entityKey;

      if (bestEntity?.type === 'npc') {
        useGameStore.setState((state) => ({
          ui: {
            ...state.ui,
            nearestNpcId: bestEntity.id,
            nearestCheckpointPos: null,
            interactPrompt: bestEntity.promptText,
          },
        }));
      } else if (bestEntity?.type === 'checkpoint') {
        useGameStore.setState((state) => ({
          ui: {
            ...state.ui,
            nearestNpcId: null,
            nearestCheckpointPos: bestEntity.checkpointPos!,
            interactPrompt: bestEntity.promptText,
          },
        }));
      } else {
        // Nothing in range — clear all
        useGameStore.setState((state) => ({
          ui: {
            ...state.ui,
            nearestNpcId: null,
            nearestCheckpointPos: null,
            interactPrompt: null,
          },
        }));
      }
    }
  });

  return null; // This component only runs side-effects
}
