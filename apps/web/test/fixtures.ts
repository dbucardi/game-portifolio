import type { Run, RunEvent } from '@mugloar/core';
import { gameStats as stats } from '@mugloar/core/testing';

export { stats };

export function aRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: 'run-1',
    gameId: 'game0001',
    strategy: 'turn-phased',
    maxTurns: 50,
    status: 'running',
    startedAt: '2026-11-06T10:00:00.000Z',
    endedAt: null,
    stats: null,
    summary: null,
    ...overrides,
  };
}

export const RUN_EVENTS: RunEvent[] = [
  { type: 'started', gameId: 'game0001', stats: stats() },
  {
    type: 'solved',
    adId: 'a1',
    adMessage: 'Escort the caravan',
    reward: 600,
    probability: 'Sure thing',
    resultMessage: 'You successfully solved the mission!',
    stats: stats({ turn: 1, gold: 600, score: 600 }),
  },
  {
    type: 'solved',
    adId: 'a2',
    adMessage: 'Defend the fort',
    reward: 500,
    probability: 'Piece of cake',
    resultMessage: 'You successfully solved the mission!',
    stats: stats({ turn: 2, gold: 1100, score: 1100 }),
  },
  { type: 'status', status: 'finished', summary: { score: 1100, turns: 2, reason: 'max-turns' } },
];
