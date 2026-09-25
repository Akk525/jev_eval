# Routing Before Reasoning

**Evaluation harness for tool pre-routing in LLM agents.**

Paper: [Routing Before Reasoning: Scaling Tool Use in LLM Agents (PDF)](https://www.adityakk.com/Routing%20Before%20Reasoning%3A%20Scaling%20Tool%20Use%20in%20LLM%20Agents.pdf)

This repository accompanies a controlled study of whether a lightweight router can
select a small candidate tool set before an expensive reasoning model acts. The
router under test is [Jev](https://openrouter.ai/docs/guides/community/jev)
(TypeSafe AI). The project is an experiment and analysis codebase—not a claim
that Jev outperforms an LLM. Negative and null findings are first-class results.

**Publication checkpoint:** `ed3dd18` · experimental runs are frozen.

## Thesis

Large toolspaces remained usable in this benchmark. Pre-routing mainly changed
**cost and failure structure**: it held agent context nearly constant as the
available toolspace grew, while trading routing coverage against downstream
selection difficulty. The systems question is how much of the capability space
should reach the expensive reasoning model.

## What was measured

Three frozen live epochs (shared dataset, registry, agent, pricing, and
denominators; treatment changes only as declared):

| Study | Question | Manifest |
|---|---|---|
| **M3** Scaling | How do ESR, cost, and agent tokens move with toolspace size *N*? | `results/_matrix/2026-09-24T055854Z.json` |
| **M4** Top-*k* | At *N* = 100, how does candidate-set size *k* trade coverage vs selection? | `results/_k-sweep/2026-09-24T140621Z.json` |
| **Adaptive** | Can Jev confidence choose *k* automatically? | `results/_adaptive-eval/2026-09-24T045743Z.json` |

Architectures compared on the same tasks:

| Architecture | Agent tool exposure |
|---|---|
| Baseline | Full schemas for all *N* tools |
| Jev top-*k* | Schemas for Jev’s top-*k* only |
| LLM top-*k* | Schemas for an LLM router’s top-*k* (archived for M3; not in the frozen matrix) |

Primary metric: **Execution Success Rate (ESR)** — fraction of non-infrastructure
attempts where the agent selected a required/acceptable tool, arguments passed,
and the mock tool succeeded. Infrastructure failures (**R0**) are reported
separately and excluded from quality denominators.

## Results

Regenerate the full publication pack from the frozen manifests (JSON is
canonical; SVG is derived):

```bash
npm run analysis:synthesis
```

Output: [`analysis/synthesis/`](analysis/synthesis/)

| Artifact | Role |
|---|---|
| [`synthesis.json`](analysis/synthesis/synthesis.json) | Canonical analysis source of truth |
| [`synthesis.md`](analysis/synthesis/synthesis.md) | Short observed summary |
| `figures/*.json` → `rendered/*.svg` | Publication figures |

Narrative write-up: [`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md)  
Provenance gate: [`docs/reproducibility-audit.md`](docs/reproducibility-audit.md)

Headline paired result at *N* = 100 (baseline vs Jev top-5, 78 shared tasks):
observed ΔESR ≈ −1.3 pp with paired 95% CI crossing zero and nearly balanced
discordances (6 vs 5). That is **not** an equivalence claim. Adaptive
confidence→*k* was a **negative** result; no further threshold fitting.

## Reproduce analysis

Analysis is **manifest-scoped** (D15). Bare `--results results` scans are refused
so immutable epochs cannot be silently merged.

```bash
npm test
npm run typecheck

# M3 scaling tables
npm run summarize -- --manifest results/_matrix/2026-09-24T055854Z.json

# M4 k-ablation
npm run k-sweep -- --summarize --manifest results/_k-sweep/2026-09-24T140621Z.json
npm run k-sweep -- --tradeoff --manifest results/_k-sweep/2026-09-24T140621Z.json
npm run k-sweep -- --marginal-utility --manifest results/_k-sweep/2026-09-24T140621Z.json

# Full synthesis (preferred)
npm run analysis:synthesis
```

## Repository layout

```text
configs/          Experiment YAML (matrix, k-sweep, adaptive, archives)
datasets/         Versioned task JSONL (v0.2 for frozen M3/M4)
src/              Harness, routers, metrics, analysis
results/          Immutable live epochs + _matrix / _k-sweep / _adaptive-eval manifests
analysis/         Freeze artifacts + synthesis publication pack
docs/             Brief, decisions, methodology, technical report
```

## Design documents

| Doc | Purpose |
|---|---|
| [docs/BRIEF.md](docs/BRIEF.md) | Research design |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Locked scientific decisions (D1–D16) |
| [docs/methodology.md](docs/methodology.md) | Metrics, denominators, latency rules |
| [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) | Checkpoint status |
| [docs/m3-freeze.md](docs/m3-freeze.md) / [docs/m4-freeze.md](docs/m4-freeze.md) | Epoch freezes |

## Development (offline)

Node ≥ 20. Install dependencies, then run the mocked smoke path (no live APIs):

```bash
npm test
npm run eval -- --config configs/baseline-20.yaml --mock
npm run eval -- --config configs/jev-top5-20.yaml --mock
```

Live evaluation requires `AGENT_API_KEY` and, for Jev, `TYPESAFE_API_KEY`
(see `.env.example`). **Do not launch new live matrices** without a new freeze;
the scientific checkpoint is closed.

## Citation

If you use this harness or results, please cite the paper:

> Aditya Kuniyil Kattil. *Routing Before Reasoning: Scaling Tool Use in LLM Agents.*  
> <https://www.adityakk.com/Routing%20Before%20Reasoning%3A%20Scaling%20Tool%20Use%20in%20LLM%20Agents.pdf>
