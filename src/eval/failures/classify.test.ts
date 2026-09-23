import { expect, it } from "vitest";
import type { AttemptRecord } from "./classify.js";
import { classifyAttempt } from "./classify.js";

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

it("classifies a router provider failure as R0 and not R1", () => {
  const classification = classifyAttempt(
    record({ router: { status: "failed", reason: "provider_error" }, agent: { status: "not_run" }, tool: { status: "not_run" } }),
  );
  expect(classification.code).toBe("R0");
  expect(classification.code).not.toBe("R1");
  expect(classification.routingExcluded).toBe(true);
  expect(classification.executionExcluded).toBe(true);
});

it("classifies an agent provider failure after a valid route as R0 without dropping the route", () => {
  const attempt = record({
    agent: { status: "failed", reason: "malformed_decision" },
    tool: { status: "not_run" },
  });
  const decision = attempt.router.status === "valid" ? attempt.router.decision : null;
  const classification = classifyAttempt(attempt);
  expect(classification.code).toBe("R0");
  expect(classification.infrastructureReason).toBe("malformed_decision");
  expect(classification.routingExcluded).toBe(false);
  expect(classification.executionExcluded).toBe(true);
  expect(attempt.router.status === "valid" && attempt.router.decision).toBe(decision);
});

it("classifies a missing required tool as R1", () => {
  const classification = classifyAttempt(
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
  );
  expect(classification).toMatchObject({ code: "R1", executionSuccess: false, executionExcluded: false });
});

it("classifies a wrong tool selected from a complete candidate set as R2", () => {
  const classification = classifyAttempt(
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
  );
  expect(classification.code).toBe("R2");
});

it("classifies bad arguments on the correct tool as R3", () => {
  const classification = classifyAttempt(record({ expectedArguments: { query: "sarah" }, agent: {
    status: "valid",
    turn: {
      selectedTool: "search_email",
      arguments: { query: "ada" },
      finalResponse: null,
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs: 1,
      raw: null,
    },
  } }));
  expect(classification.code).toBe("R3");
});

it("classifies a failed tool result as R4", () => {
  const classification = classifyAttempt(
    record({ tool: { status: "result", result: { success: false, error: "fixture missing", latencyMs: 1 } } }),
  );
  expect(classification.code).toBe("R4");
});

it("counts an acceptable tool as execution success", () => {
  const classification = classifyAttempt(
    record({
      acceptableTools: ["search_files"],
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
  );
  expect(classification).toMatchObject({ code: null, executionSuccess: true });
});
