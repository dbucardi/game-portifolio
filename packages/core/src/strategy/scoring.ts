import type { Ad } from '../decode';
import { successRate } from '../probability';
import type { RankedAd } from './types';

/** Gold-equivalent value of one life at 1 life left; it shrinks as lives grow (CORE-06). */
export const LIFE_VALUE = 240;

/**
 * CORE-07: ads matching these are kept visible but never auto-picked while a safer ad exists.
 * "Steal" ads are the ones that hurt reputation in the brief's lore; the benchmark confirms the rule.
 */
export const TRAP_PATTERNS: readonly RegExp[] = [/\bsteal\b/i];

/**
 * CORE-12: quests that fail often whatever their label says. Unlike traps they cost no reputation,
 * so only strategies that play safe avoid them. Reported from play, not yet measured by the benchmark.
 */
export const UNRELIABLE_PATTERNS: readonly RegExp[] = [/\badvertisement campaign\b/i];

/** Scores within this many gold are a tie, and the ad that expires sooner wins. */
export const TIE_MARGIN = 5;

export function lifeCost(lives: number): number {
  return LIFE_VALUE / Math.max(lives, 1);
}

export function expectedValue(ad: Ad, lives: number): number {
  const p = successRate(ad.probability);

  return p * ad.reward - (1 - p) * lifeCost(lives);
}

export function isTrap(ad: Ad): boolean {
  return TRAP_PATTERNS.some((pattern) => pattern.test(ad.message));
}

export function isUnreliable(ad: Ad): boolean {
  return UNRELIABLE_PATTERNS.some((pattern) => pattern.test(ad.message));
}

export function toRankedAd(ad: Ad, lives: number): RankedAd {
  return {
    ad,
    successRate: successRate(ad.probability),
    expectedValue: expectedValue(ad, lives),
    trap: isTrap(ad),
  };
}

export function byExpectedValue(a: RankedAd, b: RankedAd): number {
  if (a.trap !== b.trap) {
    return a.trap ? 1 : -1;
  }

  const diff = b.expectedValue - a.expectedValue;

  if (Math.abs(diff) > TIE_MARGIN) {
    return diff;
  }

  return a.ad.expiresIn - b.ad.expiresIn || diff;
}
