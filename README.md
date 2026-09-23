# Jev Agent Tool-Routing Eval Harness

As an AI agent's available toolspace grows, can a lightweight decision model pre-route tools more efficiently without sacrificing task completion?

The decision model under test is [Jev](https://openrouter.ai/docs/guides/community/jev) by TypeSafe AI. This repository is an evaluation harness. It is not a claim that Jev is better than an LLM. Conclusions come from reproducible benchmark results. Negative results are results.

## Architectures

The routing mechanism is the variable. The reasoning model, prompt, tool implementations, tasks, and evaluator stay fixed.

| Architecture | What the agent sees |
|---|---|
| Baseline | Full schemas for all N tools in the presented toolspace |
| LLM router | Full schemas for the router's top-k tools |
| Jev router | Full schemas for Jev's top-k tools |

Jev and the LLM router both rank the same frozen `routingSummary` text. Top-k for Jev is a local sort of one Choice distribution. The full distribution, the top-1 probability, and the provider-reported confidence are stored separately.

Toolspaces are per task: the required tools, plus a frozen prefix of difficulty-aware distractors. The same task can run at N = 5, 10, 25, 50, and 100, and the sets nest. Each run records the exact tool list.

## MVP metric

The first benchmark is single-step and deterministic. There is no LLM judge.

**Execution Success Rate** is the fraction of scored runs in which the agent selected a required or acceptable tool, passed the task's argument checks, and the mock tool succeeded.

**End-to-End Task Success** is reserved for later work that adds deterministic outcomes or multi-step completion.

Provider and parse failures are `R0 INFRASTRUCTURE_FAILURE`. They are reported separately and are not counted as routing misses.

## Start here

1. [docs/BRIEF.md](docs/BRIEF.md) — research design
2. [docs/DECISIONS.md](docs/DECISIONS.md) — locked choices
3. [docs/methodology.md](docs/methodology.md) — how success and denominators are defined
4. [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) — current milestone and next issue

A new session should read those four, then the open GitHub issue, before changing code.

The first slice is 20 deterministic mock tools and 50 labeled single-step tasks, comparing baseline with Jev top-5. The ~500-task set waits until that slice has exercised the schema.

Offline mocked slice (no live APIs):

```bash
npm test
npm run eval -- --config configs/baseline-20.yaml --mock
npm run eval -- --config configs/jev-top5-20.yaml --mock
```

Live slice (needs `AGENT_API_KEY`; Jev also needs `TYPESAFE_API_KEY`):

```bash
npm run eval -- --config configs/baseline-20.yaml
npm run eval -- --config configs/jev-top5-20.yaml
```

No invented benchmark numbers. Conclusions come from result directories only.
