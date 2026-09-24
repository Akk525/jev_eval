# Reproducibility audit (M6)

Audit date: 2026-09-23  
Scope: every M6 analysis artifact must regenerate along a documented path.  
Rule: **fail the audit** if a published number cannot be traced to  
`result directory → config.json → runs.jsonl → aggregation → figure/table`.

This audit covers **pipeline regenerability**. It does not invent benchmark
numbers. Live result directories are still required before quantitative claims.

## Provenance chain

```text
results/<epoch>/
  config.json          # ExperimentConfig + configHash, datasetVersion, registryHash, gitSha
  runs.jsonl           # source of truth (D5 / D9)
  summary.json         # recomputed cache; figures must not trust it as SoT

        │
        ▼
npm run analysis:dataset -- --results <root> --out analysis/dataset
  analysis-dataset.json / attempts.jsonl / compatibility.json
  (#46 — fail-loud on scientific-control mismatches; M5/#45 skipped)

        │
        ▼
npm run analysis:figure{1..6} -- --dataset analysis/dataset/analysis-dataset.json
  figure data + SVG under analysis/figures/figure{N}/

Parallel (not via analysis dataset, still runs.jsonl SoT):
  npm run summarize
  npm run k-sweep -- --summarize
  npm run k-sweep -- --tradeoff
```

Verify the chain programmatically:

```bash
npm run analysis:audit -- --results <result-root> --out analysis/audit
# or, if the dataset already exists:
npm run analysis:audit -- --dataset analysis/dataset/analysis-dataset.json --out analysis/audit
```

Exit code **0** = pipeline regenerates. Exit **1** = missing/invalid inputs or a figure builder failure.  
`numbers_status: unavailable` means no (or empty) result dirs — pipeline OK, **no claims allowed**.

## M6 artifact checklist

| Artifact | Issue | Regeneration | Source fields | Doc |
|---|---|---|---|---|
| Analysis dataset | #46 | `npm run analysis:dataset` | full `RunRecord` + stored config metadata | [analysis-dataset.md](analysis-dataset.md) |
| Figure 1 ESR vs N | #47 | `npm run analysis:figure1` | `execution_success`, `execution_excluded`, repetitions | [figure1-esr.md](figure1-esr.md) |
| Figure 2 cost / tokens | #48 | `npm run analysis:figure2` | `priced_cost_usd`, router/agent token counts, `pricing_version` | [figure2-cost-tokens.md](figure2-cost-tokens.md) |
| Figure 3 latency | #49 | `npm run analysis:figure3` | `router_latency_ms`, `agent_latency_ms` (mean/p50/p95) | [figure3-latency.md](figure3-latency.md) |
| Figure 4 Recall@k vs k | #50 | `npm run analysis:figure4` | `recall_at_k`, `lenient_recall_at_k`, `top_k` | [figure4-recall.md](figure4-recall.md) |
| Figure 5 Jev calibration | #51 | `npm run analysis:figure5` | `confidence`, `top1_probability`, `recall_at_k` (separate; D4) | [figure5-calibration.md](figure5-calibration.md) |
| Figure 6 failures | #52 | `npm run analysis:figure6` | `failure_code` (R0 separate; D6) | [figure6-failures.md](figure6-failures.md) |

### Pre-M6 tables (same SoT)

| Artifact | Regeneration | Notes |
|---|---|---|
| Scaling tables | `npm run summarize` | arch × N from `runs.jsonl` |
| K-sweep tables | `npm run k-sweep -- --summarize` | Jev N=25, k∈{1,3,5,10} (D12) |
| K tradeoff | `npm run k-sweep -- --tradeoff` | `decision_rule: null` — no optimal-k claim |
| Calibration readiness | `npm run check:calibration` | gates M5 threshold lock (#42) |

## Methodology vs implementation

Reviewed against [methodology.md](methodology.md) and [DECISIONS.md](DECISIONS.md) (D1–D12).

### Aligned

* Nested toolspaces; routers see `routingSummary` only (D1–D2).
* ESR is the MVP y-axis until E2E exists (D3); Figure 1 labels it correctly.
* Confidence and top-1 stored/calibrated separately (D4); Figure 5.
* `runs.jsonl` SoT; Memora best-effort (D5).
* R0 outside quality denominators and separate in Figure 6 (D6).
* Neutrality: figures have no winner/optimal-k claims (D7).
* Immutable result dirs + config hash resume (D9).
* Model pins D10/D11; M4 fixed N=25 (D12).

### Documented deviations / deferred items

| Topic | Plan / brief | Actual | Action |
|---|---|---|---|
| Dataset pin in methodology “Frozen controls” | Text previously said only `datasets/v0.1/` | Matrix / k-sweep / analysis use **`datasets/v0.2/`**; some slice examples still point at v0.1 | Methodology updated to state both; compatibility key includes `datasetPath` + `datasetVersion` |
| Prompt version field | Brief versioning after first result mentions prompt versions | No separate `promptVersion` on configs; agent pin + registry hash stand in (#46) | Documented in analysis-dataset schema; still required before changing prompts post-results (D7) |
| Tool-executor latency | Figure 3 “where useful expose tool latency” | Not stored on attempts | Figure 3 marks `tool_latency: "unavailable"` — not invented |
| End-to-end Task Success / R5 | Later milestone | Not implemented; ESR used; R5/R6 only when emitted | Figures and methodology already say so |
| M5 adaptive tables (#45) | Optional dependency of #46 | **Skipped** — thresholds unlocked (#42 open); no adaptive dirs | `m5_adaptive_tables: "skipped"` on analysis dataset |
| Publication conclusions (#54) | After this audit | Not started | Blocked on real result dirs + this audit |

### Audit result (pipeline)

| Check | Status |
|---|---|
| Every M6 figure has a CLI + doc with regeneration path | Pass |
| Figures read analysis dataset only (do not rewrite `runs.jsonl`) | Pass |
| Compatibility fail-loud on dataset/registry/agent/pricing/seed/tracing | Pass |
| R0 / confidence≠top-1 / strict≠lenient / priced≠provider-reported preserved | Pass |
| Optional `npm run analysis:audit` regenerates figures 1–6 from dataset | Pass (when dataset or results provided) |
| Quantitative claims from live epochs | **Unavailable** until result dirs exist |

**Verdict:** Pipeline audit **PASS**. Publication numbers audit **PENDING** live data.

## Operator checklist (before any claim)

- [ ] Result dirs under a frozen `results/` root with matching `configHash` / `registryHash` / `datasetVersion` / `pricingVersion`
- [ ] `npm run analysis:dataset` succeeds (no compatibility errors)
- [ ] `npm run analysis:audit -- --dataset …` exits 0
- [ ] Each figure JSON/CSV/SVG regenerated and paths cited in the write-up
- [ ] Every quantitative sentence points at a specific artifact path
- [ ] Negative / null findings included; no “Jev wins” framing
- [ ] M5 claims omitted unless #42 thresholds locked from calibration-bearing dirs

## Related

* [methodology.md](methodology.md)
* [DECISIONS.md](DECISIONS.md)
* [adaptive-policy.md](adaptive-policy.md) (M5 still pending)
* Next: #54 publication-ready report / README results section
