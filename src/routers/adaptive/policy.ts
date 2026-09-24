import { readFileSync } from "node:fs";
import { z } from "zod";

const branchActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("jev_topk"), k: z.number().int().positive() }).strict(),
  z
    .object({
      type: z.literal("escalate"),
      target: z.literal("llm_topk"),
      k: z.number().int().positive(),
    })
    .strict(),
]);

const adaptivePolicySchema = z
  .object({
    version: z.string().min(1),
    status: z.literal("thresholds_locked"),
    confidence_field: z.literal("confidence"),
    never_use_top1_probability_as_confidence: z.literal(true),
    branches: z
      .array(
        z
          .object({
            id: z.enum(["high", "medium", "low"]),
            description: z.string().min(1),
            action: branchActionSchema,
          })
          .strict(),
      )
      .min(3),
    thresholds: z
      .object({
        T_low: z.number().positive(),
        T_high: z.number().positive(),
      })
      .strict(),
    threshold_source: z.unknown().optional(),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (!(policy.thresholds.T_low < policy.thresholds.T_high)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["thresholds"],
        message: "T_low must be < T_high",
      });
    }
    const ids = new Set(policy.branches.map((branch) => branch.id));
    for (const id of ["high", "medium", "low"] as const) {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["branches"],
          message: `missing branch ${id}`,
        });
      }
    }
  });

export type AdaptivePolicy = z.infer<typeof adaptivePolicySchema>;
export type AdaptiveBranch = AdaptivePolicy["branches"][number];

export class AdaptivePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdaptivePolicyError";
  }
}

export function loadAdaptivePolicy(path: string): AdaptivePolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new AdaptivePolicyError(
      `failed to read adaptive policy ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = adaptivePolicySchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new AdaptivePolicyError(`invalid adaptive policy ${path}: ${detail}`);
  }
  return parsed.data;
}

/** Branch from provider confidence only (D4 — never top1Probability). */
export function branchForConfidence(confidence: number, policy: AdaptivePolicy): AdaptiveBranch {
  const { T_low, T_high } = policy.thresholds;
  const id = confidence >= T_high ? "high" : confidence >= T_low ? "medium" : "low";
  const branch = policy.branches.find((entry) => entry.id === id);
  if (!branch) throw new AdaptivePolicyError(`policy missing branch ${id}`);
  return branch;
}
