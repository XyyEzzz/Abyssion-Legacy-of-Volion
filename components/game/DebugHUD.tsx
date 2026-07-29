'use client';

import React from 'react';
import { useGameStore } from '@/lib/store';

export default function DebugHUD() {
  const debug = useGameStore((state) => state.debug);
  const activeDialogue = useGameStore((state) => state.activeDialogue);

  if (!debug) return null;

  return (
    <div className="fixed top-24 left-4 z-[9999] pointer-events-auto bg-slate-950/90 border-2 border-amber-500/80 rounded-xl p-3 shadow-2xl text-xs font-mono text-slate-100 max-w-sm">
      <div className="flex items-center justify-between border-b border-amber-500/40 pb-1.5 mb-2">
        <span className="font-bold text-amber-400 text-sm">🛠️ LIVE NPC DEBUG OVERLAY</span>
        <span className="animate-pulse w-2 h-2 rounded-full bg-emerald-400"></span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-slate-400">Nearest NPC:</span>
          <span className="font-semibold text-sky-300">{debug.nearestNpcName || 'None'}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Current Distance:</span>
          <span className="font-semibold text-amber-300">
            {debug.currentDistance === 999 ? 'N/A' : `${debug.currentDistance} m`}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-400">isNear:</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
              debug.isNear ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50' : 'bg-red-950 text-red-300 border border-red-500/50'
            }`}
          >
            {debug.isNear ? 'TRUE' : 'FALSE'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">E Pressed:</span>
          <span className="text-slate-200">
            {debug.ePressedCount} times <span className="text-slate-500">({debug.lastEPressedTime})</span>
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">openDialogueForNpc Called:</span>
          <span className="text-slate-200">
            {debug.openDialogueCalledCount} times <span className="text-slate-500">({debug.lastOpenDialogueTime})</span>
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-400">activeDialogue != null:</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
              activeDialogue !== null
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {activeDialogue !== null ? 'TRUE' : 'FALSE'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-400">DialogueModal Mounted:</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
              debug.dialogueModalMounted
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {debug.dialogueModalMounted ? 'TRUE' : 'FALSE'}
          </span>
        </div>
      </div>
    </div>
  );
}
