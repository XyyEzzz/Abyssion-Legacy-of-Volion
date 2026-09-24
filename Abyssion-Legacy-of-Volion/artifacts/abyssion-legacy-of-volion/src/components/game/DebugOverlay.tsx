'use client';

import { useEffect, useState } from 'react';
import { useGameStore, enemyTargets } from '@/lib/store';
import { RESONANCE_SKILLS } from '@/lib/weaponContent';

/** M1W3D3 #2 — runtime debug overlay.
 *
 *  Read-only field inspector for the four INCONCLUSIVE bugs. Off by default;
 *  toggled by F9 from Game.tsx. Pure reader — writes nothing to the store.
 *  Re-renders at 4 Hz and performs ONE `useGameStore.getState()` read per
 *  tick (no per-field subscriptions, no per-frame work). */

type StoreState = ReturnType<typeof useGameStore.getState>;

/** Values longer than 32 chars are truncated with an ellipsis. */
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  let s: string;
  if (typeof v === 'string') s = v;
  else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
  else if (Array.isArray(v)) s = '[' + v.map((n) => fmt(n)).join(', ') + ']';
  else s = JSON.stringify(v);
  if (s === '') return '—';
  return s.length > 32 ? s.slice(0, 32) + '…' : s;
}

/** Numeric epoch-ms → HH:MM:SS.mmm; existing string stamps pass through;
 *  anything absent renders as an em dash. */
function fmtTs(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  }
  if (typeof v === 'string' && v !== '' && v !== 'Never') return fmt(v);
  return '—';
}

function buildLines(s: StoreState): string[] {
  const out: string[] = [];
  const row = (key: string, value: unknown, ts = false) =>
    out.push(`${key}: ${ts ? fmtTs(value) : fmt(value)}`);

  // ── SECTION A — FAIL-3 (NPC interaction) ──────────────────────────
  out.push('SECTION A — FAIL-3 NPC INTERACTION');
  row('ui.nearestNpcId', s.ui.nearestNpcId);
  row('ui.interactPrompt', s.ui.interactPrompt);
  row('ui.nearestCheckpointPos', s.ui.nearestCheckpointPos);
  row('activeDialogue', s.activeDialogue ? 'open' : 'null');
  row('ui.showInventory', s.ui.showInventory);
  row('ui.showSettings', s.ui.showSettings);
  row('ui.showShop', s.ui.showShop);
  row('ui.showQuestLog', s.ui.showQuestLog);
  row('ui.mapOpen', s.ui.mapOpen);
  row('ui.deathOverlay', s.ui.deathOverlay);
  row('hudEditMode', s.hudEditMode);
  row('gamePhase', s.gamePhase);
  row('debug.ePressedCount', s.debug.ePressedCount);
  row('debug.lastEPressedTime', s.debug.lastEPressedTime, true);
  row('debug.openDialogueCalledCount', s.debug.openDialogueCalledCount);
  row('debug.lastOpenDialogueTime', s.debug.lastOpenDialogueTime, true);
  row('debug.nearestNpcName', s.debug.nearestNpcName);
  row('debug.currentDistance', s.debug.currentDistance);
  row('debug.isNear', s.debug.isNear);
  row('debug.activeDialogueNotNull', s.debug.activeDialogueNotNull);
  row('debug.dialogueModalMounted', s.debug.dialogueModalMounted);
  out.push('—');

  // ── SECTION B — BUG-105 (shotgun at fire time) ────────────────────
  out.push('SECTION B — BUG-105 SHOTGUN');
  row('enemyTargets.size', enemyTargets.size);
  const [px, , pz] = s.player.position;
  row('player.position.x', px);
  row('player.position.z', pz);
  row('camera yaw (inputs.cameraAngle)', s.inputs.cameraAngle);
  row('skillState.lastFired.id', s.skillState.lastFired?.id);
  row('skillState.lastFired.at', s.skillState.lastFired?.at, true);
  out.push('—');

  // ── SECTION C — BUG-106 (notification burst) ──────────────────────
  out.push('SECTION C — BUG-106 NOTIFICATIONS');
  row('notifications.length', s.notifications.length);
  const last4 = s.notifications.slice(-4);
  row('notifications[-4..].id', last4.map((n) => n.id));
  row('notifications[-4..].createdAt', last4.map((n) => fmtTs(n.createdAt)));
  row('player.exp', s.player.exp);
  row('player.level', s.player.level);
  row('debug.lastExpGainTime', '(n/a)');
  out.push('—');

  // ── SECTION D — BUG-107 (Custom HUD) ──────────────────────────────
  out.push('SECTION D — BUG-107 CUSTOM HUD');
  row('hudEditMode', s.hudEditMode);
  row('skillHudConfig keys', Object.keys(s.skillHudConfig));
  row(
    'hudLayout.visible keys',
    Object.keys(s.hudLayout).filter((k) => s.hudLayout[k as keyof typeof s.hudLayout].visible),
  );
  row('equipped weapon (selectedWeapon)', s.hotbar.slots[s.hotbar.selectedSlot]);
  row('RESONANCE_SKILLS ids', RESONANCE_SKILLS.map((sk) => sk.id));

  return out;
}

/** Legacy selection-based copy for browsers without the async clipboard API. */
function fallbackCopy(text: string) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    // Nothing else to try — the user can still read the panel on screen.
  }
}

export default function DebugOverlay() {
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tick = () => setLines(buildLines(useGameStore.getState()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  // Snapshot the same fields the panel displays, as JSON, so the user can
  // paste them into chat. Read-only — touches no store field.
  const handleCopy = async () => {
    const payload = {
      capturedAt: new Date().toISOString(),
      lines: buildLines(useGameStore.getState()),
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      fallbackCopy(text);
    }
  };

  return (
    <div
      className="fixed top-2 left-2 z-[200] pointer-events-none select-none bg-black/85 text-green-300 font-mono text-[10px] leading-tight p-2 rounded max-w-[420px] max-h-[90vh] overflow-y-auto"
      aria-hidden
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-green-400 font-bold">DEBUG OVERLAY (F9)</span>
        <button
          type="button"
          onClick={handleCopy}
          className="pointer-events-auto px-2 py-0.5 rounded border border-green-700 text-green-200 hover:bg-green-900/40"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {lines.map((line, i) =>
        line === '—' ? (
          <div key={i} className="text-green-700">—</div>
        ) : (
          <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
        ),
      )}
    </div>
  );
}
