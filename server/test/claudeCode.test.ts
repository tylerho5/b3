import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claudeCode";
import type { NormalizedEvent } from "../src/adapters/types";

function probeClaude(): boolean {
  try {
    const r = Bun.spawnSync(["claude", "--version"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
const HAVE_CLAUDE = probeClaude();

function setupRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "b3-cc-"));
  Bun.spawnSync(["git", "init", "-q", "-b", "main"], { cwd: dir });
  Bun.spawnSync(["git", "config", "user.email", "t@t"], { cwd: dir });
  Bun.spawnSync(["git", "config", "user.name", "t"], { cwd: dir });
  Bun.spawnSync(
    ["git", "commit", "-q", "--allow-empty", "-m", "init"],
    { cwd: dir },
  );
  return dir;
}

test.skipIf(!HAVE_CLAUDE)(
  "claude code adapter spawns and emits session_init + assistant_text + segment_end",
  async () => {
    const dir = setupRepo();
    const adapter = new ClaudeCodeAdapter();
    const events: NormalizedEvent[] = [];
    const handle = await adapter.spawn({
      runId: "test-run",
      workdir: dir,
      initialPrompt: "Reply with exactly: PONG",
      env: {},
      provider: {
        harness: "claude_code",
        id: "anthropic-direct",
        label: "Anthropic",
        pricingMode: "per_token",
        env: {},
        models: [],
      },
      model: { id: "claude-haiku-4-5", tier: "haiku" },
      skills: [],
      onEvent: (ev) => events.push(ev),
    });
    const deadline = Date.now() + 60_000;
    while (
      Date.now() < deadline &&
      !events.some((e) => e.t === "segment_end")
    ) {
      await new Promise((r) => setTimeout(r, 200));
    }
    await adapter.close(handle);
    const types = events.map((e) => e.t);
    expect(types).toContain("session_init");
    expect(types).toContain("assistant_text");
    expect(types).toContain("segment_end");
  },
  90_000,
);
