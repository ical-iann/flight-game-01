// Sky Courier: Kepulauan Run — tuning constants for the whole game.
// One place for every number that shapes how the plane flies, so the flight
// model can be tuned without touching the physics or the renderer.
export const STEP = 1 / 60;
export const WORLD_SEED = 20261126;

// Flight model (speeds in m/s, altitudes in metres).
export const FLIGHT = {
  maxSpeed: 92, // full throttle, level flight
  minFlySpeed: 26, // below this the wing stops lifting and the nose drops
  cruiseSpeed: 58,
  accel: 14, // how fast speed chases the throttle target
  drag: 0.35, // extra drag when slow and nose-high
  pitchRate: 1.5, // rad/s at full stick
  rollRate: 3.0,
  yawFromRoll: 0.8, // coordinated turn: bank turns the nose
  rudderRate: 0.5,
  climbPitch: 0.32, // pitch that holds level flight at cruise
  gravity: 9.8,
  stallSink: 14, // m/s the plane sinks when stalled
};

// Fuel and damage turn a sortie into decisions.
export const FUEL = {
  capacity: 100,
  burnFull: 0.55, // units per second at full throttle: a full sortie lasts ~3 minutes
  burnIdle: 0.12,
  reserveWarn: 25, // fuel gauge turns amber below this
  reserveCritical: 10,
};
export const DAMAGE = {
  hardLandingVs: 6, // vertical speed (m/s) that starts hurting on touchdown
  crashVs: 11, // vertical speed that ends the flight outright
  terrainHit: 100, // hitting a hillside is always fatal
};

// The course: eight rings over the islands, then a landing on runway 07.
export const COURSE = {
  ringRadius: 20,
  ringScore: 250,
  ringTimeBonus: 12, // seconds added per ring
  timeLimit: 240, // seconds for the whole sortie
  landingScore: 1000,
  perfectLandingBonus: 500, // touchdown soft and on the centreline
  smoothBonusVs: 2.5,
};

// Runway 07 on Pulau Besar: a coastal strip on the island's south shore, so
// the takeoff corridor runs out over the lagoon and the final approach comes
// in over flat water. Heading 070 degrees (east-north-east).
export const RUNWAY = {
  // Centre of the strip, heading 070 degrees (east-north-east).
  x: 0,
  z: -60,
  headingDeg: 70,
  length: 320,
  width: 26,
  // Where a sortie starts: on the runway, lined up for takeoff.
  startX: -89,
  startZ: -28,
  startHeadingDeg: 70,
};

// Chase camera.
export const CAMERA = {
  back: 10.5, // metres behind the plane
  up: 3.2, // metres above it
  lookAhead: 26, // metres in front of the plane the camera aims at
  fov: 78, // vertical field of view in degrees
  smooth: 7, // how fast the camera catches up (per second)
};

// Terrain drawing.
export const TERRAIN = {
  size: 2600, // the island group spans this many metres across
  viewDistance: 1100, // metres of terrain drawn ahead
  cell: 55, // grid cell size in metres
  waterLevel: 0,
  snowLine: 128,
  rockLine: 80,
  sandLine: 3,
};

// Scoring shown on the title screen.
export const BEST_KEY = 'skycourier-best';
