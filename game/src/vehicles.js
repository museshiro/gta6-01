// vehicles.js — cars for CALDERA VIVA: the player's car, traffic and the cars
// the police and the missions drive. Arcade physics: throttle, steering, a
// handbrake, building collision and car-to-car bumps. No physics library.

import { clamp, angleLerp, dist2 } from './utils.js';
import { collideWorld, ROAD_LINES, nearestRoadPoint } from './city.js';

const TRAFFIC_COLORS = [
  [0.75, 0.75, 0.78], [0.85, 0.3, 0.25], [0.25, 0.45, 0.85], [0.9, 0.75, 0.3],
  [0.3, 0.6, 0.35], [0.55, 0.35, 0.65], [0.85, 0.55, 0.2], [0.4, 0.4, 0.45],
];

export function makeCar(x, z, heading, color, opts = {}) {
  return {
    x, z, heading, speed: 0,
    color,
    isPlayer: !!opts.isPlayer,
    isCop: !!opts.isCop,
    isTraffic: !!opts.isTraffic,
    isTarget: !!opts.isTarget,
    isAriete: !!opts.isAriete,
    health: opts.health ?? 100,
    maxSpeed: opts.maxSpeed ?? 24,
    accel: opts.accel ?? 13,
    axis: opts.axis || 'x',
    line: opts.line ?? z,
    dir: opts.dir ?? 1,
    turnCd: 0,
    hidden: false,
    ramCd: 0,
  };
}

export function trafficColor(rng) {
  return TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)];
}

/** Keep ~9 traffic cars on the roads around the player. */
export function spawnTraffic(state, dt) {
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  const alive = state.cars.filter((c) => c.isTraffic && !c.hidden);
  if (alive.length >= 9) return;
  if (state._trafficTimer === undefined) state._trafficTimer = 0;
  state._trafficTimer -= dt;
  if (state._trafficTimer > 0) return;
  state._trafficTimer = 0.8;
  const rng = state.rng;
  const rp = nearestRoadPoint(px + (rng() - 0.5) * 200, pz + (rng() - 0.5) * 200);
  const d = dist2(rp.x, rp.z, px, pz);
  if (d < 45 || d > 170) return;
  const car = makeCar(rp.x, rp.z, rp.axis === 'x' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI), trafficColor(rng), {
    isTraffic: true,
    axis: rp.axis,
    line: rp.axis === 'x' ? rp.x : rp.z,
    dir: rng() < 0.5 ? 1 : -1,
    maxSpeed: 8 + rng() * 4,
  });
  car.speed = car.maxSpeed * 0.8;
  state.cars.push(car);
}

/** Traffic follows its road, turns at intersections, queues behind slow cars. */
export function updateTraffic(state, dt) {
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  for (const car of state.cars) {
    if (!car.isTraffic || car.hidden) continue;
    car.turnCd -= dt;
    // Slow down for a car ahead in the same lane.
    let targetSpeed = car.maxSpeed;
    for (const other of state.cars) {
      if (other === car || other.hidden) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = car.axis === 'x' ? dx * car.dir : dz * car.dir;
      const side = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
      if (ahead > 0 && ahead < 12 && side < 3) targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed - 1));
    }
    car.speed += clamp(targetSpeed - car.speed, -10 * dt, 6 * dt);
    if (car.axis === 'x') car.x += car.dir * car.speed * dt;
    else car.z += car.dir * car.speed * dt;
    // Turn at an intersection sometimes.
    const cross = car.axis === 'x' ? car.z : car.x;
    const nearLine = ROAD_LINES.find((l) => Math.abs(cross - l) < 2.5);
    if (nearLine !== undefined && car.turnCd <= 0 && state.rng() < dt * 0.6) {
      car.axis = car.axis === 'x' ? 'z' : 'x';
      car.line = nearLine;
      if (car.axis === 'x') { car.z = nearLine; car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { car.x = nearLine; car.heading = car.dir > 0 ? Math.PI : 0; }
      car.dir = state.rng() < 0.5 ? 1 : -1;
      car.turnCd = 3;
    }
    // Heading follows the axis.
    const want = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? Math.PI : 0);
    car.heading = angleLerp(car.heading, want, Math.min(1, dt * 6));
    if (dist2(car.x, car.z, px, pz) > 220) car.hidden = true;
  }
  state.cars = state.cars.filter((c) => !(c.isTraffic && c.hidden && dist2(c.x, c.z, px, pz) > 220));
}

/** Player-car arcade physics: throttle, steering, handbrake, collisions. */
export function updatePlayerCar(state, dt, input, audio) {
  const car = state.player.car;
  const city = state.city;
  const { throttle, steer } = input;
  const handbrake = input.handbrake;
  const upgrade = state.player.upgrades.engine;
  const maxSpeed = car.maxSpeed * (1 + upgrade * 0.15);
  const maxReverse = 9;
  if (throttle > 0) car.speed += car.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= 22 * dt; // brake
    else car.speed -= 8 * dt; // reverse
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  }
  car.speed = clamp(car.speed, -maxReverse, maxSpeed);
  const steerRate = 2.1 * clamp(Math.abs(car.speed) / 8, 0.25, 1) * (handbrake ? 1.7 : 1);
  car.heading += steer * steerRate * dt * (car.speed >= 0 ? 1 : -1);
  if (handbrake) car.speed *= Math.max(0, 1 - 0.9 * dt);
  const fx = Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const nx = car.x + fx * car.speed * dt;
  const nz = car.z + fz * car.speed * dt;
  const hit = collideWorld(city, nx, nz, 2.1);
  const crashed = Math.abs(hit.x - nx) > 0.01 || Math.abs(hit.z - nz) > 0.01;
  if (crashed && Math.abs(car.speed) > 9) {
    audio.sfx('crash');
    car.health -= Math.abs(car.speed) * 0.6;
    if (car.health <= 0) {
      // Wrecked: the player stumbles out on foot.
      state.player.onFoot = true;
      state.player.x = car.x + 3;
      state.player.z = car.z + 3;
      state.player.heading = car.heading;
      car.hidden = true;
      state.player.car = null;
    }
  }
  if (crashed) car.speed *= 0.35;
  car.x = hit.x;
  car.z = hit.z;
  // Car-to-car bumps.
  for (const other of state.cars) {
    if (other === car || other.hidden) continue;
    const d = dist2(car.x, car.z, other.x, other.z);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / 2;
      const ux = (car.x - other.x) / d;
      const uz = (car.z - other.z) / d;
      car.x += ux * push;
      car.z += uz * push;
      other.x -= ux * push;
      other.z -= uz * push;
      if (Math.abs(car.speed) > 6) {
        other.speed = Math.max(other.speed, car.speed * 0.4);
        if (other.isCop) other.health -= 4;
      }
      car.speed *= 0.92;
    }
  }
}

export function nearestCar(state, x, z, maxDist, filter) {
  let best = null;
  let bd = maxDist;
  for (const car of state.cars) {
    if (car.hidden) continue;
    if (filter && !filter(car)) continue;
    const d = dist2(car.x, car.z, x, z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
