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

export type NpcType = 'villager' | 'merchant' | 'blacksmith' | 'guard' | 'researcher' | 'healer';

export interface DialogueChoice {
  text: string;
  /** Pages to show after this choice is selected. */
  resultPages: string[];
  /** If set, opens the shop UI after resultPages are shown. */
  openShop?: boolean;
  /** If set, switches the player's combat archetype (NPC class selection). */
  chooseArchetype?: 'fighter' | 'mage';
}

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
  /** Optional choice page shown at the end of a greeting. */
  choices?: DialogueChoice[];
  /** Language-specific overrides for dialogue arrays. Key is language code. */
  localized?: Record<string, {
    greeting?: string[];
    questOffer?: { dialogue: string[]; acceptButtonText?: string };
    questInProgress?: string[];
    questTurnIn?: string[];
    questCompleted?: string[];
    randomPool?: string[];
    choices?: DialogueChoice[];
  }>;
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
        location: [0, 0, -18],
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
    id: 'side_marcus_hunt',
    title: 'Hungry Customers',
    type: 'side',
    description: 'Marcus needs help keeping his shelves stocked. Defeat some bandits who keep stealing his supply shipments.',
    giverNpcId: 'npc_marcus',
    objectives: [
      {
        id: 'obj_sm_bandit',
        type: 'defeat',
        target: 'Bandit Fighter',
        description: 'Defeat Bandit Fighters raiding supply routes',
        requiredAmount: 3,
        currentAmount: 0,
      },
    ],
    rewards: {
      coins: 120,
      exp: 150,
      items: [
        { name: 'Crispy Chicken', type: 'consumable', count: 2 },
        { name: 'Kebab', type: 'consumable', count: 2 },
      ],
    },
    status: 'unaccepted',
  },
  {
    id: 'side_guard_patrol',
    title: 'Slime Infestation',
    type: 'side',
    description: 'The village outskirts are overrun with slimes. Clear them out to keep the paths safe.',
    giverNpcId: 'npc_hektor',
    objectives: [
      {
        id: 'obj_sg_slime',
        type: 'defeat',
        target: 'Bouncy Slime',
        description: 'Defeat Bouncy Slimes near the village',
        requiredAmount: 5,
        currentAmount: 0,
      },
    ],
    rewards: {
      coins: 80,
      exp: 100,
      items: [{ name: 'Bread', type: 'consumable', count: 3 }],
    },
    status: 'unaccepted',
  },
  {
    id: 'side_healer_fewer_wolves',
    title: 'Wounded Patrols',
    type: 'side',
    description: 'The patrol guards keep returning wounded from wolf attacks. Thin the wolf pack.',
    giverNpcId: 'npc_seraphina',
    objectives: [
      {
        id: 'obj_sh_wolf',
        type: 'defeat',
        target: 'Dire Wolf',
        description: 'Defeat Dire Wolves threatening the patrol',
        requiredAmount: 3,
        currentAmount: 0,
      },
    ],
    rewards: {
      coins: 100,
      exp: 120,
      items: [{ name: 'Health Potion', type: 'consumable', count: 3 }],
    },
    status: 'unaccepted',
  },
  {
    id: 'side_mage_mages',
    title: 'Arcane Threat',
    type: 'side',
    description: 'Rogue mages are disrupting the magical wards around Haven. Neutralize them.',
    giverNpcId: 'npc_lysander',
    objectives: [
      {
        id: 'obj_sm_mage',
        type: 'defeat',
        target: 'Arcane Mage',
        description: 'Defeat rogue Arcane Mages',
        requiredAmount: 3,
        currentAmount: 0,
      },
    ],
    rewards: {
      coins: 200,
      exp: 250,
      items: [
        { name: 'Health Potion', type: 'consumable', count: 2 },
        { name: 'Arcane Shard', type: 'material', count: 1 },
      ],
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
];

export const SHOP_ITEMS: { itemId: string; price: number }[] = [
  { itemId: 'crispy_chicken', price: 15 },
  { itemId: 'chicken_steak', price: 20 },
  { itemId: 'beef_steak', price: 30 },
  { itemId: 'chicken_katsu', price: 25 },
  { itemId: 'kebab', price: 12 },
  { itemId: 'shawarma', price: 18 },
];

export const NPCS_DATA: NPCData[] = [
  {
    id: 'npc_arthur',
    name: 'Elder Arthur',
    role: 'Village Chief',
    type: 'villager',
    position: [-1, 0, 3],
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
      localized: {
        id: {
          greeting: [
            'Salam, pelawan! Selamat datang di desa Haven.',
            'Sayangnya, kekuatan gelap dan makhluk pemberontak telah mengelilingi tempat perlindungan kami.',
          ],
          questOffer: {
            dialogue: [
              'Soo yang melompat dan perampang yang kejam merampok gerobak suplai kami.',
              'Maukah Anda meminjamkan pedang Anda untuk melindungi Haven dan mengembalikan kedamaian?',
            ],
            acceptButtonText: 'Terima Misi: Masalah di Haven',
          },
          questInProgress: ['Hati-hati di luar! Soo bisa memperlambat pergerakan Anda dan perampang menyerang dengan keras.', 'Kembali kepada saya setelah Anda menangani ancaman itu.'],
          questTurnIn: ['Kerja luar biasa! Penduduk desa bisa bernapas lega.', 'Ini hadiah Anda. Semoga jalan Anda tetap jelas!'],
          questCompleted: ['Terima kasih lagi telah menyelamatkan Haven! Kapten Vane di pos mungkin membutuhkan bantuan Anda selanjutnya.'],
          randomPool: ['Pertahanan yang kuat sama pentingnya dengan pedang yang tajam.', 'Istirahatlah di api unggun kapan pun Anda perlu memulihkan energi.'],
        },
      },
    },
  },
  {
    id: 'npc_marcus',
    name: 'Marcus',
    role: 'Food Merchant',
    type: 'merchant',
    position: [6, 0, 3],
    rotationY: -Math.PI * 0.4,
    questId: 'side_marcus_hunt',
    dialogue: {
      greeting: [
        "Welcome. If you're looking for equipment, you've come to the right place.",
      ],
      questOffer: {
        dialogue: [
          'My supply cart keeps getting raided. Defeat 3 Bandit Fighters and I will reward you well!',
        ],
        acceptButtonText: 'Accept Quest: Hungry Customers',
      },
      questInProgress: [
        'Still hunting those bandits? My customers are getting impatient!',
      ],
      questTurnIn: [
        'You got them! Here is your reward — and a free meal on the house!',
      ],
      questCompleted: [
        'Business is booming again! Come back anytime for a bite.',
      ],
      randomPool: [
        'Every adventurer needs a good meal before a fight!',
        'My crispy chicken is legendary in these parts.',
      ],
      choices: [
        {
          text: 'Show me your goods.',
          resultPages: [
            'Take your time. Everything here is honest fare at honest prices.',
          ],
          openShop: true,
        },
        {
          text: 'Anything interesting around here?',
          resultPages: [
            "The road beyond the village is less forgiving than it looks. If you're heading toward the wilderness, prepare before you leave.",
          ],
        },
        {
          text: 'Never mind.',
          resultPages: [
            'Come back when you need something.',
          ],
        },
      ],
      localized: {
        id: {
          greeting: ['Hai, Petualang! Apakah Anda ingin membeli sesuatu dari toko saya?'],
          questOffer: {
            dialogue: [
              'Keranjang suplai saya terus dijarah. Kalahkan 3 Bandit Fighter dan saya akan memberi hadiah yang setimpal!',
            ],
            acceptButtonText: 'Terima Misi: Pelanggan Lapar',
          },
          questInProgress: ['Masih berburu bandit itu? Pelanggan saya mulai tidak sabar!'],
          questTurnIn: ['Anda berhasil! Ini hadiah Anda — dan makanan gratis dari saya!'],
          questCompleted: ['Bisnis saya berjalan lancar lagi! Kembali kapan saja untuk makan.'],
          randomPool: [
            'Setiap petualang butuh makanan enak sebelum bertarung!',
            'Ayam goreng renyah saya legendaris di daerah ini.',
          ],
          choices: [
            {
              text: 'Ya',
              resultPages: [
                'Selera yang bagus, petualang! Anda tidak akan menyesal.',
                'Lihat pilihan saya dan pilih sesuatu yang lezat!',
              ],
              openShop: true,
            },
            {
              text: 'Tidak',
              resultPages: [
                'Hmph. Lebih banyak untuk saya kal begitu. Rugi, petualang!',
                'Kembali saat Anda lapar. Makanan saya berbicara sendiri.',
              ],
            },
          ],
        },
      },
    },
  },
  {
    id: 'npc_garrick',
    name: 'Garrick',
    role: 'Master Blacksmith',
    type: 'blacksmith',
    position: [-7.5, 0, 3.5],
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
    id: 'npc_hektor',
    name: 'Hektor',
    role: 'Village Guard',
    type: 'guard',
    position: [3, 0, -5],
    rotationY: -Math.PI * 0.7,
    questId: 'side_guard_patrol',
    dialogue: {
      greeting: [
        'Hold there. I patrol these streets to keep Haven safe.',
        'The slimes have been getting bolder lately.',
      ],
      questOffer: {
        dialogue: [
          'We need the slime population thinned before they overwhelm the outer walls.',
          'Defeat 5 Bouncy Slimes and the village will be grateful!',
        ],
        acceptButtonText: 'Accept Quest: Slime Infestation',
      },
      questInProgress: [
        'Keep at it! The slimes are tough but nothing a skilled fighter cannot handle.',
      ],
      questTurnIn: [
        'The paths are clear again. You have my thanks, and the village guard salutes you!',
      ],
      questCompleted: [
        'Safe streets thanks to you. Rest easy, friend.',
      ],
      randomPool: [
        'A guard is only as good as the community they protect.',
        'Watch your step — slimes leave the ground slippery.',
      ],
      localized: {
        id: {
          greeting: ['Tahan di sana. Saya berpatroli di jalanan ini untuk menjaga Haven tetap aman.', 'Soo-soo semakin berani belakangan ini.'],
          questOffer: {
            dialogue: ['Kami perlu mengurangi populasi soo sebelum mereka menguasai dinding luar.', 'Kalahkan 5 Soo yang Melompat dan penduduk desa akan berterima kasih!'],
            acceptButtonText: 'Terima Misi: Infestasi Soo',
          },
          questInProgress: ['Teruslah! Soo itu tangguh tapi bukan masalah bagi petarung terampil.'],
          questTurnIn: ['Jalanan sudah aman lagi. Terima kasih, dan pasukan penduduk desa memberi penghormatan kepada Anda!'],
          questCompleted: ['Jalanan aman berkat Anda. Istirahatlah dengan tenang, teman.'],
          randomPool: ['Seorang penjaga hanya sebaik komunitas yang mereka lindungi.', 'Hati-hati dengan langkah Anda — soo membuat licin.'],
        },
      },
    },
  },
  {
    id: 'npc_vane',
    name: 'Captain Vane',
    role: 'Outpost Commander',
    type: 'guard',
    position: [0, 0, -21],
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
    id: 'npc_seraphina',
    name: 'Seraphina',
    role: 'Village Healer',
    type: 'healer',
    position: [-4, 0, -4],
    rotationY: Math.PI * 0.6,
    questId: 'side_healer_fewer_wolves',
    dialogue: {
      greeting: [
        'Welcome. The healing herbs are always ready for those in need.',
        'The wolves have been attacking our patrols too often.',
      ],
      questOffer: {
        dialogue: [
          'Our guards keep returning wounded. If you thin the wolf pack, I can focus on healing instead of constant triage.',
          'Defeat 3 Dire Wolves and I will provide healing potions for your journey!',
        ],
        acceptButtonText: 'Accept Quest: Wounded Patrols',
      },
      questInProgress: [
        'Be careful out there. Wolves strike fast and without mercy.',
      ],
      questTurnIn: [
        'The patrols are safer now. Thank you — take these potions, you will need them.',
      ],
      questCompleted: [
        'The wounds have healed and the patrols are strong again. Bless you.',
      ],
      randomPool: [
        'A potion a day keeps the grave at bay.',
        'The healing arts are as old as the Abyss itself.',
      ],
    },
  },
  {
    id: 'npc_lysander',
    name: 'Dr. Lysander',
    role: 'Arcane Scholar',
    type: 'researcher',
    position: [-2, 0, 4],
    rotationY: Math.PI * 0.25,
    questId: 'side_mage_mages',
    dialogue: {
      greeting: [
        "You're carrying potential that has not yet chosen its shape.",
      ],
      questOffer: {
        dialogue: [
          'Rogue Arcane Mages are casting uncontrolled spells near the Ancient Monoliths.',
          'Defeat 3 Arcane Mages to stabilize the magical field!',
        ],
        acceptButtonText: 'Accept Quest: Arcane Threat',
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
      choices: [
        {
          text: 'Tell me about my path.',
          resultPages: [
            'There are two paths I can safely teach you for now.',
          ],
        },
        {
          text: 'Become a Fighter',
          resultPages: [
            'Then learn to rely on your body, your weapon, and your discipline. Strength is not merely power. It is control.',
          ],
          chooseArchetype: 'fighter',
        },
        {
          text: 'Become a Mage',
          resultPages: [
            'Then learn to shape the Abyssal forces through technique. A careless spell is still a weapon, even when its caster forgets that.',
          ],
          chooseArchetype: 'mage',
        },
        {
          text: 'Not yet',
          resultPages: [
            'Then return when you have made your choice.',
          ],
        },
      ],
    },
  },
  {
    id: 'npc_moro',
    name: 'Moro',
    role: 'Retired Bowyer',
    type: 'villager',
    position: [4, 0, -15],
    rotationY: Math.PI * 1.25,
    dialogue: {
      greeting: [
        'Still heading toward the wilderness?',
      ],
      questInProgress: [
        'The wolves grow bold near the Wilderness Entrance after dusk. The path north is safe enough... for now.',
      ],
      questCompleted: [
        'Still standing? You learn fast, or the wild is getting slow.',
      ],
      questTurnIn: [
        'Back in one piece. The crows are disappointed; I am not.',
      ],
      questOffer: {
        dialogue: [
          'Work? Hah. The only job I have left is outliving my knees.',
          'Talk to the others in the village if you are hunting for honest work.',
        ],
      },
      randomPool: [
        "Things that don't care whether you're ready.",
        'I spent years making bows for people who thought distance meant safety. It doesn\'t.',
        'If you go, keep your eyes open. The road is usually kinder than what waits beside it.',
        'Watch the edges of the road. Trouble rarely bothers to stand in the middle and introduce itself.',
        "Survive long enough to come back. That's advice enough.",
      ],
    },
  },
];
