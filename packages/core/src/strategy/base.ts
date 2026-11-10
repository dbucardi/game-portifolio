import type { GameStats, ShopItem } from '../api/schemas';
import type { Ad } from '../decode';
import type { Action, RankedAd, Strategy } from './types';

export const HEALING_POTION_ID = 'hpot';

export interface ShoppingOptions {
  /** Buy a potion when lives are at or below this (BOT-05). */
  potionThreshold: number;
  /** Gold kept back for an emergency potion before buying upgrades. */
  potionReserve: number;
}

export const DEFAULT_SHOPPING_OPTIONS: ShoppingOptions = {
  potionThreshold: 1,
  potionReserve: 50,
};

/** Shared turn shape: at most one purchase, then the top-ranked ad. */
export abstract class BaseStrategy implements Strategy {
  abstract readonly name: string;
  protected readonly options: ShoppingOptions;

  constructor(options: Partial<ShoppingOptions> = {}) {
    this.options = { ...DEFAULT_SHOPPING_OPTIONS, ...options };
  }

  abstract rankAds(stats: GameStats, ads: Ad[]): RankedAd[];

  protected abstract choosePurchase(stats: GameStats, shop: ShopItem[]): ShopItem | undefined;

  chooseActions(stats: GameStats, ads: Ad[], shop: ShopItem[]): Action[] {
    const actions: Action[] = [];
    const purchase = this.choosePurchase(stats, shop);

    if (purchase) {
      actions.push({ type: 'buy', itemId: purchase.id });
    }

    // CORE-08: avoided ads sort last, so the top entry is still an ad when every ad is risky.
    const best = this.rankAds(stats, ads)[0];

    if (best) {
      actions.push({ type: 'solve', adId: best.ad.adId });
    }

    return actions;
  }

  protected emergencyPotion(stats: GameStats, shop: ShopItem[]): ShopItem | undefined {
    const potion = shop.find((item) => item.id === HEALING_POTION_ID);

    return potion && stats.lives <= this.options.potionThreshold && stats.gold >= potion.cost ? potion : undefined;
  }

  /** Upgrades affordable while keeping the potion reserve, cheapest first. */
  protected affordableUpgrades(stats: GameStats, shop: ShopItem[]): ShopItem[] {
    const spare = stats.gold - this.options.potionReserve;

    return shop.filter((item) => item.id !== HEALING_POTION_ID && item.cost <= spare).sort((a, b) => a.cost - b.cost);
  }
}
