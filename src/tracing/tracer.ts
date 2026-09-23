import type { TraceEvent } from "../types/trace.js";

export interface TraceHandle {
  runId: string;
}

export interface Tracer {
  startRun(meta: { runId: string }): Promise<TraceHandle>;
  event(handle: TraceHandle, event: TraceEvent): Promise<void>;
  endRun(handle: TraceHandle, status: "completed" | "failed"): Promise<void>;
}

export class NoopTracer implements Tracer {
  async startRun(meta: { runId: string }): Promise<TraceHandle> {
    return { runId: meta.runId };
  }

  async event(_handle: TraceHandle, _event: TraceEvent): Promise<void> {}

  async endRun(_handle: TraceHandle, _status: "completed" | "failed"): Promise<void> {}
}
