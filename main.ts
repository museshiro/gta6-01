// SOLMAR HEAT 3D — entrypoint (Node 22, standard library only).
// Copies the static game and the screenshots into the output directory,
// then writes the dossier that buildDossier derives from them. The
// scorer rebuilds the same dossier from the same files, so the two
// must match byte for byte. Nothing here fetches anything: the game is
// fully static and every asset it needs already lives under game/.
// v3: the game is now hand-written WebGL 3D (render3d.js) with the 2D
// canvas renderer kept as a fallback, 10 story missions, named SMPD
// units, a weapon wheel, garage upgrades, 3 save slots, radio, respect
// ranks and a day/night clock — all still plain files, no build step.
// The input system snapshots presses per frame (input.js beginFrame),
// so a key tapped during a slow render is never lost.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = resolve(process.env.MAKEFUN_BOT_DIR ?? '.');
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? 'out');

if (!existsSync(join(repoDir, 'game', 'index.html'))) {
  throw new Error('game/index.html not found in the repository');
}
if (!existsSync(join(repoDir, 'screenshots'))) {
  throw new Error('screenshots/ not found in the repository');
}

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote dossier.json (${dossier.length} bytes) into ${outDir}`);
