# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About project

Local benchmarking tool: same coding task across N `(harness × provider × model)` cells in parallel. Bun + TypeScript backend (server) + Vite + React frontend (ui). Worktree-isolated per run. Plugin-style adapters for Claude Code and Codex.

Single-process server on `127.0.0.1:4477`. Vite dev server on `localhost:6767` proxies `/api` and `/ws`.

## How to run

```bash
bun install            # workspaces require both server/ and ui/ to exist first
bun dev                # starts both server and Vite
```

Open `http://localhost:6767`. (Vite binds IPv6 on macOS — use `localhost`, not `127.0.0.1`, when curling the dev server.)

Per-workspace:
```bash
cd server && bun run dev      # server only
cd ui && bun run dev          # ui only
```

## Test suite

```bash
cd server && bun test                  # full suite (~60-90s, includes integration)
cd server && bun test test/db.test.ts  # single file
cd server && bunx --bun tsc --noEmit -p .   # typecheck (run from server/, NOT root)
```

55 tests across 14 files. Pure unit + real-CLI integration. No mocks.

| File | Covers | CLI gate |
|---|---|---|
| `db.test.ts` | Schema, idempotent migrations | — |
| `tasks.test.ts` | Task CRUD | — |
| `runs.test.ts` | matrix_runs / runs / segments / events repos | — |
| `config.test.ts` | TOML loader, env interpolation, missing-var errors | — |
| `skills.test.ts` | Discovery (4 sources) + materialization (copy/symlink/collision) | — |
| `worktree.test.ts` | `createWorktree`, `captureDiff`, `removeWorktree`, baseRepo=null mode | — |
| `claudeCode.test.ts` | Real `claude -p` stream-json round-trip | `skipIf` no `claude` |
| `codex.test.ts` | Real `codex exec --json`; uses `gpt-5.4` | `skipIf` no `codex` |
| `runOne.test.ts` | End-to-end single-run + worktree + diff + meta.json | `skipIf` no `claude` |
| `runMatrix.test.ts` | Concurrency cap, sequential mode, cancellation (fake runOneFn) | — |
| `testRunner.test.ts` | Exit codes, log capture, timeout SIGKILL, serialization wall-clock | — |
| `broadcast.test.ts` | wait/immediate modes, late-join, unregister | — |
| `refiner.test.ts` | Real `claude -p --output-format json`, parse + zod | `skipIf` no `claude` |
| `e2e.test.ts` | Full HTTP stack: POST task → POST launch → poll status → WS hub events → on-disk artifacts | `skipIf` no `claude` |

Integration test gotchas:
- Real CLI calls cost real money (~$0.02/refine, $0.001/runOne). Re-running the suite is not free.
- Tests rely on the user's existing `claude` and `codex` CLI auth (OAuth keychain). Setting `ANTHROPIC_*` env vars would auth as a different user.
- The Codex test specifically uses `gpt-5.4` because ChatGPT Free account auth rejects `gpt-5`/`gpt-5.5`/`gpt-5-codex`.
- `testRunner.test.ts` "two concurrent test phases serialize" measures wall-clock — flaky on heavily contended CI. Currently 1-flaky-rerun observed in 30+ runs.
- `bun test` reuses the same process, and `testRunner` uses a module-level promise mutex. Tests that share that mutex can interact across files.

Type-checking: Run `tsc` from inside `server/` (or `ui/`), NOT from the repo root. The root tsconfig has no `include` and tsc walks the whole tree, picking up files with mismatched JSX/types options.

## UI patterns (visual conventions)

The visual language preserves a consistent set of design tokens. Don't introduce new tokens; reuse the existing ones.

3px categorical left-border is THE characteristic pattern. Every list row, card, and segment uses it:
- `.sb-item` (nav + task list rows): transparent default, `--accent` when active.
- `.session-card`: `--cat-plugin` (`#c8d6e5`) for Claude Code, `--cat-user` (`#d5c4f2`) for Codex, `--accent` when selected, `--success`/`--error` when terminal.
- `.skill-row`: `--cat-plugin` for plugin source, `--cat-user` for user sources.
- `.transcript-segment`: `--cat-user` for broadcast segments, `--accent` for follow-ups.

All colors via CSS custom properties. Never hardcode hex outside `:root`. The full token list is in `ui/src/styles/shell.css` (extended in `ui/src/index.css`).

Pricing-mode display rules:
- `per_token` → `$0.034` (3-decimal dollars).
- `subscription` → `subscription` badge. Never show $0.00 — looks like "free" and breaks cross-provider comparison.
- `unknown` → `—`.

Sparklines (`Sparkline.tsx`): uplot wrapper, fixed 220×24 px, muted stroke + `--accent` fill at 0.10 alpha. Reads CSS tokens at runtime via `getComputedStyle(document.documentElement).getPropertyValue(name)` — keeps colors in sync with theme without prop drilling. 60-second window, 1Hz tick.

Modal pattern (`RefinerModal`): tertiary-bg header strip, primary-bg body, single 12px radius, no shadow beyond the scrim. The scrim does the visual separation.

Error/callout pattern: `padding: 12px; background: rgba(220,53,69,0.10); border: 1px solid rgba(220,53,69,0.30); color: var(--error)`. Tint-plus-solid formula. Reusable for any severity by swapping the base RGB.

Button flavors (`shell.css`):
- `.primary` — filled accent, white text. Stand-alone actions (Save, Run).
- `.secondary` — chrome bordered, default for toolbar controls.
- `.danger` — ghost, only colored on hover. Row-local destructive (delete).

WS event hook (`useEvents(matrixRunId)`): Auto-reconnects on close with 1.5s backoff. Returns `{byRunId: Record<runId, NormalizedEvent[]>, connected: boolean}`. Don't subscribe directly to the WebSocket from components.

Derived series (`useDerivedSeries`): Computes `tokensPerSec`, `toolCallsPerTick` (60-bucket arrays), last 12 tool names, latest skill, tail line, running aggregates from a NormalizedEvent stream. Recomputes whenever events change OR `now` ticks. Pass `now` from a 1Hz interval in the parent — don't put a `Date.now()` inside the hook.

Click-through vs select on `SessionCard`: The card body is the click-toggle for selection (used by broadcast). The header `<Link>` opens detail. Inner click handlers must `e.stopPropagation()` to avoid the parent toggle.

Type sharing: `ui/src/types/shared.ts` is hand-mirrored from `server/src/db/*` and `server/src/adapters/types.ts`. Update both sides when adding fields. (Will codegen later if it becomes a maintenance burden.)


## SQLite

Lives in `server/src/db/`. `bun:sqlite` directly — no ORM.

Connection (`openDb`):
```ts
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
```
WAL is required (concurrent reads during writes). Foreign keys are off by default in SQLite — explicitly enabled.

Schema location: `server/src/db/migrations/0001_initial.sql`. Eight tables (tasks, matrix_runs, providers_cache, runs, run_segments, events, skill_bundles, schema_migrations). Never edit `0001_initial.sql` after it ships. Add `0002_*.sql` for changes.

Migration runner matches files by `^(\d+)` prefix, applies in order, tracks applied versions in `schema_migrations`. Idempotent — runs on every server boot.

`events.payload_json` is JSON-encoded. This is deliberate: adapters can add new `NormalizedEvent` variants without schema migrations. The shape is `{run_id, segment_seq, ts_ms, type, payload_json}`. The `type` column lets you query by event type without parsing JSON.

Aggregates live on `runs` (input_tokens, output_tokens, cost_usd, turns) and are summed across segments. Per-segment totals live on `run_segments`. `incrementRunUsage` is wrapped in `db.transaction(...)()` — note the trailing `()`, `bun:sqlite`'s `transaction()` returns a callable, not the result. Calling without `()` is a no-op.

`closeSegment` is also transactional — reads `started_at`, computes `duration_ms`, then writes both. Don't split into separate queries; the row may be queried mid-transition.

All string IDs are `ulid`. Sortable timestamps; lexicographic order = chronological. Don't `ORDER BY created_at DESC` when `ORDER BY id DESC` works (it does, by construction). `tasks` and `runs` IDs are interchangeable in URLs without conflict.

Snake_case in DB, camelCase in TS. Conversion happens in per-table row-mapper functions (`rowToTask`, `rowToRun`, etc.). Each repository file owns its types AND mappers — no central types file. Don't leak snake_case past the repository layer.

`judge_enabled INTEGER` ↔ `judgeEnabled boolean` explicit conversion in mappers (`r.judge_enabled === 1`). SQLite has no bool type.

Default DB path: `~/.local/share/b3/b3.db`. Override with `dbPath` to `createAppState`. Tests use `:memory:`.

Repository convention: one file per logical aggregate. Functions are small, one DB query per function. Use `db.query(...).get()` for one row, `.all()` for many, `.run(...)` for writes.

## Critical non-obvious behaviors

A few things that bite anyone touching this code without context:

- Adapter shapes are fundamentally different. Claude Code = one long-lived subprocess, stdin stays open across turns. Codex = new subprocess per turn (`codex exec resume <thread_id>`). Don't try to unify spawn semantics.
- Both adapters set all three `ANTHROPIC_DEFAULT_<TIER>_MODEL` env vars to the same model when tier is unset. Otherwise subagents spawned by skills route to a different model than the one under test.
- Test phase mutex is module-level (process-global), not per-matrix. Parallel `pytest`/`npm test` runs collide on shared ports/DBs/tmp dirs.
- Broadcast default is `wait` mode, not `immediate`. Holds delivery until all live sessions hit `segment_end`. Late-joining sessions don't retroactively receive prior broadcasts.
- Diff capture is `git add -A && git diff --cached <baseCommit>` in one shot. Don't try to compose multiple diff calls.
- `baseRepo: null` worktree mode creates a `git init` + empty `.gitkeep` commit. Without that empty commit, `git diff` against HEAD doesn't work.
- Config soft-loads by default in the server: missing `${VAR}` env vars cause that provider to be skipped with a `console.warn`, not a crash. Tests use strict mode.
- Config env interpolation is `${VAR}` only — no `${VAR:-default}` shell-style fallbacks. The TOML parser rejects `:-`.
- `GET /api/providers` returns the raw `tomlText`. The editor uses this to preserve comments and `${VAR}` placeholders. Never re-synthesize from parsed config — comments and placeholders are lost.
- Server `tsconfig.json` types must be `["bun"]`, not `["bun-types"]` — actual package is `@types/bun`.
- `Bun.spawnSync(["claude", "--version"])` throws if `claude` is not on PATH but returns normally on non-zero exit. Wrap in try/catch when probing CLI availability.

## Conventions

- DB ↔ TS: snake_case in SQL columns, camelCase in TS. Conversion in row-mapper functions. Don't leak snake_case past the repository layer.
- Adapter event mapping returns `NormalizedEvent[]` (array, not single). One raw event can produce multiple normalized events (e.g., one Claude `assistant` block emits both `assistant_text` and `tool_call`).
- Each repository file owns its types AND row mappers. No central types file.
- `runs/` is gitignored. Don't commit run artifacts, ever.
- Branch naming for feature work: `feat/th-<topic>` per global git conventions.