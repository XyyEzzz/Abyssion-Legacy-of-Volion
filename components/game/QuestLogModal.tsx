'use client';

import React, { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/store';
import { Quest } from '@/lib/questData';

export default function QuestLogModal() {
  const showQuestLog = useGameStore((state) => state.ui.showQuestLog);
  const setShowQuestLog = useGameStore((state) => state.setShowQuestLog);
  const quests = useGameStore((state) => state.quests);
  const completeQuest = useGameStore((state) => state.completeQuest);

  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  const filteredQuests = quests.filter((q) => {
    if (activeTab === 'active') return q.status === 'active' || q.status === 'ready_to_turn_in';
    return q.status === 'completed';
  });

  const selectedQuestIdValid = selectedQuestId && filteredQuests.some((q) => q.id === selectedQuestId);
  const effectiveSelectedQuestId = selectedQuestIdValid
    ? selectedQuestId
    : filteredQuests.length > 0
    ? filteredQuests[0].id
    : null;

  // Toggle with 'J' or 'j' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j' || e.key === 'J') {
        setShowQuestLog(!useGameStore.getState().ui.showQuestLog);
      } else if (e.key === 'Escape' && showQuestLog) {
        setShowQuestLog(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQuestLog, setShowQuestLog]);

  if (!showQuestLog) return null;

  const selectedQuest = quests.find((q) => q.id === effectiveSelectedQuestId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md pointer-events-auto">
      <div className="w-full max-w-3xl bg-slate-900 border-2 border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[520px] max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-slate-800/80 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📜</span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-amber-300">Quest Journal</h2>
              <p className="text-xs text-slate-400">Track active objectives, side quests, and rewards</p>
            </div>
          </div>

          <button
            onClick={() => setShowQuestLog(false)}
            className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'active'
                ? 'border-amber-400 text-amber-300 bg-slate-800/40 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Active Quests</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-amber-400 border border-slate-700">
              {quests.filter((q) => q.status === 'active' || q.status === 'ready_to_turn_in').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'completed'
                ? 'border-emerald-400 text-emerald-300 bg-slate-800/40 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Completed</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-emerald-400 border border-slate-700">
              {quests.filter((q) => q.status === 'completed').length}
            </span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 overflow-hidden">
          
          {/* Left List Column */}
          <div className="md:col-span-2 border-r border-slate-800 overflow-y-auto p-3 flex flex-col gap-2">
            {filteredQuests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12 text-center text-xs">
                <span>📭</span>
                <p className="mt-1">No {activeTab} quests found.</p>
              </div>
            ) : (
              filteredQuests.map((quest) => {
                const isSelected = quest.id === effectiveSelectedQuestId;
                const isReady = quest.status === 'ready_to_turn_in';

                return (
                  <button
                    key={quest.id}
                    onClick={() => setSelectedQuestId(quest.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 relative ${
                      isSelected
                        ? 'bg-amber-950/40 border-amber-500/60 shadow-lg'
                        : 'bg-slate-800/30 border-slate-800 hover:bg-slate-800/70 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold uppercase tracking-wider ${quest.type === 'main' ? 'text-amber-400' : 'text-sky-400'}`}>
                        {quest.type} Quest
                      </span>
                      {isReady && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse font-semibold">
                          Ready to Turn In
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-sm text-slate-100">{quest.title}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Detail Column */}
          <div className="md:col-span-3 p-5 overflow-y-auto flex flex-col gap-4 bg-slate-900/60">
            {selectedQuest ? (
              <>
                <div className="border-b border-slate-800 pb-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${
                      selectedQuest.type === 'main'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    }`}>
                      {selectedQuest.type} Quest
                    </span>
                    {selectedQuest.status === 'completed' && (
                      <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        ✓ Completed
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-amber-300 mt-1">{selectedQuest.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{selectedQuest.description}</p>
                </div>

                {/* Objectives */}
                <div className="flex flex-col gap-2">
                  <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Objectives</h4>
                  <div className="flex flex-col gap-2">
                    {selectedQuest.objectives.map((obj) => {
                      const isComplete = obj.currentAmount >= obj.requiredAmount;
                      const progressPct = Math.min(100, (obj.currentAmount / obj.requiredAmount) * 100);

                      return (
                        <div
                          key={obj.id}
                          className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold flex items-center gap-2 ${isComplete ? 'text-emerald-400 line-through' : 'text-slate-200'}`}>
                              <span>{isComplete ? '✅' : '🎯'}</span>
                              <span>{obj.description}</span>
                            </span>
                            <span className="font-bold text-slate-400">
                              {obj.currentAmount}/{obj.requiredAmount}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rewards */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Rewards</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="px-3 py-1.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs font-bold flex items-center gap-1.5">
                      <span>🪙</span>
                      <span>+{selectedQuest.rewards.coins} Gold</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center gap-1.5">
                      <span>✨</span>
                      <span>+{selectedQuest.rewards.exp} EXP</span>
                    </div>
                    {selectedQuest.rewards.items?.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                      >
                        <span>🧪</span>
                        <span>{item.name} x{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Claim Button */}
                {selectedQuest.status === 'ready_to_turn_in' && (
                  <div className="pt-2">
                    <button
                      onClick={() => completeQuest(selectedQuest.id)}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-emerald-500/20 active:scale-98 transition-all"
                    >
                      🏆 Turn In Quest & Claim Rewards!
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12 text-center text-xs">
                <p>Select a quest to view details.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-6 py-2.5 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Press [J] to toggle Quest Journal</span>
          <span>Click on NPCs marked with ! or ? to accept or finish quests</span>
        </div>
      </div>
    </div>
  );
}
