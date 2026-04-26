import { test, expect } from "bun:test";
import { buildSpawnEnv } from "../src/providers/recipes";
import type { Provider } from "../src/db/providers";
import type { ProviderModel } from "../src/db/providerModels";

const baseProvider = (over: Partial<Provider> = {}): Provider => ({
  id: "p1",
  name: "test",
  kind: "openrouter",
  baseUrl: null,
  apiKey: "or-key",
  apiKeyEnvRef: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...over,
});

const baseModel = (over: Partial<ProviderModel> = {}): ProviderModel => ({
  id: "m1",
  providerId: "p1",
  modelId: "anthropic/claude-sonnet-4.6",
  displayName: "Sonnet",
  contextLength: 200000,
  inputCostPerMtok: 3.0,
  outputCostPerMtok: 15.0,
  tier: null,
  supportedParameters: null,
  addedAt: "2026-01-01",
  ...over,
});

test("openrouter × claude_code produces Anthropic-shaped env", () => {
  const env = buildSpawnEnv(baseProvider(), baseModel(), "claude_code");
  expect(env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe("or-key");
  expect(env.ANTHROPIC_API_KEY).toBe("");
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("anthropic/claude-sonnet-4.6");
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("anthropic/claude-sonnet-4.6");
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("anthropic/claude-sonnet-4.6");
});

test("openrouter × codex produces OpenAI-shaped env", () => {
  const env = buildSpawnEnv(baseProvider(), baseModel(), "codex");
  expect(env.OPENAI_BASE_URL).toBe("https://openrouter.ai/api/v1");
  expect(env.OPENAI_API_KEY).toBe("or-key");
});

test("anthropic_api_direct × claude_code uses tier-specific model when present", () => {
  const env = buildSpawnEnv(
    baseProvider({ kind: "anthropic_api_direct" }),
    baseModel({ modelId: "claude-opus-4-7", tier: "opus" }),
    "claude_code",
  );
  expect(env.ANTHROPIC_API_KEY).toBe("or-key");
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("claude-opus-4-7");
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined();
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeUndefined();
});

test("subscription kinds produce empty env (CLI uses keychain)", () => {
  const env = buildSpawnEnv(
    baseProvider({ kind: "claude_subscription", apiKey: null }),
    baseModel(),
    "claude_code",
  );
  expect(Object.keys(env)).toHaveLength(0);
});

test("env-ref credentials resolve from process.env", () => {
  process.env.MY_TEST_KEY = "resolved-secret";
  try {
    const env = buildSpawnEnv(
      baseProvider({ apiKey: null, apiKeyEnvRef: "MY_TEST_KEY" }),
      baseModel(),
      "claude_code",
    );
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("resolved-secret");
  } finally {
    delete process.env.MY_TEST_KEY;
  }
});

test("missing env-ref throws clearly", () => {
  expect(() =>
    buildSpawnEnv(
      baseProvider({ apiKey: null, apiKeyEnvRef: "DEFINITELY_NOT_SET_XYZ" }),
      baseModel(),
      "claude_code",
    ),
  ).toThrow(/DEFINITELY_NOT_SET_XYZ/);
});

test("custom_anthropic_compat uses provider.baseUrl", () => {
  const env = buildSpawnEnv(
    baseProvider({
      kind: "custom_anthropic_compat",
      baseUrl: "https://my-proxy.example.com",
    }),
    baseModel({ modelId: "some-model" }),
    "claude_code",
  );
  expect(env.ANTHROPIC_BASE_URL).toBe("https://my-proxy.example.com");
});

test("unsupported (kind, harness) pair throws", () => {
  expect(() =>
    buildSpawnEnv(
      baseProvider({ kind: "anthropic_api_direct" }),
      baseModel(),
      "codex",
    ),
  ).toThrow(/anthropic_api_direct.*codex/);
});
