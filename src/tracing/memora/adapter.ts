import type { TraceEvent } from "../../types/trace.js";
import type { TraceHandle, Tracer } from "../tracer.js";

export interface MemoraRecordClient {
  recordEvent(
    runId: string,
    type: string,
    data: unknown,
    parentIds?: readonly string[],
  ): Promise<void>;
}

export interface RecordedMemoraEvent {
  runId: string;
  type: string;
  data: unknown;
  parentIds: readonly string[];
}

export interface MemoraTracerOptions {
  client: MemoraRecordClient;
  /** Secrets stripped from every payload before recordEvent. */
  secrets?: readonly string[];
  onError?: (error: unknown) => void;
}

/**
 * Best-effort Memora mirror. Failures are logged and swallowed.
 * Uses recordEvent under the benchmark run id. Does not call memora.tool().
 */
export function createMemoraTracer(options: MemoraTracerOptions): Tracer {
  const secrets = options.secrets ?? [];
  const onError = options.onError ?? ((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`memora mirror failed: ${message}`);
  });

  return {
    async startRun(meta: { runId: string }): Promise<TraceHandle> {
      await safeRecord(options.client, meta.runId, "run_started", { runId: meta.runId }, [], secrets, onError);
      return { runId: meta.runId };
    },

    async event(handle: TraceHandle, event: TraceEvent): Promise<void> {
      await safeRecord(
        options.client,
        handle.runId,
        event.type,
        event,
        [handle.runId],
        secrets,
        onError,
      );
    },

    async endRun(handle: TraceHandle, status: "completed" | "failed"): Promise<void> {
      await safeRecord(
        options.client,
        handle.runId,
        "run_ended",
        { status },
        [handle.runId],
        secrets,
        onError,
      );
    },
  };
}

/**
 * Returns a Memora tracer when credentials are present. Otherwise null.
 * The live SDK is loaded only when keys exist, so CI stays free of Memora.
 */
export function createMemoraTracerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Tracer | null {
  const apiKey = env.MEMORA_API_KEY?.trim() ?? "";
  const agentId = env.MEMORA_AGENT_ID?.trim() ?? "";
  if (apiKey === "" || agentId === "") return null;
  return createMemoraTracer({
    client: lazySdkClient(apiKey, agentId),
    secrets: [apiKey, agentId],
  });
}

export function sanitizeTracePayload(value: unknown, secrets: readonly string[]): unknown {
  let text = JSON.stringify(value);
  for (const secret of secrets) {
    if (secret === "") continue;
    text = text.split(secret).join("[redacted]");
  }
  text = text.replace(/Bearer\s+[A-Za-z0-9._\-+=\/]+/gi, "Bearer [redacted]");
  return JSON.parse(text) as unknown;
}

async function safeRecord(
  client: MemoraRecordClient,
  runId: string,
  type: string,
  data: unknown,
  parentIds: readonly string[],
  secrets: readonly string[],
  onError: (error: unknown) => void,
): Promise<void> {
  try {
    await client.recordEvent(runId, type, sanitizeTracePayload(data, secrets), parentIds);
  } catch (error) {
    onError(error);
  }
}

function lazySdkClient(apiKey: string, agentId: string): MemoraRecordClient {
  let loaded: MemoraRecordClient | null = null;
  return {
    async recordEvent(runId, type, data, parentIds) {
      if (loaded === null) loaded = await loadSdkClient(apiKey, agentId);
      await loaded.recordEvent(runId, type, data, parentIds);
    },
  };
}

async function loadSdkClient(apiKey: string, agentId: string): Promise<MemoraRecordClient> {
  const moduleName = "@memora-hq/memora-core";
  const load = new Function("name", "return import(name)") as (name: string) => Promise<{
    Memora?: new (config: { agentId: string; apiKey: string }) => {
      client?: {
        write(input: {
          agentId: string;
          contentType: string;
          content: unknown;
          lineage: {
            mission_id: string;
            event_type: string;
            parent_ids: string[];
            actor_type: string;
          };
        }): Promise<unknown>;
      };
    };
  }>;
  const imported = await load(moduleName);
  if (imported.Memora === undefined) throw new Error("memora sdk missing Memora export");
  const memora = new imported.Memora({ agentId, apiKey });
  const write = memora.client?.write?.bind(memora.client);
  if (write === undefined) throw new Error("memora sdk missing client.write");
  return {
    async recordEvent(runId, type, data, parentIds) {
      await write({
        agentId,
        contentType: "application/json",
        content: { event_type: type, data },
        lineage: {
          mission_id: runId,
          event_type: type,
          parent_ids: [...(parentIds ?? [])],
          actor_type: "agent",
        },
      });
    },
  };
}
