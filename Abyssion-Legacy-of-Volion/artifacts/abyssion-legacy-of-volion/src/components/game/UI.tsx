'use client';

import { useGameStore } from '@/lib/store';
import { HUD_CONFIG as H, SKILL_SLOT_KEYS, SkillSlotKey } from '@/lib/hudConfig';
import { Settings, Backpack, Shield, Box, Terminal } from 'lucide-react';
import { getItem, getAllItems, weaponCategoryOf } from '@/lib/items';
import { SWORD_SKILLS } from '@/lib/swordSkills';
import { WATER_STAFF_SKILLS } from '@/lib/staffSkills';
import { M1887_SKILLS, DAGGER_SKILLS } from '@/lib/weaponContent';
import { CROSSBOW_SKILLS, CROSSBOW_CONFIG } from '@/lib/crossbowContent';
import { RESONANCE_SKILLS } from '@/lib/weaponContent';
import { getItemCount } from '@/lib/inventory';
import { useEffect, useRef, useState, useCallback } from 'react';
import { t } from '@/lib/translations';
import { eventToComboToken, feedComboToken } from '@/lib/hiddenCombos';
import type { Lang } from '@/lib/translations';
import GameHUD from './GameHUD';
import HudEditor from './HudEditor';
import DebugTelemetry from './DebugTelemetry';

/** True while (clientX, clientY) is inside the 16:9 game stage (M1W2D3 #1 WS3).
 *  Mirrors the stage's CSS exactly — width 100vw / height 56.25vw, clamped by
 *  maxWidth min(177.78vh, 177.78dvh) and maxHeight min(100vh, 100dvh), centred
 *  by <main>'s flex — so it needs no ref, no cache and no resize listener. It
 *  is called once per pointerdown: zero per-frame cost. */
function isInsideStage(clientX: number, clientY: number): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw / vh > 16 / 9) {
    // Wider than 16:9 — full height, bar area on the left and right.
    const width = (vh * 16) / 9;
    const left = (vw - width) / 2;
    return clientX >= left && clientX <= left + width;
  }
  // Taller than (or exactly) 16:9 — full width, bar area above and below.
  const height = (vw * 9) / 16;
  const top = (vh - height) / 2;
  return clientY >= top && clientY <= top + height;
}

/** Skill bar (P9): KEY + NAME + LOCKED state + COOLDOWN for the currently
 *  equipped weapon/Core. Derives from the same authoritative hotbar state as
 *  combat, and from the transient skillState the combat loop reports to. */
export function SkillBar({ preview = false }: { preview?: boolean } = {}) {
  const hotbar = useGameStore((s) => s.hotbar);
  const archetype = useGameStore((s) => s.player.archetype);
  const isItemSkillUnlocked = useGameStore((s) => s.isItemSkillUnlocked);
  const skillState = useGameStore((s) => s.skillState);
  const gunAmmo = useGameStore((s) => s.gunAmmo);
  const crossbowAmmo = useGameStore((s) => s.crossbowAmmo);
  const skillHudConfig = useGameStore((s) => s.skillHudConfig);
  const setInputs = useGameStore((s) => s.setInputs);
  const selected = hotbar.slots[hotbar.selectedSlot];
  const cat = weaponCategoryOf(selected);
  let skills: { key: string; name: string; id: string }[] = [];
  let itemId: string | null = null;
  if (selected === 'water_staff' && archetype === 'mage') {
    itemId = 'water_staff';
    skills = WATER_STAFF_SKILLS.map((sk, i) => ({ key: ['Z', 'X', 'C'][i], name: sk.name, id: sk.id }));
  } else if (cat === 'sword' && archetype === 'fighter') {
    itemId = selected;
    skills = SWORD_SKILLS.map((sk, i) => ({ key: ['Z', 'X'][i], name: sk.name, id: sk.id }));
  } else if (cat === 'gun') {
    if (selected === 'crossbow') {
      itemId = 'crossbow';
      skills = CROSSBOW_SKILLS.map((sk, i) => ({ key: ['Z', 'X'][i], name: sk.name, id: sk.id }));
    } else {
      itemId = 'm1887';
      skills = M1887_SKILLS.map((sk, i) => ({ key: ['Z', 'X'][i], name: sk.name, id: sk.id }));
    }
  } else if (cat === 'dagger') {
    // Dual Dagger has exactly two skill slots (Z/X). No C/V/F fake slots.
    itemId = 'dual_dagger';
    skills = DAGGER_SKILLS.map((sk, i) => ({ key: ['Z', 'X'][i], name: sk.name, id: sk.id }));
  } else if (cat === 'core') {
    itemId = 'resonance_core';
    skills = RESONANCE_SKILLS.map((sk) => ({ key: sk.slot, name: sk.name, id: sk.id }));
  } else if (!preview) {
    return null;
  }

  // Manual HUD skill configuration (C3, display-only): entries are matched to
  // the canonical skill list by id. A configured entry with an unknown/empty id
  // renders as an empty/unavailable slot — HUD config can never invent a skill.
  const configured = itemId ? skillHudConfig[itemId] : undefined;
  type RenderedSkill = { key: string; name: string; id: string; actionIndex: number | null };
  const rendered: RenderedSkill[] = [];
  if (configured && configured.length > 0) {
    const ordered = [...configured].sort(
      (a, b) => SKILL_SLOT_KEYS.indexOf(a.slot) - SKILL_SLOT_KEYS.indexOf(b.slot)
    );
    for (const e of ordered) {
      const idx = e.id ? skills.findIndex((sk) => sk.id === e.id) : -1;
      rendered.push({
        key: e.slot,
        name: e.name || (idx >= 0 ? skills[idx].name : ''),
        id: idx >= 0 ? skills[idx].id : '',
        actionIndex: idx >= 0 ? idx : null,
      });
    }
  } else {
    skills.forEach((sk, i) => rendered.push({ key: sk.key, name: sk.name, id: sk.id, actionIndex: i }));
  }

  // Editor preview: with no equipped weapon the live bar renders nothing, so a
  // representative 5-slot row keeps the element visible and selectable in the
  // Custom HUD editor canvas. Names still come from the real skill lists above
  // whenever a weapon is equipped.
  if (preview && rendered.length === 0) {
    for (const key of SKILL_SLOT_KEYS) {
      rendered.push({ key, name: '', id: '', actionIndex: null });
    }
  }

  // Activation routes through the authoritative store input path — the same
  // inputs the combat loop edge-reads for key/skill-button presses.
  // Each skill button's release timer is tracked per action so none can fire
  // after unmount. A repeat tap of the SAME action replaces its own timer while
  // every other action keeps an independent one — no input can be left stuck on.
  const releaseTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => {
    for (const t of releaseTimers.current.values()) clearTimeout(t);
    releaseTimers.current.clear();
  }, []);
  const activateSkill = (actionIndex: number) => {
    const action = ('skill' + String(actionIndex + 1)) as 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'skill5';
    setInputs({ [action]: true } as Parameters<typeof setInputs>[0]);
    const timers = releaseTimers.current;
    const pending = timers.get(action);
    if (pending) clearTimeout(pending);
    const release = setTimeout(() => {
      timers.delete(action);
      setInputs({ [action]: false } as Parameters<typeof setInputs>[0]);
    }, 80);
    timers.set(action, release);
  };

  // Bottom anchor (M1W2D3 #1 WS1): viewport-aware, replacing the fixed 78px.
  // The interact-prompt / boss-bar band is viewport-proportional (85% / 88% of
  // the height), so a fixed px offset collided with it once the viewport got
  // short (4:3). 15dvh + 32px keeps the bar a constant ~12px clear above that
  // band at every height; the clamps only guard degenerate viewports.
  return (
    <div className="flex items-center gap-2" style={{ pointerEvents: 'none' }}>
      {rendered.map((sk) => {
        const hasSkill = sk.actionIndex !== null && itemId !== null;
        const unlocked = hasSkill && itemId !== null ? isItemSkillUnlocked(itemId, sk.actionIndex as number) : false;
        // Cooldown comes from the transient gameplay feedback state, so the
        // bar can never show a skill as ready while gameplay still blocks it.
        const cd = sk.id ? (skillState.cooldowns[sk.id] ?? 0) : 0;
        const interactive = hasSkill && unlocked;
        return (
          <button
            key={sk.key}
            type="button"
            disabled={!interactive}
            onPointerDown={(e) => { e.stopPropagation(); if (interactive) activateSkill(sk.actionIndex as number); }}
            className={`flex items-center gap-2 border px-3 py-1.5 ${interactive && !preview ? 'pointer-events-auto cursor-pointer active:bg-white/10' : 'pointer-events-none cursor-default'}`}
            style={{
              background: !hasSkill ? 'rgba(10,10,10,0.4)' : unlocked ? 'rgba(20,16,8,0.85)' : 'rgba(10,10,10,0.7)',
              borderColor: !hasSkill ? 'rgba(90,90,90,0.2)' : unlocked ? 'rgba(214,138,49,0.55)' : 'rgba(120,120,120,0.25)',
              opacity: !hasSkill ? 0.4 : unlocked ? 1 : 0.55,
            }}
          >
            <span className="text-sm font-black" style={{ color: unlocked ? '#e8d5ae' : '#777' }}>{sk.key}</span>
            <span className="text-xs font-semibold tracking-wide" style={{ color: !hasSkill ? '#555' : unlocked ? '#d68a31' : '#666' }}>
              {!hasSkill ? '—' : unlocked ? sk.name : `${sk.name} (locked)`}
            </span>
            {interactive && cd > 0 && (
              <span className="text-xs font-bold" style={{ color: '#f87171' }}>{cd.toFixed(1)}s</span>
            )}
          </button>
        );
      })}
      {cat === 'gun' && selected !== 'crossbow' && (
        <div className="flex items-center gap-1.5 border px-3 py-1.5" style={{ background: 'rgba(20,16,8,0.85)', borderColor: 'rgba(214,138,49,0.55)' }}>
          <span className="text-xs font-bold tracking-wide" style={{ color: gunAmmo > 0 ? '#d68a31' : '#f87171' }}>
            {gunAmmo}/{2}
          </span>
          {/* FIRE pill lights while the rate-of-fire gate is ticking after a
              shot — gameplay state, reported through skillState. */}
          <span
            className="text-xs font-black tracking-widest"
            style={{ color: skillState.cooldowns['__gun_basic'] > 0 ? '#94a3b8' : '#22c55e' }}
          >
            FIRE
          </span>
        </div>
      )}
      {selected === 'crossbow' && (
        <div className="flex items-center gap-1.5 border px-3 py-1.5" style={{ background: 'rgba(20,16,8,0.85)', borderColor: 'rgba(214,138,49,0.55)' }}>
          <span className="text-xs font-bold tracking-wide" style={{ color: crossbowAmmo > 0 ? '#d68a31' : '#f87171' }}>
            {crossbowAmmo}/{CROSSBOW_CONFIG.ammoCapacity}
          </span>
          {/* FIRE pill lights while the rate-of-fire gate is ticking after a
              shot — gameplay state, reported through skillState. */}
          <span
            className="text-xs font-black tracking-widest"
            style={{ color: skillState.cooldowns['__crossbow_basic'] > 0 ? '#94a3b8' : '#22c55e' }}
          >
            FIRE
          </span>
        </div>
      )}
    </div>
  );
}

export default function UI() {
  // Narrow selectors — subscribing to the whole store re-renders UI on every
  // gameplay state write (positions, damage numbers, notifications), a major
  // mobile render cost. Individual actions are stable references.
  const setShowSettings = useGameStore((s) => s.setShowSettings);
  const setInputs = useGameStore((s) => s.setInputs);
  const setShowInventory = useGameStore((s) => s.setShowInventory);
  const hudEditMode = useGameStore((s) => s.hudEditMode);
  const hudLayout = useGameStore((s) => s.hudLayout);
  // Equipped-weapon derivation — same authoritative hotbar source of truth
  // the combat logic in Player.tsx uses, so weapon UI can never disagree
  // with weapon gameplay state.
  const hotbar = useGameStore((s) => s.hotbar);
  const archetype = useGameStore((s) => s.player.archetype);
  // Skill UI derives from the same authoritative archetype + hotbar state as
  // gameplay — never a separate "skill UI weapon" state.
  const staffEquipped =
    hotbar.slots[hotbar.selectedSlot] === 'water_staff' && archetype === 'mage';
  const swordEquipped =
    (hotbar.slots[hotbar.selectedSlot] === 'iron_sword' ||
      hotbar.slots[hotbar.selectedSlot] === 'wooden_sword') &&
    archetype === 'fighter';
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
  // Chat/command console UI state is authoritative in the store (transient,
  // never persisted) so the backtick hotkey and Settings → Cheats open the
  // same console without a second cheat system.
  const showChat = useGameStore((s) => s.cheat.chatOpen);
  const setShowChat = (open: boolean | ((prev: boolean) => boolean)) => {
    const cur = useGameStore.getState().cheat.chatOpen;
    useGameStore.getState().setChatOpen(typeof open === 'function' ? open(cur) : open);
  };
  // Refs keep the keydown listener free of stale-closure state (the listener is
  // registered once for the component's lifetime, so it must not read chat
  // state directly).
  const showChatRef = useRef(false);
  useEffect(() => {
    showChatRef.current = showChat;
  }, [showChat]);
  // Hidden movement-combination input buffer (gameplay-only cheat triggers).
  const comboBufferRef = useRef<string[]>([]);
  const comboLastInputAtRef = useRef(0);
  
  const joystickPointerId = useRef<number | null>(null);
  const cameraPointerId = useRef<number | null>(null);
  const buttonPointers = useRef<Map<number, 'jump' | 'attack' | 'dodge' | 'sprint' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'skill5'>>(new Map());
  
  const joystickOrigin = useRef<{x: number, y: number} | null>(null);
  const lastCameraPos = useRef<{x: number, y: number} | null>(null);
  // Cumulative travel of the active camera-drag pointer (tap-vs-drag test).
  const cameraDragTravel = useRef(0);
  const currentCameraAngle = useRef<number>(0);
  const currentCameraPitch = useRef<number>(0);

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

  const handlePointerDown = useCallback((e: PointerEvent) => {
    // Ignore gameplay pointer events while any modal overlay, the expanded
    // map, or the HUD editor is open — prevents those touches from starting
    // joystick or camera drags (map/HUD/modal touches must never attack or look).
    const { showSettings, showInventory, showQuestLog, mapOpen } = useGameStore.getState().ui;
    const activeDialogue = useGameStore.getState().activeDialogue;
    if (showSettings || showInventory || showQuestLog || mapOpen || hudEditMode || activeDialogue) return;

    const target = e.target as HTMLElement;
    // Interactive HUD elements own their presses wherever the HUD-fill layer
    // move has placed them: buttons, the minimap's role="button" wrapper,
    // links, and anything explicitly tagged data-hud-interactive. Their own
    // handlers run; this global gameplay handler must not treat them as empty
    // space (which would reject the press once it lands outside the stage).
    if (target.closest('button, [role="button"], a, [data-hud-interactive]')) {
      return;
    }

    // Bar-area input lock (M1W2D3 #1 WS3): the HUD layer spans the viewport so
    // its elements can live in the letterbox region, but empty-space gameplay
    // input is only accepted inside the 16:9 stage, so a tap or drag out in the
    // bars cannot start a camera drag or a tap-attack. The joystick is the one
    // exception: it is a pointer-events-none control driven by this very
    // handler, so a grab on it must work wherever the layer move placed it.
    // A rejected press never registers a pointer id, so the move/up handlers
    // stay inert for it.
    const jRect = joystickRef.current?.getBoundingClientRect();
    const onJoystick = jRect
      ? e.clientX >= jRect.left && e.clientX <= jRect.right &&
        e.clientY >= jRect.top && e.clientY <= jRect.bottom
      : false;
    if (!onJoystick && !isInsideStage(e.clientX, e.clientY)) {
      return;
    }

    if (onJoystick || e.clientX < window.innerWidth / 2) {
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
      // Right gameplay region: camera look, with attack on TAP. The gesture is
      // classified on release: attack fires only if the pointer never exceeded
      // the drag threshold. Arming on pointer-down would fire the attack edge
      // on the first frame of every look-drag (confirmed bug).
      if (cameraPointerId.current === null) {
        cameraPointerId.current = e.pointerId;
        lastCameraPos.current = { x: e.clientX, y: e.clientY };
        cameraDragTravel.current = 0;
        // Clear any stale armed attack so the next tap always creates a
        // clean false→true edge on release.
        setInputs({ attack: false });
      }
    }
  }, [hudEditMode, setInputs]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    // Cancel any active drag if a modal, the expanded map, or the editor opened mid-drag
    const { showSettings, showInventory, showQuestLog, mapOpen } = useGameStore.getState().ui;
    const activeDialogue = useGameStore.getState().activeDialogue;
    if (showSettings || showInventory || showQuestLog || mapOpen || hudEditMode || activeDialogue) {
      if (joystickPointerId.current !== null) {
        joystickPointerId.current = null;
        joystickOrigin.current = null;
        if (thumbRef.current) thumbRef.current.style.transform = `translate(0px, 0px)`;
        setInputs({ joystick: { x: 0, y: 0 } });
      }
      if (cameraPointerId.current !== null) {
        cameraPointerId.current = null;
        lastCameraPos.current = null;
        // A right-region press arms attack on pointer-down; the blocked-branch
        // clear must release it too or attack sticks on after the modal/map
        // opened mid-press.
        setInputs({ attack: false });
      }
      // Also clear any stuck button inputs
      if (buttonPointers.current.size > 0) {
        const updates: Partial<Record<'jump' | 'attack' | 'dodge' | 'sprint' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'skill5', boolean>> = {};
        buttonPointers.current.forEach((action) => { updates[action] = false; });
        buttonPointers.current.clear();
        setInputs(updates);
      }
      return;
    }

    if (e.pointerId === joystickPointerId.current) {
      updateJoystick(e.clientX, e.clientY);
    } else if (e.pointerId === cameraPointerId.current && lastCameraPos.current) {
      const sens = useGameStore.getState().settings.cameraSensitivity;
      const dx = e.clientX - lastCameraPos.current.x;
      const dy = e.clientY - lastCameraPos.current.y;
      cameraDragTravel.current += Math.abs(dx) + Math.abs(dy);
      // No attack write needed here: attack is only fired on release for
      // gestures that stayed under the drag threshold (tap classification
      // happens in handlePointerUp).
      currentCameraAngle.current -= dx * 0.008 * sens;
      currentCameraPitch.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, currentCameraPitch.current + dy * 0.008 * sens));
      setInputs({ cameraAngle: currentCameraAngle.current, cameraPitch: currentCameraPitch.current });
      lastCameraPos.current = { x: e.clientX, y: e.clientY };
    }
  }, [hudEditMode]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
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
      // TAP → attack: fire only if the gesture never became a look drag AND
      // gameplay input is not currently blocked (modal/map opened mid-tap).
      // The press is cleared on the next pointer-down so each tap produces
      // exactly one attack edge.
      const uiState = useGameStore.getState().ui;
      const blocked = uiState.showSettings || uiState.showInventory || uiState.showQuestLog || uiState.mapOpen || hudEditMode || useGameStore.getState().activeDialogue;
      if (cameraDragTravel.current <= 12 && !blocked) {
        setInputs({ attack: true });
      }
      cameraDragTravel.current = 0;
    } else if (buttonPointers.current.has(e.pointerId)) {
      const action = buttonPointers.current.get(e.pointerId);
      buttonPointers.current.delete(e.pointerId);
      if (action) {
        setInputs({ [action]: false });
      }
    }
  }, [hudEditMode]);

  const handleButtonPointerDown = (action: 'jump' | 'attack' | 'dodge' | 'sprint' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'skill5', e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    buttonPointers.current.set(e.pointerId, action);
    setInputs({ [action]: true });
  };

  const handleButtonPointerUp = (action: 'jump' | 'attack' | 'dodge' | 'sprint' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'skill5', e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (buttonPointers.current.has(e.pointerId)) {
      buttonPointers.current.delete(e.pointerId);
    }
    // Edge-triggered skills release immediately; other actions release too.
    setInputs({ [action]: false });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      const uiBlocked = s.ui.showSettings || s.ui.showInventory || s.ui.showQuestLog || s.ui.mapOpen || s.hudEditMode || s.activeDialogue || s.ui.deathOverlay || s.ui.showShop;

      // Chat/command console toggle: backtick key (` or ~)
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        setShowChat((prev) => !prev);
        return;
      }

      // Chat console: Escape closes; Enter submits via the input's own handler.
      // All other typing happens in the real <input>, so no manual buffer here.
      if (showChatRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowChat(false);
          return;
        }
        return;
      }

      // Escape/Tab/I close the inventory even while other input is blocked —
      // otherwise a keyboard-only player can get stuck with the modal open.
      if (s.ui.showInventory && (e.key === 'Escape' || e.key === 'Tab' || e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setShowInventory(false);
        return;
      }
      // Expanded map owns keyboard input while open (ExpandedMap handles
      // Escape/M via its own capture listener and closes through setMapOpen).
      if (s.ui.mapOpen) return;
      // Quest Journal is a single L-key toggle handled here (the quest log
      // overlay, rendered by Game.tsx, only handles Escape) so one handler owns it.
      if (s.ui.showQuestLog && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        s.setShowQuestLog(false);
        return;
      }
      if (uiBlocked) return;

      // ── Hidden movement-combination cheatcodes ───────────────────────
      // Gameplay-only: exact ordered sequences of move/jump/sprint/attack/
      // dodge/shield actions. Matching logic lives in lib/hiddenCombos.
      if (!e.repeat) {
        const token = eventToComboToken(e);
        if (token) {
          const command = feedComboToken(
            comboBufferRef.current,
            token,
            comboLastInputAtRef,
            performance.now(),
          );
          if (command) s.runCommand(command);
        }
      }

      // Quick heal
      if (e.key === 'q' || e.key === 'Q' || e.key === 'h' || e.key === 'H') {
        s.useConsumableItem();
      }

      // Inventory toggle
      if (e.key === 'Tab' || e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setShowInventory(!s.ui.showInventory);
      }

      // Quest Journal toggle (L key) — opens when closed (closing handled above)
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        s.setShowQuestLog(true);
      }

      // Hotbar selection (1-7)
      const hotbarIndex = parseInt(e.key) - 1;
      if (hotbarIndex >= 0 && hotbarIndex <= 6) {
        e.preventDefault();
        s.setSelectedHotbarSlot(hotbarIndex);
        // If shift is held, use the item
        if (e.shiftKey) {
          s.useHotbarSlot(hotbarIndex);
        }
      }

      // Shield slot (F key) — but F is also Core skill 5 (Echo Step).
      // When a Core is the selected weapon, F belongs to the Core skill
      // path (GameScene KeyboardControls) and must not be consumed here.
      const selectedWeaponId = s.hotbar.slots[s.hotbar.selectedSlot];
      const coreSelected = selectedWeaponId === 'resonance_core';
      if ((e.key === 'f' || e.key === 'F') && !coreSelected) {
        e.preventDefault();
        // Cycle shield: if none equipped, try to equip from inventory; if equipped, unequip
        const equippedShield = s.hotbar.equippedShield;
        if (equippedShield) {
          s.setEquippedShield(null);
        } else {
          // Find first shield/equipment in inventory
          const inv = s.player.inventory;
          for (const cat of ['equipment', 'weapon'] as const) {
            for (const slot of inv.categories[cat] || []) {
              const def = getItem(slot.itemId);
              if (def && (def.type === 'equipment' || def.id.includes('shield'))) {
                s.setEquippedShield(slot.itemId);
                return;
              }
            }
          }
          s.addNotification('No shield found in inventory');
        }
      }

      // Centralized interaction — single E-key handler for NPCs and checkpoints
      // OS auto-repeat must not run the interaction + debug path — same
      // `!e.repeat` convention this handler already uses for combo tokens.
      if (!e.repeat && (e.key === 'e' || e.key === 'E')) {
        // Live debug: count every E press with a timestamp (P2.4).
        useGameStore.setState((st) => ({
          debug: {
            ...st.debug,
            ePressedCount: st.debug.ePressedCount + 1,
            lastEPressedTime: new Date().toLocaleTimeString(),
          },
        }));
        if (s.ui.nearestNpcId && !s.activeDialogue) {
          s.openDialogueForNpc(s.ui.nearestNpcId);
        } else if (s.ui.nearestCheckpointPos && !s.activeDialogue) {
          s.activateCheckpoint(s.ui.nearestCheckpointPos);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setShowInventory]);

  // Interaction prompts are managed centrally by InteractionManager.tsx

  // Reset all gameplay inputs and active pointer tracking whenever any
  // modal or editor opens or closes. This prevents stuck movement, stuck
  // camera drags, and stuck button states (jump/attack/dodge/sprint) after
  // transitioning between gameplay and settings/inventory/HUD editor.
  const showSettings = useGameStore(s => s.ui.showSettings);
  const showInventory = useGameStore(s => s.ui.showInventory);
  const showQuestLog = useGameStore(s => s.ui.showQuestLog);
  const mapOpen = useGameStore(s => s.ui.mapOpen);
  const activeDialogue = useGameStore(s => s.activeDialogue);
  useEffect(() => {
    // Clear all active pointer tracking
    joystickPointerId.current = null;
    joystickOrigin.current = null;
    cameraPointerId.current = null;
    lastCameraPos.current = null;
    buttonPointers.current.clear();

    // Reset thumb visual
    if (thumbRef.current) {
      thumbRef.current.style.transform = 'translate(0px, 0px)';
    }

    // Reset all gameplay inputs to neutral state
    setInputs({
      joystick: { x: 0, y: 0 },
      jump: false,
      attack: false,
      dodge: false,
      sprint: false,
      skill1: false,
      skill2: false,
      skill3: false,
      skill4: false,
      skill5: false,
    });
  }, [hudEditMode, showSettings, showInventory, showQuestLog, mapOpen, activeDialogue, setInputs]);

  // Attach pointer listeners to the container and window. Re-attach when
  // hudEditMode changes because the container div is unmounted during edit
  // mode and remounted as a new element on close.
  useEffect(() => {
    if (hudEditMode) return;
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
  }, [hudEditMode, handlePointerDown, handlePointerMove, handlePointerUp]);

  if (hudEditMode) {
    return <HudEditor />;
  }

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-10 select-none overflow-hidden touch-none"
      style={{ padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}
    >
      {/* Custom Gameplay HUD */}
      <GameHUD />

      {/* Debug Telemetry — only renders when debug mode is enabled */}
      <DebugTelemetry />

      {/* Overlays / Modals (Dialogue, Quest Log, Inventory, Shop) are rendered
          by Game.tsx as siblings of the 16:9 stage — see the note there. This
          HUD layer is itself a sibling of the stage (M1W2D3 #1 WS1), so it
          spans the viewport and its elements spread into the letterbox region;
          the damage vignette stays inside the stage with the world. */}

      {/* Top Right — Inventory & Settings buttons (config-driven positions) */}
      {hudLayout.backpackBtn.visible && (
        <div
          className="absolute pointer-events-auto z-30"
          style={{
            left: `${hudLayout.backpackBtn.position.x * 100}%`,
            top: `${hudLayout.backpackBtn.position.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${hudLayout.backpackBtn.size / 100})`,
            opacity: hudLayout.backpackBtn.opacity / 100,
          }}
        >
          <button
            onTouchStart={(e) => { e.stopPropagation(); setShowInventory(true); }}
            onMouseDown={(e) => { e.stopPropagation(); setShowInventory(true); }}
            className="p-2 sm:p-2.5 rounded-lg backdrop-blur-sm shadow-lg transition-all active:scale-95"
            style={{
              background: H.colors.panelBg,
              border: `1px solid ${H.colors.panelBorder}`,
              color: H.colors.textPrimary,
            }}
            title="Inventory (Tab or I)"
          >
            <Backpack size={18} />
          </button>
        </div>
      )}
      {hudLayout.settingsBtn.visible && (
        <div
          className="absolute pointer-events-auto z-30"
          style={{
            left: `${hudLayout.settingsBtn.position.x * 100}%`,
            top: `${hudLayout.settingsBtn.position.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${hudLayout.settingsBtn.size / 100})`,
            opacity: hudLayout.settingsBtn.opacity / 100,
          }}
        >
          <button
            onTouchStart={(e) => { e.stopPropagation(); setShowSettings(true); }}
            onMouseDown={(e) => { e.stopPropagation(); setShowSettings(true); }}
            className="p-2 sm:p-2.5 rounded-lg backdrop-blur-sm shadow-lg transition-all active:scale-95"
            style={{
              background: H.colors.panelBg,
              border: `1px solid ${H.colors.panelBorder}`,
              color: H.colors.textPrimary,
            }}
          >
            <Settings size={18} />
          </button>
        </div>
      )}

      {/* Mobile Controls (config-driven positions) */}
      {isMobile && hudLayout.joystick.visible && (
        <div
          className="absolute rounded-full border-2 backdrop-blur-sm pointer-events-none"
          style={{
            left: `${hudLayout.joystick.position.x * 100}%`,
            top: `${hudLayout.joystick.position.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${hudLayout.joystick.size / 100})`,
            width: 'min(144px, 36vw)',
            height: 'min(144px, 36vw)',
            opacity: hudLayout.joystick.opacity / 100,
            background: 'rgba(8,8,12,0.35)',
            borderColor: 'rgba(255,255,255,0.15)',
          }}
          ref={joystickRef}
        >
          <div
            ref={thumbRef}
            className="absolute top-1/2 left-1/2 w-10 h-10 sm:w-14 sm:h-14 rounded-full -ml-5 -mt-5 sm:-ml-7 sm:-mt-7 shadow-lg pointer-events-none transition-transform duration-75 ease-out"
            style={{
              background: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          />
        </div>
      )}

      {hudLayout.skillBar.visible && (
        <div
          className="absolute z-30"
          style={{
            left: `${hudLayout.skillBar.position.x * 100}%`,
            top: `${hudLayout.skillBar.position.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${hudLayout.skillBar.size / 100})`,
            transformOrigin: 'center center',
            ...(hudLayout.skillBar.box ? { width: `${hudLayout.skillBar.box.w * 100}%`, height: `${hudLayout.skillBar.box.h * 100}%` } : {}),
            opacity: hudLayout.skillBar.opacity / 100,
            pointerEvents: 'none',
          }}
        >
          <SkillBar />
        </div>
      )}

      {/* NOTE: the standalone Attack button was removed (M1W2D2 — mobile
          input consolidation). The right gameplay region provides attack
          input: tap = attack, drag = camera look. Higher-priority UI (modals,
          expanded map, HUD editor, skill buttons) consumes touches first. */}

      {/* Mage skill buttons (mobile): three Water Staff skills Z/X/C.
          Desktop uses the same keys. Rendered ONLY while the Water Staff is
          the equipped weapon — the same hotbar source of truth the combat
          logic uses — so weapon visuals, gameplay and UI always agree. */}
      {isMobile && swordEquipped && (
        <div className="absolute pointer-events-auto z-30" style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { action: 'skill1' as const, label: 'Z', ring: 'rgba(250,204,21,0.5)', glow: 'rgba(250,204,21,0.25)' },
            { action: 'skill2' as const, label: 'X', ring: 'rgba(245,158,11,0.5)', glow: 'rgba(245,158,11,0.25)' },
          ]).map(({ action, label, ring, glow }) => (
            <button
              key={action}
              onPointerDown={(e) => handleButtonPointerDown(action, e)}
              onPointerUp={(e) => handleButtonPointerUp(action, e)}
              onPointerCancel={(e) => handleButtonPointerUp(action, e)}
              className="w-14 h-14 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none select-none"
              style={{ background: 'rgba(8,8,12,0.8)', border: `2px solid ${ring}`, boxShadow: `0 0 10px ${glow}` }}
            >
              <span className="text-base font-black pointer-events-none" style={{ color: ring }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {isMobile && weaponCategoryOf(hotbar.slots[hotbar.selectedSlot]) === 'dagger' && (
        <div className="absolute pointer-events-auto z-30" style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { action: 'skill1' as const, label: 'Z', ring: 'rgba(251,191,36,0.5)', glow: 'rgba(251,191,36,0.25)' },
            { action: 'skill2' as const, label: 'X', ring: 'rgba(217,119,6,0.5)', glow: 'rgba(217,119,6,0.25)' },
          ]).map(({ action, label, ring, glow }) => (
            <button
              key={action}
              onPointerDown={(e) => handleButtonPointerDown(action, e)}
              onPointerUp={(e) => handleButtonPointerUp(action, e)}
              onPointerCancel={(e) => handleButtonPointerUp(action, e)}
              className="w-14 h-14 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none select-none"
              style={{ background: 'rgba(8,8,12,0.8)', border: `2px solid ${ring}`, boxShadow: `0 0 10px ${glow}` }}
            >
              <span className="text-base font-black pointer-events-none" style={{ color: ring }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {isMobile && weaponCategoryOf(hotbar.slots[hotbar.selectedSlot]) === 'gun' && (
        <div className="absolute pointer-events-auto z-30" style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { action: 'skill1' as const, label: 'Z', ring: 'rgba(248,113,113,0.5)', glow: 'rgba(248,113,113,0.25)' },
            { action: 'skill2' as const, label: 'X', ring: 'rgba(251,146,60,0.5)', glow: 'rgba(251,146,60,0.25)' },
          ]).map(({ action, label, ring, glow }) => (
            <button
              key={action}
              onPointerDown={(e) => handleButtonPointerDown(action, e)}
              onPointerUp={(e) => handleButtonPointerUp(action, e)}
              onPointerCancel={(e) => handleButtonPointerUp(action, e)}
              className="w-14 h-14 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none select-none"
              style={{ background: 'rgba(8,8,12,0.8)', border: `2px solid ${ring}`, boxShadow: `0 0 10px ${glow}` }}
            >
              <span className="text-base font-black pointer-events-none" style={{ color: ring }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {isMobile && weaponCategoryOf(hotbar.slots[hotbar.selectedSlot]) === 'core' && (
        <div className="absolute pointer-events-auto z-30" style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { action: 'skill1' as const, label: 'Z', ring: 'rgba(167,139,250,0.5)', glow: 'rgba(167,139,250,0.25)' },
            { action: 'skill2' as const, label: 'X', ring: 'rgba(139,92,246,0.5)', glow: 'rgba(139,92,246,0.25)' },
            { action: 'skill3' as const, label: 'C', ring: 'rgba(124,58,237,0.5)', glow: 'rgba(124,58,237,0.25)' },
            { action: 'skill4' as const, label: 'V', ring: 'rgba(192,132,252,0.5)', glow: 'rgba(192,132,252,0.25)' },
            { action: 'skill5' as const, label: 'F', ring: 'rgba(216,180,254,0.5)', glow: 'rgba(216,180,254,0.25)' },
          ]).map(({ action, label, ring, glow }) => (
            <button
              key={action}
              onPointerDown={(e) => handleButtonPointerDown(action, e)}
              onPointerUp={(e) => handleButtonPointerUp(action, e)}
              onPointerCancel={(e) => handleButtonPointerUp(action, e)}
              className="w-14 h-14 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none select-none"
              style={{ background: 'rgba(8,8,12,0.8)', border: `2px solid ${ring}`, boxShadow: `0 0 10px ${glow}` }}
            >
              <span className="text-base font-black pointer-events-none" style={{ color: ring }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {isMobile && staffEquipped && (
        <div className="absolute pointer-events-auto z-30" style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { action: 'skill1' as const, label: 'Z', ring: 'rgba(56,189,248,0.5)', glow: 'rgba(56,189,248,0.25)' },
            { action: 'skill2' as const, label: 'X', ring: 'rgba(34,211,238,0.5)', glow: 'rgba(34,211,238,0.25)' },
            { action: 'skill3' as const, label: 'C', ring: 'rgba(103,232,249,0.5)', glow: 'rgba(103,232,249,0.25)' },
          ]).map(({ action, label, ring, glow }) => (
            <button
              key={action}
              onPointerDown={(e) => handleButtonPointerDown(action, e)}
              onPointerUp={(e) => handleButtonPointerUp(action, e)}
              onPointerCancel={(e) => handleButtonPointerUp(action, e)}
              className="w-14 h-14 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none select-none"
              style={{ background: 'rgba(8,8,12,0.8)', border: `2px solid ${ring}`, boxShadow: `0 0 10px ${glow}` }}
            >
              <span className="text-base font-black pointer-events-none" style={{ color: ring }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {isMobile && hudLayout.jumpBtn.visible && (
        <div
          className="absolute pointer-events-auto z-30"
          style={{
            left: `${hudLayout.jumpBtn.position.x * 100}%`,
            top: `${hudLayout.jumpBtn.position.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${hudLayout.jumpBtn.size / 100})`,
            opacity: hudLayout.jumpBtn.opacity / 100,
          }}
        >
          <button
            onPointerDown={(e) => handleButtonPointerDown('jump', e)}
            onPointerUp={(e) => handleButtonPointerUp('jump', e)}
            onPointerCancel={(e) => handleButtonPointerUp('jump', e)}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none shadow-lg select-none transition-all"
            style={{
              background: 'rgba(8,8,12,0.65)',
              border: '2px solid rgba(255,255,255,0.2)',
            }}
          >
            <span className="text-[10px] sm:text-xs font-bold pointer-events-none">JUMP</span>
          </button>
        </div>
      )}

      {isMobile && hudLayout.dodgeBtn.visible && (
        <div
          className="absolute pointer-events-auto z-30"
          style={{
            left: `${hudLayout.dodgeBtn.position.x * 100}%`,
            top: `${hudLayout.dodgeBtn.position.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${hudLayout.dodgeBtn.size / 100})`,
            opacity: hudLayout.dodgeBtn.opacity / 100,
          }}
        >
          <button
            onPointerDown={(e) => handleButtonPointerDown('dodge', e)}
            onPointerUp={(e) => handleButtonPointerUp('dodge', e)}
            onPointerCancel={(e) => handleButtonPointerUp('dodge', e)}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none shadow-lg select-none transition-all"
            style={{
              background: 'rgba(8,8,12,0.65)',
              border: '2px solid rgba(255,255,255,0.2)',
            }}
          >
            <span className="text-[10px] sm:text-xs font-bold pointer-events-none">DODGE</span>
          </button>
        </div>
      )}

      {isMobile && hudLayout.sprintBtn.visible && (
        <div
          className="absolute pointer-events-auto z-30"
          style={{
            left: `${hudLayout.sprintBtn.position.x * 100}%`,
            top: `${hudLayout.sprintBtn.position.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${hudLayout.sprintBtn.size / 100})`,
            opacity: hudLayout.sprintBtn.opacity / 100,
          }}
        >
          <button
            onPointerDown={(e) => handleButtonPointerDown('sprint', e)}
            onPointerUp={(e) => handleButtonPointerUp('sprint', e)}
            onPointerCancel={(e) => handleButtonPointerUp('sprint', e)}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white backdrop-blur-sm active:bg-white/20 touch-none shadow-lg select-none transition-all"
            style={{
              background: 'rgba(8,8,12,0.65)',
              border: '2px solid rgba(14,165,233,0.4)',
            }}
          >
            <span className="text-[10px] sm:text-xs font-bold pointer-events-none">SPRINT</span>
          </button>
        </div>
      )}

      {/* Desktop Hotbar */}
      {!isMobile && (
        <Hotbar />
      )}

      {/* Chat / Command Console (single developer command entry point) */}
      {showChat && <ChatConsole onClose={() => setShowChat(false)} />}

      {/* Cheat Active Indicator */}
      {useGameStore.getState().cheat.active && (
        <div className="fixed top-2 left-2 z-50 px-2 py-1 bg-yellow-500/20 border border-yellow-500/40 rounded text-yellow-300 text-xs font-bold animate-pulse">
          ⚡ CHEAT ACTIVE
        </div>
      )}
    </div>
  );
}

// ── Hotbar Component ───────────────────────────────────────────────
function Hotbar() {
  const hotbar = useGameStore(s => s.hotbar);
  const setSelectedSlot = useGameStore(s => s.setSelectedHotbarSlot);
  const setHotbarSlot = useGameStore(s => s.setHotbarSlot);
  const useSlot = useGameStore(s => s.useHotbarSlot);
  const setShowInventory = useGameStore(s => s.setShowInventory);
  const inventory = useGameStore(s => s.player.inventory);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);

  const handleSlotClick = (index: number) => {
    // If shift is held (detected via keyboard), use the item
    // Otherwise just select it
    setSelectedSlot(index);
  };

  const handleSlotRightClick = (index: number) => {
    // Right-click to use consumable items
    useSlot(index);
  };

  const handleSlotDrop = (index: number, event: React.DragEvent) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('text/plain');
    if (itemId && getItem(itemId)) {
      setHotbarSlot(index, itemId);
    }
    setDraggingSlot(null);
  };

  const handleSlotDragStart = (index: number, event: React.DragEvent) => {
    const itemId = hotbar.slots[index];
    if (itemId) {
      event.dataTransfer.setData('text/plain', itemId);
      setDraggingSlot(index);
    }
  };

  const allItems = getAllItems();

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-2 py-2 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 shadow-xl">
      {/* Hotbar slots 1-7 — equal-sized parchment slots, gold selected ring */}
      {hotbar.slots.map((itemId, index) => (
        <div
          key={index}
          className={`relative w-10 h-10 sm:w-12 sm:h-12 border-2 rounded-md transition-all cursor-pointer flex items-center justify-center text-xs font-bold shrink-0 ${
            index === hotbar.selectedSlot
              ? 'border-yellow-400 ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-400/20'
              : 'border-[#7a5e38]/60 hover:border-[#d68a31]/70'
          } ${draggingSlot === index ? 'opacity-50' : ''}`}
          style={{
            background: itemId
              ? 'linear-gradient(160deg, rgba(38,32,22,0.95), rgba(22,19,14,0.95))'
              : 'rgba(10,10,15,0.7)',
            boxShadow: index === hotbar.selectedSlot
              ? undefined
              : 'inset 0 1px 0 rgba(232,213,174,0.1), 0 1px 2px rgba(0,0,0,0.5)',
          }}
          onClick={() => handleSlotClick(index)}
          onContextMenu={(e) => { e.preventDefault(); handleSlotRightClick(index); }}
          draggable={!!itemId}
          onDragStart={(e) => handleSlotDragStart(index, e)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleSlotDrop(index, e)}
          title={itemId ? `${itemId} (Slot ${index + 1})` : `Empty Slot ${index + 1}`}
        >
          {itemId ? (
            <>
              {itemId.includes('shield') ? (
                <Shield size={18} className="text-blue-400" />
              ) : (
                <Box size={16} className="text-white/80" />
              )}
              <span className="absolute bottom-0.5 right-0.5 text-[9px] font-mono text-white/70">
                {getItemCount(inventory, itemId)}
              </span>
            </>
          ) : (
            <span className="text-[10px] text-white/30 font-mono">{index + 1}</span>
          )}
          {/* Slot number indicator */}
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-black/80 rounded-full text-[9px] font-bold text-yellow-400 ring-1 ring-white/20">
            {index + 1}
          </div>
        </div>
      ))}
      {/* Inventory button */}
      <div
        className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-dashed border-white/30 rounded-md flex items-center justify-center cursor-pointer hover:border-white/50 hover:bg-white/5 transition-all"
        onClick={() => setShowInventory(true)}
        title="Open Inventory (I or Tab)"
      >
        <Backpack size={18} className="text-white/60" />
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-black/80 rounded-full text-[9px] font-bold text-white/50 ring-1 ring-white/20">
          ⊞
        </div>
      </div>
      {/* Shield slot (conditional) */}
      {hotbar.equippedShield && (
        <div
          className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-blue-400 rounded-md flex items-center justify-center bg-blue-500/10 cursor-pointer hover:bg-blue-500/20 transition-all relative"
          onClick={() => useGameStore.getState().setEquippedShield(null)}
          title={`Equipped: ${getItem(hotbar.equippedShield)?.name || hotbar.equippedShield} (Click to unequip)`}
        >
          <Shield size={20} className="text-blue-400" />
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-blue-500/90 rounded-full text-[9px] font-bold text-white">
            🛡
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chat / Command Console Component ────────────────────────────────
// Single developer command entry point. Compact translucent log panel with
// a real text input (Enter submits, Escape closes). Commands and results
// share one scrollable log; command lines are visually distinguishable from
// responses. No branding, minimal decoration.
function ChatConsole({ onClose }: { onClose: () => void }) {
  const entries = useGameStore((s) => s.chat.entries);
  const runCommand = useGameStore((s) => s.runCommand);
  const [input, setInput] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const cmd = input.trim();
    if (!cmd) return;
    runCommand(cmd.startsWith('/') ? cmd : `/${cmd}`);
    setInput('');
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4">
      <div
        className="rounded-md border shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(12,12,16,0.92)',
          borderColor: 'rgba(214,138,49,0.45)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-1.5 border-b"
          style={{ borderColor: 'rgba(214,138,49,0.25)', background: 'rgba(30,24,16,0.9)' }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: '#d68a31', fontFamily: 'Georgia, serif' }}
          >
            Command Console
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xs px-1" title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Log */}
        <div
          ref={logRef}
          className="max-h-56 min-h-[80px] overflow-y-auto px-3 py-2 space-y-1 font-mono text-xs"
        >
          {entries.length === 0 ? (
            <p className="text-gray-600">
              Type a command and press Enter. Available: /cheat gm | fly | noclip | off, /give health_potion | apple | coin.
            </p>
          ) : (
            entries.map((e) => (
              <p
                key={e.id}
                className={
                  e.kind === 'command'
                    ? 'text-amber-300'
                    : e.kind === 'error'
                      ? 'text-red-400'
                      : e.kind === 'system'
                        ? 'text-gray-400'
                        : 'text-emerald-300'
                }
                style={{ wordBreak: 'break-word' }}
              >
                {e.kind === 'command' ? '› ' : ''}
                {e.text}
              </p>
            ))
          )}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-2 border-t" style={{ borderColor: 'rgba(214,138,49,0.25)', background: 'rgba(0,0,0,0.55)' }}>
          <span className="text-amber-500 text-xs font-mono select-none">›</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
              e.stopPropagation();
            }}
            placeholder="Enter command..."
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-gray-100 text-xs font-mono placeholder-gray-600 outline-none"
          />
        </div>
      </div>
    </div>
  );
}
