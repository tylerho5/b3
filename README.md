# b3 — bench bench bench

A local benchmarking tool that runs the same coding task across multiple
combinations of `(harness × provider × model × effort)` in parallel, with a live
dashboard during execution and per-run review afterwards. Worktree-isolated,
plugin-style harness adapters (Claude Code + Codex), and Anthropic Agent Skills
as first-class inputs.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- `claude` CLI (Claude Code), authenticated. Used by the orchestrator and the
  in-flow task refiner.
- `codex` CLI, authenticated, if you want to run the Codex harness.

## Setup

```bash
bun install
```

Providers, models, and the judge template live in SQLite at
`~/.local/share/b3/b3.db` and are managed entirely from the **Providers** page
in the UI. API keys can be stored inline (plaintext in the local DB) or
referenced via `apiKeyEnvRef` so the secret is read from your shell environment
at spawn time.

## Provider kinds

| Kind | Harness | Credentials | Notes |
|------|---------|-------------|-------|
| `claude_subscription` | Claude Code | none (CLI keychain) | Your `claude` login |
| `codex_subscription` | Codex | none (CLI keychain) | Your `codex` login |
| `openrouter` | both | API key | Proxies both Anthropic and OpenAI models |
| `anthropic_api_direct` | Claude Code | API key | Direct Anthropic API |
| `openai_api_direct` | Codex | API key | Direct OpenAI API |
| `custom_anthropic_compat` | Claude Code | API key + base URL | Self-hosted or proxy (e.g. LiteLLM) |
| `custom_openai_compat` | Codex | API key + base URL | Self-hosted or proxy (e.g. LiteLLM) |

Subscription providers (`claude_subscription` / `codex_subscription`) are
auto-detected at boot — if you have the CLI installed and authenticated they
appear as ghost rows on the Providers page ready to be activated.

## Reasoning effort

Provider models can carry an **effort** variant (`low`, `medium`, `high`,
`xhigh`, `max`) that controls the `--effort` flag passed to the underlying CLI.
These levels are not standardized across providers — each provider defines its
own effort scale. API models (those with no effort variants) omit the flag.
When a model has multiple effort variants, each one becomes its own row in the
matrix grid — you can benchmark the same model at different reasoning budgets
side by side.

## Run

```bash
bun dev
```

This starts the backend on `http://127.0.0.1:4477` and the Vite dev server on
`http://localhost:6767`. Open `http://localhost:6767` in your browser. Vite
proxies `/api` and `/ws` through to the backend.

## Authoring a task

In the **Tasks** page:

1. Click `+ new` to start a blank task, or click `✨ refine with claude code`
   to give the refiner a rough description and have it populate name + prompt
   + suggested test command for you. The refiner uses your existing `claude`
   CLI auth (no API key handling). Override the model with
   `B3_REFINER_MODEL=claude-haiku-4-5`.
2. Fill in:
   - **prompt** — what the agent should do.
   - **base repo** — absolute path to a git repo, or leave blank for a fresh
     `git init` worktree.
   - **base commit** — pinned SHA. Required when base repo is set.
   - **test command** — shell command, exit 0 = pass. Optional. Test phase is
     serialized globally across all runs to avoid port/db/tmpdir collisions.
   - **time budget** — kill switch in seconds.
3. Save.

## Running a matrix

In the **Runs** page:

1. Select a task.
2. Pick harnesses (chips), then providers (filtered by harness), then models
   (filtered by selected providers). Models with effort variants expand to show
   individual effort levels you can toggle independently.
3. Optionally pick skill bundles. Selected bundles are copied (frozen) into
   each run's worktree at both `.claude/skills/<name>/` and
   `.agents/skills/<name>/`.
4. Set concurrency (default 4). An **estimate** button shows historical median
   duration for selected cells based on past runs.
5. Click `▶ run`.
6. Live cards stream tokens/sec and tool-call sparklines, the rolling tool
   strip, the latest skill invocation, and a tail line of the most recent
   tool/text.
7. Use the **broadcast bar** above the cards to inject the same message into
   all sessions. Two modes: **wait** (delivers at the next segment boundary —
   preserves clean per-segment timing; default) or **immediate** (injects
   instantly). Each card also has its own message input for per-session
   injects.

## Reviewing a run

Click a card's title or any history row to open `/runs/:matrixId/:runId`:

- **Transcript** — events grouped by segment; broadcast/follow-up segments are
  visually distinct.
- **Diff** — `git diff` of the worktree vs. base commit.
- **Test log** — captured stdout + stderr from the test phase.
- **Judge** — click "generate prompt" to render a copy-pasteable Claude Code
  prompt referencing the on-disk artifacts. Run it in your own Claude Code
  session and paste back the score + notes. The judge template is editable from
  the **Settings** page.

## Route pins

When multiple providers offer the same model (e.g. OpenRouter and a direct API
key both serve `claude-opus-4-7`), you can pin a specific provider for each
harness. Pins are managed in the model picker (`+ add models` → configure icon)
and are stored per `(modelKey, harness)` in the database.

## Skills

Skill bundles are discovered at boot from four sources:

| Source | Path | Label |
|--------|------|-------|
| User (Claude Code) | `~/.claude/skills/` | `user_claude` |
| Plugins | `~/.claude/plugins/cache/` | `plugin` |
| User (Codex) | `~/.codex/skills/` | `user_codex` |
| User (Agents) | `~/.agents/skills/` | `user_agents` |

For plugin sources, only the highest-version directory per plugin/skill pair is
kept. Selected skills are materialized into the worktree before the agent runs.

## Test suite

```bash
cd server && bun test                          # full suite (~60-90s, includes integration)
cd server && B3_SKIP_CLI_TESTS=1 bun test      # skip real-CLI tests (~6s, local dev)
cd server && bun test test/db.test.ts          # single file
cd server && bunx --bun tsc --noEmit -p .      # typecheck (run from server/, NOT root)
```

`B3_SKIP_CLI_TESTS=1` skips the 7 tests that spawn `claude` / `codex` (the same
ones that auto-skip when the binary isn't on PATH). Use during development to
keep the loop tight; let the unflagged run gate releases.

## Architecture

```
ui (Vite + React 18) ──/api proxy──▶ server (Bun.serve :4477)
                                         │
                                         ├── SQLite (bun:sqlite, WAL mode)
                                         ├── WebSocket (/ws) — live event stream
                                         ├── adapters/ — Claude Code + Codex CLI wrappers
                                         ├── orchestrator/ — matrix launch, broadcast, test runner
                                         └── worktree/ — git worktree isolation per run
```

- **Backend**: Single-process Bun server. No framework — manual routing over
  `Bun.serve`. SQLite with WAL for concurrent reads during writes. WebSocket
  upgrade at `/ws` for real-time event streaming.
- **Frontend**: Vite + React 18 + React Router 6. Sparklines via uPlot. CSS
  custom properties for theming — no CSS-in-JS.
- **Adapters**: Each harness (Claude Code, Codex) has its own adapter that
  spawns the CLI, parses its streaming JSON output, and maps it to a shared
  `NormalizedEvent` stream. Events are append-only in SQLite and broadcast to
  UI subscribers via WebSocket.
- **Isolation**: Every run gets its own git worktree (or fresh `git init` for
  greenfield tasks). Diffs are captured against the base commit after the agent
  finishes.
