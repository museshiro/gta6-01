// police.js — Guardia Insular de Caldera (GIC): wanted stars, Central GIC
// dispatch, MURALLA roadblocks, ARIETE RAM/PIT units and the CORMORÁN-1
// helicopter. The helicopter always flies above the tallest roof, so it
// can never clip through a building.

import { clamp, dist, angleDiff } from './utils.js';
import { makeCar, driveCar } from './vehicles.js';
import { collideCircle } from './city.js';

export const MAX_WANTED = 5;
export const HELI_MIN_ALT = 48; // tallest roofs reach ~42; the heli stays above them

export function createPolice() {
  return {
    wanted: 0, heat: 0,               // heat 0..100 drives the star display
    cars: [],                          // patrol / ARIETE units
    roadblock: null,                   // {cars:[], x, z, ttl}
    heli: null,                        // {x, y, z, angle}
    heliCd: 0,                         // cooldown after the heli loses the trail
    unseen: 0,                         // seconds no unit can see the player
    sinceCrime: 0,                     // seconds since the last crime (heli loses the trail)
    dispatchLog: [],                   // radio lines for the HUD ticker
    spawnCd: 0, roadblockCd: 0,
  };
}

export function addHeat(police, amount, reason) {
  police.heat = clamp(police.heat + amount, 0, 100);
  police.sinceCrime = 0;
  const stars = Math.ceil(police.heat / 20);
  if (stars > police.wanted) {
    police.wanted = stars;
    police.dispatchLog.unshift(`Central GIC: ${reason} — wanted ${stars} bintang.`);
    if (police.dispatchLog.length > 4) police.dispatchLog.pop();
  } else police.wanted = stars;
}

export function dispatchLine(police) {
  return police.dispatchLog[0] || 'Central GIC: semua unit siaga, Isla Caldera aman.';
}

function spawnPatrol(police, player) {
  const a = Math.random() * Math.PI * 2;
  const c = makeCar('police', player.x + Math.sin(a) * 55, player.z + Math.cos(a) * 55, a);
  c.police = true; c.lightOn = true; c.pit = police.wanted >= 4;
  police.cars.push(c);
  if (police.wanted >= 4) police.dispatchLog.unshift('Central GIC: Unit ARIETE dikerahkan — siap RAM/PIT.');
}

function spawnRoadblock(police, city, player) {
  const ahead = 42;
  const fx = Math.sin(player.heading || 0), fz = Math.cos(player.heading || 0);
  const bx = player.x + fx * ahead, bz = player.z + fz * ahead;
  const cars = [];
  const px = -fz, pz = fx;
  for (let i = -1; i <= 1; i++) {
    const c = makeCar('police', bx + px * i * 5, bz + pz * i * 5, (player.heading || 0) + Math.PI / 2);
    c.police = true; c.lightOn = true; c.roadblock = true; c.speed = 0;
    cars.push(c);
  }
  police.roadblock = { cars, x: bx, z: bz, ttl: 40 };
  police.dispatchLog.unshift('Central GIC: Unit MURALLA memasang roadblock di depanmu.');
}

export function updatePolice(city, police, player, dt) {
  police.spawnCd -= dt; police.roadblockCd -= dt; police.sinceCrime += dt; police.heliCd -= dt;
  const want = police.wanted;

  // --- Spawning: more stars, more units, faster.
  const targetUnits = want === 0 ? 0 : want < 2 ? 1 : want < 3 ? 2 : want < 4 ? 3 : 4;
  if (police.cars.length < targetUnits && police.spawnCd <= 0 && want > 0) {
    spawnPatrol(police, player);
    police.spawnCd = want >= 4 ? 2.5 : 5;
  }
  if (want >= 3 && !police.roadblock && police.roadblockCd <= 0) {
    spawnRoadblock(police, city, player);
    police.roadblockCd = 26;
  }
  if (want >= 3 && !police.heli && police.heliCd <= 0) {
    police.heli = { x: player.x + 30, y: HELI_MIN_ALT, z: player.z, angle: 0 };
    police.dispatchLog.unshift('Central GIC: CORMORÁN-1 di udara — jangan kehilangan jejak.');
  }
  if (want < 3 && police.heli) police.heli = null;

  // --- Heat decay: hide from every unit and the stars fall.
  let seen = false;
  for (const c of police.cars) if (dist(c.x, c.z, player.x, player.z) < 55) seen = true;
  if (police.heli) seen = true;
  if (police.roadblock && dist(police.roadblock.x, police.roadblock.z, player.x, player.z) < 45) seen = true;
  if (!seen && want > 0) {
    police.unseen += dt;
    if (police.unseen > 4) { police.heat = Math.max(0, police.heat - dt * 6); police.wanted = Math.ceil(police.heat / 20); }
  } else police.unseen = 0;

  // --- Patrol / ARIETE behaviour: chase, and at 4+ stars PIT-ram the player.
  for (const c of police.cars) {
    const d = dist(c.x, c.z, player.x, player.z);
    const wantAngle = Math.atan2(player.x - c.x, player.z - c.z);
    const steer = clamp(angleDiff(c.angle, wantAngle) * 1.6, -1, 1);
    const throttle = d > 6 ? 1 : 0.4;
    driveCar(city, c, throttle, steer, dt, false);
    c.lightOn = Math.floor(performance.now() / 350) % 2 === 0;
    // PIT: a hard shove when alongside the player's car.
    if (c.pit && player.inCar && d < 5.5) {
      const push = 9;
      player.car.x += Math.sin(c.angle) * push * dt * 3;
      player.car.z += Math.cos(c.angle) * push * dt * 3;
      player.car.angle += 0.6 * dt;
      if (Math.random() < dt * 2) player.car.hp -= 2;
    }
    if (d > 130) { c.dead = true; }
  }
  police.cars = police.cars.filter((c) => !c.dead);

  // --- Roadblock: static cars, expires, then Central pulls it.
  if (police.roadblock) {
    police.roadblock.ttl -= dt;
    for (const c of police.roadblock.cars) collideCircle(city, c, 1.9);
    if (police.roadblock.ttl <= 0 || dist(police.roadblock.x, police.roadblock.z, player.x, player.z) > 90) {
      police.roadblock = null;
    }
  }

  // --- CORMORÁN-1: circles the player at fixed altitude, never below the roofs.
  // If the player commits no crime for 15 s, the heli loses the trail and
  // returns to base — otherwise 3+ stars could never decay.
  if (police.heli) {
    const h = police.heli;
    h.angle += dt * 0.55;
    const r = 34;
    h.x = player.x + Math.sin(h.angle) * r;
    h.z = player.z + Math.cos(h.angle) * r;
    h.y = HELI_MIN_ALT; // fixed: above every building, no clipping possible
    if (police.sinceCrime > 15) {
      police.heli = null;
      police.heliCd = 45; // give the player a real window to break away
      police.dispatchLog.unshift('Central GIC: CORMORÁN-1 kehilangan jejak — kembali ke pangkalan.');
    }
  }
}

export function clearPolice(police) {
  police.wanted = 0; police.heat = 0; police.cars = [];
  police.roadblock = null; police.heli = null; police.unseen = 0;
}
