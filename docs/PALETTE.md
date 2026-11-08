# Dragons of Mugloar: design palette

The colors come from the game art: the logo, the dragon, the mission image and the forest background. Each image was reduced to its 8 most common colors, and the scales below are built around those colors. The logo and background ship with the web app in [`apps/web/src/assets/`](../apps/web/src/assets/).

| Source            | Dominant colors                                                       | Becomes                                       |
| ----------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| Logo              | `#c41311` `#a40e0d` `#830b0b` `#e3442d` `#f0a565` `#fef3b9` `#3b0606` | **Dragon** (primary) and the **Gold** accent  |
| Dragon            | `#e4ca94` `#d1b583` `#bfa174` `#6c5f49`                               | **Parchment** (surfaces and neutrals)         |
| Mission image     | `#d3b881` `#b89553` `#9b7433` `#482c0e`                               | **Ink** (text) and **Gold**                   |
| Forest background | `#011717` `#0f2a27` `#214844` `#dbc4a2`                               | **Forest** (secondary, focus ring, dark mode) |

The look: ads are notes on parchment, written in dark brown ink. Actions use the **Brand** indigo, and the night forest is used for dark mode.

**Why not red for actions:** red already means error and danger (failed ad, life lost, Retry). A red primary made every Solve/Buy button look like a warning, and its dark, muted tone at 60% opacity looked the same as a disabled button. Dragon red is now only used for danger. The primary is a saturated indigo that no status uses (success is green, info is steel blue, warn is gold, danger is red). Disabled buttons are neutral parchment, so they can't be mistaken for a dimmed brand color.

## Scales

### Parchment: surfaces and neutrals (Ink = steps 700–950)

| 50        | 100       | 200       | 300       | 400       | 500       | 600       | 700       | 800       | 900       | 950       |
| --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| `#fbf6ea` | `#f5ebd3` | `#ecdcb4` | `#e4ca94` | `#d1b583` | `#bfa174` | `#9b7f55` | `#6c5f49` | `#4a3a26` | `#2e2214` | `#1c140b` |

### Brand: primary (Solve, Buy, New game)

| 50        | 100       | 200       | 300       | 400       | 500       | 600       | 700       | 800       | 900       | 950       |
| --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| `#eef2ff` | `#e0e7ff` | `#c7d2fe` | `#a5b4fc` | `#818cf8` | `#6366f1` | `#4f46e5` | `#4338ca` | `#3730a3` | `#312e81` | `#1e1b4b` |

### Dragon: danger only

| 50        | 100       | 200       | 300       | 400       | 500       | 600       | 700       | 800       | 900       | 950       |
| --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| `#fdeceb` | `#fbd0cc` | `#f6a39b` | `#ef7466` | `#e3442d` | `#c41311` | `#a40e0d` | `#830b0b` | `#5e0808` | `#3b0606` | `#260404` |

### Gold: accent (1000 target line, game-over panel, logo shine)

| 50        | 100       | 200       | 300       | 400       | 500       | 600       | 700       | 800       | 900       | 950       |
| --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| `#fffbea` | `#fef3b9` | `#fbe38a` | `#f5c86a` | `#e8b04a` | `#d49a2a` | `#b07d1c` | `#8f6114` | `#6b4500` | `#4d330a` | `#2e1f06` |

### Forest: secondary, focus ring and dark mode surfaces

| 50        | 100       | 200       | 300       | 400       | 500       | 600       | 700       | 800       | 900       | 950       |
| --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| `#e8f1ef` | `#c9ddd9` | `#9cc0b9` | `#6a9d94` | `#3f7a71` | `#2b5f57` | `#214844` | `#173833` | `#0f2a27` | `#062120` | `#011717` |

## Semantic tokens

| Token                                                                   | Light                                                                                      | Dark                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| `bg.app`                                                                | parchment-100 `#f5ebd3`, with the forest background behind it under a 70% forest-950 scrim | forest-950 `#011717`                  |
| `bg.surface` (cards, panels)                                            | parchment-50 `#fbf6ea`                                                                     | forest-900 `#062120`                  |
| `bg.subtle` (stat tiles, header)                                        | parchment-200 `#ecdcb4`                                                                    | forest-800 `#0f2a27`                  |
| `border`                                                                | parchment-400 `#d1b583`                                                                    | forest-700 `#173833`                  |
| `text`                                                                  | ink-900 `#2e2214`                                                                          | parchment-100 `#f5ebd3`               |
| `text.muted`                                                            | ink-700 `#6c5f49`                                                                          | parchment-300 `#e4ca94`               |
| `primary` (Solve, Start run)                                            | brand-600 `#4f46e5`, white text                                                            | brand-400 `#818cf8`, ink-950 text     |
| `primary.hover`                                                         | brand-700 `#4338ca`                                                                        | brand-300 `#a5b4fc`                   |
| `button.disabled`                                                       | parchment-200 fill, parchment-700 text, no opacity                                         | forest-800 fill, parchment-300 text   |
| `button.outlined.secondary` (Refresh, Shop)                             | parchment-800 text, parchment-600 border                                                   | parchment-200 text, forest-300 border |
| `accent` (1000 target line, game-over panel; never marks an ad, FUN-01) | gold-500 `#d49a2a`                                                                         | gold-300 `#f5c86a`                    |
| `focus.ring`                                                            | forest-600 `#214844`, 2px plus a 2px offset                                                | gold-200 `#fbe38a`                    |

### Status (the event log, toasts, messages)

The event-log colors match the sketch (green, red, blue).

| Status  | Text                 | Background           | Dark text            | Used for                                    |
| ------- | -------------------- | -------------------- | -------------------- | ------------------------------------------- |
| success | `#24572e`            | `#dcebd5`            | `#8cc79a`            | ad solved, run finished                     |
| info    | `#1d4a68`            | `#d6e6f0`            | `#8cbfe0`            | purchase, run running                       |
| warn    | gold-800 `#6b4500`   | `#fbe9b7`            | gold-300 `#f5c86a`   | trap ad, run stopped                        |
| danger  | dragon-700 `#830b0b` | dragon-100 `#fbd0cc` | dragon-300 `#ef7466` | failed ad, life lost, run failed, lives = 1 |

### Risk badges (API-17)

Each badge always shows the label text, so color is never the only signal (NFR-03).

| Tier      | Labels                                                                      | Text / background                           |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| Safe      | Piece of cake, Walk in the park, Sure thing                                 | `#24572e` / `#dcebd5`                       |
| Likely    | Quite likely, Hmmm....                                                      | gold-800 `#6b4500` / `#fbe9b7`              |
| Risky     | Gamble, Risky                                                               | `#7a2e0b` / `#fbdcc4`                       |
| Dangerous | Rather detrimental, Playing with fire, Suicide mission, Impossible, unknown | dragon-700 `#830b0b` / dragon-100 `#fbd0cc` |

## Contrast (WCAG 2.1, checked)

| Pair                                                              | Ratio                            |
| ----------------------------------------------------------------- | -------------------------------- |
| Text ink-900 on parchment-100                                     | 13.07                            |
| Muted ink-700 on parchment-100 / parchment-50                     | 5.25 / 5.78                      |
| White on brand-600                                                | 6.29                             |
| Brand-600 button on parchment-50 (non-text, needs 3:1)            | 5.83                             |
| White on dragon-600 / dragon-500 (danger buttons)                 | 7.93 / 6.09                      |
| Badge text on its background (success, warn, risky, danger, info) | 6.82 / 7.04 / 7.26 / 7.43 / 7.37 |
| Focus ring forest-600 on parchment-100 (non-text, needs 3:1)      | 8.53                             |
| Dark: parchment-100 on forest-900                                 | 14.21                            |
| Dark: ink-950 on brand-400 button                                 | 6.10                             |
| Dark: brand-400 button on forest-900 (non-text)                   | 5.65                             |
| Dark: status text on forest-900 (danger, success, warn, info)     | 5.91 / 8.63 / 10.71 / 8.54       |

Every pair is at least 4.5:1. Avoid dragon-400 `#e3442d` and gold-400/500 as text on parchment: they are for decoration only.

## PrimeVue preset

The full preset lives in [`apps/web/src/theme.ts`](../apps/web/src/theme.ts) (primitives `parchment`, `brand`, `dragon`, `gold`, `forest`; `semantic.primary` points at `brand`). The disabled-button rule is in [`apps/web/src/assets/main.css`](../apps/web/src/assets/main.css).

Use `Tag` severities for the status and risk colors: success = Safe, warn = Likely, danger = Dangerous. Add one custom `risky` class for the orange tier, because PrimeVue has no orange severity.
