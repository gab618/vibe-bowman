export const physicsConfig = {
  /** Base screen pixels per 1 meter at zoom = 1.0 */
  pixelsPerMeter: 40,
  /** Gravitational acceleration (m/s^2, downward) */
  gravity: 12,
  /** Minimum arrow launch speed at 0% power (m/s) */
  minArrowSpeed: 6,
  /** Maximum arrow launch speed at 100% power (m/s) */
  maxArrowSpeed: 40,
  /** Horizontal wind acceleration (m/s^2). Disabled (0) in v1, kept for future evolution. */
  wind: 0,
  /** Fixed physics timestep (seconds) */
  fixedDt: 1 / 120,
  /** Maximum physics substeps per animation frame */
  maxStepsPerFrame: 5,
  /** Arrow total length (meters) */
  arrowLength: 0.8,
  /** How deep the arrow tip embeds on impact (meters) */
  arrowPenetration: 0.15,
  /** Maximum number of stuck arrows kept in the world */
  maxStuckArrows: 50,
  /** Minimum vertical bound below ground before arrow is considered out of world (meters) */
  worldBottomMargin: 15,

  aim: {
    /** Drag distance in CSS pixels corresponding to 100% power */
    maxDragPixels: 200,
    /** Minimum power threshold; releasing below cancels the shot */
    minPowerThreshold: 0.05,
  },

  terrain: {
    minDistance: 30,
    maxDistance: 80,
    sideMargin: 25,
    sampleStep: 0.5,
    maxAmplitude: 6,
    platformWidth: 3,
    platformBlendWidth: 4,
    maxPeakAboveLowestArcher: 8,
  },

  camera: {
    minZoom: 0.5,
    maxZoom: 1.5,
    defaultZoom: 1.0,
    /** Max screen fraction offset when aiming in a direction */
    aimLookAheadFraction: 0.25,
    /** Exponential smoothing rate for camera pan */
    panLerpRate: 6,
    /** Exponential smoothing rate for camera zoom */
    zoomLerpRate: 4,
    /** Hold duration on impact before panning to next player (seconds) */
    impactHoldSeconds: 1.0,
    /** Duration of camera transition to next player (seconds) */
    turnTransitionSeconds: 1.0,
  },

  ragdoll: {
    constraintIterations: 5,
    damping: 0.992,
    groundFriction: 0.82,
    groundRestitution: 0.15,
    /** Multiplier converting arrow velocity to impulse displacement on hit particle */
    impactImpulseScale: 0.35,
  },
} as const;
