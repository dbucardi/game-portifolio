import type { GameApiClient } from '@mugloar/core';
import { inject, type InjectionKey } from 'vue';
import type { Clock } from '@/clock';
import type { BotServiceClient } from './botServiceClient';

export const gameApiKey: InjectionKey<GameApiClient> = Symbol('gameApi');

export const botServiceKey: InjectionKey<BotServiceClient> = Symbol('botService');

export const clockKey: InjectionKey<Clock> = Symbol('clock');

export const randomKey: InjectionKey<() => number> = Symbol('random');

export function injectRequired<T>(key: InjectionKey<T>): T {
  const value = inject(key);

  if (value === undefined) {
    throw new Error(`Missing dependency ${String(key)}. Provide it with app.provide().`);
  }

  return value;
}
