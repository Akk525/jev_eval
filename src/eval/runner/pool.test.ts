import { describe, expect, it } from "vitest";
import { AsyncMutex, MAX_PROVIDER_CONCURRENCY, mapPool } from "./pool.js";

describe("mapPool", () => {
  it("never exceeds the concurrency bound", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const started: number[] = [];

    await mapPool([0, 1, 2, 3, 4, 5], 2, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
    });

    expect(maxInFlight).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("rejects a non-positive concurrency", async () => {
    await expect(mapPool([1], 0, async () => {})).rejects.toThrow(/positive/);
  });

  it("surfaces the first worker failure", async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);
  });
});

describe("AsyncMutex", () => {
  it("runs critical sections without overlap", async () => {
    const mutex = new AsyncMutex();
    const order: string[] = [];
    await Promise.all([
      mutex.run(async () => {
        order.push("a-start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        order.push("a-end");
      }),
      mutex.run(async () => {
        order.push("b-start");
        order.push("b-end");
      }),
    ]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });
});

it("documents the provider concurrency cap", () => {
  expect(MAX_PROVIDER_CONCURRENCY).toBe(8);
});
