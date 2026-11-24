// vehicles.js — arcade car physics and the traffic that fills Isla Caldera.
// Every car is a plain object: {x, z, angle, speed, color, ...} so the
// renderer, the police and the missions all share one shape.

import { mulberry32, clamp, range, pick, dist } from './utils.js';
import { collideCircle, WORLD_BOUND } from './city.js';

export const CAR_DEFS = {
  coupe: { name: 'Vela Coupe', accel: 26, top: 34, grip: 3.2, color: [0.85, 0.25, 0.15] },
  sedan: { name: 'Brasa Sedan', accel: 20, top: 27, grip: 2.8, color: [0.2, 0.4, 0.75] },
  van: { name: 'Van Lapis Baja', accel: 15, top: 23, grip: 2.4, color: [0.35, 0.35, 0.38], armor: true },
  taxi: { name: 'Taksi Brasa', accel: 19, top: 26, grip: 2.8, color: [0.95, 0.8, 0.15] },
  pickup: { name: 'Pickup Tito', accel: 22, top: 29, grip: 3.0, color: [0.25, 0.7, 0.35] },
  police: { name: 'GIC Patrol', accel: 24, top: 31, grip: 3.4, color: [0.1, 0.15, 0.35] },
};

export function makeCar(defKey, x, z, angle) {
  const def = CAR_DEFS[defKey];
  return {
    def: defKey, name: def.name, x, z, angle, speed: 0,
    accel: def.accel, top: def.top, grip: def.grip,
    color: def.color.slice(), hp: 100, armor: !!def.armor, traffic: false,
  };
}

// Arcade drive: throttle steers with speed, friction bleeds it off, buildings
// stop the car. Returns true when a wall was hit hard.
export function driveCar(city, car, throttle, steer, dt, handbrake) {
  const forward = throttle;
  car.speed += forward * car.accel * dt;
  car.speed -= car.speed * (handbrake ? 3.2 : 0.9) * dt;
  if (throttle === 0) car.speed -= car.speed * 1.4 * dt;
  car.speed = clamp(car.speed, -car.top * 0.45, car.top);
  const turn = steer * car.grip * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += turn;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const before = { x: car.x, z: car.z };
  car.x = nx; car.z = nz;
  const hit = collideCircle(city, car, 1.9);
  if (hit) {
    const impact = Math.abs(car.speed);
    car.speed *= -0.25;
    return impact > 6;
  }
  if (Math.abs(car.x) >= WORLD_BOUND - 1 || Math.abs(car.z) >= WORLD_BOUND - 1) car.speed *= 0.9;
  return false;
}

export function createTraffic(city, count) {
  const rng = mulberry32(777);
  const cars = [];
  const colors = [[0.85, 0.15, 0.15], [0.15, 0.35, 0.75], [0.95, 0.85, 0.25], [0.25, 0.75, 0.35], [0.85, 0.85, 0.85], [0.15, 0.15, 0.18], [0.95, 0.45, 0.10], [0.6, 0.3, 0.7]];
  for (let i = 0; i < count; i++) {
    const alongX = rng() < 0.5;
    const road = pick(rng, alongX ? city.roadsX : city.roadsZ);
    const t = range(rng, -200, 200);
    const c = makeCar(pick(rng, ['sedan', 'sedan', 'taxi', 'pickup', 'coupe']), alongX ? t : road, alongX ? road : t, alongX ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2));
    c.color = pick(rng, colors).slice();
    c.traffic = true; c.speed = range(rng, 7, 12); c.axis = alongX ? 'x' : 'z'; c.lane = road;
    c.dir = c.angle;
    cars.push(c);
  }
  return cars;
}

// Traffic cruises straight along its road and wraps at the island edge.
export function updateTraffic(city, cars, player, dt) {
  for (const c of cars) {
    const ahead = { x: c.x + Math.sin(c.angle) * 6, z: c.z + Math.cos(c.angle) * 6 };
    let slow = false;
    if (player && player.inCar && dist(ahead.x, ahead.z, player.car.x, player.car.z) < 5) slow = true;
    if (player && !player.inCar && dist(ahead.x, ahead.z, player.x, player.z) < 4) slow = true;
    for (const o of cars) {
      if (o !== c && dist(ahead.x, ahead.z, o.x, o.z) < 5) { slow = true; break; }
    }
    const target = slow ? 0 : c.top * 0.45;
    c.speed += (target - c.speed) * Math.min(1, dt * 1.5);
    c.x += Math.sin(c.angle) * c.speed * dt;
    c.z += Math.cos(c.angle) * c.speed * dt;
    if (c.axis === 'x' && Math.abs(c.x) > 205) c.x = -Math.sign(c.x) * 205;
    if (c.axis === 'z' && Math.abs(c.z) > 205) c.z = -Math.sign(c.z) * 205;
    collideCircle(city, c, 1.9);
  }
}

// Nearest drivable car to a point (traffic, parked or mission cars).
export function nearestCar(cars, x, z, maxD) {
  let best = null, bd = maxD * maxD;
  for (const c of cars) {
    const d2 = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
    if (d2 < bd) { bd = d2; best = c; }
  }
  return best;
}
