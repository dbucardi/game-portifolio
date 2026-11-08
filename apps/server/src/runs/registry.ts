import { randomUUID } from 'node:crypto';
import {
  ApiError,
  createStrategy as createCoreStrategy,
  isRunActive,
  playGame,
  type GameApi,
  type GameEvent,
  type Run,
  type RunEvent,
  type StartRunRequest,
  type Strategy,
  type StrategyName,
} from '@mugloar/core';
import type { FastifyBaseLogger } from 'fastify';
import { capReached, errorMessage, runAlreadyEnded, runNotFound, ServiceError } from '../errors';

export interface RunRegistryOptions {
  api: GameApi;
  logger: FastifyBaseLogger;
  defaultStrategy: StrategyName;
  defaultMaxTurns: number;
  /** BOT-15 */
  maxActiveRuns: number;
  /** BOT-17: how long an ended run stays readable. */
  ttlMs: number;
  createStrategy?: (name: StrategyName) => Strategy;
}

/** An event with its JSON, serialised once however many subscribers replay or receive it. */
export interface PublishedEvent {
  event: RunEvent;
  json: string;
}

export type RunListener = (published: PublishedEvent) => void;

export interface RunSubscription {
  /** Everything that happened so far, oldest first (BOT-14 replay). */
  history: readonly PublishedEvent[];
  /** True when the run has ended, so no live event will follow. */
  ended: boolean;
  unsubscribe(): void;
}

interface RunRecord {
  run: Run;
  events: PublishedEvent[];
  listeners: Set<RunListener>;
  controller: AbortController;
  done: Promise<void>;
  expiry?: NodeJS.Timeout;
}

/** Registry + Observer: holds runs in memory and fans their events out to subscribers. */
export class RunRegistry {
  private readonly runs = new Map<string, RunRecord>();
  /** Runs whose game start request is still in flight; they count against the cap. */
  private starting = 0;
  private readonly createStrategy: (name: StrategyName) => Strategy;

  constructor(private readonly options: RunRegistryOptions) {
    this.createStrategy = options.createStrategy ?? createCoreStrategy;
  }

  get activeCount(): number {
    let active = this.starting;

    for (const record of this.runs.values()) {
      if (isRunActive(record.run.status)) {
        active += 1;
      }
    }

    return active;
  }

  /** BOT-11: resolves as soon as the game has started; the game goes on in the background. */
  async start(request: StartRunRequest): Promise<Run> {
    if (this.activeCount >= this.options.maxActiveRuns) {
      throw capReached(this.options.maxActiveRuns);
    }

    const runId = randomUUID();
    const strategyName = request.strategy ?? this.options.defaultStrategy;
    const maxTurns = request.maxTurns ?? this.options.defaultMaxTurns;
    const controller = new AbortController();
    const log = this.options.logger.child({ runId });

    this.starting += 1;

    let record: RunRecord | undefined;
    let resolveStarted!: (run: Run) => void;
    let rejectStarted!: (error: unknown) => void;
    const started = new Promise<Run>((resolve, reject) => {
      resolveStarted = resolve;
      rejectStarted = reject;
    });
    const onEvent = (event: GameEvent): void => {
      if (event.type === 'started') {
        this.starting -= 1;
        // `done` is assigned by now: 'started' only fires after playGame's first await.
        record = this.register(runId, event, strategyName, maxTurns, controller, done);
        log.info({ gameId: event.gameId, strategy: strategyName, maxTurns }, 'run started');
        resolveStarted(record.run);

        return;
      }

      if (!record) {
        return;
      }

      record.run.stats = event.stats;

      const { lives, gold, score, turn } = event.stats;

      log.info({ type: event.type, turn, lives, gold, score }, 'turn');
      this.publish(record, event);
    };
    const game = playGame(this.options.api, this.createStrategy(strategyName), {
      maxTurns,
      signal: controller.signal,
      onEvent,
      onSkippedAd: (adId) => {
        log.warn({ adId }, 'skipped an ad with an unknown encryption flag');
      },
    });
    const done = game.then(
      (result) => {
        if (record) {
          this.end(record, result.reason === 'stopped' ? 'stopped' : 'finished', result.reason);
        }
      },
      (error: unknown) => {
        if (!record) {
          this.starting -= 1;
          rejectStarted(toStartError(error));

          return;
        }

        // ERR-04: the run fails on its own; the service and other runs carry on.
        log.error({ err: error }, 'run failed');
        this.end(record, 'failed', errorMessage(error));
      },
    );

    return started;
  }

  get(runId: string): Run {
    return this.find(runId).run;
  }

  list(): Run[] {
    return [...this.runs.values()].map((record) => record.run);
  }

  /** BOT-12: asks the runner to stop after the API call it is making now. */
  stop(runId: string): Run {
    const record = this.find(runId);
    const { status } = record.run;

    if (status === 'stopping') {
      return record.run;
    }

    if (status !== 'running') {
      throw runAlreadyEnded(runId, status);
    }

    record.controller.abort();
    record.run.status = 'stopping';
    this.options.logger.info({ runId }, 'run stopping');
    this.publish(record, { type: 'status', status: 'stopping' });

    return record.run;
  }

  subscribe(runId: string, listener: RunListener): RunSubscription {
    const record = this.find(runId);
    const ended = !isRunActive(record.run.status);

    if (!ended) {
      record.listeners.add(listener);
    }

    return {
      history: record.events,
      ended,
      unsubscribe: () => record.listeners.delete(listener),
    };
  }

  /** Stops every active run and waits for them to end; used on shutdown. */
  async close(): Promise<void> {
    const pending = [...this.runs.values()].filter((record) => isRunActive(record.run.status));

    // stop() is a no-op for runs already stopping.
    pending.forEach((record) => this.stop(record.run.runId));
    await Promise.all(pending.map((record) => record.done));

    for (const record of this.runs.values()) {
      clearTimeout(record.expiry);
    }

    this.runs.clear();
  }

  private register(
    runId: string,
    event: Extract<GameEvent, { type: 'started' }>,
    strategy: StrategyName,
    maxTurns: number,
    controller: AbortController,
    done: Promise<void>,
  ): RunRecord {
    const record: RunRecord = {
      run: {
        runId,
        gameId: event.gameId,
        strategy,
        maxTurns,
        status: 'running',
        startedAt: new Date().toISOString(),
        endedAt: null,
        stats: event.stats,
        summary: null,
      },
      events: [publishedEvent(event)],
      listeners: new Set(),
      controller,
      done,
    };

    this.runs.set(runId, record);

    return record;
  }

  private end(record: RunRecord, status: 'stopped' | 'finished' | 'failed', reason: string): void {
    const { run } = record;

    run.status = status;
    run.endedAt = new Date().toISOString();
    run.summary = { score: run.stats?.score ?? 0, turns: run.stats?.turn ?? 0, reason };
    this.options.logger.info({ runId: run.runId, status, summary: run.summary }, 'run ended');
    this.publish(record, {
      type: 'status',
      status,
      summary: run.summary,
      ...(status === 'failed' ? { error: reason } : {}),
    });
    record.listeners.clear();
    record.expiry = setTimeout(() => this.runs.delete(run.runId), this.options.ttlMs);
    record.expiry.unref();
  }

  private publish(record: RunRecord, event: RunEvent): void {
    const published = publishedEvent(event);

    record.events.push(published);

    for (const listener of record.listeners) {
      listener(published);
    }
  }

  private find(runId: string): RunRecord {
    const record = this.runs.get(runId);

    if (!record) {
      throw runNotFound(runId);
    }

    return record;
  }
}

function publishedEvent(event: RunEvent): PublishedEvent {
  return { event, json: JSON.stringify(event) };
}

function toStartError(error: unknown): ServiceError {
  if (error instanceof ApiError) {
    return new ServiceError(502, 'game-api', `Couldn't start a game: ${error.message}`);
  }

  return new ServiceError(500, 'internal', errorMessage(error));
}
