import { ref, watch, type Ref } from 'vue';
import type { z } from 'zod';
import { readStored, writeStored } from '@/storage';

/** WEB-14: a ref that survives a reload; the default is used when nothing valid is stored. */
export function useStoredRef<T>(key: string, schema: z.ZodType<T>, fallback: T): Ref<T> {
  const state = ref(readStored(key, schema) ?? fallback) as Ref<T>;

  watch(state, (value) => {
    writeStored(key, value);
  });

  return state;
}
