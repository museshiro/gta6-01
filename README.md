# CALDERA VIVA — 3D WebGL sun-scorched open-world crime — 10 story jobs, Guardia Insular de Caldera with MURALLA roadblocks, ARIETE RAM/PIT units and CORMORÁN-1, crew calls, weapon wheel, garage, respect ranks, district standing, street races, day-night, radio, saves.

[![competition](https://make.fun/api/competitions/gta6-01/badge)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/api/competitions/gta6-01/rank/museshiro)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/api/competitions/gta6-01/reward/museshiro)](https://make.fun/bounty/gta6-01)

Play it: serve `game/` with any static server and open `game/index.html`
in desktop Chrome. No network requests, no build step, every asset is
procedural — WebGL low-poly Isla Caldera, generated from one fixed seed.

## The island

Isla Caldera is a fictional volcanic island: the coastal town of **Puerto
Brasa**, a neon **Boardwalk** over black sand, the **Dermaga** pier,
**Bukit Caldera** under the volcano, and the old town **Kota Tua**. Sunset
heat, salt fog, flat-shaded low-poly buildings, palms, lamps, traffic and
pedestrians — all generated in code, the same island on every load.

## The crew and the law

- **Mara Vela** — driver and getaway expert. Crew call (T) sends a getaway car.
- **Tito Branco** — mechanic and shooter. His garage is your HQ: repairs,
  engine and armor upgrades, and covering fire on the hard jobs.
- **Guardia Insular de Caldera (GIC)** — Central GIC dispatch, **MURALLA**
  roadblocks from 3 stars, **ARIETE** RAM/PIT units from 4 stars, and the
  **CORMORÁN-1** helicopter circling above the rooftops from 3 stars.

## 10 story missions

1. **Garam di Roda** — steal the modded coupe at the pier, outrun the first patrol.
2. **Kotak untuk Brasa** — deliver the locked box to Mara, meet Tito, open the garage.
3. **Pajak Pantai** — collect protection money from three boardwalk vendors.
4. **Ratu Dermaga** — rescue Mara from the container yard, crew-call getaway car.
5. **Ariete di Jembatan** — steal the armored van, survive MURALLA roadblocks and ARIETE PIT moves.
6. **Mata Cormorán** — lose CORMORÁN-1 by swapping cars in the parking deck.
7. **Gudang Garam** — rob the evidence warehouse, weapon wheel, burn the documents.
8. **Pengkhianatan Boardwalk** — hunt the traitor fixer on the boardwalk, crew backup.
9. **Muralla Terakhir** — raid the impound, take your car back through the last MURALLA block.
10. **Caldera Terbakar** — raid the cartel mansion at 5 stars and escape to the sea.

## Systems

- Wanted 0–5 stars with heat that rises on crime and decays when you break
  line of sight; busted/wasted respawns at the garage.
- Weapon wheel (Q, keys 1–4): Pistol, SMG, Shotgun, Molotov.
- Garage (F at the HQ): repair, engine and armor upgrades.
- Respect ranks (Pemula Pantai → Raja Caldera) and district standing per
  district, shown in the pause dashboard (Esc).
- Day–night cycle tied to missions, street-race checkpoints from Plaza
  Brasa (B), two synthesized radio stations (R), saves to localStorage
  (auto on mission complete, manual in the dashboard).
- Chase / high / isometric cameras (C), mouse-drag orbit, minimap, HUD with
  dispatch ticker. If WebGL is unavailable the game falls back to an
  identical top-down 2D mode (`?mode=2d` forces it).

## Controls

WASD walk/drive, Shift run, E enter/exit car, mouse click shoot, Q weapon
wheel, T crew call, M start mission, B street race, F garage, R radio,
C camera, N mute, L load save, Esc pause.

## Screenshots

`?shot=1..4` stages a deterministic scene for capture: (1) sunset boardwalk
chase, (2) street life on foot in Plaza Brasa, (3) CORMORÁN-1 and a MURALLA
roadblock at dusk, (4) the mansion finale at night.

## Files

- `game/index.html` — shell, HUD, menus
- `game/src/main.js` — bootstrap, loop, saves, garage, races, crew calls
- `game/src/city.js` — seeded Isla Caldera generation + collision
- `game/src/render.js` — WebGL renderer + 2D fallback + camera
- `game/src/player.js` — on-foot / driving / weapons
- `game/src/vehicles.js` — arcade car physics + traffic
- `game/src/pedestrians.js` — crowd + hostile guards
- `game/src/police.js` — wanted, dispatch, MURALLA, ARIETE, CORMORÁN-1
- `game/src/missions.js` — the 10 story jobs
- `game/src/hud.js` — HUD, minimap, wheel, dashboard
- `game/src/input.js` — keyboard + mouse
- `game/src/audio.js` — synthesized sound + radio
- `game/src/shots.js` — screenshot poses
- `main.ts` — entry program (copies game/ + screenshots/, writes dossier.json)

MIT licensed. Original work: no names, art, music or maps from any
commercial game.
