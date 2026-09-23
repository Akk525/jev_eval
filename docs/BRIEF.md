# Jev Agent Tool-Routing Eval Harness

> Canonical research brief. Locked amendments in [DECISIONS.md](DECISIONS.md) override this document where they differ. Read decisions before implementing.
>
> Locked 2026-09-23: per-task nested toolspaces, `routingSummary`, Execution Success Rate for the MVP, independent Jev probability fields, Memora as a best-effort mirror, `R0 INFRASTRUCTURE_FAILURE`, and experimental neutrality.

## 1. Project Purpose

We are building an open-source evaluation harness to investigate a specific agent-systems question:

> **As an AI agent's available toolspace grows, can a lightweight decision model pre-route tools more efficiently without sacrificing end-to-end task success?**

The primary decision model being evaluated is **Jev by TypeSafe AI**.

The project is NOT intended to prove that Jev is better than an LLM.

The goal is to experimentally characterize:

1. How agent performance changes as the number of available tools increases.
2. Whether pre-routing tools before invoking the main reasoning model improves performance.
3. Whether Jev can serve as a cheap tool pre-router.
4. How Jev compares with an LLM-based router.
5. Whether reducing the tool context lowers token usage, cost, or latency.
6. Where failures occur within the agent execution pipeline.
7. Whether Jev confidence can be used to dynamically allocate context or compute.
8. Whether there is a practical toolspace size at which pre-routing becomes useful.

All conclusions must come from reproducible benchmark results.

---

# 2. Core Hypothesis

Modern tool-using agents are often given every available tool definition in their context.

For small toolspaces this may be fine.

As the number of tools increases, however, two problems may emerge:

### Context cost

More tool schemas increase the input context sent to the reasoning model.

### Tool-selection difficulty

The model must distinguish between an increasing number of semantically similar capabilities.

Instead of exposing all tools to the reasoning model, we want to test:

```text
User Request
     |
     v
Tool Pre-Router
     |
     v
Top-k Candidate Tools
     |
     v
Reasoning Agent
     |
     v
Selected Tool
     |
     v
Execution
```

Jev is one implementation of the pre-router.

---

# 3. Experimental Architectures

We need three primary architectures.

## A. Baseline: All Tools

```text
User Request
     |
     v
LLM Agent
(sees all N tools)
     |
     v
Tool Execution
     |
     v
Final Answer
```

There is no routing layer.

The agent receives all N available tool definitions.

---

## B. LLM Router

```text
User Request
     |
     v
LLM Router
     |
     v
Top-k Tools
     |
     v
LLM Agent
     |
     v
Tool Execution
     |
     v
Final Answer
```

An LLM first selects/ranks the most relevant tools.

The downstream reasoning agent receives only those candidate tools.

---

## C. Jev Router

```text
User Request
     |
     v
Jev
     |
     v
Top-k Tools + Confidence
     |
     v
LLM Agent
     |
     v
Tool Execution
     |
     v
Final Answer
```

Jev performs the routing decision.

The downstream reasoning agent should otherwise be identical to the agent used in A and B.

---

# 4. Critical Experimental-Control Requirement

The routing mechanism should be the primary variable.

Where applicable, keep the following identical across architectures:

* reasoning model
* reasoning prompt
* tool definitions
* tool implementations
* task
* evaluation logic
* environment
* model parameters
* output schema
* tool execution behavior

Do not accidentally optimize one architecture independently.

We want architecture comparisons, not prompt-engineering comparisons.

All architecture-specific behavior should be isolated behind router interfaces.

---

# 5. Experimental Variables

## Toolspace Size N

The final benchmark should support:

```text
N = 5
N = 10
N = 25
N = 50
N = 100
```

The harness must NOT hard-code these values.

Toolspace size should be configurable.

---

## Candidate Set Size k

Routed architectures should support configurable:

```text
k = 1
k = 3
k = 5
k = 10
```

Again, do not hard-code these values.

---

# 6. Tools

We eventually want approximately 100 mock tools.

They should resemble realistic agent capabilities while remaining deterministic and cheap to execute.

Do NOT require real Gmail, GitHub, Stripe, Google Calendar, etc. integrations for the core benchmark.

The benchmark must be reproducible without external application accounts.

Possible domains:

### Files

* search_files
* read_file
* write_file
* move_file
* delete_file
* list_directory
* get_file_metadata
* share_file
* compress_file
* extract_archive

### Email

* search_email
* read_email
* send_email
* reply_email
* forward_email
* archive_email
* mark_spam
* add_label
* remove_label
* download_attachment

### Calendar

* list_events
* get_event
* create_event
* update_event
* delete_event
* find_availability
* invite_attendee
* remove_attendee
* create_recurring_event
* list_calendars

### GitHub-like developer operations

* search_repositories
* search_code
* get_issue
* create_issue
* close_issue
* get_pull_request
* create_pull_request
* list_commits
* get_commit
* add_issue_comment

### Database

* query_database
* insert_record
* update_record
* delete_record
* describe_table
* list_tables
* count_records
* aggregate_records
* create_table
* export_query

### Web

* search_web
* fetch_page
* extract_links
* get_page_metadata
* download_page
* check_url
* search_news
* search_images
* get_robots_txt
* resolve_redirect

### Finance

* get_transaction
* list_transactions
* calculate_balance
* create_invoice
* get_invoice
* list_invoices
* get_exchange_rate
* calculate_tax
* get_budget
* categorize_transaction

### Developer / Infrastructure

* run_tests
* run_command
* read_logs
* deploy_service
* restart_service
* get_service_status
* get_environment_variable
* set_environment_variable
* query_metrics
* rollback_deployment

### CRM / Customer Support

* search_customer
* get_customer
* create_customer
* update_customer
* list_orders
* get_order
* cancel_order
* refund_order
* create_support_ticket
* get_support_ticket

### Analytics

* query_events
* calculate_conversion
* get_daily_active_users
* get_retention
* segment_users
* calculate_funnel
* get_page_views
* get_session
* export_report
* compare_periods

The exact taxonomy can evolve.

However, semantically similar tools are intentional.

For example:

```text
search_files
search_email
search_code
search_customer
search_web
search_repositories
```

The benchmark should NOT be trivial keyword matching.

---

# 7. Tool Definition Requirements

Each tool should have at minimum:

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  domain: string;
  parameters: JSONSchema;
}
```

Locked amendment: also include a versioned `routingSummary`. See DECISIONS.md.

Tool execution should return structured results.

Example:

```typescript
interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  latencyMs: number;
}
```

Mock tool behavior should be deterministic whenever possible.

Tool definitions should live in a central registry so different experimental toolspaces can be generated from the same source.

---

# 8. Benchmark Dataset

Target final dataset:

```text
~500 labeled tasks
```

Initial vertical slice:

```text
20 tools
50 tasks
```

Do NOT begin by creating all 500 tasks.

First prove that the entire evaluation pipeline works.

---

# 9. Task Difficulty

Tasks should vary in difficulty.

## Level 1: Explicit

Example:

```text
Find emails from Sarah containing the quarterly report.
```

Expected tool:

```text
search_email
```

---

## Level 2: Implicit

Example:

```text
Did Sarah ever send me the quarterly report?
```

Expected tool:

```text
search_email
```

---

## Level 3: Ambiguous

Example:

```text
Find the quarterly report Sarah sent me.
```

Plausible tools might include:

```text
search_email
search_files
```

Ground truth should distinguish between:

* required tools
* acceptable alternatives
* irrelevant tools

---

## Level 4: Multi-Step

Example:

```text
Find the report Sarah emailed me and save the attachment to the finance folder.
```

Expected sequence could include:

```text
search_email
read_email
download_attachment
write_file
```

Multi-step evaluation should be added after single-step routing works reliably.

---

# 10. Dataset Schema

Design a versioned JSONL schema.

Conceptually:

```json
{
  "id": "task_0001",
  "version": 1,
  "difficulty": "implicit",
  "prompt": "Did Sarah ever send me the quarterly report?",
  "required_tools": ["search_email"],
  "acceptable_tools": [],
  "expected_sequence": ["search_email"],
  "domains": ["email"],
  "metadata": {}
}
```

The schema should allow future extension without breaking existing evals.

Validate dataset entries before benchmark execution.

---

# 11. Primary Metric: End-to-End Task Success

The most important metric is whether the agent successfully completes the task.

For each run:

```text
success = true | false
```

Primary aggregate:

```text
Task Success Rate
=
successful tasks / total tasks
```

The primary scaling graph should eventually be:

```text
Task Success Rate
vs
Number of Available Tools
```

with separate lines for:

* baseline
* LLM router
* Jev router

Locked amendment: the single-step MVP reports **Execution Success Rate**, not End-to-End Task Success. End-to-End Task Success is reserved for later experiments with deterministic expected outcomes or multi-step completion. Infrastructure failures (`R0`) are excluded from that denominator. See DECISIONS.md.

---

# 12. Routing Metric: Recall@k

For routing architectures, measure whether the required tool appears among the candidate tools.

For single-tool tasks:

```text
Recall@k =
P(required tool appears in top-k)
```

Report at:

```text
Recall@1
Recall@3
Recall@5
Recall@10
```

For multi-tool tasks:

```text
ToolRecall@k =
|RequiredTools ∩ CandidateTools|
/
|RequiredTools|
```

This metric isolates router performance from downstream agent performance.

Primary Recall@k uses `required_tools` only. `acceptable_tools` feed task-level success and a secondary lenient recall.

---

# 13. Agent Tool-Selection Accuracy

We need to distinguish:

```text
Router did not provide correct tool
```

from:

```text
Router provided correct tool but agent selected incorrectly
```

Measure:

```text
SelectionAccuracy =
P(agent selects correct tool | correct tool was available)
```

This is important for determining whether large toolspaces themselves degrade LLM tool selection.

---

# 14. Cost Metrics

Record:

```text
router_input_tokens
router_output_tokens

agent_input_tokens
agent_output_tokens

router_cost_usd
agent_cost_usd

total_cost_usd
```

Aggregate into:

```text
mean cost/task
median cost/task
cost/1,000 tasks
estimated cost/1M tasks
```

Pricing assumptions must be stored with benchmark results.

Do not bake provider prices into historical result calculations without versioning them.

A result should remain reproducible even if API pricing later changes.

---

# 15. Latency Metrics

Measure wall-clock latency for:

```text
routing
agent inference
tool execution
total execution
```

Store raw values in milliseconds.

Aggregate using at least:

```text
mean
median
p50
p95
```

Potentially p99 once the dataset is large enough.

---

# 16. Jev Confidence and Calibration

Where Jev exposes probabilities/confidence, preserve the raw values.

We want to test whether reported confidence corresponds to empirical routing accuracy.

Bucket predictions, for example:

```text
0.50–0.60
0.60–0.70
0.70–0.80
0.80–0.90
0.90–1.00
```

Compare:

```text
mean predicted confidence
vs
actual empirical accuracy
```

Calculate Expected Calibration Error where appropriate.

Do not assume Jev is calibrated. Measure it.

Locked amendment: store the full probability distribution, the top-1 probability, and the provider-reported confidence as independent fields. Do not derive one from another.

---

# 17. Adaptive Routing Experiment

This is a later experiment, NOT MVP.

If Jev confidence is useful, test dynamic candidate-set sizes.

Conceptually:

```text
Jev confidence
      |
      +-- high --> k = 3
      |
      +-- medium --> k = 5 or 10
      |
      +-- low --> LLM router or full toolspace
```

The goal is to investigate whether uncertainty can determine how much context/compute the system allocates.

This architecture should only be implemented after the basic benchmark works.

---

# 18. Memora

Memora will be used as the observability/execution-tracing layer.

Important:

> Memora is instrumentation for the experiment, not the subject of the experiment.

The benchmark must not depend on Memora for correctness.

If Memora is disabled, the benchmark should still execute and produce its essential result files.

Memora provides richer execution traces for failure analysis and debugging.

Locked amendment: `runs.jsonl` is the source of truth. Memora is a best-effort mirror. A Memora failure must not terminate or invalidate an otherwise valid run.

---

# 19. Trace Requirements

Each benchmark run should receive:

```text
run_id
task_id
trace_id
```

A trace should allow us to reconstruct:

```text
task
  ↓
router
  ↓
candidate tools
  ↓
confidence/scores
  ↓
agent
  ↓
selected tool
  ↓
arguments
  ↓
tool execution
  ↓
tool result
  ↓
final response
  ↓
evaluation result
```

Conceptual event:

```json
{
  "task_id": "task_0042",
  "architecture": "jev",
  "toolspace_size": 100,
  "candidate_k": 5,

  "routing": {
    "candidates": [],
    "scores": [],
    "latency_ms": 18
  },

  "agent": {
    "selected_tool": "search_email",
    "arguments": {},
    "input_tokens": 742,
    "output_tokens": 83,
    "latency_ms": 431
  },

  "tool": {
    "success": true,
    "latency_ms": 12
  },

  "evaluation": {
    "required_tools": ["search_email"],
    "success": true
  }
}
```

Do not treat this exact object as final architecture. Design proper typed events.

Every run records the exact toolspace presented to the router and agent.

---

# 20. Failure Taxonomy

Every failed run should eventually be attributable to a stage.

Initial taxonomy, as amended:

```text
R0 INFRASTRUCTURE_FAILURE

Provider, network, or API failure prevented a valid model decision.
Malformed provider output that cannot be parsed into a valid decision is included, with a reason code.
Excluded from Execution Success Rate and Recall@k. Reported separately.


R1 ROUTING_FAILURE

The router returned a valid decision, and the required tool was not present in the candidate set.


R2 SELECTION_FAILURE

Required tool was available to the reasoning agent,
but the agent selected an incorrect tool.


R3 ARGUMENT_FAILURE

Agent selected the correct tool but supplied incorrect arguments.


R4 EXECUTION_FAILURE

Tool invocation was appropriate but execution failed.


R5 REASONING_FAILURE

Tool execution succeeded and returned sufficient information,
but the final answer/task completion was incorrect.

Reserved until tasks carry a deterministic expected outcome. Does not fire in the single-step MVP.


R6 BENCHMARK_AMBIGUITY

The benchmark's expected execution was too restrictive,
or multiple reasonable execution paths existed.
```

Failure classification should use trace data whenever possible.

Do not silently count benchmark ambiguity as model failure.

Do not silently count infrastructure failure as a semantic routing failure.

---

# 21. Result Storage

Every experiment must produce machine-readable results.

Prefer immutable experiment directories such as:

```text
results/
  2026-09-23T150000Z_jev-top5_100-tools/
      config.json
      runs.jsonl
      summary.json
      failures.jsonl
```

Each result set should contain enough configuration to reproduce the experiment.

Store at minimum:

```text
git commit SHA
dataset version
tool registry version
architecture
router
reasoning model
model parameters
toolspace size
candidate k
number of repetitions
pricing assumptions
timestamp
```

Never overwrite historical results.

---

# 22. Reproducibility

The benchmark should be executable from CLI.

Eventually something similar to:

```text
npm run eval -- \
  --architecture jev \
  --tools 100 \
  --top-k 5 \
  --dataset datasets/v0.1/tasks.jsonl \
  --runs 3
```

Exact CLI design is flexible.

But experiment configuration should also be serializable to a config file.

Example:

```text
configs/
  baseline-100.yaml
  jev-top5-100.yaml
  llm-router-top5-100.yaml
```

A researcher should be able to rerun an experiment without reconstructing command-line arguments manually.

---

# 23. Statistical Reliability

For routing-only deterministic experiments, repeated execution may not be necessary.

For end-to-end LLM experiments, support:

```text
repetitions = 3
```

for important final benchmark runs.

Report where appropriate:

```text
mean
standard deviation
95% confidence interval
```

Do not make claims about small differences without accounting for variance.

---

# 24. Experiment Phases

## Phase 0: Infrastructure

Goal:

Create the foundational types, configuration, tool registry, runner, result storage, and tracing interfaces.

No large benchmark yet.

---

## Phase 1: Vertical Slice

Build:

```text
20 mock tools
50 labeled tasks

Baseline
vs
Jev top-5
```

Capture:

```text
execution success
Recall@k
selection accuracy
tokens
cost
latency
confidence
trace
failure classification
```

Success criterion:

One command can execute the benchmark and produce a reproducible result directory.

---

## Phase 2: Routing Benchmark

Scale toward:

```text
100 tools
500 tasks
```

Compare:

```text
Jev router
vs
LLM router
```

without necessarily invoking the downstream agent.

Measure:

```text
Recall@1
Recall@3
Recall@5
Recall@10
latency
cost
confidence/calibration
```

This tells us whether Jev routing itself is viable before paying for large end-to-end runs.

---

## Phase 3: Toolspace Scaling

Run:

```text
Baseline
Jev top-5
LLM router top-5
```

at:

```text
N = 5
10
25
50
100
```

Primary metrics:

```text
execution success, later end-to-end task success
selection accuracy
cost
tokens
latency
failure type
```

This is the core research experiment.

Same tasks at every N. Per-task toolspaces nest. See DECISIONS.md.

---

## Phase 4: Top-k Ablation

Test Jev with:

```text
k = 1
3
5
10
```

Determine the relationship between:

```text
routing recall
context size
agent accuracy
cost
latency
```

---

## Phase 5: Adaptive Routing

Only after calibration results exist.

Test whether confidence can dynamically determine k or trigger escalation to another router.

---

# 25. Required Final Figures

The analysis pipeline should eventually generate data for at least:

### Figure 1

```text
Task Success Rate
vs
Number of Available Tools
```

Compare architectures. Until end-to-end outcomes exist, this figure uses Execution Success Rate.

### Figure 2

```text
Cost per Task
vs
Number of Available Tools
```

### Figure 3

```text
End-to-End Latency
vs
Number of Available Tools
```

### Figure 4

```text
Routing Recall
vs
k
```

### Figure 5

```text
Predicted Confidence
vs
Empirical Accuracy
```

Calibration plot. Confidence and top-1 probability are separate series when both are measured.

### Figure 6

```text
Failure Type Distribution
vs
Number of Available Tools
```

Include R0 as its own series. Do not fold it into R1.

Do not optimize code around chart generation prematurely.

Raw results and correct metrics come first.

---

# 26. Interpretation Rules

This project should not define success as "Jev wins."

Interesting outcomes include:

### A

Same accuracy, lower cost/latency.

### B

Higher accuracy after reducing tool overload.

### C

Slightly lower accuracy but dramatically lower cost.

### D

No benefit below some toolspace threshold, but meaningful benefit above it.

### E

Jev struggles on ambiguous routing tasks.

### F

Jev has high Recall@5 despite mediocre top-1 accuracy.

### G

Routing works, but the downstream reasoning model remains the dominant source of failures.

### H

Confidence is poorly calibrated and cannot safely drive adaptive routing.

Negative results are valid results.

Do not change evaluation methodology merely to produce favorable numbers.

Any methodological change after benchmark runs begin must be versioned and documented.

---

# 27. Engineering Principles

## Separation of concerns

Use interfaces for:

```text
Router
Agent
Tool
Evaluator
Tracer
ResultStore
```

Implementations should be swappable.

---

## Provider independence

Avoid coupling the entire harness to one model provider.

Model-provider logic should live behind adapters.

---

## Deterministic mock environment

Mock tools and fixture data should behave deterministically.

Model inference is already stochastic. Do not introduce unnecessary randomness elsewhere.

---

## Typed configuration

Experiment configurations should be validated before execution.

Invalid combinations should fail early.

---

## Resume support

Long experiments should be restartable.

If 400/500 tasks complete before failure, we should not need to rerun the first 400.

---

## Concurrency

Eventually support configurable concurrency.

Do not implement uncontrolled parallel API calls.

Respect provider rate limits.

Default concurrency for the MVP is 1.

---

## Caching

Routing-only experiments may benefit from optional response caching.

Cache keys must include all inputs affecting the result.

Never allow cache reuse across incompatible model/prompt/config versions.

---

## Secrets

API keys must never enter:

```text
source code
datasets
result files
Memora traces
Git history
```

Use environment variables.

Provide `.env.example`.

---

# 28. Testing Strategy

At minimum:

### Unit tests

* tool registry
* dataset validation
* Recall@k calculation
* execution-success calculation
* cost calculation
* latency aggregation
* failure classification, including R0 exclusion
* result serialization
* config validation

### Integration tests

* mock router → agent → tool → evaluator
* baseline architecture
* Jev architecture with mocked Jev response
* LLM-router architecture with mocked model response
* tracing enabled/disabled
* interrupted run → resume
* Memora failure does not fail the run

### Smoke test

A tiny benchmark should run without paid APIs.

Example:

```text
5 tools
5 tasks
mock router
mock agent
```

CI should use this rather than spending API credits.

---

# 29. Documentation

The repository should eventually include:

```text
README.md
docs/
  architecture.md
  methodology.md
  dataset.md
  metrics.md
  experiments.md
  tracing.md
  BRIEF.md
  PROJECT_STATE.md
  DECISIONS.md
```

The README should explain the research question before implementation details.

Do not write marketing claims before results exist.

---

# 30. Repository Structure

Directional structure. Departures are recorded in DECISIONS.md.

```text
jev_eval/
│
├── src/
│   ├── agent/
│   ├── cli/
│   ├── routers/
│   │   ├── baseline/
│   │   ├── jev/
│   │   └── llm/
│   ├── tools/
│   │   ├── registry/
│   │   ├── fixtures/
│   │   └── domains/
│   ├── eval/
│   │   ├── runner/
│   │   ├── evaluators/
│   │   └── failures/
│   ├── metrics/
│   ├── tracing/
│   │   ├── noop/
│   │   ├── jsonl/
│   │   └── memora/
│   ├── providers/
│   ├── results/
│   └── config/
│
├── datasets/
│   ├── fixtures/
│   └── v0.1/
│
├── configs/
├── pricing/
├── results/
├── tests/
├── docs/
├── .env.example
├── README.md
└── package.json
```

`src/metrics/` is pure functions so metric tests do not boot the runner. `runs.jsonl` is the local source of truth. The Memora adapter mirrors it.

---

# 31. MVP Definition of Done

The first milestone is NOT the final 100-tool benchmark.

MVP is complete when we have:

* 20 deterministic mock tools
* 50 labeled single-step tasks
* validated dataset format
* baseline all-tools architecture
* Jev top-k architecture
* common agent implementation
* tool execution environment
* evaluator reporting Execution Success Rate
* Recall@k
* tool-selection accuracy
* token tracking
* cost tracking
* latency tracking
* Jev full distribution, top-1 probability, and provider confidence captured separately
* Memora tracing adapter
* no-op tracing adapter
* structured failure taxonomy including R0
* reproducible result directories that record the exact toolspace
* CLI experiment runner
* experiment configuration files
* resume support
* unit/integration tests
* tiny free smoke test
* initial methodology documentation

After this works, scale.

---

# 32. GitHub Issue Planning

Before implementing significant code, convert this project into GitHub issues.

Use milestones roughly corresponding to:

```text
M0 — Harness Foundation
M1 — Vertical Slice
M2 — Routing Benchmark
M3 — Toolspace Scaling
M4 — Top-k Ablations
M5 — Adaptive Routing
M6 — Analysis + Publication
```

Each GitHub issue should contain:

```text
Title

Context
Why this issue exists.

Scope
Exactly what should be implemented.

Non-goals
What should NOT be implemented as part of this issue.

Technical notes
Relevant interfaces, schemas, or dependencies.

Acceptance criteria
Concrete conditions required to close the issue.

Tests
Tests that must exist or pass.

Dependencies
Issues that must be completed first.

Artifacts
Files/modules/results expected from completion.
```

Issues should generally be small enough to complete in one focused coding session.

---

# 33. Session Continuity

Development should remain easy to resume across sessions.

Maintain:

```text
docs/PROJECT_STATE.md
```

It should contain only current operational state:

```text
Current milestone

Completed issues

Issue currently being worked on

Important implementation decisions

Known problems

Open questions

Next recommended issue
```

Do NOT turn this file into a development diary.

Also maintain:

```text
docs/DECISIONS.md
```

for architectural decisions that future sessions should not casually reverse.

Each decision should include:

```text
Decision
Reason
Alternatives considered
Consequences
Date
```

---

# 34. Instructions for a new session

When starting work on this repository:

1. Read this project brief.
2. Read `docs/PROJECT_STATE.md`.
3. Read relevant entries in `docs/DECISIONS.md`.
4. Inspect open GitHub issues.
5. Inspect the code related to the current issue.
6. Do not begin unrelated refactors.
7. State the implementation plan before modifying substantial code.
8. Implement against the issue acceptance criteria.
9. Run relevant tests.
10. Update documentation when architecture or behavior changes.
11. Update `PROJECT_STATE.md` when the current state changes.
12. Do not mark an issue complete unless its acceptance criteria are satisfied.
13. Do not invent benchmark results.
14. Do not optimize the benchmark to favor Jev.
15. Preserve raw experiment data.
16. Never commit secrets.

When a design question arises that materially affects experimental validity, stop and surface the tradeoff rather than silently choosing whichever implementation is easiest.
