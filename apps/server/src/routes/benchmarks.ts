import type { GameApi } from '@mugloar/core';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { benchmarkRequestSchema, runBenchmark } from '../benchmark/benchmark';
import type { Config } from '../config';

export const benchmarkRoutes: FastifyPluginCallbackZod<{ api: GameApi; config: Config }> = (app, { api, config }, done) => {
  const limits = {
    maxGames: config.BENCH_MAX_GAMES,
    maxConcurrency: config.BENCH_MAX_CONCURRENCY,
    defaultMaxTurns: config.MAX_TURNS,
  };

  // BOT-21: one request plays every game and answers with the report.
  app.post('/api/benchmarks', { schema: { body: benchmarkRequestSchema(limits) } }, async (request, reply) => {
    // If the caller hangs up, stop the games instead of playing them for nobody.
    const controller = new AbortController();

    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) {
        controller.abort();
      }
    });

    return runBenchmark(request.body, {
      api,
      limits,
      defaultStrategy: config.DEFAULT_STRATEGY,
      logger: request.log,
      signal: controller.signal,
    });
  });
  done();
};
