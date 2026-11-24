// pedestrians.js — the people of Isla Caldera: sidewalk walkers who stroll,
// scatter when gunfire starts, and can be knocked down. They give the city life
// and the combat its consequences (every knock-down raises the heat).

import { dist2 } from './utils.js';
import { collideWorld, nearestRoadPoint } from './city.js';

const SHIRTS = [
  [0.85, 0.85, 0.8], [0.9, 0.5, 0.3], [0.3, 0.55, 0.85], [0.9, 0.75, 0.35],
  [0.45, 0.75, 0.45], [0.75, 0.35, 0.55], [0.6, 0.6, 0.65], [0.95, 0.6, 0.6],
];

export function makePed(x, z, rng) {
  return {
    x, z,
    heading: rng() * Math.PI * 2,
    speed: 1.2 + rng() * 1.2,
    state: 'walk', // walk | flee | down
    color: SHIRTS[Math.floor(rng() * SHIRTS.length)],
    health: 100,
    axis: rng() < 0.5 ? 'x' : 'z',
    dir: rng() < 0.5 ? 1 : -1,
    fleeT: 0,
  };
}

/** Keep ~22 pedestrians on the sidewalks around the player. */
export function spawnPeds(state, dt) {
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  const alive = state.peds.filter((q) => q.state !== 'down');
  if (alive.length >= 22) return;
  if (state._pedTimer === undefined) state._pedTimer = 0;
  state._pedTimer -= dt;
  if (state._pedTimer > 0) return;
  state._pedTimer = 0.5;
  const rng = state.rng;
  const rp = nearestRoadPoint(px + (rng() - 0.5) * 160, pz + (rng() - 0.5) * 160);
  const d = dist2(rp.x, rp.z, px, pz);
  if (d < 25 || d > 140) return;
  const ped = makePed(rp.x + (rp.axis === 'x' ? 0 : 7), rp.z + (rp.axis === 'x' ? 7 : 0), rng);
  ped.axis = rp.axis;
  state.peds.push(ped);
}

export function updatePeds(state, dt) {
  const shot = state.lastShotPos;
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    // Flee from the last gunshot.
    if (shot && dist2(ped.x, ped.z, shot.x, shot.z) < 32) {
      ped.state = 'flee';
      ped.fleeT = 3;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - shot.x;
      const dz = ped.z - shot.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.heading = Math.atan2(dx / d, -dz / d);
      const nx = ped.x + Math.sin(ped.heading) * 7 * dt;
      const nz = ped.z - Math.cos(ped.heading) * 7 * dt;
      const hit = collideWorld(state.city, nx, nz, 0.5);
      ped.x = hit.x;
      ped.z = hit.z;
      if (ped.fleeT <= 0) ped.state = 'walk';
      continue;
    }
    // Stroll along the sidewalk.
    const step = ped.speed * dt;
    if (ped.axis === 'x') ped.x += ped.dir * step;
    else ped.z += ped.dir * step;
    ped.heading = ped.axis === 'x'
      ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ped.dir > 0 ? Math.PI : 0);
    if (Math.abs(ped.x) > 255 || Math.abs(ped.z) > 255 || state.rng() < dt * 0.02) {
      ped.dir *= -1;
    }
    if (dist2(ped.x, ped.z, px, pz) > 180) {
      // Recycle far-away walkers back near the player.
      const rp = nearestRoadPoint(px + (state.rng() - 0.5) * 120, pz + (state.rng() - 0.5) * 120);
      ped.x = rp.x;
      ped.z = rp.z;
      ped.axis = rp.axis;
    }
  }
  // Drop the long-dead from the list, keep the count sane.
  if (state.peds.length > 40) {
    state.peds = state.peds.filter((q) => q.state !== 'down').slice(0, 30);
  }
}

export function nearestPed(state, x, z, maxDist, aliveOnly = true) {
  let best = null;
  let bd = maxDist;
  for (const ped of state.peds) {
    if (aliveOnly && ped.state === 'down') continue;
    const d = dist2(ped.x, ped.z, x, z);
    if (d < bd) { bd = d; best = ped; }
  }
  return best;
}
