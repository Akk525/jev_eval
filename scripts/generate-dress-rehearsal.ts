/**
 * Writes dress-rehearsal configs under configs/dress-rehearsal/.
 *
 *   npx tsx scripts/generate-dress-rehearsal.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  enumerateDressRehearsalCells,
  renderDressRehearsalYaml,
} from "../src/config/dress-rehearsal.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cells = enumerateDressRehearsalCells();

for (const cell of cells) {
  const absolute = join(repoRoot, cell.relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, renderDressRehearsalYaml(cell.config), "utf8");
  console.log(cell.relativePath);
}

console.log(`wrote ${cells.length} dress-rehearsal configs`);
