import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAdapter } from "../src/adapters/codex";
import type { NormalizedEvent } from "../src/adapters/types";
import type { Provider } from "../src/db/providers";
import type { ProviderModel } from "../src/db/providerModels";

const CODEX_SUBSCRIPTION_PROVIDER: Provider = {
  id: "p-codex-sub",
  name: "Codex (subscription)",
  kind: "codex_subscription",
  baseUrl: null,
  apiKey: null,
  apiKeyEnvRef: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const GPT_MODEL: ProviderModel = {
  id: "m-gpt",
  providerId: CODEX_SUBSCRIPTION_PROVIDER.id,
  modelId: "gpt-5.4",
  displayName: "GPT 5.4",
  contextLength: null,
  inputCostPerMtok: null,
  outputCostPerMtok: null,
  tier: null,
  supportedParameters: null,
  addedAt: "2026-01-01",
};

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
      provider: CODEX_SUBSCRIPTION_PROVIDER,
      model: GPT_MODEL,
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
