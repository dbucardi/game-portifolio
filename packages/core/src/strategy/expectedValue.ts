import type { GameStats, ShopItem } from '../api/schemas';
import type { Ad } from '../decode';
import { byExpectedValue, toRankedAd } from './scoring';
import type { Action, RankedAd, Strategy } from './types';

export const HEALING_POTION_ID = 'hpot';

export interface ExpectedValueOptions {
  /** Buy a potion when lives are at or below this (BOT-05). */
  potionThreshold: number;
  /** Gold kept back for an emergency potion before buying upgrades. */
  potionReserve: number;
  /** Level from which the 300-gold upgrades are bought. */
  premiumFromLevel: number;
}

export const DEFAULT_EV_OPTIONS: ExpectedValueOptions = {
  potionThreshold: 1,
  potionReserve: 50,
  premiumFromLevel: 3,
};

export class ExpectedValueStrategy implements Strategy {
  readonly name: string = 'expected-value';
  private readonly options: ExpectedValueOptions;

  constructor(options: Partial<ExpectedValueOptions> = {}) {
    this.options = { ...DEFAULT_EV_OPTIONS, ...options };
  }

  rankAds(stats: GameStats, ads: Ad[]): RankedAd[] {
    return ads.map((ad) => toRankedAd(ad, stats.lives)).sort(byExpectedValue);
  }

  chooseActions(stats: GameStats, ads: Ad[], shop: ShopItem[]): Action[] {
    const actions: Action[] = [];
    const purchase = this.choosePurchase(stats, shop);

    if (purchase) {
      actions.push({ type: 'buy', itemId: purchase.id });
    }

    // CORE-08: traps sort last, so the top entry is still an ad when every ad is risky.
    const best = this.rankAds(stats, ads)[0];

    if (best) {
      actions.push({ type: 'solve', adId: best.ad.adId });
    }

    return actions;
  }

  private choosePurchase(stats: GameStats, shop: ShopItem[]): ShopItem | undefined {
    const potion = shop.find((item) => item.id === HEALING_POTION_ID);

    if (potion && stats.lives <= this.options.potionThreshold && stats.gold >= potion.cost) {
      return potion;
    }

    const spare = stats.gold - this.options.potionReserve;
    const upgrades = shop.filter((item) => item.id !== HEALING_POTION_ID && item.cost <= spare).sort((a, b) => a.cost - b.cost);
    const premium = upgrades.filter((item) => item.cost >= 300);

    if (stats.level >= this.options.premiumFromLevel && premium.length > 0) {
      return premium[0];
    }

    return upgrades[0];
  }
}
