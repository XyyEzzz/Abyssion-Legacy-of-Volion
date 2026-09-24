'use client';

/**
 * F-Mode strip (M1W3D3 #2 WS3).
 *
 * A draggable row of F1–F12 buttons shown only while `settings.fMode` is on.
 * Deliberately NOT part of Custom HUD: it is not a HudElementId and never
 * appears in the HUD editor canvas. Each button dispatches a real
 * KeyboardEvent on `window` so it drives the same input paths a physical
 * F-key would.
 *
 * Position uses the hudConfig HudPosition shape (`F_MODE_STRIP_DEFAULT`) and,
 * once dragged, is remembered in localStorage under its own key. It is not
 * written into hudLayout, so it can never leak into the Custom HUD editor.
 */

import { useCallback, useRef, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { F_MODE_KEYS, F_MODE_STRIP_DEFAULT, type HudPosition } from '@/lib/hudConfig';

const STRIP_STORAGE_KEY = 'abyssion:fModeStrip';

function readStoredStrip(): HudPosition {
  try {
    const raw = localStorage.getItem(STRIP_STORAGE_KEY);
    if (!raw) return F_MODE_STRIP_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<HudPosition>;
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // Ignore malformed / unavailable storage — fall back to the default.
  }
  return F_MODE_STRIP_DEFAULT;
}

export default function FModeOverlay() {
  const fMode = useGameStore((s) => s.settings.fMode);
  const [pos, setPos] = useState<HudPosition>(readStoredStrip);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    setPos({
      x: Math.max(0, Math.min(1, d.ox + (e.clientX - d.sx) / vw)),
      y: Math.max(0, Math.min(1, d.oy + (e.clientY - d.sy) / vh)),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      localStorage.setItem(STRIP_STORAGE_KEY, JSON.stringify(posRef.current));
    } catch {
      // Persistence is best-effort; the overlay still works without it.
    }
  }, []);

  const pressKey = useCallback((key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true }));
  }, []);

  if (!fMode) return null;

  return (
    <div
      className="absolute z-30 select-none"
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        touchAction: 'none',
      }}
    >
      <div
        className="flex items-center gap-1 rounded px-1.5 py-1 font-mono text-[10px] text-gray-100"
        style={{
          background: 'rgba(10,10,14,0.72)',
          border: '1px solid rgba(255,255,255,0.15)',
          pointerEvents: 'auto',
          cursor: 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {F_MODE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => pressKey(key)}
            className="px-1.5 py-0.5 rounded border border-gray-600 hover:bg-white/10 active:bg-white/20"
            style={{ pointerEvents: 'auto' }}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
