import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { TraceEvent } from "../types/trace.js";
import { NoopTracer, type TraceHandle, type Tracer } from "./tracer.js";

it("accepts every event without throwing", async () => {
  const tracer = new NoopTracer();
  const handle = await tracer.startRun({ runId: "run_1" });
  await tracer.event(handle, { type: "task_started", taskId: "task_0001", repetition: 0, toolspace: [] });
  await tracer.event(handle, { type: "run_failed", message: "stopped" });
  await tracer.endRun(handle, "failed");
});

it("does not import Memora", () => {
  const source = readFileSync(new URL("./tracer.ts", import.meta.url), "utf8");
  expect(source).not.toContain("@memora-hq/memora-core");
});

it("a recording fake preserves event order", async () => {
  const tracer = new RecordingTracer();
  const handle = await tracer.startRun({ runId: "run_1" });
  const first: TraceEvent = { type: "task_started", taskId: "task_0001", repetition: 0, toolspace: ["search_email"] };
  const second: TraceEvent = { type: "run_failed", message: "stopped" };
  await tracer.event(handle, first);
  await tracer.event(handle, second);
  await tracer.endRun(handle, "failed");
  expect(tracer.events).toEqual([first, second]);
  expect(tracer.statuses).toEqual(["failed"]);
});

class RecordingTracer implements Tracer {
  readonly events: TraceEvent[] = [];
  readonly statuses: Array<"completed" | "failed"> = [];

  async startRun(meta: { runId: string }): Promise<TraceHandle> {
    return { runId: meta.runId };
  }

  async event(_handle: TraceHandle, event: TraceEvent): Promise<void> {
    this.events.push(event);
  }

  async endRun(_handle: TraceHandle, status: "completed" | "failed"): Promise<void> {
    this.statuses.push(status);
  }
}
