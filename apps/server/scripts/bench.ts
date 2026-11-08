/**
 * BOT-25: asks a running bot service for a benchmark, prints it and saves it.
 *   pnpm bench --games 30 --strategies expected-value,safest-first
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { BenchmarkReport } from '../src/benchmark/benchmark';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.BOT_SERVICE_URL ?? 'http://localhost:3000' },
    games: { type: 'string', default: '30' },
    concurrency: { type: 'string' },
    strategies: { type: 'string' },
    'max-turns': { type: 'string' },
    out: { type: 'string', default: resolve(import.meta.dirname, '../../../docs/benchmark.json') },
  },
});
const body = {
  games: Number(values.games),
  ...(values.concurrency && { concurrency: Number(values.concurrency) }),
  ...(values.strategies && { strategies: values.strategies.split(',') }),
  ...(values['max-turns'] && { maxTurns: Number(values['max-turns']) }),
};

console.log(`Benchmarking against ${values.url} with ${JSON.stringify(body)}…`);

// node:http rather than fetch: fetch gives up after 5 minutes without response headers.
const response = await postJson(`${values.url}/api/benchmarks`, body).catch((error: unknown) => {
  console.error(`Couldn't reach the bot service at ${values.url}. Is it running (pnpm dev:server)?`);

  throw error;
});

if (response.status !== 200) {
  console.error(`The bot service answered ${response.status}: ${response.text}`);
  process.exit(1);
}

const report = JSON.parse(response.text) as BenchmarkReport;

mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${report.gamesPerStrategy} games per strategy in ${(report.durationMs / 1000).toFixed(0)} s`);
console.table(
  report.strategies.map((row) => ({
    strategy: row.strategy,
    [`≥ ${report.targetScore}`]: `${(row.successRate * 100).toFixed(1)}%`,
    min: row.score.min,
    p10: row.score.p10,
    median: row.score.median,
    max: row.score.max,
    mean: row.score.mean,
    turns: row.meanTurns,
    errors: row.errors.length,
  })),
);

for (const row of report.strategies) {
  console.log(`\nCalibration, ${row.strategy}:`);
  console.table(
    row.calibration.map(({ label, attempts, observedRate, estimatedRate }) => ({
      label,
      attempts,
      observed: observedRate,
      assumed: estimatedRate,
    })),
  );
}

console.log(`Saved to ${values.out}`);

function postJson(url: string, payload: unknown): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });

    req.on('response', (res) => {
      let text = '';

      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, text });
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(payload));
  });
}
