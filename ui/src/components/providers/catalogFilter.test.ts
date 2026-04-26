import { test, expect } from "bun:test";
import {
  DEFAULT_FILTERS,
  filterCatalog,
  sortCatalog,
} from "./catalogFilter";
import type { OpenRouterModel } from "../../types/shared";

const sample: OpenRouterModel[] = [
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Sonnet 4.6",
    context_length: 200000,
    pricing: { prompt: "0.000003", completion: "0.000015" },
    supported_parameters: ["tools", "reasoning"],
    architecture: { input_modalities: ["text", "image"] },
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT 5.5",
    context_length: 128000,
    pricing: { prompt: "0.00001", completion: "0.00003" },
    supported_parameters: ["tools"],
    architecture: { input_modalities: ["text"] },
  },
  {
    id: "z-ai/glm-4-air-free",
    name: "GLM 4 Air (free)",
    context_length: 32000,
    pricing: { prompt: "0", completion: "0" },
    supported_parameters: [],
  },
  {
    id: "deepseek/deepseek-v4",
    name: "DeepSeek v4",
    context_length: 65000,
    pricing: { prompt: "0.00000014", completion: "0.00000028" },
    supported_parameters: [],
  },
];

test("search matches id case-insensitively", () => {
  const out = filterCatalog(sample, { ...DEFAULT_FILTERS, search: "CLAUDE" });
  expect(out.map((m) => m.id)).toEqual(["anthropic/claude-sonnet-4.6"]);
});

test("anthropic-only excludes non-anthropic ids", () => {
  const out = filterCatalog(sample, {
    ...DEFAULT_FILTERS,
    anthropicOnly: true,
  });
  expect(out.map((m) => m.id)).toEqual(["anthropic/claude-sonnet-4.6"]);
});

test("free filter keeps zero-priced rows only", () => {
  const out = filterCatalog(sample, { ...DEFAULT_FILTERS, free: true });
  expect(out.map((m) => m.id)).toEqual(["z-ai/glm-4-air-free"]);
});

test("tools filter keeps rows with tools in supported_parameters", () => {
  const out = filterCatalog(sample, { ...DEFAULT_FILTERS, tools: true });
  expect(out.map((m) => m.id).sort()).toEqual([
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.5",
  ]);
});

test("vision filter keeps rows with image input modality", () => {
  const out = filterCatalog(sample, { ...DEFAULT_FILTERS, vision: true });
  expect(out.map((m) => m.id)).toEqual(["anthropic/claude-sonnet-4.6"]);
});

test("filters compose with AND semantics", () => {
  const out = filterCatalog(sample, {
    ...DEFAULT_FILTERS,
    tools: true,
    anthropicOnly: true,
  });
  expect(out.map((m) => m.id)).toEqual(["anthropic/claude-sonnet-4.6"]);
});

test("sort by name is stable and alphabetical on id", () => {
  const out = sortCatalog(sample, "name");
  expect(out.map((m) => m.id)).toEqual([
    "anthropic/claude-sonnet-4.6",
    "deepseek/deepseek-v4",
    "openai/gpt-5.5",
    "z-ai/glm-4-air-free",
  ]);
});

test("sort by price is ascending on prompt cost", () => {
  const out = sortCatalog(sample, "price");
  expect(out.map((m) => m.id)).toEqual([
    "z-ai/glm-4-air-free",
    "deepseek/deepseek-v4",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.5",
  ]);
});

test("sort by context length is descending", () => {
  const out = sortCatalog(sample, "context");
  expect(out.map((m) => m.id)).toEqual([
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.5",
    "deepseek/deepseek-v4",
    "z-ai/glm-4-air-free",
  ]);
});
