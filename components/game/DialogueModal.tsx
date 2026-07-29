'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/store';

export default function DialogueModal() {
  const activeDialogue = useGameStore((state) => state.activeDialogue);
  const advanceDialogue = useGameStore((state) => state.advanceDialogue);
  const closeDialogue = useGameStore((state) => state.closeDialogue);
  const acceptQuest = useGameStore((state) => state.acceptQuest);
  const completeQuest = useGameStore((state) => state.completeQuest);

  useEffect(() => {
    // Report component mounted in DOM
    useGameStore.getState().updateDebug({ dialogueModalMounted: true });
    return () => {
      useGameStore.getState().updateDebug({ dialogueModalMounted: false });
    };
  }, []);

  useEffect(() => {
    console.log('[DialogueModal component] activeDialogue state updated:', activeDialogue);
    useGameStore.getState().updateDebug({ activeDialogueNotNull: activeDialogue !== null });
  }, [activeDialogue]);

  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const fullTextRef = useRef('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentText = activeDialogue ? activeDialogue.pages[activeDialogue.currentPage] || '' : '';

  // Typewriter effect logic
  useEffect(() => {
    if (!currentText) return;
    fullTextRef.current = currentText;

    let index = 0;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      index++;
      setDisplayedText(fullTextRef.current.slice(0, index));
      if (index >= fullTextRef.current.length) {
        setIsTyping(false);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 22);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentText]);

  // Listen for 'E', 'Space', 'Enter', or 'Escape'
  useEffect(() => {
    if (!activeDialogue) return;
    const isLast = activeDialogue.currentPage === activeDialogue.pages.length - 1;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDialogue();
      } else if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter') {
        if (isTyping) {
          if (timerRef.current) clearInterval(timerRef.current);
          setDisplayedText(fullTextRef.current);
          setIsTyping(false);
        } else if (!isLast) {
          advanceDialogue();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTyping, activeDialogue, advanceDialogue, closeDialogue]);

  if (!activeDialogue) return null;

  const isLastPage = activeDialogue.currentPage === activeDialogue.pages.length - 1;
  const questToOffer = activeDialogue.questToOffer;
  const questToTurnIn = activeDialogue.questToTurnIn;

  const handleCardClick = () => {
    if (isTyping) {
      if (timerRef.current) clearInterval(timerRef.current);
      setDisplayedText(fullTextRef.current);
      setIsTyping(false);
    } else if (!isLastPage) {
      advanceDialogue();
    }
  };

  // Avatar Icon per NPC type
  const getAvatarIcon = () => {
    switch (activeDialogue.npcType) {
      case 'villager':
        return '👴';
      case 'merchant':
        return '👩‍🌾';
      case 'blacksmith':
        return '⚒️';
      case 'guard':
        return '🛡️';
      case 'researcher':
        return '🧙‍♂️';
      default:
        return '👤';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 sm:pb-12 px-4 pointer-events-auto bg-black/40 backdrop-blur-[2px]">
      <div
        onClick={handleCardClick}
        className="w-full max-w-2xl bg-slate-900/95 text-slate-100 rounded-2xl border-2 border-amber-500/60 shadow-2xl p-5 sm:p-6 flex flex-col gap-4 relative animate-in fade-in slide-in-from-bottom-6 duration-200 cursor-pointer select-none"
      >
        {/* Header - Speaker Info */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-2xl shadow-inner">
              {getAvatarIcon()}
            </div>
            <div>
              <h3 className="font-bold text-lg text-amber-300 leading-tight">{activeDialogue.npcName}</h3>
              <p className="text-xs text-slate-400 font-medium">{activeDialogue.npcRole}</p>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              closeDialogue();
            }}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
            title="Close [Esc]"
          >
            ✕
          </button>
        </div>

        {/* Body - Typewriter Text */}
        <div className="min-h-[70px] text-sm sm:text-base text-slate-200 leading-relaxed font-sans">
          {displayedText}
          {isTyping && <span className="inline-block w-2 h-4 bg-amber-400 ml-1 animate-pulse" />}
        </div>

        {/* Quest Offer Details Card */}
        {isLastPage && questToOffer && (
          <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                📜 Quest Available: {questToOffer.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase font-semibold">
                {questToOffer.type} Quest
              </span>
            </div>
            <p className="text-xs text-slate-300">{questToOffer.description}</p>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20 text-xs">
              <span className="text-slate-400 font-semibold">Rewards:</span>
              <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold">
                🪙 {questToOffer.rewards.coins} Gold
              </span>
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                ✨ {questToOffer.rewards.exp} EXP
              </span>
              {questToOffer.rewards.items?.map((item, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  🧪 {item.name} x{item.count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Quest Turn-In Card */}
        {isLastPage && questToTurnIn && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5 flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                🏆 Ready to Claim: {questToTurnIn.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase font-semibold">
                Completed
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-400 font-semibold">Claiming Rewards:</span>
              <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold">
                🪙 +{questToTurnIn.rewards.coins} Gold
              </span>
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                ✨ +{questToTurnIn.rewards.exp} EXP
              </span>
              {questToTurnIn.rewards.items?.map((item, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  🧪 {item.name} x{item.count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span>Page {activeDialogue.currentPage + 1} of {activeDialogue.pages.length}</span>
            <span>•</span>
            <span>Press [E] or Click to continue</span>
          </div>

          <div className="flex items-center gap-2">
            {isLastPage && questToOffer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  acceptQuest(questToOffer.id);
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-xs sm:text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                Accept Quest
              </button>
            )}

            {isLastPage && questToTurnIn && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  completeQuest(questToTurnIn.id);
                }}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
              >
                Claim Rewards!
              </button>
            )}

            {!isLastPage ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick();
                }}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs sm:text-sm border border-slate-700 active:scale-95 transition-all"
              >
                {isTyping ? 'Skip' : 'Next ▶'}
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeDialogue();
                }}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs sm:text-sm border border-slate-700 active:scale-95 transition-all"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
