import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDotEnv } from "./load.js";

describe("loadDotEnv", () => {
  it("loads keys from .env without overriding existing env", () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-dotenv-"));
    writeFileSync(
      join(dir, ".env"),
      [
        "# comment",
        "TYPESAFE_API_KEY=from-file",
        "AGENT_API_KEY='quoted-agent'",
        "EMPTY_SKIP=",
        "ALREADY=file-value",
        "",
      ].join("\n"),
    );

    const env: NodeJS.ProcessEnv = { ALREADY: "process-value" };
    const path = loadDotEnv({ cwd: dir, env });
    expect(path).toBe(join(dir, ".env"));
    expect(env.TYPESAFE_API_KEY).toBe("from-file");
    expect(env.AGENT_API_KEY).toBe("quoted-agent");
    expect(env.ALREADY).toBe("process-value");
  });

  it("fills empty process env slots from .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-dotenv-empty-"));
    writeFileSync(join(dir, ".env"), "TYPESAFE_API_KEY=filled\n");
    const env: NodeJS.ProcessEnv = { TYPESAFE_API_KEY: "" };
    loadDotEnv({ cwd: dir, env });
    expect(env.TYPESAFE_API_KEY).toBe("filled");
  });
});
