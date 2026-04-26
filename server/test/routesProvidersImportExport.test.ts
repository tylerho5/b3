import { test, expect, beforeEach, afterEach } from "bun:test";
import TOML from "@iarna/toml";
import { createTestApp, type TestApp } from "./_helpers";
import { createProvider } from "../src/db/providers";
import { addProviderModels } from "../src/db/providerModels";
import { putSetting } from "../src/db/appSettings";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => {
  t.cleanup();
});

async function postJson(path: string, body: unknown): Promise<Response> {
  return t.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET /api/providers/export returns TOML matching DB state", async () => {
  const p = createProvider(t.app.db, {
    name: "Anthropic",
    kind: "anthropic_api_direct",
    apiKey: "sk-test",
  });
  addProviderModels(t.app.db, p.id, [
    {
      modelId: "claude-opus-4-7",
      displayName: "Claude Opus",
      tier: "opus",
      inputCostPerMtok: 15,
      outputCostPerMtok: 75,
    },
  ]);
  putSetting(t.app.db, "judge_template", "score it");

  const r = await t.fetch("/api/providers/export");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toMatch(/toml|text\/plain/);
  const body = await r.text();
  const parsed = TOML.parse(body) as Record<string, unknown>;
  expect(parsed.version).toBe(1);
  expect((parsed.judge as { template: string }).template).toBe("score it");
  const providers = parsed.providers as {
    claude_code?: Array<Record<string, unknown>>;
  };
  expect(providers.claude_code).toBeDefined();
  expect(providers.claude_code).toHaveLength(1);
  expect(providers.claude_code![0].id).toBe(p.id);
  expect(providers.claude_code![0].label).toBe("Anthropic");
  const env = providers.claude_code![0].env as Record<string, string>;
  expect(env.ANTHROPIC_API_KEY).toBe("sk-test");
  const models = providers.claude_code![0].models as Array<{ id: string; tier: string }>;
  expect(models[0].id).toBe("claude-opus-4-7");
  expect(models[0].tier).toBe("opus");
});

test("GET /api/providers/export emits openrouter under both harnesses", async () => {
  const p = createProvider(t.app.db, {
    name: "OR",
    kind: "openrouter",
    apiKey: "or-key",
  });
  addProviderModels(t.app.db, p.id, [
    { modelId: "anthropic/claude-sonnet-4.6", displayName: "S" },
  ]);
  const r = await t.fetch("/api/providers/export");
  const parsed = TOML.parse(await r.text()) as {
    providers: {
      claude_code?: unknown[];
      codex?: unknown[];
    };
  };
  expect(parsed.providers.claude_code).toHaveLength(1);
  expect(parsed.providers.codex).toHaveLength(1);
});

test("GET /api/providers/export preserves api_key_env_ref as ${VAR}", async () => {
  createProvider(t.app.db, {
    name: "Anthropic",
    kind: "anthropic_api_direct",
    apiKeyEnvRef: "ANTHROPIC_API_KEY",
  });
  const r = await t.fetch("/api/providers/export");
  const text = await r.text();
  expect(text).toContain("${ANTHROPIC_API_KEY}");
});

test("POST /api/providers/import parses TOML and inserts rows", async () => {
  const toml = `
version = 1

[judge]
template = "imported judge"

[[providers.claude_code]]
id = "anthropic-direct"
label = "Anthropic"
pricing_mode = "per_token"
env.ANTHROPIC_API_KEY = "sk-imported"
models = [
  { id = "claude-opus-4-7", tier = "opus", input_cost_per_mtok = 15.0, output_cost_per_mtok = 75.0 },
]

[[providers.codex]]
id = "openai-direct"
label = "OpenAI"
pricing_mode = "subscription"
env.OPENAI_API_KEY = "\${OPENAI_API_KEY}"
models = [
  { id = "gpt-5.5" },
]
`;
  const r = await postJson("/api/providers/import", { toml, replace: false });
  expect(r.status).toBe(200);

  const list = (await (await t.fetch("/api/providers")).json()) as {
    providers: Array<{ name: string; kind: string; apiKey: string | null; apiKeyEnvRef: string | null }>;
    models: Array<{ modelId: string }>;
  };
  expect(list.providers).toHaveLength(2);
  const anth = list.providers.find((p) => p.kind === "anthropic_api_direct");
  expect(anth?.apiKey).toBe("sk-imported");
  expect(anth?.apiKeyEnvRef).toBeNull();
  const oai = list.providers.find((p) => p.kind === "openai_api_direct");
  expect(oai?.apiKey).toBeNull();
  expect(oai?.apiKeyEnvRef).toBe("OPENAI_API_KEY");
  expect(list.models.map((m) => m.modelId).sort()).toEqual([
    "claude-opus-4-7",
    "gpt-5.5",
  ]);
});

test("POST /api/providers/import replace=true wipes existing", async () => {
  createProvider(t.app.db, {
    name: "old",
    kind: "openrouter",
    apiKey: "k",
  });
  const toml = `
version = 1

[[providers.claude_code]]
id = "anthropic-direct"
label = "Anthropic"
env.ANTHROPIC_API_KEY = "new"
models = [{ id = "claude-haiku-4-5", tier = "haiku" }]
`;
  await postJson("/api/providers/import", { toml, replace: true });
  const list = (await (await t.fetch("/api/providers")).json()) as {
    providers: Array<{ name: string; kind: string }>;
  };
  expect(list.providers).toHaveLength(1);
  expect(list.providers[0].kind).toBe("anthropic_api_direct");
});

test("POST /api/providers/import coalesces openrouter-claude + openrouter-codex", async () => {
  const toml = `
version = 1

[[providers.claude_code]]
id = "openrouter-claude"
label = "OpenRouter (Claude)"
pricing_mode = "per_token"
env.ANTHROPIC_BASE_URL = "https://openrouter.ai/api"
env.ANTHROPIC_AUTH_TOKEN = "or-key"
models = [{ id = "anthropic/claude-sonnet-4.6" }]

[[providers.codex]]
id = "openrouter-codex"
label = "OpenRouter (Codex)"
pricing_mode = "per_token"
env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1"
env.OPENAI_API_KEY = "or-key"
models = [{ id = "z-ai/glm-4.6" }]
`;
  await postJson("/api/providers/import", { toml, replace: true });
  const list = (await (await t.fetch("/api/providers")).json()) as {
    providers: Array<{ kind: string }>;
    models: Array<{ modelId: string }>;
  };
  const orProviders = list.providers.filter((p) => p.kind === "openrouter");
  expect(orProviders).toHaveLength(1);
  expect(list.models.map((m) => m.modelId).sort()).toEqual([
    "anthropic/claude-sonnet-4.6",
    "z-ai/glm-4.6",
  ]);
});

test("POST /api/providers/import imports judge template into app_settings", async () => {
  const toml = `
version = 1

[judge]
template = "score this"
`;
  await postJson("/api/providers/import", { toml, replace: false });
  const r = await t.fetch("/api/settings/judge");
  // 1.18 not yet shipped at this test — fall back to direct DB read.
  if (r.status === 200) {
    const body = (await r.json()) as { template: string };
    expect(body.template).toBe("score this");
  } else {
    const { getSetting } = await import("../src/db/appSettings");
    expect(getSetting(t.app.db, "judge_template")).toBe("score this");
  }
});

test("POST /api/providers/import returns 400 on invalid TOML", async () => {
  const r = await postJson("/api/providers/import", {
    toml: "not = valid = toml",
    replace: false,
  });
  expect(r.status).toBe(400);
});

test("POST /api/providers/import requires toml field", async () => {
  const r = await postJson("/api/providers/import", { replace: false });
  expect(r.status).toBe(400);
});
