import { DEFAULT_GAME_API_URL } from '@mugloar/core';
import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import PlayView from '@/views/PlayView.vue';
import { server } from '../msw';
import { createFakeClock, renderWithPlugins, testDependencies, useFakeGameApi } from '../utils';

async function startGame(options?: Parameters<typeof useFakeGameApi>[0]) {
  const fake = useFakeGameApi(options);
  const clock = createFakeClock();
  const view = renderWithPlugins(PlayView, { deps: testDependencies(clock) });

  await view.user.click(screen.getByRole('button', { name: 'Start a new game' }));
  await screen.findAllByTestId('ad-card');

  return { ...view, clock, fake };
}

const stat = (key: string) => within(screen.getByTestId(`stat-${key}`));
const suspense = () => within(screen.getByTestId('quest-suspense'));
const dialog = () => within(screen.getByRole('dialog'));
const result = () => within(screen.getByTestId('quest-result-card'));
const closeResult = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Continue' }));
const apiAnswer = () => new Promise((resolve) => setTimeout(resolve, 30));

async function loseAllLives(
  user: ReturnType<typeof userEvent.setup>,
  clock: ReturnType<typeof createFakeClock>,
  afterEachLoss?: (livesBefore: number) => Promise<void>,
): Promise<void> {
  for (let lives = 3; lives > 0; lives--) {
    await stat('lives').findByText(String(lives));
    await user.click(screen.getByRole('button', { name: /^Solve: Escort Ibn Ali/ }));
    await apiAnswer();
    clock.advance(10_000);
    await screen.findByTestId('quest-result-card');
    await closeResult(user);
    await vi.waitFor(() => {
      expect(screen.queryByTestId('quest-result-card')).not.toBeInTheDocument();
    });
    await afterEachLoss?.(lives);
  }
}

function adCard(index: number): ReturnType<typeof within> {
  const card = screen.getAllByTestId('ad-card').at(index);

  if (!card) {
    throw new Error(`No ad card at ${String(index)}`);
  }

  return within(card);
}

describe('PlayView', () => {
  it('offers Abandon game during a game and returns to the empty state (WEB-17)', async () => {
    const { user } = await startGame();

    expect(screen.queryByRole('button', { name: 'New game' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abandon game' }));
    expect(screen.queryAllByTestId('ad-card')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Start a new game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abandon game' })).not.toBeInTheDocument();
  });
  it('shows the quests in board order, decoded, with no pick or hints (FUN-01)', async () => {
    await startGame();
    expect(screen.getAllByTestId('ad-card')).toHaveLength(5);
    expect(adCard(0).getByText('Escort Ibn Ali to the castle in the north')).toBeInTheDocument();
    expect(adCard(3).getByText('Defend the village from a band of trolls')).toBeInTheDocument();
    expect(adCard(3).getByText('decoded')).toBeInTheDocument();
    expect(adCard(4).getByText('Suicide mission')).toBeInTheDocument();
    expect(screen.queryByText(/bot pick/i)).not.toBeInTheDocument();
    expect(screen.queryByText('trap')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('advisor-ev')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /^Solve: / })).toHaveLength(5);
  });
  it('shows EV and trap tags with the advisor on, in the same order (WEB-07)', async () => {
    const { user } = await startGame();

    await user.click(screen.getByLabelText('Advisor hints'));
    expect(screen.getAllByTestId('advisor-ev')).toHaveLength(5);
    expect(adCard(0).getByText('Escort Ibn Ali to the castle in the north')).toBeInTheDocument();
    expect(adCard(4).getByText('trap')).toBeInTheDocument();
  });
  it('runs the suspense phase, shows the success in a dialog that stays until closed (FUN-02 – FUN-04)', async () => {
    const { user, clock } = await startGame();

    await user.click(screen.getByRole('button', { name: /^Solve: Escort Ibn Ali/ }));
    await apiAnswer();
    expect(dialog().getByTestId('quest-suspense')).toBeInTheDocument();
    expect(adCard(0).queryByTestId('quest-suspense')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(suspense().getByText('Quest in progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(suspense().getByText('+72 gold')).toBeInTheDocument();

    const settingOut = suspense().getByTestId('flavour').textContent;

    expect(screen.queryByTestId('quest-result')).not.toBeInTheDocument();

    for (const button of screen.getAllByRole('button', { name: /^Solve: / })) {
      expect(button).toBeDisabled();
    }

    clock.advance(2250);
    await vi.waitFor(() => {
      expect(suspense().getByTestId('flavour').textContent).not.toBe(settingOut);
    });
    expect(stat('turn').getByText('0')).toBeInTheDocument();
    clock.advance(2250);
    expect(await screen.findByText('Quest complete!')).toBeInTheDocument();
    expect(screen.queryByTestId('quest-suspense')).not.toBeInTheDocument();
    expect(dialog().getByTestId('quest-result-card')).toBeInTheDocument();
    expect(result().getByText('"You successfully solved the mission!"')).toBeInTheDocument();
    expect(result().getByText('+72 score')).toBeInTheDocument();
    expect(stat('gold').getByText('72')).toBeInTheDocument();
    clock.advance(60_000);
    expect(screen.getByText('Quest complete!')).toBeInTheDocument();
    await closeResult(user);
    await vi.waitFor(() => {
      expect(screen.queryByText('Quest complete!')).not.toBeInTheDocument();
    });
    expect(stat('turn').getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/^Solved 'Escort Ibn Ali/)).toBeInTheDocument();
  });
  it('reveals a failure with the life lost (FUN-04)', async () => {
    const { user, clock } = await startGame({ solveSucceeds: () => false });

    await user.click(screen.getByRole('button', { name: /^Solve: Escort Ibn Ali/ }));
    await apiAnswer();
    clock.advance(10_000);
    expect(await screen.findByText('Quest failed')).toBeInTheDocument();
    expect(result().getByText('-1 life')).toBeInTheDocument();
    expect(result().getByText('Lives 3 → 2')).toBeInTheDocument();
  });
  it('closes the result with the dialog Close button (FUN-04)', async () => {
    const { user, clock } = await startGame();

    await user.click(screen.getByRole('button', { name: /^Solve: Escort Ibn Ali/ }));
    await apiAnswer();
    clock.advance(10_000);
    await screen.findByTestId('quest-result-card');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(stat('turn').getByText('1')).toBeInTheDocument();
  });
  it('only lets you buy what you can afford, with a float-up on the stat (FUN-07)', async () => {
    const { user, clock } = await startGame();

    await user.click(screen.getByRole('button', { name: /^Solve: Escort Ibn Ali/ }));
    clock.advance(10_000);
    await screen.findByTestId('quest-result-card');
    await closeResult(user);
    await stat('turn').findByText('1');
    expect(screen.getByRole('button', { name: 'Buy Claw Sharpening for 100 gold' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Buy Healing potion for 50 gold' }));
    expect(await stat('lives').findByText('4')).toBeInTheDocument();
    expect(stat('lives').getByText('+1 ♥')).toBeInTheDocument();
    expect(stat('gold').getByText('22')).toBeInTheDocument();
  });
  it('explains in a tooltip why an unaffordable item cannot be bought (WEB-04)', async () => {
    const { user, clock } = await startGame();

    await user.click(screen.getByRole('button', { name: /^Solve: Escort Ibn Ali/ }));
    clock.advance(10_000);
    await screen.findByTestId('quest-result-card');
    await closeResult(user);
    await stat('turn').findByText('1');

    const buy = screen.getByRole('button', { name: 'Buy Claw Sharpening for 100 gold' });

    await user.hover(buy.parentElement as HTMLElement);
    expect(await screen.findByText('Not enough gold: you need 28 more.')).toBeInTheDocument();
  });
  it('shows the reputation only after the player investigates, and that uses a turn (WEB-16)', async () => {
    const { user, fake } = await startGame();

    for (const key of ['people', 'state', 'underworld']) {
      expect(within(screen.getByTestId(`reputation-${key}`)).getByText('?')).toBeInTheDocument();
    }

    const game = [...fake.games.values()][0];

    if (game) {
      game.reputation = { people: 3.4888888, state: -2, underworld: 0 };
    }

    await user.click(screen.getByRole('button', { name: 'Investigate' }));
    expect(await within(screen.getByTestId('reputation-people')).findByText('+3.5')).toBeInTheDocument();
    expect(within(screen.getByTestId('reputation-state')).getByText('-2')).toBeInTheDocument();
    expect(within(screen.getByTestId('reputation-underworld')).getByText('0')).toBeInTheDocument();
    expect(stat('turn').getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Investigated your reputation')).toBeInTheDocument();
  });
  it('warns on the last life and shows the final score when the game ends', async () => {
    const { user, clock } = await startGame({ solveSucceeds: () => false });

    await loseAllLives(user, clock, async (lives) => {
      if (lives === 2) {
        expect(await screen.findByTestId('last-life-warning')).toBeInTheDocument();
      }
    });
    expect(await screen.findByTestId('game-over-title')).toHaveTextContent('Your journey ends');
    expect(stat('score').getByText('0')).toBeInTheDocument();
    expect(stat('turn').getByText('3')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Game over' })).getByRole('button', { name: 'New game' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    for (const button of screen.getAllByRole('button', { name: /^Solve/ })) {
      expect(button).toBeDisabled();
    }
  });
  it('keeps the game-over panel with a busy New game until the next game is ready (WEB-06)', async () => {
    const { user, clock } = await startGame({ solveSucceeds: () => false });

    await loseAllLives(user, clock);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.use(
      http.post(
        `${DEFAULT_GAME_API_URL}/game/start`,
        async () => {
          await gate;
        },
        { once: true },
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'New game' }));
    expect(screen.getByRole('region', { name: 'Game over' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New game' })).toBeDisabled();
    release();
    await vi.waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Game over' })).not.toBeInTheDocument();
    });
    expect(stat('lives').getByText('3')).toBeInTheDocument();
  });
  it('shows an error toast and repeats the action on Retry', async () => {
    const { user, clock } = await startGame();

    server.use(http.post(`${DEFAULT_GAME_API_URL}/:gameId/solve/:adId`, () => new HttpResponse('down', { status: 503 }), { once: true }));
    await user.click(screen.getByRole('button', { name: /^Solve: Escort Ibn Ali/ }));
    expect(await screen.findByText('The game API had a problem. Try again in a moment.')).toBeInTheDocument();
    expect(stat('turn').getByText('0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    clock.advance(10_000);
    expect(await screen.findByText('Quest complete!')).toBeInTheDocument();
    expect(stat('turn').getByText('1')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(screen.queryByText('The game API had a problem. Try again in a moment.')).not.toBeInTheDocument();
    });
  });
});
