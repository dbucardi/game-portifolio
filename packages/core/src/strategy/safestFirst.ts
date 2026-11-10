import type { GameStats, ShopItem } from '../api/schemas';
import type { Ad } from '../decode';
import { riskTier } from '../probability';
import { BaseStrategy, HEALING_POTION_ID, type ShoppingOptions } from './base';
import { isUnreliable, toRankedAd } from './scoring';
import type { RankedAd } from './types';

/** CORE-12: lives to build up with potions before any other item is bought. */
export const DEFAULT_MIN_LIVES_BEFORE_UPGRADES = 10;

/** Upgrades at this cost or more raise the level by 2 instead of 1 (API-25). */
export const DOUBLE_UPGRADE_COST = 300;

export interface SafestFirstOptions extends ShoppingOptions {
  minLivesBeforeUpgrades: number;
  /** Level from which the double upgrades are preferred. */
  premiumFromLevel: number;
}

/**
 * Baseline: the most likely ad wins, reward breaks ties. Buys only potions until it has `minLivesBeforeUpgrades`,
 * then the cheapest affordable upgrade, or a double upgrade from `premiumFromLevel`.
 * CORE-12: steals, advertisement campaigns and risky or dangerous ads rank last, so they are picked only when nothing else is on offer (CORE-08).
 */
export class SafestFirstStrategy extends BaseStrategy {
  readonly name: string = 'safest-first';
  private readonly minLivesBeforeUpgrades: number;
  private readonly premiumFromLevel: number;

  constructor(options: Partial<SafestFirstOptions> = {}) {
    const { minLivesBeforeUpgrades = DEFAULT_MIN_LIVES_BEFORE_UPGRADES, premiumFromLevel = 3, ...shoppingOptions } = options;

    super(shoppingOptions);
    this.minLivesBeforeUpgrades = minLivesBeforeUpgrades;
    this.premiumFromLevel = premiumFromLevel;
  }

  rankAds(stats: GameStats, ads: Ad[]): RankedAd[] {
    return ads.map((ad) => toRankedAd(ad, stats.lives)).sort(bySafety);
  }

  protected choosePurchase(stats: GameStats, shop: ShopItem[]): ShopItem | undefined {
    if (stats.lives < this.minLivesBeforeUpgrades) {
      const potion = shop.find((item) => item.id === HEALING_POTION_ID);

      return potion && stats.gold >= potion.cost ? potion : undefined;
    }

    const emergency = this.emergencyPotion(stats, shop);

    if (emergency) {
      return emergency;
    }

    const upgrades = this.affordableUpgrades(stats, shop);
    const premium = upgrades.find((item) => item.cost >= DOUBLE_UPGRADE_COST);

    return stats.level >= this.premiumFromLevel && premium ? premium : upgrades[0];
  }
}

function isAvoidedBySafestFirst(entry: RankedAd): boolean {
  const tier = riskTier(entry.ad.probability);

  return entry.trap || isUnreliable(entry.ad) || tier === 'risky' || tier === 'dangerous';
}

function bySafety(a: RankedAd, b: RankedAd): number {
  const avoidedA = isAvoidedBySafestFirst(a);

  if (avoidedA !== isAvoidedBySafestFirst(b)) {
    return avoidedA ? 1 : -1;
  }

  return b.successRate - a.successRate || b.ad.reward - a.ad.reward;
}
