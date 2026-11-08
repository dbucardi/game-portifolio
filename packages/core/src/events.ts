import { z } from 'zod';
import type { BuyResult, GameState, GameStats, Reputation, ShopItem, SolveResult } from './api/schemas';
import type { Ad } from './decode';

export const GAME_OVER_REASONS = ['no-lives', 'max-turns'] as const;

export const gameOverReasonSchema = z.enum(GAME_OVER_REASONS);

export type GameOverReason = z.infer<typeof gameOverReasonSchema>;

/**
 * WEB-11: everything that changes a game, from manual play or from a bot run.
 * Each event carries the stats from the API response, the single source of truth (BOT-08).
 */
export type GameEvent =
  | { type: 'started'; gameId: string; stats: GameStats }
  | {
      type: 'solved' | 'failed';
      adId: string;
      adMessage: string;
      reward: number;
      probability: string;
      resultMessage: string;
      stats: GameStats;
    }
  | {
      type: 'bought';
      itemId: string;
      itemName: string;
      cost: number;
      success: boolean;
      stats: GameStats;
    }
  | { type: 'investigated'; reputation: Reputation; stats: GameStats }
  | { type: 'gameOver'; reason: GameOverReason; stats: GameStats };

function statsOf(game: GameState): GameStats {
  const { gameId: _gameId, ...stats } = game;

  return stats;
}

export function startedEvent(game: GameState): GameEvent {
  return { type: 'started', gameId: game.gameId, stats: statsOf(game) };
}

export function solveEvent(ad: Ad, result: SolveResult, previous: GameStats): GameEvent {
  return {
    type: result.success ? 'solved' : 'failed',
    adId: ad.adId,
    adMessage: ad.message,
    reward: ad.reward,
    probability: ad.probability,
    resultMessage: result.message,
    stats: {
      ...previous,
      lives: result.lives,
      gold: result.gold,
      score: result.score,
      highScore: result.highScore,
      turn: result.turn,
    },
  };
}

export function buyEvent(item: ShopItem, result: BuyResult, previous: GameStats): GameEvent {
  return {
    type: 'bought',
    itemId: item.id,
    itemName: item.name,
    cost: item.cost,
    success: result.shoppingSuccess,
    stats: {
      ...previous,
      gold: result.gold,
      lives: result.lives,
      level: result.level,
      turn: result.turn,
    },
  };
}

/** API-06 and API-14: the response has no turn, but investigating uses one up (checked 2026-11-08). */
export function investigatedEvent(reputation: Reputation, previous: GameStats): GameEvent {
  return { type: 'investigated', reputation, stats: { ...previous, turn: previous.turn + 1 } };
}

export function gameOverEvent(reason: GameOverReason, stats: GameStats): GameEvent {
  return { type: 'gameOver', reason, stats };
}

/** The 1000-point goal from the brief (BOT-20). */
export const TARGET_SCORE = 1000;
