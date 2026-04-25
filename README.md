# b3 — bench bench bench

A local benchmarking tool that runs the same coding task across multiple
combinations of `(harness × provider × model)` in parallel, with a live
dashboard during execution and per-run review afterwards. Worktree-isolated,
plugin-style harness adapters (Claude Code + Codex in v1), and Anthropic Agent
Skills as first-class inputs.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- `claude` CLI (Claude Code), authenticated. Used by the orchestrator and the
  in-flow task refiner.
- `codex` CLI, authenticated, if you want to run the Codex harness.
- Provider API keys exported in your shell as env vars — b3 reads them via
  `${VAR}` interpolation in `~/.config/b3/config.toml` and never persists
  secrets. Common ones:
  - `ANTHROPIC_API_KEY` for Anthropic-direct
  - `ALIBABA_CLAUDE_CODE_API_KEY` for Alibaba Coding Plan
  - `GLM_API_KEY` for z.ai (GLM)
  - `OPENROUTER_CLAUDE_CODE_API_KEY` for OpenRouter through Claude Code
  - `OPENAI_API_KEY` for OpenAI-direct (Codex)

Providers whose env vars are missing are skipped at startup with a console
warning; b3 still boots with whatever subset is configured.

## Setup

```bash
bun install
```

On first run, b3 copies a default config to `~/.config/b3/config.toml` if one
isn't already there. Edit it (or use the Providers UI) to add/remove providers.

### Codex profile (optional)

If you want to route Codex through OpenRouter (or any custom provider),
configure a profile in `~/.codex/config.toml`. Example:

```toml
[profiles.openrouter]
model_provider = "openrouter"

[model_providers.openrouter]
name = "OpenRouter"
base_url = "https://openrouter.ai/api/v1"
env_key = "OPENROUTER_API_KEY"
```

Then reference `codex_profile = "openrouter"` in the corresponding b3 provider
block.

### Heads-up on Codex model availability

If your Codex auth is a ChatGPT account (rather than an OpenAI API key), some
model slugs (`gpt-5`, `gpt-5.5`, `gpt-5-codex`) may be rejected with a 400
"model is not supported" error. `gpt-5.4` is verified to work on a ChatGPT
account at the time of writing. `~/.codex/config.toml`'s `model = ...` setting
overrides what b3 passes via `-m`.

## Run

```bash
bun dev
```

This starts the backend on `http://127.0.0.1:4477` and the Vite dev server on
`http://localhost:6767`. Open `http://localhost:6767` in your browser. Vite
proxies `/api` and `/ws` through to the backend.

## Authoring a task

In the **tasks** page:

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

In the **runs** page:

1. Select a task.
2. Pick harnesses (chips), then providers (filtered by harness), then models
   (filtered by selected providers).
3. Optionally pick skill bundles. Selected bundles are copied (frozen) into
   each run's worktree at both `.claude/skills/<name>/` and
   `.agents/skills/<name>/`.
4. Set concurrency (default 4) and click `▶ run`.
5. Live cards stream tokens/sec and tool-call sparklines, the rolling tool
   strip, the latest skill invocation, and a tail line of the most recent
   tool/text.
6. Use the broadcast bar above the cards to inject the same message into all
   sessions, either at the next segment boundary (default; preserves clean
   per-segment timing) or immediately. Each card has its own message input
   for per-session injects.

## Reviewing a run

Click a card's title or any history row to open `/runs/:matrixId/:runId`:

- **Transcript** — events grouped by segment; broadcast/follow-up segments are
  visually distinct.
- **Diff** — `git diff` of the worktree vs. base commit.
- **Test log** — captured stdout + stderr from the test phase.
- **Judge** — click "generate prompt" to render a copy-pasteable Claude Code
  prompt referencing the on-disk artifacts. Run it in your own Claude Code
  session and paste back the score + notes.

