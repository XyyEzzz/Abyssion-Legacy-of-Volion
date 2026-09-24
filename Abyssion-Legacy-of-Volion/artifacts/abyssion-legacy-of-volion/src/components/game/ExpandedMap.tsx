'use client';

/**
 * Expanded map overlay (M1W2D2 interactive map, cartography revamp).
 *
 * Fantasy-cartography presentation of the SAME world->map mapping the HUD
 * minimap uses (lib/minimap): parchment base, inked region boundary, seeded
 * terrain texture patches, registered landmarks and the player marker.
 *
 * Hard guarantees (unchanged from the foundation):
 * - INPUT ISOLATION: all pointer/wheel/touch events are consumed here
 *   (stopPropagation + preventDefault). Map drag never moves the player,
 *   map zoom never zooms the camera, map taps never attack/interact.
 *   Landmark tap ONLY recenters the map camera (view state) — it never
 *   moves the player, rotates the gameplay camera or triggers gameplay.
 * - TRANSFORMS ARE VIEW-ONLY: zoom/pan live in local component state and are
 *   never written to the store, physics, world or save data. State is
 *   transient: the overlay unmounts on close and on any session reset.
 * - BOUNDED: zoom clamped to [0.8, 4], pan clamped so the map cannot run away.
 *   All math guards against NaN/Infinity (inputs are finite-checked).
 * - NO FABRICATED CONTENT: terrain patches are decorative texture seeded from
 *   the region id — they never depict named/durable geography that does not
 *   exist. Only LANDMARKS (registered world content) carry names.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { worldToMap, clamp01, REGIONS, LANDMARKS } from '@/lib/minimap';
import { HUD_CONFIG as H } from '@/lib/hudConfig';

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 4.0;
/** Screen-space hit radius (CSS px) for landmark tap-to-recenter. */
const LANDMARK_HIT_RADIUS = 16;
/** Pointer travel under this many px counts as a tap, not a drag. */
const TAP_MAX_TRAVEL = 6;

/** Finite-safe clamp; anything non-finite collapses to `fallback`. */
function safeClamp(v: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

/** Deterministic LCG → [0,1); seeded per region so the parchment texture is
 * stable across renders and sessions with zero per-frame allocation. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface TerrainPatch {
  u: number; // 0..1 region-relative X
  v: number; // 0..1 region-relative Z
  rx: number; // radius as fraction of region width
  rz: number;
  /** 0 = meadow (light), 1 = woodland (dark), 2 = stone (grey-brown) */
  kind: 0 | 1 | 2;
}

/** Memoizable static terrain texture for a region: ~40 seeded organic patches.
 * Purely decorative parchment texture — NOT geographic data. */
function buildTerrain(regionId: string): TerrainPatch[] {
  let hash = 2166136261;
  for (let i = 0; i < regionId.length; i++) {
    hash = (hash ^ regionId.charCodeAt(i)) * 16777619;
  }
  const rng = makeRng(hash >>> 0);
  const patches: TerrainPatch[] = [];
  for (let i = 0; i < 40; i++) {
    const r = rng();
    patches.push({
      u: rng(),
      v: rng(),
      rx: 0.03 + r * 0.07,
      rz: 0.03 + rng() * 0.07,
      kind: (i % 5 === 0 ? 2 : i % 2) as 0 | 1 | 2,
    });
  }
  return patches;
}

const TERRAIN_FILL = ['rgba(174, 160, 116, 0.35)', 'rgba(120, 130, 88, 0.4)', 'rgba(148, 136, 118, 0.4)'];

interface PanState {
  x: number;
  y: number;
}

export default function ExpandedMap({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pos = useGameStore(s => s.player.position);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; travel: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  // Latest render size (CSS px) for pan bounds/hit-testing; refreshed on draw.
  const sizeRef = useRef(600);
  // Screen-space landmark positions refreshed during draw (tap hit-testing).
  const landmarkHitsRef = useRef<{ id: string; x: number; z: number }[]>([]);

  // Static decorative texture, memoized per region — built once, reused.
  const terrain = useMemo(() => buildTerrain(REGIONS[0].id), []);

  const player = useMemo(() => {
    const { mx, my } = worldToMap(pos[0], pos[2], REGIONS[0]);
    return { mx: clamp01(mx), my: clamp01(my) };
  }, [pos[0], pos[2]]);

  /** Keep content in view: clamps pan so the map cannot run away. */
  const clampPan = useCallback((p: PanState, z: number, size: number): PanState => {
    const maxX = Math.max(0, (size * z - size) / 2);
    const maxY = Math.max(0, (size * z - size) / 2);
    return {
      x: safeClamp(p.x, -maxX, maxX, 0),
      y: safeClamp(p.y, -maxY, maxY, 0),
    };
  }, []);

  /** Recenter the VIEW on a map-space point (view-only; never moves the player). */
  const centerOnMapPoint = useCallback((mx: number, my: number, nextZoom?: number) => {
    const size = sizeRef.current;
    const z = nextZoom ?? zoom;
    setZoom(z);
    // Compute pan from the NEW zoom and set both together so no frame renders
    // pan clamped against the old zoom (stale-frame jitter invariant).
    setPan(() => {
      const px = (mx - 0.5) * size * z;
      const py = (my - 0.5) * size * z;
      return clampPan({ x: -px, y: -py }, z, size);
    });
  }, [zoom, clampPan]);

  const centerOnPlayer = useCallback(() => {
    // Zoom in a little so recentering is meaningful; player stays centered.
    centerOnMapPoint(player.mx, player.my, Math.max(zoom, 1.5));
  }, [player.mx, player.my, zoom, centerOnMapPoint]);

  // Draw loop: redraw on any relevant change (player move, zoom, pan, resize).
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const size = Math.min(wrap.clientWidth || 600, wrap.clientHeight || 600);
    sizeRef.current = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // ── Parchment backdrop (outside the region: aged paper) ──
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#e9dcb8');
    grad.addColorStop(0.5, '#e2d3a8');
    grad.addColorStop(1, '#d9c795');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    // Aged-paper vignette (static, cheap).
    const vig = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(92, 70, 40, 0.28)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, size, size);

    const view = size * zoom;
    const ox = size / 2 - view / 2 + pan.x;
    const oy = size / 2 - view / 2 + pan.y;

    // ── Layer 1+2: known-world terrain (region interior) ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();

    ctx.fillStyle = 'rgba(196, 180, 128, 0.9)';
    ctx.fillRect(ox, oy, view, view);
    // Subtle inner shading so the region reads as land on parchment.
    const land = ctx.createRadialGradient(ox + view / 2, oy + view / 2, view * 0.1, ox + view / 2, oy + view / 2, view * 0.75);
    land.addColorStop(0, 'rgba(214, 198, 140, 0.5)');
    land.addColorStop(1, 'rgba(160, 142, 96, 0.55)');
    ctx.fillStyle = land;
    ctx.fillRect(ox, oy, view, view);

    // Seeded decorative texture patches (deterministic, drawn per redraw only).
    for (const p of terrain) {
      const cx = ox + p.u * view;
      const cy = oy + p.v * view;
      const rx = p.rx * view;
      const rz = p.rz * view;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rz, (p.u + p.v) * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = TERRAIN_FILL[p.kind];
      ctx.fill();
    }

    // ── Inked region boundary: double coastline stroke + hatch shading ──
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(72, 54, 32, 0.85)';
    ctx.strokeRect(ox, oy, view, view);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(72, 54, 32, 0.5)';
    ctx.strokeRect(ox - 4, oy - 4, view + 8, view + 8);
    // Water hatch just outside the coast (cartography convention).
    ctx.strokeStyle = 'rgba(72, 54, 32, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const o = 7 + i * 4;
      ctx.beginPath();
      ctx.moveTo(ox - o, oy + o * 2); ctx.lineTo(ox - o, oy + view - o * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox + view + o, oy + o * 2); ctx.lineTo(ox + view + o, oy + view - o * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox + o * 2, oy - o); ctx.lineTo(ox + view - o * 2, oy - o); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox + o * 2, oy + view + o); ctx.lineTo(ox + view - o * 2, oy + view + o); ctx.stroke();
    }

    // Coordinate grid (subtle, derived from region size — no invented content).
    ctx.strokeStyle = 'rgba(72, 54, 32, 0.14)';
    ctx.lineWidth = 1;
    const step = view / 8;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(ox + step * i, oy);
      ctx.lineTo(ox + step * i, oy + view);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox, oy + step * i);
      ctx.lineTo(ox + view, oy + step * i);
      ctx.stroke();
    }

    // ── Layer 4: named landmarks (registered world content only) ──
    // Hit-test list rebuilt during draw; used by tap handling below.
    const hitList: { id: string; x: number; z: number }[] = [];
    landmarkHitsRef.current = hitList;
    for (const lm of LANDMARKS) {
      const { mx, my } = worldToMap(lm.x, lm.z, REGIONS[0]);
      const lx = ox + clamp01(mx) * view;
      const ly = oy + clamp01(my) * view;
      hitList.push({ id: lm.id, x: lm.x, z: lm.z });
      // Parchment medallion.
      ctx.beginPath();
      ctx.arc(lx, ly, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 248, 224, 0.95)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(72, 54, 32, 0.85)';
      ctx.stroke();
      // Inner seal dot.
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(146, 64, 14, 0.9)';
      ctx.fill();
      if (zoom >= 1.2) {
        ctx.fillStyle = 'rgba(72, 54, 32, 0.95)';
        ctx.font = '600 12px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(lm.name, lx, ly - 11);
        ctx.textAlign = 'start';
      }
    }

    // ── Layer 5: player marker (gold chevron, same identity as the minimap) ──
    const px = ox + player.mx * view;
    const py = oy + player.my * view;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(72, 54, 32, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px, py - 10);
    ctx.lineTo(px - 7.5, py + 8);
    ctx.lineTo(px, py + 3);
    ctx.lineTo(px + 7.5, py + 8);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(72, 54, 32, 0.9)';
    ctx.stroke();
    ctx.restore();

    // ── Layer 6: compass rose (world-oriented; -Z is up/north) ──
    const cxN = 34;
    const cyN = 40;
    ctx.save();
    ctx.strokeStyle = 'rgba(72, 54, 32, 0.8)';
    ctx.fillStyle = 'rgba(72, 54, 32, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cxN, cyN, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cxN, cyN, 11, 0, Math.PI * 2); ctx.stroke();
    // North needle.
    ctx.beginPath();
    ctx.moveTo(cxN, cyN - 14);
    ctx.lineTo(cxN - 4, cyN + 6);
    ctx.lineTo(cxN + 4, cyN + 6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(146, 64, 14, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(72, 54, 32, 0.9)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(72, 54, 32, 0.95)';
    ctx.font = 'bold 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cxN, cyN + 30);
    ctx.restore();
  }, [player.mx, player.my, zoom, pan.x, pan.y, terrain]);

  // Zoom via wheel — preserves the geographic point under the cursor.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const size = sizeRef.current;
      setZoom(prevZ => {
        const nextZ = safeClamp(prevZ * (e.deltaY < 0 ? 1.15 : 1 / 1.15), ZOOM_MIN, ZOOM_MAX, prevZ);
        if (nextZ === prevZ) return prevZ;
        setPan(prevP => {
          const rect = el.getBoundingClientRect();
          const cx = e.clientX - rect.left - size / 2;
          const cy = e.clientY - rect.top - size / 2;
          const nx = (cx - prevP.x) / prevZ;
          const ny = (cy - prevP.y) / prevZ;
          return clampPan({ x: cx - nx * nextZ, y: cy - ny * nextZ }, nextZ, size);
        });
        return nextZ;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampPan]);

  // Pinch zoom (two-pointer touch), preserving midpoint.
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      const el = wrapRef.current;
      const size = sizeRef.current;
      if (!pinchRef.current || !el) {
        pinchRef.current = { dist, zoom };
        return;
      }
      const start = pinchRef.current;
      const nextZ = safeClamp(start.zoom * (dist / Math.max(1, start.dist)), ZOOM_MIN, ZOOM_MAX, start.zoom);
      setZoom(nextZ);
      setPan(prevP => {
        const rect = el.getBoundingClientRect();
        const cx = mid.x - rect.left - size / 2;
        const cy = mid.y - rect.top - size / 2;
        const nx = (cx - prevP.x) / start.zoom;
        const ny = (cy - prevP.y) / start.zoom;
        return clampPan({ x: cx - nx * nextZ, y: cy - ny * nextZ }, nextZ, size);
      });
    }
  }, [zoom, clampPan]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom,
      };
      dragRef.current = null;
    } else if (e.touches.length === 1) {
      dragRef.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY, travel: 0 };
      pinchRef.current = null;
    }
  }, [zoom]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) dragRef.current = null;
  }, []);

  // Pointer drag pan (mouse or single touch via pointer events) + tap detection.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, travel: 0 };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const d = dragRef.current;
    if (d === null || !d.active) return;
    const size = sizeRef.current;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.travel += Math.hypot(dx, dy);
    setPan(prev => clampPan({ x: prev.x + dx, y: prev.y + dy }, zoom, size));
  }, [zoom, clampPan]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.travel > TAP_MAX_TRAVEL) return; // it was a drag, not a tap
    // LANDMARK TAP → recenter map view to the landmark. View-only: this never
    // moves the player, triggers interaction, attacks, or touches gameplay.
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const size = sizeRef.current;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // Mirror the draw math: content origin + zoom-scaled region extent.
    const view = size * zoom;
    const ox = size / 2 - view / 2 + pan.x;
    const oy = size / 2 - view / 2 + pan.y;
    for (const hit of landmarkHitsRef.current) {
      const { mx: lmx, my: lmy } = worldToMap(hit.x, hit.z, REGIONS[0]);
      const lx = ox + clamp01(lmx) * view;
      const ly = oy + clamp01(lmy) * view;
      if (Math.hypot(px - lx, py - ly) <= LANDMARK_HIT_RADIUS) {
        centerOnMapPoint(clamp01(lmx), clamp01(lmy), Math.max(zoom, 1.8));
        return;
      }
    }
  }, [zoom, pan.x, pan.y, centerOnMapPoint]);

  // Escape closes (documented convention; consumed, not leaked to gameplay).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const btn = {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid rgba(72, 54, 32, 0.7)',
    background: 'rgba(226, 211, 168, 0.95)',
    color: '#4a3722',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'Georgia, serif',
    cursor: 'pointer',
  } as const;

  return (
    <div
      ref={wrapRef}
      // Full-screen modal: absorbs every pointer event so nothing below reacts.
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 'min(92vw, 640px)',
          height: 'min(80vh, 640px)',
          borderRadius: 10,
          overflow: 'hidden',
          border: '3px solid rgba(72, 54, 32, 0.85)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' }}
        />
        {/* Controls: top-right close, bottom-center zoom/center. */}
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 8 }}>
          <button type="button" style={btn} onClick={e => { e.stopPropagation(); onClose(); }}>
            ✕ Close
          </button>
        </div>
        <div style={{
          position: 'absolute', bottom: 12, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', gap: 10,
        }}>
          <button
            type="button"
            style={btn}
            onClick={e => {
              e.stopPropagation();
              const size = sizeRef.current;
              setZoom(z => {
                const nz = safeClamp(z * 1.25, ZOOM_MIN, ZOOM_MAX, z);
                setPan(p => clampPan(p, nz, size));
                return nz;
              });
            }}
          >
            ＋
          </button>
          <button type="button" style={btn} onClick={e => { e.stopPropagation(); centerOnPlayer(); }}>
            ⌖ Player
          </button>
          <button
            type="button"
            style={btn}
            onClick={e => {
              e.stopPropagation();
              const size = sizeRef.current;
              setZoom(z => {
                const nz = safeClamp(z / 1.25, ZOOM_MIN, ZOOM_MAX, z);
                setPan(p => clampPan(p, nz, size));
                return nz;
              });
            }}
          >
            －
          </button>
        </div>
      </div>
    </div>
  );
}
