// player.js — the protagonist of CALDERA VIVA: on-foot movement and combat,
// stealing and driving cars, the weapon wheel, the garage and the crew call.
// Mara Vela drives the getaway car; Tito Branco runs the garage.

import { clamp, dist2, angleWrap } from './utils.js';
import { collideWorld } from './city.js';
import { nearestCar } from './vehicles.js';
import { nearestPed } from './pedestrians.js';

export const WEAPONS = {
  pistol: { name: 'Pistol', dmg: 34, rate: 0.35, range: 42, pellets: 1 },
  smg: { name: 'SMG', dmg: 16, rate: 0.09, range: 34, pellets: 1 },
  shotgun: { name: 'Shotgun', dmg: 11, rate: 0.8, range: 18, pellets: 6 },
  molotov: { name: 'Molotov', dmg: 60, rate: 1.0, range: 26, pellets: 1 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'molotov'];

export function makePlayer(spawn) {
  return {
    x: spawn.x, z: spawn.z, heading: spawn.heading,
    onFoot: true, car: null,
    health: 100, money: 250, respect: 0,
    weapon: 'pistol',
    weapons: {
      pistol: { ammo: Infinity },
      smg: { ammo: 120 },
      shotgun: { ammo: 24 },
      molotov: { ammo: 6 },
    },
    upgrades: { engine: 0, armor: 0 },
    fireCd: 0,
    crewCd: 0,
    garageNear: false,
  };
}

export function respectRank(respect) {
  if (respect >= 1400) return 'Raja Caldera';
  if (respect >= 900) return 'Raja Boardwalk';
  if (respect >= 500) return 'Anak Dermaga';
  if (respect >= 200) return 'Kurir Garam';
  return 'Pemula Pantai';
}

/** Aim direction on foot: toward the mouse's ground point, else the facing. */
function aimHeading(state) {
  const p = state.player;
  const px = p.onFoot ? p.x : (p.car ? p.car.x : p.x);
  const pz = p.onFoot ? p.z : (p.car ? p.car.z : p.z);
  const m = state._mouseWorld;
  if (m) {
    const dx = m.x - px;
    const dz = m.z - pz;
    if (Math.hypot(dx, dz) > 0.5) return Math.atan2(dx, -dz);
  }
  return p.heading;
}

export function updatePlayer(state, dt, input, audio) {
  const p = state.player;
  p.fireCd -= dt;
  p.crewCd -= dt;
  const city = state.city;

  if (p.onFoot) {
    // Mouse aim; WASD moves relative to the facing direction.
    p.heading = aimHeading(state);
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = run ? 9 : 6;
    const f = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const s = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    const fx = Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    const rx = Math.cos(p.heading);
    const rz = Math.sin(p.heading);
    const mx = (fx * f + rx * s) * speed * dt;
    const mz = (fz * f + rz * s) * speed * dt;
    const hit = collideWorld(city, p.x + mx, p.z + mz, 0.5);
    p.x = hit.x;
    p.z = hit.z;
    // Steal / enter the nearest car.
    if (input.wasPressed('KeyE')) {
      const car = nearestCar(state, p.x, p.z, 5, (c) => !c.isPlayer);
      if (car) {
        if (car.isCop || car.isTarget) {
          state.police.heat = clamp(state.police.heat + 15, 0, 100);
          state.police.lastCrime = state.time;
        }
        car.isPlayer = true;
        car.isTraffic = false;
        p.car = car;
        p.onFoot = false;
        state.toast = 'Mobil diambil — ' + (car.isCop ? 'itu mobil GIC!' : 'gas!');
        if (car.isCop || car.isTarget) audio.sfx('pickup');
      }
    }
    // Shoot on click or J.
    if ((input.mouseClicked || input.isDown('KeyJ')) && p.fireCd <= 0) {
      shoot(state, audio);
    }
  } else {
    // In the car: E gets out.
    if (input.wasPressed('KeyE')) {
      const car = p.car;
      p.x = car.x + Math.cos(car.heading) * 3;
      p.z = car.z + Math.sin(car.heading) * 3;
      p.heading = car.heading;
      p.onFoot = true;
      car.isPlayer = false;
      p.car = null;
    }
  }

  // Weapon switch 1-4.
  for (let i = 0; i < 4; i++) {
    if (input.wasPressed('Digit' + (i + 1))) {
      p.weapon = WEAPON_ORDER[i];
      state.toast = WEAPONS[p.weapon].name + ' dipilih';
    }
  }

  // Garage: F repairs ($200), G engine upgrade ($800), H armour ($600).
  const g = city.garage;
  p.garageNear = dist2(p.x, p.z, g.x, g.z) < 16 || (p.car && dist2(p.car.x, p.car.z, g.x, g.z) < 16);
  if (p.garageNear) {
    if (input.wasPressed('KeyF') && p.car && p.car.health < 100 && p.money >= 200) {
      p.money -= 200;
      p.car.health = 100;
      state.toast = "Tito memperbaiki mobilmu — $200";
      audio.sfx('pickup');
    }
    if (input.wasPressed('KeyG') && p.upgrades.engine < 2 && p.money >= 800) {
      p.money -= 800;
      p.upgrades.engine++;
      state.toast = 'Mesin ditingkatkan ke level ' + p.upgrades.engine + ' — $800';
      audio.sfx('mission');
    }
    if (input.wasPressed('KeyH') && p.upgrades.armor < 2 && p.money >= 600) {
      p.money -= 600;
      p.upgrades.armor++;
      state.toast = 'Armor dipasang level ' + p.upgrades.armor + ' — $600';
      audio.sfx('mission');
    }
  }

  // Crew call: T — Mara Vela sends a car (60 s cooldown).
  if (input.wasPressed('KeyT') && p.crewCd <= 0) {
    p.crewCd = 60;
    const hx = p.onFoot ? p.x : p.car.x;
    const hz = p.onFoot ? p.z : p.car.z;
    const spot = collideWorld(city, hx + 10, hz + 6, 2.5);
    const car = {
      x: spot.x, z: spot.z, heading: p.heading, speed: 0,
      color: [0.9, 0.25, 0.3], isPlayer: false, isCop: false, isTraffic: false,
      isTarget: false, isAriete: false, health: 100, maxSpeed: 28, accel: 15,
      axis: 'x', line: spot.z, dir: 1, turnCd: 0, hidden: false, ramCd: 0,
    };
    state.cars.push(car);
    state.toast = 'Mara Vela mengirim mobil merah ke lokasimu';
    audio.sfx('pickup');
  }
}

/** Fire the current weapon at the aim point. */
export function shoot(state, audio) {
  const p = state.player;
  const w = WEAPONS[p.weapon];
  const slot = p.weapons[p.weapon];
  if (slot.ammo <= 0) {
    state.toast = w.name + ' kehabisan amunisi';
    p.fireCd = 0.3;
    return;
  }
  if (slot.ammo !== Infinity) slot.ammo--;
  p.fireCd = w.rate;
  const aim = aimHeading(state);
  const fx = Math.sin(aim);
  const fz = -Math.cos(aim);
  const ox = p.onFoot ? p.x : (p.car ? p.car.x : p.x);
  const oz = p.onFoot ? p.z : (p.car ? p.car.z : p.z);
  state.lastShotPos = { x: ox + fx * 6, z: oz + fz * 6 };
  state.muzzle = { x: ox + fx * 1.6, y: 1.4, z: oz + fz * 1.6, ttl: 0.07 };
  audio.sfx('shot');
  state.police.heat = clamp(state.police.heat + 6, 0, 100);
  state.police.lastCrime = state.time;

  if (p.weapon === 'molotov') {
    const tx = ox + fx * Math.min(w.range, 20);
    const tz = oz + fz * Math.min(w.range, 20);
    state.explosion = { x: tx, z: tz, ttl: 0.6 };
    audio.sfx('explosion');
    for (const ped of state.peds) {
      if (ped.state !== 'down' && dist2(ped.x, ped.z, tx, tz) < 7) {
        ped.health -= w.dmg;
        if (ped.health <= 0) { ped.state = 'down'; state.police.heat = clamp(state.police.heat + 20, 0, 100); }
      }
    }
    for (const car of state.cars) {
      if (!car.hidden && dist2(car.x, car.z, tx, tz) < 7) {
        car.health -= w.dmg;
        if (car.health <= 0 && !car.isPlayer) { car.hidden = true; state.police.heat = clamp(state.police.heat + 15, 0, 100); }
      }
    }
    return;
  }

  // Hitscan: nearest living target inside the range and a 15-degree cone.
  let best = null;
  let bestScore = Infinity;
  const consider = (tx, tz, kind, ref) => {
    const dx = tx - ox;
    const dz = tz - oz;
    const d = Math.hypot(dx, dz);
    if (d > w.range || d < 0.5) return;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < 0.96) return;
    const score = d + (1 - dot) * 40;
    if (score < bestScore) { bestScore = score; best = { kind, ref, d }; }
  };
  for (const ped of state.peds) {
    if (ped.state !== 'down') consider(ped.x, ped.z, 'ped', ped);
  }
  for (const car of state.cars) {
    if (!car.hidden && !car.isPlayer) consider(car.x, car.z, 'car', car);
  }
  if (!best) return;
  const dmg = w.dmg * w.pellets;
  if (best.kind === 'ped') {
    best.ref.health -= dmg;
    if (best.ref.health <= 0) {
      best.ref.state = 'down';
      state.police.heat = clamp(state.police.heat + 20, 0, 100);
      state.police.lastCrime = state.time;
      if (best.ref.isGuard) state.missionKills = (state.missionKills || 0) + 1;
    }
  } else {
    best.ref.health -= dmg;
    if (best.ref.health <= 0) {
      best.ref.hidden = true;
      state.police.heat = clamp(state.police.heat + 15, 0, 100);
      state.police.lastCrime = state.time;
      if (best.ref.isTarget) state.missionTargetDown = true;
      state.explosion = { x: best.ref.x, z: best.ref.z, ttl: 0.5 };
      audio.sfx('explosion');
    }
  }
}

export function damagePlayer(state, amount) {
  const p = state.player;
  const reduced = amount * (1 - p.upgrades.armor * 0.2);
  p.health -= reduced;
  if (p.health <= 0) {
    p.health = 0;
    state.mode = 'wasted';
  }
}
