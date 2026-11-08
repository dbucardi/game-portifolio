import { DEFAULT_GAME_API_URL } from '@mugloar/core';
import { http, HttpResponse } from 'msw';
import { useGameStore } from '@/stores/game';
import { usePreferencesStore } from '@/stores/preferences';
import { server } from '../msw';
import { createFakeClock, createTestApp, testDependencies, useFakeGameApi } from '../utils';

function setup(options?: Parameters<typeof useFakeGameApi>[0]) {
  const fake = useFakeGameApi(options);
  const clock = createFakeClock();

  createTestApp(testDependencies(clock));

  const game = useGameStore();

  /** Plays one quest through suspense and reveal, back to the board. */
  async function solveThrough(adId: string): Promise<void> {
    const solving = game.solve(adId);

    clock.advance(10_000);
    await solving;
    await game.closeReveal();
  }

  return { fake, clock, game, preferences: usePreferencesStore(), solveThrough };
}

const apiAnswer = () => new Promise((resolve) => setTimeout(resolve, 30));

describe('game store', () => {
  it('starts a game with decoded ads in board order and the shop sorted by cost', async () => {
    const { game } = setup();

    await game.startGame();
    expect(game.status).toBe('playing');
    expect(game.stats).toMatchObject({ lives: 3, gold: 0, turn: 0 });
    expect(game.boardAds.map((ad) => ad.adId)).toEqual(['ad-safe', 'ad-park', 'ad-b64', 'ad-rot13', 'ad-trap']);
    expect(game.ads.map((ad) => ad.message)).toContain('Defend the village from a band of trolls');
    expect(game.shop.map((item) => item.cost)).toEqual([50, 100, 100, 300]);
  });
  it('shows advisor hints only when asked, without reordering the board (WEB-07)', async () => {
    const { game, preferences } = setup();

    await game.startGame();

    const order = game.boardAds.map((ad) => ad.adId);

    expect(game.hints.size).toBe(0);
    preferences.advisor = true;
    expect(game.hints.get('ad-trap')?.trap).toBe(true);
    expect(game.boardAds.map((ad) => ad.adId)).toEqual(order);
  });
  it('lets the player sort the board (FUN-01)', async () => {
    const { game, preferences } = setup();

    await game.startGame();
    preferences.boardSort = 'reward';
    expect(game.boardAds[0]?.adId).toBe('ad-trap');
    preferences.boardSort = 'expiry';
    expect(game.boardAds[0]?.adId).toBe('ad-park');
    preferences.boardSort = 'risk';
    expect(game.boardAds[0]?.adId).toBe('ad-safe');
  });
  it('holds the result back for the suspense phase, then reveals it (FUN-02, FUN-04)', async () => {
    const { game, clock } = setup();

    await game.startGame();

    const solving = game.solve('ad-safe');

    await apiAnswer();
    expect(game.status).toBe('resolving');
    expect(game.suspense?.ad.adId).toBe('ad-safe');
    expect(game.stats?.turn).toBe(0);
    clock.advance(4499);
    await apiAnswer();
    expect(game.status).toBe('resolving');
    clock.advance(1);
    await solving;
    expect(game.status).toBe('revealing');
    expect(game.suspense).toBeNull();
    expect(game.reveal).toMatchObject({ success: true, previous: { gold: 0 }, next: { gold: 72 } });
    expect(game.log[0]?.text).toMatch(/^Solved 'Escort Ibn Ali/);
    await game.closeReveal();
    expect(game.status).toBe('playing');
    expect(game.reveal).toBeNull();
    expect(game.ads).toHaveLength(5);
  });
  it('keeps the result until the player closes it (FUN-04)', async () => {
    const { game, clock } = setup();

    await game.startGame();

    const solving = game.solve('ad-safe');

    clock.advance(10_000);
    await solving;
    clock.advance(60_000);
    expect(game.status).toBe('revealing');
    expect(game.reveal).not.toBeNull();
    await game.closeReveal();
    expect(game.status).toBe('playing');
    expect(game.reveal).toBeNull();
    expect(game.stats?.turn).toBe(1);
  });
  it('drops the result when a new game starts', async () => {
    const { game, clock } = setup();

    await game.startGame();

    const solving = game.solve('ad-safe');

    clock.advance(10_000);
    await solving;
    await game.startGame();
    expect(game.reveal).toBeNull();
    expect(game.stats?.turn).toBe(0);
  });
  it('abandons a game back to the empty state, even mid-quest (WEB-17)', async () => {
    const { game, clock } = setup();

    await game.startGame();

    const solving = game.solve('ad-safe');

    game.abandonGame();
    clock.advance(10_000);
    await solving;
    expect(game.status).toBe('idle');
    expect(game.hasGame).toBe(false);
    expect(game.stats).toBeNull();
    expect(game.ads).toEqual([]);
    expect(game.shop).toEqual([]);
    expect(game.suspense).toBeNull();
    expect(game.reveal).toBeNull();
  });
  it('changes the flavour text for the climax', async () => {
    const { game, clock } = setup();

    await game.startGame();

    const solving = game.solve('ad-safe');
    const settingOut = game.suspense?.flavour;

    clock.advance(2250);
    expect(game.suspense?.phase).toBe('climax');
    expect(game.suspense?.flavour).not.toBe(settingOut);
    clock.advance(2250);
    await solving;
  });
  it('ignores a second solve during the suspense phase (WEB-12)', async () => {
    const { game, fake, clock } = setup();

    await game.startGame();

    const first = game.solve('ad-safe');

    await game.solve('ad-park');
    clock.advance(10_000);
    await first;
    expect([...fake.games.values()][0]?.turn).toBe(1);
    expect(game.reveal?.ad.adId).toBe('ad-safe');
  });
  it('keeps other actions usable while a request is in flight, queues them and drops a duplicate (WEB-12)', async () => {
    const { game } = setup();

    await game.startGame();

    const investigating = game.investigate();

    expect(game.pending?.kind).toBe('investigate');
    expect(game.canQueue).toBe(true);
    expect(game.canAct).toBe(true);
    await game.investigate();
    const refreshed = game.refreshAds();

    await Promise.all([investigating, refreshed]);
    expect(game.stats?.turn).toBe(1);
    expect(game.pending).toBeNull();
    expect(game.status).toBe('playing');
  });
  it('buys a healing potion without a suspense phase', async () => {
    const { game, solveThrough } = setup();

    await game.startGame();
    await solveThrough('ad-safe');
    await game.buy('hpot');
    expect(game.stats).toMatchObject({ lives: 4, gold: 22, turn: 2 });
    expect(game.log[0]?.text).toBe('Bought Healing potion  -50 gold');
  });
  it('suggests a potion on the last life and ends the game after the final reveal', async () => {
    const { game, clock, solveThrough } = setup({ solveSucceeds: () => false });

    await game.startGame();
    await solveThrough('ad-safe');

    const solving = game.solve('ad-safe');

    clock.advance(10_000);
    await solving;
    expect(game.reveal?.potionHint).toBe('Last life! A healing potion costs 50g.');
    expect(game.reveal?.milestones.map((m) => m.key)).toEqual(['last-life']);
    await game.closeReveal();
    expect(game.isLastLife).toBe(true);

    const last = game.solve('ad-safe');

    clock.advance(10_000);
    await last;
    expect(game.reveal?.gameOver).toBe(true);
    expect(game.status).toBe('revealing');
    await game.closeReveal();
    expect(game.status).toBe('gameOver');
    expect(game.session.overReason).toBe('no-lives');
    expect(game.error).toBeNull();
    expect(game.canAct).toBe(false);
  });
  it('calls out the 1000-point target (FUN-08)', async () => {
    const { game, clock } = setup({
      ads: () => [
        {
          adId: 'big',
          message: 'Slay the giant',
          reward: 1200,
          expiresIn: 3,
          encrypted: null,
          probability: 'Sure thing',
        },
      ],
    });

    await game.startGame();

    const solving = game.solve('big');

    clock.advance(10_000);
    await solving;
    expect(game.reveal?.milestones.map((m) => m.key)).toEqual(['target']);
  });
  it('treats a 410 from the API as game over, not as an error', async () => {
    const { game, fake } = setup();

    await game.startGame();

    const state = [...fake.games.values()][0];

    if (state) {
      state.lives = 0;
    }

    await game.refreshAds();
    expect(game.status).toBe('gameOver');
    expect(game.error).toBeNull();
  });
  it('keeps the failed solve so Retry can repeat it', async () => {
    const { game, clock } = setup();

    await game.startGame();
    server.use(http.post(`${DEFAULT_GAME_API_URL}/:gameId/solve/:adId`, () => new HttpResponse('down', { status: 503 }), { once: true }));
    await game.solve('ad-safe');
    expect(game.status).toBe('error');
    expect(game.suspense).toBeNull();
    expect(game.error).toMatchObject({ failedAction: { kind: 'solve', adId: 'ad-safe' } });
    expect(game.stats?.turn).toBe(0);

    const retrying = game.retry();

    clock.advance(10_000);
    await retrying;
    expect(game.error).toBeNull();
    expect(game.stats?.turn).toBe(1);
  });
  it('retries only the ad reload when it fails after a reveal', async () => {
    const { game, solveThrough } = setup();

    await game.startGame();
    server.use(http.get(`${DEFAULT_GAME_API_URL}/:gameId/messages`, () => new HttpResponse('down', { status: 503 }), { once: true }));
    await solveThrough('ad-safe');
    expect(game.stats?.turn).toBe(1);
    expect(game.error?.failedAction).toEqual({ kind: 'refresh' });
  });
  describe('personal high score (WEB-18)', () => {
    it('rises with the score and survives abandoning, a new game and a reload', async () => {
      const { game, solveThrough } = setup();

      await game.startGame();
      await solveThrough('ad-safe');

      const best = game.stats?.score ?? 0;

      expect(best).toBeGreaterThan(0);
      expect(game.highScore).toBe(best);
      expect(localStorage.getItem('mugloar.highScore')).toBe(String(best));
      game.abandonGame();
      expect(localStorage.getItem('mugloar.savedGame')).toBeNull();
      expect(game.highScore).toBe(best);
      await game.startGame();
      expect(game.stats?.score).toBe(0);
      expect(game.highScore).toBe(best);
      createTestApp(testDependencies(createFakeClock()));
      expect(useGameStore().highScore).toBe(best);
    });
    it('does not use the highScore field of the API', async () => {
      const { game } = setup();

      await game.startGame();
      expect(game.highScore).toBe(0);
    });
    it('ignores a corrupt stored value', () => {
      localStorage.setItem('mugloar.highScore', '"lots"');

      const { game } = setup();

      expect(game.highScore).toBe(0);
    });
  });
  describe('resuming after a reload (WEB-15)', () => {
    /** A second app and store over the same localStorage and fake API, as after a page reload. */
    function reload() {
      createTestApp(testDependencies(createFakeClock()));

      return useGameStore();
    }

    it('restores the saved game and reloads its board and shop', async () => {
      const { game, solveThrough } = setup();

      await game.startGame();
      await solveThrough('ad-safe');
      await apiAnswer();

      const { gameId } = game.session;
      const reloaded = reload();

      await reloaded.resumeGame();
      expect(reloaded.session.gameId).toBe(gameId);
      expect(reloaded.stats).toEqual(game.stats);
      expect(reloaded.status).toBe('playing');
      expect(reloaded.ads.length).toBeGreaterThan(0);
      expect(reloaded.shop.length).toBeGreaterThan(0);
    });
    it('restores a finished game as game over without calling the API', async () => {
      const { game } = setup();

      await game.startGame();

      if (!game.stats) {
        throw new Error('game did not start');
      }

      game.applyEvent({ type: 'gameOver', reason: 'no-lives', stats: game.stats });
      await apiAnswer();

      const reloaded = reload();

      await reloaded.resumeGame();
      expect(reloaded.status).toBe('gameOver');
      expect(reloaded.session.overReason).toBe('no-lives');
    });
    it('does nothing when no game was saved', async () => {
      const { game } = setup();

      await game.resumeGame();
      expect(game.status).toBe('idle');
      expect(game.hasGame).toBe(false);
    });
    it('ignores corrupt saved data', async () => {
      const { game } = setup();

      localStorage.setItem('mugloar.savedGame', '{"gameId":"x","stats":{"lives":"many"}}');
      await game.resumeGame();
      expect(game.status).toBe('idle');
      expect(game.hasGame).toBe(false);
    });
    it('drops a saved game the API no longer knows, without an error', async () => {
      const { game, fake } = setup();

      await game.startGame();
      await apiAnswer();
      fake.reset();

      const reloaded = reload();

      await reloaded.resumeGame();
      expect(reloaded.status).toBe('idle');
      expect(reloaded.hasGame).toBe(false);
      expect(reloaded.error).toBeNull();
      expect(localStorage.getItem('mugloar.savedGame')).toBeNull();
    });
    it('keeps the saved game and offers a retry when the API is down', async () => {
      const { game } = setup();

      await game.startGame();
      await apiAnswer();
      server.use(http.get(`${DEFAULT_GAME_API_URL}/:gameId/shop`, () => new HttpResponse('down', { status: 503 }), { once: true }));

      const reloaded = reload();

      await reloaded.resumeGame();
      expect(reloaded.error?.failedAction).toEqual({ kind: 'resume' });
      await reloaded.retry();
      expect(reloaded.status).toBe('playing');
      expect(reloaded.shop.length).toBeGreaterThan(0);
    });
    it('still plays when storage is unavailable', async () => {
      const { game } = setup();

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      await game.startGame();
      await apiAnswer();
      expect(game.status).toBe('playing');
      vi.restoreAllMocks();
    });
  });
  it('investigates the reputation, counts the turn it used and keeps it out of the saved stats (WEB-16)', async () => {
    const { game } = setup();

    await game.startGame();
    expect(game.reputation).toBeNull();
    await game.investigate();
    expect(game.reputation).toEqual({ people: 0, state: 0, underworld: 0 });
    expect(game.stats?.turn).toBe(1);
    expect(game.log[0]?.text).toBe('Investigated your reputation');
  });
  it('forgets the reputation when a new game starts (WEB-16)', async () => {
    const { game } = setup();

    await game.startGame();
    await game.investigate();
    await game.startGame();
    expect(game.reputation).toBeNull();
  });
});
