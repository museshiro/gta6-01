// SOLMAR HEAT — main.js
// Bootstraps the game: canvas, every system, the main loop, the state
// machine (menu / playing / paused / dialog / wasted / busted / ending),
// the camera, particles, pickups, the respray shop, and save/load via
// localStorage. Also handles ?shot=... for screenshot mode.
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const SAVE_KEY = 'solmar-heat-save-v1';

  const G = {
    canvas, ctx,
    dpr: 1, viewW: 0, viewH: 0,
    time: 0,
    state: 'menu', // menu | playing | paused | dialog | wasted | busted | ending
    cam: { x: 1600, y: 1200, zoom: 1, shake: 0, view: { x0: 0, y0: 0, x1: 0, y1: 0 } },
    particles: [],
    skids: [],
    pickups: [],
    muzzle: null,
    onFrame: null,
  };

  function resize() {
    G.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    G.viewW = window.innerWidth;
    G.viewH = window.innerHeight;
    canvas.width = Math.floor(G.viewW * G.dpr);
    canvas.height = Math.floor(G.viewH * G.dpr);
    canvas.style.width = G.viewW + 'px';
    canvas.style.height = G.viewH + 'px';
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
  G.renderer = createRenderer(G);
  G.hud = createHud(G);

  G.screenToWorld = function (sx, sy) {
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

  // ---- Save / load -------------------------------------------------------
  G.saveGame = function () {
    try {
      const pl = G.player;
      const data = {
        x: pl.x, y: pl.y, cash: pl.cash, hp: pl.hp,
        hasPistol: pl.hasPistol, ammo: pl.ammo,
        mission: G.missions.idx, stashes: G.missions.stashesFound,
        time: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable (file://, private mode) — ignore */ }
  };
  G.loadSaveData = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };
  function applySave(data) {
    const pl = G.player;
    pl.x = data.x; pl.y = data.y;
    pl.cash = data.cash; pl.hp = data.hp;
    pl.hasPistol = !!data.hasPistol; pl.ammo = data.ammo || 0;
    G.missions.stashesFound = data.stashes || 0;
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
    G.vehicles.cars.length = 0;
    G.peds.list.length = 0;
    G.police.cops.length = 0;
    G.police.wanted.heat = 0; G.police.wanted.level = 0;
    G.particles.length = 0; G.skids.length = 0; G.pickups.length = 0;
    G.missions.idx = -1;
    G.missions.stashes = [];
    G.missions.stashesFound = 0;
    G.vehicles.spawnParked(14);
    G.vehicles.spawnTraffic(12);
    G.peds.spawnNearPlayer(20);
    G.cam.x = pl.x; G.cam.y = pl.y; G.cam.zoom = 1;
    G.state = 'playing';
    G.audio.ensure();
    G.audio.startMusic();
    G.hud.toast('Welcome to Solmar City, Leo');
    // Last: the briefing dialog takes over (state -> 'dialog' until E).
    G.missions.startMission(0);
  }
  function continueGame() {
    const data = G.loadSaveData();
    newGame();
    if (!data) return;
    const mission = applySave(data);
    G.missions.idx = -1;
    if (mission >= 0 && mission < 5) G.missions.startMission(mission);
    else if (mission >= 5) G.missions.idx = 5;
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
    if (G.state === 'playing') {
      G.player.update(dt);
      G.vehicles.update(dt);
      G.peds.update(dt);
      G.police.update(dt);
      G.missions.update(dt);
      resprayCheck(dt);
      // Camera follows the player (or the car), zooming out with speed.
      const pl = G.player;
      const targetZoom = pl.inCar ? U.clamp(1.05 - Math.abs(pl.inCar.speed) / 2400, 0.72, 1.0) : 1.0;
      G.cam.zoom = U.lerp(G.cam.zoom, targetZoom, dt * 2);
      G.cam.x = U.lerp(G.cam.x, pl.x, 1 - Math.pow(0.001, dt));
      G.cam.y = U.lerp(G.cam.y, pl.y, 1 - Math.pow(0.001, dt));
    }
    G.hud.update(dt);
  }

  // ---- Input routing by state ---------------------------------------------
  function handleKeys() {
    const input = G.input;
    if (input.wasPressed('KeyM')) {
      G.audio.setMuted(!G.audio.isMuted());
      G.hud.toast(G.audio.isMuted() ? 'Sound muted' : 'Sound on');
    }
    if (G.state === 'menu') {
      if (input.wasPressed('Enter') || input.mouse.clicked) {
        G.audio.ensure();
        if (G.loadSaveData()) continueGame(); else newGame();
      }
      return;
    }
    if (G.state === 'dialog') {
      if (input.wasPressed('KeyE') || input.wasPressed('Enter') || input.mouse.clicked) {
        G.audio.click();
        G.hud.closeDialog();
      }
      return;
    }
    if (G.state === 'playing') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        G.state = 'paused';
        G.audio.engine(0, false);
      }
      return;
    }
    if (G.state === 'paused') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) G.state = 'playing';
      if (input.wasPressed('KeyS')) { G.saveGame(); G.hud.toast('Game saved'); }
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
        G.missions.idx = 5; // free roam
        G.missions.objective = 'Free roam — Solmar is yours';
        G.missions.marker = null;
      }
    }
  }

  // ---- Render ---------------------------------------------------------------
  function render() {
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.fillStyle = '#0e1420';
    ctx.fillRect(0, 0, G.viewW, G.viewH);
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
