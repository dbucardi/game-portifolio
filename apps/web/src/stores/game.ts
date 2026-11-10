import {
  buyEvent,
  decodeAds,
  describeError,
  gameOverEvent,
  GameOverError,
  NotFoundError,
  HEALING_POTION_ID,
  investigatedEvent,
  solveEvent,
  toRankedAd,
  startedEvent,
  type Ad,
  type GameEvent,
  type GameStats,
  type RankedAd,
  type ShopItem,
} from '@mugloar/core';
import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { clockKey, gameApiKey, injectRequired, randomKey } from '@/api/injection';
import { flavourText, milestonesBetween, sortQuests, suspenseDurationMs, type Milestone, type SuspensePhase } from '@/gameFeel';
import { applyGameEvent, emptySession, toLogEntries, type Session } from '@/session';
import { clearSavedGame, loadSavedGame, saveGame } from '@/savedGame';
import { useHighScoreStore } from './highScore';
import { usePreferencesStore } from './preferences';

/**
 * WEB-12: what the manual-play screen is doing right now.
 * 'resolving' is the suspense phase (FUN-02) and 'revealing' shows its result (FUN-04).
 */
export type GameStatus = 'idle' | 'loading' | 'playing' | 'resolving' | 'revealing' | 'gameOver' | 'error';

export type GameAction =
  { kind: 'start' } | { kind: 'resume' } | { kind: 'refresh' } | { kind: 'solve'; adId: string } | { kind: 'buy'; itemId: string } | { kind: 'investigate' };

export interface GameError {
  message: string;
  failedAction: GameAction;
}

export interface Suspense {
  ad: Ad;
  durationMs: number;
  phase: SuspensePhase;
  flavour: string;
}

export interface QuestReveal {
  ad: Ad;
  success: boolean;
  message: string;
  previous: GameStats;
  next: GameStats;
  milestones: Milestone[];
  potionHint: string | null;
  gameOver: boolean;
}

export const useGameStore = defineStore('game', () => {
  const api = injectRequired(gameApiKey);
  const clock = injectRequired(clockKey);
  const random = injectRequired(randomKey);
  const preferences = usePreferencesStore();
  const session = reactive(emptySession());
  const ads = ref<Ad[]>([]);
  const shop = ref<ShopItem[]>([]);
  const status = ref<GameStatus>('idle');
  const pending = ref<GameAction | null>(null);
  const error = ref<GameError | null>(null);
  const suspense = ref<Suspense | null>(null);
  const reveal = ref<QuestReveal | null>(null);
  const highScores = useHighScoreStore();
  /** WEB-18: shared with autopilot runs. */
  const highScore = computed(() => highScores.best);
  let endSuspense: (() => void) | null = null;
  const stats = computed(() => session.stats);
  const reputation = computed(() => session.reputation);
  const boardAds = computed(() => sortQuests(ads.value, preferences.boardSort));
  /** WEB-07: strategy output exists only while the player has asked for it. */
  const hints = computed<ReadonlyMap<string, RankedAd>>(() => {
    if (!preferences.advisor || !session.stats) {
      return new Map();
    }

    const lives = session.stats.lives;

    // CORE-06 expected value per ad; the board order is never touched (FUN-01).
    return new Map(ads.value.map((ad) => [ad.adId, toRankedAd(ad, lives)]));
  });
  const log = computed(() => toLogEntries(session.events));
  const isGameOver = computed(() => status.value === 'gameOver');
  const hasGame = computed(() => session.gameId !== null);
  const isLastLife = computed(() => session.stats?.lives === 1 && !isGameOver.value);
  /** A quest can be chosen when no quest is resolving and no game-wide load is running (WEB-12). */
  const canAct = computed(() => hasGame.value && (status.value === 'playing' || status.value === 'error'));
  /** Shop, refresh and investigate stay usable while a request or a quest is in flight; they queue (WEB-12). */
  const canQueue = computed(() => hasGame.value && ['playing', 'error', 'resolving', 'revealing'].includes(status.value));
  const canAfford = computed(() => (item: ShopItem) => (session.stats?.gold ?? 0) >= item.cost);

  function applyEvent(event: GameEvent): void {
    applyGameEvent(session, event);
    highScores.record(session.stats?.score);

    if (event.type === 'gameOver') {
      status.value = 'gameOver';
    }
  }

  // WEB-15: keep the current game so a reload can carry on with it.
  watch([() => session.gameId, () => session.stats, () => session.overReason], () => {
    if (!session.gameId || !session.stats) {
      return;
    }

    saveGame({
      gameId: session.gameId,
      stats: session.stats,
      overReason: session.overReason,
    });
  });

  function resetSession(seed: Partial<Session> = {}): void {
    Object.assign(session, { ...emptySession(), ...seed });
    ads.value = [];
  }

  function discardSavedGame(): void {
    clearSavedGame();
    resetSession();
    shop.value = [];
    status.value = 'idle';
  }

  function fail(cause: unknown, action: GameAction): void {
    // WEB-15: a saved game the API no longer knows is dropped quietly.
    if (action.kind === 'resume' && (cause instanceof NotFoundError || cause instanceof GameOverError)) {
      discardSavedGame();

      return;
    }

    // ERR-06: the game ending is an outcome, not an error.
    if (cause instanceof GameOverError && session.stats) {
      applyEvent(gameOverEvent('no-lives', session.stats));

      return;
    }

    error.value = { message: describeError(cause), failedAction: action };
    status.value = hasGame.value || action.kind === 'start' ? 'error' : 'idle';
  }

  const waiting: GameAction[] = [];
  let queueTail: Promise<unknown> = Promise.resolve();

  function isSameAction(a: GameAction, b: GameAction): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function busyStatusFor(action: GameAction): GameStatus | null {
    switch (action.kind) {
      case 'start':
      case 'resume':
        return 'loading';

      case 'solve':
        return 'resolving';

      default:
        return null;
    }
  }

  /** Runs one request at a time; others wait their turn and an identical one is ignored (WEB-12). */
  function perform(action: GameAction, work: () => Promise<void>): Promise<boolean> {
    if ([pending.value, ...waiting].some((other) => other && isSameAction(other, action))) {
      return Promise.resolve(false);
    }

    // An idle queue starts at once, so the work begins in the same tick as the click.
    const idle = pending.value === null && waiting.length === 0;

    if (!idle) {
      waiting.push(action);
    }

    const result = idle
      ? run(action, work)
      : queueTail.then(() => {
          waiting.splice(waiting.indexOf(action), 1);

          return run(action, work);
        });

    queueTail = result;

    return result;
  }

  async function run(action: GameAction, work: () => Promise<void>): Promise<boolean> {
    const busyStatus = busyStatusFor(action);

    // A request that waited may find the game gone or over.
    if (busyStatus !== 'loading' && !canQueue.value) {
      return false;
    }

    pending.value = action;
    error.value = null;

    if (busyStatus) {
      status.value = busyStatus;
    }

    try {
      await work();

      // The work may have moved on already, for example to 'revealing' or 'gameOver'.
      if (busyStatus && status.value === busyStatus) {
        status.value = 'playing';
      }

      return true;
    } catch (cause) {
      fail(cause, action);

      return false;
    } finally {
      pending.value = null;
    }
  }

  function loadAds(gameId: string): Promise<void> {
    return api.getAds(gameId).then((raw) => {
      if (session.gameId !== gameId) {
        return;
      }

      ads.value = decodeAds(raw);
    });
  }

  function loadBoard(gameId: string): Promise<void> {
    return Promise.all([api.getShop(gameId), loadAds(gameId)]).then(([items]) => {
      if (session.gameId !== gameId) {
        return;
      }

      shop.value = [...items].sort((a, b) => a.cost - b.cost);
    });
  }

  /** WEB-15: restores the saved game, then reloads its ads and shop from the API. */
  async function resumeGame(): Promise<void> {
    if (hasGame.value || pending.value) {
      return;
    }

    const saved = loadSavedGame();

    if (!saved) {
      return;
    }

    resetSession({ gameId: saved.gameId, stats: saved.stats, overReason: saved.overReason });

    if (saved.overReason) {
      status.value = 'gameOver';

      return;
    }

    await reloadBoard();
  }

  async function reloadBoard(): Promise<void> {
    const gameId = session.gameId;

    if (!gameId) {
      return;
    }

    await perform({ kind: 'resume' }, () => loadBoard(gameId));
  }

  async function startGame(): Promise<void> {
    await perform({ kind: 'start' }, async () => {
      reveal.value = null;

      const game = await api.startGame();

      resetSession();
      applyEvent(startedEvent(game));
      await loadBoard(game.gameId);
    });
  }

  /** WEB-17: drops the current game and returns to the empty state. */
  function abandonGame(): void {
    skipSuspense();
    suspense.value = null;
    reveal.value = null;
    error.value = null;
    discardSavedGame();
  }

  async function refreshAds(): Promise<void> {
    const gameId = session.gameId;

    if (!gameId) {
      return;
    }

    await perform({ kind: 'refresh' }, () => loadAds(gameId));
  }

  /** FUN-02: resolves after the minimum suspense time, or at once when the game is abandoned or the request fails. */
  function holdSuspense(ad: Ad, durationMs: number): Promise<void> {
    if (durationMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const climax = clock.setTimeout(() => {
        if (suspense.value) {
          suspense.value = {
            ...suspense.value,
            phase: 'climax',
            flavour: flavourText('climax', ad, random),
          };
        }
      }, durationMs / 2);
      const done = clock.setTimeout(finish, durationMs);

      endSuspense = finish;

      function finish(): void {
        clock.clearTimeout(climax);
        clock.clearTimeout(done);
        endSuspense = null;
        resolve();
      }
    });
  }

  /** Ends the wait early on abandon or error. */
  function skipSuspense(): void {
    endSuspense?.();
  }

  async function solve(adId: string): Promise<void> {
    const gameId = session.gameId;
    const ad = ads.value.find((candidate) => candidate.adId === adId);
    const previous = session.stats;

    if (!gameId || !ad || !previous || !canAct.value) {
      return;
    }

    await perform({ kind: 'solve', adId }, async () => {
      const durationMs = suspenseDurationMs(ad.probability);

      suspense.value = {
        ad,
        durationMs,
        phase: 'setting-out',
        flavour: flavourText('setting-out', ad, random),
      };

      try {
        // The request goes out now; only showing its result waits (FUN-02).
        const [result] = await Promise.all([api.solve(gameId, adId), holdSuspense(ad, durationMs)]);

        if (session.gameId !== gameId) {
          return;
        }

        const bestBefore = highScore.value;
        const event = solveEvent(ad, result, previous);

        applyEvent(event);

        const potion = shop.value.find((item) => item.id === HEALING_POTION_ID);

        reveal.value = {
          ad,
          success: result.success,
          message: result.message,
          previous,
          next: event.stats,
          milestones: milestonesBetween(previous, event.stats, bestBefore),
          potionHint: !result.success && result.lives === 1 && potion ? `Last life! A healing potion costs ${potion.cost}g.` : null,
          gameOver: result.lives <= 0,
        };
        status.value = 'revealing';
      } catch (cause) {
        skipSuspense();
        throw cause;
      } finally {
        suspense.value = null;
      }
    });
  }

  /** FUN-04: the player closes the result dialog, then the board is back. */
  async function closeReveal(): Promise<void> {
    const shown = reveal.value;

    if (!shown || status.value !== 'revealing') {
      return;
    }

    reveal.value = null;

    if (shown.gameOver) {
      applyEvent(gameOverEvent('no-lives', shown.next));

      return;
    }

    status.value = 'playing';
    // Ads are reloaded in a separate step so a failed reload never retries the solve.
    await refreshAds();
  }

  async function buy(itemId: string): Promise<void> {
    const gameId = session.gameId;
    const item = shop.value.find((candidate) => candidate.id === itemId);

    if (!gameId || !item || !canQueue.value || !canAfford.value(item)) {
      return;
    }

    const done = await perform({ kind: 'buy', itemId }, async () => {
      const result = await api.buy(gameId, itemId);

      if (session.stats) {
        applyEvent(buyEvent(item, result, session.stats));
      }
    });

    if (done && status.value === 'playing') {
      await refreshAds();
    }
  }

  /** WEB-16: investigating uses up a turn, so it is always an explicit action. */
  async function investigate(): Promise<void> {
    const gameId = session.gameId;

    if (!gameId || !canQueue.value) {
      return;
    }

    const done = await perform({ kind: 'investigate' }, async () => {
      const result = await api.investigateReputation(gameId);

      if (session.stats) {
        applyEvent(investigatedEvent(result, session.stats));
      }
    });

    if (done && status.value === 'playing') {
      await refreshAds();
    }
  }

  async function retry(): Promise<void> {
    const failed = error.value?.failedAction;

    if (!failed) {
      return;
    }

    switch (failed.kind) {
      case 'start':
        return startGame();

      case 'resume':
        return reloadBoard();

      case 'refresh':
        return refreshAds();

      case 'solve':
        return solve(failed.adId);

      case 'buy':
        return buy(failed.itemId);

      case 'investigate':
        return investigate();
    }
  }

  function dismissError(): void {
    error.value = null;

    if (status.value === 'error') {
      status.value = hasGame.value ? 'playing' : 'idle';
    }
  }

  return {
    abandonGame,
    session,
    ads,
    shop,
    status,
    pending,
    error,
    suspense,
    reveal,
    stats,
    highScore,
    reputation,
    boardAds,
    hints,
    log,
    isGameOver,
    hasGame,
    isLastLife,
    canAct,
    canQueue,
    canAfford,
    applyEvent,
    startGame,
    resumeGame,
    refreshAds,
    solve,
    closeReveal,
    buy,
    investigate,
    retry,
    dismissError,
  };
});
