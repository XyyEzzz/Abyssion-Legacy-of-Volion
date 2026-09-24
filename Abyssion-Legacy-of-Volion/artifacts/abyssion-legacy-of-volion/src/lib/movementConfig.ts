/**
 * Centralized movement tuning constants.
 * Every value that affects movement feel lives here so designers can
 * tweak without touching controller logic.
 */
export const MOVEMENT_CONFIG = {
  // Base locomotion
  walkSpeed: 5,
  sprintMultiplier: 1.8,
  rotationSpeed: 10,

  // Acceleration / deceleration (units per second, lerped via delta)
  groundAccel: 12,   // how fast horizontal velocity approaches desired speed on ground
  groundDecel: 10,   // how fast horizontal velocity returns to 0 when no input on ground
  airAccel: 5,       // reduced acceleration while airborne (allows direction changes, weaker than ground)
  airDecel: 2.5,     // gentle deceleration while airborne with no input

  // Jump feel — gravity scale applied to the rigid body
  jumpGravity: 1.0,  // gravity scale while rising (lower than fall for a natural arc)
  fallGravity: 2.5,  // gravity scale while falling (heavier, snappy descent)
  apexThreshold: 1.0, // vertical velocity below this (m/s) switches to fall gravity near apex
  jumpForce: 6.0,
  doubleJumpForce: 5.0,  // additional jump while airborne (intentional double jump)

  // Slope handling — dampen vertical velocity when walking on uneven ground
  slopeDampThreshold: 2.5,  // |vy| below this is considered "on slope" and damped
  slopeDampFactor: 0.85,    // multiply vy by this when grounded and below threshold

  // Landing feedback (visual only — no physics impact)
  landingDipStrength: 0.35, // camera dip in world units on landing
  landingDipSpeed: 8,       // how fast the dip recovers
  landingSquashScale: 0.85, // body Y-scale at landing impact
  landingSquashRecover: 10, // how fast squash recovers to 1.0
  landingMinFallSpeed: 5,   // must be falling at least this fast to trigger landing feedback

  // Head bob (applied to camera, disabled in first person & while airborne)
  headBobAmplitude: 0.06,
  headBobFrequency: 8,
  headBobSprintAmplitude: 0.12,
  headBobSprintFrequency: 12,

  // Sprint FOV
  sprintFovIncrease: 4,     // degrees added to base FOV while sprinting
  sprintFovLerpSpeed: 5,    // how fast FOV transitions in/out of sprint
  baseFov: 60,

  // Footsteps
  footstepWalkStride: 3.0,   // distance between footsteps when walking
  footstepSprintStride: 2.0, // shorter stride = faster cadence when sprinting

  // Camera orbit (third/second person)
  cameraDistance: 6,       // desired orbit distance from player
  cameraHeight: 3,         // base height offset above player
  cameraFirstPersonLerp: 25, // faster position/look lerp in first person to reduce lag
  cameraFirstPersonLookLerp: 30,

  // Camera smoothing (existing lerp factors, now configurable)
  cameraPositionLerp: 10,
  cameraLookLerp: 15,
  cameraCollisionLerp: 12,
} as const;
