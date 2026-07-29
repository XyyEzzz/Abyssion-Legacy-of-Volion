import { create } from 'zustand';
import * as THREE from 'three';
import { Quest, INITIAL_QUESTS, NPCS_DATA, NpcType } from './questData';

export interface EnemyTarget {
  id: string;
  getPosition: () => THREE.Vector3;
  takeDamage: (damage: number, sourcePos: THREE.Vector3, comboStage: number) => void;
}

export const enemyTargets = new Map<string, EnemyTarget>();

export function registerEnemyTarget(target: EnemyTarget) {
  enemyTargets.set(target.id, target);
}

export function unregisterEnemyTarget(id: string) {
  enemyTargets.delete(id);
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
    inventory: { name: string; type: string; count: number }[];
    invincible: boolean;
    isDodging: boolean;
    isAttacking: boolean;
    comboStage: number;
    attackCooldown: boolean;
    slowFactor?: number;
    lastDamageTime: number;
    lastStaminaTime: number;
    lastCombatTime: number;
    inCombat: boolean;
    checkpointPos: [number, number, number];
    itemCooldownUntil: number;
  };
  quests: Quest[];
  completedQuestIds: string[];
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
  } | null;
  boss: {
    name: string;
    health: number;
    maxHealth: number;
    active: boolean;
  } | null;
  damageNumbers: DamageNumber[];
  hitSparks: HitSpark[];
  cameraShakeRequest: { intensity: number; id: number } | null;
  hitStopMsRequest: { durationMs: number; id: number } | null;
  lootDrops: LootItem[];
  notifications: Notification[];
  settings: {
    resolution: string;
    fps: number;
    shadows: boolean;
  };
  ui: {
    showSettings: boolean;
    showQuestLog: boolean;
    interactPrompt: string | null;
    deathOverlay: boolean;
  };
  inputs: {
    jump: boolean;
    attack: boolean;
    dodge: boolean;
    joystick: { x: number; y: number };
    cameraAngle: number;
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
  setSettings: (settings: Partial<GameState['settings']>) => void;
  setShowSettings: (show: boolean) => void;
  setShowQuestLog: (show: boolean) => void;
  setInteractPrompt: (prompt: string | null) => void;
  setInputs: (inputs: Partial<GameState['inputs']>) => void;
  addDamageNumber: (x: number, y: number, z: number, text: string, color?: string) => void;
  removeDamageNumber: (id: string) => void;
  addHitSpark: (x: number, y: number, z: number, color?: string) => void;
  removeHitSpark: (id: string) => void;
  triggerCameraShake: (intensity: number) => void;
  triggerHitStop: (durationMs?: number) => void;
  addLootDrop: (loot: Omit<LootItem, 'id'>) => void;
  collectLootDrop: (id: string) => void;
  addNotification: (text: string) => void;
  addExp: (amount: number) => void;
  openDialogueForNpc: (npcId: string) => void;
  advanceDialogue: () => void;
  closeDialogue: () => void;
  acceptQuest: (questId: string) => void;
  completeQuest: (questId: string) => void;
  onEnemyKilled: (enemyName: string) => void;
  checkItemObjectives: () => void;
  checkLocationObjectives: (pos: [number, number, number]) => void;
  setBossState: (boss: GameState['boss']) => void;
  respawnPlayer: () => void;
  activateCheckpoint: (pos: [number, number, number]) => void;
  useConsumableItem: (requestedItemName?: string) => boolean;
  tickRegenerationAndCombat: (delta: number) => void;
  recordStaminaUse: () => void;
  saveGame: () => void;
  loadGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
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
    inventory: [
      { name: 'Wooden Sword', type: 'weapon', count: 1 },
      { name: 'Health Potion', type: 'consumable', count: 3 },
      { name: 'Apple', type: 'consumable', count: 2 },
    ],
    invincible: false,
    isDodging: false,
    isAttacking: false,
    comboStage: 0,
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
  npcMemory: {},
  activeDialogue: null,
  boss: null,
  damageNumbers: [],
  hitSparks: [],
  cameraShakeRequest: null,
  hitStopMsRequest: null,
  lootDrops: [],
  notifications: [],
  settings: {
    resolution: '1080p',
    fps: 60,
    shadows: true,
  },
  ui: {
    showSettings: false,
    showQuestLog: false,
    interactPrompt: null,
    deathOverlay: false,
  },
  inputs: {
    jump: false,
    attack: false,
    dodge: false,
    joystick: { x: 0, y: 0 },
    cameraAngle: 0,
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
    const { player, ui } = get();
    if (player.invincible || player.isDodging || ui.deathOverlay || player.health <= 0) return false;

    const newHealth = Math.max(0, player.health - amount);
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

    // Grant 0.6s i-frames
    setTimeout(() => {
      set((state) => ({ player: { ...state.player, invincible: false } }));
    }, 600);

    // Spawn damage number over player
    const pos = player.position;
    get().addDamageNumber(pos[0], pos[1] + 1.8, pos[2], `-${amount}`, '#ef4444');
    get().triggerCameraShake(0.5);

    // Handle Death
    if (newHealth <= 0) {
      set((state) => ({ ui: { ...state.ui, deathOverlay: true } }));
      setTimeout(() => {
        get().respawnPlayer();
      }, 2000);
    }

    return true;
  },

  recordStaminaUse: () => {
    set((state) => ({
      player: { ...state.player, lastStaminaTime: Date.now() }
    }));
  },

  applyPlayerSlow: (durationMs: number, slowFactor = 0.5) => {
    set((state) => ({ player: { ...state.player, slowFactor } }));
    setTimeout(() => {
      set((state) => ({ player: { ...state.player, slowFactor: 1.0 } }));
    }, durationMs);
  },

  setPlayerStamina: (stamina) => set((state) => ({ player: { ...state.player, stamina: Math.max(0, Math.min(state.player.maxStamina, stamina)) } })),
  
  setPlayerPosition: (position) => set((state) => ({ player: { ...state.player, position } })),
  
  setPlayerInvincible: (invincible) => set((state) => ({ player: { ...state.player, invincible } })),

  triggerPlayerDodge: () => {
    const { player } = get();
    if (player.isDodging || player.stamina < 20) return false;

    const now = Date.now();
    set((state) => ({
      player: {
        ...state.player,
        stamina: state.player.stamina - 20,
        isDodging: true,
        invincible: true,
        lastStaminaTime: now,
      }
    }));

    setTimeout(() => {
      set((state) => ({
        player: {
          ...state.player,
          isDodging: false,
          invincible: false,
        }
      }));
    }, 350);

    return true;
  },

  triggerPlayerAttack: () => {
    const { player } = get();
    if (player.attackCooldown) return 0;

    const now = Date.now();
    let nextCombo = (player.comboStage % 3) + 1;
    set((state) => ({
      player: {
        ...state.player,
        isAttacking: true,
        comboStage: nextCombo,
        attackCooldown: true,
        lastCombatTime: now,
        inCombat: true,
      }
    }));

    // Reset attacking state and set cooldown
    setTimeout(() => {
      set((state) => ({ player: { ...state.player, isAttacking: false } }));
    }, 250);

    setTimeout(() => {
      set((state) => ({ player: { ...state.player, attackCooldown: false } }));
    }, 350);

    // Reset combo if no attack within 1.2s
    setTimeout(() => {
      const current = get().player;
      if (!current.isAttacking) {
        set((state) => ({ player: { ...state.player, comboStage: 0 } }));
      }
    }, 1200);

    return nextCombo;
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
      const hpGain = Math.round(player.maxHealth * 0.2); // +20% Max HP
      const stamGain = Math.round(player.maxStamina * 0.3); // +30% Max Stamina
      updatedHealth = Math.min(player.maxHealth, updatedHealth + hpGain);
      updatedStamina = Math.min(player.maxStamina, updatedStamina + stamGain);
      get().addNotification('Combat Ended! Recovered +20% HP & +30% Stamina');
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
      get().addNotification(`Healing Item on Cooldown (${remainingSec}s)`);
      return false;
    }

    const priorityList = ['Health Potion', 'Small Potion', 'Bread', 'Apple'];
    let targetName = requestedItemName;

    if (!targetName) {
      for (const name of priorityList) {
        if (player.inventory.some(i => i.name === name && i.count > 0)) {
          targetName = name;
          break;
        }
      }
    }

    if (!targetName) {
      get().addNotification('No Healing Items in Inventory!');
      return false;
    }

    const itemInInv = player.inventory.find(i => i.name === targetName && i.count > 0);
    if (!itemInInv) {
      get().addNotification(`No ${targetName} left!`);
      return false;
    }

    if (player.health >= player.maxHealth) {
      get().addNotification('Health is already full!');
      return false;
    }

    let healAmount = 25;
    if (targetName === 'Health Potion') healAmount = 40;
    if (targetName === 'Small Potion') healAmount = 25;
    if (targetName === 'Bread') healAmount = 20;
    if (targetName === 'Apple') healAmount = 15;

    const newHealth = Math.min(player.maxHealth, player.health + healAmount);

    const updatedInv = player.inventory
      .map(i => i.name === targetName ? { ...i, count: i.count - 1 } : i)
      .filter(i => i.count > 0);

    set((state) => ({
      player: {
        ...state.player,
        health: newHealth,
        inventory: updatedInv,
        itemCooldownUntil: now + 10000, // 10 second cooldown
      }
    }));

    get().addNotification(`Used ${targetName} (+${healAmount} HP)`);
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
    get().addNotification('Checkpoint Activated! HP & Stamina Restored');
    get().saveGame();
  },

  setSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
  setShowSettings: (show) => set((state) => ({ ui: { ...state.ui, showSettings: show } })),
  setInteractPrompt: (prompt) => set((state) => ({ ui: { ...state.ui, interactPrompt: prompt } })),
  setInputs: (inputs) => set((state) => ({ inputs: { ...state.inputs, ...inputs } })),

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

  addHitSpark: (x, y, z, color = '#facc15') => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      hitSparks: [...state.hitSparks, { id, x, y, z, color, createdAt: Date.now() }]
    }));
    setTimeout(() => {
      get().removeHitSpark(id);
    }, 250);
  },

  removeHitSpark: (id) => {
    set((state) => ({
      hitSparks: state.hitSparks.filter(h => h.id !== id)
    }));
  },

  triggerCameraShake: (intensity) => {
    set({ cameraShakeRequest: { intensity, id: Date.now() + Math.random() } });
  },

  triggerHitStop: (durationMs = 50) => {
    set({ hitStopMsRequest: { durationMs, id: Date.now() + Math.random() } });
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
      const existing = player.inventory.find(i => i.name === item.name);
      let updatedInv;
      if (existing) {
        updatedInv = player.inventory.map(i => i.name === item.name ? { ...i, count: i.count + item.amount } : i);
      } else {
        updatedInv = [...player.inventory, { name: item.name, type: item.type, count: item.amount }];
      }
      set((state) => ({
        player: { ...state.player, inventory: updatedInv },
        lootDrops: state.lootDrops.filter(l => l.id !== id)
      }));
      get().addNotification(`Picked up ${item.name} (x${item.amount})`);
    }
    get().checkItemObjectives();
  },

  setShowQuestLog: (show) => set((state) => ({ ui: { ...state.ui, showQuestLog: show } })),

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
      get().addNotification(`🎉 LEVEL UP! Reached Level ${level}! Stats Boosted!`);
      const pos = player.position;
      get().addDamageNumber(pos[0], pos[1] + 2.5, pos[2], `LEVEL UP ${level}!`, '#f59e0b');
    }
  },

  openDialogueForNpc: (npcId) => {
    console.log(`[store.openDialogueForNpc] called with npcId:`, npcId);
    const npc = NPCS_DATA.find((n) => n.id === npcId);
    if (!npc) {
      console.log(`[store.openDialogueForNpc] NPC NOT FOUND for npcId:`, npcId);
      return;
    }

    const { quests, completedQuestIds } = get();
    let pages: string[] = [];
    let questToOffer: Quest | undefined = undefined;
    let questToTurnIn: Quest | undefined = undefined;

    if (npc.questId) {
      const quest = quests.find((q) => q.id === npc.questId);
      if (quest) {
        if (quest.status === 'unaccepted') {
          const prereqMet = !quest.prerequisiteQuestId || completedQuestIds.includes(quest.prerequisiteQuestId);
          if (prereqMet) {
            pages = npc.dialogue.questOffer.dialogue;
            questToOffer = quest;
          } else {
            pages = [
              ...npc.dialogue.greeting,
              'I have an important request, but you should finish your current tasks first.',
            ];
          }
        } else if (quest.status === 'active') {
          const allDone = quest.objectives.every((o) => o.currentAmount >= o.requiredAmount);
          if (allDone) {
            pages = npc.dialogue.questTurnIn;
            questToTurnIn = quest;
          } else {
            pages = npc.dialogue.questInProgress;
          }
        } else if (quest.status === 'ready_to_turn_in') {
          pages = npc.dialogue.questTurnIn;
          questToTurnIn = quest;
        } else if (quest.status === 'completed') {
          pages = npc.dialogue.questCompleted;
        }
      }
    }

    if (pages.length === 0) {
      pages = [...npc.dialogue.greeting, ...npc.dialogue.randomPool];
    }

    const newDialogue = {
      npcId: npc.id,
      npcName: npc.name,
      npcRole: npc.role,
      npcType: npc.type,
      pages,
      currentPage: 0,
      questToOffer,
      questToTurnIn,
    };

    console.log(`[store.openDialogueForNpc] setting activeDialogue state to:`, newDialogue);

    const nowStr = new Date().toLocaleTimeString();
    set((state) => ({
      activeDialogue: newDialogue,
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

    get().addNotification(`📜 Quest Accepted: ${quest.title}`);
    get().checkItemObjectives();
  },

  completeQuest: (questId) => {
    const { quests, player, completedQuestIds } = get();
    const quest = quests.find((q) => q.id === questId);
    if (!quest || quest.status === 'completed') return;

    const updatedQuests = quests.map((q) => (q.id === questId ? { ...q, status: 'completed' as const } : q));

    let updatedGold = player.gold + quest.rewards.coins;
    let updatedInventory = [...player.inventory];

    if (quest.rewards.items) {
      for (const rewardItem of quest.rewards.items) {
        const existing = updatedInventory.find((i) => i.name === rewardItem.name);
        if (existing) {
          updatedInventory = updatedInventory.map((i) =>
            i.name === rewardItem.name ? { ...i, count: i.count + rewardItem.count } : i
          );
        } else {
          updatedInventory.push({ name: rewardItem.name, type: rewardItem.type, count: rewardItem.count });
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
        inventory: updatedInventory,
      },
      activeDialogue: null,
    }));

    get().addExp(quest.rewards.exp);
    get().addNotification(`🏆 Quest Complete: ${quest.title}! Received Rewards!`);
    get().saveGame();
  },

  onEnemyKilled: (enemyName) => {
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
          get().addNotification(`✨ Quest Ready to Turn In: ${quest.title}! Return to Giver.`);
        }
        return { ...quest, objectives: updatedObjectives, status: nextStatus };
      }

      return quest;
    });

    if (changed) {
      set({ quests: updatedQuests });
    }
  },

  checkItemObjectives: () => {
    const { quests, player } = get();
    let changed = false;

    const updatedQuests = quests.map((quest) => {
      if (quest.status !== 'active') return quest;

      let questUpdated = false;
      const updatedObjectives = quest.objectives.map((obj) => {
        if (obj.type === 'collect') {
          const invItem = player.inventory.find((i) => i.name.toLowerCase() === obj.target.toLowerCase());
          const count = invItem ? invItem.count : 0;
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
          get().addNotification(`✨ Quest Ready to Turn In: ${quest.title}! Return to Giver.`);
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
          get().addNotification(`✨ Quest Ready to Turn In: ${quest.title}! Return to Giver.`);
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
    set((state) => ({
      player: {
        ...state.player,
        health: state.player.maxHealth,
        stamina: state.player.maxStamina,
        position: state.player.checkpointPos || [0, 1, 0],
        invincible: false,
        isDodging: false,
        isAttacking: false,
        inCombat: false,
      },
      ui: {
        ...state.ui,
        deathOverlay: false,
      }
    }));
    get().addNotification('Respawned at Checkpoint');
  },

  saveGame: () => {
    const state = get();
    const saveData = {
      player: state.player,
      settings: state.settings,
    };
    localStorage.setItem('abyssion_save', JSON.stringify(saveData));
    console.log('Game Saved', saveData);
  },

  loadGame: () => {
    const saved = localStorage.getItem('abyssion_save');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        set((state) => ({
          player: { ...state.player, ...parsed.player },
          settings: { ...state.settings, ...parsed.settings },
        }));
        console.log('Game Loaded', parsed);
      } catch (e) {
        console.error('Failed to load save', e);
      }
    }
  }
}));

