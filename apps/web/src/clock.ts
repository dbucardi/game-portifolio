/** FUN-09: the suspense timer is injected, so tests can drive it without real waiting. */
export interface Clock {
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export const browserClock: Clock = {
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    window.clearTimeout(handle);
  },
};
