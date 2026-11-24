// hud.js — every DOM surface of CALDERA VIVA: the HUD, minimap, weapon
// wheel, garage panel, pause dashboard, start screen and toasts.

import { fmtCash, fmtTime } from './utils.js';
import { WEAPONS } from './player.js';
import { BEACH_Z, WATER_Z, districtAt } from './city.js';
import { MISSION_DEFS } from './missions.js';
import { dispatchLine } from './police.js';

export function createHud(game) {
  const $ = (id) => document.getElementById(id);
  const el = {
    cash: $('hud-cash'), respect: $('hud-respect'), time: $('hud-time'), district: $('hud-district'),
    wanted: $('wanted'), health: $('health-fill'), armor: $('armor-fill'), healthNum: $('health-num'),
    weapon: $('weapon-name'), ammo: $('weapon-ammo'), speed: $('speed'), speedBox: $('speed-box'),
    objective: $('objective'), objectiveTitle: $('objective-title'),
    dispatch: $('dispatch'), toast: $('toast'), toastTitle: $('toast-title'), toastBody: $('toast-body'),
    minimap: $('minimap'), start: $('start-screen'), pause: $('pause-screen'),
    wheel: $('wheel'), garage: $('garage-panel'), hint: $('hint'),
    pauseStats: $('pause-stats'), missionList: $('mission-list'), districtList: $('district-list'),
    garageInfo: $('garage-info'), race: $('race-info'),
  };
  let toastTimer = 0;

  function drawMinimap() {
    const c = el.minimap, ctx = c.getContext('2d');
    const S = c.width / 460, OX = c.width / 2, OY = c.height / 2;
    const X = (x) => OX + x * S, Z = (z) => OY + z * S;
    ctx.fillStyle = '#2a2f22'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#3a3a3f';
    for (const rx of game.city.roadsX) ctx.fillRect(X(rx - 6), 0, 12 * S, c.height);
    for (const rz of game.city.roadsZ) ctx.fillRect(0, Z(rz - 6), c.width, 12 * S);
    ctx.fillStyle = '#8a7f68';
    for (const b of game.city.buildings) ctx.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), Math.max(1, b.w * S), Math.max(1, b.d * S));
    ctx.fillStyle = '#141210'; ctx.fillRect(0, Z(BEACH_Z), c.width, c.height - Z(BEACH_Z));
    ctx.fillStyle = '#0e4d7a'; ctx.fillRect(0, Z(WATER_Z), c.width, c.height - Z(WATER_Z));
    const dot = (x, z, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(x), Z(z), r, 0, 7); ctx.fill(); };
    if (game.marker) {
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(game.marker.x), Z(game.marker.z), 6 + Math.sin(performance.now() / 200) * 2, 0, 7); ctx.stroke();
    }
    for (const car of game.police.cars) dot(car.x, car.z, 3, '#4488ff');
    if (game.police.heli) dot(game.police.heli.x, game.police.heli.z, 4, '#88ccff');
    for (const car of game.missionCars) dot(car.x, car.z, 3, '#ffcc00');
    // Player arrow.
    const p = game.player;
    ctx.save(); ctx.translate(X(p.x), Z(p.z)); ctx.rotate(-p.angle + Math.PI);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('N', c.width - 14, 14);
  }

  function update(dt) {
    const p = game.player, pol = game.police;
    el.cash.textContent = fmtCash(game.cash);
    el.respect.textContent = 'Respect ' + game.respect + ' — ' + game.rankName();
    el.time.textContent = fmtTime(game.hour) + (game.hour >= 19 || game.hour < 6 ? ' 🌙' : ' ☀️');
    el.district.textContent = districtAt(p.x, p.z).name;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="star ${i < pol.wanted ? 'on' : ''}">★</span>`;
    el.wanted.innerHTML = stars;
    el.health.style.width = Math.max(0, p.health) + '%';
    el.armor.style.width = Math.max(0, p.armor) + '%';
    el.healthNum.textContent = Math.round(p.health) + ' HP';
    const w = WEAPONS[p.weapon];
    el.weapon.textContent = w.name;
    el.ammo.textContent = p.ammo[p.weapon] === Infinity ? '∞' : p.ammo[p.weapon] + ' peluru';
    if (p.inCar && p.car) {
      el.speedBox.style.display = 'block';
      el.speed.textContent = Math.round(Math.abs(p.car.speed) * 3.6) + ' km/h';
    } else el.speedBox.style.display = 'none';
    el.dispatch.textContent = dispatchLine(pol);
    const step = game.currentStepLabel ? game.currentStepLabel() : null;
    if (game.missions.active) {
      el.objectiveTitle.textContent = `MISI ${game.missions.active.def.num} — ${game.missions.active.def.title}`;
      el.objective.textContent = step || '';
      el.objective.parentElement.style.display = 'block';
    } else if (game.missions.available <= 10) {
      el.objectiveTitle.textContent = 'Bebas — Isla Caldera milikmu';
      el.objective.textContent = `Tekan M untuk misi ${game.missions.available}: ${MISSION_DEFS[game.missions.available - 1].title}`;
      el.objective.parentElement.style.display = 'block';
    } else {
      el.objectiveTitle.textContent = 'CALDERA VIVA — tamat';
      el.objective.textContent = 'Semua 10 misi selesai. Jelajahi, balapan, atau mulai lagi.';
      el.objective.parentElement.style.display = 'block';
    }
    el.race.textContent = game.race.active
      ? `🏁 BALAPAN — checkpoint ${game.race.cp}/${game.race.total} • ${game.race.time.toFixed(1)} dtk`
      : (game.race.available ? '🏁 Balapan jalanan: tekan B di garis start Plaza Brasa' : '');
    drawMinimap();
    if (toastTimer > 0) { toastTimer -= dt || 0.016; if (toastTimer <= 0) el.toast.classList.remove('show'); }
  }

  function toast(title, body) {
    el.toastTitle.textContent = title;
    el.toastBody.textContent = body;
    el.toast.classList.add('show');
    toastTimer = 4;
  }

  function toggleWheel() {
    const open = el.wheel.classList.toggle('show');
    if (open) {
      el.wheel.innerHTML = WEAPONS.map((w, i) =>
        `<div class="wheel-slot ${i === game.player.weapon ? 'sel' : ''}" data-i="${i}">
          <b>${w.key}</b> ${w.name}<br><small>${game.player.ammo[i] === Infinity ? '∞' : game.player.ammo[i]}</small>
        </div>`).join('');
      el.wheel.querySelectorAll('.wheel-slot').forEach((s) => {
        s.addEventListener('click', () => { game.player.weapon = +s.dataset.i; el.wheel.classList.remove('show'); });
      });
    }
  }

  function showGarage(open) {
    el.garage.classList.toggle('show', open);
    if (open) {
      const p = game.player;
      el.garageInfo.innerHTML = `Kendaraan: <b>${p.car ? p.car.name : '—'}</b> • HP ${p.car ? Math.round(p.car.hp) : '—'}/100<br>` +
        `Mesin Lv.${game.upgrades.engine} • Armor Lv.${game.upgrades.armor} • Uang: ${fmtCash(game.cash)}`;
    }
  }

  function showPause(open) {
    el.pause.classList.toggle('show', open);
    if (open) {
      el.pauseStats.innerHTML =
        `Uang: <b>${fmtCash(game.cash)}</b> • Respect: <b>${game.respect}</b> (${game.rankName()})<br>` +
        `Misi selesai: <b>${game.missions.completed.length}/10</b> • Wanted: <b>${game.police.wanted}★</b><br>` +
        `Waktu: ${fmtTime(game.hour)} • Distrik: ${districtAt(game.player.x, game.player.z).name} • Radio: ${game.audio.stationName}`;
      el.missionList.innerHTML = MISSION_DEFS.map((m) =>
        `<div class="mrow ${game.missions.completed.includes(m.num) ? 'done' : ''} ${game.missions.active && game.missions.active.def.num === m.num ? 'active' : ''}">
          <b>${m.num}. ${m.title}</b> — ${game.missions.completed.includes(m.num) ? '✅ selesai' : m.num === game.missions.available ? '▶ tersedia' : '🔒 terkunci'}
        </div>`).join('');
      el.districtList.innerHTML = game.city.districts.map((d) =>
        `<div class="mrow"><b style="color:${d.color}">${d.name}</b> — standing ${game.standing[d.id] || 0}/100</div>`).join('');
    }
  }

  function showStart(open) { el.start.classList.toggle('show', open); }

  return { update, toast, toggleWheel, showGarage, showPause, showStart, el };
}
