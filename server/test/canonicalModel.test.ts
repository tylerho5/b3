import { test, expect, beforeEach } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { upsertCatalogRow } from "../src/db/openrouterCatalog";
import { resolveCanonicalId } from "../src/providers/canonicalModel";
import type { DB } from "../src/db";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  upsertCatalogRow(db, {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
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
    id: "z-ai/glm-4.6",
    name: "GLM 4.6",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
});

test("exact match by full id", () => {
  expect(resolveCanonicalId(db, "moonshotai/kimi-k2.6")).toBe(
    "moonshotai/kimi-k2.6",
  );
});

test("suffix exact match", () => {
  expect(resolveCanonicalId(db, "kimi-k2.6")).toBe("moonshotai/kimi-k2.6");
});

test("suffix exact match case-insensitive", () => {
  expect(resolveCanonicalId(db, "KIMI-K2.6")).toBe("moonshotai/kimi-k2.6");
});

test("fuzzy separator normalization", () => {
  expect(resolveCanonicalId(db, "kimi_k2.6")).toBe("moonshotai/kimi-k2.6");
});

test("modifier strip (-latest)", () => {
  expect(resolveCanonicalId(db, "kimi-k2.6-latest")).toBe(
    "moonshotai/kimi-k2.6",
  );
});

test("no match returns null", () => {
  expect(resolveCanonicalId(db, "definitely-not-a-real-model")).toBeNull();
});

test("vendor disambiguation returns deterministic result", () => {
  upsertCatalogRow(db, {
    id: "azure/gpt-5.5",
    name: "GPT 5.5 Azure",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const result = resolveCanonicalId(db, "gpt-5.5");
  expect(result).not.toBeNull();
  // deterministic: same call returns same result
  expect(resolveCanonicalId(db, "gpt-5.5")).toBe(result);
});

test("empty catalog returns null", () => {
  const empty = openDb(":memory:");
  runMigrations(empty);
  expect(resolveCanonicalId(empty, "anything")).toBeNull();
});
