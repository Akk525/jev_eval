import { parseArgs } from "node:util";
import {
  FROZEN_ADAPTIVE_MANIFEST,
  FROZEN_M3_MANIFEST,
  FROZEN_M4_MANIFEST,
  writeSynthesis,
} from "../analysis/synthesis.js";

const { values } = parseArgs({
  options: {
    help: { type: "boolean", default: false },
    out: { type: "string", default: "analysis/synthesis" },
    "m3-manifest": { type: "string", default: FROZEN_M3_MANIFEST },
    "m4-manifest": { type: "string", default: FROZEN_M4_MANIFEST },
    "adaptive-manifest": { type: "string", default: FROZEN_ADAPTIVE_MANIFEST },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: npm run analysis:synthesis -- [options]

Regenerate the publication synthesis from three frozen epoch manifests.
JSON is canonical; SVG is derived. Never scans results/ roots.

--out <dir>                 Output root. Default: analysis/synthesis
--m3-manifest <file>        Default: ${FROZEN_M3_MANIFEST}
--m4-manifest <file>        Default: ${FROZEN_M4_MANIFEST}
--adaptive-manifest <file>  Default: ${FROZEN_ADAPTIVE_MANIFEST}
`);
  process.exit(0);
}

try {
  const { outDir, artifact } = writeSynthesis({
    outDir: values.out,
    m3Manifest: values["m3-manifest"],
    m4Manifest: values["m4-manifest"],
    adaptiveManifest: values["adaptive-manifest"],
  });
  console.log(`wrote synthesis to ${outDir}`);
  console.log(
    JSON.stringify(
      {
        figures: Object.keys(artifact.figures),
        m3: artifact.sources.m3_manifest,
        m4: artifact.sources.m4_manifest,
        adaptive: artifact.sources.adaptive_manifest,
        decision_rule: artifact.methodology.decision_rule,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
