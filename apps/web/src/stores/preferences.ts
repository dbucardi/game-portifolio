import { defineStore } from 'pinia';
import { z } from 'zod';
import { useStoredRef } from '@/composables/useStoredRef';
import { BOARD_SORTS, type BoardSort } from '@/gameFeel';

/** WEB-14: manual-play settings that survive a reload. */
export const usePreferencesStore = defineStore('preferences', () => {
  const advisor = useStoredRef('mugloar.advisor', z.boolean(), false);
  const boardSort = useStoredRef<BoardSort>('mugloar.boardSort', z.enum(BOARD_SORTS), 'board');

  return { advisor, boardSort };
});
