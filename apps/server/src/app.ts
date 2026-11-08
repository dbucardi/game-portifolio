import cors from '@fastify/cors';
import { ApiError, GameApiClient, type ErrorBody, type GameApi } from '@mugloar/core';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Config } from './config';
import { ServiceError } from './errors';
import { benchmarkRoutes } from './routes/benchmarks';
import { runRoutes } from './routes/runs';
import { RunRegistry } from './runs/registry';

export interface AppOptions {
  config: Config;
  /** Injected so tests can point the service at the fake game API (NFR-05). */
  api?: GameApi;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ config, api, logger }: AppOptions) {
  const app = Fastify({
    logger: logger ?? { level: config.LOG_LEVEL },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const gameApi = api ?? new GameApiClient({ baseUrl: config.GAME_API_URL });
  const registry = new RunRegistry({
    api: gameApi,
    logger: app.log,
    defaultStrategy: config.DEFAULT_STRATEGY,
    defaultMaxTurns: config.MAX_TURNS,
    maxActiveRuns: config.MAX_ACTIVE_RUNS,
    ttlMs: config.RUN_TTL_MS,
  });

  app.addHook('onClose', () => registry.close());
  // BOT-19: the dev web app uses the Vite proxy; any other origin is allowed through CORS.
  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
  });
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const { statusCode, body } = toErrorResponse(error);

    if (statusCode >= 500) {
      request.log.error({ err: error }, body.error.message);
    }

    return reply.status(statusCode).send(body);
  });
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: 'not-found', message: `No route for ${request.method} ${request.url}.` },
    } satisfies ErrorBody),
  );
  app.get('/health', () => ({ status: 'ok', activeRuns: registry.activeCount }));
  await app.register(runRoutes, { registry });
  await app.register(benchmarkRoutes, { api: gameApi, config });

  return app;
}

/** ERR-08: one JSON error shape for every failure. */
function toErrorResponse(error: FastifyError): { statusCode: number; body: ErrorBody } {
  if (hasZodFastifySchemaValidationErrors(error)) {
    const details = error.validation.map((issue) => ({
      field: [error.validationContext, ...issue.instancePath.split('/')].filter(Boolean).join('.'),
      message: issue.message,
    }));
    const summary = details.map((detail) => `${detail.field}: ${detail.message}`).join('; ');

    return {
      statusCode: 400,
      body: { error: { code: 'invalid', message: `Invalid request. ${summary}`, details } },
    };
  }

  if (error instanceof ServiceError) {
    return {
      statusCode: error.statusCode,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }

  if (error instanceof ApiError) {
    return {
      statusCode: 502,
      body: { error: { code: 'game-api', message: `The game API failed: ${error.message}` } },
    };
  }

  // Fastify's own client errors, such as a malformed JSON body.
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    return { statusCode: 400, body: { error: { code: 'invalid', message: error.message } } };
  }

  return {
    statusCode: 500,
    body: { error: { code: 'internal', message: 'Something went wrong.' } },
  };
}

export type App = Awaited<ReturnType<typeof buildApp>>;
