import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GameApiClient } from '../src/api/client';
import { ApiError, GameOverError, NotFoundError } from '../src/api/errors';
import { createFakeGameApi } from '../src/testing';

const BASE = 'https://game.test/api/v2';
const fake = createFakeGameApi({ baseUrl: BASE });
const server = setupServer(...fake.handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  fake.reset();
});
afterAll(() => {
  server.close();
});

const client = (overrides = {}) => new GameApiClient({ baseUrl: BASE, retryBaseDelayMs: 0, timeoutMs: 200, ...overrides });

describe('GameApiClient against the fake game API', () => {
  it('starts a game and reads ads with a coerced reward (VAL-02)', async () => {
    const api = client();
    const game = await api.startGame();

    expect(game).toMatchObject({ lives: 3, gold: 0, turn: 0 });

    const ads = await api.getAds(game.gameId);

    expect(ads.find((ad) => ad.adId === 'ad-park')?.reward).toBe(41);
  });
  it('solves an ad and buys an item', async () => {
    const api = client();
    const { gameId } = await api.startGame();
    const solved = await api.solve(gameId, 'ad-safe');

    expect(solved).toMatchObject({ success: true, gold: 72, turn: 1 });

    const bought = await api.buy(gameId, 'hpot');

    expect(bought).toMatchObject({ shoppingSuccess: true, gold: 22, lives: 4, turn: 2 });
  });
});
describe('reputation (API-06)', () => {
  it('reads the three reputation values and uses up a turn', async () => {
    const api = client();
    const { gameId } = await api.startGame();

    const game = fake.games.get(gameId);

    if (game) {
      game.reputation = { people: 2, state: -1, underworld: 0 };
    }

    expect(await api.investigateReputation(gameId)).toEqual({ people: 2, state: -1, underworld: 0 });
    expect(fake.games.get(gameId)?.turn).toBe(1);
  });
});
describe('error mapping (ERR-01)', () => {
  it('maps a 400 text body to bad-request', async () => {
    const api = client();
    const { gameId } = await api.startGame();
    const error = await api.solve(gameId, 'nope').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: 'bad-request',
      status: 400,
      body: 'No ad by this ID exists',
    });
  });
  it('maps a 404 to NotFoundError', async () => {
    await expect(client().getAds('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
  it('maps 410 Game Over to GameOverError', async () => {
    server.use(http.get(`${BASE}/:gameId/messages`, () => HttpResponse.json({ status: 'Game Over' }, { status: 410 })));

    const error = await client()
      .getAds('g')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GameOverError);
    expect(error).toMatchObject({ kind: 'game-over' });
  });
  it('rejects a malformed response (VAL-01)', async () => {
    server.use(http.post(`${BASE}/game/start`, () => HttpResponse.json({ gameId: 'x', lives: 'many' })));
    await expect(client().startGame()).rejects.toMatchObject({ kind: 'invalid-response' });
  });
  it('rejects a non-JSON success body', async () => {
    server.use(http.post(`${BASE}/game/start`, () => new HttpResponse('<html>ok</html>', { status: 200 })));
    await expect(client().startGame()).rejects.toMatchObject({ kind: 'invalid-response' });
  });
});
describe('retries (ERR-03) and timeout (ERR-02)', () => {
  it('retries a 5xx and then succeeds', async () => {
    let calls = 0;

    server.use(
      http.get(`${BASE}/:gameId/shop`, () => {
        calls += 1;

        return calls < 3 ? new HttpResponse('Bad gateway', { status: 502 }) : HttpResponse.json([]);
      }),
    );
    await expect(client({ retries: 2 }).getShop('g')).resolves.toEqual([]);
    expect(calls).toBe(3);
  });
  it('gives up after the retry budget', async () => {
    let calls = 0;

    server.use(
      http.get(`${BASE}/:gameId/shop`, () => {
        calls += 1;

        return new HttpResponse('down', { status: 503 });
      }),
    );
    await expect(client({ retries: 1 }).getShop('g')).rejects.toMatchObject({
      kind: 'server',
      status: 503,
    });
    expect(calls).toBe(2);
  });
  it('retries a network error', async () => {
    let calls = 0;

    server.use(
      http.get(`${BASE}/:gameId/shop`, () => {
        calls += 1;

        return calls === 1 ? HttpResponse.error() : HttpResponse.json([]);
      }),
    );
    await expect(client().getShop('g')).resolves.toEqual([]);
    expect(calls).toBe(2);
  });
  it('does not retry a 4xx', async () => {
    let calls = 0;

    server.use(
      http.get(`${BASE}/:gameId/shop`, () => {
        calls += 1;

        return new HttpResponse('bad', { status: 400 });
      }),
    );
    await expect(client().getShop('g')).rejects.toMatchObject({ kind: 'bad-request' });
    expect(calls).toBe(1);
  });
  it('times out a request that never answers', async () => {
    server.use(http.get(`${BASE}/:gameId/shop`, () => new Promise<never>(() => undefined)));
    await expect(client({ retries: 0, timeoutMs: 50 }).getShop('g')).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
  it('does not replay a POST that timed out', async () => {
    let calls = 0;

    server.use(
      http.post(`${BASE}/:gameId/solve/:adId`, () => {
        calls += 1;

        return new Promise<never>(() => undefined);
      }),
    );
    await expect(client({ retries: 2, timeoutMs: 50 }).solve('g', 'a')).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(calls).toBe(1);
  });
});
