import { z } from "zod";
import type { ExperimentConfig } from "../types/config.js";
import { MAX_PROVIDER_CONCURRENCY } from "./concurrency.js";

const UNPINNED_JEV_MODELS = new Set(["jev-latest", "~typesafe/jev-latest"]);

const modelRefSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
  })
  .strict();

export const experimentConfigSchema = z
  .object({
    architecture: z.enum(["baseline", "jev", "llm", "mock", "adaptive"]),
    toolspaceSize: z.number().int().positive(),
    topK: z.number().int().positive().nullable(),
    datasetPath: z.string().min(1),
    repetitions: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    seed: z.number().int(),
    agent: modelRefSchema.extend({ temperature: z.number() }).strict(),
    router: modelRefSchema.nullable(),
    escalateRouter: modelRefSchema.nullable().default(null),
    adaptivePolicyPath: z.string().min(1).nullable().default(null),
    pricingVersion: z.string().min(1),
    tracing: z.enum(["noop", "memora"]),
    /** Omit or false for full agent runs. True stops after routing and scores Recall@k only. */
    routerOnly: z.boolean().default(false),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.concurrency > MAX_PROVIDER_CONCURRENCY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["concurrency"],
        message: `must be <= ${MAX_PROVIDER_CONCURRENCY}`,
      });
    }

    rejectUnpinnedModel(config.agent.model, ["agent", "model"], ctx);
    if (config.router) rejectUnpinnedModel(config.router.model, ["router", "model"], ctx);
    if (config.escalateRouter) {
      rejectUnpinnedModel(config.escalateRouter.model, ["escalateRouter", "model"], ctx);
    }

    if (config.architecture === "baseline") {
      if (config.topK !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topK"],
          message: "must be null for baseline",
        });
      }
      if (config.router !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["router"],
          message: "must be null for baseline",
        });
      }
      if (config.escalateRouter !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["escalateRouter"],
          message: "must be null for baseline",
        });
      }
      if (config.adaptivePolicyPath !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["adaptivePolicyPath"],
          message: "must be null unless architecture is adaptive",
        });
      }
    }

    if (config.architecture === "jev" || config.architecture === "llm") {
      if (config.topK === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topK"],
          message: "is required",
        });
      } else if (config.topK > config.toolspaceSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topK"],
          message: "must be less than or equal to toolspaceSize",
        });
      }
      if (config.router === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["router"],
          message: "is required",
        });
      }
      if (config.escalateRouter !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["escalateRouter"],
          message: "must be null unless architecture is adaptive",
        });
      }
      if (config.adaptivePolicyPath !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["adaptivePolicyPath"],
          message: "must be null unless architecture is adaptive",
        });
      }
    }

    if (config.architecture === "adaptive") {
      if (config.topK === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topK"],
          message: "is required",
        });
      } else if (config.topK > config.toolspaceSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topK"],
          message: "must be less than or equal to toolspaceSize",
        });
      }
      if (config.router === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["router"],
          message: "is required (primary Jev router)",
        });
      }
      if (config.escalateRouter === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["escalateRouter"],
          message: "is required",
        });
      }
      if (config.adaptivePolicyPath === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["adaptivePolicyPath"],
          message: "is required",
        });
      }
    }

    if (
      config.architecture === "mock" &&
      config.topK !== null &&
      config.topK > config.toolspaceSize
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topK"],
        message: "must be less than or equal to toolspaceSize",
      });
    }

    if (config.architecture === "mock") {
      if (config.escalateRouter !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["escalateRouter"],
          message: "must be null unless architecture is adaptive",
        });
      }
      if (config.adaptivePolicyPath !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["adaptivePolicyPath"],
          message: "must be null unless architecture is adaptive",
        });
      }
    }
  });

function rejectUnpinnedModel(model: string, path: string[], ctx: z.RefinementCtx): void {
  if (!UNPINNED_JEV_MODELS.has(model)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: "must be a pinned model id",
  });
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function parseExperimentConfig(input: unknown): ExperimentConfig {
  const parsed = experimentConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(formatIssues(parsed.error));
  }
  return parsed.data;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join(".") || "(root)";
      return `${field}: ${issue.message}`;
    })
    .join("\n");
}
