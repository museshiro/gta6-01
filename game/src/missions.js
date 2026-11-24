// missions.js — the 10 story jobs of CALDERA VIVA.
// Each mission is a list of small steps (goto / enter / survive / eliminate /
// pickup / talk) driven by one state machine, so every job can start and
// finish through the same tested path.

import { pointInCollider } from './city.js';

// Mission waypoints are hand-placed on the map; nudge any that landed inside
// a building onto the nearest open ground so the step can always be reached.
function openPoint(game, x, z) {
  if (!pointInCollider(game.city, x, z)) return { x, z };
  for (let r = 4; r <= 64; r += 4) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const nx = x + Math.cos(ang) * r, nz = z + Math.sin(ang) * r;
      if (!pointInCollider(game.city, nx, nz)) return { x: nx, z: nz };
    }
  }
  return { x, z };
}

export const MISSION_DEFS = [
  {
    num: 1, title: 'Garam di Roda', time: 17.5, wanted: 0,
    briefing: 'Curi coupe modifikasi di dermaga. Pelajari jalanan Isla Caldera — dan lolos dari patroli pertama.',
    reward: { cash: 800, respect: 10, standing: { dermaga: 10 } },
    steps: [
      { type: 'goto', x: 30, z: 196, r: 8, label: 'Pergi ke Dermaga' },
      { type: 'enter', car: 'coupe', x: 36, z: 192, label: 'Curi Vela Coupe' },
      { type: 'goto', x: 12, z: 52, r: 8, label: 'Bawa coupe ke Rumah Mara', inCar: true },
      { type: 'survive', seconds: 18, label: 'Lolos dari patroli GIC' },
    ],
  },
  {
    num: 2, title: 'Kotak untuk Brasa', time: 9.0, wanted: 0,
    briefing: 'Antar kotak terkunci ke Mara. Di garage, Tito menunggumu — markas resmi kru mulai malam ini.',
    reward: { cash: 1200, respect: 15, standing: { brasa: 10 } },
    steps: [
      { type: 'pickup', x: 12, z: 52, r: 6, label: 'Ambil kotak dari Mara' },
      { type: 'goto', x: -52, z: 97, r: 8, label: 'Antar kotak ke Garage Tito' },
      { type: 'talk', x: -52, z: 97, r: 7, label: 'Bicara dengan Tito Branco' },
    ],
  },
  {
    num: 3, title: 'Pajak Pantai', time: 15.0, wanted: 1,
    briefing: 'Tagih uang perlindungan dari tiga pedagang boardwalk. Puerto Brasa harus tahu siapa yang menjaga pantai.',
    reward: { cash: 1800, respect: 20, standing: { boardwalk: 15 } },
    steps: [
      { type: 'goto', x: -60, z: 150, r: 6, label: 'Tagih pedagang 1/3' },
      { type: 'goto', x: 0, z: 150, r: 6, label: 'Tagih pedagang 2/3' },
      { type: 'goto', x: 60, z: 150, r: 6, label: 'Tagih pedagang 3/3' },
      { type: 'goto', x: 12, z: 52, r: 8, label: 'Setor ke Mara' },
    ],
  },
  {
    num: 4, title: 'Ratu Dermaga', time: 19.0, wanted: 2,
    briefing: 'Mara terjebak di lapangan kontainer. Selamatkan dia — dan pakai crew call Mara untuk mobil kabur.',
    reward: { cash: 2500, respect: 25, standing: { dermaga: 15 } },
    steps: [
      { type: 'goto', x: 150, z: 60, r: 10, label: 'Masuk lapangan kontainer' },
      { type: 'eliminate', count: 4, label: 'Habisi penjaga gudang (0/4)' },
      { type: 'talk', x: 150, z: 60, r: 7, label: 'Selamatkan Mara' },
      { type: 'enter', car: 'pickup', x: 158, z: 66, label: 'Naik mobil kabur Mara' },
      { type: 'goto', x: -52, z: 97, r: 8, label: 'Kabur ke Garage Tito', inCar: true },
    ],
  },
  {
    num: 5, title: 'Ariete di Jembatan', time: 17.0, wanted: 3,
    briefing: 'Curi van lapis baja di jembatan. MURALLA sudah memasang roadblock — dan ARIETE siap menabrakmu keluar jalan.',
    reward: { cash: 3500, respect: 30, standing: { brasa: 15 } },
    steps: [
      { type: 'enter', car: 'van', x: 0, z: -90, label: 'Curi Van Lapis Baja' },
      { type: 'survive', seconds: 40, label: 'Bertahan dari MURALLA & ARIETE' },
      { type: 'goto', x: -52, z: 97, r: 8, label: 'Bawa van ke Garage Tito', inCar: true },
    ],
  },
  {
    num: 6, title: 'Mata Cormorán', time: 20.5, wanted: 3,
    briefing: 'CORMORÁN-1 menguncimu dari udara. Pindah mobil di gedung parkir dan putus garis pandangnya.',
    reward: { cash: 3200, respect: 30, standing: { bukit: 15 } },
    steps: [
      { type: 'goto', x: -110, z: -20, r: 9, label: 'Masuk Gedung Parkir' },
      { type: 'survive', seconds: 25, label: 'Sembunyi dari CORMORÁN-1' },
      { type: 'enter', car: 'sedan', x: -104, z: -14, label: 'Pindah ke sedan bersih' },
      { type: 'goto', x: 12, z: 52, r: 8, label: 'Temui Mara', inCar: true },
    ],
  },
  {
    num: 7, title: 'Gudang Garam', time: 22.0, wanted: 2,
    briefing: 'Rampok gudang bukti GIC. Pakai weapon wheel, bakar dokumennya, dan jangan tinggalkan jejak.',
    reward: { cash: 4500, respect: 35, standing: { dermaga: 20 } },
    steps: [
      { type: 'goto', x: 160, z: -110, r: 9, label: 'Masuk Gudang Garam' },
      { type: 'eliminate', count: 5, label: 'Habisi penjaga gudang (0/5)' },
      { type: 'pickup', x: 160, z: -110, r: 6, label: 'Bakar dokumen bukti' },
      { type: 'goto', x: -52, z: 97, r: 8, label: 'Kembali ke Garage Tito' },
    ],
  },
  {
    num: 8, title: 'Pengkhianatan Boardwalk', time: 18.0, wanted: 3,
    briefing: 'Fixer boardwalk menjual kru ke kartel. Buru dia di keramaian — Tito siap memberi bantuan tembak.',
    reward: { cash: 5200, respect: 40, standing: { boardwalk: 20 } },
    steps: [
      { type: 'goto', x: 0, z: 150, r: 9, label: 'Cari fixer di Boardwalk' },
      { type: 'eliminate', count: 4, label: 'Habisi fixer & pengawalnya (0/4)' },
      { type: 'talk', x: 0, z: 150, r: 7, label: 'Tito mengamankan lokasi' },
      { type: 'goto', x: 12, z: 52, r: 8, label: 'Lapor ke Mara' },
    ],
  },
  {
    num: 9, title: 'Muralla Terakhir', time: 11.0, wanted: 3,
    briefing: 'Mobilmu disita GIC. Serbu impound, ambil kembali — dan tembus roadblock MURALLA terakhir.',
    reward: { cash: 6000, respect: 45, standing: { brasa: 20 } },
    steps: [
      { type: 'goto', x: 120, z: -140, r: 9, label: 'Masuk Impound GIC' },
      { type: 'enter', car: 'coupe', x: 126, z: -134, label: 'Ambil kembali coupemu' },
      { type: 'survive', seconds: 30, label: 'Tembus roadblock MURALLA' },
      { type: 'goto', x: -52, z: 97, r: 8, label: 'Bawa pulang ke Garage Tito', inCar: true },
    ],
  },
  {
    num: 10, title: 'Caldera Terbakar', time: 21.0, wanted: 5,
    briefing: 'Serbu mansion kartel di Bukit Caldera. Wanted lima bintang, CORMORÁN-1 membayangi — kabur ke laut.',
    reward: { cash: 12000, respect: 60, standing: { bukit: 25, brasa: 25 } },
    steps: [
      { type: 'goto', x: -150, z: -150, r: 10, label: 'Serbu Mansion Kartel' },
      { type: 'eliminate', count: 8, label: 'Habisi pengawal kartel (0/8)' },
      { type: 'pickup', x: -150, z: -150, r: 6, label: 'Ambil uang kartel' },
      { type: 'goto', x: 30, z: 232, r: 8, label: 'Kabur ke perahu di Dermaga' },
    ],
  },
];

export function createMissionState() {
  return {
    active: null,      // {def, stepIdx, timer, kills0, targetCar}
    completed: [],     // mission numbers finished
    available: 1,      // next mission number the player may start
  };
}

export function startMission(game, num) {
  const def = MISSION_DEFS.find((m) => m.num === num);
  if (!def) return false;
  const ms = game.missions;
  if (ms.active || ms.completed.includes(num) || num > ms.available) return false;
  const steps = def.steps.map((s) => (s.x !== undefined ? { ...s, ...openPoint(game, s.x, s.z) } : { ...s }));
  ms.active = { def: { ...def, steps }, stepIdx: 0, timer: 0, kills0: game.kills };
  game.setTimeOfDay(def.time);
  if (def.wanted > 0) game.setWanted(def.wanted);
  game.spawnMissionActors(def);
  game.toast(`MISI ${def.num} — ${def.title}`, def.briefing);
  game.audio.mission();
  return true;
}

export function currentStepLabel(game) {
  const a = game.missions.active;
  if (!a) return null;
  const s = a.def.steps[a.stepIdx];
  if (!s) return null;
  if (s.type === 'survive') return `${s.label} — ${Math.ceil(s.seconds - a.timer)} dtk`;
  if (s.type === 'eliminate') return `${s.label.split('(')[0]}(${game.kills - a.kills0}/${s.count})`;
  return s.label;
}

function stepDone(game, step) {
  const p = game.player;
  if (step.type === 'goto' || step.type === 'pickup' || step.type === 'talk') {
    const d = Math.hypot(p.x - step.x, p.z - step.z);
    if (step.inCar && !p.inCar) return false;
    return d < step.r;
  }
  if (step.type === 'enter') {
    return p.inCar && p.car && p.car.missionCar === step.car;
  }
  if (step.type === 'survive') return game.missions.active.timer >= step.seconds;
  if (step.type === 'eliminate') return game.kills - game.missions.active.kills0 >= step.count;
  return false;
}

export function updateMission(game, dt) {
  const a = game.missions.active;
  if (!a) return;
  a.timer += dt;
  const step = a.def.steps[a.stepIdx];
  if (!step) { completeMission(game); return; }
  // Marker follows the current step.
  if (step.x !== undefined) game.setMarker(step.x, step.z);
  else game.clearMarker();
  if (stepDone(game, step)) {
    game.audio.pickup();
    a.stepIdx++; a.timer = 0;
    const next = a.def.steps[a.stepIdx];
    if (next) game.toast('Langkah selesai', next.label);
    else completeMission(game);
  }
}

function completeMission(game) {
  const a = game.missions.active;
  const def = a.def;
  game.missions.completed.push(def.num);
  game.missions.available = Math.max(game.missions.available, def.num + 1);
  game.missions.active = null;
  game.cash += def.reward.cash;
  game.respect += def.reward.respect;
  for (const d in def.reward.standing) {
    game.standing[d] = Math.min(100, (game.standing[d] || 0) + def.reward.standing[d]);
  }
  game.clearMarker();
  game.clearMissionActors();
  game.setWanted(0);
  game.toast(`MISI SELESAI — ${def.title}`, `+${def.reward.cash} • +${def.reward.respect} respect • ${def.num === 10 ? 'Isla Caldera milikmu.' : 'Misi berikutnya terbuka.'}`);
  game.audio.mission();
  game.save();
}

export function abortMission(game) {
  if (!game.missions.active) return;
  game.missions.active = null;
  game.clearMarker();
  game.clearMissionActors();
  game.toast('Misi dibatalkan', 'Bicara lagi dengan Mara untuk mengulang.');
}
