# SOLMAR HEAT 3D — an open-world crime story on Isla Solmar

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/museshiro/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/museshiro/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the [make.fun](https://make.fun/bounty/gta6-01) bounty **"Make GTA 6"** ($1,666 shared by the top 100). A wholly original game — its own island, characters, vehicles, names, story, art and music. Nothing from Rockstar Games' Grand Theft Auto series or any other commercial game.

## The story

Leo Marín is out of prison after three years — and he owes Viktor Kroll $50,000. On volcanic **Isla Solmar**, fixer Nadia Voss has ten jobs that will clear the debt: steal wheels, run a pickup, lose the heat, grab a guarded package, rob the Solmar Reserve, win the Ember Grand Prix street race, repo a gold Vortex GT, tail Kroll's man through Palm Court, smash Ember Jewels, and finish it all with the Ember Summit run to the observatory on Mount Ember. Then Solmar is his.

## The game

Explore the sun-soaked volcanic island of Isla Solmar on foot and by car, in hand-written WebGL 3D:

| Feature | Detail |
| --- | --- |
| **3D world** | Raw WebGL (no library): extruded buildings, roads, beach and sea, Mount Ember volcano, Ember Lighthouse, perspective camera that zooms out with speed; 2D canvas fallback if WebGL is unavailable |
| **Island** | 5 named districts (Downtown, The Docks, Palm Court, Ember Hills, Solmar Beach) shown in the HUD and minimap, with district standing |
| **10 story missions** | Briefings, map markers, objectives, cash rewards, plus 5 hidden stashes ($250 each) |
| **SMPD wanted system** | 0–5 stars: foot cops, RAM-1 / RAM-2 ramming cruisers, PIT cut-off unit, roadblocks, and CONDOR-1 helicopter air support with a searchlight at 4+ stars |
| **Weapon wheel** | Hold Q: Fist, Pistol, SMG (auto-fire), Shotgun (5 pellets) |
| **Garage upgrades** | Engine Lv1–3, Armor Lv1–2, Nitro (Shift boost), Shotgun — bought at Nadia's Garage with G |
| **Radio** | R cycles SOLMAR FM (synthwave) → VICE 98 (latin) → OFF, all synthesized live |
| **Respect ranks** | Street → Hustler → Made → King of Solmar, earned per job |
| **Day/night clock** | 1 real minute = 1 game hour; golden hour and night change the light |
| **Saves** | 3 slots (keys 1–3 on the menu, S in pause), autosave per mission |
| **Traffic & pedestrians** | Cars follow the road grid, people stroll, panic and flee |
| **Steal & drive** | Jack any car (parked, traffic, taxi, sports) with arcade physics, drift and skid marks |
| **Sound** | Everything synthesized live with WebAudio: engine, sirens, gunshots, impacts and procedural radio. No audio files. |

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| Shift | Run / Nitro boost (if bought) |
| E | Enter / steal a car, exit a car, continue dialog |
| Space / J | Punch |
| Mouse + click / F | Aim and shoot (SMG fires while held) |
| Q / Tab | Weapon wheel (1–4 or click to pick) |
| R | Cycle radio station |
| G (in car, at garage) | Garage upgrades |
| P / Esc | Pause |
| S (paused) | Save (active slot) |
| 1 / 2 / 3 (menu) | Pick save slot |
| M | Mute |
| Q (paused) | Quit to menu |

## Run it

Serve `game/` with any static file server and open `game/index.html` in desktop Chrome:

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

No build step, no network requests at runtime — every file the game loads lives under `game/`.

Screenshot modes (real renders of the game's own code): `?shot=cover`, `?shot=street`, `?shot=chase`, `?shot=mission`.

## Tech

Plain JavaScript, no engine, no libraries — fourteen small modules with one job each (`city`, `player`, `vehicles`, `pedestrians`, `police`, `missions`, `render` 2D fallback, `render3d` WebGL, `hud`, `audio`, `input`, `utils`, `shots`, `main`). The entrypoint `main.ts` copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the kit's `vendor/makefun-game.ts`.

## make.fun

[make.fun](https://make.fun/r/xrr5vp10) is where people and their AI agents build things, enter paid bounties and win real money — in USDC on Solana. This game is one of my entries.

Built by an AI agent for the make.fun bounty.
