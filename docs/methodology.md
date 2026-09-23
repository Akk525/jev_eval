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
* Dataset version (`datasets/v0.1/tasks.jsonl`).
* Registry hash (covers name, description, domain, parameters, `routingSummary`, `nearMisses`, and the global tail).
* Pricing version (`pricing/v1.json`).
* Jev Choice instructions (`JEV_ROUTER_INSTRUCTIONS_V1`) and the pinned model `typesafe` / `jev-1.13.0` on the official System One API.

Do not tune prompts, `routingSummary` text, confidence thresholds, `nearMisses`, the global tool tail, or evaluation rules according to which setting makes Jev look better.

## `routingSummary` versus full schemas

Routers rank only the frozen `routingSummary` on each tool. They do not receive JSON Schema. The agent always receives full schemas for the tools it is given. Baseline is the full toolspace. Routed architectures are the top-k candidates after the router.

## Per-task nested toolspaces

For each task and toolspace size N:

```text
toolspace(task, N) = required_tools ∪ prefix(distractor_sequence, N − |required|)
```

Nesting holds: `toolspace(task, 5) ⊂ toolspace(task, 10) ⊂ … ⊂ toolspace(task, 100)`. Required tools are always present. If they cannot fit in N, the task is ineligible for that N and is not scored as a failure. Early distractors are frozen near-misses authored from tool descriptions, not from model scores. Every run line stores the exact ordered toolspace.

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
* `priced_cost_usd` — sum of per-attempt priced costs from token counts and the config pricing version
* `router_latency_ms` / `agent_latency_ms` — mean, median/p50, p95 over attempts that recorded a latency
* `calibration` — provider `confidence` vs empirical hit rate (`recallAtK === 1`), including fixed buckets and Expected Calibration Error. Attempts without confidence (for example the LLM router) stay out of the calibration denominator. Top-1 probability is never substituted for confidence (D4).

## Source of truth

`runs.jsonl` is the measurement record. Memora is an optional best-effort mirror. A Memora failure does not change the failure class and does not prevent the run append. Result directories are immutable. Resume is allowed only when the config hash matches.

## Versioning after the first result

After the first real result directory exists, any methodological change needs a new dataset version, registry hash, prompt version, or pricing version, plus a `docs/DECISIONS.md` entry. Old result directories are never rewritten.
