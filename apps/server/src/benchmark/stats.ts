export interface ScoreStats {
  min: number;
  p10: number;
  median: number;
  max: number;
  mean: number;
}

/** Linear interpolation between the closest ranks, as numpy's default percentile does. */
export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? 0;

  return low + (high - low) * (position - lower);
}

export function scoreStats(scores: readonly number[]): ScoreStats {
  const sorted = [...scores].sort((a, b) => a - b);

  return {
    min: sorted[0] ?? 0,
    p10: round(percentile(sorted, 0.1)),
    median: round(percentile(sorted, 0.5)),
    max: sorted.at(-1) ?? 0,
    mean: round(mean(sorted)),
  };
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

/** Runs the tasks with at most `limit` in flight at once (BOT-24). */
export async function runPooled<T>(tasks: readonly (() => Promise<T>)[], limit: number, signal?: AbortSignal): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (!signal?.aborted) {
      const index = nextIndex++;
      const task = tasks[index];

      if (!task) {
        return;
      }

      results[index] = await task();
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));

  // Sparse when aborted early; Object.values skips the games that never ran, keeping order.
  return Object.values(results);
}
