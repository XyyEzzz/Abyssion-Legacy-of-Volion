'use client';

import { useGameStore } from '@/lib/store';
import { HudElementId, HUD_ELEMENT_LABELS, SKILL_SLOT_KEYS, SkillSlotKey } from '@/lib/hudConfig';
import { weaponCategoryOf } from '@/lib/items';
import { SWORD_SKILLS } from '@/lib/swordSkills';
import { WATER_STAFF_SKILLS } from '@/lib/staffSkills';
import { M1887_SKILLS, DAGGER_SKILLS, RESONANCE_SKILLS } from '@/lib/weaponContent';
import { CROSSBOW_SKILLS } from '@/lib/crossbowContent';
import { DraggableHudElement, EditorHudElementContent } from './GameHUD';
import { useState, useCallback } from 'react';
import { RotateCcw, Check, X } from 'lucide-react';

export default function HudEditor() {
  const hudLayout = useGameStore(s => s.hudLayout);
  const setHudElement = useGameStore(s => s.setHudElement);
  const resetHudElement = useGameStore(s => s.resetHudElement);
  const resetHudLayout = useGameStore(s => s.resetHudLayout);
  const setHudEditMode = useGameStore(s => s.setHudEditMode);
  const saveGame = useGameStore(s => s.saveGame);
  const [selectedId, setSelectedId] = useState<HudElementId | null>(null);
  const skillHudConfig = useGameStore((s) => s.skillHudConfig);
  const setSkillHudEntry = useGameStore((s) => s.setSkillHudEntry);
  const addSkillHudEntry = useGameStore((s) => s.addSkillHudEntry);
  const removeSkillHudEntry = useGameStore((s) => s.removeSkillHudEntry);
  const resetSkillHudConfig = useGameStore((s) => s.resetSkillHudConfig);
  const hotbar = useGameStore((s) => s.hotbar);
  const archetype = useGameStore((s) => s.player.archetype);

  // Authoritative skill data per configurable item. The editor can only
  // assign real skills from this list — it cannot invent a gameplay skill.
  const configurableItems: { id: string; name: string; skills: { id: string; name: string }[] }[] = [
    { id: 'iron_sword', name: 'Iron Sword', skills: SWORD_SKILLS.map((k) => ({ id: k.id, name: k.name })) },
    { id: 'wooden_sword', name: 'Wooden Sword', skills: SWORD_SKILLS.map((k) => ({ id: k.id, name: k.name })) },
    { id: 'water_staff', name: 'Water Staff', skills: WATER_STAFF_SKILLS.map((k) => ({ id: k.id, name: k.name })) },
    { id: 'm1887', name: 'M1887', skills: M1887_SKILLS.map((k) => ({ id: k.id, name: k.name })) },
    { id: 'crossbow', name: 'Crossbow', skills: CROSSBOW_SKILLS.map((k) => ({ id: k.id, name: k.name })) },
    { id: 'dual_dagger', name: 'Dual Dagger', skills: DAGGER_SKILLS.map((k) => ({ id: k.id, name: k.name })) },
    { id: 'resonance_core', name: 'Resonance Core', skills: RESONANCE_SKILLS.map((k) => ({ id: k.id, name: k.name })) },
  ];

  const persistSkillConfig = () => saveGame();

  const elementIds = Object.keys(HUD_ELEMENT_LABELS) as HudElementId[];

  const handleDone = useCallback(() => {
    saveGame();
    setHudEditMode(false);
  }, [saveGame, setHudEditMode]);

  // Equipped item that owns the current skill HUD config — mirrors SkillBar's
  // weapon→config mapping so the picker only offers real skills for the
  // weapon the player actually has.
  const selectedWeapon = hotbar.slots[hotbar.selectedSlot];
  const equippedCat = weaponCategoryOf(selectedWeapon);
  let equippedItemId: string | null = null;
  if (selectedWeapon === 'water_staff' && archetype === 'mage') equippedItemId = 'water_staff';
  else if (equippedCat === 'sword' && archetype === 'fighter') equippedItemId = selectedWeapon;
  else if (equippedCat === 'gun') equippedItemId = selectedWeapon === 'crossbow' ? 'crossbow' : 'm1887';
  else if (equippedCat === 'dagger') equippedItemId = 'dual_dagger';
  else if (equippedCat === 'core') equippedItemId = 'resonance_core';
  const equippedItem = configurableItems.find((i) => i.id === equippedItemId) ?? null;
  const equippedSkillEntries = equippedItem ? (skillHudConfig[equippedItem.id] ?? []) : [];

  const stepBtn = 'w-5 h-5 rounded border border-gray-700 text-gray-200 hover:bg-white/10 flex items-center justify-center leading-none';

  const boxPct = (key: 'w' | 'h'): number => {
    if (!selectedId) return 25;
    const b = hudLayout[selectedId].box;
    return b ? Math.round(b[key] * 100) : 25;
  };
  const setBoxSize = (key: 'w' | 'h', pct: number) => {
    if (!selectedId) return;
    const clamped = Math.max(5, Math.min(100, pct));
    const cur = hudLayout[selectedId].box ?? { w: 0.25, h: 0.25 };
    setHudElement(selectedId, { box: { ...cur, [key]: clamped / 100 } });
  };

  const cfg = selectedId ? hudLayout[selectedId] : null;
  // Place the popup to the side of the element, flipping to the left half so it
  // never runs off the canvas edge.
  const popupOnLeft = cfg ? cfg.position.x > 0.55 : false;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black uppercase tracking-widest text-yellow-400">HUD Editor</span>
          <span className="text-xs text-gray-500 hidden sm:inline">Drag to reposition · Tap an element to configure</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => resetHudLayout()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
            title="Reset every customizable element"
          >
            <RotateCcw size={12} />
            Reset All
          </button>
          <button
            onClick={handleDone}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-yellow-500 hover:bg-yellow-400 text-gray-900 transition-colors"
          >
            <Check size={16} />
            Done
          </button>
        </div>
      </div>

      {/* Editor canvas — the whole editor surface (the right-hand panel is gone) */}
      <div
        className="flex-1 relative bg-gradient-to-br from-gray-900 via-gray-950 to-black overflow-hidden"
        onPointerDown={() => setSelectedId(null)}
      >
        {/* Grid pattern for spatial reference */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Aspect ratio guide — centered container matching typical game viewport */}
        <div className="absolute inset-4 sm:inset-8 rounded-lg border border-gray-800/50 overflow-hidden">
          {/* Render all HUD elements in edit mode */}
          {elementIds.map((id) => {
            const config = hudLayout[id];
            const Content = EditorHudElementContent[id];
            return (
              <DraggableHudElement
                key={id}
                id={id}
                config={config}
                editable
                fullscreen={false}
                selected={selectedId === id}
                onSelect={() => setSelectedId(id)}
              >
                <div style={{ opacity: config.visible ? 1 : 0.25 }}>
                  <Content />
                </div>
              </DraggableHudElement>
            );
          })}

          {/* Empty-state hint when nothing is selected */}
          {!selectedId && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <p className="text-sm text-gray-600 text-center">
                Tap any HUD element to select and customize it
              </p>
            </div>
          )}

          {/* Tap-to-configure popup — transparent, floating next to the element */}
          {selectedId && cfg && (
            <div
              className="absolute z-[60] pointer-events-auto font-mono text-[11px] text-gray-200 rounded-lg border border-yellow-500/40 shadow-2xl"
              style={{
                left: popupOnLeft ? undefined : `${cfg.position.x * 100}%`,
                right: popupOnLeft ? `${(1 - cfg.position.x) * 100}%` : undefined,
                top: `${cfg.position.y * 100}%`,
                marginLeft: popupOnLeft ? 0 : 96,
                marginRight: popupOnLeft ? 96 : 0,
                transform: 'translateY(-50%)',
                width: 224,
                padding: 10,
                background: 'rgba(10,10,14,0.82)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold uppercase tracking-wider text-yellow-300">
                  {HUD_ELEMENT_LABELS[selectedId]}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => resetHudElement(selectedId)}
                    className="text-gray-400 hover:text-gray-200"
                    title="Reset this element"
                  >
                    <RotateCcw size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-gray-400 hover:text-white"
                    title="Close"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {/* Visibility */}
                <button
                  type="button"
                  onClick={() => setHudElement(selectedId, { visible: !cfg.visible })}
                  className="flex w-full items-center justify-between px-2 py-1 rounded border border-gray-700 bg-black/30 hover:bg-white/5"
                >
                  <span className="text-gray-300">Visible</span>
                  <span className={cfg.visible ? 'text-green-400' : 'text-gray-500'}>
                    {cfg.visible ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Scale (existing `size` field, 50–200%) */}
                {selectedId !== 'deathOverlay' && (
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-gray-400">Scale</span>
                    <button type="button" className={stepBtn}
                      onClick={() => setHudElement(selectedId, { size: Math.max(50, cfg.size - 5) })}>−</button>
                    <span className="w-12 text-center tabular-nums">{cfg.size}%</span>
                    <button type="button" className={stepBtn}
                      onClick={() => setHudElement(selectedId, { size: Math.min(200, cfg.size + 5) })}>+</button>
                  </div>
                )}

                {/* Width — viewport % (5% steps) */}
                <div className="flex items-center gap-2">
                  <span className="w-12 text-gray-400">Width</span>
                  <button type="button" className={stepBtn}
                    onClick={() => setBoxSize('w', boxPct('w') - 5)}>−</button>
                  <span className="w-12 text-center tabular-nums">
                    {cfg.box ? `${Math.round(cfg.box.w * 100)}%` : 'auto'}
                  </span>
                  <button type="button" className={stepBtn}
                    onClick={() => setBoxSize('w', boxPct('w') + 5)}>+</button>
                </div>

                {/* Height — viewport % (5% steps) */}
                <div className="flex items-center gap-2">
                  <span className="w-12 text-gray-400">Height</span>
                  <button type="button" className={stepBtn}
                    onClick={() => setBoxSize('h', boxPct('h') - 5)}>−</button>
                  <span className="w-12 text-center tabular-nums">
                    {cfg.box ? `${Math.round(cfg.box.h * 100)}%` : 'auto'}
                  </span>
                  <button type="button" className={stepBtn}
                    onClick={() => setBoxSize('h', boxPct('h') + 5)}>+</button>
                </div>

                {/* Opacity */}
                <div className="flex items-center gap-2">
                  <span className="w-12 text-gray-400">Opacity</span>
                  <button type="button" className={stepBtn}
                    onClick={() => setHudElement(selectedId, { opacity: Math.max(0, cfg.opacity - 5) })}>−</button>
                  <span className="w-12 text-center tabular-nums">{cfg.opacity}%</span>
                  <button type="button" className={stepBtn}
                    onClick={() => setHudElement(selectedId, { opacity: Math.min(100, cfg.opacity + 5) })}>+</button>
                </div>

                {/* Skill picker — only for the skill bar */}
                {selectedId === 'skillBar' && (
                  <div className="mt-2 border-t border-gray-700 pt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-400 uppercase tracking-wider">Skill Slots</span>
                      {equippedItem && (
                        <button type="button"
                          onClick={() => { resetSkillHudConfig(equippedItem.id); persistSkillConfig(); }}
                          className="text-gray-400 hover:text-gray-200"
                          title="Reset this weapon's slots">Reset</button>
                      )}
                    </div>
                    {!equippedItem && (
                      <p className="text-gray-500">Equip a weapon or Core to assign skills.</p>
                    )}
                    {equippedItem && equippedSkillEntries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-1 mb-1">
                        <select
                          value={entry.slot}
                          onChange={(e) => {
                            setSkillHudEntry(equippedItem.id, i, { ...entry, slot: e.target.value as SkillSlotKey });
                            persistSkillConfig();
                          }}
                          className="w-10 bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-200"
                        >
                          {SKILL_SLOT_KEYS.map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                        <select
                          value={entry.id}
                          onChange={(e) => {
                            const skill = equippedItem.skills.find((k) => k.id === e.target.value);
                            setSkillHudEntry(equippedItem.id, i, {
                              ...entry,
                              id: skill?.id ?? '',
                              name: entry.name || skill?.name || '',
                            });
                            persistSkillConfig();
                          }}
                          className="flex-1 min-w-0 bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-200"
                        >
                          <option value="">(empty slot)</option>
                          {equippedItem.skills.map((k) => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => { removeSkillHudEntry(equippedItem.id, i); persistSkillConfig(); }}
                          className="px-1 text-red-400 hover:text-red-300"
                          title="Remove slot"
                        >✕</button>
                      </div>
                    ))}
                    {equippedItem && (
                      <button
                        type="button"
                        onClick={() => { addSkillHudEntry(equippedItem.id); persistSkillConfig(); }}
                        className="px-2 py-0.5 rounded text-[11px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                      >+ Add slot</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
