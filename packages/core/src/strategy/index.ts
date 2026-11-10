import { z } from 'zod';
import { SafestFirstStrategy } from './safestFirst';
import { TurnPhasedStrategy } from './turnPhased';
import type { Strategy } from './types';

export const STRATEGY_NAMES = ['turn-phased', 'safest-first'] as const;

export const strategyNameSchema = z.enum(STRATEGY_NAMES);

export type StrategyName = z.infer<typeof strategyNameSchema>;

export const STRATEGY_LABELS: Record<StrategyName, string> = {
  'turn-phased': 'Turn-phased (steal, level up, then harvest)',
  'safest-first': 'Safest first',
};

const FACTORIES: Record<StrategyName, () => Strategy> = {
  'turn-phased': () => new TurnPhasedStrategy(),
  'safest-first': () => new SafestFirstStrategy(),
};

export function createStrategy(name: StrategyName): Strategy {
  return FACTORIES[name]();
}

export * from './types';

export * from './scoring';

export { BaseStrategy, HEALING_POTION_ID, DEFAULT_SHOPPING_OPTIONS } from './base';

export type { ShoppingOptions } from './base';

export { SafestFirstStrategy, DEFAULT_MIN_LIVES_BEFORE_UPGRADES, DOUBLE_UPGRADE_COST } from './safestFirst';

export type { SafestFirstOptions } from './safestFirst';

export { TurnPhasedStrategy, DEFAULT_STEAL_BUDGET, STEAL_SUCCESS_RATE, DEFAULT_BUILD_UNTIL_TURN, DEFAULT_UPGRADE_UNTIL_TURN } from './turnPhased';

export type { TurnPhasedOptions } from './turnPhased';
