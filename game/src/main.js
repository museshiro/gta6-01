// main.js — CALDERA VIVA bootstrap: game state, the main loop, saves,
// garage, street races, crew calls and day/night. Every system meets here.

import { buildCity, districtAt, collideCircle, pointInCollider } from './city.js';
import { createRenderer, computeCamera } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createPlayer, updatePlayer, WEAPONS } from './player.js';
import { makeCar, createTraffic, updateTraffic } from './vehicles.js';
import { createCrowd, updatePeds, makePed } from './pedestrians.js';
import { createPolice, updatePolice, addHeat, clearPolice } from './police.js';
import { createMissionState, startMission, updateMission, abortMission, currentStepLabel } from './missions.js';
import { applyShot } from './shots.js';
import { clamp, dist, fmtCash } from './utils.js';

const SAVE_KEY = 'caldera-viva-save-v4';
const RANKS = [[20, 'Pemula Pantai'], [60, 'Anak Jalanan'], [120, 'Tangan Kanan'], [200, 'Bos Distrik'], [1e9, 'Raja Caldera']];

const canvas = document.getElementById('game-canvas');
const city = buildCity();
const renderer = createRenderer(canvas, city);

const game = {
  city, renderer, state: 'menu', paused: false,
  player: createPlayer(12, 60),
  police: createPolice(),
  missions: createMissionState(),
  traffic: createTraffic(city, 14),
  peds: createCrowd(city, 26),
  missionCars: [], guards: [],
  parkedCars: [],
  particles: [], marker: null,
  cash: 500, respect: 0, standing: { brasa: 10, boardwalk: 0, dermaga: 0, bukit: 0, tuo: 5 },
  upgrades: { engine: 0, armor: 0 },
  hour: 17.5, kills: 0, panicAt: null,
  race: { active: false, available: true, cp: 0, total: 0, time: 0, points: [] },
  camHeading: 0, camMode: 'chase', orbitYaw: 0,
  bustedTimer: 0, garageOpen: false,
  input: null, audio: null, hud: null, camPrev: null,
};

game.input = createInput(canvas);
game.audio = createAudio();
game.hud = createHud(game);

// Parked cars become stealable world objects.
for (const pk of city.parked) {
  const c = makeCar('sedan', pk.x, pk.z, pk.angle);
  c.color = pk.color.slice(); c.parked = true;
  game.parkedCars.push(c);
}

game.rankName = () => { for (const [t, n] of RANKS) if (game.respect < t) return n; return 'Raja Caldera'; };
game.allCars = () => [...game.traffic, ...game.parkedCars, ...game.missionCars, ...game.police.cars];
game.toast = (t, b) => game.hud.toast(t, b);
game.currentStepLabel = () => currentStepLabel(game);
game.setTimeOfDay = (h) => { game.hour = h; };
game.setWanted = (n) => { game.police.heat = n * 20; game.police.wanted = n; };
game.addHeat = (amt, reason) => addHeat(game.police, amt, reason);
game.setMarker = (x, z) => { game.marker = { x, z }; };
game.clearMarker = () => { game.marker = null; };
game.onKill = () => { game.kills++; };
game.spawnParticle = (x, y, z, color, ttl) => {
  game.particles.push({ x, y, z, s: 0.5 + Math.random() * 0.5, color, ttl: ttl || 0.3, max: ttl || 0.3 });
};

game.spawnMissionActors = (def) => {
  const open = (x, z) => {
    if (!pointInCollider(city, x, z)) return { x, z };
    for (let r = 4; r <= 64; r += 4) for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2, nx = x + Math.cos(ang) * r, nz = z + Math.sin(ang) * r;
      if (!pointInCollider(city, nx, nz)) return { x: nx, z: nz };
    }
    return { x, z };
  };
  const spawnCar = (key, x, z, angle) => {
    const p = open(x, z);
    const c = makeCar(key, p.x, p.z, angle || 0);
    c.missionCar = key; game.missionCars.push(c); return c;
  };
  const spawnGuards = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const p = open(x + (Math.random() - 0.5) * 14, z + (Math.random() - 0.5) * 14);
      const g = makePed(p.x, p.z, true);
      g.mission = true; game.peds.push(g); game.guards.push(g);
    }
  };
  if (def.num === 1) spawnCar('coupe', 36, 192, Math.PI / 2);
  if (def.num === 4) { spawnGuards(150, 60, 4); spawnCar('pickup', 158, 66, 0); }
  if (def.num === 5) spawnCar('van', 0, -90, 0);
  if (def.num === 6) spawnCar('sedan', -104, -14, Math.PI / 2);
  if (def.num === 7) spawnGuards(160, -110, 5);
  if (def.num === 8) spawnGuards(0, 150, 4);
  if (def.num === 9) spawnCar('coupe', 126, -134, Math.PI);
  if (def.num === 10) spawnGuards(-150, -150, 8);
};

game.clearMissionActors = () => {
  game.missionCars = [];
  game.peds = game.peds.filter((p) => !p.mission);
  game.guards = [];
};

game.crewCall = () => {
  const p = game.player;
  if (game.missions.active && (game.missions.active.def.num === 4 || game.missions.active.def.num === 8)) {
    // Tito arrives on foot and covers the player with fire.
    const ally = makePed(p.x + 4, p.z + 4, true);
    ally.ally = true; ally.shirt = [0.25, 0.7, 0.35]; ally.hp = 200;
    game.peds.push(ally);
    game.toast('Crew call — Tito Branco', 'Tito datang memberi bantuan tembak!');
  } else {
    // Mara sends a getaway car nearby.
    const c = makeCar('pickup', p.x + 6, p.z + 6, 0);
    c.missionCar = 'pickup'; c.color = [0.95, 0.35, 0.45];
    game.missionCars.push(c);
    game.toast('Crew call — Mara Vela', 'Mara mengirim mobil kabur ke lokasimu.');
  }
  game.audio.pickup();
};

game.tryGarage = () => {
  const p = game.player, g = city.landmarks.garage;
  if (dist(p.x, p.z, g.x, g.z) > 14) return;
  if (!p.inCar || !p.car) { game.toast('Garage Tito', 'Bawa mobilmu ke sini untuk perbaikan & upgrade.'); return; }
  game.garageOpen = true;
  game.hud.showGarage(true);
};

function closeGarage() { game.garageOpen = false; game.hud.showGarage(false); }

function garageAction(kind) {
  const p = game.player;
  if (!p.car) return;
  if (kind === 'repair') {
    if (game.cash < 200) { game.toast('Uang kurang', 'Perbaikan butuh $200.'); return; }
    game.cash -= 200; p.car.hp = 100;
    game.toast('Garage Tito', 'Mobil diperbaiki penuh.');
  } else if (kind === 'engine') {
    if (game.upgrades.engine >= 3) { game.toast('Maksimal', 'Mesin sudah Lv.3.'); return; }
    const cost = 1500 * (game.upgrades.engine + 1);
    if (game.cash < cost) { game.toast('Uang kurang', `Upgrade mesin Lv.${game.upgrades.engine + 1} butuh ${fmtCash(cost)}.`); return; }
    game.cash -= cost; game.upgrades.engine++;
    p.car.top += 4; p.car.accel += 3;
    game.toast('Garage Tito', `Mesin naik ke Lv.${game.upgrades.engine} — lebih kencang!`);
  } else if (kind === 'armor') {
    if (game.upgrades.armor >= 3) { game.toast('Maksimal', 'Armor sudah Lv.3.'); return; }
    const cost = 1200 * (game.upgrades.armor + 1);
    if (game.cash < cost) { game.toast('Uang kurang', `Armor Lv.${game.upgrades.armor + 1} butuh ${fmtCash(cost)}.`); return; }
    game.cash -= cost; game.upgrades.armor++;
    p.armor = Math.min(100, p.armor + 40);
    game.toast('Garage Tito', `Armor naik ke Lv.${game.upgrades.armor}.`);
  }
  game.audio.pickup();
  game.hud.showGarage(true);
  game.save();
}

// --- Street races: checkpoints around Puerto Brasa, started at the plaza.
const RACE_POINTS = [[0, 0], [90, 0], [90, 90], [0, 135], [-90, 90], [-90, 0], [0, -90], [45, -45]];
function startRace() {
  if (game.race.active || !game.player.inCar) return;
  if (dist(game.player.x, game.player.z, 0, 0) > 20) { game.toast('Balapan jalanan', 'Pergi ke garis start di Plaza Brasa dulu.'); return; }
  game.race.active = true; game.race.cp = 0; game.race.time = 0;
  game.race.total = RACE_POINTS.length; game.race.points = RACE_POINTS;
  game.setMarker(RACE_POINTS[0][0], RACE_POINTS[0][1]);
  game.toast('🏁 BALAPAN DIMULAI', 'Lewati semua checkpoint secepat mungkin!');
  game.audio.mission();
}
function updateRace(dt) {
  const r = game.race;
  if (!r.active) return;
  r.time += dt;
  const pt = r.points[r.cp];
  if (dist(game.player.x, game.player.z, pt[0], pt[1]) < 11) {
    r.cp++; game.audio.pickup();
    if (r.cp >= r.total) {
      r.active = false; game.clearMarker();
      const prize = Math.max(500, 3000 - Math.floor(r.time) * 20);
      game.cash += prize; game.respect += 12;
      game.toast('🏁 BALAPAN MENANG', `Waktu ${r.time.toFixed(1)} dtk — +${fmtCash(prize)} • +12 respect`);
      game.audio.mission(); game.save();
    } else {
      game.setMarker(r.points[r.cp][0], r.points[r.cp][1]);
      game.toast('Checkpoint!', `${r.cp}/${r.total} — lanjut!`);
    }
  }
}

// --- Save / load (localStorage).
game.save = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.cash, respect: game.respect, standing: game.standing,
      upgrades: game.upgrades, completed: game.missions.completed,
      available: game.missions.available, hour: game.hour,
      x: game.player.x, z: game.player.z, ammo: game.player.ammo.map((a) => (a === Infinity ? -1 : a)),
    }));
  } catch (e) { /* storage unavailable: play on without saving */ }
};
game.load = () => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    game.cash = s.cash; game.respect = s.respect; game.standing = s.standing;
    game.upgrades = s.upgrades; game.missions.completed = s.completed || [];
    game.missions.available = s.available || 1; game.hour = s.hour || 17.5;
    game.player.x = s.x ?? 12; game.player.z = s.z ?? 60;
    if (s.ammo) game.player.ammo = s.ammo.map((a) => (a === -1 ? Infinity : a));
    return true;
  } catch (e) { return false; }
};

function respawn(reason) {
  const p = game.player;
  p.health = 100; p.armor = Math.min(100, p.armor);
  p.x = city.landmarks.garage.x; p.z = city.landmarks.garage.z + 10;
  p.inCar = false; p.car = null;
  clearPolice(game.police);
  game.cash = Math.max(0, game.cash - 200);
  game.toast(reason, 'Kamu bangun di Garage Tito. -$200.');
  game.audio.fail();
  game.save();
}

function update(dt) {
  const p = game.player, input = game.input;
  // Global keys.
  if (input.hit('escape', 'p')) {
    if (game.garageOpen) closeGarage();
    else { game.paused = !game.paused; game.hud.showPause(game.paused); }
  }
  if (input.hit('m') && !game.missions.active && game.missions.available <= 10) startMission(game, game.missions.available);
  if (input.hit('b')) startRace();
  if (input.hit('r')) game.toast('Radio', game.audio.cycleRadio());
  if (input.hit('c')) { game.camMode = game.camMode === 'chase' ? 'high' : game.camMode === 'high' ? 'iso' : 'chase'; game.toast('Kamera', 'Mode ' + game.camMode); }
  if (input.hit('n')) { game.audio.toggleMute(); game.toast('Suara', game.audio.muted ? 'dimatikan' : 'dinyalakan'); }
  if (input.hit('l')) { if (game.load()) game.toast('Save dimuat', 'Progres terakhir dipulihkan.'); else game.toast('Tidak ada save', 'Belum ada save tersimpan.'); }
  if (input.mouse.dragDX) game.orbitYaw += input.mouse.dragDX * 0.004;
  game.orbitYaw *= 0.98;

  updatePlayer(game, dt);
  updateTraffic(city, game.traffic, p, dt);
  game.peds = updatePeds(city, game.peds, p, dt, game.panicAt);
  game.panicAt = null;
  updatePolice(city, game.police, p, dt);
  updateMission(game, dt);
  updateRace(dt);

  // Hostile fire hurts the player; police on foot range bust the player.
  for (const ped of game.peds) {
    if (ped.firing && !ped.ally && dist(ped.x, ped.z, p.x, p.z) < 22 && Math.random() < dt * 0.5) {
      p.health -= 3; game.audio.hit();
    }
    if (ped.ally && ped.firing) { /* ally fire is decorative cover */ }
  }
  if (!p.inCar) {
    let nearCop = false;
    for (const c of game.police.cars) if (dist(c.x, c.z, p.x, p.z) < 3.5) nearCop = true;
    if (nearCop && game.police.wanted > 0) {
      game.bustedTimer += dt;
      if (game.bustedTimer > 2) { game.bustedTimer = 0; respawn('DITANGKAP GIC!'); }
    } else game.bustedTimer = 0;
  }
  if (p.health <= 0) respawn('KAMU TUMBANG!');

  // Day/night drifts slowly; missions jump it.
  game.hour = (game.hour + dt / 180) % 24;
  // Particles.
  for (const pt of game.particles) pt.ttl -= dt;
  game.particles = game.particles.filter((pt) => pt.ttl > 0);
  // Engine + siren sound follow the world.
  game.audio.setEngine(p.inCar ? Math.abs(p.car.speed) / p.car.top : 0, p.inCar);
  game.audio.siren(game.police.wanted > 0 && game.police.cars.length > 0);
  // Camera heading follows the player.
  game.camHeading = p.heading;
}

function buildView(dt) {
  const p = game.player;
  const heading = p.heading;
  game.camPrev = computeCamera({ x: p.x, z: p.z }, heading, game.camMode, game.orbitYaw, dt, game.camPrev);
  const view = {
    camEye: game.camPrev.eye, camTarget: game.camPrev.target,
    hour: game.hour, focus: { x: p.x, z: p.z },
    parked: game.parkedCars, traffic: game.traffic,
    missionCars: game.missionCars.filter((c) => c !== p.car),
    policeCars: game.police.cars,
    roadblock: game.police.roadblock ? game.police.roadblock.cars : null,
    playerCar: p.inCar && p.car ? p.car : null,
    playerOnFoot: !p.inCar ? { x: p.x, z: p.z, angle: p.angle, shirt: [0.95, 0.3, 0.2], skin: [0.9, 0.7, 0.55], moving: p.moving, phase: 0 } : null,
    peds: game.peds, heli: game.police.heli, marker: game.marker,
    particles: game.particles,
  };
  return view;
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game.state === 'playing' && !game.paused && !game.garageOpen) update(dt);
  if (game.state === 'playing') {
    game.renderer.render(buildView(dt), dt);
    game.hud.update(dt);
  }
  game.input.endFrame();
}

function resize() {
  game.renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// --- Menus.
const hasSave = !!localStorage.getItem(SAVE_KEY);
document.getElementById('btn-continue').style.display = hasSave ? 'inline-block' : 'none';
document.getElementById('btn-start').addEventListener('click', () => {
  game.audio.ensure(); game.state = 'playing'; game.hud.showStart(false);
  game.toast('Selamat datang di Isla Caldera', 'Tekan M untuk misi pertama: Garam di Roda.');
});
document.getElementById('btn-continue').addEventListener('click', () => {
  game.audio.ensure(); game.load(); game.state = 'playing'; game.hud.showStart(false);
  game.toast('Lanjutkan', 'Progresmu dipulihkan.');
});
document.getElementById('btn-resume').addEventListener('click', () => { game.paused = false; game.hud.showPause(false); });
document.getElementById('btn-save').addEventListener('click', () => { game.save(); game.toast('Disimpan', 'Progres tersimpan di penyimpanan lokal.'); });
document.getElementById('btn-load').addEventListener('click', () => { if (game.load()) game.toast('Save dimuat', 'Progres terakhir dipulihkan.'); });
document.getElementById('btn-menu').addEventListener('click', () => { game.paused = false; game.hud.showPause(false); game.state = 'menu'; game.hud.showStart(true); });
document.getElementById('btn-repair').addEventListener('click', () => garageAction('repair'));
document.getElementById('btn-engine').addEventListener('click', () => garageAction('engine'));
document.getElementById('btn-armor').addEventListener('click', () => garageAction('armor'));
document.getElementById('btn-close-garage').addEventListener('click', closeGarage);
document.getElementById('btn-abort').addEventListener('click', () => { abortMission(game); game.paused = false; game.hud.showPause(false); });

// Screenshot poses (?shot=1..4) auto-start the game for capture.
const params = new URLSearchParams(location.search);
const shot = parseInt(params.get('shot') || '0', 10);
if (shot >= 1 && shot <= 4) {
  game.state = 'playing';
  game.hud.showStart(false);
  applyShot(game, shot);
  window.__shotReady = true;
}

window.CALDERA = game;
window.__startMission = (n) => startMission(game, n);
window.__gameReady = true;
requestAnimationFrame(loop);
