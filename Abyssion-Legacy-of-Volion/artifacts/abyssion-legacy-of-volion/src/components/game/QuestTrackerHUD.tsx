'use client';

import React from 'react';
import { useGameStore } from '@/lib/store';

export default function QuestTrackerHUD() {
  const quests = useGameStore((state) => state.quests);
  const setShowQuestLog = useGameStore((state) => state.setShowQuestLog);

  // Active quests
  const activeQuests = quests.filter((q) => q.status === 'active' || q.status === 'ready_to_turn_in');

  if (activeQuests.length === 0) {
    return (
      <div className="pointer-events-auto">
        <button
          onClick={() => setShowQuestLog(true)}
          className="bg-slate-900/80 backdrop-blur-md text-amber-300 border border-slate-700/80 hover:border-amber-400 px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 hover:scale-105 active:scale-95 transition-all whitespace-nowrap min-w-0"
        >
          <span>📜</span>
          <span className="whitespace-nowrap">Open Quests [L]</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2 max-w-[260px] sm:max-w-[300px]">
      
      {/* HUD Header Button */}
      <button
        onClick={() => setShowQuestLog(true)}
        className="bg-slate-900/85 backdrop-blur-md text-amber-300 border border-slate-700/80 hover:border-amber-400 px-3 py-1 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
      >
        <span>📜 Quests [L]</span>
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      </button>

      {/* Quest Tracker Box */}
      <div className="w-full bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5">
        {activeQuests.map((quest) => {
          const isReady = quest.status === 'ready_to_turn_in';

          return (
            <div key={quest.id} className="flex flex-col gap-1 border-b border-slate-800/80 last:border-b-0 pb-2 last:pb-0">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${quest.type === 'main' ? 'text-amber-400' : 'text-sky-400'}`}>
                  {quest.title}
                </span>
                {isReady && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 animate-pulse">
                    Return to Giver!
                  </span>
                )}
              </div>

              {/* Objectives List */}
              <div className="flex flex-col gap-1 mt-0.5">
                {quest.objectives.map((obj) => {
                  const isComplete = obj.currentAmount >= obj.requiredAmount;

                  return (
                    <div key={obj.id} className="flex items-center justify-between text-[11px] leading-tight">
                      <span className={`flex items-center gap-1.5 ${isComplete ? 'text-emerald-400 line-through' : 'text-slate-300'}`}>
                        <span>{isComplete ? '✓' : '○'}</span>
                        <span className="truncate max-w-[170px] sm:max-w-[200px]">{obj.description}</span>
                      </span>
                      <span className={`font-bold ${isComplete ? 'text-emerald-400' : 'text-amber-300'}`}>
                        {obj.currentAmount}/{obj.requiredAmount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
