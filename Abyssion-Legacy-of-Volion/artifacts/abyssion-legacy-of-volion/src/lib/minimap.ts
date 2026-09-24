/**
 * Minimap mapping layer (foundational navigation).
 *
 * World space -> map space -> minimap UI space, in two explicit steps so the
 * minimap never assumes the current prototype's dimensions are permanent.
 *
 * - `WorldRegion` describes a bounded world region. The prototype ground is
 *   100x100 units (GameScene floor collider); it is registered as the first
 *   region, NOT baked into the mapping math.
 * - `worldToMap` converts a world position into normalized map space (0..1)
 *   within its region. Deterministic, allocation-free.
 * - The minimap view (Minimap.tsx) maps normalized map space into its own
 *   pixel box, so future systems (pan/zoom, multiple regions, layers) only
 *   extend this file or add marker providers — the UI does not hardcode world
 *   extents.
 *
 * Orientation: the map is WORLD-ORIENTED (north/up = -Z, matching the scene's
 * default camera view direction). It is intentionally stable while the player
 * moves; it does not rotate with camera yaw.
 */

export interface WorldRegion {
  id: string;
  /** Center of the region in world coordinates. */
  centerX: number;
  centerZ: number;
  /** Full extent of the region in world units. */
  width: number; // X extent
  depth: number; // Z extent
}

/** The current prototype play area, registered as a region — not a constant
 * baked into the mapping math. Future regions can be added to the registry. */
export const REGIONS: WorldRegion[] = [
  { id: 'haven', centerX: 0, centerZ: 0, width: 100, depth: 100 },
];

/** Default region used when a position falls outside every registered region. */
export const DEFAULT_REGION_ID = 'haven';

/**
 * Convert a world position into normalized map coordinates (0..1) for the
 * region that contains it (defaulting to DEFAULT_REGION_ID when outside).
 * Map space: x grows right (+X world), y grows down (+Z world), which keeps
 * -Z (the scene's forward/north) at the top of the minimap.
 */
export function worldToMap(
  x: number,
  z: number,
  region: WorldRegion = REGIONS[0],
): { mx: number; my: number; regionId: string } {
  const halfW = region.width * 0.5;
  const halfD = region.depth * 0.5;
  const mx = (x - (region.centerX - halfW)) / region.width;
  const my = (z - (region.centerZ - halfD)) / region.depth;
  return { mx, my, regionId: region.id };
}

/** A named world landmark (registered content, never invented):
 * checkpoints and other fixed world features. Rendered on the expanded map. */
export interface MapLandmark {
  id: string;
  name: string;
  x: number;
  z: number;
}

/** The prototype's registered checkpoints (GameScene Checkpoint instances).
 * Keep in sync with GameScene; positions are the authored world positions. */
export const LANDMARKS: MapLandmark[] = [
  { id: 'cp_village', name: 'Village Haven', x: 0, z: 0 },
  { id: 'cp_wilderness', name: 'Wilderness Entrance', x: 0, z: -18 },
];

/** Clamp helper for markers that should stay visible at region edges. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
