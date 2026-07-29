'use client';

import { useGameStore } from '@/lib/store';
import { Settings, Map as MapIcon, Sword, Shield, Zap, Flame, Heart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import DialogueModal from './DialogueModal';
import QuestLogModal from './QuestLogModal';
import QuestTrackerHUD from './QuestTrackerHUD';

export default function UI() {
  const { player, setShowSettings, setInputs } = useGameStore();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 1024 || 'ontouchstart' in window);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const joystickRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const joystickPointerId = useRef<number | null>(null);
  const cameraPointerId = useRef<number | null>(null);
  const buttonPointers = useRef<Map<number, 'jump' | 'attack' | 'dodge'>>(new Map());
  
  const joystickOrigin = useRef<{x: number, y: number} | null>(null);
  const lastCameraPos = useRef<{x: number, y: number} | null>(null);
  const currentCameraAngle = useRef<number>(0);

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickOrigin.current || !joystickRef.current || !thumbRef.current) return;
    
    const rect = joystickRef.current.getBoundingClientRect();
    const maxRadius = rect.width / 2;
    
    let dx = clientX - joystickOrigin.current.x;
    let dy = clientY - joystickOrigin.current.y;
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > maxRadius) {
      dx = (dx / distance) * maxRadius;
      dy = (dy / distance) * maxRadius;
    }
    
    thumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    
    const nx = dx / maxRadius;
    const ny = dy / maxRadius;
    
    setInputs({ joystick: { x: nx, y: ny } });
  };

  const handlePointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    if (e.clientX < window.innerWidth / 2) {
      if (joystickPointerId.current === null) {
        joystickPointerId.current = e.pointerId;
        if (joystickRef.current) {
          const rect = joystickRef.current.getBoundingClientRect();
          joystickOrigin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        } else {
          joystickOrigin.current = { x: e.clientX, y: e.clientY };
        }
        updateJoystick(e.clientX, e.clientY);
      }
    } else {
      if (cameraPointerId.current === null) {
        cameraPointerId.current = e.pointerId;
        lastCameraPos.current = { x: e.clientX, y: e.clientY };
      }
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (e.pointerId === joystickPointerId.current) {
      updateJoystick(e.clientX, e.clientY);
    } else if (e.pointerId === cameraPointerId.current && lastCameraPos.current) {
      const dx = e.clientX - lastCameraPos.current.x;
      currentCameraAngle.current -= dx * 0.008;
      setInputs({ cameraAngle: currentCameraAngle.current });
      lastCameraPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (e.pointerId === joystickPointerId.current) {
      joystickPointerId.current = null;
      joystickOrigin.current = null;
      if (thumbRef.current) {
        thumbRef.current.style.transform = `translate(0px, 0px)`;
      }
      setInputs({ joystick: { x: 0, y: 0 } });
    } else if (e.pointerId === cameraPointerId.current) {
      cameraPointerId.current = null;
      lastCameraPos.current = null;
    } else if (buttonPointers.current.has(e.pointerId)) {
      const action = buttonPointers.current.get(e.pointerId);
      buttonPointers.current.delete(e.pointerId);
      if (action) {
        setInputs({ [action]: false });
      }
    }
  };

  const handleButtonPointerDown = (action: 'jump' | 'attack' | 'dodge', e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    buttonPointers.current.set(e.pointerId, action);
    setInputs({ [action]: true });
  };

  const handleButtonPointerUp = (action: 'jump' | 'attack' | 'dodge', e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (buttonPointers.current.has(e.pointerId)) {
      buttonPointers.current.delete(e.pointerId);
    }
    setInputs({ [action]: false });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q' || e.key === 'h' || e.key === 'H') {
        useGameStore.getState().useConsumableItem();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onDown = (e: PointerEvent) => handlePointerDown(e);
    const onMove = (e: PointerEvent) => handlePointerMove(e);
    const onUp = (e: PointerEvent) => handlePointerUp(e);

    container.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    
    return () => {
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-10 select-none overflow-hidden touch-none"
      style={{ padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}
    >
      
      {/* Top Left - Player Stats & Quick Heal */}
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8 flex flex-col gap-2 pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-40 sm:w-64 h-5 sm:h-6 bg-gray-800 rounded-full border-2 border-gray-900 overflow-hidden relative shadow-lg">
            <div 
              className="h-full bg-red-600 transition-all duration-200" 
              style={{ width: `${(player.health / player.maxHealth) * 100}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold text-white drop-shadow-md">
              HP {Math.round(player.health)}/{player.maxHealth}
            </span>
          </div>

          {/* Quick Heal Button */}
          <button
            onClick={() => useGameStore.getState().useConsumableItem()}
            className="relative px-3 py-1.5 bg-emerald-900/90 border-2 border-emerald-500 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all active:scale-95"
            title="Use Healing Item (Key Q or H)"
          >
            <span>🧪</span>
            <span className="hidden sm:inline">Heal</span>
            <span className="bg-emerald-950 px-1.5 py-0.5 rounded text-[10px] text-emerald-300">
              x{player.inventory.filter(i => ['Health Potion', 'Small Potion', 'Bread', 'Apple'].includes(i.name)).reduce((a, b) => a + b.count, 0)}
            </span>
          </button>
        </div>
        
        <div className="w-28 sm:w-48 h-3 sm:h-4 bg-gray-800 rounded-full border-2 border-gray-900 overflow-hidden relative shadow-lg">
          <div 
            className="h-full bg-green-500 transition-all duration-200" 
            style={{ width: `${(player.stamina / player.maxStamina) * 100}%` }}
          />
        </div>

        {/* Level & EXP Bar */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold shadow-md">
            Lv. {player.level || 1}
          </span>
          <div className="w-24 sm:w-40 h-2.5 sm:h-3 bg-gray-800 rounded-full border border-gray-900 overflow-hidden relative shadow-md">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${((player.exp || 0) / (player.maxExp || 100)) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline">
            {player.exp || 0}/{player.maxExp || 100} EXP
          </span>
        </div>
      </div>

      {/* Quest Tracker HUD */}
      <QuestTrackerHUD />

      {/* Visual Interaction Debug HUD Overlay */}
      <DebugHUDOverlay />

      {/* Overlays / Modals */}
      <DialogueModal />
      <QuestLogModal />

      {/* Top Right - Minimap & Settings */}
      <div className="absolute top-4 right-4 sm:top-8 sm:right-8 flex flex-col items-end gap-2 sm:gap-4 pointer-events-auto">
        <button 
          onTouchStart={(e) => { e.stopPropagation(); setShowSettings(true); }}
          onMouseDown={(e) => { e.stopPropagation(); setShowSettings(true); }}
          className="p-2 sm:p-3 bg-gray-900/80 rounded-full hover:bg-gray-800 text-white backdrop-blur-sm shadow-lg border border-gray-700/50"
        >
          <Settings size={20} className="sm:w-6 sm:h-6" />
        </button>
        
        <div className="w-24 h-24 sm:w-40 sm:h-40 bg-gray-900/80 rounded-full border-4 border-gray-700 backdrop-blur-sm flex items-center justify-center relative overflow-hidden shadow-xl">
           <MapIcon className="text-gray-500 opacity-50 sm:w-12 sm:h-12" size={32} />
           {/* Fake player indicator */}
           <div className="absolute w-2 h-2 sm:w-3 sm:h-3 bg-blue-400 rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_8px_#60a5fa]" />
        </div>
      </div>

      {/* Bottom Center - Skill Slots (Desktop mostly) */}
      {!isMobile && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-auto">
          {[
            { icon: Sword, key: '1' },
            { icon: Shield, key: '2' },
            { icon: Zap, key: '3' },
            { icon: Flame, key: '4' }
          ].map((skill, i) => (
            <div key={i} className="relative group">
              <button className="w-16 h-16 bg-gray-900/80 border-2 border-gray-700 rounded-xl flex items-center justify-center text-white hover:border-yellow-400 hover:bg-gray-800 transition-all backdrop-blur-sm shadow-lg">
                <skill.icon size={32} />
              </button>
              <span className="absolute -top-3 -right-3 w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-300 border border-gray-600">
                {skill.key}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mobile Controls */}
      {isMobile && (
        <>
          {/* Virtual Joystick Zone */}
          <div 
            className="absolute bottom-8 left-8 sm:bottom-12 sm:left-12 w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gray-900/40 border-2 border-gray-500/50 backdrop-blur-sm pointer-events-none"
            ref={joystickRef}
          >
            <div 
              ref={thumbRef}
              className="absolute top-1/2 left-1/2 w-10 h-10 sm:w-14 sm:h-14 bg-white/60 rounded-full -ml-5 -mt-5 sm:-ml-7 sm:-mt-7 shadow-lg pointer-events-none transition-transform duration-75 ease-out"
              style={{ transform: 'translate(0px, 0px)' }}
            />
          </div>

          {/* Action Buttons */}
          <div className="absolute bottom-8 right-8 sm:bottom-12 sm:right-12 flex items-end justify-end pointer-events-auto w-48 h-48 sm:w-56 sm:h-56">
             {/* Attack Button (Bottom Right) */}
             <button 
               onPointerDown={(e) => handleButtonPointerDown('attack', e)}
               onPointerUp={(e) => handleButtonPointerUp('attack', e)}
               onPointerCancel={(e) => handleButtonPointerUp('attack', e)}
               className="absolute bottom-0 right-0 w-20 h-20 sm:w-24 sm:h-24 bg-gray-900/80 border-4 border-yellow-500/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none shadow-[0_0_15px_rgba(234,179,8,0.3)] select-none"
             >
               <Sword size={36} className="sm:w-10 sm:h-10 pointer-events-none" />
             </button>
             
             {/* Jump Button (Top Right of Attack) */}
             <button 
               onPointerDown={(e) => handleButtonPointerDown('jump', e)}
               onPointerUp={(e) => handleButtonPointerUp('jump', e)}
               onPointerCancel={(e) => handleButtonPointerUp('jump', e)}
               className="absolute bottom-[90px] right-[10px] sm:bottom-[110px] sm:right-[10px] w-14 h-14 sm:w-16 sm:h-16 bg-gray-900/60 border-2 border-gray-500/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none shadow-lg select-none"
             >
               <span className="text-[10px] sm:text-xs font-bold pointer-events-none">JUMP</span>
             </button>

             {/* Dodge Button (Left of Attack) */}
             <button 
               onPointerDown={(e) => handleButtonPointerDown('dodge', e)}
               onPointerUp={(e) => handleButtonPointerUp('dodge', e)}
               onPointerCancel={(e) => handleButtonPointerUp('dodge', e)}
               className="absolute bottom-[10px] right-[90px] sm:bottom-[10px] sm:right-[110px] w-14 h-14 sm:w-16 sm:h-16 bg-gray-900/60 border-2 border-gray-500/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none shadow-lg select-none"
             >
               <span className="text-[10px] sm:text-xs font-bold pointer-events-none">DODGE</span>
             </button>
          </div>
        </>
      )}
    </div>
  );
}

function DebugHUDOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const debug = useGameStore((state) => state.debug);
  const activeDialogue = useGameStore((state) => state.activeDialogue);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-28 left-4 z-[9999] bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/50 px-3 py-1.5 rounded-lg text-xs font-mono shadow-xl pointer-events-auto backdrop-blur-md transition-colors flex items-center gap-1.5"
      >
        <span>🔍 Debug Info</span>
      </button>
    );
  }

  return (
    <div className="fixed top-28 left-4 z-[9999] bg-slate-950/90 border-2 border-cyan-400 text-white p-3 sm:p-4 rounded-xl shadow-2xl font-mono text-[11px] sm:text-xs max-w-xs space-y-1.5 pointer-events-auto backdrop-blur-md">
      <div className="font-bold text-cyan-300 border-b border-slate-700 pb-1 mb-1.5 flex items-center justify-between gap-2">
        <span>🔍 DEBUG OVERLAY</span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
        >
          Hide ✕
        </button>
      </div>

      <div className="flex justify-between gap-3">
        <span className="text-slate-400">Target NPC:</span>
        <span className="font-semibold text-amber-300 truncate">{debug.nearestNpcName || 'None'}</span>
      </div>

      <div className="flex justify-between gap-3">
        <span className="text-slate-400">Current Distance:</span>
        <span className="font-bold text-yellow-300">
          {debug.currentDistance !== undefined && debug.currentDistance < 900
            ? `${debug.currentDistance.toFixed(2)}m`
            : 'N/A'}
        </span>
      </div>

      <div className="flex justify-between gap-3 items-center">
        <span className="text-slate-400">isNear (&lt;= 3.8m):</span>
        <span
          className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
            debug.isNear
              ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}
        >
          {debug.isNear ? 'TRUE' : 'FALSE'}
        </span>
      </div>

      <div className="flex justify-between gap-3">
        <span className="text-slate-400">E Pressed:</span>
        <span className="font-bold text-cyan-300">
          {debug.ePressedCount > 0 ? `YES (${debug.ePressedCount}x @ ${debug.lastEPressedTime})` : 'NO (0x)'}
        </span>
      </div>

      <div className="flex justify-between gap-3">
        <span className="text-slate-400">openDialogueForNpc Called:</span>
        <span className="font-bold text-purple-300">
          {debug.openDialogueCalledCount > 0
            ? `YES (${debug.openDialogueCalledCount}x @ ${debug.lastOpenDialogueTime})`
            : 'NO (0x)'}
        </span>
      </div>

      <div className="flex justify-between gap-3 items-center">
        <span className="text-slate-400">activeDialogue != null:</span>
        <span
          className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
            activeDialogue !== null
              ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          {activeDialogue !== null ? 'TRUE' : 'FALSE'}
        </span>
      </div>

      <div className="flex justify-between gap-3 items-center">
        <span className="text-slate-400">DialogueModal Mounted:</span>
        <span
          className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
            debug.dialogueModalMounted
              ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}
        >
          {debug.dialogueModalMounted ? 'TRUE' : 'FALSE'}
        </span>
      </div>
    </div>
  );
}

