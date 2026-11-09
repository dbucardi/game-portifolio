import { describe, expect, it } from 'vitest';
import type { ShopItem } from '../src/api/schemas';
import type { Ad } from '../src/decode';
import type { GameEvent } from '../src/events';
import { riskTier, successRate, UNKNOWN_SUCCESS_RATE } from '../src/probability';
import {
  createStrategy,
  ExpectedValueStrategy,
  expectedValue,
  SafestFirstStrategy,
  STEAL_SUCCESS_RATE,
  StealBudgetStrategy,
  STRATEGY_NAMES,
} from '../src/strategy';
import { gameStats as stats } from '../src/testing';

let nextId = 0;
const ad = (overrides: Partial<Ad> = {}): Ad => ({
  adId: `ad-${String(nextId++)}`,
  message: 'Help someone',
  reward: 50,
  expiresIn: 5,
  probability: 'Gamble',
  encryption: 'none',
  ...overrides,
});
const shop: ShopItem[] = [
  { id: 'hpot', name: 'Healing potion', cost: 50 },
  { id: 'cs', name: 'Claw Sharpening', cost: 100 },
  { id: 'ch', name: 'Claw Honing', cost: 300 },
];

describe('probability (CORE-04)', () => {
  it('maps known labels', () => {
    expect(successRate('Piece of cake')).toBeGreaterThan(successRate('Gamble'));
    expect(successRate('Gamble')).toBeGreaterThan(successRate('Impossible'));
  });
  it('maps an unknown label to a conservative value', () => {
    expect(successRate('Totally new label')).toBe(UNKNOWN_SUCCESS_RATE);
    expect(riskTier('Totally new label')).toBe('dangerous');
  });
  it('groups labels into risk tiers', () => {
    expect(riskTier('Sure thing')).toBe('safe');
    expect(riskTier('Hmmm....')).toBe('likely');
    expect(riskTier('Risky')).toBe('risky');
    expect(riskTier('Suicide mission')).toBe('dangerous');
  });
});
describe('expected value (CORE-06)', () => {
  it('ranks the higher-probability ad first when rewards are equal', () => {
    const safe = ad({ probability: 'Piece of cake' });
    const risky = ad({ probability: 'Risky' });
    const ranked = new ExpectedValueStrategy().rankAds(stats(), [risky, safe]);

    expect(ranked.map((entry) => entry.ad)).toEqual([safe, risky]);
  });
  it('matches the documented example: p 0.75, reward 100, life value 240', () => {
    const quite = ad({ probability: 'Quite likely', reward: 100 });

    expect(expectedValue(quite, 3)).toBeCloseTo(55);
    expect(expectedValue(quite, 1)).toBeCloseTo(15);
  });
  it('penalises risky ads more with 1 life left than with 3', () => {
    const risky = ad({ probability: 'Risky', reward: 150 });

    expect(expectedValue(risky, 1)).toBeLessThan(expectedValue(risky, 3));
  });
  it('prefers the ad that expires sooner when scores are close', () => {
    const later = ad({ probability: 'Piece of cake', reward: 100, expiresIn: 6 });
    const sooner = ad({ probability: 'Piece of cake', reward: 98, expiresIn: 1 });
    const [first] = new ExpectedValueStrategy().rankAds(stats(), [later, sooner]);

    expect(first?.ad).toBe(sooner);
  });
  it('ranks trap ads last even when their reward is huge (CORE-07)', () => {
    const trap = ad({
      message: 'Steal super awesome diamond',
      probability: 'Piece of cake',
      reward: 999,
    });
    const honest = ad({ probability: 'Gamble', reward: 10 });
    const ranked = new ExpectedValueStrategy().rankAds(stats(), [trap, honest]);

    expect(ranked.map((entry) => [entry.ad, entry.trap])).toEqual([
      [honest, false],
      [trap, true],
    ]);
  });
});
describe('ExpectedValueStrategy.chooseActions', () => {
  const strategy = new ExpectedValueStrategy();

  it('solves the top-ranked ad', () => {
    const best = ad({ probability: 'Piece of cake', reward: 80 });

    expect(strategy.chooseActions(stats(), [ad(), best], shop)).toEqual([{ type: 'solve', adId: best.adId }]);
  });
  it('buys a potion first at 1 life with at least 50 gold (BOT-05)', () => {
    const actions = strategy.chooseActions(stats({ lives: 1, gold: 60 }), [ad()], shop);

    expect(actions[0]).toEqual({ type: 'buy', itemId: 'hpot' });
  });
  it('buys a cheap upgrade with gold to spare beyond the potion reserve', () => {
    const actions = strategy.chooseActions(stats({ gold: 160 }), [ad()], shop);

    expect(actions[0]).toEqual({ type: 'buy', itemId: 'cs' });
  });
  it('buys a premium upgrade once the level is high enough', () => {
    const actions = strategy.chooseActions(stats({ gold: 400, level: 3 }), [ad()], shop);

    expect(actions[0]).toEqual({ type: 'buy', itemId: 'ch' });
  });
  it('still picks an ad when every ad is high risk (CORE-08)', () => {
    const ads = [ad({ probability: 'Impossible' }), ad({ probability: 'Suicide mission', message: 'Steal it' })];
    const actions = strategy.chooseActions(stats({ lives: 1 }), ads, shop);

    expect(actions).toEqual([{ type: 'solve', adId: ads[0]?.adId }]);
  });
  it('returns no actions when there are no ads and nothing to buy', () => {
    expect(strategy.chooseActions(stats(), [], shop)).toEqual([]);
  });
});
describe('SafestFirstStrategy', () => {
  it('picks the most likely ad and only buys potions', () => {
    const safest = ad({ probability: 'Sure thing', reward: 5 });
    const actions = new SafestFirstStrategy().chooseActions(stats({ lives: 1, gold: 500 }), [ad({ reward: 500 }), safest], shop);

    expect(actions).toEqual([
      { type: 'buy', itemId: 'hpot' },
      { type: 'solve', adId: safest.adId },
    ]);
  });
});
describe('StealBudgetStrategy (CORE-09)', () => {
  const steal = ad({ message: 'Steal water delivery to Obed Derrickson', reward: 140, probability: 'Sure thing' });
  const honest = ad({ message: 'Escort Roy Wilkinson to plains', reward: 78, probability: 'Piece of cake' });
  const outcome = (type: 'solved' | 'failed', target: Ad): GameEvent => ({
    type,
    adId: target.adId,
    adMessage: target.message,
    reward: target.reward,
    probability: target.probability,
    resultMessage: '',
    stats: stats(),
  });

  it('picks a well-paid steal while the budget lasts', () => {
    const [first] = new StealBudgetStrategy().rankAds(stats(), [honest, steal]);

    expect(first?.ad).toBe(steal);
    expect(first?.successRate).toBe(STEAL_SUCCESS_RATE);
    expect(first?.trap).toBe(false);
  });
  it('treats steals as traps again once the budget is spent', () => {
    const strategy = new StealBudgetStrategy({ stealBudget: 2 });

    strategy.observe(outcome('solved', steal));
    strategy.observe(outcome('solved', steal));
    expect(strategy.rankAds(stats(), [steal, honest]).map((entry) => entry.ad)).toEqual([honest, steal]);
  });
  it('spends budget only on successful steals', () => {
    const strategy = new StealBudgetStrategy({ stealBudget: 1 });

    strategy.observe(outcome('failed', steal));
    strategy.observe(outcome('solved', honest));
    expect(strategy.rankAds(stats(), [honest, steal])[0]?.ad).toBe(steal);
  });
  it('still picks an ad when only steals are on offer (CORE-08)', () => {
    const strategy = new StealBudgetStrategy({ stealBudget: 0 });

    expect(strategy.chooseActions(stats(), [steal], shop)).toEqual([{ type: 'solve', adId: steal.adId }]);
  });
});
describe('createStrategy (CORE-05)', () => {
  it('builds every named strategy behind the same interface', () => {
    for (const name of STRATEGY_NAMES) {
      const strategy = createStrategy(name);

      expect(strategy.name).toBe(name);
      expect(strategy.chooseActions(stats(), [ad()], shop)).toHaveLength(1);
    }
  });
});
