import { DEFAULT_GAME_API_URL, DEFAULT_MAX_TURNS, maxTurnsSchema, strategyNameSchema } from '@mugloar/core';
import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

/** BOT-16: every setting comes from the environment and is validated at startup. */
export const configSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  GAME_API_URL: z.string().url().default(DEFAULT_GAME_API_URL),
  DEFAULT_STRATEGY: strategyNameSchema.default('expected-value'),
  MAX_TURNS: maxTurnsSchema.default(DEFAULT_MAX_TURNS),
  MAX_ACTIVE_RUNS: positiveInt.default(5),
  BENCH_MAX_CONCURRENCY: positiveInt.default(4),
  BENCH_MAX_GAMES: positiveInt.default(200),
  RUN_TTL_MS: positiveInt.default(30 * 60 * 1000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);

  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);

    throw new ConfigError(`Invalid settings:\n${problems.join('\n')}`);
  }

  return parsed.data;
}
