/**
 * Writes the M3 N-matrix configs under configs/matrix/.
 * Scientific fields live in those YAMLs — do not hard-code N in the runner.
 *
 *   npx tsx scripts/generate-n-matrix.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateMatrixCells, renderMatrixYaml } from "../src/config/matrix.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cells = enumerateMatrixCells();

for (const cell of cells) {
  const absolute = join(repoRoot, cell.relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, renderMatrixYaml(cell.config), "utf8");
  console.log(cell.relativePath);
}

console.log(`wrote ${cells.length} matrix configs`);
