/**
 * Centralized tuning for the encounter arena vertical slice.
 * All layout, enemy, and reward values live here.
 */
export const ENCOUNTER_CONFIG = {
  // Arena center (offset from world origin)
  centerX: 35,
  centerZ: -35,

  // Arena floor dimensions
  floorWidth: 24,
  floorDepth: 24,
  floorColor: '#6b7280',
  wallColor: '#374151',
  wallHeight: 3,

  // Pillar dressing
  pillarColor: '#4b5563',
  pillarHeight: 4,
  pillarRadius: 0.5,

  // Encounter enemies — names must be unique so onEnemyKilled can track them
  enemies: [
    { name: 'Arena Slime', position: [-3, 0, -6] as [number, number, number] },
    { name: 'Arena Wolf',   position: [3, 0, -6] as [number, number, number] },
    { name: 'Arena Bandit', position: [0, 0, -9] as [number, number, number] },
  ],

  // Completion portal
  portalZ: 10,
  portalRadius: 1.5,
  portalProximityDist: 2.5,

  // Reward on completion
  rewardExp: 200,
  rewardGold: 150,

  // Entrance marker — positioned at the walkable entrance path
  entranceMarkerZ: 13,
} as const;
