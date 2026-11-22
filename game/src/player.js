// SOLMAR HEAT 3D — player.js
// Leo Marín, the player. On foot he walks, runs, punches and shoots; near a
// car he can steal it and drive. Holds health, cash, ammo and the wanted
// consequences of dying or getting busted are handled by the main loop.
// Weapons: Fist, Pistol, SMG (auto, mission 3) and Shotgun (garage, $800),
// switched with the Q weapon wheel. Garage upgrades live here too:
// engine levels, armor levels and nitro (Shift while driving).
const WEAPONS = {
  fist: { name: 'Fist', cd: 0.38, dmg: 18, pellets: 1, spread: 0, auto: false },
  pistol: { name: 'Pistol', cd: 0.28, dmg: 34, pellets: 1, spread: 0, auto: false },
  smg: { name: 'SMG', cd: 0.09, dmg: 12, pellets: 1, spread: 0.09, auto: true },
  shotgun: { name: 'Shotgun', cd: 0.85, dmg: 14, pellets: 5, spread: 0.22, auto: false },
};

function createPlayer(G) {
  const p = {
    x: 0, y: 0, angle: -Math.PI / 2, speed: 0,
    hp: 100, maxHp: 100,
    cash: 150, ammo: 24, hasPistol: false,
    inCar: null, // car object when driving, else null
    punchCd: 0, shootCd: 0, hurtCd: 0, dead: false,
    walkPhase: 0, moving: false,
    // Weapon wheel state.
    weapon: 'fist',
    weapons: {
      fist: { owned: true, ammo: Infinity },
      pistol: { owned: false, ammo: 0 },
      smg: { owned: false, ammo: 0 },
      shotgun: { owned: false, ammo: 0 },
    },
    // Garage upgrades (Nadia's Garage): engine 0-3, armor 0-2, nitro bool.
    upgrades: { engine: 0, armor: 0, nitro: false },
    nitroT: 0, nitroCd: 0,
  };

  function reset(x, y) {
    p.x = x; p.y = y; p.angle = -Math.PI / 2; p.speed = 0;
    p.hp = p.maxHp; p.inCar = null; p.dead = false;
    p.punchCd = 0; p.shootCd = 0; p.hurtCd = 0;
    p.nitroT = 0; p.nitroCd = 0;
  }

  function grantWeapon(kind, ammo) {
    const w = p.weapons[kind];
    if (!w) return;
    w.owned = true;
    if (ammo) w.ammo += ammo;
    if (kind === 'pistol') { p.hasPistol = true; }
    p.weapon = kind;
    syncAmmo();
  }
  function syncAmmo() {
    const w = p.weapons[p.weapon];
    p.ammo = w && isFinite(w.ammo) ? w.ammo : 0;
    if (p.weapon === 'pistol') p.hasPistol = p.weapons.pistol.owned;
  }
  function selectWeapon(kind) {
    if (!p.weapons[kind] || !p.weapons[kind].owned) return false;
    p.weapon = kind;
    p.shootCd = Math.max(p.shootCd, 0.15);
    syncAmmo();
    G.hud.toast(WEAPONS[kind].name + ' equipped');
    return true;
  }

  function moveOnFoot(dt) {
    const input = G.input;
    const mx = input.moveX(), my = input.moveY();
    p.moving = mx !== 0 || my !== 0;
    const run = input.run() ? 1.55 : 1;
    const spd = 185 * run;
    if (p.moving) {
      const len = Math.hypot(mx, my) || 1;
      const nx = p.x + (mx / len) * spd * dt;
      const ny = p.y + (my / len) * spd * dt;
      // Axis-separated movement so the player slides along walls.
      const px = { x: nx, y: p.y };
      if (!G.city.resolveCircle(px, 16)) p.x = nx; else p.x = px.x;
      const py = { x: p.x, y: ny };
      if (!G.city.resolveCircle(py, 16)) p.y = ny; else p.y = py.y;
      p.angle = Math.atan2(my, mx);
      p.walkPhase += dt * (run > 1 ? 13 : 9);
    }
    // Aim with the mouse when a gun is out.
    if (p.weapon !== 'fist' && G.input.mouse.x !== undefined) {
      const m = G.screenToWorld(G.input.mouse.x, G.input.mouse.y);
      p.angle = Math.atan2(m.y - p.y, m.x - p.x);
    }
  }

  function punch() {
    if (p.punchCd > 0 || p.inCar) return;
    p.punchCd = 0.38;
    G.audio.punch();
    const range = 52, arc = 1.1;
    // Hit peds, cops and guards in front of the player.
    const targets = [];
    for (const ped of G.peds.list) targets.push({ e: ped, kind: 'ped' });
    for (const cop of G.police.cops) targets.push({ e: cop, kind: 'cop' });
    for (const t of targets) {
      const d = U.dist(p.x, p.y, t.e.x, t.e.y);
      if (d > range + 14) continue;
      const a = Math.abs(U.angleDiff(p.angle, Math.atan2(t.e.y - p.y, t.e.x - p.x)));
      if (a > arc) continue;
      t.e.hp -= 18;
      t.e.x += Math.cos(p.angle) * 26;
      t.e.y += Math.sin(p.angle) * 26;
      G.addParticles(t.e.x, t.e.y, 6, '#ffd34d');
      if (t.e.hp <= 0) {
        t.e.state = 'down';
        t.e.downT = 2.2;
        if (t.kind === 'ped' && U.chance(0.6)) G.spawnPickup(t.e.x, t.e.y, 'cash', U.randi(10, 40));
        if (t.kind === 'cop') G.police.addHeat(30, 'assaulted an officer');
      } else if (t.kind === 'ped') {
        t.e.state = 'flee';
        t.e.fleeT = 3;
      }
    }
    // Smashing a car window / door also works.
    const car = G.vehicles.nearestCar(p.x, p.y, 60);
    if (car && car.driver !== 'player') {
      car.hp -= 8;
      G.addParticles(p.x + Math.cos(p.angle) * 40, p.y + Math.sin(p.angle) * 40, 5, '#cfe8ff');
      if (car.hp <= 0) G.vehicles.disableCar(car);
    }
  }

  // One trigger pull for the current weapon (SMG fires while held).
  function shoot() {
    if (p.shootCd > 0 || p.inCar || p.weapon === 'fist') return;
    const spec = WEAPONS[p.weapon];
    const w = p.weapons[p.weapon];
    if (w.ammo <= 0) { G.hud.toast('Out of ammo — find a stash'); G.audio.click(); p.shootCd = 0.3; return; }
    p.shootCd = spec.cd;
    w.ammo--;
    syncAmmo();
    G.audio.shot();
    const m = G.screenToWorld(G.input.mouse.x, G.input.mouse.y);
    const aim = Math.atan2(m.y - p.y, m.x - p.x);
    const gx = p.x + Math.cos(aim) * 30, gy = p.y + Math.sin(aim) * 30;
    G.addParticles(gx, gy, 4, '#ffe08a');
    G.muzzle = { x: gx, y: gy, a: aim, t: 0.07 };
    // Pellets spread around the aim line; each finds its own nearest target.
    for (let pi = 0; pi < spec.pellets; pi++) {
      const a2 = aim + U.rand(-spec.spread, spec.spread);
      let best = null, bestD = 420;
      const consider = (e, kind) => {
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d > bestD) return;
        const a = Math.abs(U.angleDiff(a2, Math.atan2(e.y - p.y, e.x - p.x)));
        if (a < 0.22 + 26 / Math.max(d, 40)) { best = { e, kind }; bestD = d; }
      };
      for (const ped of G.peds.list) if (ped.state !== 'down') consider(ped, 'ped');
      for (const cop of G.police.cops) consider(cop, 'cop');
      for (const car of G.vehicles.cars) {
        if (car.driver === 'player') continue;
        consider(car, 'car');
      }
      if (best) {
        const e = best.e;
        if (best.kind === 'car') {
          e.hp -= spec.dmg;
          G.addParticles(e.x, e.y, 8, '#ffb347');
          if (e.hp <= 0) G.vehicles.disableCar(e);
          else G.police.addHeat(10, 'fired at a car');
        } else {
          e.hp -= spec.dmg;
          G.addParticles(e.x, e.y, 8, '#ff5a5a');
          if (e.hp <= 0) {
            e.state = 'down'; e.downT = 3;
            if (best.kind === 'ped') { G.police.addHeat(35, 'shot a pedestrian'); G.spawnPickup(e.x, e.y, 'cash', U.randi(15, 50)); }
            if (best.kind === 'cop') G.police.addHeat(40, 'shot an officer');
          } else {
            e.state = 'flee'; e.fleeT = 3;
            if (best.kind === 'cop') G.police.addHeat(15, 'fired at police');
          }
        }
      } else if (pi === 0) {
        G.police.addHeat(6, 'fired a gun');
      }
    }
  }

  function tryEnterCar() {
    if (p.inCar) { exitCar(); return; }
    const car = G.vehicles.nearestCar(p.x, p.y, 78);
    if (!car || car.disabled) return;
    if (car.driver && car.driver !== 'player') {
      // Jack the driver out.
      const d = car.driver;
      d.state = 'flee'; d.fleeT = 4;
      d.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
      d.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
      car.driver = null;
      G.police.addHeat(12, 'carjacked a driver');
      G.hud.toast('You jacked the car!');
    } else if (car.driver === 'parked') {
      G.police.addHeat(8, 'stole a parked car');
    }
    car.driver = 'player';
    p.inCar = car;
    G.audio.click();
    G.hud.toast('Driving — ' + car.name);
  }

  function exitCar() {
    const car = p.inCar;
    if (!car) return;
    car.driver = null;
    car.speed *= 0.2;
    p.inCar = null;
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * 44;
    p.y = car.y + Math.sin(side) * 44;
    G.city.resolveCircle(p, 16);
    p.angle = car.angle;
  }

  function damage(n, from) {
    if (p.hurtCd > 0 || p.dead) return;
    p.hp -= n;
    p.hurtCd = 0.5;
    G.cam.shake = Math.min(G.cam.shake + 0.35, 1);
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      G.audio.wasted();
      G.onPlayerDead();
    }
  }

  function update(dt) {
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    p.nitroT = Math.max(0, p.nitroT - dt);
    p.nitroCd = Math.max(0, p.nitroCd - dt);
    if (p.dead || G.state !== 'playing' || G.wheelOpen) return;
    if (p.inCar) return; // the car drives; the player rides along
    moveOnFoot(dt);
    if (G.input.wasPressed('Space') || G.input.wasPressed('KeyJ')) {
      if (p.weapon === 'fist') punch();
    }
    // Fire: click / F for single-shot weapons, hold for the SMG.
    const spec = WEAPONS[p.weapon];
    if (p.weapon !== 'fist') {
      if (spec.auto) { if (G.input.mouse.down || G.input.down('KeyF')) shoot(); }
      else if (G.input.mouse.clicked || G.input.wasPressed('KeyF')) shoot();
    }
    if (G.input.wasPressed('KeyE')) tryEnterCar();
    // Passive regen, slow.
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1.2 * dt);
  }

  // Attach the methods to the live player object itself (no copy: callers
  // mutate G.player fields directly and the closure reads the same object).
  p.reset = reset;
  p.update = update;
  p.punch = punch;
  p.shoot = shoot;
  p.tryEnterCar = tryEnterCar;
  p.exitCar = exitCar;
  p.damage = damage;
  p.grantWeapon = grantWeapon;
  p.selectWeapon = selectWeapon;
  p.syncAmmo = syncAmmo;
  return p;
}
