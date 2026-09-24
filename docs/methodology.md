# Methodology

This note describes how the vertical slice measures tool routing. It matches the code on `main`. A negative result is a result. Changing a control after the first real result directory requires a new version and a `docs/DECISIONS.md` entry (D7).

## Research question

As the presented toolspace grows, can a lightweight decision model pre-route tools without sacrificing task completion? The primary decision model under study is Jev. The harness does not exist to prove that Jev beats an LLM.

## Architectures

Routing is the only intended variable. The three architectures share the same agent, dataset, registry, tool executors, and evaluation rules.

| Architecture | Router | What the agent sees |
|---|---|---|
| Baseline | None. Candidates are the full presented toolspace in that order. | Full JSON schemas for all N tools. |
| Jev | One Choice over each tool's `routingSummary`. Local sort of the returned distribution, cut at k. | Full JSON schemas for the top-k tools only. |
| LLM router | Ranks the same `routingSummary` text, cut at k. | Full JSON schemas for the top-k tools only. |

The MVP vertical slice runs baseline and Jev. M2 adds the LLM router, optional router-only Recall@k, and a live LLM path that uses the same shared agent as baseline and Jev.

## Frozen controls

These are held constant across architectures in a fair comparison:

* Agent prompt (`buildAgentPrompt`), model, and parameters. M1 pins `openai` / `gpt-5.6-sol` at temperature 0 (D10).
* Tool executors and fixture data in the catalog registry.
* Dataset path + version (scaling / matrix / k-sweep use `datasets/v0.2/tasks.jsonl`; some early slice example configs still reference `datasets/v0.1/`). Analysis merges fail loud if paths/versions disagree.
* Registry hash (covers name, description, domain, parameters, `routingSummary`, `nearMisses`, and the global tail).
* Pricing version (`pricing/v1.json`).
* Jev Choice instructions (`JEV_ROUTER_INSTRUCTIONS_V1`) and the pinned model `typesafe` / `jev-1.13.0` on the official System One API.
* Agent prompt text is frozen with the agent pin; there is no separate `promptVersion` field yet (registry hash + agent model stand in — see `docs/reproducibility-audit.md`).

Do not tune prompts, `routingSummary` text, confidence thresholds, `nearMisses`, the global tool tail, or evaluation rules according to which setting makes Jev look better.

## `routingSummary` versus full schemas

Routers rank only the frozen `routingSummary` on each tool. They do not receive JSON Schema. The agent always receives full schemas for the tools it is given. Baseline is the full toolspace. Routed architectures are the top-k candidates after the router.

## Per-task nested toolspaces

For each task and toolspace size N:

```text
toolspace(task, N) = required_tools ∪ prefix(distractor_sequence, N − |required|)
```

The formal M3 scaling sizes are `N ∈ {5, 10, 25, 50, 100}`. Nesting holds across those sizes: `toolspace(task, 5) ⊂ toolspace(task, 10) ⊂ … ⊂ toolspace(task, 100)`. Other positive integer sizes (for example the M1 slice at N = 20) remain constructible the same way. Non-positive or non-integer N is rejected.

Required tools are always present when the task is eligible. If they cannot fit in N, the task is ineligible for that N and is not scored as a failure. Early distractors are frozen near-misses authored from tool descriptions, not from model scores. Construction is deterministic: the same task and N always yield the same ordered list. Every run line stores the exact ordered toolspace.

## Execution Success Rate

The MVP aggregate is **Execution Success Rate**. It is not End-to-End Task Success. There is no LLM judge. End-to-End Task Success and `R5` wait for later expected outcomes or multi-step tasks.

For one single-step attempt:

```text
execution_success =
  selected tool ∈ required_tools ∪ acceptable_tools
  AND required argument checks pass (when expected_arguments is present)
  AND the tool returns a successful deterministic result
```

Absent `expected_arguments` means `R3` is not applicable for that task.

## Recall@k and selection accuracy

* Primary **Recall@k** uses `required_tools` only: the fraction of required tools present in the top k candidates.
* Lenient recall is 1 when any required or acceptable tool is in the top k, else 0. It does not replace primary Recall@k.
* **Selection accuracy** is defined only when a valid agent decision exists and at least one required tool was in the candidate set. It is 1 when the selected tool is in `required_tools`, else 0. A router miss that omitted every required tool stays out of this denominator.

An agent miss after a good candidate does not reduce Recall@k. A router miss does not enter the selection-accuracy denominator.

## Router-only mode

Set `routerOnly: true` in the config, or pass `--router-only` on the CLI. The run stops after routing. Each `runs.jsonl` line stores `candidates` and `recallAtK`. The agent is never called. Every attempt is `executionExcluded`, so `execution_success_rate` is null.

Router-only answers "did the router surface the required tool?" It does not answer Execution Success Rate. Do not mix router-only and full-agent result directories when comparing ESR.

Example:

```bash
npm run eval -- --config configs/jev-router-only-20.yaml --mock
```

## Failure codes and denominators (D6)

`R0 INFRASTRUCTURE_FAILURE` is outside the quality denominators. `R1 ROUTING_FAILURE` is a schema-valid decision whose candidate set omits a required tool.

| Outcome | Routing metrics (Recall@k) | Execution Success Rate | How it is counted |
|---|---|---|---|
| Router call fails or is malformed (`R0`) | Excluded | Excluded | Infrastructure. Earliest stage wins. |
| Router decision is valid, agent call fails or is malformed (`R0`) | Included | Excluded | Routing can be scored. Execution cannot. Not `R2`. |
| Router and agent succeed, harness or tool throws before a `ToolExecutionResult` (`R0`) | Included | Excluded | Not `R4`. |
| Valid router decision, required tool missing (`R1`) | Included as a miss | Included as not successful | Scientific routing failure. |
| Valid path, wrong tool selected (`R2`), bad args (`R3`), or tool `success: false` (`R4`) | Included | Included as not successful | Scientific execution failure. |

`ToolExecutionResult.success = false` on a returned result is `R4`, not `R0`.

Aggregates:

```text
attempts
r0_attempts
infrastructure_failure_rate = r0_attempts / attempts

routing_scored = attempts with a valid router decision
recall@k = hits / routing_scored

execution_scored = attempts that are not execution-excluded R0
execution_success_rate = execution_successes / execution_scored
```

If a denominator is 0, the rate is null, not 0. An attempt is counted once. The earliest failing stage supplies the `R0` label.

## Summary aggregates

`summary.json` is recomputed from `runs.jsonl` after every append. Fields:

* `recall_at_k` — mean primary Recall@k over routing-scored attempts
* `recall_at_k_stats` / `execution_success_rate_stats` — mean, sample standard deviation (n − 1), and 95% CI (`summarizeSamples`) over the same scored attempts. Empty denominators stay null; values are never invented.
* `by_repetition` — when `runs.jsonl` contains two or more repetition indexes, quality rates are computed per repetition (R0 still excluded from each repetition's denominators), then summarized across repetitions with the same sample stats. Null when only one repetition is present.
* `priced_cost_usd` — sum of per-attempt priced costs from token counts and the config pricing version
* `router_latency_ms` / `agent_latency_ms` — mean, median/p50, p95 over attempts that recorded a latency
* `calibration` — provider `confidence` vs empirical hit rate (`recallAtK === 1`), including fixed buckets and Expected Calibration Error. Attempts without confidence (for example the LLM router) stay out of the calibration denominator. Top-1 probability is never substituted for confidence (D4).

R0 attempts remain in `attempts` / `r0_attempts` and token/cost totals when recorded, but they never enter Execution Success Rate, Recall@k, or the sample / by-repetition quality stats (D6).

## Repetitions

Set `repetitions` in the experiment config (positive integer). The runner records one `runs.jsonl` line per `(task_id, repetition)` and never drops raw lines after aggregation. Matrix cells default to `repetitions: 1`. Final end-to-end slice configs under `configs/final/` use `repetitions: 3`.

## Source of truth

`runs.jsonl` is the measurement record. Memora is an optional best-effort mirror. A Memora failure does not change the failure class and does not prevent the run append. Result directories are immutable. Resume is allowed only when the config hash matches.

## N-matrix orchestration

`npm run matrix` runs the checked-in `configs/matrix/` cells serially. A manifest under `<results>/_matrix/<timestamp>.json` records per-cell status. `--resume` skips completed and failed cells and continues pending/running ones (partial result dirs use the existing config-hash resume rules). Failed cells are not retried unless the operator starts a new matrix run. A single cell can still be executed with `npm run eval -- --config configs/matrix/...`.

## Provider concurrency

`concurrency` in the experiment config caps how many `(task_id, repetition)` attempts may call the router/agent at once (bound: 1..8, `MAX_PROVIDER_CONCURRENCY`). Default configs keep `concurrency: 1`. The value is stored on `config.json`. Toolspace construction and ranking inputs stay deterministic per task; `runs.jsonl` append order may follow completion order. Resume keys remain `(task_id, repetition)`. Provider failures still classify as `R0`. There is no unbounded `Promise.all` over the task list.

## Scaling summary tables

`npm run summarize` rebuilds architecture × N comparison tables from result directories under a results root. It recomputes from `runs.jsonl` only (ignores stored `summary.json`). Rows include Execution Success Rate, selection accuracy, Recall@k, tokens, priced cost, latency, failure taxonomy (R0 kept separate), and infrastructure failure rate. Router-only and full-agent epochs are not merged into the same cell. Output is JSON or CSV — no plots and no interpretive claims.

## M4 Jev top-k sweep

M4 holds every scientific control fixed and varies only Jev `topK ∈ {1, 3, 5, 10}` at **N = 25** (D12). Configs live under `configs/k-sweep/` (`datasets/v0.2/`, D10 pins). Regenerate with `npm run generate:k-sweep`. Result directories record k in the directory name via the existing `k<k>` segment.

`npm run k-sweep` orchestrates those configs serially (manifest under `_k-sweep/`, mock path for CI). `npm run k-sweep -- --summarize` rebuilds per-k aggregates from `runs.jsonl`: strict Recall@k, mean candidate count, selection accuracy, ESR, tokens, cost, and latency. Individual result directories stay immutable; there is no optimal-k claim in the aggregate.

`npm run k-sweep -- --tradeoff` emits the compact tradeoff table for the research question (k vs recall vs context/tokens vs ESR vs cost vs latency), including deltas versus the previous k. The artifact sets `decision_rule: null` and does not choose an optimal k. A future decision rule must be versioned separately and kept out of the evaluation labeling loop.

## Adaptive routing policy (M5)

See [docs/adaptive-policy.md](adaptive-policy.md). Locked thresholds live in `policies/adaptive/v1.json` (D13: `T_low = 0.5`, `T_high = 0.6`). The stub `policies/adaptive/v0.pending.json` remains historical. Threshold selection uses a pre-registered development/held-out rule; `top1Probability` is never treated as confidence (D4). Check readiness with `npm run check:calibration -- --results <dir>`; re-run selection with `npm run select:adaptive-thresholds`.


## M6 analysis figures

Normalized attempts: `npm run analysis:dataset`. Figures 1–6: `npm run analysis:figure{1..6}`. Provenance audit: `npm run analysis:audit` and [docs/reproducibility-audit.md](reproducibility-audit.md).

## Versioning after the first result

After the first real result directory exists, any methodological change needs a new dataset version, registry hash, prompt version, or pricing version, plus a `docs/DECISIONS.md` entry. Old result directories are never rewritten.
