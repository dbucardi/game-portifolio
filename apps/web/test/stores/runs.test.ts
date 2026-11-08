import { http, HttpResponse } from 'msw';
import { useHighScoreStore } from '@/stores/highScore';
import { useRunsStore } from '@/stores/runs';
import { aRun, RUN_EVENTS } from '../fixtures';
import { server } from '../msw';
import { BOT_URL, createTestApp, sseResponse } from '../utils';

function setup() {
  createTestApp();

  return useRunsStore();
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

describe('runs store', () => {
  afterEach(() => {
    useRunsStore().unsubscribe();
  });
  it('lists the runs from the service', async () => {
    server.use(http.get(`${BOT_URL}/api/runs`, () => HttpResponse.json({ runs: [aRun()] })));

    const runs = setup();

    await runs.fetchRuns();
    expect(runs.status).toBe('ready');
    expect(runs.runs).toHaveLength(1);
    expect(runs.activeCount).toBe(1);
  });
  it('raises the shared high score from run scores, never lowers it (WEB-18)', async () => {
    server.use(
      http.get(`${BOT_URL}/api/runs`, () => HttpResponse.json({ runs: [aRun({ status: 'finished', stats: null, summary: null })] })),
      http.get(`${BOT_URL}/api/runs/run-1/events`, () => sseResponse(RUN_EVENTS)),
    );

    const runs = setup();
    const highScores = useHighScoreStore();

    await runs.fetchRuns();
    expect(highScores.best).toBe(0);
    runs.select('run-1');
    await vi.waitFor(() => {
      expect(highScores.best).toBe(1100);
    });
    expect(localStorage.getItem('mugloar.highScore')).toBe('1100');
    highScores.best = 5000;
    runs.unsubscribe();
    runs.select('run-1');
    await vi.waitFor(() => {
      expect(runs.activeStats).toMatchObject({ score: 1100 });
    });
    expect(highScores.best).toBe(5000);
  });
  it('is unavailable when the service cannot be reached', async () => {
    server.use(http.get(`${BOT_URL}/api/runs`, () => HttpResponse.error()));

    const runs = setup();

    await runs.fetchRuns();
    expect(runs.status).toBe('unavailable');
    expect(runs.error).toBeNull();
  });
  it('is unavailable when a proxy answers instead of the service', async () => {
    server.use(http.get(`${BOT_URL}/api/runs`, () => new HttpResponse('<html>Bad gateway</html>', { status: 500 })));

    const runs = setup();

    await runs.fetchRuns();
    expect(runs.status).toBe('unavailable');
  });
  it('starts a run and replays its events through the shared reducer', async () => {
    let requestBody: unknown;

    server.use(
      http.post(`${BOT_URL}/api/runs`, async ({ request }) => {
        requestBody = await request.json();

        return HttpResponse.json({ runId: 'run-1', gameId: 'game0001', status: 'running' }, { status: 201 });
      }),
      http.get(`${BOT_URL}/api/runs/run-1`, () => HttpResponse.json(aRun())),
      http.get(`${BOT_URL}/api/runs/run-1/events`, () => sseResponse(RUN_EVENTS)),
    );

    const runs = setup();

    await runs.startRun({ strategy: 'expected-value', maxTurns: 50 });
    expect(requestBody).toEqual({ strategy: 'expected-value', maxTurns: 50 });
    expect(runs.activeRunId).toBe('run-1');
    await vi.waitFor(() => {
      expect(runs.activeRun?.status).toBe('finished');
    });
    expect(runs.activeStats).toMatchObject({ score: 1100, turn: 2 });
    expect(runs.activeLog.map((entry) => entry.text)).toEqual([
      "Solved 'Defend the fort'  +500 gold",
      "Solved 'Escort the caravan'  +600 gold",
      'New game started',
    ]);
    expect(runs.scoreHistory.map((point) => point.score)).toEqual([0, 600, 1100]);
    expect(runs.activeRun?.summary).toEqual({ score: 1100, turns: 2, reason: 'max-turns' });
    expect(runs.live).toBe(false);
  });
  it('explains when too many runs are active', async () => {
    server.use(http.post(`${BOT_URL}/api/runs`, () => HttpResponse.json(errorBody('cap-reached', 'cap'), { status: 429 })));

    const runs = setup();

    await runs.startRun({ strategy: 'safest-first', maxTurns: 10 });
    expect(runs.error).toBe('Too many runs are active. Stop one or wait for it to finish.');
    expect(runs.starting).toBe(false);
  });
  it('reloads the run when stopping one that has already ended', async () => {
    server.use(
      http.get(`${BOT_URL}/api/runs`, () => HttpResponse.json({ runs: [aRun()] })),
      http.get(`${BOT_URL}/api/runs/run-1/events`, () => sseResponse([])),
      http.post(`${BOT_URL}/api/runs/run-1/stop`, () => HttpResponse.json(errorBody('conflict', 'ended'), { status: 409 })),
      http.get(`${BOT_URL}/api/runs/run-1`, () => HttpResponse.json(aRun({ status: 'finished' }))),
    );

    const runs = setup();

    await runs.fetchRuns();
    runs.select('run-1');
    await runs.stopRun();
    expect(runs.error).toBe('That run has already ended.');
    expect(runs.activeRun?.status).toBe('finished');
    expect(runs.canStop).toBe(false);
  });
});
