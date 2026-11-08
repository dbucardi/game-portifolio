import { createFakeGameApi, type FakeGameOptions } from '@mugloar/core/testing';
import { GameApiClient, type RunEvent } from '@mugloar/core';
import { render, type RenderOptions } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { createApp, type Component } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { BotServiceClient } from '@/api/botServiceClient';
import type { Clock } from '@/clock';
import { installPlugins, type AppDependencies } from '@/plugins';
import { routes } from '@/router';
import { server } from './msw';

export const BOT_URL = 'http://bot.test';

export interface FakeClock extends Clock {
  /** Runs every timer due within `ms`, in order. */
  advance(ms: number): void;
}

/** FUN-09: suspense timers only fire when a test moves this clock. */
export function createFakeClock(): FakeClock {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();

  return {
    setTimeout(callback, ms) {
      const handle = nextHandle++;

      timers.set(handle, { at: now + ms, callback });

      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    },
    advance(ms) {
      const target = now + ms;

      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort(([, a], [, b]) => a.at - b.at)[0];

        if (!due) {
          break;
        }

        const [handle, timer] = due;

        timers.delete(handle);
        now = timer.at;
        timer.callback();
      }

      now = target;
    },
  };
}

export function testDependencies(clock: Clock = createFakeClock()): AppDependencies {
  return {
    gameApi: new GameApiClient({ retries: 0, timeoutMs: 2000 }),
    botService: new BotServiceClient({ baseUrl: BOT_URL, timeoutMs: 2000 }),
    clock,
    random: () => 0,
  };
}

/** Serves the in-memory game from @mugloar/core/testing for the current test. */
export function useFakeGameApi(options?: FakeGameOptions) {
  const fake = createFakeGameApi(options);

  server.use(...fake.handlers);

  return fake;
}

/** For store tests: a bare app with the real plugins, so stores can inject their clients. */
export function createTestApp(deps: AppDependencies = testDependencies()) {
  const app = createApp({ render: () => null });

  installPlugins(app, deps);

  return app;
}

export function renderWithPlugins(component: Component, options: Omit<RenderOptions<Component>, 'global'> & { deps?: AppDependencies } = {}) {
  const { deps = testDependencies(), ...renderOptions } = options;
  const router = createRouter({ history: createMemoryHistory(), routes });
  const user = userEvent.setup();
  const result = render(component, {
    ...renderOptions,
    global: {
      plugins: [
        {
          install: (app) => {
            installPlugins(app, deps);
          },
        },
        router,
      ],
    },
  });

  return { ...result, user, router };
}

export function sseResponse(events: RunEvent[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`retry: 60000\n\n${body}`));
      controller.close();
    },
  });

  return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}
