// SOLMAR HEAT — vehicles.js
// Cars: arcade driving physics, traffic that follows the road grid, parked
// cars to steal, and police cruisers that chase. A car is a circle for
// collision (radius ~26) with an angle, speed and a driver tag.
const CAR_TYPES = {
  sedan:   { name: 'Solmar Sedan',   max: 520, accel: 430, color: '#c94f4f' },
  sports:  { name: 'Vortex GT',     max: 730, accel: 560, color: '#f2b705' },
  taxi:    { name: 'City Taxi',     max: 500, accel: 420, color: '#f2c200' },
  van:     { name: 'Cargo Van',     max: 430, accel: 340, color: '#7d8aa5' },
  truck:   { name: 'Flatbed Truck', max: 400, accel: 300, color: '#5a7d5a' },
  police:  { name: 'Police Cruiser', max: 660, accel: 520, color: '#2f6fd0' },
  coupe:   { name: 'Solmar Coupe',  max: 600, accel: 480, color: '#8e44ad' },
};
const CAR_COLORS = ['#c94f4f', '#3f7dbe', '#e8e8e8', '#2b2b2b', '#e07b39', '#4fae8a', '#d8c8a0', '#7d5aa5'];

function createVehicles(G) {
  const cars = [];
  let idc = 1;

  function makeCar(x, y, angle, type, driver) {
    const t = CAR_TYPES[type] || CAR_TYPES.sedan;
    const car = {
      id: idc++, x, y, angle, speed: 0,
      type, name: t.name, max: t.max, accel: t.accel,
      color: t.color, // type color: the Vortex GT is always gold, so it reads as the hero car
      driver: driver || null, // 'player' | 'traffic' | 'police' | 'parked' | ped object | null
      hp: 100, disabled: false, r: 26,
      // Traffic AI state.
      road: null, dir: 1, cruise: U.rand(170, 230), stuckT: 0,
      siren: 0, smokeT: 0, skid: 0,
    };
    cars.push(car);
    return car;
  }

  function spawnParked(n) {
    for (let i = 0; i < n; i++) {
      const p = G.city.roadPoint();
      const off = G.city.ROAD_W / 2 - 14;
      const x = p.vertical ? p.x + (U.chance(0.5) ? off : -off) : p.x;
      const y = p.vertical ? p.y : p.y + (U.chance(0.5) ? off : -off);
      const angle = p.vertical ? (U.chance(0.5) ? 0 : Math.PI) : (U.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
      const type = U.pick(['sedan', 'sedan', 'coupe', 'van', 'sports', 'taxi']);
      if (G.city.buildingAt(x, y)) continue;
      makeCar(x, y, angle, type, 'parked');
    }
  }

  function spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const p = G.city.roadPoint();
      const angle = p.vertical ? (U.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (U.chance(0.5) ? 0 : Math.PI);
      const car = makeCar(p.x, p.y, angle, U.pick(['sedan', 'sedan', 'taxi', 'van', 'coupe', 'truck']), 'traffic');
      car.road = p;
      car.cruise = U.rand(160, 240);
    }
  }

  function spawnPoliceCar(x, y) {
    const car = makeCar(x, y, U.rand(0, U.TAU), 'police', 'police');
    car.cruise = 620;
    return car;
  }

  function nearestCar(x, y, r) {
    let best = null, bestD = r;
    for (const c of cars) {
      if (c.disabled) continue;
      const d = U.dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function disableCar(car) {
    car.disabled = true;
    car.speed = 0;
    G.addParticles(car.x, car.y, 16, '#666666');
    G.addParticles(car.x, car.y, 10, '#ffb347');
    G.audio.crash(0.7);
    if (car.driver === 'player') {
      G.player.inCar = null;
      G.player.x = car.x + 40; G.player.y = car.y + 40;
      G.hud.toast('Your car is wrecked!');
    }
    car.driver = null;
  }

  // Arcade car physics: accelerate, steer (less at high speed), drag, drift.
  function driveCar(car, dt, throttle, steer) {
    const t = CAR_TYPES[car.type];
    if (throttle > 0) car.speed += t.accel * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 20) car.speed -= 900 * dt; // brake
      else car.speed -= 260 * dt; // reverse
    }
    car.speed = U.clamp(car.speed, -220, t.max);
    // Drag.
    car.speed -= car.speed * 0.35 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
    const sf = U.clamp(Math.abs(car.speed) / 240, 0, 1);
    car.angle += steer * 2.7 * sf * dt * (car.speed < 0 ? -1 : 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const px = { x: nx, y: car.y };
    const hitX = G.city.resolveCircle(px, car.r);
    if (!hitX) car.x = nx; else { car.x = px.x; car.speed *= 0.55; car.hp -= 2; if (car.driver === 'player') G.audio.crash(0.3); }
    const py = { x: car.x, y: ny };
    const hitY = G.city.resolveCircle(py, car.r);
    if (!hitY) car.y = ny; else { car.y = py.y; car.speed *= 0.55; car.hp -= 2; }
    if ((hitX || hitY) && Math.abs(car.speed) > 200) {
      G.addParticles(car.x, car.y, 6, '#ffb347');
      G.cam.shake = Math.min(G.cam.shake + 0.25, 1);
    }
    // Skid marks at speed + hard steering.
    if (Math.abs(car.speed) > 320 && Math.abs(steer) > 0.4) {
      car.skid += dt;
      if (car.skid > 0.05) {
        car.skid = 0;
        G.addSkid(car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18);
      }
    }
    if (car.hp <= 0 && !car.disabled) disableCar(car);
  }

  function trafficUpdate(car, dt) {
    // Follow the road grid: drive along the current road; at intersections
    // sometimes turn. Slow down if another car is right ahead.
    const ahead = car.x + Math.cos(car.angle) * 60;
    const aheadY = car.y + Math.sin(car.angle) * 60;
    let blocked = false;
    for (const o of cars) {
      if (o === car || o.disabled) continue;
      if (U.dist(ahead, aheadY, o.x, o.y) < 44) { blocked = true; break; }
    }
    const nearPlayer = G.player.inCar === car;
    let throttle = blocked ? 0 : 1;
    let steer = 0;
    // At an intersection, pick a new heading.
    const onV = Math.abs(car.angle - Math.PI / 2) < 0.3 || Math.abs(car.angle + Math.PI / 2) < 0.3;
    const crossV = onV ? G.city.roadsV : G.city.roadsH;
    const along = onV ? car.y : car.x;
    let atCross = false;
    for (const c of crossV) if (Math.abs(along - c) < 26) { atCross = true; break; }
    if (atCross && U.chance(dt * 0.9)) {
      // Turn or go straight.
      const turn = U.pick([-Math.PI / 2, 0, Math.PI / 2]);
      car.angle = U.angleLerp(car.angle, Math.round((car.angle + turn) / (Math.PI / 2)) * (Math.PI / 2), 1);
      car.angle = ((car.angle % U.TAU) + U.TAU) % U.TAU;
    }
    // Keep the car glued to its lane.
    if (onV) {
      const lane = G.city.roadsV.reduce((a, b) => Math.abs(car.x - b) < Math.abs(car.x - a) ? b : a);
      car.x = U.lerp(car.x, lane + (car.dir > 0 ? 18 : -18), dt * 2);
    } else {
      const lane = G.city.roadsH.reduce((a, b) => Math.abs(car.y - b) < Math.abs(car.y - a) ? b : a);
      car.y = U.lerp(car.y, lane + (car.dir > 0 ? 18 : -18), dt * 2);
    }
    car.speed = U.lerp(car.speed, blocked ? 0 : car.cruise, dt * 1.2);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const px = { x: nx, y: car.y };
    if (!G.city.resolveCircle(px, car.r)) car.x = nx; else car.x = px.x;
    const py = { x: car.x, y: ny };
    if (!G.city.resolveCircle(py, car.r)) car.y = ny; else car.y = py.y;
    if (nearPlayer) return;
  }

  function policeCarUpdate(car, dt) {
    const pl = G.player;
    const tx = pl.inCar ? pl.inCar.x : pl.x;
    const ty = pl.inCar ? pl.inCar.y : pl.y;
    const want = Math.atan2(ty - car.y, tx - car.x);
    const diff = U.angleDiff(car.angle, want);
    const steer = U.clamp(diff * 1.6, -1, 1);
    const d = U.dist(car.x, car.y, tx, ty);
    const throttle = d > 60 ? 1 : 0.2;
    driveCar(car, dt, throttle, steer);
    car.siren = (car.siren + dt) % 0.8;
    // Ram the player's car.
    const pc = pl.inCar;
    if (pc && U.dist(car.x, car.y, pc.x, pc.y) < 52) {
      pc.hp -= 14 * dt;
      pc.speed *= 0.985;
      if (U.chance(dt * 8)) G.addParticles(car.x, car.y, 4, '#ffb347');
      if (pc.hp <= 0) disableCar(pc);
    }
    // If the player is on foot and a cruiser gets close, a cop gets out.
    if (!pc && d < 90 && G.police.cops.length < 10 && U.chance(dt * 0.5)) {
      G.police.spawnCop(car.x + 40, car.y + 40);
      car.speed *= 0.3;
    }
  }

  function carVsCar(dt) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        if (a.disabled || b.disabled) continue;
        const d = U.dist(a.x, a.y, b.x, b.y);
        const min = a.r + b.r - 6;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 120) {
            a.hp -= 4; b.hp -= 4;
            G.addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 5, '#ffb347');
            if (a.driver === 'player' || b.driver === 'player') G.audio.crash(0.4);
          }
          a.speed *= 0.92; b.speed *= 0.92;
          if (a.hp <= 0) disableCar(a);
          if (b.hp <= 0) disableCar(b);
        }
      }
    }
  }

  function update(dt) {
    // Player driving.
    const pl = G.player;
    if (pl.inCar && !pl.inCar.disabled) {
      const input = G.input;
      const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
      const steer = (input.down('KeyA') || input.down('ArrowLeft') ? -1 : 0) + (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);
      driveCar(pl.inCar, dt, throttle, steer);
      pl.x = pl.inCar.x; pl.y = pl.inCar.y; pl.angle = pl.inCar.angle;
      if (input.wasPressed('KeyE')) pl.exitCar();
      // Engine + speed audio.
      G.audio.engine(Math.abs(pl.inCar.speed) / pl.inCar.max, true);
    } else {
      G.audio.engine(0, false);
    }
    for (const car of cars) {
      if (car.disabled) continue;
      if (car.driver === 'player') continue;
      if (car.driver === 'police') policeCarUpdate(car, dt);
      else if (car.driver === 'traffic') trafficUpdate(car, dt);
      // Parked cars and driverless cars sit still.
      car.smokeT -= dt;
      if (car.hp < 45 && car.smokeT <= 0) {
        car.smokeT = 0.12;
        G.addParticles(car.x, car.y - 10, 2, '#888888');
      }
    }
    carVsCar(dt);
    // Car vs pedestrian: running someone over.
    for (const car of cars) {
      if (car.disabled || Math.abs(car.speed) < 60) continue;
      for (const ped of G.peds.list) {
        if (ped.state === 'down') continue;
        if (U.dist(car.x, car.y, ped.x, ped.y) < car.r + 12) {
          ped.hp -= 40;
          ped.state = 'down'; ped.downT = 2.5;
          ped.x += Math.cos(car.angle) * 30; ped.y += Math.sin(car.angle) * 30;
          G.addParticles(ped.x, ped.y, 8, '#ff5a5a');
          if (car.driver === 'player') {
            G.police.addHeat(20, 'ran over a pedestrian');
            if (U.chance(0.5)) G.spawnPickup(ped.x, ped.y, 'cash', U.randi(10, 35));
          }
        }
      }
      // Car vs player on foot.
      if (car.driver !== 'player' && !pl.inCar && !pl.dead) {
        if (U.dist(car.x, car.y, pl.x, pl.y) < car.r + 14 && Math.abs(car.speed) > 80) {
          pl.damage(18);
          pl.x += Math.cos(car.angle) * 34; pl.y += Math.sin(car.angle) * 34;
          G.addParticles(pl.x, pl.y, 8, '#ff5a5a');
        }
      }
    }
    // Despawn far traffic, keep the streets alive near the player.
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if (c.driver === 'traffic' && U.dist(c.x, c.y, pl.x, pl.y) > 1500) {
        cars.splice(i, 1);
      }
    }
    // Top up traffic near the player.
    let traffic = 0;
    for (const c of cars) if (c.driver === 'traffic') traffic++;
    if (traffic < 14 && U.chance(dt * 2)) {
      const p = G.city.pointNear(pl.x, pl.y, 500, 900);
      const angle = p.vertical ? (U.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (U.chance(0.5) ? 0 : Math.PI);
      const car = makeCar(p.x, p.y, angle, U.pick(['sedan', 'sedan', 'taxi', 'van', 'coupe']), 'traffic');
      car.road = p; car.cruise = U.rand(160, 240);
    }
  }

  return {
    cars, makeCar, spawnParked, spawnTraffic, spawnPoliceCar,
    nearestCar, disableCar, update,
  };
}
