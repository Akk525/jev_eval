import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

describe("publication editorial checklist (#54)", () => {
  const report = readFileSync(join(root, "docs/TECHNICAL_REPORT.md"), "utf8");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const audit = readFileSync(join(root, "docs/reproducibility-audit.md"), "utf8");

  it("answers all six research questions with null/negative where unsupported", () => {
    expect(report).toMatch(/### 1\. How does agent tool selection/);
    expect(report).toMatch(/### 2\. When does pre-routing become useful/);
    expect(report).toMatch(/### 3\. What does Jev change/);
    expect(report).toMatch(/### 4\. Where do failures move/);
    expect(report).toMatch(/### 5\. What does k trade off/);
    expect(report).toMatch(/### 6\. Does Jev confidence/);
    expect(report.toLowerCase()).toContain("finding: null");
    expect(report.toLowerCase()).toContain("negative");
  });

  it("cites regenerable artifacts and the audit for every claim class", () => {
    expect(report).toContain("figure1-esr.json");
    expect(report).toContain("figure2-cost.json");
    expect(report).toContain("figure3-latency.json");
    expect(report).toContain("figure4-recall.json");
    expect(report).toContain("figure5-calibration.json");
    expect(report).toContain("figure6-failures.json");
    expect(report).toContain("reproducibility-audit.md");
    expect(report).toContain("decision_rule: null");
  });

  it("refuses Jev-superiority framing", () => {
    expect(report.toLowerCase()).not.toMatch(/\bjev wins\b/);
    expect(report.toLowerCase()).not.toMatch(/proves that jev/);
    expect(report).toContain("must not be read as");
    expect(report).toContain("Refused framing");
    expect(readme.toLowerCase()).not.toMatch(/\bjev wins\b/);
    expect(readme).toContain("## Results");
  });

  it("keeps README results section aligned with the audit gate", () => {
    expect(readme).toContain("docs/TECHNICAL_REPORT.md");
    expect(readme).toContain("docs/reproducibility-audit.md");
    expect(readme).toMatch(/null|pending|not yet/i);
    expect(audit).toContain("Pipeline audit **PASS**");
  });
});
