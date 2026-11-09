import { z } from 'zod';
import { ExpectedValueStrategy } from './expectedValue';
import { SafestFirstStrategy } from './safestFirst';
import { StealBudgetStrategy } from './stealBudget';
import type { Strategy } from './types';

export const STRATEGY_NAMES = ['expected-value', 'safest-first', 'steal-budget'] as const;

export const strategyNameSchema = z.enum(STRATEGY_NAMES);

export type StrategyName = z.infer<typeof strategyNameSchema>;

export const STRATEGY_LABELS: Record<StrategyName, string> = {
  'expected-value': 'Expected value',
  'safest-first': 'Safest first',
  'steal-budget': 'Steal budget',
};

const FACTORIES: Record<StrategyName, () => Strategy> = {
  'expected-value': () => new ExpectedValueStrategy(),
  'safest-first': () => new SafestFirstStrategy(),
  'steal-budget': () => new StealBudgetStrategy(),
};

export function createStrategy(name: StrategyName): Strategy {
  return FACTORIES[name]();
}

export * from './types';

export * from './scoring';

export { ExpectedValueStrategy, HEALING_POTION_ID, DEFAULT_EV_OPTIONS } from './expectedValue';

export type { ExpectedValueOptions } from './expectedValue';

export { SafestFirstStrategy } from './safestFirst';

export { StealBudgetStrategy, DEFAULT_STEAL_BUDGET, STEAL_SUCCESS_RATE } from './stealBudget';

export type { StealBudgetOptions } from './stealBudget';
