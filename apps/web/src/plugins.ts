import { GameApiClient } from '@mugloar/core';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';
import { createPinia } from 'pinia';
import type { App } from 'vue';
import { BotServiceClient } from '@/api/botServiceClient';
import { botServiceKey, clockKey, gameApiKey, randomKey } from '@/api/injection';
import { browserClock, type Clock } from '@/clock';
import { MugloarPreset } from '@/theme';

export interface AppDependencies {
  gameApi: GameApiClient;
  botService: BotServiceClient;
  clock: Clock;
  random: () => number;
}

export function defaultDependencies(): AppDependencies {
  return {
    gameApi: new GameApiClient({ baseUrl: import.meta.env.VITE_GAME_API_URL || undefined }),
    botService: new BotServiceClient({ baseUrl: import.meta.env.VITE_BOT_SERVICE_URL ?? '' }),
    clock: browserClock,
    random: Math.random,
  };
}

/** Everything the app needs, shared by main.ts and the component tests. */
export function installPlugins(app: App, deps: AppDependencies): void {
  app.use(createPinia());
  app.use(PrimeVue, { theme: { preset: MugloarPreset, options: { darkModeSelector: 'system' } } });
  app.use(ToastService);
  app.directive('tooltip', Tooltip);
  app.provide(gameApiKey, deps.gameApi);
  app.provide(botServiceKey, deps.botService);
  app.provide(clockKey, deps.clock);
  app.provide(randomKey, deps.random);
}
