// city.js — Isla Caldera, the procedural open world of CALDERA VIVA.
// One seeded build (seed 20261124): the same seed always yields the same city.
// Layout: a 9x9 road grid on a volcanic island; sea, black-sand beach, a pier,
// a volcano, five districts and the spots the story missions use.

import { mulberry32, clamp } from './utils.js';

export const CITY_SEED = 20261124;
export const LAND_HALF = 260; // land runs -260..260 on x and z; sea beyond
export const ROAD_LINES = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const ROAD_WIDTH = 10;

const PALETTES = {
  'Plaza Brasa': [[0.86, 0.62, 0.38], [0.9, 0.8, 0.62], [0.78, 0.45, 0.3], [0.92, 0.88, 0.8]],
  'Puerto Viejo': [[0.72, 0.35, 0.22], [0.85, 0.62, 0.25], [0.55, 0.5, 0.45], [0.9, 0.82, 0.65]],
  Dermaga: [[0.5, 0.5, 0.52], [0.65, 0.4, 0.25], [0.4, 0.55, 0.55], [0.8, 0.7, 0.5]],
  Boardwalk: [[0.85, 0.4, 0.35], [0.2, 0.55, 0.55], [0.92, 0.75, 0.4], [0.95, 0.9, 0.85]],
  'Caldera Alta': [[0.6, 0.55, 0.5], [0.75, 0.5, 0.3], [0.45, 0.45, 0.5], [0.88, 0.78, 0.6]],
};

const NEON = [
  [1.0, 0.25, 0.55], [0.2, 0.9, 1.0], [1.0, 0.75, 0.15], [0.55, 1.0, 0.35], [0.85, 0.35, 1.0],
];

/** Which district a point belongs to. */
export function districtAt(x, z) {
  if (z < -90) return 'Caldera Alta';
  if (x < -90) return 'Dermaga';
  if (x > 90) return 'Puerto Viejo';
  if (z > 90) return 'Boardwalk';
  return 'Plaza Brasa';
}

/** Build the whole city from the seed. Pure and deterministic. */
export function buildCity(seed = CITY_SEED) {
  const rng = mulberry32(seed);
  const buildings = [];
  const blockCenters = [-210, -150, -90, -30, 30, 90, 150, 210];

  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      // Keep the plaza, the volcano foot and the garage lot open.
      if (Math.hypot(bx, bz) < 70) continue;
      if (Math.hypot(bx - 0, bz + 205) < 70) continue;
      if (Math.hypot(bx - 30, bz - 150) < 45) continue;
      const district = districtAt(bx, bz);
      const palette = PALETTES[district];
      // Two or three buildings per block, one per quadrant so they never overlap.
      const quads = [[-12, -12], [12, -12], [-12, 12], [12, 12]];
      for (let i = quads.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = quads[i]; quads[i] = quads[j]; quads[j] = tmp;
      }
      const count = 2 + (rng() < 0.3 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const [qx, qz] = quads[i];
        const w = 12 + rng() * 8;
        const d = 12 + rng() * 8;
        const x = bx + qx + (rng() - 0.5) * 3;
        const z = bz + qz + (rng() - 0.5) * 3;
        let h = 10 + rng() * 22;
        if (district === 'Caldera Alta') h = 18 + rng() * 24; // tallest roofs ~42
        if (district === 'Boardwalk') h = 8 + rng() * 12;
        const base = palette[Math.floor(rng() * palette.length)];
        const shade = 0.85 + rng() * 0.3;
        const color = [clamp(base[0] * shade, 0, 1), clamp(base[1] * shade, 0, 1), clamp(base[2] * shade, 0, 1)];
        const neon = district === 'Boardwalk' && rng() < 0.45
          ? NEON[Math.floor(rng() * NEON.length)]
          : null;
        buildings.push({ x, z, w, d, h, color, district, neon, hw: w / 2, hd: d / 2 });
      }
    }
  }

  // Palms along the beach ring and the plaza; lamps along the roads.
  const palms = [];
  for (let i = 0; i < 44; i++) {
    const a = rng() * Math.PI * 2;
    const r = 246 + rng() * 12;
    palms.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 7 + rng() * 3, lean: (rng() - 0.5) * 0.3 });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    palms.push({ x: Math.cos(a) * 30, z: Math.sin(a) * 30, h: 8 + rng() * 2, lean: 0 });
  }
  const lamps = [];
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      if (rng() < 0.5) lamps.push({ x: lx + 7, z: lz + 7 });
    }
  }

  // Street-race checkpoints: a loop out of Plaza Brasa.
  const racePoints = [
    { x: 0, z: 0 }, { x: 120, z: 0 }, { x: 180, z: 120 }, { x: 60, z: 180 },
    { x: -120, z: 180 }, { x: -180, z: 0 }, { x: -60, z: -180 }, { x: 0, z: 0 },
  ];

  return {
    seed,
    buildings,
    palms,
    lamps,
    volcano: { x: 0, z: -205, r: 66, h: 62 },
    pier: { x0: -262, x1: -332, z0: 40, z1: 92 },
    inlet: { x0: 238, x1: 302, z0: 18, z1: 102 }, // harbour channel, crossed by the bridge
    bridge: { x: 240, z0: 18, z1: 102 },
    plaza: { x: 0, z: 0, r: 34 },
    garage: { x: 45, z: 135, name: "Tito's Garage" },
    spawn: { x: 0, z: 26, heading: 0 },
    spots: {
      garage: { x: 45, z: 135 },
      pierEnd: { x: -318, z: 66 },
      boardwalk: { x: 130, z: 205 },
      warehouse: { x: -180, z: 150 },
      bridge: { x: 240, z: 60 },
      volcanoBase: { x: 0, z: -138 },
      plaza: { x: 0, z: 0 },
      northGate: { x: 0, z: -180 },
      eastGate: { x: 210, z: 60 },
      southGate: { x: -60, z: 210 },
    },
    racePoints,
    districts: [
      { name: 'Plaza Brasa', x0: -90, z0: -90, x1: 90, z1: 90 },
      { name: 'Puerto Viejo', x0: 90, z0: -260, x1: 260, z1: -90 },
      { name: 'Dermaga', x0: -260, z0: -90, x1: -90, z1: 260 },
      { name: 'Boardwalk', x0: -90, z0: 90, x1: 260, z1: 260 },
      { name: 'Caldera Alta', x0: -260, z0: -260, x1: 260, z1: -90 },
    ],
  };
}

/** Is a point on the pier deck (walkable over water)? */
export function onPier(city, x, z) {
  return x >= city.pier.x1 && x <= city.pier.x0 + 2 && z >= city.pier.z0 && z <= city.pier.z1;
}

/** Is a point on the bridge deck (drivable over the inlet)? */
export function onBridge(city, x, z) {
  return x >= 232 && x <= 248 && z >= city.bridge.z0 && z <= city.bridge.z1;
}

/** Is a point in open water (not land, pier or bridge)? */
export function inWater(city, x, z) {
  if (Math.abs(x) <= LAND_HALF && Math.abs(z) <= LAND_HALF) return false;
  if (onPier(city, x, z)) return false;
  if (x >= city.inlet.x0 && x <= city.inlet.x1 && z >= city.inlet.z0 && z <= city.inlet.z1 && !onBridge(city, x, z)) return true;
  return true;
}

/**
 * Push a circle (x, z, radius) out of buildings, the volcano and the water.
 * Returns the corrected position. Mutates nothing; the caller applies it.
 */
export function collideWorld(city, x, z, r) {
  let px = x;
  let pz = z;
  for (const b of city.buildings) {
    const dx = px - b.x;
    const dz = pz - b.z;
    const ox = b.hw + r - Math.abs(dx);
    const oz = b.hd + r - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) px = b.x + (dx > 0 ? b.hw + r : -(b.hw + r));
      else pz = b.z + (dz > 0 ? b.hd + r : -(b.hd + r));
    }
  }
  // Volcano slope is a solid circle.
  const vdx = px - city.volcano.x;
  const vdz = pz - city.volcano.z;
  const vd = Math.hypot(vdx, vdz);
  if (vd < city.volcano.r * 0.62 + r && vd > 0.01) {
    const push = (city.volcano.r * 0.62 + r) / vd;
    px = city.volcano.x + vdx * push;
    pz = city.volcano.z + vdz * push;
  }
  // Water edge: clamp back onto land unless on the pier or bridge.
  if (inWater(city, px, pz)) {
    px = clamp(px, -LAND_HALF + r, LAND_HALF - r);
    pz = clamp(pz, -LAND_HALF + r, LAND_HALF - r);
    if (inWater(city, px, pz)) { px = x; pz = z; }
  }
  return { x: px, z: pz };
}

/** Nearest point on any road line to (x, z) — used by traffic and the police. */
export function nearestRoadPoint(x, z) {
  let bestX = ROAD_LINES[0];
  let bestZ = ROAD_LINES[0];
  let bd = Infinity;
  for (const lx of ROAD_LINES) {
    const d = Math.abs(x - lx);
    if (d < bd) { bd = d; bestX = lx; }
  }
  bd = Infinity;
  for (const lz of ROAD_LINES) {
    const d = Math.abs(z - lz);
    if (d < bd) { bd = d; bestZ = lz; }
  }
  return Math.abs(x - bestX) < Math.abs(z - bestZ)
    ? { x: bestX, z, axis: 'x' }
    : { x, z: bestZ, axis: 'z' };
}
