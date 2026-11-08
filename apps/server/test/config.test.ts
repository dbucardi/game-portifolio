import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';

describe('loadConfig (BOT-16)', () => {
  it('uses documented defaults', () => {
    expect(loadConfig({})).toMatchObject({
      PORT: 3000,
      GAME_API_URL: 'https://dragonsofmugloar.com/api/v2',
      DEFAULT_STRATEGY: 'expected-value',
      MAX_TURNS: 500,
      MAX_ACTIVE_RUNS: 5,
      BENCH_MAX_CONCURRENCY: 4,
    });
  });
  it('reads and coerces values from the environment', () => {
    expect(loadConfig({ PORT: '4000', DEFAULT_STRATEGY: 'safest-first', MAX_TURNS: '50' })).toMatchObject({
      PORT: 4000,
      DEFAULT_STRATEGY: 'safest-first',
      MAX_TURNS: 50,
    });
  });
  it('names every invalid setting (VAL-03)', () => {
    const load = () => loadConfig({ PORT: 'abc', DEFAULT_STRATEGY: 'random', MAX_ACTIVE_RUNS: '0' });

    expect(load).toThrow(ConfigError);
    expect(load).toThrow(/PORT[\s\S]*DEFAULT_STRATEGY[\s\S]*MAX_ACTIVE_RUNS/);
  });
});
