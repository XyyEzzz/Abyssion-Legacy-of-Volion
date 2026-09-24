'use client';

import { useGameStore } from '@/lib/store';
import { HUD_CONFIG as H } from '@/lib/hudConfig';
import { useEffect, useState } from 'react';

export default function DamageVignette() {
  const damageVignetteRequest = useGameStore(s => s.damageVignetteRequest);
  const [vignetteOpacity, setVignetteOpacity] = useState(0);

  useEffect(() => {
    if (!damageVignetteRequest) return;
    setVignetteOpacity(damageVignetteRequest.intensity);
    const start = Date.now();
    const duration = 600;
    let raf: number;
    const fade = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      setVignetteOpacity(damageVignetteRequest.intensity * (1 - t));
      if (t < 1) raf = requestAnimationFrame(fade);
    };
    raf = requestAnimationFrame(fade);
    return () => cancelAnimationFrame(raf);
  }, [damageVignetteRequest]);

  if (vignetteOpacity <= 0.01) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-50"
      style={{
        background: `radial-gradient(ellipse at center, transparent ${H.vignette.innerClear}, ${H.vignette.outerColor} 100%)`,
        opacity: vignetteOpacity,
        transition: `opacity ${H.vignette.transitionMs}ms ease-out`,
      }}
    />
  );
}
