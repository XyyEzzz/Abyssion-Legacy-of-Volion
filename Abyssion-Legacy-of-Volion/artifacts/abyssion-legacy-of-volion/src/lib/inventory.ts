import { getItem, getItemByName, ItemDef, ItemRarity, ItemType } from './items';

export interface InventorySlot {
  id: string;
  itemId: string;
  count: number;
}

export interface InventoryState {
  categories: Record<ItemType, InventorySlot[]>;
}

export type SortMode = 'name' | 'rarity' | 'type';
export type CategoryKey = ItemType;

const ALL_CATEGORIES: ItemType[] = ['weapon', 'consumable', 'material', 'equipment', 'key'];

const RARITY_ORDER: Record<ItemRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
};

export function createInventory(): InventoryState {
  return {
    categories: {
      weapon: [],
      consumable: [],
      material: [],
      equipment: [],
      key: [],
    },
  };
}

let slotIdCounter = 0;
function generateSlotId(): string {
  slotIdCounter += 1;
  return `slot_${slotIdCounter}_${Math.random().toString(36).substring(2, 7)}`;
}

function categoryOf(def: ItemDef): ItemType {
  return def.type;
}

export function getItemCount(inv: InventoryState, itemId: string): number {
  const def = getItem(itemId);
  if (!def) return 0;
  const cat = def.type;
  return (inv.categories[cat] ?? []).reduce((sum, slot) => {
    if (slot.itemId === itemId) return sum + slot.count;
    return sum;
  }, 0);
}

export function getItemCountByName(inv: InventoryState, name: string): number {
  const def = getItemByName(name);
  if (!def) return 0;
  return getItemCount(inv, def.id);
}

export function hasItem(inv: InventoryState, itemId: string, count = 1): boolean {
  return getItemCount(inv, itemId) >= count;
}

export function getOccupiedSlots(inv: InventoryState): number {
  return ALL_CATEGORIES.reduce(
    (sum, cat) => sum + (inv.categories[cat]?.length ?? 0),
    0
  );
}

export function getOccupiedSlotsByCategory(inv: InventoryState, cat: ItemType): number {
  return inv.categories[cat]?.length ?? 0;
}

export function getActiveCategories(inv: InventoryState): ItemType[] {
  return ALL_CATEGORIES.filter((cat) => (inv.categories[cat]?.length ?? 0) > 0);
}

export function addItem(inv: InventoryState, itemId: string, count: number): { inv: InventoryState; added: number } {
  const def = getItem(itemId);
  if (!def || count <= 0) return { inv, added: 0 };

  const cat = categoryOf(def);
  const maxStack = def.maxStack;
  const slots = [...(inv.categories[cat] ?? [])];
  let remaining = count;

  // Unique weapons (maxStack 1) may be owned at most once — a second copy
  // is rejected fail-closed rather than silently stacked.
  if (maxStack <= 1) {
    if (slots.some((s) => s.itemId === itemId)) return { inv, added: 0 };
    if (remaining > 1) remaining = 1;
  }

  // Deterministic stacking (rapi): fill existing stacks first (in order),
  // then create new stacks adjacent to the existing group.
  if (maxStack > 1) {
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      const slot = slots[i];
      if (slot.itemId === itemId && slot.count < maxStack) {
        const canAdd = Math.min(maxStack - slot.count, remaining);
        slots[i] = { ...slot, count: slot.count + canAdd };
        remaining -= canAdd;
      }
    }
  }

  if (remaining > 0) {
    // Place new stacks immediately after the last stack of the same item
    // (grouped), or at the end when the item is not yet present.
    let insertAt = slots.length;
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].itemId === itemId) { insertAt = i + 1; break; }
    }
    const newStacks: InventorySlot[] = [];
    while (remaining > 0) {
      const canAdd = Math.min(maxStack, remaining);
      newStacks.push({ id: generateSlotId(), itemId, count: canAdd });
      remaining -= canAdd;
    }
    slots.splice(insertAt, 0, ...newStacks);
  }

  return {
    inv: { categories: { ...inv.categories, [cat]: slots } },
    added: count - remaining,
  };
}

export function removeItem(inv: InventoryState, itemId: string, count: number): { inv: InventoryState; removed: number } {
  const def = getItem(itemId);
  if (count <= 0 || !def) return { inv, removed: 0 };
  if (getItemCount(inv, itemId) < count) return { inv, removed: 0 };

  const cat = categoryOf(def);
  const slots = [...(inv.categories[cat] ?? [])];
  let remaining = count;

  for (let i = 0; i < slots.length && remaining > 0; i++) {
    const slot = slots[i];
    if (slot.itemId === itemId) {
      const toRemove = Math.min(slot.count, remaining);
      const newCount = slot.count - toRemove;
      if (newCount === 0) {
        slots.splice(i, 1);
        i -= 1;
      } else {
        slots[i] = { ...slot, count: newCount };
      }
      remaining -= toRemove;
    }
  }

  return {
    inv: { categories: { ...inv.categories, [cat]: slots } },
    removed: count - remaining,
  };
}

export function moveItemWithinCategory(inv: InventoryState, cat: ItemType, fromIndex: number, toIndex: number): InventoryState {
  const slots = [...(inv.categories[cat] ?? [])];
  if (fromIndex < 0 || fromIndex >= slots.length || toIndex < 0 || toIndex >= slots.length) return inv;
  if (fromIndex === toIndex) return inv;

  const from = slots[fromIndex];
  const to = slots[toIndex];
  if (!from) return inv;

  if (to && to.itemId === from.itemId) {
    const def = getItem(from.itemId);
    const maxStack = def ? def.maxStack : 1;
    if (maxStack > 1) {
      const canMove = Math.min(maxStack - to.count, from.count);
      if (canMove <= 0) return inv;
      slots[toIndex] = { ...to, count: to.count + canMove };
      const newFromCount = from.count - canMove;
      if (newFromCount === 0) {
        slots.splice(fromIndex, 1);
      } else {
        slots[fromIndex] = { ...from, count: newFromCount };
      }
      return { categories: { ...inv.categories, [cat]: slots } };
    }
  }

  const tmp = slots[fromIndex];
  slots[fromIndex] = slots[toIndex];
  slots[toIndex] = tmp;
  return { categories: { ...inv.categories, [cat]: slots } };
}

export function swapItem(inv: InventoryState, cat: ItemType, fromIndex: number, toIndex: number): InventoryState {
  return moveItemWithinCategory(inv, cat, fromIndex, toIndex);
}

export function splitStack(inv: InventoryState, cat: ItemType, index: number, amount: number): { inv: InventoryState; success: boolean } {
  const slots = [...(inv.categories[cat] ?? [])];
  if (index < 0 || index >= slots.length) return { inv, success: false };

  const slot = slots[index];
  if (!slot || amount <= 0 || amount >= slot.count) return { inv, success: false };

  const def = getItem(slot.itemId);
  if (!def) return { inv, success: false };

  slots[index] = { ...slot, count: slot.count - amount };
  slots.push({ id: generateSlotId(), itemId: slot.itemId, count: amount });
  return { inv: { categories: { ...inv.categories, [cat]: slots } }, success: true };
}

export function mergeStack(inv: InventoryState, cat: ItemType, fromIndex: number, toIndex: number): InventoryState {
  if (fromIndex === toIndex) return inv;
  const slots = [...(inv.categories[cat] ?? [])];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= slots.length || toIndex >= slots.length) return inv;

  const from = slots[fromIndex];
  const to = slots[toIndex];
  if (!from || !to || from.itemId !== to.itemId) return inv;

  const def = getItem(from.itemId);
  if (!def || def.maxStack <= 1) return inv;

  const total = from.count + to.count;
  if (total <= def.maxStack) {
    slots[toIndex] = { ...to, count: total };
    slots.splice(fromIndex, 1);
    return { categories: { ...inv.categories, [cat]: slots } };
  }

  return inv;
}

export function clear(inv: InventoryState): InventoryState {
  return createInventory();
}

export function addItemByName(inv: InventoryState, name: string, count: number): { inv: InventoryState; added: number } {
  const def = getItemByName(name);
  if (!def) return { inv, added: 0 };
  return addItem(inv, def.id, count);
}

export function removeItemByName(inv: InventoryState, name: string, count: number): { inv: InventoryState; removed: number } {
  const def = getItemByName(name);
  if (!def) return { inv, removed: 0 };
  return removeItem(inv, def.id, count);
}

export function sortCategory(inv: InventoryState, cat: ItemType, mode: SortMode): InventoryState {
  const slots = [...(inv.categories[cat] ?? [])];
  if (slots.length <= 1) return inv;

  slots.sort((a, b) => {
    const defA = getItem(a.itemId);
    const defB = getItem(b.itemId);
    if (!defA || !defB) return 0;

    if (mode === 'name') return defA.name.localeCompare(defB.name);
    if (mode === 'rarity') {
      const r = RARITY_ORDER[defA.rarity] - RARITY_ORDER[defB.rarity];
      return r !== 0 ? r : defA.name.localeCompare(defB.name);
    }
    return 0;
  });

  return { categories: { ...inv.categories, [cat]: slots } };
}

export function sortAllCategories(inv: InventoryState, mode: SortMode): InventoryState {
  let result = inv;
  for (const cat of ALL_CATEGORIES) {
    result = sortCategory(result, cat, mode);
  }
  return result;
}

export interface CategoryDisplaySlot {
  slot: InventorySlot;
  index: number;
  def: ItemDef;
}

export function getCategoryDisplaySlots(
  inv: InventoryState,
  cat: ItemType,
  search: string,
  sort: SortMode
): CategoryDisplaySlot[] {
  const rawSlots = inv.categories[cat] ?? [];
  const query = search.trim().toLowerCase();

  const results: CategoryDisplaySlot[] = [];
  for (let i = 0; i < rawSlots.length; i++) {
    const slot = rawSlots[i];
    const def = getItem(slot.itemId);
    if (!def) continue;
    if (query && !def.name.toLowerCase().includes(query) && !def.description.toLowerCase().includes(query)) continue;
    results.push({ slot, index: i, def });
  }

  if (sort && results.length > 1) {
    results.sort((a, b) => {
      if (sort === 'name') return a.def.name.localeCompare(b.def.name);
      if (sort === 'rarity') {
        const r = RARITY_ORDER[a.def.rarity] - RARITY_ORDER[b.def.rarity];
        return r !== 0 ? r : a.def.name.localeCompare(b.def.name);
      }
      return 0;
    });
  }

  return results;
}

export const CATEGORY_META: Record<ItemType, { label: string; icon: string }> = {
  weapon: { label: 'Weapons', icon: 'Sword' },
  consumable: { label: 'Consumables', icon: 'FlaskConical' },
  material: { label: 'Materials', icon: 'Gem' },
  equipment: { label: 'Equipment', icon: 'Shield' },
  key: { label: 'Quest', icon: 'Key' },
};
