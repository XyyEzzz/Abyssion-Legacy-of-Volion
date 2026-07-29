'use client';

import { useState, useEffect } from 'react';
import GameScene from './GameScene';
import UI from './UI';
import SettingsModal from './SettingsModal';
import { useGameStore } from '@/lib/store';
import { Smartphone } from 'lucide-react';

export default function Game() {
  const [mounted, setMounted] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const { loadGame } = useGameStore();

  useEffect(() => {
    loadGame();
    queueMicrotask(() => setMounted(true));

    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, [loadGame]);

  if (!mounted) return (
    <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
      Loading Abyssion...
    </div>
  );

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black touch-none">
      {isPortrait ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black text-white p-8 text-center">
          <Smartphone size={64} className="mb-4 animate-bounce rotate-90" />
          <h2 className="text-2xl font-bold mb-2">Please Rotate Your Device</h2>
          <p className="text-gray-400">Abyssion is best played in landscape mode.</p>
        </div>
      ) : (
        <>
          {/* 3D Scene */}
          <GameScene />
          
          {/* 2D UI Overlay */}
          <UI />
          
          {/* Modals */}
          <SettingsModal />
        </>
      )}
    </main>
  );
}
