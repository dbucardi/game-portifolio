export type ApiErrorKind = 'bad-request' | 'not-found' | 'game-over' | 'server' | 'network' | 'timeout' | 'invalid-response';

export class ApiError extends Error {
  override readonly name: string = 'ApiError';

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
  }

  get isTransient(): boolean {
    return this.kind === 'server' || this.kind === 'network' || this.kind === 'timeout';
  }
}

export class GameOverError extends ApiError {
  override readonly name = 'GameOverError';

  constructor(status?: number, body?: string) {
    super('game-over', 'The game is over.', status, body);
  }
}

export class NotFoundError extends ApiError {
  override readonly name = 'NotFoundError';

  constructor(message: string, body?: string) {
    super('not-found', message, 404, body);
  }
}

const FRIENDLY_MESSAGES: Record<ApiErrorKind, string> = {
  'bad-request': 'The game rejected that move. The ad may have expired.',
  'not-found': 'That game no longer exists. Start a new game.',
  'game-over': 'The game is over.',
  server: 'The game API had a problem. Try again in a moment.',
  network: "Couldn't reach the game API. Check your connection.",
  timeout: "Couldn't reach the game API (timeout).",
  'invalid-response': 'The game API sent a response we could not read.',
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY_MESSAGES[error.kind];
  }

  return 'Something went wrong.';
}
