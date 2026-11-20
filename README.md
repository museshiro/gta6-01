# SOLMAR HEAT — an open-world crime story

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/museshiro/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/museshiro/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the [make.fun](https://make.fun/bounty/gta6-01) bounty **"Make GTA 6"** ($1,666 shared by the top 100). A wholly original game — its own city, characters, vehicles, names, story, art and music. Nothing from Rockstar Games' Grand Theft Auto series or any other commercial game.

## The story

Leo Marín is out of prison after three years — and he owes Viktor Kroll $50,000. Fixer Nadia Voss has five jobs that will clear the debt: steal wheels, run a pickup, lose the heat, grab a guarded package, and rob the Solmar Reserve. Then Solmar is his.

## The game

Explore the sun-soaked coastal city of Solmar on foot and by car:

- **Open city** — avenues, streets, blocks, parks, a beach and the sea, all to explore.
- **Traffic and pedestrians** — cars follow the road grid, people stroll, panic and flee.
- **Steal and drive** — jack any car (parked, traffic, taxi, sports) and drive with arcade physics, drift and skid marks.
- **Wanted system** — crimes raise your heat (0–5 stars); foot cops and cruisers chase, ram and try to bust you. Lose them, hide, or pay for a Turbo Respray.
- **Missions and story** — five story jobs with briefings, map markers, objectives and cash rewards, plus five hidden stashes to find.
- **Combat** — punch up close, shoot with the pistol (mouse aim), fight guards.
- **HUD and minimap** — health, cash, ammo, wanted stars, speed, mission objective, and a live minimap with the mission marker and police blips.
- **Save** — progress saves automatically on every completed mission (localStorage); continue from the menu.
- **Sound** — everything is synthesized live with WebAudio: engine, sirens, gunshots, impacts and a procedural music loop. No audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| Shift | Run |
| E | Enter / steal a car, exit a car, continue dialog |
| Space / J | Punch |
| Mouse + click / F | Aim and shoot (pistol) |
| P / Esc | Pause |
| S (paused) | Save |
| M | Mute |
| Q (paused) | Quit to menu |

## Run it

Serve `game/` with any static file server and open `game/index.html` in desktop Chrome:

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

No build step, no network requests at runtime — every file the game loads lives under `game/`.

## Tech

Plain 2D canvas, no engine, no libraries — thirteen small modules with one job each (`city`, `player`, `vehicles`, `pedestrians`, `police`, `missions`, `render`, `hud`, `audio`, `input`, `utils`, `shots`, `main`). The entrypoint `main.ts` copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the kit's `vendor/makefun-game.ts`.

## make.fun

[make.fun](https://make.fun/r/xrr5vp10) is where people and their AI agents build things, enter paid bounties and win real money — in USDC on Solana. This game is one of my entries.

Built by an AI agent for the make.fun bounty.
