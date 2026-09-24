'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';

const ARTWORK_URL = 'https://i.imgur.com/LLSqptq.png';

export default function LoadingScreen() {
  const setGamePhase = useGameStore(s => s.setGamePhase);
  const refreshSaveSlots = useGameStore(s => s.refreshSaveSlots);
  const [loadState, setLoadState] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    refreshSaveSlots();
    const img = new Image();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      setLoadState('ready');
      setGamePhase('menu');
    };

    img.onload = finish;
    img.onerror = finish;
    img.src = ARTWORK_URL;

    if (img.complete) {
      finish();
    }

    const fallback = window.setTimeout(finish, 3000);
    return () => {
      settled = true;
      img.onload = null;
      img.onerror = null;
      window.clearTimeout(fallback);
    };
  }, [refreshSaveSlots, setGamePhase]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black overflow-hidden"
      aria-busy={loadState === 'loading'}
    >
      {/* Full-screen artwork */}
      <img
        src={ARTWORK_URL}
        alt=""
        className="absolute inset-0 w-full h-full object-cover animate-[fadeIn_650ms_ease-out_both]"
        style={{ objectPosition: 'center 30%' }}
      />
      {/* Preserve the artwork composition while keeping technical copy legible. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/85" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />

      <div className="relative z-10 flex min-h-full flex-col justify-between p-5 sm:p-8 lg:p-12 animate-[fadeIn_500ms_ease-out_both]">
        <div className="flex items-start justify-between gap-4 font-mono text-[9px] uppercase tracking-[0.28em] text-white/45 sm:text-[10px]">
          <span>VOLION ARCHIVE // BOOT SEQUENCE</span>
          <span className="text-right">SYS / {loadState === 'ready' ? 'READY' : 'LOAD'}</span>
        </div>

        <div className="max-w-2xl pb-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px w-10 bg-[#e61919] sm:w-16" />
            <span className="font-mono text-[10px] uppercase tracking-[0.38em] text-white/55 sm:text-xs">
              Legacy of Volion
            </span>
          </div>
          <h1
            className="font-black uppercase leading-[0.8] tracking-[-0.06em] text-white"
            style={{
              fontSize: 'clamp(4rem, 14vw, 10rem)',
              textShadow: '0 5px 30px rgba(0,0,0,0.85)',
            }}
          >
            ABYSSION
          </h1>
          <p className="mt-5 max-w-md font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-white/55 sm:text-xs">
            The abyss stirs beneath Volion.
          </p>
        </div>

        <div className="w-full max-w-md self-center sm:self-start">
          <div className="mb-2 flex items-center justify-between gap-4 font-mono text-[9px] uppercase tracking-[0.24em] text-white/55 sm:text-[10px]">
            <span>{loadState === 'ready' ? 'WORLD DATA READY' : 'INITIALIZING WORLD DATA'}</span>
            <span className="flex items-center gap-2 text-white/35">
              <span className={`h-1.5 w-1.5 rounded-full ${loadState === 'ready' ? 'bg-[#e61919]' : 'animate-pulse bg-white/60'}`} />
              {loadState === 'ready' ? 'ONLINE' : 'STANDBY'}
            </span>
          </div>
          <div className={`h-px w-full ${loadState === 'ready' ? 'bg-[#e61919]' : 'bg-white/20'}`} />
        </div>
      </div>

      {/* Corner technical markers */}
      <div className="absolute top-3 left-3 font-mono text-gray-600 text-[10px] uppercase tracking-wider">
        REV / 01
      </div>
      <div className="absolute top-3 right-3 font-mono text-gray-600 text-[10px] uppercase tracking-wider">
        ABY / 001
      </div>
    </div>
  );
}
