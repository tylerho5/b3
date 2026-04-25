# b3 — bench bench bench

A local benchmarking tool that runs the same coding task across multiple
combinations of `(harness × provider × model)` in parallel, with live
observability and post-run review. Worktree-isolated, plugin-style harness
adapters (Claude Code + Codex in v1), Anthropic Agent Skills as first-class
inputs.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- `claude` CLI (Claude Code) authenticated
- `codex` CLI authenticated (for the Codex harness)
- Provider API keys exported in your shell (`ANTHROPIC_API_KEY`,
  `ALIBABA_CLAUDE_CODE_API_KEY`, `OPENROUTER_*`, etc.) — b3 reads them via
  `${VAR}` interpolation in `~/.config/b3/config.toml`. b3 never persists
  secrets.

## Run

```
bun install
bun dev
```

Then open `http://localhost:6767` (Vite dev server proxies `/api` and `/ws` to
the backend on `127.0.0.1:4477`).

See `.claude/plans/2026-04-25-b3-design.md` for the full design.
