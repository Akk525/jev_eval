import { MAX_PROVIDER_CONCURRENCY } from "../../config/concurrency.js";

export { MAX_PROVIDER_CONCURRENCY };

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrencyError";
  }
}

/**
 * Run `worker` over `items` with at most `concurrency` in flight.
 * Items are claimed in index order; completion order is not guaranteed.
 * Rejects on the first worker failure; in-flight workers may still finish.
 */
export async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new ConcurrencyError(`concurrency must be a positive integer, got ${concurrency}`);
  }
  if (items.length === 0) return;

  const limit = Math.min(concurrency, items.length);
  let nextIndex = 0;
  let firstError: unknown;

  async function runWorker(): Promise<void> {
    while (firstError === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index] as T, index);
      } catch (error) {
        firstError ??= error;
        throw error;
      }
    }
  }

  const results = await Promise.allSettled(Array.from({ length: limit }, () => runWorker()));
  if (firstError !== undefined) throw firstError;
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
}

/** Serialize async/sync critical sections (result appends). */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
