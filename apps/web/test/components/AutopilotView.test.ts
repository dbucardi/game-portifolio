import { screen } from '@testing-library/vue';
import { http, HttpResponse } from 'msw';
import AutopilotView from '@/views/AutopilotView.vue';
import { aRun, RUN_EVENTS } from '../fixtures';
import { server } from '../msw';
import { BOT_URL, renderWithPlugins, sseResponse } from '../utils';

describe('AutopilotView', () => {
  it('says so when the bot service is down, and keeps manual play reachable', async () => {
    server.use(http.get(`${BOT_URL}/api/runs`, () => HttpResponse.error()));
    renderWithPlugins(AutopilotView);
    expect(await screen.findByText("The bot service isn't available. Manual play still works.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to manual play' })).toHaveAttribute('href', '/play');
    expect(screen.getByRole('button', { name: 'Start run' })).toBeDisabled();
  });
  it('validates max turns before starting a run, then streams it live', async () => {
    const requests: unknown[] = [];

    server.use(
      http.get(`${BOT_URL}/api/runs`, () => HttpResponse.json({ runs: [] })),
      http.post(`${BOT_URL}/api/runs`, async ({ request }) => {
        requests.push(await request.json());

        return HttpResponse.json({ runId: 'run-1', gameId: 'game0001', status: 'running' }, { status: 201 });
      }),
      http.get(`${BOT_URL}/api/runs/run-1`, () => HttpResponse.json(aRun())),
      http.get(`${BOT_URL}/api/runs/run-1/events`, () => sseResponse(RUN_EVENTS)),
    );

    const { user } = renderWithPlugins(AutopilotView);
    const maxTurns = await screen.findByLabelText('Max turns');

    await user.clear(maxTurns);
    await user.type(maxTurns, '0');
    await user.click(screen.getByRole('button', { name: 'Start run' }));
    expect(screen.getByText('Enter a whole number from 1 to 5000.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
    await user.clear(maxTurns);
    await user.type(maxTurns, '50');
    await user.click(screen.getByRole('button', { name: 'Start run' }));
    expect(await screen.findByText(/^Solved 'Defend the fort'/)).toBeInTheDocument();
    expect(requests).toEqual([{ strategy: 'expected-value', maxTurns: 50 }]);
    expect(await screen.findByTestId('run-summary')).toHaveTextContent('Turn limit reached. Score 1100 in 2 turns.');
  });
});
