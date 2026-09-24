import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ManifestScopeError } from "../analysis/manifest-scope.js";
import {
  ScalingTableError,
  buildScalingTablesFromManifest,
  scalingTablesToCsv,
  scalingTablesToJson,
} from "../analysis/scaling-tables.js";

const { values } = parseArgs({
  options: {
    results: { type: "string", default: "results" },
    manifest: { type: "string" },
    out: { type: "string" },
    format: { type: "string", default: "json" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run summarize -- --manifest <epoch-manifest.json> [options]

Rebuild architecture × N comparison tables from one frozen epoch manifest.
Recomputes from runs.jsonl only. No plots. No interpretive claims.
Refuse to scan a results root (prevents silently merging M3+M4 dirs).

--manifest <file> Required. e.g. results/_matrix/2026-09-24T055854Z.json
--results <dir>   Unused for analysis (kept for CLI compatibility). Prefer --manifest.
--format json|csv Output format. Default: json.
--out <file>      Write to this path. Default: stdout.

Examples:
  npm run summarize -- --manifest results/_matrix/2026-09-24T055854Z.json
  npm run summarize -- --manifest results/_matrix/2026-09-24T055854Z.json --format csv --out analysis/scaling.csv
`);
  process.exit(0);
}

try {
  const format = values.format === "csv" ? "csv" : values.format === "json" ? "json" : null;
  if (format === null) throw new ScalingTableError(`unknown format: ${values.format}`);
  if (values.manifest === undefined) {
    throw new ManifestScopeError(
      "summarize requires --manifest <results/_matrix/<timestamp>.json> " +
        "(refusing to scan --results; that can merge multiple epochs)",
    );
  }

  const tables = buildScalingTablesFromManifest(resolve(values.manifest));
  const text = format === "csv" ? scalingTablesToCsv(tables) : scalingTablesToJson(tables);

  if (values.out) {
    const outPath = resolve(values.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
    console.log(`wrote ${tables.rows.length} row(s) to ${outPath}`);
  } else {
    process.stdout.write(text);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
