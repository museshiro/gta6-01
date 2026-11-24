// city.js — Isla Caldera: the seeded procedural island of CALDERA VIVA.
// Puerto Brasa (coastal town), the Boardwalk, the Dermaga pier, Bukit Caldera
// (volcano hill), Kota Tua (old town). All geometry is generated from one
// fixed seed, so every player loads the same island.

import { mulberry32, range, pick } from './utils.js';

export const WORLD_SEED = 20261124;
export const WORLD_BOUND = 218;      // playable half-extent (x and z)
export const BEACH_Z = 178;          // south of this: black-sand beach
export const WATER_Z = 206;          // south of this: open sea

const PALETTE = {
  stucco: [[0.92, 0.78, 0.62], [0.85, 0.62, 0.48], [0.78, 0.72, 0.58], [0.95, 0.85, 0.70]],
  pastel: [[0.95, 0.62, 0.55], [0.55, 0.78, 0.85], [0.98, 0.82, 0.45], [0.62, 0.80, 0.60], [0.90, 0.55, 0.65]],
  roof: [[0.55, 0.25, 0.18], [0.35, 0.30, 0.28], [0.20, 0.35, 0.42], [0.65, 0.45, 0.30]],
  glass: [0.35, 0.55, 0.65],
};

export const DISTRICTS = [
  { id: 'brasa', name: 'Puerto Brasa', x0: -90, z0: -60, x1: 90, z1: 90, color: '#e8a34c' },
  { id: 'boardwalk', name: 'Boardwalk', x0: -140, z0: 90, x1: 140, z1: 178, color: '#ff7a9e' },
  { id: 'dermaga', name: 'Dermaga', x0: 90, z0: -60, x1: 218, z1: 178, color: '#5ec8d8' },
  { id: 'bukit', name: 'Bukit Caldera', x0: -218, z0: -218, x1: 218, z1: -60, color: '#b08968' },
  { id: 'tuo', name: 'Kota Tua', x0: -218, z0: -60, x1: -90, z1: 178, color: '#d8c25e' },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  if (z >= BEACH_Z) return DISTRICTS[1];
  return DISTRICTS[0];
}

export function buildCity() {
  const rng = mulberry32(WORLD_SEED);
  const roadsX = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  const roadsZ = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  const buildings = [];   // {x,z,w,d,h,color,roof}
  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const trees = [];       // {x,z,s}
  const lamps = [];       // {x,z}
  const parked = [];      // {x,z,angle,color}
  const plazas = [];

  // Buildings fill the blocks between roads; a few blocks stay open as plazas.
  for (let ix = 0; ix < roadsX.length - 1; ix++) {
    for (let iz = 0; iz < roadsZ.length - 1; iz++) {
      const x0 = roadsX[ix] + 8, x1 = roadsX[ix + 1] - 8;
      const z0 = roadsZ[iz] + 8, z1 = roadsZ[iz + 1] - 8;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (z0 > BEACH_Z - 10) continue; // beach stays open
      const roll = rng();
      if (roll < 0.10) { plazas.push({ x: cx, z: cz, w: x1 - x0, d: z1 - z0 }); continue; }
      const n = roll < 0.45 ? 1 : roll < 0.8 ? 2 : 4;
      for (let k = 0; k < n; k++) {
        const w = (x1 - x0) / (n === 1 ? 1 : 2) - 4;
        const d = (z1 - z0) / (n <= 2 ? 1 : 2) - 4;
        const bx = n === 1 ? cx : x0 + w / 2 + 2 + (k % 2) * (w + 4);
        const bz = n <= 2 ? cz : z0 + d / 2 + 2 + Math.floor(k / 2) * (d + 4);
        const nearCenter = Math.abs(bx) < 100 && Math.abs(bz) < 100;
        const h = nearCenter ? range(rng, 14, 42) : range(rng, 7, 22);
        const color = pick(rng, Math.abs(bx) < 60 ? PALETTE.pastel : PALETTE.stucco);
        const roof = pick(rng, PALETTE.roof);
        buildings.push({ x: bx, z: bz, w, d, h, color, roof });
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      }
      // A palm or two on the block corners.
      if (rng() < 0.7) trees.push({ x: x0 + 3, z: z0 + 3, s: range(rng, 1.6, 2.6) });
      if (rng() < 0.5) trees.push({ x: x1 - 3, z: z1 - 3, s: range(rng, 1.6, 2.4) });
    }
  }

  // Street lamps along every road, both sides.
  for (const rx of roadsX) for (let z = -180; z <= 180; z += 45) { lamps.push({ x: rx + 7, z }); lamps.push({ x: rx - 7, z: z + 22 }); }
  for (const rz of roadsZ) for (let x = -180; x <= 180; x += 45) { lamps.push({ x, z: rz + 7 }); }

  // Parked cars along the boardwalk and the main avenue.
  const carColors = [[0.85, 0.15, 0.15], [0.15, 0.35, 0.75], [0.95, 0.85, 0.25], [0.25, 0.75, 0.35], [0.85, 0.85, 0.85], [0.15, 0.15, 0.18], [0.95, 0.45, 0.10]];
  for (let i = 0; i < 26; i++) {
    const onBoardwalk = i < 12;
    parked.push({
      x: onBoardwalk ? range(rng, -120, 120) : range(rng, -170, 170),
      z: onBoardwalk ? 168 + (rng() < 0.5 ? 4 : -4) : (rng() < 0.5 ? 7 : -7) + pick(rng, roadsZ),
      angle: onBoardwalk ? 0 : (rng() < 0.5 ? 0 : Math.PI / 2),
      color: pick(rng, carColors),
    });
  }

  // Landmarks and mission anchors (fixed, hand-placed, not random).
  const landmarks = {
    garage: { x: -52, z: 97, name: 'Garage Tito — markas' },
    maraHouse: { x: 12, z: 52, name: 'Rumah Mara' },
    pier: { x: 30, z: 196, name: 'Dermaga' },
    containerYard: { x: 150, z: 60, name: 'Lapangan Kontainer' },
    parkingDeck: { x: -110, z: -20, name: 'Gedung Parkir' },
    warehouse: { x: 160, z: -110, name: 'Gudang Garam' },
    mansion: { x: -150, z: -150, name: 'Mansion Kartel' },
    impound: { x: 120, z: -140, name: 'Impound GIC' },
    boardwalk: { x: 0, z: 150, name: 'Boardwalk' },
    plaza: { x: 0, z: 0, name: 'Plaza Brasa' },
    bridge: { x: 0, z: -90, name: 'Jembatan Caldera' },
    boat: { x: 30, z: 232, name: 'Perahu Kabur' },
  };

  return {
    seed: WORLD_SEED, roadsX, roadsZ, buildings, colliders, trees, lamps, parked,
    plazas, landmarks, districts: DISTRICTS,
  };
}

// Push a circle (x,z,r) out of every building AABB it overlaps. Returns true on hit.
export function collideCircle(city, pos, r) {
  let hit = false;
  for (const c of city.colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r;
      } else {
        // Center inside the box: push out along the smallest penetration axis.
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - r; else if (m === pr) pos.x = c.maxX + r;
        else if (m === pt) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
      }
    }
  }
  pos.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.x));
  // South edge: the Dermaga pier (x 15..45) is walkable out to z 240; the
  // open sea beside it stops at the beach.
  const zMax = pos.x > 15 && pos.x < 45 ? 240 : WORLD_BOUND;
  pos.z = Math.max(-WORLD_BOUND, Math.min(zMax, pos.z));
  return hit;
}

export function pointInCollider(city, x, z) {
  for (const c of city.colliders) if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
  return false;
}
