import type { GameStats, ShopItem } from '../api/schemas';
import type { Ad } from '../decode';
import type { GameEvent } from '../events';

export type Action = { type: 'solve'; adId: string } | { type: 'buy'; itemId: string };

export interface RankedAd {
  ad: Ad;
  successRate: number;
  expectedValue: number;
  trap: boolean;
}

/** CORE-05: every policy sits behind this one interface. */
export interface Strategy {
  readonly name: string;
  /** Best ad first. The web app shows this ranking as hints (WEB-07). */
  rankAds(stats: GameStats, ads: Ad[]): RankedAd[];
  /** Purchases first, then at most one solve. Empty only when there is nothing to do. */
  chooseActions(stats: GameStats, ads: Ad[], shop: ShopItem[]): Action[];
  /** Optional: sees every event of the game, for strategies that learn from outcomes. One instance plays one game. */
  observe?(event: GameEvent): void;
}
