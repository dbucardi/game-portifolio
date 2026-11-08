import '@testing-library/jest-dom/vitest';
import { EventSource } from 'eventsource';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw';

// jsdom has neither; the polyfill streams over fetch, so MSW serves it too.
Object.assign(globalThis, { EventSource });
Object.defineProperty(window, 'matchMedia', {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => {
  server.close();
});
