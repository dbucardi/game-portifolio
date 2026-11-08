import type { Run } from '@mugloar/core';

export const RUN_STATUS_SEVERITY: Record<Run['status'], 'info' | 'success' | 'warn' | 'danger' | 'secondary'> = {
  running: 'info',
  stopping: 'secondary',
  stopped: 'warn',
  finished: 'success',
  failed: 'danger',
};

const END_REASONS: Record<string, string> = {
  'no-lives': 'Out of lives',
  'max-turns': 'Turn limit reached',
  stopped: 'Stopped by you',
};

/** The service sends a code for known endings and an error message when a run fails. */
export function describeEndReason(reason: string): string {
  return END_REASONS[reason] ?? reason;
}

export function shortRunId(runId: string): string {
  return `#${runId.slice(0, 4)}`;
}
