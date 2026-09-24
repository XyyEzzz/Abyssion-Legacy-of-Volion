export type ItemType = 'weapon' | 'consumable' | 'material' | 'equipment' | 'key';

/** Weapon/Core category as used by the hotbar and progression systems. */
export type WeaponCategory = 'sword' | 'gun' | 'core' | 'dagger' | 'staff';

/** Armour equipment slots (four-piece armour system). */
export type ArmourSlot = 'helmet' | 'chest' | 'leggings' | 'boots';

/** Authoritative armour slot of an item id (metadata.armourSlot wins; the
 *  legacy leather cuirass defaults to chest). */
export function armourSlotOf(itemId: string | null): ArmourSlot | null {
  if (!itemId) return null;
  const def = getItem(itemId);
  if (!def?.metadata?.armour) return null;
  const slot = def.metadata.armourSlot;
  if (slot === 'helmet' || slot === 'chest' || slot === 'leggings' || slot === 'boots') return slot;
  return 'chest';
}

/** Category of a weapon/Core item id (authoritative mapping). */
export function weaponCategoryOf(itemId: string | null): WeaponCategory | null {
  switch (itemId) {
    case 'iron_sword':
    case 'wooden_sword':
      return 'sword';
    case 'dual_dagger':
      return 'dagger';
    case 'm1887':
    case 'crossbow':
      return 'gun';
    case 'resonance_core':
      return 'core';
    case 'water_staff':
      return 'staff';
    default:
      return null;
  }
}

/** Display classification for the inventory's Ranged grouping: guns and the
 *  Water Staff. Combat classification stays authoritative in
 *  weaponCategoryOf — the staff keeps its own 'staff' category so the mage
 *  spell path and the M1887 gun path remain distinct. */
export function isRangedCategory(itemId: string | null): boolean {
  const wc = weaponCategoryOf(itemId);
  return wc === 'gun' || wc === 'staff';
}

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  icon: string;
  type: ItemType;
  maxStack: number;
  value: number;
  metadata?: Record<string, unknown>;
}

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

const ITEMS: Record<string, ItemDef> = {
  wooden_sword: {
    id: 'wooden_sword',
    name: 'Wooden Sword',
    description: 'A basic training sword. Better than nothing.',
    rarity: 'common',
    icon: 'Sword',
    type: 'weapon',
    maxStack: 1,
    value: 10,
  },
  iron_sword: {
    id: 'iron_sword',
    name: 'Iron Sword',
    description: 'A sturdy iron blade forged by a master blacksmith.',
    rarity: 'uncommon',
    icon: 'Sword',
    type: 'weapon',
    maxStack: 1,
    value: 80,
  },
  health_potion: {
    id: 'health_potion',
    name: 'Health Potion',
    description: 'Restores 40 HP. A staple for any adventurer.',
    rarity: 'uncommon',
    icon: 'FlaskConical',
    type: 'consumable',
    maxStack: 256,
    value: 30,
    metadata: { healAmount: 40 },
  },
  small_potion: {
    id: 'small_potion',
    name: 'Small Potion',
    description: 'Restores 25 HP. A cheaper alternative for minor wounds.',
    rarity: 'common',
    icon: 'FlaskRound',
    type: 'consumable',
    maxStack: 256,
    value: 15,
    metadata: { healAmount: 25 },
  },
  bread: {
    id: 'bread',
    name: 'Bread',
    description: 'Restores 20 HP. Simple but filling.',
    rarity: 'common',
    icon: 'Wheat',
    type: 'consumable',
    maxStack: 256,
    value: 5,
    metadata: { healAmount: 20 },
  },
  apple: {
    id: 'apple',
    name: 'Apple',
    description: 'Restores 15 HP. A quick snack from the orchard.',
    rarity: 'common',
    icon: 'Apple',
    type: 'consumable',
    maxStack: 256,
    value: 3,
    metadata: { healAmount: 15 },
  },
  iron_ore: {
    id: 'iron_ore',
    name: 'Iron Ore',
    description: 'Raw iron recovered from bandit gear. Used for forging.',
    rarity: 'uncommon',
    icon: 'Gem',
    type: 'material',
    maxStack: 256,
    value: 20,
  },
  arcane_shard: {
    id: 'arcane_shard',
    name: 'Arcane Shard',
    description: 'A fragment of crystallized magic energy.',
    rarity: 'rare',
    icon: 'Sparkles',
    type: 'material',
    maxStack: 256,
    value: 50,
  },
  water_staff: {
    id: 'water_staff',
    name: 'Water Staff',
    description: 'A runed staff that channels water magic. Ranged, precise, patient.',
    rarity: 'uncommon',
    icon: 'Wand2',
    type: 'weapon',
    maxStack: 1,
    value: 75,
  },
  dual_dagger: {
    id: 'dual_dagger',
    name: 'Dual Daggers',
    description: 'A matched pair of quick blades. Blued steel in the left hand, bright in the right.',
    rarity: 'uncommon',
    icon: 'Swords',
    type: 'weapon',
    maxStack: 1,
    value: 60,
  },
  // ── Marcus Shop Food Items ───────────────────────────────────
  crispy_chicken: {
    id: 'crispy_chicken',
    name: 'Crispy Chicken',
    description: 'Golden fried chicken with a crunchy coating. Heals 30 HP.',
    rarity: 'common',
    icon: 'UtensilsCrossed',
    type: 'consumable',
    maxStack: 256,
    value: 12,
    metadata: { healAmount: 30 },
  },
  chicken_steak: {
    id: 'chicken_steak',
    name: 'Chicken Steak',
    description: 'Juicy grilled chicken breast. Heals 35 HP.',
    rarity: 'common',
    icon: 'UtensilsCrossed',
    type: 'consumable',
    maxStack: 256,
    value: 15,
    metadata: { healAmount: 35 },
  },
  beef_steak: {
    id: 'beef_steak',
    name: 'Beef Steak',
    description: 'A thick, sizzling beef steak. Heals 50 HP.',
    rarity: 'uncommon',
    icon: 'UtensilsCrossed',
    type: 'consumable',
    maxStack: 256,
    value: 22,
    metadata: { healAmount: 50 },
  },
  chicken_katsu: {
    id: 'chicken_katsu',
    name: 'Chicken Katsu',
    description: 'Crispy breaded chicken cutlet. Heals 40 HP.',
    rarity: 'common',
    icon: 'UtensilsCrossed',
    type: 'consumable',
    maxStack: 256,
    value: 18,
    metadata: { healAmount: 40 },
  },
  kebab: {
    id: 'kebab',
    name: 'Kebab',
    description: 'Grilled skewer of seasoned meat. Heals 28 HP.',
    rarity: 'common',
    icon: 'UtensilsCrossed',
    type: 'consumable',
    maxStack: 256,
    value: 10,
    metadata: { healAmount: 28 },
  },
  shawarma: {
    id: 'shawarma',
    name: 'Shawarma',
    description: 'Rolled flatbread with spiced meat and sauce. Heals 32 HP.',
    rarity: 'common',
    icon: 'UtensilsCrossed',
    type: 'consumable',
    maxStack: 256,
    value: 14,
    metadata: { healAmount: 32 },
  },
  m1887: {
    id: 'm1887',
    name: 'M1887',
    description: 'Lever-action shotgun. 2 shells, 8 pellets, devastating up close.',
    rarity: 'rare',
    icon: 'Crosshair',
    type: 'weapon',
    maxStack: 1,
    value: 220,
    metadata: { weaponCategory: 'gun', ammoCapacity: 2 },
  },
  crossbow: {
    id: 'crossbow',
    name: 'Crossbow',
    description: 'A weighted hunting crossbow. 16 arrows per supply, steady 4 arrows per second. Skins: Triplex Lactus / Mimique de Ametralladora.',
    rarity: 'rare',
    icon: 'Target',
    type: 'weapon',
    maxStack: 1,
    value: 200,
    metadata: { weaponCategory: 'gun', ammoCapacity: 16, ranged: true },
  },
  resonance_core: {
    id: 'resonance_core',
    name: 'Resonance Core',
    description: 'A conceptual Abyssal Core attuned to vibration and harmonic frequency.',
    rarity: 'epic',
    icon: 'Orbit',
    type: 'equipment',
    maxStack: 8,
    value: 300,
    metadata: { weaponCategory: 'core', coreType: 'conceptual', coreConcept: 'resonance' },
  },
  thornback_spine: {
    id: 'thornback_spine',
    name: 'Thornback Spine',
    description: 'A barbed spine shed by a Thornback. Prized by crafters.',
    rarity: 'uncommon',
    icon: 'Bone',
    type: 'material',
    maxStack: 64,
    value: 18,
  },
  arrow_bundle: {
    id: 'arrow_bundle',
    name: 'Arrow Bundle',
    description: 'A bundle of 8 crossbow arrows. Restores ammunition when picked up (up to the crossbow capacity).',
    rarity: 'common',
    icon: 'MoveVertical',
    type: 'consumable',
    maxStack: 64,
    value: 10,
    metadata: { arrows: 8 },
  },
  leather_armour: {
    id: 'leather_armour',
    name: 'Leather Armour',
    description: 'Hardened leather cuirass. Reduces incoming damage by 5%.',
    rarity: 'uncommon',
    icon: 'Shield',
    type: 'equipment',
    maxStack: 1,
    value: 90,
    metadata: { armour: true, damageReduction: 0.05, armourSlot: 'chest', bodyRegion: 'torso' },
  },
  iron_helmet: {
    id: 'iron_helmet',
    name: 'Iron Helmet',
    description: 'Forged iron helm. Reduces incoming damage by 2%.',
    rarity: 'uncommon',
    icon: 'HardHat',
    type: 'equipment',
    maxStack: 1,
    value: 60,
    metadata: { armour: true, damageReduction: 0.02, armourSlot: 'helmet', bodyRegion: 'head' },
  },
  iron_leggings: {
    id: 'iron_leggings',
    name: 'Iron Leggings',
    description: 'Plated iron greaves. Reduces incoming damage by 3%.',
    rarity: 'uncommon',
    icon: 'Footprints',
    type: 'equipment',
    maxStack: 1,
    value: 70,
    metadata: { armour: true, damageReduction: 0.03, armourSlot: 'leggings', bodyRegion: 'legs' },
  },
  iron_boots: {
    id: 'iron_boots',
    name: 'Iron Boots',
    description: 'Heavy reinforced boots. Reduces incoming damage by 2%.',
    rarity: 'uncommon',
    icon: 'Footprints',
    type: 'equipment',
    maxStack: 1,
    value: 55,
    metadata: { armour: true, damageReduction: 0.02, armourSlot: 'boots', bodyRegion: 'feet' },
  },
};

const NAME_TO_ID: Record<string, string> = Object.values(ITEMS).reduce(
  (acc, item) => {
    acc[item.name.toLowerCase()] = item.id;
    return acc;
  },
  {} as Record<string, string>
);

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}

export function getItemByName(name: string): ItemDef | undefined {
  const id = NAME_TO_ID[name.toLowerCase()];
  return id ? ITEMS[id] : undefined;
}

export function getItemIdByName(name: string): string | undefined {
  return NAME_TO_ID[name.toLowerCase()];
}

export function getAllItems(): ItemDef[] {
  return Object.values(ITEMS);
}
