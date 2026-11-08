import { z } from 'zod';
import { gameStatsSchema, reputationSchema } from '../api/schemas';
import { gameOverReasonSchema } from '../events';
import { strategyNameSchema } from '../strategy';

/**
 * The bot service HTTP contract (docs/PLAN.md §2), shared by the service and the web app
 * so both validate the same shapes (VAL-05).
 */

export const MAX_TURNS_LIMIT = 5000;

export const DEFAULT_MAX_TURNS = 500;

const maxTurnsMessage = `Enter a whole number from 1 to ${MAX_TURNS_LIMIT}.`;

export const maxTurnsSchema = z.coerce
  .number({ invalid_type_error: maxTurnsMessage })
  .int(maxTurnsMessage)
  .min(1, maxTurnsMessage)
  .max(MAX_TURNS_LIMIT, maxTurnsMessage);

export const startRunRequestSchema = z.object({
  strategy: strategyNameSchema.optional(),
  maxTurns: maxTurnsSchema.optional(),
});

export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const RUN_STATUSES = ['running', 'stopping', 'stopped', 'finished', 'failed'] as const;

export const runStatusSchema = z.enum(RUN_STATUSES);

export type RunStatus = z.infer<typeof runStatusSchema>;

const ACTIVE_RUN_STATUSES: ReadonlySet<RunStatus> = new Set(['running', 'stopping']);

export const isRunActive = (status: RunStatus): boolean => ACTIVE_RUN_STATUSES.has(status);

export const runSummarySchema = z.object({
  score: z.number(),
  turns: z.number(),
  reason: z.string(),
});

export const runSchema = z.object({
  runId: z.string(),
  gameId: z.string(),
  strategy: strategyNameSchema,
  maxTurns: z.number(),
  status: runStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  stats: gameStatsSchema.nullable(),
  summary: runSummarySchema.nullable(),
});

export type Run = z.infer<typeof runSchema>;

export const startRunResponseSchema = z.object({
  runId: z.string(),
  gameId: z.string(),
  status: runStatusSchema,
});

export const runListSchema = z.object({ runs: z.array(runSchema) });

export const SERVICE_ERROR_CODES = ['invalid', 'not-found', 'conflict', 'cap-reached', 'game-api', 'internal'] as const;

export type ServiceErrorCode = (typeof SERVICE_ERROR_CODES)[number];

export const errorBodySchema = z.object({
  error: z.object({
    code: z.enum(SERVICE_ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;

const questEventFields = {
  adId: z.string(),
  adMessage: z.string(),
  reward: z.number(),
  probability: z.string(),
  resultMessage: z.string(),
  stats: gameStatsSchema,
};

/** One SSE message on /api/runs/:id/events. Game events plus run status changes. */
export const runEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), gameId: z.string(), stats: gameStatsSchema }),
  z.object({ type: z.literal('solved'), ...questEventFields }),
  z.object({ type: z.literal('failed'), ...questEventFields }),
  z.object({
    type: z.literal('bought'),
    itemId: z.string(),
    itemName: z.string(),
    cost: z.number(),
    success: z.boolean(),
    stats: gameStatsSchema,
  }),
  z.object({ type: z.literal('investigated'), reputation: reputationSchema, stats: gameStatsSchema }),
  z.object({
    type: z.literal('gameOver'),
    reason: gameOverReasonSchema,
    stats: gameStatsSchema,
  }),
  z.object({
    type: z.literal('status'),
    status: runStatusSchema,
    summary: runSummarySchema.nullable().optional(),
    error: z.string().optional(),
  }),
]);

export type RunEvent = z.infer<typeof runEventSchema>;
