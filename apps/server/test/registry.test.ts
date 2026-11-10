import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it } from 'vitest';
import { RunRegistry, type RunRegistryOptions } from '../src/runs/registry';
import { fakeGame, gameApi, holdSolves, onCleanup, useFakeNetwork, waitFor } from './helpers';

useFakeNetwork();

const silent = {
  child: () => silent,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

function registry(overrides: Partial<RunRegistryOptions> = {}) {
  const runs = new RunRegistry({
    api: gameApi(),
    logger: silent,
    defaultStrategy: 'turn-phased',
    defaultMaxTurns: 3,
    maxActiveRuns: 2,
    ttlMs: 60_000,
    ...overrides,
  });

  onCleanup(() => runs.close());

  return runs;
}

describe('RunRegistry', () => {
  it('forgets ended runs after the TTL (BOT-17)', async () => {
    fakeGame();

    const runs = registry({ ttlMs: 20 });
    const { runId } = await runs.start({ maxTurns: 1 });

    await waitFor(() => runs.get(runId).status === 'finished');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(() => runs.get(runId)).toThrow(/does not exist/);
    expect(runs.list()).toEqual([]);
  });
  it('counts runs still starting against the cap (BOT-15)', async () => {
    fakeGame();
    holdSolves();

    const runs = registry({ maxActiveRuns: 2 });
    const results = await Promise.allSettled([runs.start({}), runs.start({}), runs.start({})]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    expect(runs.activeCount).toBe(2);
  });
  it('frees a slot when a run ends', async () => {
    fakeGame();

    const runs = registry({ maxActiveRuns: 1 });
    const first = await runs.start({ maxTurns: 1 });

    await waitFor(() => runs.get(first.runId).status === 'finished');
    await expect(runs.start({ maxTurns: 1 })).resolves.toMatchObject({ status: 'running' });
  });
  it('sends live events to subscribers and stops after the run ends (Observer)', async () => {
    fakeGame();

    const { release } = holdSolves();
    const runs = registry();
    const { runId } = await runs.start({ maxTurns: 2 });
    const received: string[] = [];
    const subscription = runs.subscribe(runId, ({ event }) => received.push(event.type));

    expect(subscription.history.map(({ event }) => event.type)).toEqual(['started']);
    expect(subscription.ended).toBe(false);
    release();
    await waitFor(() => runs.get(runId).status === 'finished');
    expect(received).toEqual(['solved', 'bought', 'solved', 'gameOver', 'status']);
  });
  it('stops every active run on close', async () => {
    fakeGame();

    const { release } = holdSolves();
    const runs = registry();

    await runs.start({});

    const closing = runs.close();

    release();
    await expect(closing).resolves.toBeUndefined();
    expect(runs.list()).toEqual([]);
  });
});
