// SOLMAR HEAT — pedestrians.js
// The people of Solmar: they stroll the sidewalks, cross streets, chat,
// panic and flee from gunfire and speeding cars, and get back up after
// being knocked down. A few are mission characters (guards, couriers).
const PED_COLORS = ['#e07b39', '#3f7dbe', '#8e44ad', '#4fae8a', '#c94f4f', '#d8c8a0', '#5a7d5a', '#b85c8a'];

function createPeds(G) {
  const list = [];
  let idc = 1;

  function makePed(x, y, opts) {
    const o = opts || {};
    const ped = {
      id: idc++, x, y,
      angle: U.rand(0, U.TAU),
      speed: U.rand(45, 75),
      state: o.state || 'walk', // walk | idle | flee | down | guard
      hp: o.hp || 40,
      color: o.color || U.pick(PED_COLORS),
      mission: o.mission || null, // 'courier' | 'guard' | null
      fleeT: 0, downT: 0, idleT: U.rand(0, 4),
      target: null, // walk target for guards
      punchCd: 0,
    };
    list.push(ped);
    return ped;
  }

  function spawnNearPlayer(n) {
    for (let i = 0; i < n; i++) {
      const p = G.city.sidewalkPoint();
      // Keep them reasonably near the player so the streets feel alive.
      if (U.dist(p.x, p.y, G.player.x, G.player.y) > 1100) continue;
      makePed(p.x, p.y);
    }
  }

  function nearest(x, y, r) {
    let best = null, bestD = r;
    for (const p of list) {
      if (p.state === 'down') continue;
      const d = U.dist(x, y, p.x, p.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function scare(x, y, radius) {
    for (const p of list) {
      if (p.state === 'down' || p.mission === 'guard') continue;
      if (U.dist(x, y, p.x, p.y) < radius) {
        p.state = 'flee'; p.fleeT = U.rand(2, 4);
      }
    }
  }

  function update(dt) {
    const pl = G.player;
    for (const p of list) {
      p.punchCd = Math.max(0, p.punchCd - dt);
      if (p.state === 'down') {
        p.downT -= dt;
        if (p.downT <= 0 && p.hp > 0) { p.state = 'flee'; p.fleeT = 3; }
        if (p.hp <= 0) { p.downT = Math.max(p.downT, 0.5); }
        continue;
      }
      if (p.hp <= 0) { p.state = 'down'; p.downT = 2.5; continue; }
      if (p.state === 'flee') {
        p.fleeT -= dt;
        // Run away from the player / danger.
        const away = Math.atan2(p.y - pl.y, p.x - pl.x);
        p.angle = U.angleLerp(p.angle, away, dt * 6);
        const sp = 190;
        const nx = p.x + Math.cos(p.angle) * sp * dt;
        const ny = p.y + Math.sin(p.angle) * sp * dt;
        const px = { x: nx, y: p.y };
        if (!G.city.resolveCircle(px, 12)) p.x = nx; else p.x = px.x;
        const py = { x: p.x, y: ny };
        if (!G.city.resolveCircle(py, 12)) p.y = ny; else p.y = py.y;
        if (p.fleeT <= 0) p.state = 'walk';
        continue;
      }
      if (p.mission === 'guard') {
        // Guards hold their post and attack the player up close.
        const d = U.dist(p.x, p.y, pl.x, pl.y);
        if (d < 260 && !pl.dead && !pl.inCar) {
          p.angle = Math.atan2(pl.y - p.y, pl.x - p.x);
          if (d > 46) {
            const sp = 150;
            p.x += Math.cos(p.angle) * sp * dt;
            p.y += Math.sin(p.angle) * sp * dt;
          } else if (p.punchCd <= 0) {
            p.punchCd = 0.9;
            pl.damage(9);
            G.audio.punch();
          }
        }
        continue;
      }
      // Normal stroll: walk, pause, pick a new direction.
      if (p.state === 'idle') {
        p.idleT -= dt;
        if (p.idleT <= 0) { p.state = 'walk'; p.angle = U.rand(0, U.TAU); }
        continue;
      }
      const nx = p.x + Math.cos(p.angle) * p.speed * dt;
      const ny = p.y + Math.sin(p.angle) * p.speed * dt;
      const px = { x: nx, y: p.y };
      const hitX = G.city.resolveCircle(px, 12);
      if (!hitX) p.x = nx; else p.x = px.x;
      const py = { x: p.x, y: ny };
      const hitY = G.city.resolveCircle(py, 12);
      if (!hitY) p.y = ny; else p.y = py.y;
      if (hitX || hitY || U.chance(dt * 0.12)) {
        if (U.chance(0.3)) { p.state = 'idle'; p.idleT = U.rand(1, 4); }
        else p.angle = U.rand(0, U.TAU);
      }
      // Stay on walkable ground: drift back toward roads when lost in a block.
      if (!G.city.isRoad(p.x, p.y) && !G.city.buildingAt(p.x, p.y) && U.chance(dt * 0.4)) {
        p.angle = U.rand(0, U.TAU);
      }
    }
    // Keep the crowd topped up near the player; cull the far away.
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.mission) continue;
      if (U.dist(p.x, p.y, pl.x, pl.y) > 1400) list.splice(i, 1);
    }
    let count = 0;
    for (const p of list) if (!p.mission) count++;
    if (count < 22 && U.chance(dt * 3)) {
      const p = G.city.pointNear(pl.x, pl.y, 300, 800);
      const s = G.city.sidewalkPoint();
      makePed(s.x, s.y);
    }
  }

  return { list, makePed, spawnNearPlayer, nearest, scare, update };
}
