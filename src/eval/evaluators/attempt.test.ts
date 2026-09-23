import { expect, it } from "vitest";
import { executionSuccessRate } from "../../metrics/metrics.js";
import type { AttemptRecord } from "../failures/classify.js";
import { evaluateAttempt } from "./attempt.js";

const route = {
  candidates: [
    { name: "search_email", rank: 1, score: 0.7 },
    { name: "search_files", rank: 2, score: 0.3 },
  ],
  scores: { search_email: 0.7, search_files: 0.3 },
  top1Probability: 0.7,
  confidence: 0.4,
  usage: { inputTokens: 1, outputTokens: 0 },
  latencyMs: 1,
  raw: null,
};

function record(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    requiredTools: ["search_email"],
    acceptableTools: [],
    router: { status: "valid", decision: route },
    agent: {
      status: "valid",
      turn: {
        selectedTool: "search_email",
        arguments: { query: "sarah" },
        finalResponse: null,
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
        raw: null,
      },
    },
    tool: { status: "result", result: { success: true, latencyMs: 1, data: {} } },
    ...overrides,
  };
}

it("scores a router miss as a recall miss and leaves selection accuracy out", () => {
  const evaluation = evaluateAttempt(
    record({
      router: {
        status: "valid",
        decision: { ...route, candidates: [{ name: "search_files", rank: 1, score: 1 }] },
      },
      agent: {
        status: "valid",
        turn: {
          selectedTool: "search_files",
          arguments: {},
          finalResponse: null,
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
          raw: null,
        },
      },
    }),
    1,
  );
  expect(evaluation.recallAtK).toBe(0);
  expect(evaluation.selectionAccuracy).toBeNull();
  expect(evaluation.executionExcluded).toBe(false);
  expect(evaluation.executionSuccess).toBe(false);
});

it("scores an agent miss after a hit candidate without changing recall", () => {
  const evaluation = evaluateAttempt(
    record({
      agent: {
        status: "valid",
        turn: {
          selectedTool: "search_files",
          arguments: {},
          finalResponse: null,
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
          raw: null,
        },
      },
    }),
    2,
  );
  expect(evaluation.recallAtK).toBe(1);
  expect(evaluation.selectionAccuracy).toBe(0);
  expect(evaluation.executionSuccess).toBe(false);
});

it("marks an argument mismatch on the right tool as R3", () => {
  const evaluation = evaluateAttempt(
    record({
      expectedArguments: { query: "sarah" },
      agent: {
        status: "valid",
        turn: {
          selectedTool: "search_email",
          arguments: { query: "ada" },
          finalResponse: null,
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
          raw: null,
        },
      },
    }),
    2,
  );
  expect(evaluation.code).toBe("R3");
  expect(evaluation.executionSuccess).toBe(false);
});

it("excludes a router infrastructure failure from recall and execution success", () => {
  const evaluation = evaluateAttempt(
    record({
      router: { status: "failed", reason: "provider_error" },
      agent: { status: "not_run" },
      tool: { status: "not_run" },
    }),
    2,
  );
  expect(evaluation.code).toBe("R0");
  expect(evaluation.recallAtK).toBeNull();
  expect(evaluation.routingExcluded).toBe(true);
  expect(evaluation.executionExcluded).toBe(true);
  expect(executionSuccessRate([evaluation])).toBeNull();
});
