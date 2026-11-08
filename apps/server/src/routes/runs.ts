import { isRunActive, runListSchema, runSchema, startRunRequestSchema, startRunResponseSchema } from '@mugloar/core';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { PublishedEvent, RunRegistry } from '../runs/registry';

const params = z.object({ id: z.string().uuid('Run ids are UUIDs.') });
// `curl -X POST` with no body is a valid "start with defaults"; Fastify passes that as null.
const optionalBody = z.preprocess((body) => body ?? {}, startRunRequestSchema);
const HEARTBEAT_MS = 15_000;

export const runRoutes: FastifyPluginCallbackZod<{ registry: RunRegistry }> = (app, { registry }, done) => {
  // BOT-11
  app.post(
    '/api/runs',
    {
      schema: { body: optionalBody, response: { 201: startRunResponseSchema } },
    },
    async (request, reply) => {
      const run = await registry.start(request.body);

      return reply.status(201).send({ runId: run.runId, gameId: run.gameId, status: run.status });
    },
  );
  // BOT-13
  app.get('/api/runs', { schema: { response: { 200: runListSchema } } }, () => ({
    runs: registry.list(),
  }));
  app.get('/api/runs/:id', { schema: { params, response: { 200: runSchema } } }, (request) => registry.get(request.params.id));
  // BOT-12
  app.post('/api/runs/:id/stop', { schema: { params } }, async (request, reply) => {
    const run = registry.stop(request.params.id);

    return reply.status(202).send({ runId: run.runId, status: run.status });
  });
  // BOT-14: Server-Sent Events. History first, then live events until the run ends.
  app.get('/api/runs/:id/events', { schema: { params } }, async (request, reply) => {
    const lastSeen = Number(request.headers['last-event-id'] ?? -1);
    const raw = reply.raw;
    let nextId = 0;
    const send = ({ json }: PublishedEvent): void => {
      const id = nextId++;

      // A reconnecting EventSource sends Last-Event-ID, so it only gets what it missed.
      if (id > lastSeen) {
        raw.write(`id: ${id}\ndata: ${json}\n\n`);
      }
    };
    // Live events arrive only after this handler returns, by which time `close` exists.
    const subscription = registry.subscribe(request.params.id, (published) => {
      send(published);

      const { event } = published;

      if (event.type === 'status' && !isRunActive(event.status)) {
        close();
      }
    });

    reply.hijack();
    raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    subscription.history.forEach(send);

    if (subscription.ended) {
      raw.end();

      return;
    }

    const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS);
    const close = (): void => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
      raw.end();
    };

    raw.on('close', close);
  });
  done();
};
