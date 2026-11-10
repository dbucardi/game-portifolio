import { describe, expect, it } from 'vitest';
import type { ShopItem } from '../src/api/schemas';
import type { Ad } from '../src/decode';
import type { GameEvent } from '../src/events';
import { riskTier, successRate, UNKNOWN_SUCCESS_RATE } from '../src/probability';
import { createStrategy, expectedValue, SafestFirstStrategy, STEAL_SUCCESS_RATE, TurnPhasedStrategy, STRATEGY_NAMES } from '../src/strategy';
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
    const ranked = new TurnPhasedStrategy({ stealBudget: 0 }).rankAds(stats(), [risky, safe]);

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
    const [first] = new TurnPhasedStrategy({ stealBudget: 0 }).rankAds(stats(), [later, sooner]);

    expect(first?.ad).toBe(sooner);
  });
  it('ranks trap ads last even when their reward is huge (CORE-07)', () => {
    const trap = ad({
      message: 'Steal super awesome diamond',
      probability: 'Piece of cake',
      reward: 999,
    });
    const honest = ad({ probability: 'Gamble', reward: 10 });
    const ranked = new TurnPhasedStrategy({ stealBudget: 0 }).rankAds(stats(), [trap, honest]);

    expect(ranked.map((entry) => [entry.ad, entry.trap])).toEqual([
      [honest, false],
      [trap, true],
    ]);
  });
});
describe('SafestFirstStrategy', () => {
  it('picks the most likely ad and buys a potion when low on lives', () => {
    const safest = ad({ probability: 'Sure thing', reward: 5 });
    const actions = new SafestFirstStrategy().chooseActions(stats({ lives: 1, gold: 500 }), [ad({ reward: 500 }), safest], shop);

    expect(actions).toEqual([
      { type: 'buy', itemId: 'hpot' },
      { type: 'solve', adId: safest.adId },
    ]);
  });
  it('buys only potions until it has 10 lives (CORE-12)', () => {
    const safest = ad({ probability: 'Sure thing' });

    expect(new SafestFirstStrategy().chooseActions(stats({ lives: 9, gold: 500 }), [safest], shop)).toEqual([
      { type: 'buy', itemId: 'hpot' },
      { type: 'solve', adId: safest.adId },
    ]);
    expect(new SafestFirstStrategy().chooseActions(stats({ lives: 3, gold: 40 }), [safest], shop)).toEqual([{ type: 'solve', adId: safest.adId }]);
  });
  it('buys upgrades once it has 10 lives (CORE-12)', () => {
    const safest = ad({ probability: 'Sure thing' });

    expect(new SafestFirstStrategy().chooseActions(stats({ lives: 10, gold: 200 }), [safest], shop)).toEqual([
      { type: 'buy', itemId: 'cs' },
      { type: 'solve', adId: safest.adId },
    ]);
  });
  it('ranks steals and risky ads after every other ad (CORE-12)', () => {
    const steal = ad({ message: 'Steal a cow from Hopkins', probability: 'Piece of cake' });
    const risky = ad({ probability: 'Gamble', reward: 500 });
    const dangerous = ad({ probability: 'Suicide mission', reward: 900 });
    const likely = ad({ probability: 'Quite likely', reward: 5 });
    const ranked = new SafestFirstStrategy().rankAds(stats(), [steal, risky, dangerous, likely]).map((entry) => entry.ad);

    expect(ranked[0]).toBe(likely);
    expect(ranked.slice(1)).toEqual(expect.arrayContaining([steal, risky, dangerous]));
  });
  it('ranks advertisement campaigns last, whatever their label (CORE-12)', () => {
    const campaign = ad({ message: 'Create an advertisement campaign for Ian Haig to promote their bakery', probability: 'Piece of cake' });
    const likely = ad({ probability: 'Quite likely' });

    expect(new SafestFirstStrategy().rankAds(stats(), [campaign, likely]).map((entry) => entry.ad)).toEqual([likely, campaign]);
  });
  it('still picks an ad when only steals and risky ads are on offer (CORE-08)', () => {
    const risky = ad({ probability: 'Risky' });

    expect(new SafestFirstStrategy().chooseActions(stats(), [risky], shop)).toEqual([{ type: 'solve', adId: risky.adId }]);
  });
});
describe('TurnPhasedStrategy steal budget (CORE-09)', () => {
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
    const [first] = new TurnPhasedStrategy().rankAds(stats(), [honest, steal]);

    expect(first?.ad).toBe(steal);
    expect(first?.successRate).toBe(STEAL_SUCCESS_RATE);
    expect(first?.trap).toBe(false);
  });
  it('treats steals as traps again once the budget is spent', () => {
    const strategy = new TurnPhasedStrategy({ stealBudget: 2 });

    strategy.observe(outcome('solved', steal));
    strategy.observe(outcome('solved', steal));
    expect(strategy.rankAds(stats(), [steal, honest]).map((entry) => entry.ad)).toEqual([honest, steal]);
  });
  it('spends budget only on successful steals', () => {
    const strategy = new TurnPhasedStrategy({ stealBudget: 1 });

    strategy.observe(outcome('failed', steal));
    strategy.observe(outcome('solved', honest));
    expect(strategy.rankAds(stats(), [honest, steal])[0]?.ad).toBe(steal);
  });
  it('still picks an ad when only steals are on offer (CORE-08)', () => {
    const strategy = new TurnPhasedStrategy({ stealBudget: 0 });

    expect(strategy.chooseActions(stats(), [steal], shop)).toEqual([{ type: 'solve', adId: steal.adId }]);
  });
});
describe('TurnPhasedStrategy (CORE-13)', () => {
  const steal = ad({ message: 'Steal water delivery to Obed Derrickson', reward: 140, probability: 'Sure thing' });
  const quest = ad({ message: 'Help defending meadow in Voidbane from the intruders', reward: 200, probability: 'Piece of cake' });

  it('buys the cheapest upgrade whenever gold allows while building', () => {
    expect(new TurnPhasedStrategy().chooseActions(stats({ turn: 10, gold: 500 }), [quest], shop)).toEqual([
      { type: 'buy', itemId: 'cs' },
      { type: 'solve', adId: quest.adId },
    ]);
  });
  it('buys only double upgrades while harvesting, keeping the potion reserve', () => {
    const strategy = new TurnPhasedStrategy();

    expect(strategy.chooseActions(stats({ turn: 30, gold: 349 }), [quest], shop)).toEqual([{ type: 'solve', adId: quest.adId }]);
    expect(strategy.chooseActions(stats({ turn: 30, gold: 350 }), [quest], shop)).toEqual([
      { type: 'buy', itemId: 'ch' },
      { type: 'solve', adId: quest.adId },
    ]);
  });
  it('stops buying upgrades from the upgrade cut-off turn', () => {
    expect(new TurnPhasedStrategy().chooseActions(stats({ turn: 40, gold: 1000 }), [quest], shop)).toEqual([{ type: 'solve', adId: quest.adId }]);
  });
  it('still buys a potion on the last life, in every phase', () => {
    for (const turn of [0, 30, 90]) {
      expect(new TurnPhasedStrategy().chooseActions(stats({ turn, lives: 1, gold: 500 }), [quest], shop)[0]).toEqual({ type: 'buy', itemId: 'hpot' });
    }
  });
  it('spends the steal budget like steal budget (CORE-09)', () => {
    const [first] = new TurnPhasedStrategy().rankAds(stats(), [ad({ probability: 'Piece of cake', reward: 20 }), steal]);

    expect(first?.ad).toBe(steal);
  });
  it('still picks an ad when only steals are on offer (CORE-08)', () => {
    expect(new TurnPhasedStrategy({ stealBudget: 0 }).chooseActions(stats({ turn: 50 }), [steal], shop)).toEqual([{ type: 'solve', adId: steal.adId }]);
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
