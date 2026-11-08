import type { GameEvent, GameOverReason, GameStats, Reputation } from '@mugloar/core';
import { markRaw } from 'vue';

/** One game as the UI sees it, whether a person or the bot is playing. */
export interface Session {
  gameId: string | null;
  stats: GameStats | null;
  events: GameEvent[];
  overReason: GameOverReason | null;
  /** Only known once the player has investigated; it is not part of the game stats. */
  reputation: Reputation | null;
}

export function emptySession(): Session {
  return { gameId: null, stats: null, events: [], overReason: null, reputation: null };
}

/** WEB-11: the single place where an action's result changes game state. */
export function applyGameEvent(session: Session, event: GameEvent): void {
  // Events never change after they happen, so skip the per-event reactive proxy.
  session.events.push(markRaw(event));
  session.stats = event.stats;

  if (event.type === 'started') {
    session.gameId = event.gameId;
    session.overReason = null;
    session.reputation = null;
  }

  if (event.type === 'investigated') {
    session.reputation = event.reputation;
  }

  if (event.type === 'gameOver') {
    session.overReason = event.reason;
  }
}

export type LogTone = 'success' | 'danger' | 'info' | 'warn';

export interface LogEntry {
  key: number;
  turn: number;
  tone: LogTone;
  text: string;
}

const MAX_AD_TEXT = 32;

function shorten(text: string): string {
  return text.length > MAX_AD_TEXT ? `${text.slice(0, MAX_AD_TEXT - 1).trimEnd()}…` : text;
}

function describe(event: GameEvent, previous: GameStats | null): Pick<LogEntry, 'tone' | 'text'> {
  switch (event.type) {
    case 'started':
      return { tone: 'info', text: 'New game started' };

    case 'solved':
      return {
        tone: 'success',
        text: `Solved '${shorten(event.adMessage)}'  +${event.reward} gold`,
      };

    case 'failed': {
      const livesLost = previous ? previous.lives - event.stats.lives : 0;
      const cost = livesLost > 0 ? `  -${livesLost} ${livesLost === 1 ? 'life' : 'lives'}` : '';

      return { tone: 'danger', text: `Failed '${shorten(event.adMessage)}'${cost}` };
    }

    case 'bought':
      return event.success ? { tone: 'info', text: `Bought ${event.itemName}  -${event.cost} gold` } : { tone: 'warn', text: `Couldn't buy ${event.itemName}` };

    case 'investigated':
      return { tone: 'info', text: 'Investigated your reputation' };

    case 'gameOver':
      return {
        tone: 'danger',
        text: event.reason === 'max-turns' ? `Turn limit reached. Final score ${event.stats.score}` : `Game over. Final score ${event.stats.score}`,
      };
  }
}

/** WEB-05: newest first, as in the sketch. */
export function toLogEntries(events: readonly GameEvent[]): LogEntry[] {
  const entries: LogEntry[] = [];
  let previous: GameStats | null = null;

  events.forEach((event, index) => {
    entries.push({ key: index, turn: event.stats.turn, ...describe(event, previous) });
    previous = event.stats;
  });

  return entries.reverse();
}

export interface ScorePoint {
  turn: number;
  score: number;
}

export function toScoreHistory(events: readonly GameEvent[]): ScorePoint[] {
  return events.map((event) => ({ turn: event.stats.turn, score: event.stats.score }));
}
