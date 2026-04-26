import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAdapter } from "../src/adapters/codex";
import type { NormalizedEvent } from "../src/adapters/types";

function probeCodex(): boolean {
  try {
    const r = Bun.spawnSync(["codex", "--version"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
const HAVE_CODEX = probeCodex() && !process.env.B3_SKIP_CLI_TESTS;

test.skipIf(!HAVE_CODEX)(
  "codex adapter spawns and captures thread_id + emits expected events",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "b3-cx-"));
    const adapter = new CodexAdapter();
    const events: NormalizedEvent[] = [];
    const handle = await adapter.spawn({
      runId: "test-run",
      workdir: dir,
      initialPrompt: "Reply with exactly: PONG",
      env: {},
      provider: {
        harness: "codex",
        id: "openai-direct",
        label: "OpenAI",
        pricingMode: "subscription",
        env: {},
        models: [],
      },
      model: { id: "gpt-5.4" },
      skills: [],
      onEvent: (ev) => events.push(ev),
    });
    const deadline = Date.now() + 90_000;
    while (
      Date.now() < deadline &&
      !events.some((e) => e.t === "segment_end")
    ) {
      await new Promise((r) => setTimeout(r, 200));
    }
    await adapter.close(handle);
    const types = events.map((e) => e.t);
    expect(types).toContain("session_init");
    expect(types).toContain("turn_start");
    expect(types).toContain("assistant_text");
    expect(types).toContain("segment_end");
    expect(handle.sessionId).toBeTruthy();
    const usage = events.find((e) => e.t === "usage");
    expect(usage).toBeDefined();
  },
  120_000,
);
