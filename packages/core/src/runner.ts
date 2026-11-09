import type { GameApiClient } from './api/client';
import { ApiError, GameOverError } from './api/errors';
import type { GameStats, RawAd, ShopItem } from './api/schemas';
import { decodeAds, type Ad } from './decode';
import { buyEvent, gameOverEvent, solveEvent, startedEvent, type GameEvent, type GameOverReason } from './events';
import type { Action, Strategy } from './strategy';

export type GameApi = Pick<GameApiClient, 'startGame' | 'getAds' | 'getShop' | 'solve' | 'buy'>;

export interface PlayGameOptions {
  /** BOT-07: the game stops with reason `max-turns` once the turn counter reaches this. */
  maxTurns: number;
  /** BOT-12: checked between API calls, so a stop never cuts a request short. */
  signal?: AbortSignal;
  onEvent?: (event: GameEvent) => void;
  onSkippedAd?: (adId: string) => void;
}

export type GameEndReason = GameOverReason | 'stopped';

export interface GameResult {
  gameId: string;
  reason: GameEndReason;
  stats: GameStats;
}

/** Rejected moves in a row (for example an ad that expired) before the game is given up. */
export const MAX_REJECTED_MOVES = 3;

/**
 * BOT-01 – BOT-08: start a game, then fetch ads, let the strategy pick, act, and repeat
 * until lives run out, the turn limit is hit, or the signal aborts.
 */
export async function playGame(api: GameApi, strategy: Strategy, options: PlayGameOptions): Promise<GameResult> {
  const { maxTurns, signal, onEvent = () => undefined, onSkippedAd } = options;
  const game = await api.startGame();
  const { gameId } = game;
  const started = startedEvent(game);
  let stats: GameStats = started.stats;
  const emit = (event: GameEvent): void => {
    strategy.observe?.(event);
    onEvent(event);
  };

  emit(started);

  const end = (reason: GameEndReason): GameResult => {
    if (reason !== 'stopped') {
      emit(gameOverEvent(reason, stats));
    }

    return { gameId, reason, stats };
  };
  // CORE-03: without a handler, decodeAds logs the skipped ad itself.
  const onSkip =
    onSkippedAd &&
    ((raw: RawAd) => {
      onSkippedAd(raw.adId);
    });
  let shop: ShopItem[] | null = null;
  let rejectedMoves = 0;

  try {
    for (;;) {
      if (signal?.aborted) {
        return end('stopped');
      }

      if (stats.lives <= 0) {
        return end('no-lives');
      }

      if (stats.turn >= maxTurns) {
        return end('max-turns');
      }

      // The shop never changes during a game (API-16), so it is read once, alongside the first ads.
      const [rawAds, currentShop]: [RawAd[], ShopItem[]] = await Promise.all([api.getAds(gameId), shop ?? api.getShop(gameId)]);

      shop = currentShop;

      const ads = decodeAds(rawAds, onSkip);
      const actions = strategy.chooseActions(stats, ads, currentShop);

      if (actions.length === 0) {
        throw new Error(`The game offered no ads on turn ${stats.turn}.`);
      }

      for (const action of actions) {
        if (signal?.aborted) {
          return end('stopped');
        }

        try {
          const event = await perform(api, gameId, action, ads, currentShop, stats);

          stats = event.stats;
          emit(event);
          rejectedMoves = 0;
        } catch (error) {
          // A purchase spends a turn, so the ad picked with it can expire first: refetch and go on.
          if (!(error instanceof ApiError) || error.kind !== 'bad-request') {
            throw error;
          }

          if (++rejectedMoves >= MAX_REJECTED_MOVES) {
            throw error;
          }

          break;
        }

        if (stats.lives <= 0) {
          break;
        }
      }
    }
  } catch (error) {
    // ERR-06: game over is the normal ending, not a failure.
    if (error instanceof GameOverError) {
      return end('no-lives');
    }

    throw error;
  }
}

async function perform(api: GameApi, gameId: string, action: Action, ads: Ad[], shop: ShopItem[], stats: GameStats): Promise<GameEvent> {
  if (action.type === 'solve') {
    const ad = ads.find((candidate) => candidate.adId === action.adId);

    if (!ad) {
      throw new Error(`Strategy picked unknown ad ${action.adId}.`);
    }

    return solveEvent(ad, await api.solve(gameId, ad.adId), stats);
  }

  const item = shop.find((candidate) => candidate.id === action.itemId);

  if (!item) {
    throw new Error(`Strategy picked unknown item ${action.itemId}.`);
  }

  return buyEvent(item, await api.buy(gameId, item.id), stats);
}
