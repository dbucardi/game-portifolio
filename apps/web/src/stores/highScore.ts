import { defineStore } from 'pinia';
import { z } from 'zod';
import { useStoredRef } from '@/composables/useStoredRef';

/** WEB-18: the player's own best score from manual play and autopilot runs, kept apart from the saved game. */
export const useHighScoreStore = defineStore('highScore', () => {
  const best = useStoredRef('mugloar.highScore', z.number().int().min(0), 0);

  function record(score: number | undefined): void {
    if (score !== undefined && score > best.value) {
      best.value = score;
    }
  }

  return { best, record };
});
