import type { GameStats, ShopItem } from '../api/schemas';
import type { Ad } from '../decode';
import { HEALING_POTION_ID } from './expectedValue';
import { toRankedAd } from './scoring';
import type { Action, RankedAd, Strategy } from './types';

/** Baseline: the most likely ad wins, reward breaks ties. Only ever buys potions. */
export class SafestFirstStrategy implements Strategy {
  readonly name = 'safest-first';

  rankAds(stats: GameStats, ads: Ad[]): RankedAd[] {
    return ads.map((ad) => toRankedAd(ad, stats.lives)).sort((a, b) => b.successRate - a.successRate || b.ad.reward - a.ad.reward);
  }

  chooseActions(stats: GameStats, ads: Ad[], shop: ShopItem[]): Action[] {
    const actions: Action[] = [];
    const potion = shop.find((item) => item.id === HEALING_POTION_ID);

    if (potion && stats.lives <= 1 && stats.gold >= potion.cost) {
      actions.push({ type: 'buy', itemId: potion.id });
    }

    const best = this.rankAds(stats, ads)[0];

    if (best) {
      actions.push({ type: 'solve', adId: best.ad.adId });
    }

    return actions;
  }
}
