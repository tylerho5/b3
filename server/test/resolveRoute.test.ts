import { test, expect } from "bun:test";
import type { Provider } from "../src/db/providers";
import type { ProviderModel } from "../src/db/providerModels";
import { resolveRoute } from "../src/providers/resolveRoute";

function makeProvider(
  id: string,
  kind: Provider["kind"],
): Provider {
  return {
    id,
    name: id,
    kind,
    baseUrl: null,
    apiKey: null,
    apiKeyEnvRef: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeModel(providerId: string, modelId: string): ProviderModel {
  return {
    id: `${providerId}::${modelId}`,
    providerId,
    modelId,
    displayName: modelId,
    contextLength: null,
    inputCostPerMtok: null,
    outputCostPerMtok: null,
    tier: null,
    supportedParameters: null,
    addedAt: "2026-01-01T00:00:00Z",
  };
}

const subProvider = makeProvider("sub-1", "claude_subscription");
const orProvider = makeProvider("or-1", "openrouter");
const apiProvider = makeProvider("api-1", "anthropic_api_direct");
const codexSubProvider = makeProvider("codex-sub", "codex_subscription");

const MODEL = "claude-sonnet-4-6";

const baseProviders = [subProvider, orProvider, apiProvider];
const baseModels = [
  makeModel("sub-1", MODEL),
  makeModel("or-1", MODEL),
  makeModel("api-1", MODEL),
];

test("subscription beats openrouter and per_token", () => {
  const result = resolveRoute({
    modelName: MODEL,
    harness: "claude_code",
    providers: baseProviders,
    providerModels: baseModels,
    pins: {},
  });
  expect(result).toBe("sub-1");
});

test("openrouter beats per_token when no subscription available", () => {
  const result = resolveRoute({
    modelName: MODEL,
    harness: "claude_code",
    providers: [orProvider, apiProvider],
    providerModels: [makeModel("or-1", MODEL), makeModel("api-1", MODEL)],
    pins: {},
  });
  expect(result).toBe("or-1");
});

test("pin wins over subscription", () => {
  const result = resolveRoute({
    modelName: MODEL,
    harness: "claude_code",
    providers: baseProviders,
    providerModels: baseModels,
    pins: { [MODEL]: "api-1" },
  });
  expect(result).toBe("api-1");
});

test("pin to wrong-harness provider falls through to subscription", () => {
  // codex-sub only supports codex, not claude_code
  const providers = [...baseProviders, codexSubProvider];
  const models = [...baseModels, makeModel("codex-sub", MODEL)];
  const result = resolveRoute({
    modelName: MODEL,
    harness: "claude_code",
    providers,
    providerModels: models,
    pins: { [MODEL]: "codex-sub" },
  });
  // codex-sub doesn't support claude_code, so pin is skipped → falls to sub-1
  expect(result).toBe("sub-1");
});

test("alphabetical tie-break is deterministic for subscription tier", () => {
  const sub2 = makeProvider("aaa-sub", "claude_subscription");
  const providers = [subProvider, sub2];
  const models = [makeModel("sub-1", MODEL), makeModel("aaa-sub", MODEL)];
  const result = resolveRoute({
    modelName: MODEL,
    harness: "claude_code",
    providers,
    providerModels: models,
    pins: {},
  });
  // "aaa-sub" < "sub-1" alphabetically
  expect(result).toBe("aaa-sub");
});

test("returns null when no provider offers the model+harness", () => {
  const result = resolveRoute({
    modelName: "gpt-5.4",
    harness: "claude_code",
    providers: [codexSubProvider],
    providerModels: [makeModel("codex-sub", "gpt-5.4")],
    pins: {},
  });
  // codex_subscription only supports codex, not claude_code
  expect(result).toBeNull();
});

test("returns null when no provider has the model at all", () => {
  const result = resolveRoute({
    modelName: "unknown-model",
    harness: "claude_code",
    providers: baseProviders,
    providerModels: baseModels,
    pins: {},
  });
  expect(result).toBeNull();
});

test("openrouter can serve codex harness as cross-protocol", () => {
  const result = resolveRoute({
    modelName: "claude-sonnet-4-6",
    harness: "codex",
    providers: [orProvider],
    providerModels: [makeModel("or-1", "claude-sonnet-4-6")],
    pins: {},
  });
  // openrouter supports both harnesses
  expect(result).toBe("or-1");
});
