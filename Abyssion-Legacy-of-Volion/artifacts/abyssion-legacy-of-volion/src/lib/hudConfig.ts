/**
 * Centralized HUD visual tuning constants.
 * All purely-cosmetic values for the gameplay HUD live here.
 * No gameplay logic or state — this file only affects how existing
 * state is *displayed*.
 */
export const HUD_CONFIG = {
  // ── Color palette ─────────────────────────────────────────────
  colors: {
    // Health
    healthFill: '#dc2626',
    healthFillLow: '#ef4444',
    healthGlow: 'rgba(220,38,38,0.4)',
    healthTrack: 'rgba(10,10,15,0.65)',
    healthBorder: 'rgba(220,38,38,0.35)',
    lowHealthThreshold: 0.3,

    // Stamina
    staminaFill: '#0ea5e9',
    staminaGlow: 'rgba(14,165,233,0.35)',
    staminaTrack: 'rgba(10,10,15,0.55)',
    staminaBorder: 'rgba(14,165,233,0.3)',

    // Experience
    expFill: '#a855f7',
    expTrack: 'rgba(10,10,15,0.5)',
    expBorder: 'rgba(168,85,247,0.25)',

    // Level badge
    levelBadgeBg: 'rgba(250,204,21,0.12)',
    levelBadgeBorder: 'rgba(250,204,21,0.4)',
    levelBadgeText: '#facc15',

    // Combo counter
    comboActive: '#facc15',
    comboStage3: '#f59e0b',
    comboIdle: 'rgba(255,255,255,0.4)',
    comboGlow: 'rgba(250,204,21,0.5)',

    // Combat indicator
    combatActive: '#ef4444',
    combatActiveBg: 'rgba(239,68,68,0.12)',
    combatIdle: '#22c55e',
    combatIdleBg: 'rgba(34,197,94,0.1)',

    // Boss bar
    bossFill: '#dc2626',
    bossGlow: 'rgba(220,38,38,0.3)',
    bossTrack: 'rgba(10,10,15,0.7)',
    bossBorder: 'rgba(220,38,38,0.5)',
    bossNameColor: '#fef2f2',

    // Notifications
    notificationBg: 'rgba(10,10,15,0.7)',
    notificationBorder: 'rgba(255,255,255,0.08)',
    notificationText: '#e2e8f0',
    notificationAccent: '#facc15',

    // Interact prompt
    interactBg: 'rgba(10,10,15,0.75)',
    interactBorder: 'rgba(250,204,21,0.5)',
    interactText: '#facc15',
    interactKeyBg: 'rgba(250,204,21,0.15)',
    interactKeyText: '#fef3c7',

    // Death overlay
    deathBg: 'rgba(0,0,0,0.6)',
    deathText: '#ef4444',
    deathSubtext: '#94a3b8',

    // Quick heal
    healBtnBg: 'rgba(6,95,70,0.85)',
    healBtnBorder: 'rgba(16,185,129,0.5)',
    healBtnHover: 'rgba(5,122,85,0.9)',
    healBtnText: '#d1fae5',
    healBadgeBg: 'rgba(5,46,32,0.9)',
    healBadgeText: '#6ee7b7',

    // Panel / container
    panelBg: 'rgba(8,8,12,0.55)',
    panelBorder: 'rgba(255,255,255,0.06)',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
  },

  // ── Dimensions ────────────────────────────────────────────────
  bars: {
    healthHeight: '22px',
    healthHeightMobile: '16px',
    healthWidth: '280px',
    healthWidthMobile: '180px',

    staminaHeight: '10px',
    staminaHeightMobile: '8px',
    staminaWidth: '200px',
    staminaWidthMobile: '140px',

    expHeight: '6px',
    expHeightMobile: '5px',
    expWidth: '180px',
    expWidthMobile: '120px',
  },

  // ── Transitions ───────────────────────────────────────────────
  transitions: {
    barFill: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
    barFillFast: 'width 120ms ease-out',
    comboPulse: 'transform 200ms ease-out, opacity 200ms ease-out',
    notificationIn: 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 280ms ease-out',
    notificationOut: 'opacity 400ms ease-in forwards',
    combatIndicator: 'opacity 300ms ease-in-out',
    bossBarSlide: 'transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 350ms ease-in-out',
  },

  // ── Notification tuning ───────────────────────────────────────
  notifications: {
    maxVisible: 4,
    position: 'top-center' as const,
    offsetTop: '80px',
    offsetTopMobile: '60px',
    spacing: '8px',
  },

  // ── Boss bar ──────────────────────────────────────────────────
  bossBar: {
    width: '420px',
    widthMobile: '260px',
    height: '18px',
    heightMobile: '14px',
    offsetBottom: '120px',
    offsetBottomMobile: '100px',
  },

  // ── Combo display ─────────────────────────────────────────────
  combo: {
    showAt: 1,
    fontSize: '28px',
    fontSizeMobile: '22px',
    pulseScale: 1.15,
    resetDelayMs: 1200,
  },

  // ── Damage vignette ───────────────────────────────────────────
  vignette: {
    innerClear: '40%',
    outerColor: 'rgba(220,38,38,0.5)',
    transitionMs: 100,
  },

  // ── Death overlay ─────────────────────────────────────────────
  deathOverlay: {
    fadeInMs: 400,
  },
} as const;

// ── HUD Customization ──────────────────────────────────────────────
export type HudElementId =
  | 'healthBar'
  | 'staminaBar'
  | 'expBar'
  | 'quickHeal'
  | 'comboCounter'
  | 'combatIndicator'
  | 'notifications'
  | 'interactPrompt'
  | 'bossBar'
  | 'deathOverlay'
  | 'questTracker'
  | 'joystick'
  | 'jumpBtn'
  | 'dodgeBtn'
  | 'sprintBtn'
  | 'backpackBtn'
  | 'settingsBtn'
  | 'minimap'
  | 'topCenterControls'
  | 'skillBar'
  | 'mobileSkillButtons'
  | 'desktopHotbar';

/** Normalized position: x and y are fractions of viewport size (0–1). */
export interface HudPosition {
  x: number;
  y: number;
}

/** F-Mode strip (F1–F12). Deliberately NOT a HudElementId / hudLayout entry, so
 *  it never appears in the Custom HUD editor. Its position uses the same
 *  HudPosition shape, defaulting to top-centre. */
export const F_MODE_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'] as const;
export const F_MODE_STRIP_DEFAULT: HudPosition = { x: 0.5, y: 0.02 };

export interface HudElementConfig {
  visible: boolean;
  position: HudPosition;
  /** Scale percentage, 50–200. Default 100. */
  size: number;
  /** Opacity percentage, 0–100. Default 100. */
  opacity: number;
  /**
   * Optional explicit box size as viewport fractions (0–1). Absent by default,
   * so a fresh profile keeps each element's intrinsic size (current visuals).
   * Set from the HUD editor popup and applied at render as width/height %.
   * The save schema version is NOT bumped — a missing field simply means
   * "intrinsic size".
   */
  box?: { w: number; h: number };
}

export type HudLayout = Record<HudElementId, HudElementConfig>;

export const DEFAULT_HUD_LAYOUT: HudLayout = {
  healthBar:       { visible: true, position: { x: 0.12, y: 0.06 }, size: 100, opacity: 100 },
  staminaBar:      { visible: true, position: { x: 0.12, y: 0.12 }, size: 100, opacity: 100 },
  expBar:          { visible: true, position: { x: 0.12, y: 0.18 }, size: 100, opacity: 100 },
  quickHeal:       { visible: true, position: { x: 0.24, y: 0.06 }, size: 100, opacity: 100 },
  comboCounter:    { visible: true, position: { x: 0.5,  y: 0.22 }, size: 100, opacity: 100 },
  combatIndicator: { visible: true, position: { x: 0.12, y: 0.24 }, size: 100, opacity: 100 },
  notifications:   { visible: true, position: { x: 0.5,  y: 0.08 }, size: 100, opacity: 100 },
  // Top-centre controls: default y mirrors the previous `top: 6px` row — its
  // centre sits ~2% down the viewport at typical heights.
  topCenterControls: { visible: true, position: { x: 0.5,  y: 0.02 }, size: 100, opacity: 100 },
  // Skill bar: bottom-centre. y 0.80 reproduces the previous bottom-anchored
  // `clamp(72px, 15dvh + 32px, 280px)` row, expressed as a viewport fraction.
  skillBar:        { visible: true, position: { x: 0.5,  y: 0.80 }, size: 100, opacity: 100 },
  // Mobile weapon skill stack: the whole per-weapon button column is ONE
  // element. Defaults reproduce the previous hardcoded
  // `right: 16px; bottom: calc(safe-area-inset-bottom + 150px)` placement on a
  // 16:9 viewport (1280x720). The element's own box is a fixed 56x320 column
  // with its buttons bottom-aligned, so the box centre is
  //   x = 1280 - 16 - 28 = 1236 -> 0.966
  //   y = 720 - 150 - 160 = 410 -> 0.569
  // Bottom-aligning inside a fixed-height box keeps the stack's bottom edge at
  // the same place for every weapon (2-button and 5-button stacks alike).
  mobileSkillButtons: { visible: true, position: { x: 0.966, y: 0.569 }, size: 100, opacity: 100 },
  // Desktop hotbar: reproduces `bottom-4 left-1/2` on a 16:9 viewport — centred
  // horizontally, row box 66px tall, so y = 720 - 16 - 33 = 671 -> 0.932.
  desktopHotbar:   { visible: true, position: { x: 0.5,  y: 0.932 }, size: 100, opacity: 100 },
  interactPrompt:  { visible: true, position: { x: 0.5,  y: 0.85 }, size: 100, opacity: 100 },
  bossBar:         { visible: true, position: { x: 0.5,  y: 0.88 }, size: 100, opacity: 100 },
  deathOverlay:    { visible: true, position: { x: 0.5,  y: 0.5  }, size: 100, opacity: 100 },
  questTracker:    { visible: true, position: { x: 0.88, y: 0.15 }, size: 100, opacity: 100 },
  // Mobile controls — positions match the original hardcoded layout
  joystick:        { visible: true, position: { x: 0.06, y: 0.88 }, size: 100, opacity: 100 },
  jumpBtn:         { visible: true, position: { x: 0.94, y: 0.78 }, size: 100, opacity: 100 },
  dodgeBtn:        { visible: true, position: { x: 0.85, y: 0.90 }, size: 100, opacity: 100 },
  sprintBtn:       { visible: true, position: { x: 0.85, y: 0.78 }, size: 100, opacity: 100 },
  backpackBtn:     { visible: true, position: { x: 0.96, y: 0.04 }, size: 100, opacity: 100 },
  settingsBtn:     { visible: true, position: { x: 0.92, y: 0.04 }, size: 100, opacity: 100 },
  // Minimap default position matches the previous fixed corner placement.
  minimap:         { visible: true, position: { x: 0.88, y: 0.06 }, size: 100, opacity: 100 },
};

export const HUD_ELEMENT_LABELS: Record<HudElementId, string> = {
  healthBar: 'Health Bar',
  staminaBar: 'Stamina Bar',
  expBar: 'EXP Bar',
  quickHeal: 'Quick Heal',
  comboCounter: 'Combo Counter',
  combatIndicator: 'Combat Indicator',
  notifications: 'Notifications',
  interactPrompt: 'Interact Prompt',
  topCenterControls: 'Top Controls',
  skillBar: 'Skill Bar',
  mobileSkillButtons: 'Mobile Skills',
  desktopHotbar: 'Desktop Hotbar',
  bossBar: 'Boss Bar',
  deathOverlay: 'Death Overlay',
  questTracker: 'Quest Tracker',
  joystick: 'Joystick',
  jumpBtn: 'Jump',
  dodgeBtn: 'Dodge',
  sprintBtn: 'Sprint',
  backpackBtn: 'Backpack',
  settingsBtn: 'Settings',
  minimap: 'Minimap',
};

/** Elements that can be freely dragged.
 *  NOTE (P1.6): 'attackBtn' is deliberately excluded — Attack (mobile M1)
 *  is a fixed gameplay input and must not be movable/hideable via Custom HUD. */
export const DRAGGABLE_HUD_ELEMENTS: HudElementId[] = [
  'healthBar', 'staminaBar', 'expBar', 'quickHeal',
  'comboCounter', 'combatIndicator', 'notifications', 'interactPrompt', 'bossBar',
  'deathOverlay', 'questTracker',
  'joystick', 'jumpBtn', 'dodgeBtn', 'sprintBtn',
  'backpackBtn', 'settingsBtn', 'minimap',
  'topCenterControls',
  'skillBar',
  'mobileSkillButtons',
  'desktopHotbar',
];

/**
 * Skill HUD configuration (M1W2D5 C3): manual skill name + slot assignment for
 * the currently equipped weapon/Core. Display-only: gameplay skill routing
 * (which skill fires on which input action) stays authoritative in Player.tsx.
 * A skill entry with an empty/unknown id renders as an empty/unavailable slot.
 */
export type SkillSlotKey = 'Z' | 'X' | 'C' | 'V' | 'F';

export interface SkillHudEntry {
  /** Authoritative skill id from the item's skill data (empty = no skill). */
  id: string;
  /** Display name override; empty string falls back to the skill's data name. */
  name: string;
  /** HUD input-slot label. */
  slot: SkillSlotKey;
}

export interface SkillHudConfig { [itemId: string]: SkillHudEntry[] }

/** Skill-slot ordering used by the HUD editor and the skill bar renderer. */
export const SKILL_SLOT_KEYS: readonly SkillSlotKey[] = ['Z', 'X', 'C', 'V', 'F'];

/** Old preset-position string → normalized coordinates. */
const PRESET_TO_COORDS: Record<string, HudPosition> = {
  'top-left': { x: 0.12, y: 0.06 },
  'top-right': { x: 0.88, y: 0.06 },
  'top-center': { x: 0.5, y: 0.08 },
  'bottom-left': { x: 0.12, y: 0.85 },
  'bottom-right': { x: 0.88, y: 0.85 },
  'bottom-center': { x: 0.5, y: 0.85 },
};

/**
 * Migrate an old or partial hudLayout save into a complete, valid HudLayout.
 * Handles:
 *  - Missing hudLayout entirely → defaults
 *  - Old preset-string positions → normalized coordinates
 *  - Old group-based layout (statusCluster) → expanded to independent elements
 *  - Missing size/opacity fields → defaults (100/100)
 *  - Missing elements → defaults
 */
export function migrateHudLayout(saved: unknown): HudLayout {
  const result: HudLayout = {
    ...DEFAULT_HUD_LAYOUT,
  };

  if (!saved || typeof saved !== 'object') return result;

  const savedLayout = saved as Record<string, unknown>;

  // Helper to extract a single element config from saved data
  const extractConfig = (savedEl: unknown, def: HudElementConfig): HudElementConfig => {
    if (!savedEl || typeof savedEl !== 'object') return { ...def };
    const el = savedEl as Record<string, unknown>;

    const visible = typeof el.visible === 'boolean' ? el.visible : def.visible;

    let position: HudPosition = { ...def.position };
    if (typeof el.position === 'string' && PRESET_TO_COORDS[el.position]) {
      position = { ...PRESET_TO_COORDS[el.position] };
    } else if (el.position && typeof el.position === 'object') {
      const p = el.position as Record<string, unknown>;
      if (typeof p.x === 'number' && typeof p.y === 'number'
          && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        position = { x: p.x, y: p.y };
      }
    }

    const size = typeof el.size === 'number' && Number.isFinite(el.size) ? el.size : def.size;
    const opacity = typeof el.opacity === 'number' && Number.isFinite(el.opacity) ? el.opacity : def.opacity;

    return { visible, position, size, opacity };
  };

  // Migrate old statusCluster group → independent elements
  // The old group contained health, stamina, exp, quickHeal, combo, combat.
  // If the save has statusCluster but not the new individual keys, expand it.
  const oldCluster = savedLayout['statusCluster'];
  const hasNewKeys = savedLayout['healthBar'] || savedLayout['staminaBar'];
  if (oldCluster && !hasNewKeys) {
    const clusterConfig = extractConfig(oldCluster, DEFAULT_HUD_LAYOUT.healthBar);
    // Apply the cluster's position/visibility/size/opacity to all former members
    result.healthBar = { ...clusterConfig, position: { x: 0.12, y: 0.06 } };
    result.staminaBar = { ...clusterConfig, position: { x: 0.12, y: 0.12 } };
    result.expBar = { ...clusterConfig, position: { x: 0.12, y: 0.18 } };
    result.quickHeal = { ...clusterConfig, position: { x: 0.24, y: 0.06 } };
    result.comboCounter = { ...clusterConfig, position: { x: 0.5, y: 0.22 } };
    result.combatIndicator = { ...clusterConfig, position: { x: 0.12, y: 0.24 } };
  }

  // Migrate each individual element
  for (const id of Object.keys(result) as HudElementId[]) {
    if (savedLayout[id]) {
      result[id] = extractConfig(savedLayout[id], DEFAULT_HUD_LAYOUT[id]);
    }
  }

  return result;
}
