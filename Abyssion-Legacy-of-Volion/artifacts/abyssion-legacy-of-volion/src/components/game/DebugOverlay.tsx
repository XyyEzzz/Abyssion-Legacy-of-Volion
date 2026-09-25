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

/* ── SECTION E — per-frame performance counters (F5) ─────────────────────
 *  Frame timing must advance EVERY frame, but this overlay renders outside
 *  GameScene's <Canvas>, so R3F's useFrame is not reachable from here; a
 *  self-contained rAF loop drives it instead (see the mount effect below).
 *  The panel's *text* still refreshes only on the existing 250 ms tick.
 *  Module scope and mutated in place: one subtraction, one fixed-array write
 *  and one counter per frame — no allocation per frame. */
const FRAME_WINDOW = 60; // 1 s at 60 fps

/** Chromium's non-standard heap stats. Absent everywhere else. */
type PerfMemory = { usedJSHeapSize: number; totalJSHeapSize: number };

const PERF = {
  buf: new Array<number>(FRAME_WINDOW).fill(0), // rolling frame-time window
  idx: 0,
  frames: 0,
  windowStart: 0,
  lastAt: 0, // performance.now() of the previous frame; 0 = none yet
  fps: 0,
  currentMs: 0,
  avgMs: 0,
  heapOk: false,
  heapUsedMB: 0,
  heapTotalMB: 0,
};

/** Per-mount reset — the frame window is transient (no persistence). */
function resetPerf() {
  PERF.buf.fill(0);
  PERF.idx = 0;
  PERF.frames = 0;
  PERF.windowStart = performance.now();
  PERF.lastAt = 0;
  PERF.fps = 0;
  PERF.currentMs = 0;
  PERF.avgMs = 0;
}

/** One frame of the rAF loop. Scalars only — nothing is allocated. */
function tickFrame() {
  const now = performance.now();
  if (PERF.lastAt === 0) {
    // The first frame after mount has no previous sample. A dt measured from
    // performance.now()'s origin (page load) would poison the window and the
    // rolling average, so seed lastAt and count the frame.
    PERF.lastAt = now;
    PERF.frames += 1;
    return;
  }
  const dt = now - PERF.lastAt;
  PERF.lastAt = now;
  PERF.currentMs = dt;
  PERF.buf[PERF.idx] = dt;
  PERF.idx = (PERF.idx + 1) % FRAME_WINDOW;
  if (now - PERF.windowStart >= 1000) {
    PERF.fps = PERF.frames;
    PERF.frames = 0;
    PERF.windowStart = now;
    let sum = 0;
    for (let i = 0; i < FRAME_WINDOW; i++) sum += PERF.buf[i];
    PERF.avgMs = sum / FRAME_WINDOW;
  }
  PERF.frames += 1;
}

/** Heap read — Chromium only. Feature-detected; never polyfilled, never throws. */
function tickHeap() {
  if (!('memory' in performance)) {
    PERF.heapOk = false;
    return;
  }
  const mem = (performance as Performance & { memory?: PerfMemory }).memory;
  if (!mem) {
    PERF.heapOk = false;
    return;
  }
  PERF.heapOk = true;
  PERF.heapUsedMB = mem.usedJSHeapSize / 1048576;
  PERF.heapTotalMB = mem.totalJSHeapSize / 1048576;
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

  // ── SECTION E — PERFORMANCE (F5) ──────────────────────────────────
  // FPS and frame time come from the per-frame rAF counters; the heap is
  // sampled on the existing 250 ms tick. Reading both here means the panel
  // text and the Copy/Save JSON always agree.
  out.push('SECTION E — PERFORMANCE');
  row('fps', Math.round(PERF.fps));
  row('currentFrameMs', Number(PERF.currentMs.toFixed(2)));
  row('avgFrameMs', Number(PERF.avgMs.toFixed(2)));
  row('heapUsedMB', PERF.heapOk ? Number(PERF.heapUsedMB.toFixed(1)) : 'n/a');
  row('heapTotalMB', PERF.heapOk ? Number(PERF.heapTotalMB.toFixed(1)) : 'n/a');

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
  const [copied, setCopied] = useState<'copy' | 'save' | null>(null);

  useEffect(() => {
    const tick = () => {
      // The heap is sampled here — on the existing 250 ms tick, not per frame.
      tickHeap();
      setLines(buildLines(useGameStore.getState()));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  // Section E: frame timing advances every frame. The overlay is a DOM sibling
  // of GameScene's <Canvas>, so R3F's useFrame is not reachable from here — a
  // self-contained rAF loop is the option that works. One closure per mount,
  // nothing allocated per frame, window reset on mount, cancelled on unmount.
  useEffect(() => {
    resetPerf();
    let raf = requestAnimationFrame(function step() {
      tickFrame();
      raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Snapshot the same fields the panel displays, as JSON, so the user can
  // paste them into chat. Read-only — touches no store field.
  // Same handler, same JSON payload, for both buttons: F5's Save is an alias
  // for Copy (clipboard write, not a file download) so the existing snapshot
  // workflow is untouched. Only the transient confirmation label differs.
  const handleCopy = async (label: 'copy' | 'save') => {
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
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleCopy('copy')}
            className="pointer-events-auto px-2 py-0.5 rounded border border-green-700 text-green-200 hover:bg-green-900/40"
          >
            {copied === 'copy' ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => handleCopy('save')}
            className="pointer-events-auto px-2 py-0.5 rounded border border-green-700 text-green-200 hover:bg-green-900/40"
          >
            {copied === 'save' ? 'Saved' : 'Save'}
          </button>
        </div>
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
