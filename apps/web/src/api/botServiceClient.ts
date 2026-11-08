import {
  errorBodySchema,
  runEventSchema,
  runListSchema,
  runSchema,
  startRunResponseSchema,
  type Run,
  type RunEvent,
  type ServiceErrorCode,
  type StartRunRequest,
} from '@mugloar/core';
import type { z } from 'zod';

export type BotServiceErrorCode = ServiceErrorCode | 'unavailable' | 'unknown';

export class BotServiceError extends Error {
  override readonly name = 'BotServiceError';

  constructor(
    readonly code: BotServiceErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface RunSubscription {
  close(): void;
}

export interface BotServiceClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

const UNAVAILABLE_MESSAGE = "The bot service isn't available.";

/** Talks to the bot service (docs/PLAN.md §2). Manual play never goes through here (WEB-01). */
export class BotServiceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: BotServiceClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async listRuns(): Promise<Run[]> {
    const { runs } = await this.request('GET', '/api/runs', runListSchema);

    return runs;
  }

  getRun(runId: string): Promise<Run> {
    return this.request('GET', `/api/runs/${encodeURIComponent(runId)}`, runSchema);
  }

  startRun(body: StartRunRequest): Promise<z.infer<typeof startRunResponseSchema>> {
    return this.request('POST', '/api/runs', startRunResponseSchema, body);
  }

  async stopRun(runId: string): Promise<void> {
    await this.request('POST', `/api/runs/${encodeURIComponent(runId)}/stop`, null);
  }

  /** BOT-14: past events are replayed first, then live ones arrive. */
  subscribe(runId: string, onEvent: (event: RunEvent) => void, onError: () => void): RunSubscription {
    const source = new EventSource(`${this.baseUrl}/api/runs/${encodeURIComponent(runId)}/events`);

    source.onmessage = (message: MessageEvent<string>) => {
      const parsed = runEventSchema.safeParse(safeJson(message.data));

      if (parsed.success) {
        onEvent(parsed.data);
      }
    };
    source.onerror = () => {
      // EventSource reconnects on its own; report only when it has given up.
      if (source.readyState === EventSource.CLOSED) {
        onError();
      }
    };

    return {
      close: () => {
        source.close();
      },
    };
  }

  private async request<T>(method: 'GET' | 'POST', path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, body?: unknown): Promise<T>;
  private async request(method: 'GET' | 'POST', path: string, schema: null, body?: unknown): Promise<undefined>;
  private async request<T>(method: 'GET' | 'POST', path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown> | null, body?: unknown): Promise<T | undefined> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new BotServiceError('unavailable', UNAVAILABLE_MESSAGE);
    }

    const json = safeJson(await response.text());

    if (!response.ok) {
      const parsed = errorBodySchema.safeParse(json);

      // Without our error shape the answer came from a proxy, not from the service itself.
      if (!parsed.success) {
        throw new BotServiceError('unavailable', UNAVAILABLE_MESSAGE, response.status);
      }

      throw new BotServiceError(parsed.data.error.code, parsed.data.error.message, response.status);
    }

    if (!schema) {
      return undefined;
    }

    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      throw new BotServiceError('unknown', 'The bot service sent a response we could not read.');
    }

    return parsed.data;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
