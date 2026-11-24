// main.js — CALDERA VIVA entry point: builds the world, runs the loop, wires
// every system together and exposes the debug hooks the tests use.
// ?mode=2d forces the top-down fallback, ?shot=1..4 stages a screenshot scene,
// ?autotest=1 plays all ten missions headlessly and reports the result.

import { buildCity, CITY_SEED, districtAt } from './city.js';
import { Renderer } from './render.js';
import { initInput, isDown, wasPressed, endFrame, driveAxis, mouse, simulateKey } from './input.js';
import { AudioEngine } from './audio.js';
import { makeCar, spawnTraffic, updateTraffic, updatePlayerCar, nearestCar } from './vehicles.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { makePlayer, updatePlayer, shoot, damagePlayer, respectRank } from './player.js';
import { makePoliceState, updatePolice, addHeat, wantedFromHeat } from './police.js';
import { MISSIONS, makeMissionState, startMission, updateMissions, currentObjective, completeMission, failMission } from './missions.js';
import { initHud, updateHud, showStart, hideStart, showPause, hidePause, showEnd, hideEnd, setWeaponWheel } from './hud.js';
import { applyShot } from './shots.js';
import { mulberry32, dist2, clamp } from './utils.js';

const params = new URLSearchParams(location.search);
const SAVE_KEY = 'caldera-viva-save-v1';
export const VERSION = 'caldera-viva-4-recorded';

// ---------------------------------------------------------------- state

const city = buildCity(CITY_SEED);
const cityAgain = buildCity(CITY_SEED);
const determinism = {
  firstBuilding: JSON.stringify(city.buildings[0]),
  count: city.buildings.length,
  match: JSON.stringify(city.buildings[0]) === JSON.stringify(cityAgain.buildings[0])
    && city.buildings.length === cityAgain.buildings.length,
};

const state = {
  mode: 'title',
  time: 0,
  hour: 18.2,
  timeScale: 1,
  city,
  rng: mulberry32(CITY_SEED + 7),
  player: makePlayer(city.spawn),
  cars: [],
  peds: [],
  police: makePoliceState(),
  missions: makeMissionState(),
  missionsDone: [],
  mission: null,
  standing: { 'Plaza Brasa': 0, 'Puerto Viejo': 0, Dermaga: 0, Boardwalk: 0, 'Caldera Alta': 0 },
  markers: [],
  muzzle: null,
  explosion: null,
  lastShotPos: null,
  missionKills: 0,
  missionTargetDown: false,
  camera: { mode: 'chase', snap: true },
  audio: new AudioEngine(),
  toast: '',
  race: null,
  _wheelOpen: false,
  _shotFramesLeft: 0,
  _mouseWorld: null,
  errors: [],
};

state.missionsDone = state.missions.done;
state.saveGame = saveGame;

window.addEventListener('error', (e) => state.errors.push('error: ' + e.message));
window.addEventListener('unhandledrejection', (e) => state.errors.push('rejection: ' + String(e.reason)));

// ---------------------------------------------------------------- save / load

function saveGame() {
  try {
    const p = state.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: p.money, respect: p.respect, standing: state.standing,
      missionsDone: state.missionsDone, upgrades: p.upgrades,
      ammo: { smg: p.weapons.smg.ammo, shotgun: p.weapons.shotgun.ammo, molotov: p.weapons.molotov.ammo },
      hour: state.hour,
    }));
  } catch (e) { /* storage may be unavailable; the game still plays */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    const p = state.player;
    p.money = s.money;
    p.respect = s.respect;
    state.standing = s.standing;
    state.missionsDone = s.missionsDone;
    state.missions.done = s.missionsDone;
    p.upgrades = s.upgrades;
    p.weapons.smg.ammo = s.ammo.smg;
    p.weapons.shotgun.ammo = s.ammo.shotgun;
    p.weapons.molotov.ammo = s.ammo.molotov;
    state.hour = s.hour;
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------- boot

const glCanvas = document.getElementById('gl');
const fallbackCanvas = document.getElementById('map2d');
const renderer = new Renderer(glCanvas, fallbackCanvas);
const glOk = renderer.init();
if (params.get('mode') === '2d') renderer.mode = '2d';
if (renderer.mode === '2d') {
  glCanvas.style.display = 'none';
  fallbackCanvas.style.display = 'block';
}
renderer.buildStatic(city);
initHud();
initInput(glCanvas);

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// Mara's red car waits at the plaza; a first crowd of traffic and walkers.
const starterCar = makeCar(8, 26, 0, [0.9, 0.25, 0.3], { maxSpeed: 28, accel: 15 });
state.cars.push(starterCar);
for (let i = 0; i < 6; i++) spawnTraffic(state, 10);
for (let i = 0; i < 12; i++) spawnPeds(state, 10);

// Mouse aim: unproject the cursor onto the ground plane (y = 0).
function updateMouseWorld() {
  const w = renderer.w || 1;
  const h = renderer.h || 1;
  const nx = (mouse.x / w) * 2 - 1;
  const ny = 1 - (mouse.y / h) * 2;
  const cp = renderer.camPos;
  const ct = renderer.camTarget;
  let fx = ct.x - cp.x, fy = ct.y - cp.y, fz = ct.z - cp.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, ry = 0, rz = fx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; rz /= rl;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const tanF = Math.tan((62 * Math.PI / 180) / 2);
  const aspect = w / h;
  const dx = fx + rx * nx * tanF * aspect + ux * ny * tanF;
  const dy = fy + uy * ny * tanF;
  const dz = fz + rz * nx * tanF * aspect + uz * ny * tanF;
  if (dy >= -0.001) { state._mouseWorld = null; return; }
  const t = -cp.y / dy;
  state._mouseWorld = { x: cp.x + dx * t, z: cp.z + dz * t };
}

// ---------------------------------------------------------------- debug hooks

function teleport(x, z) {
  const p = state.player;
  if (p.onFoot) { p.x = x; p.z = z; }
  else { p.car.x = x; p.car.z = z; p.car.speed = 0; }
  state.camera.snap = true;
}

window.__CALDERA__ = {
  version: VERSION,
  state,
  determinism,
  firstBuilding: determinism.firstBuilding,
  startMission: (n) => startMission(state, n, state.audio),
  teleport,
  setWanted: (n) => { state.police.heat = [0, 12, 30, 50, 70, 90][clamp(n, 0, 5)]; state.police.lastCrime = state.time; },
  giveMoney: (n) => { state.player.money += n; },
  saveGame,
  loadGame,
  errors: state.errors,
};

// ---------------------------------------------------------------- shot / test modes

const shotN = Number(params.get('shot') || 0);
const autotest = params.get('autotest') === '1';
if (shotN >= 1 && shotN <= 4) {
  hideStart();
  applyShot(state, shotN, state.audio);
  document.getElementById('hud').style.display = 'block';
  if (state._wheelOpen) setWeaponWheel(state, true);
}

// ---------------------------------------------------------------- loop

let last = performance.now();
let frames = 0;

function step(dt) {
  state.time += dt;
  state.hour += dt / 240; // one game hour per four real minutes
  if (state.hour >= 24) state.hour -= 24;
  updateMouseWorld();
  const inputFacade = {
    isDown, wasPressed,
    mouseClicked: mouse.clicked,
  };
  updatePlayer(state, dt, inputFacade, state.audio);
  if (!state.player.onFoot && state.player.car) {
    const d = driveAxis();
    updatePlayerCar(state, dt, { throttle: d.throttle, steer: d.steer, handbrake: isDown('Space') }, state.audio);
  }
  spawnTraffic(state, dt);
  updateTraffic(state, dt);
  spawnPeds(state, dt);
  updatePeds(state, dt);
  updatePolice(state, dt, state.audio);
  updateMissions(state, dt, state.audio);
  state.audio.update(dt);
  const p = state.player;
  const speed01 = p.onFoot ? 0 : Math.abs(p.car ? p.car.speed : 0) / 30;
  state.audio.setEngine(speed01, !p.onFoot);
  if (state.muzzle) { state.muzzle.ttl -= dt; if (state.muzzle.ttl <= 0) state.muzzle = null; }
  if (state.explosion) { state.explosion.ttl -= dt; if (state.explosion.ttl <= 0) state.explosion = null; }

  // Global keys.
  if (wasPressed('Escape') || wasPressed('KeyP')) {
    if (state.mode === 'playing') { state.mode = 'paused'; showPause(state); }
    else if (state.mode === 'paused') { state.mode = 'playing'; hidePause(); }
  }
  if (wasPressed('KeyM') && state.mode === 'playing' && !state.mission) {
    const next = MISSIONS.find((d) => !state.missionsDone.includes(d.id));
    if (next) startMission(state, next.id, state.audio);
  }
  if (wasPressed('KeyB') && state.mode === 'playing' && !state.race && !state.mission) {
    const pos = p.onFoot ? { x: p.x, z: p.z } : { x: p.car.x, z: p.car.z };
    if (dist2(pos.x, pos.z, 0, 0) < 45) {
      state.race = { points: state.city.racePoints.slice(), idx: 0, active: true };
      state.toast = 'Balapan jalanan dari Plaza Brasa — ikuti checkpoint kuning!';
    }
  }
  if (wasPressed('KeyR') && state.mode === 'playing') {
    const on = state.audio.ensure() && state.audio.toggleRadio();
    state.toast = on ? 'Radio: ' + state.audio.stationName() : 'Radio mati';
  }
  if (wasPressed('KeyC') && state.mode === 'playing') {
    state.camera.mode = state.camera.mode === 'chase' ? 'iso' : 'chase';
    state.camera.snap = true;
    state.toast = 'Kamera: ' + (state.camera.mode === 'chase' ? 'chase' : 'iso');
  }
  if (wasPressed('KeyQ') && state.mode === 'playing') {
    state._wheelOpen = !state._wheelOpen;
    setWeaponWheel(state, state._wheelOpen);
  }
  if (wasPressed('Digit5') && state.mode === 'playing') {
    state.audio.nextStation();
    state.toast = 'Radio: ' + state.audio.stationName();
  }
  // End states.
  if (state.mode === 'busted' || state.mode === 'wasted' || state.mode === 'complete') {
    showEnd(state, state.mode);
    state.mode = 'over';
  }
  updateHud(state, dt);
  endFrame();
}

function frame(now) {
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = rawDt * state.timeScale;
  if (state.mode === 'playing') step(dt);
  else if (state.mode === 'title') {
    // Slow orbit over the plaza behind the start screen.
    const a = state.time * 0.05;
    renderer.camPos = { x: Math.cos(a) * 90, y: 55, z: Math.sin(a) * 90 };
    renderer.camTarget = { x: 0, y: 0, z: 0 };
    state.time += rawDt;
  }
  renderer.render(state, rawDt);
  frames++;
  if (state._shotFramesLeft > 0) {
    state._shotFramesLeft--;
    if (state._shotFramesLeft === 0) window.__SHOT_READY__ = true;
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- UI buttons

document.getElementById('btnStart').addEventListener('click', () => {
  state.audio.ensure();
  hideStart();
  state.mode = 'playing';
});
document.getElementById('btnContinue').addEventListener('click', () => {
  state.audio.ensure();
  loadGame();
  hideStart();
  state.mode = 'playing';
});
document.getElementById('btnResume').addEventListener('click', () => {
  hidePause();
  state.mode = 'playing';
});
document.getElementById('btnRestart').addEventListener('click', () => {
  hidePause();
  location.reload();
});
document.getElementById('btnEnd').addEventListener('click', () => {
  const p = state.player;
  if (state.mode === 'over') {
    // Pay the price and walk out of the garage.
    if (p.money > 0) p.money = Math.max(0, p.money - 150);
    p.health = 100;
    p.x = 45; p.z = 120;
    p.heading = 0;
    p.onFoot = true;
    p.car = null;
    state.police.heat = 0;
    state.police.wanted = 0;
    state.police.heli.active = false;
    state.camera.snap = true;
    hideEnd();
    state.mode = 'playing';
  }
});
window.addEventListener('pointerdown', () => state.audio.ensure(), { once: true });
window.addEventListener('keydown', () => state.audio.ensure(), { once: true });

if (shotN >= 1 && shotN <= 4) {
  // applyShot already hid the start screen; keep the HUD visible.
  state.mode = 'playing';
} else {
  showStart(!!localStorage.getItem(SAVE_KEY));
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- autotest

async function runAutotest() {
  const results = [];
  const ok = (name, pass, detail = '') => results.push({ name, pass, detail });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeoutMs, label) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      if (fn()) return true;
      await sleep(50);
    }
    return false;
  };
  hideStart();
  state.mode = 'playing';
  state.timeScale = 8;
  await sleep(500);

  ok('webgl', renderer.mode === '3d' || params.get('mode') === '2d', 'mode=' + renderer.mode);
  ok('no-console-errors', state.errors.length === 0, state.errors.join(' | '));
  ok('determinism', determinism.match, 'buildings=' + determinism.count);

  // Missions 1..10, driven through the real triggers.
  for (let n = 1; n <= 10; n++) {
    startMission(state, n, state.audio);
    state.player.health = 100;
    const def = MISSIONS[n - 1];
    let done = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 90000) {
      if (!state.mission) { done = true; break; }
      if (state.mode === 'over') {
        // Busted / wasted mid-test: pay the price and carry on.
        hideEnd();
        state.player.health = 100;
        state.police.heat = 0;
        state.police.wanted = 0;
        state.police.heli.active = false;
        state.mode = 'playing';
        teleport(45, 120);
      }
      const step = state.mission.def.steps[state.mission.step];
      if (!step) break;
      if (step.type === 'goto' || step.type === 'pickup' || step.type === 'deliver' || step.type === 'escape') {
        teleport(step.x, step.z);
      } else if (step.type === 'tail') {
        const t = state.mission.targetCar;
        if (t) teleport(t.x + 8, t.z + 8);
      } else if (step.type === 'chase') {
        const t = state.mission.targetCar;
        if (t) {
          if (!state.player.onFoot) {
            const c = state.player.car;
            state.player.onFoot = true;
            state.player.x = c.x + 3;
            state.player.z = c.z + 3;
            state.player.car = null;
            c.isPlayer = false;
          }
          teleport(t.x + 6, t.z + 6);
          t.health = 1;
          state._mouseWorld = { x: t.x, z: t.z };
          shoot(state, state.audio);
        }
      } else if (step.type === 'shootout') {
        const g = (state.mission.guards || []).find((q) => q.state !== 'down');
        if (g) {
          if (!state.player.onFoot) {
            const c = state.player.car;
            state.player.onFoot = true;
            state.player.x = c.x + 3;
            state.player.z = c.z + 3;
            state.player.car = null;
            c.isPlayer = false;
          }
          teleport(g.x + 5, g.z + 5);
          state._mouseWorld = { x: g.x, z: g.z };
          shoot(state, state.audio);
        } else teleport(step.x, step.z);
      } else if (step.type === 'race') {
        const pts = state.city.racePoints.slice(0, 7);
        const pt = pts[state.mission.raceIdx];
        if (pt) teleport(pt.x, pt.z);
      } else if (step.type === 'survive') {
        // Keep moving so the pursuit can never pin the player down.
        const a = performance.now() / 400;
        teleport(70 * Math.cos(a), 70 * Math.sin(a));
      }
      await sleep(60);
    }
    ok('mission-' + n + '-' + def.name, done, done ? '' : 'step=' + (state.mission ? state.mission.def.steps[state.mission.step].type : '?'));
    if (!done) break;
    await sleep(200);
  }
  // Mission 10 ends on the complete screen; come back to free roam for the rest.
  hideEnd();
  state.mode = 'playing';

  // Wanted + helicopter (mission 6 already raised it; force it here too).
  // The helicopter may still be in its 45 s cooldown from an earlier chase,
  // Wanted + helicopter (mission 6 already raised it; force it here too).
  // The helicopter may still be in its 45 s cooldown from an earlier chase,
  // and one burst of heat fades before the cooldown ends — so keep committing
  // crimes (heat) and keep moving (never busted) while waiting for it.
  addHeat(state, 55);
  await sleep(400);
  ok('wanted-3', state.police.wanted >= 3, 'wanted=' + state.police.wanted);
  const heatKeeper = setInterval(() => addHeat(state, 25), 500);
  let heliCame = false;
  {
    const t0 = performance.now();
    while (performance.now() - t0 < 30000) {
      if (state.police.heli.active) { heliCame = true; break; }
      if (state.mode === 'over') {
        hideEnd();
        state.player.health = 100;
        state.mode = 'playing';
      }
      const a = performance.now() / 400;
      teleport(70 * Math.cos(a), 70 * Math.sin(a));
      await sleep(60);
    }
  }
  clearInterval(heatKeeper);
  ok('heli-active', heliCame, 'heli=' + state.police.heli.active);
  state.police.lastCrime = state.time - 20; // no crime for 20 s of game time
  await waitFor(() => !state.police.heli.active, 5000, 'heli-lose-track');
  ok('heli-loses-track', !state.police.heli.active, 'cooldown=' + Math.round(state.police.heli.cooldown));

  // Garage: damage the car, repair with F.
  const car = state.player.car || makeCar(state.player.x + 4, state.player.z, 0, [0.9, 0.25, 0.3], {});
  if (!state.player.car) { state.cars.push(car); state.player.car = car; state.player.onFoot = false; }
  car.health = 40;
  state.player.money += 500;
  teleport(45, 135);
  simulateKey('KeyF', true);
  await sleep(300);
  simulateKey('KeyF', false);
  ok('garage-repair', car.health === 100, 'health=' + car.health);

  // Free-roam race from the plaza.
  teleport(0, 0);
  state.race = { points: state.city.racePoints.slice(), idx: 0, active: true };
  for (const pt of state.city.racePoints) {
    teleport(pt.x, pt.z);
    await sleep(120);
    if (!state.race.active) break;
  }
  ok('street-race', !state.race.active, '');

  // Crew call (T).
  const carsBefore = state.cars.length;
  simulateKey('KeyT', true);
  await sleep(200);
  simulateKey('KeyT', false);
  ok('crew-call', state.cars.length > carsBefore, 'cars=' + state.cars.length);

  // Save / load round-trip.
  saveGame();
  const raw = localStorage.getItem(SAVE_KEY);
  let saveOk = false;
  try { const s = JSON.parse(raw); saveOk = s.money === state.player.money; } catch (e) { /* no */ }
  ok('save-load', saveOk, '');

  // Pause dashboard.
  state.mode = 'paused';
  showPause(state);
  await sleep(150);
  const pauseVisible = document.getElementById('pause').style.display === 'flex';
  ok('pause-dashboard', pauseVisible, '');
  hidePause();
  state.mode = 'playing';

  // Shooting on foot.
  state.player.onFoot = true;
  state.player.x = 0;
  state.player.z = 0;
  state.peds.push({ x: 5, z: -8, heading: 0, speed: 0, state: 'walk', color: [0.9, 0.9, 0.9], health: 30, axis: 'x', dir: 1, fleeT: 0 });
  state._mouseWorld = { x: 5, z: -8 };
  shoot(state, state.audio);
  await sleep(150);
  const target = state.peds[state.peds.length - 1];
  ok('shooting', target.state === 'down' || target.health < 30, 'health=' + target.health);

  const passed = results.filter((r) => r.pass).length;
  const div = document.getElementById('test-results');
  div.style.display = 'block';
  div.textContent = 'AUTOTEST ' + passed + '/' + results.length + '\n' +
    results.map((r) => (r.pass ? 'PASS' : 'FAIL') + ' ' + r.name + (r.detail ? ' — ' + r.detail : '')).join('\n');
  document.title = 'AUTOTEST ' + passed + '/' + results.length;
  window.__AUTOTEST__ = results;
  state.timeScale = 1;
}

if (autotest) {
  setTimeout(runAutotest, 800);
}
