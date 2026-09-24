import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import type { DecisionProvider } from "../../providers/types.js";
import type { RankProvider } from "../llm/llm.js";
import type { ToolDefinition } from "../../types/tool.js";
import { createJevRouter } from "../jev/jev.js";
import { createLlmRouter } from "../llm/llm.js";
import { loadAdaptivePolicy } from "./policy.js";
import { createAdaptiveRouter } from "./adaptive.js";

const tools: ToolDefinition[] = [
  tool("gold", "Gold tool"),
  tool("noise_a", "Noise A"),
  tool("noise_b", "Noise B"),
  tool("noise_c", "Noise C"),
  tool("noise_d", "Noise D"),
];

describe("createAdaptiveRouter", () => {
  const policy = loadAdaptivePolicy(resolve("policies/adaptive/v1.json"));

  it("high confidence → Jev top-1 without calling the escalate router", async () => {
    const escalateCalls: string[] = [];
    const router = createAdaptiveRouter({
      policy,
      jev: createJevRouter(
        scriptedJev([
          {
            scores: { gold: 0.7, noise_a: 0.1, noise_b: 0.1, noise_c: 0.05, noise_d: 0.05 },
            confidence: 0.9,
            top1Probability: 0.7,
          },
        ]),
      ),
      escalate: createLlmRouter(scriptedRank((prompt) => {
        escalateCalls.push(prompt);
        return '["noise_a","gold"]';
      })),
    });

    const decision = await router.route({ taskPrompt: "use gold", tools, k: 5 });
    expect(router.id).toBe("adaptive");
    expect(decision.adaptive?.branch).toBe("high");
    expect(decision.adaptive?.selectedK).toBe(1);
    expect(decision.adaptive?.escalationTarget).toBeNull();
    expect(decision.candidates.map((c) => c.name)).toEqual(["gold"]);
    expect(decision.confidence).toBe(0.9);
    expect(decision.top1Probability).toBe(0.7);
    expect(decision.adaptive?.policyVersion).toBe("adaptive-policy-v1");
    expect(escalateCalls).toHaveLength(0);
    expect(decision.adaptive?.jevLatencyMs).toBeGreaterThanOrEqual(0);
    expect(decision.latencyMs).toBeGreaterThanOrEqual(decision.adaptive!.jevLatencyMs);
  });

  it("medium confidence → Jev top-5", async () => {
    const router = createAdaptiveRouter({
      policy,
      jev: createJevRouter(
        scriptedJev([
          {
            scores: { gold: 0.4, noise_a: 0.3, noise_b: 0.15, noise_c: 0.1, noise_d: 0.05 },
            confidence: 0.55,
            top1Probability: 0.4,
          },
        ]),
      ),
      escalate: createLlmRouter(scriptedRank(() => '["gold"]')),
    });

    const decision = await router.route({ taskPrompt: "use gold", tools, k: 5 });
    expect(decision.adaptive?.branch).toBe("medium");
    expect(decision.adaptive?.selectedK).toBe(5);
    expect(decision.adaptive?.escalationTarget).toBeNull();
    expect(decision.candidates).toHaveLength(5);
    expect(decision.candidates[0]?.name).toBe("gold");
  });

  it("low confidence → escalate to LLM top-k and record target", async () => {
    const router = createAdaptiveRouter({
      policy,
      jev: createJevRouter(
        scriptedJev([
          {
            scores: { noise_a: 0.5, gold: 0.2, noise_b: 0.15, noise_c: 0.1, noise_d: 0.05 },
            confidence: 0.2,
            top1Probability: 0.5,
          },
        ]),
      ),
      escalate: createLlmRouter(
        scriptedRank(() => '["gold","noise_a","noise_b","noise_c","noise_d"]', {
          inputTokens: 11,
          outputTokens: 3,
        }),
      ),
    });

    const decision = await router.route({ taskPrompt: "use gold", tools, k: 5 });
    expect(decision.adaptive?.branch).toBe("low");
    expect(decision.adaptive?.selectedK).toBe(5);
    expect(decision.adaptive?.escalationTarget).toBe("llm_topk");
    expect(decision.candidates[0]?.name).toBe("gold");
    expect(decision.confidence).toBe(0.2);
    expect(decision.scores).not.toBeNull(); // keep Jev scores
    expect(decision.adaptive?.escalateUsage).toEqual({ inputTokens: 11, outputTokens: 3 });
    expect(decision.usage.inputTokens).toBeGreaterThan(0);
    expect(decision.adaptive?.escalateLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("throws (R0 path) when the escalate provider fails", async () => {
    const router = createAdaptiveRouter({
      policy,
      jev: createJevRouter(
        scriptedJev([
          {
            scores: { noise_a: 0.5, gold: 0.2, noise_b: 0.15, noise_c: 0.1, noise_d: 0.05 },
            confidence: 0.1,
            top1Probability: 0.5,
          },
        ]),
      ),
      escalate: createLlmRouter({
        async rank() {
          throw new Error("escalate down");
        },
      }),
    });

    await expect(router.route({ taskPrompt: "use gold", tools, k: 5 })).rejects.toThrow(/escalate down/);
  });

  it("throws when Jev confidence is missing (cannot branch)", async () => {
    const router = createAdaptiveRouter({
      policy,
      jev: createJevRouter(
        scriptedJev([
          {
            scores: { gold: 1 },
            confidence: null,
            top1Probability: 1,
          },
        ]),
      ),
      escalate: createLlmRouter(scriptedRank(() => '["gold"]')),
    });
    await expect(router.route({ taskPrompt: "use gold", tools, k: 5 })).rejects.toThrow(/confidence/);
  });
});

function tool(name: string, summary: string): ToolDefinition {
  return {
    name,
    description: summary,
    domain: "test",
    parameters: { type: "object", properties: {} },
    routingSummary: summary,
    nearMisses: [],
  };
}

function scriptedJev(
  turns: Array<{
    scores: Record<string, number>;
    confidence: number | null;
    top1Probability: number | null;
  }>,
): DecisionProvider {
  let index = 0;
  return {
    async decide() {
      const turn = turns[index++];
      if (!turn) throw new Error("unexpected jev call");
      return {
        scores: turn.scores,
        confidence: turn.confidence,
        top1Probability: turn.top1Probability,
        usage: { inputTokens: 5, outputTokens: 2 },
        raw: { scripted: true },
      };
    },
  };
}

function scriptedRank(
  text: string | ((prompt: string) => string),
  usage: { inputTokens: number; outputTokens: number } = { inputTokens: 7, outputTokens: 2 },
): RankProvider {
  return {
    async rank(request) {
      return {
        text: typeof text === "function" ? text(request.prompt) : text,
        usage,
        raw: { scripted: true },
      };
    },
  };
}
