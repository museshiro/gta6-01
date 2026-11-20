// SOLMAR HEAT — shots.js
// Screenshot mode for the maker's own renders: ?shot=cover|street|chase|
// mission starts the game in a staged, lively state (no menu) and sets
// window.__shotReady once a few frames have run, so Playwright can capture
// real gameplay. These are real renders of the game's own code.
function setupShot(G, mode) {
  const pl = G.player;
  const L = G.city.landmarks;
  function near(x, y, r) {
    return { x: x + U.rand(-r, r), y: y + U.rand(-r, r) };
  }
  function startAt(x, y) {
    pl.x = x; pl.y = y; pl.hp = pl.maxHp;
    G.cam.x = x; G.cam.y = y;
    G.state = 'playing';
  }
  // Common lively street: traffic + pedestrians around the player.
  function populate() {
    G.vehicles.spawnTraffic(10);
    G.vehicles.spawnParked(6);
    G.peds.spawnNearPlayer(18);
  }
  if (mode === 'cover') {
    // The cover: Leo in a yellow sports car, mid-chase down a clear avenue,
    // 3 stars, police cruisers on his tail, mission 5 objective on the HUD.
    // Spawn ON the road (roadsV[2] x roadsH[1]) so the car has a clear run.
    const c = { x: G.city.roadsV[2], y: G.city.roadsH[1] };
    const car = G.vehicles.makeCar(c.x, c.y, Math.PI / 2, 'sports', 'player');
    car.speed = 380;
    pl.inCar = car; pl.x = car.x; pl.y = car.y; pl.angle = car.angle;
    pl.cash = 5230; pl.hasPistol = true; pl.ammo = 42;
    G.missions.idx = 4; G.missions.stage = 2; G.missions.cashTaken = true;
    G.missions.objective = 'GO! Lose 3 stars and reach the Safehouse';
    G.missions.marker = { x: G.city.buildingCenter(L.safehouse).x, y: G.city.buildingCenter(L.safehouse).y + 150, label: 'Safehouse' };
    G.police.wanted.heat = 65; G.police.wanted.level = 3; G.police.wanted.lastCrime = G.time;
    G.police.spawnPoliceCar(c.x - 70, c.y - 320);
    G.police.spawnPoliceCar(c.x + 70, c.y - 420);
    G.police.spawnCop(c.x - 130, c.y - 120);
    populate();
    // Clear the corridor ahead so the hero car has a clean run at speed.
    // (Splice in place: G.vehicles.cars is the same array the systems use.)
    for (let i = G.vehicles.cars.length - 1; i >= 0; i--) {
      const car2 = G.vehicles.cars[i];
      if (car2 === car || car2.driver === 'police') continue;
      if (Math.abs(car2.x - c.x) < 90 && car2.y > c.y - 40 && car2.y < c.y + 600) {
        G.vehicles.cars.splice(i, 1);
      }
    }
    startAt(car.x, car.y);
  } else if (mode === 'street') {
    // On foot in a busy downtown street: traffic, pedestrians, sunshine.
    const c = G.city.buildingCenter(L.police);
    startAt(c.x, c.y + 320);
    pl.cash = 480; pl.hasPistol = false;
    G.missions.idx = 0; G.missions.stage = 0;
    G.missions.objective = "Steal a car and drive it to Nadia's Garage";
    G.missions.marker = { x: G.city.buildingCenter(L.garage).x, y: G.city.buildingCenter(L.garage).y + 150, label: "Nadia's Garage" };
    populate();
  } else if (mode === 'chase') {
    // High-speed chase down a clear avenue: sports car, two cruisers, skid.
    // Spawn ON the road (roadsV[3] x roadsH[1]) so the car is not inside a block.
    const c = { x: G.city.roadsV[3], y: G.city.roadsH[1] };
    const car = G.vehicles.makeCar(c.x, c.y, Math.PI / 2, 'sports', 'player');
    car.speed = 640;
    pl.inCar = car; pl.x = car.x; pl.y = car.y; pl.angle = car.angle;
    pl.cash = 1840; pl.hasPistol = true; pl.ammo = 18;
    G.missions.idx = 2; G.missions.stage = 0;
    G.missions.objective = 'Lose the wanted level — 2 stars (hide, outrun, or use Turbo Respray)';
    G.missions.marker = { x: G.city.buildingCenter(L.respray).x, y: G.city.buildingCenter(L.respray).y + 150, label: 'Turbo Respray' };
    G.police.wanted.heat = 45; G.police.wanted.level = 2; G.police.wanted.lastCrime = G.time;
    G.police.spawnPoliceCar(car.x - 40, car.y - 320);
    G.police.spawnPoliceCar(car.x + 60, car.y - 480);
    for (let i = 0; i < 8; i++) G.addSkid(car.x, car.y - 60 - i * 26);
    populate();
    startAt(car.x, car.y);
  } else if (mode === 'mission') {
    // The bank job, on foot: Leo at the Reserve with guards and the vault.
    const c = G.city.buildingCenter(L.bank);
    startAt(c.x, c.y + 240);
    pl.cash = 1250; pl.hasPistol = true; pl.ammo = 36;
    G.missions.idx = 4; G.missions.stage = 1; G.missions.grabT = 1.2;
    G.missions.objective = 'Grabbing the cash... 2s';
    G.missions.marker = { x: c.x, y: c.y + 150, label: 'Solmar Reserve' };
    G.peds.makePed(c.x - 70, c.y + 180, { mission: 'guard', hp: 70, color: '#2b2b2b' });
    G.peds.makePed(c.x + 70, c.y + 180, { mission: 'guard', hp: 70, color: '#2b2b2b' });
    const car = G.vehicles.makeCar(c.x + 160, c.y + 300, 0, 'coupe', 'parked');
    populate();
  } else {
    // Default: just start playing downtown.
    const c = G.city.buildingCenter(L.garage);
    startAt(c.x, c.y + 200);
    populate();
  }
  G.audio.ensure();
  G.audio.startMusic();
  // Let a few frames run (particles, police, traffic settle), then signal ready.
  let frames = 0;
  const prev = G.onFrame;
  G.onFrame = () => {
    if (prev) prev();
    frames++;
    if (frames >= 6) window.__shotReady = true;
  };
}
