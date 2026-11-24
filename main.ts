// main.ts — entry program for CALDERA VIVA (gta6-01).
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with the kit's buildDossier.
// Node 22, standard library only; no network, no build step.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const gameDir = join(repoRoot, "game");
const shotsDir = join(repoRoot, "screenshots");
if (!existsSync(gameDir)) throw new Error("main.ts: game/ is missing from the repository");
cpSync(gameDir, join(outDir, "game"), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(outDir, "screenshots"), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, "dossier.json"), dossier);
console.log(`CALDERA VIVA: wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
