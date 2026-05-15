import { test, expect } from "bun:test";
import { resolveRoute } from "./resolveRoute";
import type { Provider, ProviderModel } from "../types/shared";

const ccSub: Provider = {
  id: "cc-sub", name: "Claude Max", kind: "claude_subscription",
  baseUrl: null, apiKey: null, apiKeyEnvRef: null, createdAt: "", updatedAt: "",
};
const anthro: Provider = {
  id: "anthro", name: "Anthropic Direct", kind: "anthropic_api_direct",
  baseUrl: null, apiKey: null, apiKeyEnvRef: null, createdAt: "", updatedAt: "",
};
const codexSub: Provider = {
  id: "codex-sub", name: "Codex Sub", kind: "codex_subscription",
  baseUrl: null, apiKey: null, apiKeyEnvRef: null, createdAt: "", updatedAt: "",
};
const openrouter: Provider = {
  id: "or", name: "OpenRouter", kind: "openrouter",
  baseUrl: null, apiKey: null, apiKeyEnvRef: null, createdAt: "", updatedAt: "",
};

function pm(modelId: string, providerId: string, effort = ""): ProviderModel {
  return {
    id: `${providerId}-${modelId}`, providerId, modelId,
    displayName: modelId, contextLength: null,
    inputCostPerMtok: null, outputCostPerMtok: null,
    tier: null, effort, supportedParameters: null, canonicalId: null, addedAt: "",
  };
}

test("subscription wins over per-token", () => {
  const providers = [ccSub, anthro];
  const models = [pm("claude-sonnet-4-6", "cc-sub"), pm("claude-sonnet-4-6", "anthro")];
  expect(resolveRoute({
    modelName: "claude-sonnet-4-6", harness: "claude_code",
    providers, providerModels: models, pins: {},
  })).toBe("cc-sub");
});

test("openrouter is per-token, not its own tier", () => {
  const providers = [openrouter, ccSub];
  const models = [pm("some-model", "or"), pm("some-model", "cc-sub")];
  // With ccSub eligible, it should win (subscription tier beats per-token)
  expect(resolveRoute({
    modelName: "some-model", harness: "claude_code",
    providers, providerModels: models, pins: {},
  })).toBe("cc-sub");

  // Without ccSub (codex harness), openrouter should resolve as per-token
  expect(resolveRoute({
    modelName: "some-model", harness: "codex",
    providers, providerModels: models, pins: {},
  })).toBe("or");
});

test("per-harness pin overrides default tier order", () => {
  const providers = [ccSub, anthro];
  const models = [pm("claude-sonnet-4-6", "cc-sub"), pm("claude-sonnet-4-6", "anthro")];
  expect(resolveRoute({
    modelName: "claude-sonnet-4-6", harness: "claude_code",
    providers, providerModels: models,
    pins: { "claude-sonnet-4-6": { claude_code: "anthro" } },
  })).toBe("anthro");
});

test("pin for different harness does not affect resolution", () => {
  const providers = [ccSub, codexSub];
  const models = [pm("m", "cc-sub"), pm("m", "codex-sub")];
  // Pin codex to codexSub, but resolve claude_code — should get ccSub
  expect(resolveRoute({
    modelName: "m", harness: "claude_code",
    providers, providerModels: models,
    pins: { m: { codex: "codex-sub" } },
  })).toBe("cc-sub");
});

test("missing pin falls back to tier order", () => {
  const providers = [ccSub, anthro];
  const models = [pm("m", "cc-sub"), pm("m", "anthro")];
  // Pin references a provider not eligible for claude_code (e.g., codex_sub)
  expect(resolveRoute({
    modelName: "m", harness: "claude_code",
    providers, providerModels: models,
    pins: { m: { claude_code: "nonexistent" } },
  })).toBe("cc-sub");
});

test("returns null when no eligible provider for harness", () => {
  const providers = [ccSub];
  const models = [pm("claude-sonnet-4-6", "cc-sub")];
  expect(resolveRoute({
    modelName: "claude-sonnet-4-6", harness: "codex",
    providers, providerModels: models, pins: {},
  })).toBeNull();
});

test("alphabetical tiebreak among same-tier providers", () => {
  const a: Provider = {
    id: "z-provider", name: "Z", kind: "anthropic_api_direct",
    baseUrl: null, apiKey: null, apiKeyEnvRef: null, createdAt: "", updatedAt: "",
  };
  const b: Provider = {
    id: "a-provider", name: "A", kind: "anthropic_api_direct",
    baseUrl: null, apiKey: null, apiKeyEnvRef: null, createdAt: "", updatedAt: "",
  };
  const providers = [a, b];
  const models = [pm("m", "z-provider"), pm("m", "a-provider")];
  expect(resolveRoute({
    modelName: "m", harness: "claude_code",
    providers, providerModels: models, pins: {},
  })).toBe("a-provider");
});

test("effort filters to matching row when multiple efforts exist", () => {
  const providers = [ccSub];
  const models = [
    pm("claude-opus-4-7", "cc-sub", "low"),
    pm("claude-opus-4-7", "cc-sub", "high"),
  ];
  expect(resolveRoute({
    modelName: "claude-opus-4-7", effort: "high", harness: "claude_code",
    providers, providerModels: models, pins: {},
  })).toBe("cc-sub");
  expect(resolveRoute({
    modelName: "claude-opus-4-7", effort: "low", harness: "claude_code",
    providers, providerModels: models, pins: {},
  })).toBe("cc-sub");
});

test("resolveRoute without effort matches any effort row", () => {
  const providers = [ccSub];
  const models = [pm("claude-opus-4-7", "cc-sub", "high")];
  expect(resolveRoute({
    modelName: "claude-opus-4-7", harness: "claude_code",
    providers, providerModels: models, pins: {},
  })).toBe("cc-sub");
});

test("resolveRoute returns null when effort does not match", () => {
  const providers = [ccSub];
  const models = [pm("claude-opus-4-7", "cc-sub", "high")];
  expect(resolveRoute({
    modelName: "claude-opus-4-7", effort: "low", harness: "claude_code",
    providers, providerModels: models, pins: {},
  })).toBeNull();
});
