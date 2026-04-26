import { test, expect } from "bun:test";
import {
  inferCodexKind,
  legacyToCodexSpawnEnv,
} from "../src/adapters/codex";
import type { ProviderConfig } from "../src/config/types";

const provider = (
  env: Record<string, string>,
  codexProfile?: string,
): ProviderConfig => ({
  harness: "codex",
  id: "p",
  label: "P",
  pricingMode: "per_token",
  env,
  codexProfile,
  models: [],
});

test("infers openai_api_direct from OPENAI_API_KEY only", () => {
  expect(inferCodexKind({ OPENAI_API_KEY: "sk-test" })).toBe(
    "openai_api_direct",
  );
});

test("infers openrouter from openrouter base url", () => {
  expect(
    inferCodexKind({
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
      OPENAI_API_KEY: "or-key",
    }),
  ).toBe("openrouter");
});

test("infers custom_openai_compat from non-openrouter base url", () => {
  expect(
    inferCodexKind({
      OPENAI_BASE_URL: "https://my-llm.example.com/v1",
      OPENAI_API_KEY: "k",
    }),
  ).toBe("custom_openai_compat");
});

test("infers codex_subscription from empty env", () => {
  expect(inferCodexKind({})).toBe("codex_subscription");
});

test("codex_profile bypasses recipe (returns empty env, legacy passthrough handles it)", () => {
  const env = legacyToCodexSpawnEnv(
    provider({}, "openrouter"),
    { id: "z-ai/glm-4.6" },
  );
  expect(env).toEqual({});
});

test("subscription path returns empty env (CLI uses keychain)", () => {
  const env = legacyToCodexSpawnEnv(provider({}), { id: "gpt-5.5" });
  expect(env).toEqual({});
});

test("openai_api_direct path produces OPENAI_API_KEY", () => {
  const env = legacyToCodexSpawnEnv(
    provider({ OPENAI_API_KEY: "sk-test" }),
    { id: "gpt-5.5" },
  );
  expect(env.OPENAI_API_KEY).toBe("sk-test");
});

test("openrouter via env (no codex_profile) produces base_url + key", () => {
  const env = legacyToCodexSpawnEnv(
    provider({
      OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
      OPENAI_API_KEY: "or-key",
    }),
    { id: "z-ai/glm-4.6" },
  );
  expect(env.OPENAI_BASE_URL).toBe("https://openrouter.ai/api/v1");
  expect(env.OPENAI_API_KEY).toBe("or-key");
});
