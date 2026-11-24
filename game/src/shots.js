// shots.js — the four staged scenes for the entry's screenshots (?shot=1..4).
// Each one sets a real game state (mission, time of day, wanted level, crew)
// and lets the renderer draw it: every screenshot is a live render of the
// game's own code, never a still image.

import { startMission } from './missions.js';
import { makeCar } from './vehicles.js';
import { addHeat } from './police.js';

export const SHOT_DEFS = [
  { name: '1-cover.jpg', query: '?shot=1', caption: 'Plaza Brasa at dusk, mission 1' },
  { name: '2-street.jpg', query: '?shot=2', caption: 'Boardwalk at night, on foot, wanted 2' },
  { name: '3-chase.jpg', query: '?shot=3', caption: 'Bridge chase, ARIETE PIT and CORMORÁN-1' },
  { name: '4-mission.jpg', query: '?shot=4', caption: 'Mission 10 at dawn, volcano road' },
];

/** Put the player in a car at (x, z) facing `heading`. */
function putInCar(state, x, z, heading) {
  const car = makeCar(x, z, heading, [0.9, 0.25, 0.3], { isPlayer: true, maxSpeed: 28, accel: 15 });
  state.cars.push(car);
  state.player.car = car;
  state.player.onFoot = false;
  state.player.x = x;
  state.player.z = z;
  state.player.heading = heading;
  return car;
}

function putCop(state, x, z, ariete) {
  const car = makeCar(x, z, 0, ariete ? [0.12, 0.12, 0.14] : [0.9, 0.9, 0.92], {
    isCop: true, isAriete: !!ariete, maxSpeed: ariete ? 27 : 24, accel: 16, health: 120,
  });
  state.cars.push(car);
  return car;
}

export function applyShot(state, n, audio) {
  state.mode = 'playing';
  state.hour = 18.2;
  state.camera.mode = 'chase';
  state.camera.snap = true;
  if (n === 1) {
    // Cover: dusk over Plaza Brasa, mission 1 just started, in the red car.
    state.hour = 18.2;
    putInCar(state, 0, 26, 0);
    startMission(state, 1, audio);
    state.markers = [{ x: 45, z: 135, color: [1.0, 0.85, 0.2] }];
  } else if (n === 2) {
    // Street: night on the Boardwalk, on foot, weapon wheel open, wanted 2.
    // The player faces west down the boardwalk street, neon ahead, GIC behind.
    state.hour = 21.4;
    state.player.onFoot = true;
    state.player.x = 120;
    state.player.z = 210;
    state.player.heading = -Math.PI / 2;
    state.player.weapon = 'smg';
    addHeat(state, 35);
    putCop(state, 95, 205, false);
    putCop(state, 100, 218, false);
    state._wheelOpen = true;
    state.toast = 'Boardwalk, 21:24 — GIC mengejar. Senjata: SMG.';
  } else if (n === 3) {
    // Chase: the bridge at dusk, wanted 4, ARIETE PIT units and the helicopter.
    state.hour = 18.6;
    putInCar(state, 240, 92, 0);
    state.player.car.speed = 22;
    addHeat(state, 75);
    putCop(state, 232, 78, true);
    putCop(state, 248, 80, true);
    putCop(state, 240, 110, false);
    state.police.heli.active = true;
    state.police.heli.x = 240;
    state.police.heli.z = 60;
    state.toast = 'Jembatan timur — ARIETE mengepit, CORMORÁN-1 di atas.';
  } else if (n === 4) {
    // Mission: dawn on the volcano road, mission 10, helicopter overhead.
    // The player waits on the open north road so the volcano, the marker and
    // the dawn city are all in frame instead of one dark cone.
    state.hour = 6.4;
    putInCar(state, 0, -60, 0);
    startMission(state, 10, audio);
    addHeat(state, 55);
    state.police.heli.active = true;
    state.police.heli.x = 0;
    state.police.heli.z = -140;
    putCop(state, 0, -100, false);
    state.toast = 'M10 Caldera Terbakar — fajar di kaki gunung berapi.';
  }
  // Let the world settle, then the shot is ready (main.js counts the frames).
  state._shotFramesLeft = 4;
}
