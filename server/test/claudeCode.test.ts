import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claudeCode";
import type { NormalizedEvent } from "../src/adapters/types";
import type { Provider } from "../src/db/providers";
import type { ProviderModel } from "../src/db/providerModels";

const SUBSCRIPTION_PROVIDER: Provider = {
  id: "p-claude-sub",
  name: "Claude (subscription)",
  kind: "claude_subscription",
  baseUrl: null,
  apiKey: null,
  apiKeyEnvRef: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const HAIKU_MODEL: ProviderModel = {
  id: "m-haiku",
  providerId: SUBSCRIPTION_PROVIDER.id,
  modelId: "claude-haiku-4-5",
  displayName: "Claude Haiku 4.5",
  contextLength: null,
  inputCostPerMtok: null,
  outputCostPerMtok: null,
  tier: "haiku",
  supportedParameters: null,
  addedAt: "2026-01-01",
};

function probeClaude(): boolean {
  try {
    const r = Bun.spawnSync(["claude", "--version"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
const HAVE_CLAUDE = probeClaude() && !process.env.B3_SKIP_CLI_TESTS;

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
      provider: SUBSCRIPTION_PROVIDER,
      model: HAIKU_MODEL,
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
