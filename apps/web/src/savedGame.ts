import { gameOverReasonSchema, gameStateSchema, gameStatsSchema } from '@mugloar/core';
import { z } from 'zod';
import { readStored, removeStored, writeStored } from '@/storage';

const STORAGE_KEY = 'mugloar.savedGame';
const savedGameSchema = z.object({
  gameId: gameStateSchema.shape.gameId,
  stats: gameStatsSchema,
  overReason: gameOverReasonSchema.nullable(),
});

/** WEB-15: what a reload needs to carry on a manual game. */
export type SavedGame = z.infer<typeof savedGameSchema>;

export function loadSavedGame(): SavedGame | null {
  return readStored(STORAGE_KEY, savedGameSchema);
}

export function saveGame(game: SavedGame): void {
  writeStored(STORAGE_KEY, game);
}

export function clearSavedGame(): void {
  removeStored(STORAGE_KEY);
}
