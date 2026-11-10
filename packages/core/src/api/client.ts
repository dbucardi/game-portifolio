import { z } from 'zod';
import { ApiError, GameOverError, NotFoundError } from './errors';
import {
  buyResultSchema,
  gameStateSchema,
  rawAdSchema,
  reputationSchema,
  shopItemSchema,
  solveResultSchema,
  type BuyResult,
  type GameState,
  type RawAd,
  type Reputation,
  type ShopItem,
  type SolveResult,
} from './schemas';

export const DEFAULT_GAME_API_URL = 'https://dragonsofmugloar.com/api/v2';

export interface GameApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  /** Extra attempts after the first one, for transient failures only (ERR-03). */
  retries?: number;
  retryBaseDelayMs?: number;
  fetch?: typeof fetch;
}

type Method = 'GET' | 'POST';

export class GameApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryBaseDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GameApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_GAME_API_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 300;
    this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  startGame(): Promise<GameState> {
    return this.request('POST', '/game/start', gameStateSchema);
  }

  getAds(gameId: string): Promise<RawAd[]> {
    return this.request('GET', `/${enc(gameId)}/messages`, z.array(rawAdSchema));
  }

  solve(gameId: string, adId: string): Promise<SolveResult> {
    return this.request('POST', `/${enc(gameId)}/solve/${enc(adId)}`, solveResultSchema);
  }

  getShop(gameId: string): Promise<ShopItem[]> {
    return this.request('GET', `/${enc(gameId)}/shop`, z.array(shopItemSchema));
  }

  buy(gameId: string, itemId: string): Promise<BuyResult> {
    return this.request('POST', `/${enc(gameId)}/shop/buy/${enc(itemId)}`, buyResultSchema);
  }

  /** API-06: this uses up a turn, although the response does not say so. */
  investigateReputation(gameId: string): Promise<Reputation> {
    return this.request('POST', `/${enc(gameId)}/investigate/reputation`, reputationSchema);
  }

  private async request<T>(method: Method, path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const body = await this.send(method, path);
        const parsed = schema.safeParse(body);

        if (!parsed.success) {
          throw new ApiError('invalid-response', `Unexpected response from ${method} ${path}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
        }

        return parsed.data;
      } catch (error) {
        if (attempt >= this.retries || !shouldRetry(error, method)) {
          throw error;
        }

        await delay(this.retryBaseDelayMs * 2 ** attempt);
      }
    }
  }

  private async send(method: Method, path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    let response: Response;
    let text: string;

    // ERR-02: the timeout covers the body too, since the live API can send headers and then stall.
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      // API-10: error bodies are HTML or plain text, so read text and parse JSON only on success.
      text = await untilAborted(response.text(), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiError('timeout', `${method} ${path} timed out after ${this.timeoutMs} ms`);
      }

      throw new ApiError('network', `${method} ${path} failed: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw toHttpError(response.status, text, `${method} ${path}`);
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ApiError('invalid-response', `${method} ${path} returned non-JSON`, response.status, text);
    }
  }
}

function toHttpError(status: number, body: string, label: string): ApiError {
  // The live API answers 410 {"status":"Game Over"} once lives reach 0.
  if (status === 410 || /game over/i.test(body)) {
    return new GameOverError(status, body);
  }

  if (status === 404) {
    return new NotFoundError(`${label} returned 404`, body);
  }

  if (status >= 500) {
    return new ApiError('server', `${label} returned ${status}`, status, body);
  }

  return new ApiError('bad-request', `${label} returned ${status}`, status, body);
}

function shouldRetry(error: unknown, method: Method): boolean {
  if (!(error instanceof ApiError) || !error.isTransient) {
    return false;
  }

  // A timed-out POST may already have used up a turn on the server, so replaying it is unsafe.
  return !(method === 'POST' && error.kind === 'timeout');
}

function enc(segment: string): string {
  return encodeURIComponent(segment);
}

/** Not every fetch cancels a body read on abort (MSW does not), so the read races the signal. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      reject(new Error('Aborted'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
