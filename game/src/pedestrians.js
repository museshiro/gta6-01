// pedestrians.js — the people of Puerto Brasa: strollers, vendors, guards.
// They walk the sidewalks, scatter when shots ring out, and some of them
// fight back when a mission turns a street into a battlefield.

import { mulberry32, range, pick, clamp, dist, angleDiff } from './utils.js';
import { collideCircle } from './city.js';

const SHIRTS = [[0.95, 0.6, 0.4], [0.4, 0.7, 0.95], [0.95, 0.9, 0.5], [0.6, 0.9, 0.5], [0.9, 0.5, 0.7], [0.85, 0.85, 0.85], [0.5, 0.4, 0.8]];
const SKINS = [[0.9, 0.7, 0.55], [0.75, 0.55, 0.4], [0.6, 0.42, 0.3], [0.95, 0.8, 0.65]];

export function makePed(x, z, hostile) {
  const rng = mulberry32((x * 131 + z * 17 + 7) >>> 0);
  return {
    x, z, angle: range(rng, 0, Math.PI * 2), phase: range(rng, 0, 6),
    shirt: pick(rng, SHIRTS).slice(), skin: pick(rng, SKINS).slice(),
    speed: range(rng, 1.2, 2.2), hp: hostile ? 60 : 30, hostile: !!hostile,
    fleeing: false, moving: true, tx: x, tz: z, shootCd: 0, dead: false,
  };
}

export function createCrowd(city, count) {
  const rng = mulberry32(4242);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const road = pick(rng, city.roadsX);
    const t = range(rng, -190, 170);
    peds.push(makePed(road + (rng() < 0.5 ? 8 : -8), t, false));
  }
  return peds;
}

export function updatePeds(city, peds, player, dt, panicAt) {
  const rng = Math.random;
  for (const p of peds) {
    if (p.dead) continue;
    p.shootCd -= dt;
    const dPlayer = dist(p.x, p.z, player.x, player.z);
    if (panicAt && dist(p.x, p.z, panicAt.x, panicAt.z) < 30) p.fleeing = true;
    if (p.hostile) {
      // Hostile guards close in and shoot when the player is near.
      if (dPlayer < 26) {
        const want = Math.atan2(player.x - p.x, player.z - p.z);
        p.angle += angleDiff(p.angle, want) * Math.min(1, dt * 4);
        if (dPlayer > 8) {
          p.x += Math.sin(p.angle) * 3.2 * dt; p.z += Math.cos(p.angle) * 3.2 * dt;
          p.moving = true;
        } else p.moving = false;
        if (p.shootCd <= 0 && dPlayer < 22) { p.shootCd = 1.1; p.firing = true; } else p.firing = false;
      } else {
        p.moving = false; p.firing = false;
      }
    } else if (p.fleeing) {
      const away = Math.atan2(p.x - player.x, p.z - player.z);
      p.angle = away;
      p.x += Math.sin(away) * 5 * dt; p.z += Math.cos(away) * 5 * dt;
      p.moving = true;
      if (dPlayer > 45) p.fleeing = false;
    } else {
      if (dist(p.x, p.z, p.tx, p.tz) < 2 || rng() < dt * 0.02) {
        p.tx = clamp(p.x + range(rng, -40, 40), -205, 205);
        p.tz = clamp(p.z + range(rng, -40, 40), -205, 170);
      }
      const want = Math.atan2(p.tx - p.x, p.tz - p.z);
      p.angle += angleDiff(p.angle, want) * Math.min(1, dt * 3);
      p.x += Math.sin(p.angle) * p.speed * dt;
      p.z += Math.cos(p.angle) * p.speed * dt;
      p.moving = true;
    }
    collideCircle(city, p, 0.6);
  }
  return peds.filter((p) => !p.dead);
}
