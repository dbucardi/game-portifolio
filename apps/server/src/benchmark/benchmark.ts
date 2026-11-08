import {
  createStrategy as createCoreStrategy,
  maxTurnsSchema,
  playGame,
  STRATEGY_NAMES,
  strategyNameSchema,
  successRate,
  TARGET_SCORE,
  type GameApi,
  type GameEvent,
  type Strategy,
  type StrategyName,
} from '@mugloar/core';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { errorMessage } from '../errors';
import { mean, round, runPooled, scoreStats, type ScoreStats } from './stats';

export interface BenchmarkLimits {
  maxGames: number;
  maxConcurrency: number;
  defaultMaxTurns: number;
}

/** VAL-03: the caps come from settings, so the schema is built from them. */
export function benchmarkRequestSchema(limits: BenchmarkLimits) {
  return z.object({
    games: z.number().int().min(1).max(limits.maxGames),
    concurrency: z.number().int().min(1).max(limits.maxConcurrency).optional(),
    strategies: z
      .array(strategyNameSchema)
      .min(1)
      .max(STRATEGY_NAMES.length)
      .refine((names) => new Set(names).size === names.length, 'Strategies must be unique.')
      .optional(),
    maxTurns: maxTurnsSchema.optional(),
  });
}

export type BenchmarkRequest = z.infer<ReturnType<typeof benchmarkRequestSchema>>;

export interface LabelCalibration {
  label: string;
  attempts: number;
  successes: number;
  observedRate: number;
  /** What CORE-04's table assumes today. */
  estimatedRate: number;
}

export interface StrategyReport {
  strategy: StrategyName;
  games: number;
  /** Games that ended normally; the rest failed with an error (ERR-07). */
  completed: number;
  errors: string[];
  reachedTarget: number;
  /** Share of all games, failed ones included, that reached the target score (BOT-20). */
  successRate: number;
  score: ScoreStats;
  meanTurns: number;
  endReasons: Record<string, number>;
  calibration: LabelCalibration[];
}

export interface BenchmarkReport {
  targetScore: number;
  gamesPerStrategy: number;
  concurrency: number;
  maxTurns: number;
  durationMs: number;
  strategies: StrategyReport[];
}

interface GameOutcome {
  strategy: StrategyName;
  score: number;
  turns: number;
  reason: string;
  error?: string;
  solves: { label: string; success: boolean }[];
}

export interface BenchmarkOptions {
  api: GameApi;
  limits: BenchmarkLimits;
  defaultStrategy: StrategyName;
  logger?: FastifyBaseLogger;
  signal?: AbortSignal;
  createStrategy?: (name: StrategyName) => Strategy;
}

/** BOT-21 – BOT-24: plays N games per strategy, a few at a time, and summarises them. */
export async function runBenchmark(request: BenchmarkRequest, options: BenchmarkOptions): Promise<BenchmarkReport> {
  const strategies = request.strategies ?? [options.defaultStrategy];
  const concurrency = request.concurrency ?? options.limits.maxConcurrency;
  const maxTurns = request.maxTurns ?? options.limits.defaultMaxTurns;
  const startedAt = Date.now();
  const tasks = strategies.flatMap((strategy) =>
    Array.from({ length: request.games }, (_, index) => async (): Promise<GameOutcome> => {
      const outcome = await playOne(strategy, maxTurns, options);

      options.logger?.info({ strategy, game: index + 1, score: outcome.score, reason: outcome.reason }, 'benchmark game ended');

      return outcome;
    }),
  );
  const outcomes = await runPooled(tasks, concurrency, options.signal);

  return {
    targetScore: TARGET_SCORE,
    gamesPerStrategy: request.games,
    concurrency,
    maxTurns,
    durationMs: Date.now() - startedAt,
    strategies: strategies.map((strategy) =>
      summarise(
        strategy,
        outcomes.filter((outcome) => outcome.strategy === strategy),
      ),
    ),
  };
}

async function playOne(name: StrategyName, maxTurns: number, options: BenchmarkOptions): Promise<GameOutcome> {
  const strategy = (options.createStrategy ?? createCoreStrategy)(name);
  const solves: GameOutcome['solves'] = [];
  let last: GameEvent | undefined;
  const onEvent = (event: GameEvent): void => {
    last = event;

    if (event.type === 'solved' || event.type === 'failed') {
      solves.push({ label: event.probability, success: event.type === 'solved' });
    }
  };

  try {
    const result = await playGame(options.api, strategy, {
      maxTurns,
      signal: options.signal,
      onEvent,
    });

    return {
      strategy: name,
      score: result.stats.score,
      turns: result.stats.turn,
      reason: result.reason,
      solves,
    };
  } catch (error) {
    // ERR-07: one broken game is counted, not fatal.
    return {
      strategy: name,
      score: last?.stats.score ?? 0,
      turns: last?.stats.turn ?? 0,
      reason: 'error',
      error: errorMessage(error),
      solves,
    };
  }
}

function summarise(strategy: StrategyName, outcomes: readonly GameOutcome[]): StrategyReport {
  const completed = outcomes.filter((outcome) => outcome.error === undefined);
  const reachedTarget = outcomes.filter((outcome) => outcome.score >= TARGET_SCORE).length;
  const endReasons: Record<string, number> = {};

  for (const outcome of outcomes) {
    endReasons[outcome.reason] = (endReasons[outcome.reason] ?? 0) + 1;
  }

  return {
    strategy,
    games: outcomes.length,
    completed: completed.length,
    errors: outcomes.flatMap((outcome) => (outcome.error === undefined ? [] : [outcome.error])),
    reachedTarget,
    successRate: outcomes.length ? round(reachedTarget / outcomes.length, 3) : 0,
    score: scoreStats(completed.map((outcome) => outcome.score)),
    meanTurns: round(mean(completed.map((outcome) => outcome.turns))),
    endReasons,
    calibration: calibrate(outcomes.flatMap((outcome) => outcome.solves)),
  };
}

/** BOT-22: the observed success rate per label, next to the rate the strategy assumes. */
export function calibrate(solves: readonly { label: string; success: boolean }[]): LabelCalibration[] {
  const byLabel = new Map<string, { attempts: number; successes: number }>();

  for (const { label, success } of solves) {
    const entry = byLabel.get(label) ?? { attempts: 0, successes: 0 };

    entry.attempts += 1;

    if (success) {
      entry.successes += 1;
    }

    byLabel.set(label, entry);
  }

  return [...byLabel.entries()]
    .map(([label, { attempts, successes }]) => ({
      label,
      attempts,
      successes,
      observedRate: round(successes / attempts, 3),
      estimatedRate: successRate(label),
    }))
    .sort((a, b) => b.estimatedRate - a.estimatedRate || a.label.localeCompare(b.label));
}
