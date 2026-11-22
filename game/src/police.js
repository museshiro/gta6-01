// SOLMAR HEAT 3D — police.js
// The wanted system of the SMPD — Solmar Metropolitan Police Department.
// Crimes add heat, heat sets the star level, and dispatch answers with
// named units: foot cops, RAM-1 / RAM-2 cruisers that ram (2 stars),
// the PIT unit that cuts across your path (3 stars), roadblocks ahead
// of you (3 stars), and CONDOR-1 air support — a helicopter with a
// searchlight that slows your heat decay (4 stars). Lose the heat by
// laying low, hiding, or paying for a respray. Get caught and you're busted.
function createPolice(G) {
  const cops = [];
  const wanted = { level: 0, heat: 0, lastCrime: -99 };
  let bustT = 0, spawnT = 0;
  // CONDOR-1: the SMPD helicopter. {x, y, angle, rotor} or null.
  const heli = { active: false, x: 0, y: 0, angle: 0, rotor: 0, searchR: 170 };
  // Roadblock state: spawned once per wanted-level rise.
  let roadblockLevel = 0;

  function addHeat(n, why) {
    if (G.state !== 'playing') return;
    wanted.heat = U.clamp(wanted.heat + n, 0, 100);
    wanted.lastCrime = G.time;
    const lvl = Math.min(5, Math.floor(wanted.heat / 20));
    if (lvl > wanted.level) {
      wanted.level = lvl;
      G.audio.wantedUp();
      const call = lvl >= 4 ? 'CONDOR-1 air support is inbound'
        : lvl >= 3 ? 'PIT unit and roadblocks are out — SMPD dispatch'
        : lvl >= 2 ? 'RAM-1 and RAM-2 are rolling — SMPD dispatch'
        : 'SMPD responding';
      G.hud.toast('Wanted level ' + lvl + ' — ' + call);
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

  function spawnPoliceCar(x, y, unit) {
    return G.vehicles.spawnPoliceCar(x, y, unit);
  }

  // Pick the next callsign for a fresh cruiser at the current wanted level.
  function nextUnit() {
    if (wanted.level >= 3) {
      const pits = G.vehicles.cars.filter((c) => c.unit === 'PIT').length;
      if (pits === 0) return 'PIT';
    }
    if (wanted.level >= 2) {
      const rams = G.vehicles.cars.filter((c) => c.unit && c.unit.indexOf('RAM') === 0).length;
      if (rams === 0) return 'RAM-1';
      if (rams === 1) return 'RAM-2';
    }
    return null;
  }

  // Roadblock: two cruisers parked across the road ahead of the player.
  function spawnRoadblock() {
    const pl = G.player;
    const ahead = pl.inCar ? 420 : 300;
    const ax = pl.x + Math.cos(pl.angle) * ahead;
    const ay = pl.y + Math.sin(pl.angle) * ahead;
    // Snap to the nearest road so the block sits on tarmac.
    let bx = ax, by = ay;
    if (Math.abs(Math.cos(pl.angle)) > Math.abs(Math.sin(pl.angle))) {
      const ry = G.city.roadsH.reduce((a, b) => Math.abs(ay - b) < Math.abs(ay - a) ? b : a);
      by = ry;
    } else {
      const rx = G.city.roadsV.reduce((a, b) => Math.abs(ax - b) < Math.abs(ax - a) ? b : a);
      bx = rx;
    }
    const perp = pl.angle + Math.PI / 2;
    const c1 = G.vehicles.makeCar(bx + Math.cos(perp) * 30, by + Math.sin(perp) * 30, pl.angle + Math.PI / 2, 'police', 'police');
    const c2 = G.vehicles.makeCar(bx - Math.cos(perp) * 30, by - Math.sin(perp) * 30, pl.angle + Math.PI / 2, 'police', 'police');
    c1.speed = 0; c2.speed = 0;
    c1.unit = 'ROADBLOCK'; c2.unit = 'ROADBLOCK';
    G.hud.toast('SMPD roadblock ahead!');
  }

  function clearWanted() {
    wanted.heat = 0; wanted.level = 0;
    heli.active = false;
    roadblockLevel = 0;
    // Cops give up and drive off.
    for (const c of cops) c.state = 'leave';
    for (const car of G.vehicles.cars) {
      if (car.driver === 'police') car.driver = 'traffic';
    }
  }

  function update(dt) {
    const pl = G.player;
    // CONDOR-1: active at 4+ stars, hovering above the player with a
    // searchlight. It slows heat decay — you stay lit until you break away.
    if (wanted.level >= 4) {
      if (!heli.active) {
        heli.active = true;
        heli.x = pl.x - 260; heli.y = pl.y - 260;
        G.hud.toast('CONDOR-1 overhead — break line of sight!');
      }
      heli.x = U.lerp(heli.x, pl.x, dt * 0.9);
      heli.y = U.lerp(heli.y, pl.y, dt * 0.9);
      heli.angle = Math.atan2(pl.y - heli.y, pl.x - heli.x);
      heli.rotor += dt * 22;
    } else if (heli.active) {
      heli.active = false;
    }
    // Roadblocks: one set per wanted-level rise at 3+ stars.
    if (wanted.level >= 3 && roadblockLevel < wanted.level) {
      roadblockLevel = wanted.level;
      spawnRoadblock();
    }
    // Heat decays when the player stays clean and unseen.
    if (G.time - wanted.lastCrime > 6 && wanted.heat > 0) {
      let nearestCop = 1e9;
      for (const c of cops) nearestCop = Math.min(nearestCop, U.dist(c.x, c.y, pl.x, pl.y));
      for (const car of G.vehicles.cars) {
        if (car.driver === 'police') nearestCop = Math.min(nearestCop, U.dist(car.x, car.y, pl.x, pl.y));
      }
      const hidden = nearestCop > 420 && !heli.active;
      const decay = heli.active ? 0.5 : hidden ? 4.5 : 1.2;
      wanted.heat = Math.max(0, wanted.heat - dt * decay);
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
        spawnPoliceCar(p.x, p.y, nextUnit());
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

  return { cops, wanted, heli, addHeat, spawnCop, spawnPoliceCar, clearWanted, update };
}
