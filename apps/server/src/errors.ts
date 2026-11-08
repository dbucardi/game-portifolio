import type { ServiceErrorCode } from '@mugloar/core';

/** ERR-08: an error with the status code and JSON body the service answers with. */
export class ServiceError extends Error {
  override readonly name = 'ServiceError';

  constructor(
    readonly statusCode: number,
    readonly code: ServiceErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const runNotFound = (runId: string) => new ServiceError(404, 'not-found', `Run ${runId} does not exist.`);

export const runAlreadyEnded = (runId: string, status: string) => new ServiceError(409, 'conflict', `Run ${runId} has already ended (${status}).`);

export const capReached = (limit: number) => new ServiceError(429, 'cap-reached', `${limit} runs are already active. Stop one or wait for it to finish.`);

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
