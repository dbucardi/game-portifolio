import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // BOT-19: same-origin proxy to the bot service in development.
      proxy: {
        '/api': {
          target: env.BOT_SERVICE_PROXY_TARGET ?? 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
