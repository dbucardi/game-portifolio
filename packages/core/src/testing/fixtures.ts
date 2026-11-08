import type { GameStats } from '../api/schemas';

/** Stats as a new game starts them (API-15), with any field overridden. */
export function gameStats(overrides: Partial<GameStats> = {}): GameStats {
  return { lives: 3, gold: 0, level: 0, score: 0, highScore: 0, turn: 0, ...overrides };
}
