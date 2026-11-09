import type { GameStats } from '../api/schemas';
import type { Ad } from '../decode';
import type { GameEvent } from '../events';
import { ExpectedValueStrategy, type ExpectedValueOptions } from './expectedValue';
import { byExpectedValue, lifeCost, TRAP_PATTERNS } from './scoring';
import type { RankedAd } from './types';

/**
 * CORE-09: successful steals a game can take before reputation makes every further one fail.
 * Live data (40 games): success is 0.88 or better up to the 5th steal, then 0.33, 0.11, 0 (README).
 */
export const DEFAULT_STEAL_BUDGET = 5;

/** Success rate of a steal inside the budget. The label says nothing about it, so this replaces the label. */
export const STEAL_SUCCESS_RATE = 0.93;

export interface StealBudgetOptions extends ExpectedValueOptions {
  stealBudget: number;
}

/**
 * Expected value, but steals are worth taking until the reputation cliff: they pay about twice
 * as much as other safe ads. Once the budget is spent they are traps again (CORE-07).
 * Reputation does not recover (checked over 60 turns), so the budget is spent once per game.
 */
export class StealBudgetStrategy extends ExpectedValueStrategy {
  override readonly name = 'steal-budget';
  private readonly stealBudget: number;
  private successfulSteals = 0;

  constructor(options: Partial<StealBudgetOptions> = {}) {
    const { stealBudget = DEFAULT_STEAL_BUDGET, ...expectedValueOptions } = options;

    super(expectedValueOptions);
    this.stealBudget = stealBudget;
  }

  observe(event: GameEvent): void {
    if (event.type === 'solved' && TRAP_PATTERNS.some((pattern) => pattern.test(event.adMessage))) {
      this.successfulSteals += 1;
    }
  }

  override rankAds(stats: GameStats, ads: Ad[]): RankedAd[] {
    if (this.successfulSteals >= this.stealBudget) {
      return super.rankAds(stats, ads);
    }

    const ranked = super.rankAds(stats, ads).map((entry) => (entry.trap ? this.asBudgetedSteal(entry, stats.lives) : entry));

    return ranked.sort(byExpectedValue);
  }

  private asBudgetedSteal(entry: RankedAd, lives: number): RankedAd {
    const expectedValue = STEAL_SUCCESS_RATE * entry.ad.reward - (1 - STEAL_SUCCESS_RATE) * lifeCost(lives);

    return {
      ...entry,
      successRate: STEAL_SUCCESS_RATE,
      expectedValue,
      trap: false,
    };
  }
}
