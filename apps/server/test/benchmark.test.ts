import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { calibrate, runBenchmark } from '../src/benchmark/benchmark';
import { percentile, runPooled, scoreStats } from '../src/benchmark/stats';
import { fakeGame, GAME_API, gameApi, server, testApp, useFakeNetwork } from './helpers';

useFakeNetwork();

const limits = { maxGames: 50, maxConcurrency: 3, defaultMaxTurns: 20 };

describe('benchmark statistics', () => {
  it('computes min, p10, median, max and mean', () => {
    expect(scoreStats([500, 1200, 900, 1500, 1100])).toEqual({
      min: 500,
      p10: 660,
      median: 1100,
      max: 1500,
      mean: 1040,
    });
  });
  it('interpolates percentiles and handles no data', () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
    expect(scoreStats([])).toEqual({ min: 0, p10: 0, median: 0, max: 0, mean: 0 });
  });
  it('never has more than the limit in flight (BOT-24)', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, (_, index) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;

      return index;
    });

    expect(await runPooled(tasks, 3)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBe(3);
  });
  it('records the observed success rate per label (BOT-22)', () => {
    expect(
      calibrate([
        { label: 'Gamble', success: true },
        { label: 'Gamble', success: false },
        { label: 'Piece of cake', success: true },
      ]),
    ).toEqual([
      { label: 'Piece of cake', attempts: 1, successes: 1, observedRate: 1, estimatedRate: 0.95 },
      { label: 'Gamble', attempts: 2, successes: 1, observedRate: 0.5, estimatedRate: 0.5 },
    ]);
  });
});
describe('runBenchmark (BOT-21)', () => {
  it('plays N games per strategy and reports each side by side (BOT-23)', async () => {
    fakeGame();

    const report = await runBenchmark(
      { games: 4, strategies: ['turn-phased', 'safest-first'], maxTurns: 15 },
      { api: gameApi(), limits, defaultStrategy: 'turn-phased' },
    );

    expect(report).toMatchObject({ gamesPerStrategy: 4, concurrency: 3, maxTurns: 15 });
    expect(report.strategies.map((row) => row.strategy)).toEqual(['turn-phased', 'safest-first']);

    for (const row of report.strategies) {
      expect(row).toMatchObject({
        games: 4,
        completed: 4,
        errors: [],
        endReasons: { 'max-turns': 4 },
      });
      expect(row.calibration.length).toBeGreaterThan(0);
    }
  });
  it('counts a game that fails instead of aborting the benchmark (ERR-07)', async () => {
    fakeGame();

    let starts = 0;

    server.use(
      http.post(`${GAME_API}/game/start`, () => {
        starts += 1;

        return starts === 1 ? new HttpResponse('Teapot', { status: 418 }) : undefined;
      }),
    );

    const report = await runBenchmark({ games: 3, concurrency: 1 }, { api: gameApi(), limits, defaultStrategy: 'turn-phased' });
    const [row] = report.strategies;

    expect(row).toMatchObject({ games: 3, completed: 2, reachedTarget: 2, successRate: 0.667 });
    expect(row?.errors).toHaveLength(1);
    expect(row?.endReasons).toEqual({ error: 1, 'max-turns': 2 });
  });
  it('reports the share of games that reached 1000 points (BOT-20)', async () => {
    fakeGame({
      ads: () => [{ adId: 'big', message: 'Win big', reward: 600, expiresIn: 3, probability: 'Sure thing' }],
    });

    const report = await runBenchmark({ games: 2, maxTurns: 2 }, { api: gameApi(), limits, defaultStrategy: 'turn-phased' });

    expect(report.strategies[0]).toMatchObject({ reachedTarget: 2, successRate: 1 });
  });
});
describe('POST /api/benchmarks', () => {
  it('answers with the report', async () => {
    fakeGame();

    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/benchmarks',
      payload: { games: 2, concurrency: 2, maxTurns: 3 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      gamesPerStrategy: 2,
      strategies: [{ strategy: 'turn-phased', games: 2 }],
    });
  });
  it.each([
    [{ games: 0 }, 'body.games'],
    [{ games: 2, concurrency: 99 }, 'body.concurrency'],
    [{ games: 2, strategies: ['safest-first', 'safest-first'] }, 'body.strategies'],
    [{ games: 2, strategies: ['nope'] }, 'body.strategies.0'],
  ])('rejects %j (VAL-03)', async (payload, field) => {
    const app = await testApp({ BENCH_MAX_CONCURRENCY: '4' });
    const response = await app.inject({ method: 'POST', url: '/api/benchmarks', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { details: [{ field }] } });
  });
});
