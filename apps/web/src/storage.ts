import type { z } from 'zod';

// WEB-14, WEB-15: storage can be missing or blocked (private mode), so every access is guarded.

export function readStored<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return null;
    }

    const parsed = schema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the value lives in memory only.
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}
