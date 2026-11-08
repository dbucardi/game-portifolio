import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fakeGame, GAME_API, holdSolves, parseSse, server, testApp, useFakeNetwork, waitFor } from './helpers';

useFakeNetwork();

type App = Awaited<ReturnType<typeof testApp>>;

async function startRun(app: App, body: object = {}) {
  const response = await app.inject({ method: 'POST', url: '/api/runs', payload: body });

  return { response, body: response.json<{ runId: string; gameId: string; status: string }>() };
}

async function getRun(app: App, runId: string) {
  return (await app.inject({ method: 'GET', url: `/api/runs/${runId}` })).json<{
    status: string;
    summary: { score: number; turns: number; reason: string } | null;
  }>();
}

async function waitForStatus(app: App, runId: string, status: string) {
  return waitFor(async () => (await getRun(app, runId)).status === status).then(() => getRun(app, runId));
}

describe('POST /api/runs (BOT-11)', () => {
  it('returns the run and game ids while the game keeps playing', async () => {
    fakeGame();
    holdSolves();

    const app = await testApp();
    const { response, body } = await startRun(app, { strategy: 'safest-first', maxTurns: 10 });

    expect(response.statusCode).toBe(201);
    expect(body).toEqual({ runId: expect.any(String), gameId: 'game0001', status: 'running' });
    expect(await getRun(app, body.runId)).toMatchObject({
      status: 'running',
      strategy: 'safest-first',
      maxTurns: 10,
    });
  });
  it('accepts an empty body and uses the defaults', async () => {
    fakeGame();
    holdSolves();

    const app = await testApp({ MAX_TURNS: '42' });
    const response = await app.inject({ method: 'POST', url: '/api/runs' });

    expect(response.statusCode).toBe(201);

    const run = await getRun(app, response.json<{ runId: string }>().runId);

    expect(run).toMatchObject({ strategy: 'expected-value', maxTurns: 42 });
  });
  it('rejects invalid input with a message per field (VAL-03)', async () => {
    const app = await testApp();
    const { response, body } = await startRun(app, { strategy: 'yolo', maxTurns: 0 });

    expect(response.statusCode).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: 'invalid',
        details: [
          { field: 'body.strategy', message: expect.any(String) },
          { field: 'body.maxTurns', message: 'Enter a whole number from 1 to 5000.' },
        ],
      },
    });
  });
  it('rejects malformed JSON with 400', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'invalid' } });
  });
  it('refuses a run beyond the active cap with 429 (BOT-15)', async () => {
    fakeGame();
    holdSolves();

    const app = await testApp({ MAX_ACTIVE_RUNS: '1' });

    await startRun(app);

    const { response, body } = await startRun(app);

    expect(response.statusCode).toBe(429);
    expect(body).toMatchObject({ error: { code: 'cap-reached' } });
  });
  it('answers 502 when the game API cannot start a game', async () => {
    server.use(http.post(`${GAME_API}/game/start`, () => new HttpResponse('Bad gateway', { status: 503 })));

    const app = await testApp();
    const { response, body } = await startRun(app);

    expect(response.statusCode).toBe(502);
    expect(body).toMatchObject({ error: { code: 'game-api' } });
  });
});
describe('GET /api/runs and /api/runs/:id (BOT-13)', () => {
  it('lists runs and reports the summary once a run ends', async () => {
    fakeGame();

    const app = await testApp();
    const { body } = await startRun(app, { maxTurns: 3 });
    const run = await waitForStatus(app, body.runId, 'finished');

    expect(run.summary).toEqual({ score: expect.any(Number), turns: 3, reason: 'max-turns' });

    const list = await app.inject({ method: 'GET', url: '/api/runs' });

    expect(list.json()).toEqual({ runs: [expect.objectContaining({ runId: body.runId })] });
  });
  it('answers 404 for an unknown run and 400 for a malformed id', async () => {
    const app = await testApp();
    const missing = await app.inject({ method: 'GET', url: `/api/runs/${randomUUID()}` });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'not-found' } });

    const malformed = await app.inject({ method: 'GET', url: '/api/runs/abc' });

    expect(malformed.statusCode).toBe(400);
  });
  it('marks a run that throws as failed and keeps serving (ERR-04)', async () => {
    fakeGame();
    server.use(http.post(`${GAME_API}/:gameId/solve/:adId`, () => new HttpResponse('No ad by this ID exists', { status: 400 })));

    const app = await testApp();
    const { body } = await startRun(app);
    const run = await waitForStatus(app, body.runId, 'failed');

    expect(run.summary?.reason).toMatch(/returned 400/);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});
describe('POST /api/runs/:id/stop (BOT-12)', () => {
  it('stops a running run after its current call', async () => {
    fakeGame();

    const { release } = holdSolves();
    const app = await testApp();
    const { body } = await startRun(app);
    const stop = await app.inject({ method: 'POST', url: `/api/runs/${body.runId}/stop` });

    expect(stop.statusCode).toBe(202);
    expect(stop.json()).toEqual({ runId: body.runId, status: 'stopping' });
    release();

    const run = await waitForStatus(app, body.runId, 'stopped');

    expect(run.summary).toMatchObject({ reason: 'stopped', turns: 1 });
  });
  it('answers 409 for a run that has already ended', async () => {
    fakeGame();

    const app = await testApp();
    const { body } = await startRun(app, { maxTurns: 1 });

    await waitForStatus(app, body.runId, 'finished');

    const stop = await app.inject({ method: 'POST', url: `/api/runs/${body.runId}/stop` });

    expect(stop.statusCode).toBe(409);
    expect(stop.json()).toMatchObject({ error: { code: 'conflict' } });
  });
  it('answers 404 for an unknown run', async () => {
    const app = await testApp();
    const stop = await app.inject({ method: 'POST', url: `/api/runs/${randomUUID()}/stop` });

    expect(stop.statusCode).toBe(404);
  });
});
describe('GET /api/runs/:id/events (BOT-14)', () => {
  it('replays the history of an ended run and closes the stream', async () => {
    fakeGame();

    const app = await testApp();
    const { body } = await startRun(app, { maxTurns: 2 });

    await waitForStatus(app, body.runId, 'finished');

    const response = await app.inject({ method: 'GET', url: `/api/runs/${body.runId}/events` });

    expect(response.headers['content-type']).toMatch(/text\/event-stream/);

    const types = parseSse(response.body).map(({ event }) => event.type);

    expect(types).toEqual(['started', 'solved', 'solved', 'gameOver', 'status']);
  });
  it('sends only what a reconnecting client missed (Last-Event-ID)', async () => {
    fakeGame();

    const app = await testApp();
    const { body } = await startRun(app, { maxTurns: 2 });

    await waitForStatus(app, body.runId, 'finished');

    const response = await app.inject({
      method: 'GET',
      url: `/api/runs/${body.runId}/events`,
      headers: { 'last-event-id': '2' },
    });

    expect(parseSse(response.body).map(({ id }) => id)).toEqual([3, 4]);
  });
  it('streams live events while the run plays', async () => {
    fakeGame();

    const { release } = holdSolves();
    const app = await testApp();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const { body } = await startRun(app, { maxTurns: 2 });
    const response = await fetch(`${address}/api/runs/${body.runId}/events`);

    if (!response.body) {
      throw new Error('Expected a streamed body');
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = (await reader.read()).value ?? '';

    expect(parseSse(text).map(({ event }) => event.type)).toEqual(['started']);
    release();

    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      text += chunk.value;
    }

    expect(parseSse(text).at(-1)?.event).toMatchObject({ type: 'status', status: 'finished' });
  });
  it('answers 404 as JSON for an unknown run', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: `/api/runs/${randomUUID()}/events` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'not-found' } });
  });
});
describe('the rest of the service', () => {
  it('answers unknown routes with the JSON error shape (ERR-08)', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'not-found' } });
  });
  it('allows cross-origin calls (BOT-19)', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
