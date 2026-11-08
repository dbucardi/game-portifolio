import { isRunActive, type Run, type RunEvent, type StartRunRequest } from '@mugloar/core';
import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef } from 'vue';
import { BotServiceError, type RunSubscription } from '@/api/botServiceClient';
import { botServiceKey, injectRequired } from '@/api/injection';
import { applyGameEvent, emptySession, toLogEntries, toScoreHistory } from '@/session';
import { useHighScoreStore } from './highScore';

/** WEB-12: the autopilot screen's own status; each run carries its status from the service. */
export type RunsStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

const MESSAGES: Partial<Record<BotServiceError['code'], string>> = {
  'cap-reached': 'Too many runs are active. Stop one or wait for it to finish.',
  'game-api': "The bot couldn't reach the game API. Try again in a moment.",
  conflict: 'That run has already ended.',
};

export const useRunsStore = defineStore('runs', () => {
  const client = injectRequired(botServiceKey);
  const highScores = useHighScoreStore();
  const runs = ref<Run[]>([]);
  /** Only the selected run is subscribed, so only its session is kept. */
  const activeSession = reactive(emptySession());
  const activeRunId = ref<string | null>(null);
  const status = ref<RunsStatus>('idle');
  const error = ref<string | null>(null);
  const starting = ref(false);
  const stopping = ref(false);
  const live = ref(false);
  const subscription = shallowRef<RunSubscription | null>(null);
  const sortedRuns = computed(() => [...runs.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
  const activeRun = computed(() => runs.value.find((run) => run.runId === activeRunId.value) ?? null);
  const activeStats = computed(() => activeSession.stats ?? activeRun.value?.stats ?? null);
  const scoreHistory = computed(() => toScoreHistory(activeSession.events));
  const activeLog = computed(() => toLogEntries(activeSession.events));
  const activeCount = computed(() => runs.value.filter((run) => isRunActive(run.status)).length);
  const canStop = computed(() => activeRun.value?.status === 'running' && !stopping.value);

  /** WEB-18: autopilot scores count towards the player's high score too. */
  function recordScore(run: Run): void {
    highScores.record(run.summary?.score ?? run.stats?.score);
  }

  function upsert(run: Run): void {
    recordScore(run);
    const index = runs.value.findIndex((existing) => existing.runId === run.runId);

    if (index === -1) {
      runs.value.push(run);
    } else {
      runs.value[index] = run;
    }
  }

  /** WEB-11: run events go through the same reducer as manual play. */
  function applyEvent(runId: string, event: RunEvent): void {
    const run = runs.value.find((candidate) => candidate.runId === runId);

    if (event.type === 'status') {
      if (run) {
        run.status = event.status;

        if (event.summary !== undefined) {
          run.summary = event.summary;
          recordScore(run);
        }
      }

      // An ended run sends nothing more, so close the stream before EventSource tries to reconnect.
      if (!isRunActive(event.status) && runId === activeRunId.value) {
        stopping.value = false;
        unsubscribe();
      }

      return;
    }

    if (runId === activeRunId.value) {
      applyGameEvent(activeSession, event);
    }

    highScores.record(event.stats.score);

    if (run) {
      run.stats = event.stats;
    }
  }

  function fail(cause: unknown): void {
    if (cause instanceof BotServiceError && cause.code === 'unavailable') {
      status.value = 'unavailable';
      error.value = null;

      return;
    }

    error.value = cause instanceof BotServiceError ? (MESSAGES[cause.code] ?? cause.message) : 'Something went wrong.';
  }

  async function fetchRuns(): Promise<void> {
    status.value = 'loading';
    error.value = null;

    try {
      runs.value = await client.listRuns();
      runs.value.forEach(recordScore);
      status.value = 'ready';
    } catch (cause) {
      status.value = 'error';
      fail(cause);
    }
  }

  async function startRun(request: StartRunRequest): Promise<void> {
    if (starting.value) {
      return;
    }

    starting.value = true;
    error.value = null;

    try {
      const { runId } = await client.startRun(request);

      upsert(await client.getRun(runId));
      status.value = 'ready';
      select(runId);
    } catch (cause) {
      fail(cause);
    } finally {
      starting.value = false;
    }
  }

  async function stopRun(): Promise<void> {
    const run = activeRun.value;

    if (!run || !canStop.value) {
      return;
    }

    stopping.value = true;
    error.value = null;

    try {
      await client.stopRun(run.runId);
      run.status = 'stopping';
    } catch (cause) {
      stopping.value = false;
      fail(cause);

      if (cause instanceof BotServiceError && cause.code === 'conflict') {
        upsert(await client.getRun(run.runId).catch(() => run));
      }
    }
  }

  /** Opens the live view of one run; the service replays its history first (BOT-14). */
  function select(runId: string): void {
    if (activeRunId.value === runId && subscription.value) {
      return;
    }

    unsubscribe();
    activeRunId.value = runId;
    stopping.value = false;
    Object.assign(activeSession, emptySession());
    live.value = true;
    subscription.value = client.subscribe(
      runId,
      (event) => {
        applyEvent(runId, event);
      },
      () => {
        live.value = false;
      },
    );
  }

  function unsubscribe(): void {
    subscription.value?.close();
    subscription.value = null;
    live.value = false;
  }

  function dismissError(): void {
    error.value = null;
  }

  return {
    runs,
    activeRunId,
    status,
    error,
    starting,
    stopping,
    live,
    sortedRuns,
    activeRun,
    activeStats,
    scoreHistory,
    activeLog,
    activeCount,
    canStop,
    fetchRuns,
    startRun,
    stopRun,
    select,
    unsubscribe,
    dismissError,
  };
});
