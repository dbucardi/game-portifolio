import { GameApiClient, type RunEvent } from '@mugloar/core';
import { createFakeGameApi, type FakeGameOptions } from '@mugloar/core/testing';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { buildApp, type App } from '../src/app';
import { configSchema, type Config } from '../src/config';

export const GAME_API = 'https://game.test/api/v2';

export const server = setupServer();

const heldGates = new Set<() => void>();
const cleanups: (() => Promise<unknown>)[] = [];

/** Runs after the test, once held requests are released but before the fake API goes away. */
export function onCleanup(cleanup: () => Promise<unknown>): void {
  cleanups.push(cleanup);
}

/** Registers MSW for the file; requests to the service under test itself pass through. */
export function useFakeNetwork(): void {
  beforeAll(() => {
    server.listen({
      onUnhandledRequest: (request, print) => {
        if (new URL(request.url).hostname !== '127.0.0.1') {
          print.error();
        }
      },
    });
  });
  afterEach(async () => {
    for (const release of heldGates) {
      release();
    }

    heldGates.clear();
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
}

export function fakeGame(options: FakeGameOptions = {}) {
  const fake = createFakeGameApi({ baseUrl: GAME_API, ...options });

  server.use(...fake.handlers);

  return fake;
}

export function gameApi(): GameApiClient {
  return new GameApiClient({ baseUrl: GAME_API, retryBaseDelayMs: 0, timeoutMs: 2000 });
}

export function testConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  return configSchema.parse({ GAME_API_URL: GAME_API, LOG_LEVEL: 'silent', ...overrides });
}

export async function testApp(overrides: Partial<Record<keyof Config, string>> = {}): Promise<App> {
  const app = await buildApp({ config: testConfig(overrides), api: gameApi(), logger: false });

  onCleanup(() => app.close());

  return app;
}

/**
 * Holds every solve request until `release()` so a run stays `running` for as long as a test
 * needs. The handler returns nothing, so MSW then falls through to the fake game API.
 */
export function holdSolves() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  heldGates.add(release);
  server.use(
    http.post(`${GAME_API}/:gameId/solve/:adId`, async () => {
      await gate;
    }),
  );

  return { release };
}

export async function waitFor<T>(check: () => T | undefined | false, timeoutMs = 2000): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = check();

    if (value) {
      return value;
    }

    if (Date.now() > deadline) {
      throw new Error('waitFor timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export function parseSse(text: string): { id: number; event: RunEvent }[] {
  return text
    .split('\n\n')
    .filter((block) => block.includes('data: '))
    .map((block) => {
      const id = Number(/^id: (\d+)$/m.exec(block)?.[1]);
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? '';

      return { id, event: JSON.parse(data) as RunEvent };
    });
}
