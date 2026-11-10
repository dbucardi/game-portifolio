import type { GameStats, ShopItem } from '../api/schemas';
import type { Ad } from '../decode';
import type { GameEvent } from '../events';
import { BaseStrategy, type ShoppingOptions } from './base';
import { DOUBLE_UPGRADE_COST } from './safestFirst';
import { byExpectedValue, lifeCost, TRAP_PATTERNS, toRankedAd } from './scoring';
import type { RankedAd } from './types';

/**
 * CORE-09: successful steals a game can take before reputation makes every further one fail.
 * Live data (40 games): success is 0.88 or better up to the 5th steal, then 0.33, 0.11, 0 (API-20).
 */
export const DEFAULT_STEAL_BUDGET = 5;

/** Success rate of a steal inside the budget. The label says nothing about it, so this replaces the label. */
export const STEAL_SUCCESS_RATE = 0.93;

/** CORE-13: defend quests, whose reward grows with level, take over the board from about this turn (API-24). */
export const DEFAULT_BUILD_UNTIL_TURN = 25;

/** CORE-13: after this turn an upgrade can no longer pay back the turn it costs (API-24, API-25). */
export const DEFAULT_UPGRADE_UNTIL_TURN = 40;

export interface TurnPhasedOptions extends ShoppingOptions {
  stealBudget: number;
  buildUntilTurn: number;
  upgradeUntilTurn: number;
}

/**
 * Ads: expected value (CORE-06), with steals worth taking until the reputation cliff, since they pay about twice
 * as much as other safe ads. Once the budget is spent they are traps again (CORE-07, CORE-09). Reputation does not
 * recover (API-21), so the budget is spent once per game.
 * Shopping is timed to the game's phases (CORE-13).
 * Build: before defend quests appear, turns earn little, so the cheapest upgrade is bought whenever gold allows.
 * Harvest: a turn is worth more than one level, so only the double upgrades are bought, until `upgradeUntilTurn`.
 * After that, gold only buys a potion on the last life.
 */
export class TurnPhasedStrategy extends BaseStrategy {
  readonly name: string = 'turn-phased';
  private readonly stealBudget: number;
  private readonly buildUntilTurn: number;
  private readonly upgradeUntilTurn: number;
  private successfulSteals = 0;

  constructor(options: Partial<TurnPhasedOptions> = {}) {
    const {
      stealBudget = DEFAULT_STEAL_BUDGET,
      buildUntilTurn = DEFAULT_BUILD_UNTIL_TURN,
      upgradeUntilTurn = DEFAULT_UPGRADE_UNTIL_TURN,
      ...shoppingOptions
    } = options;

    super(shoppingOptions);
    this.stealBudget = stealBudget;
    this.buildUntilTurn = buildUntilTurn;
    this.upgradeUntilTurn = upgradeUntilTurn;
  }

  observe(event: GameEvent): void {
    if (event.type === 'solved' && TRAP_PATTERNS.some((pattern) => pattern.test(event.adMessage))) {
      this.successfulSteals += 1;
    }
  }

  rankAds(stats: GameStats, ads: Ad[]): RankedAd[] {
    const budgetLeft = this.successfulSteals < this.stealBudget;

    return ads
      .map((ad) => toRankedAd(ad, stats.lives))
      .map((entry) => (budgetLeft && entry.trap ? asBudgetedSteal(entry, stats.lives) : entry))
      .sort(byExpectedValue);
  }

  protected choosePurchase(stats: GameStats, shop: ShopItem[]): ShopItem | undefined {
    const emergency = this.emergencyPotion(stats, shop);

    if (emergency || stats.turn >= this.upgradeUntilTurn) {
      return emergency;
    }

    const affordable = this.affordableUpgrades(stats, shop);

    if (stats.turn < this.buildUntilTurn) {
      return affordable[0];
    }

    return affordable.find((item) => item.cost >= DOUBLE_UPGRADE_COST);
  }
}

function asBudgetedSteal(entry: RankedAd, lives: number): RankedAd {
  const expectedValue = STEAL_SUCCESS_RATE * entry.ad.reward - (1 - STEAL_SUCCESS_RATE) * lifeCost(lives);

  return { ...entry, successRate: STEAL_SUCCESS_RATE, expectedValue, trap: false };
}
