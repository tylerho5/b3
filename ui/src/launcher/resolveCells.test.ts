import { test, expect } from "bun:test";
import { resolveCells } from "./resolveCells";
import type { Harness, Provider, ProviderModel } from "../types/shared";

const ts = "2026-04-25T00:00:00Z";

const anthropicDirect: Provider = {
  id: "p-anth",
  name: "Anthropic",
  kind: "anthropic_api_direct",
  baseUrl: null,
  apiKey: "sk-ant-...",
  apiKeyEnvRef: null,
  createdAt: ts,
  updatedAt: ts,
};

const openrouter: Provider = {
  id: "p-or",
  name: "OpenRouter",
  kind: "openrouter",
  baseUrl: null,
  apiKey: "sk-or-...",
  apiKeyEnvRef: null,
  createdAt: ts,
  updatedAt: ts,
};

const claudeSub: Provider = {
  id: "p-csub",
  name: "Claude Code subscription",
  kind: "claude_subscription",
  baseUrl: null,
  apiKey: null,
  apiKeyEnvRef: null,
  createdAt: ts,
  updatedAt: ts,
};

const openaiDirect: Provider = {
  id: "p-oai",
  name: "OpenAI",
  kind: "openai_api_direct",
  baseUrl: null,
  apiKey: "sk-...",
  apiKeyEnvRef: null,
  createdAt: ts,
  updatedAt: ts,
};

function model(
  providerId: string,
  modelId: string,
  overrides: Partial<ProviderModel> = {},
): ProviderModel {
  return {
    id: `pm-${providerId}-${modelId}`,
    providerId,
    modelId,
    displayName: modelId,
    contextLength: null,
    inputCostPerMtok: null,
    outputCostPerMtok: null,
    tier: null,
    supportedParameters: null,
    addedAt: ts,
    ...overrides,
  };
}

const claudeSonnet = model("p-anth", "claude-sonnet-4.6");
const orAnthSonnet = model("p-or", "anthropic/claude-sonnet-4.6");
const orOaiGpt = model("p-or", "openai/gpt-5.5");
const gpt5 = model("p-oai", "gpt-5.5");

function key(providerId: string, modelId: string) {
  return `${providerId}::${modelId}`;
}

test("emits one cell per (harness, provider, model) for compatible kinds", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["claude_code"]),
    providers: [anthropicDirect],
    providerModels: [claudeSonnet],
    providerSel: new Set([anthropicDirect.id]),
    modelSel: new Set([key(anthropicDirect.id, claudeSonnet.modelId)]),
  });
  expect(cells).toHaveLength(1);
  expect(cells[0]).toMatchObject({
    harness: "claude_code",
    providerId: "p-anth",
    modelId: "claude-sonnet-4.6",
  });
  expect(cells[0].id).toBe("claude_code::p-anth::claude-sonnet-4.6");
  expect(cells[0].warning).toBeUndefined();
});

test("openrouter expands across both harnesses when both selected", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["claude_code", "codex"]),
    providers: [openrouter],
    providerModels: [orAnthSonnet],
    providerSel: new Set([openrouter.id]),
    modelSel: new Set([key(openrouter.id, orAnthSonnet.modelId)]),
  });
  expect(cells.map((c) => c.harness).sort()).toEqual([
    "claude_code",
    "codex",
  ]);
});

test("provider kinds whose harnesses are not selected emit nothing", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["codex"]),
    providers: [anthropicDirect],
    providerModels: [claudeSonnet],
    providerSel: new Set([anthropicDirect.id]),
    modelSel: new Set([key(anthropicDirect.id, claudeSonnet.modelId)]),
  });
  expect(cells).toHaveLength(0);
});

test("unselected providers and models are skipped", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["claude_code"]),
    providers: [anthropicDirect, openrouter],
    providerModels: [claudeSonnet, orAnthSonnet],
    providerSel: new Set([anthropicDirect.id]),
    modelSel: new Set([key(anthropicDirect.id, claudeSonnet.modelId)]),
  });
  expect(cells).toHaveLength(1);
  expect(cells[0].providerId).toBe("p-anth");
});

test("non-anthropic OpenRouter model under claude_code carries a warning", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["claude_code"]),
    providers: [openrouter],
    providerModels: [orOaiGpt],
    providerSel: new Set([openrouter.id]),
    modelSel: new Set([key(openrouter.id, orOaiGpt.modelId)]),
  });
  expect(cells).toHaveLength(1);
  expect(cells[0].warning).toBeDefined();
  expect(cells[0].warning).toMatch(/Claude Code/i);
});

test("anthropic-prefixed OpenRouter model under claude_code has no warning", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["claude_code"]),
    providers: [openrouter],
    providerModels: [orAnthSonnet],
    providerSel: new Set([openrouter.id]),
    modelSel: new Set([key(openrouter.id, orAnthSonnet.modelId)]),
  });
  expect(cells[0].warning).toBeUndefined();
});

test("non-anthropic OpenRouter model under codex has no warning", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["codex"]),
    providers: [openrouter],
    providerModels: [orOaiGpt],
    providerSel: new Set([openrouter.id]),
    modelSel: new Set([key(openrouter.id, orOaiGpt.modelId)]),
  });
  expect(cells[0].warning).toBeUndefined();
});

test("subscription provider with no models emits nothing", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["claude_code"]),
    providers: [claudeSub],
    providerModels: [],
    providerSel: new Set([claudeSub.id]),
    modelSel: new Set(),
  });
  expect(cells).toHaveLength(0);
});

test("empty inputs produce empty output", () => {
  expect(
    resolveCells({
      harnessSel: new Set(),
      providers: [],
      providerModels: [],
      providerSel: new Set(),
      modelSel: new Set(),
    }),
  ).toEqual([]);
});

test("multiple providers and models produce the full cartesian product", () => {
  const cells = resolveCells({
    harnessSel: new Set<Harness>(["claude_code", "codex"]),
    providers: [anthropicDirect, openrouter, openaiDirect],
    providerModels: [claudeSonnet, orAnthSonnet, gpt5],
    providerSel: new Set([
      anthropicDirect.id,
      openrouter.id,
      openaiDirect.id,
    ]),
    modelSel: new Set([
      key(anthropicDirect.id, claudeSonnet.modelId),
      key(openrouter.id, orAnthSonnet.modelId),
      key(openaiDirect.id, gpt5.modelId),
    ]),
  });
  // anthropic_direct × claude_code = 1
  // openrouter × {claude_code, codex} = 2
  // openai_direct × codex = 1
  expect(cells).toHaveLength(4);
  const keys = cells.map((c) => c.id).sort();
  expect(keys).toEqual([
    "claude_code::p-anth::claude-sonnet-4.6",
    "claude_code::p-or::anthropic/claude-sonnet-4.6",
    "codex::p-oai::gpt-5.5",
    "codex::p-or::anthropic/claude-sonnet-4.6",
  ]);
});
