import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadExperimentConfig } from "../../config/load.js";
import { loadDataset } from "../../dataset/schema.js";
import { resolveLiveAgent, resolveLiveRouter, runLiveSlice } from "./live.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const apiKey = "sk-live-test-secret";

it("refuses a live run when AGENT_API_KEY is missing", async () => {
  await expect(
    runLiveSlice({
      configPath: join(repoRoot, "configs/baseline-20.yaml"),
      resultsRoot: mkdtempSync(join(tmpdir(), "jev-live-")),
      env: {},
    }),
  ).rejects.toThrow(/AGENT_API_KEY/);
});

it("refuses a live Jev run when TYPESAFE_API_KEY is missing", async () => {
  await expect(
    runLiveSlice({
      configPath: join(repoRoot, "configs/jev-top5-20.yaml"),
      resultsRoot: mkdtempSync(join(tmpdir(), "jev-live-")),
      env: { AGENT_API_KEY: "sk-test" },
    }),
  ).rejects.toThrow(/TYPESAFE_API_KEY/);
});

it("does not require AGENT_API_KEY for a live router-only Jev run", async () => {
  await expect(
    runLiveSlice({
      configPath: join(repoRoot, "configs/jev-router-only-20.yaml"),
      resultsRoot: mkdtempSync(join(tmpdir(), "jev-live-")),
      env: {},
    }),
  ).rejects.toThrow(/TYPESAFE_API_KEY/);
});

it("refuses a live LLM run when AGENT_API_KEY is missing", async () => {
  await expect(
    runLiveSlice({
      configPath: join(repoRoot, "configs/llm-top5-20.yaml"),
      resultsRoot: mkdtempSync(join(tmpdir(), "jev-live-")),
      env: {},
    }),
  ).rejects.toThrow(/AGENT_API_KEY/);
});

it("resolves the same single-step agent kind for baseline, Jev, and LLM", () => {
  const env = { AGENT_API_KEY: apiKey, TYPESAFE_API_KEY: "ts-test" };
  const baseline = resolveLiveAgent(loadExperimentConfig(join(repoRoot, "configs/baseline-20.yaml")).config, env);
  const jev = resolveLiveAgent(loadExperimentConfig(join(repoRoot, "configs/jev-top5-20.yaml")).config, env);
  const llm = resolveLiveAgent(loadExperimentConfig(join(repoRoot, "configs/llm-top5-20.yaml")).config, env);
  expect(baseline.kind).toBe("single-step");
  expect(jev.kind).toBe("single-step");
  expect(llm.kind).toBe("single-step");
});

it("resolves an llm live router that ranks without tool schemas", async () => {
  const config = loadExperimentConfig(join(repoRoot, "configs/llm-top5-20.yaml")).config;
  const calls: { body: { tools?: unknown; messages: Array<{ content: string }> } }[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      tools?: unknown;
      messages: Array<{ content: string }>;
    };
    calls.push({ body });
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: '["search_email","search_files"]' } }],
        usage: { prompt_tokens: 11, completion_tokens: 3 },
      }),
      { status: 200 },
    );
  };

  const router = resolveLiveRouter(config, { AGENT_API_KEY: apiKey }, fetchImpl);
  expect(router.id).toBe("llm");
  const decision = await router.route({
    taskPrompt: "Search email for quarterly",
    tools: [
      {
        name: "search_email",
        description: "Search email",
        domain: "email",
        parameters: { type: "object", properties: { query: { type: "string" } } },
        routingSummary: "search email messages",
        nearMisses: ["search_files"],
      },
      {
        name: "search_files",
        description: "Search files",
        domain: "files",
        parameters: { type: "object", properties: { query: { type: "string" } } },
        routingSummary: "search files on disk",
        nearMisses: ["search_email"],
      },
    ],
    k: 1,
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]?.body.tools).toBeUndefined();
  expect(calls[0]?.body.messages[0]?.content).toContain("search email messages");
  expect(calls[0]?.body.messages[0]?.content).not.toContain('"type":"object"');
  expect(decision.candidates.map((candidate) => candidate.name)).toEqual(["search_email"]);
  expect(decision.scores).toBeNull();
  expect(decision.confidence).toBeNull();
});

it("runs a live LLM config offline with mocked HTTP through the shared agent", async () => {
  const task = loadDataset(join(repoRoot, "datasets/v0.1/tasks.jsonl"))[0]!;
  const required = task.required_tools[0]!;
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      tools?: Array<{ function: { name: string } }>;
      messages: Array<{ content: string }>;
    };
    if (body.tools !== undefined) {
      const name = body.tools.some((tool) => tool.function.name === required)
        ? required
        : body.tools[0]!.function.name;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name,
                      arguments: JSON.stringify(task.expected_arguments ?? {}),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 40, completion_tokens: 8 },
        }),
        { status: 200 },
      );
    }

    const toolsBlock = body.messages[0]?.content.split("\n\nTools:\n")[1] ?? "";
    const names = toolsBlock
      .split("\n")
      .map((line) => line.split(":")[0]?.trim())
      .filter((name): name is string => name !== undefined && name.length > 0);
    const ordered = names.includes(required) ? [required, ...names.filter((name) => name !== required)] : names;
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: JSON.stringify(ordered) } }],
        usage: { prompt_tokens: 25, completion_tokens: 5 },
        authorization_echo: apiKey,
      }),
      { status: 200 },
    );
  };

  const directory = await runLiveSlice({
    configPath: join(repoRoot, "configs/llm-top5-20.yaml"),
    resultsRoot: mkdtempSync(join(tmpdir(), "jev-live-llm-")),
    env: { AGENT_API_KEY: apiKey },
    tasks: [task],
    timestamp: "2026-09-23T220000Z",
    fetch: fetchImpl,
  });

  const config = JSON.parse(readFileSync(join(directory, "config.json"), "utf8")) as {
    architecture: string;
    registryHash: string;
    agent: { model: string };
    router: { model: string };
  };
  const run = JSON.parse(readFileSync(join(directory, "runs.jsonl"), "utf8")) as {
    candidates: string[];
    scores: null;
    confidence: null;
    executionSuccess: boolean;
    failureCode: string | null;
  };
  const snapshot = readFileSync(join(directory, "runs.jsonl"), "utf8");

  expect(config.architecture).toBe("llm");
  expect(config.registryHash).toMatch(/^[a-f0-9]{64}$/);
  expect(config.agent.model).toBe("gpt-5.6-sol");
  expect(config.router.model).toBe("gpt-5.6-sol");
  expect(run.candidates[0]).toBe(required);
  expect(run.scores).toBeNull();
  expect(run.confidence).toBeNull();
  expect(run.executionSuccess).toBe(true);
  expect(run.failureCode).toBeNull();
  expect(snapshot).not.toContain(apiKey);
});
