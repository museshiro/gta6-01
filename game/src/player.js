// player.js — the protagonist of CALDERA VIVA: on foot, behind the wheel,
// and down the barrel of the weapon wheel. One object, three modes.

import { clamp, dist, angleDiff } from './utils.js';
import { collideCircle } from './city.js';
import { driveCar, nearestCar } from './vehicles.js';

export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', key: '1', damage: 34, range: 42, rate: 0.28, ammo: Infinity, spread: 0.02 },
  { id: 'smg', name: 'SMG', key: '2', damage: 16, range: 36, rate: 0.09, ammo: 240, spread: 0.06 },
  { id: 'shotgun', name: 'Shotgun', key: '3', damage: 22, range: 18, rate: 0.7, ammo: 40, spread: 0.16, pellets: 5 },
  { id: 'molotov', name: 'Molotov', key: '4', damage: 55, range: 26, rate: 0.9, ammo: 8, spread: 0.03, aoe: 6 },
];

export function createPlayer(x, z) {
  return {
    x, z, angle: 0, heading: 0, health: 100, armor: 0,
    inCar: false, car: null, speed: 0,
    weapon: 0, ammo: [Infinity, 240, 40, 8], shootCd: 0,
    crewCd: 0, moving: false,
  };
}

export function updatePlayer(game, dt) {
  const p = game.player, input = game.input;
  p.shootCd -= dt; p.crewCd -= dt;

  // Weapon select.
  for (let i = 0; i < 4; i++) if (input.hit(String(i + 1))) { p.weapon = i; game.toast('Senjata', WEAPONS[i].name); }

  // Crew call: T — Mara sends a getaway car, Tito covers with fire.
  if (input.hit('t') && p.crewCd <= 0) { game.crewCall(); p.crewCd = 25; }

  if (p.inCar && p.car) {
    const throttle = (input.down('w', 'arrowup') ? 1 : 0) - (input.down('s', 'arrowdown') ? 0.7 : 0);
    const steer = (input.down('a', 'arrowleft') ? -1 : 0) + (input.down('d', 'arrowright') ? 1 : 0);
    const hard = driveCar(game.city, p.car, throttle, -steer, dt, input.down(' '));
    if (hard) { p.car.hp -= 6; game.audio.hit(); }
    p.x = p.car.x; p.z = p.car.z; p.angle = p.car.angle; p.heading = p.car.angle;
    p.speed = Math.abs(p.car.speed);
    if (p.car.hp <= 0) {
      game.toast('Mobil hancur!', 'Keluar dan cari kendaraan lain.');
      exitCar(game);
    }
    if (input.hit('e')) exitCar(game);
    if (input.hit('f')) game.tryGarage();
  } else {
    // On foot: WASD relative to the camera heading.
    const camYaw = game.camHeading;
    let mx = 0, mz = 0;
    if (input.down('w', 'arrowup')) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.down('s', 'arrowdown')) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
    if (input.down('a', 'arrowleft')) { mx += Math.sin(camYaw - Math.PI / 2); mz += Math.cos(camYaw - Math.PI / 2); }
    if (input.down('d', 'arrowright')) { mx += Math.sin(camYaw + Math.PI / 2); mz += Math.cos(camYaw + Math.PI / 2); }
    const len = Math.hypot(mx, mz);
    p.moving = len > 0;
    if (len > 0) {
      const sp = input.down('shift') ? 7.5 : 4.6;
      p.x += (mx / len) * sp * dt; p.z += (mz / len) * sp * dt;
      p.angle = Math.atan2(mx / len, mz / len);
      p.heading = p.angle;
    }
    collideCircle(game.city, p, 0.6);
    p.speed = p.moving ? 4.6 : 0;

    if (input.hit('e')) {
      const car = nearestCar(game.allCars(), p.x, p.z, 4.5);
      if (car) enterCar(game, car);
    }
    if (input.hit('f')) game.tryGarage();
  }

  // Shooting: mouse click fires toward the camera aim (player heading).
  if (input.mouse.clicked && !p.inCar) shoot(game);
  else if (input.mouse.down && p.inCar) { /* drive-by not modelled; horn instead */ }
  if (input.hit('q')) game.hud.toggleWheel();
}

export function enterCar(game, car) {
  const p = game.player;
  p.inCar = true; p.car = car; car.traffic = false;
  if (car.missionCar) game.toast('Kendaraan misi', car.name + ' — ikuti penanda kuning.');
  else {
    game.toast('Mobil dicuri', car.name);
    game.addHeat(12, 'pencurian mobil');
  }
  game.audio.pickup();
}

export function exitCar(game) {
  const p = game.player;
  if (!p.car) return;
  p.x = p.car.x - Math.sin(p.car.angle) * 2.5;
  p.z = p.car.z - Math.cos(p.car.angle) * 2.5;
  p.inCar = false; p.car = null;
}

function shoot(game) {
  const p = game.player;
  if (p.shootCd > 0) return;
  const w = WEAPONS[p.weapon];
  if (p.ammo[p.weapon] !== Infinity && p.ammo[p.weapon] <= 0) {
    game.toast('Habis!', w.name + ' kehabisan amunisi — isi di garage.');
    p.shootCd = 0.4; return;
  }
  p.shootCd = w.rate;
  if (p.ammo[p.weapon] !== Infinity) p.ammo[p.weapon]--;
  game.audio.shoot();
  const pellets = w.pellets || 1;
  let hitAnything = false;
  for (let i = 0; i < pellets; i++) {
    const aim = p.angle + (Math.random() - 0.5) * w.spread * 2;
    const hx = p.x + Math.sin(aim) * w.range, hz = p.z + Math.cos(aim) * w.range;
    game.spawnParticle(hx, hz, 1.2, [1, 0.8, 0.2], 0.15);
    // Hit test: nearest living ped / police car inside the cone.
    const targets = [];
    for (const ped of game.peds) if (!ped.dead) targets.push({ x: ped.x, z: ped.z, r: 1.2, obj: ped, kind: 'ped' });
    for (const c of game.police.cars) targets.push({ x: c.x, z: c.z, r: 2.4, obj: c, kind: 'car' });
    if (game.police.roadblock) for (const c of game.police.roadblock.cars) targets.push({ x: c.x, z: c.z, r: 2.4, obj: c, kind: 'car' });
    let best = null, bd = 1e9;
    for (const t of targets) {
      const dx = t.x - p.x, dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + t.r) continue;
      const ang = Math.atan2(dx, dz);
      if (Math.abs(angleDiff(aim, ang)) > 0.22 + t.r / Math.max(d, 1)) continue;
      if (d < bd) { bd = d; best = t; }
    }
    if (best) {
      hitAnything = true;
      if (w.aoe) {
        game.spawnParticle(best.x, best.y || 1, best.z, [1, 0.4, 0.1], 0.5);
        for (const ped of game.peds) if (dist(ped.x, ped.z, best.x, best.z) < w.aoe) damagePed(game, ped, w.damage);
      } else if (best.kind === 'ped') damagePed(game, best.obj, w.damage);
      else { best.obj.hp -= w.damage; if (best.obj.hp <= 0) { best.obj.dead = true; game.onKill(); } }
      game.spawnParticle(best.x, 1.4, best.z, [1, 0.2, 0.2], 0.25);
    }
  }
  if (hitAnything) game.audio.hit();
  game.addHeat(6, 'tembakan di jalan');
  game.panicAt = { x: p.x, z: p.z };
}

function damagePed(game, ped, dmg) {
  ped.hp -= dmg;
  if (ped.hp <= 0 && !ped.dead) {
    ped.dead = true;
    game.onKill();
    if (ped.hostile) game.toast('Target tumbang', 'Satu penjaga lagi berkurang.');
    else game.addHeat(8, 'warga tertembak');
  }
}
