import { test, expect, beforeEach } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import {
  upsertCatalogRow,
  listCatalog,
  getCatalogById,
  findByVendor,
  type CatalogRow,
} from "../src/db/openrouterCatalog";
import type { DB } from "../src/db";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

test("upsertCatalogRow inserts new row", () => {
  upsertCatalogRow(db, {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    contextLength: 128000,
    pricingPrompt: "0.000001",
    pricingCompletion: "0.000001",
    supportedParameters: '["temperature"]',
    description: "Moonshot AI model",
    fetchedAt: 1234567890,
  });
  const all = listCatalog(db);
  expect(all.length).toBe(1);
  expect(all[0].id).toBe("moonshotai/kimi-k2.6");
  expect(all[0].vendor).toBe("moonshotai");
  expect(all[0].name).toBe("Kimi K2.6");
  expect(all[0].contextLength).toBe(128000);
});

test("upsertCatalogRow replaces existing row on duplicate id", () => {
  upsertCatalogRow(db, {
    id: "openai/gpt-5.5",
    name: "GPT 5.5",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  upsertCatalogRow(db, {
    id: "openai/gpt-5.5",
    name: "GPT 5.5 Updated",
    contextLength: 256000,
    pricingPrompt: "0.01",
    pricingCompletion: "0.02",
    supportedParameters: null,
    description: "Updated desc",
    fetchedAt: 2,
  });
  const all = listCatalog(db);
  expect(all.length).toBe(1);
  expect(all[0].name).toBe("GPT 5.5 Updated");
  expect(all[0].contextLength).toBe(256000);
  expect(all[0].description).toBe("Updated desc");
});

test("upsertCatalogRow derives vendor from id prefix", () => {
  upsertCatalogRow(db, {
    id: "anthropic/claude-opus-4-7",
    name: "Claude Opus 4.7",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const row = getCatalogById(db, "anthropic/claude-opus-4-7");
  expect(row).not.toBeNull();
  expect(row!.vendor).toBe("anthropic");
});

test("upsertCatalogRow handles id without slash (vendor becomes empty string)", () => {
  upsertCatalogRow(db, {
    id: "noslash",
    name: "No Slash",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const row = getCatalogById(db, "noslash");
  expect(row!.vendor).toBe("");
});

test("listCatalog returns all rows ordered by id", () => {
  upsertCatalogRow(db, {
    id: "z-ai/glm",
    name: "GLM",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  upsertCatalogRow(db, {
    id: "anthropic/claude",
    name: "Claude",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const all = listCatalog(db);
  expect(all.length).toBe(2);
  expect(all[0].id).toBe("anthropic/claude");
  expect(all[1].id).toBe("z-ai/glm");
});

test("getCatalogById returns matching row", () => {
  upsertCatalogRow(db, {
    id: "openai/gpt-5.5",
    name: "GPT 5.5",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const row = getCatalogById(db, "openai/gpt-5.5");
  expect(row).not.toBeNull();
  expect(row!.id).toBe("openai/gpt-5.5");
});

test("getCatalogById returns null for missing id", () => {
  const row = getCatalogById(db, "nonexistent");
  expect(row).toBeNull();
});

test("findByVendor returns subset", () => {
  upsertCatalogRow(db, {
    id: "anthropic/claude-opus-4-7",
    name: "Opus",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  upsertCatalogRow(db, {
    id: "anthropic/claude-sonnet-4-6",
    name: "Sonnet",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  upsertCatalogRow(db, {
    id: "openai/gpt-5.5",
    name: "GPT 5.5",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const anthropic = findByVendor(db, "anthropic");
  expect(anthropic.length).toBe(2);
  expect(anthropic.map((r) => r.id).sort()).toEqual([
    "anthropic/claude-opus-4-7",
    "anthropic/claude-sonnet-4-6",
  ]);

  const openai = findByVendor(db, "openai");
  expect(openai.length).toBe(1);
  expect(openai[0].id).toBe("openai/gpt-5.5");

  const none = findByVendor(db, "nonexistent");
  expect(none.length).toBe(0);
});
