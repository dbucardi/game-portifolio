# Dragons of Mugloar — code instructions

A pnpm workspace with three packages: a shared TypeScript core, a Fastify bot service and a Vue 3 web app. Requirement IDs (`BOT-05`, `WEB-12`, `FUN-02`…) refer to `docs/REQUIREMENTS.md`.

> **Docs live in `docs/`:** `REQUIREMENTS.md` (the contract), `PLAN.md` (stack and design), `PALETTE.md` (theme tokens), `diagrams/architecture.excalidraw` (high-level), `diagrams/backend-bot.excalidraw` and `diagrams/frontend-ui.excalidraw` (sketches). **Every change must keep the code, the requirements, the sketches and the docs in sync** (see "Docs to touch per change").

## Layout

```
packages/core/          # @mugloar/core: isomorphic, no UI, no Node-only APIs (CORE-01, NFR-05)
  src/api/              # GameApiClient (fetch, timeout, retry on 5xx/network), typed errors, zod schemas
  src/decode.ts         # Base64 / ROT13 ad decoding, unknown flags skipped (CORE-02, CORE-03)
  src/probability.ts    # label → success rate (CORE-04)
  src/strategy/         # Strategy interface, scoring, BaseStrategy, TurnPhased + SafestFirst, createStrategy(name)
  src/runner.ts         # playGame(): the bot loop (BOT-01 – BOT-08), cooperative stop via AbortSignal
  src/events.ts         # typed game events
  src/bot/contract.ts   # bot service request/response/run-event shapes, shared with the web app
  src/testing/          # in-memory fake game API (exported as @mugloar/core/testing)
apps/server/            # @mugloar/server: Fastify bot service
  src/config.ts         # env settings, validated with zod at startup (BOT-16)
  src/app.ts            # app factory: plugins, CORS, error handler (ERR-08)
  src/routes/           # runs.ts (start/stop/get/list/SSE), benchmarks.ts
  src/runs/registry.ts  # in-memory RunRegistry: cap (429), TTL, SSE subscribers
  src/benchmark/        # N games with capped concurrency, stats, calibration
  scripts/bench.ts      # `pnpm bench`, writes docs/benchmark.json
docs/                   # requirements, plan, palette, diagrams/, benchmark.json
apps/web/               # @mugloar/web: Vue 3 + Pinia + Vue Router + PrimeVue 4
  src/views/            # PlayView (/play, manual), AutopilotView (/autopilot, bot runs)
  src/components/       # display only: read stores, call actions, no API calls (WEB-10)
  src/stores/           # game (manual play), runs (autopilot), preferences
  src/api/              # BotServiceClient, injection keys (provide/inject)
  src/session.ts        # applyGameEvent(): the one path that applies results to state (WEB-11)
  src/gameFeel.ts       # suspense timing, flavour text, board sort, milestones (FUN-*)
  src/savedGame.ts      # resume manual play after reload (WEB-15)
  src/storage.ts        # guarded localStorage read/write, shared by savedGame and useStoredRef
  src/clock.ts          # injectable Clock (FUN-09)
  src/theme.ts          # PrimeVue Aura preset; colours from docs/PALETTE.md
```

## Commands

Node 22 (`.nvmrc`), pnpm 9.

```sh
pnpm install
pnpm dev                       # server :3000 + web :5173 (Vite proxies /api to the server)
pnpm --filter @mugloar/core test        # one package; same for @mugloar/server, @mugloar/web
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build   # what CI runs
pnpm format                    # fix formatting
pnpm bench --games 30 --strategies turn-phased,safest-first   # LIVE API, slow
```

Run the full CI line before saying a change is done, and report failures as they are.

## Rules

### Architecture

- Domain logic goes in `packages/core` and is used by both apps. Don't duplicate the client, decoding, validation or strategy in an app.
- Inject dependencies: the runner and registry take a `GameApiClient` and a `Strategy`; the web app gets `gameApi`, `botService`, `clock` and `random` through `provide`/`inject` (`src/plugins.ts`, `src/api/injection.ts`).
- New strategy: implement `Strategy` in `packages/core/src/strategy/`, add it to `STRATEGY_NAMES`, `STRATEGY_LABELS` and `FACTORIES` in `strategy/index.ts`. Server validation and the web Select pick it up from there.
- New setting: add it to `configSchema` in `apps/server/src/config.ts`, the matching `.env.example`, and the README settings table.
- New endpoint or response shape: put the types in `packages/core/src/bot/contract.ts`, validate input with zod, and return errors in the `{ error: { code, message, details? } }` shape.
- Game over is a normal end, not an error (ERR-06).

### Manual play (game feel)

- The board keeps the game's order or the player's chosen sort. Never rank, highlight or pre-select an ad (FUN-01). Strategy output appears only through opt-in advisor hints, and never reorders the board (WEB-07).
- The suspense delay lives only in the web app and uses the injected `Clock`. Never slow down the game API or the bot service (FUN-02, NFR-07).
- State changes go through store actions and `applyGameEvent` (WEB-11). Derived values are `computed`, not stored (WEB-13).

### Tests

- Vitest everywhere. Tests never call the live API (TEST-07): use MSW with the fake game API from `@mugloar/core/testing`.
- Server: `apps/server/test/helpers.ts` (`useFakeNetwork`, `fakeGame`, `testApp`, `holdSolves`, `waitFor`, `parseSse`), and `fastify.inject()` for routes.
- Web: `renderWithPlugins`, `testDependencies`, `createFakeClock` and `useFakeGameApi` from `apps/web/test/utils.ts`. Use real Pinia, PrimeVue and components, and no `vi.mock`. Toasts and drawers render in `<body>`, so query them with `screen`.
- Drive suspense with `clock.advance(ms)`, never real timers.
- Name the requirement ID in the test title or a comment where it helps traceability.

### Style

- Strict TypeScript, ESLint and Prettier must be clean. Vue SFCs use `<script setup lang="ts">`.
- Names should explain the code. Comment only non-obvious logic or workarounds, briefly; a requirement ID is a fine comment.
- Don't commit `.env`, `dist`, or the benchmark output unless you mean to update the published results.

## Docs to touch per change

A change is not done until each file below has been checked and, where affected, updated in the same piece of work.

| Change                                                       | Update                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Behaviour (new, changed or removed)                          | `docs/REQUIREMENTS.md` (stable IDs, testable criteria) and the README requirements checklist (DOC-04: ID → file → test) |
| Endpoint, error code, setting, command                       | `README.md` (API, errors, settings, commands) and `docs/PLAN.md`                                                        |
| Package, app, external service or the HTTP flow between them | `docs/diagrams/architecture.excalidraw` and `docs/PLAN.md`                                                              |
| Bot loop, registry, strategy, server structure               | `docs/diagrams/backend-bot.excalidraw` and `docs/PLAN.md`                                                               |
| UI layout, component, copy or state                          | `docs/diagrams/frontend-ui.excalidraw` (desktop and mobile) and `docs/PLAN.md`                                          |
| Theme or colours                                             | `src/theme.ts`, `src/assets/main.css` and `docs/PALETTE.md`                                                             |
| Setting added, renamed or default changed                    | `apps/*/.env.example` and the README settings table                                                                     |
| Benchmark results                                            | `README.md`, with numbers from a real `pnpm bench` run only                                                             |

In the final summary, list every file in this table and say whether it was updated or not affected.

### Requirements (`docs/REQUIREMENTS.md`)

- New behaviour gets a new ID in the right section; changed behaviour edits the existing ID.
- **IDs are stable.** Never renumber or reuse one. Drop a requirement by marking it dropped with the reason, not by deleting the row.
- Keep it stack-agnostic: no framework, library or file names. Those belong in `docs/PLAN.md`.
- Use MUST / SHOULD / MAY, each with a testable acceptance criterion. Update the source-brief table (§0) when it traces back to the brief; say so when it is a design decision (as with B11 and B12).
- New API facts found against the live API go in §2, with the date checked.

### Sketches (`docs/diagrams/*.excalidraw`)

- Diagrams are Excalidraw files in `docs/diagrams/`. Add a new diagram there as an `.excalidraw` file, not as Mermaid or an image.
- `architecture.excalidraw` is the high-level view: browser, web app, bot service, shared core, game API and the calls between them. Keep it high level; details go in `backend-bot` and `frontend-ui`.
- They are Excalidraw JSON. Edit them with `jq` or precise edits:
  - change both `text` and `originalText` of a text element, and keep its `id`;
  - text in a shape has a `containerId`; resize the container if the text gets longer;
  - new elements need a unique `id`, and arrows need matching `startBinding`/`endBinding` plus `boundElements` on both ends;
  - validate afterwards with `jq empty <file>`.
- Requirement IDs in the sketches must match `docs/REQUIREMENTS.md`, and the sketches must not contradict it (for example, no "best pick" marker on manual-play ads, FUN-01).

### Docs style

Short sentences, plain English, tables for reference material.

## Git

- Branch `main`; CI runs on every push and PR (`.github/workflows/ci.yml`).
- Always ask before committing. Messages are one short line. Keep one change (code, tests and README) in one commit, so the history shows how the work progressed (DEL-02).
