# Dragons of Mugloar

A web app for playing [Dragons of Mugloar](https://dragonsofmugloar.com) by hand, where the player makes every choice and each quest builds suspense before its result (optional advisor hints show the bot's view), and a bot service that plays games on its own and streams them live.

## Run it

Needs Node 22 and pnpm 9.

```sh
pnpm install
pnpm dev            # bot service on :3000 and web app on http://localhost:5173
```

Or one at a time: `pnpm dev:server` and `pnpm dev:web`. `pnpm start:server` runs the service without file watching.

Manual play talks to the public game API directly. The Autopilot page calls the bot service through the Vite proxy (`/api` → `http://localhost:3000`). If the service is down, the page says so and manual play keeps working.

Settings live in `apps/web/.env` and `apps/server/.env` (see the `.env.example` next to each).

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test           # Vitest: core, bot service and web tests (MSW fakes the game API; nothing calls it live)
pnpm build
```

## Bot service

### From the command line

```sh
# Start a run (both fields optional)
curl -X POST localhost:3000/api/runs -H 'content-type: application/json' \
  -d '{"strategy":"expected-value","maxTurns":300}'

# Watch it live (Server-Sent Events)
curl -N localhost:3000/api/runs/<runId>/events

# Check it, list all runs, stop it
curl localhost:3000/api/runs/<runId>
curl localhost:3000/api/runs
curl -X POST localhost:3000/api/runs/<runId>/stop

# Benchmark: plays N games per strategy against the live API and saves docs/benchmark.json
pnpm bench --games 30 --strategies expected-value,safest-first,steal-budget
```

### API

| Method | Path                   | Body                                              | Answer                                                                                                         |
| ------ | ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/runs`            | `{ strategy?, maxTurns? }`                        | `201 { runId, gameId, status: "running" }` as soon as the game has started; it keeps playing in the background |
| `GET`  | `/api/runs`            |                                                   | `200 { runs: Run[] }`                                                                                          |
| `GET`  | `/api/runs/:id`        |                                                   | `200 Run`: status, latest stats, and `summary { score, turns, reason }` once it has ended                      |
| `GET`  | `/api/runs/:id/events` |                                                   | `text/event-stream`: past events first, then live ones; closes when the run ends. Honours `Last-Event-ID`      |
| `POST` | `/api/runs/:id/stop`   |                                                   | `202 { runId, status: "stopping" }`; the run ends as `stopped` after its current API call                      |
| `POST` | `/api/benchmarks`      | `{ games, concurrency?, strategies?, maxTurns? }` | `200` report per strategy: success rate, min, p10, median, max, mean, end reasons, errors, calibration         |
| `GET`  | `/health`              |                                                   | `200 { status: "ok", activeRuns }`                                                                             |

A run's `status` is `running`, `stopping`, `stopped`, `finished` (out of lives or turn limit) or `failed` (then `summary.reason` holds the error). Events are the game events (`started`, `solved`, `failed`, `bought`, `gameOver`) plus `status` changes; their shapes are in `packages/core/src/bot/contract.ts`.

Every error has the same shape, `{ "error": { "code", "message", "details?" } }`:

| Status | `code`        | When                                                 |
| ------ | ------------- | ---------------------------------------------------- |
| 400    | `invalid`     | Bad body, params or JSON; `details` lists each field |
| 404    | `not-found`   | Unknown run or route                                 |
| 409    | `conflict`    | Stopping a run that has already ended                |
| 429    | `cap-reached` | `MAX_ACTIVE_RUNS` runs are already playing           |
| 502    | `game-api`    | The game API failed while starting a game            |

The benchmark answers when every game is done, which takes minutes. Use `curl` or `pnpm bench`, which wait as long as needed. If the caller disconnects, the remaining games stop.

### Settings

From the environment or `apps/server/.env`, validated at startup:

| Variable                | Default                               | Meaning                                                    |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `PORT`, `HOST`          | `3000`, `0.0.0.0`                     | Where the service listens                                  |
| `GAME_API_URL`          | `https://dragonsofmugloar.com/api/v2` | Game API base URL                                          |
| `DEFAULT_STRATEGY`      | `expected-value`                      | `expected-value`, `safest-first` or `steal-budget`         |
| `MAX_TURNS`             | `500`                                 | Default safety limit on turns per game (1–5000)            |
| `MAX_ACTIVE_RUNS`       | `5`                                   | Runs playing at once; more are refused with 429            |
| `BENCH_MAX_CONCURRENCY` | `4`                                   | Benchmark games in flight at once, to spare the public API |
| `BENCH_MAX_GAMES`       | `200`                                 | Most games per strategy in one benchmark                   |
| `RUN_TTL_MS`            | `1800000`                             | How long an ended run stays readable                       |
| `LOG_LEVEL`             | `info`                                | Pino level; logs are JSON, one line per run event          |
| `CORS_ORIGIN`           | `*`                                   | Comma-separated allowed origins                            |

Runs live in memory, so a restart forgets them. On `SIGINT`/`SIGTERM` the service stops active runs before exiting.

## Layout

| Path            | What                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | API client, ad decoding, validation (zod), strategies, the game runner, game events, the bot service contract, and an in-memory fake of the game API for tests |
| `apps/server`   | Fastify bot service: run registry, routes, SSE stream, benchmark                                                                                               |
| `apps/web`      | Vue 3 + PrimeVue app: manual play (`/play`) and autopilot (`/autopilot`)                                                                                       |
| `docs`          | Requirements, plan, palette, diagrams and theme options (see below)                                                                                            |

## Docs

| File                                                                                     | What                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)                                           | What the solution must do, stack-agnostic, with stable IDs (`BOT-05`, `WEB-12`, `FUN-02`…) |
| [`docs/PLAN.md`](docs/PLAN.md)                                                           | How it is built: stack, architecture, endpoints, stores, strategy, testing                 |
| [`docs/PALETTE.md`](docs/PALETTE.md)                                                     | Colour tokens taken from the game art, and why indigo is the action colour                 |
| [`docs/diagrams/architecture.excalidraw.svg`](docs/diagrams/architecture.excalidraw.svg) | High-level view: web app, bot service, shared core and the game API                        |
| [`docs/diagrams/backend-bot.excalidraw.svg`](docs/diagrams/backend-bot.excalidraw.svg)   | Bot service components and the `playGame()` loop                                           |
| [`docs/diagrams/frontend-ui.excalidraw.svg`](docs/diagrams/frontend-ui.excalidraw.svg)   | `/play` and `/autopilot` at desktop 1280px and mobile 390px, with their states             |

Open the `.excalidraw.svg` files in any browser. To edit one, open it at [excalidraw.com](https://excalidraw.com) or with the VS Code Excalidraw extension.
