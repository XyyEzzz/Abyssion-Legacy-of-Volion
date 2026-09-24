'use client';

/**
 * Foundational minimap (M1W2D2 navigation foundation).
 *
 * - Player marker derives from the authoritative `useGameStore` player
 *   position — no duplicate/simulated position state, no timers.
 * - World -> map -> minimap-UI mapping lives in `@/lib/minimap` so the
 *   prototype's dimensions never become baked-in constants.
 * - World-oriented (stable) map: north (-Z) up; the marker moves, the map
 *   does not rotate with camera yaw.
 * - A `<canvas>` is used instead of DOM nodes for the ground + markers so the
 *   per-frame cost stays trivial on low-spec Android (one small 2D canvas,
 *   redraw only when the player position actually changes).
 * - Extensible: `markers` are a plain array of {x, z, color, label?} in world
 *   space — future NPC/quest/POI systems can pass providers without touching
 *   the mapping or the draw loop's structure.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '@/lib/store';
import { worldToMap, clamp01, REGIONS } from '@/lib/minimap';
import { HUD_CONFIG as H } from '@/lib/hudConfig';

export interface MinimapMarker {
  /** World-space position. */
  x: number;
  z: number;
  color: string;
  label?: string;
}

interface MinimapProps {
  /** Rendered diameter in px (responsive base; clamped on small screens). */
  size?: number;
  /** Extra world-space markers (NPCs, quests, POIs in future systems). */
  markers?: MinimapMarker[];
  /** Called when the minimap is clicked/tapped (opens the expanded map). */
  onOpenExpanded?: () => void;
}

// The map spans the whole registered world region (prototype today). When the
// world grows, region registry changes in lib/minimap — this view follows.
const region = REGIONS[0];

export default function Minimap({ size = 128, markers = [], onOpenExpanded }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Player position is a [x, y, z] tuple in the authoritative store.
  const pos = useGameStore(s => s.player.position);
  const px = pos[0];
  const pz = pos[2];

  // Marker normalization is pure and cheap; recomputed only when markers or
  // region identity change (markers default to a stable empty array).
  const mappedMarkers = useMemo(
    () =>
      markers.map(m => {
        const { mx, my } = worldToMap(m.x, m.z, region);
        return { ...m, mx: clamp01(mx), my: clamp01(my) };
      }),
    [markers],
  );

  const player = useMemo(() => {
    const { mx, my } = worldToMap(px, pz, region);
    return { mx: clamp01(mx), my: clamp01(my) };
  }, [px, pz]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Ground disc: medieval parchment-toned terrain with an iron ring frame.
    const r = size / 2;
    ctx.beginPath();
    ctx.arc(r, r, r - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(24, 28, 22, 0.78)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = H.colors.healthBorder;
    ctx.stroke();

    const toPx = (mx: number, my: number): [number, number] => [
      4 + mx * (size - 8),
      4 + my * (size - 8),
    ];

    // Static world features (drawn from existing scene data — no invented
    // content): region boundary rectangle plus a north tick/compass at the
    // top edge so the world-oriented convention is readable at a glance.
    ctx.strokeStyle = 'rgba(200, 190, 160, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, size - 8, size - 8);
    // North tick (-Z is map-up): a short line at top-center + "N".
    ctx.beginPath();
    ctx.moveTo(r, 5);
    ctx.lineTo(r, 12);
    ctx.strokeStyle = 'rgba(240, 230, 200, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(240, 230, 200, 0.9)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', r, 18);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    for (const m of mappedMarkers) {
      const [x, y] = toPx(m.mx, m.my);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
    }

    // Player marker: gold chevron pointing along -Z (map-up), stable shape,
    // with a dark halo so it stays visible over any marker or terrain tone.
    const [x, y] = toPx(player.mx, player.my);
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x - 4, y + 4);
    ctx.lineTo(x, y + 1.5);
    ctx.lineTo(x + 4, y + 4);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
  }, [player.mx, player.my, mappedMarkers, size]);

  return (
    <div
      role="button"
      aria-label="Open expanded map"
      onClick={onOpenExpanded}
      style={{
        width: `min(${size}px, 24vw)`,
        height: `min(${size}px, 24vw)`,
        borderRadius: '50%',
        overflow: 'hidden',
        cursor: onOpenExpanded ? 'pointer' : 'default',
        // pointerEvents only on this wrapper: the canvas itself stays inert so
        // a tap opens the map instead of reaching the gameplay layer below.
        pointerEvents: onOpenExpanded ? 'auto' : 'none',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        border: '1px solid rgba(200, 190, 160, 0.25)',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
