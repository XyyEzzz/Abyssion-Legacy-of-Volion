import { create } from 'zustand';
import * as THREE from 'three';
import { Quest, Objective, INITIAL_QUESTS, NPCS_DATA, NpcType, DialogueChoice } from './questData';
import { t, Lang } from './translations';
import { InventoryState, createInventory, addItem, removeItem, getItemCount, getItemCountByName, getOccupiedSlots, getActiveCategories } from './inventory';
import { Archetype, canUseWeapon } from './archetype';
import { getItem, getItemIdByName, armourSlotOf, type ArmourSlot } from './items';
import { COMBAT_CONFIG } from './combatConfig';
import { HudLayout, HudElementId, HudElementConfig, DEFAULT_HUD_LAYOUT, migrateHudLayout, SkillHudConfig, SkillHudEntry } from './hudConfig';
import { ItemProgression, PlayerStats, createItemProgression, createPlayerStats, grantItemExp, isSkillUnlocked } from './progression';

/** Each weapon/Core id owns independent EXP/level. Authoritative for skill
 *  unlocks; persisted with the save slot. Absent id ⇒ fresh progression. */
export type ItemProgressionMap = Record<string, ItemProgression>;

/** Chat/command log entry. `kind` drives visual styling in the chat UI. */
export interface ChatLogEntry {
  id: number;
  text: string;
  kind: 'command' | 'result' | 'error' | 'system';
}

export interface EnemyTarget {
  id: string;
  faction: string;
  getPosition: () => THREE.Vector3;
  takeDamage: (damage: number, sourcePos: THREE.Vector3, comboStage: number) => boolean;
}

export const enemyTargets = new Map<string, EnemyTarget>();

export function registerEnemyTarget(target: EnemyTarget) {
  enemyTargets.set(target.id, target);
}

export function unregisterEnemyTarget(id: string) {
  enemyTargets.delete(id);
}

// Shared NPC position tracking for collision avoidance.
// Each NPC updates its position every frame; isPositionBlocked reads it.
export const npcPositions = new Map<string, { x: number; z: number }>();

export function updateNpcPosition(id: string, x: number, z: number) {
  const existing = npcPositions.get(id);
  if (existing) {
    existing.x = x;
    existing.z = z;
  } else {
    npcPositions.set(id, { x, z });
  }
}

export interface LootItem {
  id: string;
  name: string;
  type: 'coin' | 'material' | 'equipment';
  x: number;
  y: number;
  z: number;
  amount: number;
  color: string;
}

export interface DamageNumber {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  createdAt: number;
}

export interface HitSpark {
  id: string;
  x: number;
  y: number;
  z: number;
  color: string;
  createdAt: number;
}

export interface SlashParticle {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  createdAt: number;
  lifetime: number;
}

export interface Notification {
  id: string;
  text: string;
  createdAt: number;
}

interface GameState {
  player: {
    health: number;
    maxHealth: number;
    stamina: number;
    maxStamina: number;
    position: [number, number, number];
    gold: number;
    exp: number;
    maxExp: number;
    level: number;
    inventory: InventoryState;
    /** Current combat archetype (transient — Fighter/Mage). Ownership of an
     *  item does not imply usability; see lib/archetype. */
    archetype: Archetype;
    invincible: boolean;
    isDodging: boolean;
    isAttacking: boolean;
    comboStage: number;
    comboConfirmed: boolean;
    attackCooldown: boolean;
    slowFactor?: number;
    lastDamageTime: number;
    lastStaminaTime: number;
    lastCombatTime: number;
    inCombat: boolean;
    checkpointPos: [number, number, number];
    itemCooldownUntil: number;
    /** Authoritative per-item progression (weapons + Cores). Persisted. */
    itemProgression: ItemProgressionMap;
    /** Authoritative stat block. Persisted. */
    stats: PlayerStats;
    /** Four-piece armour system: independent per-slot equipped items.
     *  `equippedArmour` remains the aggregate damage-reduction reference for
     *  legacy code (first occupied slot) during migration. */
    equippedArmourSlots: Record<ArmourSlot, string | null>;
    /** Legacy single armour field — kept in sync as the first occupied slot.
     *  Damage reduction is computed from all four slots at the funnel. */
    equippedArmour: string | null;
  };
  quests: Quest[];
  completedQuestIds: string[];
  encounterDefeats: string[];
  npcMemory: Record<string, 'met' | 'accepted' | 'completed'>;
  activeDialogue: {
    npcId: string;
    npcName: string;
    npcRole: string;
    npcType: NpcType;
    pages: string[];
    currentPage: number;
    questToOffer?: Quest;
    questToTurnIn?: Quest;
    choices?: DialogueChoice[];
  } | null;
  boss: {
    name: string;
    health: number;
    maxHealth: number;
    active: boolean;
  } | null;
  /** Arena progression: kills accumulate within the current wave; every
   *  ARENA_KILLS_PER_LEVEL kills raises the arena level exactly once. */
  arena: {
    level: number;
    killsInCurrentLevel: number;
  };
  damageNumbers: DamageNumber[];
  hitSparks: HitSpark[];
  slashParticles: SlashParticle[];
  cameraShakeRequest: { intensity: number; id: number } | null;
  hitStopMsRequest: { durationMs: number; id: number } | null;
  damageVignetteRequest: { intensity: number; id: number } | null;
  lootDrops: LootItem[];
  notifications: Notification[];
  settings: {
    resolution: string;
    fps: number;
    shadows: boolean;
    cameraMode: 'third' | 'second' | 'first';
    cameraSensitivity: number;
    debugMode: boolean;
    /** F-Mode: shows a draggable F1–F12 strip at the top of the screen. Not
     *  part of Custom HUD. Persisted with the other settings; the save schema
     *  version is not bumped (a missing field defaults to false). */
    fMode: boolean;
    language: 'en' | 'id';
  };
  hudLayout: HudLayout;
  hudEditMode: boolean;
  /** Manual skill HUD configuration (C3): per-item skill entries the SkillBar
   *  renders. Gameplay routing remains authoritative in Player.tsx. */
  skillHudConfig: SkillHudConfig;
  setSkillHudEntry: (itemId: string, index: number, entry: SkillHudEntry) => void;
  addSkillHudEntry: (itemId: string) => void;
  removeSkillHudEntry: (itemId: string, index: number) => void;
  resetSkillHudConfig: (itemId?: string) => void;
  gamePhase: 'loading' | 'menu' | 'playing';
  /** House interior transition (M1W2D5 C3). When true, the exterior world is
   *  replaced by the (much smaller) interior space. Interiors render one at a
   *  time to keep simultaneous geometry low for low-spec hardware. */
  houseInterior: string | null;
  /** P1.5 — world mode of the active world (story/sandbox/multiplayer/
   *  ranked/trial). Determined at New Game; restored with the save. */
  worldMode: WorldMode;
  enterHouseInterior: (interiorId: string) => void;
  exitHouseInterior: () => void;
  saveSlots: SaveSlotSummary[];
  activeSlot: SaveSlotId;
  ui: {
    showSettings: boolean;
    showQuestLog: boolean;
    showInventory: boolean;
    /** Expanded map overlay open (transient — never persisted). */
    mapOpen: boolean;
    interactPrompt: string | null;
    nearestNpcId: string | null;
    nearestCheckpointPos: [number, number, number] | null;
    deathOverlay: boolean;
    showShop: boolean;
    shopNpcId: string | null;
  };
  hotbar: {
    slots: (string | null)[];
    selectedSlot: number;
    equippedShield: string | null;
  };
  /** M1887 ammo (gun category). Transient per session, refilled on load. */
  gunAmmo: number;
  /** Crossbow arrows (M1W2D6 #5). One authoritative ammo count shared by
   *  basic fire and both crossbow skills. Transient per session. */
  crossbowAmmo: number;
  /** Transient skill feedback for the HUD: cooldowns keyed by skill id, plus
   *  the id of the most recently fired skill (for flash feedback). Written by
   *  Player.tsx at gameplay cadence; UI derives from it — never duplicates it. */
  skillState: {
    cooldowns: Record<string, number>;
    lastFired: { id: string; at: number } | null;
  };
  cheat: {
    active: boolean;
    godMode: boolean;
    /** Fly mode: gravity-free movement (jump ascend / sprint descend). */
    fly: boolean;
    /** Noclip: player collider disabled so the body passes through geometry. */
    noclip: boolean;
    /** Chat/command console UI state; transient, never written to saves. */
    chatOpen: boolean;
  };
  chat: {
    entries: ChatLogEntry[];
  };
  inputs: {
    jump: boolean;
    attack: boolean;
    dodge: boolean;
    sprint: boolean;
    skill1: boolean;
    skill2: boolean;
    skill3: boolean;
    skill4: boolean;
    skill5: boolean;
    joystick: { x: number; y: number };
    cameraAngle: number;
    cameraPitch: number;
  };
  debug: {
    nearestNpcName: string;
    currentDistance: number;
    isNear: boolean;
    ePressedCount: number;
    lastEPressedTime: string;
    openDialogueCalledCount: number;
    lastOpenDialogueTime: string;
    activeDialogueNotNull: boolean;
    dialogueModalMounted: boolean;
  };
  updateDebug: (data: Partial<GameState['debug']>) => void;
  setPlayerHealth: (health: number) => void;
  damagePlayer: (amount: number) => boolean; // returns true if hit was taken
  applyPlayerSlow: (durationMs: number, slowFactor?: number) => void;
  setPlayerStamina: (stamina: number) => void;
  setPlayerPosition: (pos: [number, number, number]) => void;
  setPlayerInvincible: (invincible: boolean) => void;
  triggerPlayerDodge: () => boolean; // returns true if dodge started
  triggerPlayerAttack: () => number; // returns combo stage (1,2,3) if attack started, 0 if blocked
  confirmComboHit: () => void; // advances combo display only on confirmed hit
  setSettings: (settings: Partial<GameState['settings']>) => void;
  setHudLayout: (layout: Partial<HudLayout>) => void;
  setHudElement: (id: HudElementId, config: Partial<HudElementConfig>) => void;
  resetHudElement: (id: HudElementId) => void;
  resetHudLayout: () => void;
  setHudEditMode: (enabled: boolean) => void;
  setGamePhase: (phase: 'loading' | 'menu' | 'playing') => void;
  refreshSaveSlots: () => void;
  /** Dynamic save-state list: create a new empty save state (unbounded).
   *  Returns the new state's id. */
  createSaveState: () => SaveSlotId;
  startNewGame: (slotId?: SaveSlotId, worldMode?: WorldMode) => boolean;
  continueGame: (slotId?: SaveSlotId) => boolean;
  returnToMenu: () => void;
  setShowSettings: (show: boolean) => void;
  setMapOpen: (open: boolean) => void;
  setShowQuestLog: (show: boolean) => void;
  setShowInventory: (show: boolean) => void;
  setInventory: (inv: InventoryState) => void;
  setInputs: (inputs: Partial<GameState['inputs']>) => void;
  setHotbarSlot: (index: number, itemId: string | null) => void;
  /** Equip a weapon from inventory into the hotbar if the current archetype
   *  can use it. Returns false (with a notification) on an unusable item. */
  equipWeapon: (itemId: string) => boolean;
  /** Switch the combat archetype via NPC class selection. Deactivates
   *  incompatible equipment and is enforced by gameplay, not just UI. */
  chooseArchetype: (archetype: Archetype) => void;
  setCheatConsoleOpen: (open: boolean) => void;
  setSelectedHotbarSlot: (index: number) => void;
  setEquippedShield: (itemId: string | null) => void;
  useHotbarSlot: (index: number) => boolean;
  toggleGodMode: () => void;
  grantGold: (amount: number) => void;
  grantItem: (itemId: string, count?: number) => boolean;
  grantExp: (amount: number) => void;
  teleportToArena: () => void;
  teleportToForge: () => void;
  setChatOpen: (open: boolean) => void;
  pushChat: (text: string, kind: ChatLogEntry['kind']) => void;
  /** Developer command console. Single entry point for /cheat and /give.
   *  Fails closed: unknown/malformed commands return a chat error only. */
  runCommand: (raw: string) => void;
  addDamageNumber: (x: number, y: number, z: number, text: string, color?: string) => void;
  removeDamageNumber: (id: string) => void;
  addHitSpark: (x: number, y: number, z: number, color?: string) => void;
  removeHitSpark: (id: string) => void;
  addSlashParticles: (x: number, y: number, z: number, dirX: number, dirZ: number, color?: string) => void;
  removeSlashParticle: (id: string) => void;
  triggerCameraShake: (intensity: number) => void;
  triggerHitStop: (durationMs?: number) => void;
  triggerDamageVignette: (intensity?: number) => void;
  addLootDrop: (loot: Omit<LootItem, 'id'>) => void;
  collectLootDrop: (id: string) => void;
  addNotification: (text: string) => void;
  addExp: (amount: number) => void;
  openDialogueForNpc: (npcId: string) => void;
  advanceDialogue: () => void;
  closeDialogue: () => void;
  acceptQuest: (questId: string) => void;
  completeQuest: (questId: string) => void;
  onEnemyKilled: (enemyName: string, deathId?: string) => void;
  checkItemObjectives: () => void;
  checkLocationObjectives: (pos: [number, number, number]) => void;
  setBossState: (boss: GameState['boss']) => void;
  respawnPlayer: () => void;
  activateCheckpoint: (pos: [number, number, number]) => void;
  useConsumableItem: (requestedItemName?: string) => boolean;
  tickRegenerationAndCombat: (delta: number) => void;
  recordStaminaUse: () => void;
  /** Grant EXP to a specific weapon/Core item (per-item progression). */
  grantItemExpById: (itemId: string, amount: number) => void;
  getItemLevel: (itemId: string) => number;
  isItemSkillUnlocked: (itemId: string, skillIndex: number) => boolean;
  /** Transient skill HUD state (cooldowns/fired flash). */
  reportSkillCooldown: (skillId: string, secondsRemaining: number) => void;
  reportSkillFired: (skillId: string) => void;
  saveGame: () => void;
  loadGame: (slotId?: SaveSlotId) => boolean;
  purchaseShopItem: (itemId: string, price: number, quantity?: number) => boolean;
  deleteSaveSlot: (slotId: SaveSlotId) => boolean;
  grantExpReward: (amount: number) => void;
  openShop: (npcId: string) => void;
  closeShop: () => void;
}

// ── Dynamic save-state model (M1W2D6 #4) ─────────────────────────────
// The save list is an UNBOUNDED array of created save states (like a world
// list). It starts EMPTY; every "Create New State" appends one record with a
// unique persistent id. There is no slot-count ceiling in application logic —
// only the browser's physical storage quota bounds it (handled truthfully via
// writeSlotRecords' catch). Legacy fixed-3-slot containers are migrated:
// occupied legacy slots become State 1..3, trailing empty legacy slots are
// dropped.
type SaveSlotIndex = number; // 1-based creation ordinal (also the record key)
export type SaveSlotId = SaveSlotIndex;
const LEGACY_SLOT_COUNT = 3; // back-compat: pre-dynamic containers

export type SaveSlotStatus = 'empty' | 'occupied' | 'corrupted';

export interface SaveSlotSummary {
  id: SaveSlotId;
  /** Stable persistent identity — survives deletes of other states and is
   *  never derived from list position alone. */
  uid: string;
  status: SaveSlotStatus;
  savedAt: number | null;
  createdAt: number | null;
  worldMode: WorldMode | null;
  playerLevel: number | null;
}

interface PersistedSaveData {
  version: 1;
  /** Dynamic save-state identity (M1W2D6 #4). Unique per created state. */
  uid?: string;
  createdAt?: number;
  savedAt: number;
  player: {
    health: number;
    maxHealth: number;
    stamina: number;
    maxStamina: number;
    position: [number, number, number];
    gold: number;
    exp: number;
    maxExp: number;
    level: number;
    inventory: InventoryState;
    checkpointPos: [number, number, number];
    /** Four-piece armour (M1W2D6 #4). Optional for legacy saves. */
    equippedArmourSlots?: Record<ArmourSlot, string | null>;
  };
  quests: Quest[];
  completedQuestIds: string[];
  encounterDefeats: string[];
  npcMemory: Record<string, 'met' | 'accepted' | 'completed'>;
  /** World mode of this save (P1.5). Optional for backward compatibility
   *  with pre-existing saves — absent reads as 'story'. */
  worldMode?: WorldMode;
}

/** P1.5 — world-based save structure. Worlds are expandable entities rather
 *  than hard-coded save slots; the mode is recorded per save using the
 *  existing PersistedSaveData contract (optional field, schema-compatible). */
export type WorldMode = 'story' | 'sandbox' | 'multiplayer' | 'ranked' | 'trial';

/** Sandbox/Trial per current design behave as open world variants of the
 *  story world. Multiplayer/Ranked need external infrastructure before the
 *  world can launch — guarded here and in the menu. */
const PLAYABLE_WORLD_MODES: readonly WorldMode[] = ['story', 'sandbox', 'trial'];

/** Arena kills required per arena level (M1W2D5 C3). */
const ARENA_KILLS_PER_LEVEL = 3;

const LEGACY_SAVE_KEY = 'abyssion_save';
const SAVE_SLOTS_KEY = 'abyssion_save_slots';
const ACTIVE_SLOT_KEY = 'abyssion_active_slot';
const GLOBAL_CONFIG_KEY = 'abyssion_global_config';

/** Schema version written into every PersistedSaveData record and compared on
 *  read by loadGame. A mismatch warns once and the save still loads as-is. */
const SAVE_SCHEMA_VERSION = 1;
let versionMismatchWarned = false;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((component) => typeof component === 'number' && Number.isFinite(component));
}

function isSaveSlotId(value: unknown): value is SaveSlotId {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseStorageValue(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function readSlotRecords(): { records: unknown[]; validContainer: boolean } {
  const storage = getStorage();
  if (!storage) return { records: [], validContainer: true };

  const raw = storage.getItem(SAVE_SLOTS_KEY);
  // Dynamic model: the list starts EMPTY — zero created save states.
  if (raw === null) return { records: [], validContainer: true };

  const parsed = parseStorageValue(raw);
  if (Array.isArray(parsed)) {
    // Legacy fixed containers: trim trailing null (empty) records so the
    // dynamic list only contains created states. Occupied records keep
    // their 1-based ordinal as their stable identity.
    const records = [...parsed];
    while (records.length > 0 && records[records.length - 1] === null) records.pop();
    return { records, validContainer: true };
  }

  if (isRecord(parsed) && Array.isArray(parsed.slots)) {
    const records = [...parsed.slots];
    while (records.length > 0 && records[records.length - 1] === null) records.pop();
    return { records, validContainer: true };
  }

  return { records: [], validContainer: false };
}

function isPersistedSaveData(value: unknown): value is PersistedSaveData {
  if (!isRecord(value) || !isRecord(value.player)) return false;
  const player = value.player;
  return isVector3(player.position);
}

function getPersistedSaveData(value: unknown): PersistedSaveData | null {
  if (!isRecord(value)) return null;
  const candidate = isRecord(value.progress) ? value.progress : value;
  if (!isPersistedSaveData(candidate)) return null;
  // Read contract for PersistedSaveData.version (written by saveGame and the
  // legacy migration above): a record from another schema version still loads
  // non-destructively — the mismatch is surfaced once instead of being
  // silently ignored. Valid saves are never rejected.
  if ((candidate.version as number) !== SAVE_SCHEMA_VERSION && !versionMismatchWarned) {
    versionMismatchWarned = true;
    console.warn(
      `[save] schema version ${String(candidate.version)} differs from ${SAVE_SCHEMA_VERSION}; loading existing save data as-is.`,
    );
  }
  return candidate;
}

function getSaveSlotSummaries(
  records: unknown[],
  validContainer = true,
): SaveSlotSummary[] {
  return records.map((record, index) => {
    const id = (index + 1) as SaveSlotId;
    // Stable identity: explicit uid if the record has one (dynamic saves),
    // else a deterministic id derived from the creation ordinal (legacy
    // migrated saves). Deleting one state never renames another.
    const uid = isRecord(record) && typeof record.uid === 'string'
      ? record.uid
      : `state-${id}`;
    const createdAt = isRecord(record) && typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
      ? record.createdAt : null;
    const mode = isRecord(record) && typeof record.worldMode === 'string'
      ? (record.worldMode as WorldMode) : null;
    if (!validContainer || record === undefined) {
      return { id, uid, status: 'corrupted' as const, savedAt: null, createdAt, worldMode: mode, playerLevel: null };
    }
    if (record === null) {
      return { id, uid, status: 'empty' as const, savedAt: null, createdAt, worldMode: mode, playerLevel: null };
    }

    const parsed = getPersistedSaveData(record);
    if (!parsed) {
      return { id, uid, status: 'corrupted' as const, savedAt: null, createdAt, worldMode: mode, playerLevel: null };
    }

    return {
      id,
      uid,
      status: 'occupied' as const,
      savedAt: typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
        ? parsed.savedAt
        : null,
      createdAt,
      worldMode: mode,
      playerLevel: typeof parsed.player.level === 'number' && Number.isFinite(parsed.player.level)
        ? parsed.player.level
        : null,
    };
  });
}

function readActiveSlot(): SaveSlotId {
  const raw = getStorage()?.getItem(ACTIVE_SLOT_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!isSaveSlotId(parsed)) return 1;
  // Clamp to the existing created states so a deleted state never leaves a
  // dangling active pointer.
  return Math.min(parsed, Math.max(1, readSlotRecords().records.length)) as SaveSlotId;
}

function persistActiveSlot(slotId: SaveSlotId) {
  getStorage()?.setItem(ACTIVE_SLOT_KEY, String(slotId));
}

function readGlobalConfig(): { settings?: UnknownRecord; hudLayout?: unknown; skillHudConfig?: unknown } {
  const parsed = parseStorageValue(getStorage()?.getItem(GLOBAL_CONFIG_KEY) ?? null);
  if (!isRecord(parsed)) return {};
  return {
    settings: isRecord(parsed.settings) ? parsed.settings : undefined,
    hudLayout: parsed.hudLayout,
    skillHudConfig: isRecord(parsed.skillHudConfig) ? (parsed.skillHudConfig as SkillHudConfig) : undefined,
  };
}

function writeGlobalConfig(settings: GameState['settings'], hudLayout: HudLayout, skillHudConfig: SkillHudConfig) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify({ settings, hudLayout, skillHudConfig }));
  } catch (error) {
    console.error('Failed to save global game configuration', error);
  }
}

function writeSlotRecords(records: unknown[]): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.setItem(SAVE_SLOTS_KEY, JSON.stringify(records));
    const verification = readSlotRecords();
    return verification.validContainer;
  } catch (error) {
    console.error('Failed to save game slots', error);
    return false;
  }
}

function migrateLegacySaveIfNeeded(): { records: unknown[]; validContainer: boolean } {
  const slots = readSlotRecords();
  const legacyRaw = getStorage()?.getItem(LEGACY_SAVE_KEY) ?? null;
  const legacyValue = parseStorageValue(legacyRaw);
  const legacySave = getPersistedSaveData(legacyValue);

  if (!legacySave || !slots.validContainer) return slots;

  const emptyIndex = slots.records.length; // dynamic model: append as a new state
  if (emptyIndex < 0) return slots;

  let legacyRecord: UnknownRecord | PersistedSaveData = legacySave;
  if (isRecord(legacyValue)) {
    const { settings: _settings, hudLayout: _hudLayout, ...legacyProgress } = legacyValue;
    legacyRecord = {
      ...legacyProgress,
      version: 1,
      savedAt: typeof legacyValue.savedAt === 'number' && Number.isFinite(legacyValue.savedAt)
        ? legacyValue.savedAt
        : Date.now(),
    };
  }

  const nextRecords = [...slots.records];
  nextRecords[emptyIndex] = legacyRecord;
  if (!writeSlotRecords(nextRecords)) return slots;

  const verification = readSlotRecords();
  if (!getPersistedSaveData(verification.records[emptyIndex])) return slots;

  const legacyConfig = isRecord(legacyValue)
    ? { settings: legacyValue.settings, hudLayout: legacyValue.hudLayout }
    : {};
  const existingConfig = readGlobalConfig();
  const legacySettings = isRecord(legacyConfig.settings) ? legacyConfig.settings : null;
  const legacyHudLayout = legacyConfig.hudLayout;
  if (
    (!existingConfig.settings && legacySettings)
    || (existingConfig.hudLayout === undefined && legacyHudLayout !== undefined)
  ) {
    const defaultSettings: GameState['settings'] = {
      resolution: '1080p',
      fps: 60,
      shadows: true,
      cameraMode: 'third',
      cameraSensitivity: 1.0,
      debugMode: false,
      fMode: false,
      language: 'en',
    };
    writeGlobalConfig(
      (existingConfig.settings ?? legacySettings ?? defaultSettings) as GameState['settings'],
      existingConfig.hudLayout === undefined
        ? migrateHudLayout(legacyHudLayout)
        : migrateHudLayout(existingConfig.hudLayout),
      {},
    );
  }

  // Retire the old representation only after the new slot was written and verified.
  getStorage()?.removeItem(LEGACY_SAVE_KEY);
  return verification;
}

function inspectPersistence() {
  const slots = migrateLegacySaveIfNeeded();
  const globalConfig = readGlobalConfig();
  return {
    ...slots,
    summaries: getSaveSlotSummaries(slots.records, slots.validContainer),
    activeSlot: readActiveSlot(),
    globalConfig,
  };
}

const initialPersistence = inspectPersistence();

function createStarterInventory(): InventoryState {
  let inv = createInventory();
  inv = addItem(inv, 'wooden_sword', 1).inv;
  inv = addItem(inv, 'water_staff', 1).inv;
  inv = addItem(inv, 'dual_dagger', 1).inv;
  inv = addItem(inv, 'health_potion', 3).inv;
  inv = addItem(inv, 'apple', 2).inv;
  inv = addItem(inv, 'm1887', 1).inv;
  inv = addItem(inv, 'crossbow', 1).inv;
  inv = addItem(inv, 'resonance_core', 1).inv;
  inv = addItem(inv, 'leather_armour', 1).inv;
  // Four-piece armour set (M1W2D6 #5): each slot has its own item.
  inv = addItem(inv, 'iron_helmet', 1).inv;
  inv = addItem(inv, 'iron_leggings', 1).inv;
  inv = addItem(inv, 'iron_boots', 1).inv;
  return inv;
}

// Tracks the active i-frame timeout so a dodge can cancel a stale damage
// i-frame timer — otherwise the damage timeout fires mid-dodge and clears
// invincibility while the dodge i-frame should still be active.
let iframeTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Tracks the pending respawn callback so it can be cancelled if the player
// returns to the menu or starts a new game during the death overlay.
let respawnTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Tracks the pending slow effect timeout so it can be cancelled on state
// transitions (load, new game, return to menu).
let slowTimeoutId: ReturnType<typeof setTimeout> | null = null;

// ── Basic enemy reward foundation (deterministic, exactly-once) ──
// One registered material item per confirmed lethal enemy transition. No
// randomness, no loot tables: a small fixed mapping from enemy name to a
// registered item id, granted through the existing addItem stacking path.
// `rewardedEnemyDeaths` guards against duplicate death callbacks for the
// same enemy instance (cleared on New Game / Load / return-to-menu).
const ENEMY_KILL_REWARDS: Record<string, { itemId: string; count: number }> = {
  'Slime': { itemId: 'apple', count: 1 },
  'Wolf': { itemId: 'bread', count: 1 },
  'Bandit': { itemId: 'iron_ore', count: 1 },
  'Mage': { itemId: 'arcane_shard', count: 1 },
};
const rewardedEnemyDeaths = new Set<string>();

/** Clear the exactly-once reward guard (New Game / Load / menu boundaries). */
export function clearRewardedEnemyDeaths(): void {
  rewardedEnemyDeaths.clear();
}

/**
 * Safe numeric extraction from arbitrary persisted data.
 * Returns `fallback` if the value is not a finite number.
 */
function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const useGameStore = create<GameState>((set, get) => ({
  player: {
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    archetype: 'fighter',
    position: [0, 1, 0],
    gold: 50,
    exp: 0,
    maxExp: 100,
    level: 1,
    inventory: createStarterInventory(),
    itemProgression: {},
    stats: createPlayerStats(),
    equippedArmourSlots: { helmet: null, chest: null, leggings: null, boots: null },
    equippedArmour: null,
    invincible: false,
    isDodging: false,
    isAttacking: false,
    comboStage: 0,
    comboConfirmed: false,
    attackCooldown: false,
    slowFactor: 1.0,
    lastDamageTime: 0,
    lastStaminaTime: 0,
    lastCombatTime: 0,
    inCombat: false,
    checkpointPos: [0, 1, 0],
    itemCooldownUntil: 0,
  },
  quests: INITIAL_QUESTS,
  completedQuestIds: [],
  encounterDefeats: [],
  npcMemory: {},
  activeDialogue: null,
  boss: null,
  arena: { level: 1, killsInCurrentLevel: 0 },
  damageNumbers: [],
  hitSparks: [],
  slashParticles: [],
  cameraShakeRequest: null,
  hitStopMsRequest: null,
  damageVignetteRequest: null,
  lootDrops: [],
  notifications: [],    settings: {
    resolution: '1080p',
    fps: 60,
    shadows: true,
    cameraMode: 'third',
    cameraSensitivity: 1.0,
    debugMode: false,
    fMode: false,
    language: 'en',
    ...initialPersistence.globalConfig.settings,
  },
  hudLayout: initialPersistence.globalConfig.hudLayout === undefined
    ? { ...DEFAULT_HUD_LAYOUT }
    : migrateHudLayout(initialPersistence.globalConfig.hudLayout),
  hudEditMode: false,
  skillHudConfig: (initialPersistence.globalConfig.skillHudConfig ?? {}) as SkillHudConfig,
  houseInterior: null,
  worldMode: 'story',
  enterHouseInterior: (interiorId) => set({ houseInterior: interiorId }),
  exitHouseInterior: () => set({ houseInterior: null }),
  gamePhase: 'loading',
  saveSlots: initialPersistence.summaries,
  activeSlot: initialPersistence.activeSlot,
  hotbar: {
    slots: Array(7).fill(null),
    selectedSlot: 0,
    equippedShield: null,
  },
  gunAmmo: 2,
  crossbowAmmo: 16,
  skillState: { cooldowns: {}, lastFired: null },
  cheat: {
    active: false,
    godMode: false,
    fly: false,
    noclip: false,
    chatOpen: false,
  },
  chat: {
    entries: [],
  },
  ui: {
    showSettings: false,
    showQuestLog: false,
    showInventory: false,
    mapOpen: false,
    interactPrompt: null,
    nearestNpcId: null,
    
    nearestCheckpointPos: null,
    deathOverlay: false,
    showShop: false,
    shopNpcId: null,
  },
  inputs: {
    jump: false,
    attack: false,
    dodge: false,
    sprint: false,
    skill1: false,
    skill2: false,
    skill3: false,
    skill4: false,
    skill5: false,
    joystick: { x: 0, y: 0 },
    cameraAngle: 0,
    cameraPitch: 0,
  },
  debug: {
    nearestNpcName: 'None',
    currentDistance: 999,
    isNear: false,
    ePressedCount: 0,
    lastEPressedTime: 'Never',
    openDialogueCalledCount: 0,
    lastOpenDialogueTime: 'Never',
    activeDialogueNotNull: false,
    dialogueModalMounted: false,
  },

  updateDebug: (data) =>
    set((state) => ({
      debug: { ...state.debug, ...data },
    })),

  setPlayerHealth: (health) => set((state) => ({ player: { ...state.player, health: Math.max(0, Math.min(state.player.maxHealth, health)) } })),
  
  damagePlayer: (amount) => {
    const { player, ui, cheat } = get();
    // God Mode is enforced at the authoritative damage funnel — the single
    // point every enemy hit passes through — so the cheat cannot be bypassed
    // by any damage source.
    if (cheat.godMode || player.invincible || player.isDodging || ui.deathOverlay || player.health <= 0) return false;

    // Armour mitigation: the four-piece armour system reduces damage once,
    // at this authoritative funnel, by summing each equipped piece's own
    // damageReduction. (Back-compat: the legacy single equippedArmour slot is
    // mirrored into equippedArmourSlots on load/equip.)
    let effective = amount;
    const slotsMap = player.equippedArmourSlots;
    const equippedIds = slotsMap
      ? [slotsMap.helmet, slotsMap.chest, slotsMap.leggings, slotsMap.boots]
      : (player.equippedArmour ? [player.equippedArmour] : []);
    for (const id of equippedIds) {
      if (!id) continue;
      const armourDef = getItem(id);
      const reduction = typeof armourDef?.metadata?.damageReduction === 'number'
        ? armourDef.metadata.damageReduction : 0;
      effective *= 1 - reduction;
    }
    const finalDamage = Math.max(1, Math.round(effective));
    const newHealth = Math.max(0, player.health - finalDamage);
    const now = Date.now();
    set((state) => ({
      player: {
        ...state.player,
        health: newHealth,
        invincible: true,
        lastDamageTime: now,
        lastCombatTime: now,
        inCombat: true,
      }
    }));

    // Grant i-frames matching dodge i-frame window
    if (iframeTimeoutId) clearTimeout(iframeTimeoutId);
    iframeTimeoutId = setTimeout(() => {
      iframeTimeoutId = null;
      set((state) => ({ player: { ...state.player, invincible: false } }));
    }, COMBAT_CONFIG.dodgeIframeMs);

    // Spawn damage number over player
    const pos = player.position;
    get().addDamageNumber(pos[0], pos[1] + 1.8, pos[2], `-${finalDamage}`, '#ef4444');
    get().triggerCameraShake(COMBAT_CONFIG.damageCameraImpulse);
    get().triggerDamageVignette(COMBAT_CONFIG.damageVignetteIntensity);

    // Handle Death
    if (newHealth <= 0) {
      set((state) => ({ ui: { ...state.ui, deathOverlay: true } }));
      // Cancel any pending respawn before scheduling a new one
      if (respawnTimeoutId) clearTimeout(respawnTimeoutId);
      respawnTimeoutId = setTimeout(() => {
        respawnTimeoutId = null;
        get().respawnPlayer();
      }, 2000);
    }

    return true;
  },

  recordStaminaUse: () => {
    const now = Date.now();
    set((state) => {
      // Guard: called every frame while sprinting; when stamina regen has
      // already bumped lastStaminaTime past `now` within the same frame,
      // skipping the write avoids a redundant player-object allocation and
      // re-render of stamina subscribers.
      if (state.player.lastStaminaTime === now) return {};
      return { player: { ...state.player, lastStaminaTime: now } };
    });
  },

  applyPlayerSlow: (durationMs: number, slowFactor = 0.5) => {
    set((state) => ({ player: { ...state.player, slowFactor } }));
    if (slowTimeoutId) clearTimeout(slowTimeoutId);
    slowTimeoutId = setTimeout(() => {
      slowTimeoutId = null;
      set((state) => ({ player: { ...state.player, slowFactor: 1.0 } }));
    }, durationMs);
  },

  setPlayerStamina: (stamina) => set((state) => {
    const next = Math.max(0, Math.min(state.player.maxStamina, stamina));
    // Hot-path guard: called every frame while sprinting. Same-value writes
    // (e.g. clamped at max) must not allocate a new player object.
    if (next === state.player.stamina) return {};
    return { player: { ...state.player, stamina: next } };
  }),
  
  setPlayerPosition: (position) => {
    const prev = get().player.position;
    if (prev[0] === position[0] && prev[1] === position[1] && prev[2] === position[2]) return;
    // Copy-on-write: the player component passes a reusable mutable tuple.
    // Storing that reference aliased the store position to the live tuple, so
    // this value-equality check compared the array against itself and every
    // update after the first was skipped — freezing player.position (and
    // NPC proximity detection with it) near the spawn point.
    set((state) => ({
      player: { ...state.player, position: [position[0], position[1], position[2]] as [number, number, number] },
    }));
  },
  
  setPlayerInvincible: (invincible) => set((state) => ({ player: { ...state.player, invincible } })),

  triggerPlayerDodge: () => {
    const { player } = get();
    if (player.isDodging || player.stamina < COMBAT_CONFIG.dodgeStaminaCost) return false;

    const now = Date.now();
    set((state) => ({
      player: {
        ...state.player,
        stamina: state.player.stamina - COMBAT_CONFIG.dodgeStaminaCost,
        isDodging: true,
        invincible: true,
        lastStaminaTime: now,
      }
    }));

    // End dodge roll state after dodge duration
    setTimeout(() => {
      set((state) => ({ player: { ...state.player, isDodging: false } }));
    }, COMBAT_CONFIG.dodgeDurationMs);

    // I-frames extend slightly beyond the dodge roll. Cancel any stale damage
    // i-frame timeout so it can't clear invincibility during the dodge window.
    if (iframeTimeoutId) clearTimeout(iframeTimeoutId);
    iframeTimeoutId = setTimeout(() => {
      iframeTimeoutId = null;
      set((state) => ({ player: { ...state.player, invincible: false } }));
    }, COMBAT_CONFIG.dodgeIframeMs);

    return true;
  },

  triggerPlayerAttack: () => {
    const { player } = get();
    if (player.attackCooldown) return 0;

    // A later combo stage is earned only by a confirmed hit. If the previous
    // swing missed, the next attack starts a fresh stage-1 swing instead of
    // incorrectly advancing through the combo.
    let nextCombo = player.comboConfirmed ? (player.comboStage % 3) + 1 : 1;
    set((state) => ({
      player: {
        ...state.player,
        isAttacking: true,
        comboStage: nextCombo,
        comboConfirmed: false,
        attackCooldown: true,
      }
    }));

    // Reset attacking state and set cooldown
    setTimeout(() => {
      set((state) => ({ player: { ...state.player, isAttacking: false } }));
    }, COMBAT_CONFIG.attackActiveMs);

    setTimeout(() => {
      set((state) => ({ player: { ...state.player, attackCooldown: false } }));
    }, COMBAT_CONFIG.attackCooldownMs);

    // Reset combo if no attack within combo reset window. If the hit was
    // never confirmed (missed), reset comboStage to 0 so the counter hides.
    setTimeout(() => {
      const current = get().player;
      if (!current.isAttacking && current.comboStage === nextCombo) {
        set((state) => ({ player: { ...state.player, comboStage: 0, comboConfirmed: false } }));
      }
    }, COMBAT_CONFIG.comboResetMs);

    return nextCombo;
  },

  confirmComboHit: () => {
    const { player } = get();
    if (player.comboStage > 0 && !player.comboConfirmed) {
      const now = Date.now();
      set((state) => ({ player: { ...state.player, comboConfirmed: true, lastCombatTime: now, inCombat: true } }));
    }
  },

  tickRegenerationAndCombat: (delta: number) => {
    const { player } = get();
    const now = Date.now();
    let updatedHealth = player.health;
    let updatedStamina = player.stamina;
    let inCombat = player.inCombat;

    // 1. Passive Health Regen: Starts after 5s without taking damage -> +5 HP/s
    if (now - player.lastDamageTime >= 5000 && updatedHealth < player.maxHealth && updatedHealth > 0) {
      updatedHealth = Math.min(player.maxHealth, updatedHealth + 5 * delta);
    }

    // 2. Passive Stamina Regen: Starts after 0.75s without consuming stamina -> +25 Stamina/s
    if (now - player.lastStaminaTime >= 750 && updatedStamina < player.maxStamina) {
      updatedStamina = Math.min(player.maxStamina, updatedStamina + 25 * delta);
    }

    // 3. Combat Recovery: Combat ends if no attacks or damage taken for 5 seconds
    if (inCombat && now - player.lastCombatTime >= 5000) {
      inCombat = false;
      const hpGain = Math.round(player.maxHealth * 0.05); // +5% Max HP
      const stamGain = Math.round(player.maxStamina * 0.3); // +30% Max Stamina
      updatedHealth = Math.min(player.maxHealth, updatedHealth + hpGain);
      updatedStamina = Math.min(player.maxStamina, updatedStamina + stamGain);
      get().addNotification(t('notify.combatEnded', get().settings.language as Lang));
    }

    // Skip the store update entirely when nothing changed — avoids creating
    // a new player object 60×/sec and triggering unnecessary React re-renders.
    if (
      updatedHealth === player.health &&
      updatedStamina === player.stamina &&
      inCombat === player.inCombat
    ) {
      return;
    }

    set((state) => ({
      player: {
        ...state.player,
        health: updatedHealth,
        stamina: updatedStamina,
        inCombat,
      }
    }));
  },

  useConsumableItem: (requestedItemName) => {
    const { player } = get();
    const now = Date.now();

    if (now < player.itemCooldownUntil) {
      const remainingSec = Math.ceil((player.itemCooldownUntil - now) / 1000);
      get().addNotification(t('notify.healCooldown', get().settings.language as Lang, { seconds: remainingSec }));
      return false;
    }

    const priorityIds = ['health_potion', 'small_potion', 'bread', 'apple', 'beef_steak', 'chicken_katsu', 'chicken_steak', 'crispy_chicken', 'shawarma', 'kebab'];
    let targetId: string | undefined;

    if (requestedItemName) {
      targetId = getItemIdByName(requestedItemName);
    } else {
      for (const id of priorityIds) {
        if (getItemCount(player.      inventory, id) > 0) {
          targetId = id;
          break;
        }
      }
    }

    if (!targetId) {
      get().addNotification(t('notify.noHealItems', get().settings.language as Lang));
      return false;
    }

    if (getItemCount(player.      inventory, targetId) <= 0) {
      const def = getItem(targetId);
      get().addNotification(`No ${def?.name ?? 'item'} left!`);
      return false;
    }

    if (player.health >= player.maxHealth) {
      get().addNotification(t('notify.healthFull', get().settings.language as Lang));
      return false;
    }

    const def = getItem(targetId);
    const healAmount = (def?.metadata?.healAmount as number) ?? 25;
    const newHealth = Math.min(player.maxHealth, player.health + healAmount);

    const { inv: updatedInv } = removeItem(player.      inventory, targetId, 1);

    set((state) => ({
      player: {
        ...state.player,
        health: newHealth,
        inventory: updatedInv,
        itemCooldownUntil: now + 10000,
      }
    }));
    get().addNotification(t('notify.usedItem', get().settings.language as Lang, { name: def?.name ?? 'Item', amount: healAmount }));
    const pos = player.position;
    get().addDamageNumber(pos[0], pos[1] + 2.0, pos[2], `+${healAmount} HP`, '#22c55e');

    return true;
  },

  activateCheckpoint: (checkpointPos) => {
    set((state) => ({
      player: {
        ...state.player,
        health: state.player.maxHealth,
        stamina: state.player.maxStamina,
        checkpointPos,
      }
    }));
    get().addNotification(t('notify.checkpoint', get().settings.language as Lang));
    get().saveGame();
  },

  setSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
  setHudLayout: (partial) => set((state) => ({ hudLayout: { ...state.hudLayout, ...partial } })),
  setHudElement: (id, config) => set((state) => ({
    hudLayout: { ...state.hudLayout, [id]: { ...state.hudLayout[id], ...config } },
  })),
  resetHudElement: (id) => set((state) => ({
    hudLayout: { ...state.hudLayout, [id]: { ...DEFAULT_HUD_LAYOUT[id] } },
  })),
  resetHudLayout: () => set({ hudLayout: { ...DEFAULT_HUD_LAYOUT } }),
  setSkillHudEntry: (itemId, index, entry) => set((state) => {
    const list = [...(state.skillHudConfig[itemId] ?? [])];
    list[index] = entry;
    return { skillHudConfig: { ...state.skillHudConfig, [itemId]: list } };
  }),
  addSkillHudEntry: (itemId) => set((state) => ({
    skillHudConfig: { ...state.skillHudConfig, [itemId]: [...(state.skillHudConfig[itemId] ?? []), { id: '', name: '', slot: 'Z' }] } as SkillHudConfig,
  })),
  removeSkillHudEntry: (itemId, index) => set((state) => ({
    skillHudConfig: { ...state.skillHudConfig, [itemId]: (state.skillHudConfig[itemId] ?? []).filter((_, i) => i !== index) },
  })),
  resetSkillHudConfig: (itemId) => set((state) => {
    if (itemId === undefined) return { skillHudConfig: {} as SkillHudConfig };
    const next = { ...state.skillHudConfig };
    delete next[itemId];
    return { skillHudConfig: next };
  }),
  setHudEditMode: (enabled) => set({ hudEditMode: enabled }),
  setGamePhase: (phase) => set({ gamePhase: phase }),
  refreshSaveSlots: () => {
    const persistence = inspectPersistence();
    const globalConfig = persistence.globalConfig;
    set((state) => ({
      saveSlots: persistence.summaries,
      activeSlot: persistence.activeSlot,
      settings: {
        ...state.settings,
        ...(globalConfig.settings ?? {}),
      },
      hudLayout: globalConfig.hudLayout === undefined
        ? state.hudLayout
        : migrateHudLayout(globalConfig.hudLayout),
    }));
  },
  // Dynamic save-state list: append a new empty state (unbounded).
  createSaveState: () => {
    const slots = readSlotRecords();
    // New states carry a unique persistent identity, independent of array
    // position: timestamp + random suffix.
    const uid = `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const record: UnknownRecord = {
      uid,
      createdAt: Date.now(),
      worldMode: null,
    };
    const nextRecords = [...slots.records, record];
    writeSlotRecords(nextRecords);
    const updated = readSlotRecords();
    const newId = updated.records.length as SaveSlotId;
    set({ saveSlots: getSaveSlotSummaries(updated.records, updated.validContainer) });
    return newId;
  },
  startNewGame: (requestedSlotId, worldMode?: WorldMode) => {
    clearRewardedEnemyDeaths();
    // P1.5: fail closed for modes whose world cannot launch yet.
    const effectiveMode: WorldMode = worldMode ?? 'story';
    if (!PLAYABLE_WORLD_MODES.includes(effectiveMode)) {
      get().addNotification(`${effectiveMode.toUpperCase()} world is not yet available.`);
      return false;
    }
    const { settings, hudLayout, saveSlots, activeSlot } = get();
    const slotId = requestedSlotId ?? activeSlot;
    const selectedSlot = saveSlots.find((slot) => slot.id === slotId);
    if (!selectedSlot || selectedSlot.status !== 'empty') return false;

    // Cancel any pending i-frame, respawn, or slow timers from a previous session
    if (iframeTimeoutId) {
      clearTimeout(iframeTimeoutId);
      iframeTimeoutId = null;
    }
    if (respawnTimeoutId) {
      clearTimeout(respawnTimeoutId);
      respawnTimeoutId = null;
    }
    if (slowTimeoutId) {
      clearTimeout(slowTimeoutId);
      slowTimeoutId = null;
    }

    persistActiveSlot(slotId);
    set({
      activeSlot: slotId,
      // A New Game is a fresh character. The hotbar is transient (never
      // persisted), so without an explicit reset the previous session's
      // equipped weapon stayed active in the new game — confirmed at runtime.
      hotbar: {
        slots: Array.from({ length: 7 }, () => null),
        selectedSlot: 0,
        equippedShield: null,
      },
      player: {
        health: 100,
        maxHealth: 100,
        stamina: 100,
        maxStamina: 100,
        position: [0, 1, 0],
        gold: 50,
        exp: 0,
        maxExp: 100,
        level: 1,
        inventory: createStarterInventory(),
        itemProgression: {},
        stats: createPlayerStats(),
        equippedArmourSlots: { helmet: null, chest: null, leggings: null, boots: null },
    equippedArmour: null,
        archetype: 'fighter',
        invincible: false,
        isDodging: false,
        isAttacking: false,
        comboStage: 0,
        comboConfirmed: false,
        attackCooldown: false,
        slowFactor: 1.0,
        lastDamageTime: 0,
        lastStaminaTime: 0,
        lastCombatTime: 0,
        inCombat: false,
        checkpointPos: [0, 1, 0],
        itemCooldownUntil: 0,
      },
      quests: INITIAL_QUESTS,
      completedQuestIds: [],
      encounterDefeats: [],
      npcMemory: {},
      activeDialogue: null,
      // Cheat effects are transient: a New Game starts cheat-free.
      cheat: { active: false, godMode: false, fly: false, noclip: false, chatOpen: false },
      // Transient skill HUD state and gun ammo are session state: a New Game
      // must not inherit the previous session's cooldown readouts or ammo
      // (loadGame already resets both — this was the one path that missed it).
      skillState: { cooldowns: {}, lastFired: null },
      gunAmmo: 2,
      crossbowAmmo: 16,
      // Live interaction telemetry is session-specific debug state: a New
      // Game must not report the previous session's nearest-NPC readings or
      // E-press counters.
      debug: {
        nearestNpcName: 'None',
        currentDistance: 999,
        isNear: false,
        ePressedCount: 0,
        lastEPressedTime: 'Never',
        openDialogueCalledCount: 0,
        lastOpenDialogueTime: 'Never',
        activeDialogueNotNull: false,
        dialogueModalMounted: false,
      },
      boss: null,
      arena: { level: 1, killsInCurrentLevel: 0 },
      // Floating combat text is transient VFX: a New Game must not inherit
      // the previous session's lingering damage/LEVEL UP numbers (the
      // continueGame path already clears them).
      damageNumbers: [],
      hitSparks: [],
      slashParticles: [],
      lootDrops: [],
      notifications: [],
      cameraShakeRequest: null,
      hitStopMsRequest: null,
      damageVignetteRequest: null,
      settings,
      hudLayout,
      hudEditMode: false,
      gamePhase: 'playing',
      houseInterior: null,
      // P1.5: the new world remembers its mode for this save.
      worldMode: effectiveMode,
      ui: {
        showSettings: false,
        showQuestLog: false,
        showInventory: false,
        mapOpen: false,
        interactPrompt: null,
        nearestNpcId: null,
    
        nearestCheckpointPos: null,
        deathOverlay: false,
        showShop: false,
        shopNpcId: null,
      },
      inputs: {
        jump: false,
        attack: false,
        dodge: false,
        sprint: false,
        skill1: false,
        skill2: false,
        skill3: false,
        skill4: false,
        skill5: false,
        joystick: { x: 0, y: 0 },
        cameraAngle: 0,
        cameraPitch: 0,
      },
    });
    get().saveGame();
    return true;
  },
  continueGame: (requestedSlotId) => {
    clearRewardedEnemyDeaths();
    const loaded = get().loadGame(requestedSlotId);
    if (!loaded) return false;
    set({
      gamePhase: 'playing',
      houseInterior: null,
      hudEditMode: false,
      activeDialogue: null,
      boss: null,
      arena: { level: 1, killsInCurrentLevel: 0 },
      damageNumbers: [],
      hitSparks: [],
      slashParticles: [],
      lootDrops: [],
      notifications: [],
      cameraShakeRequest: null,
      hitStopMsRequest: null,
      damageVignetteRequest: null,
      ui: {
        showSettings: false,
        showQuestLog: false,
        showInventory: false,
        mapOpen: false,
        interactPrompt: null,
        nearestNpcId: null,
    
        nearestCheckpointPos: null,
        deathOverlay: false,
        showShop: false,
        shopNpcId: null,
      },
      inputs: {
        jump: false,
        attack: false,
        dodge: false,
        sprint: false,
        skill1: false,
        skill2: false,
        skill3: false,
        skill4: false,
        skill5: false,
        joystick: { x: 0, y: 0 },
        cameraAngle: 0,
        cameraPitch: 0,
      },
    });
    return true;
  },
  returnToMenu: () => {
    clearRewardedEnemyDeaths();
    get().saveGame();
    // Cancel any pending i-frame, respawn, and slow timers so they can't
    // fire after leaving gameplay.
    if (iframeTimeoutId) {
      clearTimeout(iframeTimeoutId);
      iframeTimeoutId = null;
    }
    if (respawnTimeoutId) {
      clearTimeout(respawnTimeoutId);
      respawnTimeoutId = null;
    }
    if (slowTimeoutId) {
      clearTimeout(slowTimeoutId);
      slowTimeoutId = null;
    }
    set({
      gamePhase: 'menu',
      houseInterior: null,
      hudEditMode: false,
      activeDialogue: null,
      // Cheat effects are transient; the console closes on leaving gameplay.
      cheat: { active: false, godMode: false, fly: false, noclip: false, chatOpen: false },
      boss: null,
      arena: { level: 1, killsInCurrentLevel: 0 },
      hitSparks: [],
      slashParticles: [],
      lootDrops: [],
      notifications: [],
      cameraShakeRequest: null,
      hitStopMsRequest: null,
      damageVignetteRequest: null,
      inputs: {
        jump: false,
        attack: false,
        dodge: false,
        sprint: false,
        skill1: false,
        skill2: false,
        skill3: false,
        skill4: false,
        skill5: false,
        joystick: { x: 0, y: 0 },
        cameraAngle: 0,
        cameraPitch: 0,
      },
      ui: {
        showSettings: false,
        showQuestLog: false,
        showInventory: false,
        mapOpen: false,
        interactPrompt: null,
        nearestNpcId: null,
    
        nearestCheckpointPos: null,
        deathOverlay: false,
        showShop: false,
        shopNpcId: null,
      },
    });
  },
  setShowSettings: (show) => set((state) => ({ ui: { ...state.ui, showSettings: show } })),
  setMapOpen: (open) => set((state) => ({ ui: { ...state.ui, mapOpen: open } })),
  setInputs: (inputs) => set((state) => {
    const next = { ...state.inputs, ...inputs };
    // Shallow-equal guard: input writes happen at pointer-move frequency;
    // without this, every camera drag frame triggers a store update and
    // re-renders all input subscribers even when values are identical.
    for (const k of Object.keys(inputs) as (keyof typeof inputs)[]) {
      if (next[k] !== state.inputs[k]) {
        return { inputs: next };
      }
    }
    return {};
  }),

  addDamageNumber: (x, y, z, text, color = '#facc15') => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      damageNumbers: [...state.damageNumbers, { id, x, y, z, text, color, createdAt: Date.now() }]
    }));
    setTimeout(() => {
      get().removeDamageNumber(id);
    }, 800);
  },

  removeDamageNumber: (id) => {
    set((state) => ({
      damageNumbers: state.damageNumbers.filter(d => d.id !== id)
    }));
  },

  addHitSpark: (x, y, z, color = COMBAT_CONFIG.hitSparkColorNormal) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      hitSparks: [...state.hitSparks, { id, x, y, z, color, createdAt: Date.now() }]
    }));
    setTimeout(() => {
      get().removeHitSpark(id);
    }, COMBAT_CONFIG.hitSparkDurationMs);
  },

  removeHitSpark: (id) => {
    set((state) => ({
      hitSparks: state.hitSparks.filter(h => h.id !== id)
    }));
  },

  addSlashParticles: (x, y, z, dirX, dirZ, color = COMBAT_CONFIG.slashParticleColor) => {
    const newParticles: SlashParticle[] = [];
    for (let i = 0; i < COMBAT_CONFIG.slashParticleCount; i++) {
      const id = Math.random().toString(36).substring(2, 9) + '_' + i;
      const spread = (Math.random() - 0.5) * 1.5;
      const speed = COMBAT_CONFIG.slashParticleSpeed * (0.7 + Math.random() * 0.6);
      newParticles.push({
        id,
        x, y, z,
        vx: dirX * speed + spread,
        vy: 1.0 + Math.random() * 1.5,
        vz: dirZ * speed + spread,
        color,
        size: COMBAT_CONFIG.slashParticleSize,
        createdAt: Date.now(),
        lifetime: COMBAT_CONFIG.slashParticleLifetime,
      });
    }
    set((state) => ({
      slashParticles: [...state.slashParticles, ...newParticles]
    }));
    setTimeout(() => {
      set((state) => ({
        slashParticles: state.slashParticles.filter(p => !newParticles.some(np => np.id === p.id))
      }));
    }, COMBAT_CONFIG.slashParticleLifetime * 1000);
  },

  removeSlashParticle: (id) => {
    set((state) => ({
      slashParticles: state.slashParticles.filter(p => p.id !== id)
    }));
  },

  triggerCameraShake: (intensity) => {
    set({ cameraShakeRequest: { intensity, id: Date.now() + Math.random() } });
  },

  triggerHitStop: (durationMs = COMBAT_CONFIG.hitStopMs) => {
    set({ hitStopMsRequest: { durationMs, id: Date.now() + Math.random() } });
  },

  triggerDamageVignette: (intensity = COMBAT_CONFIG.damageVignetteIntensity) => {
    set({ damageVignetteRequest: { intensity, id: Date.now() + Math.random() } });
  },

  addLootDrop: (loot) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      lootDrops: [...state.lootDrops, { ...loot, id }]
    }));
  },

  collectLootDrop: (id) => {
    const { lootDrops, player } = get();
    const item = lootDrops.find(l => l.id === id);
    if (!item) return;

    if (item.type === 'coin') {
      set((state) => ({
        player: { ...state.player, gold: state.player.gold + item.amount },
        lootDrops: state.lootDrops.filter(l => l.id !== id)
      }));
      get().addNotification(`+${item.amount} Gold Coins`);
    } else {
      const itemId = getItemIdByName(item.name);
      // Arrow Bundle (M1W2D6 #5): restores up to 8 crossbow arrows, capped at
      // the crossbow capacity (16). The bundle disappears on collection — the
      // loot entry is removed either way, so it cannot be collected twice.
      if (itemId === 'arrow_bundle') {
        const restored = Math.min(8, 16 - get().crossbowAmmo);
        set((state) => ({
          crossbowAmmo: Math.min(16, state.crossbowAmmo + 8),
          lootDrops: state.lootDrops.filter(l => l.id !== id),
        }));
        get().addNotification(restored > 0 ? `+${restored} arrows` : 'Quiver already full');
        get().checkItemObjectives();
        return;
      }
      if (itemId) {
        const { inv: updatedInv, added } = addItem(player.inventory, itemId, item.amount);
        set((state) => ({
          player: { ...state.player, inventory: updatedInv },
          lootDrops: state.lootDrops.filter(l => l.id !== id)
        }));
        get().addNotification(`Picked up ${item.name} (x${added})`);
      } else {
        set((state) => ({
          lootDrops: state.lootDrops.filter(l => l.id !== id)
        }));
      }
    }
    get().checkItemObjectives();
  },

  setShowQuestLog: (show) => set((state) => ({ ui: { ...state.ui, showQuestLog: show } })),
  setShowInventory: (show) => set((state) => ({ ui: { ...state.ui, showInventory: show } })),
  setInventory: (inv) => set((state) => ({ player: { ...state.player, inventory: inv } })),

  addExp: (amount) => {
    const { player } = get();
    let exp = player.exp + amount;
    let maxExp = player.maxExp;
    let level = player.level;
    let health = player.health;
    let maxHealth = player.maxHealth;
    let stamina = player.stamina;
    let maxStamina = player.maxStamina;

    let leveledUp = false;
    while (exp >= maxExp) {
      exp -= maxExp;
      level += 1;
      maxExp = Math.round(maxExp * 1.5);
      maxHealth += 20;
      health = maxHealth;
      maxStamina += 10;
      stamina = maxStamina;
      leveledUp = true;
    }

    set((state) => ({
      player: {
        ...state.player,
        exp,
        maxExp,
        level,
        health,
        maxHealth,
        stamina,
        maxStamina,
      }
    }));

    if (leveledUp) {
      get().addNotification(t('notify.levelUp', get().settings.language as Lang, { level }));
      const pos = player.position;
      get().addDamageNumber(pos[0], pos[1] + 2.5, pos[2], `LEVEL UP ${level}!`, '#f59e0b');
    }
  },

  openDialogueForNpc: (npcId) => {
    const npc = NPCS_DATA.find((n) => n.id === npcId);
    if (!npc) return;

    const { quests, completedQuestIds, settings } = get();
    const lang = settings.language as Lang;
    const loc = npc.dialogue.localized?.[lang];

    // Helper: use localized version if available, otherwise default
    const localize = (
      key: 'greeting' | 'questInProgress' | 'questTurnIn' | 'questCompleted' | 'randomPool',
    ): string[] => (loc as any)?.[key] ?? npc.dialogue[key];

    let pages: string[] = [];
    let questToOffer: Quest | undefined = undefined;
    let questToTurnIn: Quest | undefined = undefined;

    if (npc.questId) {
      const quest = quests.find((q) => q.id === npc.questId);
      if (quest) {
        if (quest.status === 'unaccepted') {
          const prereqMet = !quest.prerequisiteQuestId || completedQuestIds.includes(quest.prerequisiteQuestId);
          if (prereqMet) {
            pages = loc?.questOffer?.dialogue ?? npc.dialogue.questOffer.dialogue;
            questToOffer = quest;
          } else {
            pages = [
              ...localize('greeting'),
              t('dialogue.questLocked', lang),
            ];
          }
        } else if (quest.status === 'active') {
          const allDone = quest.objectives.every((o) => o.currentAmount >= o.requiredAmount);
          if (allDone) {
            pages = localize('questTurnIn');
            questToTurnIn = quest;
          } else {
            pages = localize('questInProgress');
          }
        } else if (quest.status === 'ready_to_turn_in') {
          pages = localize('questTurnIn');
          questToTurnIn = quest;
        } else if (quest.status === 'completed') {
          pages = localize('questCompleted');
        }
      }
    }

    if (pages.length === 0) {
      pages = [...localize('greeting'), ...localize('randomPool')];
    }

    const effectiveChoices = !questToOffer && !questToTurnIn && npc.dialogue.choices
      ? ((loc as any)?.choices ?? npc.dialogue.choices)
      : undefined;

    const newDialogue = {
      npcId: npc.id,
      npcName: npc.name,
      npcRole: npc.role,
      npcType: npc.type,
      pages,
      currentPage: 0,
      questToOffer,
      questToTurnIn,
      choices: effectiveChoices,
    };

    const nowStr = new Date().toLocaleTimeString();
    set((state) => ({
      activeDialogue: newDialogue,
      // The interaction manager is suspended while a modal is open; clear the
      // live prompt here so the stale "Press E" text cannot persist on screen.
      ui: { ...state.ui, interactPrompt: null, nearestNpcId: null },
      npcMemory: { ...state.npcMemory, [npcId]: 'met' },
      debug: {
        ...state.debug,
        openDialogueCalledCount: state.debug.openDialogueCalledCount + 1,
        lastOpenDialogueTime: nowStr,
        activeDialogueNotNull: true,
      },
    }));
  },

  advanceDialogue: () => {
    const { activeDialogue } = get();
    if (!activeDialogue) return;
    if (activeDialogue.currentPage < activeDialogue.pages.length - 1) {
      set((state) => ({
        activeDialogue: state.activeDialogue
          ? { ...state.activeDialogue, currentPage: state.activeDialogue.currentPage + 1 }
          : null,
      }));
    }
  },

  closeDialogue: () => {
    set((state) => ({
      activeDialogue: null,
      debug: {
        ...state.debug,
        activeDialogueNotNull: false,
      },
    }));
  },

  acceptQuest: (questId) => {
    const { quests } = get();
    const quest = quests.find((q) => q.id === questId);
    if (!quest) return;

    const updatedQuests = quests.map((q) => (q.id === questId ? { ...q, status: 'active' as const } : q));

    set((state) => ({
      quests: updatedQuests,
      npcMemory: { ...state.npcMemory, [quest.giverNpcId]: 'accepted' },
      activeDialogue: state.activeDialogue
        ? {
            ...state.activeDialogue,
            pages: ['Quest Accepted! Good luck out there!'],
            currentPage: 0,
            questToOffer: undefined,
          }
        : null,
    }));

    get().addNotification(t('notify.questAccepted', get().settings.language as Lang, { title: quest.title }));
    get().checkItemObjectives();
  },

  completeQuest: (questId) => {
    const { quests, player, completedQuestIds } = get();
    const quest = quests.find((q) => q.id === questId);
    if (!quest || quest.status === 'completed') return;

    const updatedQuests = quests.map((q) => (q.id === questId ? { ...q, status: 'completed' as const } : q));

    let updatedGold = player.gold + quest.rewards.coins;
    let updatedInv = player.inventory;

    if (quest.rewards.items) {
      for (const rewardItem of quest.rewards.items) {
        const itemId = getItemIdByName(rewardItem.name);
        if (itemId) {
          const result = addItem(updatedInv, itemId, rewardItem.count);
          updatedInv = result.inv;
        }
      }
    }

    set((state) => ({
      quests: updatedQuests,
      completedQuestIds: [...state.completedQuestIds, questId],
      npcMemory: { ...state.npcMemory, [quest.giverNpcId]: 'completed' },
      player: {
        ...state.player,
        gold: updatedGold,
        inventory: updatedInv,
      },
      activeDialogue: null,
    }));

    get().addExp(quest.rewards.exp);
    get().addNotification(t('notify.questComplete', get().settings.language as Lang, { title: quest.title }));
    get().saveGame();
  },

  onEnemyKilled: (enemyName, deathId) => {
    // Exactly-once reward guard: BaseEnemy registers a stable per-instance id;
    // a duplicate death callback for the same instance never re-rewards.
    if (deathId !== undefined) {
      if (rewardedEnemyDeaths.has(deathId)) return;
      rewardedEnemyDeaths.add(deathId);
    }
    // Deterministic material reward through the existing inventory path.
    // Unregistered item ids are rejected by the registry lookup (fail-closed).
    const reward = ENEMY_KILL_REWARDS[enemyName];
    if (reward) {
      const def = getItem(reward.itemId);
      if (def) {
        const { inv, added } = addItem(get().player.inventory, reward.itemId, reward.count);
        if (added > 0) {
          set((state) => ({ player: { ...state.player, inventory: inv } }));
          get().addNotification(`🏆 ${enemyName} dropped ${added}x ${def.name}`);
        }
      }
    }

    const { quests } = get();
    let changed = false;

    const updatedQuests = quests.map((quest) => {
      if (quest.status !== 'active') return quest;

      let questUpdated = false;
      const updatedObjectives = quest.objectives.map((obj) => {
        if (obj.type === 'defeat' && (obj.target.toLowerCase() === enemyName.toLowerCase() || enemyName.toLowerCase().includes(obj.target.toLowerCase()))) {
          if (obj.currentAmount < obj.requiredAmount) {
            questUpdated = true;
            changed = true;
            const nextAmt = obj.currentAmount + 1;
            get().addNotification(`🎯 ${quest.title}: ${obj.description} (${nextAmt}/${obj.requiredAmount})`);
            return { ...obj, currentAmount: nextAmt };
          }
        }
        return obj;
      });

      if (questUpdated) {
        const allCompleted = updatedObjectives.every((o) => o.currentAmount >= o.requiredAmount);
        const nextStatus = allCompleted ? ('ready_to_turn_in' as const) : ('active' as const);
        if (allCompleted) {
          get().addNotification(t('notify.questReadyTurnIn', get().settings.language as Lang, { title: quest.title }));
        }
        return { ...quest, objectives: updatedObjectives, status: nextStatus };
      }

      return quest;
    });

    if (changed) {
      set({ quests: updatedQuests });
    }

    // Track encounter defeats for arena completion
    set((state) => ({
      encounterDefeats: state.encounterDefeats.includes(enemyName)
        ? state.encounterDefeats
        : [...state.encounterDefeats, enemyName],
    }));

    // Arena progression: 3 actual kills -> exactly one +1 level. The
    // exactly-once death guard above already prevents double counting.
    set((state) => {
      const kills = state.arena.killsInCurrentLevel + 1;
      if (kills >= ARENA_KILLS_PER_LEVEL) {
        get().addNotification(`\u2694\ufe0f Arena Level Up! ${state.arena.level} -> ${state.arena.level + 1}`);
        return { arena: { level: state.arena.level + 1, killsInCurrentLevel: 0 } };
      }
      return { arena: { level: state.arena.level, killsInCurrentLevel: kills } };
    });
  },

  checkItemObjectives: () => {
    const { quests, player } = get();
    let changed = false;

    const updatedQuests = quests.map((quest) => {
      if (quest.status !== 'active') return quest;

      let questUpdated = false;
      const updatedObjectives = quest.objectives.map((obj) => {
        if (obj.type === 'collect') {
          const count = getItemCountByName(player.inventory, obj.target);
          if (count !== obj.currentAmount) {
            questUpdated = true;
            changed = true;
            return { ...obj, currentAmount: Math.min(obj.requiredAmount, count) };
          }
        }
        return obj;
      });

      if (questUpdated) {
        const allCompleted = updatedObjectives.every((o) => o.currentAmount >= o.requiredAmount);
        const nextStatus = allCompleted ? ('ready_to_turn_in' as const) : ('active' as const);
        if (allCompleted) {
          get().addNotification(t('notify.questReadyTurnIn', get().settings.language as Lang, { title: quest.title }));
        }
        return { ...quest, objectives: updatedObjectives, status: nextStatus };
      }

      return quest;
    });

    if (changed) {
      set({ quests: updatedQuests });
    }
  },

  checkLocationObjectives: (playerPos) => {
    const { quests } = get();
    // BF5: called every frame from the player loop. Allocation-free early-out
    // when no active quest has a 'reach' objective -- the per-frame
    // quests.map/objective allocations below only run when one exists.
    let hasReach = false;
    for (const q of quests) {
      if (q.status === 'active' && q.objectives.some((o) => o.type === 'reach' && o.location)) {
        hasReach = true;
        break;
      }
    }
    if (!hasReach) return;

    let changed = false;

    const updatedQuests = quests.map((quest) => {
      if (quest.status !== 'active') return quest;

      let questUpdated = false;
      const updatedObjectives = quest.objectives.map((obj) => {
        if (obj.type === 'reach' && obj.location && obj.currentAmount < obj.requiredAmount) {
          const dx = playerPos[0] - obj.location[0];
          const dz = playerPos[2] - obj.location[2];
          const distSq = dx * dx + dz * dz;
          if (distSq <= 25) { // 5m radius
            questUpdated = true;
            changed = true;
            get().addNotification(`📍 Discovered Location: ${obj.target}!`);
            return { ...obj, currentAmount: 1 };
          }
        }
        return obj;
      });

      if (questUpdated) {
        const allCompleted = updatedObjectives.every((o) => o.currentAmount >= o.requiredAmount);
        const nextStatus = allCompleted ? ('ready_to_turn_in' as const) : ('active' as const);
        if (allCompleted) {
          get().addNotification(t('notify.questReadyTurnIn', get().settings.language as Lang, { title: quest.title }));
        }
        return { ...quest, objectives: updatedObjectives, status: nextStatus };
      }

      return quest;
    });

    if (changed) {
      set({ quests: updatedQuests });
    }
  },

  addNotification: (text) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      notifications: [...state.notifications.slice(-3), { id, text, createdAt: Date.now() }]
    }));
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      }));
    }, 2500);
  },

  setBossState: (boss) => set({ boss }),

  respawnPlayer: () => {
    // Clear any pending i-frame timeout so it can't fire after respawn
    if (iframeTimeoutId) {
      clearTimeout(iframeTimeoutId);
      iframeTimeoutId = null;
    }
    set((state) => ({
      player: {
        ...state.player,
        health: state.player.maxHealth,
        stamina: state.player.maxStamina,
        position: state.player.checkpointPos || [0, 1, 0],
        invincible: false,
        isDodging: false,
        isAttacking: false,
        comboStage: 0,
        comboConfirmed: false,
        attackCooldown: false,
        inCombat: false,
      },
      ui: {
        ...state.ui,
        deathOverlay: false,
      }
    }));
    get().addNotification(t('notify.respawned', get().settings.language as Lang));
  },

  saveGame: () => {
    const state = get();
    const slots = readSlotRecords();
    if (!slots.validContainer) {
      console.error('Cannot save game: save-slot data is corrupted');
      return;
    }

    const {
      health,
      maxHealth,
      stamina,
      maxStamina,
      position,
      gold,
      exp,
      maxExp,
      level,
      inventory,
      checkpointPos,
      itemProgression,
      stats,
      equippedArmourSlots,
      equippedArmour,
    } = state.player;
    const saveData: PersistedSaveData = {
      version: 1,
      savedAt: Date.now(),
      // Persist progression and recoverable gameplay state only. Combat
      // timers/i-frames are runtime state and must not resume half-finished.
      player: {
        health,
        maxHealth,
        stamina,
        maxStamina,
        maxExp,
        position,
        gold,
        exp,
        level,
        inventory,
        checkpointPos,
        itemProgression,
        stats,
        equippedArmourSlots,
        equippedArmour,
        hotbar: { slots: [...state.hotbar.slots], selectedSlot: state.hotbar.selectedSlot },
      } as PersistedSaveData['player'],
      quests: state.quests,
      completedQuestIds: state.completedQuestIds,
      encounterDefeats: state.encounterDefeats,
      npcMemory: state.npcMemory,
      worldMode: state.worldMode,
    };

    const nextRecords = [...slots.records];
    const prevRecord = slots.records[state.activeSlot - 1];
    // Preserve the stable identity of this save state across overwrites.
    const enrichedSaveData: UnknownRecord = {
      ...saveData,
      uid: isRecord(prevRecord) && typeof prevRecord.uid === 'string'
        ? prevRecord.uid : `state-${state.activeSlot}`,
      createdAt: isRecord(prevRecord) && typeof prevRecord.createdAt === 'number'
        ? prevRecord.createdAt : Date.now(),
    };
    nextRecords[state.activeSlot - 1] = enrichedSaveData;
    if (!writeSlotRecords(nextRecords)) return;

    persistActiveSlot(state.activeSlot);
    writeGlobalConfig(state.settings, state.hudLayout, state.skillHudConfig);
    const updatedSlots = readSlotRecords();
    set({
      saveSlots: getSaveSlotSummaries(updatedSlots.records, updatedSlots.validContainer),
    });

  },

  loadGame: (requestedSlotId) => {
    const slotId = requestedSlotId ?? get().activeSlot;
    const slots = readSlotRecords();
    const parsed = slots.validContainer
      ? getPersistedSaveData(slots.records[slotId - 1])
      : null;

    if (!parsed) {
      set({
        saveSlots: getSaveSlotSummaries(slots.records, slots.validContainer),
      });
      return false;
    }
    const loadedPlayer = parsed.player as unknown as UnknownRecord;
    let loadedInventory: InventoryState;
    if (isRecord(loadedPlayer.inventory) && isRecord(loadedPlayer.inventory.categories)) {
      // Native category-native save format
      loadedInventory = { categories: loadedPlayer.inventory.categories as InventoryState['categories'] };
    } else if (isRecord(loadedPlayer.inventory) && Array.isArray(loadedPlayer.inventory.slots)) {
      // Legacy flat-slot save: migrate into category-native structure
      let migrated = createInventory();
      for (const slot of loadedPlayer.inventory.slots) {

        if (isRecord(slot) && typeof slot.itemId === 'string' && typeof slot.count === 'number') {
          migrated = addItem(migrated, slot.itemId, slot.count).inv;
        }
      }
      loadedInventory = migrated;
    } else if (Array.isArray(loadedPlayer.inventory)) {
      // Oldest legacy save: flat array of { name, type, count }
      let legacyInv = createInventory();
      for (const item of loadedPlayer.inventory) {
        if (isRecord(item) && typeof item.name === 'string' && typeof item.count === 'number') {
          const itemId = getItemIdByName(item.name);
          if (itemId) legacyInv = addItem(legacyInv, itemId, item.count).inv;
        }
      }
      loadedInventory = legacyInv;
    } else {
      loadedInventory = createStarterInventory();
    }

    // Reconcile starter weapons that post-date this save (the crossbow): a
    // Continue from a pre-crossbow save must still receive it. Idempotent —
    // addItem rejects a duplicate unique weapon (maxStack 1).
    const hasCrossbow = Object.values(loadedInventory.categories)
      .some((slots) => slots.some((s) => s.itemId === 'crossbow'));
    if (!hasCrossbow) loadedInventory = addItem(loadedInventory, 'crossbow', 1).inv;

    // Validate numeric fields from save data — NaN, Infinity, or missing
    // values must not propagate into the live game state.
    const defaults = {
      health: 100, maxHealth: 100, stamina: 100, maxStamina: 100,
      gold: 50, exp: 0, maxExp: 100, level: 1,
    } as const;
    const safeHealth = safeNumber(loadedPlayer.health, defaults.health);
    const safeMaxHealth = Math.max(1, safeNumber(loadedPlayer.maxHealth, defaults.maxHealth));
    const safeStamina = safeNumber(loadedPlayer.stamina, defaults.stamina);
    const safeMaxStamina = Math.max(1, safeNumber(loadedPlayer.maxStamina, defaults.maxStamina));
    const safeGold = safeNumber(loadedPlayer.gold, defaults.gold);
    const safeExp = safeNumber(loadedPlayer.exp, defaults.exp);
    const safeMaxExp = Math.max(1, safeNumber(loadedPlayer.maxExp, defaults.maxExp));
    const safeLevel = Math.max(1, Math.round(safeNumber(loadedPlayer.level, defaults.level)));
    const safeCheckpoint: [number, number, number] = isVector3(loadedPlayer.checkpointPos)
      ? [loadedPlayer.checkpointPos[0], loadedPlayer.checkpointPos[1], loadedPlayer.checkpointPos[2]]
      : [0, 1, 0];

    // Validate quest data — clamp objective progress to valid ranges
    const safeQuests = Array.isArray(parsed.quests)
      ? (parsed.quests as unknown[]).map((q) => {
          if (!isRecord(q)) return null;
          const objectives = Array.isArray(q.objectives)
            ? (q.objectives as unknown[]).map((o) => {
                if (!isRecord(o)) return null;
                return {
                  ...o,
                  requiredAmount: Math.max(1, Math.round(safeNumber(o.requiredAmount, 1))),
                  currentAmount: Math.max(0, Math.round(safeNumber(o.currentAmount, 0))),
                } as Objective;
              }).filter((o): o is Objective => o !== null)
            : [];
          return {
            ...q,
            objectives,
          } as Quest;
        }).filter((q): q is Quest => q !== null)
      : INITIAL_QUESTS;

    const globalConfig = readGlobalConfig();
    const legacySettings: UnknownRecord = isRecord(parsed) && isRecord(parsed.settings)
      ? parsed.settings
      : {};
    const legacyHudLayout = isRecord(parsed) ? (parsed as UnknownRecord).hudLayout : undefined;
    const settingsFromStorage: UnknownRecord = globalConfig.settings ?? legacySettings;

    // Cancel pending timers from any previous session
    if (iframeTimeoutId) {
      clearTimeout(iframeTimeoutId);
      iframeTimeoutId = null;
    }
    if (respawnTimeoutId) {
      clearTimeout(respawnTimeoutId);
      respawnTimeoutId = null;
    }
    if (slowTimeoutId) {
      clearTimeout(slowTimeoutId);
      slowTimeoutId = null;
    }

    set((state) => ({
      activeSlot: slotId,
      saveSlots: getSaveSlotSummaries(slots.records, slots.validContainer),
      // P1.5: restore the saved world's mode (absent in legacy saves → story).
      worldMode: (() => {
        const rec = slots.records[slotId - 1];
        const m = isRecord(rec) ? (rec as { worldMode?: unknown }).worldMode : undefined;
        return m === 'sandbox' || m === 'trial' || m === 'multiplayer' || m === 'ranked'
          ? (m as WorldMode)
          : ('story' as WorldMode);
      })(),
      player: {
        ...state.player,
        health: safeHealth,
        maxHealth: safeMaxHealth,
        stamina: safeStamina,
        maxStamina: safeMaxStamina,
        position: isVector3(loadedPlayer.position)
          ? [loadedPlayer.position[0], loadedPlayer.position[1], loadedPlayer.position[2]]
          : [0, 1, 0],
        gold: safeGold,
        exp: safeExp,
        maxExp: safeMaxExp,
        level: safeLevel,
        checkpointPos: safeCheckpoint,
        inventory: loadedInventory,
        invincible: false,
        isDodging: false,
        isAttacking: false,
        comboStage: 0,
        comboConfirmed: false,
        attackCooldown: false,
        slowFactor: 1,
        lastDamageTime: 0,
        lastStaminaTime: 0,
        lastCombatTime: 0,
        inCombat: false,
        itemCooldownUntil: 0,
        // Archetype is transient gameplay state; a loaded session starts as
        // Fighter. canUseWeapon enforcement guarantees no incompatible weapon
        // can be *activated*, even if the save's hotbar holds one.
        archetype: 'fighter',
        // Per-item progression + stats + armour (P6/P8/P2.3). Legacy saves
        // without these fields start with fresh progression.
        itemProgression: isRecord(loadedPlayer.itemProgression)
          ? (loadedPlayer.itemProgression as ItemProgressionMap)
          : {},
        stats: isRecord(loadedPlayer.stats)
          ? { ...createPlayerStats(), ...(loadedPlayer.stats as unknown as PlayerStats) }
          : createPlayerStats(),
        equippedArmourSlots: (() => {
          const persisted = isRecord(loadedPlayer.equippedArmourSlots)
            ? (loadedPlayer.equippedArmourSlots as UnknownRecord) : {};
          const pick = (slot: ArmourSlot): string | null =>
            typeof persisted[slot] === 'string' ? (persisted[slot] as string) : null;
          const helmet = pick('helmet');
          const chest = pick('chest') ?? (typeof loadedPlayer.equippedArmour === 'string'
            ? loadedPlayer.equippedArmour : null);
          const leggings = pick('leggings');
          const boots = pick('boots');
          return { helmet, chest, leggings, boots };
        })(),
        equippedArmour: typeof loadedPlayer.equippedArmour === 'string'
          ? loadedPlayer.equippedArmour : null,
      },
      // Hotbar persistence (P1.4): restore assignments + selected slot.
      hotbar: isRecord(loadedPlayer.hotbar) && Array.isArray((loadedPlayer.hotbar as UnknownRecord).slots)
        ? {
            slots: ((loadedPlayer.hotbar as UnknownRecord).slots as (string | null)[])
              .slice(0, state.hotbar.slots.length)
              .map((s) => (typeof s === 'string' ? s : null)),
            selectedSlot: Math.max(0, Math.min(
              state.hotbar.slots.length - 1,
              Math.round(safeNumber((loadedPlayer.hotbar as UnknownRecord).selectedSlot, 0)),
            )),
            equippedShield: state.hotbar.equippedShield,
          }
        : state.hotbar,
      gunAmmo: 2,
      crossbowAmmo: 16,
      skillState: { cooldowns: {}, lastFired: null },
      settings: {
        ...state.settings,
        ...settingsFromStorage,
      },
      hudLayout: globalConfig.hudLayout !== undefined
        ? migrateHudLayout(globalConfig.hudLayout)
        : legacyHudLayout !== undefined
          ? migrateHudLayout(legacyHudLayout)
          : state.hudLayout,
      quests: safeQuests,
      completedQuestIds: Array.isArray(parsed.completedQuestIds) ? parsed.completedQuestIds : [],
      encounterDefeats: Array.isArray(parsed.encounterDefeats) ? parsed.encounterDefeats : [],
      npcMemory: isRecord(parsed.npcMemory)
        ? parsed.npcMemory as GameState['npcMemory']
        : {},
    }));
    persistActiveSlot(slotId);

    return true;
  },

  purchaseShopItem: (itemId, price, quantity = 1) => {
    const { player } = get();
    if (player.gold < price * quantity) {
      get().addNotification(t('shop.notEnoughGold', get().settings.language as Lang));
      return false;
    }
    const { inv: updatedInv, added } = addItem(player.inventory, itemId, quantity);
    if (added <= 0) {
      get().addNotification(t('shop.inventoryFull', get().settings.language as Lang));
      return false;
    }
    const actualCost = price * added;
    set((state) => ({
      player: {
        ...state.player,
        gold: state.player.gold - actualCost,
        inventory: updatedInv,
      },
    }));
    get().addNotification(t('shop.purchased', get().settings.language as Lang, { amount: added, name: getItem(itemId)?.name ?? itemId }));
    get().saveGame();
    return true;
  },

  deleteSaveSlot: (slotId) => {
    const slots = readSlotRecords();
    if (!slots.validContainer) return false;
    const record = slots.records[slotId - 1];
    if (record === null) return false; // already empty
    const nextRecords = [...slots.records];
    nextRecords[slotId - 1] = null;
    if (!writeSlotRecords(nextRecords)) return false;
    const updated = readSlotRecords();
    set({
      saveSlots: getSaveSlotSummaries(updated.records, updated.validContainer),
    });
    get().refreshSaveSlots();
    return true;
  },

  grantExpReward: (amount) => {
    get().addExp(amount);
  },

  // ── Hotbar Actions ──────────────────────────────────────────────
  equipWeapon: (itemId) => {
    const def = getItem(itemId);
    if (!def) return false;
    const archetype = get().player.archetype;
    // Armour equips to its dedicated four-piece slot (M1W2D6 #4). Damage
    // reduction is summed per-piece at the funnel; re-equipping a slot swaps
    // the old piece out.
    if (def.metadata?.armour) {
      const slot = armourSlotOf(itemId) ?? 'chest';
      set((state) => {
        const nextSlots = { ...state.player.equippedArmourSlots, [slot]: itemId };
        const legacy = nextSlots.helmet ?? nextSlots.chest ?? nextSlots.leggings ?? nextSlots.boots;
        return { player: { ...state.player, equippedArmourSlots: nextSlots, equippedArmour: legacy } };
      });
      get().addNotification(`Equipped ${def.name}.`);
      return true;
    }
    const isNeutral = itemId === 'm1887' || itemId === 'resonance_core' || itemId === 'crossbow';
    if (def.type === 'weapon' && !isNeutral && !canUseWeapon(archetype, itemId)) {
      get().addNotification(
        archetype === 'fighter' ? 'A Fighter cannot wield that.' : 'A Mage cannot wield that.'
      );
      return false;
    }
    const slots = get().hotbar.slots;
    let idx = slots.indexOf(itemId);
    if (idx === -1) {
      idx = slots.findIndex((s) => s === null);
      if (idx === -1) idx = 0;
    }
    get().setHotbarSlot(idx, itemId);
    get().setSelectedHotbarSlot(idx);
    get().addNotification(`Equipped ${def.name}`);
    return true;
  },

  chooseArchetype: (archetype) => {
    const state = get();
    if (state.player.archetype === archetype) return;
    // Deactivate incompatible equipment: clear hotbar slots the new archetype
    // cannot use and point the selected slot at something usable.
    const nextSlots = state.hotbar.slots.map((s) => (canUseWeapon(archetype, s) ? s : null));
    const usable = nextSlots.findIndex((s) => s !== null);
    set((s) => ({
      player: { ...s.player, archetype },
      hotbar: {
        ...s.hotbar,
        slots: nextSlots,
        selectedSlot: usable >= 0 ? usable : s.hotbar.selectedSlot,
      },
    }));
    get().addNotification(
      archetype === 'fighter' ? 'You embrace the path of the Fighter.' : 'You embrace the path of the Mage.'
    );
    get().saveGame();
  },

  setCheatConsoleOpen: (open) => {
    // Legacy Settings entry point now routes to the chat/command console.
    set((state) => ({ cheat: { ...state.cheat, chatOpen: open } }));
  },

  setHotbarSlot: (index, itemId) => {
    if (index < 0 || index >= 7) return;
    set((state) => ({
      hotbar: {
        ...state.hotbar,
        slots: state.hotbar.slots.map((s, i) => (i === index ? itemId : s)),
      },
    }));
    get().saveGame();
  },

  setSelectedHotbarSlot: (index) => {
    if (index < 0 || index >= 7) return;
    set((state) => ({ hotbar: { ...state.hotbar, selectedSlot: index } }));
  },

  setEquippedShield: (itemId) => {
    set((state) => ({ hotbar: { ...state.hotbar, equippedShield: itemId } }));
    get().saveGame();
  },

  useHotbarSlot: (index) => {
    const itemId = get().hotbar.slots[index];
    if (!itemId) {
      get().addNotification('Empty hotbar slot!');
      return false;
    }

    const def = getItem(itemId);
    if (!def) return false;

    if (def.type === 'consumable') {
      const count = getItemCount(get().player.inventory, itemId);
      if (count <= 0) {
        get().addNotification('No items left in inventory!');
        return false;
      }
      return get().useConsumableItem(itemId);
    }

    get().setSelectedHotbarSlot(index);
    get().addNotification(`Equipped ${def.name}`);
    return true;
  },

  // ── Cheat Actions ──────────────────────────────────────────────
  toggleGodMode: () => {
    set((state) => ({
      cheat: { ...state.cheat, godMode: !state.cheat.godMode, active: true },
    }));
    const isNowOn = get().cheat.godMode;
    get().addNotification(isNowOn ? '🛡️ God Mode ON' : '🛡️ God Mode OFF');
  },

  grantGold: (amount) => {
    set((state) => ({
      player: { ...state.player, gold: state.player.gold + amount },
    }));
    get().addNotification(`💰 +${amount} Gold (cheat)`);
    get().saveGame();
  },

  grantItem: (itemId, count = 1) => {
    const def = getItem(itemId);
    if (!def) return false;
    const { inv, added } = addItem(get().player.inventory, itemId, count);
    if (added <= 0) {
      get().addNotification('Inventory full!');
      return false;
    }
    set((state) => ({
      player: { ...state.player, inventory: inv },
    }));
    get().addNotification(`🎁 +${added} ${def.name} (cheat)`);
    get().saveGame();
    return true;
  },

  grantExp: (amount) => {
    get().addExp(amount);
    get().addNotification(`✨ +${amount} EXP (cheat)`);
  },

  grantItemExpById: (itemId, amount) => {
    const map = get().player.itemProgression;
    const current = map[itemId] ?? createItemProgression();
    const skillCount = itemId === 'resonance_core' ? 5 : 2;
    const { prog, leveledTo } = grantItemExp(current, amount, skillCount);
    if (prog.level === current.level && prog.exp === current.exp) return;
    set((state) => ({
      player: {
        ...state.player,
        itemProgression: { ...state.player.itemProgression, [itemId]: prog },
      },
    }));
    if (leveledTo > current.level) {
      get().addNotification(`⬆️ ${getItem(itemId)?.name ?? itemId} reached Lv.${leveledTo}`);
    }
  },

  getItemLevel: (itemId) => get().player.itemProgression[itemId]?.level ?? 1,

  isItemSkillUnlocked: (itemId, skillIndex) =>
    isSkillUnlocked(get().player.itemProgression[itemId]?.level ?? 1, skillIndex),

  // Transient skill HUD feedback — written by Player.tsx when a skill fires
  // or ticks down; the skill bar reads these instead of owning its own state.
  reportSkillCooldown: (skillId, secondsRemaining) => set((state) => ({
    skillState: {
      cooldowns: { ...state.skillState.cooldowns, [skillId]: Math.max(0, secondsRemaining) },
      lastFired: state.skillState.lastFired,
    },
  })),
  reportSkillFired: (skillId) => set((state) => ({
    skillState: {
      cooldowns: state.skillState.cooldowns,
      lastFired: { id: skillId, at: Date.now() },
    },
  })),

  teleportToArena: () => {
    set((state) => ({
      player: { ...state.player, position: [0, 1, -20] },
    }));
    get().addNotification('🌀 Teleported to Trial Arena');
  },

  teleportToForge: () => {
    set((state) => ({
      player: { ...state.player, position: [15, 1, 5] },
    }));
    get().addNotification('🌀 Teleported to Forge');
  },

  setChatOpen: (open) => set((state) => ({
    cheat: { ...state.cheat, chatOpen: open },
  })),

  pushChat: (text, kind) => set((state) => ({
    chat: {
      entries: [...state.chat.entries, { id: nextChatId.current++, text, kind }].slice(-CHAT_LOG_MAX),
    },
  })),

  runCommand: (raw) => {
    const text = raw.trim();
    if (!text) return;
    get().pushChat(text, 'command');
    const parts = text.replace(/^\//, '').split(/\s+/);
    const cmd = (parts[0] ?? '').toLowerCase();
    const arg = parts.slice(1);

    const err = (msg: string) => get().pushChat(msg, 'error');
    const ok = (msg: string) => get().pushChat(msg, 'result');

    switch (cmd) {
      case 'cheat': {
        const sub = (arg[0] ?? '').toLowerCase();
        switch (sub) {
          case 'gm': {
            const on = !get().cheat.godMode;
            set((state) => ({ cheat: { ...state.cheat, godMode: on, active: true } }));
            ok(on ? 'God Mode ON - damage blocked at the damage funnel.' : 'God Mode OFF.');
            return;
          }
          case 'fly': {
            const on = !get().cheat.fly;
            set((state) => ({ cheat: { ...state.cheat, fly: on, active: true } }));
            ok(on ? 'Fly ON - Jump ascends, Sprint descends, gravity suspended.' : 'Fly OFF.');
            return;
          }
          case 'noclip': {
            const on = !get().cheat.noclip;
            set((state) => ({ cheat: { ...state.cheat, noclip: on, active: true } }));
            ok(on ? 'Noclip ON - player collision disabled.' : 'Noclip OFF - collision restored.');
            return;
          }
          case 'off': {
            set((state) => ({
              cheat: { ...state.cheat, godMode: false, fly: false, noclip: false, active: false },
            }));
            ok('Cheats OFF (gm/fly/noclip disabled; /give remains usable).');
            return;
          }
          default:
            err('Usage: /cheat gm | fly | noclip | off');
            return;
        }
      }

      case 'give': {
        const what = (arg[0] ?? '').toLowerCase();
        if (!what) {
          err('Usage: /give health_potion | /give apple {amount} {effect} | /give coin {amount}');
          return;
        }
        if (what === 'health_potion') {
          ok(get().grantItem('health_potion', 1) ? 'Gave 1 Health Potion.' : 'Inventory full.');
          return;
        }
        if (what === 'apple') {
          const amount = Number(arg[1] ?? 1);
          if (!Number.isInteger(amount) || amount <= 0 || amount > 999) {
            err('Invalid apple amount. Use a positive whole number (1-999).');
            return;
          }
          // Optional effect arg: regeneration/{duration_seconds}/{effect_level}
          const effectArg = arg[2];
          if (effectArg !== undefined) {
            const m = /^regeneration\/(\d+)\/(\d+)$/.exec(effectArg);
            if (!m) {
              err('Invalid effect. Supported: regeneration/{duration_seconds}/{effect_level} (e.g. regeneration/10/10).');
              return;
            }
            const duration = Number(m[1]);
            const level = Number(m[2]);
            if (duration <= 0 || level <= 0) {
              err('Effect duration and level must be positive numbers.');
              return;
            }
            const granted = get().grantItem('apple', amount);
            if (!granted) { err('Inventory full.'); return; }
            ok(`Gave ${amount} Apple(s) - regeneration ${duration}s, level ${level}.`);
            return;
          }
          ok(get().grantItem('apple', amount) ? `Gave ${amount} Apple(s).` : 'Inventory full.');
          return;
        }
        if (what === 'coin') {
          const amount = Number(arg[1]);
          if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
            err('Invalid coin amount. Use a positive whole number.');
            return;
          }
          if (amount % 5 !== 0) {
            err('Coin amount must be a multiple of 5.');
            return;
          }
          get().grantGold(amount);
          ok(`Gave ${amount} coins.`);
          return;
        }
        err(`Unknown item: ${what}. Supported: health_potion, apple, coin.`);
        return;
      }

      default:
        err(`Unknown command: /${cmd}. Available: /cheat gm|fly|noclip|off, /give health_potion|apple|coin.`);
    }
  },

  openShop: (npcId) => {
    set((state) => ({
      ui: { ...state.ui, showShop: true, shopNpcId: npcId, interactPrompt: null, nearestNpcId: null },
      activeDialogue: null,
    }));
  },

  closeShop: () => {
    set((state) => ({
      ui: { ...state.ui, showShop: false, shopNpcId: null },
    }));
  },
}));

const CHAT_LOG_MAX = 60;
const nextChatId = { current: 1 };

// Debug/dev-only handle: lets runtime verification tooling drive and inspect
// the store without gameplay code depending on it. Not read by any gameplay
// component.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__ABYSSION_STORE = useGameStore;
}
