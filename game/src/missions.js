// missions.js — the ten story jobs of CALDERA VIVA, from Tito's first salt
// run to the burning of the Caldera. Each mission is a list of steps the
// engine checks every frame: go to, pick up, deliver, tail, chase, survive,
// shoot out, race, escape. Completing one pays money, respect and district
// standing, and auto-saves the game.

import { dist2, clamp } from './utils.js';
import { makeCar } from './vehicles.js';
import { addHeat } from './police.js';
import { collideWorld } from './city.js';

export const MISSIONS = [
  {
    id: 1, name: 'Garam di Roda', district: 'Plaza Brasa', time: 18.2,
    brief: 'Tito butuh kurir. Ambil paket garam di garasi, antar ke Plaza Brasa.',
    reward: { money: 400, respect: 120 },
    steps: [
      { type: 'goto', x: 45, z: 135, r: 9, label: 'Temui Tito di garasi' },
      { type: 'pickup', x: 45, z: 135, r: 6, label: 'Ambil paket garam' },
      { type: 'deliver', x: 0, z: 0, r: 9, label: 'Antar paket ke Plaza Brasa' },
    ],
  },
  {
    id: 2, name: 'Kotak untuk Brasa', district: 'Dermaga', time: 18.6,
    brief: 'Kotak dari kapal di ujung dermaga. Antar ke boardwalk sebelum dingin.',
    reward: { money: 500, respect: 140 },
    steps: [
      { type: 'goto', x: -318, z: 66, r: 9, label: 'Ke ujung dermaga' },
      { type: 'pickup', x: -318, z: 66, r: 6, label: 'Ambil kotak dari kapal' },
      { type: 'deliver', x: 130, z: 205, r: 9, time: 120, label: 'Antar ke boardwalk (120 dtk)' },
    ],
  },
  {
    id: 3, name: 'Pajak Pantai', district: 'Boardwalk', time: 19.2,
    brief: 'Tiga kios belum bayar pajak pantai. Tagih semuanya, kembali ke plaza.',
    reward: { money: 600, respect: 160 },
    steps: [
      { type: 'goto', x: 130, z: 205, r: 8, label: 'Tagih kios boardwalk' },
      { type: 'goto', x: -60, z: 210, r: 8, label: 'Tagih kios selatan' },
      { type: 'goto', x: 210, z: 60, r: 8, label: 'Tagih kios timur' },
      { type: 'deliver', x: 0, z: 0, r: 9, label: 'Setor ke Plaza Brasa' },
    ],
  },
  {
    id: 4, name: 'Ratu Dermaga', district: 'Dermaga', time: 19.8,
    brief: 'Ratu Dermaga bergerak malam ini. Ikuti mobilnya tanpa ketahuan.',
    reward: { money: 700, respect: 180 },
    steps: [
      { type: 'goto', x: -318, z: 66, r: 9, label: 'Tunggu di ujung dermaga' },
      { type: 'tail', hold: 20, label: 'Ikuti mobil Ratu (tetap < 45 m, 20 dtk)' },
      { type: 'deliver', x: 45, z: 135, r: 9, label: 'Lapor ke Tito di garasi' },
    ],
  },
  {
    id: 5, name: 'Ariete di Jembatan', district: 'Puerto Viejo', time: 20.3,
    brief: 'Prototipe truk ARIETE melintasi jembatan. Hancurkan sebelum sampai.',
    reward: { money: 900, respect: 200 },
    steps: [
      { type: 'goto', x: 240, z: 60, r: 10, label: 'Ke jembatan timur' },
      { type: 'chase', label: 'Hancurkan truk ARIETE' },
      { type: 'deliver', x: 45, z: 135, r: 9, label: 'Kembali ke garasi' },
    ],
  },
  {
    id: 6, name: 'Mata Cormorán', district: 'Caldera Alta', time: 21.0,
    brief: 'CORMORÁN-1 mengawasimu dari ketinggian. Bertahan 60 detik, lalu menghilang.',
    reward: { money: 1000, respect: 220 },
    steps: [
      { type: 'survive', dur: 60, label: 'Bertahan dari helikopter (60 dtk)' },
      { type: 'deliver', x: 45, z: 135, r: 9, label: 'Sembunyi di garasi' },
    ],
  },
  {
    id: 7, name: 'Gudang Garam', district: 'Dermaga', time: 21.6,
    brief: 'Gudang garam dijaga empat orang bersenjata. Bersihkan, ambil petinya.',
    reward: { money: 1100, respect: 240 },
    steps: [
      { type: 'goto', x: -180, z: 150, r: 10, label: 'Ke gudang garam' },
      { type: 'shootout', count: 4, x: -180, z: 150, label: 'Habisi 4 penjaga gudang' },
      { type: 'pickup', x: -180, z: 150, r: 7, label: 'Ambil peti garam' },
      { type: 'deliver', x: 0, z: 0, r: 9, label: 'Antar peti ke Plaza Brasa' },
    ],
  },
  {
    id: 8, name: 'Pengkhianatan Boardwalk', district: 'Boardwalk', time: 22.2,
    brief: 'Seseorang menjualmu ke GIC di tengah balapan. Menang, lalu kabur.',
    reward: { money: 1300, respect: 260 },
    steps: [
      { type: 'race', label: 'Balapan 7 checkpoint dari Plaza Brasa' },
      { type: 'escape', x: -60, z: 210, r: 10, label: 'Kabur ke gerbang selatan (wanted 2+)' },
      { type: 'cooldown', label: 'Hilangkan jejak (wanted 0)' },
    ],
  },
  {
    id: 9, name: 'Muralla Terakhir', district: 'Puerto Viejo', time: 6.0,
    brief: 'Fajar. GIC menutup semua jalan timur dengan MURALLA. Terobos ke gunung.',
    reward: { money: 1500, respect: 280 },
    steps: [
      { type: 'goto', x: 210, z: 60, r: 10, label: 'Ke gerbang timur (wanted 3)' },
      { type: 'deliver', x: 0, z: -138, r: 10, label: 'Terobos ke kaki gunung berapi' },
    ],
  },
  {
    id: 10, name: 'Caldera Terbakar', district: 'Caldera Alta', time: 6.4,
    brief: 'Finale. Ambil muatan di kaki gunung, bertahan dari seluruh GIC, antar ke dermaga.',
    reward: { money: 2500, respect: 400 },
    steps: [
      { type: 'goto', x: 0, z: -138, r: 9, label: 'Ke kaki gunung berapi' },
      { type: 'pickup', x: 0, z: -138, r: 7, label: 'Ambil muatan terakhir' },
      { type: 'survive', dur: 45, label: 'Bertahan dari GIC (45 dtk, wanted 5)' },
      { type: 'deliver', x: -318, z: 66, r: 10, label: 'Antar ke ujung dermaga' },
    ],
  },
];

export function makeMissionState() {
  return { current: null, done: [], next: 1 };
}

function playerPos(state) {
  const p = state.player;
  return p.onFoot ? { x: p.x, z: p.z } : { x: p.car.x, z: p.car.z };
}

export function startMission(state, n, audio) {
  const def = MISSIONS[n - 1];
  if (!def) return false;
  const m = {
    index: n, def, step: 0, timer: 0, holdT: 0, raceIdx: 0,
    kills0: state.missionKills || 0, targetCar: null, guards: [],
  };
  state.mission = m;
  state.hour = def.time;
  state.markers = [];
  state.camera.snap = true;
  // The hot missions start with the GIC already on the player.
  if (def.id === 5) addHeat(state, 35);
  if (def.id === 6) addHeat(state, 55);
  if (def.id === 9) addHeat(state, 55);
  if (def.id === 10) addHeat(state, 95);
  const step = def.steps[0];
  if (step.type === 'tail' || step.type === 'chase') spawnTargetCar(state, m, step.type);
  if (step.type === 'shootout') spawnGuards(state, m, step);
  state.toast = 'MISI ' + n + ' — ' + def.name + ': ' + def.brief;
  if (audio) audio.sfx('mission');
  return true;
}

/** The rival car for tail/chase steps: drives a loop away from the player. */
function spawnTargetCar(state, m, kind) {
  const pos = playerPos(state);
  const car = makeCar(pos.x + 30, pos.z - 20, Math.PI / 2, kind === 'chase' ? [0.2, 0.2, 0.25] : [0.85, 0.15, 0.5], {
    isTarget: true,
    maxSpeed: kind === 'chase' ? 21 : 13,
    accel: 12,
    health: kind === 'chase' ? 100 : 1000,
  });
  state.cars.push(car);
  m.targetCar = car;
}

/** Armed guards for shootout steps. */
function spawnGuards(state, m, step) {
  m.guards = [];
  for (let i = 0; i < step.count; i++) {
    const a = (i / step.count) * Math.PI * 2;
    const ped = {
      x: step.x + Math.cos(a) * 9, z: step.z + Math.sin(a) * 9,
      heading: a, speed: 0, state: 'walk',
      color: [0.15, 0.15, 0.18], health: 68, isGuard: true,
      axis: 'x', dir: 1, fleeT: 0, shootCd: 1 + i * 0.4,
    };
    state.peds.push(ped);
    m.guards.push(ped);
  }
  state.missionKills = 0;
}

function advanceStep(state, audio) {
  const m = state.mission;
  m.step++;
  m.holdT = 0;
  m.timer = 0;
  if (m.step >= m.def.steps.length) {
    completeMission(state, audio);
    return;
  }
  const step = m.def.steps[m.step];
  if (step.type === 'tail' || step.type === 'chase') spawnTargetCar(state, m, step.type);
  if (step.type === 'shootout') spawnGuards(state, m, step);
  if (step.type === 'escape') addHeat(state, 35);
  if (audio) audio.sfx('pickup');
  state.toast = step.label;
}

export function completeMission(state, audio) {
  const m = state.mission;
  const p = state.player;
  p.money += m.def.reward.money;
  p.respect += m.def.reward.respect;
  state.standing[m.def.district] = clamp((state.standing[m.def.district] || 0) + 12, 0, 100);
  state.missionsDone.push(m.index);
  state.mission = null;
  state.markers = [];
  state.toast = 'MISI SELESAI — ' + m.def.name + ' (+$' + m.def.reward.money + ', +' + m.def.reward.respect + ' respect)';
  if (audio) audio.sfx('mission');
  if (state.saveGame) state.saveGame();
  if (m.index === 10) {
    state.mode = 'complete';
  }
}

export function failMission(state, reason) {
  if (!state.mission) return;
  state.toast = 'Misi gagal: ' + reason + ' — tekan M untuk mencoba lagi';
  state.mission = null;
  state.markers = [];
}

/** One-line objective text for the HUD. */
export function currentObjective(state) {
  if (state.race && state.race.active) {
    return 'Balapan: checkpoint ' + (state.race.idx + 1) + '/' + state.race.points.length;
  }
  const m = state.mission;
  if (!m) {
    const next = MISSIONS.find((d) => !state.missionsDone.includes(d.id));
    return next ? 'Tekan M — Misi ' + next.id + ': ' + next.name : 'Semua misi selesai — Raja Caldera!';
  }
  const step = m.def.steps[m.step];
  let text = 'M' + m.index + ' ' + m.def.name + ' — ' + step.label;
  if (step.type === 'survive') text += ' (' + Math.ceil(m.timer) + ' dtk)';
  if (step.type === 'tail') text += ' (' + Math.floor(m.holdT) + '/' + step.hold + ' dtk)';
  if (step.type === 'shootout') text += ' (' + (state.missionKills - m.kills0) + '/' + step.count + ')';
  if (step.type === 'race') text += ' (' + (m.raceIdx + 1) + '/' + (state.city.racePoints.length - 1) + ')';
  if (step.type === 'deliver' && step.time) text += ' (' + Math.ceil(m.timer) + ' dtk)';
  return text;
}

export function updateMissions(state, dt, audio) {
  // Free-roam street race (B from Plaza Brasa).
  if (state.race && state.race.active) {
    const race = state.race;
    const pos = playerPos(state);
    const pt = race.points[race.idx];
    if (pt && dist2(pos.x, pos.z, pt.x, pt.z) < 11) {
      race.idx++;
      if (audio) audio.sfx('pickup');
      if (race.idx >= race.points.length) {
        race.active = false;
        state.player.money += 300;
        state.player.respect += 50;
        state.toast = 'Balapan selesai! +$300, +50 respect';
        if (audio) audio.sfx('mission');
        state.markers = [];
      }
    }
    state.markers = race.active && race.points[race.idx]
      ? [{ x: race.points[race.idx].x, z: race.points[race.idx].z, color: [1.0, 0.85, 0.2] }]
      : [];
    if (race.active) return;
  }

  const m = state.mission;
  if (!m) return;
  const step = m.def.steps[m.step];
  if (!step) return;
  const pos = playerPos(state);
  const p = state.player;

  // Guards shoot back while a shootout runs.
  for (const g of m.guards || []) {
    if (g.state === 'down') continue;
    g.shootCd -= dt;
    if (g.shootCd <= 0 && dist2(g.x, g.z, pos.x, pos.z) < 26) {
      g.shootCd = 1.4;
      state.muzzle = { x: g.x, y: 1.4, z: g.z, ttl: 0.06 };
      if (audio) audio.sfx('shot');
      const dmg = 5;
      p.health -= dmg * (1 - p.upgrades.armor * 0.2);
      if (p.health <= 0) { p.health = 0; state.mode = 'wasted'; }
    }
  }

  // Target car behaviour: tail target cruises a loop, chase target flees.
  if (m.targetCar && !m.targetCar.hidden) {
    const t = m.targetCar;
    if (step.type === 'tail') {
      t.speed = 11;
      const wp = state.city.racePoints[Math.floor(state.time / 6) % state.city.racePoints.length];
      const dx = wp.x - t.x;
      const dz = wp.z - t.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx / d, -dz / d);
      t.heading += clamp(((want - t.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.8 * dt, 1.8 * dt);
      const nx = t.x + Math.sin(t.heading) * t.speed * dt;
      const nz = t.z - Math.cos(t.heading) * t.speed * dt;
      const hit = collideWorld(state.city, nx, nz, 2.1);
      t.x = hit.x;
      t.z = hit.z;
    } else if (step.type === 'chase') {
      const dx = t.x - pos.x;
      const dz = t.z - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx / d, -dz / d);
      t.heading += clamp(((want - t.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -2.0 * dt, 2.0 * dt);
      t.speed = 20;
      const nx = t.x + Math.sin(t.heading) * t.speed * dt;
      const nz = t.z - Math.cos(t.heading) * t.speed * dt;
      const hit = collideWorld(state.city, nx, nz, 2.1);
      t.x = hit.x;
      t.z = hit.z;
    }
  }

  switch (step.type) {
    case 'goto':
    case 'pickup': {
      state.markers = [{ x: step.x, z: step.z, color: [1.0, 0.85, 0.2] }];
      if (dist2(pos.x, pos.z, step.x, step.z) < step.r) advanceStep(state, audio);
      break;
    }
    case 'deliver': {
      state.markers = [{ x: step.x, z: step.z, color: [0.3, 1.0, 0.4] }];
      if (step.time) {
        if (m.timer === 0) m.timer = step.time;
        m.timer -= dt;
        if (m.timer <= 0) { failMission(state, 'waktu habis'); return; }
      }
      if (dist2(pos.x, pos.z, step.x, step.z) < step.r) advanceStep(state, audio);
      break;
    }
    case 'tail': {
      const t = m.targetCar;
      if (!t || t.hidden) { failMission(state, 'target hilang'); return; }
      state.markers = [{ x: t.x, z: t.z, color: [1.0, 0.4, 0.7] }];
      const d = dist2(pos.x, pos.z, t.x, t.z);
      if (d < 45) m.holdT += dt;
      else m.holdT = Math.max(0, m.holdT - dt * 2);
      if (m.holdT >= step.hold) advanceStep(state, audio);
      break;
    }
    case 'chase': {
      const t = m.targetCar;
      if (!t) { failMission(state, 'target hilang'); return; }
      state.markers = [{ x: t.x, z: t.z, color: [1.0, 0.3, 0.2] }];
      if (t.hidden || state.missionTargetDown) {
        state.missionTargetDown = false;
        advanceStep(state, audio);
      }
      break;
    }
    case 'survive': {
      if (m.timer === 0) m.timer = step.dur;
      m.timer -= dt;
      state.markers = [];
      if (m.timer <= 0) advanceStep(state, audio);
      break;
    }
    case 'shootout': {
      state.markers = [{ x: step.x, z: step.z, color: [1.0, 0.3, 0.2] }];
      const kills = (state.missionKills || 0) - m.kills0;
      if (kills >= step.count) advanceStep(state, audio);
      break;
    }
    case 'race': {
      const pts = state.city.racePoints.slice(0, 7);
      const pt = pts[m.raceIdx];
      state.markers = pt ? [{ x: pt.x, z: pt.z, color: [1.0, 0.85, 0.2] }] : [];
      if (pt && dist2(pos.x, pos.z, pt.x, pt.z) < 11) {
        m.raceIdx++;
        if (audio) audio.sfx('pickup');
        if (m.raceIdx >= pts.length) advanceStep(state, audio);
      }
      break;
    }
    case 'escape': {
      state.markers = [{ x: step.x, z: step.z, color: [0.3, 1.0, 0.4] }];
      if (dist2(pos.x, pos.z, step.x, step.z) < step.r && state.police.wanted >= 2) advanceStep(state, audio);
      break;
    }
    case 'cooldown': {
      state.markers = [];
      if (state.police.wanted === 0) advanceStep(state, audio);
      break;
    }
    default:
      break;
  }
}
