import { mergeConfig, defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['test/**/*.test.ts'],
      setupFiles: ['test/setup.ts'],
    },
  }),
);
