// hud.js — the DOM overlay of CALDERA VIVA: wanted stars, money, health,
// the mission objective, the minimap, the weapon wheel, the radio readout,
// toasts, and the start / pause-dashboard / end screens. The 3D view stays
// in the canvas; everything readable lives here.

import { fmtMoney } from './utils.js';
import { currentObjective, MISSIONS } from './missions.js';
import { WEAPONS, respectRank } from './player.js';

let el = {};
let toastTimer = 0;
let lastToast = '';

export function initHud() {
  const ids = ['hud', 'stars', 'money', 'healthFill', 'healthText', 'respect', 'objective', 'objectiveText',
    'clock', 'radio', 'weapon', 'minimap', 'toast', 'wheel', 'start', 'pause', 'end',
    'pauseStats', 'pauseMissions', 'pauseStanding', 'endTitle', 'endText', 'btnStart',
    'btnContinue', 'btnResume', 'btnRestart', 'btnEnd', 'garageHint', 'saveNote'];
  for (const id of ids) el[id] = document.getElementById(id);
}

function fmtHour(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function updateHud(state, dt) {
  if (!el.hud) return;
  const p = state.player;
  const wanted = state.police.wanted;
  el.stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
  el.stars.style.color = wanted >= 3 ? '#ff4444' : '#ffd23f';
  el.money.textContent = fmtMoney(p.money);
  el.healthFill.style.width = Math.max(0, p.health) + '%';
  el.healthFill.style.background = p.health > 50 ? '#4caf50' : p.health > 25 ? '#ff9800' : '#f44336';
  el.healthText.textContent = Math.ceil(p.health) + ' HP';
  el.respect.textContent = respectRank(p.respect) + ' · ' + p.respect + ' respect';
  el.objectiveText.textContent = currentObjective(state);
  el.clock.textContent = fmtHour(state.hour);
  el.radio.textContent = (state.audio.radioOn ? '♪ ' : '○ ') + state.audio.stationName();
  const w = WEAPONS[p.weapon];
  const ammo = p.weapons[p.weapon].ammo;
  el.weapon.textContent = w.name + ' · ' + (ammo === Infinity ? '∞' : ammo);
  el.garageHint.style.display = p.garageNear ? 'block' : 'none';
  if (state.toast && state.toast !== lastToast) {
    lastToast = state.toast;
    toastTimer = 3.5;
    el.toast.textContent = state.toast;
    el.toast.style.opacity = '1';
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) el.toast.style.opacity = '0';
  }
  drawMinimap(state);
}

export function drawMinimap(state) {
  const cv = el.minimap;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  const scale = w / 640;
  const X = (x) => w / 2 + x * scale;
  const Z = (z) => h / 2 + z * scale;
  ctx.fillStyle = '#0e2f4a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5d4a33';
  ctx.fillRect(X(-260), Z(-260), 520 * scale, 520 * scale);
  ctx.strokeStyle = '#1b1b1e';
  ctx.lineWidth = 3;
  for (const lx of [-240, -180, -120, -60, 0, 60, 120, 180, 240]) {
    ctx.beginPath(); ctx.moveTo(X(lx), Z(-260)); ctx.lineTo(X(lx), Z(260)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(-260), Z(lx)); ctx.lineTo(X(260), Z(lx)); ctx.stroke();
  }
  ctx.fillStyle = '#8a6a45';
  ctx.beginPath(); ctx.arc(X(0), Z(0), 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a3630';
  ctx.beginPath(); ctx.arc(X(0), Z(-205), 16, 0, Math.PI * 2); ctx.fill();
  for (const m of state.markers) {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(X(m.x), Z(m.z), 4, 0, Math.PI * 2); ctx.fill();
  }
  for (const car of state.cars) {
    if (car.hidden) continue;
    ctx.fillStyle = car.isCop ? '#4488ff' : car.isPlayer ? '#ff5533' : '#bbbbbb';
    ctx.fillRect(X(car.x) - 2, Z(car.z) - 2, 4, 4);
  }
  const heli = state.police.heli;
  if (heli.active) {
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(X(heli.x), Z(heli.z), 5, 0, Math.PI * 2); ctx.stroke();
  }
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(X(px), Z(pz), 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(X(px), Z(pz), 7, 0, Math.PI * 2); ctx.stroke();
}

export function setWeaponWheel(state, open) {
  if (!el.wheel) return;
  el.wheel.style.display = open ? 'flex' : 'none';
  if (open) {
    const p = state.player;
    el.wheel.innerHTML = ['pistol', 'smg', 'shotgun', 'molotov'].map((key, i) => {
      const w = WEAPONS[key];
      const ammo = p.weapons[key].ammo;
      const sel = p.weapon === key ? ' class="sel"' : '';
      return '<div' + sel + '><b>' + (i + 1) + '</b> ' + w.name + ' <span>' + (ammo === Infinity ? '∞' : ammo) + '</span></div>';
    }).join('');
  }
}

export function showStart(hasSave) {
  el.start.style.display = 'flex';
  el.btnContinue.style.display = hasSave ? 'inline-block' : 'none';
  el.hud.style.display = 'none';
}

export function hideStart() {
  el.start.style.display = 'none';
  el.hud.style.display = 'block';
}

export function showPause(state) {
  const p = state.player;
  el.pauseStats.innerHTML =
    '<b>' + fmtMoney(p.money) + '</b> · ' + respectRank(p.respect) + ' (' + p.respect + ' respect)<br>' +
    'Kesehatan: ' + Math.ceil(p.health) + ' · Senjata: ' + WEAPONS[p.weapon].name + '<br>' +
    'Mesin: Lv ' + p.upgrades.engine + ' · Armor: Lv ' + p.upgrades.armor + ' · Wanted: ' + state.police.wanted + '★';
  el.pauseMissions.innerHTML = MISSIONS.map((d) =>
    '<div>' + (state.missionsDone.includes(d.id) ? '✓' : '·') + ' M' + d.id + ' — ' + d.name + '</div>').join('');
  el.pauseStanding.innerHTML = Object.entries(state.standing).map(([name, v]) =>
    '<div>' + name + ' <div class="bar"><div style="width:' + v + '%"></div></div> ' + v + '</div>').join('');
  el.pause.style.display = 'flex';
}

export function hidePause() {
  el.pause.style.display = 'none';
}

export function showEnd(state, kind) {
  const p = state.player;
  if (kind === 'busted') {
    el.endTitle.textContent = 'DITANGKAP GIC';
    el.endText.textContent = 'Central GIC menahanmu. Denda $150, mobil disita. Tito menjemputmu di garasi.';
  } else if (kind === 'wasted') {
    el.endTitle.textContent = 'KAMU TUMBANG';
    el.endText.textContent = 'Isla Caldera tidak ampun. Mara membawamu ke garasi — separuh uangmu hilang.';
  } else {
    el.endTitle.textContent = 'CALDERA TERBAKAR — RAJA CALDERA';
    el.endText.textContent = 'Sepuluh misi selesai. Pulau ini milikmu sekarang: $' + Math.floor(p.money) +
      ', ' + p.respect + ' respect. Main bebas, atau mulai lagi dari awal.';
  }
  el.end.style.display = 'flex';
}

export function hideEnd() {
  el.end.style.display = 'none';
}
