/**
 * Centralized combat tuning constants.
 * Every value that affects combat feel lives here so designers can
 * tweak without touching controller logic.
 */
export const COMBAT_CONFIG = {
  // ── Hit feedback ──────────────────────────────────────────────
  hitStopMs: 50,              // freeze duration on hit (ms)
  hitStopMsHeavy: 80,         // freeze duration on stage-3 hit (ms)
  hitFlashDurationMs: 150,    // enemy white-flash duration
  weaponRecoilDistance: 0.15, // sword snaps back on hit (world units)
  weaponRecoilRecoverSpeed: 12,

  // ── Damage feedback (player taking damage) ────────────────────
  damageVignetteIntensity: 0.6,  // 0–1 opacity of red vignette
  damageVignetteDurationMs: 600, // how long the vignette stays visible
  damageCameraImpulse: 0.35,     // subtle camera shake when player is hit

  // ── Attack flow ───────────────────────────────────────────────
  attackDuration: 0.35,       // total swing time (seconds)
  attackInputBufferMs: 200,   // queued attack press accepted this long before recovery ends
  comboResetMs: 1200,         // time without attacking before combo resets
  hitDetectStart: 0.25,       // earliest progress fraction for hit detection
  hitDetectEnd: 0.70,         // latest progress fraction for hit detection
  attackMoveSlow: 0.3,        // movement speed multiplier while attacking
  attackActiveMs: 250,        // isAttacking stays true for this long (ms)
  attackCooldownMs: 350,      // cooldown before next attack can start (ms)

  // ── Attack camera push ────────────────────────────────────────
  attackCameraPush: 0.08,     // camera nudges forward on swing start (world units)
  attackCameraRecoverSpeed: 8,

  // ── Weapon trail ──────────────────────────────────────────────
  weaponTrailLifetime: 0.18,  // seconds before trail fades fully
  weaponTrailColor: '#c4b5fd',// base trail color (light lavender-white)

  // ── Slash particles ───────────────────────────────────────────
  slashParticleCount: 6,
  slashParticleLifetime: 0.25,// seconds
  slashParticleSpeed: 3.0,    // outward speed
  slashParticleSize: 0.08,
  slashParticleColor: '#facc15',

  // ── Knockback (per combo stage) ───────────────────────────────
  knockbackStage1: 4,
  knockbackStage2: 7,
  knockbackStage3: 12,
  knockbackVertical: 2.5,

  // ── Hit spark ─────────────────────────────────────────────────
  hitSparkDurationMs: 250,
  hitSparkColorNormal: '#facc15',
  hitSparkColorHeavy: '#f59e0b',
  hitSparkScaleMax: 2.3,      // final scale of spark sphere

  // ── Camera shake intensity ────────────────────────────────────
  shakeLight: 0.3,
  shakeHeavy: 0.6,

  // ── Attack range & arc ────────────────────────────────────────
  attackRange: 3.2,
  attackDotThreshold: 0.0,    // facing-dot threshold (lower = wider arc)
  attackCloseRange: 1.4,      // within this range, facing is ignored

  // ── Stagger ───────────────────────────────────────────────────
  staggerDuration: 0.25,      // enemy 'hurt' state duration
  staggerTiltAngle: 0.15,     // brief backward tilt (radians)

  // ── Dodge ─────────────────────────────────────────────────────
  dodgeDurationMs: 350,       // how long the dodge roll lasts (ms)
  dodgeCooldownSec: 0.6,      // cooldown before next dodge (seconds)
  dodgeSpeedMultiplier: 2.4,  // dodge speed relative to base/sprint speed
  dodgeStaminaCost: 20,       // stamina consumed per dodge
  dodgeIframeMs: 600,         // i-frames granted after dodge (ms)

  // ── Stamina ───────────────────────────────────────────────────
  sprintStaminaDrainPerSec: 15, // stamina drained per second while sprinting
} as const;
