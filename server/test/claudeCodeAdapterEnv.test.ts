import { test, expect } from "bun:test";
import {
  inferClaudeCodeKind,
  legacyToClaudeCodeSpawnEnv,
} from "../src/adapters/claudeCode";
import type { ProviderConfig } from "../src/config/types";

const provider = (env: Record<string, string>): ProviderConfig => ({
  harness: "claude_code",
  id: "p",
  label: "P",
  pricingMode: "per_token",
  env,
  models: [],
});

test("infers anthropic_api_direct from ANTHROPIC_API_KEY only", () => {
  expect(
    inferClaudeCodeKind({ ANTHROPIC_API_KEY: "sk-test" }),
  ).toBe("anthropic_api_direct");
});

test("infers openrouter from openrouter base url", () => {
  expect(
    inferClaudeCodeKind({
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_AUTH_TOKEN: "or-key",
    }),
  ).toBe("openrouter");
});

test("infers custom_anthropic_compat from non-openrouter base url", () => {
  expect(
    inferClaudeCodeKind({
      ANTHROPIC_BASE_URL: "https://my-proxy.example.com",
      ANTHROPIC_AUTH_TOKEN: "k",
    }),
  ).toBe("custom_anthropic_compat");
});

test("infers claude_subscription from empty env", () => {
  expect(inferClaudeCodeKind({})).toBe("claude_subscription");
});

test("subscription path: empty recipe + tier fallback adds tier-specific model env", () => {
  const env = legacyToClaudeCodeSpawnEnv(provider({}), {
    id: "claude-haiku-4-5",
    tier: "haiku",
  });
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-haiku-4-5");
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined();
});

test("subscription path with no tier: fallback sets all three model env vars", () => {
  const env = legacyToClaudeCodeSpawnEnv(provider({}), {
    id: "some-model",
  });
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("some-model");
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("some-model");
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("some-model");
});

test("anthropic_api_direct path produces ANTHROPIC_API_KEY + tier-aware model env", () => {
  const env = legacyToClaudeCodeSpawnEnv(
    provider({ ANTHROPIC_API_KEY: "sk-test" }),
    { id: "claude-opus-4-7", tier: "opus" },
  );
  expect(env.ANTHROPIC_API_KEY).toBe("sk-test");
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("claude-opus-4-7");
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined();
});

test("openrouter path produces ANTHROPIC_BASE_URL + AUTH_TOKEN + empty API_KEY", () => {
  const env = legacyToClaudeCodeSpawnEnv(
    provider({
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_AUTH_TOKEN: "or-key",
    }),
    { id: "anthropic/claude-sonnet-4.6" },
  );
  expect(env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe("or-key");
  expect(env.ANTHROPIC_API_KEY).toBe("");
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("anthropic/claude-sonnet-4.6");
});

test("custom_anthropic_compat path preserves base_url", () => {
  const env = legacyToClaudeCodeSpawnEnv(
    provider({
      ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
      ANTHROPIC_AUTH_TOKEN: "glm-key",
    }),
    { id: "glm-5.1" },
  );
  expect(env.ANTHROPIC_BASE_URL).toBe("https://api.z.ai/api/anthropic");
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe("glm-key");
});
