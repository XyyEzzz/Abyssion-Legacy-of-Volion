export interface Objective {
  id: string;
  type: 'defeat' | 'collect' | 'talk' | 'reach';
  target: string; // Enemy name, Item name, NPC id, or Location Name
  description: string;
  requiredAmount: number;
  currentAmount: number;
  location?: [number, number, number];
}

export interface QuestReward {
  coins: number;
  exp: number;
  items?: { name: string; type: string; count: number }[];
}

export interface Quest {
  id: string;
  title: string;
  type: 'main' | 'side';
  description: string;
  giverNpcId: string;
  prerequisiteQuestId?: string;
  objectives: Objective[];
  rewards: QuestReward;
  status: 'unaccepted' | 'active' | 'ready_to_turn_in' | 'completed';
}

export type NpcType = 'villager' | 'merchant' | 'blacksmith' | 'guard' | 'researcher';

export interface DialogueTree {
  greeting: string[];
  questOffer: {
    dialogue: string[];
    acceptButtonText?: string;
  };
  questInProgress: string[];
  questTurnIn: string[];
  questCompleted: string[];
  randomPool: string[];
}

export interface NPCData {
  id: string;
  name: string;
  role: string;
  type: NpcType;
  position: [number, number, number];
  rotationY?: number;
  questId?: string;
  dialogue: DialogueTree;
}

export const INITIAL_QUESTS: Quest[] = [
  {
    id: 'main_1',
    title: 'Trouble in Haven',
    type: 'main',
    description: 'Bouncy Slimes and Bandits are disturbing the peaceful village of Haven. Defeat them to safeguard the citizens.',
    giverNpcId: 'npc_arthur',
    objectives: [
      {
        id: 'obj_m1_slime',
        type: 'defeat',
        target: 'Bouncy Slime',
        description: 'Defeat Bouncy Slimes',
        requiredAmount: 2,
        currentAmount: 0,
      },
      {
        id: 'obj_m1_bandit',
        type: 'defeat',
        target: 'Bandit Fighter',
        description: 'Defeat Bandit Fighter',
        requiredAmount: 1,
        currentAmount: 0,
      },
    ],
    rewards: {
      coins: 100,
      exp: 150,
      items: [
        { name: 'Health Potion', type: 'consumable', count: 2 },
        { name: 'Apple', type: 'consumable', count: 3 },
      ],
    },
    status: 'unaccepted',
  },
  {
    id: 'main_2',
    title: 'Outpost Patrol',
    type: 'main',
    description: 'Captain Vane needs assistance fortifying the Wilderness Outpost against aggressive Dire Wolves.',
    giverNpcId: 'npc_vane',
    prerequisiteQuestId: 'main_1',
    objectives: [
      {
        id: 'obj_m2_wolf',
        type: 'defeat',
        target: 'Dire Wolf',
        description: 'Defeat Dire Wolves near the woods',
        requiredAmount: 2,
        currentAmount: 0,
      },
      {
        id: 'obj_m2_location',
        type: 'reach',
        target: 'Wilderness Outpost',
        description: 'Scout Wilderness Outpost Checkpoint',
        requiredAmount: 1,
        currentAmount: 0,
        location: [15, 0, -15],
      },
    ],
    rewards: {
      coins: 250,
      exp: 300,
      items: [
        { name: 'Iron Sword', type: 'weapon', count: 1 },
        { name: 'Health Potion', type: 'consumable', count: 3 },
      ],
    },
    status: 'unaccepted',
  },
  {
    id: 'side_merchant',
    title: 'Merchant Restock',
    type: 'side',
    description: 'Merchant Elina needs fresh provisions to keep her market stall supplied with sweet fruit.',
    giverNpcId: 'npc_elina',
    objectives: [
      {
        id: 'obj_s1_apple',
        type: 'collect',
        target: 'Apple',
        description: 'Gather Apples from defeats or inventory',
        requiredAmount: 3,
        currentAmount: 0,
      },
    ],
    rewards: {
      coins: 80,
      exp: 100,
      items: [{ name: 'Small Potion', type: 'consumable', count: 2 }],
    },
    status: 'unaccepted',
  },
  {
    id: 'side_blacksmith',
    title: 'Forging Supplies',
    type: 'side',
    description: 'Garrick the Blacksmith needs materials to repair damaged village weaponry.',
    giverNpcId: 'npc_garrick',
    objectives: [
      {
        id: 'obj_s2_bandit',
        type: 'defeat',
        target: 'Bandit Fighter',
        description: 'Reclaim iron gear by defeating Bandits',
        requiredAmount: 2,
        currentAmount: 0,
      },
    ],
    rewards: {
      coins: 150,
      exp: 200,
      items: [{ name: 'Health Potion', type: 'consumable', count: 3 }],
    },
    status: 'unaccepted',
  },
  {
    id: 'side_researcher',
    title: 'Arcane Anomaly',
    type: 'side',
    description: 'Dr. Lysander is studying magical distrubances near the ancient ruins west of Haven.',
    giverNpcId: 'npc_lysander',
    objectives: [
      {
        id: 'obj_s3_mage',
        type: 'defeat',
        target: 'Arcane Mage',
        description: 'Defeat Arcane Mage conducting rogue magic',
        requiredAmount: 1,
        currentAmount: 0,
      },
      {
        id: 'obj_s3_ruins',
        type: 'reach',
        target: 'Ancient Ruins',
        description: 'Scout the Ancient Ruins monoliths',
        requiredAmount: 1,
        currentAmount: 0,
        location: [-20, 0, -20],
      },
    ],
    rewards: {
      coins: 300,
      exp: 450,
      items: [
        { name: 'Health Potion', type: 'consumable', count: 4 },
        { name: 'Small Potion', type: 'consumable', count: 3 },
      ],
    },
    status: 'unaccepted',
  },
];

export const NPCS_DATA: NPCData[] = [
  {
    id: 'npc_arthur',
    name: 'Elder Arthur',
    role: 'Village Chief',
    type: 'villager',
    position: [0, 1, 2],
    rotationY: Math.PI * 0.8,
    questId: 'main_1',
    dialogue: {
      greeting: [
        'Greetings, brave traveller! Welcome to the village of Haven.',
        'Regrettably, dark forces and rogue creatures have encircled our sanctuary.',
      ],
      questOffer: {
        dialogue: [
          'Wild slimes and ruthless bandits are raiding our supply wagons.',
          'Will you lend us your blade to protect Haven and restore peace?',
        ],
        acceptButtonText: 'Accept Quest: Trouble in Haven',
      },
      questInProgress: [
        'Please be careful out there! Slimes can slow your movement and bandits strike hard.',
        'Come back to me once you have dealt with the threats.',
      ],
      questTurnIn: [
        'Splendid work! The villagers can breathe a sigh of relief.',
        'Here is your reward. May your path remain clear!',
      ],
      questCompleted: [
        'Thank you again for saving Haven! Captain Vane at the outpost may need your aid next.',
      ],
      randomPool: [
        'A strong defense is as important as a sharp sword.',
        'Rest at campfires whenever you need to restore your energy.',
      ],
    },
  },
  {
    id: 'npc_elina',
    name: 'Merchant Elina',
    role: 'Goods Vendor',
    type: 'merchant',
    position: [25, 0, -25],
    rotationY: -Math.PI * 0.4,
    questId: 'side_merchant',
    dialogue: {
      greeting: [
        'Welcome, adventurer! Looking for fine goods or fresh fruit?',
        'Trade has been difficult with monster packs roaming the roads.',
      ],
      questOffer: {
        dialogue: [
          'My supply cart was scattered during a slime attack! I need fresh apples for my market stall.',
          'If you collect 3 apples, I will reward you generously with gold and potions!',
        ],
        acceptButtonText: 'Accept Quest: Merchant Restock',
      },
      questInProgress: [
        'Still searching for apples? You can find them by defeating slimes or checking your pack!',
      ],
      questTurnIn: [
        'Aha! Fresh apples, ripe and sweet! You are a lifesaver!',
        'Take these coins and potions with my sincere gratitude.',
      ],
      questCompleted: [
        'My market stall is back in business! Safe travels, friend.',
      ],
      randomPool: [
        'Always keep a health potion on quick access (Key Q or H)!',
        'Gold spent on good preparations is gold well spent.',
      ],
    },
  },
  {
    id: 'npc_garrick',
    name: 'Garrick',
    role: 'Master Blacksmith',
    type: 'blacksmith',
    position: [-25, 0, 25],
    rotationY: Math.PI * 0.3,
    questId: 'side_blacksmith',
    dialogue: {
      greeting: [
        'Clang! Ah, hello there. Need armor repaired or a sword polished?',
        'The forge runs hot, but steel is running low.',
      ],
      questOffer: {
        dialogue: [
          'Those local bandits stole iron armaments meant for our forge.',
          'Defeat 2 Bandit Fighters and return the stolen materials so I can forge gear!',
        ],
        acceptButtonText: 'Accept Quest: Forging Supplies',
      },
      questInProgress: [
        'Keep your eyes open when fighting bandits! Time your dodges carefully.',
      ],
      questTurnIn: [
        'Ah! Good quality iron, perfect! I can work wonders with this.',
        'Here are your gold coins and health potions. Stay sharp out there!',
      ],
      questCompleted: [
        'My forge is roaring again! Drop by anytime you need weapon advice.',
      ],
      randomPool: [
        'Remember: a 3-hit combo unleashes a heavy critical strike!',
        'Mastering dodge timing keeps you alive against heavy hitters.',
      ],
    },
  },
  {
    id: 'npc_vane',
    name: 'Captain Vane',
    role: 'Outpost Commander',
    type: 'guard',
    position: [25, 0, 25],
    rotationY: -Math.PI * 0.7,
    questId: 'main_2',
    dialogue: {
      greeting: [
        'Halt! State your business at Wilderness Outpost.',
        'Elder Arthur sent word that a capable warrior was heading this way.',
      ],
      questOffer: {
        dialogue: [
          'Dire Wolves are prowling the woods, threatening to overrun our outpost.',
          'Scout the Wilderness Outpost checkpoint and cull 2 Dire Wolves to secure our perimeter!',
        ],
        acceptButtonText: 'Accept Quest: Outpost Patrol',
      },
      questInProgress: [
        'Dire Wolves are fast and strike in quick lunges. Watch their movement pattern!',
      ],
      questTurnIn: [
        'Outstanding bravery! The perimeter is clear and our soldiers are safe.',
        'Take this Iron Sword and gold—you have earned the honor of an Outpost Champion!',
      ],
      questCompleted: [
        'The wilderness line is secure! You have the respect of the entire guard.',
      ],
      randomPool: [
        'Dodge rolling gives you brief invincibility frames.',
        'Keep an eye on your stamina bar when sprinting or dodging.',
      ],
    },
  },
  {
    id: 'npc_lysander',
    name: 'Dr. Lysander',
    role: 'Arcane Scholar',
    type: 'researcher',
    position: [-18, 0, -18],
    rotationY: Math.PI * 0.25,
    questId: 'side_researcher',
    dialogue: {
      greeting: [
        'Fascinating... the ley lines in this ancient ruins site are vibrating wildly.',
        'Greetings! Forgive my distraction; magic is a delicate field of study.',
      ],
      questOffer: {
        dialogue: [
          'Rogue Arcane Mages are casting uncontrolled spells near the Ancient Monoliths.',
          'Defeat 1 Arcane Mage and investigate the Ancient Ruins center to stabilize the magical field!',
        ],
        acceptButtonText: 'Accept Quest: Arcane Anomaly',
      },
      questInProgress: [
        'Arcane Mages cast distant energy orbs. Time your movement to dodge their spells!',
      ],
      questTurnIn: [
        'The magical turbulence has subsided! Magnificent work, adventurer!',
        'Please accept this bounty of gold and potent restorative elixirs.',
      ],
      questCompleted: [
        'The ancient ruins are calm once more. My research can proceed safely!',
      ],
      randomPool: [
        'Magic is both a tool and a force of nature—respect its power.',
        'The ruins hold secrets from ancient eras long forgotten.',
      ],
    },
  },
];
