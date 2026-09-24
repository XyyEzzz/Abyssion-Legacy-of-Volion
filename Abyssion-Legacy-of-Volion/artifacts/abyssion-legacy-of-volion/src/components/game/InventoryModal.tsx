'use client';

import { useGameStore } from '@/lib/store';
import { getItem, RARITY_COLORS, ItemDef, ItemType, ArmourSlot, armourSlotOf } from '@/lib/items';
import {
  splitStack,
  moveItemWithinCategory,
  getCategoryDisplaySlots,
  getActiveCategories,
  getItemCount,
  getOccupiedSlots,
  InventorySlot,
  SortMode,
  CATEGORY_META,
} from '@/lib/inventory';
import { X, Search, ChevronDown, ArrowUpDown, Package } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { weaponCategoryOf, isRangedCategory } from '@/lib/items';
import * as LucideIcons from 'lucide-react';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

const HEALING_ITEM_IDS = ['health_potion', 'small_potion', 'bread', 'apple'];

/** Inventory nav tree (BUG-010), top to bottom: All | Fighting | Item |
 *  Healing. No Food. The `weapon` key is the Fighting branch — the state name
 *  is preserved, only its filter predicate widened. */
const NAV_CATEGORIES: ['all' | 'weapon' | 'item' | 'healing', string, string][] = [
  ['all', 'All', 'Package'],
  ['weapon', 'Fighting', 'Swords'],
  ['item', 'Item', 'Box'],
  ['healing', 'Healing', 'FlaskConical'],
];

/** Sub-categories disclosed under Fighting — never top-level entries. */
type FightingBranch = 'core' | 'melee' | 'ranged' | 'armour';

const FIGHTING_BRANCHES: [FightingBranch, string, string][] = [
  ['core', 'Core', 'Zap'],
  ['melee', 'Melee', 'Sword'],
  ['ranged', 'Ranged', 'Crosshair'],
  ['armour', 'Armour', 'Shield'],
];

/** True when `itemId` belongs to the given Fighting sub-branch (or to any of
 *  them when `branch` is null). Weapons are classified solely through the
 *  authoritative weaponCategoryOf; armour solely through its armour metadata. */
function inFightingBranch(itemId: string, branch: FightingBranch | null): boolean {
  if (!branch) return true;
  const wc = weaponCategoryOf(itemId);
  if (branch === 'core') return wc === 'core';
  if (branch === 'ranged') return isRangedCategory(itemId);
  if (branch === 'melee') return wc !== null && wc !== 'core' && !isRangedCategory(itemId);
  return armourSlotOf(itemId) !== null;
}

const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: 'rarity', label: 'Rarity' },
  { key: 'name', label: 'Name' },
];

const RARITY_GLOW: Record<string, string> = {
  common: 'shadow-[0_0_6px_rgba(156,163,175,0.3)]',
  uncommon: 'shadow-[0_0_8px_rgba(34,197,94,0.35)]',
  rare: 'shadow-[0_0_8px_rgba(59,130,246,0.4)]',
  epic: 'shadow-[0_0_10px_rgba(168,85,247,0.4)]',
  legendary: 'shadow-[0_0_12px_rgba(245,158,11,0.5)]',
};

type IconType = React.ComponentType<{ size?: number; className?: string }>;

function getIconComponent(iconName: string): IconType {
  return (LucideIcons as unknown as Record<string, IconType>)[iconName] ?? Package;
}

/** ── P1.4 armour character preview ──────────────────────────────────
 *  A real player-facing character model built from simple geometry, driven
 *  ENTIRELY by authoritative store state: equippedArmour and the selected
 *  hotbar weapon. Armour pieces are attached to the relevant body parts and
 *  render only when equipped — no detached UI text, no duplicate state. */
function CharacterPreview() {
  const equippedArmourSlots = useGameStore((s) => s.player.equippedArmourSlots);
  const equippedArmour = useGameStore((s) => s.player.equippedArmour);
  const selectedSlot = useGameStore((s) => s.hotbar.selectedSlot);
  const hotbarSlots = useGameStore((s) => s.hotbar.slots);
  const weaponId = hotbarSlots[selectedSlot];
  // Four-piece armour: each region derives its look from its own slot.
  const helmetDef = equippedArmourSlots?.helmet ? getItem(equippedArmourSlots.helmet) : null;
  const chestDef = equippedArmourSlots?.chest ? getItem(equippedArmourSlots.chest)
    : (equippedArmour ? getItem(equippedArmour) : null);
  const leggingsDef = equippedArmourSlots?.leggings ? getItem(equippedArmourSlots.leggings) : null;
  const bootsDef = equippedArmourSlots?.boots ? getItem(equippedArmourSlots.boots) : null;
  const weaponDef = weaponId ? getItem(weaponId) : null;
  const weaponCat = weaponId ? weaponCategoryOf(weaponId) : null;

  const skin = '#c8956c';
  const cloth = '#3f4a5a';
  const armourColor = '#8f9aa6';
  const metal = { color: armourColor, metalness: 0.55, roughness: 0.4 } as const;

  return (
    <div className="relative h-[90px] w-[90px] sm:h-[100px] sm:w-[100px] shrink-0 pointer-events-none select-none rounded-lg border border-gray-800 bg-gray-950/90 overflow-hidden">
      <span className="absolute top-1.5 left-2 text-[9px] font-bold uppercase tracking-wider text-gray-500 z-10">
        {chestDef ? chestDef.name : 'No Armour'}
      </span>
      <Canvas camera={{ position: [0, 1.4, 3.2], fov: 40 }} gl={{ antialias: false, powerPreference: 'low-power' }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <group position={[0, -0.9, 0]}>
          {/* Head — helmet cap renders only when the Helmet slot is filled */}
          <mesh position={[0, 1.62, 0]} castShadow>
            <sphereGeometry args={[0.19, 16, 16]} />
            <meshStandardMaterial color={skin} roughness={0.7} />
          </mesh>
          {helmetDef && (
            <mesh position={[0, 1.7, 0]} castShadow>
              <sphereGeometry args={[0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial {...metal} />
            </mesh>
          )}
          {/* Torso — chestplate renders only when the Chest slot is filled */}
          <mesh position={[0, 1.12, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.19, 0.62, 12]} />
            <meshStandardMaterial color={chestDef ? armourColor : cloth} metalness={chestDef ? 0.55 : 0} roughness={chestDef ? 0.4 : 0.85} />
          </mesh>
          {/* Pelvis/leggings — leggings region renders only when filled */}
          <mesh position={[0, 0.76, 0]} castShadow>
            <boxGeometry args={[0.36, 0.18, 0.24]} />
            <meshStandardMaterial color={leggingsDef ? armourColor : cloth} metalness={leggingsDef ? 0.55 : 0} roughness={leggingsDef ? 0.4 : 0.85} />
          </mesh>
          {/* Arms (shoulder pads show armour state too) */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.3, 1.34, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.11, 10, 10]} />
                <meshStandardMaterial color={chestDef ? armourColor : cloth} metalness={chestDef ? 0.55 : 0} roughness={chestDef ? 0.4 : 0.85} />
              </mesh>
              <mesh position={[side * 0.06, -0.24, 0]} castShadow>
                <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
                <meshStandardMaterial color={skin} roughness={0.7} />
              </mesh>
            </group>
          ))}
          {/* Legs — leggings state */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.12, 0.38, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.06, 0.62, 8]} />
              <meshStandardMaterial color={leggingsDef ? armourColor : cloth} metalness={leggingsDef ? 0.55 : 0} roughness={leggingsDef ? 0.4 : 0.85} />
            </mesh>
          ))}
          {/* Boots — boots state */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.12, 0.06, 0.04]} castShadow>
              <boxGeometry args={[0.14, 0.12, 0.26]} />
              <meshStandardMaterial color={bootsDef ? armourColor : '#2a2320'} metalness={bootsDef ? 0.55 : 0} roughness={bootsDef ? 0.4 : 0.9} />
            </mesh>
          ))}
          {/* Weapon attached to the right hand — reflects the authoritative
              hotbar selection (sword / gun / dagger / staff silhouettes). */}
          {weaponCat === 'sword' && (
            <group position={[0.42, 0.86, 0.12]} rotation={[0, 0, -0.35]}>
              <mesh castShadow>
                <boxGeometry args={[0.05, 0.9, 0.02]} />
                <meshStandardMaterial color="#b8bcc4" metalness={0.8} roughness={0.3} />
              </mesh>
              <mesh position={[0, -0.5, 0]} castShadow>
                <boxGeometry args={[0.04, 0.18, 0.04]} />
                <meshStandardMaterial color="#4a3220" />
              </mesh>
            </group>
          )}
          {weaponCat === 'gun' && (
            <group position={[0.42, 0.92, 0.18]}>
              <mesh castShadow>
                <boxGeometry args={[0.08, 0.1, 0.42]} />
                <meshStandardMaterial color="#5a5f66" metalness={0.7} roughness={0.35} />
              </mesh>
              <mesh position={[0, -0.1, 0.1]} castShadow>
                <boxGeometry args={[0.07, 0.16, 0.1]} />
                <meshStandardMaterial color="#3a2c1e" />
              </mesh>
            </group>
          )}
          {weaponCat === 'dagger' && (
            <group position={[0.42, 0.9, 0.14]} rotation={[0, 0, -0.2]}>
              <mesh castShadow>
                <boxGeometry args={[0.04, 0.4, 0.02]} />
                <meshStandardMaterial color="#b8bcc4" metalness={0.8} roughness={0.3} />
              </mesh>
            </group>
          )}
          {weaponCat === 'staff' && (
            <group position={[0.44, 0.85, 0.1]} rotation={[0, 0, -0.12]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.025, 0.03, 1.4, 6]} />
                <meshStandardMaterial color="#4a3220" />
              </mesh>
              <mesh position={[0, 0.74, 0]}>
                <sphereGeometry args={[0.07, 10, 10]} />
                <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.4} />
              </mesh>
            </group>
          )}
        </group>
      </Canvas>
    </div>
  );
}

/** One item-grid slot (M1W2D6 #5). Extracted so the Weapon category can
 *  render ordered Ranged/Melee sections from the same slot markup. */
function InventoryItemSlot(props: {
  cat: ItemType;
  index: number;
  slot: InventorySlot;
  def: ItemDef;
  draggedSlot: { cat: ItemType; index: number } | null;
  dropTarget: { cat: ItemType; index: number } | null;
  hotbarSlots: string[];
  onDragStart: (cat: ItemType, index: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, cat: ItemType, index: number) => void;
  onDrop: (cat: ItemType, index: number) => void;
  onPointerDown: (cat: ItemType, index: number, e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (def: ItemDef) => void;
  onPointerEnter: (def: ItemDef, e: React.PointerEvent) => void;
  onPointerLeave: () => void;
  onContextMenu: (e: React.MouseEvent, cat: ItemType, index: number) => void;
}) {
  const {
    cat, index, slot, def, draggedSlot, dropTarget, hotbarSlots,
    onDragStart, onDragEnd, onDragOver, onDrop, onPointerDown, onPointerMove,
    onPointerUp, onPointerEnter, onPointerLeave, onContextMenu,
  } = props;
  const rarityColor = RARITY_COLORS[def.rarity];
  const Icon = getIconComponent(def.icon);
  const isDragged = draggedSlot?.cat === cat && draggedSlot.index === index;
  const isDropTarget = dropTarget?.cat === cat && dropTarget.index === index && draggedSlot !== null;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(cat, index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, cat, index)}
      onDrop={() => onDrop(cat, index)}
      onPointerDown={(e) => onPointerDown(cat, index, e)}
      onPointerMove={onPointerMove}
      onPointerUp={() => onPointerUp(def)}
      onPointerEnter={(e) => onPointerEnter(def, e)}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => onContextMenu(e, cat, index)}
      className={`relative aspect-square rounded-md border-2 flex flex-col items-center justify-center cursor-pointer transition-all duration-150 hover:scale-105 ${
        RARITY_GLOW[def.rarity] ?? ''
      } ${isDragged ? 'opacity-40 scale-90' : ''} ${
        isDropTarget ? 'border-blue-400 bg-blue-500/20 scale-105' : ''
      }`}
      style={{
        borderColor: rarityColor,
        background: 'linear-gradient(160deg, rgba(38,32,22,0.95), rgba(22,19,14,0.95))',
        boxShadow: 'inset 0 1px 0 rgba(232,213,174,0.12), inset 0 -1px 0 rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.5)',
      }}
    >
      <Icon size={22} className="sm:w-7 sm:h-7" />
      {slot.count > 1 && (
        <span
          className="absolute bottom-0.5 right-0.5 text-[10px] sm:text-xs font-bold text-white rounded-sm px-1 leading-tight border"
          style={{ background: 'rgba(0,0,0,0.8)', borderColor: 'rgba(214,138,49,0.5)' }}
        >
          {slot.count}
        </span>
      )}
      {def.type === 'consumable' && (
        <span className="absolute top-0.5 left-1 text-[8px] text-emerald-400 font-bold leading-tight">
          USE
        </span>
      )}
      {(def.type === 'weapon' || Boolean(def.metadata?.armour)) && (
        <span className="absolute top-0.5 left-1 text-[8px] text-amber-400 font-bold leading-tight">
          EQUIP
        </span>
      )}
      {hotbarSlots.includes(def.id) && (
        <span
          className="absolute inset-0 rounded-md pointer-events-none border-2"
          style={{ borderColor: '#d68a31', boxShadow: '0 0 10px rgba(214,138,49,0.55)' }}
        />
      )}
    </div>
  );
}

export default function InventoryModal() {
  const { ui, setShowInventory, player, setInventory, useConsumableItem } = useGameStore();
  const equipWeapon = useGameStore((s) => s.equipWeapon);

  const [draggedSlot, setDraggedSlot] = useState<{ cat: ItemType; index: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ cat: ItemType; index: number } | null>(null);
  const [splitState, setSplitState] = useState<{ cat: ItemType; index: number } | null>(null);
  const [splitAmount, setSplitAmount] = useState(1);
  const [tooltip, setTooltip] = useState<{ def: ItemDef; x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('rarity');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  // Display filter: All | Fighting | Item | Healing (authoritative display
  // grouping only — the underlying inventory categories are unchanged).
  const [displayFilter, setDisplayFilter] = useState<'all' | 'weapon' | 'item' | 'healing'>('all');
  // Nav presentation state only: the Fighting disclosure and the sub-branch it
  // refines to. Reset on open, never persisted to the store.
  const [fightingOpen, setFightingOpen] = useState(false);
  const [fightingBranch, setFightingBranch] = useState<FightingBranch | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = ui.showInventory;

  useEffect(() => {
    if (open) {
      // Cancel any pending close timer from a previous handleClose —
      // prevents the stale timeout from closing the inventory immediately
      // after the user reopens it within the 200ms animation window.
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setMounted(true);
      setClosing(false);
      // BUG-010: the nav's disclosure/sub-branch are per-open UI state.
      setFightingOpen(false);
      setFightingBranch(null);
    }
  }, [open]);

  // Unmount cleanup: the 200ms close timeout must not survive this modal —
  // otherwise it fires after the tree is gone and writes closing state for a
  // dead component (scene/phase change within the animation window).
  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setShowInventory(false);
      setSplitState(null);
      setTooltip(null);
      setSortMenuOpen(false);
    }, 200);
  }, [setShowInventory]);

  const activeCats = useMemo(() => getActiveCategories(player.inventory), [player.inventory]);
  const filteredCats = useMemo(() => {
    if (displayFilter === 'all') return activeCats;
    // Fighting = everything that fights: the weapon category, plus the
    // equipment category that holds the Resonance Core (weaponCategoryOf
    // 'core') and the armour pieces.
    if (displayFilter === 'weapon')
      return activeCats.filter((c) => c === 'weapon' || c === 'equipment');
    if (displayFilter === 'healing')
      return activeCats.filter((c) => c === 'consumable' || c === 'equipment');
    return activeCats.filter((c) => c === 'material' || c === 'key');
  }, [activeCats, displayFilter]);
  // The sub-branch only refines the Fighting view; every other filter ignores it.
  const fightingBranchActive = displayFilter === 'weapon' ? fightingBranch : null;
  // Hide sections whose items are all healing-filtered out, or that hold no item
  // of the active Fighting sub-branch.
  const visibleCats = useMemo(
    () =>
      filteredCats.filter((cat) => {
        if (displayFilter === 'healing')
          return (player.inventory.categories[cat] ?? []).some((s) => HEALING_ITEM_IDS.includes(s.itemId));
        // Hide sections holding no item of the active Fighting sub-branch.
        if (fightingBranchActive)
          return (player.inventory.categories[cat] ?? []).some((s) => inFightingBranch(s.itemId, fightingBranchActive));
        return true;
      }),
    [filteredCats, displayFilter, fightingBranchActive, player.inventory]
  );
  // Hotbar occupancy drives the equipped-highlight ring on inventory slots.
  const hotbarSlots = useMemo(
    () => useGameStore.getState().hotbar.slots.filter((s): s is string => !!s),
    []
  );
  const occupiedCount = useMemo(() => getOccupiedSlots(player.inventory), [player.inventory]);
  const healingCount = useMemo(
    () => HEALING_ITEM_IDS.reduce((sum, id) => sum + getItemCount(player.inventory, id), 0),
    [player.inventory]
  );

  const handleSlotClick = useCallback(
    (def: ItemDef) => {
      if (longPressFired.current) {
        longPressFired.current = false;
        return;
      }
      if (def.type === 'consumable') {
        useConsumableItem(def.name);
        return;
      }
      // Weapons (and shields) equip through the authoritative hotbar path;
      // equipWeapon enforces archetype usability and fails closed.
      equipWeapon(def.id);
    },
    [useConsumableItem, equipWeapon]
  );

  const openSplitDialog = useCallback(
    (cat: ItemType, index: number) => {
      const slot = player.inventory.categories[cat]?.[index];
      if (!slot) return;
      const def = getItem(slot.itemId);
      if (!def || def.maxStack <= 1 || slot.count <= 1) return;
      setSplitState({ cat, index });
      setSplitAmount(1);
    },
    [player.inventory]
  );

  const handleSplitConfirm = useCallback(() => {
    if (!splitState) return;
    const result = splitStack(player.inventory, splitState.cat, splitState.index, splitAmount);
    if (result.success) setInventory(result.inv);
    setSplitState(null);
  }, [splitState, splitAmount, player.inventory, setInventory]);

  const handleSplitHalf = useCallback(() => {
    if (!splitState) return;
    const slot = player.inventory.categories[splitState.cat]?.[splitState.index];
    if (!slot) return;
    setSplitAmount(Math.floor(slot.count / 2));
  }, [splitState, player.inventory]);

  // --- Drag & drop (desktop HTML5 DnD) ---
  const handleDragStart = (cat: ItemType, index: number) => {
    setDraggedSlot({ cat, index });
  };
  const handleDragEnd = () => {
    setDraggedSlot(null);
    setDropTarget(null);
  };
  const handleDragOver = (e: React.DragEvent, cat: ItemType, index: number) => {
    e.preventDefault();
    setDropTarget({ cat, index });
  };
  const handleDrop = (targetCat: ItemType, targetIndex: number) => {
    if (!draggedSlot || draggedSlot.cat !== targetCat || draggedSlot.index === targetIndex) {
      setDraggedSlot(null);
      setDropTarget(null);
      return;
    }
    setInventory(moveItemWithinCategory(player.inventory, targetCat, draggedSlot.index, targetIndex));
    setDraggedSlot(null);
    setDropTarget(null);
  };

  // --- Long-press for mobile ---
  const handlePointerDown = (cat: ItemType, index: number, e: React.PointerEvent) => {
    longPressFired.current = false;
    touchStartPos.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      openSplitDialog(cat, index);
    }, 500);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!longPressTimer.current || !touchStartPos.current) return;
    const dx = Math.abs(e.clientX - touchStartPos.current.x);
    const dy = Math.abs(e.clientY - touchStartPos.current.y);
    if (dx > 8 || dy > 8) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handlePointerUp = (def: ItemDef) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressFired.current) handleSlotClick(def);
  };
  const handlePointerEnter = (def: ItemDef, e: React.PointerEvent) => {
    if (longPressTimer.current) return;
    setTooltip({ def, x: e.clientX, y: e.clientY });
  };
  const handlePointerLeave = () => setTooltip(null);

  const handleContextMenu = (e: React.MouseEvent, cat: ItemType, index: number) => {
    e.preventDefault();
    openSplitDialog(cat, index);
  };

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const sortLabel = SORT_MODES.find((s) => s.key === sortMode)?.label ?? 'Rarity';

  if (!open && !mounted) return null;
  if (!open && closing) return null;

  return (
    <div
      className={`absolute inset-0 z-40 flex items-center justify-center bg-black backdrop-blur-sm p-2 sm:p-4 transition-opacity duration-200 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden max-h-[92vh] transition-all duration-200 flex flex-col ${
          closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-wider">INVENTORY</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs sm:text-sm text-amber-400 font-bold">{player.gold} Gold</span>
            <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Toolbar: Search + Sort */}
        <div className="px-3 sm:px-4 py-2 border-b border-gray-800 flex items-center gap-2 bg-gray-950/50 shrink-0">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-blue-500 placeholder:text-gray-500"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setSortMenuOpen(!sortMenuOpen)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition-colors"
            >
              <ArrowUpDown size={14} />
              <span className="hidden sm:inline">{sortLabel}</span>
              <ChevronDown size={12} />
            </button>
            {sortMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-10 min-w-[100px]">
                {SORT_MODES.map((mode) => (
                  <button
                    key={mode.key}
                    onClick={() => {
                      setSortMode(mode.key);
                      setSortMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      sortMode === mode.key ? 'text-blue-400 bg-blue-500/10' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Upper equipment region (M1W2D6 #5) ──────────────────────
            Left: SMALL player preview + the four armour slots beneath it.
            Right of the preview: intentionally EMPTY reserved area. */}
        <div className="shrink-0 border-b border-gray-800 bg-gray-950/60 flex items-start gap-3 p-3">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <CharacterPreview />
            {/* Four independent armour slots — each bound to its own
                authoritative equippedArmourSlots entry via equipWeapon. */}
            <div className="grid grid-cols-2 gap-1.5">
              {(['helmet', 'chest', 'leggings', 'boots'] as ArmourSlot[]).map((slotKey) => {
                const slotId = player.equippedArmourSlots?.[slotKey] ?? null;
                const slotDef = slotId ? getItem(slotId) : null;
                const slotIcon = slotDef ? getIconComponent(slotDef.icon) : null;
                const slotLabel = slotKey === 'helmet' ? 'Helmet' : slotKey === 'chest'
                  ? 'Chestplate' : slotKey === 'leggings' ? 'Leggings' : 'Boots';
                return (
                  <div
                    key={slotKey}
                    title={slotDef ? `${slotLabel}: ${slotDef.name}` : `Empty ${slotLabel} slot`}
                    onClick={() => { if (slotDef) equipWeapon(slotId as string); }}
                    className={`w-14 h-14 rounded border-2 flex flex-col items-center justify-center cursor-pointer ${
                      slotDef ? 'border-amber-600/70 bg-amber-900/20' : 'border-gray-700 bg-black/40 border-dashed'
                    }`}
                  >
                    {slotIcon ? (() => { const SlotIcon = slotIcon; return <SlotIcon size={20} className="text-amber-300" />; })() : (
                      <span className="text-[8px] uppercase tracking-wide text-gray-600 text-center leading-tight px-0.5">
                        {slotLabel}
                      </span>
                    )}
                    {slotDef && (
                      <span className="text-[7px] text-gray-400 uppercase truncate w-full text-center px-0.5">
                        {slotLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Reserved empty area to the right of the preview — deliberately
              unused in this session. */}
          <div className="flex-1 min-h-[9rem]" aria-hidden />
        </div>

        {/* Body: floating LEFT-side category navigation + independently
            scrolling content column. The nav is absolutely positioned, so it
            is not a flex child of the content row and item scrolling can never
            move it. Tree: All | Fighting (Core/Melee/Ranged/Armour) | Item |
            Healing — no Food. */}
        <div className="relative flex flex-1 min-h-0 [@media(min-height:760px)]:min-h-[26rem]">
          {/* Floating category nav: anchored to the modal's left padding edge,
              outside the item-grid scroll region, visible by default. */}
          <nav className="absolute left-3 sm:left-4 top-2 bottom-2 z-20 w-24 sm:w-32 flex flex-col gap-1.5 p-2 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/95 shadow-xl">
            {NAV_CATEGORIES.map(([key, label, iconName]) => {
              const IconComp = getIconComponent(iconName);
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      setDisplayFilter(key);
                      if (key === 'weapon') {
                        setFightingOpen((prev) => !prev);
                        setFightingBranch(null);
                      }
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-3 sm:py-4 rounded-lg border text-left font-bold tracking-wide transition-colors ${
                      displayFilter === key
                        ? 'bg-amber-900/60 text-amber-200 border-amber-600'
                        : 'bg-black/40 text-gray-400 border-gray-800 hover:text-gray-200 hover:border-gray-600'
                    }`}
                  >
                    <IconComp size={18} className="shrink-0" />
                    <span className="text-sm sm:text-base">{label}</span>
                    {key === 'weapon' && (
                      <ChevronDown
                        size={14}
                        className={`ml-auto shrink-0 transition-transform duration-200 ${fightingOpen ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>
                  {key === 'weapon' && fightingOpen && (
                    <div className="flex flex-col gap-1 pl-2 ml-1 border-l border-gray-800">
                      {FIGHTING_BRANCHES.map(([branch, branchLabel, branchIcon]) => {
                        const BranchIcon = getIconComponent(branchIcon);
                        return (
                          <button
                            key={branch}
                            onClick={() => {
                              setDisplayFilter('weapon');
                              setFightingBranch(branch);
                            }}
                            className={`flex items-center gap-2 w-full px-2 py-1.5 rounded border text-left text-xs font-bold tracking-wide transition-colors ${
                              displayFilter === 'weapon' && fightingBranch === branch
                                ? 'bg-amber-900/40 text-amber-200 border-amber-700'
                                : 'bg-black/30 text-gray-400 border-gray-800 hover:text-gray-200 hover:border-gray-600'
                            }`}
                          >
                            <BranchIcon size={13} className="shrink-0" />
                            <span>{branchLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="flex flex-col flex-1 min-w-0 pl-[7.5rem] sm:pl-40">

        {/* Category Sections */}
        <div className="overflow-y-auto flex-1 min-h-[140px]">
          {activeCats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-gray-500">
              <Package size={40} className="mb-2 opacity-40" />
              <p className="text-sm">Your inventory is empty.</p>
            </div>
          ) : (
            <div className="p-3 sm:p-4 space-y-3">
              {visibleCats.map((cat) => {
                const meta = CATEGORY_META[cat];
                const CatIcon = getIconComponent(meta.icon);
                // Weapon and equipment categories render ordered sub-sections.
                // Weapons: Ranged above Melee (isRangedCategory puts the Water
                // Staff with the guns). Equipment: the Resonance Core and the
                // armour pieces each get their own heading rather than sharing
                // a generic "Equipment" one.
                if (cat === 'weapon' || cat === 'equipment') {
                  const displaySlots = getCategoryDisplaySlots(player.inventory, cat, searchQuery, sortMode)
                    .filter(({ slot }) => inFightingBranch(slot.itemId, fightingBranchActive));
                  const ranged = displaySlots.filter(({ slot }) => isRangedCategory(slot.itemId));
                  const melee = displaySlots.filter(({ slot }) => !isRangedCategory(slot.itemId));
                  const core = displaySlots.filter(({ slot }) => weaponCategoryOf(slot.itemId) === 'core');
                  const armour = displaySlots.filter(({ slot }) => armourSlotOf(slot.itemId) !== null);
                  const other = displaySlots.filter(
                    ({ slot }) => weaponCategoryOf(slot.itemId) !== 'core' && armourSlotOf(slot.itemId) === null
                  );
                  const section = (label: string, entries: typeof displaySlots) => (
                    <div>
                      <div className="px-3 py-1.5 bg-gray-800/40 flex items-center gap-2 border-b border-gray-800">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{label}</span>
                        <span className="text-[10px] text-gray-600">({entries.length})</span>
                      </div>
                      <div className="p-2.5 sm:p-3">
                        <div
                          className="grid gap-2 sm:gap-2.5"
                          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
                        >
                          {entries.map(({ slot, index, def }) => (
                            <InventoryItemSlot
                              key={`${cat}-${index}-${slot.id}`}
                              cat={cat} index={index} slot={slot} def={def}
                              draggedSlot={draggedSlot} dropTarget={dropTarget}
                              hotbarSlots={hotbarSlots}
                              onDragStart={handleDragStart} onDragEnd={handleDragEnd}
                              onDragOver={handleDragOver} onDrop={handleDrop}
                              onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
                              onPointerUp={handlePointerUp} onPointerEnter={handlePointerEnter}
                              onPointerLeave={handlePointerLeave}
                              onContextMenu={handleContextMenu}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <div key={cat} className="border border-gray-800 rounded-lg overflow-hidden bg-gray-950/40">
                      {cat === 'weapon' ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60">
                          <CatIcon size={16} className="text-blue-400" />
                          <span className="font-bold text-sm text-white tracking-wide">{meta.label}</span>
                        </div>
                      ) : null}
                      {cat === 'weapon' ? (
                        <>
                          {ranged.length > 0 ? section('RANGED', ranged) : null}
                          {melee.length > 0 ? section('MELEE', melee) : null}
                        </>
                      ) : (
                        <>
                          {core.length > 0 ? section('THE CORE', core) : null}
                          {armour.length > 0 ? section('ARMOUR', armour) : null}
                          {other.length > 0 ? section('EQUIPMENT', other) : null}
                        </>
                      )}
                    </div>
                  );
                }
                const isCollapsed = collapsed[cat] ?? false;
                const displaySlots = getCategoryDisplaySlots(player.inventory, cat, searchQuery, sortMode)
                  .filter(({ slot }) => inFightingBranch(slot.itemId, fightingBranchActive));
                if (searchQuery && displaySlots.length === 0) return null;

                return (
                  <div key={cat} className="border border-gray-800 rounded-lg overflow-hidden bg-gray-950/40">
                    <button
                      onClick={() => toggleCollapse(cat)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/60 hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <CatIcon size={16} className="text-blue-400" />
                        <span className="font-bold text-sm text-white tracking-wide">{meta.label}</span>
                        <span className="text-xs text-gray-500">({displaySlots.length})</span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`text-gray-500 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
                      />
                    </button>

                    <div className={`overflow-hidden transition-all duration-200 ${isCollapsed ? 'max-h-0' : 'max-h-[1000px]'}`}>
                      <div className="p-2.5 sm:p-3">
                        <div
                          className="grid gap-2 sm:gap-2.5"
                          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
                        >
                          {displaySlots.map(({ slot, index, def }) => {
                            const rarityColor = RARITY_COLORS[def.rarity];
                            const Icon = getIconComponent(def.icon);
                            const isDragged = draggedSlot?.cat === cat && draggedSlot.index === index;
                            const isDropTarget =
                              dropTarget?.cat === cat && dropTarget.index === index && draggedSlot !== null;

                            return (
                              <div
                                key={`${cat}-${index}-${slot.id}`}
                                draggable
                                onDragStart={() => handleDragStart(cat, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, cat, index)}
                                onDrop={() => handleDrop(cat, index)}
                                onPointerDown={(e) => handlePointerDown(cat, index, e)}
                                onPointerMove={handlePointerMove}
                                onPointerUp={() => handlePointerUp(def)}
                                onPointerEnter={(e) => handlePointerEnter(def, e)}
                                onPointerLeave={handlePointerLeave}
                                onContextMenu={(e) => handleContextMenu(e, cat, index)}
                                className={`relative aspect-square rounded-md border-2 flex flex-col items-center justify-center cursor-pointer transition-all duration-150 hover:scale-105 ${
                                  RARITY_GLOW[def.rarity] ?? ''
                                } ${isDragged ? 'opacity-40 scale-90' : ''} ${
                                  isDropTarget ? 'border-blue-400 bg-blue-500/20 scale-105' : ''
                                }`}
                                style={{
                                  borderColor: rarityColor,
                                  // Parchment/medieval Abyssion slot styling:
                                  // warm dark panel with subtle inner bevel,
                                  // strong readable slot boundaries.
                                  background:
                                    'linear-gradient(160deg, rgba(38,32,22,0.95), rgba(22,19,14,0.95))',
                                  boxShadow: `inset 0 1px 0 rgba(232,213,174,0.12), inset 0 -1px 0 rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.5)`,
                                }}
                              >
                                <Icon size={22} className="sm:w-7 sm:h-7" />
                                {slot.count > 1 && (
                                  <span
                                    className="absolute bottom-0.5 right-0.5 text-[10px] sm:text-xs font-bold text-white rounded-sm px-1 leading-tight border"
                                    style={{ background: 'rgba(0,0,0,0.8)', borderColor: 'rgba(214,138,49,0.5)' }}
                                  >
                                    {slot.count}
                                  </span>
                                )}
                                {def.type === 'consumable' && (
                                  <span className="absolute top-0.5 left-1 text-[8px] text-emerald-400 font-bold leading-tight">
                                    USE
                                  </span>
                                )}
                                {(def.type === 'weapon' || Boolean(def.metadata?.armour)) && (
                                  <span className="absolute top-0.5 left-1 text-[8px] text-amber-400 font-bold leading-tight">
                                    EQUIP
                                  </span>
                                )}
                                {/* Equipped highlight: this item's id occupies a
                                    hotbar slot — unmistakable gold ring. */}
                                {hotbarSlots.includes(def.id) && (
                                  <span
                                    className="absolute inset-0 rounded-md pointer-events-none border-2"
                                    style={{ borderColor: '#d68a31', boxShadow: '0 0 10px rgba(214,138,49,0.55)' }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
          </div>{/* end scrolling content column */}

        </div>{/* end body row */}

        {/* Footer */}
        <div className="p-3 border-t border-gray-800 bg-gray-950 shrink-0 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {occupiedCount} {occupiedCount === 1 ? 'slot' : 'slots'} occupied
          </span>
          <span className="text-xs text-emerald-400 font-semibold">
            {healingCount} healing {healingCount === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none max-w-[240px]"
          style={{
            left: Math.min(tooltip.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 260),
            top: Math.min(tooltip.y + 16, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 120),
          }}
        >
          <div
            className="bg-gray-950 border-2 rounded-lg p-3 shadow-2xl"
            style={{ borderColor: RARITY_COLORS[tooltip.def.rarity] }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {(() => {
                const Icon = getIconComponent(tooltip.def.icon);
                return <Icon size={18} />;
              })()}
              <span className="font-bold text-sm text-white">{tooltip.def.name}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={{
                  color: RARITY_COLORS[tooltip.def.rarity],
                  backgroundColor: RARITY_COLORS[tooltip.def.rarity] + '20',
                }}
              >
                {tooltip.def.rarity}
              </span>
              <span className="text-[10px] text-gray-500 uppercase">{tooltip.def.type}</span>
              {tooltip.def.value > 0 && (
                <span className="text-[10px] text-amber-400 font-semibold">{tooltip.def.value}g</span>
              )}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{tooltip.def.description}</p>
          </div>
        </div>
      )}

      {/* Split Stack Modal */}
      {splitState && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSplitState(null);
          }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 sm:p-6 shadow-2xl w-full max-w-xs scale-100 opacity-100 transition-all duration-200">
            {(() => {
              const slot = player.inventory.categories[splitState.cat]?.[splitState.index];
              if (!slot) return null;
              const def = getItem(slot.itemId);
              if (!def) return null;
              const Icon = getIconComponent(def.icon);
              const max = slot.count - 1;
              return (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Icon size={20} />
                    <h3 className="text-lg font-bold text-white">Split {def.name}</h3>
                  </div>
                  <div className="flex items-baseline justify-center gap-1 mb-4">
                    <span className="text-3xl font-bold text-white">{splitAmount}</span>
                    <span className="text-gray-500 text-lg">/ {slot.count}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={max}
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(Number(e.target.value))}
                    className="w-full mb-3 accent-blue-500"
                  />
                  <div className="flex justify-between mb-4">
                    <button
                      onClick={() => setSplitAmount(1)}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      One
                    </button>
                    <button
                      onClick={handleSplitHalf}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Half
                    </button>
                    <button
                      onClick={() => setSplitAmount(max)}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      All but one
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setSplitState(null)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSplitConfirm}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors"
                    >
                      Split
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
