'use client';

import { useState } from 'react';
import { SaveSlotId, SaveSlotSummary, WorldMode, useGameStore } from '@/lib/store';
import SettingsModal from './SettingsModal';
import CreditsScreen from './CreditsScreen';

type MenuView = 'main' | 'credits' | 'continue-slots' | 'new-slots' | 'world-modes';
type SlotPickerMode = 'continue' | 'new';
type PickWorldMode = { view: 'new-slots'; worldMode: WorldMode };

/** ── P1.5 world-based save structure ────────────────────────────────────
 *  Worlds are expandable entities, not the hard-coded three save slots.
 *  New Game first selects a WORLD MODE; the chosen mode is passed to
 *  startNewGame as an options argument (the existing schema is untouched —
 *  the mode is recorded in the slot's existing metadata field). Story and
 *  Trial are playable now; Sandbox/Ranked/Multiplayer are real selectable
 *  modes and represented exactly as their current status (no fake content). */
const WORLD_MODES: { id: WorldMode; label: string; note: string; playable: boolean }[] = [
  { id: 'story', label: 'STORY', note: 'The campaign world. Playable now.', playable: true },
  { id: 'trial', label: 'TRIAL', note: 'Training mode. Does not consume Rank Points or Story Energy.', playable: true },
  { id: 'sandbox', label: 'SANDBOX', note: 'Free-form world mode. Foundation exists.', playable: true },
  { id: 'ranked', label: 'RANKED', note: 'Competitive ranked world. In development.', playable: false },
  { id: 'multiplayer', label: 'MULTIPLAYER', note: 'Future branch point for MMORPG / Co-Op.', playable: false },
];

function WorldModePicker({
  onSelect,
  onBack,
}: {
  onSelect: (mode: WorldMode) => void;
  onBack: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-[#0a0a0a] text-white">
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-6">
        <h2 className="text-2xl font-bold tracking-widest text-[#e8d5ae] uppercase" style={{ fontFamily: 'Georgia, serif' }}>
          Choose World Mode
        </h2>
        <p className="mt-2 text-xs text-[#8a7454] uppercase tracking-wider">New Game — worlds are expandable, not fixed slots</p>
        <div className="mt-6 w-full max-w-sm flex flex-col gap-2">
          {WORLD_MODES.map((m) => (
            <button
              key={m.id}
              disabled={!m.playable}
              onClick={() => onSelect(m.id)}
              className={`group w-full text-left rounded-md border px-4 py-3 transition-all ${
                m.playable
                  ? 'border-[#7a5e38]/55 bg-[#241a10]/90 hover:border-[#d68a31] hover:bg-[#d68a31]/10'
                  : 'cursor-not-allowed border-gray-800 bg-black/40 opacity-45'
              }`}
            >
              <span className={`uppercase tracking-wider font-bold text-sm ${m.playable ? 'text-[#e8d5ae]' : 'text-gray-600'}`}>
                {m.label}
              </span>
              <span className="block text-[11px] text-[#8a7454] group-hover:text-[#b39b6f]">{m.note}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onBack}
          className="mt-6 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-stone-800 hover:bg-stone-700 text-amber-100 border border-amber-900/50 rounded"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

function formatSavedAt(timestamp: number | null) {
  if (!timestamp) return 'NO RECORD';
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function SaveSlotPicker({
  mode,
  slots,
  activeSlot,
  worldMode,
  onBack,
}: {
  mode: SlotPickerMode;
  slots: SaveSlotSummary[];
  activeSlot: SaveSlotId;
  /** Only used when mode === 'new' (P1.5). */
  worldMode?: WorldMode;
  onBack: () => void;
}) {
  const continueGame = useGameStore(s => s.continueGame);
  const startNewGame = useGameStore(s => s.startNewGame);
  const deleteSaveSlot = useGameStore(s => s.deleteSaveSlot);
  const createSaveState = useGameStore(s => s.createSaveState);
  // Every created state gets a human label derived from its stable ordinal.
  const slotLabel = (slot: SaveSlotSummary) => `State ${slot.id}`;
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmSlot, setDeleteConfirmSlot] = useState<SaveSlotId | null>(null);

  const chooseSlot = (slot: SaveSlotSummary) => {
    const ok = mode === 'continue'
      ? continueGame(slot.id)
      : startNewGame(slot.id, worldMode);

    if (!ok) {
      setError(mode === 'continue'
        ? 'This save is unavailable. Choose another occupied slot.'
        : 'New journeys can only begin in empty slots.');
    }
  };

  const isSelectable = (slot: SaveSlotSummary) =>
    mode === 'continue' ? slot.status === 'occupied' : slot.status === 'empty';

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-[#0a0a0a] text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 35% 35%, rgba(80,12,12,0.2) 0%, transparent 52%),' +
            'radial-gradient(ellipse at 70% 70%, rgba(20,20,40,0.16) 0%, transparent 58%),' +
            '#0a0a0a',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 3px)',
        }}
      />

      <div className="relative z-10 flex h-full flex-col overflow-y-auto px-6 py-8 sm:px-10 sm:py-12 lg:px-16">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-gray-600">
          <span>SYS / SAVE ARCHIVE</span>
          <span>REV / 01</span>
        </div>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-10">
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-[2px] w-8 bg-[#d68a31]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gray-500">
                {mode === 'continue' ? 'Resume journey' : 'Begin journey'}
              </span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">
              Select Save Slot
            </h1>
            <p className="mt-3 max-w-lg font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-gray-500 sm:text-xs">
              {mode === 'continue'
                ? 'Choose a created state to continue. Corrupted records are locked.'
                : 'Choose a created state or create a new one below.'}
            </p>
          </div>

          <div className="grid gap-2">
            {slots.map((slot) => {
              const selectable = isSelectable(slot);
              const isActive = slot.id === activeSlot;
              const statusText = slot.status === 'occupied'
                ? 'OCCUPIED'
                : slot.status === 'corrupted'
                  ? 'CORRUPTED'
                  : 'EMPTY';

              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={!selectable}
                  onClick={() => chooseSlot(slot)}
                  className={`group flex w-full items-center gap-4 border-l-2 px-4 py-4 text-left transition-all ${
                    selectable
                      ? 'border-gray-700 bg-black/45 hover:border-[#d68a31] hover:bg-black/65 active:translate-x-1'
                      : 'cursor-not-allowed border-gray-800 bg-black/25 opacity-60'
                  }`}
                >
                  <span className={`font-mono text-2xl font-bold tabular-nums ${selectable ? 'text-gray-300 group-hover:text-white' : 'text-gray-700'}`}>
                    {String(slot.id).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-black uppercase tracking-wider ${selectable ? 'text-gray-200 group-hover:text-white' : 'text-gray-600'}`}>
                      {slotLabel(slot)}
                      <span className="ml-2 text-gray-500">— {statusText}</span>
                      {isActive && slot.status === 'occupied' && (
                        <span className="ml-2 font-mono text-[9px] font-normal tracking-[0.2em] text-[#d68a31]">
                          ACTIVE
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-gray-600">
                      {slot.status === 'occupied'
                        ? `Last saved ${formatSavedAt(slot.savedAt)}`
                        : slot.status === 'corrupted'
                          ? 'Cannot be loaded or replaced'
                          : 'Available for a new journey'}
                    </span>
                  </span>
                  <span className="hidden text-right sm:block">
                    <span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-gray-600">
                      {slot.playerLevel !== null ? `LEVEL ${slot.playerLevel}` : '—'}
                    </span>
                    <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-gray-700">
                      {selectable ? 'SELECT' : 'LOCKED'}
                    </span>
                  </span>
                  {selectable && mode === 'continue' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmSlot(slot.id);
                      }}
                      className="font-mono text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 border border-gray-800 hover:border-red-800"
                      title="Delete this save"
                    >
                      DEL
                    </button>
                  )}
                  {selectable && (
                    <span className="font-mono text-sm text-gray-600 transition-colors group-hover:text-[#d68a31]">
                      &gt;&gt;
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <p className="mt-4 border-l-2 border-[#d68a31] bg-[#d68a31]/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#f87171]">
              {error}
            </p>
          )}

          {mode === 'continue' && !slots.some((slot) => slot.status === 'occupied') && (
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-600">
              No valid saves found. Return and begin a new journey.
            </p>
          )}
          {mode === 'new' && (
            <button
              type="button"
              onClick={() => {
                const newId = createSaveState();
                const created = useGameStore.getState().saveSlots.find((slot) => slot.id === newId);
                if (created) chooseSlot(created);
              }}
              className="mt-4 flex w-full items-center gap-4 border-l-2 border-[#d68a31]/70 bg-[#241a10]/80 px-4 py-4 text-left transition-all hover:border-[#d68a31] hover:bg-[#d68a31]/10 active:translate-x-1"
            >
              <span className="font-mono text-2xl font-bold text-[#d68a31]">+</span>
              <span className="font-black uppercase tracking-wider text-[#e8d5ae]">
                Create New State
              </span>
              <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.15em] text-gray-600">
                Unlimited
              </span>
            </button>
          )}
          {mode === 'new' && slots.length === 0 && (
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-600">
              No saved states yet. Create your first state below.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mx-auto w-full max-w-2xl border-l-2 border-gray-800 bg-black/30 px-4 py-3 text-left font-black uppercase tracking-wider text-gray-500 transition-colors hover:border-gray-500 hover:text-white"
        >
          <span className="mr-3 font-mono text-sm text-gray-700">&lt;&lt;</span>
          Back to Main Menu
        </button>

        {/* Delete Confirmation Dialog */}
        {deleteConfirmSlot !== null && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
            <div className="bg-gray-900 border border-gray-700 p-6 max-w-sm w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-2">Delete this save?</h3>
              <p className="text-sm text-gray-400 mb-6">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    deleteSaveSlot(deleteConfirmSlot);
                    setDeleteConfirmSlot(null);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteConfirmSlot(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-2 px-4 border border-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MainMenu() {
  const saveSlots = useGameStore(s => s.saveSlots);
  const activeSlot = useGameStore(s => s.activeSlot);
  const showSettings = useGameStore(s => s.ui.showSettings);
  const setShowSettings = useGameStore(s => s.setShowSettings);
  const [view, setView] = useState<MenuView>('main');
  const [pendingWorldMode, setPendingWorldMode] = useState<WorldMode>('story');

  if (showSettings) return <SettingsModal />;
  if (view === 'credits') return <CreditsScreen onBack={() => setView('main')} />;
  if (view === 'continue-slots') {
    return (
      <SaveSlotPicker
        mode="continue"
        slots={saveSlots}
        activeSlot={activeSlot}
        onBack={() => setView('main')}
      />
    );
  }
  if (view === 'world-modes') {
    return (
      <WorldModePicker
        onSelect={(mode) => {
          setPendingWorldMode(mode);
          setView('new-slots');
        }}
        onBack={() => setView('main')}
      />
    );
  }
  if (view === 'new-slots') {
    return (
      <SaveSlotPicker
        mode="new"
        slots={saveSlots}
        activeSlot={activeSlot}
        worldMode={pendingWorldMode}
        onBack={() => setView('main')}
      />
    );
  }

  const hasSaveData = saveSlots.some((slot) => slot.status === 'occupied');

  const menuItems: { label: string; sublabel: string; action: () => void; disabled?: boolean; danger?: boolean }[] = [
    {
      label: 'CONTINUE',
      sublabel: hasSaveData ? 'SELECT A SAVE SLOT' : 'NO SAVE DATA FOUND',
      action: () => setView('continue-slots'),
      disabled: !hasSaveData,
    },
    {
      label: 'NEW GAME',
      sublabel: 'BEGIN A NEW JOURNEY',
      action: () => setView('world-modes'),
    },
    {
      label: 'SETTINGS',
      sublabel: 'SYSTEM CONFIGURATION',
      action: () => setShowSettings(true),
    },
    {
      label: 'CREDITS',
      sublabel: 'DEVELOPMENT TEAM',
      action: () => setView('credits'),
    },
  ];

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden" style={{ background: '#1a140d' }}>
      {/* Medieval camp background — layered wood/stone/night gradients with a
          torchlit warm focal glow. No external assets, CSS-only, lightweight. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 78%, rgba(214,138,49,0.22) 0%, transparent 46%),' +
            'radial-gradient(ellipse at 22% 30%, rgba(58,44,28,0.65) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 82% 22%, rgba(24,30,40,0.5) 0%, transparent 50%),' +
            'linear-gradient(180deg, #141a24 0%, #1c1610 45%, #241a10 100%)',
        }}
      />
      {/* Distant treeline silhouette (deterministic CSS shapes — no assets) */}
      <div
        className="absolute inset-x-0 bottom-[38%] h-[24%] opacity-40"
        style={{
          background:
            'radial-gradient(60px 90px at 8% 100%, #0d1207 98%, transparent),' +
            'radial-gradient(80px 120px at 22% 100%, #0d1207 98%, transparent),' +
            'radial-gradient(55px 80px at 38% 100%, #0d1207 98%, transparent),' +
            'radial-gradient(90px 130px at 58% 100%, #0d1207 98%, transparent),' +
            'radial-gradient(65px 95px at 76% 100%, #0d1207 98%, transparent),' +
            'radial-gradient(85px 115px at 92% 100%, #0d1207 98%, transparent)',
        }}
      />
      {/* Ground band — packed earth toward the campfire glow */}
      <div
        className="absolute inset-x-0 bottom-0 h-[38%]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(214,138,49,0.14) 0%, transparent 55%),' +
            'linear-gradient(180deg, #171208 0%, #241a0e 100%)',
        }}
      />
      {/* Campfire ember particles — a few fixed CSS dots, no animation loop cost
          beyond compositor opacity. Deliberately sparse. */}
      <div className="absolute inset-x-0 bottom-[30%] h-24 pointer-events-none">
        {[
          { l: '46%', b: 60, d: '0s' }, { l: '52%', b: 30, d: '0.8s' },
          { l: '49%', b: 90, d: '1.6s' }, { l: '55%', b: 50, d: '0.4s' },
          { l: '44%', b: 20, d: '1.2s' },
        ].map(({ l, b, d }, i) => (
          <span
            key={i}
            className="absolute w-1 h-1 rounded-full animate-pulse"
            style={{ left: l, bottom: b, background: '#f59e0b', boxShadow: '0 0 6px #f59e0b', animationDelay: d, animationDuration: '2.4s' }}
          />
        ))}
      </div>
      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/50" />

      {/* Main layout — title left, menu right on desktop; stacked on mobile */}
      <div className="relative z-10 w-full h-full flex flex-col">
        {/* Title area */}
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-16 max-w-xl">
          <h1
            className="text-[#e8d5ae] uppercase leading-[0.85]"
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: 'clamp(3rem, 10vw, 8rem)',
              textShadow: '0 0 30px rgba(214,138,49,0.35), 0 4px 24px rgba(0,0,0,0.95)',
              letterSpacing: '-0.01em',
            }}
          >
            ABYSSION
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-px w-10" style={{ background: 'linear-gradient(90deg, #d68a31, transparent)' }} />
            <span
              className="uppercase tracking-[0.3em] text-[#b39b6f]"
              style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(0.55rem, 1.6vw, 0.85rem)' }}
            >
              Legacy of Volion
            </span>
          </div>
        </div>

        {/* Menu items — centred plaque (P2.1): the four primary options
            (CONTINUE / NEW GAME / SETTINGS / CREDITS) sit centred on screen. */}
        <div className="flex justify-center items-center px-6 sm:px-10 lg:px-16 pb-8 sm:pb-12">
          <nav
            className="w-full max-w-xs rounded-md p-2"
            style={{
              background: 'linear-gradient(160deg, rgba(58,44,28,0.92), rgba(34,26,16,0.95))',
              border: '1px solid rgba(122,94,56,0.55)',
              boxShadow: '0 10px 34px rgba(0,0,0,0.6), inset 0 1px 0 rgba(232,213,174,0.08)',
            }}
          >
            {menuItems.map((item) => (
              <button
                key={item.label}
                disabled={item.disabled}
                onClick={item.action}
                className={`group relative flex w-full items-center justify-between px-4 py-3 text-left transition-all duration-150 rounded ${
                  item.disabled
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:bg-[#d68a31]/10 active:translate-x-1'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span
                    className={`uppercase tracking-wider transition-colors ${
                      item.disabled
                        ? 'text-[#6b5c44]'
                        : 'text-[#e8d5ae] group-hover:text-[#f2e4c2]'
                    }`}
                    style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 'clamp(0.85rem, 2.5vw, 1.05rem)' }}
                  >
                    {item.label}
                  </span>
                  <span
                    className={`uppercase tracking-wider ${
                      item.disabled ? 'text-[#55492f]' : 'text-[#8a7454] group-hover:text-[#b39b6f]'
                    }`}
                    style={{ fontSize: 'clamp(0.45rem, 1.3vw, 0.65rem)' }}
                  >
                    {item.sublabel}
                  </span>
                </div>
                {!item.disabled && (
                  <span className="text-[#8a7454] group-hover:text-[#d68a31] transition-colors text-sm">❯</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
