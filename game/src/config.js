// TURKEY RUN 3D — shared constants, stage data, obstacle data, seeded RNG.
// No imports. Every other module reads tuning from here so numbers live once.
export const LANES = [-2.2, 0, 2.2];
export const LANE_COUNT = 3;
export const FINISH_DISTANCE = 1400;
export const MAX_LIVES = 3;
export const FIXED_DT = 1 / 60;
export const JUMP_BUFFER_SECONDS = 0.12;
export const SLIDE_SECONDS = 0.6;
export const CAMERA_BASE = { x: 0, y: 4.2, z: -6.8 };
export const CAMERA_LOOK_AHEAD_Z = 14;
export const CAMERA_FOV = 60;
export const SPAWN_AHEAD_Z = 85;
export const DESPAWN_BEHIND_Z = -18;
export const TURKEY_HALF_WIDTH = 0.35;
export const TURKEY_STAND_HEIGHT = 1.19;
export const TURKEY_SLIDE_HEIGHT = 0.71;

// Jump: airtime ~0.7 s, apex ~1.15 m.
// g = 8h / T^2, v0 = g*T/2.
export const JUMP_AIRTIME = 0.7;
export const JUMP_APEX = 1.15;
export const JUMP_GRAVITY = (8 * JUMP_APEX) / (JUMP_AIRTIME * JUMP_AIRTIME);
export const JUMP_VELOCITY = (JUMP_GRAVITY * JUMP_AIRTIME) / 2;

export const STAGES = [
  {
    index: 0,
    name: 'FARMYARD',
    start: 0,
    end: 500,
    speed: 12,
    sky: 0x87b5e0,
    fogColor: 0x9fc3e2,
    fogNear: 55,
    fogFar: 130,
    ground: 0x7da05c,
    hemiSky: 0xbfd9ff,
    hemiGround: 0x8a7a55,
    sun: 0xfff2d0,
    sunIntensity: 2.8,
  },
  {
    index: 1,
    name: 'BARN',
    start: 500,
    end: 1000,
    speed: 14,
    sky: 0xe08a4e,
    fogColor: 0xd99a63,
    fogNear: 50,
    fogFar: 120,
    ground: 0x8a6a45,
    hemiSky: 0xffc890,
    hemiGround: 0x6a4a30,
    sun: 0xffb070,
    sunIntensity: 2.6,
  },
  {
    index: 2,
    name: 'KITCHEN',
    start: 1000,
    end: FINISH_DISTANCE,
    speed: 16,
    sky: 0x1c2233,
    fogColor: 0x232a3d,
    fogNear: 42,
    fogFar: 105,
    ground: 0x4a4038,
    hemiSky: 0x5a6a9a,
    hemiGround: 0x3a2f24,
    sun: 0xffc890,
    sunIntensity: 2.5,
  },
];

export function stageForDistance(distanceM) {
  if (distanceM >= STAGES[2].start) return STAGES[2];
  if (distanceM >= STAGES[1].start) return STAGES[1];
  return STAGES[0];
}

// Obstacle catalogue. Sizes are the visual GLB sizes; hitboxes use
// HITBOX_SCALE (generous hitboxes: 0.8x visual).
export const HITBOX_SCALE = 0.8;
export const OBSTACLE_TYPES = {
  fence: {
    kind: 'fence', asset: 'fence', clearBy: 'jump', clearHeight: 0.95,
    size: { x: 1.94, y: 1.22, z: 0.14 },
  },
  hay: {
    kind: 'hay', asset: 'hay', clearBy: 'jump', clearHeight: 0.75,
    size: { x: 0.9, y: 0.96, z: 0.9 },
  },
  pot: {
    kind: 'pot', asset: 'pot', clearBy: 'jump', clearHeight: 0.32,
    size: { x: 0.68, y: 0.43, z: 0.62 },
  },
  beam: {
    kind: 'beam', asset: 'beam', clearBy: 'slide', clearHeight: 0,
    size: { x: 1.64, y: 0.55, z: 0.39 }, beamBottom: 0.75,
  },
  knifeSwing: {
    kind: 'knifeSwing', asset: 'knife', clearBy: 'jumpOrLane', clearHeight: 0.8,
    size: { x: 0.5, y: 1.65, z: 0.5 }, swingPeriod: 1.6,
  },
  pumpkin: {
    kind: 'pumpkin', asset: 'pumpkin', clearBy: 'lane', clearHeight: 0.5,
    size: { x: 0.64, y: 0.66, z: 0.64 }, driftSpeed: 0.9,
  },
  firejet: {
    kind: 'firejet', asset: 'oven', clearBy: 'jump', clearHeight: 0.9,
    size: { x: 1.04, y: 1.24, z: 0.77 }, telegraph: 0.6, active: 0.9,
  },
  knifeFall: {
    kind: 'knifeFall', asset: 'knife', clearBy: 'lane', clearHeight: 0.5,
    size: { x: 0.16, y: 1.65, z: 0.16 }, telegraph: 0.7,
  },
};

// Which obstacle kinds may appear in each stage. A kind that first appears
// in a stage is introduced alone with a wide gap (see obstacles.js).
export const STAGE_OBSTACLES = [
  ['fence', 'hay', 'pot'],
  ['fence', 'hay', 'pot', 'beam', 'pumpkin', 'knifeSwing'],
  ['fence', 'hay', 'pot', 'beam', 'pumpkin', 'knifeSwing', 'firejet', 'knifeFall'],
];
export const STAGE_INTRODUCTIONS = {
  1: ['beam', 'pumpkin', 'knifeSwing'],
  2: ['firejet', 'knifeFall'],
};

export const PICKUP_TYPES = {
  corn: { asset: 'corn', score: 10 },
  feather: { asset: 'feather', score: 0 },
  pie: { asset: 'pie', score: 25 },
};

// Deterministic RNG (mulberry32) so ?seed=N replays the same layout.
export function createRng(seed) {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickFrom(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function shuffleCopy(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
