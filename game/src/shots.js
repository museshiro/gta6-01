// shots.js — deterministic screenshot poses for CALDERA VIVA.
// ?shot=1..4 starts the game, stages a scene (chase, street life, heli +
// roadblock, finale) and leaves the world still enough for a clean capture.
// These poses only run when the URL asks for them; normal play never sees them.

import { makeCar } from './vehicles.js';
import { startMission } from './missions.js';

function stageChase(game, wanted, withHeli, withRoadblock) {
  game.setWanted(wanted);
  const p = game.player;
  p.inCar = true;
  p.car = game.missionCars[0] || makeCar('coupe', p.x, p.z, p.angle);
  p.car.x = p.x; p.car.z = p.z; p.car.angle = p.angle;
  for (let i = 0; i < (wanted >= 4 ? 3 : 2); i++) {
    const c = makeCar('police', p.x - 14 - i * 9, p.z - 18 - i * 4, p.angle);
    c.police = true; c.lightOn = true;
    game.police.cars.push(c);
  }
  if (withHeli) game.police.heli = { x: p.x + 25, y: 48, z: p.z - 10, angle: 0.6 };
  if (withRoadblock) {
    const rb = [];
    for (let i = -1; i <= 1; i++) {
      const c = makeCar('police', p.x + i * 5, p.z + 46, Math.PI / 2);
      c.police = true; c.lightOn = true; rb.push(c);
    }
    game.police.roadblock = { cars: rb, x: p.x, z: p.z + 46, ttl: 60 };
  }
}

export function applyShot(game, n) {
  const g = game;
  g.missions.available = 10;
  g.camMode = 'chase';
  if (n === 1) {
    // Cover: sunset avenue chase into the city, wanted 3, mission 5 in progress.
    g.setTimeOfDay(17.5);
    g.player.x = 0; g.player.z = 145; g.player.angle = Math.PI; g.player.heading = Math.PI;
    startMission(g, 5);
    // Stage the hero car as the red Vela Coupe for a readable cover.
    const hero = makeCar('coupe', 0, 145, Math.PI);
    g.missionCars.push(hero);
    g.player.x = 0; g.player.z = 145;
    g.player.inCar = true; g.player.car = hero;
    for (let i = 0; i < 2; i++) {
      const c = makeCar('police', -4 + i * 8, 145 - 22 - i * 6, Math.PI);
      c.police = true; c.lightOn = true;
      g.police.cars.push(c);
    }
    g.setWanted(3);
    g.toast('MISI 5 — Ariete di Jembatan', 'Bertahan dari MURALLA & ARIETE');
  } else if (n === 2) {
    // Street life: on foot in Plaza Brasa, traffic and pedestrians.
    g.setTimeOfDay(10.0);
    g.player.x = 6; g.player.z = -6; g.player.angle = 0.6; g.player.heading = 0.6;
    startMission(g, 2);
    g.toast('MISI 2 — Kotak untuk Brasa', 'Antar kotak terkunci ke Mara');
  } else if (n === 3) {
    // Heli + roadblock: wanted 4 on the main avenue at dusk.
    g.setTimeOfDay(18.5);
    g.player.x = 0; g.player.z = 40; g.player.angle = Math.PI; g.player.heading = Math.PI;
    startMission(g, 6);
    g.player.x = 0; g.player.z = 40;
    stageChase(g, 4, true, true);
    g.toast('CORMORÁN-1 di udara', 'Putus garis pandang di gedung parkir');
  } else {
    // Finale: mansion raid at night, wanted 5.
    g.setTimeOfDay(21.0);
    g.player.x = -138; g.player.z = -128; g.player.angle = 0.8; g.player.heading = 0.8;
    startMission(g, 10);
    g.player.x = -138; g.player.z = -128;
    stageChase(g, 5, true, false);
    g.toast('MISI 10 — Caldera Terbakar', 'Serbu mansion kartel — kabur ke laut');
  }
  g.hud.update();
}
