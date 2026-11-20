// SOLMAR HEAT — police.js
// The wanted system: crimes add heat, heat sets the star level, and the
// Solmar PD responds with foot cops and cruisers. Lose the heat by laying
// low, hiding, or paying for a respray. Get caught and you're busted.
function createPolice(G) {
  const cops = [];
  const wanted = { level: 0, heat: 0, lastCrime: -99 };
  let bustT = 0, spawnT = 0;

  function addHeat(n, why) {
    if (G.state !== 'playing') return;
    wanted.heat = U.clamp(wanted.heat + n, 0, 100);
    wanted.lastCrime = G.time;
    const lvl = Math.min(5, Math.floor(wanted.heat / 20));
    if (lvl > wanted.level) {
      wanted.level = lvl;
      G.audio.wantedUp();
      G.hud.toast('Wanted level ' + lvl + (lvl >= 3 ? ' — the whole PD is after you!' : ' — police are responding'));
      if (why) G.hud.toast(why);
    }
  }

  function spawnCop(x, y) {
    const cop = {
      x, y, angle: U.rand(0, U.TAU), speed: 205,
      hp: 60, state: 'chase', punchCd: 0, downT: 0,
      color: '#2f4d7d', kind: 'cop',
    };
    cops.push(cop);
    return cop;
  }

  function spawnPoliceCar(x, y) {
    return G.vehicles.spawnPoliceCar(x, y);
  }

  function clearWanted() {
    wanted.heat = 0; wanted.level = 0;
    // Cops give up and drive off.
    for (const c of cops) c.state = 'leave';
    for (const car of G.vehicles.cars) {
      if (car.driver === 'police') car.driver = 'traffic';
    }
  }

  function update(dt) {
    const pl = G.player;
    // Heat decays when the player stays clean and unseen.
    if (G.time - wanted.lastCrime > 6 && wanted.heat > 0) {
      let nearestCop = 1e9;
      for (const c of cops) nearestCop = Math.min(nearestCop, U.dist(c.x, c.y, pl.x, pl.y));
      for (const car of G.vehicles.cars) {
        if (car.driver === 'police') nearestCop = Math.min(nearestCop, U.dist(car.x, car.y, pl.x, pl.y));
      }
      const hidden = nearestCop > 420;
      wanted.heat = Math.max(0, wanted.heat - dt * (hidden ? 4.5 : 1.2));
      const lvl = Math.min(5, Math.floor(wanted.heat / 20));
      if (lvl < wanted.level) {
        wanted.level = lvl;
        if (lvl === 0) { G.hud.toast('You lost them. Heat is off.'); clearWanted(); }
      }
    }
    if (wanted.level === 0) {
      // Idle: a couple of patrol cars cruise the city.
      return;
    }
    // Spawn pressure scales with the wanted level.
    spawnT -= dt;
    const wantFoot = wanted.level * 2;
    const wantCars = wanted.level >= 1 ? Math.min(wanted.level, 3) : 0;
    let foot = 0, cars = 0;
    for (const c of cops) if (c.state === 'chase') foot++;
    for (const car of G.vehicles.cars) if (car.driver === 'police') cars++;
    if (spawnT <= 0) {
      spawnT = 1.1;
      if (foot < wantFoot) {
        const p = G.city.pointNear(pl.x, pl.y, 420, 700);
        spawnCop(p.x, p.y);
      } else if (cars < wantCars) {
        const p = G.city.pointNear(pl.x, pl.y, 500, 800);
        spawnPoliceCar(p.x, p.y);
      }
    }
    // Foot cops chase and try to bust the player.
    bustT = 0;
    for (let i = cops.length - 1; i >= 0; i--) {
      const c = cops[i];
      if (c.hp <= 0) { c.state = 'down'; c.downT -= dt; if (c.downT <= -4) cops.splice(i, 1); continue; }
      if (c.state === 'down') { c.downT -= dt; if (c.downT <= 0) { c.hp = 40; c.state = 'chase'; } continue; }
      if (c.state === 'leave') {
        c.angle = U.angleLerp(c.angle, Math.atan2(c.y - pl.y, c.x - pl.x) + Math.PI, dt * 3);
        c.x += Math.cos(c.angle) * 170 * dt;
        c.y += Math.sin(c.angle) * 170 * dt;
        if (U.dist(c.x, c.y, pl.x, pl.y) > 1000) cops.splice(i, 1);
        continue;
      }
      // Chase.
      const d = U.dist(c.x, c.y, pl.x, pl.y);
      c.angle = Math.atan2(pl.y - c.y, pl.x - c.x);
      if (d > 44) {
        const sp = 205 + wanted.level * 8;
        const nx = c.x + Math.cos(c.angle) * sp * dt;
        const ny = c.y + Math.sin(c.angle) * sp * dt;
        const px = { x: nx, y: c.y };
        if (!G.city.resolveCircle(px, 13)) c.x = nx; else c.x = px.x;
        const py = { x: c.x, y: ny };
        if (!G.city.resolveCircle(py, 13)) c.y = ny; else c.y = py.y;
      } else if (!pl.inCar && !pl.dead) {
        // Busting: hold the player still for a moment.
        bustT += dt;
        if (bustT > 1.1) {
          G.onPlayerBusted();
          return;
        }
      }
      c.punchCd = Math.max(0, c.punchCd - dt);
      // A cop next to the player on foot throws a punch.
      if (d < 52 && !pl.inCar && !pl.dead && c.punchCd <= 0) {
        c.punchCd = 0.9;
        pl.damage(8);
        G.audio.punch();
      }
    }
    // Siren audio by nearest police.
    let nd = 1e9;
    for (const car of G.vehicles.cars) if (car.driver === 'police') nd = Math.min(nd, U.dist(car.x, car.y, pl.x, pl.y));
    for (const c of cops) nd = Math.min(nd, U.dist(c.x, c.y, pl.x, pl.y));
    G.audio.siren(nd === 1e9 ? null : nd);
  }

  return { cops, wanted, addHeat, spawnCop, spawnPoliceCar, clearWanted, update };
}
