# Dragons of Mugloar: plan

> [REQUIREMENTS.md](REQUIREMENTS.md) says **what** the solution must do, independent of technology. It covers the brief, the API contract and acceptance criteria. This plan covers **how**: stack, design and build order. IDs in brackets such as `[BOT-20]` refer to the requirements.

---

## 1. Stack

| Layer                 | Choice                                                                                                                | Why                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend              | **Vue 3.5 + TypeScript + Vite + Pinia + Vue Router**                                                                  | The Composition API keeps game logic in small, testable composables. Pinia gives one explicit store per session [WEB-10]. Vite gives fast reloads and a dev proxy for the bot service.                                                                                           |
| UI components         | **PrimeVue 4** (styled mode, custom Aura preset)                                                                      | Covers every component in the sketch (toast, bottom drawer, tags, select, inline messages) with accessible markup [NFR-03]. One token preset gives it the dragon theme without adding Tailwind. Picked over shadcn-vue (more styling time) and Vuetify (Material look, heavier). |
| Backend (bot service) | **Node 22 + TypeScript + Fastify**                                                                                    | An HTTP API that starts and stops bot runs. Using TypeScript end to end keeps one shared core [CORE-01], so the bot and the web app run the same client, decoder and strategy.                                                                                                   |
| Shared core           | TypeScript + zod                                                                                                      | One API client, decoder and strategy, used by the service (bot runs) and the browser (manual play and hints).                                                                                                                                                                    |
| Tooling               | pnpm workspaces, Vitest, MSW, ESLint (+ `eslint-plugin-vue`), Prettier, `tsc` / `vue-tsc`, Playwright, GitHub Actions | One test runner and one HTTP faking approach across the repo.                                                                                                                                                                                                                    |

The README includes a Spring Boot mapping (§5) [DOC-07].

---

## 2. Architecture

The high-level architecture diagram is in [diagrams/architecture.excalidraw.svg](diagrams/architecture.excalidraw.svg). The backend bot diagram is in [diagrams/backend-bot.excalidraw.svg](diagrams/backend-bot.excalidraw.svg). Open the SVG in any browser. To edit it, use [excalidraw.com](https://excalidraw.com) or the VS Code Excalidraw extension.

```
dragons-of-mugloar/
├── packages/core/   # pure TS, isomorphic: API client, schemas, decoder, strategy, runner
├── apps/server/     # backend: Fastify bot service, run registry, SSE, benchmark
├── apps/web/        # frontend: Vue + Pinia; manual play → game API, autopilot → bot service
├── docs/            # requirements, plan, palette, diagrams, theme options
├── .github/workflows/ci.yml
└── README.md
```

```
Browser (Vue) ──manual play──▶ Dragons of Mugloar API
      │                                ▲
      └──start/stop/watch runs──▶ Bot service (Fastify) ──runs core.playGame()──┘
```

Design patterns used:

- **Adapter:** the API client wraps the game API.
- **Strategy:** bot policies are interchangeable.
- **Observer:** the runner emits events. The run registry stores them and sends them to SSE subscribers.
- **Registry:** runs live in memory and are looked up by id.
- **Dependency injection:** the client and strategy are passed into the runner and the registry. This lets tests use the fake game API [NFR-05].

### packages/core

- **`api/client.ts`:** `GameApiClient`, built on `fetch`, which both Node and the browser have.
  - Timeouts use AbortController [ERR-02].
  - Retries with backoff happen on 5xx and network errors only [ERR-03].
  - It raises typed errors: `GameOverError`, `NotFoundError` and `ApiError`.
  - Error bodies are read as text [ERR-01, API-10].
- **`api/schemas.ts`:** zod schemas for every response, including coercion of `reward` [VAL-01, VAL-02].
- **`decode.ts`:** `decodeAd(ad)`, which decodes Base64 with `atob` and ROT13 [CORE-02, CORE-03].
- **`strategy/`:** the `Strategy` interface, `chooseActions(state, ads, shop) → Action[]`, where `Action` is `Solve | Buy`. It ships with two implementations, `ExpectedValueStrategy` and the baseline `SafestFirstStrategy` [CORE-05].
- **`runner.ts`:** `playGame(client, strategy, { maxTurns, signal, onEvent })` runs the loop in BOT-01 to BOT-08.
  - It emits typed events: `started`, `turn`, `solved`, `failed`, `bought` and `gameOver`.
  - The stop signal is checked between actions, so stopping is cooperative [BOT-12].

### apps/server (bot service)

| Method | Endpoint                                             | Purpose                                                                                                        | Requirements    |
| ------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- |
| `POST` | `/api/runs` `{ strategy?, maxTurns? }`               | Start a run. Returns `201 { runId, gameId, status: "running" }`                                                | BOT-11          |
| `GET`  | `/api/runs`                                          | List active and finished runs                                                                                  | BOT-13          |
| `GET`  | `/api/runs/:id`                                      | Status, latest state, and the summary once ended                                                               | BOT-13          |
| `GET`  | `/api/runs/:id/events`                               | SSE stream: replays past events, then sends live ones                                                          | BOT-14          |
| `POST` | `/api/runs/:id/stop`                                 | Cooperative stop. Returns `202` with `stopping`; the run then becomes `stopped`. `409` if it has already ended | BOT-12          |
| `POST` | `/api/benchmarks` `{ games, concurrency, strategy }` | Run N games and return a report with stats and per-label calibration                                           | BOT-21 – BOT-24 |
| `GET`  | `/health`                                            | Liveness check                                                                                                 |                 |

- **Run registry (`RunRegistry`):**
  - stores `Map<runId, Run>`, where each run holds its status, latest state, events, AbortController and subscribers;
  - enforces the cap on active runs, refusing new ones with 429 [BOT-15];
  - clears finished runs after a TTL [BOT-17].
- **Validation:** routes are validated with zod through `fastify-type-provider-zod` [VAL-03]. Settings come from env and are parsed with zod at startup [BOT-16]: `PORT`, `GAME_API_URL`, `DEFAULT_STRATEGY`, `MAX_TURNS`, `MAX_ACTIVE_RUNS`, `BENCH_MAX_CONCURRENCY` and `RUN_TTL_MS`.
- **Errors:** one error handler maps them to `{ error: { code, message, details? } }` with 400, 404, 409, 429 or 502 [ERR-08]. When a run throws, that run ends as `failed`; the process keeps running [ERR-04].
- **Logging and CORS:** Fastify's pino logger writes structured logs per run and per turn [BOT-18]. `@fastify/cors` lets the web app call the service; in dev the Vite proxy handles `/api` [BOT-19].
- **Command-line use:** the README documents `curl` commands, and `pnpm bench` is a small script that calls `/api/benchmarks` [BOT-25].

### apps/web

The UI/UX sketch is in [diagrams/frontend-ui.excalidraw.svg](diagrams/frontend-ui.excalidraw.svg).

- **Framework and routing:** `<script setup lang="ts">`, with Vue Router serving `/play` (manual) and `/autopilot` (bot runs).
- **State: Pinia** [WEB-10 – WEB-13]. Vuex and TanStack Query are not used, because the state is one game session and live run streams, not data cached from a server.

  | Store                        | State                                                                   | Getters                                                                                                                                                                                                                                                     | Actions                                                                             |
  | ---------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
  | `useGameStore` (manual play) | `game`, `ads` (decoded), `shop`, `reputation`, `log`, `status`, `error` | `boardAds` (API order or the player's sort, never strategy order) [FUN-01], `hints` (`core`'s expected value per ad, only while the advisor is on) [WEB-07], `isGameOver`, `isLastLife`, `canAfford(item)`, `highScore` (from `useHighScoreStore`) [WEB-18] | `startGame`, `refreshAds`, `solve`, `buy`, `investigate`, `reset`                   |
  | `useRunsStore` (autopilot)   | `runs`, `activeRunId`, `events` per run, `status`, `error`              | `activeRun`, `scoreHistory`                                                                                                                                                                                                                                 | `startRun`, `stopRun`, `fetchRuns`, `subscribe(runId)` (EventSource), `unsubscribe` |
  | `useHighScoreStore` (both)   | `best` (stored) [WEB-18]                                                |                                                                                                                                                                                                                                                             | `record(score)`                                                                     |
  - Every result goes through one `applyEvent(event)` per store.
  - **Personal high score [WEB-18]:** `useHighScoreStore` keeps `best` in `localStorage` under `mugloar.highScore`, through `useStoredRef`, and `record(score)` only raises it. `useGameStore` records every applied event and exposes it as `highScore`; `solve` reads the old value first so the "New high score!" milestone [FUN-08] compares against the best from before the quest. `useRunsStore` records run events, the run list and end summaries. Both views pass it to `StatsBar` as `highScore`.
    - **Why not the API's `highScore`:** it was `0` in every response, also after a game of 1035 points and at the start of the next game (checked 2026-11-08, API-19). It cannot be shown or used for a milestone.
    - **Why its own key:** the saved game [WEB-15] is a copy of one session, and it is removed on abandon, on a stale save and when a new game replaces it. A best score has to outlive all of those, so it is stored apart and nothing that clears a game touches it. This also replaces the old `highScoreAtStart` field in the saved game, which is no longer needed.
    - **Why `localStorage`:** there is no user account or endpoint that stores it, so "the current user" means this browser. The cost is that clearing site data, or using another browser, resets it. Storage is guarded like the other preferences [WEB-14].
  - The API clients are injected through `provide`/`inject`.
  - The EventSource is closed when the user leaves the page.

- **Components:** `StatsBar`, `AdBoard` and `AdCard`, `QuestSuspense` and `QuestResult` (the suspense phase and the reveal, both shown in the `Dialog` in `AdBoard`), `ShopPanel`, `ReputationPanel` (an explicit Investigate button, because it uses a turn) [WEB-16], `EventLog`, the play toolbar (a red "Abandon game" during a game, no button otherwise) [WEB-17], `RunControls`, `RunList`, and `ScoreChart` (inline SVG). Components only display state; they read stores and call their actions.
- **UI library: PrimeVue 4**, styled mode. The theme is one `theme.ts` (`definePreset` on Aura, using the tokens in [PALETTE.md](PALETTE.md)), and components are imported one by one.

  | Sketch element                                   | Component                                                                                                                                                                                                                                                                                                                                                                    |
  | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Ad card                                          | `Card`. Every card looks the same: no highlighted or pre-selected pick [FUN-01]                                                                                                                                                                                                                                                                                              |
  | Risk badges, `decoded` / `trap` tags, run status | `Tag` (`severity` plus a text label, so color is never the only signal) [NFR-03]                                                                                                                                                                                                                                                                                             |
  | Solve, Buy, Start / Stop run                     | `Button`. `:disabled` for unaffordable items, with a `v-tooltip` on a wrapper span (disabled buttons get no pointer events) saying how much gold is missing [WEB-04], `:loading` only on the clicked button [WEB-12]. Other actions stay enabled and queue behind the request in flight; an identical one is dropped. Trap ads keep an enabled "Solve (not advised)" button. |
  | API error with Retry                             | `Toast` with a custom template [ERR-05]                                                                                                                                                                                                                                                                                                                                      |
  | Max turns validation                             | `InputText type="number"` + `Message variant="simple"` [VAL-04]. Not `InputNumber`, which clamps on blur and would hide the error.                                                                                                                                                                                                                                           |
  | Strategy                                         | `Select`                                                                                                                                                                                                                                                                                                                                                                     |
  | Bot service down, empty state                    | `Message`                                                                                                                                                                                                                                                                                                                                                                    |
  | Mobile shop and log                              | `Drawer position="bottom"`                                                                                                                                                                                                                                                                                                                                                   |
  | Suspense phase                                   | In a modal PrimeVue `Dialog` owned by `AdBoard`, with no close button while it runs [FUN-02, FUN-03]                                                                                                                                                                                                                                                                         |
  | Reveal                                           | In the same `Dialog` after the suspense phase. It stays until the player presses Continue, Close or Esc (`closeReveal`), then the board reloads [FUN-04]                                                                                                                                                                                                                     |

  Kept custom: `StatsBar` (CSS grid), the bottom tab bar (`<nav>` + `RouterLink`), `EventLog` (`aria-live="polite"`, auto-scroll) and `ScoreChart` (inline SVG).

- **Responsive layout:** mobile-first CSS grid [NFR-01].
- **Error UX:** an error boundary, toasts with retry, inline form errors, and a "bot service unavailable" state on `/autopilot` [ERR-05, VAL-04].

---

## 3. Bot strategy

1. Decode the ads [CORE-02].
2. Map each probability label to an estimated success rate [CORE-04]. Start with a hand-tuned table, then **calibrate it from benchmark data** [BOT-22]. This is what makes the bot reliable rather than lucky.
3. Filter out trap ads, such as ones containing _steal_, but only for ads the spike data confirms are harmful [CORE-07].
4. Score each ad as `p * reward - (1 - p) * lifeCost`, where `lifeCost = LIFE_VALUE / max(lives, 1)` and `LIFE_VALUE = 240`. A life costs 240 gold at 1 life, 120 at 2 and 80 at 3. When scores are within 5 gold, prefer ads that are about to expire [CORE-06]. The web app's Advisor EV is this same score for the current lives, rounded [WEB-07].
   | Label            | p    | Label              | p    |
   | ---------------- | ---- | ------------------ | ---- |
   | Piece of cake    | 0.95 | Risky              | 0.40 |
   | Walk in the park | 0.90 | Rather detrimental | 0.30 |
   | Sure thing       | 0.85 | Playing with fire  | 0.25 |
   | Quite likely     | 0.75 | Suicide mission    | 0.15 |
   | Hmmm....         | 0.60 | Impossible         | 0.05 |
   | Gamble           | 0.50 | Unknown label      | 0.10 |
5. **Shopping rules:**
   - If lives are low, buy `hpot` first [BOT-05].
   - If there is spare gold beyond the potion reserve, buy upgrades: 100-cost items early, 300-cost items later.
   - Use the benchmark to check whether a higher level really improves the odds.
6. If no ad is safe, take the safest one anyway [CORE-08].
7. The bot plays until lives run out [BOT-06] or it is stopped [BOT-12], so the strategy also has to cope with the late game.

---

## 4. Testing

| Scope          | Tools                                                                                                                                                                                                                                                                       | Covers            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| core           | Vitest. The **fake game API** is deterministic and in-memory, served through MSW so the real `fetch` client runs unchanged.                                                                                                                                                 | TEST-01 – TEST-03 |
| server         | Vitest with `fastify.inject()` against the fake game API: validation, start, stop (including 409), get, list, 429, 502, SSE stream, registry TTL, benchmark stats                                                                                                           | TEST-04           |
| web stores     | Real Pinia (`setActivePinia(createPinia())`) and MSW, with no store mocks                                                                                                                                                                                                   | TEST-05           |
| web components | `@testing-library/vue` with real Pinia, PrimeVue and MSW, with no `vi.mock`. One shared `renderWithPlugins` helper installs Pinia, PrimeVue and `ToastService`. Toasts and drawers render outside the component, at the end of `<body>`, so tests query them with `screen`. | TEST-06           |
| e2e (optional) | One Playwright smoke test on chromium, firefox and webkit                                                                                                                                                                                                                   | TEST-09, NFR-02   |
| CI             | GitHub Actions runs lint, `tsc` and `vue-tsc`, the tests and the build                                                                                                                                                                                                      | TEST-08, DEL-03   |

---

## 5. README

The README covers DOC-01 to DOC-07. These parts are specific to this stack:

- **Quick start:**
  - `pnpm i`;
  - `pnpm dev`, which starts the service and the web app together;
  - `pnpm bench`;
  - `pnpm test`;
  - `curl` examples to start and stop a run.
- **API reference:** the endpoint table above, with request and response examples.
- **Mapping to Spring Boot [DOC-07]:**

  | This repo       | Spring Boot                                    |
  | --------------- | ---------------------------------------------- |
  | Fastify routes  | `@RestController`                              |
  | `GameApiClient` | a `RestClient` bean                            |
  | zod schemas     | records with Bean Validation                   |
  | `Strategy`      | an interface with `@Component` implementations |
  | `RunRegistry`   | a `@Service` with a `ConcurrentHashMap`        |
  | async runs      | `@Async` or a `TaskExecutor`                   |
  | SSE             | `SseEmitter`                                   |
  | error handler   | `@ControllerAdvice`                            |

- **Requirements checklist [DOC-04]:** each requirement ID with the file that implements it and the test that covers it.

---

## 6. Build order

| Step | Focus                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Scaffold:** pnpm, TS, lint, Vitest and CI; `apps/web` with PrimeVue and the theme preset; the Fastify skeleton. **API spike:** confirm the game-over status code and the encryption encodings, and collect ad samples and trap ads. |
| 2    | `core` (client, schemas, decoder, runner, first strategy) with tests. **Milestone:** a script plays one game to 1000.                                                                                                                 |
| 3    | Server: run registry, routes, SSE, stop, benchmark, plus the fake game API and route tests. Benchmark and calibrate until BOT-20 holds.                                                                                               |
| 4    | Web: both Pinia stores and their tests first, then the `/play` and `/autopilot` views, the responsive layout and error UX, with component tests.                                                                                      |
| 5    | Polish: accessibility, e2e, README with the API reference, screenshots, AI-usage section.                                                                                                                                             |
| 6    | Clone fresh and follow only the README [DEL-05].                                                                                                                                                                                      |

If time runs short, cut in this order: e2e, then the score chart, then the second strategy, then the run list. **Never cut** any MUST in REQUIREMENTS.md.

---

## 7. Definition of done

**Done** means every MUST in REQUIREMENTS.md is met and listed in the README checklist [DOC-04].

| Quality           | What "good" looks like                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code organisation | One pure, isomorphic core with thin server and web layers, clear names, and no dead code.                                                                                      |
| Traceability      | Requirement IDs are traceable to code and tests. The brief's loop maps one-to-one onto `playGame`.                                                                             |
| Strategy          | Driven by data: a calibrated probability table, an expected-value score with a life-cost term, and a benchmark that compares strategies. Runs can be watched and stopped live. |
| Design            | The patterns in §2, RESTful status codes, cooperative cancellation, a centralised Pinia store, idiomatic Vue, typed errors, schema validation, and CI.                         |
| Documentation     | The README explains _why_, with an API reference, trade-offs and honest notes on limitations and AI use.                                                                       |

### Possible extensions

- Add a strategy and compare it in the benchmark.
- Change the potion threshold.
- Use `investigate/reputation`.
- Add a "stop at target score" option to `POST /api/runs`.
- Add a `DELETE /api/runs/:id` endpoint.
- Add pause and resume for a run.
- Add a Pinia getter, such as "total gold spent".

### Design FAQ

| Question                                             | Answer                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Why share the core between Node and the browser?     | One client, decoder and strategy, so manual-play hints and the bot always agree [CORE-01].                                     |
| How does stopping work?                              | An AbortController is checked between actions. A request in flight is never killed [BOT-12].                                   |
| Why SSE and not WebSockets?                          | The stream is one-way, runs over plain HTTP, and reconnects on its own.                                                        |
| What happens to runs if the server restarts?         | They are lost by design [BOT-17]. For production, add a database and a job queue.                                              |
| Why Pinia, and not Vuex or state kept in components? | Pinia is the official Vue store, typed and small, and one store per session keeps state changes in one place [WEB-10, WEB-11]. |
| Why Node and not Spring Boot?                        | One language end to end and a shared core. The README has the Spring mapping [DOC-07].                                         |
| How do you know it reliably passes 1000?             | `pnpm bench` plays 30+ games against the live API and reports the success rate [BOT-20, BOT-21].                               |
| What would change for production?                    | Persistence, horizontal scaling with a shared run store, auth, rate limiting, observability.                                   |
