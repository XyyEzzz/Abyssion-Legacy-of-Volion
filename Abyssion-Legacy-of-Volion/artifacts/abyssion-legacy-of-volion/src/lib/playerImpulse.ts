/**
 * Shared P0 lifecycle guard (BUG-020 consolidation).
 *
 * A destroyed Rapier body throws from Rust. On failure we clear the shared
 * stale ref so it can never be read again. Behaviour, signature and call sites
 * are identical to the six per-enemy copies this replaces.
 */
import { playerRigidBodyRef } from '@/components/game/Player';

export function guardedPlayerImpulse(impulse: { x: number; y: number; z: number }): void {
  const body = playerRigidBodyRef.current;
  if (!body) return;
  try {
    body.applyImpulse(impulse, true);
  } catch {
    playerRigidBodyRef.current = null;
  }
}
