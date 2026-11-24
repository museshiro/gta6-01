// police.js — the Guardia Insular de Caldera (GIC) and the wanted system.
// Wanted 0-5 from heat: pursuit cars, MURALLA roadblocks at 3 stars, ARIETE
// PIT units at 4, and the CORMORÁN-1 helicopter at altitude 48 — above the
// tallest roof (~42), so it always sees the streets. The helicopter loses the
// trail after 15 seconds of game time without a crime, then a 45 s cooldown.

import { clamp, dist2, angleWrap } from './utils.js';
import { collideWorld, ROAD_LINES, nearestRoadPoint } from './city.js';
import { makeCar } from './vehicles.js';
import { damagePlayer } from './player.js';

export function makePoliceState() {
  return {
    wanted: 0,
    heat: 0,
    lastCrime: -999,
    heli: { active: false, x: 0, z: 0, loseT: 0, cooldown: 0 },
    roadblocks: [],
    bustedT: 0,
    spawnT: 0,
    roadblockCd: 0,
  };
}

export function wantedFromHeat(heat) {
  if (heat >= 90) return 5;
  if (heat >= 70) return 4;
  if (heat >= 50) return 3;
  if (heat >= 30) return 2;
  if (heat >= 12) return 1;
  return 0;
}

export function addHeat(state, amount) {
  const pol = state.police;
  pol.heat = clamp(pol.heat + amount, 0, 100);
  pol.lastCrime = state.time;
  pol.wanted = wantedFromHeat(pol.heat);
}

function playerPos(state) {
  const p = state.player;
  return p.onFoot ? { x: p.x, z: p.z } : { x: p.car.x, z: p.car.z };
}

export function updatePolice(state, dt, audio) {
  const pol = state.police;
  const p = state.player;
  const city = state.city;
  const pos = playerPos(state);

  // Heat cools when the player stays clean.
  if (state.time - pol.lastCrime > 5) {
    pol.heat = Math.max(0, pol.heat - 2.5 * dt);
  }
  pol.wanted = wantedFromHeat(pol.heat);
  const wanted = pol.wanted;

  // --- Pursuit cars -------------------------------------------------------
  const cops = state.cars.filter((c) => c.isCop && !c.hidden);
  pol.spawnT -= dt;
  if (cops.length < wanted && pol.spawnT <= 0) {
    pol.spawnT = 1.2;
    const rp = nearestRoadPoint(pos.x + (state.rng() - 0.5) * 160, pos.z + (state.rng() - 0.5) * 160);
    const isAriete = wanted >= 4 && cops.filter((c) => c.isAriete).length < 2;
    const car = makeCar(rp.x, rp.z, 0, isAriete ? [0.12, 0.12, 0.14] : [0.9, 0.9, 0.92], {
      isCop: true,
      isAriete,
      maxSpeed: isAriete ? 27 : 19 + wanted * 1.6,
      accel: 16,
      health: 120,
    });
    state.cars.push(car);
  }
  if (wanted === 0) {
    for (const c of cops) c.hidden = true;
    state.cars = state.cars.filter((c) => !c.hidden || c.isPlayer);
  }

  for (const cop of cops) {
    if (cop.hidden) continue;
    cop.ramCd -= dt;
    // Aim: ARIETE pits the rear quarter; the rest chase the bumper.
    let tx = pos.x;
    let tz = pos.z;
    if (cop.isAriete && !p.onFoot && p.car) {
      const fx = Math.sin(p.car.heading);
      const fz = -Math.cos(p.car.heading);
      tx = p.car.x - fx * 3 + Math.cos(p.car.heading) * 2.5;
      tz = p.car.z - fz * 3 + Math.sin(p.car.heading) * 2.5;
    }
    const dx = tx - cop.x;
    const dz = tz - cop.z;
    const d = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx / d, -dz / d);
    cop.heading += clamp(angleWrap(wantHeading - cop.heading), -2.4 * dt, 2.4 * dt);
    const targetSpeed = d > 8 ? cop.maxSpeed : cop.maxSpeed * 0.6;
    cop.speed += clamp(targetSpeed - cop.speed, -14 * dt, 10 * dt);
    const nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
    const nz = cop.z - Math.cos(cop.heading) * cop.speed * dt;
    const hit = collideWorld(city, nx, nz, 2.1);
    cop.x = hit.x;
    cop.z = hit.z;
    // Ram the player's car.
    if (!p.onFoot && p.car && d < 4.6 && cop.ramCd <= 0) {
      cop.ramCd = 1.2;
      p.car.speed *= 0.82;
      p.car.health -= cop.isAriete ? 9 : 5;
      audio.sfx('crash');
      if (p.car.health <= 0) {
        p.onFoot = true;
        p.x = p.car.x + 3;
        p.z = p.car.z + 3;
        p.heading = p.car.heading;
        p.car.hidden = true;
        p.car = null;
      }
    }
    // Busted: a cop stays on the player.
    if (d < 4) {
      const slow = p.onFoot || (p.car && Math.abs(p.car.speed) < 2);
      if (slow) pol.bustedT += dt;
      else pol.bustedT = Math.max(0, pol.bustedT - dt);
    } else {
      pol.bustedT = Math.max(0, pol.bustedT - dt * 2);
    }
    if (pol.bustedT > 2.5) {
      state.mode = 'busted';
      audio.sfx('busted');
    }
    // A cop that catches the player on foot roughs him up.
    if (p.onFoot && d < 2.2 && cop.ramCd <= 0) {
      cop.ramCd = 1.0;
      damagePlayer(state, 12);
    }
  }

  // --- MURALLA roadblock (3 stars) ---------------------------------------
  pol.roadblockCd -= dt;
  if (wanted >= 3 && pol.roadblocks.length === 0 && pol.roadblockCd <= 0) {
    pol.roadblockCd = 25;
    const fx = p.onFoot ? Math.sin(p.heading) : Math.sin(p.car.heading);
    const fz = p.onFoot ? -Math.cos(p.heading) : -Math.cos(p.car.heading);
    const bx = pos.x + fx * 55;
    const bz = pos.z + fz * 55;
    const heading = Math.atan2(fx, -fz);
    const blocks = [];
    for (const off of [-6, 0, 6]) {
      blocks.push({ x: bx + Math.cos(heading) * off, z: bz + Math.sin(heading) * off, broken: false });
    }
    pol.roadblocks.push({ x: bx, z: bz, heading, blocks });
    state.toast = 'GIC: Unit MURALLA memasang roadblock di depan!';
  }
  for (const rb of pol.roadblocks) {
    for (const b of rb.blocks) {
      if (b.broken) continue;
      if (!p.onFoot && p.car && dist2(p.car.x, p.car.z, b.x, b.z) < 3.2) {
        if (Math.abs(p.car.speed) > 8) {
          b.broken = true;
          p.car.health -= 12;
          p.car.speed *= 0.6;
          addHeat(state, 5);
          state.toast = 'Muralla ditembus!';
          audio.sfx('crash');
        } else {
          p.car.speed *= 0.4;
        }
      }
    }
    if (dist2(pos.x, pos.z, rb.x, rb.z) > 140) rb.gone = true;
  }
  pol.roadblocks = pol.roadblocks.filter((rb) => !rb.gone && rb.blocks.some((b) => !b.broken));

  // --- CORMORÁN-1 helicopter (3 stars, altitude 48) -----------------------
  const heli = pol.heli;
  heli.cooldown -= dt;
  if (wanted >= 3 && !heli.active && heli.cooldown <= 0) {
    heli.active = true;
    heli.x = pos.x;
    heli.z = pos.z - 40;
    state.toast = 'CORMORÁN-1 di udara — mereka melihatmu';
  }
  if (heli.active) {
    heli.x += (pos.x - heli.x) * Math.min(1, dt * 1.2);
    heli.z += (pos.z - heli.z) * Math.min(1, dt * 1.2);
    if (state.time - pol.lastCrime > 15) {
      heli.loseT += dt;
      if (heli.loseT > 0.5) {
        heli.active = false;
        heli.cooldown = 45;
        heli.loseT = 0;
        state.toast = 'CORMORÁN-1 kehilangan jejak — cooldown 45 dtk';
      }
    } else {
      heli.loseT = 0;
    }
    if (wanted < 3) {
      heli.active = false;
      heli.cooldown = Math.max(heli.cooldown, 10);
    }
  }

  // Siren loudness by the nearest cop.
  let nearest = Infinity;
  for (const c of cops) nearest = Math.min(nearest, dist2(c.x, c.z, pos.x, pos.z));
  audio.setSiren(wanted > 0, clamp(nearest / 120, 0, 1));
}
