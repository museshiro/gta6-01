// SOLMAR HEAT 3D — main.js
// Bootstraps the game: two stacked canvases (WebGL world below, 2D HUD
// above), every system, the main loop, the state machine (menu / playing /
// paused / dialog / wasted / busted / ending), the camera, particles,
// pickups, the respray shop, Nadia's Garage upgrades, the weapon wheel,
// the radio, the day/night clock, and 3 save slots via localStorage.
// Also handles ?shot=... for screenshot mode. If WebGL is unavailable,
// the 2D canvas renderer from render.js draws the world instead.
(function () {
  const canvas = document.getElementById('game');
  const glCanvas = document.getElementById('gl');
  const ctx = canvas.getContext('2d');
  const SAVE_KEYS = ['solmar-heat-save-v1', 'solmar-heat-save-v2', 'solmar-heat-save-v3'];

  const G = {
    canvas, ctx, glCanvas,
    dpr: 1, viewW: 0, viewH: 0,
    time: 0,
    clockMin: 600, // 10:00 — one real minute is one game hour
    state: 'menu', // menu | playing | paused | dialog | wasted | busted | ending
    cam: { x: 1600, y: 1200, zoom: 1, shake: 0, view: { x0: 0, y0: 0, x1: 0, y1: 0 } },
    particles: [],
    skids: [],
    pickups: [],
    muzzle: null,
    onFrame: null,
    saveSlot: 0,
    wheelOpen: false,
    wheelSel: 0,
    garageOpen: false,
    garageHintT: 0,
  };

  function resize() {
    G.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    G.viewW = window.innerWidth;
    G.viewH = window.innerHeight;
    canvas.width = Math.floor(G.viewW * G.dpr);
    canvas.height = Math.floor(G.viewH * G.dpr);
    canvas.style.width = G.viewW + 'px';
    canvas.style.height = G.viewH + 'px';
    if (glCanvas) {
      glCanvas.width = Math.floor(G.viewW * G.dpr);
      glCanvas.height = Math.floor(G.viewH * G.dpr);
      glCanvas.style.width = G.viewW + 'px';
      glCanvas.style.height = G.viewH + 'px';
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // Systems (created in dependency order; each reads G at update time).
  G.audio = createAudio();
  G.input = createInput(canvas);
  G.city = createCity();
  G.player = createPlayer(G);
  G.vehicles = createVehicles(G);
  G.peds = createPeds(G);
  G.police = createPolice(G);
  G.missions = createMissions(G);
  // Renderer: hand-written WebGL 3D first, 2D canvas fallback if it fails.
  G.renderer = createRenderer3D(G);
  if (!G.renderer) {
    G.renderer = createRenderer(G);
    if (glCanvas) glCanvas.style.display = 'none';
  }
  G.hud = createHud(G);

  G.screenToWorld = function (sx, sy) {
    if (G.renderer && G.renderer.screenToWorld) return G.renderer.screenToWorld(sx, sy);
    const cam = G.cam;
    return {
      x: cam.x + (sx - G.viewW / 2) / cam.zoom,
      y: cam.y + (sy - G.viewH / 2) / cam.zoom,
    };
  };
  G.addParticles = function (x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, U.TAU), sp = U.rand(30, 190);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: U.rand(0.25, 0.6), max: 0.6,
        size: U.rand(2, 5), color: color || '#ffd34d',
      });
    }
    if (G.particles.length > 320) G.particles.splice(0, G.particles.length - 320);
  };
  G.addSkid = function (x, y) {
    G.skids.push({ x, y, life: 6 });
    if (G.skids.length > 220) G.skids.shift();
  };
  G.spawnPickup = function (x, y, kind, amount) {
    G.pickups.push({ x, y, kind, amount, t: 0 });
  };

  // ---- Save / load (3 slots) ------------------------------------------------
  G.saveGame = function () {
    try {
      const pl = G.player;
      const data = {
        x: pl.x, y: pl.y, cash: pl.cash, hp: pl.hp,
        hasPistol: pl.hasPistol, ammo: pl.ammo,
        weapons: {
          pistol: pl.weapons.pistol, smg: pl.weapons.smg, shotgun: pl.weapons.shotgun,
        },
        weapon: pl.weapon,
        upgrades: pl.upgrades,
        mission: G.missions.idx, completed: G.missions.completed,
        standing: G.missions.standing, stashes: G.missions.stashesFound,
        clockMin: G.clockMin,
        respect: G.missions.respectName(),
        time: Date.now(),
      };
      localStorage.setItem(SAVE_KEYS[G.saveSlot], JSON.stringify(data));
    } catch (e) { /* storage unavailable (file://, private mode) — ignore */ }
  };
  G.loadSaveData = function (slot) {
    try {
      const raw = localStorage.getItem(SAVE_KEYS[slot === undefined ? G.saveSlot : slot]);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };
  G.listSaves = function () {
    return [0, 1, 2].map((i) => G.loadSaveData(i));
  };
  function applySave(data) {
    const pl = G.player;
    pl.x = data.x; pl.y = data.y;
    pl.cash = data.cash; pl.hp = data.hp;
    pl.hasPistol = !!data.hasPistol; pl.ammo = data.ammo || 0;
    if (data.weapons) {
      for (const k of ['pistol', 'smg', 'shotgun']) {
        if (data.weapons[k]) pl.weapons[k] = data.weapons[k];
      }
    }
    if (data.weapon && pl.weapons[data.weapon] && pl.weapons[data.weapon].owned) pl.weapon = data.weapon;
    if (data.upgrades) pl.upgrades = data.upgrades;
    if (data.standing) G.missions.standing = data.standing;
    if (data.completed !== undefined) G.missions.completed = data.completed;
    if (data.clockMin !== undefined) G.clockMin = data.clockMin;
    G.missions.stashesFound = data.stashes || 0;
    pl.syncAmmo();
    G.cam.x = pl.x; G.cam.y = pl.y;
    return data.mission;
  }

  // ---- Respray shop ------------------------------------------------------
  function resprayCheck(dt) {
    const L = G.city.landmarks.respray;
    const c = G.city.buildingCenter(L);
    const pl = G.player;
    if (!pl.inCar || G.police.wanted.level === 0) return;
    if (U.dist(pl.x, pl.y, c.x, c.y + L.h / 2 + 90) < 120) {
      const cost = 150 * G.police.wanted.level;
      if (pl.cash >= cost) {
        pl.cash -= cost;
        pl.inCar.color = U.pick(['#c94f4f', '#3f7dbe', '#e8e8e8', '#2b2b2b', '#e07b39', '#4fae8a']);
        G.police.clearWanted();
        G.audio.coin();
        G.hud.toast('Respray complete — heat cleared (-' + U.money(cost) + ')');
        G.addParticles(pl.x, pl.y, 14, '#ff9ad5');
      } else {
        G.hud.toast('Respray costs ' + U.money(cost) + ' — you are short');
      }
    }
  }

  // ---- Nadia's Garage upgrades -------------------------------------------
  const GARAGE_ITEMS = [
    { key: 'engine', name: 'Engine', prices: [500, 900, 1400], max: 3, desc: 'top speed +12% per level' },
    { key: 'armor', name: 'Armor', prices: [600, 1000], max: 2, desc: 'collision damage -20% per level' },
    { key: 'nitro', name: 'Nitro', prices: [1200], max: 1, desc: 'Shift boost while driving' },
    { key: 'shotgun', name: 'Shotgun', prices: [800], max: 1, desc: '5-pellet spread, big damage' },
  ];
  function garageLines() {
    const pl = G.player;
    const lines = GARAGE_ITEMS.map((it, i) => {
      const lvl = it.key === 'shotgun' ? (pl.weapons.shotgun.owned ? 1 : 0) : pl.upgrades[it.key];
      if (lvl >= it.max) return (i + 1) + '. ' + it.name + ' — MAXED (' + it.desc + ')';
      return (i + 1) + '. ' + it.name + ' Lv' + (lvl + 1) + ' — ' + U.money(it.prices[lvl]) + ' (' + it.desc + ')';
    });
    lines.push('Cash: ' + U.money(pl.cash));
    return lines;
  }
  function openGarage() {
    G.garageOpen = true;
    G.hud.showDialog("NADIA'S GARAGE — UPGRADES", garageLines());
  }
  function buyGarageItem(i) {
    const it = GARAGE_ITEMS[i];
    if (!it) return;
    const pl = G.player;
    const lvl = it.key === 'shotgun' ? (pl.weapons.shotgun.owned ? 1 : 0) : pl.upgrades[it.key];
    if (lvl >= it.max) { G.hud.toast(it.name + ' is already maxed'); return; }
    const price = it.prices[lvl];
    if (pl.cash < price) { G.hud.toast('Not enough cash for ' + it.name + ' (' + U.money(price) + ')'); return; }
    pl.cash -= price;
    if (it.key === 'shotgun') pl.grantWeapon('shotgun', 12);
    else pl.upgrades[it.key]++;
    G.audio.coin();
    G.hud.toast(it.name + ' upgraded! (-' + U.money(price) + ')');
    G.saveGame();
    G.hud.showDialog("NADIA'S GARAGE — UPGRADES", garageLines());
  }
  function garageCheck(dt) {
    G.garageHintT = Math.max(0, G.garageHintT - dt);
    const L = G.city.landmarks.garage;
    const c = G.city.buildingCenter(L);
    const pl = G.player;
    if (!pl.inCar) return;
    if (U.dist(pl.x, pl.y, c.x, c.y + L.h / 2 + 90) < 130) {
      if (G.garageHintT <= 0) {
        G.hud.toast("Nadia's Garage — press G for upgrades");
        G.garageHintT = 8;
      }
      if (G.input.wasPressed('KeyG')) openGarage();
    }
  }

  // ---- Death / busted / ending -------------------------------------------
  G.onPlayerDead = function () {
    G.state = 'wasted';
    G.audio.engine(0, false);
  };
  G.onPlayerBusted = function () {
    const pl = G.player;
    pl.cash = Math.floor(pl.cash * 0.85);
    G.police.clearWanted();
    G.state = 'busted';
    G.audio.busted();
  };
  G.onStoryComplete = function () {
    G.state = 'ending';
    G.audio.missionDone();
  };
  function respawn(kind) {
    const pl = G.player;
    const L = G.city.landmarks;
    if (kind === 'wasted') {
      const c = G.city.buildingCenter(L.hospital);
      pl.cash = Math.floor(pl.cash * 0.9);
      pl.x = c.x; pl.y = c.y + L.h / 2 + 90;
    } else {
      const c = G.city.buildingCenter(L.police);
      pl.x = c.x; pl.y = c.y + L.h / 2 + 90;
    }
    if (pl.inCar) { pl.inCar.driver = null; pl.inCar = null; }
    pl.hp = pl.maxHp;
    pl.dead = false;
    G.police.clearWanted();
    G.cam.x = pl.x; G.cam.y = pl.y;
    G.state = 'playing';
    G.saveGame();
  }

  // ---- New game / continue ------------------------------------------------
  function newGame() {
    const pl = G.player;
    const L = G.city.landmarks;
    const c = G.city.buildingCenter(L.garage);
    pl.reset(c.x, c.y + 220);
    pl.cash = 150; pl.ammo = 24; pl.hasPistol = false;
    pl.weapon = 'fist';
    pl.weapons.pistol = { owned: false, ammo: 0 };
    pl.weapons.smg = { owned: false, ammo: 0 };
    pl.weapons.shotgun = { owned: false, ammo: 0 };
    pl.upgrades = { engine: 0, armor: 0, nitro: false };
    G.vehicles.cars.length = 0;
    G.peds.list.length = 0;
    G.police.cops.length = 0;
    G.police.wanted.heat = 0; G.police.wanted.level = 0;
    G.police.heli.active = false;
    G.particles.length = 0; G.skids.length = 0; G.pickups.length = 0;
    G.missions.idx = -1;
    G.missions.stashes = [];
    G.missions.stashesFound = 0;
    G.missions.completed = 0;
    G.missions.standing = { Downtown: 0, 'The Docks': 0, 'Palm Court': 0, 'Ember Hills': 0, 'Solmar Beach': 0 };
    G.clockMin = 600;
    G.vehicles.spawnParked(14);
    G.vehicles.spawnTraffic(12);
    G.peds.spawnNearPlayer(20);
    G.cam.x = pl.x; G.cam.y = pl.y; G.cam.zoom = 1;
    G.state = 'playing';
    G.audio.ensure();
    G.audio.startMusic();
    G.hud.toast('Welcome to Isla Solmar, Leo');
    // Last: the briefing dialog takes over (state -> 'dialog' until E).
    G.missions.startMission(0);
  }
  function continueGame() {
    const data = G.loadSaveData();
    newGame();
    if (!data) return;
    const mission = applySave(data);
    G.missions.idx = -1;
    if (mission >= 0 && mission < 10) G.missions.startMission(mission);
    else if (mission >= 10) {
      G.missions.idx = 10;
      G.missions.objective = 'Free roam — Isla Solmar is yours';
      G.missions.marker = null;
    }
    G.hud.toast('Welcome back, Leo');
  }

  // ---- Update -------------------------------------------------------------
  function update(dt) {
    G.time += dt;
    G.cam.shake = Math.max(0, G.cam.shake - dt * 2.2);
    if (G.muzzle) { G.muzzle.t -= dt; if (G.muzzle.t <= 0) G.muzzle = null; }
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      if (p.life <= 0) G.particles.splice(i, 1);
    }
    for (let i = G.skids.length - 1; i >= 0; i--) {
      G.skids[i].life -= dt;
      if (G.skids[i].life <= 0) G.skids.splice(i, 1);
    }
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const pk = G.pickups[i];
      pk.t += dt;
      if (U.dist(G.player.x, G.player.y, pk.x, pk.y) < 36) {
        if (pk.kind === 'cash') { G.player.cash += pk.amount; G.hud.toast('+' + U.money(pk.amount)); }
        else { G.player.hp = Math.min(G.player.maxHp, G.player.hp + 25); G.hud.toast('+25 health'); }
        G.audio.pickup();
        G.pickups.splice(i, 1);
      } else if (pk.t > 25) G.pickups.splice(i, 1);
    }
    // The weapon wheel freezes the world while you choose.
    if (G.wheelOpen) { G.hud.update(dt); return; }
    if (G.state === 'playing') {
      // Day/night clock: 1 real minute = 1 game hour.
      G.clockMin = (G.clockMin + dt) % 1440;
      G.player.update(dt);
      G.vehicles.update(dt);
      G.peds.update(dt);
      G.police.update(dt);
      G.missions.update(dt);
      resprayCheck(dt);
      garageCheck(dt);
      // Camera follows the player (or the car), zooming out with speed.
      const pl = G.player;
      const targetZoom = pl.inCar ? U.clamp(1.05 - Math.abs(pl.inCar.speed) / 2400, 0.72, 1.0) : 1.0;
      G.cam.zoom = U.lerp(G.cam.zoom, targetZoom, dt * 2);
      G.cam.x = U.lerp(G.cam.x, pl.x, 1 - Math.pow(0.001, dt));
      G.cam.y = U.lerp(G.cam.y, pl.y, 1 - Math.pow(0.001, dt));
    }
    G.hud.update(dt);
  }

  // ---- Weapon wheel --------------------------------------------------------
  function wheelPick(i) {
    const keys = ['fist', 'pistol', 'smg', 'shotgun'];
    const k = keys[i];
    if (!k) return;
    G.wheelSel = i;
    if (G.player.selectWeapon(k)) {
      G.wheelOpen = false;
    }
  }
  function wheelPickByMouse() {
    const m = G.input.mouse;
    const dx = m.x - G.viewW / 2, dy = m.y - G.viewH / 2;
    if (Math.hypot(dx, dy) < 30) return;
    let a = Math.atan2(dy, dx) + Math.PI / 2;
    if (a < 0) a += U.TAU;
    const i = Math.floor(((a + Math.PI / 4) % U.TAU) / (Math.PI / 2));
    wheelPick(i);
  }

  // ---- Input routing by state ---------------------------------------------
  function handleKeys() {
    const input = G.input;
    if (input.wasPressed('KeyM')) {
      G.audio.setMuted(!G.audio.isMuted());
      G.hud.toast(G.audio.isMuted() ? 'Sound muted' : 'Sound on');
    }
    if (G.state === 'menu') {
      if (input.wasPressed('Digit1')) { G.saveSlot = 0; G.audio.click(); }
      if (input.wasPressed('Digit2')) { G.saveSlot = 1; G.audio.click(); }
      if (input.wasPressed('Digit3')) { G.saveSlot = 2; G.audio.click(); }
      if (input.wasPressed('Enter') || input.mouse.clicked) {
        G.audio.ensure();
        if (G.loadSaveData()) continueGame(); else newGame();
      }
      return;
    }
    if (G.state === 'dialog') {
      if (G.garageOpen) {
        if (input.wasPressed('Digit1')) buyGarageItem(0);
        if (input.wasPressed('Digit2')) buyGarageItem(1);
        if (input.wasPressed('Digit3')) buyGarageItem(2);
        if (input.wasPressed('Digit4')) buyGarageItem(3);
      }
      if (input.wasPressed('KeyE') || input.wasPressed('Enter') || input.mouse.clicked) {
        G.audio.click();
        G.hud.closeDialog();
      }
      return;
    }
    if (G.state === 'playing') {
      if (G.wheelOpen) {
        if (input.wasPressed('KeyQ') || input.wasPressed('Tab') || input.wasPressed('Escape')) G.wheelOpen = false;
        if (input.wasPressed('Digit1')) wheelPick(0);
        if (input.wasPressed('Digit2')) wheelPick(1);
        if (input.wasPressed('Digit3')) wheelPick(2);
        if (input.wasPressed('Digit4')) wheelPick(3);
        if (input.mouse.clicked) wheelPickByMouse();
        return;
      }
      if (input.wasPressed('KeyQ') || input.wasPressed('Tab')) {
        G.wheelOpen = true;
        G.wheelSel = ['fist', 'pistol', 'smg', 'shotgun'].indexOf(G.player.weapon);
        G.audio.click();
        return;
      }
      if (input.wasPressed('KeyR')) {
        G.hud.toast('♪ ' + G.audio.cycleStation());
        return;
      }
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        G.state = 'paused';
        G.audio.engine(0, false);
      }
      return;
    }
    if (G.state === 'paused') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) G.state = 'playing';
      if (input.wasPressed('KeyS')) { G.saveGame(); G.hud.toast('Game saved (slot ' + (G.saveSlot + 1) + ')'); }
      if (input.wasPressed('KeyQ')) { G.state = 'menu'; G.audio.stopMusic(); }
      return;
    }
    if (G.state === 'wasted' || G.state === 'busted') {
      if (input.wasPressed('Enter') || input.mouse.clicked) respawn(G.state);
      return;
    }
    if (G.state === 'ending') {
      if (input.wasPressed('Enter') || input.mouse.clicked) {
        G.state = 'playing';
        G.missions.idx = 10; // free roam
        G.missions.objective = 'Free roam — Isla Solmar is yours';
        G.missions.marker = null;
      }
    }
  }

  // ---- Render ---------------------------------------------------------------
  function render() {
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    if (G.renderer.is3D) {
      // Transparent 2D canvas: the WebGL world shows through underneath.
      ctx.clearRect(0, 0, G.viewW, G.viewH);
    } else {
      ctx.fillStyle = '#0e1420';
      ctx.fillRect(0, 0, G.viewW, G.viewH);
    }
    if (G.state === 'menu') { G.hud.drawMenu(); return; }
    G.renderer.draw(G.cam);
    G.hud.drawHud();
    if (G.state === 'paused') G.hud.drawPause();
    else if (G.state === 'dialog') G.hud.drawDialog();
    else if (G.state === 'wasted') G.hud.drawOverlay('WASTED', 'The hospital patched you up. $ lost to the bill.', '#ff5a5a');
    else if (G.state === 'busted') G.hud.drawOverlay('BUSTED', 'Solmar PD took their cut. The heat is off — for now.', '#4da3ff');
    else if (G.state === 'ending') G.hud.drawEnding();
  }

  // ---- Main loop ------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
    last = now;
    G.input.beginFrame();
    handleKeys();
    update(dt);
    render();
    if (G.onFrame) G.onFrame();
    G.input.endFrame();
    requestAnimationFrame(frame);
  }

  // ---- Boot ------------------------------------------------------------------
  G.audio.ensure();
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    // Screenshot mode: start straight into a staged scene.
    newGame();
    // Clear the mission-0 start so the staged scene owns the objective.
    setupShot(G, shot);
  } else {
    // Menu idle scene: a slow camera drift over downtown behind the menu.
    G.player.x = 1600; G.player.y = 1200;
    G.vehicles.spawnParked(10);
    G.vehicles.spawnTraffic(8);
    G.peds.spawnNearPlayer(14);
  }
  window.__game = G;
  window.__shotReady = false;
  requestAnimationFrame(frame);
})();
