'use client';

import { useGameStore } from '@/lib/store';
import { HUD_CONFIG as H, HudElementId, HudElementConfig, DRAGGABLE_HUD_ELEMENTS } from '@/lib/hudConfig';
import { Camera, MessageSquare, X } from 'lucide-react';
import { getItemCount } from '@/lib/inventory';
import { useTranslation } from '@/lib/useTranslation';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Heart, Crosshair, Skull, Swords, Shield, Backpack, Settings, Sword } from 'lucide-react';
import QuestTrackerHUD from './QuestTrackerHUD';
import Minimap from './Minimap';
import { SkillBar, Hotbar, MobileSkillButtons } from './UI';
import ExpandedMap from './ExpandedMap';

// ── Narrow selector helpers ─────────────────────────────────────
// Each sub-component selects only the slice of state it needs,
// preventing unnecessary rerenders from unrelated store updates.

function HealthBarContent() {
  const health = useGameStore(s => s.player.health);
  const maxHealth = useGameStore(s => s.player.maxHealth);
  const pct = (health / maxHealth) * 100;
  const isLow = health / maxHealth < H.colors.lowHealthThreshold;

  return (
    <div className="relative w-[var(--hw)] h-[var(--hh)] rounded-md overflow-hidden"
      style={{
        ['--hw' as string]: `min(${H.bars.healthWidth}, 60vw)`,
        ['--hh' as string]: H.bars.healthHeight,
        background: H.colors.healthTrack,
        border: `1px solid ${H.colors.healthBorder}`,
        boxShadow: isLow ? `0 0 12px ${H.colors.healthGlow}` : 'none',
      }}
    >
      <div
        className="h-full rounded-sm"
        style={{
          width: `${pct}%`,
          background: isLow
            ? `linear-gradient(90deg, ${H.colors.healthFillLow}, ${H.colors.healthFill})`
            : H.colors.healthFill,
          transition: H.transitions.barFill,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15)`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-2">
        <span className="flex items-center gap-1 text-[10px] font-bold text-white/90 drop-shadow"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
        >
          <Heart size={10} className="fill-white/80" />
        </span>
        <span className="text-[10px] font-bold text-white drop-shadow tabular-nums"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
        >
          {Math.round(health)} / {maxHealth}
        </span>
      </div>
    </div>
  );
}

function StaminaBarContent() {
  const stamina = useGameStore(s => s.player.stamina);
  const maxStamina = useGameStore(s => s.player.maxStamina);
  const pct = (stamina / maxStamina) * 100;

  return (
    <div className="relative w-[var(--sw)] h-[var(--sh)] rounded-sm overflow-hidden"
      style={{
        ['--sw' as string]: `min(${H.bars.staminaWidth}, 45vw)`,
        ['--sh' as string]: H.bars.staminaHeight,
        background: H.colors.staminaTrack,
        border: `1px solid ${H.colors.staminaBorder}`,
      }}
    >
      <div
        className="h-full"
        style={{
          width: `${pct}%`,
          background: H.colors.staminaFill,
          transition: H.transitions.barFillFast,
          boxShadow: `0 0 6px ${H.colors.staminaGlow}`,
        }}
      />
    </div>
  );
}

function ExpBarContent() {
  const exp = useGameStore(s => s.player.exp);
  const maxExp = useGameStore(s => s.player.maxExp);
  const level = useGameStore(s => s.player.level);
  const pct = ((exp || 0) / (maxExp || 100)) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums"
        style={{
          background: H.colors.levelBadgeBg,
          border: `1px solid ${H.colors.levelBadgeBorder}`,
          color: H.colors.levelBadgeText,
        }}
      >
        LV {level || 1}
      </span>
      <div className="relative w-[var(--ew)] h-[var(--eh)] rounded-sm overflow-hidden"
        style={{
          ['--ew' as string]: `min(${H.bars.expWidth}, 35vw)`,
          ['--eh' as string]: H.bars.expHeight,
          background: H.colors.expTrack,
          border: `1px solid ${H.colors.expBorder}`,
        }}
      >
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: H.colors.expFill,
            transition: H.transitions.barFill,
          }}
        />
      </div>
    </div>
  );
}

function QuickHealContent() {
  const inventory = useGameStore(s => s.player.inventory);
  const { tl } = useTranslation();
  const healCount = useMemo(
    () => ['health_potion', 'small_potion', 'bread', 'apple', 'crispy_chicken', 'chicken_steak', 'beef_steak', 'chicken_katsu', 'kebab', 'shawarma'].reduce(
      (sum, id) => sum + getItemCount(inventory, id), 0
    ),
    [inventory]
  );

  return (
    <button
      onClick={() => useGameStore.getState().useConsumableItem()}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all active:scale-95 pointer-events-auto"
      style={{
        background: H.colors.healBtnBg,
        border: `1px solid ${H.colors.healBtnBorder}`,
        color: H.colors.healBtnText,
      }}
      title="Use Healing Item (Q or H)"
    >
      <span className="text-sm">🧪</span>
      <span className="hidden sm:inline">{tl('hud.heal')}</span>
      <span className="px-1 py-0.5 rounded text-[9px] tabular-nums"
        style={{ background: H.colors.healBadgeBg, color: H.colors.healBadgeText }}
      >
        ×{healCount}
      </span>
    </button>
  );
}

function ComboCounterContent({ preview = false }: { preview?: boolean } = {}) {
  const liveStage = useGameStore(s => s.player.comboStage);
  const liveConfirmed = useGameStore(s => s.player.comboConfirmed);
  const isAttacking = useGameStore(s => s.player.isAttacking);
  // WYSIWYG editor preview: representative active combo when the live state is
  // idle, so the same component is visible/selectable in the editor canvas.
  const comboStage = preview && !liveConfirmed ? 3 : liveStage;
  const comboConfirmed = preview ? true : liveConfirmed;
  const [pulse, setPulse] = useState(false);
  const prevStage = useRef(0);

  useEffect(() => {
    if (comboConfirmed && comboStage > 0 && comboStage !== prevStage.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 200);
      prevStage.current = comboStage;
      return () => clearTimeout(t);
    }
    prevStage.current = comboStage;
    return undefined;
  }, [comboStage, comboConfirmed]);

  if (!comboConfirmed || comboStage < H.combo.showAt) return null;

  const isStage3 = comboStage === 3;
  const color = isStage3 ? H.colors.comboStage3 : H.colors.comboActive;

  return (
    <div
      className="flex items-baseline gap-1.5 select-none pointer-events-none"
      style={{
        opacity: comboStage > 0 ? 1 : 0,
        transform: pulse ? `scale(${H.combo.pulseScale})` : 'scale(1)',
        transition: H.transitions.comboPulse,
      }}
    >
      <Swords size={18} style={{ color }} />
      <span
        className="font-black tabular-nums leading-none"
        style={{
          color,
          fontSize: isStage3 ? `calc(${H.combo.fontSize} * 1.2)` : H.combo.fontSize,
          textShadow: `0 2px 8px ${H.colors.comboGlow}, 0 0 2px rgba(0,0,0,0.8)`,
        }}
      >
        {comboStage}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: H.colors.comboIdle, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
      >
        {isStage3 ? 'HEAVY' : isAttacking ? 'COMBO' : 'HIT'}
      </span>
    </div>
  );
}

function CombatIndicatorContent({ preview = false }: { preview?: boolean } = {}) {
  const liveInCombat = useGameStore(s => s.player.inCombat);
  const isDodging = useGameStore(s => s.player.isDodging);
  const inCombat = preview ? true : liveInCombat;

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider select-none pointer-events-none"
      style={{
        background: inCombat ? H.colors.combatActiveBg : H.colors.combatIdleBg,
        border: `1px solid ${inCombat ? H.colors.combatActive : H.colors.combatIdle}40`,
        color: inCombat ? H.colors.combatActive : H.colors.combatIdle,
        opacity: 1,
        transition: H.transitions.combatIndicator,
      }}
    >
      {isDodging ? (
        <>
          <Shield size={12} />
          <span>Dodging</span>
        </>
      ) : inCombat ? (
        <>
          <Crosshair size={12} />
          <span>In Combat</span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: H.colors.combatIdle }} />
          <span>Safe</span>
        </>
      )}
    </div>
  );
}

function NotificationsContent({ preview = false }: { preview?: boolean } = {}) {
  const liveNotifications = useGameStore(s => s.notifications);
  const notifications = preview && liveNotifications.length === 0
    ? [{ id: 'preview', text: 'Sample Notification' }]
    : liveNotifications;

  return (
    <div className="flex flex-col items-center gap-2 pointer-events-none">
      {notifications.slice(-H.notifications.maxVisible).map((n) => (
        <div
          key={n.id}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-center max-w-[80vw]"
          style={{
            background: H.colors.notificationBg,
            border: `1px solid ${H.colors.notificationBorder}`,
            color: H.colors.notificationText,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            opacity: 1,
            transform: 'translateY(0)',
            transition: H.transitions.notificationIn,
          }}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}

function InteractPromptContent({ preview = false }: { preview?: boolean } = {}) {
  const livePrompt = useGameStore(s => s.ui.interactPrompt);
  const interactPrompt = preview ? 'Interact' : livePrompt;
  if (!interactPrompt) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{
        background: H.colors.interactBg,
        border: `1px solid ${H.colors.interactBorder}`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <kbd
        className="px-1.5 py-0.5 rounded text-[10px] font-bold"
        style={{
          background: H.colors.interactKeyBg,
          color: H.colors.interactKeyText,
          border: `1px solid ${H.colors.interactBorder}`,
        }}
      >
         E
      </kbd>
      <span className="text-xs font-semibold" style={{ color: H.colors.interactText }}>
        {interactPrompt}
      </span>
    </div>
  );
}

function BossBarContent({ preview = false }: { preview?: boolean } = {}) {
  const liveBoss = useGameStore(s => s.boss);
  const boss = preview
    ? { name: 'Boss Name', health: 65, maxHealth: 100, active: true }
    : liveBoss;
  if (!boss || !boss.active) return null;

  const pct = (boss.health / boss.maxHealth) * 100;

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="text-xs font-bold uppercase tracking-widest"
        style={{
          color: H.colors.bossNameColor,
          textShadow: '0 2px 6px rgba(0,0,0,0.8)',
        }}
      >
        {boss.name}
      </span>
      <div
        className="relative rounded-md overflow-hidden"
        style={{
          width: `min(${H.bossBar.width}, 85vw)`,
          height: H.bossBar.height,
          background: H.colors.bossTrack,
          border: `2px solid ${H.colors.bossBorder}`,
          boxShadow: `0 0 16px ${H.colors.bossGlow}`,
        }}
      >
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${H.colors.bossFill}, #991b1b)`,
            transition: H.transitions.barFill,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        />
      </div>
    </div>
  );
}

function QuestTrackerContent() {
  return <QuestTrackerHUD />;
}

function DeathOverlayContent({ preview = false }: { preview?: boolean } = {}) {
  const liveDeathOverlay = useGameStore(s => s.ui.deathOverlay);
  const deathOverlay = preview || liveDeathOverlay;
  const { tl } = useTranslation();
  if (!deathOverlay) return null;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      style={{
        background: H.colors.deathBg,
        animation: `fadeIn ${H.deathOverlay.fadeInMs}ms ease-in forwards`,
      }}
    >
      <Skull size={48} style={{ color: H.colors.deathText }} />
      <span
        className="mt-3 text-2xl font-black uppercase tracking-widest"
        style={{ color: H.colors.deathText, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
      >
        {tl('hud.youDied')}
      </span>
      <span
        className="mt-1 text-xs font-semibold"
        style={{ color: H.colors.deathSubtext }}
      >
        {tl('hud.respawning')}
      </span>
    </div>
  );
}

// ── Draggable wrapper ───────────────────────────────────────────
interface DraggableHudElementProps {
  id: HudElementId;
  config: HudElementConfig;
  children: React.ReactNode;
  /** If true, element is always fullscreen (death overlay). */
  fullscreen?: boolean;
  /** If true, enables drag interaction (edit mode). */
  editable?: boolean;
  /** Optional: report selection on pointer down */
  onSelect?: () => void;
  /** Optional: override whether this element is the selected one */
  selected?: boolean;
  /** Keep pointer events enabled outside edit mode (interactive controls). */
  interactive?: boolean;
}

function DraggableHudElement({ id, config, children, fullscreen, editable, onSelect, selected, interactive = false }: DraggableHudElementProps) {
  const setHudElement = useGameStore(s => s.setHudElement);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);

  const isDraggable = !fullscreen && DRAGGABLE_HUD_ELEMENTS.includes(id);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!editable || !isDraggable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: config.position.x,
      origY: config.position.y,
    };
    setDragging(true);
    onSelect?.();
  }, [editable, isDraggable, config.position.x, config.position.y, onSelect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dx = (e.clientX - dragState.current.startX) / vw;
    const dy = (e.clientY - dragState.current.startY) / vh;
    let newX = dragState.current.origX + dx;
    let newY = dragState.current.origY + dy;
    newX = Math.max(0, Math.min(1, newX));
    newY = Math.max(0, Math.min(1, newY));
    setLivePos({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragState.current) return;
    const finalPos = livePos ?? { x: config.position.x, y: config.position.y };
    setHudElement(id, { position: finalPos });
    dragState.current = null;
    setDragging(false);
    setLivePos(null);
  }, [livePos, config.position.x, config.position.y, setHudElement, id]);

  const pos = dragging && livePos ? livePos : config.position;
  const scale = config.size / 100;
  const opacity = config.opacity / 100;

  // M1W3D6 #1 WS2: the fullscreen variant (DeathOverlay) must give its child a
  // definite box. With an empty baseStyle the child's `absolute inset-0`
  // resolved against a 0x0 wrapper, so the death overlay rendered invisibly.
  // `inset: 0` makes the wrapper cover the viewport, which is exactly what the
  // child's own `absolute inset-0` then inherits.
  const baseStyle: React.CSSProperties = fullscreen
    ? { inset: 0 }
    : {
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
      };

  // Optional explicit box size set from the HUD editor popup. Absent means the
  // element keeps its intrinsic size (current visuals).
  const boxStyle: React.CSSProperties = !fullscreen && config.box
    ? { width: `${config.box.w * 100}%`, height: `${config.box.h * 100}%` }
    : {};

  const editOutline = editable && isDraggable
    ? {
        outline: selected
          ? '2px solid #facc15'
          : dragging
            ? '2px solid #facc15'
            : '1px dashed rgba(250,204,21,0.5)',
        outlineOffset: '2px',
        cursor: dragging ? 'grabbing' : 'grab',
      }
    : {};

  return (
    <div
      className="absolute"
      style={{
        ...baseStyle,
        ...boxStyle,
        opacity,
        ...editOutline,
        zIndex: fullscreen ? 50 : 40,
        touchAction: editable && isDraggable ? 'none' : 'auto',
        pointerEvents: (editable && isDraggable) || interactive ? 'auto' : 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {children}
    </div>
  );
}

// ── Main HUD container (gameplay) ───────────────────────────────
function TopCenterControls({ preview = false }: { preview?: boolean } = {}) {
  const showSettings = useGameStore((s) => s.ui.showSettings);
  const setShowSettings = useGameStore((s) => s.setShowSettings);
  const chatOpen = useGameStore((s) => s.cheat.chatOpen);
  const setChatOpen = useGameStore((s) => s.setChatOpen);
  const cycleCameraMode = () => {
    // Cycle the authoritative camera mode used by the Player camera rig.
    const s = useGameStore.getState();
    const order = ['third', 'second', 'first'] as const;
    const idx = order.indexOf(s.settings.cameraMode as 'third' | 'second' | 'first');
    s.setSettings({ cameraMode: order[(idx + 1) % order.length] });
  };
  const btn = 'flex items-center gap-1 px-2.5 py-1 rounded backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider transition-colors';
  const style = {
    background: H.colors.panelBg,
    border: `1px solid ${H.colors.panelBorder}`,
    color: H.colors.textPrimary,
  };
  return (
    <div
      className="flex items-center gap-1.5"
      data-preview={preview ? 'true' : undefined}
      style={{ pointerEvents: 'auto' }}
    >
      <button type="button" className={btn} style={style} onClick={cycleCameraMode} title="Change camera mode">
        <Camera size={12} />
        <span className="hidden sm:inline">Change Cam</span>
      </button>
      <button type="button" className={btn} style={style} onClick={() => setShowSettings(!showSettings)} title="Settings">
        <span className="hidden sm:inline">Settings</span>
        <span className="sm:hidden">Set</span>
      </button>
      <button type="button" className={btn} style={style} onClick={() => setChatOpen(!chatOpen)} title="Command chat">
        <MessageSquare size={12} />
        <span className="hidden sm:inline">Chat</span>
      </button>
    </div>
  );
}

export default function GameHUD() {
  const hudLayout = useGameStore(s => s.hudLayout);
  // Expanded map open state lives in the store (transient, reset on every
  // session boundary) so gameplay input handlers can check it without
  // prop-drilling or a parallel subscription path.
  const mapOpen = useGameStore((s) => s.ui.mapOpen);

  return (
    <>
      {hudLayout.healthBar.visible && (
        <DraggableHudElement id="healthBar" config={hudLayout.healthBar}>
          <HealthBarContent />
        </DraggableHudElement>
      )}

      {hudLayout.staminaBar.visible && (
        <DraggableHudElement id="staminaBar" config={hudLayout.staminaBar}>
          <StaminaBarContent />
        </DraggableHudElement>
      )}

      {hudLayout.expBar.visible && (
        <DraggableHudElement id="expBar" config={hudLayout.expBar}>
          <ExpBarContent />
        </DraggableHudElement>
      )}

      {hudLayout.quickHeal.visible && (
        <DraggableHudElement id="quickHeal" config={hudLayout.quickHeal}>
          <QuickHealContent />
        </DraggableHudElement>
      )}

      {hudLayout.comboCounter.visible && (
        <DraggableHudElement id="comboCounter" config={hudLayout.comboCounter}>
          <ComboCounterContent />
        </DraggableHudElement>
      )}

      {hudLayout.combatIndicator.visible && (
        <DraggableHudElement id="combatIndicator" config={hudLayout.combatIndicator}>
          <CombatIndicatorContent />
        </DraggableHudElement>
      )}

      {hudLayout.notifications.visible && (
        <DraggableHudElement id="notifications" config={hudLayout.notifications}>
          <NotificationsContent />
        </DraggableHudElement>
      )}

      {hudLayout.interactPrompt.visible && (
        <DraggableHudElement id="interactPrompt" config={hudLayout.interactPrompt}>
          <InteractPromptContent />
        </DraggableHudElement>
      )}

      {hudLayout.bossBar.visible && (
        <DraggableHudElement id="bossBar" config={hudLayout.bossBar}>
          <BossBarContent />
        </DraggableHudElement>
      )}

      {hudLayout.deathOverlay.visible && (
        <DraggableHudElement id="deathOverlay" config={hudLayout.deathOverlay} fullscreen>
          <DeathOverlayContent />
        </DraggableHudElement>
      )}

      {hudLayout.questTracker.visible && (
        <DraggableHudElement id="questTracker" config={hudLayout.questTracker}>
          <QuestTrackerContent />
        </DraggableHudElement>
      )}

      {/* Minimap: a configurable HUD element (visibility/position/size follow
          the same hudLayout source of truth as every other HUD element). The
          map canvas itself is the tap target that opens the expanded map. */}
      {hudLayout.minimap.visible && (
        <div
          className="absolute z-40"
          style={{
            left: `${hudLayout.minimap.position.x * 100}%`,
            top: `${hudLayout.minimap.position.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${hudLayout.minimap.size / 100})`,
            transformOrigin: 'center center',
            ...(hudLayout.minimap.box ? { width: `${hudLayout.minimap.box.w * 100}%`, height: `${hudLayout.minimap.box.h * 100}%` } : {}),
            opacity: hudLayout.minimap.opacity / 100,
            // The Minimap wrapper enables pointer events only on itself (its
            // tap opens the expanded map); the rest of the layer stays inert
            // so the map never leaks input into gameplay.
            pointerEvents: 'none',
          }}
        >
          <Minimap size={128} onOpenExpanded={() => useGameStore.getState().setMapOpen(true)} />
        </div>
      )}

      {/* Top-centre controls (P2.5): Change Cam | Settings | Chat. Real
          controls wired to authoritative state — no fake multiplayer.
          Chat here means the local player-facing command console. */}
      {hudLayout.topCenterControls.visible && (
        <DraggableHudElement id="topCenterControls" config={hudLayout.topCenterControls} interactive>
          <TopCenterControls />
        </DraggableHudElement>
      )}

      {mapOpen && <ExpandedMap onClose={() => useGameStore.getState().setMapOpen(false)} />}
    </>
  );
}

// ── Exported content renderers for the HUD editor ───────────────
/** Gameplay content renderers — these read live game state. */
export const HudElementContent: Record<HudElementId, () => React.ReactElement | null> = {
  healthBar: HealthBarContent,
  staminaBar: StaminaBarContent,
  expBar: ExpBarContent,
  quickHeal: QuickHealContent,
  comboCounter: ComboCounterContent,
  combatIndicator: CombatIndicatorContent,
  notifications: NotificationsContent,
  interactPrompt: InteractPromptContent,
  bossBar: BossBarContent,
  deathOverlay: DeathOverlayContent,
  questTracker: QuestTrackerContent,
  // Mobile controls are rendered by UI.tsx, not via DraggableHudElement
  // in gameplay. Provide stub renderers so the Record type is satisfied.
  joystick: () => null,
  jumpBtn: () => null,
  dodgeBtn: () => null,
  sprintBtn: () => null,
  backpackBtn: () => null,
  settingsBtn: () => null,
  minimap: () => null,
  // Top-centre controls render directly in GameHUD (they need pointer events),
  // so the in-game content map only needs the key for type completeness.
  topCenterControls: () => null,
  skillBar: () => null,
  // The mobile skill stack and the desktop hotbar are rendered by UI.tsx (they
  // need the gameplay pointer handlers), so gameplay needs no content renderer.
  mobileSkillButtons: () => null,
  desktopHotbar: () => null,
};

// ── Editor-specific content renderers ──────────────────────────
// These are identical to the gameplay renderers except they always
// render representative content regardless of runtime game state
// (boss active, combo counting, death triggered, etc.) so every
// element is visible and selectable in the HUD editor canvas.

function EditorJoystickContent() {
  return (
    <div
      className="pointer-events-none select-none rounded-full border-2"
      style={{
        width: 144,
        height: 144,
        background: 'rgba(8,8,12,0.35)',
        borderColor: 'rgba(255,255,255,0.15)',
      }}
    >
      <div
        className="absolute top-1/2 left-1/2 w-14 h-14 rounded-full -ml-7 -mt-7"
        style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.2)' }}
      />
    </div>
  );
}

function EditorJumpBtnContent() {
  return (
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center pointer-events-none select-none"
      style={{ background: 'rgba(8,8,12,0.65)', border: '2px solid rgba(255,255,255,0.2)' }}
    >
      <span className="text-[10px] font-bold text-white">JUMP</span>
    </div>
  );
}

function EditorDodgeBtnContent() {
  return (
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center pointer-events-none select-none"
      style={{ background: 'rgba(8,8,12,0.65)', border: '2px solid rgba(255,255,255,0.2)' }}
    >
      <span className="text-[10px] font-bold text-white">DODGE</span>
    </div>
  );
}


function EditorSprintBtnContent() {
  return (
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center pointer-events-none select-none"
      style={{ background: 'rgba(8,8,12,0.65)', border: '2px solid rgba(14,165,233,0.4)' }}
    >
      <span className="text-[10px] font-bold text-white">SPRINT</span>
    </div>
  );
}

function EditorBackpackBtnContent() {
  return (
    <div
      className="p-2 rounded-lg backdrop-blur-sm pointer-events-none select-none"
      style={{
        background: H.colors.panelBg,
        border: `1px solid ${H.colors.panelBorder}`,
        color: H.colors.textPrimary,
      }}
    >
      <Backpack size={18} />
    </div>
  );
}

function EditorSettingsBtnContent() {
  return (
    <div
      className="p-2 rounded-lg backdrop-blur-sm pointer-events-none select-none"
      style={{
        background: H.colors.panelBg,
        border: `1px solid ${H.colors.panelBorder}`,
        color: H.colors.textPrimary,
      }}
    >
      <Settings size={18} />
    </div>
  );
}

export const EditorHudElementContent: Record<HudElementId, () => React.ReactElement | null> = {
  healthBar: HealthBarContent,
  staminaBar: StaminaBarContent,
  expBar: ExpBarContent,
  quickHeal: QuickHealContent,
  comboCounter: () => <ComboCounterContent preview />,
  combatIndicator: CombatIndicatorContent,
  notifications: () => <NotificationsContent preview />,
  interactPrompt: () => <InteractPromptContent preview />,
  bossBar: () => <BossBarContent preview />,
  deathOverlay: () => <DeathOverlayContent preview />,
  questTracker: QuestTrackerContent,
  joystick: EditorJoystickContent,
  jumpBtn: EditorJumpBtnContent,
  dodgeBtn: EditorDodgeBtnContent,
  sprintBtn: EditorSprintBtnContent,
  backpackBtn: EditorBackpackBtnContent,
  settingsBtn: EditorSettingsBtnContent,
  topCenterControls: () => <TopCenterControls preview />,
  skillBar: () => <SkillBar preview />,
  // Same components as gameplay, only the `preview` prop differs — so the
  // editor canvas is WYSIWYG for both elements.
  mobileSkillButtons: () => <MobileSkillButtons preview />,
  desktopHotbar: () => <Hotbar preview />,
  // Real minimap (same component as gameplay). No `preview` prop exists on
  // Minimap. `onOpenExpanded` is intentionally omitted: the minimap only
  // enables its own pointer events (and stops propagation) when that prop is
  // supplied, which would swallow the editor's drag/select pointer handling.
  minimap: () => <Minimap size={128} />,
};

export { DraggableHudElement };
