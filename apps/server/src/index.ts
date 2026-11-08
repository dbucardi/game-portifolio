import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { ConfigError, loadConfig } from './config';

try {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const config = loadConfig();
  const app = await buildApp({ config });
  const shutdown = (signal: string): void => {
    app.log.info({ signal }, 'shutting down, stopping active runs');
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'shutdown failed');
        process.exit(1);
      },
    );
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}
