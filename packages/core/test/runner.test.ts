import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GameApiClient } from '../src/api/client';
import type { GameEvent } from '../src/events';
import { MAX_REJECTED_MOVES, playGame } from '../src/runner';
import { ExpectedValueStrategy } from '../src/strategy';
import { createFakeGameApi, type FakeGameOptions } from '../src/testing';

const BASE = 'https://game.test/api/v2';
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

function setup(options: FakeGameOptions = {}) {
  const fake = createFakeGameApi({ baseUrl: BASE, ...options });

  server.use(...fake.handlers);

  const api = new GameApiClient({ baseUrl: BASE, retryBaseDelayMs: 0, timeoutMs: 500 });
  const events: GameEvent[] = [];

  return { fake, api, events, onEvent: (event: GameEvent) => events.push(event) };
}

describe('playGame (TEST-03)', () => {
  it('plays until lives run out and ends with game over (BOT-06)', async () => {
    const { api, events, onEvent } = setup({ solveSucceeds: () => false });
    const result = await playGame(api, new ExpectedValueStrategy(), { maxTurns: 100, onEvent });

    expect(result).toMatchObject({ reason: 'no-lives', stats: { lives: 0, turn: 3 } });
    expect(events.map((event) => event.type)).toEqual(['started', 'failed', 'failed', 'failed', 'gameOver']);
  });
  it('stops at the turn limit with a clear reason (BOT-07)', async () => {
    const { api, events, onEvent } = setup();
    const result = await playGame(api, new ExpectedValueStrategy(), { maxTurns: 5, onEvent });

    expect(result.reason).toBe('max-turns');
    expect(result.stats.turn).toBe(5);
    expect(events.at(-1)).toMatchObject({ type: 'gameOver', reason: 'max-turns' });
  });
  it('takes state from the API responses (BOT-08)', async () => {
    const { api, fake, onEvent } = setup();
    const result = await playGame(api, new ExpectedValueStrategy(), { maxTurns: 10, onEvent });
    const { ads: _ads, reputation: _reputation, gameId: _gameId, ...serverState } = fake.games.get(result.gameId) ?? {};

    expect(result.stats).toEqual(serverState);
  });
  it('buys a potion before solving when lives are low (BOT-05)', async () => {
    let solves = 0;
    const { api, events, onEvent } = setup({ solveSucceeds: () => solves++ % 2 === 0 });

    await playGame(api, new ExpectedValueStrategy({ potionThreshold: 2 }), {
      maxTurns: 20,
      onEvent,
    });
    expect(events).toContainEqual(expect.objectContaining({ type: 'bought', itemId: 'hpot', success: true }));
  });
  it('recovers from a transient error (ERR-03)', async () => {
    const { api, onEvent } = setup();
    let failures = 1;

    server.use(
      http.get(`${BASE}/:gameId/messages`, () => {
        if (failures-- > 0) {
          return new HttpResponse('Service unavailable', { status: 503 });
        }

        return undefined;
      }),
    );

    const result = await playGame(api, new ExpectedValueStrategy(), { maxTurns: 3, onEvent });

    expect(result.reason).toBe('max-turns');
  });
  it('stops cooperatively between actions (BOT-12)', async () => {
    const { api, events } = setup();
    const controller = new AbortController();
    const result = await playGame(api, new ExpectedValueStrategy(), {
      maxTurns: 100,
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event);

        if (event.type === 'solved') {
          controller.abort();
        }
      },
    });

    expect(result).toMatchObject({ reason: 'stopped', stats: { turn: 1 } });
    expect(events.map((event) => event.type)).toEqual(['started', 'solved']);
  });
  it('treats a 410 mid-game as game over, not an error (ERR-06)', async () => {
    const { api, onEvent } = setup();

    server.use(http.post(`${BASE}/:gameId/solve/:adId`, () => HttpResponse.json({ status: 'Game Over' }, { status: 410 })));

    const result = await playGame(api, new ExpectedValueStrategy(), { maxTurns: 10, onEvent });

    expect(result.reason).toBe('no-lives');
  });
  it('refetches ads after a rejected move, then gives up if it keeps happening', async () => {
    const { api, onEvent } = setup();
    let rejections = 0;

    server.use(
      http.post(`${BASE}/:gameId/solve/:adId`, () => {
        rejections += 1;

        return new HttpResponse('No ad by this ID exists', { status: 400 });
      }),
    );
    await expect(playGame(api, new ExpectedValueStrategy(), { maxTurns: 10, onEvent })).rejects.toMatchObject({ kind: 'bad-request' });
    expect(rejections).toBe(MAX_REJECTED_MOVES);
  });
  it('fails when the game offers no ads instead of looping forever', async () => {
    const { api, onEvent } = setup({ ads: () => [] });

    await expect(playGame(api, new ExpectedValueStrategy(), { maxTurns: 10, onEvent })).rejects.toThrow(/no ads/);
  });
  it('skips ads with an unknown encryption flag (CORE-03)', async () => {
    const skipped: string[] = [];
    const { api, onEvent } = setup({
      ads: () => [
        {
          adId: 'weird',
          message: '???',
          reward: 999,
          expiresIn: 1,
          encrypted: 99,
          probability: 'x',
        },
        {
          adId: 'ok',
          message: 'Fine',
          reward: 10,
          expiresIn: 3,
          encrypted: null,
          probability: 'Piece of cake',
        },
      ],
    });

    await playGame(api, new ExpectedValueStrategy(), {
      maxTurns: 1,
      onEvent,
      onSkippedAd: (id) => skipped.push(id),
    });
    expect(skipped).toEqual(['weird']);
  });
});
