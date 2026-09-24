/**
 * Writes the M4 Jev top-k sweep configs under configs/k-sweep/.
 * Only topK varies; N and all other scientific controls stay fixed (D12).
 *
 *   npx tsx scripts/generate-k-sweep.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateKSweepCells, renderKSweepYaml } from "../src/config/k-sweep.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cells = enumerateKSweepCells();

for (const cell of cells) {
  const absolute = join(repoRoot, cell.relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, renderKSweepYaml(cell.config), "utf8");
  console.log(cell.relativePath);
}

console.log(`wrote ${cells.length} k-sweep configs`);
